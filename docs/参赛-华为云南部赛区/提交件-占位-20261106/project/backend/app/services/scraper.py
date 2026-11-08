import ipaddress
import json
import logging
import re
import socket
from urllib.parse import urljoin, urlparse

import httpx
import trafilatura
from bs4 import BeautifulSoup

from app.core.errors import UserError

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

MAX_RESPONSE_SIZE = 5 * 1024 * 1024
ALLOWED_SCHEMES = {"https", "http"}
# ipaddress 的 is_private 已经把 RFC1918、回环、链路本地、各类文档/保留段（192.0.2.0/24、
# 198.18.0.0/15、198.51.100.0/24、203.0.113.0/24、240.0.0.0/4 及其 IPv6 对位）都算进去了，
# 但按 IANA 的定义 CGNAT 属于"共享地址空间"而不是"私有"，Python 会放行——云厂商的内网服务
# 常落在这段，所以单独列出来。
EXTRA_BLOCKED_NETWORKS = [
    ipaddress.ip_network("100.64.0.0/10"),  # CGNAT / 云内网常用
]

# 兜底文案：httpx 的异常文本是英文且带完整 URL，直接 str(e) 会进用户 toast（只两行，约 30 汉字）
GENERIC_FETCH_ERROR = "读取网页失败，请稍后重试或改用截图"


class SiteHttpError(UserError):
    """站点回了 4xx／5xx。文案与 `_status_hint` 一字不差，只多带一个 `status_code`。

    为什么要多这一枚类型（规格-来源黑名单 §三①）：黑名单要数"站点级确定性失败"，
    而"这个站回了 403"和"我们连不上／提炼坏了／页面太大"在用户那边是同一句话（都是中文、
    都进 toast），只有类型能把它们分开。**继承 UserError 而不是另起一支**：
    `scrape_url` 那句 `except UserError: raise` 与 `failure_message()` 判的都是 UserError，
    换成新分支就等于给这一型改口的同时把用户那句话也换了（判据 9 不许动那两句）。
    """

    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code


# 闸门拒一个链接时**只有这一句**话。为什么"解析不出来"与"解析到内网"不许分开说（审计 #11）：
# 分开就等于把这道闸门做成一台内网判分机——提交者拿"哪个域名回哪一句"就能扫出内网有哪些
# 主机名解析得动、落在哪个网段，一次请求都不用真发出去。真原因进日志，那一行的读者是操作者。
BLOCKED_URL_HINT = "这个链接我们打不开，换一个试试"


def _is_private_ip(ip_str: str) -> bool:
    """判定一个 IP 是否属于"不该让抓取器去连"的范围。解析不了一律当危险处理。

    不再手写网段清单：原先那份漏了 IPv6 未指定地址 `::`（Linux 上连它等于连本机）、
    组播、以及 CGNAT，实测 `http://[::]:6379/` 能直接过闸门打到本机 Redis。改用
    ipaddress 自带的语义判定，它跟着 IANA 特殊用途地址表走，新出的保留段自动覆盖。
    """
    try:
        addr = ipaddress.ip_address(ip_str)
        # Normalize IPv4-mapped IPv6 addresses
        if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
            addr = addr.ipv4_mapped
    except ValueError:
        return True
    if (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    ):
        return True
    return any(addr in net for net in EXTRA_BLOCKED_NETWORKS)


def _validate_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        allowed = "/".join(s.upper() for s in sorted(ALLOWED_SCHEMES))
        raise UserError(f"不支持的协议: {parsed.scheme}，仅允许 {allowed}")
    hostname = parsed.hostname
    if not hostname:
        raise UserError("链接里没有网址，请检查后重试")
    try:
        resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror:
        logger.warning("链接闸门：域名解析失败 host=%s", hostname)
        raise UserError(BLOCKED_URL_HINT)
    for family, _, _, _, sockaddr in resolved:
        ip = sockaddr[0]
        if _is_private_ip(ip):
            logger.warning("链接闸门：解析到内网地址已拦截 host=%s ip=%s", hostname, ip)
            raise UserError(BLOCKED_URL_HINT)
    return url


async def scrape_url(url: str) -> dict:
    """抓取并解析网页。

    只有 UserError 的文案会走到用户面前（任务失败时前端直接把 error 塞进 toast）；
    其余异常原文进日志，用户只看到一句通用中文。
    """
    try:
        return await _fetch_and_parse(url)
    except UserError:
        raise
    except Exception as exc:
        logger.warning("抓取失败 url=%s：%s: %s", url, type(exc).__name__, exc)
        raise UserError(GENERIC_FETCH_ERROR) from exc


def _status_hint(code: int) -> str:
    if code in (401, 403):
        return "该网页需要登录，无法读取"
    if code == 404:
        return "网页不存在或已被删除"
    return f"网页返回错误（HTTP {code}），读不到内容"


