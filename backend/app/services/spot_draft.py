"""RoamMark 那一路的「一组照片 → 景点初稿」生成（方案 `docs/方案-roammark-AI转发.md`）。

这一枚口存在的唯一理由：站长 10-22 那句「我计划付费接 deepseek API，他们目前支持读图能力」，
加上规格书 §五 P2 那一行那句 **key 不能进包**。所以画面上"AI 替我写字"这件事，在服务器上只是
**一根不出站的管道**：收图 → 转给 DeepSeek → 把回的话原样交出去。

它和 `services/llm.py` 不是一回事，也不要合并：那一只吃的是**长文本**、走混元云函数、
结果直接进我们的库；这一只吃的是**图**、走 DeepSeek 的 vision、**结果一行都不落库**
（RoamMark 是本机优先、无账号的另一条产品，它的正文存在用户手机上）。

三条纪律是这一只的命门，改代码之前先读：

1. **不留、不存、不回放图片**。请求进来、base64 出去、回体里没有图片的一个字节（用例钉着）。
   这一条不是合规姿态，是体积：10-25 实测一次 9 图的请求体 6.27 MiB，
   而 DeepSeek 的请求体上限 48 MiB 那一关**拦法是直接切 TLS 连接**（`SSLEOFError`、没有 HTTP 码）
   ——所以只能在门口按字节拒，绝不能"先进来再说"。
2. **一根管道不许变成一扇门**。这里是无账号、匿名可调的 AI 出口，别人拿它刷就是刷站长的钱。
   三道闸：来源 IP 限流（路由那枚 `@limiter`）、**同时只放三发在飞**（下面那个信号量，
   实测单发 19.6 秒，三发已经把本服务默认的线程/连接占位压满——这条是把 RoamMark 的流量
   和图麦笔记现网隔开的那道舱壁）、以及包头那枚 App 常量（`ROAMMARK_APP_GATE`）。
   ⚠ 最后那枚**不是密钥**：它编在包里，逆向我就能拿到，它的价值只是把"随手 curl 刷"抬到
   "要逆向我才刷得动"。真兜底是前两道＋用户侧的次数闸（待拍③）。
3. **钥从 `service_secrets` 读**，也就是后台「密钥配置」那一栏（名字 `DEEPSEEK`，
   已登记进 `CONSUMED_NAMES`）。站长拍的是"我自己去加、不换服务器不发版"——
   这一只就是那句话第一个真读它的消费者。`.env` 那行 `DEEPSEEK_API_KEY` 只是兜底，
   而且现网那一行是**占位符**（10-25 现读：长度 24；指纹只当场对，不写进仓）⇒ 一律过 `key_usable()`，
   占位符当"没配"处理，回 503 说人话，不打出去挨一次 401 再猜为什么。
"""
import base64
import json
import logging
import re
import time

import httpx

from app.core.config import settings
from app.core.errors import UserError
from app.services.llm import key_usable
from app.services import service_secrets

logger = logging.getLogger(__name__)

# 名字与后台那一栏一致（`current_key` 里那个字面量是唯一出处，也是 `CONSUMED_NAMES` 里那一个）。
# 一次导入＝一个景点（R3），上限 9 张与 `Note.maxPhotos` 同数。
MAX_IMAGES = 9
# 单张 4 MB：端上按 §五那条口径缩到长边 ~1300 之后，10-25 实测一张是 526 KB 左右，
# 留 7 倍余量是给"用户塞了张没缩的"那种情况——真原图 5.4 MB 那一级，服务端这里就先拒了。
MAX_IMAGE_BYTES = 4 * 1024 * 1024
# 总字节这一条是硬约束的直接产物：24 MiB 原始 ⇒ base64 ≈ 32 MiB，离官方 48 MiB 还有 16 MiB 余量。
# 为什么要余量：base64 只是图的部分，请求体还有 JSON 包装与提示词。
MAX_TOTAL_BYTES = 24 * 1024 * 1024
MAX_HINT_CHARS = 60
# 输出封顶。这一格直接决定单发最贵的钱：输出峰时 8 元/1M token ⇒ 700 token ≈ ¥0.0056。
OUTPUT_MAX_TOKENS = 700
MAX_DRAFT_CHARS = 2000
# 超限那一句只有一个出处：请求体在流式读的时候、以及解码后合计超了的时候，说的必须是同一句话
# （路由那边 `_read_capped` 直接引这一枚常量，不再自己写一遍）。
TOO_LARGE = "These photos are too many to draft in one go. Split them into two drafts."

