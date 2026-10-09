from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

import logging

from app.api.routes import notes, ingest, auth, categories, shares, user, tasks, poster_templates, assets, cards, profiles, landing, v1_auth, v1_account
from app.core.error_codes import http_exception_handler
from app.core.rate_limit import limiter, rate_limit_exception_handler
from app.core.config import settings

logger = logging.getLogger(__name__)

# 日志装配。uvicorn 只配它自己那四个 logger，root 上一个 handler 都没有，
# 所以 app.* 的记录最后落到 logging.lastResort——那个 handler 级别是 WARNING，
# 写 INFO 等于没写。现网实测：连打 9 次小程序码，journald 里"小程序码回源微信"零条，
# 同一个文件的 ERROR 却查得到。配额这类事实查不到就等于没做，所以在这里补上。
_app_log = logging.getLogger("app")
if not _app_log.handlers:
    _app_handler = logging.StreamHandler()
    _app_handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    _app_log.addHandler(_app_handler)
    _app_log.setLevel(logging.INFO)

app = FastAPI(title="图麦笔记 API", version="0.1.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exception_handler)
# `/v1` 的错误体多带一个稳定 `code`（契约 §六）。这一支是**全局** handler，`/api/*` 也走它，
# 所以"不动旧门"完全靠 `error_codes.attach` 里那一句路径判断——注册与判断分在两处，
# 任何一处被改掉，`tests/test_v1_error_codes.py` 里那条"同状态码在 /api 上不许带 code"就红。
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_middleware(SlowAPIMiddleware)

# 字段名 -> 用户看得懂的叫法。没列进来的走通用文案。
_FIELD_LABELS = {
    "title": "标题",
    "summary": "摘要",
    "content": "正文",
    "original_content": "原文",
    "tags": "标签",
    "key_points": "要点",
    "key_links": "链接",
    "source_url": "链接",
    "name": "分类名",
    "color": "颜色",
    "ids": "分类顺序",
    "inviter": "邀请人",
    "url": "链接",
}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """把 Pydantic 的英文报错数组翻成一句中文。

    不加这个的话 detail 是个 list，前端 `(err.data && err.data.detail)` 拿到数组直接塞进
    errLine，用户看到的是一串 [object Object]。加了长度上限之后，粘贴一篇长文当标题
    就会走到这里——这是正常用户能碰到的路径，不是只有攻击者才会看见的角落。
    原始错误进日志，排查时对得上。
    """
    errors = exc.errors()
    # 只记定位信息，绝不记 input：RequestValidationError 的每一项都自带 `input`，
    # 那是用户提交的原样内容（标题/正文/摘要）。整份打出去等于把私密笔记抄进 journald，
    # 而 journald 没有按用户隔离、也没有随账号注销一起删。
    logger.warning(
        "入参校验失败 path=%s errors=%s",
        request.url.path,
        [
            {
                "loc": [str(p) for p in err.get("loc", ())],
                "type": err.get("type"),
                "ctx": err.get("ctx"),
            }
            for err in errors
        ],
    )

    detail = "提交的内容格式不对，请检查后重试"
    if errors:
        first = errors[0]
        loc = [str(p) for p in first.get("loc", ()) if p not in ("body", "query", "path")]
        label = _FIELD_LABELS.get(loc[-1], loc[-1] if loc else "")
        kind = first.get("type", "")
        limit = (first.get("ctx") or {}).get("max_length")
        if kind == "string_too_long" and limit:
            detail = f"{label}太长了，最多 {limit} 字" if label else f"内容太长了，最多 {limit} 字"
        elif kind == "too_long" and limit:
            detail = f"{label}最多 {limit} 条" if label else f"最多 {limit} 条"
        elif kind in ("string_too_short", "value_error.missing"):
            detail = f"{label}不能为空" if label else "缺少必填内容"
        elif kind in ("int_parsing", "string_parsing", "bool_parsing"):
            detail = f"{label}格式不对" if label else detail
    return JSONResponse(status_code=422, content={"detail": detail})

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
# 卡片模板配方下发。只有 GET——这张表能改画面，写路径留在部署脚本里（见 routes/poster_templates.py）
app.include_router(poster_templates.router, prefix="/api/poster/templates", tags=["poster-templates"])
# 笔记配图：路径写在模块里（跨 /api/notes/{id}/assets 与 /api/user/storage-quota 两个前缀），
# 所以这里不再给 prefix——一个模块两组路径，是为了让"归属校验"和"配额口径"只有一份实现。
app.include_router(assets.router, tags=["assets"])
# 卡片留档那三个口跨两个前缀（/api/notes/{id}/card 与 /api/user/cards），同 assets 那条写法
app.include_router(cards.router, tags=["cards"])
# 名片与外观档位（2.1）：路径也写在模块里（/api/user/profile），与上面两条同一做法
app.include_router(profiles.router, tags=["profiles"])
# 公开落地页：路径写在模块里（/n/{token}），而且**必须留在 /api 之外**——
# Universal Link 要求"链接的域名与路径"和 App 那条 Associated Domains 一致，
# 卡片上印的、微信里传的都是 https://agentsbin.cn/n/<token>，没有 /api 这一段。
app.include_router(landing.router, tags=["landing"])
# 阶段2 跨端身份。`/v1` 是**另一种钥匙**开的一组门：token 里 `sub` 是 `accounts.id`、
# 带 `kind=account`，而 `/api/*` 那批按 `users.id` 发的老钥匙原样保留（现网 7 天有效期的
# token 认的是后者）。两组门并存、互不开对方的房间，判据在 tests/test_v1_auth_and_link.py。
app.include_router(v1_auth.router, prefix="/v1/auth", tags=["v1-auth"])
app.include_router(v1_account.router, prefix="/v1/account", tags=["v1-account"])

@app.get("/")
async def root():
    return {"message": "图麦笔记 API", "version": "0.1.0"}

@app.get("/health")
async def health():
    return {"status": "ok"}
