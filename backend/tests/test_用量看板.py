"""后台「用量看板」那一栏（站长 10-25「你在后台做个用量看板，实时提供用量数据，DeepSeek 有专门的 API 查询接口」）的守门用例。

分组按"这一栏哪天会以什么方式说假话"来排，不按代码文件排：

- 第一组（那只口）：**真从 HTTP 走进去**。10-25 第七十次现网自证抓到过一只 404——一只新口
  没有一条从 HTTP 打进去的用例，"注册在哪个路径上"这件事就零判据，服务照常起、日志一声不响。
  鉴权那一侧照旧两条：没票 401、口令没配 503。
- 第二组（DeepSeek 那一半）：无钥态**一次网都不出**；上游 200 把那四栏收成数；非 200 只回一句话、
  **既不把钥递出去也不转述上游回体**；超时不许崩成 500。上游一律用假的——这一套跑一条出网请求都不该有。
- 第三组（只读）：看一眼余额不许写 `daily_usage`，也不许改那两张档名的任何一行。
- 第四组（小程序那一半）：数只对得上库里、缺的那天补 0、档位与 `limit_of()` 同源（不许在页面或这里抄一份 50）。
- 第五组（那一页）：左栏挂得上那一格（与图片栏／文案栏同一条纪律），两张卡各说各的产品，
  **不许出现一个把次数与余额加在一起的"总用量"**。

跑法：cd backend && .venv/bin/python -m pytest tests/test_用量看板.py -q
"""
import os
import sys
from datetime import datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_usage_board.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
os.environ["SEC_CHECK_ENABLED"] = "false"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.daily_usage import DailyUsage
from app.services import daily_budget, usage_board

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADMIN_PW = "pytest-admin-token-not-a-real-one-32"
BOARD = "/api/admin/usage/board"
# 哨兵钥：三条"不许外流"的尺子（回体、上游回体、那一页 HTML）都拿同一个串扫。
SENTINEL_KEY = "sk-SENTINEL-绝不该出现在任何一个出口-9f3a"
# 上游错误回体里埋一枚记号：非 200 时这一栏只许回状态码与一句话，不许把回体往外递。
UPSTREAM_BODY_MARKER = "这段回体绝不该被转述-4b7c"


@pytest.fixture()
def admin_pw(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_TOKEN", ADMIN_PW)


@pytest.fixture()
def client():
    app.state.limiter.enabled = False
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


@pytest.fixture()
def no_key(monkeypatch):
    """库里那一行不存在（`db` 刚重建过）＋兜底那一路也空 ⇒ 无钥态。"""
    monkeypatch.setattr(settings, "DEEPSEEK", "")


class FakeResp:
    def __init__(self, status_code=200, payload=None, body_text="", content_type="application/json"):
        self.status_code = status_code
        self._payload = payload
        self.text = body_text
        self.headers = {"content-type": content_type}

    def json(self):
        return self._payload


def install_fake_get(monkeypatch, resp=None, raises=None):
    """把上游换成假的，同时记下"打没打过、带了什么头"。这一套用例一条真请求都不该发出去。"""
    calls = []

    def fake_get(url, headers=None, timeout=None):
        calls.append({"url": url, "headers": dict(headers or {}), "timeout": timeout})
        if raises is not None:
            raise raises
        return resp

    monkeypatch.setattr(usage_board.httpx, "get", fake_get)
    return calls


def login(client, pw=ADMIN_PW) -> str:
    r = client.post("/api/admin/login", json={"token": pw})
    assert r.status_code == 200, r.text
    return r.json()["session"]


def ah(client) -> dict:
    return {"Authorization": f"Bearer {login(client)}"}


def today() -> str:
    return datetime.now(daily_budget.DAILY_TZ).strftime("%Y-%m-%d")


def shift(days: int) -> str:
    return (datetime.now(daily_budget.DAILY_TZ) + timedelta(days=days)).strftime("%Y-%m-%d")


def seed(db, user_id, day, kind, count):
    db.add(DailyUsage(user_id=user_id, day=day, kind=kind, count=count))
    db.commit()


# ---------------------------------------------------------------- 一、那只口：真从 HTTP 走得进去

def test_那只口注册在预期路径上且回体形状齐(client, admin_pw, db, no_key, monkeypatch):
    calls = install_fake_get(monkeypatch)
    r = client.get(BOARD, headers=ah(client))
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"mini_program", "deepseek"}
    assert set(body["mini_program"]) >= {"tz", "window_days", "today", "by_kind", "per_day", "limits"}
    assert set(body["deepseek"]) >= {"key_present", "state", "sentence", "fetched_at",
                                     "balances", "forward_route_mounted", "calls_today"}
    assert calls == []  # 无钥态不该碰上游
    # 本地这棵树里 roammark 那两只文件是挂在路由上的（仓库 HEAD 有），现网那一刻是另一回事；
    # 这一栏只保证"这个布尔是从真实路由表现读的"，不保证它在两边同一个值。
    assert body["deepseek"]["forward_route_mounted"] is True


