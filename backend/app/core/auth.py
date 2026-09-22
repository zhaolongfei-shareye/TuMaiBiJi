import httpx
import logging
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.models.user import User
from app.services import quota

logger = logging.getLogger(__name__)


def _create_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["sub", "exp", "jti"]},
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token 已过期，请重新登录")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="无效的 Token")


async def _wechat_code2session(code: str) -> dict:
    url = "https://api.weixin.qq.com/sns/jscode2session"
    params = {
        "appid": settings.WECHAT_APP_ID,
        "secret": settings.WECHAT_APP_SECRET,
        "js_code": code,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, params=params)
    # 不 raise_for_status：httpx 的异常文本会带上整条含 AppSecret 的 URL。状态码、响应体
    # 一律只写日志；这个接口的调用方是登录页，给用户的是固定文案。
    if resp.status_code >= 400:
        logger.error("code2session HTTP %s：%s", resp.status_code, resp.text[:200])
        raise HTTPException(status_code=502, detail="微信登录暂不可用，请稍后重试")
    try:
        data = resp.json()
    except ValueError:
        logger.error("code2session 返回非 JSON：%s", resp.text[:200])
        raise HTTPException(status_code=502, detail="微信登录失败，请重新进入小程序")
    if "errcode" in data and data["errcode"] != 0:
        # errcode/errmsg 是排障线索（40029 无效 code、45011 频率限制…），不外泄
        logger.error("code2session failed: %s", data)
        raise HTTPException(status_code=401, detail="微信登录失败，请重新进入小程序")
    if not data.get("openid"):
        logger.error("code2session 响应缺少 openid：%s", str(data)[:200])
        raise HTTPException(status_code=401, detail="微信登录失败，请重新进入小程序")
    return data


def get_current_user(
    authorization: str | None = Header(None, description="Bearer <token>"),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少认证凭证，请重新登录")
    token = authorization.split(" ", 1)[1]
    payload = _decode_token(token)
    user_id = int(payload["sub"])
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在，请重新登录")
    return user


async def login_or_register(code: str, db: Session, inviter: int | None = None) -> tuple[User, str]:
    data = await _wechat_code2session(code)
    openid = data["openid"]

    user = db.query(User).filter(User.openid == openid).first()
    if user:
        pass
    else:
        user = User(openid=openid)
        db.add(user)
        db.commit()
        db.refresh(user)

    # 归因放在拿到 user 之后、发token之前：新老用户都会走到这一行，attribute_inviter
    # 内部自己判"要不要认"（已有归属、名下已有笔记、自己邀自己都不认）。
    if inviter is not None:
        quota.attribute_inviter(user, db, inviter)

    token = _create_token(user.id)
    return user, token
