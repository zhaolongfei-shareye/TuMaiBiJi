# -*- coding: utf-8 -*-
"""把 src/*.md 组装为规范的中文研究报告 docx。"""
import os, re, glob, sys
from docx import Document
from docx.shared import Pt, Cm, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, 'src')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE, 'out.docx')

BODY_FONT = '仿宋'
HEAD_FONT = '黑体'
LATIN_FONT = 'Times New Roman'
BODY_SIZE = Pt(12)

TITLE = '服饰产业数字化智能化绿色化转型解决方案研究报告'
SUBTITLE = '——面向中小制造企业的轻量化工业软件与产业公共服务平台设计'


def set_run_font(run, cn=BODY_FONT, latin=LATIN_FONT, size=BODY_SIZE, bold=None, color=None):
    run.font.name = latin
    run.font.size = size
    if bold is not None:
        run.font.bold = bold
    if color is not None:
        run.font.color.rgb = color
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    rFonts.set(qn('w:ascii'), latin)
    rFonts.set(qn('w:hAnsi'), latin)
    rFonts.set(qn('w:eastAsia'), cn)
    rFonts.set(qn('w:cs'), latin)


def add_field(paragraph, instr, placeholder='', size=Pt(10.5)):
    run = paragraph.add_run()
    fld = OxmlElement('w:fldChar'); fld.set(qn('w:fldCharType'), 'begin'); fld.set(qn('w:dirty'), 'true')
    run._r.append(fld)
    run2 = paragraph.add_run()
    it = OxmlElement('w:instrText'); it.set(qn('xml:space'), 'preserve'); it.text = instr
    run2._r.append(it)
    run3 = paragraph.add_run()
    sep = OxmlElement('w:fldChar'); sep.set(qn('w:fldCharType'), 'separate')
    run3._r.append(sep)
    if placeholder:
        r4 = paragraph.add_run(placeholder)
        set_run_font(r4, size=size)
    run5 = paragraph.add_run()
    end = OxmlElement('w:fldChar'); end.set(qn('w:fldCharType'), 'end')
    run5._r.append(end)


def setup_section(sec, header_text=None, numfmt='decimal', start=None, first=False):
    sec.page_width = Cm(21.0)
    sec.page_height = Cm(29.7)
    sec.left_margin = Cm(3.17)
    sec.right_margin = Cm(3.17)
    sec.top_margin = Cm(2.54)
    sec.bottom_margin = Cm(2.54)
    sec.header_distance = Cm(1.5)
    sec.footer_distance = Cm(1.5)
    # 页脚页码
    footer = sec.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for r in list(p.runs):
        r._r.getparent().remove(r._r)
    add_field(p, ' PAGE ', '1')
    # 页码格式
    sectPr = sec._sectPr
    old = sectPr.find(qn('w:pgNumType'))
    if old is not None:
        sectPr.remove(old)
    pg = OxmlElement('w:pgNumType')
    pg.set(qn('w:fmt'), numfmt)
    if start is not None:
        pg.set(qn('w:start'), str(start))
    sectPr.append(pg)
    # 页眉
    header = sec.header
    header.is_linked_to_previous = False
    hp = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
    hp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for r in list(hp.runs):
        r._r.getparent().remove(r._r)
    if header_text:
        hr = hp.add_run(header_text)
        set_run_font(hr, size=Pt(9), color=RGBColor(0x59, 0x59, 0x59))
        # 下边框
        pPr = hp._p.get_or_add_pPr()
        pbdr = OxmlElement('w:pBdr')
        bottom = OxmlElement('w:bottom')
        bottom.set(qn('w:val'), 'single'); bottom.set(qn('w:sz'), '4')
        bottom.set(qn('w:space'), '1'); bottom.set(qn('w:color'), '999999')
        pbdr.append(bottom); pPr.append(pbdr)


