"""移动出口连打 20 次：命中率会不会衰减（买／自建出口之前必须知道的数）。

跑法（本机；现网那台没有可用出口，跑了等于白跑）：
    cd backend && .venv/bin/python ../docs/工具/探-移动出口连打20次掉不掉.py

⚠ 这一把**只出网读 HTML**，不碰库、不给黑名单记账。

为什么先量这一枚：站长 10-19 16:1x 说「开始研究怎么获取国内移动出口 IP」，
而他真正要的东西不是一个"能通一次"的证据，是**这个出口能不能当服务用**。
三条只有连打才量得出来：① 命中率会不会随次数掉（掉＝这个 IP 很快被自己的流量刷污）；
② 一次抓取要几秒（决定 9 张图＋渲染那 30 秒预算够不够）；③ 失败是哪一种形状（登录壳／`sec` 拒绝／超时）。
上一把（§8.346）只打了 5 次：4 成 1 败——**5 次的分布撑不起"能不能当服务"这个判断**，这一把打 20 次。
"""
import re
import statistics
import sys
import time

sys.path.insert(0, ".")

import httpx  # noqa: E402

from app.services import scraper  # noqa: E402

# 带 `xsec_token` 的那一条完整分享址（短链跟出来的末址，§8.350 那张表里的第一行）。
# ⚠ 令牌是**分享那一刻铸的**：它会不会过期、多久过期，正是这一把要顺手量出来的东西之一。
SHARE = ("https://www.xiaohongshu.com/discovery/item/6ad40f01000000002203c359"
         "?xsec_source=app_share&xsec_token=CBUezgT0tf8spVt3PDlhdtEGqTI3urfUDyT55DCT5NpSA%3D")
SHORT = "https://xhslink.cn/o/9F1fAXNBL1I"
N = 20
GAP = 0.4  # 秒。刻意不并发：家用出口并发等于自己造一次突发流量，读数是脏的


def classify(final: str, html: str) -> str:
    low = final.lower()
    if "/404/sec" in low or "error_code=300031" in low:
        return "sec 拒绝"
    if "website-login/error" in low:
        return "安全限制"
    if "/login" in low:
        return "登录壳"
    note = scraper._xiaohongshu_extras(html)
    if note.get("content") or note.get("images"):
        return "真笔记"
    if "noteDetailMap" in html:
        return "store 空骨架"
    return "其他"


def fetch(url):
    t0 = time.time()
    cur = url
    with httpx.Client(follow_redirects=False, timeout=25, headers=scraper.HEADERS) as c:
        for _ in range(6):
            r = c.get(cur)
            if r.is_redirect:
                loc = r.headers.get("location", "")
                cur = loc if loc.startswith("http") else str(httpx.URL(cur).join(loc))
                continue
            return classify(cur, r.text), len(r.text), (time.time() - t0) * 1000, cur
    return "跟跳超限", 0, (time.time() - t0) * 1000, cur


def burst(label, url, n, gap):
    print(f"\n=== {label}｜连打 {n} 次、每次间隔 {gap} 秒")
    kinds, ms, sizes = [], [], []
    for i in range(1, n + 1):
        kind, size, dur, final = fetch(url)
        kinds.append(kind)
        ms.append(dur)
        sizes.append(size)
        # 只在前 6 次和每次"形状变了"的那一发打整行，其余打一行点，免得 20 行读数把关键行埋掉
        if i <= 6 or (kinds and kinds[-2:] and kind != kinds[-2]):
            print(f"  [{i:>2}] {kind:<10} {size:>9,} B {dur:>7.0f} ms")
        time.sleep(gap)
    hit = kinds.count("真笔记")
    print(f"  → 命中 {hit}/{n}｜形状分布 {sorted(set(kinds))}")
    print(f"  → 延迟 中位 {statistics.median(ms):.0f} ms｜最快 {min(ms):.0f}｜最慢 {max(ms):.0f}")
    print(f"  → 字节 中位 {int(statistics.median(sizes)):,} B（真笔记那一档应当是 68,000～69,000 B 那一带）")
    # 前半 vs 后半：衰减就藏在这里
    half = n // 2
    a, b = kinds[:half].count("真笔记"), kinds[half:].count("真笔记")
    print(f"  → 前半 {a}/{half}、后半 {b}/{n - half}"
          f"｜{'没有衰减迹象' if a == b else '前后不一致——这一格要写进结论，不许只报总数'}")
    return hit, n


print(f"这台机器 {__import__('socket').gethostname()}｜出口是谁，先看这一行：")
try:
    print("  " + " ".join(httpx.get("https://myip.ipip.net", timeout=12).text.split())[:120])
except Exception as exc:
    print(f"  出口回显打不通：{type(exc).__name__}")

# 第一把：直接打带令牌的分享址（我们跟完跳转之后真正请求的那一发）
burst("分享址·带 xsec_token", SHARE, N, GAP)
# 第二把：从短链进（用户粘进来的那一条，含跟跳），这一把才是"线上真实形状"
burst("短链·跟完跳转", SHORT, N, GAP)
# 第三把：把间隔抬到 3 秒再来一轮——如果"衰减"是真的，慢速那一轮的后半应当明显回血
burst("分享址·带令牌（慢速对照）", SHARE, 10, 3.0)

print("\n（这一把对现网零写：不碰数据库、不给黑名单记账；令牌原样在地址里，它何时失效也在这三把里）")
