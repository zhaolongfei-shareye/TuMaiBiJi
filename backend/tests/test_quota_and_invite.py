"""邀请归因 + 「没有篇数闸门」的行为用例。

四条不变量：
① 手写 / 链接 / 截图三条入口**都不因条数拦人**。2026-09-24 站长取消 100 篇上限，
   这条从"到顶要拦住"翻成"多少条都放行"，所以这里断的是"存得进来"，而且要有
   人真去撞一次（写满一百多条）——不然谁都不知道闸门哪天又被悄悄加回去。
② 邀请只在"被邀请人写下第一篇笔记"那一刻记一笔台账，一个被邀请人一辈子只成就一次；
   重复登录、重复提交、第二条笔记都不会再记。台账不再兑换任何额度。
③ 数字只有一个来源：客户端拿 /api/user/quota，不硬编码；这个接口也不再回上限类字段。
④ 归因四条不认（没带参数 / 自己邀自己 / 已有归属 / 名下已有笔记）照旧。

限流在测试里关掉：这几个用例要打 /api/auth/wechat（5 次/分钟），而那层是 Redis 的事，
不是这里的判定逻辑。
"""
import importlib
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.api.routes import ingest as ingest_route
from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.invitation import Invitation
from app.models.note import Note
from app.models.user import User
from app.services import quota


@pytest.fixture(scope="module")
def client():
    app.state.limiter.enabled = False
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


def mk_user(db, openid, bonus=0, generation=1):
    u = User(openid=openid, quota_bonus=bonus, generation=generation)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def hdr(user):
    # 走真实登录注册出来的号，generation 是全局递增的（防 id 复用冒充），
    # 所以这里必须带上它自己的那一份，不能默认第 1 代。
    return {"Authorization": f"Bearer {_create_token(user.id, user.generation)}"}


def mk_notes(db, user, n):
    for i in range(n):
        db.add(Note(user_id=str(user.id), title=f"占位{i}", source_type="manual"))
    db.commit()


def create_note(client, user, title="一条笔记"):
    return client.post("/api/notes/", json={"title": title}, headers=hdr(user))


class Test没有篇数闸门:
    def test_写满一百零五条之后仍然存得进来(self, client, db):
        u = mk_user(db, "no-cap")
        mk_notes(db, u, 105)
        assert create_note(client, u, "第106条").status_code == 200
        assert db.query(Note).filter(Note.user_id == str(u.id)).count() == 106

    def test_链接入口不再拦人(self, client, db, monkeypatch):
        u = mk_user(db, "url-open")
        mk_notes(db, u, 105)
        enqueued = []
        monkeypatch.setattr(ingest_route, "get_queue", lambda: _Q(enqueued))
        # set_task_status 要连 Redis，测试环境没有；这里断的是"放行并且真的入了队"。
        monkeypatch.setattr(ingest_route, "set_task_status", lambda *a, **kw: None)
        resp = client.post(
            "/api/ingest/url", data={"url": "https://example.com/a"}, headers=hdr(u)
        )
        assert resp.status_code == 200, resp.text
        assert len(enqueued) == 1, "放行却没入队，用户会一直等一个不会跑的任务"

    def test_截图暂存与提交两处都不拦(self, client, db):
        u = mk_user(db, "shot-open")
        mk_notes(db, u, 105)
        staged = client.post(
            "/api/ingest/screenshots/stage",
            files={"images": ("a.png", b"\x89PNG\r\n\x1a\nfake", "image/png")},
            headers=hdr(u),
        )
        assert staged.status_code == 200, staged.text
        # 批次不存在回 404 就够说明问题了：403 才是闸门
        processed = client.post(
            "/api/ingest/screenshots/process", data={"batch_id": "nope"}, headers=hdr(u)
        )
        assert processed.status_code == 404

    def test_闸门模块和那几个常量都不存在了(self):
        """把"闸门已被拆除"钉成断言：谁想加回去，得先让这几条红一次。"""
        with pytest.raises(ModuleNotFoundError):
            importlib.import_module("app.core.quota_gate")
        for gone in ("ensure_room", "quota_limit", "rewarded_invites", "BASE_QUOTA",
                     "INVITE_REWARD", "MAX_REWARDED_INVITES"):
            assert not hasattr(quota, gone), f"quota.{gone} 又回来了"

    def test_三条入口的路由里没有额度依赖(self):
        for f in ("app/api/routes/ingest.py", "app/api/routes/notes.py"):
            src = open(os.path.join(os.path.dirname(__file__), "..", f), encoding="utf-8").read()
            assert "require_note_room" not in src, f"{f} 又挂回闸门了"
            assert "quota_gate" not in src, f"{f} 又 import 回闸门模块了"


