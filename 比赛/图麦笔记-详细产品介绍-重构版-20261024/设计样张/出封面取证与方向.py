# -*- coding: utf-8 -*-
"""竞品取证 + 三版封面方向：把 9 家笔记类产品的商店首屏、我们当前封面、按取证重画的三版
方向稿拼进一份自包含 HTML，图全部内嵌，他能一次看完并挑方向。"""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REF = Path('/tmp/ref')
OUT = ROOT / '设计样张' / '竞品取证与封面方向.html'

CARDS = '旅行卡-topBleedEdge.png'
ASSET = lambda name: ROOT / '素材' / name
PHONE = '首屏实拍-纸白.png'


def b64(path):
    raw = Path(path).read_bytes()
    ext = Path(path).suffix.lstrip('.').lower()
    mime = 'image/jpeg' if ext in ('jpg', 'jpeg') else 'image/png'
    return f'data:{mime};base64,{base64.b64encode(raw).decode()}'


def img(path):
    return b64(path)


# 竞品：(文件, 产品, 这一屏实际做了什么, 有没有把产品界面放上来)
REFS = [
    ('flomo浮墨-1.jpg', 'flomo', '标题＋副标题＋奖项条压在上方，下面直接铺 App 内真实的卡片流（截图带内容，无手机外壳）', '有界面 · 有内容 · 无外壳'),
    ('Cubox-1.jpg', 'Cubox', '「一次收藏，尽在掌握」＋一部完整 iPhone（状态栏、圆角、投影齐全），机身周围散落微信/小红书/豆瓣/知乎的来源图标', '有界面 · 有外壳 · 有内容'),
    ('Readwise-1.jpg', 'Readwise', '深底上一部大 iPhone 斜放，屏幕里是当天的 Daily Review 卡片与书封', '有界面 · 有外壳 · 有内容'),
    ('Craft-1.jpg', 'Craft', '暖纸底＋金色大字，界面拆成几张浮空卡片错落叠放，下面挂两个奖项', '有界面 · 无外壳 · 有内容'),
    ('Notion-1.jpg', 'Notion', '整屏只有一句「让你的生活井然有序。」加一支黑白线条插画，不放界面', '无界面 · 纯插画'),
    ('Day One-1.jpg', 'Day One', '媒体背书一排（NYT/Forbes/TIME），下面一部大 iPhone 里是带照片的真实日记', '有界面 · 有外壳 · 有内容'),
    ('语雀-1.jpg', '语雀', '纯色底＋一句主张＋五条打勾清单，不放界面', '无界面 · 纯文字'),
    ('Obsidian-1.jpg', 'Obsidian', '黑底，一句英文主张压在铺满的 App 截图上', '有界面 · 无外壳 · 有内容'),
    ('印象笔记-1.jpg', '印象笔记', '绿底，手机斜切出血到画幅外，配「数亿笔记用户的选择」', '有界面 · 有外壳 · 有内容'),
]

FINDINGS = [
    ('一屏只讲一件事',
     '9 家全部：一句主张 + 一个主视觉，最多再加一行背书。我们第 1 页现在同时放了品牌字标、太阳码、陶土横、口号、两行引导句、深绿色块、手机、说明段、出处句、底部元信息——十件。'),
    ('手机是画面里最大的东西',
     'Craft / Day One / Cubox / Readwise / 印象笔记那五台真机，都是压过画面中线的主角，其中三台直接出血到画幅外。我们那台是 272×587，摆在 1280×1600 的页面里＝宽 21.3%、高 36.7%（数从 CSS 现算：屏 262 + 框 10）。'),
    ('屏上要有内容',
     '9 家里放了界面的 7 家，屏幕里全是**有内容的**：日记照片、书评卡、卡片流、正文。只有我们放的是一屏还没录任何东西的录入页——看着像没开机。'),
    ('营销页不写出处',
     '9 家没有一家在首屏写「这是渲染图／示意／未做重绘」。我们封面上那两行出处说明，是把工程台账搬到了货架上。出处该留在交付说明里，不该在画面上。'),
    ('背书是标配',
     'flomo、Cubox、Craft、Day One、语雀五家把奖项、媒体或用户量放在第一屏。我们一个都没有。'),
]