def test_没票401(client, admin_pw, db, no_key, monkeypatch):
    install_fake_get(monkeypatch)
    assert client.get(BOARD).status_code == 401


def test_口令没配一律503不是401(client, db, no_key, monkeypatch):
    """401 让人以为"口令打错了"，真实情况是"这台服务器还没开这一页"——两个状态码得能分开。"""
    install_fake_get(monkeypatch)
    # 走 monkeypatch 而不是直接赋值：后者会把空口令漏给后面每一条用例（夹具不会替我还原）。
    monkeypatch.setattr(settings, "ADMIN_TOKEN", "")
    assert client.get(BOARD).status_code == 503


# ---------------------------------------------------------------- 二、DeepSeek 那一半：四态都要有形状

def test_有钥才打上游且打的是余额那只口(client, admin_pw, db, monkeypatch):
    monkeypatch.setattr(settings, "DEEPSEEK", SENTINEL_KEY)
    resp = FakeResp(payload={"is_available": True, "balance_infos": [
        {"currency": "CNY", "total_balance": 12.5, "granted_balance": 10.0, "topped_up_balance": 2.5}]})
    calls = install_fake_get(monkeypatch, resp=resp)
    body = client.get(BOARD, headers=ah(client)).json()["deepseek"]
    assert len(calls) == 1, calls
    assert calls[0]["url"].endswith("/user/balance"), calls[0]["url"]
    assert calls[0]["headers"]["Authorization"] == "Bearer " + SENTINEL_KEY
    assert body["state"] == "ok" and body["is_available"] is True
    assert body["balances"] == [{"currency": "CNY", "total": 12.5, "granted": 10.0, "topped_up": 2.5}]
    # 赠金与充值分开念：两者同时在的时候先扣赠金，"会过期的那一部分"必须看得分开。
    assert "赠金" in body["sentence"] and "充值" in body["sentence"] and "12.5" in body["sentence"]


def test_官方把金额回成字符串时屏上那个数不许消失(client, admin_pw, db, monkeypatch):
    """现网 10-26 现读：`/user/balance` 回的是 **字符串** `'11.02'`／`'0.00'`，不是数。

    上面那一条用例喂的是浮点，所以它绿着而屏上念「共 —」——断言依赖的形状必须与真上游一致，
    否则"测试全绿" cover 的是我自己编的那份回体。这一条就是照现网那一份逐字喂的。
    """
    monkeypatch.setattr(settings, "DEEPSEEK", SENTINEL_KEY)
    resp = FakeResp(payload={"is_available": True, "balance_infos": [
        {"currency": "CNY", "total_balance": "11.02", "granted_balance": "0.00", "topped_up_balance": "11.02"}]})
    install_fake_get(monkeypatch, resp=resp)
    body = client.get(BOARD, headers=ah(client)).json()["deepseek"]
    assert body["state"] == "ok"
    assert body["balances"] == [{"currency": "CNY", "total": 11.02, "granted": 0.0, "topped_up": 11.02}]
    assert "—" not in body["sentence"], body["sentence"]
    assert "11.02" in body["sentence"]


def test_金额那几栏读不出数时保持没报不许补零(client, admin_pw, db, monkeypatch):
    """空串与 `'abc'` 都不能变成 0.0：0 的意思是"没钱了"，读不出是"没报"，两句话相反。"""
    monkeypatch.setattr(settings, "DEEPSEEK", SENTINEL_KEY)
    install_fake_get(monkeypatch, resp=FakeResp(payload={"is_available": True, "balance_infos": [
        {"currency": "CNY", "total_balance": "", "granted_balance": "abc", "topped_up_balance": None}]})
    )
    row = client.get(BOARD, headers=ah(client)).json()["deepseek"]["balances"][0]
    assert row["total"] is None and row["granted"] is None and row["topped_up"] is None


def test_回体里有指纹但没有钥值(client, admin_pw, db, monkeypatch):
    monkeypatch.setattr(settings, "DEEPSEEK", SENTINEL_KEY)
    install_fake_get(monkeypatch, resp=FakeResp(payload={"is_available": True, "balance_infos": []}))
    r = client.get(BOARD, headers=ah(client))
    assert SENTINEL_KEY not in r.text
    ds = r.json()["deepseek"]
    assert ds["key_present"] is True and ds["key_length"] == len(SENTINEL_KEY)
    assert ds["key_fingerprint"] and SENTINEL_KEY not in ds["key_fingerprint"]


