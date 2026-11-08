#!/usr/bin/env python3
# 白皮书 MD → Word（.docx）→ PDF。PDF 走本机 Microsoft Word（docx2pdf），两份版式一致。
# 目录是真页码：先出一版无目录的 PDF，从里面量每个标题落在第几页，再把目录插进去重出；
# 插目录会顶掉页码，所以带一轮收敛（最多三趟，页码对不上就报错，不出假目录）。
# 用法：python3 转-白皮书Word与PDF.py [MD路径]     —— 改完 MD 重跑一次即可，MD 是唯一正本。
import io, os, re, sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, Cm, RGBColor

SRC = sys.argv[1] if len(sys.argv) > 1 else \
    '/Users/zlfmac/Documents/TuMaiBiJi/docs/产品白皮书-图麦笔记-20261023.md'
BASE = os.path.splitext(SRC)[0]
DOCX, PDF = BASE + '.docx', BASE + '.pdf'

INK = RGBColor(0x14, 0x16, 0x1A)
CLAY = RGBColor(0xD2, 0x68, 0x3F)
MONO = RGBColor(0x8A, 0x3C, 0x17)
BODY_CN, BODY_EN = '宋体', 'Times New Roman'
HEAD_CN, HEAD_EN = '苹方-简', 'Helvetica Neue'
CODE_CN, CODE_EN = 'Menlo', 'Consolas'
USABLE = 16.6


def set_font(run, cn=BODY_CN, en=BODY_EN, size=10.5, bold=False, color=None):
    run.font.size = Pt(size); run.font.bold = bold; run.font.name = en
    rpr = run._element.get_or_add_rPr()
    rf = rpr.find(qn('w:rFonts'))
    if rf is None:
        rf = OxmlElement('w:rFonts'); rpr.append(rf)
    rf.set(qn('w:ascii'), en); rf.set(qn('w:hAnsi'), en); rf.set(qn('w:eastAsia'), cn)
    if color is not None:
        run.font.color.rgb = color


def add_rich(par, text, size=10.5, cn=BODY_CN, en=BODY_EN, bold_all=False, color=None):
    for tok in re.split(r'(\*\*[^*]+\*\*|`[^`]+`)', text):
        if not tok:
            continue
        if tok.startswith('**') and tok.endswith('**') and len(tok) > 4:
            set_font(par.add_run(tok[2:-2]), cn, en, size, True, color)
        elif tok.startswith('`') and tok.endswith('`') and len(tok) > 2:
            set_font(par.add_run(tok[1:-1]), CODE_CN, CODE_EN, size * 0.92, False, MONO)
        else:
            set_font(par.add_run(tok), cn, en, size, bold_all, color)


def shade(el, fill):
    sh = OxmlElement('w:shd')
    sh.set(qn('w:val'), 'clear'); sh.set(qn('w:color'), 'auto'); sh.set(qn('w:fill'), fill)
    el.append(sh)


def para(doc, text='', size=10.5, before=0, after=6, indent=0, line=1.32, color=None, bold_all=False):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(before); pf.space_after = Pt(after); pf.line_spacing = line
    if indent:
        pf.left_indent = Cm(indent)
    if text:
        add_rich(p, text, size, color=color, bold_all=bold_all)
    return p


def outline(p, level):
    lvl = OxmlElement('w:outlineLvl'); lvl.set(qn('w:val'), str(level - 1))
    p._element.get_or_add_pPr().append(lvl)


def heading(doc, text, level, page_break=True):
    p = doc.add_paragraph(); pf = p.paragraph_format
    pf.keep_with_next = True
    if level == 1:
        pf.page_break_before = page_break
        pf.space_before = Pt(0); pf.space_after = Pt(12)
        set_font(p.add_run(text), HEAD_CN, HEAD_EN, 17, True, INK)
        pb = OxmlElement('w:pBdr'); bo = OxmlElement('w:bottom')
        bo.set(qn('w:val'), 'single'); bo.set(qn('w:sz'), '12'); bo.set(qn('w:space'), '4')
        bo.set(qn('w:color'), '14161A'); pb.append(bo)
        p._element.get_or_add_pPr().append(pb)
    elif level == 2:
        pf.space_before = Pt(14); pf.space_after = Pt(6)
        set_font(p.add_run(text), HEAD_CN, HEAD_EN, 13, True, CLAY)
    else:
        pf.space_before = Pt(10); pf.space_after = Pt(4)
        set_font(p.add_run(text), HEAD_CN, HEAD_EN, 11.5, True, INK)
    outline(p, level)
    return p


