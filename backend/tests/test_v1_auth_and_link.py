"""阶段2-2：`/v1` 那把钥匙、Sign in with Apple 的验签、一次性短码与合并。

站长 10-09 拍的乙在这里有四条必须钉死的东西，一条比一条贵：

① **两种钥匙各开各的门**。`/v1` 发的是 `sub=<accounts.id>` + `kind=account`，`/api/*` 认的是
   `sub=<users.id>`。它们用**同一把**签名密钥，所以"拿错门"必须被明确拒绝——尤其不能让
   UUID 掉进 `int(sub)` 里冒 500：客户端把 500 当"服务器坏了、重试同一把坏钥匙"，
   把 401 当"去重新登录"，这两种后果完全不同。
② **只有 Apple 身份的人没有 `users` 行**。这是乙的全部重量压在库面上的那一句，
   所以必须有尺子：登一次 SIWA，`users` 表要**一行都不许多**。
③ **验签不许打折**。这一组自己生成 RSA 密钥对、签**真的** `identityToken`、造真的 JWKS
   ——不 mock 一个"验签通过"的布尔值。换一枚别家的私钥、把 `aud` 改成别家的 Service ID、
   把 `alg` 换成 `none`、或者拿我们的公钥当 HMAC 的 secret 签 HS256（JWS 最经典那一招），
   都必须是 401。
④ **合并的方向与吊销**。契约 §二"谁已有笔记谁是主，两边都有则合并到较早创建的 account"，
   而合并之后两侧 token 必须**全部**失效。这一组里有一条专门量"笔记一行都没搬"。

短码那一组还钉了一件容易被略过的事：`code_hash` 存 HMAC 而不是裸哈希。6 位数字一共一百万种，
裸 sha256 在任何一次数据库泄漏里都能被暴力跑穿，攻击者就能抢在真用户之前把**别人的**
iPhone 账号绑到自己微信上。
"""
import json
import os
import uuid as uuidlib
from datetime import datetime, timedelta, timezone

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from jwt.algorithms import RSAAlgorithm

# ⚠ 建表只看"这一刻已经被 import 的模型"，所以模型一律在文件头挂上（同 test_account_and_identity）。
from app.models.account import Account, AccountIdentity  # noqa: F401,E402
from app.models.link_code import LinkCode  # noqa: F401,E402
from app.models.note import Note  # noqa: F401,E402
from app.models.user import User  # noqa: F401,E402

CLIENT_ID = "com.tumarknote.pytest.service-id"
APPLE_ISS = "https://appleid.apple.com"
KID = "pytest-apple-kid-1"


def _fresh_session():
    """共享测试库上这五张表**先删后建**，再开一个会话。

    两个理由都是这一轮真踩过的：
    - `create_all` 见表已存在就一个字都不动，于是量到的是**上一轮留在库里的那套约束**。
    - `notes` 必须一起删：`has_notes` 走的是"account → 它的 users 行 → 那些 user 的 notes"，
      而 `users.id` 是整型主键、删了会**复用**。库里残留一条挂在旧 user_id=1 上的笔记，
      新建的那个人就会莫名其妙"已经有笔记"、合并方向随之判反——那种红看着像业务错。
    """
    from app.db.database import Base, SessionLocal, engine
    import app.models  # noqa: F401

    Base.metadata.drop_all(
        bind=engine,
        tables=[LinkCode.__table__, AccountIdentity.__table__, Note.__table__,
                Account.__table__, User.__table__],
    )
    Base.metadata.create_all(bind=engine)
    return SessionLocal()


def _utc_now():
    return datetime.now(timezone.utc)


def _jwks_payload(*keys):
    """造一个"Apple 密钥端点"的响应体，形状和真的一模一样。"""
    return {"keys": list(keys)}


def _public_jwk(private_key, kid=KID):
    public = json.loads(RSAAlgorithm.to_jwk(private_key.public_key()))
    public.update({"kid": kid, "alg": "RS256", "use": "sig"})
    return public


def _serve_jwks(payload):
    async def fake():
        return payload
    return fake


def _serve_jwks_raising(exc):
    async def fake():
        raise exc
    return fake


def _mint(private_key, **over):
    """签一张 identityToken。`over` 能改任何 claim，也能换 `alg`、`kid`、签名用的私钥。"""
    now = _utc_now()
    claims = {
        "iss": APPLE_ISS,
        "aud": CLIENT_ID,
        "sub": "apple-user-0001",
        "iat": now,
        "exp": now + timedelta(seconds=600),
    }
    key = private_key
    alg = "RS256"
    headers = {"kid": KID}
    for name, value in over.items():
        if name == "key":
            key = value
        elif name == "alg":
            alg = value
        elif name == "kid":
            headers = {"kid": value}
        elif name == "exp_delta":
            claims["exp"] = now + value
        elif name == "drop":
            for gone in value:
                claims.pop(gone, None)
        else:
            claims[name] = value
    signing_key = None if alg == "none" else key
    return jwt.encode(claims, signing_key, algorithm=alg, headers=headers)


def _hs256_signed_with_public_key(private_key, sub="pwned"):
    """手工拼一张 `alg=HS256` 的 JWS，HMAC 的 secret 用**公开的**公钥字节。

    为什么不直接用 `jwt.encode(..., algorithm="HS256")`：PyJWT 自己就不肯这么签
    （`InvalidKeyError: The specified key is an asymmetric key ...`），而攻击者不受我们的
    库版本约束——按 JWS 的定义 base64url(header).base64url(payload).HMAC-SHA256 手搓一条就行。
    这一条要挡的是服务端那一行 `algorithms=["RS256"]`，所以造 token 那一侧必须绕开库的善意。
    """
    import base64
    import hashlib
    import hmac as hmac_mod

    def b64(raw: bytes) -> bytes:
        return base64.urlsafe_b64encode(raw).rstrip(b"=")

    header = b64(json.dumps({"alg": "HS256", "typ": "JWT", "kid": KID}).encode())
    payload = b64(json.dumps({
        "iss": APPLE_ISS, "aud": CLIENT_ID, "sub": sub,
        "iat": int(_utc_now().timestamp()),
        "exp": int((_utc_now() + timedelta(seconds=600)).timestamp()),
    }).encode())
    secret = private_key.public_key().public_bytes(Encoding.DER, PublicFormat.PKCS1)
    signature = b64(hmac_mod.new(secret, header + b"." + payload, hashlib.sha256).digest())
    return (header + b"." + payload + b"." + signature).decode()


def _account_with_provider(db, provider, uid, *, created_at=None):
    """造一个"人"。走 `ensure_for_provider`（唯一的建号写口），只在要控制创建时间时补一刀。"""
    from app.services import accounts

    account = accounts.ensure_for_provider(db, provider, uid)
    account_id = account.id
    if created_at is not None:
        account.created_at = created_at
        db.commit()
    return db.query(Account).filter(Account.id == account_id).one()


def _wechat_person(db, openid="o_wc"):
    """微信那一路的完整一个人：`users` 行 + account + 一条 (wechat, openid) 身份。"""
    from app.services import accounts

    user = User(openid=openid, generation=1)
    db.add(user)
    db.commit()
    account = accounts.ensure_for_user(db, user)
    return user, account


def _note(db, user, title="那一篇"):
    note = Note(user_id=str(user.id), title=title, source_type="link")
    db.add(note)
    db.commit()
    return note


def _code(db, account):
    from app.services import link_codes

    return link_codes.create(db, account)


def _account_token(account):
    from app.core.auth import _create_account_token

    return _create_account_token(account)


def _user_token(user):
    from app.core.auth import _create_token

    return _create_token(user.id, user.generation)


def _reissued_user_token(db, user):
    """合并会把发起者那把钥匙的代次一起抬掉（那是契约 §二 第 4 步，另有尺子钉着），
    所以**同一趟会话之后**再打 redeem 必须重新登录拿新钥匙。
    用例里要量的是"码只能用一次"，不是"钥匙还在不在"——不发新钥匙的话第二趟红在 401 上，
    那条判据就成了自证（它测的是鉴权、不是消费）。"""
    db.refresh(user)
    return _user_token(user)


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _reload(db):
    """丢掉测试会话的对象缓存，下一次查询真去库里读。

    这是**这一份文件里最容易写出假绿的一处**。用例手里的 `db` 和请求用的是两个会话：
    请求在服务侧会话里改了行，而测试会话这边只要那个对象还留在 identity map 里
    （`_user_token(user)` 这种取值就在这一刻把它读出来了），`db.query(User).filter(...).one()`
    会把**请求之前**的那一份快照原样还给你——SELECT 根本不发。10-09 实测：`merge_into`
    确实把 `users.account_id` 搬过去了，不加这一句的用例仍然读到旧值、于是报红；
    反过来"断言它没变"的那些用例加了这一句才第一次真的看得见。
    凡是"打完请求之后要读那一行"的判据，都必须先走这一句。
    """
    db.expire_all()
    return db


