"""验 Apple 给的那张 `identityToken`。

为什么这段单独一个文件而不是塞在路由里：它是整个跨端身份里**唯一**一处"信错了就等于
把别人的账号交出来"的地方，也是唯一一段需要拿真 RSA 密钥来钉的判据。契约 §二 要它验三样
（`iss`、`aud`、签名），Apple 的 `verifying-a-user` 文档还要 `exp` 和 `sub`。这里一样都不省。

签名算法钉死 `RS256`：10-09 现读 `https://appleid.apple.com/auth/keys` 回的是
`kty=RSA / alg=RS256`（Apple 文档正文那句"JWS E521/…E256"与自家密钥端点对不上，以端点为准）。
`algorithms=[...]` 这一句同时挡住了经典的 alg 混淆攻击——不写它，一把公钥就能被当成 HMAC 的
secret 用，攻击者拿公钥自己签一张就登进来了。
"""
import json
import logging
import time

import httpx
import jwt
from fastapi import HTTPException
from jwt.algorithms import RSAAlgorithm

from app.core.config import settings

logger = logging.getLogger(__name__)

APPLE_ISSUER = "https://appleid.apple.com"
JWKS_URL = f"{APPLE_ISSUER}/auth/keys"
# Apple 的密钥不常换，但换的时候是**提前**挂上去的（新旧并存），所以 5 分钟的缓存既压住了
# 每次登录一趟网络，又不会在一次轮换之后把所有人都挡在门外。
JWKS_TTL_SECONDS = 300.0

_cache: dict[str, dict] | None = None
_cache_until = 0.0


async def _http_jwks() -> dict:
    """这个模块唯一的对外网络出口。测试换掉它，但不换验签本身。"""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(JWKS_URL)
    resp.raise_for_status()
    return resp.json()


async def _jwks_by_kid(force_refresh: bool = False) -> dict[str, dict]:
    """按 `kid` 索引的 Apple 公钥。取不到 Apple 的密钥是**服务侧故障**，不是谁的凭证有问题。

    和下面那条"这张 token 不是 Apple 签的"分得很开：401 让客户端去重新登录，502 让客户端
    原样重试。混成一个的话，Apple 那次轮换期间所有人会被判成"凭证无效"而登出，
    而重登只会拿到同一张验不过的 token。
    """
    global _cache, _cache_until
    now = time.monotonic()
    if _cache is not None and not force_refresh and now < _cache_until:
        return _cache
    try:
        payload = await _http_jwks()
    except (httpx.HTTPError, ValueError) as exc:
        # ValueError 接住的是"响应不是 JSON"：Apple 那边被网关吃掉时回的是 HTML
        logger.error("拉 Apple JWKS 失败：%s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="暂时无法向苹果核验身份，请稍后重试")
    keys = payload.get("keys") if isinstance(payload, dict) else None
    if not isinstance(keys, list):
        logger.error("Apple JWKS 形状不对：%s", str(payload)[:200])
        raise HTTPException(status_code=502, detail="暂时无法向苹果核验身份，请稍后重试")
    by_kid = {k["kid"]: k for k in keys if isinstance(k, dict) and "kid" in k}
    _cache, _cache_until = by_kid, now + JWKS_TTL_SECONDS
    return by_kid


def reset_jwks_cache() -> None:
    """测试用：把缓存清零，免得上一用例塞进去的假密钥漏到下一用例。"""
    global _cache, _cache_until
    _cache, _cache_until = None, 0.0


async def verify_identity_token(identity_token: str) -> str:
    """验完返回 `sub`（Apple 那个 user identifier）。任何一环不对都抛，且只抛 401/502。

    返回值只有 `sub`：这张 token 里还有邮箱、姓名，调用方**不许**顺手把它们一起带出去——
    邮箱可能是 Apple 的隐私转发地址，姓名可能是用户没填的占位。真要存，走 Apple 那一路
    只在**首次授权**的 `authorization` 负载里给一次，那是另一件事。
    """
    if not settings.APPLE_CLIENT_ID:
        # 配置没填的时候**绝不**退化成"不验 aud"。`aud` 是"这张 token 是给我们家签的"
        # 那句话：别的 App 拿着 Apple 给它的 token 也能通过签名校验（同一批 Apple 公钥），
        # 不验 aud 就等于允许别的 App 的凭证登进我们的账号表。
        logger.error("APPLE_CLIENT_ID 未配置：/v1/auth/apple 拒绝服务")
        raise HTTPException(status_code=503, detail="苹果登录暂未开放，请联系开发者")
    try:
        header = jwt.get_unverified_header(identity_token)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="苹果登录凭证无效，请重新登录")
    kid = header.get("kid")
    by_kid = await _jwks_by_kid()
    jwk = by_kid.get(kid)
    if jwk is None:
        # 可能正好赶上 Apple 换密钥：强刷一次再判。第二次还是没有才是真的不认识这张 token。
        by_kid = await _jwks_by_kid(force_refresh=True)
        jwk = by_kid.get(kid)
    if jwk is None:
        raise HTTPException(status_code=401, detail="苹果登录凭证无效，请重新登录")
    try:
        public_key = RSAAlgorithm.from_jwk(json.dumps(jwk))
        claims = jwt.decode(
            identity_token,
            public_key,
            algorithms=["RS256"],
            audience=settings.APPLE_CLIENT_ID,
            issuer=APPLE_ISSUER,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.InvalidTokenError as exc:
        # 不把 exc 的文本回给客户端：PyJWT 的报错会带上 audience/issuer 的**期望值**，
        # 那是我们自己的 Service ID。日志里留类名足够排障。
        logger.warning("Apple identityToken 校验未通过：%s", type(exc).__name__)
        raise HTTPException(status_code=401, detail="苹果登录凭证无效，请重新登录")
    return claims["sub"]
