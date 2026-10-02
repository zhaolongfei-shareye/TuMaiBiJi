// 笔记列表这一屏的静态尺子（不连模拟器，纯读文件 + 现算 palette）。
// 跑法：node docs/工具/验-列表D2.js
// 文件名留着是因为它守的还是同一屏，但 10-02 夜里 v18 那一轮把 D2 的画法整块换掉了：
// 「点 + 分类名 + meta 行 + 手风琴」这套前提没了，现在这一屏是"左时间轴 + 右纸片墙 / 一行"。
// 所以第 3 节整节跟着改口（旧那几条判据的前提已经不存在，留着就是自己钉死自己的假红/假绿），
// 第 1、2、4、5 节守的东西一条没动：底栏与搜索那块派生色、分类两档压卡底的门槛、
// 圆角字阶与底栏三枚图形。
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
  !/\.srch-ph\s*\{[^}]*opacity/.test(idxWxss) && /--chrome-idle/.test(rule(idxWxss, 'srch-ph')))

// ---------- 3. v18 这一屏：左时间轴 + 右纸片墙 / 一行 ----------
// 数从 index.js 那组常量来，也从 wxss 来——两边对不上就是"效果图与代码不同口径"那一类坑。
const num = (src, name) => Number(new RegExp(`const ${name} = (\\d+)`).exec(src)[1])
const PER = num(idxJs, 'PER'), XS = num(idxJs, 'XS'), YS = num(idxJs, 'YS')
const NOTE_H = num(idxJs, 'NOTE_H'), ROW_H = num(idxJs, 'ROW_H'), GAP = num(idxJs, 'GROUP_GAP')
const noteRule = rule(idxWxss, 'note'), rwRule = rule(idxWxss, 'rw')
const railRule = rule(idxWxss, 'rail'), catsRule = rule(idxWxss, 'cats')
const pinbRule = rule(idxWxss, 'pinb')
ok('一枚纸片 150×200、圆角 22、内缩 16/14，JS 常量与样式逐字同一份数',
  /width: 150rpx/.test(noteRule) && /height: 200rpx/.test(noteRule) && NOTE_H === 200
  && /border-radius: 22rpx/.test(noteRule) && /padding: 16rpx 14rpx/.test(noteRule))
ok('横向步 142 只压右边那 14 的内白（一枚都不遮另一枚的字）、纵向步 176 压掉底边 24',
  XS === 142 && YS === 176 && XS + 8 === 150 && YS + 24 === NOTE_H)
ok('排布三档都在 8 的模数上（月档空 56、一行 88），不是各拍一个数',
  GAP % 8 === 0 && ROW_H % 8 === 0 && GAP === 56 && ROW_H === 88)
// z 取整这条是效果图那轮真踩过的坑：1 + y/10 出 18.6 会被整条丢掉，
// 丢掉之后只有第一行拿到 z-index，反倒盖住后面所有行。
ok('z-index 取整（小数会被整条丢掉，届第一行盖住后面所有行）',
  /z: 1 \+ Math\.round\(jy \/ 10\)/.test(idxJs))
// 这条原来钉的是 `if (dk !== prev || col >= PER)` 那一支单趟扫法——**它本身就是个 bug**：
// 服务端回来的顺序是「置顶在前、其余按日期倒序」，同一个日期的两篇会被置顶那篇插开，
// 扫到第三篇时 dk 变了就另起一行，于是同一天摊在两行上（真跑那把自己撞出来的，
// 见 验-列表v18-真跑.js「同一日期的纸片必在同一行」）。现在先按日期归堆再排行，
// 所以这里钉的是新那两支，并把旧写法反向钉住——它回来一次，同一天就再摊一次。
ok('同一日期必同一行（先按日期归堆，不按前后相邻判）、一行满 4 枚往下一行续、不同日期必另起一行',
  /const byDay = new Map\(\)/.test(idxJs) && /if \(k === 0\) \{ if \(cells\.length\) row \+= 1; col = 0 \}/.test(idxJs)
  && /else if \(col >= PER\) \{ row \+= 1; col = 0 \}/.test(idxJs) && PER === 4
  && !/if \(dk !== prev \|\| col >= PER\)/.test(idxJs))
