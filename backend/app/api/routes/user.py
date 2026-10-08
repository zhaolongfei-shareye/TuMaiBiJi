import hashlib
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Dict, List
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.private_access import PRIVATE_CATEGORY_NAME, create_unlock_token
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.models.asset import Asset, not_failed
from app.models.category import Category
from app.models.invitation import Invitation
from app.models.job import Job
from app.models.note import Note
from app.models.share import Share
from app.models.user import User
from app.services import quota

logger = logging.getLogger(__name__)

router = APIRouter()

WALLPAPER_PRESETS = [
    "default",
    "gradient-blue",
    "gradient-green",
    "gradient-sunset",
    "gradient-purple",
    "gradient-ocean",
    # 四套莫兰迪里那三枚原来只存本机（站长 10-04 拍「统一」）：加进白名单之后它们的持久化
    # 和雨雾那枚走同一条路，换手机/重装不再丢。旧六个值一个都不能删——存量还得收得下，
    # 否则那 18 个账号里存着 default / gradient-ocean 的人下次 PUT 直接 400。
    "tint-paper",
    "tint-celadon",
    "tint-blush",
]

LANGUAGE_OPTIONS = ["zh", "en"]


class WallpaperRequest(BaseModel):
    wallpaper: str


class LanguageRequest(BaseModel):
    language: str