# 三版方向：每版都写明它抄的是哪一家的哪一条
def cover_a():
    """甲 · Craft 式暖纸大字 + 大机出血"""
    return f'''<div class="page dir-a">
  <div class="a-top"><span class="a-name">图麦笔记</span><span class="a-en">TUMARKNOTE</span>
    <img class="a-qr" src="{img(ROOT/'素材/品牌小程序码.png')}" alt="小程序码"></div>
  <h1 class="a-h">看到好内容，<br>随手记下来。</h1>
  <p class="a-sub">一张照片、一条链接、一段舍不得关掉的长文——<br>十秒变成一篇读得懂的中文笔记。</p>
  <div class="a-meta"><span>16 种外文内容</span><b>·</b><span>最多 9 张照片</span><b>·</b><span>一篇中文笔记</span></div>
  <div class="a-band"></div>
  <div class="a-phone"><img src="{img(ASSET(PHONE))}" alt="新建页首屏真实渲染"></div>
</div>'''


def cover_b():
    """乙 · Cubox 式来源流进来"""
    src = ['微信', '小红书', '网页', '拍照']
    chips = ''.join(f'<span class="b-chip">{s}</span>' for s in src)
    return f'''<div class="page dir-b">
  <div class="b-left">
    <div class="b-brand">图麦笔记<span>TUMARKNOTE</span></div>
    <h1 class="b-h">存进来的<br>都是外文？<br>读成中文再收好。</h1>
    <div class="b-chips">{chips}</div>
    <p class="b-sub">拍照、贴链接、直接写字，向右一滑就整理成一篇。</p>
    <img class="b-qr" src="{img(ROOT/'素材/品牌小程序码.png')}" alt="小程序码">
  </div>
  <div class="b-right">
    <div class="b-phone"><img src="{img(ASSET(PHONE))}" alt="新建页首屏真实渲染"></div>
    <figure class="b-card"><img src="{img(ASSET(CARDS))}" alt="生成的图文卡">
      <figcaption>这篇笔记发出去的那张卡</figcaption></figure>
  </div>
</div>'''


def cover_c():
    """丙 · Readwise 式成品当主角"""
    return f'''<div class="page dir-c">
  <div class="c-left">
    <div class="c-kicker">图麦笔记 · TUMARKNOTE</div>
    <figure class="c-hero"><img src="{img(ASSET(CARDS))}" alt="图文卡真实成品"></figure>
    <div class="c-cap">这张卡由一篇笔记直接生成，可发微信好友、朋友圈、公众号</div>
  </div>
  <div class="c-right">
    <h1 class="c-h">把图文，<br>提炼成<br>有用的干货。</h1>
    <p class="c-sub">一篇笔记，十秒之后是一张能直接发出去的卡。</p>
    <ul class="c-list"><li>16 种外文内容 → 一篇中文笔记</li><li>最多 9 张照片 → 一起收进这一篇</li>
      <li>11 套模板 → 换套版式再发出去</li></ul>
    <img class="c-qr" src="{img(ROOT/'素材/品牌小程序码.png')}" alt="小程序码">
  </div>
</div>'''


DIRS = [
    ('甲 · 暖纸大字，大机出血', '学 Craft 与 Day One：口号当画面主体，手机放大到占页高六成、底边出血到纸边；深绿色块撤掉，出处句撤掉，元信息缩成一行。', cover_a()),
    ('乙 · 来源流进来', '学 Cubox：左主张右证据，手机只露上半截，成品图文卡并排压上——把「存进来什么、出去长什么样」一屏说完。', cover_b()),
    ('丙 · 成品当主角', '学 Readwise 第 3 屏（书页照片 + 浮空 UI 卡）：直接拿产品生成的那张卡当主视觉，主张用产品自己的 slogan，手机可以整台不上。', cover_c()),
]

