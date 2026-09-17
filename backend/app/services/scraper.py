import ipaddress
import socket
from urllib.parse import urlparse

import httpx
import trafilatura
from bs4 import BeautifulSoup

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
BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]


def _is_private_ip(ip_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return True
    return any(addr in net for net in BLOCKED_NETWORKS)


def _validate_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise ValueError(f"不支持的协议: {parsed.scheme}，仅允许 HTTPS/HTTP")
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL 缺少主机名")
    try:
        resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror:
        raise ValueError(f"无法解析域名: {hostname}")
    for family, _, _, _, sockaddr in resolved:
        ip = sockaddr[0]
        if _is_private_ip(ip):
            raise ValueError(f"域名解析到内网地址，已拦截: {hostname}")
    return url


async def scrape_url(url: str) -> dict:
    _validate_url(url)

    async with httpx.AsyncClient(
        follow_redirects=False, timeout=30, headers=HEADERS
    ) as client:
        current_url = url
        for _ in range(5):
            resp = await client.get(current_url)
            if resp.is_redirect:
                location = resp.headers.get("location", "")
                if not location:
                    break
                next_url = location if location.startswith("http") else str(httpx.URL(current_url).join(location))
                _validate_url(next_url)
                current_url = next_url
                continue
            resp.raise_for_status()
            if len(resp.content) > MAX_RESPONSE_SIZE:
                raise ValueError(f"页面内容超过 {MAX_RESPONSE_SIZE // 1024 // 1024}MB 限制")
            html = resp.text
            break
        else:
            raise ValueError("重定向次数过多")

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