async def _fetch_and_parse(url: str) -> dict:
    _validate_url(url)

    # 微博这一族走它自己那份数据（上面那一段注释写了为什么）。认不出号码、或站点回的形状
    # 不认识时 `_fetch_weibo` 给 None ⇒ 照旧落回下面那条网页那一路，与今天一模一样，
    # 这一刀只可能把"取不到"变成"取得到"，不许把任何一种旧形状改得比今天更差。
    if _is_weibo(url):
        weibo = await _fetch_weibo(url)
        if weibo is not None:
            return weibo

    async with httpx.AsyncClient(
        follow_redirects=False, timeout=30, headers=HEADERS
    ) as client:
        current_url = url
        for _ in range(5):
            # Re-validate right before connect to narrow DNS rebinding TOCTOU window
            _validate_url(current_url)
            
            # Use stream to limit response size before full download
            total_bytes = 0
            chunks = []
            async with client.stream("GET", current_url) as resp:
                if resp.is_redirect:
                    location = resp.headers.get("location", "")
                    if not location:
                        raise UserError("重定向响应缺少 Location 头")
                    next_url = location if location.startswith("http") else str(httpx.URL(current_url).join(location))
                    _validate_url(next_url)
                    current_url = next_url
                    continue
                if resp.status_code >= 400:
                    raise SiteHttpError(_status_hint(resp.status_code), resp.status_code)
                # 走到这一行就说明这一发不是 3xx 也不是 4xx+；后面那句"正文 0 字"要记的就是它。
                status_code = resp.status_code
                
                async for chunk in resp.aiter_bytes(chunk_size=8192):
                    total_bytes += len(chunk)
                    if total_bytes > MAX_RESPONSE_SIZE:
                        raise UserError(f"页面内容超过 {MAX_RESPONSE_SIZE // 1024 // 1024}MB 限制")
                    chunks.append(chunk)
                
                # 声明了错误 charset 的页面不该让整条任务失败：replace 只是少几个字
                html = b"".join(chunks).decode(resp.encoding or "utf-8", errors="replace")
            break
        else:
            raise UserError("网页跳转次数过多，读不到内容")

    source_type = _detect_source_type(url)

    if source_type == "wechat_article":
        parsed = _parse_wechat_article(html, url, source_type)
    else:
        parsed = _parse_general_url(html, url, source_type)
        # 小红书那一族的笔记内容（标题、正文、图、作者）**都不在 DOM 里**，藏在 `__INITIAL_STATE__` 那段 JSON。
        # **只用跳转后的末址判**（`xhslink.cn` 短链进来时 host 还不是它）。10-19 现读那篇：DOM 读出的 248 字是页面皮
        # （`创作中心／© 2014-2026／行吟信息科技／地址／电话`），笔记真正的正文是 `note.desc` 那 41 字
        # ⇒ 这一族四格全改吃 JSON（方案第三节第 1 项「要正经解析那段 JSON」）。
        if _is_xiaohongshu(current_url):
            parsed.update(_xiaohongshu_extras(html))
        # 搜狐那两型的真图地址不在 DOM 上（DOM 那枚 `data-src` 是密文，见 `_SOHU_HOSTS` 上面那段）。
        # 认得出键就用它并点名换 UA；认不出（键改了名）就照旧走通用那一路——形状与今天逐字相同。
        if _is_sohu(current_url):
            索 = _sohu_images(html)
            if 索 is not None:
                parsed["images"] = 索
                parsed["image_user_agent"] = _SOHU_IMAGE_UA
    # 图床卡来源的那几族由这里点名（读数在 `_IMAGE_REFERER_BY_HOST`）。微博那一族在自己那一段里已经给了，
    # 这一句只对认得出的站赋值，其余每一族那一格仍是空串＝一个字的 Referer 都不加。
    来路 = _named_image_referer(current_url)
    if 来路:
        parsed["image_referer"] = 来路
    # 带出这一枚数只为后台那一栏的"最后一次状态码"（规格-来源黑名单 §五）。
    # 用 `.get()` 读的那一方是必须的：现网那几把尺子里 fake 出来的抓取回体没有这一键，
    # 缺它只能退成"这个数不知道"，不许把一次本来成功的抓取报成失败。
    parsed["status_code"] = status_code
    return parsed


def _detect_source_type(url: str) -> str:
    if "mp.weixin.qq.com" in url:
        return "wechat_article"
    if "weixin.qq.com" in url:
        return "wechat_article"
    return "web_article"


def _is_xiaohongshu(url: str) -> bool:
    """这一跳最终落在小红书的那一站上吗（`xhslink.cn` 短链跳完才是 `xiaohongshu.com`）。

    ⚠ 这一枚判定只用来**选解析器**（那一族的图不在 DOM 里，得去解 JSON），不用来放行或拦下任何一次下载。
    贴图能不能存一律按形状判（响应头＋实际解出的宽高），按域名列黑白名单是错的方向，
    理由与读数在 `docs/方案-公众号贴图随笔记存档.md` 第十一节。
    """
    host = (urlparse(url).hostname or "").lower()
    return host == "xiaohongshu.com" or host.endswith(".xiaohongshu.com")


# ---------- 搜狐一族：图地址不在 DOM 上，DOM 那枚 `data-src` 是密文（10-31 现网出口量出来的） ----------
# 现读三篇真文章：`<img>` 身上只有 `img_width`／`img_height` 与一枚 **不是地址** 的 `data-src`
# （108 字符、base64 解出来是 80 B 密文，要搜狐自己的 JS 才解得开）。把它当地址补成绝对址，
# 下游打过去回的是 `text/html`——这就是屏上那句"2 张图没能存下来"的来历（10-29 清单第 5 行）。
# 真地址在页面内联脚本里，www 那型的键叫 `imgsList`、m 那型叫 `imageList`，形状是
# `[{"url":"https://q9.itc.cn/…","width":"1080","height":"720"}, …]`，**顺序与张数都跟容器里的
# `<img>` 逐篇对上**（现读三篇 2/2、4/4、3/3，另一篇两格都是 0）。
# ⚠ 只列量过的那两型主机名：`k.sohu.com`、`news.sohu.com` 之类没有读数，不许顺手扩。
_SOHU_HOSTS = ("www.sohu.com", "m.sohu.com")
_SOHU_LIST_KEYS = ("imgsList", "imageList")
# 这一族的图床卡的是**我们那枚 Windows 桌面 UA**：现网出口把上面三篇的九张逐张打了一遍——
# 带生产那套下载头 **6 张 403／3 张 200**，把 UA 换成下面这枚（或干脆一枚头都不带）**九张全 200**；
# 带来路（本站／整篇地址）都救不回来，所以这一族点名的不是来路、是 UA。
# ⚠ 不许把这枚 UA 塞进全局 `IMAGE_HEADERS`：微博那族卡的是"UA 与来路必须配对"、微信那族带来路会被
#   静默换成 2,090 B 占位图、小红书那族带来路硬 403（三族读数在 `note_images` 文件头第 3 条）。
_SOHU_IMAGE_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
# 图床要**带来源**的那几族，同一枚"由抓取这一层点名"的出口给的另一个值（微博那一族在它自己那一段里）。
_IMAGE_REFERER_BY_HOST = {
    # 10-31 现网出口连打三条：`cdnfile.sspai.com` 不带来源 **三条全 403**、带 `https://sspai.com/`
    # 三条全 200（带微博那枚也 200 ⇒ 这一族只要"带"，不看来路是谁家的——与微博那族方向相反）。
    "sspai.com": "https://sspai.com/",
}


