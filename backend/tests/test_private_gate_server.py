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
from app.models.asset import Asset
from app.models.note import Note
from app.models.note_card import NoteCard
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

    def test_解锁凭证也当不成登录令牌(self, client, db):
        """上一条钉的是反方向，这一条钉的是现网探针 09-30 真打出来的那个洞：
        两条 token 同一个签名密钥、同一套 sub/gen/jti，只差 scope 一个字段。
        _decode_token 不看 scope，那条 15 分钟的凭证就同时是一把全账号的钥匙——
        拿它能列全部笔记、改密码、注销。判据只拒"带 scope 的"，不要求登录 token
        必须有 scope：现网那批老 token 没有这个字段，反过来判等于把所有人踢下线。"""
        u = new_user(db, "t10b")
        token = unlock(client, u)
        for path in ("/api/notes/", "/api/user/quota", "/api/categories/"):
            r = client.get(path, headers={"Authorization": f"Bearer {token}"})
            assert r.status_code == 401, f"{path} 竟然认了这把只该管私密正文的钥匙：HTTP {r.status_code}"
        assert client.get("/api/notes/", headers=hdr(u)).status_code == 200, "没有 scope 的登录 token 照旧要认"


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

    def test_改成私密后那张卡片也转存不进来(self, client, db):
        """站长 2026-10-12 那句的第二半：「之前生成的卡片，然后笔记设密码，那卡片就不能被转存。」

        卡片上印的就是这张活码，所以挡转存取的是同一个判据——但**转存是另一条接口**
        （`POST /api/notes/from-share`）。公开页 404 不等于转存也 404：上一版就出过"落地页
        打不开、转存照样把内容抄走"那种两处各判一次的分歧（见 sharing.active_share_by_token 的注释）。
        """
        u = new_user(db, "t12b")
        n = make_note(db, u, "先分享后私密")
        share = client.post("/api/shares/", json={"note_id": n.id}, headers=hdr(u)).json()
        cat = make_private_category(db, u)
        assert client.put(f"/api/notes/{n.id}", json={"category_id": cat.id},
                          headers=hdr(u)).status_code == 200
        other = new_user(db, "t12c")
        r = client.post("/api/notes/from-share", json={"token": share["token"]}, headers=hdr(other))
        assert r.status_code == 404, "私密化之后转存必须同样读不到，不许出现「页打不开但内容抄得走」"
        assert db.query(Note).filter(Note.user_id == str(other.id)).count() == 0

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


