r""""微博链接要能提取出内容"——10-31 站长那句「我的需求，就是要提取内容，至于怎么提取，你考虑，我只要结果」。

改之前的现读（本机与现网两个出口读数一样）：`https://weibo.com/1649679354/5359090512694626`
走网页那一路＝**302 → `passport…/visitor/visitor` → 200、9,648 B、标题 `Sina Visitor System`、正文 0 字**，
屏上那句「未能从 URL 提取到有效内容」，并且这一发会被算成"这个站读不到"往黑名单里加一格
（现网 `source_blocklist` 此刻 weibo.com 计 2／阈值 3，只差一次就被整台拉黑）。

改之后走微博给自家移动网页用的那一份数据（不要 cookie、不要签名，只认三枚手机身份头），
真链接现读五型（`scrape_url` 走生产代码，本机出口）：

| 这一型 | 真链接的号 | 字数 | 配图 | 备注 |
|---|---|---|---|---|
| 图文（六张） | `1649679354/5359090512694626` | 42 | **6**（`mw2000`） | 作者「初晓敏」，标题掐掉了尾部 `...` |
| bid 形状＋话题 | `2656274875/H5Ro3mlPz` | 143 | **5** | 号码是 9 位字母数字，不是数字 |
| 视频长文 | `2656274875/5219471979709155` | 346 | 0 | 长文标记为真，全文那一发与主口逐字等长 |
| 移动页 detail | `m.weibo.cn/detail/5070809180407657` | 303 | 0 | |
| 转发 | `7478855230/5208601192040603` | 198 | 0 | 转发语 46＋原文 139，中间接 `//@央视新闻：` |

两种"这一条微博没了"的现读形状各自有一句人话（都回 **HTTP 200**，只有错误码分得开）：
`5007815001244072` → `errno 20101` 该微博不存在；`1736988591/5218886967890075` → `errno 20170` 由于博主设置内容暂不可见。

⚠ 下面这些用例**全部离线**：不碰网络、不碰库。真链接那五型是另一件事，读数记在上面这张表里、
也记进 `docs/枚举-URL转存全部情况.md`。桩的形状照 10-31 现读的那份数据来（`pics[].large.url` 是
`mw2000`、`pics[].url` 是 `orj360`、表情是 `<img alt="[衰]" src="https://face.t.sinajs.cn/…">`），
不是凭印象编的。
"""
import asyncio
import json as _json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from app.core.errors import UserError
from app.services import scraper

FACE = "https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal/0a/201810_shuai_mobile.png"
ICON = "https://n.sinaimg.cn/photo/5213b46e/20180926/timeline_card_small_super_default.png"
BIG = "https://wx4.sinaimg.cn/mw2000/62541bfaly1iiic446fobj22cc34gnpe.jpg"
SMALL = "https://wx4.sinaimg.cn/orj360/62541bfaly1iiic446fobj22cc34gnpe.jpg"
BIG2 = "https://wx3.sinaimg.cn/mw2000/62541bfaly1iiic2ukeg5j22dc35cu0y.jpg"


def _一条微博(**改动) -> dict:
    """10-31 现读那份数据的形状（只留这一族真用到的那几格）。`改动` 覆盖顶层键。"""
    base = {
        "id": "5359090512694626",
        "status_title": "你跳跃我深邃 你亮色我暗色咱们主...",
        "text": "你跳跃我深邃 你亮色我暗色<br />咱们主打一个大大的反差"
                "<span class=\"url-icon\"><img alt=\"[衰]\" src=\"%s\" style=\"width:1em\" /></span>" % FACE,
        "isLongText": False,
        "pics": [
            {"pid": "62541bfaly1iiic446fobj22cc34gnpe", "url": SMALL, "size": "orj360",
             "geo": {"width": 360, "height": 479, "croped": False},
             "large": {"size": "large", "url": BIG, "geo": {"width": 2048, "height": 2730, "croped": False}}},
            {"pid": "62541bfaly1iiic2ukeg5j22dc35cu0y", "url": "https://wx3.sinaimg.cn/orj360/x.jpg", "size": "orj360",
             "large": {"size": "large", "url": BIG2}},
        ],
        "user": {"screen_name": "初晓敏"},
    }
    base.update(改动)
    return base


