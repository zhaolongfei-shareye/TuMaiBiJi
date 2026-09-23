"""分享码指向哪个版本，是配置说了算而不是写死——但默认必须是正式版。

实测过（2026-09-23，服务器真调 getwxacodeunlimit）：`env_version` 填 release / trial /
develop 都正常出图，填错值回 `40097 invalid args`。**不传这个参数时微信按正式版出码**，
而 `page`（pages/share/view）必须存在于那个版本里——所以在过审之前，分享卡片上那张码
扫开必然打不开，这不是 bug 是机制。测试期把 SHARE_QR_ENV_VERSION 填 trial 就能扫通体验版。

风险是反向的：如果这个值留在 trial 就发布了，真实用户扫到的是只有体验成员才打得开的
链接。所以这里钉三件事——默认是 release、非法值退回 release、以及 trial 真的会被带上去。

全程不出网：get_access_token 和 httpx 都是替身。
"""
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_qr.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio

import pytest

from app.core.config import Settings
from app.services import wechat


class _Recorder:
    """假 httpx client：只记下我们真正发给微信的 body，并数打了几次。"""

    last = None
    calls = 0

    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, json=None):
        _Recorder.calls += 1
        _Recorder.last = json or {}
        return type("R", (), {
            "status_code": 200,
            "headers": {"content-type": "image/jpeg"},
            "content": b"\xff\xd8\xff\xe0JPEGFAKE",
        })()


@pytest.fixture()
def sent(monkeypatch):
    async def fake_token():
        return "fake-access-token"

    _Recorder.last = None
    _Recorder.calls = 0
    # 码图有缓存（见 wechat._qr_cache），不清掉的话上一条用例的命中会让这一条
    # 根本走不到 httpx，`sent()` 拿到 None——看着像断言坏了，其实是被缓存短路。
    monkeypatch.setattr(wechat, "_qr_cache", wechat.OrderedDict())
    monkeypatch.setattr(wechat, "get_access_token", fake_token)
    monkeypatch.setattr(wechat.httpx, "AsyncClient", _Recorder)
    yield lambda: _Recorder.last


def test_默认出的是正式版的码(monkeypatch, sent):
    """过审前的默认值必须是 release：宁可测试期多改一次配置，也不能让线上悄悄发错码。"""
    monkeypatch.setattr(wechat.settings, "SHARE_QR_ENV_VERSION", "release")
    asyncio.run(wechat.get_qr_code_image(scene="tok123", page="pages/share/view"))
    assert sent()["env_version"] == "release"


@pytest.mark.parametrize("cfg", ["trial", "develop"])
def test_配置成体验版或开发版会原样带给微信(cfg, monkeypatch, sent):
    monkeypatch.setattr(wechat.settings, "SHARE_QR_ENV_VERSION", cfg)
    asyncio.run(wechat.get_qr_code_image(scene="tok123", page="pages/share/view"))
    assert sent()["env_version"] == cfg


@pytest.mark.parametrize("junk", ["Trail", "TRIAL", "", "canary", "release "])
def test_填错的值退回release而不是把整条功能打挂(junk, monkeypatch, sent):
    """微信对非法值回 40097，用户侧只会看到一句"小程序码生成失败"，查不到是配置打错了。"""
    monkeypatch.setattr(wechat.settings, "SHARE_QR_ENV_VERSION", junk)
    asyncio.run(wechat.get_qr_code_image(scene="tok123", page="pages/share/view"))
    assert sent()["env_version"] == "release"


def test_配置项存在且默认值就是release():
    """上面几条改的是 settings 上的值，这条钉的是"没配 .env 时它是什么"。"""
    assert "SHARE_QR_ENV_VERSION" in Settings.model_fields
    assert Settings.model_fields["SHARE_QR_ENV_VERSION"].default == "release"


def test_其余参数一项没被动过(monkeypatch, sent):
    """加 env_version 不能顺手把 scene/check_path/width/page 改坏——这四个才是码能不能扫对页。"""
    monkeypatch.setattr(wechat.settings, "SHARE_QR_ENV_VERSION", "trial")
    asyncio.run(wechat.get_qr_code_image(scene="abc123", page="pages/share/view"))
    body = sent()
    assert body["scene"] == "abc123"
    assert body["check_path"] is False
    assert body["width"] == 280
    assert body["page"] == "pages/share/view"


# ------------------------------------------------------------------ 码图缓存
def _hits(monkeypatch, scene, page="pages/share/view", env="release"):
    monkeypatch.setattr(wechat.settings, "SHARE_QR_ENV_VERSION", env)
    return asyncio.run(wechat.get_qr_code_image(scene=scene, page=page))