class _Q:
    def __init__(self, sink):
        self.sink = sink

    def enqueue(self, *args, **kwargs):
        self.sink.append((args, kwargs))


class Test入队带上账号代数:
    """worker 那道串号闸门，靠的是入队时把 generation 一起塞进 payload。

    路由这里漏传的话，worker 收到 generation=None，会当成"部署切换期的存量 job"退回
    只查存在性——A6 整条修复就静默失效，而且一路不报错。所以这段接线得自己断一次，
    不能指望 worker 那边的用例替它兜（那些用例都是直接调函数、显式传 generation）。
    """

    class _Recorder:
        def __init__(self):
            self.calls = []

        def enqueue(self, *args, **kwargs):
            self.calls.append((args, kwargs))

    @pytest.fixture()
    def rec(self, monkeypatch):
        r = self._Recorder()
        monkeypatch.setattr(ingest_route, "get_queue", lambda: r)
        # set_task_status 要连 Redis，pytest 环境里没有；这里断的是入队参数，不是任务状态。
        monkeypatch.setattr(ingest_route, "set_task_status", lambda *a, **kw: None)
        return r

    def test_链接入口入队时带上generation(self, client, db, rec):
        u = mk_user(db, "wire-url", generation=7)

        resp = client.post("/api/ingest/url", data={"url": "https://example.com/a"}, headers=hdr(u))
        assert resp.status_code == 200, resp.text

        assert len(rec.calls) == 1
        args = rec.calls[0][0]
        assert args[0] == "app.tasks.ingest_tasks.process_url_task"
        assert args[2] == str(u.id)
        assert 7 in args, f"入队参数里没带上账号代数，worker 会退回只查存在性：{args}"

    def test_截图入口入队时带上generation(self, client, db, rec):
        u = mk_user(db, "wire-shot", generation=9)

        staged = client.post(
            "/api/ingest/screenshots/stage",
            files={"images": ("a.png", b"\x89PNG\r\n\x1a\nfake", "image/png")},
            headers=hdr(u),
        )
        assert staged.status_code == 200, staged.text
        batch_id = staged.json()["batch_id"]

        resp = client.post("/api/ingest/screenshots/process", data={"batch_id": batch_id}, headers=hdr(u))
        assert resp.status_code == 200, resp.text

        assert len(rec.calls) == 1
        args = rec.calls[0][0]
        assert args[0] == "app.tasks.ingest_tasks.process_screenshots_task"
        assert args[2] == str(u.id)
        assert 9 in args, f"入队参数里没带上账号代数，worker 会退回只查存在性：{args}"


class Test限流挂没挂:
    """限流是 Redis 那一层的事，测试夹具里 limiter 是关掉的，所以这里只能断"挂没挂上"。

    读 _route_limits 这个私有注册表是没法里的办法：真跑出一次 429 得有 Redis 在。
    私有属性意味着 slowapi 升版本时这条会红——那正是要的失败方式（逼人回来看一眼），
    比悄悄放行强。同文件的 deactivate 也是这个待遇，两个都是不可逆/可刷的写口子。
    """

    def _limits(self, func_name):
        from app.core.rate_limit import limiter

        return limiter._route_limits.get(f"app.api.routes.user.{func_name}") or []

    def test_补报邀请人挂了限流(self):
        got = [str(x.limit) for x in self._limits("update_inviter")]
        assert got, "/api/user/inviter 上没挂 limiter.limit，可以被无限打"
        assert "10 per 1 minute" in got, got

    def test_注销也还挂着限流(self):
        got = [str(x.limit) for x in self._limits("deactivate_account")]
        assert got, "/api/user/deactivate 的限流被摘掉了"
        assert "5 per 1 minute" in got, got


class Test额度接口:
    def test_只回已记条数与分类数_没有上限类字段(self, client, db):
        u = mk_user(db, "quota-view", bonus=10)
        create_note(client, u, "一条")
        client.post("/api/categories/", json={"name": "旅行"}, headers=hdr(u))
        body = client.get("/api/user/quota", headers=hdr(u)).json()
        assert body == {
            "used": 1,
            # 分类条数一起给：注销那段确认文案要报出真实条数，不能含糊说"你的数据"
            "categories": 1,
        }
        # bonus 列还在库里，但接口不再往外报，客户端也就无从显示一个没有意义的数
        assert "limit" not in body and "remaining" not in body and "invites_left" not in body

    def test_条数是真的_写多少回多少(self, client, db):
        u = mk_user(db, "quota-count")
        for i in range(3):
            assert create_note(client, u, f"第{i}条").status_code == 200
        assert client.get("/api/user/quota", headers=hdr(u)).json()["used"] == 3


