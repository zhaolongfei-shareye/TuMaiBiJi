#!/usr/bin/env python3
# 把首页那四张插画**压平到实心**（10-11 09:5x 站长催的那一条：「需求+效果图都有，你怎么不去做」）。
# 为什么要有这一步：效果图第 271／273 行画的就是这三块带玻璃，而人物与 icon 在图上是**实心**的；
# 可现网那四张 PNG 自己就是大半透明（`ic-person.png` 实心像素只占 0.7%），压在实心面上看不出来，
# 底下换成 .30 白纱就直接透出照片（真机毛衣 rgb(165,133,123) 对效果图 rgb(241,238,227)）。
# 做法只有一件事：**不重画一个像素**——把每个像素按"作者当初画在白底上"合成到白，再把有画的地方 alpha 拉满，
# 轮廓外（alpha 原为 0）照旧透明。这就是他要的那句「人物边缘外部是透明底，衣服不透明」。
#
# 10-11 13:2x 站长又一句：「笔记和卡片上面的图片透明底消除不干净，有明显的白边，不美观」
# ⇒ 白边是**上一版这一刀自己造出来的**，不是插画带的。原件外圈有一道作者留的柔光：一枚 (254,254,254)@α≈5
#   占 0.6~1.0% 像素，全部落在贴着透明边的第 1~2 环；当时"凡 α>0 就拉满 α"把它变成**实心白**＝那圈白边。
#   现改：α ≤ FAINT_MAX 的那些枚索引**整枚抠掉**（α 归 0），它们本来就是边外柔光与 10-10 优化进包时的
#   调色板残留（同一档里还有 (127,127,127)@α2、(255,0,0)@α1 这类几像素的杂色），抠掉只让轮廓收紧 1~2px。
#   ⚠ 阈值只看 α，不看位置：实测四张的 α≤64 像素有 99% 就在贴边 1~2 环（另一张内部最多 9 个像素），
#     所以这一条能在调色板模型里按索引处理，像素索引照旧一个都不动。
# ⚠ 这**四张是调色板 PNG**（mode P ＋ tRNS 逐索引 alpha，10-10 那趟优化进包的），所以压平**必须在调色板模型里做**：
#   只改"每个索引自己的 alpha 与 RGB"，像素索引一个都不动。第一版我 `convert('RGBA')` 逐像素合成，
#   结果丢了调色板压缩：四张从 74KB 涨到 173KB、整包 753.5KB→850.4KB（＋97KB），而画面一模一样。
# 跑法：python3 docs/工具/烘-插画压平.py --从git <rev>     ← 从 git 里取原件来烘（工作区已是烘过的态时用这一条）
#      python3 docs/工具/烘-插画压平.py                  ← 只算数、写进 docs/design/10-11毛玻璃/压平/，不动 assets
#      python3 docs/工具/烘-插画压平.py --写进包          ← 才真的覆盖 miniprogram/assets 那四枚
import io
import os
import subprocess
import sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..'))
SRC = os.path.join(ROOT, 'miniprogram/assets')
OUT = os.path.join(ROOT, 'docs/design/10-11毛玻璃/压平')
FILES = ['ic-person.png', 'ic-person-alt.png', 'ic-stat-notes.png', 'ic-stat-cards.png']
WRITE = '--写进包' in sys.argv
FROM_GIT = sys.argv[sys.argv.index('--从git') + 1] if '--从git' in sys.argv else None
# 这一档及以下不是"画"，是贴在轮廓外的那圈柔光（(254,254,254)@α4~6）与调色板残留杂色 ⇒ 整枚抠掉
FAINT_MAX = 64


def stats(img):
    h = img.convert('RGBA').getchannel('A').histogram()
    n = img.width * img.height
    return 100 * h[255] / n, 100 * sum(h[1:255]) / n, 100 * h[0] / n


