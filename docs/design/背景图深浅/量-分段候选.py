#!/usr/bin/env python3
"""深图那一态真机截图上，玻璃段那几行字"该翻白还是该留墨"的取证脚本。

只用背景像素：那一段里亮度 60 分位以上的点当底（字是深色，全落在低分位），
再把四档候选字色分别压上去算 WCAG 相对亮度比，取中位与"≥4.5 占比"。

坐标是站长 10-12 19:26/19:28 那两张 1116×2484 真机截图上的实测行位；换一张截图要先重跑
量-定位行.py 找行，别照抄这里的 y。
"""
from PIL import Image
import statistics
import sys

INK = (53, 46, 29)  # 象牙那套的 --text-primary 实色
CAND = [("墨@.72(现网)", INK + (0.72,)), ("墨@满档", INK + (1.0,)),
        ("纸白@.96", (242, 239, 233, 0.96)), ("纸白@满档", (255, 255, 255, 1.0))]


def L(c):
    def f(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def ratio(la, lb):
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def seg(im, y0, y1, tag, x0=0, x1=None):
    x1 = im.size[0] if x1 is None else x1
    pts = []
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            p = im.getpixel((x, y))
            pts.append((L(p), p))
    pts.sort(key=lambda t: t[0])
    face = [p for _, p in pts[int(len(pts) * 0.6):]]
    fm = statistics.median([L(p) for p in face])
    inv = round(255 * (1.055 * (fm ** (1 / 2.4)) - 0.055))
    cells = []
    for name, c in CAND:
        rs = []
        for p in face:
            b = tuple(c[i] * c[3] + p[i] * (1 - c[3]) for i in range(3))
            rs.append(ratio(L(b), L(p)))
        v = sorted(rs)
        ok = 100 * len([q for q in v if q >= 4.5]) / len(v)
        cells.append(f"{name} {v[len(v)//2]:.2f}(≥4.5 占{ok:.0f}%)")
    print(f"{tag:26s} 底中位≈灰阶{inv:3d}  " + "  ".join(cells))


idx = Image.open(sys.argv[1]).convert("RGB")
me = Image.open(sys.argv[2]).convert("RGB")
print("—— 笔记列表页 两行（深图那一态）——")
seg(idx, 1024, 1062, "tab 行 左半 List/Note card", 0, 700)
seg(idx, 1024, 1062, "tab 行 右端 Back", 880, 1090)
seg(idx, 1088, 1142, "分类行 左半 All/旅游", 0, 700)
seg(idx, 1088, 1142, "分类行 右半 私密", 380, 700)
print("—— 我的页 名片行两行（深图那一态）——")
seg(me, 1076, 1116, "名称", 230, 640)
seg(me, 1144, 1184, "slogan", 230, 640)
seg(me, 1088, 1136, "药丸 About", 860, 1010)
