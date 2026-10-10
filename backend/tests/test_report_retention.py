"""举报行保留期（`app/services/report_retention.py` ＋ `probes/清-过期举报.py`）的尺子。

这批尺子钉的是**删除**那一路，而删除是这张表上唯一不可逆的动作，所以每条都反着钉一面：

① 到期的被点名、没过期的不许动（正面）；正好卡在截止那一刻的**不算**到期（边界）。
② `created_at` 为空的行**一条都不许进删除名单**，并且要单独数得出来（口径②）。
   这一面最贵：空值一旦落成"很小的时间戳"，效果就是"不知道什么时候写的 → 当成最旧的 → 删掉"。
③ 三档（到期／无时间戳／未到期）加起来必须等于库里总行数——少了就是**静默漏计**。
④ naive 与 aware 两种形状（同一瞬间的两种写法）必须落在**同一档**，否则删不删取决于写入路径。
⑤ 删除只删点名的那些行，且**不 commit**——提交是脚本那一步的决定，不是服务层的副作用。
⑥ 那条脚本默认必须是 dry-run：不带 `--执行` 时 `EXECUTE` 就是 False。

不出网：conftest 已把 `SEC_CHECK_ENABLED` 置 false，这一支本来就只读写那个一次性库。
期限天数**不在这里钉死**（钉成"等于 180"是一条改天数就红、却什么都证不明的尺子）；钉的是
"只有一处出处"——脚本与本文件都从 `RETENTION_DAYS` 读，边界用例另走 `days=` 那个口。

一列的形状只写了**实测到的**那三种：ORM 写进去读回来是 naive、手工带偏移量读回来是 aware、
以及 NULL。第四种（`created_at` 里塞一个根本不是日期的字符串）**没有尺子**，因为实测它不是
"归到哪一档"的问题：SQLite 那一列本质是 TEXT，写进去能存，但 SQLAlchemy 读的时候会当场
`ValueError: Invalid isoformat string`（10-10 实测，`/tmp/retention-shape.db` 那一发）。
所以那种行是"这一发压根跑不起来"，不是"分类分错了"——而它跑不起来的时候一行都还没删。
"""
import importlib.util
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import text

from app.db.database import Base, SessionLocal, engine
from app.models.share_report import ShareReport
from app.services.report_retention import RETENTION_DAYS, delete_expired, plan_expired

BACKEND = Path(__file__).resolve().parents[1]

