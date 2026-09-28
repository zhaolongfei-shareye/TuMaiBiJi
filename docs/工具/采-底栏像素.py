#!/usr/bin/env python3
# 从模拟器截图里量底部导航那颗胶囊：填充色（众数）、三格各自最亮的字色、以及胶囊自己的边框位置。
# 为什么要采像素：custom-tab-bar 是组件，automator 的 page.$ 和页面里的 createSelectorQuery
# 都够不到它（实测 .tab-bar / .tab-item 全部返回 null），所以这一块面的颜色和几何只能从渲染结果上量。
# 跑法：python3 docs/工具/采-底栏像素.py <png> —— 输出 JSON，交给 验-列表D2-真跑.js 判。
#
# 取样的两条防呆，都是这一把踩出来的：
#  ① x 要从胶囊左右两端各让开 60rpx：胶囊圆角 44rpx，靠边那一条竖线在圆角外，
#     量到的是它背后那一张白卡（240,238,233），会被读成"未选中的字也这么亮"。
#  ② y 要往内收 10rpx：压着上沿就量到了卡片内容。
import sys, json
from collections import Counter
from PIL import Image

path = sys.argv[1]
im = Image.open(path).convert('RGB')
W, H = im.size
r = W / 750.0            # 1rpx 在这张图上是多少像素（图就是按 750 设计宽出的）
left, right = int(24 * r), int(W - 24 * r)
top, bottom = int(H - (20 + 108) * r), int(H - 20 * r)
xpad = int(60 * r)       # 圆角 + 描边，见文件头②
ypad = max(2, int(10 * r))

line_y = (top + bottom) // 2
fill = [im.getpixel((x, line_y)) for x in range(left + 4, right - 4)]
mode, count = Counter(fill).most_common(1)[0]

third = (right - left) // 3
stroke, ink_pixels = [], []
for i in range(3):
    c = Counter()
    for x in range(left + i * third + xpad, left + (i + 1) * third - xpad):
        for y in range(top + ypad, bottom - ypad):
            px = im.getpixel((x, y))
            # 只数"和填充色明显不同"的那些像素 = 笔画
            if max(abs(px[k] - mode[k]) for k in range(3)) > 24:
                c[px] += 1
    # 取众数而不是最亮：取最亮会被两条笔画叠在一起的那个点骗到——
    # 「我的」那个图标是圆头 + 肩膀两道 3rpx 描边挨着放，同一像素被覆两层 alpha，
    # 叠出来的值比真正的字色还亮（实测 195 vs 175），上一把的红就是这么来的。
    # 笔画内部的平色像素才是字色本身。
    stroke.append(list(c.most_common(1)[0][0]) if c else None)
    ink_pixels.append(sum(c.values()))

# 胶囊自己的矩形：在图下方 200rpx 这条带里找填充色（往上找会撞上同样颜色的搜索条）
band_top = int(H - 200 * r)
xs, ys = [], []
for y in range(band_top, H, max(1, int(2 * r))):
    for x in range(0, W, max(1, int(2 * r))):
        px = im.getpixel((x, y))
        if all(abs(px[k] - mode[k]) <= 6 for k in range(3)):
            xs.append(x)
            ys.append(y)
box = None
if xs:
    box = [min(xs), min(ys), max(xs), max(ys)]

outside = im.getpixel((max(1, int(6 * r)), max(1, int(top - 30 * r))))
print(json.dumps({
    "image": [W, H],
    "image_rpx": [round(W / r, 1), round(H / r, 1)],
    "rpx": round(r, 4),
    "pill_assumed": [left, top, right, bottom],
    "fill": list(mode),
    "fill_ratio": round(count / max(1, len(fill)), 3),
    "stroke": stroke,
    "ink_pixels": ink_pixels,
    "box_rpx": [round(box[0] / r, 1), round(box[1] / r, 1), round(box[2] / r, 1), round(box[3] / r, 1)] if box else None,
    "page": list(outside),
}))
