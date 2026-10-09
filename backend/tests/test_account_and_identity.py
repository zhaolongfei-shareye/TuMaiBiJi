"""accounts / account_identities：「人」这张表的四条不变量。

① 迁移把每一个**当时存在的**用户回填成一个 account ＋ 一条 (wechat, openid) 身份，
   `verified_at` 不给留 null（他们那串 openid 本来就是 code2session 换回来的）。
② 迁移之后新建的用户也要有 account —— 靠登录那一路每次都过一遍 `ensure_for_user`，
   而它是幂等的：第二次登录不许再多建一个 account（多建就是同一个人两份数据）。
③ `(provider, provider_uid)` 那个唯一索引必须真的挡得住：挡不住，Apple 签名校验
   通过两次就会建出两个 account，两个人各自看着一份不同的笔记，而谁都以为是自己那份丢了。
④ 注销要连 account 与身份一起删。不删的后果不是留垃圾行：那个 openid 会一直被唯一索引占着，
   同一个人重新注册时插第二条身份直接撞库 —— 现仓那条「注销后同一个 openid 能开出干净的
   新账号」的不变量会被这张新表破掉。

迁移那两条走**真 alembic**（子进程、一次性 sqlite 文件），理由和
`test_quota_and_invite.py::Test迁移与模型对齐` 同一句：用例建表走 create_all、线上建表走
alembic，两条路对不上一句都不红。这里连回填一起真跑，不拿 ORM 造假回填。
"""
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy.exc import IntegrityError

# ⚠ 建表那一句（`Base.metadata.create_all`）只看得见"这一刻已经被 import 的模型"。本文件
# 原先把模型 import 全放在夹具与用例体内，于是**单独跑这个文件**时 accounts / account_identities
# 两张表还没进 metadata，夹具里那句 DELETE 直接报 no such table（10-09 实测到的假红，
# 整批跑时靠别的模块先 import 过才看不出来）。像本仓其他测试文件一样在文件头挂上。
from app.models.account import Account, AccountIdentity  # noqa: F401,E402
from app.models.user import User  # noqa: F401,E402

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _alembic(db_file: Path, target: str) -> None:
    env = dict(os.environ, DATABASE_URL=f"sqlite:///{db_file}")
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", target],
        cwd=str(BACKEND_ROOT), env=env, check=True, capture_output=True, text=True,
    )


def _seed_users(db_file: Path, openids: list[str]) -> None:
    conn = sqlite3.connect(db_file)
    for i, openid in enumerate(openids, start=1):
        conn.execute(
            "insert into users (id, openid, generation, quota_bonus) values (?, ?, ?, 0)",
            (i, openid, i),
        )
    conn.commit()
    conn.close()


def _fresh_shared_session():
    """那枚共享测试库上的三张表**先删后建**，再开一个会话。

    光 `create_all` 不够：它见表已存在就一个字都不动，于是这一档用例量到的是
    **上一轮留在库里的那套约束**，不是这一轮的模型——10-09 反向验证把模型里那道唯一索引整条摘掉、
    用例照样绿，就是栽在这儿。删了再建，"库里有没有这道约束"才只可能由现在这份模型决定。
    """
    from app.db.database import Base, SessionLocal, engine
    from app.models.account import Account, AccountIdentity
    from app.models.user import User

    Base.metadata.drop_all(
        bind=engine, tables=[AccountIdentity.__table__, Account.__table__, User.__table__]
    )
    # 建表建**全套**：注销那条路要读 assets / notes / shares 那些邻居，只建这三张会让路由
    # 红在 `no such table: assets` 上——那是环境缺表，不是代码错。
    Base.metadata.create_all(bind=engine)
    return SessionLocal()


