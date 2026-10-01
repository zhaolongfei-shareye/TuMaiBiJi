// 笔记列表 D2 优化这一批的静态尺子（不连模拟器，纯读文件 + 现算 palette）。
// 跑法：node docs/工具/验-列表D2.js
// 要守的东西：① 底栏/搜索条那块色由壁纸派生，八枚逐一对规划 §1.2 那张表，且值只能从函数来；
// ② 行卡撤掉左侧方块之后，分类身份那两档字压卡底要过门槛（浅 5 / 深 7）；
// ③ 被裁的只能是标签串，分类名和日期不许被裁；④ 圆角、字阶、三个文字标签一个没动。
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

const idxWxml = fs.readFileSync(P('pages/index/index.wxml'), 'utf8')
const idxWxss = fs.readFileSync(P('pages/index/index.wxss'), 'utf8')
const idxJs = fs.readFileSync(P('pages/index/index.js'), 'utf8')
const barWxml = fs.readFileSync(P('custom-tab-bar/index.wxml'), 'utf8')
const barJs = fs.readFileSync(P('custom-tab-bar/index.js'), 'utf8')
const barWxssRaw = fs.readFileSync(P('custom-tab-bar/index.wxss'), 'utf8')
// 注释里引用旧值当线索（那七处 rgba(255,255,255,.42)），扫硬编码之前先剥掉注释
const barWxss = barWxssRaw.replace(/\/\*[\s\S]*?\*\//g, '')
const p = require(P('utils/palette.js'))

// CSS 声明扫的是"这一个类自己那一段"，别的类里写了什么不算
const rule = (src, sel) => {
  const m = new RegExp(`\\.${sel}\\s*\\{([^}]*)\\}`).exec(src)
  return m ? m[1] : ''
}
const appWxss = fs.readFileSync(P('app.wxss'), 'utf8')
const appWxssRule = (sel) => rule(appWxss, sel)

const WALLS = ['default', 'gradient-blue', 'gradient-green', 'gradient-sunset',
  'gradient-purple', 'gradient-ocean', 'tint-paper', 'tint-celadon']

// ---------- 1. 那块派生色：八枚对表 §1.2 ----------
// 表是"对答案"用的，不是取色来源：值一律由 chromeOf 现算，比完还得证明代码里没有这张表。
const DOC_12 = {
  default: '#443C25', 'gradient-blue': '#1D284C', 'gradient-green': '#23462C',
  'gradient-sunset': '#4C2D1D', 'gradient-purple': '#2D2D6C', 'gradient-ocean': '#2A4B6F',
  'tint-paper': '#443A25', 'tint-celadon': '#25442B',
}
WALLS.forEach((w) => {
  const got = p.chromeOf(w).bg.toUpperCase()
  ok(`${p.themeOf(w).label} 的派生色对表`, got === DOC_12[w], `${got} vs ${DOC_12[w]}`)
})
// 大写归一这条不是洁癖：hex 比对时 #443c25 和 #443C25 会判成"八枚全不符"，
// 上一轮就红过一次，红得毫无意义。
ok('比对前两边都归一大写（不然同一个色会判成不符）',
  p.chromeOf('default').bg !== p.chromeOf('default').bg.toUpperCase()
  || p.chromeOf('default').bg.toUpperCase() === DOC_12.default)

const thin = []
WALLS.forEach((w) => {
  const c = p.chromeOf(w)
  const r = p.crOf(c.bg, '#F2EFE9')
  if (r < 7) thin.push(`${p.themeOf(w).label} ${r.toFixed(2)}`)
})
ok('纸白字压这八块面都 ≥ 7', thin.length === 0, thin.join(' | '))

const idleBad = []
WALLS.forEach((w) => {
  const c = p.chromeOf(w)
  const alpha = Number(/([\d.]+)\)$/.exec(c.idle)[1])
  if (alpha < 0.6) idleBad.push(`${p.themeOf(w).label} ${alpha}`)
})
ok('未选中那一档 alpha 不低于 .6（浅 .62 / 深 .68）', idleBad.length === 0, idleBad.join(' | '))

