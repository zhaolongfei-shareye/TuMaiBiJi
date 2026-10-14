#!/usr/bin/env python3
# 首页包里的插画**压平了没有**（10-11 09:5x 站长：「需求+效果图都有」「如果效果图你都不去参考，做效果图的意义是什么？」）
# ——10-11 那趟是四张，2.2 B 方案撤掉右两枚计数块之后名单收到两张（在下面 FILES，别在这里写死数量）。
# 以及**压平有没有压出白边**（10-11 13:2x 站长：「笔记和卡片上面的图片透明底消除不干净，有明显的白边，不美观」）。
# 为什么要有这一把：效果图第 271／273 行画的是"块面玻璃＋人物与 icon 实心"，可原始 PNG 自己就是大半透明
# （`ic-person.png` 实心像素只占 0.7%）——纱挂在容器上，**静态读样式表与读令牌都看不见这件事**，
# 只有读资产的 alpha 直方图才看得见。半透像素一旦回来（谁重新导出一版原始插画），照片就又从画里穿过去。
#
# 白边那一条为什么量"环"而不是量全图：原件轮廓外那圈柔光是 (254,254,254)@α≈5，上一版压平时"凡 α>0 就拉满"
# 把它变成**实心白**——就是他那句白边。全图近白占比当判据会误伤（人物自己的米白大面就占九成），
# 所以只看**贴着透明边的第 1 环**：那里不该有成片的实心近白。
# 跑法：python3 docs/工具/量-插画压没压.py        （判红即退出码 1）
# 压平这一步本身：docs/工具/烘-插画压平.py --从git <原件 commit>（α≤64 那圈整枚抠掉，其余合成到白、α 拉满）
import os
import sys
import numpy as np
from PIL import Image
from PIL.ImageFilter import MaxFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..'))
# 名单跟着 2.2 B 方案收：ic-stat-notes／ic-stat-cards 那两枚随右两枚计数块一起撤出包，
# 现在只有人物那两张还压在首屏那层白面毛玻璃上（压没压平直接决定穿不穿图）。
FILES = ['ic-person.png', 'ic-person-alt.png']
# 上一版（把柔光圈拉成实心白）实测 67%~82%，抠掉那圈之后 8%~20% ⇒ 门槛放 30%，两头都留得下余量
RING_WHITE_MAX = 30.0

bad = []
for p in FILES:
    f = os.path.join(ROOT, 'miniprogram/assets', p)
    if not os.path.exists(f):
        bad.append(f'{p} 不在包里')
        print(f'★ 缺文件 {p}')
        continue
    a = np.asarray(Image.open(f).convert('RGBA'))
    al, rgb = a[..., 3], a[..., :3].astype(int)
    drawn = al > 0
    n = al.size
    solid, semi, empty = (al == 255).sum() / n, ((al > 0) & (al < 255)).sum() / n, (al == 0).sum() / n
    # 贴着透明边的第 1 环：把"透明"那一层 3×3 膨胀一圈，与有画区相交的那些枚就是最外环
    ring1 = drawn & (np.asarray(Image.fromarray((~drawn).astype(np.uint8) * 255).filter(MaxFilter(3))) > 0)
    white_ring = (rgb >= 245).all(-1) & (al == 255) & ring1
    ring_pct = 100 * white_ring.sum() / max(1, ring1.sum())
    ring_rgb = rgb[ring1].mean(0).round(0) if ring1.sum() else '（没有边？）'
    # 有画的地方必须全是实心：半透像素＝0 才算压平（轮廓外那一片 alpha=0 是"边缘外部透明"，他要的就是这个）
    ok = semi == 0 and solid > 0 and ring_pct <= RING_WHITE_MAX
    print(f'{"✓" if ok else "★"} {p:22s} 实心 {100*solid:5.1f}%  半透 {100*semi:5.1f}%  全透 {100*empty:5.1f}%'
          f'  最外环 {ring1.sum():5d}px（近白实心占 {ring_pct:5.1f}%，均色 {ring_rgb}）')
    if semi or not solid:
        bad.append(f'{p} 还有 {100*semi:.1f}% 半透像素＝没压平，压在玻璃上会透出底下的照片')
    if ring_pct > RING_WHITE_MAX:
        bad.append(f'{p} 最外环 {ring_pct:.0f}% 是实心近白＝那圈白边又回来了（压平时"凡 α>0 就拉满"会把它造出来，'
                   f'α≤64 那一档必须整枚抠掉）')

print('\n' + (f'✓ {len(FILES)} 张插画全是实心、轮廓外透明、最外环也没有成片实心白——压平与白边两头都对得上' if not bad
      else f'!! 红 {len(bad)} 条：' + '；'.join(bad) + '\n   重烘一次：python3 docs/工具/烘-插画压平.py --从git <原件 commit> --写进包'))
sys.exit(0 if not bad else 1)
