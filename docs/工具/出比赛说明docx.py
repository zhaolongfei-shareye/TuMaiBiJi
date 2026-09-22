#!/usr/bin/env python3
"""把 docs/比赛说明.md 转成可提交的 .docx。

只覆盖这份文档实际用到的语法：# 三级标题、**加粗**、> 引用、- 列表、表格、--- 分隔线。
不做通用 Markdown 引擎——那会是比这份文件长得多的一段代码，而且下一次真需要通用转换时，
该用的是 pandoc 而不是这个。
"""
import re
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor

SRC = Path('/Users/zlfmac/Documents/TuMaiBiJi/docs/比赛说明.md')
OUT = Path('/Users/zlfmac/Documents/TuMaiBiJi/图麦笔记｜比赛提交说明.docx')

INK = RGBColor(0x23, 0x25, 0x2C)
SUB = RGBColor(0x5C, 0x60, 0x68)
ACCENT = RGBColor(0x3F, 0x52, 0xD6)

doc = Document()
style = doc.styles['Normal']
style.font.name = 'PingFang SC'
style.font.size = Pt(11)
style.font.color.rgb = INK


def add_runs(p, text):
    """按 **加粗** 拆 run。行内 `code` 只去掉反引号、不换字体——Word 里等宽字体反而突兀。"""
    text = text.replace('`', '')
    for i, chunk in enumerate(re.split(r'\*\*(.+?)\*\*', text)):
        if not chunk:
            continue
        run = p.add_run(chunk)
        run.bold = i % 2 == 1
        if run.bold:
            run.font.color.rgb = INK


def heading(text, level):
    h = doc.add_heading(level=level)
    add_runs(h, text)
    for run in h.runs:
        run.font.color.rgb = ACCENT if level <= 2 else INK
    return h


lines = SRC.read_text(encoding='utf-8').split('\n')
i = 0
while i < len(lines):
    ln = lines[i].rstrip()

    if not ln.strip():
        i += 1
        continue

    # 引用块的续行标记本身不渲染，否则 Word 里会掉出一个孤零零的 ">"
    if ln.strip() == '>':
        i += 1
        continue

    # 代码块：整段用等宽小字 + 左缩进，围栏行丢掉。分层图靠空格对齐，非等宽会歪
    if ln.strip().startswith('```'):
        i += 1
        while i < len(lines) and not lines[i].strip().startswith('```'):
            q = doc.add_paragraph()
            q.paragraph_format.left_indent = Pt(14)
            q.paragraph_format.space_after = Pt(0)
            q.paragraph_format.space_before = Pt(0)
            r = q.add_run(lines[i].replace('`', ''))
            r.font.name = 'Menlo'
            r.font.size = Pt(8.5)
            r.font.color.rgb = SUB
            i += 1
        i += 1
        continue

    if ln.strip() == '---':
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(10)
        add_runs(p, '＿' * 22)
        for run in p.runs:
            run.font.color.rgb = RGBColor(0xD8, 0xD5, 0xCB)
        i += 1
        continue

    # 配图：整行只有一个 ![](路径)，按页宽居中放进去；紧跟的 *图 N …* 当图注
    m = re.match(r'^!\[[^\]]*\]\(([^)]+)\)$', ln)
    if m:
        img = (SRC.parent / m.group(1)).resolve()
        if not img.exists():
            raise SystemExit(f'配图文件不存在：{img}')
        par = doc.add_paragraph()
        par.alignment = WD_ALIGN_PARAGRAPH.CENTER
        par.paragraph_format.space_before = Pt(8)
        par.paragraph_format.space_after = Pt(2)
        par.add_run().add_picture(str(img), width=Inches(6.2))
        i += 1
        continue

    m = re.match(r'^\*([^*].*?)\*$', ln)
    if m:
        par = doc.add_paragraph()
        par.alignment = WD_ALIGN_PARAGRAPH.CENTER
        par.paragraph_format.space_after = Pt(12)
        run = par.add_run(m.group(1))
        run.italic = True
        run.font.size = Pt(9)
        run.font.color.rgb = SUB
        i += 1
        continue

    m = re.match(r'^(#{1,3})\s+(.*)$', ln)
    if m:
        level = len(m.group(1))
        heading(m.group(2), {1: 0, 2: 1, 3: 2}[level])
        i += 1
        continue

    # 表格：连续的 | 行，第一行是表头
    if ln.startswith('|'):
        rows = []
        while i < len(lines) and lines[i].strip().startswith('|'):
            cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
            if not re.fullmatch(r'[-: ]+', cells[0] or '-'):
                rows.append(cells)
            i += 1
        table = doc.add_table(rows=len(rows), cols=max(len(r) for r in rows))
        table.style = 'Light Grid Accent 1'
        for r, cells in enumerate(rows):
            for c, val in enumerate(cells):
                cell = table.cell(r, c)
                cell.text = ''
                p = cell.paragraphs[0]
                add_runs(p, val)
                if r == 0:
                    for run in p.runs:
                        run.bold = True
                for run in p.runs:
                    run.font.size = Pt(9.5)
        doc.add_paragraph()
        continue

    if ln.startswith('> '):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Pt(18)
        p.paragraph_format.space_before = Pt(6)
        p.paragraph_format.space_after = Pt(6)
        add_runs(p, ln[2:])
        for run in p.runs:
            run.italic = True
            run.font.color.rgb = SUB
        i += 1
        continue

    m = re.match(r'^(\s*)[-*]\s+(.*)$', ln)
    if m:
        p = doc.add_paragraph(style='List Bullet' if len(m.group(1)) < 2 else 'List Bullet 2')
        add_runs(p, m.group(2))
        i += 1
        continue

    m = re.match(r'^\s*(\d+)\.\s+(.*)$', ln)
    if m:
        p = doc.add_paragraph(style='List Number')
        add_runs(p, m.group(2))
        i += 1
        continue

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(8)
    add_runs(p, ln)
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    i += 1

doc.save(OUT)
print(OUT, OUT.stat().st_size, 'bytes')
