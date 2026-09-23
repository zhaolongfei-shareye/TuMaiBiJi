"""分享快照与"一条笔记一张码"的行为用例。

四条不变量，都是这一轮实测打出来的：
① 公开页读的是 shares 表里冗余存的快照，笔记一改快照必须跟着变。实测：标题从
   "我的手机号是 13800000000" 改成正常标题之后，笔记详情已经是新内容，而那张发出去
   的卡片扫开**仍然显示手机号**。
② 快照同步和公开复检必须绑在一起。抓取来源的笔记不过手动那道闸（_guard_manual_text
   对它直接放行），所以"只同步不复检"等于给了一条把没过审的文本推上公开页的路；
   反过来"只复检不同步"就是 ① 那个洞。
③ 一条笔记只留一个有效分享：重复点"生成分享图"不再各发一张新码，也不再多打一遍
   msgSecCheck（那个接口每次真打都要花自己的配额）。
④ 公开页显示的字段必须全部落在送检范围内。key_links 曾经客户端可写、公开页可见，
   却一次都没进过内容安全。

不出网：conftest 已把 SEC_CHECK_ENABLED 置 false，需要走判定逻辑的用例各自 stub check_text。
"""
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_share.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.note import Note
from app.models.share import Share
from app.models.user import User
from app.services import sharing, wechat


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


@pytest.fixture()
def person(db_session):
    u = db_session.query(User).filter_by(openid="pytest-openid-share").first()
    if not u:
        u = User(openid="pytest-openid-share")
        db_session.add(u)
        db_session.commit()
    return u


def _hdr(uid):
    return {"Authorization": "Bearer " + _create_token(uid)}


def _mknote(db, uid, title, source_type="manual", **kw):
    cols = dict(user_id=str(uid), title=title, source_type=source_type,
                tags=[], key_points=[], key_links=[])
    cols.update(kw)
    n = Note(**cols)
    db.add(n)
    db.commit()
    return n.id


def _pass_all(monkeypatch):
    """送检全部放行，并记录每一段真正送出去的内容。"""
    return _verdicts(monkeypatch, {})


def _verdicts(monkeypatch, table):
    seen = []

    def fake(openid, content):
        seen.append(content)
        for key, verdict in table.items():
            if key in content:
                return verdict
        return "pass"

    monkeypatch.setattr(wechat, "check_text", fake)
    return seen


def _count_gates(monkeypatch):
    """数"内容安全这道闸被走了几次"。

    一次调用内含多个字段、每个字段再分段，真正烧配额的是段；但这里的不变量是
    "该不该走这道闸"，所以数函数调用而不是数段（两段用例各自用 _verdicts 的 seen）。
    """
    from app.api.routes import notes as notes_route
    from app.api.routes import shares as shares_route

    calls = []

    def wrap(module):
        real = module.enforce_text_safety

        def spy(*a, **kw):
            calls.append(a)
            return real(*a, **kw)

        monkeypatch.setattr(module, "enforce_text_safety", spy)

    wrap(notes_route)
    wrap(shares_route)
    return calls


def _shares_of(db, note_id):
    db.expire_all()
    return db.query(Share).filter(Share.note_id == note_id).all()


# ------------------------------------------------------- ① 快照必须跟着笔记走
def test_改标题之后公开页不再挂着旧内容(client, db_session, person, monkeypatch):
    """这条就是那个隐私泄漏本身：删掉的手机号还留在已经发出去的那张卡片上。"""
    _pass_all(monkeypatch)
    nid = _mknote(db_session, person.id, "我的手机号是 13800000000", summary="联系方式")
    token = client.post("/api/shares/", headers=_hdr(person.id),
                        json={"note_id": nid}).json()["token"]
    assert "13800000000" in client.get(f"/api/shares/{token}").json()["title"]

    r = client.put(f"/api/notes/{nid}", headers=_hdr(person.id),
                   json={"title": "改成正常的标题"})
    assert r.status_code == 200

    public = client.get(f"/api/shares/{token}").json()
    assert public["title"] == "改成正常的标题", f"公开页还在返回旧标题：{public['title']!r}"
    assert "13800000000" not in client.get(f"/api/shares/{token}").text


@pytest.mark.parametrize("field,new_value", [
    ("summary", "换成新的摘要"),
    ("tags", ["新标签"]),
    ("key_links", ["https://example.com/新链接"]),
])
def test_快照显示的每一列都会跟着改(client, db_session, person, monkeypatch, field, new_value):
    """SNAPSHOT_COLUMNS 里不能有"改了不同步"的漏网列。"""
    _pass_all(monkeypatch)
    nid = _mknote(db_session, person.id, "分享快照用例", **{field: ["旧"] if field != "summary" else "旧摘要"})
    token = client.post("/api/shares/", headers=_hdr(person.id),
                        json={"note_id": nid}).json()["token"]
    assert client.put(f"/api/notes/{nid}", headers=_hdr(person.id),
                      json={field: new_value}).status_code == 200
    assert client.get(f"/api/shares/{token}").json()[field] == new_value


