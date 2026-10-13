#!/usr/bin/env python3
# 2.2 首屏待拍的七条（D9–D15）画成一页能看的图。
# 站长 10-13 原话：「你做成 html 给我决策，我看文字没办法理解」⇒ 每条**把甲和乙真的画成两屏**，
# 代价写在旁边，答案他回一行一条（"D9 甲"）。
# 口径（一条都不许凭印象）：
#   · 屏上每句中文从 `utils/i18n.js` 现读（缺键直接 KeyError，不自己编叫法）
#   · 快门橙／底栏色／皮肤那套变量从 `utils/palette.js` 现读
#   · 几何从落码现读（`create.wxss`／`app.wxss`／`custom-tab-bar/index.wxss`），换算只有一条：图上 1px＝1rpx
#   · D12 那几个合成色与对比度是**脚本现算**（mix over 面板 ＋ WCAG），不是抄 §9.8 的结论
# 跑法：python3 docs/design/10-12-2.2全量效果图/出-待拍决策页.py
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
MP = os.path.join(ROOT, 'miniprogram')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

NODE = (
    'const m=require("%s/utils/i18n.js");const p=require("%s/utils/palette.js");'
    'const ps=s=>Object.fromEntries(s.split(";").map(v=>{const i=v.indexOf(":");return[v.slice(0,i),v.slice(i+1)]}));'
    'console.log(JSON.stringify({zh:m.texts("zh"),ch:p.chromeOf("tint-paper"),'
    'cp:ps(p.createSkin("tint-paper")),tipDot:p.TIP_DOT,dim:p.BG_DIMS,uncat:p.UNCATEGORIZED}));' % (MP, MP)
)
_r = subprocess.run(['node', '-e', NODE], cwd=ROOT, capture_output=True, text=True)
if _r.returncode != 0:
    sys.exit('node 取字典/色板失败：' + _r.stderr[:400])
import json
D = json.loads(_r.stdout)
ZH, CH, CP = D['zh'], D['ch'], D['cp']
TIP_DOT, DIMS, INK = D['tipDot'], D['dim'], D['uncat']['bg']      # INK ＝ #23252C，现网那支墨黑
CAM, CAM_INK = CP['--cp-cam'], CP['--cp-cam-ink']

strip = lambda s: re.sub(r'/\*[\s\S]*?\*/', '', s)
CRE = strip(open(os.path.join(MP, 'pages/create/create.wxss'), encoding='utf-8').read())
APP = strip(open(os.path.join(MP, 'app.wxss'), encoding='utf-8').read())
TAB = strip(open(os.path.join(MP, 'custom-tab-bar/index.wxss'), encoding='utf-8').read())


def seg(src, sel):
    m = re.search(r'(?:^|\n)' + re.escape(sel) + r'\s*\{([^}]*)\}', src)
    if not m:
        sys.exit('落码里读不到 %s ＝这一页画不成（那条选择器改名了？先改这里再重跑，别画凭印象的屏）' % sel)
    return m.group(1)


def num(src, sel, prop, unit='rpx'):
    m = re.search(prop + r':\s*(-?[\d.]+)' + unit, seg(src, sel))
    if not m:
        sys.exit('落码里读不到 %s 的 %s' % (sel, prop))
    return float(m.group(1))


def grad(src, sel):
    """整条 linear-gradient 原样取出来用（停点写在哪儿都不管）。"""
    m = re.search(r'background:\s*(linear-gradient\([^;]*\))', seg(src, sel))
    if not m:
        sys.exit('落码里读不到 %s 的渐变' % sel)
    return m.group(1)


# ---- 落码现读的那一组数（1rpx ＝ 图上 1px） ----
PERSON_W = num(CRE, '.blk-person', 'width')
PERSON_H = num(CRE, '.blk-person', 'height')
FACE_H = num(CRE, '.blk-face', 'height')
BAND_H = num(CRE, '.blk-count', 'height')
# `padding: 0 22rpx` 是简写（竖 0 横 22），通用那条 num() 只认"数字紧跟 rpx"，这里单独取横那一档。
BAND_PAD = float(re.search(r'padding:\s*[\d.]+\s+([\d.]+)rpx', seg(CRE, '.blk-count')).group(1))
BAND_GAP = num(CRE, '.blk-count', 'gap')
NUM_FS = num(CRE, '.blk-num', 'font-size')
RULE_W = num(CRE, '.blk-rule', 'width')
PLUS = num(CRE, '.blk-plus', 'width')
PLUS_GAP = num(CRE, '.blk-plus', 'margin-top')
LIFT = num(CRE, '.out', 'height')                 # 面板顶比组顶高出去那一段＝107
PANEL_R = num(CRE, '.stage-panel', 'border-radius')
# 10-13 那一刀之后，实心那档不住在本体上了（本体透明，实心归 `::after`、band 归 `::before`）
PANEL_BG = re.search(r'background:\s*(rgba\([^)]*\))', seg(CRE, '.stage-panel::after')).group(1)
PANEL_GRAD = grad(CRE, '.stage-panel::before')
FACE_GRAD = grad(CRE, '.blk-face')
BAND_GRAD = grad(CRE, '.blk-count')
# 两档糊也现读（站长 10-13「毛玻璃呢」——这一份前两版一层糊都没画，面板还把实心与渐变两乘叠在一起，
# 于是"上部渐变半透明毛玻璃"在这张图上等于没画；正本 `出-B方案深色面板.py` 一直是画了糊的）。
GLASS_BF = re.search(r'--glass-bf:\s*([^;]+)', APP).group(1).strip()
PANEL_BF = re.search(r'backdrop-filter:\s*([^;]+)', seg(CRE, '.stage-panel')).group(1).strip()
BF = lambda v: 'backdrop-filter:%s;-webkit-backdrop-filter:%s;' % (v, v)


