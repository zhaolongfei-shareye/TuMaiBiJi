"""「直接写」也走提炼这一条链路（2026-10-04 站长改口径：标题 + 原文 → 模型补摘要）。

四条不变量：
① 标题用用户自己打的那个，摘要／要点／标签用模型那一份——他说的是"我给标题和原文，
   自动生成提要"（屏幕上那一格写「摘要」），模型另起的标题只当 fallback。
② 用户手打的这两段字在**入队前**过内容安全，命中就不入队。worker 落库那条路不经过
   notes 的 `_guard_manual_text`（那道闸只在 HTTP 建笔记时跑），这一趟漏了就没有第二处检。
③ 正文落 original_content、形状与 URL／截图两条一致，详情页那三块不为这一种来源特判。
④ 归类跟着这一篇落库；那一格若在提交后被删掉，只当未分类，不报废一次提炼。
"""
import asyncio
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from app.api.routes import ingest as ingest_route
from app.api.routes import notes as notes_route
from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.category import Category
from app.models.note import Note
from app.models.user import User


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


def mk_user(db, openid, generation=1):
    u = User(openid=openid, generation=generation)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def hdr(user):
    return {"Authorization": f"Bearer {_create_token(user.id, user.generation)}"}


class Recorder:
    def __init__(self):
        self.calls = []

    def enqueue(self, *args, **kwargs):
        self.calls.append((args, kwargs))


@pytest.fixture()
def rec(monkeypatch):
    r = Recorder()
    monkeypatch.setattr(ingest_route, "get_queue", lambda: r)
    # set_task_status 要连 Redis，pytest 环境里没有；这里断的是入队参数，不是任务状态。
    monkeypatch.setattr(ingest_route, "set_task_status", lambda *a, **kw: None)
    return r


def post_text(client, user, **body):
    return client.post("/api/ingest/text", json=body, headers=hdr(user))


class Test入队:
    def test_用_一条正常提交把四样都带进队列(self, client, db, rec):
        u = mk_user(db, "txt-wire", generation=7)
        cat = Category(user_id=str(u.id), name="产品")
        db.add(cat)
        db.commit()

        resp = post_text(client, u, title="我的标题", content="原文第一段。", category_id=cat.id)
        assert resp.status_code == 200, resp.text
        assert len(rec.calls) == 1
        args = rec.calls[0][0]
        assert args[0] == "app.tasks.ingest_tasks.process_manual_text_task"
        assert args[2] == str(u.id)
        assert args[3] == "我的标题"
        assert args[4] == "原文第一段。"
        assert args[5] == cat.id
        # generation 漏传 = worker 退回"只查存在性"，A6 那条串号闸门静默失效
        assert 7 in args, f"入队参数里没带上账号代数：{args}"

    def test_用_标题和正文都去掉空白才判空(self, client, db, rec):
        u = mk_user(db, "txt-blank")
        # 空串在 pydantic 那层就挡掉（min_length=1），只剩空白要到 strip 之后才判得出——
        # 两条都得拒，但走的是两道门，所以各自钉一次。
        for body, code in (
            ({"title": "   ", "content": "有正文"}, 400),
            ({"title": "有标题", "content": "   \n "}, 400),
            ({"title": "", "content": "有正文"}, 422),
            ({"title": "有标题", "content": ""}, 422),
        ):
            resp = post_text(client, u, **body)
            assert resp.status_code == code, f"{body} 竟然 {resp.status_code}：{resp.text}"
        assert not rec.calls, "判空失败却已经入了队"

    def test_用_别人的分类不放行(self, client, db, rec):
        mine = mk_user(db, "txt-owner")
        other = mk_user(db, "txt-other")
        cat = Category(user_id=str(other.id), name="他的分类")
        db.add(cat)
        db.commit()

        resp = post_text(client, mine, title="标题", content="正文", category_id=cat.id)
        assert resp.status_code == 400
        assert "分类" in resp.json()["detail"]
        assert not rec.calls

    def test_用_原文命中违规就不入队(self, client, db, rec, monkeypatch):
        """这条是这一整块最要紧的：检不到就是"手打内容从没进过 msgSecCheck"。

        测试环境 SEC_CHECK_ENABLED=false，check_text 一律回 unavailable（放行），
        所以只能把 enforce_text_safety 换成"必定拒"的那一档来断接线。
        """
        from app.core.errors import UserError

        def refuse(openid, *parts):
            raise UserError("内容不合规，请修改后再试")

        monkeypatch.setattr(ingest_route, "enforce_text_safety", refuse)
        u = mk_user(db, "txt-risky")
        resp = post_text(client, u, title="标题", content="违规原文")
        assert resp.status_code == 400
        assert "不合规" in resp.json()["detail"]
        assert not rec.calls, "内容被拒了却还是排进了队列"

    def test_用_送检的是标题加原文两段(self, client, db, rec, monkeypatch):
        seen = []
        monkeypatch.setattr(ingest_route, "enforce_text_safety",
                            lambda openid, *parts: seen.extend(parts))
        u = mk_user(db, "txt-parts")
        post_text(client, u, title="这一句要检", content="这一句也要检")
        assert seen == ["这一句要检", "这一句也要检"], seen

    def test_用_原文长度上限读的是notes那一处(self, client, db, rec):
        """两处必须同一个数：手打内容一旦超过送检窗口，超出部分永远检不到。"""
        from app.api.routes import ingest as m

        assert m.MAX_BODY == notes_route.MAX_BODY == 16_000
        u = mk_user(db, "txt-long")
        resp = post_text(client, u, title="标题", content="字" * (notes_route.MAX_BODY + 1))
        assert resp.status_code == 422


