r"""搜狐与少数派这两族取图（10-31 他一句「把少数派和搜狐加进这一版」）。

两份现网出口读数（三通道尺子 `docs/工具/测-微博那一型别的族还有吗.py` 与
`docs/工具/测-搜狐与少数派取图.py`，全部真链接从各家自己的首页／RSS 现抽）：

· **搜狐**：`www.sohu.com/a/…` 与 `m.sohu.com/a/…` 两型，`<img>` 身上只有 `img_width`／`img_height`
  与一枚**不是地址**的 `data-src`（108 字符、base64 解出来 80 B 密文，要搜狐自己的 JS 才解得开）。
  以前拿它当地址补成绝对址，逐条打过去回的是 `text/html` ⇒ 屏上念「2 张图没能存下来」。
  真地址在页面内联脚本里：www 那型的键叫 `imgsList`、m 那型叫 `imageList`，现读三篇文章
  名单张数与容器里 `<img>` 张数**逐篇对上**（2/2、4/4、3/3，另一篇两格都 0）。
· **图床那一层**：同一批九张逐张真下——带生产那套下载头 **6 张 403／3 张 200**，
  把 UA 换成 Mac 桌面那枚（或一枚头都不带）**九张全 200**；**带 Referer（本站、整篇地址）救不回来**。
  ⇒ 这一族点名要换的是 UA，不是来路。
· **少数派**：`sspai.com/post/…` 文字与 10 条图地址都取得到，卡的是下载——
  `cdnfile.sspai.com` 连打三条不带来源**全 403**、带 `https://sspai.com/` **三条全 200**
  （带微博那枚也 200 ⇒ 与微博那族方向相反，这一族只要"带"、不看来路是谁家的）。

⚠ 下面这些用例**全部离线**：不碰网络、不碰库。桩的形状照现读的页面来，不是凭印象编的。
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import note_images, scraper

密文1 = "EPTTjIc7stRUWFVloIo6UcmJ5ULT+qz1crB9Zo+mUNO5wFIXUZtHA94H293T+rBKumXHvJf3w7EvugsXzAWnOIKoVGfYlGGGE64mUUCj2DU="
密文2 = "UobGwTkesb1n2VhXTZAdSMmJ5ULT+qz1crB9Zo+mUNOVGLts125jzQvKqo5J6LCxZkcJiZOCUERag5OToHND3rumYCh5eEZngnkCrhM2VDE="
真址1 = "https://q9.itc.cn/q_70/images03/20261031/5d5b88d69c9e4237b39501e015bfc305.jpeg"
真址2 = "https://q8.itc.cn/q_70/images03/20261031/42287244a08644d1b7d0036c808ffe46.jpeg"


def _名单段(键: str = "imgsList", 项: tuple = (真址1, 真址2)) -> str:
    """照现读的那一段 JS 抄形状：键名不带引号、每项带 url／width／height、项与项之间那个逗号在括号外。"""
    条目 = "\n                , ".join(
        '{{\n                    "url": "{0}",\n                    "width": "1080",\n                    "height": "720",\n                }}'.format(u)
        for u in 项)
    return f"{键}: [\n                {条目}\n            ],"


def _搜狐页(名单: str = None) -> str:
    """照 10-31 现读的两型形状搭一页：容器里两张 img 挂密文，名单在页面脚本里。"""
    段 = _名单段() if 名单 is None else 名单
    两图 = (f'<img img_width="1080" img_height="720" data-src="{密文1}" />'
            f'<img img_width="1080" img_height="332" data-src="{密文2}" />')
    return (f'<html><head><title>马斯克，“接管”军队</title></head><body>'
            f'<article id="mp-editor" class="article"><p>{"正文" * 40}{两图}</p></article>'
            f'<script>cover: "https://q9.itc.cn/封面.jpeg", integralLevel: "7", {段}</script></body></html>')


class _响应:
    """`_fetch_and_parse` 只用得到的那一小截接口（非跳转、200、能流式读出整页）。"""

    def __init__(self, html: str, code: int = 200):
        self._html, self.status_code = html, code
        self.is_redirect = False
        self.headers = {"content-type": "text/html; charset=utf-8"}

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    @property
    def encoding(self):
        return "utf-8"

    async def aiter_bytes(self, chunk_size=8192):
        yield self._html.encode("utf-8")


class _假客户端:
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
        return _响应(self._html)


def _抓(页: str, 址: str, monkeypatch) -> dict:
    monkeypatch.setattr(scraper, "_validate_url", lambda u: u)
    monkeypatch.setattr(scraper.httpx, "AsyncClient", _假客户端(页))
    return asyncio.run(scraper._fetch_and_parse(址))


# ---------------- 一、搜狐：地址在页面自己那份名单里，DOM 那枚 data-src 是密文 ----------------

def test_www那型取到名单里两条真址_按页面给的顺序():
    assert scraper._sohu_images(_搜狐页()) == [真址1, 真址2]


def test_m那型键叫imageList也认():
    assert scraper._sohu_images(_搜狐页(_名单段("imageList"))) == [真址1, 真址2]


def test_那一串密文不许当图地址():
    """改之前就坏在这里：`_content_images` 把密文按相对址补成 `https://www.sohu.com/a/EPTT…`，
    下游逐条打过去回的是 text/html，屏上念「2 张图没能存下来」——真文章的图压根没进名单。"""
    址 = scraper._sohu_images(_搜狐页())
    assert all(u.startswith("https://q") and "itc.cn" in u for u in 址), 址
    assert not any(密文1[:24] in u or 密文2[:24] in u for u in 址), 址
    今天 = scraper._parse_general_url(_搜狐页(), "https://www.sohu.com/a/1095436048_220095",
                                      "web_article")
    assert any(密文1[:24] in u for u in 今天["images"]), "通用那一路本身要还是拿密文当地址，这一刀才有得切"


def test_两个键都不在时回None_不是空列表():
    """回空列表＝"这一篇没图"；回 None＝"这一族的形状我不认识了"。
    调用方只看后者才退回通用那一路——把这两件混成一件，站点一改版就会静默变成"所有搜狐文章没图"。"""
    页 = _搜狐页('otherKey: [ { "url": "https://x.test/a.jpg" } ],')
    assert scraper._sohu_images(页) is None


def test_键在而名单空是这一族真的没图():
    assert scraper._sohu_images(_搜狐页("imgsList: [],")) == []


def test_名单只取到本段方括号里_不把后面别的键的址捞进来():
    页 = _搜狐页('''
        imgsList: [ { "url": "%s" } ],
        推荐位: [ { "url": "https://g1.itc.cn/should-not-be-taken.png" } ],
    ''' % 真址1)
    assert scraper._sohu_images(页) == [真址1]


def test_认得出的主机名只有量过的那两型():
    """`k.sohu.com`／`news.sohu.com` 这一轮没读数，不许顺手扩进来——扩进来就是把没量过的形状当已知。"""
    assert scraper._is_sohu("https://www.sohu.com/a/1_c")
    assert scraper._is_sohu("https://m.sohu.com/a/1_c")
    assert not scraper._is_sohu("https://k.sohu.com/n/1")
    assert not scraper._is_sohu("https://news.sohu.com/")
    assert not scraper._is_sohu("https://notsohu.com/a/1")
    assert not scraper._is_sohu("https://sohu.com.tw/a/1")


# ---------------- 二、少数派：地址取得到，卡的是下载要带来源 ----------------

def test_sspai那族点名要带自己的来路():
    assert scraper._named_image_referer("https://sspai.com/post/117960") == "https://sspai.com/"
    assert scraper._named_image_referer("https://sspai.com/feed") == "https://sspai.com/"


def test_后缀匹配必须带点边界():
    """`notsspai.com` 与 `sspai.com.evil.cn` 都不是这一族——后者尤其要防：它的后缀看着像 sspai.com，
    实际是别人名下的域。认错了就是把我们自己的来路发给一个陌生站。"""
    assert scraper._named_image_referer("https://notsspai.com/post/1") == ""
    assert scraper._named_image_referer("https://sspai.com.evil.cn/post/1") == ""
    assert scraper._named_image_referer("https://www.sspai.com/post/1") == "https://sspai.com/"


def test_其余各族这两格都是空():
    """`_parse_general_url` 与 `_parse_wechat_article` 的回体里都不该有 `image_referer`／
    `image_user_agent`——下游一律按 `.get(...) or ""` 读，空串＝今天那一批的形状一字不改。"""
    通用 = scraper._parse_general_url("<html><body><div class='article-body'><p>字</p></div></body></html>",
                                      "https://blog.example.com/a", "web_article")
    公众号 = scraper._parse_wechat_article("<div id='js_content'><p>字</p></div>",
                                           "https://mp.weixin.qq.com/s/x", "wechat_article")
    for 回体 in (通用, 公众号):
        assert 回体.get("image_referer", "") == ""
        assert 回体.get("image_user_agent", "") == ""


def test_点名那枚UA必须真的不是生产那枚():
    """这条防的是"落了一行其实什么都没换"的假修：换的必须是另一枚值。"""
    assert scraper._SOHU_IMAGE_UA
    assert scraper._SOHU_IMAGE_UA != note_images.IMAGE_HEADERS["User-Agent"]


# ---------------- 三、接线：抓取那一层给的两格，要真出现在回体里 ----------------

def test_抓搜狐页_名单换成址且点名换UA(monkeypatch):
    回 = _抓(_搜狐页(), "https://www.sohu.com/a/1095436048_220095", monkeypatch)
    assert 回["images"] == [真址1, 真址2], 回["images"]
    assert 回["image_user_agent"] == scraper._SOHU_IMAGE_UA
    assert 回.get("image_referer", "") == "", "这一族带来路救不回来（现读），不许顺手挂一枚"


def test_抓移动版搜狐页同样认(monkeypatch):
    回 = _抓(_搜狐页(_名单段("imageList")), "https://m.sohu.com/a/1095436048_220095", monkeypatch)
    assert 回["images"] == [真址1, 真址2]
    assert 回["image_user_agent"] == scraper._SOHU_IMAGE_UA


def test_搜狐改了键名就退回今天那一路(monkeypatch):
    """不许比今天更差：认不出名单时（键改名／结构变了）images 仍旧是通用那一路取回的那一堆，
    且**不许**留下点名的 UA——不然就是"址按旧形状、头按新形状"那种半刀。"""
    页 = _搜狐页('别的键: [ { "url": "%s" } ],' % 真址1)
    回 = _抓(页, "https://www.sohu.com/a/1_c", monkeypatch)
    assert "image_user_agent" not in 回, 回.keys()
    assert 回["images"], "退回通用那一路之后至少要跟今天一样有东西（今天是那两条密文址）"


def test_抓sspai页_点名带来路(monkeypatch):
    页 = ("<html><head><title>少数派</title></head><body>"
          "<div class='post-content'><p>正文</p>"
          "<img src='https://cdnfile.sspai.com/2026-10-31/a.jpg'/></div></body></html>")
    回 = _抓(页, "https://sspai.com/post/117960", monkeypatch)
    assert 回["images"] == ["https://cdnfile.sspai.com/2026-10-31/a.jpg"], 回["images"]
    assert 回["image_referer"] == "https://sspai.com/"
    assert 回.get("image_user_agent", "") == "", "这一族要的是来路不是 UA，两枚不许混用"


def test_抓普通网页两格都不给(monkeypatch):
    页 = ("<html><body><div class='article-body'><p>字</p>"
          "<img src='https://cms-bucket.ws.126.net/a.png'/></div></body></html>")
    回 = _抓(页, "https://c.m.163.com/news/a/LAD6.html", monkeypatch)
    assert 回.get("image_referer", "") == "" and 回.get("image_user_agent", "") == ""
