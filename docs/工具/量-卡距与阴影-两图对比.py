#!/usr/bin/env python3
# 「每条笔记的面板阴影太厚，上下面板几乎连起来」——站长 10-17 这一句的尺子。
# 跑法：python3 docs/工具/量-卡距与阴影-两图对比.py [现网截图路径]
#   不给路径 → 量改之前那一张（2.3.1 实测）；改完重跑真跑出新图，把路径传进来就是"改之后"。
#
# 三个对象，两档读法：
#   乙／丙 自动切段——卡面是实心 252，一条竖带就能把卡与缝分开，改前改后同一把尺子比。
#   甲 站长那张原件**切不出自动段**：它的卡是一层磨砂半透面，亮度随背后照片在 223→242 一路漂，
#      任何固定亮度区间都会把一张卡切成两截、或把两张并成一张（硬切过，读数假到不能当判据）。
#      所以甲只留手工读数，它的用处是"缝里该有多干净"这个目标值。
import sys
from PIL import Image

ROOT = '/Users/zlfmac/Documents/TuMaiBiJi'
LIVE_DEFAULT = ROOT + '/docs/design/10-17列表合一/实测/实测-真数据列表-2.3.1.png'


def lum(p):
    return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]


def auto(tag, path, x0, x1, y0, y1, pxr, ox0, ox1, dmin=4.0):
    """判"这一行是不是卡面"用的是**卡内与卡外差多少**，不是"亮过多少"：
       五档心情各有一支浅面（`--glass-plate-dock`）——墨档那支是半透白，压在面板上比面板**亮** 9 级；
       雨雾那支带彩，压上去比面板**暗** 17 级。写死区间或只认"更亮"，换一档就切出 0 张卡
       （10-17 17:2x 那张雨雾档就是这么红的）。所以取绝对差：卡面与面板底只要不一样就算卡。
       卡外那一条竖带与卡内那一条同一行、垫同一块面板底，落点漂移那部分自己抵消。"""
    px = Image.open(path).convert('RGB').load()
    n, m = x1 - x0, ox1 - ox0
    inn = [(y, sorted(lum(px[x, y]) for x in range(x0, x1))[n // 2]) for y in range(y0, y1)]
    out = {y: sorted(lum(px[x, y]) for x in range(ox0, ox1))[m // 2] for y in range(y0, y1)}
    prof = [(y, v - out[y]) for y, v in inn]
    segs, cur = [], None
    for i, (y, d) in enumerate(prof):
        on = abs(d) >= dmin
        if cur is None or cur[0] != on:
            if cur:
                segs.append(cur)
            cur = [on, i, i]
        else:
            cur[2] = i
    if cur:
        segs.append(cur)
    cards = [s for s in segs if s[0] and s[2] - s[1] >= 20]
    print(f'\n=== {tag}  {path.split("/")[-1]}  {pxr:.4f}px/rpx  切出 {len(cards)} 张卡 ===')
    for i in range(len(cards) - 1):
        a, b = cards[i], cards[i + 1]
        ybot, ytop = prof[a[2]][0], prof[b[1]][0]
        seg = [inn[i][1] for i in range(a[2], b[1] + 1)]
        dark = min(seg)
        panel = sorted(seg)[int(len(seg) * 0.6)]
        print(f'  卡高 {(a[2]-a[1]+1)/pxr:6.1f}rpx → 净距 {(ytop-ybot-1)/pxr:5.1f}rpx'
              f'　缝里最低 {dark:.1f}＝比这一段面板底（{panel:.1f}）暗 {panel-dark:.1f} 级')


print('甲 站长给的参考原件（手工读数；929px 宽＝750rpx，竖带取 x∈[250,285) 那条纯卡面区）')
print('  卡 1 y∈[972,1135]＝132.2rpx 高；缝 y∈[1136,1171]＝29.1rpx 净距')
print('  缝里那 36 行一路是 238／240／241／242＝与面板底同一档 ⇒ 那张的缝里**没有暗环**')
print('  （卡面本身 223～232，比面板底还暗一档：那张靠"卡比底暗"分层，不靠一圈投影）')

auto('乙 我上一轮那张稿（乙·优化版）',
     '/Users/zlfmac/Downloads/截图/Snapzy_2026-10-17_12-54-54_016.png',
     196, 214, 1150, 1700, 767 / 750.0, 160, 178)
auto('丙 现网这一屏', sys.argv[1] if len(sys.argv) > 1 else LIVE_DEFAULT,
     132, 150, 860, 1560, 734 / 750.0, 716, 730)
