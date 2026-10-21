#!/usr/bin/env python3
"""把「配置页面太长」画成三张方向图，给他挑（视觉方案先出图再写码：代码一行没动）。

数从哪来：`docs/design/后台布局-量数-20261021/现网-量数.txt`——那是 `docs/工具/量-后台每一屏多长.mjs`
在 1440×900 现网只读量出来的真数（`getBoundingClientRect`，不是眼看）。屏数的分母是一屏 900px。

每张图左右两栏：**现在多长** vs **改成这样多长**，两栏共用一把比例尺（同一 px → 同一块高），
所以"短了多少"是看得见的；尺上那几条虚线是"第 2 屏／第 3 屏…"的界线。
块上的字抄的是屏上真有的那几张卡名与那几块，不另造叫法。

跑法：cd /Users/zlfmac/Documents/TuMaiBiJi && backend/.venv/bin/python docs/工具/出-后台布局方向图.py
"""
import pathlib
import subprocess

OUT = pathlib.Path('docs/design/后台布局-方向图-20261021')
OUT.mkdir(parents=True, exist_ok=True)
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
VH = 900                      # 一屏多高（现网那把尺用的就是这个视口）
BAR = 520                     # 最长那一栏画出来占多少像素

# 现网实测：配置屏 5 张卡（卡名、整卡高 px、里面超过 60px 的那几块）
CONFIG = [('首页默认背景图', 801, ['预览大图 320', '历史那一排 210']),
          ('帮助文档那张配图', 801, ['预览大图 320', '历史那一排 210']),
          ('首屏那行 Tips', 569, ['中文那格 120', 'EN 那格 120']),
          ('帮助文档（官方那一篇）', 1175, ['五格语言 120×5']),
          ('来源黑名单', 428, ['那行说明 107', '那张表 119'])]

CSS = """
:root { --ink:#14161A; --muted:#5f636c; --line:#e3e0d8; --paper:#F2EFE9; --clay:#D2683F; }
* { box-sizing:border-box }
body { margin:0; padding:26px 30px 34px; background:#fff; font-family:-apple-system,"PingFang SC",sans-serif; color:var(--ink) }
h1 { font-size:20px; margin:0 0 2px }
.lead { font-size:12.5px; color:var(--muted); margin:0 0 6px; max-width:1100px }
.tagline { font-size:11.5px; color:var(--clay); margin:0 0 18px }
.grid { display:flex; gap:26px; align-items:flex-start }
.col { flex:1; background:var(--paper); border:1px solid var(--line); border-radius:12px; padding:14px 16px 16px }
.col h2 { font-size:13px; margin:0 0 3px }
.cap { font-size:11.5px; color:var(--muted); margin:0 0 12px; min-height:30px }
.ruler { position:relative; border-left:2px solid var(--ink); padding-left:10px }
.ln { position:absolute; left:-10px; right:0; border-top:1px dashed #cfc9bc }
.ln i { position:absolute; right:0; top:-13px; font-size:10px; color:#a29d90; font-style:normal }
.card { background:#fff; border:1px solid var(--line); border-radius:7px; margin-bottom:4px; padding:4px 8px;
  font-size:11px; line-height:1.3; overflow:hidden }
.card b { font-weight:600 }
.card small { display:block; color:var(--muted); font-size:10px }
.total { margin:10px 0 0; font-size:12.5px }
.total span { color:var(--clay); font-weight:600 }
.note { font-size:11.5px; color:var(--muted); margin:10px 0 0; line-height:1.75 }
.note b { color:var(--ink) }
"""


def bar(cards, scale):
    """按同一把尺画一列卡。块高不足 15px 压到 15px（不然名字写不下）；屏界线按真实累加高画。"""
    out = []
    y = 0
    for i, (name, h, parts) in enumerate(cards):
        hh = max(15, round(h * scale))
        inner = f'<b>{i + 1}. {name}</b>'
        if hh >= 30:
            inner += f'<small>{"、".join(parts)}　实测 {h}px</small>'
        out.append(f'<div class="card" style="height:{hh}px">{inner}</div>')
        y += hh + 4
    lines = ''
    n = 1
    while n * VH * scale < y:
        lines += f'<div class="ln" style="top:{round(n * VH * scale)}px"><i>第 {n + 1} 屏</i></div>'
        n += 1
    return f'<div class="ruler" style="height:{y}px">{"".join(out)}{lines}</div>'


