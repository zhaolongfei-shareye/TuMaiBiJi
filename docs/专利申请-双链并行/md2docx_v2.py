#!/usr/bin/env python3
"""把 v2 技术交底书 Markdown 转为 Word 文档。

只处理本文档实际用到的 Markdown 结构：#~#### 标题、段落、- 列表、
| 表格、> 引用、--- 分隔线、**粗体**、`代码`、行内表格转义 \\|。
"""
import os
import re
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "专利申请-双链并行处理方法-技术交底书-v2.md")
OUT = os.path.join(HERE, "专利申请-双链并行处理方法-技术交底书-v2.docx")

INLINE = re.compile(r"(\*\*.+?\*\*|`[^`]+`)")


def add_runs(par, text):
    """按 **粗体** 与 `代码` 切分并写入 run。"""
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            r = par.add_run(part[2:-2])
            r.bold = True
        elif part.startswith("`") and part.endswith("`") and len(part) > 2:
            r = par.add_run(part[1:-1])
            r.font.name = "Courier New"
            r.font.size = Pt(10)
        else:
            par.add_run(part)
    return par


def flush_table(doc, rows):
    """rows: list[list[str]]，首行为表头。"""
    if not rows:
        return
    ncols = max(len(r) for r in rows)
    t = doc.add_table(rows=len(rows), cols=ncols)
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for ri, row in enumerate(rows):
        for ci in range(ncols):
            cell = t.rows[ri].cells[ci]
            cell.text = ""
            par = cell.paragraphs[0]
            par.paragraph_format.space_after = Pt(2)
            txt = row[ci] if ci < len(row) else ""
            add_runs(par, txt)
            if ri == 0:
                for r in par.runs:
                    r.bold = True
            for r in par.runs:
                r.font.size = Pt(9.5)
    doc.add_paragraph()


def split_row(line):
    body = line.strip().strip("|")
    cells, cur, i = [], "", 0
    while i < len(body):
        if body[i] == "\\" and i + 1 < len(body) and body[i + 1] == "|":
            cur += "|"
            i += 2
            continue
        if body[i] == "|":
            cells.append(cur.strip())
            cur = ""
        else:
            cur += body[i]
        i += 1
    cells.append(cur.strip())
    return cells


def is_sep_row(line):
    return bool(re.fullmatch(r"\|[\s:\-\|]+\|", line.strip()))


def main():
    with open(SRC, encoding="utf-8") as f:
        lines = f.read().split("\n")

    doc = Document()

    st = doc.styles["Normal"]
    st.font.name = "宋体"
    st.font.size = Pt(11)
    st.paragraph_format.line_spacing = 1.5
    st.paragraph_format.space_after = Pt(4)

    for lvl, size in [(1, 20), (2, 16), (3, 13.5), (4, 12)]:
        h = doc.styles[f"Heading {lvl}"]
        h.font.name = "黑体"
        h.font.size = Pt(size)
        h.font.bold = True
        h.font.color.rgb = RGBColor(0, 0, 0)

    sec = doc.sections[0]
    sec.top_margin = Cm(2.5)
    sec.bottom_margin = Cm(2.5)
    sec.left_margin = Cm(2.8)
    sec.right_margin = Cm(2.6)

    pending = []
    seen_h1 = False
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # 表格
        if stripped.startswith("|") and stripped.endswith("|"):
            if is_sep_row(stripped):
                i += 1
                continue
            pending.append(split_row(stripped))
            i += 1
            continue
        if pending:
            flush_table(doc, pending)
            pending = []

        if not stripped:
            i += 1
            continue

        if stripped == "---":
            doc.add_paragraph()
            i += 1
            continue

        m = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if m:
            lvl = len(m.group(1))
            txt = m.group(2).strip()
            if lvl == 1:
                # 权利要求书／说明书／说明书摘要／附图 在 CPC 中各自独立成页，
                # 交底书 Word 版同样分页，便于逐份复制粘贴。
                if seen_h1:
                    doc.add_page_break()
                seen_h1 = True
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                r = p.add_run(txt)
                r.font.size = Pt(20)
                r.font.bold = True
                r.font.name = "黑体"
                p.paragraph_format.space_before = Pt(12)
                p.paragraph_format.space_after = Pt(12)
            else:
                doc.add_heading(txt, level=lvl - 1)
            i += 1
            continue

        if stripped.startswith("> "):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.8)
            p.paragraph_format.right_indent = Cm(0.4)
            add_runs(p, stripped[2:])
            for r in p.runs:
                r.font.size = Pt(9.5)
                r.font.color.rgb = RGBColor(0x40, 0x40, 0x40)
            i += 1
            continue

        m = re.match(r"^(\s*)[-*]\s+(.*)$", line)
        if m:
            depth = len(m.group(1)) // 2
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.9 + 0.7 * depth)
            p.paragraph_format.first_line_indent = Cm(-0.45)
            p.add_run("• " if depth == 0 else "– ")
            add_runs(p, m.group(2))
            i += 1
            continue

        m = re.match(r"^(\s*)(\d+)[\.、]\s+(.*)$", line)
        if m:
            depth = len(m.group(1)) // 2
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.9 + 0.7 * depth)
            p.paragraph_format.first_line_indent = Cm(-0.6)
            p.add_run(f"{m.group(2)}. ")
            add_runs(p, m.group(3))
            i += 1
            continue

        # 普通段落
        p = doc.add_paragraph()
        if not re.match(r"^[（(【\[]", stripped) and not stripped.startswith("S") \
                and len(stripped) > 60:
            p.paragraph_format.first_line_indent = Cm(0.74)
        add_runs(p, stripped)
        i += 1

    if pending:
        flush_table(doc, pending)

    doc.save(OUT)
    print(f"OK → {OUT}")


if __name__ == "__main__":
    main()