@router.put("/wallpaper")
async def update_wallpaper(
    req: WallpaperRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if req.wallpaper not in WALLPAPER_PRESETS:
        raise HTTPException(status_code=400, detail="壁纸不存在，请更新小程序后重试")
    user.wallpaper = req.wallpaper
    db.commit()
    return {"wallpaper": user.wallpaper}


@router.get("/wallpaper/options")
async def get_wallpaper_options():
    return {"options": WALLPAPER_PRESETS}


@router.put("/language")
async def update_language(
    req: LanguageRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if req.language not in LANGUAGE_OPTIONS:
        raise HTTPException(status_code=400, detail="暂不支持该语言")
    user.language = req.language
    db.commit()
    return {"language": user.language}


# —— 用户自己的联系邮箱（账号能力之一：换址与清除）——
# 形状校验故意保守：这一格不验证所有权（不发确认邮件，服务端也没有发信能力），
# 它只是"你留给我们、下次你来信时我们对得上你"的一个自报地址。所以只挡明显不合法的写法，
# 不挡"能收信但形状怪"的写法。长度上限跟着 RFC 的 254 与 local-part 64 走，
# 且必须与 models/user.py 那列的 String(254) 一字不差（有一条用例在比模型与迁移）。
_CONTACT_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
CONTACT_EMAIL_MAX = 254
CONTACT_LOCAL_MAX = 64


def _normalize_contact_email(raw: str) -> str:
    """去首尾空白 + 转小写（同一个人在手机上习惯大写、在电脑上全小写，那是同一个地址）。"""
    return (raw or "").strip().lower()


class ContactEmailRequest(BaseModel):
    email: str


@router.get("/contact-email")
async def get_contact_email(user: User = Depends(get_current_user)):
    """只有本人（当前 token 那个 user）读得到；这一格不进任何公开响应。"""
    return {"email": user.contact_email or ""}


@router.put("/contact-email")
@limiter.limit("20/hour")
async def update_contact_email(
    req: ContactEmailRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """换址；传空串就是清除（回到"未填写"）。"""
    email = _normalize_contact_email(req.email)
    if not email:
        user.contact_email = None
        db.commit()
        return {"email": ""}
    if len(email) > CONTACT_EMAIL_MAX:
        raise HTTPException(status_code=400, detail="邮箱太长了，请换一个")
    local = email.split("@", 1)[0]
    if len(local) > CONTACT_LOCAL_MAX:
        raise HTTPException(status_code=400, detail="邮箱格式不对，请检查后重试")
    if not _CONTACT_RE.match(email):
        raise HTTPException(status_code=400, detail="邮箱格式不对，请检查后重试")
    user.contact_email = email
    db.commit()
    return {"email": user.contact_email}


@router.get("/quota")
def get_quota(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """额度这一个口子出全部数字：客户端不硬编码 100 和 10。"""
    return quota.quota_view(user, db)


class UpdateInviterRequest(BaseModel):
    inviter: int


@router.post("/inviter")
@limiter.limit("10/minute")
def update_inviter(
    request: Request,
    req: UpdateInviterRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """热启动时补报邀请人。

    已登录的人从分享卡片进来只走 onShow、不走 onLaunch，登录那条路带不上 inviter，
    所以他写下第一篇笔记时服务端根本不知道有这回事。这个口子就是补那一次。

    认不认由 attribute_inviter 判（自己邀自己、已有归属、名下已有笔记都不认），
    applied 如实回报——前端靠它决定要不要清掉本地那个 inviterId。
    """
    applied = quota.attribute_inviter(user, db, req.inviter)
    return {"applied": applied}


class DeleteAccountRequest(BaseModel):
    # 必须是 true。注销是这条链路上唯一不可逆的动作，别让一个漏了字段的请求就把它执行了。
    confirm: bool


def _hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode()).hexdigest()


class PrivatePasswordRequest(BaseModel):
    password: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


def _ensure_private_category(db: Session, user: User) -> bool:
    """设了私密密码，就该有一格「私密」能放东西——这一条在这里补齐，返回是否新建了。

    锁的判据是分类名（app/core/private_access.py），可界面上从来没有任何一处会凭空造出
    这个分类：原来只能自己去分类管理里手打"私密"两个字，而密码面板设完只回一句"已保存"，
    于是设完密码的人根本不知道去哪儿放私密笔记。补齐放在服务端而不是让客户端顺手建，
    是因为这条属于"上锁这件事的一部分"，换设备、换版本都得成立。

    幂等：这一列没有唯一约束，按"这个用户名下已有那个名字"判，重复调用不会造出第二格。
    """
    exists = (
        db.query(Category)
        .filter(Category.user_id == str(user.id), Category.name == PRIVATE_CATEGORY_NAME)
        .first()
    )
    if exists:
        return False
    max_order = db.query(Category).filter(Category.user_id == str(user.id)).count()
    db.add(Category(user_id=str(user.id), name=PRIVATE_CATEGORY_NAME, sort_order=max_order))
    return True


@router.put("/private-password")
def set_private_password(
    req: PrivatePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.private_password_hash = _hash_pin(req.password)
    _ensure_private_category(db, user)
    db.commit()
    # 换密码会连带作废之前发出去的解锁凭证：凭证里绑着旧摘要的指纹（pk），
    # 校验时按新摘要算，对不上就判"没解锁"。这条不用另存状态，也不会漏。
    return {"ok": True}


@router.get("/private-password")
def get_private_password_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 这条 GET 会补那一格分类，看着别扭但是这里最划算：它是"我的"页每次进、录入页每次
    # 想选私密时都会问的那一句。放这儿，① 已经设过密码的存量账号（包括闸门上线之前
    # 设的）不必手工刷数据就自愈；② 没设过密码的账号走到这里也不会被凭空塞一格分类。
    # 只在真缺那一格时才写一次，平时就是一条 SELECT。
    if user.private_password_hash is not None and _ensure_private_category(db, user):
        db.commit()
    return {"is_set": user.private_password_hash is not None}


@router.post("/private-password/verify")
@limiter.limit("10/minute")
def verify_private_password(
    request: Request,
    req: PrivatePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.private_password_hash is None:
        raise HTTPException(status_code=400, detail="尚未设置私密密码")
    if _hash_pin(req.password) != user.private_password_hash:
        raise HTTPException(status_code=403, detail="密码不正确")
    # 验对了就发一条短命解锁凭证。以前这条接口只回 ok:True，然后客户端在本页内存里
    # 记一个 _privateVerified 就放行——可是服务端从来不要密码：同一个账号的 token
    # 直接打 GET /api/notes/{id} 就能拿到整篇正文，列表里还连着带 summary。
    # 现在正文由那一条凭证决定给不给（见 app/core/private_access.py），
    # 所以"验过密码"这件事必须变成一个服务端认得的东西，而不是界面里的一个布尔值。
    return {"ok": True, "unlock_token": create_unlock_token(user)}


@router.post("/private-password/reset")
def reset_private_password(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 不校验旧密码：能拿到这条接口的前提是 Bearer token 有效，而拿得到 token 的人
    # 本来就能直接删掉整篇笔记——密码只防"手机在别人手里时被人翻开"，不防 token。
    # 重置只清那一列，笔记与分类一个字不动；清完要重新输两遍才再上锁。
    # 清掉这一列同时也作废了手上所有解锁凭证（private_password_hash 为空 → 判未解锁）。
    user.private_password_hash = None
    db.commit()
    return {"ok": True, "is_set": False}


class DeactivateOut(BaseModel):
    """注销的回体。同 `NoteDeleteOut` 那条理由：`file_ids` 是客户端清云端对象的唯一一份清单，
    而注销之后那个身份再问不出任何东西——这一列的名字必须进接口快照，被人改掉要有人报警。"""
    message: str
    deleted: Dict[str, int]
    file_ids: List[str] = []


@router.post("/deactivate", response_model=DeactivateOut)
@limiter.limit("5/minute")
def deactivate_account(
    request: Request,
    req: DeleteAccountRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """自助注销：把这一个用户名下的数据删净，连账号本身一起删。

    用 POST 而不是 DELETE：DELETE 带请求体在 wx.request 里怎么序列化没有保证，
    而这一步的确认标志必须以服务端看得见的形式抵达。

    返回删掉的条数，前端照着这个数告诉用户"删了 N 条笔记"，也方便事后拿同一份
    口径对账。别人名下的数据一条不动（每个查询都带着 user_id）。

    回体里还带 `file_ids`：那批云存储对象这台服务器删不掉（没有云开发凭据），只能靠
    客户端在**这一次响应里**拿到清单去删——注销之后 token 就废了，没有第二个口可以问。
    """
    if not req.confirm:
        raise HTTPException(status_code=400, detail="请先确认注销")

    uid = str(user.id)
    # 配图的对象**要在这里一起删不掉**：这台自建后端没有云开发凭据，只有客户端
    # `wx.cloud.deleteFile` 删得动。所以行删之前先把 fileID 抄出来，跟着回体一起发回去，
    # 前端在 clearSession 之前拿它去清（注销之后再打任何接口都是 401，没有第二次机会）。
    asset_ids = [
        r[0]
        for r in db.query(Asset.object_key).filter(Asset.user_id == uid, not_failed()).all()
    ]
    # 卡片对象与配图并进**同一份** `file_ids`（与 `routes/notes.py:delete_note` 同一条决定：
    # 客户端只读那一个键）。历史行也一起带走——云上那些对象还占着全站配额，
    # 而**这是最后一次有机会**：注销之后没有任何接口能再问出这个人留了哪些图。
    from app.models.note_card import NoteCard

    asset_ids += [
        r[0]
        for r in db.query(NoteCard.object_key).filter(NoteCard.user_id == uid).all()
    ]
    # 名片那四格同理（2.1 起图在云上）：这是最后一次能把地址交回去的机会。
    # 逐行读 JSON 列而不是在 SQL 里筛——`slots` 是一个数组，四格里哪格有图只有解出来才知道。
    from app.models.user_profile import UserProfile

    for (slots,) in db.query(UserProfile.slots).filter(UserProfile.user_id == uid).all():
        for s in (slots or []):
            if s and s.get("file_id"):
                asset_ids.append(s["file_id"])
    deleted = {
        "notes": db.query(Note).filter(Note.user_id == uid).delete(),
        "categories": db.query(Category).filter(Category.user_id == uid).delete(),
        "shares": db.query(Share).filter(Share.user_id == uid).delete(),
        "jobs": db.query(Job).filter(Job.user_id == uid).delete(),
        "assets": db.query(Asset).filter(Asset.user_id == uid).delete(),
        "cards": db.query(NoteCard).filter(NoteCard.user_id == uid).delete(),
        "profile": db.query(UserProfile).filter(UserProfile.user_id == uid).delete(),
    }

    # 防止邀请奖励上限绕过：注销前先把该用户贡献给邀请人的 bonus 扣掉
    # 这样反复注册→写笔记→注销→再注册的循环就无法累积无限奖励
    invite_records = (
        db.query(Invitation)
        .filter(Invitation.invitee_id == user.id)
        .all()
    )
    for record in invite_records:
        inviter = db.get(User, record.inviter_id)
        if inviter is None:
            continue
        if inviter.quota_bonus < record.reward:
            # 正常情况下走不到：除了这里，没有别的地方会减 quota_bonus。真走到了说明
            # 台账和余额已经对不上，宁可不追讨也不能把余额扣成负数（负数会把上限压到
            # BASE_QUOTA 以下，那个人自己的笔记就存不下了）。留一条日志好事后对账。
            logger.error(
                "注销回退邀请奖励时发现余额不足，跳过：inviter=%s bonus=%s 应退=%s invitee=%s",
                inviter.id, inviter.quota_bonus, record.reward, user.id,
            )
            continue
        before = inviter.quota_bonus
        inviter.quota_bonus = before - record.reward
        logger.info(
            "注销时回退邀请奖励：inviter=%s -%d（%d → %d）invitee=%s",
            inviter.id, record.reward, before, inviter.quota_bonus, user.id,
        )

    # 邀请台账两个方向都删：留着被邀请人那条，等于把"谁邀的他"这件事留在一个已注销的
    # 账号之外；留着邀请人那条，奖励来源就查得到。两边都不该在账号消失后还留着。
    db.query(Invitation).filter(
        (Invitation.invitee_id == user.id) | (Invitation.inviter_id == user.id)
    ).delete()
    db.query(User).filter(User.invited_by == user.id).update({User.invited_by: None})
    db.delete(user)
    db.commit()

    # 去重保序，理由同 `routes/notes.py:delete_note`：注销这一份最容易撞重复——
    # 同一张图既在 assets 里又在 note_cards 里（换过模板又换回来）时，两处各列一次。
    return {"message": "账号已注销", "deleted": deleted, "file_ids": list(dict.fromkeys(asset_ids))}
