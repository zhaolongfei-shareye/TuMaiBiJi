#!/usr/bin/env python3
# 量-风格统一全盘查.py ｜ 把 docs/对照-风格统一全盘查.md 里每一个数字变成可重跑的读数
#
# 为什么要有这一把：那份对照表第一次交付时，行号是在**剥掉注释的文本**上数的，
# 打开文件对不上 ⇒ 等于交付一把找不到的锚。这一把只认**原始行号**（`文件:行` 直接可跳）。
#
# 三条硬规矩（都是先前踩过的那两个坑）：
#   ① 数声明之前先把 `/* … */` 换成等量空白——注释里的选择器、色号不是声明，
#      但**不能删**（删了行号就漂），要占位成同长度空格，行号才不漂。
#   ② 只认 `.wxss`，且分「吃令牌 / 写死 / 混用」三类：混用那类（同一声明里半截 `var()` 半截 `rgba()`）
#      既不算"已统一"也不算"纯写死"，得单列——否则总数对不上、重复值也数漏。
#   ③ 重复值配对只在**同一属性、同一去空白后的值**上成立；跨属性（border vs inset box-shadow）不算重复。
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
FILES = sorted(ROOT.glob('miniprogram/**/*.wxss'))

# ---- 剥注释但保行号：把注释区间里的每个字符换成空格（换行留着） ----
def blank_comments(src: str) -> str:
    out = list(src)
    i, n = 0, len(src)
    while i < n:
        if src.startswith('/*', i):
            j = src.find('*/', i + 2)
            j = n if j < 0 else j + 2
            for k in range(i, j):
                if out[k] != '\n':
                    out[k] = ' '
            i = j
        else:
            i += 1
    return ''.join(out)


def line_of(src: str, pos: int) -> int:
    return src.count('\n', 0, pos) + 1


def rel(p: pathlib.Path) -> str:
    return str(p.relative_to(ROOT))


TOKEN = re.compile(r'var\(--[\w-]+\)')
COLOR = re.compile(r'rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b')
# 无单位的 `0` 也是写死的尺寸（CSS 里合法），漏了它会把 `border-radius: 0` 判成"吃令牌"——
# 这条先前真错过一次：那把尺子把 82 枚写死圆角报成 81、把 53 枚吃令牌报成 54。
LENGTH = re.compile(r'\d+(?:\.\d+)?(?:rpx|px|%|em)|\b0\b')
AXIS = {'color': COLOR, 'length': LENGTH}


def on_axis(value: str, axis: str) -> str:
    """按给定那一根轴分「吃令牌／混用／写死」：
    axis='color' 问的是颜色有没有写死，axis='length' 问的是尺寸有没有写死。
    ⚠ 一根轴的答案不能拿去回答另一根——投影那族要的是颜色（几何偏移写死是常事、不是遗漏），
      圆角那族要的是尺寸。`classify` 先前只按颜色判过一次，结果把 82 枚写死圆角全报成"吃令牌"，
      所以这里把轴显式写进函数签名，逼每次调用都答清楚问的是哪一根。"""
    has_tok = bool(TOKEN.search(value))
    has_hard = bool(AXIS[axis].search(TOKEN.sub('', value)))
    if has_tok and has_hard:
        return 'mixed'
    if has_hard:
        return 'hard'
    return 'token'


def scan(prop: str, axis: str = 'color'):
    pat = re.compile(r'(?<![-\w])' + re.escape(prop) + r'\s*:\s*([^;{}]+);')
    rows = []
    for f in FILES:
        raw = f.read_text(encoding='utf-8')
        body = blank_comments(raw)
        for m in pat.finditer(body):
            val = m.group(1).strip()
            kind = 'none' if re.fullmatch(r'\s*none\s*', val) else on_axis(val, axis)
            rows.append({'file': rel(f), 'line': line_of(raw, m.start()),
                         'val': val, 'kind': kind})
    return rows


