# -*- coding: utf-8 -*-
"""agentsbin.cn 官网改版效果图：三屏（新增来源排／模板换真实成品／版本只留大版本）。

视觉沿用官网现有一切令牌（site.css：--paper #F2EFE9、--ink #14161A、--clay #D2683F、
Playfair Display + Songti SC），不另起一套风格——这屏要看起来像同一个站长出来的。
数字全部现读：模板 11 套＝backend/seed/poster_templates.json 逐条数（经典 5＋个性 6）；
站名 18 家＝backend/app/services/site_names.py 那张词表；实测能存的那几家＝docs/枚举-URL转存全部情况.md。
"""
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
A = lambda n: '素材/' + n
CLASSIC = [('图文卡', 'topBleedEdge'), ('玉版宣', 'card'), ('摘句', 'quote'), ('叠翠', 'block'), ('规格卡', 'spec')]
BOLD = [('素宣信笺', 'letter'), ('波普分格', 'popGrid'), ('网点漫画', 'popDots'),
        ('荧光渐变', 'acid'), ('杂志封面', 'cover'), ('纸间文艺', 'lit')]
# 矩阵表十（10-29 现网那一腿）里"正文＋配图逐张真下得下来"的六家：
# 第 1/3/8/4/10/7 行。CSDN 那条的第一张是作者头像、被占位判据拦掉，正文图从第二张起。
PROVEN = ['公众号', '网易', '博客园', '新浪', '凤凰', 'CSDN']
# 词表认得这 18 家站名（10-30 灌进后台那一份）；首行那六家也在里面，这里只列余下十二家
NAMES = ['少数派', '搜狐', 'GitHub', 'arXiv', '澎湃', '新华网', '豆瓣', 'B站', '知乎', '微博', '小红书', 'StackOverflow']
# 这两家的图标本机取不干净：搜狐 /favicon.ico 回 403，网易那枚只有 16px 且是一整块红
# ⇒ 样张里直接用「文字块」兜底，正好把线上也需要的那条兜底规则画出来
MONO = {'网易', '搜狐'}


def chip(n, cls=''):
    mark = (f'<span class="mn">{n[0]}</span>' if n in MONO
            else f'<img src="{A("站标-" + n + ".png")}" alt="">')
    return f'<span class="chip {cls}">{mark}{n}</span>'


def card(name, key, cls=''):
    return (f'<figure class="tpl {cls}"><img src="{A("真卡-" + key + ".png")}" alt="{name}模板真实导出成品">'
            f'<figcaption>{name}</figcaption></figure>')


# ── 屏一：新增「支持的网站」那一排 ────────────────────────────────────
p1 = f'''<section class="panel">
  <p class="kicker">Sources · 图麦笔记</p>
  <h2><span class="cn">贴进来就认得出处</span></h2>
  <p class="lead">链接粘进去，正文读成一条笔记、配图能存下来的跟着一起存住；来源那一格写的是<b>具体站名</b>，不是一串 http。</p>
  <div class="grp"><span class="glab">正文和配图都存得下<span class="gs">这六家逐张真下过图（10-29 现网那一趟）</span></span>
    <div class="row">{''.join(chip(n, 'on') for n in PROVEN)}<span class="chip gen">其它任意网页</span></div></div>
  <div class="grp"><span class="glab">最新认得这十八家的名字<span class="gs">10-30 灌进后台，来源那一格优先念站名</span></span>
    <div class="row">{''.join(chip(n) for n in NAMES)}<span class="chip more">＋ 上面那六家</span></div></div>
  <p class="disclaim">「认得名字」和「存得进来」是两件事。<b>少数派、搜狐、GitHub、arXiv</b> 这四家正文存得下、配图那一格还差一步
     （图床要带 Referer 没落码／取回来的是头像和站点图标）；<b>小红书、微博、知乎、B 站、Stack Overflow</b> 这五家被对方的登录墙或反爬挡住，
     现在只能存下链接那一行；<b>澎湃、新华网、豆瓣</b> 是样本那条正文里本来没图，图这一格没量到。所以第一排只放真存下过的那六家。
     以上站点名称仅用于说明兼容范围，不代表任何合作或官方背书。</p>
</section>'''

