// 「详情窗抬头」这一屏的方向图（第三稿）。
//
// 站长 10-17 深夜这一条一共四句，把前两稿那个"底色色块"整条撤掉了：
// 「配图改为这种形式，固定高度图片区（如果不配图，这部分空间就隐藏），通栏大图滑动，显示数字，和下方圆点，横杠，
//   大图上方是我们标题，不加背景色了，恢复之前那种标题设计，然后，弱化标签，只需要显示标签名字，灰字，不加底色，不加粗。继续出效果图」
// 附了一张视频号的真截图当参照物。
//
// 参照物是量出来的，不是看着像：那张图 1116×2484，
// 　图区 y 663–1290（高 628）、最左最右两列 100% 非白 ⇒ **通栏、高＝宽×0.5627**（正好 16:9）；
// 　计数那枚 x 948–1064／y 1563–1639 ⇒ 78×51rpx，里面最多的两档色是 (191,191,191) 与 (255,255,255) ⇒ **浅灰实底压白字**；
// 　指示器那一排 y 1704–1719：四段 x 502-518／527-542／552-589／598-614 ⇒ 三枚 11rpx 圆点（浅灰 228~232）
// 　＋当前那枚 **25×11rpx 的横杠（深色 25,25,25）**，间距 6rpx。这三档就是"圆点，横杠"那三个字指的东西。
// 换算成我们的窗：窗内通栏 702rpx ⇒ 图区高 395rpx。
//
// 屏上每一句中文与每一档字号都不是手抄的：字从 miniprogram/utils/i18n.js 现读，令牌从 app.wxss 现读，
// 窗体几何与标题／标签／摘要那几排的数从 pages/index/index.wxss 现读（**标题就是现网那一份，没改**）。
// 只有图区高、计数那枚、指示器那一排是新的——它们没有现网出处，数全部来自上面那张参照图的实测，
// 出处与算法写在这一段里，别当成我随手挑的。
// rpx 写进 Chrome 会整条声明静默作废，所以最后还有一道渲染端读回：量的是画上去的像素，不是源码里的字面。
//
// 跑法：node docs/工具/出-详情窗抬头色块效果图.js
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '../..')
const DIR = path.join(ROOT, 'docs/design/10-18详情窗抬头色块')
const HTML = path.join(DIR, '详情窗抬头色块-方向图.html')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const i18n = require(path.join(ROOT, 'miniprogram/utils/i18n.js'))
const palette = require(path.join(ROOT, 'miniprogram/utils/palette.js'))
const zh = i18n.texts('zh')

const R = (n) => +(n / 2).toFixed(2) // 设计稿 750rpx ＝ CSS 视口 375 ⇒ 1rpx = 0.5px
const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/app.wxss'), 'utf8')
const idxwxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxss'), 'utf8')
function tok(name, from = wxss) {
  const m = new RegExp('--' + name + ':\\s*([^;]+);').exec(from)
  if (!m) throw new Error(`读不到令牌 --${name}`)
  return m[1].trim()
}
function block(src, sel) {
  const i = src.indexOf('\n' + sel + ' {')
  if (i < 0) throw new Error(`读不到块 ${sel}`)
  return src.slice(i, src.indexOf('\n}', i))
}
function decl(src, sel, prop) {
  const body = block(src, sel)
  const m = new RegExp('(?:^|\\n)\\s*' + prop + ':\\s*([^;]+);').exec(body)
  if (!m) throw new Error(`${sel} 里读不到 ${prop}`)
  return m[1].trim()
}
const escapeRe = (x) => x.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
const num = (src, sel, prop) => {
  let v = decl(src, sel, prop)
  const vr = /^var\((--[\w-]+)\)$/.exec(v)
  if (vr) {
    const m = new RegExp(escapeRe(vr[1]) + ':\\s*([^;]+);').exec(wxss)
    if (!m) throw new Error(`${sel} 的 ${prop} 吃 ${vr[1]}，app.wxss 里读不到那枚令牌`)
    v = m[1].trim()
  }
  const m = /^(-?[\d.]+)rpx$/.exec(v)
  if (!m) throw new Error(`${sel} 的 ${prop} 不是一个干净的 rpx：${v}`)
  return +m[1]
}
const numSide = (src, sel, prop) => {
  const vs = decl(src, sel, prop).split(/\s+/).filter((x) => /rpx$/.test(x))
  if (vs.length !== 1) throw new Error(`${sel} 的 ${prop} 不是左右同一档：${decl(src, sel, prop)}`)
  return +/^(-?[\d.]+)rpx$/.exec(vs[0])[1]
}

