# 量参考图那一张的**结构比例**（不是量颜色）。为什么非要量：
# 上一版效果图我把上半照片那一段画成 43%，是我手拍的；站长说"风格与参考图一致"，
# 那么照片段/卡高/卡间距/缩略图边长/左槽宽这几档就得从他的图里取，不是我看着办。
# 折算：图 929px 宽 ⇒ 假定 CSS 视口 375（微信设计稿那一档），scale = 929/375 = 2.4773。
# 只做两件事：① 沿一条竖线找"亮→暗→亮"的边界（卡的面比板面略亮）；② 沿一条横线找左槽右界。
from PIL import Image
import sys

SCALE = 929 / 375.0
im = Image.open(sys.argv[1] if len(sys.argv) > 1
                else '/Users/zlfmac/Documents/TuMaiBiJi/docs/design/10-17列表合一/参考图-站长给的那张.jpg')
W, H = im.size
px = im.convert('RGB').load()


def lum(p):
    return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]


def col(x, y0, y1):
    return [(y, lum(px[x, y])) for y in range(y0, y1)]


def edges(series, min_gap=6, sign=None):
    """返回明显台阶的位置：与前后各 min_gap 采样的均值差超过阈值的点，再合并相邻。"""
    out = []
    n = len(series)
    thr = 5.0
    for i in range(min_gap, n - min_gap):
        a = sum(v for _, v in series[i - min_gap:i]) / min_gap
        b = sum(v for _, v in series[i + 1:i + 1 + min_gap]) / min_gap
        d = b - a
        if abs(d) > thr and (sign is None or (d > 0) == (sign > 0)):
            out.append((series[i][0], round(d, 1)))
    merged = []
    for y, d in out:
        if merged and y - merged[-1][0] < 24:
            continue
        merged.append((y, d))
    return merged


print('图', W, H, '⇒ CSS', round(W / SCALE, 1), round(H / SCALE, 1), 'scale', round(SCALE, 4))
print('\n【竖切 x=470（穿过卡片右半与缩略图左侧那条空档）】')
for y, d in edges(col(470, 0, H), 8):
    print('  y %5d px = %5.1f css   台阶 %+6.1f' % (y, y / SCALE, d))
print('\n【竖切 x=250（穿过卡片左半，含时间行与标题行）】')
for y, d in edges(col(250, 1300, H), 8):
    print('  y %5d px = %5.1f css   台阶 %+6.1f' % (y, y / SCALE, d))
print('\n【横切 y=1450（穿过一张卡的中间，找左槽右界与卡片右界）】')
row = [(x, lum(px[x, 1450])) for x in range(W)]
out = []
for i in range(8, W - 8):
    a = sum(v for _, v in row[i - 8:i]) / 8
    b = sum(v for _, v in row[i + 1:i + 9]) / 8
    if abs(b - a) > 5:
        out.append((i, round(b - a, 1)))
merged = []
for x, d in out:
    if merged and x - merged[-1][0] < 24:
        continue
    merged.append((x, d))
for x, d in merged:
    print('  x %5d px = %5.1f css   台阶 %+6.1f' % (x, x / SCALE, d))
