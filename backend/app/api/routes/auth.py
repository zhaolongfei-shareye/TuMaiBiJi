from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import login_or_register
from app.core.rate_limit import limiter
from app.db.database import get_db

router = APIRouter()


class LoginRequest(BaseModel):
    code: str
    # 分享卡片带在路径上的邀请人 id（?inviter=123）。客户端把它存本地、每次登录带上，
    # 服务端只在自己名下认一次：已有归属或已有笔记的账号一律忽略，见 quota.attribute_inviter。
    inviter: int | None = None


class LoginResponse(BaseModel):
    token: str
    user_id: int
    nickname: str | None
    avatar_url: str | None
    language: str
    wallpaper: str


@router.post("/wechat", response_model=LoginResponse)
@limiter.limit("5/minute")
async def wechat_login(request: Request, req: LoginRequest, db: Session = Depends(get_db)):
    user, token = await login_or_register(req.code, db, req.inviter)
    return LoginResponse(
        token=token,
        user_id=user.id,
        nickname=user.nickname,
        avatar_url=user.avatar_url,
        language=user.language,
        wallpaper=user.wallpaper,
    )
