"""`POST /v1/extract`（站长 10-27 拍的甲：iPhone 那一路"只要提炼结果"的口）。

这一组钉的是十件事，每一件都是这一口**为什么长成这样**的那条理由，不是随手加的分支：

① **门闩没配就是关着**（503），而"没配"是现网今天的状态 ⇒ 这一口今天不花一分钱。
   这一条最容易被"顺手给个默认值"弄成静默失效，所以它排在第一。
② **错误体的 code 只在四格上出现**：401 有 `unauthorized`，400 一个键都不许多
   （`core/error_codes.py` 那张表只有四格，理由写在它顶上那段）。这一口挂在 `/v1` 下，
   契约 §六 盖得到它，就得当场验一次"盖到了"和"没多盖"。
③ **不在服务端建笔记**。这条是这一口与 `/api/ingest/*` 的全部区别，而它在屏上看不见，
   只能靠"跑完一次成功提炼，`notes` 表一行都不许多"来钉。
④ **正文不进日志**。隐私那一屏那句"不存在记录你笔记内容的访问日志"以后要改成
   "过一遍、不存、不打日志"，后半句的落点就是这里。
⑤ **两档日闸的顺序**：全站打满时**不许**把某台设备的那一条额度也吃掉。
   抄的是 `ingest_text` 那条纪律（"要被打回的请求不该花真额度"）。
⑥ **按设备记的只是公平，不是钱**：换一枚设备编号就该还能用，而全站那一档必须挡住。
   这两句一起钉，才不会哪天有人把"每人 50 条"当成 iPhone 的总闸写在别处。
⑦ **舱壁取不到位 → 429 且不记账**（拦下了还白吃一格额度是双重错）。
⑧ **墙钟到点按降级那一档回**（`degraded=True` ＋ 空摘要），不新造"超时态"，
   也不让屏上一直转。
⑨ **`translate` 的默认是 `None` 不是 `False`**（`ingest.py` 那一处写过的同一条理由）。
⑩ **`/api/user/usage-today` 的键集合不许因为我加的第三档而变**（现网小程序正在读那个回体）。

限流在测试里关掉（`app.state.limiter.enabled = False`）：分钟闸是 Redis 那层的事，
这一组量的是这一口自己的判定。
"""
import asyncio
import logging
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

# ⚠ 建表只看"这一刻已经被 import 的模型"：`daily_usage` 不挂上来，`charge` 那一句会在一张
# 不存在的表上写，用例红在 OperationalError 而不是红在闸门上——那是两种完全不同的结论。
from app.models.daily_usage import DailyUsage  # noqa: F401,E402
from app.models.note import Note  # noqa: F401,E402
from app.models.user import User  # noqa: F401,E402
from app.api.routes import v1_extract
from app.core.config import settings
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.services import daily_budget

GATE = "pytest-gate-value-not-a-secret"
DEVICE = "a" * 32
HEADERS = {"x-tumarknote-gate": GATE, "x-device-token": DEVICE}
BODY = "六点半从三条出发，沿鸭川往南走，四十分钟到锦市场。" * 8


@pytest.fixture()
def client(monkeypatch):
    """门闩配上、额度放宽，用例各测各的那一格。

    两个 monkeypatch 都是**前提**而不是被测行为：门闩不配上就只能测 503；
    全站那一档不放宽，前面每一条成功用例都会互相把计数顶上去（共享库、东八区同一"今天"），
    第 N 条之后全红在 429 —— 那种红看着像闸门坏了，其实是夹具在互相吃额度。
    """
    app.state.limiter.enabled = False
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(settings, "TUMARKNOTE_APP_GATE", GATE)
    monkeypatch.setattr(settings, "EXTRACT_GLOBAL_DAILY_LIMIT", 10_000)
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


