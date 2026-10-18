"""外链贴图随笔记存档这条后端链路（正本 `docs/方案-公众号贴图随笔记存档.md` 第八节那十一条）。

跑法：cd backend && .venv/bin/python -m pytest tests/test_note_images.py -q

这批尺子里最要紧的四条，都是"红的时候说的假话最贵"那种：
- **占位图反向钉**：非微信 Referer 回的是 `200 ＋ 2,090 B 那张 140×140 的 jpeg`。
  只按状态码判成败的实现会把它当正文图存进笔记，而且全绿——这一条就是为了让那种写法当场红。
- **两头同值**：服务端的预算与长边必须与 `miniprogram/utils/imageCompress.js` 逐字相等，
  并且**只改一头要红**。两处数字分家之后，"压到同一把尺子"这句承诺就不成立了。
- **一张失败不拖垮整篇**：笔记照建、摘要照出，失败只变成一个数。
- **张数上限只有一个出处**：这一路要读 `MAX_ASSETS_PER_NOTE`，出现第二个字面量 9 就红
  （与 `docs/工具/验-张数只有一个出处.js` 同一条纪律，这一份是把范围扩到新模块那半）。

全程不出网：下载与上传都换成记账的替身，域名解析一律 monkeypatch。
"""
import io
import os
import sys
import time
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_note_images.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import pytest  # noqa: E402
from PIL import Image  # noqa: E402

from app.api.routes.notes import NoteUpdate  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.errors import UserError  # noqa: E402
from app.db.database import Base, SessionLocal, engine  # noqa: E402
from app.models.asset import MAX_ASSETS_PER_NOTE, Asset  # noqa: E402
from app.models.note import Note  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import note_images  # noqa: E402
from app.services import scraper  # noqa: E402
from app.tasks import ingest_tasks  # noqa: E402

CF_URL = "https://gateway.test/v1/functions/image_store"
CF_KEY = "pytest-long-lived-admin-key"


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def channel(monkeypatch):
    """把"通道配好了"这一态打开。默认（现网今天的样子）是没配＝整条不做。"""
    monkeypatch.setattr(settings, "IMAGE_STORE_CF_URL", CF_URL)
    monkeypatch.setattr(settings, "IMAGE_STORE_CF_KEY", CF_KEY)
    return monkeypatch


@pytest.fixture()
def note_user(db):
    u = User(openid=f"imgs-{int(time.time() * 1000)}")
    db.add(u)
    db.commit()
    n = Note(user_id=str(u.id), title="测试篇", source_type="wechat_article",
             source_url="https://mp.weixin.qq.com/s/x")
    db.add(n)
    db.commit()
    db.refresh(n)
    return u, n


# ------------------------------------------------------------------ 替身：下载与上传

def _jpeg(width: int, height: int, quality: int = 90) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (200, 120, 40)).save(buf, "JPEG", quality=quality)
    return buf.getvalue()


def _png(width: int, height: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (10, 20, 30)).save(buf, "PNG")
    return buf.getvalue()


class _Resp:
    def __init__(self, status=200, headers=None, body=b"", json_body=None):
        self.status_code = status
        self.headers = headers or {}
        self.body = body
        self._json = json_body

    @property
    def is_redirect(self):
        return self.status_code in (301, 302, 303, 307, 308) and bool(self.headers.get("location"))

    def text(self):
        return self.body.decode("utf-8", "replace")

    def json(self):
        if self._json is None:
            raise ValueError("no json")
        return self._json

    async def aiter_bytes(self, chunk_size=8192):
        step = max(1, chunk_size)
        for i in range(0, len(self.body), step):
            yield self.body[i:i + step]


class _Stream:
    def __init__(self, resp):
        self._resp = resp

    async def __aenter__(self):
        return self._resp

    async def __aexit__(self, *exc):
        return False


class FakeHttp:
    """GET 回预置的那张图、POST 回一个 fileID，两头都记账。"""

    def __init__(self, routes=None, upload_json=None, upload_status=200):
        self.routes = routes or {}
        self.upload_json = upload_json or {"fileID": "cloud://env.x/images/1/20261019/abc.jpg"}
        self.upload_status = upload_status
        self.gets = []
        self.posts = []

    def stream(self, method, url, **kw):
        self.gets.append(url)
        return _Stream(self.routes.get(url, _Resp(404, body=b"nope")))

    async def post(self, url, json=None, headers=None, **kw):
        self.posts.append({"url": url, "headers": headers or {}, "json": json or {}})
        if self.upload_status >= 400:
            return _Resp(self.upload_status, body=b'{"error":"boom"}')
        return _Resp(200, json_body=self.upload_json)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


