#!/usr/bin/env python3
# 探针：把 组-手机与纸卡-透明.png 的不透明轮廓逐行逐列打出来，先看清手机那四条边在不在画布内。
import cv2
import numpy as np
from PIL import Image

SRC = "/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-20261015/组-手机与纸卡-透明.png"
im = np.array(Image.open(SRC).convert("RGBA"))
H, W = im.shape[:2]
op = im[..., 3] > 128

print("=== 逐行：首个/末个不透明 x ===")
for y in range(20, H, 60):
    xs = np.flatnonzero(op[y])
    print(f"y={y:5d}  n={len(xs):5d}  first={xs.min() if len(xs) else -1:5d} last={xs.max() if len(xs) else -1:5d}")
print("=== 逐列：首个/末个不透明 y ===")
for x in range(0, W, 60):
    ys = np.flatnonzero(op[:, x])
    print(f"x={x:5d}  n={len(ys):5d}  first={ys.min() if len(ys) else -1:5d} last={ys.max() if len(ys) else -1:5d}")
print("=== 底两行 ===")
for y in (H - 3, H - 2, H - 1):
    xs = np.flatnonzero(op[y])
    print(f"y={y} n={len(xs)} first={xs.min() if len(xs) else -1} last={xs.max() if len(xs) else -1}")