def test_上游非200只回一句话不转述回体(client, admin_pw, db, monkeypatch):
    monkeypatch.setattr(settings, "DEEPSEEK", SENTINEL_KEY)
    install_fake_get(monkeypatch, resp=FakeResp(
        status_code=401, payload=None, body_text=UPSTREAM_BODY_MARKER, content_type="text/plain"))
    r = client.get(BOARD, headers=ah(client))
    assert SENTINEL_KEY not in r.text and UPSTREAM_BODY_MARKER not in r.text
    ds = r.json()["deepseek"]
    assert ds["state"] == "rejected" and ds["status_code"] == 401
    assert "401" in ds["sentence"] and "余额没读到" in ds["sentence"]


def test_超时与打不通都不许崩成500(client, admin_pw, db, monkeypatch):
    monkeypatch.setattr(settings, "DEEPSEEK", SENTINEL_KEY)
    install_fake_get(monkeypatch, raises=httpx.TimeoutException("boom"))
    r = client.get(BOARD, headers=ah(client))
    assert r.status_code == 200, r.text
    ds = r.json()["deepseek"]
    assert ds["state"] == "timeout" and str(int(usage_board.BALANCE_TIMEOUT)) in ds["sentence"]

    install_fake_get(monkeypatch, raises=httpx.ConnectError("boom"))
    assert client.get(BOARD, headers=ah(client)).json()["deepseek"]["state"] == "unreachable"


def test_上游回200但余额那一列是空的也要出声(client, admin_pw, db, monkeypatch):
    """这一格不能塌成"余额 0"：0 与"没报"是两个意思，念错方向就是假账。"""
    monkeypatch.setattr(settings, "DEEPSEEK", SENTINEL_KEY)
    install_fake_get(monkeypatch, resp=FakeResp(payload={"is_available": True, "balance_infos": []}))
    ds = client.get(BOARD, headers=ah(client)).json()["deepseek"]
    assert ds["state"] == "ok" and ds["balances"] == []
    assert "余额那一列是空的" in ds["sentence"]


def test_占位符不当成能用的钥打出去(client, admin_pw, db, monkeypatch):
    """现网库里/`.env` 那一把今天正是占位符。把它当"钥在（长度 24）"打出去，换来的是一次 401，
    屏上念"这把钥打不通"——那与真打不通是两句话，操作者会去查一把本来就假的钥。"""
    monkeypatch.setattr(settings, "DEEPSEEK", "sk-xxxxxxxxxxxxxxxx")
    calls = install_fake_get(monkeypatch, resp=FakeResp(payload={"is_available": True, "balance_infos": []}))
    ds = client.get(BOARD, headers=ah(client)).json()["deepseek"]
    assert calls == []
    assert ds["state"] == "no_key" and ds["key_present"] is False
    assert "占位符" in ds["sentence"]


def test_今天转发几条没那一档时不许念成0(client, admin_pw, db, no_key, monkeypatch):
    """上游只给余额、不给明细，"今天花了多少条"必须由我们自己记一笔。
    那一笔记在 RoamMark 那条链里（未上现网），所以这一栏今天读它必然是"还没开始记"——
    念成 0 就是假话：0 的意思是"今天没人用"，会把他推向"这条链没人要"那个相反的决定。"""
    install_fake_get(monkeypatch)
    ds = client.get(BOARD, headers=ah(client)).json()["deepseek"]
    assert ds["calls_today"] is None

    seed(db, "ub-roam", today(), usage_board.DRAFT_KIND, 4)
    seed(db, "ub-roam2", today(), usage_board.DRAFT_KIND, 3)
    ds = client.get(BOARD, headers=ah(client)).json()["deepseek"]
    assert ds["calls_today"] == 7


# ---------------------------------------------------------------- 三、只读：这一栏不许写任何东西

def test_读余额前后库里一个字都不变(client, admin_pw, db, monkeypatch):
    monkeypatch.setattr(settings, "DEEPSEEK", SENTINEL_KEY)
    install_fake_get(monkeypatch, resp=FakeResp(payload={"is_available": True, "balance_infos": []}))
    seed(db, "ub-row", today(), daily_budget.KIND_SEC_CHECK, 7)
    before = db.query(DailyUsage).count()
    stamps = {r.updated_at for r in db.query(DailyUsage).all()}
    client.get(BOARD, headers=ah(client))
    assert db.query(DailyUsage).count() == before == 1
    assert {r.updated_at for r in db.query(DailyUsage).all()} == stamps
    assert db.query(DailyUsage).filter(DailyUsage.kind == "admin_view").count() == 0