@pytest.fixture
def db():
    session = _fresh_session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    """限流关掉：这一份文件里 `/v1/auth/apple` 一个人就要打十几趟，而它挂的是 5/分钟。
    口径照抄 `test_account_and_identity.py`——这一档用例测的是**验签与归属**，不是限流本身。"""
    from fastapi.testclient import TestClient

    from app.main import app

    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


@pytest.fixture(scope="module")
def signing_key():
    """真的 2048 位 RSA 私钥。用例拿它签**真的** RS256 token，不伪造验签结果。"""
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def jwks(signing_key, monkeypatch):
    """把 Apple 那个密钥端点换成"只认我这枚公钥"，并把 Service ID 配上。

    换的是 `_http_jwks` 这一层（出网的最外圈）。`verify_identity_token` 里取 kid → 找公钥 →
    验签 → 比 iss/aud/exp 那整段一个字都没被替掉，所以这一档用例量的仍然是真的校验路径。
    """
    from app.core import apple_identity
    from app.core.config import settings

    apple_identity.reset_jwks_cache()
    monkeypatch.setattr(apple_identity, "_http_jwks", _serve_jwks(_jwks_payload(_public_jwk(signing_key))))
    monkeypatch.setattr(settings, "APPLE_CLIENT_ID", CLIENT_ID)
    yield
    apple_identity.reset_jwks_cache()


def _login(client, token):
    return client.post("/v1/auth/apple", json={"identity_token": token})


