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

    读的是 `data-src` 不是 `src`：**10-18 夜四条真文章实测 26/26 与 3/3 全在 `data-src`，
    一条 `src` 都没有**——只读 `src` 的实现一张都取不到（那条坑写在方案第二节）。
    """
    if el is None:
        return []
    urls = []
    for img in el.find_all("img"):
        for attr in ("data-src", "src"):
            candidate = _http_image_url(base_url, img.get(attr) or "")
            if candidate:
                urls.append(candidate)
                break
    return _dedupe_order(urls)


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
        "content": text,
        "source_type": source_type,
        "images": images,
        "author": account,
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

    return {"title": title, "content": text, "source_type": source_type}
