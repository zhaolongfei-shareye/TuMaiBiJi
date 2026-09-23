"""抓取器的 SSRF 闸门：用户填什么网址我们就去连什么，这道判定是唯一拦路虎。

链接抓取是服务端代用户出网，所以"能不能连到这个地址"完全由 _is_private_ip 决定。
它一旦放行内网，攻击者就能拿这台云主机当跳板：提交 http://169.254.0.23/ 读云厂商
元数据（里面常有临时凭据），或者 http://[::]:6379/ 打本机 Redis——抓回来的正文会原样
存进他自己的笔记，等于一条现成的外带通道。

历史上这里是手写网段清单，漏了三类：**IPv6 未指定地址 `::`**（Linux 上 connect 它等于
连本机，清单里只有 `::1/128`）、组播、以及 CGNAT 100.64.0.0/10（IANA 归为"共享地址空间"
而不是"私有"，云内网服务常落在这段）。现在改成走 ipaddress 的语义判定，它跟着 IANA
特殊用途地址表走，将来新划的保留段自动覆盖，不用再回来补清单。

用例一律不出网：地址判定是纯函数，域名解析全部 monkeypatch 掉。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from app.core.errors import UserError
from app.services import scraper


# 每一条都是"能连到不该连的地方"的具体路径，不是凑数的
BLOCKED = [
    "127.0.0.1",          # 本机：Redis / API 自己
    "127.1.2.3",          # 整个 127/8 都是回环，不只 .0.0.1
    "10.1.2.3",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.254",     # 云上 VPC 常见落在 172.16/12 里
    "169.254.169.254",    # AWS / GCP 元数据
    "169.254.0.23",       # 腾讯云元数据
    "0.0.0.0",
    "0.1.2.3",
    "::1",
    "::",                 # IPv6 未指定地址，Linux 上等于连本机——旧清单最大的洞
    "::ffff:127.0.0.1",   # IPv4-mapped 写法绕过
    "::ffff:0.0.0.0",
    "fe80::1",
    "fc00::1",
    "fd12::1",
    "100.64.0.1",         # CGNAT
    "100.127.255.254",
    "192.0.0.1",
    "192.0.2.1",          # TEST-NET-1
    "198.18.0.1",         # 基准测试段，也是本地假 IP 代理的发号段
    "198.51.100.1",       # TEST-NET-2
    "203.0.113.1",        # TEST-NET-3
    "224.0.0.1",          # 组播
    "239.1.1.1",
    "240.0.0.1",          # 保留
    "255.255.255.255",    # 广播
    "64:ff9b::7f00:1",    # NAT64，内嵌 127.0.0.1
    "2001:db8::1",        # 文档段
]

ALLOWED = [
    "8.8.8.8",
    "93.184.216.34",      # example.com
    "1.1.1.1",
    "104.16.0.1",
    "2606:2800:220:1:248:1893:25c8:1946",
]


@pytest.mark.parametrize("ip", BLOCKED)
def test_内网与保留地址一律拦下(ip):
    assert scraper._is_private_ip(ip) is True, f"{ip} 被放行了，抓取器能连到它"


@pytest.mark.parametrize("ip", ALLOWED)
def test_正常公网地址照常放行(ip):
    assert scraper._is_private_ip(ip) is False, f"{ip} 是公网地址，拦了就抓不了任何网页"


@pytest.mark.parametrize("junk", ["", "not-an-ip", "1.2.3.4.5", "127.0.0.1 ", "０.０.０.１"])
def test_解析不出来的一律当危险处理(junk):
    """判定不了的地址宁可拦。放行等于把"我不认识"当成"它安全"。"""
    assert scraper._is_private_ip(junk) is True


def test_非http协议直接拒():
    for url in ("file:///etc/passwd", "gopher://127.0.0.1:6379/_INFO", "ftp://a.b/c", "javascript:alert(1)"):
        with pytest.raises(UserError):
            scraper._validate_url(url)


def test_url里没有主机名就拒():
    with pytest.raises(UserError):
        scraper._validate_url("https://")


def test_直接写内网IP的链接过不了闸门():
    """域名都不用，攻击者可以直接填字面 IP。"""
    with pytest.raises(UserError) as e:
        scraper._validate_url("http://169.254.0.23/latest/meta-data/")
    assert "内网" in str(e.value)


def test_IPv6未指定地址的链接过不了闸门():
    with pytest.raises(UserError):
        scraper._validate_url("http://[::]:6379/")


def test_域名解析到内网也拦(monkeypatch):
    """公网域名 + 内网 A 记录是最常见的绕过手法，判定必须看解析结果而不是域名字面。"""
    monkeypatch.setattr(
        scraper.socket, "getaddrinfo",
        lambda *a, **kw: [(2, 1, 6, "", ("10.0.0.5", 0))],
    )
    with pytest.raises(UserError) as e:
        scraper._validate_url("https://innocent-looking.example.com/a")
    assert "内网" in str(e.value)


def test_解析出多个地址时只要有一个是内网就整条拦(monkeypatch):
    """攻击者会给一个域名同时挂公网和内网记录，只查第一条等于没查。"""
    monkeypatch.setattr(
        scraper.socket, "getaddrinfo",
        lambda *a, **kw: [
            (2, 1, 6, "", ("93.184.216.34", 0)),
            (2, 1, 6, "", ("127.0.0.1", 0)),
        ],
    )
    with pytest.raises(UserError):
        scraper._validate_url("https://mixed.example.com/a")


def test_IPv6结果同样参与判定(monkeypatch):
    monkeypatch.setattr(
        scraper.socket, "getaddrinfo",
        lambda *a, **kw: [(10, 1, 6, "", ("::1", 0, 0, 0))],
    )
    with pytest.raises(UserError):
        scraper._validate_url("https://v6.example.com/a")


def test_域名解析失败给中文而不是gaierror原文(monkeypatch):
    monkeypatch.setattr(
        scraper.socket, "getaddrinfo",
        lambda *a, **kw: (_ for _ in ()).throw(scraper.socket.gaierror(-2, "Name or service not known")),
    )
    with pytest.raises(UserError) as e:
        scraper._validate_url("https://no-such-host.invalid/a")
    assert "无法解析域名" in str(e.value)
    assert "gaierror" not in str(e.value)


def test_公网域名放行(monkeypatch):
    monkeypatch.setattr(
        scraper.socket, "getaddrinfo",
        lambda *a, **kw: [(2, 1, 6, "", ("93.184.216.34", 0))],
    )
    assert scraper._validate_url("https://example.com/a") == "https://example.com/a"


def test_抓取的异常原文不会漏给用户(monkeypatch):
    """httpx 的异常文本里带着完整 URL，可能含 token；用户只能看到那句通用中文。"""
    async def boom(url):
        raise RuntimeError("ConnectError while requesting https://x.test/?access_token=SECRET")

    monkeypatch.setattr(scraper, "_fetch_and_parse", boom)
    with pytest.raises(UserError) as e:
        import asyncio
        asyncio.run(scraper.scrape_url("https://x.test/?access_token=SECRET"))
    assert e.value.args[0] == scraper.GENERIC_FETCH_ERROR
    assert "SECRET" not in e.value.args[0]


def test_UserError原样冒泡不被通用文案覆盖(monkeypatch):
    """闸门自己的判定（"该网页需要登录"这类）是有用信息，不能被兜底文案吃掉。"""
    async def gated(url):
        raise UserError("该网页需要登录，无法读取")

    monkeypatch.setattr(scraper, "_fetch_and_parse", gated)
    import asyncio
    with pytest.raises(UserError) as e:
        asyncio.run(scraper.scrape_url("https://x.test/a"))
    assert "需要登录" in str(e.value)
