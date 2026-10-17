// 搜索那一态与输入框那层皮（站长 10-17 夜那两句）。跑法：node docs/工具/验-搜索态与输入框皮.js
//
// 他这两句是一件事的两半，所以两半钉在同一把里：
// ①「搜索完结果，显示结果，上面的搜索框应该依旧显示输入关键字状态，
//    如果点击空白区，就自动清空搜索框，恢复到放大镜状态」
//    ⇒ 病根是 `focus` 直接吃了 `searchOpen`：点开一篇笔记就得先收条子（不然键盘压着详情窗），
//      条子一收、词还留着，而 `onBlankTap` 只看 `searchOpen` 就当场 return ⇒ 清不掉。
//      落法是把"屏上是不是关键字那一态"和"键盘开没开"拆成两枚，点空白那一下两枚一起关、词一起清。
// ②「搜索框太深，笔记分类输入框同样，要改为透明输入框状态。类似，邮箱输入框那种风格，
//    淡淡的框体，还是深色字体」
//    ⇒ 抄的是 `me.wxss` 的 `.me-email-field` 那三条令牌，且**钉的是逐字相等**：
//      两处各写一份"看起来差不多"的淡底，迟早只有一处成立（同一轮里分类新增框就复用这一条件）。
//
// ⚠ 只管结构：条子有没有真在屏上摊开、点空白那一下真清掉词、淡边画没画出来，是 IDE 那一把的事
//   （`验-搜索态与输入框皮-真跑.js` 这轮没写，按站长"最小验收"那条不自己加第二轮）。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const rd = (f) => fs.readFileSync(f, 'utf8')
const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  .replace(/<!--[\s\S]*?-->/g, '')

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— 实得：' + extra : ''))
}

const WXML = strip(rd(P('pages/index/index.wxml')))
const JS = strip(rd(P('pages/index/index.js')))
const WXSS = strip(rd(P('pages/index/index.wxss')))
const ME = strip(rd(P('pages/me/me.wxss')))
const BAR = strip(rd(P('custom-tab-bar/index.wxss')))

// 方法体：从定义那一行的行首起，到下一个两空格缩进的 `}` 为止。
// ⚠ 锚点给整行定义，不给光秃秃的方法名——那会锚到第一个调用点上。
const seg = (src, head) => {
  const i = src.indexOf(head)
  if (i < 0) return ''
  const j = src.indexOf('\n  }', i)
  return j < 0 ? '' : src.slice(i, j)
}
// 一条 CSS 规则的体（同名选择器可能出现多处 ⇒ 全取，任一命中即算）。
const rules = (src, sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...src.matchAll(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1])
}
const one = (src, sel) => rules(src, sel).join('\n')

// ---------- 1. 状态拆成两枚：条子（searchOpen）与键盘（searchFocus） ----------
ok('data 里两枚各管一件事，初值都是关',
  /searchOpen: false,/.test(JS) && /searchFocus: false,/.test(JS))
ok('键盘那一枚只由 `<input focus>` 读，条子那一枚不再兼任（原来 `focus="{{searchOpen}}"` 就是病根）',
  /focus="\{\{searchFocus\}\}"/.test(WXML) && !/focus="\{\{searchOpen\}\}"/.test(WXML))
ok('点开搜索那一下同时给两枚：条子摊开、键盘起来',
  /setData\(\{ searchOpen: true, searchFocus: true \}\)/.test(seg(JS, 'onOpenSearch()')))

// ---------- 2. 点笔记：条子与词都留着，只收键盘 ----------
const row = seg(JS, 'async onRowTap(e) {')
ok('点行不再收条子（他要的是"显示结果时依旧显示输入关键字状态"）',
  !/searchOpen: false/.test(row) && row.length > 400, row.slice(0, 60))
ok('点行只收键盘——否则详情窗被键盘压着一半',
  /if \(this\.data\.searchFocus\) this\.setData\(\{ searchFocus: false \}\)/.test(row))

// ---------- 3. 点空白：清词、收条子、重拉未搜那一份 ----------
const blank = seg(JS, 'async onBlankTap() {')
ok('点空白的闸看的是"条子开着**或**还有词"，不是只看 searchOpen',
  /if \(!this\.data\.searchOpen && !this\.data\.searchKeyword\) return/.test(blank))
ok('那一下把两枚状态与词一起清掉，并重拉列表（`loadNotes(true)`，回到未搜那一屏）',
  /setData\(\{ searchOpen: false, searchFocus: false, searchKeyword: '' \}\)/.test(blank)
  && /this\.loadNotes\(true\)/.test(blank))
