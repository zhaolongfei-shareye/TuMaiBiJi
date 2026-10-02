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
ok('图区里铺了 <image> 组件（wxss 的 background-image 不认包内本地文件），且吃现算的摆位',
  /<image wx:if="\{\{bgSrc\}\}" class="head-img" style="\{\{imgStyle\}\}" src="\{\{bgSrc\}\}" mode="aspectFill" \/>/.test(wxml))
// 站长 10-01 真机对出来的：同一个人，这一页是大特写、「我的」页是半身。
// 判据从"有没有铺图"升级成"铺的是不是同一套取景"——两页必须都从 poster.bandGeom 拿数，
// 谁哪天退回裸 aspectFill，这一条就红。
ok('这一页的取景走 poster.bandGeom（与「我的」页同一个函数，不再各摆各的）',
  /poster\.bandGeom\(/.test(cjs))
ok('bandGeom 只在 utils/poster.js 里有一份实现',
  (read('utils/poster.js').match(/function bandGeom\(/g) || []).length === 1
  && !/function bandGeom\(/.test(read('pages/me/me.js')))
// 站长 10-01：「我的」页左上角补一行大字，"字体和大小都要一样"。两页各写一份迟早走样，
// 所以这里不钉具体数值，钉的是"两页那三行声明一模一样"。
const meWxss = read('pages/me/me.wxss').replace(/\/\*[\s\S]*?\*\//g, '')
const h1Of = (src) => {
  const b = (src.match(/(?:^|\n)\.h1\s*\{([^}]*)\}/) || [, ''])[1]
  return ['font-size', 'font-weight', 'letter-spacing'].map((p) => {
    const m = b.match(new RegExp(`${p}:\\s*([^;]+)`))
    return m ? m[1].trim() : ''
  }).join('/')
}
ok('本页 .h1 与「我的」页 .h1 三项声明逐字相同（字号/字重/字距）',
  h1Of(wxss) === h1Of(meWxss) && !!h1Of(wxss), `${h1Of(wxss)} vs ${h1Of(meWxss)}`)
ok('「我的」页那一行也钉了图上翻纸白这一档',
  /\.head-band\.has-bg \.h1\s*\{[^}]*rgba\(242, 239, 233, 0\.96\)/.test(meWxss))
ok('图区里有压暗罩那一层，且它吃「调亮度」递进来的透明度串',
  /class="head-scrim" style="\{\{dimScrim\}\}"/.test(wxml))
ok('铺图时容器带 has-bg', /\{\{bgSrc \? 'has-bg' : ''\}\}/.test(wxml))
ok('v12：列表在 scroll-view 里（区域内滚，不再整页滚）',
  /<scroll-view[\s\S]{0,200}class="list"[\s\S]*?bindscrolltolower="onListToLower"/.test(wxml))
ok('三个状态（加载/空/排布）都在这块滚动区里，一个都没落在外面',
  (wxml.match(/class="(loading|empty|bodyrow)"/g) || []).length === 3
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
// 10-01 晚：这条判断从"每页各写一份"收进 app.applyNavForBand 一个出口
// （三页原来两深一浅，就是因为「我的」页漏抄了那两行）。
// 所以判据跟着换：这一页调那个出口，且全工程只有 app.js 里出现那支墨色一次。
ok('导航条那一档交给共用出口（本页不再自己写 setNavigationBarColor）',
  /app\.applyNavForBand\(this\.data\.bgSrc\)/.test(cjs)
  && !/setNavigationBarColor/.test(cjs))
ok('墨色那支值全工程只有一份（在 app.js 的出口里）',
  (read('app.js').match(/#181a20/g) || []).length === 1
  && !/#181a20/.test(read('pages/create/create.js'))
  && !/#181a20/.test(read('pages/me/me.js')))
ok('三个 tab 的导航条标题都吃 appName（顶部不再一页一个名字）',
  /setNavTitle\('appName', lang\)/.test(cjs)
  && /setNavTitle\('appName', lang\)/.test(read('pages/create/create.js'))
  && /setNavTitle\('appName', lang\)/.test(read('pages/me/me.js'))
  && i18n.includes("appName: '图麦笔记'") && i18n.includes("appName: 'TumarkNote'"))

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

// ---------- 5. 压在图上的那一行（v18：一句 Tips + 三枚裸 icon，搜索摊开也在这条上） ----------
// 站长 10-02 第三轮：圆底和描边整块撤掉，只留中间图形，之间一道竖线；搜索点开时
// Tips 整条不渲染、搜索那枚向左摊成输入框。v8 那枚 59 圆钮和"搜索条与笔记行同高"
// 那套对齐判据一起作废——现在钉的是"条子和那一行同高（88）"。
const tools = seg(wxss, '.tools')
ok('图上那一行：top 400、左右各 24、整行 88 高（下沿离列表区只留 14）',
  /top: 400rpx/.test(tools) && /left: 24rpx/.test(tools) && /right: 24rpx/.test(tools)
  && /height: 88rpx/.test(tools), tools.trim().slice(0, 60))
ok('圆钮那种"圆底 + 描边"整个撤了（v18 只留裸图形）',
  !/\.sc-btn/.test(wxss + wxml) && !/\.head-tools/.test(wxss + wxml))
// v19（站长 10-03 第四轮）：图上那一行只留搜索一枚——纸片墙 / 一行那两枚随整个排布档
// 一起撤了，中间那道竖线跟着没有主人。所以原来钉"三枚同基准""选中重一档靠笔画"这两条
// 改成反向钉：留着就是又给人埋一枚点不动的 icon。
ok('那一组只剩搜索一枚，紧靠右（margin-left 26）且中间那道竖线跟着撤净',
  !/\.vr\s*\{/.test(wxss) && !/class="vr"/.test(wxml) && /\.acts\s*\{[^}]*margin-left: 26rpx/.test(wxss)
  && (wxml.match(/class="ic /g) || []).length === 1)
ok('两枚排布 icon（四块方 / 三根线）整个撤了，只留放大镜一枚 38×38',
  !/glyph-(grid|lines)/.test(wxss + wxml)
  && new RegExp('glyph-search\\s*\\{[^}]*width: 38rpx').test(wxss))
ok('选中那一档只靠颜色跳出来（笔画那一档随纸片墙一起撤了）',
  /\.ic\.on\s*\{[^}]*color/.test(wxss) && !/border-width/.test(seg(wxss, '.ic.on')))
ok('Tips 那句一行放完就省略号，不折行把 icon 顶下去',
  /text-overflow: ellipsis/.test(seg(wxss, '.tp-tx')) && /white-space: nowrap/.test(seg(wxss, '.tp-tx')))
ok('Tips 前面那枚点的色从 style 递进来（TIP_DOT 不许抄进 wxss）',
  /class="tp-dot" style="\{\{tipDotStyle\}\}"/.test(wxml) && !/#f6c445/i.test(wxss))
ok('压在图上的那一行两档都是纸白（Tips / icon；竖线那一档随它一起撤了）',
  /color: rgba\(242, 239, 233, 0\.82\)/.test(seg(wxss, '.container.has-bg .tp'))
  && /color: rgba\(255, 255, 255, 0\.86\)/.test(seg(wxss, '.container.has-bg .ic')))
ok('没铺图那一态这三档退回各自主题的墨色（不是写死白）',
  /color: var\(--text-secondary\)/.test(seg(wxss, '.tp'))
  && !/rgba\(255, 255, 255/.test(seg(wxss, '.ic')))
// 搜索那一态在图上是半透明白 pill（效果图那两条 rgba 是压着照片量的：派生深色压在自己的
// 照片上只有 1.0 出头）；没铺图时仍吃 chromeOf 那串 --chrome-*。两处都是"一条规则一个值"，
// 没有第二份实色。
ok('搜索 pill：图上是半透明白 + 白描边，没铺图时吃 --chrome-*',
  /\.container\.has-bg \.srch\s*\{[^}]*rgba\(255, 255, 255, 0\.18\)[^}]*rgba\(255, 255, 255, 0\.36\)/.test(wxss)
  && /background: var\(--chrome-bg\)/.test(seg(wxss, '.srch')))
ok('铺图时那串 chrome 变量整串不发（内联自定义属性优先级高于任何选择器）',
  /searchSkin: bgSrc \? '' : chromeOf\(wallpaper\)\.style/.test(cjs))
ok('占位符给带 alpha 的色，不靠 opacity（input 的 placeholder 不吃 opacity）',
  !/\.srch-ph\s*\{[^}]*opacity/.test(wxss) && /--chrome-idle/.test(seg(wxss, '.srch-ph')))
// v19 第三条：那两个字压到与分类同一档（原来吃 --fs-title 31，比正文还大一级）。
// 新建页那条标题不动，所以这里不再钉"两页同一个令牌"。
ok('「搜索笔记」与分类那枚 chip 吃同一条字号令牌（--fs-meta 24，不再比正文大一级）',
  /font-size: var\(--fs-meta\)/.test(seg(wxss, '.srch-go'))
  && /font-size: var\(--fs-meta\)/.test(seg(read('app.wxss'), '.chip'))
  && /font-weight: 600/.test(seg(wxss, '.srch-go')))
ok('放大镜是 CSS 画的，这一页没为一枚 icon 引图标资源（四块方 / 三根线随排布档一起没了）',
  /\.glyph-search::before/.test(wxss) && /\.glyph-search::after/.test(wxss)
  && !/\.glyph-(search|grid|lines)\s*\{[^}]*\burl\(/.test(wxss))
ok('颜色全走 currentColor：翻色只改 .ic 一处，三枚图形一条都不用动',
  /currentColor/.test(seg(wxss, '.glyph-search::before'))
  && /currentColor/.test(wxss.match(/\.glyph-who::before\s*\{[^}]*\}/)?.[0] || '')
  && !/\.ic [^}]*#[0-9a-fA-F]{6}/.test(wxss))

// ---------- 5b. 搜索的两态与点击边界（v18） ----------
ok('摊开那一条用 searchOpen 二选一：条子在、Tips 整条不渲染',
  /wx:if="\{\{searchOpen\}\}" class="srch"/.test(wxml) && /wx:else class="tp"/.test(wxml))
ok('摊开时搜索那枚 icon 自己让位（同一行不出现两枚搜索）',
  /wx:if="\{\{!searchOpen\}\}" class="ic[^"]*" catchtap="onOpenSearch"/.test(wxml))
ok('输入框自动聚焦（focus 跟着那一态走，不写死 true）',
  /focus="\{\{searchOpen\}\}"/.test(wxml))
// v19 之后图上那一行只剩一枚搜索：条子内部与它都靠 catchtap 挡住冒泡，
// 原来那两枚 onToggleMode 随排布档一起撤了——留着不撤，点空白就缩不回来了。
ok('点空白缩回挂在容器上，条子内部和搜索那一枚都靠 catchtap 挡住冒泡',
  /class="container[^"]*" bindtap="onBlankTap"/.test(wxml) && /catchtap="noop"/.test(wxml)
  && !/onToggleMode/.test(wxml + cjs)
  && /class="ic [^"]*" catchtap="onOpenSearch"/.test(wxml))
// v19 第三条：行仍 88，条子压到 60——"同高"这条到此作废，改钉"条子比行矮 28、由它自己居中"。
ok('条子压到 60（与分类那枚 chip 实测 59 同一档），那一行仍 88、条子在行里竖向居中',
  /\.srch\s*\{[^}]*height: 60rpx/.test(wxss) && /\.tools\s*\{[^}]*height: 88rpx/.test(wxss)
  && /align-items: center/.test(seg(wxss, '.tools')))
ok('有词又缩回时那枚 icon 翻一档（列表被筛过这件事得有地方说）',
  /class="ic \{\{searchKeyword \? 'on' : ''\}\}"/.test(wxml) && /\.ic\.on\s*\{/.test(wxss))
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
// 站长 10-01 晚：三列从"横贯整块"改成钉右上角、整块变窄，数字跟着从 100 收到 64。
// 这一档不是新造的：「我的」页那枚 MIND 改成同一个数，两页的右上角才是同一个东西。
ok('三列的数字与小字吃「我的」页那两个量（64rpx / 18rpx，两页同一个数）',
  /font-size: 64rpx/.test(seg(wxss, '.stat .n')) && /line-height: 0\.86/.test(seg(wxss, '.stat .n'))
  && /font-size: var\(--fs-micro\)/.test(seg(wxss, '.stat .l'))
  && /letter-spacing: 4rpx/.test(seg(wxss, '.stat .l'))
  && /font-size: 64rpx/.test(seg(read('pages/me/me.wxss'), '.score-n'))
  && /letter-spacing: 4rpx/.test(seg(read('pages/me/me.wxss'), '.score-l')))
ok('三列钉右上角：right 32 / top 24，且不再横贯（没有 left 那条）',
  /right: 32rpx/.test(seg(wxss, '.stats')) && /top: 24rpx/.test(seg(wxss, '.stats'))
  && !/left:/.test(seg(wxss, '.stats')))
ok('整块宽度收到 312（三格各 104、flex:none 不被挤扁）',
  (seg(wxss, '.stat').match(/width: 104rpx/) || []).length === 1
  && /flex: none/.test(seg(wxss, '.stat')))
ok('「我的」那枚 MIND 与这三列同一个锚点（right 32 / top 24）',
  /right: 32rpx/.test(seg(read('pages/me/me.wxss'), '.score'))
  && /top: 24rpx/.test(seg(read('pages/me/me.wxss'), '.score')))
ok('读不到字段画 0，不再画「—」（站长：这三格是进度，画杠读起来像坏了）',
  /isFinite\(v\) \? v : 0/.test(cjs) && !/: '—'/.test(cjs))
// 数的是**声明**的次数（`@font-face {`），不是这五个字出现的次数——
// app.wxss 那段注释里要提到这条尺子就会带上这五个字，光数文字会把注释算成第二份。
ok('数字那支字体族就是 WtsjMind，且声明在 app.wxss 只有一份（两页共用，不抄第二份 base64）',
  /font-family: 'WtsjMind'/.test(seg(wxss, '.stat .n'))
  && (read('app.wxss').match(/@font-face\s*\{/g) || []).length === 1
  && !/@font-face\s*\{/.test(read('pages/me/me.wxss')))
ok('三列顶对齐（align-items:flex-start），不是底对齐', /align-items: flex-start/.test(seg(wxss, '.stats')))
ok('只剩「笔记」这一列（v18 撤掉分享/种草两列，那道分隔细线跟着没有主人了）',
  !/\.stat \+ \.stat/.test(wxss) && !/statShares|statSaved/.test(i18n)
  && (cjs.match(/key: 'notes'/) || []).length === 1)
// v19：纸片墙那一族（.note 的底与字、.shared-tag 那一小块）整屏退了，
// 这两条从"不写死颜色"改成反向钉——它们回来一次，就说明有人绕过 palette 抄了实色。
// 扫的是剥掉注释的那一份（cjsCode，上面已经算好）：index.js 里留了一句
// "这一族随 v19 一起撤了"的说明，拿原文扫会被自己的注释判成假红
// （色值有没有落进样式表由 验-列表D2.js 那条管）。
ok('纸片那一族整块退了（.note 与 paperStyle 在这一屏没有后代）',
  !/class="note"|paperStyle|paperSkinFor|\.note\s*\{/.test(wxss + wxml + cjsCode))
ok('「已分享」那一小块整屏不画（公开状态只在详情窗里说）',
  !/shared-tag|SHARED_TAG/.test(wxss + wxml + cjsCode))

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
