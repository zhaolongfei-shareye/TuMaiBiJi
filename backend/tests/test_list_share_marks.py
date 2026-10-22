"""列表那一行新挂的派生值：`has_active_share`、`has_saved` 与 `share_author_name`（10-02 起，10-23 加那一枚星）。

三条不变量：
① 「已分享」只由"此刻有没有开着的码"说话。撤回之后当场就得灭——读的是 shares.is_active，
   不是"这篇曾经分享过"。
② 昵称那一格说的是"这篇打哪儿来"，两头都有来源而**转存那份优先**：自己分享出去的那篇
   取那张码上的快照，转存来的那篇取 notes.imported_from 里记的那份，两样同时可得时后者赢；
   都没有就留空，**不拿"图麦"这类假名去填**。
③ 一次列表请求只打一次 shares、只打一次 invitations。这条钉的是实现方式：一页 20 篇逐篇查，
   首页拉一次就是 20 个来回，而这些本来一条 IN 就能取完（shares 上有"一篇只一张活码"的
   部分唯一索引，invitations 上有"(源笔记, 转存人)"那条）。

④（10-23 站长一句「我要改为，有人转存，就加星」）列表那一枚星改吃 `has_saved`，
   真相只有一处 = `invitations` 里 `source_note_id` 非空那一路的凭据行。三句推论各有一条用例钉着：
   撤了分享码它照样亮（已经存走的那几份收不回来）；"自己转自己"那一行根本不存在，所以星不会
   被作者自己点起来（那条闸在 `quota._credit_import`，`test_quota_and_invite.py::test_自己转存自己的笔记不给钱`
   连"一行都不写"都钉了）；一人存一次、一人存十次都是同一枚星，不数人头。

另两条口径写在用例里：详情那条路由**不发**这几样（两处各发一份真相早晚对不上），
私密笔记没解锁时也不发（那一格亮不亮本身就是"这篇存不存在"之外的信息）。
"""
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.category import Category
from app.models.invitation import Invitation
from app.models.note import Note
from app.models.share import Share
from app.models.user import User

PRIVATE_PIN = "246813"


@pytest.fixture()
def client():
    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


def hdr(user):
    return {"Authorization": f"Bearer {_create_token(user.id, user.generation)}"}


def new_user(db, tag):
    u = User(openid=f"marks-{tag}-{int(time.time() * 1000)}")
    db.add(u)
    db.commit()
    return u


def new_note(db, user, title, source_type="manual", **kw):
    n = Note(user_id=str(user.id), title=title, summary="一条概要",
             source_type=source_type, tags=[], key_points=[], key_links=[], **kw)
    db.add(n)
    db.commit()
    return n


def new_share(db, user, note, author_name="站长本人", is_active=True):
    s = Share(user_id=str(user.id), note_id=note.id, token=f"tk-{note.id}-{int(time.time() * 1e6)}",
              title=note.title, author_name=author_name, is_active=is_active)
    db.add(s)
    db.commit()
    return s


def new_save(db, author, note, saver):
    """一笔"这个人把这一篇存进了自己库"的凭据——就是列表那一枚星唯一的真相源。

    写法和 `quota._settle` 落库的那一行同形：作者记在 `inviter_id`、来人记在 `invitee_id`、
    存的那一篇记在 `source_note_id`。这里不直接调 `quota.credit_import`，是因为这几条用例要钉的是
    "列表怎么读这张表"，把配额那套一起拉进来就变成一红两不知。
    """
    inv = Invitation(inviter_id=author.id, invitee_id=saver.id, source_note_id=note.id, reward=1)
    db.add(inv)
    db.commit()
    return inv


def rows(client, user):
    r = client.get("/api/notes/?limit=50", headers=hdr(user))
    assert r.status_code == 200
    return {x["id"]: x for x in r.json()}


def test_开着的码点亮那一格_昵称取码上那份(client, db):
    u = new_user(db, "on")
    n = new_note(db, u, "分享出去的那篇")
    new_share(db, u, n, author_name="图麦站长")
    row = rows(client, u)[n.id]
    assert row["has_active_share"] is True
    assert row["share_author_name"] == "图麦站长"


