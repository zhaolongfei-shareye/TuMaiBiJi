"""名片与外观档位上服务端（2.1 第一条）：读、补丁写、四格、归属、换下清单、注销连带。

要守的六条不变量：
① **没登记过不是错误**。GET 回一份全空 200，客户端落回本机缓存——把它做成 404 的话，
   界面上"第一次用"和"读不到"就分不清了，而后者该出声。
② **写口是补丁**。只带 `bg_dim` 那一趟不许把名称抹掉；这条是 `poster.js` 的 `writeProfile(patch)`
   今天就在用的语义，服务端换一种说法就会出现"改一档亮度，名片没了"。
③ **四格是位置，不是列表**。存的时候补齐四格，空位是 null；不补的话第二格空着会把第三格
   挪到第二格的位置上——界面上那四个圈按序号摆。
④ **地址必须是这个人的**。`cloud://` 是拿到就能读的地址，归属不校就等于把别人的图挂到自己名片上。
   拒收回 400 不回 403：这里没有"存在但无权"这种需要区分的语义，多一档就多一个探测面。
⑤ **换下来的旧地址在回体 `file_ids` 里交回去**，键名与 `delete_note`／`deactivate`／`撤卡片`
   完全一致。对象只有客户端 `wx.cloud.deleteFile` 删得动，服务端删不掉；漏了这个键，
   云上就多一堆没人记得的对象还占着全站配额。
⑥ **卡片／背景各自单选**必须在服务端也成立。界面上勾一张别的灭，服务端不校就会出现两格都当
   头像，而画布只拿第一张——症状是"我明明勾了另一张"，查起来最难。
"""
import os
import sys
import time

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_profile.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.asset import Asset
from app.models.note_card import NoteCard
from app.models.user import User
from app.models.user_profile import UserProfile

FID_A = "cloud://tumaibiji.abc/profile/1-a.jpg"
FID_B = "cloud://tumaibiji.abc/profile/1-b.jpg"
FID_C = "cloud://tumaibiji.abc/profile/1-c.jpg"


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
    u = User(openid=f"profile-{tag}-{int(time.time() * 1000)}")
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {_create_token(user.id, user.generation)}"}


def slot(fid, card=False, bg=False, **kw):
    return dict({"file_id": fid, "card": card, "bg": bg}, **kw)


def put(client, user, **body):
    return client.put("/api/user/profile", json=body, headers=hdr(user))


def get(client, user):
    return client.get("/api/user/profile", headers=hdr(user))


class Test读回那一份:
    def test_没登记过回全空而不是404(self, client, db):
        u = mk_user(db, "fresh")
        r = get(client, u)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] is None and body["slots"] is None
        assert body["bg_dim"] is None
        assert "ui_font" not in body, "字体档不上云（models/user_profile.py 那条），读口也不该给这一栏"

    def test_写进去的名称与一句话读回一字不差(self, client, db):
        u = mk_user(db, "name")
        assert put(client, u, name="赵龙飞", slogan="把图文，提炼成有用的干货").status_code == 200
        body = get(client, u).json()
        assert body["name"] == "赵龙飞"
        assert body["slogan"] == "把图文，提炼成有用的干货"

    def test_前后空白剥掉而全空白等于清空(self, client, db):
        u = mk_user(db, "blank")
        put(client, u, name="  阿飞  ")
        assert get(client, u).json()["name"] == "阿飞"
        put(client, u, name="   ")
        assert get(client, u).json()["name"] is None, "存成 '   ' 会让界面显示'填了其实是空的'"

    def test_名称超上界被拒而不是截断(self, client, db):
        u = mk_user(db, "long")
        r = put(client, u, name="飞" * 65)
        assert r.status_code in (400, 422), r.text
        assert get(client, u).json()["name"] is None, "拒收就不许留半条"


class Test补丁语义:
    def test_只改亮度那一档不许抹掉名称(self, client, db):
        u = mk_user(db, "patch")
        put(client, u, name="阿飞", slogan="一句话")
        assert put(client, u, bg_dim=2).status_code == 200
        body = get(client, u).json()
        assert body["bg_dim"] == 2
        assert body["name"] == "阿飞", "写口做成整份覆盖，症状就是'改一档亮度名片没了'"
        assert body["slogan"] == "一句话"

    def test_没提交过的那几栏读回还是空(self, client, db):
        u = mk_user(db, "partial")
        put(client, u, bg_dim=1)
        body = get(client, u).json()
        assert body["bg_dim"] == 1
        assert body["name"] is None and body["slogan"] is None

    def test_亮度档越界被拒(self, client, db):
        u = mk_user(db, "dim")
        assert put(client, u, bg_dim=99).status_code in (400, 422)
        assert get(client, u).json()["bg_dim"] is None


