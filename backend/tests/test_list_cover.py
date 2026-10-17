"""列表那一行新挂的第三样：`cover_file_id`（右侧那枚配图，10-17 列表合一那一刀）。

四条不变量，逐条对着 `routes/notes.py:_attach_covers` 那段注释钉：
① **一篇只给一张，且取的是最早那张**（`Asset.id` 升序第一张）。这条不是审美，是**与详情页
   那组缩略图同一个序**——两处各挑一张，"列表上那枚"和"点进去第一张"就会不是同一张图。
② **备份失败的那张不许被选中**：`backup_status='failed'` 的行云上根本没有对象，
   拿它当封面就是一张碎图；而历史遗留的 NULL 必须跟着算进来（`not_failed()` 那条老坑）。
③ 一次列表请求只打一次 assets。这条钉的是实现方式：一页 20 篇逐篇问就是 20 个来回。
④ **私密篇没解锁时这一栏必须是空的**——这是闸不是装饰。列表那一趟锁着时是按
   `NOTE_BRIEF_FIELDS` 那九栏重建行的，`cover_file_id` 不在名单里所以天然漏不出去；
   这条用例钉的就是"哪天有人图省事把它加进名单"会当场红。一张照片里可能正写着密码、脸、票据。

另两条口径：详情那条路由**不发**这一栏（`NoteDetail` 不继承 `NoteListItem`，同分享码那两样）；
别人的图不许串进自己这一行（B 链"先传图后绑 note_id"，绑错一篇的形状就在这儿）。
"""
import time

import pytest
from fastapi.testclient import TestClient

from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.asset import Asset
from app.models.category import Category
from app.models.note import Note
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
    u = User(openid=f"cover-{tag}-{int(time.time() * 1000)}")
    db.add(u)
    db.commit()
    return u


def new_note(db, user, title, **kw):
    n = Note(user_id=str(user.id), title=title, summary="一条概要", source_type="manual",
             tags=[], key_points=[], key_links=[], **kw)
    db.add(n)
    db.commit()
    return n


def new_asset(db, user, note, i, status="uploaded", note_id=None):
    """`note=None` 那一档画的是 B 链中间态：对象已经在云上、还没绑到任何一篇（`note_id` 传 NULL）。"""
    nid = note.id if note is not None else note_id
    a = Asset(user_id=str(user.id), note_id=nid, object_key=f"cloud://n{nid or 'unbound'}-a{i}.photo",
              file_size=1024, backup_status=status)
    db.add(a)
    db.commit()
    return a


def rows(client, user):
    r = client.get("/api/notes/?limit=50", headers=hdr(user))
    assert r.status_code == 200
    return {x["id"]: x for x in r.json()}


# ---------------------------------------------------------------- 一、取哪一张

def test_有图的那行回最早那一张(client, db):
    u = new_user(db, "first")
    n = new_note(db, u, "传了三张图的那篇")
    a0 = new_asset(db, u, n, 0)
    new_asset(db, u, n, 1)
    new_asset(db, u, n, 2)
    assert rows(client, u)[n.id]["cover_file_id"] == a0.object_key


def test_列表那枚与详情第一张必须是同一张(client, db):
    """两处各挑一张迟早对不上：详情页那组是 `id` 升序，列表这一枚也必须取同一张。"""
    u = new_user(db, "same")
    n = new_note(db, u, "列表与详情都要看的那篇")
    new_asset(db, u, n, 0)
    new_asset(db, u, n, 1)
    got = client.get(f"/api/notes/{n.id}/assets", headers=hdr(u)).json()
    assert len(got) == 2
    assert rows(client, u)[n.id]["cover_file_id"] == got[0]["cloud_url"]


def test_没配过图的那行是空的(client, db):
    u = new_user(db, "none")
    n = new_note(db, u, "纯文字的一篇")
    assert rows(client, u)[n.id]["cover_file_id"] is None


# ---------------------------------------------------------------- 二、碎图不许当封面

def test_备份失败那张不许被选中(client, db):
    u = new_user(db, "failed")
    n = new_note(db, u, "第一张传失败了")
    new_asset(db, u, n, 0, status="failed")
    good = new_asset(db, u, n, 1, status="uploaded")
    assert rows(client, u)[n.id]["cover_file_id"] == good.object_key


def test_全部失败等于没有图(client, db):
    """宁可不画，也不给一张点不开的碎图（界面上那一格"没有就不显示"）。"""
    u = new_user(db, "allfail")
    n = new_note(db, u, "两张都备份失败")
    new_asset(db, u, n, 0, status="failed")
    new_asset(db, u, n, 1, status="failed")
    assert rows(client, u)[n.id]["cover_file_id"] is None