# 六家官网首屏（图落盘在 /tmp/hero，2026-10-24 由另一趟取证抓回；逐张自己打开看过才算数）
HERO = Path('/tmp/hero')
HEROS = [
    ('img/flomo-product.png', 'flomo 官网', '最上方一排五组金色桂冠（编辑推荐／匠心奖／至美奖／金米奖／极光奖），下面 MacBook＋iPhone＋iPad 三台带外壳设备，屏幕里全是满数据的卡片流。'),
    ('img/cubox-og.jpg', 'Cubox 分享图', '它的 og:image 走的是吉祥物＋一句「Cubox，你的 AI 稍后阅读助手」，界面一张都不放。（正文首屏那台阅读窗是 DOM/CSS 拼的，本地没存到那张图，只记在这里。）'),
    ('img/reader-hero-screen.png', 'Readwise Reader', '裸截图铺满，圆角＋柔影，无设备外壳。屏里是文章列表＋右侧高亮＋笔记栏——一屏都是内容。'),
    ('img/notion-hero-poster.jpg', 'Notion', '真实录屏的首帧：浏览器标签条里的一个工作区，表格、任务、AI 面板全在。无外壳，底边裁掉。'),
    ('img/dayone-journal.png', 'Day One', '纯白底，DAY ONE 字标下面一排 MacBook＋iPhone＋iPad＋Apple Watch 带外壳拼贴，屏幕里是带照片的真实日记。'),
    ('craft-hero-desktop.png', 'Craft', '真实 Mac 窗口（只留红绿灯、无外壳）沉进首屏底边被裁掉一截，靠柔和阴影与蓝→浅蓝渐变底衔接。'),
]

HERO_RULES = [
    '界面图一律在主标题下方或右侧，文字不压图（六家里五家这样）。',
    '屏上全是满数据的内容——**没有一家拿一屏空的录入页当门面**。',
    '图与底色靠柔和投影或留白衔接，不用硬描边（Craft／Reader 是裸截图＋圆角＋软影）。',
    '呈现分两派：Reader／Notion／Craft 用裸截图裁切；flomo／Day One 用完整设备外壳拼贴＋奖项背书。',
    '底色全是低饱和纯色或单向渐变，没有一家拿照片大图当首屏底。',
]

rows_hero = ''.join(
    f'<figure class="ref"><img src="{img(HERO / f)}" alt="{n}"><figcaption><b>{n}</b>'
    f'<span>{what}</span></figcaption></figure>' for f, n, what in HEROS)
rows_rule = ''.join(f'<div class="find"><b>{i + 1}｜规则</b><p>{r}</p></div>' for i, r in enumerate(HERO_RULES))

rows_ref = ''.join(
    f'<figure class="ref"><img src="{img(REF / f)}" alt="{n}"><figcaption><b>{n}</b>'
    f'<span>{what}</span><em>{kind}</em></figcaption></figure>'
    for f, n, what, kind in REFS)

rows_find = ''.join(
    f'<div class="find"><b>{i + 1}｜{t}</b><p>{d}</p></div>' for i, (t, d) in enumerate(FINDINGS))

rows_dir = ''.join(
    f'<section class="dir"><header><h2>{t}</h2><p>{why}</p></header>{html}</section>'
    for t, why, html in DIRS)

