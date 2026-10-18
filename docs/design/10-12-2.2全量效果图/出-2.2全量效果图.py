#!/usr/bin/env python3
# 2.2 首页那一屏的**全量效果图**生成器（中英各一份，12 屏）。
#
# 四条口径全部现读，脚本里不写死任何一句文案与任何一个设计色（甲那一套除外，它照参考稿）：
#   ① 字 ← miniprogram/utils/i18n.js 的 texts('zh') / texts('en')；缺键直接抛错，不许临场编
#   ② 色 ← miniprogram/utils/palette.js（createSkin / entryBlocks / chromeOf，默认壁纸）
#   ③ 几何 ← 真机截图 734×1588 ⇒ 视口 750×1623rpx；参考稿坐标两轴各自归一
#   ④ 大数字字形 ← 从 app.wxss 里那条 @font-face 原样搬（只为出图，不复制进包）
#
# 跑法：python3 docs/design/10-12-2.2全量效果图/出-2.2全量效果图.py
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
MP = os.path.join(ROOT, 'miniprogram')
DESIGN = os.path.join(ROOT, 'docs/design')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

NODE = ('const m=require("%s/utils/i18n.js");const p=require("%s/utils/palette.js");'
        'const ps=s=>Object.fromEntries(s.split(";").map(v=>{const i=v.indexOf(":");return[v.slice(0,i),v.slice(i+1)]}));'
        'console.log(JSON.stringify({zh:m.texts("zh"),en:m.texts("en"),pal:{eb:p.entryBlocks("tint-paper"),'
        'ch:p.chromeOf("tint-paper"),cp:ps(p.createSkin("tint-paper")),tipDot:p.TIP_DOT,dim:p.BG_DIMS,'
        'wall:p.themeLabel("tint-paper")}}));') % (MP, MP)

_r = subprocess.run(['node', '-e', NODE], cwd=ROOT, capture_output=True, text=True)
if _r.returncode != 0:
    sys.exit('node 取字典/色板失败：' + _r.stderr[:400])
D = json.loads(_r.stdout)
ZH, EN, PAL = D['zh'], D['en'], D['pal']
CP, TIP_DOT, WALLPAPER = PAL['cp'], PAL['tipDot'], PAL['wall']
DIM = PAL['dim'][1]                                   # 默认档＝半月（create.js data.dimV = 1）

_m = re.search(r"@font-face\s*\{[^}]*WtsjMind[^}]*\}", open(os.path.join(MP, 'app.wxss'), encoding='utf-8').read(), re.S)
FONT = _m.group(0) if _m else ''

# ---------------- 几何 ----------------
KX, KY, OX, OY = 750.0 / 723.0, 1623.0 / 1595.0, 27.0, 29.0
gx = lambda v: round((v - OX) * KX)
gy = lambda v: round((v - OY) * KY)
gw = lambda v: round(v * KX)
gh = lambda v: round(v * KY)
# 稿底下那一条是**整块通栏深色面板**（左右同色、左上右上各一个圆角），不是只有右半——
# 站长 10-13 就是打回这一条：「为什么左下角没有背景，参考图是完整的深色面板」。
#   连带第二刀：面板一通栏就把 Tips 与那批小图盖住了（它俩原先排在面板前面）⇒ 现在一律画在面板之后。
# 所以面板 left:0、宽 750、一路铺到屏幕底；控件仍按稿上右半那一列（COL）排。
# rel() 的 x 因此直接用屏坐标（不再减面板左边），y 仍相对面板顶。
rel = lambda dx, dy: (gx(dx), gy(dy) - gy(1089))

STAGE_W, STAGE_H, NAV_H = 750, 1623, 176
COL = dict(left=gx(360), width=gw(391))          # 稿上右半那一列：所有控件的宽与横向落点
CX = COL['left']                              # ⚠ 面板通栏之后，凡"相对面板左边"的偏移一律要加这一位
PANEL = dict(left=0, top=gy(1089), width=STAGE_W, height=STAGE_H - gy(1089))
LIFT = 148                                            # D3 甲：整块上抬给底栏让位
# ⚠ 稿上坐标是**整屏**的（含导航条那 176），而面板/底栏/Tips 都画在 .page 里（已从导航条下方起算）
#   ⇒ 凡进 .page 的 y 一律减 NAV_H。这条 10-12 栽过一回：底栏被顶出舞台、量不到一个像素。
DOCK_TOP = PANEL['top'] - LIFT
DOCK_W, DOCK_H = PANEL['width'], STAGE_H - DOCK_TOP      # 通栏、一路到底（底角交给机身圆角）

