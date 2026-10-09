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


limiter = Limiter(
    key_func=get_user_key,
    storage_uri=settings.REDIS_URL,
    strategy="fixed-window",
)


def rate_limit_exception_handler(request, exc):
    from fastapi.responses import JSONResponse

    from app.core.error_codes import attach, route_path

    # 这一发只有 `/v1` 那一路会多带一个 `code`（`app/core/error_codes.py` 里那句路径判断，
    # 以及它为什么读 `route_path` 而不是 `request.url.path`）。现网小程序读的是 `/api/*`，
    # 回体一个字都不许变。
    return JSONResponse(
        status_code=429,
        content=attach(route_path(request), 429, {"detail": "请求过于频繁，请稍后再试"}),
    )
