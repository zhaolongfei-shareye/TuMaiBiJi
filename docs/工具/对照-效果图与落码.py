#!/usr/bin/env python3
# 站长 10-11 10:0x 定的一条规矩：**做完必须对照效果图，否则不验收**。
#   他给的原话：「file:///Users/zlfmac/Documents/TuMaiBiJi/docs/design/10-11毛玻璃/毛玻璃-效果图.html，
#   这是你出的效果图，你做完必须对照，否则不验收」
# 这一把就是那条"对照"落成的可复跑工具：效果图 CSS 里的每一个值，与落码里的值，逐条摆一起比。
# 换算只有一条：图上 1px＝1rpx，而 1rpx≈0.52 真机 px（390 视口 ÷ 750），所以 blur 46→23、20→10、内环 2px→2rpx。
# 跑法：python3 docs/工具/对照-效果图与落码.py      （对不上即退出码 1）
#
# ⚠ 2.2 这一支（release/2.2 工作树）的效果图**不是**这一份。10-11 那套皮是"首页三块＋白条都吃白 .50 单层"，
#   10-13 B 方案把首屏整个换掉：白条撤了、右下一枚 ➕ 进来、左块拆成"白面渐变毛玻璃 + 墨面渐变毛玻璃"两片，
#   面板也换成深色。所以这里**每一条都要先问"这一条在 2.2 还成不成立"**：
#   成立的照比；被 B 方案撤掉的那几层，**大声打成退役**（不是悄悄删行、也不是让它假绿），
#   并指出 2.2 那一片的对照归谁。2.1 那一支上的文件没有 `.blk-face`，走老路、一行不少。
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..'))
HTML = os.path.join(ROOT, 'docs/design/10-11毛玻璃/毛玻璃-效果图.html')
WX = os.path.join(ROOT, 'miniprogram/app.wxss')
CW = os.path.join(ROOT, 'miniprogram/pages/create/create.wxss')

html = open(HTML, encoding='utf-8').read()
app = open(WX, encoding='utf-8').read()
cre = open(CW, encoding='utf-8').read()


def one(src, pat, name):
    m = re.search(pat, src)
    if not m:
        raise SystemExit(f'!! 在 {name} 里没读到 {pat}＝对照做不了（文件改过了还是正则坏了？）')
    return m


def soft(src, pat, name):
    """可能已经被 B 方案撤掉的这一层：读不到就返回 None，由调用处打成退役，不许拖死整把尺子。"""
    m = re.search(pat, src)
    return m or None


def num(s):
    """把 '.30' / '0.3' / '30%' 这类统一成浮点，比较只看数，不看写法。"""
    return float(str(s).strip().rstrip('%'))


rows = []
retired = []


def cmp(项, 图上, 码里, 换算, 期望):
    try:
        ok = abs(num(码里) - num(期望)) < 1e-9 if isinstance(num(码里), float) else False
    except ValueError:
        ok = str(码里).strip() == str(期望).strip()
    rows.append((ok, 项, 图上, 码里, 换算))


# ---- 2.2 的判型：白面那一片在，就是 B 方案那一版首屏 ----
B2 = bool(re.search(r'\.blk-face\s*\{', cre))

# ---- 效果图那两条规则（首页三块＝`.g-blk`，白条＝`.g-jot`；**按选择器定位，不写行号**，行号一漂就假红） ----
ga = one(html, r'--ga:\s*(\.?[\d.]+)', '效果图')[1]
mb = one(html, r'--g-blur:\s*blur\((\d+)px\)\s*saturate\(([\d.]+)\)', '效果图')
gblur_v, gblur_s = mb[1], mb[2]
gblk = one(html, r'(\.blk-person\.g-blk[^{]*\{[^}]*\})', '效果图 .g-blk')[1]
gplate = one(html, r'--g-plate:\s*rgba\(255,\s*255,\s*255,\s*([\d.]+)\)', '效果图 --g-plate')[1]

veil = one(app, r'--glass-veil:\s*rgba\(255,\s*255,\s*255,\s*([\d.]+)\)', 'app.wxss')[1]
mb2 = one(app, r'--glass-bf:\s*blur\((\d+)px\)\s*saturate\(([\d.]+)\)', 'app.wxss')
bf_v, bf_s = mb2[1], mb2[2]
hair = one(app, r'--glass-hair:\s*rgba\(255,\s*255,\s*255,\s*([\d.]+)\)', 'app.wxss')[1]
plate = one(app, r'--glass-plate:\s*rgba\(255,\s*255,\s*255,\s*([\d.]+)\)', 'app.wxss')[1]
# 这三样是 10-11 那一版的产物，B 方案把它们整层撤了：读不到＝退役，读到（＝还在 2.1 那一支）才照比。
gjot = soft(html, r'(\.g-jot\s*\{[^}]*\})', '效果图 .g-jot')
jot = soft(app, r'--glass-jot:\s*rgba\(255,\s*255,\s*255,\s*([\d.]+)\)', 'app.wxss')
jot_rule = soft(cre, r'(\.container\.has-bg \.blk-jot,\s*\.container\.has-bg \.blk-strip\s*\{[^}]*\})', 'create.wxss')
blk_rule = soft(cre, r'(\.container\.has-bg \.blk-person,[^}]*\})', 'create.wxss')

