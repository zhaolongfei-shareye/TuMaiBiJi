"""口令登录这一路的判据：算式、六个口、以及它与删号/合并那两条老路的接缝。

站长 11-12「去搞登录吧，免费的技术方案」。这一路**没有发信通道**（现网 `.env` 里
`SMS_*`/`EMAIL_*` 两组凭据一行都没有），所以它有三件事与别的登录方式不一样，每一件都要有尺子：

① **登录名不验证归属**。`account_identities.verified_at` 必须是 NULL——写 now 等于把
   "没验过"说成"验过了"，而那一列正是为这种情况设的。
② **恢复码是唯一找回入口**。没有邮件就没有重置链接，所以"改完口令旧恢复码当场作废"
   与"旧 token 当场作废"两句都得是真的；少一句，捡到旧码/旧票的人就能把账号拿回去。
③ **游客升级不许新建 account**。游客那几百篇笔记挂在当前 account 的 `users` 行上，
   走 `ensure_for_provider` 会新建一条 ⇒ 设完密码数据全没了。这一条是整条路最贵的一句。

另外两句是安全边界：登录失败**只有一句话**（不许区分"号不存在"与"密码错"，否则注册口那句
409 之外又多一台判分机），以及失败闸**落在库里那两列**（换 IP 绕不过去，重启也清不掉）。
"""
import hashlib
import hmac
from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.core.rate_limit import get_ip_key, limiter
from app.models.account import Account, AccountIdentity
from app.models.account_password import AccountPassword
from app.models.category import Category
from app.models.generation_seq import GenerationSeq
from app.models.link_code import LinkCode
from app.models.note import Note
from app.models.user import User
from app.services import accounts, passwords

LOGIN = "keeper@example.com"
PASSWORD = "correct-horse-battery"


def _fresh_session():
    """共享测试库上这几张表先删后建（口径同 `test_v1_auth_and_link._fresh_session`）。

    `account_passwords` 必须一起删：它那一列 `account_id` 是**唯一**的，上一轮留在库里的
    那一行会让这一轮的注册撞索引，而红出来的形状是"409 登录名被占用"——看着像业务错。
    """
    from app.db.database import Base, SessionLocal, engine
    import app.models  # noqa: F401

    Base.metadata.drop_all(
        bind=engine,
        tables=[AccountPassword.__table__, LinkCode.__table__, AccountIdentity.__table__,
                Note.__table__, Category.__table__, Account.__table__, User.__table__,
                GenerationSeq.__table__],
    )
    Base.metadata.create_all(bind=engine)
    return SessionLocal()


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


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _register(client, login=LOGIN, password=PASSWORD):
    return client.post("/v1/auth/register", json={"login": login, "password": password})


def _login(client, login=LOGIN, password=PASSWORD):
    return client.post("/v1/auth/password-login", json={"login": login, "password": password})


def _guest(client, device_id="dev-pytest-0001"):
    # ⚠ `GuestLoginRequest.device_id` 钉了 min_length=8：短于 8 的串在 pydantic 那一层就 422，
    # 根本走不到路由。夹具里写 "dev-A" 量到的是入参闸，不是游客登录。
    assert len(device_id) >= 8, device_id
    r = client.post("/v1/auth/guest", json={"device_id": device_id})
    assert r.status_code == 200, r.text
    return r.json()


def _seed_notes(db, user_id, n=2):
    for i in range(n):
        db.add(Note(user_id=str(user_id), title=f"升级前第{i}篇", source_type="link",
                    content=f"正文{i}"))
    db.commit()


def _note_titles(db, user_id):
    return sorted(r[0] for r in db.query(Note.title).filter(Note.user_id == str(user_id)).all())


# ---------------------------------------------------------------- 算式


