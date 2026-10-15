#!/usr/bin/env python3
# 生成「顶上那一条跟谁走」＋「墨档那两块怎么浮起来」两条待拍的对比效果图（站长 10-15：「生成效果图，我才决策」）。
#
# 口径三条，都对着代码取，不在这个文件里手抄任何一枚色值或尺寸：
#   · 五档的 `--stage-face`／`--stage-ink-solid`／`--sh-lift` 整串从 `app.wxss` 抠出来原样用；
#   · 面板顶线 548rpx、带高 240rpx 从 `pages/create/create.wxss` 与令牌里现读；
#   · 导航条现在那两枚硬编码（#f2efe9／#181a20）从 `app.js` 现读；页面底色从 `utils/palette.js` 的 THEMES 现读。
# 屏高不猜：拿上一轮真跑那张截图（734×1588）现算一 rpx 多少像素、整屏多少 rpx。
# 源图用现网那张真背景图（`/tmp/live-bg.jpg`，服务器 `var/mp-assets/45f6f8f4….jpg` 那份，就是 asset_id=2）。
#
# 跑法：python3 docs/design/10-15风格统一/生成-顶上一条与面板浮起.py
#       → 出 HTML，再自己叫 headless Chrome 截成 PNG（脚本末尾把那两行命令打出来）
import re, json, subprocess, sys, os
import numpy as np
from PIL import Image

ROOT = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=os.path.dirname(os.path.abspath(__file__))).decode().strip()
WXSS = open(f'{ROOT}/miniprogram/app.wxss').read()
CREATE = open(f'{ROOT}/miniprogram/pages/create/create.wxss').read()
APPJS = open(f'{ROOT}/miniprogram/app.js').read()
PAL = open(f'{ROOT}/miniprogram/utils/palette.js').read()
REF = f'{ROOT}/docs/design/10-14五档彩色玻璃/实测/档1-墨.png'
BG = '/tmp/live-bg.jpg'
OUTDIR = f'{ROOT}/docs/design/10-15风格统一'
os.makedirs(OUTDIR, exist_ok=True)

# ---- 一屏的几何：全部现算 ----
W0, H0 = Image.open(REF).size
px_per_rpx = W0 / 750.0
SCREEN_RPX = round(H0 / px_per_rpx)          # 整屏高（含状态条＋导航条）
TOP_RPX = float(re.search(r'\.stage-panel\s*\{[^}]*?top:\s*calc\(100vh\s*-\s*(\d+)rpx\)', CREATE, re.S).group(1))
NAV_RPX = 176.0                                # 状态条 88 ＋ 导航条 88（微信默认两截，iPhone X 型）
VH_RPX = SCREEN_RPX - NAV_RPX                  # 页面那 100vh
PANEL_TOP = int(round(NAV_RPX + VH_RPX - TOP_RPX))
band = re.search(r'--stage-face:.*?(\d+(?:\.\d+)?)%\s*43\.8', WXSS)

# ---- 五档令牌：整串抠出来原样贴回 CSS ----
moods = []
for m in re.finditer(r'\.mood-(\w+)\s*\{([^}]*)\}', WXSS):
    key, body = m.group(1), m.group(2)
    g = lambda pat: (re.search(pat, body) or re.search(pat, WXSS)).group(0)
    moods.append({
        'key': key,
        'face': g(r'--stage-face: linear-gradient\([^;]*\)') .split(':', 1)[1].strip().rstrip(';'),
        'ink': re.search(r'--stage-ink-solid:\s*([^;]+)', body).group(1).strip(),
        'band_alpha': float(re.search(r'--glass-veil-band:\s*rgba\([^)]*?([\d.]+)\)', body).group(1)),
    })
SH_LIFT = re.search(r'--sh-lift:\s*([^;]+)', WXSS).group(1).strip()
NAV_LIGHT = re.findall(r"backgroundColor:\s*'(#[0-9a-f]{6})'", APPJS)
u = lambda css: css.replace('rpx', 'px')   # 画布定的是 1rpx＝1px，但 CSS 不认 rpx 这个单位
# palette 里那四枚 page 全是大写十六进制，字符类只写小写就是一条都不中（10-15 撞过一次）。
PAGE = re.search(r"key: 'tint-paper'[^}]*?page:\s*'(#[0-9a-fA-F]{6})'", PAL, re.S).group(1)
if len(NAV_LIGHT) != 2:
    sys.exit(f'app.js 里导航条那两枚应当正好读到 2 枚，实际 {NAV_LIGHT}')
NAV_NOW_LIGHT, NAV_NOW_DARK = NAV_LIGHT[0], NAV_LIGHT[1]