// 同一族坑在"月"这一层又踩了一次（10-03 那把真跑撞的）：月份原来按"前后相邻成段"切，
// 库里四篇全在九月时看不出差别，一旦造出两篇 10/03 的笔记，两篇置顶的九月笔记就会把
// 十月那两篇夹在中间，时间轴上画出 26/09 → 26/10 → 又一块 26/09。改成与日期同一族写法。
ok('一个月在时间轴上只有一块（月份那一层也按聚堆切，不按前后相邻成段切）',
  /const byMonth = new Map\(\)/.test(idxJs) && /if \(!byMonth\.has\(mk\)\) \{/.test(idxJs)
  && !/if \(!gs\.length \|\| gs\[gs\.length - 1\]\.mk !== mk\)/.test(idxJs))
// ③④：置顶这一档和 chips 都在 scroll-view 之外（不跟着月份滚），
// 而且 chips 的可滚区间从时间轴右侧才起排。
ok('分类那一整行在滚动区之外（③：置顶永远看得见，不跟月份滚）',
  idxWxss.indexOf('.cats') < idxWxss.indexOf('.list')
  && /<view class="cats">/.test(idxWxml) && idxWxml.indexOf('class="cats"') < idxWxml.indexOf('class="list"'))
ok('置顶那一档宽 126 = 时间轴那一列（④：chips 只能从这一列右侧起排）',
  /width: 126rpx/.test(pinbRule) && /width: 126rpx/.test(railRule))
ok('分类行与笔记区之间那条浅虚线（⑤）',
  /border-bottom: 2rpx dashed rgba\(35, 37, 44, 0\.14\)/.test(catsRule))
ok('一行模式两条之间那条横线撤了（只靠 88 行高分）',
  !/border/.test(rwRule) && /height: 88rpx/.test(rwRule))
// ②那处改口讲的是"这篇打哪儿来"，跟排布无关：昵称那一截两档都得有，
// 但在行里不许抢标题的宽（标题才是 flex:1 + min-width:0 那一个，长昵称自己截断）。
ok('一行模式也挂昵称，且那一截不抢标题的宽',
  /class="rows"[\s\S]*?class="note-who" wx:if="\{\{c\.who\}\}"/.test(idxWxml)
  && /flex: none/.test(rule(idxWxss, 'rw .note-who')))
// ①：一屏上只剩一种状态标记。
ok('唯一的状态标记就是「已分享」那一小块（三枚属性小 ICON 全撤）',
  (idxWxml.match(/shared-tag/g) || []).length === 2 && !/glyph-(star|plane|sprout)/.test(idxWxss + idxWxml))
ok('置顶不再在每一条上挂标记（这件事由分类行左边那一档说）',
  !/class="pin"/.test(idxWxml) && /t\.pinFilter/.test(idxWxml))
// ②：昵称只在转存那篇出现，头像用通用 ICON 而不是真图。
ok('昵称只在"这篇是转存来的"时递进来（自己分享出去的那篇不画自己的名字）',
  /n\.is_import = n\.source_type === 'share_import'/.test(idxJs)
  && /n\.who = n\.is_import \? \(n\.share_author_name \|\| ''\) : ''/.test(idxJs))
ok('头像是一枚 CSS 画的通用 ICON，这一页不引头像图',
  /\.glyph-who::before/.test(idxWxss) && /\.glyph-who::after/.test(idxWxss)
  && !/\.glyph-who\s*\{[^}]*background-image/.test(idxWxss))
// 日期两档都从 utils/date.js 出，不在页面里抄第二份补零逻辑。
ok('日期两档（纸片 MM/DD、时间轴 YY/MM）都走 utils/date.js',
  /formatShortDate\(n\.created_at\)/.test(idxJs) && /formatYearMonth\(n\.created_at\)/.test(idxJs)
  && !/padStart/.test(idxJs))
// 两档排布都不就地展开：摘要在详情窗里，月分组是定高摆的。
ok('列表里没有"就地展开"这一态（点一枚=开详情窗，两档同一交互）',
  !/openIdx/.test(idxJs + idxWxml) && /this\._openDetail\(idx\)/.test(idxJs))
ok('排布档是本机偏好，键名 listMode，不混进任何请求',
  /const LIST_MODE_KEY = 'listMode'/.test(idxJs) && /wx\.setStorageSync\(LIST_MODE_KEY, mode\)/.test(idxJs)
  && !/listMode/.test(require(P('utils/api.js'))))
ok('莫兰迪那四枚只在 palette 活一份，没抄进样式表',
  p.PAPERS.every((x) => !new RegExp(x.bg, 'i').test(idxWxss))
  && p.PAPERS.every((x) => !new RegExp(x.ink, 'i').test(idxWxss)))
ok('纸片取色吃序号不吃 id（拿 id 取模会让两个分类撞成同一枚）',
  /paperSkinFor\(n\.category_id == null \? 0 : posOf\[n\.category_id\]\)/.test(idxJs)
  && /posOf\[c\.id\] = i \+ 1/.test(idxJs))
ok('未分类钉第一枚（炭灰蓝），真分类在第一枚之外循环',
  p.paperSkinFor(0).bg === p.PAPERS[0].bg && p.paperSkinFor(4).bg !== p.PAPERS[0].bg
  && p.paperSkinFor(1).bg === p.PAPERS[1].bg)
ok('「已分享」那块压得住白字（对比 ≥ 4.5，色值只在 palette 一份）',
  p.crOf(p.SHARED_TAG.ink, p.SHARED_TAG.bg) >= 4.5
  && !/shared-tag\s*\{[^}]*(background|color):/.test(idxWxss.replace(/\s+/g, ' ')))
// 左块那一套（点 + 分类名 + meta 行）整块退了，但两档色仍要给详情窗用，不许顺手删函数。
ok('D2 那一排（点 + 分类名 + meta 行）从列表退了，分类两档仍从 palette 递进详情窗',
  !/class="cat[ "]/.test(idxWxml) && !/catLabel|tagLine|catRing/.test(idxJs + idxWxml)
  && /color: var\(--cat-ink\)/.test(rule(idxWxss, 'ds-tag')))
ok('未分类那枚空心环不再有主人（列表不画点了），样式与绑定一起撤净',
  !/is-ring/.test(idxWxss + idxWxml) && typeof p.catSkinFor(null, 'gradient-purple').ring === 'boolean')

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
// 空心环那条（深色壁纸下未分类换成一圈描边）10-02 v18 起在列表里没有主人了——
// 上面第 3 节钉的是"样式与绑定一起撤净"，这里只钉 palette 那个字段还在（别的页还读它）。
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
