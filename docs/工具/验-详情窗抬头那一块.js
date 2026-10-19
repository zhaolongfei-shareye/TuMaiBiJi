// 详情窗抬头那一块（站长 10-17 深夜第三稿「开工」那一轮的静态自证）。
// 跑法：node docs/工具/验-详情窗抬头那一块.js
//
// 他那一句拆成六件事，每一件都对应一种"读源码像对的、屏上不对"的失效：
// 「配图改为这种形式，固定高度图片区（如果不配图，这部分空间就隐藏），通栏大图滑动，显示数字，
//   和下方圆点，横杠，大图上方是我们标题，不加背景色了，恢复之前那种标题设计，
//   然后，弱化标签，只需要显示标签名字，灰字，不加底色，不加粗。」
// ① 头一排两列（左标题叠 + 右这篇留过的卡片）整套撤净 ⇒ 标题摊满整宽。
//    残留的失效形态是"两列还在但右列空着"——那标题右边会缺一块。
// ② 配图从一排 180rpx 小方格换成**固定高、通栏、可左右滑的大图**。
//    "通栏"这一条最容易假绿：只要那块还挂在 `.ds-in` 里面，左右各少 34rpx，看着也像大图。
//    所以这把不是看它写没写 width:100%，是看它在标记里**落在两个 `.ds-in` 之间**。
// ③ 图区高是照他附的那张视频号截图量的（宽×0.5627），不是挑的；数与量法在
//    docs/工具/出-详情窗抬头色块效果图.js 文件头。这把现读 `.float-sheet` 左右窗边算出通栏宽再乘那个比，
//    所以窗边一改，这一条会跟着要新的数——不会出现"稿子改了、CSS 里那个 395 还留着"。
// ④ 没配图 ⇒ 图区＋数字＋那一排点三样全不渲染（不留占位框）。
// ⑤ 数字与那一排点只在**多于一张**时出现；当前那一枚不是点，是横杠（宽与点不同、高相同）。
// ⑥ 标签只剩名字：灰字、不垫底、不加粗。灰档吃现成的 `--text-tertiary`，不另造色号。
// ⑦ 10-19 站长「图片展示不全，改为按比例缩小，其他部分空间用同照片毛玻璃铺满」⇒ 图区里是**两层**：
//    底＝同一张 aspectFill ＋ blur 且比盒子大一圈，上＝aspectFit 完整那张。这一把钉三件会静默失效的事：
//    上面那张又回 aspectFill（竖图又被裁）、底忘了糊（两层一样＝留白没填）、底与盒子同尺寸（模糊的渐隐露成一条脏边）。
//
// 最后一段是反向自证：故意造十一处漂移，判据必须红——不然它只是在读文件，不是在守东西。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const stripXml = (s) => s.replace(/<!--[\s\S]*?-->/g, '')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

const IX_WXML = read('miniprogram/pages/index/index.wxml')
const IX_WXSS = read('miniprogram/pages/index/index.wxss')
const IX_JS = read('miniprogram/pages/index/index.js')
const APP_WXSS = read('miniprogram/app.wxss')

// 下面这三把"从源码里抠一条规则/一个数"的工具是本把这轮自己用的口径，
// 与效果图生成器里那一份是同一套读法（同一枚令牌、同一个选择器），不另起一套。
const rule = (src, sel) => {
  const m = new RegExp('\\.' + sel + '\\s*\\{([^}]*)\\}').exec(stripCss(src))
  return m ? m[1] : ''
}
const numOf = (src, sel, prop) => {
  const body = rule(src, sel)
  const direct = new RegExp('(?:^|;)\\s*' + prop + ':\\s*(-?\\d+(?:\\.\\d+)?)rpx').exec(body)
  if (direct) return parseFloat(direct[1])
  const viaVar = new RegExp('(?:^|;)\\s*' + prop + ':\\s*var\\((--[\\w-]+)\\)').exec(body)
  if (!viaVar) return NaN
  const t = new RegExp(escapeRe(viaVar[1]) + ':\\s*(-?\\d+(?:\\.\\d+)?)rpx').exec(stripCss(APP_WXSS))
  return t ? parseFloat(t[1]) : NaN
}
const declOf = (src, sel, prop) => {
  const m = new RegExp('(?:^|;)\\s*' + prop + ':\\s*([^;]+)').exec(rule(src, sel))
  return m ? m[1].trim() : ''
}
const escapeRe = (x) => x.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')

