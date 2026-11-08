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
    # 只收 `kty=RSA`：下面 `RSAAlgorithm.from_jwk` 拿到别种（EC / oct / 缺 n 的残件）会冒
    # `InvalidKeyError` 或 `ValueError`，而那两个都不是 `InvalidTokenError` 的子类——不在这儿筛掉，
    # 端到端实测是 **HTTP 500**。10-09 独立审就是打在这一点上：那句 docstring 写"只抛 401/502"
    # 当时是假话。筛掉之后，一枚不认识的 kid 走的是上面那条"强刷一次再判"的路，最终 401。
    by_kid = {k["kid"]: k for k in keys
              if isinstance(k, dict) and k.get("kid") and k.get("kty") == "RSA"}
    _cache, _cache_until = by_kid, now + JWKS_TTL_SECONDS
    return by_kid


def reset_jwks_cache() -> None:
    """测试用：把缓存清零，免得上一用例塞进去的假密钥漏到下一用例。"""
    global _cache, _cache_until
    _cache, _cache_until = None, 0.0


def _verified_aud(identity_token: str, public_key) -> str:
    """把这张票里的 `aud` 读出来**只为写进日志**——签名照验，只是不比 aud。

    只在下面那一支 `InvalidAudienceError` 里调用，所以"读出来的东西"一定是 Apple 真签过的，
    不存在"拿没验过签的字符串当结论"那一步。`iss` 在这里**手工**比那一句而不是传
    `issuer=APPLE_ISSUER`：除了"这一格只有一个出处"这句口径，还有一条工具层的理由——
    `probes/反向验证-阶段2-2.sh` 的 E 刀是按 `issuer=APPLE_ISSUER,` 那一行做突变的，
    两处都写它，那一刀就会撤在排障这一支上、真防线一个字没动，判据照样绿（10-10 真踩过）。
    返回值过一道 `repr`：日志里最坏的一种污染是一枚换行——`\n` 之后那半行会被当成一条全新的
    日志（审计实测能往 wtsj-api 的输出里伪造出 `… INFO 校验通过 sub=fake-sub`），`repr` 顺手把
    `\\x00`／`\\x1b` 也变成可见字符。走到这一支的串是 Apple 真签过的（bundle id 那种形状，今天
    带不进换行），所以这条是**纵深防御**，不是在补一个可利用漏洞。上限 128 字符；值不从接口回读。
    """
    try:
        claims = jwt.decode(
            identity_token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except (jwt.InvalidTokenError, jwt.InvalidKeyError, ValueError):
        return "<读不出>"
    if "iss" not in claims:
        return "<缺 iss>"
    if claims["iss"] != APPLE_ISSUER:
        return "<非 appleid>"
    return repr(claims.get("aud"))[:128]


async def verify_identity_token(identity_token: str) -> str:
    """验完返回 `sub`（Apple 那个 user identifier）。任何一环不对都抛，且只抛 401/502/503。

    三样各对应客户端一种动作：401 去重新登录、502 原样重试、503 这一路没开（配置问题，重试无用）。

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
    except jwt.InvalidAudienceError:
        # 单拆这一支只为排障：它的意思是"这张票 Apple 是真签的，但给**别家**签的"。
        # 这一支恰好是 #178 那一格填错时唯一会出现的形状——不记下观察到的那一个，填错的人
        # 下一轮还是在猜，而填错值的症状是每次登录 401，比没填时的 503 难查得多
        # （503 至少把原因写在日志里）。期望值与观察值都只进日志、不进回体：那是 bundle id，
        # 本来就打在客户端包里，不是密钥。
        logger.warning("Apple identityToken 的 aud 对不上：观察到 %s，期望 %s",
                       _verified_aud(identity_token, public_key), settings.APPLE_CLIENT_ID)
        raise HTTPException(status_code=401, detail="苹果登录凭证无效，请重新登录")
    except (jwt.InvalidTokenError, jwt.InvalidKeyError, ValueError) as exc:
        # 三层分开看：`InvalidTokenError` 是签名/claim 不对（这张 token 不是 Apple 给我们签的）；
        # `InvalidKeyError` 与 `ValueError` 是这一枚 JWK 我根本没法拿来验 RSA 签名（n/e 残缺、
        # 形状不对）。上面已经按 `kty=RSA` 筛过一道，这里是第二道：少收一类就是端到端 HTTP 500。
        # 不把 exc 的文本回给客户端：PyJWT 的报错会带上 audience/issuer 的**期望值**，
        # 回体里一个字都不该有（`test_验签出错不许把期望值回显给用户` 钉的就是这一句）。
        # 而日志里只留类名**不够**——aud 那一支单独走上面那条，别的失败形状不值得多解一次签。
        logger.warning("Apple identityToken 校验未通过：%s", type(exc).__name__)
        raise HTTPException(status_code=401, detail="苹果登录凭证无效，请重新登录")
    return claims["sub"]