PILL = dict(xy=rel(366, 1113), w=gw(364), h=gh(84), r=gh(42))
CARD = dict(xy=rel(367, 1227), w=gw(363), h=gh(96), r=gh(28), y2=rel(367, 1353)[1])
CTA = dict(xy=rel(367, 1478), w=gw(361), h=gh(110), r=gh(55))
RING = dict(xy=rel(449.5, 1155), w=gw(212), h=gh(212), bw=gw(10))
CAM = dict(xy=rel(477.5, 1183), w=gw(156), h=gh(156))
CAMLBL = dict(cx=rel(555.5, 1407)[0], y=rel(555.5, 1407)[1])
SMALL = dict(y=rel(423.5, 1453)[1], w=gw(104), h=gh(104))
SMALL['xs'] = [CX + 20, CX + 20 + SMALL['w'] + 20, CX + 20 + 2 * (SMALL['w'] + 20)]
TAGROW = dict(y=rel(360, 1112)[1], chip=gw(56), tw=88)
STRIP = dict(y=rel(360, 1280)[1] + 34, th=gw(80), gap=gw(10), r=gw(18))
SLIDE = dict(xy=rel(375.5, 1478), w=gw(361), h=gh(96), r=gh(48), knob=gw(76))
FIELD = dict(xy=rel(367, 1227), w=gw(363), h=gh(96), h2=gh(168), r=gh(28))

# 一行装得下几格：面板宽 406，去掉左右 22 的边，(406-44+10)/(83+10)
PER_ROW = int((COL['width'] - 44 + STRIP['gap']) // (STRIP['th'] + STRIP['gap']))
NEED_ROWS = (9 + 1 + PER_ROW - 1) // PER_ROW
STRIP_H = NEED_ROWS * STRIP['th'] + (NEED_ROWS - 1) * STRIP['gap']
OVERLAP = STRIP['y'] + STRIP_H - SLIDE['xy'][1]        # 9 张那一排与右滑条重叠多少

# ---------------- 两套皮（D2 的甲与乙） ----------------
A = dict(name='甲·照参考稿的色', panel='#212221', pill='linear-gradient(90deg,#ADA18D 0%,#8A8580 55%,#706E6F 100%)',
         pill_bd='#C6B49A', glyph='#D8CAB6', ph='rgba(255,252,244,0.82)', mic='#C9B79C', mic_dot='#F4EFE4',
         card1='#59575A', card2='#535255', dot='#D4BEA1', dash='rgba(255,255,255,0.18)', ink='#FFFFFF',
         cta='linear-gradient(90deg,#CDB797 0%,#A3947C 50%,#9F886C 100%)', cta_ink='#FCFAF3',
         ring='#5C5C60', cam='#DA794A', cam_ink='#291306', tb='#DEDEDE', tb_ink='#434247',
         field='rgba(255,255,255,0.10)', field_ink='#FCFAF3', field_ph='rgba(252,250,243,0.5)',
         hint='rgba(214,86,64,0.94)', hint_ink='#FFFFFF', out_ink='#FCFAF3')
B = dict(name='乙·色吃现网 palette（%s）' % WALLPAPER, panel=CP['--cp-panel'], pill=CP['--cp-field'],
         pill_bd=CP['--cp-ring'], glyph=CP['--cp-ink'], ph=CP['--cp-ink-62'], mic=CP['--cp-ink-42'],
         mic_dot=CP['--cp-card'], card1=CP['--cp-card'], card2=CP['--cp-card'], dot=PAL['eb']['face']['cards'],
         dash=CP['--cp-edge-14'], ink=CP['--cp-ink'], cta=CP['--cp-extract'], cta_ink=CP['--cp-extract-ink'],
         ring=CP['--cp-ring'], cam=CP['--cp-cam'], cam_ink=CP['--cp-cam-ink'], tb=CP['--cp-card'],
         tb_ink=CP['--cp-ink'], field=CP['--cp-field'], field_ink=CP['--cp-ink'], field_ph=CP['--cp-ink-50'],
         hint='#C4541F', hint_ink='#FFFFFF', out_ink=CP['--cp-ink'])

IC = {
    'camera': '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    'images': '<rect x="3" y="5" width="14" height="14" rx="2"/><circle cx="8" cy="10" r="1.6"/><path d="m17 16-3.6-3.6a2 2 0 0 0-2.8 0L5 18"/><path d="M7 5h12a2 2 0 0 1 2 2v10"/>',
    'link': '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5.5l-3 3a5 5 0 0 0 7 7L9 19"/>',
    'write': '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'clipboard': '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    'chev': '<path d="m9 18 6-6-6-6"/>',
}


def svg(name, size, color, sw=1.8):
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="%s" stroke-width="%.1f" '
            'stroke-linecap="round" stroke-linejoin="round">%s</svg>' % (size, size, color, sw, IC[name]))


def mag(size, color):
    r = round(size * 0.74)
    return ('<span class="mag" style="width:%dpx;height:%dpx"><i style="width:%dpx;height:%dpx;border-color:%s"></i>'
            '<b style="background:%s"></b></span>' % (size, size, r, r, color, color))


def mic(size, ring, dot):
    d = round(size * 0.38)
    return ('<span class="mic" style="width:%dpx;height:%dpx;border-color:%s"><i style="width:%dpx;height:%dpx;'
            'background:%s"></i></span>' % (size, size, ring, d, d, dot))


def T(lang, key):
    d = ZH if lang == 'zh' else EN
    if key not in d:
        sys.exit('字典里没有这个键：%s（%s）——不许临场编文案' % (key, lang))
    return d[key]


