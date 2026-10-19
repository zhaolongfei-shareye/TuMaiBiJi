"""小红书那道闸卡的到底是 **IP 还是签名**——同一把尺子在本机与现网各打 N 次，只看命中分布。

跑法（两台各跑一次，脚本一模一样）：
    本机  cd backend && .venv/bin/python ../docs/工具/探-小红书闸卡IP还是签名.py
    现网  ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-小红书闸卡IP还是签名.py

⚠ **这一把对现网零写**：只用 httpx 打外网，不碰数据库、不碰 `note_site_failure()`——
黑名单里 `xhslink.cn` 已经 2 次，**误碰一次就把小红书整族自动拉黑**（用户读到「这个网站读不到内容，已停用」）。

为什么先自报出口身份再看结果：站长 10-19 14:4x 要的是"住宅出口验证"，而**"这台机器走的是不是住宅出口"
本身就是要量的那一枚**，不是可以假设的前提。这台笔记本上有一套按规则分流的代理
（见 [[local-dns-fake-ip-proxy]]、[[openwrt-openclash-router]]），所以**同一个进程里不同目的地可能走不同出口**，
上一趟"本机拿到笔记、本机浏览器却挨『安全限制 IP存在风险 300012』"这两件事就是这么岔开的。
⇒ 每一趟都打两个回显：境内那个（`myip.ipip.net`，中文站看到的就是它）与境外那个，
   再打 macOS 系统代理与 `*_proxy` 环境变量；**出口身份没读数之前，分布数字不许归因成"住宅 IP 的作用"**。
"""
import os
import sys

sys.path.insert(0, ".")

import httpx  # noqa: E402

from app.services import scraper  # noqa: E402

NOTES = [
    ("笔记页 discovery", "https://www.xiaohongshu.com/discovery/item/6ad40f01000000002203c359"),
    ("笔记页 explore", "https://www.xiaohongshu.com/explore/6ad40f01000000002203c359"),
    ("短链", "https://xhslink.cn/o/9F1fAXNBL1I"),
]
ECHOES = [
    ("境内回显（中文站看到的出口）", "https://myip.ipip.net"),
    ("境外回显（走没走代理这条路的对照）", "https://ipinfo.io/ip"),
]
ROUNDS = int(os.environ.get("ROUNDS", "5"))


def echoes():
    for label, url in ECHOES:
        try:
            r = httpx.get(url, timeout=12, headers=scraper.HEADERS, follow_redirects=True)
            body = " ".join(r.text.split())[:180]
            print(f"  {label}: {body}")
        except Exception as exc:
            print(f"  {label}: 打不通 {type(exc).__name__}｜{str(exc)[:90]}")
    envs = {k: v for k, v in os.environ.items() if "proxy" in k.lower()}
    print(f"  进程里可见的 *_proxy 环境变量: {envs if envs else '无'}")
    if sys.platform == "darwin":
        import subprocess
        sp = subprocess.run(["scutil", "--proxy"], capture_output=True, text=True, timeout=10)
        lines = [ln.strip() for ln in sp.stdout.splitlines()
                 if any(k in ln for k in ("HTTPProxy", "HTTPPort", "HTTPSProxy", "HTTPSPort",
                                          "ProxyAutoConfigEnable", "SOCKSProxy"))]
        print(f"  macOS 系统代理: {lines if lines else '（读不到）'}")


def one_round(idx):
    """三条地址各打一次，只记形状，不做判定。"""
    out = []
    with httpx.Client(follow_redirects=False, timeout=30, headers=scraper.HEADERS) as c:
        for label, url in NOTES:
            current, final_body = url, ""
            try:
                for _ in range(5):
                    r = c.get(current)
                    if r.is_redirect:
                        loc = r.headers.get("location", "")
                        nxt = loc if loc.startswith("http") else str(httpx.URL(current).join(loc))
                        current = nxt
                        continue
                    final_body = r.text
                    out.append((label, r.status_code, current, len(final_body), final_body))
                    break
                else:
                    out.append((label, 0, current, 0, ""))
            except Exception as exc:
                out.append((label, -1, current, 0, ""))
                print(f"    !! {label} 这一发抛了：{type(exc).__name__}｜{str(exc)[:80]}")
    tally = {}
    for label, code, final, size, body in out:
        kind, extra = shape(final, body, code)
        tally[kind] = tally.get(kind, 0) + 1
        print(f"  [{idx}] {label:<16} {code} {size:>9,} B → {kind}"
              f"{('｜' + extra) if extra else ''}｜末址 {final[:78]}")
    return tally, out


def shape(final, body, code):
    """把一次读数归成四种形状之一，并带上**这一族自己给的理由**（那串 error_code／error_msg）。"""
    if code == 403:
        return "硬 403", ""
    low = final.lower()
    if "website-login/error" in low:
        at = body.find("安全限制")
        return "安全限制页", (body[at:at + 60].replace("\n", " ") if at >= 0 else "")
    if "/404/sec" in low or "error_code=300031" in low:
        at = low.find("error_msg=")
        hint = ""
        for probe, say in (("300031", "当前笔记暂时无法浏览"), ("300012", "IP 存在风险")):
            if probe in low:
                hint = say
        return "sec 拒绝页", hint or (final[at:at + 60] if at >= 0 else "")
    if "/login" in low:
        return "登录壳页", ""
    if "noteDetailMap" in body:
        got = scraper._xiaohongshu_extras(body)
        return "真笔记", (f"标题={repr((got.get('title') or '')[:22])} "
                          f"正文={len(got.get('content') or '')} 字 "
                          f"图={len(got.get('images') or [])} 张 "
                          f"作者={repr(got.get('author'))[:16]}")
    return "其他", ""


print(f"这台机器 {__import__('socket').gethostname()}｜python{sys.version.split()[0]}｜"
      f"每条地址各打 {ROUNDS} 次")
echoes()
whole = {}
for i in range(1, ROUNDS + 1):
    tally, _ = one_round(i)
    for k, v in tally.items():
        whole[k] = whole.get(k, 0) + v
print("\n== 分布（三种地址 × %d 次合计）==" % ROUNDS)
for k, v in sorted(whole.items(), key=lambda kv: -kv[1]):
    print(f"  {k:<14} {v}")
print("\n判据（这台机器自己给自己）：")
print("  · 三种形状里只要**出现过一次「真笔记」**⇒ 静态 HTTP 这一路**不需要任何签名头**，")
print("    闸卡的就是出口身份／风控那一边，不是签名那一边；")
print("  · **一次都没有**「真笔记」⇒ 这一路本来就取不到，换住宅出口也白换（签名那一边）；")
print("  · 分布「不是全 5 中 5」（有对有错）⇒ 这一族的闸是概率性的，")
print("    任何「粘一条就能存图」的承诺都撑不住，连「住宅出口能解决」这一句也算。")
print("\n（这一把对现网零写：不碰数据库、不给黑名单记账）")
