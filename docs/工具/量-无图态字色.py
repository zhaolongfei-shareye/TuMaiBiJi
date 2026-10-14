#!/usr/bin/env python3
"""2.1.11 第 0 步（§8.234 那条 P0 前置闸）的判据侧：拿 量-无图态字色-真跑.js 摆出来的
12 个组合（三屏 × 四套壁纸）的截图与 CSS 算出来的字色，量"无图态那几行字读不读得清"。

跑法（先跑真跑那一把，图证与读数才新鲜）：
    MP_ROOT=/Users/zlfmac/Documents/TuMaiBiJi bash docs/工具/跑尺子.sh 9431 量-无图态字色-真跑
    python3 docs/工具/量-无图态字色.py

为什么两样都要：
· 只读 CSS 声明会漏"类名点空 / 简写吃底色 / 被更高优先级吃掉"那一类静默不生效（见 [[改一层皮的八种静默失效]]）；
· 只量截图像素会分不清"字读不清"与"这一格里压根没字"。
所以每条同时出三个数：**CSS 算出来的那支字色**（含 alpha，按量到的底色合成）对**量到的底**的对比度、
**字心灰阶**（那一格里最偏的 8%）、以及**这一格里到底有多少个像素是字**（空盒自检）。

门槛 4.5 沿用 §8.226 那批（不是这一把新起的数）。
"""
import glob
import json
import os
import statistics
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../..'))
OUT = os.path.join(ROOT, 'docs/design/背景图深浅/实测')
JSON = os.path.join(OUT, '无图态读数.json')
CONTRAST_MIN = 4.5      # §8.226 那批的门槛，不另起
GLYPH_MIN_PX = 40       # 这一格里至少要有这么多"是字"的像素，否则盒子是空的（空盒＝红）
GLYPH_STEP = 12         # 离底色超过这一档（0~255 灰阶）才算字，避开抗锯齿的边

