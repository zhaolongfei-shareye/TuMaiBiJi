#!/usr/bin/env python3
"""找「我的」页名片行那两行字到底落在哪条 y，并量每行的面/字心/比值。"""
from PIL import Image
import statistics

D = "/Users/zlfmac/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/shareye_f856/temp/RWTemp/2026-10/400df95eb5952ef53b33e81826c85c3f/"
ME = D + "4a1ae571c108e27ebba0b5040ec01139.jpg"
IDX = D + "472a747797251efd383195cd2ec067ac.jpg"


def lum(c):
    def f(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def rows(path, x0, x1, y0, y1, tag):
    im = Image.open(path).convert("RGB")
    print(f"\n== {tag} x{x0}..{x1}")
    for y in range(y0, y1, 4):
        px = [im.getpixel((x, y)) for x in range(x0, x1)]
        br = sorted(px, key=lum)
        fl = lum(tuple(round(statistics.median([p[i] for p in br[len(br) // 2:]])) for i in range(3)))
        dark = [p for p in br if lum(p) < fl * 0.55]
        if len(dark) < 3:
            continue
        face = tuple(round(statistics.median([p[i] for p in br[len(br) // 2:]])) for i in range(3))
        core = tuple(round(statistics.median([p[i] for p in dark[:max(1, len(dark) // 5)]])) for i in range(3))
        print(f" y={y:5d} 暗字像素={len(dark):4d} 面{face} 字心{core} 比{ratio(face, core):.2f}")


rows(ME, 230, 640, 1040, 1320, "我的 名片行左半（名称+slogan）")
rows(IDX, 60, 1060, 980, 1260, "列表页 两行全宽")