class Test迁移回填:
    def test_每个老用户一个account并带一条微信身份(self, tmp_path):
        db_file = tmp_path / "mig.db"
        _alembic(db_file, "f1b3c8a05d27")        # 我这一条之前的那版库
        _seed_users(db_file, ["o_aaa", "o_bbb"])
        _alembic(db_file, "head")                # 带上这次的新表

        conn = sqlite3.connect(db_file)
        accounts = conn.execute("select count(*) from accounts").fetchone()[0]
        identities = conn.execute(
            "select account_id, provider, provider_uid, verified_at from account_identities "
            "order by provider_uid"
        ).fetchall()
        # 三张表连着查一遍"这个人挂的那个 account 上，确实是他自己那条微信身份"。
        # 只数 users.account_id 非空是不算数的：它可以指向别人的 account。
        joined = conn.execute(
            "select u.openid, i.provider, i.provider_uid from users u "
            "join accounts a on a.id = u.account_id "
            "join account_identities i on i.account_id = a.id order by u.openid"
        ).fetchall()
        conn.close()

        assert accounts == 2, f"两个人该有两个 account，实际 {accounts}"
        assert joined == [("o_aaa", "wechat", "o_aaa"), ("o_bbb", "wechat", "o_bbb")], \
            f"回填挂错了人或挂空了：{joined}"
        assert [(i[1], i[2]) for i in identities] == [("wechat", "o_aaa"), ("wechat", "o_bbb")]
        # 回填那句「平台确认过」必须一起给上；留 null 会让每个老用户看起来像绑了没验。
        assert all(i[3] for i in identities), f"verified_at 留了 null：{identities}"

    def test_每个人挂的那个account自己查得到(self, tmp_path):
        """users 那一列故意不建外键，所以"account_id 指着一行不存在的 account"这件事
        库里挡不住 —— 这条断言把它钉在用例层：两边必须一字不差对得上。
        """
        db_file = tmp_path / "mig.db"
        _alembic(db_file, "f1b3c8a05d27")
        _seed_users(db_file, ["o_aaa", "o_bbb", "o_ccc"])
        _alembic(db_file, "head")

        conn = sqlite3.connect(db_file)
        orphans = conn.execute(
            "select u.id, u.account_id from users u "
            "left join accounts a on a.id = u.account_id where u.account_id is not null and a.id is null"
        ).fetchall()
        dangling = conn.execute(
            "select i.account_id from account_identities i "
            "left join accounts a on a.id = i.account_id where a.id is null"
        ).fetchall()
        ids = conn.execute("select count(distinct account_id) from users").fetchone()[0]
        conn.close()
        assert orphans == [], f"account_id 指向不存在的 account：{orphans}"
        assert dangling == [], f"身份挂在不存在的 account 上：{dangling}"
        assert ids == 3

    def test_真迁移建出来的库里同一个人也建不出第二条身份(self, tmp_path):
        """唯一索引这件事不能只由 create_all 那一路钉，线上建表走的是 alembic。
        缺口是 10-09 反向验证挖出来的：把迁移里那句 `unique=True` 摘掉，
        `compare_metadata` 那把尺子（test_quota_and_invite.py::Test迁移与模型对齐）
        看不见索引的 unique 属性，整批 588 条全绿。所以这一条不看 metadata diff，
        直接往真迁移建出来的库里把同一个平台的同一个人插两次，问库挡不挡。
        """
        db_file = tmp_path / "mig.db"
        _alembic(db_file, "head")

        conn = sqlite3.connect(db_file)
        conn.execute("insert into accounts (id) values ('aaaaaaaa-1111-1111-1111-111111111111')")
        conn.execute(
            "insert into account_identities (account_id, provider, provider_uid) "
            "values ('aaaaaaaa-1111-1111-1111-111111111111', 'apple', '000827.1f')"
        )
        conn.execute("insert into accounts (id) values ('bbbbbbbb-1111-1111-1111-111111111111')")
        conn.commit()
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "insert into account_identities (account_id, provider, provider_uid) "
                "values ('bbbbbbbb-1111-1111-1111-111111111111', 'apple', '000827.1f')"
            )
        conn.close()


