r"""公众号正文里那两层转义：`\x0a`／`\x26` 与话题链接的转义标签，屏上念出来全是无效字。

站长 10-22 截图指的那一篇（note 169，`source_type=wechat_article`）落库的 `original_content`
现读 1,615 字里有 **16 处 `\x0a`、70 处 `\x26`**，其中一段是
`\x26lt;a class=\x26quot;wx_topic_link\x26quot; topic-id=\x26quot;…\x26quot;…\x26gt;#周润发\x26lt;/a\x26gt;`。
根因不在我们解析错了：微信这一族的正文本来就是**塞在 JS 字符串里**发出来的，换行写成 `\x0a`、
`&` 写成 `\x26`，而「话题」是**转义过**的 `<a>` 标签（现网抓回来的原始 HTML 里同形，实测 96／374 处）。
我们的抓取只做了"取 DOM 文字"那一层，没解这一层，于是照抄进笔记。

⇒ 两道都要拆：先解 `\xHH`（不先解，话题那串连模式都匹配不上），再把话题标签压回它显示的那几个字。
**不做整段 `html.unescape`**——那会把讲代码的文章里举例用的 `&lt;div&gt;` 一起当标签吃掉。

用例一律不出网。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import scraper

# 逐字抄自现网 note 169 那一段（去掉中间的属性值不影响这两层转义的形状）
REAL_SNIPPET = (
    "不知道大家怎么看？欢迎评论区聊聊你的想法。\\x0a"
    "\\x26lt;a class=\\x26quot;wx_topic_link\\x26quot; topic-id=\\x26quot;mvj2e3hg-ouvytj\\x26quot; "
    "style=\\x26quot;color: var(--weui-LINK) !important;\\x26quot; data-topic=\\x26quot;1\\x26quot; "
    "data-recommend=\\x26quot;0\\x26quot;\\x26gt;#周润发\\x26lt;/a\\x26gt;"
    "\\x26lt;a class=\\x26quot;wx_topic_link\\x26quot; topic-id=\\x26quot;mvj2e6tq-tslrit\\x26quot; "
    "style=\\x26quot;color: var(--weui-LINK) !important;\\x26quot; data-topic=\\x26quot;1\\x26quot; "
    "data-recommend=\\x26quot;0\\x26quot;\\x26gt;#港星\\x26lt;/a\\x26gt;"
)


def test_解掉_js_字符串那层_xhh():
    out = scraper._decode_wechat_text("第一段\\x0a\\x0a第二段\\x0a\\x26amp;")
    assert "\\x0a" not in out and "\\x26" not in out
    assert out == "第一段\n\n第二段\n&amp;"


def test_话题标签压回它显示的那几个字():
    out = scraper._decode_wechat_text(REAL_SNIPPET)
    assert "wx_topic_link" not in out and "topic-id" not in out
    assert "&lt;" not in out and "&quot;" not in out
    assert "#周润发" in out and "#港星" in out
    assert "\\x" not in out


def test_整篇现文形状的量级():
    """那一篇 1,615 字里 16 处 `\\x0a`＋70 处 `\\x26`——清完必须一个不剩，
    而不是"看着少了"。这里拿一段真文（含正文与话题串）验同一件事。"""
    body = "最近偶然刷到一张九十年代香港大排档的老照片，盯着看了好久！\\x0a\\x0a照片里能看到发哥。" + REAL_SNIPPET
    out = scraper._decode_wechat_text(body)
    assert out.count("\\x") == 0
    assert out.count("\n") >= 3
    assert "最近偶然刷到" in out and "照片里能看到发哥" in out


def test_不吃举例用的转义标签():
    """讲代码的文章正文里有 `&lt;div&gt;` 这种举例的字——不是话题链接，一个字都不许动。"""
    src = "写法是 \\x26lt;div\\x26gt; 这样\\x26lt;/div\\x26gt;"
    out = scraper._decode_wechat_text(src)
    assert out == "写法是 &lt;div&gt; 这样&lt;/div&gt;"


def test_抓取入口那一条链也走同一份清洗():
    """上面几条量的是清洗函数本身；这一条钉的是"公众号这一族真的会经过它"——
    哪天有人把 `_parse_wechat_article` 里那一处调用挪走，这条就红。"""
    html = (
        '<html><body><h1 class="rich_media_title">标题</h1>'
        '<div class="rich_media_content" id="js_content">'
        '<p>正文一段\\x0a\\x0a还有一段</p>'
        f"<p>{REAL_SNIPPET}</p>"
        "</div></body></html>"
    )
    parsed = scraper._parse_wechat_article(html, "https://mp.weixin.qq.com/s/xxxx", "wechat_article")
    text = parsed["content"]
    assert "\\x" not in text and "wx_topic_link" not in text
    assert "正文一段\n\n还有一段" in text
    assert "#周润发" in text
