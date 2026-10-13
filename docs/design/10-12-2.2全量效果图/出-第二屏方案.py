#!/usr/bin/env python3
# 站长 10-13：「第二屏的设计提供下，一个HTML里面我要完整方案」
#
# 口径（一条都不许凭印象）：
#   · 屏上每句中文从 `utils/i18n.js` 现读（缺键直接 exit，不临场编叫法）
#   · 每一段尺寸／皮＝**整条声明从 `create.wxss` 原样搬**（css_block），只做两件事：
#     rpx→px、`var(--x)` 到 `app.wxss`＋`palette.createSkin()` 取值；一条都不在我这儿重写
#   · 图形吃落码那批 `mask-image` data-URI 原样（连那档描边一起），不另画 SVG
#   · 落点全按底锚算：框外那一行的顶＝视口高 − entry-wrap 那条 bottom − 那一行的高 − 面板高
#   · 压在墨上合成出来的面、井与面的级差、每行字的对比＝脚本现算（mix／WCAG）
#   · "这层玻璃糊不出东西"那句量的是**渲染出来的像素**（面板左内边距那一条 14×370 的均值与标准差，
#     外加它左边那条 24 的缝＝玻璃背后实际垫着的东西的标准差），不是我嘴上说的
# 跑法：python3 docs/design/10-12-2.2全量效果图/出-第二屏方案.py
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
dp = {'__file__': SRC, '__name__': 'dp_head'}
exec(compile(src[:src.index(ANCHOR)], SRC, 'exec'), dp)

CRE, APP, TAB = dp['CRE'], dp['APP'], dp['TAB']
mix, hx, levels, ratio, _rgb = dp['mix'], dp['hx'], dp['levels'], dp['ratio'], dp['_rgb']
ZH, CH, CP, DIMS = dp['ZH'], dp['CH'], dp['CP'], dp['DIMS']
TIP_DOT, INK = dp['TIP_DOT'], dp['INK']
CAM = dp['CAM']
panel_layer, var_of = dp['panel_layer'], dp['var_of']


def vof(tok):
    """`var(--x)` → 实际值：`--cp-*` 那几位在 <code>palette.createSkin()</code> 递进来的 style 里，
    app.wxss 根本没有，所以先看 CP 那张表、再看 app.wxss；读不到就 exit，不许我自己认一档。"""
    tok = ' '.join((tok or '').split())
    m = re.match(r'^var\((--[a-z0-9-]+)\)$', tok)
    if not m:
        return tok
    k = m.group(1)
    if k in CP:
        return CP[k]
    mm = re.search(re.escape(k) + r':\s*([^;]+)', APP)
    if not mm:
        sys.exit('读不到令牌 %s ⇒ 这一层皮不许我自己认一档' % k)
    return ' '.join(mm.group(1).split())
GROUP_TOP, VIEW_H = dp['GROUP_TOP'], dp['VIEW_H']
TAB_H, TAB_B = dp['TAB_H'], dp['TAB_B']
CHROME, MP = dp['CHROME'], dp['MP']
WALLP = '壁纸-站长给的-试面板.jpg'
NAV_H = 184                        # 他那两张真机截图上导航带的下沿（1116×2484 ⇒ 750×1669）
DIM = DIMS[1]                      # 默认亮度档「半月」
tup = lambda tok: _rgb(tok)[0]

# ============ 一、落码现读（读不到就当场 exit） ============
def parse_blocks(text):
    """同名选择器可能出现两次（`.container.has-bg .panel` 就一处画投影、一处换玻璃），
    CSS 按源码顺序后者赢 ⇒ 这里按**倒序**并成一条，`val()`/`css_block()` 取到的第一条就是赢家。"""
    d = {}
    for m in re.finditer(r'([^{}]+)\{([^}]*)\}', text):
        sel = ' '.join(m.group(1).split())
        if sel.startswith('@'):
            continue
        d.setdefault(sel, []).insert(0, m.group(2))
    return {k: ';'.join(v) for k, v in d.items()}


BLK = parse_blocks(CRE)


def body(sel):
    key = ' '.join(sel.split())
    b = BLK.get(key)
    if b is None:
        sys.exit('落码里读不到选择器 %s ⇒ 这一屏画不成（改名了？先来这里对上，别画凭印象的屏）' % key)
    return b


def val(sel, prop):
    m = re.search(r'(?:;|^)\s*' + re.escape(prop) + r'\s*:\s*([^;]+)', body(sel))
    if not m:
        sys.exit('落码里读不到 %s 的 %s（块里是：%s）' % (sel, prop, ' '.join(body(sel).split())[:160]))
    return ' '.join(m.group(1).split())


def nmb(sel, prop):
    """取这条声明里**第一个** rpx 数（`0 22rpx` 这种横档、`10rpx solid …` 这种简写都取到要点上）。"""
    m = re.search(r'(-?[\d.]+)rpx', val(sel, prop))
    if not m:
        sys.exit('%s 的 %s 里读不到 rpx 数：%s' % (sel, prop, val(sel, prop)))
    return float(m.group(1))


def nsv(tok):
    return float(re.sub(r'[^0-9.]', '', vof(tok)))


FS = {k: nsv('var(--fs-%s)' % k) for k in ('h1', 'h2', 'title', 'body', 'meta', 'tiny', 'label', 'micro')}
if len(FS) != 8 or any(v <= 0 for v in FS.values()):
    sys.exit('app.wxss 里那排 --fs-* 没读全')
W_EDGE = nsv('var(--w-edge)')

ENTRY_L = nmb('.container.entry-dock .entry-wrap', 'left')
ENTRY_B = nmb('.container.entry-dock .entry-wrap', 'bottom')
OUT_H = nmb('.out', 'height')
OUT_FS, OUT_LH, OUT_LS, OUT_C = val('.out', 'font-size'), val('.out', 'line-height'), val('.out', 'letter-spacing'), val('.out', 'color')
OUT_PADX, DOT_W, DOT_MR, BACK_MR = nmb('.out', 'padding'), nmb('.out-dot', 'width'), nmb('.out-dot', 'margin-right'), nmb('.out-r', 'margin-left')

PL_H, PL_H_OPEN = nmb('.panel', 'height'), nmb('.panel-open', 'height')
PL_BD = nmb('.panel', 'border')
PL_PT, PL_PX, PL_PB = (float(x) for x in val('.panel', 'padding').replace('rpx', '').split())
PL_R = nmb('.panel', 'border-radius')
PLATE = vof(val('.container.has-bg .panel', 'background'))
PLATE_BF = vof(val('.container.has-bg .panel', 'backdrop-filter'))
PLATE_EDGE = vof(val('.container.has-bg .panel', 'border-color'))

MODES_H, MODES_GAP = nmb('.modes', 'height'), nmb('.modes', 'gap')
MD_FS, MD_LH, MD_PADX = val('.md', 'font-size'), val('.md', 'line-height'), nmb('.md', 'padding')
RULE_W, RULE_H, RULE_B = nmb('.md::after', 'width'), nmb('.md::after', 'height'), nmb('.md::after', 'bottom')
CARD_MT, CARD_PAD, CARD_R = nmb('.card', 'margin-top'), nmb('.card', 'padding'), nmb('.card', 'border-radius')

CROW_GAP, MINI_W, MINI_C, MINI_G, MINI_GAP = (nmb('.crow', 'gap'), nmb('.mini', 'width'), nmb('.mini-c', 'width'),
                                              nmb('.mini-glyph', 'width'), nmb('.mini', 'gap'))
SHUT, SHUT_BD = nmb('.shut', 'width'), nmb('.shut', 'border')
SHUT_RING = val('.shut', 'border').split('solid', 1)[1].strip()
CORE, SHUT_G, SHUT_GAP = nmb('.shut-core', 'width'), nmb('.shut-glyph', 'width'), nmb('.shutcol', 'gap')

