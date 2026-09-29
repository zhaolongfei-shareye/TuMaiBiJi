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
