"""举报台账读取侧 `services/report_ledger.py` 的用例。

这张表只有写入（`routes/landing.py` 的举报表单）与删除（注销级联），**读取侧是这一批补的**，
所以这里钉的都是"读出来长什么样"的口径，而不是一条举报能不能落库（那在 `test_landing_page.py`）。
要紧的六条：

① **同一个人在同一天刷 N 次折成一档**——`reporter_bucket` 是去重的键。字段就叫
`reporter_days` 不叫 `reporters`：那一列的盐**按天轮换**，同一个人跨天会得到两个桶，
把它读成"人数"是 10-10 那轮审计抓出来的原话。
② **`bucket` 为 NULL 的每条各算一个人**（宁可多算不可漏算）。这一档从 10-10 起**写入侧也走得到**
（拍板 #184 甲：`_bucket` 读的是 ASGI 给的客户端地址，拿不到就落空；在那之前它借 `slowapi`
拿不到地址时那个字面量 `127.0.0.1`，"不知道是谁"的行全被折进同一个桶）。写入侧那两面尺子在
`tests/test_landing_page.py`，本文件只管台账**怎么读**这一档。
③ **撤掉的、过期的、从来不存在码都要出现**并按状态标出来——只 join 生效分享的那一类读法
会让"先举报、后撤回"整批消失。状态那一档**必须问 `sharing.is_expired`**，不许在这里再写一份。
④ **时间戳混着 naive 与 aware 不许崩，而且比的必须是那个瞬间**（10-10 实测：SQLite 这一列
绑定侧丢偏移量、结果侧认偏移量，两种形状都真能出现；裸日期比较在取"最近一次"那一步就抛
`TypeError`，抛点不在排序那两行）。
⑤ **`hidden` 那一格不许进台账**——两边各钉一面：结构面（字段名集合）与行为面（置真之后数字不许变）。
⑥ **原话那一句走的是展示卫生，不是数据清洗**——台账交出原样文本，探针脚本负责压平成一行；
清洗放进哪一层是分工，两面都要有尺子，否则下一轮就会漂。

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
    PAGE_EXPIRED, PAGE_LIVE, PAGE_NO_CODE, PAGE_REVOKED, SAMPLE_LIMIT, ReportGroup, ledger,
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


def _share(db, token, active=True, expires_at=None):
    n = Note(user_id="1", title=f"第 {next(_counter)} 篇", source_type="manual",
             tags=[], key_points=[], key_links=[])
    db.add(n)
    db.commit()
    s = Share(user_id="1", note_id=n.id, token=token, title="那一篇",
              summary="摘", tags=[], key_points=[], key_links=[],
              author_name="某某", is_active=active, expires_at=expires_at)
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


def _raw_report(db, token, bucket="b1", created_at="2026-10-10 03:30:00+08:00"):
    """绕过 ORM 插一行——只为造出**走 ORM 造不出来**的那两种形状：`created_at` 带偏移量、
    以及 NULL。绑定参数走不了，所以字符串照原样进列（SQLite 那列本质是 TEXT）。
    """
    db.execute(text(
        "INSERT INTO share_reports (token, reason, reporter_bucket, hidden, created_at) "
        "VALUES (:tok, 'spam', :b, 0, :ts)"
    ), {"tok": token, "b": bucket, "ts": created_at})
    db.commit()


def _one(led, token):
    hits = [g for g in led if g.token == token]
    assert len(hits) == 1, f"{token} 在台账里出现 {len(hits)} 次：{led}"
    return hits[0]


class Test人天那一档:
    def test_空表是空列表而不是零条汇总(self, db):
        """脚本侧靠这一条区分"库里真没人举报"与"读不出来"，所以空必须读成空列表。"""
        _clear(db)
        assert ledger(db) == []

    def test_同一个人一天里刷三次折成一档但条数照给(self, db):
        _clear(db)
        _share(db, "tok-same")
        for _ in range(3):
            _report(db, "tok-same", bucket="同一个人同一天")
        g = _one(ledger(db), "tok-same")
        assert (g.total, g.reporter_days) == (3, 1), \
            f"没按 bucket 去重，或者把 total 一起折掉了：{g}"

    def test_bucket为空时每行各算一个人(self, db):
        _clear(db)
        _share(db, "tok-null")
        _report(db, "tok-null", bucket=None)
        _report(db, "tok-null", bucket=None)
        g = _one(ledger(db), "tok-null")
        assert g.reporter_days == 2, f"NULL 被折成同一个未知的人了（少报人数）：{g}"

    def test_具名与未知混着算不重不漏(self, db):
        _clear(db)
        _share(db, "tok-mix")
        _report(db, "tok-mix", bucket="甲")
        _report(db, "tok-mix", bucket="甲")
        _report(db, "tok-mix", bucket=None)
        _report(db, "tok-mix", bucket="乙")
        g = _one(ledger(db), "tok-mix")
        assert (g.total, g.reporter_days) == (4, 3), \
            f"甲折一次、两条 NULL 各一次、乙一次＝3：{g}"

    def test_去重的作用域是一篇而不是全站(self, db):
        """这条是 10-10 审计补的牙。原版给两篇各插**同一个**桶，读起来像"跨篇不许合并"，
        可把去重集合整块提到循环外面（真正的写坏形状）也照样给 (1,1)——那条判据**没有牙**。
        现在两篇的桶集合有交集但不相同：正确 = (1, 2)，全局折一次 = (2, 2)，当场红。
        """
        _clear(db)
        _share(db, "tok-a")
        _share(db, "tok-b")
        _report(db, "tok-a", bucket="甲")
        _report(db, "tok-a", bucket="甲")
        _report(db, "tok-b", bucket="甲")
        _report(db, "tok-b", bucket="乙")
        led = ledger(db)
        assert _one(led, "tok-a").reporter_days == 1, f"tok-a 上只有甲一个人：{led}"
        assert _one(led, "tok-b").reporter_days == 2, f"tok-b 上甲与乙两个人：{led}"


class Test页面状态:
    def test_四档各读对各(self, db):
        _clear(db)
        _share(db, "tok-live", active=True)
        _share(db, "tok-gone", active=False)
        _share(db, "tok-expired", active=True,
               expires_at=datetime.now(timezone.utc) - timedelta(days=1))
        _report(db, "tok-live", bucket="甲")
        _report(db, "tok-gone", bucket="甲")
        _report(db, "tok-expired", bucket="甲")
        _report(db, "tok-ghost", bucket="甲")  # 这个 token 从来没有过分享行
        led = ledger(db)
        assert _one(led, "tok-live").page_state == PAGE_LIVE
        assert _one(led, "tok-gone").page_state == PAGE_REVOKED
        # `is_active=1` 但那页其实早就 404 了——只看 is_active 会把它打成"公开中"，
        # 而一本说假话的台账比一本少一列的台账更坏。口径必须问 `sharing.is_expired`。
        assert _one(led, "tok-expired").page_state == PAGE_EXPIRED, \
            "过期那一档没走现成那个出处，公开中的读数在说谎"
        assert _one(led, "tok-ghost").page_state == PAGE_NO_CODE

    def test_撤掉的码不许从台账上消失(self, db):
        """这一档的来源是**先举报、后撤回**；撤了之后新举报收不进来（`submit_report` 走
        `active_share_by_token`，那条 404 由 `test_landing_page.py` 钉着）。所以这里必须
        自己把顺序走一遍：先插举报，再把它撤掉。"""
        _clear(db)
        _share(db, "tok-revoked", active=True)
        _report(db, "tok-revoked", bucket="甲")
        db.query(Share).filter(Share.token == "tok-revoked").update({"is_active": False})
        db.commit()
        led = ledger(db)
        assert [g.token for g in led] == ["tok-revoked"]
        assert led[0].page_state == PAGE_REVOKED


class Test计数与排序:
    def test_理由分布按那一列计数(self, db):
        _clear(db)
        _share(db, "tok-reason")
        _report(db, "tok-reason", reason="spam", bucket="甲")
        _report(db, "tok-reason", reason="infringement", bucket="乙")
        _report(db, "tok-reason", reason="spam", bucket="甲")
        g = _one(ledger(db), "tok-reason")
        assert g.reasons == {"spam": 2, "infringement": 1}, f"理由这一列的计数不对：{g.reasons}"

    def test_人多的那篇排在前面(self, db):
        _clear(db)
        _share(db, "tok-two")
        _share(db, "tok-one")
        _report(db, "tok-one", bucket="甲")
        _report(db, "tok-two", bucket="甲")
        _report(db, "tok-two", bucket="乙")
        assert [g.token for g in ledger(db)] == ["tok-two", "tok-one"]

    def test_档数相同按最近一次降序(self, db):
        _clear(db)
        now = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None)
        _share(db, "tok-old")
        _share(db, "tok-new")
        _report(db, "tok-old", bucket="甲", created_at=now - timedelta(days=7))
        _report(db, "tok-new", bucket="乙", created_at=now)
        assert [g.token for g in ledger(db)] == ["tok-new", "tok-old"]

    def test_最近时间读空的那一组不许崩也不许占前排(self, db):
        """那一列 schema 允许空，所以台账不许把空值读成异常，也不许让它抢在第一屏。

        为什么这条只能用裸 SQL 造：`created_at` 上有 `server_default=func.now()`，走 ORM 时
        显式给 `None` 会被 SQLAlchemy 当成"这列没给"——见下面那条专门钉它的判据。
        """
        _clear(db)
        _share(db, "tok-timed")
        _report(db, "tok-timed", bucket="甲")
        _raw_report(db, "tok-no-time", bucket="乙", created_at=None)
        led = ledger(db)
        assert [g.token for g in led] == ["tok-timed", "tok-no-time"], \
            f"空时间不该跟有时间的那组并排，更不该排在前面：{[g.token for g in led]}"
        assert _one(led, "tok-no-time").latest_at is None

    def test_同一篇上混着_naive_与带偏移的行不许崩(self, db):
        """10-10 审计撞出来的那一条，也是实现里 `_instant()` 存在的**第一**理由。

        `DateTime(timezone=True)` 在 SQLite 上：绑定侧丢偏移量，**结果侧却认偏移量**——
        手工插的 `'…+08:00'` 读回来是 aware。于是同一组里 naive 与 aware 真的会同时出现，
        而取"最近一次"那一步是裸的 `max()`：两种形状一比就抛
        `TypeError: can't compare offset-naive and offset-aware datetimes`。
        抛点不在那两行 `sort`（那里早就比的是字符串），所以原来那两把刀都扎不到它。
        """
        _clear(db)
        _share(db, "tok-mixed-tz")
        _report(db, "tok-mixed-tz", bucket="甲",
                created_at=datetime(2026, 10, 10, 3, 0, 0))
        _raw_report(db, "tok-mixed-tz", bucket="乙", created_at="2026-10-10 12:00:00+08:00")
        led = ledger(db)
        assert _one(led, "tok-mixed-tz").total == 2

    def test_比的是那个瞬间而不是那串墙上时间(self, db):
        """`_instant()` 的另一半：aware 先换算成 UTC，否则同一瞬间会因为写法排出先后。

        实测：ORM 写 `11:00+08:00` 落库是 `'2026-10-10 11:00:00'`（**丢字面、不换算**），
        而 `03:00Z` 落库是 `'…03:00:00'`——两者是同一瞬间，盘上却差 8 小时。
        这里用裸 SQL 保住偏移量，让正确的实现（换算后比）与错的实现（按墙上字面比）
        给出**相反**的顺序：`03:30+08:00` 其实是 `2025…19:30Z` 那一侧，比 `03:00Z` 早。
        """
        _clear(db)
        _share(db, "tok-utc-later")
        _share(db, "tok-offset-earlier")
        _report(db, "tok-utc-later", bucket="甲", created_at=datetime(2026, 10, 10, 3, 0, 0))
        _raw_report(db, "tok-offset-earlier", bucket="乙", created_at="2026-10-10 03:30:00+08:00")
        assert [g.token for g in ledger(db)] == ["tok-utc-later", "tok-offset-earlier"], \
            "把墙上字面当时间序了：带 +08 的那发其实更早"


class Test时间与默认值这两条前提:
    """两条**平台事实**，都不测 `ledger()` 一个字符，所以别把它们算进"覆盖台账的尺子"里。

    留着的理由不是"聊备一格"：台账的实现与注释直接引用这两个行为，而这两个行为都不是常识
    （一个是 SQLAlchemy 的 SQLite 方言，一个是 ORM 对 `None` 的处理）。量法写在这里，
    下一轮谁要改实现就能复跑。
    """

    def test_走ORM写入的这一列读回来是_naive_且丢偏移不换算(self, db):
        _clear(db)
        same_instant_utc = datetime(2026, 10, 10, 3, 0, tzinfo=timezone.utc)
        same_instant_cst = same_instant_utc.astimezone(timezone(timedelta(hours=8)))
        assert same_instant_utc == same_instant_cst  # 钉"这两个是同一瞬间"，否则实验没意义
        _report(db, "tok-tz", bucket="甲", created_at=same_instant_utc)
        _report(db, "tok-tz", bucket="乙", created_at=same_instant_cst)
        got = [r.created_at for r in
               db.query(ShareReport).filter(ShareReport.token == "tok-tz").order_by(ShareReport.id)]
        assert all(v.tzinfo is None for v in got), f"绑定侧竟然留下了 tzinfo：{got!r}"
        # 同一瞬间落成了两个值 ⇒ 它丢的是**字面**、没换算。台账因此不许信"这一列都是同一口径"，
        # 只能自己把 aware 换算回来（另一条判据钉那一半）。
        assert got[0] != got[1], f"SQLite 居然换算了 UTC，上面那句口径要重写：{got!r}"

    def test_显式写_created_at_为_None_会被_server_default_填上(self, db):
        """这一条把 §8.194 里那句"实测"从**叙述**升成**判据**：造 NULL 只能走裸 SQL。"""
        _clear(db)
        _report(db, "tok-none", bucket="甲", created_at=None)
        got = db.query(ShareReport).filter(ShareReport.token == "tok-none").one().created_at
        assert got is not None, "ORM 显式给 None 竟然真写出了 NULL，那上面那条裸 SQL 就不必了"


class Test那一格死列不许进来:
    """`hidden` 那一格：模型注释写"先隐藏待核"，可没人读它。台账不许把它抄进报告。

    两面各钉一条：结构面（谁往 `ReportGroup` 上再加一格、或把 `reporter_days` 改名回
    "人数"那种冒充，都会当场红），行为面（有人拿 `hidden` 参与计算也红）。
    """

    def test_台账交出的字段就是那七格(self, db):
        assert set(ReportGroup.__dataclass_fields__) == {
            "token", "total", "reporter_days", "page_state", "reasons", "latest_at", "samples",
        }, "字段集合变了：加格子要连着改探针与判据，改名字要对着口径①那句"

    def test_置真了也不许改动台账的任何数字(self, db):
        _clear(db)
        _share(db, "tok-hidden")
        _report(db, "tok-hidden", bucket="甲")
        _report(db, "tok-hidden", bucket="乙")
        before = _one(ledger(db), "tok-hidden")
        db.execute(text("UPDATE share_reports SET hidden = 1 WHERE token = 'tok-hidden'"))
        db.commit()
        after = _one(ledger(db), "tok-hidden")
        assert (after.total, after.reporter_days, after.reasons) == \
               (before.total, before.reporter_days, before.reasons), \
            f"hidden 进了计算：{before} → {after}"
        assert after.page_state == PAGE_LIVE, "隐藏是另一件事，不许顺手改页面状态那一档"


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
        如果哪天有人把清洗挪进台账，下面那几条展示判据仍然全绿，但台账里读到的就不是举报人
        写的那句话了——所以两边各钉一面。
        """
        _clear(db)
        _share(db, "tok-raw")
        _report(db, "tok-raw", bucket="甲", detail="第一行\n第二行")
        assert _one(ledger(db), "tok-raw").samples == ("第一行\n第二行",)