# 舱壁：单发实测 19.6 秒（9 图，服务器侧，北京 10:09 峰时）。放太多发在飞，
# 这一条另一条产品（图麦笔记现网）会被拖住。取不到位直接 429，不排队——
# 排队会让用户那边等到看不见的时间，不如立刻告诉他"稍后再试"。
# ⚠ 取位与还位由**调用方**（那一枚路由）拿着，这一只函数自己不抢：429 必须发生在
# 读完上传体之前，否则拦下了也白白吃了一次几十 MB 的内存峰值。
# 一个整数就够，不用 Semaphore：加减都发生在任何 `await` 之前，事件循环里没有插队的余地。
# ⚠ 这一枚是**单进程**的计数（现网就是 uvicorn 单进程那两个 unit）；哪天改成多 worker，
# 这一闸会变成"每个 worker 各 3 发"，那时候要换成跨进程的量（redis 已在，别用内存数自欺）。
INFLIGHT_LIMIT = 3
_inflight = 0


def try_acquire_slot() -> bool:
    """取一个在飞位；取不到回 False（调用方当场 429）。配 `release_slot` 成对用。"""
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

LANG_PATTERN = re.compile(r"^[A-Za-z]{2,8}(-[A-Za-z0-9]{2,8}){0,2}$")
# 拍摄时间只收这一种形状（端上给的是 ISO8601）。不收自由文本：那一句会原样进提示词。
CAPTURED_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$")

JPEG = b"\xff\xd8\xff"
PNG = b"\x89PNG\r\n\x1a\n"
WEBP = b"RIFF"


class NotConfigured(UserError):
    """这一路今天没配可用的钥。

    单独立一个类型只为一件事：**这是 503 不是 400**。用户送来的东西没错，是服务器这一侧没开门；
    混在 `UserError` 里会被路由映射成 400，那句"请检查你传的参数"就把责任推给了用户。
    与 `ADMIN_TOKEN` 没配时 `/api/admin/*` 一律 503 同一条口径。
    """


class AIUpstreamError(RuntimeError):
    """DeepSeek 那侧回非 2xx／回的东西解不出来。面向用户的句子由路由那一层给，这里只带原因。"""


def current_key() -> str:
    """现在这一刻生效的那把钥。库里那一行优先（后台改完不用重启），进程环境变量那一条只在本机开发时用。

    ⚠ 名字只许是 `DEEPSEEK` 这一个：后台那一栏、`CONSUMED_NAMES`、`settings.DEEPSEEK`、
    以及现网 `.env` 里要写的那一行，全都得是同一个串。现网 `.env` 里那行
    `DEEPSEEK_API_KEY`（10-25 现读：长度 24、是个占位符；指纹不写进仓）**这一路不吃**——
    吃两个名字就会有两处真相，而"删掉库里那一行会回到哪一层"那句话也就没法在屏上说对了。
    """
    raw = service_secrets.resolve("DEEPSEEK", settings.DEEPSEEK)
    raw = (raw or "").strip()
    return raw if key_usable(raw) else ""


def _fmt_hint(value) -> str:
    return ("" if value is None else str(value)).strip()[:MAX_HINT_CHARS]


def _lang_name(raw: str | None) -> str:
    """把 `en`／`zh-Hans` 这类标签换成能进提示词的英文说法。

    为什么不直接把标签塞进提示词：那是用户可控串，`lang` 里塞一段话就等于往系统提示词里 injections。
    过一遍白名单正则、只留语言这一段，其余一律回落英文（RoamMark 的界面主语言）。
    """
    tag = (raw or "").strip()
    if not LANG_PATTERN.match(tag):
        return "English"
    base = tag.split("-")[0].lower()
    return {
        "en": "English", "zh": "Chinese (Simplified)", "ja": "Japanese", "ko": "Korean",
        "fr": "French", "de": "German", "es": "Spanish", "pt": "Portuguese",
        "ru": "Russian", "it": "Italian", "ar": "Arabic", "id": "Indonesian",
    }.get(base, "English")


def _coords(lat, lon) -> tuple | None:
    """把两个坐标收成一对 float，收不拢就整对丢掉。

    这一对是**辅助线索**，不是判据（§六第 1 条：境外地名反查三条路全回空，认地标这件事交给画面）。
    所以 JSON 里给了个字符串、给了个数不出的范围、或者只给一头，正确处理都是"当没给"，
    而不是抛出去把整发生成打断——用户那边看到的会是"生成失败"，而那些字节其实根本没离开手机。
    """
    out = []
    for value in (lat, lon):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        out.append(float(value))
    if not (-90.0 <= out[0] <= 90.0 and -180.0 <= out[1] <= 180.0):
        return None
    return out[0], out[1]


def _coords_text(pair) -> str:
    if pair is None:
        return "no coordinates were provided"
    return f"roughly {pair[0]:.4f}, {pair[1]:.4f} (device GPS; may be off — trust the picture)"