def _is_sohu(url: str) -> bool:
    """这一跳最终落在搜狐正文那两型页面上吗（判定只用来选取法，不用来放行或拦下任何一次下载）。"""
    return (urlparse(url).hostname or "").lower() in _SOHU_HOSTS


def _named_image_referer(url: str) -> str:
    """这一站的配图要不要带一枚来源、带哪一枚。认不出来回空串＝一个字都不加（今天的样子）。

    后缀匹配必须带点边界：`sspai.com` 认 `www.sspai.com`，不认 `notsspai.com`，也不认
    `sspai.com.evil.cn`（那种主机名的后缀是 `.evil.cn`）。
    """
    host = (urlparse(url).hostname or "").lower()
    for 站, 来路 in _IMAGE_REFERER_BY_HOST.items():
        if host == 站 or host.endswith("." + 站):
            return 来路
    return ""


def _js_array_after(html: str, key: str) -> str:
    """取 `key: [...]` 那一段方括号里的原文（按括号配平，不看行数）。找不到回空串。

    搜狐那两型的名单不带引号（`imgsList:`），所以这里只按"键名＋冒号或等号＋紧跟左括号"认。
    """
    for m in re.finditer(re.escape(key) + r"\s*[:=]\s*", html):
        i = m.end()
        while i < len(html) and html[i] in " \t\r\n":
            i += 1
        if i >= len(html) or html[i] != "[":
            continue
        深 = 0
        for j in range(i, len(html)):
            if html[j] == "[":
                深 += 1
            elif html[j] == "]":
                深 -= 1
                if 深 == 0:
                    return html[i:j + 1]
    return ""


def _sohu_images(html: str) -> "list[str] | None":
    """搜狐那两型的正文图地址，按页面自己给的顺序。

    回 **None**（不是空列表）＝这两个键都不认 ⇒ 调用方退回通用那条取法，与今天一模一样。
    这一刀只可能把"取回一串密文"变成"取回地址"，不许把任何一种旧形状改得更差。
    """
    for 键 in _SOHU_LIST_KEYS:
        段 = _js_array_after(html, 键)
        if not 段:
            continue
        return _dedupe_order(
            _http_image_url("", m.group(1))
            for m in re.finditer(r"""["']url["']\s*:\s*["'](https?://[^"']+)["']""", 段)
        )
    return None


def _http_image_url(base: str, src: str) -> str:
    """把图地址补成一个能直接下的绝对 http(s) 地址，补不出来的回空串。

    公众号那边见过 `//mmbiz.qpic.cn/...`（缺协议）与 `data:image/...`（内联，压根不是地址），
    小红书那边给的是 `http://`（不是 https）。这两种都得先归一化再交给闸门，
    否则要么整批漏图，要么把一条 `data:` 串送进出网口。
    """
    raw = (src or "").strip()
    if not raw or raw.startswith("data:"):
        return ""
    absed = urljoin(base, raw) if base else raw
    if absed.startswith("//"):
        absed = "https:" + absed
    return absed if absed.startswith(("http://", "https://")) else ""


def _dedupe_order(urls: list[str]) -> list[str]:
    """按文档顺序去重（同一张图在源属性与占位属性上各出现一次是常态）。"""
    seen: set[str] = set()
    out: list[str] = []
    for u in urls:
        if u and u not in seen:
            seen.add(u)
            out.append(u)
    return out


def _content_images(el, base_url: str) -> list[str]:
    """正文容器里每一张图的地址，按文档顺序。

    属性名单按"先懒加载、`src` 兜底"排，这一条是两回实测逼出来的：
    · 公众号——**10-18 夜四条真文章 26/26 与 3/3 全在 `data-src`，一条 `src` 都没有**，
      只读 `src` 的实现一张都取不到（那条坑写在方案第二节）；
    · 网易——**10-29 那篇 `c.m.163.com` 8/8 全在 `data-echo`，而 8 张的 `src` 清一色是
      `https://static.ws.126.net/163/frontend/images/2022/empty.png` 那枚占位图**，
      真尺寸在旁边的 `data-width`／`data-height` 上（595×781 那种）。
    兜底那一位 `src` 必须留着：掘金／博客园那种普通页面只有 `src`，没有懒加载属性。
    """
    if el is None:
        return []
    urls = []
    for img in el.find_all("img"):
        for attr in _LAZY_ATTRS:
            candidate = _http_image_url(base_url, img.get(attr) or "")
            if candidate:
                urls.append(candidate)
                break
    return _dedupe_order(urls)