def box(x, y, w=None, h=None, css=''):
    s = 'position:absolute;left:%dpx;top:%dpx;' % (x, y)
    if w is not None:
        s += 'width:%dpx;' % w
    if h is not None:
        s += 'height:%dpx;' % h
    return s + css


# 字典里**没有**「更多」这一键（现网只有 showMore:显示更多）。他原话点了中文那两个字＝「更多」，
# 所以这一枚是"效果图先用、落码时补进字典"的新键，说明栏里标出来，不算抄来的现网文案。
NEW_KEYS = {'zh': '更多', 'en': 'More'}
TIP_IDX = 4                                            # 现网 tips[4]＝"设了密码的那一格是私密…"（稿上露的就是这句）


# ---------------- 面板内容 ----------------
def c_home(lang, k, counts=('17', '16')):
    o = ['<div style="%s">%s<span style="margin-left:16px;font-size:28px;color:%s">%s</span>'
         '<span style="margin-left:auto">%s</span></div>' % (
             box(PILL['xy'][0], PILL['xy'][1], PILL['w'], PILL['h'],
                 'border-radius:%dpx;background:%s;border:2px solid %s;display:flex;align-items:center;'
                 'padding:0 26px 0 28px;' % (PILL['r'], k['pill'], k['pill_bd'])),
             mag(24, k['glyph']), k['ph'], T(lang, 'searchPh'), mic(26, k['mic'], k['mic_dot']))]
    for y, key, val, face in ((CARD['xy'][1], 'statImages', counts[0], k['card1']),
                              (CARD['y2'], 'statNotes', counts[1], k['card2'])):
        o.append('<div style="%s"><i style="width:11px;height:11px;border-radius:50%%;background:%s;flex:none"></i>'
                 '<span style="margin-left:12px;font-size:30px;color:%s;font-weight:600">%s</span>'
                 '<span style="flex:1;height:2px;background:%s;margin:0 11px 0 28px;border-radius:1px"></span>'
                 '<span class="num" style="font-size:68px;color:%s;line-height:1">%s</span></div>' % (
                     box(CARD['xy'][0], y, CARD['w'], CARD['h'],
                         'border-radius:%dpx;background:%s;display:flex;align-items:center;'
                         'padding:0 22px 0 24px;' % (CARD['r'], face)),
                     k['dot'], k['ink'], T(lang, key), k['dash'], k['ink'], val))
    o.append('<div style="%s">%s</div>' % (
        box(CTA['xy'][0], CTA['xy'][1], CTA['w'], CTA['h'],
            'border-radius:%dpx;background:%s;display:flex;align-items:center;justify-content:center;'
            'font-size:31px;font-weight:600;color:%s;' % (CTA['r'], k['cta'], k['cta_ink'])), T(lang, 'barIdle')))
    return ''.join(o)


def c_round(lang, k, on='photo'):
    """录入态：大圆快门 + 三枚小圆（图形在圆里、名字写在圆的下方＝参考图的画法；第四枚「文字」=D4 甲）"""
    o = ['<div style="%s"></div>' % box(RING['xy'][0], RING['xy'][1], RING['w'], RING['h'],
                                        'border-radius:50%%;border:%dpx solid %s;' % (RING['bw'], k['ring'])),
         '<div style="%s">%s</div>' % (box(CAM['xy'][0], CAM['xy'][1], CAM['w'], CAM['h'],
                                           'border-radius:50%%;background:%s;display:flex;align-items:center;'
                                           'justify-content:center;' % k['cam']), svg('camera', 62, k['cam_ink'], 1.7)),
         '<div style="%s">%s</div>' % (box(COL['left'], CAMLBL['y'], COL['width'], 32,
                                           'text-align:center;font-size:24px;font-weight:700;color:%s;' % k['out_ink']),
                                       T(lang, 'takePhoto'))]
    for (key, icon, tag), x in zip([('fromAlbum', 'images', 'album'), ('modeUrl', 'link', 'url'),
                                    ('modeWrite', 'write', 'write')], SMALL['xs']):
        sel = (tag == on)
        face, ink = (k['cam'], k['cam_ink']) if sel else (k['tb'], k['tb_ink'])
        o.append('<div style="%s">%s</div><div style="%s">%s</div>' % (
            box(x, SMALL['y'], SMALL['w'], SMALL['h'],
                'border-radius:50%%;background:%s;display:flex;align-items:center;justify-content:center;' % face),
            svg(icon, 34, ink, 1.7),
            box(x - 10, SMALL['y'] + SMALL['h'] + 8, SMALL['w'] + 20, 26,
                'text-align:center;font-size:20px;color:%s;' % k['out_ink']), T(lang, key)))
    return ''.join(o)