class Test登录那一路:
    @pytest.fixture
    def client(self):
        """打真实登录路由用的那个 client。限流那一道照 `test_account_deletion.py` 关掉：
        这一档用例测的是"登录后有没有 account"，不是闸门本身。
        """
        from fastapi.testclient import TestClient

        from app.main import app

        app.state.limiter.enabled = False
        with TestClient(app) as c:
            yield c
        app.state.limiter.enabled = True

    @pytest.fixture
    def db(self):
        session = _fresh_shared_session()
        try:
            yield session
        finally:
            session.close()

    @pytest.fixture
    def clean(self, db):
        from app.models.account import Account, AccountIdentity
        from app.models.user import User

        db.query(AccountIdentity).delete()
        db.query(Account).delete()
        db.query(User).delete()
        db.commit()

    def test_新用户第一次登录就有account(self, db, clean):
        from app.models.account import Account, AccountIdentity
        from app.models.user import User
        from app.services.accounts import ensure_for_user

        user = User(openid="o_new", generation=1)
        db.add(user)
        db.commit()
        db.refresh(user)

        account = ensure_for_user(db, user)
        assert user.account_id == account.id
        assert db.query(Account).count() == 1
        identities = db.query(AccountIdentity).all()
        assert [(i.provider, i.provider_uid) for i in identities] == [("wechat", "o_new")]
        assert identities[0].verified_at is not None

    def test_第二次登录不许再多建一个account(self, db, clean):
        """幂等这句不是洁癖：登录每次都过的话，不幂等就是每登录一次多一个 account，
        而这个人自己的数据会被摊进越来越多的"人"里。
        """
        from app.models.account import Account
        from app.models.user import User
        from app.services.accounts import ensure_for_user

        user = User(openid="o_twice", generation=1)
        db.add(user)
        db.commit()
        first = ensure_for_user(db, user)
        again = ensure_for_user(db, user)

        assert again.id == first.id
        assert db.query(Account).count() == 1
        db.expunge_all()
        assert db.get(User, user.id).account_id == first.id

    def test_account_id指着不存在的行时要报错而不是悄悄新建(self, db, clean):
        """这一支是"数据坏了"，不是"还没建"。悄悄新建等于把这个人挂到第二个身份上，
        两份笔记各归各家，而且没有任何一处会响。
        """
        from app.models.user import User
        from app.services.accounts import ensure_for_user

        user = User(openid="o_broken", generation=1, account_id="00000000-0000-0000-0000-000000000000")
        db.add(user)
        db.commit()

        with pytest.raises(RuntimeError):
            ensure_for_user(db, user)

    def test_走真登录路由进来的那个人也有account(self, client, db, clean, monkeypatch):
        """上面几条都是直接调 `ensure_for_user`，所以**它们测不到 `app/core/auth.py` 里那句调用**。
        把那一行删掉，这几条一条都不会红：新用户照常拿到 token、照常写笔记，
        只是库里永远没有他的 account —— 等 iPhone 用 SIWA 那天按 account 找人，
        才发现微信这批人一个都不在表里。这一条就是钉那一句调用的。
        """
        from app.core import auth as auth_core
        from app.models.account import Account, AccountIdentity
        from app.models.user import User

        async def fake(code):
            return {"openid": "o_route", "session_key": "k"}

        monkeypatch.setattr(auth_core, "_wechat_code2session", fake)
        resp = client.post("/api/auth/wechat", json={"code": "whatever"})
        assert resp.status_code == 200, resp.text

        db.expunge_all()
        user = db.query(User).filter(User.openid == "o_route").first()
        assert user is not None, "登录路由没落出人"
        assert user.account_id, "走登录路由进来的用户没有 account（auth.py 里那一句没生效）"
        assert db.query(AccountIdentity).filter(
            AccountIdentity.account_id == user.account_id,
            AccountIdentity.provider == "wechat",
            AccountIdentity.provider_uid == "o_route",
        ).count() == 1
        assert db.query(Account).filter(Account.id == user.account_id).count() == 1


class Test唯一索引:
    @pytest.fixture
    def db(self):
        # 走 `_fresh_shared_session`：先删后建，库里那道唯一约束才只可能来自现在这份模型定义
        # （只 `create_all` 的话，表在上一轮就建好了，这一轮把模型里的索引整条摘掉也测不出来）。
        session = _fresh_shared_session()
        try:
            yield session
        finally:
            session.close()

    def test_同一个平台的同一个人建不出第二条身份(self, db):
        from app.models.account import Account, AccountIdentity

        a1 = Account(id="11111111-1111-1111-1111-111111111111")
        a2 = Account(id="22222222-2222-2222-2222-222222222222")
        db.add_all([a1, a2])
        db.flush()
        db.add(AccountIdentity(account_id=a1.id, provider="apple", provider_uid="000827.1f"))
        db.flush()
        db.add(AccountIdentity(account_id=a2.id, provider="apple", provider_uid="000827.1f"))
        with pytest.raises(IntegrityError):
            db.flush()

    def test_同一个人挂两个平台是可以的(self, db):
        """反面：唯一索引只管"同一个平台的同一个人"。把跨平台也一起挡住了，
        「iPhone 用 SIWA、小程序用微信、两边同一个人」那句验收就永远做不到。
        """
        from app.models.account import Account, AccountIdentity

        account = Account(id="33333333-3333-3333-3333-333333333333")
        db.add(account)
        db.flush()
        db.add_all([
            AccountIdentity(account_id=account.id, provider="wechat", provider_uid="o_multi"),
            AccountIdentity(account_id=account.id, provider="apple", provider_uid="000827.2f"),
        ])
        db.commit()
        assert db.query(AccountIdentity).filter(AccountIdentity.account_id == account.id).count() == 2


