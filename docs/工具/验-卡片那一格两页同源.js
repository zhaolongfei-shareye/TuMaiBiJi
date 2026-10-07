// 「笔记卡片」那一格：详情窗与详情页是不是真的一份实现。跑法：node docs/工具/验-卡片那一格两页同源.js
//
// 为什么要这一把（站长 10-07 原话）：「生成后，不应该出现生成卡片的入口，很多余，为什么不干掉。
// 然后我记得右上角是有笔记卡片的小图的，你是不是又漏了。」——那一格是 v20 那一稿（10-03）就画好、
// 早就拍定的口径，但它只落在了首页的详情窗上，**独立详情页从来没落地过**。
// 少的那一处不是"少个装饰"：那一格就是出卡片的唯一入口，缺了它这一页只能靠底排那枚按钮，
// 而那枚按钮在"已经生成过"之后还留着——两件事其实是同一个漏口的两面。
//
// 这把尺子测的不是功能（功能由 验-详情页那一格-真跑 真点一遍），测的是**别再各画一份**：
// ① 那一格的样式只有 app.wxss 一份，两页自己的 wxss 里一条都不许有；
// ② 两页 wxml 里那一段，去掉注释、缩进与"这一篇"那个变量名之后必须逐字相同；
// ③ 两页绑的是同一个处理函数名，且各自都有实现（搬家的失败形态就是"点了没反应"）；
// ④ 详情页底排不再留第二个把手（两枚、没有 primary、没有悬空的 onShare）；
// ⑤ 那条"图还在才算有"的判据与那枚淡底色，两页都从同一个出处拿。
// 最后一段是反向自证：故意造三处漂移，判据必须红——不然它只是在读文件，不是在守东西。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

const APP_WXSS = read('miniprogram/app.wxss')
const INDEX_WXSS = read('miniprogram/pages/index/index.wxss')
const DETAIL_WXSS = read('miniprogram/pages/detail/detail.wxss')
const INDEX_WXML = read('miniprogram/pages/index/index.wxml')
const DETAIL_WXML = read('miniprogram/pages/detail/detail.wxml')
const INDEX_JS = stripJs(read('miniprogram/pages/index/index.js'))
const DETAIL_JS = stripJs(read('miniprogram/pages/detail/detail.js'))
const CARD_LOG = stripJs(read('miniprogram/utils/cardLog.js'))
const CARD_INFO = stripJs(read('miniprogram/utils/cardInfo.js'))
const PALETTE = stripJs(read('miniprogram/utils/palette.js'))
const I18N = read('miniprogram/utils/i18n.js')

// 这一格的六族类名（`.ds-rt` 是那一列的宽，剩下的是格子里面那两态）。
// 分栏本身（`.ds-hero` / `.dt-hero`）不在这份名单里——窗内净宽 634、卡内净宽 638 不是同一个数，
// 那是各页自己的事，格子必须一样。
const CELL = ['ds-rt', 'ds-pad', 'ds-pad-img', 'ds-empty', 'ds-swatch', 'ds-plus',
  'ds-logo', 'ds-logo-n', 'ds-e1', 'ds-e2']