def test_历史遗留那批NULL状态要算进来(client, db):
    """`NULL != 'failed'` 在 SQL 里是"不过"——不写清楚，老行会悄悄从封面上消失。"""
    u = new_user(db, "null")
    n = new_note(db, u, "迁移前就存在的那张图")
    legacy = new_asset(db, u, n, 0, status=None)
    assert rows(client, u)[n.id]["cover_file_id"] == legacy.object_key


def test_还没绑上笔记的图不算进任何一篇(client, db):
    """B 链中间态：对象已经在云上、但还没有 note_id ⇒ 不能凭空给某篇画一张封面。"""
    u = new_user(db, "unbound")
    n = new_note(db, u, "只有绑定前那段时间有图")
    new_asset(db, u, None, 7, note_id=None)
    assert rows(client, u)[n.id]["cover_file_id"] is None


def test_别人的图不许串进自己这一行(client, db):
    """钉的是 `_attach_covers` 里那道 `user_id`：这一档画的是**绑错了的那一行**——
    行的 `user_id` 是他的、`note_id` 却指到我这篇上（B 链"先传图后绑 note_id"，
    中间态就在这一格里）。`note_id.in_(我的这一页)` 单靠它挡不住这种行，只有 `user_id` 挡得住。
    """
    u = new_user(db, "mine")
    other = new_user(db, "other")
    n = new_note(db, u, "我这篇本来没有图")
    db.add(Asset(user_id=str(other.id), note_id=n.id, object_key="cloud://别人家的图.photo",
                 file_size=1024, backup_status="uploaded"))
    db.commit()
    assert rows(client, u)[n.id]["cover_file_id"] is None, "按 note_id 命中就给了 ⇒ user_id 那道锁没生效"


# ---------------------------------------------------------------- 三、一次查完

def test_一次列表请求只打一次assets(client, db):
    from sqlalchemy import event

    u = new_user(db, "n1")
    for i in range(5):
        new_asset(db, u, new_note(db, u, f"批量的一篇 {i}"), 0)
    hits = []

    def spy(conn, cursor, statement, parameters, context, executemany):
        if "FROM assets" in statement:
            hits.append(statement)

    event.listen(engine, "before_cursor_execute", spy)
    try:
        got = rows(client, u)
    finally:
        event.remove(engine, "before_cursor_execute", spy)
    assert len(got) == 5
    assert all(x["cover_file_id"] for x in got.values())
    assert len(hits) == 1, f"assets 被查了 {len(hits)} 次，逐篇查就是 N+1：{hits}"


# ---------------------------------------------------------------- 四、两把不在场的证明

def test_详情那条路由不发这一栏(client, db):
    u = new_user(db, "detail")
    n = new_note(db, u, "看一眼详情")
    new_asset(db, u, n, 0)
    assert rows(client, u)[n.id]["cover_file_id"] is not None
    body = client.get(f"/api/notes/{n.id}", headers=hdr(u)).json()
    assert "cover_file_id" not in body


def test_私密没解锁时这一栏必须是空的(client, db):
    u = new_user(db, "priv")
    cat = Category(user_id=str(u.id), name="私密", color="#23252C")
    db.add(cat)
    db.commit()
    n = new_note(db, u, "私密的一篇", category_id=cat.id)
    asset = new_asset(db, u, n, 0)
    locked = rows(client, u)[n.id]
    assert not locked.get("cover_file_id"), "没解锁就把私密篇的配图地址发出去了"
    client.put("/api/user/private-password", json={"password": PRIVATE_PIN}, headers=hdr(u))
    tok = client.post("/api/user/private-password/verify",
                      json={"password": PRIVATE_PIN}, headers=hdr(u)).json()["unlock_token"]
    r = client.get("/api/notes/?limit=50", headers={**hdr(u), "X-Private-Token": tok})
    assert r.status_code == 200
    freed = {x["id"]: x for x in r.json()}[n.id]
    assert freed["cover_file_id"] == asset.object_key


def test_白名单里不许出现封面那一栏(client, db):
    """正向钉一次"挡人的是名单本身"：这条红 = 有人把 `cover_file_id` 加进了 `NOTE_BRIEF_FIELDS`，
    那上面那条"没解锁时是空的"就会跟着失效（重建行时它会照给）。"""
    from app.core.private_access import NOTE_BRIEF_FIELDS

    assert "cover_file_id" not in NOTE_BRIEF_FIELDS, (
        "私密那几行是按这九栏重建的，把封面加进名单＝没解锁也能拿到配图地址")
