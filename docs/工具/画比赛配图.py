#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给比赛说明画一套配图。

配色和圆角全部沿用小程序那一份色板（miniprogram/utils/palette.js），
这样评审看图和看界面得到的是同一套视觉；数字全部来自实测，不估。
"""
import math
from PIL import Image, ImageDraw, ImageFont

OUT = '/Users/zlfmac/Documents/TuMaiBiJi/docs/design/比赛配图'
SHOTS = '/Users/zlfmac/Documents/TuMaiBiJi/docs/design/真机截图'
import os
os.makedirs(OUT, exist_ok=True)

FONT = '/System/Library/Fonts/Hiragino Sans GB.ttc'
W6, W3 = 2, 0  # 同一 ttc 里的两个字重：2 是粗，0 是常规

PAPER = (244, 242, 236)
INK = (35, 37, 44)
SUB = (92, 96, 104)
EDGE = (223, 219, 209)
CARD = (255, 255, 255)
YELLOW = (246, 196, 69)
YELLOW_INK = (42, 32, 5)
BLUE = (63, 82, 214)
ORANGE = (233, 114, 61)
ORANGE_INK = (44, 18, 4)
GREEN = (70, 168, 99)
GREEN_INK = (6, 38, 15)
PURPLE = (110, 75, 208)
WHITE = (255, 255, 255)

_cache = {}


def f(size, bold=True):
    k = (size, bold)
    if k not in _cache:
        _cache[k] = ImageFont.truetype(FONT, size, index=W6 if bold else W3)
    return _cache[k]


def new(w, h, bg=PAPER):
    im = Image.new('RGB', (w, h), bg)
    return im, ImageDraw.Draw(im)


def rrect(d, box, r, fill=None, outline=None, ow=3):
    if fill is None and outline is None:
        return
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=ow)


def tw(s, font):
    return font.getlength(s)


def wrap(s, font, maxw):
    """中文按字断行：没有空格可分，只能逐字量。"""
    lines, cur = [], ''
    for ch in s:
        if tw(cur + ch, font) > maxw and cur:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


def text(d, xy, s, size=26, fill=INK, bold=True, maxw=None, lh=None, align='left'):
    x, y = xy
    font = f(size, bold)
    lh = lh or int(size * 1.5)
    parts = s.split('\n')
    lines = []
    for part in parts:
        lines += wrap(part, font, maxw) if maxw else [part]
    for ln in lines:
        if align == 'center':
            d.text((x - tw(ln, font) / 2, y), ln, font=font, fill=fill)
        elif align == 'right':
            d.text((x - tw(ln, font), y), ln, font=font, fill=fill)
        else:
            d.text((x, y), ln, font=font, fill=fill)
        y += lh
    return y


def arrow(d, p0, p1, color=INK, w=4, head=13):
    d.line([p0, p1], fill=color, width=w)
    a = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
    for off in (math.radians(150), math.radians(-150)):
        d.line([p1, (p1[0] + head * math.cos(a + off), p1[1] + head * math.sin(a + off))], fill=color, width=w)


def chip(d, xy, s, bg, ink, pad=16, size=24, r=14):
    font = f(size, True)
    w = tw(s, font) + pad * 2
    h = size + pad * 1.4
    x, y = xy
    rrect(d, (x, y, x + w, y + h), r, fill=bg)
    d.text((x + pad, y + pad * 0.62), s, font=font, fill=ink)
    return w, h


def caption(d, xy, s, w=1600, size=22):
    text(d, (xy[0], xy[1]), s, size, SUB, False, maxw=w)


def numtile(d, box, big, label, bg=CARD, ink=INK, big_size=54, lab_size=22, outline=EDGE):
    rrect(d, box, 22, fill=bg, outline=outline)
    cx = (box[0] + box[2]) / 2
    text(d, (cx, box[1] + 26), big, big_size, ink, True, align='center')
    text(d, (cx, box[1] + 26 + big_size * 1.35), label, lab_size, SUB if bg == CARD else ink, False,
         maxw=box[2] - box[0] - 28, align='center')


# ---------------------------------------------------------------- 图 1 需求的形状
def fig1():
    W, H = 1600, 900
    im, d = new(W, H)
    text(d, (60, 44), '同一条内容，两种结局', 40)
    text(d, (60, 100), '左边是我过去六个月真实做过的事，右边是这条产品要求它变成的样子。', 24, SUB, False)

    # 左：三处散落
    lx, ly, lw = 60, 170, 620
    rrect(d, (lx, ly, lx + lw, ly + 560), 28, fill=CARD, outline=EDGE)
    text(d, (lx + 30, ly + 26), '存下来之后', 30)
    rows = [('微信收藏', '200+ 篇公众号文章', BLUE, WHITE),
            ('手机相册', '400+ 张截图', ORANGE, ORANGE_INK),
            ('群聊记录', '报告链接、半张图', YELLOW, YELLOW_INK)]
    y = ly + 92
    for name, cnt, bg, ink in rows:
        rrect(d, (lx + 30, y, lx + lw - 30, y + 86), 20, fill=bg)
        text(d, (lx + 56, y + 16), name, 27, ink, True)
        text(d, (lx + 56, y + 50), cnt, 21, ink, False)
        y += 102
    text(d, (lx + 30, y + 6), '要用的时候：翻收藏、翻相册、翻三个群', 25, INK, True, maxw=lw - 60)
    text(d, (lx + 30, y + 48), '没找到 → 重新搜了一遍关键词', 25, (200, 60, 50), True)
    text(d, (lx + 30, y + 90), '保存的那一下，只是存了个入口，不是内容。', 22, SUB, False, maxw=lw - 60)

    # 右：一条笔记
    rx, ry, rw = 920, 170, 620
    rrect(d, (rx, ry, rx + rw, ry + 560), 28, fill=CARD, outline=EDGE)
    text(d, (rx + 30, ry + 26), '丢进来 15 秒之后', 30)
    # 左块右文，跟界面同一套母题
    bx, by, bs = rx + 30, ry + 92, 150
    rrect(d, (bx, by, bx + bs, by + bs), 24, fill=ORANGE)
    text(d, (bx + 18, by + 18), '旅游', 26, ORANGE_INK, True)
    text(d, (bx + 18, by + bs - 40), '09-21', 20, ORANGE_INK, False)
    tx = bx + bs + 24
    text(d, (tx, by + 4), '厦门三日路线：鼓浪屿要早去早回', 27, INK, True, maxw=rx + rw - 30 - tx)
    text(d, (tx, by + 92), '鼓浪屿第一批船上岛，人少一小时。', 22, SUB, False, maxw=rx + rw - 30 - tx)
    text(d, (tx, by + 126), '沙坡尾傍晚的光最适合拍照。', 22, SUB, False, maxw=rx + rw - 30 - tx)
    y2 = by + bs + 26
    x2 = rx + 30
    for tag in ['能搜到', '能归类', '能存成卡片图', '能置顶']:
        w, _ = chip(d, (x2, y2), tag, PAPER, INK, pad=14, size=22, r=12)
        x2 += w + 12
        if x2 > rx + rw - 120:
            x2 = rx + 30
            y2 += 46
    text(d, (rx + 30, ry + 470), '标题 / 摘要 / 核心要点 / 标签', 22, SUB, False)
    text(d, (rx + 30, ry + 504), '四个字段是模型输出被关进去的那份契约', 21, SUB, False)

    arrow(d, (lx + lw + 18, ly + 280), (rx - 18, ly + 280), BLUE, 6, 18)
    text(d, ((lx + lw + rx) / 2, ly + 240), '交给机器', 26, BLUE, True, align='center')

    rrect(d, (60, 760, W - 60, 848), 22, fill=INK)
    text(d, (W / 2, 786), '需求压缩成一句话：把「存下来」和「整理好」之间那一步，交给机器。', 28, WHITE, True, align='center')
    im.save(f'{OUT}/fig1-需求的形状.png')


# ---------------------------------------------------------------- 图 2 四个创新点
def fig2():
    W, H = 1600, 860
    im, d = new(W, H)
    text(d, (60, 44), '方案阶段定下来的四个选择', 40)
    text(d, (60, 100), '决定产品形态的不是"还要加什么"，是"不做什么"和"把哪里挪一挪"。', 24, SUB, False)
    items = [
        ('①', '起点前移', '从空白页挪到已经看到的内容', '启动成本从"组织一段语言"降到"粘贴一次"。', BLUE, WHITE),
        ('②', '两入口一出口', '链接和截图进同一个结构', '来源差异被刻意抹平，注意力只花在"对我有什么用"。', ORANGE, ORANGE_INK),
        ('③', '出口不只在应用里', '生成一张按内容排高的卡片图', '插进文章当配图，也能打印出来贴在手账和攻略上。', GREEN, GREEN_INK),
        ('④', '克制', '界面不许诺服务端没做的事', '额度、邀请奖励没上线就不写；边界和失败态如实摆在界面上。', PURPLE, WHITE),
    ]
    cw, ch, gap = 730, 300, 40
    for i, (no, title, sub, body, bg, ink) in enumerate(items):
        r, c = divmod(i, 2)
        x = 60 + c * (cw + gap)
        y = 170 + r * (ch + gap)
        rrect(d, (x, y, x + cw, y + ch), 28, fill=bg)
        text(d, (x + 34, y + 26), no, 46, ink, True)
        text(d, (x + 100, y + 34), title, 34, ink, True)
        text(d, (x + 100, y + 86), sub, 24, ink, False, maxw=cw - 140)
        text(d, (x + 34, y + 168), body, 25, ink, False, maxw=cw - 68, lh=38)
    im.save(f'{OUT}/fig2-四个创新点.png')


# ---------------------------------------------------------------- 图 3 技术架构
def fig3():
    W, H = 1600, 1060
    im, d = new(W, H)
    text(d, (60, 40), '技术架构：一层免费的 AI 底座，一层开源的确定性能力', 38)

    rrect(d, (60, 118, W - 60, 232), 24, fill=BLUE)
    text(d, (90, 140), '微信小程序 · 原生框架', 30, WHITE, True)
    x = 90
    for c in ['WXML / WXSS', 'Canvas 2D 出图', '自定义 TabBar', '设计令牌三层']:
        w, _ = chip(d, (x, 188), c, WHITE, BLUE, pad=12, size=20, r=10)
        x += w + 10
    arrow(d, (W / 2, 236), (W / 2, 292), INK, 5, 14)
    text(d, (W / 2 + 16, 246), 'HTTPS + JWT（服务端签发，OpenID 永不下发客户端）', 22, SUB, False)

    rrect(d, (60, 296, W - 60, 400), 24, fill=INK)
    text(d, (90, 318), '自建后端 · FastAPI + SQLAlchemy + Pydantic v2', 28, WHITE, True)
    text(d, (90, 356), '身份隔离 / 采集任务 / 异步提炼 / 用户可见错误一律中文', 22, (200, 202, 210), False)

    text(d, (60, 424), '三条链路各解决一件事：把内容取回来、把图片变成文字、把文字炼成结构', 25, INK, True)
    lanes = [('视觉线', 'RapidOCR（PP-OCR 检测+方向+识别）\nONNXRuntime 纯 CPU 推理\n零密钥、零按次费用',
              '图片不出自己的进程', ORANGE, ORANGE_INK),
             ('网页线', 'trafilatura + BeautifulSoup\nlxml 在自有服务器上直抓正文\n不落地第三方',
              '不经第三方解析或短链', GREEN, GREEN_INK),
             ('语义线', '云函数内 cloud.ai()\n→ 混元 hy3-preview\n网关 + 服务端长期 Key',
              '免凭据 · 免费额度抵扣', PURPLE, WHITE)]
    lw, y0 = 480, 500
    for i, (name, body, foot, bg, ink) in enumerate(lanes):
        x = 60 + i * (lw + 40)
        arrow(d, (x + lw / 2, 462), (x + lw / 2, y0 - 6), INK, 4, 12)
        rrect(d, (x, y0, x + lw, y0 + 260), 26, fill=bg)
        text(d, (x + 28, y0 + 22), name, 30, ink, True)
        text(d, (x + 28, y0 + 74), body, 22, ink, False, maxw=lw - 56, lh=34)
        rrect(d, (x + 28, y0 + 196, x + lw - 28, y0 + 234), 12, fill=WHITE)
        text(d, (x + 44, y0 + 204), foot, 21, INK, True)
    text(d, (60, y0 + 292), '语义线只被异步任务调用，不被任何同步接口调用：它最慢也最不确定，挂了就降级存原文，绝不让一次采集整体失败。',
         22, SUB, False, maxw=W - 120)
    rrect(d, (60, y0 + 334, W - 60, y0 + 408), 20, fill=CARD, outline=EDGE)
    text(d, (86, y0 + 354), '端侧另做两件事：卡片图高度由内容决定（量一趟、画一趟）；一套令牌适配六套壁纸，深色不重画界面。',
         23, INK, False)
    im.save(f'{OUT}/fig3-技术架构.png')


# ---------------------------------------------------------------- 图 4 免费 AI 实测
def fig4():
    W, H = 1600, 940
    im, d = new(W, H)
    text(d, (60, 40), '微信免费提供的 AI 能力，把最大的那块成本消掉了', 38)
    text(d, (60, 100), '下面每一个数都来自现网控制台的账单读数和真实调用，不是估算。', 24, SUB, False)

    # 额度条
    bx, by, bw = 60, 160, W - 120
    rrect(d, (bx, by, bx + bw, by + 96), 20, fill=CARD, outline=EDGE)
    rrect(d, (bx + 6, by + 6, bx + bw - 6, by + 90), 16, fill=PAPER)
    text(d, (bx + 24, by + 28), '成长计划免费额度：10 亿 Token', 28, INK, True)
    text(d, (bx + bw - 24, by + 32), '已用 76,248', 26, SUB, False, align='right')
    used = max(6, int((bw - 12) * 76248 / 1_000_000_000))
    rrect(d, (bx + 6, by + 6, bx + 6 + used, by + 90), 16, fill=PURPLE)
    text(d, (bx + 24, by + 110), '实际占用 0.0076%，条上这一段几乎看不见——这正是它够用的原因。', 22, SUB, False)

    tiles = [('0 元', '一篇长文提炼成结构化笔记的边际成本'),
             ('≈1,900', '单次提炼折算的 Token 数'),
             ('1.27–2.87 秒', '模型单次返回耗时'),
             ('50 万次量级', '10 亿额度够做的提炼次数')]
    tw_, th, gap = 355, 190, 20
    for i, (big, lab) in enumerate(tiles):
        x = 60 + i * (tw_ + gap)
        bg = [PURPLE, BLUE, GREEN, YELLOW][i]
        ink = WHITE if i < 3 else YELLOW_INK
        rrect(d, (x, 320, x + tw_, 320 + th), 24, fill=bg)
        text(d, (x + tw_ / 2, 350), big, 46 if len(big) < 8 else 34, ink, True, align='center')
        text(d, (x + tw_ / 2, 412), lab, 22, ink, False, maxw=tw_ - 40, align='center')

    # 两条实测结论
    rrect(d, (60, 560, W - 60, 700), 22, fill=CARD, outline=EDGE)
    text(d, (86, 580), '只有实测才拿得到的一条分岔', 26, INK, True)
    text(d, (86, 624), '控制台里带"免费额度"标记的 hy3 一律 0.68 秒抛 AI_MODEL_NOT_ENABLED，要求先切不可回退的"资源点"套餐；',
         23, SUB, False, maxw=W - 172)
    text(d, (86, 658), '换 hy3-preview 后不切任何计费形态，调用正常返回，并且免费额度被真实抵扣——套餐侧读数仍为 0。',
         23, SUB, False, maxw=W - 172)
    rrect(d, (60, 726, W - 60, 866), 22, fill=INK)
    text(d, (86, 748), '顺带被免费的还有分发', 26, WHITE, True)
    text(d, (86, 792), '卡片图上那个可扫的小程序码用原生能力生成，access_token 服务端缓存复用；识别出的内容回流给用户',
         23, (205, 207, 214), False, maxw=W - 172)
    text(d, (86, 826), '不需要做 App 上架。算力和流量入口，个人开发者最缺的两样，这里都有免费版本。', 23, (205, 207, 214), False,
         maxw=W - 172)
    im.save(f'{OUT}/fig4-免费AI实测.png')


# ---------------------------------------------------------------- 图 5 OCR 三道闸门
def fig5():
    W, H = 1600, 900
    im, d = new(W, H)
    text(d, (60, 40), '模型做不了的那件事：自建 OCR 的三道闸门', 38)
    text(d, (60, 100), '大模型擅长理解，不负责把图片里的字认出来；而截图是这个产品最重要的输入之一。', 24, SUB, False)

    bars = [('不缩放（3420×2214 长图）', 1076.6, ORANGE, ORANGE_INK),
            ('缩放长边 ≤1600 后', 666.6, GREEN, GREEN_INK),
            ('0.43MB 的 1.44 亿像素纯色 PNG', 1271.0, (200, 60, 50), WHITE),
            ('生产机真实长截图峰值（cgroup）', 465.6, BLUE, WHITE)]
    x0, y0, bw_max, AXIS = 470, 190, 1000, 2100.0
    text(d, (60, y0 - 26), '单次识别的进程内存峰值 · MB（横轴 0–2,100）', 22, SUB, False)
    for i, (lab, val, bg, ink) in enumerate(bars):
        y = y0 + i * 96
        text(d, (60, y + 14), lab, 24, INK, True, maxw=390, lh=30)
        w = int(bw_max * val / AXIS)
        rrect(d, (x0, y, x0 + bw_max, y + 58), 12, fill=PAPER, outline=EDGE, ow=2)
        rrect(d, (x0, y, x0 + w, y + 58), 12, fill=bg)
        text(d, (x0 + w - 16, y + 14), f'{val:.1f}', 25, ink, True, align='right')
    # 可用内存参考线：只画到条形区里，标签压在卡片上方，别被卡片盖掉
    lx = x0 + int(bw_max * 1959 / AXIS)
    d.line([(lx, y0 - 14), (lx, y0 + 3 * 96 + 58)], fill=SUB, width=3)
    text(d, (lx - 10, y0 + 3 * 96 + 66), '当时机器可用 1,959MB', 20, SUB, False, align='right')

    rrect(d, (60, 610, W - 60, 800), 22, fill=CARD, outline=EDGE)
    text(d, (86, 632), '三道闸门换来的一句话：能跑 ≠ 能在生产上跑不死', 26, INK, True)
    rows = ['① 识别前缩放到长边 ≤1600：峰值 1,076.6 → 666.6MB，而识别出的字符数从 294 升到 301，缩放没有丢信息。',
            '② 缩放之前先按像素数拒图（上限 4,000 万）：缩放要先解码，"不超过 10MB"挡不住 1.44 亿像素的纯色图。',
            '③ 按检测框坐标重排为视觉阅读顺序 + 剔除噪声行：开源 OCR 默认按检测顺序输出，长截图会乱序。']
    y = 680
    for r in rows:
        text(d, (86, y), r, 22, SUB, False, maxw=W - 172)
        y += 40
    text(d, (60, 824), '端到端读数：1170×3200 的真实中文长截图，从提交到笔记出现在列表 4.0 秒；图片只在进程内存，不落盘、不入数据库、没有对象存储。',
         22, INK, False, maxw=W - 120)
    im.save(f'{OUT}/fig5-OCR三道闸门.png')


# ---------------------------------------------------------------- 图 6 工具链四层
def fig6():
    W, H = 1600, 1120
    im, d = new(W, H)
    text(d, (60, 40), '研发工具链：Qoder + Qwen + 小程序原生框架 + AI', 38)
    text(d, (60, 100), 'AI 不只是产品里的一个能力，它同时是产品的生产工具——四者构成的是一条能自我验证的流水线。',
         24, SUB, False, maxw=W - 120)
    layers = [('上下文层', '仓库级语义检索与知识卡片：模块边界、约定、踩坑记录沉淀成可检索的结构',
               '换会话、换人都不丢上下文，改代码前先读到"这块为什么这么写"', BLUE, WHITE),
              ('生成层', 'Qwen 长上下文支撑跨文件重构，中文文案与注释保持一致',
               '一次改动同时覆盖前端页面、样式令牌、后端服务与测试，不留半套', PURPLE, WHITE),
              ('执行层', '命令行驱动开发者工具：编译、拉起模拟器、注入自动化端口',
               '改完不必等人去点，机器自己把界面跑起来', ORANGE, ORANGE_INK),
              ('验证层', '真点按钮、真输文字、真截图、跨页面量控件尺寸；后端 87 条 pytest',
               '交付前自己证明"没做坏"，而不是把"你点一下看看"甩回给人', GREEN, GREEN_INK)]
    y = 170
    for name, body, why, bg, ink in layers:
        rrect(d, (60, y, W - 60, y + 150), 26, fill=bg)
        text(d, (92, y + 24), name, 32, ink, True)
        text(d, (260, y + 22), body, 24, ink, False, maxw=W - 380, lh=34)
        text(d, (260, y + 96), '→ ' + why, 22, ink, False, maxw=W - 380)
        y += 168
    text(d, (60, y + 4), '这条流水线里最满意的一个做法：把"一致性"变成可测量的断言。', 26, INK, True)
    text(d, (60, y + 44), '首页搜索框和新建页输入框必须一样大，那就不是"看着差不多"，而是跨页面各测一次、要求两个数值相等（实测同为 22.4px）。',
         22, SUB, False, maxw=W - 120)
    # 规模数字条
    by = y + 96
    stats = [('5,584', '小程序行'), ('2,545', '后端行·不含测试'), ('123', '云函数行'),
             ('87', '后端用例'), ('55', '界面断言'), ('193.7', '整包 KB')]
    sw = (W - 120 - 5 * 16) / 6
    for i, (big, lab) in enumerate(stats):
        x = 60 + i * (sw + 16)
        rrect(d, (x, by, x + sw, by + 120), 20, fill=CARD, outline=EDGE)
        text(d, (x + sw / 2, by + 22), big, 38, INK, True, align='center')
        text(d, (x + sw / 2, by + 76), lab, 20, SUB, False, align='center')
    im.save(f'{OUT}/fig7-工具链四层.png')


# ---------------------------------------------------------------- 图 7 交互设计取舍
def fig7():
    W, H = 1600, 1040
    im, d = new(W, H)
    text(d, (60, 40), '看过这些国际做法之后，我选了卡片', 38)
    refs = [('Bento Grid', '一格一义：一个色块只承担一个信息', '放弃为展示而生的强装饰网格', BLUE, WHITE),
            ('Material 3 动态取色', '颜色承载语义，不是只做美化', '放弃"颜色跟随主题乱变"', PURPLE, WHITE),
            ('新粗野主义描边', '用可见描边取代投影表达边界', '深色下投影几乎不可见，描边明暗都成立', ORANGE, ORANGE_INK),
            ('VSCO / Lightroom / CapCut', '高饱和色块、大圆角、圆润粗字', '一版"墨与纸"的克制方案被直接否掉', GREEN, GREEN_INK),
            ('收藏工具族', '把"存"做得很好', '输入端与回流端分属两个生态，这是那道缝', INK, WHITE)]
    cw, ch, gap = 288, 300, 14
    subs = [None, None, None, None, 'Notion / Cubox / Flomo']
    for i, (name, borrow, drop, bg, ink) in enumerate(refs):
        sub_title = subs[i]
        x = 60 + i * (cw + gap)
        rrect(d, (x, 110, x + cw, 110 + ch), 24, fill=bg)
        text(d, (x + 22, 128), name, 24, ink, True, maxw=cw - 44, lh=32)
        if sub_title:
            text(d, (x + 22, 168), sub_title, 20, ink, False)
        text(d, (x + 22, 226), '借：' + borrow, 21, ink, False, maxw=cw - 44, lh=30)
        text(d, (x + 22, 296), '弃：' + drop, 21, ink, False, maxw=cw - 44, lh=30)
    arrow(d, (W / 2, 424), (W / 2, 462), INK, 5, 14)
    text(d, (W / 2 + 20, 424), '落地', 24, INK, True)

    # 左块右文 样例
    rrect(d, (60, 474, 900, 800), 28, fill=CARD, outline=EDGE)
    text(d, (86, 494), '最终方案：左块右文（两版重做才定下来）', 28, INK, True)
    bx, by, bs = 86, 550, 130
    rrect(d, (bx, by, bx + bs, by + bs), 22, fill=PURPLE)
    text(d, (bx + 16, by + 14), '产品', 25, WHITE, True)
    text(d, (bx + 16, by + bs - 38), '09-19', 19, WHITE, False)
    text(d, (bx + bs + 22, by + 2), '产品评审该问的六个问题', 27, INK, True, maxw=760)
    text(d, (bx + bs + 22, by + 60), '把"用户要什么"换成"用户今天为这件事花了多少时间"。', 22, SUB, False, maxw=740)
    text(d, (86, 704), '颜色退到方块，卡片回白底描边：扫颜色分流、读文字辨条，两件事各归其位。', 22, SUB, False, maxw=790)

    # 搜索条演化
    rrect(d, (940, 474, W - 60, 800), 28, fill=CARD, outline=EDGE)
    text(d, (966, 494), '搜索条的三轮演化', 28, INK, True)
    stages = [('白底胶囊 + 图标按钮', 250, EDGE, INK), ('一块饱和色 + 一行', 168, BLUE, WHITE), ('色块 + 一条横线', 116, PURPLE, WHITE)]
    y = 560
    for lab, h, bg, ink in stages:
        th = max(16, int(h * 0.14))
        text(d, (966, y + th / 2 - 12), lab, 20, SUB, False)
        rrect(d, (1200, y, 1380, y + th), 10, fill=bg if bg != EDGE else PAPER, outline=bg if bg == EDGE else None, ow=2)
        text(d, (1500, y + th / 2 - 14), f'{h}rpx', 22, INK, True, align='right')
        y += th + 28
    text(d, (966, y + 4), '整块从 250 压到 116rpx：一屏从露出两条半笔记变成三条。', 22, SUB, False, maxw=530)

    text(d, (86, 740), '方块上写的是用户自己打的第一个标签，不是分类名。', 22, SUB, False, maxw=790)
    text(d, (86, 772), '标签说明这一条是什么，颜色说明它属于哪一类。', 22, SUB, False, maxw=790)

    rrect(d, (60, 830, W - 60, 930), 22, fill=INK)
    text(d, (86, 852), '一个功能只留一个入口 · 一屏只允许一个主行动 · tab 用文字加下划线不用按钮态 · 说明文字一律砍掉，空间给内容',
         23, WHITE, False, maxw=W - 172)
    text(d, (86, 890), '深色模式不是另一套配色，是同一套令牌换一组语义值：六套壁纸里两套深色，所有组件自动成立。', 22, (205, 207, 214), False,
         maxw=W - 172)
    text(d, (60, 950), '这些取舍背后是同一句话：好的工具不应该让用户为了管理信息而增加新的负担，它应该让整理更容易发生。', 25, INK, True)
    im.save(f'{OUT}/fig8-交互设计取舍.png')


# ---------------------------------------------------------------- 图 8 界面全景
def fig8():
    names = [('01-新建-三入口.png', '三种方式，都只要一次动作'),
             ('02-新建-展开录入.png', '卡片内展开，不跳页'),
             ('03-我的笔记-列表.png', '大标题 + 统计 + 横线搜索'),
             ('04-我的笔记-搜索命中.png', '搜标题也搜原文'),
             ('05-详情-笔记.png', '四个字段 + 来源 + 原文'),
             ('12-我的笔记-深色.png', '同一套令牌换深色皮肤')]
    w, h = 300, 649
    pad, top, lab = 26, 120, 40
    W = 60 * 2 + len(names) * w + (len(names) - 1) * pad
    H = top + h + lab + 60
    im, d = new(W, H)
    text(d, (60, 40), '当前体验版 v1.1.11 的真实界面', 38)
    for i, (fn, cap) in enumerate(names):
        x = 60 + i * (w + pad)
        src = Image.open(f'{SHOTS}/v1.1.11-{fn}').convert('RGB').resize((w, h), Image.LANCZOS)
        d.rounded_rectangle((x - 2, top - 2, x + w + 2, top + h + 2), radius=26, fill=CARD, outline=EDGE, width=3)
        im.paste(src, (x, top))
        text(d, (x + w / 2, top + h + 12), cap, 21, SUB, False, maxw=w + pad, align='center')
    im.save(f'{OUT}/fig9-界面全景.png')


# ---------------------------------------------------------------- 图 9 卡片图出口
def fig9():
    src = Image.open(f'{OUT}/笔记卡片图-成品.png').convert('RGB')
    w = 560
    h = int(src.height * w / src.width)
    W, H = 1600, max(h + 160, 760)
    im, d = new(W, H)
    text(d, (60, 40), '创新点③的证据：一条笔记生成一张卡片图', 38)
    text(d, (60, 100), '高度按内容排：短笔记末尾不留一大块空白，长笔记也不砍要点。图上的码是这条笔记自己的小程序码。',
         24, SUB, False, maxw=W - 120)
    x, y = 60, 160
    d.rounded_rectangle((x - 3, y - 3, x + w + 3, y + h + 3), radius=30, fill=CARD, outline=EDGE, width=3)
    im.paste(src.resize((w, h), Image.LANCZOS), (x, y))

    bx = x + w + 60
    text(d, (bx, y + 6), '它被翻到的时刻，不在屏幕里', 30, INK, True)
    uses = [('插进任意文章当配图', '之后从那张图就能调回来看，不用再回去翻列表'),
            ('离线打印出来', '贴在纸质手账、攻略本、笔记本上'),
            ('扫码直达这一条', '删掉笔记，图上那个码扫出来也就空了')]
    yy = y + 66
    for i, (t1, t2) in enumerate(uses):
        bg = [BLUE, GREEN, ORANGE][i]
        ink = WHITE if i < 2 else ORANGE_INK
        rrect(d, (bx, yy, W - 60, yy + 132), 22, fill=bg)
        text(d, (bx + 28, yy + 22), t1, 27, ink, True)
        text(d, (bx + 28, yy + 66), t2, 22, ink, False, maxw=W - 60 - bx - 56)
        yy += 148
    text(d, (bx, yy + 8), '这张图由端侧 Canvas 画出来：把"量"和"画"分成两趟，先测各块行数算出高度，再落笔。',
         22, SUB, False, maxw=W - 60 - bx)
    text(d, (bx, yy + 50), '同一张短笔记，卡片从固定 1200 高降到 638，标签与码之间那段空白消失了。', 22, SUB, False,
         maxw=W - 60 - bx)
    im.save(f'{OUT}/fig6-卡片图出口.png')


# ---------------------------------------------------------------- 图 10 六天与一个人
def fig10():
    W, H = 1600, 1080
    im, d = new(W, H)
    text(d, (60, 40), '六天，一个人，一台 3.7GB 的服务器', 38)
    nodes = [('09-17', '第一版可跑通的闭环', '链接、截图、分类、搜索、身份隔离'),
             ('09-19', 'OCR 定案自建', '个人主体拿不到官方接口，模型 token 做不了识别'),
             ('09-20', '后端整批上线现网', '混元链路打通，免费额度的归属被实测证实'),
             ('09-21', '界面定稿', '两版重做后定"左块右文"，令牌化，六套壁纸全适配'),
             ('09-22', '说明与回流', '十节隐私条款逐条对代码、分享好友、页头统计')]
    y = 200
    d.line([(110, y + 20), (110, y + 20 + 4 * 108)], fill=EDGE, width=6)
    for i, (date, title, body) in enumerate(nodes):
        yy = y + i * 108
        bg = [BLUE, ORANGE, PURPLE, GREEN, INK][i]
        ink = WHITE if i != 1 else ORANGE_INK
        d.ellipse((96, yy + 8, 124, yy + 36), fill=bg)
        rrect(d, (160, yy, 160 + 300, yy + 44), 12, fill=bg)
        text(d, (176, yy + 8), date, 24, ink, True)
        text(d, (486, yy + 2), title, 27, INK, True)
        text(d, (486, yy + 40), body, 22, SUB, False, maxw=W - 560)
    # 对比条
    by = y + 5 * 108 + 20
    rrect(d, (60, by, 780, by + 260), 26, fill=CARD, outline=EDGE)
    text(d, (86, by + 20), '按传统方式拆一遍', 26, INK, True)
    roles = ['后端工程师', '算法 / OCR', '小程序工程师', '视觉设计师', '测试']
    x = 86
    for r in roles:
        w, _ = chip(d, (x, by + 74), r, PAPER, INK, pad=14, size=21, r=12)
        x += w + 10
        if x > 700:
            x = 86
    text(d, (86, by + 130), '一支五人小组、一份预算、几个月排期', 22, SUB, False, maxw=660)
    text(d, (86, by + 168), '它们各自挡住的是同一个问题的不同侧面', 21, SUB, False)

    rrect(d, (820, by, W - 60, by + 260), 26, fill=BLUE)
    text(d, (846, by + 20), '而它现在的情况', 26, WHITE, True)
    text(d, (846, by + 66), '一个人 · 六天 · 125 次提交', 32, WHITE, True)
    text(d, (846, by + 120), '3.7GB 内存的服务器 · 零模型账单 · 193.7 KB 线上包', 22, WHITE, False,
         maxw=W - 60 - 846 - 30)
    text(d, (846, by + 208), '真正变化的是能力获取的门槛，不是"AI 帮我写了代码"。', 22, (226, 230, 255), False,
         maxw=W - 880)
    im.save(f'{OUT}/fig10-六天与一个人.png')


for fn in (fig1, fig2, fig3, fig4, fig5, fig6, fig7, fig8, fig9, fig10):
    fn()
    print('ok', fn.__name__)
