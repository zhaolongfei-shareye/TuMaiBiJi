import asyncio
import json
import logging
import re

import httpx

from app.core.config import settings
from app.services import service_secrets

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
INITIAL_BACKOFF = 1.0

# 交给那条云函数的正文字符上限，与 `cloudfunctions/extract/index.js` 的 `MAX_INPUT` 同一枚数。
# 两处各写一份是事实（一头是本服务、一头是函数，没有共用的一层），所以**改这一枚必须连重传函数一起**。
_CF_INPUT_LIMIT = 12000

# 提炼供应商的唯一开关。三个取值的含义严格区分：
#   hunyuan_cf —— 默认。打云函数的 HTTP 触发，云函数内部再用 cloud.ai() 走混元。
#                 免费额度只有从这个来源调用才会被抵扣，所以不能由本服务直连混元端点。
#   none       —— 强制降级。用于排查，以及提审期临时关能力。**不发起任何出网请求**。
#   wechat_ai  —— 为微信自家 AI 预留的枚举位。官方明令禁止把相关代码合入正式版，
#                 所以这里只占位、不写任何调用实现；命中时明确报"未实现"，不静默不崩。
PROVIDER_HUNYUAN_CF = "hunyuan_cf"
PROVIDER_NONE = "none"
PROVIDER_WECHAT_AI = "wechat_ai"
KNOWN_PROVIDERS = (PROVIDER_HUNYUAN_CF, PROVIDER_NONE, PROVIDER_WECHAT_AI)

# .env 里遗留的示例值（sk-your-key / your-secret-xxx）非空但不是真凭据，
# 若当作已配置会把每条任务变成 401 重试失败，比缺 key 更难排查。
_PLACEHOLDER = re.compile(
    r"(?i)^(sk-)?(your[-_]|example|placeholder|changeme|dummy|todo|test[-_]?key|x{3,}|<|\{\{)"
)


class TransientExtractError(RuntimeError):
    """云函数说"这个错重试有可能好"（模型侧 429 / 5xx / 网络类）。

    单独立一个类型，是因为函数把模型错误包成 HTTP 200 返回，状态码上分不出
    "值得重试"和"重试也不会变好"，只能由函数用 retryable 字段显式带出来。
    """


def key_usable(key: str) -> bool:
    key = (key or "").strip()
    return bool(key) and not _PLACEHOLDER.match(key)


def provider_implemented(provider: str) -> bool:
    """给 deploy.sh 自检用：区分"没配凭据"与"这个 provider 本来就还没写"。"""
    return provider in (PROVIDER_HUNYUAN_CF, PROVIDER_NONE)


def _degraded(text: str, fallback_title: str) -> dict:
    """提炼不可用时的兜底：只给标题，正文与原文由调用方入库。"""
    title = (fallback_title or "").strip()
    if not title:
        title = next((ln.strip() for ln in text.splitlines() if ln.strip()), "")[:30]
    return {
        "title": (title or "未命名笔记")[:500],
        "summary": "",
        "key_points": [],
        "tags": [],
        "degraded": True,
    }

SYSTEM_PROMPT = """你是一个内容提取与知识整理助手。用户会提供一篇文章或截图识别的文本。
你的任务是：
1. 提取一个简洁的标题
2. 写一段 2-3 句话的摘要
3. 提取 3-8 个关键要点（每条一句话）
4. 生成 3-6 个标签（短词）

严格按以下 JSON 格式输出，不要输出其他内容：
{
  "title": "标题",
  "summary": "摘要",
  "key_points": ["要点1", "要点2", ...],
  "tags": ["标签1", "标签2", ...]
}"""

# 站长 10-04：「我贴一条纯英文的，界面也是英文，不明白为什么提炼的时候自动翻译成中文」。
# 根因不在模型勤快，在这份 prompt 整篇是中文——它就一直顺着提问的语言答。原来没有任何
# 一行说明"用什么语言写"，所以这一段是从界面上那枚「原文翻译」开关补进来的：
# 关＝跟随原文的语言（英文原文出英文摘要），开＝整理成中文。
# None 是"不表态"＝回原来那份，链接／截图两条不带这个参数，行为一字不变。
_LANG_KEEP = """
输出语言：标题、摘要、要点、标签都跟随原文的语言。原文是英文就写英文，
是日文就写日文，不要翻译成中文。"""
_LANG_ZH = """
输出语言：标题、摘要、要点、标签一律用简体中文写。原文是其他语言时先读懂，
再整理成中文。"""


def system_prompt(translate=None):
    """按那一枚开关决定给模型的提示词带不带"输出语言"那一段。"""
    if translate is None:
        return SYSTEM_PROMPT
    return SYSTEM_PROMPT + (_LANG_ZH if translate else _LANG_KEEP)


