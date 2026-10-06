import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import UserError
from app.core.private_access import is_private_note, private_category_ids
from app.core.rate_limit import limiter
from app.core.timefmt import UTCDatetime
from app.db.database import get_db
from app.models.asset import Asset, MAX_ASSETS_PER_NOTE, not_failed
from app.models.note import Note
from app.models.share import Share
from app.models.user import User
from app.services.sharing import (
    active_share_by_token,
    active_shares,
    close_shares,
    is_expired,
    public_check_fields,
    snapshot_matches,
    sync_snapshot,
    visible_fields,
)
from app.services.wechat import enforce_text_safety, get_qr_code_image

logger = logging.getLogger(__name__)

router = APIRouter()


class ShareCreateRequest(BaseModel):
    note_id: int
    # 「分享形象」里那个名字，跟着这一次分享上服务器成为公开快照的一部分。
    # 超长是截断而不是 422：昵称不该让"生成分享图"整个失败，客户端本来就限到 16 字。
    author_name: str | None = None


AUTHOR_NAME_MAX = 32


def _author_name(req: "ShareCreateRequest") -> str | None:
    return (req.author_name or "").strip()[:AUTHOR_NAME_MAX] or None


class ShareAsset(BaseModel):
    """公开页只带这一样：一个能画出来的地址。

    id / file_size / user_id 都不从公开口出去——这一页不过登录，回多一个字段就是多一个
    外人可以拿来枚举的东西。
    """
    cloud_url: str


# 公开响应里**不走快照**的那几个字段：它们是在读到 token 的那一刻现查出来的，
# 既不在 SNAPSHOT_COLUMNS（sync_snapshot 不搬），也没进送检清单（图片侧的 imgSecCheck
# 个人主体拿不到，见 docs/平台能力 那条）。
#
# 这个例外必须写成代码里的一个名字，而不是只写在测试里：tests/test_share_snapshot.py
# 那条"快照列 == 对外字段"的不变量拿它做扣，以后谁再往 ShareResponse 上加一列显示字段，
# 要么进 SNAPSHOT_COLUMNS（于是自动被同步和送检管住），要么就得在这里一起登记——
# 逼着下一个人想清楚这一次。
#
# 为什么现查不会漏出收不回来的东西：图绑在 note_id 上，而① 撤回分享是 is_active=False，
# 整页连图一起 404；② 删笔记会同时删掉 shares 和 assets 行。两条下线路径都覆盖图。
LIVE_PUBLIC_FIELDS = {"assets"}


class ShareResponse(BaseModel):
    token: str
    title: str | None
    summary: str | None
    tags: list | None
    key_points: list | None
    key_links: list | None
    source_url: str | None
    author_name: str | None
    # 配图。默认空表：`shares` 那张表上并没有这一列，它是读公开页那一刻现查出来的
    # （见 get_share 那两行），所以 create_share 的回体里它天然是空的。
    assets: list[ShareAsset] = []
    created_at: UTCDatetime

    class Config:
        from_attributes = True


