"""通用（非公众号／非小红书）那一档的正文配图——10-29 站长那句「文章中的图片也要支持提取」。

他给的样本是网易那篇：`https://c.m.163.com/news/a/LAD6VGQO00097U7T.html`，
「含有图片，但我只看到提取文字」。现读定性（`/tmp/netease.html`，115,312 B，HTTP 200）：
· 标题与正文都取得到——`_parse_general_url` 回 4,541 字；
· 回体里**连 `images` 这一键都没有** ⇒ 屏上自然一张图也不会有（不是下载失败，是这条路压根没去抓）；
· 那 8 张正文图**全在 `data-echo`**，而 8 张的 `src` 清一色是
  `https://static.ws.126.net/163/frontend/images/2022/empty.png` 那枚占位（真尺寸在 `data-width`／`data-height`）；
· 站点 logo／作者头像／分享图标在正文容器**外面**，它们没有懒加载属性、只有 `src`。

改完的现读（同一份 HTML 离线跑）：`div.article-body` 选为正文容器，取到 **8 张**，
逐张真下＝HTTP 200、`image/png`、64,986～426,203 B，不带 Referer 也下得动；占位与装饰零混入；
整趟 `_parse_general_url` 耗时 98 ms（候选按提示词限量，不整棵树扫）。

⚠ 下面这些用例是**离线**的：不碰网络、不碰库，也不碰现网那三行 `IMAGE_STORE_CF_*`。
「存进桶」那一段的判据在 `test_note_images.py`（占位图拦／九张上限／failed 与 kept 的分账），
这一只只管"抓出来的那一串地址对不对"。
"""
import pytest
from bs4 import BeautifulSoup

from app.services import scraper

NETEASE_URL = "https://c.m.163.com/news/a/LAD6VGQO00097U7T.html"
PLACEHOLDER = "https://static.ws.126.net/163/frontend/images/2022/empty.png"


def _netease_like_html(n: int = 3) -> str:
    """网易那一型的缩样：正文图在 `data-echo`、`src` 是占位，装饰图在正文容器外且只有 `src`。"""
    body = "".join(
        f'<figure class="js-lazy"><img class="js-preview-img" src="{PLACEHOLDER}" '
        f'data-echo="http://cms-bucket.ws.126.net/2026/1029/shot{i}c000yu00gpc.png" '
        f'data-width="1254" data-height="601"><figcaption>图{i}</figcaption></figure>'
        for i in range(1, n + 1)
    )
    words = "".join(f"第{i}段正文内容，讲谷歌Gemini重夺AI第一的这些那写满够多的字。" for i in range(30))
    return f"""<html><head><title>谷歌Gemini，重夺AI第一</title></head><body>
      <div class="article js-delegate view">
        <img src="https://static.ws.126.net/163/frontend/images/logo-netease.png" style="position:absolute;left:-1000px">
        <img src="//nimg.ws.126.net/?url=http%3A%2F%2Fdingyue.ws.126.net%2Favatar.png&amp;thumbnail=90x90" class="s-avatar">
        <section class="article-box show-all">
          <div class="article-body">{words}{body}<img></div>
        </section>
      </div>
    </body></html>"""


def _urls(html: str, url: str = NETEASE_URL):
    return scraper._parse_general_url(html, url, "web_article")["images"]


def test_通用那一档的回体里有配图这一键_这一刀的全部意义就在这():
    """改之前这里是 `{"title","content","source_type"}` 三键——下游 `scraped.get("images")` 拿到 None，
    于是"取不到图"与"这条路没去取图"在屏上是同一个样子（一句图也没提）。"""
    assert "images" in scraper._parse_general_url("<html><body><p>只有字</p></body></html>", NETEASE_URL, "web_article")


def test_懒加载在data_echo里的正文图取得到_而且不许取那枚占位():
    got = _urls(_netease_like_html(3))
    assert len(got) == 3, got
    assert all("cms-bucket" in u for u in got), got
    assert not any("empty.png" in u for u in got), "占位图混进来了——懒加载属性没排在 src 前面"


def test_反向_把data_echo从名单里摘掉就该退回只取到占位():
    """上一条不是恒真：`data-echo` 这一位确实是它自己挣来的。摘掉之后 `src` 兜底会取到 empty.png，
    条数还是三、内容全错——正好是改之前那一版的行为。"""
    keep = scraper._LAZY_ATTRS
    try:
        scraper._LAZY_ATTRS = ("data-src", "src")
        got = _urls(_netease_like_html(3))
    finally:
        scraper._LAZY_ATTRS = keep
    assert got and all("empty.png" in u for u in got), got


def test_公众号那一族的data_src优先级没被这次改乱():
    html = ('<div class="article"><p>' + "字" * 200 + "</p>"
            '<img data-src="https://mmbiz.qpic.cn/mmbiz_jpg/aaa.jpg" src="https://mmec.u1.qq.com/placeholder.gif">'
            "</div>")
    got = _urls(html, "https://mp.weixin.qq.com/s/abc")
    assert got == ["https://mmbiz.qpic.cn/mmbiz_jpg/aaa.jpg"], got


def test_只有src的普通页面照样取到_兜底那一位不许撤():
    """掘金／博客园／个人博客那一族没有懒加载属性，改完仍然要取得到（`_LAZY_ATTRS` 末位是 `src`）。"""
    html = '<div class="post_body"><p>' + "正文" * 120 + '</p><img src="/images/pic.png"><img src="https://x.io/a.jpg"></div>'
    got = _urls(html, "https://blog.example.com/post/1")
    assert got == ["https://blog.example.com/images/pic.png", "https://x.io/a.jpg"], got


def test_正文容器取的是最深那一层_容器外的logo与头像一张都不进():
    got = _urls(_netease_like_html(3))
    assert not any("logo-netease" in u or "s-avatar" in u or "avatar" in u for u in got), got


def test_反向_只按字数最多挑容器就会把外面那三张装饰捞进来():
    """上一条靠"最深且字数够"那一步取胜。把正文容器直接换成外层 `div.article`，
    同一把 `_content_images` 就会把 logo 与头像一起取回来——证明钉的是那一步，不是运气。"""
    outer = BeautifulSoup(_netease_like_html(3), "html.parser").select_one("div.article")
    got = scraper._content_images(outer, NETEASE_URL)
    assert any("logo-netease" in u for u in got) and any("avatar" in u for u in got), got


def test_认不出正文容器时回空列表而不是猜一张():
    got = _urls("<html><body><p>整页没有 article／main／content 那类名字</p></body></html>")
    assert got == [], got


def test_张数由下游那道上限管_这里不另立一个数():
    """抓到 12 张也照单回 12 条：`MAX_ASSETS_PER_NOTE` 那一道闸在 `note_images.archive`（九张上限、
    其余算 skipped），判据在 `test_note_images.py::test_十二张只发九次下载只登记九行`。
    这一条钉的是"抽取这一层不许自作主张砍头"。"""
    html = '<div class="article-body"><p>' + "字" * 300 + "</p>" + "".join(
        f'<img data-echo="https://cdn.example.com/{i}.png">' for i in range(12)
    ) + "</div>"
    got = _urls(html, "https://example.com/a")
    assert len(got) == 12, len(got)


def test_同一张图在两个属性上各写一次时只留一条():
    html = ('<div class="article-body"><p>' + "字" * 200 + "</p>"
            '<img data-src="https://cdn.example.com/same.png" src="https://cdn.example.com/same.png">'
            "</div>")
    assert _urls(html, "https://example.com/a") == ["https://cdn.example.com/same.png"]