# ---------- 一、认链接 ----------

@pytest.mark.parametrize("链接", [
    "https://weibo.com/1649679354/5359090512694626",
    "http://weibo.com/1649679354/5359090512694626",
    "https://www.weibo.com/1649679354/5359090512694626",
    "https://weibo.com/2656274875/H5Ro3mlPz",
    "https://weibo.com/2656274875/5218867800705538?display=0&retcode=6102",
    "https://m.weibo.cn/status/5219471979709155",
    "https://m.weibo.cn/status/H5Ro3mlPz",
    "https://m.weibo.cn/detail/5070809180407657",
    "https://m.weibo.cn/detail/5070809180407657?jumpfrom=weibocom",
])
def test_九种真链接形状都认得出号码(链接):
    assert scraper._weibo_status_id(链接), 链接


@pytest.mark.parametrize("链接", [
    "https://weibo.com/u/1649679354",                 # 主页，不是某一条
    "https://weibo.com/1649679354",                   # 少了那一段号码
    "https://weibo.com/ttarticle/p/show?id=2309405242625585446946",  # 头条文章，另一族
])
def test_反向_主页与文章页那些形状不许硬凑出一个号码(链接):
    """认不出号码时 `_fetch_weibo` 回 None ⇒ 落回今天那条网页路（不新增失败形状）。
    要是这里"顺手"把 `230940…` 或 `u/` 后面那串当号码，就会拿一个不存在的号去打数据口。"""
    assert scraper._weibo_status_id(链接) == ""


def test_选取法只看域名不看路径():
    assert scraper._is_weibo("https://m.weibo.cn/detail/5070809180407657") is True
    assert scraper._is_weibo("https://weibo.com/1649679354/5359090512694626") is True


@pytest.mark.parametrize("链接", [
    "https://www.zhihu.com/question/1",
    "https://mp.weixin.qq.com/s/abc",
    "https://xhslink.cn/o/xyz",
    "https://weibo.com.evil.example/1649679354/5359090512694626",
])
def test_反向_后缀拼出来的假域名不许走这一支(链接):
    """`weibo.com.evil.example` 这一条是这一族唯一能被拼串的地方：判定走 `hostname` 全等，
    不是 `in url`——写成后者，一个假域名就能把抓取器支使到任意站点去。"""
    assert scraper._is_weibo(链接) is False


# ---------- 二、正文那一段 HTML 压回字 ----------

def test_表情留名字而话题图标整枚丢():
    """现读形状：表情 `<img alt="[衰]">`（屏上就是那张脸，名字就是那几个字），
    话题图标那张 `img` **没有 alt**（它在屏上是一张 1rem 的小图，没有任何字）。"""
    带图标的 = ("<a href=\"https://m.weibo.cn/p/index\">​<span class='url-icon'>"
               "<img style='width: 1rem' src='%s'></span><span class=\"surl-text\">周深</span></a>"
               " 古老的诗意<img alt=\"[心]\" src=\"%s\">" % (ICON, FACE))
    out = scraper._weibo_text(带图标的)
    assert "[心]" in out and "周深" in out, out
    assert "surl-text" not in out and "url-icon" not in out, out
    assert ICON not in out and FACE not in out, "图地址漏进正文了"
    assert "\u200b" not in out, "零宽空格留在屏上是一个看不见的洞"


def test_换行与首尾空白按屏上的样子回来():
    assert scraper._weibo_text("第一段<br />第二段<br/><br/>   第三段   ") == "第一段\n第二段\n第三段"


def test_反向_整枚丢表情就会把一句话削成半句():
    """上面那条用例的 `[衰]` 不是运气：改成"见到 img 就 decompose"，字数照样不减反稳，
    但那枚表情名从正文里消失了——提炼拿到的是半句话。这一条钉的是"留 alt"这一步。"""
    只有表情 = "反差<img alt=\"[猪头]\" src=\"%s\">" % FACE
    assert scraper._weibo_text(只有表情) == "反差[猪头]"


# ---------- 三、配图取大那张 ----------

def test_配图取mw2000那一张不是预览的360():
    assert scraper._weibo_pics(_一条微博()) == [BIG, BIG2]


