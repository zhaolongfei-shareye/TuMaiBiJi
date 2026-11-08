#!/usr/bin/env python3
# 把产品白皮书 MD 渲染成同目录的只读 HTML（左侧可点目录，20 张表全渲）。
# 用法：python3 出-白皮书HTML渲染.py [MD路径]   —— 改完 MD 重跑一次即可，MD 是唯一正本。
import io, re, html, os, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else \
    '/Users/zlfmac/Documents/TuMaiBiJi/docs/产品白皮书-图麦笔记-20261023.md'
DST = os.path.splitext(SRC)[0] + '.html'

def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    return re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)

def slug(x):
    return re.sub(r'[^\w一-鿿]+', '-', x).strip('-')

def convert(md):
    lines = md.split('\n'); out = []; toc = []; i = 0
    while i < len(lines):
        L = lines[i]
        if L.startswith('```'):
            i += 1; buf = []
            while i < len(lines) and not lines[i].startswith('```'):
                buf.append(lines[i]); i += 1
            i += 1
            out.append('<pre><code>' + html.escape('\n'.join(buf)) + '</code></pre>'); continue
        if re.match(r'^\s*\|', L) and i + 1 < len(lines) and re.match(r'^\s*\|[\s:|-]+\|\s*$', lines[i + 1]):
            rows = []
            while i < len(lines) and re.match(r'^\s*\|', lines[i]):
                rows.append(lines[i]); i += 1
            cells = lambda r: [c.strip() for c in r.strip().strip('|').split('|')]
            t = '<div class="tw"><table><thead><tr>' + \
                ''.join('<th>' + inline(c) + '</th>' for c in cells(rows[0])) + '</tr></thead><tbody>'
            for r in rows[2:]:
                t += '<tr>' + ''.join('<td>' + inline(c) + '</td>' for c in cells(r)) + '</tr>'
            out.append(t + '</tbody></table></div>'); continue
        m = re.match(r'^(#{1,3}) (.+)$', L)
        if m:
            lvl = len(m.group(1)); txt = m.group(2)
            if lvl <= 2: toc.append((lvl, txt, slug(txt)))
            out.append('<h%d id="%s">%s</h%d>' % (lvl, slug(txt), inline(txt), lvl)); i += 1; continue
        if re.match(r'^---+$', L.strip()): out.append('<hr>'); i += 1; continue
        if L.startswith('>'):
            buf = []
            while i < len(lines) and lines[i].startswith('>'):
                buf.append(lines[i].lstrip('> ').strip()); i += 1
            out.append('<blockquote><p>' + inline(' '.join(buf)) + '</p></blockquote>'); continue
        if re.match(r'^(- |\d+\. )', L):
            ordered = bool(re.match(r'^\d+\. ', L)); items = []
            while i < len(lines) and re.match(r'^(- |\d+\. )', lines[i]):
                items.append(re.sub(r'^(- |\d+\. )', '', lines[i])); i += 1
            tag = 'ol' if ordered else 'ul'
            out.append('<%s>' % tag + ''.join('<li>' + inline(x) + '</li>' for x in items) + '</%s>' % tag); continue
        if not L.strip(): i += 1; continue
        buf = [L]; i += 1
        while i < len(lines) and lines[i].strip() and \
                not re.match(r'^(#{1,3} |```|>|- |\d+\. |\s*\||---)', lines[i]):
            buf.append(lines[i]); i += 1
        out.append('<p>' + inline(' '.join(b.strip() for b in buf)) + '</p>')
    return out, toc

CSS = """*{box-sizing:border-box}body{margin:0;background:#faf8f4;color:#14161A;font:15px/1.78 -apple-system,"PingFang SC","Hiragino Sans GB",sans-serif}
.wrap{display:flex;gap:28px;max-width:1360px;margin:0 auto;padding:0 22px}
nav{width:270px;flex:0 0 270px;position:sticky;top:0;align-self:flex-start;height:100vh;overflow:auto;padding:22px 0;border-right:1px solid #DEDAD2}
nav h4{margin:0 0 12px;font-size:12px;letter-spacing:.14em;color:#6A6459}
nav a{display:block;color:#6A6459;text-decoration:none;font-size:12.5px;padding:4px 10px 4px 0;border-left:2px solid transparent}
nav a.t1{color:#14161A;font-weight:600;font-size:13px;margin-top:10px;padding-left:10px}
nav a.t2{padding-left:22px}nav a:hover{color:#D2683F;border-left-color:#D2683F}
main{flex:1;min-width:0;padding:26px 0 90px}
h1{font-size:26px;margin:36px 0 14px;padding-bottom:10px;border-bottom:2px solid #14161A}h1:first-of-type{margin-top:0}
h2{font-size:19px;margin:30px 0 10px;color:#D2683F}h3{font-size:16px;margin:22px 0 8px}
p{margin:10px 0}ul,ol{margin:10px 0;padding-left:22px}li{margin:5px 0}
code{background:#efe9df;border:1px solid #e3dbd0;padding:1px 5px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:#8a3c17}
pre{background:#fff;border:1px solid #DEDAD2;border-left:3px solid #14161A;padding:14px 16px;overflow:auto;border-radius:4px}
pre code{background:none;border:none;padding:0;color:#14161A;font-size:12.8px;line-height:1.7;white-space:pre}
.tw{overflow-x:auto;margin:14px 0}table{border-collapse:collapse;width:100%;background:#fff;font-size:13.2px}
th,td{border:1px solid #DEDAD2;padding:8px 11px;text-align:left;vertical-align:top}th{background:#F2EFE9;font-weight:600;white-space:nowrap}
tbody tr:nth-child(even){background:#fcfaf6}blockquote{margin:16px 0;padding:12px 18px;background:#fff;border-left:3px solid #D2683F;border-radius:0 4px 4px 0}
hr{border:none;border-top:1px solid #DEDAD2;margin:26px 0}strong{font-weight:650}
.banner{background:#F2EFE9;border:1px solid #DEDAD2;border-radius:6px;padding:10px 14px;margin-bottom:22px;font-size:12.5px;color:#6A6459}"""

md = io.open(SRC, encoding='utf-8').read()
out, toc = convert(md)
nav = ''.join('<a class="t%d" href="#%s">%s</a>' % (l, s, html.escape(t)) for l, t, s in toc)
banner = ('<div class="banner">正本 <code>%s</code> · %d B／%d 行 · 本 HTML 由它渲染，只读；改稿请改 MD 后重跑 '
          '<code>docs/工具/出-白皮书HTML渲染.py</code></div>' % (html.escape(SRC), len(md.encode()), md.count('\n') + 1))
doc = ('<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>图麦笔记 · 产品白皮书</title>'
       '<style>%s</style></head><body><div class="wrap"><nav><h4>目录</h4>%s</nav><main>%s%s</main></div></body></html>'
       % (CSS, nav, banner, ''.join(out)))
io.open(DST, 'w', encoding='utf-8').write(doc)
print('MD %d B／%d 行 → HTML %d B｜表 %d 张（MD 分隔行 %d）｜目录 %d 条｜围栏 %d 个' % (
    len(md.encode()), md.count('\n') + 1, len(doc.encode()),
    doc.count('<table>'), len(re.findall(r'^\|[\s:|-]+\|$', md, re.M)),
    nav.count('<a '), doc.count('<pre>')))
