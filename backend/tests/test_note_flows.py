"""后端核心闭环回归测试：搜索范围、跨用户隔离、提炼降级。

与 deploy 无关，可反复执行；使用 /tmp 下独立的 sqlite 库，不接触真实数据。

    cd backend && .venv/bin/python -m pytest tests/ -v
"""
import asyncio
import os
import re
import sys
from datetime import datetime, timedelta, timezone

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"  # 提炼直接走降级，测试期间不发出任何出网请求
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
from app.models.user_profile import UserProfile

MARK_A = "只有A知道的正文串AZ3K"
MARK_B = "只有B知道的正文串BQ7L"


def _fresh_user(db, tag: str, nickname=None) -> User:
    """给"标题组装"那几条尺子单独造一个人。

    不复用 module 级 `users` 里的 a：那一位要留给搜索／隔离那一堆，而这几条要往他身上写
    名片名称、昵称、以及一批带尾号的笔记——共用一个人名下攒下的号会把邻居那条一起改掉。
    """
    user = User(openid=f"pytest-img-note-{tag}", nickname=nickname)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


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
        assert key_usable("your-cloud-function-key") is False
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

        async def fake_llm(text, fallback_title="", translate=None):
            return {"title": "正常提炼标题", "summary": "摘要", "key_points": ["要点"], "tags": ["标签"]}

        mp.setattr(tasks, "ocr_images", fake_ocr)
        mp.setattr(tasks, "extract_knowledge", fake_llm)
        tasks.process_screenshots_task("t-ok", uid, [b"fake-png"])
        status, result = statuses[-1]
        assert (status, result["degraded"]) == ("completed", False)

    def test_empty_ocr_downgrades_to_an_image_note(self, worker, db):
        """站长 10-19：认不出字不许报错，降档成一篇只有图的笔记，标题自动组装。

        这一条以前叫 `test_empty_ocr_still_fails`，钉的是"就该失败"。判据跟着他改口径，
        不是为旧尺子迁就代码。
        """
        tasks, statuses, _, mp = worker
        user = _fresh_user(db, "plain")
        mp.setattr(tasks, "ocr_images", lambda images_data: asyncio.sleep(0, result="   "))

        seen = []
        async def fake_extract(text, fallback_title="", translate=None):
            seen.append(text)
            return {"title": "不该出现", "summary": "不该出现", "key_points": [], "tags": []}
        mp.setattr(tasks, "extract_knowledge", fake_extract)

        tasks.process_screenshots_task("t-img", str(user.id), [b"fake-png"], generation=user.generation)
        status, result = statuses[-1]
        assert (status, result["image_only"]) == ("completed", True)
        assert "degraded" not in result, "这一趟不是「LLM 不可用、原文照存」，两枚标记不许混用"
        assert seen == [], "一个字的都没有，不该再花一次提炼"

        note = db.get(Note, result["note_id"])
        assert note.source_type == "screenshot"  # 他点甲：来源那一格不动，仍念「截图识别」
        assert not note.original_content and not note.summary and not note.key_points
        mmdd = tasks._cn_day_window(datetime.now(timezone.utc))[2]
        assert result["title"] == f"我的图片笔记 {mmdd}01"
        assert note.title == result["title"]

    def test_image_note_seq_takes_max_existing_tail_plus_one(self, worker, db):
        """序号＝当天已有尾号取最大 +1（他点的正是这一条，不是数行数）。"""
        tasks, statuses, _, mp = worker
        user = _fresh_user(db, "seq")
        mp.setattr(tasks, "ocr_images", lambda images_data: asyncio.sleep(0, result=" "))
        uid = str(user.id)
        mmdd = tasks._cn_day_window(datetime.now(timezone.utc))[2]

        got = []
        for i in (1, 2):
            tasks.process_screenshots_task(f"t-seq-{i}", uid, [b"p"], generation=user.generation)
            got.append(statuses[-1][1]["title"])
        assert got == [f"我的图片笔记 {mmdd}01", f"我的图片笔记 {mmdd}02"]

        # 他自己把第二篇改成占着 07：下一篇跳 08。宁可空掉 02–06，也不发一个已存在的号
        db.query(Note).filter(Note.user_id == uid, Note.title == got[1]).update(
            {"title": f"我的图片笔记 {mmdd}07"})
        db.commit()
        db.expire_all()
        tasks.process_screenshots_task("t-seq-3", uid, [b"p"], generation=user.generation)
        assert statuses[-1][1]["title"] == f"我的图片笔记 {mmdd}08"

    def test_image_note_seq_only_reads_todays_window(self, worker, db):
        """窗口先按北京那一天筛，尾号只在筛出来的那些里取。

        造一条"标题带着今天的四位、其实写在昨天那一格"的笔记：它不许把今天的 01 顶成 07。
        """
        tasks, statuses, _, mp = worker
        from app.tasks.ingest_tasks import _cn_day_window

        user = _fresh_user(db, "window")
        uid = str(user.id)
        _, _, mmdd = _cn_day_window(datetime.now(timezone.utc))
        db.add(Note(user_id=uid, title=f"我的图片笔记 {mmdd}06", source_type="screenshot",
                    created_at=(datetime.now(timezone.utc) - timedelta(days=1)).replace(tzinfo=None)))
        db.commit()
        db.expire_all()

        mp.setattr(tasks, "ocr_images", lambda images_data: asyncio.sleep(0, result=""))
        tasks.process_screenshots_task("t-win", uid, [b"p"], generation=user.generation)
        assert statuses[-1][1]["title"] == f"我的图片笔记 {mmdd}01"

    def test_beijing_day_window_conversion(self):
        """库里 `created_at` 是朴素 UTC（实测：北京 11:03 那篇存成 `03:03:57`），
        所以"今天"必须先换成北京日、再把窗口两端折算回朴素 UTC。凌晨那两个小时最容易错一天。"""
        from app.tasks.ingest_tasks import _cn_day_window

        start, end, mmdd = _cn_day_window(datetime(2026, 10, 18, 17, 0, tzinfo=timezone.utc))
        assert mmdd == "1019", "北京 10-19 凌晨 1 点，不是 10-18"
        assert (start, end) == (datetime(2026, 10, 18, 16), datetime(2026, 10, 19, 16))

    def test_title_prefix_three_level_fallback(self, worker, db):
        """名称 → 微信昵称 → 固定词「我的」；空白串那一格按"没填"处理。"""
        tasks = worker[0]
        user = _fresh_user(db, "name")
        uid = str(user.id)
        assert tasks._owner_name(db, uid, user) == "我的"

        user.nickname = "微信那串昵称"
        db.commit()
        assert tasks._owner_name(db, uid, user) == "微信那串昵称"

        db.add(UserProfile(user_id=uid, name="阿麦"))
        db.commit()
        db.expire_all()
        assert tasks._owner_name(db, uid, user) == "阿麦"

        db.query(UserProfile).filter(UserProfile.user_id == uid).update({"name": "   "})
        db.commit()
        db.expire_all()
        assert tasks._owner_name(db, uid, user) == "微信那串昵称"

    def test_multi_page_screenshot_title_is_not_the_page_marker(self, worker, db):
        """R17：多张图仍带分页标记，降级标题必须跳过它取真正的正文行。"""
        tasks, statuses, uid, mp = worker

        async def fake_ocr(images_data):
            return "--- 第1页 ---\n产品周会纪要\n第一条要点\n\n--- 第2页 ---\n第二页正文"

        mp.setattr(tasks, "ocr_images", fake_ocr)
        tasks.process_screenshots_task("t-title", uid, [b"a", b"b"])
        status, result = statuses[-1]
        assert (status, result["degraded"]) == ("completed", True)
        note = db.get(Note, result["note_id"])
        assert note.title == "产品周会纪要"

    def test_url_task_reports_degraded_flag(self, worker):
        tasks, statuses, uid, mp = worker

        async def fake_scrape(url):
            return {"content": "抓到的正文内容", "title": "抓到标题", "source_type": "web_article"}

        async def fake_llm(text, fallback_title="", translate=None):
            return {"title": "正常提炼标题", "summary": "s", "key_points": [], "tags": []}

        mp.setattr(tasks, "scrape_url", fake_scrape)
        mp.setattr(tasks, "extract_knowledge", fake_llm)
        tasks.process_url_task("t-url", uid, "https://example.com/x")
        status, result = statuses[-1]
        assert status == "completed" and result["degraded"] is False