class Test回体与旁路那五道口:
    """审计 B1／B2／B4／B5／B6：闸原先只装在 GET 详情与列表上，另有五条旁路读得到正文。

    这一批**不改任何写入语义**——线上那个包有一条不弹密码就进编辑页的路，把写入改成拒绝
    会当场打坏它。改的是回体：没带解锁凭证时那几条旁路一个字正文都不给。
    """

    def test_B1_PUT不带凭证时正文五栏不发但写入照做(self, client, db):
        u = new_user(db, "b1")
        cat = make_private_category(db, u)
        n = make_note(db, u, "私密的一篇", category_id=cat.id)
        unlock(client, u)
        r = client.put(f"/api/notes/{n.id}", json={"title": "改过的标题"}, headers=hdr(u))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["title"] == "改过的标题", "裁的是读，不是写"
        for k in ("summary", "key_points", "key_links", "content", "original_content"):
            assert body[k] is None, f"未解锁的回体里 {k} 不该有值"
        assert body["is_private"] is True

    def test_B1_PUT带凭证回体照旧给全(self, client, db):
        u = new_user(db, "b1b")
        cat = make_private_category(db, u)
        n = make_note(db, u, "私密的一篇", category_id=cat.id)
        tok = unlock(client, u)
        r = client.put(f"/api/notes/{n.id}", json={"title": "改过的标题"},
                       headers={**hdr(u), "X-Private-Token": tok})
        assert r.json()["original_content"] == BODY_MARK

    def test_B4_置顶回体不带凭证时不给概要(self, client, db):
        u = new_user(db, "b4")
        cat = make_private_category(db, u)
        n = make_note(db, u, "私密的一篇", category_id=cat.id, summary="置顶旁路漏的概要")
        unlock(client, u)
        r = client.post(f"/api/notes/{n.id}/pin?pin=true", headers=hdr(u))
        assert r.status_code == 200, r.text
        assert r.json()["summary"] is None
        assert r.json()["is_pinned"] is True, "置顶本身要生效"
        tok = unlock(client, u)
        r2 = client.post(f"/api/notes/{n.id}/pin?pin=false",
                         headers={**hdr(u), "X-Private-Token": tok})
        assert r2.json()["summary"] == "置顶旁路漏的概要"

    def test_B5_配图列表不带凭证回空数组带凭证照旧(self, client, db):
        u = new_user(db, "b5")
        cat = make_private_category(db, u)
        n = make_note(db, u, "私密的一篇", category_id=cat.id)
        db.add(Asset(user_id=str(u.id), note_id=n.id,
                     object_key=f"cloud://x/{u.id}/a.jpg", file_size=1234,
                     backup_status="uploaded"))
        db.commit()
        assert client.get(f"/api/notes/{n.id}/assets", headers=hdr(u)).json() == []
        tok = unlock(client, u)
        got = client.get(f"/api/notes/{n.id}/assets",
                         headers={**hdr(u), "X-Private-Token": tok}).json()
        assert len(got) == 1, got

    def test_B5_卡片读口不带凭证说没有这张卡(self, client, db):
        u = new_user(db, "b5c")
        cat = make_private_category(db, u)
        n = make_note(db, u, "私密的一篇", category_id=cat.id)
        db.add(NoteCard(user_id=str(u.id), note_id=n.id,
                        object_key=f"cloud://x/{u.id}/card.jpg", tpl="cover"))
        db.commit()
        assert client.get(f"/api/notes/{n.id}/card", headers=hdr(u)).json()["card"] is None
        tok = unlock(client, u)
        got = client.get(f"/api/notes/{n.id}/card",
                         headers={**hdr(u), "X-Private-Token": tok}).json()
        assert got["card"] is not None and got["card"]["note_id"] == n.id

    def test_B6_台账不带凭证时私密那行与它的快照都不给(self, client, db):
        u = new_user(db, "b6")
        cat = make_private_category(db, u)
        pub = make_note(db, u, "公开的一篇")
        priv = make_note(db, u, "私密的一篇", category_id=cat.id)
        for nn in (pub, priv):
            db.add(NoteCard(user_id=str(u.id), note_id=nn.id,
                            object_key=f"cloud://x/{u.id}/c{nn.id}.jpg", tpl="cover"))
        db.commit()
        r = client.get("/api/user/cards", headers=hdr(u)).json()
        assert [c["note_id"] for c in r["cards"]] == [pub.id], "私密那行整行都不该出现"
        tok = unlock(client, u)
        r2 = client.get("/api/user/cards", headers={**hdr(u), "X-Private-Token": tok}).json()
        assert {c["note_id"] for c in r2["cards"]} == {pub.id, priv.id}

    def test_B2_格里有笔记时不许把私密格改名(self, client, db):
        u = new_user(db, "b2")
        cat = make_private_category(db, u)
        make_note(db, u, "锁着的一篇", category_id=cat.id)
        r = client.put(f"/api/categories/{cat.id}", json={"name": "别的名字"}, headers=hdr(u))
        assert r.status_code == 400 and "私密" in r.text, r.text
        db.expire_all()
        assert db.query(Category).filter(Category.id == cat.id).first().name == "私密", \
            "拦下了就不许在库里留下痕迹"

    def test_B2_空格子改名照旧(self, client, db):
        u = new_user(db, "b2b")
        cat = make_private_category(db, u)
        assert client.put(f"/api/categories/{cat.id}", json={"name": "回收站"},
                          headers=hdr(u)).status_code == 200

    def test_B2_把别的格改名成私密会把那格的活码关掉(self, client, db):
        u = new_user(db, "b2c")
        cat = Category(user_id=str(u.id), name="随读", color="#D2683F")
        db.add(cat)
        db.commit()
        n = make_note(db, u, "先分享的一篇", category_id=cat.id)
        share = client.post("/api/shares/", json={"note_id": n.id}, headers=hdr(u)).json()
        assert client.get(f"/api/shares/{share['token']}").status_code == 200
        assert client.put(f"/api/categories/{cat.id}", json={"name": "私密"},
                          headers=hdr(u)).status_code == 200
        assert client.get(f"/api/shares/{share['token']}").status_code == 404, \
            "改名归私密必须等于把笔记归私密，不许留第二条不关码的路"

    def test_非私密笔记这五道口一个字没变(self, client, db):
        u = new_user(db, "b99")
        make_private_category(db, u)
        n = make_note(db, u, "普通的一篇", summary="普通概要")
        db.add(Asset(user_id=str(u.id), note_id=n.id,
                     object_key=f"cloud://x/{u.id}/p.jpg", file_size=10,
                     backup_status="uploaded"))
        db.commit()
        assert client.put(f"/api/notes/{n.id}", json={"title": "改过的"},
                          headers=hdr(u)).json()["original_content"] == BODY_MARK
        assert client.post(f"/api/notes/{n.id}/pin?pin=true",
                           headers=hdr(u)).json()["summary"] == "普通概要"
        assert len(client.get(f"/api/notes/{n.id}/assets", headers=hdr(u)).json()) == 1