def var_of(v):
    """`var(--x)` 换成 app.wxss 里那一位的实际值——效果图上不许自己认一档。"""
    m = re.match(r'\s*var\((--[a-z0-9-]+)\)\s*$', v or '')
    if not m:
        return (v or '').strip()
    k = re.search(re.escape(m.group(1)) + r':\s*([^;]+)', APP)
    if not k:
        sys.exit('app.wxss 里读不到 %s ⇒ 这一层皮画不成，先来这里对上' % m.group(1))
    return k.group(1).strip()


def decl(src, sel, prop):
    m = re.search(prop + r':\s*([^;]+)', seg(src, sel))
    return m.group(1).strip() if m else ''


# 10-13「按钮变成白色风格。类似第二屏毛玻璃」⇒ 那枚 ➕ 的三样全从 `.blk-plus` 现读，不再吃 palette 那支橙
PLUS_BG = var_of(decl(CRE, '.blk-plus', 'background')).replace('rpx', 'px')
PLUS_BF = var_of(decl(CRE, '.blk-plus', 'backdrop-filter')).replace('rpx', 'px')
_rm = re.search(r'inset[^,]*var\(--glass-hair\)', decl(CRE, '.blk-plus', 'box-shadow'))
PLUS_RING = (_rm.group(0).replace('rpx', 'px').replace('var(--glass-hair)', var_of('var(--glass-hair)'))
             if _rm else sys.exit('`.blk-plus` 的 box-shadow 里读不到那圈 --glass-hair 细边'))
TIPS_FS = float(re.sub(r'[^0-9.]', '', var_of(decl(CRE, '.blk-tips-in', 'font-size'))))
TIPS_LH = float(re.search(r'[\d.]+', decl(CRE, '.blk-tips-in', 'line-height')).group(0))
TIPS_LS = var_of(decl(CRE, '.blk-tips-in', 'letter-spacing')).replace('rpx', 'px')
DOT_MT = num(CRE, '.tips-dot', 'margin-top')
# 行宽上限（10-13「Tips 要紧凑一点，现在有点宽」）：落码写的是 9em，这里原样搬，不换成算出来的 rpx
TIPS_MAXW = decl(CRE, '.blk-tips-line', 'max-width') or sys.exit('`.blk-tips-line` 读不到 max-width ⇒ 图上又会画成满宽')


def panel_layer(ptop, band_h=240, bg=None, grad=None):
    """面板那一层，按落码 10-13 那一刀之后的分工画：本体透明＋糊、band 归一层、实心归一层。
    两乘（实心写在带糊的那层上、渐变再压上去）会把 band 顶压到只透出 5%，那正是要避开的画法。"""
    return ('<div class="f" style="left:0;right:0;top:%dpx;bottom:0;border-radius:%dpx %dpx 0 0;'
            'overflow:hidden;background:transparent;%s">'
            '<div class="f" style="left:0;right:0;top:0;height:%dpx;background:%s"></div>'
            '<div class="f" style="left:0;right:0;top:%dpx;bottom:0;background:%s"></div></div>'
            % (ptop, PANEL_R, PANEL_R, BF(PANEL_BF), band_h, grad or PANEL_GRAD,
               band_h, bg or PANEL_BG))

PANEL_Z = num(CRE, '.stage-panel', 'z-index', '')
TAB_Z = num(TAB, '.tab-bar', 'z-index', '')
TAB_H = num(TAB, '.tab-bar', 'height')
TAB_B = num(TAB, '.tab-bar', 'bottom')
OPEN_H = num(CRE, '.panel-open', 'height')
BLK_L = num(CRE, '.home-blk', 'left')
GAP_ROW = num(CRE, '.blk-row', 'gap')
CELL_W = (PERSON_W - 2 * BAND_PAD - BAND_GAP) / 2
COL_W = 750 - 2 * BLK_L - PERSON_W - GAP_ROW
VIEW_H = 1669
GROUP_TOP = 1107
PANEL_TOP = GROUP_TOP - LIFT

PLATE_CODE = re.search(r'--glass-plate:\s*rgba\(255, 255, 255,\s*([\d.]+)\)', APP).group(1)
FILL_CODE = re.search(r'--glass-fill:\s*rgba\(255, 255, 255,\s*([\d.]+)\)', APP).group(1)
PLATE_MOCK, FILL_MOCK = '0.72', '0.42'            # 效果图按这两档画的（§9.8 结论 1、2）
PAPER = '#' + re.search(r'--btn-ink:\s*#([\dA-Fa-f]{6})', APP).group(1)


# ---- 现算：合成色与 WCAG 对比（D12 那几个数从这里出） ----
def _rgb(tok):
    m = re.match(r'rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)', tok.strip())
    if m:
        return [float(m.group(i)) for i in range(1, 4)], (1.0 if m.group(4) is None else float(m.group(4)))
    h = tok.strip('#')
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)], 1.0


def mix(tok, bg):
    (r, g, b), a = _rgb(tok)
    B, _ = _rgb(bg)
    return [r * a + B[0] * (1 - a), g * a + B[1] * (1 - a), b * a + B[2] * (1 - a)]


def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _lum(t):
    return .2126 * _lin(t[0]) + .7152 * _lin(t[1]) + .0722 * _lin(t[2])


def ratio(a, b):
    x, y = sorted([_lum(a), _lum(b)], reverse=True)
    return (x + .05) / (y + .05)


def levels(a, b):
    """两档面之间的"级差"＝亮度差 ×100。那口井不是文字也不是必须辨读的图形，
    对它用 WCAG 3.0 那条线是拿错尺子（3.0 管的是"看得出一个控件在哪"）；
    §9.8 量的那道"分界"本来就是级差，这里沿用同一个量法。"""
    return abs(_lum(b) - _lum(a)) * 100


