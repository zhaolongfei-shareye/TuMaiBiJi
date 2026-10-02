#!/usr/bin/env python3
# 从模拟器截图里量一块矩形的亮度（均值 + 最亮那个像素），或者量"字与它紧邻的那一圈"的对比度。
# 为什么要采像素：「调亮度」那一档到底压住了什么，只有渲染结果说了算——
# wxml 里两兄弟的顺序、wxss 里的 z-index 都对，也可能被别处一条规则顶翻。
# 两块区域各自钉一件事：
#  ① 照片上那条没有字的带：罩子从铺满拧到 0，均值必须明显涨上去。
#     不涨说明那一层的 opacity 根本没跟着走。
#  ② 大标题那一格：用 contrast 模式量"字的笔画"和"紧贴着字那一圈"的 WCAG 对比。
#     罩子撤干净之后照片是原图亮度，白字底下没有东西托，靠的就是字自己那道淡投影——
#     投影有没有真的把字周围压暗，只有这么量才量得出来（看整块均值会被照片自己的深浅带跑）。
# 跑法：python3 docs/工具/采-亮度图层.py <png> <x0> <x1> <y0> <y1> [mean|contrast]
#       四个坐标是 rpx，屏幕 750 设计宽。
import sys, json
from PIL import Image

path, x0, x1, y0, y1 = sys.argv[1], *[int(float(v)) for v in sys.argv[2:6]]
mode = sys.argv[6] if len(sys.argv) > 6 else 'mean'
im = Image.open(path).convert('RGB')
W, H = im.size
r = W / 750.0                      # 1rpx 在这张图上是几个像素
a, b = int(x0 * r), max(int(x0 * r) + 1, int(x1 * r))
c, d = int(y0 * r), max(int(y0 * r) + 1, int(y1 * r))
crop = im.crop((a, c, min(b, W), min(d, H)))
px = list(crop.getdata())
lum = [(0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) for p in px]


def rel(v):                       # WCAG 那套 sRGB 相对亮度
    s = v / 255.0
    return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4


def ratio(l1, l2):
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


if mode == 'contrast':
    w, h = crop.size
    grid = [lum[i * w:(i + 1) * w] for i in range(h)]
    top = max(max(row) for row in grid)
    # 字＝这一格里最亮的那一簇（纸白笔画）。阈值挂在实测最亮上，不写死数：
    # 写死 200 的话，哪天字被压暗到 190，这条会连"字在哪"都找错。
    thr = top * 0.82
    glyph = [(y, x) for y in range(h) for x in range(w) if grid[y][x] >= thr]
    if len(glyph) < 30:
        print(json.dumps({'err': '找不到字那一簇（亮像素只有 %d 个）' % len(glyph), 'ratio': 0}))
        sys.exit(0)
    ring = set()
    for y, x in glyph:             # 把字向外胀两圈，胀出来那一圈就是"紧贴着字的背景"
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and grid[ny][nx] < thr:
                    ring.add((ny, nx))
    gsum = sum(grid[y][x] for y, x in glyph) / len(glyph)
    rsum = (sum(grid[y][x] for y, x in ring) / len(ring)) if ring else top
    print(json.dumps({'glyph': round(gsum, 1), 'ring': round(rsum, 1), 'nGlyph': len(glyph),
                      'nRing': len(ring), 'ratio': round(ratio(rel(gsum), rel(rsum)), 2)}))
    sys.exit(0)

print(json.dumps({
    'n': len(px),
    'mean': round(sum(lum) / len(lum), 1),
    'max': round(max(lum), 1),
    'p95': round(sorted(lum)[int(len(lum) * 0.95)], 1),
}))

