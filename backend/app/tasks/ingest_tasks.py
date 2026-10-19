import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone

from app.core.errors import UserError
from app.db.database import SessionLocal
from app.models.asset import MAX_ASSETS_PER_NOTE
from app.models.note import Note
from app.models.user import User
from app.models.user_profile import UserProfile
from app.services import note_images
from app.services import quota
from app.services import source_blocklist
from app.services.ocr import ocr_images, title_hint
from app.services.scraper import SiteHttpError, scrape_url
from app.services.llm import extract_knowledge
from app.services.queue import set_task_status

logger = logging.getLogger(__name__)

# 任务失败时这个字段会被前端直接塞进 toast，所以宁可笼统，也不要英文栈/onnxruntime/依赖名
GENERIC_TASK_ERROR = "处理失败，请重新提交试试"


def _blocked(url: str) -> bool:
    """提取之前先查一次来源黑名单。命中＝一个字都不出网，这正是这条功能存在的理由（规格 §四）。

    session 在这三行里开、在三行里关，**不横跨那次抓取**：一次抓取最长 30 秒还带 5 跳，
    握着一个 SQLite 读连接等外网等于把 WAL 那扇窗口替全网用户开着。

    ⚠ 读不出来按"没拦"处理，而且不许静默。这张表要靠迁移建，而这一台机器上"代码先上、
    迁移后跑"是已经走过的形状（10-18 第三十九次部署点的就是那条「乙」）。
    让这一句抛出去，症状是**每一条链接提取一起失败**——一条本来好得很的链被一个
    还没上线的附属功能判死，那比黑名单失灵严重得多。日志里那一行的读者是操作者。
    """
    try:
        db = SessionLocal()
        try:
            return source_blocklist.is_blocked_url(db, url)
        finally:
            db.close()
    except Exception:
        logger.exception("来源黑名单读不出来，这一条按没拦处理：url=%s", url)
        return False


def _note_site_failure(url: str, status_code: int | None) -> None:
    """站点级确定性失败才进这里。全仓只有两个落点（见 `process_url_task`），规格 §三① 那条纪律的落地：
    提炼失败／超时连不上／worker 挂了／单张贴图下载失败**一条都不许接进来**。

    记账自己坏了不许把这次抓取也判失败：那句真话已经由 `raise` 或那句"未能从 URL 提取到有效内容"
    说给用户了，这里再抛只会把"存不下"变成"我们的黑名单把用户的事也搞砸了"。
    """
    try:
        db = SessionLocal()
        try:
            source_blocklist.note_site_failure(db, url, status_code)
        finally:
            db.close()
    except Exception:
        logger.exception("来源黑名单记账失败（不影响这一次抓取的结论）：url=%s", url)


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


# 认不出字那一趟自动起的标题（站长 10-19 的原话形状）：「阿麦图片笔记 101901」。
IMAGE_NOTE_FALLBACK_NAME = "我的"
IMAGE_NOTE_TAIL = re.compile(r"图片笔记 (\d{4})(\d{2,})$")
CN_TZ = timezone(timedelta(hours=8))


