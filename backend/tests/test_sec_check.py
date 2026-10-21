"""内容安全（msgSecCheck）这条链的行为用例。

三条不变量必须钉住，它们都是这轮实测出来的口径：
① 判 risky/review 才拒；**接口没检成（unavailable）一律放行**——微信侧抖动不能变成
   "用户存不了自己的笔记"。
② 只有 manual 在**路由那一层**落库前检；外部抓取的原文不检、公开出口（创建分享）才检。
   **而 source_type 由服务端钉死，不是客户端能填的**——否则"我不检"就成了一个入参。
   ⚠ 10-22「接吧」加了一条岔口：**截图那一路在 worker 里 OCR 之后检**（`ingest_tasks._guard_screenshot_text`，
   用例在 `tests/test_ocr_flows.py::TestScreenshotContentSafety`），这条文件只管路由与分享那两侧。
③ 长文本分段送，段与段之间不能漏字。

整套不出网：conftest 已把 SEC_CHECK_ENABLED 置 false，需要走判定逻辑的用例
各自 monkeypatch check_text。
"""
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_sec.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from app.core.auth import _create_token
from app.core.config import settings
from app.core.errors import UserError
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.note import Note
from app.models.user import User
from app.services import wechat


@pytest.fixture(scope="module")
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def person(db_session):
    u = db_session.query(User).filter_by(openid="pytest-openid-person").first()
    if not u:
        u = User(openid="pytest-openid-person")
        db_session.add(u)
        db_session.commit()
    return u


@pytest.fixture()
def db_session():
    s = SessionLocal()
    yield s
    s.close()


def _stub_verdicts(monkeypatch, table):
    """把 check_text 换成"按片段查表"，并记录它收到了哪些段。"""
    seen = []

    def fake(openid, content):
        seen.append(content)
        for key, verdict in table.items():
            if key in content:
                return verdict
        return "pass"

    monkeypatch.setattr(wechat, "check_text", fake)
    return seen


# ---------------------------------------------------------------- 服务层
@pytest.fixture(autouse=True)
def _fresh_pass_memo():
    """check_text 会记住"这段文本判过正常"，用例之间必须各起各的账。

    不清的话，前一条用例喂进去的 pass 会让后一条根本走不到假 httpx，
    看起来像"断言没生效"，其实是被缓存短路了——这一轮的 QR 缓存就踩过一次。
    """
    wechat._sec_pass_cache.clear()


def test_开关关掉时不出网并且算作未检成(monkeypatch):
    called = []
    monkeypatch.setattr(wechat.httpx, "Client", lambda *a, **k: called.append(1))
    monkeypatch.setattr(settings, "SEC_CHECK_ENABLED", False)
    assert wechat.check_text("openid-x", "随便一段文本") == "unavailable"
    assert not called


def test_接口异常算未检成而不是通过(monkeypatch):
    monkeypatch.setattr(settings, "SEC_CHECK_ENABLED", True)
    monkeypatch.setattr(wechat, "_access_token_sync", lambda: (_ for _ in ()).throw(RuntimeError("boom")))
    assert wechat.check_text("openid-x", "正常内容") == "unavailable"


def test_非零错误码按类型分流(monkeypatch):
    monkeypatch.setattr(settings, "SEC_CHECK_ENABLED", True)  # conftest 默认关掉，这里要的是真分支
    class Resp:
        def __init__(self, payload):
            self._p = payload

        def json(self):
            return self._p

    class FakeClient:
        def __init__(self, payload):
            self.payload = payload

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, *a, **k):
            return Resp(self.payload)

    monkeypatch.setattr(wechat, "_access_token_sync", lambda: "fake-token")
    # 40003=openid 非法：机制静默失效，必须是 unavailable 而不是 pass
    monkeypatch.setattr(wechat.httpx, "Client", lambda *a, **k: FakeClient({"errcode": 40003, "errmsg": "invalid openid"}))
    assert wechat.check_text("bad", "内容") == "unavailable"
    # errcode 0 但 result.suggest=risky：实测赌博引流文本就是这个形状（label 20006）
    monkeypatch.setattr(wechat.httpx, "Client",
                        lambda *a, **k: FakeClient({"errcode": 0, "result": {"suggest": "risky", "label": 20006}}))
    assert wechat.check_text("ok", "内容") == "risky"


# -------------------------------------------------- 判定结果缓存（按次配额的接口）
_PASS = {"errcode": 0, "result": {"suggest": "pass", "label": 100}}
_RISKY = {"errcode": 0, "result": {"suggest": "risky", "label": 20006}}
_QUOTA_OUT = {"errcode": 45009, "errmsg": "reach max api daily quota limit"}


