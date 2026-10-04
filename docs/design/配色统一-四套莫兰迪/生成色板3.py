#!/usr/bin/env python3
# 四套莫兰迪 v3：撤蓝紫、进一枚粉，并把明度整体往下压（站长 10-04 两条口：参考国际大牌与
# 莫兰迪、降低色彩明度、不要太深）。参考色卡是站长附的那张三列卡（知乎·有设计 25/27/28），
# 每格的 RGB 卡上印着，逐条抄进来当色相种子——不是我挑的色。
#
# 关键做法：**明度不由手感定，由 WCAG 反解**。每个"上面要压字"的面（按钮、色阶深两档）
# 都在给定色相/饱和下解出"刚好 4.7:1"的那个 L，所以既拿到最浅的合规值、又不会不达标。
# 自检照旧：先复现现网那两个 --btn-bg，复现不了说明这把尺子和线上不是一套数。
import colorsys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
PAPER = '#F2EFE9'


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb2hex(rgb):
    return '#%02X%02X%02X' % tuple(max(0, min(255, round(v))) for v in rgb)


def hsl(hexv):
    r, g, b = (v / 255 for v in hex2rgb(hexv))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return (h * 360) % 360, s * 100, l * 100


def hsl2hex(h, s, l):
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360, l / 100, s / 100)
    return rgb2hex((r * 255, g * 255, b * 255))