def c_tagrow(lang, k, on='photo'):
    """提炼态顶上那一行：橙圆片 + 三枚文字（现网 .modes 的手法，稿第三屏同一路）"""
    o = ['<div style="%s"></div>' % box(COL['left'], TAGROW['y'] - 16, COL['width'], 2, 'background:%s;' % k['dash'])]
    x = CX + 22
    o.append('<div style="%s">%s</div>' % (
        box(x, TAGROW['y'], TAGROW['chip'], TAGROW['chip'],
            'border-radius:50%%;background:%s;display:flex;align-items:center;justify-content:center;' % k['cam']),
        svg('camera', 26, k['cam_ink'], 1.9)))
    x += TAGROW['chip'] + 16
    for key, tag in (('fromAlbum', 'album'), ('modeUrl', 'url'), ('modeWrite', 'write')):
        col = k['ink'] if tag == on else k['ph']
        o.append('<div style="%s">%s</div>' % (
            box(x, TAGROW['y'] + 14, TAGROW['tw'], 30,
                'text-align:center;font-size:21px;color:%s;' % col), T(lang, key)))
        x += TAGROW['tw']
    return ''.join(o)


def c_field(lang, k, key_ph, lines=1, with_switch=False):
    h = FIELD['h'] if lines == 1 else FIELD['h2']
    x, y = FIELD['xy']
    o = ['<div style="%s"><span style="color:%s;font-size:26px">%s</span>'
         '<span style="margin-left:auto;display:flex;align-items:center;gap:16px">'
         '<span style="color:%s;font-size:22px">✕</span>%s</span></div>' % (
             box(x, y, FIELD['w'], h,
                 'border-radius:%dpx;background:%s;display:flex;align-items:flex-start;padding:26px 24px;'
                 % (FIELD['r'], k['field'])),
             k['field_ph'], T(lang, key_ph), k['field_ph'], svg('clipboard', 26, k['field_ink'], 1.7))]
    if with_switch:
        o.append('<div style="%s"><span style="font-size:22px;color:%s">%s</span>'
                 '<span style="margin-left:10px;font-size:18px;color:%s">%s</span>'
                 '<span style="margin-left:auto;width:72px;height:38px;border-radius:19px;background:%s;'
                 'display:flex;align-items:center;padding:0 4px"><i style="width:30px;height:30px;'
                 'border-radius:50%%;background:%s;margin-left:auto"></i></span></div>' % (
                     box(x, y + h + 12, FIELD['w'], 44, 'display:flex;align-items:center;'),
                     k['ink'], T(lang, 'origTranslate'), k['ph'], T(lang, 'origTranslateHint'),
                     k['cam'], k['panel']))
    return ''.join(o)


def c_strip(lang, k, n):
    """已选图那一排：一行 PER_ROW 格，超出走左右滚（现网分类行本来就有这一手法）"""
    o = []
    shown = min(n, PER_ROW)
    for i in range(shown):
        x = CX + 22 + i * (STRIP['th'] + STRIP['gap'])
        o.append('<div style="%s"><span class="thumb p%d"></span><i class="x">✕</i>'
                 '<em class="no">%d</em></div>' % (
                     box(x, STRIP['y'], STRIP['th'], STRIP['th'],
                         'border-radius:%dpx;overflow:hidden;' % STRIP['r']), i % 4 + 1, i + 1))
    if n < 9:
        x = CX + 22 + shown * (STRIP['th'] + STRIP['gap'])
        o.append('<div style="%s">%s</div>' % (
            box(x, STRIP['y'], STRIP['th'], STRIP['th'],
                'border-radius:%dpx;background:%s;display:flex;align-items:center;justify-content:center;'
                % (STRIP['r'], k['dash'])), svg('plus', 26, k['ink'], 2.4)))
    if n > PER_ROW:
        o.append('<div style="%s"></div>' % box(COL['left'] + COL['width'] - 70, STRIP['y'], 70, STRIP['th'],
                                                'background:linear-gradient(90deg,rgba(0,0,0,0),%s);' % k['panel']))
        o.append('<div style="%s">%d / 9 ›</div>' % (
            box(CX + 22, STRIP['y'] + STRIP['th'] + 10, 200, 28, 'font-size:20px;color:%s;' % k['ph']), n))
    elif n == 9:
        o.append('<div style="%s">9 / 9</div>' % box(CX + 22, STRIP['y'] + STRIP['th'] + 10, 200, 28,
                                                     'font-size:20px;color:%s;' % k['ph']))
    return ''.join(o)


def c_slide(lang, k, state='ready', icon='camera'):
    x, y = SLIDE['xy']
    knob_x = 10 if state == 'ready' else SLIDE['w'] - SLIDE['knob'] - 10
    txt = T(lang, 'slideExtract') if state == 'ready' else T(lang, 'busyExtract')
    return ('<div style="%s"><span style="position:absolute;left:0;top:0;height:100%%;width:%dpx;background:%s;'
            'border-radius:%dpx"></span>'
            '<span style="position:absolute;left:%dpx;right:0;top:0;bottom:0;display:flex;align-items:center;'
            'justify-content:center;font-size:23px;color:%s">%s</span>'
            '<span style="position:absolute;left:%dpx;top:10px;width:%dpx;height:%dpx;border-radius:50%%;'
            'background:%s;border:3px solid %s;display:flex;align-items:center;justify-content:center">%s</span></div>' % (
                box(x, y, SLIDE['w'], SLIDE['h'], 'border-radius:%dpx;background:%s;' % (SLIDE['r'], k['cta'])),
                SLIDE['w'] if state == 'busy' else 0,
                'rgba(255,255,255,0.30)' if state == 'busy' else 'rgba(255,255,255,0.14)', SLIDE['r'],
                SLIDE['knob'] + 24, k['cta_ink'], txt, knob_x, SLIDE['knob'], SLIDE['knob'],
                k['cam'], k['cta_ink'], svg(icon, 28, k['cam_ink'], 1.9)))


