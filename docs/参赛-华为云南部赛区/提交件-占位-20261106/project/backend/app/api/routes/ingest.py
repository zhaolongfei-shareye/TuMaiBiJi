import asyncio
import logging
import time
import uuid

from typing import Annotated, Optional

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.category import Category
from app.models.user import User
from app.core.auth import get_current_user
from app.core.errors import UserError
from app.core.rate_limit import limiter
from app.api.routes.notes import MAX_BODY, MAX_TITLE, MAX_URL
from app.services.queue import get_queue, set_task_status
from app.services import daily_budget
from app.services.wechat import check_image, enforce_text_safety

logger = logging.getLogger(__name__)

router = APIRouter()

_batch_staging: dict[str, dict] = {}


@router.post("/url")
@limiter.limit("10/minute")
async def ingest_url(
    request: Request,
    url: str = Form(..., max_length=MAX_URL),
    # 站长 10-16「把原文翻译的开关…三个tab全局都可用」⇒ 抓取这一条也要带这一位。
    # 默认**必须是 None 不是 False**：None＝提示词里连"输出语言"那一段都不写＝今天的样子；
    # 写成 False 就成了"明确要求跟随原文语言"，那些不带这一位的老包（2.2.x 及以前）会当场变味。
    translate: Optional[bool] = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task_id = uuid.uuid4().hex
    # 10-25 第八轮审计 M33：每人每天 50 条提炼，档位读 `settings.EXTRACT_DAILY_LIMIT`。
    # 记在**门口**而不是记在花钱那一刻——一次提炼内部最多打四趟上游（`llm.MAX_RETRIES`），
    # 按上游次数记账会让"50 条"变成没人看得懂的数；按请求条数记才与站长那句话对得上。
    # `charge` 里是同步 DB 写，这一口是 `async def` ⇒ 按 M2 那条纪律甩进工作线程。
    budget = await asyncio.to_thread(
        daily_budget.charge, str(user.id), daily_budget.KIND_EXTRACT
    )
    if not budget.ok:
        raise HTTPException(status_code=429, detail=budget.message)
    # 10-25 第八轮审计 M2：这一口是 `async def`，而"登记 queued"与"推进队列"两趟都要真打 Redis。
    # 留在循环里，Redis 慢的那几百毫秒是**全站**（含 /health）一起排队，所以两步各裹一次工作线程。
    # 替身仍挂在 `get_queue`／`set_task_status` 这两枚名字上（三处录入用例都靠它们），别改成整块搬走。
    await asyncio.to_thread(set_task_status, task_id, "queued", user_id=str(user.id))
    await asyncio.to_thread(
        get_queue().enqueue,
        "app.tasks.ingest_tasks.process_url_task",
        task_id,
        str(user.id),
        url,
        user.generation,
        # 排在最后一位，理由同 /text 那条：队列里的 job 按位置绑定，插中间会把 generation 挪位。
        translate,
        job_id=task_id,
        job_timeout=600,
    )
    return {"status": "queued", "task_id": task_id}


class IngestTextIn(BaseModel):
    # 两个上限从 notes 路由现读，不在这里重打一遍数：MAX_BODY 是和内容安全的
    # 送检窗口（wechat.SEC_CHUNK × SEC_MAX_CHUNKS）对齐钉的，抄一份就会有两处真相。
    title: Annotated[str, Field(min_length=1, max_length=MAX_TITLE)]
    content: Annotated[str, Field(min_length=1, max_length=MAX_BODY)]
    category_id: Optional[int] = None
    # 站长 10-04：贴纯英文原文时摘要别自动变中文，界面上给一枚「原文翻译」开关，默认关。
    # 默认值就写 False：老版本客户端（1.9.24 及以前）不带这个字段，落到"不翻译"正是他要的
    # 新默认，不需要为旧客户端留第二条分支。
    translate: bool = False


@router.post("/text")
@limiter.limit("10/minute")
async def ingest_text(
    request: Request,
    payload: IngestTextIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """手打这一档也走提炼：用户给标题 + 原文，摘要由模型出。

    与 /url、/screenshots/process 唯一多出来的一步，是入队前先把这两段字过内容安全。
    worker 落库那条路不经过 notes 的 `_guard_manual_text`（那道闸按 source_type=manual
    才检，而它只在 HTTP 建笔记时跑），所以这一趟漏了就没有第二处会检——创建分享那道
    只管"要公开"那一刻。截图那条**不在这里检**、改在 worker 里检（站长 10-22「接吧」，
    见 `ingest_tasks._guard_screenshot_text`：那段字要等 OCR 跑完才存在，HTTP 这一刻手上只有图）；
    URL 抓取那条原文仍然不检（他 10-03 那句口径的这一半没撤，公开那一刻由 shares 那道闸兜）。
    """
    title = payload.title.strip()
    content = payload.content.strip()
    if not title or not content:
        raise HTTPException(status_code=400, detail="标题和原文都要填")

    if payload.category_id is not None:
        category = (
            db.query(Category)
            .filter(Category.id == payload.category_id, Category.user_id == str(user.id))
            .first()
        )
        if not category:
            raise HTTPException(status_code=400, detail="分类不存在或无权使用")

    # M33 两档的顺序是定的：提炼那一档先判。额度已经用完时不必再花一次送检——
    # 与分类/名片那道"要被打回的请求不该花真额度"是同一条纪律。
    budget = await asyncio.to_thread(
        daily_budget.charge, str(user.id), daily_budget.KIND_EXTRACT
    )
    if not budget.ok:
        raise HTTPException(status_code=429, detail=budget.message)

    try:
        sec = await asyncio.to_thread(
            daily_budget.charge, str(user.id), daily_budget.KIND_SEC_CHECK
        )
        if not sec.ok:
            raise HTTPException(status_code=429, detail=sec.message)
        enforce_text_safety(user.openid, title, content)
    except UserError as e:
        raise HTTPException(status_code=400, detail=str(e))

    task_id = uuid.uuid4().hex
    # 两步都挪出事件循环，理由与位置绑定那条口径见 `/url` 那一处（M2 同一刀）。
    await asyncio.to_thread(set_task_status, task_id, "queued", user_id=str(user.id))
    await asyncio.to_thread(
        get_queue().enqueue,
        "app.tasks.ingest_tasks.process_manual_text_task",
        task_id,
        str(user.id),
        title,
        content,
        payload.category_id,
        user.generation,
        # 这一位排在最后：队列里的 job 是按位置绑定的，正在跑的老 job 不带这个参数，
        # 插到中间就会把 generation 挪一位（A6 那条串号闸门的成因就是这一类错位）。
        payload.translate,
        job_id=task_id,
        job_timeout=600,
    )
    return {"status": "queued", "task_id": task_id}


BATCH_TTL_SECONDS = 1800
# 前端单次最多选 9 张，这里留 1 张余量；批次总字节管的是进 Redis job 的那份内存（R6）
MAX_IMAGES_PER_BATCH = 10
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_BATCH_BYTES = 40 * 1024 * 1024
# 只卡住"单批 40MB"是不够的：stage 限流 20 次/分钟、TTL 30 分钟，且不传 batch_id 就新建批次，
# 一个客户端能在半小时内堆出几百个批次。下面两条卡的才是"批次数量"这个维度。
MAX_BATCHES_PER_USER = 2
MAX_STAGING_BYTES = 120 * 1024 * 1024

# 这句话是直接弹给用户的 toast：icon:'none' 只显示两行（约 30 个汉字），超了会被截断，
# 所以只留"怎么办"，iPhone 的设置路径写在入口卡片的小字里。
UNSUPPORTED_IMAGE_HINT = "暂不支持该图片格式，请改用 JPG 或 PNG"


def _image_format(data: bytes) -> str | None:
    """按文件头判格式，只放行 Pillow 解得动的常见位图。

    HEIC/HEIF 故意不支持：那要么引 pillow-heif（多一个依赖、和"只留两扇门"打架），
    要么让前端改用压缩图（微信会重编码，直接掉识别率）。当场拒比塞进 Redis、等 worker
    解码时才失败更早，也更省内存。
    """
    head = data[:12]
    if head.startswith(b"\x89PNG\r\n\x1a\n") or head.startswith(b"\xff\xd8\xff"):
        return "PNG/JPEG"
    if head.startswith((b"GIF87a", b"GIF89a", b"BM", b"II*\x00", b"MM\x00*")):
        return "GIF/BMP/TIFF"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "WEBP"
    return None


def _staging_bytes() -> int:
    return sum(batch["bytes"] for batch in _batch_staging.values())


def _sweep_stale_batches():
    now = time.time()
    for batch_id, batch in list(_batch_staging.items()):
        if now - batch["created_at"] > BATCH_TTL_SECONDS:
            _batch_staging.pop(batch_id, None)


def _make_room_for_new_batch(incoming: int, user_id: str, is_new_batch: bool):
    """新建批次前先腾出该用户最旧的那份；全局预算仍不足就直接拒，不动别人的批次。"""
    if is_new_batch:
        mine = sorted(
            ((bid, b) for bid, b in _batch_staging.items() if b["user_id"] == user_id),
            key=lambda item: item[1]["created_at"],
        )
        while len(mine) >= MAX_BATCHES_PER_USER:
            victim_id, victim = mine.pop(0)
            _batch_staging.pop(victim_id, None)
            logger.info(
                "超出每用户 %d 批上限，淘汰最旧批次 %s（%d 字节）",
                MAX_BATCHES_PER_USER,
                victim_id,
                victim["bytes"],
            )
    if _staging_bytes() + incoming > MAX_STAGING_BYTES:
        raise HTTPException(
            status_code=429,
            detail=f"服务器暂存已满（上限 {MAX_STAGING_BYTES // 1048576}MB），请稍后重试",
        )


@router.post("/screenshots/stage")
@limiter.limit("20/minute")
async def stage_screenshot(
    request: Request,
    images: UploadFile = File(...),
    batch_id: str | None = Form(None),
    user: User = Depends(get_current_user),
):
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await images.read(8192)
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
        if total > MAX_IMAGE_BYTES:
            raise HTTPException(
                status_code=400, detail=f"图片超过 {MAX_IMAGE_BYTES // 1048576}MB 限制"
            )
    data = b"".join(chunks)

    if _image_format(data) is None:
        raise HTTPException(status_code=400, detail=UNSUPPORTED_IMAGE_HINT)

    _sweep_stale_batches()

    batch = None
    if batch_id:
        batch = _batch_staging.get(batch_id)
        if batch is None or batch["user_id"] != str(user.id):
            raise HTTPException(status_code=404, detail="批次不存在或已失效，请重新上传")

    _make_room_for_new_batch(len(data), str(user.id), batch is None)

    if batch is None:
        batch_id = uuid.uuid4().hex
        batch = {
            "data": [],
            "bytes": 0,
            "user_id": str(user.id),
            "created_at": time.time(),
        }
        _batch_staging[batch_id] = batch

    if len(batch["data"]) >= MAX_IMAGES_PER_BATCH:
        raise HTTPException(status_code=400, detail=f"每批次最多 {MAX_IMAGES_PER_BATCH} 张图片")
    if batch["bytes"] + len(data) > MAX_BATCH_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"批次总大小超过 {MAX_BATCH_BYTES // 1048576}MB，请分多次提交",
        )

    batch["data"].append(data)
    batch["bytes"] += len(data)

    return {"batch_id": batch_id, "count": len(batch["data"])}


@router.post("/screenshots/check")
@limiter.limit("30/minute")
async def check_screenshot(
    request: Request,
    images: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """站长 10-22 拍丙：选完图当场先检一次，屏上给一块占位色，检过才把缩略图换回去。

    **只检不存**：字节读完就送接口，回来就丢，不进 `_batch_staging`。所以"选完又放弃"
    那一批不会占服务器内存，也不会有人替他把图留在现网。

    这一条是**提示层**，不是闸。闸在 `process` 那条链上（worker 里 OCR 之前的
    `_guard_screenshot_images`），那一道一个字没动，提交时照旧整批重检。理由写在
    驳回通知的原话里：内容安全 API 要在**任意发布场景**生效——如果把检挪成"导入时检过、
    提交就不检"，绕开导入直接打 `process`（老包、别的入口）就成了一条现成的旁路。

    ⚠ 两边检的字节不是同一份：这一条检的是客户端压过的那一张，闸检的是原图。
    所以出现过"这里回 pass、提交时被拦下"完全可能，以闸为准——屏上那句提示本来就是"提示"。

    命中违规**不算接口失败**，所以回 200 加 `verdict`，不用 4xx：调用方要按三态分支，
    把 risky 做成 HTTP 错误会让它在客户端长成"网络不好"那一类。
    `unavailable`（微信抖动、开关关着、额度打光）照原样交出去，由客户端回显放行——
    与 `enforce_image_safety` 同一条纪律：微信侧抖动不许变成"用户存不了自己的笔记"。
    """
    data = await images.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=400, detail=f"图片超过 {MAX_IMAGE_BYTES // 1048576}MB 限制"
        )
    # 与 stage 同一把尺子：解不开的字节送过去微信也只回 0（10-22 实测），
    # 那是"检不出"不是"没问题"，更早一步当场拒掉更省一趟出网。
    if _image_format(data) is None:
        raise HTTPException(status_code=400, detail=UNSUPPORTED_IMAGE_HINT)

    # ⚠ 必须甩进线程：`check_image` 里是同步 httpx（timeout=10，token 失效还会重试一趟），
    #   而 >1MB 那张还要 PIL 全解码再重编码。uvicorn 是**单进程无 --workers**，
    #   在这一条 `async def` 里直接调它＝把整个 API 的事件循环按住十几秒，
    #   期间所有人的请求（连 `/health`）一起排队——症状是"整站卡"，不是"这一张慢"。
    #   同仓外链贴图那条 `_guard_image_pixels` 早就是 `asyncio.to_thread` 这个写法，照它。
    budget = await asyncio.to_thread(
        daily_budget.charge, str(user.id), daily_budget.KIND_SEC_CHECK
    )
    if not budget.ok:
        raise HTTPException(status_code=429, detail=budget.message)
    verdict = await asyncio.to_thread(check_image, data)
    if verdict == "risky":
        # 这条日志是下一次"你说没生效"时唯一能现读的证据，别省。
        logger.warning("导入即检拦下一张（用户 %s）", user.id)
    return {"verdict": verdict}


@router.post("/screenshots/process")
@limiter.limit("5/minute")
async def process_screenshots(
    request: Request,
    batch_id: str = Form(...),
    # 与 /url 同一刀：OCR 出来的文本进的是同一个提炼，开关就要能管到它。默认 None＝不表态。
    translate: Optional[bool] = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _sweep_stale_batches()

    batch = _batch_staging.get(batch_id)
    if not batch or batch["user_id"] != str(user.id):
        raise HTTPException(status_code=404, detail="批次不存在或已失效，请重新上传")
    if not batch["data"]:
        raise HTTPException(status_code=400, detail="无暂存图片，请先上传")

    # M33 两档：这一趟会结一条提炼，也会在 worker 里逐张送检（OCR 之前那道闸），
    # 所以送检那一档按**张数**记——一批九张就是九次出网，记一次等于把数说小九倍。
    budget = await asyncio.to_thread(
        daily_budget.charge, str(user.id), daily_budget.KIND_EXTRACT
    )
    if not budget.ok:
        raise HTTPException(status_code=429, detail=budget.message)
    sec = await asyncio.to_thread(
        daily_budget.charge, str(user.id), daily_budget.KIND_SEC_CHECK, len(batch["data"])
    )
    if not sec.ok:
        raise HTTPException(status_code=429, detail=sec.message)

    task_id = uuid.uuid4().hex
    # 两步都挪出事件循环，理由与位置绑定那条口径见 `/url` 那一处（M2 同一刀）。
    await asyncio.to_thread(set_task_status, task_id, "queued", user_id=str(user.id))
    await asyncio.to_thread(
        get_queue().enqueue,
        "app.tasks.ingest_tasks.process_screenshots_task",
        task_id,
        str(user.id),
        batch["data"],
        user.generation,
        translate,
        job_id=task_id,
        job_timeout=600,
    )
    _batch_staging.pop(batch_id, None)
    return {"status": "queued", "task_id": task_id}
