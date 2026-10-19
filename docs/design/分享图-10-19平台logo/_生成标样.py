#!/usr/bin/env python3
"""生成六枚平台标的对照小样（三种画法各一排），先肉眼挑定再进正式效果图。

标全部取自 Iconify 的官方矢量：simple-icons / remixicon / chartist-brand / font-awesome / thesvg。
自己不描一笔 —— 上一轮手指那件事已经定过规矩。
"""
import re
from pathlib import Path

D = Path("/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-19平台logo")
IC = D / "图标"

# 名称 → (文件, 品牌色, 备选文件)
MARKS = [
    ("小红书", "simple-icons-xiaohongshu.svg", "#FF2442"),
    ("公众号", "simple-icons-wechat.svg", "#07C160"),
    ("微博", "cib-sina-weibo.svg", "#E6162D"),
    ("抖音", "simple-icons-tiktok.svg", "#161823"),
    ("视频号", "ri-wechat-channels-fill.svg", "#161823"),
    ("知乎", "simple-icons-zhihu.svg", "#0084FF"),
]
ALT = {"微博": "fa-brands-weibo.svg", "公众号": "ri-wechat-fill.svg",
       "知乎": "ri-zhihu-fill.svg", "小红书": "thesvg-color-xiaohongshu.svg"}


def body(fn, fill=None):
    s = (IC / fn).read_text()
    vb = re.search(r'viewBox="([^"]+)"', s).group(1)
    inner = "".join(re.findall(r'<path[^>]*/>', s))
    inner = re.sub(r'fill="currentColor"', f'fill="{fill}"' if fill else 'fill="currentColor"', inner)
    return vb, inner


def cell(name, fn, colour, size=44, tile=None, label=True):
    vb, inner = body(fn, colour)
    bg = f"background:{tile};" if tile else ""
    lab = f'<div class="lb">{name}</div>' if label else ""
    return (f'<div class="c"><div class="t" style="width:{size}px;height:{size}px;{bg}">'
            f'<svg viewBox="{vb}" width="100%" height="100%">{inner}</svg></div>{lab}</div>')


rows = []
# 排一：品牌色实标，直接落在纸上
rows.append(('① 品牌色实标（无底）', "".join(cell(n, f, c) for n, f, c in MARKS)))
# 排二：墨色单色，全部退成纸墨
rows.append(('② 墨色单色 #14161A（无底）', "".join(cell(n, f, "#14161A") for n, f, c in MARKS)))
# 排三：品牌色 + 白瓷圆角底
rows.append(('③ 品牌色 + 白瓷圆角底', "".join(cell(n, f, c, tile="#FFFFFF") for n, f, c in MARKS)))
# 排四：另一套矢量源，核对形状是否同一枚
rows.append(('④ 另一来源同标（微博/公众号/知乎/小红书）',
             "".join(cell(n, ALT[n], c) for n, c in [("微博", "#E6162D"), ("公众号", "#07C160"),
                                                     ("知乎", "#0084FF"), ("小红书", "#FF2442")])))

html = f"""<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ width:1120px; background:#E9E7DC; font-family:'Songti SC','STSong',serif; color:#14161A; padding:34px 40px; }}
h3 {{ font-size:15px; font-weight:400; letter-spacing:.14em; color:rgba(20,22,26,.6); margin:26px 0 12px; }}
.row {{ display:flex; gap:34px; align-items:flex-start; }}
.c {{ display:flex; flex-direction:column; align-items:center; gap:9px; width:88px; }}
.t {{ display:flex; align-items:center; justify-content:center; border-radius:14px; }}
.lb {{ font-size:14px; letter-spacing:.06em; color:rgba(20,22,26,.62); }}
</style></head><body>
<h1 style="font-size:22px;font-weight:700;letter-spacing:-.01em">六枚平台标 · 矢量来源与三种画法</h1>
<p style="font-size:14px;color:rgba(20,22,26,.55);margin-top:8px">全部取自 Iconify 官方矢量（simple-icons / remixicon / chartist-brand / thesvg）。抖音与 TikTok 同一枚音符标，这里按抖音的黑＋青＋红处理。</p>
{"".join(f'<h3>{t}</h3><div class="row">{b}</div>' for t, b in rows)}
</body></html>"""
(D / "标样.html").write_text(html, encoding="utf-8")
print("生成", D / "标样.html")