def test_反向_只读url那一格取回来的是360宽的预览图():
    """`pics[].url` 是 `orj360`（360×479，现读），`pics[].large.url` 才是 `mw2000`（2048×2730）。
    下游还要压到单张预算，从 360 起压只会更糊，所以这里必须优先取大那份。"""
    没有large = {"pics": [{"url": SMALL, "size": "orj360"}]}
    assert scraper._weibo_pics(没有large) == [SMALL], "large 缺位时该退到 url，不许整条丢图"


@pytest.mark.parametrize("脏桩", [None, "字符串", {}, {"pics": None}, {"pics": ["不是字典"]}, {"pics": [{}]}])
def test_配图这一格再脏也不许把整篇带崩(脏桩):
    assert scraper._weibo_pics(脏桩) == []


# ---------- 四、回体那一圈 ----------

def test_标题掐掉尾部那三个点():
    """现读 `status_title`＝「你跳跃我深邃 你亮色我暗色咱们主...」——主口给的就是掐过头的一串。"""
    assert scraper._parse_weibo(_一条微博())["title"] == "你跳跃我深邃 你亮色我暗色咱们主"


def test_没标题时退到作者名而不是留一格空():
    got = scraper._parse_weibo(_一条微博(status_title=""))["title"]
    assert got == "初晓敏 的微博", got
    got2 = scraper._parse_weibo(_一条微博(status_title="", user={}))["title"]
    assert got2 == "微博正文", got2


def test_转发那一型把原文接在后面并且用微博自己那个写法():
    原文 = {"text": "#周深中秋晚会官宣# 娓娓道来，邀你相聚~", "user": {"screen_name": "央视新闻"}, "pics": []}
    got = scraper._parse_weibo(_一条微博(text="古老的诗意与现代的节奏交织~", retweeted_status=原文))
    assert got["content"] == "古老的诗意与现代的节奏交织~\n\n//@央视新闻：#周深中秋晚会官宣# 娓娓道来，邀你相聚~"


def test_转发两边的图并起来_自己的在前():
    原文 = {"text": "原文", "user": {"screen_name": "乙"}, "pics": [{"large": {"url": "https://wx1.sinaimg.cn/mw2000/rt.jpg"}}]}
    got = scraper._parse_weibo(_一条微博(retweeted_status=原文))
    assert got["images"] == [BIG, BIG2, "https://wx1.sinaimg.cn/mw2000/rt.jpg"], got["images"]


def test_同一张图在转发两边各出现一次只留一条():
    原文 = {"text": "原文", "user": {"screen_name": "乙"}, "pics": [{"large": {"url": BIG}}]}
    assert scraper._parse_weibo(_一条微博(retweeted_status=原文))["images"] == [BIG, BIG2]


def test_长文那一份只在它确实更长时才顶掉主口():
    got = scraper._parse_weibo(_一条微博(text="前一段<br />后一段", isLongText=True), own_full="全文那一发长得多，把两段都写全了")
    assert got["content"].startswith("全文那一发"), got["content"]


def test_全文那一发回空串时主口那一份不许被抹掉():
    """老微博、被拆楼的楼中楼都会回空；这一岔的代价是"少几个字"，不是"整篇没了"。"""
    got = scraper._parse_weibo(_一条微博(), own_full="")
    assert got["content"] == "你跳跃我深邃 你亮色我暗色\n咱们主打一个大大的反差[衰]", got["content"]


def test_回体里站名那一格是空串_名字由词表那一层认():
    """这一族不读 HTML，没有 `og:site_name`；空串不等于"这篇没名字"——
    `site_names.builtin_site` 按域名后缀认 `weibo.com`／`weibo.cn`＝微博（表里那两行是 10-29 那趟落的）。"""
    from app.services import site_names
    assert scraper._parse_weibo(_一条微博())["site_name_meta"] == ""
    assert site_names.builtin_site("https://m.weibo.cn/detail/5070809180407657")["zh"] == "微博"
    assert site_names.builtin_site("https://weibo.com/1649679354/5359090512694626")["zh"] == "微博"