ok('管理态仍排在搜索前面判（点空白那一下先存分类，不会两头都办事）',
  /if \(this\.data\.catEdit\) \{/.test(blank) && blank.indexOf('catEdit') < blank.indexOf('searchKeyword'))
// 反向钉：旧写法"只看 searchOpen 就 return"一旦回来，收起条子留着词那一屏就又卡死了
ok('旧的"只看条子就 return"不许回来', !/if \(!this\.data\.searchOpen\) return/.test(blank))

// ---------- 4. 其余两个会"收条子留词"的口，必须连带收键盘 ----------
const catSel = seg(JS, 'selectCategory(e) {')
const manage = seg(JS, 'onCatManageTap() {')
ok('点分类那一枚：照旧收条子不清词（他这轮只点"点开笔记返回"那一条），但键盘跟着收',
  /searchOpen: false, searchFocus: false/.test(catSel) && !/searchKeyword: ''/.test(catSel))
ok('进管理态：条子与键盘一起收（管理态与搜索条两立，词仍留给 ✕ 与点空白清）',
  /searchOpen: false,\n\s*searchFocus: false,/.test(manage) && !/searchKeyword: ''/.test(manage))
ok('✕ 那一枚仍是"只清词、不收条子"（他 10-03 那版口径没动）',
  /setData\(\{ searchKeyword: '' \}\)/.test(seg(JS, 'clearSearch()')))

// ---------- 5. 那层皮：透明淡底＋一道淡边＋深色字，且与邮箱那一格同一份数 ----------
const srch = one(WXSS, '.srch')
const email = one(ME, '.me-email-field')
ok('.srch 不再吃派生的深色面（`--chrome-bg`／`--chrome-ink` 一条都不留）',
  !/var\(--chrome-bg\)/.test(srch) && !/var\(--chrome-ink\)/.test(srch))
ok('.srch 三条＝淡底 `--chip-idle` ＋ inset 一道 `--w-edge`/`--card-edge` ＋ 深色字 `--text-primary`',
  /background: var\(--chip-idle\)/.test(srch)
  && /box-shadow: inset 0 0 0 var\(--w-edge\) var\(--card-edge\)/.test(srch)
  && /color: var\(--text-primary\)/.test(srch))
ok('与「我的」页那格邮箱输入框**逐字同一组令牌**（"类似邮箱那种风格"要的是同一个出处，不是像）',
  /background: var\(--chip-idle\)/.test(email)
  && /box-shadow: inset 0 0 0 var\(--w-edge\) var\(--card-edge\)/.test(email)
  && srch.match(/var\(--chip-idle\)|var\(--card-edge\)|var\(--w-edge\)|var\(--text-primary\)/g).length
  === email.match(/var\(--chip-idle\)|var\(--card-edge\)|var\(--w-edge\)|var\(--text-primary\)/g).length)
ok('原来那圈 2rpx 透明描边撤了（有了 inset 淡边就不止一层边）', !/border: 2rpx solid/.test(srch))
ok('占位字走三级深色字、仍不靠 opacity（input 的 placeholder 不吃 opacity，10-04 那条坑）',
  /color: var\(--text-tertiary\)/.test(one(WXSS, '.srch-ph'))
  && !/opacity/.test(one(WXSS, '.srch-ph')))
ok('高度那一档没跟着动：条子仍 60rpx（他这句只说皮，没说几何）',
  /height: 60rpx/.test(srch))

// ---------- 6. 撤皮撤出来的两件事：这一页不再读那一场变量、底栏那一处不许跟着少 ----------
ok('这一页整页不再读 `--chrome-*`（面、字、占位三处一起换掉才是"透明输入框"）',
  !/var\(--chrome-/.test(WXSS) && !/var\(--chrome-/.test(WXML))
ok('js 里那一串派生皮与它的调用一起撤净（留着就是没人读的一串字符）',
  !/searchSkin:/.test(JS) && !/chromeOf\(/.test(JS))
ok('底栏那一块面照旧吃 `--chrome-bg`（"去掉"只覆盖他指的这两处输入框）',
  /var\(--chrome-bg\)/.test(BAR))

if (fails.length) {
  console.log(`✗ ${fails.length} 条红（${pass} 条绿）`)
  fails.forEach((f) => console.log('  ' + f))
  process.exit(1)
}
console.log(`✓ ${pass} 条全绿`)