class _Fixed:
    """假 httpx client：回固定 payload，并数真打了几次。"""

    def __init__(self, payload, calls):
        self.payload = payload
        self.calls = calls

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, *a, **k):
        self.calls.append(1)
        payload = self.payload

        class Resp:
            def json(self):
                return payload

        return Resp()


def _wire_transport(monkeypatch, payload):
    calls = []
    monkeypatch.setattr(settings, "SEC_CHECK_ENABLED", True)
    monkeypatch.setattr(wechat, "_access_token_sync", lambda: "fake-token")
    monkeypatch.setattr(wechat.httpx, "Client", lambda *a, **k: _Fixed(payload, calls))
    return calls


def test_同一段正常文本不重复问微信(monkeypatch):
    """msgSecCheck 是按次配额的接口：未上架小程序 100 次/天（实测 2026-09-23 打到过上限）。

    一次保存原本按字段打 6 趟，而移动端保存常把没改过的字段一起 PUT 回来——
    记住判过的 pass 才谈得上有额度可用。
    """
    calls = _wire_transport(monkeypatch, _PASS)
    assert wechat.check_text("openid-m", "厦门三日路线：鼓浪屿要早去早回") == "pass"
    for _ in range(4):
        assert wechat.check_text("openid-m", "厦门三日路线：鼓浪屿要早去早回") == "pass"
    assert len(calls) == 1, f"同一段文本问了微信 {len(calls)} 次"


def test_判过正常的内容换个人要重新问(monkeypatch):
    calls = _wire_transport(monkeypatch, _PASS)
    wechat.check_text("openid-A", "同一段文本")
    wechat.check_text("openid-B", "同一段文本")
    assert len(calls) == 2, "缓存按内容共用了，绕过了另一个人的风控上下文"


def test_违规判定不缓存错了下次还能纠正(monkeypatch):
    calls = _wire_transport(monkeypatch, _RISKY)
    assert wechat.check_text("openid-m", "线上赌场 六合彩 特码") == "risky"
    assert wechat.check_text("openid-m", "线上赌场 六合彩 特码") == "risky"
    assert len(calls) == 2, "risky 进了缓存：一次误判就会跟着这段文本一辈子"


def test_没检成绝不缓存否则配额永远恢复不了(monkeypatch):
    """这条是缓存最危险的失效模式。

    45009 之后如果把"没问题"记下来，第二天额度恢复了也不会再检——内容安全从此静默关掉，
    而日志里干干净净。所以 unavailable 必须每次都真打。
    """
    calls = _wire_transport(monkeypatch, _QUOTA_OUT)
    for _ in range(3):
        assert wechat.check_text("openid-m", "一段正常文本") == "unavailable"
    assert len(calls) == 3, "unavailable 被缓存了，配额恢复之后将永远不再送检"

    monkeypatch.setattr(wechat.httpx, "Client", lambda *a, **k: _Fixed(_PASS, calls))
    assert wechat.check_text("openid-m", "一段正常文本") == "pass"
    assert len(calls) == 4, "额度恢复后第一次没有真的重新检"


def test_判定缓存有上限(monkeypatch):
    calls = _wire_transport(monkeypatch, _PASS)
    for i in range(wechat._SEC_PASS_CACHE_MAX + 30):
        wechat.check_text("openid-big", f"第 {i} 段各不相同的正常文本")
    assert len(wechat._sec_pass_cache) == wechat._SEC_PASS_CACHE_MAX
    # 最老的那条已经被挤出去，再问一次就是真打
    before = len(calls)
    wechat.check_text("openid-big", "第 0 段各不相同的正常文本")
    assert len(calls) == before + 1, "最老的没被挤掉，上限没生效"
    # 而最近用过的那条还在，不该再打
    wechat.check_text("openid-big", f"第 {wechat._SEC_PASS_CACHE_MAX + 29} 段各不相同的正常文本")
    assert len(calls) == before + 1, "刚用过的被判掉了，缓存留的不是最近使用的"