def test_同一张码只真打微信一次(monkeypatch, sent):
    """这个接口不带鉴权。没缓存时谁都能拿一个有效 token 把我们的微信配额刷光，
    而且从我们自己的错误率上看不出来。"""
    first = _hits(monkeypatch, "tokA")
    for _ in range(5):
        assert _hits(monkeypatch, "tokA") == first
    assert _Recorder.calls == 1, f"同一张码打了 {_Recorder.calls} 次微信"


def test_不同码各打一次互不串图(monkeypatch, sent):
    _hits(monkeypatch, "tokA")
    _hits(monkeypatch, "tokB")
    assert _Recorder.calls == 2
    assert sent()["scene"] == "tokB", "两张码共用了同一份缓存"


def test_换版本必须重新出码(monkeypatch, sent):
    """发布前要把 SHARE_QR_ENV_VERSION 从 trial 改回 release。

    缓存键里没这一项的话，改完配置那张缓存里的体验版码还会继续发出去——只有体验成员
    扫得动，真实用户全废，而这正好发生在刚发布的那一刻。
    """
    _hits(monkeypatch, "tokA", env="trial")
    _hits(monkeypatch, "tokA", env="release")
    assert _Recorder.calls == 2
    assert sent()["env_version"] == "release"


def test_填错的版本号不会污染缓存(monkeypatch, sent):
    """Trail / TRIAL / 空值都退回 release，它们必须共用同一个 release 键而不是各存一份。"""
    for junk in ("Trail", "TRIAL", "", "canary"):
        _hits(monkeypatch, "tokA", env=junk)
    assert _Recorder.calls == 1, f"非法值没归一到同一个键，打了 {_Recorder.calls} 次"


def test_缓存有上限不会无限涨(monkeypatch, sent):
    """这台机器内存本来就紧：一张码实测约 55KB，不设上限就是拿内存换配额。"""
    for i in range(wechat._QR_CACHE_MAX + 50):
        _hits(monkeypatch, f"tok{i}")
    assert len(wechat._qr_cache) == wechat._QR_CACHE_MAX
    # 最老的那张已经被挤出去，再来一次就是重新打微信
    before = _Recorder.calls
    _hits(monkeypatch, "tok0")
    assert _Recorder.calls == before + 1


def test_留的是最近用过的而不是最早存的(monkeypatch, sent):
    """LRU 而不是先进先出：正在被人反复打开的那张必须留在里面。

    判别方法是让"最早存的两张"里有一张后来又被用过——按最近使用淘汰的话被挤出去的是
    另一张，按插入顺序淘汰的话被挤出去的正是这张还在用的。
    """
    _hits(monkeypatch, "old")
    _hits(monkeypatch, "hot")
    _hits(monkeypatch, "old")  # old 最近被用过，此刻 hot 才是最"旧"的那一张
    for i in range(wechat._QR_CACHE_MAX - 1):
        _hits(monkeypatch, f"tok{i}")
    assert _cached("old"), "最近用过的码被挤掉了，淘汰按的是插入顺序"
    assert not _cached("hot")


def _cached(scene):
    """缓存键是 (版本, page, scene) 三元组，所以按 scene 找。"""
    return any(k[2] == scene for k in wechat._qr_cache)


def test_回源才留一行日志而且不带凭据(monkeypatch, sent, caplog):
    """这一行是"到底有没有真打微信、烧没烧配额"唯一的外部证据，命中缓存时不该有。

    绝不带 access_token：那条请求的 URL 上整个挂着它，写进 journald 等于把凭据抄给
    任何能看日志的人（同一类问题这轮已经在别处修过一次）。scene 只留前 6 位。
    """
    import logging

    scene = "abc123def456abcdef"
    with caplog.at_level(logging.INFO, logger="app.services.wechat"):
        _hits(monkeypatch, scene)
        misses = [r.getMessage() for r in caplog.records if "小程序码" in r.getMessage()]
        caplog.clear()
        _hits(monkeypatch, scene)
        hits = [r.getMessage() for r in caplog.records if "小程序码" in r.getMessage()]

    assert len(misses) == 1, f"回源应当留一行，实际 {len(misses)} 行"
    assert hits == [], "命中缓存也留了日志，那这行就没有信息量了"
    line = misses[0]
    assert scene not in line, "整串 scene（也就是分享 token）进了日志"
    assert scene[:6] in line
    assert "access_token" not in line and "fake-access-token" not in line, line
