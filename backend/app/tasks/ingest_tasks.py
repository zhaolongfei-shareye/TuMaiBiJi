import asyncio
import logging

from app.core.errors import UserError
from app.db.database import SessionLocal
from app.models.note import Note
from app.models.user import User
from app.services import quota
from app.services.ocr import ocr_images, title_hint
from app.services.scraper import scrape_url
from app.services.llm import extract_knowledge
from app.services.queue import set_task_status

logger = logging.getLogger(__name__)

# 任务失败时这个字段会被前端直接塞进 toast，所以宁可笼统，也不要英文栈/onnxruntime/依赖名
GENERIC_TASK_ERROR = "处理失败，请重新提交试试"


def failure_message(exc: Exception) -> str:
    """只有 UserError 的文案是写给用户的；其余异常原文只进日志。"""
    return str(exc) if isinstance(exc, UserError) else GENERIC_TASK_ERROR


def credit_first_note(db, user_id: str, note: Note) -> None:
    """worker 这边也是"写下笔记"的一条路，邀请奖励同样要在这一条上结。

    到账失败不该让整条笔记算处理失败——笔记已经落库了，用户看到的必须是成功。
    """
    try:
        user = db.get(User, int(user_id))
        if user is not None:
            quota.credit_first_note(note, db, user)
    except Exception:
        logger.exception("邀请奖励到账失败（笔记已保存）：user=%s", user_id)


def _load_task_user(db, task_id: str, user_id: str, generation):
    """把队列里的 (user_id, generation) 换回一个"确实还是提交任务那个人"的 User。

    generation 是这里的关键。SQLite 的 INTEGER PRIMARY KEY 会复用已删除行的 id，
    所以"这个 id 上有人"不等于"还是原来那个人"：A 提交任务后注销、B 注册拿到同一个
    id，少了这层校验，A 抓回来的网页内容就会出现在 B 的笔记列表里。

    返回 None 表示任务就地终止，状态已经写好。generation 为 None 是部署切换期里
    旧代码入队的存量 job——那批 job 拿不到代数，只能退回"人还在就写"。
    """
    user = db.get(User, int(user_id))
    if user is None:
        logger.warning("用户已注销，放弃保存笔记：user_id=%s task=%s", user_id, task_id)
        set_task_status(task_id, "failed", {"error": "账号已注销，无法保存笔记"})
        return None
    if generation is None:
        logger.warning("存量 job 未带账号代数，跳过串号校验：user_id=%s task=%s", user_id, task_id)
        return user
    if user.generation != generation:
        logger.warning(
            "user_id=%s 已被新账号复用（队列 gen=%s，库里 gen=%s），放弃保存笔记：task=%s",
            user_id, generation, user.generation, task_id,
        )
        set_task_status(task_id, "failed", {"error": "账号已变更，无法保存笔记"})
        return None
    return user


def process_url_task(task_id: str, user_id: str, url: str, generation: int | None = None):
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
            user = _load_task_user(db, task_id, user_id, generation)
            if user is None:
                return
            # 落库前再查一次额度：提交时那道闸门到这儿已经过去了几十秒（抓取 + 提炼），
            # 中间用户可能又手写了几篇。UserError 会冒到下面那个 except，文案原样进 toast。
            quota.ensure_room(user, db)

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
            credit_first_note(db, user_id, note)
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


def process_screenshots_task(task_id: str, user_id: str, images_data: list[bytes], generation: int | None = None):
    """RQ worker 同步任务：OCR → LLM 提取 → 写入数据库。"""
    try:
        set_task_status(task_id, "processing")

        ocr_text = asyncio.run(ocr_images(images_data))
        if not ocr_text.strip():
            set_task_status(task_id, "failed", {"error": "OCR 未识别到文字内容"})
            return

        knowledge = asyncio.run(extract_knowledge(ocr_text, fallback_title=title_hint(ocr_text)))

        db = SessionLocal()
        try:
            user = _load_task_user(db, task_id, user_id, generation)
            if user is None:
                return
            quota.ensure_room(user, db)

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
            credit_first_note(db, user_id, note)
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
