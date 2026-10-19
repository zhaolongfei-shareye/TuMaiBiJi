#!/usr/bin/env python3
"""把四张效果图拼成一张挑选总览，每格一行说明＋实测数。"""
import subprocess
import sys
from pathlib import Path

D = Path("/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-19平台logo")
if not (D / "甲-logo右下.png").exists():
    subprocess.run([sys.executable, str(D / "_出图.py")], check=True, capture_output=True)

CELLS = [
    ("甲 · logo 压右下（他说的位置）", "甲-logo右下.png",
     "手机组从 720 缩到 600（−17%）才腾出右下那条带；六枚 44px、那句 17px。"
     "折 JPEG 1280×1024 q4＝106,626 B（占微信 128KB 上限 81.3%）。"),
    ("乙 · 手机不缩，logo 挪左下空档", "乙-logo左下.png",
     "手机保持现网 720 那档，列表那几行字看得清；代价是 logo 不在右下。"
     "q4＝116,732 B（89.1%），离上限只剩 14,340 B。"),
    ("丙 · 「仅需15秒 | 拍照截图网页转笔记」按分享标题读", "丙-标题对照.png",
     "这句的形状和现网那句 shareCardTitle 一模一样（名字 | 一句话），"
     "所以先按标题处理：改的是 miniprogram/utils/i18n.js:269，图上一行字没动。"),
    ("丁 · 同一句按图上第一行读", "丁-那句当图上第一行.png",
     "撤掉「看到好内容，随手记下来。」，把那句拆成两档字。"
     "q3＝113,061 B（86.3%）。"),
]

html = """<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { width:1360px; background:#EDEBE3; font-family:'Songti SC','STSong',serif; color:#14161A; padding:40px; }
h1 { font-size:28px; font-weight:700; letter-spacing:-.01em; }
.lead { font-size:15px; line-height:1.8; color:rgba(20,22,26,.62); margin:10px 0 26px; max-width:1180px; }
.g { display:grid; grid-template-columns:1fr 1fr; gap:34px 40px; }
.c img { width:100%; display:block; border:1px solid rgba(20,22,26,.14); }
.c b { display:block; font-size:17px; margin:0 0 8px; font-weight:700; }
.c p { font-size:13.5px; line-height:1.75; color:rgba(20,22,26,.62); margin:8px 0 0; }
.warn { margin-top:30px; border-left:3px solid #C0552F; padding:4px 0 4px 16px;
  font-size:14.5px; line-height:1.85; color:rgba(20,22,26,.72); }
</style></head><body>
<h1>分享封面 · 换屏＋六枚平台标＋那句「仅需15秒」</h1>
<div class="lead">四张都是效果图，代码一行没动。手机里那张屏是他给的笔记列表页实拍，按透视贴进原样机，竖排纸卡原样压在顶上；六枚标全部取自 Iconify 官方矢量（simple-icons / remixicon / chartist-brand），我没描一笔。</div>
<div class="g">
""" + "".join(
    f'<div class="c"><b>{t}</b><img src="{f}"><p>{n}</p></div>' for t, f, n in CELLS
) + """
</div>
<div class="warn">
一句要先摆到桌面的实话：<b>「支持以上平台的图文」这句现在只有公众号那格站得住。</b>
按 docs/枚举-URL转存全部情况.md 的现网读数——小红书 5/5 落登录壳、裸笔记页 10/10 被 sec 拒；
微博 302 到 Sina Visitor System；知乎 403 带 zse-ck 反爬壳；抖音与视频号在这份矩阵里根本没有条目，一次没测过。
六枚里只有公众号（图文型＋相册型）是真通。
</div>
</body></html>"""
(D / "挑选总览.html").write_text(html, encoding="utf-8")
CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
subprocess.run([CH, "--headless", "--disable-gpu", "--hide-scrollbars",
                "--force-device-scale-factor=1", "--window-size=1360,1490",
                f"--screenshot={D / '挑选总览.png'}", (D / "挑选总览.html").as_uri()],
               capture_output=True, timeout=200, check=True)
print("saved 挑选总览.png", (D / "挑选总览.png").stat().st_size)