class Test注销连带:
    """这张新表把现仓那条「注销之后同一个 openid 能开出一个干净的新账号」顶到了危险边上：
    身份行留着，`(provider, provider_uid)` 那个唯一索引就一直占着那个 openid，
    下一次注册插第二条身份会直接撞库。所以注销必须连 account 与身份一起删。
    """

    @pytest.fixture
    def db(self):
        session = _fresh_shared_session()
        try:
            yield session
        finally:
            session.close()

    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient

        from app.main import app

        # 注销那条口上挂着 5/分钟 的闸（`@limiter.limit`），而这一份文件一个人就要打三趟，
        # 加上同批别的文件也打，固定窗口一算就 429。口径照抄 `test_account_deletion.py`
        # 那个夹具：这一档用例测的是**连带删了什么**，不是限流本身。
        app.state.limiter.enabled = False
        with TestClient(app) as c:
            yield c
        app.state.limiter.enabled = True

    @pytest.fixture
    def one(self, db):
        from app.models.account import Account, AccountIdentity
        from app.models.user import User
        from app.services.accounts import ensure_for_user

        db.query(AccountIdentity).delete()
        db.query(Account).delete()
        db.query(User).delete()
        db.commit()
        user = User(openid="o_bye", generation=1)
        db.add(user)
        db.commit()
        account = ensure_for_user(db, user)
        return user, account

    def test_注销把account与身份一起删掉(self, client, db, one):
        from app.core.auth import _create_token
        from app.models.account import Account, AccountIdentity
        from app.models.user import User

        user, account = one
        # 在**发请求之前**把 id 抄成普通字符串：注销那一路 commit 过，`account` 这个对象上的
        # 属性全被标脏，而下面 `expunge_all()` 一 detach 就再也没法回头读它
        # （10-09 实测：`DetachedInstanceError`，报的是"读不到 id"，看着像注销没生效）。
        # 判"那一行没了"要的是一串值，不是一个可能已经读不出值的对象。
        account_id = account.id
        resp = client.post(
            "/api/user/deactivate", json={"confirm": True},
            headers={"Authorization": f"Bearer {_create_token(user.id, user.generation)}"},
        )
        assert resp.status_code == 200, resp.text

        # 存在性一律走 query 而不是 db.get：夹具这一会话里缓存着那些对象，
        # db.get 命中身份映射会把"内存里还有"当成"库里还有"（同 test_account_deletion 那条口径）。
        db.expunge_all()
        assert db.query(Account).filter(Account.id == account_id).count() == 0, "account 行留着"
        assert db.query(AccountIdentity).filter(
            AccountIdentity.provider_uid == "o_bye").count() == 0, "微信身份还占着那个 openid"
        assert db.query(User).filter(User.openid == "o_bye").count() == 0

    def test_注销之后同一个openid能干净重开(self, client, db):
        """这才是那条不变量的正面：不撞唯一索引，而且新开的人拿到的是**他自己的**新 account。
        """
        from app.core.auth import _create_token
        from app.models.account import Account, AccountIdentity
        from app.models.user import User
        from app.services.accounts import ensure_for_user

        db.query(AccountIdentity).delete()
        db.query(Account).delete()
        db.query(User).delete()
        db.commit()

        first = User(openid="o_reuse", generation=1)
        db.add(first)
        db.commit()
        first_account = ensure_for_user(db, first).id

        resp = client.post(
            "/api/user/deactivate", json={"confirm": True},
            headers={"Authorization": f"Bearer {_create_token(first.id, first.generation)}"},
        )
        assert resp.status_code == 200, resp.text
        db.expunge_all()

        second = User(openid="o_reuse", generation=2)
        db.add(second)
        db.commit()
        second_account = ensure_for_user(db, second).id   # 撞索引就在这里响

        assert second_account != first_account, "复用了已注销那个人的 account"
        # 旧的那一行**该**被删掉（注销的定义就是删净），所以这里不能数"库里攒了两个 account"——
        # 那句会把正确行为判成错。要钉的是：已注销那个人不再有 account，而活着的那个只有一个身份。
        assert db.query(Account).filter(Account.id == first_account).count() == 0, \
            "注销之后旧 account 还在"
        assert db.query(AccountIdentity).filter(AccountIdentity.provider_uid == "o_reuse").count() == 1


