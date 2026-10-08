"""用户自己填的联系邮箱：填、改、清除三条路，外加"只有本人读得到"。

四条不变量：
① 这一格可空、只回给当前 token 那个 user；别的账号拿自己的 token 问，读到的是空串，
   不是别人的地址——openid 从不下发，所以"来信对上账号"只能靠这一格，也就绝不能串号。
② 存进去的是规范化后的形状（去首尾空白 + 全小写）。同一个人手机大写、电脑小写是同一个地址。
③ 传空串就是清除，回到"未填写"，不是保留旧值——界面那句"清空后重新输入"吃的是这个。
④ 这一格不进任何其他读接口：把邮箱填上后逐个 GET 一遍，响应体里不能搜到它。
"""
import os
import sys
import time

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_ce.db"
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
    u = User(openid=f"ce-{int(time.time() * 1000)}")
    db.add(u)
    db.commit()
    return u


@pytest.fixture()
def other(db):
    u = User(openid=f"ce-other-{int(time.time() * 1000)}")
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {_create_token(user.id, user.generation)}"}


class Test填与读:
    def test_没填过读到空串而不是null(self, client, me):
        assert client.get("/api/user/contact-email", headers=hdr(me)).json() == {"email": ""}

    def test_填完读回来是同一个(self, client, me):
        r = client.put("/api/user/contact-email", json={"email": "Zhang.San@ExaMple.Com "}, headers=hdr(me))
        assert r.status_code == 200
        assert client.get("/api/user/contact-email", headers=hdr(me)).json() == {"email": "zhang.san@example.com"}

    def test_库里落的也是规范化那份(self, client, me, db):
        client.put("/api/user/contact-email", json={"email": "  FeDc@Qq.CoM"}, headers=hdr(me))
        db.expire_all()
        assert db.query(User).filter(User.id == me.id).one().contact_email == "fedc@qq.com"

    def test_改地址是覆盖不是并排(self, client, me):
        client.put("/api/user/contact-email", json={"email": "first@qq.com"}, headers=hdr(me))
        client.put("/api/user/contact-email", json={"email": "second@gmail.com"}, headers=hdr(me))
        assert client.get("/api/user/contact-email", headers=hdr(me)).json() == {"email": "second@gmail.com"}

    def test_传空串是清除(self, client, me):
        client.put("/api/user/contact-email", json={"email": "will.clear@qq.com"}, headers=hdr(me))
        assert client.put("/api/user/contact-email", json={"email": "   "}, headers=hdr(me)).status_code == 200
        assert client.get("/api/user/contact-email", headers=hdr(me)).json() == {"email": ""}


class Test不收的形状:
    @pytest.mark.parametrize("bad", [
        "not-an-email",
        "a@b",
        "@qq.com",
        "a@@qq.com",
        "a b@qq.com",
        "a@b@c.com",
        "a@qq.c",
    ])
    def test_明显不合法的写法四百(self, client, me, bad):
        assert client.put("/api/user/contact-email", json={"email": bad}, headers=hdr(me)).status_code == 400

    def test_整串超长四百(self, client, me):
        long = "a" * 50 + "@" + "b" * 200 + ".com"
        assert len(long) > 254
        assert client.put("/api/user/contact-email", json={"email": long}, headers=hdr(me)).status_code == 400

    def test_本地部分超长四百(self, client, me):
        long = "a" * 65 + "@qq.com"
        assert client.put("/api/user/contact-email", json={"email": long}, headers=hdr(me)).status_code == 400

    def test_收的时候越界不会把旧值改掉(self, client, me):
        """被拒的那一次必须一个字都不写——否则一次输错就把人原来的地址抹了。"""
        client.put("/api/user/contact-email", json={"email": "keep@qq.com"}, headers=hdr(me))
        assert client.put("/api/user/contact-email", json={"email": "bad shape"}, headers=hdr(me)).status_code == 400
        assert client.get("/api/user/contact-email", headers=hdr(me)).json() == {"email": "keep@qq.com"}


class Test只有本人读得到:
    def test_别的账号读不到(self, client, me, other):
        client.put("/api/user/contact-email", json={"email": "private@qq.com"}, headers=hdr(me))
        assert client.get("/api/user/contact-email", headers=hdr(other)).json() == {"email": ""}

    def test_别的账号改不掉(self, client, me, other):
        client.put("/api/user/contact-email", json={"email": "private@qq.com"}, headers=hdr(me))
        client.put("/api/user/contact-email", json={"email": "hijack@gmail.com"}, headers=hdr(other))
        assert client.get("/api/user/contact-email", headers=hdr(me)).json() == {"email": "private@qq.com"}

    def test_没带token问不了(self, client):
        assert client.get("/api/user/contact-email").status_code == 401
        assert client.put("/api/user/contact-email", json={"email": "x@qq.com"}).status_code == 401

    def test_这一格不从其他读接口漏出去(self, client, me):
        client.put("/api/user/contact-email", json={"email": "leakcheck@qq.com"}, headers=hdr(me))
        for path in [
            "/api/user/quota",
            "/api/user/private-password",
            "/api/user/wallpaper/options",
            "/api/notes/",
            "/api/categories/",
            "/api/poster/templates/",
            "/api/user/storage-quota",
        ]:
            r = client.get(path, headers=hdr(me))
            assert r.status_code == 200, f"{path} 返回 {r.status_code}"
            assert "leakcheck@qq.com" not in r.text, f"{path} 把联系邮箱带出去了"
