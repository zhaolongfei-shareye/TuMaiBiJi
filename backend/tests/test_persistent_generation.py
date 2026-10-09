"""代次水位线：`users` 被删空之后，"这张代表发过哪些号"由谁记得。

这批只管一件事——**新人拿到的代次，必须比这个 id 上辈子发出去过的每一个代次都大**。
为什么值得单独一把尺子（而不是塞进 `test_v1_account_deletion.py`）：它守的不是"删得干净"，
而是删除**之后**的那一次注册，跨两个口、跨三处代码（`services/generation`、
`core/auth.login_or_register`、`services/accounts.bump_generation`）。10-09 那条已知风险的 xfail
就红在这一句上，现已转成硬断言（见 `test_v1_account_deletion.py::Test删掉最后一行人之后`）。

钉的七件事：
1. 取号走的是库里那一格，不是"数全表 max"——两次注册各拿一个更大的号，水位线跟着留痕。
2. 库里有人号比水位线高时，取号跟**高**的那边走（`allocate` 那层 floor）。
3. `bump_generation` 抬完必须把新号记回水位线——只在注册一处喂是假防线。
4. 水位线只许往上走：一次"低代次的抬"不许把它拉回（`note` 里那句比较）。
5. 删空之后，**中间每一代发出去过的旧钥匙都开不了新人的门**（钥匙由真登录路逐代签发，不手抄）。
6. 新人注册不许把活人手里的钥匙抬废（`allocate` 只动下一个新人自己那一行）。
7. 迁移给现网插的那一行初值是**当时的最高代次**，不是 0（真跑 alembic，一次性库）。

前提自证另说：`users.id` 会不会被还给下一个人是**引擎**的事，那条 DDL 级自证在
`test_v1_account_deletion.py::test_自证两张引擎上id会不会被还回来`，这一份不重复量它。
"""
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))          # 同目录的测试模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from test_v1_account_deletion import _delete, _fresh_session  # noqa: E402
from test_v1_auth_and_link import _bearer, _reload  # noqa: E402

from app.models.account import Account  # noqa: E402
from app.models.generation_seq import GenerationSeq  # noqa: E402
from app.models.user import User  # noqa: E402


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


def _login(client, db, monkeypatch, openid):
    """走真那条注册/登录路，返回 (那一行 User, **服务端刚发的那把钥匙**)。

    用真 token 而不是自己现签一把：这一批量的正是"历史上发出去过的钥匙"，自己签只能证明
    我猜的格式对，证不了发出去的那把带的就是那个代次。
    """
    from app.core import auth as auth_core

    async def fake(code):
        return {"openid": openid, "session_key": "sk", "unionid": None}

    monkeypatch.setattr(auth_core, "_wechat_code2session", fake)
    resp = client.post("/api/auth/wechat", json={"code": "pytest"})
    assert resp.status_code == 200, resp.text
    user = _reload(db).query(User).filter(User.openid == openid).one()
    return user, resp.json()["token"]


def _watermark(db):
    return _reload(db).query(GenerationSeq).filter(GenerationSeq.key == "users").one().value


def _bump(db, account_id):
    """抬一刀代次并提交（走 `bump_generation` 那个唯一写口，不手改列）。"""
    from app.services import accounts

    fresh = db.query(Account).filter(Account.id == account_id).one()
    accounts.bump_generation(db, fresh)
    db.commit()
    return fresh


class Test取号那一格:
    def test_两次注册各拿一个更大的号(self, client, db, monkeypatch):
        u1, _t1 = _login(client, db, monkeypatch, "o_seq_1")
        assert u1.generation == 1, "空库上第一个人的号是水位线 0 + 1，而不是写死的 1"
        assert _watermark(db) == 1

        u2, _t2 = _login(client, db, monkeypatch, "o_seq_2")
        assert u2.generation == 2 > u1.generation
        assert _watermark(db) == 2, "取完号没把水位线留下，下一次注册就会撞回 1"

    def test_库里有人号比水位线高时_取号跟高那边走(self, client, db, monkeypatch):
        """这一条钉的是 `allocate` 里那层 floor，不是装饰。

        水位线可能落后于库里在用的号（迁移初值被写坏、有人手工灌过数据、那一格被 update 小了）。
        那种时候只信水位线，发出去的就是一个**当下正被人用着**的号——比撞历史号更糟。
        """
        db.add(GenerationSeq(key="users", value=0))
        db.add(User(openid="o_high", generation=50))
        db.commit()

        fresh, _token = _login(client, db, monkeypatch, "o_after_high")
        assert fresh.generation == 51, "取号跟了落后的水位线：新人的号抢在活人正在用的那一段里"


