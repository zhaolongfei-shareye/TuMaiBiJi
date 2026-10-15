#!/usr/bin/env python3
# 站长 10-15 03:5x「两个渐变框架为什么不一样…设置和我的看到明显的断层」⇒ 这一把不靠眼睛，
# 逐行量"横向色差 + 行与行之间的亮度跳变"，把断层落在第几行、跳了多少灰阶读出来。
# 用法：python3 量-面板顶断层.py <截图> [截图…]
import sys
import numpy as np
from PIL import Image

for path in sys.argv[1:]:
    im = np.asarray(Image.open(path).convert('L')).astype(np.float64)
    h, w = im.shape
    body = im[:, int(w * 0.03):int(w * 0.97)]          # 掐掉手机壳那两条边
    mean = body.mean(axis=1)
    spread = body.max(axis=1) - body.min(axis=1)
    # 行跳变：上下各 3 行的均值之差（>3 灰阶就是肉眼读得出的硬边）
    jump = np.zeros(h)
    jump[3:h - 3] = np.abs(mean[3:h - 3] - (mean[:h - 6] + mean[6:]) / 2.0)
    print(f'\n=== {path}  {w}×{h} ===')
    rows = np.argsort(jump)[::-1][:14]
    print('  行跳变最大的 14 行（y / 亮度均值 / 横向色差 / 与上下 3 行的差）：')
    for y in sorted(rows):
        print(f'    y={y:4d}  mean {mean[y]:6.1f}  spread {spread[y]:6.1f}  jump {jump[y]:5.1f}')
    print('  逐 8 行采样（y / mean / spread / jump）：')
    for y in range(0, h, 8):
        mark = '  ←硬边' if jump[y] > 3 else ''
        print(f'    {y:4d} {mean[y]:6.1f} {spread[y]:6.1f} {jump[y]:5.1f}{mark}')