class Test算式:
    def test_同一个口令两次哈希不一样而且都能验过(self):
        """盐必须每次新取。两次一样的话，库里两行相同口令就能被看出"这两个人用了同一个密码"，
        而离线爆破一张彩虹表能同时打穿所有行。"""
        a, b = passwords.hash_password(PASSWORD), passwords.hash_password(PASSWORD)
        assert a != b, "盐没换：同一个口令哈希出了同一串"
        assert passwords.verify_password(PASSWORD, a)
        assert passwords.verify_password(PASSWORD, b)
        assert not passwords.verify_password(PASSWORD + "x", a)

    def test_存的是scrypt不是裸哈希(self):
        stored = passwords.hash_password(PASSWORD)
        assert stored.startswith("scrypt$"), stored
        assert hashlib.sha256(PASSWORD.encode()).hexdigest() not in stored
        assert PASSWORD not in stored, "口令原文进了库"

    def test_读不懂的那一串一律False而不是抛(self):
        """库里那一列将来可能被别的写法填过。"读不懂"与"密码不对"对调用方是同一个答案。"""
        for bad in ["", "plain", "scrypt$1$2", "scrypt$a$b$c$zz$yy", "bcrypt$x$y", None]:
            assert passwords.verify_password(PASSWORD, bad) is False, bad

    def test_恢复码是80位而且剔掉了易混字符(self):
        for _ in range(20):
            code = passwords.new_recovery_code()
            bare = passwords.normalize_recovery(code)
            assert len(bare) == 16, code
            assert not (set(bare) & set("IO01")), f"抄的时候容易认错：{code}"
            assert code.count("-") == 3 and len(code) == 19, code

    def test_恢复码小写空格不带横杠都认(self):
        code = passwords.new_recovery_code()
        stored = passwords.recovery_hash(code)
        for variant in [code, code.lower(), code.replace("-", ""),
                        " " + code.replace("-", " ") + " ", code.lower().replace("-", " ")]:
            assert passwords.recovery_matches(variant, stored), variant
        assert not passwords.recovery_matches(code[:-1], stored)
        assert not passwords.recovery_matches("AAAA-AAAA-AAAA-AAAA", stored)

    def test_恢复码存的是HMAC不是裸sha256(self):
        """与 `link_codes` 同一条理由，只是这一枚更长命：裸哈希在库泄漏时能被离线跑穿，
        keyed 之后那一步需要同时拿到签名密钥（那已经是"能签任意登录态"的等级）。"""
        code = passwords.new_recovery_code()
        bare = passwords.normalize_recovery(code)
        stored = passwords.recovery_hash(code)
        assert stored != hashlib.sha256(bare.encode()).hexdigest()
        assert stored == hmac.new(settings.JWT_SECRET_KEY.encode(), bare.encode(),
                                  hashlib.sha256).hexdigest()

    def test_登录名只认手机号或邮箱而且邮箱转小写(self):
        assert passwords.normalize_login("  A@B.com ") == "a@b.com"
        assert passwords.normalize_login("13800138000") == "13800138000"
        for bad in ["", "用户名", "abc", "a@b", "1380013800", None]:
            assert passwords.normalize_login(bad) is None, bad

    def test_口令长度闸是8到64(self):
        assert not passwords.password_ok("1234567")
        assert passwords.password_ok("12345678")
        assert passwords.password_ok("x" * 64)
        assert not passwords.password_ok("x" * 65)

    def test_连错十次锁十五分钟而且计数清零(self, db):
        account = accounts.ensure_for_provider(db, "password", passwords.uid_of(LOGIN), verified=False)
        passwords.create(db, account, PASSWORD)
        db.commit()
        row = passwords.row_for(db, account.id)
        for i in range(passwords.MAX_FAILED - 1):
            passwords.note_failure(db, row)
            assert not passwords.locked(row), f"第{i + 1}次就锁了"
        passwords.note_failure(db, row)
        assert passwords.locked(row), "连错十次没锁"
        assert row.failed_count == 0, "锁上之后计数没清零：锁到期后第一发错的就又立刻锁上＝永久锁"
        assert row.locked_until is not None
        # 拨到锁到期之后：必须自己解开，不需要任何人手工清。
        row.locked_until = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
        assert not passwords.locked(row)

    def test_登对一次把计数与锁一起清掉(self, db):
        account = accounts.ensure_for_provider(db, "password", passwords.uid_of(LOGIN), verified=False)
        passwords.create(db, account, PASSWORD)
        db.commit()
        row = passwords.row_for(db, account.id)
        passwords.note_failure(db, row)
        row.locked_until = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
        passwords.note_success(db, row)
        assert (row.failed_count, row.locked_until) == (0, None)


