"""`DELETE /v1/account`：Apple 5.1.1(v) 要的"App 内能删账号"，删的是**整条 account**。

这一份文件量的东西只有一句话：**"删一个人"这件事不能有两个答案**。小程序那条
`/api/user/deactivate` 已经写在那里很久、范围被十几把尺子钉着；`/v1` 如果另抄一遍
"删哪几张表"，两边迟早会分别漏一张——而"删了账号却还查得到我的笔记"正是 5.1.1(v)
审查打回的那一种。所以两侧共用 `services/deletion.purge`，这里钉的是六件事：

1. **只有 Apple 身份的人也删得动**（乙之后这是常态：他有 `accounts` 行、没有 `users` 行），
   且删的动作**不许自己凭空造出一行 `users`**——那条前提在 `Test只有苹果身份的人` 里先自证。
2. **一次删净**——判据不按我列的表名点名，而是从 `Base.metadata` 里**捞出所有挂 `user_id`
   的表**逐张数行；`invitations`／`share_reports` 这两张认不出 `user_id` 的由 `_person_left`
   按列名补上。将来新增一张挂 `user_id` 的表而 `purge` 没管它，这条会红。
3. **别人名下一行不动**（每一步都带着归属条件）。
4. **两个口的边界钉的是实际发生的那一半**：`/api` 传 `[user]`，但它连带把背后那条 account
   整行、它名下全部 identity 与短码一起带走（今天一条 account 只有一行微信登录行，所以
   两者同形；阶段3 出现第二行时这一档要重拍，见 `routes/user.py` 的 docstring）。
5. **`purge` 认的是 `account_id` 那个值，不是查出来的对象**——`users.account_id` 有值而
   `accounts` 里那一行没了时，注销必须照样把身份行摘掉并让那个人能重新注册（老 `/api` 那段
   代码的自愈，抽公共函数时差点被撤）。
6. **外键真被强制的那套语义上，`/v1` 这一路多行也走得通**（`Test外键强制下这一路走得通`）——
   引用 `notes` 的两张表 `shares` 与 `jobs` 各钉一条，撤掉"先子后父"里任何一半都会红。

`_reload(db)` 那条口径照搬 `test_v1_auth_and_link.py`：用例的会话和请求的会话是两个，
不 expire 就读请求改过的行，拿到的是请求**之前**的快照（那种判据是永真的）。⚠ 只有走 ORM
`db.query(...)` 的判据需要它；`_rows_left_for`／`_person_left` 用的是 Core `Table.select()`，
每一发都真去库里读，给它们加 `_reload` 是装饰，还会让后来人误以为那张网是 ORM 的。
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))          # 同目录的测试模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from test_v1_auth_and_link import (  # noqa: E402
    CLIENT_ID, _account_token, _bearer, _code, _login, _mint, _public_jwk, _reload,
    _serve_jwks, _user_token, _wechat_person,
)

from app.db.database import Base  # noqa: E402
import app.models  # noqa: E402,F401  —— 建表只看"这一刻已被 import 的模型"
from app.models.account import Account, AccountIdentity  # noqa: E402
from app.models.asset import Asset  # noqa: E402
from app.models.category import Category  # noqa: E402
from app.models.invitation import Invitation  # noqa: E402
from app.models.job import Job  # noqa: E402
from app.models.link_code import LinkCode  # noqa: E402
from app.models.note import Note  # noqa: E402
from app.models.note_card import NoteCard  # noqa: E402
from app.models.share import Share  # noqa: E402
from app.models.share_report import ShareReport  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_profile import UserProfile  # noqa: E402


def _fresh_session():
    """这一路要碰的表**先删后建**再开会话（两条理由同 `test_v1_auth_and_link._fresh_session`：
    `create_all` 见表已存在就不动，而 `users.id` 会复用——残留的笔记会让下一个人
    莫名其妙"已经有笔记"）。"""
    from app.db.database import SessionLocal, engine
    import app.models  # noqa: F401

    tables = [
        ShareReport.__table__, Share.__table__, NoteCard.__table__, UserProfile.__table__,
        Invitation.__table__, LinkCode.__table__, Asset.__table__, Category.__table__,
        Note.__table__, Job.__table__, AccountIdentity.__table__, Account.__table__,
        User.__table__,
    ]
    Base.metadata.drop_all(bind=engine, tables=tables)
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


@pytest.fixture
def fk_db(tmp_path):
    """一台**真把外键当回事**的库（`PRAGMA foreign_keys=ON`）。

    整套用例默认跑在 `/tmp/tumaibiji_pytest.db` 上，而 SQLite 不执行外键、
    `app/db/database.py` 也没开那一条 PRAGMA——于是"先删父表 notes、引用它的 shares/jobs
    还挂着"这件事在整套里**没人追究**，Postgres 是要追究的。这一台把顺序问题变成能红的东西。
    """
    from sqlalchemy import create_engine, event
    from sqlalchemy.orm import Session

    from app.db.database import Base
    import app.models  # noqa: F401

    engine = create_engine(f"sqlite:///{tmp_path / 'fk.db'}")

    @event.listens_for(engine, "connect")
    def _enforce_fk(dbapi_conn, _conn_record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    session = Session(engine)
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _delete(client, account, confirm=True):
    url = "/v1/account" + ("?confirm=true" if confirm else "?confirm=false")
    return client.delete(url, headers=_bearer(_account_token(account)))


def _user_tables():
    """按机制捞：**每张挂 `user_id` 的表**都算，不按我列的名字点名。
    点名式判据的洞和它当初要治的病是同一个（新增一张表不会红）。"""
    return [t for t in Base.metadata.sorted_tables if "user_id" in t.c]


def _person_left(db, uid=None, account_id=None) -> dict:
    """这个人在"记着他这个人"的那批表里还剩几行（别人名下的不算）。

    与 `_rows_left_for` 那张网成一对：那张管不到 `invitations`（两列叫 `inviter_id`／
    `invitee_id`）与 `share_reports`（只挂 token），`_rows_left_for_account` 那张又管不到
    没有 `account_id` 列的它们。所以这里**按列名认归属**，不点名表（点名会在别人改名时
    静默变成空判——本文件第一版就把 `invitations` 写成了 `invitation`，红的正是这一句）。
    认不出归属条件的表跳过，跳过的是"这张表不记着这个人"。种子那一步把举报行的 token
    写成 `seed-<uid>`（见 `_seed_every_table`），所以举报行也数得到。
    """
    from sqlalchemy import or_

    conn = db.connection()
    left = {}
    for t in Base.metadata.sorted_tables:
        conds = []
        if "user_id" in t.c:
            if uid is not None:
                conds.append(t.c.user_id == str(uid))
        elif "token" in t.c:
            # 只给"没有 user_id 却有 token"的那张表用（就是 share_reports）；shares 上面那条
            # user_id 已经数到了，这里再 OR 一次会把别人的行也算进来。
            if uid is not None:
                conds.append(t.c.token.like(f"seed-{uid}"))
        if "inviter_id" in t.c and uid is not None:
            conds.append(t.c.inviter_id == uid)
        if "invitee_id" in t.c and uid is not None:
            conds.append(t.c.invitee_id == uid)
        if "account_id" in t.c and account_id is not None:
            conds.append(t.c.account_id == account_id)
        if not conds:
            continue
        left[t.name] = len(conn.execute(t.select().where(or_(*conds))).fetchall())
    assert left, "一张都认不出归属条件：下面的判据根本没在考任何东西"
    return left


# 表名 → 回体 `deleted` 里那个键。`cards` / `profile` 这两个名字**先于**这张表的表名
# 出现在现网回体里（小程序读的就是它们），改键名等于改客户端契约，所以这里做一张对照表，
# 而不是把现网那两个键换掉。新增一张挂 `user_id` 的表如果没进这张表、也没进回体，
# 下面那条形状判据会红——那正是要的效果：**加表的人必须同时想到删除这一路**。
_TABLE_TO_KEY = {"note_cards": "cards", "user_profiles": "profile"}


def _key_for(table_name: str) -> str:
    """表名 → 回体 `deleted` 里那个键。"""
    return _TABLE_TO_KEY.get(table_name, table_name)


def _expected_response_keys():
    return {_key_for(t.name) for t in _user_tables()}


def _rows_left_for(db, uid) -> dict:
    out = {t.name: len(db.execute(t.select().where(t.c.user_id == str(uid))).fetchall())
           for t in _user_tables()}
    assert out, "库里一张挂 user_id 的表都没捞到：这条判据根本没在考任何东西"
    return out


def _rows_left_for_account(db, account_id) -> dict:
    """同一件事的另一半：按机制捞**每张挂 `account_id` 的表**再数一遍。

    `user_id` 那张网管不到只挂 `account_id` 的东西（`account_identities`、`link_codes`，
    以及将来那张跨端记录表）。两张网都捞，才谈得上"删净"。
    """
    out = {}
    for t in Base.metadata.sorted_tables:
        if "account_id" in t.c:
            out[t.name] = len(db.execute(t.select().where(t.c.account_id == account_id)).fetchall())
    assert out, "库里一张挂 account_id 的表都没捞到：这条判据根本没在考任何东西"
    return out


def _seed_every_table(db, user):
    """在这一行登录行名下**每张挂 user_id 的表都塞一行**（能塞几张塞几张），返回塞了几行。"""
    uid = str(user.id)
    category = Category(user_id=uid, name="塞一行")
    db.add(category)
    db.commit()
    note = Note(user_id=uid, title="塞一篇", source_type="link", category_id=category.id)
    db.add(note)
    db.commit()
    token = f"seed-{uid}"      # `shares.token` 上有唯一索引，两个种子用户不许撞同一枚
    db.add(Share(user_id=uid, note_id=note.id, token=token, is_active=True))
    db.add(Job(user_id=uid, job_type="ocr", status="done"))
    db.add(Asset(user_id=uid, object_key="cloud/a.png"))
    db.add(NoteCard(user_id=uid, note_id=note.id, object_key="cloud/c.png", tpl="classic"))
    # 名片四格里第三格故意塞一张与配图同名的对象：去重没做的话 `file_ids` 会看到两次。
    db.add(UserProfile(user_id=uid, slots=[{"file_id": "cloud/p1.png"}, None,
                                           {"file_id": "cloud/a.png"}, {}]))
    db.commit()
    # 举报行不挂 user_id（只挂 token），单独塞一条，让它不进 `_rows_left_for` 那张网。
    db.add(ShareReport(token=token, reason="spam", reporter_bucket="bucket-x"))
    db.commit()


class Test只有苹果身份的人:
    def test_没有_users_行也删得动(self, client, db, signing_key, jwks):
        body = _login(client, _mint(signing_key, sub="apple-del")).json()
        # **先自证前提**。库里恰好没有 users 行不是一条判据，是一句运气：有人把这一路改回
        # 甲（Apple 登录顺手造一行 users），下面那句 `count() == 0` 会照样绿，而它已经不在
        # 考"没有 users 行的人"了。所以这一句要在删除之前先响一次。
        assert db.query(User).count() == 0, \
            "前提不成立：这个只有 Apple 身份的人已经有 users 行了，这一条考的不是他"
        account = db.query(Account).filter(Account.id == body["account_id"]).one()
        resp = _delete(client, account)
        assert resp.status_code == 200, resp.text
        got = resp.json()["deleted"]
        assert got["identities"] == 1, got
        assert got["account"] == 1, got
        assert db.query(Account).count() == 0
        assert db.query(AccountIdentity).count() == 0
        assert db.query(User).count() == 0, "删的时候凭空造出一行 users"
        assert not {k: v for k, v in _rows_left_for_account(db, body["account_id"]).items() if v}, \
            "只挂 account_id 的表里有东西留下来了"

    def test_回体里每张挂_user_id_的表一律在场(self, client, db, signing_key, jwks):
        """只有 Apple 身份的人这些表全是 0，但**键必须在**。

        钉的是形状不是数值：客户端那句"删了 N 条笔记"不能先判键在不在。捞的名单同样
        按机制来（`_user_tables()`），不点名。
        """
        body = _login(client, _mint(signing_key, sub="apple-shape")).json()
        account = db.query(Account).filter(Account.id == body["account_id"]).one()
        got = _delete(client, account).json()["deleted"]
        expected = _expected_response_keys()
        assert expected, "捞不到任何挂 user_id 的表，这条就不是在考形状"
        assert expected <= set(got), f"这些表在回体里没有：{sorted(expected - set(got))}"
        assert all(got[k] == 0 for k in expected), {k: got[k] for k in expected if got[k]}

    def test_删完之后同一枚苹果票拿到的是新的一条_account(self, client, db, signing_key, jwks):
        """身份行必须一起删：不删的话那个 Apple user identifier 一直被唯一索引占着，
        同一个人重装后再登录会**登不进去**（撞索引），而不是"回到原来的账号"。"""
        first = _login(client, _mint(signing_key, sub="apple-again")).json()
        account = db.query(Account).filter(Account.id == first["account_id"]).one()
        assert _delete(client, account).status_code == 200
        second = _login(client, _mint(signing_key, sub="apple-again"))
        assert second.status_code == 200, f"删过之后同一个人登不回来了：{second.status_code} {second.text}"
        assert second.json()["account_id"] != first["account_id"], "删掉的 account 被复用了"

    def test_手里那把钥匙当场开不了任何门(self, client, db, signing_key, jwks):
        body = _login(client, _mint(signing_key, sub="apple-token")).json()
        account = db.query(Account).filter(Account.id == body["account_id"]).one()
        token = body["token"]
        assert _delete(client, account).status_code == 200
        # 不抬代次也失效——比的是"库里那一行还在不在"，而那一行整个没了。
        assert client.get("/v1/account", headers=_bearer(token)).status_code == 401


class Test一次删净:
    def test_每张挂_user_id_的表都不许留下这个人行(self, client, db):
        user, account = _wechat_person(db, openid="o_del_all")
        _seed_every_table(db, user)
        # ⚠ 第三行故意挂成 `account_id=None`：`/v1` 那一路捞的是 `User.account_id == account.id`，
        # 所以**这一行本来就不在这次删除的范围里**。把它摆在这儿是为了让"删净"这两个字有边界——
        # 它底下的笔记必须原样留着。谁哪天把范围改成"`users` 整表清一遍"，第一条红的是这里，
        # 而不是某个人的数据莫名其妙没了。
        other = User(openid="o_del_all_stranger", generation=1, account_id=None)
        db.add(other)
        db.commit()
        _seed_every_table(db, other)
        uid, other_uid, account_id = user.id, other.id, account.id
        assert sum(_rows_left_for(db, uid).values()) >= 5, "种子没塞进去，下面那句就是空判"
        # 删除**之前**把这个人名下的行数、举报行数、以及这条 account 名下的行数各抄一份：
        # 删完之后库里问不到"少了多少"，只能靠这一份快照和回体对账。
        before = _rows_left_for(db, uid)
        before_acct = _rows_left_for_account(db, account_id)
        reports_t = ShareReport.__table__
        before_reports = len(db.connection().execute(
            reports_t.select().where(reports_t.c.token == f"seed-{uid}")).fetchall())
        resp = _delete(client, account)
        assert resp.status_code == 200, resp.text
        # 这里不调 `_reload`：`_rows_left_for` 发的是 Core `Table.select()`，每一发都真去库里读。
        bad = {k: v for k, v in _rows_left_for(db, uid).items() if v}
        assert not bad, f"这些表还留着这个人的行：{bad}"
        bad2 = {k: v for k, v in _rows_left_for_account(db, account_id).items() if v}
        assert not bad2, f"这些表还留着这条 account 的行：{bad2}"
        assert db.query(User).filter(User.id == uid).count() == 0
        assert db.query(Account).filter(Account.id == account_id).count() == 0
        assert sum(_rows_left_for(db, other_uid).values()) >= 5, \
            "范围外那个人（account_id 为空）的数据被带走了"

        # 回体必须**恰好等于**这次真少掉的那些行：少一格是"有一张表没人管"，多一格是"数了
        # 别人的行"。`link_codes` 那一格当初就是被这样抓出来的——种子给别的 account 也发了
        # 一枚码，而 `purge` 按 account_id 清，于是回体报 0、库里真少的也是 0，两边一起漏。
        deleted = resp.json()["deleted"]
        want = {_key_for(t): before[t] for t in before}
        want["reports"] = before_reports
        want["identities"] = before_acct["account_identities"]
        want["link_codes"] = before_acct["link_codes"]
        want["account"] = 1
        assert set(deleted) == set(want), \
            f"回体的键集合与库里真少的那批不一致：多了 {sorted(set(deleted) - set(want))}、" \
            f"少了 {sorted(set(want) - set(deleted))}"
        assert {k: (deleted[k], want[k]) for k in want if deleted[k] != want[k]} == {}, \
            {k: (deleted[k], want[k]) for k in want if deleted[k] != want[k]}

    def test_名下的短码一起带走(self, client, db):
        """死账号名下的码留着，它还能被 redeem 一次，而 `find_usable` 会查出 `account_id`
        指向一行已经不存在的 account——那时能给的只有 500。`merge_into` 早就钉了同一句话；
        这一条量的是**删除那一路以前漏着**的（`/api` 那条写这张表之前它还不存在）。"""
        user, account = _wechat_person(db, openid="o_del_code")
        _code(db, account)
        assert db.query(LinkCode).count() == 1
        assert _delete(client, account).status_code == 200
        assert db.query(LinkCode).count() == 0, "删了账号，名下那枚还能用一次的码还留着"

    def test_小程序那条注销也不留死账号名下的码(self, client, db):
        """同一条洞，在**已经上线**的那一路上钉一遍：两个口共用 `purge`，所以修一次两边都好了
        ——但判据必须两边都有，否则下一轮有人把公共函数拆开复制，只有一边会红。"""
        user, account = _wechat_person(db, openid="o_del_code_api")
        _code(db, account)
        resp = client.post("/api/user/deactivate", json={"confirm": True},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 200, resp.text
        assert db.query(LinkCode).count() == 0

    def test_收到的举报跟着那份公开一起消失(self, client, db):
        """`share_reports` 只挂 token、不挂外键（刻意：撤掉的码也要收得到举报），
        所以它必须用删 shares **之前**抄的那份清单来清——晚抄一行都问不到。"""
        user, account = _wechat_person(db, openid="o_del_report")
        _seed_every_table(db, user)
        assert db.query(ShareReport).count() == 1, "种子没塞成"
        assert _delete(client, account).status_code == 200
        assert _reload(db).query(ShareReport).count() == 0

    def test_file_ids_带回三处对象并去重保序(self, client, db):
        """配图 + 卡片 + 名片四格**并成一份**（客户端只读 `file_ids` 这一个键）。
        顺序也钉：这份清单是客户端照着删的，乱序不算错但"重复"是错的（同一对象删两次
        在客户端那侧是一句失败日志）。"""
        user, account = _wechat_person(db, openid="o_del_files")
        _seed_every_table(db, user)
        got = _delete(client, account).json()["file_ids"]
        assert got == ["cloud/a.png", "cloud/c.png", "cloud/p1.png"], got
        assert len(got) == len(set(got)), f"清单里有重复：{got}"

    def test_没确认时一行都不许少(self, client, db):
        """400 那一趟不是"没删多少"，是**一张表都没碰**。

        原来这里写的是 `sum(...) >= 5`：跨七张表的一个总数下界，谁少删一张、另一张多留着
        都能把它糊过去（独立审 P1-3 就是抓在这一句上——docstring 承诺"一行不少"，判据
        根本没在逐张比）。现在把这个人身上**每一张认得出归属的表**删前删后各数一遍，
        逐键比相等。
        """
        user, account = _wechat_person(db, openid="o_del_confirm")
        _seed_every_table(db, user)
        uid, account_id = user.id, account.id
        _code(db, account)
        before = _person_left(db, uid=uid, account_id=account_id)
        assert sum(before.values()) >= 7, f"种子没塞进去，这张表就是空判：{before}"
        resp = _delete(client, account, confirm=False)
        assert resp.status_code == 400, resp.text
        after = _person_left(db, uid=uid, account_id=account_id)
        assert after == before, {k: (before[k], after[k]) for k in before if before[k] != after[k]}
        assert db.query(User).filter(User.id == uid).count() == 1
        assert db.query(Account).filter(Account.id == account_id).count() == 1
        assert db.query(LinkCode).filter(LinkCode.used_at.is_(None)).count() == 1, "没确认也把码作废了"

    def test_删净之后连认不出_user_id_的那几张也不许留下他的行(self, client, db):
        """`invitations`（两列叫 inviter_id／invitee_id）与 `share_reports`（只挂 token）
        不在 `_user_tables()` 那张网里，所以"一次删净"这句话原本只在那七张上成立。
        这一条把网补上：删完之后，按 `_person_left` 那份名单逐张数，这个人身上剩几行都是错。
        """
        inviter, _ia = _wechat_person(db, openid="o_del_residue_inviter")
        inviter.quota_bonus = 10
        user, account = _wechat_person(db, openid="o_del_residue")
        db.commit()
        db.add(Invitation(inviter_id=inviter.id, invitee_id=user.id, reward=3))
        _seed_every_table(db, user)
        db.commit()
        uid, account_id, inviter_id = user.id, account.id, inviter.id
        before = _person_left(db, uid=uid, account_id=account_id)
        assert before["invitations"] == 1 and before["share_reports"] == 1, \
            f"这两张表根本没被塞进行：{before}"
        assert _delete(client, account).status_code == 200
        left = _person_left(db, uid=uid, account_id=account_id)
        assert not {k: v for k, v in left.items() if v}, f"删过之后还留着他的行：{left}"
        # 邀请人那一行是**别人**，他不许被这次删除带走（数据带不走，但那条台账必须没了）。
        assert _reload(db).query(User).filter(User.id == inviter_id).one().quota_bonus == 7
        assert db.query(Invitation).count() == 0

    def test_别人名下一行都不动(self, client, db):
        user_a, account_a = _wechat_person(db, openid="o_victim")
        user_b, _account_b = _wechat_person(db, openid="o_neighbour")
        _seed_every_table(db, user_a)
        _seed_every_table(db, user_b)
        uid_b, account_b_id = user_b.id, _account_b.id
        before_b = _person_left(db, uid=uid_b, account_id=account_b_id)
        assert _delete(client, account_a).status_code == 200
        # 逐张比，不比总数：邻居的 notes 少一行、assets 多一行，`sum(...) >= 5` 那句照样绿。
        assert _person_left(db, uid=uid_b, account_id=account_b_id) == before_b, \
            "别人名下的数据被动了"
        assert _reload(db).query(User).filter(User.id == uid_b).one().account_id == account_b_id
        assert db.query(Account).filter(Account.id == account_b_id).count() == 1


class Test两个口的边界:
    def test_小程序那把老钥匙开不了删账号(self, client, db):
        user, _account = _wechat_person(db, openid="o_wrong_key")
        resp = client.delete("/v1/account", headers=_bearer(_user_token(user)))
        assert resp.status_code == 401, resp.text

    def test_小程序那一路删的实际范围是整条_account(self, client, db):
        """⚠ 这一条钉的是**会发生的事**，不是我以为的范围（独立审 P1-2）。

        `/api` 传进 `purge` 的是 `[user]`，但它同时把 `user.account_id` 交给公共函数，于是
        那条 **account 整行、它名下全部 identity、全部短码**一起走——同 account 上另一行
        登录行的归属关系被留在空气里（那一行还在，`account_id` 指着一条已经不存在的 account）。

        今天这样不算越界：一条 account 名下最多只有一行带 openid 的 `users`，那是
        `linking.redeem` 那一对一只闸管的后果，所以"这一行"与"这一条 account"同形。
        真出现第二行是阶段3 之后（`/v1` 那侧也往 `users` 写行），**那时这一档要重拍**：
        要么把 `/api` 的范围收窄成"只剩这一行时才带走 account"，要么认下"小程序点注销
        会把 iPhone 那侧的账号一起删掉"。收窄是行为变更，归站长拍，不由我在抽公共函数这一批里
        顺手做掉——所以这里钉现状，并把后果写在 `routes/user.py:deactivate_account` 的 docstring。
        """
        user_a, account = _wechat_person(db, openid="o_door_api")
        user_b = User(openid="o_door_other", generation=1, account_id=account.id)
        db.add(user_b)
        db.commit()
        _seed_every_table(db, user_b)
        uid_b, account_id = user_b.id, account.id
        resp = client.post("/api/user/deactivate", json={"confirm": True},
                           headers=_bearer(_user_token(user_a)))
        assert resp.status_code == 200, resp.text
        assert _reload(db).query(User).filter(User.id == uid_b).count() == 1, \
            "小程序那一路删过了界：把同一条 account 上别人的登录行带走了"
        assert sum(_rows_left_for(db, uid_b).values()) >= 5, "别人名下的笔记被带走了"
        # ↓ 这三句是"实际范围"那一半：account 与身份行确实被带走了，兄弟行因此悬空。
        assert db.query(Account).filter(Account.id == account_id).count() == 0
        assert db.query(AccountIdentity).filter(AccountIdentity.account_id == account_id).count() == 0
        assert _reload(db).query(User).filter(User.id == uid_b).one().account_id == account_id, \
            "悬空这一件事没人钉：范围哪天收窄了，这条会红，那时就该重拍上面那段"

    def test_v1_那一路删的是整条_account_名下所有登录行(self, client, db):
        """⚠ 这一条故意把第三行摆成 `openid=NULL`：那正是阶段3 之后 iPhone 那个人自己的行。
        如果删除那一路图省事复用 `linking.users_of`（那道闸门用它是对的——它问的是
        "还有没有**别的真人微信**挂在这里"），这一行就会被留下，而它 `account_id` 指的是一条
        已经删掉的 account。反向验证 I 就是钉在这一句上：撤掉 NULL 那一半必须红。"""
        user_a, account = _wechat_person(db, openid="o_door_v1")
        user_b = User(openid="o_door_v1_other", generation=1, account_id=account.id)
        user_c = User(openid=None, generation=1, account_id=account.id)
        db.add_all([user_b, user_c])
        db.commit()
        ids = (user_a.id, user_b.id, user_c.id, account.id)
        assert _delete(client, account).status_code == 200
        assert _reload(db).query(User).filter(
            User.id.in_(ids[:3])).count() == 0, \
            "从 iPhone 删账号留下了没有 openid 的那一行：它挂的 account 已经不存在了"
        assert db.query(Account).filter(Account.id == ids[3]).count() == 0


class Test回退邀请奖励仍然算:
    def test_注销之后邀请人那笔_bonus_退回(self, client, db):
        """这段逻辑从 `/api` 原样搬进公共函数，搬错了没人拦得住：反复注册→写笔记→注销→
        再注册那个刷奖励的循环靠它兜住上限。"""
        inviter, _a = _wechat_person(db, openid="o_inviter")
        inviter.quota_bonus = 10
        db.commit()
        invitee, account = _wechat_person(db, openid="o_invitee")
        db.add(Invitation(inviter_id=inviter.id, invitee_id=invitee.id, reward=3))
        db.commit()
        inviter_id = inviter.id
        assert _delete(client, account).status_code == 200
        assert _reload(db).query(User).filter(User.id == inviter_id).one().quota_bonus == 7
        assert db.query(Invitation).count() == 0, "两个方向的邀请台账至少留了一个"


class Test那一格有值而account行没了:
    """`users.account_id` 有值、`accounts` 里那一行却没了——半截事务或手工清库留下的孤儿。

    老 `/api` 那段代码是**按那一格的值**删的，所以注销顺手把占着 openid 的身份行摘掉，
    同一个人下次登录能重新建号。抽公共函数时如果把判据换成"查不查得到那个对象"，这次自愈
    就一起没了：身份行还占着 `ux_identity_provider_uid`，`accounts.ensure_for_provider`
    读到一条指向空 account 的身份 → RuntimeError → 那个人**登录 500**，比留一行垃圾难得多。
    独立审 P1-1 抓的就是这一句；反向验证 2-2b 的 J 号针也钉在这里。
    """

    def test_注销要连带摘掉占着openid的身份行(self, client, db):
        user, account = _wechat_person(db, openid="o_orphan")
        orphan_id = account.id
        db.delete(account)          # 只撤 accounts 那一行：身份行与 users.account_id 都留着
        db.commit()
        assert db.query(AccountIdentity).count() == 1, \
            "半截账没造出来，下面那几句就不是在考自愈"

        resp = client.post("/api/user/deactivate", json={"confirm": True},
                           headers=_bearer(_user_token(user)))
        assert resp.status_code == 200, resp.text
        got = resp.json()["deleted"]
        assert got["identities"] == 1, f"身份行没被带走：{got}"
        assert got["account"] == 0, f"那一行本来就不在，回体不许报成删了一条 account：{got}"
        assert db.query(AccountIdentity).count() == 0, \
            "身份行还占着那个 openid 的唯一索引：同一个人下次登录撞 RuntimeError"

        # 自愈的**后果**，不是回里的形状：那个 openid 现在能重新建号，而且是一条新 account。
        from app.services import accounts

        rebuilt = accounts.ensure_for_provider(db, "wechat", "o_orphan")
        assert rebuilt.id != orphan_id
        assert db.query(AccountIdentity).count() == 1, "建新号时没补回身份行"


class Test外键强制下这一路走得通:
    def test_两张引用notes的表在v1这一路都不许挡路(self, fk_db, client):
        """`test_account_and_identity.py::Test注销走得通外键那套语义` 只钉了 `/api` 那一路、
        只钉了 `shares.note_id` 这一半。缺的两半都在这条上补：

        - `jobs.note_id`（`models/job.py:17`）同样是**声明了的外键**，撤掉 `_BUSINESS_TABLES`
          里"先子后父"的 job 那一半，老那把尺子照样绿；
        - 一个人名下**多行 `users`** 只在 `/v1` 这一路才删得到，而 `Job` 故意挂在第二行名下——
          只清第一行的实现会留下一行引用着已删 notes 的 job。

        默认那台 `/tmp/tumaibiji_pytest.db` 不执行外键（SQLite 默认关，`db/database.py`
        也没开那条 PRAGMA），所以这一条必须换到 `fk_db` 那台上跑。
        """
        from app.core.auth import get_current_account
        from app.db.database import get_db
        from app.main import app
        from app.services import accounts

        u1 = User(id=911, openid="o_fk_v1", generation=1)
        u2 = User(id=912, openid=None, generation=1)     # 阶段3 之后 iPhone 那个人自己的行
        fk_db.add_all([u1, u2])
        fk_db.commit()
        account = accounts.ensure_for_user(fk_db, u1)
        u2.account_id = account.id
        note = Note(id=913, user_id="911", title="外键这一趟", source_type="manual")
        fk_db.add(note)
        fk_db.commit()
        fk_db.add(Share(user_id="911", note_id=913, token="tk_fk_v1", is_active=True))
        fk_db.add(Job(user_id="912", note_id=913, job_type="ocr", status="done"))
        fk_db.commit()

        # 这一条用的是 `fk_db` 自己（`get_db` 被指到这台外键真开着的库），所以请求与用例同会话，
        # 不存在"两个会话读到旧快照"那一类假绿；下面那句 expire_all 只是卫生。
        app.dependency_overrides[get_db] = lambda: fk_db
        app.dependency_overrides[get_current_account] = lambda: account
        try:
            resp = client.delete("/v1/account?confirm=true")
            assert resp.status_code == 200, \
                f"外键真被强制时这一路没走通：{resp.status_code} {resp.text}"
        finally:
            app.dependency_overrides.clear()

        deleted = resp.json()["deleted"]
        assert deleted["shares"] == 1 and deleted["jobs"] == 1, deleted
        fk_db.expire_all()
        assert fk_db.query(Note).count() == 0, "notes 没删干净"
        assert fk_db.query(Share).count() == 0
        assert fk_db.query(Job).count() == 0, "第二行名下的 job 留下了，它一直引用着 notes"
        assert fk_db.query(User).count() == 0, "第二行（openid 为空）没被带走"
        assert fk_db.query(Account).count() == 0


class Test删掉最后一行人之后:
    """`/v1` 这一路能把 `users` **整张表清空**——这是代次机制的一个盲区，说清它靠哪一半。

    `login_or_register` 给新人取的代次是"全表 max + 1"，空表上就是 1；老钥匙比的是
    `sub`(=`users.id`) + `gen` 两格。两格同时撞回去才出事，所以这一路的成立条件是：
    **同一个 id 被还给下一个人**。这一句按引擎不一样（下面第一条把 DDL 编出来实测，
    不是引用谁的说明书）。
    """

    def test_自证两张引擎上id会不会被还回来(self):
        """不连库，只把建表语句编出来看：Postgres 出的是 `id SERIAL NOT NULL`，
        SQLite 出的是 `id INTEGER NOT NULL`（那一列就是 rowid）。SERIAL 背后的序列只增不减，
        删过的人不会把 id 还回来；SQLite 空表上重新从 1 开始。
        第二条那句"撞得上/撞不上"的分岔前提就是这一句。"""
        from sqlalchemy.dialects import postgresql, sqlite
        from sqlalchemy.schema import CreateTable

        pg = str(CreateTable(User.__table__).compile(dialect=postgresql.dialect()))
        lt = str(CreateTable(User.__table__).compile(dialect=sqlite.dialect()))
        assert "id SERIAL" in pg, pg[:120]
        assert "id INTEGER NOT NULL" in lt and "SERIAL" not in lt, lt[:120]

    @pytest.mark.xfail(
        strict=False,
        reason="已知风险，不是「这样对」：SQLite 上删空 users 之后 id 会还给下一个人、代次回到 1，"
               "于是被删那人那把 7 天有效的旧 `/api` 钥匙开得到新人的行。"
               "Postgres（现网 `.env` 读到的地址）上 id 不复用，这条走 skip 分支。"
               "修法要一张持久代次计数器（或让注销不许清空整张表），属行为变更——"
               "已记入 docs/产品需求.md 阶段2-2b 回执的待拍，站长拍之前这条保持 xfail。",
    )
    def test_被删那人那把旧钥匙不许开新人的门(self, client, db, monkeypatch):
        from app.core import auth as auth_core

        user, account = _wechat_person(db, openid="o_last")
        old_id, old_gen = user.id, user.generation
        old_token = _user_token(user)
        assert _delete(client, account).status_code == 200
        assert db.query(User).count() == 0, "上面那句没真把最后一行人带走，这条量的就不是空表"

        async def fake(code):
            return {"openid": "o_fresh_next", "session_key": "sk", "unionid": None}

        monkeypatch.setattr(auth_core, "_wechat_code2session", fake)
        # 走真那条注册路（不是把 `login_or_register` 的算法手抄一遍）：代次那一格由它自己算。
        assert client.post("/api/auth/wechat", json={"code": "fresh"}).status_code == 200
        fresh = _reload(db).query(User).filter(User.openid == "o_fresh_next").one()
        assert fresh.generation == old_gen == 1, \
            f"代次没回到 1（{fresh.generation}），这一条的推论前提变了，重写它"
        if fresh.id != old_id:
            pytest.skip(f"这台引擎上 id 不会被还回来（新 id={fresh.id}，旧 id={old_id}），"
                        "代次撞回去也开不了门——SQLite 之外就是这一支")
        resp = client.get("/api/user/quota", headers=_bearer(old_token))
        assert resp.status_code == 401, \
            f"旧钥匙开得了新人的门：{resp.status_code} {resp.text}"

