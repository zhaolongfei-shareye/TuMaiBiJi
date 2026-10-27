"""`POST /v1/extract` —— iPhone 那一发"只要提炼结果"的口（站长 10-27 拍的甲）。

他要的那句话：「笔记看不到摘要，这个要补。」而"摘要"在小程序那一侧从来不是端上算的：
它是服务端那一次提炼写进库的（`app/services/llm.py:extract_knowledge`，提示词逐字
「写一段 2-3 句话的摘要」，同一次调用还出 `title`／`key_points`／`tags`）。所以"复刻"这一格
只有一个形状是对的：**把同样的那一次调用给 iPhone 也用一次**，不是在端上另造一套近似。

与 `/api/ingest/*` 那三口的差别，一条一条写清，因为这几条决定本文件为什么长这样：

1. **不在服务端建笔记、不建 task、不推队列**。`/api/ingest/*` 的产物是 `note_id`（小程序的笔记
   本来就在云上），iPhone 这一版的笔记全在本地库（`ios/Sources/Domain/Persistence/`），
   隐私那一屏也明写「这个应用没有账号」。这一口把结果原样回给调用方：正文是**过路**，不是存储。
2. **不做内容送检**。`enforce_text_safety` 走微信 `msgSecCheck`，那个接口要 `openid`
   （现读 `app/services/wechat.py`），匿名设备没有 openid ⇒ 这一族物理上送不进去。
   这一口守得住的是"结果只回到发起那台设备"：不落库、不公开、不进任何人的时间线。
   **这条口径得由判据钉住**（`tests/test_v1_extract.py` 里那两条"不写库／日志里不许出现正文"），
   哪天有人开始把正文存下来或往第三处转发，红的应该是用例，不是用户的隐私。
3. **模型不可用时照实降级，不替它修饰**。`extract_knowledge` 自己不抛错，回 `degraded=True`
   ＋ 各栏按它自己那两条降级形状填（异常那一条 `summary` 留空见 `llm.py:_degraded`；
   回来的不是 JSON 那一条 `summary` 是原文前 500 字，见 `llm.py:_parse_response`）。
   端上再加一条**墙钟deadline**：超时就按"留空那一档"回，因为新建那一屏是一条人在等的链路。
4. **四样叠起来才敢让这一口匿名**。iPhone 端上没有身份（现读：`ios/Sources` 全仓 0 处
   `AuthenticationServices`），能带上来的最重的东西是一枚安装时生成的随机串，而那种串
   换一枚就多 50 条 ⇒ 按设备记的只是"一台别打太多"的公平，**钱的上限是全站那一档**
   （`settings.EXTRACT_GLOBAL_DAILY_LIMIT`）。再加门闩（`TUMARKNOTE_APP_GATE`，
   **没配 = 这一口 503**，现网今天就是这一态）与 IP 限流、在飞舱壁。单独任何一样都不够。

`translate` 那一位与 `/api/ingest/url` 同一个语义、同一个默认：`None` ＝ 提示词里不写输出语言。
默认必须是 `None` 而不是 `False`，理由抄那一处（写成 `False` 就成了"明确要求跟随原文语言"）。

⚠ **端上的超时必须比 `EXTRACT_DEADLINE_SECONDS` 大**，理由与 `config.py` 里
`HUNYUAN_CF_TIMEOUT`／`DEEPSEEK_TIMEOUT` 那两条一样：服务器还在等、手机先断了，
看起来像我们的错。
"""
import asyncio
import logging
import re

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.rate_limit import get_ip_key, limiter
from app.services import daily_budget
from app.services.llm import extract_knowledge

router = APIRouter()
logger = logging.getLogger(__name__)

GATE_HEADER = "x-tumarknote-gate"
DEVICE_TOKEN_HEADER = "x-device-token"
# 32~128 位十六进制。钉形状是为了让日志与 `daily_usage.user_id` 里那一列长得一样，
# 也让"随便塞一串字当身份"打不进来。
_DEVICE_TOKEN = re.compile(r"^[0-9a-f]{32,128}$")

# 全站那一档记在哪一行：`daily_usage.user_id` 是一列字符串，历史上装的都是真用户 id，
# 这一行装的是"今天全站"。前缀 `global:` 让它不可能撞上一个真实账号。
GLOBAL_LEDGER_KEY = "global:extract"

