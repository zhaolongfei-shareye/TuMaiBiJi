"""举报台账读取侧 `services/report_ledger.py` 的用例。

这张表只有写入（`routes/landing.py` 的举报表单）与删除（注销级联），**读取侧是这一批补的**，
所以这里钉的都是"读出来长什么样"的口径，而不是一条举报能不能落库（那在 `test_landing_page.py`）。
五条最要紧的：

① **同一个人刷 N 次折成一档**——`reporter_bucket` 存在的唯一理由就是回答"到底有几个人举报过"，
读的时候不折，这个数字就变成"点击次数"，而台账的排序正是按它排的。
② **`bucket` 为 NULL 的每条各算一个人**（宁可多算不可漏算；折成同一个未知的人会少报人数）。
③ **撤掉的码与从来不存在的码都要出现在台账上**并按状态标出来——只 join 生效分享的那一类读法
会让"撤了还有人举报"整批消失，而那恰恰是最该看见的一类。
④ **`latest_at` 读成空的那一组不许崩，也不许占前排**（那一列 schema 允许空，实现里比的是
`isoformat()` 字符串，空值落成的空串天然排在同档最末尾）。紧跟着钉一条**平台事实**：SQLite 这
一列 aware 写进去读回来是 naive——所以"naive 与 aware 混着比会 TypeError"这一档今天**不可达**，
反向验证里那一刀报★假绿★报得对（第一版这里写的正是那档不可达的事，实测之后改成现在这两条）。
⑤ **原话那一句走的是展示卫生，不是数据清洗**——台账交出原样文本，探针脚本负责把控制字符
压成一行。换行能把台账的下一行伪造成任意内容（`detail` 是公开表单收回来的自由文本），
所以最后那四条钉的是脚本里那一个函数，而台账这一侧另钉一条"清洗没跑到数据里来"。

不出网：conftest 已把 `SEC_CHECK_ENABLED` 置 false，这一支本来就只读库。
"""
import importlib.util
import itertools
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import text

from app.db.database import Base, SessionLocal, engine
from app.models.note import Note
from app.models.share import Share
from app.models.share_report import ShareReport
from app.services.report_ledger import (
    PAGE_LIVE, PAGE_NO_CODE, PAGE_REVOKED, SAMPLE_LIMIT, ledger,
)

# 探针脚本按老规矩自己插 sys.path，但**不**靠它跑——这里只取 `flat()` 那一个函数，
# `main()` 挂在 `if __name__` 后面，导入它不会连库、不会打接口（`test_api_contract_1x.py` 同法）。
BACKEND = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location(
    "read_report_ledger_probe", BACKEND / "probes" / "读-举报台账.py")
_probe = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_probe)
flat = _probe.flat

_counter = itertools.count(1)


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


def _clear(db):
    db.query(ShareReport).delete()
    db.query(Share).delete()
    db.query(Note).delete()
    db.commit()


def _share(db, token, active=True):
    n = Note(user_id="1", title=f"第 {next(_counter)} 篇", source_type="manual",
             tags=[], key_points=[], key_links=[])
    db.add(n)
    db.commit()
    s = Share(user_id="1", note_id=n.id, token=token, title="那一篇",
              summary="摘", tags=[], key_points=[], key_links=[],
              author_name="某某", is_active=active)
    db.add(s)
    db.commit()
    return s


def _report(db, token, reason="spam", bucket="b1", created_at=None, detail=None):
    r = ShareReport(token=token, reason=reason, reporter_bucket=bucket, detail=detail)
    if created_at is not None:
        r.created_at = created_at
    db.add(r)
    db.commit()
    return r


def _one(led, token):
    hits = [g for g in led if g.token == token]
    assert len(hits) == 1, f"{token} 在台账里出现 {len(hits)} 次：{led}"
    return hits[0]