def test_额度打光时日志要说清这件事(monkeypatch, caplog):
    """45009 和一次网络抖动在日志里长得一样的话，就等于没有告警。

    按"会不会让机制静默失效"分级：额度打光是 ERROR，不是 warning。
    """
    import logging

    _wire_transport(monkeypatch, _QUOTA_OUT)
    with caplog.at_level(logging.DEBUG, logger="app.services.wechat"):
        assert wechat.check_text("openid-x", "一段文本") == "unavailable"
    lines = [r for r in caplog.records if "内容安全" in r.getMessage()]
    assert lines, "额度打光这件事在日志里没留下任何痕迹"
    assert all(r.levelno >= logging.ERROR for r in lines), \
        "额度打光只是 warning：今天的检查看作没做，没人会注意到"
    assert "100 次/天" in lines[0].getMessage()
    assert "access_token" not in lines[0].getMessage()


def test_命中违规抛中文错误给得到toast(monkeypatch):
    _stub_verdicts(monkeypatch, {"赌博": "risky"})
    with pytest.raises(UserError) as e:
        wechat.enforce_text_safety("openid-x", "标题里带赌博两个字")
    assert str(e.value) == "内容包含违规信息，无法保存，请修改后再试"

    _stub_verdicts(monkeypatch, {"可疑": "review"})
    with pytest.raises(UserError) as e:
        wechat.enforce_text_safety("openid-x", "一段可疑文本")
    assert "人工复核" in str(e.value)


def test_接口没检成时放行不阻断保存(monkeypatch):
    _stub_verdicts(monkeypatch, {"anything": "unavailable"})
    wechat.enforce_text_safety("openid-x", "完全正常的一段笔记")  # 不抛


def test_长文本分段不漏字(monkeypatch):
    seen = _stub_verdicts(monkeypatch, {"尾部脏词": "risky"})
    text = "厦门" * 1200 + "尾部脏词"  # 2400+ 字，脏词落在第二段
    with pytest.raises(UserError):
        wechat.enforce_text_safety("openid-x", text)
    assert len(seen) >= 2
    assert "".join(seen).startswith("厦门" * 1200)
    assert "尾部脏词" in seen[-1]


def test_超窗那句日志不许带openid原值(monkeypatch, caplog):
    """10-22 现网探针撞出来的：那句"只检了前 16000 字"原来把 openid 整串打进日志（站长一句「改」）。

    两边都要钉：那句**还在**（超窗这件事必须有人看得见），且句里**不能有原值**——
    只把参数删掉、留一句"长度 0"的糊话，也算这道闸白装。
    """
    import logging

    seen = _stub_verdicts(monkeypatch, {})
    sentinel = "oPYTESTSENTINELabcdefghijkl1234567890"
    text = "厦" * (wechat.SEC_CHUNK * wechat.SEC_MAX_CHUNKS + 10)
    with caplog.at_level(logging.WARNING, logger="app.services.wechat"):
        wechat.enforce_text_safety(sentinel, text)
    lines = [r.getMessage() for r in caplog.records if "未送检" in r.getMessage()]
    assert lines, "超窗那句日志没了 ⇒ 没人知道这一篇只检了前段"
    assert all(sentinel not in m for m in lines), f"日志里还带着 openid 原值：{lines}"
    assert f"openid 长度 {len(sentinel)}" in lines[0]
    assert len("".join(seen)) == wechat.SEC_CHUNK * wechat.SEC_MAX_CHUNKS


def test_列表字段和空值都能吃(monkeypatch):
    seen = _stub_verdicts(monkeypatch, {})
    wechat.enforce_text_safety("openid-x", "标题", ["要点一", "要点二"], None, [], "")
    assert any("要点一" in s and "要点二" in s for s in seen)


# ---------------------------------------------------------------- 路由层
def _hdr(uid):
    return {"Authorization": "Bearer " + _create_token(uid)}


def _mknote(db, uid, title, source_type="manual", **kw):
    n = Note(user_id=str(uid), title=title, source_type=source_type, tags=[], key_points=[], **kw)
    db.add(n)
    db.commit()
    return n.id


def test_手动笔记命中违规时存不下来(client, db_session, person, monkeypatch):
    _stub_verdicts(monkeypatch, {"脏内容": "risky"})
    r = client.post("/api/notes/", headers=_hdr(person.id),
                    json={"title": "这段脏内容不能存", "source_type": "manual"})
    assert r.status_code == 400
    assert "违规" in r.json()["detail"]
    assert db_session.query(Note).filter(Note.title.like("%脏内容%")).count() == 0