def _fake_knowledge(monkeypatch, **kwargs):
    """桩掉提炼本身，并记下它被怎么调（⑨ 与 ⑧ 都要读这一份记录）。"""
    calls = []

    async def fake(text, fallback_title="", translate=None):
        calls.append({"text": text, "fallback_title": fallback_title, "translate": translate})
        return {
            "title": kwargs.get("title", "鸭川晨走"),
            "summary": kwargs.get("summary", "早上顺光、人少，咖啡店六点半开门。"),
            "key_points": kwargs.get("key_points", ["四十分钟到锦市场"]),
            "tags": kwargs.get("tags", ["京都", "晨走"]),
            "degraded": kwargs.get("degraded", False),
        }

    monkeypatch.setattr(v1_extract, "extract_knowledge", fake)
    return calls


def _usage_rows() -> list[tuple[str, str, int]]:
    """今天这本账上每一行记了几条。**带 count**：反向验证 P2 的第一版只数了"有没有这一行"，
    于是把两档日闸的顺序整块调换它照绿——被全站挡住的那一发确实多顶了设备一格，
    而那件事在这条断言里长得和"没顶"一模一样。
    """
    db = SessionLocal()
    try:
        return [(r.user_id, r.kind, int(r.count)) for r in db.query(DailyUsage).all()]
    finally:
        db.close()


class Test门闩与请求头:
    def test没配门闩这一口整个关着(self, client, monkeypatch):
        """这一条钉的是"现网今天"那一态：没配 = 503，不是"没配就当不检"。"""
        monkeypatch.setattr(settings, "TUMARKNOTE_APP_GATE", "")
        resp = client.post("/v1/extract", json={"text": BODY}, headers=HEADERS)
        assert resp.status_code == 503, resp.text
        assert "提炼" in resp.text  # 只说这一口关着，别把整站说成坏了

    def test门闩不对回401并且带那一格的code(self, client):
        resp = client.post(
            "/v1/extract", json={"text": BODY},
            headers={**HEADERS, "x-tumarknote-gate": "wrong-one"},
        )
        assert resp.status_code == 401, resp.text
        assert resp.json()["code"] == "unauthorized", "契约 §六 四格之一，`/v1` 就该盖到这一口"

    def test缺设备编号回400并且一个code都不许多(self, client):
        resp = client.post(
            "/v1/extract", json={"text": BODY},
            headers={"x-tumarknote-gate": GATE},
        )
        assert resp.status_code == 400, resp.text
        assert "code" not in resp.json(), "400 不在 `error_codes` 那四格里，多一个键就是假承诺"

    def test形状不对的设备编号不收而大小写归同一本账(self, client, monkeypatch):
        """形状钉死，大小写**归一**（服务端先 `lower()` 再比）。

        为什么不是"大写一律拒"：端上那枚串是自己生成的十六进制，走哪条系统 API 都可能给大写；
        拒了就是"换一台机器写法就不一样"的那种坏。归一之后必须归到**同一行账**上，
        不然同一台设备会被记成两台、那 50 条变成 100 条——所以这一条量的不是"收不收"，
        是"收了之后记在哪"。
        """
        calls = _fake_knowledge(monkeypatch)
        for bad in ["", "xyz", "a" * 31, "a" * 129, "a" * 31 + "g"]:
            resp = client.post(
                "/v1/extract", json={"text": BODY},
                headers={**HEADERS, "x-device-token": bad},
            )
            assert resp.status_code == 400, f"设备编号 {bad!r} 竟然收下了：{resp.text}"
        assert not calls, "被拒的那几发一发都不该打到模型"

        assert client.post(
            "/v1/extract", json={"text": BODY},
            headers={**HEADERS, "x-device-token": "A" * 32},
        ).status_code == 200
        assert client.post(
            "/v1/extract", json={"text": BODY},
            headers={**HEADERS, "x-device-token": "a" * 32},
        ).status_code == 200
        记账 = [(u, c) for u, _, c in _usage_rows() if u.startswith("device:")]
        assert 记账 == [(f"device:{'a' * 32}", 2)], \
            f"大写与小写没归到同一台（应为同一行记两条）：{记账}"

    def test一串空白不是正文(self, client):
        resp = client.post("/v1/extract", json={"text": "   \n\t "}, headers=HEADERS)
        assert resp.status_code == 400, resp.text


