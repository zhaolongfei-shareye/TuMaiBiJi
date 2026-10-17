// 生成「列表合一」这一刀的效果图。**屏上每一句中文、每一枚色、每一档字号、每一段几何都不是手抄的**：
// 字从 miniprogram/utils/i18n.js 现读，来源那六个值从 pages/index/index.js 的 SOURCE_TYPE_KEYS 现读，
// 色／字号／圆角／阴影从 miniprogram/app.wxss 现读，行的几何从 pages/index/index.wxss 现读，
// 参考图那几段比例从站长给的那张 JPG 量出来（量法见 docs/工具/量-参考图-比例.py）。
// 为什么非要现读＋量：站长定过「效果图文案必须抄现网字典」「效果图与代码同口径」「设计先对外部取证」，
// 手抄与手拍的那一份下一轮必然走样。
// 折算：设计稿 750rpx ＝ CSS 视口 375 ⇒ 1rpx = 0.5px（下面 R()）。
// 跑法：node docs/工具/出-列表合一效果图.js   （它写完 HTML 会自己调通用出图器渲 PNG）
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '../..')
const DIR = path.join(ROOT, 'docs/design/10-17列表合一')
const HTML = path.join(DIR, '列表合一-效果图.html')
const REF = '参考图-站长给的那张.jpg'
const BRAND = '../../../miniprogram/assets/title-heading.png' // 首屏那枚书法位图，笔记页有图那一态的左上角就是它

const i18n = require(path.join(ROOT, 'miniprogram/utils/i18n.js'))
const palette = require(path.join(ROOT, 'miniprogram/utils/palette.js'))
const zh = i18n.texts('zh')
const en = i18n.texts('en')

const R = (n) => +(n / 2).toFixed(2) // rpx → CSS px
// 令牌值里可能带 rpx（字号、阴影那几档）。rpx 在 Chrome 不是合法长度：
// `font-size:var(--fs-body)` 摊开成 `font-size:28rpx` 会**整条声明静默作废**、退回继承值 16px，
// box-shadow 同理退成 none——不报错、不红、守卫也量不出来（10-17 他一句"来源字体太大"才把这层炸出来：
// 上一版稿子里来源／标题／分类三档其实全是 16px，我改的那两档字号一个字都没上屏）。
// 所以任何塞进 :root 的令牌都要先过这一道，别指望"值是从 app.wxss 现读的"就等于"画上屏了"。
const pxize = (v) => String(v).replace(/(-?[\d.]+)rpx/g, (_, n) => R(+n) + 'px')

// ── 令牌：从 app.wxss 现读，读不到就抛（不许我给一个"看着差不多"的数）
const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/app.wxss'), 'utf8')
const idxwxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxss'), 'utf8')
const idxjs = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.js'), 'utf8')
function tok(name, from = wxss) {
  const m = new RegExp('--' + name + ':\\s*([^;]+);').exec(from)
  if (!m) throw new Error(`读不到令牌 --${name}`)
  return m[1].trim()
}
function rule(src, sel, prop) { // 从某个选择器那一块里取一条声明（注释里出现的同名声明会被挡掉）
  const i = src.indexOf('\n' + sel + ' {')
  if (i < 0) throw new Error(`读不到块 ${sel}`)
  const body = src.slice(i, src.indexOf('\n}', i))
  const m = new RegExp('(?:^|\\n)\\s*' + prop + ':\\s*([^;]+);').exec(body)
  if (!m) throw new Error(`${sel} 里读不到 ${prop}`)
  return m[1].trim()
}
function rpxOf(src, sel, prop) { const v = rule(src, sel, prop); const m = /(-?[\d.]+)rpx/.exec(v); if (!m) throw new Error(`${sel} 的 ${prop} 不是 rpx：${v}`); return +m[1] }
function rpxs(src, sel, prop) { // 简写声明里那几档 rpx 全取出来（padding: 24rpx 0 20rpx 这种）
  return rule(src, sel, prop).split(/\s+/).map((v) => {
    if (v === '0') return 0 // 简写里的 0 不带单位，这是合法值，不是"读不到"
    const m = /^(-?[\d.]+)rpx$/.exec(v)
    if (!m) throw new Error(`${sel} 的 ${prop} 里 ${v} 不是 rpx`)
    return +m[1]
  })
}
const INK = (() => {
  const i = wxss.indexOf('.mood-ink {')
  if (i < 0) throw new Error('读不到块 .mood-ink')
  return wxss.slice(i, wxss.indexOf('}', i))
})()
const T = {
  fsBody: tok('fs-body'), fsMeta: tok('fs-meta'), fsTiny: tok('fs-tiny'), fsMicro: tok('fs-micro'),
  rCard: tok('r-card'), sp4: tok('sp-4'),
  bgPage: tok('bg-page'), bgCard: tok('bg-card'),
  plateDock: /--glass-plate-dock:\s*([^;]+);/.exec(INK)[1].trim(),
  shLift: tok('sh-lift'), shDrop: tok('sh-drop'), shRow: tok('sh-row'),
  ink: /--slide-ink:\s*([^;]+);/.exec(INK)[1].trim(),
}
const G = {
  head: R(rpxOf(idxwxss, '.head', 'height')),
  h1Top: R(rpxOf(idxwxss, '.h1', 'top')),
  brandW: R(rpxOf(wxss, '.brand-title', 'width')),
  brandOp: rule(wxss, '.brand-title', 'opacity'),
  statRight: R(rpxOf(idxwxss, '.stats', 'right')),
  statTop: R(rpxOf(idxwxss, '.stats', 'top')),
  statN: R(rpxOf(idxwxss, '.stat .n', 'font-size')),
  toolsX: R(rpxOf(idxwxss, '.tools', 'left')),
  toolsH: R(rpxOf(idxwxss, '.tools', 'height')),
  vtabGap: R(rpxOf(idxwxss, '.vtabs', 'gap')),
  vtabPadX: R(rpxs(idxwxss, '.vtabs', 'padding')[1]),
  catGap: R(rpxOf(idxwxss, '.cat-chips', 'gap')),
  xrowPadT: R(rpxs(idxwxss, '.xrow', 'padding')[0]),
  xdW: R(rpxOf(idxwxss, '.xd', 'width')),
  dot: R(rpxOf(idxwxss, '.xd-dot', 'width')),
  sheetLift: R(-rpxOf(idxwxss, '.sheet', 'margin-top')),
  sheetPad: R(rpxs(idxwxss, '.sheet', 'padding')[1]),
  xlistPadB: R(rpxOf(idxwxss, '.xlist', 'padding-bottom')),
  moreColor: rule(idxwxss, '.x-more', 'color'),
}
// 参考图量出来的那几档（929px 宽 ⇒ 假定 CSS 375，scale 2.4773；台阶法，量法在 py 脚本头里）
// ⚠ 卡间距这一档 10-17 起**不再写量出来的数**：站长那句"阴影太厚、上下面板几乎连起来"落码之后
//   净距从 17rpx 抬到 28rpx，稿子改成现读 `.ixl-row` 的 margin-bottom，两边同一把尺子。
const REF_R = { bandPct: 54.2, thumb: 47, gutW: 44, cardLeft: 97 }
REF_R.cardGap = R(rpxOf(idxwxss, '.ixl-row', 'margin-bottom'))

