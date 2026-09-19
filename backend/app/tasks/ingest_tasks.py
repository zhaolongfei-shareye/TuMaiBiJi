import asyncio
import logging

from app.core.errors import UserError
from app.db.database import SessionLocal
from app.models.note import Note
from app.services.ocr import ocr_images
from app.services.scraper import scrape_url
from app.services.llm import extract_knowledge
from app.services.queue import set_task_status

logger = logging.getLogger(__name__)

# 任务失败时这个字段会被前端直接塞进 toast，所以宁可笼统，也不要英文栈/onnxruntime/依赖名
GENERIC_TASK_ERROR = "处理失败，请重新提交试试"


def failure_message(exc: Exception) -> str:
    """只有 UserError 的文案是写给用户的；其余异常原文只进日志。"""
    return str(exc) if isinstance(exc, UserError) else GENERIC_TASK_ERROR


def process_url_task(task_id: str, user_id: str, url: str):
    """RQ worker 同步任务：抓取 URL → LLM 提取 → 写入数据库。"""
    try:
        set_task_status(task_id, "processing")

        scraped = asyncio.run(scrape_url(url))
        text = scraped["content"]
        if not text.strip():
            set_task_status(task_id, "failed", {"error": "未能从 URL 提取到有效内容"})
            return

        knowledge = asyncio.run(extract_knowledge(text, fallback_title=scraped["title"]))

        db = SessionLocal()
        try:
            note = Note(
                user_id=user_id,
                title=knowledge["title"],
                summary=knowledge["summary"],
                key_points=knowledge["key_points"],
                tags=knowledge["tags"],
                original_content=text[:50000],
                source_type=scraped["source_type"],
                source_url=url,
            )
            db.add(note)
            db.commit()
            db.refresh(note)
            set_task_status(
                task_id,
                "completed",
                {"note_id": note.id, "title": note.title, "degraded": bool(knowledge.get("degraded"))},
            )
        finally:
            db.close()

    except Exception as e:
        logger.exception("URL 任务失败: %s: %s", type(e).__name__, e)
        set_task_status(task_id, "failed", {"error": failure_message(e)})


def process_screenshots_task(task_id: str, user_id: str, images_data: list[bytes]):
    """RQ worker 同步任务：OCR → LLM 提取 → 写入数据库。"""
    try:
        set_task_status(task_id, "processing")

        ocr_text = asyncio.run(ocr_images(images_data))
        if not ocr_text.strip():
            set_task_status(task_id, "failed", {"error": "OCR 未识别到文字内容"})
            return

        knowledge = asyncio.run(extract_knowledge(ocr_text))

        db = SessionLocal()
        try:
            note = Note(
                user_id=user_id,
                title=knowledge["title"],
                summary=knowledge["summary"],
                key_points=knowledge["key_points"],
                tags=knowledge["tags"],
                original_content=ocr_text[:50000],
                source_type="screenshot",
            )
            db.add(note)
            db.commit()
            db.refresh(note)
            set_task_status(
                task_id,
                "completed",
                {"note_id": note.id, "title": note.title, "degraded": bool(knowledge.get("degraded"))},
            )
        finally:
            db.close()

    except Exception as e:
        logger.exception("截图任务失败: %s: %s", type(e).__name__, e)
        set_task_status(task_id, "failed", {"error": failure_message(e)})