def build_prompt(*, lang: str, captured_at: list[str], place_hint: str | None, coords) -> str:
    """提示词只有这一个出处。协议那三行是解析器认的锚，改这里要一起改 `_parse`。"""
    times = "、".join(captured_at) if captured_at else "not available"
    hint = _fmt_hint(place_hint)
    return (
        "These photos are one visit to one place. Write the travel-journal entry for it.\n"
        f"Write in {lang}.\n"
        f"GPS at the time of shooting: {_coords_text(coords)}.\n"
        f"EXIF capture times: {times}. Use these for the date — never invent a date.\n"
        + (f"User's own note about the place: {hint}\n" if hint else "")
        + "\n"
        "Reply in EXACTLY this shape, nothing else:\n"
        "SPOT | the place or landmark you are most confident about, or unknown\n"
        "WHERE | city and country, or unknown\n"
        "\n"
        "Then 1-2 short paragraphs of first-person travel-journal prose: what the place is,\n"
        "what makes it worth visiting, and what these photos show. Plain text, no markdown,\n"
        "no headings, no bullet lists, no emoji.\n"
        "\n"
        "Hard rules: if the picture gives no evidence for a claim, do not make that claim.\n"
        "When you cannot identify the place, say so in the prose instead of guessing a famous site."
    )


