#!/usr/bin/env python3
# B 方案效果图：在「现网背景」与「现网那些框框」之间插**一整层通栏深色面板**，
# 面板左上／右上圆角，上部一段渐变半透明毛玻璃（手法同「我的」那层纱，只是换成深色）。
# 站长 10-13 原话逐条落：
#   · 首屏右侧那两块（笔记／卡片计数）去掉 → 换成 Tips
#   · 右侧底下一枚圆形 ➕  添加
#   · 左下「记下来」那一块去掉 → 改成「笔记:16  卡片:13」，带下划线、可点
#   · 其他元素去掉；人物依旧可以切换
#   · 点圆形 ➕ ＝ 第二个屏；第二个屏「只是多了外面一层深色面板」
#   · 背景用站长给的原图（图三）
# 口径：字从 i18n.js 现读（缺键即报错）、色从 palette.js / app.wxss 现读、
# 几何从站长给的两张真机截图现读（1116×2484 ⇒ 750×1669rpx）。
# 跑法：python3 docs/design/10-12-2.2全量效果图/出-B方案深色面板.py
import json
import os
import re
import shutil
import subprocess
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('缺 Pillow：单屏切图要用它，装一下（pip3 install pillow）再跑')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
MP = os.path.join(ROOT, 'miniprogram')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

for f in ('ic-person.png', 'ic-person-alt.png'):
    shutil.copyfile(os.path.join(MP, 'assets', f), os.path.join(HERE, f))

NODE = (
    'const m=require("%s/utils/i18n.js");const p=require("%s/utils/palette.js");'
    'const ps=s=>Object.fromEntries(s.split(";").map(v=>{const i=v.indexOf(":");return[v.slice(0,i),v.slice(i+1)]}));'
    'console.log(JSON.stringify({zh:m.texts("zh"),en:m.texts("en"),pal:{eb:p.entryBlocks("tint-paper"),'
    'ch:p.chromeOf("tint-paper"),cp:ps(p.createSkin("tint-paper")),tipDot:p.TIP_DOT,dim:p.BG_DIMS,'
    'uncat:p.UNCATEGORIZED}}));' % (MP, MP)
)
_r = subprocess.run(['node', '-e', NODE], cwd=ROOT, capture_output=True, text=True)
if _r.returncode != 0:
    sys.exit('node 取字典/色板失败：' + _r.stderr[:400])
D = json.loads(_r.stdout)
ZH, EN, PAL = D['zh'], D['en'], D['pal']
CP, TIP_DOT = PAL['cp'], PAL['tipDot']
DIM = PAL['dim'][1]                       # 默认亮度档 dimV=1＝半月
INK = PAL['uncat']['bg']                  # 现网那支墨黑 #23252C：面板就取它，不另起一支深灰
PAPER = '#F2EFE9'                         # app.wxss --ink 那一族的纸白

# 现网那几层皮，逐字从 app.wxss / create.wxss 抄（效果图不许自造一档透明度）
GLASS_PLATE = 'rgba(255,255,255,.50)'     # --glass-plate：块与面板自己的面（现网值）
GLASS_BF = 'blur(23px) saturate(1.8)'     # --glass-bf
GLASS_HAIR = 'rgba(255,255,255,.55)'      # --glass-hair
GLASS_FILL = 'rgba(255,255,255,.20)'      # --glass-fill：井与小圆
GLASS_JOT = 'rgba(255,255,255,.38)'       # --glass-jot：白条
# ⚠ 现网那支白 .50 玻璃原来是压在**亮**的形象图上；B 方案把它压在**墨黑**面板上，
#   合成后只剩中灰，块里的字就不够 4.5 了（两个数都在下面 head 里现算现印）。
#   效果图这一版按 **白 .72** 画（甲案：只抬这一枚令牌，字色一个不动）——这一档他没拍过。
PLATE = 'rgba(255,255,255,.72)'
SCRIM = ('linear-gradient(180deg,rgba(18,20,26,.58) 0%,rgba(18,20,26,.58) 10%,'
         'rgba(18,20,26,.44) 43%,rgba(18,20,26,.42) 62%,rgba(18,20,26,.52) 83%,'
         'rgba(18,20,26,.62) 88%,rgba(18,20,26,.72) 100%)')

_fs = re.search(r'--fs-h1:\s*(\d+)rpx;.*?--fs-title:\s*(\d+)rpx;.*?--fs-body:\s*(\d+)rpx;'
                r'.*?--fs-meta:\s*(\d+)rpx;.*?--fs-tiny:\s*(\d+)rpx;.*?--fs-micro:\s*(\d+)rpx;',
                open(os.path.join(MP, 'app.wxss'), encoding='utf-8').read(), re.S)
if not _fs:
    sys.exit('app.wxss 里没读到 --fs-* 那一排，字号不许我自己编')
FS = dict(zip(('h1', 'title', 'body', 'meta', 'tiny', 'micro'), (int(v) for v in _fs.groups())))

_m = re.search(r"@font-face\s*\{[^}]*WtsjMind[^}]*\}",
               open(os.path.join(MP, 'app.wxss'), encoding='utf-8').read(), re.S)
FONT = _m.group(0) if _m else ''


