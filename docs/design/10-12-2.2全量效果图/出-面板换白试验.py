#!/usr/bin/env python3
# 「太黑了，换成纯白面板试试效果」（站长 10-13 12:3x）——把同一屏画两遍：
# 左＝现在落码那版（深色面板），右＝纯白面板。两屏只差面板那一层的皮，几何／字／底栏全同一套数。
#
# 为什么不另起一套画法：这一份直接 exec `出-待拍决策页.py` 的前半（到 `HTML = ` 那行为止），
# 拿的是它同一批**落码现读**的常量（i18n 的字、palette 的橙与底栏色、create.wxss 的几何与两幅渐变）。
# 锚行找不到就当场退出，不画凭印象的屏。
#
# 面板换白会连带牵动四样，这一屏**如实画**（不替站长修）：
#   ① Tips 那行字写死纸白 ⇒ 白面板上读不出，右屏按"翻墨"画（不翻就是一张白底上刷白字）；
#   ② 人物块上半那幅白渐变＋那圈白描边 ⇒ 压在白面板上级差归 0，皮会整片看不见；
#   ③ 人物块下半那条墨面是半透墨 ⇒ 底下从"恒深"变成"白"，合成出来的墨会变浅，压着它的纸白数字对比要重算；
#   ④ 深浅翻色那套（`.bg-light`）原本管的是壁纸，白面板一加，铺深图那一态也会翻成浅面。
# 跑法：python3 docs/design/10-12-2.2全量效果图/出-面板换白试验.py
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '出-待拍决策页.py')
src = open(SRC, encoding='utf-8').read()
ANCHOR = '\nHTML = ('
if ANCHOR not in src:
    sys.exit('找不到锚行 %r ＝`出-待拍决策页.py` 的结构改了，先来这里对上再画图' % ANCHOR)
head = src[:src.index(ANCHOR)]
dp = {'__file__': SRC, '__name__': 'dp_head'}
exec(compile(head, SRC, 'exec'), dp)

scale, CSS = dp['scale'], dp['CSS']
ZH, CH, DIMS, INK = dp['ZH'], dp['CH'], dp['DIMS'], dp['INK']
PAPER, CAM, CAM_INK = dp['PAPER'], dp['CAM'], dp['CAM_INK']
TIP_DOT = dp['TIP_DOT']
PANEL_TOP, PANEL_R = dp['PANEL_TOP'], dp['PANEL_R']
GROUP_TOP, BLK_L, GAP_ROW = dp['GROUP_TOP'], dp['BLK_L'], dp['GAP_ROW']
PERSON_W, PERSON_H, FACE_H = dp['PERSON_W'], dp['PERSON_H'], dp['FACE_H']
BAND_H, BAND_PAD, BAND_GAP = dp['BAND_H'], dp['BAND_PAD'], dp['BAND_GAP']
CELL_W, NUM_FS, RULE_W = dp['CELL_W'], dp['NUM_FS'], dp['RULE_W']
PLUS, PLUS_GAP = dp['PLUS'], dp['PLUS_GAP']
TAB_H, TAB_B = dp['TAB_H'], dp['TAB_B']
FACE_GRAD, BAND_GRAD = dp['FACE_GRAD'], dp['BAND_GRAD']
DARK_BG, DARK_GRAD = dp['PANEL_BG'], dp['PANEL_GRAD']
mix, hx, levels, ratio = dp['mix'], dp['hx'], dp['levels'], dp['ratio']
_rgb = dp['_rgb']
tup = lambda tok: _rgb(tok)[0]                     # 'rgba(…)'／'#…' → 三个分量的浮点元组
stop_alphas = lambda g: [float(a) for a in re.findall(r'rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)', g)]


def panel_paint(base, a_lo, a_hi):
    """面板两层：band 走 a_lo→a_hi 的渐变，240rpx 以下收口成实心（与落码同一分工）。"""
    lo, hi = 'rgba(%s,%s)' % (base, a_lo), 'rgba(%s,%s)' % (base, a_hi)
    return 'linear-gradient(180deg,%s,%s)' % (lo, hi), 'rgba(%s,%s)' % (base, 0.95)


WHITE_GRAD, WHITE_BG = panel_paint('255,255,255', .55, .94)


