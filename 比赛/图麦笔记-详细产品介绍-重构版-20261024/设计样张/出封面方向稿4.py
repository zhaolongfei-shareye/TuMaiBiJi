# -*- coding: utf-8 -*-
"""A2 改（站长 10-26 三条指令）：口号挪到深色带上方靠右／K 数不写／深色带下方加一行社交平台小圆标。

圆标来自 docs/design/分享图-10-19平台logo/圆标/（做分享卡那轮收集的六枚 512×512），
已拷进 素材/平台圆标/；这些 PNG 无 alpha（方图铺满品牌色），所以靠 CSS 圆裁成圆标。
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda n: '素材/' + n
PHOTO = '旅行-林夏咖啡馆.png'
SCREEN = '首屏实拍-林夏.png'
CARD = '旅行卡-cover.png'
BRAND = '<div class="brand"><span class="cn">图麦笔记</span><span class="en">TUMARKNOTE</span></div>'
LOGO = f'<img class="logo" src="{A("品牌标识-四色.png")}" alt="图麦笔记四色标识">'
SLOGAN = '看到好内容，<br>随手记下来。'
FOOT = '微信小程序 · 详细产品介绍 · 2026'
NUMS = [('3', '种', '图片·链接·文字'),
        ('16', '种', '外文整理成中文'),
        ('9', '张', '照片收进同一篇'),
        ('11', '套', '卡片版式')]
# 顺序＝小程序里分享这一路真实会落到的地方：微信好友→朋友圈（同一枚微信）→公众号→小红书→微博→知乎→抖音
PLATFORMS = ['微信-512.png', '公众号-512.png', '小红书-512.png', '微博-512.png', '知乎-512.png', '抖音-512.png']


def num_cells():
    return ''.join(f'<div class="n"><div class="v"><b>{v}</b><i>{u}</i></div><span>{lab}</span></div>' for v, u, lab in NUMS)


def shots():
    return (f'<figure class="sh"><img src="{A(SCREEN)}" alt="新建页首屏真实渲染"></figure>'
            f'<figure class="sh"><img src="{A(CARD)}" alt="真实生成的分享卡片"></figure>')


def discs():
    return ''.join(f'<img src="{A("平台圆标/" + p)}" alt="{p.split("-")[0]}">' for p in PLATFORMS)


body = (f'<div class="bg" style="background-image:url(\'{A(PHOTO)}\')"></div><div class="veil"></div>'
        + BRAND + LOGO
        + '<div class="stack">'
        + f'<div class="hero"><h1>{SLOGAN}</h1><span class="sub">Save what matters</span></div>'
        + '<div class="bar"><div class="strip">' + shots() + '</div><div class="col">' + num_cells() + '</div></div>'
        + f'<div class="social"><span>卡片存成一张图，发这些地方</span><div class="row">' + discs() + '</div></div>'
        + f'<div class="foot">{FOOT}</div>'
        + '</div>')

CSS = '''
:root{--paper:#e2ded4;--ink:#19201f;--green:#223d35;--clay:#b95b3b;--muted:#59635c}
@font-face{font-family:"Zhuque Fangsong";src:url("素材/朱雀仿宋-Regular.ttf") format("truetype")}
*{box-sizing:border-box}body{margin:0;background:#c9c5bb;font-family:"Zhuque Fangsong","Songti SC",serif;color:var(--ink)}
.page-wrap{margin:34px auto;width:1280px;height:1600px}
.page{width:1280px;height:1600px;position:relative;overflow:hidden;background:#141614}
.bg{position:absolute;inset:0;background-size:cover;background-position:56% 22%}
.veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,20,18,.40) 0%,rgba(18,20,18,.06) 26%,rgba(18,20,18,.30) 46%,rgba(18,20,18,.72) 66%,rgba(18,20,18,.92) 100%)}
.brand{position:absolute;left:76px;top:70px;color:#f4f1ea}
.brand .cn{font-size:62px;font-weight:600;letter-spacing:3px}
.brand .en{display:block;font:17px/1 Arial,sans-serif;letter-spacing:10px;color:#e8b48f;margin-top:12px}
.logo{position:absolute;right:76px;top:70px;width:124px;height:124px;object-fit:contain;background:rgba(244,241,234,.92);border-radius:26px;padding:8px}
.stack{position:absolute;left:0;right:0;bottom:0}
.hero{padding:0 76px 26px;text-align:right}
.hero h1{font-size:104px;line-height:1.14;letter-spacing:-4px;font-weight:600;margin:0;color:#f7f4ed;max-width:760px;margin-left:auto}
.hero .sub{display:block;font:italic 27px/1 Georgia,serif;color:#e8b48f;margin-top:20px;letter-spacing:1px}
.bar{background:rgba(20,22,20,.74);padding:26px 76px 28px;display:grid;grid-template-columns:auto 1fr;gap:52px;align-items:stretch}
.strip{display:flex;gap:22px}
.sh{margin:0;width:172px}
.sh img{width:100%;height:auto;border-radius:20px;border:1px solid rgba(247,244,237,.30)}
.col{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
.n{display:flex;flex-direction:column;justify-content:center;padding-left:22px;border-left:1px solid rgba(247,244,237,.22);border-top:1px solid rgba(247,244,237,.22)}
.n .v{display:flex;align-items:baseline}
.n:nth-child(1),.n:nth-child(2){border-top:0}
.n:nth-child(odd){border-left:0;padding-left:0}
.n b{font-size:54px;line-height:1;color:#f7f4ed;font-weight:600}
.n i{font-style:normal;font-size:20px;color:#e8b48f;margin-left:6px}
.n span{display:block;font-size:17px;line-height:1.6;color:#d5cfc3;margin-top:12px}
.social{display:flex;justify-content:space-between;align-items:center;padding:22px 76px 0}
.social>span{font-size:19px;color:#d5cfc3;letter-spacing:1px}
.social .row{display:flex;gap:16px}
.social img{width:46px;height:46px;border-radius:50%;border:1px solid rgba(247,244,237,.42);display:block}
.foot{padding:20px 76px 34px;font-size:17px;letter-spacing:2px;color:#b9b3a8;border-top:1px solid rgba(247,244,237,.14);margin-top:20px}
'''

html = ('<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>封面 A2 改</title>'
        '<style>' + CSS + '</style></head><body>'
        + f'<div class="page-wrap"><section class="page a2">{body}</section></div>'
        + '</body></html>')
out = os.path.join(ROOT, '封面方向稿4.html')
open(out, 'w', encoding='utf-8').write(html)
print('pages 1 bytes', os.path.getsize(out))
