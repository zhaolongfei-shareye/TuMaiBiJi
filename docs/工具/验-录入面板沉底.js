// 录入面板"贴底 + 四屏等高"这一批的静态尺子（不连模拟器，纯读文件）。
// 跑法：node docs/工具/验-录入面板沉底.js
// 要守的东西：① 展开时整块从流里拿出来沉到底栏上方，不再从顶上挂下来盖住照片；
// ② 面板定高，四个模式共用一个窗口；③ 定高之后不许有东西被压扁或被裁；
// ④ 那个 bottom 是从底栏几何推出来的，底栏一动这里要跟着动，所以两头都从源码现读。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— ' + extra : ''))
}

const wxml = fs.readFileSync(P('pages/create/create.wxml'), 'utf8')
const wxssRaw = fs.readFileSync(P('pages/create/create.wxss'), 'utf8')
const wxss = wxssRaw.replace(/\/\*[\s\S]*?\*\//g, '')
const barWxss = fs.readFileSync(P('custom-tab-bar/index.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const appWxss = fs.readFileSync(P('app.wxss'), 'utf8')

// 只扫"这一个选择器自己那一段"：选择器必须顶到行首，否则 `.container.has-bg .panel {`
// 会被当成 `.panel` 那一段先命中，读到的就不是面板自己的规则了。
const seg = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(wxss)
  return m ? m[1] : ''
}

// ---------- 1. 展开态那个类改名了，旧名一处不剩 ----------
ok('展开态挂的是 entry-dock', /\{\{active \? 'entry-dock' : ''\}\}/.test(wxml))
ok('旧的 bg-give-way 全项目清零', !/bg-give-way/.test(
  [wxml, wxssRaw, fs.readFileSync(P('pages/create/create.js'), 'utf8')].join('\n')))
// 原来这一条钉 `.entry-wrap { margin-top: 62vh }`。10-10 晚收起态那三块搬出去自己按视口
// 比例定顶（`.home-blk` 的 top: min(66.3%, 100vh−546rpx)），展开态那一档则由下面那条 fixed 管，
// 流内 margin 没有生效者了——留着反而让人以为收起态还归它管。
// 10-14 再换一次：站长「两个屏的内框高度要一致」⇒ 收起态不再按视口比例，改成与展开态
// **共用同一根底线**（组顶 = 100vh − 152 − 内框高）。所以这一条钉的是：
// 收起态那条 top 是纯 `calc(100vh − N)`（N 由底栏那一口与内框高推出来，见 §5），
// 66.3% 那一族比例值一处不剩（留着它，两屏在矮屏上就会分叉），展开态那条 fixed 仍在。
ok('收起态与展开态共用同一根底线（66.3% 那一族退场，fixed 仍在）',
  /\.home-blk\s*\{[^}]*top:\s*calc\(100vh - \d+rpx\)/.test(wxss)
  && !/66\.3%/.test(wxss)
  && /\.container\.entry-dock \.entry-wrap\s*\{[^}]*position:\s*fixed/.test(wxss)
  && !/\.entry-wrap\s*\{[^}]*margin-top:\s*\d+(vh|rpx|px)/.test(wxss))
ok('那条 margin-top 过渡已撤（贴底是 position 切换，过渡不动它）',
  !/transition:\s*margin-top/.test(wxss))

// ---------- 2. 贴底：fixed + 底栏上方 ----------
const dock = seg('.container.entry-dock .entry-wrap')
ok('展开时整块 fixed', /position:\s*fixed/.test(dock), dock.trim().slice(0, 60))
ok('展开时不再靠 margin-top 定位', /margin-top:\s*0/.test(dock))
const bottom = Number((/bottom:\s*(\d+)rpx/.exec(dock) || [])[1])
ok('bottom 是个数', Number.isFinite(bottom), String(bottom))
// 底栏占掉的那一段从组件源码现读：bottom 20 + height 108 = 128，面板再留一条缝
const barBottom = Number(/\.tab-bar\s*\{[\s\S]*?bottom:\s*(\d+)rpx/.exec(barWxss)[1])
const barHeight = Number(/\.tab-bar\s*\{[\s\S]*?height:\s*(\d+)rpx/.exec(barWxss)[1])
const gap = bottom - (barBottom + barHeight)
ok('面板底边 = 底栏顶边 + 一条 24 的缝', gap === 24, `实得 ${gap}`)
// 左右内缩和 .container 的 --sp-3 是同一个数：fixed 不吃父级 padding，不写就宽一圈
const sp3 = Number(/--sp-3:\s*(\d+)rpx/.exec(appWxss)[1])
ok('左右内缩等于 --sp-3', new RegExp(`left:\\s*${sp3}rpx`).test(dock) && new RegExp(`right:\\s*${sp3}rpx`).test(dock), `--sp-3=${sp3}`)
// 站长 10-11 12:2x 原话「调亮度，换背景，再第二屏也需要，第二屏就是带拍摄面板那个」
// ⇒ 这一行两屏都在。原来钉的是"展开时整个不渲染"，那条 display:none 已经撤了，判据跟着反过来钉：
// 样式表里**不许再有**任何一条把这一行在展开态藏起来的规则（写回 `display:none`、写回 `visibility:hidden`、
// 或者整条搬进 `.entry-dock` 的作用域里，都算违背他那一句）。
ok('展开态不许再把换背景那一行藏起来（两屏都要有）',
  !/\.container\.entry-dock[^{]*\.home-swap\s*\{[^}]*(display:\s*none|visibility:\s*hidden|height:\s*0)/.test(wxss))
// 10-09 那一行搬到录入条上面时，它一占流内的位就把 Tips + 横条 + 面板整组顶下去
//（`.entry-wrap` 靠上面那条 62vh 的**流内** margin 落点；同一类账 09-30 那行日期、
// 10-01 那行 Tips 各欠过一次，每次都是真跑才看出来）。当时钉的是"高 + 上间距 + 负 margin == 0"。
// 10-10 站长拿效果图 c5 把日期那行撤了、叫这一行去**顶它那一格**，于是等式右边不再是 0，
// 而是日期行原来占的那一段：−14（上）+ 33.6（那一行字）+ 32（下）= 51.6 → 取整 52。
// 比 52 小会叫这一行的字骑到标题底下去，比 52 大录入条整组往下漂（真跑那把量的是条底
// 618 那一档，容差 ±14px）。钉的是这三个数加起来等于预算，不钉 −22 这个数。
const swap = seg('.home-swap')
const swapH = Number(/height:\s*([\d.]+)rpx/.exec(swap)[1])
const swapMg = /margin:\s*(-?[\d.]+)rpx\s+-?[\d.]+(?:rpx)?\s+(-?[\d.]+)rpx\s*;/.exec(swap)
const swapTop = swapMg ? Number(swapMg[1]) : NaN
const swapBot = swapMg ? Number(swapMg[2]) : NaN
ok('顶掉日期那一格的那一行，流内占的正好是日期行原来那一段（−14 + 88 − 22 = 52）',
  [swapH, swapTop, swapBot].every(Number.isFinite) && swapH + swapTop + swapBot === 52,
  `${swapTop} + ${swapH} + ${swapBot} = ${swapH + swapTop + swapBot}（预算 52）`)
ok('那一行的字对齐日期原来那条线（行高 34 = 24×1.4，盒子 88 是给指头的热区）',
  /line-height:\s*34rpx/.test(seg('.swap-text')) && swapH >= 88, `height ${swapH}`)
// 抬层那条规则不许再把 fixed 改回 relative：它必须排除展开态
ok('铺图抬层那条排除了展开态',
  /\.container\.has-bg:not\(\.entry-dock\) \.entry-wrap/.test(wxss))

// ---------- 3. 两档等高：面板定高，内容不许被压扁 ----------
const panel = seg('.panel')
const PANEL_H = Number(/height:\s*(\d+)rpx/.exec(panel)[1])
ok('面板定高', PANEL_H > 0 && PANEL_H < 1200, String(PANEL_H))
ok('面板是 flex 列', /display:\s*flex/.test(panel) && /flex-direction:\s*column/.test(panel))
ok('面板算 border-box（定高含内边距）', /box-sizing:\s*border-box/.test(panel))
// 10-08 起面板肚子里那块"卡"就是原来 .entry-body 的位置：吃掉标签行以下剩下的那一段。
const card = seg('.card')
ok('卡吃掉面板剩下的那一段', /flex:\s*1/.test(card) && /min-height:\s*0/.test(card))
ok('卡自己是 flex 列', /display:\s*flex/.test(card) && /flex-direction:\s*column/.test(card))
ok('卡里每一段都不许 shrink（富余整段留给框与条上面那两档 auto 边距）',
  /\.card > view,\s*\.card > textarea\s*\{[^}]*flex:\s*none/.test(wxss))
ok('模式标签行不许 shrink', /\.modes\s*\{[^}]*flex:\s*none/.test(wxss))
// 框外那一行报错 10-10 深夜搬进气泡了（absolute 浮层，不是流内一行），
// 所以这里只剩"小字那一行不许 shrink"这一条；报错那条改钉"它不占流内高度"。
ok('框外那一行小字不许 shrink', /\.out\s*\{[^}]*flex:\s*none/.test(wxss))
// 原来钉的是 `.bar { flex: none }`。10-10 晚胶囊换成三块，同一件事的新载体是左块与右两枚。
// 2.2 B 方案之后载体又换了一次：右两枚没了，行里只剩"左块 308×（面板同一个数）＋ 右列吃余量"，
// 而这一行内部多出来的三样（Tips 那一格、圆形 ➕、两枚计数格）各有一条自己的伸缩规矩：
// 左块与 ➕ 定死不压，列与 Tips 那一格吃余量但必须带 min-*（不带的话长句会把列撑破）。
// 效果图那一版翻车过的还是同一件事——左块宽度算成 0，人物根本没地方画。
ok('行里两样与列里三样各按该有的伸缩档位写（该定死的定死、该吃余量的带 min-*）',
  ['blk-person', 'blk-plus'].every((c) => /flex:\s*none/.test(seg('.' + c)))
  && [['blk-col', 'min-width'], ['blk-tips', 'min-height'], ['blk-cell', 'min-width']]
    .every(([c, minKey]) => {
      const t = seg('.' + c)
      // 两条分开判、不比先后：写的顺序不该成为红的理由（这一把第一版按顺序写，纯属自找）。
      return /flex:\s*1/.test(t) && new RegExp(`${minKey}:\\s*0`).test(t)
    }))
// 富余由 auto 边距分掉，不是硬写死的 margin——所以"框贴脸"这种错只能在真机上量出来，
// 这里钉的是画法：框、条、三枚圈、小图排四处都写的是 margin-top:auto。
// 四处变两处（10-10 深夜）：框与图排身上那两档 auto 撤了——站长量的是
// "面板内最上面的白边比最下面的高"，两档 auto 对半分富余，上白边就永远比下白边多半份。
// 现在只留条上面那一档：框贴着卡顶，上下白边都等于卡的内边距。
ok('只有条与那排圈身上还有 auto 上边距（框与图排身上那两档已撤给标签行）',
  /margin-top:\s*auto/.test(seg('.sld')) && /margin-top:\s*auto/.test(seg('.crow'))
  && !/margin-top:\s*auto/.test(seg('.field')) && !/margin-top:\s*auto/.test(seg('.strip')))
ok('卡的内边距上下同一个数（"上白边＝下白边"这一句由它一个人说了算）',
  (() => {
    const p = (seg('.card').match(/padding:\s*([^;]+)/) || [, ''])[1].trim().split(/\s+/).map(parseFloat)
    return p.length === 1 || p[0] === p[2]
  })(), seg('.card').replace(/\s+/g, ' '))
// 报错那一行反过来钉了：它现在是面板里的浮层，**不许在流内占高度**——
// 这一行的高度正是 10-08 压进红框省出来的那一笔，谁把它请回流内，面板就会当场跳一帧。
ok('报错是浮层，不占流内高度（.panel 得先成为定位父级）',
  /position:\s*relative/.test(seg('.panel')) && /\.hint-bubble\s*\{[^}]*position:\s*absolute/.test(wxss)
  && !/out-err/.test(wxml))

// ---------- 4. 那两档高度是从源码单点读出来的，别处不许再抄一份 ----------
// 两档的数**从 CSS 现读**，不写死在判据里：10-08 那轮 700→500/580、10-10 那轮 500/580→410/490，
// 两次都是把数抄进判据、下一次改还得再来记一遍。这里钉的是关系（各只出现一次、差 80、挂在
// .panel-open 上），不是钉那两个数。
const panelOpen = seg('.panel-open')
const OPEN_H = Number((/height:\s*(\d+)rpx/.exec(panelOpen) || [0, 0])[1])
/* 原来钉的是"这一档的数全项目只出现一次"。2.2 B 方案把左块抬成与那块面板同高
   （站长 10-13 原话「左边内框要与第二个图高度对齐」）⇒ 同一个数**故意**出现两次：
   `.panel` 与 `.blk-person`。所以这一条改成钉"两处、且就是这两处"：
   出现第三次才是漂移（那意味着有人又开始抄这个数），一处都没有则是那一块没了。
   两处的数还必须是同一个数——分开各读各的，不许拿字面量比。 */
const CARD_SEG = seg('.blk-person')
const CARD_H = Number((/height:\s*(\d+)rpx/.exec(CARD_SEG) || [0, 0])[1])
ok(`左块与面板同高（都读自 CSS：面板 ${PANEL_H}／左块 ${CARD_H}），而这个数全项目只出现在这两处`,
  PANEL_H > 0 && CARD_H === PANEL_H
  && (wxss.match(new RegExp(`height:\\s*${PANEL_H}rpx`, 'g')) || []).length === 2
  && /\.blk-person\s*\{/.test(wxssRaw) && /\.panel\s*\{/.test(wxssRaw),
  `height:${PANEL_H}rpx 的出现处数`)
ok('展开那一档仍只出现一次（490 只有 .panel-open 一处，别处不许抄）',
  OPEN_H > 0 && (wxss.match(new RegExp(`height:\\s*${OPEN_H}rpx`, 'g')) || []).length === 1,
  `展开 ${OPEN_H}`)
ok('展开那一档挂在 .panel-open 上，由 JS 那一位说话',
  OPEN_H > 0 && /panelOpen \? 'panel-open'/.test(wxml))
// 「展开只多一行」这一句钉的是**式子**，不是钉 80 那个数（10-14 收起压到 372 之后差变成 118）。
// 多出来的那一段正好是一行小图的行距：`.th` 那一格的高 ＋ `.strip` 的行间距。
// 差比行距小 ⇒ 第二排装不下（"多一行"落空）；差比行距大出 8 以上 ⇒ 那一档白给了，
// 而白给的那一段会从深色面板的顶上穿出去（墨顶是按这一档推的，见 §5）。
const TH_H = Number(/height:\s*(\d+)rpx/.exec(seg('.th'))[1])
const STRIP_GAP = Number(/gap:\s*(\d+)rpx/.exec(seg('.strip'))[1])
const ROW_PITCH = TH_H + STRIP_GAP
ok(`展开只多一行：${OPEN_H} − ${PANEL_H} ＝ 一行小图的行距（格 ${TH_H} ＋ 行间距 ${STRIP_GAP} ＝ ${ROW_PITCH}）`,
  PANEL_H > 0 && OPEN_H - PANEL_H >= ROW_PITCH && OPEN_H - PANEL_H < ROW_PITCH + 8,
  `差 ${OPEN_H - PANEL_H}，行距 ${ROW_PITCH}`)
ok('量法与算式写在这页注释里（改内容要重算这一笔账）',
  /内容位 230/.test(wxssRaw) && /548/.test(wxssRaw) && /216\.8/.test(wxssRaw))

// ---------- 5. 深色面板那一层的顶：两屏一根线，展开那一档跟着卡一起长 ----------
// 站长 10-14 原话「第二屏，高度不准，要和第一屏一致」＋「back 抬到暗面板上面」。
// 这一层原来的两根线（首屏 min(66.3% − 24, 100vh − 586)／第二屏 100vh − 749）差 163rpx，
// 点一下 ➕ 背景就自己往上跑一趟。现在钉三件事：
// ① 一根线：这一层的顶 ＝ 内框的顶往上 24，而内框两屏同高同底 ⇒ 一个式子内推出来；
// ② 那根钉死第二屏的 `.entry-dock .stage-panel` 不许回来（它一回来就是两根线）；
// ③ 展开那一档另给一条 `.dock-open`，数由展开档的高推出来 ⇒ 这一层永远比卡片高 24。
const BREATH = 24
const stage = seg('.stage-panel')
const INK_H = Number((/top:\s*calc\(100vh - (\d+(?:\.\d+)?)rpx\)/.exec(stage) || [0, NaN])[1])
ok('深色面板那一层的顶是纯 `calc(100vh − N)`（66.3%／min() 那一族一处不剩）',
  Number.isFinite(INK_H) && !/66\.3%|min\(/.test(stage), stage.replace(/\s+/g, ' ').slice(0, 80))
ok(`这一层的顶 ＝ 底栏那一口 ${bottom} ＋ 内框 ${PANEL_H} ＋ 呼吸 ${BREATH}（两屏同一根线）`,
  INK_H === bottom + PANEL_H + BREATH, `读到的 N＝${INK_H}，应为 ${bottom + PANEL_H + BREATH}`)
ok('第二屏那根另钉的顶已经撤净（`.entry-dock .stage-panel` 一条都不许留）',
  !/\.entry-dock\s+\.stage-panel/.test(wxss))
const openSeg = seg('.container.dock-open .stage-panel')
const INK_OPEN_H = Number((/top:\s*calc\(100vh - (\d+(?:\.\d+)?)rpx\)/.exec(openSeg) || [0, NaN])[1])
ok('展开那一档这一层跟着卡片一起长（顶＝底栏口 ＋ 展开档 ＋ 同一口呼吸）',
  Number.isFinite(INK_OPEN_H) && INK_OPEN_H === bottom + OPEN_H + BREATH,
  `读到 ${INK_OPEN_H}，应为 ${bottom + OPEN_H + BREATH}`)
ok('这一条的闸挂在容器上、由 panelOpen 那一位说话',
  /panelOpen \? 'dock-open'/.test(wxml))
// 框外那一行：10-14 起只剩「返回」一枚，并且整枚要在墨面之上。
// 它自己那一段的高 ＋ 下面那档 margin 是这一条的全部：margin 小于那口呼吸 ⇒ 骑到墨面上。
const outSeg = seg('.out')
const OUT_MB = Number((/margin-bottom:\s*(\d+(?:\.\d+)?)rpx/.exec(outSeg) || [0, NaN])[1])
ok('框外那一行只剩「返回」一枚（Tips 与它前面那枚点都不许回来）',
  !/class="out-l"/.test(wxml) && !/class="out-dot"/.test(wxml)
  && (wxml.match(/class="out"[^>]*>[\s\S]*?<\/view>/) || [''])[0].includes('out-r'))
ok(`那一行整枚坐在墨面之上（下面那档留白 ${OUT_MB} > 墨面那口呼吸 ${BREATH}）`,
  Number.isFinite(OUT_MB) && OUT_MB > BREATH, `margin-bottom ${OUT_MB}`)
ok('那一行不再吃写死的纸白（抬到照片上就得跟着深浅翻极性）',
  /color:\s*var\(--text-(secondary|tertiary)\)/.test(outSeg), outSeg.replace(/\s+/g, ' '))

console.log(`${fails.length ? '✗' : '✓'} 录入面板沉底 静态：${pass}/${pass + fails.length} 条通过`
  + `　面板高 ${PANEL_H}rpx、底边距 ${bottom}rpx`)
fails.forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
