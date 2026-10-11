#!/usr/bin/env python3
# 读 `探-玻璃深浅.js` 那两张图，把站长那句「毛玻璃明显过深」拆成两笔可核对的账：
#   ① 罩层那一档压掉多少（他 10-10 拍的默认档＝半月 .5）
#   ② 白纱本身抬/压多少（他拍的 .30，这一格不许我动）
# 跑法：python3 docs/工具/量-玻璃深浅.py
# ⚠ 这一把**不是判据**，没有门槛、不判红——它只出数。判据是 §三那八条，深浅这一格他还没拍过数。
import json
import os
import sys
from PIL import Image
import numpy as np

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../design/10-11毛玻璃/实测')


def patch(im, rect, win):
    """rect 是**视口 px**；截图拍的是整块屏（顶上还有状态栏＋导航条），所以要先换比例、再补顶上那截。"""
    scale = im.width / win['w']
    chrome = im.height / scale - win['h']
    x, y, w, h = rect
    a = np.asarray(im.convert('L'), dtype=float)
    x0, y0 = max(0, int(round(x * scale))), max(0, int(round((y + chrome) * scale)))
    x1, y1 = min(a.shape[1], x0 + int(round(w * scale))), min(a.shape[0], y0 + int(round(h * scale)))
    if x1 - x0 < 8 or y1 - y0 < 3:
        raise SystemExit(f'!! 取样框只有 {x1 - x0}×{y1 - y0} 像素，取不到统计量（坐标或视口数不对）')
    return a[y0:y1, x0:x1]


def main():
    rows = json.load(open(f'{OUT}/深浅.json'))
    print(f'  {len(rows)} 趟；换算用 windowWidth／windowHeight（截图顶上那截＝状态栏＋导航条）')
    got = {}
    for r in rows:
        p = f'{OUT}/{r["file"]}'
        if not os.path.exists(p):
            print(f'  !! 缺 {p}，这一档没数')
            continue
        im = Image.open(p)
        g, s = patch(im, r['glass'], r['win']), patch(im, r['scrim'], r['win'])
        if np.percentile(g, 5) >= 245 or g.mean() >= 250:
            raise SystemExit(f'!! {p} 玻璃那一块整片是纯白＝这一帧根本没画图（10-11 P0 那一种），数不作数')
        key = '0' if r['file'].endswith('-0.png') else '1'
        if key not in got:
            got[key] = (float(np.median(g)), float(np.median(s)), r['档'])
        print(f'  {r["档"]}（data 读回＝{r.get("scrimNode")}）：'
              f'玻璃带中位 {np.median(g):5.1f}　卡顶以上那条（只有罩层）中位 {np.median(s):5.1f}')
    if '1' in got and '0' in got:
        if got['1'] == got['0']:
            raise SystemExit('!! 两趟四位数一模一样＝这一把没牙（探针没真的拨到那一层），数不报')
        d_g = got['0'][0] - got['1'][0]
        d_s = got['0'][1] - got['1'][1]
        print(f'\n  ⇒ 默认那一档 vs 罩层＝0，同一位置同一张图，玻璃带差 **{d_g:.0f}** 灰阶'
              f'（默认 {got["1"][0]:.0f} 比满月 {got["0"][0]:.0f} {"暗" if d_g > 0 else "亮"}）——唯一的变量就是那枚 opacity')
        print(f'  ⇒ 同一条罩层带（没有白纱）差 **{d_s:.0f}** 灰阶＝那一档本身压掉的量')
        print(f'  ⇒ 满月那一趟玻璃带是 {got["0"][0]:.0f}＝"白纱 .30 压在这张原图上"落成的浅底——那一格是他拍的数，我没动、也不该由我动')
    print('\n  口径：数＝取样框内 8 位灰阶**中位数**（躲字、躲发丝线）；两张都是模拟器 390×753 视口。')
    print('  ⚠ 这一把证不了"深不深"，只证"深多少、来自哪一层"。要改哪一层，是他那一格的决定。')


main()
