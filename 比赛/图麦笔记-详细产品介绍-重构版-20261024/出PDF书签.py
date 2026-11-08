# -*- coding: utf-8 -*-
"""给旅行故事版 PDF 补书签。

Playwright 的 page.pdf() 不写文档大纲，所以出完 PDF 后按版面计划补一层：
每个版面一条，章首那一页抬到一级，其余挂二级。补完回读条数与页码自证。
"""
import json
import os
import re

import pymupdf

D = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(D, '图麦笔记-旅行故事版.pdf')
plan = json.load(open(os.path.join(D, '旅行故事版-编排与覆盖.json'), encoding='utf-8'))

doc = pymupdf.open(PDF)
if doc.page_count != plan['pages']:
    raise SystemExit(f'页数对不上：PDF {doc.page_count}，版面计划 {plan["pages"]}')

toc, last = [], None
for p in plan['page_plan']:
    title = re.sub(r'\s+', ' ', p['title']).strip()
    level = 1 if p['section'] != last else 2
    last = p['section']
    toc.append([level, f"{p['number']:02}｜{title}", p['number']])
doc.set_toc(toc)
doc.save(PDF + '.tmp', garbage=3, deflate=True)
doc.close()
os.replace(PDF + '.tmp', PDF)

check = pymupdf.open(PDF)
got = check.get_toc()
report = {'pdf_pages': check.page_count, 'bookmarks': len(got),
          'level1': sum(1 for t in got if t[0] == 1),
          'plan_pages': plan['pages'],
          'first': got[0][1], 'last': got[-1][1],
          'searchable_pages': sum(1 for pg in check if len(pg.get_text().strip()) > 40),
          'pdf_bytes': os.path.getsize(PDF)}
check.close()
if report['bookmarks'] != plan['pages'] or report['searchable_pages'] != plan['pages']:
    raise SystemExit('书签或可检索性不达标：' + json.dumps(report, ensure_ascii=False))
json.dump(report, open(os.path.join(D, '旅行故事版-PDF检查.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=2)
print(json.dumps(report, ensure_ascii=False))