def _wire(monkeypatch, fake: FakeHttp):
    monkeypatch.setattr(note_images.httpx, "AsyncClient", lambda **kw: fake)
    # 域名一律解析到公网；写成字面 IP 的那些回它自己（否则"第一跳公网、Location 指向元数据地址"
    # 那条绕法根本测不出来——替身把所有解析都改成公网，等于把闸门替产品关掉了）。
    import ipaddress

    def _resolve(host, *a, **kw):
        try:
            ipaddress.ip_address(host)
            ip = host
        except ValueError:
            ip = "93.184.216.34"
        return [(2, 1, 6, "", (ip, 0))]

    monkeypatch.setattr(scraper.socket, "getaddrinfo", _resolve)
    return fake


def _img(url: str, body: bytes, ctype: str = "image/jpeg") -> dict:
    return {url: _Resp(200, headers={"content-type": ctype}, body=body)}


# ------------------------------------------------------------------ 一、防盗链两种形状

class Test一_占位图与硬拒:
    def test_占位图样本自己得先成立(self):
        """10-19 02:1x 实测那条：2,090 B、JPEG、140×140。断言行为之前先断言样本是那样。"""
        sample = _jpeg(140, 140, quality=20)
        im = Image.open(io.BytesIO(sample))
        assert len(sample) <= note_images.PLACEHOLDER_MAX_BYTES, f"样本 {len(sample)} B，不是那条读数说的那种小图"
        assert (im.width, im.height) == (140, 140)

    def test_占位图必须被拒_只按状态码判的实现会在这条绿(self):
        with pytest.raises(note_images.SkipImage):
            note_images._inspect(_jpeg(140, 140, quality=20))

    def test_小字节但尺寸正常的那张不许误杀(self):
        """10-18 实测腾讯云社区有两张正文图只有 767 B／1,253 B——只按字节卡会把真图判死。"""
        tiny = _png(400, 300)
        im, long_edge = note_images._inspect(tiny)
        assert long_edge == 400 and im.format == "PNG"

    def test_小尺寸的动图不许当占位图丢掉(self):
        """10-19 本机端到端实测到的误杀：真公众号文章里一张 47×91、1,242 B、25 帧的动图。

        占位图那两条阈值只管**静**图——微信那张占位是静 JPEG（140×140／2,090 B），
        动图不可能是它。反向那半条钉的是"只管静图"而不是"动图豁免一切"：同一张去掉动画就得拦。
        """
        frames = [Image.new("RGB", (47, 91), (c * 60 % 256, c * 20 % 256, 200))
                  .convert("P", palette=Image.ADAPTIVE) for c in (1, 2, 3)]
        buf = io.BytesIO()
        frames[0].save(buf, "GIF", save_all=True, append_images=frames[1:], duration=100, loop=0)
        raw = buf.getvalue()
        probe = Image.open(io.BytesIO(raw))
        assert getattr(probe, "is_animated", False) and max(probe.size) <= note_images.PLACEHOLDER_MAX_EDGE
        assert len(raw) <= note_images.PLACEHOLDER_MAX_BYTES, f"样本 {len(raw)} B，够不到那条阈值就白测"
        assert note_images._inspect(raw)[1] == 91

        still = io.BytesIO()
        frames[0].save(still, "GIF")
        one = still.getvalue()
        assert not getattr(Image.open(io.BytesIO(one)), "is_animated", False)
        with pytest.raises(note_images.SkipImage):
            note_images._inspect(one)

    def test_解不出来的当场拒而不是落一行坏数据(self):
        with pytest.raises(note_images.SkipImage):
            note_images._inspect(b"<html>not an image at all</html>")

    def test_响应头不是图片就跳过(self, channel, monkeypatch):
        url = "https://a.test/1.jpg"
        fake = _wire(monkeypatch, FakeHttp({url: _Resp(200, {"content-type": "text/html"}, b"<html>")}))
        out = _run_archive(monkeypatch, fake, [url])
        assert out.total == 1 and not out.kept and len(out.failed) == 1
        assert len(fake.posts) == 0, "响应头就不是图，还往桶里传了一次"

    def test_下载那条路不许带任何Referer(self):
        """两族防盗链方向相反：带自己域名踩小红书那族 403，带对家域踩同一坑。唯一对的做法是不带。"""
        assert not any("referer" in k.lower() for k in note_images.IMAGE_HEADERS)
        for fn in (note_images._download, note_images.archive):
            src = __import__("inspect").getsource(fn).lower()
            assert "referer" not in src, f"{fn.__name__} 里出现了 Referer，那条规则就破了"