// ── 屏上每句话：按字典键取，键名缺了就抛
function need(dict, k) {
  if (typeof dict[k] !== 'string' || !dict[k]) throw new Error(`字典里没有键 ${k}`)
  return dict[k]
}
const K = ['notesHeading', 'statNotes', 'allCategories', 'back', 'search', 'noNotes', 'navShare', 'tabList',
  'searchPh', 'loading', 'showMore']
K.forEach((k) => { need(zh, k); need(en, k) })

// 来源那一行小字：**现读 pages/index/index.js 的 SOURCE_TYPE_KEYS**，不另抄一份。
// 这张表在 detail.js 与 poster.js 里各有一份同内容的（10-17 现读到的样子），稿子吃 index.js 那一份。
const SRC_BLOCK = /const SOURCE_TYPE_KEYS = \{([\s\S]*?)\n\}/.exec(idxjs)
if (!SRC_BLOCK) throw new Error('读不到 pages/index/index.js 的 SOURCE_TYPE_KEYS')
const SRC = {}
SRC_BLOCK[1].replace(/(\w+):\s*'(\w+)'/g, (_, k, v) => { SRC[k] = v; return '' })
Object.keys(SRC).forEach((k) => { need(zh, SRC[k]); need(en, SRC[k]) })
const srcLabel = (dict, k) => need(dict, SRC[k])

// ── 示意数据：标题、来源、标识都是编的（真机上是用户自己的笔记），图位是 CSS 渐变——图例里写死。
// 英文那几条压着可写宽挑（行内可写宽 216px，见 docs/工具/验-英文挤不挤.js 的实测）；
// 真机上超那一档吃省略号（现网 .x-t 本来就有 text-overflow:ellipsis），稿子里不必故意放一条被切半截的。
const SAMPLE = [
  { t: '海港这一段值得走两回', te: 'Two laps round the harbour', d: '10/16', day: 14, src: 'wechat_article',
    s: '从码头那一段往上走，前半是防波堤，风大；拐进第二条街开始有台阶，台阶上面那排房子是这一带最好看的一处。',
    img: ['#C9D7D2', '#8FA9A2'], card: true, shared: true },
  { t: '山里那一格信号', te: 'One bar up in the hills', d: '10/16', day: 14, src: 'screenshot',
    s: '观景台往北三百米就没信号了，导航提前把离线包装好。', img: ['#D8CFC4', '#A99C8C'], card: true },
  { t: '缆车上那十分钟', te: 'Cable car, ten minutes', d: '10/16', day: 14, src: 'web_article',
    s: '末班 17:40，排队二十分钟，往上那趟看得到整个湾。', img: null, shared: true },
  { t: '日落观景点要早到', te: 'Get to the view early', d: '10/15', day: 14, src: 'manual',
    s: '六点以后停车位全满，栈道只有单边有灯。', img: ['#E3D3CE', '#B79A93'] },
  { t: '灯塔那条路风大', te: 'Lighthouse road is windy', d: '10/15', day: 15, src: 'share_import',
    s: '风大的时候那段栏杆会晃，别靠外沿。', img: ['#CFD6E0', '#93A0B4'], card: true, shared: true },
]
const PRIV = { t: '这一篇设了密码', te: 'This one is locked', d: '10/15', day: 15, src: 'manual',
  s: '', img: null, priv: true }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ── 标识轨：参考图标题下面那条线，改成"线上摆标识"（他 10-17 这句）
// 每一枚的数据出处都写在这儿，别落码时凭印象找口。
function rail(opt, r) {
  const mk = []
  if (r.shared) mk.push('<i class="mk star"></i>')          // 服务端列表响应里那栏 has_active_share
  if (r.card) mk.push('<i class="mk card"></i>')             // cardCloud.hasCard(id)：内存里那份全量名单，零请求
  if (r.fav) mk.push('<i class="mk heart"></i>')             // 未来：今天没有这一栏，要服务端数 imported_from
  if (r.priv) mk.push('<b class="mk lock"></b>')             // 客户端 isPrivate(分类名)（index.js:326）
  // 一枚都没有 ⇒ 只留那条线（不塞占位元素：占位会把轨上的间距撑出来）
  return `<div class="rail${opt.color ? ' cl' : ''}">${mk.join('')}<i class="ln"></i></div>`
}

