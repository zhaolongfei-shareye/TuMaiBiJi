"""私密密码：设、验、重置三条路。

三条不变量：
① 库里落的是 sha256 后的 64 位十六进制，不是那六个数字本身——拖库也读不到明文。
② 状态那一位只说实话：没设过 is_set=False，设过 True，重置后回到 False。
   「新建/编辑时选了私密但没设密码就拦住」这条规则整条吃的是这个返回值。
③ 重置是真清掉了那一列：拿旧密码再验必须 400（尚未设置），不是 403（密码不正确）。
   两个码分开是有意的——400 说明这个账号根本没上锁，403 说明锁着、只是你输错了。
"""
import hashlib
import os
import sys
import time

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_pp.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.user import User


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


@pytest.fixture()
def me(db):
    u = User(openid=f"pp-{int(time.time() * 1000)}")
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {_create_token(user.id, user.generation)}"}


class Test设与验:
    def test_没设过时状态说不曾设过(self, client, me):
        assert client.get("/api/user/private-password", headers=hdr(me)).json() == {"is_set": False}

    def test_设完状态翻转且库里不是明文(self, client, me, db):
        r = client.put("/api/user/private-password", json={"password": "246813"}, headers=hdr(me))
        assert r.status_code == 200
        assert client.get("/api/user/private-password", headers=hdr(me)).json() == {"is_set": True}
        db.expire_all()
        stored = db.query(User).filter(User.id == me.id).one().private_password_hash
        assert stored == hashlib.sha256("246813".encode()).hexdigest()
        assert "246813" not in stored

    def test_对密码放行错密码四零三(self, client, me):
        client.put("/api/user/private-password", json={"password": "135790"}, headers=hdr(me))
        assert client.post("/api/user/private-password/verify", json={"password": "135790"}, headers=hdr(me)).status_code == 200
        wrong = client.post("/api/user/private-password/verify", json={"password": "000000"}, headers=hdr(me))
        assert wrong.status_code == 403

    def test_不是六位数字不收(self, client, me):
        for bad in ["12345", "1234567", "abcdef", "12 345"]:
            assert client.put("/api/user/private-password", json={"password": bad}, headers=hdr(me)).status_code == 422


class Test重置:
    def test_重置后状态回到未设置(self, client, me):
        client.put("/api/user/private-password", json={"password": "112233"}, headers=hdr(me))
        assert client.post("/api/user/private-password/reset", headers=hdr(me)).json() == {"ok": True, "is_set": False}
        assert client.get("/api/user/private-password", headers=hdr(me)).json() == {"is_set": False}

    def test_重置后拿旧密码验是四零零不是四零三(self, client, me):
        client.put("/api/user/private-password", json={"password": "112233"}, headers=hdr(me))
        client.post("/api/user/private-password/reset", headers=hdr(me))
        r = client.post("/api/user/private-password/verify", json={"password": "112233"}, headers=hdr(me))
        assert r.status_code == 400, "400=这个账号根本没上锁；403=锁着你输错了，两者不能混"

    def test_重置只动密码那一列笔记分类都在(self, client, me, db):
        from app.models.category import Category
        from app.models.note import Note

        db.add_all([
            Category(user_id=str(me.id), name="私密", color="#23252C"),
            Note(user_id=str(me.id), title="重置后也该在", source_type="manual"),
        ])
        db.commit()
        client.put("/api/user/private-password", json={"password": "112233"}, headers=hdr(me))
        client.post("/api/user/private-password/reset", headers=hdr(me))
        db.expire_all()
        assert db.query(Note).filter(Note.user_id == str(me.id)).count() == 1
        assert db.query(Category).filter(Category.user_id == str(me.id)).count() == 1

    def test_没设过也能重置且是幂等的(self, client, me):
        for _ in range(2):
            assert client.post("/api/user/private-password/reset", headers=hdr(me)).status_code == 200

    def test_不带令牌进不来(self, client):
        assert client.post("/api/user/private-password/reset").status_code in (401, 403)