FIELD_H, FIELD_PADX, FIELD_R = nmb('.field', 'height'), nmb('.field', 'padding'), nmb('.field', 'border-radius')
WRITE2_H, WRITE_LH = nmb('.field-write-2', 'height'), val('.field-area', 'line-height')
WRITE_PT = nmb('.field-area', 'padding')
PASTE, PASTE_G = nmb('.field-paste', 'width'), nmb('.paste-glyph', 'width')
FIELD_BG = vof(val('.container.has-bg .field, .container.has-bg .sld', 'background'))
FIELD_EDGE = vof(val('.container.has-bg .field, .container.has-bg .sld', 'border-color'))

TH, TH_GAP, TH_R, TH_PLUS = nmb('.th', 'width'), nmb('.strip', 'gap'), nmb('.th', 'border-radius'), nmb('.th-plus', 'width')
TH_ADD_BG = vof(val('.th-add', 'background'))            # ← 这条**没**挂进 .has-bg 那一队（§六 那条发现）
_m = re.search(r'const ROW_CELLS\s*=\s*(\d+)', open(os.path.join(MP, 'pages/create/create.js'), encoding='utf-8').read())
if not _m:
    sys.exit('create.js 里读不到 ROW_CELLS ⇒"已选几张算展开"这一档不许我猜')
ROW_CELLS = int(_m.group(1))

SLD_H, SLD_BD = nmb('.sld', 'height'), nmb('.sld', 'border')
KNOB, KNOB_L, KNOB_T = nmb('.sld-knob', 'width'), nmb('.sld-knob', 'left'), nmb('.sld-knob', 'top')
DASH_W, SLD_GAP = nmb('.sld-txt::before, .sld-txt::after', 'width'), nmb('.sld-txt', 'gap')
DASH_OP = float(re.search(r'[\d.]+', val('.sld-txt::before, .sld-txt::after', 'opacity')).group(0))
SLD_TXT_FS = val('.sld-txt', 'font-size')
HINT_TOP, HINT_MINH, HINT_LR = nmb('.hint-bubble', 'top'), nmb('.hint-bubble', 'min-height'), nmb('.hint-bubble', 'left')
HINT_BG_HASBG = vof(val('.container.has-bg .hint-bubble', 'background'))
WR_H, WR_MT = nmb('.wr-sw', 'height'), nmb('.wr-sw', 'margin-top')
PLUS_GLY = nmb('.blk-plus-glyph', 'width')
PLUS_FG = vof(val('.blk-plus-glyph', 'background'))          # 首屏圆内那枚：快门里那支深棕
THPLUS_FG = vof(val('.th-plus', 'background'))                # 第二屏"再加一张"那枚
TAB_TOP = VIEW_H - TAB_B - TAB_H

LIFT_SHUT = float(re.search(r'calc\(66\.3% - ([\d.]+)rpx\)', body('.stage-panel')).group(1))
LIFT_OPEN = float(re.search(r'calc\(66\.3% - ([\d.]+)rpx\)', body('.stage-panel-open')).group(1))
INK_SHUT, INK_OPEN = GROUP_TOP - LIFT_SHUT, GROUP_TOP - LIFT_OPEN
_g = body('.glyph-plus')
GW = re.search(r"stroke-width='([\d.]+)'", _g)
if not GW:
    sys.exit('落码那支 .glyph-plus 里读不到 stroke-width ⇒ ➕ 粗细那两格是假的')
GLYPH_W = GW.group(1)


def entry_top(pl):
    """那一整块的顶＝框外那一行的顶：底锚那条 bottom ＋ 两块的高，全用上面现读的数。"""
    return VIEW_H - ENTRY_B - OUT_H - pl


def ink_top(pl, policy='code'):
    """那一层墨的顶。code＝落码现在的挂法（闸在 panelOpen 上）；track＝顶跟着这一态的面板顶走；
    cover＝整屏垫墨且顶固定（跟着最高那一态的顶）；none＝第二屏不垫。"""
    if policy == 'none':
        return None
    if policy == 'cover':
        return entry_top(PL_H_OPEN)
    if policy == 'track':
        return entry_top(pl)
    return INK_OPEN if pl > PL_H else INK_SHUT


def strand(pl, policy='code'):
    it = ink_top(pl, policy)
    return 0.0 if it is None else max(0.0, it - entry_top(pl))


S410, S490 = strand(PL_H), strand(PL_H_OPEN)

# ============ 二、把落码那批声明原样搬成 CSS ============
def sel_out(sel):
    parts = [' '.join(p.split()) for p in sel.split(',')]
    return ','.join('.sc' + p[len('.container'):] if p.startswith('.container') else '.sc ' + p for p in parts)


def css_block(sel, drop=(), extra=''):
    keep, seen = [], set()
    for chunk in body(sel).split(';'):
        s = ' '.join(chunk.split())
        if not s or ':' not in s:
            continue
        prop = s.split(':')[0].strip()
        if prop in drop or prop in seen:
            continue
        seen.add(prop)
        keep.append(s)
    if extra:
        keep.append(extra)
    return sel_out(sel) + '{' + ';'.join(keep).replace('rpx', 'px') + '}'


GLYPH = {}
for g in ('plus', 'images', 'camera', 'link', 'clipboard', 'pen', 'chev'):
    GLYPH[g] = re.search(r'(?<!-webkit-)\bmask-image:\s*(url\([^;]*\))', body('.glyph-' + g)).group(1)
MASK_SHARED = body('.blk-plus-glyph, .mini-glyph, .shut-glyph, .sld-glyph, .swap-glyph, .th-plus, .paste-glyph')


def token_block(text, sel):
    m = re.search(r'(?:^|\n)' + re.escape(sel) + r'\s*\{([^}]*)\}', text)
    if not m:
        sys.exit('读不到 app.wxss 的 %s 那排令牌' % sel)
    return ';'.join(' '.join(c.split()) for c in m.group(1).split(';') if ' '.join(c.split()).startswith('--')).replace('rpx', 'px')


TOKENS = (token_block(APP, 'page') + ';' + token_block(APP, '.theme-tint-paper') + ';' +
          ';'.join('%s:%s' % (k, v) for k, v in CP.items()))            # CP 的键本来就带 '--cp-' 前缀，别再拼一次

CSS_SELS = ['.out', '.out-dot', '.out-l', '.out-r', '.panel', '.panel-open', '.container.has-bg .panel',
            '.modes', '.md', '.md::after', '.md.on', '.md.on::after', '.card', '.container.has-bg .card',
            '.crow', '.mini', '.mini-c', '.mini-glyph', '.mini-lb',
            '.shutcol', '.shut', '.shut-core', '.shut-glyph', '.shut-lb',
            '.field', '.field-input', '.field-ph', '.field-x', '.field-paste', '.paste-glyph',
            '.field-write', '.field-write-2', '.field-area',
            '.strip', '.th', '.th-x', '.th-no', '.th-add', '.th-plus', '.th-add-dis',
            '.container.has-bg .field, .container.has-bg .sld', '.container.has-bg .mini-c',
            '.sld', '.sld-fill', '.sld-txt', '.sld-txt::before, .sld-txt::after', '.sld-knob', '.sld-glyph',
            '.sld-off .sld-txt', '.sld-busy .sld-txt', '.sld-done',
            '.wr-sw', '.wr-sw-lab', '.wr-sw-hint', '.wr-sw-track', '.wr-sw-dot', '.wr-sw-on .wr-sw-track', '.wr-sw-on .wr-sw-dot',
            '.hint-bubble', '.hint-bubble-act::after', '.container.has-bg .hint-bubble',
            '.title-row', '.title-row .page-title', '.page-title', '.lang-switch', '.lang-seg', '.lang-on',
            '.home-swap', '.swap-half', '.swap-text', '.dim-dot', '.swap-glyph']
EXTRA = {'.entry-wrap': '', '.field-input': 'background:none;border:none;outline:none',
         '.field-area': 'background:none;border:none;outline:none;resize:none',
         '.page-title': 'line-height:1.4', '.title-row': 'position:absolute;left:%.0fpx;right:%.0fpx;top:%.0fpx;margin:0' % (ENTRY_L, ENTRY_L, NAV_H + 2 + 48),
         '.home-swap': 'position:absolute;left:%.0fpx;top:%.0fpx;margin:0' % (ENTRY_L, NAV_H + 2 + 48 + FS['h1'] * 1.4 + 32 - 14)}

