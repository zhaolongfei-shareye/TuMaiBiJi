# -*- coding: utf-8 -*-
"""封面方向稿第二轮：六版风格，每版一张 1280×1600 的整页效果图。

约束（站长已拍过，不许重开）：
- 主口号＝「看到好内容，随手记下来。」（现网首页书法位图那句，英文 Save what matters）
- 四色 logo 上封面，放右上（他 10-24 明说品牌识别优先于配色纯粹性）
- 界面必须是真实渲染，无台面、无墨框；背景要有人物
本轮只出效果图，产品代码与册子一行不动。
"""
import base64
import io
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda n: '素材/' + n
SLOGAN = '看到好内容，<br>随手记下来。'
SLOGAN_EN = 'Save what matters'
BRAND = '<div class="brand"><span class="cn">图麦笔记</span><span class="en">TUMARKNOTE</span></div>'
LOGO = f'<img class="logo" src="{A("品牌标识-四色.png")}" alt="图麦笔记四色标识">'
FOOT = '微信小程序 · 详细产品介绍 · 2026'

# 五档心情与首屏都是 2.4.x 开发者工具真实渲染（734×1588）
SCREENS = ['首屏实拍-林夏.png', '首屏实拍-纸白.png', '旅行卡-cover.png']
CARDS = ['旅行卡-cover.png', '旅行卡-quote.png', '旅行卡-popGrid.png']
PHOTOS = ['旅行-林夏咖啡馆.png', '旅行-地标介绍-v3.png', '旅行-回国照片墙全身.png']


def page(cls, inner):
    return f'<div class="page-wrap"><section class="page {cls}">{inner}</section></div>'


def a_full_bleed():
    """A｜满版人像：照片铺满四边，口号压在中上，底部一条真实界面。"""
    return page('dir-a',
                '<div class="bg" style="background-image:url(\'素材/旅行-林夏咖啡馆.png\')\"></div>'
                '<div class="veil"></div>' + BRAND + LOGO +
                f'<div class="hero"><h1>{SLOGAN}</h1><span class="en">{SLOGAN_EN}</span></div>'
                '<div class="strip">'
                + ''.join(f'<img src="{A(s)}" alt="真实渲染">' for s in SCREENS)
                + '</div>'
                f'<div class="foot">{FOOT}</div>')


def b_split():
    """B｜左右对分：左暖纸大字，右满高真实界面，中间一条陶土竖线。"""
    return page('dir-b',
                '<div class="left">' + BRAND +
                f'<h1>{SLOGAN}</h1><p class="sub">把图文，提炼成有用的干货。</p>'
                '<div class="rule"></div>'
                '<div class="nums"><div><b>16</b><span>种外文内容<br>整理成中文</span></div>'
                '<div><b>9</b><span>张照片<br>收进同一篇</span></div>'
                '<div><b>11</b><span>套卡片版式<br>发得出去</span></div></div>'
                f'<div class="foot">{FOOT}</div></div>'
                '<div class="right">'
                f'<img src="{A("首屏实拍-林夏.png")}" alt="新建页首屏真实渲染"></div>' + LOGO)


def c_three():
    """C｜三段式：顶部品牌条，中部超大口号，底部三屏并排。"""
    return page('dir-c',
                '<div class="top">' + BRAND + LOGO + '</div>'
                '<div class="mid"><h1>' + SLOGAN + '</h1>'
                '<p>你在外面看到的那一句、那一张、那篇舍不得关掉的长文，都值得变成一本读得懂的笔记。</p></div>'
                '<div class="row">'
                + ''.join(f'<figure><img src="{A(s)}" alt="真实渲染"><figcaption>新建 · 记下来</figcaption></figure>'
                          for s in SCREENS) + '</div>'
                f'<div class="foot">{FOOT}</div>')


def d_green():
    """D｜深绿精装：满版深绿＋暖纸色大字，界面卡浮在右下。"""
    return page('dir-d',
                '<div class="grid"></div>' + LOGO + BRAND +
                f'<h1>{SLOGAN}</h1><span class="en">{SLOGAN_EN}</span>'
                '<div class="side">图麦笔记 · 详细产品介绍<br>一趟罗马旅行，从头记到尾</div>'
                f'<div class="shot"><img src="{A("首屏实拍-林夏.png")}" alt="真实渲染"></div>'
                f'<div class="foot">{FOOT}</div>')


def e_collage():
    """E｜卡片拼贴：一张真实卡片最大，四周照片与小界面错位。"""
    return page('dir-e',
                '<div class="cl">看到好内容，<br>随手记下来。</div>' + BRAND + LOGO +
                '<div class="stack">'
                f'<img class="s3" src="{A("旅行卡-popGrid.png")}" alt="真实卡片">'
                f'<img class="s2" src="{A("旅行卡-quote.png")}" alt="真实卡片">'
                f'<img class="s1" src="{A("旅行卡-cover.png")}" alt="真实卡片">'
                '</div>'
                '<div class="mini">'
                f'<img src="{A("旅行-地标介绍-v3.png")}" alt="场景">'
                f'<img src="{A("首屏实拍-林夏.png")}" alt="真实渲染">'
                f'<img src="{A("旅行-回国照片墙全身.png")}" alt="场景"></div>'
                f'<div class="foot">{FOOT}</div>')