# 正文图藏在哪一个属性上，各站不一样（出处见上面 `_content_images` 那段实测）。
# 顺序就是优先级：懒加载属性一律排在 `src` 前面，否则懒加载站点取回来的是一整排占位图。
_LAZY_ATTRS = ("data-src", "data-echo", "data-original", "data-lazy-src", "data-actualsrc", "src")

# 正文容器的常见落点。`_main_container` 只在这些提示里挑，不整棵树扫：一篇大页面的 `div`
# 有几百个，逐个取全文字数会把抓取这一趟拖成秒级，而正文容器基本都带 article/post/content 这类名。
_MAIN_HINTS = (
    "article", "main",
    '[class*="article"]', '[class*="post_body"]', '[class*="rich"]', '[class*="content"]',
    '[id*="article"]', '[id*="content"]', '[id*="post"]',
)
# 每个提示最多看几枚（再深的推荐位／评论列表不进入选择）。
_MAIN_CANDIDATES_PER_HINT = 12


def _main_container(soup):
    """通用那一档的正文容器，取不到就回 None（回 None＝这一篇按"没有配图"走，不猜）。

    两步选择，缺一不可：**先按字数定上限，再在字数够多（≥上限 80%）的候选里取树中最深的那一层**。
    只走第一步会撞上网易那一型——最长的是外层 `div.article`（5,730 字、11 张图），
    比里面那层 `div.article-body`（4,599 字、8 张图）多出来的三张正是站点 logo、作者头像与分享图标：
    它们没有懒加载属性，于是会走 `src` 兜底那一路被一起捞进来，用户在配图那一排看见三张站皮。
    往深一层取（80% 那道闸保证不会因为钻进了小节标题而把正文丢了），装饰一张不进。
    """
    cands: list = []
    seen: set[int] = set()
    for hint in _MAIN_HINTS:
        try:
            found = soup.select(hint)[:_MAIN_CANDIDATES_PER_HINT]
        except Exception:
            continue
        for el in found:
            if id(el) in seen:
                continue
            seen.add(id(el))
            cands.append(el)
    if not cands:
        return None
    scored = [(len(el.get_text(strip=True)), sum(1 for _ in el.parents), el) for el in cands]
    ceiling = max(s[0] for s in scored)
    if ceiling <= 0:
        return None
    # 字数够多这一档先过，再取最深；同深时字数多的赢。
    qualified = [s for s in scored if s[0] >= ceiling * 0.8]
    qualified.sort(key=lambda s: (s[1], s[0]), reverse=True)
    return qualified[0][2]


_WX_ALBUM_KEY = "picture_page_info_list"
_WX_ALBUM_CDN = re.compile(r"""cdn_url\s*:\s*(['"])(.*?)\1""")


def _wechat_album_images(html: str) -> list[str]:
    """图片消息／相册型的那一种公众号帖：图**不在 `#js_content` 的 `<img>` 里**，在页面 JS 的
    `picture_page_info_list: [ { cdn_url: '…', width: '585' * 1, … }, … ]`。

    10-19 现读那条（`mp.weixin.qq.com/s/1FOoWv45lty7r7MZ88V9aQ`）：整页 2,592,904 B、`mmbiz` 251 次、
    `cdn_url` 33 次，而 `<img` 整页只有 7 张、`data-src` 只有 4 处 ⇒ 只读 DOM 的那一路回 0 张。
    这一段是 JS 对象字面量不是 JSON（键不带引号、值里有 `'585' * 1` 这种表达式），所以**按结构扫**：
    先截出配对完整的 `[ … ]`，再逐张截出顶层 `{ … }`，取其中**第一个** `cdn_url`——
    一张图那一段里还嵌着 `live_photo`／`pic_window_product` 这些子对象，整段一把正则会把它们也捞进来。
    平台自己在那一行写着 `.slice(0, 20)`（一帖最多 20 张），我们那 9 张上限照旧在后面截。
    """
    urls: list[str] = []
    at = 0
    while True:
        at = html.find(_WX_ALBUM_KEY, at)
        if at < 0:
            break
        at += len(_WX_ALBUM_KEY)
        br = html.find("[", at)
        if br < 0:
            continue
        array = _balanced(html, br, "[", "]")
        if not array:
            continue
        pos = 0
        while True:
            ob = array.find("{", pos)
            if ob < 0:
                break
            item = _balanced(array, ob, "{", "}")
            if not item:
                break
            pos = ob + len(item)
            hit = _WX_ALBUM_CDN.search(item)
            if hit:
                urls.append(_http_image_url("", hit.group(2)))
    return _dedupe_order([u for u in urls if u])


def _wechat_album_account(html: str) -> str:
    """相册型那一帖的公众号名：`#js_name` 那一格这种页面根本没有（实测命中 0），名字在 JS 的 `nick_name: '…'`。"""
    hit = re.search(r"""nick_name\s*:\s*(['"])(.*?)\1""", html)
    return (hit.group(2) or "").strip() if hit else ""


def _wechat_account(soup) -> str:
    """公众号名字，实测在 `#js_name`（那篇取到「玉树芝兰」）；备选那格是 profile 里的昵称。"""
    el = soup.find(id="js_name")
    if el and el.get_text(strip=True):
        return el.get_text(strip=True)
    profile = soup.find(id="profileBt")
    if profile:
        nick = profile.find(class_="rich_media_meta_nickname")
        if nick and nick.get_text(strip=True):
            return nick.get_text(strip=True)
    return ""


