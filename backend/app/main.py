from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.routes import notes, ingest, auth, categories, shares, user, tasks
from app.core.rate_limit import limiter, rate_limit_exception_handler
from app.core.config import settings

app = FastAPI(title="图麦笔记 API", version="0.1.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exception_handler)
app.add_middleware(SlowAPIMiddleware)

_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(shares.router, prefix="/api/shares", tags=["shares"])
app.include_router(ingest.router, prefix="/api/ingest", tags=["ingest"])
app.include_router(user.router, prefix="/api/user", tags=["user"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])

@app.get("/")
async def root():
    return {"message": "图麦笔记 API", "version": "0.1.0"}

@app.get("/health")
async def health():
    return {"status": "ok"}