def srgb_lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def lum(rgb):
    r, g, b = (srgb_lin(v) for v in rgb[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

def parse_color(s):
    """`rgba(53, 46, 29, 0.72)` / `rgb(33, 36, 49)` → ((r,g,b), alpha)。读不出就整条红，不许猜。"""
    if not s:
        return None
    body = s[s.index('(') + 1:s.rindex(')')]
    parts = [float(p) for p in body.split(',')]
    if len(parts) == 3:
        return (tuple(int(v) for v in parts), 1.0)
    if len(parts) == 4:
        return (tuple(int(v) for v in parts[:3]), parts[3])
    return None

def over(fg, alpha, bg):
    """带 alpha 的字色按量到的底色合成之后的实际像素色——对比度要量这一支，不是令牌原色。"""
    return tuple(round(fg[i] * alpha + bg[i] * (1 - alpha)) for i in range(3))

def main():
    if not os.path.exists(JSON):
        print(f'!! 没有读数文件 {JSON}，先跑：bash docs/工具/跑尺子.sh 9431 量-无图态字色-真跑')
        return 1
    # ⚠ 旧读数会骗人（这一把自己踩过一次：真跑那一把中途挂了、没重写读数，
    #   判据侧拿改**样式之前**那份读数报了一轮"修完还是红"）。
    #   样式或脚本比读数新 ⇒ 这份读数量的不是现在这版界面，直接不判。
    newest_src = max(
        (os.path.getmtime(p), p)
        for pat in ('miniprogram/pages/*/*.wxss', 'miniprogram/*.wxss', 'miniprogram/app.wxss')
        for p in glob.glob(os.path.join(ROOT, pat))
    )
    if newest_src[0] > os.path.getmtime(JSON):
        print(f'!! 读数比样式表旧：{os.path.relpath(newest_src[1], ROOT)} 在读数之后被改过 ⇒ '
              f'这份数量的不是现在这版界面，重跑一次真跑那一把再判')
        return 1
    shots = json.load(open(JSON, encoding='utf-8'))['shots']
    bad, rows = [], []
    for sh in shots:
        png = os.path.join(OUT, sh['png'])
        if not os.path.exists(png):
            bad.append(f"{sh['screen']}×{sh['wallpaper']} 缺图 {sh['png']}")
            continue
        im = Image.open(png).convert('RGB')
        scale = im.width / sh['win']['w']
        top_off = im.height / scale - sh['win']['h']      # 截图顶上那截状态栏＋导航条（视口 px）
        for n in sh['nodes']:
            tag = f"{sh['screen']}×{sh['wallpaper']} {n['name']}"
            if n.get('missing'):
                bad.append(f'{tag}：屏上读不到这一枚（{n["sel"]}）＝量具对不上界面')
                continue
            # 真跑那一把还捎带记了"无图态本该消失的那几枚"（档＝gone，读不到才对）。
            # 它们没有几何（屏上压根没这一枚），不参与对比度。
            if 'x' not in n:
                continue
            x0 = max(0, int(round(n['x'] * scale)))
            y0 = max(0, int(round((top_off + n['y']) * scale)))
            x1 = min(im.width, x0 + max(1, int(round(n['w'] * scale))))
            y1 = min(im.height, y0 + max(1, int(round(n['h'] * scale))))
            box = list(im.crop((x0, y0, x1, y1)).getdata())
            gray = sorted(0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2] for p in box)
            face = gray[len(gray) // 2]                                  # 底＝中位（字只占一小撮）
            cut = gray[int(len(gray) * 0.08)], gray[int(len(gray) * 0.92)]
            dark_n = sum(1 for g in gray if g <= face - GLYPH_STEP)
            light_n = sum(1 for g in gray if g >= face + GLYPH_STEP)
            core, glyph_n = (cut[0], dark_n) if dark_n >= light_n else (cut[1], light_n)
            pc = parse_color(n.get('color'))
            if pc is None:
                bad.append(f'{tag}：CSS 字色读不出（{n.get("color")!r}）')
                continue
            ink, alpha = pc
            eff = over(ink, alpha, (face, face, face))
            r = ratio(eff, (face, face, face))
            pol = '墨' if lum(eff) < 0.5 else '纸白'
            rows.append((tag, n['text'], f'底{face:.0f}', f'字心{core:.0f}', f'{pol}#{eff[0]:02X}{eff[1]:02X}{eff[2]:02X}',
                         f'{r:.2f}', f'{glyph_n}px'))
            if glyph_n < GLYPH_MIN_PX:
                bad.append(f'{tag}：这一格里只有 {glyph_n} 个"是字"的像素（门槛 {GLYPH_MIN_PX}）'
                           f'＝空盒或字与底同色，对比度 {r:.2f} 不算成立')
            elif r < CONTRAST_MIN:
                bad.append(f'{tag}：对比度 {r:.2f} < {CONTRAST_MIN}（底 {face:.0f}、{pol} {n["color"]}）')
    w = max((len(t) for t, *_ in rows), default=10)
    for t, txt, face, core, eff, r, gpx in rows:
        print(f'  {t:<{w}}  {face} {core} {eff} 对比 {r} 字面 {gpx}  字「{txt}」')
    # 「该消失却没消失」那一半不在这里判：真跑那一把对活着的 gone 枚根本不写进读数
    # （它自己报 notGone 并以退出码 1 收），到这里还出现 kind=='gone' 的条目就只能是"没渲染"。
    gone = sorted({f"{s['screen']}的「{n['name']}」" for s in shots for n in s['nodes']
                   if n.get('kind') == 'gone' and 'x' not in n})
    if gone:
        print('随图一起消失的那几枚（§8.231 撤一个状态的代价）：' + '；'.join(gone))
    print(f'\n{"!! " + str(len(bad)) + " 条红（共量 " + str(len(rows)) + " 枚）" if bad else "全过：" + str(len(rows)) + " 枚字，无图态对比度都 ≥" + str(CONTRAST_MIN)}')
    for b in bad:
        print('   ✗ ' + b)
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