# 与 iPhone 那一侧的取数上限同源：`LinkImport.bodyCharBudget` = 50000 字。
# 再长的东西客户端自己就拒了（`tooLong` 报的是真实字数），走不到这一口。
MAX_TEXT_CHARS = 50000
MAX_TITLE_CHARS = 200

# 舱壁：一次纯文本提炼的上游耗时现读**没有实测数**（小程序那三路都是 worker 里跑的，
# 没人从 HTTP 侧量过），所以这一档先按"别让图麦笔记现网自己被拖住"给三发，
# 与 `services/spot_draft.INFLIGHT_LIMIT` 同一理由、**同一数值但各自一份**
# （两组舱壁各管各的产品，共用的话 RoamMark 打满会把 iPhone 的摘要一起饿死）。
# ⚠ 单进程计数（现网 uvicorn 单进程那两个 unit）；改多 worker 要换跨进程的量，别用内存数自欺。
INFLIGHT_LIMIT = 3
_inflight = 0


class ExtractRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)
    # 只是给模型的"参考标题"，与 `/api/ingest/*` 那一路的 `title_hint` 同一角色：
    # 抓下来的那一页自己就有标题，端上一起带上，省得模型再从正文里猜一次。
    fallback_title: str = Field(default="", max_length=MAX_TITLE_CHARS)
    translate: bool | None = None


class ExtractResponse(BaseModel):
    title: str
    summary: str
    key_points: list[str]
    tags: list[str]
    degraded: bool


def try_acquire_slot() -> bool:
    """取一个在飞位；取不到回 False（调用方当场 429）。配 `release_slot` 成对用。

    一个整数就够，不用 Semaphore：加减都发生在任何 `await` 之前，事件循环里没有插队的余地
    （抄 `spot_draft` 那一处的纪律）。
    """
    global _inflight
    if _inflight >= INFLIGHT_LIMIT:
        return False
    _inflight += 1
    return True


def release_slot() -> None:
    global _inflight
    _inflight = max(0, _inflight - 1)


def in_flight() -> int:
    """现在有几发在飞。给用例与部署自检读，不给用户看。"""
    return _inflight


def _check_gate(request: Request) -> None:
    """门闩。没配 = 这一口关着（503），绝不允许"没配就当不检"。

    为什么直接 `raise HTTPException` 而不是自己拼回体：**`/v1` 那一组的稳定 `code` 是全局
    handler 按状态码翻的**（401/404/409/429 四格有名字，其余一律没有，见 `core/error_codes.py`）。
    在这里自己回一份 JSON 就绕开了那一支，回体会**少一个 code**，而 iPhone 那端按契约读的正是它。
    两处真相的那一种，`tests/test_v1_extract.py` 里"401 必带 `unauthorized`／400 必不带 code"
    两条钉的就是它。

    ⚠ 门闩不是密钥（与 `routes/roammark.py:_check_gate` 同一条命）：这一串编在 App 包里，
    逆向我就能拿到；它抬高的只是"随手 curl 就能刷站长的钱"到"得先从包里扒出这串"这一档。
    比对失败一律回一句不含线索的话，不告诉对方"差一点了"，也不区分"没带头"与"头不对"。
    """
    gate = (settings.TUMARKNOTE_APP_GATE or "").strip()
    if not gate:
        logger.error("TUMARKNOTE_APP_GATE 没配：iPhone 提炼这一口关着")
        raise HTTPException(status_code=503, detail="这台服务器还没开提炼这一口")
    if request.headers.get(GATE_HEADER, "").strip() != gate:
        raise HTTPException(status_code=401, detail="这一发请求没有带上开口的编号")


