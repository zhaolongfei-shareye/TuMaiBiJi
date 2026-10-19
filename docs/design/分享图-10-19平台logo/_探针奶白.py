#!/usr/bin/env python3
# 看清"奶白"那一大块到底把哪些地方当成了纸卡：导出掩膜 + 逐行打连续奶白段的右端点。
import cv2
import numpy as np
from PIL import Image

CUT = "/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-20261015/组-手机与纸卡-透明.png"
D = "/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-19平台logo"
im = np.array(Image.open(CUT).convert("RGBA"))
H, W = im.shape[:2]
op = im[..., 3] > 128
rgb = im[..., :3].astype(np.int16)
cream = op & (np.abs(rgb - np.array([242, 239, 231])).max(2) <= 20)
n, lab, stats, _ = cv2.connectedComponentsWithStats(cream.astype(np.uint8), 8)
big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
m = (lab == big)
cv2.imwrite(f"{D}/_调试-奶白块.png", (m.astype(np.uint8) * 255))
ys, xs = np.nonzero(m)
print(f"最大奶白连通块 {m.sum()} px  bbox x {xs.min()}..{xs.max()} y {ys.min()}..{ys.max()}")
print("逐行：该行内'从 x=0 起步的连续奶白段'右端点")
for y in range(700, H, 40):
    row = m[y]
    if not row[0]:
        # 从最左的奶白像素起
        idx = np.flatnonzero(row)
        if len(idx) == 0:
            print(f" y={y} 无"); continue
        st = idx[0]
    else:
        st = 0
    e = st
    while e + 1 < W and row[e + 1]:
        e += 1
    print(f" y={y:4d} 起 {st:4d} 止 {e:4d}  该行奶白总数 {int(row.sum())}")
print("采样几处颜色：")
for (x, y) in [(700, 400), (900, 300), (500, 700), (300, 900), (700, 1100), (900, 1300),
               (150, 1000), (450, 1200), (600, 850), (560, 1000), (620, 1000)]:
    r, g, b, a = im[y, x]
    print(f"  ({x},{y}) rgba=({r},{g},{b},{a}) 奶白={bool(cream[y, x])} 大块={bool(m[y, x])}")