def c_hint(lang, k, which='perm'):
    key = 'permCamera' if which == 'perm' else 'taskFailed'
    act = svg('chev', 22, k['hint_ink'], 2.2) if which == 'perm' else ''
    return ('<div style="%s"><span style="font-size:21px;color:%s">%s</span><span style="margin-left:auto">%s</span></div>'
            '<div style="%s">%s</div>' % (
                box(CARD['xy'][0], SLIDE['xy'][1] - 112, CARD['w'], 74,
                    'border-radius:20px;background:%s;display:flex;align-items:center;padding:0 22px;'
                    % k['hint']),
                k['hint_ink'], T(lang, key), act,
                box(CTA['xy'][0], CTA['xy'][1], CTA['w'], CTA['h'],
                    'border-radius:%dpx;background:%s;display:flex;align-items:center;justify-content:center;'
                    'font-size:31px;font-weight:600;color:%s;' % (CTA['r'], k['cta'], k['cta_ink'])),
                T(lang, 'barIdle')))


# ---------------- 左半：那批随机卡片小图（稿 v2，D1 未答） ----------------
MINI = [dict(xy=(36, 1122), wh=(200, 116), rot=-2, blk='#23252C'),
        dict(xy=(250, 1150), wh=(100, 92), rot=2, blk='#E9723D'),
        dict(xy=(52, 1448), wh=(196, 108), rot=1.5, blk='#46A863'),
        dict(xy=(262, 1470), wh=(88, 86), rot=-2, blk='#A8BCC9')]


def left_minis(lang, lit=False):
    o = []
    for m in MINI:
        face = '#FFFFFF' if lit else '#8C8A87'
        blk = m['blk'] if lit else '#3A3B3A'
        line = '#CBC5B8' if lit else '#6E6D6B'
        o.append('<div style="%s"><span style="width:28%%;height:100%%;background:%s;flex:none"></span>'
                 '<span style="flex:1;padding:14px;display:flex;flex-direction:column;justify-content:center;gap:9px">'
                 '<i style="display:block;height:9px;border-radius:5px;background:%s;width:70%%"></i>'
                 '<i style="display:block;height:9px;border-radius:5px;background:%s;width:46%%"></i></span></div>' % (
                     box(gx(m['xy'][0]), gy(m['xy'][1]) - LIFT - NAV_H, gw(m['wh'][0]), gh(m['wh'][1]),
                         'transform:rotate(%sdeg);background:%s;border:1.5px solid %s;border-radius:14px;'
                         'display:flex;overflow:hidden;' % (m['rot'], face, '#DDD8CC' if lit else '#76746F')),
                     blk, line, line))
    if lit:
        o.append('<div style="%s">%s</div>' % (
            box(gx(36), gy(1586) - LIFT - NAV_H, 300, 34,
                'text-align:center;font-size:24px;font-weight:700;color:#FCFAF3;'), NEW_KEYS[lang]))
    return ''.join(o)


# ---------------- 整屏外壳 ----------------
def frame(lang, k, inner, cap, tag='', left=''):
    zh_on = 'lon' if lang == 'zh' else ''
    en_on = 'lon' if lang == 'en' else ''
    tips = T(lang, 'tipsPrefix') + T(lang, 'tips')[TIP_IDX]
    return ('<div class="cell"><div class="stage">'
            '<div class="nav"><span class="nt">%s</span><span class="caps"><i></i><em></em><b></b></span></div>'
            '<div class="page">'
            '<div class="bg"></div><div class="scrim" style="opacity:%s"></div>'
            '<div class="trow"><span class="h1">%s</span><span class="langs">'
            '<span class="%s">中</span><span class="%s">EN</span></span></div>'
            '<div class="swap"><span>%s</span><i class="sdot" style="background:%s"></i>'
            '<span class="s2">%s</span>%s</div>'
            '<div class="dock" style="left:%dpx;top:%dpx;width:%dpx;height:%dpx;background:%s;'
            'border-top-left-radius:41px;border-top-right-radius:41px">%s</div>'
            '%s'
            '<div class="tips" style="color:%s"><i style="background:%s"></i><span>%s</span></div>'
            '<div class="tabbar"><span class="tb tb-on">%s</span><span class="tb">%s</span>'
            '<span class="tb">%s</span></div>'
            '</div></div><div class="cap"><b>%s</b>%s</div></div>' % (
                T(lang, 'appName'), DIM['veil'], T(lang, 'createHeading'), zh_on, en_on,
                T(lang, 'bgDimLabel'), DIM['dot'], T(lang, 'homeBgSwap'), svg('chev', 20, k['out_ink'], 2.2),
                PANEL['left'], DOCK_TOP - NAV_H, DOCK_W, DOCK_H, k['panel'], inner,
                left, k['out_ink'], TIP_DOT, tips,
                svg('plus', 34, '#FCFAF3', 2.2), TAB_LIST, TAB_PERSON,
                cap, ('　·　' + tag) if tag else ''))