cmp('白纱 α', f'.{ga}', veil, '图上＝码里（他在校准条上点的 .30）', ga)
cmp('大面 blur', f'{gblur_v}px', bf_v, '图上 1px＝1rpx≈0.52 真机 px ⇒ 46→23', int(gblur_v) / 2)
cmp('大面 saturate', gblur_s, bf_s, '不换算，照抄', gblur_s)
cmp('白内环 α', one(gblk, r'inset 0 0 0 2px rgba\(255, 255, 255, (\.?[\d.]+)\)', '.g-blk')[1], hair, '不换算', one(gblk, r'inset 0 0 0 2px rgba\(255, 255, 255, (\.?[\d.]+)\)', '.g-blk')[1])
cmp('白底 α（10-11 12:5x 他点名的那一档）', gplate, plate, '不换算（他原话「100%白色，半透明50%，也变成毛玻璃」）', gplate)
# 层法：这一格**只许一层白**。他 12:5x 纠正的正是"叠两层白"——白纱 .30 叠白 .70＝合成白 .79，
# 真机上等于半块实心卡纸，糊被吃掉。所以这里两头都钉：① 图上与码里都是 `var(--g?-plate)` 单层；
# ② 谁再把 `--glass-veil` 与 `--glass-plate` 叠进同一条 background，直接红。
if jot and gjot and jot_rule:
    cmp('白条 α', f'{float(ga) + .08:.2f}（图上 calc(--ga + .08)）', jot[1], '不换算', '.38')
    cmp('白条 blur', re.search(r'blur\((\d+)px\)', gjot[1])[1],
        re.search(r'blur\((\d+)px\)', jot_rule[1])[1], '46→23 同一条换算 ⇒ 20→10', 10)
else:
    retired.append(('白条那一条皮（α ＋ blur）',
                    'B 方案第三轮把白条整层撤了：首屏右侧换成 Tips ＋ 一枚 ➕，`--glass-jot` 与 '
                    '`.container.has-bg .blk-jot/.blk-strip` 一起退役（定义处留了退役说明）。'
                    '这一片的 2.2 对照归 `docs/工具/验-第一屏三块.js` §3（两片皮的渐变与对比度）。'))
if blk_rule:
    单层 = re.search(r'background:\s*var\(--glass-plate\)\s*;', blk_rule[1])
    单层图上 = re.search(r'background:\s*var\(--g-plate\)\s*;', gblk)
    又叠两层 = re.search(r'linear-gradient\(var\(--glass-veil\)[^;]*\)\s*,\s*linear-gradient\(var\(--glass-plate\)', blk_rule[1])
    rows.append((bool(单层) and bool(单层图上) and not 又叠两层, '三块那一条的层法（只一层白，不许再叠白纱）',
                 '图上＝`background: var(--g-plate)` 单层／码里＝`background: var(--glass-plate)` 单层',
                 '图上' + ('✓' if 单层图上 else '✗') + '／码里' + ('✓' if 单层 else '✗')
                 + ('／⚠又叠回两层了' if 又叠两层 else '／没叠'),
                 '糊由 backdrop-filter 给；再叠一层白纱就是 12:03 那版的错'))
else:
    retired.append(('三块那一条的"白 .50 单层"层法',
                    'B 方案换了那一块的皮：左块不再有一整面 `--glass-plate`，拆成上白面 `.blk-face` '
                    '＋下墨面 `.blk-count` 两片渐变毛玻璃，且是**基础规则**（首屏无条件吃，不再走 '
                    '`.container.has-bg` 覆盖）。"叠两层白"那个坑在新皮上不成立，'
                    '但教训跟着搬：两片各只一层色＋糊，不许再叠。对照归 §3。'))
# 站长 13:0x 又一句「改第二屏面板毛玻璃（三个功能），30变50，与首页一致」⇒ 录入面板那一面也吃这一枚白 .50。
# 两头都要钉：图上 `.g-panel` 与码里 `.container.has-bg .panel` 的 background 都得是各自那枚 plate 令牌，
# 光"值差不多"不算——它要是还吃着 .30 白纱，就是他说的那句"与首页不一致"。
panel_html = one(html, r'(\.g-panel\s*\{[^}]*\})', '效果图 .g-panel')[1]
# create.wxss 里 `.container.has-bg .panel` 有**两条**（442 行那条只管投影、1203 行那条才管玻璃面），
# 取第一条会量到投影那条 ⇒ 假报"还吃着 .30 白纱"。这里挑带 background 的那一条。
panel_code = next((b for b in re.findall(r'\.container\.has-bg \.panel\s*\{([^}]*)\}', cre) if 'background' in b), '')
面板图上 = re.search(r'background:\s*var\(--g-plate\)', panel_html)
面板码里 = re.search(r'background:\s*var\(--glass-plate\)', panel_code)
rows.append((bool(面板图上) and bool(面板码里), '录入面板那一条吃的是哪枚令牌',
             '图上 `.g-panel` ＝ var(--g-plate)',
             '图上' + ('✓' if 面板图上 else '✗') + '／码里' + ('✓ var(--glass-plate)' if 面板码里 else '✗ 还吃着 .30 白纱'),
             '13:0x 那句「30变50，与首页一致」；井与小圆吃 --glass-fill(.20)，不在这一句里'))