class Test删空之后还记得:
    def test_bump那一刀把水位线一起喂进去(self, client, db, monkeypatch):
        user, _token = _login(client, db, monkeypatch, "o_bump")
        from app.services import accounts

        account = accounts.ensure_for_user(db, user)
        base = user.generation
        for step in range(1, 4):
            _bump(db, account.id)
            assert _reload(db).query(User).filter(User.id == user.id).one().generation == base + step
            assert _watermark(db) == base + step, (
                f"抬到第 {step} 刀没记进水位线：删空之后新人会撞上这一发随 token 发出去过的号"
            )

    def test_删空之后中间每一代发过的旧钥匙都开不了新人的门(self, client, db, monkeypatch):
        user, token_at_1 = _login(client, db, monkeypatch, "o_loop")
        from app.services import accounts

        account = accounts.ensure_for_user(db, user)
        account_id = account.id
        old_id = user.id
        # 这个人每合并/解绑一次都会重新登录拿新钥匙（现网小程序就是这么活的），
        # 所以"他历史上持过的号"不止一发——每一发都要单独试一次。
        tokens = [token_at_1]
        issued = [user.generation]
        for _ in range(2):
            _bump(db, account_id)
            again, new_token = _login(client, db, monkeypatch, "o_loop")
            tokens.append(new_token)
            issued.append(again.generation)
        assert len(set(issued)) == 3, f"这三发本该是三个不同的号，实测 {issued}——上面那条判据就没内容了"

        dead = db.query(Account).filter(Account.id == account_id).one()
        assert _delete(client, dead).status_code == 200
        assert _reload(db).query(User).count() == 0, "上面那句没真把最后一行人带走，这条量的就不是空表"

        fresh, fresh_token = _login(client, db, monkeypatch, "o_next_person")
        if fresh.id != old_id:
            pytest.skip(f"这台引擎上 id 不会被还回来（新 id={fresh.id}，旧 id={old_id}）——"
                        "旧钥匙指向一行根本不存在的人，代次撞不撞都开不了门。"
                        "引擎那半的自证在 test_v1_account_deletion::test_自证两张引擎上id会不会被还回来")
        assert fresh.generation > max(issued), \
            f"新人拿的号 {fresh.generation} 没越过这个人发过的最高号 {max(issued)}"

        for stale in tokens:
            resp = client.get("/api/user/quota", headers=_bearer(stale))
            assert resp.status_code == 401, (
                f"旧钥匙开得了新人的门（新人 id={fresh.id} gen={fresh.generation}）：{resp.text}"
            )
        assert client.get("/api/user/quota", headers=_bearer(fresh_token)).status_code == 200

    def test_水位线只许往上走_一次低代次的抬不回它(self, client, db, monkeypatch):
        """钉 `note` 里那句 `if value > row.value`——水位线是不减数。

        这条的前提是"库里有个号很低的人被抬了一刀"：那种号本来就在水位线下面，抬完还是下面。
        不判住它的话，`allocate` 那层 live-max floor 会**暂时**盖住后果（那些高号的人还在库里，
        取号跟着他们走），所以这一条量的不是"下一次注册会不会撞"，而是那句不变量本身——
        而不变量一旦破在某个人身上，就得靠"当时还有人在"来保，那不是防线。
        """
        from app.services import accounts

        low = None
        for i in range(10):
            user, _token = _login(client, db, monkeypatch, f"o_hist_{i}")
            if i == 1:
                low = user
        assert _watermark(db) == 10
        assert low.generation == 2, "前提：这个人现在的号在水位线下面"

        account = accounts.ensure_for_user(db, low)
        _bump(db, account.id)
        assert _reload(db).query(User).filter(User.id == low.id).one().generation == 3
        assert _watermark(db) == 10, (
            "水位线被一次低代次的抬回了 3：那一格不再记得 4~10 都随 token 发出去过"
        )

    def test_新人注册不许把活人的钥匙抬废(self, client, db, monkeypatch):
        """反面那一面：水位线只该决定**下一个新人**的号，不该扫到已经在用的人。

        要是有人把取号写成"全表 generation 一起抬"，上面几条照样全绿，而现网每个人都被踢下线。
        """
        alive, alive_token = _login(client, db, monkeypatch, "o_alive")
        _login(client, db, monkeypatch, "o_newcomer")
        assert _reload(db).query(User).filter(User.id == alive.id).one().generation == alive.generation
        assert client.get("/api/user/quota", headers=_bearer(alive_token)).status_code == 200


class Test迁移给现网插的那一行:
    def test_初值是当时的最高代次_不是零(self, tmp_path):
        """真跑 alembic，不拿 ORM 造假：升到**上一刀**、灌三行带代次的数据、再升到 head。

        为什么这一条必须存在：现网这批人手里有 7 天有效期的旧 token（实测最高代次 39），
        而"表被删空之后水位线是唯一的记忆"这句话今天就要成立。初值写成 0 的迁移在库里还有人的
        时候什么都不红（`allocate` 有 live max 兜底），要等第一次真删空才咬人。
        """
        import sqlite3
        from pathlib import Path

        root = Path(__file__).resolve().parents[1]
        db_file = tmp_path / "mig.db"
        env = dict(os.environ, DATABASE_URL=f"sqlite:///{db_file}")
        subprocess.run([sys.executable, "-m", "alembic", "upgrade", "c54bfb242620"],
                       cwd=str(root), env=env, check=True, capture_output=True, text=True)
        conn = sqlite3.connect(db_file)
        for uid, gen in (("m1", 1), ("m2", 39), ("m3", 5)):
            conn.execute("insert into users (openid, generation) values (?, ?)", (uid, gen))
        conn.commit()
        conn.close()

        subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"],
                       cwd=str(root), env=env, check=True, capture_output=True, text=True)

        conn = sqlite3.connect(db_file)
        rows = conn.execute("select key, value from generation_seq").fetchall()
        kept = conn.execute("select count(*), max(generation) from users").fetchone()
        conn.close()
        assert rows == [("users", 39)], f"那一格的初值不是当时最高代次：{rows}"
        assert kept == (3, 39), f"迁移动了 users 的行：{kept}"
