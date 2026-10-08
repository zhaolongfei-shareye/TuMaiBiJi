"""卡片留档上服务端（2.0.1 P0 · S1/S2）：写、读一篇、批量读、撤掉那一格、删除连带五条路。

四条不变量：
① **一篇只有一张"当前"**。写口是幂等 upsert（新的进来旧的转历史），库上还压了一道部分唯一
   索引。这条要能在测试里被索引挡住——只靠代码判重等于没判，两个请求同时写就漏。
② **同一个 fileID 重复登记不产生第二行**。补传那一趟会重跑，攒历史行的话读回来哪条赢取决于
   顺序，界面就成了不确定的。
③ **归属越权一律 404**，不回 403——区分"不存在"与"不是你的"就是给外人一篇一篇试 id 的探测器。
④ **删除连带走的是同一个 `file_ids` 键**，不另起 `card_file_ids`：客户端
   `cloudUpload.dropFromDeleteRes` 只读那一个键，两处各改一遍迟早漏一处。漏了的后果是云上
   留一堆没人记得的对象，而对象只有客户端删得动。
⑤ **配额 SUM 的是两张表的真实字节**（`assets` + `note_cards` 的 file_size，10-09 审计改的；
   此前是"没量到实测前按 ≤200KB 估算"）。入账的数与挡人的数永远是两个数——挡人的那道线是
   云开发单文件上限 20MB，混成一个的那天，症状就是"用户的卡片存不上"。
⑥ **一条地址只能挂在它主人的账上**（`assets._assert_ours`）：不校这一条，谁拿到一条 fileID
   就能把它登记成自己的，再借"撤档/删笔记"的回体让他的客户端去删别人那个对象。
"""
import os
import sys
import time

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_cards.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.api.routes.cards import MAX_CARD_UPLOAD_BYTES
from app.models.note import Note
from app.models.note_card import NoteCard
from app.models.share import Share
from app.models.user import User

FID = "cloud://tumaibiji.abc/cards/1-classic-1.jpg"


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


def mk_user(db, tag):
    u = User(openid=f"card-{tag}-{int(time.time() * 1000)}")
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {_create_token(user.id, user.generation)}"}


def mk_note(db, user, title="有一张卡片的一篇"):
    n = Note(user_id=str(user.id), title=title, source_type="manual")
    db.add(n)
    db.commit()
    return n


def row(user, note, key, **kw):
    """直接造库里的行，**不走接口**——那两把索引用例要验的就是"绕过 upsert 也塞不进去"，
    经接口的一趟会把违规先在代码层挡下来，索引等于没被量过。"""
    return NoteCard(user_id=str(user.id), note_id=note.id, object_key=key,
                    tpl="classic", no_qr=False, origin="live", **kw)


def put(client, user, note_id, **kw):
    body = {"file_id": FID, "tpl": "classic", "no_qr": False}
    body.update(kw)
    return client.post(f"/api/notes/{note_id}/card", json=body, headers=hdr(user))


class Test写与读:
    def test_登记完读回来就是那一张(self, client, db):
        u = mk_user(db, "a")
        n = mk_note(db, u)
        r = put(client, u, n.id, size=204800, width=1080, height=1440)
        assert r.status_code == 200, r.text
        got = client.get(f"/api/notes/{n.id}/card", headers=hdr(u)).json()
        assert got["card"]["cloud_url"] == FID
        assert got["card"]["tpl"] == "classic"
        assert got["card"]["size"] == 204800
        assert got["card"]["origin"] == "live"
        assert got["had_share"] is False

    def test_没登记过的读回来是空而不是报错(self, client, db):
        u = mk_user(db, "b")
        n = mk_note(db, u)
        got = client.get(f"/api/notes/{n.id}/card", headers=hdr(u)).json()
        assert got == {"card": None, "had_share": False}

    def test_公开过但没有卡片行时had_share为真(self, client, db):
        """这一栏是"待确认档"的入口：服务端只能说"这篇该有一张"，说不出当年用的哪套模板。"""
        u = mk_user(db, "c")
        n = mk_note(db, u)
        db.add(Share(user_id=str(u.id), note_id=n.id, token=f"tk-{n.id}", title=n.title))
        db.commit()
        got = client.get(f"/api/notes/{n.id}/card", headers=hdr(u)).json()
        assert got["card"] is None and got["had_share"] is True


