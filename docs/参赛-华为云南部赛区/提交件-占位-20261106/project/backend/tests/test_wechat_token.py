"""微信凭据这一环的用例。

起因是 2026-09-24 现网：另有一个进程用同一套 appid/secret 取了一次 access_token，
旧 token 立刻被微信判成 "invalid credential or not latest"（40001），而本进程还抱着
缓存里的旧值不放，结果小程序码和内容安全两条一起挂。三条不变量钉在这里：
① 取 token 走稳定版接口，凭据放 body 不进 URL（异常文本会带整条 URL）。
② 拿到 40001/42001/40014 必须清缓存重来，且只重来一趟——凭据真错时不许来回打。
③ "没检成"和"内容有问题"永远是两件事：重试完还不行就报 unavailable，不放行也不拒人。
"""
import asyncio
import json
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_token.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
os.environ["SEC_CHECK_ENABLED"] = "false"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from app.services import wechat

SECRET = 'SENTINEL-secret-never-in-a-url'


class Resp:
    def __init__(self, status=200, body=None, content=b'', ctype='application/json'):
        self.status_code = status
        self._body = body if body is not None else {}
        self.content = content
        self.headers = {'content-type': ctype}

    def json(self):
        return self._body


class Call:
    def __init__(self, url, **kw):
        self.url = url
        self.kw = kw


class Recorder:
    """按脚本依次回响应，同时冒充 httpx.Client 与 httpx.AsyncClient。

    同步/异步两边各一个壳：产品代码里同步 def 的路径用 Client，异步路径用 AsyncClient，
    两个壳共用同一份脚本和同一份调用记录，断言才看得出"到底打了几趟、每趟用的哪个 token"。
    """

    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def _next(self, url, kw):
        self.calls.append(Call(url, **kw))
        if not self.script:
            raise AssertionError('打多了：脚本已经用完')
        return self.script.pop(0)

    def sync(self):
        outer = self

        class C:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def post(self, url, **kw):
                return outer._next(url, kw)

        return C()

    def async_(self):
        outer = self

        class A:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def post(self, url, **kw):
                return outer._next(url, kw)

        return A()


@pytest.fixture()
def clean_cache(monkeypatch):
    wechat._invalidate_access_token()
    wechat._qr_cache.clear()
    yield
    wechat._invalidate_access_token()
    wechat._qr_cache.clear()


def _patch(monkeypatch, rec):
    class Httpx:
        @staticmethod
        def Client(*a, **k):
            return rec.sync()

        @staticmethod
        def AsyncClient(*a, **k):
            return rec.async_()

    monkeypatch.setattr(wechat, 'httpx', Httpx)


def test_token_走稳定版接口且凭据不进_url(monkeypatch, clean_cache):
    rec = Recorder([Resp(body={'access_token': 'tok-A', 'expires_in': 7200})])
    _patch(monkeypatch, rec)
    monkeypatch.setattr(wechat.settings, 'WECHAT_APP_SECRET', SECRET)
    got = wechat._access_token_sync()
    assert got == 'tok-A'
    c = rec.calls[0]
    assert 'stable_token' in c.url and 'cgi-bin/token?' not in c.url
    assert SECRET not in c.url and SECRET not in str(c.kw.get('params'))
    assert c.kw['json']['secret'] == SECRET


def test_token_有缓存就不重复取(monkeypatch, clean_cache):
    rec = Recorder([Resp(body={'access_token': 'tok-B', 'expires_in': 7200})])
    _patch(monkeypatch, rec)
    assert wechat._access_token_sync() == 'tok-B'
    assert wechat._access_token_sync() == 'tok-B'
    assert len(rec.calls) == 1


def test_内容安全拿到40001_清缓存只重试一趟(monkeypatch, clean_cache):
    wechat._access_token_cache.update({'token': '旧的已经作废', 'expires_at': 9e9})
    rec = Recorder([
        Resp(body={'errcode': 40001, 'errmsg': 'invalid credential'}),
        Resp(body={'access_token': 'tok-C', 'expires_in': 7200}),
        Resp(body={'errcode': 0, 'result': {'suggest': 'pass', 'label': 100}}),
    ])
    _patch(monkeypatch, rec)
    out = wechat._ask_sec_check('openid-x', '一段正常文本')
    assert out['verdict'] == 'pass', out
    urls = [c.url for c in rec.calls]
    assert 'stable_token' in urls[1] and 'msg_sec_check' in urls[0] and 'msg_sec_check' in urls[2]
    # 第二趟用的必须是新拿到的 token，不是缓存里那个作废的
    assert 'access_token=tok-C' in urls[2]


def test_凭据真错时只打两趟不无限重试(monkeypatch, clean_cache):
    # 第一趟 token 是好的，送检却回 40001；清缓存重取一趟，第二趟回 40013（appid 本身不对，
    # 这不在"重试有用的那一类"里），到此就该停：凭据真错时不许来回打微信。
    rec = Recorder([
        Resp(body={'access_token': 'tok-D0', 'expires_in': 7200}),
        Resp(body={'errcode': 40001, 'errmsg': 'invalid credential'}),
        Resp(body={'access_token': 'tok-D', 'expires_in': 7200}),
        Resp(body={'errcode': 40013, 'errmsg': 'invalid appid'}),
    ])
    _patch(monkeypatch, rec)
    out = wechat._ask_sec_check('openid-x', '一段正常文本')
    assert out['verdict'] == 'unavailable' and out['errcode'] == 40013, out
    assert len(rec.calls) == 4


def test_二维码40001_重试一趟拿到图(monkeypatch, clean_cache):
    wechat._access_token_cache.update({'token': '作废的', 'expires_at': 9e9})
    jpeg = b'\xff\xd8\xff' + b'x' * 40
    rec = Recorder([
        Resp(body={'errcode': 40001, 'errmsg': 'invalid credential'}),
        Resp(body={'access_token': 'tok-E', 'expires_in': 7200}),
        Resp(body=None, content=jpeg, ctype='image/jpeg'),
    ])
    _patch(monkeypatch, rec)
    got = asyncio.run(wechat.get_qr_code_image('scene-1', page='pages/share/view'))
    assert got == jpeg
    assert 'access_token=tok-E' in rec.calls[2].url
    assert wechat._qr_cache.get(('release', 'pages/share/view', 'scene-1')) == jpeg