class Test那四格:
    def test_存的时候补齐四格而顺序就是位置(self, client, db):
        u = mk_user(db, "pad")
        assert put(client, u, slots=[None, slot(FID_A, card=True, bg=True)]).status_code == 200
        slots = get(client, u).json()["slots"]
        assert len(slots) == 4, "四格是界面上的位置数，读口少一格就会把后面的挪位"
        assert slots[0] is None and slots[1]["file_id"] == FID_A
        assert slots[2] is None and slots[3] is None

    def test_两格都勾卡片被拒(self, client, db):
        u = mk_user(db, "two-card")
        r = put(client, u, slots=[slot(FID_A, card=True), slot(FID_B, card=True)])
        assert r.status_code == 400, r.text
        assert get(client, u).json()["slots"] is None

    def test_两格都勾背景被拒(self, client, db):
        u = mk_user(db, "two-bg")
        assert put(client, u, slots=[slot(FID_A, bg=True), slot(FID_B, bg=True)]).status_code == 400

    def test_第五格不存在所以被拒(self, client, db):
        u = mk_user(db, "fifth")
        r = put(client, u, slots=[None, None, None, None, slot(FID_A)])
        assert r.status_code in (400, 422), r.text

    @pytest.mark.parametrize("bad", ["", "cloud://", "http://x/a.jpg", "  ", "/local/a.jpg"])
    def test_地址格式不对一律拒收(self, client, db, bad):
        u = mk_user(db, "fmt")
        r = put(client, u, slots=[slot(bad)])
        # 400 与 422 都算拒收（空串先被 pydantic 的 min_length 拦下），要钉的是"不收且不留半条"，
        # 不是那一个数字——把状态码钉死会让以后换一种校验写法的人去改用例而不是改行为。
        assert r.status_code in (400, 422), f"{bad!r} 竟然收了：{r.text}"
        assert get(client, u).json()["slots"] is None

    def test_尺寸与字节数原样存着(self, client, db):
        u = mk_user(db, "size")
        put(client, u, slots=[slot(FID_A, card=True, width=1080, height=1440, size=239000)])
        s = get(client, u).json()["slots"][0]
        assert (s["width"], s["height"], s["size"]) == (1080, 1440, 239000)


class Test归属:
    def test_别人登记过的配图地址不许挂到我名片上(self, client, db):
        owner = mk_user(db, "owner")
        thief = mk_user(db, "thief")
        db.add(Asset(user_id=str(owner.id), object_key=FID_A, file_size=100))
        db.commit()
        r = put(client, thief, slots=[slot(FID_A)])
        assert r.status_code == 400, r.text
        assert get(client, thief).json()["slots"] is None

    def test_别人的卡片地址同样拒(self, client, db):
        owner = mk_user(db, "cardowner")
        thief = mk_user(db, "cardthief")
        db.add(NoteCard(user_id=str(owner.id), note_id=1, object_key=FID_B,
                        tpl="classic", no_qr=False, origin="live", is_current=True))
        db.commit()
        assert put(client, thief, slots=[slot(FID_B)]).status_code == 400

    def test_别人名片上的地址也拒(self, client, db):
        a = mk_user(db, "pa")
        b = mk_user(db, "pb")
        assert put(client, a, slots=[slot(FID_C)]).status_code == 200
        assert put(client, b, slots=[slot(FID_C)]).status_code == 400
        # 甲那一份一个字都不许被动
        assert get(client, a).json()["slots"][0]["file_id"] == FID_C

    def test_自己的地址重复登记不产生第二行(self, client, db):
        u = mk_user(db, "dup")
        put(client, u, slots=[slot(FID_A, card=True)])
        put(client, u, slots=[slot(FID_A, card=True)])
        assert db.query(UserProfile).filter(UserProfile.user_id == str(u.id)).count() == 1


class Test换下来的那些地址:
    def test_换格时旧地址在回体file_ids里(self, client, db):
        u = mk_user(db, "swap")
        put(client, u, slots=[slot(FID_A, card=True)])
        r = put(client, u, slots=[slot(FID_B, card=True)])
        assert r.status_code == 200
        assert r.json()["file_ids"] == [FID_A], "键名必须是 file_ids，客户端 dropFromDeleteRes 只读那一个"

    def test_撤掉整格也要交回地址(self, client, db):
        u = mk_user(db, "drop")
        put(client, u, slots=[slot(FID_A, card=True), slot(FID_B, bg=True)])
        r = put(client, u, slots=[None, None])
        assert set(r.json()["file_ids"]) == {FID_A, FID_B}

    def test_换回原来那张不许把它当换下的(self, client, db):
        """A→B→A 这一条真会走到（用户试完另一张又换回来）。
        先写库再比对的写法会把 A 当"换下"交回去，客户端顺手把正在用的那张删了。"""
        u = mk_user(db, "back")
        put(client, u, slots=[slot(FID_A, card=True)])
        put(client, u, slots=[slot(FID_B, card=True)])
        r = put(client, u, slots=[slot(FID_A, card=True)])
        assert r.status_code == 200
        assert r.json()["file_ids"] == [FID_B]
        assert get(client, u).json()["slots"][0]["file_id"] == FID_A

    def test_清单里没有重复(self, client, db):
        u = mk_user(db, "uniq")
        put(client, u, slots=[slot(FID_A, card=True, bg=True)])
        r = put(client, u, slots=[None])
        ids = r.json()["file_ids"]
        assert ids == [FID_A] and len(ids) == len(set(ids))

    def test_没提交slots那一栏就不该有换下的清单(self, client, db):
        u = mk_user(db, "noslots")
        put(client, u, slots=[slot(FID_A, card=True)])
        assert put(client, u, name="阿飞").json()["file_ids"] == []


class Test隔离与连带:
    def test_两个人各读各的那一份(self, client, db):
        a = mk_user(db, "ia")
        b = mk_user(db, "ib")
        put(client, a, name="甲", bg_dim=0)
        put(client, b, name="乙", bg_dim=2)
        assert get(client, a).json()["name"] == "甲"
        assert get(client, b).json()["name"] == "乙"

    def test_没带票读不到任何东西(self, client):
        assert client.get("/api/user/profile").status_code in (401, 403)

    def test_注销把这一行删净并把四格地址并进file_ids(self, client, db):
        u = mk_user(db, "gone")
        put(client, u, name="阿飞", slots=[slot(FID_A, card=True), slot(FID_B, bg=True)])
        r = client.post("/api/user/deactivate", json={"confirm": True}, headers=hdr(u))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["deleted"].get("profile") == 1, body["deleted"]
        assert set(body["file_ids"]) >= {FID_A, FID_B}, "注销之后再没有口能问出这些地址"
        assert db.query(UserProfile).count() == 0
