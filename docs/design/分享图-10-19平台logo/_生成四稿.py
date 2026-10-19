#!/usr/bin/env python3
"""生成分享封面这一轮的三张效果图：

甲  logo 两排放右下（手机组缩小上抬，腾出右下那条带）
乙  手机组不动，logo 两排放左下空档
丁  另一种读法——把「仅需15秒 | 拍照截图网页转笔记」当图上第一行

六枚标全部内联 Iconify 官方矢量，自己不描一笔。
量取自报挂在 document.title 上，由 _出图.py 用 --dump-dom 读回。
"""
import re
from pathlib import Path

D = Path("/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-19平台logo")
IC = D / "图标"

# 名称 / 矢量文件 / 品牌色 / 墨色档
MARKS = [
    ("小红书", "simple-icons-xiaohongshu.svg", "#FF2442", "#14161A"),
    ("公众号", "simple-icons-wechat.svg", "#07C160", "#14161A"),
    ("微博", "cib-sina-weibo.svg", "#E6162D", "#14161A"),
    ("抖音", "simple-icons-tiktok.svg", "#161823", "#14161A"),
    ("视频号", "ri-wechat-channels-fill.svg", "#161823", "#14161A"),
    ("知乎", "ri-zhihu-fill.svg", "#0084FF", "#14161A"),
]

BASE = """
* { margin:0; padding:0; box-sizing:border-box; }
body { width:1280px; height:1024px; overflow:hidden; }
@font-face { font-family:'Playfair'; src:url('../分享图-20261015/playfair-display-latin-400-normal.woff2') format('woff2'); font-weight:400; }
@font-face { font-family:'Playfair'; src:url('../分享图-20261015/playfair-display-latin-500-normal.woff2') format('woff2'); font-weight:500; }
.card { position:relative; width:1280px; height:1024px; background:#E9E7DC; color:#14161A;
  font-family:'Songti SC','STSong',serif; overflow:hidden; }
.kick { position:absolute; left:96px; top:88px; font-family:'Playfair'; font-weight:500; font-size:15px;
  letter-spacing:.42em; color:#C0552F; }
.hair { position:absolute; left:96px; top:128px; width:64px; height:2px; background:#14161A; }
.h1 { position:absolute; left:96px; top:172px; width:660px; font-size:88px; line-height:1.22;
  font-weight:700; letter-spacing:-.015em; }
.sub { position:absolute; left:98px; top:434px; font-size:25px; letter-spacing:.16em;
  color:rgba(20,22,26,.56); white-space:nowrap; }
.sub i { font-style:normal; color:rgba(20,22,26,.26); padding:0 12px; }
.dom { position:absolute; left:98px; bottom:74px; font-family:'Playfair'; font-size:14px;
  letter-spacing:.34em; color:rgba(20,22,26,.38); }
.grp { position:absolute; }
.grp img { width:100%; height:100%; display:block; }
.logos { position:absolute; display:grid; grid-template-columns:repeat(3, auto);
  justify-content:space-between; align-content:space-between; }
.m { display:flex; align-items:center; justify-content:center; }
.cap { position:absolute; font-size:17px; letter-spacing:.16em; color:rgba(20,22,26,.55); white-space:nowrap; }
"""


def svg(fn, colour):
    s = (IC / fn).read_text()
    vb = re.search(r'viewBox="([^"]+)"', s).group(1)
    inner = "".join(re.findall(r'<path[^>]*/>', s))
    inner = re.sub(r'fill="currentColor"', f'fill="{colour}"', inner)
    return f'<svg viewBox="{vb}" width="100%" height="100%">{inner}</svg>'


def logos(left, top, size, colgap, rowgap, ink=False):
    """两排三枚。返回 (HTML, 块宽, 块高)。"""
    k = 3 if ink else 2
    cells = "".join(f'<div class="m" style="width:{size}px;height:{size}px">'
                    f'{svg(m[1], m[k])}</div>' for m in MARKS)
    w = 3 * size + 2 * colgap
    h = 2 * size + rowgap
    st = f'left:{left}px;top:{top}px;width:{w}px;height:{h}px;gap:{rowgap}px {colgap}px;'
    return f'<div class="logos" style="{st}">{cells}</div>', w, h


