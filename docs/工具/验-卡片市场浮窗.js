// 「浏览卡片市场」那一层（站长 11-08 第 1 条需求）的静态尺子。
// 跑法：node docs/工具/验-卡片市场浮窗.js
//
// 这把钉的是**代码形状**，不碰屏上。屏上那一半（真跑）由 `验-卡片市场浮窗-真跑.js` 量。
// 需求原话：「生成分享图时候，左上角的左右滑换模板，改为"浏览卡片市场"，浮窗里面显示，
//   现有所有卡片，上下两层，左右切换浏览，该界面仍然是四周毛玻璃的风格，不要全屏。
//   点击选中后，回到生成分享图界面。」
//
// 于是这把钉六条，每条对应需求里的一句话：
//   ① 左上角那句换成「浏览卡片市场」，而且它**是把手**（点得动、且点它不会顺手把整层收了）；
//   ② 浮窗**不是全屏**：四边都留着（左右上下的 rpx 都非零），不许退化成 width/height 100%；
//   ③ 四周那一圈仍是**磨砂玻璃**：复用 `.float-mask` 那一支（暗纱＋`--glass-bf` 模糊），
//      `.mkt-mask` 只许抬层序，不许自己再开一块底色（开了就是"玻璃上再糊一层"，四角发灰）；
//   ④ **上下两层**：组数来自 `poster.TEMPLATE_GROUPS`（两档），每档一条横着滚的货架；
//   ⑤ **左右切换浏览**：每档那条是 `scroll-view scroll-x`，宽度比视口宽才谈得上"切换"；
//   ⑥ **点一格回生成分享图那一屏**：先收这一层再换模板，且成品弹窗不摘（底下那层还在）；
//      「现有所有卡片」＝格数来自 `poster.templateList()`（包内 ∪ 下发），一个都不写死。
//
// ⚠ 这把读的是**代码**，所以注释里的字面量不算数：判据一律按结构读（类名清单、
//   选择器块、setData 的键），不按字符串全局搜。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const WXML = read('miniprogram/pages/index/index.wxml')
const WXSS = read('miniprogram/pages/index/index.wxss')
const JS = read('miniprogram/pages/index/index.js')
const I18N = read('miniprogram/utils/i18n.js')
const POSTER = read('miniprogram/utils/poster.js')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

