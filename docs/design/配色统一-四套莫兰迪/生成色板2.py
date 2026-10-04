#!/usr/bin/env python3
# 四套莫兰迪 v2：按站长给的参考色卡（知乎·有设计 25/27/28 三列）把明度整体往下压、
# 深色那头往上抬，两头往中间收。撤掉蓝和紫，换一枚偏粉 + 一枚待挑的第四种。
#
# 口径仍然是"算出来的"：色相 H 从参考卡上印的 RGB 现读，明度/饱和曲线定一条、四套共用，
# 只有色相换。自检照旧：先复现现网那两个 --btn-bg，复现不了说明换算尺度和线上不是一套数。
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


# ---------- 参考卡：RGB 是卡上印的，逐条抄进来（不是我挑的） ----------
CARD = {
    '樱落': (212, 172, 191), '空谷幽兰': (215, 157, 164), '珊瑚粉': (231, 194, 216),
    '蜜糖': (176, 101, 90), '高丽红参': (135, 95, 94), '荷兰兔': (181, 168, 164),
    '画眉鸟': (129, 120, 111), '缅因猫': (162, 143, 129), '石灰': (167, 168, 160),
    '灰绿': (90, 111, 100), '豪雨': (189, 192, 201), '浅咖': (197, 180, 159),
    '淡米色': (214, 203, 183), '欢乐小鹿': (205, 184, 156), '迅捷': (228, 228, 225),
    '烟草黄': (128, 108, 75), '渝灰': (127, 123, 118), '魔力黑': (54, 60, 63),
    '夜巴黎': (70, 81, 105),
}
print('参考卡逐条换算（H 色相 / S 饱和 / L 明度，就是站长说的"明度"那一维）：')
for name, (r, g, b) in CARD.items():
    h, s, l = hsl(rgb2hex((r, g, b)))
    print(f'  {name:5s} #{r:02X}{g:02X}{b:02X}  H {h:5.1f}°  S {s:4.1f}  L {l:4.1f}')

# ---------- 自检：换算尺度和线上必须是同一套数 ----------
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

# ---------- 两档明度：甲＝在现网基础上往下挪一点；乙＝贴参考卡那一档 ----------
# 每档给的是"页面底 L / 卡 L / 五档色阶 L 序列 / 深色块 L"，S 一律按参考卡中位（20±）走。
LEVELS = {
    '甲·微降（现网 92~94 → 88）': {'page_l': 88.0, 'card_l': 96.5, 'steps_l': [93, 86, 77, 57, 45], 'btn_l': 36.5},
    '乙·贴参考卡（页面底 76，深色那头抬到 52）': {'page_l': 76.0, 'card_l': 93.0, 'steps_l': [86, 78, 68, 52, 42], 'btn_l': 52.0},
}

# 四枚色相：象牙/天青沿用现网那两个 H；粉按参考卡；第四种给两个候选
HUES = [
    ('象牙', 'Ivory', 40.0, '现网 tint-paper 的 H（官网 --paper）'),
    ('天青', 'Celadon', 132.0, '现网 tint-celadon 的 H'),
    ('樱落', 'Blush', hsl(rgb2hex(CARD['樱落']))[0], '参考卡「樱落」R212 G172 B191'),
]
CAND4 = [('风铃灰·橄榄', 'Olive', hsl(rgb2hex(CARD['石灰']))[0], '参考卡「石灰」R167 G168 B160'),
         ('豪雨·冷灰', 'Mist Grey', hsl(rgb2hex(CARD['豪雨']))[0], '参考卡「豪雨」R189 G192 B201')]


def build(label, en, h, page_s, page_l, card_l, steps_l, btn_l, btn_ink_mode):
    page = hsl2hex(h, page_s, page_l)
    card = hsl2hex(h, max(6, page_s * 0.5), card_l)
    ink = hsl2hex(h, min(30, page_s * 1.1), 17)
    steps = [hsl2hex(h, page_s * (1.15 if l < 60 else 1.0), l) for l in steps_l]
    inks = [PAPER if cr(PAPER, s) >= cr(ink, s) else ink for s in steps]
    btn = hsl2hex(h, min(34, page_s * 1.35), btn_l)
    btn_ink = PAPER if btn_ink_mode == 'paper' else ink
    return {'label': label, 'en': en, 'h': h, 'page': page, 'card': card, 'ink': ink,
            'steps': steps, 'inks': inks, 'btn': btn, 'btn_ink': btn_ink}