async def extract_knowledge(text: str, fallback_title: str = "", translate=None) -> dict:
    """提炼结构化知识；提炼能力不可用时自动降级，绝不让整条采集任务失败。

    返回 dict 含 title/summary/key_points/tags；降级时附带 degraded=True，
    便于任务结果里区分「采集失败」与「只是没提炼」。
    """
    try:
        result = await _call_llm(text, fallback_title, translate)
        result.setdefault("degraded", False)
        return result
    except Exception as e:
        logger.warning("提炼不可用，降级为原文入库：%s: %s", type(e).__name__, e)
        return _degraded(text, fallback_title)


def _build_user_content(text: str, fallback_title: str) -> str:
    """拼交给云函数的那段正文：**只截断，不拼标题**（10-25 第八轮审计 M18）。

    原先这里也拼一次 `参考标题：`，而 `cloudfunctions/extract/index.js:54` 收到之后又拼一次
    ⇒ 模型每次多吃一行重复标题（本地只读脚本实测：`参考标题：` 出现 2 次）。
    为什么删这一头而不是那一头：函数是**先切 `MAX_INPUT` 再拼标题**，所以留下"截断＋标记"在这一头、
    标题交给那一头，两件事各只有一处做。
    ⚠ 但 10-25 那一版**顺带写下的那句"标记这一回真能送到"是没量过的话**（见下面 Y4），
    送到与否由长度决定，不由"删了哪一行"决定。

    口径写死在这里：**拼标题只有函数那一处**。要改就先改函数并重传云函数，别在这里补回一行。

    ⚠ **截断那一句要把标记自己算进预算**（第九轮审计 Y4）。上一版写的是"切到 12000 再追加标记"，
    送出去就是 **12,018** 个字符；而 `cloudfunctions/extract/index.js:53` 按**同一个** 12000 再切一刀
    ⇒ 那七个字符的标记必在尾巴上被削掉，模型从头到尾不知道自己拿到的是半篇。
    上一版的注释与第八轮的账都写着"这一回真能送到"——那是**没量过的话**，本轮起改成先算长度。
    留 12000 这一格不动是因为函数那一头吃的就是这一枚上限，改那一头要连重传云函数一起（另一句口令）。
    """
    if len(text) <= _CF_INPUT_LIMIT:
        return text
    marker = "\n\n[...内容过长，已截断...]"
    return text[:_CF_INPUT_LIMIT - len(marker)] + marker


async def _call_llm(text: str, fallback_title: str = "", translate=None) -> dict:
    """按 EXTRACT_PROVIDER 分发到具体供应商实现。

    重试策略只作用于"可能自愈"的失败：429 限流、5xx、超时，最多 MAX_RETRIES 次指数退避。
    云函数明确回了 error 字段、或 provider 本身不可用，属"重试也不会变好"，直接抛出。
    """
    provider = (settings.EXTRACT_PROVIDER or PROVIDER_HUNYUAN_CF).strip()

    if provider == PROVIDER_NONE:
        raise RuntimeError("EXTRACT_PROVIDER=none，已按配置跳过提炼")
    if provider == PROVIDER_WECHAT_AI:
        raise RuntimeError("EXTRACT_PROVIDER=wechat_ai 尚未实现（官方未开放提审），走降级")
    if provider not in KNOWN_PROVIDERS:
        raise RuntimeError(f"未知的 EXTRACT_PROVIDER={provider!r}，走降级")

    return await _call_hunyuan_cloud_function(text, fallback_title, translate)