_XHS_STATE_KEY = "window.__INITIAL_STATE__="
# `__INITIAL_STATE__` 里 JS 的 `undefined` 不是合法 JSON，替换成 null 才解得开（10-19 现读那篇要替 15 处）。
_XHS_UNDEFINED = re.compile(r"(?<=[:,\[])\s*undefined(?=\s*[,\]}])")


def _balanced(text: str, start: int, open_ch: str = "{", close_ch: str = "}") -> str:
    """从 `start` 那枚 `open_ch` 起截出配对完整的那一段。

    脚本标签后面还跟着别的语句，所以不能"取到行尾"也不能取到文件尾——必须按括号配对截，
    并且**字符串里的括号不算**（配一个扫引号的开关，转义符也认）。截不出配对的那一段就回空串。
    """
    depth = 0
    in_str = False
    quote = ""
    escaped = False
    for i, ch in enumerate(text[start:]):
        if in_str:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                in_str = False
            continue
        if ch in ("'", '"'):
            in_str = True
            quote = ch
        elif ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return text[start:start + i + 1]
    return ""


def _balanced_object(text: str, start: int) -> str:
    return _balanced(text, start, "{", "}")


def _xiaohongshu_extras(html: str) -> dict:
    """从小红书那篇的 `__INITIAL_STATE__` 里取出这一族的四格：`title`／`content`／`images`／`author`。

    10-19 现读那篇的形状（noteId `6ad40f01000000002203c359`）：
    `note.noteDetailMap[<noteId>].note` 里有 `title`／`desc`／`imageList[]`／`user.nickname`；
    `imageList` 共 **5 张**，每张有 `urlDefault`／`urlPre` 与 `infoList[{imageScene: WB_PRV|WB_DFT, url}]`。
    **图取 `urlDefault`**——`urlPre` 是 `WB_PRV`（预览那张），不是笔记里的那一张。
    哪一格在 JSON 里是空的就不覆盖那一格（有的笔记没有标题；跳到用户页／合集页时整段 `note` 都没有，
    那时 DOM 那一份仍是唯一出口）。解不开、结构不对一律回空——这条不许把整次抓取带崩。
    """
    at = html.find(_XHS_STATE_KEY)
    if at < 0:
        return {}
    blob = _balanced_object(html, at + len(_XHS_STATE_KEY))
    if not blob:
        return {}
    try:
        data = json.loads(_XHS_UNDEFINED.sub("null", blob))
    except (ValueError, TypeError):
        logger.info("小红书那段 JSON 解不开，这一篇只存文字")
        return {}
    detail = ((data.get("note") or {}).get("noteDetailMap") or {})
    note = {}
    for value in detail.values():
        if isinstance(value, dict) and isinstance(value.get("note"), dict):
            note = value["note"]
            break
    if not note:
        return {}
    urls = []
    for item in (note.get("imageList") or []):
        if isinstance(item, dict):
            urls.append(_http_image_url("", str(item.get("urlDefault") or item.get("url") or "")))
    out = {"images": _dedupe_order([u for u in urls if u])}
    title = str(note.get("title") or "").strip()
    if title:
        out["title"] = title
    desc = str(note.get("desc") or "").strip()
    if desc:
        out["content"] = desc
    name = ((note.get("user") or {}).get("nickname") or "").strip()
    if name:
        out["author"] = name
    return out


# ==================== 微博这一族 ====================
# 它的桌面页与移动页在浏览器之外**都是访客壳**（10-18 与 10-29 两轮实测同判：
# 302 → `passport…/visitor` → 200、9,158～9,648 B、标题 `Sina Visitor System`、正文 0 字），
# 而微博给自家移动网页用的那一份数据不要登录、不要 cookie、也不要签名，只认三枚手机身份头。
# 10-31 现读同一条链接：`https://weibo.com/1649679354/5359090512694626`
# · 老那条（桌面 UA 打网页）＝200、9,648 B、0 字（本机与现网两个出口读数一样）；
# · 这一条（手机头打数据口）＝现网出口 0.2 秒、200、8,500 B、正文 722 字、作者与 6 张图地址全在里。
# 台账里那句"微博要靠浏览器渲染才拿得到"从今天起不再成立（至少这一条不靠）。
_WEIBO_HOSTS = {"weibo.com", "www.weibo.com", "m.weibo.cn"}
_WEIBO_SHOW = "https://m.weibo.cn/statuses/show?id={}"
_WEIBO_EXTEND = "https://m.weibo.cn/statuses/extend?id={}"
# 链接里那个号码两种形状，都实测打得开：19 位以内的纯数字（mid），或 9 位字母数字
# （bid，例 `weibo.com/2656274875/H5Ro3mlPz`——它 302 时给的 Location 里就是 `m.weibo.cn/status/H5Ro3mlPz`）。
_WEIBO_TOKEN = r"\d{8,20}|[0-9A-Za-z]{9}"
_WEIBO_ID_PATTERNS = (
    re.compile(r"weibo\.com/\d{6,20}/(" + _WEIBO_TOKEN + r")(?:[?#/]|$)"),
    re.compile(r"m\.weibo\.cn/(?:status|detail)/(" + _WEIBO_TOKEN + r")(?:[?#/]|$)"),
)
# 四枚里**真正承重的是那两枚**：`Referer` 与 `X-Requested-With`。10-31 在现网出口逐枚摘头发过六发：
# 四枚全带 200／`ok:1`／8,500 B；**摘掉 `Referer` → 403／81 B／`ok:0 errno 100015`**；
# **摘掉 `X-Requested-With` → 302 进访客壳**（与一枚不带时同一个落点）；
# 摘掉 `User-Agent`（连 curl 默认那枚都不给）与摘掉 `MWeibo-Pwa` 都仍 200／8,499～8,500 B——
# 那两枚是浏览器本来就会带的，留着只为"像同一个客户端"，不许谁把它们当可省的那一枚删掉。
_WEIBO_HEADERS = {
    **HEADERS,
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    ),
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://m.weibo.cn/",
    "X-Requested-With": "XMLHttpRequest",
    "MWeibo-Pwa": "1",
}
# 错误码 → 用户那一句（toast 两行）。为什么按错误码而不是 HTTP 状态：删帖与设权限都回
# **HTTP 200**，状态码上什么都看不见，只有 `errno` 分得开"这条没了"和"这条不给看"。
# 两枚码都是 10-31 现读到的真形状（`5007815001244072` → 20101 该微博不存在；
# `1736988591/5218886967890075` → 20170 由于博主设置，目前内容暂不可见）。
_WEIBO_ERRNO_HINT = {
    "20101": "这条微博不存在或已被删除",
    "20170": "这条微博设置了权限，看不到内容",
}
# 配图那一张要带来的来路。为什么这一族要给值（10-31 现网出口逐档量）：
# 生产那套下载头（桌面 UA＋`Accept: image/*`）不带 Referer 时 `wx*.sinaimg.cn` 整批 **403／238 B**，
# 带 `https://m.weibo.cn/` 或 `https://weibo.com/` 时 `orj360`／`mw2000`／`large` 三档全 **200**
# （22,521／1,248,453／2,853,517 B），带一枚外站 Referer（example.com）仍 **403／304 B**。
# ⇒ 卡的是"来路必须是微博"，而那只有抓取这一层知道；细则与另两族相反的形状在 `note_images` 文件头第 3 条。
_WEIBO_IMAGE_REFERER = "https://m.weibo.cn/"