# ── 屏二：模板屏（换成真实导出成品）────────────────────────────────
p2 = f'''<section class="panel">
  <p class="kicker">Templates · 十一套</p>
  <h2><span class="cn">同一篇笔记，十一种样子</span></h2>
  <div class="grp"><span class="glab">经典款（5）<span class="gs">配色跟着你笔记的分类走</span></span>
    <div class="tpls">{''.join(card(n, k) for n, k in CLASSIC)}</div></div>
  <div class="grp"><span class="glab">个性款（6）<span class="gs">敢玩颜色，各自一套版式</span></span>
    <div class="tpls">{''.join(card(n, k) for n, k in BOLD)}</div></div>
  <p class="disclaim">上面这十一张是<b>本机产品代码画出来的真实导出成品</b>（同一篇笔记、同一组配图，逐套跑一遍存下来的），不是按版式重画的示意。
     十一套都在小程序里现选现出，不要钱、没有次数墙。</p>
</section>'''

# ── 屏三：版本更新（只留大版本）────────────────────────────────────
LOG = [
    ('2.4', '2026-10-19 起', '当前线上 2.4.16',
     ['新增「图文卡」那一套：大图铺在上半、文字压在下沿，卡片模板到十一套',
      '笔记里的图片能随笔记一起存住，删笔记时云端那份一并删掉',
      '卡片模板改成「卡片市场」：一排版式摆出来只看，不再点中一格就落盘',
      '列表那枚星改成「有人转存」；分类字号抬到关于页那一档']),
    ('2.3', '2026-10-17 起', '',
     ['笔记列表与卡片列表合成一屏，看完笔记返回停在原来那一枚标签',
      '详情窗补上配图那一排；编辑笔记时能单独删掉某一张',
      '私密密码不再一篇问一回',
      '卡片的大图位改用这一篇的第一张配图']),
    ('2.2', '2026-10-14 起', '',
     ['界面换成五档彩色毛玻璃：墨、象牙、天青、樱落、雨雾，点「换心情」整屏一起换',
      '底下三个 tab 跟着玻璃一起换色，面板投影也进同一档',
      '首页改成通栏那一块深色面板']),
    ('2.1', '2026-10-09 起', '',
     ['名片、昵称、卡片版式、背景亮度存进账号，换手机还在',
      '首页改版：录入入口更直接，背景图能换、明暗能单独调',
      '「我的」页新增邮箱一栏；带图的笔记分享出去，朋友能看到图了']),
    ('2.0', '2026-10-08', '',
     ['图片云备份整条打通：随笔记保存、详情页原样看回',
      '十套卡片模板一次上线，配方走服务端下发',
      '一篇笔记只留一张卡片图']),
]
p3 = '<section class="panel panel-log">\n  <p class="kicker">Changelog · 图麦笔记</p>\n  <h2><span class="cn">改到哪儿了，写在这儿</span></h2>\n  <div class="log">'
for v, d, now, items in LOG:
    p3 += (f'    <article><header><b class="v">{v}</b><span class="d">{d}</span>'
           + (f'<span class="now">{now}</span>' if now else '') + '</header><ul>'
           + ''.join(f'<li>{i}</li>' for i in items) + '</ul></article>\n')
p3 += ('  </div>\n  <p class="disclaim">只写大版本，小版本号不列（一份包一个号，逐号看没意义）。'
       '版本号与上线日期取自微信后台的发布记录；当前线上正式版 2.4.16（2026-10-24 15:19 发布）。</p>\n</section>')

# ── 屏四：十六种外文那一屏 ────────────────────────────────────────
# 名单正本＝backend/probes/multilingual_zh_probe.py 里 CORPUS 那 16 条（现读，不是凑数）
LANGS = ['英语', '日语', '韩语', '法语', '德语', '西班牙语', '俄语', '阿拉伯语',
         '葡萄牙语', '意大利语', '泰语', '越南语', '印地语', '印尼语', '土耳其语', '荷兰语']
