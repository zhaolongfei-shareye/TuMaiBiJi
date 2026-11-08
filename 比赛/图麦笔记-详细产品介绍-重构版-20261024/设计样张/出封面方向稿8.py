# -*- coding: utf-8 -*-
"""A2 改 v5（站长 10-26 第四轮四条）：口号缩＋80%透明＋留白／平台圆标上移到口号下方并放大／
数字搬到二维码下方竖排／背景人物往左挪。

人物位置这把尺：照片 1536×1024 按 cover 铺进 1280×1600 ⇒ 放大到 2400×1600，纵向刚好占满，
所以 background-position 的百分比只有横向起作用；页面 x 与源图 x 的关系是 src = (offset + page_x)/1.5625。
挪完用"暗色发丝的质心"量一次真实位移，不靠眼睛。
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda n: '素材/' + n
PHOTO = '旅行-林夏咖啡馆.png'
SCREEN = '首屏实拍-林夏.png'
CARD = '旅行卡-cover.png'
MARK = '品牌小程序码-亮墨.png'
HEAD = '口号书法-亮墨.png'
POS = '72% 22%'          # 56% → 72%：人物在页面上往左走约 158px
BRAND = '<div class="brand"><span class="cn">图麦笔记</span><span class="en">TUMARKNOTE</span></div>'
FOOT = '微信小程序 · 详细产品介绍 · 2026'
NUMS = [('3', '种', '图片·链接·文字'),
        ('16', '种', '外文整理成中文'),
        ('9', '张', '照片收进同一篇'),
        ('11', '套', '卡片版式')]
PLATFORMS = ['微信-512.png', '公众号-512.png', '小红书-512.png', '微博-512.png', '知乎-512.png', '抖音-512.png']


def num_list():
    return ''.join(f'<div class="num"><div class="v"><b>{v}</b><i>{u}</i></div><span>{lab}</span></div>' for v, u, lab in NUMS)


def discs():
    return ''.join(f'<img src="{A("平台圆标/" + p)}" alt="{p.split("-")[0]}">' for p in PLATFORMS)


body = (f'<div class="bg" style="background-image:url(\'{A(PHOTO)}\');background-position:{POS}"></div>'
        '<div class="veil"></div><div class="veil-r"></div>'
        + BRAND
        + f'<figure class="qr"><img src="{A(MARK)}" alt="图麦笔记小程序码"><figcaption>扫一扫打开</figcaption></figure>'
        + '<div class="stats">' + num_list() + '</div>'
        + '<div class="stack"><div class="bar">'
        + f'<div class="strip"><figure class="sh"><img src="{A(SCREEN)}" alt="新建页首屏真实渲染"></figure>'
          f'<figure class="sh"><img src="{A(CARD)}" alt="真实生成的分享卡片"></figure></div>'
        + f'<div class="right"><div class="hero"><img src="{A(HEAD)}" alt="看到好内容，随手记下来。Save what matters"></div>'
          + f'<div class="mood"><span>存成一张图，发这些地方</span><div class="row">' + discs() + '</div></div></div>'
        + '</div>'
        + f'<div class="foot">{FOOT}</div></div>')

CSS = '''
:root{--paper:#e2ded4;--ink:#19201f;--green:#223d35;--clay:#b95b3b;--muted:#59635c}
@font-face{font-family:"Zhuque Fangsong";src:url("素材/朱雀仿宋-Regular.ttf") format("truetype")}
*{box-sizing:border-box}body{margin:0;background:#c9c5bb;font-family:"Zhuque Fangsong","Songti SC",serif;color:var(--ink)}
.page-wrap{margin:34px auto;width:1280px;height:1600px}
.page{width:1280px;height:1600px;position:relative;overflow:hidden;background:#141614}
.bg{position:absolute;inset:0;background-size:cover}
.veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,20,18,.40) 0%,rgba(18,20,18,.06) 26%,rgba(18,20,18,.30) 46%,rgba(18,20,18,.72) 66%,rgba(18,20,18,.92) 100%)}
.veil-r{position:absolute;top:0;right:0;bottom:0;width:560px;background:linear-gradient(270deg,rgba(18,20,18,.66) 0%,rgba(18,20,18,.34) 52%,rgba(18,20,18,0) 100%)}
.brand{position:absolute;left:76px;top:70px;color:#f4f1ea}
.brand .cn{font-size:62px;font-weight:600;letter-spacing:3px}
.brand .en{display:block;font:17px/1 Arial,sans-serif;letter-spacing:10px;color:#e8b48f;margin-top:12px}
.qr{position:absolute;right:76px;top:64px;margin:0;width:168px;text-align:center}
.qr img{width:168px;height:168px;display:block}
.qr figcaption{font-size:16px;color:#d5cfc3;letter-spacing:1px;margin-top:8px}
.stats{position:absolute;right:76px;top:300px;width:290px;text-align:right}
.num{padding:22px 0;border-top:1px solid rgba(247,244,237,.22)}
.num:first-child{border-top:0;padding-top:0}
.num .v{display:flex;align-items:baseline;justify-content:flex-end}
.num b{font-size:44px;line-height:1;color:#f7f4ed;font-weight:600}
.num i{font-style:normal;font-size:19px;color:#e8b48f;margin-left:6px}
.num span{display:block;font-size:16px;line-height:1.5;color:#e6e1d7;margin-top:8px}
.stack{position:absolute;left:0;right:0;bottom:0}
.bar{background:rgba(20,22,20,.74);padding:24px 76px 0;display:grid;grid-template-columns:auto 1fr;gap:48px;align-items:end}
.strip{display:flex;gap:22px;align-items:flex-end}
.sh{margin:0;width:177px}
.sh img{width:177px;height:auto;display:block;border-radius:20px;border:1px solid rgba(247,244,237,.30)}
.right{display:flex;flex-direction:column;justify-content:flex-end;padding:26px 0}
.hero{text-align:right}
.hero img{width:470px;height:auto;display:block;margin-left:auto;opacity:.8}
.mood{margin-top:26px;padding-top:20px;border-top:1px solid rgba(247,244,237,.22);display:flex;justify-content:flex-end;align-items:center;gap:26px}
.mood>span{font-size:18px;color:#d5cfc3;letter-spacing:1px;white-space:nowrap}
.mood .row{display:flex;gap:18px}
.mood img{width:58px;height:58px;border-radius:50%;border:1px solid rgba(247,244,237,.42);display:block}
.foot{padding:18px 76px 26px;font-size:16px;letter-spacing:2px;color:#a9a398;border-top:1px solid rgba(247,244,237,.12)}
'''

html = ('<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>封面 A2 改 v5</title>'
        '<style>' + CSS + '</style></head><body>'
        + f'<div class="page-wrap"><section class="page a2">{body}</section></div>'
        + '</body></html>')
out = os.path.join(ROOT, '封面方向稿8.html')
open(out, 'w', encoding='utf-8').write(html)
print('pages 1 bytes', os.path.getsize(out))
