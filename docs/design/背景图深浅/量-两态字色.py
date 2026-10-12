#!/usr/bin/env python3
"""量"那两行固定字在两个态各自渲染成了多深的字"——判的是产物，不是 CSS 声明。

跑法（先跑真跑尺子，图证才新鲜）：
    bash docs/工具/跑尺子.sh 9431 验-背景深浅两态-真跑
    python3 docs/design/背景图深浅/量-两态字色.py

为什么不能只看类名：`bg-light` 挂上了不等于那支颜色生效（`:not()` 写错、类数不够、
被更高优先级吃掉，三类都是静默不生效）。所以这里只认截图上的字心灰阶。

两态各取哪两张：浅＝探针-浅.jpg（234），深＝探针-中灰.jpg（140，仍判在深那一侧）。
中灰那张是**故意挑的**：22 那枚深探针压白纱之后底只有 93，整档墨 53 与 `.72` 那档 64
挤在一起，判据没牙；中灰那张把底抬到 ≈135，两档的字心拉开到 53 与 76。

盒子是模拟器 734×1588 那三张上的实测位（只圈**未选中**那几枚：选中那两枚与那条短杠
本来就是整档墨，圈进来会把浅态那一档也量成 53，判据就假绿了）。
每个盒子自带"里面到底有没有字"的自检（暗像素不够就整条红），换布局要先重挑盒子。
"""
from PIL import Image
import os
import statistics
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '实测')
INK_CORE_MAX = 62      # 深那一态：整档墨的字心灰阶上界（预估值 53）
INK_CORE_MIN = 90      # 浅那一态：`.72` 那一档的字心灰阶下界（预估值 76＝没抬、106＝现值）
MIN_DARK_PX = 40       # 盒子里至少要有一点儿字，否则这个盒子是空的
# 10-12 21:4x 甲案那一刀的新牙：卡顶那一段白纱从 .30 抬到 .60（`--glass-veil-band`），
# 判的不是"令牌写没写"，是**截图上那一截底真被抬出中灰死区没有**。
# 死区是 89~175 那一段（.30 压近黑的探针-深 只到 93）：整档墨 2.1、纸白 5.8，两极互相打架。
# .60 之后同一处推到 ≈162 ⇒ 整档墨 ≥4.5。门槛取 150：改回 .30 必红，抬到 .50（面 ≈141）也红。
FACE_MIN = 150
CONTRAST_MIN = 4.5

# (名字, 浅态文件, 深态文件, x0, y0, x1, y1)
# 盒子是 20:2x 那批模拟器截图（734×1588，界面是中文）上按"暗像素落在哪几列"实测挑的：
# 只圈**未选中**那几枚——选中那两枚与那条短杠在两个态都是整档墨，圈进来浅态也量到 46，判据就假绿。
BOXES = [
    ('笔记列表页 未选中那枚「笔记卡片」', '浅色-笔记列表.png', '中灰-笔记列表.png', 190, 686, 292, 712),
    ('卡片列表页 未选中那枚「列表」', '浅色-卡片列表.png', '中灰-卡片列表.png', 50, 686, 152, 712),
    ('两屏共用 分类行未选中那三枚「旅游·生活·私密」', '浅色-笔记列表.png', '中灰-笔记列表.png', 105, 754, 336, 784),
    ('我的页 名片行 slogan', '浅色-我的.png', '中灰-我的.png', 150, 742, 430, 772),
]


