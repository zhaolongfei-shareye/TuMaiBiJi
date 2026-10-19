#!/usr/bin/env python3
# 纸卡四边：下段用"每行最右侧亮像素"量（手机那半边是暗面板，分得开）；
# 上段手机是浅底，量不出来，导一张 1:1 细网格放大图靠肉眼读。
import numpy as np
from PIL import Image, ImageDraw

CUT = "/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-20261015/组-手机与纸卡-透明.png"
D = "/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-19平台logo"
A = np.array(Image.open(CUT).convert("RGBA"))
H, W = A.shape[:2]
op = A[..., 3] > 128
lum = A[..., :3].astype(np.int16) @ np.array([299, 587, 114]) // 1000

print("每行 x<660 内最右一个亮(lum>200)且不透明的像素 = 纸卡右沿")
for y in range(1000, 1540, 20):
    seg = (lum[y, :660] > 200) & op[y, :660]
    xs = np.flatnonzero(seg)
    print(f" y={y:4d} 右沿 {xs.max() if len(xs) else -1:4d}")
print("每列 y>1000 内最下一个亮像素 = 纸卡下沿")
for x in range(0, 660, 20):
    ys = np.flatnonzero((lum[1000:, x] > 200) & op[1000:, x])
    print(f" x={x:4d} 下沿 {ys.max() + 1000 if len(ys) else -1:4d}")

crop = Image.open(CUT).convert("RGB").crop((0, 700, 700, 1540))
d = ImageDraw.Draw(crop)
for gx in range(0, 700, 25):
    d.line([(gx, 0), (gx, 840)], fill=(0, 170, 255), width=1)
    if gx % 100 == 0:
        d.text((gx + 2, 2), str(gx), fill=(255, 0, 0))
for gy in range(0, 840, 25):
    d.line([(0, gy), (700, gy)], fill=(0, 170, 255), width=1)
    d.text((2, gy + 1), str(gy + 700), fill=(255, 0, 0))
crop.save(f"{D}/_调试-纸卡放大.png")
print("saved _调试-纸卡放大.png")