def style_doc(doc):
    st = doc.styles['Normal']
    st.font.name = LATIN_FONT
    st.font.size = BODY_SIZE
    st.element.rPr.rFonts.set(qn('w:eastAsia'), BODY_FONT)
    pf = st.paragraph_format
    pf.line_spacing = 1.5
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.first_line_indent = Pt(24)
    for lvl, size, before, after, align in [
        (1, Pt(16), Pt(18), Pt(16), WD_ALIGN_PARAGRAPH.CENTER),
        (2, Pt(14), Pt(14), Pt(8), WD_ALIGN_PARAGRAPH.LEFT),
        (3, Pt(12), Pt(8), Pt(4), WD_ALIGN_PARAGRAPH.LEFT),
        (4, Pt(12), Pt(6), Pt(3), WD_ALIGN_PARAGRAPH.LEFT),
    ]:
        s = doc.styles['Heading %d' % lvl]
        s.font.name = LATIN_FONT
        s.font.size = size
        s.font.bold = True
        s.font.color.rgb = RGBColor(0, 0, 0)
        rpr = s.element.get_or_add_rPr()
        rf = rpr.find(qn('w:rFonts'))
        if rf is None:
            rf = OxmlElement('w:rFonts'); rpr.append(rf)
        rf.set(qn('w:ascii'), LATIN_FONT)
        rf.set(qn('w:hAnsi'), LATIN_FONT)
        rf.set(qn('w:eastAsia'), HEAD_FONT)
        rf.set(qn('w:cs'), LATIN_FONT)
        s.paragraph_format.space_before = before
        s.paragraph_format.space_after = after
        s.paragraph_format.line_spacing = 1.5
        s.paragraph_format.first_line_indent = Pt(0)
        s.paragraph_format.keep_with_next = True
        s.paragraph_format.alignment = align


def para(doc, text, style=None, indent=True, align=None, size=None, cn=None, bold=False,
         space_before=None, space_after=None, line_spacing=None):
    p = doc.add_paragraph(style=style) if style else doc.add_paragraph()
    if not indent:
        p.paragraph_format.first_line_indent = Pt(0)
    if align is not None:
        p.alignment = align
    if space_before is not None:
        p.paragraph_format.space_before = space_before
    if space_after is not None:
        p.paragraph_format.space_after = space_after
    if line_spacing is not None:
        p.paragraph_format.line_spacing = line_spacing
    add_inline(p, text, size=size or BODY_SIZE, cn=cn or BODY_FONT, bold=bold)
    return p


BOLD_RE = re.compile(r'(\*\*.+?\*\*)')


def add_inline(p, text, size=BODY_SIZE, cn=BODY_FONT, bold=False):
    for part in BOLD_RE.split(text):
        if not part:
            continue
        if part.startswith('**') and part.endswith('**') and len(part) > 4:
            r = p.add_run(part[2:-2])
            set_run_font(r, cn=HEAD_FONT, size=size, bold=True)
        else:
            r = p.add_run(part)
            set_run_font(r, cn=cn, size=size, bold=bold)


def shade(cell, color='F2F2F2'):
    tcPr = cell._tc.get_or_add_tcPr()
    sh = OxmlElement('w:shd')
    sh.set(qn('w:val'), 'clear'); sh.set(qn('w:color'), 'auto'); sh.set(qn('w:fill'), color)
    tcPr.append(sh)


def set_cell_margins(table, top=40, bottom=40, left=80, right=80):
    tblPr = table._tbl.tblPr
    mar = OxmlElement('w:tblCellMar')
    for k, v in (('top', top), ('left', left), ('bottom', bottom), ('right', right)):
        e = OxmlElement('w:%s' % k)
        e.set(qn('w:w'), str(v)); e.set(qn('w:type'), 'dxa')
        mar.append(e)
    tblPr.append(mar)