class Test没有微信的那个人:
    """`users.openid` 放开可空（迁移 d5a3f19bc728）这一刀的两面。

    只有 Apple 身份的人给不出 openid，硬填等于替他编一串微信 id 冒名（契约 §十一 第 2 条），
    所以那一列必须能空。但"放开可空"顺手动的是**同一列上的 unique**，而那道闸门管的是另一句
    话：同一个微信号开不出两个账号。所以正反各钉一条，再钉一条"是这次迁移放开的、不是历来如此"。

    三条都走真 alembic 建出来的库，不走 create_all：用例那条路上 nullable 由模型说了算，线上由
    迁移说了算，两边各测各的才算两边都钉住（同一族缺口见上面唯一索引那条）。
    """

    def test_迁移之后同一个微信号仍然插不进第二条(self, tmp_path):
        db_file = tmp_path / "mig.db"
        _alembic(db_file, "head")

        conn = sqlite3.connect(db_file)
        conn.execute("insert into users (id, openid, generation) values (1, 'o_dup', 1)")
        conn.commit()
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("insert into users (id, openid, generation) values (2, 'o_dup', 2)")
        conn.close()

    def test_迁移之后两个只有Apple身份的人互不挡住(self, tmp_path):
        db_file = tmp_path / "mig.db"
        _alembic(db_file, "head")

        conn = sqlite3.connect(db_file)
        conn.execute("insert into users (id, openid, generation) values (1, NULL, 1)")
        conn.execute("insert into users (id, openid, generation) values (2, NULL, 2)")
        conn.commit()
        assert conn.execute(
            "select count(*) from users where openid is null"
        ).fetchone()[0] == 2, "两个只有 Apple 身份的人不该互相挡住"
        conn.close()

    def test_迁移之前那版库插不进没有微信的人(self, tmp_path):
        """反向钉：这一条红不红决定上面那条是不是在测一个本来就成立的事实。"""
        db_file = tmp_path / "mig.db"
        _alembic(db_file, "b7d2f4a1c903")      # 这次放开的**前**一版

        conn = sqlite3.connect(db_file)
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("insert into users (id, openid, generation) values (1, NULL, 1)")
        conn.close()

    @pytest.fixture
    def fresh_db(self, tmp_path):
        """另开一个一次性库、按**当前模型**建表。理由与 Test唯一索引 那个夹具同一个：
        那枚共享测试库里的 users 可能是上一轮按旧的 nullable=False 建的，而 `create_all`
        见表已存在就不动它——那样这条会红在环境上，不是红在代码上。
        """
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        from app.db.database import Base
        import app.models  # noqa: F401  全部模型进 metadata，建出来的才是当前这一版表形

        engine = create_engine(f"sqlite:///{tmp_path / 'fresh.db'}")
        Base.metadata.create_all(engine)
        session = sessionmaker(bind=engine)()
        try:
            yield session
        finally:
            session.close()
            engine.dispose()

    def test_只有Apple身份的人走微信那一支要当场响(self, fresh_db):
        """`ensure_for_user` 是新加的那道守卫的落点：它只写微信那一条身份。"""
        from app.services.accounts import ensure_for_user

        person = User(openid=None, generation=1)
        fresh_db.add(person)
        fresh_db.commit()

        with pytest.raises(RuntimeError, match="没有 openid"):
            ensure_for_user(fresh_db, person)
        # 报错那一趟不许已经顺手建出一个 account（半个人的账比没账难查）。
        assert fresh_db.query(Account).count() == 0


