"""`/v1` 错误体里那个稳定 `code`（契约 §六、任务 #171、站长 2026-10-10 拍的"不编名字"）。

这一把尺子量的是**三件事**，缺一半都不算数：
1. `/v1` 上那四个"状态码唯一对应"的名字真的带出去了（401→`unauthorized`、404→`not_found`、
   409→`conflict`、429→`rate_limited`），而 `detail` 那句中文**一个字都没改**；
2. **`/api` 一个字都没变**。这一支 handler 是全局注册的，`/api/*` 也走它，"不动旧门"这句话
   兑现成代码就只剩 `is_v1_path()` 那一句——所以兼容面必须按**整个回体**比，
   只比 `status_code` 或只比 `detail` 都抓不到"多塞了一个键"；`CODE_BY_STATUS` 里每一个键
   都要在 `/api` 上钉一遍（少一个键就是少一面：10-10 审查那轮 `/api` 只钉了 401 与 404，
   而 409／429 在 `/api` 上今天真发得出，"只给 409 也加 code"这种改法能全绿）。
3. 第三条是这次拍板那句话本身：400／405／422／502／503 **不带 code**。它们今天没有任何一端在读，
   名字不是我量出来的，所以这一版明确不承诺，客户端按状态码＋`detail` 处理（写在
   `app/core/error_codes.py` 顶部，也写进契约 §六）。

⚠ 429 这一格是**直调那支函数**验的，没走端到端：本地这套用例把限流整体关掉
（`app.state.limiter.enabled = False`），而 slowapi 的存储指 `redis://localhost:6379`、
测试机上没有那台 Redis。所以下面那条钉的是"注册的就是这一支"+"这一支翻得出名字"两件事，
**不等于**现网 429 一定带 code——那一发挂在下一次部署的现网探针里（连打 6 次
`/v1/auth/apple`，读第 6 次的回体）。这条没做的边界写在上面，不许被"有判据"三个字盖过去。

下面 `Test那一句路径判断的地基` 那一组是 10-10 代码审计抓出来的三条，都不是"再挑一点毛病"，
是**改坏了没有任何现网症状**的三类：`root_path`（前缀写法换成带前缀那种，`/v1` 静默不再带 code）、
`/v1x` 这类"看着像 `/v1` 的路径"（过匹配会把一个旧门绝不该出现的键发出去）、
以及 204/304 那种**按 HTTP 语义不许有 body** 的状态码（注册全局 handler 是替换默认那支，
少了这道闸等于把 body 语义一起换掉，`/api` 也中）。
"""
import asyncio
import os
import re
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))          # 同目录的测试模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from test_v1_account_deletion import _fresh_session  # noqa: E402
from test_v1_auth_and_link import (  # noqa: E402
    _account_token, _bearer, _login, _mint, _public_jwk, _reload, _serve_jwks,
    _serve_jwks_raising, CLIENT_ID,
)

from app.core.error_codes import CODE_BY_STATUS  # noqa: E402  ← 兼容面按这张表**逐格**参数化
from app.models.account import Account  # noqa: E402


class _Request:
    """只带 `scope` 的假请求——`route_path()` 读的就 `path` 与 `root_path` 两样，多给都是装饰。

    这里**故意**不给 `url`：那一路写法（`request.url.path`）正是 10-10 审查抓出来的那条，
    留着 `url` 的话哪天有人改回去，这条判据会因为假对象恰好两种都支持而看不见。
    """

    def __init__(self, path, root_path=""):
        self.scope = {"path": path, "root_path": root_path, "type": "http"}


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

    def test_405_不带_code_而_allow_头原样(self, client):
        """路由表里有这条路径、但没有这个方法 → 405，这一格同样没名字。

        405 是 10-10 审查从 `error_codes.py` 那份"发得出来的状态码"名单里**抓出来的漏项**
        （同一份名单第一版还漏过 503）。它是 Starlette 路由自己发的，不经过我们任何一处 `raise`，
        所以最容易漏——`allow` 头一起钉：那句"响应头原样"不许只写在注释里。
        """
        resp = client.post("/v1/account", json={})
        assert resp.status_code == 405, resp.text
        assert resp.json() == {"detail": "Method Not Allowed"}, resp.json()
        assert resp.headers.get("allow") == "GET", dict(resp.headers)

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

    @pytest.mark.parametrize("status_code", sorted(CODE_BY_STATUS))
    def test_表里每一格在_api_上都不得现身(self, status_code):
        """兼容面**逐格**钉，不是抽一格钉。

        10-10 审查抓的就是这个缺面：旧版只钉了 `/api` 上的 401 与 404，而 `CODE_BY_STATUS` 里的
        409 与 429 在 `/api` 上今天**真发得出**（`routes/shares.py` 那句"分享状态刚变过"、
        `routes/ingest.py` 那发手写 `HTTPException(429)`）。那时候"只给 409 也加 code"这种改法
        能让整把尺子全绿，而已上线的回体被改了。按表参数化＝表里长一格，兼容面自己多一面。
        """
        from app.core.error_codes import attach

        assert attach(f"/api/anything/{status_code}", status_code, {"detail": "中文"}) == {"detail": "中文"}
        assert attach("/api", status_code, {"detail": "中文"}) == {"detail": "中文"}

    def test_看着像_v1_而不是_v1_的路径不许带_code(self, client):
        """`startswith("/v1")` 那种过匹配：路由表外的 `/v1x/account` 会回一个旧门绝不该出现的键。

        审查实跑的读数就是 `{"detail": "Not Found", "code": "not_found"}`。这一条把
        `is_v1_path()` 钉成"正好 `/v1` 或 `/v1/…`"，反面（`/v1` 与 `/v1/account` 仍然算这一路）
        由上面 `Test那四个名字真的带出去了` 那几条盖着。
        """
        resp = client.get("/v1x/account")
        assert resp.status_code == 404, resp.text
        assert resp.json() == {"detail": "Not Found"}
        assert client.get("/v100").json() == {"detail": "Not Found"}


