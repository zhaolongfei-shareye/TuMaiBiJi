#!/usr/bin/env python3
# 把参考图打成一格一格的灰度字符图：先看清结构，再决定探针落在哪一行哪一列。
# （上一版直接拿"比周围亮"当卡片沿，结果把照片里那件浅粉卫衣读成了卡片——所以先照一遍。）
import sys
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else \
    "/Users/zlfmac/.qoder/tmp/-Users-zlfmac-Documents-AgentsNote/images/" \
    "fb085725-0b39-4ece-bc6b-935e4051df68/7293c1065f063cd5730a8dedc7b3d7501123803c55aa9bcad250cb1ead0ed607.jpeg"
im = Image.open(SRC).convert("L")
W, H = im.size
COLS, ROWS = 60, 66
px = im.load()
STEP = " .:-=+*#%@"
print(f"{W}x{H}；每格 {round(W/COLS,1)}x{round(H/ROWS,1)}px；列号=格（0..{COLS-1}）")
print("    " + "".join(str((i * 10) // 10 % 10) if i % 6 == 0 else " " for i in range(COLS)))
for ry in range(ROWS):
    y = int((ry + 0.5) * H / ROWS)
    line = []
    for rx in range(COLS):
        x0, x1 = int(rx * W / COLS), int((rx + 1) * W / COLS)
        y0, y1 = int(ry * H / ROWS), int((ry + 1) * H / ROWS)
        s = n = 0
        for yy in range(y0, y1, max(1, (y1 - y0) // 6)):
            for xx in range(x0, x1, max(1, (x1 - x0) // 6)):
                s += px[xx, yy]; n += 1
        v = s / max(1, n)
        line.append(STEP[min(9, max(0, int(v / 25.6)))])
    print(f"{ry:3d} " + "".join(line) + f"  y={y}px≈{round(y/(W/750.0),1)}rpx")