def _cn_day_window(now: datetime) -> tuple[datetime, datetime, str]:
    """把"今天"折算成库里那把尺子：北京日的起止，用朴素 UTC 表示。

    现网这一台是 SQLite，`created_at` 由 `func.now()` 写成**朴素 UTC**（实测：北京 11:03 存的那篇
    库里是 `03:03:57`）。所以按北京时间切的窗口要先减 8 小时再拿 naive 去比——把一个带 +08:00 的
    aware datetime 塞进 SQLite 会存成一串带偏移的文本，字符串比较当场错位。
    折算写法照 `services/report_ledger.py` 那一处，同一个口径不许有两把尺子。
    """
    midnight_cn = now.astimezone(CN_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    start = (midnight_cn - timedelta(hours=8)).replace(tzinfo=None)
    return start, start + timedelta(days=1), midnight_cn.strftime("%m%d")


def _owner_name(db, user_id: str, user) -> str:
    """标题前缀那一格的三级兜底：名片名称 → 微信昵称 → 固定词「我的」。

    最后一级为什么不落 openid／账号 id 之类的东西：那是标识符不是名字，进标题等于把他的 id
    印在自己每篇笔记的第一行。他 10-19 点的是"空了用固定词垫上"，所以这一格永不为空。
    """
    row = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    for candidate in ((row.name if row else None), user.nickname):
        name = (candidate or "").strip()
        if name:
            return name
    return IMAGE_NOTE_FALLBACK_NAME


def _image_note_title(db, user_id: str, user, now: datetime) -> str:
    r"""`{名称}图片笔记 {MMDD}{序号}`，序号＝**当天这一族已有的最大尾号 +1**。

    取最大而不数行数：数行数在"删掉一篇再存"时会把已有那篇的号重新发一遍，屏上出现两行逐字
    同名（他点的正是"扫当天已有尾号取最大"）。尾号只从标题尾巴那串数字读，所以他手动改出来的
    号也算得进去——宁可往后跳一号，也不发重号。第 100 篇起 `:02d` 自然变三位（`1019100`），
    那条 `\d{2,}` 接得住。
    """
    start, end, mmdd = _cn_day_window(now)
    highest = 0
    for (title,) in db.query(Note.title).filter(
        Note.user_id == user_id,
        Note.source_type == "screenshot",
        Note.created_at >= start,
        Note.created_at < end,
    ).all():
        found = IMAGE_NOTE_TAIL.search(title or "")
        if found and found.group(1) == mmdd:
            highest = max(highest, int(found.group(2)))
    return f"{_owner_name(db, user_id, user)}图片笔记 {mmdd}{highest + 1:02d}"


def _source_snapshot(scraped: dict, url: str) -> dict | None:
    """把"这篇是从谁那儿来的"钉一份快照进 `notes.imported_from`。

    键名与转存那一路**逐字同名**（`routes/notes.py` 的 `import_from_share` 写的那六个），
    因为读的那一头本来就只认这个名字：`_attach_share_marks` 取 `imported.get("author_name")`。
    对不上物的三键（`share_token`／`source_note_id`／`author_user_id`）**干脆不写**——
    塞空串或 0 等于多造一种"画了个空名字"的态（方案第五节第 2 项）。
    取不到作者名就整份不写：宁可不带来源，也不拿站名之类的东西去填那一格。
    """
    author = (scraped.get("author") or "").strip()
    if not author:
        return None
    return {
        "author_name": author[:200],
        "title_at_import": (scraped.get("title") or "")[:500],
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "source_url": url[:1000],
    }


def _archive_images(db, note, scraped: dict, user_id) -> dict | None:
    """正文里的图存进桶、账落进 `assets`，回一份给界面上那两句实话读的计数。

    三条口径：
    ① **排在建笔记之后**（可重来的那几步排在唯一会失败的那步之后，这是这台机器上定过的规矩）——
       存图整段炸了也只进日志，绝不把这次转存判成失败，摘要照出、笔记照在；
    ② 通道没配（`.env` 里那两行 IMAGE_STORE_CF_* 缺一）就整段不做，回 None，
       屏上一句都不报——"这一版还没开始存图"与"这篇文章的图存不下"是两件事，不许混成一句；
    ③ 张数上限读 `MAX_ASSETS_PER_NOTE` 那一枚常量，不在这里重打一个 9。
    """
    images = [u for u in (scraped.get("images") or []) if u]
    if not images or not note_images.channel_ready():
        return None
    written = 0

    def _booked(shot):
        # 一张传完就落一行（见 note_images.archive 那段顺序注释）：崩在第五张时前四张已经有账，
        # 不再是"桶里有对象、库里没行"的孤儿。
        nonlocal written
        written += note_images.register(db, note, [shot])

    try:
        result = asyncio.run(note_images.archive(
            images, user_id, MAX_ASSETS_PER_NOTE, on_ready=_booked))
    except Exception:
        logger.exception("贴图整段没跑成（笔记已保存）：note=%s", note.id)
        return None
    counts = {
        "images_total": result.total,
        # 屏上那句"只留下了前 {k} 张"数的是**这次真存进桶的张数**，不是新写了几行 `assets`：
        # 同一个 job 被重跑时 `register()` 会按 object_key 幂等跳过（回 0），
        # 拿 `written` 当 k 就会对着一堆看得见的图说"留下了 0 张"。
        "images_kept": len(result.kept),
        "images_failed": len(result.failed),
        "images_truncated": result.truncated,
    }
    if written != len(result.kept):
        logger.info("贴图登记幂等命中：本次存下 %d 张、新写 %d 行", len(result.kept), written)
    # 计数钉在来源那份快照里：它记的就是"转存那一刻那篇原文长什么样"，
    # 而详情页读的是同一份（`NoteDetail.imported_from`），不必为它新建列。
    # 注意 `has_source` 判的是那份快照里**有没有作者名**，不是快照在不在——
    # 所以"没有名字、只有计数"这一态不会在屏上画出一个空名字。
    if isinstance(note.imported_from, dict):
        note.imported_from = {**note.imported_from, **counts}
    else:
        note.imported_from = dict(counts)
    db.commit()
    return counts


def process_url_task(task_id: str, user_id: str, url: str, generation: int | None = None,
                     translate: bool | None = None):
    """RQ worker 同步任务：抓取 URL → LLM 提取 → 写入数据库。

    `translate` 排在最后一位（与 /url 那条 enqueue 同一个理由：老 job 不带这一位，插中间会挪 generation）。
    None＝不给提示词加"输出语言"那一段，与这一刀之前的行为逐字相同；True/False 才表态。
    """
    try:
        set_task_status(task_id, "processing")

        # 命中黑名单就到此为止：不发 HTTP、不起提炼。用户那句「这个网站读不到内容，已停用」
        # 是这一格唯一要说的话（规格 §四），它比"试一下再说"省下的是一整趟外网＋一次模型调用。
        if _blocked(url):
            set_task_status(task_id, "failed", {"error": source_blocklist.BLOCKED_HINT})
            return

        try:
            scraped = asyncio.run(scrape_url(url))
        except SiteHttpError as exc:
            # 计入的那一型之一：站点自己回了 4xx／5xx（实测形状＝知乎 403 + 反爬页）。
            _note_site_failure(url, exc.status_code)
            raise
        text = scraped["content"]
        if not text.strip():
            # 计入的另一型：200 但正文读出 0 字（实测形状＝微博那种访客壳页）。
            # `status_code` 用 `.get()` 读——fake 出来的抓取回体没有这一键，缺它只是那个数空着。
            _note_site_failure(url, scraped.get("status_code"))
            set_task_status(task_id, "failed", {"error": "未能从 URL 提取到有效内容"})
            return

        knowledge = asyncio.run(extract_knowledge(text, fallback_title=scraped["title"], translate=translate))

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
                imported_from=_source_snapshot(scraped, url),
            )
            db.add(note)
            db.commit()
            db.refresh(note)
            credit_first_note(db, user_id, note)
            # 贴图排在这一切之后：它是这条链上唯一会失败、且失败了也不该影响笔记的那一步。
            counts = _archive_images(db, note, scraped, user_id)
            payload = {"note_id": note.id, "title": note.title,
                       "degraded": bool(knowledge.get("degraded"))}
            if counts:
                payload.update(counts)
            set_task_status(task_id, "completed", payload)
        finally:
            db.close()

    except Exception as e:
        logger.exception("URL 任务失败: %s: %s", type(e).__name__, e)
        set_task_status(task_id, "failed", {"error": failure_message(e)})