def f_numbers():
    """F｜瑞士数字：细网格＋一列大数字，底部一条界面。"""
    return page('dir-f',
                '<div class="mesh"></div>' + BRAND + LOGO +
                '<div class="lead"><h1>' + SLOGAN + '</h1>'
                '<p>一款把链接、截图和文字变成笔记的微信小程序。</p></div>'
                '<div class="col">'
                '<div><b>712</b><i>KB</i><span>整个小程序的代码包</span></div>'
                '<div><b>16</b><i>种</i><span>外文内容整理成中文</span></div>'
                '<div><b>9</b><i>张</i><span>照片收进同一篇笔记</span></div>'
                '<div><b>11</b><i>套</i><span>发得出去的卡片版式</span></div>'
                '<div><b>77</b><i>项</i><span>功能，逐项讲清楚</span></div>'
                '</div>'
                f'<div class="band"><img src="{A("首屏实拍-林夏.png")}" alt="真实渲染"></div>'
                f'<div class="foot">{FOOT}</div>')


DIRS = [
    ('A', '满版人像', '照片铺满四边，口号压在图上，底部一条真实界面', 'Day One / Notion 商店首图：满版影像＋文字压图'),
    ('B', '左右对分', '左半暖纸大字，右半满高真实界面，中间一条陶土竖线', 'Cubox / Craft 商店首图：文字与界面各占一半'),
    ('C', '三段居中', '顶部品牌条、中部超大口号、底部三屏并排', 'flomo / Readwise 官网首屏：一句话＋一排产品图'),
    ('D', '深绿精装', '满版品牌绿＋暖纸色大字，界面浮在右下', 'Obsidian 深色商店图：深色底＋一处产品图'),
    ('E', '卡片拼贴', '一张真实卡片当主角，四周照片与小界面错位', 'Day One / flomo：把成果物摆在封面上'),
    ('F', '瑞士数字', '细网格＋一列大数字，底部一条界面', 'Notion / Craft 官网：数字与留白撑版面'),
]