# ------------------------------------------------------------------ 二、SSRF 闸门

class Test二_SSRF:
    """图地址来自外部 HTML，不是他打进那一行的，但风险一模一样。"""

    def test_字面内网地址过不了闸门(self, monkeypatch):
        with pytest.raises(UserError):
            note_images._validate("http://169.254.0.23/latest/meta-data/x.png")

    def test_IPv6未指定地址过不了闸门(self, monkeypatch):
        with pytest.raises(UserError):
            note_images._validate("http://[::]:6379/x.png")

    def test_域名解析到内网也拦(self, monkeypatch):
        monkeypatch.setattr(
            scraper.socket, "getaddrinfo",
            lambda *a, **kw: [(2, 1, 6, "", ("10.0.0.5", 0))],
        )
        with pytest.raises(UserError):
            note_images._validate("https://looks-fine.example/x.png")

    def test_跳转目标也要重新判一次(self, channel, monkeypatch):
        """只判第一次＝没判：第一跳公网、Location 指向 169.254.0.23 是最省事的绕法。"""
        hop = "https://ok.example/a.png"
        fake = _wire(monkeypatch, FakeHttp({
            hop: _Resp(302, {"location": "http://169.254.169.254/meta"}, b""),
        }))
        with pytest.raises(UserError):
            import asyncio
            asyncio.run(note_images._download(fake, hop))
        assert fake.gets == [hop], "第二跳不该已经发出去"

    def test_闸门回的句子不暴露内网(self, monkeypatch):
        with pytest.raises(UserError) as e:
            note_images._validate("http://100.64.1.2/x.png")
        assert e.value.args[0] == scraper.BLOCKED_URL_HINT


# ------------------------------------------------------------------ 三、上限与失败形状

def _run_archive(monkeypatch, fake, images, user_id="1", limit=MAX_ASSETS_PER_NOTE):
    import asyncio
    return asyncio.run(note_images.archive(images, user_id, limit))


