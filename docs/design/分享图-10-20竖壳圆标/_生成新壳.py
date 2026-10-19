#!/usr/bin/env python3
"""分享封面第二稿：正向 iPhone 外壳（去纸卡、只露 2/3、像从画面底边升上来）
＋ 左下六枚圆形标 ＋ 那句话按现网字号排。

字号一律不新造：现网这张图只有四档 —— 88（宋体大字）／25（副行）／15（kicker）／14（域名）。
「仅需15秒｜拍照截图网页转笔记」按 88 排：一行排满要 9×88＝792px，而左列只有 578px，
所以只能折三行（仅需15秒／拍照截图／网页转笔记），这是"不许缩字号"逼出来的折法，不是我想换结构。

外壳几何按 iPhone 15 Pro 的真实比例推：机身:屏幕 圆角 78:70、边框 8px、
灵动岛＝屏宽 32%×屏高 4.37%、状态条＝44pt 占屏高 5.16%。
状态条那 63px 用实拍导航条自己那层色 (34,37,44) 续上去，不造假的时间与信号。
"""
import re
from pathlib import Path

D = Path("/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-20竖壳圆标")
OLD = Path("/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-19平台logo")
SHOT = "../分享图-10-19平台logo/实拍-笔记列表页.jpg"

# ---------- 外壳几何 ----------
BW, BH = 566, 1240      # 机身：宽 × 全高
VIS = round(BH * 2 / 3)  # 露出 2/3
TOP = 1024 - VIS         # 机身顶边 y
LEFT = 1280 - 40 - BW    # 右边距 40
BEZ = 8
SW, SH = BW - 2 * BEZ, BH - 2 * BEZ          # 屏幕 550 × 1224
R_BODY, R_SCR = 78, 70
ISL_W, ISL_H, ISL_T = round(SW * .32), round(SH * .0437), round(SH * .0129)
ISL_L = (SW - ISL_W) // 2
STAT_H = round(SH * 44 / 852)
NAV = "#22252C"

# ---------- 六枚圆标 ----------
ORDER = ["小红书", "公众号", "微博", "抖音", "视频号", "知乎"]
GLYPH = {
    "小红书": ("simple-icons-xiaohongshu.svg", "#FF2442"),
    "公众号": ("simple-icons-wechat.svg", "#07C160"),
    "微博": ("cib-sina-weibo.svg", "#E6162D"),
    "抖音": ("simple-icons-tiktok.svg", "#000000"),
    "视频号": ("ri-wechat-channels-fill.svg", "#000000"),
    "知乎": ("ri-zhihu-fill.svg", "#0084FF"),
}
APPICON = {"小红书": "小红书-512.png", "公众号": "公众号-512.png", "微博": "微博-512.png",
           "抖音": "抖音-512.png", "视频号": None, "知乎": "知乎-512.png"}


def inner(fn, fill):
    s = (OLD / "图标" / fn).read_text()
    vb = re.search(r'viewBox="([^"]+)"', s).group(1)
    p = "".join(re.findall(r'<path[^>]*/>', s))
    return f'<svg viewBox="{vb}" width="100%" height="100%">{re.sub("fill=.currentColor.", f'fill="{fill}"', p)}</svg>'


def circles(sz, pad):
    """品牌色圆底 + 官方白色字形。"""
    out = []
    for n in ORDER:
        fn, bg = GLYPH[n]
        out.append(f'<div class="cl"><div class="bd" style="width:{sz}px;height:{sz}px;'
                   f'background:{bg};padding:{pad}px">{inner(fn, "#FFFFFF")}</div>'
                   f'<div class="nm">{n}</div></div>')
    return "".join(out)


def realicons(sz):
    """真应用图标切圆；视频号没有独立 App，用黑圆底补同一枚形。"""
    out = []
    for n in ORDER:
        f = APPICON[n]
        if f:
            cell = f'<img class="bd" style="width:{sz}px;height:{sz}px" src="圆标/{f}">'
        else:
            fn, bg = GLYPH[n]
            cell = (f'<div class="bd" style="width:{sz}px;height:{sz}px;background:{bg};'
                    f'padding:{round(sz * 0.26)}px">{inner(fn, "#FFFFFF")}</div>')
        out.append(f'<div class="cl">{cell}<div class="nm">{n}</div></div>')
    return "".join(out)


