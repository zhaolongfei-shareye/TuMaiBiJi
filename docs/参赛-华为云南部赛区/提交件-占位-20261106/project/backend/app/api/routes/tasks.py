from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.services.queue import get_task_status

router = APIRouter()


@router.get("/{task_id}")
def get_status(
    task_id: str,
    user: User = Depends(get_current_user),
):
    status = get_task_status(task_id)
    if not status or status.get("user_id") != str(user.id):
        raise HTTPException(status_code=404, detail="任务不存在或已过期")
    return {k: v for k, v in status.items() if k != "user_id"}
