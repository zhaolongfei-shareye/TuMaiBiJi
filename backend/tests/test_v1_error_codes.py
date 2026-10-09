"""`/v1` 错误体里那个稳定 `code`（契约 §六、任务 #171、站长 2026-10-10 拍的"不编名字"）。

这一把尺子量的是**两件事**，缺一半都不算数：
1. `/v1` 上那四个"状态码唯一对应"的名字真的带出去了（401→`unauthorized`、404→`not_found`、
   409→`conflict`、429→`rate_limited`），而 `detail` 那句中文**一个字都没改**；
2. **`/api` 一个字都没变**。这一支 handler 是全局注册的，`/api/*` 也走它，"不动旧门"这句话
   兑现成代码就只剩 `attach()` 里那一句路径判断——所以兼容面必须按**整个回体**比，
   只比 `status_code` 或只比 `detail` 都抓不到"多塞了一个键"。

第三条是这次拍板那句话本身：400／422／502／503 **不带 code**。它们今天没有任何一端在读，
名字不是我量出来的，所以这一版明确不承诺，客户端按状态码＋`detail` 处理（写在
`app/core/error_codes.py` 顶部，也写进契约 §六）。

⚠ 429 这一格是**直调那支函数**验的，没走端到端：本地这套用例把限流整体关掉
（`app.state.limiter.enabled = False`），而 slowapi 的存储指 `redis://localhost:6379`、
测试机上没有那台 Redis。所以下面那条钉的是"注册的就是这一支"+"这一支翻得出名字"两件事，
**不等于**现网 429 一定带 code——那一发挂在下一次部署的现网探针里（连打 6 次
`/v1/auth/apple`，读第 6 次的回体）。这条没做的边界写在上面，不许被"有判据"三个字盖过去。
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))          # 同目录的测试模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from test_v1_account_deletion import _fresh_session  # noqa: E402
from test_v1_auth_and_link import (  # noqa: E402
    _account_token, _bearer, _login, _mint, _public_jwk, _reload, _serve_jwks,
    _serve_jwks_raising, CLIENT_ID,
)

from app.models.account import Account  # noqa: E402


class _Request:
    """只带 `url.path` 的假请求——`attach()` 读的就这一样东西，多给都是装饰。"""

    def __init__(self, path):
        self.url = type("U", (), {"path": path})()


@pytest.fixture
def db():
    session = _fresh_session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


@pytest.fixture(scope="module")
def signing_key():
    from cryptography.hazmat.primitives.asymmetric import rsa
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def jwks(signing_key, monkeypatch):
    from app.core import apple_identity
    from app.core.config import settings

    apple_identity.reset_jwks_cache()
    monkeypatch.setattr(apple_identity, "_http_jwks",
                        _serve_jwks({"keys": [_public_jwk(signing_key)]}))
    monkeypatch.setattr(settings, "APPLE_CLIENT_ID", CLIENT_ID)
    yield
    apple_identity.reset_jwks_cache()


def _apple_person(client, db, signing_key, jwks, sub="apple-ec-1"):
    """建一个只有 Apple 身份的人（乙那一种），返回他手里那把 `/v1` 钥匙与他的 account 行。"""
    resp = _login(client, _mint(signing_key, sub=sub))
    assert resp.status_code == 200, resp.text
    account = _reload(db).query(Account).filter(
        Account.id == resp.json()["account_id"]).one()
    return _account_token(account), account


class Test那四个名字真的带出去了:
    def test_401_带_unauthorized_而那句中文一个字没改(self, client):
        resp = client.get("/v1/account")
        assert resp.status_code == 401, resp.text
        # 比**整个回体**：多一个键、少一个键、detail 被顺手改写，这里都红。
        assert resp.json() == {"detail": "缺少认证凭证，请重新登录", "code": "unauthorized"}

    def test_404_带_not_found(self, client, db, signing_key, jwks):
        token, _account = _apple_person(client, db, signing_key, jwks)
        resp = client.delete("/v1/account/link/email", headers=_bearer(token))
        assert resp.status_code == 404, resp.text
        assert resp.json() == {"detail": "这个账号没有关联过 email", "code": "not_found"}

    def test_409_带_conflict(self, client, db, signing_key, jwks):
        token, _account = _apple_person(client, db, signing_key, jwks)
        # 这个人只有一种登录方式，摘掉它就是最后一种 → 服务层回 409（`services/linking.py`）
        resp = client.delete("/v1/account/link/apple", headers=_bearer(token))
        assert resp.status_code == 409, resp.text
        assert resp.json()["code"] == "conflict", resp.json()

    def test_路由表里没有的那条_v1_路径_404_也带_code(self, client):
        """Starlette 自己抛的那种 404（路径压根没注册）也要一致。

        这条不是洁癖：handler 是按异常类型注册的，`fastapi.HTTPException` 是 Starlette 那支的子类，
        注册在基类上才两边都盖得住。哪天有人把它改成只认 fastapi 那一支，这一条红。
        """
        resp = client.get("/v1/no-such-route")
        assert resp.status_code == 404, resp.text
        assert resp.json() == {"detail": "Not Found", "code": "not_found"}


class Test没起名的那些明确不带:
    def test_400_不带_code(self, client, db, signing_key, jwks):
        """`DELETE /v1/account` 没带 confirm → 400。这一格没有名字，也不许现场编一个。

        必须**带着钥匙**打这一发：不带 token 走的是依赖里那道 401，根本到不了 confirm 那一句，
        那样这条判据量的就不是 400 了（第一版就是这么红的）。
        """
        token, _account = _apple_person(client, db, signing_key, jwks)
        resp = client.delete("/v1/account", headers=_bearer(token))
        assert resp.status_code == 400, resp.text
        assert resp.json() == {"detail": "请先确认删除账号"}

    def test_422_不带_code(self, client):
        resp = client.post("/v1/auth/apple", json={})
        assert resp.status_code == 422, resp.text
        assert "code" not in resp.json(), resp.json()

    def test_502_不带_code(self, client, db, signing_key, monkeypatch):
        """苹果侧拿不到 JWKS → 502。这一格同样在"明确不承诺"里（客户端动作是原样重试）。

        token 必须是**结构完好**的那一张： junk 串在验签之前就被判 401，走不到拉密钥那一步
        （第一版就是红在这里，看到的其实是 401 的回体）。
        """
        import httpx

        from app.core import apple_identity
        from app.core.config import settings

        monkeypatch.setattr(settings, "APPLE_CLIENT_ID", CLIENT_ID)
        monkeypatch.setattr(apple_identity, "_http_jwks",
                            _serve_jwks_raising(httpx.ConnectError("apple 那边连不上")))
        apple_identity.reset_jwks_cache()
        resp = _login(client, _mint(signing_key))
        apple_identity.reset_jwks_cache()
        assert resp.status_code == 502, f"{resp.status_code} {resp.text}"
        assert "code" not in resp.json(), resp.json()

    def test_503_不带_code(self, client, monkeypatch):
        """`APPLE_CLIENT_ID` 没配 → `/v1/auth/apple` 拒绝服务那一发是 503，同样不承诺名字。

        这一格是 10-10 补的：`core/error_codes.py` 头一段写"现读四个抛错处发得出哪些状态码"时
        把 503 漏了（它挂在 `core/apple_identity.py` 那句"配置没填绝不退化成不验 aud"上）。
        既然 400／422／502 三格都当场钉了"不带 code"，能被真发出来的 503 没道理只写在注释里。
        """
        from app.core.config import settings

        monkeypatch.setattr(settings, "APPLE_CLIENT_ID", "")
        resp = client.post("/v1/auth/apple", json={"identity_token": "x" * 40})
        assert resp.status_code == 503, f"{resp.status_code} {resp.text}"
        assert resp.json() == {"detail": "苹果登录暂未开放，请联系开发者"}


class Test旧门一个字没变:
    def test_同一条_401_在_api_上不带_code(self, client):
        """兼容面：全局 handler 也管 `/api`，"不动旧门"就兑现成这一条。

        按整个回体比。撤掉 `attach()` 里那句路径判断（`反向验证-阶段2-3.sh` 的 K 刀），这条第一个红。
        """
        resp = client.get("/api/user/quota")
        assert resp.status_code == 401, resp.text
        assert resp.json() == {"detail": "缺少认证凭证，请重新登录"}

    def test_路由表里没有的那条_api_路径_404_也原样(self, client):
        resp = client.get("/api/no-such-route")
        assert resp.status_code == 404, resp.text
        assert resp.json() == {"detail": "Not Found"}

    def test_限流那一支注册的就是会翻名字的函数(self):
        """429 端到端跑不了（测试机上没有那台 Redis），这里钉两件事：
        ① 处理 `RateLimitExceeded` 的注册确实是那支函数（改了注册这里红）；
        ② 那支函数被喂 `/v1` 路径时翻得出 `rate_limited`、喂 `/api` 时一个字不加。

        ⚠ 端到端那一发欠着，写在文件头那段。
        """
        from slowapi.errors import RateLimitExceeded

        from app.core import rate_limit
        from app.main import app

        assert app.exception_handlers.get(RateLimitExceeded) is rate_limit.rate_limit_exception_handler, \
            "注册被换掉了：这一路 429 不再经过那支函数，下面两句量的就不是线上那一条"

        v1 = rate_limit.rate_limit_exception_handler(_Request("/v1/auth/apple"), None)
        assert v1.status_code == 429
        assert v1.body.decode() == '{"detail":"请求过于频繁，请稍后再试","code":"rate_limited"}', v1.body
        api = rate_limit.rate_limit_exception_handler(_Request("/api/user/contact-email"), None)
        assert api.status_code == 429
        assert api.body.decode() == '{"detail":"请求过于频繁，请稍后再试"}', api.body