def report(t, lv):
    rows = [('墨字/页面底', cr(t['ink'], t['page'])), ('墨字/卡底', cr(t['ink'], t['card'])),
            ('卡底/页面底(分层够不够)', cr(t['card'], t['page'])),
            (f"按钮字({t['btn_ink']})/按钮", cr(t['btn_ink'], t['btn']))]
    rows += [(f'字{i + 1}档/第{i + 1}档', cr(t['inks'][i], t['steps'][i])) for i in (1, 2, 3, 4)]
    return f"  {t['label']:6s} " + '　'.join(f'{n} {v:.2f}' for n, v in rows)


SETS = {}
for lv_name, lv in LEVELS.items():
    sets = [build(l, e, h, 14.0, lv['page_l'], lv['card_l'], lv['steps_l'], lv['btn_l'],
                  'paper' if lv['btn_l'] < 45 else 'ink') for l, e, h, _ in HUES]
    sets4a = sets + [build(CAND4[0][0], CAND4[0][1], CAND4[0][2], 12.0, lv['page_l'], lv['card_l'],
                           lv['steps_l'], lv['btn_l'], 'paper' if lv['btn_l'] < 45 else 'ink')]
    sets4b = sets + [build(CAND4[1][0], CAND4[1][1], CAND4[1][2], 10.0, lv['page_l'], lv['card_l'],
                           lv['steps_l'], lv['btn_l'], 'paper' if lv['btn_l'] < 45 else 'ink')]
    SETS[lv_name] = (sets4a, sets4b)
    print(f'\n===== {lv_name}')
    print('  〔第四种候选甲：石灰那一族〕')
    for t in sets4a:
        print(report(t, lv))
    print('  〔第四种候选乙：豪雨那一族〕')
    for t in sets4b:
        print(report(t, lv))


def font(sz):
    for p in ('/System/Library/Fonts/STHeiti Light.ttc', '/System/Library/Fonts/PingFang.ttc'):
        if Path(p).exists():
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


F12, F14, F18, F22, F28 = font(12), font(14), font(18), font(22), font(28)

# ---------- 图一：现网 / 甲档 / 乙档 三行对照（一条＝一套：页面底 + 五档 + 按钮） ----------
NOW = [('象牙', '#F2EFE9', '#FCFBF8', '#241E16', ['#EAE0CE', '#D9C9AE', '#C2AA85', '#85644A', '#6A5334'], '#796641'),
       ('天青', '#E9EEEA', '#F7FAF7', '#1B2A21', ['#DDE7DF', '#C2D3C6', '#9FB8A6', '#54745D', '#40604A'], '#41794C'),
       ('雾蓝·撤', '#E8E8F0', '#F9F9FB', '#1B1C32', ['#DDDDE7', '#C2C3D3', '#9FA0B8', '#545574', '#404160'], '#414179'),
       ('藕荷·撤', '#F0EDF3', '#FBFBFC', '#2E223A', ['#E2DDE7', '#CAC2D3', '#AB9FB8', '#645474', '#504060'], '#5D4179')]

W, ROW = 1240, 118
img = Image.new('RGB', (W, 44 + ROW * 3 + 24), '#FFFFFF')
d = ImageDraw.Draw(img)
d.text((24, 14), '一条＝一套（左起 页面底 · 五档色阶 · 深色按钮）。上＝现网这四套；中＝甲·页面底 L88；下＝乙·页面底 L76（贴参考卡）',
       font=F14, fill='#222')


def row(y, label, items):
    d.text((24, y + 22), label, font=F18, fill='#333')
    x = 210
    for name, cols in items:
        for c in cols:
            d.rectangle([x, y, x + 42, y + 68], fill=c, outline='#E4E4E4')
            x += 42
        d.text((x - 42 * len(cols) + 2, y + 72), name, font=F12, fill='#555')
        x += 12