CSS_BASE = """
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
.sc{position:relative;width:750px;height:%(VH)dpx;overflow:hidden;background:#0E0D0B}
.scf{position:absolute}
.entry-wrap{position:absolute;left:%(EL).0fpx;right:%(EL).0fpx;bottom:%(EB).0fpx;z-index:6;display:flex;flex-direction:column}
.wb{position:absolute;left:0;top:%(NAV)dpx;width:750px;height:%(PV)dpx;background:url(%(WP)s) center 22%%/cover}
.vs{position:absolute;left:0;top:%(NAV)dpx;width:750px;height:%(PV)dpx;background:rgba(20,22,26,.58)}
.vg{position:absolute;left:0;top:%(NAV)dpx;width:750px;height:%(NAV)dpx;background:linear-gradient(180deg,rgba(8,10,14,.55),rgba(8,10,14,0))}
.nav{position:absolute;left:0;top:0;width:750px;height:%(NAV)dpx;background:#14161A;z-index:9}
.nav .nt{position:absolute;left:0;right:0;top:52px;text-align:center;font-size:30px;color:#F2EFE9}
.nav .caps{position:absolute;right:20px;top:52px;width:174px;height:62px;border:1px solid rgba(255,255,255,.22);
  border-radius:31px;background:rgba(20,22,26,.5);display:flex;align-items:center;justify-content:space-evenly}
.nav .caps i{width:34px;height:14px;border-radius:7px;background:#F2EFE9;position:relative}
.nav .caps i::after{content:"";position:absolute;left:6px;top:4px;width:6px;height:6px;border-radius:50%%;
  background:#14161A;box-shadow:11px 0 0 #14161A,22px 0 0 #14161A}
.nav .caps em{width:1px;height:30px;background:rgba(255,255,255,.22)}
.nav .caps b{width:30px;height:30px;border-radius:50%%;border:2px solid #F2EFE9;position:relative}
.nav .caps b::after{content:"";position:absolute;left:50%%;top:50%%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%%;background:#F2EFE9}
.gmask{%(MASK)s}
%(GLYPHS)s
.th-img{width:100%%;height:100%%;background:url(%(WP)s) center/cover}
input::placeholder,textarea::placeholder{color:var(--face-ph);opacity:1}
.tabbar{position:absolute;left:%(EL).0fpx;right:%(EL).0fpx;bottom:%(TB).0fpx;height:%(TH).0fpx;border-radius:44px;
  background:%(TBBG)s;display:flex;align-items:center;justify-content:space-around;z-index:7}
.tabbar .tb{width:76px;height:76px;border-radius:50%%;display:flex;align-items:center;justify-content:center;
  font-size:34px;color:%(TBIDLE)s}
.tabbar .tb.on{background:%(TBSEL)s;color:%(TBINK)s}
.errline{position:absolute;left:6px;right:6px;z-index:12;border:2px dashed #FF6B5A;border-radius:10px;
  font:700 15px/1.3 -apple-system,sans-serif;color:#FFE3DE;background:rgba(192,57,43,.5);padding:4px 8px}
.ruler{position:absolute;left:0;right:0;border-top:1px dashed rgba(255,0,255,.9);z-index:14;pointer-events:none}
.ruler span{position:absolute;right:6px;top:1px;font:700 12px/1.3 -apple-system,sans-serif;color:#FF6BF0;background:rgba(0,0,0,.45);padding:1px 5px;border-radius:4px}
""".replace('%.0f', '%.0f')


def build_css(extra=''):
    blocks = []
    for s in CSS_SELS:
        blocks.append(css_block(s, extra=EXTRA.get(s, '')))
    blocks.append('.sc .card>div,.sc .card>textarea{flex:none}')
    return (CSS_BASE % dict(VH=VIEW_H, PV=VIEW_H - NAV_H, NAV=NAV_H, WP=WALLP, EL=ENTRY_L, EB=ENTRY_B,
                            TB=TAB_B, TH=TAB_H, TBBG=CH['bg'], TBSEL=CH['sel'], TBINK=CH['ink'], TBIDLE=CH['idle'],
                            MASK=';'.join(' '.join(c.split()) for c in MASK_SHARED.split(';') if c.strip()).replace('rpx', 'px'),
                            GLYPHS='\n'.join('.g-%s{mask-image:%s;-webkit-mask-image:%s}' % (k, v, v) for k, v in GLYPH.items()))
            + '\n'.join(blocks) + '\n' + extra)


VARS = []


def variant(plate, fill):
    """把某一屏的白玻璃档位换成临时值（只为对比画，不改落码）。返回一个挂在 .sc 上的类名。"""
    cls = 'v%d' % len(VARS)
    VARS.append('.sc.%s .panel{background:%s;border-color:%s}'
                '.sc.%s .field,.sc.%s .sld,.sc.%s .mini-c,.sc.%s .th-add{background:%s}'
                % (cls, plate or PLATE, PLATE_EDGE, cls, cls, cls, cls, fill or FIELD_BG))
    return cls


# ============ 三、一屏一屏地搭 ============
CARD_INNER_W = 750 - 2 * ENTRY_L - 2 * PL_BD - 2 * PL_PX - 2 * CARD_PAD


def sld_row(icon, busy=False, ready=True):
    return ('<div class="sld %s"><div class="sld-fill" style="width:%dpx"></div>'
            '<div class="sld-txt">%s</div><div class="sld-knob" style="left:%dpx">'
            '<div class="sld-glyph gmask g-%s"></div></div></div>'
            % ('sld-off' if not ready and not busy else '', int(CARD_INNER_W) if busy else 0,
               ZH['busyExtract'] if busy else ZH['slideExtract'],
               int(KNOB_L + CARD_INNER_W - 2 * SLD_BD - KNOB - 2 * KNOB_L) if busy else int(KNOB_L), icon))


def crow_row():
    return ('<div class="crow">'
            '<div class="mini"><div class="mini-c"><div class="mini-glyph gmask g-images"></div></div>'
            '<span class="mini-lb">%s</span></div>'
            '<div class="shutcol"><div class="shut"><div class="shut-core">'
            '<div class="shut-glyph gmask g-camera"></div></div></div><span class="shut-lb">%s</span></div>'
            '<div class="mini"><div class="mini-c"><div class="mini-glyph gmask g-link"></div></div>'
            '<span class="mini-lb">%s</span></div></div>' % (ZH['fromAlbum'], ZH['takePhoto'], ZH['modeUrl']))


def strip_row(n):
    return ('<div class="strip">%s<div class="th th-add"><div class="th-plus gmask g-plus"></div></div></div>'
            % ''.join('<div class="th"><div class="th-img"></div><div class="th-x">✕</div>'
                      '<span class="th-no">%d</span></div>' % (i + 1) for i in range(n)))


def field_url(v=''):
    return ('<div class="field"><input class="field-input" value="%s" placeholder="%s"/>'
            '<div class="field-paste"><div class="paste-glyph gmask g-clipboard"></div></div></div>'
            % (v, ZH['linkDesc']))


def field_write(two=False):
    return ('<div class="field field-write%s"><textarea class="field-area" placeholder="%s"></textarea>'
            '<div class="field-paste"><div class="paste-glyph gmask g-clipboard"></div></div></div>'
            % (' field-write-2' if two else '', ZH['manualDesc']))


def wr_sw():
    return ('<div class="wr-sw"><span class="wr-sw-lab">%s</span><span class="wr-sw-hint">%s</span>'
            '<div class="wr-sw-track"><div class="wr-sw-dot"></div></div></div>'
            % (ZH['origTranslate'], ZH['origTranslateHint']))


def modes(on):
    return '<div class="modes">%s</div>' % ''.join(
        '<div class="md%s">%s</div>' % (' on' if tag == on else '', ZH[k])
        for k, tag in (('modePhoto', 'photo'), ('modeUrl', 'url'), ('modeWrite', 'write')))


