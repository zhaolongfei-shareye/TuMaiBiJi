"""公开落地页 `/n/{token}` 的行为用例。

这一页是**第一个真正对全世界敞开的出口**，所以它的不变量比功能本身更要紧：

① 公开的就是快照那六列＋作者名，一列都不许多。正文、外部原文、原图、任何管理凭证
   出现在这一页上，都是"用户以为只分享了摘要"这句话当场作废。
   尺子直接取 `services/sharing.SNAPSHOT_COLUMNS`——将来谁往公开页加一列，
   必须先把那列挪进送检范围，否则这条会红（这是本文件唯一一条"钉别人家的常量"的断言，
   目的是让两处不能各改各的）。
② 撤掉的、过期的、从来不存在，回同一一句、同一张纸。能区分这几种，等于允许任何人拿一串
   token 探出"哪些曾经公开过、后来撤了"——撤回的意义被削掉一半。
③ 一律 `no-store`。撤销确认必须以缓存失效为前提（PRD F09），只改数据库状态不算撤掉。
④ 快照字段全是用户自己写的文本，**任何一处漏转义都是一条存储型 XSS**，
   而且是在我们自己域名上的 XSS。
⑤ 一条举报不许把页撤下来。那等于把审核权发给全体访客。

不出网：conftest 已把 SEC_CHECK_ENABLED 置 false，这一页本身也不调任何外部接口。
配置一律从 conftest 取（它在任何测试模块碰到 `app.*` 之前就把五个值钉死成一次性值）；
本文件不再自己 `os.environ[...]`——那样只会让"谁先 import"决定这套跑在哪个库上。
"""
import itertools
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.note import Note
from app.models.share import Share
from app.models.share_report import ShareReport
from app.services.sharing import SNAPSHOT_COLUMNS

BODY_MARK = "这段正文绝不该出现在公开页上"
ORIGINAL_MARK = "这段外部原文绝不该出现在公开页上"


@pytest.fixture(scope="module")
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.state.limiter.enabled = False  # 限流本身另有用例断"挂没挂上"
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


@pytest.fixture()
def db_session():
    s = SessionLocal()
    yield s
    s.close()


_notes = itertools.count(1)


def _note(db, **over):
    """一条分享配一篇自己的笔记。"""
    n = Note(user_id="1", title=f"第 {next(_notes)} 篇", source_type="manual",
             tags=[], key_points=[], key_links=[], **over)
    db.add(n)
    db.commit()
    return n


def _share(db, token="tok-landing-1", active=True, note=None, **over):
    """分享必须各挂各的笔记：`shares` 上有"一篇笔记只留一条生效分享"的部分唯一索引
    （`ux_shares_one_active_per_note`），全用同一个 note_id 会在第二条 INSERT 当场撞 UNIQUE。
    这个夹具跑在 SQLite 上，外键没开，所以 note_id 填个不存在的数也不会红——
    正因如此这里老老实实建笔记，不靠"测试库里查不到"蒙过去。
    """
    cols = dict(
        user_id="1",
        note_id=(note or _note(db)).id,
        token=token,
        title="京都散步，避开人潮的路线",
        summary="清晨沿鸭川散步，避开商店街的人潮。",
        tags=["旅行", "京都"],
        key_points=["06:30 出发，人最少", "先走东岸再过桥"],
        key_links=["https://example.com/kyoto"],
        source_url="https://example.com/source",
        author_name="小麦",
        is_active=active,
    )
    cols.update(over)
    s = Share(**cols)
    db.add(s)
    db.commit()
    return s


# ---- ① 白名单 ----

def test_公开页只画快照那六列与作者名(client, db_session):
    _share(db_session)
    html = client.get("/n/tok-landing-1").text
    for needle in ("京都散步，避开人潮的路线", "清晨沿鸭川散步", "旅行", "06:30 出发，人最少",
                   "https://example.com/kyoto", "https://example.com/source", "小麦"):
        assert needle in html, f"公开页少了快照里的一列：{needle}"


