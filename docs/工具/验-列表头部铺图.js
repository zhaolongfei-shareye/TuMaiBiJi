// 笔记列表"整页铺图 + 一条笔记一个框"这一批的静态尺子（不连模拟器，纯读文件）。
// 跑法：node docs/工具/验-列表头部铺图.js
// 要守的东西：① 图和新建页同一个取图口、同一个开关，这一页不再开第二个上传入口；
// ② 图贯穿全屏，列表这一层只有行卡那一个框——不许再有第二圈描边，那是"两层框"的成因；
// ③ 压暗那一串必须和新建页同一条；④ 关掉开关这一屏必须一字不差回到 D2；
// ④ 界面上每一句提到这张图范围的话，都要跟着改成"首页 + 笔记页头部"。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const read = (rel) => fs.readFileSync(P(rel), 'utf8')

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— ' + extra : ''))
}

const wxml = read('pages/index/index.wxml')
const wxssRaw = read('pages/index/index.wxss')
const wxss = wxssRaw.replace(/\/\*[\s\S]*?\*\//g, '')
const cjs = read('pages/index/index.js')
const i18n = read('utils/i18n.js')
const createWxss = read('pages/create/create.wxss')

// 选择器必须顶到行首才算"这一段自己"，但同一个选择器可能出现在两处：
// `.container.has-bg .sheet` 既是四条并列抬层规则的最后一条，又是纸自己那一条。
// 所以给 seg 再带一个 hint，命中多段时挑含关键字的那一段。
const seg = (src, sel, hint) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const all = [...src.matchAll(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1])
  if (!all.length) return ''
  return hint ? (all.find((b) => b.includes(hint)) || '') : all[0]
}

// ---------- 1. 结构 ----------
ok('这一页铺了 <image> 组件（wxss 的 background-image 不认包内本地文件）',
  /<image wx:if="\{\{bgSrc\}\}" class="page-bg" src="\{\{bgSrc\}\}" mode="aspectFill" \/>/.test(wxml))
ok('有压暗罩那一层', /<view wx:if="\{\{bgSrc\}\}" class="page-scrim"><\/view>/.test(wxml))
ok('铺图时容器带 has-bg', /\{\{bgSrc \? 'has-bg' : ''\}\}/.test(wxml))
ok('列表被包进那一层里（铺图时靠它抬层序）',
  /<view class="list-layer">[\s\S]*class="notes-list"/.test(wxml))
ok('三个状态（加载/空/列表）都在这一层里，一个都没落在外面',
  (wxml.match(/class="(loading|empty|notes-list)"/g) || []).length === 3
  && wxml.indexOf('class="list-layer"') < wxml.indexOf('class="loading"'))

// ---------- 2. 取图口只有一个 ----------
ok('取图走 poster.homeBg()，和新建页是同一个函数',
  /const bgSrc = poster\.homeBg\(\)/.test(cjs) && /\n {6}bgSrc,/.test(cjs))
// 内联的自定义属性优先级高于任何选择器：铺图那一态必须整串不发，
// 否则 CSS 里那三行"图上换纸白"一行都翻不动（真跑第一版就是这么红的）。
ok('铺图时那串 chrome 变量整串不发（searchSkin 留空）',
  /searchSkin: bgSrc \? '' : chromeOf\(wallpaper\)\.style/.test(cjs))