class Test那一句路径判断的地基:
    """三条共同点：**改坏了没有现网症状**——旧门照旧、新门只是少一个键或多加一个不该有的键。"""

    def test_带_root_path_的前缀路径仍然算_v1(self):
        """nginx 若是"不剥前缀 ＋ 告诉进程 root_path"那种写法（#161 的修法之一），
        `request.url.path` 就成了 `/wtsj/v1/…`，那句判断**静默失效**：iPhone 拿不到 `code`，
        而 `/api` 一个字没变。所以读的是 `get_route_path(scope)`，这条钉它。
        """
        from fastapi.exceptions import HTTPException as FastHTTPException

        from app.core.error_codes import http_exception_handler

        exc = FastHTTPException(status_code=401, detail="缺少认证凭证，请重新登录")
        with_prefix = asyncio.run(http_exception_handler(_Request("/wtsj/v1/account", root_path="/wtsj"), exc))
        assert with_prefix.status_code == 401
        assert with_prefix.body.decode() == (
            '{"detail":"缺少认证凭证，请重新登录","code":"unauthorized"}'
        ), with_prefix.body

        # 反面：旧门带着前缀也仍然是旧门，一个键都不许多。
        old_door = asyncio.run(
            http_exception_handler(_Request("/wtsj/api/user/quota", root_path="/wtsj"), exc))
        assert old_door.body.decode() == '{"detail":"缺少认证凭证，请重新登录"}', old_door.body

    @pytest.mark.parametrize("status_code", [204, 304])
    @pytest.mark.parametrize("path", ["/v1/account", "/api/user/quota"])
    def test_按_http_语义不许有_body_的那几格_body_必须是空的(self, status_code, path):
        """注册全局 handler 是**替换**默认那支，默认那支里有一道 body 闸门。

        少了它，`raise HTTPException(204)` 会带着 `{"detail": …}` 出去——204/205/304 与 1xx
        按 HTTP 语义不许有 body，而这条与 `/v1` 无关，`/api` 一样中（10-10 审查实跑
        `/api/probe-204` 看到的就是 JSON body）。今天全仓没有 204/304 的抛错处，所以是**潜伏**：
        这一条不许被"现在没人这么写"注销，它钉的是那三行闸门还在。
        """
        from fastapi.exceptions import HTTPException as FastHTTPException

        from app.core.error_codes import http_exception_handler

        resp = asyncio.run(http_exception_handler(
            _Request(path), FastHTTPException(status_code=status_code, detail="不该出现在 body 里")))
        assert resp.status_code == status_code
        assert resp.body == b"", resp.body
        assert resp.media_type is None, resp.media_type

    def test_v1_那一路今天发不出_403_这句是拿源码钉的(self):
        """`error_codes.py` 顶部那句"今天 `/v1` 一条 403 都发不出来"是**实测**，不是修辞。

        为什么值得上尺子：那一路把状态码交在服务层手里——`services/linking.py` 那支
        `LinkRefused` 自带 status，`routes/v1_account.py:_refused` 原样翻成 HTTP。将来一句
        `LinkRefused("…", 403)` 就让那句话变成假话，而且**零条判据会红**。
        红的时候该改的是那段说明与"由抛错那一处报名字"的做法，**不是**把 403 塞进 `CODE_BY_STATUS`
        （那三格 `forbidden`／`quota_reached`／`text_blocked` 正是要等那一天由抛错处挑一个）。
        """
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        files = ("app/api/routes/v1_auth.py", "app/api/routes/v1_account.py",
                 "app/services/linking.py", "app/core/auth.py", "app/core/apple_identity.py")
        for name in files:
            with open(os.path.join(root, name), encoding="utf-8") as fh:
                text = fh.read()
            assert not re.search(r"\b403\b|HTTP_403", text), f"{name} 里出现了 403：那段实测名单要一起改"

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
