import logging
import time
import uuid

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User
from app.core.auth import get_current_user
from app.core.rate_limit import limiter
from app.services.queue import get_queue, set_task_status

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
        job_id=task_id,
        job_timeout=600,
    )
    _batch_staging.pop(batch_id, None)
    return {"status": "queued", "task_id": task_id}