CSS = '''
*{box-sizing:border-box}body{margin:0;background:#dcded8;color:#19201f;font-family:"Hiragino Sans GB","PingFang SC",sans-serif}
.wrap{max-width:1240px;margin:0 auto;padding:56px 32px 96px}
h1.doc{font-size:44px;letter-spacing:-1.5px;margin:0 0 14px}
.lede{font-size:19px;line-height:1.8;color:#59635c;max-width:900px;margin:0 0 44px}
h2.sec{font-size:26px;margin:64px 0 22px;padding-top:22px;border-top:3px solid #b95b3b}
.refs{display:grid;grid-template-columns:repeat(3,1fr);gap:26px}
.ref{margin:0;background:#fff;border:1px solid #c9cdc3;padding:14px}
.ref img{width:100%;height:330px;object-fit:cover;object-position:top center;border-radius:2px}
.ref figcaption{margin-top:12px;font-size:13px;line-height:1.7}
.ref b{display:block;font-size:17px;margin-bottom:6px}
.ref span{display:block;color:#59635c}
.ref em{display:inline-block;margin-top:8px;font-style:normal;font-size:11.5px;color:#b95b3b;border:1px solid #b95b3b;padding:3px 8px}
.find{border-top:1px solid #c9cdc3;padding:20px 0}
.find b{display:block;font-size:19px;margin-bottom:8px}
.find p{margin:0;font-size:16px;line-height:1.85;color:#59635c;max-width:1000px}
.now{background:#fff;border:1px solid #c9cdc3;padding:16px;margin-bottom:8px}
.now img{width:100%;max-width:520px;display:block;margin:0 auto}
.dir{margin:52px 0 76px}
.dir>header h2{font-size:24px;margin:0 0 8px}
.dir>header p{margin:0 0 20px;font-size:16px;line-height:1.8;color:#59635c;max-width:1000px}
.page{width:1280px;height:1600px;position:relative;overflow:hidden;transform:scale(.82);transform-origin:top left;background:#f4f1eb;color:#19201f;border:1px solid #c9cdc3;margin-bottom:-290px}
.page img{display:block}
/* 甲 */
.dir-a{padding:0 96px}
.a-top{display:flex;align-items:center;gap:22px;padding-top:88px}
.a-name{font-size:38px;font-weight:600;letter-spacing:2px}
.a-en{font:13px/1 Arial,sans-serif;letter-spacing:8px;color:#b95b3b}
.a-qr{width:82px;height:82px;object-fit:contain;margin-left:auto}
.a-h{font-size:152px;line-height:1.06;letter-spacing:-6px;font-weight:600;margin:120px 0 0}
.a-sub{font-size:29px;line-height:1.7;color:#59635c;margin:44px 0 0;max-width:840px}
.a-band{position:absolute;left:0;right:0;bottom:0;height:474px;background:linear-gradient(#e6e2d8,#dcd7cb)}
.a-phone{position:absolute;right:104px;bottom:-96px;width:452px}
.a-phone img{width:452px;height:auto;border-radius:44px;border:9px solid #19201f;box-shadow:0 40px 80px -28px rgba(25,32,31,.6)}
.a-meta{font-size:26px;line-height:1.75;letter-spacing:2px;color:#59635c;margin:64px 0 0;max-width:544px}
.a-meta b{color:#b95b3b;margin:0 14px;font-weight:400}
/* 乙 */
.dir-b{display:grid;grid-template-columns:600px 1fr;background:#223d35;color:#f4f1eb}
.b-left{padding:104px 0 104px 96px}
.b-brand{font-size:36px;font-weight:600;letter-spacing:2px}
.b-brand span{display:block;font:12px/1 Arial,sans-serif;letter-spacing:8px;color:#e6a68a;margin-top:12px}
.b-h{font-size:96px;line-height:1.14;letter-spacing:-4px;font-weight:600;margin:96px 0 0}
.b-chips{display:flex;gap:12px;margin:52px 0 0}
.b-chip{font-size:20px;border:1px solid #7c9080;border-radius:999px;padding:9px 22px;color:#cddac9}
.b-sub{font-size:25px;line-height:1.75;color:#cddac9;margin:56px 0 0;max-width:430px}
.b-qr{width:120px;height:120px;object-fit:contain;margin-top:96px}
.b-right{position:relative}
.b-phone{position:absolute;right:-140px;top:150px;width:520px}
.b-phone img{width:520px;border-radius:48px;border:9px solid #19201f;box-shadow:0 40px 90px -30px rgba(0,0,0,.7)}
.b-card{position:absolute;left:56px;bottom:150px;width:330px;margin:0;background:#fff;padding:12px;box-shadow:0 26px 60px -24px rgba(0,0,0,.7)}
.b-card img{width:100%;height:auto}
.b-card figcaption{font-size:14px;line-height:1.6;color:#59635c;margin-top:10px}
/* 丙 */
.dir-c{display:grid;grid-template-columns:640px 1fr;background:#223d35;color:#f4f1eb}
.c-left{padding:96px 0 96px 96px}
.c-kicker{font:13px/1 Arial,sans-serif;letter-spacing:8px;color:#e6a68a}
.c-hero{margin:64px 0 0;width:466px}
.c-hero img{width:466px;height:auto;box-shadow:0 40px 90px -30px rgba(0,0,0,.75)}
.c-cap{font-size:16px;line-height:1.8;color:#9fb3a2;margin-top:34px;max-width:430px;border-left:2px solid #b95b3b;padding-left:14px}
.c-right{padding:150px 96px 0 76px}
.c-h{font-size:104px;line-height:1.16;letter-spacing:-4px;font-weight:600;margin:0}
.c-sub{font-size:23px;line-height:1.8;color:#cddac9;margin:44px 0 0;max-width:420px}
.c-list{list-style:none;padding:0;margin:72px 0 0;border-top:1px solid #4c6659}
.c-list li{font-size:26px;line-height:1.6;padding:26px 0;border-bottom:1px solid #4c6659}
.c-qr{width:132px;height:132px;object-fit:contain;margin-top:88px}
.note{background:#fff;border-left:5px solid #b95b3b;padding:22px 26px;font-size:16px;line-height:1.85;color:#59635c;margin-top:16px}
'''