TAB_LIST = ('<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FCFAF3" stroke-width="1.8" '
            'stroke-linecap="round"><rect x="2.5" y="4" width="4" height="16" rx="1"/><path d="M9 7h12M9 12h12M9 17h12"/></svg>')
TAB_PERSON = ('<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FCFAF3" stroke-width="1.8" '
              'stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>')


def screens(lang):
    return [
        dict(inner=c_home(lang, A), cap='① 首页态·默认', tag='稿第一屏：结构与色都照稿'),
        dict(inner=c_home(lang, A, ('0', '0')), cap='② 首页态·一条都还没有', tag='我补的边界态（现网计数本来就可能是 0）'),
        dict(inner=c_round(lang, A, 'photo'), cap='③ 录入态·拍照',
             tag='稿第二屏 + 圆钮画法改照<b>参考图</b>（图形在圆里、名字在圆下）+ 第四枚「文字」=D4 甲'),
        dict(inner=c_tagrow(lang, A, 'url') + c_field(lang, A, 'linkDesc') + c_slide(lang, A, 'ready', 'link'),
             cap='④ 录入态·链接', tag='稿没画这一态；输入框与「粘贴」照现网 .field 搬进面板'),
        dict(inner=c_tagrow(lang, A, 'write') + c_field(lang, A, 'manualDesc', 2, True) + c_slide(lang, A, 'ready', 'write'),
             cap='⑤ 录入态·文字', tag='稿没画；「原文翻译」那一枚与它的小字注释照现网'),
        dict(inner=c_tagrow(lang, A, 'photo') + c_strip(lang, A, 3) + c_slide(lang, A, 'ready', 'camera'),
             cap='⑥ 提炼态·已选 3 张', tag='稿第三屏＝现网布局'),
        dict(inner=c_tagrow(lang, A, 'photo') + c_strip(lang, A, 3) + c_slide(lang, A, 'busy', 'camera'),
             cap='⑦ 提炼态·正在提炼', tag='现网忙态：文案换 busyExtract、轨道吃满、圆钮停在最右'),
        dict(inner=c_tagrow(lang, A, 'photo') + c_strip(lang, A, 3) + c_hint(lang, A, 'perm'),
             cap='⑧ 报错·没拿到相机权限', tag='现网 hint-bubble：整枚可点进设置（字典 permCamera 原句）'),
        dict(inner=c_tagrow(lang, A, 'photo') + c_strip(lang, A, 9) + c_slide(lang, A, 'ready', 'camera'),
             cap='⑨ 边界·已选满 9 张',
             tag='<b>量出来的冲突</b>：面板 %d 宽一行只装得下 %d 格（现网是通栏装 5 格）；'
                 '9 张要 %d 行 = %d 高，与右滑条重叠 %d rpx ⇒ 我按"一行 + 左右滚"画，这条列进 C6'
                 % (DOCK_W, PER_ROW, NEED_ROWS, STRIP_H, OVERLAP)),
        dict(inner=c_home(lang, A), cap='⑩ 左半·随机卡片小图压暗', tag='稿 v2 的第一屏（<b>D1 未答</b>，先画给你看）',
             left=left_minis(lang, False)),
        dict(inner=c_round(lang, A, 'photo'), cap='⑪ 左半·按下恢复原色',
             tag='稿 v2 的第四屏；「更多」=新键（字典里没有这一键）', left=left_minis(lang, True)),
        dict(inner=c_home(lang, B), cap='⑫ 首页态·皮乙', tag='D2 的另一条：同一套结构，色吃现网 palette（%s）' % WALLPAPER,
             skin=B),
    ]


