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
⑤ 公开/不公开由用户说了算：码不设过期，所以必须有一扇关得上的门（/revoke），
   而且每篇笔记只留一张开着的码——这条由部分唯一索引兜，不靠注释。

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
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.api.routes import notes as notes_route
from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.asset import Asset
from app.models.note import Note, SOURCE_SHARE_IMPORT
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


def test_公开页给得出要点和原文链接(client, db_session, person, monkeypatch):
    """扫码的人要看到的是"这篇笔记"，不是只看到一段摘要。

    之前公开页只有标题/摘要/标签，key_points 连快照都没进，source_url 也没有，
    所以用户反馈"扫码后仍然看不到原文"——不是鉴权问题，是页面上确实没有内容。
    """
    _pass_all(monkeypatch)
    nid = _mknote(
        db_session, person.id, "带要点和链接的笔记",
        summary="摘要一段", key_points=["要点甲", "要点乙"], source_url="https://example.com/a",
    )
    token = client.post("/api/shares/", headers=_hdr(person.id), json={"note_id": nid}).json()["token"]
    body = client.get(f"/api/shares/{token}").json()
    assert body["key_points"] == ["要点甲", "要点乙"]
    assert body["source_url"] == "https://example.com/a"


def test_新建分享不带过期时间(client, db_session, person, monkeypatch):
    """这张码印在海报上，是纸。一周后失效等于每张发出去的海报都会变成死码。"""
    _pass_all(monkeypatch)
    nid = _mknote(db_session, person.id, "永不过期的码")
    token = client.post("/api/shares/", headers=_hdr(person.id), json={"note_id": nid}).json()["token"]
    s = db_session.query(Share).filter(Share.token == token).first()
    assert s.expires_at is None
    assert client.get(f"/api/shares/{token}").status_code == 200


# ------------------------- 撤回这条链：码不过期，那"关掉"这扇门必须存在
def test_撤掉分享之后旧码扫不开再分享是新码(client, db_session, person, monkeypatch):
    """码不设过期，那"关掉这扇门"就必须存在。

    审计查出来的原话是：全仓库没有任何一处把 is_active 置成 false，而这一轮又把 7 天
    有效期拿掉了——发出去的码既收不回也关不掉，唯一下线途径是删笔记或注销账号。
    还有半边是"已经撤过的旧海报不会因为你又分享了一次就复活"。
    """
    _pass_all(monkeypatch)
    hdr = _hdr(person.id)
    nid = _mknote(db_session, person.id, "要撤掉的笔记", summary="可以被公开")
    old = client.post("/api/shares/", headers=hdr, json={"note_id": nid}).json()["token"]
    assert client.get(f"/api/shares/{old}").status_code == 200

    r = client.post("/api/shares/revoke", headers=hdr, json={"note_id": nid})
    assert r.status_code == 200
    assert r.json()["closed"] == 1
    assert client.get(f"/api/shares/{old}").status_code == 404

    status = client.get("/api/shares/status", params={"note_id": nid}, headers=hdr).json()
    assert status == {"active": False, "token": None}

    new = client.post("/api/shares/", headers=hdr, json={"note_id": nid}).json()["token"]
    assert new != old
    assert client.get(f"/api/shares/{old}").status_code == 404, "撤过的码不能因为再次分享而复活"
    assert client.get(f"/api/shares/{new}").status_code == 200
    assert client.get("/api/shares/status", params={"note_id": nid}, headers=hdr).json()["token"] == new


def test_撤回是幂等的(client, db_session, person, monkeypatch):
    """没在公开的东西再撤一次不该报错，也不该假装关掉了什么。"""
    _pass_all(monkeypatch)
    hdr = _hdr(person.id)
    nid = _mknote(db_session, person.id, "撤两次的笔记")
    client.post("/api/shares/", headers=hdr, json={"note_id": nid})
    assert client.post("/api/shares/revoke", headers=hdr, json={"note_id": nid}).json()["closed"] == 1
    again = client.post("/api/shares/revoke", headers=hdr, json={"note_id": nid})
    assert again.status_code == 200
    assert again.json()["closed"] == 0


def test_别人名下的笔记撤不动也查不到(client, db_session, person, monkeypatch):
    """两个接口都带归属：note_id 是自增的，不能拿它去碰别人的分享。"""
    _pass_all(monkeypatch)
    mine = _mknote(db_session, person.id, "我的公开笔记")
    client.post("/api/shares/", headers=_hdr(person.id), json={"note_id": mine})

    other = User(openid="pytest-openid-other-owner")
    db_session.add(other)
    db_session.commit()
    hdr = _hdr(other.id)
    assert client.post("/api/shares/revoke", headers=hdr, json={"note_id": mine}).status_code == 404
    assert client.get("/api/shares/status", params={"note_id": mine}, headers=hdr).status_code == 404


def test_一篇笔记只留一张开着的码(client, db_session, person, monkeypatch):
    """路由那句"一条笔记只留一个有效分享"由数据库兜，不靠应用层记得住。

    没上索引时的实测样子：八个并发 POST 打出三张不同的 token，三张都能匿名读到 200。
    """
    from sqlalchemy.exc import IntegrityError

    _pass_all(monkeypatch)
    nid = _mknote(db_session, person.id, "只留一张码")
    client.post("/api/shares/", headers=_hdr(person.id), json={"note_id": nid})

    db_session.add(Share(
        user_id=str(person.id), note_id=nid, token="第二张不该存在的码",
        title="只留一张码", is_active=True,
    ))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # 关掉的行不受约束：撤回的历史、被取代的老码都要留档
    db_session.add(Share(
        user_id=str(person.id), note_id=nid, token="关掉的那张",
        title="只留一张码", is_active=False,
    ))
    db_session.commit()