def test_配图那一批点名要带微博自己的来路_而另外两族不许跟着带():
    """10-31 现网出口读数：生产那套下载头不带 Referer 时 `wx*.sinaimg.cn` 整批 403／238 B，
    带 `https://m.weibo.cn/` 三档全 200，带外站来路仍 403 ⇒ 这一枚只能由知道来路的那一层给。
    反向那半条钉的是"不是全局开关"：公众号与通用那两族的回体里**没有这一键**，
    下游取 `.get("image_referer")` 拿到空串＝一个字都不加（那两族的形状见 `note_images` 文件头第 3 条）。"""
    assert scraper._parse_weibo(_一条微博())["image_referer"] == "https://m.weibo.cn/"
    公众号 = scraper._parse_wechat_article("<div id='js_content'><p>字</p></div>", "https://mp.weixin.qq.com/s/x", "wechat_article")
    通用 = scraper._parse_general_url("<html><body><div class='article-body'><p>字</p></div></body></html>", "https://blog.example.com/a", "web_article")
    assert 公众号.get("image_referer", "") == "" and 通用.get("image_referer", "") == ""


# ---------- 五、出网那一层（假 client，桩照现读的回体） ----------

class _回:
    def __init__(self, 状态码=200, 体=None, 文本=None):
        self.status_code = 状态码
        self._文本 = 文本
        self.content = 体 if 体 is not None else (文本 or "").encode()

    def json(self):
        if self._文本 is None:
            raise ValueError("没有 JSON")
        return _json.loads(self._文本)


class _假客户端:
    """按 URL 分发：`show` 一发、`extend` 一发。`要什么` 记着真发过哪几发（不许"顺手"多打一发）。"""

    def __init__(self, 回体):
        self.回体 = 回体
        self.打过 = []

    def __call__(self, *a, **kw):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, **kw):
        self.打过.append(url)
        for 前缀, 回 in self.回体.items():
            if 前缀 in url:
                return 回
        raise AssertionError("打到了没安排的地址：%s" % url)


def _跑(monkeypatch, 回体, 链接="https://weibo.com/1649679354/5359090512694626"):
    假 = _假客户端(回体)
    monkeypatch.setattr(scraper.httpx, "AsyncClient", 假)
    monkeypatch.setattr(scraper, "_validate_url", lambda u: u)  # 闸门自己那批用例在 test_scraper_ssrf.py
    out = asyncio.run(scraper._fetch_weibo(链接))
    return out, 假


def _微博回体(**改动) -> str:
    return _json.dumps({"ok": 1, "data": _一条微博(**改动)}, ensure_ascii=False)


def test_取不到号码时整支返回空让上层落回网页那条路(monkeypatch):
    out, 假 = _跑(monkeypatch, {}, 链接="https://weibo.com/u/1649679354")
    assert out is None
    assert 假.打过 == [], "认不出号码就不该出一趟网"


def test_正常那一发带回体与状态码(monkeypatch):
    out, 假 = _跑(monkeypatch, {"statuses/show": _回(200, 文本=_微博回体())})
    assert out["status_code"] == 200 and out["images"] == [BIG, BIG2]
    assert len(假.打过) == 1, "不是长文就不该多打全文那一发"


def test_长文那一型才补打全文那一发(monkeypatch):
    out, 假 = _跑(monkeypatch, {
        "statuses/show": _回(200, 文本=_微博回体(isLongText=True, text="掐了一半...")),
        "statuses/extend": _回(200, 文本=_json.dumps({"ok": 1, "data": {"longTextContent": "这是完整的长文正文，一段到底"}})),
    })
    assert out["content"] == "这是完整的长文正文，一段到底", out["content"]
    assert len(假.打过) == 2, 假.打过


def test_全文那一发炸了只丢那一发不丢整篇(monkeypatch):
    out, _ = _跑(monkeypatch, {
        "statuses/show": _回(200, 文本=_微博回体(isLongText=True)),
        "statuses/extend": _回(500),
    })
    assert out["content"].startswith("你跳跃我深邃"), out["content"]


@pytest.mark.parametrize("错误码,该念的那句", [
    ("20101", "这条微博不存在或已被删除"),
    ("20170", "这条微博设置了权限，看不到内容"),
])
def test_两种没了的形状各自一句人话_而且是用户错误不是站点错误(monkeypatch, 错误码, 该念的那句):
    """两发都回 **HTTP 200**：按状态码判就只能念"提取失败"这种没信息的话；
    按 `UserError` 抛（而不是 `SiteHttpError`）是为了一件事——**它不进黑名单计数**。
    "这一条被博主设了权限"不是"weibo.com 这个站读不到"，攒三条这种就把整台站拉黑了。"""
    体 = _json.dumps({"ok": 0, "errno": 错误码, "msg": " Whatever"})
    with pytest.raises(UserError) as 拒:
        _跑(monkeypatch, {"statuses/show": _回(200, 文本=体)})
    assert str(拒.value) == 该念的那句