class Test邀请归因:
    def test_新用户带邀请人_归因落在账号上(self, client, db, monkeypatch):
        inviter = mk_user(db, "inviter-1")
        login(client, db, monkeypatch, "invitee-1", inviter.id)
        u = db.query(User).filter_by(openid="invitee-1").first()
        assert u.invited_by == inviter.id

    def test_没带参数_自己邀自己_不存在的邀请人_都不认(self, client, db, monkeypatch):
        a = mk_user(db, "inviter-2")

        assert login(client, db, monkeypatch, "none-1", None).invited_by is None

        self_user = login(client, db, monkeypatch, "self-1", None)
        again = login(client, db, monkeypatch, "self-1", self_user.id)
        assert again.id == self_user.id
        assert db.get(User, self_user.id).invited_by is None

        ghost = login(client, db, monkeypatch, "ghost-1", 999999)
        assert ghost.invited_by is None
        assert db.get(User, a.id).invited_by is None

    def test_已经有笔记的老用户改不了归属(self, client, db, monkeypatch):
        inviter = mk_user(db, "inviter-3")
        old = login(client, db, monkeypatch, "old-user", None)
        mk_notes(db, old, 2)
        db.expire_all()
        login(client, db, monkeypatch, "old-user", inviter.id)
        assert db.get(User, old.id).invited_by is None

    def test_归属只认第一次_后续登录不覆盖(self, client, db, monkeypatch):
        i1 = mk_user(db, "inviter-4a")
        i2 = mk_user(db, "inviter-4b")
        login(client, db, monkeypatch, "stable", i1.id)
        login(client, db, monkeypatch, "stable", i2.id)
        assert db.query(User).filter_by(openid="stable").first().invited_by == i1.id


class Test热启动补报归因:
    """已经登录着的人从分享卡片进来，只走 onShow、不走 onLaunch。

    登录那条路带不上 inviter，所以他写下第一篇时服务端根本不知道有这回事；等他下次
    冷启再报，名下已经有笔记了，attribute_inviter 又会照规矩拒掉——这笔账就永久丢了。
    POST /api/user/inviter 是补那一次的口子。
    """

    def post_inviter(self, client, user, inviter_id):
        return client.post("/api/user/inviter", headers=hdr(user), json={"inviter": inviter_id})

    def test_补报成功并且如实回报已认(self, client, db, monkeypatch):
        inviter = mk_user(db, "late-inviter")
        late = login(client, db, monkeypatch, "late-user", None)
        assert late.invited_by is None

        resp = self.post_inviter(client, late, inviter.id)
        assert resp.status_code == 200, resp.text
        assert resp.json()["applied"] is True
        db.expire_all()
        assert db.get(User, late.id).invited_by == inviter.id

    def test_补报过之后写第一篇能正常记账(self, client, db, monkeypatch):
        """这条才是补报的意义所在：光把 invited_by 写上不算，账要能记上。"""
        inviter = mk_user(db, "late-pay-inviter")
        late = login(client, db, monkeypatch, "late-pay-user", None)
        assert self.post_inviter(client, late, inviter.id).json()["applied"] is True

        assert create_note(client, late, "补报之后的第一篇").status_code == 200
        assert db.query(Invitation).filter(Invitation.invitee_id == late.id).count() == 1

    def test_已有归属时改不动(self, client, db, monkeypatch):
        i1 = mk_user(db, "late-i1")
        i2 = mk_user(db, "late-i2")
        u = login(client, db, monkeypatch, "late-stable", i1.id)

        resp = self.post_inviter(client, u, i2.id)
        assert resp.json()["applied"] is False
        db.expire_all()
        assert db.get(User, u.id).invited_by == i1.id

    def test_名下已有笔记的人补不回来(self, client, db, monkeypatch):
        inviter = mk_user(db, "late-inviter-3")
        old = login(client, db, monkeypatch, "late-old", None)
        mk_notes(db, old, 2)
        db.expire_all()

        assert self.post_inviter(client, old, inviter.id).json()["applied"] is False
        assert db.get(User, old.id).invited_by is None

    def test_自己邀自己和不存在的邀请人都不认(self, client, db, monkeypatch):
        u = login(client, db, monkeypatch, "late-self", None)
        assert self.post_inviter(client, u, u.id).json()["applied"] is False
        assert self.post_inviter(client, u, 999999).json()["applied"] is False
        db.expire_all()
        assert db.get(User, u.id).invited_by is None

    def test_没登录不能补报(self, client, db):
        assert client.post("/api/user/inviter", json={"inviter": 1}).status_code == 401

    def test_inviter不是整数时422(self, client, db, monkeypatch):
        u = login(client, db, monkeypatch, "late-bad-payload", None)
        assert self.post_inviter(client, u, "abc").status_code == 422


