"""App Store Connect 数据进后台这一条链（「iPhone 数据」那一栏的地基）。

尺子按"这一栏上现网之后最可能怎么坏"分组：

- 第一组（门）：两个新口都挂在管理票后面；没配 ASC_* 时是 503 的人话，不是 401、不是 500。
- 第二组（两头各自的账）：sales 的 TSV 聚合、analytics 的 JSONL 聚合、按报告映射——
  这些解析器喂的是 Apple 文档形状的样本，不是真报文（首批实例 24–48 小时后才出现，
  等真数据到手那天，样本要拿真行校一遍再改）。
- 第三组（同步那一趟）：假上游（monkeypatch `_http_get`，整套用例零出网）钉
  "404=那天没数不写行"、"两头都来同一天 downloads 谁说了算"、"重复拉不长新行"。
- 第四组（值不外流）：.p8 私钥内容与 JWT 一次都不进回体——拿哨兵原值扫全部响应文本。

跑法：cd backend && .venv/bin/python -m pytest tests/test_asc_reports.py -q
"""
import gzip
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_asc.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
os.environ["SEC_CHECK_ENABLED"] = "false"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.asc_daily import AscDaily
from app.services import asc_reports

ADMIN_PW = "pytest-admin-token-not-a-real-one-32"
# 哨兵：假私钥里埋这一句，"值不外流"那三条尺子拿它扫每一个响应出口。
SENTINEL = "asc-SENTINEL-private-key-never-leaves-the-server-77a1"
SALES_DATE = date.today() - timedelta(days=3)
ANALYTICS_DATE = SALES_DATE  # 同一天两头都来：钉 downloads 谁说了算