def dupes(rows):
    """同属性内去空白后逐字相同的值，列出成对的 `文件:行`。
    全量比（连"色已吃令牌"的那批也比）：`0 0 0 3rpx var(--accent)` 两枚是逐字重复、
    只是重复的是"几何写死＋色吃令牌"这一整串——那也要报，否则漏掉一半重复。"""
    by = {}
    for r in rows:
        if r['kind'] == 'none':
            continue
        by.setdefault(re.sub(r'\s+', '', r['val']), []).append(r)
    return [(v, items) for v, items in by.items() if len(items) > 1]


def axes_counts(rows):
    """同一批声明，两根轴各数一遍（宽度写没写死 ／ 颜色写没写死）。"""
    out = {}
    for ax in ('color', 'length'):
        c = {}
        for r in rows:
            k = 'none' if r['kind'] == 'none' else on_axis(r['val'], ax)
            c[k] = c.get(k, 0) + 1
        out[ax] = c
    return out


def fmt_counts(c):
    return '吃令牌 %d／写死 %d／混用 %d%s' % (
        c.get('token', 0), c.get('hard', 0), c.get('mixed', 0),
        ('／none %d' % c['none']) if c.get('none') else '')


def report():
    print('== 扫到的 .wxss：', len(FILES), '个文件 ==')

    sh = scan('box-shadow')
    br = scan('border')
    bd = scan('border-radius', 'length')
    kinds = {}
    for r in sh:
        kinds[r['kind']] = kinds.get(r['kind'], 0) + 1
    print('\n[投影] box-shadow 声明', len(sh), '枚（问的是**颜色**这根轴）：', fmt_counts(kinds))
    print('  写死＋混用逐枚：')
    for r in sh:
        if r['kind'] in ('hard', 'mixed'):
            print('   %s:%-5d %s' % (r['file'], r['line'], r['val']))
    print('  逐字重复组（同属性、去空白后相同）：')
    for v, items in dupes(sh):
        print('   %-46s ← %s' % (v, '、'.join('%s:%d' % (x['file'], x['line']) for x in items)))

    # 三族墨底
    print('\n[墨底三族]')
    fam = {}
    for r in sh:
        for c in re.findall(r'rgba\((\d+),\s*(\d+),\s*(\d+)', r['val']):
            fam.setdefault(c, []).append('%s:%d' % (r['file'], r['line']))
    for c, where in sorted(fam.items(), key=lambda kv: -len(kv[1])):
        print('   rgba(%s,…)%-4d 枚：%s' % (','.join(c), len(where), '、'.join(where)))

    print('\n[圆角] border-radius 声明', len(bd), '枚（问的是**尺寸**这根轴）：',
          fmt_counts(axes_counts(bd)['length']))
    hard_vals = {}
    for r in bd:
        if r['kind'] in ('hard', 'mixed'):
            hard_vals[r['val']] = hard_vals.get(r['val'], 0) + 1
    print('  写死值分布（枚数 × 值）：')
    for v, n in sorted(hard_vals.items(), key=lambda kv: (-kv[1], kv[0])):
        print('   %2d × %s' % (n, v))
    print('  写死值里，**分量**恰好等于现有令牌的还有哪些（多角写法要拆成分量比，'
          '整值逐字比会漏掉 `0 0 40rpx 40rpx` 这种——它就等于 `0 0 var(--r-card) var(--r-card)`）：')
    app_body = blank_comments((ROOT / 'miniprogram/app.wxss').read_text(encoding='utf-8'))
    toks = dict(re.findall(r'(--r-[\w-]+):\s*([^;]+);', app_body))
    print('   （现读到的圆角令牌 %d 枚：%s）' % (
        len(toks), '、'.join('%s=%s' % (k, v.strip()) for k, v in sorted(toks.items()))))
    by_token = {}
    for r in bd:
        if r['kind'] == 'token':
            continue
        parts = [p.strip() for p in r['val'].split()]
        hit = [t for t, tv in toks.items()
               if any(p == tv.strip() for p in parts)]
        for t in hit:
            by_token.setdefault(t, []).append('%s:%d  %s' % (r['file'], r['line'], r['val']))
    if not by_token:
        print('   （无）')
    for t, where in sorted(by_token.items()):
        print('   %s（%s）%d 处：' % (t, toks[t].strip(), len(where)))
        for w in where:
            print('     ', w)

    bc = axes_counts(br)
    print('\n[描边] border 声明', len(br), '枚，两根轴分开答：')
    print('   颜色轴：', fmt_counts(bc['color']))
    print('   宽度轴：', fmt_counts(bc['length']))
    inset = [r for r in sh if 'inset' in r['val']]
    print('  `box-shadow: inset` 描边式', len(inset), '枚：',
          '、'.join('%s:%d' % (r['file'], r['line']) for r in inset))
    print('  border 写死宽度分布：')
    w = {}
    for r in br:
        m2 = re.search(r'(\d+(?:\.\d+)?(?:rpx|px))', r['val'])
        if m2:
            w[m2.group(1)] = w.get(m2.group(1), 0) + 1
    for v, n in sorted(w.items(), key=lambda kv: -kv[1]):
        print('   %2d × %s' % (n, v))

    # 压在形象图上的白字：.has-bg 块内的纸白(242,239,233 / #f2efe9)与纯白(255,255,255 / #fff)
    # ⚠ 三种形态分开数，混在一起会写出"白字 N 处"这种没法核对的话：
    #    ① 直接写在 `color:`／`background:` 上的 rgba()；② 同一处的纯白 hex（不透明，α 视作 1）；
    #    ③ 在 `.has-bg` 块里**重新定义令牌**（`--text-primary: #f2efe9` 这种）——那不是"没吃令牌"，
    #       是"令牌的图上那一版"，得单列，否则会把已有的正确写法也算成遗漏。
    print('\n[白字] .has-bg 块里那几支纸白/纯白')
    alpha = {}
    hexes = []
    overrides = []
    nblocks = 0
    white_re = re.compile(
        r'(?:(?:--[\w-]+)\s*:\s*(#f2efe9|rgba\((?:242,\s*239,\s*233|255,\s*255,\s*255)[^)]*\))'
        r'|rgba\((?:242,\s*239,\s*233|255,\s*255,\s*255),\s*([\d.]+)\s*\)'
        r'|#[fF]2[eE][fF](?:[eE]9|[fF]9)'
        r'|#[fF]{3,6})')
    for f in FILES:
        raw = f.read_text(encoding='utf-8')
        body = blank_comments(raw)
        for m in re.finditer(r'\.has-bg[^{]*\{', body):
            end = body.find('}', m.start())
            if end < 0:
                continue
            nblocks += 1
            seg = body[m.start():end]
            base = m.start()
            for cm in white_re.finditer(seg):
                where = '%s:%d' % (rel(f), line_of(raw, base + cm.start()))
                val = cm.group(0)
                if cm.group(1):
                    overrides.append('%s  %s' % (where, val))
                elif cm.group(2):
                    alpha.setdefault(cm.group(2), []).append(where)
                else:
                    hexes.append('%s  %s' % (where, val))
    print('  `.has-bg` 块共', nblocks, '块')
    print('  形态①带 α 的 rgba：', sum(len(v) for v in alpha.values()), '处、',
          len(alpha), '个 α 档')
    for k, where in sorted(alpha.items(), key=lambda kv: (-len(kv[1]), -float(kv[0]))):
        print('   α=%-5s %d 处：%s' % (k, len(where), '、'.join(where)))
    print('  形态②不透明 hex（α＝1）：', len(hexes), '处')
    for h in hexes:
        print('   ', h)
    print('  形态③块内重定义令牌：', len(overrides), '处')
    for h in overrides:
        print('   ', h)

    return 0


if __name__ == '__main__':
    sys.exit(report())
