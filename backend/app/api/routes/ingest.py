import logging
import os
import shutil
import tempfile
import time
import uuid

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User
from app.core.auth import get_current_user
from app.core.rate_limit import user_limiter
from app.services.queue import get_queue, set_task_status

logger = logging.getLogger(__name__)

router = APIRouter()

_batch_staging: dict[str, dict] = {}


@router.post("/url")
@user_limiter.limit("10/minute")
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
MAX_IMAGES_PER_BATCH = 20


def _sweep_stale_batches():
    now = time.time()
    for batch_id, batch in list(_batch_staging.items()):
        if now - batch["created_at"] > BATCH_TTL_SECONDS:
            _batch_staging.pop(batch_id, None)
            shutil.rmtree(batch["dir"], ignore_errors=True)


@router.post("/screenshots/stage")
@user_limiter.limit("20/minute")
async def stage_screenshot(
    images: UploadFile = File(...),
    batch_id: str | None = Form(None),
    user: User = Depends(get_current_user),
):
    MAX_SIZE = 10 * 1024 * 1024  # 10MB
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await images.read(8192)
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
        if total > MAX_SIZE:
            raise HTTPException(status_code=400, detail="图片超过 10MB 限制")
    data = b"".join(chunks)

    _sweep_stale_batches()

    batch = None
    if batch_id:
        batch = _batch_staging.get(batch_id)
        if batch is None or batch["user_id"] != str(user.id):
            raise HTTPException(status_code=404, detail="批次不存在或已失效，请重新上传")

    if batch is None:
        batch_id = uuid.uuid4().hex
        batch = {
            "dir": tempfile.mkdtemp(prefix="tmbj_"),
            "paths": [],
            "user_id": str(user.id),
            "created_at": time.time(),
        }
        _batch_staging[batch_id] = batch
    
    if len(batch["paths"]) >= MAX_IMAGES_PER_BATCH:
        raise HTTPException(status_code=400, detail=f"每批次最多 {MAX_IMAGES_PER_BATCH} 张图片")

    path = os.path.join(batch["dir"], f"{uuid.uuid4().hex}.png")
    with open(path, "wb") as f:
        f.write(data)
    batch["paths"].append(path)

    return {"batch_id": batch_id, "count": len(batch["paths"])}


@router.post("/screenshots/process")
@user_limiter.limit("5/minute")
async def process_screenshots(
    request: Request,
    batch_id: str = Form(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    batch = _batch_staging.get(batch_id)
    if not batch or batch["user_id"] != str(user.id):
        raise HTTPException(status_code=404, detail="批次不存在或已失效，请重新上传")
    if not batch["paths"]:
        raise HTTPException(status_code=400, detail="无暂存图片，请先上传")

    task_id = uuid.uuid4().hex
    set_task_status(task_id, "queued", user_id=str(user.id))
    q = get_queue()
    q.enqueue(
        "app.tasks.ingest_tasks.process_screenshots_task",
        task_id,
        str(user.id),
        batch["paths"],
        job_id=task_id,
        job_timeout=600,
    )
    _batch_staging.pop(batch_id, None)
    return {"status": "queued", "task_id": task_id}


@router.post("/voice")
@user_limiter.limit("10/minute")
async def ingest_voice(
    request: Request,
    audio: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    MAX_SIZE = 10 * 1024 * 1024  # 10MB
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await audio.read(8192)
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
        if total > MAX_SIZE:
            raise HTTPException(status_code=400, detail="音频超过 10MB 限制")
    data = b"".join(chunks)

    suffix = ".aac"
    if audio.filename and "." in audio.filename:
        ext = audio.filename.rsplit(".", 1)[-1].lower()
        if ext in ("wav", "mp3", "pcm", "aac", "ogg"):
            suffix = f".{ext}"

    fd, path = tempfile.mkstemp(prefix="tmbj_voice_", suffix=suffix)
    with os.fdopen(fd, "wb") as f:
        f.write(data)

    audio_format = suffix.lstrip(".")
    task_id = uuid.uuid4().hex
    set_task_status(task_id, "queued", user_id=str(user.id))
    q = get_queue()
    q.enqueue(
        "app.tasks.ingest_tasks.process_voice_task",
        task_id,
        str(user.id),
        path,
        audio_format,
        job_id=task_id,
        job_timeout=600,
    )
    return {"status": "queued", "task_id": task_id}