def gray(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def core(path, box):
    """盒子里 darkest 0.5% 像素的灰阶中位＝字心；顺带报暗像素个数（盒子空不空）。"""
    x0, y0, x1, y1 = box
    im = Image.open(path).convert('RGB')
    vals = sorted(gray(im.getpixel((x, y))) for y in range(y0, y1) for x in range(x0, x1))
    n = max(1, len(vals) // 200)
    return statistics.median(vals[:n]), len([v for v in vals if v < 120])


def face_and_core(path, box):
    """同一个盒子拆两头：面＝最亮那 40% 的中位（纱压完之后的那一档），字心＝最暗 0.5% 的中位。"""
    x0, y0, x1, y1 = box
    im = Image.open(path).convert('RGB')
    vals = sorted(gray(im.getpixel((x, y))) for y in range(y0, y1) for x in range(x0, x1))
    n = max(1, len(vals) // 200)
    return statistics.median(vals[int(len(vals) * 0.6):]), statistics.median(vals[:n]), \
        len([v for v in vals if v < 120])


def wcag(g1, g2):
    """两档灰阶按 WCAG 相对亮度比（把灰阶当 sRGB 中性色反解，两头同一折算才可比）。"""
    def rel(g):
        v = g / 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    a, b = rel(g1), rel(g2)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


fails = 0
total = 0
for name, light_f, dark_f, *box in BOXES:
    lp, dp = os.path.join(OUT, light_f), os.path.join(OUT, dark_f)
    total += 1
    if not (os.path.exists(lp) and os.path.exists(dp)):
        print(f'✗ {name}　→　缺图证：{lp if not os.path.exists(lp) else dp}（先跑真跑尺子）')
        fails += 1
        continue
    lcore, ldark = core(lp, box)
    dcore, ddark = core(dp, box)
    if ldark < MIN_DARK_PX or ddark < MIN_DARK_PX:
        print(f'✗ {name}　→　盒子里没字（浅 暗像素{ldark}／深 {ddark}，门槛 {MIN_DARK_PX}）＝盒子挑歪了，不作数')
        fails += 1
        continue
    ok = dcore <= INK_CORE_MAX and lcore >= INK_CORE_MIN
    if not ok:
        fails += 1
    print(f'{"✓" if ok else "✗"} {name}　字心灰阶 浅 {lcore:.0f}（该 ≥{INK_CORE_MIN}＝还留 .72 那一档）'
          f'／深 {dcore:.0f}（该 ≤{INK_CORE_MAX}＝已抬到整档墨，整档墨本身灰阶 46）')

print(f'\n{"✗ 红 " + str(fails) + " 条" if fails else "✓ " + str(total) + " 条全过"}'
      '　（浅态量到 ≤%d 说明那一档被深态那条一起吃掉了；深态量到 ≥%d 说明抬色根本没生效）'
      % (INK_CORE_MAX, INK_CORE_MAX))

# ---------- 甲案那一刀：卡顶那一段纱把底抬出中灰死区没有（判产物，不判令牌） ----------
# 用的是**最深那枚探针**（探针-深.jpg，原图灰阶 22）——它才复现站长那张黑衣服压在那两行底下的情形；
# 中灰那枚（140）在 .30 时代底就有 175，看不出这一刀。
print('\n—— 卡顶那一段：深探针那一态，底要抬出死区、整档墨要过 4.5 ——')
for name, _light_f, dark_f, *box in BOXES:
    deep_f = dark_f.replace('中灰-', '深色-')
    dp = os.path.join(OUT, deep_f)
    total += 1
    if not os.path.exists(dp):
        print(f'✗ {name}　→　缺图证：{dp}（先跑真跑尺子）')
        fails += 1
        continue
    face, c, dark = face_and_core(dp, box)
    if dark < MIN_DARK_PX:
        print(f'✗ {name}　→　盒子里没字（暗像素 {dark}）＝盒子挑歪了，不作数')
        fails += 1
        continue
    ct = wcag(face, c)
    ok = face >= FACE_MIN and ct >= CONTRAST_MIN
    if not ok:
        fails += 1
    print(f'{"✓" if ok else "✗"} {name}（{deep_f}）　面 {face:.0f}（该 ≥{FACE_MIN}＝抬出死区；'
          f'.30 那一档只有 93）／字心 {c:.0f}／对比 {ct:.2f}（该 ≥{CONTRAST_MIN}）')

sys.exit(1 if fails else 0)