def alpha(hexv, a):
    h = hexv.lstrip('#')
    return 'rgba({},{},{},{})'.format(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def mix(fg, bghex):
    """rgba(r,g,b,A) 压在 bghex 上合成后的实心色——面板是墨黑，白玻璃压上去到底剩多少亮度，
    这一函数就是那把尺子，不靠眼睛判。"""
    m = re.match(r'rgba\((\d+),(\d+),(\d+),([\d.]+)\)', fg)
    r, g, b, a = int(m.group(1)), int(m.group(2)), int(m.group(3)), float(m.group(4))
    h = bghex.lstrip('#')
    br, bg, bb = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (round(r * a + br * (1 - a)), round(g * a + bg * (1 - a)), round(b * a + bb * (1 - a)))


def lum(c):
    o = []
    for v in c:
        s = v / 255.0
        o.append(s / 12.92 if s <= .03928 else ((s + .055) / 1.055) ** 2.4)
    return .2126 * o[0] + .7152 * o[1] + .0722 * o[2]


def ratio(c1, c2):
    l1, l2 = lum(c1), lum(c2)
    hi, lo = max(l1, l2), min(l1, l2)
    return round((hi + .05) / (lo + .05), 2)


# ---------------- 视口与落点：全部量自站长那两张真机截图 ----------------
# 1116×2484 ⇒ 750×1669rpx；导航带下沿 184；底栏暗段 1543–1659；
# 首屏那组（Tips 行 + 三块）顶 1106、块顶 1192、块底 1500；第二屏白面板顶 1107、底 1516。
SHOT_W, SHOT_H = 1116, 2484
KS = 750.0 / SHOT_W
STAGE_W, STAGE_H = 750, round(SHOT_H * KS)          # 1669
NAV_H = 184
TAB_H, TAB_GAP = 108, 20
TAB_TOP = STAGE_H - TAB_GAP - TAB_H                 # 1541

ENTRY_X, ENTRY_W = 24, 702
ENTRY_TOP, ENTRY_H, ENTRY_OPEN = 1107, 410, 490
ENTRY_R = 55

# 首屏那一组：10-13 他一句「左边内框要与第二个图高度对齐」⇒ 左块与第二屏那块面板
# **同一条顶（1107）、同一条底（1517）**；两个人跟着块顶一起上移 99rpx，多出来的下半留给数字那一格。
GRP_TOP = ENTRY_TOP
CARD_X, CARD_W, CARD_H = ENTRY_X, 308, ENTRY_H
COL_X = CARD_X + CARD_W + 12                        # .blk-row gap 12
COL_W = STAGE_W - 24 - COL_X                        # 702 组宽 - 左块 - 缝
NUM_H = 124                                         # 下方那一格黑色毛玻璃：数字／横线／小字 三排

PANEL_TOP = 1000                                    # 深色面板顶：把首屏那一组与第二屏框外那一行一起包住
PANEL_H = STAGE_H - PANEL_TOP
PANEL_R = 40                                        # ← 这一枚他没给数，我定的（现网块 34／面板 55／底栏 44）
BAND = 240                                          # 上部那段渐变毛玻璃的高度

PLUS = 140                                          # 圆形 ➕：右列底下那一格


def sample(img_name, xr, yr, r=6):
    """从他给的两张真机截图上直接采一块面的均值（传 rpx 坐标）——
    现网那两档深浅不靠我估，也不靠眼睛看。"""
    src = Image.open(os.path.join(HERE, img_name)).convert('RGB')
    px = src.load()
    k = SHOT_W / 750.0
    cs = [px[int(x * k), int(y * k)] for y in range(yr - r, yr + r) for x in range(xr - r, xr + r)]
    n = sum(sum(c) for c in cs) // (len(cs) * 3)
    return '#{:02X}{:02X}{:02X}'.format(n, n, n)


LIVE_FACE = sample('站长给的-首屏现状.jpg', 40, 1400)       # 左块人物卡的面（避开插画与白条）
LIVE_PANEL = sample('站长给的-第二屏现状.jpg', 300, 1200)    # 录入面板的面（标签行下方那块空白）
LIVE_WELL = sample('站长给的-第二屏现状.jpg', 169, 1296)    # 相册那枚小圆的面
LIVE_WELL_STEP = int(LIVE_WELL[1:3], 16) - int(LIVE_PANEL[1:3], 16)


def lvl(v):
    """灰阶读数：元组或 '#RRGGBB' 都吃，取 R 通道（这三档本来就是近中性）"""
    return v[0] if isinstance(v, tuple) else int(v[1:3], 16)


def T(lang, key):
    d = ZH if lang == 'zh' else EN
    if key not in d:
        sys.exit('字典里没有这个键：%s（%s）——不许临场编文案' % (key, lang))
    return d[key]


IC = {
    'camera': '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    'images': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    'link': '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5.5l-3 3a5 5 0 0 0 7 7L9 19"/>',
    'write': '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'chev': '<path d="m9 18 6-6-6-6"/>',
    'clipboard': '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    'list': '<rect x="2.5" y="4" width="4" height="16" rx="1"/><path d="M9 7h12M9 12h12M9 17h12"/>',
    'person': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
}


def svg(name, size, color, sw=1.8):
    return ('<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="{c}" '
            'stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round">{p}</svg>').format(
                s=size, c=color, w=sw, p=IC[name])


def box(x, y, w=None, h=None, css=''):
    s = 'position:absolute;left:{}px;top:{}px;'.format(round(x), round(y))
    if w is not None:
        s += 'width:{}px;'.format(round(w))
    if h is not None:
        s += 'height:{}px;'.format(round(h))
    return s + css


def panel(inner):
    """通栏深色面板：左上／右上圆角，顶上一段同色渐变 .55→.94 ＋ backdrop blur 打在形象图上。
    ⚠ 这里一律用**具名**占位：上一版有一处把 inner 写成第 13 个位置参数、模板只有 12 个 `{}`，
    Python 的 str.format 对多出来的位置参数**不报错**，结果整层内容被静默丢掉、面板里空无一物。"""
    return ('<div class="panel" style="left:0px;top:{top}px;width:{w}px;height:{h}px;'
            'border-radius:{r}px {r}px 0 0;'
            'background:linear-gradient(to bottom,{a} 0px,{b} {band}px,{c} {c0}px,{d} 100%)">'
            '{inner}</div>').format(
                top=PANEL_TOP - NAV_H, w=STAGE_W, h=PANEL_H, r=PANEL_R,
                a=alpha(INK, .55), b=alpha(INK, .94), band=BAND,
                c=alpha(INK, .95), c0=BAND + 1, d=alpha(INK, .95), inner=inner)


# ---------------- 首屏 ----------------
def num_cell(x, w, n, label):
    """数字在横线**上方**、分类名在横线**下方**（他 10-13 原话）；
    数字用现网那支数字字形（`.blk-n`＝WtsjMind／Poppins Thin，同一族，只是从 88 收到 52），
    小字吃现成的 `--fs-micro` 那一档（＝「照片 · 链接 · 文字」那行同一个字号，他说的"正常小字"）。"""
    return ('<div style="{p}"><span class="num">{n}</span><span class="rule"></span>'
            '<span class="lab">{lab}</span></div>').format(
        p=box(x, 0, w, NUM_H, 'display:flex;flex-direction:column;align-items:center;'
                              'justify-content:center'),
        n=n, lab=label)


def screen_home(lang):
    # 左块＝人物。10-13 他一句「两个人背景用纯白渐变毛玻璃，下方数字区域用黑色毛玻璃，要模仿 ios 效果」
    # ⇒ 这一块不再是单层玻璃，拆成上下两片皮：上＝白渐变（iOS 控制中心那种上亮下透），下＝黑玻璃。
    face_h = CARD_H - NUM_H
    white = ('<div style="{p}"></div>').format(
        p=box(0, 0, CARD_W, face_h,
              'background:linear-gradient(to bottom,rgba(255,255,255,.94) 0px,'
              'rgba(255,255,255,.86) {}px,rgba(255,255,255,.76) 100%);'
              'backdrop-filter:{};-webkit-backdrop-filter:{}'.format(face_h * .45, GLASS_BF, GLASS_BF)))
    # 取景窗照旧从块顶往上出血 52（他人物超出块顶那一下是他拍板的），下沿停在黑玻璃上沿
    fig = ('<div style="{w}"><img class="fig" src="ic-person.png"/>'
           '<img class="fig-alt" src="ic-person-alt.png"/>'
           '<div class="alt-hit"></div></div>').format(
        w=box(0, -52, CARD_W, face_h + 52, 'overflow:hidden;'))
    dark = ('<div style="{p}">{c}</div>').format(
        p=box(0, face_h, CARD_W, NUM_H,
              'background:rgba(20,22,26,.55);backdrop-filter:{};-webkit-backdrop-filter:{};'
              'box-shadow:inset 0 1px 0 rgba(255,255,255,.18);'.format(GLASS_BF, GLASS_BF)),
        c=num_cell(22, (CARD_W - 44 - 20) / 2, '16', T(lang, 'statNotes'))
          + num_cell(22 + (CARD_W - 44 - 20) / 2 + 20, (CARD_W - 44 - 20) / 2, '13', T(lang, 'statCards')))
    card = ('<div style="{p}">{a}{f}{b}</div>').format(
        p=pbox(CARD_X, GRP_TOP, CARD_W, CARD_H,
               'border-radius:34px;overflow:hidden;box-shadow:inset 0 0 0 2px {}'.format(GLASS_HAIR)),
        a=white, f=fig, b=dark)
    # 右列＝上 Tips、下圆形 ➕。10-13 他一句「Tips 处在区域，Tips 要上下居中对齐」
    # ⇒ Tips 在它那一格里上下居中（不再是顶对齐），点仍跟着第一行字。
    plus_top = GRP_TOP + CARD_H - PLUS
    tips = ('<div style="{p}"><div class="tipsin"><i class="dot" style="background:{d}"></i>'
            '<span>{pre}{txt}</span></div></div>').format(
        p=pbox(COL_X, GRP_TOP, COL_W, plus_top - 24 - GRP_TOP, 'display:flex;align-items:center'),
        d=TIP_DOT, pre=T(lang, 'tipsPrefix'), txt=T(lang, 'tips')[0])
    # 圆形 ➕：10-13 他一句「带+号的按钮颜色与第二屏拍照按钮颜色一致」⇒ 吃快门那支实心橙
    plus = ('<div style="{p}">{g}</div>').format(
        p=pbox(COL_X + COL_W - PLUS, plus_top, PLUS, PLUS,
               'border-radius:50%;background: {};display:flex;align-items:center;'
               'justify-content:center;box-shadow:0 10px 26px rgba(0,0,0,.30);'.format(CP['--cp-cam'])),
        g=svg('plus', 56, CP['--cp-cam-ink'], 2.2))
    return panel(card + tips + plus)


# ---------------- 第二屏：现网那一屏，只是外面多一层深色面板 ----------------
# 面板内部尺寸逐条照 create.wxss：.panel 描边 2 ＋ 内边距 8/24/14、.modes 高 64、
# .card 上边距 6 ＋ 内边距 30（铺图态底色透明、边不画）、快门 180/环 10/实心 132/图形 65、
# 小圆 105/图形 40、右滑条 110/圆钮 90/图形 42、输入框 105（文字展开 160）、小图 100 见方 gap 16。
PL_BD, PL_PAD_T, PL_PAD_X, PL_PAD_B = 2, 8, 24, 14
MODES_H, CARD_MT, CARD_PD = 64, 6, 30


def pbox(x, y, w=None, h=None, css=''):
    """深色面板内的落点：传视口坐标，这里换成面板坐标。
    上一轮就是漏了这一刀（面板本身在 .page 里已经让开 NAV_H，里面的元素又按视口高写），
    结果底栏被推到屏外、Tips 被面板盖住，全是静默翻车。"""
    return box(x, y - PANEL_TOP, w, h, css)


def card_metrics(ph):
    """面板高（410 / 490）→ 卡内容盒，坐标是**卡自己那一层**的（不是面板的）：
    .card 挂在 (26, 80)，它自己还有 30 内边距。上一版把这里算成面板坐标、又发在卡里面，
    等于加了两次 80＋30，四屏的内容整排掉到面板下沿之外。"""
    return (CARD_PD, CARD_PD,
            ENTRY_W - 2 * PL_BD - 2 * PL_PAD_X - 2 * CARD_PD,
            ph - 2 * PL_BD - PL_PAD_T - PL_PAD_B - MODES_H - CARD_MT - 2 * CARD_PD)


def card_rect(ph):
    """`.card` 那一层在面板坐标系里的位置：x＝描边＋左右内边距，y＝描边＋上内边距＋标签行＋卡上边距"""
    return (PL_BD + PL_PAD_X, PL_BD + PL_PAD_T + MODES_H + CARD_MT,
            ENTRY_W - 2 * PL_BD - 2 * PL_PAD_X,
            ph - 2 * PL_BD - PL_PAD_T - MODES_H - CARD_MT - PL_PAD_B)


def modes_row(lang, on):
    labels = [('modePhoto', 'photo'), ('modeUrl', 'url'), ('modeWrite', 'write')]
    w = [len(T(lang, k)) * FS['title'] + 44 for k, _ in labels]      # .md 左右内边距 22
    bx, bw = PL_BD + PL_PAD_X, ENTRY_W - 2 * PL_BD - 2 * PL_PAD_X
    x = bx + (bw - (sum(w) + 24 * 2)) / 2                            # .modes justify-content:center
    o = []
    for (k, tag), cw in zip(labels, w):
        sel = tag == on
        o.append('<div style="{}">{}</div>'.format(
            box(x, PL_BD + PL_PAD_T, cw, MODES_H,
                'display:flex;align-items:center;justify-content:center;font-size:{}px;'
                'letter-spacing:1px;white-space:nowrap;{};'.format(
                    FS['title'],
                    'font-weight:600;color:{}'.format(CP['--cp-ink']) if sel
                    else 'color:{}'.format(CP['--cp-ink-50']))),
            T(lang, k)))
        if sel:
            o.append('<div style="{}"></div>'.format(
                box(x + (cw - 56) / 2, PL_BD + PL_PAD_T + MODES_H - 6, 56, 4,
                    'border-radius:2px;background:{}'.format(CP['--cp-ink']))))
        x += cw + 24
    return ''.join(o)


def entry_panel(lang, kind, open_panel=False):
    ph = ENTRY_OPEN if open_panel else ENTRY_H
    cx, cy, cw, ch = card_metrics(ph)
    return ('<div style="{p}">{m}<div style="{c}">{b}</div></div>').format(
        p=pbox(ENTRY_X, ENTRY_TOP, ENTRY_W, ph,
               'border-radius:{}px;background:{};backdrop-filter:{};-webkit-backdrop-filter:{};'
               'border:{}px solid rgba(255,255,255,.10);box-sizing:border-box;'
               'box-shadow:0 16px 34px rgba(8,10,14,.10);'.format(ENTRY_R, PLATE, GLASS_BF, GLASS_BF, PL_BD)),
        m=modes_row(lang, 'photo' if kind in ('photo', 'shots', 'busy') else kind),
        # .card 在铺图态＝透明、无边（R3：外框与内框合成一层玻璃），只留那一档内边距
        c=box(*card_rect(ph)[:2], *card_rect(ph)[2:],
              'border-radius:40px;position:absolute'),
        b=card_body(lang, kind, cx, cy, cw, ch))


def card_body(lang, kind, cx, cy, cw, ch):
    if kind == 'photo':
        return crow_row(lang, cx, cy, cw, ch)
    if kind in ('shots', 'busy'):
        return strip_row(lang, cx, cy, cw) + sld_row(lang, cx, cy + ch - 110, cw, kind == 'busy', 'camera')
    if kind == 'url':
        y = cy + (ch - 215) / 2
        return field_row(lang, cx, y, cw, 105, 'linkDesc') + sld_row(lang, cx, y + 125, cw, False, 'link')
    if kind == 'write':
        return (field_row(lang, cx, cy, cw, 160, 'manualDesc')
                + switch_row(lang, cx, cy + 172, cw)
                + sld_row(lang, cx, cy + ch - 110, cw, False, 'write'))
    sys.exit('未知档：%s' % kind)


def crow_row(lang, cx, cy, cw, ch):
    """三枚圈：中间快门 180（灰环 10 ＋ 实心橙 132）＝拍照，左右小圆 105＝相册／跳链接档"""
    shut_h, mini_h, gap = 180 + 8 + 28.8, 105 + 10 + 25.2, 38
    x = cx + (cw - (130 + gap + 180 + gap + 130)) / 2
    o = []
    for key, icon, w, big in ((T(lang, 'fromAlbum'), 'images', 130, False),
                              (T(lang, 'takePhoto'), 'camera', 180, True),
                              (T(lang, 'modeUrl'), 'link', 130, False)):
        cxc = x + w / 2
        if big:
            y0 = cy + (ch - shut_h) / 2
            o.append('<div style="{}">{}</div>'.format(
                box(cxc - 90, y0, 180, 180,
                    'border-radius:50%;border:10px solid {};box-sizing:border-box;display:flex;'
                    'align-items:center;justify-content:center;'.format(CP['--cp-ring'])),
                '<div style="width:132px;height:132px;border-radius:50%;background:{};display:flex;'
                'align-items:center;justify-content:center">{}</div>'.format(
                    CP['--cp-cam'], svg('camera', 65, CP['--cp-cam-ink'], 1.7))))
            o.append('<div style="{}">{}</div>'.format(
                box(cxc - 90, y0 + 188, 180, 30, 'text-align:center;font-size:{}px;line-height:1.2;'
                    'font-weight:700;letter-spacing:1px;color:{}'.format(FS['meta'], CP['--cp-ink-78'])), key))
        else:
            y0 = cy + (ch - mini_h) / 2
            o.append('<div style="{}">{}</div>'.format(
                box(cxc - 52, y0, 105, 105, 'border-radius:50%;background:{};display:flex;'
                    'align-items:center;justify-content:center'.format(GLASS_FILL)),
                svg(icon, 40, CP['--cp-ink-78'], 1.7)))
            o.append('<div style="{}">{}</div>'.format(
                box(cxc - 65, y0 + 115, 130, 26, 'text-align:center;font-size:{}px;letter-spacing:1px;'
                    'color:{}'.format(FS['tiny'], CP['--cp-ink-50'])), key))
        x += w + gap
    return ''.join(o)


def strip_row(lang, cx, cy, cw):
    o = []
    for i in range(3):
        o.append('<div style="{}"><span class="thumb p{}"></span><i class="x">✕</i>'
                 '<em class="no">{}</em></div>'.format(
                     box(cx + i * 116, cy, 100, 100,
                         'border-radius:18px;overflow:hidden;box-shadow:inset 0 0 0 2px rgba(255,255,255,.16);'),
                     i % 4 + 1, i + 1))
    o.append('<div style="{}">{}</div>'.format(
        box(cx + 3 * 116, cy, 100, 100, 'border-radius:18px;background:{};display:flex;'
            'align-items:center;justify-content:center'.format(GLASS_FILL)),
        svg('plus', 45, CP['--cp-ink-78'], 2.2)))
    return ''.join(o)


def field_row(lang, x, y, w, h, key):
    return '<div style="{}"><span class="ph">{}</span><span style="margin-left:auto">{}</span></div>'.format(
        box(x, y, w, h, 'border-radius:18px;background:{};border:3px solid {};'
            'display:flex;align-items:center;padding:0 28px;box-sizing:border-box;'
            'font-size:{}px;'.format(GLASS_FILL, GLASS_HAIR, FS['body'])),
        T(lang, key), svg('clipboard', 40, CP['--cp-ink-62'], 1.7))


def switch_row(lang, x, y, w):
    return ('<div style="{}"><span style="font-size:{}px;color:{}">{}</span>'
            '<span style="margin-left:10px;font-size:{}px;color:{}">{}</span>'
            '<span class="sw-track"><i class="sw-dot"></i></span></div>').format(
        box(x, y, w, 48, 'display:flex;align-items:center;'),
        FS['body'], CP['--cp-ink'], T(lang, 'origTranslate'),
        FS['micro'], CP['--cp-ink-50'], T(lang, 'origTranslateHint'))


def sld_row(lang, x, y, w, busy, icon):
    return ('<div style="{p}"><span style="position:absolute;left:0;top:0;bottom:0;width:{fw}px;'
            'border-radius:50px;background:{fill}"></span>'
            '<span class="swt">{txt}</span>'
            '<span style="position:absolute;left:{kx}px;top:5px;width:90px;height:90px;'
            'border-radius:50%;background:{knob};display:flex;align-items:center;'
            'justify-content:center">{glyph}</span></div>').format(
        p=box(x, y, w, 110, 'border-radius:55px;background:{};border:5px solid {};'
            'box-sizing:border-box;position:absolute;overflow:hidden;'.format(GLASS_FILL, GLASS_HAIR)),
        fw=w if busy else 0,
        fill=alpha('#FFFFFF', .30) if busy else alpha('#FFFFFF', .14),
        txt=T(lang, 'busyExtract' if busy else 'slideExtract'),
        kx=w - 100 if busy else 10, knob=CP['--cp-extract'],
        glyph=svg(icon, 42, CP['--cp-extract-ink'], 1.9))


def screen_entry(lang, kind, open_panel=False):
    out = ('<div style="{p}"><div class="tipsin"><i class="dot" style="background:{d}"></i>'
           '<span class="outl">{pre}{txt}</span></div><span class="outr">{back}</span></div>').format(
        p=pbox(0, PANEL_TOP, STAGE_W, ENTRY_TOP - PANEL_TOP,
               'display:flex;align-items:center;padding:0 20px;box-sizing:border-box;'
               'font-size:{}px;line-height:1.4;letter-spacing:1px;color:{}'.format(
                   FS['meta'], alpha(PAPER, .9))),
        d=TIP_DOT, pre=T(lang, 'tipsPrefix'), txt=T(lang, 'tips')[0], back=T(lang, 'back'))
    return panel(out + entry_panel(lang, kind, open_panel))



# ---------------- 外壳 ----------------
def frame(lang, body, cap, tag=''):
    zh_on = 'lon' if lang == 'zh' else ''
    en_on = 'lon' if lang == 'en' else ''
    return ('<div class="cell"><div class="stage">'
            '<div class="nav"><span class="nt">{app}</span><span class="caps"><i></i><em></em><b></b></span></div>'
            '<div class="page"><div class="bg"></div><div class="scrim" style="opacity:{veil}"></div>'
            '<div class="trow"><span class="h1">{head}</span><span class="langs">'
            '<span class="{zo}">中</span><span class="{eo}">EN</span></span></div>'
            '<div class="swap"><span>{dimL}</span><i class="sdot" style="background:{dot}"></i>'
            '<span class="s2">{swapL}</span>{chev}</div>'
            '{body}'
            '<div class="tabbar"><span class="tb tb-on">{tplus}</span>'
            '<span class="tb">{tlist}</span><span class="tb">{tperson}</span></div>'
            '</div></div><div class="cap"><b>{cap}</b>{tag}</div></div>').format(
        app=T(lang, 'appName'), veil=DIM['veil'], head=T(lang, 'createHeading'),
        zo=zh_on, eo=en_on, dimL=T(lang, 'bgDimLabel'), dot=DIM['dot'],
        swapL=T(lang, 'homeBgSwap'), chev=svg('chev', 20, PAPER, 2.2), body=body,
        tplus=svg('plus', 34, '#FCFAF3', 2.2), tlist=svg('list', 30, '#FCFAF3', 1.8),
        tperson=svg('person', 30, '#FCFAF3', 1.8), cap=cap,
        tag=('　·　' + tag) if tag else '')


CH = PAL['ch']
CSS = FONT + '''
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
body{background:#EAE7E2;padding:28px;font-family:-apple-system,"PingFang SC",sans-serif}
.head{display:flex;gap:22px;margin-bottom:26px;flex-wrap:wrap}
.head .bx{background:#fff;border:1px solid #DDD8CC;border-radius:14px;padding:12px}
.head img{display:block;height:250px;width:auto;border-radius:8px}
.head .t{font-size:15px;color:#45423E;margin-top:8px;max-width:340px;line-height:1.55}
.head code{background:#F2EFE9;padding:1px 4px;border-radius:4px;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(3,__W__px);gap:34px 26px}
.cell{width:__W__px}
.stage{position:relative;width:__W__px;height:__H__px;background:#0E0D0B;overflow:hidden;
       border-radius:36px;box-shadow:0 10px 26px rgba(0,0,0,.28)}
.nav{position:absolute;left:0;top:0;width:__W__px;height:__NAVH__px;background:#14161A;z-index:9}
.nt{position:absolute;left:0;right:0;top:52px;text-align:center;font-size:30px;color:#F2EFE9}
.caps{position:absolute;right:20px;top:52px;width:174px;height:62px;border:1px solid rgba(255,255,255,.22);
      border-radius:31px;background:rgba(20,22,26,.5);display:flex;align-items:center;
      justify-content:space-evenly}
.caps i{width:34px;height:14px;border-radius:7px;background:#F2EFE9;position:relative}
.caps i::after{content:"";position:absolute;left:6px;top:4px;width:6px;height:6px;border-radius:50%;
               background:#14161A;box-shadow:11px 0 0 #14161A,22px 0 0 #14161A}
.caps em{width:1px;height:30px;background:rgba(255,255,255,.22)}
.caps b{width:30px;height:30px;border-radius:50%;border:2px solid #F2EFE9;position:relative}
.caps b::after{content:"";position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;
               border-radius:50%;background:#F2EFE9}
.page{position:absolute;left:0;top:__NAVH__px;width:__W__px;height:__PAGEH__px}
.bg{position:absolute;inset:0;background:url("__BG__") center/cover no-repeat}
.scrim{position:absolute;inset:0;background:__SCRIM__}
.trow{position:absolute;left:32px;top:34px;width:686px;display:flex;align-items:center;z-index:3}
.h1{font-size:__FSH1__px;font-weight:700;color:#F2EFE9;text-shadow:0 1px 6px rgba(0,0,0,.45)}
.langs{margin-left:auto;font-size:26px;color:rgba(242,239,233,.5);display:flex;gap:12px}
.langs .lon{color:#F2EFE9;font-weight:700;border-bottom:3px solid #F2EFE9;padding-bottom:2px}
.swap{position:absolute;left:32px;top:106px;display:flex;align-items:center;gap:12px;font-size:26px;
      color:#F2EFE9;text-shadow:0 1px 6px rgba(0,0,0,.45);z-index:3}
.swap .sdot{width:26px;height:26px;border-radius:50%;border:2px solid rgba(242,239,233,.7)}
.swap .s2{margin-left:22px}
.panel{position:absolute;overflow:hidden;z-index:4;
       -webkit-backdrop-filter:blur(26px) saturate(1.15);backdrop-filter:blur(26px) saturate(1.15)}
.fig{position:absolute;left:0;top:0;width:220px;height:auto}
.fig-alt{position:absolute;right:0;bottom:0;height:132px;width:auto;
         filter:grayscale(1) brightness(1.45);opacity:.5}
.alt-hit{position:absolute;right:0;bottom:0;width:111px;height:152px}
.tipsin{display:flex;align-items:flex-start;font-size:__FSMETA__px;line-height:1.4;
        letter-spacing:1px;color:rgba(242,239,233,.96)}
.num{font-family:'WtsjMind','Poppins',sans-serif;font-weight:100;font-size:64px;line-height:.84;
     letter-spacing:-2px;color:#F2EFE9}
.rule{width:88px;height:2px;background:rgba(242,239,233,.85);margin:12px 0 8px}
.lab{font-size:__FSMICRO__px;letter-spacing:1px;color:rgba(242,239,233,.72)}
.dot{flex:none;width:14px;height:14px;border-radius:50%;margin-top:10px;margin-right:12px}
.outl{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.outr{flex:none;margin-left:20px}
.swt{position:relative;display:flex;align-items:center;height:100%;justify-content:center;
     font-size:__FSTITLE__px;font-weight:700;letter-spacing:1px;color:__CPINK__}
.ph{color:rgba(53,46,29,.5)}
.sw-track{margin-left:auto;width:72px;height:40px;border-radius:20px;background:__SOLID__;
          position:relative}
.sw-dot{position:absolute;top:4px;left:36px;width:32px;height:32px;border-radius:50%;background:__SOLIDINK__}
.tabbar{position:absolute;left:24px;top:__TABTOP__px;width:702px;height:108px;border-radius:44px;
        background:__TBBG__;border:3px solid __TBLINE__;box-shadow:0 16px 44px __TBSHADOW__;
        display:flex;align-items:center;justify-content:space-around;z-index:6}
.tabbar .tb{width:76px;height:76px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.tabbar .tb-on{background:__TBSEL__}
.thumb{display:block;width:100%;height:100%;background:url("__BG__") center/cover no-repeat}
.thumb.p1{background-position:20% 30%}.thumb.p2{background-position:44% 36%}
.thumb.p3{background-position:68% 42%}.thumb.p4{background-position:88% 34%}
.x{position:absolute;right:4px;top:4px;width:20px;height:20px;border-radius:50%;background:rgba(15,15,15,.55);
   color:#fff;font-size:12px;line-height:20px;text-align:center;font-style:normal}
.no{position:absolute;left:6px;bottom:3px;color:#FCFAF3;font-size:13px;font-style:normal;
    text-shadow:0 1px 2px rgba(0,0,0,.6)}
.cap{margin-top:12px;font-size:19px;color:#33312E;line-height:1.55;width:__W__px}
'''
for k, v in [('__W__', STAGE_W), ('__H__', STAGE_H), ('__NAVH__', NAV_H),
             ('__PAGEH__', STAGE_H - NAV_H), ('__TABTOP__', TAB_TOP - NAV_H),
             ('__TBBG__', CH['bg']), ('__TBSEL__', CH['sel']), ('__TBLINE__', CH['line']),
             ('__TBSHADOW__', CH['shadow']), ('__BG__', '站长给的-背景原图.jpg'),
             ('__SCRIM__', SCRIM), ('__FSH1__', FS['h1']), ('__FSTITLE__', FS['title']),
             ('__CPINK__', CP['--cp-ink']), ('__FSMETA__', FS['meta']), ('__FSMICRO__', FS['micro']),
             ('__SOLID__', CP['--cp-extract']),
             ('__SOLIDINK__', CP['--cp-extract-ink'])]:
    CSS = CSS.replace(k, str(v))


def build(lang):
    items = [
        (screen_home(lang), '① 首屏（B 方案）',
         '通栏深色面板压在形象图之上、框框之下：左上／右上圆角，顶上一段同色渐变（.55→.94，240rpx）'
         '＋ backdrop blur，墨黑 <code>' + INK + '</code>。'
         '<b>左块与第二屏那块面板同一条顶、同一条底（1107–1517，410 高）</b>，两个人跟着块顶一起上移 99rpx；'
         '下半 124 高那一格＝<b>黑色毛玻璃</b>，数字在横线<b>上方</b>、分类名在横线下方（整格可点）；'
         '上半＝<b>纯白渐变毛玻璃</b>（.94→.86→.76）。'
         '圆形 ➕ 吃<b>快门那支实心橙</b> <code>' + CP['--cp-cam'] + '</code>。'
         'Tips 在它那一格里<b>上下居中</b>。人物与"点右后方剪影换人"照旧。'),
        (screen_entry(lang, 'photo'), '② 点圆形 ➕ ＝ 第二屏',
         '现网那一屏一个字不动，只是外面多一层深色面板；框外那一行 Tips 在'
         '「面板顶→白面板顶」那 107rpx 里<b>上下居中</b>。白面板 410 高、圆角 55、'
         '三枚档（' + T(lang, 'modePhoto') + '／' + T(lang, 'modeUrl') + '／' + T(lang, 'modeWrite') + '）'
         '＋ 三枚圈（快门 180／两枚小圆 105，图形在圆里、名字在圆下）。'),
        (screen_entry(lang, 'url'), '③ 第二屏·链接档',
         '输入框 105 ＋ 右滑那一枚 110，全照现网尺寸。'),
        (screen_entry(lang, 'write', True), '④ 第二屏·文字档（展开 490）',
         '原文框展开 160 ＋「' + T(lang, 'origTranslate') + '」那一枚和它的小字注释（照现网字典）。'),
        (screen_entry(lang, 'shots'), '⑤ 第二屏·已选 3 张',
         '缩略图 100 见方、圆角 18、✕ 右上、序号左下、➕ 钉最右（照现网）。'),
        (screen_entry(lang, 'busy'), '⑥ 第二屏·正在提炼',
         '文案换 <code>busyExtract</code>、轨道吃满、圆钮停在最右（照现网）。'),
    ]
    cells = ''.join(frame(lang, b, c, t) for b, c, t in items)
    p50, p72 = mix(GLASS_PLATE, INK), mix(PLATE, INK)
    ink = (0x3A, 0x3A, 0x3C)
    cmp50, cmp72 = ratio(p50, ink), ratio(p72, ink)
    well = mix(GLASS_FILL, '#%02X%02X%02X' % p72)
    well_step = (well[0] + well[1] + well[2]) // 3 - (p72[0] + p72[1] + p72[2]) // 3
    def hx(c):
        return '#{:02X}{:02X}{:02X}'.format(*c)
    head = ('<div class="head">'
            '<div class="bx"><img src="站长给的-首屏现状.jpg"><div class="t"><b>你给的第一张（现网首屏）</b><br>'
            '右侧那两块计数、左下「记下来」那一块——这版按你说的撤掉换内容。</div></div>'
            '<div class="bx"><img src="站长给的-第二屏现状.jpg"><div class="t"><b>你给的第二张（现网第二屏）</b><br>'
            '这一屏里面一个字不动，只多外面那层深色面板。</div></div>'
            '<div class="bx"><img src="站长给的-背景原图.jpg"><div class="t"><b>你给的第三张（背景原图）</b><br>'
            '本表所有屏的底图就是它，裁法照现网 <code>.page-bg</code>（750×100vh、aspectFill）'
            '＋现网那层压暗罩 <code>.page-scrim</code>（默认亮度档「' + DIM['name'] + '」）。</div></div>'
            '<div class="bx"><div class="t" style="max-width:360px;margin:0"><b>口径（全部现读／现量）</b><br>'
            '视口：你这两张真机截图 1116×2484 ⇒ <b>750×' + str(STAGE_H) + ' rpx</b>；'
            '导航带下沿 184、现网首屏那一组顶 1106、块顶 1192、底栏 1541–1649、'
            '第二屏白面板 1107–1516 —— 全部量自这两张图。<br>'
            '<b>10-13 第二轮改的四处</b>：① 左块改成与第二屏那块<b>同顶同底</b>（1107–1517）、'
            '两个人跟着上移、下半留给数字那一格；② 数字在横线上方、分类名在下方，'
            '数字 <b>64</b>（现网那支 WtsjMind Thin，从 <code>.blk-n</code> 的 88 收下来）、'
            '小字吃现成的 <code>--fs-micro</code> ' + str(FS['micro']) + '（＝「照片 · 链接 · 文字」那行同一档）；'
            '③ 圆形 ➕ 换成快门那支橙；④ 每一屏的 Tips 在各自那一格里上下居中。'
            '<b>64／124／.94→.76 这三个数我定的，他没给。</b><br>'
            '字：<code>i18n.js</code> 现读（缺键直接报错）；字号：<code>app.wxss --fs-*</code> 现读；'
            '色：<code>palette.js</code> 现读（面板取墨黑 <code>' + INK + '</code>、'
            '快门取固定橙 <code>' + CP['--cp-cam'] + '</code>、底栏取 <code>chromeOf</code>）；'
            '玻璃：<code>--glass-plate</code> 白 .50 ＋ <code>--glass-bf</code> blur(23px)。<br>'
            '<b>面板</b>：顶 ' + str(PANEL_TOP) + '、通栏 0–750、贴到屏底；上部 240rpx 一段同色渐变 '
            '.55→.94 ＋ backdrop blur 26px。<br>'
            '<b>一处必须拍（数是从他这两张截图上采的，不是我估的）</b>：现网那块面的面实测 '
            '<code>' + LIVE_FACE + '</code>、井（小圆／输入框）实测 <code>' + LIVE_WELL + '</code>，'
            '与面板面差 <b>' + str(LIVE_WELL_STEP) + '</b> 级。B 方案把它压到墨黑面板上：'
            '现网那支白 <b>.50</b> 合成 <code>' + hx(p50) + '</code>（比现网那块面暗 '
            + str(lvl(LIVE_FACE) - lvl(p50)) + ' 级），块里那行计数（<code>#3A3A3C</code>）对它只剩 '
            '<b>' + str(cmp50) + ':1</b>，低于全站那条 4.5。'
            '<br>这张效果图按<b>白 .72</b> 画：合成 <code>' + hx(p72) + '</code>，与现网实测那档差 '
            + str(lvl(LIVE_FACE) - lvl(p72)) + ' 级（基本齐平），计数对它 <b>'
            + str(cmp72) + ':1</b> ✓。但井那档（白 .20）在同一面上只剩 <code>' + hx(well) + '</code>、'
            '差 ' + str(well_step) + ' 级，比现网那道 ' + str(LIVE_WELL_STEP) + ' 级淡一半 ⇒ '
            '<b>井要一起从 .20 抬到 .42</b> 才回到现网那道分界。'
            '这一档（第二屏那块面板压在深色面板上的玻璃浓度）他没拍过，我按数定的。'
            '（首屏左块不吃这一问了：他 10-13 改成了上白下黑两片皮。）'
            '</div></div></div>')
    html = ('<!doctype html><html><head><meta charset="utf-8"><title>B 方案 · 深色面板</title>'
            '<style>' + CSS + '</style></head><body>' + head +
            '<div class="grid">' + cells + '</div></body></html>')
    name = 'B方案-深色面板-%s.html' % ('中文' if lang == 'zh' else '英文')
    # 内容没丢的最低一道闸：str.format 对多出来的位置参数不报错，整层内容会被静默吃掉，
    # 光看渲染出来的图"面板是黑的"根本分不出是没画还是画了被盖住。
    for must in ('ic-person.png', 'ic-person-alt.png', 'class="num"', 'class="rule"', 'class="lab"', 'class="dot"', 'class="sw-track"',
                 'class="tabbar"', 'class="panel"', 'class="swt"', 'class="thumb p1"',
                 T(lang, 'statNotes'), T(lang, 'statCards'), T(lang, 'back')):
        if must not in html:
            sys.exit('HTML 里没有「%s」——有一层内容没发出去，别去猜图，先看这里' % must)
    open(os.path.join(HERE, name), 'w', encoding='utf-8').write(html)
    return name


def render(name):
    out = os.path.join(HERE, name.replace('.html', '.png'))
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=1', '--screenshot=' + out,
                    '--window-size=2380,6400', 'file://' + os.path.join(HERE, name)],
                   capture_output=True)
    im = Image.open(out).convert('RGB')
    px = im.load()
    # 表头那一段的高度会随文案涨（这一轮就从 568 长到 871），写死窗口高就把第二屏切掉了。
    # 做法：导航带那一整行 #14161A 是个现成的锚，扫出两行的起点，再按第二屏的底＋说明留白裁。
    nav, inr = [], False
    for y in range(im.height):
        ok = sum(1 for x in range(28, im.width, 9)
                 if all(abs(px[x, y][i] - (0x14, 0x16, 0x1A)[i]) <= 8 for i in range(3))) > 150
        if ok and not inr:
            nav.append(y)
            inr = True
        elif not ok:
            inr = False
    if len(nav) < 2:
        sys.exit('只扫到 %d 行 stage：版面没排成两行，别拿这张当成品' % len(nav))
    bottom = min(im.height, nav[1] + STAGE_H + 200)
    im.crop((0, 0, im.width, bottom)).save(out)
    tag = '中' if '中文' in name else 'EN'
    for i in range(6):
        r, c = divmod(i, 3)
        x0 = (28, 804, 1580)[c]
        Image.open(out).convert('RGB').crop(
            (x0, nav[r], x0 + STAGE_W, nav[r] + STAGE_H)).save(
            os.path.join(HERE, '单屏-B%s-%02d.png' % (tag, i + 1)))
    return out


if __name__ == '__main__':
    for lang in ('zh', 'en'):
        n = build(lang)
        p = render(n)
        print('HTML', os.path.join(HERE, n))
        print('PNG ', p, os.path.getsize(p) if os.path.exists(p) else '渲染失败')
