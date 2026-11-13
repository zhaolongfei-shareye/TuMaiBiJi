"""设备游客号 `/v1/auth/guest`：不验证、凭 device_id 发一把 legacy token，让 H5 游客
直接跑通核心业务流（录入→AI 提炼→列表→详情）。四条要钉死：

① **命中即出票**：任意合法 device_id → 200 + legacy token（`sub=<users.id>`，不带 kind）
   + user_id，且这把 token 真能开 `/api/notes/`（get_current_user 认它）。
② **同设备幂等**：同一个 device_id 两次登录 → 同一行 users（数据不会每次刷新就丢）。
③ **异设备隔离**：不同 device_id → 不同 users，游客之间互不可见。
④ **默认四格已种**：新建游客号名下默认分类被种下去（与手机登录同型）。
"""
import pytest

from app.db.database import Base, engine
import app.models  # noqa: F401
from app.models.account import Account, AccountIdentity  # noqa: F401
from app.models.note import Note  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.generation_seq import GenerationSeq  # noqa: F401
from app.models.category import Category  # noqa: F401


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app

    Base.metadata.drop_all(
        bind=engine,
        tables=[AccountIdentity.__table__, Note.__table__, Category.__table__,
                Account.__table__, User.__table__, GenerationSeq.__table__],
    )
    Base.metadata.create_all(bind=engine)

    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


def _guest(client, device_id):
    return client.post("/v1/auth/guest", json={"device_id": device_id})


def test_命中即出票且能开_legacy_口(client):
    resp = _guest(client, "aaaaaaaa-1111-2222-3333-444444444444")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["token"] and body["user_id"]
    # 这把 token 必须是老式（能开 /api/notes，get_current_user 认它）
    notes = client.get("/api/notes/",
                       headers={"Authorization": "Bearer " + body["token"]})
    assert notes.status_code == 200, notes.text


def test_同设备幂等同一行用户(client):
    a = _guest(client, "device-x-0001").json()
    b = _guest(client, "device-x-0001").json()
    assert a["user_id"] == b["user_id"]


def test_异设备互相隔离(client):
    a = _guest(client, "device-y-0001").json()
    b = _guest(client, "device-z-0002").json()
    assert a["user_id"] != b["user_id"]


def test_新建游客号种了默认四格(client):
    body = _guest(client, "device-seed-0001").json()
    cats = client.get("/api/categories/",
                      headers={"Authorization": "Bearer " + body["token"]}).json()
    assert len(cats) == 4


def test_device_id_太短被拒(client):
    assert _guest(client, "abc").status_code == 422
