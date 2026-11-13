"""开发态固定登录通道（`DEV_LOGIN_*`）：跑通 H5 登录流程但不依赖短信/邮件/Redis。

四条必须钉死，一条比一条贵：
① **默认关闭时零影响**。`DEV_LOGIN_ENABLED=False`（默认值）时，固定码绝不放行——
   这一档一旦在生产 .env 里悄悄开着，等于给那个号留了一道不验码的门，所以默认态必须是关。
② **锁定到具体号**。开关开着，但登录的手机号/邮箱不是 `DEV_LOGIN_PHONE`/`DEV_LOGIN_EMAIL`
   那一枚时，必须回落到真实校验（测试库里没种码 → 400），绝不"任意账号 + 固定码"放行。
③ **固定码要逐字对**。开关开、号也对，但码不是 `DEV_LOGIN_CODE` 那一个 → 400。
④ **命中即出票**。开关开、号对、码对 → 200 + legacy token（H5 拿它调 `/api/notes/*`）。
"""
import pytest

from app.db.database import Base, SessionLocal, engine
import app.models  # noqa: F401  建表只看这一刻已 import 的模型
from app.models.account import Account, AccountIdentity  # noqa: F401
from app.models.note import Note  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.generation_seq import GenerationSeq  # noqa: F401
from app.core.config import settings

DEV_PHONE = "19900000000"
DEV_EMAIL = "devtest@agentsbin.cn"
DEV_CODE = "888888"


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app

    Base.metadata.drop_all(
        bind=engine,
        tables=[AccountIdentity.__table__, Note.__table__, Account.__table__,
                User.__table__, GenerationSeq.__table__],
    )
    Base.metadata.create_all(bind=engine)

    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


@pytest.fixture
def dev_on(monkeypatch):
    monkeypatch.setattr(settings, "DEV_LOGIN_ENABLED", True)
    monkeypatch.setattr(settings, "DEV_LOGIN_PHONE", DEV_PHONE)
    monkeypatch.setattr(settings, "DEV_LOGIN_EMAIL", DEV_EMAIL)
    monkeypatch.setattr(settings, "DEV_LOGIN_CODE", DEV_CODE)


@pytest.fixture
def dev_off(monkeypatch):
    monkeypatch.setattr(settings, "DEV_LOGIN_ENABLED", False)
    monkeypatch.setattr(settings, "DEV_LOGIN_PHONE", DEV_PHONE)
    monkeypatch.setattr(settings, "DEV_LOGIN_EMAIL", DEV_EMAIL)
    monkeypatch.setattr(settings, "DEV_LOGIN_CODE", DEV_CODE)


def test_默认关闭时固定码不放行(client, dev_off):
    resp = client.post("/v1/auth/login", json={"phone": DEV_PHONE, "code": DEV_CODE})
    assert resp.status_code == 400, "开关关着还放行 = 生产留了后门"


def test_开关开_号对_码对_出票(client, dev_on):
    resp = client.post("/v1/auth/login", json={"phone": DEV_PHONE, "code": DEV_CODE})
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("token"), "登录成功必须发 legacy token 给 H5"
    assert isinstance(body.get("user_id"), int)


def test_开关开但码不对_拒绝(client, dev_on):
    resp = client.post("/v1/auth/login", json={"phone": DEV_PHONE, "code": "123456"})
    assert resp.status_code == 400


def test_开关开但号不是锁定那枚_拒绝(client, dev_on):
    # 别的号即使蒙对固定码也不放行——回落真实校验，测试库里没种码 → 400。
    resp = client.post("/v1/auth/login", json={"phone": "13800000000", "code": DEV_CODE})
    assert resp.status_code == 400


def test_邮箱通道同样锁死(client, dev_on):
    ok = client.post("/v1/auth/email-login", json={"email": DEV_EMAIL, "code": DEV_CODE})
    assert ok.status_code == 200 and ok.json().get("token")
    bad = client.post("/v1/auth/email-login", json={"email": "other@x.com", "code": DEV_CODE})
    assert bad.status_code == 400