def shell():
    return f"""
<div class="dev">
  <div class="btn" style="left:-3px;top:{round(BH*.100)}px;height:{round(BH*.025)}px"></div>
  <div class="btn" style="left:-3px;top:{round(BH*.183)}px;height:{round(BH*.071)}px"></div>
  <div class="btn" style="left:-3px;top:{round(BH*.265)}px;height:{round(BH*.071)}px"></div>
  <div class="btn" style="right:-3px;top:{round(BH*.217)}px;height:{round(BH*.115)}px"></div>
  <div class="body"><div class="scr">
    <div class="stat" style="height:{STAT_H}px"></div>
    <div class="isl" style="left:{ISL_L}px;top:{ISL_T}px;width:{ISL_W}px;height:{ISL_H}px"></div>
    <img class="shot" style="top:{STAT_H}px" src="{SHOT}">
  </div></div>
</div>"""


BASE = f"""
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ width:1280px; height:1024px; overflow:hidden; }}
@font-face {{ font-family:'Playfair'; src:url('../分享图-20261015/playfair-display-latin-400-normal.woff2') format('woff2'); }}
@font-face {{ font-family:'Playfair'; src:url('../分享图-20261015/playfair-display-latin-500-normal.woff2') format('woff2'); font-weight:500; }}
.card {{ position:relative; width:1280px; height:1024px; background:#E9E7DC; color:#14161A;
  font-family:'Songti SC','STSong',serif; overflow:hidden; }}
.kick {{ position:absolute; left:96px; top:88px; font-family:'Playfair'; font-weight:500; font-size:15px;
  letter-spacing:.42em; color:#C0552F; }}
.hair {{ position:absolute; left:96px; top:128px; width:64px; height:2px; background:#14161A; }}
.h1 {{ position:absolute; left:96px; top:172px; font-size:88px; line-height:1.22; font-weight:700;
  letter-spacing:-.015em; }}
.sub {{ position:absolute; left:98px; font-size:25px; letter-spacing:.16em; color:rgba(20,22,26,.56);
  white-space:nowrap; }}
.sub i {{ font-style:normal; color:rgba(20,22,26,.26); padding:0 12px; }}
.dom {{ position:absolute; left:98px; bottom:34px; font-family:'Playfair'; font-size:14px;
  letter-spacing:.34em; color:rgba(20,22,26,.38); }}
.cap {{ position:absolute; left:98px; font-size:25px; letter-spacing:.16em; color:rgba(20,22,26,.56);
  white-space:nowrap; }}
.logos {{ position:absolute; left:96px; display:flex; gap:22px 48px; flex-wrap:wrap; width:420px; }}
.cl {{ width:96px; text-align:center; }}
.bd {{ border-radius:50%; display:flex; align-items:center; justify-content:center; }}
.bd svg {{ width:100%; height:100%; }}
.nm {{ font-size:15px; letter-spacing:.08em; color:rgba(20,22,26,.62); margin-top:10px; }}
.dev {{ position:absolute; left:{LEFT}px; top:{TOP}px; width:{BW}px; height:{BH}px; }}
.body {{ position:absolute; inset:0; border-radius:{R_BODY}px;
  background:linear-gradient(146deg,#4a4e57 0%,#20232a 26%,#14161b 54%,#2c2f37 78%,#565b66 100%);
  box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.22), inset 0 0 0 5px rgba(0,0,0,.55); }}
.btn {{ position:absolute; width:4px; border-radius:2px; background:linear-gradient(90deg,#5a5f69,#33373f); }}
.scr {{ position:absolute; left:{BEZ}px; top:{BEZ}px; width:{SW}px; height:{SH}px;
  border-radius:{R_SCR}px; overflow:hidden; background:{NAV}; }}
.stat {{ position:absolute; left:0; top:0; width:100%; background:{NAV}; }}
.isl {{ position:absolute; border-radius:999px; background:#000; }}
.shot {{ position:absolute; left:0; width:{SW}px; display:block; }}
"""