TAB_TOP = STAGE_H - 148
CSS_TAIL = '''
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
body{background:#EAE7E2;padding:28px;font-family:-apple-system,"PingFang SC",sans-serif}
.head{display:flex;gap:22px;align-items:flex-start;margin-bottom:26px;flex-wrap:wrap}
.head .bx{background:#fff;border:1px solid #DDD8CC;border-radius:14px;padding:12px}
.head img{display:block;height:250px;width:auto;border-radius:8px}
.head .t{font-size:15px;color:#45423E;margin-top:8px;max-width:330px;line-height:1.55}
.head code{background:#F2EFE9;padding:1px 4px;border-radius:4px;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(4,__W__px);gap:30px 24px}
.cell{width:__W__px}
.stage{position:relative;width:__W__px;height:__H__px;background:#0E0D0B;overflow:hidden;border-radius:36px;
       box-shadow:0 10px 26px rgba(0,0,0,.28)}
.nav{position:absolute;left:0;top:0;width:__W__px;height:__NAVH__px;background:#F4F2EC;z-index:9}
.nt{position:absolute;left:0;right:0;top:46px;text-align:center;font-size:30px;color:#17181C}
.caps{position:absolute;right:20px;top:46px;width:174px;height:62px;border:1px solid rgba(0,0,0,.10);
      border-radius:31px;background:rgba(255,255,255,.62);display:flex;align-items:center;justify-content:space-evenly}
.caps i{width:34px;height:14px;border-radius:7px;background:#17181C;position:relative}
.caps i::after{content:"";position:absolute;left:6px;top:4px;width:6px;height:6px;border-radius:50%;
               background:#F4F2EC;box-shadow:11px 0 0 #F4F2EC,22px 0 0 #F4F2EC}
.caps em{width:1px;height:30px;background:rgba(0,0,0,.14)}
.caps b{width:30px;height:30px;border-radius:50%;border:2px solid #17181C;position:relative}
.caps b::after{content:"";position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;
               border-radius:50%;background:#17181C}
.page{position:absolute;left:0;top:__NAVH__px;width:__W__px;height:__PAGEH__px}
.bg{position:absolute;inset:0;background:url("home-bg-portrait.jpg") center/cover no-repeat}
.scrim{position:absolute;inset:0;background:#000}
.trow{position:absolute;left:32px;top:34px;width:686px;display:flex;align-items:center}
.h1{font-size:42px;font-weight:700;color:#FFF;text-shadow:0 1px 6px rgba(0,0,0,.4)}
.langs{margin-left:auto;font-size:26px;color:rgba(255,255,255,.5);display:flex;gap:12px}
.langs .lon{color:#FFF;font-weight:700;border-bottom:3px solid #FFF;padding-bottom:2px}
.swap{position:absolute;left:32px;top:106px;display:flex;align-items:center;gap:12px;font-size:26px;
      color:#FFF;text-shadow:0 1px 6px rgba(0,0,0,.4)}
.swap .sdot{width:26px;height:26px;border-radius:50%;border:2px solid rgba(255,255,255,.7)}
.swap .s2{margin-left:22px}
.tips{position:absolute;left:28px;top:__TIPS__px;width:296px;font-size:26px;line-height:1.62;display:flex;align-items:flex-start}
.tips i{width:12px;height:12px;border-radius:50%;flex:none;margin:14px 10px 0 0}
.dock{position:absolute;overflow:hidden}
.num{font-family:'WtsjMind',-apple-system,sans-serif;font-weight:100}
.mag{position:relative;display:inline-block;flex:none}
.mag i{position:absolute;left:0;top:0;border-style:solid;border-width:3px;border-radius:50%}
.mag b{position:absolute;left:62%;top:62%;width:36%;height:12%;border-radius:2px;transform:rotate(45deg);
       transform-origin:0 50%;display:block}
.mic{position:relative;display:inline-block;border-style:solid;border-width:2px;border-radius:50%}
.mic i{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;display:block}
.thumb{display:block;width:100%;height:100%;background:url("home-bg-portrait.jpg") center/cover no-repeat}
.thumb.p1{background-position:18% 40%}.thumb.p2{background-position:42% 46%}
.thumb.p3{background-position:66% 52%}.thumb.p4{background-position:88% 44%}
.x{position:absolute;right:4px;top:4px;width:18px;height:18px;border-radius:50%;background:rgba(15,15,15,.55);
   color:#fff;font-size:11px;line-height:18px;text-align:center;font-style:normal}
.no{position:absolute;left:6px;bottom:3px;color:#FCFAF3;font-size:12px;font-style:normal;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.tabbar{position:absolute;left:24px;top:__TABTOP__px;width:702px;height:108px;border-radius:44px;
        background:__TBBG__;border:3px solid __TBLINE__;box-shadow:0 16px 44px __TBSHADOW__;
        display:flex;align-items:center;justify-content:space-around}
.tabbar .tb{width:76px;height:76px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.tabbar .tb-on{background:__TBSEL__}
.cap{margin-top:12px;font-size:19px;color:#33312E;line-height:1.55;width:__W__px}
'''
for _k, _v in [('__W__', STAGE_W), ('__H__', STAGE_H), ('__NAVH__', NAV_H), ('__PAGEH__', STAGE_H - NAV_H),
               ('__TIPS__', DOCK_TOP + 150 - NAV_H), ('__TABTOP__', TAB_TOP - NAV_H),
               ('__TBBG__', PAL['ch']['bg']), ('__TBSEL__', PAL['ch']['sel']),
               ('__TBLINE__', PAL['ch']['line']), ('__TBSHADOW__', PAL['ch']['shadow'])]:
    CSS_TAIL = CSS_TAIL.replace(_k, str(_v))
CSS = FONT + CSS_TAIL


