"""审计第一批两条鉴权/信息泄漏的判据：#12 登录口的限流键、#14 预览引擎那口的回体。

两条都不是"算错数"，是**话说多了**与**桶记错了**：
- #12：全局那把 `key_func` 是 `get_user_key`，带一把签名有效的票就换成按 `sub` 计桶，
  于是"登录口 5/分钟按 IP"这句在代码注释里写了、在实现里不成立。
- #14：`detail=f"…：{e}"` 里那个 `e` 是 OSError，原文带**绝对路径**，而这一口的回体
  会被后台那一页原样显示出来。

判据读的是**注册进去的那个函数对象**，不是源码字符串——字符串会被注释顶包（同 #11 那条教训）。
"""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.admin_access import create_session_token  # noqa: E402
from app.core.auth import _create_token  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.rate_limit import get_ip_key, get_user_key, limiter  # noqa: E402
from app.main import app  # noqa: E402
from app.services import poster_engine  # noqa: E402

ADMIN_PW = "pytest-login-key-not-a-real-one-32"

# 这四个是"匿名可反复试"的那一类：票在这里还没拿到，桶必须钉在来源上。
LOGIN_ROUTES = {
    "app.api.routes.auth.wechat_login",
    "app.api.routes.v1_auth.apple_login",
    "app.api.routes.v1_auth.wechat_login",
    "app.api.routes.admin_ops.admin_login",
}


class _Req:
    """够慢api 那两个取键函数用的最小请求替身。"""

    def __init__(self, ip="203.0.113.9", authorization=None):
        self.headers = {} if authorization is None else {"authorization": authorization}
        self.client = type("C", (), {"host": ip})()


def test_四个登录口的限流键显式是IP那一枚():
    registered = {name: limits for name, limits in limiter._route_limits.items()
                  if name in LOGIN_ROUTES}
    assert set(registered) == LOGIN_ROUTES, f"少注册了一个：{LOGIN_ROUTES - set(registered)}"
    for name, limits in registered.items():
        funcs = {getattr(l, "key_func", None) for l in limits}
        assert funcs == {get_ip_key}, f"{name} 的键不是 IP 那一枚：{funcs}"


def test_同一台机器换着票打来源桶也不会变宽():
    """这一条就是 #12 的正身：`get_user_key` 见到有效票各开一条桶（红），
    `get_ip_key` 三枚票回同一个键（绿）。票用真签名，不造假形状。"""
    keys_by_user = set()
    keys_by_ip = set()
    for i in range(3):
        token = _create_token(1000 + i, 1)
        req = _Req(authorization=f"Bearer {token}")
        keys_by_user.add(get_user_key(req))
        keys_by_ip.add(get_ip_key(req))
    assert len(keys_by_user) == 3, "前提：换票确实会换桶（这条不成立说明实现变了，判据要跟着改）"
    assert keys_by_ip == {"203.0.113.9"}, f"带票就换桶＝登录口能被换钥匙放宽：{keys_by_ip}"


def test_过期票也当有效那把键用是已知行为不是新洞():
    """`get_user_key` 里 `verify_exp=False` 是留给"票过期但业务还要认人"那类口的，
    这一条不判它对错，只钉住两件事：解不开票时它退到来源，以及**两枚键的桶名不通用**
    （`ip:203.0.113.9` 对 `203.0.113.9`）——换键那天旧桶自然作废，不会互相干扰。"""
    req = _Req(authorization="Bearer not-a-jwt-at-all")
    assert get_user_key(req) == "ip:203.0.113.9"
    assert get_ip_key(req) == "203.0.113.9"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_TOKEN", ADMIN_PW)
    yield TestClient(app)


def test_预览引擎读不出来时回体里没有路径(client, monkeypatch):
    """#14：`open()` 打不开的 OSError 原文是 `[Errno 13] Permission denied: '/home/ubuntu/…'`。
    屏上那句要还能看出"是这一栏读不出来"，但不许带出机器上的位置。"""
    def boom():
        raise OSError(13, "Permission denied", "/home/ubuntu/wtsj-backend/app/poster_engine/poster.js")

    monkeypatch.setattr(poster_engine, "ready", lambda: True)
    monkeypatch.setattr(poster_engine, "bundle", boom)
    r = client.get("/api/admin/poster/engine",
                   headers={"Authorization": f"Bearer {create_session_token()}"})
    assert r.status_code == 503, r.text
    detail = r.json()["detail"]
    assert "/home/" not in detail and "poster.js" not in detail, detail
    assert "预览引擎" in detail, "只回一句通用话也不行：那一页要能看出是哪一栏坏了"


def test_校验没过那一句仍然带文件名(client, monkeypatch):
    """同一处的另一半：`ValueError` 那句是我们自己写的（"哪一只与名单对不上"），
    给操作者看正合适，不许被 #14 一起抹成通用话——抹掉之后现场只剩"读不出来"四个字。"""
    def diverged():
        raise ValueError("api.js 与名单里记的那一份对不上（部署没拷全，或副本与源文件已分叉）")

    monkeypatch.setattr(poster_engine, "ready", lambda: True)
    monkeypatch.setattr(poster_engine, "bundle", diverged)
    r = client.get("/api/admin/poster/engine",
                   headers={"Authorization": f"Bearer {create_session_token()}"})
    assert r.status_code == 503 and "api.js" in r.json()["detail"], r.text