class Test脚本那一行的展示卫生:
    """`probes/读-举报台账.py` 里的 `flat()`——压平成一行是脚本那一层的活。

    为什么这段判据落在测试里，而不是"现网跑一次看看"就完：`detail` 是那张**公开表单**收回来
    的自由文本，谁都能在补充说明里写一行假日志（与 §8.193 第 2 条那支 `_verified_aud` 的
    日志注入同族）。而"跑一次现网"永远读不到这一发：**这张表最后一次现网读数是 0 行**
    （§8.185，10-09 23:45），零条数据的探针证不了任何展示逻辑。
    """

    def test_换行不许原样进终端(self):
        forged = "侵权\n2026-10-10 18:00:00 INFO 收到举报 token=aaaa reason=spam"
        line = flat(forged)
        assert "\n" not in line and "\r" not in line, f"压平没做成，台账会被伪造成两行：{line!r}"
        # 被伪造的那一句必须**还在同一行里**：藏掉换行不等于把内容删了，读的人得看得见。
        assert "收到举报" in line and "⏎" in line

    def test_其余控制字符换成可见码而不是原样吐出(self):
        assert flat("a\x00b\x1bc\x7fd") == "a␀00b␀1bc␀7fd", \
            "NUL/ESC/DEL 原样吐进终端等于让举报人控制那台终端的光标与标题"

    def test_可见码的写法不许举报人自己能打出来(self):
        """编码必须**不能被原样抄进输入**，否则"清洗"本身变成新的伪造面。

        原来用 `<%02x>`：举报人在补充说明里打一串 `<1b>`，印出来与一个真 ESC 完全一样，
        读的人分不清"他写了这三个字符"还是"他送了一个 0x1b"。换成 `␀1b` 之后那一格
        要打得出来得先敲 U+2400——键盘上没有。
        """
        typed = flat("<1b>")      # 举报人自己打的字面
        real = flat("\x1b")       # 真的一个 ESC
        assert typed == "<1b>", f"字面那三个字符不该被改动：{typed!r}"
        assert real != typed, f"真控制字符与它伪造的字面撞成同一个读数：{real!r}"

    def test_中文原话不许被转义成读不懂的样子(self):
        """这条顺手把 10-10 我写错的那句改口：**Python 3 的 `repr()` 不转义非 ASCII**
        （实测 `repr('标题里有手机号')` 原样出中文）。所以"不照抄 repr"的真实理由不是
        中文会被变成 `\\uXXXX`，而是它给整句加首尾引号、把换行打成 `\\n` 两个字符
        （看不出那本来是个换行）、控制字符用 `\\x00` 这种人人打得出来的写法。
        """
        assert flat("标题里有手机号 13800001234") == "标题里有手机号 13800001234"
        assert flat("侵权\n后面") != repr("侵权\n后面"), "repr 那条路给句子加了引号"

    def test_超长那一句限长而且看得出被截(self):
        """120 是这一支的展示预算，改它得连这条一起改——别让它变成一句没人知道的魔法数。

        光钉长度不够（10-10 审计实测：500 个"很"砍到 120 个字，尾巴读起来就像原话说完了）。
        所以两半都要：不超预算一个字不动，超了就**必须留下记号**。
        """
        assert flat("很" * 60) == "很" * 60, "没超预算不许动内容"
        long_line = flat("很" * 500)
        assert len(long_line) == 120
        assert long_line.endswith("…"), f"截断没留记号，读的人会以为那就是原话全部：{long_line[-8:]!r}"

    def test_截断不许把可见码切成半个(self):
        """`␀1b` 被砍成 `␀1` 就成了一个新的假读数（读的人以为那是某种没见过的记号）。

        实现走的是"整字符截"，而控制字符已经先变成四个可见字符，所以这一条防的是将来
        有人把截断改成按字节或改宽度。
        """
        line = flat("\x1b" * 40, limit=10)
        assert len(line) == 10
        assert "␀1" in line and not line.endswith("␀"), f"半个标记：{line!r}"