ok('这一页不出现选图接口（一个功能只留一个入口）', !/chooseMedia|chooseImage/.test(cjs))
ok('这一页不出现"写死的图片路径"', !/['"]\/assets\/home-bg/.test(cjs + wxml))
ok('data 里 bgSrc 起手是空串（模块加载时存储还没读）', /bgSrc: ''/.test(cjs))
ok('导航条只在铺图时刷墨色',
  /if \(this\.data\.bgSrc\) \{\s*wx\.setNavigationBarColor\(\{[^}]*#181a20/.test(cjs))
ok('墨色那一档和新建页是同一个值',
  /#181a20/.test(read('pages/create/create.js')) && /#181a20/.test(cjs))

// ---------- 3. 图贯穿全屏，列表这一层不许有第二个框 ----------
const bg = seg(wxss, '.page-bg')
const scrim = seg(wxss, '.page-scrim')
ok('图和罩都是 fixed（滚到哪儿都在原地，动的是卡片）',
  /position: fixed/.test(bg) && /position: fixed/.test(scrim))
ok('图铺满整个视口（100vh，不再是头部那一段）',
  /height: 100vh/.test(bg) && /top: 0/.test(bg) && !/height: 700rpx/.test(bg))
ok('罩层同高', /height: 100vh/.test(scrim))
ok('图在 0、罩在 1（顺序不能反，否则卡片会被图盖住）',
  /z-index: 0/.test(bg) && /z-index: 1/.test(scrim))
// 两页压的是同一张图、同一个视口：明暗得是一个连续体，否则切 tab 时背景跳一档
const gradOf = (src) => (/(?:^|\n)\.page-scrim\s*\{[\s\S]*?background: (linear-gradient\([^;]*\))/.exec(src) || [])[1]
const gHere = (gradOf(wxssRaw) || '').replace(/\s+/g, ' ').trim()
const gThere = (gradOf(createWxss) || '').replace(/\s+/g, ' ').trim()
ok('压暗那一串和新建页逐字相同', !!gHere && gHere === gThere,
  `${gHere.slice(0, 34)}… vs ${gThere.slice(0, 34)}…`)
// 口径是"那个叫 .sheet 的类整个没了"，不是"不许出现 sheet 这串字母"——
// v7 之后的浮窗类叫 .float-sheet / .tpl-sheet，跟"纸"那个类无关。
ok('列表那一层不再自称"纸"（.sheet 这个类整个没了）',
  !/\.sheet(?![\w-])/.test(wxml + wxssRaw),
  (wxssRaw.match(/\.[\w-]*sheet\w*/g) || []).join(','))
ok('列表层只剩层序，自己不画任何面（一条笔记一个框）',
  !/(?:^|\n)\.list-layer\s*\{/.test(wxss)
  && !/\.container\.has-bg \.list-layer\s*\{[^}]*(background|border)/.test(wxss))
ok('头部三块 + 那一行工具 + 列表层一起抬到罩之上',
  /\.container\.has-bg \.page-head,[\s\S]{0,320}?\.container\.has-bg \.list-layer\s*\{[^}]*position: relative[^}]*z-index: 2/.test(wxss)
  && /\.container\.has-bg \.head-tools/.test(wxss))

// ---------- 5. 压在图上的那三块面 ----------
// 09-30 v8：搜索条收成分类行最右那一枚圆钮，两块面共用同一条翻色规则。
// 分成两条各写一份 #f2efe9 迟早走样（这个项目为这类事已经红过好几轮），
// 所以这里钉的是"两个选择器在同一条规则里"，而不是"两处都恰好是那个值"。
const chromeBlock = seg(wxss, '.container.has-bg .sc-btn', '--chrome-bg')
ok('搜索条与那枚圆钮吃同一条翻色规则（纸白面 + 墨字）',
  /\.container\.has-bg \.sc-card,\s*\n\.container\.has-bg \.sc-btn\s*\{/.test(wxss)
  && /--chrome-bg: #f2efe9/.test(chromeBlock) && /--chrome-ink: #23252c/.test(chromeBlock))
ok('翻的是变量不是逐条覆盖（子元素一条都不用改）',
  !/\.container\.has-bg \.sc-input\s*\{/.test(wxss) && !/\.container\.has-bg \.sc-go\s*\{/.test(wxss))
ok('搜索条在图上有一条投影，和录入胶囊同档',
  /\.container\.has-bg \.sc-card\s*\{[^}]*box-shadow: 0 18rpx 46rpx rgba\(8, 10, 14, 0\.42\)/.test(wxss))
ok('圆钮的阴影单独一档（110 高的条子那个扩散照搬到 59 的圆上会糊成一团黑）',
  /\.container\.has-bg \.sc-btn\s*\{[^}]*box-shadow: 0 6rpx 18rpx/.test(wxss))

// ---------- 5b. 搜索收进分类那一行（v8） ----------
ok('展开态与收起态各一条，用 searchOpen 二选一',
  /wx:if="\{\{searchOpen\}\}" class="card sc-card"/.test(wxml) && /wx:else class="head-tools"/.test(wxml))
ok('展开时输入框自动聚焦（focus 跟着那一态走，不写死 true）',
  /focus="\{\{searchOpen\}\}"/.test(wxml))
ok('圆钮和 chip 同一档高度（59，实测 chip 是 58.7）',
  /\.sc-btn\s*\{[^}]*width: 59rpx[^}]*height: 59rpx/.test(wxss)
  && /\.head-tools\s*\{[^}]*height: 59rpx/.test(wxss))
ok('圆钮吃 --chrome-bg/--chrome-ink，不另立色值',
  /background: var\(--chrome-bg\)/.test(seg(wxss, '.sc-btn')) && /color: var\(--chrome-ink\)/.test(seg(wxss, '.sc-btn')))
ok('有词又缩回时那枚翻成墨底纸白（列表被筛过这件事得有地方说）',
  /\.sc-btn\.on\s*\{[^}]*background: var\(--chrome-ink\)[^}]*color: var\(--chrome-bg\)/.test(wxss))
ok('放大镜是 CSS 画的，这一页没为一枚钮引图标',
  /\.glyph-search::before/.test(wxss) && /\.glyph-search::after/.test(wxss)
  && !/\.glyph-search\s*\{[^}]*background-image/.test(wxss))
ok('点空白缩回挂在容器上，条子内部靠 catchtap 挡住冒泡',
  /class="container[^"]*" bindtap="onBlankTap"/.test(wxml) && /catchtap="noop"/.test(wxml))
ok('那一行的外边距挂在行上，不挂在里面的 scroll-view（展开态没有它，间距还得一样）',
  /\.head-tools\s*\{[^}]*margin-bottom: var\(--sp-3\)/.test(wxss)
  && !/\.category-scroll\s*\{[^}]*margin-bottom/.test(wxss))
ok('分类多到放不下时照旧左滑，圆钮不参与滚动（flex:none 钉在最右）',
  /\.sc-btn\s*\{[^}]*flex: none/.test(wxss) && /\.category-scroll\s*\{[^}]*flex: 1/.test(wxss))
// 09-30 起暗玻璃那一态只管「全部」那一枚（.chip.all）：分类那几枚穿自己的分类色，
// 再压一层暗玻璃等于把整排分类身份洗掉（站长原话"分类按钮是有颜色的"）。
const chipIdle = seg(wxss, '.container.has-bg .chip.all')
ok('「全部」那枚在图上垫一层暗玻璃',
  /background: rgba\(18, 20, 26, 0\.42\)/.test(chipIdle) && /color: #f2efe9/.test(chipIdle))
ok('描边用 inset，不会把 56 那一档撑高', /box-shadow: inset 0 0 0 var\(--w-edge\)/.test(chipIdle))
ok('选中的「全部」换成纸白、并撤掉那圈 inset',
  /background: #f2efe9/.test(seg(wxss, '.container.has-bg .chip.all.active'))
  && /box-shadow: none/.test(seg(wxss, '.container.has-bg .chip.all.active')))
const chipTone = seg(wxss, '.chip.tone')
ok('分类 chip 吃自己的分类色一对（底与字都来自 toneVars）',
  /background: var\(--tone-bg\)/.test(chipTone) && /color: var\(--tone-ink\)/.test(chipTone))
ok('铺图那一态不再有一条通吃所有 chip 的暗玻璃（那会把分类色洗掉）',
  !/^\.container\.has-bg \.chip\s*\{/m.test(wxss))
ok('分类 chip 选中那枚反过来：纸白底 + 该色字 + 该色描边',
  /color: var\(--tone-bg\)/.test(seg(wxss, '.chip.tone.active'))
  && /box-shadow: inset 0 0 0 var\(--w-edge\) var\(--tone-bg\)/.test(seg(wxss, '.chip.tone.active')))
ok('页头两行是纸白，档位抄新建页那两行',
  /color: rgba\(242, 239, 233, 0\.96\)/.test(seg(wxss, '.container.has-bg .page-title'))
  && /color: rgba\(242, 239, 233, 0\.95\)/.test(seg(wxss, '.container.has-bg .page-stats')))
ok('行卡那一段没被顺手改色（分类两档仍从 palette 递进来）',
  /color: var\(--cat-ink\)/.test(seg(wxss, '.cat')) && /background: var\(--cat-dot\)/.test(seg(wxss, '.cat-dot')))

// ---------- 6. 界面上每一句话都要跟着改口径 ----------
ok('外观设置那句话不再写"只铺首页"', !/只铺首页|Home page only/.test(i18n))
ok('那句话提了笔记页头部', /笔记页头部/.test(i18n) && /head of the notes list/.test(i18n))
ok('卡片模板那句也提了笔记页', /垫在笔记页头部/.test(i18n))
// 09-30：外观设置里那一节整块撤了，"背景图"这三个字在字典里不再出现
ok('字典里已经没有「背景图」那一节的文案', !/homeBgSection/.test(i18n))
ok('中英文键数仍然相等',
  (i18n.match(/^ {4}[a-zA-Z]+: /gm) || []).length % 2 === 0)

// ---------- 7. 新建页那一条链路没被带坏 ----------
ok('新建页的整页铺图仍在（这一批只加列表头部，没改首页）',
  /height: 100vh/.test(seg(createWxss, '.page-bg')))
ok('新建页的罩层仍是完整七档（含底部 0.72）', /0\.72/.test(createWxss))

console.log(`${fails.length ? '✗' : '✓'} 列表头部铺图 静态：${pass}/${pass + fails.length} 条通过`
  + `　图 100vh`)
fails.forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
