import logging

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

logger = logging.getLogger(__name__)

_connect_args = {}
_pool_kwargs = {}
_IS_SQLITE = settings.DATABASE_URL.startswith("sqlite")

if _IS_SQLITE:
    _connect_args["check_same_thread"] = False
else:
    _pool_kwargs = {"pool_size": 10, "max_overflow": 20, "pool_pre_ping": True}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args,
    **_pool_kwargs,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 锁等待：`api` 与 `worker` 是**两个进程共写同一个 SQLite 文件**（结 MIND、跑摄取任务都在写）。
# ⚠ 别把这一行读成"原来是 0"——CPython 的 `sqlite3.connect()` 默认 `timeout=5.0`，驱动本来就把
# busy_timeout 设成 5000ms（`tests/test_sqlite_lock_robustness.py` 第三条用例把这个默认值钉住了）。
# 写在这一层是为了**把它变成我们的决定**：换成别的驱动、或谁哪天给 connect 加参数，
# 一个没人写明的 5 秒就会悄悄变成 0。
# 撞锁真正的代价在那之后：`quota._never_breaks` 把 `database is locked` 收进日志、回"这笔没结成"，
# 而笔记早就 commit 过了——界面上永远是"存好了"，那笔邀请奖励却从此结不出来（判据在
# `_is_his_first_note`，它现在读的是"本次这一篇是不是他动笔那几篇里最早的一条"，不再数条数）。
# 5000ms 与那一片 `except` 的分工：这里让"等一下就能写成"的绝大多数不再走到那一步；
# 真等满 5 秒的那种仍然按"没结成"处理（**不重试**：这条的幂等由唯一索引兜，
# 撞了索引就是已经结过，重试只会把日志刷脏）。
_BUSY_TIMEOUT_MS = 5000


def _sqlite_pragmas(dbapi_conn, _record):
    cur = dbapi_conn.cursor()
    try:
        # WAL 是**库文件头里的持久设置**，第一个连接把它写成 wal 之后所有连接都是 wal。
        # 它换来的是"读不挡写、写不挡读"——原来 delete 模式下 worker 一开写事务，
        # api 那边连读都要排队，锁窗口是整个写事务。这一枚才是这一刀的真变化。
        # 备份那一条链已经确认吃得下 WAL：`backup.sh` 走的是 sqlite3 的在线 backup API，
        # 不是 cp（cp 在 WAL 下会丢掉 -wal 里还没合并的那批事务）。
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute(f"PRAGMA busy_timeout={_BUSY_TIMEOUT_MS}")
    except Exception as exc:  # 设不上不等于库坏了：只报不炸
        # ⚠ 这一支是**降级**（照旧跑在 delete 模式），不许静默：现网要是在这里退到 delete，
        # 症状就是"worker 写大事务那几秒后台接口跟着卡"，谁都不会想到是这一行没设上。
        logger.warning("SQLite 那两条 PRAGMA 没设上，这一条连接按默认配置跑：%s", exc)
    finally:
        cur.close()


if _IS_SQLITE:
    event.listens_for(engine, "connect")(_sqlite_pragmas)


def journal_mode() -> str:
    """现网探针读这一枚：`wal` 才算这两条 PRAGMA 真落上了。
    写在这儿而不是探针里抄一份 SQL，是为了让"验的是同一个对象"——探针拿的就是 engine 本身。
    """
    with engine.connect() as conn:
        return str(conn.exec_driver_sql("PRAGMA journal_mode").scalar() or "")


def busy_timeout_ms() -> int:
    """同上，探针读这一枚确认每个连接都带上了等待时间。"""
    with engine.connect() as conn:
        return int(conn.exec_driver_sql("PRAGMA busy_timeout").scalar() or 0)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
