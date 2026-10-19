"""那几族"读不到"的站，**正文与图地址到底在不在 HTML 字节里**——在＝解析器没覆盖，不在＝才轮到"拉起页面渲染"那一刀。

跑法（本机与现网各跑一次，同一把脚本、同一份代码）：
    本机  backend/.venv/bin/python docs/工具/诊断-0字那一族的HTML里有什么.py
    现网  ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/诊断-0字那一族的HTML里有什么.py

⚠ **这一把只读**：只用 httpx 打外网、只在内存里数命中，不碰数据库、不碰 Redis、
**一行都不写**。特别不要接 `ingest_tasks`：那里的 `note_site_failure()` 才是给黑名单记账的那一口，
误接一次就把 `xhslink.cn` 从 2 次刷成 3 次、当场把小红书自动拉黑（现网 10-19 现读就是 2 次）。

为什么单立这一把（站长 10-19 那句「能否根据 URL 拉起页面，无法获取图片时自动截图写进笔记」）：
装一个浏览器是这台机器上没做过的事（现量：chrome／chromium／firefox／playwright／wkhtmltoimage 全无），
而它到底能多取到什么，**不必装浏览器就能先量出来**——渲染相对静态 HTML 的增量只有两种：
① JS 跑完才出现的节点与属性；② JS 跑完才发的请求。**两种的静态痕迹就是"图地址／正文在不在字节里"**：
在字节里 ⇒ 我们的解析器没覆盖它，写一条取值规则就行，与浏览器无关；
真不在字节里 ⇒ 才是渲染那一刀的用武之地，那时再谈装不装。
"""
import asyncio
import re
import sys

sys.path.insert(0, ".")

import httpx  # noqa: E402

from app.services import scraper  # noqa: E402

# 每一条都是文档里真跑过的活链接（正址来自 `docs/方案-公众号贴图随笔记存档.md` 第十节那张表）。
# ⚠ 知乎那一条**正址没在文档里留下**（方案里写的是 `question/…/answer/…?share_code=…`，短码被省略号吃掉），
# 所以这里打的是站根——它测到的是"这一族对这台机器的门的形状"，不是他那一篇答案页。读数里照实标。
URLS = [
    ("公众号·图文型", "https://mp.weixin.qq.com/s/H2BANSW_U-Jjl1Ic_ZuZKA", "对照：这一族我们已经能存图"),
    ("公众号·相册型", "https://mp.weixin.qq.com/s/1FOoWv45lty7r7MZ88V9aQ", "对照：图在 JS 的 cdn_url 里，不用执行 JS"),
    ("小红书·短链", "https://xhslink.cn/o/9F1fAXNBL1I", "现网拍乙：保持读不到；本机可读"),
    ("微博·正文页", "https://weibo.com/1649679354/5353881820204840", "实测 200＋Sina Visitor System、正文 0 字"),
    ("微博·移动版同形", "https://m.weibo.cn/status/5353881820204840", "同一条微博的另一个入口，看它要不要执行 JS"),
    ("知乎·站根", "https://www.zhihu.com/", "他那篇答案的正址没在文档里，这里只量这一族的门"),
]

# 图地址的**通用**形状：不列域名表（方案第十一节那条"按域名建白名单是错的方向"在这儿同样成立）。
IMG_URL = re.compile(r"""https?://[^\s"'<>()\\]+?\.(?:jpg|jpeg|png|webp|gif|avif|bmp)""", re.I)
# 页面里内联状态数据的常见几种名字——命中只说明"这一族把数据塞在脚本里"，取不取得到另说。
STATE_KEYS = ("__INITIAL_STATE__", "__NEXT_DATA__", "window.__NUXT__", "__NUXT_DATA__",
              "SHARE_DATA", "cgiDataNew", "picture_page_info_list", "__waf_", "articleData")
# 壳页／闸门的标记：命中它就说明拦的是身份，不是渲染。
GATE_KEYS = ("zse-ck", "Sina Visitor System", "visitor_shft", "passport.weibo",
             "qrcode", "扫码", "请先登录", "login", "verify", "验证码", "滑动验证")


def hits(html, keys):
    return {k: html.count(k) for k in keys if html.count(k)}


def img_hosts(html):
    """字节里出现过的图片地址，按主机名归一下，并各给一条样本（截到 96 字符）。"""
    out = {}
    for u in IMG_URL.findall(html):
        host = (u.split("//", 1)[-1].split("/", 1)[0]).lower()
        out.setdefault(host, []).append(u)
    return {h: (len(v), v[0][:96]) for h, v in out.items()}


def chain(url):
    """自己跟一遍跳转（与 `_fetch_and_parse` 同形：生产头、不自动跟、每跳记账）。"""
    hops = []
    with httpx.Client(follow_redirects=False, timeout=30, headers=scraper.HEADERS) as c:
        current = url
        for _ in range(6):
            r = c.get(current)
            if r.is_redirect:
                loc = r.headers.get("location", "")
                nxt = loc if loc.startswith("http") else str(httpx.URL(current).join(loc))
                hops.append(f"{r.status_code} {current[:70]} -> {nxt[:70]}")
                current = nxt
                continue
            hops.append(f"{r.status_code} {current[:70]}｜{len(r.content)} B")
            ct = (r.headers.get("content-type") or "")[:40]
            return current, r.text, hops, ct
    return current, "", hops, ""