class Test注销走得通外键那套语义:
    """注销那条级联必须在**外键真被强制**的引擎上走得通。

    SQLite 默认不执行外键，而 `app/db/database.py` 里没有开 `PRAGMA foreign_keys`——所以整批
    用例跑的是"删 notes 时引用它的 shares/jobs 还挂着"这件事**没人追究**的那套语义，
    Postgres 是要追究的。这一条把外键开起来、走真路由，把两种语义之间那道缝补上：
    顺序错了它当场 500，而不是等某个分享过笔记的人在自己手机上点注销才发现。
    """

    @pytest.fixture
    def fk_db(self, tmp_path):
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

    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient

        from app.main import app

        app.state.limiter.enabled = False
        with TestClient(app) as c:
            yield c
        app.state.limiter.enabled = True

    def test_分享过的笔记注销那一趟不能撞外键(self, fk_db, client):
        from app.core.auth import _create_token, get_current_user
        from app.db.database import get_db
        from app.main import app
        from app.models.note import Note
        from app.models.share import Share
        from app.models.share_report import ShareReport
        from app.models.user import User
        from app.services.accounts import ensure_for_user

        fk_db.add(User(id=77, openid="o_fk", generation=1))
        fk_db.add(Note(id=88, user_id="77", title="要分享的笔记", source_type="manual"))
        fk_db.commit()
        user = fk_db.get(User, 77)
        account = ensure_for_user(fk_db, user)
        # 先把 id 抄成一个字符串：注销把那行删掉之后，手里这个 ORM 对象再读 `.id` 会抛
        # ObjectDeletedError——那时判据红在"对象没了"，而不是红在"库里还剩一行"。
        account_id = account.id
        fk_db.add(Share(user_id="77", note_id=88, token="tk_fk", title="t", is_active=True))
        # 举报行只挂 token：注销之后它就是孤儿，而 docstring 承诺的是"删净"。
        fk_db.add(ShareReport(token="tk_fk", reason="spam"))
        fk_db.commit()

        app.dependency_overrides[get_db] = lambda: fk_db
        app.dependency_overrides[get_current_user] = lambda: user
        try:
            resp = client.post(
                "/api/user/deactivate", json={"confirm": True},
                headers={"Authorization": f"Bearer {_create_token(77, 1)}"},
            )
            assert resp.status_code == 200, f"注销这一趟没走通：{resp.status_code} {resp.text}"
        finally:
            app.dependency_overrides.clear()

        fk_db.expire_all()
        assert fk_db.query(Share).count() == 0
        assert fk_db.query(Note).count() == 0, "notes 没删干净"
        assert fk_db.query(ShareReport).filter(ShareReport.token == "tk_fk").count() == 0, \
            "举报行留下了指向已删 token 的孤儿"
        assert fk_db.query(Account).filter(Account.id == account_id).count() == 0


class Test同一个人同时登录两趟:
    def test_后到那一趟不许响也不许多建一个account(self, tmp_path):
        """`ensure_for_user` 挂在**登录主路径**上（`core/auth.py:118`）。小程序 onLaunch 重试、
        用户在启动页连点，都会让同一个人同时进来两趟：两趟都读到 account_id 为空、各建一个
        account，后提交那一趟撞 `ux_identity_provider_uid`。那一撞不是账坏了，是赢家通吃——
        所以必须认赢家；让它冒出来，那个人这次就打不开自己的笔记。
        """
        from sqlalchemy import create_engine
        from sqlalchemy.orm import Session

        from app.db.database import Base
        import app.models  # noqa: F401
        from app.models.account import Account, AccountIdentity
        from app.models.user import User
        from app.services.accounts import ensure_for_user

        engine = create_engine(f"sqlite:///{tmp_path / 'race.db'}")
        Base.metadata.create_all(engine)
        with Session(engine) as seed:
            seed.add(User(id=1, openid="o_race", generation=1))
            seed.commit()

        s1 = Session(engine)
        s2 = Session(engine)
        try:
            u1 = s1.get(User, 1)
            u2 = s2.get(User, 1)              # 两个 identity map 里各一份，都还看见 account_id=None
            a1 = ensure_for_user(s1, u1)      # 赢家
            a2 = ensure_for_user(s2, u2)      # 撞索引那一趟
            assert a2.id == a1.id, f"后到那一趟另建了一个 account：{a2.id} != {a1.id}"
            assert s1.query(Account).count() == 1, "同一个人攒出两个 account"
            assert s1.query(AccountIdentity).count() == 1, "同一个人攒出两条微信身份"
            s2.expire_all()
            assert s2.get(User, 1).account_id == a1.id, "认了赢家却没把自己挂上去"
        finally:
            s1.close()
            s2.close()
            engine.dispose()
