import ipaddress
import logging
import socket
from urllib.parse import urlparse

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
        raise UserError(f"无法解析域名: {hostname}")
    for family, _, _, _, sockaddr in resolved:
        ip = sockaddr[0]
        if _is_private_ip(ip):
            raise UserError(f"域名解析到内网地址，已拦截: {hostname}")
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
                    raise UserError(_status_hint(resp.status_code))
                
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
        return _parse_wechat_article(html, url, source_type)

    return _parse_general_url(html, url, source_type)


def _detect_source_type(url: str) -> str:
    if "mp.weixin.qq.com" in url:
        return "wechat_article"
    if "weixin.qq.com" in url:
        return "wechat_article"
    return "web_article"


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

    return {"title": title, "content": text, "source_type": source_type}


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