def hx(t):
    return '#%02X%02X%02X' % tuple(round(v) for v in t)


def white(a):
    return 'rgba(255,255,255,%s)' % a


INK_TEXT = (0x3A, 0x3A, 0x3C)                     # 面板上那几行字的现网墨（效果图也用它）
CASES = []
for tag, plate, fill in (('码里（.50 ＋ .20）', PLATE_CODE, FILL_CODE), ('图上（.72 ＋ .42）', PLATE_MOCK, FILL_MOCK)):
    f = mix(white(plate), INK)                     # 那块面＝白 α ＋ 糊，压在面板的墨上
    w = mix(white(fill), hx(f))                    # 那口井是**压在那块面上**的，不能再压回墨底（第一版这里算错了一层）
    CASES.append({'tag': tag, 'face': hx(f), 'fill': hx(w),
                  'crLabel': ratio(INK_TEXT, f),         # 计数那行墨字 vs 那块面（正文门槛 4.5）
                  'wellLv': round(((_lum(w) - _lum(f)) * 100), 0),   # 井与那块面的级差（分界，不是文字）
                  'plate': plate, 'fillA': fill})

CSS = """
body{margin:0;background:#EDEBE6;color:#14161A;font:14px/1.6 -apple-system,"PingFang SC",sans-serif}
.wrap{max-width:1240px;margin:0 auto;padding:34px 24px 90px}
h1{font-size:27px;margin:0 0 8px}
.src{font-size:13px;color:#6E6E73;line-height:1.75;margin-bottom:24px}
.src b{color:#D2683F}
.row{background:#fff;border-radius:18px;padding:22px 24px 24px;margin-bottom:24px;box-shadow:0 8px 26px rgba(20,22,26,.07)}
.ttl{font-size:21px;font-weight:700;margin:0 0 4px}
.ttl code{font-size:14px;background:#F2EFE9;padding:2px 9px;border-radius:6px;color:#D2683F;margin-right:8px}
.sub{font-size:13px;color:#6E6E73;margin:0 0 14px}
.shots{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
.shot{border:1px solid #DDD8CE;border-radius:14px;overflow:hidden;background:#fff}
.cap{font-size:14px;font-weight:700;padding:8px 12px;background:#14161A;color:#F2EFE9}
.cap small{font-weight:400;color:#A7ABB2;margin-left:8px}
.stage{position:relative;overflow:hidden;background:#fff}
.scale{position:absolute;top:0;left:0;width:750px;height:1669px;transform-origin:top left}
.cost{margin-top:14px;line-height:1.8;font-size:14px}
.ans{margin-top:8px;font-size:16px;font-weight:700;color:#D2683F}
.f{position:absolute}.r2{border-radius:50%}
.n{font-family:Poppins,sans-serif;font-weight:200;line-height:.84;letter-spacing:-2px}
.fig{position:absolute;color:#D2683F;font-weight:700;font-size:20px;line-height:1.3}
.fig i{font-style:normal;color:#8A8F98;font-weight:400}
""".strip()

SC = 0.32          # 一屏 750×1669 折到这个比例摆进页面


def scale(inner, h=VIEW_H):
    return ('<div class="stage" style="width:%dpx;height:%dpx">'
            '<div class="scale" style="transform:scale(%s)">%s</div></div>'
            % (int(750 * SC), int(h * SC), SC, inner))


