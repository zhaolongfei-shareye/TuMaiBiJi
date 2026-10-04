#!/usr/bin/env python3
# v5 定稿：站长 10-04 拍了三条——⑥ 走甲档 L86、⑦ 第四枚＝雨雾、② 米白并入象牙；
# ⑧ 走 A（深底白字），前提是 chromeOf 里钉死的 L=36.5 改成按 WCAG 4.7 反解。
# 这一版不只出对照，直接生成要贴进 palette.js / app.wxss 的那两段。
#
# 一处必须记下来的纠正：v3 那五档色阶是**锚页面底**算的，甲档下第一档离卡底只剩 2.7 个 L、
# 对比 1.06，那块 176rpx 的色块会直接化在卡上。现网那套他认过的象牙 ramp 实测离卡底是
# 11.8 / 21.4 / 33.9（对比 1.26 / 1.57 / 2.16），所以浅三档改成**锚卡底、照这三个距离重算**，
# 深两档仍按 4.7 反解。四套共用这一条，只差色相。
import colorsys
from pathlib import Path

OUT = Path(__file__).resolve().parent
PAPER = '#F2EFE9'
PAGE_L, PAGE_S = 86.0, 20.0
CARD_L_OFF = 9.0            # 卡底比页面底亮这一档（v3 的公式，没改）
RAMP_OFF = [11.8, 21.4, 33.9]   # 现网象牙 ramp 浅三档离卡底的实测距离，照抄


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


def fit_dark(h, s, want=4.7):
    """压纸白字的那一面：解出刚好 want:1 的最浅明度，再把落进 8 位色的那个 hex 逐步压到
    **真的**过线——四舍五入会吃掉 0.01~0.05，不补这一步，表里写的 4.7 实际只有 4.66。
    palette.js 里那条逐字同参数（二分 40 轮 + 每次退 0.4 档）。"""
    lo, hi = 5.0, 60.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if cr(PAPER, hsl2hex(h, s, mid)) < want:
            hi = mid
        else:
            lo = mid
    l = (lo + hi) / 2
    for _ in range(40):
        c = hsl2hex(h, s, l)
        if cr(PAPER, c) >= want:
            return l
        l -= 0.4
    return l


def chrome_bg(h, s):
    """底栏那一条面：公式一个字不动（S 夹 [30,45]、浅壁纸 L 20.5），只换 sel。"""
    return hsl2hex(h, min(45, max(30, s)), 20.5)


def chrome_sel(h, s):
    """选中那枚圆底＝深色实心按钮那一面。S 用页面底自己的 1.25 倍（不再夹到 30，
    否则雨雾会被顶成一支蓝），L 由 4.7 反解。"""
    return hsl2hex(h, s * 1.25, fit_dark(h, s * 1.25))


HUES = [
    ('象牙', 'Ivory', 'tint-paper', 'theme-tint-paper', True, 40.0, PAGE_S,
     '官网 --paper 那一支的 H'),
    ('天青', 'Celadon', 'tint-celadon', 'theme-tint-celadon', True, 132.0, PAGE_S,
     '现网 tint-celadon 的 H'),
    ('樱落', 'Blush', 'tint-blush', 'theme-tint-blush', True,
     hsl('#D4ACBF')[0], PAGE_S, '参考卡「樱落」R212 G172 B191'),
    ('雨雾', 'Mist', 'gradient-blue', 'theme-blue', False,
     hsl('#BDC0C9')[0], PAGE_S * 0.6, '参考卡「豪雨」R189 G192 B201（沿用旧 key，零部署）'),
]

THEMES = []
for label, en, key, cls, local, h, s, note in HUES:
    page = hsl2hex(h, s, PAGE_L)
    # 页面底是唯一的锚：其余全部从**落进 8 位色之后那一支**现读，
    # 因为运行时 chromeOf() 拿到的就是这个 hex（用种子 H/S 算会和 JS 对不上，实测差 1~2 个色值单位）
    h, s, _ = hsl(page)
    ink = hsl2hex(h, min(34, s * 1.5), 16)
    card = hsl2hex(h, max(6, s * 0.45), min(98, PAGE_L + CARD_L_OFF))
    cl = hsl(card)[2]
    steps = [hsl2hex(h, s, cl - o) for o in RAMP_OFF]
    d4 = hsl2hex(h, s, fit_dark(h, s, 4.5))
    steps += [d4, hsl2hex(h, s, hsl(d4)[2] - 6)]
    inks = [ink, ink, ink, PAPER, PAPER]
    THEMES.append({'label': label, 'en': en, 'key': key, 'cls': cls, 'local': local,
                   'h': h, 's': s, 'ink': ink, 'page': page, 'card': card,  # h/s 已是现读值
                   'steps': steps, 'inks': inks,
                   'btn': chrome_sel(h, s), 'bar': chrome_bg(h, s), 'note': note})