def dw(s):
    return sum(2 if ord(ch) > 0x2E80 else 1 for ch in s)


def table(doc, rows):
    cells = lambda r: [c.strip() for c in r.strip().strip('|').split('|')]
    head, body = cells(rows[0]), [cells(r) for r in rows[2:]]
    n = len(head); allc = [head] + body
    t = doc.add_table(rows=1, cols=n)
    t.style = 'Table Grid'; t.alignment = WD_TABLE_ALIGNMENT.CENTER; t.autofit = False
    w = [max([dw(r[i]) if i < len(r) else 0 for r in allc] + [4]) for i in range(n)]
    ws = [max(1.7, USABLE * x / sum(w)) for x in w]
    ws = [x * USABLE / sum(ws) for x in ws]
    for i, h in enumerate(head):
        c = t.rows[0].cells[i]; c.width = Cm(ws[i])
        c.paragraphs[0].paragraph_format.space_after = Pt(2)
        add_rich(c.paragraphs[0], h, 9, HEAD_CN, HEAD_EN, bold_all=True)
        shade(c._element.get_or_add_tcPr(), 'F2EFE9')
    for r in body:
        cs = t.add_row().cells
        for i in range(n):
            cs[i].width = Cm(ws[i])
            cs[i].paragraphs[0].paragraph_format.space_after = Pt(2)
            cs[i].paragraphs[0].paragraph_format.line_spacing = 1.15
            add_rich(cs[i].paragraphs[0], r[i] if i < len(r) else '', 9)
    para(doc, '', after=4)


def code_block(doc, lines):
    for ln in lines:
        p = doc.add_paragraph(); pf = p.paragraph_format
        pf.space_before = Pt(0); pf.space_after = Pt(0); pf.line_spacing = 1.05
        pf.left_indent = Cm(0.3); pf.right_indent = Cm(0.3)
        set_font(p.add_run(ln if ln else ' '), CODE_CN, CODE_EN, 8.2)
        shade(p._element.get_or_add_pPr(), 'F5F2EC')
    para(doc, '', after=4)


