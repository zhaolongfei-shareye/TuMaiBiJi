// 首页统一录入条这一批的静态尺子（不连模拟器，纯读文件）。
// 跑法：node docs/工具/验-统一录入条.js
//
// 10-08 创建入口改版：这把整段重写。原来那 60 多条钉的是"白纸面板 + 四个模式标签 +
// 标题／分类同一行 + 那排「粘贴／保存」按钮"，这一轮那些承载方式**全部作废**（不是实现坏了，
// 是站长拍的新方案把它们换了），照着旧判据改代码等于把改版撤回去。
// 现在的判据对着效果图 docs/design/创建入口重设计 - 三方向/创建入口-v7-B为基-两档面板.html 那一份写，
// 每一个几何数都从 WXSS/palette 现读再算，不钉抄来的常量。
//
// 要守的东西：功能一个都不能少、入口只能有一个、颜色只能从 palette 来、
// 条身那句话必须跟着语言切、滑动确认那一枚的四个态与三档提交时序不许分家。
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

const wxml = fs.readFileSync(P('pages/create/create.wxml'), 'utf8')
const wxssRaw = fs.readFileSync(P('pages/create/create.wxss'), 'utf8')
const wxss = wxssRaw.replace(/\/\*[\s\S]*?\*\//g, '')
const js = fs.readFileSync(P('pages/create/create.js'), 'utf8')
const i18n = require(P('utils/i18n.js'))
const palette = require(P('utils/palette.js'))
const zh = i18n.texts('zh')
const en = i18n.texts('en')

// 只扫"这一个选择器自己那一段"：选择器必须顶到行首，否则 `.container.has-bg .panel {`
// 会被当成 `.panel` 那一段先命中，读到的就不是面板自己的规则了。
const seg = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(wxss)
  return m ? m[1] : ''
}
// 令牌表：app.wxss 的 :root 那一批（--fs-* / --sp-* / --w-edge / --r-*）。
// 几何数现在有一半写在令牌里（.md 的字号、各处描边宽度），只认字面量 rpx 的读法会读出 NaN，
// 然后整条算式假绿——所以这里把 var() 一并解到位，解不出来就是 NaN，判据会红。
const appCss = fs.readFileSync(P('app.wxss'), 'utf8')
const TOK = {}
;(appCss.match(/--[a-z0-9-]+:[^;\n]+;/g) || []).forEach((d) => {
  const i = d.indexOf(':')
  const k = d.slice(2, i).trim()
  if (!(k in TOK)) TOK[k] = d.slice(i + 1, -1).trim()   // :root 在最前，同名取第一次出现的那档
})
const resolve = (v) => {
  const m = /^var\(--([a-z0-9-]+)\)$/.exec(v)
  return m ? (TOK[m[1]] !== undefined ? resolve(TOK[m[1]]) : NaN) : v
}
// 把一条声明里所有"带单位的长度"解成 rpx 数值数组（px 单位这一页不用，见到就 NaN 报红）
const lens = (css, prop) => {
  const m = new RegExp(prop + ':\\s*([^;]*)').exec(css)
  if (!m) return []
  return m[1].split(/\s+/).map((tok) => {
    if (!tok || !/^-?[\d.]+(rpx|var)/.test(tok) && !/^var\(/.test(tok)) return null
    const v = resolve(tok)
    if (typeof v !== 'string') return null
    const n = /^(-?[\d.]+)rpx$/.exec(v)
    return n ? Number(n[1]) : null
  }).filter((x) => x !== null)
}
const num = (css, prop) => (lens(css, prop)[0] !== undefined ? lens(css, prop)[0] : NaN)

// ---------- 1. 文案：三条新串两门都有，五条退役串一处不剩 ----------
;['chooseMode', 'slideExtract', 'maxShots', 'modePhoto'].forEach((k) => {
  ok(`i18n.${k} 中文有`, !!zh[k])
  ok(`i18n.${k} 英文有`, !!en[k])
})
ok('maxShots 两门都留了 {n} 位（张数从常量拼，不写进句子里）',
  /{n}/.test(zh.maxShots) && /{n}/.test(en.maxShots), `${zh.maxShots} / ${en.maxShots}`)
// 那五支是上一代的承载方式说的话：条身按模式换字、已选 N 张、保存后可提炼、先写个标题、开始提炼按钮。
;['barUrl', 'barShot', 'pickedCount', 'urlHintIdle', 'linkReady', 'needTitle', 'writeTitlePh',
  'writeBodyPh', 'startExtract', 'albumDesc', 'takePhotoHint', 'fromAlbumHint', 'addMore',
  'guide1T', 'guide1D', 'guide2T', 'guide2D', 'guide3T', 'guide3D', 'guide4T', 'guide4D']
  .forEach((k) => {
    ok(`退役的键 ${k} 字典里没了`, zh[k] === undefined && en[k] === undefined)
    ok(`退役的键 ${k} 页面里也不再引用`, !new RegExp('\\bt\\.' + k + '\\b').test(wxml + js))
  })
// ➕ 那一枚方格的 aria-label 要说清"拍或选都行"，这一支留着就是给它用的
ok('importScreenshot 还在（➕ 那格的可读名）', !!zh.importScreenshot && !!en.importScreenshot
  && /t\.importScreenshot/.test(wxml))
ok('中英键数相等', Object.keys(zh).length === Object.keys(en).length,
  Object.keys(zh).length + ' vs ' + Object.keys(en).length)
ok('拍照/相册两枚圈的标签复用现网串', zh.takePhoto === '拍照' && zh.fromAlbum === '相册')
ok('三个标签都是单个词级：照片/链接/文字',
  zh.modePhoto === '照片' && zh.modeUrl === '链接' && zh.modeWrite === '文字')
/* 「直接写」那一档的占位字：标题已经不在这一屏填了，所以这句不能再提"标题"
   （10-08 站长口径：砍一个输入框，标题和分类到详情页改）。 */
ok('文字档那句占位字说的是原文与摘要，不再承诺标题',
  !/标题/.test(zh.manualDesc) && /摘要/.test(zh.manualDesc), zh.manualDesc)
// 英文那侧必须放得进一行：框内宽 = 566(卡内) − 28×2(左右内缩) = 510rpx，28rpx 字号按 14rpx/字算放得下 36 个字符
const phEn = en.manualDesc
ok('英文占位字放得进单行框（≤36 字符，折行=红）', phEn.length <= 36, `${phEn.length}：${phEn}`)

// ---------- 2. 结构：收起一条、展开三枚标签、面板里只剩两样控件 ----------
ok('旧的三张入口卡已经拆掉', !/class="card entry/.test(wxml))
ok('没有残留的手风琴开关', !/toggleCard/.test(wxml) && !/toggleCard/.test(js))
ok('条身只有一条', (wxml.match(/class="bar[ "]/g) || []).length === 1)
ok('条身只在收起态渲染（展开时整条让位给面板）',
  /<view wx:if="{{!active}}" class="bar" catchtap="openBar">/.test(wxml)
  && !/class="bar \{\{active/.test(wxml))
ok('条身那句永远是 barIdle（不再按模式换字）',
  /class="bar-label">\{\{t\.barIdle\}\}/.test(wxml))
ok('旧的 .bar.open 与条内 hint 整段撤净', !/\.bar\.open/.test(wxss) && !/bar-hint/.test(wxml + wxss))
// 收起态条身右边那三枚小圆：站长 10-09 撤了（原话"原来横条右边那三个按钮不清晰，
// 默认就是直接拍照那一档"）。原来那两条"正好三枚／各自指向 camera|album|url"改成钉**撤净**，
// 并补一条正面口径：点条身落的仍是 photo 那一档（那是 10-08 就换好的默认，不是这次新加的）。
ok('条身那三枚小圆整块撤净（.bar-dots／.dot／两个 handler 任一回来都算两版并存）',
  !/class="dot"/.test(wxml) && !/bar-dots/.test(wxml + wxss)
  && !/onDotShot|onDotUrl/.test(js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')))
ok('点条身进的就是拍照那一档（openBar 落 photo；相册与链接仍从面板里进）',
  /openBar\(\)\s*\{[\s\S]{0,200}this\.open\('photo'\)/.test(js)
  && /data-source="album"/.test(wxml) && /data-tab="url"/.test(wxml))
// 站长 10-09 另一句：「调亮度和换背景换到日期下方」。
// 这一条钉的是**顺序与归属**，不是样式：那一行必须排在 date-row 之后、录入条容器之前，
// 且不再住在 `.entry-wrap` 里面（住在里面就会跟着面板一起被让位逻辑管着）。
const iDate = wxml.indexOf('class="date-row"')
const iSwap = wxml.indexOf('class="home-swap"')
const iEntry = wxml.indexOf('class="entry-wrap"')
ok('「调亮度｜换背景」那一行搬到了日期下面、录入条上面（三个节点的先后顺序）',
  iDate > -1 && iSwap > iDate && iEntry > iSwap,
  `date ${iDate} / swap ${iSwap} / entry ${iEntry}`)
ok('那一行全页只有一份（搬走就别留第二份；上面那条比的是第一个位置，这条才咬得住重复）',
  (wxml.match(/class="home-swap"/g) || []).length === 1,
  `${(wxml.match(/class="home-swap"/g) || []).length} 份`)
ok('展开态正好三个标签（相册并进照片，不再是独立一档）',
  (wxml.match(/class="md /g) || []).length === 3 && !/data-mode="album"/.test(wxml))
ok('标签只有 photo / url / write 三个落点',
  ['photo', 'url', 'write'].every((x) => new RegExp('data-tab="' + x + '"').test(wxml)))
ok('面板自己吃掉点击，不会一点输入框就收起', /class="panel[^"]*" [^>]*catchtap="noop"/.test(wxml))
ok('整页仍是收起点击区', /bindtap="collapse"/.test(wxml))
// 「选择记录模式 / 点空白处收起」这一行在面板**外面**（站长原话「移出框外」）。
// 只查两段文字在不在等于没查——要看它在 DOM 里的位置：必须在 .panel 那个节点之前。
const outAt = wxml.indexOf('class="out"')
const panelAt = wxml.indexOf('class="panel ')
ok('那一行小字存在且排在面板之前（在框外）',
  outAt > -1 && panelAt > outAt && /<view wx:if="{{active}}" class="out">/.test(wxml),
  `out@${outAt} panel@${panelAt}`)
ok('那一行两枚：左边选模式、右边说怎么退',
  /class="out-l">\{\{t\.chooseMode\}\}<\/text>\s*<text class="out-r">\{\{t\.barCollapse\}\}/.test(wxml))
// 面板肚子里只剩"一个框（或一横排小图）+ 一枚条"：那排按钮、四步指引、清空、粘贴都不该回来
ok('面板里没有那排按钮（清空/粘贴/保存/取消全撤）', !/class="acts"/.test(wxml) && !/catchtap="pasteUrl|catchtap="clearShots|catchtap="cancelWrite/.test(wxml))
ok('四步指引整批撤净（模板、引用、样式都没有）',
  !/entryGuide/.test(wxml) && !/\.guide\s*\{/.test(wxss) && !/guide1T/.test(js))
ok('链接档只有一个输入框，没有第二个（标题格撤了）',
  (wxml.match(/<input\b/g) || []).length === 1 && !/writeTitle/.test(wxml + js))
ok('文字档是一个 textarea（长原文要能换行）', /<textarea/.test(wxml))
// 提示词全在框里：placeholder 必须是字典里的句子，不是硬写的 https://
ok('链接框的提示词吃 linkDesc（不再有写死的 https 样例）',
  /placeholder="\{\{t\.linkDesc\}\}"/.test(wxml) && !/mp\.weixin\.qq\.com/.test(wxml))
ok('文字框的提示词吃 manualDesc', /placeholder="\{\{t\.manualDesc\}\}"/.test(wxml))
ok('那一行画在框外（面板之前），且权限那一类可点进设置',
  /class="out-err" catchtap="openPermSetting">\{\{hintLine\}\}/.test(wxml) && outAt > -1 && wxml.indexOf('out-err') < panelAt)
/* 那句"正在输但不像链接"的规则行是现网一直有的（原来由 urlHint==='bad' 单独驱动一行）。
   10-08 把它并进 hintLine 一位驱动——并的时候漏掉过一半：只剩 errLine，打字过程中界面一句都不说，
   要等滑到底才报。所以这里两头都钉：一位算出来要含那句规则，且每个会改 errLine 的出口都要过一遍 _sync。 */
ok('hintLine = 报错优先，其次链接那一档"还不像链接"那句规则',
  /hintLine: errLine \|\| \(active === 'url' && urlHint === 'bad' \? t\('linkRule', lang\) : ''\)/.test(js))
const errSets = (js.match(/setData\(\{[^}]*errLine:/g) || []).length
const syncAfterErr = (js.match(/errLine:[^\n]*\n[\s\S]{0,320}?this\._sync\(\)/g) || []).length
ok('每一处写 errLine 的路径都跟着过一遍 _sync（否则那一行会停在上一句）',
  errSets >= 5 && syncAfterErr >= errSets - 2, `${errSets} 处写报错 / ${syncAfterErr} 处补了 _sync`)
ok('空着滑到底：说一句、圆回弹（效果图 off 态那条），只有真有东西才钉在最右',
  /const go = reached && this\.data\.ready/.test(js)
  && /knobRpx: go \? SLD_MAX_RPX : SLD_REST_RPX/.test(js))

// 真跑那把（验-录入面板沉底-真跑.js）量"卡里最后一块沉到底没有"时，只能按类名一枚一枚 selectAll：
// 这台工具的 selectorQuery **不认子选择器 `>`，也不认逗号表**（10-08 实测，两种写法都回 0 块），
// 于是名单漏一枚就是"量不到却一条不响"。这里把名单里每一枚钉成"wxml 里有这个 class、wxss 里有这条规则"，
// 改名这一类漂移会红；真要往卡里加第六块，名单得跟着加（这条钉不住漏加，是它够不到的地方，写明白）。
ok('卡里那一层的块名就是真跑名单那五枚（改名要一起改名单）',
  ['crow', 'strip', 'field', 'wr-sw', 'sld'].every((c) => new RegExp(`class="${c}[ "]`).test(wxml)
    && new RegExp(`\\.${c}\\s*\\{`).test(wxss)))

// ---------- 3. 一个功能只留一个入口 ----------
ok('换背景只是导流，不弹相册', /goHomeBg\(\)\s*\{\s*wx\.navigateTo/.test(js) && !/goHomeBg[\s\S]{0,200}chooseMedia/.test(js))
ok('导流目标还是那一页', /navigateTo\(\{ url: '\/pages\/profile\/profile' \}\)/.test(js))
ok('选图入口全页只有 pickImage 一处', (js.match(/wx\.chooseMedia/g) || []).length === 1)
ok('换背景那一行只在铺了图时存在，且面板展开那一趟整个不渲染（它一在就跟底栏抢那一段）',
  /wx:if="\{\{bgSrc\}\}" class="home-swap"/.test(wxml)
  && /\.container\.entry-dock \.home-swap\s*\{[^}]*display:\s*none/.test(wxss))
ok('➕ 那一格是唯一"再加一张"的落点', (wxml.match(/catchtap="onAddShot"/g) || []).length === 1)

// ---------- 4. 状态机：一个 active 说清当前那一档 ----------
ok('active 三档，且没有第四种值写在页面上',
  /'' \| 'photo' \| 'url' \| 'write'/.test(js) && !/=== 'shot'/.test(js))
ok('旧的 mode 那一位撤干净（不再一个状态两处记）',
  !/\bmode:/.test(js) && !/data-mode=/.test(wxml) && !/this\.data\.mode/.test(js))
ok('camera / album 两个来源仍归 pickImage 管（并进照片那一档的两个落点）',
  /sourceType = source === 'any' \? \['album', 'camera'\] : \[source\]/.test(js))
ok('滑动条圆里的图形按三档给：照片=images、链接=link、文字=pen',
  /sldIconFor\(active\)/.test(js) && /photo: 'images', url: 'link', write: 'pen'/.test(js)
  && ['glyph-pen', 'glyph-camera', 'glyph-images', 'glyph-link', 'glyph-plus'].every((c) => wxss.includes('.' + c)))
// 整套图形只留一个描边重量（原来 1.5 与 1.6 混用，小尺寸上粗细不齐）
const sw = [...new Set((wxss.match(/stroke-width='[\d.]+'/g) || []).map((x) => x.slice(14, -1)))]
ok('这一页的图形描边只有一个重量，且是 1.6', sw.length === 1 && sw[0] === '1.6', sw.join(','))

// 上屏文字全走字典：注释和属性里出现中文不算"写死"，只看真正会上屏的那几段
const rendered = wxml.replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]*>/g, '\n')
  .split('\n')
  .map((line) => line.replace(/\{\{[^}]*\}\}/g, '').trim())
  .filter(Boolean)
  .join(' ')
ok('上屏文字全走字典，wxml 里没有写死的中文（✕ 是符号不算）',
  !/[\u4e00-\u9fa5]/.test(rendered.replace(/中/g, '')), rendered.slice(0, 60))

// 每个绑定的处理函数都得真的存在（tap / touch / input / focus / blur / change 全收进来）
const handlers = new Set()
wxml.replace(/(?:catch|bind)(?:tap|input|confirm|change|focus|blur|touchstart|touchmove|touchend|touchcancel)="(\w+)"/g, (_, h) => handlers.add(h))
ok('页面上绑到的处理函数在 create.js 里都有', [...handlers].length >= 12, `${[...handlers].length} 个`)
;[...handlers].forEach((h) => {
  ok(`处理函数 ${h} 在 create.js 里`, new RegExp('\\b' + h + '\\s*\\(').test(js))
})

// ---------- 5. 几何：面板两档高度、卡里那一段装不装得下，全是算出来的 ----------
const panelCss = seg('.panel')
const PANEL_H = num(panelCss, 'height')
const PANEL_OPEN_H = num(seg('.panel-open'), 'height')
ok('面板收起态定高 500rpx（10-08 从 700 压下来，站长两轮"继续压低"）', PANEL_H === 500, String(PANEL_H))
ok('展开态只多一行（580 = 500 + 80）', PANEL_OPEN_H === 580 && PANEL_OPEN_H - PANEL_H === 80, String(PANEL_OPEN_H))
ok('面板算 border-box（定高含内边距与描边）', /box-sizing:\s*border-box/.test(panelCss))
ok('面板是 flex 列', /display:\s*flex/.test(panelCss) && /flex-direction:\s*column/.test(panelCss))
ok('展开那一档挂在面板自己身上，不是另一块 DOM',
  /class="panel \{\{panelOpen \? 'panel-open' : ''\}\}"/.test(wxml))
ok('面板四角同一档圆角（不再与条身接缝对齐）', num(panelCss, 'border-radius') === 55)

// 卡里那一段够不够高：这是这一轮最容易红的一条——把内容加回去而不动高度，就会被 overflow 掉。
const cardCss = seg('.card')
const dockInset = num(seg('.container.entry-dock .entry-wrap'), 'left')      // 24
const panelBorder = num(panelCss, 'border')                                  // 走 --w-edge
const panelPad = lens(panelCss, 'padding')                                   // 30 / 32 / 32
ok('面板那一条 padding 是三档简写（算式按 上/左右/下 取）', panelPad.length === 3, panelPad.join(' '))
const [panelPadY, panelPadX, panelPadBottom] = panelPad
const cardBorder = num(cardCss, 'border')
const cardPad = num(cardCss, 'padding')
const cardMargin = num(cardCss, 'margin-top')
const modesMargin = num(seg('.modes'), 'margin-top')
// 行高那一档用 1.6 而不是 CSS 里写的 1.3：10-08 真跑量到标签那一块比算式多 15rpx
// （微信给 view 的默认行高约 1.6，`.md` 上那一条没吃进去），算式取**实测那一档**才不骗人。
const mdLine = num(seg('.md'), 'font-size') * 1.6 + num(seg('.md'), 'padding-bottom')
const innerWidth = 750 - 2 * dockInset - 2 * panelBorder - 2 * panelPadX
const cardInnerW = innerWidth - 2 * cardBorder - 2 * cardPad
// 面板自己那 3rpx 描边也在定高里面（border-box），漏掉它算出来的可用高度会多 6rpx——
// 10-08 真跑量到卡里可用 251.7，而当时这条算的是 263.5，差的就是这 6 加行高那 6。
const usedByChrome = 2 * panelBorder + panelPadY + modesMargin + mdLine + cardMargin + 2 * cardBorder + 2 * cardPad + panelPadBottom
const cardInnerH = PANEL_H - usedByChrome
const openCardInnerH = PANEL_OPEN_H - usedByChrome
ok('卡内宽算得出（三枚圈那一排不许超出）', innerWidth > 0 && cardInnerW > 400, `面板内宽 ${innerWidth} / 卡内宽 ${cardInnerW}`)
const shutOuter = num(seg('.shut'), 'width')
const miniOuter = num(seg('.mini'), 'width')
const crowGap = num(seg('.crow'), 'gap')
const crowW = shutOuter + 2 * miniOuter + 2 * crowGap
const crowH = Math.max(
  shutOuter + num(seg('.shutcol'), 'gap') + num(seg('.shut-lb'), 'font-size') * 1.35,
  num(seg('.mini-c'), 'height') + num(seg('.mini'), 'gap') + num(seg('.mini-lb'), 'font-size') * 1.4,
)
ok('三枚圈那一排在卡里放得下（宽与高两头都算）',
  crowW <= cardInnerW && crowH <= cardInnerH, `宽 ${crowW}/${cardInnerW} 高 ${crowH.toFixed(1)}/${cardInnerH.toFixed(1)}`)
const fieldH = num(seg('.field'), 'height')
const sldH = num(seg('.sld'), 'height')
ok('一个框 + 一枚条放得进收起那一档（还留一条报错行的位置）',
  fieldH + sldH <= cardInnerH, `${fieldH}+${sldH}=${fieldH + sldH} ≤ ${cardInnerH.toFixed(1)}`)
ok('展开那一档装得下两行框 + 开关 + 条',
  num(seg('.field-area-2'), 'height') + num(seg('.wr-sw'), 'height') + num(seg('.wr-sw'), 'margin-top') + sldH <= openCardInnerH,
  `需 ${num(seg('.field-area-2'), 'height') + num(seg('.wr-sw'), 'height') + num(seg('.wr-sw'), 'margin-top') + sldH} ≤ ${openCardInnerH.toFixed(1)}`)
// 框不许贴着脸：条上面那档 auto 边距就是那条缝
ok('框与条之间由两档 auto 边距给缝（不是硬写 margin）',
  /margin-top:\s*auto/.test(seg('.field')) && /margin-top:\s*auto/.test(seg('.sld')))

// 缩略图那一排：列数、上限、以及"JS 里那个 ROW_CELLS 与 WXSS 是不是同一件事"
const thW = num(seg('.th'), 'width')
const thGap = num(seg('.strip'), 'gap')
const cols = Math.floor((cardInnerW + thGap) / (thW + thGap))
const ROW_CELLS = Number(/const ROW_CELLS = (\d+)/.exec(js)[1])
const MAX_SHOTS = Number(/const MAX_SHOTS = (\d+)/.exec(js)[1])
ok('WXSS 实际放得下的列数 == JS 的 ROW_CELLS（两个数必须是一件事）',
  cols === ROW_CELLS, `算出 ${cols} 行宽 / JS 写 ${ROW_CELLS}`)
ok('收起一行、展开两行放得下 上限张数 + ➕（这就是"只多一行"落得下去的理由）',
  cols * 2 >= MAX_SHOTS + 1, `${cols}×2=${cols * 2} 格，需要 ${MAX_SHOTS}+1`)
// ➕ 那格与小图同尺寸同圆角（他要的"风格统一"就这一条）：它身上只许出现"位置"这一类差异，
// 不许自己另写一档边长或圆角——那就会变成第二种方格。
ok('➕ 那格与小图同边长，且不自己另写边长/圆角（它身上只许差"面"与"位置"）',
  /class="th th-add/.test(wxml) && !/width:|height:|border-radius:/.test(seg('.th-add')),
  `.th ${thW}rpx / .th-add 自己写了 ${/(width|height|border-radius)/.test(seg('.th-add')) ? '边长' : '没有'}`)
ok('➕ 钉在这一行最右端', /margin-left:\s*auto/.test(seg('.th-add')))
ok('序号画在图里、不再有"已选 N 张"那一行',
  /class="th-no">\{\{index \+ 1\}\}/.test(wxml) && !/\.cnt|pickedCount/.test(wxss + wxml + js))

// 滑动条那一枚的行程：JS 常量与 WXSS 三个数必须对得上，不然圆会滑出轨道或被裁
const sldBorder = num(seg('.sld'), 'border')
const knobW = num(seg('.sld-knob'), 'width')
const knobRest = num(seg('.sld-knob'), 'left')
const sldInner = cardInnerW - 2 * sldBorder
const calcMax = sldInner - knobW - knobRest
const SLD_MAX = Number(/const SLD_MAX_RPX = (\d+)/.exec(js)[1])
ok('JS 里"停在最右"那一格 == 轨道内宽 − 圆宽 − 左边内缩',
  SLD_MAX === calcMax, `JS ${SLD_MAX} / 算出 ${calcMax}（轨道内宽 ${sldInner}）`)
ok('圆停在最右那一格仍然在轨道里（留 0 到 20rpx 的余量）',
  calcMax + knobW + knobRest <= sldInner + 0.01, String(sldInner))
ok('圆那一圈白环是轨道自己的 border，进度填充盖不到它',
  /border:\s*\d+rpx solid var\(--cp-ink\)/.test(seg('.sld'))
  && /position:\s*absolute/.test(seg('.sld-fill')) && !/z-index/.test(seg('.sld-fill')))
ok('进度那一格是假进度：封顶 90%、按 exp 曲线推、完成才钉满',
  /Math\.min\(90, Math\.round\(90 \* \(1 - Math\.exp\(-sec \/ 30\)\)\)\)/.test(js)
  && /fillPct: 100/.test(js))
ok('表的三处出口都停了（成功、失败、离开这一页）',
  /this\.stopProgress\(\)/.test(js) && (js.match(/stopProgress\(\)/g) || []).length >= 5)
ok('拖动中关掉那条 transition（圆要跟手，松手才交给 CSS 回弹）',
  /\.sld-drag \.sld-knob\s*\{[^}]*transition:\s*none/.test(wxss) && /dragging: true/.test(js))
ok('触摸三件事都绑上了，且滑动过程中不吃页面滚动',
  /bindtouchstart="onSlideStart"/.test(wxml) && /catchtouchmove="onSlideMove"/.test(wxml)
  && /bindtouchend="onSlideEnd"/.test(wxml))

// <template is> 不继承页面 data，清单漏一个名字不会红、只会静默不画（10-08 真跑就是这么栽的：
// 清单里递的是 knobStyle，而 JS 压根没这一位 ⇒ data 里 knobRpx 一路走到 456，屏上那枚圆一动不动，
// 四张截图里它都贴在左边起点）。两头一起堵：模板用到的必须在清单里，清单里的必须在页面 data 里。
const tplBody = (/<template name="sld">([\s\S]*?)<\/template>/.exec(wxml) || [])[1] || ''
const tplGiven = ((/is="sld"[\s\S]*?data="\{\{([^}]*)\}\}"/.exec(wxml) || [])[1] || '')
  .split(',').map((s) => s.trim()).filter(Boolean)
const tplUsed = [...new Set(((tplBody.match(/{{([^{}]*)}}/g) || []).join(' ')
  .replace(/'[^']*'|"[^"]*"/g, '').replace(/\.\w+/g, '')
  .match(/[A-Za-z_$][\w$]*/g) || []).filter((x) => !['true', 'false', 'null', 'undefined'].includes(x)))]
ok('滑动条模板里用到的每一位都在递入清单里（漏一位＝静默不画）',
  tplUsed.length > 0 && tplUsed.every((x) => tplGiven.includes(x)),
  `用到 ${tplUsed.join(',')}｜递入 ${tplGiven.join(',')}`)
const dataBlock = (/\n  data:\s*\{([\s\S]*?)\n  \}/.exec(js) || [])[1] || ''
const dataKeys = (dataBlock.match(/\n    ([a-zA-Z]\w*):/g) || []).map((s) => s.trim().slice(0, -1))
ok('递入清单里的每一位都在页面 data 里（写了清单没这位＝传 undefined）',
  dataKeys.length > 10 && tplGiven.every((x) => dataKeys.includes(x)),
  `清单 ${tplGiven.filter((x) => !dataKeys.includes(x)).join(',') || '全在'}`)
ok('圆的位置真的绑到了 knobRpx 上（不是绑一个不存在的字段）',
  /class="sld-knob" style="left:\{\{knobRpx\}\}rpx"/.test(tplBody))

// ---------- 6. 颜色：一处出处，wxss 里不许长出第二份色板 ----------
const banned = palette.TONES.map((x) => x.bg.toUpperCase()).concat('#F6C445')
const wxssHexes = (wxss.match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toUpperCase())
ok('wxss 里没有抄色板里的饱和色', !wxssHexes.some((h) => banned.includes(h)),
  wxssHexes.filter((h) => banned.includes(h)).join(','))
// --cp-* 这一组由 palette.createSkin() 发下来：拼错一个令牌名不会红，只会静默透明（"同底色压透明度等于没画"那一类）
const usedVars = [...new Set((wxssRaw.match(/var\(--cp-[a-z0-9-]+\)/g) || []).map((x) => x.slice(4, -1)))]
const skin = palette.createSkin()
ok('wxss 用到的每一枚 --cp-* 都由 createSkin() 发得出来',
  usedVars.length > 0 && usedVars.every((v) => skin.includes(`${v}:`)),
  usedVars.filter((v) => !skin.includes(`${v}:`)).join(','))
ok('create.js 每次进页重发这套面（换壁纸回来要跟上）',
  /skinPanel: createSkin\(\)/.test(js) && /createSkin/.test(js.replace(/\n\s*\/\*[\s\S]*?\*\//g, '')))
// 那两支橙现在**是固定的**（站长 10-08 第三条决定，口径 docs/规格-创建入口这一条线.md §6.1），
// 但一份都不许抄进 wxss——抄了就是把"固定"实现成了"每页各写一遍"，改出口时改不动。
const derived = (skin.match(/--cp-(?:cam|extract)(?:-ink)?:([^;]+)/g) || []).map((x) => x.split(':')[1].toUpperCase())
ok('快门与滑动条那两支橙没有一份抄进 wxss',
  !derived.some((h) => wxssHexes.includes(h)), derived.filter((h) => wxssHexes.includes(h)).join(','))
// §6.1 那两行 + 那条硬约束，钉成三条：值、字色、以及"换壁纸这两枚不许动"。
const cpOf = (k) => { const m = new RegExp('--' + k + ':([^;]+)').exec(skin); return m && m[1].toUpperCase() }
ok('快门那枚固定 #E9723D、字固定 #2C1204（压字 ≥4.5）',
  cpOf('cp-cam') === '#E9723D' && cpOf('cp-cam-ink') === '#2C1204'
  && palette.crOf('#2C1204', '#E9723D') >= 4.5,
  `${cpOf('cp-cam')}／${cpOf('cp-cam-ink')} 压 ${palette.crOf('#2C1204', '#E9723D').toFixed(2)}`)
ok('提炼那枚固定 #C4541F、字是**纯白**不是纸白（纯白 4.53 过线，纸白只有 3.95）',
  cpOf('cp-extract') === '#C4541F' && cpOf('cp-extract-ink') === '#FFFFFF'
  && palette.crOf('#FFFFFF', '#C4541F') >= 4.5 && palette.crOf('#F2EFE9', '#C4541F') < 4.5,
  `${cpOf('cp-extract')}／${cpOf('cp-extract-ink')} 纯白 ${palette.crOf('#FFFFFF', '#C4541F').toFixed(2)}`
  + ` 纸白 ${palette.crOf('#F2EFE9', '#C4541F').toFixed(2)}`)
const camFour = ['tint-paper', 'tint-celadon', 'tint-blush', 'gradient-blue']
  .map((k) => { palette.setActiveTheme(k); const s = palette.createSkin(); return (/--cp-cam:([^;]+)/.exec(s)[1] + '/' + /--cp-extract:([^;]+)/.exec(s)[1]) })
ok('换壁纸这两枚不变（四套各跑一遍 createSkin，四串读数必须同一）',
  camFour.every((x) => x === camFour[0]), camFour.join(' | '))
// 上面那趟改了 palette 的模块态（ACTIVE_THEME），后面还有判据要吃 palette，先归位。
palette.setActiveTheme('')
// 快门与那排标签的色都只许从 palette 递进来；条身那三枚小圆撤了，它们那份 `toneStyle`
// 在本页也就没有消费者了——这一条同时钉这两件，少一件都红。
ok('快门与滑动条的色仍只从 createSkin() 递进来，且 create.js 不再引 toneStyle（那三枚小圆的色没人消费了）',
  /--cp-cam:/.test(palette.createSkin()) && /skinPanel: createSkin\(\)/.test(js)
  && !/toneStyle/.test(js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')))
ok('小黄点的色值仍由 palette 经 style 递进来',
  /tipDotStyle: 'background:' \+ TIP_DOT/.test(js) && palette.TIP_DOT === '#F6C445')

// ---------- 7. 提交链路：三档共用同一趟忙态时序 ----------
ok('三档都从 runSubmit 进（滑动到位与轨道点一下共用一个口）',
  /runSubmit\(\)\s*\{[\s\S]{0,220}submitUrl\(\)[\s\S]{0,220}submitManual\(\)[\s\S]{0,220}submitScreenshots\(\)/.test(js))
ok('轨道被点但这一格还没东西：说出来，不静默（沿用灰按钮那条规矩）',
  /onSldTap\(\)\s*\{[\s\S]{0,200}if \(this\.data\.busy \|\| this\.data\.done \|\| this\.data\.ready\) return/.test(js))
;['submitUrl', 'submitScreenshots', 'submitManual'].forEach((f) => {
  ok(`${f} 仍挡第二下`, new RegExp(`async ${f}\\(\\)\\s*\\{[\\s\\S]{0,240}if \\(this\\.data\\.busy\\) return`).test(js))
  ok(`${f} 走 api.pollTask`, new RegExp(`async ${f}\\(\\)[\\s\\S]{0,1400}api\\.pollTask\\(`).test(js))
})
ok('忙态时序收在一处（begin / done / fail 三个小段，三档共用）',
  /_extractBegin\(kind\)/.test(js) && /_extractDone\(noteId, patch\)/.test(js) && /_extractFail\(err\)/.test(js))
ok('成功那一趟还是"吐司 800ms 后跳详情页"（现网口径没改）',
  /wx\.showToast\(\{ title: t\('extractSucceeded', lang\), icon: 'success' \}\)/.test(js)
  && /setTimeout\(\(\) => \{\s*wx\.navigateTo\(\{ url: `\/pages\/detail\/detail\?id=\$\{noteId\}` \}\)/.test(js))
ok('失败那一趟把这一枚退回待滑那一帧', /knobRpx: SLD_REST_RPX,\s*errLine:/.test(js))
ok('这一档不再自己建笔记（手打那条路只留提炼一个入口）', !/api\.createNote\(/.test(js))
ok('文字档送进去的是"原文 + 开关"，标题由首行派生（面板里没有标题格）',
  /ingestText\(\{\s*title: titleFromText\(content\),\s*content,[\s\S]{0,260}translate: this\.data\.writeTranslate,\s*\}/.test(js))
ok('首行派标题那一段：剥记号、截 50、空行不算标题',
  /function titleFromText\(content\)/.test(js) && /split\('\\n'\)/.test(js) && /length > 50/.test(js))
ok('归类挪到详情页这一句有实据：write 页仍有标题格与分类选择器',
  /class="label">\{\{t\.title\}\}/.test(fs.readFileSync(P('pages/write/write.wxml'), 'utf8'))
  && /mode="selector" range="\{\{categoryNames\}\}/.test(fs.readFileSync(P('pages/write/write.wxml'), 'utf8')))
ok('原文空着要拦一道，且两门都有这句话', !!zh.needBody && !!en.needBody,
  `${zh.needBody} / ${en.needBody}`)
ok('满 9 张点➕给吐司（原来那一刀是静默的 slice）',
  /onAddShot\(e\)\s*\{[\s\S]{0,220}t\('maxShots'/.test(js) && !/previewImages\s*\.concat\([\s\S]{0,80}\.slice\(0, MAX_SHOTS\)\)\s*\n\s*this\.setData\(\{\s*previewImages: merged/.test(js))
ok('选图 count 给的是"还能选几张"，不是整个上限',
  /count: left,/.test(js) && /const left = MAX_SHOTS - this\.data\.previewImages\.length/.test(js))
// 裸 9 不许多出来。判据钉的是"张数那三种写法"，不是字符本身——
// 原来写成"全文不许有裸 9"会栽在 LINK_RE 的 `[a-z0-9]` 里（那把老尺子的注释记着这条）。
const jsBare = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const NINE = jsBare.match(/count:\s*9\b|slice\(\s*0\s*,\s*9\s*\)|previewImages[\s\S]{0,30}\b9\b|length\s*[><=]+\s*9\b/g) || []
ok('张数 9 在这一侧只写一次（比较、count、截断里没有裸 9）', NINE.length === 0, NINE.join(' ⎪ '))

// 「原文翻译」那一枚：功能还在，位置改到展开那一档（10-08 我定的放置，判据跟着钉住）
ok('开关仍在文字档，且只在这一档的展开态出现',
  /wx:if="\{\{active === 'write' && panelOpen\}\}" class="wr-sw/.test(wxml))
ok('默认关那一位没动', /writeTranslate: false,/.test(js))
ok('落点是整行、用 catchtap（面板外壳挂着收起，冒上去就顺手收了）',
  /class="wr-sw \{\{writeTranslate \? 'wr-sw-on' : ''\}\}" catchtap="onToggleTranslate">/.test(wxml))
ok('两态各吃一对令牌，不在规则里写死色',
  /\.wr-sw-track\s*\{[^}]*background: var\(--face\)/.test(wxss)
  && /\.wr-sw-dot\s*\{[^}]*background: var\(--face-ink\)/.test(wxss)
  && /\.wr-sw-on \.wr-sw-track\s*\{[^}]*background: var\(--solid-bg\)/.test(wxss)
  && !/\.wr-sw[^{]*\{[^}]*(#[0-9A-Fa-f]{3,8}|rgba\()/.test(wxss))
ok('几何闭合：面 72、点 32、左右各留 4 ⇒ 位移只能是 32',
  num(seg('.wr-sw-track'), 'width') === 72 && num(seg('.wr-sw-dot'), 'width') === 32
  && /transform: translateX\(32rpx\)/.test(seg('.wr-sw-on .wr-sw-dot')))

// ---------- 8. 上一代那些能力没被这批碰坏 ----------
ok('忙态仍然挡住收起', /collapse\(\)\s*\{\s*if \(this\.data\.busy/.test(js))
const showBody = js.split('async onShow')[1].split('hintFor(value)')[0]
ok('onShow 仍然不重置草稿', !/previewImages: \[\]/.test(showBody) && !/active: ''/.test(showBody))
ok('选完图返回仍然重算那三位（ready / 满 / 展开）',
  /this\._sync\(\)/.test(js) && /_sync\(\)\s*\{[\s\S]{0,600}panelOpen:/.test(js))
ok('链接校验那条正则没被顺手改松', js.includes('const LINK_RE = /^https?:\\/'))
ok('Tips 那一行仍然只在收起态渲染', /wx:if="\{\{!active && tips\.length\}\}"/.test(wxml))
ok('Tips 六句中英各一份、句数相等', Array.isArray(zh.tips) && Array.isArray(en.tips)
  && zh.tips.length === 6 && en.tips.length === zh.tips.length)
ok('一句停 8 秒', /\}, 8000\)/.test(js) && !/\}, 4000\)/.test(js))
ok('图片备份那条 B 链仍与建笔记那条并行、不 await',
  /const backup = this\._backupShots\(batch\)/.test(js) && !/await this\._backupShots/.test(js))
ok('失败时那批孤儿对象仍然删（_settleBackup(null, …)）', /this\._settleBackup\(null, backup\)/.test(js))

// 这两叠高度是 §2 那两行算式的读数：改了字号/间距/控件之后它们会变，规格文档引的就是这两个数
const writeOpenStack = num(seg('.field-area-2'), 'height') + num(seg('.wr-sw'), 'height')
  + num(seg('.wr-sw'), 'margin-top') + sldH
console.log(`${fails.length ? '✗' : '✓'} 统一录入条：${pass}/${pass + fails.length} 条通过`
  + `　面板 ${PANEL_H}/${PANEL_OPEN_H}rpx、卡内 ${cardInnerW}×${cardInnerH.toFixed(1)}（展开 ${openCardInnerH.toFixed(1)}）rpx`
  + `　最占的一叠：照片圈 ${crowH.toFixed(1)}/${cardInnerH.toFixed(1)}、文字展开 ${writeOpenStack}/${openCardInnerH.toFixed(1)}`
  + `　一行 ${cols} 格、行程到 ${SLD_MAX}rpx`)
fails.forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