// ---------- 2. 颜色只能从函数来，两个文件里不许有那张表 ----------
WALLS.forEach((w) => {
  const hex = DOC_12[w]
  ok(`派生色 ${hex} 没被抄进列表页样式`, !new RegExp(hex, 'i').test(idxWxss))
  ok(`派生色 ${hex} 没被抄进底栏样式`, !new RegExp(hex, 'i').test(barWxss))
})
ok('底栏和搜索条吃的是同一串 --chrome-*',
  /var\(--chrome-bg\)/.test(barWxss) && /var\(--chrome-bg\)/.test(idxWxss))
ok('底栏那一块面由 chromeOf 递进来', /chromeOf\(/.test(barJs) && /style="\{\{chromeStyle\}\}"/.test(barWxml))
ok('搜索条每次进页重算，不吃模块加载那一次的兜底',
  /const wallpaper = app\.getWallpaper\(\)/.test(idxJs)
  // 09-28 深夜起多一个条件：头部铺了图就整串不发，让 CSS 那条"图上换纸白"生效
  && /searchSkin: bgSrc \? '' : chromeOf\(wallpaper\)\.style/.test(idxJs))
ok('搜索条不再是一支固定的蓝（toneStyle 在这个页面已经不用了）',
  !/toneStyle\(/.test(idxJs), (idxJs.match(/toneStyle\([^)]*\)/g) || []).join(' '))
ok('占位符给带 alpha 的色，不靠 opacity（textarea/input 的 placeholder 不吃 opacity）',
  !/\.sc-ph\s*\{[^}]*opacity/.test(idxWxss) && /--chrome-idle/.test(rule(idxWxss, 'sc-ph')))

// ---------- 3. 行卡：方块撤了，分类身份退到 meta 行 ----------
ok('左侧那块 176 方块已经从行卡撤掉', !/class="blk"/.test(idxWxml) && !/blockSkinFor/.test(idxJs))
ok('分类身份改吃 catSkinFor', /catSkinFor\(n\.category_id, wallpaper\)/.test(idxJs))
ok('点色和字色由 style 递进来，wxss 里没有分类色',
  /--cat-dot:\$\{s\.dot\};--cat-ink:\$\{s\.text\}/.test(idxJs) && !/#[0-9a-fA-F]{6}/.test(rule(idxWxss, 'cat')))
ok('meta 行那三个字的颜色抬到 --text-secondary',
  /var\(--text-secondary\)/.test(rule(idxWxss, 'row-foot')))
// ③ 谁被裁：分类名和日期永不裁，被裁的只有标签串
ok('分类那段 flex:none（永不先被裁）', /flex:\s*none/.test(rule(idxWxss, 'cat')))
ok('日期那段 flex:none 并推到右边', /flex:\s*none/.test(rule(idxWxss, 'dt')) && /margin-left:\s*auto/.test(rule(idxWxss, 'dt')))
ok('被裁的是标签段（min-width:0 + 省略号）',
  /min-width:\s*0/.test(rule(idxWxss, 'tg')) && /text-overflow:\s*ellipsis/.test(rule(idxWxss, 'tg')))
ok('标签不再顶替分类名（blockName 那条已从列表页拿掉）', !/blockName/.test(idxJs) && /catLabel/.test(idxJs))

// ---------- 4. 分类两档压卡底：浅 5 / 深 7 ----------
const CAT_IDS = [null, 0, 1, 2, 3, 4, 7, 12]
WALLS.forEach((w) => {
  const dark = p.themeOf(w).dark
  const need = dark ? 7 : 5
  const bad = []
  CAT_IDS.forEach((id) => {
    const s = p.catSkinFor(id, w)
    const r = p.crOf(s.text, s.card)
    if (r < need) bad.push(`${id}=${r.toFixed(2)}`)
  })
  ok(`${p.themeOf(w).label} 六档分类字压卡底 ≥ ${need}`, bad.length === 0, bad.join(' '))
})
ok('深色两枚的未分类是空心环',
  p.catSkinFor(null, 'gradient-purple').ring === true && p.catSkinFor(null, 'gradient-ocean').ring === true)
ok('浅色六枚的未分类是实心点',
  p.catSkinFor(null, 'default').ring === false && p.catSkinFor(null, 'tint-paper').ring === false)
ok('空心环那条规则在样式里（CSS 有规则 + WXML 有绑定，缺一即红）',
  /\.cat\.is-ring \.cat-dot\s*\{[^}]*background:\s*transparent/.test(idxWxss)
  && /cat \{\{item\.catRing \? 'is-ring' : ''\}\}/.test(idxWxml))
// 效果图认下来的一条：浅卡上那枚点不单独达标（芥末黄压白卡 1.63），因为紧挨着的分类名过了门槛。
// 这里钉住"点还是原色"，防止哪天有人把它改成派生值、六个分类挤成三种深浅。
ok('浅壁纸下点色留原色（芥末黄那枚 1.63 是效果图认下的，见标注①）',
  p.catSkinFor(0, 'default').dot.toUpperCase() === p.TONES[0].bg.toUpperCase())
ok('深壁纸下点与字同值（原色在那块卡上会化掉）',
  p.catSkinFor(1, 'gradient-purple').dot === p.catSkinFor(1, 'gradient-purple').text)

// ---------- 5. 一个没动：圆角、字阶、三个文字标签、方块在别的页还在 ----------
ok('卡片圆角还是那三档', /--r-card: 40rpx/.test(fs.readFileSync(P('app.wxss'), 'utf8'))
  && /--r-pill: 999rpx/.test(fs.readFileSync(P('app.wxss'), 'utf8'))
  && /--r-btn: 16rpx/.test(fs.readFileSync(P('app.wxss'), 'utf8')))
ok('胶囊圆角/高度/位置逐值没动',
  /border-radius: 44rpx/.test(barWxss) && /height: 108rpx/.test(barWxss) && /bottom: 20rpx/.test(barWxss))
// 站长 10-01 晚：底栏三个按钮去掉文字，选中态从"文字下面一条短线"改成"图标垫一枚圆底"。
// 所以原来钉"标签全留"和"是短线不是垫块"这两条一起作废——现在要守的变成：
// 三个槽一个不少、名字仍然跟着语言走（只是挪到 aria-label 上）、三枚形状互不重复。
ok('三个槽都在，标签名跟着语言走、只出现在 aria-label 上',
  (barWxml.match(/class="tab-icon/g) || []).length === 1
  && /glyph-\{\{item\.icon\}\}/.test(barWxml) && /aria-label="\{\{item\.text\}\}"/.test(barWxml)
  && ['tabCreate', 'tabNotes', 'tabMe'].every((k) => barJs.includes(k))
  && !/tab-label|tab-mark/.test(barWxss + barWxml))
ok('三枚图形各有各的 mask，不重复也不缺（plus / rows3 / user）',
  ['glyph-plus', 'glyph-rows3', 'glyph-user'].every((c) => barWxss.includes('.' + c + '::before {'))
  && (barWxss.match(/-webkit-mask-image/g) || []).length === 3)
ok('选中态就是那枚圆底，未选中整个透明（切 tab 只有这一件事在变）',
  /\.tab-item\.active \.tab-icon \{\s*background: var\(--chrome-sel\)/.test(barWxss)
  && /\.tab-icon \{[\s\S]*?background: transparent/.test(barWxss))
ok('三格等宽、图标居中（去文字之后不再有"标签宽度差"这种抖）',
  /\.tab-item \{\s*flex: 1/.test(barWxss) && /justify-content: center/.test(barWxss))
// 这一行还是 21rpx 那一档：页面里那串覆盖不重写 font-size，字号仍由 app.wxss 那条给
ok('meta 行字阶仍是 --fs-tiny（21rpx 那一档）',
  /font-size: var\(--fs-tiny\)/.test(appWxssRule('row-foot')) && !/font-size/.test(rule(idxWxss, 'row-foot')))
// 方块这套在详情页、分类管理、分享页还在用，列表撤掉不等于可以把它从 palette 删了
ok('blockSkinFor 仍在 palette 里（别的页还在用方块）', typeof p.blockSkinFor === 'function')

console.log(fails.map((f) => '✗ ' + f).join('\n'))
console.log(`\n${pass}/${pass + fails.length} 过`)
process.exit(fails.length ? 1 : 0)