def add_table(doc, rows, caption=None, widths=None, font_size=Pt(10.5)):
    if caption:
        cp = doc.add_paragraph()
        cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cp.paragraph_format.first_line_indent = Pt(0)
        cp.paragraph_format.space_before = Pt(6)
        cp.paragraph_format.space_after = Pt(2)
        cp.paragraph_format.keep_with_next = True
        add_inline(cp, caption, size=Pt(10.5), cn=HEAD_FONT, bold=True)
    ncol = len(rows[0])
    t = doc.add_table(rows=len(rows), cols=ncol)
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = True
    set_cell_margins(t)
    total = Cm(21.0 - 3.17 * 2)
    for i, row in enumerate(rows):
        for j in range(ncol):
            cell = t.cell(i, j)
            cell.text = ''
            p = cell.paragraphs[0]
            p.paragraph_format.first_line_indent = Pt(0)
            p.paragraph_format.line_spacing = 1.15
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.space_after = Pt(1)
            txt = row[j] if j < len(row) else ''
            add_inline(p, txt, size=font_size, cn=(HEAD_FONT if i == 0 else BODY_FONT), bold=(i == 0))
            if i == 0:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                shade(cell)
            else:
                if len(txt) <= 8:
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            if widths:
                cell.width = Emu(int(total * widths[j]))
    # 表头重复
    trPr = t.rows[0]._tr.get_or_add_trPr()
    th = OxmlElement('w:tblHeader'); th.set(qn('w:val'), 'true')
    trPr.append(th)
    # 表后空行
    after = doc.add_paragraph()
    after.paragraph_format.first_line_indent = Pt(0)
    after.paragraph_format.space_before = Pt(0)
    after.paragraph_format.space_after = Pt(0)
    after.paragraph_format.line_spacing = 0.6
    return t


TEXT_WIDTH_TWIPS = int((21.0 - 3.17 * 2) / 2.54 * 1440)


def add_toc(doc, heads, pages):
    for lvl, text in heads:
        p = doc.add_paragraph()
        pf = p.paragraph_format
        pf.first_line_indent = Pt(0)
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)
        pf.line_spacing = 1.35
        if lvl == 2:
            pf.left_indent = Pt(24)
        pPr = p._p.get_or_add_pPr()
        tabs = OxmlElement('w:tabs')
        tab = OxmlElement('w:tab')
        tab.set(qn('w:val'), 'right')
        tab.set(qn('w:leader'), 'dot')
        tab.set(qn('w:pos'), str(TEXT_WIDTH_TWIPS))
        tabs.append(tab)
        pPr.append(tabs)
        key = norm(text)
        pg = pages.get(key, '')
        r = p.add_run(text + '\t' + str(pg))
        set_run_font(r, cn=(HEAD_FONT if lvl == 1 else BODY_FONT),
                     size=(Pt(12) if lvl == 1 else Pt(11)),
                     bold=(lvl == 1))


def norm(s):
    return re.sub(r'\s+', '', s)


