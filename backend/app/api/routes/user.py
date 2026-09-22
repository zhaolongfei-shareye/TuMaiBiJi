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
        raise HTTPException(status_code=400, detail=f"Invalid wallpaper. Options: {WALLPAPER_PRESETS}")
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
        raise HTTPException(status_code=400, detail=f"Invalid language. Options: {LANGUAGE_OPTIONS}")
    user.language = req.language
    db.commit()
    return {"language": user.language}


@router.get("/quota")
def get_quota(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """额度这一个口子出全部数字：客户端不硬编码 100 和 10。"""
    return quota.quota_view(user, db)


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
    # 邀请台账两个方向都删：留着被邀请人那条，等于把"谁邀的他"这件事留在一个已注销的
    # 账号之外；留着邀请人那条，奖励来源就查得到。两边都不该在账号消失后还留着。
    db.query(Invitation).filter(
        (Invitation.invitee_id == user.id) | (Invitation.inviter_id == user.id)
    ).delete()
    db.query(User).filter(User.invited_by == user.id).update({User.invited_by: None})
    db.delete(user)
    db.commit()

    return {"message": "账号已注销", "deleted": deleted}