def solid_of(face, over_l):
    """把那条渐变"走完之后"那一档（末尾 .95 实心）压在一个亮度为 over_l 的底上，混成实心 hex。"""
    rgba = re.findall(r'rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)', face)[-1]
    r, g, b, a = [float(x) for x in rgba]
    out = []
    for c in (r, g, b):
        bg = over_l * (255.0 / 255.0) if over_l > 1 else over_l
        out.append(round(c * a + float(over_l) * (1 - a)))
    return '#%02x%02x%02x' % tuple(max(0, min(255, v)) for v in out), round(a, 2)

page_l = float(np.mean(np.asarray(Image.new('L', (1, 1), 0), dtype=float)))  # 占位，下面按 hex 现算
def hex_l(h):
    arr = np.array([[int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)]], dtype=float)
    return float(arr.mean())
def img_l(p):
    a = np.asarray(Image.open(p).convert('L'), dtype=float)
    return float(a.mean())
PAGE_L, BG_L = hex_l(PAGE), img_l(BG)

# 甲＝顶上一条跟着该档面板皮（有图无图都跟）；乙＝只有铺图那一态跟，无图态维持现网浅底。
def nav_for(mode, mk, has_bg):
    m = moods[mk]
    face_solid, _ = solid_of(m['face'], BG_L if has_bg else PAGE_L)
    if mode == 'now':
        return (NAV_NOW_DARK, '#fff') if has_bg else (PAGE, '#000')
    if mode == 'yi' and not has_bg:
        return (PAGE, '#000')
    ink_dark = hex_l(m['ink']) < 128
    return (face_solid, '#000' if ink_dark else '#fff')

def phone(mode, mk, has_bg, label, note):
    m = moods[mk]
    bg = f'<img class="photo" src="file://{BG}">' if has_bg else ''
    nb, ni = nav_for(mode, mk, has_bg)
    return f'''<div class="cell"><div class="cap"><b>{label}</b><span>{note}</span></div>
<div class="frame"><div class="phone" style="height:{SCREEN_RPX}px">
  {bg}
  <div class="page" style="background:{'transparent' if has_bg else PAGE}"></div>
  <div class="panel" style="top:{PANEL_TOP}px;background-image:{m['face']};box-shadow:{u(SH_LIFT)}"></div>
  <div class="nav" style="height:{NAV_RPX}px;background:{nb};color:{ni}"><i></i><em>图麦笔记</em></div>
</div></div></div>'''

def strip(mk, kind, label, note):
    """面板上沿那一条的放大特写（750 宽 × 320 高，线放在中间 200）。"""
    m = moods[mk]
    y = 200          # 上沿放在特写窗第 200px；面板本体照现网那一枚 548rpx 高，不缩
    sh = u(SH_LIFT)
    hair = ''
    if kind == 'jia':
        sh = '0 -12px 28px rgba(8, 10, 14, 0.42)'
    if kind == 'yi':
        hair = 'border-top:2px solid rgba(255,255,255,.30)'
    if kind == 'bing':
        sh = '0 -12px 28px rgba(8, 10, 14, 0.42)'
        hair = 'border-top:2px solid rgba(255,255,255,.30)'
    return f'''<div class="cell2"><div class="cap"><b>{label}</b><span>{note}</span></div>
<div class="frame2"><div class="strip">
  <img class="photo2" src="file://{BG}">
  <div class="panel2" style="top:{y}px;background-image:{m['face']};box-shadow:{sh};{hair}"></div>
</div></div></div>'''

PANEL_H = int(200 + TOP_RPX)   # 特写窗高＝上沿以上留 200 ＋ 面板本体那一枚 548rpx（现网同一枚高，不缩）
cells = [
    phone('now', 0, True, '现网·墨档（有图）', '导航条＝写死那枚 #181a20'),
    phone('jia', 0, True, '甲·墨档（有图）', '导航条＝该档面板皮混出来的实心'),
    phone('yi', 0, True, '乙·墨档（有图）', '有图这一态与甲同值'),
    phone('now', 1, True, '现网·象牙（有图）', '同一条 #181a20，跟档无关'),
    phone('jia', 1, True, '甲·象牙（有图）', '顶上一条跟着这档的皮走'),
    phone('yi', 1, True, '乙·象牙（有图）', '只有图时跟档'),
    phone('jia', 0, False, '甲·墨档（没铺图）', '⚠ 这一态从浅底变成深面，动的是 10-01 认过的默认态'),
    phone('yi', 0, False, '乙·墨档（没铺图）', '没铺图维持现网浅底'),
]
strips = [
    strip(0, 'now', '现网·墨档', f'投影＝{SH_LIFT}（实测只压暗 13 灰阶，读不出）'),
    strip(0, 'jia', '甲·投影抬深', '同一枚形状，alpha .16→.42'),
    strip(0, 'yi', '乙·顶沿一枚亮线', '投影不动，加 2rpx 亮细线'),
    strip(0, 'bing', '丙·两者都上', '抬深＋亮细线'),
    strip(1, 'now', '对照·象牙（现网）', '彩色四档本来就读得出这一条'),
]