def _is_weibo(url: str) -> bool:
    """这一条链接是不是微博的那几台站（只用来选取法，不参与放行或拦下任何一次下载）。"""
    return (urlparse(url).hostname or "").lower() in _WEIBO_HOSTS


def _weibo_status_id(url: str) -> str:
    """从链接里取出那条微博的号码，取不出来回空串（回空＝落回网页那一路，不猜）。"""
    for pattern in _WEIBO_ID_PATTERNS:
        hit = pattern.search(url or "")
        if hit:
            return hit.group(1)
    return ""


def _weibo_text(raw) -> str:
    """微博那一份数据里的正文是一小段 HTML（10-31 现读四种形状都是），压回屏上那几个字。

    · `<br />` → 换行；
    · 表情是 `<img alt="[衰]" src="https://face.t.sinajs.cn/…png">`——**留 alt 那个名字**。
      它在屏上就是"衰"那张脸，整枚删掉会把"…大大的反差[衰][猪头]"削成半句话；
    · 超话／话题那枚芯片是 `<a>…<span class='url-icon'><img 图标></span><span class='surl-text'>周深</span></a>`，
      那张图标不带 alt ⇒ 按上一条整枚丢掉，剩下的 `周深` 正是屏上那几个字；
    · 「网页链接」「某某的微博视频」那几枚锚文本照原样留着（与公众号那一条纪律同源：压回显示字，不砍整枚）。
    """
    soup = BeautifulSoup(raw or "", "html.parser")
    for br in soup.find_all("br"):
        br.replace_with("\n")
    for img in soup.find_all("img"):
        img.replace_with((img.get("alt") or "").strip())
    # 零宽空格是微博排在表情与话题之间的老手筋，留着会在屏上撑出一个看不见的洞
    text = soup.get_text().replace("\u200b", "")
    lines = [line.strip() for line in text.split("\n")]
    return re.sub(r"\n{2,}", "\n", "\n".join(lines)).strip()


def _weibo_pics(node) -> list[str]:
    """一条微博的配图地址，按文档顺序，优先 `large.url`。

    10-31 现读那条六张：`url` 是 `orj360`（360×479），`large.url` 是 `mw2000`（2048×2730）。
    取大那张的理由在下游：转存那条链最后要压到单张预算里，从 360 起压只会更糊。
    现网出口不带 Referer 直下 `mw2000` 实测 200／1,248,453 B／JPEG 2000×2667
    （台账表四第 3 行那条"微博图床不带 Referer 就 403"是 360 那一档的读数，两头对不上，
    已就地记进 `docs/枚举-URL转存全部情况.md`，这里按现读的这一条取）。
    """
    if not isinstance(node, dict):
        return []
    urls = []
    for pic in (node.get("pics") or []):
        if not isinstance(pic, dict):
            continue
        large = pic.get("large")
        big = large.get("url") if isinstance(large, dict) else ""
        urls.append(_http_image_url("", big or pic.get("url") or ""))
    return [u for u in urls if u]