def test_改正文不动公开页(client, db_session, person, monkeypatch):
    """反方向也要钉住：正文不在 ShareResponse 里，改它不该惊动公开页，也不该多打送检。"""
    _pass_all(monkeypatch)
    nid = _mknote(db_session, person.id, "正文无关公开页", content="原正文")
    token = client.post("/api/shares/", headers=_hdr(person.id),
                        json={"note_id": nid}).json()["token"]
    before = client.get(f"/api/shares/{token}").json()

    gates = _count_gates(monkeypatch)
    assert client.put(f"/api/notes/{nid}", headers=_hdr(person.id),
                      json={"content": "改了一大段正文"}).status_code == 200
    assert client.get(f"/api/shares/{token}").json() == before
    # 只应有一次：手动笔记落库前的那道复检。公开那道闸没改到公开列，不该被触发。
    assert len(gates) == 1, f"改正文走了 {len(gates)} 道闸，公开那道被误打了"


# ------------------------------------------------- ② 同步与公开复检必须绑在一起
def test_公开检没过时笔记和快照一起回到原样(client, db_session, person, monkeypatch):
    _pass_all(monkeypatch)
    nid = _mknote(db_session, person.id, "原样标题", summary="原样摘要")
    token = client.post("/api/shares/", headers=_hdr(person.id),
                        json={"note_id": nid}).json()["token"]

    _verdicts(monkeypatch, {"改脏了": "risky"})
    r = client.put(f"/api/notes/{nid}", headers=_hdr(person.id), json={"title": "这段改脏了"})
    assert r.status_code == 400
    assert "违规" in r.json()["detail"]

    public = client.get(f"/api/shares/{token}").json()
    assert public["title"] == "原样标题", "没过审的新标题已经写进公开快照了"
    db_session.expire_all()
    assert db_session.get(Note, nid).title == "原样标题", "被拦下了但笔记还是被改了"


def test_抓取来源的笔记改标题也要过公开闸(client, db_session, person, monkeypatch):
    """web_article 不过落库那道闸，所以公开复检是它唯一的一道。少了它就是绕审通道。"""
    _pass_all(monkeypatch)
    nid = _mknote(db_session, person.id, "一篇抓来的文章", source_type="web_article",
                  content="外部原文，落库时故意不检")
    token = client.post("/api/shares/", headers=_hdr(person.id),
                        json={"note_id": nid}).json()["token"]

    _verdicts(monkeypatch, {"改脏了": "risky"})
    r = client.put(f"/api/notes/{nid}", headers=_hdr(person.id),
                   json={"title": "把公开页改脏了"})
    assert r.status_code == 400, "抓取来源的笔记可以靠改标题把没过审的内容推上公开页"
    assert client.get(f"/api/shares/{token}").json()["title"] == "一篇抓来的文章"


def test_没有有效分享时不多打一次公开闸(client, db_session, person, monkeypatch):
    """公开复检只在"这条笔记真的分享出去了"的时候才该打，否则白烧配额。"""
    _pass_all(monkeypatch)
    nid = _mknote(db_session, person.id, "没分享出去的笔记")
    gates = _count_gates(monkeypatch)

    gates.clear()
    assert client.put(f"/api/notes/{nid}", headers=_hdr(person.id),
                      json={"title": "改个标题"}).status_code == 200
    assert len(gates) == 1, f"没分享出去的笔记走了 {len(gates)} 道闸"

    token = client.post("/api/shares/", headers=_hdr(person.id),
                        json={"note_id": nid}).json()["token"]
    gates.clear()
    assert client.put(f"/api/notes/{nid}", headers=_hdr(person.id),
                      json={"title": "再改一次"}).status_code == 200
    assert len(gates) == 2, "已经分享出去了，公开那道闸却没被重打"
    assert client.get(f"/api/shares/{token}").json()["title"] == "再改一次"


# ------------------------------------------------------ ③ 一条笔记只留一张码
def test_反复建分享只有一张码(client, db_session, person, monkeypatch):
    _pass_all(monkeypatch)
    nid = _mknote(db_session, person.id, "反复点生成分享图")
    tokens = {client.post("/api/shares/", headers=_hdr(person.id),
                          json={"note_id": nid}).json()["token"] for _ in range(5)}
    assert len(tokens) == 1, f"同一篇笔记散出去 {len(tokens)} 张互不相干的码"
    assert len(_shares_of(db_session, nid)) == 1


def test_重复建分享不再多打内容安全(client, db_session, person, monkeypatch):
    """烧配额的那条路：这个接口每次真打 msgSecCheck，而它不需要登录态之外的代价。

    内容没变时第二次起应当直接复用旧分享，一次都不送检。
    """
    seen = _pass_all(monkeypatch)
    nid = _mknote(db_session, person.id, "刷这个接口烧配额", summary="摘要")
    first = client.post("/api/shares/", headers=_hdr(person.id), json={"note_id": nid})
    assert first.status_code == 200
    burned = len(seen)
    assert burned > 0, "第一次建分享压根没送检"

    seen.clear()
    again = client.post("/api/shares/", headers=_hdr(person.id), json={"note_id": nid})
    assert again.status_code == 200
    assert again.json()["token"] == first.json()["token"]
    assert seen == [], f"内容一字未改却又送检了 {len(seen)} 段"