// 取一段 CSS 规则的声明体（按选择器精确匹配，注释先剥掉，免得注释里那个 "z-index: 100" 被读进来）。
const cssBlock = (sel) => {
  const noComment = WXSS.replace(/\/\*[\s\S]*?\*\//g, '')
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(^|[,{}\\s])${esc}\\s*\\{([^}]*)\\}`).exec(noComment)
  return m ? m[2] : ''
}
const cssNum = (block, prop) => {
  const m = new RegExp(`${prop}\\s*:\\s*(-?[\\d.]+)\s*rpx`).exec(block)
  return m ? Number(m[1]) : null
}
// z-index 是无单位数，另取一份（拿 rpx 那把尺子量它，永远量不到）。
const cssZ = (block) => {
  const m = /z-index\s*:\s*(-?\d+)/.exec(block)
  return m ? Number(m[1]) : null
}

/* ---------- ① 左上角那一句：换成「浏览卡片市场」，而且是把手 ---------- */
// ⚠ 屏上有**两枚** `.grip-tx-l`：详情窗那扇窗的左端一句（「左右滑动看下一篇」）与成品弹窗那一句。
//   找错那一枚，判据就变成在给详情窗开绿灯。所以先把 wxml 从成品弹窗那一段切出来，
//   再在**这一段里**找左端那一格。
const posterSheetAt = WXML.indexOf('class="float-sheet tpl-sheet"')
const posterSheet = posterSheetAt >= 0 ? WXML.slice(posterSheetAt) : ''
// 那一行必须带 catchtap：它住在 `.grip` 里，而 `.grip` 那一条 bindtap 是"点把手收窗"，
// 不截住的话点这句顺手把整层收了——等于点了什么都看不到（这一条是 11-08 真跑里最容易复发的）。
const entryTag = /<text[^>]*class="grip-tx grip-tx-l"[^>]*>[\s\S]*?<\/text>/.exec(posterSheet)
const entry = entryTag ? entryTag[0] : ''
ck('① 成品弹窗左上角那一句挂的是 `.grip-tx-l`（左端那一格的位置）', !!entry, entry.slice(0, 90))
ck('① 那一格念的是字典里的「浏览卡片市场」，不是写死的中文',
  /\{\{t\.browseMarket\}\}/.test(entry), entry)
ck('① 那一格是把手（catchtap），点它不会顺手把成品弹窗收了',
  /catchtap="onOpenMarket"/.test(entry), entry)
ck('① 已生成态不给换模板 ⇒ 那一格在已生成态不画（与顶上那枚模板名同一个条件）',
  /wx:if="\{\{!posterHasCard\}\}"/.test(entry), entry)
// 这一格正文里只该有一个插值，而且就是那一个字典键：
// 多插一个（把旧那句「左右滑换模板」留着）＝左端那一格挤成两句话。
const entryBody = /<text[^>]*>([\s\S]*?)<\/text>/.exec(entry)
const interps = (entryBody ? entryBody[1] : '').match(/\{\{[^}]*\}\}/g) || []
ck('① 旧那句「左右滑换模板」不再占着这一格（左端这一格里只有那一个插值）',
  interps.length === 1 && interps[0] === '{{t.browseMarket}}',
  interps.join(' | ') || '（正文没插值）')
// 字典两门都得有这一键，否则英文界面落到 undefined＝屏上一句空白。
const bmZh = /browseMarket:\s*'([^']+)'/.exec(I18N)
const bmAll = (I18N.match(/browseMarket:/g) || []).length
ck('① 字典两门都有 browseMarket（中文界面念得到、英文界面也念得到）',
  bmAll === 2 && !!bmZh, `${bmAll} 处；中文＝${bmZh ? bmZh[1] : '没读到'}`)

/* ---------- ② 浮窗不是全屏 ---------- */
const sheet = cssBlock('.mkt-sheet')
const sLeft = cssNum(sheet, 'left')
const sRight = cssNum(sheet, 'right')
const sTop = cssNum(sheet, 'top')
const sBottom = cssNum(sheet, 'bottom')
ck('② 浮窗是 fixed 定位（浮在成品弹窗之上，不是文档流里的一页）',
  /position:\s*fixed/.test(sheet), sheet.replace(/\s+/g, ' ').slice(0, 60))
ck('② 四边都留着（左右上下都非零 ⇒ 四周看得见后面的东西）',
  sLeft > 0 && sRight > 0 && sTop > 0 && sBottom > 0,
  `左 ${sLeft}／右 ${sRight}／上 ${sTop}／下 ${sBottom} rpx`)
ck('② 不是全屏（不许 width/height 100%、不许 left:0 顶到边）',
  !/width:\s*100%/.test(sheet) && !/height:\s*100%/.test(sheet) && !/left:\s*0\b/.test(sheet),
  sheet.replace(/\s+/g, ' ').slice(0, 120))
ck('② 底栏那一头留了空隙（bottom 不是 0 ⇒ 底栏还在、没被压住）', sBottom >= 200, `bottom ${sBottom} rpx`)

/* ---------- ③ 四周那一圈仍是磨砂玻璃 ---------- */
const mask = cssBlock('.float-mask')
ck('③ 玻璃那一层还是 `.float-mask` 那一支（暗纱＋`--glass-bf` 模糊，两门都写）',
  /backdrop-filter:\s*var\(--glass-bf\)/.test(mask)
  && /-webkit-backdrop-filter:\s*var\(--glass-bf\)/.test(mask)
  && /background:\s*var\(--glass-veil-dim\)/.test(mask),
  mask.replace(/\s+/g, ' ').slice(0, 120))
ck('③ 玻璃那一层四边都铺满（left/top/right/bottom 都是 0 ⇒ 真的是"四周那一圈"）',
  /left:\s*0/.test(mask) && /top:\s*0/.test(mask) && /right:\s*0/.test(mask) && /bottom:\s*0/.test(mask))
ck('③ 玻璃那一层不吃图片（背景是一层暗纱，不是 url()）', !/url\(/.test(mask))
const mktMask = cssBlock('.mkt-mask')
ck('③ `.mkt-mask` 只抬层序，自己不开底色（开了就是玻璃上再糊一块、四角发灰）',
  /z-index:\s*102/.test(mktMask)
  && !/background/.test(mktMask) && !/backdrop-filter/.test(mktMask),
  mktMask.replace(/\s+/g, ' ').slice(0, 80))
ck('③ wxml 里那一层同时挂 `.float-mask` 与 `.mkt-mask` 两个类（复用而不是重画）',
  /class="float-mask mkt-mask"/.test(WXML))
ck('③ `.mkt-sheet` 压在玻璃之上（103 > 102）', cssZ(cssBlock('.mkt-sheet')) === 103)
// 层序：成品弹窗 100/101、这一层 102/103、微信图片面板 1000。
// 压不过成品弹窗＝浮窗被下面那层盖住；压过 1000＝会被微信面板那层压住。
ck('③ 层序：这一层压在成品弹窗（100/101）之上、微信图片面板（1000）之下',
  cssZ(cssBlock('.mkt-sheet')) > cssZ(cssBlock('.float-sheet'))
  && cssZ(cssBlock('.mkt-sheet')) < cssZ(cssBlock('.share-dim')),
  `成品 ${cssZ(cssBlock('.float-sheet'))}／这一层 ${cssZ(cssBlock('.mkt-sheet'))}／图片面板 ${cssZ(cssBlock('.share-dim'))}`)

/* ---------- ④ 上下两层 ---------- */
const groupIds = (POSTER.match(/\{ id: '([a-z]+)', label: '[^']*', labelEn: '[^']*' \}/g) || [])
  .map((s) => /id: '([a-z]+)'/.exec(s)[1])
  .filter((id) => ['classic', 'bold'].indexOf(id) >= 0)
ck('④ 分组是两档（经典款／个性款）——"上下两层"就是这两档', groupIds.length === 2, groupIds.join('、'))
ck('④ 浮窗的层数来自 `poster.TEMPLATE_GROUPS`（加一套组不用改这一层）',
  /poster\.TEMPLATE_GROUPS\.map/.test(JS), /poster\.TEMPLATE_GROUPS\.map/.test(JS) ? '吃分组表' : '没吃')
ck('④ wxml 里那一层按组循环（`marketRows` 那一层）',
  /wx:for="\{\{marketRows\}\}"/.test(WXML) && /class="mkt-row"/.test(WXML))
ck('④ 每档一条横着滚的货架（`scroll-view scroll-x`）',
  /class="mkt-scroll" scroll-x/.test(WXML))
ck('④ 货架内容是一条横排（inline-flex 的 `.mkt-line`，不是竖着堆）',
  /\.mkt-line\s*\{[^}]*display:\s*inline-flex/.test(WXSS.replace(/\/\*[\s\S]*?\*\//g, '')))
ck('④ 那一层不是白名单：格子来自 `poster.templateList()`（包内 ∪ 下发）',
  /poster\.templateList\(\)/.test(JS) && !/marketRows:\s*\[\s*\{/.test(JS),
  /poster\.templateList\(\)/.test(JS) ? '吃清单' : '没吃')
ck('④ 格子里画的是真小样（`canvas type="2d"`，不是占位块）',
  /<canvas[\s\S]{0,120}class="mkt-canvas"/.test(WXML))

/* ---------- ⑤ 点一格回生成分享图那一屏 ---------- */
const pickSrc = /onMarketPick\(e\)\s*\{[\s\S]{0,400}?\n  \}/.exec(JS)
const pick = pickSrc ? pickSrc[0] : ''
ck('⑤ 点一格读的是那一格自己的 id（data-id → dataset）',
  /dataset\.id/.test(pick) && /data-id="\{\{tpl\.id\}\}"/.test(WXML))
ck('⑤ 点一格带 catchtap（不冒泡到上面那层的收窗动作）',
  /catchtap="onMarketPick"/.test(WXML))
ck('⑤ 先收这一层、再换模板（不然重画那几百毫秒里人看的还是小窗）',
  pick.indexOf('marketOpen: false') >= 0
  && pick.indexOf('marketOpen: false') < pick.indexOf('_tplPick'),
  pick.replace(/\s+/g, ' ').slice(0, 120))
ck('⑤ 换完模板成品弹窗还在（底下那层不摘——摘了就回不去）',
  /this\._tplPick\(/.test(pick) && !/templateOpen:\s*false/.test(pick))
ck('⑤ 成品弹窗那一层不摘（wxml 里市场层与它并存，不靠 wx:if 互斥）',
  /wx:if="\{\{templateOpen && !cardInfoOpen\}\}" class="float-mask"/.test(WXML)
  && /wx:if="\{\{marketOpen\}\}" class="mkt-sheet"/.test(WXML))
ck('⑤ 收起成品弹窗时这一层也跟着收（不留下一个孤零零的小窗）',
  /_closeTemplate\(\)\s*\{[\s\S]{0,600}?marketOpen:\s*false/.test(JS))
ck('⑤ 这一层的网格用 `catchtap="onCloseMarket"`（点窗外收这一层，不收底下那层）',
  /class="float-mask mkt-mask" catchtap="onCloseMarket"/.test(WXML))

/* ---------- ⑥ 选中那一格要看得见 ---------- */
const onCss = cssBlock('.mkt-on .mkt-lab')
const onCanvas = cssBlock('.mkt-on .mkt-canvas')
ck('⑥ 选中那一格的名字变主色加粗',
  /color:\s*var\(--accent\)/.test(onCss) && /font-weight:\s*700/.test(onCss),
  onCss.replace(/\s+/g, ' ').slice(0, 80))
ck('⑥ 选中那一格的小样外圈加一道主色细环（要一眼看见选中的是哪一格）',
  /box-shadow:\s*0 0 0 4rpx var\(--accent\)/.test(onCanvas),
  onCanvas.replace(/\s+/g, ' ').slice(0, 80))
ck('⑥ 小样的底色是透明的（位图里已经圆过一次；留底色＝四角外各垫一块直角灰斑）',
  /background:\s*transparent/.test(cssBlock('.mkt-canvas')))

console.log(bad.length ? `\n✗ ${bad.length} 条不过：${bad.join(' / ')}` : '\n全过')
process.exit(bad.length ? 1 : 0)
