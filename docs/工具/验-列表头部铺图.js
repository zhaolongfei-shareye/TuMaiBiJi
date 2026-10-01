// 笔记列表"形象图 + 一条笔记一个框"这一批的静态尺子（不连模拟器，纯读文件）。
// 跑法：node docs/工具/验-列表头部铺图.js
// 要守的东西：① 图和新建页同一个取图口，这一页不再开第二个上传入口；
// ② v12（站长 10-01 拍）：图只守头部那一段 542，下面是一张圆角卡往上盖住它 40。
//    09-28 那条"图贯穿全屏"到此作废，但**它真正在防的东西没作废**：一条笔记一个框——
//    那张圆角卡可以有底色，不许有描边，否则又是框套框。所以这里钉的是 border 不出现。
// ③ 压暗那一串仍在，只是画在 542 这一段里（不再和新建页逐字相同：那段是 100vh 的七档）。
// ④ 界面上每一句提到这张图范围的话，都还得同时讲清首页和笔记页头部。
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
ok('图区里铺了 <image> 组件（wxss 的 background-image 不认包内本地文件）',
  /<image wx:if="\{\{bgSrc\}\}" class="head-img" src="\{\{bgSrc\}\}" mode="aspectFill" \/>/.test(wxml))
ok('图区里有压暗罩那一层', /class="head-scrim"><\/view>/.test(wxml))
ok('铺图时容器带 has-bg', /\{\{bgSrc \? 'has-bg' : ''\}\}/.test(wxml))
ok('v12：列表在 scroll-view 里（区域内滚，不再整页滚）',
  /<scroll-view[\s\S]{0,200}class="list"[\s\S]*?bindscrolltolower="onListToLower"/.test(wxml))
ok('三个状态（加载/空/列表）都在这块滚动区里，一个都没落在外面',
  (wxml.match(/class="(loading|empty|notes-list)"/g) || []).length === 3
  && wxml.indexOf('class="list"') < wxml.indexOf('class="loading"'))
