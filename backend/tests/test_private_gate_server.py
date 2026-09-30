"""私密笔记在服务端这道闸（app/core/private_access.py）。

四条不变量：
① 没解锁时，私密笔记的正文类字段（概要／要点／链接／正文／原文）服务端根本不发。
   以前这道锁只装在客户端：同一个账号的 token 直接打 `GET /api/notes/{id}` 就能拿到
   整篇正文，列表响应里还连着带 summary——界面上"要点开、验过密码才看得到"是假的。
② 解锁凭证只由"验对密码"那一步产生，并且绑在密码摘要那一列上：改密或重置之后，
   手上旧凭证当场作废，不需要服务端另存一份"哪些 token 还有效"。
③ 私密笔记开不出分享；一篇已经分享出去的笔记被改成私密，名下活码当场关掉，
   公开落地页立刻 404。
④ 非私密笔记完全不受影响——这道闸是加在"私密"那一类上的，不是给整站加摩擦。
"""
import time

import pytest
from fastapi.testclient import TestClient

from app.core.auth import _create_token
from app.core.config import settings
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.category import Category
from app.models.note import Note
from app.models.share import Share
from app.models.user import User

PRIVATE_PIN = "246813"
BODY_MARK = "只有正文里才有的那串字"


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
    u = User(openid=f"gate-{tag}-{int(time.time() * 1000)}")
    db.add(u)
    db.commit()
    return u


def make_private_category(db, user):
    cat = Category(user_id=str(user.id), name="私密", color="#23252C")
    db.add(cat)
    db.commit()
    return cat