# ------------------------------------------- ④ 公开页显示的字段必须在送检范围内
def test_公开页显示的列全部在送检范围内():
    """这条是防"清单再次漂移"的兜底，不是重复上面的用例。

    做法是给每个字段一个互不相同的值，看公开页给出去的那些值是不是都在送检那一份里。
    """
    note = Note(
        title="哨兵-标题", summary="哨兵-摘要", tags=["哨兵-标签"],
        key_points=["哨兵-要点"], key_links=["哨兵-链接"], source_url="哨兵-来源链接",
        content="哨兵-正文", original_content="哨兵-原文",
    )
    checked = set(map(str, sharing.public_fields(note)))
    shown = sharing.visible_fields(note)
    missing = [col for col, v in shown.items() if str(v) not in checked]
    assert not missing, f"这些字段会出现在公开页上却从未送检：{missing}"


def test_快照列与对外响应字段是同一份():
    """ShareResponse 加一列显示字段，就必须同时进 SNAPSHOT_COLUMNS 和送检清单。

    唯一的豁免口子是 `LIVE_PUBLIC_FIELDS`（现在只有配图那一列），它登记在路由模块里、
    不是写死在这条断言里——加字段的人要么把列进快照（自动被同步与送检管住），要么就
    得在代码里明写"这一列是现查的、没送检"，逼着他想清楚这一次。
    """
    from app.api.routes.shares import LIVE_PUBLIC_FIELDS, ShareResponse

    exposed = set(ShareResponse.model_fields) - {"token", "created_at"}
    must_check = set(sharing.SNAPSHOT_COLUMNS) | set(sharing.NON_NOTE_PUBLIC_COLUMNS)
    assert exposed - LIVE_PUBLIC_FIELDS == must_check, (
        f"公开响应给了 {sorted(exposed)}，快照同步的却是 {sorted(sharing.SNAPSHOT_COLUMNS)}，"
        f"另有不是从笔记搬的 {sorted(sharing.NON_NOTE_PUBLIC_COLUMNS)}，"
        f"登记的现查字段是 {sorted(LIVE_PUBLIC_FIELDS)}"
    )
    # 豁免名单本身也要有人看着：写了却没在响应里出现的字段是残留，留着会让人以为
    # "那一列也是现查的"，而下一次加列的人就会照抄这份错的名单。
    assert LIVE_PUBLIC_FIELDS <= exposed, f"豁免名单里有响应中不存在的字段：{sorted(LIVE_PUBLIC_FIELDS - exposed)}"
    # 这些列还必须真的从 public_check_fields 出去，否则就是"公开页可见但没送检"。
    # 昵称单独走这条：它不在 SNAPSHOT_COLUMNS 里，sync_snapshot 不搬它，容易漏。
    probe = Note(user_id="0", title="T", source_type="manual")
    sent = sharing.public_check_fields(probe, author_name="阿飞")
    assert "阿飞" in sent, "分享者昵称没进送检范围"