def process_screenshots_task(task_id: str, user_id: str, images_data: list[bytes],
                             generation: int | None = None, translate: bool | None = None):
    """RQ worker 同步任务：OCR → LLM 提取 → 写入数据库。

    `translate` 与 /url 那条同义：None＝不表态（今天的样子），True/False 才给提示词加那一段"输出语言"。
    站长 10-16「图片识别英文，不是也可以翻译吗」——OCR 出来的字与手打的字进的是同一个提炼，
    所以这一位一接上，界面上那枚开关就管得着照片这一档。
    """
    try:
        set_task_status(task_id, "processing")

        ocr_text = asyncio.run(ocr_images(images_data))
        if not ocr_text.strip():
            # 站长 10-19「图片提炼无法识别文字不要直接报错，直接降档为贴图笔记，标题默认提取用户名称，
            # 组装成名称+图片笔记+日期+序号」。改之前这一格是 `failed` ＋「OCR 未识别到文字内容」，
            # 真正的代价不在那句红字上，在**图也一起没了**：客户端那条 B 链拿不到 note_id 就走
            # `_settleBackup(null, …)`，把刚传进云的原件当孤儿删掉（pages/create/create.js:1002）。
            # 现在照建一篇，正文／摘要／要点三格留空（`notes` 表里三列都可空，只有 title 非空），
            # 标题由 `_image_note_title` 现读名称与当天尾号组装。
            # 图不在这条链上：它由客户端并行传完再 bind，服务端不知道那批图最后成没成，也不猜——
            # 云没配那台上照旧会建出一篇只有标题的笔记，这与今天"提炼成功但云没配"是同一个形状。
            db = SessionLocal()
            try:
                user = _load_task_user(db, task_id, user_id, generation)
                if user is None:
                    return
                note = Note(
                    user_id=user_id,
                    title=_image_note_title(db, user_id, user, datetime.now(timezone.utc)),
                    source_type="screenshot",
                )
                db.add(note)
                db.commit()
                db.refresh(note)
                credit_first_note(db, user_id, note)
                # `image_only` 是给判据与探针读的那一枚：认不出字建的这篇和"LLM 不可用、原文照存"
                # 那一篇是两件事，不许挤在同一个 `degraded` 标记里（那一枚说的是提炼，不是识字）。
                set_task_status(task_id, "completed",
                                {"note_id": note.id, "title": note.title, "image_only": True})
            finally:
                db.close()
            return

        knowledge = asyncio.run(extract_knowledge(
            ocr_text, fallback_title=title_hint(ocr_text), translate=translate))

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
