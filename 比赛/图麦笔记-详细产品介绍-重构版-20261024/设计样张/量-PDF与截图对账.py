# -*- coding: utf-8 -*-
"""跨通道对账：PDF 自己渲染的每一页 vs Playwright 出的同一页，逐页比平均色差。

为什么要这一把：10-25 封面又长出灰框，根因是 Chromium 打印通道把 CSS box-shadow
光栅化成了低分辨率色带——Playwright 的页面 PNG 看着完全正常，只有 PDF 里坏。
所以"我看过的截图"不能给 PDF 担保，必须让 PDF 自己吐一遍像素来比。
"""
import os
import sys

import pymupdf
from PIL import Image, ImageChops

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(D, '图麦笔记-旅行故事版.pdf')
PNG = os.path.join(D, '瑞士故事版图片')
W, H = 480, 600
doc = pymupdf.open(PDF)
plan = doc.page_count
bad = []
for i in range(plan):
    a = doc[i].get_pixmap(matrix=pymupdf.Matrix(W / (960 / 1.0), H / (1200 / 1.0)))
    pa = Image.frombytes('RGB', (a.width, a.height), a.samples)
    src = os.path.join(PNG, f'{i+1:02d}.png')
    if not os.path.exists(src):
        bad.append({'page': i + 1, 'diff': None, 'why': '缺 Playwright 页图'})
        continue
    pb = Image.open(src).convert('RGB').resize((a.width, a.height), Image.LANCZOS)
    d = ImageChops.difference(pa, pb)
    hist = d.histogram()
    mean = sum(v * (j % 256) for j, v in enumerate(hist[:256])) / (a.width * a.height)
    big = sum(hist[256:512]) / (a.width * a.height)  # 差值 >0 的像素占比（通道 2）
    if mean > 6.0:
        bad.append({'page': i + 1, 'mean_diff': round(mean, 2), 'why': '两通道像素不一致'})
print(len(doc), 'pages compared;', len(bad), 'flagged')
for b in bad:
    print(b)
sys.exit(1 if bad else 0)