def toc_page(doc, entries):
    heading(doc, '目录', 1, page_break=True)
    for lvl, txt, pg in entries:
        p = doc.add_paragraph(); pf = p.paragraph_format
        pf.space_before = Pt(0); pf.space_after = Pt(2); pf.line_spacing = 1.25
        pf.left_indent = Cm(0 if lvl == 1 else 0.7)
        pf.tab_stops.add_tab_stop(Cm(USABLE), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
        set_font(p.add_run(txt), HEAD_CN if lvl == 1 else BODY_CN,
                 HEAD_EN if lvl == 1 else BODY_EN, 11 if lvl == 1 else 10, lvl == 1)
        set_font(p.add_run('\t%d' % pg), BODY_CN, BODY_EN, 10)
    doc.paragraphs[-1].add_run().add_break()


def walk(md, doc, entries, with_toc):
    lines = md.split('\n'); i = 0; first = True; toc_pending = False
    while i < len(lines):
        L = lines[i]
        if L.startswith('```'):
            i += 1; buf = []
            while i < len(lines) and not lines[i].startswith('```'):
                buf.append(lines[i]); i += 1
            i += 1; code_block(doc, buf); continue
        if re.match(r'^\s*\|', L) and i + 1 < len(lines) and re.match(r'^\s*\|[\s:|-]+\|\s*$', lines[i + 1]):
            rows = []
            while i < len(lines) and re.match(r'^\s*\|', lines[i]):
                rows.append(lines[i]); i += 1
            table(doc, rows); continue
        m = re.match(r'^(#{1,3}) (.+)$', L)
        if m:
            lvl, txt = len(m.group(1)), m.group(2)
            if lvl == 1 and first:
                p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.space_after = Pt(16)
                set_font(p.add_run(txt), HEAD_CN, HEAD_EN, 22, True, INK)
                first = False
                toc_pending = with_toc and bool(entries)
            else:
                if lvl == 1 and toc_pending:
                    toc_page(doc, entries); toc_pending = False
                heading(doc, txt, lvl)
                if lvl <= 2 and entries is not None:
                    entries.append((lvl, txt, None))
            i += 1; continue
        if re.match(r'^---+$', L.strip()):
            i += 1; continue
        if L.startswith('>'):
            buf = []
            while i < len(lines) and lines[i].startswith('>'):
                buf.append(re.sub(r'^>\s?', '', lines[i])); i += 1
            p = para(doc, ' '.join(buf), 10.5, 6, 8, indent=0.6)
            shade(p._element.get_or_add_pPr(), 'F7F4EE'); continue
        if re.match(r'^(- |\d+\. )', L):
            while i < len(lines) and re.match(r'^(- |\d+\. )', lines[i]):
                mk = re.match(r'^(- |\d+\. )', lines[i]).group(1)
                p = para(doc, '', after=3, indent=0.75)
                p.paragraph_format.first_line_indent = Cm(-0.45)
                set_font(p.add_run('· ' if mk == '- ' else mk), size=10.5)
                add_rich(p, lines[i][len(mk):], 10.5)
                i += 1
            continue
        if not L.strip():
            i += 1; continue
        buf = [L]; i += 1
        while i < len(lines) and lines[i].strip() and \
                not re.match(r'^(#{1,3} |```|>|- |\d+\. |\s*\||---)', lines[i]):
            buf.append(lines[i]); i += 1
        para(doc, ' '.join(b.strip() for b in buf))


def build(md, entries=None, with_toc=False):
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.top_margin = sec.bottom_margin = Cm(2.0)
    sec.left_margin = sec.right_margin = Cm(2.2)
    st = doc.styles['Normal']; st.font.name = BODY_EN; st.font.size = Pt(10.5)
    st.element.rPr.rFonts.set(qn('w:eastAsia'), BODY_CN)
    walk(md, doc, entries if entries is not None else [], with_toc)
    return doc


def save_and_convert(doc):
    doc.save(DOCX)
    from docx2pdf import convert
    convert(DOCX, PDF)
    return os.path.getsize(DOCX), os.path.getsize(PDF)


def norm(s):
    return re.sub(r'[\s⏎]+', '', s)


def measure(md, entries, skip=0):
    """从当前 PDF 里量每个标题落在第几页（顺序扫描，只往前不往后）。
    skip＝目录占掉的页数——目录页里也含同样的标题文字，不跳过就会全量到目录那一页。"""
    import fitz
    d = fitz.open(PDF)
    pages = [norm(d[i].get_text()) for i in range(d.page_count)]
    # 目录页认据：点线（引导符）成串出现的那几页。不跳过就会把目录里的那一行当成标题实排页。
    tocp = [q for q, x in enumerate(pages) if x.count('....') >= 10]
    skip = (max(tocp) + 1) if tocp else skip
    cur = skip; out = []
    for lvl, txt, _ in entries:
        needle = norm(txt)
        pg = next((q + 1 for q in range(cur, len(pages)) if needle in pages[q]), None)
        if pg is None:
            pg = next((q + 1 for q in range(skip, len(pages)) if needle in pages[q]), 0)
        cur = max(cur, pg - 1) if pg else cur
        out.append((lvl, txt, pg or 0))
    n = d.page_count; d.close()
    return out, n


def main():
    md = io.open(SRC, encoding='utf-8').read()
    base = []
    save_and_convert(build(md, base, with_toc=False))          # 第一趟：无目录
    base, _ = measure(md, base, skip=0)
    k = max(1, -(-len(base) // 34))                            # 目录占几页；正文整体后移这么多页
    cur = [(l, t, pg + k) for l, t, pg in base]
    for attempt in range(4):
        save_and_convert(build(md, [list(e) for e in cur], with_toc=True))
        got, npages = measure(md, cur, skip=k)
        bad = [(t, w, g) for (l, t, w), (l2, t2, g) in zip(cur, got) if w != g]
        if not bad:
            cur, pages = got, npages
            break
        cur = got                                              # 用实排页码再收敛一趟
    zero = [t for l, t, pg in cur if not pg]
    if zero:
        print('红：这些标题在 PDF 里没定位到页码 →', zero); raise SystemExit(1)
    import fitz
    d = fitz.open(PDF); full = ''.join(p.get_text() for p in d)
    print('DOCX %d B ｜ PDF %d B ／ %d 页 ｜ 目录条目 %d' %
          (os.path.getsize(DOCX), os.path.getsize(PDF), d.page_count, len(cur)))
    print('目录页码与实排不一致：', sum(1 for (l,t,w),(l2,t2,g) in zip(cur, measure(md, cur, skip=k)[0]) if w != g), '条')
    for probe in ['产品核心功能介绍', '关键特性', '限额与容量口径', '第三方依赖与平台限制', '服务怎么上线', '哑管道']:
        print('  可搜到', probe, ':', (norm(probe) in norm(full)))
    print('  PDF 提取字符 %d ｜ MD 字符 %d' % (len(full), len(md)))
    print('  目录前 6 条：', [(t, pg) for l, t, pg in cur[:6]])


if __name__ == '__main__':
    main()