MEASURE = """
<script>
function R(sel){var el=document.querySelector(sel);if(!el)return null;
  var r=el.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom];}
function O(a,b){if(!a||!b)return null;
  return [(Math.min(a[2],b[2])-Math.max(a[0],b[0])).toFixed(1),
          (Math.min(a[3],b[3])-Math.max(a[1],b[1])).toFixed(1)].join('×');}
function F(a){return a?a.map(function(v){return v.toFixed(1)}).join(','):'—';}
window.addEventListener('load',function(){
  var L=R('.logos'), C=R('.cap'), G=R('.grp'), S=R('.sub'), H=R('.h1'), M=R('.dom');
  var ms=[].map.call(document.querySelectorAll('.m'),function(el){var r=el.getBoundingClientRect();
    return [r.left,r.top,r.right,r.bottom];});
  var first=ms[0], last=ms[ms.length-1];
  var out=[];
  out.push('logos '+F(L));
  out.push('首枚 '+F(first)+' 末枚 '+F(last)+' 单枚 '+(first[2]-first[0]).toFixed(1)+'x'+(first[3]-first[1]).toFixed(1));
  out.push('cap '+F(C));
  out.push('grp '+F(G));
  out.push('重叠 logos∩grp '+O(L,G)+' | cap∩logos '+O(C,L)+' | cap∩grp '+O(C,G)+' | h1∩grp '+O(H,G)+' | sub∩grp '+O(S,G)+' | dom∩cap '+O(M,C));
  out.push('出界 '+(L[2]>1280||C[2]>1280||L[3]>1024||C[3]>1024)+' 右下留白 '+(1280-C[2]).toFixed(0)+','+(1024-C[3]).toFixed(0));
  document.title='M|'+out.join(' | ');
});
</script>
"""


def card(inner):
    return ('<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>'
            + BASE + "</style></head><body><div class=\"card\">" + inner
            + "</div>" + MEASURE + "</body></html>")


TEXT_LEFT = ('<div class="kick">TUMARK · 图麦笔记</div><div class="hair"></div>'
             '<div class="h1">看到好内容，<br>随手记下来。</div>'
             '<div class="sub">16 语整理成中文<i>—</i>10 套卡片<i>—</i>5 种心情</div>'
             '<div class="dom">agentsbin.cn</div>')
IMG = '组-手机与纸卡-列表页.png'
CAPTION = '支持以上平台的图文'

# ---------- 甲：手机组 600×794 停在 top 56，logo 与那句压右下 ----------
# top 不能再抬：抬到 24 时纸卡那个上角会顶到 16 语那一行的下沿（量出来 468 vs 450）。
GA_W, GA_H, GA_TOP = 600, 794, 56
GA_BLOCK = 3 * 44 + 2 * 50          # 232
lgA, wA, hA = logos(1236 - GA_BLOCK, 866, 44, 50, 18)
capA_left = 1236 - GA_BLOCK + (GA_BLOCK - 177.5) / 2
甲 = card(TEXT_LEFT
          + f'<div class="grp" style="right:44px;top:{GA_TOP}px;width:{GA_W}px;height:{GA_H}px"><img src="{IMG}"></div>'
          + lgA
          + f'<div class="cap" style="left:{capA_left:.0f}px;top:986px">{CAPTION}</div>')
(D / "甲-logo右下.html").write_text(甲, encoding="utf-8")

# ---------- 乙：手机组原样，logo 压左下空档 ----------
lgB, wB, hB = logos(98, 548, 40, 42, 18)
乙 = card(TEXT_LEFT
          + f'<div class="grp" style="right:48px;top:56px;width:720px;height:953px"><img src="{IMG}"></div>'
          + lgB
          + f'<div class="cap" style="left:98px;top:{548 + hB + 20}px">{CAPTION}</div>')
(D / "乙-logo左下.html").write_text(乙, encoding="utf-8")

