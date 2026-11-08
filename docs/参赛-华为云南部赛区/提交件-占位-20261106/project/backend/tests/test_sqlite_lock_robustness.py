"""两个进程共写一个 SQLite 文件时的那两条连接级设置（10-16 审计第六条，改到一半自己纠正过一次）。

`wtsj-api`（uvicorn）与 `wtsj-worker`（RQ）是**两个进程**，写的是同一个 `wtsj.db`。
原来 `app/db/database.py` 只给了 `check_same_thread=False`，于是 `journal_mode` 停在默认的
`delete`：一个进程开着写事务，另一个进程连**读**都要排队，排队排不上就抛 `database is locked`
（OperationalError）。这条的代价不在那一抛，而在抛完之后——`quota._never_breaks` 把一切异常
收进日志、回"这笔没结成"，而笔记早就 commit 过了：界面上永远是"存好了"，那笔 MIND 静默少结，
没有任何一处会重试。

⚠ **我原来报的"busy_timeout 停在 0"是半句假话**：CPython 的 `sqlite3.connect()` 默认
`timeout=5.0`，DBAPI 那一层本来就把 busy_timeout 设成 5000ms（我自己写的第一把用例就是这么抓出来的：
裸开的连接读回来也是 5000）。所以这一条的真实内容是"**我们从没把它写明、全靠驱动默认**"，
不是"它在现网是 0"。真变化只有 WAL 那一半；`busy_timeout` 那一半是把默认值变成我们的决定。

第三把量的是行为（撞锁要等、不是当场抛），它不证明我们那一行——它证明的是这条链将来谁把
超时删了要红。所以它自己把"没超时"那种连接造出来对照，不指望驱动默认。
"""
import os
import sys
import threading
import time

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3

from app.db.database import (
    _BUSY_TIMEOUT_MS,
    Base,
    busy_timeout_ms,
    engine,
    journal_mode,
)


def setup_module(_):
    Base.metadata.create_all(bind=engine)


class Test那两条设置:
    def test_journal_mode_是_wal(self):
        """这一枚才是这一刀的真变化：默认是 `delete`，谁没写它就还是 `delete`。
        内存库会回 `memory`（SQLite 对 :memory: 忽略 WAL），所以顺带钉住"测试用的是一块真文件"——
        锁的行为只有真文件才量得出来。
        """
        assert engine.url.get_backend_name() == "sqlite", engine.url
        assert engine.url.database and engine.url.database.endswith(".db"), engine.url
        assert journal_mode().lower() == "wal", journal_mode()

    def test_busy_timeout_是我们写明的数(self):
        """`busy_timeout` 是**连接级**设置，必须挂在 connect 事件上，不然只中池里第一条连接。"""
        got = []
        for _ in range(3):                      # 三条独立连接：量的就是"后面那些"
            with engine.connect() as conn:
                got.append(int(conn.exec_driver_sql("PRAGMA busy_timeout").scalar()))
        assert got == [_BUSY_TIMEOUT_MS] * 3, got
        assert busy_timeout_ms() == _BUSY_TIMEOUT_MS == 5000

    def test_我们没写明的地方就是零(self):
        """反向对照，也是上面那条的真正分量所在：`sqlite3.connect(path, timeout=0)` 读回来必须是 0。
        这一把同时说明为什么"数对"不等于"是我们钉的"——驱动默认恰好也是 5000，
        所以只比数值的那条判据删掉我们那一行也不会红。
        """
        with sqlite3.connect(engine.url.database, timeout=0) as bare:
            assert int(bare.execute("PRAGMA busy_timeout").fetchone()[0]) == 0


class Test撞锁那一趟要等:
    def test_第一条写事务没结束时第二条写得等到它提交(self):
        """A 占住写锁不 commit，B 去写：B 必须**等**，A 提交后 B 写成，而不是当场抛。

        起的是两个连接不是两个进程——SQLite 那把文件锁认的是连接，进程数不参与；
        而 `quota` 那条路吃的就是"这一抛来不来"。
        """
        engine.dispose()
        a = engine.raw_connection()
        b = engine.raw_connection()
        try:
            a.execute("DROP TABLE IF EXISTS lock_probe")
            a.execute("CREATE TABLE lock_probe (x INTEGER)")
            a.commit()
            a.execute("BEGIN IMMEDIATE")                # A 占住写锁，故意不 commit
            a.execute("INSERT INTO lock_probe VALUES (1)")

            err = {}

            def writer():
                try:
                    rb = sqlite3.connect(engine.url.database, timeout=0)   # 故意不给等待
                    try:
                        rb.execute("INSERT INTO lock_probe VALUES (2)")
                        rb.commit()
                    finally:
                        rb.close()
                except Exception as exc:                # noqa: BLE001 —— 这一把要的就是一抛与否
                    err["exc"] = exc

            t = threading.Thread(target=writer)
            t.start()
            t.join(2)
            assert "exc" in err, "零等待的连接居然没撞锁：这一把量不到东西"
            assert "locked" in str(err["exc"]).lower(), err["exc"]

            # 现在换成我们那条路（走 engine，带我们写明的 5000ms）：同一个时机它必须等而不是抛
            done = {}

            def waiter():
                try:
                    b.execute("INSERT INTO lock_probe VALUES (4)")
                    b.commit()
                    done["ok"] = True
                except Exception as exc:                # noqa: BLE001
                    done["exc"] = exc

            t2 = threading.Thread(target=waiter)
            t2.start()
            time.sleep(0.4)                             # 让 t2 真的撞在 A 还没结束时
            assert t2.is_alive(), "B 没在等（这把量不到'等'这件事）"
            a.execute("INSERT INTO lock_probe VALUES (5)")
            a.commit()
            t2.join(9)
            assert not t2.is_alive(), "等到超时也没写成"
            assert done.get("ok") is True, done
            assert sorted(x for (x,) in b.execute("SELECT x FROM lock_probe")) == [1, 4, 5], \
                "落库的必须是 A 那两笔 (1,5) 与 B 等完之后那一笔 (4)；(2) 那笔是零等待的对照，它本来就该没写成"
        finally:
            try:
                a.execute("ROLLBACK")
            except Exception:                           # noqa: BLE001
                pass
            a.close()
            b.close()
            engine.dispose()