def build_messages(images: list[bytes], prompt: str) -> list[dict]:
    parts = [
        {"type": "image_url",
         "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(b).decode()}}
        for b in images
    ]
    parts.append({"type": "text", "text": prompt})
    return [{"role": "user", "content": parts}]


def _parse(content: str) -> dict:
    """把那个三行协议拆出来，**拆不动就整段当正文**。

    模型偶尔会漏掉 `WHERE` 那一行、或者把竖线写成别的。这一路的正文才是产品要的东西，
    标识只是辅助信息，所以协议没对上时要"少拿到一点"，而不是把整发判失败。
    """
    text = (content or "").strip()
    lines = text.split("\n")
    spot = where = None
    while lines and (lines[0].startswith("SPOT") or lines[0].startswith("WHERE")):
        # 竖线偶尔被模型写成全角的 `｜`：协议锚要认两种，否则标识那一格会连着正文一起丢。
        head, _, value = lines.pop(0).replace("｜", "|").partition("|")
        value = value.strip().strip("：: ").strip()
        if not value or value.lower() == "unknown":
            value = None
        if head.upper().startswith("SPOT"):
            spot = value
        else:
            where = value
    draft = "\n".join(lines).strip()
    if not draft:
        # 一整发只回了协议那两行、正文是空的：这种情况正文只能算没生成出来。
        draft = ""
    return {"spot": spot, "where": where, "draft": draft[:MAX_DRAFT_CHARS]}


async def _post(key: str, payload: dict) -> dict:
    url = (settings.DEEPSEEK_BASE_URL or "https://api.deepseek.com").rstrip("/") + "/chat/completions"
    timeout = httpx.Timeout(settings.DEEPSEEK_TIMEOUT, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, json=payload, headers={
            "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        if r.status_code != 200:
            # 不回显任何凭据，也尽量把对方那句原因带着走日志（排查 401/429/超限全靠它）。
            # 用 replace 不用 re.sub：钥里可能带着正则元字符，拿它当模式会当场抛。
            body = r.text[:300].replace(key, "<key>")
            logger.error("DeepSeek 回 %s：%s", r.status_code, body)
            raise AIUpstreamError(f"HTTP {r.status_code}")
        try:
            return r.json()
        except Exception as exc:
            raise AIUpstreamError(f"回体不是 JSON：{type(exc).__name__}") from exc


async def draft_spot(images: list[bytes], *, lang: str | None = None,
                     captured_at: list[str] | None = None, place_hint: str | None = None,
                     lat=None, lon=None) -> dict:
    """一根管道：进图、出话。任何一步失败都只抛异常，不返回半成品。

    在飞位由调用方取与还（见 `try_acquire_slot`），这里不抢。
    """
    key = current_key()
    if not key:
        # 两句分开：屏上那句不许暴露"我们后台有一栏叫什么"，日志那句才是给站长看的。
        logger.error("这一路没有可用的钥：后台「密钥配置」里那一行 DEEPSEEK 是空的或仍是占位符")
        raise NotConfigured("AI drafting is not available right now.")

    prompt = build_prompt(lang=_lang_name(lang), captured_at=captured_at or [],
                          place_hint=place_hint, coords=_coords(lat, lon))
    payload = {
        "model": settings.DEEPSEEK_VISION_MODEL,
        "max_tokens": OUTPUT_MAX_TOKENS,
        "messages": build_messages(images, prompt),
    }
    t0 = time.monotonic()
    data = await _post(key, payload)
    took_ms = int((time.monotonic() - t0) * 1000)

    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.error("DeepSeek 回体形状不对：%s", sorted(data) if isinstance(data, dict) else type(data).__name__)
        raise AIUpstreamError("回体里没有 choices/message/content") from exc

    out = _parse(content)
    out["provider"] = "deepseek"
    out["model"] = settings.DEEPSEEK_VISION_MODEL
    out["usage"] = data.get("usage") or {}
    out["took_ms"] = took_ms
    # 日志只打计数与形状，绝不打钥、绝不打图、绝不打正文全文（正文是用户的，且会进对方的账单）。
    logger.info("景点初稿 provider=deepseek 图=%d张 输入=%s 输出=%s 用时=%dms spot=%s 正文=%d字",
                len(images), out["usage"].get("prompt_tokens"), out["usage"].get("completion_tokens"),
                took_ms, "有" if out["spot"] else "无", len(out["draft"]))
    if not out["draft"]:
        raise AIUpstreamError("正文是空的")
    return out


def read_body(raw: bytes) -> tuple[list[bytes], dict]:
    """把请求体收成（校验过的图，那份 JSON）。形状问题的句子全部在这一只函数里。

    路由那边只负责"用什么状态码送出去"，不负责写句子——两处句子就会有两处真相
    （`admin_ops.py` 里 `BlockIn`／`SecretIn` 那两条记的就是这个坑）。
    """
    try:
        data = json.loads(raw)
    except Exception:
        raise UserError("The request body is not valid JSON.")
    if not isinstance(data, dict):
        raise UserError("The request body is not a JSON object.")
    return validate_images(data.get("images")), data


def validate_images(raws: list) -> list[bytes]:
    """收 base64 字符串数组（JSON 里传来的形状），在这一步把张数、编码、字节数与文件头一起管住。

    句子全部中文且短：这一路没有账号、没有后台，用户看到的只有手机那一行 toast。
    先按**编码后的串长**粗筛再解码：不粗筛的话，一串 200 MB 的"图片"会先被解成 150 MB 内存
    才被逐张上限拒掉——那是白给人一次拒绝服务。
    """
    if not isinstance(raws, list) or not raws:
        raise UserError("Add at least one photo.")
    if len(raws) > MAX_IMAGES:
        raise UserError(f"Up to {MAX_IMAGES} photos at a time.")
    decoded = []
    for i, item in enumerate(raws, start=1):
        if not isinstance(item, str):
            raise UserError(f"Photo {i} is not image data.")
        if not item:
            raise UserError(f"Photo {i} is empty.")
        if len(item) > MAX_IMAGE_BYTES * 4 // 3 + 1024:
            raise UserError(f"Photo {i} is too large (max {MAX_IMAGE_BYTES // (1024 * 1024)}MB). Use a smaller copy.")
        try:
            # `validate=True`：含非法字符就直接拒，不做"顺手清一下再解"那种宽容处理——
            # 宽容会让半截粘贴的钥/图变成一份能解出乱码字节的"合法"请求。
            decoded.append(base64.b64decode(item, validate=True))
        except Exception:
            raise UserError(f"Photo {i} could not be read.")
    return _check_shapes(decoded)


def _check_shapes(decoded: list[bytes]) -> list[bytes]:
    if not decoded:
        raise UserError("Add at least one photo.")
    if len(decoded) > MAX_IMAGES:
        raise UserError(f"Up to {MAX_IMAGES} photos at a time.")
    total = 0
    out = []
    for i, data in enumerate(decoded, start=1):
        if not data:
            raise UserError(f"Photo {i} is empty.")
        if len(data) > MAX_IMAGE_BYTES:
            raise UserError(f"Photo {i} is too large (max {MAX_IMAGE_BYTES // (1024 * 1024)}MB). Use a smaller copy.")
        head = data[:12]
        if not (head.startswith(JPEG) or head.startswith(PNG)
                or (head.startswith(WEBP) and data[8:12] == b"WEBP")):
            raise UserError("Only JPG, PNG or WebP photos are supported.")
        total += len(data)
        out.append(data)
    if total > MAX_TOTAL_BYTES:
        # 这一句不能只说"太大"：DeepSeek 那一侧对超限请求**直接切连接**，不返回可读错误码（10-25 实测），
        # 所以这里必须自己拦下并告诉他分两批，否则他手机上看到的就是"网络异常"。
        raise UserError(TOO_LARGE)
    return out


def parse_captured_at(raw) -> list[str]:
    """拍摄时间收两种形状：JSON 里的真数组（这一路用的），以及 form 编码时代的那一个串。

    形状不对就当没给（不为这一格打断生成）——时间那一格在正文里由提示词兜着，
    没有它模型照样会写，有它才不至于编一个日期。
    """
    if not raw:
        return []
    data = raw
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
        except Exception:
            return []
    if not isinstance(data, list):
        return []
    keep = []
    for item in data[:MAX_IMAGES]:
        s = str(item or "").strip()
        if CAPTURED_PATTERN.match(s):
            keep.append(s)
    return keep