// ── 行（合一之后）：左槽（乙＝分组大数字，甲＝日期）＋ 来源小字／标题／标识轨 ＋ 右端配图
function mergedRow(r, opt, lang) {
  const D = lang === 'en' ? en : zh
  const title = lang === 'en' ? r.te : r.t
  const thumb = r.img
    ? `<div class="th" style="background:linear-gradient(135deg,${r.img[0]},${r.img[1]})"></div>`
    : '' // 没图就什么都不画（他原话"没有不显示"），标识已经搬到线上，不再需要一枚"位置留着"的空框
  return `<div class="row">
      ${opt.groupBy ? '' : `<div class="rd"><b class="dot" style="background:${TIPDOT}"></b><span>${esc(r.d)}</span></div>`}
      <div class="mid">
        <div class="src">${esc(srcLabel(D, r.src))}</div>
        <div class="tt">${esc(title)}</div>
        ${rail(opt, r)}
      </div>
      ${thumb}
    </div>`
}
function mergedList(opt) {
  const lang = opt.lang
  if (!opt.groupBy) return opt.rows.map((r) => mergedRow(r, opt, lang)).join('')
  let out = '', last = null
  opt.rows.forEach((r) => {
    if (r.day !== last) {
      if (last !== null) out += '</div></div>'
      last = r.day
      out += `<div class="grp"><div class="gut"><b>${r.day}</b><span>MON</span>${r.day === 14 ? '<i></i>' : ''}</div><div class="gbody">`
    }
    out += mergedRow(r, opt, lang)
  })
  return out + (opt.rows.length ? '</div></div>' : '')
}

// ── 现网对照那一屏：两枚 tab + 分类行 + 日期列 + 标题 + 三行摘要 +「显示更多」（一个字不改，当尺子用）
function liveList(lang) {
  const D = lang === 'en' ? en : zh
  return SAMPLE.map((r) => `<div class="lrow">
      <div class="xd"><b class="dot" style="background:${TIPDOT}"></b><span>${esc(r.d)}</span></div>
      <div class="xm"><div class="lt">${esc(lang === 'en' ? r.te : r.t)}</div>
        <div class="ls">${esc(r.s)}</div>
        <div class="lm">${esc(D.showMore)}</div></div>
    </div>`).join('')
}
function catRow(D) {
  // 现网这一行只有「全部」那一枚是字典里的固定字，其余每枚都是用户自己起的分类名（服务端给的），
  // 所以稿子里三枚一律标"示意"。`palette.UNCATEGORIZED`（墨黑）是**配色常量**，不是屏上一枚分类名——
  // 10-17 第一版我把它当分类名画上去了，那是我自己读错的，不是现网的样子。
  return `<span class="on">${esc(D.allCategories)}</span><span>示意 A</span><span>示意 B</span><span>示意 C</span>`
}
// 面板顶那一行：左「分类管理」跳 pages/categories，右「搜索」从上半那一段搬下来（他 10-17 这句）
function panelHead(D) {
  return `<div class="phead">
    <i class="ic-grid" aria-label="分类管理"><b></b><b></b><b></b><b></b></i>
    <i class="glass" aria-label="${esc(D.search)}"></i>
  </div>`
}

// ── 一屏
function screen(opt) {
  const D = opt.lang === 'en' ? en : zh
  const band = opt.live ? 70 + G.head : Math.round(812 * REF_R.bandPct / 100)
  const body = opt.live
    ? `<div class="vtabs"><span class="on">${esc(D.tabList)}</span><span>${esc(D.navShare)}</span><em>${esc(D.back)}</em></div>
       <div class="cats">${catRow(D)}</div>
       <div class="list">${liveList(opt.lang)}</div>`
    : `${opt.headless ? '' : panelHead(D)}
       <div class="cats sm">${catRow(D)}</div>
       <div class="list">${opt.empty ? `<div class="empty">${esc(D.noNotes)}</div>` : mergedList(opt)}</div>`
  return `<div class="ph">
  <div class="cap">${opt.cap}</div>
  <div class="phone">
    <div class="status">9:41<i></i><i></i><i></i></div>
    <div class="nav"><span>${esc(D.notesHeading)}</span><em class="pill">•••&nbsp;&nbsp;◎</em></div>
    <div class="bg" style="height:${band}px">
      <img class="h1 brand" src="${BRAND}" alt="${esc(D.notesHeading)}">
      <div class="stats"><div class="stat"><b>30</b><span>${esc(D.statNotes)}</span></div></div>
      ${opt.live ? `<div class="tools"><i class="glass"></i></div>` : ''}
      <div class="tag">照片位＝示意（不放真人图）</div>
    </div>
    <div class="sheet">${body}</div>
    <div class="tabbar"><i></i><i class="on"></i><i></i></div>
  </div>
  <div class="note">${opt.note}</div>
</div>`
}

const TIPDOT = palette.TIP_DOT

