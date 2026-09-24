"""账号自助注销：删干净、只删自己的、删完还能证明它真的没了。

四条不变量：
① 只删自己名下的：每个删除查询都带着 user_id，别人的笔记/分类/分享一条不动。
② 注销后旧 token 立刻失效（用户行没了，get_current_user 自然回 401），公开分享页
   也必须扫不开——那张卡片图已经发出去了，留着就是泄漏。
③ 同一个 openid 重新登录是一个全新空账号，看不到旧数据。
④ id 被新号复用之后，旧 token 依然失效。②靠的是"行没了"，可 SQLite 会把那个 id 发
   给下一个注册的人，行又有了——这时候挡住的必须是账号代数，不是行的存在性。
   见 Test账号代数。

存在性断言一律走 query 而不是 db.get：这个夹具会话里已经缓存着那些对象，
`db.get` 命中身份映射时会把"内存里还有"当成"库里还有"，删干净了也照样返回绿。
"""
import os
import sys
import time

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.asset import Asset
from app.models.category import Category
from app.models.invitation import Invitation
from app.models.job import Job
from app.models.note import Note
from app.models.share import Share
from app.models.user import User
from app.services import quota


@pytest.fixture(scope="module")
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


def rows(db, model, uid):
    return db.query(model).filter(model.user_id == str(uid)).count()


@pytest.fixture()
def mine(db):
    """一个有全套数据的人：笔记、分类、分享、任务、素材，外加两行邀请台账。

    他既被别人邀进来（inviter 那个人拿到过一笔奖励），也邀成功过别人（999 那个假 id
    只是台账里的一个号，不需要真有其人）。
    """
    u = User(openid="del-me")
    db.add(u)
    db.commit()
    # bonus=10 是取消额度之前留下的历史值：现在没有任何代码读它，注销也不该动它
    inviter = User(openid="invited-him", quota_bonus=10)
    db.add(inviter)
    db.commit()
    cat = Category(user_id=str(u.id), name="旅行", color="#F6C445")
    note = Note(user_id=str(u.id), title="要消失的笔记", source_type="manual")
    db.add_all([cat, note])
    db.commit()
    share = Share(user_id=str(u.id), note_id=note.id, token="tok-del-me", title="要消失的分享")
    db.add_all([
        share,
        Job(user_id=str(u.id), job_type="ingest_url", status="done", note_id=note.id),
        Asset(user_id=str(u.id), object_key="a/b.png"),
        Invitation(inviter_id=inviter.id, invitee_id=u.id, reward=0),
        Invitation(inviter_id=u.id, invitee_id=999, reward=0),
    ])
    db.commit()
    return {"user": u, "id": u.id, "note": note.id, "cat": cat.id, "share": share.id,
            "token": share.token, "inviter": inviter.id}


@pytest.fixture()
def other(db):
    u = User(openid="stay-alive")
    db.add(u)
    db.commit()
    n = Note(user_id=str(u.id), title="别人的笔记", source_type="manual")
    c = Category(user_id=str(u.id), name="别人的分类", color="#3F52D6")
    db.add_all([n, c])
    db.commit()
    return {"user": u, "id": u.id, "note": n.id, "cat": c.id}


def wipe(client, target):
    user = target["user"] if isinstance(target, dict) else target
    return client.post("/api/user/deactivate", json={"confirm": True}, headers=hdr(user))


class Test注销入口:
    def test_没确认不动手(self, client, db, mine):
        resp = client.post("/api/user/deactivate", json={"confirm": False}, headers=hdr(mine["user"]))
        assert resp.status_code == 400
        assert rows(db, Note, mine["id"]) == 1
        assert db.query(User).filter(User.id == mine["id"]).count() == 1

    def test_没登录不能注销(self, client, db, mine):
        resp = client.post("/api/user/deactivate", json={"confirm": True})
        assert resp.status_code == 401
        assert rows(db, Note, mine["id"]) == 1
        assert db.query(User).count() == 2

    def test_确认字段缺失也当作没确认(self, client, db, mine):
        resp = client.post("/api/user/deactivate", json={}, headers=hdr(mine["user"]))
        assert resp.status_code == 422
        assert rows(db, Note, mine["id"]) == 1


