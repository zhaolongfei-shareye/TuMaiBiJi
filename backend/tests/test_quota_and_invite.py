"""额度闸门 + 邀请奖励的行为用例。

四条不变量：
① 到顶之后，手写 / 链接 / 截图三条入口**全部**拦下，且拦在真正干活之前（不入库、
   不出队、不解图）。
② 奖励只在"被邀请人写下第一篇笔记"那一刻结，一个被邀请人一辈子只能成就一次；
   重复登录、重复提交、第二条笔记都不会再给。
③ 邀请人这边有次数上限，到顶后不再到账（小号自邀自写的收益是被封住的，不是被消除的）。
④ 数字只有一个来源：客户端拿 /api/user/quota，不硬编码。

限流在测试里关掉：这几个用例要打 /api/auth/wechat（5 次/分钟），而那层是 Redis 的事，
不是这里的判定逻辑。
"""
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


def mk_user(db, openid, bonus=0):
    u = User(openid=openid, quota_bonus=bonus)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def hdr(user):
    return {"Authorization": f"Bearer {_create_token(user.id)}"}


def mk_notes(db, user, n):
    for i in range(n):
        db.add(Note(user_id=str(user.id), title=f"占位{i}", source_type="manual"))
    db.commit()


def create_note(client, user, title="一条笔记"):
    return client.post("/api/notes/", json={"title": title}, headers=hdr(user))


class Test口径常量:
    def test_三个数字钉住_改了就是改产品口径(self):
        assert quota.BASE_QUOTA == 100
        assert quota.INVITE_REWARD == 10
        assert quota.MAX_REWARDED_INVITES == 5


class Test额度闸门:
    def test_到顶后手写入口回403并且中文(self, client, db, monkeypatch):
        monkeypatch.setattr(quota, "BASE_QUOTA", 3)
        u = mk_user(db, "gate-manual")
        for i in range(3):
            assert create_note(client, u, f"第{i}条").status_code == 200
        resp = create_note(client, u, "第4条")
        assert resp.status_code == 403
        assert "上限" in resp.json()["detail"]
        assert db.query(Note).filter(Note.user_id == str(u.id)).count() == 3

    def test_奖励过的额度确实抬高(self, client, db, monkeypatch):
        monkeypatch.setattr(quota, "BASE_QUOTA", 3)
        u = mk_user(db, "gate-bonus", bonus=2)
        for i in range(5):
            assert create_note(client, u, f"第{i}条").status_code == 200
        assert create_note(client, u, "第6条").status_code == 403

    def test_链接入口拦在出队之前(self, client, db, monkeypatch):
        monkeypatch.setattr(quota, "BASE_QUOTA", 1)
        u = mk_user(db, "gate-url")
        assert create_note(client, u, "占位").status_code == 200

        def boom(*a, **kw):
            raise AssertionError("额度已满还去排队，worker 会白跑一趟")

        monkeypatch.setattr(ingest_route, "get_queue", boom)
        resp = client.post(
            "/api/ingest/url", data={"url": "https://example.com/a"}, headers=hdr(u)
        )
        assert resp.status_code == 403

    def test_截图暂存与提交两处都拦(self, client, db, monkeypatch):
        monkeypatch.setattr(quota, "BASE_QUOTA", 0)
        u = mk_user(db, "gate-shot")
        staged = client.post(
            "/api/ingest/screenshots/stage",
            files={"images": ("a.png", b"\x89PNG\r\n\x1a\nfake", "image/png")},
            headers=hdr(u),
        )
        assert staged.status_code == 403
        processed = client.post(
            "/api/ingest/screenshots/process", data={"batch_id": "nope"}, headers=hdr(u)
        )
        assert processed.status_code == 403

    def test_额度没满时截图提交仍走原逻辑_批次不存在回404(self, client, db, monkeypatch):
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        u = mk_user(db, "gate-ok")
        resp = client.post(
            "/api/ingest/screenshots/process", data={"batch_id": "nope"}, headers=hdr(u)
        )
        assert resp.status_code == 404

    def test_删掉一条就能再存(self, client, db, monkeypatch):
        monkeypatch.setattr(quota, "BASE_QUOTA", 2)
        u = mk_user(db, "gate-delete")
        first = create_note(client, u, "第一条")
        assert create_note(client, u, "第二条").status_code == 200
        assert create_note(client, u, "第三条").status_code == 403
        assert client.delete(f"/api/notes/{first.json()['id']}", headers=hdr(u)).status_code == 200
        assert create_note(client, u, "第三条").status_code == 200


class Test额度接口:
    def test_返回的就是客户端要的那几个数(self, client, db, monkeypatch):
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        u = mk_user(db, "quota-view", bonus=10)
        create_note(client, u, "一条")
        client.post("/api/categories/", json={"name": "旅行"}, headers=hdr(u))
        body = client.get("/api/user/quota", headers=hdr(u)).json()
        assert body == {
            "used": 1,
            # 分类条数一起给：注销那段确认文案要报出真实条数，不能含糊说"你的数据"
            "categories": 1,
            "limit": 110,
            "remaining": 109,
            "base": 100,
            "bonus": 10,
            "reward_each": 10,
            "invites_rewarded": 0,
            "invites_left": 5,
        }


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


