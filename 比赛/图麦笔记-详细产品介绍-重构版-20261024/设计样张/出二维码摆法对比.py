# -*- coding: utf-8 -*-
"""右上角那枚小程序码：去白底之后还能不能扫，四种摆法各拍一张，对比度逐像素量。

底图＝封面整页在"码隐藏"状态下的渲染（/tmp/qr-bg.png），四格墙面·纱·字体同源，只有码这一枚不同。
量法＝先按每一格自己的参照底（有白圆就用白圆，没有就用墙面）拍一张"只有底"的图，
再逐像素比"码压过之后"与"底"：暗点取压暗 ≥15% 的像素，亮点取提亮 ≥15% 的像素，
报中位与最差 5% 分位。⚠ 上一版这里有个 bug：圆形白底那一格我拿墙面当了参照，读数假低。
"""
import base64, io, json, os
from PIL import Image, ImageDraw

ROOT = '/Users/zlfmac/Documents/TuMaiBiJi/比赛/图麦笔记-详细产品介绍-重构版-20261024'
BASE = '/tmp/qr-bg.png'
DARK = os.path.join(ROOT, '素材/品牌小程序码.png')
LIGHT = os.path.join(ROOT, '素材/品牌小程序码-亮墨.png')
OUT = os.path.join(ROOT, '设计样张/封面方向7/二维码四种摆法.html')
S = 168
CREAM = (247, 244, 237)


def srgb(c):
    c /= 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def lum(px):
    r, g, b = px[:3]
    return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)


def ratio(x, y):
    lx, ly = lum(x), lum(y)
    hi, lo = max(lx, ly), min(lx, ly)
    return (hi + 0.05) / (lo + 0.05)


base = Image.open(BASE).convert('RGBA')


def with_disc(im):
    disc = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(disc).ellipse((0, 0, S - 1, S - 1), fill=(244, 241, 234, 255))
    return im, disc


