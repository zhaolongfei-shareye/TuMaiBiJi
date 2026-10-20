// 站长 10-20 那两句「优化」的静态尺子（两件一起）。
// 跑法：node docs/工具/验-拖动切换与滑篇.js
//
// ①「生成笔记时候，切换模板，支持手指在几个小点上面拖动切换（支持循环，滚动最后一个，
//    再切到第一个，不要卡死），否则用户不知道怎么切换。然后上方模板的名字，点击也支持切换。」
// ②「笔记详情页，要支持手指在页面大标题左右滑动，切换前后笔记。左上角，加提示词"左右滑动看下一篇"」
// ③（同一轮夜里改的口）「左右滑动的笔记详情页，是指带毛玻璃背景的那个界面，不是全屏那个」
//    ⇒ ② 那一版我落到了 `pages/detail`（全屏那一页），③ 把它搬进列表页那扇**详情窗**：
//      手势从 `.hero-title` 搬到 `.ds-h2`，提示语从页面里那枚 `.dt-nav-hint` 搬到窗顶 `.grip`
//      那一行的左端，邻居从"另起一份 noteOrder 序列"搬回 `_openDetail` 现算的上一行／下一行。
//      下面 ⑤⑥ 两节钉的就是搬过来之后的那一套；末尾还钉了一条"全屏那页不许再吃这一刀"。
// ④（同一扇窗上再追的一句）「滑动遇到私密，自动跳过」
//    ⇒ 邻居不再是"紧挨着的那一行"，是左右**最近的一行不私密的**（`_dsNeighbour`）。
//      这一条只改滑的落点：点行进去那一趟照旧直接开、照旧问密码。
//
// 这一把盯的是**这一刀新长出来的那三条把手**（圆点拖动／名字点击／窗里大标题滑），
// 加上"不许卡死"那半句的两条硬条件（取模循环、改选与画布解耦）。
// 卡片那一屏原有的判据（圆点只在未生成态画、名字常驻不报 toast、_lastTplId 那一条）
// 仍在 `验-详情窗配图与出图那一趟.js` 里，那把也随这一刀改了锚（换模板那一趟现在住三段）。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const rd = (f) => fs.readFileSync(P(f), 'utf8')
const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  .replace(/<!--[\s\S]*?-->/g, '')

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— 实得：' + extra : ''))
}
function ck(name, cond, extra) { ok(name, cond, extra); console.log((cond ? '  ✓ ' : '  ✗ ') + name + (cond || !extra ? '' : ' —— 实得：' + extra)) }

const IX_WXML = strip(rd('pages/index/index.wxml'))
const IX_WXSS = strip(rd('pages/index/index.wxss'))
const IX_JS = strip(rd('pages/index/index.js'))
// 全屏那一页只留着钉"这一刀没落在那儿"（③ 改口的直接后果），不再从它取任何实现判据。
const DT_WXML = strip(rd('pages/detail/detail.wxml'))
const ZH = require(P('utils/i18n.js')).texts('zh')
const EN = require(P('utils/i18n.js')).texts('en')

// 取一段方法体：从"带着形参列的定义行"起，到下一个两空格缩进的 `}` 为止。
// ⚠ 锚点不许只给方法名：那会锚到第一个调用点上（`this._advanceTemplate(dir)` 这种），
//   截出来的那一段里当然什么都没有——本仓这把尺子为这一型自坑过两次。
const seg = (src, head) => {
  const i = src.indexOf(head)
  if (i < 0) return ''
  const j = src.indexOf('\n  }', i)
  return j < 0 ? src.slice(i) : src.slice(i, j + 4)
}
const rule = (src, sel) => {
  const m = new RegExp('\\.' + sel + '\\s*\\{([^}]*)\\}').exec(src)
  return m ? m[1] : ''
}
const num = (src, sel, prop) => {
  const m = new RegExp('(^|;|\\s)' + prop + ':\\s*(-?\\d+(?:\\.\\d+)?)rpx').exec(rule(src, sel))
  return m ? parseFloat(m[2]) : NaN
}

const SP2 = parseInt(/--sp-2:\s*(\d+)rpx/.exec(rd('app.wxss'))[1], 10)
const DOT = num(IX_WXSS, 'tpl-dot', 'width')
const DOT_ON = num(IX_WXSS, 'tpl-dot-on', 'width')
const GAP = num(IX_WXSS, 'tpl-dots', 'gap')
const PAD = num(IX_WXSS, 'tpl-dots', 'padding')
const MARGIN = rule(IX_WXSS, 'tpl-dots').match(/margin:\s*([^;]+)/)