def one(label, url, note):
    print(f"\n=== {label}｜{note}")
    final, html, hops, ctype = chain(url)
    for h in hops:
        print(f"  跳转  {h}")
    print(f"  落点  {final[:110]}｜{len(html):,} B｜{ctype}")
    if not html:
        print("  !! 没有可读正文（跟跳没跟到 200 的 HTML 页），后面的命中全部无从谈起")
        return

    # ① 现管线读到什么（`_fetch_and_parse` 是纯函数：不写库、不记账。它是协程，必须 asyncio.run）
    try:
        parsed = asyncio.run(scraper._fetch_and_parse(url))
        print(f"  现管线 标题={repr((parsed.get('title') or '')[:30])} "
              f"正文={len(parsed.get('content') or '')} 字 "
              f"图={len(parsed.get('images') or [])} 张 "
              f"作者={repr(parsed.get('author'))[:24]}")
    except Exception as exc:
        print(f"  现管线 抛了：{type(exc).__name__}｜{exc}")
        parsed = None

    # ② 字节里有没有正文（trafilatura 那一份是管线吃的；og／description 是它没吃的两条静态出口）
    og_t = re.search(r'property="og:title"[^>]*content="([^"]*)"', html) or \
        re.search(r'content="([^"]*)"[^>]*property="og:title"', html)
    og_i = re.search(r'property="og:image"[^>]*content="([^"]*)"', html) or \
        re.search(r'content="([^"]*)"[^>]*property="og:image"', html)
    desc = re.search(r'name="description"[^>]*content="([^"]*)"', html)
    print(f"  静态文字出口 og:title={repr((og_t.group(1) if og_t else '')[:40])} "
          f"meta description={len(desc.group(1)) if desc else 0} 字")

    # ③ 字节里有没有图地址——这一枚才是这一把尺子的答案
    imgs = img_hosts(html)
    n_img = sum(v[0] for v in imgs.values())
    print(f"  字节里的图地址 {n_img} 条／{len(imgs)} 个主机名｜og:image={'有' if og_i else '无'}")
    for h, (cnt, sample) in sorted(imgs.items(), key=lambda kv: -kv[1][0])[:5]:
        print(f"    {h} ×{cnt}  例：{sample}")
    print(f"  HTML 里的 <img> 标签 {html.count('<img')} 枚｜data-src {html.count('data-src')} 处｜"
          f"srcset {html.count('srcset')} 处｜background-image {html.count('background-image')} 处")
    st = hits(html, STATE_KEYS)
    if st:
        print(f"  内联状态命中 {st}")
    gt = hits(html, GATE_KEYS)
    print(f"  闸门/壳页命中 {gt if gt else '无'}")

    # ④ 判定（读数摆在上面，这里只把它们合起来说一句**这把尺子撑得住**的话）
    # ⚠ 两枚计数**不能混用**：`n_img` 那一条只认带图片扩展名的地址，小红书那种没尾巴的（
    # `sns-webpic…/1040g2…`）会被数成 0，而同一趟现管线明明取到 5 张 ⇒ **判"有没有图地址"以现管线那枚为准**，
    # `n_img` 只用来说"扩展名式扫描能不能看见"。这条是我自己踩过的坑（第一趟就靠它下错过判定）。
    body = len((parsed or {}).get("content") or "")
    got = len((parsed or {}).get("images") or [])
    gate_url = any(k in final.lower() for k in ("login", "signin", "visitor", "passport", "verify"))
    if got > 0:
        verdict = (f"现管线**已经取到 {got} 张** ⇒ 图地址就在这批字节里（我这把按扩展名只数到 {n_img} 条，"
                   f"没数到的那族是地址没有文件尾巴）⇒ **渲染加不了东西**")
    elif gt or gate_url:
        verdict = ("静态落点是壳页／闸门（这一族的 `n_img` 里混的是页面皮上的图标，不许当正文图读）"
                   "⇒ **这一把判不了渲染有没有用**，要另一把：`诊断-浏览器渲染比静态多什么.mjs`")
    elif body == 0:
        verdict = "字节里没有正文也没有图地址 ⇒ 只有执行 JS 才可能拿到，**渲染这一刀的用武之地**"
    elif n_img > 0:
        verdict = "字节里有正文也有图地址、现管线取到 0 张 ⇒ **解析器没覆盖，不需要浏览器**"
    else:
        verdict = "字节里有正文、没数到图地址 ⇒ 文字这条通；图要么本就内联（`data:`），要么要靠渲染"
    print(f"  ⇒ 判定：{verdict}")


print(f"这台机器 {__import__('socket').gethostname()} "
      f"python{sys.version.split()[0]}｜httpx {httpx.__version__}")
for label, url, note in URLS:
    try:
        one(label, url, note)
    except Exception as exc:
        print(f"\n=== {label}\n  !! 这把没跑成：{type(exc).__name__}｜{exc}")
print("\n（这一把对现网零写：不碰数据库、不给黑名单记账）")