def _device_id(request: Request) -> str:
    """从请求头上取那枚设备编号，取不到或形状不对回空串（调用方当场 400）。

    先 `lower()` 再比形状：端上那枚串是自己生成的十六进制，走哪条系统 API 都可能给大写，
    拒大写等于"换一台机器的写法就不被认"。归一之后大写小写落到**同一行账**上，
    这一句由 `tests/test_v1_extract.py` 量（不归一＝同一台设备被记成两台、那 50 条变 100 条）。

    为什么不是 401：401 在契约 §六 里对应 `unauthorized`，那一格说的是"钥匙不对"，
    而这一口**根本没有钥匙**——它要的不是凭据，是一个用来记公平用量的编号。
    把它报成"没登录"会让 iPhone 那一端去弹一个它压根没有的登录入口。
    """
    token = request.headers.get(DEVICE_TOKEN_HEADER, "").strip().lower()
    return token if _DEVICE_TOKEN.match(token) else ""


@router.post("", response_model=ExtractResponse)
@limiter.limit("10/minute", key_func=get_ip_key)
async def extract(request: Request, payload: ExtractRequest):
    """提炼一次，只回结果。整口不落库、不建笔记、不打正文日志。"""
    _check_gate(request)
    device = _device_id(request)
    if not device:
        raise HTTPException(status_code=400, detail="缺少设备编号")
    text = payload.text.strip()
    # 与 `/api/ingest/text` 同一句判空（那里是 `if not title or not content`）：一串空白
    # 不是"一段很短的正文"，是一篇没有正文，花钱打它也不会出摘要。
    if not text:
        raise HTTPException(status_code=400, detail="正文是空的")

    # 取位在**花钱那两格之前**：舱壁满了直接 429，不排队、也不记账（排队会让用户
    # 等到看不见的时间，而记账会把"今天没用完"的那条额度白吃掉一格）。
    if not try_acquire_slot():
        raise HTTPException(status_code=429, detail="服务器上现在提炼排满了，稍一下再试")
    try:
        # 两档日闸的顺序是定的，抄 `ingest_text` 那条纪律：**先判全站，再判这台设备**——
        # 全站打满时不该再花掉某台设备的那一条额度。两步都要真写库，而这一口是 `async def`
        # ⇒ 按 M2 那条纪律甩进工作线程，否则 SQLite 慢的那几百毫秒是全站（含 /health）一起排队。
        budget = await asyncio.to_thread(
            daily_budget.charge, GLOBAL_LEDGER_KEY, daily_budget.KIND_EXTRACT_GLOBAL
        )
        if not budget.ok:
            raise HTTPException(status_code=429, detail=budget.message)
        per_device = await asyncio.to_thread(
            daily_budget.charge, f"device:{device}", daily_budget.KIND_EXTRACT
        )
        if not per_device.ok:
            raise HTTPException(status_code=429, detail=per_device.message)

        # `extract_knowledge` 自己不抛错（里面那条 except 兜住一切出网失败并降级），
        # 所以这里不 try 它：真出事是它兜不住的那一类，让它抛、让 500 如实红。
        # 墙钟那一道是**这一口自己加的**（小程序那三路在 worker 里跑，没有人等屏）：
        # 人在新建那一屏按下去，超时上限就是这一枚数，到点回"留空那一档"。
        try:
            knowledge = await asyncio.wait_for(
                extract_knowledge(
                    text,
                    fallback_title=payload.fallback_title.strip(),
                    translate=payload.translate,
                ),
                timeout=settings.EXTRACT_DEADLINE_SECONDS,
            )
        except asyncio.TimeoutError:
            # 取消之后上游那一发可能照样跑完（钱照花），但屏上不能一直转。
            logger.warning("提炼超过 %s 秒，按降级回", settings.EXTRACT_DEADLINE_SECONDS)
            return ExtractResponse(
                title=payload.fallback_title.strip(), summary="",
                key_points=[], tags=[], degraded=True,
            )
    finally:
        release_slot()

    # ⚠ 这一句日志**只报长度与形状，永远不报正文**——上面第 2 条那句"不打正文"守不守得住，
    # 看得是这一行有没有被人顺手加宽（判据在 `tests/test_v1_extract.py`）。
    logger.info(
        "v1 提炼：设备 %s…，正文 %d 字，degraded=%s",
        device[:8], len(text), bool(knowledge.get("degraded")),
    )
    return ExtractResponse(
        title=knowledge["title"],
        summary=knowledge["summary"],
        key_points=list(knowledge["key_points"]),
        tags=list(knowledge["tags"]),
        degraded=bool(knowledge.get("degraded")),
    )
