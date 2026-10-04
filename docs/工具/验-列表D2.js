// 笔记列表这一屏的静态尺子（不连模拟器，纯读文件 + 现算 palette）。
// 跑法：node docs/工具/验-列表D2.js
// 文件名留着是因为它守的还是同一屏，但 10-02 夜里 v18 那一轮把 D2 的画法整块换掉了：
// 「点 + 分类名 + meta 行 + 手风琴」这套前提没了，现在这一屏是"左时间轴 + 右纸片墙 / 一行"。
// 所以第 3 节整节跟着改口（旧那几条判据的前提已经不存在，留着就是自己钉死自己的假红/假绿），
// 第 1、2、4、5 节守的东西一条没动：底栏与搜索那块派生色、分类两档压卡底的门槛、
// 圆角字阶与底栏三枚图形。
const fs = require('fs')
const io2 = require('fs')
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
const ZH = require(P('utils/i18n.js')).texts('zh')

// CSS 声明扫的是"这一个类自己那一段"，别的类里写了什么不算
const rule = (src, sel) => {
  const m = new RegExp(`\\.${sel}\\s*\\{([^}]*)\\}`).exec(src)
  return m ? m[1] : ''
}
const appWxss = fs.readFileSync(P('app.wxss'), 'utf8')
const appWxssRule = (sel) => rule(appWxss, sel)

// 10-04 六枚压成四枚：WALLS 是"现在真实存在的四套"，LEGACY 是"服务端可能还存着的旧 key"。
// 旧 key 不再有自己的派生色——themeOf 一层别名把它们送到这四枚之一，所以它们只配被验一件事。
const WALLS = ['tint-paper', 'tint-celadon', 'tint-blush', 'gradient-blue']
const LEGACY = ['default', 'gradient-blue', 'gradient-green', 'gradient-sunset',
  'gradient-purple', 'gradient-ocean']

// ---------- 1. 那块派生色：四枚对表（10-04 甲档定稿，值出自 docs/design/配色统一-四套莫兰迪/生成结果5.txt）----------
// 表是"对答案"用的，不是取色来源：值一律由 chromeOf 现算，比完还得证明代码里没有这张表。
const DOC_12 = {
  'tint-paper': '#443B25', 'tint-celadon': '#25442B',
  'tint-blush': '#442534', 'gradient-blue': '#252C44',
}
WALLS.forEach((w) => {
  const got = p.chromeOf(w).bg.toUpperCase()
  ok(`${p.themeOf(w).label} 的派生色对表`, got === DOC_12[w], `${got} vs ${DOC_12[w]}`)
})
// 大写归一这条不是洁癖：hex 比对时 #443c25 和 #443C25 会判成"全不符"，上一轮就红过一次。
ok('比对前两边都归一大写（不然同一个色会判成不符）',
  WALLS.every((w) => p.chromeOf(w).bg.toUpperCase() === DOC_12[w]))
// 旧 key 不许带出自己的底色：存过 'default' 的人和选象牙的人，底栏必须是同一块面。
const aliasDrift = LEGACY.filter((w) => p.chromeOf(w).bg !== p.chromeOf(p.themeOf(w).key).bg)
ok(`旧 key ${LEGACY.length} 个的派生色等于它解析到的那一枚`, aliasDrift.length === 0, aliasDrift.join(' '))

const thin = []
WALLS.forEach((w) => {
  const c = p.chromeOf(w)
  const r = p.crOf(c.bg, '#F2EFE9')
  if (r < 7) thin.push(`${p.themeOf(w).label} ${r.toFixed(2)}`)
})
ok('纸白字压这四块面都 ≥ 7', thin.length === 0, thin.join(' | '))

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
  ok(`选中那一枚圆底 ${hex} 所在的 sel 也只在 chromeOf 里算一次`,
    (fs.readFileSync(P('utils/palette.js'), 'utf8').match(/--chrome-sel/g) || []).length === 1)
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