class Test人数那一档:
    def test_空表是空列表而不是零条汇总(self, db):
        """脚本侧靠这一条区分"库里真没人举报"与"读不出来"，所以空必须读成空列表。"""
        _clear(db)
        assert ledger(db) == []

    def test_同一个人刷三次折成一档但条数照给(self, db):
        _clear(db)
        _share(db, "tok-same")
        for _ in range(3):
            _report(db, "tok-same", bucket="同一个人")
        g = _one(ledger(db), "tok-same")
        assert (g.total, g.reporters) == (3, 1), \
            f"没按 bucket 去重，或者把 total 一起折掉了：{g}"

    def test_bucket为空时每行各算一个人(self, db):
        _clear(db)
        _share(db, "tok-null")
        _report(db, "tok-null", bucket=None)
        _report(db, "tok-null", bucket=None)
        g = _one(ledger(db), "tok-null")
        assert g.reporters == 2, f"NULL 被折成同一个未知的人了（少报人数）：{g}"

    def test_具名与未知混着算不重不漏(self, db):
        _clear(db)
        _share(db, "tok-mix")
        _report(db, "tok-mix", bucket="甲")
        _report(db, "tok-mix", bucket="甲")
        _report(db, "tok-mix", bucket=None)
        _report(db, "tok-mix", bucket="乙")
        g = _one(ledger(db), "tok-mix")
        assert (g.total, g.reporters) == (4, 3), f"甲折一次、两条 NULL 各一次、乙一次＝3：{g}"

    def test_不同token上的同一个人算两次(self, db):
        """去重的作用域是"这篇上有几个人"，不是"全站有几个人"——跨篇合并会把两篇的
        严重度互相抵掉（同一个人举报五篇，读成"只有一个人举报过"）。"""
        _clear(db)
        _share(db, "tok-a")
        _share(db, "tok-b")
        _report(db, "tok-a", bucket="同一个人")
        _report(db, "tok-b", bucket="同一个人")
        led = ledger(db)
        assert _one(led, "tok-a").reporters == 1
        assert _one(led, "tok-b").reporters == 1


class Test页面状态:
    def test_三档各读对各(self, db):
        _clear(db)
        _share(db, "tok-live", active=True)
        _share(db, "tok-gone", active=False)
        _report(db, "tok-live", bucket="甲")
        _report(db, "tok-gone", bucket="甲")
        _report(db, "tok-ghost", bucket="甲")  # 这个 token 从来没有过分享行
        led = ledger(db)
        assert _one(led, "tok-live").page_state == PAGE_LIVE
        assert _one(led, "tok-gone").page_state == PAGE_REVOKED
        assert _one(led, "tok-ghost").page_state == PAGE_NO_CODE

    def test_撤掉的码不许从台账上消失(self, db):
        """按 is_active 筛的话，"我已经撤了还有人举报"这一类整批读不到。"""
        _clear(db)
        _share(db, "tok-revoked", active=False)
        _report(db, "tok-revoked", bucket="甲")
        assert [g.token for g in ledger(db)] == ["tok-revoked"]


