# -*- coding: utf-8 -*-
"""把六版封面方向与对标的竞品参考拼成一张自包含取证板（HTML，图全部内嵌）。

规矩：效果图必须并排附上它对标的真实参考，不空口说"这是大厂做法"。
参考图来源＝2026-10-24 用 iTunes lookup 拿到的商店首图（/tmp/ref）与官网 hero（/tmp/hero/img），逐张打开看过。
"""
import base64
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REF = '/tmp/ref'
HERO = '/tmp/hero/img'
SHOTS = os.path.join(HERE, '封面方向2')


def uri(path):
    fmt = 'JPEG' if path.lower().endswith(('.jpg', '.jpeg')) else 'PNG'
    with open(path, 'rb') as f:
        raw = f.read()
    mime = 'image/jpeg' if fmt == 'JPEG' else 'image/png'
    return f'data:{mime};base64,' + base64.b64encode(raw).decode()


DIRS = [
    ('A', '满版人像', '照片铺满四边，口号压在图上，底部一条真实界面（首屏 → 整理后 → 发出去的卡）',
     [('Day One-1.jpg', 'Day One 商店首图'), ('Day One-2.jpg', 'Day One 商店首图'), ('notion-hero-poster.jpg', 'Notion 官网首屏')],
     '最"文艺"也最像杂志；风险是口号压在照片上，字要够大才立得住。'),
    ('B', '左右对分', '左半暖纸大字，右半满高真实界面，中间一条陶土竖线',
     [('Cubox-1.jpg', 'Cubox 商店首图'), ('Craft-1.jpg', 'Craft 商店首图'), ('cubox-og.jpg', 'Cubox 官网首屏')],
     '信息最清楚：一句话＋一个产品实拍；风险是左右等高时口号字号被栏宽限制。'),
    ('C', '三段居中', '顶部品牌条、中部超大口号、底部三屏并排',
     [('flomo浮墨-1.jpg', 'flomo 商店首图'), ('flomo-product.png', 'flomo 官网首屏'), ('Readwise-1.jpg', 'Readwise 商店首图')],
     '最"工具站"最成熟；风险是留白多，口号必须够大才不空。'),
    ('D', '深绿精装', '满版品牌绿＋暖纸色大字，界面浮在右下，右侧一行竖排',
     [('Obsidian-1.jpg', 'Obsidian 商店首图'), ('Obsidian-2.jpg', 'Obsidian 商店首图'), ('Craft-2.jpg', 'Craft 商店首图')],
     '品牌感最强、最"国际精装"；风险是深色底吃掉界面的暖色细节。'),
    ('E', '卡片拼贴', '一张真实卡片当主角，四周照片与小界面错位叠放',
     [('Day One-3.jpg', 'Day One 商店首图'), ('Craft-3.jpg', 'Craft 商店首图'), ('flomo浮墨-2.jpg', 'flomo 商店首图')],
     '直接展示成果物（发得出去的卡）；风险是元素多，容易显乱。'),
    ('F', '瑞士数字', '细网格＋一列大数字，底部一条真实界面',
     [('notion-hero-poster.jpg', 'Notion 官网首屏'), ('reader-hero-screen.png', 'Readwise 官网首屏'), ('印象笔记-1.jpg', '印象笔记 商店首图')],
     '用数字讲能力（712 KB／16 种／9 张／11 套／77 项，全部现读）；风险是偏理性，文艺感弱一档。'),
]

def pick(name):
    for d in (REF, HERO):
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    raise FileNotFoundError(name)


rows = []
for key, name, what, refs, risk in DIRS:
    shots = ''.join(f'<figure><img src="{uri(pick(f))}" alt="{n}"><figcaption>{n}</figcaption></figure>'
                    for f, n in refs)
    rows.append(
        f'<section class="row"><div class="cover"><img src="{uri(os.path.join(SHOTS, key + ".png"))}" '
        f'alt="{key} 版封面效果图"></div>'
        f'<div class="meta"><h2>{key}｜{name}</h2><p class="what">{what}</p>'
        f'<div class="refs">{shots}</div><p class="risk">{risk}</p></div></section>')

HTML = f'''<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<title>图麦笔记·封面方向第二轮（六版＋对标参考）</title>
<style>
:root{{--paper:#e2ded4;--ink:#19201f;--green:#223d35;--clay:#b95b3b;--muted:#59635c;--line:#c9cdc3}}
@font-face{{font-family:"ZF";src:url("../素材/朱雀仿宋-Regular.ttf")}}
body{{margin:0;background:#d5d1c7;color:var(--ink);font-family:"ZF","Songti SC",serif}}
header{{padding:56px 60px 34px;border-bottom:3px solid var(--ink)}}
header h1{{margin:0;font-size:46px;letter-spacing:-1px}}
header p{{font-size:20px;line-height:1.8;color:var(--muted);margin:16px 0 0;max-width:1080px}}
.row{{display:grid;grid-template-columns:560px 1fr;gap:44px;padding:44px 60px;border-bottom:1px solid var(--line);align-items:start}}
.row:nth-child(even){{background:#dcd8ce}}
.cover img{{width:100%;border:1px solid var(--line)}}
.meta h2{{margin:0 0 12px;font-size:34px;letter-spacing:-.5px}}
.what{{margin:0 0 24px;font-size:21px;line-height:1.75;color:var(--muted)}}
.refs{{display:flex;gap:16px;flex-wrap:wrap}}
.refs figure{{margin:0;width:150px}}
.refs img{{width:150px;height:auto;max-height:300px;object-fit:contain;background:#fff;border:1px solid var(--line)}}
.refs figcaption{{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.5}}
.risk{{margin:22px 0 0;font-size:17px;line-height:1.8;color:var(--ink);border-left:4px solid var(--clay);padding-left:14px}}
footer{{padding:34px 60px 60px;font-size:15px;color:var(--muted);line-height:1.9}}
</style></head><body>
<header><h1>图麦笔记 · 封面方向第二轮（六版）</h1>
<p>每版左边是 1280×1600 的整页效果图（与册子同尺寸，选定后可 1:1 落地），右边是它对标的外部真实参考。
三件已拍过的约束六版都守住了：主口号＝「看到好内容，随手记下来。」、四色 logo 上封面、界面必须是真实渲染（无台面、无墨框）且画面里有人物。
本轮只出效果图，<b>产品代码与册子一行没动</b>。</p></header>
{''.join(rows)}
<footer>参考图来源：2026-10-24 经 iTunes lookup 取得的 App Store 商店首图与各家官网首屏，逐张打开核对过；效果图内嵌的界面为开发者工具真实渲染（首屏 734×1588、卡片由本地产品代码实绘）。
数字口径：712 KB＝2.4.17 那颗代码包实测 729,103 B；16 种外文＝站长拍的实测数；9 张＝单篇配图上限；11 套＝卡片模板数；77 项＝本册功能清单条数。</footer>
</body></html>'''

out = os.path.join(HERE, '封面方向第二轮-取证板.html')
open(out, 'w', encoding='utf-8').write(HTML)
print('rows', len(rows), 'bytes', os.path.getsize(out))
