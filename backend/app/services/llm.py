import json

import httpx

from app.core.config import settings

DEEPSEEK_BASE_URL = "https://api.deepseek.com"

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
    """调用 DeepSeek API 提取结构化知识，返回 {title, summary, key_points, tags}。"""
    if not settings.DEEPSEEK_API_KEY:
        raise ValueError("DeepSeek API Key 未配置，请设置 DEEPSEEK_API_KEY")

    user_content = text
    if len(user_content) > 12000:
        user_content = user_content[:12000] + "\n\n[...内容过长，已截断...]"

    if fallback_title:
        user_content = f"参考标题：{fallback_title}\n\n{user_content}"

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
        resp.raise_for_status()
        data = resp.json()

    content = data["choices"][0]["message"]["content"]
    return _parse_response(content, fallback_title)


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

    return {
        "title": result.get("title") or fallback_title or "未命名笔记",
        "summary": result.get("summary", ""),
        "key_points": result.get("key_points", []),
        "tags": result.get("tags", []),
    }
