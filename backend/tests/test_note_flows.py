"""后端核心闭环回归测试：搜索范围、跨用户隔离、提炼降级。

与 deploy 无关，可反复执行；使用 /tmp 下独立的 sqlite 库，不接触真实数据。

    cd backend && .venv/bin/python -m pytest tests/ -v
"""
import asyncio
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["DEEPSEEK_API_KEY"] = "sk-your-deepseek-api-key"  # 占位符：模拟生产未配置
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.category import Category
from app.models.note import Note
from app.models.share import Share
from app.models.user import User

MARK_A = "只有A知道的正文串AZ3K"
MARK_B = "只有B知道的正文串BQ7L"


@pytest.fixture(scope="module")
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture(scope="module")
def users(db):
    a, b = User(openid="pytest-user-a"), User(openid="pytest-user-b")
    db.add_all([a, b])
    db.commit()
    return {"a": a.id, "b": b.id}


@pytest.fixture(scope="module")
def notes(db, users):
    def mk(uid, title, summary, content, orig):
        n = Note(user_id=str(uid), title=title, summary=summary, content=content,
                 original_content=orig, source_type="manual", tags=[], key_points=[])
        db.add(n)
        db.commit()
        return n.id

    return {
        "a_body": mk(users["a"], "标题甲", "摘要甲", "正文甲", f"前言。{MARK_A}"),
        "a_plain": mk(users["a"], "另一条", "无关", "无关", "无关"),
        "b_body": mk(users["b"], "标题乙", "摘要乙", "正文乙", f"前言。{MARK_B}"),
    }


@pytest.fixture(scope="module")
def client(db, users, notes):
    return TestClient(app)


@pytest.fixture(scope="module")
def ha(users):
    return {"Authorization": f"Bearer {_create_token(users['a'])}"}


@pytest.fixture(scope="module")
def hb(users):
    return {"Authorization": f"Bearer {_create_token(users['b'])}"}


def ids(resp):
    return sorted(n["id"] for n in resp.json())


class TestSearchScope:
    def test_hits_original_content(self, client, ha, notes):
        assert ids(client.get("/api/notes/", params={"search": MARK_A}, headers=ha)) == [notes["a_body"]]

    @pytest.mark.parametrize("keyword", ["标题甲", "摘要甲", "正文甲"])
    def test_legacy_fields_still_work(self, client, ha, notes, keyword):
        assert ids(client.get("/api/notes/", params={"search": keyword}, headers=ha)) == [notes["a_body"]]

    def test_wildcards_escaped(self, client, ha):
        for keyword in ("AZ%K", "AZ_K"):
            assert client.get("/api/notes/", params={"search": keyword}, headers=ha).json() == []

    def test_case_insensitive(self, client, ha, notes):
        assert ids(client.get("/api/notes/", params={"search": "az3k"}, headers=ha)) == [notes["a_body"]]

    def test_empty_search_returns_all_mine(self, client, ha, notes):
        assert ids(client.get("/api/notes/", params={"search": ""}, headers=ha)) == sorted(
            [notes["a_body"], notes["a_plain"]]
        )