def home(panel=True, bar=3, plus=True, dim=1):
    """首屏那一屏。panel／bar／plus／dim 这四把开关就是 D9–D11 的差别本身。"""
    s = ['<div class="f" style="inset:0;background:url(home-bg-portrait.jpg) center top/cover"></div>',
         '<div class="f" style="inset:0;background:rgba(20,22,26,.58);opacity:%s"></div>' % DIMS[dim]['veil']]
    if panel:
        s.append(panel_layer(PANEL_TOP))
    s.append('<div class="f" style="left:0;right:0;top:0;height:184px;'
             'background:linear-gradient(180deg,rgba(8,10,14,.55),rgba(8,10,14,0))"></div>')
    s.append('<div class="f" style="left:30px;top:112px;font-size:34px;font-weight:600;color:%s">%s</div>'
             % (PAPER if panel else CH['ink'], ZH['createHeading']))
    # 那一组：左块（白面＋墨面）＋ 右列（Tips ＋ 圆 ➕）
    s.append('<div class="f" style="left:%dpx;top:%dpx;width:%dpx;display:flex;gap:%dpx">'
             % (BLK_L, GROUP_TOP, 750 - 2 * BLK_L, GAP_ROW))
    s.append('<div class="f" style="position:relative;width:%dpx;height:%dpx;border-radius:34px;'
             'box-shadow:inset 0 0 0 2px rgba(255,255,255,.55)">' % (PERSON_W, PERSON_H))
    s.append('<div class="f" style="left:0;right:0;top:0;height:%dpx;border-radius:34px 34px 0 0;'
             'overflow:hidden;background:%s;%s"><img src="ic-person.png" style="position:absolute;left:0;'
             'top:-52px;width:220px"></div>' % (FACE_H, FACE_GRAD, BF(GLASS_BF)))
    s.append('<div class="f" style="left:0;right:0;bottom:0;height:%dpx;border-radius:0 0 34px 34px;'
             'overflow:hidden;background:%s;%s;display:flex;align-items:center;gap:%dpx;padding:0 %dpx;'
             'box-sizing:border-box">' % (BAND_H, BAND_GRAD, BF(GLASS_BF), BAND_GAP, BAND_PAD))
    for k, v in ((ZH['statNotes'], '16'), (ZH['statCards'], '13')):
        s.append('<div class="f" style="position:static;width:%dpx;display:flex;flex-direction:column;'
                 'align-items:center"><div class="n" style="font-size:%dpx;color:%s">%s</div>'
                 '<div class="f" style="position:static;height:2px;width:%dpx;margin:12px 0 8px;'
                 'background:rgba(242,239,233,.85)"></div>'
                 '<div style="font-size:18px;letter-spacing:1px;color:rgba(242,239,233,.72)">%s</div></div>'
                 % (CELL_W, NUM_FS, PAPER, v, RULE_W, k))
    s.append('</div></div>')                        # /band /card
    s.append('<div class="f" style="position:static;flex:1;display:flex;flex-direction:column;min-width:0">')
    s.append('<div class="f" style="position:static;flex:1;display:flex;align-items:center;font-size:%gpx;'
             'line-height:%g;letter-spacing:%s;color:%s"><div class="r2" style="flex:none;width:14px;'
             'height:14px;margin:%gpx 12px 0 0;background:%s"></div><div style="flex:1;max-width:%s">%s</div></div>'
             % (TIPS_FS, TIPS_LH, TIPS_LS,
                'rgba(242,239,233,.96)' if panel else CH['ink'], DOT_MT, TIP_DOT, TIPS_MAXW, ZH['tips'][0]))
    if plus:
        s.append('<div class="r2" style="flex:none;width:%dpx;height:%dpx;margin-top:%dpx;align-self:center;'
                 'background:%s;%sbox-shadow:%s;color:%s;display:flex;align-items:center;'
                 'justify-content:center;font-size:64px;font-weight:300">+</div>'
                 % (PLUS, PLUS, PLUS_GAP, PLUS_BG, BF(PLUS_BF), PLUS_RING, CAM_INK))
    s.append('</div></div>')                        # /col /grp
    # 底栏（D9 砍的就是这一枚）
    items = ['+', '≡', '◇'] if bar == 3 else ['≡', '◇']
    s.append('<div class="f" style="left:%dpx;right:%dpx;bottom:%dpx;height:%dpx;border-radius:44px;'
             'display:flex;align-items:center;justify-content:space-around;box-sizing:border-box;'
             'background:%s;border:3px solid rgba(255,255,255,.22)">'
             % (BLK_L, BLK_L, TAB_B, TAB_H, CH['bg']))
    for i, c in enumerate(items):
        s.append('<div class="r2" style="width:76px;height:76px;display:flex;align-items:center;'
                 'justify-content:center;font-size:36px;color:%s%s">%s</div>'
                 % (CH['ink'] if i == 0 and bar == 3 else 'rgba(255,255,255,.62)',
                    ';background:' + CH['sel'] if i == 0 and bar == 3 else '', c))
    s.append('</div>')
    return ''.join(s)


def expanded(grow='up', panel=True):
    """整屏画展开态那一屏（D13 的三块）。grow＝面板那张往哪长。"""
    s = ['<div class="f" style="inset:0;background:url(home-bg-portrait.jpg) center top/cover"></div>',
         '<div class="f" style="inset:0;background:rgba(20,22,26,.58);opacity:%s"></div>' % DIMS[1]['veil'],
         '<div class="f" style="left:0;right:0;top:0;height:184px;'
         'background:linear-gradient(180deg,rgba(8,10,14,.55),rgba(8,10,14,0))"></div>']
    h = OPEN_H if grow == 'down' else PERSON_H
    top = (PANEL_TOP + LIFT) if panel else GROUP_TOP
    over = top + h - (VIEW_H - TAB_B - TAB_H)
    if panel:
        ptop = PANEL_TOP if grow == 'down' else top - LIFT
        s.append(panel_layer(ptop))
    ink = 'rgba(242,239,233,.9)'
    s.append('<div class="f" style="left:0;right:0;top:%dpx;height:%dpx;color:%s;font-size:24px;'
             'display:flex;align-items:center;justify-content:space-between;padding:0 20px;box-sizing:border-box">'
             '<div><span style="color:%s">•</span> %s</div><div>%s</div></div>'
             % (top - LIFT, LIFT, ink if panel else CH['ink'], TIP_DOT, ZH['tips'][1], ZH['back']))
    s.append('<div class="f" style="left:0;right:0;top:%dpx;height:%dpx;padding:26px 30px;box-sizing:border-box;'
             'border-radius:0 0 40px 40px;background:rgba(255,255,255,%s)">' % (top, h, PLATE_CODE))
    s.append('<div style="display:flex;gap:26px;font-size:24px;color:rgba(35,37,44,.78);justify-content:center">%s</div>'
             % ''.join('<div style="border-bottom:3px solid %s;padding-bottom:6px">%s</div>'
                       % (CAM if i == 0 else 'transparent', ZH[k])
                       for i, k in enumerate(('modePhoto', 'modeUrl', 'modeWrite'))))
    s.append('<div style="margin-top:26px;height:96px;border-radius:20px;background:rgba(255,255,255,%s);'
             'display:flex;align-items:center;padding:0 22px;box-sizing:border-box;font-size:26px;'
             'color:rgba(35,37,44,.55)">%s</div>' % (FILL_CODE, ZH['importUrl']))
    s.append('<div style="margin-top:26px;height:150px;border-radius:40px;background:%s;color:%s;'
             'display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:600">%s</div>'
             % (CAM, CAM_INK, ZH['slideExtract']))
    s.append('</div>')
    s.append('<div class="f" style="left:%dpx;right:%dpx;bottom:%dpx;height:%dpx;border-radius:44px;'
             'display:flex;align-items:center;justify-content:space-around;box-sizing:border-box;background:%s;'
             'border:3px solid rgba(255,255,255,.22)">%s</div>'
             % (BLK_L, BLK_L, TAB_B, TAB_H, CH['bg'],
                ''.join('<div class="r2" style="width:76px;height:76px;background:%s;display:flex;'
                        'align-items:center;justify-content:center;font-size:36px;color:%s">%s</div>'
                        % (CH['sel'] if i == 0 else 'transparent', CH['ink'] if i == 0 else 'rgba(255,255,255,.62)', c)
                        for i, c in enumerate(['+', '≡', '◇']))))
    if over > 0:
        # 只在屏上把"被压住那一条"染出来；字太小看不清（缩到 32%% 之后不到 8px），
        # 所以数写在屏上方那条标题里，不写在这块色带里。
        s.append('<div class="f" style="left:0;right:0;bottom:%dpx;height:%dpx;'
                 'background:rgba(210,104,63,.28);border-top:3px solid %s"></div>'
                 % (TAB_B + TAB_H - int(over), int(over), CAM))
    return ''.join(s)


