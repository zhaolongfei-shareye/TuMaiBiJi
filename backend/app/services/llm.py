import asyncio
import json
import logging
import re

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
INITIAL_BACKOFF = 1.0

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


async def extract_knowledge(text: str, fallback_title: str = "") -> dict:
    """提炼结构化知识；提炼能力不可用时自动降级，绝不让整条采集任务失败。

    返回 dict 含 title/summary/key_points/tags；降级时附带 degraded=True，
    便于任务结果里区分「采集失败」与「只是没提炼」。
    """
    try:
        result = await _call_llm(text, fallback_title)
        result.setdefault("degraded", False)
        return result
    except Exception as e:
        logger.warning("提炼不可用，降级为原文入库：%s: %s", type(e).__name__, e)
        return _degraded(text, fallback_title)


def _build_user_content(text: str, fallback_title: str) -> str:
    content = text
    if len(content) > 12000:
        content = content[:12000] + "\n\n[...内容过长，已截断...]"
    if fallback_title:
        content = f"参考标题：{fallback_title}\n\n{content}"
    return content


async def _call_llm(text: str, fallback_title: str = "") -> dict:
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

    return await _call_hunyuan_cloud_function(text, fallback_title)


async def _call_hunyuan_cloud_function(text: str, fallback_title: str) -> dict:
    url = (settings.HUNYUAN_CF_URL or "").strip()
    key = (settings.HUNYUAN_CF_KEY or "").strip()

    if not url:
        raise RuntimeError("HUNYUAN_CF_URL 未配置，无法调用提炼云函数")
    if not key_usable(key):
        raise RuntimeError("HUNYUAN_CF_KEY 未配置或仍为占位符，请设置云函数触发凭据")

    payload = {
        "text": _build_user_content(text, fallback_title),
        "fallback_title": fallback_title,
        "system_prompt": SYSTEM_PROMPT,
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
        title = (fallback_title or "未命名笔记").strip()[:500]
        return {
            "title": title,
            "summary": content[:500],
            "key_points": [],
            "tags": [],
        }

    # Validate structure and types
    if not isinstance(result, dict):
        title = (fallback_title or "未命名笔记").strip()[:500]
        return {
            "title": title,
            "summary": content[:500],
            "key_points": [],
            "tags": [],
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
    }
