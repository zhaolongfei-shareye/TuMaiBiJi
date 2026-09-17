from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import login_or_register
from app.db.database import get_db

router = APIRouter()


class LoginRequest(BaseModel):
    code: str


class LoginResponse(BaseModel):
    token: str
    user_id: int
    nickname: str | None
    avatar_url: str | None
    language: str
    wallpaper: str


@router.post("/wechat", response_model=LoginResponse)
async def wechat_login(req: LoginRequest, db: Session = Depends(get_db)):
    user, token = await login_or_register(req.code, db)
    return LoginResponse(
        token=token,
        user_id=user.id,
        nickname=user.nickname,
        avatar_url=user.avatar_url,
        language=user.language,
        wallpaper=user.wallpaper,
    )