def figure(pairs):
    """pairs = [(小标题, 说明, 卡列表, 屏数, 脚注)]；两栏共用一把尺（按最长那栏定）。"""
    tallest = max(sum(h for _, h, _ in c) for _, _, c, _, _ in pairs)
    scale = BAR / tallest
    cols = ''
    for t, cap, cards, screens, foot in pairs:
        cols += (f'<div class="col"><h2>{t}</h2><p class="cap">{cap}</p>' + bar(cards, scale)
                 + f'<p class="total">整屏文档高＝<span>{screens} 屏</span>（一屏 {VH}px）</p>'
                 + (f'<p class="note">{foot}</p>' if foot else '') + '</div>')
    return f'<div class="grid">{cols}</div>'


def page(title, lead, tag, body):
    return ('<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>' + title +
            '</title><style>' + CSS + '</style></head><body><h1>' + title + '</h1>'
            '<p class="lead">' + lead + '</p><p class="tagline">' + tag + '</p>' + body + '</body></html>')


LEAD = ('数是从现网只读量出来的（1440×900，量的是 `getBoundingClientRect`，不是眼看）：'
        '数据屏 8 张卡＝4.13 屏、配置屏 5 张卡＝4.71 屏、卡片模板屏 20 张卡＝14.15 屏。'
        '两栏同一把比例尺，虚线是一屏的界线；图是按实测高度画的，标「示意」。')

A = figure([
    ('现在：点一条只是把页面挪一下，五张卡仍排在一列', '点左栏「运营图」滚到第一张，往下还有四张',
     CONFIG, '4.71', '这就是"太长"那一处：改一句 Tips 要先滚过两张图片卡（各 0.89 屏）才碰到它。'),
    ('甲：点一条只出那一张卡（一栏一屏）', '左栏那 14 条本来就是"一栏一条"，把滚动定位换成只露那一张',
     CONFIG[:1], '0.89',
     '最长的那一张（帮助文档 1,175px）也就 <b>1.31 屏</b>，一屏多一点，不用再滚。<br>'
     '卡片模板那一栏同一套：20 套先只出一列名＋状态，点一套才展开预览与配方 → <b>14.15 屏 → 约 1 屏</b>。<br>'
     '<b>代价</b>：想并着看两张要来回点；"整组一眼扫完"这个动作没了。'),
])

B = figure([
    ('现在：一列排下去', '同样那 5 张卡', CONFIG, '4.71', ''),
    ('乙：宽屏两张并排，窄屏自动退一列', '卡片内部一个字不改，只是两列', CONFIG, '2.55',
     '两列里最高那一张 1,175px 单独占一行，所以最短只能压到 <b>2.55 屏</b>。<br>'
     '卡片模板那 20 张并成两列 → <b>14.15 屏 → 7.08 屏</b>，还是要滚 7 屏。<br>'
     '<b>代价</b>：中文与 EN 那两个 120px 的框、五格语言会被挤窄；"太长"只解决了一半。'),
])

C = figure([
    ('现在：预览大图与历史那一排都摊着', '两张图片卡各 801px，其中 530px 是预览与历史', CONFIG, '4.71', ''),
    ('丙：卡内折叠——默认只留 标题＋当前生效那一行＋按钮＋预览', '把"历史那一排"和"五格语言"收进点开',
     [('首页默认背景图', 320, ['预览大图留着（发布前先看一眼那一格）']),
      ('帮助文档那张配图', 320, ['预览大图留着']),
      ('首屏那行 Tips', 96, ['两格文本框点开']),
      ('帮助文档（官方那一篇）', 96, ['五格语言点开']),
      ('来源黑名单', 96, ['那张表点开'])],
     '1.05',
     '压得最狠：<b>4.71 屏 → 约 1 屏</b>。但有一处碰不得——预览那一格是<b>"发布之前先看一眼"</b>唯一的地方'
     '（换明暗差很多的图会带偏首页那几行字的对比度，服务端算不出来），所以图片那两张的预览<b>不折</b>。<br>'
     '<b>代价</b>：日常改一句 Tips 也要多点一下才看得到框。'),
])

JOBS = [('方向图甲-一栏一屏', '方向甲：一栏一屏（我推荐这一条）', A,
         '左栏那条本来就是"一栏一条"，这一改只是让它真的只出一栏；不新增第二套皮。'),
        ('方向图乙-两列排', '方向乙：宽屏两张并排', B, '最保守，但最长那一屏还是要滚 7 屏。'),
        ('方向图丙-卡内折叠', '方向丙：卡内折叠', C, '减得最多，代价是多一次点开。')]

for stem, title, body, tag in JOBS:
    html = OUT / (stem + '.html')
    html.write_text(page(title, LEAD, tag, body), encoding='utf-8')
    png = OUT / (stem + '.png')
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
                    f'--screenshot={png}', '--window-size=1440,900', f'file://{html.resolve()}'],
                   check=True, capture_output=True)
    print('出图', png)
