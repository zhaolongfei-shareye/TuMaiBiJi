import httpx
import logging
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Header
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.models.account import Account
from app.models.user import User
from app.services import accounts, quota

logger = logging.getLogger(__name__)


def _sign(subject: str, generation: int, extra: dict | None = None) -> str:
    payload = {
        "sub": subject,
        "gen": generation,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
        "jti": str(uuid.uuid4()),
    }
    payload.update(extra or {})
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _create_token(user_id: int, generation: int = 1) -> str:
    """小程序那条老登录态：`sub` 是 `users.id`。现网客户端认的就是这一种，别动它的形状。"""
    return _sign(str(user_id), generation)


def _create_account_token(account: Account) -> str:
    """`/v1` 的登录态：`sub` 是 `accounts.id`，并明确带上 `kind=account`。

    为什么要写一个 `kind` 而不是靠"能不能转成整数"来分：两种 token 用的是**同一把**签名密钥，
    一把 UUID 的钥匙自然过不了 `int()`，但那是靠撞类型撞出来的拒绝，出错时是 500 而不是 401，
    而且哪天 `sub` 的形状变了这层区分就静默没了。`kind` 是把"这把钥匙开哪扇门"写在钥匙上。
    """
    return _sign(account.id, account.generation, {"kind": "account"})


def _decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["sub", "exp", "jti"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token 已过期，请重新登录")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="无效的 Token")
    # 解锁凭证（app/core/private_access.py）和登录 token 用同一个签名密钥，区别只在
    # 多带了一个 scope。这里不认 scope，那条 15 分钟的凭证就同时是一把全账号的钥匙——
    # 拿着它能删笔记、改密码、注销，而它存在的意义恰恰是"只买这几分钟看私密正文"。
    # 只拒"带 scope 的"，不要求登录 token 必须有 scope：现网那批老登录 token 没有这个字段，
    # 反过来判等于把所有人当场踢下线。
    if payload.get("scope") is not None:
        raise HTTPException(status_code=401, detail="无效的 Token")
    return payload


def _bearer_payload(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少认证凭证，请重新登录")
    return _decode_token(authorization.split(" ", 1)[1])



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
    payload = _bearer_payload(authorization)
    # `/v1` 那把 UUID 的钥匙开不了 `/api/*` 这扇门。不拦的话下面那句 `int()` 当场 ValueError，
    # 客户端收到的是 500——而 500 和 401 在两端处理上完全不是一回事：401 会去重新登录，
    # 500 只会重试同一把坏钥匙。
    if payload.get("kind") == "account":
        raise HTTPException(status_code=401, detail="这把凭证开不了这一路，请重新登录")
    try:
        user_id = int(payload["sub"])
    except ValueError:
        raise HTTPException(status_code=401, detail="无效的 Token")
    token_gen = payload.get("gen", 1)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在，请重新登录")
    if user.generation != token_gen:
        raise HTTPException(status_code=401, detail="Token 已失效，请重新登录")
    return user


def get_current_account(
    authorization: str | None = Header(None, description="Bearer <token>"),
    db: Session = Depends(get_db),
) -> Account:
    """`/v1` 那一路的"人"。只有 Apple 身份的人在这里是完整的一张照片：他有 `accounts` 行、
    有 `account_identities(apple)` 行，**没有 `users` 行**（站长 10-09 拍的乙）。

    只认 `kind=account`、且**不会**退回去替他找一个 `users` 行：一旦这里做了 account→user
    的翻译，"没有微信的人就进不了业务表"这件事会从结构问题变成看不见的运行时问题，
    而那正是乙要避免的——需要 `users` 行的口本来就不该对只有 Apple 身份的人开放，
    该在门口说清楚，而不是在深处悄悄造一个。
    """
    payload = _bearer_payload(authorization)
    if payload.get("kind") != "account":
        raise HTTPException(status_code=401, detail="这不是这一路要的凭证，请重新登录")
    account = db.query(Account).filter(Account.id == payload["sub"]).first()
    if not account:
        raise HTTPException(status_code=401, detail="账号不存在，请重新登录")
    if account.generation != payload.get("gen", 1):
        raise HTTPException(status_code=401, detail="Token 已失效，请重新登录")
    return account



async def login_or_register(code: str, db: Session, inviter: int | None = None) -> tuple[User, str]:
    data = await _wechat_code2session(code)
    openid = data["openid"]

    user = db.query(User).filter(User.openid == openid).first()
    if user:
        pass
    else:
        # 新账号的 generation 取全表最大值 +1。用全表而不是"这个 id 上一代是多少"，
        # 是因为旧行已经被删掉了、查不到；全表严格递增同样能保证复用 id 时新旧不撞。
        max_gen = db.query(func.coalesce(func.max(User.generation), 0)).scalar() or 0
        user = User(openid=openid, generation=max_gen + 1)
        db.add(user)
        db.commit()
        db.refresh(user)

    # 每个人先有一行 account 再谈别的。迁移只回填它当时看得见的那些行，而这一句让
    # "每个用户都有 account"在迁移之后仍然成立（`ensure_for_user` 幂等，已有就原样返回）。
    accounts.ensure_for_user(db, user)

    # 归因放在拿到 user 之后、发token之前：新老用户都会走到这一行，attribute_inviter
    # 内部自己判"要不要认"（已有归属、名下已有笔记、自己邀自己都不认）。
    if inviter is not None:
        quota.attribute_inviter(user, db, inviter)

    token = _create_token(user.id, user.generation)
    return user, token