def test_认不出的错误码退成通用那一句而不是把站方原文直送用户(monkeypatch):
    """站方 msg 是"Due to author settings…"这类中英混合串，还可能超长（toast 只两行）。"""
    体 = _json.dumps({"ok": 0, "errno": "12345", "msg": "一些很长很长的站方原文"})
    with pytest.raises(UserError) as 拒:
        _跑(monkeypatch, {"statuses/show": _回(200, 文本=体)})
    assert str(拒.value) == "这条微博读不到内容"


def test_回的不是json时落回网页那一路_不许崩(monkeypatch):
    """微博偶尔把数据口也 302 进登录壳（10-31 现读那枚 `container/getIndex` 就是这条路回 432）。"""
    out, _ = _跑(monkeypatch, {"statuses/show": _回(200, 体=b"<html>login</html>")})
    assert out is None


def test_数据口回4xx时算站点错误_与网页那一路同一口径(monkeypatch):
    """黑名单要数的就是这一型（`_note_site_failure` 只认 `SiteHttpError` 与"200 且 0 字"）。"""
    from app.services.scraper import SiteHttpError
    with pytest.raises(SiteHttpError) as 拒:
        _跑(monkeypatch, {"statuses/show": _回(432, 体=b"")})
    assert 拒.value.status_code == 432


def test_正文一个字都没有时不许回0字(monkeypatch):
    """回 0 字会被下游那句 `if not text.strip()` 算成"这个站读不到"，攒三次把整台 weibo.com 拉黑；
    现网此刻已经计 2（10-31 现读 `source_blocklist` 三行：weibo.com 计 2／www.zhihu.com 计 2／xhslink.cn 计 3 已拦）。
    只有视频、没有字的那条，当场念一句人话，不占黑名单那一格。"""
    with pytest.raises(UserError) as 拒:
        _跑(monkeypatch, {"statuses/show": _回(200, 文本=_微博回体(text="", pics=[]))})
    assert str(拒.value) == "这条微博只有视频，没有文字内容"


class _访客壳响应:
    """`client.stream(...)` 那一发需要的最小形状：非跳转、200、一段访客壳 HTML。"""

    def __init__(self, html: str):
        self._html = html

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    is_redirect = False
    status_code = 200
    headers: dict = {}
    encoding = "utf-8"

    async def aiter_bytes(self, chunk_size=8192):
        yield self._html.encode()


class _假网页客户端:
    def __init__(self, html: str):
        self.打过 = []
        self._html = html

    def __call__(self, *a, **kw):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def stream(self, method, url):
        self.打过.append(url)
        return _访客壳响应(self._html)


def test_微博那一支回空时上层照旧走网页那一路(monkeypatch):
    """这一条钉的是"不许比今天更差"：认不出号码（微博主页那种）或站点回的形状不认识时，
    `_fetch_weibo` 给 None，`_fetch_and_parse` 必须继续走原来那条抓网页的路——
    今天粘一条微博主页就是这个形状（访客壳、`Sina Visitor System`、正文 0 字），改完还是它。"""
    壳 = '<html><head><title>Sina Visitor System</title></head><body><p>正在验证</p></body></html>'
    网页假 = _假网页客户端(壳)

    async def 返空(_url):
        return None

    monkeypatch.setattr(scraper, "_fetch_weibo", 返空)
    monkeypatch.setattr(scraper, "_validate_url", lambda u: u)
    monkeypatch.setattr(scraper.httpx, "AsyncClient", 网页假)
    got = asyncio.run(scraper._fetch_and_parse("https://weibo.com/u/1649679354"))
    assert 网页假.打过, "微博那一支回 None 之后整条网页路被跳过了——今天那条路还在，不许撤"
    assert got["title"] == "Sina Visitor System", got["title"]
    assert got["status_code"] == 200
