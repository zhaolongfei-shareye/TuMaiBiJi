#!/usr/bin/env python3
# v4：站长拍了"甲档"（页面底 L86），按钮"深底白字 或 浅底深字"两条都点头可接受，
# 让我看还有什么问题。这一版不为出新色板，只为把两条路的**底栏那一格**画成各自真实的配色
# ——v3 那张甲档示意图里圆底用的是浅面、图标却仍是纸白，实测只有 2.46~2.88，不过 3.0 的图形门槛。
# 色值和 v3 完全同一套公式（自检照旧复现现网那两个 --btn-bg），只是这里只跑甲档 × 两种按钮面。
import colorsys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
PAPER = '#F2EFE9'
INK = '#23252C'


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
    """palette.js chromeOf().sel 现网那条：S 夹 [30,45]、L 写死 36.5。"""
    h, s, _ = hsl(page_hex)
    return hsl2hex(h, min(45, max(30, s)), 36.5)


def fit_dark(h, s, want=4.7, lo=5.0, hi=60.0):
    for _ in range(40):
        mid = (lo + hi) / 2
        if cr(PAPER, hsl2hex(h, s, mid)) < want:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def fit_light(h, s, ink, want=4.7, lo=40.0, hi=95.0):
    for _ in range(40):
        mid = (lo + hi) / 2
        if cr(ink, hsl2hex(h, s, mid)) < want:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


EXPECT = {'#F2EFE9': '#796641', '#E9EEEA': '#41794C'}
ok = True
for page, want in EXPECT.items():
    got = chrome_sel(page)
    flag = 'ok' if got.upper() == want.upper() else '不匹配'
    ok = ok and got.upper() == want.upper()
    print(f'自检 chromeOf().sel：{page} → {got}（app.wxss 写 {want}）[{flag}]')
if not ok:
    raise SystemExit('换算与线上不是一套数')

PAGE_L, PAGE_S = 86.0, 20.0
SET = [('象牙', 40.0, PAGE_S), ('天青', 132.0, PAGE_S),
       ('樱落', hsl('#D4ACBF')[0], PAGE_S), ('雨雾', hsl('#BDC0C9')[0], PAGE_S * 0.6)]

themes = []
for label, h, s in SET:
    ink = hsl2hex(h, min(34, s * 1.5), 16)
    page = hsl2hex(h, s, PAGE_L)
    card = hsl2hex(h, max(6, s * 0.45), min(98, PAGE_L + 9))
    themes.append({
        'label': label, 'h': h, 's': s, 'ink': ink, 'page': page, 'card': card,
        'light': hsl2hex(h, s * 1.25, fit_light(h, s * 1.25, ink)),
        'deep': hsl2hex(h, s * 1.25, fit_dark(h, s * 1.25)),
        'sel': chrome_sel(page),
    })

print('\n甲档 四枚（页面底 L86）：')
for t in themes:
    print(f"  {t['label']:3s} 底 {t['page']} 卡 {t['card']} 墨 {t['ink']}"
          f" | 浅面 {t['light']}(L{hsl(t['light'])[2]:.1f}) 墨字 {cr(t['ink'], t['light']):.2f}"
          f" 纸白图标 {cr(PAPER, t['light']):.2f}"
          f" | 深面 {t['deep']}(L{hsl(t['deep'])[2]:.1f}) 纸白 {cr(PAPER, t['deep']):.2f}"
          f" | 线上公式 sel {t['sel']}(L36.5) 纸白 {cr(PAPER, t['sel']):.2f}")


def font(sz):
    for p in ('/System/Library/Fonts/STHeiti Light.ttc', '/System/Library/Fonts/PingFang.ttc'):
        if Path(p).exists():
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


F12, F14, F18, F28 = font(12), font(14), font(18), font(28)
CW, CH = 560, 700


