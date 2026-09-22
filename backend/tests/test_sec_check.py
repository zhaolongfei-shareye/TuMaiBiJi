"""内容安全（msgSecCheck）这条链的行为用例。

三条不变量必须钉住，它们都是这轮实测出来的口径：
① 判 risky/review 才拒；**接口没检成（unavailable）一律放行**——微信侧抖动不能变成
   "用户存不了自己的笔记"。
② 只有 manual 在落库前检；外部抓取/识别的原文不检，公开出口（创建分享）才检。
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


def test_抓取来源的笔记落库时不检(client, db_session, person, monkeypatch):
    seen = _stub_verdicts(monkeypatch, {"脏内容": "risky"})
    r = client.post("/api/notes/", headers=_hdr(person.id),
                    json={"title": "抓来的文章里有脏内容", "source_type": "url"})
    assert r.status_code == 200
    assert seen == []


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
