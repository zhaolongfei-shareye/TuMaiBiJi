"""RQ Worker 入口：python3 worker.py"""
import redis
from rq import Worker, Queue

from app.core.config import settings

if __name__ == "__main__":
    conn = redis.from_url(settings.REDIS_URL)
    worker = Worker([Queue("default", connection=conn)], connection=conn)
    worker.work()