# ---------------------------------------------------------------- 注册


class Test注册:
    def test_三张表各一行而且身份没验过(self, client, db):
        r = _register(client)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["login"] == LOGIN
        assert body["recovery_code"], "注册那一趟必须下发恢复码：这是唯一的找回入口"
        assert db.query(Account).count() == 1
        assert db.query(User).count() == 1, "H5 要调的那一堆 legacy 口只认 users 行"
        identity = db.query(AccountIdentity).one()
        assert (identity.provider, identity.provider_uid) == ("password", f"pwd:{LOGIN}")
        assert identity.verified_at is None, "没有发信通道却把归属写成验过了"
        row = db.query(AccountPassword).one()
        assert row.account_id == identity.account_id
        assert row.failed_count == 0 and row.locked_until is None

    def test_发的是老式钥匙能开legacy那扇门(self, client, db):
        """H5 拿到票之后调的是 `/api/notes/*`、`/api/user/profile`，那些口只认 `sub=<users.id>`。
        发成 `kind=account` 那把的话，屏上表现是"登录成功但每一页都 401"。"""
        body = _register(client).json()
        assert client.get("/api/user/profile", headers=_bearer(body["token"])).status_code == 200
        assert client.get("/api/notes/", headers=_bearer(body["token"])).status_code == 200
        # 反向：拿错门必须被明确拒绝，而不是 500。
        assert client.get("/v1/account", headers=_bearer(body["token"])).status_code == 401

    def test_新号种默认分类但不种示例笔记(self, client, db):
        body = _register(client).json()
        assert db.query(Category).filter(Category.user_id == str(body["user_id"])).count() > 0
        assert db.query(Note).count() == 0, "新号里凭空多了一篇示例笔记"

    def test_恢复码原文一个字节都不进库(self, client, db):
        body = _register(client).json()
        code = body["recovery_code"]
        row = db.query(AccountPassword).one()
        for stored in (row.password_hash, row.recovery_hash):
            assert code not in stored and passwords.normalize_recovery(code) not in stored
        identity = db.query(AccountIdentity).one()
        assert code not in identity.provider_uid

    def test_邮箱大小写与空格归一到同一个号(self, client, db):
        assert _register(client, login="  Keeper@Example.COM ").status_code == 200
        assert _login(client, login="KEEPER@example.com").status_code == 200
        assert db.query(Account).count() == 1, "大小写不同的同一个邮箱被当成了两个人"

    def test_手机号也能当登录名(self, client, db):
        r = _register(client, login="13800138000")
        assert r.status_code == 200, r.text
        assert r.json()["login"] == "13800138000"
        assert _login(client, login="13800138000").status_code == 200

    def test_登录名与口令不合法都进不去而且库里一行都不多(self, client, db):
        """两档要分开量：`login` 短于 5 字符在 pydantic 那一层就 422（走不到路由），
        够长但不是手机号/邮箱才由 `_normalized_login` 回 400。混成一句 `== 400` 的话，
        这条判据量到的是入参闸而不是我们那道认名字的闸。"""
        r = _register(client, login="username", password=PASSWORD)
        assert r.status_code == 400 and "手机号或邮箱" in r.json()["detail"], r.text
        for login, password in [("用户名", PASSWORD), ("", PASSWORD), ("a@b", PASSWORD),
                                (LOGIN, "1234567"), (LOGIN, "x" * 65)]:
            r = _register(client, login=login, password=password)
            assert r.status_code in (400, 422), f"{login!r} → {r.status_code} {r.text}"
        assert db.query(Account).count() == 0
        assert db.query(AccountPassword).count() == 0

    def test_重名409而且不许覆盖前一个人的口令(self, client, db):
        first = _register(client).json()
        r = _register(client, password="attacker-password-99")
        assert r.status_code == 409, r.text
        assert db.query(Account).count() == 1
        assert db.query(AccountPassword).count() == 1
        # 前一个人手里那枚口令必须还是原来那枚：覆盖 = 把别人的账号拱手让给后来者。
        assert _login(client).status_code == 200
        assert _login(client, password="attacker-password-99").status_code == 400
        assert _login(client).json()["user_id"] == first["user_id"]

    def test_并发那一趟也不许覆盖赢家的口令(self, client, db):
        """两趟同时注册同一个登录名：后一趟 `ensure_for_provider` 会返回**赢家**的 account。
        这一条手工把"赢家已经落了口令行"摆出来，量的就是路由里那道后置检查——
        少了它，后一趟会 `passwords.create` 再插一行，撞唯一索引回 500（或者更糟：覆盖）。"""
        winner = accounts.ensure_for_provider(db, "password", passwords.uid_of(LOGIN), verified=False)
        passwords.create(db, winner, PASSWORD)
        db.commit()
        r = _register(client, password="late-arrival-password")
        assert r.status_code == 409, r.text
        assert db.query(AccountPassword).count() == 1
        assert _login(client, password="late-arrival-password").status_code == 400