row(40, '现网', [(f"{n} L{hsl(pg)[2]:.0f}", [pg] + st + [btn]) for n, pg, cd, ik, st, btn in NOW])
lv_names = list(LEVELS)
for k, lv_name in enumerate(lv_names):
    row(40 + ROW * (k + 1), f'{k + 1} 档',
        [(f"{t['label']} L{hsl(t['page'])[2]:.0f}", [t['page']] + t['steps'] + [t['btn']]) for t in SETS[lv_name][0]])
img.save(OUT / '实测-明度两档对照.png')

# ---------- 图二：乙档四套的界面示意（同一屏，看落地感） ----------
def mock(t):
    CW, CH = 560, 700
    im = Image.new('RGB', (CW, CH), t['page'])
    g = ImageDraw.Draw(im)
    ink, card, page = t['ink'], t['card'], t['page']
    on_card = lambda a: blend(ink, card, a)
    on_page = lambda a: blend(ink, page, a)
    g.rounded_rectangle([24, 24, CW - 24, CH - 24], 28, fill=card, outline=on_page(0.16), width=2)
    g.text((56, 56), '我的笔记', font=F28, fill=ink)
    g.text((CW - 120, 60), '110', font=F28, fill=ink)
    g.text((CW - 78, 100), '魅力', font=F14, fill=on_card(0.55))
    g.text((56, 150), '笔记列表', font=F18, fill=ink)
    g.line([56, 182, 140, 182], fill=ink, width=3)
    g.text((160, 150), '笔记卡片', font=F18, fill=on_card(0.55))
    g.line([56, 190, CW - 56, 190], fill=on_card(0.12), width=1)
    for i, label in enumerate(['旅游', '生活', '私密', '未分类']):
        st = t['steps'][i] if i < 3 else ink
        g.ellipse([56 + i * 118, 214, 72 + i * 118, 230], fill=st)
        g.text((80 + i * 118, 212), label, font=F14, fill=on_card(0.8))
    g.text((56, 266), '2026年中秋节祝福语与问候图片大全', font=F18, fill=ink)
    g.text((56, 300), '本文汇集了2026年中秋节的多条温馨祝福语，配合', font=F14, fill=on_card(0.72))
    g.text((56, 324), '最美问候图片，传达花好月圆、阖家团圆的美好祝愿。', font=F14, fill=on_card(0.72))
    g.text((56, 356), '显示更多', font=F14, fill=ink)
    g.line([56, 378, 118, 378], fill=ink, width=1)
    field = blend(ink, card, 0.07)
    g.rounded_rectangle([56, 414, CW - 56, 470], 12, fill=field)
    g.text((76, 432), '标题', font=F18, fill=blend(ink, field, 0.55))
    g.rounded_rectangle([56, 500, 280, 560], 30, fill=field)
    g.text((140, 522), '取消', font=F18, fill=ink)
    g.rounded_rectangle([300, 500, CW - 56, 560], 30, fill=t['btn'])
    g.text((382, 522), '保存', font=F18, fill=t['btn_ink'])
    g.rounded_rectangle([40, CH - 104, CW - 40, CH - 44], 30, fill=on_page(0.86))
    g.ellipse([76, CH - 96, 116, CH - 56], fill=t['btn'])
    g.line([210, CH - 76, 234, CH - 76], fill=PAPER, width=3)
    g.line([222, CH - 88, 222, CH - 64], fill=PAPER, width=3)
    g.rectangle([280, CH - 90, 310, CH - 62], outline=PAPER, width=3)
    g.ellipse([350, CH - 90, 380, CH - 62], outline=PAPER, width=3)
    g.text((24, CH - 34), f"{t['label']}　底 {t['page']} L{hsl(t['page'])[2]:.0f}　卡 {t['card']}　按钮 {t['btn']}",
           font=F14, fill=on_page(0.75))
    return im


for tag, idx in (('甲', 0), ('乙', 1)):
    sets = SETS[lv_names[idx]][0]
    sheet = Image.new('RGB', (560 * 4 + 100, 760), '#FFFFFF')
    for i, t in enumerate(sets):
        sheet.paste(mock(t), (20 + i * 580, 20))
    sheet.save(OUT / f'实测-{tag}档四套界面示意.png')

print('\n出图：')
for p in ('实测-明度两档对照.png', '实测-甲档四套界面示意.png', '实测-乙档四套界面示意.png'):
    print(' ', OUT / p)