class Test邀请台账:
    def test_写下第一篇才记账_且只记一次(self, client, db, monkeypatch):
        inviter = mk_user(db, "pay-inviter")
        invitee = login(client, db, monkeypatch, "pay-invitee", inviter.id)
        assert db.query(Invitation).count() == 0, "人还没写笔记，账就先记上了"
        assert create_note(client, invitee, "第一篇").status_code == 200
        assert db.query(Invitation).filter(Invitation.invitee_id == invitee.id).count() == 1

        # 第二篇、以及对第二篇的重复调用都不该再记
        assert create_note(client, invitee, "第二篇").status_code == 200
        note2 = db.query(Note).filter(Note.user_id == str(invitee.id)).order_by(Note.id.desc()).first()
        assert quota.record_first_note(note2, db, invitee) is False
        assert db.query(Invitation).count() == 1

    def test_没被邀请的人写笔记不记任何账(self, client, db, monkeypatch):
        lonely = login(client, db, monkeypatch, "lonely", None)
        assert create_note(client, lonely, "自己的第一篇").status_code == 200
        assert db.query(Invitation).count() == 0

    def test_同一篇被连点两次不报错也不重复记(self, db):
        """连点两次保存时，两趟都可能以为"这就是他的第一篇"。

        这种交错下第二次必须静默返回 False，而不是把 IntegrityError 顶到接口上——
        笔记已经存下来了，回 500 等于告诉用户"没存上"。
        """
        inviter = mk_user(db, "twice-inviter")
        invitee = mk_user(db, "twice-invitee")
        invitee.invited_by = inviter.id
        db.commit()
        note = Note(user_id=str(invitee.id), title="唯一的一篇", source_type="manual")
        db.add(note)
        db.commit()

        assert quota.record_first_note(note, db, invitee) is True
        assert quota.record_first_note(note, db, invitee) is False
        assert db.query(Invitation).count() == 1

    def test_名下已有笔记的人补不回来(self, db):
        """记账的触发条件是"写下第一篇"，不是"这人欠他一笔"。

        归因那一步本来就要求 0 篇，所以这个状态正常走不到；写出来是把规则钉在
        判定函数上，而不是钉在"上游应该不会漏进来"的指望上。
        """
        inviter = mk_user(db, "late-inviter")
        invitee = mk_user(db, "late-invitee")
        invitee.invited_by = inviter.id
        db.commit()
        mk_notes(db, invitee, 2)
        last = db.query(Note).filter(Note.user_id == str(invitee.id)).order_by(Note.id.desc()).first()
        assert quota.record_first_note(last, db, invitee) is False
        assert db.query(Invitation).count() == 0

    def test_自己指向自己的台账也不记(self, db):
        """登录那条路写不出这种状态（attribute_inviter 先拒），但记账不该依赖上游不漏。

        集成探针就是直接改库摆出这个状态时把它抓出来的。
        """
        u = mk_user(db, "self-credit")
        u.invited_by = u.id
        db.commit()
        note = Note(user_id=str(u.id), title="自己的第一篇", source_type="manual")
        db.add(note)
        db.commit()
        assert quota.record_first_note(note, db, u) is False
        assert db.query(Invitation).count() == 0

    def test_指向不存在账号的归因不记也不报错(self, db):
        u = mk_user(db, "ghost-credit")
        u.invited_by = 987654
        db.commit()
        note = Note(user_id=str(u.id), title="第一篇", source_type="manual")
        db.add(note)
        db.commit()
        assert quota.record_first_note(note, db, u) is False
        assert db.query(Invitation).count() == 0

    def test_邀请多少个都只记账_不再抬任何人的额度(self, client, db, monkeypatch):
        """取消额度之后这条取代原来的"次数上限封住收益"：台账不限笔数，但谁也不涨额度。"""
        inviter = mk_user(db, "many-inviter", bonus=37)
        for i in range(7):
            invitee = login(client, db, monkeypatch, f"many-invitee-{i}", inviter.id)
            assert create_note(client, invitee, f"第{i}篇").status_code == 200
        assert db.query(Invitation).filter(Invitation.inviter_id == inviter.id).count() == 7
        assert all(r.reward == 0 for r in db.query(Invitation).all()), "台账里还写着奖励数"
        db.refresh(inviter)
        assert inviter.quota_bonus == 37, "bonus 列已停用，不该再被加减"
        body = client.get("/api/user/quota", headers=hdr(inviter)).json()
        assert set(body) == {"used", "categories"}

    def test_唯一约束是数据库挡的_不是应用层记得住(self, db):
        db.add(Invitation(inviter_id=1, invitee_id=7, reward=0))
        db.commit()
        db.add(Invitation(inviter_id=2, invitee_id=7, reward=0))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_链接与截图这两条路同样记账(self, db, monkeypatch):
        """worker 那边也是"写下笔记"的一条路，必须接同一个函数。"""
        from app.tasks import ingest_tasks

        inviter = mk_user(db, "worker-inviter")
        invitee = mk_user(db, "worker-invitee")
        invitee.invited_by = inviter.id
        db.commit()

        async def fake_ocr(images):
            return "识别出来的文字内容"

        async def fake_extract(text, fallback_title=None):
            return {
                "title": "截图笔记",
                "summary": "摘要",
                "key_points": [],
                "tags": [],
                "degraded": False,
            }

        seen = {}

        def fake_status(task_id, status, result=None):
            seen[status] = result

        monkeypatch.setattr(ingest_tasks, "ocr_images", fake_ocr)
        monkeypatch.setattr(ingest_tasks, "extract_knowledge", fake_extract)
        monkeypatch.setattr(ingest_tasks, "set_task_status", fake_status)
        ingest_tasks.process_screenshots_task("t1", str(invitee.id), [b"img"])

        assert seen.get("completed"), seen
        db.expire_all()
        assert db.query(Invitation).filter(Invitation.invitee_id == invitee.id).count() == 1
        assert db.get(User, inviter.id).quota_bonus == 0