# ---------------------------------------------------------------- 登录


class Test登录:
    def test_登进去是同一个人而且不再下发恢复码(self, client, db):
        first = _register(client).json()
        r = _login(client)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user_id"] == first["user_id"]
        assert body["login"] == LOGIN
        assert body["recovery_code"] is None, "普通登录那一趟又把恢复码发了一遍＝多一次泄漏面"
        assert client.get("/api/user/profile", headers=_bearer(body["token"])).status_code == 200

    def test_密码错与号不存在回的是同一句话(self, client, db):
        _register(client)
        wrong = _login(client, password="not-the-password")
        missing = _login(client, login="nobody@example.com")
        malformed = _login(client, login="随便一个名字")
        assert wrong.status_code == missing.status_code == malformed.status_code == 400
        texts = {r.json()["detail"] for r in (wrong, missing, malformed)}
        assert len(texts) == 1, f"给了第二台判分机：{texts}"

    def test_连错十次之后连正确口令也进不去(self, client, db):
        """闸按**账号**而不是按 IP：换 IP 就绕过去的话，这道闸等于没有。"""
        _register(client)
        for i in range(passwords.MAX_FAILED):
            r = _login(client, password=f"wrong-{i}")
            assert r.status_code == 400, f"第{i + 1}发：{r.status_code} {r.text}"
        locked = _login(client)
        assert locked.status_code == 429, f"锁上了却还放正确口令进去：{locked.status_code} {locked.text}"
        row = db.query(AccountPassword).one()
        assert row.locked_until is not None, "锁只在内存里：进程一重启就没了"

    def test_锁到期之后自己能进(self, client, db):
        _register(client)
        for i in range(passwords.MAX_FAILED):
            _login(client, password=f"wrong-{i}")
        row = db.query(AccountPassword).one()
        row.locked_until = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
        assert _login(client).status_code == 200
        row = db.query(AccountPassword).one()
        assert (row.failed_count, row.locked_until) == (0, None)

    def test_错几发再登对计数归零(self, client, db):
        _register(client)
        for i in range(3):
            _login(client, password=f"wrong-{i}")
        assert db.query(AccountPassword).one().failed_count == 3
        assert _login(client).status_code == 200
        assert db.query(AccountPassword).one().failed_count == 0


# ---------------------------------------------------------------- 游客升级