class TestScrapeErrorWording:
    """URL 链路失败时 error 会直接进 toast：只允许中文短句，技术原文留日志。"""

    def test_non_http_scheme_is_chinese(self):
        from app.services.scraper import UserError, scrape_url

        with pytest.raises(UserError) as exc:
            asyncio.run(scrape_url("ftp://example.com/a"))
        assert "不支持的协议" in str(exc.value)

    def test_unexpected_error_becomes_generic(self, monkeypatch):
        import httpx

        from app.services import scraper

        async def refused(url):
            raise httpx.ConnectError("Connection refused by host")

        monkeypatch.setattr(scraper, "_fetch_and_parse", refused)
        with pytest.raises(scraper.UserError) as exc:
            asyncio.run(scraper.scrape_url("https://example.com/a"))
        assert str(exc.value) == scraper.GENERIC_FETCH_ERROR
        assert "Connection" not in str(exc.value)
        assert len(str(exc.value)) <= 30

    @pytest.mark.parametrize(
        "code,expect",
        [(401, "登录"), (403, "登录"), (404, "不存在"), (500, "HTTP 500")],
    )
    def test_status_hints(self, code, expect):
        from app.services.scraper import _status_hint

        assert expect in _status_hint(code)


SECRET_SENTINEL = "SENTINEL-app-secret-7f3d"


