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
// 所以这一条改钉同一件事的两半：收起态仍按视口比例定顶 ＋ 展开态那条 fixed 仍在。
ok('收起态仍按视口比例定顶、展开态仍走 fixed（62vh 那条随收起态搬走一起退场）',
  /\.home-blk\s*\{[^}]*top:\s*min\(66\.3%,\s*calc\(100vh - \d+rpx\)\)/.test(wxss)
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
ok('展开时换背景那一行整个不渲染',
  /\.container\.entry-dock \.home-swap\s*\{[^}]*display:\s*none/.test(wxss))
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
ok('框外那两行（小字与报错）不许 shrink',
  /\.out\s*\{[^}]*flex:\s*none/.test(wxss) && /\.out-err\s*\{[^}]*flex:\s*none/.test(wxss))
// 原来钉的是 `.bar { flex: none }`。10-10 晚胶囊换成三块，同一件事的新载体是左块与右两枚：
// 左块 308 见方、右两枚各 148 高，都不许被 flex 压扁（右列 flex:1 会把左块挤瘦，
// 效果图那一版就是这么翻车的——左块宽度算成 0，人物根本没地方画）。
ok('三块都不许 shrink（左块定宽定方、右列吃余量）',
  /\.blk-person\s*\{[^}]*flex:\s*none/.test(wxss)
  && /\.blk-stat\s*\{[^}]*flex:\s*none/.test(wxss)
  && /\.blk-col\s*\{[^}]*flex:\s*1/.test(wxss))
// 富余由 auto 边距分掉，不是硬写死的 margin——所以"框贴脸"这种错只能在真机上量出来，
// 这里钉的是画法：框、条、三枚圈、小图排四处都写的是 margin-top:auto。
ok('框与条之间那一段缝由 auto 边距给（四处都在）',
  ['field', 'sld', 'crow', 'strip'].every((c) => /margin-top:\s*auto/.test(seg('.' + c))))
ok('报错行画在框外，面板里不预留它那一行（这一行的高度正是压进红框省出来的那一笔）',
  !/\.entry-err|\.entry-note/.test(wxss) && /class="out-err"/.test(wxml))

// ---------- 4. 那两档高度是从源码单点读出来的，别处不许再抄一份 ----------
// 两档的数**从 CSS 现读**，不写死在判据里：10-08 那轮 700→500/580、10-10 那轮 500/580→410/490，
// 两次都是把数抄进判据、下一次改还得再来记一遍。这里钉的是关系（各只出现一次、差 80、挂在
// .panel-open 上），不是钉那两个数。
const panelOpen = seg('.panel-open')
const OPEN_H = Number((/height:\s*(\d+)rpx/.exec(panelOpen) || [0, 0])[1])
ok('两档高度各只出现一次（这一档的数不许在别处再写一遍）',
  (wxss.match(new RegExp(`height:\\s*${PANEL_H}rpx`, 'g')) || []).length === 1
  && (wxss.match(new RegExp(`height:\\s*${OPEN_H}rpx`, 'g')) || []).length === 1,
  `收起 ${PANEL_H}、展开 ${OPEN_H}`)
ok('展开那一档挂在 .panel-open 上，由 JS 那一位说话',
  OPEN_H > 0 && /panelOpen \? 'panel-open'/.test(wxml))
ok(`展开只多一行：${OPEN_H} − ${PANEL_H} = 80，而那一行的框正好是 160 − 105 + 开关那一段`,
  PANEL_H > 0 && OPEN_H - PANEL_H === 80)
ok('量法与算式写在这页注释里（改内容要重算这一笔账）',
  /248\.6/.test(wxssRaw) && /586/.test(wxssRaw) && /216\.8/.test(wxssRaw))

console.log(`${fails.length ? '✗' : '✓'} 录入面板沉底 静态：${pass}/${pass + fails.length} 条通过`
  + `　面板高 ${PANEL_H}rpx、底边距 ${bottom}rpx`)
fails.forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