console.log(`  现读：点 ${DOT}rpx／当前那枚 ${DOT_ON}rpx／间隙 ${GAP}rpx／--sp-2 ${SP2}rpx／热区 padding ${PAD}rpx`)

/* ---------- ① 圆点那一排：拖得动 ---------- */
{
  const dotsTag = (/class="tpl-dots"[\s\S]*?>/.exec(IX_WXML) || [''])[0]
  const catches = (dotsTag.match(/catchtouch(start|move|end|cancel)="onTplDotsTouch/g) || []).length
  ck('① 圆点那一排吃满 start／move／end 三枚 catch（少了 move 就只是一枚会按的条，拖不动）',
    catches >= 3, `catch 共 ${catches} 枚：${dotsTag.replace(/\s+/g, ' ').slice(0, 150)}`)
  // 为什么必须 catch：这一排住在 `.tpl-body` 里，而 `.tpl-body` 自己挂着"滑过 60px 换一套"。
  ck('② 圆点那一排没有一处 bindtouch（用 bind 的话同一次拖动喂两条把手，一次跨两套）',
    !/bindtouch(start|move|end)="onTplDotsTouch/.test(IX_WXML)
    && /class="tpl-body" bindtouchstart="onPosterTouchStart"/.test(IX_WXML))

  const mv = seg(IX_JS, 'onTplDotsTouchMove(e) {')
  ck('③ 步距＝一枚圆点的间距（点宽＋间隙，从 wxss 现读，不是写死的数）',
    new RegExp('\\b' + (DOT + GAP) + '\\s*\\*').test(mv)
    && /getWindowInfo\(\)\.windowWidth \/ 750/.test(mv),
    `期望 ${DOT + GAP}rpx 那一个乘数出现在：${mv.replace(/\s+/g, ' ').slice(0, 160)}`)
  ck('④ 每跨一格就扣掉那一格的距离（留着零头，来回拖不会多跳、也不会攒着突然跳两格）',
    /this\._dotsLeft \+= dir \* step/.test(mv) && /while \(Math\.abs\(this\._dotsLeft\) >= step\)/.test(mv))
  ck('⑤ 步距算不出数（0／NaN）时当场不办事——那条 while 会转死循环',
    /if \(!\(step > 0\)\) return/.test(mv))
  ck('⑥ 起手先把零头清掉（上一次拖剩的那半格不许算进这一次）',
    /this\._dotsLeft = 0/.test(seg(IX_JS, 'onTplDotsTouchStart(e) {'))
    && /this\._dotsLeft = 0/.test(seg(IX_JS, 'onTplDotsTouchEnd() {')))
}

/* ---------- ② 循环与"不要卡死" ---------- */
{
  const adv = seg(IX_JS, '_advanceTemplate(delta) {')
  ck('⑦ 走到最后一套再往前回到第一套（两次取模，负数也走得通＝往回也能循环）',
    /%\s*n\)\s*\+\s*n\)\s*%\s*n/.test(adv) && /const n = list\.length/.test(adv), adv.slice(0, 120))
  ck('⑧ 旧那句"取到 undefined 就 return"不许回来（那就是他说的卡死）',
    !!adv && !/const next = list\[/.test(adv) && !/if \(!next\) return/.test(adv))
  ck('⑨ 只有一套模板时整条把手不办事（没有"下一套"可去，硬拖是假把手）',
    /if \(list\.length < 2\) return/.test(adv))
  // "不要卡死"的另一半：画一张要几百毫秒，原来每跨一步都 await 一次重画。
  const pick = seg(IX_JS, '_tplPick(id) {')
  const flush = seg(IX_JS, 'async _flushTplRender() {')
  ck('⑩ 改选与画布解耦：手指那一步只 setData，一趟 await 都不带（画在另一条上排队）',
    !!pick && !/await/.test(pick) && /this\._flushTplRender\(\)/.test(pick))
  ck('⑪ 画只画最新那一版：收尾时比对 _tplWanted，中间那些跳过（不排长队）',
    /while \(wanted !== this\._tplWanted\)/.test(flush) && /wanted = this\._tplWanted/.test(flush))
  ck('⑫ 画的过程中再拖不算丢：`_tplDrawing` 立着时新的一步由那一趟收尾补画',
    /if \(this\._tplDrawing\) return/.test(flush) && /this\._tplDrawing = false/.test(flush))
  ck('⑬ 同一枚模板被选中两次不重画（拖到边界上来回抖不该白画一张）',
    /if \(id === this\.data\.posterTpl\) return/.test(pick))
}

/* ---------- ③ 名字那一枚也是把手 ---------- */
{
  const nameTag = (/class="grip-tx grip-tx-c"[^>]*>/.exec(IX_WXML) || [''])[0]
  ck('⑭ 顶上那一句模板名点了换下一套，且用 catchtap 截住（不截住会连带触发 `.grip` 那点把手收窗）',
    /catchtap="onTplNameTap"/.test(nameTag), nameTag.replace(/\s+/g, ' '))
  ck('⑮ 名字那一枚走的是同一条取下一枚的路（`_advanceTemplate(1)`），不另写一套下标算术',
    /onTplNameTap\(\) \{[\s\S]*?this\._advanceTemplate\(1\)/.test(IX_JS))
}

/* ---------- ④ 热区抬高了，排布一个字没动 ---------- */
{
  // `_tplBoxRpx()` 给展示框预留的是「16 上间距 ＋ 16 当前那枚点」= 32rpx。
  // 热区靠 padding 撑开，必须用负 margin 抵回去，否则展示框缩一档、海报跟着变小。
  // `margin: calc(var(--sp-2) - 22rpx) 0 -22rpx` 是一枚三值简写，而 calc 里面**自带空格**，
  // 直接 split 会把一个值切成三段——所以先整段抠出 calc（它里面还套着一层括号，
  // `[^)]*\)` 会停在 `var(--sp-2)` 那个闭括号上），再按首尾取值。
  const mVal = MARGIN ? MARGIN[1].trim() : ''
  const calcOf = /^calc\((?:[^()]|\([^()]*\))*\)/.exec(mVal)
  const mTopRaw = mVal.indexOf('calc(') === 0 ? (calcOf ? calcOf[0] : '') : mVal.split(/\s+/)[0]
  const minus = mTopRaw.indexOf('calc(') === 0 ? /-\s*(\d+(?:\.\d+)?)rpx\s*\)?$/.exec(mTopRaw) : null
  const mTop = minus ? SP2 - parseFloat(minus[1]) : parseFloat(mTopRaw)
  const tail = mVal.slice(mTopRaw.length).match(/(-?\d+(?:\.\d+)?)rpx\s*$/)
  const mBottom = tail ? parseFloat(tail[1]) : NaN
  const flow = mTop + PAD + DOT_ON + PAD + mBottom
  ck('⑯ 圆点那一排的排布占位仍是「上间距 ＋ 当前那一枚点」＝' + (SP2 + DOT_ON) + 'rpx'
    + '（热区靠 padding 撑开、靠负 margin 抵回去，展示框不许跟着缩一档）',
    PAD > 0 && mVal !== '' && Math.abs(flow - (SP2 + DOT_ON)) < 0.5,
    `margin ${mVal} ＋ padding ${PAD} → 净占位 ${flow}rpx（应为 ${SP2 + DOT_ON}）`)
  ck('⑰ 点本身那一档尺寸没被这一刀改走（10／当前那枚 16，站长没让改就不改）',
    DOT === 10 && DOT_ON === 16, `实得 ${DOT}／${DOT_ON}`)
}

/* ---------- ⑤ 详情窗：大标题左右滑换前后篇（③ 把这一刀从全屏那页搬过来的） ---------- */
{
  const end = seg(IX_JS, 'onDsTitleTouchEnd(e) {')
  const open = seg(IX_JS, 'async _openDetail(idx) {')
  const titleTag = (/class="ds-h2"[^>]*>/.exec(IX_WXML) || [''])[0]
  ck('⑱ 手势挂在**窗里那枚大标题 `.ds-h2`** 上，start／end 两枚都在（挂在整窗会把正文上下滚与点配图开大图挡掉）',
    /bindtouchstart="onDsTitleTouchStart"/.test(titleTag) && /bindtouchend="onDsTitleTouchEnd"/.test(titleTag),
    titleTag.replace(/\s+/g, ' '))
  // 这一条和上一句是一对：挂错元素（整窗）会被 ⑱ 抓到，挂错**方式**（catch）抓不到。
  // `.ds-h2` 住在 `<scroll-view scroll-y>` 里面，catch 掉 touchstart／touchmove 等于把这扇窗的正文滚动作废。
  ck('⑲ 挂的是 bind 不是 catch（catch 掉的话窗里正文再也滚不动），且遮罩那一层没吃横向手势',
    !/catchtouch(start|end)="onDsTitleTouch/.test(IX_WXML)
    && !/class="float-mask"[^>]*touch/.test(IX_WXML) && !/class="float-sheet"[^>]*touch/.test(IX_WXML))
  ck('⑳ 阈值与卡片那一屏"左右滑换模板"同一个数 60（两处同一把手感，不另起一档）',
    /Math\.abs\(dx\) < 60/.test(end) && /Math\.abs\(dx\) < 60/.test(seg(IX_JS, 'onPosterTouchEnd(e) {')))
  ck('㉑ 往左滑＝下一篇、往右滑＝上一篇（与卡片那一屏 dx<0→+1 同方向）',
    /dx < 0 \? this\.data\.dsNext : this\.data\.dsPrev/.test(end), end.replace(/\s+/g, ' ').slice(0, 160))
  ck('㉒ 换一篇走这一屏自己那条 `_openDetail(号)`：不碰页面栈（这扇窗本来就住在列表页里）',
    /this\._openDetail\(at\)/.test(end) && !/navigateTo|redirectTo/.test(end))
  /* 邻居是**每次开窗现算**的，而且存 id 不存行号。这两格都是这扇窗特有的坑：
     窗浮着的那一会儿人可能切到底栏另一格再回来，onShow 那趟重拉整表、序也变——
     拿着上一趟的行号滑就滑到别的篇上去了（同型账见 onRowTap 里"验的是 A、开的是 B"那一段）。 */
  ck('㉓ 邻居每次开窗现算，且交出去的是 id 不是行号（序一漂就滑到别的篇上）',
    /const prev = this\._dsNeighbour\(idx, -1\)/.test(open) && /const next = this\._dsNeighbour\(idx, 1\)/.test(open)
    && /dsPrev: prev \? prev\.id : null/.test(open) && /dsNext: next \? next\.id : null/.test(open))
  /* 「滑动遇到私密，自动跳过」（他夜里追的那一句）落成一条口：邻居＝左右**最近的一行不私密的**，
     不是紧挨着的那一行。为什么写在取邻居这一条里而不是写在手势里：手势只该问"下一格是谁"，
     "谁该被跳过"有第二处说了算，两处迟早对不上。
     ⚠ 判据认的是列表那一行本机现算的 `is_private`（按分类名算，列表响应里没这一栏）——
     分类表没拉到的当口它一律判成"不私密"，那一格就还是可能被滑到；那时兜底的是 `_openDetail`
     里那道以服务端详情为准的闸（见 ㉗），不是这一条。 */
  const nb = seg(IX_JS, '_dsNeighbour(from, dir) {')
  ck('㉓′ 跳过落在"取邻居"这一条上：往那一边走到第一行不私密的才交出去，走到头回 null',
    /for \(let i = from \+ dir; i >= 0 && i < list\.length; i \+= dir\)/.test(nb)
    && /if \(!list\[i\]\.is_private\) return list\[i\]/.test(nb) && /return null/.test(nb),
    nb.replace(/\s+/g, ' ').slice(0, 160))
  ck('㉓″ 全仓只有开窗那一条在取邻居（点行进去那一趟不许也走它——想看的还是想看，照样问密码）',
    (IX_JS.match(/this\._dsNeighbour\(/g) || []).length === 2
    && (open.match(/this\._dsNeighbour\(/g) || []).length === 2 && !/_dsNeighbour/.test(end),
    `整页 ${IX_JS.match(/this\._dsNeighbour\(/g) ? IX_JS.match(/this\._dsNeighbour\(/g).length : 0} 处调用／开窗那一条里 ${(open.match(/this\._dsNeighbour\(/g) || []).length} 处`)
  ck('㉗ 服务端为准那道密码闸还在 `_openDetail` 里（撤的不是闸，是"滑过去会撞上它"这一条路）',
    /needsUnlock\(gate\)/.test(open) && /await unlockOn\(this, gate\)/.test(open))
  ck('㉔ 滑之前先按 id 找回当前那一行的号；找不着（换过序）当场不办事',
    /\.findIndex\(\(n\) => n\.id === id\)/.test(end) && /if \(at < 0\) return/.test(end))
  ck('㉕ 到头就停：那一头是 null 时不办事（模板那一排他拍了循环，这一条没拍，我不自己扩）',
    /if \(id === null \|\| id === undefined\) return/.test(end))
  ck('㉖ 滑过去之后上一排的配图与那一点位置一起清掉（滑十篇不许攒十排图，也不许张冠李戴）',
    /detailImages: \[\], dsFigAt: 0/.test(open))
  ck('㉗ 私密那一道闸还在同一条路上：滑过去照样先问密码（闸挂在 _openDetail 里，不在手势里另起一套）',
    /needsUnlock\(gate\)/.test(open) && /await unlockOn\(this, gate\)/.test(open))

  /* ---------- ⑥ 左上角那一句提示 ---------- */
  const hint = (/grip-tx grip-tx-l" wx:if="\{\{dsHasNav\}\}">\{\{t\.noteSwipeHint\}\}<\/text>/.exec(IX_WXML) || [''])[0]
  ck('㉘ 中文那一句逐字＝他给的「左右滑动看下一篇」（提示语不许我改口径）',
    ZH.noteSwipeHint === '左右滑动看下一篇', JSON.stringify(ZH.noteSwipeHint))
  ck('㉙ 中英两份都有这一格（这一屏吃界面语言，缺 en 会在英文态念汉字）',
    typeof EN.noteSwipeHint === 'string' && EN.noteSwipeHint.length > 0, JSON.stringify(EN.noteSwipeHint))
  ck('㉚ 只在真有一前一后时画（只剩这一篇还写着"左右滑动看下一篇"＝一句假话）',
    hint !== '' && /dsHasNav: !!\(prev \|\| next\)/.test(open), hint.replace(/\s+/g, ' ') || '(窗里那枚没读到)')
  /* 这一枚类是两屏共用的：卡片那一屏左端那句「左右滑换模板」先住 `.grip-tx-l`，
     这一句按他"左上角"那一拍挂到同一档上。同一枚类两屏同一落点；两份皮迟早错位。 */
  ck('㉛ 落点吃现成那枚 `.grip-tx-l`（与卡片那一屏左端那句同一行、同一左沿，不另写一份皮）',
    /\.grip-tx-l\s*\{[^}]*left:\s*34rpx/.test(IX_WXSS)
    && (IX_WXML.match(/grip-tx-l/g) || []).length === 2,
    `屏上两枚共用：${(IX_WXML.match(/grip-tx-l/g) || []).length} 处`)
  ck('㉜ 两枚各自的条件没并成一枚（窗那一句看有没有邻居，卡片那一句看有没有出过图）',
    /grip-tx-l" wx:if="\{\{dsHasNav\}\}"/.test(IX_WXML) && /grip-tx-l" wx:if="\{\{!posterHasCard\}\}"/.test(IX_WXML))
  /* ③ 那句「是指带毛玻璃背景的那个界面，不是全屏那个」的反面：全屏那一页上不许留着第二套把手。
     留着不是"多一处能用"，是同一件事在两屏各长一份、其中一份没有判据盯着。 */
  ck('㉝ 全屏那一页（pages/detail）没有第二套：那一枚大标题上不许有 touch，也不许留那句提示',
    !/class="hero-title"[^>]*touch/.test(DT_WXML) && !/noteSwipeHint|dt-nav-hint/.test(DT_WXML),
    (/class="hero-title"[^>]*>/.exec(DT_WXML) || ['(读不到)'])[0].replace(/\s+/g, ' '))
}

/* ---------- 10-20 ⑰：卡片那一屏左端那句英文，压到放得进那一行 ----------
   站长「英文版，左上角与中间重叠了，你要压缩左侧英文」。那一行是**三枚绝对定位的字挤在一条 56rpx 的带子里**
   （左端那句／中间那枚模板名限宽加省略号／右端「点一下收起」），谁也不给谁让位、挤不下不折行 ⇒ 直接压在一起。
   中间那枚的**盒子恒等于限宽那 340rpx**（`left:0; right:0; max-width; margin:0 auto` 那一条拉满再夹回来，
   真跑那一节量回来 11 套全是 340），墨迹在盒子正中 ⇒ 名字墨迹每宽 1rpx，左端的位子就少 0.5rpx。
   所以最坏那一档不是名字最短，是**名字最长**（最长那套把墨迹撑到最左）。
   下面每个数都从 wxss 现读（行宽＝750−窗左右内缩×2，缝＝`.grip-tx-l` 的 left，限宽＝`.grip-tx-c` 的 max-width，
   字与字距＝`.grip-tx`）⇒ 以后换字号、换内缩、换限宽都不用改这条算式。
   ⚠ 这一条是**粗筛**：折算 CJK 1em／其余 0.5em（与本仓 `验-统一录入条.js` 同一把尺，两头同折算），
     比屏上真渲染窄约一成（10-20 ⑯ 量过：`Swipe to switch` 折算 164rpx、盒子上屏 181.5rpx）。
     屏上那三个矩形的缝由真跑那把逐套量（`验-拖动切换与滑篇-真跑.js` ⑰ 那一节，拿 measureText 定标的墨迹）。
   ⚠ 硬边界留在这儿：将来哪套名字长到被 340 夹住（现在最长 207），预算就掉到 (702−340)/2−34−12＝**135rpx**，
     连这一句也放不进——那一档要么抬限宽、要么撤左端那句，等他一句，我今天不自作主张动。
   ⚠ 12rpx 那条缝是我自定的下限，他没说数。 */
{
  // 那一档字是令牌（`--fs-tiny`），不是写死的 rpx ⇒ 先读令牌再折算；将来写成 rpx 也照样吃得下。
  const APP_WXSS = strip(rd('app.wxss'))
  const propOf = (src, sel, prop) => {
    const v = new RegExp('(^|;|\\s)' + prop + ':\\s*([^;]*)').exec(rule(src, sel))
    if (!v) return NaN
    const varM = /var\(--([a-z0-9_-]+)\)/.exec(v[2])
    if (!varM) return parseFloat(v[2])
    const t = new RegExp('--' + varM[1] + ':\\s*(-?\\d+(?:\\.\\d+)?)rpx').exec(APP_WXSS)
    return t ? parseFloat(t[1]) : NaN
  }
  const rowW = 750 - 2 * num(IX_WXSS, 'float-sheet', 'left')
  const inset = num(IX_WXSS, 'grip-tx-l', 'left')
  const cap = num(IX_WXSS, 'grip-tx-c', 'max-width')
  const tiny = propOf(IX_WXSS, 'grip-tx', 'font-size')
  const ls = num(IX_WXSS, 'grip-tx', 'letter-spacing')
  const wOf = (s) => {
    const cjk = (s.match(/[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/g) || []).length
    return cjk * tiny + (s.length - cjk) * tiny * 0.5 + s.length * ls
  }
  // 包内那套模板表只是**最坏一档的候选**：下发要是把名字改长，这一档会变松，
  // 屏上真实那一档由真跑那把量（它读的是页面上那一排下发的名字）。
  // ⚠ 从源码正则取，不 require：`poster.js` 一被引就带出 `mpAssets.js` 的 `wx.getFileSystemManager()`，
  //   Node 里没有 `wx`（本仓 `验-中英文缺口.js` 取这张表走的是同一条路）。
  const tplSrc = rd('utils/poster.js')
  const names = (tplSrc.match(/label: '[^']*', labelEn: '[^']*', group: '[^']*'/g) || [])
    .map((m) => { const g = /label: '([^']*)', labelEn: '([^']*)'/.exec(m); return `< ${g[2] || g[1]} >` })
  ck('㉞′ 这张表真读到了（读空了下面两条会变假绿，所以先钉枚数；带 `group:` 才算一套模板，分组名不算）',
    names.length === 10, `${names.length} 套：${names.join(' ')}`)
  // 读空了这一档退回最短那枚 ⇒ 预算会变松、㉞ 会变假绿，所以假绿那条路由 ㉞′ 那条枚数拦着，
  // 这里只管别再让整把尺子崩在 `undefined.match` 上。
  const worst = names.length ? names.reduce((a, b) => (wOf(b) > wOf(a) ? b : a), names[0]) : '< >'
  const centreW = Math.min(wOf(worst), cap)
  const budget = (rowW - centreW) / 2 - inset - 12
  const enW = wOf(EN.swipeHint)
  const note = `那句折 ${Math.round(enW)} ≤ 预算 ${Math.round(budget)}｜行 ${rowW}／左内缩 ${inset}／中间限宽 ${cap}／字 ${tiny}＋字距 ${ls}／最坏名字「${worst}」撑到 ${Math.round(centreW)}`
  ck('㉞ 左端那句英文放得进最坏那一档（名字最长那套把中间那枚撑到最左）',
    [rowW, inset, cap, tiny, ls, enW, budget].every(Number.isFinite) && enW <= budget, note)
  ck('㉟ 中文那一格仍是他 10-19 的原话「左右滑换模板」——这一刀只动英文那一门',
    ZH.swipeHint === '左右滑换模板', JSON.stringify(ZH.swipeHint))
  // 反向自证：把那句换回他截图上那一版，同一条算式必须红；不红就是 ㉞ 没牙。
  ck('㊱ 反向：旧那句 `Swipe to change template` 用同一式子算就是超的（㉞ 真的有牙）',
    wOf('Swipe to change template') > budget,
    `旧那句折 ${Math.round(wOf('Swipe to change template'))}／预算 ${Math.round(budget)}`)
}

/* ---------- ⑦ 反向自证：这几条真的抓得到回退 ---------- */
{
  // 反向钉"卡死"回来：把取模换回旧那句 `list[cur + delta]`。
  const noWrap = IX_JS.replace(
    'const at = ((((cur < 0 ? 0 : cur) + delta) % n) + n) % n\n    this._tplPick(list[at].id)',
    'const next = list[(cur < 0 ? 0 : cur) + delta]\n    if (!next) return\n    this._tplPick(next.id)')
  const advBack = seg(noWrap, '_advanceTemplate(delta) {')
  ck('反向①：把"走到头就 return"那一句换回来，⑦⑧ 两条必须红',
    noWrap !== IX_JS && !/%\s*n\)\s*\+\s*n\)\s*%\s*n/.test(advBack) && /const next = list\[/.test(advBack))
  // 反向钉窗里那一滑：把去向换成别的东西（不再是开这一扇窗），㉒ 那条的判据必须读不到。
  const goBack = seg(IX_JS, 'onDsTitleTouchEnd(e) {').replace('this._openDetail(at)', 'wx.previewImage({ urls: [] })')
  ck('反向②：把窗里那一滑的去向改掉（不再走 _openDetail），㉒ 那条必须红',
    goBack !== seg(IX_JS, 'onDsTitleTouchEnd(e) {') && !/this\._openDetail\(at\)/.test(goBack))
  // 反向钉那一句提示的闸：把 dsHasNav 写成恒真，㉚ 那条必须红（否则"只剩一篇"也在喊左右滑）。
  const alwaysNav = seg(IX_JS, 'async _openDetail(idx) {').replace('dsHasNav: !!(prev || next)', 'dsHasNav: true')
  ck('反向③：把"有没有邻居"写成恒真（只剩一篇也喊左右滑），㉚ 那条必须红',
    alwaysNav !== seg(IX_JS, 'async _openDetail(idx) {') && !/dsHasNav: !!\(prev \|\| next\)/.test(alwaysNav))
  // 反向钉"跳过私密"那一句：把它换成"走到第一行就交"，落点又变回紧挨着的那一行。
  const nbSrc = seg(IX_JS, '_dsNeighbour(from, dir) {')
  const noSkip = nbSrc.replace('if (!list[i].is_private) return list[i]', 'return list[i]')
  ck('反向④：把"跳过私密那一行"那一句拿掉（滑一下就撞进私密那一格、弹密码），㉓′ 那条必须红',
    noSkip !== nbSrc && !/if \(!list\[i\]\.is_private\) return list\[i\]/.test(noSkip))
  // 反向钉 bind→catch 那一格：把圆点那排改成 bind，同一次拖动会同时喂两条把手。
  const toBind = IX_WXML.replace('catchtouchstart="onTplDotsTouchStart"', 'bindtouchstart="onTplDotsTouchStart"')
  ck('反向⑤：把圆点那一排的一枚 catch 换成 bind（一次拖动跨两套），② 那条必须红',
    toBind !== IX_WXML && /bindtouchstart="onTplDotsTouchStart"/.test(toBind))
}

console.log(`\n验-拖动切换与滑篇：${pass} 过${fails.length ? `　✗ ${fails.length} 条：\n  ` + fails.join('\n  ') : '　全绿'}`)
process.exit(fails.length ? 1 : 0)