class Test三_张数与失败:
    def test_十二张只发九次下载只登记九行(self, channel, monkeypatch, db, note_user):
        urls = [f"https://a.test/{i}.jpg" for i in range(12)]
        routes = {u: _Resp(200, {"content-type": "image/jpeg"}, _jpeg(600, 600)) for u in urls}
        fake = _wire(monkeypatch, FakeHttp(routes))
        out = _run_archive(monkeypatch, fake, urls)
        assert len(fake.gets) == MAX_ASSETS_PER_NOTE, f"发了 {len(fake.gets)} 次下载，上限是 {MAX_ASSETS_PER_NOTE}"
        assert len(out.kept) == MAX_ASSETS_PER_NOTE
        assert out.truncated == 3, "被上限砍掉的那三张要能数出来，屏上那句实话读的就是它"
        assert note_images.register(db, note_user[1], out.kept) == MAX_ASSETS_PER_NOTE

    def test_三张里一张下不动时笔记照建那一行也不许虚(self, channel, monkeypatch, db, note_user):
        good = ["https://a.test/1.jpg", "https://a.test/3.jpg"]
        routes = {u: _Resp(200, {"content-type": "image/jpeg"}, _jpeg(500, 500)) for u in good}
        routes["https://a.test/2.jpg"] = _Resp(403, {}, b"denied")
        fake = _wire(monkeypatch, FakeHttp(routes))
        out = _run_archive(monkeypatch, fake, good[:1] + ["https://a.test/2.jpg"] + good[1:])
        assert len(out.kept) == 2 and len(out.failed) == 1
        assert note_images.register(db, note_user[1], out.kept) == 2
        rows = db.query(Asset).filter(Asset.note_id == note_user[1].id).all()
        assert len(rows) == 2
        assert all(r.backup_status == "uploaded" for r in rows), "失败的压根不该落行，落了就是云上没东西却占配额"

    def test_通道没配时一张都不下载_代码可以先上通道后配(self, monkeypatch):
        import asyncio
        monkeypatch.setattr(settings, "IMAGE_STORE_CF_URL", "")
        monkeypatch.setattr(settings, "IMAGE_STORE_CF_KEY", CF_KEY)
        fake = _wire(monkeypatch, FakeHttp({}))
        assert note_images.channel_ready() is False
        out = asyncio.run(note_images.archive(["https://a.test/1.jpg"], "1", MAX_ASSETS_PER_NOTE))
        assert fake.gets == [] and fake.posts == []
        assert out.total == 1 and not out.kept and not out.failed, "没开工不该报成「九张里一张都没存上」"

    def test_占位图那一张进failed而不是kept(self, channel, monkeypatch):
        url = "https://a.test/ph.jpg"
        fake = _wire(monkeypatch, FakeHttp(_img(url, _jpeg(140, 140, quality=20))))
        out = _run_archive(monkeypatch, fake, [url])
        assert not out.kept and out.failed == [url]
        assert fake.posts == [], "拒了就不该还往桶里传"

    def test_上传那一趟回错误时这张算没存上(self, channel, monkeypatch):
        url = "https://a.test/1.jpg"
        fake = _wire(monkeypatch, FakeHttp(_img(url, _jpeg(600, 600)), upload_status=500))
        out = _run_archive(monkeypatch, fake, [url])
        assert not out.kept and len(out.failed) == 1

    def test_没拿到像样fileID时不许落一行指向空的账(self, channel, monkeypatch):
        url = "https://a.test/1.jpg"
        fake = _wire(monkeypatch, FakeHttp(_img(url, _jpeg(600, 600)), upload_json={"fileID": "cloud://"}))
        out = _run_archive(monkeypatch, fake, [url])
        assert not out.kept and len(out.failed) == 1


# ------------------------------------------------------------------ 四、格式、尺寸、压缩

class Test四_不许照URL猜:
    def test_地址尾巴写png回来的却是jpeg时记的必须是jpeg(self, channel, monkeypatch):
        """10-18 实测：`/640?wx_fmt=png` 回的是 JPEG、1080 宽。照着 URL 记就把每张都记错了。"""
        url = "https://mmbiz.qpic.cn/x/640?wx_fmt=png"
        fake = _wire(monkeypatch, FakeHttp(_img(url, _jpeg(1080, 1440), ctype="image/jpeg")))
        out = _run_archive(monkeypatch, fake, [url])
        assert out.kept[0].mime == "image/jpeg"
        assert (out.kept[0].width, out.kept[0].height) == (1080, 1440)

    def test_长边超过1920的那张被缩到1920(self, channel, monkeypatch):
        url = "https://a.test/big.jpg"
        fake = _wire(monkeypatch, FakeHttp(_img(url, _jpeg(4000, 3000))))
        out = _run_archive(monkeypatch, fake, [url])
        assert max(out.kept[0].width, out.kept[0].height) == note_images.MAX_LONG_EDGE

    def test_压完确实进了预算(self, channel, monkeypatch):
        url = "https://a.test/shot.jpg"
        fake = _wire(monkeypatch, FakeHttp(_img(url, _jpeg(1200, 1600, quality=98))))
        out = _run_archive(monkeypatch, fake, [url])
        assert out.kept[0].size <= note_images.BUDGET_BYTES
        assert out.kept[0].over_budget is False

    def test_动图原样存不压(self, channel, monkeypatch):
        """⚠ 这一条是我定的、站长没拍过（他只说「压缩图片」）：压掉就成静帧。要反过来只需一句「动图也压」。

        样本故意做成 800×600 的大动图：60×60 那种会先被占位图那一条拦掉，测的就不是这一条了。
        """
        buf = io.BytesIO()
        frames = [Image.new("RGB", (800, 600), (c * 40 % 256, c * 90 % 256, c * 150 % 256))
                  .convert("P", palette=Image.ADAPTIVE) for c in (1, 2, 3)]
        frames[0].save(buf, "GIF", save_all=True, append_images=frames[1:], duration=100, loop=0)
        raw = buf.getvalue()
        assert max(Image.open(io.BytesIO(raw)).size) > note_images.PLACEHOLDER_MAX_EDGE
        url = "https://mmbiz.qpic.cn/anim.gif"
        fake = _wire(monkeypatch, FakeHttp(_img(url, raw, ctype="image/gif")))
        out = _run_archive(monkeypatch, fake, [url])
        assert out.kept[0].mime == "image/gif"
        import base64
        assert base64.b64decode(fake.posts[0]["json"]["data"]) == raw, "动图被重编码了"

    def test_动图超预算那一格照字节报不硬写False(self, channel, monkeypatch):
        """客户端那把尺子的 `overBudget` 是纯字节比较（不问格式），动图这一支也一样。

        10-19 本机端到端实测：真公众号文章里一张 1078×233 的动图原样存就是 1,018,668 B，
        原来硬写 False 等于账上出现"两倍预算却记成没超"。阈值这里压到 10 B 来钉这一条。
        """
        buf = io.BytesIO()
        frames = [Image.new("RGB", (300, 300), (c * 60 % 256, c * 20 % 256, 200))
                  .convert("P", palette=Image.ADAPTIVE) for c in (1, 2)]
        frames[0].save(buf, "GIF", save_all=True, append_images=frames[1:], duration=100, loop=0)
        raw = buf.getvalue()
        url = "https://mmbiz.qpic.cn/anim2.gif"
        fake = _wire(monkeypatch, FakeHttp(_img(url, raw, ctype="image/gif")))
        assert max(Image.open(io.BytesIO(raw)).size) > note_images.PLACEHOLDER_MAX_EDGE
        assert len(raw) <= note_images.BUDGET_BYTES
        assert _run_archive(monkeypatch, fake, [url]).kept[0].over_budget is False
        monkeypatch.setattr(note_images, "BUDGET_BYTES", 10)
        assert _run_archive(monkeypatch, fake, [url]).kept[0].over_budget is True

    def test_超过网关上限的那张算没存上而不是把整趟撑爆(self, channel, monkeypatch):
        url = "https://a.test/huge.jpg"
        body = _jpeg(3000, 3000, quality=100)
        fake = _wire(monkeypatch, FakeHttp(_img(url, body)))
        monkeypatch.setattr(note_images, "MAX_UPLOAD_BYTES", 1024)
        out = _run_archive(monkeypatch, fake, [url])
        assert not out.kept and out.failed == [url]