# ---------------------------------------------------------------- 四、小程序那一半：数只对得上库

def test_今日与窗口合计对得上且缺的那天补0(client, admin_pw, db, no_key, monkeypatch):
    install_fake_get(monkeypatch)
    seed(db, "ub-a", today(), daily_budget.KIND_EXTRACT, 3)
    seed(db, "ub-b", today(), daily_budget.KIND_EXTRACT, 4)
    seed(db, "ub-a", today(), daily_budget.KIND_SEC_CHECK, 11)
    seed(db, "ub-c", shift(-3), daily_budget.KIND_EXTRACT, 5)
    body = client.get(BOARD + "?days=7", headers=ah(client)).json()["mini_program"]
    assert body["window_days"] == 7 and body["today"] == today()
    ex, sc = body["by_kind"]["extract"], body["by_kind"]["sec_check"]
    assert (ex["today"], ex["used"], ex["people"]) == (7, 12, 2), (ex, sc)
    assert (sc["today"], sc["used"], sc["people"]) == (11, 11, 1), sc
    assert len(body["per_day"]) == 7
    assert [r["date"] for r in body["per_day"]] == [shift(i) for i in range(-6, 1)]
    # 缺的那天是 0 而不是"没这一行"——"三天没数"与"那三天没人来"得能分开。
    gap = [r for r in body["per_day"] if r["date"] == shift(-1)][0]
    assert gap["extract"] == 0 and gap["sec_check"] == 0
    assert body["per_day"][-1]["extract"] == 7


def test_窗口外的行不算进来(client, admin_pw, db, no_key, monkeypatch):
    install_fake_get(monkeypatch)
    seed(db, "ub-old", shift(-30), daily_budget.KIND_EXTRACT, 99)
    body = client.get(BOARD + "?days=14", headers=ah(client)).json()["mini_program"]
    assert body["by_kind"]["extract"]["used"] == 0
    assert body["by_kind"]["extract"]["today"] == 0


def test_档位与limit_of同源不许抄字面数(client, admin_pw, db, no_key, monkeypatch):
    install_fake_get(monkeypatch)
    body = client.get(BOARD, headers=ah(client)).json()["mini_program"]
    for kind in daily_budget.KINDS:
        assert body["limits"][kind] == daily_budget.limit_of(kind)
        assert body["by_kind"][kind]["limit"] == daily_budget.limit_of(kind)


# ---------------------------------------------------------------- 五、那一页：左栏挂得上、两个产品不许混

def test_左栏那一格与那张卡都挂得上():
    """只加后端那只口、忘了左栏那一格＝这一栏在屏上没有入口（与图片栏／文案栏同一条纪律）。"""
    page = page_body()
    assert "{ label: '用量看板', view: 'stats', key: 'aiusage' }" in page
    assert 'id="aiusage"' in page
    assert "api/admin/usage/board" in page


def test_两张卡各说各的产品():
    """站长的原话是这一格分两张卡的唯一依据：「DeepSeek 才是付费的，那是 iPhone 版的，
    不要和小程序搞混了」。所以「免费 Token 包」必须只挂在小程序那张卡上，
    「付费」只挂在 RoamMark 那张卡上，两处不许互推。"""
    page = page_body()
    seg = page.split("function renderUsage", 1)[1].split("function loadUsage", 1)[0]
    c1, _, c2 = seg.partition("RoamMark（iPhone 版）")
    assert "图麦笔记这一侧的调用计数" in c1 and "免费 Token 包" in c1
    assert "付费" in c2 and "user/balance" in c2
    assert "没有按天用量" in c2 or "没有按天用量／账单明细接口" in c2
    # 「总用量」这种东西不许存在：次数与余额加在一起没有任何含义。
    assert "总用量" not in seg


def test_那一页里没有钥值():
    page = page_body()
    assert SENTINEL_KEY not in page


def test_余额那一栏红了不许把统计八栏一起带走():
    """这一栏单独吃一只会出网的口；它的错法只能有一句话，不许把 `#stats` 那一个容器清空。"""
    page = page_body()
    seg = page.split("function loadUsage", 1)[1].split("\nfunction refresh", 1)[0]
    assert "$('aiusage')" in seg
    assert "$('stats')" not in seg
    assert "e.status === 401" in seg


def page_body() -> str:
    with open(os.path.join(BACKEND, "app", "api", "routes", "ops_page.py"), encoding="utf-8") as f:
        return f.read().split("_PAGE", 1)[1]