class Test游客升级:
    def test_设完密码笔记一篇都没少而且人还是那一行(self, client, db):
        """整条路最贵的一句。走 `ensure_for_provider` 会新建 account ⇒ 数据全没了。"""
        guest = _guest(client)
        _seed_notes(db, guest["user_id"], 3)
        before_titles = _note_titles(db, guest["user_id"])
        account_id = db.query(User).filter(User.id == guest["user_id"]).one().account_id
        generation_before = db.query(User).filter(User.id == guest["user_id"]).one().generation

        r = client.post("/v1/auth/upgrade", headers=_bearer(guest["token"]),
                        json={"login": LOGIN, "password": PASSWORD})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user_id"] == guest["user_id"], "升级把这个人换成了另一行 users"
        assert body["recovery_code"]
        assert db.query(Account).count() == 1, "升级新建了 account"
        assert db.query(User).count() == 1
        assert _note_titles(db, guest["user_id"]) == before_titles
        row = db.query(User).filter(User.id == guest["user_id"]).one()
        assert row.account_id == account_id
        assert row.generation == generation_before, "加一种登录方式抬了代次＝手里这把钥匙当场作废"
        # 旧钥匙继续能用（不抬代次的正面判据）。
        assert client.get("/api/user/profile", headers=_bearer(guest["token"])).status_code == 200
        providers = {i.provider for i in db.query(AccountIdentity).all()}
        assert providers == {"guest", "password"}, providers
        pwd_identity = db.query(AccountIdentity).filter(AccountIdentity.provider == "password").one()
        assert pwd_identity.verified_at is None

    def test_换一台设备用口令登回来读到同一批笔记(self, client, db):
        """这才是"登录"这两个字的兑现：数据跟着账号走，不跟着 deviceId 走。"""
        guest = _guest(client, device_id="dev-AAAA-0001")
        _seed_notes(db, guest["user_id"], 2)
        titles = _note_titles(db, guest["user_id"])
        assert client.post("/v1/auth/upgrade", headers=_bearer(guest["token"]),
                           json={"login": LOGIN, "password": PASSWORD}).status_code == 200

        fresh = _guest(client, device_id="dev-BBBB-0002")
        assert fresh["user_id"] != guest["user_id"], "前提：新 deviceId 确实是另一个游客"
        assert _note_titles(db, fresh["user_id"]) == []
        back = _login(client)
        assert back.status_code == 200, back.text
        assert back.json()["user_id"] == guest["user_id"]
        listed = client.get("/api/notes/", headers=_bearer(back.json()["token"]))
        assert listed.status_code == 200
        assert sorted(n["title"] for n in listed.json()) == titles

    def test_同一个账号不许设第二次密码(self, client, db):
        guest = _guest(client)
        assert client.post("/v1/auth/upgrade", headers=_bearer(guest["token"]),
                           json={"login": LOGIN, "password": PASSWORD}).status_code == 200
        again = client.post("/v1/auth/upgrade", headers=_bearer(guest["token"]),
                            json={"login": "second@example.com", "password": PASSWORD})
        assert again.status_code == 409, again.text
        assert db.query(AccountPassword).count() == 1
        assert db.query(AccountIdentity).filter(AccountIdentity.provider == "password").count() == 1

    def test_抢别人的登录名409而且什么都不留下(self, client, db):
        _register(client)
        guest = _guest(client)
        r = client.post("/v1/auth/upgrade", headers=_bearer(guest["token"]),
                        json={"login": LOGIN, "password": PASSWORD})
        assert r.status_code == 409, r.text
        assert db.query(AccountPassword).count() == 1, "抢名失败却给这个游客落了口令行"
        assert db.query(AccountIdentity).filter(
            AccountIdentity.account_id == db.query(User).filter(
                User.id == guest["user_id"]).one().account_id,
            AccountIdentity.provider == "password").count() == 0, "抢名失败却把身份挂上去了"
        # 原来那个人不受影响。
        assert _login(client).status_code == 200

    def test_没有票升不了级(self, client, db):
        r = client.post("/v1/auth/upgrade", json={"login": LOGIN, "password": PASSWORD})
        assert r.status_code == 401, r.text


# ---------------------------------------------------------------- 找回


