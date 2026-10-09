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
from app.models.account import Account
from app.models.category import Category
from app.models.user import User
from app.services import deletion, quota

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


def _account_to_take_along(db: Session, user: User) -> str | None:
    """这条 account 名下**只剩他这一行**时才把 account 本身交给 `purge` 带走；否则回 None。

    站长 2026-10-10 拍的甲。之前那一版是无条件传 `user.account_id`，于是小程序点注销会连背后
    那条 account、它名下全部登录方式与短码一起删——同 account 上另一行登录行的归属留在空气里
    （行还在，`account_id` 指着一条已经不存在的 account）。

    今天这一刀**不改变任何现网行为**：现网只读查 `wtsj.db`，"一条 account 名下几行 `users`"的
    分布是 `[(1, 35)]`——35 个人每人一行，多行的 0 条。所以收窄对得上"不动已上线行为"那句话，
    它是赶在阶段3（`/v1` 那侧也往 `users` 写行）之前把边界立起来。

    **例外那一支必须留着**：`account_id` 有值而 `accounts` 里那一行已经不在（半截事务留下的孤儿），
    那时照样把值交出去。这种账里两行可能都指着同一条死 account，按"名下还有别人就不清"走的话，
    占着 openid 的身份行会被留下，而下一次微信登录撞的是 `ensure_for_provider` 那句 RuntimeError
    → 那个人直接登不进去。注销恰好是修这类坏账的那一次，这道闸不能把自愈撤掉——钉在
    `tests/test_v1_account_deletion.py::Test那一格有值而account行没了`。

    回 None 的时候，`purge` 连**他这一条 openid 的身份行**都不摘（那道清理挂在 account 上）。
    于是这个人之后用微信登录，会由 `ensure_for_provider` 找回那条还活着的 account、把新的一行
    挂回去——这正是"两个平台是一个人"的另一半：界面那句提示要说成"注销了小程序这一侧的数据"，
    不能说成"这个微信号从此与这个账号无关"。要不要连带摘掉他这一侧的登录方式，是这一批新长
    出来的一条，他没拍过，记在 docs 那一节的待拍里。
    """
    if user.account_id is None:
        return None
    alive = db.query(Account.id).filter(Account.id == user.account_id).first()
    if alive is None:
        return user.account_id
    others = db.query(User.id).filter(
        User.account_id == user.account_id, User.id != user.id
    ).first()
    return None if others is not None else user.account_id


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

    回体里的 `deleted` 是各表删掉的条数，**只用来事后对账**——现网没人读它（实测：
    `grep -rn "\\.deleted" miniprogram` 是空的，`pages/me/me.js:doDeactivate` 只把整份回体交给
    `cloudUpload.dropFromDeleteRes`，那里取的是 `file_ids`）。界面那句提示是固定文案，
    不是"删了 N 条笔记"。

    回体里还带 `file_ids`：那批云存储对象这台服务器删不掉（没有云开发凭据），只能靠
    客户端在**这一次响应里**拿到清单去删——注销之后 token 就废了，没有第二个口可以问。

    ⚠ 范围（2026-10-10 拍甲之后）：这一路删的是**他这一行 `users` 与他名下的数据**。背后那条
    account 只在"名下只剩这一行"（或那条 account 本来就已经不在、属于要顺手修的那笔坏账）时才
    一起走，判据与它留 None 之后"这个微信号还能落回同一条 account"那一半后果，全写在
    `_account_to_take_along` 的 docstring 里。拍之前这一路是无条件带走整条 account 的。
    """
    if not req.confirm:
        raise HTTPException(status_code=400, detail="请先确认注销")

    # 「删哪七张表、按什么顺序、抄哪些云对象」只在 `services/deletion.py` 说一次；这一路只
    # 决定"删谁"：这一行 `users` 登录行，加上**由上面那道闸判断过**的那条 account（可能为 None）。
    deleted, file_ids = deletion.purge(db, [user], _account_to_take_along(db, user))
    db.commit()
    return {"message": "账号已注销", "deleted": deleted, "file_ids": file_ids}