STATE = {
    'photo': ('photo', PL_H, "wx:if：active==='photo' && !previewImages.length"),
    'shots': ('photo', PL_H, "active==='photo'（已选 3 张：3＋1 ≤ ROW_CELLS %d ⇒ 不展开）" % ROW_CELLS),
    'shots-open': ('photo', PL_H_OPEN, "active==='photo'（已选 6 张：6＋1 > %d ⇒ panelOpen，面板 %.0f）" % (ROW_CELLS, PL_H_OPEN)),
    'busy': ('photo', PL_H, "同「已选 3 张」＋ busy"),
    'url': ('url', PL_H, "active==='url'"),
    'url-err': ('url', PL_H, "active==='url' ＋ hintLine"),
    'write': ('write', PL_H, "active==='write' && !bodyFocus"),
    'write-open': ('write', PL_H_OPEN, "active==='write' && bodyFocus ⇒ panelOpen"),
}
ORDER = ['photo', 'shots', 'shots-open', 'busy', 'url', 'url-err', 'write', 'write-open']
CAPS = {
    'photo': ('① 照片档·还没选图', '⇒ 框里只有三枚圈；右滑那一枚不出现（template 那条 wx:if 挡住了）。'),
    'shots': ('② 照片档·已选 3 张', '⇒ 面板仍 %.0f；一排五格，➕ 钉在这一行的最右端。' % PL_H),
    'shots-open': ('③ 照片档·已选 6 张（展开）', '⇒ 面板 %.0f，只多一行小图——你 10-08 那句「展开也只是多一行高度」。' % PL_H_OPEN),
    'busy': ('④ 照片档·正在提炼', '⇒ 字换 <code>busyExtract</code>、轨道吃满、圆钮停最右，颜色全程不变。'),
    'url': ('⑤ 链接档', '⇒ 输入格 %.0f ＋ 右滑那一枚 %.0f；没内容时圆钮照旧是橙、但不许拖（<code>!ready</code> 直接不给起拖）。' % (FIELD_H, SLD_H)),
    'url-err': ('⑥ 链接档·报错那一帧', '⇒ 报错浮在输入框正上方（absolute），不吃流内高度——不许再把面板顶来顶去。'),
    'write': ('⑦ 文字档·没聚焦', '⇒ 只有一个框，收起一行（%.0f）；标题与归类挪到详情页「编辑」里改。' % FIELD_H),
    'write-open': ('⑧ 文字档·聚焦（展开）', '⇒ 框从 %.0f 变 %.0f，「原文翻译」那一枚只在展开态出现（这条放置是我定的，你没拍过）。' % (FIELD_H, WRITE2_H)),
}


def body_of(kind):
    if kind == 'photo':
        return crow_row()
    if kind in ('shots', 'busy'):
        return strip_row(3) + sld_row('images', busy=kind == 'busy')
    if kind == 'shots-open':
        return strip_row(6) + sld_row('images')
    if kind == 'url':
        return field_url() + sld_row('link', ready=False)
    if kind == 'url-err':
        return field_url('https://') + sld_row('link')
    if kind == 'write':
        return field_write() + sld_row('pen', ready=False)
    if kind == 'write-open':
        return field_write(True) + wr_sw() + sld_row('pen', ready=False)
    sys.exit('未知档：%s' % kind)


def screen(kind, ink='code', plate=None, fill=None, bare_out=False, tip=0, marks=True):
    active, pl, _ = STATE[kind]
    itop = ink_top(pl, ink)
    st = ['<div class="sc has-bg %s" style="%s">' % (variant(plate, fill) if (plate or fill) else '', TOKENS),
          '<div class="wb"></div>', '<div class="vs" style="opacity:%s"></div>' % DIM['veil']]
    if itop is not None:
        st.append(panel_layer(itop).replace('class="f"', 'class="scf"'))
    st += ['<div class="vg"></div>',
           '<div class="nav"><span class="nt">%s</span><span class="caps"><i></i><em></em><b></b></span></div>' % ZH['appName'],
           '<div class="title-row"><span class="page-title">%s</span>'
           '<div class="lang-switch"><span class="lang-seg lang-on">中</span><span class="lang-seg">EN</span></div></div>' % ZH['createHeading'],
           '<div class="home-swap"><div class="swap-half"><span class="swap-text">%s</span>'
           '<div class="dim-dot" style="background:%s"></div></div>'
           '<div class="swap-half"><span class="swap-text">%s</span><div class="swap-glyph gmask g-chev"></div></div></div>'
           % (ZH['bgDimLabel'], DIM['dot'], ZH['homeBgSwap'])]
    et = entry_top(pl)
    st.append('<div class="entry-wrap"><div class="out" style="color:%s">'
              '<div class="out-dot" style="background:%s"></div>'
              '<span class="out-l">%s%s</span><span class="out-r">%s</span></div>'
              % (vof('var(--text-tertiary)') if bare_out else OUT_C, TIP_DOT,
                 ZH['tipsPrefix'], ZH['tips'][tip], ZH['back']))
    st.append('<div class="panel%s">' % (' panel-open' if pl > PL_H else ''))
    if kind == 'url-err':
        st.append('<div class="hint-bubble">%s</div>' % ZH['linkRule'])
    st.append(modes(active) + '<div class="card">%s</div></div></div>' % body_of(kind))
    st.append('<div class="tabbar"><span class="tb on">+</span><span class="tb">≡</span><span class="tb">◇</span></div>')
    if marks:
        s = strand(pl, ink)
        if s > 0:
            st.append('<div class="errline" style="top:%.0fpx;height:%.0fpx">框外那一行有 <b>%.0f</b> rpx 悬在墨层外</div>'
                      % (et, s, s))
        if itop is not None:
            st.append('<div class="ruler" style="top:%.0fpx"><span>墨顶 %.0f</span></div>' % (itop, itop))
        st.append('<div class="ruler" style="top:%.0fpx"><span>那一行的顶 %.0f</span></div>' % (et, et))
    st.append('</div>')
    return ''.join(st)


# ============ 四、探针：三屏渲成 1∶1，从像素里读数 ============
PROBE = [('A1', '照码：垫墨＋白 ' + PLATE, dict(kind='photo', ink='cover', marks=False)),
         ('A2', '甲：垫墨＋白 .72／井 .42', dict(kind='photo', ink='cover', marks=False,
                                                 plate='rgba(255,255,255,.72)', fill='rgba(255,255,255,.42)')),
         ('B', '乙：第二屏不垫墨（＝现网那一屏）', dict(kind='photo', ink='none', marks=False, bare_out=True))]
# 取样条的位置：必须落在墨层那条半透明带**以下**（带 240 自己就在变亮，会把标准差灌水），
# 又要在面板里面（面板 1107~1517），且 x 让开白卡（卡从 50 起）。
PY0, PYH = int(max(entry_top(PL_H) + OUT_H + PL_PT + 14, INK_OPEN + 240 + 12)), 226
PX0, PX1 = int(ENTRY_L + PL_BD + 5), int(ENTRY_L + PL_BD + 5 + 14)


def run_probe():
    inner = ''.join(screen(**kw) for _, _, kw in PROBE)
    css = build_css(''.join(VARS))
    VARS[:] = []
    html = ('<!doctype html><html><head><meta charset="utf-8"><style>%sbody{margin:0}</style></head><body>%s</body></html>'
            % (css, inner))
    p, q = os.path.join(HERE, '.probe2.html'), os.path.join(HERE, '.probe2.png')
    open(p, 'w', encoding='utf-8').write(html)
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=1', '--window-size=750,%d' % (VIEW_H * len(PROBE)),
                    '--screenshot=' + q, 'file://' + p], capture_output=True, check=True)
    from PIL import Image
    im = Image.open(q).convert('RGB')
    if im.size != (750, VIEW_H * len(PROBE)):
        sys.exit('探针尺寸 %s ≠ 750×%d ⇒ 量出来的数全是错的' % (im.size, VIEW_H * len(PROBE)))
    px = im.load()

    def stat(x0, x1, y0):
        cs = [px[x, y] for y in range(y0, y0 + PYH) for x in range(x0, x1)]
        n = len(cs)
        m = [sum(c[j] for c in cs) / n for j in range(3)]
        return m, (sum(sum((c[j] - m[j]) ** 2 for j in range(3)) for c in cs) / n) ** .5

    res = []
    for i, (tag, name, kw) in enumerate(PROBE):
        base = i * VIEW_H
        mean, std = stat(PX0, PX1, base + PY0)
        # 同一高度、面板左边那条 %.0f 的缝＝那块玻璃背后实际垫着的东西
        bm, bs = stat(0, int(ENTRY_L) - 2, base + PY0)
        res.append(dict(tag=tag, name=name, mean=mean, face=hx(mean), std=std,
                        back=hx(bm), back_std=bs, kw=kw))
    os.remove(p)
    os.remove(q)
    return res