# ------------------------------------------------------------------ 五、两头同值

JS = (BACKEND.parent / "miniprogram" / "utils" / "imageCompress.js").read_text(encoding="utf-8")


def _js_number(name: str) -> int:
    """读 `imageCompress.js` 里那一行常量。只认 `1920` 与 `500 * 1024` 两种写法，不 eval。"""
    import re
    m = re.search(rf"const {name} = (\d+)(?: \* (\d+))?\s*\n", JS)
    assert m, f"imageCompress.js 里读不到 {name} 那一行（那头改了写法，这里要跟着改）"
    return int(m.group(1)) * int(m.group(2) or 1)


def _js_ladder() -> list:
    import re
    m = re.search(r"const QUALITY_LADDER = \[([0-9., ]+)\]", JS)
    assert m, "imageCompress.js 里读不到 QUALITY_LADDER 那一行"
    return [float(x) for x in m.group(1).split(",")]


class Test五_两头同一把尺子:
    def test_长边与预算与服务端逐字相等(self):
        assert note_images.MAX_LONG_EDGE == _js_number("MAX_LONG_EDGE")
        assert note_images.BUDGET_BYTES == _js_number("BUDGET_BYTES")
        assert list(note_images.QUALITY_LADDER) == _js_ladder()

    def test_反向钉只改一头立刻红(self, monkeypatch):
        """不立这一条，将来抬预算只会抬出一套两真相：客户端 800KB、服务端 500KB，谁都没错但图不一样。"""
        monkeypatch.setattr(note_images, "BUDGET_BYTES", 800 * 1024)
        with pytest.raises(AssertionError):
            assert note_images.BUDGET_BYTES == _js_number("BUDGET_BYTES")

    def test_张数上限不许在这里出现第二个字面量(self):
        """`docs/工具/验-张数只有一个出处.js` 同一条纪律，只是把扫的范围扩到新模块。"""
        src = Path(note_images.__file__).read_text(encoding="utf-8")
        body = src.split('"""', 2)[2]  # 模块头那大段话里会正引用"最多 9 张"那句原话，不算写死的数
        assert "MAX_ASSETS_PER_NOTE" in Path(ingest_tasks.__file__).read_text(encoding="utf-8")
        for bad in ("= 9", "limit=9", ", 9)", "range(9)"):
            assert bad not in body, f"新模块里出现了第二个上限写法 {bad!r}"