def swatch(c):
    """D12：同一块面画两遍，只换那一枚白的浓度——字直接排上去，读不读得清一眼看得见。"""
    return ('<div class="shot"><div class="cap">%s<small>那块面合成 %s｜计数 %.2f:1（正文门槛 4.5）</small></div>'
            '<div style="width:340px;background:%s;padding:18px 20px;box-sizing:border-box">'
            '<div style="font-size:22px;color:rgb(%s)">%s</div>'
            '<div style="margin-top:12px;height:64px;border-radius:16px;background:%s;'
            'display:flex;align-items:center;padding:0 16px;box-sizing:border-box;font-size:22px;'
            'color:rgb(%s)">%s</div>'
            '<div style="margin-top:8px;font-size:18px;color:#6E6E73">那口井合成 %s／与这块面差 %.0f 级</div>'
            '<div style="margin-top:6px;font-size:18px;color:#6E6E73">白 .%s ＋ 糊　→　这块面</div>'
            '</div></div>'
            % (c['tag'], c['face'], c['crLabel'], c['face'], '58,58,60', ZH['slideExtract'],
               white(c['fillA']), '58,58,60', ZH['importUrl'], c['fill'], c['wellLv'], c['plate']))


def annotated():
    """D14：六个小图，一个数一张。
    原来这里画的是一整屏＋红线标注，结果六条注在 32% 缩放后全挤成一团糊字（自证截图看见了）
    ⇒ 改成"一个数一格"，每格只画那一处几何，数写在格下。
    这一格全是内联样式（没有 CSS 花括号），所以整段用 f-string 拼——上一版用 % 占位，
    六个占位对五个参数直接 TypeError，那种错在浏览器里是看不见的（脚本当场就退了）。"""
    def tile(标题, 数, 来历, drawing, w=236, 深=False):
        return (f'<div style="width:{w}px;border:1px solid #E4E0D8;border-radius:12px;padding:12px 14px;'
                f'box-sizing:border-box"><div style="height:118px;position:relative;overflow:hidden;'
                f'background:{INK if 深 else "#F6F4F0"};border-radius:8px">{drawing}</div>'
                f'<div style="margin-top:10px;font-size:15px;font-weight:700">{数}　{标题}</div>'
                f'<div style="font-size:13px;color:#6E6E73;line-height:1.55">{来历}</div></div>')
    out = []
    out.append(tile('面板顶比那一组高出去的那一段', f'{PANEL_TOP:.0f} ＝ {GROUP_TOP} − {LIFT:.0f}',
        f'那 {LIFT:.0f} 就是第二屏框外那一行（.out）占的高度；两态同一条线，收起↔展开这一层不动',
        f'<div style="position:absolute;left:10px;right:10px;top:38px;border-top:2px solid {CAM}"></div>'
        f'<div style="position:absolute;left:12px;top:14px;font-size:12px;color:#8A8F98">面板顶 {PANEL_TOP:.0f}</div>'
        f'<div style="position:absolute;left:10px;right:10px;top:84px;border-top:2px solid #B9B4AA"></div>'
        f'<div style="position:absolute;left:12px;top:90px;font-size:12px;color:#8A8F98">那一组的顶 {GROUP_TOP}</div>'
        f'<div style="position:absolute;left:150px;top:52px;font-size:12px;color:{CAM}">差 {LIFT:.0f}</div>'))
    out.append(tile('左块（＝第二屏那张面板的高）', f'{PERSON_W:.0f} × {PERSON_H:.0f}',
        f'宽 {PERSON_W:.0f} 是现网那一条没动；高 {PERSON_H:.0f} 出自你那句「左边内框要与第二个图高度对齐」',
        f'<div style="position:absolute;left:70px;top:8px;width:{PERSON_W / 3.4:.0f}px;'
        f'height:{PERSON_H / 3.4:.0f}px;border:2px solid {CAM};border-radius:6px"></div>'))
    out.append(tile('白面 / 墨面 各多高', f'{FACE_H:.0f} ＋ {BAND_H:.0f} ＝ {PERSON_H:.0f}',
        f'墨面那 {BAND_H:.0f} <b>不是我拍的</b>：女那张 360×433 在 220 宽下算 {220 * 433 / 360:.1f} 高，'
        f'脚底落在哪就切在哪',
        f'<div style="position:absolute;left:70px;top:8px;width:{PERSON_W / 3.4:.0f}px;'
        f'height:{FACE_H / 3.4:.0f}px;background:rgba(255,255,255,.95);border:2px solid {CAM};'
        f'border-bottom:none;border-radius:6px 6px 0 0"></div>'
        f'<div style="position:absolute;left:70px;top:{8 + FACE_H / 3.4:.0f}px;width:{PERSON_W / 3.4:.0f}px;'
        f'height:{BAND_H / 3.4:.0f}px;background:{INK};border:2px solid {CAM};border-top:none;'
        f'border-radius:0 0 6px 6px"></div>'))
    out.append(tile('数字 / 横线 / 名字', f'{NUM_FS:.0f} ＋ 横线 {RULE_W:.0f} ＋ 名 18',
        '名字那 18 走现成那档小字（--fs-micro），不为一枚分类名另起一架；横线就是"下划线可点击"那一条',
        f'<div style="position:absolute;left:0;right:0;top:10px;text-align:center;font-size:44px;'
        f'font-weight:200;color:{PAPER}">16</div>'
        f'<div style="position:absolute;left:{118 - RULE_W / 2:.0f}px;right:{118 - RULE_W / 2:.0f}px;'
        f'top:66px;height:2px;background:rgba(242,239,233,.85)"></div>'
        f'<div style="position:absolute;left:0;right:0;top:78px;text-align:center;font-size:13px;'
        f'letter-spacing:1px;color:rgba(242,239,233,.72)">{ZH["statNotes"]}</div>', 深=True))
    out.append(tile('圆 ➕ 多大、顶上留多少', f'{PLUS:.0f} 见方／顶上留 {PLUS_GAP:.0f}',
        '两个都是我定的，你没给过；它落在右列正中（你那句「要往中间靠，现在太边缘了」）',
        f'<div style="position:absolute;left:{118 - PLUS / 5:.0f}px;top:{8 + PLUS_GAP / 5:.0f}px;'
        f'width:{PLUS / 2.5:.0f}px;height:{PLUS / 2.5:.0f}px;border-radius:50%;background:{CAM}"></div>'
        f'<div style="position:absolute;left:{118 - PLUS / 5:.0f}px;top:4px;width:{PLUS / 2.5:.0f}px;'
        f'height:{PLUS_GAP / 5:.0f}px;border-top:2px solid {CAM};border-bottom:2px solid {CAM}"></div>'
        f'<div style="position:absolute;left:{118 + PLUS / 5 + 6:.0f}px;top:{4 + PLUS_GAP / 10:.0f}px;'
        f'font-size:12px;color:{CAM}">留 {PLUS_GAP:.0f}</div>'))
    out.append(tile('面板那两枚圆角', f'{PANEL_R:.0f}',
        '现网那三档是 块 34／面板 55／底栏 44，我在里面挑了最大那一档（这一层是通栏底板）',
        f'<div style="position:absolute;left:20px;right:20px;top:26px;height:80px;background:{INK};'
        f'border-radius:{PANEL_R / 2.2:.0f}px {PANEL_R / 2.2:.0f}px 0 0"></div>'
        f'<div style="position:absolute;left:26px;top:30px;font-size:12px;color:{PAPER}">圆角 {PANEL_R:.0f}</div>'))
    return f'<div style="display:flex;gap:14px;flex-wrap:wrap">{"".join(out)}</div>'