@pytest.fixture()
def admin_pw(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_TOKEN", ADMIN_PW)


@pytest.fixture()
def client(admin_pw):
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
def asc_config(monkeypatch, tmp_path):
    """五栏全配齐的形状：私钥是一把现场生成的真 EC 钥（ES256 签名要走真算法）。"""
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(serialization.Encoding.PEM,
                            serialization.PrivateFormat.PKCS8,
                            serialization.NoEncryption()).decode()
    assert SENTINEL not in pem  # 哨兵得靠我们自己埋：生成器不会替我们放
    pem += f"\n# {SENTINEL}\n"
    key_file = tmp_path / "AuthKey_PYTEST.p8"
    key_file.write_text(pem)
    monkeypatch.setattr(settings, "ASC_KEY_ID", "PYTESTKEY1")
    monkeypatch.setattr(settings, "ASC_ISSUER_ID", "pytest-issuer-uuid")
    monkeypatch.setattr(settings, "ASC_KEY_PATH", str(key_file))
    monkeypatch.setattr(settings, "ASC_VENDOR_NUMBER", "99999999")
    monkeypatch.setattr(settings, "ASC_APP_ID", "6815720286")
    return key_file


def login(client, pw=ADMIN_PW) -> str:
    r = client.post("/api/admin/login", json={"token": pw})
    assert r.status_code == 200, r.text
    return r.json()["session"]


def ah(client) -> dict:
    return {"Authorization": f"Bearer {login(client)}"}


# ---------------------------------------------------------------- 第一组：门

def test_两口没有管理票都是401(client, asc_config):
    assert client.get("/api/admin/asc/state").status_code == 401
    assert client.post("/api/admin/asc/sync").status_code == 401


def test_没配置是503说人话(client, admin_pw, monkeypatch):
    for name in ("ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_PATH",
                 "ASC_VENDOR_NUMBER", "ASC_APP_ID"):
        monkeypatch.setattr(settings, name, "")
    r = client.get("/api/admin/asc/state", headers=ah(client))
    assert r.status_code == 503
    assert "还没配置" in r.json()["detail"]
    r2 = client.post("/api/admin/asc/sync", headers=ah(client))
    assert r2.status_code == 503


def test_钥文件不在也是503(client, admin_pw, monkeypatch):
    monkeypatch.setattr(settings, "ASC_KEY_ID", "K")
    monkeypatch.setattr(settings, "ASC_ISSUER_ID", "I")
    monkeypatch.setattr(settings, "ASC_KEY_PATH", "/nonexistent/AuthKey.p8")
    monkeypatch.setattr(settings, "ASC_VENDOR_NUMBER", "1")
    monkeypatch.setattr(settings, "ASC_APP_ID", "2")
    r = client.get("/api/admin/asc/state", headers=ah(client))
    assert r.status_code == 503
    assert r.json()["detail"].endswith("没配齐")


# ---------------------------------------------------------------- 第二组：两个解析器

SALES_HEADER = ("Provider\tProvider Country\tSku\tDeveloper\tTitle\tVersion Type\t"
                "Product Type Identifier\tUnit Number\tDeveloper Proceeds\tBegin Date\t"
                "End Date\tCustomer Currency\tCountry Code\tCurrency of Proceeds")


def _sales_row(ptype: str, units: int, proceeds: str, currency: str,
               day: date) -> str:
    return (f"agentsbin\tUS\tcom.agentsbin.TumarkNote\tlongfei Zhao\tTumark Note\t1\t"
            f"{ptype}\t{units}\t{proceeds}\t{day.strftime('%m/%d/%Y')}\t"
            f"{day.strftime('%m/%d/%Y')}\tUSD\tUS\t{currency}")


def test_sales聚合_单币种():
    tsv = "\n".join([SALES_HEADER,
                     _sales_row("1", 5, "3.50", "USD", SALES_DATE),
                     _sales_row("7", 2, "0.00", "USD", SALES_DATE),
                     _sales_row("3", 1, "0.00", "USD", SALES_DATE)])
    day = asc_reports.parse_sales_tsv(tsv)
    assert day["report_date"] == SALES_DATE.isoformat()
    assert day["metrics"] == {"downloads": 5, "updates": 2, "redownloads": 1}
    assert day["proceeds"] == pytest.approx(3.50)
    assert day["currency"] == "USD"
    assert len(day["payload"]["sales_rows"]) == 3


def test_sales聚合_两种币不许加总():
    other = SALES_DATE.strftime('%m/%d/%Y')
    tsv = "\n".join([SALES_HEADER,
                     _sales_row("1", 5, "3.50", "USD", SALES_DATE),
                     f"agentsbin\tUS\tsku2\tdev\tT2\t1\t1\t4\t7.00\t{other}\t{other}\tEUR\tDE\tEUR"])
    day = asc_reports.parse_sales_tsv(tsv)
    assert day["proceeds"] is None and day["currency"] is None
    assert day["metrics"]["downloads"] == 9


def test_sales聚合_只有表头按没数回None():
    assert asc_reports.parse_sales_tsv(SALES_HEADER) is None


def test_sales聚合_未知产品类型码不丢进payload():
    tsv = "\n".join([SALES_HEADER, _sales_row("F1", 3, "1.20", "USD", SALES_DATE)])
    day = asc_reports.parse_sales_tsv(tsv)
    assert day["metrics"] == {"downloads": 0, "updates": 0, "redownloads": 0}
    assert day["payload"]["sales_rows"][0]["product_type"] == "F1"


def test_jsonl聚合_按日按metric():
    text = "\n".join([
        json.dumps({"date": ANALYTICS_DATE.isoformat(), "metric": "downloads",
                    "data": [{"platform": "iOS", "value": 3}]}),
        json.dumps({"date": ANALYTICS_DATE.isoformat(), "metric": "downloads",
                    "data": [{"platform": "macOS", "value": 1}]}),
        "不是JSON的一行",
        json.dumps({"date": "", "metric": "downloads", "data": []}),
        json.dumps({"date": ANALYTICS_DATE.isoformat(), "metric": "weirdMetric",
                    "data": [{"value": 9}]}),
    ])
    days = asc_reports.parse_analytics_jsonl(text)
    assert len(days) == 1
    d, metrics, rows = days[0]
    assert d == ANALYTICS_DATE.isoformat()
    assert metrics["downloads"] == pytest.approx(4.0)
    assert metrics["weirdMetric"] == pytest.approx(9.0)
    assert len(rows) == 3  # 坏行与空日期行留不到


def test_metric映射_按报告传_各报告互不串线():
    sessions_wanted = asc_reports.ANALYTICS_WANTED["App Sessions Standard"]
    fields, proceeds = asc_reports._analytics_fields(
        {"sessions": 10, "totalUniqueDevices": 4, "sales": 99.0}, sessions_wanted)
    assert fields == {"sessions": 10, "unique_devices": 4}
    assert proceeds is None  # sessions 那份报告里的 sales 不许被记成收入
    purchases_wanted = asc_reports.ANALYTICS_WANTED["App Store Purchases Standard"]
    fields2, proceeds2 = asc_reports._analytics_fields({"sales": 3.98}, purchases_wanted)
    assert fields2 == {} and proceeds2 == pytest.approx(3.98)


# ---------------------------------------------------------------- 第三组：同步那一趟

def _fake_upstream(monkeypatch):
    """假 Apple：sales 一天 404 一天 200；analytics 四份想要的报告里三份实例已出、
    购买那份实例还没出（pending），外加一份不想要的崩溃报告（应被跳过）。

    monkeypatch 的是模块级 `_http_get`——真实实现里唯一出网的那一行，别的代码不动。
    """
    def resp(status, content=b"", ctype="application/json"):
        return asc_reports._Resp(status, content, ctype)

    def jbody(obj, status=200):
        return resp(status, json.dumps(obj).encode())

    sales_url_date = SALES_DATE.strftime("%Y-%m-%d")
    tsv = "\n".join([SALES_HEADER,
                     _sales_row("1", 5, "3.50", "USD", SALES_DATE),
                     _sales_row("7", 2, "0.00", "USD", SALES_DATE)])

    report_names = list(asc_reports.ANALYTICS_WANTED) + ["App Crashes Standard"]

    def jsonl(metrics):
        lines = []
        for metric, value in metrics:
            lines.append(json.dumps({"date": ANALYTICS_DATE.isoformat(),
                                     "metric": metric,
                                     "data": [{"platform": "iOS", "value": value,
                                               "currency": "USD"}]}))
        return gzip.compress("\n".join(lines).encode())

    per_report_metrics = {
        "App Downloads Standard": [("downloads", 3), ("downloadTypes", 3)],
        "App Store Installation and Deletion Standard": [("installs", 2), ("deleteActions", 1)],
        "App Sessions Standard": [("sessions", 10), ("totalUniqueDevices", 4)],
        "App Store Purchases Standard": [("sales", 3.98)],
    }

    def fake_http_get(url, headers, timeout):
        if "/salesReports" in url:
            # 过滤名是 `filter[reportDate]`——`reportDate=` 这个子串在真 URL 里永远不存在
            # （中间隔一个 `]`），匹配必须带上过滤器全名。
            if f"filter[reportDate]={sales_url_date}" in url:
                return resp(200, gzip.compress(tsv.encode()), "application/a-gzip")
            return resp(404, json.dumps({"errors": [{"status": "404"}]}).encode())
        if url.endswith("/v1/analyticsReportRequests"):
            return jbody({"data": [{"id": "req1", "type": "analyticsReportRequests",
                                    "relationships": {"app": {"data": {"type": "apps",
                                                                       "id": "6815720286"}}}}]})
        if url == f"{asc_reports.ASC_BASE}/v1/analyticsReportRequests/req1/reports":
            return jbody({"data": [{"id": f"r{i}", "attributes": {"name": n}}
                                   for i, n in enumerate(report_names)]})
        if "/instances" in url and "/segments" not in url:
            report_id = url.split("/v1/analyticsReports/")[1].split("/")[0]
            name = report_names[int(report_id[1:])]
            if name == "App Store Purchases Standard":
                return jbody({"data": []})  # 这份实例还没出（24–48 小时那段）
            return jbody({"data": [{"id": f"inst-{report_id}",
                                    "attributes": {"procDate": ANALYTICS_DATE.isoformat()}}]})
        if url.endswith("/segments"):
            # 真链路：segments 那一回回的是 JSON（data[].attributes.url），
            # .txt.gz 本体还要按那个 url 再下载一发——两段都得假。
            report_id = url.split("/v1/analyticsReports/")[1].split("/")[0]
            name = report_names[int(report_id[1:])]
            return jbody({"data": [{"id": f"seg-{report_id}",
                                    "attributes": {"url": f"https://segments.example/{report_id}.txt.gz"}}]})
        if url.startswith("https://segments.example/"):
            # https://segments.example/{rid}.txt.gz —— 报告 id 在路径第三段。
            report_id = url.split("/")[3].split(".")[0]
            name = report_names[int(report_id[1:])]
            return resp(200, jsonl(per_report_metrics[name]), "application/a-gzip")
        raise AssertionError(f"假上游没准备这个 URL：{url}")

    monkeypatch.setattr(asc_reports, "_http_get", fake_http_get)


def test_sync_假上游全链落账(client, db, asc_config, monkeypatch):
    _fake_upstream(monkeypatch)
    r = client.post("/api/admin/asc/sync", headers=ah(client))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sales"]["pulled"] == 1 and body["sales"]["no_sales"] == asc_reports.SALES_BACKFILL_DAYS - 1
    assert body["analytics"]["instances_pulled"] == 3
    assert body["analytics"]["state"] == "ok"

    row = db.query(AscDaily).filter(AscDaily.report_date == ANALYTICS_DATE.isoformat()).one()
    assert row.downloads == 3        # analytics 后拉到，downloads 以它为准
    assert row.updates == 2 and row.redownloads == 0  # sales 那半照留
    assert row.installs == 2 and row.deletes == 1
    assert row.sessions == 10 and row.unique_devices == 4
    assert row.proceeds_usd == pytest.approx(3.5)  # sales 那半的 3.50 USD 落账；购买报告实例没出，analytics 不覆盖
    assert row.sales_at is not None and row.analytics_at is not None


def test_sync_重复拉不长新行(client, db, asc_config, monkeypatch):
    _fake_upstream(monkeypatch)
    client.post("/api/admin/asc/sync", headers=ah(client))
    before = db.query(AscDaily).count()
    r2 = client.post("/api/admin/asc/sync", headers=ah(client))
    assert r2.status_code == 200
    assert db.query(AscDaily).count() == before


def test_sync_上游一头红另一头照拉(client, db, asc_config, monkeypatch):
    # 只打死 sales 那一头：analytics 照常出账
    _fake_upstream(monkeypatch)
    real = asc_reports._http_get  # 假身装好之后再捕获——否则 analytics 半边会打出真网

    def picky(url, headers, timeout):
        if "/salesReports" in url:
            raise ConnectionError("pytest: sales down")
        return real(url, headers, timeout)

    monkeypatch.setattr(asc_reports, "_http_get", picky)
    r = client.post("/api/admin/asc/sync", headers=ah(client))
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["sales"]["errors"]) == asc_reports.SALES_BACKFILL_DAYS
    assert body["analytics"]["instances_pulled"] == 3


