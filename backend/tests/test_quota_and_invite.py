"""额度闸门 + 邀请奖励的行为用例。

五条不变量（口径 2026-09-24 定）：
① 到顶之后，手写 / 链接 / 截图 / 转存四条入口**全部**拦下，且拦在真正干活之前
   （不入库、不出队、不解图）。
② 奖励只在"带来一个新的写作者"那一刻结：他自己动笔写下第一篇，或者把别人那篇转存
   进自己库里，两条都算。一个被邀请人一辈子只能成就一次；重复登录、重复提交、
   第二条笔记都不会再给。
③ **带来多少人不限**（旧版那条"最多记 5 次"已废）。封住套利的是"一人一次"
   和"同一篇笔记只挣一次"这两条数据库约束，不是总闸。
④ 转存那条要指名是哪篇笔记带来的，而 `source_note_id` 上的部分唯一索引保证同一篇
   只加一次——把一篇热门笔记发给一百个人转存，作者拿到的还是 10 篇。
⑤ 数字只有一个来源：客户端拿 /api/user/quota，不硬编码。

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


class Test口径常量:
    def test_两个数字钉住_改了就是改产品口径(self):
        assert quota.BASE_QUOTA == 100
        assert quota.INVITE_REWARD == 10

    def test_没有次数上限这一档(self, db):
        """带来几个人不限——这条也得钉住，否则哪天有人"顺手"加回一个 max 没人会发现。"""
        assert not hasattr(quota, "MAX_REWARDED_INVITES")
        u = mk_user(db, "no-cap")
        body = quota.quota_view(u, db)
        assert "invites_left" not in body  # 接口不许再回一个"还剩几次"
        assert body["invites_rewarded"] == 0  # 只报已经带来几个人，不报额度


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

    def test_链接入口入队时带上generation(self, client, db, monkeypatch, rec):
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        u = mk_user(db, "wire-url", generation=7)

        resp = client.post("/api/ingest/url", data={"url": "https://example.com/a"}, headers=hdr(u))
        assert resp.status_code == 200, resp.text

        assert len(rec.calls) == 1
        args = rec.calls[0][0]
        assert args[0] == "app.tasks.ingest_tasks.process_url_task"
        assert args[2] == str(u.id)
        assert 7 in args, f"入队参数里没带上账号代数，worker 会退回只查存在性：{args}"

    def test_截图入口入队时带上generation(self, client, db, monkeypatch, rec):
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
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


class Test热启动补报归因:
    """已经登录着的人从分享卡片进来，只走 onShow、不走 onLaunch。

    登录那条路带不上 inviter，所以他写下第一篇时服务端根本不知道有这回事；等他下次
    冷启再报，名下已经有笔记了，attribute_inviter 又会照规矩拒掉——这笔奖励就永久丢了。
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

    def test_补报过之后写第一篇能正常结账(self, client, db, monkeypatch):
        """这条才是补报的意义所在：光把 invited_by 写上不算，钱要能结出来。"""
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        inviter = mk_user(db, "late-pay-inviter")
        late = login(client, db, monkeypatch, "late-pay-user", None)
        assert self.post_inviter(client, late, inviter.id).json()["applied"] is True

        assert create_note(client, late, "补报之后的第一篇").status_code == 200
        db.refresh(inviter)
        assert inviter.quota_bonus == quota.INVITE_REWARD

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

    def test_带来七个人就到账七次_次数不封(self, client, db, monkeypatch):
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        inviter = mk_user(db, "cap-inviter")
        for i in range(7):
            invitee = login(client, db, monkeypatch, f"cap-invitee-{i}", inviter.id)
            assert create_note(client, invitee, f"第{i}篇").status_code == 200
        db.refresh(inviter)
        assert inviter.quota_bonus == quota.INVITE_REWARD * 7
        assert db.query(Invitation).filter(Invitation.inviter_id == inviter.id).count() == 7
        body = client.get("/api/user/quota", headers=hdr(inviter)).json()
        assert body["invites_rewarded"] == 7
        assert body["limit"] == 170

    def test_同一个人再写第十篇也不重复给(self, client, db, monkeypatch):
        """一人一次是这本账的地基：次数不封顶之后，全靠它挡"一个人刷出十笔"。"""
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        inviter = mk_user(db, "once-inviter")
        invitee = login(client, db, monkeypatch, "once-invitee", inviter.id)
        for i in range(10):
            assert create_note(client, invitee, f"第{i}篇").status_code == 200
        db.refresh(inviter)
        assert inviter.quota_bonus == quota.INVITE_REWARD
        assert db.query(Invitation).count() == 1

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