def test_手动笔记复检覆盖所有可写文本列():
    """NoteCreate/NoteUpdate 收的每一个文本列，都必须在落库那道闸的清单里。

    original_content 是这一层唯一的豁免：它是"原文"那一格。**10-22「导入时候，要审查」之后，
    "外部原文落库不检"这句已经不是全局口径了**——URL 抓取与截图 OCR 那两路都在 **worker 里落库前检**
    （`ingest_tasks._guard_scraped_text`／`_guard_screenshot_text`，PRD §8.431／§8.438）。
    这里留豁免只覆盖一条路：用户在"编辑笔记"里手改那一格（`write.js` 只在内容真的变了才提交），
    它不进 `MANUAL_TEXT_FIELDS`，所以那一格此刻仍没人检；公开那一刻由建分享那道闸兜
    （`sharing.public_fields` 里带着 `note.original_content`——公开页不渲染它，建分享时仍一并送检）。
    这条用例钉的是"客户端能写的其余文本列都得过闸"，别拿它的绿去说"原文那一格有人管"。
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


# ------------------------------------------------- 分享者昵称（跟着分享上服务器的那一份）
def _share(client, hdr, note_id, author=None):
    body = {"note_id": note_id}
    if author is not None:
        body["author_name"] = author
    r = client.post("/api/shares/", headers=hdr, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_建分享把昵称存进快照并对外给出(client, db_session, person):
    nid = _mknote(db_session, person.id, "带作者的笔记")
    payload = _share(client, _hdr(person.id), nid, author="阿飞")
    assert payload["author_name"] == "阿飞", payload
    db_session.expire_all()
    share = db_session.query(Share).filter_by(token=payload["token"]).first()
    assert share.author_name == "阿飞"
    # 匿名公开页也要给，落地页那行"原创作者：阿飞"靠的就是它
    assert client.get(f"/api/shares/{payload['token']}").json()["author_name"] == "阿飞"


def test_没填昵称时对外是空而不是一个假名字(client, db_session, person):
    nid = _mknote(db_session, person.id, "没形象的一页")
    payload = _share(client, _hdr(person.id), nid)
    assert payload["author_name"] is None, payload


def test_昵称超长走截断而不是让生成分享图失败(client, db_session, person):
    """昵称不该把整个海报流程打死，所以是截断；上限和模型那列一致。"""
    from app.api.routes.shares import AUTHOR_NAME_MAX

    nid = _mknote(db_session, person.id, "长名字的一篇")
    payload = _share(client, _hdr(person.id), nid, author="名" * (AUTHOR_NAME_MAX + 20))
    assert len(payload["author_name"]) == AUTHOR_NAME_MAX, payload


def test_只改昵称也会重检一次并跟着更新快照(client, db_session, person, monkeypatch):
    """昵称现在也是对外可见内容，改了不检就是一条绕过内容安全的公开出口。"""
    seen = _pass_all(monkeypatch)
    nid = _mknote(db_session, person.id, "改个作者名")
    first = _share(client, _hdr(person.id), nid, author="甲")
    gates = len(seen)
    again = _share(client, _hdr(person.id), nid, author="乙")
    assert again["token"] == first["token"], "同一篇还是那张码"
    assert again["author_name"] == "乙"
    assert len(seen) > gates, "只改昵称也应当过一次闸"


def test_昵称命中违规时分享建不成(client, db_session, person, monkeypatch):
    _verdicts(monkeypatch, {"脏词": "risky"})
    nid = _mknote(db_session, person.id, "脏词昵称的一篇")
    r = client.post("/api/shares/", headers=_hdr(person.id),
                    json={"note_id": nid, "author_name": "含脏词的名字"})
    assert r.status_code == 400, r.text
    db_session.expire_all()
    assert db_session.query(Share).filter_by(note_id=nid).count() == 0


# ------------------------------------------------------------------ 转存到"我的笔记"
def _other(db_session):
    u = db_session.query(User).filter_by(openid="pytest-openid-reader").first()
    if not u:
        u = User(openid="pytest-openid-reader")
        db_session.add(u)
        db_session.commit()
    return u


def _import(client, hdr, token):
    return client.post("/api/notes/from-share", headers=hdr, json={"token": token})


def test_转存整条抄公开内容但不带私有字段(client, db_session, person):
    reader = _other(db_session)
    nid = _mknote(db_session, person.id, "原标题", summary="原摘要",
                  tags=["甲"], key_points=["要点一", "要点二"],
                  key_links=["https://example.com/a"], source_url="https://example.com/src",
                  content="正文，不公开", original_content="识别出的原文，不公开")
    payload = _share(client, _hdr(person.id), nid, author="阿飞")

    r = _import(client, _hdr(reader.id), payload["token"])
    assert r.status_code == 200, r.text
    got = r.json()
    assert got["title"] == "原标题" and got["summary"] == "原摘要"
    assert got["key_points"] == ["要点一", "要点二"] and got["tags"] == ["甲"]
    assert got["key_links"] == ["https://example.com/a"]
    assert got["source_url"] == "https://example.com/src"
    # 公开页上看不到的东西一样都不该跟过来
    assert got["content"] is None and got["original_content"] is None
    assert got["category_id"] is None
    assert got["source_type"] == "share_import"
    assert got["imported_from"]["author_name"] == "阿飞"
    assert got["imported_from"]["source_note_id"] == nid
    assert got["imported_from"]["share_token"] == payload["token"]

    # 落在读者名下、他自己读得到；作者读不到（归属没串）
    assert client.get(f"/api/notes/{got['id']}", headers=_hdr(reader.id)).status_code == 200
    assert client.get(f"/api/notes/{got['id']}", headers=_hdr(person.id)).status_code == 404


def test_转存之后来源改不掉也删不掉(client, db_session, person):
    reader = _other(db_session)
    nid = _mknote(db_session, person.id, "钉住的来源")
    token = _share(client, _hdr(person.id), nid, author="阿飞")["token"]
    mine = _import(client, _hdr(reader.id), token).json()

    # 编辑接口压根不认识这一列：传了它，值不变
    r = client.put(f"/api/notes/{mine['id']}", headers=_hdr(reader.id),
                   json={"title": "我自己改的标题", "imported_from": None})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "我自己改的标题"
    assert r.json()["imported_from"]["share_token"] == token, "来源被编辑接口改掉了"

    # 内容能改，来源那一栏永远是转存当时的样子
    assert r.json()["imported_from"]["title_at_import"] == "钉住的来源"


def test_原分享撤掉或删掉都不影响已转存的副本(client, db_session, person):
    reader = _other(db_session)
    nid = _mknote(db_session, person.id, "会被收回的一篇")
    token = _share(client, _hdr(person.id), nid, author="阿飞")["token"]
    mine = _import(client, _hdr(reader.id), token).json()

    client.post("/api/shares/revoke", headers=_hdr(person.id), json={"note_id": nid})
    assert client.get(f"/api/shares/{token}").status_code == 404, "前提：那张码已经扫不开了"
    got = client.get(f"/api/notes/{mine['id']}", headers=_hdr(reader.id))
    assert got.status_code == 200 and got.json()["title"] == "会被收回的一篇"

    client.delete(f"/api/notes/{nid}", headers=_hdr(person.id))
    got = client.get(f"/api/notes/{mine['id']}", headers=_hdr(reader.id))
    assert got.status_code == 200, "原笔记删了，转存的那份不该跟着没"
    assert got.json()["imported_from"]["author_name"] == "阿飞"


def test_转存不再打一遍内容安全(client, db_session, person, monkeypatch):
    """抄的是服务端既有的快照，没有任何用户可写文本进来；再检一遍只是烧额度。"""
    seen = _pass_all(monkeypatch)
    gates = len(seen)
    nid = _mknote(db_session, person.id, "抄一份不再检")
    token = _share(client, _hdr(person.id), nid, author="阿飞")["token"]
    after_share = len(seen)
    assert after_share > gates, "前提：建分享那一步确实检过"
    assert _import(client, _hdr(_other(db_session).id), token).status_code == 200
    assert len(seen) == after_share, "转存这一步不该再打闸"


def test_已关闭或不存在的码转存不了(client, db_session, person):
    reader = _other(db_session)
    assert _import(client, _hdr(reader.id), "根本没有这个码").status_code == 404
    nid = _mknote(db_session, person.id, "撤回后转不了")
    token = _share(client, _hdr(person.id), nid)["token"]
    client.post("/api/shares/revoke", headers=_hdr(person.id), json={"note_id": nid})
    assert _import(client, _hdr(reader.id), token).status_code == 404


def test_自己转存自己那一趟被挡下且一行都不写(client, db_session, person):
    """站长 10-24 一句「为什么自己可以转存自己的，这个不合理，要限制，否则浪费资源，要改」
    ⇒ 推翻本文件原来那条「不设"不能转自己的"这种特例」。按**翻案**记，不按漏做记。

    挡的到底是什么：分数那侧本来就结不到（`quota._credit_import` 见 `author_pk == importer.id`
    直接 return 0），**漏的是笔记那一行**——它当时照样 commit，而名下笔记数从 10-01 起没有上限，
    所以一个人反复扫自己那张码就能堆任意多条重复笔记。这一条钉的是"当场拒＋一行都不写"，
    顺带钉"闸只认自己、没顺手把别人的门关上"。
    """
    nid = _mknote(db_session, person.id, "自己抄自己")
    token = _share(client, _hdr(person.id), nid, author="阿飞")["token"]
    before = db_session.query(Note).filter_by(user_id=str(person.id)).count()

    r = _import(client, _hdr(person.id), token)
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "这是你自己的笔记", r.text

    db_session.expire_all()
    assert db_session.query(Note).filter_by(user_id=str(person.id)).count() == before, "被拒那一趟不该写下任何一行"

    # 反向：同一张码，别人照旧存得进来——这条闸不许把门整个关上
    reader = _other(db_session)
    assert _import(client, _hdr(reader.id), token).status_code == 200


def test_被挡的只有写这一侧公开页照读不误(client, db_session, person):
    """挡的是"写"那一侧，不是"读"。落地页免登录可读这条一个字不改，否则别人扫不到内容。"""
    nid = _mknote(db_session, person.id, "只挡写不挡读")
    token = _share(client, _hdr(person.id), nid, author="阿飞")["token"]
    assert client.get(f"/api/shares/{token}").status_code == 200
    assert client.get(f"/api/shares/{token}").json()["title"] == "只挡写不挡读"


# ------------------------------------------------- 同一个人对同一篇只留一份（站长 10-25）
def _mine(db, uid, source_note_id):
    """这一篇在这个人名下的那几份副本。

    只数"这一篇"：`_other` 回的是全文件共用的那一个读者，他名下已经被前面几条存过别篇
    ⇒ 按"他名下总共几条"下尺子，量出来的是别人那几笔账（第一趟就是这么打红的）。
    """
    return [n for n in db.query(Note).filter_by(user_id=str(uid), source_type="share_import").all()
            if (n.imported_from or {}).get("source_note_id") == source_note_id]


def test_同一个人第二次存同一篇回的是那一条不多造一行(client, db_session, person):
    """站长 10-25 一句「一个用户不能重复收藏同一篇笔记，除非删了再收藏，避免冗余数据」。

    挡的是**行**，不是那次点击：第二趟照样 200、照样回同一条 `id`，屏上那句
    「你已收藏该笔记」由详情页页底那条 bar 说（他同一句里刚拍的下一条）。
    """
    nid = _mknote(db_session, person.id, "被存了两回的那篇")
    token = _share(client, _hdr(person.id), nid, author="阿飞")["token"]
    reader = _other(db_session)

    first = _import(client, _hdr(reader.id), token)
    assert first.status_code == 200, first.text
    again = _import(client, _hdr(reader.id), token)
    assert again.status_code == 200, again.text
    assert again.json()["id"] == first.json()["id"], "第二趟造出了第二条，正是要避免的冗余数据"

    db_session.expire_all()
    assert len(_mine(db_session, reader.id, nid)) == 1, _mine(db_session, reader.id, nid)


def test_删掉那一条之后可以重新收藏(client, db_session, person):
    """他那句里的"除非删了再收藏"：笔记是硬删，删完那一查就空了 ⇒ 新的那一条造得出来。

    这一条同时钉住反向：闸不许把门焊死到"这辈子只能存一次"。
    """
    nid = _mknote(db_session, person.id, "删了再存的那篇")
    token = _share(client, _hdr(person.id), nid, author="阿飞")["token"]
    reader = _other(db_session)
    first = _import(client, _hdr(reader.id), token).json()["id"]

    assert client.delete(f"/api/notes/{first}", headers=_hdr(reader.id)).status_code == 200
    db_session.expire_all()
    assert len(_mine(db_session, reader.id, nid)) == 0, "删没删成都没核，下面那句「重新存得进」就是空话"

    r = _import(client, _hdr(reader.id), token)
    assert r.status_code == 200, r.text
    db_session.expire_all()
    fresh = _mine(db_session, reader.id, nid)
    assert len(fresh) == 1, f"删了存不回来：{[x.id for x in fresh]}"
    # 尺子不许用"id 变没变"：删掉的正好是表里最大那一行时，SQLite 会把同一个 id 发给下一行
    # （实测量到 39 → 删 → 39）。"前面那一刻名下是 0 条、现在又是 1 条"才是那一条真被重造出来的证据。
    assert client.get(f"/api/notes/{fresh[0].id}", headers=_hdr(reader.id)).status_code == 200


def test_作者换了一张新码同一篇也不许多存一份(client, db_session, person):
    """判"同一篇"认的是原笔记那一栏，不是那张码。

    撤回再分享会换一张新码（test_撤掉分享之后旧码扫不开再分享是新码钉的就是这件事），
    拿 `share_token` 当尺子的话，同一篇在同一个人名下会因为换了码而多堆一份——
    这一条就是把那个写法当场打红的牙。
    """
    nid = _mknote(db_session, person.id, "换了一张码的那篇")
    token = _share(client, _hdr(person.id), nid, author="阿飞")["token"]
    reader = _other(db_session)
    first = _import(client, _hdr(reader.id), token).json()["id"]

    assert client.post("/api/shares/revoke", headers=_hdr(person.id),
                       json={"note_id": nid}).json()["closed"] == 1
    new_token = _share(client, _hdr(person.id), nid, author="阿飞")["token"]
    assert new_token != token, "前提：作者这一趟真的换了一张码"

    r = _import(client, _hdr(reader.id), new_token)
    assert r.status_code == 200, r.text
    assert r.json()["id"] == first, "认码不认篇：同一篇在同一个人名下多造了一行"
    db_session.expire_all()
    assert len(_mine(db_session, reader.id, nid)) == 1


def test_两个人各存一篇互不影响(client, db_session, person):
    """闸只认"同一个人 × 同一篇"，不许顺手把别人也关在外面（作者那边照旧 +1 分）。"""
    nid = _mknote(db_session, person.id, "两个人都存了的那篇")
    token = _share(client, _hdr(person.id), nid, author="阿飞")["token"]
    a = User(openid="pytest-openid-dup-a")
    b = User(openid="pytest-openid-dup-b")
    db_session.add_all([a, b])
    db_session.commit()

    ra = _import(client, _hdr(a.id), token)
    rb = _import(client, _hdr(b.id), token)
    assert ra.status_code == 200 and rb.status_code == 200, (ra.text, rb.text)
    assert ra.json()["id"] != rb.json()["id"], "两个人回成了同一条，归属串了"
    db_session.expire_all()
    assert len(_mine(db_session, a.id, nid)) == 1 and len(_mine(db_session, b.id, nid)) == 1


def test_来源那一栏没写那一键的笔记不许挡成真转存(client, db_session, person):
    """去重认的是 `imported_from.source_note_id` 那一枚键，而外链贴图那一路**故意不写它**
    （`ingest_tasks._source_snapshot` 那三键取不到就不写）。这一条钉的是"别把没那一键的笔记
    认成同一篇"：现在靠两层（SQL 只捞 `source_type=share_import` ＋ `shares.note_id` 是
    `nullable=False`、`.get()` 回的 None 永远撞不上一个整数），哪天有人把贴图那类也归进
    `share_import`，这一条当场红。
    """
    reader = _other(db_session)
    stray = Note(user_id=str(reader.id), title="贴图那一类的那种来源", source_type=SOURCE_SHARE_IMPORT,
                 tags=[], key_points=[], key_links=[],
                 imported_from={"author_name": "某公众号", "title_at_import": "旧的那篇",
                                "imported_at": "2026-10-19T00:00:00+00:00"})
    db_session.add(stray)
    db_session.commit()
    nid = _mknote(db_session, person.id, "照样存得进来的一篇")
    token = _share(client, _hdr(person.id), nid, author="阿飞")["token"]

    r = _import(client, _hdr(reader.id), token)
    assert r.status_code == 200, r.text
    assert r.json()["id"] != stray.id, "被那一格没写来源键的笔记顶掉了：真转存回了一张别的纸"
    db_session.expire_all()
    assert len(_mine(db_session, reader.id, nid)) == 1


# ============================ 数据库层兜底／补账／脏行（10-25 第八轮审计 M6／M7／M14）
def _fresh_reader(db, openid):
    """每一条用例各开一个读者。

    故意不复用 `_other`：`share_copy_key` 是按人分键的，而下面几条要在**同一个人的名下**做
    "撞索引"那件事——共用一个读者时，前面那几条存下的副本会把这一条的前提改掉
    （`test_同一个人第二次存同一篇…` 那一族的账）。
    """
    u = User(openid=openid)
    db.add(u)
    db.commit()
    return u


def _give_assets(db, note_id, user_id, n):
    ids = []
    for i in range(n):
        a = Asset(user_id=str(user_id), note_id=note_id,
                  object_key=f"cloud://pytest-env/images/{note_id}/{i}.jpg",
                  backup_status="uploaded")
        db.add(a)
        db.commit()
        ids.append(a.id)
    return ids


def test_那枚去重索引在测试库里真的有牙(db_session):
    """索引必须**同时**声明在模型（`models/note.py` 的 `__table_args__`）和迁移里。

    只写迁移的话，测试库是 `Base.metadata.create_all` 建的、压根没有那条索引 ⇒
    下面"撞索引能领回先落那篇"那条用例会以"根本没撞上"的方式通过——那是最坏的一种绿：
    代码是对的、尺子是空的，改坏也测不出来。所以这里不看行为，直接读 sqlite_master 那句 SQL，
    UNIQUE／WHERE／IS NOT NULL 三个词都得在场（少了 WHERE 就成了把所有 NULL 行也一起挡掉的全表唯一）。
    """
    row = db_session.execute(text(
        "SELECT sql FROM sqlite_master WHERE type='index' AND name='ux_notes_one_share_copy_per_user'"
    )).first()
    assert row is not None, (
        "测试库里没有 ux_notes_one_share_copy_per_user ⇒ `models/note.py` 那条 Index 声明漏了；"
        "这一族用例全部会假绿（包括下面撞索引那两条）"
    )
    sql = (row[0] or "").upper()
    assert "UNIQUE" in sql, f"索引建成了普通索引，挡不住第二行：{sql}"
    assert "WHERE" in sql and "IS NOT NULL" in sql, f"部分索引的 WHERE 那半没了，手写笔记那些 NULL 行会被一起挡：{sql}"


def test_同一个键的第二行被数据库直接拒掉而NULL行照样写得进(db_session):
    """索引的两面都得钉：有牙（拒第二行）与不吃存量（NULL 互不冲突）。

    只钉前一面的话，把 WHERE 那一半删掉也能过——那等于给"所有没走过转存那一路的笔记"
    加了一道 NULL 唯一约束，而 SQLite 恰好允许（判据在这儿不成立），MySQL 上就是另一回事。
    """
    u = _fresh_reader(db_session, "pytest-openid-key-teeth")
    key = f"{u.id}:900001"
    db_session.add(Note(user_id=str(u.id), title="键的第一行", source_type=SOURCE_SHARE_IMPORT,
                        tags=[], key_points=[], key_links=[], share_copy_key=key))
    db_session.commit()
    db_session.add(Note(user_id=str(u.id), title="键的第二行", source_type=SOURCE_SHARE_IMPORT,
                        tags=[], key_points=[], key_links=[], share_copy_key=key))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # 反向：那一栏留 NULL 的行（手写、抓取、以及闸上线之前落的所有老行）不受这条约束
    for i in range(2):
        db_session.add(Note(user_id=str(u.id), title=f"没有键的第{i}篇", source_type="manual",
                            tags=[], key_points=[], key_links=[]))
    db_session.commit()
    assert db_session.query(Note).filter_by(user_id=str(u.id), share_copy_key=None).count() >= 2


def test_转存写下来的那一行带着键而手写的没有(db_session, client, person):
    """键的**内容**也要钉：写成 `share_token` 就白写了——作者撤一次分享换一张新码，
    同一个人在同一篇名下就能再堆一行（这正是 test_作者换了一张新码… 那条要挡的）。
    """
    nid = _mknote(db_session, person.id, "看一眼键写了什么")
    token = _share(client, _hdr(person.id), nid, author="阿飞")["token"]
    reader = _fresh_reader(db_session, "pytest-openid-key-shape")
    copy_id = _import(client, _hdr(reader.id), token).json()["id"]

    db_session.expire_all()
    copy = db_session.get(Note, copy_id)
    assert copy.share_copy_key == f"{reader.id}:{nid}", copy.share_copy_key
    assert db_session.get(Note, nid).share_copy_key is None, "手写那一行被写上了转存的键"


def test_两真同时点转存_后落的那一个领回先落的那一篇(client, db_session, person, monkeypatch):
    """并发那一窗口的真实形状：A 查过"没存过"→ B 也查过"没存过"→ B 先 commit → A commit 撞索引。

    这里没法真起两个线程（TestClient 是同步的，且线程池那一层的时序在这台机上不可控），
    所以钉的是**同一段代码**：把闸那一趟的第一次查询按成"没查到"（=A 眼中的世界），
    库里那一条先落好的行就是 B 的产物。撞完之后第二次查询走真实实现 ⇒ 应当领回 B 那一篇，
    而不是回一条 500、也不是多留一行。
    """
    nid = _mknote(db_session, person.id, "被同时点的那篇")
    token = _share(client, _hdr(person.id), nid, author="阿飞")["token"]
    reader = _fresh_reader(db_session, "pytest-openid-race")
    existing = Note(user_id=str(reader.id), title="B 先落的那一篇", source_type=SOURCE_SHARE_IMPORT,
                    tags=[], key_points=[], key_links=[],
                    share_copy_key=notes_route._share_copy_key(str(reader.id), nid),
                    imported_from={"share_token": token, "source_note_id": nid,
                                   "author_user_id": person.id, "author_name": "阿飞",
                                   "title_at_import": "被同时点的那篇"})
    db_session.add(existing)
    db_session.commit()

    real = notes_route._find_share_import_copy
    seen = []

    def race(db, user_id, source_note_id):
        seen.append(user_id)
        if len(seen) == 1:
            return None          # A 那一趟看到的正是"还没人存过"
        return real(db, user_id, source_note_id)

    monkeypatch.setattr(notes_route, "_find_share_import_copy", race)
    r = _import(client, _hdr(reader.id), token)
    assert r.status_code == 200, r.text
    assert r.json()["id"] == existing.id, f"没领回先落的那一篇，而是回了 {r.json()['id']}"

    db_session.expire_all()
    rows = db_session.query(Note).filter_by(share_copy_key=notes_route._share_copy_key(str(reader.id), nid)).all()
    assert len(rows) == 1, f"索引兜住了第二行，但路由多留了一行：{[x.id for x in rows]}"


def test_撞了索引而认不出先落那一行时念的是重试而不是500(client, db_session, person, monkeypatch):
    """`except IntegrityError` 那一路的**另一半**：撞上了、却按 `source_note_id` 找不到人。

    这种行今天怎么来：键写上而 `imported_from` 那一栏没带 source_note_id（手工 SQL、或将来
    有人把贴图那一类也归进 share_import）。此时不能把 500 甩给用户，也不能悄悄建第二行；
    念一句"请再试一次"是唯一不撒谎的回法。这一条同时钉住话是中文的（那族错误直接上屏）。
    """
    nid = _mknote(db_session, person.id, "撞上一行认不出的键")
    token = _share(client, _hdr(person.id), nid, author="阿飞")["token"]
    reader = _fresh_reader(db_session, "pytest-openid-race-blind")
    ghost = Note(user_id=str(reader.id), title="占着那一格键的行", source_type=SOURCE_SHARE_IMPORT,
                 tags=[], key_points=[], key_links=[],
                 share_copy_key=notes_route._share_copy_key(str(reader.id), nid),
                 imported_from={"author_name": "某公众号"})   # 故意没有 source_note_id
    db_session.add(ghost)
    db_session.commit()

    r = _import(client, _hdr(reader.id), token)
    assert r.status_code == 409, r.text
    detail = r.json()["detail"]
    assert "再试一次" in detail and "500" not in detail, detail
    db_session.expire_all()
    assert db_session.query(Note).filter_by(share_copy_key=ghost.share_copy_key).count() == 1, "拒了却还多留一行"


def test_来源那一栏是数组时不许把这个人以后每次转存都撞成500(client, db_session, person):
    """10-25 审计 M14：`(snap or {}).get(...)` 只防了 None，没防"这一栏根本不是字典"。

    一行脏 JSON 的代价不是那一行读错，是这个人的**每一次**转存都在循环里抛 AttributeError：
    坏一行、全堵死，而且他没法自救（要存的篇就在同一张表里）。修法只加一道 `isinstance`，
    **不动任何一行数据**——所以下面还钉"那行脏数据还在原样躺着"。
    """
    reader = _fresh_reader(db_session, "pytest-openid-dirty-snap")
    stray = Note(user_id=str(reader.id), title="来源被写成数组的那一行", source_type=SOURCE_SHARE_IMPORT,
                 tags=[], key_points=[], key_links=[],
                 imported_from=["这不该是个数组"])
    db_session.add(stray)
    db_session.commit()
    stray_id = stray.id

    nid = _mknote(db_session, person.id, "脏行之后照样存得进")
    token = _share(client, _hdr(person.id), nid, author="阿飞")["token"]
    r = _import(client, _hdr(reader.id), token)
    assert r.status_code == 200, f"一行非字典的 JSON 把他撞成 {r.status_code}：{r.text[:120]}"
    assert r.json()["title"] == "脏行之后照样存得进"

    db_session.expire_all()
    assert db_session.get(Note, stray_id).imported_from == ["这不该是个数组"], "顺手洗了那行数据，而这一刀的口径是不动数据"


def _spy_copy(monkeypatch):
    """把"抄图"换成一个只记账不触网的替身（这一段真跑要打存图网关，本地没有凭据）。"""
    calls = []

    def fake(db, note, from_note_id):
        calls.append((note.id, from_note_id))
        # 回体那三个数（M7 第二半）必须有值：这一路真函数回 (kept, failed, skipped)，
        # 替身回 None 会让路由在解包上炸——那是一条与产品无关的假红。
        return 1, 0, 0

    monkeypatch.setattr(notes_route, "_copy_share_images", fake)
    return calls


def test_副本名下零张而原篇有图时第二次点补一次(client, db_session, person, monkeypatch):
    """M7 那一刀要修的症状：第一次抄图整段失败 → 屏上已是完成时 → 第二次被闸领回**同一篇没图的**，
    怎么重试都补不回来，唯一的自救是删掉再存。

    替身只记账不真插行，所以副本名下始终零张 ⇒ 正好是"那一趟什么都没做成"的那一态。
    """
    calls = _spy_copy(monkeypatch)
    src_nid = _mknote(db_session, person.id, "挂了图的一篇")
    _give_assets(db_session, src_nid, person.id, 3)
    token = _share(client, _hdr(person.id), src_nid, author="阿飞")["token"]
    reader = _fresh_reader(db_session, "pytest-openid-topup")

    first = _import(client, _hdr(reader.id), token)
    assert first.status_code == 200, first.text
    assert calls == [(first.json()["id"], src_nid)], f"第一次转存本该抄一趟：{calls}"

    again = _import(client, _hdr(reader.id), token)
    assert again.status_code == 200, again.text
    assert again.json()["id"] == first.json()["id"], "闸没领回同一篇，而是多造了一行"
    assert len(calls) == 2, f"零张而原篇有图时第二趟该补一次：{calls}"
    assert calls[1] == (first.json()["id"], src_nid)


def test_副本已经有图时第二趟一个字都不许多动(client, db_session, person, monkeypatch):
    """反向那一面：**部分成功（九张里成了五张）刻意不补**。

    补它会给同一篇再堆最多九行 assets，那正是站长 10-25 那句"避免冗余数据"要挡的东西。
    这一条与上面那条配成一对——只有一条的话，把判据删掉也能绿。
    """
    calls = _spy_copy(monkeypatch)
    src_nid = _mknote(db_session, person.id, "已经有副本图的一篇")
    _give_assets(db_session, src_nid, person.id, 2)
    token = _share(client, _hdr(person.id), src_nid, author="阿飞")["token"]
    reader = _fresh_reader(db_session, "pytest-openid-topup-skip")
    copy_id = _import(client, _hdr(reader.id), token).json()["id"]
    assert len(calls) == 1

    # 副本名下有一张真行（不是替身插的，是这里手工摆的态）
    _give_assets(db_session, copy_id, reader.id, 1)
    r = _import(client, _hdr(reader.id), token)
    assert r.status_code == 200, r.text
    assert len(calls) == 1, f"已经有图还再抄一趟 ⇒ 同一篇多堆重复 assets：{calls}"


def test_原篇一张图也没有时第二趟不去空转网关(client, db_session, person, monkeypatch):
    """零张要补的前提是**原篇有**；两边都零张时补它只是白打一趟存图网关。"""
    calls = _spy_copy(monkeypatch)
    src_nid = _mknote(db_session, person.id, "本来就没图的一篇")
    token = _share(client, _hdr(person.id), src_nid, author="阿飞")["token"]
    reader = _fresh_reader(db_session, "pytest-openid-topup-empty")
    assert _import(client, _hdr(reader.id), token).status_code == 200

    n = len(calls)
    assert _import(client, _hdr(reader.id), token).status_code == 200
    assert len(calls) == n, f"原篇零张还去补：{calls}"


def test_带着那一对重复存量也能一路升上来(tmp_path):
    """这一条钉的是**为什么不能**把那枚索引直接建在 `imported_from` 的 JSON 路径上。

    现网存量里真有一对"同一人同一篇两行"（那道闸 10-25 13:40 才上，上线前每点一次 `+1` 行）。
    走 JSON 路径唯一索引的话，`upgrade` 会在那一对上撞 `UNIQUE constraint failed` —— 而那一趟是
    在部署脚本里跑的，**迁移失败等于把整站挡在重启之前**。这一版加的是新栏＋部分索引：老行留 NULL、
    一行都不动，所以它必须真能在"带着重复行"的库上跑通。这里就照着那个形状演一遍：
    升到父级 → 手工插一对重复行 → 再升到 head → 迁移过得去、那两行还在、索引带着 WHERE 建起来了。

    ⚠ 只在这台机的临时库上跑，一个字节都不碰现网。
    """
    import sqlite3
    import subprocess
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    db_file = tmp_path / "dup.db"
    url = f"sqlite:///{db_file}"
    env = dict(os.environ, DATABASE_URL=url)

    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "c9f2a6d4e831"],
                   cwd=str(root), env=env, check=True, capture_output=True, text=True)

    con = sqlite3.connect(db_file)
    snap = '{"source_note_id": 77, "author_name": "阿飞"}'
    # `version` / `is_pinned` 是 `nullable=False` 而默认值只写在 Python 侧（`default=1`），
    # 绕开 ORM 直插就得自己补上——这正是"两条建表路对不上"那一族坑，别把它当用例的杂音删掉。
    con.executemany(
        "INSERT INTO notes (user_id, title, source_type, imported_from, version, is_pinned) "
        "VALUES (?, ?, ?, ?, 1, 0)",
        [("4242", "重复的第一行", "share_import", snap),
         ("4242", "重复的第二行", "share_import", snap)],
    )
    con.commit()
    con.close()

    done = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"],
                          cwd=str(root), env=env, capture_output=True, text=True)
    assert done.returncode == 0, f"迁移在重复存量上跑挂了：{done.stderr[-400:]}"

    con = sqlite3.connect(db_file)
    try:
        keep = con.execute(
            "SELECT count(*) FROM notes WHERE user_id='4242' AND source_type='share_import'"
        ).fetchone()[0]
        assert keep == 2, f"迁移把用户的笔记删掉了（{keep} 行）——这一刀的口径是一行都不动"
        sql = (con.execute("SELECT sql FROM sqlite_master WHERE name='ux_notes_one_share_copy_per_user'"
                           ).fetchone() or [""])[0].upper()
        assert "UNIQUE" in sql and "WHERE" in sql, f"索引没建上或建成了全表唯一：{sql}"
    finally:
        con.close()