def make_note(db, user, title, category_id=None, summary="一条概要", **kw):
    n = Note(
        user_id=str(user.id), title=title, summary=summary, source_type="manual",
        category_id=category_id, content=f"{title} 的正文", original_content=BODY_MARK, **kw
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


def unlock(client, user):
    """走完"设密码 → 验密码"那两步，拿到解锁凭证。"""
    client.put("/api/user/private-password", json={"password": PRIVATE_PIN}, headers=hdr(user))
    r = client.post("/api/user/private-password/verify", json={"password": PRIVATE_PIN}, headers=hdr(user))
    assert r.status_code == 200, r.text
    return r.json()["unlock_token"]


class Test解锁凭证:
    def test_验对密码才给凭证(self, client, db):
        u = new_user(db, "t1")
        client.put("/api/user/private-password", json={"password": PRIVATE_PIN}, headers=hdr(u))
        ok = client.post("/api/user/private-password/verify", json={"password": PRIVATE_PIN}, headers=hdr(u))
        assert ok.status_code == 200 and ok.json().get("unlock_token")
        bad = client.post("/api/user/private-password/verify", json={"password": "000000"}, headers=hdr(u))
        assert bad.status_code == 403 and "unlock_token" not in bad.json()

    def test_详情锁着时正文类字段整个不发(self, client, db):
        u = new_user(db, "t2")
        cat = make_private_category(db, u)
        n = make_note(db, u, "私密的一篇", category_id=cat.id)
        r = client.get(f"/api/notes/{n.id}", headers=hdr(u))
        assert r.status_code == 200, "回 200 而不是 403：详情页要先拿到这条的形状才知道该弹密码框"
        body = r.json()
        assert body["is_private"] is True
        assert body["title"] == "私密的一篇"
        for f in ("summary", "key_points", "key_links", "content", "original_content"):
            assert body[f] is None, f"{f} 在锁着的时候不该发出去"

    def test_带凭证详情全给(self, client, db):
        u = new_user(db, "t3")
        cat = make_private_category(db, u)
        n = make_note(db, u, "私密的一篇", category_id=cat.id)
        token = unlock(client, u)
        r = client.get(f"/api/notes/{n.id}", headers={**hdr(u), "X-Private-Token": token})
        assert r.status_code == 200
        body = r.json()
        assert body["is_private"] is True and body["content"] == "私密的一篇 的正文"
        assert body["original_content"] == BODY_MARK

    def test_列表不带私密概要但带非私密(self, client, db):
        u = new_user(db, "t4")
        cat = make_private_category(db, u)
        make_note(db, u, "锁着的", category_id=cat.id, summary="锁着的概要")
        make_note(db, u, "公开的", summary="公开的概要")
        rows = {x["title"]: x for x in client.get("/api/notes/", headers=hdr(u)).json()}
        assert rows["锁着的"]["summary"] is None
        assert rows["锁着的"]["title"] == "锁着的", "标题照给：界面上列表本来就露标题"
        assert rows["公开的"]["summary"] == "公开的概要"
        # 解锁之后列表要能自己把概要读回来，否则验完密码展开那一行还是空的
        token = unlock(client, u)
        rows2 = {x["title"]: x for x in client.get(
            "/api/notes/", headers={**hdr(u), "X-Private-Token": token}).json()}
        assert rows2["锁着的"]["summary"] == "锁着的概要"

    def test_锁着时私密笔记只有标题参与搜索(self, client, db):
        u = new_user(db, "t5")
        cat = make_private_category(db, u)
        make_note(db, u, "一篇私密", category_id=cat.id)
        # 这串只在 original_content 里，锁着时不该靠它命中
        assert client.get("/api/notes/", params={"search": BODY_MARK}, headers=hdr(u)).json() == []
        hit = client.get("/api/notes/", params={"search": "一篇私密"}, headers=hdr(u)).json()
        assert [x["title"] for x in hit] == ["一篇私密"]
        token = unlock(client, u)
        got = client.get("/api/notes/", params={"search": BODY_MARK},
                         headers={**hdr(u), "X-Private-Token": token}).json()
        assert [x["title"] for x in got] == ["一篇私密"], "解锁之后搜索应该照旧能命中正文"

    def test_未分类的笔记不会被搜索条件误伤(self, client, db):
        u = new_user(db, "t6")
        make_private_category(db, u)
        make_note(db, u, "没有分类的一篇", category_id=None, summary="普通概要")
        token = unlock(client, u)
        # category_id 是 NULL，而 `NULL NOT IN (...)` 判 NULL 不是真——
        # 漏掉这一支的话，锁着时普通笔记会从正文搜索结果里凭空消失。
        hit = client.get("/api/notes/", params={"search": "普通概要"}, headers=hdr(u)).json()
        assert [x["title"] for x in hit] == ["没有分类的一篇"]


class Test凭证作废:
    def test_改完密码旧凭证当场失效(self, client, db):
        u = new_user(db, "t7")
        cat = make_private_category(db, u)
        n = make_note(db, u, "私密的一篇", category_id=cat.id)
        old = unlock(client, u)
        assert client.get(f"/api/notes/{n.id}", headers={**hdr(u), "X-Private-Token": old}).json()["content"]
        client.put("/api/user/private-password", json={"password": "999888"}, headers=hdr(u))
        r = client.get(f"/api/notes/{n.id}", headers={**hdr(u), "X-Private-Token": old})
        assert r.json()["content"] is None, "凭证绑的是旧密码摘要，换密之后必须认不出来"

    def test_重置之后旧凭证失效(self, client, db):
        u = new_user(db, "t8")
        cat = make_private_category(db, u)
        n = make_note(db, u, "私密的一篇", category_id=cat.id)
        old = unlock(client, u)
        client.post("/api/user/private-password/reset", headers=hdr(u))
        assert client.get(f"/api/notes/{n.id}",
                          headers={**hdr(u), "X-Private-Token": old}).json()["content"] is None

    def test_过期凭证判未解锁而不是把人踢下线(self, client, db, monkeypatch):
        u = new_user(db, "t9")
        cat = make_private_category(db, u)
        n = make_note(db, u, "私密的一篇", category_id=cat.id)
        token = unlock(client, u)
        monkeypatch.setattr(settings, "PRIVATE_UNLOCK_MINUTES", -1)
        stale = unlock(client, u)  # 现在签出来的那条一落地就是过期的
        assert token and stale != token
        assert client.get(f"/api/notes/{n.id}", headers={**hdr(u), "X-Private-Token": stale}).json()["content"] is None
        # 关键：列表这条还是 200 且带着普通笔记，而不是 401——
        # 拿一个过期的解锁凭证把人整台踢下线，症状会是"我的笔记突然全没了"。
        assert client.get("/api/notes/", headers={**hdr(u), "X-Private-Token": stale}).status_code == 200

    def test_别人的凭证用不了(self, client, db):
        a = new_user(db, "tA")
        b = new_user(db, "tB")
        cat_b = make_private_category(db, b)
        nb = make_note(db, b, "B 的私密", category_id=cat_b.id)
        token_a = unlock(client, a)
        r = client.get(f"/api/notes/{nb.id}", headers={**hdr(b), "X-Private-Token": token_a})
        assert r.json()["content"] is None

    def test_拿登录令牌冒充解锁凭证不生效(self, client, db):
        u = new_user(db, "t10")
        cat = make_private_category(db, u)
        n = make_note(db, u, "私密的一篇", category_id=cat.id)
        unlock(client, u)
        r = client.get(f"/api/notes/{n.id}", headers={**hdr(u), "X-Private-Token": _create_token(u.id, u.generation)})
        assert r.json()["content"] is None, "登录 token 没有 scope=private，不能当解锁凭证用"


class Test分享出口:
    def test_私密笔记开不出分享(self, client, db):
        u = new_user(db, "t11")
        cat = make_private_category(db, u)
        n = make_note(db, u, "私密的一篇", category_id=cat.id)
        r = client.post("/api/shares/", json={"note_id": n.id}, headers=hdr(u))
        assert r.status_code == 400
        assert "私密" in r.json()["detail"]
        assert db.query(Share).filter(Share.note_id == n.id).count() == 0

    def test_改成私密会把已发的码关掉(self, client, db):
        u = new_user(db, "t12")
        n = make_note(db, u, "先分享后私密")
        share = client.post("/api/shares/", json={"note_id": n.id}, headers=hdr(u)).json()
        assert client.get(f"/api/shares/{share['token']}").status_code == 200
        cat = make_private_category(db, u)
        r = client.put(f"/api/notes/{n.id}", json={"category_id": cat.id}, headers=hdr(u))
        assert r.status_code == 200
        assert client.get(f"/api/shares/{share['token']}").status_code == 404, "公开页必须当场读不到"
        st = client.get("/api/shares/status", params={"note_id": n.id}, headers=hdr(u)).json()
        assert st["active"] is False

    def test_普通笔记分享完全照旧(self, client, db):
        u = new_user(db, "t13")
        make_private_category(db, u)
        n = make_note(db, u, "普通的一篇")
        share = client.post("/api/shares/", json={"note_id": n.id}, headers=hdr(u)).json()
        assert share["title"] == "普通的一篇"
        assert client.get(f"/api/shares/{share['token']}").status_code == 200


class Test不受影响的面上:
    def test_没有私密分类的账号一切照旧(self, client, db):
        u = new_user(db, "t14")
        n = make_note(db, u, "普通的一篇", summary="普通概要")
        d = client.get(f"/api/notes/{n.id}", headers=hdr(u)).json()
        assert d["is_private"] is False and d["content"] == "普通的一篇 的正文"
        assert client.get("/api/notes/", headers=hdr(u)).json()[0]["summary"] == "普通概要"

    def test_没设过密码也读不到私密正文(self, client, db):
        """重置之后、还没重设那一段：宁可读不到，也不要悄悄敞着。

        界面这一段是通的——「我的」里重置完面板当场切回"设两次"那一态，设完就能读；
        而列表页选了「私密」分类时本来就被 privateGate 拦着，不让往里没有密码的锁里塞。
        """
        u = new_user(db, "t15")
        cat = make_private_category(db, u)
        n = make_note(db, u, "私密的一篇", category_id=cat.id)
        assert client.get(f"/api/notes/{n.id}", headers=hdr(u)).json()["content"] is None
        assert client.post("/api/user/private-password/verify",
                           json={"password": PRIVATE_PIN}, headers=hdr(u)).status_code == 400