class Test迁移与模型对齐:
    def test_alembic升级后的库和模型一字不差(self, tmp_path):
        """用例建表走 create_all，线上建表走 alembic —— 两条路对不上时，
        测试全绿而线上在第一条写入时报 no such column。所以这里真跑一遍迁移。
        """
        import sqlite3
        import subprocess
        from pathlib import Path

        from alembic.autogenerate import compare_metadata
        from alembic.migration import MigrationContext
        from sqlalchemy import create_engine

        from app.db.database import Base as DbBase
        import app.models  # noqa: F401  确保全部模型都注册进 metadata

        db_file = tmp_path / "mig.db"
        env = dict(os.environ, DATABASE_URL=f"sqlite:///{db_file}")
        root = Path(__file__).resolve().parents[1]
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=str(root), env=env, check=True, capture_output=True, text=True,
        )
        assert sqlite3.connect(db_file).execute(
            "select count(*) from sqlite_master where name='invitations'"
        ).fetchone()[0] == 1

        engine_to_check = create_engine(f"sqlite:///{db_file}")
        with engine_to_check.connect() as conn:
            diffs = compare_metadata(MigrationContext.configure(conn), DbBase.metadata)
        assert diffs == [], diffs


class Test不泄漏:
    def test_登录响应与额度响应里都没有openid(self, client, db, monkeypatch):
        u = login(client, db, monkeypatch, "no-leak", None)
        text = client.get("/api/user/quota", headers=hdr(u)).text
        assert u.openid not in text
        assert "openid" not in text


def login(client, db, monkeypatch, openid, inviter):
    """打真实登录路由，只把 code2session 换成指定 openid。返回拿到的 User。"""
    from app.core import auth as auth_core

    async def fake(code):
        return {"openid": openid, "session_key": "k"}

    monkeypatch.setattr(auth_core, "_wechat_code2session", fake)
    body = {"code": "x"}
    if inviter is not None:
        body["inviter"] = inviter
    resp = client.post("/api/auth/wechat", json=body)
    assert resp.status_code == 200, resp.text
    uid = resp.json()["user_id"]
    user = db.get(User, uid)
    db.expire_all()
    return user
