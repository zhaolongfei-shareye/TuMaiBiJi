#!/usr/bin/env python3
# 给 比赛/图麦笔记-产品说明-V4-20261011.html 补一章「业务链路」：两页，第一页是流程图。
#
# 站长 10-11 原话：「增加一个章节把整个业务链路说清楚，用户怎么创作笔记，怎么分享，其他用户怎么看到，
# 怎么转存。画流程图。然后不发版的事情不要放在这里说，哪个还没验证过，别给自己挖坑。
# 你只需要提到后面商业化路径就行了。」
#
# 两条硬约束照办：
#   ① 全章**不提**「卡片模板不走发版」那件事（配方下发 P0/P1 还没真加过一套模板、没实测过）；
#   ② 商业化只在最后一页留一条，指回前面那三页联名设想，不展开、不报数字。
# 图上五步每一步都要有现网或代码依据；三条接口是 10-11 当场 curl 过的（见下方 note 那句）。
#
# 跑法：python3 docs/工具/加-产品说明V4-业务链路章.py
# 只改 V4 那一份；V3 不动。改完另跑 headless Chrome 出 PDF，再逐页量定高页有没有溢出。
import re
import sys
from pathlib import Path

ROOT = Path('/Users/zlfmac/Documents/TuMaiBiJi')
DOC = ROOT / '比赛/图麦笔记-产品说明-V4-20261011.html'
TOTAL_OLD, TOTAL_NEW = 27, 29

bad = []


def ck(name, ok, got=''):
    print(f'{"✓" if ok else "✗"} {name}{("　→ " + str(got)) if got else ""}')
    if not ok:
        bad.append(name)


def sub(s, old, new, name, times=1):
    n = s.count(old)
    ck(name, n == times, f'命中 {n} 处（要 {times}）')
    return s.replace(old, new) if n == times else s


src = DOC.read_text(encoding='utf-8')

# ── 1. 流程图那几枚样式 ────────────────────────────────────────
CSS_ANCHOR = '.ui-strip{display:grid;'
CHAIN_CSS = (
    '.chain{margin:14pt 0 4pt}'
    '.chain-row{display:grid;grid-template-columns:1fr 11pt 1fr 11pt 1fr 11pt 1fr;align-items:stretch}'
    '.chain-row.two{grid-template-columns:1fr 11pt 1fr}'
    '.chain-node{background:#fbfaf7;border:.6pt solid #cfccc2;border-top:3pt solid #6e9070;padding:9pt 11pt}'
    '.chain-node.reader{border-top-color:#d2683f;background:#f7f2ec}'
    '.chain-node h3{font-size:10.5pt;margin:0 0 5pt;color:#14161a;line-height:1.3}'
    '.chain-node p{font-size:8.4pt;line-height:1.62;margin:0;color:#4d4f47}'
    '.chain-arrow{display:flex;align-items:center;justify-content:center;font-size:11pt;color:#a26442}'
    '.chain-down{text-align:center;font-size:8.6pt;color:#6b6c61;margin:9pt 0}'
    '.chain-loop{border:.6pt dashed #a26442;padding:8pt 11pt;font-size:8.8pt;line-height:1.6;'
    'color:#4d624b;margin-top:9pt}')
src = sub(src, CSS_ANCHOR, CHAIN_CSS + '\n' + CSS_ANCHOR, '补上流程图那几枚样式')

# ── 2. 两页新章节，插在「作品概览」之后、「录入 CAPTURE」之前 ──
def node(title, body, reader=False):
    return (f'<div class="chain-node{" reader" if reader else ""}"><h3>{title}</h3><p>{body}</p></div>')


ARROW = '<div class="chain-arrow">→</div>'
ROW_A = ('<div class="chain-row">'
         + node('① 创作 / Create',
                '「照片 · 文字 · 链接」三档录入 → 右滑才开始提炼 → 服务端异步抓取、识别、提炼 → '
                '用户核对、修改、归类。私密那一格：不解锁不发正文与摘要，也不能开分享。')
         + ARROW
         + node('② 出卡 / Card',
                '十套模板左右滑着换；端侧 Canvas 先测量再绘制，按内容定高画成一张图，保存到相册。')
         + ARROW
         + node('③ 分享 / Share',
                '已生成态那枚通栏「分享卡片：微信好友 / 朋友圈 / 公众号」走微信自己的转发；'
                '存到相册之后由用户手动发，产品不做跨平台自动发布。')
         + ARROW
         + node('④ 有人看到 / Read',
                '卡片上那枚小程序码进 <code>pages/share/view?token=…</code>，'
                '读的是建分享那一刻的<b>公开快照</b>；不登录也能看。')
         + '</div>')
ROW_B = ('<div class="chain-row two">'
         + node('⑤ 转存 / Save to my notes',
                '点「存到我的笔记」→ 服务端从快照<b>抄</b>一条新的：标题、摘要、要点、标签、关键链接、来源地址。'
                '正文、识别出的原文、分类、置顶都不在公开范围内，不过去。', True)
         + ARROW
         + node('⑥ 他自己的库里 / Own copy',
                '来源只读钉在 <code>imported_from</code>，转存之后编辑不掉、只能整条删；'
                '他再编辑、再出卡、再分享。', True)
         + '</div>')

