#!/usr/bin/env python3
# 站长 10-11 10:0x 定的一条规矩：**做完必须对照效果图，否则不验收**。
#   他给的原话：「file:///Users/zlfmac/Documents/TuMaiBiJi/docs/design/10-11毛玻璃/毛玻璃-效果图.html，
#   这是你出的效果图，你做完必须对照，否则不验收」
# 这一把就是那条"对照"落成的可复跑工具：效果图 CSS 里的每一个值，与落码里的值，逐条摆一起比。
# 换算只有一条：图上 1px＝1rpx，而 1rpx≈0.52 真机 px（390 视口 ÷ 750），所以 blur 46→23、20→10、内环 2px→2rpx。
# 跑法：python3 docs/工具/对照-效果图与落码.py      （对不上即退出码 1）
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


def num(s):
    """把 '.30' / '0.3' / '30%' 这类统一成浮点，比较只看数，不看写法。"""
    return float(str(s).strip().rstrip('%'))


rows = []


def cmp(项, 图上, 码里, 换算, 期望):
    try:
        ok = abs(num(码里) - num(期望)) < 1e-9 if isinstance(num(码里), float) else False
    except ValueError:
        ok = str(码里).strip() == str(期望).strip()
    rows.append((ok, 项, 图上, 码里, 换算))


# ---- 效果图那两条规则（首页三块＝`.g-blk`，白条＝`.g-jot`；**按选择器定位，不写行号**，行号一漂就假红） ----
ga = one(html, r'--ga:\s*(\.?[\d.]+)', '效果图')[1]
mb = one(html, r'--g-blur:\s*blur\((\d+)px\)\s*saturate\(([\d.]+)\)', '效果图')
gblur_v, gblur_s = mb[1], mb[2]
gblk = one(html, r'(\.blk-person\.g-blk[^{]*\{[^}]*\})', '效果图 .g-blk')[1]
gjot = one(html, r'(\.g-jot\s*\{[^}]*\})', '效果图 .g-jot')[1]
gplate = one(html, r'--g-plate:\s*rgba\(255,\s*255,\s*255,\s*([\d.]+)\)', '效果图 --g-plate')[1]

veil = one(app, r'--glass-veil:\s*rgba\(255,\s*255,\s*255,\s*([\d.]+)\)', 'app.wxss')[1]
mb2 = one(app, r'--glass-bf:\s*blur\((\d+)px\)\s*saturate\(([\d.]+)\)', 'app.wxss')
bf_v, bf_s = mb2[1], mb2[2]
hair = one(app, r'--glass-hair:\s*rgba\(255,\s*255,\s*255,\s*([\d.]+)\)', 'app.wxss')[1]
jot = one(app, r'--glass-jot:\s*rgba\(255,\s*255,\s*255,\s*([\d.]+)\)', 'app.wxss')[1]
plate = one(app, r'--glass-plate:\s*rgba\(255,\s*255,\s*255,\s*([\d.]+)\)', 'app.wxss')[1]
jot_rule = one(cre, r'(\.container\.has-bg \.blk-jot,\s*\.container\.has-bg \.blk-strip\s*\{[^}]*\})', 'create.wxss')[1]
blk_rule = one(cre, r'(\.container\.has-bg \.blk-person,[^}]*\})', 'create.wxss')[1]

cmp('白纱 α', f'.{ga}', veil, '图上＝码里（他在校准条上点的 .30）', ga)
cmp('大面 blur', f'{gblur_v}px', bf_v, '图上 1px＝1rpx≈0.52 真机 px ⇒ 46→23', int(gblur_v) / 2)
cmp('大面 saturate', gblur_s, bf_s, '不换算，照抄', gblur_s)
cmp('白内环 α', one(gblk, r'inset 0 0 0 2px rgba\(255, 255, 255, (\.?[\d.]+)\)', '.g-blk')[1], hair, '不换算', one(gblk, r'inset 0 0 0 2px rgba\(255, 255, 255, (\.?[\d.]+)\)', '.g-blk')[1])
cmp('白条 α', f'{float(ga) + .08:.2f}（图上 calc(--ga + .08)）', jot, '不换算', '.38')
cmp('白条 blur', one(gjot, r'blur\((\d+)px\)', '.g-jot')[1], one(jot_rule, r'blur\((\d+)px\)', '落码')[1], '46→23 同一条换算 ⇒ 20→10', 10)
cmp('白底 α（10-11 12:5x 他点名的那一档）', gplate, plate, '不换算（他原话「100%白色，半透明50%，也变成毛玻璃」）', gplate)
# 层法：这一格**只许一层白**。他 12:5x 纠正的正是"叠两层白"——白纱 .30 叠白 .70＝合成白 .79，
# 真机上等于半块实心卡纸，糊被吃掉。所以这里两头都钉：① 图上与码里都是 `var(--g?-plate)` 单层；
# ② 谁再把 `--glass-veil` 与 `--glass-plate` 叠进同一条 background，直接红。
单层 = re.search(r'background:\s*var\(--glass-plate\)\s*;', blk_rule)
单层图上 = re.search(r'background:\s*var\(--g-plate\)\s*;', gblk)
又叠两层 = re.search(r'linear-gradient\(var\(--glass-veil\)[^;]*\)\s*,\s*linear-gradient\(var\(--glass-plate\)', blk_rule)
rows.append((bool(单层) and bool(单层图上) and not 又叠两层, '三块那一条的层法（只一层白，不许再叠白纱）',
             '图上＝`background: var(--g-plate)` 单层／码里＝`background: var(--glass-plate)` 单层',
             '图上' + ('✓' if 单层图上 else '✗') + '／码里' + ('✓' if 单层 else '✗')
             + ('／⚠又叠回两层了' if 又叠两层 else '／没叠'),
             '糊由 backdrop-filter 给；再叠一层白纱就是 12:03 那版的错'))
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

# ---- 类数：效果图自己在 `.g-blk` 那条上面记过那个坑（.g-blk 一个类压不住 .blk-stat.notes 两个类） ----
def cls(s):
    return len(re.findall(r'\.[\w-]+', s.split('{')[0]))


for 名, 覆盖, 底 in (('左块', '.container.has-bg .blk-person,', '.blk-person {'),
                     ('白条', '.container.has-bg .blk-jot,', '.blk-jot {')):
    n_cover, n_base = cls(覆盖), cls(底)
    rows.append((n_cover > n_base, f'{名}那一条的类数',
                 '效果图 `.g-blk` 上面那条注释自己记的坑：覆盖必须 > 被覆盖', f'{n_cover} vs 底规则 {n_base}', '覆盖必须严格多于底规则'))

print('  对照＝效果图 CSS 现读 vs 落码现读（换算只有一条：图上 1px＝1rpx≈0.52 真机 px）\n')
bad = 0
for ok, 项, 图上, 码里, 换算 in rows:
    print(f'  {"✓" if ok else "★"} {项:14s} 图上 {图上:34s} 码里 {码里:22s} {换算}')
    bad += 0 if ok else 1
print(f'\n  {"✓ 效果图上这一格的每一个值，落码都对得上" if not bad else f"!! {bad} 条对不上"}')
sys.exit(0 if not bad else 1)
