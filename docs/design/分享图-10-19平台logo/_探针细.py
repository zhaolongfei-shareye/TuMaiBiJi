#!/usr/bin/env python3
# 细探针 + 调试图：把不透明轮廓按 10px 步长打出来，并导出一张叠了网格的调试 PNG 供肉眼定位四角。
import cv2
import numpy as np
from PIL import Image

SRC = "/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-20261015/组-手机与纸卡-透明.png"
OUT = "/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-19平台logo/_调试-轮廓.png"
im = np.array(Image.open(SRC).convert("RGBA"))
H, W = im.shape[:2]
op = im[..., 3] > 128

print("=== 顶部 0..120 逐行 ===")
for y in range(0, 121, 10):
    xs = np.flatnonzero(op[y])
    if len(xs) == 0:
        print(f"y={y:4d} 空"); continue
    # 打印连续段
    runs = []
    s = xs[0]; p = xs[0]
    for v in xs[1:]:
        if v > p + 1:
            runs.append((s, p)); s = v
        p = v
    runs.append((s, p))
    print(f"y={y:4d} " + " ".join(f"{a}-{b}" for a, b in runs))

print("=== 左上角附近：x 340..470 逐列 first y ===")
for x in range(340, 475, 5):
    ys = np.flatnonzero(op[:, x])
    print(f"x={x:4d} first={ys.min() if len(ys) else -1} last={ys.max() if len(ys) else -1}")

print("=== 右上角附近：x 1040..1130 逐列 first y ===")
for x in range(1040, min(1131, W), 5):
    ys = np.flatnonzero(op[:, x])
    print(f"x={x:4d} first={ys.min() if len(ys) else -1} last={ys.max() if len(ys) else -1}")

print("=== 右下角附近：y 1380..1539 逐行 last x ===")
for y in range(1380, H, 10):
    xs = np.flatnonzero(op[y])
    print(f"y={y:4d} first={xs.min() if len(xs) else -1} last={xs.max() if len(xs) else -1}")

# 调试图：纸白底 + 不透明区填淡蓝 + 网格
dbg = np.full((H, W, 3), 255, np.uint8)
rgb = im[..., :3].copy()
rgb[~op] = (rgb[~op] * 0.35 + np.array([255, 60, 60]) * 0.65).astype(np.uint8)
dbg = rgb
for x in range(0, W, 100):
    cv2.line(dbg, (x, 0), (x, H), (0, 160, 255), 1)
    cv2.putText(dbg, str(x), (x + 2, 24), 0, 0.5, (0, 120, 220), 1)
for y in range(0, H, 100):
    cv2.line(dbg, (0, y), (W, y), (0, 160, 255), 1)
    cv2.putText(dbg, str(y), (4, y + 14), 0, 0.5, (0, 120, 220), 1)
Image.fromarray(dbg).save(OUT)
print("saved", OUT)
