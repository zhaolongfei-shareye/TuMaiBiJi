// 生成「列表合一」这一刀的效果图。**屏上每一句中文、每一枚色、每一档字号、每一段几何都不是手抄的**：
// 字从 miniprogram/utils/i18n.js 现读，色／字号／圆角／阴影从 miniprogram/app.wxss 的令牌块现读，
// 行的几何从 pages/index/index.wxss 现读，参考图那几段比例从站长给的那张 JPG 量出来（量法见 docs/工具/量-参考图-比例.py）。
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

// ── 令牌：从 app.wxss 现读，读不到就抛（不许我给一个"看着差不多"的数）
const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/app.wxss'), 'utf8')
const idxwxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxss'), 'utf8')
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
function rpxOf(src, sel, prop) { // 只要那一个 rpx 数
  const v = rule(src, sel, prop)
  const m = /(-?[\d.]+)rpx/.exec(v)
  if (!m) throw new Error(`${sel} 的 ${prop} 不是 rpx：${v}`)
  return +m[1]
}
function rpxs(src, sel, prop) { // 简写声明里那几档 rpx 全取出来（padding: 24rpx 0 20rpx 这种）
  const parts = rule(src, sel, prop).split(/\s+/)
  return parts.map((v) => {
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
  rCard: tok('r-card'), sp3: tok('sp-3'), sp4: tok('sp-4'),
  bgPage: tok('bg-page'), bgCard: tok('bg-card'),
  plateDock: /--glass-plate-dock:\s*([^;]+);/.exec(INK)[1].trim(),
  chromeDock: /--glass-chrome-dock:\s*([^;]+);/.exec(INK)[1].trim(),
  shLift: tok('sh-lift'), shDrop: tok('sh-drop'),
  ink: /--slide-ink:\s*([^;]+);/.exec(INK)[1].trim(),
}
const TIPDOT = palette.TIP_DOT

// 现网这一屏的真实几何（一格一格从 index.wxss 读，改一处稿子就得跟着重出，不许手写）
const G = {
  head: R(rpxOf(idxwxss, '.head', 'height')),
  h1Top: R(rpxOf(idxwxss, '.h1', 'top')),
  h1Size: R(rpxOf(idxwxss, '.h1-txt', 'font-size')),
  brandW: R(rpxOf(wxss, '.brand-title', 'width')),
  brandOp: rule(wxss, '.brand-title', 'opacity'),
  statRight: R(rpxOf(idxwxss, '.stats', 'right')),
  statTop: R(rpxOf(idxwxss, '.stats', 'top')),
  statN: R(rpxOf(idxwxss, '.stat .n', 'font-size')),
  toolsTop: R(rpxOf(idxwxss, '.tools', 'top')),
  vtabGap: R(rpxOf(idxwxss, '.vtabs', 'gap')),
  vtabPadX: R(rpxs(idxwxss, '.vtabs', 'padding')[1]),
  xrowPadT: R(rpxs(idxwxss, '.xrow', 'padding')[0]),
  xdW: R(rpxOf(idxwxss, '.xd', 'width')),
  dot: R(rpxOf(idxwxss, '.xd-dot', 'width')),
  sheetLift: R(-rpxOf(idxwxss, '.sheet', 'margin-top')),
  sheetPad: R(rpxs(idxwxss, '.sheet', 'padding')[1]),
  toolsX: R(rpxOf(idxwxss, '.tools', 'left')),
  toolsH: R(rpxOf(idxwxss, '.tools', 'height')),
  catGap: R(rpxOf(idxwxss, '.cat-chips', 'gap')),
  xlistPadB: R(rpxOf(idxwxss, '.xlist', 'padding-bottom')),
  moreColor: rule(idxwxss, '.x-more', 'color'),
}
// 参考图量出来的那几档（929px 宽 ⇒ 假定 CSS 375，scale 2.4773；台阶法，量法在 py 脚本头里）
const REF_R = { bandPct: 54.2, cardGap: 8.5, thumb: 47, gutW: 44, cardLeft: 97 }

// ── 屏上每句话：按字典键取，键名缺了就抛
function need(dict, k) {
  if (typeof dict[k] !== 'string' || !dict[k]) throw new Error(`字典里没有键 ${k}`)
  return dict[k]
}
const K = ['notesHeading', 'statNotes', 'allCategories', 'back', 'search', 'noNotes', 'navShare', 'tabList',
  'searchPh', 'loading', 'showMore']
K.forEach((k) => { need(zh, k); need(en, k) })

// 示意数据：标题与摘要是编的（真机上是用户自己的笔记），图位是 CSS 渐变——这一点在图例里写死。
// 中英各一份：英文那一屏要看的正是"换了语言放不放得下"，拿中文标题去量英文那一屏就是自欺。
// ⚠ 英文这几条是**压着可写宽挑的**（行内可写宽实测见下面 EN 那一屏的注）：真机上超过那一档
//    就吃省略号（现网 .x-t 本来就有 text-overflow:ellipsis），所以稿子里不必故意放一条被切半截的。
//    "被切的那一档会不会挤掉小标"这件事不靠稿子看，靠 docs/工具/验-英文挤不挤 那把一次性探针量。
const SAMPLE = [
  { t: '海港这一段值得走两回', te: 'Two laps round the harbour', d: '10/16', day: 14,
    s: '从码头那一段往上走，前半是防波堤，风大；拐进第二条街开始有台阶，台阶上面那排房子是这一带最好看的一处。', img: ['#C9D7D2', '#8FA9A2'], card: true },
  { t: '山里那一格信号', te: 'One bar up in the hills', d: '10/16', day: 14,
    s: '观景台往北三百米就没信号了，导航提前把离线包装好。', img: ['#D8CFC4', '#A99C8C'], card: true },
  { t: '缆车上那十分钟', te: 'Cable car, ten minutes', d: '10/16', day: 14,
    s: '末班 17:40，排队二十分钟，往上那趟看得到整个湾。', img: null, card: false },
  { t: '日落观景点要早到', te: 'Get to the view early', d: '10/15', day: 14,
    s: '六点以后停车位全满，栈道只有单边有灯。', img: ['#E3D3CE', '#B79A93'], card: false },
  { t: '灯塔那条路风大', te: 'Lighthouse road is windy', d: '10/15', day: 15,
    s: '风大的时候那段栏杆会晃，别靠外沿。', img: ['#CFD6E0', '#93A0B4'], card: true },
]
const PRIV = { t: '这一篇设了密码', te: 'This one is locked', d: '10/15', day: 15, s: '', img: null, card: false, priv: true }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const px = (v) => v + 'px'

// ── 行（合一之后）：左槽（甲＝日期／乙＝空）＋ 标题 ＋ 右端配图 ＋ 卡片小标
function mergedRow(r, opt, lang) {
  const title = lang === 'en' ? r.te : r.t
  const thumb = r.img
    ? `<div class="th" style="background:linear-gradient(135deg,${r.img[0]},${r.img[1]})">${r.card ? '<i class="cmark"></i>' : ''}</div>`
    : '' // 没图就什么都不画（他原话"没有不显示"）——不给它留一个虚线空框，那等于凭空多一句"这里本该有图"
  return `<div class="row">
      ${opt.groupBy ? '' : `<div class="rd"><b class="dot" style="background:${TIPDOT}"></b><span>${esc(r.d)}</span></div>`}
      <div class="tt">${r.priv ? '<b class="lock"></b>' : ''}${esc(title)}</div>
      ${r.card && !r.img ? `<div class="slot"><i class="cmark solo"></i></div>` : ''}
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

// ── 现网对照那一屏：两枚 tab + 分类行 + 日期列 + 标题 + 三行摘要 +「显示更多」
function liveList(lang) {
  const D = lang === 'en' ? en : zh
  return SAMPLE.map((r) => `<div class="lrow">
      <div class="xd"><b class="dot" style="background:${TIPDOT}"></b><span>${esc(r.d)}</span></div>
      <div class="xm"><div class="lt">${esc(lang === 'en' ? r.te : r.t)}</div>
        <div class="ls">${esc(r.s)}</div>
        <div class="lm">${esc(D.showMore)}</div></div>
    </div>`).join('')
}

// ── 一屏
function screen(opt) {
  const D = opt.lang === 'en' ? en : zh
  const band = opt.live ? 70 + G.head : Math.round(812 * REF_R.bandPct / 100)
  const body = opt.live
    ? `<div class="vtabs"><span class="on">${esc(D.tabList)}</span><span>${esc(D.navShare)}</span><em>${esc(D.back)}</em></div>
       <div class="cats">${catRow(D)}</div>
       <div class="list">${liveList(opt.lang)}</div>`
    : `<div class="cats">${catRow(D)}</div>
       <div class="list">${opt.empty ? `<div class="empty">${esc(D.noNotes)}</div>` : mergedList(opt)}</div>`
  return `<div class="ph">
  <div class="cap">${opt.cap}</div>
  <div class="phone">
    <div class="status">9:41<i></i><i></i><i></i></div>
    <div class="nav"><span>${esc(D.notesHeading)}</span><em class="pill">•••&nbsp;&nbsp;◎</em></div>
    <div class="bg" style="height:${band}px">
      <img class="h1 brand" src="${BRAND}" alt="${esc(D.notesHeading)}">
      <div class="stats"><div class="stat"><b>30</b><span>${esc(D.statNotes)}</span></div></div>
      <div class="tools"><i class="glass"></i></div>
      <div class="tag">照片位＝示意（不放真人图）</div>
    </div>
    <div class="sheet">${body}</div>
    <div class="tabbar"><i></i><i class="on"></i><i></i></div>
  </div>
  <div class="note">${opt.note}</div>
</div>`
}
function catRow(D) {
  // 现网这一行只有「全部」那一枚是字典里的固定字，其余每一枚都是用户自己起的分类名（服务端给的），
  // 所以稿子里三枚一律标"示意"。`palette.UNCATEGORIZED`（墨黑）是**配色常量**，不是屏上一枚分类名——
  // 10-17 第一版我把它当分类名画上去了，那是我自己读错的，不是现网的样子。
  return `<span class="on">${esc(D.allCategories)}</span><span>示意 A</span><span>示意 B</span><span>示意 C</span>`
}

const LIVE = screen({
  lang: 'zh', live: true,
  cap: '⓪ 现网对照｜真机现在跑的这一版（2.2.9）：两枚 tab ＋ 分类行 ＋ 日期列 ＋ 标题 ＋ 三行摘要 ＋「显示更多」',
  note: '画这一屏只为给他一把尺：<b>合一之后少掉的就是这里那几样</b>——第二枚 tab、摘要那三行、「显示更多」、'
    + '以及卡片那一屏的两列格子。上半那一段（书法位图＋右上角一列数字＋一枚裸搜索 icon＋圆角卡往上盖）<b>一个字没动，也不该动</b>。',
})
const A = screen({
  lang: 'zh', groupBy: false, rows: SAMPLE,
  cap: '甲｜合一之后，日期仍留在每一行左边（现网 .xd 那一列的手法不动）',
  note: '改动只有三件：① 撤掉「笔记列表／笔记卡片」那两枚 tab（只剩一列）；② 行里撤摘要与「显示更多」，只留标题；'
    + '③ 行右端补配图（有则画、没有不画）＋ 生成过卡片的小标。<b>分类行与搜索没撤</b>——他那句里没点到这两样。',
})
const B = screen({
  lang: 'zh', groupBy: true, rows: SAMPLE,
  cap: '乙｜合一之后，照参考图按天分组（左槽一个大数字，管下面几条）',
  note: '左槽从"每行一个日期"变成"一天一个大数字"（参考图量出来那一槽宽 ' + REF_R.gutW + 'css、卡片左界 '
    + REF_R.cardLeft + 'css）。行里就只剩标题＋配图＋小标。<b>这是结构改动，不是样式改动，甲乙得挑一个。</b>',
})
const C = screen({
  lang: 'zh', groupBy: false,
  rows: [{ ...SAMPLE[2], card: true }, SAMPLE[2], SAMPLE[0], { ...SAMPLE[4], card: false }],
  cap: '无配图那一态：右侧不画，标题吃满整行（他原话"没有不显示"）',
  note: '四行按"有没有图 × 有没有出过卡片"排：① 没图＋出过卡 ⇒ 小标钉在行最右端，与有图那几行的配图同一列；'
    + '② 没图＋没出过卡 ⇒ 光一行标题；③ 有图＋出过卡 ⇒ 图右下角一枚小标；④ 有图＋没出过卡 ⇒ 只有图。'
    + '<b>①那一处落点是我定的（让"出过卡"这一枚永远落在同一个位置，扫一眼对得齐），标出来等他看</b>：'
    + '另一种画法是让标紧跟在标题末尾，标题短它就往左跑。',
})
const D = screen({
  lang: 'zh', groupBy: false, rows: [PRIV, SAMPLE[0], SAMPLE[2]],
  cap: '私密那一行：不画配图、只留一枚锁（下面两行是普通行，用来对照）',
  note: '⚠ <b>这条不是装饰是闸</b>：现网服务端锁着时不发正文与摘要，列表那一趟也不带解锁凭证。'
    + '要是把配图缩略图画出来，就等于没解锁先把内容露一角（图里可能正写着密码、脸、票据）。所以私密那一行右侧一律不画。',
})
const E = screen({
  lang: 'en', groupBy: false, rows: SAMPLE,
  cap: 'EN｜同一套皮、同一批件，只换字（英文那侧标题更长，看放不放得下）',
  note: '这一屏存在的理由就是当场量"英文会不会把小标挤掉"：标题吃省略号那一档，小标与配图 flex:none。',
})
const F = screen({
  lang: 'zh', groupBy: false, rows: [], empty: true,
  cap: '空态｜一篇都没有（原来卡片那一屏的「还没有生成过卡片」这句从此没有落点）',
  note: `撤掉第二枚 tab 之后，字典里 <code>noCards</code>＝「${esc(zh.noCards)}」这一句在屏上不再有人念——留着还是删，等他一句。`,
})

const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<title>列表合一 · 效果图（10-17，代码一行没动）</title>
<style>
:root{
  --fs-body:${T.fsBody}; --fs-meta:${T.fsMeta}; --fs-tiny:${T.fsTiny}; --fs-micro:${T.fsMicro};
  --r-card:${R(parseFloat(T.rCard))}px; --bg-page:${T.bgPage}; --bg-card:${T.bgCard};
  --plate:${T.plateDock}; --chrome:${T.chromeDock}; --sh-lift:${T.shLift}; --sh-drop:${T.shDrop}; --ink:${T.ink};
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#EDEAE3;font-family:-apple-system,"PingFang SC","Helvetica Neue",sans-serif;padding:34px;color:#22252B}
h1{font-size:26px;letter-spacing:-.3px}
.lead{font-size:14px;line-height:1.75;max-width:1240px;margin:10px 0 8px;color:#4A4E57}
.lead b{color:#22252B}
.lead code{background:#E3DFD6;padding:1px 5px;border-radius:4px;font-size:12.5px}
.rules{font-size:12.5px;line-height:1.8;color:#5A5F68;max-width:1240px;margin:0 0 22px}
.grid{display:flex;flex-wrap:wrap;gap:34px;align-items:flex-start}
.ph{width:400px;min-width:0}
.cap{font-size:13.5px;font-weight:600;line-height:1.5;margin-bottom:9px}
.note{font-size:12px;line-height:1.65;color:#5A5F68;margin-top:9px}
.note b{color:#22252B}
.note code{background:#E3DFD6;padding:1px 5px;border-radius:4px;font-size:11.5px}
img{max-width:100%}
.refimg{display:block;width:100%;height:auto;border-radius:22px;box-shadow:0 16px 34px rgba(20,22,26,.2)}

.phone{width:375px;height:812px;border-radius:38px;overflow:hidden;position:relative;background:var(--bg-page);
  display:flex;flex-direction:column;
  box-shadow:0 22px 46px rgba(20,22,26,.20),0 0 0 9px #1E2024}
.status{position:absolute;left:0;right:0;top:0;height:34px;display:flex;align-items:center;
  padding:0 20px;font-size:12.5px;font-weight:600;color:#2C2F36;z-index:6}
.status i{width:7px;height:7px;border-radius:50%;background:#2C2F36;opacity:.5;margin-left:4px;display:inline-block}
.status i:first-of-type{margin-left:auto}
.nav{position:absolute;left:0;right:0;top:34px;height:36px;display:flex;align-items:center;justify-content:space-between;
  padding:0 14px;font-size:13px;color:#2C2F36;z-index:6}
.nav .pill{font-style:normal;font-size:11px;border:1px solid rgba(44,47,54,.22);border-radius:999px;padding:2px 10px;
  background:rgba(255,255,255,.55);letter-spacing:.5px}
/* 上半那一段：现网 .head 高 ${G.head}px；参考图量出来那一段是屏高 ${REF_R.bandPct}%（＝${Math.round(812 * REF_R.bandPct / 100)}px）
   两档差 ${Math.round(812 * REF_R.bandPct / 100) - G.head}px，这一档要不要抬，是待拍那一条 */
.bg{position:relative;overflow:hidden;padding:0;flex:none}
.bg::before{content:"";position:absolute;inset:0;background:
  linear-gradient(160deg,#DCC9BE 0%,#C9B6AE 34%,#BFCBC6 68%,#AFC0BC 100%)}
.bg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,0) 40%,rgba(255,255,255,.34) 100%)}
.brand{position:absolute;left:${R(parseFloat(T.sp4))}px;top:${G.h1Top + 70}px;width:${G.brandW}px;opacity:${G.brandOp};z-index:2}
.stats{position:absolute;right:${G.statRight}px;top:${G.statTop + 70}px;z-index:2;display:flex}
.stat{width:52px;text-align:center}
.stat b{display:block;font-family:"WtsjMind","Poppins",-apple-system,sans-serif;font-weight:100;
  font-size:${G.statN}px;line-height:.86;color:#2C2F36}
.stat span{display:block;margin-top:5px;padding-left:2px;font-size:var(--fs-micro);font-weight:700;
  letter-spacing:2px;color:rgba(44,47,54,.72)}
.tools{position:absolute;left:${G.toolsX}px;right:${G.toolsX}px;bottom:12px;height:${G.toolsH}px;display:flex;
  align-items:center;justify-content:flex-end;z-index:3}
.glass{width:19px;height:19px;border-radius:50%;border:1.6px solid rgba(44,47,54,.62);position:relative;display:block}
.glass::after{content:"";position:absolute;right:-5px;bottom:-3px;width:7px;height:1.8px;background:rgba(44,47,54,.62);
  transform:rotate(45deg)}
.tag{position:absolute;left:${R(parseFloat(T.sp4))}px;bottom:${G.sheetLift + 10}px;z-index:3;font-size:9px;color:rgba(44,47,54,.55)}
.sheet{position:relative;z-index:4;flex:1;min-height:0;margin-top:-${G.sheetLift}px;
  background:var(--bg-card);border-radius:var(--r-card) var(--r-card) 0 0;box-shadow:var(--sh-lift);
  padding:0 ${G.sheetPad}px;overflow:hidden}
.vtabs{display:flex;gap:${G.vtabGap}px;padding:11px ${G.vtabPadX}px 0;font-size:var(--fs-meta);font-weight:600;
  color:rgba(44,47,54,.72);position:relative}
.vtabs span{position:relative;padding-bottom:7px}
.vtabs .on{font-weight:700;color:#2C2F36}
.vtabs .on::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;border-radius:1px;background:${TIPDOT}}
.vtabs em{margin-left:auto;font-style:normal;font-size:var(--fs-meta);color:rgba(44,47,54,.72)}
/* 分类行 10-16 三样一起撤（他原话「分类名字，不要加粗，不要纯黑，下划线也一样」）：
   所以这一行**没有选中态标记**，稿子里 .on 与其余几枚同一个数——不是漏画，是现网就这样。 */
.cats{display:flex;gap:${G.catGap}px;padding:10px 2px 4px;font-size:var(--fs-meta);color:rgba(44,47,54,.72);
  white-space:nowrap;overflow:hidden}
.cats span{padding-bottom:5px}
.list{padding:2px 0 ${G.xlistPadB}px}
/* 现网那一行：.xrow 内缩 0、上 12 下 10；.xd 宽 ${G.xdW}px（点 ${G.dot}px ＋ MM/DD）；标题 14／摘要 12×1.62 三行 */
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
/* 合一之后那一行：一块浅面（不描边），左槽＋标题＋右端配图 */
.grp{display:flex;gap:10px;align-items:flex-start}
.gut{width:${REF_R.gutW}px;flex:none;text-align:center;padding-top:8px;font-family:"WtsjMind","Poppins",sans-serif}
.gut b{display:block;font-weight:100;font-size:26px;line-height:1;color:rgba(44,47,54,.9)}
.gut span{display:block;font-size:8.5px;font-weight:700;letter-spacing:1.4px;color:rgba(44,47,54,.6);margin-top:3px}
.gut i{display:block;width:14px;height:2px;border-radius:1px;background:rgba(44,47,54,.35);margin:6px auto 0}
.gbody{flex:1;min-width:0}
.row{display:flex;align-items:center;gap:10px;margin:0 0 ${REF_R.cardGap}px;padding:11px 12px;border-radius:14px;
  min-width:0;background:var(--plate);box-shadow:var(--sh-drop)}
.rd{width:${G.xdW}px;flex:none;display:flex;flex-direction:column;align-items:center;gap:4.5px}
.rd span{font-family:"WtsjMind","Poppins",sans-serif;font-weight:100;font-size:var(--fs-meta);line-height:1;
  color:rgba(44,47,54,.72)}
.tt{flex:1;min-width:0;font-size:var(--fs-body);font-weight:600;line-height:1.35;color:rgba(35,37,44,.9);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lock{position:relative;width:8px;height:6.5px;flex:none;border:1.3px solid rgba(35,37,44,.55);border-radius:1.5px;
  display:inline-block;margin-right:5px;vertical-align:-1px}
.lock::before{content:"";position:absolute;left:50%;top:-4.6px;transform:translateX(-50%);width:5px;height:5px;
  border:1.3px solid rgba(35,37,44,.55);border-bottom:none;border-radius:3px 3px 0 0}
.th{width:${REF_R.thumb}px;height:${REF_R.thumb}px;flex:none;border-radius:12px;position:relative}
.cmark{position:absolute;right:-5px;bottom:-5px;width:18px;height:18px;border-radius:6px;background:#fff;
  box-shadow:0 1px 4px rgba(18,20,26,.22);display:block}
.cmark::after{content:"";position:absolute;left:4px;top:5px;width:10px;height:8px;border:1.3px solid var(--ink);border-radius:2px}
.cmark.solo{position:relative;right:auto;bottom:auto} /* 必须是 relative：static 的话它那个 ::after 会去找更外层的定位祖先，画到屏角上去；那两个偏移是绝对定位那一档用的，这里要撤掉 */
.slot{width:${REF_R.thumb}px;flex:none;display:flex;align-items:center;justify-content:center}
.empty{padding:60px 0;text-align:center;font-size:var(--fs-meta);color:rgba(44,47,54,.5)}
.tabbar{position:absolute;left:0;right:0;bottom:0;height:46px;display:flex;align-items:center;justify-content:space-around;
  background:rgba(255,255,255,.72);border-top:1px solid rgba(44,47,54,.06);z-index:5}
.tabbar i{width:19px;height:19px;border-radius:6px;background:rgba(44,47,54,.18)}
.tabbar i.on{background:#23252C}
</style></head><body>
<h1>列表合一 · 效果图（站长 10-17 那一刀：继续做减法）</h1>
<div class="lead">
  <b>当前真机跑的是 2.2.9（他 10-17 自己点的提审），这一页的代码一行没动——下面七屏全是稿。</b><br>
  他的原话：「合并笔记列表和卡片列表，只展示一个列表，就是围绕笔记本身，然后只显示笔记标题，右侧是笔记的配图，如果有就显示，
  没有不显示，然后，如果生成过卡片就显示小 ICON 提醒，界面风格就与参考图一致，只是更换了我们的元素。」<br>
  口径：字号／圆角／底色／阴影／那枚小黄点／行内缩全部从 <code>app.wxss</code>＋<code>pages/index/index.wxss</code> 现读，
  屏上每句中文从 <code>utils/i18n.js</code> 现读，参考图那几段比例是从他给的那张 JPG 量出来的（量法在
  <code>docs/工具/量-参考图-比例.py</code>）；标题、摘要与分类名是<b>示意数据</b>（真机上是用户自己的笔记），
  照片位用 CSS 渐变占位、不放真人图。
</div>
<div class="rules">
  要他挑的三处（都在图里标了数，我不替他定）：<br>
  ① <b>甲 还是 乙</b>——日期留在每行左边（现网手法），还是照参考图一天一个大数字分组。<br>
  ② <b>上半那一段多高</b>——现网 <code>.head</code> ＝ ${G.head}px（屏高 33%），参考图量出来是屏高 ${REF_R.bandPct}%（＝${Math.round(812 * REF_R.bandPct / 100)}px），
  差 ${Math.round(812 * REF_R.bandPct / 100) - G.head}px。甲乙两屏我照<b>参考图</b>那一档画的（他说"风格与参考图一致"），
  要是这一档不抬，只把行改掉就行。<br>
  ③ <b>每行那一块浅面留不留</b>——参考图的卡面只比板面亮 4 级（很轻），现网令牌 <code>--glass-plate-dock</code>
  ＝ ${T.plateDock} 落在卡底上差 12 级（重一档）。甲乙两屏吃的是现网那一枚。10-01 他打回过"框套框"，
  这一版不描边、只换底色，够不够轻要看屏。<br>
  两处先说明，免得当成我漏画：分类行那几枚<b>没有选中态标记</b>（10-16 他一句「不要加粗，不要纯黑，下划线也一样」撤掉的，
  现网就是这样）；分类名<b>三枚一律标"示意"</b>——真机上除了"全部"那一枚，其余每枚都是用户自己起的名字，
  而 <code>palette</code> 里那枚"墨黑"是配色常量、不是屏上的分类名。
</div>
<div class="grid">
  <div class="ph"><div class="cap">参考图（他给的那张，原样贴在这里）</div>
    <img class="refimg" src="${REF}" alt="参考图">
    <div class="note">我照的是它的<b>结构与比例</b>：上半照片贯穿到屏高 ${REF_R.bandPct}%，大字页名在左上、右上角一列数字、
    一枚裸搜索 icon 落在照片段右下；下半一张圆角大玻璃板往上盖住照片 ${G.sheetLift}px，板内一天一组、一组一行一枚浅面卡、
    卡左文右图。<br>
    换掉的"我们的元素"：色板走现网令牌（纸底 ${T.bgPage}／卡底 ${T.bgCard}／浅面 ${T.plateDock}）、
    页名换成首屏那枚书法位图（<code>assets/title-heading.png</code>，宽 ${G.brandW}px、不透明度 ${G.brandOp}，
    与真机同一张同一个数）、数字那档吃内嵌细体 <code>WtsjMind</code> 100 与 ${G.statN}px、导航条那一句与分类行吃字典里的值、
    圆角与阴影吃 ${T.rCard} 与 ${T.shDrop}。<br>
    <b>没照抄的两处</b>：① 它那张卡有"时间＋标题"两行，他那句只留标题一行；② 它左槽那个大数字下面有一条短杠，
    我理解成"今天"那一档才画，只标在 14 那一组。</div></div>
  ${LIVE}${A}${B}${C}${D}${E}${F}
</div>
</body></html>`

fs.mkdirSync(DIR, { recursive: true })
// 位图路径是从 HTML 那一份的目录起算的，写错一级 Chrome 只会画一枚碎图标、守卫那道量不出来（10-17 就这么交过一次）
if (!fs.existsSync(path.resolve(DIR, BRAND))) throw new Error('书法位图按这个相对路径找不到：' + BRAND)
if (!fs.existsSync(path.join(DIR, REF))) throw new Error('参考图不在稿子旁边：' + REF)
fs.writeFileSync(HTML, html)
console.log('✓ HTML 已出 ' + path.relative(ROOT, HTML))
console.log('  令牌现读：字号 ' + [T.fsBody, T.fsMeta, T.fsTiny, T.fsMicro].join('/') + '　圆角 ' + T.rCard +
  '　纸底 ' + T.bgPage + '　卡底 ' + T.bgCard + '　浅面 ' + T.plateDock)
console.log('  几何现读：head ' + G.head + '　.h1-txt ' + G.h1Size + '　位图 ' + G.brandW + '@' + G.brandOp +
  '　数字 ' + G.statN + '　.xd 宽 ' + G.xdW + '　点 ' + G.dot + '　卡顶上抬 ' + G.sheetLift)
console.log('  参考图量出：照片段 ' + REF_R.bandPct + '%　卡间距 ' + REF_R.cardGap + '　缩略图 ' + REF_R.thumb +
  '　左槽 ' + REF_R.gutW + '　卡左界 ' + REF_R.cardLeft)
execFileSync('node', [path.join(ROOT, 'docs/工具/出-效果图按页宽.js'), path.relative(ROOT, HTML)], { stdio: 'inherit' })
