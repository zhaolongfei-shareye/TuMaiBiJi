#!/usr/bin/env python3
# 把 比赛/图麦笔记-产品说明-V4-20261011.html 的十套模板图库换成**当前构建的真渲染成品**，
# 名字与说明跟着 poster.js 的 TEMPLATES 改口，并补一章「交互创新」（新的第一屏 + 几处有趣的体验）。
#
# 为什么要有这一把（站长 10-11 原话）：
#   「我们目前笔记模板已经更新了，PDF上面的图片文字也要同步更新，然后我们目前有新的交互界面，
#    增加一个章节来介绍。……可以调亮度，目的是适应不同的背景，例如切换不同性别主角，让用户更有
#    代入感，例如滑动提炼，有仪式感。能更换笔记头像，控制提炼的翻译」
#
# 图的来源，一张都不新画：
#   十套卡  = docs/design/模板成品-1.5.0/模板-<id>.png（10-09 10:01 由 docs/工具/出-十套模板成品.js
#            在微信开发者工具里跑出来的运行时成品，笔记是站长账号里的第 7 篇）
#   三张界面 = 10-11 同一台模拟器实拍（2.1.8 构建，视口 390×753，截图 734×1588）
# 10-11 想另出一批"无码版"卡面，画布那一趟在这台 IDE 会话里没走完（详见 docs/产品需求.md 当天那条），
# 所以图库仍是**带真实小程序码**那一批，图注跟着改口，不再写"隐藏码版本"。
#
# 跑法：python3 docs/工具/改-产品说明V4-图库与新章节.py
# 只改 V4 那一份文件；V3 与它的 PDF 都不碰。改完要另跑一次 headless Chrome 出 PDF。
import base64
import io
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path('/Users/zlfmac/Documents/TuMaiBiJi')
DOC = ROOT / '比赛/图麦笔记-产品说明-V4-20261011.html'
CARDS = ROOT / 'docs/design/模板成品-1.5.0'
UI = Path('/tmp')

TOTAL_OLD, TOTAL_NEW = 25, 27
bad = []


def ck(name, ok, got=''):
    print(f'{"✓" if ok else "✗"} {name}{("　→ " + str(got)) if got else ""}')
    if not ok:
        bad.append(name)


def sub(s, old, new, name, times=1):
    n = s.count(old)
    ck(name, n == times, f'命中 {n} 处（要 {times}）')
    return s.replace(old, new) if n == times else s


def b64_img(path, quality=86, maxw=None):
    im = Image.open(path)
    if im.mode != 'RGB':
        im = im.convert('RGB')
    if maxw and im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)))
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=quality, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


src = DOC.read_text(encoding='utf-8')

# ── 1. 十张卡面换件 ─────────────────────────────────────────────
# 文档里那十个 <article class="template"> 的顺序就是 card, quote, block, clean, popGrid,
# popDots, acid, cover, lit, spec。旧稿的第四格是已经退役的「极简 / clean」，现行那一位是
# 「素宣信笺 / letter」（09-26 那次"经典三款改宣纸色调并改名"换掉的），所以 alt 也要一起改。
ORDER = ['card', 'quote', 'block', 'letter', 'popGrid', 'popDots', 'acid', 'cover', 'lit', 'spec']
URIS = {i: b64_img(CARDS / f'模板-{i}.png') for i in ORDER}
pat = re.compile(r'(<img class="template-image" alt=")([^"]+)(" src=")data:image/[^"]*(">)')
hits = list(pat.finditer(src))
ck('图库十张图都找得到', len(hits) == 10, f'{len(hits)} 张')
if len(hits) == 10:
    out, last = [], 0
    for m, want in zip(hits, ORDER):
        out.append(src[last:m.start()])
        out.append(f'{m.group(1)}{want}{m.group(3)}{URIS[want]}{m.group(4)}')
        last = m.end()
    out.append(src[last:])
    src = ''.join(out)

# ── 2. 十套的名字与说明跟着代码改口 ────────────────────────────
# 现网名册（poster.js 的 TEMPLATES，与 backend/seed/poster_templates.json 那十行同一份）：
#   玉版宣 Jade Paper ／ 摘句 Verse Slip ／ 叠翠 Layered Paper ／ 素宣信笺 Vertical Letter
#   波普分格 Pop Panels ／ 网点漫画 Ben-Day Comic ／ 荧光渐变 Acid Gradient
#   杂志封面 Magazine Cover ／ 纸间文艺 Paper & Ink ／ 规格卡 Spec Sheet
# 旧稿四套经典那三个英文名（Classic Card / Quote Card / Color Block / Minimal Note）是 09-26
# 改名之前留下的，屏上早就不这么叫了；六套个性的中文名没动过，只把英文侧对齐 labelEn。
src = sub(src, '<p class="subtitle">经典卡片 / 金句大字</p>',
          '<p class="subtitle">玉版宣 / 摘句</p>', '第 5 页副题')
