"""壁纸白名单：四枚现在都要收得下（站长 10-04 拍「统一」）。

象牙 / 天青 / 樱落原来只存本机，为的是不碰现网；现在这三个 key 进了后端白名单，
客户端那条"只写本机"的旁路也撤干净了，所以四枚的持久化是同一条路。
两个方向都要钉：新 key 收得下（否则选它就 400），旧 key 也**一个都不许删**
（存量 18 个账号里有人存着 default / gradient-ocean，白名单一缩他们下次 PUT 就报错）。
"""
import os
import sys
import time

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_wp.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from app.api.routes.user import WALLPAPER_PRESETS
from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.user import User

# 界面上那四枚的 key，出处是 miniprogram/utils/palette.js 的 THEMES。
CANONICAL = ["tint-paper", "tint-celadon", "tint-blush", "gradient-blue"]
# 六枚旧值：并档之后界面上已经没有它们，但库里还躺着，PUT 必须照样收。
LEGACY = ["default", "gradient-green", "gradient-sunset", "gradient-purple", "gradient-ocean"]


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
    u = User(openid=f"wp-{int(time.time() * 1000)}")
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {_create_token(user.id, user.generation)}"}


class Test白名单:
    @pytest.mark.parametrize("key", CANONICAL)
    def test_界面上那四枚都存得进服务端(self, client, me, db, key):
        r = client.put("/api/user/wallpaper", json={"wallpaper": key}, headers=hdr(me))
        assert r.status_code == 200, r.text
        assert r.json() == {"wallpaper": key}
        db.expire_all()
        assert db.get(User, me.id).wallpaper == key

    @pytest.mark.parametrize("key", LEGACY)
    def test_旧值一个都没被踢出去(self, client, me, key):
        """删旧值不会让界面变坏，只会让存量账号下次换壁纸时收到 400。"""
        assert client.put("/api/user/wallpaper", json={"wallpaper": key}, headers=hdr(me)).status_code == 200

    def test_白名单外仍然拒且回中文(self, client, me):
        r = client.put("/api/user/wallpaper", json={"wallpaper": "not-a-theme"}, headers=hdr(me))
        assert r.status_code == 400
        assert "壁纸" in r.json()["detail"]

    def test_选项接口回的就是这张白名单(self, client):
        assert client.get("/api/user/wallpaper/options").json() == {"options": WALLPAPER_PRESETS}
