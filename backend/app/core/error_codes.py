"""`/v1` 错误体里那个稳定 `code`——契约 §六"只加字段不改语义"那一格的落点（#171）。

为什么只盖 `/v1`：`/api/*` 那批回体是现网小程序正在读的，给它们加字段属于已上线行为的变更，
而契约 §六 开头写的就是"现有 `/api/...` 全部保留不动"。这一支函数判的是路径，不是异常类型。

**为什么 400／422／502／503 明确不带 code**（站长 2026-10-10 的口径："没核实过的名字不许写进契约"）：
这四类今天没有任何一端在读它们的 code，名字不是我量出来的、是我编的。所以这一版把它们留在
"按 HTTP 状态码 ＋ 那句中文 `detail` 处理"，哪天 iPhone 真要判某一类 400，两边先改契约、再改这里。

**为什么这张表只有四格**，不是契约 §六 那九个名字全放进去：`unauthorized`／`not_found`／
`conflict`／`rate_limited` 这四格是**状态码唯一对应**的，而其余五格今天放不进来——
- `forbidden`、`quota_reached`、`text_blocked` 三格都可能落在 403 上，**状态码翻不出这三选一**。
  把 403 默认翻成 `forbidden`，等于给将来那两格埋一个会被静默叫错的默认值；正确做法是等那两条路
  真落地时由**抛错那一处**带上名字。今天 `/v1` 一条 403 都发不出来——现读 `/v1` 那一路的四个抛错处
  （`routes/v1_account.py`、`core/auth.py`、`services/linking.py`、`core/apple_identity.py`）
  发得出来的是 400／401／404／409／500／502／503，外面再加校验层的 422 与限流层的 429；
  全仓那**唯一一处** 403 是 `POST /api/user/private-password/verify`（私密密码不对，
  `routes/user.py:verify_private_password`），走的是 `/api` 那一路，不在这张表的范围内。
- `too_large`(413) 与 `upgrade_required` 挂在还没建的 `/v1/sync/*` 与 `/v1/app/config` 上。
  空着不写不等于忘掉：那一批接口落地时必须回头补这张表，契约里那一条我照原样留着。

`detail` 一句都不改（中文原样、HTTP 状态原样、响应头原样）——这一批改的只有"多一个键"。
"""
from fastapi import Request
from fastapi.exceptions import HTTPException
from fastapi.responses import JSONResponse

# 只有这四格是"状态码唯一对应"的（理由见上面那段 403 的话）。
CODE_BY_STATUS = {
    401: "unauthorized",
    404: "not_found",
    409: "conflict",
    429: "rate_limited",
}


def attach(path: str, status_code: int, content: dict) -> dict:
    """给 `/v1` 那一路的错误回体加一个 `code`；其余一律原样返回。

    判的是**路径**而不是异常类型：`/api/*` 与 `/v1/*` 共用这一支全局 handler（FastAPI 的
    handler 注册是全局的），所以"不动旧门"这句话必须由这一行的路径判断来兑现。
    """
    if not path.startswith("/v1"):
        return content
    code = CODE_BY_STATUS.get(status_code)
    if code is None:
        return content
    return {**content, "code": code}


async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=attach(request.url.path, exc.status_code, {"detail": exc.detail}),
        headers=getattr(exc, "headers", None),
    )