class Test那一格私密跟着密码一起备好:
    """设完密码的人，界面上必须立刻有地方放私密笔记。

    锁的判据是分类名（app/core/private_access.py），可原来全项目没有一处会造出这一格：
    只能自己去分类管理手打"私密"两个字，而密码面板设完只回一句"已保存"。09-30 站长
    就是卡在这一步，原话"密码已经设了，但分类看不到私密分类，写笔记时候也看不到可以选私密"。
    """

    def test_设完密码名下多出一格私密(self, client, me, db):
        from app.models.category import Category
        client.put("/api/user/private-password", json={"password": "246813"}, headers=hdr(me))
        db.expire_all()
        names = [c.name for c in db.query(Category).filter(Category.user_id == str(me.id)).all()]
        assert names == ["私密"], names

    def test_那一格出现在分类接口里否则录入页选不到(self, client, me):
        client.put("/api/user/private-password", json={"password": "246813"}, headers=hdr(me))
        got = [c["name"] for c in client.get("/api/categories/", headers=hdr(me)).json()]
        assert "私密" in got, got

    def test_反复设反复问也只有一格(self, client, me, db):
        from app.models.category import Category
        for pin in ("246813", "135790", "246813"):
            client.put("/api/user/private-password", json={"password": pin}, headers=hdr(me))
            client.get("/api/user/private-password", headers=hdr(me))
        db.expire_all()
        assert db.query(Category).filter(
            Category.user_id == str(me.id), Category.name == "私密").count() == 1

    def test_自己先建过那一格就不重复造也不换id(self, client, me, db):
        from app.models.category import Category
        mine = Category(user_id=str(me.id), name="私密", color="#23252C")
        db.add(mine)
        db.commit()
        client.put("/api/user/private-password", json={"password": "246813"}, headers=hdr(me))
        client.get("/api/user/private-password", headers=hdr(me))
        db.expire_all()
        rows = db.query(Category).filter(
            Category.user_id == str(me.id), Category.name == "私密").all()
        assert len(rows) == 1 and rows[0].id == mine.id, f"{len(rows)} 格 / id 变了"
        assert rows[0].color == "#23252C", "补齐不该把人家自己选的颜色改掉"

    def test_没设密码的人问状态也不会凭空多出一格(self, client, me, db):
        from app.models.category import Category
        assert client.get("/api/user/private-password", headers=hdr(me)).json() == {"is_set": False}
        db.expire_all()
        assert db.query(Category).filter(Category.user_id == str(me.id)).count() == 0

    def test_闸门上线前就设过密码的账号问一次就补上(self, client, me, db):
        """存量自愈这一条是本次真正的目的：现网已经有人设过密码（站长自己），
        不刷数据、不改客户端，下一次进"我的"页那一格就该出现。"""
        from app.models.category import Category
        import hashlib
        me.private_password_hash = hashlib.sha256("246813".encode()).hexdigest()
        db.commit()
        assert client.get("/api/user/private-password", headers=hdr(me)).json() == {"is_set": True}
        db.expire_all()
        assert [c.name for c in db.query(Category).filter(
            Category.user_id == str(me.id)).all()] == ["私密"]


class Test私密那一格不许被静默删掉:
    """删分类的通用逻辑会把名下笔记的 category_id 置空——对别的分类那叫取消归类，
    对这一格等于把一批笔记静默解锁（判据就是分类名）。所以格里有东西时拦下，空着照旧能删。"""

    def _fill(self, client, me, db):
        from app.models.category import Category
        from app.models.note import Note
        client.put("/api/user/private-password", json={"password": "246813"}, headers=hdr(me))
        cat = db.query(Category).filter_by(user_id=str(me.id), name="私密").one()
        db.add(Note(user_id=str(me.id), title="格里的一篇", source_type="manual",
                    category_id=cat.id))
        db.commit()
        return cat

    def _names(self, client, me):
        return {c["name"]: c["id"] for c in client.get("/api/categories/", headers=hdr(me)).json()}

    def test_格里有笔记时删不掉且说清为什么(self, client, me, db):
        cat = self._fill(client, me, db)
        r = client.delete(f"/api/categories/{cat.id}", headers=hdr(me))
        assert r.status_code == 400, f"HTTP {r.status_code} {r.text}"
        assert "私密" in r.text and "挪走" in r.text, r.text
        assert "私密" in self._names(client, me), "拦下了就不该被删走"

    def test_空的一格照旧能删(self, client, me, db):
        client.put("/api/user/private-password", json={"password": "246813"}, headers=hdr(me))
        cat_id = self._names(client, me)["私密"]
        assert client.delete(f"/api/categories/{cat_id}", headers=hdr(me)).status_code == 200

    def test_别的分类照旧能带着笔记一起删(self, client, me, db):
        """反向钉：上面那道闸只针对「私密」，别把通用行为一起改掉。"""
        from app.models.category import Category
        from app.models.note import Note
        other = Category(user_id=str(me.id), name="读书", color="#D2683F")
        db.add(other)
        db.commit()
        db.add(Note(user_id=str(me.id), title="格外的一篇", source_type="manual",
                    category_id=other.id))
        db.commit()
        r = client.delete(f"/api/categories/{other.id}", headers=hdr(me))
        assert r.status_code == 200, r.text
        db.expire_all()
        assert db.query(Note).filter(Note.user_id == str(me.id)).count() == 1
        assert db.query(Note).filter(Note.user_id == str(me.id)).one().category_id is None
