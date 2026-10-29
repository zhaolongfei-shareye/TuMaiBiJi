"""给"主流站点图文支持"那一趟全量测试找**真链接**——一条都不许编。

每个站给一枚自家列表页／频道页／RSS／官方接口作种子，从中抽出这一族的第一条文章地址；
抽不到就记 `no-sample`（这一格空着比编一条强）。境外那一半走本机代理那条腿，
境内走直连——两条腿的可用与否本身就是要记的读数。

⚠ 种子页那一发的状态码不是噪声：搜狐／人人都是产品经理／路透／纽约时报／Stack Overflow
在**列表页那一层**就把脚本挡在外面（403／401），这一发读数跟着进表。
⚠ 首页是 JS 壳的那一批（腾讯新闻／央视／新华／掘金／36氪／虎嗅／京东／YouTube）
改成先反斜杠 u 那一层还原再抽，或直接换频道页／RSS 当种子——首页那一发抽不到不等于站点不支持。

跑法：
    backend/.venv/bin/python docs/工具/找-主流站点真链接.py > /tmp/sites75.jsonl
"""
import json
import re
import sys
from urllib.parse import urljoin

import httpx

PROXY = "http://127.0.0.1:7897"
UA = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# (键, 站名, 境内?, 种子, 抽文章址的式子, 库里已有的真链接)
SEEDS = [
    ("sina", "新浪新闻", 1, "https://news.sina.com.cn/", r"https?://news\.sina\.com\.cn/\w+/202\d-\d\d-\d\d/[\w-]+\.shtml", ""),
    ("sohu", "搜狐", 1, "https://news.sohu.com/", r"(?:https:)?//(?:www|news|m)\.sohu\.com/a/\d{6,12}_\d{4,10}", ""),
    ("qqnews", "腾讯新闻", 1, "https://news.qq.com/ch/view/", r"(?:https://news\.qq\.com|https://view\.inews\.qq\.com)/rain/a/\d{8}A[\w]{6,10}", ""),
    ("toutiao", "今日头条", 1, "https://www.toutiao.com/ch/news_world/", r"https?://www\.toutiao\.com/(?:a\d{16,20}|article/\d{16,20}/)", ""),
    ("thepaper", "澎湃新闻", 1, "https://www.thepaper.cn/", r"(?:https://www\.thepaper\.cn)?/?newsDetail_forward_\d+", ""),
    ("cctv", "央视网", 1, "https://news.cctv.com/mobile/", r"https://news\.cctv\.com/\d{4}-\d{2}-\d{2}/[A-Z0-9]+\.shtml", ""),
    ("zhihu", "知乎", 1, "https://www.zhihu.com/", r"https?://(?:www\.zhihu\.com/question/\d+/answer/\d+|zhuanlan\.zhihu\.com/p/\d+)", ""),
    ("bilibili", "哔哩哔哩", 1, "https://www.bilibili.com/", r"https?://www\.bilibili\.com/video/BV[\w]+", ""),
    ("juejin", "掘金", 1, "https://juejin.cn/frontend", r"(?:https://juejin\.cn)?/post/\d{15,20}", ""),
    ("csdn", "CSDN", 1, "https://blog.csdn.net/nav/web", r"https?://blog\.csdn\.net/[\w-]+/article/details/\d+", ""),
    ("cnblogs", "博客园", 1, "https://www.cnblogs.com/", r"https?://www\.cnblogs\.com/[\w.-]+/p/\d{5,}", ""),
    ("tencentdev", "腾讯云开发者社区", 1, "https://cloud.tencent.com/developer", r"https://cloud\.tencent\.com/developer/article/\d+", ""),
    ("woshipm", "人人都是产品经理", 1, "https://www.woshipm.com/popular", r"https?://www\.woshipm\.com/\w+/\d{6,}\.html", ""),
    ("sspai", "少数派", 1, "https://sspai.com/feed", r"<link>(https?://sspai\.com/post/\d+)</link>", ""),
    ("kr36", "36氪", 1, "https://36kr.com/feed", r"<link>(https?://36kr\.com/p/\d{6,})</link>", ""),
    ("huxiu", "虎嗅", 1, "https://www.huxiu.com/article/", r"(?:https://www\.huxiu\.com)?/article/\d+\.html", ""),
    ("douban", "豆瓣电影", 1, "https://movie.douban.com/", r"https?://movie\.douban\.com/subject/\d+/?", ""),
    ("jd", "京东商品页", 1, "https://www.jd.com/allSort.aspx", r"//item\.jd\.com/\d{6,}\.html", ""),
    ("xinhua", "新华网", 1, "http://www.news.cn/politics/", r"(?:https?:)?//www\.news\.cn/[\w/]+/\d{8}/[a-f0-9]{20,}/c\.html", ""),
    ("ifeng", "凤凰网", 1, "https://news.ifeng.com/", r"https://news\.ifeng\.com/c/[\w_]+", ""),

    ("medium", "Medium", 0, "https://blog.medium.com/feed", r"<link>(https://medium\.com/[\w@./-]+)</link>", ""),
    ("youtube", "YouTube", 0, "https://www.youtube.com/feed/trending", r"https://www\.youtube\.com/watch\?v=[\w-]{11}", ""),
    ("reddit", "Reddit", 0, "https://old.reddit.com/r/programming/", r'href="/r/[\w]+/comments/[\w]+/[\w_-]+/"', ""),
    ("wiki", "维基百科（中文）", 0, "https://zh.wikipedia.org/wiki/Special:Random", r"(https://zh\.wikipedia\.org/wiki/[^\"<> ]+)", ""),
    ("github", "GitHub", 0, "", "", "https://github.com/torvalds/linux"),
    ("stackoverflow", "Stack Overflow", 0, "https://api.stackexchange.com/2.3/questions?site=stackoverflow&pagesize=5&order=desc&sort=votes", r'"link":"(https://stackoverflow\.com/questions/\d+/[\w-]+)"', ""),
    ("hackernews", "Hacker News", 0, "https://news.ycombinator.com/", r'href="(item\?id=\d+)"', ""),
    ("bbc", "BBC 中文", 0, "https://www.bbc.com/zhongwen/simp", r"(?:https://www\.bbc\.com)?/zhongwen/(?:simp|traditional|articles)/[\w-]+", ""),
    ("guardian", "The Guardian", 0, "https://www.theguardian.com/international", r"(?:https://www\.theguardian\.com)?/[\w-]+/2026/\w+/\d{2}/[\w-]+", ""),
    ("nytimes", "纽约时报", 0, "https://www.nytimes.com/svc/sitemap/pages/1/2026-10-28/index.xml", r"<loc>(https://www\.nytimes\.com/2026/\d\d/\d\d/[\w/-]+\.html)</loc>", ""),
    ("reuters", "路透", 0, "https://www.reuters.com/sitemap/", r"https://www\.reuters\.com/[\w-]+/[\w-]+-\d{4}-\d\d-\d\d/", ""),
    ("arxiv", "arXiv", 0, "https://arxiv.org/list/cs.AI/recent", r"/abs/\d{4}\.\d{4,5}", ""),
    ("x", "X（推特）", 0, "https://x.com/", r"https://x\.com/[\w]{1,15}/status/\d+", ""),
    ("instagram", "Instagram", 0, "https://www.instagram.com/", r"https://www\.instagram\.com/(?:p|re)/[\w-]+/?", ""),
    ("facebook", "Facebook", 0, "https://www.facebook.com/", r"https://www\.facebook\.com/[\w.]+/posts/[\w-]+", ""),

    # 这几条库里已有站长给过的真链接，不必再找种子（出处见 枚举-URL转存全部情况 表一）
    ("wechat_text", "公众号·图文型", 1, "", "", "https://mp.weixin.qq.com/s/H2BANSW_U-Jjl1Ic_ZuZKA"),
    ("wechat_album", "公众号·相册型", 1, "", "", "https://mp.weixin.qq.com/s/1FOoWv45lty7r7MZ88V9aQ"),
    ("netease", "网易·文章页", 1, "", "", "https://c.m.163.com/news/a/LAD6VGQO00097U7T.html"),
    ("xhs_short", "小红书·短链", 1, "", "", "https://xhslink.cn/o/9F1fAXNBL1I"),
    ("weibo_pc", "微博·正文页", 1, "", "", "https://weibo.com/1649679354/5353881820204840"),
    ("weibo_m", "微博·移动页", 1, "", "", "https://m.weibo.cn/status/5353881820204840"),
]