// 走到第 idx 个字符时，脚下压着几层 `.ds-in`。
// 只跟着 `<view`／`</view>` 配平，别的标签不掺和；属性值里带 `>`（`wx:if="{{a > 1}}"`）
// 会让一次开标签被截断，但截断的那一次照样 push 一个"不是 ds-in"的假项、后面那个 `</view>` 再 pop 掉，
// 深度不受影响——所以这里要的是**配平**，不是把标签解析对。
const dsInDepthAt = (wxml, idx) => {
  const re = /<(\/?)view\b([^>]*)>/g
  const stack = []
  let m
  while ((m = re.exec(wxml))) {
    if (m.index >= idx) break
    if (m[1]) stack.pop()
    else stack.push(/class="[^"]*\bds-in\b/.test(m[2]))
  }
  return stack.filter(Boolean).length
}

// 窗内通栏宽（rpx）：现读 `.float-sheet` 那两枚窗边，不写死 702
const sheetEdge = (prop) => {
  const m = new RegExp('\\.float-sheet\\s*\\{[^}]*?' + prop + ':\\s*(-?[\\d.]+)rpx').exec(stripCss(IX_WXSS))
  if (!m) throw new Error(`读不到 .float-sheet 的 ${prop}`)
  return parseFloat(m[1])
}
const FULL_W = 750 - sheetEdge('left') - sheetEdge('right')
const REF_RATIO = 0.5627   // 照他附的那张截图量到的：图区高 ÷ 通栏宽（那张是 628 ÷ 1116）

const WXML = stripXml(IX_WXML)
const JS = stripJs(IX_JS)
const CSS = stripCss(IX_WXSS)

/* ---------- ① 两列分栏撤净 ---------- */
{
  const gone = ['ds-hero', 'ds-lt', 'ds-rt', 'ds-pad ds-entry', 'ds-entry', 'ix-shots', 'ix-shot']
  const left = gone.filter((c) => WXML.includes(c))
  ck('详情窗标记里那两列分栏与那排小方格一个都没剩（标题右边不会缺一块）',
    left.length === 0 && !/onCardCell/.test(WXML), left.join('|') || 'onCardCell 也不在')
  const leftCss = ['ds-hero', 'ds-lt', 'ix-shots', 'ix-shot'].filter((c) => new RegExp('\\.' + c + '\\b').test(CSS))
  ck('index.wxss 里那两列与那排小方格的样式也撤净（留着就是第二份真相的起点）',
    leftCss.length === 0, leftCss.join('|'))
  ck('index.js 里那一格的口 `onCardCell` 撤了（出图那一趟只剩「分享」一枚绑 `_openPosterFor`）',
    !/onCardCell/.test(JS))
  ck('`_openPosterFor` 这份实现还在，且「分享」那枚还绑着它（撤的是入口，不是能力）',
    /_openPosterFor\(note\)|_openPosterFor \(note\)|_openPosterFor:/.test(JS.replace(/\s+/g, ' '))
    && /catchtap="onSheetShare"/.test(WXML))
}