src = sub(src, '<p class="subtitle">撞色块 / 极简</p>',
          '<p class="subtitle">叠翠 / 素宣信笺</p>', '第 6 页副题')

OLD_CARD = ('<span class="label">Classic Card</span><h2 class="template-name">经典卡片</h2>'
            '<p class="tagline">把一段阅读，整理成一个可以复用的知识单元。</p>'
            '<p class="detail"><b>视觉语言</b>　圆角白卡容纳正文，分类色带提示主题，编号要点建立阅读顺序。'
            '标题、摘要与条目逐层展开，重点不靠装饰争夺注意力，适合信息较完整的知识笔记。</p>')
NEW_CARD = ('<span class="label">Jade Paper</span><h2 class="template-name">玉版宣</h2>'
            '<p class="tagline">把一段阅读，整理成一个可以复用的知识单元。</p>'
            '<p class="detail"><b>视觉语言</b>　分类色压成顶部那一条深色头，标题落在头上，来源与缩略图各占一角；'
            '下面回到纸白，摘要、"核心要点"与编号条目逐层展开。重点不靠装饰争夺注意力，适合信息较完整的知识笔记。</p>')
src = sub(src, OLD_CARD, NEW_CARD, '玉版宣 那一格')

OLD_QUOTE = ('<span class="label">Quote Card</span><h2 class="template-name">金句大字</h2>'
             '<p class="tagline">让最值得留下的一句话，获得足够的空间。</p>'
             '<p class="detail"><b>视觉语言</b>　一句话被放大成为视觉中心，文字与留白共同形成节奏，'
             '白色卡面衬出主题色。相比完整摘要，这一款强调单一观点，让读者快速抓住想表达的内容。</p>')
NEW_QUOTE = ('<span class="label">Verse Slip</span><h2 class="template-name">摘句</h2>'
             '<p class="tagline">让最值得留下的一句话，获得足够的空间。</p>'
             '<p class="detail"><b>视觉语言</b>　整张卡先铺满分类色，一张白色圆角卡浮在中间，'
             '一句话在里面放大成视觉中心；标题退成卡下一行小字，署名与码落在色底上。'
             '相比完整摘要，这一款只留一个观点，让读者一眼抓住想表达的那句。</p>')
src = sub(src, OLD_QUOTE, NEW_QUOTE, '摘句 那一格')

src = sub(src, '<span class="label">Color Block</span><h2 class="template-name">撞色块</h2>',
          '<span class="label">Layered Paper</span><h2 class="template-name">叠翠</h2>', '叠翠 那一名')
src = sub(src, '<b>视觉语言</b>　大面积彩色头部建立主题，白色内容区展开摘要与要点，头像可作为个人标识。'
               '色块与文字各有职责：上方负责第一眼识别，下方负责承接实际信息。',
          '<b>视觉语言</b>　深色头部建立主题，白色内容卡展开摘要与编号要点，'
               '圆形头像骑在两层的接缝上。色块与文字各有职责：上方负责第一眼识别，下方负责承接实际信息。',
          '叠翠 的视觉语言')

OLD_MIN = ('<span class="label">Minimal Note</span><h2 class="template-name">极简</h2>'
           '<p class="tagline">不靠装饰抢眼，让内容被安静地看完。</p>'
           '<p class="detail"><b>视觉语言</b>　白底、细色条与留白构成轻量版式，减少复杂的图形干扰。'
           '标题与正文之间有明确间距，读者的目光顺着文字走，而不是不断在视觉元素之间切换。</p>'
           '<p class="detail"><b>适合谁</b>　适合偏好简洁表达的阅读者、研究者与专业人士。'
           '当文字需要被认真理解，或内容将与其他图文混排时，这一款更容易融入既有的阅读环境。</p>'
           '<p class="detail"><b>怎样使用</b>　写下今日待办、简短复盘或一段清晰的思考，生成后放进个人资料夹，'
           '也可作为文章中的补充说明。画面退后一步，把使用空间让给笔记本身。</p>')