cmp('块宽', '308px（图上 .blk-person）', one(cre, r'\.blk-person \{[^}]*width:\s*(\d+)rpx', '落码')[1], '1px＝1rpx', '308')
cmp('块圆角', '34px（图上 .blk-person）', one(cre, r'\.blk-person \{[^}]*border-radius:\s*(\d+)rpx', '落码')[1], '1px＝1rpx', '34')
# ---- 10-11 13:2x R19「切换男孩后，右侧女孩高度太低，要与之前右侧男孩高度一致」----
# 这一格两头都要钉：图上 `.fig-alt` 与码里 `.blk-fig-alt` 都得**按高定、且不再给宽**。
# 按宽定就是被打回的原因：两张源件比例不同（女 0.8314／男 0.6897），同一个 91 宽算出 132 与 109.5 两档高，换人那一下小人矮一截。
fig_html = one(html, r'(\.fig-alt\s*\{[^}]*\})', '效果图 .fig-alt')[1]
fig_code = one(cre, r'(\.blk-fig-alt\s*\{[^}]*\})', 'create.wxss')[1]
cmp('剪影那枚的高（两态同高那一档）', '132px（图上 .fig-alt）',
    one(fig_html, r'height:\s*(\d+)px', '效果图 .fig-alt')[1], '1px＝1rpx', one(fig_code, r'height:\s*(\d+)rpx', '落码 .blk-fig-alt')[1])
rows.append((not re.search(r'\bwidth:', fig_html) and not re.search(r'\bwidth:', fig_code),
             '剪影那枚两头都不许再按宽定',
             '图上 .fig-alt 无 width', '码里 .blk-fig-alt ' + ('有 width ✗' if re.search(r'\bwidth:', fig_code) else '无 width ✓'),
             '按宽定＝换人矮一截，就是他打回的那一态；宽由 heightFix 各自按比例倒算'))

# ---- 类数：效果图自己在 `.g-blk` 那条上面记过那个坑（.g-blk 一个类压不住 .blk-stat.notes 两个类） ----
def cls(s):
    return len(re.findall(r'\.[\w-]+', s.split('{')[0]))


if B2:
    retired.append(('「覆盖那条的类数必须 > 底规则」这两行',
                    '这一条量的是 `.container.has-bg .blk-*` 覆盖 vs `.blk-*` 底规则，而 B 方案把覆盖整层撤了：'
                    '两片皮直接写成基础规则、无条件吃。类数那个坑在新结构里没有对手方。'
                    '改成钉"覆盖层确实撤净了"（下面那一行）。'))
    还留着覆盖 = [s for s in ('.container.has-bg .blk-person', '.container.has-bg .blk-jot',
                              '.container.has-bg .blk-stat', '.container.has-bg .blk-strip')
                  if re.search(re.escape(s) + r'[^{]*\{', cre)]
    rows.append((not 还留着覆盖, '2.2 首屏不再有一条 `.container.has-bg .blk-*` 覆盖',
                 'B 方案：皮无条件吃，覆盖层撤净',
                 '撤净 ✓' if not 还留着覆盖 else '还留着：' + '、'.join(还留着覆盖),
                 '覆盖撤了才有"类数"这一说；留着＝又回到两份真相'))
else:
    for 名, 覆盖, 底 in (('左块', '.container.has-bg .blk-person,', '.blk-person {'),
                         ('白条', '.container.has-bg .blk-jot,', '.blk-jot {')):
        n_cover, n_base = cls(覆盖), cls(底)
        rows.append((n_cover > n_base, f'{名}那一条的类数',
                     '效果图 `.g-blk` 上面那条注释自己记的坑：覆盖必须 > 被覆盖', f'{n_cover} vs 底规则 {n_base}',
                     '覆盖必须严格多于底规则'))

print('  对照＝效果图 CSS 现读 vs 落码现读（换算只有一条：图上 1px＝1rpx≈0.52 真机 px）\n')
if B2:
    print('  ★ 这一份是 2.2（release/2.2）的工作树：首屏＝B 方案深色面板，10-11 那套白 .50 皮已换。\n')
bad = 0
for ok, 项, 图上, 码里, 换算 in rows:
    print(f'  {"✓" if ok else "★"} {项:14s} 图上 {图上:34s} 码里 {码里:22s} {换算}')
    bad += 0 if ok else 1
for 项, 因 in retired:
    print(f'\n  ⚠ 退役｜{项}\n    原因：{因}')
print(f'\n  {"✓ 效果图上这一格还成立的每一个值，落码都对得上" if not bad else f"!! {bad} 条对不上"}'
      + (f'（另有 {len(retired)} 条随 B 方案退役，上面逐条写了归谁）' if retired else ''))
sys.exit(0 if not bad else 1)