// ── 现网的数（全部现读，读不到就抛） ─────────────────────────────────
const T = {
  fsTiny: tok('fs-tiny'), fsLabel: tok('fs-label'), fsMeta: tok('fs-meta'),
  rPill: tok('r-pill'), bgCard: tok('bg-card'), chipIdle: tok('chip-idle'), cardEdge: tok('card-edge'),
  textTertiary: tok('text-tertiary'),
}
const SHEET = {
  left: num(idxwxss, '.float-sheet', 'left'), right: num(idxwxss, '.float-sheet', 'right'),
  top: num(idxwxss, '.float-sheet', 'top'), bottom: num(idxwxss, '.float-sheet', 'bottom'),
  radius: num(idxwxss, '.float-sheet', 'border-radius'),
}
const IN = numSide(idxwxss, '.ds-in', 'padding')
const META = { size: num(idxwxss, '.ds-meta', 'font-size'), color: decl(idxwxss, '.ds-meta', 'color'), top: num(idxwxss, '.ds-meta', 'margin-top') }
const H2 = { size: num(idxwxss, '.ds-h2', 'font-size'), weight: decl(idxwxss, '.ds-h2', 'font-weight'), ls: num(idxwxss, '.ds-h2', 'letter-spacing'), lh: decl(idxwxss, '.ds-h2', 'line-height'), color: decl(idxwxss, '.ds-h2', 'color'), top: num(idxwxss, '.ds-h2', 'margin-top') }
const TAG = { size: num(idxwxss, '.ds-tag', 'font-size') }              // 只借字号，底色／加粗按他这一句撤掉
const TAGS_TOP = num(idxwxss, '.ds-tags', 'margin-top')
const TAGS_GAP = num(idxwxss, '.ds-tags', 'gap')
const LAB = { size: num(idxwxss, '.ds-lab', 'font-size'), weight: decl(idxwxss, '.ds-lab', 'font-weight'), ls: num(idxwxss, '.ds-lab', 'letter-spacing'), top: num(idxwxss, '.ds-lab', 'margin-top'), color: decl(idxwxss, '.ds-lab', 'color') }
const PARA = { size: num(idxwxss, '.ds-para', 'font-size'), lh: decl(idxwxss, '.ds-para', 'line-height'), color: decl(idxwxss, '.ds-para', 'color'), top: num(idxwxss, '.ds-para', 'margin-top') }
const BTN = { h: num(idxwxss, '.ds-ibtn', 'height'), size: num(idxwxss, '.ds-ibtn', 'font-size'), gap: num(idxwxss, '.ds-irow', 'gap') }
const BTN_COLOR = decl(idxwxss, '.ds-ibtn', 'color')
const DANGER_COLOR = decl(idxwxss, '.ds-ibtn.danger', 'color')
const SHOTS_TOP = num(idxwxss, '.ix-shots', 'margin-top')               // 图区上方那一段，沿用现网那一排小图的 24rpx

// ── 从参照图量到的那三档（出处见文件头，不是挑的） ───────────────────
const SHEET_W = 750 - SHEET.left - SHEET.right                         // 窗内通栏 702rpx
const REF = {
  imgH: Math.round(SHEET_W * 0.5627),                                  // 395rpx（＝702×0.5627）
  pillH: 51, pillW: 78, pillFill: '#BFBFBF', pillInk: '#FFFFFF',
  dot: 11, bar: 25, gap: 6, dotIdle: '#E4E4E4', dotOn: '#191919',
}
const wcagL = (hex) => {
  const c = palette.hexToRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => {
  const la = wcagL(a), lb = wcagL(b)
  return +(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2))
}
const TAG_GRAY = T.textTertiary                                          // rgba(53,46,29,.72)
const TAG_GRAY_HEX = '#352E1D'

