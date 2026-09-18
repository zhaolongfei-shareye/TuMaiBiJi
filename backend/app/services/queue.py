import json
import logging

import redis
from rq import Queue

from app.core.config import settings

logger = logging.getLogger(__name__)

TASK_TTL = 3600


def get_redis_conn() -> redis.Redis:
    return redis.from_url(settings.REDIS_URL)


def get_queue() -> Queue:
    return Queue(connection=get_redis_conn())


def get_task_status(task_id: str) -> dict | None:
    conn = get_redis_conn()
    data = conn.get(f"task:{task_id}")
    if data:
        return json.loads(data)
    return None


def set_task_status(
    task_id: str,
    status: str,
    result: dict | None = None,
    user_id: str | None = None,
):
    conn = get_redis_conn()
    key = f"task:{task_id}"
    payload: dict = {}
    existing = conn.get(key)
    if existing:
        try:
            payload = json.loads(existing)
        except (TypeError, ValueError):
            payload = {}
    payload["status"] = status
    if result is not None:
        payload["result"] = result
    if user_id is not None:
        payload["user_id"] = user_id
    conn.set(key, json.dumps(payload), ex=TASK_TTL)