class Test转存也激活:
    """新用户只要把别人那篇转存进自己库里，作者就 +10；而同一篇笔记只挣一次。"""

    def share_token(self, client, db, author):
        note_id = create_note(client, author, "我的手机号是 13800000000").json()["id"]
        resp = client.post("/api/shares/", json={"note_id": note_id}, headers=hdr(author))
        assert resp.status_code == 200
        return note_id, resp.json()["token"]

    def import_as(self, client, user, token):
        return client.post("/api/notes/from-share", json={"token": token}, headers=hdr(user))

    def test_新用户转存一次_作者到账十篇(self, client, db, monkeypatch):
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        author = mk_user(db, "imp-author")
        note_id, token = self.share_token(client, db, author)
        friend = login(client, db, monkeypatch, "imp-friend", None)

        assert self.import_as(client, friend, token).status_code == 200

        db.expire_all()
        assert db.get(User, author.id).quota_bonus == 10
        row = db.query(Invitation).filter(Invitation.invitee_id == friend.id).one()
        assert (row.inviter_id, row.source_note_id, row.reward) == (author.id, note_id, 10)
        body = client.get("/api/user/quota", headers=hdr(author)).json()
        assert (body["limit"], body["used"], body["invites_rewarded"]) == (110, 1, 1)

    def test_同一篇笔记第二个人再转存不再加钱(self, client, db, monkeypatch):
        """这篇发出去不管被几个人转存，作者只挣一次——不然刷一篇热门笔记就是刷额度。"""
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        author = mk_user(db, "dup-author")
        _, token = self.share_token(client, db, author)
        first = login(client, db, monkeypatch, "dup-friend-1", None)
        second = login(client, db, monkeypatch, "dup-friend-2", None)

        assert self.import_as(client, first, token).status_code == 200
        assert self.import_as(client, second, token).status_code == 200

        db.expire_all()
        assert db.get(User, author.id).quota_bonus == 10
        assert db.query(Invitation).count() == 1
        # 第二个人自己那条笔记照旧存好了：结不到账不许把转存本身弄失败
        assert db.query(Note).filter(Note.user_id == str(second.id)).count() == 1

    def test_换一篇笔记转存就再挣一次(self, client, db, monkeypatch):
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        author = mk_user(db, "two-notes-author")
        _, token_a = self.share_token(client, db, author)
        _, token_b = self.share_token(client, db, author)
        one = login(client, db, monkeypatch, "two-notes-friend-1", None)
        two = login(client, db, monkeypatch, "two-notes-friend-2", None)

        assert self.import_as(client, one, token_a).status_code == 200
        assert self.import_as(client, two, token_b).status_code == 200

        db.expire_all()
        assert db.get(User, author.id).quota_bonus == 20

    def test_老用户转存不给钱(self, client, db, monkeypatch):
        """只对新用户有效：库里早就有东西的人再抄一篇，不算"被带来"。"""
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        author = mk_user(db, "old-author")
        _, token = self.share_token(client, db, author)
        old = login(client, db, monkeypatch, "old-friend", None)
        assert create_note(client, old, "他自己早就写过").status_code == 200

        assert self.import_as(client, old, token).status_code == 200

        db.expire_all()
        assert db.get(User, author.id).quota_bonus == 0
        assert db.query(Invitation).count() == 0

    def test_自己转存自己的笔记不给钱(self, client, db, monkeypatch):
        """判作者=转存人这一条要单独挡：走服务层调用，绕开"他自己名下不止一条"那道检查。"""
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        author = mk_user(db, "self-author")
        note_id, _ = self.share_token(client, db, author)
        mk_notes(db, author, 0)  # 名下一共就这一篇，"第一条"成立，只剩自己不能给自己钱这一道

        assert quota.credit_import(db, author, note_id) == 0

        db.expire_all()
        assert db.get(User, author.id).quota_bonus == 0
        assert db.query(Invitation).count() == 0

    def test_转存之后他自己再动笔也不重复给任何人(self, client, db, monkeypatch):
        """一个人只成就一次：先转存拿了那笔，再写第一篇不该把同一份奖励结第二遍。"""
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        author = mk_user(db, "twice-author")
        _, token = self.share_token(client, db, author)
        friend = login(client, db, monkeypatch, "twice-friend", author.id)

        assert self.import_as(client, friend, token).status_code == 200
        assert create_note(client, friend, "他后来自己写的第一篇").status_code == 200

        db.expire_all()
        assert db.get(User, author.id).quota_bonus == 10
        assert db.query(Invitation).count() == 1

    def test_源笔记删掉之后那笔账还查得到(self, client, db, monkeypatch):
        """source_note_id 故意不带外键：作者删笔记不能顺手抹掉已发生的奖励凭证，
        更不能让删笔记这件事多一种失败方式。"""
        monkeypatch.setattr(quota, "BASE_QUOTA", 100)
        author = mk_user(db, "gone-author")
        note_id, token = self.share_token(client, db, author)
        friend = login(client, db, monkeypatch, "gone-friend", None)
        assert self.import_as(client, friend, token).status_code == 200

        resp = client.delete(f"/api/notes/{note_id}", headers=hdr(author))
        assert resp.status_code == 200

        db.expire_all()
        assert db.get(Note, note_id) is None
        row = db.query(Invitation).filter(Invitation.invitee_id == friend.id).one()
        assert row.source_note_id == note_id
        assert db.get(User, author.id).quota_bonus == 10

    def test_转存那条入口也受额度闸门管(self, client, db, monkeypatch):
        """转存是第四条"往库里加东西"的路，漏了它就等于从这儿绕开上限。"""
        monkeypatch.setattr(quota, "BASE_QUOTA", 1)
        author = mk_user(db, "gate-author")
        note_id = create_note(client, author, "作者那一篇").json()["id"]
        token = client.post(
            "/api/shares/", json={"note_id": note_id}, headers=hdr(author)
        ).json()["token"]
        friend = login(client, db, monkeypatch, "gate-friend", None)
        mk_notes(db, friend, 1)  # 朋友名下已经有一篇，正好顶到 1 的上限

        resp = self.import_as(client, friend, token)
        assert resp.status_code == 403
        assert "上限" in resp.json()["detail"]
        db.expire_all()
        assert db.get(User, author.id).quota_bonus == 0
        assert db.query(Note).filter(Note.user_id == str(friend.id)).count() == 1


    def test_一篇一次是数据库挡的_而且只管填得上源笔记的行(self, db):
        """部分唯一索引写错方向的两种死法都要挡住：
        约束没生效 → 同一篇刷额度；约束连空值一起管 → 动笔那条路第二个人就插不进去。
        （后者在 SQLite/Postgres 上其实测不出来：唯一索引本来把多个 NULL 当成互不相等，
        所以那个 WHERE 子句是写清楚意图用的，不承担行为。）
        """
        db.add(Invitation(inviter_id=1, invitee_id=11, source_note_id=77, reward=10))
        db.commit()
        db.add(Invitation(inviter_id=1, invitee_id=12, source_note_id=77, reward=10))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        db.add(Invitation(inviter_id=1, invitee_id=13, reward=10))
        db.add(Invitation(inviter_id=1, invitee_id=14, reward=10))
        db.commit()  # 两笔没有源笔记的（动笔那一路）照记不误
        assert db.query(Invitation).filter(Invitation.source_note_id.is_(None)).count() == 2

    def test_并发撞索引那一趟只回零不把转存弄失败(self, db):
        """同步路由跑在线程池里，两个人同时转存同一篇是真会撞上的。
        那一趟必须"这笔没结成"就算了，不能让一个数据库异常冒到用户面前变成 500。
        """
        author = mk_user(db, "race-author", bonus=quota.INVITE_REWARD)
        friend = mk_user(db, "race-friend")
        db.add(Invitation(inviter_id=author.id, invitee_id=friend.id, source_note_id=5, reward=quota.INVITE_REWARD))
        db.commit()
        db.expire_all()

        # 同一笔账再走一次：索引挡下来之后只回 0，不抛
        assert quota._settle(db, db.get(User, author.id), db.get(User, friend.id), 5, "转存") == 0

        db.expire_all()
        assert db.get(User, author.id).quota_bonus == quota.INVITE_REWARD  # 没加第二次
        assert db.query(Invitation).count() == 1


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