def index_alphas(im, n_entries):
    """P 模式那枚 tRNS 有两种写法：一个整数（该索引全透、其余不透）或一串逐索引 alpha。"""
    tr = im.info.get('transparency')
    if tr is None:
        return [255] * n_entries
    if isinstance(tr, int):
        a = [255] * n_entries
        if 0 <= tr < n_entries:
            a[tr] = 0
        return a
    a = list(bytes(tr)) + [255] * max(0, n_entries - len(bytes(tr)))
    return a[:n_entries]


def bake(im):
    """返回 (压平后的图, 一句话说明走的哪条路, 这一趟抠掉了多少像素)。调色板那条路像素索引零改动。"""
    if im.mode == 'P':
        pal = list(im.getpalette())
        n = len(pal) // 3
        al = index_alphas(im, n)
        used = np.bincount(np.asarray(im).reshape(-1), minlength=n)
        new_pal, new_al, cut = [], [], 0
        for i in range(n):
            r, g, b = pal[3 * i:3 * i + 3]
            a = al[i]
            if 0 < a <= FAINT_MAX:
                # 贴在轮廓外的那圈柔光（(254,254,254)@α4~6）与调色板残留杂色：整枚抠掉，
                # 上一版把它拉成实心白＝他打回的那圈白边
                new_pal += [r, g, b]
                new_al.append(0)
                cut += int(used[i])
                continue
            # 合成到白：观察值×a ＋ 255×(1−a)；alpha 为 0 的那一枚照旧全透
            new_pal += [round(r * a / 255.0 + 255 * (1 - a / 255.0)),
                        round(g * a / 255.0 + 255 * (1 - a / 255.0)),
                        round(b * a / 255.0 + 255 * (1 - a / 255.0))]
            new_al.append(255 if a > 0 else 0)
        out = im.copy()
        out.putpalette(new_pal)
        out.info['transparency'] = bytes(new_al)
        return out, '调色板（像素索引一个没动，只改了每枚索引自己的 alpha 与 RGB）', cut
    src = np.asarray(im.convert('RGBA')).astype(float)
    a0 = src[..., 3]
    alpha = (a0 / 255.0)[..., None]
    flat = src[..., :3] * alpha + 255.0 * (1 - alpha)
    res = np.dstack([flat, np.where(a0 > FAINT_MAX, 255.0, 0.0)]).astype('uint8')
    return Image.fromarray(res, 'RGBA'), '逐像素合成（这张不是调色板）', int(((a0 > 0) & (a0 <= FAINT_MAX)).sum())


def open_src(name):
    if FROM_GIT:
        raw = subprocess.run(['git', '-C', ROOT, 'show', f'{FROM_GIT}:miniprogram/assets/{name}'],
                             capture_output=True, check=True).stdout
        return Image.open(io.BytesIO(raw))
    return Image.open(f'{SRC}/{name}')


os.makedirs(OUT, exist_ok=True)
for p in FILES:
    src = f'{SRC}/{p}'
    im0 = open_src(p)
    before = stats(im0)
    img, how, cut = bake(im0)
    after = stats(img)
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    open(f'{OUT}/{p}', 'wb').write(buf.getvalue())
    print(f'{p:22s} 压平前 实心{before[0]:5.1f}% 半透{before[1]:5.1f}% 全透{before[2]:5.1f}%'
          f'  →  压平后 实心{after[0]:5.1f}% 半透{after[1]:5.1f}% 全透{after[2]:5.1f}%  {img.mode} {len(buf.getvalue())} B'
          f'  抠掉柔光圈 {cut}px｜{how}')
    assert after[1] == 0.0, f'{p} 压平后还剩半透像素，这一步没做成'
    if WRITE:
        open(src, 'wb').write(buf.getvalue())
        print(f'  已写进 {src}')
print(('★ 已覆盖包内那四枚；原件在 git 里，要还原：git checkout -- ' +
       ' '.join(f'miniprogram/assets/{f}' for f in FILES)) if WRITE
      else '（没动 assets；上面这些产物在 docs/design/10-11毛玻璃/压平/。要落进包：加参数 --写进包）')