class TestUserIsolation:
    def test_body_search_does_not_cross_users(self, client, ha, hb, notes):
        assert client.get("/api/notes/", params={"search": MARK_A}, headers=hb).json() == []
        assert client.get("/api/notes/", params={"search": MARK_B}, headers=ha).json() == []

    def test_cannot_touch_others_note(self, client, hb, notes):
        url = f"/api/notes/{notes['a_body']}"
        cases = [
            ("get", url, None),
            ("put", url, {"title": "篡改"}),
            ("delete", url, None),
            ("post", f"{url}/pin?pin=true", None),
        ]
        for method, target, body in cases:
            kwargs = {"json": body} if body is not None else {}
            resp = getattr(client, method)(target, headers=hb, **kwargs)
            assert resp.status_code == 404, f"{method.upper()} {target} → {resp.status_code} {resp.text[:160]}"

    def test_note_unchanged_after_attacks(self, db, notes):
        assert db.get(Note, notes["a_body"]).title == "标题甲"

    def test_cannot_share_others_note(self, client, hb, notes, db):
        assert client.post("/api/shares/", json={"note_id": notes["a_body"]}, headers=hb).status_code == 404
        assert db.query(Share).filter(Share.note_id == notes["a_body"]).count() == 0

    def test_categories_are_isolated(self, client, ha, hb, db):
        created = client.post("/api/categories/", json={"name": "A的私密分类"}, headers=ha)
        assert created.status_code == 200
        cid = created.json()["id"]
        assert all(c["id"] != cid for c in client.get("/api/categories/", headers=hb).json())
        assert client.put(f"/api/categories/{cid}", json={"name": "B改"}, headers=hb).status_code == 404
        assert client.delete(f"/api/categories/{cid}", headers=hb).status_code == 404
        assert db.get(Category, cid).name == "A的私密分类"

    def test_openid_never_in_response(self, client, ha):
        assert "pytest-user-a" not in client.get("/api/notes/", headers=ha).text

    def test_missing_or_forged_token_rejected(self, client):
        assert client.get("/api/notes/").status_code == 401
        assert client.get("/api/notes/", headers={"Authorization": "Bearer not.a.jwt"}).status_code == 401


class TestExtractionDegradation:
    def test_placeholder_key_is_unusable(self):
        from app.services.llm import key_usable

        assert key_usable("") is False
        assert key_usable("sk-your-deepseek-api-key") is False
        assert key_usable("your-tencent-ocr-secret-id") is False
        assert key_usable("sk-8f3ab99c11d24e7fbb0d") is True

    @pytest.fixture
    def worker(self, monkeypatch, users):
        import app.tasks.ingest_tasks as tasks

        statuses = []
        monkeypatch.setattr(tasks, "set_task_status", lambda tid, st, res=None, **kw: statuses.append((st, res)))
        monkeypatch.setattr(tasks, "SessionLocal", SessionLocal)
        return tasks, statuses, str(users["a"]), monkeypatch

    def test_degrades_to_raw_text_when_llm_unusable(self, worker, db):
        tasks, statuses, uid, mp = worker

        async def fake_ocr(images_data):
            return "OCR 识别出的正文，这一整行将作为降级标题"

        mp.setattr(tasks, "ocr_images", fake_ocr)
        tasks.process_screenshots_task("t-degraded", uid, [b"fake-png"])
        status, result = statuses[-1]
        assert status == "completed"
        assert result["degraded"] is True
        note = db.get(Note, result["note_id"])
        assert note.original_content.startswith("OCR")
        assert note.title.startswith("OCR")
        assert not note.summary

    def test_no_degraded_flag_on_success(self, worker, db):
        tasks, statuses, uid, mp = worker

        async def fake_ocr(images_data):
            return "OCR 正文"

        async def fake_llm(text, fallback_title=""):
            return {"title": "正常提炼标题", "summary": "摘要", "key_points": ["要点"], "tags": ["标签"]}

        mp.setattr(tasks, "ocr_images", fake_ocr)
        mp.setattr(tasks, "extract_knowledge", fake_llm)
        tasks.process_screenshots_task("t-ok", uid, [b"fake-png"])
        status, result = statuses[-1]
        assert (status, result["degraded"]) == ("completed", False)

    def test_empty_ocr_still_fails(self, worker):
        tasks, statuses, uid, mp = worker
        mp.setattr(tasks, "ocr_images", lambda images_data: asyncio.sleep(0, result="   "))
        tasks.process_screenshots_task("t-empty", uid, [b"fake-png"])
        assert statuses[-1][0] == "failed"

    def test_url_task_reports_degraded_flag(self, worker):
        tasks, statuses, uid, mp = worker

        async def fake_scrape(url):
            return {"content": "抓到的正文内容", "title": "抓到标题", "source_type": "web_article"}

        async def fake_llm(text, fallback_title=""):
            return {"title": "正常提炼标题", "summary": "s", "key_points": [], "tags": []}

        mp.setattr(tasks, "scrape_url", fake_scrape)
        mp.setattr(tasks, "extract_knowledge", fake_llm)
        tasks.process_url_task("t-url", uid, "https://example.com/x")
        status, result = statuses[-1]
        assert status == "completed" and result["degraded"] is False
