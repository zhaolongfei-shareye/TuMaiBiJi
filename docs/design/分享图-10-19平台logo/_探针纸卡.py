#!/usr/bin/env python3
# 找竖排纸卡压在手机上那条右边：逐行打 x 200..700 的 RGB，看颜色断层在哪。
import numpy as np
from PIL import Image

SRC = "/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-20261015/组-手机与纸卡-透明.png"
im = np.array(Image.open(SRC).convert("RGBA"))
for y in (820, 900, 1000, 1100, 1200, 1300, 1400):
    row = im[y]
    print(f"--- y={y} ---")
    prev = None
    for x in range(180, 760, 2):
        r, g, b, a = int(row[x][0]), int(row[x][1]), int(row[x][2]), int(row[x][3])
        cur = (r // 12, g // 12, b // 12)
        if prev is None or sum(abs(c - p) for c, p in zip(cur, prev)) > 3:
            print(f"  x={x:4d} rgba=({r},{g},{b},{a})")
            prev = cur