def test_内容变了复用同一张码并且重新送检(client, db_session, person, monkeypatch):
    """short-circuit 不能变成"检过一次就永远不检"：改了内容必须重新过闸，仍然不给新码。"""
    _verdicts(monkeypatch, {"改脏了": "risky"})
    nid = _mknote(db_session, person.id, "先建一张码")
    token = client.post("/api/shares/", headers=_hdr(person.id),
                        json={"note_id": nid}).json()["token"]

    # 绕开 HTTP 直接改库，模拟"内容变了而没走复检"的状态（worker 落库就是这类路径）。
    n = db_session.get(Note, nid)
    n.summary = "这段改脏了"
    db_session.commit()

    seen = _pass_all(monkeypatch)
    r = client.post("/api/shares/", headers=_hdr(person.id), json={"note_id": nid})
    assert seen, "快照与笔记已经不一致，却没有重新送检"
    assert r.status_code == 200
    assert r.json()["token"] == token, "复用旧码才对，不该发新码"
    assert client.get(f"/api/shares/{token}").json()["summary"] == "这段改脏了"


def test_过期之后重新建会给新码(client, db_session, person, monkeypatch):
    """复用只针对"还没过期"的分享：过期那张扫开是 404，不能继续发它。"""
    from datetime import datetime, timedelta, timezone

    _pass_all(monkeypatch)
    nid = _mknote(db_session, person.id, "过期的码")
    old = client.post("/api/shares/", headers=_hdr(person.id), json={"note_id": nid}).json()["token"]
    s = db_session.query(Share).filter(Share.token == old).first()
    s.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    db_session.commit()

    new = client.post("/api/shares/", headers=_hdr(person.id), json={"note_id": nid}).json()["token"]
    assert new != old
    assert client.get(f"/api/shares/{old}").status_code == 404
    assert client.get(f"/api/shares/{new}").status_code == 200


# ------------------------------------------- ④ 公开页显示的字段必须在送检范围内
def test_公开页显示的列全部在送检范围内():
    """这条是防"清单再次漂移"的兜底，不是重复上面的用例。

    做法是给每个字段一个互不相同的值，看公开页给出去的那些值是不是都在送检那一份里。
    """
    note = Note(
        title="哨兵-标题", summary="哨兵-摘要", tags=["哨兵-标签"],
        key_points=["哨兵-要点"], key_links=["哨兵-链接"],
        content="哨兵-正文", original_content="哨兵-原文",
    )
    checked = set(map(str, sharing.public_fields(note)))
    shown = sharing.visible_fields(note)
    missing = [col for col, v in shown.items() if str(v) not in checked]
    assert not missing, f"这些字段会出现在公开页上却从未送检：{missing}"


def test_快照列与对外响应字段是同一份():
    """ShareResponse 加一列显示字段，就必须同时进 SNAPSHOT_COLUMNS 和送检清单。"""
    from app.api.routes.shares import ShareResponse

    exposed = set(ShareResponse.model_fields) - {"token", "created_at"}
    assert exposed == set(sharing.SNAPSHOT_COLUMNS), (
        f"公开响应给了 {sorted(exposed)}，快照同步的却是 {sorted(sharing.SNAPSHOT_COLUMNS)}"
    )


def test_手动笔记复检覆盖所有可写文本列():
    """NoteCreate/NoteUpdate 收的每一个文本列，都必须在落库那道闸的清单里。

    original_content 是唯一豁免：它是"外部原文"那一格（抓来的文章、识别出的文字），
    落库不检是既定口径——旧文章里一个敏感词不该让人存不下笔记。它仍然在 public_fields
    里，也就是"要分享出去的那一刻"照样过闸，所以豁免只覆盖到存，不覆盖到公开。
    """
    from app.api.routes import notes as notes_route

    writable = set(notes_route.NoteCreate.model_fields) | set(notes_route.NoteUpdate.model_fields)
    exempt = {"source_url", "category_id", "original_content"}
    unchecked = writable - set(notes_route.MANUAL_TEXT_FIELDS) - exempt
    assert not unchecked, f"客户端可写、却不进内容安全的字段：{sorted(unchecked)}"


# ------------------------------------------------------------- 小程序码那道限流
def test_小程序码接口挂了限流():
    """无鉴权 + 每次真打微信接口，没有限流就能被无限刷。

    真跑出一次 429 得有 Redis 在，测试夹具里 limiter 是关掉的，所以只能断"挂没挂上"。
    """
    from app.core.rate_limit import limiter

    limits = limiter._route_limits.get("app.api.routes.shares.get_share_qrcode") or []
    assert limits, "/api/shares/{token}/qrcode 上没挂 limiter.limit，可以被匿名无限打"
