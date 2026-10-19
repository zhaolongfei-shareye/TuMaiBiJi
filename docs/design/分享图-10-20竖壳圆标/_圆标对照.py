#!/usr/bin/env python3
"""六枚圆形标对照：App Store 官方应用图标切圆 vs 品牌色圆底＋官方白色字形。

前五枚的圆底图取自 Apple CDN 上的官方应用图标（512×512，公众号＝「公众号助手」com.tencent.mp）。
视频号没有独立 App，只能用官方字形（remixicon wechat-channels-fill）垫黑圆底。
"""
import re
from pathlib import Path

D = Path("/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-20竖壳圆标")
OLD = Path("/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-19平台logo")
(D / "圆标").mkdir(parents=True, exist_ok=True)
for f in (OLD / "圆标").glob("*.png"):
    t = D / "圆标" / f.name
    if not t.exists():
        t.write_bytes(f.read_bytes())

GLYPH = {  # 名称 → (svg 文件, 品牌色)
    "小红书": ("simple-icons-xiaohongshu.svg", "#FF2442"),
    "公众号": ("simple-icons-wechat.svg", "#07C160"),
    "微博": ("cib-sina-weibo.svg", "#E6162D"),
    "抖音": ("simple-icons-tiktok.svg", "#161823"),
    "视频号": ("ri-wechat-channels-fill.svg", "#161823"),
    "知乎": ("ri-zhihu-fill.svg", "#0084FF"),
}
ICON = {"小红书": "小红书-512.png", "公众号": "公众号-512.png", "微博": "微博-512.png",
        "抖音": "抖音-512.png", "视频号": None, "知乎": "知乎-512.png"}
ORDER = ["小红书", "公众号", "微博", "抖音", "视频号", "知乎"]


def glyph(name, pad=22):
    fn, colour = GLYPH[name]
    s = (OLD / "图标" / fn).read_text()
    vb = re.search(r'viewBox="([^"]+)"', s).group(1)
    inner = "".join(re.findall(r'<path[^>]*/>', s))
    inner = re.sub(r'fill="currentColor"', 'fill="#FFFFFF"', inner)
    bg = {"小红书": "#FF2442", "公众号": "#07C160", "微博": "#E6162D",
          "抖音": "#000000", "视频号": "#000000", "知乎": "#0084FF"}[name]
    return (f'<div class="g" style="background:{bg};padding:{pad}px">'
            f'<svg viewBox="{vb}" width="100%" height="100%">{inner}</svg></div>')


def cell(html, label):
    return f'<div class="c">{html}<div class="lb">{label}</div></div>'


S = 96
rowA = "".join(cell(f'<img class="r" src="圆标/{ICON[n]}">' if ICON[n] else glyph(n, 24).replace(
    'class="g"', 'class="g r"'), n) for n in ORDER)
rowB = "".join(cell(glyph(n), n) for n in ORDER)
rowC = "".join(cell(glyph(n).replace('padding:22px', 'padding:30px')
                   .replace('class="g"', 'class="g r"'), n) for n in ORDER)

html = f"""<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ width:1180px; background:#E9E7DC; font-family:'Songti SC','STSong',serif; color:#14161A; padding:36px 44px; }}
h1 {{ font-size:26px; font-weight:700; }}
p.lead {{ font-size:14px; line-height:1.8; color:rgba(20,22,26,.6); margin:8px 0 4px; }}
h3 {{ font-size:15px; font-weight:400; letter-spacing:.14em; color:rgba(20,22,26,.6); margin:26px 0 14px; }}
.row {{ display:flex; gap:30px; }}
.c {{ width:96px; text-align:center; }}
.r {{ width:{S}px; height:{S}px; display:block; }}
img.r {{ border-radius:50%; object-fit:cover; }}
.g.r {{ border-radius:50%; }}
.lb {{ font-size:13px; margin-top:9px; color:rgba(20,22,26,.6); letter-spacing:.06em; }}
</style></head><body>
<h1>六枚圆形标 · 三种取法</h1>
<p class="lead">① 圆＝Apple CDN 上的官方应用图标切圆（公众号取「公众号助手」com.tencent.mp）；
视频号没有独立 App，那一格只能用字形。②③＝品牌色圆底垫官方白色字形，六枚成套、不依赖有没有 App。</p>
<h3>① 官方应用图标切圆（视频号缺独立 App，用字形补）</h3><div class="row">{rowA}</div>
<h3>② 品牌色圆底 ＋ 官方白色字形（六枚成套）</h3><div class="row">{rowB}</div>
<h3>③ 同②，字形再收一档留更多圆底</h3><div class="row">{rowC}</div>
</body></html>"""
(D / "圆标对照.html").write_text(html, encoding="utf-8")
print("生成", D / "圆标对照.html")
