# -*- coding: utf-8 -*-
"""封面方向稿：三版一次出齐，供挑选。

三版各自锁一句口号，所以挑版式的同时也就挑了口号；版式与口号可以拆开换。
品牌这块三版给了三种做法：纯文字字标／字标压图／带上现网那枚四色 logo，
用来直接看彩色标识压在这套暖纸深绿陶土上跳不跳。
"""
import base64
import io
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / '素材'
OUT = Path(__file__).resolve().parent / '封面方向稿.html'

logo_src = Path('/Users/zlfmac/Documents/TuMaiBiJi/miniprogram/assets/logo.png')


def data(path, width=1536):
    im = Image.open(path)
    im.thumbnail((width, width), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    if im.mode == 'RGBA' and im.getchannel('A').getextrema() != (255, 255):
        im.save(buf, 'PNG')
        mime = 'png'
    else:
        im.convert('RGB').save(buf, 'JPEG', quality=90)
        mime = 'jpeg'
    return f'data:image/{mime};base64,' + base64.b64encode(buf.getvalue()).decode()


HERO = data(ASSETS / '旅行-地标介绍-v3.png')
LOGO = data(logo_src, 512)

VARIANTS = [
    {
        'tag': '甲 · 字标压顶，口号最大',
        'say': '品牌只用文字字标，不上彩色 logo；口号占全场最重的一格，照片退成底部一条。',
        'cls': 'v-a',
        'html': f'''
<div class="brand"><b>图麦笔记</b><span>TUMARKNOTE</span></div>
<div class="rule"></div>
<h1>读懂这一站，<br>写下自己的旅程。</h1>
<p class="sub">你看懂的那一句，值得留下来。<br>外文介绍、沿途照片、随手写的字，都收进你自己的笔记。</p>
<div class="strip"><img src="{HERO}" alt="旅行场景示意"></div>
<div class="foot"><span>16 种外文内容 · 最多 9 张照片 · 一篇中文笔记</span><span>图片 · 链接 · 文字</span></div>'''},
    {
        'tag': '乙 · 照片铺满，白字压图',
        'say': '整页一张旅行影像，深绿渐变压底保字；口号用现网首页那句书法文案，品牌字标在上方。',
        'cls': 'v-b',
        'html': f'''
<div class="bg"><img src="{HERO}" alt="旅行场景示意"></div>
<div class="veil"></div>
<div class="on">
  <div class="brand"><b>图麦笔记</b><span>TUMARKNOTE</span></div>
  <div class="push"></div>
  <h1>看到好内容，<br>随手记下来。</h1>
  <p class="sub">你的照片、链接和随手写的字，<br>都能变成一篇读得懂的笔记。</p>
  <div class="foot"><span>16 种外文内容 · 最多 9 张照片</span><span>Save what matters</span></div>
</div>'''},
    {
        'tag': '丙 · 深绿色块 + 现网 logo',
        'say': '深绿大色块反白口号，右上直接放现网那枚四色 logo——用这一版看彩色标识在这套底色上跳不跳。',
        'cls': 'v-c',
        'html': f'''
<div class="block">
  <img class="mark" src="{LOGO}" alt="图麦笔记标识">
  <div class="brand"><b>图麦笔记</b><span>TUMARKNOTE</span></div>
  <h1>把图文，<br>提炼成有用的干货。</h1>
  <p class="sub">你存下来的每一条，<br>都不该只在收藏夹里躺着。</p>
</div>
<div class="strip"><img src="{HERO}" alt="旅行场景示意">
  <div class="foot"><span>16 种外文内容 · 最多 9 张照片 · 一篇中文笔记</span><span>图片 · 链接 · 文字</span></div>
</div>'''},
]

CSS = '''
:root{--paper:#f4f1eb;--ink:#19201f;--green:#223d35;--clay:#b95b3b;--muted:#59635c;--line:#c9cdc3}
*{box-sizing:border-box}body{margin:0;background:#dcded8;font-family:"Hiragino Sans GB","PingFang SC",sans-serif;color:var(--ink)}
.sheet{display:flex;gap:26px;padding:26px;align-items:flex-start}
.slot{width:600px}
.label{font-size:15px;line-height:1.65;margin:0 0 10px;color:#2f3a33}
.label b{display:block;font-size:17px;margin-bottom:3px}
.cover{position:relative;width:600px;height:750px;background:var(--paper);overflow:hidden;box-shadow:0 10px 26px #0a170c2e}
.cover h1{font-size:52px;line-height:1.24;letter-spacing:-1.6px;font-weight:600;margin:0}
.cover .sub{font-size:17px;line-height:1.75;color:var(--muted);margin:20px 0 0}
.cover .brand b{font-size:30px;font-weight:600;letter-spacing:1px}
.cover .brand span{display:block;font:12px Arial,sans-serif;letter-spacing:4.4px;color:var(--clay);margin-top:7px}
.cover .rule{width:74px;height:7px;background:var(--clay);margin:26px 0 30px}
.cover .foot{position:absolute;left:44px;right:44px;bottom:34px;display:flex;font-size:12.5px;color:var(--muted);line-height:1.6}
.cover .foot span:last-child{margin-left:auto}
.v-a{padding:44px 44px 0}
.v-a .strip{position:absolute;left:0;right:0;bottom:74px;height:236px}
.v-a .strip img{width:100%;height:100%;object-fit:cover;object-position:62% 40%}
.v-a .foot{color:#5b6560}
.v-b .bg{position:absolute;inset:0}.v-b .bg img{width:100%;height:100%;object-fit:cover;object-position:60% 34%}
.v-b .veil{position:absolute;inset:0;background:linear-gradient(180deg,#16241ecc 0%,#1b2e2677 34%,#16241e8c 62%,#101c17f2 100%)}
.v-b .on{position:absolute;inset:0;padding:44px;display:flex;flex-direction:column;color:var(--paper)}
.v-b .brand span{color:#e6a68a}.v-b .sub{color:#d6e0d3}.v-b .push{flex:1}
.v-b .foot{color:#c3d0c1}.v-b h1{font-size:56px}
.v-c{display:flex;flex-direction:column}
.v-c .block{flex:1;background:var(--green);color:var(--paper);padding:40px 44px 30px;position:relative}
.v-c .mark{position:absolute;right:40px;top:38px;width:74px;height:74px}
.v-c .brand{margin-top:6px}.v-c .brand span{color:#e6a68a}.v-c .sub{color:#d6e0d3}
.v-c h1{font-size:46px;margin-top:34px}
.v-c .strip{height:250px;position:relative}
.v-c .strip>img{width:100%;height:212px;object-fit:cover;object-position:62% 40%}
.v-c .foot{position:static;padding:16px 44px 22px;background:var(--paper)}
'''

html = ('<!doctype html><meta charset="utf-8"><title>封面方向稿</title><style>' + CSS +
        '</style><div class="sheet">' + ''.join(
            f'<div class="slot"><div class="label"><b>{v["tag"]}</b>{v["say"]}</div>'
            f'<div class="cover {v["cls"]}">{v["html"]}</div></div>' for v in VARIANTS) + '</div>')
OUT.write_text(html, encoding='utf-8')
print(OUT, len(html))