class Test删干净:
    def test_一次删完五类数据并回报条数(self, client, db, mine):
        resp = wipe(client, mine)
        assert resp.status_code == 200, resp.text
        assert resp.json()["deleted"] == {
            "notes": 1, "categories": 1, "shares": 1, "jobs": 1, "assets": 1,
        }
        for model in (Note, Category, Share, Job, Asset):
            assert rows(db, model, mine["id"]) == 0, model.__tablename__
        assert db.query(User).filter(User.id == mine["id"]).count() == 0
        assert db.query(Invitation).count() == 0

    def test_别人的一条不动(self, client, db, mine, other):
        wipe(client, mine)
        assert rows(db, Note, other["id"]) == 1
        assert rows(db, Category, other["id"]) == 1
        assert db.query(Note).filter(Note.id == other["note"]).count() == 1
        assert db.query(User).filter(User.id == other["id"]).count() == 1

    def test_空账号注销也只删自己(self, client, db, other):
        empty = User(openid="nothing-here")
        db.add(empty)
        db.commit()
        resp = wipe(client, {"user": empty})
        assert resp.status_code == 200
        assert resp.json()["deleted"] == {"notes": 0, "categories": 0, "shares": 0, "jobs": 0, "assets": 0}
        assert rows(db, Note, other["id"]) == 1


class Test注销之后:
    def test_旧token立刻失效(self, client, db, mine, other):
        h = hdr(mine["user"])
        wipe(client, mine)
        db.expunge_all()
        cases = [
            ("get", "/api/notes/"),
            ("get", "/api/user/quota"),
            ("post", "/api/notes/"),
            ("post", "/api/ingest/url"),
            ("put", "/api/user/wallpaper"),
            ("delete", f"/api/notes/{mine['note']}"),
        ]
        for method, url in cases:
            kwargs = {"json": {}} if method in ("post", "put") else {}
            resp = getattr(client, method)(url, headers=h, **kwargs)
            assert resp.status_code == 401, f"{method.upper()} {url} → {resp.status_code} {resp.text[:120]}"
            assert "重新登录" in resp.json()["detail"]

    def test_分享页扫不开了(self, client, db, mine):
        assert client.get(f"/api/shares/{mine['token']}").status_code == 200
        wipe(client, mine)
        assert client.get(f"/api/shares/{mine['token']}").status_code == 404

    def test_重新登录是全新空账号(self, client, db, mine, monkeypatch):
        from app.core import auth as auth_core

        async def fake(code):
            return {"openid": "del-me", "session_key": "k"}

        monkeypatch.setattr(auth_core, "_wechat_code2session", fake)
        old_note = mine["note"]
        wipe(client, mine)
        db.expunge_all()
        resp = client.post("/api/auth/wechat", json={"code": "x"})
        assert resp.status_code == 200
        token = resp.json()["token"]
        body = client.get(
            "/api/user/quota", headers={"Authorization": f"Bearer {token}"}
        ).json()
        assert body == {"used": 0, "categories": 0}
        # SQLite 在非 AUTOINCREMENT 主键上会复用刚空出来的 rowid，所以"新账号一定拿到
        # 新 id"是不能断的；能断的是这个号底下什么都没有了——旧笔记、旧归因都不跟过来。
        assert client.get(f"/api/notes/{old_note}", headers={"Authorization": f"Bearer {token}"}).status_code == 404
        assert client.get("/api/notes/", headers={"Authorization": f"Bearer {token}"}).json() == []
        new = db.query(User).filter(User.openid == "del-me").first()
        assert new.invited_by is None
        assert db.query(Invitation).count() == 0


