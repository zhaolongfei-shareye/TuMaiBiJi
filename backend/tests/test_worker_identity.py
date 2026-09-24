"""worker 落库前那道身份 + 额度闸门的用例。

要挡的是两件在 HTTP 那条路上看不见的事：

① **账号代数**。SQLite 的 INTEGER PRIMARY KEY 会复用已删除行的 id，所以"这个 id 上有人"
   不等于"还是提交任务那个人"。A 提交任务后注销、B 注册拿到同一个 id，少了 generation
   这层校验，A 抓回来的网页内容就会出现在 B 的笔记列表里——那是把一个人的内容递给另一个人。

② **额度复查**。提交时那道闸门到 worker 落库之间隔着抓取 + 提炼的几十秒，中间用户可能又
   手写了几篇。只在提交时查，100 篇的上限就是个软约束。

这两条都只能在这里测：集成探针不起 worker，HTTP 用例走不到这条分支。
"""
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from app.db.database import Base, SessionLocal, engine
from app.models.note import Note
from app.models.user import User
from app.services import quota
from app.tasks import ingest_tasks


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def statuses(monkeypatch):
    """set_task_status 要写 Redis，这里只记调用：断言的是"任务被怎么判的"，不是 Redis。"""
    calls = []
    monkeypatch.setattr(
        ingest_tasks, "set_task_status", lambda tid, st, res=None: calls.append((tid, st, res))
    )
    return calls


def mk_user(db, openid, generation=1, uid=None):
    u = User(openid=openid, generation=generation)
    if uid is not None:
        u.id = uid
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def reuse_id(db, uid, generation):
    """把"删掉一个号、新号拿到同一个 id"这件事摆成确定状态。

    线上这一步是 SQLite 自己干的（INTEGER PRIMARY KEY 复用 max(rowid)+1），测试里等它
    恰好复用等于把断言建在巧合上，所以直接指定同一个主键。
    """
    return mk_user(db, f"reused-{uid}-{generation}", generation=generation, uid=uid)


def notes_of(db, uid):
    return db.query(Note).filter(Note.user_id == str(uid)).count()


class Test账号代数:
    def test_代数对得上就放行(self, db, statuses):
        u = mk_user(db, "gen-ok", generation=3)
        assert ingest_tasks._load_task_user(db, "t1", str(u.id), 3) is not None
        assert statuses == []

    def test_账号已注销就终止(self, db, statuses):
        u = mk_user(db, "gen-gone")
        uid = u.id
        db.delete(u)
        db.commit()
        assert ingest_tasks._load_task_user(db, "t2", str(uid), 1) is None
        assert statuses[-1][1] == "failed"
        assert "注销" in statuses[-1][2]["error"]

    def test_id被新账号复用就终止(self, db, statuses):
        """A6 的正身：同一个 id 上换了一个人，任务必须就地停下。"""
        old = mk_user(db, "gen-old", generation=1)
        uid = old.id
        db.delete(old)
        db.commit()
        reuse_id(db, uid, generation=2)

        assert ingest_tasks._load_task_user(db, "t3", str(uid), 1) is None
        assert statuses[-1][1] == "failed"
        assert "变更" in statuses[-1][2]["error"]

    def test_存量job没带代数时退回只查存在(self, db, statuses):
        """部署切换期里旧代码入队的 job 拿不到 gen，只能退回"人还在就写"。"""
        u = mk_user(db, "gen-legacy", generation=7)
        assert ingest_tasks._load_task_user(db, "t4", str(u.id), None) is not None


class Test整条任务不串号:
    """上面测的是那个函数，这里测它接在真任务里到底挡没挡住。"""

    @pytest.fixture()
    def stub_pipeline(self, monkeypatch):
        async def fake_scrape(url):
            return {"content": "抓回来的正文", "title": "原标题", "source_type": "article"}

        async def fake_extract(text, fallback_title=None):
            return {"title": "提炼后的标题", "summary": "摘要", "key_points": [], "tags": [], "degraded": False}

        monkeypatch.setattr(ingest_tasks, "scrape_url", fake_scrape)
        monkeypatch.setattr(ingest_tasks, "extract_knowledge", fake_extract)

    def test_账号注销后任务不落库(self, db, statuses, stub_pipeline):
        u = mk_user(db, "task-gone")
        uid = u.id
        db.delete(u)
        db.commit()

        ingest_tasks.process_url_task("t5", str(uid), "https://a.b/c", 1)

        assert notes_of(db, uid) == 0
        assert statuses[-1][1] == "failed"

    def test_id被复用后任务不落进新号(self, db, statuses, stub_pipeline):
        """隐私泄露那条：A 的抓取结果不能出现在 B 的笔记列表里。"""
        old = mk_user(db, "task-old", generation=1)
        uid = old.id
        db.delete(old)
        db.commit()
        reuse_id(db, uid, generation=2)

        ingest_tasks.process_url_task("t6", str(uid), "https://a.b/c", 1)

        assert notes_of(db, uid) == 0, "A 的抓取结果落进了复用同一 id 的 B 名下"
        assert statuses[-1][1] == "failed"

    def test_额度满了任务不落库(self, db, statuses, stub_pipeline, monkeypatch):
        monkeypatch.setattr(quota, "BASE_QUOTA", 3)
        u = mk_user(db, "task-full")
        for i in range(3):
            db.add(Note(user_id=str(u.id), title=f"占位{i}", source_type="manual"))
        db.commit()

        ingest_tasks.process_url_task("t7", str(u.id), "https://a.b/c", 1)

        assert notes_of(db, u.id) == 3, "第 4 篇还是被写进去了"
        assert statuses[-1][1] == "failed"
        assert "上限" in statuses[-1][2]["error"]

    def test_有额度且代数对得上时正常落库(self, db, statuses, stub_pipeline):
        u = mk_user(db, "task-ok", generation=4)

        ingest_tasks.process_url_task("t8", str(u.id), "https://a.b/c", 4)

        assert notes_of(db, u.id) == 1
        assert statuses[-1][1] == "completed"

    def test_截图那条任务同样受这两道闸门管(self, db, statuses, monkeypatch):
        async def fake_ocr(images):
            return "识别出来的文字"

        async def fake_extract(text, fallback_title=None):
            return {"title": "标题", "summary": "摘要", "key_points": [], "tags": [], "degraded": False}

        monkeypatch.setattr(ingest_tasks, "ocr_images", fake_ocr)
        monkeypatch.setattr(ingest_tasks, "extract_knowledge", fake_extract)

        u = mk_user(db, "task-shot", generation=1)
        uid = u.id
        db.delete(u)
        db.commit()

        ingest_tasks.process_screenshots_task("t9", str(uid), [b"fake"], 1)

        assert notes_of(db, uid) == 0
        assert statuses[-1][1] == "failed"


class Test入账也要看代数:
    def test_credit_first_note在账号消失后不炸(self, db, statuses):
        """奖励到账是笔记落库之后的附加动作，人没了就该安静跳过，不能把整条任务判失败。"""
        ingest_tasks.credit_first_note(db, "999999", Note(title="x", user_id="999999"))