PR = run_probe()
INK_RGB = tup(INK)


def _hex(v):
    """mix() 的底一律要 '#RRGGBB'；量出来的是浮点三元组，先落成实心色再往下算。"""
    return v if isinstance(v, str) else hx(v)


for r in PR:
    f = _hex(r['mean'])
    fillv = r['kw'].get('fill') or FIELD_BG
    well = mix(fillv, f)
    r.update(cr_main=ratio(tup(CP['--cp-ink']), r['mean']),
             cr_dim=ratio(mix(CP['--cp-ink-50'], f), r['mean']),
             cr_back=ratio(mix(CP['--cp-ink-50'], _hex(r['back'])), tup(r['back'])),
             well=hx(well), well_lv=levels(well, r['mean']))
SUB = {r['tag']: r for r in PR}

LIVE_FACE = None
_lv = os.path.join(HERE, '站长给的-第二屏现状.jpg')
if os.path.exists(_lv):
    from PIL import Image
    _im = Image.open(_lv).convert('RGB')
    _px, _k = _im.load(), 1116 / 750.0
    _cs = [_px[int(x * _k), int(y * _k)] for y in range(1180, 1230) for x in range(290, 420)]
    LIVE_FACE = hx([sum(c[j] for c in _cs) / len(_cs) for j in range(3)])

PLUS_THICK = GLYPH['plus'].replace("stroke-width='%s'" % GLYPH_W, "stroke-width='2.4'")
if PLUS_THICK == GLYPH['plus']:
    sys.exit('没换掉 stroke-width ⇒ ➕ 粗细那两格是假的')


# 那两支加号写成 **CSS 类**而不是行内 style：落码的 mask data-URI 里带双引号，
# 塞进 style="…" 这个属性里会把属性从中间截断 ⇒ 图形不显示，只剩一块实心。
PLUS_CSS = ('.gp-thin{mask-image:%s;-webkit-mask-image:%s}'
            '.gp-thick{mask-image:%s;-webkit-mask-image:%s}'
            % (GLYPH['plus'], GLYPH['plus'], PLUS_THICK, PLUS_THICK))


def plus_tile(标题, cls, size, bg, fg, 注):
    return ('<div class="tile"><div style="height:126px;display:flex;align-items:center;justify-content:center;background:%s">'
            '<div class="gmask %s" style="width:%dpx;height:%dpx;background:%s"></div></div>'
            '<div class="h">%s</div><div class="b">%s</div></div>'
            % (bg, cls, size, size, fg, 标题, 注))


# ============ 五、装配这一页 ============
SC = 0.60


def shot(inner, cap='', h=VIEW_H):
    """1∶1 画好再整体缩到 60%%：缩略图上的字仍读得动，backdrop-filter 照样生效。"""
    return ('<div class="shot"><div class="cap">%s</div>'
            '<div style="position:relative;overflow:hidden;width:%dpx;height:%dpx;background:#0E0D0B">'
            '<div style="position:absolute;left:0;top:0;transform:scale(%s);transform-origin:top left">%s</div>'
            '</div></div>' % (cap, int(750 * SC), int(h * SC), SC, inner))


def clip(inner, y0, cap='', h=450):
    """只裁那一屏 880~1330 那一条（顶那一刀的差别全在这一段里）。"""
    return ('<div class="shot"><div class="cap">%s</div>'
            '<div class="clip" style="width:%dpx;height:%dpx">'
            '<div style="position:absolute;left:0;top:%dpx;transform:scale(%s);transform-origin:top left">%s</div>'
            '</div></div>' % (cap, int(750 * SC), int(h * SC), int(-y0 * SC), SC, inner))


TOP0 = 880
sec2 = [shot(screen(k), cap='%s　·　%s　%s' % (CAPS[k][0], STATE[k][2], CAPS[k][1])) for k in ORDER]
sec3 = [clip(screen('photo', ink='code'), TOP0,
             cap='现状（落码）｜墨的闸挂在 <code>panelOpen</code> 上：面板 %.0f 那一态墨顶 %.0f、'
                 '那一行的顶 %.0f ⇒ 悬空 <b>%.0f</b> rpx' % (PL_H, INK_SHUT, entry_top(PL_H), S410)),
        clip(screen('photo', ink='cover'), TOP0,
             cap='甲（建议）｜闸改挂 <code>active</code>、顶固定 %.0f（＝面板 %.0f 那一态的顶）'
                 '⇒ 整行坐墨上，这一屏内不再跳' % (entry_top(PL_H_OPEN), PL_H_OPEN)),
        clip(screen('photo', ink='track'), TOP0,
             cap='乙｜顶跟着面板实际顶走（%.0f→%.0f、%.0f→%.0f）'
                 '⇒ 聚焦输入框、加到第六张那两下，这一层墨自己往上 %.0f rpx'
                 % (PL_H, entry_top(PL_H), PL_H_OPEN, entry_top(PL_H_OPEN),
                    abs(entry_top(PL_H) - entry_top(PL_H_OPEN))))]
sec4 = [shot(screen('photo', ink='cover', marks=False), cap='A1｜照码：垫墨 ＋ 白 <code>%s</code>' % PLATE),
        shot(screen('photo', ink='cover', plate='rgba(255,255,255,.72)', fill='rgba(255,255,255,.42)', marks=False),
             cap='A2｜甲：垫墨 ＋ 白 .72／井 .42'),
        shot(screen('photo', ink='none', bare_out=True, marks=False), cap='B｜乙：第二屏不垫墨（＝现网那一屏）')]

MEAS_LINES = []
for r in PR:
    MEAS_LINES.append(
        '<b>%s｜%s</b>：那块面渲出来实测 <code>%s</code>、条内标准差 <b>%.1f</b>；'
        '它左边那条 %d 的缝（＝玻璃背后垫着的东西）实测 <code>%s</code>、标准差 <b>%.1f</b>；'
        '面板里那几行墨字（选中的标签、输入框、右滑那句）对它 <b>%.2f:1</b>%s；'
        '没选中的那两枚标签 <b>%.2f:1</b>%s；那口井合成 <code>%s</code>、与面差 <b>%.0f 级</b>'
        % (r['tag'], r['name'], r['face'], r['std'], int(ENTRY_L) - 2, r['back'], r['back_std'],
           r['cr_main'], '✓' if r['cr_main'] >= 4.5 else '✗（正文门槛 4.5）',
           r['cr_dim'], '✓' if r['cr_dim'] >= 4.5 else '✗', r['well'], r['well_lv']))