def lum(hexv):
    def ch(v):
        v /= 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = hex2rgb(hexv)
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def cr(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def blend(fg_hex, bg_hex, a):
    f, b = hex2rgb(fg_hex), hex2rgb(bg_hex)
    return rgb2hex(tuple(a * x + (1 - a) * y for x, y in zip(f, b)))


def chrome_sel(page_hex):
    """palette.js chromeOf().sel 现网那条：S 夹 [30,45]、L = 20.5 + 16。"""
    h, s, _ = hsl(page_hex)
    return hsl2hex(h, min(45, max(30, s)), 36.5)


def fit_dark(h, s, want=4.7, lo=5.0, hi=60.0):
    """压纸白字的那一面：解出刚好 want:1 的明度（越浅越不合格，所以往下夹）。"""
    for _ in range(40):
        mid = (lo + hi) / 2
        if cr(PAPER, hsl2hex(h, s, mid)) < want:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def fit_light(h, s, ink, want=4.7, lo=40.0, hi=95.0):
    """压主题墨的那一面：解出刚好 want:1 的明度（越深越不合格）。"""
    for _ in range(40):
        mid = (lo + hi) / 2
        if cr(ink, hsl2hex(h, s, mid)) < want:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


# ---------- 站长附的参考色卡：RGB 逐条照抄（风铃灰那格 R 被水印盖住，没用） ----------
CARD = {
    '樱落': (212, 172, 191), '空谷幽兰': (215, 157, 164), '珊瑚粉': (231, 194, 216),
    '蜜糖': (176, 101, 90), '荷兰兔': (181, 168, 164), '画眉鸟': (129, 120, 111),
    '缅因猫': (162, 143, 129), '石灰': (167, 168, 160), '灰绿': (90, 111, 100),
    '豪雨': (189, 192, 201), '浅咖': (197, 180, 159), '淡米色': (214, 203, 183),
    '迅捷': (228, 228, 225), '烟草黄': (128, 108, 75), '魔力黑': (54, 60, 63),
    '夜巴黎': (70, 81, 105),
}
print('参考卡换算（L 就是"明度"那一维；现网四套的页面底 L 是 92~94，比这张卡最高那格还高）：')
for name, (r, g, b) in CARD.items():
    h, s, l = hsl(rgb2hex((r, g, b)))
    print(f'  {name:5s} #{r:02X}{g:02X}{b:02X}  H {h:5.1f}°  S {s:4.1f}  L {l:4.1f}')

EXPECT = {'#F2EFE9': '#796641', '#E9EEEA': '#41794C'}
print('\n自检 chromeOf().sel：')
ok = True
for page, want in EXPECT.items():
    got = chrome_sel(page)
    flag = 'ok' if got.upper() == want.upper() else '不匹配'
    print(f'  页面底 {page} → sel {got}，app.wxss 写的是 {want}　[{flag}]')
    ok = ok and got.upper() == want.upper()
if not ok:
    raise SystemExit('换算与线上不是一套数，先修这里')

# ---------- 三档页面底明度：现网 / 甲 / 乙（乙＝卡上「樱落·空谷幽兰」那一档） ----------
LEVELS = [('现网', 93.0), ('甲', 86.0), ('乙', 78.0)]
# L 降下来之后 S 要略抬，否则只会变灰不变色。四枚共用同一个 S，只差色相——
# 这就是"一家人"这件事的算法保证。
PAGE_S = {'现网': 20.0, '甲': 20.0, '乙': 22.0}

HUES = [
    ('象牙', 'Ivory', 40.0, '现网 tint-paper 的 H（官网 --paper #F2EFE9）'),
    ('天青', 'Celadon', 132.0, '现网 tint-celadon 的 H'),
    ('樱落', 'Blush', hsl(rgb2hex(CARD['樱落']))[0], '参考卡「樱落」R212 G172 B191'),
]
SLOT4 = [('雨雾', 'Mist', hsl(rgb2hex(CARD['豪雨']))[0], '参考卡「豪雨」R189 G192 B201'),
         ('风铃', 'Olive', hsl(rgb2hex(CARD['石灰']))[0], '参考卡「石灰」R167 G168 B160'),
         ('蜜糖', 'Clay', hsl(rgb2hex(CARD['蜜糖']))[0], '参考卡「蜜糖」R176 G101 B90')]


def hue_gap(h, others):
    """这一枚和另外几枚在色相环上的最小夹角——越大越不撞。"""
    return min(min(abs(h - o), 360 - abs(h - o)) for o in others)


BASE_H = [h for _, _, h, _ in HUES]
print('\n第四种三个候选的"离另外三枚多远"（色相环最小夹角，越大越不撞）：')
for label, en, h, note in SLOT4:
    print(f'  {label:4s} H {h:5.1f}°  最小夹角 {hue_gap(h, BASE_H):5.1f}°　来源 {note}')


def build(label, en, h, s, page_l, note):
    ink = hsl2hex(h, min(34, s * 1.5), 16)
    page = hsl2hex(h, s, page_l)
    card = hsl2hex(h, max(6, s * 0.45), min(98, page_l + 9))
    steps = []
    for i, l in enumerate([page_l + 6, page_l - 1, page_l - 9, None, None]):
        if l is None:
            # 深两档要压纸白字（方块上那行分类名 16px/800，按 WCAG 算小字，门槛 4.5）→ 反解
            l = fit_dark(h, s * (1.0 if i == 3 else 0.85)) - (0 if i == 3 else 6)
        steps.append(hsl2hex(h, s * (1.0 if l >= 60 else 1.15), l))
    inks = [ink if cr(ink, x) >= cr(PAPER, x) else PAPER for x in steps]
    # 按钮面给两种：浅的那支压主题墨字、深的那支压纸白字，都解到 4.7，取哪个由他挑
    btn_light = hsl2hex(h, s * 1.25, fit_light(h, s * 1.25, ink))
    btn_deep = hsl2hex(h, s * 1.25, fit_dark(h, s * 1.25))
    return {'label': label, 'en': en, 'h': h, 's': s, 'note': note, 'page': page, 'card': card,
            'ink': ink, 'steps': steps, 'inks': inks,
            'btn_light': btn_light, 'btn_light_ink': ink,
            'btn_deep': btn_deep, 'btn_deep_ink': PAPER}


def report(t):
    rows = [('墨字/页底', cr(t['ink'], t['page'])), ('卡/页底(分层)', cr(t['card'], t['page'])),
            ('浅按钮 墨字/面', cr(t['btn_light_ink'], t['btn_light'])),
            ('深按钮 纸白/面', cr(t['btn_deep_ink'], t['btn_deep'])),
            ('第4档 字/面', cr(t['inks'][3], t['steps'][3])),
            ('第5档 字/面', cr(t['inks'][4], t['steps'][4]))]
    return f"  {t['label']:4s} " + '　'.join(f'{n} {v:.2f}' for n, v in rows)


TABLES = {}
for name, page_l in LEVELS:
    sets = [build(l, e, h, PAGE_S[name], page_l, note) for l, e, h, note in HUES]
    for c in SLOT4:
        sets.append(build(c[0], c[1], c[2], PAGE_S[name] * 0.6, page_l, c[3]))
    TABLES[name] = sets
    print(f"\n===== 页面底 L{page_l}　S{PAGE_S[name]}　（{name}）")
    for t in sets:
        print(report(t))
    print('  色值：')
    for t in sets:
        print(f"    {t['label']:4s} 底 {t['page']} 卡 {t['card']} 墨 {t['ink']} 五档 {' '.join(t['steps'])} "
              f"浅按钮 {t['btn_light']}(L{hsl(t['btn_light'])[2]:.0f}) 深按钮 {t['btn_deep']}(L{hsl(t['btn_deep'])[2]:.0f})")


def font(sz):
    for p in ('/System/Library/Fonts/STHeiti Light.ttc', '/System/Library/Fonts/PingFang.ttc'):
        if Path(p).exists():
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


F12, F14, F18, F28 = font(12), font(14), font(18), font(28)

# ---------- 图一：三档明度对照（一条＝一套：页面底 · 五档 · 浅按钮 · 深按钮） ----------
W, ROW = 2080, 118
img = Image.new('RGB', (W, 36 + ROW * 3 + 20), '#FFFFFF')
d = ImageDraw.Draw(img)
d.text((24, 12), '一条＝一套（左起 页面底 · 五档色阶 · 浅按钮 · 深按钮）。每行后三枚＝"第四种"的三个候选。'
                '现网那行是按同一公式重算的明度参照，不是包里的原值。所有要压字的面，明度由 WCAG 4.7 反解',
       font=F14, fill='#222')


def row(y, label, sets):
    d.text((24, y + 22), label, font=F18, fill='#333')
    x = 190
    for t in sets:
        cols = [t['page']] + t['steps'] + [t['btn_light'], t['btn_deep']]
        for c in cols:
            d.rectangle([x, y, x + 38, y + 66], fill=c, outline='#E4E4E4')
            x += 38
        d.text((x - 38 * len(cols) + 2, y + 70), f"{t['label']} L{hsl(t['page'])[2]:.0f}", font=F12, fill='#555')
        x += 10


for k, (name, page_l) in enumerate(LEVELS):
    row(32 + ROW * k, f'{name}　L{page_l}', TABLES[name])
img.save(OUT / '实测-明度三档对照.png')


# ---------- 图二：界面示意（每档一张五联屏；按钮画"浅"那一支） ----------
def mock(t):
    CW, CH = 560, 700
    im = Image.new('RGB', (CW, CH), t['page'])
    g = ImageDraw.Draw(im)
    ink, card, page = t['ink'], t['card'], t['page']
    on_card = lambda a: blend(ink, card, a)
    on_page = lambda a: blend(ink, page, a)
    g.rounded_rectangle([24, 24, CW - 24, CH - 24], 28, fill=card, outline=on_page(0.18), width=2)
    g.text((56, 56), '我的笔记', font=F28, fill=ink)
    g.text((CW - 120, 60), '110', font=F28, fill=ink)
    g.text((CW - 78, 100), '魅力', font=F14, fill=on_card(0.6))
    g.text((56, 150), '笔记列表', font=F18, fill=ink)
    g.line([56, 182, 140, 182], fill=ink, width=3)
    g.text((160, 150), '笔记卡片', font=F18, fill=on_card(0.55))
    g.line([56, 190, CW - 56, 190], fill=on_card(0.14), width=1)
    for i, label in enumerate(['旅游', '生活', '私密', '未分类']):
        st = t['steps'][i] if i < 3 else ink
        g.ellipse([56 + i * 118, 214, 72 + i * 118, 230], fill=st)
        g.text((80 + i * 118, 212), label, font=F14, fill=on_card(0.82))
    g.text((56, 266), '2026年中秋节祝福语与问候图片大全', font=F18, fill=ink)
    g.text((56, 300), '本文汇集了2026年中秋节的多条温馨祝福语，配合', font=F14, fill=on_card(0.74))
    g.text((56, 324), '最美问候图片，传达花好月圆、阖家团圆的美好祝愿。', font=F14, fill=on_card(0.74))
    g.text((56, 356), '显示更多', font=F14, fill=ink)
    g.line([56, 378, 118, 378], fill=ink, width=1)
    field = blend(ink, card, 0.07)
    g.rounded_rectangle([56, 414, CW - 56, 470], 12, fill=field)
    g.text((76, 432), '标题', font=F18, fill=blend(ink, field, 0.55))
    g.rounded_rectangle([56, 500, 280, 560], 30, fill=field)
    g.text((140, 522), '取消', font=F18, fill=ink)
    g.rounded_rectangle([300, 500, CW - 56, 560], 30, fill=t['btn_light'])
    g.text((382, 522), '保存', font=F18, fill=t['btn_light_ink'])
    g.rounded_rectangle([40, CH - 104, CW - 40, CH - 44], 30, fill=on_page(0.88))
    g.ellipse([76, CH - 96, 116, CH - 56], fill=t['btn_light'])
    g.line([210, CH - 76, 234, CH - 76], fill=PAPER, width=3)
    g.line([222, CH - 88, 222, CH - 64], fill=PAPER, width=3)
    g.rectangle([280, CH - 90, 310, CH - 62], outline=PAPER, width=3)
    g.ellipse([350, CH - 90, 380, CH - 62], outline=PAPER, width=3)
    g.text((24, CH - 34), f"{t['label']}　底 {t['page']} L{hsl(page)[2]:.0f}　卡 {t['card']}　按钮 {t['btn_light']}",
           font=F14, fill=on_page(0.8))
    return im


for name, _ in LEVELS:
    sheet = Image.new('RGB', (560 * len(TABLES[name]) + 20 * (len(TABLES[name]) + 1), 760), '#FFFFFF')
    for i, t in enumerate(TABLES[name]):
        sheet.paste(mock(t), (20 + i * 580, 20))
    sheet.save(OUT / f'实测-{name}档界面示意.png')

print('\n出图：')
for p in ('实测-明度三档对照.png',) + tuple(f'实测-{n}档界面示意.png' for n, _ in LEVELS):
    print(' ', OUT / p)