def test_撤回之后那一格当场灭(client, db):
    u = new_user(db, "off")
    n = new_note(db, u, "撤过分享的那篇")
    new_share(db, u, n, author_name="图麦站长")
    assert rows(client, u)[n.id]["has_active_share"] is True
    for s in db.query(Share).filter(Share.note_id == n.id).all():
        s.is_active = False
    db.commit()
    db.expire_all()
    row = rows(client, u)[n.id]
    assert row["has_active_share"] is False
    # 码都撤了，那张码上的名字也不该再顶着"已分享"的口径出现
    assert not row["share_author_name"]


def test_转存来的那篇即使我没分享也带对方昵称(client, db):
    u = new_user(db, "imp")
    n = new_note(db, u, "从别人那儿转存的那篇", source_type="share_import",
                 imported_from={"author_name": "原作者的昵称", "token": "tk-source"})
    row = rows(client, u)[n.id]
    assert row["has_active_share"] is False
    assert row["share_author_name"] == "原作者的昵称"


def test_转存又被我自己分享出去的那篇_昵称仍是原分享者那一份(client, db):
    """两头同时可得时谁赢：这一格说的是"这篇打哪儿来"，所以来源那份赢。
    码上快照的 author_name 就是用户自己——画在自己纸片上不说明任何事。"""
    u = new_user(db, "both")
    n = new_note(db, u, "转存来又被我分享的那篇", source_type="share_import",
                 imported_from={"author_name": "原作者的昵称", "token": "tk-source"})
    new_share(db, u, n, author_name="图麦站长")
    row = rows(client, u)[n.id]
    assert row["has_active_share"] is True
    assert row["share_author_name"] == "原作者的昵称"


def test_两头都没有就留空_不拿假名填(client, db):
    u = new_user(db, "none")
    n = new_note(db, u, "普普通通一篇")
    row = rows(client, u)[n.id]
    assert row["has_active_share"] is False
    assert row["share_author_name"] is None


def test_一次列表请求只打一次shares(client, db):
    from sqlalchemy import event

    u = new_user(db, "n1")
    for i in range(5):
        n = new_note(db, u, f"批量的一篇 {i}")
        new_share(db, u, n)
    hits = []

    def spy(conn, cursor, statement, parameters, context, executemany):
        if "FROM shares" in statement:
            hits.append(statement)

    event.listen(engine, "before_cursor_execute", spy)
    try:
        got = rows(client, u)
    finally:
        event.remove(engine, "before_cursor_execute", spy)
    assert len(got) == 5
    assert all(x["has_active_share"] for x in got.values())
    assert len(hits) == 1, f"shares 被查了 {len(hits)} 次，逐篇查就是 N+1：{hits}"


def test_详情那条路由不发这两样(client, db):
    u = new_user(db, "detail")
    n = new_note(db, u, "看一眼详情")
    new_share(db, u, n)
    assert rows(client, u)[n.id]["has_active_share"] is True
    r = client.get(f"/api/notes/{n.id}", headers=hdr(u))
    assert r.status_code == 200
    body = r.json()
    assert "has_active_share" not in body and "share_author_name" not in body
    # 10-23 那一枚星同一条理由：详情不许有第二份"存没存过"的真相
    assert "has_saved" not in body


def test_私密没解锁时那一格不透露(client, db):
    u = new_user(db, "priv")
    cat = Category(user_id=str(u.id), name="私密", color="#23252C")
    db.add(cat)
    db.commit()
    n = new_note(db, u, "私密的一篇", category_id=cat.id)
    new_share(db, u, n, author_name="图麦站长")  # 历史遗留：改成私密前发出去的码
    locked = rows(client, u)[n.id]
    assert locked["has_active_share"] is False and not locked["share_author_name"]
    client.put("/api/user/private-password", json={"password": PRIVATE_PIN}, headers=hdr(u))
    tok = client.post("/api/user/private-password/verify",
                      json={"password": PRIVATE_PIN}, headers=hdr(u)).json()["unlock_token"]
    r = client.get("/api/notes/?limit=50",
                   headers={**hdr(u), "X-Private-Token": tok})
    assert r.status_code == 200
    freed = {x["id"]: x for x in r.json()}[n.id]
    assert freed["has_active_share"] is True


# ── 10-23 那一枚星改口径：星＝有人转存 ──────────────────────────────────────