def mock(t, mode):
    """mode='deep' → 深底白字（按钮和底栏圆底同一支深面，图标继续纸白）
       mode='light' → 浅底深字（两支面都换成浅面，圆底里那枚图标翻成主题墨，
       没选中那三枚仍压在深色底栏上、继续纸白）"""
    face = t['deep'] if mode == 'deep' else t['light']
    glyph = PAPER if mode == 'deep' else t['ink']
    ink, card, page = t['ink'], t['card'], t['page']
    im = Image.new('RGB', (CW, CH), page)
    g = ImageDraw.Draw(im)
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
    for i, name in enumerate(['旅游', '生活', '私密', '未分类']):
        st = blend(ink, card, 0.0) if i == 3 else hsl2hex(t['h'], t['s'], PAGE_L - 9 + i * 5)
        g.ellipse([56 + i * 118, 214, 72 + i * 118, 230], fill=st)
        g.text((80 + i * 118, 212), name, font=F14, fill=on_card(0.82))
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
    g.rounded_rectangle([300, 500, CW - 56, 560], 30, fill=face)
    g.text((382, 522), '保存', font=F18, fill=glyph)
    # 底栏：圆底和按钮永远同一支面（这是 #304 那条决定的本意），面上的图形跟着反色
    bar = on_page(0.88)
    g.rounded_rectangle([40, CH - 104, CW - 40, CH - 44], 30, fill=bar)
    g.ellipse([76, CH - 96, 116, CH - 56], fill=face)
    g.line([88, CH - 76, 104, CH - 76], fill=glyph, width=3)
    g.line([96, CH - 84, 96, CH - 68], fill=glyph, width=3)
    # 没选中那三枚图形压在深色底栏上，永远纸白；只有圆底里那一枚要跟圆底反色
    g.line([210, CH - 76, 234, CH - 76], fill=PAPER, width=3)
    g.line([222, CH - 88, 222, CH - 64], fill=PAPER, width=3)
    g.rectangle([280, CH - 90, 310, CH - 62], outline=PAPER, width=3)
    g.ellipse([350, CH - 90, 380, CH - 62], outline=PAPER, width=3)
    cap = (f"{t['label']} 面 {face} L{hsl(face)[2]:.0f}｜图形/面 "
           f"{cr(glyph, face):.2f}（门槛 字4.5 图形3.0）｜墨字/页底 {cr(ink, page):.2f}")
    g.text((24, CH - 34), cap, font=F12, fill=on_page(0.8))
    return im


HEAD = {'deep': '路 A：深底白字 —— 按钮与底栏圆底都用"解到 4.7 的那支深面"，圆底里那枚图形继续纸白',
        'light': '路 B：浅底深字 —— 两支面都换浅，圆底里那枚图形必须翻成主题墨（纸白只剩 2.46~2.87，不过 3.0）；没选中那三枚仍纸白'}
for mode in ('deep', 'light'):
    sheet = Image.new('RGB', (560 * 4 + 20 * 5, 800), '#FFFFFF')
    d = ImageDraw.Draw(sheet)
    d.text((20, 8), HEAD[mode], font=F18, fill='#111')
    for i, t in enumerate(themes):
        sheet.paste(mock(t, mode), (20 + i * 580, 44))
    p = OUT / ('实测-甲档-路A深底白字.png' if mode == 'deep' else '实测-甲档-路B浅底深字.png')
    sheet.save(p)
    print('出图：', p)

print('\n线上公式 sel（L 写死 36.5）与"解到 4.7 的深面"的差：')
for t in themes:
    dl = hsl(t['deep'])[2] - 36.5
    print(f"  {t['label']:3s} sel {t['sel']} → 深面 {t['deep']}  Δ L {dl:+5.1f}"
          f"｜两色 RGB 距离 {sum((x - y) ** 2 for x, y in zip(hex2rgb(t['sel']), hex2rgb(t['deep']))) ** 0.5:.1f}")

print('\n外观设置那一排"色块"的分辨度（色块画的就是页面底，wallpaper.js:91）：')


def dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(hex2rgb(a), hex2rgb(b))) ** 0.5


print(f'  基线：现网他认过那对 象牙 #F2EFE9 ↔ 天青 #E9EEEA  RGB 距离 {dist("#F2EFE9", "#E9EEEA"):.1f}')
for i in range(len(themes)):
    for j in range(i + 1, len(themes)):
        a, b = themes[i], themes[j]
        print(f'  甲档 {a["label"]}↔{b["label"]}  {dist(a["page"], b["page"]):5.1f}'
              f'   乙档对照 {dist(hsl2hex(a["h"], a["s"], 78), hsl2hex(b["h"], b["s"], 78)):5.1f}')

print('\n还有一族按钮面没并进来（实测消费者）：')
print('  吃 --btn-bg 的 8 处：app.wxss:449, detail.wxss:71, me.wxss:472,'
      ' index.wxss:1067/1096/1413, categories.wxss:119/203')
print('  其中吃 --btn-ink 的 7 处（1096 那颗圆点不吃字色）：app.wxss:450, detail.wxss:72,'
      ' me.wxss:473, index.wxss:1068/1414, categories.wxss:118/202')
print('  特例 index.wxss:1090-1096：药丸开着那档的底是实心纸白 #F2EFE9，里面那颗圆点=var(--btn-bg)'
      '——面一浅，点就浮在白药丸上')
print("  吃 --solid-bg 的：palette.js:204 由 toneStyle 发（深色卡发 #FFFFFF），"
      'create.wxss:231 又本地写死 #23252c —— 新建页那三枚「保存/开始提炼」走这一族')
print('  --btn-ink 现在只有 app.wxss:70 一个全局值 #F2EFE9；路 B 要给每套主题各补一行')

print('\n那颗"药丸上的圆点"（index.wxss:1096，底是实心纸白）：')
for t in themes:
    print(f"  {t['label']:3s} 深面/纸白 {cr(PAPER, t['deep']):.2f}　浅面/纸白 {cr(PAPER, t['light']):.2f}　门槛 3.0")