# ---------- 丁：那句话当图上第一行 ----------
lgD, wD, hD = logos(1236 - GA_BLOCK, 866, 44, 50, 18)
丁 = card('<div class="kick">TUMARK · 图麦笔记</div><div class="hair"></div>'
          '<div class="h1" style="width:520px;font-size:76px;line-height:1.22">'
          '仅需15秒<br><span style="font-size:40px;letter-spacing:.01em">拍照截图网页转笔记</span></div>'
          '<div class="sub" style="top:402px">16 语整理成中文<i>—</i>10 套卡片<i>—</i>5 种心情</div>'
          '<div class="dom">agentsbin.cn</div>'
          + f'<div class="grp" style="right:44px;top:{GA_TOP}px;width:{GA_W}px;height:{GA_H}px"><img src="{IMG}"></div>'
          + lgD
          + f'<div class="cap" style="left:{capA_left:.0f}px;top:986px">{CAPTION}</div>')
(D / "丁-那句当图上第一行.html").write_text(丁, encoding="utf-8")

print(f"甲 logo 块 {wA}x{hA} @ {1236-GA_BLOCK},866 → 右下 {1236},{866+hA}")
print(f"乙 logo 块 {wB}x{hB} @ 98,548 → {98+wB},{548+hB}")

# ---------- 丙：微信分享气泡对照（他那句「白底黑紫第一行」按"分享标题"读） ----------
BUB = """
.bwrap { position:absolute; width:600px; background:#FFFFFF; border-radius:6px; overflow:hidden;
  box-shadow:0 1px 0 rgba(20,22,26,.06); font-family:-apple-system,'PingFang SC',sans-serif; }
.bhead { display:flex; align-items:center; gap:9px; padding:16px 18px 10px; }
.bhead .av { width:30px; height:30px; border-radius:5px; background:conic-gradient(from 210deg,#7FC8F8,#B9A6F0,#F6C445,#7ED8A8,#7FC8F8); }
.bhead .nm { font-size:15px; color:#7A7F89; }
.btitle { padding:0 18px 12px; font-size:19px; line-height:1.42; color:#1A1A1A; font-weight:400; }
.bimg { margin:0 18px 14px; width:564px; height:451px; }
.bimg img { width:100%; height:100%; display:block; }
.bfoot { display:flex; align-items:center; gap:7px; padding:0 18px 16px; font-size:13px; color:#5A628C; }
.bfoot .lnk { width:14px; height:14px; border:1.4px solid #5A628C; border-radius:50%; position:relative; }
.tag { position:absolute; font-size:15px; letter-spacing:.1em; color:#C0552F; font-family:'Songti SC',serif; }
"""


def bubble(left, top, tag, title, foot):
    return (f'<div class="tag" style="left:{left}px;top:{top - 30}px">{tag}</div>'
            f'<div class="bwrap" style="left:{left}px;top:{top}px">'
            f'<div class="bhead"><div class="av"></div><div class="nm">图麦笔记</div></div>'
            f'<div class="btitle">{title}</div>'
            f'<div class="bimg"><img src="{JPGREF}"></div>'
            f'<div class="bfoot"><div class="lnk"></div>{foot}</div></div>')


JPGREF = "甲-logo右下.png"
丙 = ('<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>' + BASE + BUB
       + "</style></head><body>"
       + '<div class="card" style="height:1024px">'
       + '<div style="position:absolute;left:96px;top:64px;font-size:30px;font-weight:700">分享标题改口对照</div>'
       + bubble(96, 150, '① 现网这句（i18n `shareCardTitle`）',
                '图麦笔记 | 把图文提炼成有用的干货', '未发布的小程序 · 体验版')
       + bubble(676, 150, '② 你说的那句（白底黑紫第一行）',
                '仅需15秒 | 拍照截图网页转笔记', '未发布的小程序 · 体验版')
       + '<div style="position:absolute;left:96px;top:940px;font-size:16px;color:rgba(20,22,26,.6);'
         'letter-spacing:.06em">两气泡里那张封面图都是同一张新图；改的只有标题这一行。'
         '标题现网取自 miniprogram/utils/i18n.js 的 shareCardTitle，12 语各一份，改中文这句要连带定其余 11 语。</div>'
       + "</div></body></html>")
(D / "丙-标题对照.html").write_text(丙, encoding="utf-8")
print("生成 甲 / 乙 / 丙 / 丁")