# ------------------------------------------------------------------ 六、来源那三件

WX_HTML = """
<html><body>
<h1 class="rich_media_title">班车全攻略</h1>
<div id="js_name">ZJU攻城狮</div>
<div class="rich_media_content" id="js_content">
  <img data-src="//mmbiz.qpic.cn/a.png" src="data:image/png;base64,AAA">
  <img data-src="https://mmbiz.qpic.cn/b.png">
  <img data-src="https://mmbiz.qpic.cn/a.png">
  <p>正文在这里</p>
</div>
</body></html>
"""

XHS_HTML = """
<html><head><meta property="og:title" content="芭蕾第二集"></head><body>
<script>window.__SSR__=true</script>
<script>window.__INITIAL_STATE__={"note":{"noteDetailMap":{"N1":{"note":{
 "title":"芭蕾第二集","desc":"家长们看看吧",
 "user":{"nickname":"护护","avatar":undefined},
 "imageList":[
  {"urlPre":"http://s.test/1-prev.jpg","urlDefault":"http://s.test/1.jpg","width":1247,"height":1667},
  {"urlDefault":"http://s.test/2.jpg","width":1273,"height":1662},
  {"urlDefault":"http://s.test/2.jpg","width":1273,"height":1662}
 ]}}}},"feed":undefined}</script>
<img src="https://fe-static.xhscdn.com/ui-icon.png">
</body></html>
"""


class Test六_来源:
    def test_公众号那一篇取到作者名与正文图(self):
        parsed = scraper._parse_wechat_article(WX_HTML, "https://mp.weixin.qq.com/s/x", "wechat_article")
        assert parsed["author"] == "ZJU攻城狮"
        assert parsed["images"] == ["https://mmbiz.qpic.cn/a.png", "https://mmbiz.qpic.cn/b.png"], \
            "地址要补成绝对、按文档顺序去重，而且只读 data-src（实测一条 src 都没有）"

    def test_小红书那一篇的图不在DOM里(self):
        extra = scraper._xiaohongshu_extras(XHS_HTML)
        assert extra["images"] == ["http://s.test/1.jpg", "http://s.test/2.jpg"], "取 urlDefault，不是 urlPre"
        assert extra["author"] == "护护"

    def test_那段JSON解不开时只是没有图(self):
        assert scraper._xiaohongshu_extras("<script>window.__INITIAL_STATE__={坏掉的") == {}

    def test_快照键名与转存那一路逐字同名(self):
        parsed = scraper._parse_wechat_article(WX_HTML, "https://mp.weixin.qq.com/s/x", "wechat_article")
        snap = ingest_tasks._source_snapshot(parsed, "https://mp.weixin.qq.com/s/x")
        assert snap["author_name"] == "ZJU攻城狮"
        assert snap["title_at_import"] == "班车全攻略"
        assert "source_url" in snap and "imported_at" in snap
        assert not ({"share_token", "source_note_id", "author_user_id"} & set(snap)), \
            "没有对应物的三键不该塞空串占位——读的那一头一有空值就画出一种空名字"

    def test_取不到作者名就整份不写(self):
        assert ingest_tasks._source_snapshot({"author": "", "title": "T"}, "https://x.test/a") is None

    def test_来源类型不许被改成转存那一档(self):
        """配额把 `share_import` 单独排出去了（`quota._is_his_first_note`、`credit_import`），改了会把两笔账搞混。"""
        parsed = scraper._parse_wechat_article(WX_HTML, "https://mp.weixin.qq.com/s/x", "wechat_article")
        assert parsed["source_type"] == "wechat_article"

    def test_编辑接口碰不到imported_from(self, db, note_user):
        """复用 `tests/test_share_snapshot.py` 那条的写法，外链这一路也钉一次。"""
        _, n = note_user
        n.imported_from = {"author_name": "原来那个"}
        db.commit()
        assert "imported_from" not in NoteUpdate.model_fields, "它一旦进了编辑模型，这条来源就改得掉了"


# ------------------------------------------------------------------ 七、任务那一段