CSS = '''
:root{--paper:#e2ded4;--ink:#19201f;--green:#223d35;--clay:#b95b3b;--muted:#59635c;--line:#c9cdc3}
@font-face{font-family:"Zhuque Fangsong";src:url("素材/朱雀仿宋-Regular.ttf") format("truetype")}
*{box-sizing:border-box}body{margin:0;background:#c9c5bb;font-family:"Zhuque Fangsong","Songti SC",serif;color:var(--ink)}
.page-wrap{margin:34px auto;width:1280px;height:1600px;position:relative}
.page{width:1280px;height:1600px;position:relative;overflow:hidden;background:var(--paper);padding:76px}
.brand .cn{font-size:64px;font-weight:600;letter-spacing:3px}
.brand .en{display:block;font:18px/1 Arial,sans-serif;letter-spacing:11px;color:var(--clay);margin-top:12px}
.logo{position:absolute;right:76px;top:76px;width:132px;height:132px;object-fit:contain}
.foot{position:absolute;left:76px;bottom:56px;font-size:19px;letter-spacing:2px;color:var(--muted)}
h1{font-size:112px;line-height:1.18;letter-spacing:-4px;font-weight:600;margin:0}
/* A 满版人像 */
.dir-a{padding:0}
.dir-a .bg{position:absolute;inset:0;background-size:cover;background-position:58% 30%}
.dir-a .veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,22,20,.34) 0%,rgba(20,22,20,.06) 34%,rgba(20,22,20,.62) 74%,rgba(20,22,20,.86) 100%)}
.dir-a .brand{position:absolute;left:76px;top:70px;color:#f4f1ea}
.dir-a .brand .en{color:#e8b48f}
.dir-a .logo{width:120px;height:120px;background:rgba(244,241,234,.9);border-radius:26px;padding:8px}
.dir-a .hero{position:absolute;left:76px;top:430px;color:#f7f4ed;max-width:860px}
.dir-a .hero h1{text-shadow:0 6px 34px rgba(0,0,0,.42)}
.dir-a .hero .en{display:block;font:italic 30px/1 Georgia,serif;color:#e8b48f;margin-top:26px;letter-spacing:1px}
.dir-a .strip{position:absolute;left:76px;right:76px;bottom:132px;display:flex;gap:26px}
.dir-a .strip img{width:236px;height:auto;border-radius:22px}
.dir-a .foot{color:#d8d3c7}
/* B 左右对分 */
.dir-b{padding:0;display:grid;grid-template-columns:52% 48%;grid-template-rows:1600px}
.dir-b .left{padding:76px 64px 52px 76px;display:flex;flex-direction:column;border-right:6px solid var(--clay)}
.dir-b h1{margin-top:210px;font-size:82px;letter-spacing:-3px}
.dir-b .sub{font-size:30px;color:var(--muted);margin:34px 0 0}
.dir-b .rule{width:104px;height:8px;background:var(--clay);margin:44px 0 0}
.dir-b .nums{display:flex;gap:44px;margin-top:auto;padding-top:60px}
.dir-b .nums b{display:block;font-size:76px;line-height:1;color:var(--green);font-weight:600}
.dir-b .nums span{display:block;font-size:19px;line-height:1.6;color:var(--muted);margin-top:14px}
.dir-b .right{position:relative;background:var(--green)}
.dir-b .right img{width:100%;height:1600px;object-fit:cover;object-position:50% 0}
.dir-b .logo{right:64px;top:76px}
.dir-b .foot{position:static;margin-top:40px}
/* C 三段居中 */
.dir-c{display:flex;flex-direction:column}
.dir-c .top{display:flex;align-items:flex-start;justify-content:space-between}
.dir-c .logo{position:static}
.dir-c .mid{margin-top:190px;max-width:1080px}
.dir-c .mid h1{font-size:104px;letter-spacing:-4px;line-height:1.22}
.dir-c .mid p{font-size:29px;line-height:1.8;color:var(--muted);margin:40px 0 0;max-width:900px}
.dir-c .row{margin-top:auto;display:flex;gap:34px;align-items:flex-end}
.dir-c .row figure{margin:0}
.dir-c .row img{width:280px;height:auto;border-radius:24px;border:1px solid var(--line)}
.dir-c .row figcaption{font-size:17px;color:var(--muted);margin-top:14px;letter-spacing:1px}
.dir-c .foot{position:static;margin-top:44px}
/* D 深绿精装 */
.dir-d{background:var(--green);color:#f2efe9}
.dir-d .mesh{position:absolute;inset:0;background-image:linear-gradient(#ffffff10 1px,transparent 1px),linear-gradient(90deg,#ffffff10 1px,transparent 1px);background-size:100px 100px}
.dir-d .brand{position:relative}
.dir-d .brand .en{color:#e8b48f}
.dir-d h1{position:relative;margin-top:150px;color:#f2efe9}
.dir-d .en{position:relative;display:block;font:italic 30px/1 Georgia,serif;color:#e8b48f;margin-top:28px}
.dir-d .side{position:absolute;right:76px;top:300px;writing-mode:vertical-rl;font-size:23px;line-height:2.4;letter-spacing:4px;color:#c6d2c2}
.dir-d .shot{position:absolute;right:120px;bottom:150px;width:360px}
.dir-d .shot img{width:100%;border-radius:30px}
.dir-d .foot{color:#a9bbaa}
/* E 卡片拼贴 */
.dir-e{background:var(--paper)}
.dir-e .cl{position:absolute;left:76px;top:430px;font-size:78px;line-height:1.26;font-weight:600;letter-spacing:-3px;max-width:660px}
.dir-e .stack{position:absolute;right:110px;top:300px;width:430px;height:760px}
.dir-e .stack img{position:absolute;width:300px;border-radius:6px}
.dir-e .s1{left:0;top:0;z-index:3}
.dir-e .s2{left:70px;top:70px;z-index:2;transform:rotate(5deg)}
.dir-e .s3{left:130px;top:130px;z-index:1;transform:rotate(-6deg)}
.dir-e .mini{position:absolute;left:76px;bottom:150px;display:flex;gap:22px;align-items:flex-end}
.dir-e .mini img{height:210px;width:auto;border-radius:14px}
.dir-e .mini img:nth-child(2){height:300px;border-radius:22px}
/* F 瑞士数字 */
.dir-f{background:var(--paper)}
.dir-f .mesh{position:absolute;inset:0;background-image:linear-gradient(90deg,transparent 0 127px,var(--line) 127px 128px);background-size:128px 100%}
.dir-f .lead{position:relative;max-width:640px;margin-top:120px}
.dir-f .lead h1{font-size:78px;letter-spacing:-3px;line-height:1.24}
.dir-f .lead p{font-size:26px;line-height:1.8;color:var(--muted);margin-top:30px}
.dir-f .col{position:absolute;right:76px;top:250px;width:430px}
.dir-f .col>div{display:grid;grid-template-columns:auto 44px 1fr;gap:0 16px;align-items:baseline;border-top:1px solid var(--ink);padding:26px 0}
.dir-f .col b{font-size:70px;font-weight:600;line-height:1;color:var(--green)}
.dir-f .col i{font-style:normal;font-size:24px;color:var(--clay)}
.dir-f .col span{font-size:20px;color:var(--muted);grid-column:1/-1;margin-top:10px}
.dir-f .band{position:absolute;left:76px;right:76px;bottom:120px;display:flex;gap:24px}
.dir-f .band img{width:252px;border-radius:22px}
'''

BUILDERS = {'A': a_full_bleed, 'B': b_split, 'C': c_three, 'D': d_green, 'E': e_collage, 'F': f_numbers}

HTML = ('<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">'
        '<title>封面方向稿·第二轮</title><style>' + CSS + '</style></head><body>'
        + ''.join(BUILDERS[k]() for k, _, _, _ in DIRS)
        + '</body></html>')

out = os.path.join(ROOT, '封面方向稿2.html')
open(out, 'w', encoding='utf-8').write(HTML)
print('pages', len(DIRS), 'bytes', os.path.getsize(out))