class Test找回:
    def test_找回之后旧票当场作废新票能用(self, client, db):
        first = _register(client).json()
        r = client.post("/v1/auth/recover", json={
            "login": LOGIN, "recovery_code": first["recovery_code"], "new_password": "brand-new-pass-1"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user_id"] == first["user_id"]
        assert body["recovery_code"] and body["recovery_code"] != first["recovery_code"]
        assert client.get("/api/user/profile", headers=_bearer(first["token"])).status_code == 401, \
            "找回之后旧票还活着＝捡到旧票的人照样读得到"
        assert client.get("/api/user/profile", headers=_bearer(body["token"])).status_code == 200
        assert _login(client, password="brand-new-pass-1").status_code == 200
        assert _login(client).status_code == 400

    def test_旧恢复码当场作废(self, client, db):
        first = _register(client).json()
        assert client.post("/v1/auth/recover", json={
            "login": LOGIN, "recovery_code": first["recovery_code"],
            "new_password": "brand-new-pass-1"}).status_code == 200
        again = client.post("/v1/auth/recover", json={
            "login": LOGIN, "recovery_code": first["recovery_code"],
            "new_password": "attacker-pass-2"})
        assert again.status_code == 400, "旧码还能再用一次＝捡到旧码的人能把刚改好的密码改回去"
        assert _login(client, password="brand-new-pass-1").status_code == 200

    def test_两格代次一起抬(self, client, db):
        first = _register(client).json()
        user = db.query(User).filter(User.id == first["user_id"]).one()
        account = db.query(Account).filter(Account.id == user.account_id).one()
        before = (user.generation, account.generation)
        assert client.post("/v1/auth/recover", json={
            "login": LOGIN, "recovery_code": first["recovery_code"],
            "new_password": "brand-new-pass-1"}).status_code == 200
        db.refresh(user)
        db.refresh(account)
        assert (user.generation, account.generation) == (before[0] + 1, before[1] + 1)

    def test_恢复码抄成小写不带横杠也认(self, client, db):
        first = _register(client).json()
        messy = first["recovery_code"].lower().replace("-", " ")
        r = client.post("/v1/auth/recover", json={
            "login": LOGIN, "recovery_code": messy, "new_password": "brand-new-pass-1"})
        assert r.status_code == 200, r.text

    def test_码不对什么都不改(self, client, db):
        first = _register(client).json()
        for code in ["AAAA-AAAA-AAAA-AAAA", first["recovery_code"][:-1], "太短"]:
            r = client.post("/v1/auth/recover", json={
                "login": LOGIN, "recovery_code": code, "new_password": "brand-new-pass-1"})
            assert r.status_code in (400, 422), f"{code!r} → {r.status_code}"
        assert _login(client).status_code == 200, "码不对却把口令改了"
        assert client.get("/api/user/profile", headers=_bearer(first["token"])).status_code == 200

    def test_号不存在与码不对回同一句话(self, client, db):
        first = _register(client).json()
        a = client.post("/v1/auth/recover", json={
            "login": LOGIN, "recovery_code": "AAAA-AAAA-AAAA-AAAA", "new_password": "brand-new-pass-1"})
        b = client.post("/v1/auth/recover", json={
            "login": "nobody@example.com", "recovery_code": first["recovery_code"],
            "new_password": "brand-new-pass-1"})
        assert a.status_code == b.status_code == 400
        assert a.json()["detail"] == b.json()["detail"]

    def test_新口令不合法时口令与代次都不动(self, client, db):
        first = _register(client).json()
        user = db.query(User).filter(User.id == first["user_id"]).one()
        before = user.generation
        r = client.post("/v1/auth/recover", json={
            "login": LOGIN, "recovery_code": first["recovery_code"], "new_password": "short"})
        assert r.status_code == 400, r.text
        db.refresh(user)
        assert user.generation == before
        assert _login(client).status_code == 200

    def test_找回不搬笔记(self, client, db):
        guest = _guest(client)
        _seed_notes(db, guest["user_id"], 2)
        titles = _note_titles(db, guest["user_id"])
        up = client.post("/v1/auth/upgrade", headers=_bearer(guest["token"]),
                         json={"login": LOGIN, "password": PASSWORD}).json()
        assert client.post("/v1/auth/recover", json={
            "login": LOGIN, "recovery_code": up["recovery_code"],
            "new_password": "brand-new-pass-1"}).status_code == 200
        assert _note_titles(db, guest["user_id"]) == titles


# ---------------------------------------------------------------- 改密


class Test改密:
    def test_知道旧口令就能改而且旧票作废(self, client, db):
        first = _register(client).json()
        r = client.post("/v1/auth/change-password", headers=_bearer(first["token"]),
                        json={"old_password": PASSWORD, "new_password": "brand-new-pass-1"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["login"] == LOGIN
        assert body["recovery_code"] and body["recovery_code"] != first["recovery_code"]
        assert client.get("/api/user/profile", headers=_bearer(first["token"])).status_code == 401
        assert client.get("/api/user/profile", headers=_bearer(body["token"])).status_code == 200
        assert _login(client, password="brand-new-pass-1").status_code == 200

    def test_旧口令不对400而且什么都不改(self, client, db):
        first = _register(client).json()
        r = client.post("/v1/auth/change-password", headers=_bearer(first["token"]),
                        json={"old_password": "wrong-old-pass", "new_password": "brand-new-pass-1"})
        assert r.status_code == 400, r.text
        assert _login(client).status_code == 200
        assert client.get("/api/user/profile", headers=_bearer(first["token"])).status_code == 200

    def test_没设过口令的账号409(self, client, db):
        guest = _guest(client)
        r = client.post("/v1/auth/change-password", headers=_bearer(guest["token"]),
                        json={"old_password": PASSWORD, "new_password": "brand-new-pass-1"})
        assert r.status_code == 409, r.text
        assert db.query(AccountPassword).count() == 0

    def test_改密把失败闸一起清掉(self, client, db):
        """锁着的时候用恢复码找回、或者手里有旧票的人改密，都应当顺手解锁——
        不清的话改完密码还是登不进去，用户会以为改失败了。"""
        first = _register(client).json()
        for i in range(passwords.MAX_FAILED):
            _login(client, password=f"wrong-{i}")
        assert db.query(AccountPassword).one().locked_until is not None
        r = client.post("/v1/auth/change-password", headers=_bearer(first["token"]),
                        json={"old_password": PASSWORD, "new_password": "brand-new-pass-1"})
        assert r.status_code == 200, r.text
        row = db.query(AccountPassword).one()
        assert (row.failed_count, row.locked_until) == (0, None)
        assert _login(client, password="brand-new-pass-1").status_code == 200


# ---------------------------------------------------------------- 会话


class Test会话:
    def test_游客问我是谁回login为空(self, client, db):
        guest = _guest(client)
        r = client.get("/v1/auth/session", headers=_bearer(guest["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user_id"] == guest["user_id"]
        assert body["login"] is None
        assert body["providers"] == ["guest"]

    def test_升级之后问我是谁回登录名(self, client, db):
        """H5「账号」那一行读的是这一口，不是 localStorage：本机存的那份在
        "另一台设备上升了级"之后就是陈的。"""
        guest = _guest(client)
        assert client.post("/v1/auth/upgrade", headers=_bearer(guest["token"]),
                           json={"login": LOGIN, "password": PASSWORD}).status_code == 200
        body = client.get("/v1/auth/session", headers=_bearer(guest["token"])).json()
        assert body["login"] == LOGIN
        assert body["providers"] == ["guest", "password"]
        assert body["account_id"] == db.query(User).filter(
            User.id == guest["user_id"]).one().account_id

    def test_拿错门与没票都是401不是500(self, client, db):
        assert client.get("/v1/auth/session").status_code == 401
        body = _register(client).json()
        account = db.query(Account).filter(
            Account.id == db.query(User).filter(User.id == body["user_id"]).one().account_id).one()
        from app.core.auth import _create_account_token
        wrong_kind = _create_account_token(account)
        assert client.get("/v1/auth/session", headers=_bearer(wrong_kind)).status_code == 401


# ---------------------------------------------------------------- 与老路的接缝


class Test删号与合并:
    def test_删号之后口令行清掉而且同一个登录名能再注册(self, client, db):
        """不清那一行的话，`account_id` 那道唯一索引会让死账号一直占着这个登录名，
        而 `find_account_by_login` 查出来的 account 已经不存在 ⇒ 再注册撞索引 500。"""
        from app.core.auth import _create_account_token
        first = _register(client).json()
        account = db.query(Account).filter(Account.id == db.query(User).filter(
            User.id == first["user_id"]).one().account_id).one()
        r = client.delete("/v1/account?confirm=true", headers=_bearer(_create_account_token(account)))
        assert r.status_code == 200, r.text
        assert r.json()["deleted"]["passwords"] == 1, r.json()["deleted"]
        assert db.query(AccountPassword).count() == 0
        again = _register(client)
        assert again.status_code == 200, f"删过的登录名注册不回来了：{again.status_code} {again.text}"
        # ⚠ 比的是 account_id 不是 user_id：`users.id` 是整型主键，删了会**复用**
        # （同 `test_v1_account_deletion` 里那条"删掉的 account 被复用了"的口径）。
        new_account = db.query(User).filter(User.id == again.json()["user_id"]).one().account_id
        assert new_account != account.id, "删掉的 account 被复用了"

    def test_合并时口令跟着人走(self, client, db):
        """keep 没口令、absorb 有 ⇒ 那一行搬到 keep 名下，登录名照样登得进去，
        而且登进去读到的是合并后的那个人。"""
        from app.services import linking
        keep_guest = _guest(client, device_id="dev-keep")
        _seed_notes(db, keep_guest["user_id"], 1)
        absorb = _register(client).json()
        keep = db.query(Account).filter(Account.id == db.query(User).filter(
            User.id == keep_guest["user_id"]).one().account_id).one()
        other = db.query(Account).filter(Account.id == db.query(User).filter(
            User.id == absorb["user_id"]).one().account_id).one()
        linking.merge_into(db, keep, other)
        db.commit()
        row = db.query(AccountPassword).one()
        assert row.account_id == keep.id, "口令行没跟着人走"
        back = _login(client)
        assert back.status_code == 200, back.text
        assert back.json()["user_id"] == keep_guest["user_id"]

    def test_两边都有口令时留keep那枚而且absorb的名字不再能登(self, client, db):
        """只删口令行会留下一个"念得出登录名、却永远登不进去"的名字，
        所以 password 身份行必须一起摘掉。"""
        from app.services import linking
        keep = _register(client, login="keep@example.com").json()
        absorb = _register(client, login="absorb@example.com").json()
        keep_acct = db.query(Account).filter(Account.id == db.query(User).filter(
            User.id == keep["user_id"]).one().account_id).one()
        absorb_acct = db.query(Account).filter(Account.id == db.query(User).filter(
            User.id == absorb["user_id"]).one().account_id).one()
        linking.merge_into(db, keep_acct, absorb_acct)
        db.commit()
        assert db.query(AccountPassword).count() == 1
        assert db.query(AccountPassword).one().account_id == keep_acct.id
        assert _login(client, login="keep@example.com").status_code == 200
        gone = _login(client, login="absorb@example.com")
        assert gone.status_code == 400, "被并掉那个登录名还挂在一行不存在的 account 上"
        assert db.query(AccountIdentity).filter(
            AccountIdentity.provider_uid == "pwd:absorb@example.com").count() == 0


# ---------------------------------------------------------------- 限流键


class Test限流键:
    """判据读的是**注册进去的那个函数对象**，不是源码字符串（口径同 `test_login_rate_keying`）。

    全局那把 `key_func` 是 `get_user_key`：带一把签名有效的票就换成按 `sub` 计桶。
    口令这几个口是"匿名可反复试"的那一类，桶必须钉在来源上，否则脚本换票就能把桶放宽。
    """

    ANON = {
        "app.api.routes.v1_auth.password_register": "3 per 1 hour",
        "app.api.routes.v1_auth.password_login": "10 per 1 minute",
        "app.api.routes.v1_auth.password_recover": "5 per 1 hour",
    }
    WITH_TICKET = {
        "app.api.routes.v1_auth.password_upgrade": "5 per 1 hour",
        "app.api.routes.v1_auth.password_change": "5 per 1 hour",
    }

    def test_匿名那三个口的桶钉在IP上(self):
        for name in self.ANON:
            limits = limiter._route_limits.get(name)
            assert limits, f"{name} 根本没挂限流"
            assert {getattr(l, "key_func", None) for l in limits} == {get_ip_key}, name

    def test_带票那两个口也钉在IP上(self):
        """这两口虽然要票，但票是**游客也能拿**的（`/v1/auth/guest` 30/小时随便领）。
        按 `sub` 计桶的话，领一堆游客号就能把改密/升级的桶无限放宽。"""
        for name in self.WITH_TICKET:
            limits = limiter._route_limits.get(name)
            assert limits, f"{name} 根本没挂限流"
            assert {getattr(l, "key_func", None) for l in limits} == {get_ip_key}, name

    def test_限流额度就是注释里写的那几个数(self):
        for name, want in {**self.ANON, **self.WITH_TICKET}.items():
            got = {str(l.limit) for l in limiter._route_limits[name]}
            assert got == {want}, f"{name} 的额度是 {got}，注释与判据说的是 {want}"