GEOM = [
    ('这一整块', '<code>position:fixed</code> 沉底：左右 %.0f、离屏底 %.0f；里面只有两段——框外那一行 ＋ 那张录入面板。' % (ENTRY_L, ENTRY_B)),
    ('框外那一行', '高 %.0f、左右各让 %.0f；小圆点 %.0f、离字 %.0f；字 %g／行高 %s／字距 %s；「返回」离字 %.0f。' % (OUT_H, OUT_PADX, DOT_W, DOT_MR, FS['meta'], OUT_LH, OUT_LS, BACK_MR)),
    ('录入面板', '%.0f 高（展开 %.0f）、圆角 %.0f、描边 %.0f、内边距 %.0f／%.0f／%.0f；皮＝白 <code>%s</code> ＋ <code>%s</code> ＋ 细边 <code>%s</code>。'
     % (PL_H, PL_H_OPEN, PL_R, PL_BD, PL_PT, PL_PX, PL_PB, PLATE, PLATE_BF, PLATE_EDGE)),
    ('三枚标签', '行高 %.0f、间距 %.0f、热区左右各 %.0f、字 <code>%s</code>；选中那一枚底下那短线 %.0f×%.0f、离字底 %.0f。' % (MODES_H, MODES_GAP, MD_PADX, MD_FS, RULE_W, RULE_H, RULE_B)),
    ('白卡', '上边距 %.0f、内边距 %.0f、圆角 %.0f；铺图那一态＝<b>透明、不画边</b>（10-11 R3「外框与内框集体变毛玻璃」，两层合成一层）。' % (CARD_MT, CARD_PAD, CARD_R)),
    ('三枚圈', '快门 %.0f（环 %.0f <code>%s</code> ＋ 实心 %.0f 橙 <code>%s</code> ＋ 图形 %.0f）；两枚小圆 %.0f、图形 %.0f；整排间距 %.0f。' % (SHUT, SHUT_BD, SHUT_RING, CORE, CAM, SHUT_G, MINI_C, MINI_G, CROW_GAP)),
    ('输入格／那口井', '高 %.0f（文字展开 %.0f）、内边距 %.0f、圆角 %.0f、描边 %.0f；皮＝白 <code>%s</code> ＋ 细边 <code>%s</code>；粘贴热区 %.0f、图形 %.0f。' % (FIELD_H, WRITE2_H, FIELD_PADX, FIELD_R, W_EDGE, FIELD_BG, FIELD_EDGE, PASTE, PASTE_G)),
    ('小图排', '%d 格一排；%.0f 见方、圆角 %.0f、间距 %.0f；➕ 那枚 %.0f 见方、图形 %.0f。' % (ROW_CELLS, TH, TH_R, TH_GAP, TH, TH_PLUS)),
    ('右滑那一枚', '高 %.0f、描边 %.0f、圆钮 %.0f（起点离边 %.0f、顶 %.0f）；字 <code>%s</code>、两侧虚线各 %.0f、透明度 %s。' % (SLD_H, SLD_BD, KNOB, KNOB_L, KNOB_T, SLD_TXT_FS, DASH_W, DASH_OP)),
    ('报错那一枚', '浮在面板里（absolute）：离面板顶 %.0f、左右各进 %.0f、最小高 %.0f；铺图那一态面＝<code>%s</code> ＋ 糊。' % (HINT_TOP, HINT_LR, HINT_MINH, HINT_BG_HASBG)),
    ('翻译开关', '行高 %.0f、上间距 %.0f；只在文字档展开态出现（这条放置是我定的，你没拍过）。' % (WR_H, WR_MT)),
]
GEOM_H = ''.join('<div style="width:49%%;min-width:540px"><b>%s</b>：%s</div>' % (k, v) for k, v in GEOM)

NEG = ('<b>一、那一行不搬进框里</b>：你 10-08 原话「这一行移出框外」是拍过的；D16 两个方案都在"框外"这条线上修顶，不动结构。<br>'
       '<b>二、快门那枚橙圆、三枚标签的字、两枚小圆里的图形、粘贴图形</b>：10-11 R1／R2 明写"按钮ICON不变"，这一屏一个都不碰。<br>'
       '<b>三、面板高度不从 %.0f／%.0f 改</b>：那两档是你 10-08 深夜圈的红框；改它要连带改「展开只多一行」那条判据。<br>'
       '<b>四、不给这屏加第三样控件</b>：白卡肚子里的富余只有 <b>%.0f</b> rpx（现算：%.0f − 描边 %.0f − 上下内边距 %.0f＋%.0f − 标签行 %.0f − 卡上边距 %.0f − 卡内边距 %.0f×2），塞不进；而且你两轮说过不许挡脸。<br>'
       '<b>五、「加新模板不用发版」这一页一个字不提</b>。<br>'
       '<b>六、人物那两张图与这屏无关</b>：展开时 <code>home-blk</code> 整组不渲染（<code>wx:if="{{!active}}"</code>），'
       '所以"白框下移、头部一半在框外"那一笔只作用在第一屏；这一屏上面露的是形象图本身。'
       % (PL_H, PL_H_OPEN,
          PL_H - 2 * PL_BD - PL_PT - PL_PB - MODES_H - CARD_MT - 2 * CARD_PAD,
          PL_H, 2 * PL_BD, PL_PT, PL_PB, MODES_H, CARD_MT, CARD_PAD))


def row(code, 标题, 出处, shots, 代价, 建议, 答案):
    return ('<div class="row"><div class="ttl"><code>%s</code>%s</div><div class="sub">%s</div>'
            '<div class="shots">%s</div><div class="cost">%s</div>'
            '<div class="ans">我的建议：%s　｜　你要回的就这几个字：%s</div></div>'
            % (code, 标题, 出处, shots, 代价, 建议, 答案))


rows = []
rows.append(row('D16', '第二屏框外那一行有 %.0f／%.0f rpx 悬在墨层之外（这一条必须先修）' % (S410, S490),
    '数不是量的，是从落码那六个数相加相减出来的：视口 %d、bottom %.0f、那一行 %.0f、面板 %.0f／%.0f、墨顶 %.0f／%.0f。'
    '要拿屏幕钉它得等真跑那批（#109 还堵在 automator 连接报错）。' % (VIEW_H, ENTRY_B, OUT_H, PL_H, PL_H_OPEN, INK_SHUT, INK_OPEN),
    '',
    '<b>甲（建议）</b>：墨的闸从 <code>panelOpen</code> 改挂 <code>active</code>，顶固定 %.0f（跟着最高那一态的顶）。'
    '代价：第一屏→第二屏那一下墨层往上挪 %.0frpx（现在也挪，只是挪错了地方），第二屏之内聚焦／加到第六张<b>不再跳</b>。<br>'
    '<b>乙</b>：顶跟着面板实际顶走（%.0f→%.0f、%.0f→%.0f）。代价：这一屏之内每聚焦一次输入框、每加到第六张，'
    '背景那一层自己往上跳 %.0frpx——动的是背景，眼睛一定看得见。<br>'
    '两案都不动你 10-08 拍的「这一行移出框外」，也不动那一行 %.0f 的高。'
    % (entry_top(PL_H_OPEN), INK_SHUT - entry_top(PL_H_OPEN),
       PL_H, entry_top(PL_H), PL_H_OPEN, entry_top(PL_H_OPEN),
       abs(entry_top(PL_H) - entry_top(PL_H_OPEN)), OUT_H),
    '甲', 'D16 甲'))

rows.append(row('D17', '那块录入面板压在恒深的墨上，糊不出东西（"第二屏没感觉"的那一半在这儿）',
    '同一态渲三遍，只差垫不垫那层墨、和那档白多少。下面是把这三屏渲成 1∶1 之后<b>从像素里读的</b>'
    '（读面板左内边距那一条 %d×%d，避开所有控件与文字）。' % (PX1 - PX0, PYH),
    '',
    '<div>%s</div><br>'
    '<b>甲（抬白 .72／井 .42）</b>：面色回到现网那块实测的浅面（你那张真机截图上采的是 <code>%s</code>），'
    '那几行墨字过 4.5。代价：改你 10-11 亲手点的 .50，而且这一枚令牌 <code>--glass-plate</code> 是首屏那块与第二屏这块<b>一起吃</b>，'
    '抬一档两处同时变——这就是 D12 那一问，答一次两处都算。<br>'
    '<b>乙（第二屏不垫墨）</b>：回到 10-11 你要的"沉浸式"，玻璃有东西可糊（背后那条缝的标准差从 %.1f 回到 %.1f）。'
    '代价：第一屏那层墨在第二屏整片退掉，跟「第二屏只是多了外面一层深色面板」自相矛盾；'
    '而且那一行的字要请回 10-12 那两条深浅翻色规则（不垫墨＝它又浮在原图上，极性随壁纸翻）。<br>'
    '<b>丙（不做）</b>：录入面板换墨面、字转纸白＝推翻你 10-10 拍的"换浅面"，还要把 <code>--cp-ink*</code> 那一整套翻回来。<br>'
    '<b>顺带一句，不用你现在拍</b>：没选中的那两枚标签吃 <code>--cp-ink-50</code>，在现网那块面上实测也只有 '
    '%.2f:1（B 那一屏），A1 更差到 %.2f:1——这条不是 2.2 带来的，是 10-10 换浅面那一批留下的旧账；'
    '要修就单独开一票（把那一档从 .50 抬到 .62 上下，中英各量一次宽度）。'
    % ('<br>'.join(MEAS_LINES), LIVE_FACE or '（缺那张真机截图）', SUB['A1']['back_std'], SUB['B']['back_std'],
       SUB['B']['cr_dim'], SUB['A1']['cr_dim']),
    '甲（与 D12 一起答）', 'D17 甲'))

