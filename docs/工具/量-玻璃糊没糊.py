#!/usr/bin/env python3
# 判据 8（需求清单-10-11毛玻璃 §三.8，站长 10-11 拍甲时原话「新图没问题，直接落地甲」，
# 而甲的定义里包含"落前先跑 blur 实测"）：毛玻璃到底糊没糊，**不靠看**，
# 拿同一块画面在"带 blur / 不带 blur"两张截图上的**细节能量**对比来判。
#
# 为什么不做成"玻璃内 std 对玻璃外 std"那一版：玻璃内外是同一张照片上错开一百多 rpx 的
# 两块内容，画面本身粗细节就不一样，比值天然漂；那种比法只能看个大概，撑不起"糊没糊"这句话。
# 改成同位 A/B：唯一的变量就是那一条 `backdrop-filter`，别的像素一个字没动。
#
# 用法（推荐这一条）：python3 docs/工具/量-玻璃糊没糊.py A-列表.png B-列表.png --ab <AB.json> --who 列表 --ref auto
#   AB.json 由 `拍-玻璃AB.js` 的 A 那一趟写：里面是"玻璃那一段"和"玻璃外的对照区"两块矩形，
#   存的是**视口 px** ＋ windowWidth／windowHeight，这把脚本自己换算成截图像素（顶上那截它补）。
# 手动那条：--rect x,y,w,h [--ref x,y,w,h]，单位是"从**截图左上角**量的 rpx"（1rpx＝图宽/750 像素）。
#   ⚠ 别把样式表里那些 rpx 原样填进来：那些数是从视口顶量的，截图顶上还有一截状态栏＋导航条。
#
# 出数怎么读（三条一起看，少一条都不算证明）：
#   ① rect 的 Laplacian 方差比值 << 1 ⇒ 玻璃里那份细节被抹掉了＝糊住了；≈1 ⇒ blur 没生效。
#   ② rect 的 std 比值同向（糊了会更平）。
#   ③ ref 的比值必须 ≈ 1：不然这两张不是同一屏，①②的数全是假的。
import argparse
from PIL import Image


def patch_px(img, x, y, w, h):
    box = tuple(round(v) for v in (x, y, x + w, y + h))
    return img.crop(box)


def stats(im):
    import numpy as np
    g = np.asarray(im.convert('L'), dtype=float)
    if g.shape[0] < 5 or g.shape[1] < 5:
        raise SystemExit(f'!! 这块太小（{g.shape}），Laplacian 没法算')
    lap = (g[1:-1, :-2] + g[1:-1, 2:] + g[:-2, 1:-1] + g[2:, 1:-1] - 4 * g[1:-1, 1:-1])
    return {'mean': g.mean(), 'std': g.std(), 'lapvar': float(lap.var())}


