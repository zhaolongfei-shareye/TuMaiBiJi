#!/usr/bin/env python3
# 配套 `探-弹窗玻璃对比度.js`（判据 §三 里那一条"这三枚的量出来再回报，不自己抬 α"）。
# 跑法：python3 docs/工具/量-玻璃面与字.py docs/design/10-11毛玻璃/实测/弹窗.json
#
# 面怎么取：拿**整张弹窗矩形内像素的中位数**——字只占这一格里很小一部分像素，中位数就是
# 那层玻璃合成完的表面色；同时把 p10／p90 打出来，散得太大（＝这块区域被底下的图拉开层次）
# 就在报告里明写"这一枚的面不是一个常数"，不假装它是。
# 字怎么取：探针读回来的**计算色**（含 alpha），按同一条 over() 合成到上面那个面上。
# 判档线只标注、不改代码：WCAG 那两档按换算后的 rpx 判——≥48rpx 且 ≥700 才走 3:1，其余一律 4.5:1。
# （48rpx ≈ 24px CSS＝18pt，正是"大字"那条线；写成 24 会把 12.5px 的小字当成大字放宽门槛。）
#
# ⚠ 截图坐标这一条 10-11 踩过一次，别再踩第二遍：
#   ① `boundingClientRect` 回来的是**视口 px**（这一屏 windowWidth 390），不是 rpx；
#   ② `mp.screenshot` 拍的是**整块屏**，顶上还有状态栏＋导航条那一截，视口原点不在图的第 0 行。
# 第一版把 rect 当 rpx、把图当"宽 750 的等比"来切，切出来的格子落在弹窗外面的暗遮罩上，
# 量出的"面"是 rgb(24,26,31)——数看着像结论，其实是取样框画错了。
# 现在换算只用探针一起带回来的 windowWidth／windowHeight：
#   scale ＝ 图宽 / windowWidth；顶部那一截 ＝ 图高/scale − windowHeight。
import json
import sys
from PIL import Image


def parse(s):
    import re
    m = re.search(r'rgba?\(([^)]+)\)', str(s or ''))
    if not m:
        return None
    p = [float(x) for x in m.group(1).split(',')]
    if len(p) < 3:
        return None
    return {'r': p[0], 'g': p[1], 'b': p[2], 'a': p[3] if len(p) > 3 else 1.0}


def over(fg, bg):
    return {c: fg[c] * fg['a'] + bg[c] * (1 - fg['a']) for c in 'rgb'}


def lum(c):
    def f(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c['r']) + 0.7152 * f(c['g']) + 0.0722 * f(c['b'])


def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def main():
    if len(sys.argv) < 2:
        raise SystemExit('用法：量-玻璃面与字.py <弹窗.json>')
    rows = json.load(open(sys.argv[1]))
    for r in rows:
        print(f'\n{"=" * 62}\n{r["who"]}　（{r["card"]}）')
        if r.get('err'):
            print(f'  !! 探针没开成：{r["err"]}')
            continue
        R, W = r['rect'], r.get('win')
        if not W or not W.get('w') or not W.get('h'):
            print('  !! 探针没带回 windowWidth／windowHeight——没法把视口 px 换成截图像素，'
                  '这一枚的数不作数（别再拿 750 当宽去切）')
            continue
        im = Image.open(f'{sys.argv[1].rsplit("/", 1)[0]}/{r["shot"]}')
        scale = im.width / W['w']
        chrome = im.height / scale - W['h']          # 视口以上那截（状态栏＋导航条）
        box = tuple(round(v * scale) for v in (R['left'], R['top'] + chrome,
                                               R['left'] + R['width'], R['top'] + R['height'] + chrome))
        box = (max(box[0], 0), max(box[1], 0), min(box[2], im.width), min(box[3], im.height))
        g = sorted(im.crop(box).convert('L').getdata())
        med = g[len(g) // 2]
        p10, p90 = g[int(len(g) * .1)], g[int(len(g) * .9)]
        # 表面色要 rgb 三份：拿中位亮度那一档的**实际像素**当代表色，比把灰度回推成 rgb 稳。
        rgbpx = list(im.crop(box).convert('RGB').getdata())
        idx = g.index(med)
        face = {'r': rgbpx[idx][0], 'g': rgbpx[idx][1], 'b': rgbpx[idx][2], 'a': 1.0}
        # 反向钉：弹窗顶上那 8px 是遮罩、不是面。两处中位一样 ⇒ 取样框根本没落在弹窗上，
        # 下面所有对比度全是废数（第一版就是这种情形，只是没人去核）。
        strip = im.crop((box[0], max(box[1] - 10, 0), box[2], max(box[1] - 2, 0))).convert('L')
        sg = sorted(strip.getdata())
        smed = sg[len(sg) // 2] if sg else -1
        print(f'  取样框（截图像素）：{box}　视口 px：top {R["top"]} left {R["left"]} '
              f'{R["width"]}×{R["height"]}　scale {scale:.3f}　顶上那截 {chrome:.0f}px')
        print(f'  面（截图实测）：rgb({face["r"]:.0f}, {face["g"]:.0f}, {face["b"]:.0f})'
              f'　亮度中位 {med}　p10 {p10}／p90 {p90}'
              f'　→ {"这一格的面近似一个常数" if p90 - p10 <= 14 else "⚠ 底下那张图把这格拉开了一档，面不是一个常数"}')
        print(f'  框外上面那 8px（遮罩）中位 {smed}'
              f'　→ {"与面同色：取样框可能没落在弹窗上，下面的数不作数" if abs(smed - med) <= 4 else "与面不同色：框确实压在弹窗那层玻璃上"}')
        print(f'  玻璃声明：background-color {r["veil"]}　backdrop-filter {r["backdropFilter"] or "(读不到)"}'
              f'　渐变 {"有" if "linear-gradient" in str(r.get("backgroundImage") or "") else "无"}')
        for t in r['texts']:
            c = parse(t['color'])
            if not c:
                print(f'  ？ {t["sel"]} 读不到计算色：{t["color"]!r}')
                continue
            comp = over(c, face)
            fs = float((t['fontSize'].replace('px', '') or 0) or 0)
            fs_rpx = round(fs * 750 / W['w'])         # 计算样式是视口 px，档位线说的是 rpx
            big = fs_rpx >= 48 and float(t['fontWeight'] or 400) >= 700
            need = 3.0 if big else 4.5
            k = ratio(comp, face)
            print(f'  {"过" if k >= need else "★不过"} {k:5.2f}:1（门槛 {need}）'
                  f'　{t["sel"]}　{fs_rpx}rpx／{t["fontWeight"]}　「{t["text"]}」'
                  f'　字色合成后 rgb({comp["r"]:.0f}, {comp["g"]:.0f}, {comp["b"]:.0f})')
        print('\n  ⚠ 这一把只报数。α 全站 .30 是他拍的（R10），字色是他 10-04／10-05 拍过的两档，'
              '两处我都不自己动；要抬就单给这三枚抬一档，那一句得他说。')


main()