def screen(bg, grad, tips, dim=1):
    """首屏那一屏，面板三样（实心 bg／band 渐变 grad／Tips 字色 tips）由外面给。"""
    s = ['<div class="f" style="inset:0;background:url(home-bg-portrait.jpg) center top/cover"></div>',
         '<div class="f" style="inset:0;background:rgba(20,22,26,.58);opacity:%s"></div>' % DIMS[dim]['veil'],
         '<div class="f" style="left:0;right:0;top:%dpx;bottom:0;border-radius:%dpx %dpx 0 0;'
         'overflow:hidden;background:%s"><div class="f" style="left:0;right:0;top:0;height:240px;'
         'background:%s"></div></div>' % (PANEL_TOP, PANEL_R, PANEL_R, bg, grad),
         '<div class="f" style="left:0;right:0;top:0;height:184px;'
         'background:linear-gradient(180deg,rgba(8,10,14,.55),rgba(8,10,14,0))"></div>',
         '<div class="f" style="left:30px;top:112px;font-size:34px;font-weight:600;color:%s">%s</div>'
         % (PAPER, ZH['createHeading']),
         '<div class="f" style="left:%dpx;top:%dpx;width:%dpx;display:flex;gap:%dpx">'
         % (BLK_L, GROUP_TOP, 750 - 2 * BLK_L, GAP_ROW),
         '<div class="f" style="position:relative;width:%dpx;height:%dpx;border-radius:34px;'
         'box-shadow:inset 0 0 0 2px rgba(255,255,255,.55)">' % (PERSON_W, PERSON_H),
         '<div class="f" style="left:0;right:0;top:0;height:%dpx;border-radius:34px 34px 0 0;'
         'overflow:hidden;background:%s"><img src="ic-person.png" style="position:absolute;left:0;'
         'top:-52px;width:220px"></div>' % (FACE_H, FACE_GRAD),
         '<div class="f" style="left:0;right:0;bottom:0;height:%dpx;border-radius:0 0 34px 34px;'
         'overflow:hidden;background:%s;display:flex;align-items:center;gap:%dpx;padding:0 %dpx;'
         'box-sizing:border-box">' % (BAND_H, BAND_GRAD, BAND_GAP, BAND_PAD)]
    for k, v in ((ZH['statNotes'], '16'), (ZH['statCards'], '13')):
        s.append('<div class="f" style="position:static;width:%dpx;display:flex;flex-direction:column;'
                 'align-items:center"><div class="n" style="font-size:%dpx;color:%s">%s</div>'
                 '<div class="f" style="position:static;height:2px;width:%dpx;margin:12px 0 8px;'
                 'background:rgba(242,239,233,.85)"></div>'
                 '<div style="font-size:18px;letter-spacing:1px;color:rgba(242,239,233,.72)">%s</div></div>'
                 % (CELL_W, NUM_FS, PAPER, v, RULE_W, k))
    s += ['</div></div>',
          '<div class="f" style="position:static;flex:1;display:flex;flex-direction:column;min-width:0">',
          '<div class="f" style="position:static;flex:1;display:flex;align-items:center;font-size:24px;'
          'line-height:1.4;letter-spacing:1px;color:%s"><div class="r2" style="flex:none;width:14px;'
          'height:14px;margin:10px 12px 0 0;background:%s"></div><div style="flex:1">%s</div></div>'
          % (tips, TIP_DOT, ZH['tips'][0]),
          '<div class="r2" style="flex:none;width:%dpx;height:%dpx;margin-top:%dpx;align-self:center;'
          'background:%s;color:%s;display:flex;align-items:center;justify-content:center;'
          'font-size:64px;font-weight:300">+</div>' % (PLUS, PLUS, PLUS_GAP, CAM, CAM_INK),
          '</div></div>',
          '<div class="f" style="left:%dpx;right:%dpx;bottom:%dpx;height:%dpx;border-radius:44px;'
          'display:flex;align-items:center;justify-content:space-around;box-sizing:border-box;'
          'background:%s;border:3px solid rgba(255,255,255,.22)">' % (BLK_L, BLK_L, TAB_B, TAB_H, CH['bg'])]
    for i, c in enumerate(['+', '≡', '◇']):
        s.append('<div class="r2" style="width:76px;height:76px;display:flex;align-items:center;'
                 'justify-content:center;font-size:36px;color:%s%s">%s</div>'
                 % (CH['ink'] if i == 0 else 'rgba(255,255,255,.62)',
                    ';background:' + CH['sel'] if i == 0 else '', c))
    s.append('</div>')
    return ''.join(s)