def over_of(grow, panel):
    """那一屏的录入面板底比底栏顶低多少（正数＝压住）。与 expanded() 里同一套式子，别写两份。"""
    h = OPEN_H if grow == 'down' else PERSON_H
    top = (PANEL_TOP + LIFT) if panel else GROUP_TOP
    return top + h - (VIEW_H - TAB_B - TAB_H)


def row(code, 标题, 出处, shots, 代价, 建议, 答案):
    return ('<div class="row"><div class="ttl"><code>%s</code>%s</div><div class="sub">%s</div>'
            '<div class="shots">%s</div><div class="cost">%s</div>'
            '<div class="ans">我的建议：%s　｜　你要回的就这几个字：%s</div></div>'
            % (code, 标题, 出处, shots, 代价, 建议, 答案))


rows = []
rows.append(row('D9', '首屏那枚圆 ➕ 和底栏第一枚 ➕ 是同一个动作的两个入口',
    '你自己定的规矩：一个功能只留一个入口。两块屏差的就是撤哪一枚。',
    '<div class="shot"><div class="cap">甲｜底栏撤 ➕<small>建议</small></div>%s</div>' % scale(home(bar=2))
    + '<div class="shot"><div class="cap">乙｜首屏不放圆 ➕</div>%s</div>' % scale(home(plus=False)),
    '<b>甲</b>：首页下半就是效果图那样；代价是底栏从三格变两格，"新建"从此只在首屏那枚圆上'
    '（底栏那排是你 10-01 本人翻案定成三格纯图标的）。<br>'
    '<b>乙</b>：改动最小；代价是直接违反你那句「右侧底下圆形+，就是添加的意思」，屏与效果图对不上。',
    '甲（底栏撤 ➕）', 'D9 甲'))

rows.append(row('D10', '没铺背景图那一态，深色面板也在（这条是我按字面定的，你没拍过）',
    '两屏都是"没铺形象图"那一态，只差那层墨在不在。',
    '<div class="shot"><div class="cap">甲｜面板常驻<small>建议／现状</small></div>%s</div>' % scale(home(panel=True))
    + '<div class="shot"><div class="cap">乙｜只在铺图时才有</div>%s</div>' % scale(home(panel=False)),
    '<b>甲</b>：一屏一套布局，判据只有一份；代价是没铺图那一态下半整片墨的，四套壁纸在首页下半几乎看不出（上半仍看得出）。<br>'
    '<b>乙</b>：壁纸重新管得住整屏；代价是皮要退回"覆盖条 vs 基础条"两份真相，10-10 那轮"类数不够压不住"的坑重新上桌。',
    '甲（留着）', 'D10 甲'))

