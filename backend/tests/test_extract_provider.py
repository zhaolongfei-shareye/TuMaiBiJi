"""提炼 provider 分层（F6 可插拔四条约束 + 四条待补验收）的测试。

全程用假 httpx 客户端，**不发出任何真实网络请求**；退避 sleep 也被替换，
否则 429 重试那条要真等 1+2+4 秒。
"""
import json

import httpx
import pytest

from app.core.config import settings
from app.services import llm

# 本仓库没装 pytest-asyncio，但 anyio 自带的 pytest 插件已注册，用它的 anyio 标记即可，
# 不为此新增测试依赖。
pytestmark = pytest.mark.anyio


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


class FakeResponse:
    def __init__(self, status_code=200, body=None, text=None):
        self.status_code = status_code
        self._body = body
        self.text = text if text is not None else json.dumps(body, ensure_ascii=False)
        self.request = None

    def json(self):
        if self._body is None:
            raise ValueError("not json")
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(f"HTTP {self.status_code}", request=self.request, response=self)


class RecordingClient:
    """替掉 llm.httpx.AsyncClient，记录每次出网调用并按脚本回应。

    被测代码是 `async with httpx.AsyncClient(...) as client: await client.post(...)`，
    所以 __aenter__ 必须返回一个**带 post 的对象**——返回外层实例是这类 mock 最常见的写错方式。
    """

    def __init__(self, script):
        self.calls = []
        self._script = script

    def factory(self, *args, **kwargs):
        outer = self

        class _Ctx:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def post(self, url, json=None, headers=None):
                outer.calls.append({"url": url, "json": json, "headers": headers})
                outcome = outer._script(len(outer.calls))
                if isinstance(outcome, Exception):
                    raise outcome
                return outcome

        return _Ctx()


@pytest.fixture
def fast_backoff(monkeypatch):
    async def no_sleep(_):
        return None

    monkeypatch.setattr(llm.asyncio, "sleep", no_sleep)


@pytest.fixture
def cf_ready(monkeypatch):
    """把配置拨到"hunyuan_cf 且凭据可用"，各用例再按需覆盖。"""
    monkeypatch.setattr(settings, "EXTRACT_PROVIDER", "hunyuan_cf")
    monkeypatch.setattr(settings, "HUNYUAN_CF_URL", "https://cf.example/functions/extract")
    monkeypatch.setattr(settings, "HUNYUAN_CF_KEY", "sk-real-looking-token")


def _patch_transport(monkeypatch, script):
    client = RecordingClient(script)
    monkeypatch.setattr(llm.httpx, "AsyncClient", client.factory)
    return client


def _assert_degraded(result):
    assert result["degraded"] is True
    assert result["summary"] == ""
    assert result["key_points"] == []
    assert result["tags"] == []


class TestProviderNone:
    async def test_none_makes_no_egress_request(self, monkeypatch, fast_backoff):
        """F6 验收：EXTRACT_PROVIDER=none 时不发起任何出网请求即降级。"""
        monkeypatch.setattr(settings, "EXTRACT_PROVIDER", "none")
        client = _patch_transport(monkeypatch, lambda n: FakeResponse(200, {"title": "x"}))

        result = await llm.extract_knowledge("正文内容\n第二行", "参考标题")
        _assert_degraded(result)
        assert client.calls == []

    async def test_none_degrades_even_with_credentials_present(self, monkeypatch, cf_ready):
        """凭据齐全也必须被 none 拦住——这条是给提审期临时关能力用的。"""
        monkeypatch.setattr(settings, "EXTRACT_PROVIDER", "none")
        client = _patch_transport(monkeypatch, lambda n: FakeResponse(200, {"title": "x"}))

        result = await llm.extract_knowledge("正文", "")
        _assert_degraded(result)
        assert client.calls == []


class TestProviderReserved:
    async def test_wechat_ai_reserved_slot_degrades_without_egress(self, monkeypatch, cf_ready):
        """预留枚举位的含义是"只占位不写实现"，命中时要降级且不能偷偷发请求。"""
        monkeypatch.setattr(settings, "EXTRACT_PROVIDER", "wechat_ai")
        client = _patch_transport(monkeypatch, lambda n: FakeResponse(200, {"title": "x"}))

        result = await llm.extract_knowledge("正文", "")
        _assert_degraded(result)
        assert client.calls == []

    async def test_unknown_provider_degrades(self, monkeypatch, cf_ready):
        monkeypatch.setattr(settings, "EXTRACT_PROVIDER", "gpt999")
        client = _patch_transport(monkeypatch, lambda n: FakeResponse(200, {"title": "x"}))

        result = await llm.extract_knowledge("正文", "")
        _assert_degraded(result)
        assert client.calls == []

    def test_provider_implemented_flags_reserved_slot(self):
        assert llm.provider_implemented("hunyuan_cf") is True
        assert llm.provider_implemented("none") is True
        assert llm.provider_implemented("wechat_ai") is False


