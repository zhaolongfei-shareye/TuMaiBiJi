from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings


def get_user_key(request):
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            import jwt
            token = auth_header.split(" ", 1)[1]
            payload = jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM],
                options={"verify_exp": False},
            )
            return f"user:{payload['sub']}"
        except Exception:
            pass
    return f"ip:{get_remote_address(request)}"


def get_ip_key(request):
    """**只看来源，不看 Authorization**。登录／换票这一类口防的是"同一台机器反复试"，
    而 `get_user_key` 那把在票签名有效时会换成 `user:<sub>` 分桶（还带 `verify_exp=False`，
    过期票也算有效）。挂在那类口上就等于：谁手里有一把有效票，谁就能给同一台机器换一条额度。
    所以这一枚显式不吃票，`get_remote_address` 读的是 uvicorn `--proxy-headers` 之后的对端
    （nginx 传 `X-Forwarded-For` 那两枚实测过，见 `routes/shares.py` 里那段）。
    """
    return get_remote_address(request)


limiter = Limiter(
    key_func=get_user_key,
    storage_uri=settings.REDIS_URL,
    strategy="fixed-window",
)


def rate_limit_exception_handler(request, exc):
    from fastapi.responses import JSONResponse

    from app.core.error_codes import attach, route_path

    path = route_path(request)
    if path.startswith("/api/roammark/"):
        # RoamMark 那一路是英文界面、且**按 code 分支**（口径写在 `app/api/routes/roammark.py` 顶上
        # 第 12-16 行："这一组回英文 detail ＋稳定 code"）。以前这一发是整条路上唯一两句例外：
        # 我们的 `_fail()` 都按契约回，而限流器那一支回中文且没 code ⇒ 客户端只能落进
        # "形状不对"那句兜底（10-25 审计 B2）。
        # ⚠ 分支写在 handler 里，不写进 `attach()`：`tests/test_v1_error_codes.py` 逐格钉的是
        # "`/api/*` 回体一个字都不许多"，而现网小程序读的全是 `/api/*`——`attach()` 那句不动旧门
        # 的承诺被那把尺子钉死了，这里加一支前置分支才既不碰旧门、又让这一路拿到 code。
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests right now. Wait a minute and try again.",
                     "code": "rate_limited"},
        )
    # 这一发只有 `/v1` 那一路会多带一个 `code`（`app/core/error_codes.py` 里那句路径判断，
    # 以及它为什么读 `route_path` 而不是 `request.url.path`）。现网小程序读的是 `/api/*`，
    # 回体一个字都不许变。
    return JSONResponse(
        status_code=429,
        content=attach(path, 429, {"detail": "请求过于频繁，请稍后再试"}),
    )