def test_sync_签票那一发红了回账不是500(client, db, asc_config, monkeypatch):
    # W2：configured() 放行之后钥才坏（被删、权限漂了）——sync 仍要回一张账，不许炸穿成 500。
    def boom() -> str:
        raise RuntimeError("pytest: key gone")

    monkeypatch.setattr(asc_reports, "_token", boom)
    r = client.post("/api/admin/asc/sync", headers=ah(client))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sales"]["pulled"] == 0
    assert len(body["sales"]["errors"]) == 1
    assert body["analytics"]["state"] == "unreachable"
    assert len(body["analytics"]["errors"]) == 1
    assert db.query(AscDaily).count() == 0


def test_列请求里没有这颗App的ONGOING单(client, db, asc_config, monkeypatch):
    def no_request(url, headers, timeout):
        if url.endswith("/v1/analyticsReportRequests"):
            return asc_reports._Resp(200, json.dumps({"data": []}).encode())
        raise AssertionError(url)
    monkeypatch.setattr(asc_reports, "_http_get", no_request)
    r = client.post("/api/admin/asc/sync", headers=ah(client))
    assert r.status_code == 200
    assert r.json()["analytics"]["state"] == "no_request"


def test_state_空库老实说没数(client, db, asc_config):
    r = client.get("/api/admin/asc/state", headers=ah(client))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["window_days"] == 14
    assert len(body["series"]) == 14
    assert body["seen_any"] is False
    assert all(p["downloads"] is None for p in body["series"])
    assert "24–48" in body["sentence"]
    assert body["key_file_present"] is True
    assert "订阅" in body["subscription_sentence"] and "没有上架内购" in body["subscription_sentence"]