class Test只回结果不建笔记:
    def test成功那一发把四栏原样回给端上(self, client, monkeypatch):
        _fake_knowledge(monkeypatch)
        resp = client.post(
            "/v1/extract", json={"text": BODY, "fallback_title": "晨走"}, headers=HEADERS
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["title"] == "鸭川晨走"
        assert body["summary"] == "早上顺光、人少，咖啡店六点半开门。"
        assert body["key_points"] == ["四十分钟到锦市场"]
        assert body["tags"] == ["京都", "晨走"]
        assert body["degraded"] is False

    def test跑成功也不在库里留一行(self, client, monkeypatch):
        """这一条是"过路，不是存储"那句话唯一的证据。

        `notes` 与 `users` 一起数：`_fake_knowledge` 桩的是模型那一层，真要有人把落库
        挪进这一口，桩不会替它红，只有表会红。
        """
        _fake_knowledge(monkeypatch)
        resp = client.post("/v1/extract", json={"text": BODY}, headers=HEADERS)
        assert resp.status_code == 200, resp.text
        db = SessionLocal()
        try:
            assert db.query(Note).count() == 0, "这一口不许建笔记"
            assert db.query(User).count() == 0, "这一口也不许顺手建一行用户"
        finally:
            db.close()

    def test日志里不许出现正文(self, client, monkeypatch, caplog):
        """隐私那一屏那句"不打日志"的后半句落点。

        ⚠ `caplog` 读的是**格式化之后**的那一句（`record.message`），而这一口那句日志
        只带长度与设备编号前缀。拿正文的任意一段子串去比，才是"没记"的证据；
        比整行等于什么都比不出来。
        """
        _fake_knowledge(monkeypatch)
        with caplog.at_level(logging.INFO, logger="app.api.routes.v1_extract"):
            resp = client.post("/v1/extract", json={"text": BODY}, headers=HEADERS)
        assert resp.status_code == 200, resp.text
        全文 = "\n".join(r.getMessage() for r in caplog.records)
        assert "鸭川" in BODY  # 夹具自己先成立：正文里真有这段可被认出来的字
        assert "鸭川" not in 全文, f"日志把正文带出去了：{全文}"
        assert BODY not in 全文

    def test降级原样下发不修饰(self, client, monkeypatch):
        """`llm.py` 那两条降级形状（异常→空摘要）要能在屏上被认成"这一栏照旧不画"。"""
        _fake_knowledge(monkeypatch, summary="", key_points=[], tags=[], degraded=True)
        resp = client.post("/v1/extract", json={"text": BODY}, headers=HEADERS)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["degraded"] is True and body["summary"] == "" and body["key_points"] == []


class Test额度:
    def test全站打满时不许吃掉那台设备的额度(self, client, monkeypatch):
        """⑤：先判全站、再判设备。顺序反了，被全站挡住的那一发会白扣用户一条。

        ⚠ 10-30 起这一条同时钉住 Y1 那一面：被全站拦下的那一发**两格都不许写**
        （旧写法是"先记全站、再判设备"，所以全站那一行会把这条被拒的请求也数进去）。
        两格都是 1 ＝ 只有真发出去的那一发记了账。
        """
        _fake_knowledge(monkeypatch)
        monkeypatch.setattr(settings, "EXTRACT_GLOBAL_DAILY_LIMIT", 1)
        第一发 = client.post("/v1/extract", json={"text": BODY}, headers=HEADERS)
        assert 第一发.status_code == 200, 第一发.text
        第二发 = client.post("/v1/extract", json={"text": BODY}, headers=HEADERS)
        assert 第二发.status_code == 429, 第二发.text
        assert "全站" in 第二发.json()["detail"]
        assert "提炼" in 第二发.json()["detail"]
        记录 = _usage_rows()
        全站 = [c for u, _, c in 记录 if u == v1_extract.GLOBAL_LEDGER_KEY]
        设备 = [c for u, _, c in 记录 if u.startswith("device:")]
        assert 全站 == [1], f"被全站拦下的那一发不该给全站那一行也 ＋1：{记录}"
        assert 设备 == [1], f"被全站挡住的那一发把设备那一格也顶上一格：{记录}"

    def test被设备那一档打回的那一发不许吃掉全站的账(self, client, monkeypatch):
        """第九轮审计 Y1 那一面：设备用完了，全站那一行必须是**干净**的。

        旧形状下这一发已经把全站 ＋1 才回 429；一台设备按 IP 闸 10/分纯打，约 20 分钟
        就能把全站当天那一格（默认 200）吃干——一次上游都没打、看板照念"正常"。
        这一条把那条路钉死：全站放宽、设备设 0，连打三发 429，全站那一行仍是 0。
        """
        calls = _fake_knowledge(monkeypatch)
        monkeypatch.setattr(settings, "EXTRACT_GLOBAL_DAILY_LIMIT", 10_000)
        monkeypatch.setattr(settings, "EXTRACT_DAILY_LIMIT", 0)
        for 第几发 in range(3):
            回 = client.post("/v1/extract", json={"text": BODY}, headers=HEADERS)
            assert 回.status_code == 429, f"第 {第几发} 发：{回.text}"
            assert "每天" in 回.json()["detail"], "该念设备那一档的话，不是全站那一档"
        assert not calls, "设备档拦下了还把提炼发出去了"
        记录 = _usage_rows()
        assert [c for u, _, c in 记录 if u == v1_extract.GLOBAL_LEDGER_KEY] == [], \
            f"被拒的三发把全站额度白吃了：{记录}"
        assert [c for u, _, c in 记录 if u.startswith("device:")] == [], \
            f"设备那一档 0 条时拦下的请求仍留了行：{记录}"

    def test换一枚设备编号照样能用而全站仍然挡着(self, client, monkeypatch):
        """⑥：按设备记的是公平，不是钱的上限。这句要能被量出来，否则下一轮会有人拿 50 当总闸。"""
        _fake_knowledge(monkeypatch)
        monkeypatch.setattr(settings, "EXTRACT_DAILY_LIMIT", 1)
        monkeypatch.setattr(settings, "EXTRACT_GLOBAL_DAILY_LIMIT", 10_000)
        甲 = client.post("/v1/extract", json={"text": BODY}, headers=HEADERS)
        assert 甲.status_code == 200, 甲.text
        同一台第二发 = client.post("/v1/extract", json={"text": BODY}, headers=HEADERS)
        assert 同一台第二发.status_code == 429, 同一台第二发.text
        assert "每天" in 同一台第二发.json()["detail"]
        另一台 = client.post(
            "/v1/extract", json={"text": BODY},
            headers={**HEADERS, "x-device-token": "b" * 32},
        )
        assert 另一台.status_code == 200, "设备档不该串味：另一台的第一发必须能用"

    def test舱壁满时直接429且不记账(self, client, monkeypatch):
        """⑦：拦下了还白吃一格额度是双重错。"""
        calls = _fake_knowledge(monkeypatch)
        占位 = 0
        while v1_extract.try_acquire_slot():
            占位 += 1
        assert 占位 == v1_extract.INFLIGHT_LIMIT
        try:
            resp = client.post("/v1/extract", json={"text": BODY}, headers=HEADERS)
        finally:
            for _ in range(占位):
                v1_extract.release_slot()
        assert resp.status_code == 429, resp.text
        assert not calls, "取不到位却把提炼发出去了"
        assert _usage_rows() == [], f"被舱壁拦下的这一发不该留下任何额度记录：{_usage_rows()}"

    def test用完之后在飞位要还回来(self, client, monkeypatch):
        """舱壁漏一次还位＝这一口跑几发就永久 429。这一条是那条漏位的尺子。"""
        _fake_knowledge(monkeypatch)
        for _ in range(3):
            assert client.post("/v1/extract", json={"text": BODY}, headers=HEADERS).status_code == 200
        assert v1_extract.in_flight() == 0

    def test被日闸打回的那一发也要还在飞位(self, client, monkeypatch):
        _fake_knowledge(monkeypatch)
        monkeypatch.setattr(settings, "EXTRACT_GLOBAL_DAILY_LIMIT", 0)
        assert client.post("/v1/extract", json={"text": BODY}, headers=HEADERS).status_code == 429
        assert v1_extract.in_flight() == 0, "429 那条路没还位，舱壁会被拦下的请求慢慢填满"


class Test墙钟与参数:
    def test超过deadline按降级那一档回(self, client, monkeypatch):
        """⑧：人在屏前等，到点就回"留空"，不新造一个"超时态"。"""
        async def slow(text, fallback_title="", translate=None):
            await asyncio.sleep(0.5)
            raise AssertionError("不该走到这里")

        monkeypatch.setattr(v1_extract, "extract_knowledge", slow)
        monkeypatch.setattr(settings, "EXTRACT_DEADLINE_SECONDS", 0.01)
        resp = client.post("/v1/extract", json={"text": BODY, "fallback_title": "晨走"},
                           headers=HEADERS)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["degraded"] is True and body["summary"] == ""
        assert body["title"] == "晨走", "至少把人自己那一句还回去，别回一个空标题"
        assert v1_extract.in_flight() == 0

    def test翻译那一位默认是None不是False(self, client, monkeypatch):
        """⑨：`False` 会变成"明确要求跟随原文语言"，把老包今天的样子改掉（`ingest.py` 同一条理由）。"""
        calls = _fake_knowledge(monkeypatch)
        assert client.post("/v1/extract", json={"text": BODY}, headers=HEADERS).status_code == 200
        assert calls[0]["translate"] is None, calls[0]
        assert client.post(
            "/v1/extract", json={"text": BODY, "translate": True}, headers=HEADERS
        ).status_code == 200
        assert calls[1]["translate"] is True

    def test正文过长挡在门口(self, client, monkeypatch):
        """与端上 `LinkImport.bodyCharBudget` 同一个数：超出的那一头客户端自己就拒了。"""
        calls = _fake_knowledge(monkeypatch)
        resp = client.post("/v1/extract", json={"text": "字" * 50001}, headers=HEADERS)
        assert resp.status_code == 422, resp.text
        assert not calls, "校验层放行了才叫贵"


class Test不动旧门:
    def test全局那一档的话术与档位也齐(self):
        """既有那把尺子（`test_日量闸与登记齐.py::test_记档只许两支名字`）循环的是 `KINDS`，
        而我这一档故意不在 `KINDS` 里 ⇒ 它照不到我：这句"只说用完了、不说档位与明天"
        的规矩必须在这一档上同样成立，否则屏上会出现一句没有数目的 429。
        """
        句子 = daily_budget._SENTENCE[daily_budget.KIND_EXTRACT_GLOBAL].format(limit=7)
        assert "7" in 句子 and "明天" in 句子, 句子
        assert daily_budget.limit_of(daily_budget.KIND_EXTRACT_GLOBAL) \
            == settings.EXTRACT_GLOBAL_DAILY_LIMIT

    def test没登记的日量种类当场报错而不是静默放行(self):
        """`charge` 拿到一个没在 `limit_of` 里登记过的档，必须响，不许"当没这一档"。

        反向验证跑过：把 `limit_of` 里那一支 `KIND_EXTRACT_GLOBAL` 分支撤掉，
        上面所有闸都会变成一次 KeyError 而不是"额度不管了"。这一条钉的就是它不会退成后者。
        """
        with pytest.raises(KeyError):
            daily_budget.limit_of("不存在的档")

    def test用量那一屏的键集合没被我加的那一档带跑(self, client, monkeypatch):
        """⑩：`extract_global` 故意不进 `KINDS`——`/api/user/usage-today` 是现网在读的回体。

        这条同时也是"这一口没顺手改到旧门"的证据：旧门的回体读的是 `snapshot()`，
        它循环的是 `KINDS`，而我把新档挂在了 `CHARGEABLE_KINDS` 上。
        """
        """⑩：`extract_global` 故意不进 `KINDS`——`/api/user/usage-today` 是现网在读的回体。

        这条同时也是"这一口没顺手改到旧门"的证据：旧门的回体读的是 `snapshot()`，
        它循环的是 `KINDS`，而我把新档挂在了 `CHARGEABLE_KINDS` 上。
        """
        assert daily_budget.KINDS == ("extract", "sec_check")
        assert "extract_global" in daily_budget.CHARGEABLE_KINDS
        读数 = daily_budget.snapshot("whoever")
        assert set(读数) == {"day", "tz", "extract", "sec_check"}, 读数