// ---------- 3. v19 这一屏：区内两枚 tab + X 式列表 + 卡片两列 ----------
// 10-03 凌晨这一轮把 v18 那两种排布整个换掉了：纸片墙、一行、月份时间轴、置顶、
// 「已分享」色块一起撤，列表区顶上改两枚 tab。所以这一节上一版钉的那些判据**前提已不存在**，
// 留着就是自己钉死自己的假红——按新口径重写，并把撤掉的那几样反向钉住（回来一次红一次）。
const vtRule = rule(idxWxss, 'vtabs'), vtabRule = rule(idxWxss, 'vtab')
const xrowRule = rule(idxWxss, 'xrow'), xdRule = rule(idxWxss, 'xd')
const xT = rule(idxWxss, 'x-t'), xS = rule(idxWxss, 'x-s'), xMore = rule(idxWxss, 'x-more')
const padRule = rule(idxWxss, 'pad'), imgRule = rule(idxWxss, 'pad-img'), gcRule = rule(idxWxss, 'gc')
const gridRule = rule(idxWxss, 'grid2'), catsRule = rule(idxWxss, 'cats')
const srchRule = rule(idxWxss, 'srch'), goRule = rule(idxWxss, 'srch-go')
const chipRule = appWxssRule('chip')
const num = (src, name) => Number(new RegExp(`const ${name} = (\\d+)`).exec(src)[1])
const SUM_LINES = num(idxJs, 'SUM_LINES'), SUM_CHARS = num(idxJs, 'SUM_CHARS')
const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const CODE_WXML = strip(idxWxml), CODE_JS = strip(idxJs), CODE_WXSS = strip(idxWxss)
const dead = (re) => !re.test(CODE_WXSS) && !re.test(CODE_WXML) && !re.test(CODE_JS)

// ①两枚 tab：默认第一枚、小字、已选深色未选浅色、下面一条通栏横线
ok('两枚 tab 在滚动区之外，且默认那枚是「笔记列表」（view 初值 list）',
  idxWxml.indexOf('class="vtabs"') < idxWxml.indexOf('class="cats"')
  && idxWxml.indexOf('class="cats"') < idxWxml.indexOf('class="list"')
  && /view: 'list'/.test(idxJs))
ok('第一枚是新串 tabList、第二枚读现网 navShare（同一个词不在字典里抄第二份）',
  /\{\{t\.tabList\}\}/.test(idxWxml) && /\{\{t\.navShare\}\}/.test(idxWxml)
  && ZH.tabList === '笔记列表' && ZH.navShare === '笔记卡片', `${ZH.tabList} / ${ZH.navShare}`)
ok('两枚都小字：tab 字号 = 分类那枚 chip 的字号（都是 --fs-meta）',
  /font-size: var\(--fs-meta\)/.test(vtabRule) && /font-size: var\(--fs-meta\)/.test(chipRule))
ok('已选那枚只靠颜色+字重+一条短杠跳出来，未选同字号浅色（不做按钮壳）',
  /color: rgba\(35, 37, 44, 0\.42\)/.test(vtabRule)
  && /color: rgba\(35, 37, 44, 0\.9\)/.test(rule(idxWxss, 'vtab\.on'))
  && /font-weight: 700/.test(rule(idxWxss, 'vtab\.on'))
  && /\.vtab\.on::after[\s\S]*?height: 4rpx/.test(idxWxss) && !/background/.test(vtabRule))
ok('通栏横线挂在 .vtabs 上（2rpx 实线，替掉 v18 那条挂在分类行下面的浅虚线）',
  /border-bottom: 2rpx solid rgba\(35, 37, 44, 0\.12\)/.test(vtRule) && !/dashed/.test(catsRule))
ok('横线走到整块卡的边：.vtabs 负外扩把 .sheet 那 24 吃掉再补 32',
  /margin: 0 -24rpx/.test(vtRule) && /padding: 0 56rpx/.test(vtRule))
// ④置顶整个撤：分类行左边那一档、右边那句提示、详情窗那枚按钮、JS 那三个 handler
ok('置顶这一屏整个撤净（档、提示句、窗里那枚按钮、handler 都不在）',
  dead(/pinb|pinn|pinFilter|pinnedOnly|onTogglePinned|onSheetPin/) && !/is_pinned \? t\.unpin/.test(idxWxml))
// 独立详情页那枚 10-03 跟着撤了：列表已经不显示置顶状态，按下去只有一句吐司回应、
// 笔记却会一直顶在最前面且客户端再没有解开的地方——那是个只进不出的门。
const detWxml = io2.readFileSync(P('pages/detail/detail.wxml'), 'utf8')
const detJs = io2.readFileSync(P('pages/detail/detail.js'), 'utf8')
const detWxss = io2.readFileSync(P('pages/detail/detail.wxss'), 'utf8')
const apiJs = io2.readFileSync(P('utils/api.js'), 'utf8')
const I18N = io2.readFileSync(P('utils/i18n.js'), 'utf8')
ok('独立详情页也没有置顶了（那枚按钮、那个 handler、那次请求都不在）',
  !/togglePin|is_pinned/.test(detWxml) && !/togglePin|pinNote/.test(strip(detJs))
  && !/pinNote|\/pin\b/.test(apiJs) && !/\.icon-btn\.on/.test(detWxss))