def test_客户端自称抓取来源也没用_照检不误(client, db_session, person, monkeypatch):
    """source_type 曾是客户端可填字段，而它正是"要不要过内容安全"的开关。

    那时只要 POST 时写 source_type:"url"，随便什么违规文本都能 200 存进去，
    _guard_manual_text 一句 != "manual" 就直接 return 了。现在这个字段由服务端钉死，
    入参里多带的会被 Pydantic 忽略。
    """
    seen = _stub_verdicts(monkeypatch, {"脏内容": "risky"})
    r = client.post("/api/notes/", headers=_hdr(person.id),
                    json={"title": "自称抓来的脏内容", "source_type": "url"})
    assert r.status_code == 400, f"客户端自称抓取来源就绕过了内容安全：{r.status_code}"
    assert seen, "内容安全一次都没被调用"
    assert db_session.query(Note).filter(Note.title.like("%脏内容%")).count() == 0


@pytest.mark.parametrize("st,should_check", [
    ("manual", True),
    ("web_article", False),
    ("wechat_article", False),
    ("screenshot", False),
    ("", False),
])
def test_只有manual在落库前检_抓取与截图来源不检(st, should_check):
    """这条口径本身没变，变的是"谁说了算"——判定依据只能是服务端写进去的值。

    外部原文里出现一个敏感词就让整条笔记存不下来是误伤，所以**路由这一道闸**只检 manual。
    ⚠ 10-22 站长「接吧」之后，"screenshot 完全不检"这句**不再成立**：截图那一路在 **worker 里 OCR 跑完之后**
    检（`ingest_tasks._guard_screenshot_text`，PRD §8.431／§8.432 已上现网）。
    这条用例钉的只是"路由那一层照旧放过它"，别拿它的绿去说"截图没人检"。
    URL 抓取（web_article／wechat_article）的原文确实这一层不检，公开那一刻由 shares 那道闸兜。
    """
    from app.api.routes import notes as notes_route

    calls = []
    note = Note(title="一段文本", source_type=st)
    with pytest.MonkeyPatch.context() as m:
        m.setattr(notes_route, "enforce_text_safety", lambda *a, **kw: calls.append(a))
        notes_route._guard_manual_text(User(openid="o"), note)
    assert bool(calls) is should_check, f"source_type={st!r} 检了 {len(calls)} 次"


def test_公开分享那一刻必须检(client, db_session, person, monkeypatch):
    nid = _mknote(db_session, person.id, "一篇带脏内容的抓取文章", source_type="url")
    _stub_verdicts(monkeypatch, {"脏内容": "risky"})
    r = client.post("/api/shares/", headers=_hdr(person.id), json={"note_id": nid})
    assert r.status_code == 400
    assert "违规" in r.json()["detail"]


def test_检过的笔记才拿得到分享token(client, db_session, person, monkeypatch):
    _stub_verdicts(monkeypatch, {})
    nid = _mknote(db_session, person.id, "正常的分享标题", summary="正常摘要")
    r = client.post("/api/shares/", headers=_hdr(person.id), json={"note_id": nid})
    assert r.status_code == 200
    assert len(r.json()["token"]) >= 16


def test_编辑已有笔记的正文也会复检(client, db_session, person, monkeypatch):
    nid = _mknote(db_session, person.id, "先存下来", source_type="manual", content="原正文")
    _stub_verdicts(monkeypatch, {"改脏了": "risky"})
    r = client.put(f"/api/notes/{nid}", headers=_hdr(person.id), json={"content": "这段改脏了"})
    assert r.status_code == 400

def test_请求体必须是原样UTF8不能转义中文(monkeypatch):
    """微信 msgSecCheck 不解析 \\uXXXX：转义过的体它当普通字符串看，永远判正常。

    这条不是风格问题，是"内容安全到底有没有在生效"的分水岭——httpx 的 json= 参数
    默认 ensure_ascii=True，用它就等于把这道机制静默关掉。实测同一段赌博引流文本：
    原样 UTF-8 体判 risky(20006)，转义体判 pass。
    """
    import json

    captured = {}

    class Resp:
        def json(self):
            return {"errcode": 0, "result": {"suggest": "pass", "label": 100}}

    class FakeClient:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, url, content=None, headers=None, **kw):
            captured["body"] = content
            captured["kw"] = kw
            return Resp()

    monkeypatch.setattr(settings, "SEC_CHECK_ENABLED", True)
    monkeypatch.setattr(wechat, "_access_token_sync", lambda: "fake-token")
    monkeypatch.setattr(wechat.httpx, "Client", lambda *a, **k: FakeClient())
    assert wechat.check_text("openid-x", "线上赌场 六合彩 特码") == "pass"

    body = captured["body"]
    assert isinstance(body, bytes), "必须显式给字节体，不能用 json= 让 httpx 自己序列化"
    assert not captured["kw"], f"不该再传 {list(captured['kw'])} 给 post"
    assert "线上赌场" in body.decode("utf-8")
    assert b"\\u7ebf" not in body, "中文被转义了，微信会一律判正常"
    assert json.loads(body.decode("utf-8"))["content"] == "线上赌场 六合彩 特码"