class Test邀请台账跟着走:
    def test_注销把两个方向的台账都删干净(self, client, db, mine, other):
        """账号都没了，台账不该继续留着他那一头：被邀进来的那笔、他替别人成就的那笔。"""
        wipe(client, mine)
        db.expire_all()
        assert db.query(Invitation).filter(Invitation.invitee_id == mine["id"]).count() == 0
        assert db.query(Invitation).filter(Invitation.inviter_id == mine["id"]).count() == 0

    def test_注销不再动任何人的额度(self, client, db, mine):
        """2026-09-24 取消篇数上限：没有奖励可退，quota_bonus 注销前后必须一字不变。

        这条是反向对照——谁把"回退邀请奖励"那段代码加回来，这里就会红。
        """
        before = db.get(User, mine["inviter"]).quota_bonus
        wipe(client, mine)
        db.expire_all()
        assert db.get(User, mine["inviter"]).quota_bonus == before

    def test_别人指向我的归因被清空(self, client, db, mine):
        follower = User(openid="knew-me", invited_by=mine["id"])
        db.add(follower)
        db.commit()
        fid = follower.id
        wipe(client, mine)
        db.expire_all()
        assert db.get(User, fid).invited_by is None


def register(client, db, monkeypatch, openid):
    """打真实登录路由，只把 code2session 换成指定 openid。"""
    from app.core import auth as auth_core

    async def fake(code):
        return {"openid": openid, "session_key": "k"}

    monkeypatch.setattr(auth_core, "_wechat_code2session", fake)
    resp = client.post("/api/auth/wechat", json={"code": "x"})
    assert resp.status_code == 200, resp.text
    uid = resp.json()["user_id"]
    db.expire_all()
    return db.get(User, uid)


class Test账号代数:
    """SQLite 的 INTEGER PRIMARY KEY 会复用已删除行的 id。

    只认 id 的话，注销掉的那个人手里的旧 token 会直接变成新号的身份——新号一注册，
    陌生人就能读能写他的笔记。generation 就是为此加的：token 里带着签发时那一代，
    对不上就 401。
    """

    def test_注册出来的号代数递增(self, client, db, monkeypatch):
        a = register(client, db, monkeypatch, "gen-a")
        b = register(client, db, monkeypatch, "gen-b")
        assert b.generation > a.generation

    def test_同id重注册后旧token被拒(self, client, db, monkeypatch):
        old = register(client, db, monkeypatch, "gen-victim")
        uid, old_hdr = old.id, hdr(old)
        assert client.get("/api/user/quota", headers=old_hdr).status_code == 200

        db.delete(old)
        db.commit()
        # 摆成"id 被复用、代数往前走了一格"这个确定状态
        fresh = User(id=uid, openid="gen-takeover", generation=old.generation + 1)
        db.add(fresh)
        db.commit()

        resp = client.get("/api/user/quota", headers=old_hdr)
        assert resp.status_code == 401
        assert "失效" in resp.json()["detail"]

    def test_旧token对复用后的id也写不进去(self, client, db, monkeypatch):
        old = register(client, db, monkeypatch, "gen-writer")
        uid, old_hdr = old.id, hdr(old)
        db.delete(old)
        db.commit()
        fresh = User(id=uid, openid="gen-takeover2", generation=old.generation + 1)
        db.add(fresh)
        db.commit()

        assert client.post("/api/notes/", headers=old_hdr, json={"title": "冒充写入"}).status_code == 401
        db.expire_all()
        assert db.query(Note).filter(Note.user_id == str(uid)).count() == 0

    def test_新号自己的token照常可用(self, client, db, monkeypatch):
        old = register(client, db, monkeypatch, "gen-old2")
        uid, old_gen = old.id, old.generation
        db.delete(old)
        db.commit()
        fresh = User(id=uid, openid="gen-fresh2", generation=old_gen + 1)
        db.add(fresh)
        db.commit()

        assert client.get("/api/user/quota", headers=hdr(fresh)).status_code == 200

    def test_没有gen字段的老token仍按第一代处理(self, client, db):
        """升级那一刻，线上已发出去的 token 全都不带 gen。

        库里的老号经迁移后 generation 也是 1，两边对得上，所以老 token 不该被一刀切失效
        ——否则一部署就要全量用户重新登录。
        """
        u = User(openid="legacy-token", generation=1)
        db.add(u)
        db.commit()
        legacy = jwt.encode(
            {"sub": str(u.id), "exp": int(time.time()) + 3600, "jti": "legacy-jti"},
            "pytest-only-secret-not-a-real-one",
            algorithm="HS256",
        )
        resp = client.get("/api/user/quota", headers={"Authorization": f"Bearer {legacy}"})
        assert resp.status_code == 200, resp.text