p4 = f'''<section class="panel">
  <p class="kicker">Languages · 十六种外文</p>
  <h2><span class="cn">贴进来是外文，整理出来是中文</span></h2>
  <p class="lead">英文、阿拉伯文还是泰文都一样——<b>标题、摘要、要点、标签那四栏一律写成中文</b>；
     原文一个字不动，照原样存在同一篇里，想核对随时切回去看。</p>
  <div class="grp"><span class="glab">这十六种备着语料<span class="gs">一条探针、每语一段等义短文，埋四个可对数的细节</span></span>
    <div class="row langs">{''.join(f'<span class="lg">{n}</span>' for n in LANGS)}</div></div>
  <div class="grp"><span class="glab">屏上就这一枚开关<span class="gs">三条录入路都带着它，默认开着</span></span>
    <div class="sw"><span class="dot"></span><b>原文翻译</b><span class="hint">识别到外文自动翻译成中文</span></div></div>
  <div class="grp"><span class="glab">同一段海外原文，三种写法进去<span class="gs">示例语料：英、阿、泰三种文字写的是同一篇纽约高线公园的介绍</span></span>
    <div class="demo">
      <div class="src">
        <p><i>EN</i><span>The High Line opened its first section in 2009 on a disused elevated freight rail line in Manhattan. It runs 2.33 km through the city, planted with over 360 species…</span></p>
        <p><i>عربى</i><span dir="rtl">افتتح هاي لاين أول قسم له في عام ٢٠٠٩ على خط سكة حديد مرتفع مهجور في مانهاتن، ويمتد لمسافة ٢٫٣٣ كم مزروعًا بأكثر من ٣٦٠ نوعًا…</span></p>
        <p><i>ไทย</i><span>ไฮไลน์เปิดส่วนแรกในปี 2009 บนทางรถไฟสินค้ายกระดับที่เลิกใช้ในแมนฮัตตัน ยาว 2.33 กิโลเมตร ปลูกมากกว่า 360 ชนิด…</span></p>
      </div>
      <span class="arrow" aria-hidden="true">→</span>
      <div class="out">
        <p class="ti">纽约高线：老货运铁轨上造的 2.3 公里</p>
        <p class="su">高线公园第一段 2009 年开放，走的是曼哈顿一条废弃的高架货运铁轨；整条 2.33 公里穿城向北，两侧种了 360 多种草、树和宿根花卉，每年约 800 万人上去走一圈。</p>
        <ul><li>2009 年开放第一段</li><li>老高架货运铁轨改的，不是新建的公园</li><li>全长 2.33 公里</li><li>360 多种植物，年均约 800 万人次</li></ul>
        <p class="tg">城市改造 · 公共空间 · 纽约</p>
      </div>
    </div></div>
  <p class="disclaim">三句实话：① <b>它不翻译原文</b>——原文照原样存着，这枚开关只管整理结果用什么语言写；
     ② <b>界面语言只有中文和英文两种</b>，跟着微信语言走，"十六种"说的是能被整理成中文的原文语言；
     ③ 截图那一路要先认图上的字，<b>认字这一环的语种边界我们没量过</b>，糊的、字太小的一张可能读不全。
     上面那三行是<b>示例语料</b>，右边那四栏是这枚开关该出来的样子——<b>上线前这一格要换成一篇真跑出来的读数</b>。</p>
</section>'''

