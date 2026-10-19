#!/usr/bin/env python3
"""第二稿总览：三张 1280×1024 缩着并排，每格一行说明＋实测数。"""
import subprocess
from pathlib import Path

D = Path("/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-20竖壳圆标")
CELLS = [
    ("甲 · 六枚＝品牌色圆底＋官方白字形（主稿）", "甲-圆底白字形.png",
     "机身 566×1240、顶 y=197、露出 827＝正好 2/3。那句话按现网 88px 排，"
     "一行要 9×88＝792px 而左列只有 578px ⇒ 只能折三行。q4＝122,991 B（占上限 93.8%）、q5＝111,455 B。"),
    ("乙 · 六枚＝App Store 官方应用图标切圆", "乙-真应用图标切圆.png",
     "小红书／抖音／知乎这三枚比甲更像他家常见的样子；"
     "但公众号取的是「公众号助手」那枚白底绿旋、在纸色上塌成一圈白，微博那枚自带橙黄渐变、和纸色打架。"
     "q4＝127,341 B（离上限只剩 3,731 B）、q5＝115,188 B。"),
    ("丙 · 那句话走两档现网字号（88 一行＋25 一行）", "丙-那句走两档字号.png",
     "也全是现网字号、没新造一档。代价：副题下面空出 223px 一条，左列断成两截，"
     "读起来像没排完。所以只当备选。"),
]
html = """<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { width:1400px; background:#EDEBE3; font-family:'Songti SC','STSong',serif; color:#14161A; padding:40px 44px; }
h1 { font-size:27px; font-weight:700; }
.lead { font-size:14.5px; line-height:1.85; color:rgba(20,22,26,.64); margin:10px 0 22px; max-width:1240px; }
.g3 { display:grid; grid-template-columns:repeat(3,1fr); gap:26px; }
.c img.f { width:100%; display:block; border:1px solid rgba(20,22,26,.14); }
.c b { display:block; font-size:16px; margin:0 0 8px; font-weight:700; line-height:1.45; }
.c p { font-size:13px; line-height:1.8; color:rgba(20,22,26,.64); margin:8px 0 0; }
.strip { display:flex; gap:26px; margin-top:10px; }
.strip img { height:150px; width:auto; border:1px solid rgba(20,22,26,.12); background:#E9E7DC; }
.warn { margin-top:26px; border-left:3px solid #C0552F; padding:4px 0 4px 16px;
  font-size:14.5px; line-height:1.85; color:rgba(20,22,26,.72); max-width:1240px; }
</style></head><body>
<h1>分享封面 第二稿 · 正向 iPhone 壳＋左下六枚圆标</h1>
<div class="lead">上一版作废。这一版按你六条改：右侧换成<b>真 iPhone 外壳</b>（机身:屏幕圆角 78:70、边框 8px、
灵动岛＝屏宽 32%×屏高 4.37%、状态条 44pt 占屏高 5.16%，全按 iPhone 15 Pro 比例推）、<b>纸卡撤掉</b>、
<b>手机正向</b>、<b>只露 2/3</b>（机身顶 y=197、露出 827／全高 1240＝0.667，底下 413px 沉出画外）、
<b>六枚圆形标压左下</b>、<b>那句话按现网字号</b>。状态条那 63px 用你实拍导航条自己那层色 (34,37,44) 续上去，
没造假的时间和信号格。代码一行没动。</div>
""" + '<div class="g3">' + "".join(f'<div class="c"><b>{t}</b><img class="f" src="{f}"><p>{n}</p></div>' for t, f, n in CELLS) + '</div>' + """
<b style="display:block;font-size:17px;margin:26px 0 4px">六枚圆标两种取法并排（左＝甲，右＝乙）</b>
<div class="strip"><img src="_圆标对照.png"></div>
<div class="warn">
还是那句要先摆到桌面的实话：<b>「支持以上平台的图文」现在只有公众号那一格站得住。</b>
按 docs/枚举-URL转存全部情况.md 的现网读数——小红书 5/5 落登录壳、裸笔记页 10/10 被 sec 拒；
微博 302 到 Sina Visitor System；知乎 403 带 zse-ck 反爬壳；抖音与视频号在这份矩阵里没有条目＝一次没测过。
另两格不归我判：六枚第三方商标（乙那一版还直接用了各家 App Store 图标）挂在个人主体小程序的对外分享封面上；
你那张实拍里带一张真人照片当首页背景、以及你自己那几篇笔记标题与两张明星缩略图。
</div>
</body></html>"""
(D / "总览.html").write_text(html, encoding="utf-8")
CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
WIN_H = 2400
subprocess.run([CH, "--headless", "--disable-gpu", "--hide-scrollbars",
                "--force-device-scale-factor=1", f"--window-size=1400,{WIN_H}",
                f"--screenshot={D / '总览.png'}", (D / "总览.html").as_uri()],
               capture_output=True, timeout=240, check=True)
from PIL import Image
import numpy as np
im = np.array(Image.open(D / "总览.png").convert("RGB"))
bg = im[0, 0].astype(int)
mask = (np.abs(im.astype(int) - bg).max(2) > 6)
rows = np.where(mask.any(1))[0]
cols = np.where(mask.any(0))[0]
bottom = rows.max()
crop = bottom + 40 if bottom + 40 < WIN_H else None
if crop:
    Image.fromarray(im).crop((0, 0, 1400, crop)).save(D / "总览.png")
print("总览尺寸", im.shape[:2], "内容止于", bottom, "横向", cols.min(), cols.max(),
      "→ 裁到", crop if crop else "未裁(可能仍截断)")