def build(xy, asset, white=False):
    ref = base.copy()
    if white:
        # 圆要外扩一圈：小程序码那点阵不是内切圆（右下那枚绿色小徽标顶到方框角上），
        # 圆画得跟码一样大的时候，四角外扩的码点会落到暗墙上——第一版乙就是这么被量成 2.11 的。
        r = int(S * 0.76)
        d = Image.new('RGBA', (2 * r, 2 * r), (0, 0, 0, 0))
        ImageDraw.Draw(d).ellipse((0, 0, 2 * r - 1, 2 * r - 1), fill=(244, 241, 234, 255))
        ref.alpha_composite(d, (xy[0] + S // 2 - r, xy[1] + S // 2 - r))
    comp = ref.copy()
    comp.alpha_composite(Image.open(asset).convert('RGBA').resize((S, S)), xy)
    return ref.convert('RGB'), comp.convert('RGB')


def measure(ref, comp, xy, asset, light_ink):
    """着墨像素＝素材 α>128，且（暗码时）那一点自己的颜色接近黑。
    不加这一道筛会把码心那枚彩色标识和右下那枚绿色徽标也算成"码点"——它们本来就该和底差不多亮，
    中位数会被拉到 2 上下（第一版乙就是这么读出 2.04 的）。亮码版整枚都是同一支亮墨，直接按 α 筛。"""
    raw = Image.open(asset).convert('RGBA').resize((S, S))
    px = raw.load()
    k = S / 344.0
    cx, cy, cr = 180 * k, 180 * k, 80 * k          # 码心那枚四色标识
    bx0, by0, bx1, by1 = 236 * k, 236 * k, 315 * k, 315 * k   # 右下那枚小程序徽标
    rs = []
    for y in range(S):
        for x in range(S):
            r, g, b, al = px[x, y]
            if al <= 128:
                continue
            if (x - cx) ** 2 + (y - cy) ** 2 < cr ** 2 or (bx0 <= x <= bx1 and by0 <= y <= by1):
                continue      # 标识与徽标不是点阵，不参与"码点对底"的读数
            if not light_ink and (0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)) > 0.06:
                continue
            rs.append(ratio(comp.getpixel((xy[0] + x, xy[1] + y)), ref.getpixel((xy[0] + x, xy[1] + y))))
    rs.sort()
    m = len(rs)
    return {'点数': m, '中位': round(rs[m // 2], 2), '最差5%': round(rs[int(m * 0.05)], 2)}


cases = [
    ('甲', '黑码点 · 去白底 · 留右上', (1036, 70), DARK, False, False,
     '就是"去白底"最直白的做法。墙面被纱压到 0.08 亮度，黑点只剩 2 比 1，纸上多数手机扫不出。'),
    ('乙', '黑码点 · 圆形白底 · 留右上', (1036, 70), DARK, False, True,
     '白底不是方块，是一枚把码整个包住的圆（码点阵不是内切圆，圆画小一圈就会漏掉右下那枚绿色徽标）。对比最高，能扫；代价是你要的"去白底"没做到。'),
    ('丙', '黑码点 · 去白底 · 挪到亮柱', (76, 300), DARK, False, False,
     '上半部墙面最亮的 168 方块在那根被太阳照到的柱子上，读数最好；代价是左上角字标下面要再压一枚码。'),
    ('丁', '亮墨码点 · 去白底 · 留右上', (1036, 70), LIGHT, True, False,
     '按站长那句"色阶用反差"：官方接口本来就有 line_color（默认黑）与 is_hyaline（透明底）两档，这枚是把墨色换成封面同一支亮色、几何一个像素没动。')]

cells, readings = [], {}
for tag, name, xy, asset, light_ink, white, note in cases:
    ref, comp = build(xy, asset, white)
    r = measure(ref, comp, xy, asset, light_ink)
    readings[tag] = r
    crop = comp.crop((xy[0] - 22, xy[1] - 22, xy[0] + S + 22, xy[1] + S + 46))
    buf = io.BytesIO()
    crop.save(buf, 'PNG')
    uri = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
    cells.append(f'<figure><img src="{uri}" alt="{name}"><figcaption><b>{tag}｜{name}</b>'
                 f'<span>码点对底：中位 {r["中位"]}:1 ／ 最差5% {r["最差5%"]}:1</span><i>{note}</i></figcaption></figure>')

html = ('<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>二维码四种摆法</title><style>'
        'body{margin:0;padding:30px;background:#141614;color:#eae6dd;font-family:"Hiragino Sans GB",sans-serif}'
        'h1{font-size:24px;margin:0 0 6px}p.sub{font-size:15px;color:#b9b3a8;margin:0 0 22px;max-width:900px;line-height:1.7}'
        '.row{display:flex;gap:26px;align-items:flex-start}figure{margin:0;width:212px}'
        'figure img{width:212px;height:auto;display:block;border:1px solid #3a3d38}'
        'figcaption{margin-top:12px}figcaption b{display:block;font-size:16px;line-height:1.5}'
        'figcaption span{display:block;font-size:14px;color:#e8b48f;margin:6px 0}'
        'figcaption i{display:block;font-style:normal;font-size:13px;line-height:1.7;color:#a9a398}'
        '</style></head><body><h1>右上角那枚小程序码：去白底以后还能不能扫</h1>'
        '<p class="sub">四格底图同源（同一张封面、同一层纱、同一套字），只有码这一枚不同。对比度是逐像素量的，'
        '不是估的。WCAG 正文门槛 4.5:1；扫码还要看印刷批次与环境光，所以这数只能用来排序，不能当"一定能扫"的担保。</p>'
        '<div class="row">' + ''.join(cells) + '</div></body></html>')
open(OUT, 'w', encoding='utf-8').write(html)
print('读数', json.dumps(readings, ensure_ascii=False))
print('产物', OUT, os.path.getsize(OUT))