CSS = '''
@font-face{font-family:'Playfair Display';src:url(素材/playfair-display-latin-400-normal.woff2) format('woff2');font-display:swap}
@font-face{font-family:'Playfair Display';src:url(素材/playfair-display-latin-500-normal.woff2) format('woff2');font-display:swap}
:root{--paper:#F2EFE9;--ink:#14161A;--soft:rgba(20,22,26,.64);--faint:rgba(20,22,26,.42);--hair:rgba(20,22,26,.15);--clay:#D2683F;--sage:#6E9070}
*{box-sizing:border-box}body{margin:0;background:#ddd9d0;font:17px/1.75 -apple-system,'PingFang SC','Helvetica Neue',sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
.panel{width:1440px;height:900px;background:var(--paper);padding:56px 88px;position:relative;overflow:hidden;display:flex;flex-direction:column}
.kicker{margin:0;font:500 13px/1 'Playfair Display',Didot,Georgia,serif;letter-spacing:.24em;text-transform:uppercase;color:var(--clay)}
h2{margin:14px 0 0;font-weight:400;font-size:46px;line-height:1.2}
h2 .cn{font-family:'Songti SC',STSong,SimSun,serif;letter-spacing:.01em}
.lead{margin:16px 0 0;max-width:1040px;color:var(--soft);font-size:18px}
.grp{margin-top:26px}
.glab{display:flex;align-items:baseline;gap:12px;font:500 13px/1 'Playfair Display',Didot,Georgia,serif;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.glab .gs{font-family:'Songti SC',serif;font-size:13px;letter-spacing:0;text-transform:none;color:var(--faint)}
.row{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
.chip{display:inline-flex;align-items:center;gap:9px;padding:9px 15px 9px 10px;border:1px solid var(--hair);border-radius:999px;background:#fff;font-size:16px;font-family:'Songti SC',serif}
.chip img{width:26px;height:26px;border-radius:6px;object-fit:contain}
.chip .mn{width:26px;height:26px;border-radius:6px;display:grid;place-items:center;font:600 15px/1 'Songti SC',serif;color:var(--paper);background:var(--ink);flex:0 0 auto}
.chip.on{border-color:rgba(210,104,63,.55);box-shadow:none;background:#fff}
.chip.on:after{content:"";width:6px;height:6px;border-radius:50%;background:var(--clay)}
.chip.gen,.chip.more{padding-left:15px;color:var(--soft);background:transparent;border-style:dashed}
.disclaim{margin-top:auto;padding-top:18px;font-size:14px;line-height:1.8;color:var(--faint);max-width:1160px;border-top:1px solid var(--hair)}
.disclaim b{color:var(--ink);font-weight:600}
.tpls{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-top:12px}
.tpl{margin:0;flex:0 0 auto;text-align:center}
.tpl img{width:auto;height:196px;max-width:100%;margin:0 auto;border:1px solid var(--hair);border-radius:4px;display:block;background:#fff}
.tpl figcaption{margin-top:7px;font:13px/1.4 'Songti SC',serif;color:var(--soft)}
.log{margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:0 46px}
.log article{border-top:1px solid var(--hair);padding:16px 0 14px}
.log article:first-child{background:rgba(210,104,63,.06);border-top:2px solid var(--clay);padding:16px 12px 14px;margin:-1px -12px 0}
.log header{display:flex;align-items:baseline;gap:14px}
.log .v{font:500 30px/1 'Playfair Display',Didot,Georgia,serif;letter-spacing:-.01em}
.log .d{font-size:13px;color:var(--faint)}
.log .now{margin-left:auto;font:13px/1 'Songti SC',serif;color:#fff;background:var(--clay);padding:5px 9px;border-radius:3px}
.log ul{margin:12px 0 0;padding-left:18px}
.log li{font-size:15.5px;line-height:1.75;color:var(--soft);margin-bottom:5px}
.wrap{margin:26px auto;width:1440px;position:relative}
.tag{position:absolute;left:0;top:-24px;font:13px/1 'Songti SC',serif;color:#6b6b66}
.row.langs{gap:9px}
.lg{padding:8px 15px;border:1px solid var(--hair);border-radius:999px;background:#fff;font:15px/1.4 'Songti SC',serif;color:var(--ink)}
.sw{display:flex;align-items:center;gap:11px;margin-top:14px;padding:13px 18px;border:1px solid var(--hair);border-radius:10px;background:#fff;width:max-content}
.sw .dot{width:34px;height:20px;border-radius:999px;background:var(--clay);position:relative;flex:0 0 auto}
.sw .dot:after{content:"";position:absolute;right:2px;top:2px;width:16px;height:16px;border-radius:50%;background:#fff}
.sw b{font:16px/1 'Songti SC',serif;font-weight:600}
.sw .hint{font:14px/1 'Songti SC',serif;color:var(--faint)}
.demo{display:grid;grid-template-columns:1fr 34px 1.15fr;gap:14px;align-items:stretch;margin-top:14px}
.src,.out{border:1px solid var(--hair);border-radius:8px;background:#fff;padding:14px 16px}
.src p{display:flex;gap:10px;margin:0 0 11px;font:13.5px/1.55 -apple-system,'Helvetica Neue',sans-serif;color:var(--soft)}
.src p:last-child{margin-bottom:0}
.src i{flex:0 0 40px;font:500 10px/1.7 'Playfair Display',Didot,Georgia,serif;letter-spacing:.06em;font-style:normal;color:var(--faint);text-transform:uppercase}
.src span{flex:1 1 auto}
.src p[dir],.src span[dir]{text-align:right}
.arrow{align-self:center;text-align:center;color:var(--clay);font-size:20px}
.out .ti{margin:0;font:600 17px/1.4 'Songti SC',serif;color:var(--ink)}
.out .su{margin:7px 0 0;font:13.5px/1.7 'Songti SC',serif;color:var(--soft)}
.out ul{margin:9px 0 0;padding-left:17px}
.out li{font:13px/1.65 'Songti SC',serif;color:var(--soft);margin-bottom:2px}
.out .tg{margin:10px 0 0;font:13px/1 'Songti SC',serif;color:var(--clay)}'''

html = ('<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>官网改版四屏</title><style>' + CSS + '</style></head><body>'
        + ''.join(f'<div class="wrap"><span class="tag">{t}</span>{p}</div>'
                  for t, p in [('屏一 · 首页新增：支持的网站（现网没有这一屏）', p1),
                               ('屏二 · 模板屏（现网是重画示意 → 换成真实成品）', p2),
                               ('屏三 · 版本更新（现网列到 2.2.0 小版本 → 只留大版本）', p3),
                               ('屏四 · 十六种外文那一屏（现网没有这一屏）', p4)])
        + '</body></html>')
out = os.path.join(ROOT, '官网改版四屏.html')
open(out, 'w', encoding='utf-8').write(html)
print('panels 4 bytes', os.path.getsize(out))