def _get(url: str, proxy: bool) -> tuple[int, str, int, str]:
    """种子页自己先取一发——这一发同时是"这个站在这条腿上通不通"的读数。

    回体里带**跟完跳转后的末址**：维基百科 `Special:Random` 那一发真正的条目号只在末址上。
    """
    kwargs = {"timeout": 25, "headers": UA, "follow_redirects": True}
    if proxy:
        kwargs["proxy"] = PROXY
    try:
        r = httpx.get(url, **kwargs)
        return r.status_code, r.text, len(r.content), str(r.url)
    except Exception:
        return 0, "", 0, ""


def _unescape(html: str) -> str:
    """JSON 里用反斜杠 u 写法藏起来的斜杠／问号／等号还原——YouTube 那类页面的链接全藏在这层里。"""
    return re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), html).replace("\\/", "/")


def _pick(seed: str, html: str, pat: str) -> str:
    """挑第一条**看着像文章**的地址：绝对／协议相对／站内相对／不带斜杠的相对四种写法都认。

    式子带捕获组就取组、不带就取整段（第一版踩过这个坑：不带组的式子 `group(1)` 当场抛）。
    """
    for m in re.finditer(pat, _unescape(html)):
        raw = (m.group(1) if m.groups() else m.group(0)).replace("&amp;", "&")
        if raw.startswith("//"):
            raw = "https:" + raw
        elif not raw.startswith("http"):
            raw = urljoin(seed if seed.endswith("/") else seed + "/", raw)
        if not raw.startswith("https://"):
            continue
        if raw.rstrip("/") == seed.rstrip("/"):
            continue
        if "wikipedia.org/wiki/Main_Page" in raw:
            continue
        return raw
    return ""