def build(lang):
    cells = []
    for s in screens(lang):
        cells.append(frame(lang, s.get('skin', A), s['inner'], s['cap'], s['tag'], s.get('left', '')))
    head = ('<div class="head">'
            '<div class="bx"><img src="ref-三按钮.png"><div class="t"><b>参考图（你 21:32 给的那张）</b><br>'
            '三枚圆：中间大橙实心＋一圈灰环，两枚小圆里是<b>图形</b>，名字都写在<b>圆的下方</b>；'
            '底是半透明白玻璃。本表 ③ 的圆钮按<b>它</b>画（图形＋下方名字），与 html 稿不同 → 待拍 C1。</div></div>'
            '<div class="bx"><img src="ref-稿第一屏.png"><div class="t"><b>参考稿（你点名的三屏 v1）</b><br>'
            '面板 406×543rpx、贴右边缘与底边。本表所有屏的<b>结构与坐标</b>取自它，色也先照它（甲）。</div></div>'
            '<div class="bx"><img src="ref-现网首页.png"><div class="t"><b>现网这一屏（2.1.14 实测）</b><br>'
            '左块人物入口 + 右两枚计数 + 底栏。要换掉的就是这一屏；形象图、导航条高度、底栏那一块'
            '的颜色与圆底，全部照这张与 <code>palette.js</code> 取。</div></div>'
            '<div class="bx"><div class="t" style="max-width:330px;margin:0"><b>口径（全部现读）</b><br>'
            '字：%s从 <code>i18n.js</code>，缺键即报错不临场编；<br>'
            '色：<code>palette.js</code>（⑫ 那一屏）；<br>'
            '视口：真机截图 734×1588 ⇒ <b>750×1623rpx</b>；<br>'
            '大数字：从 <code>app.wxss</code> 那条 @font-face 原样搬（Poppins Thin 子集）。<br>'
            '默认亮度档 <b>%s</b>（罩层 %s）、壁纸 <b>%s</b>。</div></div>'
            '<div class="bx"><div class="t" style="max-width:330px;margin:0"><b>本表替你算出来的三件事</b><br>'
            '① D3：面板上抬 148rpx 让给底栏 ⇒ 面板顶到 %d rpx，比稿盖住照片多一截，'
            '那两位人物的脸被压到哪一行，看图判。<br>'
            '② C6：面板 %d 宽，一行只装得下 <b>%d</b> 格缩略图（现网通栏装 5 格）；'
            '9 张要 %d 行、与右滑条重叠 <b>%d</b> rpx。<br>'
            '③ D4：稿上三枚圆钮没有「文字」档，本表按"补第四枚"画。</div></div></div>'
            % ('中文' if lang == 'zh' else 'English（同一批键的 en 值）', DIM['name'], DIM['veil'], WALLPAPER,
               DOCK_TOP, DOCK_W, PER_ROW, NEED_ROWS, OVERLAP))
    html = ('<!doctype html><html><head><meta charset="utf-8"><title>2.2 首页全量效果图</title>'
            '<style>%s</style></head><body>%s<div class="grid">%s</div></body></html>' % (CSS, head, ''.join(cells)))
    name = '2.2全量效果图-%s.html' % ('中文' if lang == 'zh' else '英文')
    open(os.path.join(HERE, name), 'w', encoding='utf-8').write(html)
    return name


def render(name):
    out = os.path.join(HERE, name.replace('.html', '.png'))
    url = 'file://' + os.path.join(HERE, name)
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=1', '--screenshot=' + out,
                    '--window-size=3160,5620', url], capture_output=True)
    return out


def crop(png, lang):
    from PIL import Image
    im = Image.open(png)
    W, H = im.size
    gx0, gy0, cw, ch, gap = 28, 470, STAGE_W, STAGE_H + 90, 24
    for i in range(12):
        r, c = divmod(i, 4)
        x, y = gx0 + c * (cw + gap), gy0 + r * ch
        if x + STAGE_W <= W and y + STAGE_H <= H:
            im.crop((x, y, x + STAGE_W, y + STAGE_H)).save(
                os.path.join(HERE, '单屏-%s-%02d.png' % ('中' if lang == 'zh' else 'EN', i + 1)))


if __name__ == '__main__':
    for src, dst in [(os.path.join(MP, 'assets/home-bg-portrait.jpg'), 'home-bg-portrait.jpg'),
                     (os.path.join(DESIGN, '10-12首页-搜索框版/参考-他给的三按钮.png'), 'ref-三按钮.png'),
                     (os.path.join(DESIGN, '10-12首页-搜索框版/20261012-首页完整方案-三屏合并-v1-英文-第一屏-首页搜索框.png'), 'ref-稿第一屏.png'),
                     (os.path.join(DESIGN, '背景图深浅/实测/上浅下暗-首页.png'), 'ref-现网首页.png')]:
        if not os.path.exists(src):
            sys.exit('找不到素材：' + src)
        shutil.copyfile(src, os.path.join(HERE, dst))
    for lang in ('zh', 'en'):
        n = build(lang)
        p = render(n)
        print('HTML', os.path.join(HERE, n))
        print('PNG ', p, os.path.getsize(p) if os.path.exists(p) else '渲染失败')
        if os.path.exists(p):
            crop(p, lang)
