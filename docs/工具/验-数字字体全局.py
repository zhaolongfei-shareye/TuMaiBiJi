#!/usr/bin/env python3
# 全局"纯数字加符号"字体这条口径的静态尺子（不连模拟器，纯读文件）。
# 跑法：python3 docs/工具/验-数字字体全局.py
#
# 站长 10-01 晚拍的：所有纯数字加符号的显示字段统一吃 WtsjMind（Poppins Thin 子集），
# **但只改字体，字号一个都不动**；数字加中文的那种（笔记内文、"+10 篇"这种）不算。
# 这条口径有两个地方会悄悄坏掉，所以两边都要钉：
#   ① 内嵌的那份子集只有 0-9 时，`09-25` 里那个连字符会掉回系统字体——一行数字两种字形；
#   ② 各页偷偷再抄一份 base64，包里的字体就成双份了（原来那条 @font-face 只允许存在一次）。
import base64
import io
import os
import re
import sys
from fontTools.ttLib import TTFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
MP = os.path.join(ROOT, 'miniprogram')


def p(rel):
    return os.path.join(MP, rel)


def read(rel):
    return io.open(p(rel), encoding='utf-8').read()


fails = []
n = 0


def ok(name, cond, extra=''):
    global n
    if cond:
        n += 1
        return
    fails.append(f'{name}' + (f' —— {extra}' if extra else ''))


# ---------- ① 声明只有一份，而且只有 app.wxss 里有 ----------
app = read('app.wxss')
FACE = re.compile(r'@font-face\s*\{')
ok('app.wxss 里恰好一条 @font-face', len(FACE.findall(app)) == 1, len(FACE.findall(app)))
others = []
for dirpath, _dirs, files in os.walk(MP):
    for fn in files:
        if not fn.endswith('.wxss'):
            continue
        rel = os.path.relpath(os.path.join(dirpath, fn), MP)
        if rel == 'app.wxss':
            continue
        if FACE.findall(read(rel)):
            others.append(rel)
ok('其余 wxss 没有第二份声明（字体不许抄两份）', not others, ','.join(others))

m = re.search(r"url\(data:font/ttf;base64,([A-Za-z0-9+/=]+)\)", app)
ok('那条声明里带得出一段 base64', bool(m))
subset = base64.b64decode(m.group(1)) if m else b''
font = TTFont(io.BytesIO(subset))
have = {chr(k) for k in font.getBestCmap()}
ok('子集解得开、真的是一份 TTF', len(subset) > 500 and have, f'{len(subset)} 字节 {len(have)} 字形')

# ---------- ② 每个字段吃不吃这支，以及它用的符号在不在子集里 ----------
# (页面 wxss, 选择器, 字号原值——这位是他的"只改字体、尺寸不变"那条的凭据, 这一格会显示哪些非数字字符)
FIELDS = [
    ('pages/me/me.wxss', '.score-n', '64rpx', '', '我的页右上角那枚大数字（本来就是这支）'),
    ('pages/index/index.wxss', '.stat .n', '64rpx', '', '首页顶部三列的数字（本来就是这支）'),
    ('pages/index/index.wxss', '.dt', 'var(--fs-meta)', '-', '列表行日期 MM-DD'),
    ('pages/index/index.wxss', '.ds-pt-n', 'var(--fs-tiny)', '', '首页展开态要点序号'),
    ('pages/detail/detail.wxss', '.point-num', 'var(--fs-tiny)', '', '详情页要点序号'),
    ('pages/share/view.wxss', '.point-num', '22rpx', '', '扫码落地页要点序号'),
    ('pages/me/me.wxss', '.rule-value', 'var(--fs-title)', '+', '魅力值规则那三行的数（100 / +10 / +1）'),
    ('pages/write/write.wxss', '.char-count', 'var(--fs-tiny)', '/', '摘要字数 137/500'),
    ('pages/me/me.wxss', '.about-ver', 'var(--fs-label)', 'v.', '「我的」页那枚版本号（具体号由 appInfo.js 定，这里不钉）'),
    ('pages/about/about.wxss', '.brand-ver', 'var(--fs-micro)', 'v.', '关于页那枚版本号'),
]
for rel, sel, size, symbols, what in FIELDS:
    wxss = read(rel)
    mm = re.search(r'(^|\n)' + re.escape(sel) + r'\s*\{([^}]*)\}', wxss)
    ok(f'{rel} 里 {sel} 这条规则还在', bool(mm), what)
    if not mm:
        continue
    body = mm.group(2)
    ok(f'{what}（{sel}）吃 WtsjMind', "font-family: 'WtsjMind'" in body,
       re.sub(r'\s+', ' ', body)[:90])
    got = re.search(r'font-size:\s*([^;]+);', body)
    ok(f'{what}（{sel}）字号仍是 {size}', bool(got) and got.group(1).strip() == size,
       got.group(1).strip() if got else '没写字号')
    need = set(symbols) | set('0123456789')
    miss = sorted(need - have)
    ok(f'{what}（{sel}）用到的字符都在子集里：缺 {miss}', not miss, ''.join(miss))

# 「关于」那一组最底下的数字不再挂 .menu-value：站长 10-01 深夜把「魅力 + 数字」整行撤了，
# 换成一块规则，数另起一格（.rule-value）。所以旧的那条"另起 .menu-value.num"跟着作废，
# 反面判据也升级成"这一格整条不许再存在"——留着就是一条没人用的死样式。
me = read('pages/me/me.wxss')
ok('.menu-value.num 整条已随那一行撤掉（不留没人在用的样式）',
   re.search(r'\.menu-value\.num\s*\{', me) is None)
ok('公共那条 .menu-value 没有 font-family（含汉字和字母的值不许被带进去）',
   re.search(r'\.menu-value\s*\{[^}]*font-family', me) is None)
me_wx = read('pages/me/me.wxml')
ok('wxml 里不再挂 num，规则块那一格挂 .rule-value',
   'menu-value num' not in me_wx and me_wx.count('class="menu-value"') == 3
   and me_wx.count('class="rule-value"') == 1,
   f'num={"menu-value num" in me_wx} 公共={me_wx.count(chr(34) + "menu-value" + chr(34))} rule={me_wx.count(chr(34) + "rule-value" + chr(34))}')

# ---------- ③ 反面：数字加中文的那些字段没被误伤 ----------
MIXED = [
    ('pages/index/index.wxss', '.stat .l', '三列下面那行小字（笔记/分享/种草）'),
    ('pages/index/index.wxss', '.ds-meta', '首页展开态那行（来源 · 时间，汉字和数字混在一格）'),
    ('pages/detail/detail.wxss', '.hero-meta', '详情页头部那行（来源 · 时间，同上）'),
]
for rel, sel, what in MIXED:
    body = re.search(r'(^|\n)' + re.escape(sel) + r'\s*\{([^}]*)\}', read(rel))
    if not body:
        continue
    ok(f'{what}（{sel}）没被塞进这支字体', "font-family: 'WtsjMind'" not in body.group(2))

print(f'数字字体全局：{n} 条通过')
if fails:
    print(f'失败 {len(fails)} 条：')
    for f in fails:
        print('  ✗ ' + f)
    sys.exit(1)