@pytest.fixture()
def worker(monkeypatch, users):
    import app.tasks.ingest_tasks as tasks

    statuses = []
    monkeypatch.setattr(tasks, "set_task_status",
                        lambda tid, st, res=None, **kw: statuses.append((st, res)))
    monkeypatch.setattr(tasks, "SessionLocal", SessionLocal)
    return tasks, statuses, str(users["a"]), monkeypatch


@pytest.fixture()
def users(db):
    return {"a": mk_user(db, "txt-worker-a", generation=1).id}


class Test落库:
    def test_标题用用户打的那份_摘要要点标签用模型那份(self, worker, db):
        tasks, statuses, uid, mp = worker

        async def fake_llm(text, fallback_title=""):
            assert text == "原文第一段。", "送进模型的应该是用户打的原文"
            assert fallback_title == "我的标题", "降级时的标题也该拿用户那个，不是另起"
            return {"title": "模型另起的标题", "summary": "模型摘要",
                    "key_points": ["要点一"], "tags": ["标签一"]}

        mp.setattr(tasks, "extract_knowledge", fake_llm)
        tasks.process_manual_text_task("t1", uid, "我的标题", "原文第一段。")
        status, result = statuses[-1]
        assert status == "completed", result
        note = db.get(Note, result["note_id"])
        assert note.title == "我的标题"          # 不是模型那个
        assert note.summary == "模型摘要"
        assert note.key_points == ["要点一"]
        assert note.original_content == "原文第一段。"
        assert note.source_type == "manual"      # 编辑这一篇时仍要走"用户写的要复检"
        assert result["degraded"] is False

    def test_归类跟着落库(self, worker, db):
        tasks, statuses, uid, mp = worker
        cat = Category(user_id=uid, name="产品")
        db.add(cat)
        db.commit()

        async def fake_llm(text, fallback_title=""):
            return {"title": "t", "summary": "s", "key_points": [], "tags": []}

        mp.setattr(tasks, "extract_knowledge", fake_llm)
        tasks.process_manual_text_task("t2", uid, "标题", "正文", cat.id)
        _, result = statuses[-1]
        assert db.get(Note, result["note_id"]).category_id == cat.id

    def test_那一格在提交后被删掉_只当未分类不报废(self, worker, db):
        tasks, statuses, uid, mp = worker
        cat = Category(user_id=uid, name="会被删掉")
        db.add(cat)
        db.commit()
        cat_id = cat.id

        async def fake_llm(text, fallback_title=""):
            # 提炼这十几秒之间，另一个设备把那一格删了
            db.query(Category).filter(Category.id == cat_id).delete()
            db.commit()
            return {"title": "t", "summary": "s", "key_points": [], "tags": []}

        mp.setattr(tasks, "extract_knowledge", fake_llm)
        tasks.process_manual_text_task("t3", uid, "标题", "正文", cat_id)
        status, result = statuses[-1]
        assert status == "completed", result
        assert db.get(Note, result["note_id"]).category_id is None

    def test_别人的分类即使被塞进job也不落(self, worker, db):
        """入队前查过归属，这条钉的是 worker 那道也认人——不认就只是"少检一次"。"""
        tasks, statuses, uid, mp = worker
        other = mk_user(db, "txt-worker-b")
        cat = Category(user_id=str(other.id), name="他的")
        db.add(cat)
        db.commit()

        async def fake_llm(text, fallback_title=""):
            return {"title": "t", "summary": "s", "key_points": [], "tags": []}

        mp.setattr(tasks, "extract_knowledge", fake_llm)
        tasks.process_manual_text_task("t4", uid, "标题", "正文", cat.id)
        _, result = statuses[-1]
        assert db.get(Note, result["note_id"]).category_id is None
