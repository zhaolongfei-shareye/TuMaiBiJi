"""RoamMark 那一路的景点初稿转发（方案 `docs/方案-roammark-AI转发.md`，站长 10-22「我计划付费接 deepseek API，他们目前支持读图能力」＋规格书 §五 P2 那一行「key 不能进包」）。

**为什么这一枚口不吃 `multipart`**：FastAPI 的 `File(...)` 底层是 Starlette 的 `UploadFile`，
超过 1 MiB 那一部分会被**临时写到服务器的磁盘上**再删。我们的口径是"照片只在用户手机上、
服务器只是根管道"，所以宁可自己读体：JSON＋base64（多 33% 字节，但这一路本来就不大），
换来两条承诺得住的东西——**边读边数字节，超限立刻回**；**图一个字节都不碰磁盘**。
iOS 侧就是 `Data.base64EncodedString()`，没有额外成本。

**为什么路径单独起一段 `/api/roammark/*`**：这一组口**没有账号**（RoamMark 拍的是纯本机、无账号），
而 `/api/*` 那一堆小程序口全按用户 JWT 发钥匙；混在一起，迟早有人顺手给它们挂同一个依赖。

⚠ **这一组的错误回体是第三种口径**：`/api/*` 回一句中文 `detail`，`/v1/*` 回中文加四个 code，
这里回**英文 `detail` ＋稳定 code**。不是省事——RoamMark 的用户界面是英文的、面向全球，
而 `tests/test_error_text_language.py` 那把尺子钉的是图麦笔记那一侧"屏上不许出现英文"。
两句都成立才只能分开钉：那把尺子对本文件放行，同时同一条尺子要求这一文件的 detail 必须是英文——
哪一天串了线，红的会是尺子，不是用户的屏。

`services/spot_draft.py` 顶上那三条纪律在这里的落点：字节闸在解析之前、
`ROAMMARK_APP_GATE` 没配就整组 503（不能"没配就当不检"）、取不到在飞位直接 429 且不排队。
"""
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.errors import UserError
from app.core.rate_limit import get_ip_key, limiter
from app.services import spot_draft

logger = logging.getLogger(__name__)
router = APIRouter()

# 字节上限从服务层现读，不在这里重打一遍（`notes.MAX_BODY` 那条同一规矩）。
TOTAL_LIMIT = spot_draft.MAX_TOTAL_BYTES
# base64 是原文的 4/3，再加 JSON 的引号与逗号；另放 4 MiB 包装余量。
# 一次 9 张、每张缩到长边 ~1300 时实测请求体 6.27 MiB（10-25 那七发里最贵的一发），
# 所以这一格放的是"用户塞了没缩的那一档"的判定空间，逐张上限仍由服务层管。
BODY_LIMIT = TOTAL_LIMIT * 4 // 3 + 4 * 1024 * 1024


def _fail(status: int, code: str, detail: str) -> JSONResponse:
    """错误体的唯一出口。`code` 给客户端分支用，`detail` 只是本地文案缺失时的兜底。"""
    return JSONResponse(status_code=status, content={"code": code, "detail": detail})


def _check_gate(request: Request):
    """这组口的门闩。没配 = 整组不可用（503），绝不允许"没配就当不检"。

    ⚠ 这一枚**不是密钥**：它编在 App 包里，逆向我就能拿到。它的作用只是把"随便一台机器
    curl 一下就能刷站长的钱"抬到"得先从包里把这个串扒出来"。真正兜底的是同一把尺子上的
    IP 限流与那三发在飞的舱壁——所以比对失败一律回一句不含线索的话：不告诉对方"差一点了"，
    也不区分"没带头"与"头不对"。
    """
    gate = (settings.ROAMMARK_APP_GATE or "").strip()
    if not gate:
        logger.error("ROAMMARK_APP_GATE 没配：这一路整组关闭")
        return _fail(503, "not_configured", "AI drafting is not configured on this server.")
    if request.headers.get("X-RoamMark-Gate", "").strip() != gate:
        return _fail(401, "unauthorized", "This request is not allowed.")
    return None