def test_state_有数之后series接上(client, db, asc_config, monkeypatch):
    _fake_upstream(monkeypatch)
    client.post("/api/admin/asc/sync", headers=ah(client))
    r = client.get("/api/admin/asc/state", headers=ah(client))
    body = r.json()
    assert body["seen_any"] is True
    point = next(p for p in body["series"] if p["date"] == ANALYTICS_DATE.isoformat())
    assert point["downloads"] == 3 and point["sessions"] == 10
    assert body["last_sales_at"] and body["last_analytics_at"]


def test_订阅那一格的实话跟着回(client, db, asc_config):
    from app.services.asc_reports import SUBSCRIPTION_SENTENCE
    assert "订阅" in SUBSCRIPTION_SENTENCE and "没有上架内购" in SUBSCRIPTION_SENTENCE


# ---------------------------------------------------------------- 第四组：值不外流

def test_私钥内容与JWT一次都不进回体(client, db, asc_config, monkeypatch):
    _fake_upstream(monkeypatch)
    rs = client.post("/api/admin/asc/sync", headers=ah(client))
    rg = client.get("/api/admin/asc/state", headers=ah(client))
    for r in (rs, rg):
        assert r.status_code == 200
        assert SENTINEL not in r.text
        assert "Bearer ey" not in r.text
        assert "PYTESTKEY1" not in r.text
        assert "pytest-issuer-uuid" not in r.text