/* ---------- ② 抬头三行摊满整宽 ---------- */
{
  // `.ds-meta`／`.ds-h2`／`.ds-tags` 必须是 id="ds-top" 那个 `.ds-in` 的**直接子节点**：
  // 中间再套一层带 flex 的 view，"摊满整宽"就成了那一层的事，不是这一屏的事。
  const m = /<view class="ds-in" id="ds-top">([\s\S]*?)<\/view>\s*\n\s*\n/.exec(WXML)
  const seg = m ? m[1] : ''
  ck('来源／标题／标签三行直接挂在窗内那一格上（中间没有再套分栏层）',
    /class="ds-meta"/.test(seg) && /class="ds-h2"/.test(seg) && /class="ds-tags"/.test(seg)
    && !/<view class="ds-(hero|lt|rt)"/.test(seg), seg.replace(/\s+/g, ' ').slice(0, 60))
  ck('标题这一轮没动：还是现网那一份 46rpx／800',
    numOf(IX_WXSS, 'ds-h2', 'font-size') === 46 && /font-weight:\s*800/.test(rule(IX_WXSS, 'ds-h2')),
    `${numOf(IX_WXSS, 'ds-h2', 'font-size')}rpx／${declOf(IX_WXSS, 'ds-h2', 'font-weight')}`)
  ck('窗内那一格左右内缩还是 34rpx（通栏那块挂在它外面，两者不能互相顶）',
    numOf(IX_WXSS, 'ds-in', 'padding') === 34 || /padding:\s*0\s+34rpx/.test(rule(IX_WXSS, 'ds-in')),
    declOf(IX_WXSS, 'ds-in', 'padding'))
}