const LIVE = screen({
  lang: 'zh', live: true,
  cap: '⓪ 现网对照｜真机现在跑的这一版（2.2.9）：两枚 tab ＋ 分类行 ＋ 日期列 ＋ 标题 ＋ 三行摘要 ＋「显示更多」',
  note: '画这一屏只为给他一把尺：<b>合一之后少掉的就是这里那几样</b>——第二枚 tab、摘要那三行、「显示更多」、'
    + '以及卡片那一屏的两列格子；搜索那一枚从上半那一段<b>搬进面板右上角</b>（他 10-17 这句）。'
    + '上半那一段其余（书法位图＋右上角一列数字＋圆角卡往上盖）一个字没动。',
})
const B = screen({
  lang: 'zh', groupBy: true, rows: SAMPLE,
  cap: '乙·优化版（他 10-17 倾向那一版）｜来源小字 ＋ 标题 ＋ 标识轨 ＋ 右侧配图；面板顶左「分类管理」右「搜索」',
  note: '一行三档：<b>来源</b>（小字，吃字典里那六个值）→ <b>标题</b>（只这一档吃 90% 墨）→ '
    + '<b>标识轨</b>（参考图标题下面那条线，线上摆标识，末尾那条线自己收满剩下的宽）。'
    + '配图仍在右、垂直居中，<b>它身上不再挂任何东西</b>——标识全搬到线上，这样"有没有出过卡""有没有分享过"两件事'
    + '在同一个位置读，不用在图与图之间找。',
})
const LEG = screen({
  lang: 'zh', groupBy: true, color: true, headless: true,
  rows: [
    { ...SAMPLE[0], day: 14, card: true, shared: true },
    { ...SAMPLE[1], day: 14, card: true, shared: false },
    { ...SAMPLE[2], day: 14, shared: true, card: false },
    { ...PRIV, day: 14 },
    { ...SAMPLE[4], day: 14, card: true, shared: true, fav: true },
    { ...SAMPLE[3], day: 14, card: false, shared: false, img: null },
  ],
  cap: '标识轨图例（彩色那一版）｜每一枚的数据出处都标在下面，别落码时凭印象找口',
  note: '① <b>★ 分享过</b>＝服务端列表响应里那栏 <code>has_active_share</code>（<b>今天已经在下发，客户端零消费者</b>，'
    + '这一枚是它第一个用户）；② <b>▢ 出过卡片</b>＝<code>cardCloud.hasCard(id)</code>，读内存那份全量名单，零请求；'
    + '③ <b>🔒 私密</b>＝客户端 <code>isPrivate(分类名)</code>（<code>index.js:326</code>；⚠ 列表响应里没有 <code>is_private</code>，'
    + '这一枚靠分类名判，<code>privKnown</code> 那一档是"不知道"不是"不私密"）；'
    + '④ <b>♥ 被转存</b>＝<b>今天没有这一栏</b>，但数得出来：<code>notes.imported_from</code> 里钉着 '
    + '<code>share_token</code>／<code>source_note_id</code>，服务端按它数一次就知道"我分享出去的那张码被人存了几回"——'
    + '这一枚是<b>未来</b>，要一条后端活，画在这里只为看它在轨上占不占得住。'
    + '一枚都没有的那一行只留那条线（不然这一档看着像漏画）。',
})
const SRC6 = screen({
  lang: 'zh', groupBy: false, headless: true,
  rows: Object.keys(SRC).map((k, i) => ({
    t: SAMPLE[i % SAMPLE.length].t, te: SAMPLE[i % SAMPLE.length].te, d: '10/16', day: 14, src: k,
    s: '', img: i % 2 ? ['#C9D7D2', '#8FA9A2'] : null, card: i === 0, shared: i === 1,
  })),
  cap: `来源那一行只有这六种取值（<code>${Object.keys(SRC).length}</code> 支，全部现读 index.js 的 SOURCE_TYPE_KEYS）`,
  note: '顺序就是那张表的顺序：<b>' + Object.keys(SRC).map((k) => esc(srcLabel(zh, k))).join('｜') + '</b>。'
    + '<code>source_type</code> 本来就在列表响应的白名单里（<code>NOTE_BRIEF_FIELDS</code> 九栏之一），'
    + '所以这一行小字<b>零后端代价</b>。⚠ 表外值的兜底：查不到键就把英文原文写上屏——'
    + '这条站长 10-02 撞过一次，所以新加来源那一支必须同时进这张表。'
    + '<b>「私密」不在这一行里</b>：它不是来源，是标识轨那一枚锁（同一篇的来源仍是它原本那一种）。',
})
const C = screen({
  lang: 'zh', groupBy: true,
  rows: [{ ...SAMPLE[2], card: true }, SAMPLE[2], SAMPLE[0], { ...SAMPLE[4], card: false }],
  cap: '无配图那一态：右侧不画，标题吃满整宽（他原话"没有不显示"）',
  note: '四行按"有没有图 × 有没有出过卡片"排：① 没图＋出过卡 ⇒ 标识在线上，右端空着；② 没图＋没出过卡 ⇒ 只有来源与标题'
    + '（轨上仍留那条线，让每一行的下沿对齐）；③ 有图＋出过卡；④ 有图＋没出过卡。'
    + '<b>标识全在线上，不再钉在图的角上</b>——这一改是跟着他这句"利用这条线"走的，不是我自己换的。',
})
const D = screen({
  lang: 'zh', groupBy: true, rows: [{ ...PRIV, day: 14 }, SAMPLE[0], SAMPLE[2]],
  cap: '私密那一行：线上只有一枚锁、右侧不画配图（下面两行是普通行，用来对照）',
  note: '⚠ <b>这条不是装饰是闸</b>：现网列表那一趟锁着时是按白名单重建那几行的（九栏里没有图），'
    + '所以配图天然漏不出去；锁这一枚是客户端按分类名判的。'
    + '一张照片里可能正写着密码、脸、票据——没解锁先把内容露一角，与正文那把闸不同罪同等。',
})
const E = screen({
  lang: 'en', groupBy: true, rows: SAMPLE,
  cap: 'EN｜同一套皮、同一批件，只换字（来源与标题两档都要看放不放得下）',
  note: '来源这一档从上一版的 <code>--fs-tiny</code>＝' + T.fsTiny + ' 压到 <code>--fs-micro</code>＝' + T.fsMicro +
    '（＝' + R(parseFloat(T.fsMicro)) + 'px），与标题 <code>--fs-body</code>＝' + T.fsBody + '（＝' + R(parseFloat(T.fsBody)) + 'px）拉开一档；'
    + '英文那几串最长的是 <b>' + Object.keys(SRC).map((k) => srcLabel(en, k))
      .sort((a, b) => b.length - a.length)[0] + '</b>；标题可写宽实测 216px（量法 <code>docs/工具/验-英文挤不挤.js</code>），'
    + '灌 78 字符之后右端配图与轨的落点一个数没动 ⇒ 省略号只吃标题自己。',
})
const F = screen({
  lang: 'zh', groupBy: true, rows: [], empty: true,
  cap: '空态｜一篇都没有（原来卡片那一屏的「还没有生成过卡片」这句从此没有落点）',
  note: '撤掉第二枚 tab 之后，卡片那一屏那句「还没有生成过卡片」在屏上不再有人念——10-17 深夜他一句'
    + '「如果没卡片图，这个位置就完全被标题占满」把那一整块空态撤了，那两枚字典键跟着退（现在屏上没这一句）。',
})