print('===== 甲档四套定稿（页面底 L86，色相种子见每行末）=====')
for t in THEMES:
    print(f"\n{t['label']} {t['key']} / {t['cls']}  local={t['local']}  ← {t['note']}")
    print(f"  页面底 {t['page']} (L{hsl(t['page'])[2]:.1f})  卡底 {t['card']} (L{hsl(t['card'])[2]:.1f})  墨 {t['ink']}")
    print(f"  五档 {' '.join(t['steps'])}")
    print(f"  按钮/圆底 {t['btn']} (L{hsl(t['btn'])[2]:.1f})  底栏条 {t['bar']}")
    rows = [('墨字/页底', cr(t['ink'], t['page'])), ('卡/页底', cr(t['card'], t['page'])),
            ('纸白/按钮', cr(PAPER, t['btn'])), ('纸白/底栏条', cr(PAPER, t['bar']))]
    for i, st in enumerate(t['steps']):
        rows.append((f'第{i+1}档/卡', cr(st, t['card'])))
        rows.append((f'第{i+1}档字', cr(t['inks'][i], st)))
    print('  ' + '　'.join(f'{n} {v:.2f}' for n, v in rows))

print('\n===== 三条硬约束（红就是不能贴）=====')
bad = []
for t in THEMES:
    if cr(PAPER, t['btn']) < 4.7:
        bad.append(f"{t['label']} 按钮纸白 {cr(PAPER, t['btn']):.2f} < 4.7")
    if cr(t['ink'], t['page']) < 7:
        bad.append(f"{t['label']} 墨字/页底 {cr(t['ink'], t['page']):.2f} < 7")
    if cr(t['steps'][0], t['card']) < 1.2:
        bad.append(f"{t['label']} 第一档化在卡上 {cr(t['steps'][0], t['card']):.2f} < 1.2")
    for i in (3, 4):
        if cr(t['inks'][i], t['steps'][i]) < 4.5:
            bad.append(f"{t['label']} 第{i+1}档分类名 {cr(t['inks'][i], t['steps'][i]):.2f} < 4.5")
    for i in range(3):
        if cr(t['inks'][i], t['steps'][i]) < 4.5:
            bad.append(f"{t['label']} 第{i+1}档分类名 {cr(t['inks'][i], t['steps'][i]):.2f} < 4.5")
print('  按钮/圆底与第4档是否同色：' + '　'.join(f"{t['label']} {t['btn']}vs{t['steps'][3]}" + ('同' if t['btn'] == t['steps'][3] else '异') for t in THEMES))
print('  全过' if not bad else '\n'.join('  ✗ ' + x for x in bad))

print('\n===== 贴进 palette.js 的 THEMES =====')
for t in THEMES:
    q = lambda xs: '[' + ', '.join("'" + x + "'" for x in xs) + ']'
    r, g, b = hex2rgb(t['ink'])
    print('  {')
    flag = " local: true," if t['local'] else ""
    print(f"    key: '{t['key']}', cls: '{t['cls']}', label: '{t['label']}', labelEn: '{t['en']}',{flag}")
    print(f"    page: '{t['page']}', line: '{t['card']}', lineEdge: 'rgba({r}, {g}, {b}, 0.13)', dark: false,")
    print(f"    ramp: {{ steps: {q(t['steps'])}, inks: {q(t['inks'])},")
    print(f"      uncategorized: {{ bg: '{t['ink']}', ink: '{PAPER}' }} }},")
    print('  },')

print('\n===== 贴进 app.wxss 的四个主题块 =====')
for t in THEMES:
    r, g, b = hex2rgb(t['ink'])
    cr_, cg, cb = hex2rgb(t['card'])
    print(f".{t['cls']} {{")
    print(f"  --bg-page: {t['page']};")
    print(f"  --bg-card: {t['card']};")
    print(f"  --bg-card-glass: rgba({cr_}, {cg}, {cb}, 0.85);")
    print(f"  --text-primary: {t['ink']};")
    print(f"  --text-secondary: rgba({r}, {g}, {b}, 0.66);")
    print(f"  --text-tertiary: rgba({r}, {g}, {b}, 0.55);")
    print(f"  --border: rgba({r}, {g}, {b}, 0.09);")
    print(f"  --card-edge: rgba({r}, {g}, {b}, 0.12);")
    print(f"  --accent: {t['ink']};")
    print(f"  --accent-soft: rgba({r}, {g}, {b}, 0.07);")
    print(f"  --btn-bg: {t['btn']};")
    print(f"  --chip-idle: rgba({r}, {g}, {b}, 0.07);")
    print('}')

print('\n===== 别名表（themeOf 一层解析，后端 WALLPAPER_PRESETS 不动）=====')
ALIAS = {'default': 'tint-paper', 'gradient-green': 'tint-celadon', 'gradient-sunset': 'tint-paper',
         'gradient-purple': 'tint-paper', 'gradient-ocean': 'tint-paper', 'gradient-blue': 'gradient-blue',
         'tint-paper': 'tint-paper', 'tint-celadon': 'tint-celadon', 'tint-blush': 'tint-blush'}
for k, v in ALIAS.items():
    lab = {t['key']: t['label'] for t in THEMES}[v]
    print(f"  {k:16s} → {v:14s}（{lab}）")