async def _read_capped(request: Request):
    """边流式读边数字节：超了立刻回 413，绝不先把整包吞进内存再判。

    返回 `(bytes, None)` 或 `(None, 响应)`——这一枚不靠异常往外带句子：
    句子有第二处真相的毛病就从这里开始，形状问题归服务层说，这里只管状态码与 code。
    """
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > BODY_LIMIT:
        return None, _fail(413, "too_large", spot_draft.TOO_LARGE)
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > BODY_LIMIT:
            return None, _fail(413, "too_large", spot_draft.TOO_LARGE)
        chunks.append(chunk)
    return b"".join(chunks), None


@router.post("/api/roammark/spot-draft")
@limiter.limit("10/minute", key_func=get_ip_key)
async def spot_draft_create(request: Request):
    """一组照片 → 一段景点初稿。回体里只有话与计数，**没有图的一个字节**。"""
    blocked = _check_gate(request)
    if blocked is not None:
        return blocked
    if not spot_draft.try_acquire_slot():
        # 取位在读体之前：第 4 发不该为了"发现自己要被判 429"而先把几十 MB 上传完。
        return _fail(429, "busy", "AI drafting is busy right now. Try again in a moment.")
    try:
        raw, blocked = await _read_capped(request)
        if blocked is not None:
            return blocked
        try:
            pics, data = spot_draft.read_body(raw)
            out = await spot_draft.draft_spot(
                pics,
                lang=data.get("lang"),
                captured_at=spot_draft.parse_captured_at(data.get("captured_at")),
                place_hint=data.get("place_hint"),
                lat=data.get("lat"),
                lon=data.get("lon"),
            )
        except spot_draft.NotConfigured as e:
            # 服务器这一侧没开门，不是用户送错了东西 ⇒ 503。理由见那个类型的 docstring。
            return _fail(503, "not_configured", str(e))
        except UserError as e:
            # 句子由服务层给（那里是唯一出处），这里只负责装进 400 的形状。
            return _fail(400, "bad_request", str(e))
        except spot_draft.AIUpstreamTimeout as e:
            # ⚠ 这一支必须排在 `AIUpstreamError` 前面：它是那一支的子类，写反了永远轮不到。
            # 504 与 502 分开是因为"对方没答"和"对方答得慢"在用户屏上是两句话；
            # 而且这一发**钱可能已经花了**，日志里那句用时是给站长对账单用的（`spot_draft._post`）。
            logger.warning("景点初稿上游超时 remote=%s 原因=%s", get_ip_key(request), e)
            return _fail(504, "upstream_timeout", "The AI took too long to answer. Try again.")
        except spot_draft.AIUpstreamError as e:
            # 日志只带来源与原因，不带钥、不带图、不带正文；回体里一个字都不带。
            logger.warning("景点初稿上游失败 remote=%s 原因=%s", get_ip_key(request), e)
            return _fail(502, "upstream", "AI did not answer. Try again in a moment.")
        return out
    finally:
        spot_draft.release_slot()


@router.get("/api/roammark/health")
async def spot_draft_health():
    """给部署自检与客户端开局用：**只报有没有配好，绝不把钥的任何形状带出去**。

    故意不叫 `/health`——那枚是这台机器上图麦笔记自己的存活检查（nginx 与 `deploy.sh` 都读它），
    这一枚只管"RoamMark 那一路今天能不能用"。⚠ 它也就此成了"口令没配"这件事的公开可探测点：
    回的是布尔值，不含任何凭据形状，与 `ADMIN_TOKEN` 那一路同一个口径。
    """
    return {
        "ready": bool(spot_draft.current_key()),
        "gate_open": bool((settings.ROAMMARK_APP_GATE or "").strip()),
        "model": settings.DEEPSEEK_VISION_MODEL,
        "max_images": spot_draft.MAX_IMAGES,
        "max_total_mb": TOTAL_LIMIT // (1024 * 1024),
        "timeout_seconds": settings.DEEPSEEK_TIMEOUT,
        "in_flight": spot_draft.in_flight(),
    }