class Test邀请到账:
    def test_写下第一篇才到账_且只到一次(self, client, db, monkeypatch):
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        inviter = mk_user(db, "pay-inviter")
        invitee = login(client, db, monkeypatch, "pay-invitee", inviter.id)
        assert inviter.quota_bonus == 0
        assert create_note(client, invitee, "第一篇").status_code == 200

        db.refresh(inviter)
        assert inviter.quota_bonus == 10
        assert db.query(Invitation).filter(Invitation.invitee_id == invitee.id).count() == 1

        # 第二篇、以及重复调用都不该再加
        assert create_note(client, invitee, "第二篇").status_code == 200
        note2 = db.query(Note).filter(Note.user_id == str(invitee.id)).order_by(Note.id.desc()).first()
        assert quota.credit_first_note(note2, db, invitee) == 0
        db.refresh(inviter)
        assert inviter.quota_bonus == 10

    def test_没被邀请的人写笔记不给任何人钱(self, client, db, monkeypatch):
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        lonely = login(client, db, monkeypatch, "lonely", None)
        assert create_note(client, lonely, "自己的第一篇").status_code == 200
        assert db.query(Invitation).count() == 0

    def test_同一篇被连结两次不报错也不重复给钱(self, db):
        """连点两次保存时，两趟结算可能都以为"这就是他的第一篇"。

        这种交错下第二次结算必须静默返回 0，而不是把 IntegrityError 顶到接口上——
        笔记已经存下来了，回 500 等于告诉用户"没存上"。
        """
        inviter = mk_user(db, "twice-inviter")
        invitee = mk_user(db, "twice-invitee")
        invitee.invited_by = inviter.id
        db.commit()
        note = Note(user_id=str(invitee.id), title="唯一的一篇", source_type="manual")
        db.add(note)
        db.commit()

        assert quota.credit_first_note(note, db, invitee) == quota.INVITE_REWARD
        assert quota.credit_first_note(note, db, invitee) == 0
        db.refresh(inviter)
        assert inviter.quota_bonus == quota.INVITE_REWARD
        assert db.query(Invitation).count() == 1

    def test_名下已有笔记的人补不回来(self, client, db, monkeypatch):
        """到账的触发条件是"写下第一篇"，不是"这人欠他一笔"。

        归因那一步本来就要求 0 篇，所以这个状态正常走不到；写出来是把规则钉在
        判定函数上，而不是钉在"上游应该不会漏进来"的指望上。
        """
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        inviter = mk_user(db, "late-inviter")
        invitee = mk_user(db, "late-invitee")
        invitee.invited_by = inviter.id
        db.commit()
        mk_notes(db, invitee, 2)
        last = db.query(Note).filter(Note.user_id == str(invitee.id)).order_by(Note.id.desc()).first()
        assert quota.credit_first_note(last, db, invitee) == 0
        db.refresh(inviter)
        assert inviter.quota_bonus == 0
        assert db.query(Invitation).count() == 0

    def test_自己指向自己的台账也不结(self, db):
        """登录那条路写不出这种状态（attribute_inviter 先拒），但结钱不该依赖上游不漏。

        集成探针就是直接改库摆出这个状态时把它抓出来的。
        """
        u = mk_user(db, "self-credit")
        u.invited_by = u.id
        db.commit()
        note = Note(user_id=str(u.id), title="自己的第一篇", source_type="manual")
        db.add(note)
        db.commit()
        assert quota.credit_first_note(note, db, u) == 0
        db.refresh(u)
        assert u.quota_bonus == 0
        assert db.query(Invitation).count() == 0

    def test_指向不存在账号的归因不结也不报错(self, db):
        u = mk_user(db, "ghost-credit")
        u.invited_by = 987654
        db.commit()
        note = Note(user_id=str(u.id), title="第一篇", source_type="manual")
        db.add(note)
        db.commit()
        assert quota.credit_first_note(note, db, u) == 0
        assert db.query(Invitation).count() == 0

    def test_邀请人次数上限封住收益(self, client, db, monkeypatch):
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        inviter = mk_user(db, "cap-inviter")
        for i in range(quota.MAX_REWARDED_INVITES + 2):
            invitee = login(client, db, monkeypatch, f"cap-invitee-{i}", inviter.id)
            assert create_note(client, invitee, f"第{i}篇").status_code == 200
        db.refresh(inviter)
        assert inviter.quota_bonus == quota.INVITE_REWARD * quota.MAX_REWARDED_INVITES
        assert db.query(Invitation).filter(Invitation.inviter_id == inviter.id).count() == 5
        body = client.get("/api/user/quota", headers=hdr(inviter)).json()
        assert body["invites_rewarded"] == 5
        assert body["invites_left"] == 0
        assert body["limit"] == 150

    def test_唯一约束是数据库挡的_不是应用层记得住(self, db):
        db.add(Invitation(inviter_id=1, invitee_id=7, reward=10))
        db.commit()
        db.add(Invitation(inviter_id=2, invitee_id=7, reward=10))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_链接与截图这两条路同样到账(self, db, monkeypatch):
        """worker 那边也是"写下笔记"的一条路，必须接同一个函数。"""
        from app.tasks import ingest_tasks

        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
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
        assert db.get(User, inviter.id).quota_bonus == 10


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


class Test不泄漏:
    def test_登录响应与额度响应里都没有openid(self, client, db, monkeypatch):
        u = login(client, db, monkeypatch, "no-leak", None)
        text = client.get("/api/user/quota", headers=hdr(u)).text
        assert u.openid not in text
        assert "openid" not in text