// ── 这一篇的内容：照站长那张真机截图原样搬 ───────────────────────────
const NOTE = {
  meta: `${zh.sourceScreenshot} · 2026-10-17 11:23`,
  title: '华语女歌手演唱会大麦想看人数历史排名',
  tags: ['华语女歌手', '演唱会', '大麦', '想看人数', '排名'],
  summary: '该内容展示了大麦平台上华语女歌手演唱会的历史想看人数排名。孙燕姿南京2025场次以248.4万位居第一，邓紫棋和蔡依林分列二三位。',
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// 照片位一律 CSS 画的示意（不用真图、不用 AI 位图），右下角那行小字标着"示意"。
const SCENE = {
  land: 'linear-gradient(168deg,#7f9a86 0%,#5c7d6b 38%,#3f5a4d 62%,#28392f 100%)',
  tall: 'linear-gradient(168deg,#9d8aa6 0%,#7a6784 40%,#574a63 100%)',
}

function heroCss(o, pfx) {
  const shot = o.shots
  return `
${pfx}.h { padding-top:${R(28)}px; }
${pfx}.h .meta { font-size:${R(META.size)}px; color:${META.color}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
${pfx}.h .title { margin-top:${R(H2.top)}px; font-size:${R(H2.size)}px; font-weight:${H2.weight}; letter-spacing:${R(H2.ls)}px; line-height:${H2.lh}; color:${H2.color}; }
${pfx}.h .tags { margin-top:${R(TAGS_TOP)}px; display:flex; flex-wrap:wrap; gap:${R(TAGS_GAP)}px; }
${pfx}.h .tag { font-size:${R(TAG.size)}px; font-weight:400; color:${TAG_GRAY}; }
${shot ? `
${pfx}.fig { margin-top:${R(SHOTS_TOP)}px; height:${R(REF.imgH)}px; position:relative; overflow:hidden; background:#e9e7e2; }
${pfx}.fig .pic { position:absolute; top:0; bottom:0; ${o.fit ? `left:50%; transform:translateX(-50%); width:${R(Math.round(REF.imgH * 0.75))}px; background:${SCENE.tall}` : `left:0; right:0; background:${SCENE.land}`}; }
${pfx}.fig .tag2 { position:absolute; right:${R(16)}px; bottom:${R(16)}px; font-size:${R(T.fsLabel)}px; color:rgba(255,255,255,.86); background:rgba(20,22,26,.34); border-radius:${R(8)}px; padding:${R(4)}px ${R(10)}px; }
${pfx}.cnt { margin-top:${R(20)}px; text-align:right; padding-right:${R(IN)}px; }
${pfx}.cnt b { display:inline-block; min-width:${R(REF.pillW)}px; height:${R(REF.pillH)}px; line-height:${R(REF.pillH)}px; text-align:center; border-radius:${T.rPill}; background:${REF.pillFill}; color:${REF.pillInk}; font-size:${R(T.fsLabel)}px; font-weight:600; }
${pfx}.dots { margin-top:${R(22)}px; display:flex; align-items:center; justify-content:center; gap:${R(REF.gap)}px; }
${pfx}.dots i { width:${R(REF.dot)}px; height:${R(REF.dot)}px; border-radius:50%; background:${REF.dotIdle}; }
${pfx}.dots i.on { width:${R(REF.bar)}px; border-radius:${R(REF.dot / 2)}px; background:${REF.dotOn}; }` : ''}
${pfx}.below { padding-top:${R(LAB.top)}px; }
${pfx}.below .lab { font-size:${R(LAB.size)}px; font-weight:${LAB.weight}; letter-spacing:${R(LAB.ls)}px; color:${LAB.color}; }
${pfx}.below .para { margin-top:${R(PARA.top)}px; font-size:${R(PARA.size)}px; line-height:${PARA.lh}; color:${PARA.color}; }`
}

function heroHtml(o) {
  const tags = NOTE.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')
  const dots = o.n > 1 ? `<div class="dots">${Array.from({ length: o.n }, (_, k) => `<i class="${k === o.at ? 'on' : ''}"></i>`).join('')}</div>` : ''
  const cnt = o.n > 1 ? `<div class="cnt"><b>${o.at + 1}/${o.n}</b></div>` : ''
  return `<div class="in h">
    <div class="meta">${esc(NOTE.meta)}</div>
    <div class="title">${esc(NOTE.title)}</div>
    <div class="tags">${tags}</div>
  </div>
  ${o.shots ? `<div class="fig"><div class="pic"></div><div class="tag2">照片位＝示意</div></div>${cnt}${dots}` : ''}
  <div class="in below">
    <div class="lab">${esc(zh.summaryLabel)}</div>
    <div class="para">${esc(NOTE.summary)}</div>
    <div class="lab">${esc(zh.keyPoints)}</div>
    <div class="more">${esc(zh.showMore)} ⌄</div>
  </div>`
}

function phone(o) {
  return `<div class="ph" data-v="${o.i}">
  <div class="cap">${o.cap}</div>
  <div class="sub">${o.sub}</div>
  <div class="phone">
    <div class="status">9:41<i></i><i></i><i></i></div>
    <div class="nav"><span>${esc(zh.notesHeading)}</span><em class="pill">•••&nbsp;&nbsp;◎</em></div>
    <div class="bg"></div>
    <div class="dim"></div>
    <div class="sheet">
      <div class="grip"><b></b><em>${esc(zh.grip)}</em></div>
      <div class="scr">${heroHtml(o)}</div>
      <div class="dock">
        <div class="irow"><span>${esc(zh.edit)}</span><span>${esc(zh.shareNote)}</span><span class="d">${esc(zh.delete)}</span></div>
        <div class="pub"><span>${esc(zh.sharedNow)}</span><em>${esc(zh.unshare)}</em></div>
      </div>
    </div>
    <div class="tabbar"><i></i><i class="on"></i><i></i></div>
  </div>
  <div class="note">${o.note}</div>
</div>`
}

const SCREENS = [
  {
    i: 1, shots: true, n: 3, at: 1, cap: '甲｜有配图那一篇：通栏固定高图区，停在第 2 张',
    sub: `图区 ${SHEET_W}×${REF.imgH}rpx（照参考图量的 宽×0.5627）｜点 ${REF.dot}rpx、当前那枚横杠 ${REF.bar}×${REF.dot}rpx、间距 ${REF.gap}rpx｜闲时那几枚 ${REF.dotIdle} 压窗白实测 <span class="no">${ratio(REF.dotIdle, T.bgCard)}:1</span>（这一档照抄过来等于看不见，要抬深）`,
    note: '标题回到现网那一份（46rpx/800、墨色 rgba(35,37,44,.9)，不加任何底块），来源那行在它上面；标签改成灰字不垫底不加粗（--text-tertiary ' + TAG_GRAY + '）。图区在标签下面，左右通到窗边。',
  },
  {
    i: 2, shots: true, n: 1, at: 0, cap: '乙｜只有一张配图那一篇',
    sub: '只有一张 ⇒ 数字与那一排点都不画（一条没有"下一张"的滑动条是噪音）',
    note: '这一条你没拍过，是我自己定的：一张的时候图区还是那一个高，只是顶上不挂"1/1"、底下不挂一个孤零零的横杠。要留着就说一声。',
  },
  {
    i: 3, shots: false, cap: '丙｜没有配图那一篇：这一整块空间隐藏',
    sub: '图区／数字／那一排点三样全不占位，标签下面直接是摘要',
    note: '你这一句是"如果不配图，这部分空间就隐藏"，画的就是这一屏：不留空档、不留占位框。',
  },
  {
    i: 4, shots: true, n: 2, at: 1, fit: true, cap: '丁｜竖图那一篇（3:4）：图区照旧那一个高',
    sub: `这一屏画的是 contain（图完整放进、左右各空 ${Math.round((SHEET_W - REF.imgH * 0.75) / 2)}rpx）`,
    note: `甲／乙那两屏用的是 cover（铺满图区、竖图上下被裁）。固定高与"通栏大图"在竖图这一篇必然打架：要完整就左右留白，要通栏就得裁。这一屏给你看留白那一种长什么样。另外那枚计数照参考图是浅灰实底 ${REF.pillFill} 压白字，实测 <span class="no">${ratio(REF.pillInk, REF.pillFill)}:1</span>（远低于 4.5）——照抄还是换成白字压半透黑，你定。`,
  },
]

const css = `
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1c1e22;font-family:-apple-system,"PingFang SC","Helvetica Neue",sans-serif;padding:34px;color:#eee}
h1{font-size:19px;font-weight:700;margin-bottom:6px}
.lead{font-size:12.5px;color:#9aa0a6;margin-bottom:26px;line-height:1.7;max-width:1180px}
.lead b{color:#cfe3f7}
.row{display:flex;gap:26px;flex-wrap:wrap;align-items:flex-start}
.phone{position:relative;width:375px;height:760px;border-radius:30px;overflow:hidden;background:#0e1013;box-shadow:0 18px 40px rgba(0,0,0,.5)}
.status{position:absolute;top:0;left:0;right:0;height:34px;display:flex;align-items:center;padding:0 16px;font-size:12px;font-weight:600;color:#fff;z-index:6}
.status i{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.55);margin-left:4px}
.status i:first-of-type{margin-left:auto}
.nav{position:absolute;top:34px;left:0;right:0;height:44px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;color:#222;background:#e9eef0;z-index:5}
.nav .pill{position:absolute;right:8px;font-size:11px;font-weight:400;color:#333;background:rgba(255,255,255,.86);border-radius:999px;padding:5px 10px}
.bg{position:absolute;top:78px;left:0;right:0;height:190px;background:linear-gradient(160deg,#8fb0a2 0%,#6d8f83 42%,#4f6f66 100%)}
.dim{position:absolute;inset:0;background:rgba(10,12,16,.42)}
.sheet{position:absolute;left:${R(SHEET.left)}px;right:${R(SHEET.right)}px;top:${R(SHEET.top)}px;bottom:${R(SHEET.bottom)}px;
  background:${T.bgCard};border-radius:${R(SHEET.radius)}px;overflow:hidden;display:flex;flex-direction:column;
  box-shadow:0 ${R(30)}px ${R(60)}px rgba(8,10,14,.32)}
.grip{position:relative;height:44px;flex:none;display:flex;align-items:center;justify-content:center}
.grip b{position:absolute;top:12px;left:50%;transform:translateX(-50%);width:56px;height:4px;border-radius:999px;background:rgba(35,37,44,.18)}
.grip em{position:absolute;right:${R(IN)}px;top:0;font-size:${R(T.fsTiny)}px;font-style:normal;color:rgba(35,37,44,.45)}
.scr{flex:1;min-height:0;overflow:hidden}
.dock{flex:none;padding:${R(18)}px ${R(IN)}px ${R(20)}px;border-top:1px solid rgba(35,37,44,.08);background:${T.bgCard}}
.irow{display:flex;gap:${R(BTN.gap)}px}
.irow span{flex:1;height:${R(BTN.h)}px;border-radius:${T.rPill};display:flex;align-items:center;justify-content:center;
  font-size:${R(BTN.size)}px;font-weight:700;color:${BTN_COLOR};background:${T.chipIdle};white-space:nowrap;
  box-shadow:inset 0 0 0 ${R(1.5)}px ${T.cardEdge}}
.irow span.d{color:${DANGER_COLOR};box-shadow:inset 0 0 0 ${R(1.5)}px rgba(140,33,25,.24)}
.pub{margin-top:${R(12)}px;display:flex;justify-content:space-between;font-size:${R(T.fsTiny)}px;color:rgba(35,37,44,.45)}
.pub em{font-style:normal;color:rgba(35,37,44,.62);text-decoration:underline}
.more{margin-top:${R(20)}px;text-align:center;font-size:${R(T.fsMeta)}px;color:rgba(35,37,44,.55)}
.cap{font-size:13px;font-weight:700;line-height:1.55;margin-bottom:5px}
.sub{font-size:11px;color:#8fb3d9;line-height:1.6;margin-bottom:10px}
.sub b{color:#cfe3f7;font-weight:700}
.sub .no{color:#e0876a;font-weight:700}
.note{font-size:11.5px;color:#9aa0a6;line-height:1.75;margin-top:10px}
${[1, 2, 3, 4].map((i) => heroCss(SCREENS.find((s) => s.i === i), `.s${i} `)).join('\n')}
`


const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<title>详情窗抬头 · 方向图（10-18 第三稿，代码一行没动）</title>
<style>${css}</style></head><body>
<h1>详情窗抬头 · 方向图（第三稿：图区改通栏大图，色块那两稿作废）</h1>
<div class="lead">站长 10-17 深夜：「配图改为这种形式，固定高度图片区（如果不配图，这部分空间就隐藏），通栏大图滑动，显示数字，和下方圆点，横杠，大图上方是我们标题，不加背景色了，恢复之前那种标题设计，然后，弱化标签，只需要显示标签名字，灰字，不加底色，不加粗。」
<b>前两稿那个"标题底下加一层底色色块"整条撤掉了</b>，标题恢复现网那一份。这四屏照这一句画，<b>代码一行没动</b>——真机现在跑的还是一排 180rpx 小方格、标签垫了色块的那一版。
图区那一族的数是从你附的那张截图上量的（量法写在生成器文件头），字号／窗体几何／标题与摘要那几排全部从现网源码现读。挑一屏（或说改哪几处），我再落码。</div>
<div class="row">
${SCREENS.map((o) => `<div class="s${o.i}">${phone(o)}</div>`).join('\n')}
</div>
<script>
window.addEventListener('load', function () {
  var out = []
  var g = function (sel, f) { var e = document.querySelector(sel); if (!e) return null; out.push(f(e)) }
  g('.s1 .title', function (e) { var c = getComputedStyle(e); return 'title=' + c.fontSize + '/' + c.fontWeight + '/' + c.color })
  g('.s1 .tag', function (e) { var c = getComputedStyle(e); return 'tag=' + c.fontSize + '/' + c.fontWeight + '/' + c.color + '/bg:' + c.backgroundColor })
  g('.s1 .fig', function (e) { var r = e.getBoundingClientRect(); var s = document.querySelector('.s1 .sheet').getBoundingClientRect(); return 'fig=' + Math.round(r.width) + 'x' + r.height + ' 通栏' + (Math.abs(r.width - s.width) < 0.6 ? 'OK' : 'NO') })
  g('.s1 .cnt b', function (e) { var r = e.getBoundingClientRect(); return 'cnt=' + Math.round(r.width) + 'x' + r.height + '/' + e.textContent })
  g('.s1 .dots i', function (e) { var r = e.getBoundingClientRect(); return 'dot=' + r.width + 'x' + r.height })
  g('.s1 .dots i.on', function (e) { var r = e.getBoundingClientRect(); return 'bar=' + r.width + 'x' + r.height })
  var has = function (sel) { return !!document.querySelector(sel) }
  out.push('s2数字=' + has('.s2 .cnt') + ' s2点=' + has('.s2 .dots') + ' s2图区=' + has('.s2 .fig'))
  out.push('s3图区=' + has('.s3 .fig') + ' s3数字=' + has('.s3 .cnt') + ' s3点=' + has('.s3 .dots'))
  g('.s4 .pic', function (e) { var r = e.getBoundingClientRect(); return 'pic=' + Math.round(r.width) + 'x' + r.height })
  g('.s1 .scr', function (e) { return '折线外=' + (e.scrollHeight - e.clientHeight) + 'px' })
  document.title = 'PROBE ' + out.filter(Boolean).join(' | ')
})
</script></body></html>`

fs.mkdirSync(DIR, { recursive: true })
fs.writeFileSync(HTML, html)
const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--virtual-time-budget=6000', '--window-size=2100,900', '--dump-dom', HTML],
  { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })
const probe = (/PROBE ([^<]*)/.exec(dom) || ['', ''])[1].trim()
console.log('读回：' + probe)
const want = [
  ['title=23px/800/rgba(35, 37, 44, 0.9)', '标题就是现网那一份（46rpx/800、墨色 90%，没加底块）'],
  ['tag=10.5px/400/rgba(53, 46, 29, 0.72)/bg:rgba(0, 0, 0, 0)', '标签灰字、不加粗、不垫底（--text-tertiary 现读）'],
  ['fig=351x197.5 通栏OK', '图区通到窗边（351px＝702rpx）且高是量到的那一个 395rpx'],
  ['cnt=39x25.5/2/3', '计数那枚 78×51rpx，写的是"2/3"'],
  ['dot=5.5x5.5', '圆点 11rpx'],
  ['bar=12.5x5.5', '当前那一枚是 25×11rpx 的横杠'],
  ['s2数字=false s2点=false s2图区=true', '只有一张：图区在，数字与那一排点都不在'],
  ['s3图区=false s3数字=false s3点=false', '没有配图那一屏：图区／数字／那一排点三样都不存在（不占位）'],
  ['pic=148x197.5', '竖图那一篇 contain：宽＝高×0.75，左右留白'],
]
const miss = want.filter((w) => probe.indexOf(w[0]) < 0)
if (miss.length) { console.error('✗ 渲染端没读到：\n  · ' + miss.map((m) => m[1] + '（' + m[0] + '）').join('\n  · ')); process.exit(1) }
console.log(`✓ ${want.length} 项读数全对上（rpx 没混进 Chrome，图区/点/横杠都是量参考图那三档）`)
console.log('　顺带：白字压 ' + REF.pillFill + ' 实测 ' + ratio(REF.pillInk, REF.pillFill) + ':1；' + TAG_GRAY + ' 的灰字压 ' + T.bgCard + ' 实测 ' + ratio(TAG_GRAY_HEX, T.bgCard) + ':1')

execFileSync('node', [path.join(ROOT, 'docs/工具/出-效果图按页宽.js'), path.relative(ROOT, HTML)], { stdio: 'inherit' })
console.log('PNG：' + path.relative(ROOT, HTML.replace(/\.html$/, '.png')))
