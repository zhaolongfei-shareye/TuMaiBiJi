#!/usr/bin/env python3
# 判据 3（需求清单 §三.3，站长原话「毛玻璃如果下方纯色，要进行渐变处理，不要一刀切」）：
# 拿截图**量交界处上下各一行**的亮度，看它是不是连续。硬边＝那一刀切。
#
# 跑法：python3 docs/工具/量-交界连续.py <png> --seam-y <rpx> --win <windowWidth,windowHeight>
#                                        [--x0 40 --x1 710] [--half 6] [--scan y0,y1]
#   --seam-y 是要查的那条线的 rpx 高度（首页罩层延段那条在 542；玻璃三档在 660／700／740）。
#   --half 是两侧各取多少 rpx 的行来比（避开线本身那一个像素）。
#   --win ＝ 这一屏的 windowWidth,windowHeight（视口 px，真跑尺子或 AB.json 里都读得到）。
#     ⚠ 不给这一对就会把 --seam-y 当成"从图顶量"，而截图顶上还有一截状态栏＋导航条：
#     10-11 第一版就是这么错的，量到的根本不是那条线。给了 --win，脚本自己按
#     图高/scale − windowHeight 补上那截。
#   --scan y0,y1 顺带把这一段每 2rpx 的读数打出来（一整条曲线比单点更难自欺）。
#
# ★横条统计量用的是**中位数**，不是均值（10-11 改的）：这一屏横条要跨过字才量得到整幅宽度，
#   而字是深色笔画——均值会被笔画拉下去，"上一行／下一行"哪一行正好压着字就凭空差出一档，
#   第一版就是被这个假硬边判出三条红。中位数只要字占的宽度不到一半，读到的还是那一行的底色。
#
# 读法：打印的是"线上一行 ／ 线本身 ／ 线下一行"三个读数与上下差。差值小＝连续；
#   ⚠ 门槛 6 灰阶（≈2.4%）是我定的分档，不是站长拍的数；他拍的是"不要一刀切"这件事本身。
# ⚠ 这一把只看**亮度**，看不看得到玻璃里的细节是 `量-玻璃糊没糊.py` 那一把的事，两把不许互替。
import argparse
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('png')
ap.add_argument('--seam-y', type=float, required=True)
ap.add_argument('--win', default='', help='视口宽,高（px），用来补上截图顶上那截')
ap.add_argument('--x0', type=float, default=40)
ap.add_argument('--x1', type=float, default=710)
ap.add_argument('--half', type=float, default=6)
ap.add_argument('--scan', default='', help='y0,y1（rpx）：顺带打这一段的逐行曲线')
a = ap.parse_args()

im = Image.open(a.png).convert('L')
W, H = im.size
R = W / 750.0                                   # 1rpx ＝ 多少图像素（横向就是这个比例）
chrome = 0.0
if a.win:
    ww, wh = [float(x) for x in a.win.split(',')]
    chrome = (H / (W / ww) - wh) * (W / ww)     # 截图顶上那截，直接换成图像素
    print(f'  视口 {ww}×{wh}　截图顶上那截 {chrome:.0f} 图像素')
else:
    raise SystemExit('!! 必须给 --win <windowWidth,windowHeight>：不给就没法补上截图顶上那截'
                     '（状态栏＋导航条），量到的不是那条线。10-11 第一版就栽在这里。')
y = round(a.seam_y * R + chrome)
x0, x1 = round(a.x0 * R), round(a.x1 * R)
if x1 > W:
    x1 = W - 1
if x1 - x0 < 8:
    raise SystemExit(f'!! 横段只有 {x1 - x0} 像素宽，取不到统计量')
gap = round(a.half * R)
import numpy as np
arr = np.asarray(im, dtype=float)


def band_read(yc, n=3):
    """取 yc 上下各 n 行、x0~x1 这一段，返回**中位数**。
    两层中位数：先每行取中位（躲开深色笔画），再对几行取中位（躲开压着一根发丝线/一条分隔线的情形）。
    10-11 审查抓到单行取样会被一根 1rpx 的细线判成"硬边"，就是这里补的。"""
    lo, hi = max(yc - n, 0), min(yc + n + 1, arr.shape[0])
    rows = [float(np.median(arr[ry, x0:x1])) for ry in range(lo, hi)]
    if not rows:
        raise SystemExit(f'!! y={yc} 这一行出界了')
    return float(np.median(rows))


if y - gap < 0 or y + gap >= H:
    raise SystemExit(f'!! 这条线（{a.seam_y}rpx → 像素 {y}）取样窗口出界，这张图不是这一屏')
up = band_read(y - gap)
down = band_read(y + gap)
line = band_read(y)
d = abs(up - down)
if min(up, down, line) >= 253:
    blk = arr[max(y - gap, 0):y + gap + 1, x0:x1]
    if np.median(blk) >= 255 and np.percentile(blk, 95) >= 255:
        # 真·平色：整块九成像素是**恰好 255**（不是 254 那种"白纱压浅底"，那说明图在、只是浅）。
        # 在这种帧上量"上下连不连续"没有意义——底下压根没画那张形象图（10-11 审查抓到的 P0）。
        raise SystemExit(f'!! 这条线上下整块 {(blk == 255).mean() * 100:.0f}% 是纯白 255＝那张形象图没画进这一帧，'
                         '判不了硬边。用 `拍-玻璃AB.js`（它把 bgSrc 钉成包内那张）重拍再来。')
    print(f'  ⚠ 这条线上下都接近纯白（{up:.0f}/{line:.0f}/{down:.0f}），"连续"这一条在这里几乎无从分辨——'
          '读数照给，但别拿它当"图在那儿"的证据。')
print(f'{a.png}')
print(f'  交界 y＝{a.seam_y}rpx（像素 {y}）　横段 x {a.x0}~{a.x1}rpx　上下各取 {a.half}rpx、每块再取 ±3 行的中位')
print(f'  线上一行 {up:6.1f}　线本身 {line:6.1f}　线下一行 {down:6.1f}　｜上下差 {d:5.2f}（8 位灰阶）')
print(f'  判读：{"连续，没有硬边" if d <= 6 else "★这一条线上有硬边＝一刀切（撞 R6）"}'
      f'　（门槛 ≤6 灰阶＝我定的分档，约 2.4%）')
if a.scan:
    s0, s1 = [float(v) for v in a.scan.split(',')]
    print(f'\n  曲线（每 2rpx 一个读数，同一横段）：')
    prev = None
    yy = s0
    while yy <= s1:
        py = round(yy * R + chrome)
        if 0 <= py < H:
            v = band_read(py, 1)
            jump = '' if prev is None else f'　Δ {v - prev:+5.1f}'
            mark = ' ←线' if abs(yy - a.seam_y) < 1 else ''
            print(f'    {yy:6.0f}rpx（像素 {py:4d}）　{v:6.1f}{jump}{mark}')
            prev = v
        yy += 2
if d > 6:
    raise SystemExit(f'!! 这一条线上有硬边（上下差 {d:.2f} 灰阶）＝撞 R6"不要一刀切"')