def _parse_weibo(data: dict, own_full: str = "") -> dict:
    """一份微博数据 → 抓取那一层约定的回体（`title`／`content`／`images`／`author`／`site_name_meta`）。

    `own_full` 是全文口那一份（只有标了长文才会去要）；给了而且比主口长就用它，
    否则用主口——**取更大的那一份，不是无条件替换**，因为全文口回空是常态（老微博、被删的楼）。

    转发那一型（10-31 现读 `5208601192040603`：转发语 46 字＋原文 139 字）把原文接在后面，
    用 `//@原作者：` 开头——那正是微博自己在屏上用的写法，用户认得；
    两边的图并在一起（先自己的、再原文的），张数与"几张没存下"仍由下游那两条实话记。
    """
    rt = data.get("retweeted_status")
    own = own_full or _weibo_text(data.get("text"))
    parts = [own] if own else []
    if isinstance(rt, dict):
        orig = _weibo_text(rt.get("text"))
        name = ((rt.get("user") or {}).get("screen_name") or "").strip()
        if orig:
            parts.append("//@%s：%s" % (name, orig) if name else "//@%s" % orig)
    author = ((data.get("user") or {}).get("screen_name") or "").strip()
    title = (data.get("status_title") or "").strip()
    if title.endswith("..."):  # 主口给的是掐过头的标题（现读那条图文就是「…咱们主...」）
        title = title[:-3].strip()
    return {
        "title": title or (f"{author} 的微博" if author else "微博正文"),
        "content": "\n\n".join(part for part in parts if part),
        "source_type": "web_article",
        "images": _dedupe_order(_weibo_pics(data) + _weibo_pics(rt)),
        # 微博那张图床认的是**来路**不是UA缺失：现网出口逐档量过，生产那套头（桌面 UA＋`Accept: image/*`）
        # 不带 Referer 整批 403／238 B，带 `https://m.weibo.cn/` 或 `https://weibo.com/` 三档全 200，
        # 带随便一枚外站 Referer 仍然 403。这一枚由 `_archive_images` 原样递给 `archive(referer=…)`，
        # 只有这一族给值，其余各族那一格是空串（细则在 `note_images` 文件头第 3 条）。
        "image_referer": _WEIBO_IMAGE_REFERER,
        "author": author,
        # 站名这一格这里给不出来（这一族不读 HTML，没有 `og:site_name` 那一枚 meta），
        # 空串不是"没名字"：`site_names.builtin_site` 那张表按域名后缀认 weibo.com／weibo.cn＝微博。
        "site_name_meta": "",
    }


async def _fetch_weibo_extend(client: httpx.AsyncClient, status_id: str) -> str:
    """长文那一型的全文那一发。取不到一律回空串（主口那一份照用）——多要这一发是为了"更全"，
    它失败不该把整篇判死。两发样本里它与主口逐字等长（1,697／1,697 与 2,280／2,280 HTML 字符），
    但"数据里写着还有更多"不能拿两条样本读成"主口永远给全"，所以这一发要发、并且只取更大的那一份。
    """
    try:
        resp = await client.get(_validate_url(_WEIBO_EXTEND.format(status_id)))
        payload = resp.json() if resp.status_code < 400 else None
    except Exception as exc:
        logger.info("微博全文那一发没成（%s），用主口那一份", type(exc).__name__)
        return ""
    if not isinstance(payload, dict):
        return ""
    return _weibo_text(((payload.get("data") or {}).get("longTextContent")) or "")


async def _fetch_weibo(url: str) -> dict | None:
    """微博链接走那份数据；None＝这条路这次走不通（认不出号码／解不开），由调用方落回网页那一路。"""
    status_id = _weibo_status_id(url)
    if not status_id:
        return None
    fetch_url = _validate_url(_WEIBO_SHOW.format(status_id))
    async with httpx.AsyncClient(follow_redirects=False, timeout=20, headers=_WEIBO_HEADERS) as client:
        resp = await client.get(fetch_url)
        if resp.status_code >= 400:
            raise SiteHttpError(_status_hint(resp.status_code), resp.status_code)
        if len(resp.content) > MAX_RESPONSE_SIZE:
            raise UserError(f"这条微博内容超过 {MAX_RESPONSE_SIZE // 1024 // 1024}MB 限制")
        try:
            payload = resp.json()
        except ValueError:
            logger.info("微博那一份数据解不开（可能是登录壳），这一条落回网页那一路")
            return None
        status_code = resp.status_code
        if not isinstance(payload, dict):
            return None
        if payload.get("ok") != 1:
            # 这一型**不进黑名单**：它是"这一条微博"的事，不是"weibo.com 这个站"的事。
            # 计数只挂在 `SiteHttpError` 与"200 且正文 0 字"那两岔上，这里直接抛 UserError 就绕开了。
            errno = str(payload.get("errno") or "")
            raise UserError(_WEIBO_ERRNO_HINT.get(errno) or "这条微博读不到内容")
        data = payload.get("data")
        if not isinstance(data, dict):
            return None
        own_full = await _fetch_weibo_extend(client, status_id) if data.get("isLongText") else ""

    parsed = _parse_weibo(data, own_full)
    if not parsed["content"]:
        # 只有视频、连一句字都没有的那条：当场说一句人话，也不回 0 字——
        # 回 0 字会被下游算成"这个站读不到"，攒三次就把整台 weibo.com 拉黑（现网此刻计 2，只差一次）。
        raise UserError("这条微博只有视频，没有文字内容")
    parsed["status_code"] = status_code
    return parsed


# 微信那一族的正文是塞在 JS 字符串里发出来的：换行写成 `\x0a`、`&` 写成 `\x26`
# （10-22 那篇实测 96／374 处），而文章里插的「话题」「音乐卡片」这类挂件是**转义过**的 `<a>` 标签
# （话题 `\x26lt;a class=\x26quot;wx_topic_link\x26quot;…\x26gt;#词\x26lt;/a\x26gt;`、
# 音乐 `…class=\x26quot;js_plain-music_entry wx_plain-music_link\x26quot;…\x26gt;歌名 (Live)\x26lt;/a\x26gt;`）。
# 不先解 `\xHH`，下面那条连模式都匹配不上——屏上就整串念成
# `\x0a\x0a…\x26lt;a class=\x26quot;wx_topic_link\x26quot;…`，全是无效字。
# 现网 145 篇全扫过：解完 `\xHH` 之后剩下的转义标签**只有 `<a>` 这一种**（30 处），
# 所以按"转义的 a 标签"整类压回它的显示字，不必一种挂件补一条规则。
_WX_HEX_ESCAPE = re.compile(r"\\x([0-9a-fA-F]{2})")
_WX_ESCAPED_ANCHOR = re.compile(r"&lt;a\b.*?&gt;(.*?)&lt;/a&gt;", re.S)