def test_送检名单里的每一列都真在公开页上画出来(client, db_session):
    """按名单自己喂哨兵，再逐列问页面上有没有。

    原来这一条是拿一份**写死在本文件里的元组**去比 `SNAPSHOT_COLUMNS`——它只检得出"名单被改了"，
    检不出"名单里某一列页面其实没画"，而后者才是公开页会漏内容的方向。改完之后：名单上有几列
    就喂几个哨兵，少画一列当场红；多画一列不在这儿挡（那一侧由"正文与外部原文不许出现"两条挡），
    方向仍是刻意这么定的：多检不漏检。
    """
    # 名单里有三个是 JSON **列表**列（给成字符串会被 `_list()` 当"不是列表"整列丢掉，
    # 第一版哨兵就是这么红的——红的是哨兵自己，不是页面），而 key_links / source_url 还要过
    # "只认 http(s)://"那道白名单（前者由 `test_非网址的链接列不会被渲染成可点的` 钉着），
    # 所以这两位的哨兵必须长得像网址。
    list_shaped = ("tags", "key_points", "key_links")
    url_shaped = ("key_links", "source_url")
    over = {}
    for col in SNAPSHOT_COLUMNS:
        sentinel = f"https://example.com/SNAP-{col}" if col in url_shaped else f"SNAP-{col}"
        over[col] = [sentinel] if col in list_shaped else sentinel
    _share(db_session, token="tok-snapshot-columns", **over)

    html = client.get("/n/tok-snapshot-columns").text
    for col in SNAPSHOT_COLUMNS:
        assert f"SNAP-{col}" in html, f"送检名单里有 {col}，公开页却没把它画出来"


def test_正文与外部原文不出现在公开页(client, db_session):
    """把哨兵写进**这张分享自己那篇笔记**里。

    故意不只在"另一篇没分享的笔记"里放哨兵：落地页读的只有 shares 那行，
    所以只有把正文挂在它指向的笔记上，这条才真的量得到"这一页会不会顺着 note_id 去取笔记"。
    """
    note = _note(db_session, content=BODY_MARK, original_content=ORIGINAL_MARK)
    _share(db_session, token="tok-landing-body", note=note)
    html = client.get("/n/tok-landing-body").text
    assert BODY_MARK not in html
    assert ORIGINAL_MARK not in html


# ---- ② 撤掉与不存在不可区分 ----

def test_撤掉的码与不存在的码回同一一句(client, db_session):
    _share(db_session, token="tok-landing-off", active=False)
    gone = client.get("/n/tok-landing-off")
    missing = client.get("/n/never-existed-at-all")
    assert gone.status_code == 404 and missing.status_code == 404
    assert gone.text == missing.text, "两种 404 的页面不一样，等于允许探测「谁曾经公开过」"


def test_撤掉之后快照内容一个字都不在页面上(client, db_session):
    _share(db_session, token="tok-landing-gone2", active=False)
    html = client.get("/n/tok-landing-gone2").text
    assert "京都散步" not in html and "小麦" not in html


def test_过期那张码在公开页上等于不存在(client, db_session):
    """这一页是 `active_share_by_token` 的**第二个**消费者（第一个是转存接口）。

    刻意造一条"标记还开着、但过期时间已过"的行：如果这一页自己只 `filter(is_active)`
    而不去调那个函数，这条会绿不起来——而它绿的后果是"转存接口说这码死了，
    公开页照样把内容摆出去"，两处各判各的正是那个函数注释里点名要避免的事。
    """
    past = datetime.now(timezone.utc) - timedelta(days=1)
    _share(db_session, token="tok-landing-expired", expires_at=past)
    gone = client.get("/n/tok-landing-expired")
    assert gone.status_code == 404 and "京都散步" not in gone.text
    # 三种"看不了"必须是同一一张纸，不许有过期专属的话术
    assert gone.text == client.get("/n/never-existed-at-all").text


# ---- ③ 不缓存 ----

@pytest.mark.parametrize("token,active", [("tok-nostore-on", True), ("tok-nostore-off", False)])
def test_公开页与失效页都带_no_store(client, db_session, token, active):
    _share(db_session, token=token, active=active)
    r = client.get(f"/n/{token}")
    assert "no-store" in r.headers.get("cache-control", ""), \
        "撤销确认必须以缓存失效为前提；只改数据库状态不算撤掉"


# ---- ④ 转义 ----

def test_快照里的尖括号与引号不会变成可执行的东西(client, db_session):
    _share(db_session, token="tok-xss",
           title="<script>alert(1)</script>",
           summary='"><img src=x onerror=alert(2)>',
           tags=["<b>粗</b>"],
           key_points=["<svg onload=alert(3)>"],
           author_name="</title><p>早关标签</p>")
    html = client.get("/n/tok-xss").text
    assert "<script>alert(1)</script>" not in html
    assert "onerror=alert(2)" in html                      # 转义后作为文本仍在
    assert "<img src=x" not in html
    assert "<svg onload" not in html
    assert "</title><p>" not in html


