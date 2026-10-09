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
ok('收起态那条留白还在（62vh 没被顺手删掉）', /\.entry-wrap\s*\{[^}]*margin-top:\s*62vh/.test(wxss))
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
// 10-09 那一行搬到录入条上面之后，它一占流内的位就把 Tips + 横条 + 面板整组顶下去
//（`.entry-wrap` 靠上面那条 62vh 的**流内** margin 落点；同一类账 09-30 那行日期、
// 10-01 那行 Tips 各欠过一次，每次都是真跑才看出来）。所以它必须把自己占的那一段
// 从后面扣干净：高 + 上间距 + 负 margin == 0。钉等式不钉 132 这个数——那两个数改了，
// 扣的量要跟着改，写死就成了第二条要人记得对齐的账。
const swap = seg('.home-swap')
const swapH = Number(/height:\s*([\d.]+)rpx/.exec(swap)[1])
const swapTop = Number(/margin-top:\s*(-?[\d.]+)rpx/.exec(swap)[1])
const swapBot = Number(/margin-bottom:\s*(-?[\d.]+)rpx/.exec(swap)[1])
ok('搬到上面的那一行不占流内的位（自己的高 + 上间距被自己的负 margin 抵成 0）',
  [swapH, swapTop, swapBot].every(Number.isFinite) && swapH + swapTop + swapBot === 0,
  `${swapH} + ${swapTop} + ${swapBot}`)
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
ok('条身不许 shrink', /\.bar\s*\{[^}]*flex:\s*none/.test(wxss))
// 富余由 auto 边距分掉，不是硬写死的 margin——所以"框贴脸"这种错只能在真机上量出来，
// 这里钉的是画法：框、条、三枚圈、小图排四处都写的是 margin-top:auto。
ok('框与条之间那一段缝由 auto 边距给（四处都在）',
  ['field', 'sld', 'crow', 'strip'].every((c) => /margin-top:\s*auto/.test(seg('.' + c))))
ok('报错行画在框外，面板里不预留它那一行（这就是压到 500 的那一笔）',
  !/\.entry-err|\.entry-note/.test(wxss) && /class="out-err"/.test(wxml))

// ---------- 4. 那两档高度是从源码单点读出来的，别处不许再抄一份 ----------
const panelOpen = seg('.panel-open')
ok('两档高度各只出现一次（500 与 580 不许在别处再写一遍）',
  (wxss.match(/height:\s*500rpx/g) || []).length === 1 && (wxss.match(/height:\s*580rpx/g) || []).length === 1)
ok('展开那一档挂在 .panel-open 上，由 JS 那一位说话',
  /height:\s*580rpx/.test(panelOpen) && /panelOpen \? 'panel-open'/.test(wxml))
ok('展开只多一行：580 − 500 = 80，而那一行的框正好是 160 − 105 + 开关那一段',
  PANEL_H > 0 && Number((/height:\s*(\d+)rpx/.exec(panelOpen) || [0, 0])[1]) - PANEL_H === 80)
ok('量法与算式写在这页注释里（改内容要重算这一笔账）',
  /263\.5/.test(wxssRaw) && /566/.test(wxssRaw) && /254\.4/.test(wxssRaw))

console.log(`${fails.length ? '✗' : '✓'} 录入面板沉底 静态：${pass}/${pass + fails.length} 条通过`
  + `　面板高 ${PANEL_H}rpx、底边距 ${bottom}rpx`)
fails.forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
