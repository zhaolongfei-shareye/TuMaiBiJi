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
  /<image wx:if="\{\{bgSrc\}\}" class="head-img" style="\{\{[^}]*\}\}" src="\{\{bgSrc\}\}" mode="aspectFill" \/>/.test(wxml))
// v22（站长 10-03）：详情窗开着时同一张图要铺满整屏（"形象图贯穿，与其他页面保持风格统一"），
// 所以那一枚 style 是随 detailOpen/templateOpen 换的，两个分支都得在；
// 只钉"有没有现算的摆位"会让整个贯穿态静默丢掉（回来的是 542 那一档，图上沿被切）。
ok('头部那一枚摆位分两态：窗开着吃 imgStyleThru、收起吃 imgStyle',
  /style="\{\{detailOpen \|\| templateOpen \? imgStyleThru : imgStyle\}\}/.test(wxml))
// ★10-11 改钉：常态那一档不再是"无参＝BAND_H(542)"。站长原话「毛玻璃白底下面如果没有背景图，
// 你可以下移背景图」（需求清单 R12），落法是盒子高递给 bandGeom，542→740，公式与 15% 锚点没动。
// 所以这条从"两态都调用 bandGeom"升级成"常态那一档钉死 740，且 740＝头部 542 ＋延段 198"——
// 三个数分居两个文件（index.js 与 index.wxss），不钉等式就等着哪天只改一处。
// 延段这一轮从 `.head::after` 改挂到 `.head-scrim::after`（「调亮度」那枚 opacity 才吃得到它，
// 默认半月那一档下 542 才不出硬边，R6），所以 top 不再钉 542、钉的是 `100%`。
const glassBand = ((cjs.match(/const GLASS_BAND_H\s*=\s*(\d+(?:\s*\+\s*\d+)*)/) || [, '0'])[1])
  .split('+').reduce((a, x) => a + Number(x.trim()), 0)
const headH = Number((seg(wxss, '.head').match(/height:\s*(\d+)rpx/) || [, '0'])[1])
const bleed = seg(wxss, '.container.has-bg .head-scrim::after')
const bleedH = Number((bleed.match(/height:\s*(\d+)rpx/) || [, '0'])[1])
ok('两态都从 bandGeom 拿数（贯穿不换算法，只换盒子高）',
  /poster\.bandGeom\(info\.width, info\.height, poster\.HEAD_IMG_H\)/.test(cjs)
  && /poster\.bandGeom\(info\.width, info\.height, this\._webviewH\(\)\)/.test(cjs))
ok('常态盒子高 740 ＝头部 542 ＋延段 198（R12 这笔账两头都对得上）；10-11 11:2x 起这一枚只管版式，取景走全站锚点',
  glassBand === 740 && headH === 542 && glassBand === headH + bleedH,
  `GLASS_BAND_H=${glassBand} .head高=${headH} 延段高=${bleedH}`)
ok('延段挂在罩层自己身上、用 top:100%（挂 .head 就吃不到「调亮度」那枚 opacity＝默认档出硬边）',
  /top:\s*100%/.test(bleed), bleed.trim().slice(0, 60))
ok('罩平延那一段还是压暗的同一族色（只延长不换色，否则 542 那条线上出接缝）',
  /rgba\(18, 20, 26/.test(bleed), bleed.trim().slice(0, 60))
ok('贯穿那个盒子高是问过 webview 的（不写死机型）',
  /getWindowInfo\(\)/.test(cjs) && /_webviewH\(\)/.test(cjs))
// 站长 10-01 真机对出来的：同一个人，这一页是大特写、「我的」页是半身。
// 判据从"有没有铺图"升级成"铺的是不是同一套取景"——两页必须都从 poster.bandGeom 拿数，
// 谁哪天退回裸 aspectFill，这一条就红。
ok('这一页的取景走 poster.bandGeom（与「我的」页同一个函数，不再各摆各的）',
  /poster\.bandGeom\(/.test(cjs))
ok('bandGeom 只在 utils/poster.js 里有一份实现',
  (read('utils/poster.js').match(/function bandGeom\(/g) || []).length === 1
  && !/function bandGeom\(/.test(read('pages/me/me.js')))
/* 站长 10-01：「我的」页左上角补一行大字，"字体和大小都要一样" ⇒ 这一处原来钉的是两页 `.h1` 的
   字号/字重/字距三项**逐字相同**。10-16 夜他自己把这一枚换成首屏那枚书法位图（「这个图片全量放在
   其他页面左上角」）⇒ 那三项声明整组作废：位图不吃 `font-size`／`color`，钉它等于钉一层永远
   不生效的东西。改钉两件事：① 两页挂的是**同一张图**、且吃 `app.wxss` 那一份共用皮（尺寸只有一份真相）；
   ② 两页 `.h1` 里**不许残留任何文字声明**——留着不是无害，是"源码看着有规则、屏上一条都不生效"。
   ⚠ 同一夜作废的还有白天那句「笔记列表的大标题放大一档」（42→50）：这一屏左上角不再是字。 */
const meWxss = read('pages/me/me.wxss').replace(/\/\*[\s\S]*?\*\//g, '')
const brandOf = (src) => (src.match(/class="h1 brand-title"[^>]*src="([^"]+)"/) || [, ''])[1]
ok('两页左上角那一枚是同一张位图（正本＝首屏那枚 `/assets/title-heading.png`）',
  brandOf(wxml) === '/assets/title-heading.png' && brandOf(read('pages/me/me.wxml')) === '/assets/title-heading.png',
  `本页 ${brandOf(wxml)}｜「我的」${brandOf(read('pages/me/me.wxml'))}`)
const textDecl = (src) => /(?:^|\n)\.h1\s*\{[^}]*?(font-size|font-weight|letter-spacing|line-height|color):/.test(src)
ok('两页 `.h1` 里没有残留任何文字声明（位图不吃这几条，留着＝看着有规则、其实一条都不生效）',
  !textDecl(wxss) && !textDecl(meWxss))
ok('两页都挂 app.wxss 那一份 `.brand-title`（宽与那一档透明度只有一份真相，抄两遍必然漂）',
  /class="h1 brand-title"/.test(wxml) && /class="h1 brand-title"/.test(read('pages/me/me.wxml'))
  && /\.brand-title\s*\{[^}]*width:\s*228rpx[^}]*opacity:\s*0\.8/.test(read('app.wxss').replace(/\/\*[\s\S]*?\*\//g, '')))
ok('「我的」页那一枚也钉了图上反色那一档（filter invert，条件仍是"铺了图且图不浅"）',
  /\.head-band\.has-bg:not\(\.bg-light\) \.h1\s*\{[^}]*filter:\s*invert\(1\)/.test(meWxss))
ok('图区里有压暗罩那一层，且它吃「调亮度」递进来的透明度串',
  /class="head-scrim" style="\{\{dimScrim\}\}"/.test(wxml))
ok('铺图时容器带 has-bg', /\{\{bgSrc \? 'has-bg' : ''\}\}/.test(wxml))
ok('v12：列表在 scroll-view 里（区域内滚，不再整页滚）',
  /<scroll-view[\s\S]{0,200}class="list"[\s\S]*?bindscrolltolower="onListToLower"/.test(wxml))
// 三态的第三个原来叫 `empty` 两次（笔记那一屏与卡片那一屏各一份），合一之后只剩一份排布根，
// 名字跟着改成 `ixl-groups`。这一条量的是**三态都在滚动区里**，不是那几个字。
ok('三个状态（加载/空/排布）都在这块滚动区里，一个都没落在外面',
  ['class="loading"', 'class="empty"', 'class="ixl-groups"'].every((s) => wxml.includes(s))
  && wxml.indexOf('class="list"') < wxml.indexOf('class="loading"')
  && (wxml.match(/class="empty"/g) || []).length === 1)
ok('图区 + 圆角卡 + 滚动区三块都在容器里，页面自己不滚',
  // `class="sheet"` 后来多了一个"加宽"档（`sheet {{listWide ? 'ix-wide' : ''}}`，10-04 那一批），
  // 判据原来要求 `sheet">` 紧挨着，于是红的不是布局、是这一格多了个动态类。
  // 这里要钉的是**先后与归属**（三块按顺序都在 container 里面），不是那个 class 一字不变。
  /class="container[\s\S]*?<view class="head">[\s\S]*?<view class="sheet[ "]/.test(wxml))
// 判"有没有删干净"要看代码，不能连注释一起算——那条解释为什么删掉的注释里
// 就写着这个函数名，算进来就是自己钉死自己。
const cjsCode = cjs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
ok('取下一批挂在 scroll-view 上，Page.onReachBottom 那条已经删了（整页不滚，它永远不触发）',
  /onListToLower\(\)/.test(cjs) && !/onReachBottom/.test(cjsCode))

// ---------- 2. 取图口只有一个 ----------
ok('取图走 poster.homeBg()，和新建页是同一个函数',
  /const bgSrc = poster\.homeBg\(\)/.test(cjs) && /\n {6}bgSrc,/.test(cjs))
// 这条原来钉的是**反方向**（"铺了图就整串不发"），因为 10-17 之前那一枚搜索压在照片上，
// CSS 里另有两条 `.has-bg .srch` 覆盖要生效，内联变量压着它们翻不动。
// 10-17 搜索搬进圆角卡 ⇒ 那两条覆盖删了，这道闸跟着拆：**现在永远发**。
// 更要命的是留着那道闸会出静默坏：不发 ⇒ `.srch` 的 `background: var(--chrome-bg)` IACVT 成 transparent，
// 铺了图那一态搜索条直接看不见。所以这里同时钉三样：闸拆了、覆盖删了、变量还在发。
ok('搜索条那一串 chrome 变量两态都发（铺没铺图都吃 `--chrome-*`）',
  /searchSkin: chromeOf\(wallpaper\)\.style/.test(cjs) && !/bgSrc \? '' :/.test(cjs))
ok('CSS 里那两条"图上换半透明白"的覆盖不许留着（留着就是给不存在的那一态兜底）',
  !/has-bg\s+\.srch/.test(wxss) && !/has-bg\s+\.ic\b/.test(wxss))
/* 这条写于 4a714d0（那一版这一页确实一处选图都没有），`9b42728` 给名片那四格加了换图，
   把 wx.chooseMedia 带进这一页却没跟进这条——所以它从那天起一直红着，10-04 才发现。
   它守的规矩仍然成立，只是范围要写准：**不许有的是"给笔记本身选图"的第二个入口**（那是
   录入条那一个入口的活）；名片上那四格换的是卡片用的图，是另一件事。收窄成"只许出现在
   _ciPick 里、且全页只有一处"，比原来那句一刀切更严，也还守得住。
   10-07 再跟进一次：名片那一层整批挪进 utils/cardInfo.js（首页与笔记卡片页共用一份实现），
   所以这一页现在应当**一处 chooseMedia 都没有**，那唯一一处住在模块的 _ciPick 里。
   钉的东西没变——这一页不许长出第二个选图口——只是它换了住处，判据跟着换读哪份文件。 */
const ciPickFn = (read('utils/cardInfo.js')
  .split('\n  _ciPick(')[1] || '').split('\n  },')[0]
ok('这一页不给笔记选图：首页自己零处 chooseMedia，那唯一一处在名片模块的 _ciPick 里',
  !/chooseImage/.test(cjs) && (cjs.match(/wx\.chooseMedia\(/g) || []).length === 0
  && /wx\.chooseMedia\(/.test(ciPickFn))
ok('这一页不出现"写死的图片路径"', !/['"]\/assets\/home-bg/.test(cjs + wxml))
ok('data 里 bgSrc 起手是空串（模块加载时存储还没读）', /bgSrc: ''/.test(cjs))
// 10-01 晚：这条判断从"每页各写一份"收进一个出口（三页原来两深一浅，就是因为「我的」页漏抄了那两行）。
// 10-12 起这一页不再直接点导航条出口：深浅判定打包在 bgTone.applyTone 那一趟里。
// 10-15 站长拍甲之后**"深浅"那一档整个从导航条退场**：值只剩 `palette.navFor(当前心情)` 一个来源，
// app.js 里那两枚写死的 `#f2efe9`／`#181a20` 一起删掉 ⇒ 这一条从"值只有一份"改成"代码里一份都不许有"。
// ⚠ 读之前先把整行注释剥掉：说明文字里**会提到**这两个数（就是记它们被删掉的那段），按原文算会假红。
ok('导航条那一档交给共用出口（本页不再自己写 setNavigationBarColor）',
  /bgTone\.applyTone\(this, this\.data\.bgSrc, toneZones\(\)\)/.test(cjs)
  && !/applyNavForBand/.test(cjs) && !/setNavigationBarColor/.test(cjs))
ok('顶上那一条的两支写死色从代码里退净（值只从 `palette.navFor` 来；注释里提到那两个数不算残留）',
  !/#181a20|#f2efe9/.test(read('app.js').replace(/^\s*\/\/.*$/gm, ''))
  && !/#181a20/.test(read('pages/create/create.js'))
  && !/#181a20/.test(read('pages/me/me.js')),
  (read('app.js').replace(/^\s*\/\/.*$/gm, '').match(/#[0-9a-fA-F]{6}/g) || []).slice(0, 6).join(' '))
/* 站长 10-01 晚定过「三个 tab 的导航条标题统一成应用名」，理由就写在 `index.js` 那段注释里
   （"页面里本来就有左上角那行大字说这是哪一页，导航条不必再报一遍"）。
   ⚠ 10-16 夜他自己翻案（「这个图片全量放在其他页面左上角，原来左上角的纯文字标题替换最顶上的标题」）：
   左上角那行大字换成书法位图 ⇒ 图不报页名，"这是哪一页"只剩导航条能说。
   现在钉的是：笔记页念 `notesHeading`、「我的」页跟着当前那一档（pillSettings／pillAbout）、
   首屏仍念 `appName`（那一屏左上角本来就是品牌图，顶上不必再报一个页名）。
   旧那一条"三页都吃 appName"随之作废，别拿它当现状改回去。 */
ok('导航条那一栏报的是当前这一屏（笔记页＝notesHeading、「我的」跟着药丸、首屏仍 appName）',
  /setNavTitle\('notesHeading', lang\)/.test(cjs)
  && /setNavTitle\('appName', lang\)/.test(read('pages/create/create.js'))
  && /setNavTitle\(\s*this\.data\.tab === 'about' \? 'pillAbout' : 'pillSettings'/.test(read('pages/me/me.js')),
  `本页 ${/setNavTitle\('([a-zA-Z]+)'/.exec(cjs)?.[1]}｜「我的」${/setNavTitle\(\s*this\.data\.tab[^\n]*/.exec(read('pages/me/me.js'))?.[0].slice(0, 60)}`)

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
// 站长 10-09 对着「我的」页打回 v31 那层灰（#CDC9C1，比页面底还暗一档）："太深"。
// 这一张圆角纸卡回到 `--bg-card`，外面那一层是页面底 `--bg-page`——与「我的」那两层同一对。
ok('圆角卡往上盖住图 40、半径吃 --r-card、底色吃 --bg-card（10-09 起这一层与「我的」那张卡同色）',
  /margin-top: -40rpx/.test(sheet) && /border-radius: var\(--r-card\)/.test(sheet)
  && /background: var\(--bg-card\)/.test(sheet))
ok('滚动区自己不画面（面是那张卡画的）',
  !/(?:^|\n)\.list\s*\{[^}]*(background|border)/.test(wxss))
ok('容器竖排撑满一屏，列表区 flex:1 + min-height:0（少了 min-height:0 就会整页滚）',
  /display: flex/.test(seg(wxss, '.container')) && /height: 100vh/.test(seg(wxss, '.container'))
  && /flex: 1/.test(seg(wxss, '.list')) && /min-height: 0/.test(seg(wxss, '.list')))

// ---------- 5. 面板顶那一行（10-17 从照片段右下搬进圆角卡里） ----------
// 站长 10-17 两句：「搜索的 icon，我要下移到面板右上角」＋「左边加一个分类管理 icon，点击可以直接跳转修改分类」。
// ⇒ `.tools`（绝对定位 top 400、压在照片上）整条撤，换成 `.ixl-bar`（`.sheet` 里流内第一块）。
// 这一节换了主语：原来钉的是"压在图上那一行的落点与那档纸白"，现在钉"面板顶那一行的落点与两档墨"。
// 没变的三样：热区仍 88、放大镜仍是 CSS 画的同一枚、搜索那一态仍由 searchOpen 决定。
const bar = seg(wxss, '.ixl-bar')
ok('面板顶那一行与两枚热区都是 88 高（原来照片段那一行就是 88，搬下来不缩水）',
  /height: 88rpx/.test(bar) && /\.ixl-ic\s*\{[^}]*height: 88rpx/.test(wxss))
ok('两枚各占一头（左分类管理、右搜索）：space-between、不垫圆底也不描边',
  /justify-content: space-between/.test(bar) && !/border(?!-radius)|border-radius/.test(bar)
  && (wxml.match(/class="ixl-ic/g) || []).length === 2)
ok('`.tools`／`.acts`／`.ic` 三条随那一行一起撤净（留着就是给不存在的落点定位置）',
  !/^\.tools\s*\{/m.test(wxss) && !/^\.acts\s*\{/m.test(wxss) && !/^\.ic\s*\{/m.test(wxss)
  && !/class="tools|class="acts|class="ic[ "]/.test(wxml)
  // 中间那道竖线（10-02 那版三枚 icon 之间的分隔）10-03 就撤了，今天连它的宿主一起没：
  && !/\.vr\s*\{/.test(wxss) && !/class="vr"/.test(wxml)
  // 旧那两枚排布档的图形名也不许复活（`glyph-grid` 这串现在被新那枚 `ixl-glyph-grid` 吃着，
  // 所以这里按**旧类名的整行**查，不按子串查，否则就是自己把自己判红）。
  && !/^\.glyph-(grid|lines)\s*\{/m.test(wxss) && !/^\.ic\.on\s*\{/m.test(wxss))
ok('左端那枚点下去跳分类管理那一页（复用现页，不是新页也不是弹层）',
  /catchtap="goCategories"/.test(wxml)
  && /wx\.navigateTo\(\{ url: '\/pages\/categories\/categories' \}\)/.test(cjs))
ok('分类管理那枚＝四枚子 view 画的 2×2，吃 currentColor，没为它引图标资源',
  (wxml.match(/class="ixl-gq"/g) || []).length === 4
  && /^\.ixl-gq\s*\{[^}]*currentColor/m.test(wxss) && !/^\.ixl-glyph-grid\s*\{[^}]*url\(/m.test(wxss))
ok('有搜索词那一枚只靠颜色翻档，笔画那一档仍是 3→4 两档整数（10-03 那套做法跟着皮搬过来）',
  /^\.ixl-ic\.on\s*\{[^}]*color: var\(--text-primary\)/m.test(wxss)
  && /\.ixl-ic\.on \.glyph-search::before\s*\{[^}]*border-width: 4rpx/.test(wxss))
ok('圆钮那种"圆底 + 描边"整个撤了（只留裸图形）',
  !/\.sc-btn/.test(wxss + wxml) && !/\.head-tools/.test(wxss + wxml))
/* 站长 10-04：图上那一行左边那句轮播 Tips 整条撤了。"撤干净"是三处：节点、样式、data
   （外加那个 8 秒定时器）——留一条没人挂的类，就是下一次改版的坑。 */
ok('那句 Tips 整条撤净：节点、样式、data 与定时器四处都不在',
  !/class="tp"/.test(wxml) && !/\.tp\s*\{/.test(wxss) && !/\.tp-tx|\.tp-dot/.test(wxss)
  && !/tips: \[\]|tipIdx|startTips|stopTips|tipsFor/.test(read('pages/index/index.js')))
ok('那枚小黄点跟着旧那一行一起撤了；`tipDotStyle` 只剩详情窗要点那四行在消费（色仍从 style 递进来，不抄进 wxss）',
  !/class="xd-dot"/.test(wxml) && /class="ds-pt-dot" style="\{\{tipDotStyle\}\}"/.test(wxml)
  && !/#f6c445/i.test(wxss))
ok('这一行不再压在照片上 ⇒ `.has-bg` 那两组（`.ic`／`.srch`／`.srch-ph`）纸白覆盖一条都不许留',
  !/has-bg\s+\.ic\b/.test(wxss) && !/has-bg\s+\.srch/.test(wxss) && !/has-bg\s+\.srch-ph/.test(wxss))
ok('两枚 icon 的基础档吃这一页的墨（`--text-secondary`），不吃死白',
  /color: var\(--text-secondary\)/.test(seg(wxss, '.ixl-ic'))
  && !/rgba\(255, 255, 255/.test(seg(wxss, '.ixl-ic')))
// 搜索条搬进卡之后只剩一个态：吃 chromeOf 那串 `--chrome-*`（与底栏那排胶囊同一个值）。
// 原来"图上半透明白 + 白描边"那一支随 `.has-bg .srch` 一起删了。留着那道闸的坏法不是难看，是**看不见**：
// 内联变量一旦不发，`background: var(--chrome-bg)` 当场 IACVT 成 transparent ⇒ 条子整条消失。
ok('搜索 pill 只有一档面：吃 `--chrome-bg`，没有第二份实色、也没有铺图那一态的覆盖',
  /background: var\(--chrome-bg\)/.test(seg(wxss, '.srch')) && !/rgba\(255, 255, 255, 0\.18\)/.test(wxss))
ok('占位符给带 alpha 的色，不靠 opacity（input 的 placeholder 不吃 opacity）',
  !/\.srch-ph\s*\{[^}]*opacity/.test(wxss) && /--chrome-idle/.test(seg(wxss, '.srch-ph')))
// v19 第三条：那两个字压到与分类同一档（原来吃 --fs-title 31，比正文还大一级）。
// 新建页那条标题不动，所以这里不再钉"两页同一个令牌"。
ok('「搜索笔记」与分类那枚 chip 吃同一条字号令牌（--fs-meta 24，不再比正文大一级）',
  /font-size: var\(--fs-meta\)/.test(seg(wxss, '.srch-go'))
  && /font-size: var\(--fs-meta\)/.test(seg(read('app.wxss'), '.chip'))
  && /font-weight: 600/.test(seg(wxss, '.srch-go')))
ok('两枚图形都是 CSS 画的，这一页没为任何一枚 icon 引图（全页 wxss 里一次 `url(` 都不许出现）',
  /\.glyph-search::before/.test(wxss) && /\.glyph-search::after/.test(wxss)
  && /^\.ixl-gq\s*\{/m.test(wxss) && !/\burl\(/.test(wxss))
ok('颜色全走 currentColor：翻色只改 `.ixl-ic` 一处，两枚图形（放大镜与四格）一条都不用动',
  /currentColor/.test(seg(wxss, '.glyph-search::before'))
  && /currentColor/.test(seg(wxss, '.ixl-gq'))
  && !/^\.ixl-ic\s*\{[^}]*#[0-9a-fA-F]{6}/m.test(wxss))

// ---------- 5b. 搜索的两态与点击边界（10-17 换了落点，这一节的口径不变） ----------
ok('摊开那一条仍由 searchOpen 那一态决定；对面那一支 Tips 已撤净（这一行只剩这两枚）',
  /wx:if="\{\{searchOpen\}\}" class="srch"/.test(wxml) && !/class="tp"/.test(wxml))
ok('摊开时那两枚 icon 整体让位（`<block wx:else>` 那一支），同一行不出现两枚搜索',
  /<block wx:else>[\s\S]{0,600}catchtap="onOpenSearch"/.test(wxml)
  && (wxml.match(/catchtap="onOpenSearch"/g) || []).length === 1)
ok('输入框自动聚焦（focus 跟着那一态走，不写死 true）',
  /focus="\{\{searchOpen\}\}"/.test(wxml))
// 这一行只剩两枚 icon：条子内部与它们都靠 catchtap 挡住冒泡，
// 原来那两枚 onToggleMode 随排布档一起撤了——留着不撤，点空白就缩不回来了。
ok('点空白缩回挂在容器上，条子内部和两枚 icon 都靠 catchtap 挡住冒泡',
  /class="container[^"]*" bindtap="onBlankTap"/.test(wxml) && /catchtap="noop"/.test(wxml)
  && !/onToggleMode/.test(wxml + cjs)
  && /class="ixl-ic \{\{searchKeyword \? 'on' : ''\}\}" catchtap="onOpenSearch"/.test(wxml))
// 行仍 88，条子压到 60——"同高"这条作废，钉的是"条子比行矮 28、由行把它竖向居中"。
ok('条子压到 60（与分类那枚 chip 实测 59 同一档），那一行仍 88、条子在行里竖向居中',
  /\.srch\s*\{[^}]*height: 60rpx/.test(wxss) && /^\.ixl-bar\s*\{[^}]*height: 88rpx/m.test(wxss)
  && /align-items: center/.test(seg(wxss, '.ixl-bar')))
ok('有词又缩回时那枚 icon 翻一档（列表被筛过这件事得有地方说）',
  /class="ixl-ic \{\{searchKeyword \? 'on' : ''\}\}"/.test(wxml) && /^\.ixl-ic\.on\s*\{/m.test(wxss))
// 分类那一行 v30 起是「文字 + 选中一条短杠」（首页自己的 .ix-cat），胶囊那四条一起删了：
// `.container.has-bg .chip.all`／`.…all.active`／`.chip.tone`／`.chip.tone.active`。
// 它整段在下面的圆角卡里、不压在形象图上，所以这一屏**不该再有任何 chip 的铺图态**——
// 原来那五条"暗玻璃/inset/纸白底/该色字"的判据不是红了要修，是它们量那一行的前提没了。
ok('铺图那一态里胶囊相关的四条一个都不剩（撤净了才叫撤，留一条就是两版并存）',
  !/\.container\.has-bg \.chip/.test(wxss) && !/\.chip\.tone/.test(wxss))
/* 这一条原来的话是「分类那一行不写任何 .has-bg 分支（它在卡里、不吃照片）」——**前提已经作废**：
   10-11 R12 把形象图往下垫到卡顶后面（`bandGeom(w,h,740)`），本页 `.container.has-bg .sheet`
   那一段注释写得很清楚："卡顶从上往下糊两行字（两枚 tab 那一行＋分类行那两行＝这一段 158）"。
   分类行从那天起就压在白纱上，只是没人给它写过分支；站长 10-12 把深浅的范围扩到这两行，
   这一格才真有规则。所以这里改钉**新前提**：有一支、且只有一支，而且翻的是墨的浓度不是极性。 */
ok('分类那一行在深图那一态有且只有一支抬色规则（10-12 范围扩到这两行；旧那条"不吃照片"已作废）',
  (wxss.match(/\.container\.has-bg:not\(\.bg-light-low\)[^{]*\.ix-cat/g) || []).length === 1,
  `命中 ${(wxss.match(/\.container\.has-bg:not\(\.bg-light-low\)[^{]*\.ix-cat/g) || []).length} 支`)
ok('那一支只改 color、不许带底色或纸白（底色归 R14 那枚 α .30 唯一出口，字色归深浅这一档）',
  /\.container\.has-bg:not\(\.bg-light-low\)[\s\S]{0,400}?\.ix-cat\s*\{\s*color:\s*var\(--text-primary\);\s*\}/
    .test(wxss))
// 10-09 这一层从层色换成 `--bg-card` 之后，"压在层面上的那一支冷墨"（`--ink-on-layer*`）在分类
// 这一行没有对象了：两档字与短杠改吃这一页的墨（`--text-primary`／`--text-secondary`），
// 与「我的」页那四行同一对。留着旧那两个名字就是拿冷墨写暖底。
/* 站长 10-16「分类名字，不要加粗，不要纯黑，下划线也一样」⇒ 三样一起撤：
   字重 600→400、`.on` 那档从整档墨 `--text-primary` 落到 `--text-secondary`（与未选那一档同一档，
   选中这件事只靠"它在最前"表达）、那枚短杠 `.ix-cat.on::after` 整枚删掉。
   ⚠ 这一条从"两档不同色"翻成"两档同色"：判据的前提是他今天这一句，不是 10-09 那一句。
   ⚠ 撤掉短杠之后**没有任何屏上标记**表示"当前是哪一枚分类"——那一条我没自己补，钉成待拍（D38）。 */
ok('分类那两档同一档字色（都吃 --text-secondary）、都不加粗、短杠整枚撤掉（10-16 三样一起撤）',
  /color: var\(--text-secondary\)/.test(seg(wxss, '.ix-cat'))
  && /color: var\(--text-secondary\)/.test(seg(wxss, '.ix-cat\.on'))
  && !/font-weight:\s*[5-9]00/.test(seg(wxss, '.ix-cat'))
  && !/font-weight:\s*[5-9]00/.test(seg(wxss, '.ix-cat\.on'))
  && !/\.ix-cat\.on::after/.test(wxss)
  && !/var\(--tip-dot\)/.test(seg(wxss, '.ix-cat\.on')))
// 这一条比的是**代码**不是注释，所以吃文件顶上那把 `cjsCode`（第 90 行已经剥过注释）——
// 拿原文正则扫会把自家注释判成残留（今天第二次踩同一坑，另一处是 #FCFBF8）。
ok('index.js 不再给每一条分类挂 toneStyle（那一行的 --tone-bg/--tone-ink 没人消费了）',
  !/toneStyle/.test(cjsCode) && !/toneVars/.test(cjsCode), '分类行的色不再从 toneVars 出')
/* 这一发原来钉"三行"（标题＋数字＋小字各一档 `color`）。10-16 夜左上角那一枚换成位图，
   它不吃 `color`，翻色改挂 `filter: invert(1)`（见下面单独那一发）⇒ 这里只剩两行还比 `color`。
   ⚠ 不许把标题那一档从这条里"删了就算"：它换的是**读法**，不是没了。 */
ok('压在图上的那两行是纸白（数字 .8 ＋ 小字 .62 各一档）',
  /color: rgba\(242, 239, 233, 0\.8\)/.test(seg(wxss, '.container.has-bg .stat .n'))
  && /color: rgba\(242, 239, 233, 0\.62\)/.test(seg(wxss, '.container.has-bg .stat .l')))
ok('没铺图那一态这两行退回各自主题的墨色（不是写死白）',
  /color: var\(--text-secondary\)/.test(seg(wxss, '.stat .l')))
ok('左上角那一枚位图的翻色只挂一处 invert(1)，条件＝"铺了图且图不浅"（浅图与无图两态都不许反白）',
  /\.container\.has-bg:not\(\.bg-light\) \.h1\s*\{[^}]*filter:\s*invert\(1\)/.test(wxss)
  && (wxss.match(/filter:\s*invert\(1\)/g) || []).length === 1
  && !/\.bg-light \.h1/.test(wxss),
  `invert 出现 ${(wxss.match(/filter:\s*invert\(1\)/g) || []).length} 次（只许一处）`)
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
