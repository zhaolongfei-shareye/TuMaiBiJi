import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.models.asset import Asset
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


@router.post("/deactivate")
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
    """
    if not req.confirm:
        raise HTTPException(status_code=400, detail="请先确认注销")

    uid = str(user.id)
    deleted = {
        "notes": db.query(Note).filter(Note.user_id == uid).delete(),
        "categories": db.query(Category).filter(Category.user_id == uid).delete(),
        "shares": db.query(Share).filter(Share.user_id == uid).delete(),
        "jobs": db.query(Job).filter(Job.user_id == uid).delete(),
        "assets": db.query(Asset).filter(Asset.user_id == uid).delete(),
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

    return {"message": "账号已注销", "deleted": deleted}