def test_有人存过就点亮_一个人存十次也还是那一枚(client, db):
    u = new_user(db, "sv1")
    other = new_user(db, "sv1-b")
    n = new_note(db, u, "被人存下来的那篇")
    assert rows(client, u)[n.id]["has_saved"] is False  # 没存过 ⇒ 不许假亮
    new_save(db, u, n, other)
    row = rows(client, u)[n.id]
    assert row["has_saved"] is True
    # 同一个人再存第二次：`(source_note_id, invitee_id)` 那条部分唯一索引挡着，库里不会多行，
    # 屏上也不该有任何"变了"的样子——这一枚星不数人头。
    with pytest.raises(IntegrityError):
        new_save(db, u, n, other)
    db.rollback()
    assert rows(client, u)[n.id]["has_saved"] is True


def test_撤了分享码这一枚照样亮(client, db):
    """星跟着"此刻开不开着码"走是假话：已经被人存走的那几份收不回来。

    这条用例要的就是那对**反着走**的读数——同一篇、同一次请求里，`has_active_share` 灭、
    `has_saved` 还亮。哪天有人把这一枚改回吃 shares，它当场红。
    """
    u = new_user(db, "sv2")
    other = new_user(db, "sv2-b")
    n = new_note(db, u, "分享过又撤了的那篇")
    new_share(db, u, n, author_name="图麦站长")
    new_save(db, u, n, other)
    assert rows(client, u)[n.id]["has_active_share"] is True
    for s in db.query(Share).filter(Share.note_id == n.id).all():
        s.is_active = False
    db.commit()
    db.expire_all()
    row = rows(client, u)[n.id]
    assert row["has_active_share"] is False
    assert row["has_saved"] is True


def test_没被存过的那篇一律不亮_与我分享没分享无关(client, db):
    """只分享出去、没人存的那一篇不许亮星——否则这一枚又变回"已分享"了。"""
    u = new_user(db, "sv3")
    n = new_note(db, u, "发出去了但没人存")
    new_share(db, u, n)
    row = rows(client, u)[n.id]
    assert row["has_active_share"] is True and row["has_saved"] is False


def test_一次列表请求只打一次invitations(client, db):
    from sqlalchemy import event

    u = new_user(db, "sv4")
    other = new_user(db, "sv4-b")
    for i in range(5):
        n = new_note(db, u, f"被人存过的 {i}")
        new_save(db, u, n, other)
    hits = []

    def spy(conn, cursor, statement, parameters, context, executemany):
        if "FROM invitations" in statement:
            hits.append(statement)

    event.listen(engine, "before_cursor_execute", spy)
    try:
        got = rows(client, u)
    finally:
        event.remove(engine, "before_cursor_execute", spy)
    assert len(got) == 5
    assert all(x["has_saved"] for x in got.values())
    assert len(hits) == 1, f"invitations 被查了 {len(hits)} 次，逐篇查就是 N+1：{hits}"


def test_详情那条路由不发这一栏(client, db):
    """上面那条只证了"没开码的一篇"；这一条要的是**真被存过**的那一篇，详情照样读不出这一栏。"""
    u = new_user(db, "sv5")
    other = new_user(db, "sv5-b")
    n = new_note(db, u, "详情看一眼")
    new_save(db, u, n, other)
    assert rows(client, u)[n.id]["has_saved"] is True
    body = client.get(f"/api/notes/{n.id}", headers=hdr(u)).json()
    assert "has_saved" not in body


def test_私密没解锁时那一枚星也不透露(client, db):
    """历史遗留那一态：这篇被人存过、后来才设的私密。锁着的那一趟不许用星回答"这篇存不存在"。"""
    u = new_user(db, "sv6")
    other = new_user(db, "sv6-b")
    cat = Category(user_id=str(u.id), name="私密", color="#23252C")
    db.add(cat)
    db.commit()
    n = new_note(db, u, "存过又设了私密的那篇", category_id=cat.id)
    new_save(db, u, n, other)
    assert rows(client, u)[n.id]["has_saved"] is False
    client.put("/api/user/private-password", json={"password": PRIVATE_PIN}, headers=hdr(u))
    tok = client.post("/api/user/private-password/verify",
                      json={"password": PRIVATE_PIN}, headers=hdr(u)).json()["unlock_token"]
    r = client.get("/api/notes/?limit=50", headers={**hdr(u), "X-Private-Token": tok})
    assert r.status_code == 200
    assert {x["id"]: x for x in r.json()}[n.id]["has_saved"] is True

