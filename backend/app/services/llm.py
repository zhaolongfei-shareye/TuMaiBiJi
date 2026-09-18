import asyncio
import json
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
MAX_RETRIES = 3
INITIAL_BACKOFF = 1.0

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
    """调用 DeepSeek API 提取结构化知识，返回 {title, summary, key_points, tags}。
    
    包含重试逻辑：对 429（限流）、5xx（服务器错误）、超时自动重试，
    最多重试 MAX_RETRIES 次，使用指数退避策略。
    """
    if not settings.DEEPSEEK_API_KEY:
        raise ValueError("DeepSeek API Key 未配置，请设置 DEEPSEEK_API_KEY")

    user_content = text
    if len(user_content) > 12000:
        user_content = user_content[:12000] + "\n\n[...内容过长，已截断...]"

    if fallback_title:
        user_content = f"参考标题：{fallback_title}\n\n{user_content}"

    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{DEEPSEEK_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "deepseek-chat",
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": user_content},
                        ],
                        "temperature": 0.3,
                        "max_tokens": 2000,
                    },
                )
                
                if resp.status_code == 429:
                    raise httpx.HTTPStatusError(
                        "Rate limit exceeded", request=resp.request, response=resp
                    )
                if resp.status_code >= 500:
                    raise httpx.HTTPStatusError(
                        f"Server error: {resp.status_code}", 
                        request=resp.request, 
                        response=resp
                    )
                
                resp.raise_for_status()
                data = resp.json()
                
                content = data["choices"][0]["message"]["content"]
                return _parse_response(content, fallback_title)
                
        except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
            last_error = e
            if attempt < MAX_RETRIES:
                backoff = INITIAL_BACKOFF * (2 ** attempt)
                logger.warning(
                    "LLM API 请求失败 (attempt %d/%d): %s，%0.1f 秒后重试",
                    attempt + 1, MAX_RETRIES + 1, str(e), backoff
                )
                await asyncio.sleep(backoff)
            else:
                logger.error("LLM API 请求在 %d 次尝试后最终失败: %s", MAX_RETRIES + 1, str(e))
                raise
        except Exception as e:
            logger.error("LLM API 请求遇到非重试错误: %s", str(e))
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
        return {
            "title": fallback_title or "未命名笔记",
            "summary": content[:500],
            "key_points": [],
            "tags": [],
        }

    # Validate structure and types
    if not isinstance(result, dict):
        return {
            "title": fallback_title or "未命名笔记",
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