class TestCredentials:
    async def test_missing_url_degrades_without_egress(self, monkeypatch, cf_ready):
        monkeypatch.setattr(settings, "HUNYUAN_CF_URL", "")
        client = _patch_transport(monkeypatch, lambda n: FakeResponse(200, {"title": "x"}))

        result = await llm.extract_knowledge("正文", "")
        _assert_degraded(result)
        assert client.calls == []

    async def test_placeholder_key_degrades_without_egress(self, monkeypatch, cf_ready):
        """非空 ≠ 已配置：占位符若被当成凭据，每条任务都会变成重试风暴。"""
        monkeypatch.setattr(settings, "HUNYUAN_CF_KEY", "your-cloud-function-key")
        client = _patch_transport(monkeypatch, lambda n: FakeResponse(200, {"title": "x"}))

        result = await llm.extract_knowledge("正文", "")
        _assert_degraded(result)
        assert client.calls == []


class TestCloudFunctionOutcomes:
    async def test_success_returns_normalized_four_fields(self, monkeypatch, cf_ready):
        body = {"title": "混元给的标题", "summary": "摘要", "key_points": ["要点一", "要点二"],
                "tags": ["技术"], "usage": {"total_tokens": 123}}
        client = _patch_transport(monkeypatch, lambda n: FakeResponse(200, body))

        result = await llm.extract_knowledge("正文内容", "参考标题")
        assert result["degraded"] is False
        assert result["title"] == "混元给的标题"
        assert result["key_points"] == ["要点一", "要点二"]
        assert result["tags"] == ["技术"]
        assert "usage" not in result, "云函数多带的调试字段不该漏进落库结构"

        sent = client.calls[0]["json"]
        assert sent["fallback_title"] == "参考标题"
        assert "正文内容" in sent["text"]
        # 提示词只由后端持有，云函数内不留第二份；这条断言锁住这个约定。
        assert sent["system_prompt"] == llm.SYSTEM_PROMPT
        assert "知识整理助手" in sent["system_prompt"]
        assert client.calls[0]["headers"]["Authorization"] == "Bearer sk-real-looking-token"

    async def test_timeout_degrades_and_does_not_hang(self, monkeypatch, cf_ready, fast_backoff):
        """F6 验收：云函数超时同样降级入库，不能把任务卡在 processing。"""
        client = _patch_transport(
            monkeypatch, lambda n: httpx.ReadTimeout("云函数没在超时窗口内返回")
        )

        result = await llm.extract_knowledge("正文", "参考标题")
        _assert_degraded(result)
        assert result["title"] == "参考标题"
        assert len(client.calls) == llm.MAX_RETRIES + 1, "超时应重试到上限后放弃"

    async def test_non_json_response_degrades(self, monkeypatch, cf_ready):
        """网关在函数没部署/路径写错时回 HTML 错误页，这条必须降级而不是崩。"""
        html = FakeResponse(200, body=None, text="<html>404 Not Found</html>")
        client = _patch_transport(monkeypatch, lambda n: html)

        result = await llm.extract_knowledge("正文", "")
        _assert_degraded(result)
        assert len(client.calls) == 1, "返回非 JSON 重试也不会变好，不该重试"

    async def test_error_field_degrades_without_retry(self, monkeypatch, cf_ready):
        """云函数明确回了 error（额度耗尽、模型 id 错等）→ 一次就降级。"""
        client = _patch_transport(monkeypatch, lambda n: FakeResponse(200, {"error": "quota exceeded"}))

        result = await llm.extract_knowledge("正文", "")
        _assert_degraded(result)
        assert len(client.calls) == 1

    async def test_retryable_error_is_retried_to_limit(self, monkeypatch, cf_ready, fast_backoff):
        """函数把模型侧 429 包成 HTTP 200 + {error, retryable:true} 时，必须重试而不是当不可重试。

        这条来自现网实测：空闲之后的第一次调用必吃一个 429、紧接着几次全好。若不重试，
        每条空闲后的第一条笔记就会静默丢掉摘要——正是"上线必被投诉"那一类。
        """
        client = _patch_transport(
            monkeypatch,
            lambda n: FakeResponse(200, {"error": "cloud.ai 返回 HTTP 429: rate limit", "retryable": True}),
        )

        result = await llm.extract_knowledge("正文", "")
        _assert_degraded(result)
        assert len(client.calls) == llm.MAX_RETRIES + 1

    async def test_retryable_error_then_success_recovers(self, monkeypatch, cf_ready, fast_backoff):
        good = FakeResponse(200, {"title": "T", "summary": "S", "key_points": ["a"], "tags": ["x"]})
        _patch_transport(
            monkeypatch,
            lambda n: FakeResponse(200, {"error": "http 429", "retryable": True}) if n < 2 else good,
        )

        result = await llm.extract_knowledge("正文", "")
        assert result["degraded"] is False
        assert result["title"] == "T"

    async def test_non_retryable_flag_stays_single(self, monkeypatch, cf_ready):
        """retryable 显式为 false（如 AI_MODEL_NOT_ENABLED）→ 仍是一次就降级。"""
        client = _patch_transport(
            monkeypatch,
            lambda n: FakeResponse(200, {"error": "AI_MODEL_NOT_ENABLED", "retryable": False}),
        )

        result = await llm.extract_knowledge("正文", "")
        _assert_degraded(result)
        assert len(client.calls) == 1

    async def test_429_retries_then_degrades(self, monkeypatch, cf_ready, fast_backoff):
        """F6 验收：429 重试 3 次仍失败则降级入库，而不是让任务 failed。"""
        client = _patch_transport(monkeypatch, lambda n: FakeResponse(429, {"detail": "rate limited"}))

        result = await llm.extract_knowledge("正文", "")
        _assert_degraded(result)
        assert len(client.calls) == llm.MAX_RETRIES + 1

    async def test_429_then_success_recovers(self, monkeypatch, cf_ready, fast_backoff):
        good = FakeResponse(200, {"title": "T", "summary": "S", "key_points": [], "tags": []})
        _patch_transport(monkeypatch, lambda n: FakeResponse(429, {}) if n < 3 else good)

        result = await llm.extract_knowledge("正文", "")
        assert result["degraded"] is False
        assert result["title"] == "T"

    async def test_400_is_not_retried(self, monkeypatch, cf_ready):
        """4xx 里除 429 外都是"请求本身有问题"，重试只是白等。"""
        client = _patch_transport(monkeypatch, lambda n: FakeResponse(400, {"detail": "bad request"}))

        result = await llm.extract_knowledge("正文", "")
        _assert_degraded(result)
        assert len(client.calls) == 1

    async def test_5xx_is_retried(self, monkeypatch, cf_ready, fast_backoff):
        client = _patch_transport(monkeypatch, lambda n: FakeResponse(503, {"detail": "upstream down"}))

        result = await llm.extract_knowledge("正文", "")
        _assert_degraded(result)
        assert len(client.calls) == llm.MAX_RETRIES + 1


class TestContractStaysSingle:
    def test_entry_point_count_is_two(self):
        """F6 约束 2：换供应商不得新增第三个 extract_knowledge 调用点。"""
        import subprocess
        from pathlib import Path

        root = Path(llm.__file__).resolve().parents[1]
        out = subprocess.run(
            ["grep", "-rn", "--include=*.py", "extract_knowledge", str(root)],
            capture_output=True, text=True,
        ).stdout
        callsites = {
            ln.split(":")[0] for ln in out.splitlines()
            if "def extract_knowledge" not in ln and "import" not in ln
        }
        app_dir = str(root)
        rel = sorted(p.replace(app_dir + "/", "") for p in callsites)
        assert rel == ["tasks/ingest_tasks.py"], f"提炼调用点漂移了：{rel}"

    def test_deepseek_is_fully_gone(self):
        """定案是"只维护一家大模型"，留着旧分支等于下一个人还要问这 key 填不填。"""
        with open(llm.__file__, encoding="utf-8") as f:
            src = f.read()
        assert "deepseek" not in src.lower()
        assert not hasattr(settings, "DEEPSEEK_API_KEY")