NEW_MIN = ('<span class="label">Vertical Letter</span><h2 class="template-name">素宣信笺</h2>'
           '<p class="tagline">竖着排下来，像一页旧信笺。</p>'
           '<p class="detail"><b>视觉语言</b>　宣纸底上从右往左竖排，标题那一列最深最大，'
           '正文分列往下走；来源与日期缩成一枚细长的侧栏，朱红方印与界格方块压住四角。'
           '中英混排时拉丁那一段自己横躺，不必为它另开一套版式。</p>'
           '<p class="detail"><b>适合谁</b>　适合写随笔、抄一段原文、做读书笔记的人，'
           '也适合把一张卡当作书签或信笺打印出来。文字量大的时候它反而更耐看，因为每一列都不长。</p>'
           '<p class="detail"><b>怎样使用</b>　把一段引文连同出处做成一张竖排卡，'
           '夹进电子笔记或打印贴进手账；同一篇想换横排，切到玉版宣或素宣信笺之外的任意一套即可。</p>')
src = sub(src, OLD_MIN, NEW_MIN, '素宣信笺 那一整格')

for old, new in [('Pop Grid', 'Pop Panels'), ('Halftone Notes', 'Ben-Day Comic'),
                 ('Neon Gradient', 'Acid Gradient'), ('Editorial Cover', 'Magazine Cover'),
                 ('Literary Notes', 'Paper &amp; Ink'), ('Structured Notes', 'Spec Sheet')]:
    src = sub(src, f'<span class="label">{old}</span>', f'<span class="label">{new}</span>',
              f'英文名 {old} → {new}')

# 三处正文里点到模板名的地方，跟着改口（同一个东西在一份材料里不许有两个叫法）
src = sub(src, '选择金句大字或纸间文艺', '选择摘句或纸间文艺', '朋友圈那一页的模板名')
src = sub(src, '选择经典卡片、撞色块或极简', '选择玉版宣、叠翠或素宣信笺', '公众号那一页的模板名')
src = sub(src, '切换金句大字与杂志封面', '切换摘句与杂志封面', '建议评委体验那一页的模板名')

# ── 3. 图注跟着换口径 ───────────────────────────────────────────
src = sub(src,
          '图库由产品绘制代码在浏览器 Canvas 中渲染，使用已获授权的人像，姓名与笔记为演示；'
          '展示为隐藏码版本。实际字体随运行环境略有差异，人群为适用建议。',
          '十张图都是产品自己的绘制代码在微信开发者工具里跑出来的运行时成品（10-09 那一批），'
          '同一条笔记排十遍；卡片右下角是<b>真实小程序码</b>，扫开是那一篇的公开摘要页。'
          '头像是站长本人提供并确认授权的照片，署名与那一条笔记为演示内容。'
          '实际字体随运行环境略有差异，人群为适用建议。', '图库图注 ×5', 5)

# ── 4. 新章节要用的那几枚样式 ──────────────────────────────────
CSS_ANCHOR = '.template{display:grid;'
UI_CSS = ('.ui-strip{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12pt;margin:14pt 0 4pt}'
          '.ui-strip img{display:block;width:100%;height:auto;border-radius:9pt;'
          'box-shadow:0 5pt 13pt #28241913}'
          '.ui-strip figcaption{font-size:7.6pt;color:#6b6c61;text-align:center;margin-top:5pt}'
          '.ui-strip figure{margin:0}')
src = sub(src, CSS_ANCHOR, UI_CSS + '\n' + CSS_ANCHOR, '补上界面章节那几枚样式')

# ── 5. 两页新章节，插在「智能摘要」之后、「模板图库」之前 ──────
SHOT = {n: b64_img(UI / f'ui-{n}.png', maxw=700) for n in ['第一屏', '换主角', '录入展开']}


def page(eyebrow, h1, subtitle, body, note):
    return (f'<article class="page" data-page="0"><header class="mast"><span>Tumark</span>'
            f'<span>图麦笔记 · 微信小程序作品说明</span></header><main class="content">'
            f'<p class="eyebrow">{eyebrow}</p><h1>{h1}</h1><p class="subtitle">{subtitle}</p>'
            f'{body}<p class="note">{note}</p></main>'
            f'<footer class="footer"><span>图麦笔记 · 产品作品集</span>'
            f'<span>00 / {TOTAL_NEW}</span></footer></article>')


def rows(items):
    return '<div class="rows">' + ''.join(
        f'<div class="row"><h2>{a}</h2><p>{b}</p></div>' for a, b in items) + '</div>'


