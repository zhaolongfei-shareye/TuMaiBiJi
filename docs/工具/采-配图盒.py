#!/usr/bin/env python3
# 截图里那一枚枚配图的像素读数（配合 探针-列表配图真图渲染.js 用）。
# 用法：python3 采-配图盒.py <截图.png> '<框的 JSON：[{x,y,w,h,src}]，单位 rpx>' <输出目录>
#
# 为什么不能拿"方差最大"去搜竖向偏移（上一版就是这么错的）：文字笔画的方差比照片还大，
# 一搜就锁到标题那一行上，采到的"花"是字不是图，红得莫名其妙。
# 现在改成拿**每张照片自己的平均色**当锚：在整张截图上沿竖直方向滑，找与源图均色最接近的那一格。
# 这样一次同时证两件事——① 那个位置真画了图；② 画的就是**注入的那一张**（不是缓存里的另一张）。
import sys, json, os
import statistics
from PIL import Image

png, boxes_json, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
boxes = json.loads(boxes_json)
im = Image.open(png).convert('RGB')
W, H = im.size
scale = W / 750.0


def region_mean(x, y, w, h):
    step = max(1, int(w / 16))
    rs = gs = bs = n = 0
    for yy in range(int(y) + 2, int(y + h) - 2, step):
        for xx in range(int(x) + 2, int(x + w) - 2, step):
            if 0 <= xx < W and 0 <= yy < H:
                r, g, b = im.getpixel((xx, yy))
                rs += r; gs += g; bs += b; n += 1
    if n < 12:
        return None
    return (rs / n, gs / n, bs / n)


def region_stats(x, y, w, h):
    step = max(1, int(w / 20))
    lum, pix = [], []
    for yy in range(int(y) + 2, int(y + h) - 2, step):
        for xx in range(int(x) + 2, int(x + w) - 2, step):
            if 0 <= xx < W and 0 <= yy < H:
                r, g, b = im.getpixel((xx, yy))
                lum.append(0.299 * r + 0.587 * g + 0.114 * b)
                pix.append((r, g, b))
    if len(lum) < 12:
        return {'variance': 0}
    m = sum(lum) / len(lum)
    return {'variance': round(statistics.pstdev(lum), 1), 'mean': [round(v, 1) for v in region_mean(x, y, w, h)]}