rows.append(row('D18', '「已选那排」最右那枚 ➕ 格没挂进玻璃那一队（这条你没提过，是我这轮读码读出来的）',
    '落码里 <code>.container.has-bg</code> 那三条覆盖只点了 <code>.field</code>／<code>.sld</code>／<code>.mini-c</code>，'
    '<code>.th-add</code> 不在名单里 ⇒ 铺图那一态它是<b>实心 <code>%s</code></b>，而同排的井是 <code>%s</code>。' % (TH_ADD_BG, FIELD_BG),
    '<div class="tile"><div style="height:126px;background:%s;display:flex;align-items:center;justify-content:center;gap:16px">'
    '<div style="width:%dpx;height:%dpx;border-radius:%dpx;background:%s"></div>'
    '<div style="width:%dpx;height:%dpx;border-radius:%dpx;background:%s"></div></div>'
    '<div class="h">左＝➕ 格现在（实心）　右＝井（玻璃）</div>'
    '<div class="b">压在墨面上：实心那枚与墨差 <b>%.0f 级</b>，玻璃那枚差 <b>%.0f 级</b>——同一排两档皮。'
    '➕ 那一格只在"已选图之后"现面，所以你大概还没撞上。</div></div>'
    % (hx(tup(INK)), TH, TH, TH_R, TH_ADD_BG, TH, TH, TH_R, FIELD_BG,
       levels(tup(TH_ADD_BG), tup(INK)), levels(mix(FIELD_BG, _hex(tup(INK))), tup(INK))),
    '<b>甲（建议）</b>：把 <code>.th-add</code> 一起挂进那条覆盖（一行的选择器），与井同档。代价：那枚➕淡一档，'
    '"名单齐不齐"那类静态尺子要跟着加一项。<br><b>乙</b>：不动。代价：你 10-08 那句「加图做成与小图一样尺寸的方图，风格统一」'
    '在这一格上是破的。',
    '甲', 'D18 甲'))

rows.append(row('D19', '➕ 那支描边多粗（你说"稍微粗一点"的是首屏圆内那一枚，第二屏这枚要不要跟着）',
    '两枚吃<b>同一支</b> mask（<code>.glyph-plus</code>，落码描边 <b>%s</b>）：首屏圆内那枚 %drpx、'
    '第二屏"再加一张"那枚 %drpx。只加粗一枚就得给首屏那枚单开一支 mask。' % (GLYPH_W, PLUS_GLY, TH_PLUS),
    plus_tile('现值：描边 %s｜首屏圆内那枚 %d' % (GLYPH_W, PLUS_GLY), 'gp-thin', PLUS_GLY, SUB['A1']['face'], PLUS_FG,
              '底是 A1 那块面实测的 %s；图形吃 <code>--cp-cam-ink</code>。就是左这一枚——你说"稍微粗一点"指的是它。' % SUB['A1']['face'])
    + plus_tile('拟：描边 2.4（只首屏那一枚）', 'gp-thick', PLUS_GLY, SUB['A1']['face'], PLUS_FG,
                '2.4 <b>是我挑的数，你没给过</b>；第二屏那枚照旧 %s。' % GLYPH_W)
    + plus_tile('乙：两枚一起粗（第二屏这枚 %d，压在井上）' % TH_PLUS, 'gp-thick', TH_PLUS, SUB['A1']['well'], THPLUS_FG,
                '好处是两枚一致；代价是你指的是"圆内那枚"，我把没点的那枚也改了。'),
    '<b>甲（建议）</b>：只加粗首屏圆内那枚（%s→2.4）。代价：同一支加号在两处粗细不齐。<br>'
    '<b>乙</b>：两枚一起粗。代价：超出你那一句的指代范围。<br>'
    '<b>这两笔（➕ 加粗、白框下移让头部一半在框外）都还没落码</b>——先看图上数，你答了我再动码。' % GLYPH_W,
    '甲', 'D19 甲'))