/* ---------- ③ 通栏固定大图 ---------- */
{
  const fig = /<swiper[^>]*class="ds-fig"[\s\S]*?<\/swiper>/.exec(WXML) || ['']
  ck('图区是 swiper（左右滑），不是又一排小图', /<swiper\b/.test(fig[0]))
  ck('滑到哪一张由 `dsFigAt` 这一份游标说话：current 绑它、bindchange 写它',
    /current="\{\{dsFigAt\}\}"/.test(fig[0]) && /bindchange="onDsFigChange"/.test(fig[0]))
  ck('平台自带那排点关掉（我们要的是"当前那枚是横杠"，它给不了）',
    /indicator-dots="\{\{false\}\}"/.test(fig[0]))
  const img = /<image[^>]*class="ds-fig-img"[\s\S]*?\/>/.exec(WXML) || ['']
  ck('大图 aspectFit（整张完整放进定高图区，不裁）＋点它还是拉全屏大图',
    /mode="aspectFit"/.test(img[0]) && /catchtap="onPreviewDetailImage"/.test(img[0])
    && /data-url="\{\{im\.cloud_url\}\}"/.test(img[0]), img[0].replace(/\s+/g, ' ').slice(0, 70))
  /* 10-19 他这一刀把"留白"换成了"同照片毛玻璃"：底必须与上是**同一张**（`im.cloud_url` 同一个绑定），
     而且必须 aspectFill 铺满——底要是也 aspectFit，两层一样大、留白还是留白，那一刀等于没做。 */
  const bg = /<image[^>]*class="ds-fig-bg"[\s\S]*?\/>/.exec(WXML) || ['']
  ck('底那一层在：同一张 `im.cloud_url`、aspectFill 铺满（不是另找一张图、也不是纯色）',
    /src="\{\{im\.cloud_url\}\}"/.test(bg[0]) && /mode="aspectFill"/.test(bg[0]),
    bg[0].replace(/\s+/g, ' ').slice(0, 70))
  ck('底真的糊了：`.ds-fig-bg` 带 filter:blur，且半径不是 0',
    /filter:\s*blur\(\s*(?!0)\d/.test(rule(IX_WXSS, 'ds-fig-bg')), declOf(IX_WXSS, 'ds-fig-bg', 'filter'))
  /* 模糊会在四边带出一圈半透明渐隐 ⇒ 底必须比盒子大（外挪＋放大，或 transform:scale）。
     这一条钉的是"别露一条脏边"，不是钉 112% 这个数——写死数就会变成两处各写一遍。 */
  const bgRule = ';' + rule(IX_WXSS, 'ds-fig-bg')
  const bgPct = parseFloat((/width:\s*([\d.]+)%/.exec(bgRule) || [, '0'])[1])
  ck('底比盒子大一圈（渐隐圈被推到盒子外，四边不露脏边）',
    bgPct > 100 || /transform:\s*scale\(\s*1\./.test(bgRule), `width ${bgPct}%`)
  ck('底不许吃点击（两层叠着，点上去还得是拉大图那一层）',
    !/catchtap|bindtap/.test(bg[0]))
  const h = numOf(IX_WXSS, 'ds-fig', 'height')
  const wantH = Math.round(FULL_W * REF_RATIO)
  ck(`图区高就是量出来的那一个：窗内通栏 ${FULL_W}rpx × ${REF_RATIO} = ${wantH}rpx`,
    h === wantH, `${h}rpx`)
  /* 「图与盒子同大小」这一条 10-18 换了量法（判据跟着改口径，不是代码迁就旧尺子）：
     395 这个数 2.3.6 起只写在 `.ds-fig` 一处，里面那张改成吃 `height: 100%`。
     旧写法要求两处都是同一个字面数——那正是它自己要防的东西（两处各写一遍迟早漂一个）。
     所以现在问的是"同一个出处"：要么 100%（跟着盒子），要么与盒子逐字同一个数；
     写成第三个数（比如当年那个 232）就红。上面那条 ck 钉住盒子确实是量出来的那一个，
     两条合起来才等价于原来那一条。 */
  const imgH = declOf(IX_WXSS, 'ds-fig-img', 'height')
  ck('图与盒子同一个出处：里面那张要么 height:100%（跟着盒子），要么与盒子逐字同一个数',
    /100%/.test(imgH) || numOf(IX_WXSS, 'ds-fig-img', 'height') === h, `${imgH}（盒子 ${h}rpx）`)
  const iFig = WXML.indexOf('<swiper class="ds-fig"')
  // 通栏的判据是**它挂在谁的里面**，不是 width：`.ds-in` 里面写 width:100% 也照样左右各少 34rpx。
  // 也不是"谁在谁前面"那种 index 比法——那种比法在头一层 `.ds-in` 忘了闭合时还是绿的。
  ck('通栏：那块 swiper 不在任何一层 `.ds-in` 里面（左右各 34rpx 内缩不让）',
    iFig > 0 && dsInDepthAt(WXML, iFig) === 0, `深度 ${iFig > 0 ? dsInDepthAt(WXML, iFig) : '没找到 swiper'}`)
  ck('没配图那一整块（图区＋数字＋点）不渲染，不留占位框',
    /<block wx:if="\{\{detailImages\.length\}\}">\s*<swiper class="ds-fig"/.test(WXML))
}

/* ---------- ⑤ 数字与那一排点 ---------- */
{
  // ⚠ 那两枚的标签里 `wx:if="{{detailImages.length > 1}}"` 自带一个 `>`，拿 `[^>]*` 去框一个标签
  // 会在半个标签处断掉（第一版就在这儿假红，报出来是"没找到"）。所以整串写死，不猜属性边界。
  const CNT_TAG = '<view wx:if="{{detailImages.length > 1}}" class="ds-cnt">'
  const DOTS_TAG = '<view wx:if="{{detailImages.length > 1}}" class="ds-dots">'
  const iCnt = WXML.indexOf(CNT_TAG), iDots = WXML.indexOf(DOTS_TAG)
  const cnt = iCnt >= 0 ? WXML.slice(iCnt, WXML.indexOf('</view>', iCnt)) : ''
  ck('数字念的是"第几张／共几张"，跟着那份游标走',
    /\{\{dsFigAt \+ 1\}\}\/\{\{detailImages\.length\}\}/.test(cnt), cnt.replace(/\s+/g, ' ').slice(0, 60))
  ck('只有一张时数字与那一排点都不画（wx:if 是 > 1，不是 length）',
    iCnt >= 0 && iDots >= 0, `ds-cnt@${iCnt} ds-dots@${iDots}`)
  ck('那一排点居中、数字右对齐（照参考图那两行的落点）',
    /justify-content:\s*center/.test(rule(IX_WXSS, 'ds-dots')) && /text-align:\s*right/.test(rule(IX_WXSS, 'ds-cnt')))
  const dw = numOf(IX_WXSS, 'ds-dot', 'width'), ow = numOf(IX_WXSS, 'ds-dot.on', 'width')
  const dh = numOf(IX_WXSS, 'ds-dot', 'height'), oh = numOf(IX_WXSS, 'ds-dot.on', 'height')
  ck('当前那一枚是横杠：宽比点宽、高与点同一档（只加宽，不另起一枚）',
    ow > dw && (oh === dh || Number.isNaN(oh)), `点 ${dw}×${dh}｜横杠 ${ow}×${oh || '同点'}`)
  ck('横杠那两档数是量来的：点 11rpx、横杠 25rpx、间距 6rpx',
    dw === 11 && ow === 25 && numOf(IX_WXSS, 'ds-dots', 'gap') === 6,
    `${dw}／${ow}／${numOf(IX_WXSS, 'ds-dots', 'gap')}`)
}

/* ---------- ⑥ 标签弱化 ---------- */
{
  const body = rule(IX_WXSS, 'ds-tag')
  const kept = ['background', 'border-radius', 'padding', 'font-weight'].filter((p) => new RegExp('(^|;)\\s*' + p + ':').test(';' + body))
  ck('标签只剩名字：不垫底、不加粗、圆角与内缩一并撤', kept.length === 0, kept.join('|') || body.replace(/\s+/g, ' ').trim())
  const col = declOf(IX_WXSS, 'ds-tag', 'color')
  ck('灰档吃现成那枚 `--text-tertiary`（没另造色号），且那枚令牌在 app.wxss 里确实有',
    /var\(--text-tertiary\)/.test(col) && /--text-tertiary:/.test(stripCss(APP_WXSS)), col)
  ck('字号还是原来那一档（只弱化皮，没顺手改大小）',
    numOf(IX_WXSS, 'ds-tag', 'font-size') === numOf(IX_WXSS, 'ds-tag', 'font-size')
    && numOf(IX_WXSS, 'ds-tag', 'font-size') === 21, `${numOf(IX_WXSS, 'ds-tag', 'font-size')}rpx`)
  ck('标签那一排还是 wrap 的（五枚以上折行，不换滚动条）',
    /flex-wrap:\s*wrap/.test(rule(IX_WXSS, 'ds-tags')))
  ck('那一行"配图"小标题撤了（大图自己就是标题），但字典那个键还给详情页留着',
    !/\{\{t\.shotsLabel\}\}\s*<\/view>[\s\S]{0,200}ds-fig/.test(WXML)
    && /shotsLabel/.test(read('miniprogram/utils/i18n.js')))
}

/* ---------- 那份游标的三处归零 ---------- */
{
  // data 里那一枚中间夹着两行说明，`stripJs` 会把行注释整行删掉 ⇒ 这一条必须拿**没剥注释**的那份读。
  const data = /detailImages:\s*\[\],(\s*\/\/[^\n]*\n)+\s*dsFigAt:\s*0,/.test(IX_JS)
  ck('data 里有 `dsFigAt: 0`（不是靠 undefined 当 0）', data)
  // 这一条要指到 `_openDetail` 那一趟里，不能只问"文件里有没有这么一行"——
  // data 里那一枚剥掉注释之后长得一模一样，只比形状就是自己跟自己比、永真。
  ck('开窗那一趟归零（上一配停在第 3 张，不许带着这个号进下一篇）',
    /detailCards: this\._cardsOf\(row\.id\), dsTo: '',[\s\S]{0,220}?detailImages: \[\], dsFigAt: 0/.test(IX_JS))
  ck('配图到货那一趟也归零（图是后到的，到货时屏上那份游标可能是上一配的）',
    /setData\(\{\s*detailImages: \[\.\.\.\(list \|\| \[\]\), \.\.\.\(official \? \[official\] : \[\]\)\], dsFigAt:\s*0\s*\}\)/.test(JS))
  const h = (/onDsFigChange\(e\)\s*\{([\s\S]*?)\n  \}/.exec(JS) || ['', ''])[1]
  ck('滑一下只认 swiper 报的 current，同号不 setData（不制造第二次渲染）',
    /e && e\.detail && e\.detail\.current/.test(h) && /i === this\.data\.dsFigAt\) return/.test(h),
    h.replace(/\s+/g, ' ').trim().slice(0, 90))
}

/* ---------- 反向自证：造八处漂移，上面那些判据必须红 ---------- */
{
  const r = (src, sel) => { const x = new RegExp('\\.' + sel + '\\s*\\{([^}]*)\\}').exec(src); return x ? x[1] : '' }
  const n = (src, sel, prop) => { const x = new RegExp('(?:^|;)\\s*' + prop + ':\\s*(-?[\\d.]+)rpx').exec(r(src, sel)); return x ? parseFloat(x[1]) : NaN }
  const preds = (wxml, css, js) => {
    const W = stripXml(wxml), C = stripCss(css), J = stripJs(js)
    const iFig = W.indexOf('<swiper class="ds-fig"')
    return {
      撤净: !/ds-rt|ds-hero|ix-shot\b|onCardCell/.test(W),
      摊满: /class="ds-meta"[\s\S]*class="ds-h2"[\s\S]*class="ds-tags"/.test(W) && !/<view class="ds-lt"/.test(W),
      通栏: iFig > 0 && dsInDepthAt(W, iFig) === 0,
      图区高: n(C, 'ds-fig', 'height') === Math.round(FULL_W * REF_RATIO),
      图跟盒子: /height:\s*100%/.test(';' + r(C, 'ds-fig-img'))
        || n(C, 'ds-fig-img', 'height') === n(C, 'ds-fig', 'height'),
      大图不裁: /class="ds-fig-img"[^>]*mode="aspectFit"/.test(W.replace(/\n\s*/g, ' ')),
      糊底: /class="ds-fig-bg"[^>]*mode="aspectFill"/.test(W.replace(/\n\s*/g, ' '))
        && /filter:\s*blur\(\s*(?!0)\d/.test(';' + r(C, 'ds-fig-bg'))
        && parseFloat(((/width:\s*([\d.]+)%/.exec(';' + r(C, 'ds-fig-bg')) || [, '0'])[1])) > 100,
      横杠: n(C, 'ds-dot.on', 'width') > n(C, 'ds-dot', 'width'),
      标签: !/background:/.test(';' + r(C, 'ds-tag')),
      归零: /detailImages:\s*\[\],\s*dsFigAt:\s*0/.test(J) && /detailImages: \[\.\.\.\(list \|\| \[\]\), \.\.\.\(official \? \[official\] : \[\]\)\], dsFigAt: 0/.test(J),
    }
  }
  const base = preds(IX_WXML, IX_WXSS, IX_JS)
  ck(`反向自证的底：${Object.keys(base).length} 处都不漂移时这把全绿`,
    Object.values(base).every(Boolean), JSON.stringify(base))
  const mut = (src, from, to) => {
    if (!src.includes(from)) throw new Error('反向自证的锚点没找到，那条测不了：' + from.slice(0, 46))
    return src.replace(from, to)
  }
  const cases = [
    ['两列分栏没撤净（把 .ds-rt 塞回头排）', ['wxml', mut(IX_WXML, '<view class="ds-meta">', '<view class="ds-rt"></view>\n<view class="ds-meta">')], '撤净'],
    // 这一处要**成对**改：只塞一个开标签进去，后面那些 `</view>` 会整体错一位，
    // 连带把"通栏"那条也顶红——那时红的是我的改法，不是判据。
    ['标题那一叠又套了一层分栏', ['wxml', mut(
      mut(IX_WXML, '<view class="ds-meta">', '<view class="ds-lt"><view class="ds-meta">'),
      '</view>\n\n      <!-- 配图', '</view>\n      </view>\n\n      <!-- 配图')], '摊满'],
    ['图区挂回 `.ds-in` 里面（那就不是通栏，左右各少 34rpx）',
      ['wxml', mut(IX_WXML, '</view>\n\n      <!-- 配图', '<!-- 配图')], '通栏'],
    ['图区高被手写改回一个整数（395 → 300，窗边改了没人跟着改）',
      ['wxss', mut(IX_WXSS, '.ds-fig {\n  flex: none;\n  width: 100%;\n  height: 395rpx', '.ds-fig {\n  flex: none;\n  width: 100%;\n  height: 300rpx')], '图区高'],
    ['里面那张图自己写死一个数（盒子 395、图 300＝底下留缝，而两行看着都还挺对）',
      ['wxss', mut(IX_WXSS, 'width: 100%;\n  height: 100%;\n}', 'width: 100%;\n  height: 300rpx;\n}')], '图跟盒子'],
    ['大图又改回 aspectFill（＝竖图上下又被裁一截，他这次要的就是这一句反着来）',
      ['wxml', mut(IX_WXML, 'class="ds-fig-img" src="{{im.cloud_url}}" mode="aspectFit"',
        'class="ds-fig-img" src="{{im.cloud_url}}" mode="aspectFill"')], '大图不裁'],
    ['底那一层忘了糊（两层同一张同样铺满＝留白根本没被毛玻璃填上，这一刀等于没做）',
      ['wxss', mut(IX_WXSS, 'filter: blur(30rpx);', 'filter: none;')], '糊底'],
    ['底与盒子一样大（模糊带出的那圈渐隐露在四边上，读成一条脏边）',
      ['wxss', mut(IX_WXSS, 'width: 112%;\n  height: 112%;', 'width: 100%;\n  height: 100%;')], '糊底'],
    ['横杠那一枚忘了加宽（当前那张与其余点同宽＝看不出现在第几张）',
      ['wxss', mut(IX_WXSS, '.ds-dot.on {\n  width: 25rpx', '.ds-dot.on {\n  width: 11rpx')], '横杠'],
    ['标签的底色被谁加回来（第二份皮）',
      ['wxss', mut(IX_WXSS, '.ds-tag {\n  font-size: var(--fs-tiny);', '.ds-tag {\n  background: #EEE;\n  font-size: var(--fs-tiny);')], '标签'],
    ['配图到货那一趟忘了归零游标（上一配停在第 3 张，这一配从第 3 张开）',
      ['js', mut(IX_JS, 'this.setData({ detailImages: [...(list || []), ...(official ? [official] : [])], dsFigAt: 0 })', 'this.setData({ detailImages: [...(list || []), ...(official ? [official] : [])] })')], '归零'],
  ]
  for (const [name, [which, mutated], key] of cases) {
    const p = which === 'wxml' ? preds(mutated, IX_WXSS, IX_JS) : which === 'wxss' ? preds(IX_WXML, mutated, IX_JS) : preds(IX_WXML, IX_WXSS, mutated)
    const red = p[key] === false && Object.keys(p).filter((k) => p[k] === false).length === 1
    console.log(`${red ? '✓' : '✗'} 反向：${name} → ${red ? '只有那一条红了' : '没红或多条连带红（＝判据没钉住那一处）'}`)
    if (!red) bad.push('反向：' + name)
  }
}

console.log(bad.length ? `\n✗ ${bad.length} 条红：\n  · ${bad.join('\n  · ')}` : '\n✓ 全绿')
process.exit(bad.length ? 1 : 0)
