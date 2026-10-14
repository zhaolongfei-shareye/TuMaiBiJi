#!/usr/bin/env python3
# 量"深色面板中间有没有多出一条横线"（站长 10-14 19:3x：「黑色面板中间多了条线，其他色都没有」）。
# 为什么量数而不靠眼看：那道线只有 1 像素高，缩在整屏截图里看一眼就滑过去了；而"只有墨档有、
# 彩色四档没有"这句话本身就是**五张图之间比出来的**，不是一张图看出来的。
#
# 两枚数：
# ① seam_delta —— 面板里那道"渐变带／近实心"交界那一行的凸起：本行亮度减掉上下两行的均值。
#    交界的落点不写死在这里，由调用方把 CSS 里那两个数（顶线 548rpx、带高 240rpx）传进来现算，
#    这样改了 CSS 的数忘了改尺子会红，而不是量到一个错位置上还报绿。
# ② line_frac —— 整幅宽度上"比上下都亮 ≥4 灰阶"的列占比，逐行求，取面内最大那一枚。
#    横线是**一整条**，字和图标只是局部几列，所以这一枚能把"一条线"从"一行字"里分出来：
#    墨档真凶那一版 0.43（y1287），彩色四档 ≤0.10，字那几行 ≤0.14。
#    面内不含底栏那一段（底沿以上 160 像素截掉）——底栏上沿那道描边是 --chrome-line，本来就要有。
#
# 跑法：python3 docs/工具/量-面板里有条线.py <png> [顶线rpx=548] [带高rpx=240]
#       → JSON {"seam_y":…,"seam_delta":…,"line_frac":…,"line_y":…,"top":[[y,frac],…]}
import sys, json
import numpy as np
from PIL import Image

png = sys.argv[1]
top_rpx = float(sys.argv[2]) if len(sys.argv) > 2 else 548.0
band_rpx = float(sys.argv[3]) if len(sys.argv) > 3 else 240.0

rgb = np.asarray(Image.open(png).convert('RGB'), dtype=float)
H, W, _ = rgb.shape
lum = rgb.mean(axis=2)

# 一 rpx 多少像素：截图宽就是 750rpx（模拟器整屏出图），所以这一枚是现读的，不是抄的。
px = W / 750.0
seam = int(round((H - top_rpx * px) + band_rpx * px))

# 横线只在"卡片右边那一截"量：左半压着白卡与剪影，那些边是真内容，不是线。
x0, x1 = int(W * 0.44), int(W * 0.92)
seg = lum[:, x0:x1]

def frac_local_max(y, lift=4.0):
    if y < 1 or y + 1 >= H:
        return 0.0
    return float(((seg[y] >= seg[y - 1] + lift) & (seg[y] >= seg[y + 1] + lift)).mean())

seam_delta = round(float(seg[seam].mean() - (seg[seam - 1].mean() + seg[seam + 1].mean()) / 2), 1)

lo, hi = int(H - top_rpx * px) + 8, H - 160
rows = [(frac_local_max(y), y) for y in range(lo, hi)]
rows.sort(reverse=True)
top = [[int(y), round(f, 2)] for f, y in rows[:3]]
best_f, best_y = rows[0] if rows else (0.0, -1)

print(json.dumps({'seam_y': seam, 'seam_delta': seam_delta, 'line_frac': round(best_f, 2),
                  'line_y': int(best_y), 'top': top}))
