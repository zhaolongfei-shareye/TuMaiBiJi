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
// 10-19 那一刀（提炼完落回列表那扇窗）跨三个文件，判据也得跟着跨：
// 交出去那一半在 create，取走那一半在 index，"取走即清"那一半在 app。只查 create 会漏掉"没人取"这一种失效。
const IX_JS = fs.readFileSync(P('pages/index/index.js'), 'utf8')
const APP_JS = fs.readFileSync(P('app.js'), 'utf8')
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
;['back', 'slideExtract', 'maxShots', 'modePhoto'].forEach((k) => {
  ok(`i18n.${k} 中文有`, !!zh[k])
  ok(`i18n.${k} 英文有`, !!en[k])
})
ok('maxShots 两门都留了 {n} 位（张数从常量拼，不写进句子里）',
  /{n}/.test(zh.maxShots) && /{n}/.test(en.maxShots), `${zh.maxShots} / ${en.maxShots}`)
// 那五支是上一代的承载方式说的话：条身按模式换字、已选 N 张、保存后可提炼、先写个标题、开始提炼按钮。
// 后面四支是 10-10 深夜那一轮退的：面板外那行两枚改成「Tips ＋ 返回」，
// 列表右上角那枚「点一下展开／收起」整个取消（折叠口没有第二个入口，`.sheet.ix-wide` 一并删）。
;['barUrl', 'barShot', 'pickedCount', 'urlHintIdle', 'linkReady', 'needTitle', 'writeTitlePh',
  'writeBodyPh', 'startExtract', 'albumDesc', 'takePhotoHint', 'fromAlbumHint', 'addMore',
  'guide1T', 'guide1D', 'guide2T', 'guide2D', 'guide3T', 'guide3D', 'guide4T', 'guide4D',
  'chooseMode', 'barCollapse', 'expandTip', 'collapseTip']
  .forEach((k) => {
    ok(`退役的键 ${k} 字典里没了`, zh[k] === undefined && en[k] === undefined)
    ok(`退役的键 ${k} 页面里也不再引用`, !new RegExp('\\bt\\.' + k + '\\b').test(wxml + js))
  })
// ➕ 那一枚方格的 aria-label 要说清"拍或选都行"，这一支留着就是给它用的
ok('importScreenshot 还在（➕ 那格的可读名）', !!zh.importScreenshot && !!en.importScreenshot
  && /t\.importScreenshot/.test(wxml))
// 那四支退役键的消费者有两支根本不在这一页（expandTip／collapseTip 在笔记列表），
// 上面那个循环只扫得到这一页的 wxml+js，所以这里按整个 miniprogram 目录再扫一遍——
// 键名留在字典里没人引用是"第二份真相"，注释里留着提它则是下一轮的坑。
const sweep = (dir, out = []) => {
  for (const name of fs.readdirSync(dir)) {
    const f = path.join(dir, name)
    if (fs.statSync(f).isDirectory()) { if (name !== 'node_modules') sweep(f, out); continue }
    if (/\.(wxml|wxss|js|json)$/.test(name)) out.push(f)
  }
  return out
}
;['chooseMode', 'barCollapse', 'expandTip', 'collapseTip'].forEach((k) => {
  const hits = sweep(path.join(ROOT, 'miniprogram'))
    .filter((f) => new RegExp('\\b' + k + '\\b').test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT, f))
  ok(`退役的键 ${k} 全仓一处不留（含注释）`, hits.length === 0, hits.join(','))
})
ok('中英键数相等', Object.keys(zh).length === Object.keys(en).length,
  Object.keys(zh).length + ' vs ' + Object.keys(en).length)
ok('拍照/相册两枚圈的标签复用现网串', zh.takePhoto === '拍照' && zh.fromAlbum === '相册')
ok('三个标签都是单个词级：照片/链接/文字',
  zh.modePhoto === '照片' && zh.modeUrl === '链接' && zh.modeWrite === '文字')
/* 「直接写」那一档的占位字：标题已经不在这一屏填了，所以这句不能再提"标题"
   （10-08 站长口径：砍一个输入框，标题和分类到详情页改）。 */
ok('文字档那句占位字说的是原文与摘要，不再承诺标题',
  !/标题/.test(zh.manualDesc) && /摘要/.test(zh.manualDesc), zh.manualDesc)
// 英文那侧必须放得进一行：框内宽 = 586(卡内) − 28×2(左右内缩) = 530rpx，28rpx 字号按 14rpx/字算放得下 37 个字符
const phEn = en.manualDesc
ok('英文占位字放得进单行框（≤36 字符，折行=红）', phEn.length <= 36, `${phEn.length}：${phEn}`)

