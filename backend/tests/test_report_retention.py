"""举报行保留期（`app/services/report_retention.py` ＋ `probes/清-过期举报.py`）的尺子。

这批尺子钉的是**删除**那一路，而删除是这张表上唯一不可逆的动作，所以每条都反着钉一面：

① 到期的被点名、没过期的不许动（正面）；正好卡在截止那一刻的**不算**到期（边界）。
② `created_at` 为空的行**一条都不许进删除名单**，并且要单独数得出来（口径②）。
   这一面最贵：空值一旦落成"很小的时间戳"，效果就是"不知道什么时候写的 → 当成最旧的 → 删掉"。
③ 三档（到期／无时间戳／未到期）加起来必须等于库里总行数——少了就是**静默漏计**。
④ naive 与 aware 两种形状（同一瞬间的两种写法）必须落在**同一档**，否则删不删取决于写入路径。
⑤ 删除只删点名的那些行，且**不 commit**——提交是脚本那一步的决定，不是服务层的副作用。
⑥ 那条脚本默认必须是 dry-run：不带 `--执行` 时 `EXECUTE` 就是 False。
⑦ **打出来的档与实际走到的分支不许各说各话**：`Test真跑那条脚本` 真起子进程、真数行数，
   并且要求那一次屏幕上出现「dry-run」时不许同时出现「已删除」。
⑧ 数据库报的删除条数与名单条数对不上时，**那次提交不许发生**（判据另开一个会话数行数）。

⑥ 与 ⑦ 是同一个风险的两面，第五轮审计实测出来的：只钉常量（⑥）不够——把分支单独改坏之后
屏幕照打「dry-run：一行都不删」、盘上照删两行、退出码 0，⑥那两条尺子全绿（`/tmp/aud7` 那一发）。
⑦⑧ 两条各有一把刀（`反向验证-举报台账.sh` 的 AH／AI）。

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
import os
import subprocess
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
        """**每一档都得是自己数出来的**，等式才有牙。

        第五轮审计实测过没有牙的版本：`kept` 当时写成 `total - expired - undated`，于是这一条
        是恒等式——把分类改坏（`if stamp < key:` → `if False:`）之后，三档照样"守恒"、
        脚本照样退 0，而两行明显到期的数据一行都没删。现在 `total` 走独立 `COUNT(*)`、
        `kept` 在循环里自己加，掉出三档的那一行会被这条抓住。
        """
        from sqlalchemy import func as sa_func
        _insert(db, "a", 400)
        _insert(db, "b", 1)
        _raw(db, "c", None)
        _raw(db, "d", None)
        p = plan_expired(db, now=NOW)
        assert p.total == db.query(sa_func.count(ShareReport.id)).scalar() == 4, \
            "`total` 必须是独立数出来的库内行数，不是分类结果的和"
        assert p.kept == 1, f"未到期那一档要自己数出来（库里只有 b 没过点），实际 {p.kept}"
        assert p.undated == 2
        assert len(p.expired_ids) == 1
        assert len(p.expired_ids) + p.undated + p.kept == p.total, \
            f"三档 {len(p.expired_ids)}+{p.undated}+{p.kept} 对不上总数 {p.total}"

    def test_不传时刻也走默认那一条路(self, db):
        """现网跑的就是 `now=None`（墙上此刻）这一支，不能只测注入时刻的那一支。"""
        _insert(db, "r-recent", 1)
        _insert(db, "r-far", 400)
        p = plan_expired(db)
        期望 = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
        assert abs((p.cutoff - 期望).total_seconds()) < 120, \
            f"默认时刻算出的截止线是 {p.cutoff.isoformat()}，与「此刻减 180 天」差得太远"
        assert len(p.expired_ids) == 1 and p.kept == 1

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
        """`EXECUTE` 由 argv 决定，而默认必须是 False——这是"手滑一次就清库"那道闸的**常量**那一面。"""
        assert self._load(["清-过期举报.py"]).EXECUTE is False

    def test_带上执行才走删除分支(self):
        assert self._load(["清-过期举报.py", "--执行"]).EXECUTE is True

    def test_删除条数与名单对不上时不许提交(self, db):
        """屏幕已经打了一句"已删除 N 条"，而库里其实没删干净——这比不删更坏，所以这条闸门
        必须有尺子。真实触发它需要"计划之后、删之前有一行消失"（并发或分批没跑完），
        用例里用一个**少报一条**的替身 `delete_expired` 造出来，替身照删不误、只把计数说小。

        钉的是两件事：退出码必须是 1，**且那次 commit 不许发生**——所以判据不数屏幕上的话，
        而是回滚之后另开一个会话去数库里的行数。
        """
        _insert(db, "r-old1", 400)
        _insert(db, "r-old2", 400)
        mod = self._load(["清-过期举报.py"])
        real = mod.delete_expired

        def undercount(session, ids, batch=500):
            n = real(session, ids, batch=batch)
            return n - 1   # 真删了 2 条却报告 1 条：闸门要抓的就是这种对不上

        mod.delete_expired = undercount
        try:
            code = mod.run(db, True)
        finally:
            mod.delete_expired = real
        assert code == 1, f"计数对不上却回了 {code}——那道闸门没闭上"
        db.rollback()
        check = SessionLocal()
        try:
            assert check.query(ShareReport).count() == 2, \
                "对不上时居然提交了：另开一个会话数，库里只剩 0 行"
        finally:
            check.close()


class Test真跑那条脚本:
    """上面两条只钉常量。第五轮审计实测那**不够**：把分支单独改坏
    （`if not EXECUTE:` → `if False:`）之后跑一次，屏幕上照打「dry-run：一行都不删」，
    盘上照删两行、退出码 0，而那两条尺子全绿（`/tmp/aud7` 那一发）。
    所以这一组**真起子进程、真数行数**，并且把"打出来的档"与"实际发生的写"对在一起。
    """

    SEED = '''
from app.db.database import Base, SessionLocal, engine
import app.models.note, app.models.share, app.models.share_report
from app.models.share_report import ShareReport
from datetime import datetime, timezone, timedelta
from sqlalchemy import text

Base.metadata.create_all(bind=engine)
db = SessionLocal()
now = datetime.now(timezone.utc).replace(tzinfo=None)
for tok in ("g-old1", "g-old2"):
    db.add(ShareReport(token=tok, reason="spam", reporter_bucket="b",
                       created_at=now - timedelta(days=400)))
db.execute(text("INSERT INTO share_reports (token, reason, reporter_bucket, hidden, created_at) "
                "VALUES ('g-null','spam','b',0,NULL)"))
db.commit()
'''

    def _env(self, url: str) -> dict:
        env = dict(os.environ)
        env.update({"DATABASE_URL": url, "JWT_SECRET_KEY": "retention-test-only",
                    "EXTRACT_PROVIDER": "none", "SEC_CHECK_ENABLED": "false"})
        return env

    def _seed(self, url: str) -> None:
        r = subprocess.run([sys.executable, "-c", self.SEED], cwd=str(BACKEND),
                           env=self._env(url), capture_output=True, text=True)
        assert r.returncode == 0, f"造库失败：{r.stderr[-400:]}"

    def _tokens(self, url: str) -> set:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from app.models.share_report import ShareReport
        import app.models.share_report  # noqa: F401  — 让 mapper 就位
        s = sessionmaker(bind=create_engine(url))()
        try:
            return {t for (t,) in s.query(ShareReport.token).all()}
        finally:
            s.close()

    def _run(self, url: str, *argv: str):
        proc = subprocess.run([sys.executable, str(BACKEND / "probes" / "清-过期举报.py"), *argv],
                              cwd=str(BACKEND), env=self._env(url),
                              capture_output=True, text=True)
        return proc.returncode, proc.stdout + proc.stderr

    def test_不带执行跑一次库里一行都不许少(self, tmp_path):
        url = f"sqlite:///{tmp_path}/dry.db"
        self._seed(url)
        code, out = self._run(url)
        assert code == 0, f"默认档应当退出码 0，实际 {code}：{out[-400:]}"
        assert self._tokens(url) == {"g-old1", "g-old2", "g-null"}, \
            f"没带 --执行 却有行少了，屏幕说的是：{out[-400:]}"
        # 报告与行为不许各说各话：打"dry-run"的那一次绝不允许同时打"已删除"
        assert "dry-run" in out and "已删除" not in out, out[-400:]

    def test_带执行才真删而空时间戳那一行留下(self, tmp_path):
        url = f"sqlite:///{tmp_path}/exe.db"
        self._seed(url)
        code, out = self._run(url, "--执行")
        assert code == 0, f"执行档退出码是 {code}：{out[-400:]}"
        assert self._tokens(url) == {"g-null"}, f"到期两行该被删掉、空值那行该留着：{out[-400:]}"
        assert "已删除 2 行" in out and "无时间戳 1" in out, out[-400:]

    def test_表不在的时候退出码非零且不许说成干净(self, tmp_path):
        url = f"sqlite:///{tmp_path}/missing.db"
        code, out = self._run(url)
        assert code == 1, f"库都还不存在却退了 {code}：{out[-300:]}"
        assert "不是「现网很干净」" in out, out[-300:]
