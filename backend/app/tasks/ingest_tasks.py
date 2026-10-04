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


def process_manual_text_task(task_id: str, user_id: str, title: str, content: str,
                             category_id: int | None = None, generation: int | None = None,
                             translate: bool = False):
    """RQ worker 同步任务：手打的原文 → LLM 提炼 → 写入数据库。

    和 URL／截图两条只差两件事：① 标题用用户自己打的那个，不用模型另起的
    （他要的是"我给标题和原文，模型补提要"——屏幕上那一格叫「摘要」，字段是 summary，
    模型那份只当 fallback）；
    ② 归类是他当场挑的，所以要落 category_id。
    正文落 original_content、摘要是 summary —— 与另外两条同一份形状，详情页那三块
    （摘要 / 要点 / 原文）才不用为这一种来源特判。

    `translate` 排在这个签名的最后一位：RQ 的 job 带的是位置参数列表，队列里还躺着
    上一版入队的任务（不带这一位）。放中间会让老 job 的 generation 读到 translate 的
    位置、这一位反而空着——A6 那次串号就是这么来的。放最后，老 job 只会拿到默认值 False。
    """
    try:
        set_task_status(task_id, "processing")

        knowledge = asyncio.run(extract_knowledge(content, fallback_title=title, translate=translate))

        db = SessionLocal()
        try:
            user = _load_task_user(db, task_id, user_id, generation)
            if user is None:
                return
            note = Note(
                user_id=user_id,
                title=title,
                summary=knowledge["summary"],
                key_points=knowledge["key_points"],
                tags=knowledge["tags"],
                original_content=content[:50000],
                source_type="manual",
                category_id=_still_yours_category(db, user_id, category_id),
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
        logger.exception("手打提炼任务失败: %s: %s", type(e).__name__, e)
        set_task_status(task_id, "failed", {"error": failure_message(e)})


def _still_yours_category(db, user_id: str, category_id: int | None) -> int | None:
    """挑分类到落库中间隔着十几秒，那一格可能已被删掉。

    归属在入队前已经查过一遍，这里只防"删了分类结果整篇笔记失败"——分类没了就当未分类，
    不拿这个去报废一次提炼。
    """
    if category_id is None:
        return None
    from app.models.category import Category

    found = (
        db.query(Category.id)
        .filter(Category.id == category_id, Category.user_id == str(user_id))
        .first()
    )
    return category_id if found else None