strip = ('<div class="ui-strip">'
         + ''.join(f'<figure><img src="{SHOT[k]}" alt="{k}"><figcaption>{c}</figcaption></figure>'
                   for k, c in [('第一屏', '第一屏：形象图铺满，三块贴底'),
                                ('换主角', '点右后方那枚剪影，两位当场换位'),
                                ('录入展开', '面板升起：三档标签 + 一枚右滑长条')])
         + '</div>')

A = rows([
    ('形象图就是这一屏',
     '「我的 → 卡片模板」最上面那格形象图铺满第一屏，没设过就用包里这一张；上面压一层可调的暗罩。'
     '导航条下面那一行两枚：<b>调亮度</b>换一档深浅（纯白 → 25% → 50% → 回纯白，默认停中档），'
     '<b>换背景</b>跳到那一页选图——这里不弹相册，一个功能只留一个入口。'),
    ('三块入口',
     '左块是门面的那一张：点一下直接进「拍照」那一档，白条上写「记下来」，小字列出「照片 · 链接 · 文字」；'
     '右边两枚是笔记数与卡片数，数字在块里、名字在白条里。三块的颜色由当前壁纸派生'
     '（<code>palette.entryBlocks()</code>），换一套壁纸，三块跟着一起换。'),
    ('面板两档高度',
     '展开后面板贴底，410rpx／490rpx 两档（现读 <code>create.wxss</code>），只多一行。'
     '框外那一行左边是与第一屏同一条轮播 Tips，右边「返回」与笔记列表、笔记卡片右上角同一个词、同一个动作。'
     '面板里只剩两样：一个输入框（或一横排小图）＋一枚右滑长条。'),
    ('一层白玻璃',
     '面板压在形象图上时不再另画一块实心卡：白纱 α .30 底下再垫一层 .70 白（合成白 .79）。'
     '背景再深也不会把「13」「12」那两枚数字压没——实测面板 202 对字墨 #352E1D 对比 8.21，'
     '基准是 10-10 那版实心面的 7.51。'),
])
pageA = page('交互创新 / INTERFACE', '第一眼就是入口，不必先找按钮。',
             '新的第一屏与录入面板（2.1 线，截至 10-11）', strip + A,
             '三张界面是 2.1.8 构建在微信开发者工具模拟器里的实拍（视口 390×753，截图 734×1588），'
             '屏上每一句字都来自现网字典 <code>utils/i18n.js</code>；不是重画的效果图。'
             '几何与色值现读 <code>create.wxss</code>／<code>palette.js</code>。')

B = rows([
    ('换一位主角',
     '左块那两位是一男一女的线描（女 360×433，戴贝雷帽坐着读；男 360×522，举着手机拍）。'
     '主人物在前，另一位画成右后方那枚淡灰剪影（按高定 132，两态同高）。'
     '点剪影那枚热区（读屏名「换成另一个人」）两张当场对调，并记在本机；'
     '这一位还延续到笔记列表与卡片列表框外的左上角——首页是男的，那里就是男的。'
     '目的是让看的人觉得自己也在场，而不是被推销一个工具。'),
    ('调亮度',
     '同一张形象图在不同光线下会吃掉屏上的字，所以深浅这一档交给用户：点一下换一档，四档循环，默认中档。'
     '压的是那一层罩子的透明度，不是重画一张图。'),
    ('右滑才开始提炼',
     '面板里那枚长条要往右推到底才提交（屏上原话「右滑开始提炼」）。原来那排「清空 / 开始提炼」的按钮整排撤了：'
     '先滑过去，等于让人把这一屏看清楚再动手，多这一下是有意的。圆跟着手指走、停在最右、'
     '轨道随进度由纸白吃成实心；框里没内容时不给起拖。'),
    ('左右滑换模板',
     '卡片那一屏的十套模板可以左右滑着换（「左右滑换模板」），不用退回列表里挑。'
     '那一排小图本身就是十套各画一遍的缩略，选之前先看得到结果。'),
    ('换笔记头像',
     '「我的 → 卡片模板」那四个位置，每格两枚开关：<b>背景</b>铺在第一屏、也垫在笔记页头部；'
     '<b>卡片</b>画在卡片头像上。同一套图既能当界面背景，也能署名在卡片角落；'
     '四格与名称都存在账号里，换手机或重装后还是那一套。'),
    ('控制提炼的语言',
     '「文字」那一档旁边有一枚<b>原文翻译</b>开关，默认关：关＝摘要跟着原文的语言走'
     '（英文原文出英文摘要），开＝先读懂再整理成中文。它只往提示词末尾追加一段语言指令，'
     '抽取任务本身一个字不改。'),
])
pageB = page('交互创新 / SMALL MOMENTS', '几处有趣的体验。',
             '六件小事，让"记下来"这件事更贴人。', B,
             '六条都在 2.1 线的前端里；「原文翻译」那一条同时改服务端提示词'
             '（<code>backend/app/services/llm.py</code> 的 <code>system_prompt()</code>）。'
             '换主角那一条只落本机，<b>不含</b>跨设备同步——这一条他没要。')