async def _call_hunyuan_cloud_function(text: str, fallback_title: str, translate=None) -> dict:
    url = (settings.HUNYUAN_CF_URL or "").strip()
    # key 走 `service_secrets.resolve`：后台那一页换了库里那一行就当场生效，不用重启 worker；
    # 库里没这一行时回的就是 `.env` 那一份，`key_usable` 那句占位符判据两种来源都照旧管得住。
    # 裹 `to_thread` 是 10-25 第八轮审计 M2：这一句同步查库，而这里是 `async def`——
    # 提炼一趟最多四发重试，每次都把整站的循环按在库上，症状是"别人也在等"。
    key = (await asyncio.to_thread(
        service_secrets.resolve, "HUNYUAN_CF_KEY", settings.HUNYUAN_CF_KEY) or "").strip()

    if not url:
        raise RuntimeError("HUNYUAN_CF_URL 未配置，无法调用提炼云函数")
    if not key_usable(key):
        raise RuntimeError("HUNYUAN_CF_KEY 未配置或仍为占位符，请设置云函数触发凭据")

    payload = {
        "text": _build_user_content(text, fallback_title),
        "fallback_title": fallback_title,
        "system_prompt": system_prompt(translate),
    }
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    timeout = settings.HUNYUAN_CF_TIMEOUT

    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, json=payload, headers=headers)

            if resp.status_code == 429:
                raise httpx.HTTPStatusError(
                    "Rate limit exceeded", request=resp.request, response=resp
                )
            if resp.status_code >= 500:
                raise httpx.HTTPStatusError(
                    f"Server error: {resp.status_code}", request=resp.request, response=resp
                )
            if resp.status_code >= 400:
                # 4xx 里除 429 外都是"请求本身有问题"：地址写错、凭据被拒、body 不合法。
                # 重试三次只会把降级推迟 1+2+4 秒，不会改变结果，所以按不可重试处理。
                raise RuntimeError(
                    f"提炼云函数返回 HTTP {resp.status_code}：{resp.text[:200]!r}"
                )

            try:
                data = resp.json()
            except (json.JSONDecodeError, ValueError) as e:
                # 网关在函数没部署/路径错时会回一段 HTML 错误页，这里不当可重试错误处理。
                raise RuntimeError(
                    f"提炼云函数返回非 JSON（{type(e).__name__}）：{resp.text[:200]!r}"
                )

            if not isinstance(data, dict):
                raise RuntimeError(f"提炼云函数返回的不是对象：{type(data).__name__}")
            if data.get("error"):
                # 云函数把模型侧的错误包成 HTTP 200 + {error} 返回，状态码上看不出可不可重试，
                # 所以可重试性由函数用 retryable 字段显式带出。实测空闲后的第一次调用必吃一个
                # 429、紧接着几次全好——若不重试，每条空闲后的第一条笔记就会静默丢掉摘要。
                msg = f"提炼云函数报错：{str(data['error'])[:300]}"
                raise TransientExtractError(msg) if data.get("retryable") else RuntimeError(msg)

            return _parse_response(json.dumps(data, ensure_ascii=False), fallback_title)

        except (httpx.TimeoutException, httpx.HTTPStatusError, TransientExtractError) as e:
            last_error = e
            if attempt < MAX_RETRIES:
                backoff = INITIAL_BACKOFF * (2 ** attempt)
                logger.warning(
                    "提炼云函数请求失败 (attempt %d/%d): %s，%0.1f 秒后重试",
                    attempt + 1, MAX_RETRIES + 1, str(e), backoff,
                )
                await asyncio.sleep(backoff)
            else:
                logger.error(
                    "提炼云函数在 %d 次尝试后最终失败: %s", MAX_RETRIES + 1, str(e)
                )
                raise
        except Exception as e:
            logger.error("提炼云函数遇到非重试错误: %s", str(e))
            raise

    raise last_error


def _parse_response(content: str, fallback_title: str) -> dict:
    content = content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        lines = [l for l in lines if not l.startswith("```")]
        content = "\n".join(lines)

    try:
        result = json.loads(content)
    except json.JSONDecodeError:
        # ⚠ 这一支以前不带 `degraded`，而 `extract_knowledge` 是 `setdefault("degraded", False)`
        # ⇒ 库里把"模型吐回来的不是 JSON"记成提炼成功（N9，与云函数那一支同一个洞）。
        # 摘要其实是原文前 500 字、要点与标签空、卡片眉标退到分类名，这些都得能被下游分清。
        title = (fallback_title or "未命名笔记").strip()[:500]
        return {
            "title": title,
            "summary": content[:500],
            "key_points": [],
            "tags": [],
            "degraded": True,
        }

    # Validate structure and types
    if not isinstance(result, dict):
        title = (fallback_title or "未命名笔记").strip()[:500]
        return {
            "title": title,
            "summary": content[:500],
            "key_points": [],
            "tags": [],
            "degraded": True,
        }

    title = result.get("title")
    if not isinstance(title, str) or not title.strip():
        title = fallback_title or "未命名笔记"
    
    # Truncate title to fit database constraint (500 chars)
    title = title.strip()[:500]

    summary = result.get("summary", "")
    if not isinstance(summary, str):
        summary = str(summary) if summary is not None else ""

    key_points = result.get("key_points", [])
    if not isinstance(key_points, list):
        key_points = []
    else:
        key_points = [str(kp) for kp in key_points if isinstance(kp, (str, int, float))]

    tags = result.get("tags", [])
    if not isinstance(tags, list):
        tags = []
    else:
        tags = [str(t) for t in tags if isinstance(t, (str, int, float))][:20]  # Limit tags

    return {
        "title": title,
        "summary": summary,
        "key_points": key_points,
        "tags": tags,
        # ⚠ 这一栏必须跟着走（N9 真正咬人的那一处）。云函数认不出模型回体时走的是它自己的兜底
        # （标题"未命名笔记"＋摘要原文前 500 字＋要点标签空），那是一份**合法 JSON**，
        # 于是 `:196` 把它交给这里重拼四栏——原来只拼四栏，`degraded` 就在这一步被丢掉，
        # 外面 `setdefault("degraded", False)` 再补一个 False ⇒ 库里记成"提炼成功"。
        "degraded": bool(result.get("degraded", False)),
    }