class _FakeResponse:
    def __init__(self, status, body, payload):
        self.status_code = status
        self.text = body
        self._payload = payload

    def json(self):
        if self._payload is None:
            raise ValueError("Expecting value: line 1 column 1 (char 0)")
        return self._payload


def _stub_wechat_http(monkeypatch, module, status=200, body="", payload=None):
    """替掉 httpx：把真实请求 URL（query 里带 AppSecret）留在 list 里，供断言"它确实出去了"。"""
    from urllib.parse import urlencode

    sent = []
    resp = _FakeResponse(status, body, payload)

    class _Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, params=None):
            sent.append(f"{url}?{urlencode(params or {})}")
            return resp

        async def post(self, url, json=None, **k):
            # 稳定版 token 接口把凭据放在 POST body 里，所以这里也要把 body 记下来，
            # 断言才覆盖得住"secret 会不会从异常文本出去"。
            sent.append(f"{url}?{urlencode(json or {})}")
            return resp

    monkeypatch.setattr(module.httpx, "AsyncClient", _Client)
    monkeypatch.setattr(module.settings, "WECHAT_APP_SECRET", SECRET_SENTINEL)
    return sent


class TestCredentialErrorsDoNotLeak:
    """AppSecret 只在服务器 .env 里；异常文本、日志、HTTP detail 三处都不许带上它。"""

    def test_access_token_http_error_is_sanitized(self, monkeypatch, caplog):
        from app.core.errors import UserError
        from app.services import wechat

        monkeypatch.setattr(wechat, "_access_token_cache", {"token": None, "expires_at": 0})
        sent = _stub_wechat_http(monkeypatch, wechat, status=502, body="bad gateway")
        caplog.set_level("DEBUG")

        with pytest.raises(UserError) as exc:
            asyncio.run(wechat.get_access_token())

        assert SECRET_SENTINEL not in str(exc.value)
        assert SECRET_SENTINEL not in caplog.text
        assert SECRET_SENTINEL in sent[0]  # 说明确实是那条含凭据的请求
        assert "502" in caplog.text

    def test_access_token_rejected_by_wechat_is_sanitized(self, monkeypatch, caplog):
        from app.core.errors import UserError
        from app.services import wechat

        monkeypatch.setattr(wechat, "_access_token_cache", {"token": None, "expires_at": 0})
        _stub_wechat_http(monkeypatch, wechat, payload={"errcode": 40013, "errmsg": "invalid appid"})
        caplog.set_level("DEBUG")

        with pytest.raises(UserError) as exc:
            asyncio.run(wechat.get_access_token())
        assert "微信接口暂不可用" in str(exc.value)
        assert "invalid appid" in caplog.text

    def test_code2session_rejects_non_json_and_hides_errmsg(self, monkeypatch, caplog):
        """不打路由，直接测这个函数：路由上有 slowapi 限流，那会需要 Redis。"""
        from fastapi import HTTPException

        from app.core import auth

        _stub_wechat_http(monkeypatch, auth, status=200, body="<html>502 Bad Gateway</html>")
        caplog.set_level("DEBUG")
        with pytest.raises(HTTPException) as exc:
            asyncio.run(auth._wechat_code2session("x" * 12))
        assert exc.value.status_code == 502
        assert SECRET_SENTINEL not in exc.value.detail and "Bad Gateway" not in exc.value.detail
        assert SECRET_SENTINEL not in caplog.text

        _stub_wechat_http(monkeypatch, auth, payload={"errcode": 40029, "errmsg": "invalid code"})
        with pytest.raises(HTTPException) as exc:
            asyncio.run(auth._wechat_code2session("x" * 12))
        assert exc.value.status_code == 401 and "invalid code" not in exc.value.detail

        _stub_wechat_http(monkeypatch, auth, status=500, body="gateway blew up")
        with pytest.raises(HTTPException) as exc:
            asyncio.run(auth._wechat_code2session("x" * 12))
        assert exc.value.status_code == 502 and "gateway" not in exc.value.detail

    def test_qrcode_failure_detail_has_no_credential(self, client, ha, notes, monkeypatch):
        from app.api.routes import shares as shares_route

        token = client.post("/api/shares/", json={"note_id": notes["a_body"]}, headers=ha).json()["token"]

        async def exploding_qr(scene, page=""):
            raise RuntimeError(
                f"Server error '500 Internal Server Error' for url "
                f"'https://api.weixin.qq.com/cgi-bin/token?appid=wx1&secret={SECRET_SENTINEL}'"
            )

        monkeypatch.setattr(shares_route, "get_qr_code_image", exploding_qr)
        resp = client.get(f"/api/shares/{token}/qrcode")
        assert resp.status_code == 502
        assert SECRET_SENTINEL not in resp.text and "url" not in resp.text


