#!/usr/bin/env python3
# 从模拟器截图里量一块矩形的亮度（均值 + 最亮那个像素）。
# 为什么要采像素：「调亮度」那一层黑到底压住了什么，只有渲染结果说了算——
# wxml 里两兄弟的顺序、wxss 里的 z-index 都对，也可能被别处一条规则顶翻。
# 两块区域各自钉一件事：
#  ① 照片上那条没有字的带：加了 50% 的黑，均值必须跟着掉（约掉一半）。
#     不涨说明这一层压根没渲染出来。
#  ② 大标题那一格：最亮的那个像素是字的笔画，必须还是纸白那一档。
#     黑要是压在字上面，最亮也只能到 120 左右，一眼就分得开。
# 跑法：python3 docs/工具/采-亮度图层.py <png> <x0> <x1> <y0> <y1>   （四个数是 rpx，屏幕 750 设计宽）
import sys, json
from PIL import Image

path, x0, x1, y0, y1 = sys.argv[1], *[int(float(v)) for v in sys.argv[2:6]]
im = Image.open(path).convert('RGB')
W, H = im.size
r = W / 750.0                      # 1rpx 在这张图上是几个像素
a, b = int(x0 * r), max(int(x0 * r) + 1, int(x1 * r))
c, d = int(y0 * r), max(int(y0 * r) + 1, int(y1 * r))
crop = im.crop((a, c, min(b, W), min(d, H)))
px = list(crop.getdata())
lum = [(0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) for p in px]
print(json.dumps({
    'n': len(px),
    'mean': round(sum(lum) / len(lum), 1),
    'max': round(max(lum), 1),
    'p95': round(sorted(lum)[int(len(lum) * 0.95)], 1),
}))