# ────────────── 站名识别（①默认乙：四级链最后那一发，方案 `docs/方案-来源站点名.md` 第三节） ──────────────
# 为什么这一发**单独一条云函数**而不是在 `extract` 那条里加一个分支：
# 那条函数的文件头写着"契约：文本进 → 4 字段 JSON 出，不含业务分支"，而站名要回的是另一个形状
# （一个名字，不是四栏）。塞进去的代价不是报错，是那条契约以后没人敢信——
# 而 `extract_knowledge` 的调用方正是靠这条契约把回体按四栏重拼的（上面 `_parse_response` 那段）。
#
# 为什么**重试一次都不做**：这一枚值排在"这篇存不存得下"之后、且失败只损失一个名字。
# 提炼那一路重试三次是因为摘要没了用户看得见；站名没了屏上退到通用那档，用户看不出缺了什么。
# 拿 1+2+4 秒的退避去换一枚可有可无的名字，是把 worker 那一条队列按住了陪等。
SITE_NAME_PROMPT = (
    "你是一名网站识别器。输入是一个网页的域名、标题和开头几句，"
    "你要回答这个页面属于哪一家网站/哪个平台。\n"
    '只输出一个 JSON 对象，形如 {"site_name": "站点名"}。\n'
    "硬性要求：\n"
    "1. 站点名只写这一家的名字，**不要**加「文章」「平台」「网站」「笔记」这类后缀；\n"
    "2. 用这个平台自己最常用的中文名叫法；纯英文平台保留英文原名；\n"
    "3. 拿不准就输出 {\"site_name\": \"\"}。不许猜一个相近的名字，也不许多输出任何字段。"
)


async def site_channel_ready() -> bool:
    """第 4 级这一发能不能发。三道闸：provider 没关、那条函数的地址配了、那把凭据不是占位符。

    与 `note_images.channel_ready` 同一条口径：**代码可以先上现网，`.env` 里那一行加上才算开工**，
    没配就是整级跳过、一次出网都不发。

    ⚠ **这一句与 `guess_site_name` 必须同源**（第九轮审计 Y3）：两边都走
    `service_secrets.resolve`（库优先、`.env` 兜底），而且是**同一句 resolve**。
    以前这里只读 `.env`，于是"把凭据存进后台「密钥配置」、再把 `.env` 那一行删掉"这条路
    会让提炼照常工作、第四级**整级静默关**、一行日志都不打——那一页存在的理由就是不重启换钥匙，
    所以这条路早晚有人走。
    仍然不进事件循环：查库甩进 `to_thread`（10-25 第八轮审计 M2 那一型，改的是取数来源不是跑法）。
    """
    provider = (settings.EXTRACT_PROVIDER or PROVIDER_HUNYUAN_CF).strip()
    if provider != PROVIDER_HUNYUAN_CF:
        return False
    if not (settings.SITE_NAME_CF_URL or "").strip():
        return False
    key = (await asyncio.to_thread(
        service_secrets.resolve, "HUNYUAN_CF_KEY", settings.HUNYUAN_CF_KEY) or "").strip()
    return key_usable(key)


async def guess_site_name(host: str, title: str = "", snippet: str = "") -> str:
    """问模型"这是哪家"，回一个名字；任何不对都回空串（调用方退到"这一篇没有站名"）。

    ⚠ 这一句**不许抛**：调用它的是外链转存那一趟的最后一步，把一次本来成功的转存
    变成一个失败的任务，是拿整篇换一枚名字（方案第三节那条硬约束第 2 条）。
    所以这里连 HTTP 状态码都不往上抛——非 2xx、非 JSON、回体形状不对，一律空串＋一行日志。
    """
    url = (settings.SITE_NAME_CF_URL or "").strip()
    key = (await asyncio.to_thread(
        service_secrets.resolve, "HUNYUAN_CF_KEY", settings.HUNYUAN_CF_KEY) or "").strip()
    if not url or not key_usable(key):
        return ""
    payload = {
        "system_prompt": SITE_NAME_PROMPT,
        "host": host,
        "title": title,
        "snippet": snippet,
    }
    try:
        async with httpx.AsyncClient(timeout=settings.SITE_NAME_CF_TIMEOUT) as client:
            resp = await client.post(
                url, json=payload,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            )
        if resp.status_code >= 400:
            logger.info("站名那一发没成（HTTP %s），这一篇就退到没有站名", resp.status_code)
            return ""
        data = resp.json()
    except Exception as exc:
        logger.info("站名那一发没成（%s），这一篇就退到没有站名", type(exc).__name__)
        return ""
    if not isinstance(data, dict):
        return ""
    name = data.get("site_name")
    return name.strip() if isinstance(name, str) else ""