html = f'''<!doctype html><meta charset="utf-8"><style>
*{{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,"PingFang SC",sans-serif}}
body{{background:#F2EFE9;padding:28px;width:3960px}}
h1{{font:700 34px/1.3 sans-serif;margin:6px 0 4px}}
h2{{font:700 26px/1.3 sans-serif;margin:34px 0 12px;color:#14161A}}
.sub{{font:14px/1.6 sans-serif;color:#5b5b5b;margin-bottom:10px}}
.row{{display:flex;gap:18px;align-items:flex-start}}
.cell{{width:470px}}
.cell2{{width:620px}}
.frame{{width:465px;height:1008px;overflow:hidden}}
.frame2{{width:600px;height:{int((200+PANEL_H-200)*0.8)}px;overflow:hidden}}
.cap{{font:700 17px/1.4 sans-serif;margin:0 0 6px}}
.cap span{{display:block;font:400 13px/1.5 sans-serif;color:#6a6a6a}}
.phone{{transform:scale(.62);transform-origin:0 0;position:relative;width:750px;overflow:hidden;border:1px solid #cfc9bd;border-radius:26px;background:#fff}}
.photo{{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover}}
.page{{position:absolute;left:0;top:{NAV_RPX}px;right:0;bottom:0}}
.panel{{position:absolute;left:0;right:0;bottom:0;border-radius:40px 40px 0 0;backdrop-filter:blur(30px) saturate(1.15)}}
.nav{{position:absolute;left:0;right:0;top:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:14px;font-size:17px;font-weight:600}}
.nav i{{position:absolute;left:26px;bottom:16px;width:52px;height:22px;border-radius:11px;background:currentColor;opacity:.22}}
.strip{{transform:scale(.8);transform-origin:0 0;position:relative;width:750px;height:{PANEL_H}px;overflow:hidden;border:1px solid #cfc9bd}}
.photo2{{position:absolute;left:0;top:0;width:100%;height:{PANEL_H}px;object-fit:cover;object-position:center 62%}}
.panel2{{position:absolute;left:0;right:0;top:200px;bottom:0;backdrop-filter:blur(30px) saturate(1.15)}}
.note{{font:13px/1.7 sans-serif;color:#3a3a3a;margin-top:16px;max-width:1500px}}
</style>
<h1>顶上那一条跟谁走 ＋ 墨档那两块怎么浮起来 —— 示意图（CSS 画的，不是真截图）</h1>
<div class="sub">源图＝现网那张真背景图（asset_id=2，1277×1781，平均亮度 {BG_L:.1f}）｜屏 {750}×{SCREEN_RPX}rpx（拿上一轮真跑截图现算）｜面板顶线 {TOP_RPX:.0f}rpx＝屏高−548，落在第 {PANEL_TOP}px｜五档渐变与 {SH_LIFT} 整串从 app.wxss 原样贴回｜一 rpx＝1px</div>
<h2>① 顶上那一条（导航条）</h2>
<div class="row">{''.join(cells)}</div>
<h2>② 墨档那两块的浮起（面板上沿放大特写）</h2>
<div class="row">{''.join(strips)}</div>
<div class="note">读数（上一轮真跑五张实测图量出来的，同一枚投影落在五档上沿那一条）：上沿外 L＝229.5（<b>五档全同一个值</b>）｜上方没被压到的底 L＝242.5 ⇒ 投影只压暗 <b>13 灰阶</b>；面板本体 L＝墨 46.5／象牙 164／天青 171／樱落 178／雨雾 177 ⇒ "上沿外−面板"的差：墨档 <b>183</b>、彩色四档 51～65。所以墨档不是漏写阴影，是那 13 点被 183 点的落差整个吃掉。</div>
'''
p = f'{OUTDIR}/顶上一条与面板浮起.html'
open(p, 'w').write(html)
print(json.dumps({'html': p, 'SCREEN_RPX': SCREEN_RPX, 'PANEL_TOP': PANEL_TOP, 'BG_L': round(BG_L, 1),
                  'PAGE_L': round(PAGE_L, 1), 'sh_lift': SH_LIFT, 'nav_now': [NAV_NOW_LIGHT, NAV_NOW_DARK], 'page': PAGE},
                 ensure_ascii=False, indent=1))
print(f'\n截图命令：\n  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --screenshot="{OUTDIR}/效果图-顶上一条与面板浮起.png" --window-size=3260,2100 --force-device-scale-factor=1 --default-background-color=00000000 "file://{p}"')
