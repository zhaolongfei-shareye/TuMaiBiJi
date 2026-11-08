# -*- coding: utf-8 -*-
"""A2 改 v3（站长 10-26 第三轮三条）：口号改用界面那枚书法位图／卡片不许比手机大／二维码去白底。

① 口号＝miniprogram/assets/title-heading.png（500×246，含"看到好内容，／随手记下来。／Save what
   matters"三行，屏上首屏用的就是这一枚）。原图墨色近黑，压在深色带上看不见，所以按它的 α 通道
   重出一枚亮墨色 素材/口号书法-亮墨.png——字形一个像素没动，只换墨色。原来那两行排版字与英文
   行撤掉（位图里已带英文，不重复）。
② 两张图改成同宽 177、底边对齐：首屏 734×1588→177×383，卡片 750×1230→177×290。卡片在两个方向
   上都不比手机大。
③ 小程序码去白底：撤掉浅色托底与内缩，码直接压在墙面上，168×168。
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda n: '素材/' + n
PHOTO = '旅行-林夏咖啡馆.png'
SCREEN = '首屏实拍-林夏.png'
CARD = '旅行卡-cover.png'
MARK = '品牌小程序码.png'
HEAD = '口号书法-亮墨.png'
BRAND = '<div class="brand"><span class="cn">图麦笔记</span><span class="en">TUMARKNOTE</span></div>'
FOOT = '微信小程序 · 详细产品介绍 · 2026'
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
          f'<figure class="sh"><img src="{A(CARD)}" alt="真实生成的分享卡片"></figure></div>'
        + f'<div class="right"><div class="hero"><img src="{A(HEAD)}" alt="看到好内容，随手记下来。Save what matters"></div>'
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
.qr{position:absolute;right:76px;top:70px;margin:0;width:168px;text-align:center}
.qr img{width:168px;height:168px;display:block}
.qr figcaption{font-size:16px;color:#d5cfc3;letter-spacing:1px;margin-top:8px}
.stack{position:absolute;left:0;right:0;bottom:0}
.bar{background:rgba(20,22,20,.74);padding:24px 76px 0;display:grid;grid-template-columns:auto 1fr;gap:48px;align-items:end}
.strip{display:flex;gap:22px;align-items:flex-end}
.sh{margin:0;width:177px}
.sh img{width:177px;height:auto;display:block;border-radius:20px;border:1px solid rgba(247,244,237,.30)}
.right{display:flex;flex-direction:column;justify-content:flex-end}
.hero{text-align:right}
.hero img{width:560px;height:auto;display:block;margin-left:auto}
.nums{display:flex;margin-top:22px;padding:20px 0 26px;border-top:1px solid rgba(247,244,237,.26)}
.n{flex:1;padding-left:16px;border-left:1px solid rgba(247,244,237,.18)}
.n:first-child{border-left:0;padding-left:0}
.n .v{display:flex;align-items:baseline}
.n b{font-size:40px;line-height:1;color:#f7f4ed;font-weight:600}
.n i{font-style:normal;font-size:18px;color:#e8b48f;margin-left:5px}
.n span{display:block;font-size:15px;line-height:1.5;color:#d5cfc3;margin-top:8px}
.social{display:flex;justify-content:space-between;align-items:center;padding:20px 76px 0;border-top:1px solid rgba(247,244,237,.14)}
.social>span{font-size:19px;color:#d5cfc3;letter-spacing:1px}
.social .row{display:flex;gap:16px}
.social img{width:44px;height:44px;border-radius:50%;border:1px solid rgba(247,244,237,.42);display:block}
.foot{padding:16px 76px 26px;font-size:16px;letter-spacing:2px;color:#a9a398}
'''

html = ('<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>封面 A2 改 v3</title>'
        '<style>' + CSS + '</style></head><body>'
        + f'<div class="page-wrap"><section class="page a2">{body}</section></div>'
        + '</body></html>')
out = os.path.join(ROOT, '封面方向稿6.html')
open(out, 'w', encoding='utf-8').write(html)
print('pages 1 bytes', os.path.getsize(out))