// ---------- 2. 结构：收起一条、展开三枚标签、面板里只剩两样控件 ----------
ok('旧的三张入口卡已经拆掉', !/class="card entry/.test(wxml))
ok('没有残留的手风琴开关', !/toggleCard/.test(wxml) && !/toggleCard/.test(js))
// 10-10 晚：收起态那条纸白胶囊换成左块人物（效果图 PNG图标.png）。
// 原来钉 `.bar` 那三条的前提没了，改钉同一件事的新载体：入口只有一块、只在收起态在、
// 那句话永远只读 barIdle 一个键。旧胶囊的类名与样式一并钉"不许留第二份"——
// 两版并存是这类改版最容易漏的（屏上看着对，其实两套都在跑）。
ok('收起态入口只有一块人物（胶囊那套类名与样式一处不留）',
  // 数的是 `class="blk-person…`，且 class 前面必须是空白或引号：
  // 按下态那枚 `hover-class="blk-person-press"` 尾巴上也带这一段，不加边界会数成两块。
  (wxml.match(/(?:^|[\s"])class="blk-person/g) || []).length === 1
  && !/(?:^|[\s"])class="bar[ "]/.test(wxml) && !/\.bar\s*[{:，,]|\.bar-lead|\.bar-label/.test(wxss),
  `blk-person ${(wxml.match(/(?:^|[\s"])class="blk-person/g) || []).length} 块`)
ok('那一组只在收起态渲染（展开时整组让位给面板）',
  /<view wx:if="\{\{!active\}\}" class="home-blk"/.test(wxml))
/* 2.2 B 方案：左块下面那条「记下来」整条撤了（站长原话「左下的记下来这部部分，去掉」），
   屏上不再有那句话，所以这一条改钉两件事：① 两处入口的**可及名**仍只读 `barIdle` 这一个键
   （不为一枚圆形 ➕ 另起一句文案——文案正本还是那一句"记下来"）；② 旧白条那几个类一处不留。 */
ok('左块与圆形 ➕ 的可及名都只读 barIdle（白条那三个类一处不留）',
  /<view class="blk-person"[^>]*aria-label="\{\{t\.barIdle\}\}"/.test(wxml)
  && /<view class="blk-plus"[^>]*aria-label="\{\{t\.barIdle\}\}"/.test(wxml)
  && !/blk-jot/.test(wxml + wxss),
  `blk-person/blk-plus 的 aria-label`)
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
// 站长 10-09 夜两句：「调亮度和换背景，之前不是说了换到日期位置吗？」＋指着效果图 c5 说
// 「这个方案完全没做」。稿上标题下面那一格就是这一行，**日期那行在稿上没有**。
// 所以这一条钉的是**顺序与归属**，不是样式：那一行必须排在标题行之后、录入条容器之前，
// 且不再住在 `.entry-wrap` 里面（住在里面就会跟着面板一起被让位逻辑管着）；
// 同时日期那一格整个不许留壳（留一半 = 屏上多一行没人要的东西）。
const iTitle = wxml.indexOf('class="title-row"')
const iSwap = wxml.indexOf('class="home-swap"')
const iEntry = wxml.indexOf('class="entry-wrap"')
ok('「调亮度｜换背景」那一行顶在日期原来那一格（标题行之后、录入条之前）',
  iTitle > -1 && iSwap > iTitle && iEntry > iSwap,
  `title ${iTitle} / swap ${iSwap} / entry ${iEntry}`)
ok('日期＋星期那一行撤净了（节点、样式、JS 里那三位都不许留）',
  !/date-row|dateText|weekText|dateLineFor/.test(wxml + wxss + js),
  (wxml + wxss + js).match(/date-row|dateText|weekText|dateLineFor/g)?.slice(0, 3).join(' ') || '零处')
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
// 10-10 晚 `wx:if="{{active}}"` 从这一行搬到了它的父级 `.entry-wrap` 上（收起态整组
// 已经拆出去贴底，父级只在展开时存在），所以这一条改钉：位置关系不变、active 那道闸由父级把。
const outAt = wxml.indexOf('class="out"')
const panelAt = wxml.indexOf('class="panel ')
const wrapAt = wxml.indexOf('class="entry-wrap"')
ok('那一行小字存在且排在面板之前（在框外）',
  outAt > -1 && panelAt > outAt && wrapAt > -1 && outAt > wrapAt
  && /<view wx:if="\{\{active\}\}" class="entry-wrap">/.test(wxml),
  `wrap@${wrapAt} out@${outAt} panel@${panelAt}`)
// 10-10 深夜这两枚换过内容；10-14 站长「第二屏，Tips 去掉」⇒ 这一行只剩「返回」一枚；
// 10-16 站长「把原文翻译的开关上移到与返回同一行左边」⇒ 又变两枚：左开关、右「返回」。
// 「返回」那一头三条一个没松（同一个词、role=button、catchtap=collapse），只是不再独占这一行。
ok('那一行两枚：左边那枚开关，右边仍是「返回」（与笔记列表右上角同一个词、同一个动作）',
  /class="out"[\s\S]*?<view class="wr-sw [\s\S]*?<text class="out-r"[^>]*role="button"[^>]*aria-label="\{\{t\.back\}\}"[^>]*catchtap="collapse"/.test(wxml),
  (wxml.match(/<view class="out">[\s\S]{0,200}/) || [''])[0].replace(/\s+/g, ' '))
// 原来这一条钉 `.out-l` 的 nowrap，理由是"这一行在流内，一折行就把整块面板顶下去，而它每 8 秒换一句"。
// 载体撤了一处，这条风险就没有载体了；换成钉**还在的那一处**：首屏那一格允许折两三行
// （它就是按两行排的），靠 `flex:1 + min-width:0 + max-width:9em` 那一套，不许有人为了单行改回写死。
ok('首屏那一格 Tips 仍是"吃余量、可折行"（行宽上限 9em，不套 nowrap）',
  /flex:\s*1/.test(seg('.blk-tips')) && /min-height:\s*0/.test(seg('.blk-tips'))
  && /min-width:\s*0/.test(seg('.blk-tips-line')) && /max-width:\s*9em/.test(seg('.blk-tips-line'))
  && !/white-space:\s*nowrap/.test(seg('.blk-tips-line')), seg('.blk-tips-line').replace(/\s+/g, ' '))
// 面板肚子里只剩"一个框（或一横排小图）+ 一枚条"：那排按钮、四步指引、清空、粘贴都不该回来
ok('面板里没有那排按钮（清空/粘贴/保存/取消全撤）', !/class="acts"/.test(wxml) && !/catchtap="pasteUrl|catchtap="clearShots|catchtap="cancelWrite/.test(wxml))
ok('四步指引整批撤净（模板、引用、样式都没有）',
  !/entryGuide/.test(wxml) && !/\.guide\s*\{/.test(wxss) && !/guide1T/.test(js))
// 「卡片上的信息」那一层 10-18 起也在这一屏（那枚「换背景」拉起同一层），它自己带两只输入框。
// 上面那句"链接档只有一个输入框"的主语是**录入面板**，不是这一层 ⇒ 先把那一层从 wxml 里摘出去再数，
// 否则一句"标题格撤了"会被一个毫不相干的弹窗顶红（判据写歪，不是实现坏了）。
const ciFrom = wxml.indexOf('<view wx:if="{{cardInfoOpen}}" class="ci-mask"')
const ciBlock = ciFrom < 0 ? '' : wxml.slice(ciFrom, wxml.indexOf('\n  </view>', ciFrom) + '\n  </view>'.length)
const wxmlNoCi = ciBlock ? wxml.replace(ciBlock, '') : wxml
ok('链接档只有一个输入框，没有第二个（标题格撤了；这一层那两只另算，见下面那条）',
  (wxmlNoCi.match(/<input\b/g) || []).length === 1 && !/writeTitle/.test(wxml + js))
ok('「卡片上的信息」那一层两只输入框齐全（名称 16 字、一句话 24 字），且都关着 adjust-position',
  (ciBlock.match(/<input\b/g) || []).length === 2 && /maxlength="16"/.test(ciBlock)
  && /maxlength="24"/.test(ciBlock)
  && (ciBlock.match(/adjust-position="\{\{false\}\}"/g) || []).length === 2,
  `框 ${(ciBlock.match(/<input\b/g) || []).length} 只`)
ok('文字档是一个 textarea（长原文要能换行）', /<textarea/.test(wxml))
// 提示词全在框里：placeholder 必须是字典里的句子，不是硬写的 https://
ok('链接框的提示词吃 linkDesc（不再有写死的 https 样例）',
  /placeholder="\{\{t\.linkDesc\}\}"/.test(wxml) && !/mp\.weixin\.qq\.com/.test(wxml))
ok('文字框的提示词吃 manualDesc', /placeholder="\{\{t\.manualDesc\}\}"/.test(wxml))
// 10-10 深夜报错换了地方与画法：不再画在框外那一行（那一段会把面板顶高），
// 改成整枚浮在面板里、输入框正上方，几秒自己走；权限那一类仍然可点进设置。
ok('报错那枚气泡在面板里面、输入框上方，且权限那一类可点进设置',
  /class="hint-bubble[^"]*"[\s\S]{0,160}catchtap="onHintTap"/.test(wxml)
  // 用元素本身比位置，不能比 `indexOf('hint-bubble')`：上面那条注释里也写着这个类名，
  // 拿第一次出现的下标去和 panel 比，注释会冒充成"气泡挂在框外"。
  && panelAt > -1 && wxml.search(/<view[^>]*class="hint-bubble/) > panelAt,
  '气泡没画在 panel 之后＝它可能还挂在框外那一行')
ok('旧的框外那一行报错整条撤净（样式与 markup 一处不留，留着就是两份真相）',
  !/out-err/.test(wxml) && !/\.out-err\s*\{/.test(wxss))
ok('气泡是浮层：absolute 定位，不许占流内高度（占了一行就会把面板顶来顶去）',
  /position:\s*absolute/.test(seg('.hint-bubble')) && !/flex:\s*none/.test(seg('.hint-bubble')),
  seg('.hint-bubble').replace(/\s+/g, ' ').slice(0, 60))
/* ---------- 10-18 00:1x 这一枚的皮（他拿着真机图那句） ----------
   「提炼前的报错提示，不要用灰底白字，要换成白底，深灰字，不要加粗，外框用阴影浮起。加抖一抖动态」
   四样各钉一条。⚠ 钉的是**吃哪一档令牌**，不是字面色值——色一律从 palette 递进来
   （`--cp-*`），把 `#FFFFFF` 钉死等于把梯子钉成一处，换壁纸那一趟就红得没道理。
   抖一抖那条只许动 transform：上面那三条量落点的判据（顶边／盖住框的一半／面板不动）
   靠的是 left/top/width 不变，动画要是把位移写到那三枚上，量的就不再是同一件事。 */
const bub = seg('.hint-bubble')
const bubSkin = {
  whiteFace: (s) => /background:\s*var\(--cp-card\)/.test(s) && !/background:\s*var\(--cp-ink/.test(s),
  greyInk: (s) => /color:\s*var\(--cp-ink-78\)/.test(s) && !/color:\s*var\(--cp-card\)/.test(s),
  thin: (s) => /font-weight:\s*400/.test(s) && !/font-weight:\s*700/.test(s),
  floated: (s) => /box-shadow:/.test(s),
  shake: (s) => /animation:\s*[\w-]*shake[\w-]*\s/.test(s),
}
ok('面换成白底（吃白卡那一档 --cp-card，与这一屏输入框同一个值；暗面 --cp-ink 不许回来）',
  bubSkin.whiteFace(bub), bub.replace(/\s+/g, ' ').slice(0, 80))
ok('字换成深灰（吃这一屏已经在用的 --cp-ink-78，快门那一行的字同一档；不另起一架梯子）',
  bubSkin.greyInk(bub), `字色 ${(/color:[^;]*/.exec(bub) || ['(没写)'])[0].trim()}`)
ok('不加粗（他这句明写"不要加粗"）', bubSkin.thin(bub),
  `字重 ${(/font-weight:[^;]*/.exec(bub) || ['(没写)'])[0].trim()}`)
ok('外框靠阴影浮起（白面压在白卡上，除了这一枚阴影，没有第二样把它和卡分开）',
  bubSkin.floated(bub))
ok('出现那一帧抖一下，且挂在基条上（不挂 .container.has-bg 那种覆盖里——两态都得抖）',
  bubSkin.shake(bub) && /@keyframes\s+cre-hint-shake/.test(wxss),
  `${(/animation:[^;]*/.exec(bub) || ['(没挂动画)'])[0].trim()}`)
const frames = ((wxss.match(/@keyframes\s+cre-hint-shake\s*\{([\s\S]*?)\n\}/) || [, ''])[1])
ok('抖的只有 transform：逐帧都不许写 left/top/width/margin（写了就把上面那三条落点判据作废）',
  !!frames && frames.split('}').every((f) => !/\b(?:left|top|width|margin)\b/.test(f)),
  frames.replace(/\s+/g, ' ').slice(0, 90))
ok('不再有一档"铺图态暗面配浅字"的覆盖（10-11 §6.4 拍过的那一版被他这一句翻过来）',
  !/\.container\.has-bg\s+\.hint-bubble\s*\{/.test(wxss))
/* 反向一次就停手：把这一枚按 10-18 之前那一版放回去，白底／深灰字／不加粗／抖一抖四条要一起红。
   阴影那条故意留 true——旧版本来就有阴影，他这次没打回它，这条判据不该对它表态。 */
const oldSkin = bub.replace('var(--cp-card)', 'var(--cp-ink)')
  .replace('var(--cp-ink-78)', 'var(--cp-card)')
  .replace('font-weight: 400', 'font-weight: 700')
  .replace(/animation:[^;]*;/, '')
ok('反向：旧那一版皮（暗面浅字加粗、不抖）放回来，上面四条当场红',
  [bubSkin.whiteFace, bubSkin.greyInk, bubSkin.thin, bubSkin.shake].every((f) => f(oldSkin) === false)
    && bubSkin.floated(oldSkin) === true)
ok('"几秒后消失"有人管：算出这一位之后统一上表，撤掉时统一撤表',
  /if \(patch\.hintLine\) this\._armHint\(\)/.test(js) && /else this\._clearHint\(\)/.test(js)
  && /onHide\(\)[\s\S]{0,300}_clearHint\(\)/.test(js) && /onUnload\(\)[\s\S]{0,200}_clearHint\(\)/.test(js))
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
// 改名这一类漂移会红；真要往卡里加第五块，名单得跟着加（这条钉不住漏加，是它够不到的地方，写明白）。
// 10-16 站长「把原文翻译的开关上移到与返回同一行左边」⇒ `.wr-sw` 从卡里搬到框外那一行，名单从五枚并到四枚。
// 搬走不是消失：它由下面那组 `.out` 的判据钉（在框外那一行里、三档都画、默认开）。
// 位置这一头用**源码里的先后**判，不用"隔多少个字符"那种距离启发式：
// `class="out"` < `class="wr-sw"` < `class="panel` ⇒ 开关在框外那一行、不在面板肚子里。
const iOut = wxml.indexOf('class="out"')
const iSw = wxml.indexOf('class="wr-sw ')
const iPanel = wxml.indexOf('class="panel ')
ok('卡里那一层的块名就是真跑名单那四枚（改名要一起改名单）',
  ['crow', 'strip', 'field', 'sld'].every((c) => new RegExp(`class="${c}[ "]`).test(wxml)
    && new RegExp(`\\.${c}\\s*\\{`).test(wxss))
  && iOut >= 0 && iSw > iOut && iPanel > iSw,
  `out@${iOut}／wr-sw@${iSw}／panel@${iPanel}`)

// ---------- 3. 一个功能只留一个入口 ----------
// 站长 10-18 01:1x「首页换背景，也要拉起这个弹窗，不需要跳到设置里面换」⇒ 这一枚不再导流去 profile。
// 「这一枚自己不弹相册」那半条还在：起系统选图面板的是那一层里的「更换／＋」，不是点这一枚就弹。
ok('换背景这一枚只拉起那一层，自己不弹相册',
  /goHomeBg\(\)\s*\{\s*this\.onOpenCardInfo\(\)/.test(js) && !/goHomeBg[\s\S]{0,200}chooseMedia/.test(js))
ok('反向：把那条导流（navigateTo profile）写回这一枚里，上面这条必须红',
  !/goHomeBg\(\)\s*\{\s*this\.onOpenCardInfo\(\)/.test(
    js.replace('this.onOpenCardInfo()', "wx.navigateTo({ url: '/pages/profile/profile' })")))
ok('「我的」那一格去设置那一页的路由没被顺带撤掉（他这轮只说不必从这一枚跳过去）',
  /\/pages\/profile\/profile/.test(fs.readFileSync(P('pages/me/me.js'), 'utf8')))
ok('选图入口全页只有 pickImage 一处', (js.match(/wx\.chooseMedia/g) || []).length === 1)
// 这一条改过三次口，来历留在注释里，别再照第一版判：
// · 10-11 12:2x「调亮度，换背景，再第二屏也需要，第二屏就是带拍摄面板那个」⇒ 撤掉"展开态不渲染"，
//   两屏都在；10-14 站长又定"白底那一档也要画这一行"（§8.235），闸只留左边那一截看 `bgSrc`。
// · 10-15 02:5x「第二屏不支持三个设置，要隐藏」⇒ **又改回展开态不画**。
//   原来那一条判据钉的是"凡带 `.home-swap` 的规则块一律不许出现 display:none"——那是替他
//   10-11 那句"两屏都在"守的门；今天门换了方向，尺子跟着翻，不拿代码去迁就旧尺子
//   （同一形状见 [[feedback-removing-a-state-invalidates-rulers]]）。
//   现在钉的是**反向**：`.container.entry-dock .home-swap` 那一条必须在、且真的是 display:none。
const swapBlocks = (wxss.match(/[^{}]*\.home-swap[^{]*\{[^}]*\}/g) || [])
const swapDock = /\.container\.entry-dock\s*\.home-swap\s*\{([^}]*)\}/.exec(wxss.replace(/\s+/g, ' '))
ok('「调亮度／换背景／换心情」那一行只有首屏画（10-14 白底也画这一条没改；10-15 起第二屏整条隐藏）',
  /<view class="home-swap">/.test(wxml)
  && /wx:if="\{\{bgSrc\}\}" class="swap-half swap-dim" catchtap="onCycleDim"/.test(wxml)
  && !!swapDock && /display:\s*none/.test(swapDock[1]),
  swapDock ? swapDock[1].trim() : '没找到 `.container.entry-dock .home-swap` 那一条')
ok('隐藏只准挂在展开态：收起态那一态不许有任何一条规则把这一行藏掉',
  swapBlocks.filter((b) => !/entry-dock/.test(b)).every((b) => !/display:\s*none|visibility:\s*hidden/.test(b)))
// 站长 10-14 22:4x「换心情，调亮度，换背景，下移到下半部，面板上方」＋10-15 01:4x
// 「现在位置不准，离框框太高了，浪费空间」⇒ 这一档的"准"不是抄一个数，是**从面板顶算下来**：
// 盒底 B、盒高 H、行高 L（字顶对齐 ⇒ 字下沿在盒底之上 H−L），要字下沿离面板顶留 16 的呼吸
// ⇒ B ＝ 面板顶 ＋ 16 −（H − L）＝ 548 ＋ 16 −（88 − 34）＝ 510。
// 三个数全部现读：面板顶 548 在 `.stage-panel` 那条里、盒高在 `.home-swap`、行高在 `.swap-text`。
// 原来这里写死 `bottom:\s*560rpx`——他 10-14 抬了一档、10-15 又追一句"离框太高"，
// 一个数改两次、尺子红两次，就是抄死的代价。
const swapFixed = /container:not\(\.entry-dock\)\s*\.home-swap\s*\{([^}]*)\}/.exec(wxss.replace(/\s+/g, ' '))
{
  // `.stage-panel` 的顶写的是 `calc(100vh - 548rpx)`，`lens()` 那把通用解长度器的最后一档要
  // `^数字rpx$`，撞上右括号就归 null ⇒ 这里单认这一支写法，别拿通用那把去掏 calc。
  const panelCss = (/\.stage-panel\s*\{([^}]*)\}/.exec(wxss.replace(/\s+/g, ' ')) || [, ''])[1]
  const panelTop = Number((/top:\s*calc\(100vh\s*-\s*(\d+)rpx\)/.exec(panelCss) || [])[1] || NaN)
  const boxH = num(seg('.home-swap'), 'height')
  const lineH = num(seg('.swap-text'), 'line-height')
  const want = panelTop + 16 - (boxH - lineH)
  const got = swapFixed ? num(swapFixed[1], 'bottom') : NaN
  ok('收起态那一行钉在面板上方（fixed＋bottom 从面板顶现算，字下沿离面板顶 16 的呼吸）',
    !!swapFixed && /position:\s*fixed/.test(swapFixed[1]) && /margin:\s*0/.test(swapFixed[1])
    && Math.abs(got - want) <= 1 && want > 0,
    `bottom ${got}，按 ${panelTop}＋16−(${boxH}−${lineH}) 该是 ${want}`)
  // 左右 14 不是 24：三枚各带 10rpx 的横向内边距（`.swap-half` 那枚热区），
  // 14＋10 才让**字与图形的可见边**落在这一页那条 24 的列上。
  // `.swap-half` 那道内缩写的是简写 `padding: 0 10rpx`，`num(..., 'padding-left')` 认不到 ⇒ 现读简写
  const halfPad = (() => {
    const m = /padding:\s*([^;]+)/.exec(seg('.swap-half'))
    if (!m) return NaN
    const v = m[1].trim().split(/\s+/).map(parseFloat)
    return v.length === 1 ? v[0] * 2 : v[1] * 2
  })()
  ok('那一行的左右落点：fixed 的 left/right 对称，加上一枚自己的内缩＝这一页那条 24 的列',
    !!swapFixed && num(swapFixed[1], 'left') === num(swapFixed[1], 'right')
    && 24 - num(swapFixed[1], 'left') === halfPad / 2,
    `left ${swapFixed ? num(swapFixed[1], 'left') : NaN}／一枚的内缩 ${halfPad}`)
  // 站长 10-15 02:5x「第一屏三块设置，要在那一行自动均匀分布左中右，自然展开」⇒ 从"靠左堆着"
  // 改成两头对齐。钉的是**这一条等式**：三枚都不许定宽（定宽就均分不出来），且 justify 是 space-between。
  ok('三枚靠左中右自动均分（space-between ＋ 三枚都不定宽；写死宽度＝换语言就挤）',
    /justify-content:\s*space-between/.test(seg('.home-swap'))
    && !/width:/.test(seg('.swap-half')),
    `justify ${(/justify-content:\s*([^;]+)/.exec(seg('.home-swap')) || [])[1] || '没写'}／.swap-half 里出现 width 即红`)
}
ok('➕ 那一格是唯一"再加一张"的落点', (wxml.match(/catchtap="onAddShot"/g) || []).length === 1)
// 站长 10-11 真机报的「拍照只支持一张，相册可以」根因就在这两条上：快门那一排的条件是
// `!previewImages.length`，所以第一张之后**整排消失**，➕ 成了唯一入口；而 ➕ 原来没带 data-source，
// pickImage 读到 undefined ⇒ `sourceType: [undefined]` 是一个枚举外的值，第二张就再也进不了相机。
// 第一条钉前提（快门那排在有一张图之后确实不在了），第二条钉接替者必须自己把相机这条路保住。
ok('照片圈那一排只在零张时渲染（所以 ➕ 是拍完之后的唯一入口）',
  /class="crow"[^>]*wx:if="\{\{active === 'photo' && !previewImages\.length\}\}"/.test(wxml)
  || /wx:if="\{\{active === 'photo' && !previewImages\.length\}\}"[^>]*class="crow"/.test(wxml))
{
  const gates = (wxml.match(/<view[^>]*catchtap="(pickImage|onAddShot)"[^>]*>/g) || [])
  const bad = gates.filter((tag) => !/data-source="(album|camera|any)"/.test(tag))
  ok('每一个通往 pickImage 的入口都带合法 data-source（漏一个就会发出 sourceType:[undefined]）',
    gates.length === 3 && bad.length === 0,
    `抓到 ${gates.length} 个入口，缺来源的：${bad.join(' ⎪ ') || '无'}`)
}

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
/* 整套图形只留一个描边重量（原来 1.5 与 1.6 混用，小尺寸上粗细不齐）。
   10-13 第二屏方案 D19 甲开了一条例外：首屏那枚圆形 ➕ 单独粗到 2.4（站长「还有原内的➕号，稍微粗一点」）。
   例外只给那一枚，所以钉三样：① 重量集合只能是 {1.6} ∪ {那一枚的那两行}；② 那两行必须成对
   （`-webkit-mask-image` ＋ `mask-image`——只写一条在 iPhone 上静默不生效）；③ 它们必须真落在
   `.blk-plus-glyph` 自己那一段里（跑到别处＝把整页图形一起加粗，1.6 那一档就没人守了）。 */
const sw = [...new Set((wxss.match(/stroke-width='[\d.]+'/g) || []).map((x) => x.slice(14, -1)))]
// 只认选择器**正好**是 `.blk-plus-glyph` 的那几段（文件里它出现两次：基础那条给尺寸与面色，
// 后一条给 2.4 那支 mask）。用 indexOf 会从第一段起算、把 `}` 之前的内容当成整段，读出来恒为 0。
const thickLines = [...wxssRaw.matchAll(/(?:^|\n)\.blk-plus \.blk-plus-glyph\s*\{([^}]*)\}/g)]
  .reduce((n, m) => n + ((m[1].match(/stroke-width='2\.4'/g) || []).length), 0)
ok('这一页的图形描边只有 1.6 那一档（外加首屏圆形 ➕ 单独那一支 2.4）',
  sw.every((x) => x === '1.6' || x === '2.4') && sw.includes('1.6') && thickLines === 2,
  `重量 ${sw.join(',')}／➕ 那一段里 2.4 出现 ${thickLines} 次（要 2＝标准＋-webkit- 各一行）`)

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
// 「卡片上的信息」那一层 10-18 起也在这一屏（那枚「换背景」拉起同一层），而它的实现整份在
// utils/cardInfo.js、页面是 spread 进去的 ⇒ 这一句的真实主语是"这一屏点得到的东西有实现"，
// 不是"字面必须出现在本页文件里"。允许来自那一份 spread，查不到照旧红。
const CARD_INFO = fs.readFileSync(P('utils/cardInfo.js'), 'utf8')
const sharedCi = (h) => /\.\.\.cardInfo\.handlers/.test(js) && new RegExp('^  ' + h + '[(:]', 'm').test(CARD_INFO)
;[...handlers].forEach((h) => {
  ok(`处理函数 ${h} 有实现（本页，或 utils/cardInfo.js 那一份 spread）`,
    new RegExp('\\b' + h + '\\s*\\(').test(js) || sharedCi(h))
})

// ---------- 5. 几何：面板两档高度、卡里那一段装不装得下，全是算出来的 ----------
const panelCss = seg('.panel')
const PANEL_H = num(panelCss, 'height')
const PANEL_OPEN_H = num(seg('.panel-open'), 'height')
// 这两档的来历：10-08 之前 700，10-08 压成 500／580，10-10 压进站长那圈红框成 410／490，
// 10-14 站长「第二屏的内面板，高度压缩一下，排版紧凑一点」＋「两个屏的内框高度要一致」
// ⇒ 收起 372（与首屏那块左块同一个数），展开仍 490（那一档本来就没有富余）。
// 这里**不钉字面量**：钉的是两条关系——收起＝首屏左块同高、展开−收起＝一行小图的行距。
// 真要改数，改的是这两条关系与下面那三条加总（`验-录入面板沉底.js` 读的是同一份 CSS）。
const BLOCK_H = num(seg('.blk-person'), 'height')
const ROW_PITCH = num(seg('.th'), 'height') + num(seg('.strip'), 'gap')
ok('收起那一档与首屏那块左块同高（两屏的内框是同一个数）',
  PANEL_H > 0 && PANEL_H === BLOCK_H, `面板 ${PANEL_H}／左块 ${BLOCK_H}`)
ok(`展开那一档正好多一行小图（差 ${PANEL_OPEN_H - PANEL_H}，一行是 ${ROW_PITCH}）`,
  PANEL_OPEN_H - PANEL_H >= ROW_PITCH && PANEL_OPEN_H - PANEL_H < ROW_PITCH + 8,
  `${PANEL_OPEN_H} − ${PANEL_H}`)
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
/* 卡的 `margin-bottom` 有两个来源：这一页自己写的那一条，和 `app.wxss` 全局 `.card` 那一条
   （它带 `margin-bottom: var(--sp-2)`）。全局那份会**静默补**到页面没写的属性上——
   10-10 深夜真跑量到展开两档各溢出 7／12.8rpx，而这条算式一条都不红，差的就是这 16rpx。
   所以两头都读：页面写了就按页面的，没写就把全局那一档算进 chrome。 */
const appCardCss = (new RegExp('\\n\\.card\\s*\\{([^}]*)\\}').exec(appCss) || [, ''])[1]
// `margin-bottom: 0` 没有单位，`num()` 那一档只认 rpx/var，所以这里自己解一次"0 也算一个数"。
const lenOrZero = (css, prop) => {
  const m = new RegExp(`${prop}:\\s*([^;]+)`).exec(css)
  if (!m) return NaN
  return /^\s*0\s*$/.test(m[1]) ? 0 : num(css, prop)
}
const cardMbGlobal = lenOrZero(appCardCss, 'margin-bottom')
const cardMbOwn = lenOrZero(cardCss, 'margin-bottom')
const cardMarginBottom = Number.isFinite(cardMbOwn) ? cardMbOwn : (Number.isFinite(cardMbGlobal) ? cardMbGlobal : 0)
ok('这一页的 `.card` 自己把 margin-bottom 说死了（全局那一份带 16rpx，不写就被静默补进定高的面板里）',
  Number.isFinite(cardMbOwn) && cardMbOwn === 0 && Number.isFinite(cardMbGlobal),
  `页面写 ${cardMbOwn}／全局那一份 ${cardMbGlobal}`)
// 10-10 压进红框把标签行上面那 25rpx 归 0 了（站长那句"小横杠与下方靠近"）。
// 这里读不到就当 0，但下面那条钉"必须真的没有"，别让它悄悄长回来。
const modesMargin = Number.isFinite(num(seg('.modes'), 'margin-top')) ? num(seg('.modes'), 'margin-top') : 0
ok('标签行上面不再有 margin（那一档 10-10 归 0，算式里它就是 0）',
  !/margin-top/.test(seg('.modes')), seg('.modes').replace(/\s+/g, ' ').slice(0, 70))
// 标签行 10-10 深夜起是**定高**的：那三枚要扩热区（站长「三个Tab很难点，把按键区域扩大」），
// 高度不再由"字号 × 默认行高 ＋ 下内边距"派生，而是 `.modes` 自己写死一档，高出来的部分全是给指头的。
// 这一档的来历：白卡里原来那两档 auto 边距（框上面、条上面）撤掉了上面那一档，省出来的整数搬到这里。
const modesH = num(seg('.modes'), 'height')
ok('标签行是定高的（扩热区那一档，读不到就是算式在空转）',
  Number.isFinite(modesH) && modesH > 0, `${seg('.modes').replace(/\s+/g, ' ').slice(0, 80)}`)
const innerWidth = 750 - 2 * dockInset - 2 * panelBorder - 2 * panelPadX
const cardInnerW = innerWidth - 2 * cardBorder - 2 * cardPad
// 面板自己那 3rpx 描边也在定高里面（border-box），漏掉它算出来的可用高度会多 6rpx——
// 10-08 真跑量到卡里可用 251.7，而当时这条算的是 263.5，差的就是这 6 加行高那 6。
const usedByChrome = 2 * panelBorder + panelPadY + modesMargin + modesH + cardMargin + cardMarginBottom + 2 * cardBorder + 2 * cardPad + panelPadBottom
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
// 展开那一档的"两行框"高度 10-10 深夜起写在壳（.field-write-2）身上：那格多包了一层，
// textarea 只负责字、壳负责那一格多高（原生组件装不下子节点，那枚粘贴钮只能做兄弟）。
const write2H = num(seg('.field-write-2'), 'height')
// 10-16 之前这一条加总里还含 `.wr-sw` 那 48＋8（开关住在卡里）。站长「把原文翻译的开关上移到与返回
// 同一行左边」⇒ 卡里只剩两行框与那一枚条，加总跟着改口径（改判据不改代码迁就旧尺子）。
// ⚠ 搬走之后展开那一档多出 56rpx 富余，**面板那两档 372／490 一个数没动**（他拍过的数，
//   撤一截留白是另一刀）：这条把富余打在读数里，不许它悄悄变成"看起来本来就这样"。
ok('展开那一档装得下两行框 + 条（开关 10-16 已搬出卡里）',
  write2H + sldH <= openCardInnerH,
  `需 ${write2H}+${sldH}=${write2H + sldH} ≤ ${openCardInnerH.toFixed(1)}　富余 ${(openCardInnerH - write2H - sldH).toFixed(1)}（其中 56 是原来给开关那一行的，面板高没动）`)
ok('两行框那一档仍然只比一行多一行（105 → 160，"展开只多一行"那句没被这轮改动顶掉）',
  write2H === 160 && fieldH === 105, `一行 ${fieldH} / 两行 ${write2H}`)
/* 文字那一档补一枚粘贴（站长 10-10 深夜「文字tab，里面输入框也要提供粘贴ICON，与链接tab一致」）。
   "一致"钉的是三件事：同一份皮（.field-paste 那一档 72 见方）、同一个位置（框内右端）、
   同一份图形（同一支 glyph-clipboard，不另画一份）。语义**不许**一致：链接是一行，
   贴进去就是替换；原文框已经有人打好字了，贴进来只能接在后面。 */
const writeBlock = (/class="field field-write[\s\S]*?<\/view>\s*<!--/.exec(wxml) || [''])[0]
  || wxml.slice(wxml.indexOf('class="field field-write'), wxml.indexOf('class="field field-write') + 900)
ok('文字那一格右边确实有一枚粘贴，且吃的是链接那一档同一个类名',
  /class="field-paste" catchtap="onPasteWrite"/.test(writeBlock) && /paste-glyph glyph-clipboard/.test(writeBlock),
  writeBlock.replace(/\s+/g, ' ').slice(0, 90))
// 框自己的 padding 只许给上下（横向由壳给那一份 28）——两边各给一次，两档的字就错开 28rpx。
// ⚠ 后半句原来钉的是"壳**必须**再给一道 `padding-right`"，10-15 02:1x 撤了：那一道 14rpx 只写在
//   `.field-write`（文字那一档的壳）上，链接档没有 ⇒ 同一枚剪贴板图标在两档之间横跳 14rpx，
//   正是站长那句「切换时候跳到…除了输入框内文字不同外，上下左右的占位要保持不变」点着的火。
//   撤完探针复量两档：`.field` 534/54、里面那枚 53/253、`.field-paste` 306/37、`.sld` 598/57
//   ——四枚数在两档之间逐字相同（`docs/design/10-15首屏六件/`）。
//   ⇒ 判据跟着翻成"两档都不许自己加横向内缩"，而不是拿代码去补回那 14 迁就旧尺子。
ok('横向留白只在壳上给一份，两档不再各加一道（谁再写 padding-left/right 谁红）',
  (() => {
    const p = (seg('.field-area').match(/padding:\s*([^;]+)/) || [, ''])[1].trim().split(/\s+/).map(parseFloat)
    const four = p.length === 4, l = four ? p[3] : (p.length > 1 ? p[1] : p[0])
    const r = four ? p[1] : (p.length > 1 ? p[1] : p[0])
    // "这一条规则里有没有横向内缩"：单写 padding-left/right 算，简写的第二档（横向）非 0 也算。
    const side = (s) => {
      if (/padding-(left|right)\s*:\s*(?!0\b|0rpx|0px)/.test(s)) return true
      const m = /padding:\s*([^;]+)/.exec(s)
      if (!m) return false
      const v = m[1].trim().split(/\s+/).map(parseFloat)
      if (v.some(Number.isNaN)) return false
      return v.length === 4 ? (v[1] !== 0 || v[3] !== 0) : (v.length > 1 ? v[1] !== 0 : v[0] !== 0)
    }
    return p.length > 0 && l === 0 && r === 0 && !side(seg('.field-write')) && !side(seg('.field-input'))
  })(),
  `框 ${seg('.field-area').replace(/\s+/g, ' ')}／文字壳 ${seg('.field-write').replace(/\s+/g, ' ') || '(没有这一条)'}`)
ok('原文框已有内容时贴进来是接在后面，不是顶掉（两档语义各管各的）',
  /const had = this\.data\.writeBody[\s\S]{0,200}\$\{had[\s\S]{0,40}\}\\n\$\{s\}/.test(js),
  '没找到"接在后面"那一支＝可能把人打好的字整段换了')
/* `height:100%` ＋ 上内边距同时写在框身上，就必须配 box-sizing:border-box：默认那一档
   content-box 会把内边距加在 100% **外面**（105 的壳里塞一个 129 的框，字掉到圆角外面）。
   这一条不用等渲染就能钉——它是两条声明凑在一起才成立的错，静态读得出来。 */
ok('文字框配了 box-sizing:border-box（不配它 height:100% ＋ 上内边距＝溢出壳）',
  /box-sizing:\s*border-box/.test(seg('.field-area')),
  seg('.field-area').replace(/\s+/g, ' '))
// 上内边距是**算出来对齐**的数，不是留白：链接格那行字由 align-items:center 竖直居中，
// 字顶离壳顶 = 边框 ＋ (壳 105 − 边框×2 − 行高 28×1.5) / 2；textarea 的字从自己的内容顶顺着排，
// 所以给同一个数才齐。⚠ 边框这一枚**从 `.field` 自己身上现量**，不再吃全局 `--w-edge`：
// 10-16 站长「输入框风格不要白线」⇒ 壳那条浅色描边整条撤了，边框＝0，算式跟着变成
// (105 − 42) / 2 = 31.5（原来那条 `28 ＋ 边框 3 = 31` 的写法作废）。改了字号/边框/壳高，这条会红着提醒。
ok('框的上内边距就是"与链接格那行字对齐"算出来的那一个（±1rpx，边框从 .field 现量）',
  (() => {
    const pt = parseFloat((seg('.field-area').match(/padding:\s*([\d.]+)rpx/) || [, ''])[1])
    const lh = parseFloat((seg('.field-area').match(/line-height:\s*([\d.]+)/) || [, ''])[1])
    const edge = num(seg('.field'), 'border') || 0          // 撤了白线就是 0
    const line = parseFloat(TOK['fs-body']) * lh
    return Number.isFinite(pt) && Number.isFinite(lh) && Math.abs(pt - (edge + (fieldH - 2 * edge - line) / 2)) <= 1
  })(),
  (() => {
    const lh = parseFloat((seg('.field-area').match(/line-height:\s*([\d.]+)/) || [, '1'])[1])
    const edge = num(seg('.field'), 'border') || 0
    return `padding ${(seg('.field-area').match(/padding:\s*([^;]+)/) || [, ''])[1]}／算出 ${edge + (fieldH - 2 * edge - parseFloat(TOK['fs-body']) * lh) / 2}（壳边框 ${edge}）`
  })())
/* 10-10 深夜改的口：白卡里**上白边必须等于下白边**（站长原话「面板内最上面的白边高度，
   与最下面的白边高度不一样，应该调整为与最下面的一样，把多出来的高度放在三个tab部分」）。
   原来两档 auto（框上面＋条上面）把富余对半分，上白边就成了 padding＋半份、下白边只有 padding，
   两头永远差半份。现在只留条上面那一档：框贴着卡顶，两头都等于 `.card` 的上下内边距。
   下面这三条钉的是这件事的三头：框与图排身上不许有 auto、条身上必须有、两头相等由谁给。 */
const cardPadTop = num(seg('.card'), 'padding-top') || num(seg('.card'), 'padding')
ok('框（链接／文字）与图排身上不再有 auto 上边距——上白边只由卡的内边距给',
  !/margin-top:\s*auto/.test(seg('.field')) && !/margin-top:\s*auto/.test(seg('.strip')),
  `${seg('.field')} / ${seg('.strip')}`)
ok('条上面那一档 auto 还留着（它才是"贴卡底"那一条）', /margin-top:\s*auto/.test(seg('.sld')))
ok('卡的内边距上下同一个数（上白边＝下白边这条决定的落点）',
  Number.isFinite(cardPadTop) && cardPadTop === (num(seg('.card'), 'padding-bottom') || cardPadTop), `${cardPadTop}`)
// 标签行拿到的那一段必须真的比原来高（否则"扩热区"这句就是空话）
// 标签行那一块必须比字本身高出一截，否则"扩热区"这句是空话：字那一档 31×1.2=37.2，
// 判的是"至少再给指头 24rpx"（64 那一档留的是 26.8）。上限不在这里——上限由展开那一档
// 装不装得下"两行框＋开关＋条"那条判据管着（两条夹住同一个数，谁改都会红）。
ok('标签行那一块比字高出一截（多出来的高度确实落在这一行，不是又还给卡）',
  modesH >= num(seg('.md'), 'font-size') * 1.2 + 24, `行 ${modesH} / 字 ${num(seg('.md'), 'font-size')}×1.2 ＋ 24`)
ok('三枚标签各自吃满这一行的高度（热区是"整块"，不是字那么大）',
  /align-items:\s*stretch/.test(seg('.modes')) && /display:\s*flex/.test(seg('.md')) && /padding:\s*0\s+22rpx/.test(seg('.md')),
  seg('.md').replace(/\s+/g, ' '))
/* 报错那枚气泡的高度位置也是算出来的，不是随手一个 top:78：
   顶 = 面板上内边距 ＋ 标签行 ＋ 卡上边距（正好贴着卡顶，不骑在标签行上），
   底 = 顶 ＋ min-height（不许盖过输入框的一半——字竖直居中，盖过一半就吃到那一行了）。
   两头都从样式表现读，改了标签行高度或卡的内边距，这里会跟着红。 */
const bubTop = num(seg('.hint-bubble'), 'top')
const bubMinH = num(seg('.hint-bubble'), 'min-height')
const panelPadTopN = num(seg('.panel'), 'padding-top') || num(seg('.panel'), 'padding')
const cardTopY = panelPadTopN + modesH + num(seg('.card'), 'margin-top')
const fieldTopY = cardTopY + num(seg('.card'), 'border') + cardPadTop
ok('气泡贴在卡顶下面一点，不骑到标签行上（那三枚的热区不能被报错盖住）',
  bubTop >= cardTopY && bubTop - cardTopY <= 12, `气泡顶 ${bubTop}／卡顶 ${cardTopY}`)
ok('气泡最矮那一档也盖不过输入框的一半（字在中间，那一行露得出来）',
  bubTop + bubMinH <= fieldTopY + fieldH / 2, `气泡底 ${bubTop + bubMinH}／框顶 ${fieldTopY}／中线 ${fieldTopY + fieldH / 2}`)

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
/* 10-10 深夜这一枚改了两件事（站长原话「拖动的圆ICON要换成橙色，但如果上面的输入框里面没内容，
   不允许滑动圆ICON。链接与文字处理一致」）：
   ① 皮上不再洗灰——`.sld-off` 里不许再出现给圆或圆里那支图形上色的规则，橙色就是基础那一条；
   ② 锁挪到行为上——`!ready` 根本不起拖（`onSlideStart` 里 return），所以也不会有"拖到一半回弹"。
   两档共用同一份模板与同一个处理函数，所以"链接与文字一致"这一句是白送的，
   但还是钉一条：三档的 ready 判定各自由谁说了算。 */
ok('没内容那一档不再改圆的颜色（圆全程是那一支橙）',
  !/\.sld-off \.sld-knob\s*\{[^}]*background/.test(wxss) && !/\.sld-off \.sld-glyph\s*\{/.test(wxss)
  && /background:\s*var\(--cp-extract\)/.test(seg('.sld-knob')), seg('.sld-knob').replace(/\s+/g, ' '))
ok('橙圆里那支图形吃的是配对那支字色（橙压白 4.53，反过来白压橙不够）',
  /background:\s*var\(--cp-extract-ink\)/.test(seg('.sld-glyph')), seg('.sld-glyph').replace(/\s+/g, ' '))
ok('空着不许起拖：onSlideStart 里 !ready 直接挡在门口，并且把那句校验说出来',
  /onSlideStart\(e\)\s*\{[\s\S]{0,600}?if \(!this\.data\.ready\) \{ this\.runSubmit\(\); return \}/.test(js),
  '没找到那一行＝又能空滑了')
ok('三档共用同一枚 ready：readyFor() 只有一处定义、只有一处写进 data（"链接与文字一致"靠的就是这一条）',
  (js.match(/readyFor\(\)\s*\{/g) || []).length === 1 && (js.match(/ready: this\.readyFor\(\)/g) || []).length === 1,
  `定义 ${(js.match(/readyFor\(\)\s*\{/g) || []).length} 处 / 写入 ${(js.match(/ready: this\.readyFor\(\)/g) || []).length} 处`)
/* 那一圈写在 .sld 的 border 上、而填充是绝对定位的兄弟节点——圆滑到最右也不会把它盖掉。
   10-16 站长「右滑的一样设计」＋「不要明显的分界线」⇒ 我一度把面与这一圈刷成**同一枚**色，
   以为"同色＝看不见"。他 17:2x 拿真机截图指着那条黑边打回：同色半透刷两层恰恰看得见——
   `background` 默认铺到 border-box，边那一圈底下已经有一层，border 再刷一层 ⇒ 实算 α .856。
   截图上竖着穿过条左沿：条身 (113,114,118)／边圈 (65,67,72)／面板 (198,199,202)。
   ⇒ 边只留结构、不留颜色（`transparent`）；宽度仍是 5rpx：圆的落点、行程上界与填充左沿都从它算出来
   （上面 SLD_MAX 那两条与 `验-录入面板沉底-真跑` 现量的是同一个数）。 */
ok('圆外面那一圈是轨道自己的 border，进度填充盖不到它',
  /border:\s*5rpx solid transparent/.test(seg('.sld'))
  && /position:\s*absolute/.test(seg('.sld-fill')) && !/z-index/.test(seg('.sld-fill')),
  seg('.sld').replace(/\s+/g, ' ').slice(0, 120))
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
// ⚠️ 纯中性白/黑要放过：这一条的名字说的是"那两支橙"，钉的是品牌色不许各页各写一遍。
// 而 --cp-extract-ink 恰好就是 #FFFFFF，于是任何一页里合法的纯白（如 10-10 晚左块那条
// 「记下来」的白底，站长原话「底色换成纯白」）都会被误报成抄了橙。那两枚橙的**值**
// 由下面两条按名钉死，中性白抄不坏东西，不在本条射程内。
const NEUTRAL = ['#FFFFFF', '#000000']
const derived = (skin.match(/--cp-(?:cam|extract)(?:-ink)?:([^;]+)/g) || [])
  .map((x) => x.split(':')[1].toUpperCase()).filter((h) => !NEUTRAL.includes(h))
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
/* 站长 10-14：「第二屏，Tips 去掉」⇒ 那枚小黄点在屏上只剩首屏一处。
   原来这三条钉的是"两屏那两枚点逐字相同"（他 10-11 13:2x 那句「要与第一屏一致」）；
   载体撤掉一处，"一致"就没有对手了，判据跟着换成"只剩一处、且那一处仍是同一个出口"：
   ① 第二屏那一行里不许再有 `.out-dot`／`.out-l`（谁回来，谁就是第二个 Tips 入口）；
   ② 首屏那一枚仍从 `tipDotStyle` 递色，样式表里没有第二支黄；
   ③ 点与字那道缝仍是 12——这一档 10-14 没指，不许被这轮顺手带走。 */
const dotGeo = (sel) => {
  const o = {}
  ;['width', 'height', 'margin-top', 'margin-right', 'border-radius'].forEach((p) => {
    const m = new RegExp(`${p}:\\s*([^;]+);`).exec(seg(sel))
    o[p] = m ? m[1].trim() : null
  })
  return o
}
const gTip = dotGeo('.tips-dot')
ok('第二屏那一行里不再有 Tips、也不再有它前面那枚点（`.out-l`／`.out-dot` 全项目清零）',
  !/out-l|out-dot/.test(wxml) && !/\.out-l|\.out-dot/.test(wxss),
  seg('.out').replace(/\s+/g, ' ').slice(0, 70))
/* 判据跟着 10-14 那一轮改口径（改的是尺子不是代码）：原来钉"小黄点只剩首屏一处"，
   因为那一阵全站只有 Tips 前面那一枚。站长今天拍的那张首屏稿上，新加的那一行
   「用 AI 帮你读懂一切…」前面也有一枚（效果图正本 `docs/design/10-14首屏顶部改版/对比.png`）
   ⇒ 现在是两枚。这条真正要防的从来不是"枚数"，而是**第二支写死的黄**：
   色只从 palette.TIP_DOT 经 style 递进来，样式表里出现 #f6c445 就是红。 */
const tipUses = (wxml.match(/style="\{\{tipDotStyle\}\}"/g) || []).length
ok('小黄点两枚（Tips 那一枚＋新行那一枚），色仍由 palette 经 style 递进来（样式表里没有第二支黄）',
  tipUses === 2 && /class="tips-dot" style="\{\{tipDotStyle\}\}"/.test(wxml)
  && /class="ai-dot" style="\{\{tipDotStyle\}\}"/.test(wxml)
  && !/#f6c445/i.test(wxss), `wxml 里 style="{{tipDotStyle}}" 出现 ${tipUses} 次`)
ok('首屏那枚点的四条几何没被这轮带走（14 见方、离字 12、圆）',
  gTip.width === '14rpx' && gTip.height === '14rpx' && gTip['margin-right'] === '12rpx'
  && gTip['border-radius'] === '50%' && /^\d/.test(gTip['margin-top'] || ''),
  JSON.stringify(gTip))
/* ---------- 站长 10-14 三刀（都在这一屏那两行小字上） ----------
   「Tips 字体调大一档」＋「调亮度换背景字体小一档，不要加粗」＋「旁边的亮度圆也同步缩小」。
   判据一律钉**关系**不钉数值：字档写在 app.wxss 的令牌梯上，以后整架梯子挪档，这几条跟着走就还成立；
   抄死 24／21 就是下一次改口的假红源头（这一类账 10-08、10-10 两轮都欠过）。 */
const tipFs = num(seg('.blk-tips-in'), 'font-size')
const swapFs = num(seg('.swap-text'), 'font-size')
const swapW = (/font-weight:\s*([^;]+);/.exec(seg('.swap-text')) || [null, ''])[1].trim()
ok('两行的主次对调了：Tips 吃 --fs-meta 那一档，且比「调亮度／换背景」大一档',
  tipFs === Number(String(TOK['fs-meta']).replace('rpx', ''))
  && swapFs === Number(String(TOK['fs-tiny']).replace('rpx', '')) && swapFs < tipFs,
  `Tips ${tipFs}／那一行 ${swapFs}（令牌 ${TOK['fs-meta']}／${TOK['fs-tiny']}）`)
ok('「调亮度」「换背景」那两字不加粗（他 10-14 点名撤的，700／bold 回来就红；不写也算过，继承下来就是常规）',
  swapW === '' || /^(normal|400|500)$/.test(swapW), swapW)
/* 10-15 01:4x 站长「调亮度的icon 改为太阳icon，风格与其他一致」⇒ 那枚 `.dim-dot` 整条撤了，
   三枚图形（太阳／箭头／云朵）从此共用**同一支** `.swap-glyph`。
   原来这三条钉的是"圆随字档、箭头随圆、两者各自对回行高"——前两条比的是**两枚元素之间**的相等，
   现在三枚是同一支类，比"两枚相等"变成一句空话（自己等于自己）。
   ⇒ 改成钉三件事：① 那一支类的边长仍随字档走；② 模板里确实是三枚 `.swap-glyph`、`.dim-dot` 没了；
   ③ 对回行高那条等式仍按各自边长重算（只剩一支，等式照旧成立才有意义）。
   ⚠ 改判据不改代码迁就旧尺子：`.dim-dot` 那条规则已经不存在，`num(seg(...))` 回 NaN，
   留着那两条就是**假红**（摸不到规则不等于画错了，是那一层根本没了）。 */
const glyphCount = (wxml.match(/class="swap-glyph/g) || []).length
ok('三枚图形共用一处尺寸，且仍随那一行的字档同步（直径与字档脱钩即红）',
  num(seg('.swap-glyph'), 'width') === swapFs, `.swap-glyph ${num(seg('.swap-glyph'), 'width')}／字 ${swapFs}`)
ok('「调亮度」那枚圆点已经撤净、换成三枚同一支的图形（模板里 3 枚 swap-glyph、0 枚 dim-dot）',
  glyphCount === 3 && !/dim-dot/.test(wxml) && !/\.dim-dot\s*\{/.test(wxss),
  `swap-glyph ${glyphCount} 枚`)
ok('图形仍对回文字那一行（行高钉 34 不随字档走，margin-top 得按边长重算）',
  Math.abs(num(seg('.swap-glyph'), 'margin-top') - (34 - num(seg('.swap-glyph'), 'width')) / 2) <= 1,
  `.swap-glyph margin-top ${num(seg('.swap-glyph'), 'margin-top')}，边长 ${num(seg('.swap-glyph'), 'width')}`)
ok('Tips 抬档后那枚小黄点还在第一行正中间（margin-top 随字档重算，别只改字号）',
  Math.abs(num(seg('.tips-dot'), 'margin-top') - (tipFs * 1.4 - 14) / 2) <= 1,
  `margin-top ${num(seg('.tips-dot'), 'margin-top')}，该行高 ${tipFs}×1.4`)
// 10-16 之前这一行只剩一枚，`flex-end` 与 `space-between` 等价；开关搬进来之后这两头分得很开：
// 钉的就是**必须靠 justify-content 分两头**，不许有人回来给谁补一枚 gap／margin-left（那样两头都不干净）。
ok('那一行靠 justify-content 分两头（space-between），不靠 gap／margin 补缝',
  !/gap:/.test(seg('.out')) && !/margin-left:/.test(seg('.out-r'))
  && /justify-content:\s*space-between/.test(seg('.out')),
  `.out＝${seg('.out').replace(/\s+/g, ' ').trim().slice(0, 70)}／.out-r＝${seg('.out-r').replace(/\s+/g, ' ').trim()}`)

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
ok('成功那一趟的落点＝列表那一扇详情窗（吐司 800ms 后交一次 id 再 switchTab，站长 10-19 拍的）',
  /wx\.showToast\(\{ title: t\('extractSucceeded', lang\), icon: 'success' \}\)/.test(js)
  && /setTimeout\(\(\) => \{[\s\S]{0,400}?getApp\(\)\.globalData\.pendingDetailNoteId = noteId\s*wx\.switchTab\(\{ url: '\/pages\/index\/index' \}\)/.test(js))
// 反向钉：这一条钉的是"别再退回那一版"。独立详情页本身没死（卡片大图底下那枚「查看笔记」
// 与编辑保存那两条还进得去），撤的只是"提炼完把人塞进一个带返回条的整页"这一个落点。
ok('反向：提炼完不再推独立详情页（那一趟整条链上不该再有 navigateTo detail）',
  !/\/pages\/detail\/detail\?id=/.test(js))
ok('列表页那一趟真的取走这一次交接（onShow 重排完整表之后按 id 开窗，不是开窗在前）',
  /const reopen = this\._backToDetail \|\| app\.consumePendingDetail\(\)/.test(IX_JS)
  && /await this\.loadNotes\(true\)\s*if \(reopen\) await this\._reopenDetail\(reopen\)/.test(IX_JS))
ok('交接那一格取走即清（留着它，下次进列表会莫名弹出一扇三分钟前那篇的窗）',
  /consumePendingDetail\(\)\s*\{[\s\S]{0,160}pendingDetailNoteId = 0[\s\S]{0,60}return id \|\| 0/.test(APP_JS))
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

/* 「原文翻译」那一枚。10-16 站长两刀同一句：「上移到与返回同一行左边，三个tab全局都可用」
   ＋「默认是翻译，关闭就不翻译」⇒ 原来那两条（"仍在文字档、只在展开态出现"、"默认关那一位没动"）
   的前提都不在了，按「撤一个状态会作废一批判据」改口径，不拿代码去迁就旧尺子：
   现在钉的是①住在框外那一行、②三档都画（节点上不许再有 active/panelOpen 那道闸）、③默认开。 */
ok('开关住在框外那一行里（`.out` 之内、`.panel` 之外）',
  /<view class="out">[\s\S]*?class="wr-sw [\s\S]*?<\/view>\s*<text class="out-r"/.test(wxml))
ok('三档全局：节点上没有 `active ===` 或 `panelOpen` 那道闸（这一行三档都画，开关就三档都在）',
  /class="wr-sw \{\{writeTranslate \? 'wr-sw-on' : ''\}\}/.test(wxml)
  && !/wx:if="[^"]*(active|panelOpen)[^"]*"\s+class="wr-sw/.test(wxml))
ok('默认开那一位（站长 10-16「默认是翻译」）', /writeTranslate: true,/.test(js))
ok('提炼成功那一次复位回的是**默认那一档**，不是回关（只改默认不改这里＝第一篇之后悄悄变回关）',
  /_extractDone\(result\.note_id, \{ writeBody: '', writeTranslate: true, bodyFocus: false \}\)/.test(js))
ok('三档的请求都带上这一位（原来只有文字那条带，链接与照片两条不带 ⇒ 开关是枚摆设）',
  /api\.ingestUrl\(url, this\.data\.writeTranslate\)/.test(js)
  && /api\.ingestScreenshots\(batch, this\.data\.writeTranslate\)/.test(js))
const apiJs = fs.readFileSync(P('utils/api.js'), 'utf8')
ok('客户端把这一位显式发成 true／false 两个字符串（省掉就等于让后端回落 None＝不表态）',
  (apiJs.match(/translate: translate \? 'true' : 'false'/g) || []).length === 2,
  `两处：${(apiJs.match(/translate: translate \? 'true' : 'false'/g) || []).length}`)
ok('落点是整行、用 catchtap（面板外壳挂着收起，冒上去就顺手收了）',
  /class="wr-sw \{\{writeTranslate \? 'wr-sw-on' : ''\}\}" catchtap="onToggleTranslate">/.test(wxml))
ok('两态各吃一对令牌，不在规则里写死色（关＝灰面配白点，开＝那枚橙面配白点）',
  /\.wr-sw-track\s*\{[^}]*background: var\(--cp-ink-50\)/.test(wxss)
  && /\.wr-sw-dot\s*\{[^}]*background: var\(--cp-card\)/.test(wxss)
  && /\.wr-sw-on \.wr-sw-track\s*\{[^}]*background: var\(--solid-bg\)/.test(wxss)
  && !/\.wr-sw[^{]*\{[^}]*(#[0-9A-Fa-f]{3,8}|rgba\()/.test(wxss))
ok('几何闭合：面 54、点 22、左右各留 4 ⇒ 位移只能是 24（10-17 站长「药丸要缩小一点」⇒ 从 72/32/32 并到这一档）',
  num(seg('.wr-sw-track'), 'width') === 54 && num(seg('.wr-sw-dot'), 'width') === 22
  && num(seg('.wr-sw-track'), 'height') === 30
  && /transform: translateX\(24rpx\)/.test(seg('.wr-sw-on .wr-sw-dot')))
/* 「药丸按钮改为最靠左」（站长 10-16 原话）＝这一组里**第一枚就是轨道**，名字与说明跟在后面。
   钉的是模板里的次序，不是样式里的 order：靠 order 翻出来的"最左"在朗读顺序与热区上都还是反的。 */
ok('轨道排在这一组第一枚（模板次序，不是靠 order 翻的）',
  /class="wr-sw \{\{writeTranslate \? 'wr-sw-on' : ''\}\}" catchtap="onToggleTranslate">\s*<view class="wr-sw-track">/.test(wxml)
  && !/order:/.test(seg('.wr-sw-track')) && !/order:/.test(seg('.wr-sw')),
  wxml.slice(wxml.indexOf('class="wr-sw '), 0 + wxml.indexOf('class="wr-sw ') + 120).replace(/\s+/g, ' '))
const HINT_W = {}
/* ---------- 「原文翻译」旁边那句说明（10-16 第三刀换了口径） ----------
   原来那句是一行不变的注释（站长 10-11 点的丙案「不管哪种语言，摘要都写成中文」），
   10-16 他直接给了**两态各一句**：开→「识别到外文自动翻译成中文」，关→「已关闭自动翻译」，
   并且要求这句的字体样式与「返回」一样。⇒ 原来那三条各钉一头（"注释不许跟着开关走"、
   "说的是摘要不是原文"、"注释比名字退一档"）前提全没了，按「撤一个状态会作废一批判据」改口径：
   现在钉的是①跟着这一位走 ②两枚键中英各一份 ③中文照他原话一个字不许改 ④那一句退役串一处不剩
   ⑤字号字色与「返回」同档 ⑥两态宽度中英各算一次。 */
const i18nSrc = fs.readFileSync(P('utils/i18n.js'), 'utf8')
ok('说明那句跟着状态走（三元取 translateOn／translateOff），两枚键中英都有',
  /class="wr-sw-hint">\{\{writeTranslate \? t\.translateOn : t\.translateOff\}\}<\/text>/.test(wxml)
  && !!zh.translateOn && !!zh.translateOff && !!en.translateOn && !!en.translateOff,
  `zh 开「${zh.translateOn}」关「${zh.translateOff}」／en 开「${en.translateOn}」关「${en.translateOff}」`)
ok('两句中文照他 10-16 的原话，一个字不许改、不许缩',
  zh.translateOn === '识别到外文自动翻译成中文' && zh.translateOff === '已关闭自动翻译',
  `${zh.translateOn} ｜ ${zh.translateOff}`)
ok('退役那句一处不剩（模板、字典、样式表里都不许还留着 origTranslateHint）',
  !/origTranslateHint/.test(wxml) && !/origTranslateHint/.test(i18nSrc) && !zh.origTranslateHint)
ok('说明那句与「返回」同一档字号、同一支字色，且不再单独压 α（"样式与返回一样"三条一起才算）',
  num(seg('.wr-sw-hint'), 'font-size') === num(seg('.out'), 'font-size')
  && num(seg('.wr-sw-lab'), 'font-size') === num(seg('.out'), 'font-size')
  && /color:\s*inherit/.test(seg('.out .wr-sw-hint')) && !/opacity/.test(seg('.out .wr-sw-hint'))
  && !/(#[0-9A-Fa-f]{3,8}|rgba?\()/.test(seg('.wr-sw-hint')),
  `说明 ${num(seg('.wr-sw-hint'), 'font-size')}／名字 ${num(seg('.wr-sw-lab'), 'font-size')}／那一行 ${num(seg('.out'), 'font-size')}rpx`)
// 宽度：汉字按 1em、拉丁按 0.5em 估（与上面英文占位字那条同一口径）。
// ⚠ 预算算在**框外那一行**上：750 − `.entry-wrap` 左右内缩 ×2 − `.out` 自己 padding ×2 −「返回」那一枚的字宽。
//    这一档字号 10-16 从 18 抬到 24（与「返回」同档），10-17 又按「与首屏的三个设置字体一样大」压到 21；
//    下面全部从文件现读，不写死数 ⇒ 换档不用改这条算式。
//    10-16 那一趟同时定下：说明那句两态各算一次，取最宽那一态才拦得住"关掉之后折行"这一型（折行会把 44rpx 那一行顶破＝红）。
const hintFs = num(seg('.wr-sw-hint'), 'font-size')
const labFs = num(seg('.wr-sw-lab'), 'font-size')
const trackW = num(seg('.wr-sw-track'), 'width')
// 缝现在写在两枚自己身上：轨道右边一条、说明左边一条（说明那句在这一组末尾，不再需要右缝）
const hintGap = (num(seg('.wr-sw-track'), 'margin-right') || 0) + (num(seg('.wr-sw-hint'), 'margin-left') || 0)
const dockInset2 = num(seg('.container.entry-dock .entry-wrap'), 'left')     // 与上面第 401 行那一枚同一个来源
const mOut = lens(seg('.out'), 'padding')
const outPad = mOut[1] !== undefined ? mOut[1] : mOut[0]
const backW = 2 * num(seg('.out'), 'font-size')      // 「返回」两个字，字号就是 `.out` 那一档
const outInnerW = 750 - 2 * dockInset2 - 2 * outPad - backW
;[['zh', zh], ['en', en]].forEach(([tag, d]) => {
  // 中日韩汉字＋全角标点算 1em，其余（拉丁字母、空格、半角标点）算 0.5em。
  // ⚠ 名字与说明**两头都要过这道折算**：英文那侧名字 `Translate original` 也是 18 个字母，
  //    只把说明按 0.5em 折、名字按 1em 算，会算出 690rpx 这种假红（第一版就栽在这）。
  const wOf = (str, fs) => {
    const cjk = (str.match(/[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/g) || []).length
    return cjk * fs + (str.length - cjk) * fs * 0.5
  }
  const head = trackW + hintGap + wOf(d.origTranslate, labFs)
  const onW = head + wOf(d.translateOn, hintFs)
  const offW = head + wOf(d.translateOff, hintFs)
  const w = Math.max(onW, offW)
  HINT_W[tag] = `开 ${Math.round(onW)}／关 ${Math.round(offW)}/${outInnerW}`
  ok(`${tag} 两态都放得下（轨道＋名字＋说明＋「返回」≤ 那一行的可用宽，折行=红）`,
    w + backW <= outInnerW,
    `最宽 ${Math.round(w)} ＋ 返回 ${backW} ＝ ${Math.round(w + backW)} ≤ ${outInnerW}（开 ${Math.round(onW)}／关 ${Math.round(offW)}）`)
})
/* ---------- 10-16 第六刀：输入框＝纯白，右滑条＝与底栏那一排同色 ----------
   这一格今天来回三趟，前两趟都是我把"他形容的质感"当成了"他要的画法"：
   第一趟 暗一档的井＝上下渐变＋inset 顶影＋一圈更深的墨边 ⇒ 打回「不要明显的分界线」；
   第二趟 一层 68% 暗墨（`--well`）＋透明边 ⇒ 他拿真机截图打回「完全不是我要的效果，
          输入框要纯白，右滑要与下方三个按钮 bar 同色」。
   ⇒ 这一版的口径是两句可以量出来的话，不是一种"质感"：
   ① `.field` ＝ `--cp-card`（createSkin 那支白），**实心**：没有描边、没有渐变、没有阴影、不挂滤镜；
   ② `.sld` ＝ `--glass-chrome-slide` ＋ `--glass-bf`，与底栏那排**同一层糊**、彩色四档同一个色——
      这一枚是 `palette.moodVars()` 按心情现算的（底栏那一枚 `--glass-chrome-dock` 与它同源）；
      10-16 18:3x「墨版的右滑太深了…按比例降低」之后**只有墨档从 .62 降到 .28**，其余四档仍与底栏同值
      （下面 ②b／②e 两条各钉一头：一头钉同值不许漂，一头钉分叉只许发生在墨档）；
   ③ **两态同一个值**：`.container.has-bg` 那一队里不许再有 `.field`/`.sld`。原来那条 0-3-0 的覆盖
      把基条的值整层换掉过两次（真跑读数：屏上 `rgba(214,219,227,.42)`，不是基条写的值），
      连带逼出 `.container.has-bg .sld.sld-done` 那条 0-4-0——覆盖撤了，`.sld-done` 自己就现面；
   ④ 极性跟着面翻回去：白底上必须是墨字（漏一处就是白底白字），条上那一档由色板在两支候选里现算
      （墨档 18:3x 之后面翻浅了 ⇒ 它自己从纸白翻成深字，这一句就是这一条存在的理由）；
   ⑤ 还得读得清：**混成实心之后**再算（alpha 不落地就是假数，§6.1 那条规矩），数从令牌现读不抄字面。 */
ok('① 输入框＝纯白实心：面是 createSkin 那支白，描边／渐变／阴影／滤镜一样都没有',
  /background:\s*var\(--cp-card\)(?![\w-])/.test(seg('.field'))
  && !/border:/.test(seg('.field')) && !/linear-gradient/.test(seg('.field'))
  && !/box-shadow/.test(seg('.field')) && !/backdrop-filter/.test(seg('.field')),
  seg('.field').replace(/\s+/g, ' ').slice(0, 120))
ok('② 右滑条＝这一档玻璃的面：吃 `--glass-chrome-slide` 单单一层、那一圈不刷色，外沿换成发光，糊与底栏同一档、两条成对',
  /background:\s*var\(--glass-chrome-slide\)(?![\w-])/.test(seg('.sld'))
  && /border:\s*5rpx solid transparent/.test(seg('.sld'))
  && /box-shadow:\s*0 0 24rpx 2rpx var\(--glass-plate-dock\)(?![\w-])/.test(seg('.sld'))
  && !/linear-gradient/.test(seg('.sld'))
  && /backdrop-filter:\s*var\(--glass-bf\)/.test(seg('.sld'))
  && /-webkit-backdrop-filter:\s*var\(--glass-bf\)/.test(seg('.sld')),
  seg('.sld').replace(/\s+/g, ' ').slice(0, 150))
/* ②c 这一条钉的是"黑边"那个根因本身，不是它这一次的写法：
   同一枚半透令牌既当 `background` 又当 `border` 的颜色 ⇒ border-box 上那一圈被刷两遍
   （简写 `background:` 默认铺到 border-box 底下），实算 α 比面深一整档＝屏上一条硬边。
   扫全页：任何一段里"面与圈同一枚玻璃令牌"都算回来了一版被打回的画法。 */
const doublePaint = wxss.split(/\n(?=\S)/).filter((blk) => {
  if (!/\{/.test(blk)) return false
  const bg = /(?:^|;)\s*background:\s*var\((--glass-[a-z-]+)\)/.exec(blk)
  const bd = /(?:^|;)\s*border(?:-color)?:[^;]*var\((--glass-[a-z-]+)\)/.exec(blk)
  return !!(bg && bd && bg[1] === bd[1])
}).map((blk) => (/[.#][\w-]+/.exec(blk) || ['?'])[0])
ok('②c 全页没有"同一枚玻璃令牌既当面、又当那一圈"的画法（那就是那条黑边，撤了不许回来）',
  doublePaint.length === 0, doublePaint.join(' ｜ ') || '零处')
ok('②d 发光那一枚吃的是五档已有的 `piece` 那一档（不新起第六枚色），五档各带自己的浅色',
  palette.MOODS.every((m) => {
    const v = palette.moodVars(m.key)['--glass-plate-dock']
    const c = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(v || '')
    return !!c && Math.min(+c[1], +c[2], +c[3]) >= 150 && +c[4] === 0.72
  }),
  palette.MOODS.map((m) => `${m.key} ${palette.moodVars(m.key)['--glass-plate-dock'] || '缺'}`).join(' ／ '))
/* ②b "同色"不能是我嘴上说的同色：底栏那枚面的值由 `moodChromeOf()` 现算，这一条把五档各抽一次，
   与 app.wxss 里那一枚 `--glass-chrome-dock` 比字面。少这一条，下一轮换心情／改 α 就是两处各漂各的。 */
const chromeDrift = palette.MOODS.filter((m) => m.key !== 'ink').map((m) => {
  const css = (/\.mood-[a-z]+\s*\{([^}]*)\}/.exec(
    (() => { const all = fs.readFileSync(P('app.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      return (new RegExp(`\\.mood-${m.key}\\s*\\{[^}]*\\}`).exec(all) || [''])[0] })()) || [, ''])[1]
  const tok = (/--glass-chrome-dock:\s*([^;]+)/.exec(css) || [, ''])[1].trim().replace(/\s*,\s*/g, ', ').replace(/\(\s+/g, '(')
  const live = palette.moodChromeOf(m.key).bg.replace(/\s*,\s*/g, ', ').replace(/\(\s+/g, '(')
  return tok === live ? '' : `${m.key}：app.wxss ${tok || '缺'} ≠ 底栏 ${live}`
}).filter(Boolean)
ok('②b 这一枚与底栏组件拿到的 `--chrome-bg` 五档各比一次字面相等（"与下方三个按钮 bar 同色"落在这条上）',
  chromeDrift.length === 0, chromeDrift.join('；') || '五档齐')
/* ②e 10-16 18:3x 那一句「墨版的右滑太深了，要对照其他色系深浅程度，按比例降低」把条的面从底栏那一枚
   分了出来。分叉只许发生在墨档一档上：彩色四档**必须仍与底栏同一个数**（他那句"与底栏同色"没被顶掉），
   而墨档必须**更浅**（这一条反向钉：谁把 .28 抬回 .62 谁红）。数本身由 ⑤b 那把按屏上的量去核。 */
const alphaOf = (s) => { const m = /,\s*([\d.]+)\s*\)$/.exec(String(s == null ? '' : s)); return m ? Number(m[1]) : -1 }
const slideSplit = palette.MOODS.map((m) => {
  const v = palette.moodVars(m.key)
  return { k: m.key, a: alphaOf(v['--glass-chrome-slide']), d: alphaOf(v['--glass-chrome-dock']) }
})
ok('②e 条的面只在墨档与底栏分叉：彩色四档 α 与 `--glass-chrome-dock` 同一枚，墨档那一枚更浅（按比例降下来的那半截）',
  slideSplit.filter((x) => x.k !== 'ink').every((x) => x.a === x.d)
  && slideSplit.filter((x) => x.k === 'ink').every((x) => x.a < x.d && x.a === 0.28),
  slideSplit.map((x) => `${x.k} 条 ${x.a}／底栏 ${x.d}`).join('　'))
ok('③ 两态不分叉：`.container.has-bg` 那一队里不再有 `.field`／`.sld`／`.sld-done`（有＝基条白写，10-16 栽过两次）',
  !/\.container\.has-bg[^{]*\.(field|sld)\b/.test(wxss),
  (wxss.match(/\.container\.has-bg[^{]*\.(?:field|sld)\b[^{]*/g) || []).slice(0, 2).join(' ｜ ') || '一条没有')
ok('③b 完成那一帧不必再抬权重：`.sld-done`（0-1-0）面是那支橙、那一圈同样不刷色，且这一页没有压它的第二层',
  /background:\s*var\(--cp-extract\)(?![\w-])/.test(seg('.sld-done'))
  && /border-color:\s*transparent/.test(seg('.sld-done'))
  && !/--well\b/.test(wxss),
  seg('.sld-done').replace(/\s+/g, ' ') || '没这一条')
ok('④ 极性跟着面翻：白框上四处全是墨族（正文／占位／✕／粘贴图形），条上那三档吃 `--slide-ink` 那一族（跟着面翻、不钉死墨也不钉死纸白）',
  /color:\s*var\(--cp-ink\)(?![\w-])/.test(seg('.field'))
  && /color:\s*var\(--cp-ink\)(?![\w-])/.test(seg('.field-input'))
  && /color:\s*var\(--face-ph\)/.test(seg('.field-ph')) && /color:\s*var\(--cp-ink-62\)/.test(seg('.field-x'))
  && /background:\s*var\(--cp-ink-62\)/.test(seg('.paste-glyph'))
  && /color:\s*var\(--slide-ink\)(?![\w-])/.test(seg('.sld-txt'))
  && /color:\s*var\(--slide-ink-dim\)(?![\w-])/.test(seg('.sld-off .sld-txt'))
  && /color:\s*var\(--slide-ink\)(?![\w-])/.test(seg('.sld-busy .sld-txt'))
  && !/color:\s*var\(--cp-ink\)(?![\w-])/.test(seg('.sld-txt')))
// ⑤ 混成实心再算（alpha 不落地就是假数——§6.1 那条规矩，也是 10-16 那条"PIL 画布丢 alpha"的同一条）。
//    框：`--cp-card` 实心白，没有第二层可说；条：底怎么取写在下面那一段（10-16 换过一次口径）。
const RGBA = (s) => {
  const hex = /^\s*#([\da-f]{2})([\da-f]{2})([\da-f]{2})\s*$/i.exec(s)
  if (hex) return [1, 2, 3].map((i) => parseInt(hex[i], 16)).concat(1)
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(s)
  return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null
}
// 把一枚可能带 alpha 的色混到 base（三元组）上，回 hex。
const solid = (color, base) => {
  const c = RGBA(color)
  if (!c) return ''
  const ch = (i) => Math.round(c[i] * c[3] + base[i] * (1 - c[3]))
  return `#${[0, 1, 2].map((i) => ch(i).toString(16).padStart(2, '0')).join('')}`
}
const inkStr = (/--cp-ink:([^;]+)/.exec(skin) || [, '#23252C'])[1].trim()
const phStr = (/--cp-ink-38:([^;]+)/.exec(skin) || [, ''])[1].trim()
const cardStr = (/--cp-card:([^;]+)/.exec(skin) || [, '#FFFFFF'])[1].trim()
const CARD = RGBA(cardStr)
const inkHex = solid(inkStr, CARD)
const phHexOnCard = solid(phStr, CARD)
const cr = (fg, bg) => palette.crOf(fg, bg)
// 条上那一档：10-16 18:3x 之后面**不再等于底栏那一枚**，底也不再取心情玻璃满色。
/* 面按 `rgba(这一档的玻璃, --glass-chrome-slide 的 α)` 混在**白卡**上算：`.sld` 住在 `.field` 那张白卡里，
   10-16 19:2x 屏上反推出来的底就是 237 那一档白（`docs/工具/量-五档右滑深浅.js` 那一趟）。
   字取 `--slide-ink`——色板现算那两支候选（玻璃本色／这一档的字色）里压得住这张面的那一支。
   ⚠ 换底必须跟着"墨档翻深字"一起换：老口径拿心情玻璃满色当底（**最深**那一底），那是替纸白字找最坏情况；
   墨档现在用深字，最坏情况恰恰是**最浅**那张面。拿旧底算新字＝一条永远绿的假尺子。
   ⚠ 这一条只覆盖"没铺背景照片"那一态（＝他现在屏上那一态）。铺了照片那一态条底下是近实心暗面板，
   墨档那条会跟着变深、字仍是深字 ⇒ 那一态读不动；已记待拍 D36 等他拍甲/乙，没拍之前不塞进门槛。 */
const slideReadings = palette.MOODS.map((m) => {
  const v = palette.moodVars(m.key)
  const face = solid(v['--glass-chrome-slide'], CARD)
  const ink = v['--slide-ink']
  return { k: m.key, face, ink, inkCr: cr(ink, face), dimCr: cr(solid(v['--slide-ink-dim'], face), face) }
})
const slideWorst = slideReadings.slice().sort((a, b) => a.inkCr - b.inkCr)[0]
/* ⚠ 这一条只钉正文那一档（≥4.5 是 AA 对正文的线，也是 §6.1 那两枚橙用的同一条）。
   占位那一枚（`--cp-ink-38`＝现网旧档，不是这一轮改出来的）**只报数不钉门槛**：
   3.0 那道线是我 10-16 自己加的，站长没拍过——按"不许自加门槛"那条，撤掉判据、把读数留在后面。 */
ok('⑤ 白框上那句正文压得起纯白（≥4.5，混成实心之后算）；占位那一档只报读数（现网旧档，门槛我没拍过）',
  cr(inkHex, cardStr) >= 4.5,
  `正文 ${inkHex} 压白 ${cr(inkHex, cardStr).toFixed(2)}｜占位 ${phStr.trim()} 混成 ${phHexOnCard} `
  + `${cr(phHexOnCard, cardStr).toFixed(2)}（这一档现网一直如此，要抬得他一句）`)
ok('⑤b 条上那句字压在自己那一档的面上（混成实心后算）五档全 ≥4.5；空着那一档退一层 ≥3',
  slideWorst.inkCr >= 4.5 && Math.min(...slideReadings.map((x) => x.dimCr)) >= 3,
  slideReadings.map((x) => `${x.k} ${x.inkCr.toFixed(2)}/${x.dimCr.toFixed(2)}`).join('　')
  + `｜最差 ${slideWorst.k} 面 ${slideWorst.face} 字 ${slideWorst.ink}`)
/* ---------- 10-16 搬家带出来的三条 ----------
   ① 皮吃的五枚别名必须定义在 `.container` 上：它们原来写在 `.panel` 里面，而这一行在 `.panel`
      **外面**——别名留在面板里，`var(--face)` 解析不到值，轨道当场画成透明（同一类坑的正本记在
      `验-第一屏三块.js` 钉的那条 `--cp-*` 上，那条说的是"发在 `.panel` 上首屏拿不到"）。
   ② 那一行里的两行字必须吃 `inherit`：`.out` 那一支 @70 才是这一行的皮，深浅翻转由
      `.container.has-bg(.bg-light-out) .out` 那两条接手；开关原来吃的是白卡里的满浓度墨
      （`--face-ink`），搬到形象图上就成了"深图看不见字"。
   ③ 热区用 padding 垫、不撑行高：轨道只有 40rpx，压在 44rpx 的行里上下各剩 2rpx；垫上下各 10rpx
      ⇒ 可点 64rpx，而 `.out` 那 44rpx 与站长拍过的两档面板高一个数没动。 */
const containerSeg = seg('.container')
ok('五枚别名抬到了 `.container`（`.panel` 里不再留一份，否则框外那一行读不到＝轨道透明）',
  ['--face', '--face-ink', '--face-ph', '--solid-bg', '--solid-ink']
    .every((k) => new RegExp(`\\${k}:\\s*var\\(--cp-`).test(containerSeg))
  && !/--face:/.test(seg('.panel')),
  `.container 里 ${(containerSeg.match(/--(face|face-ink|face-ph|solid-bg|solid-ink):/g) || []).length} 枚／.panel 里 ${(seg('.panel').match(/--face:/g) || []).length} 枚`)
ok('那一行里的标签与注释吃 inherit（跟着 `.out` 那支 @70 与深浅翻转），不写死卡里那套墨',
  /color:\s*inherit/.test(seg('.out .wr-sw-lab')) && /color:\s*inherit/.test(seg('.out .wr-sw-hint'))
  && !/color:\s*var\(--face-ink\)/.test(seg('.out .wr-sw-lab')))
ok('热区靠 padding 垫、行高不动（`.out` 仍 44rpx；10-17 药丸从 40 收到 30，padding 从 10 抬到 15 ⇒ 可点区仍是 60 那一档）',
  num(seg('.out'), 'height') === 44 && /padding:\s*15rpx 0/.test(seg('.out .wr-sw'))
  && num(seg('.wr-sw-track'), 'height') + 30 === 60
  && /height:\s*auto/.test(seg('.out .wr-sw')) && /margin-top:\s*0/.test(seg('.out .wr-sw')))
// ---------- 8. 上一代那些能力没被这批碰坏 ----------
ok('忙态仍然挡住收起', /collapse\(\)\s*\{\s*if \(this\.data\.busy/.test(js))
const showBody = js.split('async onShow')[1].split('hintFor(value)')[0]
ok('onShow 仍然不重置草稿', !/previewImages: \[\]/.test(showBody) && !/active: ''/.test(showBody))
ok('选完图返回仍然重算那三位（ready / 满 / 展开）',
  /this\._sync\(\)/.test(js) && /_sync\(\)\s*\{[\s\S]{0,600}panelOpen:/.test(js))
ok('链接校验那条正则没被顺手改松', js.includes('const LINK_RE = /^https?:\\/'))
// Tips 那一行仍然**只在收起态**渲染。原来它住在整组最上面那一整行（`.tips`）；
// 2.2 B 方案把它搬进右列那一格（`.blk-tips`），闸还是同一套：组外壳 `wx:if="{{!active}}"` 把，
// 自己只留 `tips.length`。所以这一条钉的是"落在组里、且排在展开态之前"——
// 光查那两个 wx:if 字面量会漏掉"搬出去了但闸没跟上"这一型（那样展开时提示会浮在面板上）。
ok('Tips 那一格仍然只在收起态渲染（闸在组外壳上，本人在组内）',
  /<view wx:if="\{\{tips\.length\}\}" class="blk-tips">/.test(wxml)
  && wxml.indexOf('class="home-blk"') < wxml.indexOf('class="blk-tips"')
  && wxml.indexOf('class="blk-tips"') < wxml.indexOf('class="entry-wrap"'),
  `blk@${wxml.indexOf('class="home-blk"')} tips@${wxml.indexOf('class="blk-tips"')} wrap@${wxml.indexOf('class="entry-wrap"')}`)
// 旧的那一整行载体（`.tips`／`.tips-line`）不许与新的那一格并存——两版并存是这类搬家最容易漏的。
ok('旧 Tips 那一行的载体一处不留（`.tips ` 与 `.tips-line` 都不能再出现在模板或样式表里）',
  !/class="tips"/.test(wxml) && !/class="tips-line"/.test(wxml) && !/\.tips\s*\{|\.tips-line\s*\{/.test(wxss))
ok('Tips 六句中英各一份、句数相等', Array.isArray(zh.tips) && Array.isArray(en.tips)
  && zh.tips.length === 6 && en.tips.length === zh.tips.length)
ok('一句停 8 秒', /\}, 8000\)/.test(js) && !/\}, 4000\)/.test(js))
ok('图片备份那条 B 链仍与建笔记那条并行、不 await',
  /const backup = this\._backupShots\(batch\)/.test(js) && !/await this\._backupShots/.test(js))
ok('失败时那批孤儿对象仍然删（_settleBackup(null, …)）', /this\._settleBackup\(null, backup\)/.test(js))

/* ---------- 注释被自己写的"闭合符"提前关掉（10-16 真跑整批红过一次，根因在这） ----------
   10-16 那一趟不是判据红，是**模拟器整页起不来**：pageStack 空、currentPage() 报
   getPageMetaByWebviewId(...) is null，IDE 后台日志只有一句「编译 .wxss 文件错误」不给行号。
   根因是 .field 上面那段说明里，我在中间写了一次注释闭合符（星杠连写），
   注释到那儿就关掉了，后面三行中文正文直接落进样式表 ⇒ 微信的 WXSS 编译器整文件拒绝 ⇒ 全站没有页面。
   ⚠ 静态尺子原来查不出来：它按"非贪婪"剥注释，与编译器同一口径，剥完剩下的正文它不读、也不钉。
   这一条按编译器的口径重剥一遍，凡是剥完还剩"行首是中文"的，就是同一颗雷（不限这一页——
   哪一个 wxss 踩了都是全站起不来，所以扫全仓）。⚠ 这一段注释里不许再出现那对连写的符号，
   否则这条判据的说明自己就是那颗雷（写这条的当场就踩了一次）。 */
const stripComments = (src) => {
  let out = '', i = 0
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; continue }
    out += src[i]; i += 1
  }
  return out
}
const walkWxss = (d, acc = []) => {
  fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walkWxss(p, acc); else if (p.endsWith('.wxss')) acc.push(p)
  })
  return acc
}
const dangling = []
walkWxss(P('')).forEach((f) => {
  stripComments(fs.readFileSync(f, 'utf8')).split('\n').forEach((line, n) => {
    if (/^\s*[^\x00-\x7F]/.test(line) && !/^\s*[^\x00-\x7F]*\{\s*$/.test(line)) {
      dangling.push(`${path.relative(ROOT, f)}:${n + 1} 「${line.trim().slice(0, 24)}」`)
    }
  })
})
ok('全仓 wxss 里没有"注释被提前关掉后裸露的中文正文"（这一条红了＝模拟器起不来，不是某条判据红）',
  dangling.length === 0, dangling.slice(0, 4).join('；'))

/* 同一级红，另一颗雷：**wxml 标签配不上对**。10-16 夜里就踩了一次——把一枚 `<image>` 换成
   `<text>` 时，替换段里连 `.title-row` 那个闭合 `</view>` 一起写进去，而原文那一个还在 ⇒ 多一个闭合标签。
   后果与上面那颗一模一样、而且更难查：`cli preview` 只回一句
   「335:3:unexpected end tag: view」，`cli auto` 却照旧报 ✔，automator 连上之后
   `getCurrentPages()` 是空数组、`currentPage()` 抛
   「Cannot destructure property 'rawPath' of ... is null」——看着像"IDE 起不来/端口连错工作树"，
   其实是整包没编译过。所以这一条自己扫，别等真跑那一趟两分钟才红。
   口径：先按编译器的读法剥掉 `<!-- -->`，再拿一个栈过一遍标签；自闭合（结尾带斜杠）不入栈。
   ⚠ 这一把只钉"配对"，不判语义（嵌套顺序错了、类名点空它都不管，那些归各自那把尺子）。 */
const walkWxml = (d, acc = []) => {
  fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walkWxml(p, acc); else if (p.endsWith('.wxml')) acc.push(p)
  })
  return acc
}
const stripWxmlComments = (src) => src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
const unbalanced = []
walkWxml(P('')).forEach((f) => {
  const src = stripWxmlComments(fs.readFileSync(f, 'utf8'))
  const stack = []
  const re = /<(\/)?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'"<>])*?)(\/)?>/g
  let m
  while ((m = re.exec(src))) {
    const [, closing, name, attrs, selfClose] = m
    const line = src.slice(0, m.index).split('\n').length
    if (selfClose) continue
    if (closing) {
      if (!stack.length || stack[stack.length - 1].name !== name) {
        unbalanced.push(`${path.relative(ROOT, f)}:${line} 多/错一个 </${name}>`
          + `（栈顶是 ${stack.length ? `<${stack[stack.length - 1].name}>@${stack[stack.length - 1].line}` : '空'}）`)
        if (!stack.length) return
        stack.pop()
      } else stack.pop()
    } else stack.push({ name, line })
  }
  stack.forEach((s) => unbalanced.push(`${path.relative(ROOT, f)}:${s.line} <${s.name}> 没有闭合`))
})
ok('全仓 wxml 标签配对（这一条红了＝整包不编译、模拟器没有页面，不是某条判据红）',
  unbalanced.length === 0, unbalanced.slice(0, 4).join('；'))

// 这两叠高度是 §2 那两行算式的读数：改了字号/间距/控件之后它们会变，规格文档引的就是这两个数。
// 10-16 站长那句「把原文翻译的开关上移到与返回同一行左边」之后，**展开那一档的卡里只剩两样**
//（原来这三样：两行框 160 ＋ 开关 48＋8 ＋ 条 110＝326，卡内可用 348、富余 22）。
// 开关搬到卡外那一行 ⇒ 卡里少 56rpx，富余从 22 涨到 78；面板两档高度他拍过 372/490，那一截留白**没收**。
const writeOpenStack = num(seg('.field-write-2'), 'height') + sldH
console.log(`${fails.length ? '✗' : '✓'} 统一录入条：${pass}/${pass + fails.length} 条通过`
  + `　面板 ${PANEL_H}/${PANEL_OPEN_H}rpx、卡内 ${cardInnerW}×${cardInnerH.toFixed(1)}（展开 ${openCardInnerH.toFixed(1)}）rpx`
  + `　最占的一叠：照片圈 ${crowH.toFixed(1)}/${cardInnerH.toFixed(1)}、文字展开 ${writeOpenStack}/${openCardInnerH.toFixed(1)}`
  + `　一行 ${cols} 格、行程到 ${SLD_MAX}rpx`
  + (HINT_W.zh ? `　开关那一行宽：zh ${HINT_W.zh}／en ${HINT_W.en}rpx` : ''))
fails.forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