# ------------------------------------------------- 名片与分类这两个写口（站长 10-21「前端能接都接」）
def test_名片名称命中违规时存不下来(client, db_session, person, monkeypatch):
    """名称会印在每一张分享卡片上＝公开可见，此前这条口一个字都没送检。"""
    from app.models.user_profile import UserProfile

    _stub_verdicts(monkeypatch, {"脏内容": "risky"})
    r = client.put("/api/user/profile", headers=_hdr(person.id), json={"name": "我的脏内容名片"})
    assert r.status_code == 400, f"名称没过内容安全就存下了：{r.status_code}"
    assert "违规" in r.json()["detail"]
    row = db_session.query(UserProfile).filter_by(user_id=str(person.id)).first()
    assert row is None or not (row.name or "").strip(), "被拒的名称落库了"


def test_一句话命中违规同样拒(client, db_session, person, monkeypatch):
    from app.models.user_profile import UserProfile

    _stub_verdicts(monkeypatch, {"脏内容": "risky"})
    r = client.put("/api/user/profile", headers=_hdr(person.id), json={"slogan": "脏内容一句话"})
    assert r.status_code == 400
    row = db_session.query(UserProfile).filter_by(user_id=str(person.id)).first()
    assert row is None or not (row.slogan or "").strip()


def test_只改亮度那一档时不许白打配额(client, person, monkeypatch):
    """这个接口按次计配额：请求里没有名称与一句话，就该一趟都不出。"""
    seen = _stub_verdicts(monkeypatch, {})
    r = client.put("/api/user/profile", headers=_hdr(person.id), json={"bg_dim": 5})
    assert r.status_code == 200
    assert seen == [], f"这一趟没带任何要检的字段，却打了 {len(seen)} 次内容安全"


def test_接口没检成时名片照存(client, person, monkeypatch):
    """微信侧挂了不能变成"名片存不了"——这条策略与笔记那道口一字一样。"""
    from app.models.user_profile import UserProfile

    _stub_verdicts(monkeypatch, {"脏内容": "unavailable"})
    r = client.put("/api/user/profile", headers=_hdr(person.id), json={"name": "没检成的名字"})
    assert r.status_code == 200, r.text
    assert r.json()["profile"]["name"] == "没检成的名字"


def test_新建分类命中违规时建不出来(client, db_session, person, monkeypatch):
    from app.models.category import Category

    _stub_verdicts(monkeypatch, {"脏内容": "risky"})
    r = client.post("/api/categories/", headers=_hdr(person.id), json={"name": "脏内容分类"})
    assert r.status_code == 400, f"分类名没过内容安全就建出来了：{r.status_code}"
    assert db_session.query(Category).filter_by(user_id=str(person.id), name="脏内容分类").first() is None


def test_改分类名也要复检(client, db_session, person, monkeypatch):
    """新建检了、改名不检＝同一个字段两条路两种口径，绕过去只要多点一下"改名"。"""
    from app.models.category import Category

    ok = client.post("/api/categories/", headers=_hdr(person.id), json={"name": "旅行"})
    assert ok.status_code == 200, ok.text
    cid = ok.json()["id"]
    _stub_verdicts(monkeypatch, {"脏内容": "risky"})
    r = client.put(f"/api/categories/{cid}", headers=_hdr(person.id), json={"name": "脏内容改名"})
    assert r.status_code == 400
    db_session.expire_all()
    assert db_session.query(Category).filter_by(id=cid).first().name == "旅行"


def test_本地那道闸先挡所以不花配额(client, db_session, person, monkeypatch):
    """重名这种本地就能判掉的请求，不该先花一趟真额度再被打回。"""
    _stub_verdicts(monkeypatch, {})
    first = client.post("/api/categories/", headers=_hdr(person.id), json={"name": "重复格子"})
    assert first.status_code == 200, first.text
    seen = _stub_verdicts(monkeypatch, {})
    dup = client.post("/api/categories/", headers=_hdr(person.id), json={"name": "重复格子"})
    assert dup.status_code == 400
    assert seen == [], f"重名那次先打了 {len(seen)} 次内容安全才判重"