ok('图区 + 圆角卡 + 滚动区三块都在容器里，页面自己不滚',
  /class="container[\s\S]*?<view class="head">[\s\S]*?<view class="sheet">/.test(wxml))
// 判"有没有删干净"要看代码，不能连注释一起算——那条解释为什么删掉的注释里
// 就写着这个函数名，算进来就是自己钉死自己。
const cjsCode = cjs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
ok('取下一批挂在 scroll-view 上，Page.onReachBottom 那条已经删了（整页不滚，它永远不触发）',
  /onListToLower\(\)/.test(cjs) && !/onReachBottom/.test(cjsCode))

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

// ---------- 3. v12：图守头部一段，圆角卡不描边 ----------
const head = seg(wxss, '.head')
const headImg = seg(wxss, '.head-img')
const scrim = seg(wxss, '.head-scrim')
ok('图区高 542（= 现网「我的」那条 .band 同一个量）', /height: 542rpx/.test(head), head.trim().slice(0, 40))
ok('图区自己 overflow:hidden，图与罩都是 absolute 铺满这一段（不再是 fixed 100vh）',
  /overflow: hidden/.test(head) && /position: absolute/.test(headImg) && /position: absolute/.test(scrim)
  && !/position: fixed/.test(headImg + scrim))
ok('图与罩同高（都是 542 那一段，不是一屏）',
  /height: 542rpx/.test(headImg) && !/height: 100vh/.test(headImg + scrim))
// 新建页那一条仍是 100vh 七档——两页的图现在守的不是同一段，明暗只要求"同源不跳档"，
// 逐字相同这条判据的前提（同一段、同一个视口）已经不存在了，所以撤。
ok('压暗那一串仍在图区里（画在段内，不再画满一屏）',
  /linear-gradient\(180deg/.test(scrim) && !/(?:^|\n)\.page-scrim\s*\{/.test(wxss))
// 09-28 那次打回的是"纸一圈描边 + 每条笔记又一圈描边"。v12 把纸加回来了，
// 所以真正要守的从"不许有这张纸"变成"这张纸不许有描边"——一条笔记一个框这条没变。
const sheet = seg(wxss, '.sheet')
ok('圆角卡回来了，但它不描边（框套框那条不变量还在）',
  /\.sheet\s*\{/.test(wxss) && !/border(?!-radius)/.test(sheet), sheet.match(/border[^;]*/g))
ok('圆角卡往上盖住图 40、半径吃 --r-card、底色吃 --bg-page（和「我的」那张 sheet 同一套量）',
  /margin-top: -40rpx/.test(sheet) && /border-radius: var\(--r-card\)/.test(sheet)
  && /background: var\(--bg-page\)/.test(sheet))
ok('滚动区自己不画面（面是那张卡画的）',
  !/(?:^|\n)\.list\s*\{[^}]*(background|border)/.test(wxss))
ok('容器竖排撑满一屏，列表区 flex:1 + min-height:0（少了 min-height:0 就会整页滚）',
  /display: flex/.test(seg(wxss, '.container')) && /height: 100vh/.test(seg(wxss, '.container'))
  && /flex: 1/.test(seg(wxss, '.list')) && /min-height: 0/.test(seg(wxss, '.list')))

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
// ---------- 5c. 展开条的高度对齐笔记行（09-30 他："展开的高度太高了"） ----------
// 条子和笔记行同高这件事，靠的是"同一套内边距 + 同一根内容线高"，不是各写一个总高：
// 笔记行实测 96.3 = 26 + 44 + 26，条子按同一个式子拼出来才会跟着 --sp-row 一起动。
ok('条子上下内边距直接吃笔记行那一个量（不另写一份 26/20）',
  /\.sc-card\s*\{[^}]*padding: var\(--sp-row\) var\(--sp-3\)/.test(wxss))
ok('条子里那根内容线收到 44rpx（笔记行内容线实测就是这个数）',
  /\.sc-line\s*\{[^}]*height: 44rpx/.test(wxss))
ok('下横线撤了（改由最前面那枚放大镜提示可输入）',
  !/class="sc-rule"/.test(wxml) && !/\.sc-rule\s*\{/.test(wxss))
ok('展开条最前面有那枚放大镜，且排在输入框之前',
  /class="sc-glyph glyph-search"><\/view>[\s\S]{0,120}<input[\s\S]{0,40}class="sc-input"/.test(wxml))
ok('放大镜停在"提示"那一档（.55，比输入字浅，不跟内容抢）',
  /\.sc-glyph\s*\{[^}]*opacity: 0\.55/.test(wxss))
// 「搜索笔记」与笔记标题同档这件事原来是被效果图误导的：稿子里行卡标题画成 --fs-body 28，
// 现网 .row-title 其实是 --fs-title 31。两边实测都是 16px，所以这里钉住"同一条令牌"，
// 谁再想改字号必须同时改两处才不红。
ok('「搜索笔记」与笔记标题吃同一条字号令牌',
  /\.sc-go\s*\{[^}]*font-size: var\(--fs-title\)/.test(wxss)
  && /\.row-title\s*\{[^}]*font-size: var\(--fs-title\)/.test(read('app.wxss')))
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
ok('压在图上的那三行是纸白（标题 + 数字 + 小字各一档）',
  /color: rgba\(242, 239, 233, 0\.96\)/.test(seg(wxss, '.container.has-bg .h1'))
  && /color: rgba\(242, 239, 233, 0\.8\)/.test(seg(wxss, '.container.has-bg .stat .n'))
  && /color: rgba\(242, 239, 233, 0\.62\)/.test(seg(wxss, '.container.has-bg .stat .l')))
ok('没铺图那一态这三行退回各自主题的墨色（不是写死白）',
  /color: var\(--text-primary\)/.test(seg(wxss, '.h1'))
  && /color: var\(--text-secondary\)/.test(seg(wxss, '.stat .l')))
ok('三列的数字与小字吃「我的」页那两个量（100rpx / 18rpx，不另立一档）',
  /font-size: 100rpx/.test(seg(wxss, '.stat .n')) && /line-height: 0\.86/.test(seg(wxss, '.stat .n'))
  && /font-size: var\(--fs-micro\)/.test(seg(wxss, '.stat .l'))
  && /letter-spacing: 6rpx/.test(seg(wxss, '.stat .l')))
ok('数字那支字体族就是 WtsjMind，且声明在 app.wxss 只有一份（两页共用，不抄第二份 base64）',
  /font-family: 'WtsjMind'/.test(seg(wxss, '.stat .n'))
  && (read('app.wxss').match(/@font-face/g) || []).length === 1
  && !/@font-face/.test(read('pages/me/me.wxss')))
ok('三列顶对齐（align-items:flex-start），不是底对齐', /align-items: flex-start/.test(seg(wxss, '.stats')))
ok('细线只画在两道分隔处，且上下不顶满', /\.stat \+ \.stat::before/.test(wxss)
  && /height: 118rpx/.test(seg(wxss, '.stat + .stat::before')))
ok('行卡那一段没被顺手改色（分类两档仍从 palette 递进来）',
  /color: var\(--cat-ink\)/.test(seg(wxss, '.cat')) && /background: var\(--cat-dot\)/.test(seg(wxss, '.cat-dot')))

// ---------- 6. 界面上每一句话都要跟着改口径 ----------
ok('外观设置那句话不再写"只铺首页"', !/只铺首页|Home page only/.test(i18n))
ok('那句话提了笔记页头部', /笔记页头部/.test(i18n) && /head of the notes list/.test(i18n))
// 09-30 形象图改成四槽，那句提示跟着重写；口径没变：还得同时讲清首页和笔记页头部
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
  + `　图守头部 542`)
fails.forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