def parse_rect(s):
    v = [float(p) for p in s.split(',')]
    if len(v) != 4:
        raise SystemExit('!! --rect/--ref 要四个数：x,y,w,h（单位 rpx）')
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('a')
    ap.add_argument('b')
    ap.add_argument('--ab', default='', help='AB.json（`拍-玻璃AB.js` 写的），配合 --who 用；坐标从那里现读')
    ap.add_argument('--who', default='', help='AB.json 里那一屏的名字：列表／我的')
    ap.add_argument('--rect', default='', help='手动给的一块：x,y,w,h（从**截图左上角**量的 rpx）')
    ap.add_argument('--ref', default='', help='手动给的对照块，同上')
    ap.add_argument('--note', default='')
    a = ap.parse_args()
    ia, ib = Image.open(a.a), Image.open(a.b)
    print(f'A＝{a.a}  {ia.size}')
    print(f'B＝{a.b}  {ib.size}')
    if ia.size != ib.size:
        raise SystemExit('!! 两张尺寸不一样＝不是同一屏同一个视口，这两张不能对判（先看是不是换了机型/换了缩放）')
    if a.note:
        print(f'备注：{a.note}')

    # 两种给坐标的路，最后都换成"截图像素"这一块矩形：
    #   --ab/--who：AB.json 存的是**视口 px**，这里按 windowWidth 换比例、按 windowHeight 补上
    #               顶上那截（状态栏＋导航条）——截图拍的是整块屏，视口原点不在图的第 0 行。
    #   --rect：自己按"从图左上角量的 rpx"给（1rpx＝图宽/750 像素），脚本不知道视口那截，别拿 rpx 原文填。
    def from_ab(key):
        import json
        e = json.load(open(a.ab))[a.who]
        if not e.get(key):
            raise SystemExit(f'!! AB.json 里 {a.who} 没有 {key} 这一块（取图那一趟没量到节点？数不作数）')
        win = e['win']
        scale = ia.width / win['w']
        chrome = ia.height / scale - win['h']
        x, y, w, h = e[key]
        print(f'  换算：windowWidth {win["w"]}／windowHeight {win["h"]}　scale {scale:.3f}　顶上那截 {chrome:.0f}px')
        return [x * scale, (y + chrome) * scale, w * scale, h * scale]

    def from_rpx(s, name):
        x, y, w, h = parse_rect(s)
        R = ia.width / 750.0
        return [x * R, y * R, w * R, h * R]

    if a.ab and a.who:
        glass, ref = from_ab('glass'), (from_ab('ref') if a.ref == 'auto' else None)
        gname, rname = f'AB.json:{a.who}.glass', f'AB.json:{a.who}.ref'
    elif a.rect:
        glass, ref = from_rpx(a.rect, 'rect'), (from_rpx(a.ref, 'ref') if a.ref else None)
        gname, rname = f'{a.rect} rpx', a.ref
    else:
        raise SystemExit('!! 要么给 --ab + --who（推荐），要么给 --rect；两样都没有就没法量')

    sa, sb = stats(patch_px(ia, *glass)), stats(patch_px(ib, *glass))
    print(f'\n玻璃那一块 {gname} → 截图像素 {tuple(round(v) for v in glass)}')
    for name, s in (('A 带 blur', sa), ('B 不带', sb)):
        print(f'  {name}：均值 {s["mean"]:7.2f}  std {s["std"]:6.2f}  Laplacian方差 {s["lapvar"]:9.1f}')
    rl = sa['lapvar'] / sb['lapvar']
    rs = sa['std'] / sb['std']
    print(f'  比值：Laplacian {rl:.3f}　std {rs:.3f}　⇒ A 的细节能量比 B 少 {(1 - rl) * 100:.0f}%')
    print(f'  判读：{"滤镜确实吃到了画面＝糊住了" if rl < 0.9 else "基本没差＝blur 没生效，这一屏的玻璃是块白纱"}'
          f'　（0.9 这条线是我定的分档，不是站长拍的；他拍的是"落前先跑 blur 实测"这件事本身）')
    print('  ⚠ 玻璃上的**字**本来就不吃 backdrop-filter（它只糊背后），字密的那一条带会把比值往 1 拉；'
          '要看纯底的效果得另取无字那一截，别拿被字占满的那一条判"没糊"。')
    if ref:
        qa, qb = stats(patch_px(ia, *ref)), stats(patch_px(ib, *ref))
        qr = qa['lapvar'] / qb['lapvar']
        print(f'\n对照组 {rname} → 截图像素 {tuple(round(v) for v in ref)}（玻璃外面那一段）')
        print(f'  A Laplacian {qa["lapvar"]:9.1f}　B {qb["lapvar"]:9.1f}　比值 {qr:.3f}'
              f'　→ {"≈1，这两张除玻璃外没差别，上面那条数可信" if 0.8 < qr < 1.25 else "离 1 太远：这两张不是同一屏，上面全部作废"}')
    print('\n⚠ 这一把判的是"糊没糊"这一件事。字压在玻璃上读不读得清是**对比度**那条'
          '（`探-数字对比度` 与 §三.1～.3），两把尺子不许互相代替。')


main()