# 一个固定的"现在"：所有用例都拿 `now=NOW` 传进去，所以这批尺子不随墙上时钟漂。
NOW = datetime(2026, 10, 10, 3, 0, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module", autouse=True)
def _tables():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture()
def db():
    s = SessionLocal()
    yield s
    s.close()


@pytest.fixture(autouse=True)
def _clear(db):
    db.query(ShareReport).delete()
    db.commit()
    yield


def _at(days_ago: float) -> datetime:
    """走 ORM 那一路的时刻（naive，正是现网读回来的形状）。"""
    return (NOW - timedelta(days=days_ago)).replace(tzinfo=None)


def _insert(db, token, days_ago=0):
    r = ShareReport(token=token, reason="spam", reporter_bucket="b1",
                    created_at=_at(days_ago))
    db.add(r)
    db.commit()
    return r


def _raw(db, token, created_at):
    """绕过 ORM 插一行——只为造出走 ORM 造不出来的两种形状：带偏移量的字符串、以及 NULL。"""
    db.execute(text(
        "INSERT INTO share_reports (token, reason, reporter_bucket, hidden, created_at) "
        "VALUES (:tok, 'spam', 'b1', 0, :ts)"
    ), {"tok": token, "ts": created_at})
    db.commit()


class Test到期判定:
    def test_到期的被点名而没过期的不动(self, db):
        old = _insert(db, "r-old", RETENTION_DAYS + 1)
        mid = _insert(db, "r-mid", RETENTION_DAYS - 1)
        new = _insert(db, "r-new", 0)
        p = plan_expired(db, now=NOW)
        assert p.expired_ids == [old.id], f"到期名单读出来是 {p.expired_ids}"
        assert p.kept == 2
        assert mid.id not in p.expired_ids and new.id not in p.expired_ids

    def test_截止那一刻本身不算过期再早一秒算(self, db):
        edge = _insert(db, "r-edge", RETENTION_DAYS)
        just = _insert(db, "r-just", RETENTION_DAYS)
        # 把两行钉成"相差一秒"的两个精确时刻：边界归哪一边必须有定论，两头都放行是错的。
        edge.created_at = NOW - timedelta(days=RETENTION_DAYS)
        just.created_at = edge.created_at - timedelta(seconds=1)
        db.commit()
        p = plan_expired(db, now=NOW)
        assert edge.id not in p.expired_ids, "截止那一行是「正好这么旧」，不该算过期"
        assert just.id in p.expired_ids, "再早一秒就是过期，边界不能两头都放行"

    def test_期限改一格全表跟着改(self, db):
        """旋钮只有一个：`days=` 一变，所有行的档位必须一起移动。

        这一条防的是"天数在两个地方各写一份"——那种情况改一处，另一处仍按旧天数删。
        """
        row = _insert(db, "r-90", 90)
        assert plan_expired(db, now=NOW, days=RETENTION_DAYS).expired_ids == []
        assert plan_expired(db, now=NOW, days=80).expired_ids == [row.id]

    def test_同一瞬间的两种形状必须同档(self, db):
        """`+08:00` 那种字符串与按 UTC 存的那一行是**同一个瞬间**，删不删不许取决于写入路径。"""
        via_orm = _insert(db, "r-orm", RETENTION_DAYS + 1)
        same_instant = NOW - timedelta(days=RETENTION_DAYS + 1)
        east = same_instant.astimezone(timezone(timedelta(hours=8))).isoformat()
        _raw(db, "r-raw", east)
        p = plan_expired(db, now=NOW)
        assert len(p.expired_ids) == 2, f"同一瞬间的两行只删掉一半：{p.expired_ids}"
        assert via_orm.id in p.expired_ids


class Test空值与守恒:
    def test_时间为空的行保留且单独数得出来(self, db):
        _raw(db, "r-null", None)
        kept = _insert(db, "r-new", 0)
        p = plan_expired(db, now=NOW)
        assert p.undated == 1, f"无时间戳那一档读出来是 {p.undated}"
        assert p.expired_ids == [], "空时间戳不许等于「最旧」，它是「不知道」"
        assert kept.id not in p.expired_ids

    def test_三档加起来必须等于总行数(self, db):
        _insert(db, "a", 400)
        _insert(db, "b", 1)
        _raw(db, "c", None)
        _raw(db, "d", None)
        p = plan_expired(db, now=NOW)
        assert p.total == 4
        assert len(p.expired_ids) + p.undated + p.kept == p.total, \
            f"三档 {len(p.expired_ids)}+{p.undated}+{p.kept} 对不上总数 {p.total}"

    def test_空库也是一种读数而不是错误(self, db):
        p = plan_expired(db, now=NOW)
        assert (p.total, p.undated, p.kept) == (0, 0, 0)
        assert p.expired_ids == []


class Test删除那一步:
    def test_只删点名的行且不提交(self, db):
        gone = _insert(db, "r-gone", 400)
        _insert(db, "r-stay", 0)
        assert delete_expired(db, [gone.id]) == 1
        db.rollback()   # 不许 commit：提交是脚本那一步的决定
        assert db.query(ShareReport).filter_by(token="r-gone").first() is not None, \
            "回滚之后那行还在，才说明除了 delete 没有别的写在里面"
        assert db.query(ShareReport).filter_by(token="r-stay").first() is not None

    def test_点名列表超过一批也要删全(self, db):
        """分批是 `IN (…)` 占位符上限的保险：半删状态比不删难看出来。"""
        ids = [_insert(db, f"r-{i}", 400).id for i in range(5)]
        assert delete_expired(db, ids, batch=2) == 5
        db.commit()
        assert db.query(ShareReport).count() == 0

    def test_空名单不许动一行(self, db):
        _insert(db, "r-stay", 0)
        assert delete_expired(db, []) == 0
        assert db.query(ShareReport).count() == 1


class Test脚本的默认档:
    def _load(self, argv):
        old = sys.argv
        sys.argv = argv
        try:
            spec = importlib.util.spec_from_file_location(
                "clean_report_probe", BACKEND / "probes" / "清-过期举报.py")
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod
        finally:
            sys.argv = old

    def test_不带执行那条脚本就是只报告(self):
        """`EXECUTE` 由 argv 决定，而默认必须是 False——这是"手滑一次就清库"那道闸。"""
        assert self._load(["清-过期举报.py"]).EXECUTE is False

    def test_带上执行才走删除分支(self):
        assert self._load(["清-过期举报.py", "--执行"]).EXECUTE is True
