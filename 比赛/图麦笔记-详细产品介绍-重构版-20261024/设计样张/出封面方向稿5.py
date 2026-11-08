# -*- coding: utf-8 -*-
"""A2 改 v2（站长 10-26 第二轮四条）：口号搬进深色带里（不再压人物）／两张图按同高对齐／右上角换小程序码。

四条落点：
① 「看到好内容，随手记下来。」＋Save what matters 从照片上搬进深色带右列上半，人物整幅露出来；
② 两张界面图改成等高（首屏 734×1588、卡片 750×1230，从前按同宽摆⇒卡片矮一截＝他说的"砍了一截"）；
③ 深色带右列下半＝四枚数字一排（K 数已撤）；
④ 右上角那枚浅色块里换成正宗小程序码（344×344，四色 logo 在码心，所以标识没丢）。
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda n: '素材/' + n
PHOTO = '旅行-林夏咖啡馆.png'
SCREEN = '首屏实拍-林夏.png'
CODE_IMG = '旅行卡-cover.png'
MARK = '品牌小程序码.png'
BRAND = '<div class="brand"><span class="cn">图麦笔记</span><span class="en">TUMARKNOTE</span></div>'
SLOGAN = '看到好内容，<br>随手记下来。'
FOOT = '微信小程序 · 详细产品介绍 · 2026'
SHOT_H = 380
NUMS = [('3', '种', '图片·链接·文字'),
        ('16', '种', '外文整理成中文'),
        ('9', '张', '照片收进同一篇'),
        ('11', '套', '卡片版式')]
PLATFORMS = ['微信-512.png', '公众号-512.png', '小红书-512.png', '微博-512.png', '知乎-512.png', '抖音-512.png']


def num_cells():
    return ''.join(f'<div class="n"><div class="v"><b>{v}</b><i>{u}</i></div><span>{lab}</span></div>' for v, u, lab in NUMS)


def discs():
    return ''.join(f'<img src="{A("平台圆标/" + p)}" alt="{p.split("-")[0]}">' for p in PLATFORMS)


body = (f'<div class="bg" style="background-image:url(\'{A(PHOTO)}\')"></div><div class="veil"></div>'
        + BRAND
        + f'<figure class="qr"><img src="{A(MARK)}" alt="图麦笔记小程序码"><figcaption>扫一扫打开</figcaption></figure>'
        + '<div class="stack"><div class="bar">'
        + f'<div class="strip"><figure class="sh"><img src="{A(SCREEN)}" alt="新建页首屏真实渲染"></figure>'
          f'<figure class="sh"><img src="{A(CODE_IMG)}" alt="真实生成的分享卡片"></figure></div>'
        + f'<div class="right"><div class="hero"><h1>{SLOGAN}</h1><span class="sub">Save what matters</span></div>'
          + '<div class="nums">' + num_cells() + '</div></div>'
        + '</div>'
        + f'<div class="social"><span>卡片存成一张图，发这些地方</span><div class="row">' + discs() + '</div></div>'
        + f'<div class="foot">{FOOT}</div></div>')

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
.qr{position:absolute;right:76px;top:70px;margin:0;width:176px;background:rgba(244,241,234,.94);border-radius:26px;padding:12px 12px 8px;text-align:center}
.qr img{width:152px;height:152px;display:block;margin:0 auto}
.qr figcaption{font-size:16px;color:#4a534c;letter-spacing:1px;margin-top:6px}
.stack{position:absolute;left:0;right:0;bottom:0}
.bar{background:rgba(20,22,20,.74);padding:24px 76px 0;display:grid;grid-template-columns:auto 1fr;gap:48px;align-items:end}
.strip{display:flex;gap:22px;align-items:flex-end}
.sh{margin:0}
.sh img{height:__SHOT_H__px;width:auto;display:block;border-radius:20px;border:1px solid rgba(247,244,237,.30)}
.right{display:flex;flex-direction:column;justify-content:flex-end}
.hero{text-align:right}
.hero h1{font-size:96px;line-height:1.14;letter-spacing:-4px;font-weight:600;margin:0;color:#f7f4ed}
.hero .sub{display:block;font:italic 25px/1 Georgia,serif;color:#e8b48f;margin-top:18px;letter-spacing:1px}
.nums{display:flex;margin-top:22px;padding:20px 0 26px;border-top:1px solid rgba(247,244,237,.26)}
.n{flex:1;padding-left:16px;border-left:1px solid rgba(247,244,237,.18)}
.n:first-child{border-left:0;padding-left:0}
.n .v{display:flex;align-items:baseline}
.n b{font-size:40px;line-height:1;color:#f7f4ed;font-weight:600}
.n i{font-style:normal;font-size:18px;color:#e8b48f;margin-left:5px}
.n span{display:block;font-size:15px;line-height:1.5;color:#d5cfc3;margin-top:8px}
.social{display:flex;justify-content:space-between;align-items:center;padding:20px 76px 0;border-top:1px solid rgba(247,244,237,.14);margin-top:0}
.social>span{font-size:19px;color:#d5cfc3;letter-spacing:1px}
.social .row{display:flex;gap:16px}
.social img{width:44px;height:44px;border-radius:50%;border:1px solid rgba(247,244,237,.42);display:block}
.foot{padding:16px 76px 26px;font-size:16px;letter-spacing:2px;color:#a9a398}
'''.replace('__SHOT_H__', str(SHOT_H))

html = ('<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>封面 A2 改 v2</title>'
        '<style>' + CSS + '</style></head><body>'
        + f'<div class="page-wrap"><section class="page a2">{body}</section></div>'
        + '</body></html>')
out = os.path.join(ROOT, '封面方向稿5.html')
open(out, 'w', encoding='utf-8').write(html)
print('pages 1 bytes', os.path.getsize(out))
