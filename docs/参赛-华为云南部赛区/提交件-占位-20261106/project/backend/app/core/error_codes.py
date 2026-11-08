"""`/v1` 错误体里那个稳定 `code`——契约 §六"只加字段不改语义"那一格的落点（#171）。

为什么只盖 `/v1`：`/api/*` 那批回体是现网小程序正在读的，给它们加字段属于已上线行为的变更，
而契约 §六 开头写的就是"现有 `/api/...` 全部保留不动"。这一支函数判的是**路径**，不是异常类型。

**为什么 400／405／422／502／503 明确不带 code**（站长 2026-10-10 的口径："没核实过的名字不许写进契约"）：
这些类今天没有任何一端在读它们的 code，名字不是我量出来的、是我编的。所以这一版把它们留在
"按 HTTP 状态码 ＋ 那句中文 `detail` 处理"，哪天 iPhone 真要判某一类 400，两边先改契约、再改这里。

**这张表只有四格，而不是契约 §六 那九个名字全放进去**：`unauthorized`／`not_found`／
`conflict`／`rate_limited` 这四格是**状态码唯一对应**的，其余五格今天放不进来——
- `forbidden`、`quota_reached`、`text_blocked` 三格都可能落在 403 上，**状态码翻不出这三选一**。
  把 403 默认翻成 `forbidden`，等于给将来那两格埋一个会被静默叫错的默认值；正确做法是等那三条路
  真落地时由**抛错那一处**带上名字。今天 `/v1` 一条 403 都发不出来：现读 `/v1` 那一路的四个抛错处
  （`routes/v1_account.py`、`core/auth.py`、`services/linking.py` 那支 `LinkRefused` 自带 status、
  `core/apple_identity.py`），加上校验层 422、限流层 429、以及路由表自己会发的 **405**，
  里面没有 403；全仓唯一一处 `status_code=403` 是 `POST /api/user/private-password/verify`
  （私密密码不对），走 `/api`。**这句话由 `tests/test_v1_error_codes.py` 里那条源码扫描钉着**——
  `LinkRefused(msg, 403)` 写进去的那天它会红，红的时候该改的是这段说明与"由抛错处报名字"那条做法，
  不是把 403 塞进这张表。
- `too_large`(413) 与 `upgrade_required` 挂在还没建的 `/v1/sync/*` 与 `/v1/app/config` 上。
  空着不写不等于忘掉：那一批接口落地时必须回头补这张表，契约里那一条我照原样留着。

**上面那份"发得出来的状态码"是 10-10 现读＋实跑的名单，不是穷举承诺**：405 这一格是第一版漏的
（审查抓的，同批还抓出 503 也漏过一次），实跑 `POST /v1/account` 就是 405。名单的作用只有两条：
说清"表里这四格有名字、其余一律没有"，以及给源码扫描当靶子。

`detail`、HTTP 状态、响应头都不动；body 的**存在性**照 FastAPI 被替换那支默认 handler 的规矩
（204/205/304 与 1xx 不给 body，见下面 `http_exception_handler` 里那段注释）。这一批改的只有"多一个键"。
"""
from fastapi import Request
from fastapi.exceptions import HTTPException
from fastapi.responses import JSONResponse
from fastapi.utils import is_body_allowed_for_status_code
from starlette.responses import Response
from starlette.routing import get_route_path

# 只有这四格是"状态码唯一对应"的（理由见上面那段 403 的话）。
CODE_BY_STATUS = {
    401: "unauthorized",
    404: "not_found",
    409: "conflict",
    429: "rate_limited",
}


def is_v1_path(path: str) -> bool:
    """`/v1` 自己那一截：正好 `/v1` 或 `/v1/…`。

    写成 `path.startswith("/v1")` 会把 `/v1x/account` 也认成这一路（10-10 审查实跑：那种路由表外的
    路径回的是 `{"detail": "Not Found", "code": "not_found"}`——一个 `/api` 那侧都不该看到的键）。
    """
    return path == "/v1" or path.startswith("/v1/")


def route_path(request) -> str:
    """这条请求**归路由管的**那一段路径。

    不用 `request.url.path` 而用 `get_route_path(request.scope)`：后者会把 `root_path` 剥掉。
    今天 nginx 是 `proxy_pass http://127.0.0.1:8000/;`，前台已经把 `/wtsj` 剥了，两种写法答案一样；
    但 #161 那两条 location 的修法里带着"按 forwarded-prefix 一起修"这一支——真给 uvicorn 配上
    `--root-path=/wtsj` 的话 `request.url.path` 就成了 `/wtsj/v1/...`，那句路径判断**静默失效**：
    iPhone 拿不到 `code`，而 `/api` 一个字没变、现网零症状。10-10 审查就是扎在这一面上。
    """
    return get_route_path(request.scope)


def attach(path: str, status_code: int, content: dict) -> dict:
    """给 `/v1` 那一路的错误回体加一个 `code`；其余一律原样返回。

    判的是**路径**而不是异常类型：`/api/*` 与 `/v1/*` 共用这一支全局 handler（FastAPI 的
    handler 注册是全局的），所以"不动旧门"这句话必须由这一行的路径判断来兑现。
    """
    if not is_v1_path(path):
        return content
    code = CODE_BY_STATUS.get(status_code)
    if code is None:
        return content
    return {**content, "code": code}


async def http_exception_handler(request: Request, exc: HTTPException):
    headers = getattr(exc, "headers", None)
    if not is_body_allowed_for_status_code(exc.status_code):
        # 这三行是照搬被我们**替换掉**的那支默认 handler（`fastapi/exception_handlers.py`）。
        # `add_exception_handler(StarletteHTTPException, …)` 是替换不是追加，少了它就等于把
        # "204/205/304 与 1xx 按 HTTP 语义不许有 body"一起换掉了——`/api` 同样受影响（今天全仓
        # 没有 204/304 的抛错处，所以是潜伏，10-10 审查实跑 `/api/probe-204` 看到的正是这个）。
        return Response(status_code=exc.status_code, headers=headers)
    return JSONResponse(
        status_code=exc.status_code,
        content=attach(route_path(request), exc.status_code, {"detail": exc.detail}),
        headers=headers,
    )
