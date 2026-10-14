#!/usr/bin/env python3
# 首屏大标题那张图片字（站长 10-15 01:4x「大标题变成透明底的图片文字，去白底…70%透明度」）。
# 源件是他给的一张 2048 见方**白底**书法字（中文两句＋英文一句，中英文都显示同一张）。
# 这一步做三件事：白底抠成透明、按内容包围盒裁掉四周留白、缩到屏上要用的宽度。
# 墨色统一刷成品牌那支墨（#14161A），不保留源件里每像素的灰——源件是黑墨，留着只是多一档噪声，
# 而统一之后 PNG 压得更小（这一枚要进主包，包已经 1.4MB）。
# 70% 透明度**不在这里烘进 alpha**：那是屏上的事，写在 wxss 的 opacity 里，改档不用重出图。
import sys
from PIL import Image

SRC = 'docs/design/10-15标题字/源件-书法字-白底.png'
OUT = 'miniprogram/assets/title-heading.png'
INK = (20, 22, 26)
WHITE, BLACK = 250.0, 26.0      # 这条罩子之下算全不透明，之上算全透
FLOOR = 10                      # 低于这一档的残墨直接归零（源件底色不是纯白，有一层极浅的渐晕）
BOX_A = 40                      # 量包围盒只认到这一档：不然那圈渐晕会把画布撑大、白留一堆


def build(width_px, margin=8):
    im = Image.open(SRC).convert('L')
    w, h = im.size
    px = im.load()
    out = Image.new('RGBA', (w, h), INK + (0,))
    op = out.load()
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            a = (WHITE - px[x, y]) * 255.0 / (WHITE - BLACK)
            a = 0 if a <= FLOOR else (255 if a >= 255 else int(a))
            if a:
                op[x, y] = INK + (a,)
                if a >= BOX_A:
                    if x < minx: minx = x
                    if x > maxx: maxx = x
                    if y < miny: miny = y
                    if y > maxy: maxy = y
    out = out.crop((max(0, minx - margin), max(0, miny - margin),
                    min(w, maxx + 1 + margin), min(h, maxy + 1 + margin)))
    ar = out.size[1] / out.size[0]
    out = out.resize((width_px, max(1, round(width_px * ar))), Image.LANCZOS)
    # 存成"灰度＋逐像素透明"（LA）：这一枚本来就只有一种墨色，亮度恒给 20、透明度单独一档，
    # 比 RGBA 小一半（实测 132KB → 75KB）。亮度取 #14161A 的感知亮度 22（Rec.601），
    # 与那支墨的色差在 G/B 两个通道上各差 4／255 以内，屏上还是压在 70% 不透明度下 —— 看不出来。
    la = Image.merge('LA', [Image.new('L', out.size, 22), out.getchannel('A')])
    la.save(OUT, optimize=True)
    return out.size, ar


if __name__ == '__main__':
    W = int(sys.argv[1]) if len(sys.argv) > 1 else 822
    size, ar = build(W)
    import os
    print(f'输出 {OUT}  {size[0]}×{size[1]}px  纵横比 {ar:.4f}  '
          f'{os.path.getsize(OUT) / 1024:.1f} KB')
    print(f'屏上按宽 {size[0] / 2:.0f}rpx 时高 {size[0] / 2 * ar:.1f}rpx（2x 折算）')