anchor = '<article class="page gallery" data-page="5">'
ck('图库第一页找得到（新章节插在这之前）', src.count(anchor) == 1)
if src.count(anchor) == 1:
    src = src.replace(anchor, pageA + pageB + anchor, 1)

# ── 6. 页码整本重排 ────────────────────────────────────────────
pages = list(re.finditer(r'<article class="page[^"]*"\s+data-page="(\d+)"', src))
ck('整本页数对得上', len(pages) == TOTAL_NEW, f'{len(pages)} 页（要 {TOTAL_NEW}）')
if len(pages) == TOTAL_NEW:
    out, last = [], 0
    for i, m in enumerate(pages, start=1):
        out.append(src[last:m.start(1)])
        out.append(str(i))
        last = m.end(1)
    out.append(src[last:])
    src = ''.join(out)
    # 页脚那串 NN / 25（新插的两页写的是 00 / 27）按出现顺序整本重号
    lab = list(re.finditer(r'<span>\d{2} / (?:25|27)</span>', src))
    ck('页脚读数与页数一致', len(lab) == TOTAL_NEW, f'{len(lab)} 处')
    if len(lab) == TOTAL_NEW:
        out, last = [], 0
        for i, m in enumerate(lab, start=1):
            out.append(src[last:m.start()])
            out.append(f'<span>{i:02d} / {TOTAL_NEW}</span>')
            last = m.end()
        out.append(src[last:])
        src = ''.join(out)

src = sub(src,
          '录入与智能摘要 → 十套模板图库 → 四类应用场景',
          '录入与智能摘要 → 新的第一屏与几处体验 → 十套模板图库 → 四类应用场景',
          '阅读路径补上新章节')

# ── 7. 收尾：定高页不许溢出 ────────────────────────────────────
# 第一遍排完量到三处挤不下的（判据：每页 `.content` 底边要留在页脚 1060px 之上）：
#   新章节第一页 1291px（三张手机图按 1fr 铺满＝每张 346pt 高）；
#   新章节第二页并入白玻璃后仍富余；
#   第 24 页「把权限、审核和备份」1179px——**这一处是今早那批补记留下的旧伤，不是这一把新增的**。
# 收法：图收细、那一行挪去体验页、那一页挂 dense 压行距、三处措辞压紧（事实一条不减）。
src = sub(src, '.ui-strip{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12pt;margin:14pt 0 4pt}',
          '.ui-strip{display:grid;grid-template-columns:104pt 104pt 104pt;justify-content:center;'
          'gap:14pt;margin:12pt 0 4pt}', '界面三张图收细')
src = sub(src, ('<div class="row"><h2>一层白玻璃</h2><p>面板压在形象图上时不再另画一块实心卡：'
                '白纱 α .30 底下再垫一层 .70 白（合成白 .79）。背景再深也不会把「13」「12」那两枚数字压没——'
                '实测面板 202 对字墨 #352E1D 对比 8.21，基准是 10-10 那版实心面的 7.51。</p></div>'),
          '', '第一屏页撤下白玻璃那一行')
src = sub(src, '同一张形象图在不同光线下会吃掉屏上的字，所以深浅这一档交给用户：点一下换一档，四档循环，默认中档。'
               '压的是那一层罩子的透明度，不是重画一张图。',
          '同一张形象图在不同光线下会吃掉屏上的字，所以深浅这一档交给用户：点一下换一档，四档循环，默认中档。'
          '压的是那一层罩子的透明度，不是重画一张图。面板压在形象图上时也不再另画一块实心卡——'
          '白纱 α .30 底下垫一层 .70 白（合成白 .79），背景再深也不会把「13」「12」那两枚数字压没：'
          '实测面板 202 对字墨 #352E1D 对比 8.21，基准是 10-10 那版实心面的 7.51。', '白玻璃并入调亮度')