def _decode_wechat_text(text: str) -> str:
    r"""把 JS 字符串那层 `\xHH` 还原成字，再把转义过的 `<a>` 压回它显示的那几个字。

    只压 `<a>` 这一种标签：整段 `html.unescape` 会把讲代码的文章里那些举例用的
    `&lt;div&gt;` 一起当标签吃掉。
    """
    decoded = _WX_HEX_ESCAPE.sub(lambda m: chr(int(m.group(1), 16)), text)
    return _WX_ESCAPED_ANCHOR.sub(lambda m: f"{m.group(1)} ", decoded)


def _site_name_meta(soup) -> str:
    """第 2 级那一手：页面自己写下来的站名（`og:site_name`，其次结构化数据里的 `publisher.name`）。

    只取、不判——"这个串脏不脏"归 `site_names.meta_site` 一处判，这里再判一遍就是第二份真相
    （10-29 实测少数派报的是「少数派 - 高品质数字消费指南」，那一判写在链上、不写在解析里）。

    ⚠ 这一趟解不开一律回空串：站名是这一格里最便宜的一枚，
    任何解析意外都不许把一次本来成功的抓取带崩（与 `_xiaohongshu_extras` 同一条纪律）。
    """
    try:
        og = soup.find("meta", property="og:site_name")
        if og and (og.get("content") or "").strip():
            return og["content"].strip()
        for block in soup.find_all("script", type="application/ld+json"):
            raw = block.string or block.get_text() or ""
            if '"publisher"' not in raw:
                continue
            data = json.loads(raw)
            for item in (data if isinstance(data, list) else [data]):
                if not isinstance(item, dict):
                    continue
                publisher = item.get("publisher")
                name = publisher.get("name") if isinstance(publisher, dict) else publisher
                if isinstance(name, str) and name.strip():
                    return name.strip()
    except Exception as exc:
        logger.info("页面自报站名没读出来（不影响这一篇存不存）：%s", type(exc).__name__)
    return ""


def _parse_wechat_article(html: str, url: str, source_type: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")

    title_el = soup.find("h1", class_="rich_media_title") or soup.find("h1")
    title = title_el.get_text(strip=True) if title_el else ""

    content_el = soup.find("div", class_="rich_media_content") or soup.find(
        "div", id="js_content"
    )
    if content_el:
        text = content_el.get_text("\n", strip=True)
    else:
        text = trafilatura.extract(html) or ""

    if not title:
        og_title = soup.find("meta", property="og:title")
        title = og_title["content"] if og_title and og_title.get("content") else "微信文章"

    images = _content_images(content_el, url)
    account = _wechat_account(soup)
    if not images:
        album = _wechat_album_images(html)
        if album:
            # 这一族还有第二种形状（图片消息／相册型）：`#js_content` 里一张图都没有，图在 JS 的
            # `picture_page_info_list[].cdn_url`。这种页面也**没有长正文**——DOM 那一份读出来是 129 字
            # 页面皮（`知道了／微信扫一扫／使用小程序／取消／允许／赞／在看／分享／留言／收藏`），
            # 拿它去提炼就得到"内容可通过微信扫一扫打开小程序浏览"这种废话要点；
            # 这一种帖子真正的文字在 `<meta name="description">` 那一格。
            images = album
            desc = soup.find("meta", attrs={"name": "description"})
            if desc and desc.get("content"):
                text = desc["content"].strip()
            # 这一种页面连 `#js_name` 那一格都没有（实测命中 0），公众号名在 JS 的 `nick_name: '…'` 里。
            # 不补这一格就是"图存下了、来源那一整行不画"——他那句"加来源像转存一样"要的就是那一行。
            account = account or _wechat_album_account(html)

    return {
        "title": title,
        "content": _decode_wechat_text(text),
        "source_type": source_type,
        "images": images,
        "author": account,
        "site_name_meta": _site_name_meta(soup),
    }


def _parse_general_url(html: str, url: str, source_type: str) -> dict:
    text = trafilatura.extract(html, include_comments=False) or ""

    soup = BeautifulSoup(html, "html.parser")
    og_title = soup.find("meta", property="og:title")
    title = ""
    if og_title and og_title.get("content"):
        title = og_title["content"]
    elif soup.title:
        title = soup.title.get_text(strip=True)

    if not title:
        title = "网页摘录"

    # 10-29 这一档才开始取配图。之前这里**连 `images` 那一键都没有**，
    # 所以站长那篇网易文章（标题与 4,541 字正文都取到了）屏上只有字、一张图也没跟过来——
    # 不是抓图失败，是这条路压根没去抓。现挑正文容器、按 `_LAZY_ATTRS` 逐张取一枚：
    # 网易那篇现读 8 张正文图全在 `data-echo`，`src` 全是 `empty.png` 占位。
    # 取到几张、几张没存下，仍然由下游那两条实话负责（`images_kept`／`images_failed`），
    # 上限也还是 `MAX_ASSETS_PER_NOTE` 那一枚常量，这里不另立一个数。
    return {
        "title": title,
        "content": text,
        "source_type": source_type,
        "images": _content_images(_main_container(soup), url),
        "site_name_meta": _site_name_meta(soup),
    }