class Test一篇只留一张:
    def test_换一张时旧的转历史不删(self, client, db):
        u = mk_user(db, "d")
        n = mk_note(db, u)
        put(client, u, n.id)
        second = "cloud://tumaibiji.abc/cards/1-quote-2.jpg"
        put(client, u, n.id, file_id=second, tpl="quote")
        rows = db.query(NoteCard).filter(NoteCard.note_id == n.id).all()
        assert len(rows) == 2, "历史行要留着，不能直接删"
        assert sum(1 for r in rows if r.is_current) == 1
        got = client.get(f"/api/notes/{n.id}/card", headers=hdr(u)).json()
        assert got["card"]["cloud_url"] == second and got["card"]["tpl"] == "quote"

    def test_顶掉旧的那张时地址交回调用方(self, client, db):
        """10-09 审计：库里留历史行是对的，云上那个对象却从此没人认得——**只有客户端删得动**。
        所以这一口的回体必须把被顶掉的那几条带出去，客户端顺手删（删不成进待删那一格）。"""
        u = mk_user(db, "d2")
        n = mk_note(db, u)
        assert put(client, u, n.id).json()["replaced_file_ids"] == []   # 头一张，没顶掉谁
        second = "cloud://tumaibiji.abc/cards/1-quote-2.jpg"
        r = put(client, u, n.id, file_id=second, tpl="quote")
        assert r.json()["replaced_file_ids"] == [FID], f"旧地址没交回来：{r.json()}"
        # 同一个地址再登记一次（补传重跑）不算顶掉自己
        assert put(client, u, n.id, file_id=second).json()["replaced_file_ids"] == []

    def test_同一个地址重复登记不产生第二行(self, client, db):
        """补传那一趟会重跑。攒历史行的话，读回来哪条赢取决于查询顺序。"""
        u = mk_user(db, "e")
        n = mk_note(db, u)
        put(client, u, n.id, size=100)
        put(client, u, n.id, size=200)
        rows = db.query(NoteCard).filter(NoteCard.note_id == n.id).all()
        assert len(rows) == 1
        assert rows[0].file_size == 200

    def test_当前行撞唯一索引是真被挡住的(self, db):
        """这条不看接口，看库：绕过 upsert 直接塞第二行 current 必须报错。
        否则"一篇一张"就只是代码里的一句自觉。"""
        u = mk_user(db, "f")
        n = mk_note(db, u)
        db.add(row(u, n, "cloud://x/a.jpg"))
        db.commit()

        db.add(row(u, n, "cloud://x/b.jpg"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_同一篇的历史行不受这条索引管(self, db):
        """索引是**部分**唯一（只圈 is_current=1）。要是连历史行也挡，"旧的转历史不删"
        那条就写不进去——留档和唯一约束就会变成互相打架的两句话。"""
        u = mk_user(db, "f2")
        n = mk_note(db, u)
        db.add(row(u, n, "cloud://x/a.jpg"))
        db.commit()
        db.add(row(u, n, "cloud://x/b.jpg", is_current=False))
        db.add(row(u, n, "cloud://x/c.jpg", is_current=False))
        db.commit()
        rows = db.query(NoteCard).filter(NoteCard.note_id == n.id).all()
        assert len(rows) == 3
        assert sum(1 for r in rows if r.is_current) == 1


class Test不收的形状:
    def test_脏地址一律四百(self, client, db):
        u = mk_user(db, "g")
        n = mk_note(db, u)
        for bad in ["cloud://", "cloud://有 空格", "http://不是云开发的地址"]:
            r = put(client, u, n.id, file_id=bad)
            assert r.status_code == 400, (bad, r.status_code, r.text)

    def test_空地址在门口就被形状挡了(self, client, db):
        """空串到不了语义那层：pydantic 的 min_length 先拦，回 422。
        钉住它是为了别有人把 422 当"漏了一条 400"去"修"——那是两层门，不是一层坏了。"""
        u = mk_user(db, "g2")
        n = mk_note(db, u)
        r = put(client, u, n.id, file_id="")
        assert r.status_code == 422, r.text

    def test_模板名不收空白但不卡白名单(self, client, db):
        """白名单在这儿等于把"卡片模板不走发版"那条承诺作废：下发多一套 id，
        服务端就得跟着发一次版。所以只校形状。"""
        u = mk_user(db, "h")
        n = mk_note(db, u)
        assert put(client, u, n.id, tpl="").status_code == 422  # pydantic 的 min_length
        assert put(client, u, n.id, tpl="clas sic").status_code == 400
        assert put(client, u, n.id, tpl="brandNewIdFrom下发").status_code == 200

    def test_来源不认得四百(self, client, db):
        u = mk_user(db, "i")
        n = mk_note(db, u)
        assert put(client, u, n.id, origin="magic").status_code == 400


class Test归属:
    def test_别人的笔记回四百零四不是四百零三(self, client, db):
        owner = mk_user(db, "j")
        other = mk_user(db, "k")
        n = mk_note(db, owner)
        assert client.post(f"/api/notes/{n.id}/card",
                           json={"file_id": FID, "tpl": "classic"}, headers=hdr(other)).status_code == 404
        assert client.get(f"/api/notes/{n.id}/card", headers=hdr(other)).status_code == 404

    def test_不带票问不了(self, client, db):
        u = mk_user(db, "l")
        n = mk_note(db, u)
        assert client.get(f"/api/notes/{n.id}/card").status_code == 401
        assert client.get("/api/user/cards").status_code == 401

    def test_批量读只看得见自己的(self, client, db):
        a = mk_user(db, "m")
        b = mk_user(db, "n")
        na, nb = mk_note(db, a, "甲的笔记"), mk_note(db, b, "乙的笔记")
        put(client, a, na.id, file_id="cloud://x/a.jpg")
        put(client, b, nb.id, file_id="cloud://x/b.jpg")
        got = client.get("/api/user/cards", headers=hdr(a)).json()
        assert [c["note_id"] for c in got["cards"]] == [na.id]
        assert got["cards"][0]["cloud_url"] == "cloud://x/a.jpg"

    def test_别人名下的地址登记不到自己笔记上(self, client, db):
        """10-09 审计第五条：这一口原来只校形状，不校这个地址是不是别人的。

        后果不是"看见别人的图"，是**别人的对象会被这台客户端删掉**——撤档与删笔记的回体
        把 `file_ids` 交回调用方去 `deleteFile`。谁拿到一条地址，就能把它挂到自己名下再删掉它。
        """
        a, b = mk_user(db, "o1"), mk_user(db, "o2")
        na, nb = mk_note(db, a, "甲的"), mk_note(db, b, "乙的")
        fid = "cloud://tumaibiji.abc/cards/steal.jpg"
        assert put(client, a, na.id, file_id=fid).status_code == 200
        r = put(client, b, nb.id, file_id=fid)
        assert r.status_code == 400, f"这条地址在甲的账上，乙却登记得进：{r.status_code}"
        assert db.query(NoteCard).filter(NoteCard.object_key == fid).count() == 1


class Test批量读那份待确认名单:
    def test_公开过又没卡片行的才进名单(self, client, db):
        u = mk_user(db, "o")
        n1 = mk_note(db, u, "公开过、没卡片")
        n2 = mk_note(db, u, "公开过、卡片已登记")
        n3 = mk_note(db, u, "没公开过")
        for n in (n1, n2):
            db.add(Share(user_id=str(u.id), note_id=n.id, token=f"tk-{n.id}", title=n.title))
        db.commit()
        put(client, u, n2.id, file_id="cloud://x/2.jpg")
        got = client.get("/api/user/cards", headers=hdr(u)).json()
        assert got["need_confirm"] == [n1.id], got

    def test_笔记删掉了就不该再冒出来(self, client, db):
        u = mk_user(db, "p")
        n = mk_note(db, u, "删掉的这篇")
        db.add(Share(user_id=str(u.id), note_id=n.id, token=f"tk-{n.id}", title=n.title))
        db.commit()
        assert n.id in client.get("/api/user/cards", headers=hdr(u)).json()["need_confirm"]
        assert client.delete(f"/api/notes/{n.id}", headers=hdr(u)).status_code == 200
        assert client.get("/api/user/cards", headers=hdr(u)).json()["need_confirm"] == []


class Test补卡那份快照:
    """`snapshots` 是 S3 那一趟的第二份输入：按**当年分享出去那一份**渲，不是按笔记现在的内容渲。

    少了这一栏，重渲出来的就是"现在这张"而界面说"补回你原来那张"——站长改过标题的那一天开始，
    那句提示成了一句假话。撤掉的分享同样要给：公开口 `GET /api/shares/{token}` 对关了的那张回 404，
    客户端除了这里没有第二个地方能拿到它。
    """

    def _share(self, db, u, n, tag="a", **kw):
        # ⚠ 这三栏的形状**照现网那一行抄**，不是照我以为的抄：2026-10-08 那次部署，
        # key_links 这里喂的是字符串数组、用例全绿，而线上真数据是 [{"text","url"}]，
        # 回体一序列化就 500。探针抓到的，不是用例抓的——所以用例从此钉对象。
        fields = {"title": n.title, "summary": "当年那句摘要", "tags": ["当年"],
                  "key_points": ["当年第一条"],
                  "key_links": [{"text": "链接1", "url": "https://example.com"}],
                  "source_url": "https://src.cn", "author_name": "当年的名字"}
        fields.update(kw)
        s = Share(user_id=str(u.id), note_id=n.id, token=f"tk-{n.id}-{tag}", **fields)
        db.add(s)
        db.commit()
        return s

    def test_名单里那篇带回逐项对得上的快照(self, client, db):
        u = mk_user(db, "s1")
        n = mk_note(db, u, "公开过、卡片丢了")
        self._share(db, u, n)
        got = client.get("/api/user/cards", headers=hdr(u)).json()
        snap = {x["note_id"]: x for x in got["snapshots"]}
        assert set(snap) == {n.id}, got
        one = snap[n.id]
        assert one["summary"] == "当年那句摘要"
        assert one["key_points"] == ["当年第一条"]
        assert one["key_links"] == [{"text": "链接1", "url": "https://example.com"}], one
        assert one["source_url"] == "https://src.cn"
        assert one["author_name"] == "当年的名字"
        assert one["active"] is True

    def test_撤掉的分享照样给快照并如实带active(self, client, db):
        u = mk_user(db, "s2")
        n = mk_note(db, u, "撤过分享的那篇")
        self._share(db, u, n, is_active=False)
        one = client.get("/api/user/cards", headers=hdr(u)).json()["snapshots"][0]
        assert one["active"] is False
        assert one["summary"] == "当年那句摘要"

    def test_一篇几行分享取最新那一行(self, client, db):
        """最后一次建分享才是"那张卡片当初印出去的内容"，取最早那行会渲出一张他早就改过的旧版本。

        两行都开着是撞索引的（`ux_shares_one_active_per_note`），真实形状就是旧的关、新的开。
        """
        u = mk_user(db, "s3")
        n = mk_note(db, u, "分享过两次的这篇")
        self._share(db, u, n, tag="old", title="第一次那版", summary="旧的摘要", is_active=False)
        self._share(db, u, n, tag="new", title="第二次那版", summary="新的摘要")
        one = client.get("/api/user/cards", headers=hdr(u)).json()["snapshots"][0]
        assert one["summary"] == "新的摘要", one
        assert one["active"] is True, one

    def test_没公开过的篇不给快照(self, client, db):
        """没有分享记录的由客户端回退读笔记当前内容——这里凭空给一份就是替它编。"""
        u = mk_user(db, "s4")
        mk_note(db, u, "从没公开过")
        got = client.get("/api/user/cards", headers=hdr(u)).json()
        assert got["snapshots"] == [] and got["need_confirm"] == [], got

    def test_已经有卡片行的那篇不给快照(self, client, db):
        u = mk_user(db, "s5")
        n = mk_note(db, u, "卡片已经登记上了")
        self._share(db, u, n)
        put(client, u, n.id, file_id="cloud://x/ok.jpg")
        assert client.get("/api/user/cards", headers=hdr(u)).json()["snapshots"] == []


class Test删除连带:
    def test_删一篇把卡片地址一起回给客户端(self, client, db):
        u = mk_user(db, "q")
        n = mk_note(db, u)
        put(client, u, n.id, file_id="cloud://x/cur.jpg")
        put(client, u, n.id, file_id="cloud://x/old.jpg", tpl="quote")  # 旧的转历史但对象还在云上
        r = client.delete(f"/api/notes/{n.id}", headers=hdr(u))
        assert r.status_code == 200
        ids = r.json()["file_ids"]
        # 断的是**同一个键**里带齐两行：另起 card_file_ids 就是客户端读不到的那一份
        assert set(ids) == {"cloud://x/cur.jpg", "cloud://x/old.jpg"}, ids
        assert "card_file_ids" not in r.json()
        assert db.query(NoteCard).filter(NoteCard.note_id == n.id).count() == 0

    def test_注销把卡片地址也带走(self, client, db):
        u = mk_user(db, "r")
        n = mk_note(db, u)
        put(client, u, n.id, file_id="cloud://x/deact.jpg")
        r = client.post("/api/user/deactivate", json={"confirm": True}, headers=hdr(u))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "cloud://x/deact.jpg" in body["file_ids"], body
        assert body["deleted"]["cards"] == 1


class Test配额记账口径:
    """10-09 审计把这一条换成**真实字节**：配额 SUM 的是 `assets` + `note_cards` 两张表各自的
    `file_size`。此前是"没量到实测之前按 ≤200KB 上界估算入账"（站长 10-08 定），而 S2 起每一行
    登记都带真实 `file_size`，那个估算替身就该退场——`CARD_ACCOUNT_BYTES` 已删。

    原来这一格里只 SUM 配图，卡片一个字节都没进账，那枚"快满了"报的是"明明快满了界面还说有余
    量"的假话；而旧用例把"配额口一个字没变"当判据钉死，绿灯正好盖住了这件事。

    ⚠ 入账的数与挡人的数永远是两个数：挡人的那道线是云开发单文件上限 20MB，混成一个的那天，
    症状就是"用户的卡片存不上"。
    """

    def test_卡片字节进配额(self, client, db):
        u = mk_user(db, "q1")
        n = mk_note(db, u)
        q = lambda: client.get("/api/user/storage-quota", headers=hdr(u)).json()["user_bytes"]
        before = q()
        assert put(client, u, n.id, size=204800).status_code == 200
        assert q() - before == 204800, "卡片那 204,800 字节没进账——「快满了」还在报假话"

    def test_别人的卡片不算到我账上(self, client, db):
        a, b = mk_user(db, "q2"), mk_user(db, "q3")
        na, nb = mk_note(db, a), mk_note(db, b)
        assert put(client, a, na.id, size=300000).status_code == 200
        assert client.get("/api/user/storage-quota", headers=hdr(b)).json()["user_bytes"] == 0

    def test_张数那一栏不跟着卡片涨(self, client, db):
        """界面上那句说的是"你存了几张图"。把成品卡片混进张数会变成"我明明只传了 3 张图，
        怎么显示 7 张"——字节进账、张数不进账，是两条分开的口径，谁也别顺手统一掉。"""
        u = mk_user(db, "q4")
        n = mk_note(db, u)
        assert put(client, u, n.id, size=1024).status_code == 200
        assert client.get("/api/user/storage-quota", headers=hdr(u)).json()["user_count"] == 0

    def test_比旧上界大的卡片照样登记得进(self, client, db):
        u = mk_user(db, "s1")
        n = mk_note(db, u)
        big = 300 * 1024  # 超过当年那个估算上界 1.5 倍：入账口径从来不是闸门
        assert put(client, u, n.id, size=big).status_code == 200
        assert db.query(NoteCard).filter(NoteCard.note_id == n.id).first().file_size == big

    def test_挡人的那道线是云开发单文件上限(self, client, db):
        u = mk_user(db, "s2")
        n = mk_note(db, u)
        assert MAX_CARD_UPLOAD_BYTES == 20 * 1024 * 1024
        assert put(client, u, n.id, size=MAX_CARD_UPLOAD_BYTES + 1).status_code == 422


class Test撤掉那一格:
    """界面上那枚「删除」（首页成品弹窗底排）说的就是"这篇不该再有卡片"。

    S2 把"有没有卡片"的权威从本机那个 jpg 挪到服务器这一行之后，这一个口是**必须有**的：
    只删本机文件不删这一行，症状是那一格删不掉——本机账清了，下次进详情页又从云上读回来画上去。
    """

    def test_撤掉把当前与历史一起删并把对象回给客户端(self, client, db):
        u = mk_user(db, "t1")
        n = mk_note(db, u)
        put(client, u, n.id, file_id="cloud://x/cur.jpg")
        put(client, u, n.id, file_id="cloud://x/old.jpg", tpl="quote")  # 旧的转历史
        r = client.delete(f"/api/notes/{n.id}/card", headers=hdr(u))
        assert r.status_code == 200, r.text
        assert set(r.json()["file_ids"]) == {"cloud://x/cur.jpg", "cloud://x/old.jpg"}
        assert "card_file_ids" not in r.json()
        assert db.query(NoteCard).filter(NoteCard.note_id == n.id).count() == 0
        assert client.get(f"/api/notes/{n.id}/card", headers=hdr(u)).json()["card"] is None

    def test_本来就没有也回二百并且清单为空(self, client, db):
        """幂等：那一枚点第二下不该冒出一句"删失败"。"""
        u = mk_user(db, "t2")
        n = mk_note(db, u)
        r = client.delete(f"/api/notes/{n.id}/card", headers=hdr(u))
        assert r.status_code == 200, r.text
        assert r.json()["file_ids"] == []

    def test_撤掉时同一个地址在清单里只出现一次(self, client, db):
        """登记 A → 换 B → 又换回 A：库里是 A 历史 / B 历史 / A 当前三行，地址只有两个。
        清单里递两个 A 给 wx.cloud.deleteFile，第二次不算成功，客户端就把 A 记成
        "没删成的那条"落进待删队列——从此每次回前台都替一个已经不存在的对象重打一遍删除。"""
        u = mk_user(db, "t7")
        n = mk_note(db, u)
        a, b = "cloud://x/dup-a.jpg", "cloud://x/dup-b.jpg"
        put(client, u, n.id, file_id=a)
        put(client, u, n.id, file_id=b)
        put(client, u, n.id, file_id=a)
        assert db.query(NoteCard).filter(NoteCard.note_id == n.id).count() == 3
        ids = client.delete(f"/api/notes/{n.id}/card", headers=hdr(u)).json()["file_ids"]
        assert sorted(ids) == sorted({a, b}), ids

    def test_撤别人的那一篇回四百零四且那一行还在(self, client, db):
        owner = mk_user(db, "t3")
        other = mk_user(db, "t4")
        n = mk_note(db, owner)
        put(client, owner, n.id)
        assert client.delete(f"/api/notes/{n.id}/card", headers=hdr(other)).status_code == 404
        assert db.query(NoteCard).filter(NoteCard.note_id == n.id).count() == 1

    def test_撤这一篇不动那一篇(self, client, db):
        u = mk_user(db, "t5")
        a, b = mk_note(db, u, "甲"), mk_note(db, u, "乙")
        put(client, u, a.id, file_id="cloud://x/a.jpg")
        put(client, u, b.id, file_id="cloud://x/b.jpg")
        client.delete(f"/api/notes/{a.id}/card", headers=hdr(u))
        assert db.query(NoteCard).filter(NoteCard.note_id == b.id).count() == 1

    def test_不带票撤不掉(self, client, db):
        u = mk_user(db, "t6")
        n = mk_note(db, u)
        put(client, u, n.id)
        assert client.delete(f"/api/notes/{n.id}/card").status_code == 401
        assert db.query(NoteCard).filter(NoteCard.note_id == n.id).count() == 1