ok('字典里三串 + 全局那枚墨黑小标签一起删净（Poppins 里有 "pin"，所以只认行首键名和类选择器）',
  !/^\s*(pin|unpin|pinned):/m.test(I18N) && !/^\s*\.pin\s*\{/m.test(appWxss))
ok('字典里那五串跟着撤净，不留没人用的值',
  !/pinFilter|viewDesk|viewRows|pinnedOnly|sharedTag/.test(I18N))
// ④时间轴撤净：竖线、月份档、月/日两层聚堆、stageH 那一整套坐标
ok('时间轴那一整层没了（竖线、月份档、月—行—枚三层坐标一起撤）',
  dead(/rail|rm-ym|bodyrow|class="stage"|class="gp"/) && !/byMonth|byDay|monthKey|dayKey|stageH/.test(idxJs))
ok('一行只剩日期与一枚圆点：那一列 88 宽、竖向居中、行高由内容定（不写死 88）',
  /width: 88rpx/.test(xdRule) && /align-items: center/.test(xdRule)
  && /justify-content: center/.test(xdRule) && !/height: 88rpx/.test(xrowRule)
  && !/border/.test(xrowRule))
ok('横向内缩只挂一次：行、格、两列区都不再补一份 24（补了整屏往右缩 24）',
  !/padding: [\d.]+rpx 24rpx/.test(xrowRule + gcRule + gridRule))
// ②列表那三档：标题 90% 黑一行、摘要 70% 黑三行、末尾蓝字
ok('标题 90% 黑、一行、放不下就省略号',
  /color: rgba\(35, 37, 44, 0\.9\)/.test(xT) && /white-space: nowrap/.test(xT)
  && /text-overflow: ellipsis/.test(xT))
ok('摘要 70% 黑、字号吃 --fs-meta 那一档（原来跟的是头部那句 Tips，10-04 撤了）、最多三行',
  /color: rgba\(35, 37, 44, 0\.7\)/.test(xS) && /font-size: var\(--fs-meta\)/.test(xS)
  && /-webkit-line-clamp: 3/.test(xS))
ok('「显示更多」那支蓝就是 palette 里那支（TONES[1]，与来源链接同一支，不新造蓝）',
  xMore.toUpperCase().includes(p.TONES[1].bg.toUpperCase()) && /font-size: var\(--fs-meta\)/.test(xMore),
  xMore.trim())
ok('「显示更多」画不画的判据与代码同源：三行×每行字数，且从源码现读这两个常量',
  /more: s\.replace\(\/\\s\/g, ''\)\.length > SUM_LINES \* SUM_CHARS/.test(idxJs)
  && SUM_LINES === 3 && SUM_CHARS === 24, `${SUM_LINES}×${SUM_CHARS}`)
ok('「显示更多」不另挂 handler：点整行浮详情窗（一个功能只留一个入口）',
  !/onMoreTap/.test(idxJs + idxWxml) && /catchtap="onRowTap"/.test(idxWxml))
ok('昵称那一截仍只在转存那篇出现，且挂在最后一行右端不抢标题的宽',
  /n\.is_import = n\.source_type === 'share_import'/.test(idxJs)
  && /margin-left: auto/.test(rule(idxWxss, 'x-who')) && !/class="x-t"[\s\S]{0,80}x-who/.test(idxWxml))
ok('头像是一枚 CSS 画的通用 ICON，这一页不引头像图',
  /\.glyph-who::before/.test(idxWxss) && /\.glyph-who::after/.test(idxWxss)
  && !/\.glyph-who\s*\{[^}]*background-image/.test(idxWxss))
ok('日期仍只走 utils/date.js 那一档 MM/DD，页面里不抄第二份补零',
  /formatShortDate\(n\.created_at\)/.test(idxJs) && !/padStart/.test(idxJs)
  && !/formatYearMonth/.test(idxJs))
// ②bis 卡片那一枚：两列、白垫固定一档、图居中、第二行页码、只画生成过的
ok('两列等宽铺满：340 + 22 + 340 = 区内净宽 702（.sheet 左右各内缩 24）',
  /width: 340rpx/.test(gcRule) && /gap: 22rpx/.test(gridRule) && 340 * 2 + 22 === 702)
ok('白垫固定一档 340×474、图 312×446 落在正中（比它扁的那几套上下各一道白）',
  /width: 340rpx/.test(padRule) && /height: 474rpx/.test(padRule)
  && /width: 312rpx/.test(imgRule) && /height: 446rpx/.test(imgRule)
  && /align-items: center/.test(padRule) && /justify-content: center/.test(padRule))
ok('图用 aspectFit（按宽贴合、不裁不拉），白垫 overflow:hidden 兜住圆角',
  /mode="aspectFit"/.test(idxWxml) && /overflow: hidden/.test(padRule))
/* 站长 10-03 23:40 做减法：「一个笔记同一时间只能生成一张笔记卡片，要改存量的必须删除旧的
   才能新增。原来的 <1/3> 去掉。」→ 翻页那一套整块撤净，不是隐藏。 */
ok('一篇一张：‹ i/n › 那一行两处都撤净（卡片那一屏与详情窗那一格），箭头与页码的类名也不留',
  !/g-pg|g-step|onCardStep|ds-pg|ds-step|onSheetCardStep|detailCardIdx/.test(CODE_WXML)
  && !/\.g-pg|\.g-step|\.g-n|\.ds-pg|\.ds-step|\.ds-n/.test(CODE_WXSS))
ok('一篇一张：js 里那个"当前第几张"的指针整个不存在（cells 也不再带 cur）',
  !/detailCardIdx|cur: 0|\.cur\b|onCardStep|onSheetCardStep/.test(CODE_JS))
ok('卡片那一格只从同一份 notes 里挑（顺序与列表天然一致，不另拉一次数据）',
  /const cells = \[\][\s\S]*notes\.forEach\(\(n, i\)/.test(idxJs) && !/getCards|cardList/.test(idxJs))
ok('空台账那一格画的是空态那一句（不是白板）',
  /class="empty"[\s\S]*?\{\{t\.noCards\}\}/.test(idxWxml) && ZH.noCards === '还没有生成过卡片')
// ③搜索条：压高度 + 那两个字降到分类那一档
ok('搜索条压到 60（分类那枚 chip 实测算高 59，同一档）',
  /height: 60rpx/.test(srchRule) && !/height: 88rpx/.test(srchRule))
ok('「搜索笔记」与分类同字号同字重（原来 31/800 比正文还大一级）',
  /font-size: var\(--fs-meta\)/.test(goRule) && /font-weight: 600/.test(goRule)
  && !/fs-title/.test(goRule))
ok('输入里的字没动（仍 --fs-body，这轮只压条子和那两个字）',
  /font-size: var\(--fs-body\)/.test(appWxssRule('srch-input') || rule(idxWxss, 'srch-input')))
// ②末尾：全文窗还是现网那一层，只把墨色对齐列表那两档
/* 枚数从 3 改 2 是 v22（站长 10-03 第四轮）定的：底排那枚「生成笔记卡片」整块挪进
   右上那一格，底排只剩 编辑／删除，各 flex:1。原来这条钉的是"09-30 那批四枚并排留下的
   三枚 + 1/1/1.4 那一档"，`.ds-ibtn.primary` 这个类早就跟着那枚按钮一起没了——
   这条从 57227ff 起一直红着没人复跑，是判据过期，不是实现回退。 */
ok('详情窗底排两枚（编辑／删除，出卡片的口已挪进右上那一格），等宽一档',
  (idxWxml.match(/class="ds-ibtn/g) || []).length === 2
  && /display: flex/.test(rule(idxWxss, 'ds-irow')) && /flex: 1/.test(rule(idxWxss, 'ds-ibtn'))
  && !/ds-ibtn\.primary/.test(idxWxss) && !/class="ds-ibtn primary/.test(idxWxml))
ok('窗里标题与要点前景 = 列表那档 90% 黑，正文段落 = 摘要那档 70% 黑',
  /color: rgba\(35, 37, 44, 0\.9\)/.test(rule(idxWxss, 'ds-h2'))
  && /color: rgba\(35, 37, 44, 0\.7\)/.test(rule(idxWxss, 'ds-para'))
  && /color: rgba\(35, 37, 44, 0\.9\)/.test(rule(idxWxss, 'ds-pt-x')))
ok('公开状态那一行留着（列表里那枚色块撤了之后，"这篇公不公开"只有这一处说）',
  /ds-pub/.test(idxWxml) && /t\.sharedNow/.test(idxWxml))
// 本机台账：记在"人真留下这张"那一刻。1.9.12 记的是"画布落出一张图"，而打开弹窗、每滑一次
// 模板、每开关一次码都会重画一次——站长 10-03 真机两句："我明明没有生成 5 张" + "小图完全不匹对"。
const shareJs = io2.readFileSync(P('pages/share/share.js'), 'utf8')
const cardLogJs = io2.readFileSync(P('utils/cardLog.js'), 'utf8')
const keepPoster = (CODE_JS.split('async _keepPoster()')[1] || '').split('\n  },')[0]
const keepCard = (strip(shareJs).split('async _keepCard()')[1] || '').split('\n  },')[0]
const renderPoster = (CODE_JS.split('async _renderPoster()')[1] || '').split('async _keepPoster()')[0]
ok('首页记在两条"留下"的口上：图片面板 success 与存相册 success 都走 _keepPoster',
  /cardLog\.record\(a\.noteId, this\.data\.posterTpl, this\.data\.noQr, this\._posterCanvas, this\)/.test(keepPoster)
  && /success: async \(\) => \{ await this\._keepPoster\(\); this\._closeTemplate\(\) \}/.test(CODE_JS)
  && /success: async \(\) => \{\s*await this\._keepPoster\(\)/.test(CODE_JS))
ok('海报页同一条：存相册成功才走 _keepCard，模板与带没带码都是画那一趟存下来的',
  /cardLog\.record\(this\._note\.id, this\._renderedTpl, this\._renderedNoQr, this\._canvasNode, this\)/.test(keepCard)
  && /success: async \(\) => \{\s*await this\._keepCard\(\)/.test(strip(shareJs))
  && /this\._renderedTpl = this\.data\.picked \|\| profile\.template/.test(strip(shareJs))
  && /this\._renderedNoQr = !!this\.data\.noQr/.test(strip(shareJs)))
ok('画布落图那一步不再记账（_renderPoster 里不许出现 record，滑一次模板多一张就是它）',
  !/cardLog\.record/.test(renderPoster) && /this\._posterCanvas = canvas/.test(renderPoster))
ok('格子里第一张＝最近留下的那张（台账按 at 倒序；顺着放就会拿最早那张当封面）',
  /sort\(\(x, y\) => \(y\.at \|\| 0\) - \(x\.at \|\| 0\)\)/.test(CODE_JS))
/* 小图 ↔ 大图必须一一对上（站长 10-03 真机报的严重 BUG：「点小图，和大图没有关联。
   无论点什么小图，都是同一个大图」）。两处根因：onSheetToPoster 读的是「我的→卡片模板」
   那套默认模板，跟台账里他刚点的这一张无关；而从卡片那一枚的格子点进去，指针一律归 0。 */
const sheetFn = (CODE_JS.split('async onSheetToPoster()')[1] || '').split('\n  },')[0]
ok('点开大图取的是「台账里那一张」的模板，不是卡片模板页那套默认（那套已不在 TEMPLATES 里才退回默认）',
  /const cur = \(this\.data\.detailCards \|\| \[\]\)\[0\]/.test(sheetFn)
  && /posterTpl: known \? cur\.tpl : \(profile\.template \|\| poster\.DEFAULT_TEMPLATE\)/.test(sheetFn)
  && /poster\.TEMPLATES\.some\(\(x\) => x\.id === cur\.tpl\)/.test(sheetFn))
ok('大图连二维码开关也照那一张摆（noQr 得先存进台账，两头才有一个共同来源）',
  /noQr: known \? !!cur\.noQr : false/.test(sheetFn)
  && /keep\.push\(\{ p: filePath, tpl: tplId, at, noQr: !!noQr \}\)/.test(cardLogJs))
ok('两态底排：未生成态是「取消｜编辑个人名片」+ 通栏「生成分享图」；已生成态是通栏「分享卡片」+「取消｜删除」+ 一句说明',
  /<block wx:if="\{\{posterHasCard\}\}">/.test(CODE_WXML)
  && /tpl-btn danger" bindtap="onDropCard"/.test(CODE_WXML)
  && /t\.cardDropHint/.test(CODE_WXML)
  && /<block wx:else>/.test(CODE_WXML)
  && /tpl-btn" bindtap="onOpenCardInfo"/.test(CODE_WXML))
ok('药丸上面那行小字说的是状态、按钮中间那行只说干什么（旧那两句"带／无二维码分享"撤净，中英两份都撤）',
  /pill-lab">\{\{noQr \? t\.qrOff : t\.qrOn\}\}/.test(CODE_WXML)
  && /<text>\{\{t\.posterMake\}\}<\/text>/.test(CODE_WXML)
  && !/qrShareOn|qrShareOff/.test(CODE_WXML) && !/qrShareOn|qrShareOff/.test(I18N))
ok('已生成态不给换模板：滑动手势与那排圆点都跟着这一态关掉（留着会以为还能滑）',
  /posterBusy \|\| this\.data\.posterHasCard/.test(CODE_JS)
  && /tpl-dots" wx:if="\{\{!posterHasCard\}\}/.test(CODE_WXML)
  && /grip-tx-l" wx:if="\{\{!posterHasCard\}\}/.test(CODE_WXML))
/* 站长 10-04 补的一枚：已生成态上面给一枚通栏「分享卡片」，把台账里那一张再发一次
   （没有它，一张卡发完就锁死了——只能删了重出才能再发）。三处要钉：
   ① 它吃的是 .tpl-main 同一套样式，而这一套底色全站统一走 --btn-bg（＝底栏选中那一格那块圆底）；
   ② 它一次都不记账（记账只挂在"第一次真留下这张"那一步，重发不该多出文件、不该动排序）；
   ③ 那行字三项照他 10-04 的原话：微信好友／朋友圈／公众号。他给的口径是"转发贴图本身就是
      公众号的一条路，点了拉起自己的公众号发帖"；面板里实际给到哪几项由微信系统层决定。
      **这一条我上一轮自己砍过一次（只写两项、还把它当结论写进注释），这次钉回去。** */
const shareCardFn = (CODE_JS.split('onShareCard()')[1] || '').split('\n  },')[0]
ok('已生成态上面那枚通栏绑的是 onShareCard，复用 .tpl-main（底色吃 --btn-bg，字吃 --btn-ink）',
  /class="tpl-main \{\{posterImagePath \? '' : 'disabled'\}\}" bindtap="onShareCard"/.test(CODE_WXML)
  && (CODE_WXML.indexOf('bindtap="onShareCard"') < CODE_WXML.indexOf('bindtap="onDropCard"'))
  && /\.tpl-main\s*\{[\s\S]*?background: var\(--btn-bg\);\s*color: var\(--btn-ink\)/.test(CODE_WXSS))
ok('这一枚发的就是画布上那一张（直接递 posterImagePath，不重画、不再走 cardLog、也不走那条会记账的 _saveToAlbum）',
  /const path = this\.data\.posterImagePath/.test(shareCardFn)
  && /wx\.showShareImageMenu\(\{\s*path,/.test(shareCardFn)
  && !/_keepPoster|cardLog|_saveToAlbum/.test(shareCardFn)
  && /saveImageToPhotosAlbum/.test(shareCardFn))
ok('面板走完那层黑一定撤（complete 那一环漏了就是把人关在黑屏里，1.9.13 栽过）',
  /complete:\s*\(\)\s*=>\s*this\.setData\(\{\s*shareDim:\s*false/.test(shareCardFn))
ok('那行字三项照站长原话：微信好友 / 朋友圈 / 公众号，中英各一份（上一轮我砍成两项，这条钉死别再砍）',
  /cardShare: '分享卡片：微信好友 \/ 朋友圈 \/ 公众号'/.test(I18N)
  && /cardShare: 'Share card: Chat \/ Moments \/ Official Account'/.test(I18N)
  && /<text>\{\{t\.cardShare\}\}<\/text>/.test(CODE_WXML))
ok('「删除」只动本机这本账：调 cardLog.dropNote 之后回详情窗，api 一行都不提它（服务端那张活码不碰）',
  /onDropCard\(\) \{[\s\S]{0,240}cardLog\.dropNote\(note\.id\)[\s\S]{0,120}this\._closeTemplate\(\)/.test(CODE_JS)
  && !/deleteCard|dropCard/ig.test(apiJs))
/* 真机两轮（站长 10-03 20:42 与 21:20）：小弹窗浮起来时被成品弹窗整个盖住，只有输入框那行字
   漏出来（input 在 iOS 是原生层）。第一轮量出来是"102 画在 101 底下"，第二轮把那一层
   `visibility:hidden` 藏掉之后他原话「还没修好，依旧这样」——**所以这条只能钉静态，模拟器两轮都绿**。
   现在这一态把成品弹窗整层从渲染树里摘掉（和「我的」页私密密码那一层同构，那一层真机是好的），
   并照那一层把两只 input 的 adjust-position 关掉（不让微信顶整页）。 */
ok('小弹窗这一态：成品弹窗两样都挂同一个 wx:if（整层不渲染，不是藏）、旧那套 ci-behind 撤净',
  /wx:if="\{\{templateOpen && !cardInfoOpen\}\}" class="float-mask"/.test(CODE_WXML)
  && /wx:if="\{\{templateOpen && !cardInfoOpen\}\}" class="float-sheet tpl-sheet"/.test(CODE_WXML)
  && !/ci-behind/.test(CODE_WXML) && !/ci-behind/.test(CODE_WXSS))
ok('名片小弹窗两只 input 都关掉 adjust-position（抄 me.wxml 私密密码那一层真机验过的口径）',
  (idxWxml.match(/class="ci-input"[^>]*adjust-position="\{\{false\}\}"/g) || []).length === 2)
/* 第三轮（站长 10-03 22:47 真机两张）：整层看得见、选图也正常——**层序那一刀是修好的**。
   新红的是"一网点到下面那栏输入框，屏上换回成品弹窗"。`cardInfoOpen` 全仓只有两处写
   （onOpen 置 true／onClose 置 false），所以那一拍只能是被遮罩的 bindtap 收走的：
   键盘弹起那一下原生输入层与 webview 的落点对不上，点输入框被算成"点空白收回"，
   这一层一关，`templateOpen && !cardInfoOpen` 成立，成品弹窗就回来了。
   修法是不再让遮罩管收回（它只挡穿透），收回只留「取消｜保存」两枚。 */
ok('小弹窗的遮罩不绑收回（只 catchtap 挡穿透）：点空白不许把这一层关掉',
  /class="ci-mask" catchtap=""/.test(CODE_WXML) && !/class="ci-mask"[^>]*onCloseCardInfo/.test(CODE_WXML))
ok('收回这一层只剩一个口：wxml 里绑到 onCloseCardInfo 的只有「取消」那一枚（注释里提不算）',
  (CODE_WXML.match(/(bind|catch)tap="onCloseCardInfo"/g) || []).length === 1)
/* 站长 10-03 23:20 提的那条：大图改了形象和名字，台账里那枚小图还是旧的，人返回笔记以为没改成功。
   补的是 cardLog.refresh——**只覆盖已有那一条、绝不新增**（在这儿多记一笔就把 #277 那条
   "不许虚增"的口径破了），而且 `at` 保留原值（那一格按 at 倒序，刷新内容不该把它顶到最前）。 */
ok('上一把那条"改完名片把台账就地覆盖"的链整个撤掉（一篇一张之后没有改存量这条路，不留死代码）',
  !/refresh/.test(cardLogJs) && !/_ciSyncCard/.test(CODE_JS))
ok('1.9.12 那本按渲染时机记的旧账整个清一次、清完立标记（require 时就跑，只跑这一次）',
  /const MODE_KEY = 'cardLogKeepOnly'/.test(cardLogJs) && /^migrateKeepOnly\(\)$/m.test(cardLogJs))
ok('台账是本机的事：键名 cardLog、图落在用户文件目录、api.js 里一行都不提它',
  /const KEY = 'cardLog'/.test(cardLogJs) && /USER_DATA_PATH/.test(cardLogJs)
  && !/cardLog/.test(io2.readFileSync(P('utils/api.js'), 'utf8')))
ok('文件名带时间戳（本地图片按路径缓存位图，同名换内容界面仍是第一张）',
  /\$\{DIR\}\/\$\{noteId\}-\$\{tplId\}-\$\{at\}\.jpg/.test(io2.readFileSync(P('utils/cardLog.js'), 'utf8')))
// copyFile 的目标键是 destPath 不是 filePath——写成 filePath 时微信不报"不认识的参数"，
// 只回一句 `destPath … should be String instead of Undefined`，图静默不落盘（10-03 真跑抓的）。
ok('copyFile 用的是 destPath（写成 filePath 位图就不落盘，只有真跑露得出来）',
  /destPath: filePath/.test(io2.readFileSync(P('utils/cardLog.js'), 'utf8'))
  // 反向钉简写属性那一种写法（`filePath,` 单占一行）；`destPath: filePath,` 里也含 filePath，
  // 所以只能按"整行就一个简写属性"来判，不能直接搜字面量。
  && !/^\s*filePath,$/m.test(io2.readFileSync(P('utils/cardLog.js'), 'utf8')))
const cardLog2 = io2.readFileSync(P('utils/cardLog.js'), 'utf8')
ok('同一篇只留最新一张——旧的不管出自哪套模板，连文件一起撤（要改存量只能先删）',
  /\(map\[noteId\] \|\| \[\]\)\.filter\(\(x\) => \{ dropFile\(x\.p\); return false \}\)/.test(cardLog2))
ok('存量归一只跑一次：立 cardLogOnePerNote 标记，留下按时间最新的那张、其余连文件删掉',
  /const ONE_KEY = 'cardLogOnePerNote'/.test(cardLog2)
  && /^migrateOnePerNote\(\)$/m.test(cardLog2)
  && /if \(wx\.getStorageSync\(ONE_KEY\) === 1\) return false/.test(cardLog2)
  && /map\[id\] = keep \? \[keep\] : \[\]/.test(cardLog2))
ok('删笔记时那一格的台账与文件一起清（不留孤儿位图）',
  /cardLog\.dropNote\(note\.id\)/.test(idxJs))
// v18 那一族色仍在 palette 活一份（这一屏不读了，但别的效果图与回滚点还指着它）
// SHARED_TAG.ink 是 #FFFFFF，这一页本来就有别处在用白字，拿它扫样式表是一句假红；
// 那枚色块撤没撤由下面那条「不再读纸片那一族」和反向钉 shared-tag 一起管。
ok('莫兰迪那四枚仍只在 palette 活一份，样式表里一个字都没有',
  p.PAPERS.every((x) => !new RegExp(x.bg, 'i').test(idxWxss))
  && p.PAPERS.every((x) => !new RegExp(x.ink, 'i').test(idxWxss)))
ok('「显示更多」那支蓝在样式表里只出现一次，且值就是 palette.TONES[1]（与 .ds-link 同一处先例）',
  (idxWxss.match(new RegExp(p.TONES[1].bg, 'i')) || []).length === 1
  && /color: #3F52D6/.test(rule(idxWxss, 'x-more')) === /color: #3F52D6/.test(rule(idxWxss, 'ds-link')))
// 扫的是剥掉注释之后的代码：index.js 里有一句"这一族随 v19 一起撤了"的说明，
// 拿原文扫会被自己的注释判成假红。
ok('这一屏不再读纸片那一族（paperSkinFor 在列表页没有后代了）',
  dead(/paperSkinFor|SHARED_TAG|posOf|shared-tag/) && !/paperSkinFor|SHARED_TAG|posOf/.test(CODE_JS)
  && typeof p.paperSkinFor === 'function')
ok('排布档不再是本机偏好（listMode 那个键整个撤了，两枚 tab 不落本机）',
  !/listMode|LIST_MODE_KEY/.test(idxJs) && !/setStorageSync\('view'\)/.test(idxJs))
ok('列表里没有"就地展开"这一态（点一行 / 点一格 = 开详情窗）',
  !/openIdx/.test(idxJs + idxWxml) && /this\._openDetail\(idx[,)]/.test(idxJs))
ok('D2 那一排（点 + 分类名 + meta 行）从列表退了，分类两档仍从 palette 递进详情窗',
  !/class="cat[ "]/.test(idxWxml) && !/catLabel|tagLine|catRing/.test(idxJs + idxWxml)
  && /color: var\(--cat-ink\)/.test(rule(idxWxss, 'ds-tag')))

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
// 空心环那一档本来是给深色那两枚的，10-04 四枚全浅色之后它没有主人了。
// 字段还在（palette 仍按 theme.dark 给），这里钉两件仍然成立的事：四枚都是实心点。
ok('四枚的未分类都是实心点（不再有深色壁纸走空心环）',
  WALLS.every((w) => p.catSkinFor(null, w).ring === false))
// 空心环那条（深色壁纸下未分类换成一圈描边）10-02 v18 起在列表里没有主人了——
// 上面第 3 节钉的是"样式与绑定一起撤净"，这里只钉 palette 那个字段还在（别的页还读它）。
// 10-04 起四枚都带色阶，而色阶第一档压卡底只有 1.27~1.37（原色会化掉），
// 所以点一律跟着算出来的字色走。原来那条"浅壁纸点色留原色（芥末黄 1.63）"的前提没了——
// 那五支彩色在界面上已经不出场，只有海报那条 toneFor 还留着。
ok('四枚下点与字同值（色阶原色在卡上会化掉）',
  WALLS.every((w) => p.catSkinFor(1, w).dot === p.catSkinFor(1, w).text))

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
