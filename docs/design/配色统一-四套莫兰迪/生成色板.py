#!/usr/bin/env python3
# 四套莫兰迪淡雅色板的推导器（方案用，不写进小程序）。
# 做法：象牙 / 天青 两套是他已经认过的淡雅档，原样保留；另外两套的**明度/饱和曲线**从这两套里量出来，
# 只把色相换成官网 site.css 的种子（--indigo 4B50C9 → 雾蓝，--violet 7A5F96 → 藕荷）。
# 自检：先拿现网那两个页面底跑一遍 palette.js 里 chromeOf() 的公式，必须复现 app.wxss 里那两个 --btn-bg，
# 复现不了就说明这里的换算和线上不是一套数，不能往下用。
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
    """和 palette.js 的 rgbToHsl 同口径：h 角度，s/l 0~100。"""
    r, g, b = (v / 255 for v in hex2rgb(hexv))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return (h * 360) % 360, s * 100, l * 100


def hsl2hex(h, s, l):
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360, l / 100, s / 100)
    return rgb2hex((r * 255, g * 255, b * 255))


def lum(hexv):
    """palette.js lumOf 同口径（WCAG 相对亮度）。"""
    def ch(v):
        v /= 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = hex2rgb(hexv)
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def cr(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def blend(fg_hex, bg_hex, a):
    """把 rgba(fg,a) 叠在 bg 上，算出实际参与对比的那个实心色（半透明字必须这么量）。"""
    f, b = hex2rgb(fg_hex), hex2rgb(bg_hex)
    return rgb2hex(tuple(a * x + (1 - a) * y for x, y in zip(f, b)))


def chrome_sel(page_hex):
    """palette.js chromeOf() 里 sel 那一条：sat 夹在 30~45，light 20.5（浅色主题），sel = light+16（上限 92）。"""
    h, s, _ = hsl(page_hex)
    sat = min(45, max(30, s))
    return hsl2hex(h, sat, min(92, 20.5 + 16))


# ---------- 现网已认的两套（从 palette.js / app.wxss 抄进来当基准，不另造） ----------
# inks/lineEdge 照 palette.js 里那份原样带着（他认过的不重算），只有没写死的那两枚由公式派生。
IVORY = {
    'key': 'tint-paper', 'cls': 'theme-tint-paper', 'label': '象牙', 'en': 'Ivory',
    'seed': '官网 --paper #F2EFE9', 'page': '#F2EFE9', 'card': '#FCFBF8', 'ink': '#241E16',
    'steps': ['#EAE0CE', '#D9C9AE', '#C2AA85', '#85644A', '#6A5334'],
    'shipped_inks': ['#3B2F1F', '#33291B', '#2A2114', '#FBF6EC', '#FBF6EC'],
    'edge': 0.12, 'local': True,
}
CELADON = {
    'key': 'tint-celadon', 'cls': 'theme-tint-celadon', 'label': '天青', 'en': 'Celadon',
    'seed': '官网 --sage #6E9070 一族', 'page': '#E9EEEA', 'card': '#F7FAF7', 'ink': '#1B2A21',
    'steps': ['#DDE7DF', '#C2D3C6', '#9FB8A6', '#54745D', '#40604A'],
    'shipped_inks': ['#1F2D25', '#1A271F', '#14211A', '#F3F7F2', '#F3F7F2'],
    'edge': 0.13, 'local': True,
}
# 已认两档里量出来的"淡雅曲线"：冷色相（蓝/绿/紫）共用天青那条，暖色相用象牙那条。
CURVE_COOL = [(hsl(x)[1], hsl(x)[2]) for x in CELADON['steps']]

# ---------- 自检：必须复现 app.wxss 里那两个 --btn-bg ----------
EXPECT = {'#F2EFE9': '#796641', '#E9EEEA': '#41794C'}
print('自检 chromeOf().sel（对不上就不往下走）：')
ok = True
for page, want in EXPECT.items():
    got = chrome_sel(page)
    flag = 'ok' if got.upper() == want.upper() else '不匹配'
    print(f'  页面底 {page} → sel {got}，app.wxss 写的是 {want}　[{flag}]')
    ok = ok and got.upper() == want.upper()
if not ok:
    raise SystemExit('换算与线上不是一套数，先修这里')


def build(key, cls, label, en, seed_note, seed_hex, page_s, page_l, ink_s, ink_l, card_l):
    h = hsl(seed_hex)[0]
    page = hsl2hex(h, page_s, page_l)
    card = hsl2hex(h, max(8, page_s * 0.55), card_l)
    ink = hsl2hex(h, ink_s, ink_l)                       # 正文墨：同色相压深
    steps = [hsl2hex(h, s, l) for s, l in CURVE_COOL]
    inks = [PAPER if cr(s, PAPER) >= cr(s, ink) else ink for s in steps]
    return {'key': key, 'cls': cls, 'label': label, 'en': en, 'seed': seed_note,
            'hue': h, 'page': page, 'card': card, 'ink': ink, 'steps': steps,
            'inks': inks, 'local': False, 'edge': 0.12}


MIST = build('gradient-blue', 'theme-blue', '雾蓝', 'Mist',
             '官网 --indigo #4B50C9', '#4B50C9', 22, 92.5, 30, 15, 98)
LILAC = build('tint-lilac', 'theme-lilac', '藕荷', 'Lilac',
              '官网 --violet #7A5F96', '#7A5F96', 20, 94, 26, 18, 98.5)


def json_list(xs):
    return '[' + ', '.join(f"'{x}'" for x in xs) + ']'


MIST['local'] = False   # 沿用现网那个 key，服务端白名单里有它 → 零部署
LILAC['local'] = True   # 新 key 不写库，和象牙/天青一个路子

THEMES = [IVORY, CELADON, MIST, LILAC]
for t in THEMES:
    t['btn'] = chrome_sel(t['page'])
    t['inks'] = [PAPER if cr(s, PAPER) >= cr(s, t['ink']) else t['ink'] for s in t['steps']]

print('\n四套（页面底 / 卡 / 墨 / 深色块 / 五档）：')
for t in THEMES:
    print(f"  {t['label']} {t['en']:8s} key={t['key']:14s} local={str(t['local']):5s} "
          f"底 {t['page']} 卡 {t['card']} 墨 {t['ink']} 深色块 {t['btn']}")
    print(f"      H {hsl(t['page'])[0]:.0f}° 五档 {' '.join(t['steps'])}")

print('\n对比度（WCAG：正文 4.5 起、大字 3.0 起）：')
for t in THEMES:
    rows = [('墨字/页面底', cr(t['ink'], t['page'])), ('墨字/卡底', cr(t['ink'], t['card'])),
            ('纸白字/深色块', cr(PAPER, t['btn'])),
            ('字/第4档', cr(t['inks'][3], t['steps'][3])), ('字/第5档', cr(t['inks'][4], t['steps'][4])),
            ('次要字66%/卡底', cr(blend(t['ink'], t['card'], 0.66), t['card'])),
            ('三级字40%/卡底', cr(blend(t['ink'], t['card'], 0.4), t['card']))]
    print(f"  {t['label']}：" + '　'.join(f'{n} {v:.2f}' for n, v in rows))

print('\n三级字（日期/计数这类小字）那一档要拧到多少才过线——现网 0.4 是量不过的：')
print('  （下面每格是"墨色在这个透明度下压卡底的实际对比度"，3.0 是大字门槛，4.5 是正文门槛）')
print(f"  参照·现网米白那枚 #9A9EA6 压纯白卡 {cr('#9A9EA6', '#FFFFFF'):.2f}、压米白页底 {cr('#9A9EA6', '#F4F2EC'):.2f}")
for t in THEMES:
    line = []
    for a in (0.40, 0.50, 0.55, 0.60):
        line.append(f'{a:.2f}→{cr(blend(t["ink"], t["card"], a), t["card"]):.2f}')
    print(f"  {t['label']}：" + '　'.join(line))

print('\n可直接贴进 palette.js THEMES 的四条：')
for t in THEMES:
    inks = t.get('shipped_inks') or t['inks']
    i = ', '.join(str(v) for v in hex2rgb(t['ink']))
    print(f"""  {{
    key: '{t['key']}', cls: '{t['cls']}', label: '{t['label']}', labelEn: '{t['en']}', local: {str(t['local']).lower()},
    page: '{t['page']}', line: '{t['card']}', lineEdge: 'rgba({i},{t["edge"]:g})', dark: false,
    ramp: {{
      steps: {json_list(t['steps'])},
      inks: {json_list(inks)},
      uncategorized: {{ bg: '{t['ink']}', ink: '{PAPER}' }},
    }},
  }},""")


def json_list(xs):
    return '[' + ', '.join(f"'{x}'" for x in xs) + ']'


print('\n可直接贴进 app.wxss 的四块（变量顺序照现网那 12 条，不增不减）：')
for t in THEMES:
    i = ', '.join(str(v) for v in hex2rgb(t['ink']))
    c = ', '.join(str(v) for v in hex2rgb(t['card']))
    print(f".{t['cls']} {{")
    print(f"  --bg-page: {t['page']};")
    print(f"  --bg-card: {t['card']};")
    print(f"  --bg-card-glass: rgba({c}, 0.85);")
    print(f"  --text-primary: {t['ink']};")
    print(f"  --text-secondary: rgba({i}, 0.66);")
    print(f"  --text-tertiary: rgba({i}, 0.55);")
    print(f"  --border: rgba({i}, 0.09);")
    print(f"  --card-edge: rgba({i}, 0.12);")
    print(f"  --accent: {t['ink']};")
    print(f"  --accent-soft: rgba({i}, 0.07);")
    print(f"  --btn-bg: {t['btn']};")
    print(f"  --chip-idle: rgba({i}, 0.07);")
    print('}\n')

print('旧 key → 新归属（别名表，themeOf 一层解析，后端 WALLPAPER_PRESETS 一行不动）：')
for old, new, note in [('default', 'tint-paper', '现网 14 人存的就是它'),
                       ('gradient-green', 'tint-celadon', '松绿收成淡雅那一档'),
                       ('gradient-sunset', 'tint-paper', '暮橙并到象牙'),
                       ('gradient-purple', 'tint-paper', 'getWallpaper 现在就把深色打回 default'),
                       ('gradient-ocean', 'tint-paper', '现网 4 人存的是它，但屏幕上早就是米白了')]:
    print(f'  {old:16s} → {new}　（{note}）')


def font(sz):
    for p in ('/System/Library/Fonts/STHeiti Light.ttc', '/System/Library/Fonts/PingFang.ttc'):
        if Path(p).exists():
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


F14, F18, F22, F28 = font(14), font(18), font(22), font(28)

# ---------- 图一：四套色板 ----------
W, ROW = 1320, 150
img = Image.new('RGB', (W, ROW * 4 + 60), '#FFFFFF')
d = ImageDraw.Draw(img)
d.text((24, 18), '四套莫兰迪淡雅色板（色相种子取自官网 site.css；两枚新档的明度/饱和曲线从天青那条量）', font=F18, fill='#222')
y = 60
for t in THEMES:
    d.text((24, y + 4), f"{t['label']} {t['en']}", font=F22, fill=t['ink'])
    d.text((24, y + 34), f"key {t['key']}", font=F14, fill='#777')
    d.text((24, y + 54), f"种子 {t['seed']}", font=F14, fill='#777')
    d.text((24, y + 74), f"H {hsl(t['page'])[0]:.0f}°", font=F14, fill='#777')
    cells = [('页面底', t['page']), ('卡', t['card']), ('墨', t['ink'])] + \
            [(f'档{i + 1}', s) for i, s in enumerate(t['steps'])] + [('深色块', t['btn'])]
    x = 340
    for name, col in cells:
        d.rectangle([x, y, x + 92, y + 86], fill=col, outline='#DDD')
        d.text((x + 4, y + 90), name, font=F14, fill='#555')
        d.text((x + 4, y + 106), col, font=F14, fill='#555')
        x += 104
    y += ROW
img.save(OUT / '实测-四套色板.png')

# ---------- 图二：四套界面示意（同一块卡 + 标题/内文/输入框/两枚按钮/分类点） ----------
# 半透明一律先按它真正压着的那层底色算成实心色再画：PIL 在 RGB 画布上会直接丢掉 8 位色值的
# alpha（第一版就是这么画的，6% 的输入框画成了满墨一块，图在骗人）。
def mock(t):
    CW, CH = 560, 700
    im = Image.new('RGB', (CW, CH), t['page'])
    g = ImageDraw.Draw(im)
    ink, card, page = t['ink'], t['card'], t['page']
    on_card = lambda a: blend(ink, card, a)
    on_page = lambda a: blend(ink, page, a)
    g.rounded_rectangle([24, 24, CW - 24, CH - 24], 28, fill=card, outline=on_page(t['edge']), width=2)
    g.text((56, 56), '我的笔记', font=F28, fill=ink)
    g.text((CW - 120, 60), '110', font=F28, fill=ink)
    g.text((CW - 78, 100), '魅力', font=F14, fill=on_card(0.55))
    g.text((56, 150), '笔记列表', font=F18, fill=ink)
    g.line([56, 182, 140, 182], fill=ink, width=3)
    g.text((160, 150), '笔记卡片', font=F18, fill=on_card(0.55))
    g.line([56, 190, CW - 56, 190], fill=on_card(0.09), width=1)
    for i, label in enumerate(['旅游', '生活', '私密', '未分类']):
        st = t['steps'][i] if i < 3 else t['ink']
        g.ellipse([56 + i * 118, 214, 72 + i * 118, 230], fill=st)
        g.text((80 + i * 118, 212), label, font=F14, fill=on_card(0.75))
    g.text((56, 266), '2026年中秋节祝福语与问候图片大全', font=F18, fill=ink)
    g.text((56, 300), '本文汇集了2026年中秋节的多条温馨祝福语，配合', font=F14, fill=on_card(0.66))
    g.text((56, 324), '最美问候图片，传达花好月圆、阖家团圆的美好祝愿。', font=F14, fill=on_card(0.66))
    g.text((56, 356), '显示更多', font=F14, fill=ink)
    g.line([56, 378, 118, 378], fill=ink, width=1)
    field = on_card(0.07)
    g.rounded_rectangle([56, 414, CW - 56, 470], 12, fill=field)
    g.text((76, 432), '标题', font=F18, fill=blend(ink, field, 0.55))
    g.rounded_rectangle([56, 500, 280, 560], 30, fill=field)
    g.text((140, 522), '取消', font=F18, fill=ink)
    g.rounded_rectangle([300, 500, CW - 56, 560], 30, fill=t['btn'])
    g.text((382, 522), '保存', font=F18, fill=PAPER)
    g.rounded_rectangle([40, CH - 104, CW - 40, CH - 44], 30, fill=on_page(0.86))
    g.ellipse([76, CH - 96, 116, CH - 56], fill=t['btn'])
    # 三枚图形自己画：STHeiti 里没有 ▤ ◯ 这两个码位，用字会画成豆腐块（第一版就是这样）
    g.line([210, CH - 76, 234, CH - 76], fill=PAPER, width=3)
    g.line([222, CH - 88, 222, CH - 64], fill=PAPER, width=3)
    g.rectangle([280, CH - 90, 310, CH - 62], outline=PAPER, width=3)
    g.ellipse([350, CH - 90, 380, CH - 62], outline=PAPER, width=3)
    g.text((24, CH - 34), f"{t['label']}　底 {page}　卡 {card}　深色块 {t['btn']}", font=F14, fill=on_page(0.7))
    return im


sheet = Image.new('RGB', (560 * 4 + 100, 760), '#FFFFFF')
for i, t in enumerate(THEMES):
    sheet.paste(mock(t), (20 + i * 580, 20))
sheet.save(OUT / '实测-四套界面示意.png')

print('\n出图：')
for p in ('实测-四套色板.png', '实测-四套界面示意.png'):
    print(' ', OUT / p)
