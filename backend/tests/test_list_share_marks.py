"""列表那一行新挂的两样派生值：`has_active_share` 与 `share_author_name`（10-02，v18 那一格）。

三条不变量：
① 「已分享」只由"此刻有没有开着的码"说话。撤回之后当场就得灭——读的是 shares.is_active，
   不是"这篇曾经分享过"。
② 昵称两头都有来源：自己分享出去的那篇取那张码上的快照，转存来的那篇取
   notes.imported_from 里记的那份；两个都没有就留空，**不拿"图麦"这类假名去填**。
③ 一次列表请求只打一次 shares。这条钉的是实现方式：一页 20 篇逐篇查，首页拉一次就是
   20 个来回，而这两样本来一条 IN 就能取完（shares 上有"一篇只一张活码"的部分唯一索引）。

另两条口径写在用例里：详情那条路由**不发**这两样（两处各发一份真相早晚对不上），
私密笔记没解锁时也不发（那一格亮不亮本身就是"这篇存不存在"之外的信息）。
"""
import time

import pytest
from fastapi.testclient import TestClient

from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.category import Category
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