def main() -> int:
    for key, label, domestic, seed, pat, fixed in SEEDS:
        if fixed:
            print(json.dumps({"key": key, "label": label, "domestic": bool(domestic),
                              "url": fixed, "via": "库里已有的真链接／已知公开页", "seed_code": 0,
                              "seed_bytes": 0, "note": ""}, ensure_ascii=False))
            continue
        proxy = not domestic
        code, html, size, final = _get(seed, proxy)
        url = _pick(seed, html, pat) if html else ""
        if key == "youtube" and not url and html:
            # YouTube 那一页不给成型的链接，只给 `"videoId":"…"`——拼出来的就是真条目
            m = re.search(r'"videoId":"([\w-]{11})"', _unescape(html))
            if m:
                url = "https://www.youtube.com/watch?v=" + m.group(1)
        if key == "wiki" and not url and final:
            # 维基那一发靠 `Special:Random` 跟到的末址，条目号只在末址上
            url = final if "/wiki/" in final and "Special:Random" not in final else ""
        print(json.dumps({"key": key, "label": label, "domestic": bool(domestic),
                          "url": url, "via": seed, "seed_code": code, "seed_bytes": size,
                          "note": "" if url else ("种子页没抽出文章址" if code else "种子页取不到")},
                         ensure_ascii=False))
        sys.stderr.write(f"{key}\t{code}\t{size}\t{url}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