def build():
    doc = Document()
    style_doc(doc)
    # ---------- 封面 ----------
    sec0 = doc.sections[0]
    setup_section(sec0, header_text=None, numfmt='decimal')

    for _ in range(3):
        para(doc, '', indent=False)
    para(doc, '2026·传统优势产业数字化软件赛题  参赛方案', indent=False,
         align=WD_ALIGN_PARAGRAPH.CENTER, size=Pt(12), cn=HEAD_FONT)
    para(doc, '', indent=False)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.first_line_indent = Pt(0)
    p.paragraph_format.line_spacing = 1.4
    r = p.add_run(TITLE)
    set_run_font(r, cn=HEAD_FONT, size=Pt(26), bold=True)
    p2 = doc.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p2.paragraph_format.first_line_indent = Pt(0)
    p2.paragraph_format.line_spacing = 1.5
    p2.paragraph_format.space_before = Pt(10)
    r2 = p2.add_run(SUBTITLE)
    set_run_font(r2, cn=HEAD_FONT, size=Pt(14), bold=False)

    for _ in range(6):
        para(doc, '', indent=False)
    for line in ['编制单位：____________________', '编制日期：二〇二六年十月']:
        q = doc.add_paragraph()
        q.alignment = WD_ALIGN_PARAGRAPH.CENTER
        q.paragraph_format.first_line_indent = Pt(0)
        q.paragraph_format.space_after = Pt(6)
        rr = q.add_run(line)
        set_run_font(rr, size=Pt(14), cn=BODY_FONT)

    # ---------- 摘要 + 目录 ----------
    sec1 = doc.add_section(WD_SECTION.NEW_PAGE)
    setup_section(sec1, header_text=None, numfmt='lowerRoman', start=1)

    files = sorted(glob.glob(os.path.join(SRC, '*.md')))
    # 摘要单独处理
    abstract_file = os.path.join(SRC, '00_abstract.md')
    if os.path.exists(abstract_file):
        files.remove(abstract_file)
        render(abstract_file, doc)
    # 目录页
    doc.add_page_break()
    tp = doc.add_paragraph()
    tp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tp.paragraph_format.first_line_indent = Pt(0)
    tp.paragraph_format.space_after = Pt(12)
    tr = tp.add_run('目　　录')
    set_run_font(tr, cn=HEAD_FONT, size=Pt(16), bold=True)
    add_toc(doc)

    # ---------- 正文 ----------
    sec2 = doc.add_section(WD_SECTION.NEW_PAGE)
    setup_section(sec2, header_text='服饰产业数字化智能化绿色化转型解决方案研究报告',
                  numfmt='decimal', start=1)
    for f in files:
        render(f, doc)
    doc.save(OUT)
    print('saved', OUT)


def render(path, doc):
    with open(path, encoding='utf-8') as fh:
        lines = fh.read().split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        s = line.strip()
        if not s:
            i += 1
            continue
        if s.startswith('|'):
            block = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                block.append(lines[i].strip())
                i += 1
            rows = []
            for bl in block:
                if re.match(r'^\|[\s:\-\|]+\|$', bl):
                    continue
                cells = [c.strip() for c in bl.strip('|').split('|')]
                rows.append(cells)
            if rows:
                add_table(doc, rows)
            continue
        if s.startswith('^'):
            # 表题：紧邻其后的表格
            cap = s[1:].strip()
            # 找下一行表格
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and lines[j].strip().startswith('|'):
                block = []
                while j < len(lines) and lines[j].strip().startswith('|'):
                    block.append(lines[j].strip())
                    j += 1
                rows = []
                for bl in block:
                    if re.match(r'^\|[\s:\-\|]+\|$', bl):
                        continue
                    rows.append([c.strip() for c in bl.strip('|').split('|')])
                add_table(doc, rows, caption=cap)
                i = j
                continue
            i += 1
            continue
        if s.startswith('#### '):
            p = doc.add_paragraph(style='Heading 4')
            add_inline(p, s[5:], size=Pt(12), cn=BODY_FONT, bold=True)
        elif s.startswith('### '):
            p = doc.add_paragraph(style='Heading 3')
            add_inline(p, s[4:], size=Pt(12), cn=HEAD_FONT, bold=True)
        elif s.startswith('## '):
            p = doc.add_paragraph(style='Heading 2')
            add_inline(p, s[3:], size=Pt(14), cn=HEAD_FONT, bold=True)
        elif s.startswith('# '):
            p = doc.add_paragraph(style='Heading 1')
            add_inline(p, s[2:], size=Pt(16), cn=HEAD_FONT, bold=True)
        elif s.startswith('- '):
            p = doc.add_paragraph()
            p.paragraph_format.first_line_indent = Pt(0)
            p.paragraph_format.left_indent = Pt(24)
            p.paragraph_format.line_spacing = 1.5
            add_inline(p, '● ' + s[2:], size=BODY_SIZE)
        elif s == '{{pagebreak}}':
            doc.add_page_break()
        else:
            para(doc, s)
        i += 1


if __name__ == '__main__':
    build()
