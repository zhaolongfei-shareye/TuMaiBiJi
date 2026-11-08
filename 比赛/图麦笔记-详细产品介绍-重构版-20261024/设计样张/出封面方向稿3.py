# -*- coding: utf-8 -*-
"""A 风格定稿轮：满版人像＋口号压图＋两张界面图（首屏与真实分享卡）＋一排数字。

三版只换"数字与两张界面怎么排"，其余（照片、口号、logo、页脚）完全一致，方便一次挑定。
数字全部现读：3 种记法＝图片/链接/文字三个入口；16 种外文＝站长拍的实测数；
9 张＝单篇配图上限；11 套＝卡片模板数；712 KB＝2.4.17 那颗代码包 729,103 B。
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
        ('11', '套', '卡片版式'),
        ('712', 'KB', '整个小程序')]


def num_cells(cls='n'):
    return ''.join(f'<div class="{cls}"><b>{v}</b><i>{u}</i><span>{lab}</span></div>' for v, u, lab in NUMS)


def shots():
    return (f'<figure class="sh"><img src="{A(SCREEN)}" alt="新建页首屏真实渲染"></figure>'
            f'<figure class="sh"><img src="{A(CARD)}" alt="真实生成的分享卡片"></figure>')


def page(name, inner):
    return f'<div class="page-wrap"><section class="page {name}">{inner}</section></div>'


def v2():
    """A2｜数字一排横在口号下方，两张界面压在底部右侧。"""
    return page('v2',
                f'<div class="bg" style="background-image:url(\'{A(PHOTO)}\')"></div><div class="veil"></div>'
                + BRAND + LOGO
                + f'<div class="hero"><h1>{SLOGAN}</h1><span class="en">Save what matters</span></div>'
                + '<div class="nums">' + num_cells() + '</div>'
                + '<div class="strip">' + shots() + '</div>'
                + f'<div class="foot">{FOOT}</div>')


def v3():
    """A3｜口号居左，数字做右侧竖列，两张界面并排在底部左侧。"""
    return page('v3',
                f'<div class="bg" style="background-image:url(\'{A(PHOTO)}\')"></div><div class="veil"></div>'
                + BRAND + LOGO
                + f'<div class="hero"><h1>{SLOGAN}</h1><span class="en">Save what matters</span></div>'
                + '<div class="col">' + num_cells() + '</div>'
                + '<div class="strip">' + shots() + '</div>'
                + f'<div class="foot">{FOOT}</div>')


def v4():
    """A4｜底部一条深色横带：左两张界面、右五枚数字，口号独占上半。"""
    return page('v4',
                f'<div class="bg" style="background-image:url(\'{A(PHOTO)}\')"></div><div class="veil"></div>'
                + BRAND + LOGO
                + f'<div class="hero"><h1>{SLOGAN}</h1><span class="en">Save what matters</span></div>'
                + '<div class="bar"><div class="strip">' + shots() + '</div>'
                + '<div class="col">' + num_cells() + '</div></div>'
                + f'<div class="foot">{FOOT}</div>')


CSS = '''
:root{--paper:#e2ded4;--ink:#19201f;--green:#223d35;--clay:#b95b3b;--muted:#59635c}
@font-face{font-family:"Zhuque Fangsong";src:url("素材/朱雀仿宋-Regular.ttf") format("truetype")}
*{box-sizing:border-box}body{margin:0;background:#c9c5bb;font-family:"Zhuque Fangsong","Songti SC",serif;color:var(--ink)}
.page-wrap{margin:34px auto;width:1280px;height:1600px}
.page{width:1280px;height:1600px;position:relative;overflow:hidden;background:#141614}
.bg{position:absolute;inset:0;background-size:cover;background-position:58% 26%}
.veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,20,18,.42) 0%,rgba(18,20,18,.10) 30%,rgba(18,20,18,.55) 62%,rgba(18,20,18,.88) 100%)}
.brand{position:absolute;left:76px;top:70px;color:#f4f1ea}
.brand .cn{font-size:62px;font-weight:600;letter-spacing:3px}
.brand .en{display:block;font:17px/1 Arial,sans-serif;letter-spacing:10px;color:#e8b48f;margin-top:12px}
.logo{position:absolute;right:76px;top:70px;width:124px;height:124px;object-fit:contain;background:rgba(244,241,234,.92);border-radius:26px;padding:8px}
h1{font-size:112px;line-height:1.16;letter-spacing:-4px;font-weight:600;margin:0;color:#f7f4ed}
.en{display:block;font:italic 29px/1 Georgia,serif;color:#e8b48f;margin-top:26px;letter-spacing:1px}
.hero{position:absolute;left:76px;top:392px;max-width:900px}
.hero h1{text-shadow:0 6px 34px rgba(0,0,0,.5)}
.sh img{width:100%;height:auto;border-radius:22px}
.sh{margin:0}
.foot{position:absolute;left:76px;bottom:54px;font-size:18px;letter-spacing:2px;color:#cfc9bd}
b{font-weight:600}
/* A2 数字横排 */
.v2 .nums{position:absolute;left:76px;right:76px;top:838px;display:flex;gap:0;border-top:1px solid rgba(247,244,237,.34);border-bottom:1px solid rgba(247,244,237,.34);padding:26px 0}
.v2 .n{flex:1;padding:0 22px;border-left:1px solid rgba(247,244,237,.2)}
.v2 .n:first-child{border-left:0;padding-left:0}
.v2 .n b{font-size:62px;line-height:1;color:#f7f4ed}
.v2 .n i{font-style:normal;font-size:23px;color:#e8b48f;margin-left:6px}
.v2 .n span{display:block;font-size:17px;line-height:1.6;color:#d5cfc3;margin-top:12px}
.v2 .strip{position:absolute;left:76px;right:76px;bottom:126px;display:flex;gap:26px}
.v2 .strip .sh{width:250px;flex:0 0 auto}
.v2 .strip .sh:last-child{width:250px}
/* A3 数字右列 */
.v3 .hero{top:360px;max-width:660px}
.v3 .col{position:absolute;right:76px;top:360px;width:380px}
.v3 .n{border-top:1px solid rgba(247,244,237,.28);padding:20px 0}
.v3 .n b{font-size:56px;line-height:1;color:#f7f4ed}
.v3 .n i{font-style:normal;font-size:21px;color:#e8b48f;margin-left:6px}
.v3 .n span{display:block;font-size:16px;line-height:1.6;color:#d5cfc3;margin-top:8px}
.v3 .strip{position:absolute;left:76px;bottom:126px;display:flex;gap:26px}
.v3 .strip .sh{width:250px}
/* A4 底部深色带 */
.v4 .hero{top:330px}
.v4 .bar{position:absolute;left:0;right:0;bottom:96px;background:rgba(20,22,20,.72);padding:34px 76px 40px;display:grid;grid-template-columns:auto 1fr;gap:52px;align-items:end}
.v4 .strip{display:flex;gap:22px}
.v4 .strip .sh{width:196px}
.v4 .col{display:flex;gap:0}
.v4 .n{flex:1;padding-left:20px;border-left:1px solid rgba(247,244,237,.22)}
.v4 .n:first-child{border-left:0;padding-left:0}
.v4 .n b{font-size:46px;line-height:1;color:#f7f4ed}
.v4 .n i{font-style:normal;font-size:19px;color:#e8b48f;margin-left:5px}
.v4 .n span{display:block;font-size:16px;line-height:1.6;color:#d5cfc3;margin-top:10px;min-height:52px}
'''

html = ('<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>封面 A 风格定稿三版</title>'
        '<style>' + CSS + '</style></head><body>'
        + v2() + v3() + v4() + '</body></html>')
out = os.path.join(ROOT, '封面方向稿3.html')
open(out, 'w', encoding='utf-8').write(html)
print('pages 3 bytes', os.path.getsize(out))