MEASURE = """
<script>
function R(s){var e=document.querySelector(s);if(!e)return null;var r=e.getBoundingClientRect();
  return [r.left,r.top,r.right,r.bottom];}
function O(a,b){if(!a||!b)return '—';
  return [(Math.min(a[2],b[2])-Math.max(a[0],b[0])).toFixed(1),
          (Math.min(a[3],b[3])-Math.max(a[1],b[1])).toFixed(1)].join('×');}
function F(a){return a?a.map(function(v){return v.toFixed(1)}).join(','):'—';}
window.addEventListener('load',function(){
  var L=R('.logos'),C=R('.cap'),G=R('.dev'),S=R('.sub'),H=R('.h1'),M=R('.dom');
  var cl=[].map.call(document.querySelectorAll('.bd'),function(e){var r=e.getBoundingClientRect();
    return [r.left,r.top,r.right,r.bottom];});
  var o=[];
  o.push('机身 '+F(G)+' 全高 '+(G[3]-G[1]).toFixed(0)+' 露出 '+(1024-G[1]).toFixed(0)+
         ' ⇒ 露出比 '+((1024-G[1])/(G[3]-G[1])).toFixed(3));
  o.push('圆标 首 '+F(cl[0])+' 末 '+F(cl[5])+' 直径 '+(cl[0][2]-cl[0][0]).toFixed(0));
  o.push('logos '+F(L)+'  cap '+F(C)+'  sub '+F(S)+'  h1 '+F(H)+'  dom '+F(M));
  o.push('压到机身? sub∩dev '+O(S,G)+' | h1∩dev '+O(H,G)+' | logos∩dev '+O(L,G)+' | cap∩dev '+O(C,G));
  o.push('彼此: cap∩logos '+O(C,L)+' | dom∩cap '+O(M,C)+' | nm∩下一排 '+O(cl[0],cl[3]));
  o.push('出界 右 '+(G[2]>1280||L[2]>1280||C[2]>1280)+' 下 '+(C[3]>1024||L[3]>1024||M[3]>1024)+
         ' 左列余宽 '+(G[0]-96).toFixed(0));
  document.title='M|'+o.join(' | ');
});
</script>
"""


def page(body):
    return ('<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>' + BASE
            + "</style></head><body><div class=\"card\">" + body + "</div>" + MEASURE
            + "</body></html>")


KICK = '<div class="kick">TUMARK · 图麦笔记</div><div class="hair"></div>'
SUB = ('<div class="sub" style="top:528px">16 语整理成中文<i>—</i>10 套卡片<i>—</i>5 种心情</div>')
DOM = '<div class="dom">agentsbin.cn</div>'
LOGO_TOP = 620
CAP_TOP = LOGO_TOP + 276 + 20

# 甲：三行 88px + 品牌色圆底白字形
甲 = page(KICK
          + '<div class="h1">仅需15秒<br>拍照截图<br>网页转笔记</div>' + SUB
          + f'<div class="logos" style="top:{LOGO_TOP}px">{circles(96, 26)}</div>'
          + f'<div class="cap" style="top:{CAP_TOP}px">支持以上平台的图文</div>'
          + DOM + shell())
(D / "甲-圆底白字形.html").write_text(甲, encoding="utf-8")

# 乙：同一版式，圆里换成真应用图标
乙 = page(KICK
          + '<div class="h1">仅需15秒<br>拍照截图<br>网页转笔记</div>' + SUB
          + f'<div class="logos" style="top:{LOGO_TOP}px">{realicons(96)}</div>'
          + f'<div class="cap" style="top:{CAP_TOP}px">支持以上平台的图文</div>'
          + DOM + shell())
(D / "乙-真应用图标切圆.html").write_text(乙, encoding="utf-8")

# 丙：那句话走两档现网字号（88 一行 + 25 一行），机身可以更大
丙 = page(KICK
          + '<div class="h1" style="top:196px">仅需15秒</div>'
          + '<div class="sub" style="top:320px">拍照截图网页转笔记</div>'
          + '<div class="sub" style="top:372px">16 语整理成中文<i>—</i>10 套卡片<i>—</i>5 种心情</div>'
          + f'<div class="logos" style="top:{LOGO_TOP}px">{circles(96, 26)}</div>'
          + f'<div class="cap" style="top:{CAP_TOP}px">支持以上平台的图文</div>'
          + DOM + shell())
(D / "丙-那句走两档字号.html").write_text(丙, encoding="utf-8")

print(f"机身 {BW}x{BH} 顶 y={TOP} 露出 {VIS}（{VIS/BH:.3f}） x {LEFT}..{LEFT+BW}")
print(f"屏幕 {SW}x{SH} 边框 {BEZ} 圆角 {R_BODY}/{R_SCR} 岛 {ISL_W}x{ISL_H}@{ISL_L},{ISL_T} 状态条 {STAT_H}")
print(f"logos top {LOGO_TOP} 高 276 → {LOGO_TOP+276}   cap top {CAP_TOP}")