def test_非网址的链接列不会被渲染成可点的(client, db_session):
    """key_links 是客户端可写的自由列表：一条 javascript: 变成 href 就是一次点击即执行。"""
    _share(db_session, token="tok-js", key_links=["javascript:alert(1)", "https://ok.example/x"])
    html = client.get("/n/tok-js").text
    assert 'href="javascript' not in html
    assert "ok.example/x" in html


# ---- ⑤ 语言 ----

def test_界面语言跟着请求头走且能被参数覆盖(client, db_session):
    _share(db_session, token="tok-lang")
    assert "举报这篇" in client.get("/n/tok-lang").text
    en = client.get("/n/tok-lang", headers={"accept-language": "en-US,en;q=0.9"}).text
    assert "Report this note" in en and "举报这篇" not in en
    back = client.get("/n/tok-lang?lang=zh", headers={"accept-language": "en"}).text
    assert "举报这篇" in back


def test_举报页上的语言切换换的是举报页自己(client, db_session):
    """切换链接指回笔记页，用户点完"English"会以为没反应（表单还是那张表单），
    更糟的是他从举报页被踢回了公开页。所以这一条钉的是链接的**路径**，不只是参数。
    """
    _share(db_session, token="tok-lang-report")
    form = client.get("/n/tok-lang-report/report").text
    assert 'href="/n/tok-lang-report/report?lang=en"' in form, "切换链接没带上 /report 那一段"
    switched = client.get("/n/tok-lang-report/report?lang=en").text
    assert "Report this note" in switched and "<form" in switched, "切过去之后必须还是那张表单"


# ---- ⑥ 举报 ----

def test_举报落库一行且不影响页面可见(client, db_session):
    _share(db_session, token="tok-report")
    r = client.post("/n/tok-report/report", data={"reason": "spam", "detail": "广告"})
    assert r.status_code == 200
    assert "已收到" in r.text
    row = db_session.query(ShareReport).filter_by(token="tok-report").one()
    assert row.reason == "spam" and row.detail == "广告"
    assert row.hidden is False, "一条举报就把页撤下来＝把审核权发给全体访客"
    assert "京都散步" in client.get("/n/tok-report").text, "举报之后这一页必须照常在"


def test_不认识的举报类型归到其他而不是报错(client, db_session):
    _share(db_session, token="tok-report-2")
    client.post("/n/tok-report-2/report", data={"reason": "<自由发挥>", "detail": "x"})
    assert db_session.query(ShareReport).filter_by(token="tok-report-2").one().reason == "other"


def test_举报的补充说明限长(client, db_session):
    _share(db_session, token="tok-report-3")
    client.post("/n/tok-report-3/report", data={"reason": "abuse", "detail": "啊" * 5000})
    row = db_session.query(ShareReport).filter_by(token="tok-report-3").one()
    assert len(row.detail) <= 500, "匿名可写的表单不封顶长度，就是一条灌库的路"


def test_不存举报人明文地址只存哈希桶(client, db_session):
    _share(db_session, token="tok-report-4")
    client.post("/n/tok-report-4/report", data={"reason": "other", "detail": ""},
                headers={"X-Forwarded-For": "203.0.113.9"})
    row = db_session.query(ShareReport).filter_by(token="tok-report-4").one()
    assert row.reporter_bucket and "203.0.113.9" not in row.reporter_bucket


def test_撤掉的码收不到新举报表单(client, db_session):
    _share(db_session, token="tok-report-5", active=False)
    assert client.get("/n/tok-report-5/report").status_code == 404
    assert client.post("/n/tok-report-5/report", data={"reason": "spam"}).status_code == 404


def test_举报那条挂上了限流():
    """限流本身在测试里被整体关掉（`app.state.limiter.enabled = False`），
    所以"这条路由到底挂没挂上"必须单独钉一句——不挂的后果不是这次红，
    是上线之后一张匿名表单被人刷到爆而没人拦。

    slowapi 把装饰过的路由按 `模块.函数名` 记在 `_route_limits` 里，读不到就是没挂上。
    """
    from app.core.rate_limit import limiter

    key = "app.api.routes.landing.submit_report"
    assert key in limiter._route_limits, f"{key} 上没有 @limiter.limit —— 匿名举报表单裸奔"
    limits = limiter._route_limits[key]
    assert len(limits) == 1, f"这条挂了 {len(limits)} 层限流，按一条设计"
    item = limits[0].limit
    assert item.amount == 6 and item.GRANULARITY.name == "hour", \
        f"限流窗口读出来是 {item}，不是 6/hour"