class Test两种钥匙各开各的门:
    def test_账号钥匙开得动_v1(self, client, db):
        _user, account = _wechat_person(db)
        resp = client.get("/v1/account", headers=_bearer(_account_token(account)))
        assert resp.status_code == 200, resp.text
        assert resp.json()["account_id"] == account.id

    def test_账号钥匙开不了_api_那扇门_且不是_500(self, client, db):
        _user, account = _wechat_person(db)
        resp = client.get("/api/user/quota", headers=_bearer(_account_token(account)))
        # 401 而不是 500：`int("8f3c…")` 冒出来的 ValueError 会被客户端当成"服务器坏了"，
        # 于是它重试同一把永远打不开这扇门的钥匙。
        assert resp.status_code == 401, f"账号钥匙漏进了 /api 那扇门：{resp.status_code} {resp.text}"
        # 话要说中"这把钥匙开错了门"，不能停在"无效的 Token"：`int()` 撞类型那一层也会给 401，
        # 只比状态码的话那道 `kind` 分支就是没有尺子的守卫（10-09 反向验证实测：撤掉它照样绿）。
        assert resp.json()["detail"] == "这把凭证开不了这一路，请重新登录", resp.text

    def test_不是账号也不是用户id的sub_只能撞到_401_而不是_500(self, client, db):
        """`kind` 之外还有一层：`sub` 既不是数字也没标 kind（手工拼一张出来），
        `int(payload["sub"])` 会冒 ValueError → 500。这一条钉的是那层兜底，
        撤掉它必须红。"""
        import jwt as pyjwt

        from app.core.config import settings

        bogus = pyjwt.encode(
            {"sub": "8f3c-not-a-number", "gen": 1, "jti": "x",
             "exp": _utc_now() + timedelta(hours=1)},
            settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        resp = client.get("/api/user/quota", headers=_bearer(bogus))
        assert resp.status_code == 401, f"sub 不是数字时冒出了 {resp.status_code}"
        assert resp.json()["detail"] == "无效的 Token", resp.text

    def test_用户钥匙开不了_v1_那扇门(self, client, db):
        user, _account = _wechat_person(db)
        resp = client.get("/v1/account", headers=_bearer(_user_token(user)))
        assert resp.status_code == 401, f"老钥匙漏进了 /v1：{resp.status_code} {resp.text}"
        # 同上：查不到 account 那一行也会给 401，所以话必须说中"这不是这一路的凭证"，
        # 否则 `kind` 那道判据就是一条测不出来的守卫。
        assert resp.json()["detail"] == "这不是这一路要的凭证，请重新登录", resp.text

    def test_短码那扇门只认小程序那把老钥匙(self, client, db):
        """`/v1/account/link/redeem` 是**故意**用 `get_current_user` 的（契约 §二 第 3 步写的
        就是"小程序调"，而小程序手里只有那一种 token）。反过来钉一条：iPhone 那把新钥匙打不开它。"""
        _user, account = _wechat_person(db)
        resp = client.post("/v1/account/link/redeem", json={"code": "123456"},
                           headers=_bearer(_account_token(account)))
        assert resp.status_code == 401, resp.text

    def test_什么钥匙都没有(self, client, db):
        assert client.get("/v1/account").status_code == 401

    def test_account_那一行没了就认不出人(self, client, db):
        from app.models.account import Account

        _user, account = _wechat_person(db)
        token = _account_token(account)
        account_id = account.id
        db.query(AccountIdentity).filter(AccountIdentity.account_id == account_id).delete()
        db.query(Account).filter(Account.id == account_id).delete()
        db.commit()
        resp = client.get("/v1/account", headers=_bearer(token))
        assert resp.status_code == 401, f"钥匙指向一行不存在的 account 却还开着：{resp.text}"

    def test_代次一抬_账号钥匙当场失效(self, client, db):
        _user, account = _wechat_person(db)
        token = _account_token(account)
        account.generation += 1
        db.commit()
        assert client.get("/v1/account", headers=_bearer(token)).status_code == 401, \
            "accounts.generation 不是这把钥匙的开关"

    def test_响应里不许出现_provider_uid(self, client, db):
        """契约 §二：`openid` 和 Apple 的 user identifier 永远不出现在给客户端的响应里。"""
        _user, account = _wechat_person(db, openid="o_secret")
        resp = client.get("/v1/account", headers=_bearer(_account_token(account)))
        assert resp.status_code == 200, resp.text
        assert "o_secret" not in resp.text, "响应里漏了 openid"
        assert resp.json()["providers"] == ["wechat"]

    def test_解锁凭证那把十五分钟的钥匙开不了任何登录门(self, client, db):
        """`_decode_token` 认不得 scope，那条 15 分钟的私密解锁凭证就同时是一把全账号钥匙。
        这一条量的是**新加的两扇门也没漏**：老 `/api` 那侧的口径由 private_access 自己的用例钉。"""
        from app.core.private_access import create_unlock_token

        user, _account = _wechat_person(db)
        token = create_unlock_token(user)
        assert client.get("/v1/account", headers=_bearer(token)).status_code == 401
        assert client.get("/api/user/quota", headers=_bearer(token)).status_code == 401

    def test_账号钥匙少了_gen_那一格开不了门(self, client, db):
        """`get_current_account` 里 `gen` 是**必填**的，不给默认值。

        这一条要有正反两面，否则它只是在量"缺字段的 token 打不开门"这句空话：
        `accounts.generation` 的默认值恰好也是 1，所以"没带 gen"和"刚签出来、代次还是 1"
        在 `payload.get("gen", 1)` 那种写法下同形。正面那条（带 gen 打得开）就在上面
        `test_账号钥匙开得动_v1`，这一条钉反面。
        """
        import jwt as pyjwt

        from app.core.config import settings

        _user, account = _wechat_person(db)
        no_gen = pyjwt.encode(
            {"sub": account.id, "kind": "account", "jti": "x", "exp": _utc_now() + timedelta(hours=1)},
            settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        assert client.get("/v1/account", headers=_bearer(no_gen)).status_code == 401, \
            "没有 gen 的钥匙在新建的 account 上等于一把满血钥匙"

    def test_解码器认不了缺_exp_或缺_jti_的钥匙(self, client, db):
        """`_decode_token` 里那句 `options={"require": ["sub", "exp", "jti"]}` 以前没人钉。

        少了 `exp` 的 token 会被 PyJWT 当成**永不过期**；少了 `jti` 的那把一旦哪天要做
        吊销名单就根本没有行可查。两条都用 `/api` 那扇门量：同一支解码函数，两扇门共用。
        """
        import jwt as pyjwt

        from app.core.config import settings

        user, _account = _wechat_person(db)
        base = {"sub": str(user.id), "gen": user.generation, "jti": "x",
                "exp": _utc_now() + timedelta(hours=1)}
        assert client.get("/api/user/quota", headers=_bearer(
            pyjwt.encode(base, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM))).status_code == 200, \
            "正面那条就不通：这一组判据量的就不是「缺字段」这一件事"
        for gone in ("exp", "jti"):
            payload = {k: v for k, v in base.items() if k != gone}
            token = pyjwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
            resp = client.get("/api/user/quota", headers=_bearer(token))
            assert resp.status_code == 401, f"少了 {gone} 的钥匙还开着门"


class Test代次一次抬两格:
    def test_同时抬_account_和名下_users(self, db):
        from app.services import accounts

        user, account = _wechat_person(db)
        account.generation, user.generation = 3, 7
        db.commit()
        moved = accounts.bump_generation(db, account)
        db.commit()
        assert moved == 1, "名下那条 users 行没被抬"
        assert (account.generation, user.generation) == (4, 8)

    def test_不碰别人名下的_users_行(self, db):
        from app.services import accounts

        user, account = _wechat_person(db, openid="o_mine")
        other_user, other_account = _wechat_person(db, openid="o_theirs")
        theirs = (other_user.id, other_account.id)
        accounts.bump_generation(db, account)
        db.commit()
        fresh_user, fresh_account = db.query(User).filter(User.id == theirs[0]).one(), \
            db.query(Account).filter(Account.id == theirs[1]).one()
        assert (fresh_user.generation, fresh_account.generation) == (1, 1), "抬代次抬到别人头上去了"

    def test_名下没有_users_行时只抬_account(self, db):
        """只有 Apple 身份的那个人就是这样：有 account、没有 users 行，抬代次不许要求两者都有。"""
        from app.services import accounts

        account = _account_with_provider(db, "apple", "apple-solo")
        assert accounts.bump_generation(db, account) == 0
        db.commit()
        assert account.generation == 2

    def test_bump_不自己提交(self, db):
        """`bump_generation` 必须留在调用方的事务里：吊销要和引发它的那次归属变更同生共死。
        这一条量的就是"它没 commit"——调完直接 rollback，两格都得回到原值。"""
        from app.services import accounts

        user, account = _wechat_person(db)
        accounts.bump_generation(db, account)
        db.rollback()
        assert (account.generation, user.generation) == (1, 1), "bump_generation 自己提交了，事务不再原子"


class Test_SIWA_验签:
    def test_真签名登进来_且不建_users_行(self, client, db, signing_key, jwks):
        """乙的那一句落成一条能跑的判据：SIWA 登录之后 `users` 表**一行都不许多**。"""
        resp = _login(client, _mint(signing_key))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert db.query(User).count() == 0, "给只有 Apple 身份的人建了 users 行（那是甲的写法）"
        assert db.query(Account).count() == 1
        identity = db.query(AccountIdentity).one()
        assert (identity.provider, identity.provider_uid) == ("apple", "apple-user-0001")
        assert identity.verified_at is not None, "Apple 验完签就是「平台确认过」，不许留 null"
        assert body["providers"] == ["apple"]
        assert "apple-user-0001" not in resp.text, "响应里漏了 Apple 的 user identifier"
        # 发出去这把钥匙必须真能开 /v1，否则前面全绿也只是"签了一张没人能用的纸"。
        who = client.get("/v1/account", headers=_bearer(body["token"]))
        assert who.status_code == 200, who.text
        assert who.json()["account_id"] == body["account_id"]

    def test_同一个_sub_第二次登录回到同一条_account(self, client, db, signing_key, jwks):
        first = _login(client, _mint(signing_key)).json()
        second = _login(client, _mint(signing_key, sub="apple-user-0001")).json()
        assert first["account_id"] == second["account_id"], "同一个人被建成两个账号：两份笔记各归各家"
        assert db.query(Account).count() == 1

    def test_两个不同的_sub_是两个人(self, client, db, signing_key, jwks):
        _login(client, _mint(signing_key, sub="apple-a"))
        _login(client, _mint(signing_key, sub="apple-b"))
        assert db.query(Account).count() == 2

    def test_aud_是别家的_401(self, client, db, signing_key, jwks):
        resp = _login(client, _mint(signing_key, aud="com.evil.other-app"))
        assert resp.status_code == 401, "不验 aud 等于允许别的 App 的 Apple 凭证登进我们的账号表"

    def test_iss_不是_appleid_401(self, client, db, signing_key, jwks):
        assert _login(client, _mint(signing_key, iss="https://evil.example")).status_code == 401

    def test_过期_401(self, client, db, signing_key, jwks):
        resp = _login(client, _mint(signing_key, exp_delta=timedelta(seconds=-1)))
        assert resp.status_code == 401, resp.text

    def test_没有_exp_这一格_401(self, client, db, signing_key, jwks):
        """Apple 真发的 token 都带 exp，但"缺了就当永不过期"是不能有的默认值。"""
        resp = _login(client, _mint(signing_key, drop=("exp",)))
        assert resp.status_code == 401, "不带 exp 的 token 被当成不会过期"

    def test_签名来自另一枚私钥_401(self, client, db, signing_key, jwks):
        other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        assert _login(client, _mint(other)).status_code == 401, "别人的私钥签的 token 也认？"

    def test_kid_不认识_401(self, client, db, signing_key, jwks):
        assert _login(client, _mint(signing_key, kid="kid-unknown")).status_code == 401

    def test_alg_是_none_401(self, client, db, signing_key, jwks):
        assert _login(client, _mint(signing_key, alg="none")).status_code == 401, \
            "alg=none 的裸 token 被放行了"

    def test_拿公钥当_hmac_secret_签的_hs256_不行(self, client, db, signing_key, jwks):
        """JWS 那一招经典的算法混淆：拿**公开的**公钥当 HMAC 的 secret 签 HS256，`kid` 照抄
        我们认的那一枚。服务端只要"按 token 头里的 alg 决定怎么验"，攻击者用谁都有的公钥
        就能签出一张通行证。挡住它的是 `algorithms=["RS256"]` 那一行，所以必须有尺子。"""
        resp = _login(client, _hs256_signed_with_public_key(signing_key))
        assert resp.status_code == 401, f"alg 混淆没挡住：{resp.status_code} {resp.text}"
        assert db.query(Account).count() == 0, "混淆那张凭证已经建出账号了"

    def test_service_id_没配是_503_而不是放行(self, client, db, signing_key, monkeypatch):
        from app.core import apple_identity
        from app.core.config import settings

        apple_identity.reset_jwks_cache()
        monkeypatch.setattr(apple_identity, "_http_jwks",
                            _serve_jwks(_jwks_payload(_public_jwk(signing_key))))
        monkeypatch.setattr(settings, "APPLE_CLIENT_ID", "")
        assert _login(client, _mint(signing_key)).status_code == 503, \
            "配置没填就退化成不验 aud？那是直接开门"
        assert db.query(Account).count() == 0

    def test_拉不到_apple_的密钥是_502_不是_401(self, client, db, signing_key, monkeypatch):
        from app.core import apple_identity
        from app.core.config import settings

        apple_identity.reset_jwks_cache()
        monkeypatch.setattr(settings, "APPLE_CLIENT_ID", CLIENT_ID)
        monkeypatch.setattr(apple_identity, "_http_jwks",
                            _serve_jwks_raising(httpx.ConnectError("apple 那边连不上")))
        resp = _login(client, _mint(signing_key))
        # 401 让客户端"去重新登录"，而重登只会拿到同一张验不过的 token；Apple 轮换密钥或
        # 抖动的时候正确的动作是原样重试，所以这一发必须是 502。
        assert resp.status_code == 502, f"把服务侧故障报成了凭证无效：{resp.status_code} {resp.text}"

    def test_apple_换了密钥要先重取一次再判(self, client, db, signing_key, monkeypatch):
        """第一次查不到 kid 时必须**强刷**一次 JWKS：Apple 换密钥是新旧并存地提前挂上去的，
        只拿缓存判"不认识"会在轮换期间把所有人挡在门外。"""
        from app.core import apple_identity
        from app.core.config import settings

        public = _public_jwk(signing_key)
        calls = {"n": 0}

        async def fetch():
            calls["n"] += 1
            # 第一趟只有旧密钥（空），第二趟（强刷）才有我们这枚
            return _jwks_payload() if calls["n"] == 1 else _jwks_payload(public)

        apple_identity.reset_jwks_cache()
        monkeypatch.setattr(settings, "APPLE_CLIENT_ID", CLIENT_ID)
        monkeypatch.setattr(apple_identity, "_http_jwks", fetch)
        resp = _login(client, _mint(signing_key))
        assert resp.status_code == 200, f"撞上密钥轮换没重取：{resp.status_code} {resp.text}"
        assert calls["n"] >= 2, f"没做那次强刷：只出了 {calls['n']} 趟网络"

    def test_失败原因不分开报(self, client, db, signing_key, jwks):
        """`aud` 不对、`iss` 不对、签名不对，三样回**同一句**话。分开报等于给攻击者一台
        判分机："这串 aud 对了、只差签名"——而 `sub` 是一串能从别处买到的 Apple user identifier。"""
        other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        texts = set()
        for over in ({"aud": "com.evil.other"}, {"iss": "https://evil.example"}, {"key": other}):
            resp = _login(client, _mint(signing_key, **over))
            assert resp.status_code == 401, f"{over}：{resp.status_code} {resp.text}"
            texts.add(resp.json()["detail"])
        assert len(texts) == 1, f"报错把失败原因分开了：{texts}"

    def test_identity_token_太短直接_422(self, client, db, jwks):
        assert client.post("/v1/auth/apple", json={"identity_token": "abc"}).status_code == 422

    def test_验签出错不许把期望值回显给用户(self, client, db, signing_key, jwks):
        """PyJWT 的报错文本里带 audience / issuer 的**期望值**，那正是我们自己的 Service ID。
        日志里留类名足够排障，响应体里一个字都不该有。"""
        resp = _login(client, _mint(signing_key, aud="com.evil.other"))
        assert CLIENT_ID not in resp.text, f"响应里回显了 Service ID：{resp.text}"
        assert APPLE_ISS not in resp.text

    def test_密钥端点里的非_rsa_密钥不许把登录打成_500(self, client, db, signing_key, monkeypatch):
        """Apple 的端点今天只回 `kty=RSA`，但"今天只回"不是保证：它哪天挂上一枚 EC 或对称密钥，
        按 `kid` 取到那一枚再去 `RSAAlgorithm.from_jwk` 冒的是 `InvalidKeyError`——
        而**它不是 `InvalidTokenError` 的子类**（10-09 实测 MRO 是
        `InvalidKeyError → PyJWTError → Exception`），只 except 后者的话端到端就是 HTTP 500。
        500 会让客户端重试而不是重新登录，还把一次正常的密钥分布变成全站故障。

        两面都钉：① `kty` 不对的在取密钥那一道就被筛掉（走"不认识这枚 kid"那条路 → 401）；
        ② `kty=RSA` 但内容是残件的过得了筛选、必须在验签那一道被 except 接住 → 401。
        """
        from app.core import apple_identity
        from app.core.config import settings

        for label, junk in (
            ("kty=EC", {"kty": "EC", "kid": KID, "crv": "P-256", "x": "AAAA", "y": "BBBB"}),
            ("kty=oct", {"kty": "oct", "kid": KID, "k": "AAAA"}),
            ("RSA 缺 n", {"kty": "RSA", "kid": KID, "alg": "RS256"}),
            ("RSA 的 n 不是 base64url", {"kty": "RSA", "kid": KID, "n": "!!!!", "e": "AQAB"}),
        ):
            apple_identity.reset_jwks_cache()
            monkeypatch.setattr(settings, "APPLE_CLIENT_ID", CLIENT_ID)
            monkeypatch.setattr(apple_identity, "_http_jwks",
                                _serve_jwks(_jwks_payload(junk)))
            resp = _login(client, _mint(signing_key))
            assert resp.status_code == 401, f"{label}：这一枚 JWK 我验不了，本该 401，实际 {resp.status_code} {resp.text}"
            assert db.query(Account).count() == 0, f"{label}：验都没验成的凭证建出账号了"
        apple_identity.reset_jwks_cache()


class Test短码生成与消费:
    def test_码只出现在响应里_库里那一格是_hmac(self, client, db):
        from app.services import link_codes

        account = _account_with_provider(db, "apple", "apple-code")
        resp = client.post("/v1/account/link/code", headers=_bearer(_account_token(account)))
        assert resp.status_code == 200, resp.text
        code = resp.json()["code"]
        assert len(code) == 6 and code.isdigit(), f"不是 6 位数字：{code!r}"
        assert resp.json()["expires_in_seconds"] == link_codes.TTL_MINUTES * 60

        row = db.query(LinkCode).one()
        assert row.code_hash != code, "码原文进了库"
        assert row.code_hash == link_codes._hash(code), "库里那一格不是 HMAC-SHA256(码)"
        import hashlib

        # 裸 sha256 能在数据库泄漏之后被一百万次枚举跑穿；keyed 的这一格必须带上密钥。
        assert row.code_hash != hashlib.sha256(code.encode()).hexdigest()
        for column in LinkCode.__table__.columns:
            value = getattr(row, column.name)
            if isinstance(value, str):
                assert code not in value, f"{column.name} 里藏着码原文"
        assert row.used_at is None
        assert row.account_id == account.id

    def test_同一账号连发两枚是两枚不同的码(self, db):
        first = _code(db, _account_with_provider(db, "apple", "apple-two"))
        account = db.query(Account).one()
        second = _code(db, account)
        assert first != second, f"两次生成给了同一枚码：{first}"
        assert db.query(LinkCode).count() == 2

    def test_六位以外的格式进不去(self, client, db):
        user, _account = _wechat_person(db)
        headers = _bearer(_user_token(user))
        for bad in ("12345", "1234567", "abc123", "12 345"):
            resp = client.post("/v1/account/link/redeem", json={"code": bad}, headers=headers)
            assert resp.status_code == 422, f"{bad!r} 竟然进了服务层：{resp.status_code} {resp.text}"
        assert db.query(LinkCode).count() == 0

    def test_一张码只能消费一次(self, client, db):
        # iPhone 那条**早**创建，所以它是主、它名下那枚码不会被合并的连带清理带走。
        # 反过来的话（10-09 就是这么写的）第二趟红在"码没了"上而不是红在 `used_at` 上，
        # 把 `find_usable` 里"用过就不给用"那一道整个撤掉都测不出来——★假绿★。
        account = _account_with_provider(db, "apple", "apple-once",
                                         created_at=_utc_now() - timedelta(days=1))
        user, _wc = _wechat_person(db)
        code = _code(db, account)
        assert client.post("/v1/account/link/redeem", json={"code": code},
                           headers=_bearer(_user_token(user))).status_code == 200
        assert db.query(LinkCode).filter(LinkCode.code_hash.isnot(None)).count() == 1, \
            "这一条用例量的前提没了：那枚码在合并里被连带删掉了，判不到 used_at 那道闸"
        second = client.post("/v1/account/link/redeem", json={"code": code},
                             headers=_bearer(_reissued_user_token(db, user)))
        assert second.status_code == 400, f"同一张码被消费了两次：{second.status_code} {second.text}"

    def test_过期的码_400_且不动账(self, client, db):
        account = _account_with_provider(db, "apple", "apple-exp")
        account_id = account.id
        user, wc = _wechat_person(db)
        wc_id = wc.id
        code = _code(db, account)
        row = db.query(LinkCode).one()
        row.expires_at = _utc_now() - timedelta(minutes=1)
        db.commit()
        resp = client.post("/v1/account/link/redeem", json={"code": code},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 400, resp.text
        assert db.query(Account).filter(Account.id == account_id).count() == 1, "过期码照样动了账"
        assert db.query(AccountIdentity).filter(
            AccountIdentity.account_id == account_id,
            AccountIdentity.provider == "apple").count() == 1

    def test_猜错的码和用过的码回同一句话(self, client, db):
        """判分机：6 位数字一共一百万种。"码不对"和"码用过"分开报，攻击者就有一台
        只会答"对/错"的机器可以慢慢筛。

        iPhone 那条早创建 → 它是主 → 被消费掉的那枚码留在库里（`used_at` 有值），
        第二趟才真的在考"用过"这一支；换成晚创建的话码会被合并连带删掉，两趟走的是同一支
        `找不到`，这条判据就退化成同义反复。
        """
        account = _account_with_provider(db, "apple", "apple-oracle",
                                         created_at=_utc_now() - timedelta(days=1))
        user, _wc = _wechat_person(db)
        code = _code(db, account)
        client.post("/v1/account/link/redeem", json={"code": code},
                    headers=_bearer(_user_token(user)))
        # 第一趟已经把这把钥匙的代次抬掉了，后面两趟各拿一把新钥匙——这一条要比的是
        # "用过的码"和"乱猜的码"回什么话，不是鉴权回什么话。
        fresh = _bearer(_reissued_user_token(db, user))
        used = client.post("/v1/account/link/redeem", json={"code": code}, headers=fresh)
        wrong = client.post("/v1/account/link/redeem", json={"code": "000000"}, headers=fresh)
        assert used.status_code == wrong.status_code == 400, \
            f"用过的码 {used.status_code} / 乱猜的码 {wrong.status_code}"
        assert used.json()["detail"] == wrong.json()["detail"], \
            f"报错能分辨用过的码和乱猜的码：{used.json()} vs {wrong.json()}"

    def test_目标账号已删是_404(self, client, db):
        account = _account_with_provider(db, "apple", "apple-dead")
        account_id = account.id
        user, _wc = _wechat_person(db)
        code = _code(db, account)
        db.query(AccountIdentity).filter(AccountIdentity.account_id == account_id).delete()
        db.query(Account).filter(Account.id == account_id).delete()
        db.commit()
        resp = client.post("/v1/account/link/redeem", json={"code": code},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 404, f"码指向一条已经不存在的 account：{resp.status_code} {resp.text}"

    def test_并发的两趟_redeem_只有一趟拿得走(self, tmp_path):
        """`mark_used` 必须是条件 UPDATE。分成"先查没用过、再标用过"两趟的话，两个人同时
        念同一枚码会**都**通过检查，然后各自的微信被绑到同一个 iPhone 账号上。

        这里不靠线程抢时序（抢不到就是假绿）：两个独立会话**都先** `find_usable` 读到
        "这枚码还没人用过"——那正是并发里真实存在的先后——然后各自 `mark_used`。
        输的那一趟必须拿到 False，并且带着手里那张已经作废的行往下走时必须被拒。
        """
        from sqlalchemy import create_engine
        from sqlalchemy.orm import Session

        from app.db.database import Base
        import app.models  # noqa: F401
        from app.services import link_codes, linking

        engine = create_engine(f"sqlite:///{tmp_path / 'redeem.db'}")
        Base.metadata.create_all(engine)
        with Session(engine) as seed:
            iphone = _account_with_provider(seed, "apple", "apple-race")
            user, wc = _wechat_person(seed, openid="o_race_wc")
            code = _code(seed, iphone)
            user_id, iphone_id, wc_id = user.id, iphone.id, wc.id

        s1 = Session(engine)
        s2 = Session(engine)
        try:
            row1 = link_codes.find_usable(s1, code)
            row2 = link_codes.find_usable(s2, code)
            assert row1 is not None and row2 is not None, "两个会话都没把这枚码读成可用"
            assert link_codes.mark_used(s1, row1) is True, "赢家没占住这枚码"
            assert link_codes.mark_used(s2, row2) is False, \
                "条件 UPDATE 没挡住：输家也占住了同一枚码"

            # 输家手里那张行对象仍是"没用过"的样子（它自己那一份快照），所以判据不能停在读，
            # 必须走到 redeem 里再问一次——那一次要把它挡在门外。
            loser = s2.get(User, user_id)
            with pytest.raises(linking.LinkRefused) as caught:
                linking.redeem(s2, loser, code)
            assert caught.value.status_code == 400
            assert s1.query(Account).filter(Account.id == iphone_id).count() == 1, \
                "被拒的那一趟把 iPhone 那条 account 也带走了"
            assert s1.query(AccountIdentity).filter(
                AccountIdentity.provider == "wechat",
                AccountIdentity.provider_uid == "o_race_wc").one().account_id == wc_id, \
                "输的那一趟没拿走码，却把微信身份挪了归属：账被动了"
        finally:
            s1.close()
            s2.close()
            engine.dispose()


class Test合并方向与吊销:
    def test_有笔记的那边是主(self, client, db):
        # 微信那条**晚**创建：这一条判据必须只可能由"有没有笔记"决定。
        # 10-09 反向验证里 `choose_main` 那两句"有笔记就是主"整句撤掉都测不出来，因为
        # 时间比下来的答案和期望值正好撞对（第一轮还把 iPhone 那条钉成了早创建，方向反了）。
        iphone = _account_with_provider(db, "apple", "apple-a-notes")
        iphone_id = iphone.id          # 合并会把这一行删掉，之后 `iphone.id` 读出来是 ObjectDeletedError
        user, wc = _wechat_person(db)
        wc.created_at = _utc_now() + timedelta(days=1)
        wc_id = wc.id
        db.commit()
        _note(db, user)
        resp = client.post("/v1/account/link/redeem", json={"code": _code(db, iphone)},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["account_id"] == wc_id, "微信那边有笔记却不是主：几百篇笔记的主人换了地方"
        assert body["merged"] is True
        assert db.query(Account).filter(Account.id == iphone_id).first() is None, "被并掉的那行还留着"
        identity = _reload(db).query(AccountIdentity).filter(AccountIdentity.provider == "apple").one()
        assert identity.account_id == wc_id

    def test_只有_iphone_那边有笔记_那边是主(self, client, db):
        """`choose_main` 那两句"有一边有笔记"是**两个分支**，只钉一面等于没钉另一面。
        10-09 反向验证里那条 `只有_iphone_那边有笔记_那边是主` 的针就是指这一条：文件重写时
        把它整条丢了，needle 匹配不到任何用例、pytest 退出码 5、脚本把它读成"红（符合预期）"，
        于是一次★假绿★被记成了一次成功。名字保留原样，别让下一轮又对不上。

        这一条必须把**创建时间钉成微信那边更早**：否则"取较早创建的那个"那条规则会给同一个答案，
        撤掉 `b_notes and not a_notes` 那一支也照样绿（上一轮的实测就是这样）。
        """
        iphone = _account_with_provider(db, "apple", "apple-only-notes",
                                        created_at=_utc_now() + timedelta(days=2))
        iphone_id = iphone.id
        user, wc = _wechat_person(db)
        wc.created_at = _utc_now() - timedelta(days=10)   # 微信那条**早**：时间比下来该它当主
        wc_id = wc.id
        db.commit()
        iphone_user = User(openid=None, generation=1, account_id=iphone_id)
        db.add(iphone_user)
        db.commit()
        _note(db, iphone_user, title="iPhone 那边的一篇")

        resp = client.post("/v1/account/link/redeem", json={"code": _code(db, iphone)},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["account_id"] == iphone_id, \
            "只有 iPhone 那边有笔记却让微信那条当主：笔记的主人换了地方"
        assert body["merged"] is True
        assert db.query(Account).filter(Account.id == wc_id).first() is None, "该被并掉的那行还留着"
        identity = _reload(db).query(AccountIdentity).filter(AccountIdentity.provider == "wechat").one()
        assert identity.account_id == iphone_id, "微信身份没跟着搬到主账号上"

    def test_主账号换成_iphone_时那条微信登录行跟着搬家(self, client, db):
        """`merge_into` 里那句 `user.account_id = keep.id` 是**方向无关**的：主账号是 iPhone
        那条时，挂在微信那条名下的 `users` 行要一起搬过去。少了这一句，那个人按
        `users.account_id` 指的是一条**已经被删掉**的 account——下次登录 `ensure_for_user`
        当场 RuntimeError，他连自己的笔记都读不到。

        上面 `test_笔记一行都没搬` 钉的是"notes 不许动"，这一条钉的是"users 行必须动"，
        两件事一个是数据、一个是归属，不能合成一条。
        """
        iphone = _account_with_provider(db, "apple", "apple-keep-face",
                                        created_at=_utc_now() + timedelta(days=2))
        iphone_id = iphone.id
        user, wc = _wechat_person(db)
        user_id = user.id
        wc.created_at = _utc_now() - timedelta(days=10)
        db.commit()
        iphone_user = User(openid=None, generation=1, account_id=iphone_id)
        db.add(iphone_user)
        db.commit()
        note = _note(db, iphone_user, title="iPhone 的那一篇")
        note_id, note_owner = note.id, note.user_id

        resp = client.post("/v1/account/link/redeem", json={"code": _code(db, iphone)},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 200, resp.text
        assert resp.json()["account_id"] == iphone_id, "前提没了：这一趟的主账号不是 iPhone 那条"
        moved = _reload(db).query(User).filter(User.id == user_id).one()
        assert moved.account_id == iphone_id, "那条微信登录行留在原地，而原地的 account 已经被删了"
        row = db.query(Note).filter(Note.id == note_id).one()
        assert row.user_id == note_owner, "搬 users 行的时候顺手把笔记也搬了"

    def test_创建时间缺失要响不许当成_1970(self, client, db):
        """`_created_at` 里那道 NULL 守卫。`created_at` 有 server_default，正常不会是 NULL，
        所以这一条量的是"账坏了"那一路：把它当成 1970 年会让时间戳坏掉的那个人**永远当主账号**，
        而且一句错都不报。"""
        user, wc = _wechat_person(db)
        iphone = _account_with_provider(db, "apple", "apple-no-ts")
        wc.created_at = None
        db.commit()
        resp = client.post("/v1/account/link/redeem", json={"code": _code(db, iphone)},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 500, f"创建时间缺失被当成 1970 年 silently 比了：{resp.status_code} {resp.text}"
        assert db.query(Account).count() == 2, "报错了却已经把账合了"
        assert db.query(User).filter(User.id == user.id).one().account_id == wc.id, "名下的归属被动了"

    def test_两边都有笔记_取较早创建的那个(self, client, db):
        iphone = _account_with_provider(db, "apple", "apple-older",
                                        created_at=_utc_now() - timedelta(days=30))
        iphone_id = iphone.id
        user, wc = _wechat_person(db)
        wc.created_at = _utc_now() - timedelta(days=3)
        db.commit()
        _note(db, user, title="微信这边的一篇")
        # 给 iPhone 那条 account 也挂一条"有笔记"的路径（阶段3 sync 落地之后的形状；
        # 今天没有任何一条真门会走到这里，所以这条用例保的是规则不烂，不是现网路径）。
        iphone_user = User(openid=None, generation=1, account_id=iphone_id)
        db.add(iphone_user)
        db.commit()
        _note(db, iphone_user, title="iPhone 那边的一篇")

        resp = client.post("/v1/account/link/redeem", json={"code": _code(db, iphone)},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 200, resp.text
        assert resp.json()["account_id"] == iphone_id, "两边都有笔记时没取较早创建的那个"

    def test_两边都没笔记_也取较早创建的那个(self, client, db):
        """契约只写了"两边都有笔记"这一种才比创建时间，但两边都没笔记是**必然会出现**的分支
        （两个都是新号）。"随便哪一个"不是答案：结果必须只由库里已有的值决定，否则同一对
        账号在两次请求里可能拿到相反的答案。"""
        older = _account_with_provider(db, "apple", "apple-older-empty",
                                       created_at=_utc_now() - timedelta(days=9))
        older_id = older.id
        user, wc = _wechat_person(db)
        wc.created_at = _utc_now()
        db.commit()
        resp = client.post("/v1/account/link/redeem", json={"code": _code(db, older)},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 200, resp.text
        assert resp.json()["account_id"] == older_id
        assert resp.json()["merged"] is True

    def test_较晚创建_那就取微信那边(self, client, db):
        """正反的另一面：同样的"两边都没笔记"，把创建时间反过来，主账号就该换人。
        只钉一面（只测较早的那条赢）等于没钉——把比较写成 `>=` 也照样绿。"""
        younger = _account_with_provider(db, "apple", "apple-younger",
                                         created_at=_utc_now() + timedelta(days=1))
        user, wc = _wechat_person(db)
        wc.created_at = _utc_now()
        wc_id = wc.id
        db.commit()
        resp = client.post("/v1/account/link/redeem", json={"code": _code(db, younger)},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 200, resp.text
        assert resp.json()["account_id"] == wc_id

    def test_创建时间一模一样_发起那一趟的一方是主(self, client, db):
        """平局必须有明文答案，不能靠 `<=` 碰运气。

        `accounts.created_at` 在 SQLite 上是**秒级**（`CURRENT_TIMESTAMP`），同一秒里建出来的
        两条 account 时间完全相等——这不是罕见情况，而是"刚在 iPhone 注册就跑去小程序关联"
        的常见形状。这一条把规则钉死：撞平取 `choose_main` 的第一个入参，而 `redeem` 固定传
        `(mine, target)`，`mine` 是发起这一趟的微信那条。10-09 那批反向验证里，"有笔记的那边是主"
        和"一张码只能消费一次"两条判据都是被这个平局掩护住才★假绿★的。"""
        iphone = _account_with_provider(db, "apple", "apple-tie")
        user, wc = _wechat_person(db)
        same = iphone.created_at
        wc.created_at = same
        iphone.created_at = same
        db.commit()
        assert wc.created_at == iphone.created_at, "两条 account 的时间没钉成一样，这条就不是在考平局"
        wc_id = wc.id
        resp = client.post("/v1/account/link/redeem", json={"code": _code(db, iphone)},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 200, resp.text
        assert resp.json()["account_id"] == wc_id, "平局时主账号换人了：`choose_main` 的入参顺序变了"

    def test_合并之后两侧钥匙全部失效(self, client, db):
        """契约 §二 第 4 步，也是乙最贵的一条：只抬一格的话，另一格还活着的那把钥匙
        会在新归属下继续读得到合并前的数据。"""
        iphone = _account_with_provider(db, "apple", "apple-revoke")
        user, wc = _wechat_person(db)
        iphone_token = _account_token(iphone)
        user_token = _user_token(user)
        resp = client.post("/v1/account/link/redeem", json={"code": _code(db, iphone)},
                           headers=_bearer(user_token))
        assert resp.status_code == 200, resp.text
        assert client.get("/v1/account", headers=_bearer(iphone_token)).status_code == 401, \
            "iPhone 那把钥匙还活着"
        assert client.get("/api/user/quota", headers=_bearer(user_token)).status_code == 401, \
            "小程序那把老钥匙还活着"

    def test_笔记一行都没搬(self, client, db):
        """合并动的只有"哪条 account 活着"和"哪个 users 行归谁"。`notes.user_id` 一个字符都
        不该变——这一条量的正是"顺手写一句 UPDATE notes SET ..."那种热心。"""
        iphone = _account_with_provider(db, "apple", "apple-move")
        user, wc = _wechat_person(db)
        wc_id, user_id = wc.id, user.id
        note = _note(db, user, title="不要动我")
        before = (note.id, note.user_id, note.title)
        resp = client.post("/v1/account/link/redeem", json={"code": _code(db, iphone)},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 200, resp.text
        row = _reload(db).query(Note).one()
        assert (row.id, row.user_id, row.title) == before, "笔记被搬家了"
        person = db.query(User).filter(User.id == user_id).one()
        assert person.account_id == wc_id, "主账号就是微信那条，users 行却改了归属"

    def test_合并之后名下短码不留(self, client, db):
        """被并掉那条 account 名下还没用过的码必须一起删：留着的话它还能被 redeem 一次，
        而 `find_usable` 会查出 `account_id` 指向一行已经不存在的 account——那时能给的只有 500。"""
        # 谁被并掉由创建时间决定（两边都没笔记时取较早的那个），所以这里把时间钉死：
        # 微信这条早、iPhone 那条晚 → iPhone 那条 `doomed` 是被带走的 `absorb`。
        # 拿去 redeem 的码也必须挂在 `doomed` 上，否则 `mine == target`，根本走不到合并那一步。
        user, wc = _wechat_person(db)
        wc.created_at = _utc_now() - timedelta(days=5)
        wc_id = wc.id
        db.commit()
        doomed = _account_with_provider(db, "apple", "apple-doomed", created_at=_utc_now())
        doomed_id = doomed.id
        used_code = _code(db, doomed)
        _code(db, doomed)                      # 这枚没人念过，正是要查它有没有被一起带走
        resp = client.post("/v1/account/link/redeem", json={"code": used_code},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 200, resp.text
        assert resp.json()["account_id"] == wc_id, "合并方向不对，后面那句判据量的就不是同一件事"
        assert db.query(Account).filter(Account.id == doomed_id).first() is None, \
            "这一条用例量的前提没了：那条 account 根本没被并掉"
        assert db.query(LinkCode).filter(LinkCode.account_id == doomed_id).count() == 0, \
            "死账号名下还留着能用一次的码"

    def test_已经绑过另一个微信的_iphone_409(self, client, db):
        iphone = _account_with_provider(db, "apple", "apple-taken")
        _other_user, other_wc = _wechat_person(db, openid="o_other_wc")
        # 把另一条微信身份挪到 iPhone 那条 account 上：模拟"这台 iPhone 已经绑过别人"
        moved = db.query(AccountIdentity).filter(
            AccountIdentity.provider == "wechat",
            AccountIdentity.provider_uid == "o_other_wc").one()
        moved.account_id = iphone.id
        db.commit()
        user, _wc = _wechat_person(db, openid="o_third_wc")
        resp = client.post("/v1/account/link/redeem", json={"code": _code(db, iphone)},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 409, f"两个微信号被并成了一个人：{resp.status_code} {resp.text}"
        assert db.query(Account).count() == 3, "被拒的那一趟动了账"

    def test_本来就是一条时幂等且不抬代次(self, client, db):
        user, wc = _wechat_person(db)
        wc_id, before = wc.id, (wc.generation, user.generation)
        resp = client.post("/v1/account/link/redeem", json={"code": _code(db, wc)},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 200, resp.text
        assert resp.json()["merged"] is False, "本来就是一条，却报「发生了合并」"
        assert resp.json()["account_id"] == wc_id
        # 这一句量的是"库里那一格没被抬"，所以必须 `_reload`：不重读的话手里这两个对象
        # 就是请求**之前**的快照，实现真的多抬了一格也照样绿。
        _reload(db)
        assert (wc.generation, user.generation) == before, "再点一次关联把用户自己踢下线了"
        # 码照样作废：一次性这件事和"是不是同一条 account"无关
        assert db.query(LinkCode).filter(LinkCode.used_at.isnot(None)).count() == 1

    def test_账坏了要响不许猜(self, client, db):
        """`users.account_id` 有值却查不到那一行是**账坏了**，必须响。悄悄新建一条会把这个人
        挂到第二个身份上、两份笔记各归各家——`ensure_for_user` 里那道 RuntimeError 的正面。
        TestClient 默认把服务端异常原样重抛，所以这里等的是异常而不是 500 响应。"""
        from app.models.account import Account
        from app.services import accounts

        user, wc = _wechat_person(db)
        iphone = _account_with_provider(db, "apple", "apple-dangling")
        code = _code(db, iphone)
        db.query(Account).filter(Account.id == wc.id).delete()
        db.commit()
        with pytest.raises(RuntimeError):
            client.post("/v1/account/link/redeem", json={"code": code},
                        headers=_bearer(_user_token(user)))
        assert db.query(Account).filter(Account.id == iphone.id).first() is not None, \
            "响之前已经把 iPhone 那条 account 带走了"


class Test解绑:
    def test_解绑摘掉那一条并抬代次(self, client, db, signing_key, jwks):
        body = _login(client, _mint(signing_key, sub="apple-unbind")).json()
        account = db.query(Account).filter(Account.id == body["account_id"]).one()
        # 补一条微信身份，才有"摘一条还剩一条"这回事
        db.add(AccountIdentity(account_id=account.id, provider="wechat",
                               provider_uid="o_unbind", verified_at=_utc_now()))
        db.commit()
        resp = client.delete("/v1/account/link/wechat", headers=_bearer(body["token"]))
        assert resp.status_code == 200, resp.text
        assert resp.json()["providers"] == ["apple"]
        assert db.query(AccountIdentity).filter(
            AccountIdentity.provider == "wechat",
            AccountIdentity.provider_uid == "o_unbind").count() == 0
        # 代次被抬了：手里这把钥匙是从刚摘掉那条 identity 换来的，不能再继续开这扇门
        assert client.get("/v1/account", headers=_bearer(body["token"])).status_code == 401, \
            "解绑之后旧 token 照样能用"

    def test_最后一条不许摘(self, client, db):
        account = _account_with_provider(db, "apple", "apple-last")
        resp = client.delete("/v1/account/link/apple", headers=_bearer(_account_token(account)))
        assert resp.status_code == 409, resp.text
        assert db.query(AccountIdentity).count() == 1, "把最后一条登录方式摘掉了：这个人再也登不进来"

    def test_没绑过的那种登录方式_404(self, client, db):
        account = _account_with_provider(db, "apple", "apple-none")
        resp = client.delete("/v1/account/link/email", headers=_bearer(_account_token(account)))
        assert resp.status_code == 404, resp.text
        assert db.query(AccountIdentity).count() == 1

    def test_解绑微信那一条会把登录行一起摘掉(self, client, db):
        """P0-1 的正面：解绑动的是**两样**东西，`account_identities` 那一行和挂在下面的
        `users.account_id`。只删身份行的话这个人按登录行还归这条 account、按身份行已经不归了，
        "这个人算哪条 account"从此有两个答案（见 `detach_users_of` 的 docstring）。"""
        user, account = _wechat_person(db, openid="o_unbind_face")
        account_id, user_id = account.id, user.id
        db.add(AccountIdentity(account_id=account_id, provider="apple",
                               provider_uid="apple-keep-me", verified_at=_utc_now()))
        db.commit()
        resp = client.delete("/v1/account/link/wechat", headers=_bearer(_account_token(account)))
        assert resp.status_code == 200, resp.text
        assert resp.json()["providers"] == ["apple"]
        left = _reload(db).query(User).filter(User.id == user_id).one()
        assert left.account_id is None, "身份行摘了、登录行还挂着：这个人有两个归属答案"
        assert left.generation == 2, \
            "代次没抬：`unbind` 里那句 `bump_generation` 必须在 detach **之前**跑，先摘人再抬就抬不到他"

    def test_解绑之后那个人下次登录另起一条(self, db):
        """解绑断掉的是**数据关系**，不只是删一行表。修之前只删身份行、把 `users` 行留在原
        account 上，那么 `ensure_for_user` 会照旧返回那条 iPhone account——他"解绑"了却还
        跟那个 iPhone 是同一个人。摘干净之后，他下次登录应当拿到一条**新的**、只有微信的 account。"""
        from app.services import accounts, linking

        user, account = _wechat_person(db, openid="o_unbind_relogin")
        old_id = account.id
        db.add(AccountIdentity(account_id=old_id, provider="apple",
                               provider_uid="apple-keep-2", verified_at=_utc_now()))
        db.commit()
        linking.unbind(db, account, "wechat")
        fresh = accounts.ensure_for_user(db, db.query(User).filter(User.id == user.id).one())
        assert fresh.id != old_id, "解绑之后再登录又回到那条 iPhone account 上：根本没断开"
        assert linking.identity_providers(db, old_id) == ["apple"], "那条 account 上多了一条新微信身份"

    def test_解绑苹果那一条不动登录行(self, client, db):
        """`detach_users_of` 只在摘微信那一条形态下有意义（`users` 行是微信登录行）。
        摘 Apple 那一条时把人家的 `account_id` 清空会是彻底的错：他还在用小程序，
        账号归属却当场没了。这一条钉的是"只摘该摘的那一半"。"""
        user, account = _wechat_person(db, openid="o_keep_face")
        account_id, user_id = account.id, user.id
        db.add(AccountIdentity(account_id=account_id, provider="apple",
                               provider_uid="apple-drop-me", verified_at=_utc_now()))
        db.commit()
        resp = client.delete("/v1/account/link/apple", headers=_bearer(_account_token(account)))
        assert resp.status_code == 200, resp.text
        assert resp.json()["providers"] == ["wechat"]
        left = _reload(db).query(User).filter(User.id == user_id).one()
        assert left.account_id == account_id, "摘 Apple 那一条把微信登录行的归属也清了"
        assert left.generation == 2, "摘 Apple 那一条没吊销他的微信钥匙：契约 §二 要的是归属一变两侧都失效"


    def test_身份行没了而登录行还挂着_闸门也要挡住(self, client, db):
        """P0-1 的反面，也是 redeem 那道一对一闸门的**第二个判据**：
        `"wechat" in identity_providers(...)` 只看身份行，被解绑掏空之后它就瞎了；
        还挂着 `users` 行这件事只有 `users_of(...)` 看得见。少了后面那半句，第二个人
        拿一枚新码就能把两个真人的笔记并成一份——10-09 独立审抓的就是这一处。

        这里手工摆出"身份行已删、登录行还在"那个半成品状态（修之前的解绑就会留下它），
        量的是闸门本身，不是解绑的实现。
        """
        iphone = _account_with_provider(db, "apple", "apple-half-unbound")
        first_user, _wc = _wechat_person(db, openid="o_first_wc")
        moved = db.query(AccountIdentity).filter(
            AccountIdentity.provider == "wechat",
            AccountIdentity.provider_uid == "o_first_wc").one()
        moved.account_id = iphone.id          # 第一个人挂在这条 iPhone account 上
        db.query(User).filter(User.id == first_user.id).update({"account_id": iphone.id})
        db.delete(moved)                      # 但身份行没了：修之前的解绑就是这个形状
        db.commit()
        assert db.query(User).filter(User.id == first_user.id).one().account_id == iphone.id, \
            "没摆出被审的那个状态，这条就不是在考闸门的第二半句"
        second_user, _wc2 = _wechat_person(db, openid="o_second_wc")
        resp = client.post("/v1/account/link/redeem", json={"code": _code(db, iphone)},
                           headers=_bearer(_user_token(second_user)))
        assert resp.status_code == 409, \
            f"闸门只看身份行，放第二个真人并了进来：{resp.status_code} {resp.text}"
        assert _reload(db).query(User).filter(User.id == first_user.id).one().account_id == iphone.id, \
            "被拒的那一趟还是动了第一个人的归属"


class Test_v1_微信登录转调:
    def test_同一个人两条门拿到同一条_account(self, client, db, monkeypatch):
        """`/v1/auth/wechat` 必须**转调** `/api/auth/wechat` 那同一支 `login_or_register`：
        同一个人从任何一条门进来背后都只有一条 account。两条门各建一条是这一批最贵的错。"""
        from app.core import auth as auth_core

        async def fake_code2session(code):
            return {"openid": "o_via_door", "session_key": "sk", "unionid": None}

        monkeypatch.setattr(auth_core, "_wechat_code2session", fake_code2session)
        v1 = client.post("/v1/auth/wechat", json={"code": "same-code"})
        assert v1.status_code == 200, v1.text
        api = client.post("/api/auth/wechat", json={"code": "same-code"})
        assert api.status_code == 200, api.text
        assert db.query(User).count() == 1, "两条门各建了一行 users"
        assert db.query(Account).count() == 1, "两条门各建了一条 account"
        assert v1.json()["account_id"] == db.query(Account).one().id

    def test_v1_那条发的不是老钥匙(self, client, db, monkeypatch):
        from app.core import auth as auth_core

        async def fake(code):
            return {"openid": "o_shape", "session_key": "sk", "unionid": None}

        monkeypatch.setattr(auth_core, "_wechat_code2session", fake)
        resp = client.post("/v1/auth/wechat", json={"code": "shape"})
        assert resp.status_code == 200, resp.text
        token = resp.json()["token"]
        assert jwt.decode(token, options={"verify_signature": False, "require": []})["kind"] == "account"
        assert client.get("/v1/account", headers=_bearer(token)).status_code == 200
        assert client.get("/api/user/quota", headers=_bearer(token)).status_code == 401
        assert db.query(User).count() == 1, "/v1 那条自己又建了一行 users"

    def test_分家状态下两条门给的是同一条_account(self, client, db, monkeypatch):
        """P0-2：`/v1/auth/wechat` 原来按 `(wechat, openid)` 那条**身份行**认人
        （`ensure_for_provider`），而它转调的 `login_or_register` 内部按 `users.account_id`
        认人（`ensure_for_user`）。两把钥匙推同一个问题，正常时候答案一样；一旦库里出现
        "登录行挂着、身份行没了"那种分家状态，这一趟就会给客户端回一条**全新的空 account**，
        而那个人几百篇笔记挂在另一条上。现在两条推导共用 `users.account_id` 这一个答案。"""
        from app.core import auth as auth_core

        house = _account_with_provider(db, "apple", "apple-house")
        house_id = house.id
        db.add(User(openid="o_split", generation=1, account_id=house_id))
        db.commit()
        assert db.query(AccountIdentity).filter(
            AccountIdentity.provider == "wechat").count() == 0, \
            "没摆出分家状态：这条已经在考「两把钥匙」了"

        async def fake_code2session(code):
            return {"openid": "o_split", "session_key": "sk", "unionid": None}

        monkeypatch.setattr(auth_core, "_wechat_code2session", fake_code2session)
        v1 = client.post("/v1/auth/wechat", json={"code": "split"})
        assert v1.status_code == 200, v1.text
        assert v1.json()["account_id"] == house_id, \
            "/v1 那条另起了一条 account，这个人从此两份笔记各归各家"
        assert db.query(Account).count() == 1, f"多建了 account：{db.query(Account).count()} 条"
        api = client.post("/api/auth/wechat", json={"code": "split"})
        assert api.status_code == 200, api.text
        assert db.query(Account).count() == 1, "老门又来了一遍，账上多出第二条 account：两条推导还是两个答案"


class Test限流挂在该挂的那五道门上:
    """限流这一档只能读 slowapi 的私有注册表：真跑出一发 429 得有 Redis 在，
    而用例那侧 `app.state.limiter.enabled = False` 本来就是要关它。口径抄
    `test_quota_and_invite.py` / `test_landing_page.py`。

    为什么这几道要钉：**装饰器漏写了不会报错**，路由照样挂得上、用例照样全绿，
    线上则是裸奔的一道写入口。`/link/code` 每发都往库里写一行 HMAC，两道登录口每发
    都要出网打 Apple / 微信，`DELETE /v1/account` 每发都不可逆地删数据。
    """

    def test_五道门都在注册表里(self):
        from app.core.rate_limit import limiter

        import app.main  # noqa: F401  装饰器在 import 路由模块那一刻才注册

        for key in ("app.api.routes.v1_auth.apple_login",
                    "app.api.routes.v1_auth.wechat_login",
                    "app.api.routes.v1_account.create_link_code",
                    "app.api.routes.v1_account.redeem_link_code",
                    "app.api.routes.v1_account.delete_account"):
            limits = limiter._route_limits.get(key)
            assert limits, f"{key} 上没有 @limiter.limit —— 这道门裸奔"
            assert len(limits) == 1, f"{key} 挂了 {len(limits)} 层限流，按一层设计"
            item = limits[0].limit
            assert item.amount == 5 and item.GRANULARITY.name == "minute", \
                f"{key} 的额度读出来是 {item}，不是 5/minute（改了口径要回契约 §七 对一遍）"

    def test_注册表本身不是空的(self):
        """上一条如果因为"路由模块没被 import"而一条都查不到，`for` 空转就是假绿。
        这一条量的是扫描器自己没瞎。"""
        from app.core.rate_limit import limiter

        import app.main  # noqa: F401

        v1_keys = [k for k in limiter._route_limits if k.startswith("app.api.routes.v1_")]
        assert len(v1_keys) >= 5, f"只注册了 {len(v1_keys)} 道 /v1 限流：{v1_keys}"


class Test迁移与模型对齐:
    def test_link_codes_这张表真_alembic_建得出来(self, tmp_path):
        """`create_all` 和 alembic 两条建表路必须给同一个形状——这一轮新增了一张表，
        所以这条尺子要跟着长。口径抄 `test_account_and_identity.py::Test迁移回填`：
        子进程、一次性 sqlite 文件，不拿 ORM 造假。"""
        import sqlite3
        import subprocess
        import sys
        from pathlib import Path

        db_file = tmp_path / "migrate.db"
        env = dict(__import__("os").environ, DATABASE_URL=f"sqlite:///{db_file}")
        subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"],
                       cwd=str(Path(__file__).resolve().parents[1]), env=env,
                       check=True, capture_output=True, text=True)
        conn = sqlite3.connect(db_file)
        columns = {row[1] for row in conn.execute("PRAGMA table_info(link_codes)")}
        assert columns == {"id", "code_hash", "account_id", "created_at", "expires_at", "used_at"}
        # 那道唯一索引必须在**alembic 建出来的库**里真的存在：摘掉它的时候 10-09 那一轮
        # `compare_metadata` 那条尺子一个字都没红（它看不见索引的 unique）。
        indexes = list(conn.execute("PRAGMA index_list(link_codes)"))
        unique_on_code_hash = [row for row in indexes
                               if row[1] == "ix_link_codes_code_hash" and row[2] == 1]
        assert unique_on_code_hash, f"code_hash 上那道唯一索引没了：{indexes}"
        conn.execute("insert into link_codes (code_hash, account_id, expires_at) "
                     "values ('h', 'a', '2026-10-09 12:00:00')")
        conn.commit()
        try:
            conn.execute("insert into link_codes (code_hash, account_id, expires_at) "
                         "values ('h', 'b', '2026-10-09 12:00:00')")
            conn.commit()
            pytest.fail("两枚一模一样的码能同时进库：redeem 会不知道该给谁")
        except sqlite3.IntegrityError:
            pass
        finally:
            conn.close()
