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
from app.api.routes.notes import MAX_BODY, MAX_TITLE
from app.services.queue import get_queue, set_task_status
from app.services.wechat import enforce_text_safety

logger = logging.getLogger(__name__)

router = APIRouter()

_batch_staging: dict[str, dict] = {}


@router.post("/url")
@limiter.limit("10/minute")
async def ingest_url(
    request: Request,
    url: str = Form(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task_id = uuid.uuid4().hex
    set_task_status(task_id, "queued", user_id=str(user.id))
    q = get_queue()
    q.enqueue(
        "app.tasks.ingest_tasks.process_url_task",
        task_id,
        str(user.id),
        url,
        user.generation,
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
    只管"要公开"那一刻。抓取／截图两条不带这一步，是因为那两段是外部原文，不是用户写的。
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

    try:
        enforce_text_safety(user.openid, title, content)
    except UserError as e:
        raise HTTPException(status_code=400, detail=str(e))

    task_id = uuid.uuid4().hex
    set_task_status(task_id, "queued", user_id=str(user.id))
    q = get_queue()
    q.enqueue(
        "app.tasks.ingest_tasks.process_manual_text_task",
        task_id,
        str(user.id),
        title,
        content,
        payload.category_id,
        user.generation,
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


@router.post("/screenshots/process")
@limiter.limit("5/minute")
async def process_screenshots(
    request: Request,
    batch_id: str = Form(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _sweep_stale_batches()

    batch = _batch_staging.get(batch_id)
    if not batch or batch["user_id"] != str(user.id):
        raise HTTPException(status_code=404, detail="批次不存在或已失效，请重新上传")
    if not batch["data"]:
        raise HTTPException(status_code=400, detail="无暂存图片，请先上传")

    task_id = uuid.uuid4().hex
    set_task_status(task_id, "queued", user_id=str(user.id))
    q = get_queue()
    q.enqueue(
        "app.tasks.ingest_tasks.process_screenshots_task",
        task_id,
        str(user.id),
        batch["data"],
        user.generation,
        job_id=task_id,
        job_timeout=600,
    )
    _batch_staging.pop(batch_id, None)
    return {"status": "queued", "task_id": task_id}
