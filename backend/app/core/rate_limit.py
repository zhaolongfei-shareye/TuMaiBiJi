from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.REDIS_URL,
    strategy="fixed-window",
)


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


user_limiter = Limiter(
    key_func=get_user_key,
    storage_uri=settings.REDIS_URL,
    strategy="fixed-window",
)


def rate_limit_exception_handler(request, exc):
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=429,
        content={"detail": "请求过于频繁，请稍后再试"},
    )
