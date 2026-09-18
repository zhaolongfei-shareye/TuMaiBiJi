import logging
import os
import tempfile
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
    )
    return {"status": "queued", "task_id": task_id}


@router.post("/screenshots/stage")
async def stage_screenshot(
    images: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    data = await images.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="图片超过 10MB 限制")

    batch_id = uuid.uuid4().hex
    if batch_id not in _batch_staging:
        _batch_staging[batch_id] = {"dir": tempfile.mkdtemp(prefix="wtsj_"), "paths": []}

    batch = _batch_staging[batch_id]
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
    batch = _batch_staging.pop(batch_id, None)
    if not batch or not batch["paths"]:
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
    )
    return {"status": "queued", "task_id": task_id}


@router.post("/voice")
@user_limiter.limit("10/minute")
async def ingest_voice(
    request: Request,
    audio: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    data = await audio.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="音频超过 10MB 限制")

    suffix = ".aac"
    if audio.filename and "." in audio.filename:
        ext = audio.filename.rsplit(".", 1)[-1].lower()
        if ext in ("wav", "mp3", "pcm", "aac", "ogg"):
            suffix = f".{ext}"

    fd, path = tempfile.mkstemp(prefix="wtsj_voice_", suffix=suffix)
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
    )
    return {"status": "queued", "task_id": task_id}