const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<title>列表合一 · 效果图（10-17 第三轮，代码一行没动）</title>
<style>
:root{
  --fs-body:${pxize(T.fsBody)}; --fs-meta:${pxize(T.fsMeta)}; --fs-tiny:${pxize(T.fsTiny)}; --fs-micro:${pxize(T.fsMicro)};
  --r-card:${R(parseFloat(T.rCard))}px; --bg-page:${T.bgPage}; --bg-card:${T.bgCard};
  --plate:${T.plateDock}; --sh-lift:${pxize(T.shLift)}; --sh-drop:${pxize(T.shDrop)}; --sh-row:${pxize(T.shRow)}; --ink:${T.ink};
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#EDEAE3;font-family:-apple-system,"PingFang SC","Helvetica Neue",sans-serif;padding:34px;color:#22252B}
h1{font-size:26px;letter-spacing:-.3px}
.lead{font-size:14px;line-height:1.75;max-width:1240px;margin:10px 0 8px;color:#4A4E57}
.lead b{color:#22252B}
.lead code{background:#E3DFD6;padding:1px 5px;border-radius:4px;font-size:12.5px}
.rules{font-size:12.5px;line-height:1.8;color:#5A5F68;max-width:1240px;margin:0 0 22px}
.rules b{color:#22252B}
.rules code{background:#E3DFD6;padding:1px 5px;border-radius:4px;font-size:11.5px}
.grid{display:flex;flex-wrap:wrap;gap:34px;align-items:flex-start}
.ph{width:400px;min-width:0}
.cap{font-size:13.5px;font-weight:600;line-height:1.5;margin-bottom:9px}
.note{font-size:12px;line-height:1.65;color:#5A5F68;margin-top:9px}
.note b{color:#22252B}
.note code{background:#E3DFD6;padding:1px 5px;border-radius:4px;font-size:11.5px}
img{max-width:100%}
.refimg{display:block;width:100%;height:auto;border-radius:22px;box-shadow:0 16px 34px rgba(20,22,26,.2)}

.phone{width:375px;height:812px;border-radius:38px;overflow:hidden;position:relative;background:var(--bg-page);
  display:flex;flex-direction:column;box-shadow:0 22px 46px rgba(20,22,26,.20),0 0 0 9px #1E2024}
.status{position:absolute;left:0;right:0;top:0;height:34px;display:flex;align-items:center;
  padding:0 20px;font-size:12.5px;font-weight:600;color:#2C2F36;z-index:6}
.status i{width:7px;height:7px;border-radius:50%;background:#2C2F36;opacity:.5;margin-left:4px;display:inline-block}
.status i:first-of-type{margin-left:auto}
.nav{position:absolute;left:0;right:0;top:34px;height:36px;display:flex;align-items:center;justify-content:space-between;
  padding:0 14px;font-size:13px;color:#2C2F36;z-index:6}
.nav .pill{font-style:normal;font-size:11px;border:1px solid rgba(44,47,54,.22);border-radius:999px;padding:2px 10px;
  background:rgba(255,255,255,.55);letter-spacing:.5px}
/* 上半那一段：现网 .head 高 ${G.head}px；参考图量出来那一段是屏高 ${REF_R.bandPct}%（＝${Math.round(812 * REF_R.bandPct / 100)}px），
   两档差 ${Math.round(812 * REF_R.bandPct / 100) - G.head}px——这一档要不要抬是待拍 D49，甲乙两屏我照参考图那一档画的 */
.bg{position:relative;overflow:hidden;flex:none}
.bg::before{content:"";position:absolute;inset:0;background:
  linear-gradient(160deg,#DCC9BE 0%,#C9B6AE 34%,#BFCBC6 68%,#AFC0BC 100%)}
.bg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,0) 40%,rgba(255,255,255,.34) 100%)}
.brand{position:absolute;left:${R(parseFloat(T.sp4))}px;top:${70 + G.h1Top}px;width:${G.brandW}px;opacity:${G.brandOp};z-index:2}
.stats{position:absolute;right:${G.statRight}px;top:${70 + G.statTop}px;z-index:2;display:flex}
.stat{width:52px;text-align:center}
.stat b{display:block;font-family:"WtsjMind","Poppins",-apple-system,sans-serif;font-weight:100;
  font-size:${G.statN}px;line-height:.86;color:#2C2F36}
.stat span{display:block;margin-top:5px;padding-left:2px;font-size:var(--fs-micro);font-weight:700;
  letter-spacing:2px;color:rgba(44,47,54,.72)}
.tools{position:absolute;left:${G.toolsX}px;right:${G.toolsX}px;bottom:12px;height:${G.toolsH}px;display:flex;
  align-items:center;justify-content:flex-end;z-index:3}
.glass{width:19px;height:19px;border-radius:50%;border:1.6px solid rgba(44,47,54,.62);position:relative;display:block;flex:none}
.glass::after{content:"";position:absolute;right:-5px;bottom:-3px;width:7px;height:1.8px;background:rgba(44,47,54,.62);
  transform:rotate(45deg)}
.tag{position:absolute;left:${R(parseFloat(T.sp4))}px;bottom:${G.sheetLift + 10}px;z-index:3;font-size:9px;color:rgba(44,47,54,.55)}
.sheet{position:relative;z-index:4;flex:1;min-height:0;margin-top:-${G.sheetLift}px;background:var(--bg-card);
  border-radius:var(--r-card) var(--r-card) 0 0;box-shadow:var(--sh-lift);padding:0 ${G.sheetPad}px;overflow:hidden}
/* 面板顶那一行（他 10-17：搜索下移到面板右上角，左边补一枚分类管理）*/
.phead{display:flex;align-items:center;justify-content:space-between;height:38px;padding:4px 2px 0}
.ic-grid{width:16px;height:16px;display:grid;grid-template:1fr 1fr/1fr 1fr;gap:3.5px;flex:none}
.ic-grid b{background:rgba(44,47,54,.62);border-radius:2px;display:block}
.vtabs{display:flex;gap:${G.vtabGap}px;padding:11px ${G.vtabPadX}px 0;font-size:var(--fs-meta);font-weight:600;
  color:rgba(44,47,54,.72);position:relative}
.vtabs span{position:relative;padding-bottom:7px}
.vtabs .on{font-weight:700;color:#2C2F36}
.vtabs .on::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;border-radius:1px;background:${TIPDOT}}
.vtabs em{margin-left:auto;font-style:normal;font-size:var(--fs-meta);color:rgba(44,47,54,.72)}
/* 分类行 10-16 三样一起撤（他原话「分类名字，不要加粗，不要纯黑，下划线也一样」）：
   这一行**没有选中态标记**，稿子里 .on 与其余几枚同一个数——不是漏画，是现网就这样。 */
.cats{display:flex;gap:${G.catGap}px;padding:6px 2px 4px;font-size:var(--fs-meta);color:rgba(44,47,54,.72);
  white-space:nowrap;overflow:hidden}
.cats span{padding-bottom:5px}
/* 分类行压一档（他 10-17：「分类字体也要小一点」）——**只压合一之后那一屏**：
   现网对照那一格是尺子，仍吃 --fs-meta 24rpx，跟着改就量不出"改之前长什么样"了。 */
.cats.sm{font-size:var(--fs-tiny)}
.list{padding:2px 0 ${G.xlistPadB}px}
/* 现网那一行：.xrow 内缩 0、上 ${G.xrowPadT} 下 10；.xd 宽 ${G.xdW}px（点 ${G.dot}px ＋ MM/DD）；标题 14／摘要 12×1.62 三行 */
.lrow{display:flex;align-items:flex-start;gap:10px;padding:${G.xrowPadT}px 0 10px}
.xd{width:${G.xdW}px;flex:none;display:flex;flex-direction:column;align-items:center;gap:4.5px;padding-top:4px}
.dot{width:${G.dot}px;height:${G.dot}px;border-radius:50%;flex:none}
.xd span{font-family:"WtsjMind","Poppins",sans-serif;font-weight:100;font-size:var(--fs-meta);line-height:1;
  color:rgba(44,47,54,.72)}
.xm{flex:1;min-width:0}
.lt{font-size:var(--fs-body);font-weight:600;line-height:1.35;color:rgba(35,37,44,.9);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.ls{margin-top:4px;font-size:var(--fs-meta);line-height:1.62;color:rgba(35,37,44,.7);display:-webkit-box;
  -webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.lm{margin-top:4px;font-size:var(--fs-meta);font-weight:600;color:${G.moreColor}}
/* 合一之后那一行：一块浅面（不描边），左槽 ＋ 来源／标题／标识轨 ＋ 右端配图 */
.grp{display:flex;gap:10px;align-items:flex-start}
.gut{width:${REF_R.gutW}px;flex:none;text-align:center;padding-top:10px;font-family:"WtsjMind","Poppins",sans-serif}
.gut b{display:block;font-weight:100;font-size:26px;line-height:1;color:rgba(44,47,54,.9)}
.gut span{display:block;font-size:8.5px;font-weight:700;letter-spacing:1.4px;color:rgba(44,47,54,.6);margin-top:3px}
.gut i{display:block;width:14px;height:2px;border-radius:1px;background:rgba(44,47,54,.35);margin:6px auto 0}
.gbody{flex:1;min-width:0}
.row{display:flex;align-items:center;gap:10px;margin:0 0 ${REF_R.cardGap}px;padding:10px 12px;border-radius:14px;
  min-width:0;background:var(--plate);box-shadow:var(--sh-row)}
.rd{width:${G.xdW}px;flex:none;display:flex;flex-direction:column;align-items:center;gap:4.5px}
.rd span{font-family:"WtsjMind","Poppins",sans-serif;font-weight:100;font-size:var(--fs-meta);line-height:1;
  color:rgba(44,47,54,.72)}
.mid{flex:1;min-width:0}
.src{font-size:var(--fs-micro);line-height:1.25;letter-spacing:.5px;color:rgba(35,37,44,.68);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.tt{font-size:var(--fs-body);font-weight:600;line-height:1.35;color:rgba(35,37,44,.9);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.rail{display:flex;align-items:center;gap:7px;margin-top:6px;height:12px}
.rail .ln{flex:1;min-width:0;height:2px;border-radius:1px;background:rgba(44,47,54,.16)}
.mk{width:12px;height:12px;flex:none;display:inline-block;position:relative;color:rgba(35,37,44,.62)}
.mk.star{background:currentColor;clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 71%,21% 91%,32% 57%,2% 35%,39% 35%)}
.mk.heart{background:currentColor;clip-path:polygon(50% 88%,8% 52%,0% 32%,12% 14%,30% 14%,50% 30%,70% 14%,88% 14%,100% 32%,92% 52%)}
.mk.card{border:1.4px solid currentColor;border-radius:2.5px;height:11px}
.mk.card::after{content:"";position:absolute;left:1.5px;right:1.5px;bottom:1.5px;height:2.6px;background:currentColor}
.mk.lock{width:9px;height:7px;border:1.4px solid currentColor;border-radius:1.6px;top:2px}
.mk.lock::before{content:"";position:absolute;left:50%;top:-4.2px;transform:translateX(-50%);width:5px;height:5px;
  border:1.4px solid currentColor;border-bottom:none;border-radius:3px 3px 0 0}
.rail.cl .mk.star{color:${TIPDOT}}
.rail.cl .mk.card{color:rgba(35,37,44,.62)}
.rail.cl .mk.heart{color:#C0504D}
.rail.cl .mk.lock{color:rgba(35,37,44,.85)}
.th{width:${REF_R.thumb}px;height:${REF_R.thumb}px;flex:none;border-radius:12px}
.empty{padding:60px 0;text-align:center;font-size:var(--fs-meta);color:rgba(44,47,54,.5)}
.tabbar{position:absolute;left:0;right:0;bottom:0;height:46px;display:flex;align-items:center;justify-content:space-around;
  background:rgba(255,255,255,.72);border-top:1px solid rgba(44,47,54,.06);z-index:5}
.tabbar i{width:19px;height:19px;border-radius:6px;background:rgba(44,47,54,.18)}
.tabbar i.on{background:#23252C}
</style></head><body>
<h1>列表合一 · 效果图（第三轮：来源压到最小一档 ＋ 分类再压一档；顺带修好"字号根本没上屏"那一刀）</h1>
<div class="lead">
  <b>当前真机跑的是 2.2.9（他 10-17 自己点的提审），这一页的代码一行没动——下面全是稿。</b><br>
  他 10-17 第二轮这几句：「我倾向<b>乙</b>，但还要继续优化」「标题上面还要加上<b>来源</b>，小字，例如来自公众号、截图之类的，
  提醒用户信息源」「标题下方，参考图有一条线，<b>可以利用这条线做一些标识</b>：分享过的线上加一个小星星，私密的加个小锁，
  线上的 icon 可以很小，但辨识度要高，一眼就知道」「未来很多场景都可以叠加，例如分享后被朋友转存的加个 ♥ 代表被收藏」
  「<b>搜索的 icon 下移到面板右上角</b>」「<b>左边加一个分类管理 icon</b>，点击可以直接跳转修改分类」。<br>
  他 10-17 第三轮这一句：「<b>来源和笔记标题要明显区分，现在来源的字体太大，要压缩成小字，分类字体也要小一点</b>」
  ⇒ 来源 <code>--fs-tiny</code> 21rpx → <code>--fs-micro</code> 18rpx（9px），标题仍 <code>--fs-body</code> 28rpx（14px），
  两档比从 1 : 1.33 拉到 <b>1 : 1.56</b>；来源同时把颜色压深一档（<code>rgba(35,37,44,.55)</code> → <code>.68</code>）
  免得字一小的对比度跟着掉下去；分类行 <code>--fs-meta</code> 24rpx → <code>--fs-tiny</code> 21rpx，
  <b>只压合一之后那几屏</b>——现网对照那一格是尺子，仍留 24rpx。<br>
  口径：字号／圆角／底色／阴影／行内缩／位图那两档全部从 <code>app.wxss</code>＋<code>pages/index/index.wxss</code> 现读，
  屏上每句中文从 <code>utils/i18n.js</code> 现读，<b>来源那六串从 <code>pages/index/index.js</code> 的
  <code>SOURCE_TYPE_KEYS</code> 现读</b>，参考图那几段比例是从他给的 JPG 量的（<code>docs/工具/量-参考图-比例.py</code>）。
  标题、摘要、来源与标识是<b>示意数据</b>，照片位用 CSS 渐变占位、不放真人图。
</div>
<div class="rules">
  <b>这一轮不再画甲</b>（他倾向乙）；上一版那张带甲的 PNG 在提交 <code>8a909cd</code> 里，要回头看随时抽得出来。<br>
  三处先说明，免得当成我漏画或我替他定了：
  ① 分类行那几枚<b>没有选中态标记</b>（10-16 他一句「不要加粗，不要纯黑，下划线也一样」撤掉的，现网就是这样）；
  分类名<b>一律标"示意"</b>——真机上除"全部"那一枚，其余每枚都是用户自己起的名字。
  ② 那条<b>线</b>在参考图里是一条约 8px 厚的浅灰骨架条（占位用的），我把它收成 2px 一条细轨、把标识挂在轨前头——
  <b>这一改是我的手法，他没点到粗细</b>，两档都能画，看屏挑。
  ③ 标识<b>配色</b>：主稿（乙·优化版）全用同一支墨，图例那一格并排画了彩色一版（★ 小黄／♥ 暗红／▢ 与 🔒 墨）——
  <b>单色还是彩色等他挑，我不替他定</b>。<br>
  一处<b>没落点</b>要他给话：「返回」那一枚原来挂在被撤掉的那行右端，现在面板右上角给了搜索、左上给了分类管理 ⇒
  它是搬去左半边、还是就地撤掉？（合一之后这一屏不再往下一层，回第一屏靠底栏那枚 tab。）<br>
  <b>上一版那张 PNG 的字号是假的，这一版才是真的</b>：生成器把令牌原样塞进 <code>:root</code>（<code>--fs-body:28rpx</code>），
  而 rpx 在 Chrome 不是合法长度 ⇒ <code>font-size:var(--fs-body)</code> 摊开就整条静默作废、退回继承的 16px，
  两条 <code>box-shadow</code> 同理变 none。所以上一版里来源／标题／分类／日期<b>其实是同一个大小</b>，
  您这句"来源的字体太大"是完全准确的实测，不是我改慢了一档。
  现在令牌进 CSS 前一律换成 px，并加了两道闸：出 HTML 前扫 <code>&lt;style&gt;</code> 的声明、还有一个 rpx 就抛；
  探针 <code>docs/工具/验-字号档位与对比.js</code> 逐屏比"令牌值／2 是否等于屏上算出来的 px"（九屏全过）。
</div>
<div class="grid">
  <div class="ph"><div class="cap">参考图（他给的那张，原样贴在这里）</div>
    <img class="refimg" src="${REF}" alt="参考图">
    <div class="note">我照的是它的<b>结构与比例</b>：上半照片贯穿到屏高 ${REF_R.bandPct}%，大字页名在左上、右上角一列数字、
    一枚裸搜索 icon 落在照片段右下（<b>这一枚他 10-17 改口要搬进面板右上角，所以稿子里照片段右下已经空着</b>）；
    下半一张圆角大玻璃板往上盖住照片 ${G.sheetLift}px，板内一天一组、一组一行一枚浅面卡、卡左文右图。<br>
    换掉的"我们的元素"：色板走现网令牌（纸底 ${T.bgPage}／卡底 ${T.bgCard}／浅面 ${T.plateDock}）、
    页名换成首屏那枚书法位图（宽 ${G.brandW}px、不透明度 ${G.brandOp}，与真机同一张同一个数）、
    数字那档吃内嵌细体 <code>WtsjMind</code> 100 与 ${G.statN}px、圆角吃 ${T.rCard}、卡影吃从全站那本尊分出来的 <code>--sh-row</code>（＝${T.shRow}，比 <code>--sh-drop</code> 薄一档，站长 10-17「阴影太厚」那一刀）。<br>
    <b>没照抄的两处</b>：① 它那张卡有"时间＋标题"两行，他那句只留标题一行（今天又补了一行来源在它上面）；
    ② 它左槽那个大数字下面有一条短杠，我理解成"今天"那一档才画，只标在一组上——<b>这条是我的理解，他没说过</b>。</div></div>
  ${LIVE}${B}${LEG}${SRC6}${C}${D}${E}${F}
</div>
</body></html>`

fs.mkdirSync(DIR, { recursive: true })
// 守卫：<style> 的**声明**里出现 rpx 就是"这条声明在 Chrome 里根本没生效"，画出来是继承值、图上看不出来。
// 注释里的 rpx 不算（那些是写给他人看的口径话），所以先把 /* */ 整段摘掉再扫。
const STYLE = /<style>([\s\S]*?)<\/style>/.exec(html)[1]
const DECL = STYLE.replace(/\/\*[\s\S]*?\*\//g, '')
const STRAY = [...new Set((DECL.match(/-?[\d.]+rpx/g) || []))]
if (STRAY.length) throw new Error('CSS 里还有 ' + STRAY.length + ' 种 rpx 值没换成 px（' + STRAY.join(' ') +
  '）——Chrome 不认 rpx，那几条声明会静默作废、量出来全是继承的 16px')
// 位图路径是从 HTML 那一份的目录起算的，写错一级 Chrome 只会画一枚碎图标、守卫那道量不出来（10-17 就这么交过一次）
if (!fs.existsSync(path.resolve(DIR, BRAND))) throw new Error('书法位图按这个相对路径找不到：' + BRAND)
if (!fs.existsSync(path.join(DIR, REF))) throw new Error('参考图不在稿子旁边：' + REF)
fs.writeFileSync(HTML, html)
console.log('✓ HTML 已出 ' + path.relative(ROOT, HTML))
console.log('  令牌现读：字号 ' + [T.fsBody, T.fsMeta, T.fsTiny, T.fsMicro].join('/') + '　圆角 ' + T.rCard +
  '　纸底 ' + T.bgPage + '　卡底 ' + T.bgCard + '　浅面 ' + T.plateDock)
console.log('  几何现读：head ' + G.head + '　位图 ' + G.brandW + '@' + G.brandOp + '　数字 ' + G.statN +
  '　.xd 宽 ' + G.xdW + '　点 ' + G.dot + '　卡顶上抬 ' + G.sheetLift + '　分类行距 ' + G.catGap)
console.log('  来源现读（' + Object.keys(SRC).length + ' 支）：' + Object.keys(SRC).map((k) => srcLabel(zh, k)).join('／'))
console.log('  参考图量出：照片段 ' + REF_R.bandPct + '%　卡间距 ' + REF_R.cardGap + '　缩略图 ' + REF_R.thumb +
  '　左槽 ' + REF_R.gutW + '　卡左界 ' + REF_R.cardLeft)
execFileSync('node', [path.join(ROOT, 'docs/工具/出-效果图按页宽.js'), path.relative(ROOT, HTML)], { stdio: 'inherit' })