@router.post("/", response_model=ShareResponse)
def create_share(
    req: ShareCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = _owned_note(db, user, req.note_id)
    # 私密笔记不给开分享。这条必须卡在服务端：界面上那枚按钮对私密笔记整个不渲染，
    # 可接口原本是照发的——`POST /api/shares {note_id}` 就能把一篇私密笔记变成
    # 一个匿名可读的公开页，"私密"这句承诺当场作废，而且撤不回来（详情页也进不去）。
    if is_private_note(note, private_category_ids(db, user.id)):
        raise HTTPException(status_code=400, detail="私密笔记不能分享")
    author = _author_name(req)

    # 一条笔记只留一个有效分享：卡片上的码是按 token 生成的，反复点"生成分享图"
    # 再各发一个新 token，等于同一篇笔记散出去好几张互不相干的码，旧的那些还一直有效。
    # 这条不再只是注释——shares 上有个部分唯一索引只允许每篇笔记留一行 is_active=1，
    # 真撞上了走下面那个 IntegrityError 分支。
    existing = next((s for s in active_shares(db, note.id) if not is_expired(s)), None)
    if existing is not None and snapshot_matches(existing, note) and existing.author_name == author:
        # 公开页上的内容和上次送检时一字不差，就不要再打一遍 msgSecCheck。
        # 顺序很关键：先判"要不要检"再做检，反过来这个接口就成了一个刷配额的路径
        # ——每次调用最多 7 个字段 × 分段，而它烧的是我们自己的微信接口额度。
        # 作者名也一起比：它现在同样出现在公开页上，改了名就要重检一次。
        return existing

    # 分享是这条笔记第一次"别人也能看到"的时刻，所以公开出口在这里被过滤，
    # 而不是在抓取/识别那一步——外部原文里出现一个敏感词，不该让笔记存不下来。
    # 作者名一并进这一次送检：它是这次新增的对外可见字段，漏了它就等于开了一条
    # 不经内容安全的公开出口（key_links 当初就是这么漏的）。
    try:
        enforce_text_safety(user.openid, *public_check_fields(note, author))
    except UserError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if existing is not None:
        sync_snapshot(db, note)
        existing.author_name = author
        db.commit()
        db.refresh(existing)
        return existing

    token = secrets.token_urlsafe(16)
    # 库里可能还躺着一张"过期时间到了但标记还开着"的老码（上线之前建的那批）。它扫开
    # 已经是 404，占着的却是"这篇笔记唯一那张开着的码"这个位置，新码建不进来。
    # 所以发新码之前先把它关严——反正它本来就没人看得见。
    for stale in active_shares(db, note.id):
        if is_expired(stale):
            stale.is_active = False
    # 不设 expires_at：这张码是印在海报上的纸，别人一周后扫到也应该能看到那条笔记。
    # 收回来靠用户主动撤（/revoke），不靠一个他自己没同意过的倒计时。
    share = Share(
        user_id=str(user.id),
        note_id=note.id,
        token=token,
        author_name=author,
        **visible_fields(note),
    )
    db.add(share)
    try:
        db.commit()
    except IntegrityError:
        # 两个请求同时进来，各自都没查到已有分享，于是都往下建。索引让后到的那个失败，
        # 这里把它领回先落库的那张码：内容一模一样，只是 token 用对方的。
        # 绝不能在这里重新送检——检的是同一份内容，白烧一遍额度。
        db.rollback()
        raced = next((s for s in active_shares(db, req.note_id) if not is_expired(s)), None)
        if raced is None:
            raise HTTPException(status_code=409, detail="这篇笔记的分享状态刚变过，请再试一次")
        return raced
    db.refresh(share)
    return share


def _owned_note(db: Session, user: User, note_id: int) -> Note:
    note = (
        db.query(Note)
        .filter(Note.id == note_id, Note.user_id == str(user.id))
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在或已删除")
    return note


class ShareStatusResponse(BaseModel):
    active: bool
    token: str | None


@router.get("/status", response_model=ShareStatusResponse)
def get_share_status(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """这篇笔记现在对外还是不对外。详情页拿它决定显示"撤掉分享"还是什么都不显示。

    路径必须注册在 /{token} 之前：FastAPI 按声明顺序匹配，不然 GET /api/shares/status
    会被当成一个 token 来查，回一个莫名其妙的 404。
    """
    note = _owned_note(db, user, note_id)
    live = next((s for s in active_shares(db, note.id) if not is_expired(s)), None)
    return {"active": live is not None, "token": live.token if live else None}


class ShareRevokeRequest(BaseModel):
    note_id: int


@router.post("/revoke")
def revoke_share(
    req: ShareRevokeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """撤掉分享：把这篇笔记名下开着的码全关掉，扫开就是"分享已关闭"。

    关而不删——token 留着，事后还能对账"这张海报当时是谁的哪篇"。
    撤回之后用户再点分享会拿到一张**新码**（旧码不会复活）：他既然说过这篇不公开，
    那已经印出去的那张纸就该一直作废，不能因为后来又分享了一次别的笔记而翻案。
    """
    note = _owned_note(db, user, req.note_id)
    closed = close_shares(db, note.id)
    db.commit()
    return {"closed": closed}




def _get_active_share(token: str, db: Session) -> Share:
    share = active_share_by_token(db, token)
    if share is None:
        raise HTTPException(status_code=404, detail="分享不存在或已过期")
    return share


@router.get("/{token}", response_model=ShareResponse)
def get_share(token: str, db: Session = Depends(get_db)):
    share = _get_active_share(token, db)
    resp = ShareResponse.model_validate(share)
    # 「分享带图」（方案 §3.1.7）：落地页也是小程序页（扫码进 pages/share/view），
    # 所以 cloud:// 这个地址在对面直接画得出来，不需要临时链接。
    #
    # 这里是**现查**而不是快照：图绑在笔记上，快照那几列是文字。两条口径要说明白——
    # ① 撤掉分享（close_shares）之后整页 404，图跟着一起看不见，所以"收回来"这扇门
    #    对图同样有效；② 建分享之后新绑上的图会出现在公开页上，而图片从来没有过
    #    内容安全送检（文字走 msgSecCheck，图片侧的 imgSecCheck 个人主体拿不到）。
    #    这一条记在 docs/产品需求.md，不当已解决。
    resp.assets = _public_assets(db, share.note_id)
    return resp


def _public_assets(db: Session, note_id: int | None) -> list[ShareAsset]:
    if not note_id:
        return []
    rows = (
        db.query(Asset.object_key)
        .filter(Asset.note_id == note_id, not_failed())
        .order_by(Asset.id.asc())
        # 张数上限只认 models/asset.py 那一个 9：绑定时卡它、这里露出的也是它，
        # 两处各写一份迟早变成"库里 12 行、公开页 9 张"。
        .limit(MAX_ASSETS_PER_NOTE)
        .all()
    )
    return [ShareAsset(cloud_url=r[0]) for r in rows]


@router.get("/{token}/qrcode")
@limiter.limit("60/minute")
async def get_share_qrcode(request: Request, token: str, db: Session = Depends(get_db)):
    """这个接口不要登录，所以必须限流。

    真正兜住"反复刷它烧微信接口配额"的是 get_qr_code_image 里那层缓存：同一张码只真打
    一次。限流是外面那道，防的是拿一堆有效 token 轮番刷。次数按真实客户端 IP 分桶——
    现网 uvicorn 带 --proxy-headers、nginx 传了 X-Forwarded-For，这两件都已实测确认。
    60 而不是 20：移动网络出口是共享的（一个基站 IP 后面可能几百人），限太狠会误伤
    只是正常打开卡片的人。
    """
    share = _get_active_share(token, db)

    try:
        image_data = await get_qr_code_image(
            scene=token,
            page="pages/share/view",
        )
    except UserError as e:
        # 面向用户的文案（如"微信接口暂不可用"）可以直接给，但只这一类
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        # 这里面的 errmsg / httpx 异常文本可能带 access_token 或整条含 secret 的 URL，
        # 只能进日志。这个接口不需要登录，detail 会被匿名调用方拿到。
        logger.exception("生成小程序码失败 token=%s: %s: %s", token, type(e).__name__, e)
        raise HTTPException(status_code=502, detail="小程序码生成失败，请稍后重试")

    # 微信 getUnlimitedQRCode 实测返回的是 JPEG（文件头 FF D8 FF E0 …JFIF），这里原先硬编码
    # image/png，声明与实际字节不符。按文件头判定，PNG/JPEG 都能对上。
    media_type = "image/png" if image_data[:4] == b"\x89PNG" else "image/jpeg"
    return Response(content=image_data, media_type=media_type)