# ------------------------------------------------- 第五组：那一页真有这一栏

def test_后台页面接线():
    """接口绿了不等于屏上有这一栏——`refresh()` 里少一行调用，站长看到的就是"这功能没做"。

    与 tests/test_source_blocklist.py `Test九` 同一条判据的写法，也吃同一页那条
    零 innerHTML 纪律（这一页不留模块级状态、DOM 全走 el()，见 ops_page.py 顶部那段）。
    """
    src = (Path(__file__).resolve().parent.parent / "app" / "api" / "routes"
           / "ops_page.py").read_text(encoding="utf-8")
    body = src.split("_PAGE", 1)[1]
    assert "{ label: 'iPhone 数据', view: 'stats', key: 'asc' }" in body, "左栏那组里没这一条"
    assert 'id="ascbox"' in body and "$('ascbox')" in body, "主区没这一格的容器"
    assert "function renderAsc" in body and "function loadAsc" in body
    assert "api('api/admin/asc/state')" in body, "读口没接上"
    assert "api('api/admin/asc/sync', { method: 'POST' })" in body, "手动拉那一枚没接上"
    seg = body.split("Promise.all([", 1)[1].split("]", 1)[0]
    assert "loadAsc()" in seg, "登录那一趟没把它一起拉"
    seg2 = body.split("function ascCard", 1)[1].split("function loadAsc", 1)[0]
    assert seg2, "ascCard 与 loadAsc 之间那段取空了，判据就空转了"
    assert "dataset.key = 'asc'" in seg2, "卡片没挂左栏 key，一栏一屏会把它藏光或全摊着"
    # 同步成功那一趟自己会触发一次整栏重画；回执不存成变量就会被那次重画当场抹掉，
    # 屏上又回到"没动静"（真点探针撞出来的，2026-11-16）。
    assert "var ascReceipt" in seg2, "回执没存成模块级变量，活不过 loadAsc() 那次重画"
    assert "ascReceipt || '这一趟还没跑过" in seg2, "初绘那趟没把存下的回执带回屏上"
    assert "ascReceipt = txt" in seg2, "同步成功后回执没落进变量"
    for banned in ("innerHTML", "insertAdjacentHTML", "document.write"):
        assert banned not in seg2, f"这一页不许用 {banned}"