class Test七_任务回体:
    def _scraped(self, images=None, author="ZJU攻城狮"):
        return {"content": "正文有的", "title": "T", "source_type": "wechat_article",
                "status_code": 200, "images": images or [], "author": author}

    def _run(self, db, statuses, monkeypatch, scraped, archive=None):
        user, _ = _make_user(db)

        async def ok(url):
            return scraped

        async def know(text, fallback_title=None, translate=None):
            return {"title": "标题", "summary": "摘要", "key_points": [], "tags": [], "degraded": False}

        monkeypatch.setattr(ingest_tasks, "scrape_url", ok)
        monkeypatch.setattr(ingest_tasks, "extract_knowledge", know)
        monkeypatch.setattr(ingest_tasks, "_blocked", lambda url: False)
        monkeypatch.setattr(ingest_tasks, "set_task_status", lambda tid, st, res=None: statuses.append((tid, st, res)))
        if archive is not None:
            monkeypatch.setattr(note_images, "archive", archive)
        monkeypatch.setattr(note_images.settings, "IMAGE_STORE_CF_URL", CF_URL)
        monkeypatch.setattr(note_images.settings, "IMAGE_STORE_CF_KEY", CF_KEY)
        ingest_tasks.process_url_task("t1", str(user.id), "https://mp.weixin.qq.com/s/x", user.generation)
        return db.query(Note).order_by(Note.id.desc()).first(), statuses

    def test_存图成功时回体带那四个数(self, db, monkeypatch):
        statuses = []
        urls = [f"https://a.test/{i}.jpg" for i in range(12)]

        async def fake_archive(images, user_id, limit):
            return note_images.ArchiveResult(
                kept=[note_images.Prepared(f"cloud://e.x/{i}", "image/jpeg", 1000, 10, 10, False, u)
                      for i, u in enumerate(images[:limit])],
                failed=[], total=len(images))

        note, statuses = self._run(db, statuses, monkeypatch, self._scraped(urls), fake_archive)
        payload = statuses[-1][2]
        assert (payload["images_total"], payload["images_kept"], payload["images_failed"],
                payload["images_truncated"]) == (12, MAX_ASSETS_PER_NOTE, 0, 12 - MAX_ASSETS_PER_NOTE)
        assert note.imported_from["author_name"] == "ZJU攻城狮"
        assert note.imported_from["images_total"] == 12

    def test_存图整段炸了这次转存不算失败(self, db, monkeypatch):
        """笔记已经落库、摘要已经出来——"存不下"不许变成"这次抓取失败"。"""
        statuses = []

        async def explode(images, user_id, limit):
            raise RuntimeError("网关挂了")

        note, statuses = self._run(db, statuses, monkeypatch,
                                   self._scraped(["https://a.test/1.jpg"]), explode)
        assert note is not None and statuses[-1][1] == "completed"
        assert "images_total" not in statuses[-1][2], "整段没做成时不该报数，那会被读成「一张都没存上」"
        assert db.query(Asset).count() == 0

    def test_没有图的篇子回体里一个图相关的键都不多(self, db, monkeypatch):
        statuses = []
        _, statuses = self._run(db, statuses, monkeypatch, self._scraped([]))
        assert not [k for k in statuses[-1][2] if k.startswith("images_")]

    def test_登记每一行的file_size都有值且状态只有已上传(self, db, monkeypatch):
        """第八节第 9 条：`uploaded + failed == total` 那条不变量，加上"体积不知道"那格不该由这条路造出来。"""
        statuses = []
        urls = ["https://a.test/1.jpg", "https://a.test/2.jpg"]

        async def fake_archive(images, user_id, limit):
            return note_images.ArchiveResult(
                kept=[note_images.Prepared(f"cloud://e.x/{i}", "image/jpeg", 2048 + i, 40, 30, False, u)
                      for i, u in enumerate(images)],
                failed=[], total=len(images))

        note, _ = self._run(db, statuses, monkeypatch, self._scraped(urls), fake_archive)
        rows = db.query(Asset).filter(Asset.note_id == note.id).all()
        assert len(rows) == 2
        assert all(r.file_size and r.width == 40 and r.height == 30 for r in rows)
        assert all(r.backup_status == "uploaded" for r in rows)


def _make_user(db):
    u = User(openid=f"task-{int(time.time() * 1000000) % 10**9}")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u, None