rows.append(row('D11', '「调亮度」那三档从此拧不到面板以下',
    '左组＝现状（面板不跟着变），右组＝面板也吃亮度。每组的三小屏依次是 满月／半月／弯月。',
    '<div class="shot"><div class="cap">甲｜面板以下不变<small>建议</small></div>'
    + ''.join('<div style="display:inline-block">%s</div>' % scale(home(dim=i)) for i in (0, 1, 2))
    + '</div>'
    + '<div class="shot"><div class="cap">乙｜面板也吃亮度</div>'
    + ''.join('<div style="display:inline-block;position:relative">%s<div class="f" style="inset:0;'
              'background:%s;opacity:%s"></div></div>' % (scale(home(dim=i)), INK, [0, .2, .42][i])
              for i in (0, 1, 2)) + '</div>',
    '<b>甲</b>：就这样，再把「调亮度」那句说明改成只作用形象图；代价是你可能觉得"我拧了没反应"——这是手感，不是 bug。<br>'
    '<b>乙</b>：旋钮管得住整屏；代价是"恒深的面上恒纸白"这条不变量没了，字对比要按最暗那档重算，两把尺子各加一态。',
    '甲（＋改那句说明）', 'D11 甲'))

rows.append(row('D12', '压在深色面板上的那档玻璃：码里 .50 vs 效果图 .72（井与小圆 .20 vs .42）',
    '同一块面画两遍，只换那一枚白。合成色与比值是脚本现算的（拿面板那支墨 #23252C 打底，那口井再压在这块面上——不是压回墨底）。',
    ''.join(swatch(c) for c in CASES),
    '<b>计数那行字（正文，门槛 4.5）</b>：左边 <b>%.2f:1</b> 不过线 ⇒ 就是你 10-11 说的"13、12 等数字完全看不清"那个问题的复发条件；'
    '右边 <b>%.2f:1</b> 过线，合成 %s 与现网那块实心面实测 #CACACA 差 9 级（基本齐平）。<br>'
    '<b>那口井（它不是文字，也不是必须辨读的图形，所以量的不是对比度，是它与那块面的"级差"）</b>：'
    '现网没插深色面板时那道分界实测 26 级（见 §9.8），现在 .20 只剩 <b>%.0f 级</b>，抬到 .42 是 <b>%.0f 级</b>——'
    '抬了更分得出，不抬也不违反 4.5 那条线。<br>'
    '<b>甲（建议）</b>：本轮不动，等你看真跑截图再决定——代价是那块面与那口井跟效果图差一档。<br>'
    '<b>乙</b>：现在就抬 .72／.42；代价是改你亲手点过的 .50，而且二屏三屏那块面会一起变，没有屏证就动三处。'
    % (CASES[0]['crLabel'], CASES[1]['crLabel'], CASES[1]['face'], CASES[0]['wellLv'], CASES[1]['wellLv']),
    '甲（先不动，等截图）', 'D12 甲'))

rows.append(row('D13', '展开态那张 490 高，现网就压住底栏（不是 B 方案带来的，但深色面板让它变显眼）',
    '三屏都是展开态。差别只在：面板跟不跟着一起长、展开态垫不垫那层墨、以及第三条——什么都不动。',
    '<div class="shot"><div class="cap">甲｜面板跟着一起长<small>建议／不压底栏，还留 %.0frpx</small></div>%s</div>'
    % (-over_of('up', True), scale(expanded(grow='up')))
    + '<div class="shot"><div class="cap">乙｜展开态不垫面板<small>那一层墨在展开时退掉</small></div>%s</div>'
    % scale(expanded(panel=False))
    + '<div class="shot"><div class="cap">丙｜这轮不动<small>橙底那条就是被压住 %.0frpx</small></div>%s</div>'
    % (over_of('down', True), scale(expanded(grow='down'))),
    '<b>甲</b>：面板顶与录入面板同一条线；代价是"面板高度"那条判据要从常量换成随展开态变，'
    '`验-录入面板沉底-真跑` 加一态。<br>'
    '<b>乙</b>：改动最小；代价是展开那一下深色面板"退掉了"，跟「只是多了外面一层深色面板」自相矛盾。<br>'
    '<b>丙</b>：这轮不碰它；代价就是第三屏底下那条橙的——它压住底栏 %.0frpx、右滑那一枚被吃掉，数写在标题上。'
    % over_of('down', True),
    '甲', 'D13 甲'))

rows.append(row('D14', '我这轮定了、你没给的这几个数（一个数一张小图）',
    '每格只画那一处几何，数写在格下；全部从落码现读（1px＝1rpx）。改任何一条，正本与判据都要跟着重跑。',
    annotated(),
    '<b>甲（建议）</b>：先看真跑截图，不改。<br>'
    '<b>乙</b>：改哪条我就重跑钉它的那几把刀（静态 78 条里占 9 条），并把正本重出——图与码同源，漂一条就假绿。<br>'
    '补一句免得你误判：<b>墨面那 197 不是我拍的</b>，是女那张 360×433 的脚底落点倒算；真正我挑的是数字 64、两幅渐变的幅度、'
    '圆 ➕ 顶上留的 40、面板圆角 40。',
    '甲（等截图）', 'D14 甲'))