class Test计数与排序:
    def test_理由分布按那一列计数(self, db):
        _clear(db)
        _share(db, "tok-reason")
        _report(db, "tok-reason", reason="spam", bucket="甲")
        _report(db, "tok-reason", reason="infringement", bucket="乙")
        _report(db, "tok-reason", reason="spam", bucket="甲")
        g = _one(ledger(db), "tok-reason")
        assert g.reasons == {"spam": 2, "infringement": 1}, f"理由这一列的计数不对：{g.reasons}"

    def test_人多的一篇排在前面(self, db):
        _clear(db)
        _share(db, "tok-two")
        _share(db, "tok-one")
        _report(db, "tok-one", bucket="甲")
        _report(db, "tok-two", bucket="甲")
        _report(db, "tok-two", bucket="乙")
        assert [g.token for g in ledger(db)] == ["tok-two", "tok-one"]

    def test_人数相同按最近一次降序(self, db):
        _clear(db)
        now = datetime.now(timezone.utc)
        _share(db, "tok-old")
        _share(db, "tok-new")
        _report(db, "tok-old", bucket="甲", created_at=now - timedelta(days=7))
        _report(db, "tok-new", bucket="乙", created_at=now)
        assert [g.token for g in ledger(db)] == ["tok-new", "tok-old"]

    def test_最近时间读空的那一组不许崩也不许占前排(self, db):
        """那一列 schema 允许空，所以台账不许把空值读成异常，也不许让它抢在第一屏。

        为什么这条只能用裸 SQL 造：`created_at` 上有 `server_default=func.now()`，走 ORM 时
        显式给 `None` 会被 SQLAlchemy 当成"这列没给"，于是**填上当下时间**（10-10 实测：
        写 `created_at=None` 那行读回来是 `03:14:50`，不是 NULL）。真能读到 NULL 的路是
        手工/迁移插的那一类，所以这里也照那一路插。
        """
        _clear(db)
        _share(db, "tok-timed")
        _report(db, "tok-timed", bucket="甲")
        db.execute(text(
            "INSERT INTO share_reports (token, reason, reporter_bucket, hidden, created_at) "
            "VALUES ('tok-no-time', 'spam', '乙', 0, NULL)"
        ))
        db.commit()
        led = ledger(db)
        assert [g.token for g in led] == ["tok-timed", "tok-no-time"], \
            f"空时间不该跟有时间的那组并排，更不该排在前面：{[g.token for g in led]}"
        assert _one(led, "tok-no-time").latest_at is None

    def test_现网这一列读回来永远是_naive(self, db):
        """钉一条**平台事实**，因为下一轮有人会把"混排会 TypeError"当风险来处理。

        `DateTime(timezone=True)` 在 SQLite 上不存偏移量：aware 写进去，读回来是 naive，
        连 `+00:00` 都不留。所以实现里那句"比字符串而不是比日期对象"**不是**为了防
        `aware < naive` 那种 TypeError——今天造不出混着的两行。`probes/反向验证-举报台账.sh`
        里那一刀报★假绿★是这一条的推论，不是判据坏了。
        """
        _clear(db)
        aware = datetime.now(timezone.utc)
        _report(db, "tok-tz", bucket="甲", created_at=aware)
        got = db.query(ShareReport).filter(ShareReport.token == "tok-tz").one().created_at
        assert got.tzinfo is None, f"SQLite 竟然留下了 tzinfo，上面那段口径要重写：{got!r}"