HEAD = """<!doctype html><html><head><meta charset="utf-8"><title>2.2 第二屏 · 完整方案</title>
<style>%(CSS)s
body{background:#EDEBE6;color:#14161A;font:14px/1.75 -apple-system,"PingFang SC",sans-serif}
.wrap{max-width:1560px;margin:0 auto;padding:34px 26px 90px}
h1{font-size:27px;margin:0 0 8px}
h2{font-size:20px;margin:40px 0 8px;padding-left:12px;border-left:5px solid #D2683F}
.src{font-size:13.5px;color:#5A5A5E;line-height:1.9;margin-bottom:10px}
.src b{color:#D2683F}
code{background:#F2EFE9;padding:1px 6px;border-radius:5px;font-size:12.5px;color:#3A3A3C}
.row{background:#fff;border-radius:18px;padding:20px 22px 22px;margin:18px 0;box-shadow:0 8px 26px rgba(20,22,26,.07)}
.ttl{font-size:17px;font-weight:700;margin:0 0 3px}
.ttl code{font-size:13px;color:#D2683F}
.sub{font-size:13px;color:#5A5A5E;margin:0 0 14px;line-height:1.8}
.shots{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.shot{border:1px solid #DDD8CE;border-radius:14px;overflow:hidden;background:#fff;flex:none;width:450px}
.cap{font-size:13px;font-weight:700;padding:8px 12px;background:#14161A;color:#F2EFE9;line-height:1.55}
.cap code{background:none;color:#A7ABB2;padding:0}
.cost{margin-top:12px;line-height:1.9;font-size:14px}
.ans{margin-top:8px;font-size:16px;font-weight:700;color:#D2683F}
.clip{position:relative;overflow:hidden;background:#0E0D0B}
.tile{width:250px;border:1px solid #E4E0D8;border-radius:12px;padding:12px 14px;box-sizing:border-box;background:#fff}
.tile .h{font-size:14px;font-weight:700;margin-bottom:3px}
.tile .b{font-size:12.5px;color:#5A5A5E;line-height:1.7}
.grid{display:flex;gap:14px 26px;flex-wrap:wrap}
.kv{font-size:13.5px;line-height:1.9;color:#3A3A3C}
.kv b{color:#D2683F}
</style></head><body><div class="wrap">
<h1>2.2 第二屏（点圆 ➕ 之后那一屏）· 完整方案</h1>
<div class="src"><b>先说当前真机跑哪版</b>：你手机上是线上 <b>2.1.9</b>（审核中 2.1.10）那一版——
第二屏那里<b>没有</b>这一层深色墨；录入面板是白玻璃 <code>%(PLATE)s</code> 直接糊在你的形象图上。
这一页画的是 <b>2.2 隔离工作树</b>（<code>/Users/zlfmac/Documents/TuMaiBiJi-2.2</code>，分支 <code>release/2.2</code>，
提交 <code>da43c75</code>）里的代码；现网一行没动、没提审、没出包。<br>
<b>相对现网那条线（<code>release/2.0</code>），第二屏那 52 条选择器里 50 条一个字没动</b>（这条是脚本把两个分支那批块逐条比出来的，不是我印象）；
动的只有两条：<code>.out</code>（框外那一行：定高 %(OUT_H).0f、上下居中、字色写死纸白 <code>%(OUT_C)s</code>）与 <code>.out-dot</code>
（撤掉点自己那两行自定对齐）。这一屏肚子里那些（<code>.panel</code>／<code>.modes</code>／<code>.card</code>／三枚圈／输入格／小图排／右滑条／翻译开关）
是 10-08～10-11 你逐条拍过的那一套，本轮没碰。<br>
<b>口径</b>：屏上每句中文从 <code>utils/i18n.js</code> 现读；每一段尺寸与皮＝<b>整条声明从 <code>create.wxss</code> 原样搬</b>，
只做 rpx→px 与 <code>var(--x)</code> 取值；图形吃落码那批 <code>mask-image</code> data-URI（连描边 <b>%(GW)s</b> 一起）；
底是站长你给的真人照（<code>%(WALLP)s</code>，<b>只进这张试验图，不进包</b>），亮度档默认那一档「%(DIMNAME)s」。
图上 1px＝1rpx，屏是 <b>CSS 画的示意、不是截图</b>——2.2 这套到现在<b>一次都没在屏幕上出现过</b>。<br>
<b>两条与方案无关但你该知道</b>：① 这一页每一屏都画在「压暗罩＋纸白字」那一态（背景判成深）；你手机默认那张形象图判成<b>浅</b>，
现网那一态会翻成提亮罩、三级字翻回墨色——深浅翻色是 10-12 已落码的东西，甲乙两组屏在这上面一样，不在这里挑。
② <code>release/2.2</code> 落后现网分支 <b>11 条</b>提交（私密读旁路、.env 那三行、后台资产管理那些），出包前要先并一次；
这 11 条不动这一屏的皮（上面那条 50／52 就是对着 <code>release/2.0</code> 核的）。</div>

<h2>一、这一屏由哪几段构成（数全从落码现读）</h2>
<div class="row"><div class="grid kv">%(GEOM)s</div></div>

<h2>二、八个状态全画（照现在落码会渲出来的样子；红框与紫线就是第三节那一处，先看着别急着判）</h2>
<div class="row"><div class="sub">每张标题里写了它进门的那句 <code>wx:if</code>／<code>panelOpen</code> 条件，条件与 <code>ROW_CELLS</code> 都是从 <code>create.js</code> 现读的。
"没选中的那两枚标签"这一档字（<code>--cp-ink-50</code>）在 D17 那三屏上的对比数一并量了。</div>
<div class="shots">%(SEC2)s</div></div>

<h2>三、顶那一刀（D16）：框外那一行有 %(S410).0f／%(S490).0f rpx 悬在墨层之外</h2>
<div class="row"><div class="sub">墨层那一顶的闸现在挂在 <code>panelOpen</code> 上，而 <code>panelOpen</code> 不是"第二屏"——它是
<code>active==='write' &amp;&amp; bodyFocus</code> 或"照片已选到第 %(ROW_NEXT)d 张"。第二屏绝大多数时候它是 <b>false</b>，
于是那一层墨停在 %(INK_SHUT).0f，而那一行的顶在 %(ET410).0f（面板 %(PL_H).0f）／%(ET490).0f（面板 %(PL_H_OPEN).0f）。三张裁的是同一态，差别只在墨层那一条顶线。</div>
<div class="shots">%(SEC3)s</div></div>

<h2>四、面那一档（D17）：白玻璃压在恒深的墨上，糊不出东西</h2>
<div class="row"><div class="sub">三屏是<b>同一态</b>（照片档·还没选图），只差垫不垫那层墨、和那档白多少。数在 D17 那一条里，是从像素里读的。</div>
<div class="shots">%(SEC4)s</div></div>

<h2>五、要你拍的四条</h2>
%(ROWS)s
<h2>六、负面清单（这几件我不做，理由写在旁边）</h2>
<div class="row"><div class="cost">%(NEG)s</div></div>
<div class="src" style="margin-top:26px"><b>出处</b>：<code>docs/方案-2.2大版本.md §9</code>；
生成器 <code>docs/design/10-12-2.2全量效果图/出-第二屏方案.py</code>——落码里任何一条数改了，重跑这一条命令就重出这一页；
读不到的一律当场报错退出，不画凭印象的屏。</div>
</div></body></html>"""

HTML = HEAD % dict(CSS=build_css(''.join(VARS) + PLUS_CSS), GEOM=GEOM_H, SEC2=''.join(sec2), SEC3=''.join(sec3),
                   SEC4=''.join(sec4), ROWS=''.join(rows), NEG=NEG, PLATE=PLATE, OUT_C=OUT_C,
                   GW=GLYPH_W, WALLP=WALLP, DIMNAME=DIM['name'], OUT_H=OUT_H,
                   S410=S410, S490=S490, ROW_NEXT=ROW_CELLS + 1, INK_SHUT=INK_SHUT,
                   ET410=entry_top(PL_H), ET490=entry_top(PL_H_OPEN), PL_H=PL_H, PL_H_OPEN=PL_H_OPEN)

OUT_HTML = os.path.join(HERE, '第二屏完整方案.html')
OUT_PNG = os.path.join(HERE, '第二屏完整方案.png')

# 自证闸零：div 必须配平。少关一个 </div> 不报错，只会让后面每一屏逃出 .shots 容器
# （10-13 第一版就是这么把八屏排成一竖条的，缩略图上看只是"屏怎么这么长"）。
for nm, frag in [(k, screen(k)) for k in ORDER] + [('整页', HTML)]:
    if frag.count('<div') != frag.count('</div>'):
        sys.exit('%s 的 <div> 与 </div> 不配平（%d vs %d）⇒ 有一层没关，后面的内容会整排逃出容器'
                 % (nm, frag.count('<div'), frag.count('</div>')))
# 自证闸：少发一层内容，浏览器里看不出来（面板会黑一块、卡里会空一格），所以在这儿钉。
for must in [ZH['modePhoto'], ZH['modeUrl'], ZH['modeWrite'], ZH['fromAlbum'], ZH['takePhoto'],
             ZH['slideExtract'], ZH['busyExtract'], ZH['linkDesc'], ZH['manualDesc'],
             ZH['origTranslate'], ZH['origTranslateHint'], ZH['back'], ZH['linkRule'],
             ZH['createHeading'], ZH['appName'], ZH['bgDimLabel'], ZH['homeBgSwap'], ZH['tipsPrefix'],
             'class="sld-knob"', 'class="shut-core"', 'class="th th-add"', 'class="wr-sw-track"',
             'class="hint-bubble"', 'class="mini-c"', 'class="md on"', 'gmask g-camera', 'gmask g-clipboard']:
    if must not in HTML:
        sys.exit('HTML 里没有「%s」⇒ 有一层内容没发出去，别去猜图，先看这里' % must)
open(OUT_HTML, 'w', encoding='utf-8').write(HTML)

subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                '--force-device-scale-factor=1', '--window-size=1620,20000',
                '--screenshot=' + OUT_PNG, 'file://' + OUT_HTML], capture_output=True, check=True)
from PIL import Image
im = Image.open(OUT_PNG).convert('RGB')
W, H = im.size
BG = (0xED, 0xEB, 0xE6)
px = im.load()
last = 0
for y in range(H - 1, -1, -1):
    if any(sum(abs(px[x, y][i] - BG[i]) for i in range(3)) > 12 for x in range(0, W, 7)):
        last = y
        break
if not last:
    sys.exit('没扫到内容底边 ⇒ 这一页排到窗口外面去了（高 %d），别当成品交' % H)
im.crop((0, 0, W, min(H, last + 40))).save(OUT_PNG)

print('HTML ' + OUT_HTML)
print('PNG  %s　（%d×%d，内容到底 %d）' % (OUT_PNG, W, min(H, last + 40), last))
print('落码现读：面板 %.0f／%.0f｜那一行 %.0f｜bottom %.0f｜墨顶 %.0f／%.0f ⇒ 悬空 %.0f／%.0f'
      % (PL_H, PL_H_OPEN, OUT_H, ENTRY_B, INK_SHUT, INK_OPEN, S410, S490))
for r in PR:
    print('　%s 面 %s（σ %.1f）｜背后 %s（σ %.1f）｜墨字 %.2f:1｜淡标签 %.2f:1｜井 %s 差 %.0f 级'
          % (r['tag'], r['face'], r['std'], r['back'], r['back_std'], r['cr_main'], r['cr_dim'], r['well'], r['well_lv']))
print('　现网那块面（从你真机截图上采）%s' % (LIVE_FACE or '（缺图）'))
