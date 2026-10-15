#!/usr/bin/env python3
# 配套 `量-面板阴影五档读数.js`：在一张整屏截图上量面板上沿那三段的亮度。
# 原点全部从 CSS 现算，不写死 y：顶线 = 100vh − 548rpx（`.stage-panel` 那条），
# 一 rpx 多少像素由截图宽度现读（模拟器整屏出图，截图宽就是 750rpx）。
# 用**逐行中位数**而不是均值：上沿那一带可能压着「调亮度｜换背景｜换心情」那一行的字，
# 中位数让少数几列文字进不了读数。
import sys, json
import numpy as np
from PIL import Image

png = sys.argv[1]
TOP_RPX = float(sys.argv[2]) if len(sys.argv) > 2 else 548.0

rgb = np.asarray(Image.open(png).convert('RGB'), dtype=float)
H, W, _ = rgb.shape
lum = rgb.mean(axis=2)
px = W / 750.0
top = int(round(H - TOP_RPX * px))

x0, x1 = int(W * 0.05), int(W * 0.95)
seg = lum[:, x0:x1]

def band(a_rpx, b_rpx):
    """上沿以上 a_rpx～b_rpx 那一段的逐行中位数，再对行取平均（负数＝在上沿以下）。
    两端的先后由"离上沿多远"决定，往下那一段会反过来，所以切片前先排一次序。"""
    ys = sorted((int(round(top - a_rpx * px)), int(round(top - b_rpx * px))))
    ya, yb = max(0, min(H - 1, ys[0])), max(1, min(H, ys[1]))
    if yb - ya < 1:
        return None
    return round(float(np.median(seg[ya:yb], axis=1).mean()), 1)

out = {
    'png': png.split('/')[-1], 'H': H, 'W': W, 'px_per_rpx': round(px, 4), 'panel_top_y': top,
    'L_far': band(140, 60),        # 没被投影碰到的那一段底色（照片或壁纸本色）
    'L_above': band(24, 6),        # 投影该落在的那一条（-12rpx 偏移＋28rpx 模糊）
    'L_face': band(-2, -20),       # 面板刚进去那一条（渐变起点，很透）
    'L_solid': band(-320, -380),   # 面板近实心那一段（带高 240 走完之后）
}
print(json.dumps(out))