INK_TIPS = 'rgba(20,22,26,.92)'                   # 现网 `.bg-light` 那一态的 --text-primary，同一支墨
PANELS = [('甲｜现在落码这版：深色面板', '#23252C', DARK_BG, DARK_GRAD, 'rgba(242,239,233,.96)'),
          ('乙｜换成纯白面板', '#FFFFFF', WHITE_BG, WHITE_GRAD, INK_TIPS)]

# 三处连带后果，数在这里现算（不是抄结论）。底一律取各自那块面板自己的实心色。
FACE_TOP_A = stop_alphas(FACE_GRAD)[0]            # 白面最浅那一档（.92 那一头）
band_alphas = stop_alphas(BAND_GRAD)
d_face, w_face = mix('rgba(255,255,255,%s)' % FACE_TOP_A, DARK_BG), mix('rgba(255,255,255,%s)' % FACE_TOP_A, WHITE_BG)
d_band = mix('rgba(18,20,26,%s)' % max(band_alphas), DARK_BG)
w_band = mix('rgba(18,20,26,%s)' % max(band_alphas), WHITE_BG)
NUMS = [('人物块上半那幅白面 与 它底下那层面板 的级差（＝这块皮看不看得出来）',
         '%.0f 级（面 %s／底 %s）' % (levels(d_face, tup(DARK_BG)), hx(d_face), DARK_BG),
         '%.0f 级（面 %s／底 %s）' % (levels(w_face, tup(WHITE_BG)), hx(w_face), WHITE_BG)),
        ('人物块下半那条墨面合成出来的墨色（底下从恒深变成白）', hx(d_band), hx(w_band)),
        ('纸白数字 16 压在那条墨面上的对比（正文门槛 4.5）',
         '%.2f:1' % ratio(mix(PAPER, hx(d_band)), d_band),
         '%.2f:1' % ratio(mix(PAPER, hx(w_band)), w_band))]

rows = []
for tag, plate, bg, grad, tips in PANELS:
    rows.append('<div class="shot"><div class="cap">%s</div>%s</div>' % (tag, scale(screen(bg, grad, tips))))

HTML = ('<!doctype html><html><head><meta charset="utf-8"><title>面板换白试验</title><style>%s'
        '.two{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}'
        '.num{margin-top:16px;font-size:14px;line-height:1.9}'
        '.num b{color:#D2683F}</style></head><body><div class="wrap">'
        '<h1>面板换白试验 · 同一屏两遍（1px＝1rpx，屏是示意不是截图）</h1><div class="src">'
        '站长 10-13：「太黑了，换成纯白面板试试效果」。两屏只差面板那一层的皮，'
        '几何／两幅渐变／字／底栏全部从落码现读，同一套数。'
        '<br><b>换白不是只换一层</b>：Tips 那行字本来写死纸白（不翻就看不见，右屏按翻墨画）；'
        '人物块上半那幅白渐变与那圈白描边压在白面板上会整片消失；'
        '人物块下半那条墨面是半透墨，底下从恒深变成白，合成出来的墨会变浅，'
        '压着它的纸白数字对比要重算。下面三行数就是这三处。</div>'
        '<div class="row"><div class="shots">%s</div>'
        '<div class="num">%s</div></div></div></body></html>'
        % (CSS, ''.join(rows),
           '<br>'.join('%s：甲 <b>%s</b> ／ 乙 <b>%s</b>' % (n, a, b) for n, a, b in NUMS)))

OUT_HTML = os.path.join(HERE, '面板换白试验.html')
OUT_PNG = os.path.join(HERE, '面板换白试验.png')
open(OUT_HTML, 'w', encoding='utf-8').write(HTML)
subprocess.run([CHROME := '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '--headless', '--disable-gpu', '--hide-scrollbars', '--window-size=1288,1200',
                '--screenshot=' + OUT_PNG, OUT_HTML], check=True, capture_output=True)
from PIL import Image
im = Image.open(OUT_PNG).convert('RGB')
W, H = im.size
px = im.load()
last = 0
for y in range(H - 1, -1, -1):
    if any(px[x, y] != px[0, 0] for x in range(0, W, 7)):
        last = y
        break
im.crop((0, 0, W, min(H, last + 26))).save(OUT_PNG)
print('HTML ' + OUT_HTML)
print('PNG  ' + OUT_PNG + '　（%d×%d）' % (W, min(H, last + 26)))
for n, a, b in NUMS:
    print('　%s：甲 %s ／ 乙 %s' % (n, a, b))