class Test列表只按日期倒序:
    """站长 10-04 真机：「排序没有按照日期倒序，要改」。

    根因不是客户端排错了（客户端一列都不自己算，`index.js` 里没有任何 sort），
    而是列表排序前两档「钉着的浮在最前、再按钉的时间」——置顶这个能力在客户端
    10-03 已经整条撤净（列表、详情窗、独立详情页三处入口都没了），而他库里那两篇
    还钉着（现网实测 notes.id=7、id=8 `is_pinned=1`），于是 09/23 那篇压在 10/04 上面。
    只清数据不改这条，以后任何一篇被别的路径钉上就又会跳顶，所以钉的是规则本身。
    """

    @staticmethod
    def _mk(db, uid, title, month, day):
        from datetime import datetime

        n = Note(user_id=str(uid), title=title, summary="", content="",
                 original_content="", source_type="manual", tags=[], key_points=[],
                 created_at=datetime(2026, month, day))
        db.add(n)
        db.commit()
        return n.id

    def test_钉着的那篇不许再压在最新那篇上面(self, client, db):
        # 单开一个用户：这三篇只属于本用例，不会去动 module 级那批笔记的条数判据
        u = User(openid="pytest-order-user")
        db.add(u)
        db.commit()
        h = {"Authorization": f"Bearer {_create_token(u.id)}"}
        old = self._mk(db, u.id, "最老那篇", 9, 23)
        new = self._mk(db, u.id, "最新那篇", 10, 4)
        mid = self._mk(db, u.id, "中间那篇", 9, 25)
        # 走现网那个 pin 接口钉，不手写 SQL：这样"接口还在、列表不再理它"这件事本身也被钉住
        assert client.post(f"/api/notes/{old}/pin", params={"pin": True}, headers=h).status_code == 200
        got = [n["id"] for n in client.get("/api/notes/", headers=h).json()]
        assert got == [new, mid, old], got

    def test_撤掉置顶之后顺序一字不变(self, client, db):
        # 反向钉：撤与不撤画出来的是同一个序——证明这一档排序真的不再参与，
        # 而不是"恰好那篇本来就最新"
        u = User(openid="pytest-order-user2")
        db.add(u)
        db.commit()
        h = {"Authorization": f"Bearer {_create_token(u.id)}"}
        old = self._mk(db, u.id, "最老那篇", 9, 23)
        new = self._mk(db, u.id, "最新那篇", 10, 4)
        before = [n["id"] for n in client.get("/api/notes/", headers=h).json()]
        client.post(f"/api/notes/{old}/pin", params={"pin": True}, headers=h)
        pinned = [n["id"] for n in client.get("/api/notes/", headers=h).json()]
        client.post(f"/api/notes/{old}/pin", params={"pin": False}, headers=h)
        unpinned = [n["id"] for n in client.get("/api/notes/", headers=h).json()]
        assert before == pinned == unpinned == [new, old], (before, pinned, unpinned)
