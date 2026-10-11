#!/usr/bin/env python3
# 首页那四张插画**压平了没有**（10-11 09:5x 站长：「需求+效果图都有」「如果效果图你都不去参考，做效果图的意义是什么？」）。
# 为什么要有这一把：效果图第 271／273 行画的是"块面玻璃＋人物与 icon 实心"，可原始 PNG 自己就是大半透明
# （`ic-person.png` 实心像素只占 0.7%）——纱挂在容器上，**静态读样式表与读令牌都看不见这件事**，
# 只有读资产的 alpha 直方图才看得见。半透像素一旦回来（谁重新导出一版原始插画），照片就又从画里穿过去。
# 跑法：python3 docs/工具/量-插画压没压.py        （判红即退出码 1）
# 压平这一步本身：docs/工具/烘-插画压平.py（不重画一个像素，按"画在白底上"合成、有画的地方 alpha 拉满、轮廓外照旧透明）
import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..'))
FILES = ['ic-person.png', 'ic-person-alt.png', 'ic-stat-notes.png', 'ic-stat-cards.png']

bad = []
for p in FILES:
    f = os.path.join(ROOT, 'miniprogram/assets', p)
    if not os.path.exists(f):
        bad.append(f'{p} 不在包里')
        print(f'★ 缺文件 {p}')
        continue
    a = np.asarray(Image.open(f).convert('RGBA').getchannel('A'))
    n = a.size
    solid, semi, empty = (a == 255).sum() / n, ((a > 0) & (a < 255)).sum() / n, (a == 0).sum() / n
    # 有画的地方必须全是实心：半透像素＝0 才算压平（轮廓外那一片 alpha=0 是"边缘外部透明"，他要的就是这个）
    ok = semi == 0 and solid > 0
    print(f'{"✓" if ok else "★"} {p:22s} 实心 {100*solid:5.1f}%  半透 {100*semi:5.1f}%  全透 {100*empty:5.1f}%')
    if not ok:
        bad.append(f'{p} 还有 {100*semi:.1f}% 半透像素＝没压平，压在玻璃上会透出底下的照片')

print('\n' + ('✓ 四张插画全是实心（轮廓外仍透明），配得上效果图那一版' if not bad
      else f'!! 红 {len(bad)} 条：' + '；'.join(bad) + '\n   跑一次 python3 docs/工具/烘-插画压平.py --写进包'))
sys.exit(0 if not bad else 1)