pageA = ('<article class="page" data-page="0"><header class="mast"><span>Tumark</span>'
         '<span>图麦笔记 · 微信小程序作品说明</span></header><main class="content">'
         '<p class="eyebrow">业务链路 / END-TO-END FLOW</p>'
         '<h1>一条笔记，怎么从一个人手里走到另一个人手里。</h1>'
         '<p class="subtitle">创作 → 出卡 → 分享 → 有人看到 → 转存回库；这五步都已在现网跑通。</p>'
         + ROW_A
         + '<p class="chain-down">↓ 第 ④ 步之后，链路换到读者那一侧（下面两格是读者自己做的）</p>'
         + ROW_B
         + '<div class="chain-loop">↺ 第 ⑥ 步回到第 ② 步——转存不是再收藏一个入口，而是多出一条他自己的笔记：'
           '可以再编辑、再出卡、再分享。原作者之后撤回分享，也不会抹掉这一条。</div>'
         '<div class="callout">撤回只关“公开”这一扇门。</div>'
         '<p class="note">这一页只画现网跑通的这五步，没画还没验证过的东西。10-11 当场实测：'
         '<code>GET /api/shares/{token}</code> 不带凭据回 200，回体那十个字段就是公开快照的全部；'
         '<code>POST /api/notes/from-share</code> 与 <code>POST /api/shares/revoke</code> 不带凭据回 401（路由在、要登录）。'
         '图片侧没有内容安全送检（个人主体拿不到 imgSecCheck），这一条记在文档里，不当已解决。</p>'
         '</main><footer class="footer"><span>图麦笔记 · 产品作品集</span><span>00 / '
         + str(TOTAL_NEW) + '</span></footer></article>')

ROWS = [
    ('起点不是空白页',
     '三档录入通向同一套结构。「文字」那一档从 10-04 起也走同一条提炼链路——用户自己填的标题照原样用，'
     '模型那份标题在这条入口不采用，入队前多一道内容安全检查。少的是重复搬运，'
     '命名、归类、修正、要不要公开仍然都由他决定。'),
    ('一条笔记，十种表达',
     '十套模板各有自己的构图逻辑，不是同一版式换颜色；画布先测量再绘制，按内容决定高度。'
     '同一篇内容可以按发朋友圈、发小红书、插公众号、打印贴手账分别出图。'),
    ('分享这一步不替用户发',
     '通栏那三个出口用的是微信自己的转发能力；存到相册之后怎么发、配什么话，由用户完成。'
     '产品不内建跨平台自动发布，也不声称能替用户发到别处。'),
    ('读者看到的是快照',
     '公开的是标题、摘要、要点、标签、关键链接、来源与署名；私人笔记库、正文、识别出的原文、分类都不出去。'
     '把卡片上那枚码隐藏掉，只是改变这张图的呈现，<b>不等于撤回分享</b>。'),
    ('转存是抄一条，不是存一个入口',
     '转存者拿到的是独立副本，来源只读钉住；原作者之后撤回、删除、修改都不影响这一条，它也不跟着更新。'
     '每一次转存给原作者 +1 MIND（同一篇对同一个人只算一次）。'),
    ('后面要走的商业化方向',
     '只提一句：品牌限定模板与专题活动由合作方付费（见前面「联名设想」那三页），'
     '基础记录不设付费门槛。那三页是<b>未获授权的概念设想</b>，不是现有模板，也没有排期。'),
]
pageB = ('<article class="page" data-page="0"><header class="mast"><span>Tumark</span>'
         '<span>图麦笔记 · 微信小程序作品说明</span></header><main class="content">'
         '<p class="eyebrow">业务链路 / WHERE IT GOES</p>'
         '<h1>每一环各说一句。</h1>'
         '<p class="subtitle">五个环节各自的设计取舍，以及后面要走的商业化方向。</p><div class="rows">'
         + ''.join(f'<div class="row"><h2>{a}</h2><p>{b}</p></div>' for a, b in ROWS)
         + '</div><p class="note">前五条在 2.1.8 的前端与现网后端里（接口实测见上一页）；'
         '第六条是方向，不是已成交的合作。MIND 的起始值与两档奖励只写在 '
         '<code>backend/app/services/quota.py</code> 一处，客户端不硬编码规则。</p>'
         '</main><footer class="footer"><span>图麦笔记 · 产品作品集</span><span>00 / '
         + str(TOTAL_NEW) + '</span></footer></article>')

ANCHOR = '<article class="page " data-page="3">'
ck('「录入 CAPTURE」（现第 3 页）找得到', src.count(ANCHOR) == 1)
if src.count(ANCHOR) == 1:
    src = src.replace(ANCHOR, pageA + pageB + ANCHOR, 1)

# ── 3. 整本重号 ───────────────────────────────────────────────
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
    lab = list(re.finditer(r'<span>\d{2} / \d{2}</span>', src))
    ck('页脚读数与页数一致', len(lab) == TOTAL_NEW, f'{len(lab)} 处')
    if len(lab) == TOTAL_NEW:
        out, last = [], 0
        for i, m in enumerate(lab, start=1):
            out.append(src[last:m.start()])
            out.append(f'<span>{i:02d} / {TOTAL_NEW}</span>')
            last = m.end()
        out.append(src[last:])
        src = ''.join(out)

src = sub(src, '录入与智能摘要 → 新的第一屏与几处体验',
          '业务链路全景 → 录入与智能摘要 → 新的第一屏与几处体验', '阅读路径补上业务链路')

DOC.write_text(src, encoding='utf-8')
print(f'\n{"⚠ 有 " + str(len(bad)) + " 处没落上" if bad else "全部落上"}　{DOC.name}　{len(src):,} B')
print('下一步：headless Chrome 出 PDF，再逐页量 .content 底边（要留在 1060px 之上）')
sys.exit(1 if bad else 0)
