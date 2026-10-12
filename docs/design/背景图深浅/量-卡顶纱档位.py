#!/usr/bin/env python3
"""卡顶那 158rpx 白纱该多浓：从真机截图反推原图亮度，再按纱的混合公式算各档的对比度。

站长 10-12 21:39 那张（`真机-1012-列表两行.jpg`，1116×2484，黑衣服压在那两行底下）实测：
「返回」那一处面 89 → 整档墨只有 1.92、纸白 @.96 反而 6.10；同一行左半面 152 → 墨 4.67、白 2.51。
⇒ 这一行里两个极性互相打架，根因是 `--glass-veil` 只有 α .30：黑图提不到能容下墨的那一档。

**只有 α .30 那一列是实测**（面直接从截图量，Y 由 `面 = α·255 + (1−α)·原图` 反解）；
其余四列是按同一条混合公式**推算**的，落码后必须再量一遍真截图，不许拿这张表当已验证。

y 是这一张的行位（换截图先重跑 `量-定位行.py`，别照抄）。
"""
from PIL import Image
import os
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
SHOT = os.path.join(HERE, '真机-1012-列表两行.jpg')
INK = (53, 46, 29)          # 象牙那套 --text-primary 实色
WHITE = (242, 239, 233, 0.96)
VEIL_ALPHA = 0.30           # 现网 app.wxss:90 --glass-veil
ROWS = [('tab 行 左半 笔记列表｜笔记卡片', 1052, 1092, 60, 560),
        ('tab 行 右端 返回', 1052, 1092, 860, 1020),
        ('分类行 全部｜旅游｜生活｜私密', 1160, 1200, 40, 480)]
ALPHAS = (0.30, 0.40, 0.50, 0.55, 0.60)


def f(v):
    v = v / 255.0
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4


def lum(c):
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def face_of(im, y0, y1, x0, x1):
    """底＝剔掉字身之后亮的那 40%（中位灰阶）；字心＝最暗 0.5% 的中位。"""
    pts = []
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            p = im.getpixel((x, y))
            pts.append((lum(p), p))
    pts.sort(key=lambda t: t[0])
    face = [p for _, p in pts[int(len(pts) * 0.6):]]
    core = [p for _, p in pts[:max(1, len(pts) // 200)]]
    med = lambda ps: tuple(round(statistics.median([p[i] for p in ps])) for i in range(3))
    return med(face), med(core)


im = Image.open(SHOT).convert('RGB')
print('行位实测（α .30 现网）＋ 纱抬浓后的推算\n')
for name, y0, y1, x0, x1 in ROWS:
    face, core = face_of(im, y0, y1, x0, x1)
    fl = lum(face)
    gray = 255 * (1.055 * (fl ** (1 / 2.4)) - 0.055)
    y_raw = (gray - VEIL_ALPHA * 255) / (1 - VEIL_ALPHA)
    ink_now = ratio(INK, face)
    white_now = ratio(tuple(WHITE[i] * WHITE[3] + face[i] * (1 - WHITE[3]) for i in range(3)), face)
    print('%s' % name)
    print('  面灰阶 %3d  字心灰阶 %3d（整档墨实测 ≈46，.72 那一档会落在 %d）  反推原图 Y≈%3d'
          % (round(gray), round(lum(core) and 255 * (1.055 * (lum(core) ** (1 / 2.4)) - 0.055)),
             round(0.72 * 53 + 0.28 * gray), round(y_raw)))
    print('  现网 α.30：墨 %.2f ／ 纸白 %.2f' % (ink_now, white_now))
    for a in ALPHAS[1:]:
        nf = a * 255 + (1 - a) * y_raw
        g = (round(nf),) * 3
        w = tuple(WHITE[i] * WHITE[3] + g[i] * (1 - WHITE[3]) for i in range(3))
        print('    推算 α%.2f → 面 %3d：墨 %.2f ／ 纸白 %.2f' % (a, nf, ratio(INK, g), ratio(w, g)))
    print()
