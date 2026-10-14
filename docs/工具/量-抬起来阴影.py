#!/usr/bin/env python3
# 量"框框与背景之间那一枚向上阴影真落到屏上没有"（站长 10-14 20:5x 那一句）。
# 为什么必须量像素：`box-shadow: var(--sh-lift)` 在计算样式里读得到，只证明"令牌解析出来了"，
# 不证明"这一枚投影画得出来"——同一屏上还有 z-index 比它高的东西（插画、白卡、罩层），
# 压住了就是静默没有。所以这一把量的是**边界上方那一条带比远处暗多少**。
#
# 只在**背后是纯色页面底**那一态量（无图那一态）：背后是照片时，那条带的明暗分不清是影还是图。
# 改前实测（同一张图、同一处窗口）：近带 220.0／远带 220.0 ⇒ 差 0.0，所以"暗 ≥3 灰阶"这一条有牙。
#
# 跑法：python3 docs/工具/量-抬起来阴影.py <png> [顶线rpx=548] [x起% = 40] [x止% = 96]
import sys, json
import numpy as np
from PIL import Image

png = sys.argv[1]
top_rpx = float(sys.argv[2]) if len(sys.argv) > 2 else 548.0
x0p = float(sys.argv[3]) if len(sys.argv) > 3 else 40.0
x1p = float(sys.argv[4]) if len(sys.argv) > 4 else 96.0

lum = np.asarray(Image.open(png).convert('RGB'), dtype=float).mean(axis=2)
H, W = lum.shape
px = W / 750.0                       # 截图宽＝750rpx，这一枚是现读的
edge = int(round(H - top_rpx * px))  # 框框那条顶边落在哪一行（由 CSS 里那个数算，不写死像素）
x0, x1 = int(W * x0p / 100), int(W * x1p / 100)

near = lum[edge - 6:edge, x0:x1].mean()      # 紧贴边上方 6 行＝阴影最浓那一段
far = lum[edge - 45:edge - 25, x0:x1].mean()  # 往上 25～45 行＝阴影够不到的远处
prof = [round(float(v), 1) for v in lum[edge - 50:edge + 2, x0:x1].mean(axis=1)][::8]
print(json.dumps({'edge_y': edge, 'near': round(float(near), 1), 'far': round(float(far), 1),
                  'dip': round(float(far - near), 1), 'profile': prof}))