src = sub(src, '.row{display:grid;grid-template-columns:133pt 1fr;gap:18pt;border-top:.5pt solid #cfccc2;padding:12pt 0}',
          '.row{display:grid;grid-template-columns:133pt 1fr;gap:18pt;border-top:.5pt solid #cfccc2;padding:12pt 0}'
          '.page.dense .rows .row{padding:6.5pt 0}', '补一条 dense 页的行距')
src = sub(src, '<article class="page " data-page="24">', '<article class="page dense" data-page="24">',
          '第 24 页挂上 dense')
src = sub(src, '已上线（10-07 整条打通）：走微信云开发前端直传，笔记保存成功后另压一份小图存进对象存储，'
               '详情页原样读回、缩略图可看大图。同一套存储还留一份生成的卡片图，以及「我的」页那四格名片形象图。'
               '对象只能由客户端删，所以删该条笔记、撤掉那一格或注销账号时，云上那一份由客户端发起删除；'
               '删不成落本机待删账、下次回到前台再删一次——“一并删除”这句话有实现兜着，不是尽力而为。起步 5GB 配额，原自建 COS 路线已否。',
          '已上线（10-07 整条打通）：微信云开发前端直传，笔记保存后另压一份小图存进对象存储，详情页原样读回、缩略图可看大图；'
          '同一套存储还留生成的卡片图与那四格名片形象图。对象只能由客户端删，所以删笔记、撤那一格或注销账号时由客户端发起删除，'
          '删不成落本机待删账、下次回前台再删一次——“一并删除”这句话有实现兜着，不是尽力而为。起步 5GB，原自建 COS 路线已否。',
          '图片云备份 收措辞')
src = sub(src, '「我的」页那四格形象图、名称、选中的卡片版式与背景亮度档存在服务端 <code>user_profiles</code>，'
               '本机那一份降级成缓存；登录即与服务器对齐，换手机或重装后名片还是那一套。判据写死在代码里：'
               '“云上从没登记过”与“登记过但清空”是两回事，前者沿用本机、后者才跟着服务器走——'
               '所以不会在云上没东西时把用户本机挑的图删掉。',
          '那四格形象图、名称、选中的卡片版式与背景亮度档存在服务端 <code>user_profiles</code>，本机那一份降级成缓存；'
          '登录即与服务器对齐，换手机或重装后名片还是那一套。判据写死在代码里：“云上从没登记过”与“登记过但清空”是两回事，'
          '前者沿用本机、后者才跟着走——不会在云上没东西时把用户本机挑的图删掉。', '名片存进账号 收措辞')
src = sub(src, '（用户在「我的 → 我的邮箱」里自己填的地址，只用于把来信对应到他的账号，本站不发送任何邮件）。'
               '10-11 按上面的真实去向重交过一次；关于页那十条与这一页同口径，两边不各写一套。',
          '（「我的 → 我的邮箱」里他自己填的，只用于把来信对应到账号，本站不发任何邮件）。'
          '10-11 按上面的真实去向重交过一次；关于页那十条与本页同口径。', '对外申报 收措辞')
src = sub(src, '十张图都是产品自己的绘制代码在微信开发者工具里跑出来的运行时成品（10-09 那一批），'
               '同一条笔记排十遍；卡片右下角是<b>真实小程序码</b>，扫开是那一篇的公开摘要页。'
               '头像是站长本人提供并确认授权的照片，署名与那一条笔记为演示内容。'
               '实际字体随运行环境略有差异，人群为适用建议。',
          '十张图都由产品自己的绘制代码在微信开发者工具里跑出（10-09 那一批），同一条笔记排十遍；'
          '右下角是<b>真实小程序码</b>，扫开即那一篇的公开摘要页。头像是站长授权的照片，'
          '署名与笔记为演示；字体随运行环境略有差异，人群为适用建议。', '图库图注 收一行', 5)
src = sub(src, '六件小事，让"记下来"这件事更贴人。', '六件小事，让“记下来”这件事更贴人。', '副题用全角引号')

DOC.write_text(src, encoding='utf-8')
print(f'\n{"⚠ 有 " + str(len(bad)) + " 处没落上" if bad else "全部落上"}　{DOC.name}　{len(src):,} B')
print('下一步：headless Chrome 出 PDF，再用浏览器量一遍每页 .content 底边（要留在 1060px 之上）')
sys.exit(1 if bad else 0)