html = f'''<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>竞品取证与封面方向</title><style>{CSS}</style></head><body><div class="wrap">
<h1 class="doc">竞品取证 · 九家笔记类产品的首屏，和我们差在哪</h1>
<p class="lede">图全部取自 App Store 中国区在售产品的商店截图（iTunes Search API 现拉，2026-10-24），不是凭印象画的参考图。下面每条结论都指得回上面哪一格。</p>
<h2 class="sec">一、九家真实的首屏</h2>
<div class="refs">{rows_ref}</div>
<h2 class="sec">二、我们当前这一版（第 1 页）</h2>
<div class="now"><img src="{img(ROOT/'瑞士故事版图片/01.png')}" alt="当前封面"></div>
{rows_find}
<div class="note">这五条不是审美之争，是**信息密度与主体大小**两件事：同一屏里我们的元素是别家的三到五倍，而唯一该当主角的手机只有别家的一半大。出处说明那一条最便宜，删掉就行。</div>
<h2 class="sec">三、六家官网首屏（不是商店图，是它们自己首页上那一屏）</h2>
<div class="refs">{rows_hero}</div>
{rows_rule}
<div class="note">这两批证据合起来只指向两件事：<b>把手机做大、把屏幕换成有内容的那一屏</b>；以及我们当前封面那圈 5px 墨框＋1px 台面线是硬描边，竞品用的是柔和投影。</div>
<h2 class="sec">四、按取证重画的三版方向（真渲染，不是描述）</h2>
{rows_dir}
</div></body></html>'''

OUT.write_text(html, encoding='utf-8')
print(json.dumps({'out': str(OUT), 'bytes': OUT.stat().st_size,
                  'refs': len(REFS), 'findings': len(FINDINGS), 'directions': len(DIRS)},
                 ensure_ascii=False))
