# -*- coding: utf-8 -*-
"""A 风格三版排法 → 一张自包含确认板（图内嵌，可直接打开挑）。"""
import base64
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, '封面方向3')
ROWS = [
    ('A0.png', 'A｜数字横排在口号下方',
     '口号独占上半，五枚数字拉一条横线压在照片上，两张界面落在左下。',
     '数字最抢眼；但右下会空出一块，重心偏左。'),
    ('A1.png', 'B｜数字做右侧竖列',
     '口号居左，五枚数字沿右边竖成一列，两张界面在左下。',
     '竖列像书脊，文艺；但视线被口号与数字分到两侧。'),
    ('A2.png', 'C｜底部一条深色带（推荐）',
     '口号独占上半，底部一条半透深色带把两张界面与五枚数字收在一起。',
     '重心最稳、可读性最好（数字压在深色带上而不是压在照片上），落地时改动最小。'),
]


def uri(name):
    with open(os.path.join(SHOTS, name), 'rb') as f:
        return 'data:image/png;base64,' + base64.b64encode(f.read()).decode()


cells = ''.join(
    f'<figure><img src="{uri(f)}" alt="{t}"><figcaption><b>{t}</b><span>{what}</span><em>{risk}</em></figcaption></figure>'
    for f, t, what, risk in ROWS)

HTML = f'''<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<title>封面 A 风格·三版排法（请挑一版）</title>
<style>
@font-face{{font-family:"ZF";src:url("../素材/朱雀仿宋-Regular.ttf")}}
body{{margin:0;background:#d5d1c7;color:#19201f;font-family:"ZF","Songti SC",serif}}
header{{padding:44px 52px 26px;border-bottom:3px solid #19201f}}
header h1{{margin:0;font-size:40px}}
header p{{font-size:19px;line-height:1.85;color:#59635c;margin:14px 0 0;max-width:1180px}}
.wrap{{display:flex;gap:26px;padding:34px 52px 52px;align-items:flex-start}}
figure{{margin:0;flex:1;min-width:0}}
figure img{{width:100%;border:1px solid #c9cdc3}}
figcaption{{padding:18px 4px 0}}
figcaption b{{display:block;font-size:24px}}
figcaption span{{display:block;font-size:17px;line-height:1.75;color:#59635c;margin-top:8px}}
figcaption em{{display:block;font-style:normal;font-size:16px;line-height:1.7;margin-top:10px;border-left:4px solid #b95b3b;padding-left:12px}}
footer{{padding:0 52px 46px;font-size:14px;color:#59635c;line-height:1.9}}
</style></head><body>
<header><h1>封面 A 风格 · 三版排法（请挑一版）</h1>
<p>三版用的是同一张真实渲染照片、同一句口号、同一枚四色 logo、同样两张界面图（第 1 张首屏真实渲染 ＋ 第 3 张真实生成的分享卡，中间那张纸白档已按你说的撤掉）。
唯一差别是<b>五枚数字与两张界面怎么排</b>。数字口径：3 种记法＝图片/链接/文字三个入口；16 种＝外文内容整理成中文（站长拍的实测数）；9 张＝单篇配图上限；11 套＝卡片模板数；712 KB＝2.4.17 那颗代码包实测 729,103 B。
本轮只出效果图，<b>产品代码与册子一行没动</b>。</p></header>
<div class="wrap">{cells}</div>
<footer>三版均为 1280×1600 整页渲染，与册子同尺寸，选定后可 1:1 落地；逐元素越界检查 0。</footer>
</body></html>'''

out = os.path.join(HERE, '封面A风格-三版确认板.html')
open(out, 'w', encoding='utf-8').write(HTML)
print('bytes', os.path.getsize(out))