def strip_variance(x, y, w, h):
    """候选位置"花不花"：沿水平抽 14 点亮度取标准差。灰调照片也花，空白与浅面不花。"""
    vals, step = [], max(1, int(w) // 14)
    for j in range(14):
        xx, yy = int(x) + 2 + j * step, int(y + h / 2)
        if 0 <= xx < W and 0 <= yy < H:
            r, g, bl = im.getpixel((xx, yy))
            vals.append(0.299 * r + 0.587 * g + 0.114 * bl)
    return statistics.pstdev(vals) if len(vals) > 6 else 0


# 竖向偏移当**一个全局未知量**搜，五枚同时约束。
# 为什么不能逐枚各搜各的（上一版就是这么错的）：那等于给每枚 400 个候选位置挑最像的，
# 灰调照片的均色和浅面底色、和另一枚照片都可能在某一格里撞色，五枚就搜出五个互不相干的落点
# （实测 dyList=[168,1472,164,1384,88]，彼此差 1384px——那说明"对上了"全是巧合）。
# 一个 s 加在"已知的相对间距"上，五枚必须同时像，才是真落点。
def cover_mean(src_path, box_w_rpx, box_h_rpx):
    """`aspectFill` 真正露出来的那一块的均色，不是整张图的均色。
    240×1000 塞进 92×92 的方框，露的是**中间那一横条**（高的 24%），拿整张的均色去比必错。"""
    s = Image.open(src_path).convert('RGB')
    sw, sh = s.size
    sc = max(box_w_rpx / sw, box_h_rpx / sh)
    vw, vh = box_w_rpx / sc, box_h_rpx / sc
    x0, y0 = (sw - vw) / 2.0, (sh - vh) / 2.0
    c = s.crop((int(x0), int(y0), int(x0 + vw) or 1, int(y0 + vh) or 1)).resize((24, 24))
    sp = list(c.getdata())
    return tuple(sum(p[k] for p in sp) / len(sp) for k in range(3))


nominal = [(b['x'] * scale, b['y'] * scale, b['w'] * scale, b['h'] * scale) for b in boxes]
wants = [cover_mean(b['src'], b['w'], b['h']) for b in boxes]

S_LO, S_HI = -120, 460
# 底栏那条浮药丸占掉屏底 150rpx（§5.3 那条净空钉的就是它）。压在这一档里的那一格
# 采到的是浮栏的灰，不是照片——上一版就是这么把一枚好图判成"色对不上"的。
DOCK_TOP = H - 150 * scale
best_s, best_avg = None, 1e9
for s in range(S_LO, S_HI, 2):
    ds, vs = [], []
    for (x, y, w, h), want in zip(nominal, wants):
        yy = y + s
        # ⚠ 只要求"落进画面、且没被浮栏压住"的那些参与打分。
        #    再往前一版是要求五枚全在框内，等于把正确偏移（≈+178）整个挤掉，
        #    搜出来一个只有一枚撞色的 +68——那不是"对上了"，那是"没得选"。
        if yy < 0 or yy + h > DOCK_TOP:
            continue
        rm = region_mean(x, yy, w, h)
        if not rm:
            continue
        ds.append(sum(abs(a - c) for a, c in zip(rm, want)) / 3.0)
        vs.append(strip_variance(x, yy, w, h))
    if len(ds) < 3:
        continue
    avg = sum(ds) / len(ds) + sum(max(0, 14 - v) * 4 for v in vs) / len(vs)
    if avg < best_avg:
        best_s, best_avg = s, avg

out, dys = [], []
os.makedirs(out_dir, exist_ok=True)
for i, ((x, y, w, h), want) in enumerate(zip(nominal, wants)):
    yy = y + (best_s if best_s is not None else 0)
    in_frame = 0 <= yy and yy + h <= DOCK_TOP
    rm = region_mean(x, yy, w, h) if in_frame else None
    cdist = (sum(abs(a - c) for a, c in zip(rm, want)) / 3.0) if rm else 999
    st = region_stats(x, yy, w, h) if in_frame else {'variance': 0}
    dys.append(round(yy, 1))
    out.append({
        'src': os.path.basename(boxes[i]['src']), 'srcMean': [round(v, 1) for v in want],
        'shotMean': [round(v, 1) for v in (rm or [0, 0, 0])],
        'colorDist': round(cdist, 1), 'variance': st['variance'], 'y': round(yy, 1),
        'cornerGap': None, 'inFrame': in_frame,
    })
    if in_frame:
        # 圆角：半径 24rpx 落在 92rpx 的方框上，最角上那一枚在圆弧外，画的应该是浅面不是图
        c0, c1 = im.getpixel((int(x + w / 2), int(yy + h / 2))), im.getpixel((int(x) + 1, int(yy) + 1))
        out[-1]['cornerGap'] = round(sum(abs(a - b) for a, b in zip(c0, c1)) / 3.0, 1)
        lo = (max(0, int(x) - 6), max(0, int(yy) - 6), min(W, int(x + w) + 6), min(H, int(yy + h) + 6))
        if lo[2] > lo[0] and lo[3] > lo[1]:
            im.crop(lo).save(os.path.join(out_dir, f'裁-配图-{i + 1}.png'))

spreads = [round(nominal[i][1] + (best_s or 0), 1) for i in range(len(nominal))]
print(json.dumps({'imgSize': [W, H], 'scale': scale, 'visibleRpx': round(H / scale, 1),
                  'shift': best_s, 'shiftScore': round(best_avg, 1), 'dyList': spreads,
                  'dySpread': round(max(spreads) - min(spreads), 1) if spreads else None,
                  'boxes': out}))