class Test原话那一句:
    def test_封顶取的是写入顺序里最后那几条(self, db):
        """钉 `SAMPLE_LIMIT` 真的封顶，也钉它取的是**尾**而不是头。

        取尾的理由写在实现里：一个人反复举报时最早那几句多半是最初的火气。而"按写入顺序"
        不是"按时间"——现网 `created_at` 走 `func.now()`，SQLite 给的那串只到**秒**，
        同一秒里的三发时间上分不出先后，`id` 分得出，所以这里插几条而**不**设 created_at。
        """
        _clear(db)
        _share(db, "tok-many-notes")
        for i in range(SAMPLE_LIMIT + 2):
            _report(db, "tok-many-notes", bucket=f"人{i}", detail=f"第 {i} 句")
        g = _one(ledger(db), "tok-many-notes")
        assert len(g.samples) == SAMPLE_LIMIT, f"原话没封顶（{len(g.samples)} 条）：{g.samples}"
        assert g.samples == tuple(f"第 {i} 句" for i in range(2, SAMPLE_LIMIT + 2)), \
            f"取的不是最后那几条：{g.samples}"

    def test_没写补充说明的那些不进原话(self, db):
        """表单那一栏写着"（可以不填）"，所以台账不许把空行印成一句空引用。

        `None` 与"只有空白"两种都要跳过：写入侧确实把空串归成了 NULL（`landing.py` 里那句
        `or None`），可那一列没有 CHECK 约束，手工插一行 `"   "` 进得来，而它印出来读起来
        就像举报人写了话。
        """
        _clear(db)
        _share(db, "tok-blank")
        _report(db, "tok-blank", bucket="甲", detail=None)
        _report(db, "tok-blank", bucket="乙", detail="   ")
        _report(db, "tok-blank", bucket="丙", detail="")
        _report(db, "tok-blank", bucket="丁", detail="这一句有内容")
        g = _one(ledger(db), "tok-blank")
        assert g.samples == ("这一句有内容",), f"空白那三格被当成原话收进来了：{g.samples}"
        assert g.total == 4, "封顶的是原话，条数不许跟着被折掉"

    def test_原话按篇归组不许串到别篇上(self, db):
        _clear(db)
        _share(db, "tok-x")
        _share(db, "tok-y")
        _report(db, "tok-x", bucket="甲", detail="X 的那一句")
        _report(db, "tok-y", bucket="乙", detail="Y 的那一句")
        led = ledger(db)
        assert _one(led, "tok-x").samples == ("X 的那一句",)
        assert _one(led, "tok-y").samples == ("Y 的那一句",)

    def test_台账交出去的是原样文本_清洗在脚本那一层(self, db):
        """这一条钉的是**分工**，不是清洗本身：数据不许被显示层的顾虑改动。

        实现里明写了"原话不在这里清洗换行"，而清洗放在 `probes/读-举报台账.py` 的 `flat()`。
        如果哪天有人把清洗挪进台账，下面那两条展示判据仍然全绿，但台账里读到的就不是举报人
        写的那句话了——所以两边各钉一面。
        """
        _clear(db)
        _share(db, "tok-raw")
        _report(db, "tok-raw", bucket="甲", detail="第一行\n第二行")
        assert _one(ledger(db), "tok-raw").samples == ("第一行\n第二行",)


class Test脚本那一行的展示卫生:
    """`probes/读-举报台账.py` 里的 `flat()`——压平成一行是脚本那一层的活。

    为什么这段判据落在测试里，而不是"现网跑一次看看"就完：`detail` 是那张**公开表单**收回来
    的自由文本，谁都能在补充说明里写一行假日志。带换行的内容打进终端会把下一行伪造成任意东西
    （与 §8.193 第 2 条那支 `_verified_aud` 的日志注入是同族，那条的修法是 `repr`，这里不能照抄
    ——`repr` 会把中文转成 `\\uXXXX`，而台账上要读的恰恰是中文）。而"跑一次现网"永远读不到这一发：
    现网那张表现在是空的，**零条数据的探针证不了任何展示逻辑**。
    """

    def test_换行不许原样进终端(self):
        forged = "侵权\n2026-10-10 18:00:00 INFO 收到举报 token=aaaa reason=spam"
        line = flat(forged)
        assert "\n" not in line and "\r" not in line, f"压平没做成，台账会被伪造成两行：{line!r}"
        # 被伪造的那一句必须**还在同一行里**：藏掉换行不等于把内容删了，读的人得看得见。
        assert "收到举报" in line and "⏎" in line

    def test_其余控制字符换成可见码而不是原样吐出(self):
        assert flat("a\x00b\x1bc\x7fd") == "a<00>b<1b>c<7f>d", \
            "NUL/ESC/DEL 原样吐进终端等于让举报人控制那台终端的光标与标题"

    def test_中文原话不许被转义成读不懂的样子(self):
        """这条就是"为什么不用 `repr()` 了事"的成本说明——转义对了，人读不了等于没读。"""
        assert flat("标题里有手机号 13800001234") == "标题里有手机号 13800001234"

    def test_超长那一句限长(self):
        """写入侧本来就把 `detail` 截到 `DETAIL_MAX`，这里再限一次是因为台账一行放不下长篇。
        120 是这一支的展示预算，改它得连这条一起改——别让它变成一句没人知道的魔法数。"""
        assert len(flat("很" * 500)) == 120
