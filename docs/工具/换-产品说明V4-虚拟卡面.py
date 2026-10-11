#!/usr/bin/env python3
# 把 V4 图库那十张卡面换成 10-11 这一批**虚拟内容 + 无码**的运行时成品，并改口图注。
#
# 站长 10-11 晚原话：「不要用任何真实的笔记二维码和真实笔记内容……你虚拟内容就行了。」
# 10-09 那一批印的是他库里 09-23 那篇真笔记（真标题真摘要真要点），右下角还是能扫开那一篇的
# **真实小程序码**——这一把两样都换掉：内容来自 `出-十套模板成品-虚拟.js` 自建的那一篇虚拟笔记
# （跑完已删，现网再读 404），码走产品自己的 `noQr` 那一档，图上一个码都不印。
# 图仍由产品自己的绘制代码在开发者工具里跑出（换分类色、按内容定高都在里面），不是效果图。
#
# 产物是 PNG，进 PDF 前转 JPEG（与 10-09 那一批同一处理）：十张 PNG 3.2MB → base64 会把正本顶到 7.7MB，
# 转 JPEG q82 后约 1.5MB。
#
# 跑法：python3 docs/工具/换-产品说明V4-虚拟卡面.py
import base64
import io
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path('/Users/zlfmac/Documents/TuMaiBiJi')
DOC = ROOT / '比赛/图麦笔记-产品说明-V4-20261011.html'
SRC = ROOT / 'docs/design/10-11模板图库-虚拟'
IDS = ['card', 'quote', 'block', 'letter', 'popGrid', 'popDots', 'acid', 'cover', 'lit', 'spec']

OLD_CAPTION_RE = re.compile(r'<p class="note">十张图都由产品自己的绘制代码.*?</p>', re.S)
NEW_CAPTION = ('<p class="note">十张图都由产品自己的绘制代码在微信开发者工具里跑出（10-11 这一批），排的是<b>同一条虚拟示例笔记</b>'
               '——标题、摘要、要点、标签都是编的，不取自任何真实笔记；码走产品自己的<b>无码</b>那一档，图上一个码都不印。'
               '头像是站长授权的照片；字体随运行环境略有差异。</p>')

bad = []


def ck(name, ok, got=''):
    print(f'{"✓" if ok else "✗"} {name}{("　→ " + str(got)) if got else ""}')
    if not ok:
        bad.append(name)


def jpeg_b64(png_path, q=82):
    im = Image.open(png_path)
    if im.mode != 'RGB':
        bg = Image.new('RGB', im.size, '#ffffff')
        bg.paste(im.convert('RGBA'), (0, 0), im.convert('RGBA'))
        im = bg
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=q, optimize=True)
    return base64.b64encode(buf.getvalue()).decode('ascii'), im.size, len(buf.getvalue())


src = DOC.read_text(encoding='utf-8')
total_new = 0
for tid in IDS:
    png = SRC / f'虚拟-{tid}.png'
    if not png.exists():
        ck(f'{tid} 成品在', False, str(png))
        continue
    b64, size, nbytes = jpeg_b64(png)
    pat = re.compile(r'(<img class="template-image" alt="' + tid + r'" src="data:image/jpeg;base64,)([A-Za-z0-9+/=]*)(")')
    hits = list(pat.finditer(src))
    ck(f'{tid} 那一格找得到', len(hits) == 1, f'{len(hits)} 处')
    if len(hits) != 1:
        continue
    m = hits[0]
    old_len = len(m.group(2))
    src = src[:m.start(2)] + b64 + src[m.end(2):]
    total_new += nbytes
    print(f'　· {tid} {size[0]}×{size[1]}　JPEG {nbytes:,} B　（旧 base64 {old_len:,} → 新 {len(b64):,}）')

hits = list(OLD_CAPTION_RE.finditer(src))
ck('图注五处找得到', len(hits) == 5, f'{len(hits)} 处（要 5）')
if len(hits) == 5:
    src = OLD_CAPTION_RE.sub(lambda m: NEW_CAPTION, src)

ck('全篇不再有"真实小程序码"这句', '真实小程序码' not in src)
DOC.write_text(src, encoding='utf-8')
print(f'\n{"⚠ 有 " + str(len(bad)) + " 处不过" if bad else "全部落上"}'
      f'　{DOC.name}　{len(src.encode("utf-8")):,} B　十张新图共 {total_new:,} B')
print('下一步：headless Chrome 出 PDF，逐页量 .content 底边')
sys.exit(1 if bad else 0)