const cellRules = (src) => (src.match(/^\.ds-[\w-]+[^\n]*\{/gm) || [])
  .map((l) => /^\.(ds-[\w-]+)/.exec(l)[1]).filter((n) => CELL.includes(n))

// ---------- 一、样式只有一份 ----------
ck(`那一格那 ${CELL.length} 族样式在 app.wxss 里齐着`,
  CELL.every((c) => new RegExp(`^\\.${c}\\s*(\\{|,)`, 'm').test(APP_WXSS)
    || new RegExp(`^\\.${c}\\s*,`, 'm').test(APP_WXSS) || new RegExp(`^\\.${c}\\s*\\{`, 'm').test(APP_WXSS)),
  CELL.filter((c) => !new RegExp(`^\\.${c}\\s*\\{`, 'm').test(APP_WXSS)).join('、') || '全在')
ck('首页 wxss 里一条都不剩（留着就是第二份真相，下一次只改一处）',
  cellRules(INDEX_WXSS).length === 0, `${cellRules(INDEX_WXSS).join('、')}`)
ck('详情页 wxss 里也没另写一份', cellRules(DETAIL_WXSS).length === 0,
  cellRules(DETAIL_WXSS).join('、'))

// ---------- 二、两页那一段逐字相同 ----------
function cellOf(src) {
  const m = /^(\s*)<view class="ds-rt"/m.exec(src)
  if (!m) return null
  const from = m.index
  const close = `\n${m[1]}</view>`
  const rest = src.slice(from)
  const end = rest.indexOf(close)
  if (end < 0) return null
  return rest.slice(0, end + close.length)
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n')
    // 唯一允许的两处不同：这一篇在首页叫 detailNote、在详情页叫 note；
    // 那四个键里只有"这一篇"的名字跟着页面走，格子本身不许差一个字。
    .replace(/detailNote/g, 'NOTE').replace(/\bnote\b/g, 'NOTE')
}
const A = cellOf(INDEX_WXML)
const B = cellOf(DETAIL_WXML)
ck('两页都找得到那一格', !!A && !!B, `${A ? '首页有' : '首页没有'} / ${B ? '详情页有' : '详情页没有'}`)
ck('那一格在两页里逐字相同（改尺寸、改那两行字、改接线都必须一起改）',
  !!A && !!B && A === B,
  !!A && !!B && A !== B ? `首页\n${A}\n----\n详情页\n${B}` : '')
ck('两态两件事都在：留过卡片画那张缩略图，一张都没有画「+」那一格',
  !!A && /class="ds-pad ds-entry"/.test(A) && /class="ds-empty ds-entry"/.test(A))
ck('私密那一篇整格不渲染（两页同一条口径：服务端也不许私密篇分享）',
  !!A && !!B && /wx:if="\{\{!NOTE\.is_private\}\}"/.test(A) && /wx:if="\{\{!NOTE\.is_private\}\}"/.test(B))
ck('那两行小字吃的是现网字典（不是这一轮新造的串）',
  !!A && /\{\{t\.shareAsImage\}\}/.test(A) && /\{\{t\.noCards\}\}/.test(A) && /\{\{t\.appName\}\}/.test(A))

// ---------- 三、接线：同一个名字，两页都得有实现 ----------
ck('两页那一格绑的是同一个处理函数名（各绑各的名字，上面那条逐字比对就钉不住）',
  (A.match(/catchtap="onCardCell"/g) || []).length === 2
  && (B.match(/catchtap="onCardCell"/g) || []).length === 2,
  `首页 ${A ? (A.match(/catchtap="(\w+)"/g) || []).join('|') : '—'} / 详情页 ${B ? (B.match(/catchtap="(\w+)"/g) || []).join('|') : '—'}`)
ck('首页那一格点开的是成品弹窗（沿用 `_openPosterFor`，不在这里另开一条开窗路）',
  /onCardCell\(\) \{ return this\._openPosterFor\(this\.data\.detailNote, 'sheet'\) \}/.test(INDEX_JS))
ck('详情页那一格：有那张就看大图，没有才去生成（生成过之后这一格自己会翻成缩略图）',
  /onCardCell\(\)[\s\S]{0,400}wx\.previewImage\([\s\S]{0,120}cards\[0\]\.p[\s\S]{0,200}wx\.navigateTo\(\{ url: `\/pages\/share\/share\?id=\$\{note\.id\}` \}/.test(DETAIL_JS))
// 搬家的失败形态就是"屏上有那枚、js 里没那个函数"，所以两页每个接线的动作都点名查一遍。
function unwired(wxmlPath, jsPath, extra) {
  const wxml = read(wxmlPath)
  const js = read(jsPath) + (extra || '')
  const names = [...new Set([...wxml.matchAll(/(?:bind|catch)(?:tap|input|confirm|longpress|change)="([A-Za-z_]\w*)"/g)].map((m) => m[1]))]
  return { total: names.length, missing: names.filter((n) => !new RegExp('(^|[\\s,{])' + n + '\\s*\\(', 'm').test(js)) }
}
for (const [who, w, j, extra] of [
  // 首页那九枚「卡片上的信息」的处理函数是 `...cardInfo.handlers` spread 上去的，
  // 查接线必须把它们算进来（这一把不重复管那份同源，那是 验-名片弹窗两页同源 的活）。
  ['首页', 'miniprogram/pages/index/index.wxml', 'miniprogram/pages/index/index.js', CARD_INFO],
  ['详情页', 'miniprogram/pages/detail/detail.wxml', 'miniprogram/pages/detail/detail.js', ''],
]) {
  const r = unwired(w, j, extra)
  ck(`${who}屏上每一个接线的动作都找得到实现（${r.total} 个）`, r.missing.length === 0, r.missing.join('、'))
}

// ---------- 四、详情页不再有第二个把手 ----------
const bar = (/^\s*<view class="action-bar">[\s\S]*?^\s*<\/view>/m.exec(DETAIL_WXML) || [''])[0]
const barBtns = (bar.match(/class="icon-btn[^"]*"/g) || [])
ck('详情页上方那一排只剩两枚（编辑／删除），第三枚「生成笔记卡片」撤净',
  barBtns.length === 2 && !/primary/.test(bar) && !/shareAsImage/.test(bar),
  barBtns.join(' '))
ck('这一页不再有 onShare（wxml 与 js 两边都不留悬空引用）',
  !/onShare\b/.test(DETAIL_WXML) && !/onShare\s*\(/.test(DETAIL_JS))
ck('详情页里「生成笔记卡片」那一句只出现在那一格（屏上不会两处同名）',
  (DETAIL_WXML.match(/\{\{t\.shareAsImage\}\}/g) || []).length === 1,
  `${(DETAIL_WXML.match(/\{\{t\.shareAsImage\}\}/g) || []).length} 处`)
ck('那一页的分栏还是两列（左标题、右那一格），私密那篇退回单列',
  /^\s*<view class="dt-hero \{\{note\.is_private \? 'solo' : ''\}\}">/m.test(DETAIL_WXML)
  && /class="dt-lt"/.test(DETAIL_WXML) && /\.dt-hero \.dt-lt \{[\s\S]{0,60}flex: 1;/.test(DETAIL_WXSS))

// ---------- 五、两条规则各只有一个出处 ----------
const onePredicate = (detailSrc) => /function aliveFor\(noteId\)/.test(CARD_LOG)
  && !/accessSync/.test(INDEX_JS) && !/accessSync/.test(detailSrc)
  && !/cardLog\.forNote\(/.test(INDEX_JS + detailSrc)
ck('那一格画不画图＝台账里那条**图还在**才算，这条判据只在 cardLog.aliveFor 里写一遍',
  onePredicate(DETAIL_JS))
ck('详情页那一格的读数出在 loadNote 里（从卡片页生成完回来走的就是这一趟，格子当场翻成缩略图）',
  /async loadNote\(id\)[\s\S]{0,3000}detailCards: cardLog\.aliveFor\(note\.id\)/.test(DETAIL_JS))
ck('淡底那格的色走 palette.paleStep，页面里没有第二份函数',
  /function paleStep\(wallpaper\)/.test(PALETTE) && !/function paleStep/.test(INDEX_JS)
  && !/function paleStep/.test(DETAIL_JS))
ck('两页都从当前壁纸现算那一格底色（不是写死一个色号）',
  /paleStep\(/.test(INDEX_JS) && /swatchBg: paleStep\(app\.getWallpaper\(\)\)/.test(DETAIL_JS))
ck('品牌字仍是 poster.BRAND_GLYPH 那一个常量（两页同一个出处）',
  /brandGlyph: poster\.BRAND_GLYPH/.test(INDEX_JS) && /brandGlyph: poster\.BRAND_GLYPH/.test(DETAIL_JS))

// 几何：这一格与卡片那一屏那枚白垫必须是同一个比例，两个数都从 wxss 现读，不抄在尺子里。
const num = (src, sel, prop) => {
  const body = (new RegExp(`\\.${sel} \\{([^}]*)\\}`).exec(src) || [, ''])[1]
  return parseFloat((new RegExp(`${prop}: (\\d+(?:\\.\\d+)?)rpx`).exec(body) || [, 'NaN'])[1])
}
const padW = num(INDEX_WXSS, 'pad', 'width'), padH = num(INDEX_WXSS, 'pad', 'height')
const cellW = num(APP_WXSS, 'ds-pad', 'width'), cellH = num(APP_WXSS, 'ds-pad', 'height')
ck('那一格的白垫与卡片那一屏那枚白垫同比例（等比缩，不是各拍一个数）',
  padW > 0 && Math.abs(cellH / cellW - padH / padW) < 0.01,
  `卡片那屏 ${padW}×${padH}（${(padH / padW).toFixed(4)}） vs 这一格 ${cellW}×${cellH}（${(cellH / cellW).toFixed(4)}）`)
ck('那一列的宽就是白垫的宽（格子不会在列里被挤扁或留白条）',
  num(APP_WXSS, 'ds-rt', 'width') === cellW, `${num(APP_WXSS, 'ds-rt', 'width')} vs ${cellW}`)

// ---------- 六、字典两语齐全（缺一个键屏上就露 undefined） ----------
const zhBlock = (I18N.match(/zh:\s*\{[\s\S]*?\n  \}/) || [''])[0]
const enBlock = (I18N.match(/en:\s*\{[\s\S]*?\n  \}/) || [''])[0]
ck('这一格用到的三个键中英两侧都有',
  ['shareAsImage', 'noCards', 'appName'].every((k) => new RegExp(`\\b${k}:`).test(zhBlock))
  && ['shareAsImage', 'noCards', 'appName'].every((k) => new RegExp(`\\b${k}:`).test(enBlock)),
  ['shareAsImage', 'noCards', 'appName'].filter((k) => !new RegExp(`\\b${k}:`).test(enBlock)).join('、'))

// ---------- 七、成品弹窗那一层不许缓存正文（站长 10-07 真机报：「标题我已经改了，但生图时候还是旧标题」）----------
// 首页的成品弹窗画的是 `this._posterAssets.note`，而 `_ensurePosterAssets` 原来一进来就按
// noteId 整份短路——第一次开过这篇之后，改完标题回到首页再开，画布照画缓存里那份旧字。
// 缓存该留的是**码**（POST 建码 + 下载那张图，重开一次弹窗烧不起），正文必须每次现读。
const ENSURE = (INDEX_JS.match(/async _ensurePosterAssets\(noteId\) \{[\s\S]*?\n  \},/) || [''])[0]
const readsFresh = (src) => {
  const g = src.indexOf('await api.getNote(noteId)')
  const s = src.search(/if \(this\._posterAssets && this\._posterAssets\.noteId === noteId\) return/)
  return g >= 0 && (s < 0 || s > g)
}
ck('成品弹窗每次现读正文（`api.getNote` 排在那句短路前面）',
  !!ENSURE && readsFresh(ENSURE), ENSURE ? '' : '_ensurePosterAssets 找不到了')
ck('缓存只留给码：`createShare` 与下载码仍然只在没缓存那一趟跑',
  /if \(cached\)[\s\S]{0,240}return[\s\S]{0,240}await api\.createShare/.test(ENSURE)
  && /await this\._downloadQR\(share\.token\)/.test(ENSURE))

// ---------- 八、反向自证：这把尺子真的抓得到漂移 ----------
const driftWxss = DETAIL_WXSS + '\n.ds-pad { width: 200rpx; }\n'
ck('反向①：谁在详情页 wxss 里再补一条 .ds-pad，"一条都不许有"这条必须红',
  cellRules(driftWxss).length > 0)
const driftCell = B ? B.replace('mode="aspectFit"', 'mode="aspectFill"') : ''
ck('反向②：把详情页那格的 mode 改一个属性，"逐字相同"这条必须红', !!A && !!driftCell && A !== driftCell)
const driftJs = DETAIL_JS + '\n  onShare() { wx.navigateTo({ url: "/pages/share/share" }) },\n'
ck('反向③：详情页底排那枚的旧实现被谁加回来，"不再有 onShare"这条必须红',
  /onShare\s*\(/.test(driftJs))
const noAlive = DETAIL_JS.replace(/detailCards: cardLog\.aliveFor\(note\.id\)/, 'detailCards: cardLog.forNote(note.id)')
ck('反向④：那一格改回吃裸 forNote（图被清掉也照样画一块白板），上面那条同源判据真的跟着红',
  onePredicate(DETAIL_JS) === true && onePredicate(noAlive) === false)
const shortCircuitAgain = ENSURE.replace('const cached =',
  'if (this._posterAssets && this._posterAssets.noteId === noteId) return\n    const cached =')
ck('反向⑤：把那句整份短路加回去（就是这一轮真机报的那个毛病），"每次现读正文"这条必须红',
  shortCircuitAgain !== ENSURE && readsFresh(shortCircuitAgain) === false)

console.log(`\n${bad.length === 0 ? '全过' : `红 ${bad.length} 条`}`)
bad.forEach((n) => console.log(`  ✗ ${n}`))
process.exit(bad.length ? 1 : 0)