rows.append(row('D15', '真跑那五把现在跑不跑（约 10 分钟，每把重启一次开发者工具）',
    '这条不是设计，是动作。眼下这套 2.2 <b>一次都没在屏幕上出现过</b>。'
    '10-13 现跑：静态那 39 把 <b>37 绿</b>，两条红与本轮无关（<code>验-图片备份两半边</code> 5 条不过＝图片备份那条线；'
    '<code>验-现网下发收得进</code> 缺 <code>/tmp/live-payload.json</code>＝环境红，不是代码红）；反向那 27 把刀有牙、跑完工作树干净。',
    '<div class="shot"><div class="cap">甲｜答完 D9–D13 再跑<small>建议</small></div>'
    '<div style="width:300px;padding:18px 20px;font-size:15px;line-height:1.8">省一趟重启。<br>'
    '跑出来就是最终样子，截图直接对效果图。</div></div>'
    + '<div class="shot"><div class="cap">乙｜现在就跑</div>'
    '<div style="width:300px;padding:18px 20px;font-size:15px;line-height:1.8">你早 10 分钟看到屏。<br>'
    '但 D10 或 D12 只要答"改"，这五把要再跑一遍。</div></div>',
    '两条都不碰现网、不提审、不出包——只决定我下一趟命令先跑哪个。<br>'
    '你要是现在就想看屏，回"D15 乙"，我立刻跑。',
    '与上面一起答', 'D15 甲'))

HTML = ('<!doctype html><html><head><meta charset="utf-8"><title>2.2 首屏 · 待拍 D9–D15</title>'
        '<style>%s</style></head><body><div class="wrap">'
        '<h1>2.2 首屏 · 要你拍的七条（D9–D15）</h1><div class="src">'
        '屏上每句中文从 <code>utils/i18n.js</code> 现读；快门橙 %s、底栏色、皮肤变量从 <code>utils/palette.js</code> 现读；'
        '几何与两档玻璃从 <code>create.wxss</code>／<code>app.wxss</code>／<code>custom-tab-bar/index.wxss</code> 现读；'
        '换算只有一条：图上 1px＝1rpx。<b>屏是示意（CSS 画的），不是截图</b>——真跑的屏还没跑（就是 D15）。'
        '出处：<code>docs/方案-2.2大版本.md §6.1</code>。<br>'
        '<b>10-13 补一句：这一页前一版每一张屏都没画糊</b>（一层 <code>backdrop-filter</code> 都没有），'
        '而且面板把实心 .95 与那条 .55→.94 渐变两乘叠在一起 ⇒ band 顶只透出 5%%，'
        '"上部渐变半透明毛玻璃"在这张图上等于没画——你之前看到的"面板是死黑一块"有这一半原因。'
        '现在两档糊（面板 <code>%s</code>／块 <code>%s</code>）与三层分工全部照落码现读重画，'
        '有糊／没糊两版对差已按像素量过（band 那一条 36%% 的像素变了，面板以上那一条 0%%）。<br>'
        '<b>先说一样与下面七条无关的</b>：这一页每一张屏都画在「压暗罩＋纸白字」那一态（＝背景图判成深）。'
        '你手机上默认那张形象图判成<b>浅</b>——<code>utils/imgBrightness.js</code> 阈值 160，头部那一截 10-13 现算 184，'
        '所以现网那一态会把罩子翻成提亮罩、三级字翻回墨色。深浅翻色是 10-12 那一批已经落码的东西，'
        '甲乙两组屏在这上面完全一样，不在这里挑。<br>'
        '<b>另有一条你还没答的（D1）</b>：左侧那批随机卡片小图（含按压回色、「更多」、5 秒回弹、与 Tips 轮流）——'
        '本轮按"撤"在落码；要并入就是 P2 另开一票。回 <b>D1 撤</b> 或 <b>D1 并入</b>。</div>%s</div></body></html>'
        % (CSS, CAM, PANEL_BF, GLASS_BF, ''.join(rows)))

OUT_HTML = os.path.join(HERE, '待拍决策页-D9到D15.html')
OUT_PNG = os.path.join(HERE, '待拍决策页-D9到D15.png')
open(OUT_HTML, 'w', encoding='utf-8').write(HTML)
print('HTML ' + OUT_HTML)
# 页高不写死：先按 12000 出一张，再用**内容自己那一行**裁齐（扫最后一行不是页面底色的那一档）。
# 为什么不能凭估算：估少了会把最后一条待拍整条切掉，而那张图正是给站长看的东西。
subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                '--force-device-scale-factor=1', '--window-size=1288,12000',
                '--screenshot=' + OUT_PNG, 'file://' + OUT_HTML], capture_output=True)
from PIL import Image
im = Image.open(OUT_PNG).convert('RGB')
BG = (0xED, 0xEB, 0xE6)
W, H = im.size
px = im.load()
last = 0
for y in range(H - 1, -1, -1):
    row = [px[x, y] for x in range(0, W, 7)]
    if any(abs(r[0] - BG[0]) + abs(r[1] - BG[1]) + abs(r[2] - BG[2]) > 12 for r in row):
        last = y
        break
if last and last < H - 60:
    im.crop((0, 0, W, min(H, last + 40))).save(OUT_PNG)
    print('PNG  %s　（内容到底 %dpx，页面高 %d 那截空白已裁掉）' % (OUT_PNG, last + 40, H))
else:
    print('PNG  %s　!! 没找到内容底边（画到页高外面了？%d/%d）' % (OUT_PNG, last, H))
print('　现读核对：面板 z %s ＜ 底栏 z %s ⇒ %s' % (PANEL_Z, TAB_Z, '成立' if PANEL_Z < TAB_Z else '不成立'))
for c in CASES:
    print('　%s 面合成 %s（计数 %.2f:1）／井合成 %s（与面差 %.0f 级）'
          % (c['tag'], c['face'], c['crLabel'], c['fill'], c['wellLv']))
print('　展开态压底栏：top %d ＋ 高 %d ＝ %d ＞ 底栏顶 %d ⇒ 压住 %.0frpx'
      % (PANEL_TOP + LIFT, OPEN_H, PANEL_TOP + LIFT + OPEN_H, VIEW_H - TAB_B - TAB_H,
         PANEL_TOP + LIFT + OPEN_H - (VIEW_H - TAB_B - TAB_H)))
