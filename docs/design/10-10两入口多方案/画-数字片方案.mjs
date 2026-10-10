// 站长 10-10 那句（附了一张 dashboard 参考图，指它下半部那一排数字卡）：
// 「参考图片下半部，加 2 个数据面板，笔记数量，卡片数量，点击就直接访问笔记列表，卡片列表，
//   然后旁边再加个 + 号的方块，点击就是加笔记。你按照这个思路，设计几个方案，给我选择。」
// 跑法：node docs/design/10-10两入口多方案/画-数字片方案.mjs
//
// 这一稿画的是**第一屏底下那一组**换成「两枚数字片 + 一枚 +」的四种排法。其余照现网一字不动：
// 形象图满铺、头部那层压暗罩、面板 410／490、浅面那三层、底栏三枚、条底 618 那一档。
//
// 三条已核到的事实（画之前查的，不是猜的）：
// ① 笔记数量有现成口：`/api/user/quota` 的 `used`（笔记页右上角那一列就是它）。
// ② 卡片数量服务端有、客户端 `utils/cardCloud.js:197` 已在调 `GET /api/user/cards`，
//    但那一趟是"列表一次拿全"（cards + need_confirm + snapshots），给一个数字打这一趟偏重。
// ③ **卡片列表那一页不存在**（app.json 十一个页面里没有），所以"点卡片片→卡片列表"是要新建一页。
//    这三条都写进稿上那张说明块，不藏。
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const require = createRequire(import.meta.url)
const DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(DIR, '..', '..', '..')
const MP = path.join(ROOT, 'miniprogram')
const palette = require(path.join(MP, 'utils/palette.js'))
const ZH = require(path.join(MP, 'utils/i18n.js')).texts('zh')
const T = (k) => {
  if (!(k in ZH)) throw new Error(`i18n 里没有键 ${k}——屏上不许出现字典外的界面话`)
  return ZH[k]
}
const bad = []
const ck = (n, ok, d = '') => { if (!ok) bad.push(n); console.log(`${ok ? '✓' : '✗'} ${n}${d ? `　→ ${d}` : ''}`) }

/* ---------- ① 现读 ---------- */
const APP = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
const PB = APP.slice(APP.indexOf('page{') >= 0 ? APP.indexOf('page{') : APP.indexOf('page {'))
const tok = {}
for (const m of PB.slice(0, PB.indexOf('}')).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) tok[m[1]] = m[2].trim()
const px = (k) => { if (!tok[k]) throw new Error(`app.wxss 读不到 ${k}`); return parseInt(tok[k], 10) }
// 那列数字用的就是包内这一支 Poppins Thin（app.wxss 里 base64 内嵌），稿上同一支
const MIND = (/src:\s*url\(data:font\/ttf;base64,([^)]+)\)/.exec(APP) || [])[1]
ck('MIND 那支数字字体是从 app.wxss 现读内嵌的 base64（不是浏览器默认细体）', !!MIND && MIND.length > 2000, `${(MIND || '').length} 字符`)
const CSS = fs.readFileSync(path.join(MP, 'pages/create/create.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (sel) => {
  const m = new RegExp('(^|\\})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(CSS)
  if (!m) throw new Error(`create.wxss 读不到 ${sel}，出处变了`)
  const o = {}
  for (const p of m[2].split(';')) { const i = p.indexOf(':'); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim() }
  return o
}
const val = (v) => String(v).replace(/var\((--[a-z0-9-]+)\)/g, (m, k) => (k in tok ? tok[k] : m))
const num = (v, w) => { const x = parseFloat(val(v)); if (!Number.isFinite(x)) throw new Error(`几何 NaN：${w} = ${v}`); return x }
const PANEL = rule('.panel'), BAR = rule('.bar'), DOCK = rule('.container.entry-dock .entry-wrap')
const scrim = (/\.page-scrim\s*\{[^}]*background:\s*(linear-gradient\([^;]*\))/.exec(CSS) || [])[1]
if (!scrim) throw new Error('读不到 .page-scrim 那条渐变')
ck('罩子那条渐变现读＝压暗那七档（头部那层不在可动范围内）', /rgba\(18, 20, 26/.test(scrim),
  `${(scrim.match(/rgba\(18, 20, 26/g) || []).length} 个暗停点`)
const SC = { w: 750, h: 1670 }
const G = {
  side: num(DOCK.left, 'dock left'), bottom: num(DOCK.bottom, 'dock bottom'),
  panelH: num(PANEL.height, 'panel'), barH: num(BAR.height, 'bar'), barR: num(BAR['border-radius'], 'barR'),
  barEdge: num(BAR.border, 'bar border'), gap: num(BAR.gap || '22rpx', 'bar gap'),
  h1: px('--fs-h1'), meta: px('--fs-meta'), micro: px('--fs-micro'), tiny: px('--fs-tiny'), title: px('--fs-title'),
}
const TAB_TOP = 20 + 108
const BAR_BOTTOM = G.bottom + TAB_TOP + 132 - G.barH      // 条底 618 那一档（拍过的落点）
const IVORY = palette.THEMES.find((t) => t.key === 'tint-paper')
const CH = palette.chromeOf('tint-paper')
const SK = {}
for (const m of palette.createSkin('tint-paper').matchAll(/--(cp-[a-z0-9-]+):([^;]+)/g)) SK[m[1]] = m[2]
const PAGE = IVORY.page, FACE = SK['cp-panel'], CAM = SK['cp-cam'], INK = SK['cp-ink']
const PAPER = '#F2EFE9', PAPER_78 = 'rgba(242,239,233,.78)', PAPER_56 = 'rgba(242,239,233,.56)'
const BG = fs.readFileSync(path.join(MP, 'assets/home-bg-portrait.jpg')).toString('base64')
const bgUrl = `url(data:image/jpeg;base64,${BG})`

/* ---------- ② 这一组自己的数（稿上算，不抄字面量） ---------- */
const CARD_H = 152, PLUS = 152, FULL = SC.w - 2 * G.side          // 702：那条胶囊原来的宽
const TWO_PLUS = (FULL - PLUS - 2 * G.gap) / 2                    // 甲／乙／丁：两枚数字片各宽
const TWO_ONLY = (FULL - G.gap) / 2                               // 丙：两枚数字片各宽（+ 另起一条）
ck(`宽度闭合：两枚数字片 ${TWO_PLUS.toFixed(1)} ×2 ＋ 方块 ${PLUS} ＋ 两条缝 ${G.gap} = ${2 * TWO_PLUS + PLUS + 2 * G.gap}（等于胶囊那条 ${FULL}）`,
  Math.abs(2 * TWO_PLUS + PLUS + 2 * G.gap - FULL) < 0.6 && TWO_ONLY * 2 + G.gap === FULL,
  `丙那一版两枚各 ${TWO_ONLY}`)

const LAY = { padX: 30, slot: 398, refW: 175, gap: 24, scale: 0.53 }
const CELL_W = LAY.slot + 10 + LAY.refW, PITCH = CELL_W + LAY.gap, COLS = 2

/* ---------- ③ 画 ---------- */
// 单位这一格是坑：`.ph` 的布局框就是 750px＝750rpx，所以从 WXSS 抄来的尺寸搬到浏览器一律写 px。
// 留着 `rpx` 的那条声明会被静默丢掉（字号退回继承值），稿子看着"画了"其实量的不是那套皮。
const css = `
@font-face{font-family:'WtsjMind';src:url(data:font/ttf;base64,${MIND}) format('truetype');font-weight:100}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,"PingFang SC",sans-serif;background:#EFECE6;padding:34px ${LAY.padX}px 44px;color:#14161A}
h1{font-size:27px;letter-spacing:-.4px}h1 span{font-size:15px;font-weight:400;color:#7A756C;margin-left:12px}
.lead{font-size:14.5px;line-height:1.75;color:#4A4741;margin:9px 0 20px;max-width:${COLS * PITCH}px}
.grid{display:flex;flex-wrap:wrap;gap:${LAY.gap}px;align-items:flex-start}
.cell{flex:none;min-width:0;width:${CELL_W}px;display:flex;gap:10px;align-items:flex-start}
.left{flex:none;width:${LAY.slot}px;min-width:0}
.pw{width:${LAY.slot}px;overflow:hidden}.ph{width:750px;height:1670px;border-radius:60px;overflow:hidden;position:relative;outline:2px solid #B9B6AF;transform:scale(${LAY.scale});transform-origin:top left;margin-bottom:-777px}
.cap{font-size:13px;line-height:1.6;color:#5C5850;margin-top:9px;width:${LAY.slot}px}.cap b{color:#14161A}
.refcol{flex:none;width:${LAY.refW}px}.refcol img{width:${LAY.refW}px;display:block;border-radius:10px;outline:2px solid #C9C5BD}
.refcol i{display:block;font-style:normal;font-size:11.5px;line-height:1.5;color:#6B665E;margin:5px 0 10px}
.page{position:absolute;inset:0;background:${PAGE}}
.photo{position:absolute;inset:0;background-image:${bgUrl};background-size:cover;background-position:center}
.scrim{position:absolute;inset:0;background:${scrim}}
.status{position:absolute;left:0;right:0;top:0;height:94px;display:flex;align-items:center;justify-content:space-between;padding:0 44px;font-size:29px;font-weight:600;color:${PAPER}}
.nav{position:absolute;left:0;right:0;top:94px;height:90px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;color:${PAPER}}
.capsule{position:absolute;right:24px;top:22px;width:174px;height:46px;border-radius:999px;display:flex;align-items:center;justify-content:space-around;font-size:24px;background:rgba(0,0,0,.18);color:#fff;border:1px solid rgba(255,255,255,.32)}
.h1t{position:absolute;left:32px;top:206px;font-size:${G.h1}px;font-weight:700;letter-spacing:-1px;color:${PAPER}}
.lang{position:absolute;right:32px;top:212px;font-size:${G.meta}px;color:${PAPER_56}}.lang b{color:${PAPER}}
.toolrow{position:absolute;left:22px;top:272px;display:flex;align-items:center;gap:26px;font-size:${G.meta}px;font-weight:700;letter-spacing:1px;color:${PAPER_78}}
.toolrow i{font-style:normal;display:inline-flex;align-items:center;gap:10px}
.dotdim{width:24px;height:24px;border-radius:50%;border:2px solid rgba(8,9,12,.28);background:#8E9099}
.dock{position:absolute;left:${G.side}px;right:${G.side}px;bottom:${G.bottom}px}
.dock.up{bottom:${BAR_BOTTOM}px;display:flex;flex-direction:column}
.tips{flex:none;font-size:${G.meta}px;color:${PAPER_78};padding:0 0 10px 48px}.tips u{text-decoration:none;color:#E5B93F}
.row3{display:flex;gap:${G.gap}px;align-items:flex-end}
.stat{flex:none;height:${CARD_H}px;border-radius:30px;background:${PAPER};border:${G.barEdge}px solid rgba(35,37,44,.10);box-shadow:0 18px 46px rgba(8,10,14,.42);padding:20px 0 0;display:flex;flex-direction:column;align-items:center}
.stat .n{font-family:'WtsjMind','Poppins',sans-serif;font-weight:100;font-size:64px;line-height:.9;color:${INK}}
.stat .u{width:56px;height:6px;border-radius:3px;background:rgba(35,37,44,.20);margin-top:8px}
.stat .l{font-size:${G.micro}px;font-weight:700;letter-spacing:4px;color:rgba(35,37,44,.62);margin-top:10px}
.plus{flex:none;width:${PLUS}px;height:${PLUS}px;border-radius:30px;background:${PAPER};color:${INK};box-shadow:0 18px 46px rgba(8,10,14,.42);display:flex;align-items:center;justify-content:center}
.plus.round{border-radius:50%}
.plus .g{width:66px;height:66px}
.g{display:block;background:currentColor;-webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center}
.plusg{-webkit-mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'><path d='M12 5v14M5 12h14'/></svg>")}
.pen{-webkit-mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M12 20h9'/><path d='M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'/></svg>")}
.bar{height:${G.barH}px;border-radius:${G.barR}px;background:${PAPER};color:${INK};border:${G.barEdge}px solid rgba(35,37,44,.10);display:flex;align-items:center;gap:22px;padding:0 20px 0 34px;box-shadow:0 18px 46px rgba(8,10,14,.42)}
.bar .lb{font-size:${G.title}px;font-weight:800;letter-spacing:-1px;line-height:1.1;white-space:nowrap}
.bar .gl{flex:none;width:52px;height:52px}
.bar2{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:44px;display:flex;align-items:center;justify-content:space-around;background:${CH.bg}}
.bar2 u{text-decoration:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:34px;color:${CH.idle}}
.bar2 u.sel{background:${CH.sel};color:${PAPER}}
.note{background:#fff;border-radius:14px;padding:18px 20px;font-size:13.5px;line-height:1.85;color:#3A3733;width:${2 * CELL_W + LAY.gap}px;box-shadow:0 1px 0 #D8D4CC}
.note h3{font-size:14.5px;margin-bottom:8px}
`
const head = `<div class="photo"></div><div class="scrim"></div>
  <div class="status">9:41<b style="font-weight:400">▮▮▮  ▰</b></div>
  <div class="nav">${T('appName')}<div class="capsule">•••　◎</div></div>
  <div class="h1t">${T('createHeading')}</div><div class="lang"><b>中</b>　EN</div>
  <div class="toolrow"><i><span class="dotdim"></span>${T('bgDimLabel')}</i><i>${T('homeBgSwap')} ›</i></div>`
const tabbar = `<div class="bar2"><u class="sel">＋</u><u>≡</u><u>◡</u></div>`
const tips = `<div class="tips"><u>●</u> ${T('tipsPrefix')}${Array.isArray(T('tips')) ? T('tips')[0] : ''}</div>`
// 屏上那两句标签都从字典现读：笔记＝statNotes（笔记页右上角那一列用的就是它），卡片＝slotCard
const stat = (n, key, w) => `<div class="stat" style="width:${w}px"><div class="n">${n}</div><div class="u"></div><div class="l">${T(key)}</div></div>`
const plus = (cls) => `<div class="plus ${cls || ''}"><span class="g plusg"></span></div>`
const GROUPS = {
  现网: `<div class="bar"><span class="g pen gl"></span><span class="lb">${T('barIdle')}</span></div>`,
  甲: `<div class="row3">${stat(128, 'statNotes', TWO_PLUS)}${stat(46, 'slotCard', TWO_PLUS)}${plus()}</div>`,
  乙: `<div class="row3">${stat(128, 'statNotes', TWO_PLUS)}${plus()}${stat(46, 'slotCard', TWO_PLUS)}</div>`,
  丙: `<div class="row3" style="margin-bottom:${G.gap}px">${stat(128, 'statNotes', TWO_ONLY)}${stat(46, 'slotCard', TWO_ONLY)}</div>
       <div class="bar"><span class="g plusg gl"></span><span class="lb">${T('barIdle')}</span></div>`,
  丁: `<div class="row3">${stat(128, 'statNotes', TWO_PLUS)}${stat(46, 'slotCard', TWO_PLUS)}${plus('round')}</div>`,
}
const phone = (kind) => `<div class="pw"><div class="ph"><div class="page"></div>${head}
  <div class="dock up">${tips}${GROUPS[kind]}</div>${tabbar}</div></div>`
const refs = (list) => `<div class="refcol">${list.map(([f, t]) => `<img src="参考/裁/${f}.jpg"><i>${t}</i>`).join('')}</div>`
const CELL = (kind, cap, rf) => `<div class="cell"><div class="left">${phone(kind)}<div class="cap">${cap}</div></div>${rf || ''}</div>`
const REF = [['站长给的那张', '站长附的那张（原图）：下半部三张数字卡＝大数字＋一根短线＋两行小字，底栏中央一枚 + 圆']]

const HTML = `<!doctype html><meta charset="utf-8"><style>${css}</style>
<h1>第一屏底下那一组：两枚数字片 + 一枚 +<span>站长 10-10「参考图下半部，加 2 个数据面板…旁边再加个 + 号的方块」</span></h1>
<div class="lead">四种排法，<b>每一枚的落点与面都从现网现读</b>：数字那支是包内内嵌的 Poppins Thin（笔记页右上角同一支）、标签走字典里现成那两键（<b>笔记</b>／<b>卡片</b>，一句新文案都不用加）、片与方块仍是那支纸白 ${PAPER} ＋ 墨字 ＋ 同一档描边与投影。
<br>共同口径：<b>点数字片＝跳过去（笔记片→笔记列表 tab，卡片片→卡片列表），点 + ＝开录入面板停在「照片」那一档</b>。整组底边仍停在拍过的条底 618 那一条线上，中间那条缝取胶囊自己已有的 ${G.gap}。
<br>⚠ 参考图下半部那三根<b>彩色短线我没抄</b>：色板里只有那两支橙（拍照／提炼），给两枚数字片各配一支会把"橙＝那两件事"的意思稀释。稿上先画成墨 .20 的灰线，<b>要配色的话说一声、并定哪支给谁</b>。
<br>⚠ 屏上那两个数（128／46）<b>是占位数据，不是界面文案</b>；两句标签「笔记」「卡片」是从字典现读的（<code>statNotes</code>／<code>slotCard</code>）。</div>
<div class="grid">
${CELL('现网', '<b>现网对照</b>：一条纸白胶囊（「动动手指」）。这一版没有数字、没有 + 方块。', REF)}
${CELL('甲', `<b>甲 一行三件、+ 在右</b>：两枚数字片各 ${TWO_PLUS.toFixed(0)}rpx ＋ 右端一枚 ${PLUS}rpx 方块，同高 ${CARD_H}。读序＝先看两个数、最后落在那枚 +（离底栏那颗 ＋ 也最近）。`)}
${CELL('乙', `<b>乙 一行三件、+ 居中</b>：动作夹在两个去处中间，${PLUS} 方块在正中。好处是"记一笔"这件事最抢眼；代价是两枚数字片被拆开，读起来像两个独立按钮而不是一组统计。`)}
${CELL('丙', `<b>丙 两枚数字片一行 + 下面一条通栏</b>：数字片各 ${TWO_ONLY}rpx，+ 与「动动手指」合成一条 ${FULL}×${G.barH} 的大胶囊压在下面。<b>动作最大</b>；代价是整组从 ${CARD_H} 高变成 ${CARD_H + G.gap + G.barH} 高，往上多吃 ${(CARD_H + G.gap + G.barH - CARD_H).toFixed(0)}rpx 的照片。`)}
${CELL('丁', `<b>丁 一行三件、+ 用圆</b>：与甲同排，只把右端那枚方块换成 ${PLUS} 的圆（上一轮那版快门的语言）。方块＝"一个格子"，圆＝"按一下就拍"，这一处差别只有你能判。`)}
</div>
<div class="note" style="margin-top:26px">
<h3>画之前先查到的三条，其中一条是要新建页面</h3>
① <b>笔记数量：现成</b>。笔记页右上角那一列读的就是 <code>/api/user/quota</code> 的 <code>used</code>，第一屏顺手拿同一个数，不多打一趟接口。<br>
② <b>卡片数量：服务端有，但那趟接口偏重</b>。<code>GET /api/user/cards</code> 回的是 <code>cards + need_confirm + snapshots</code>（"列表一次拿全"），客户端 <code>utils/cardCloud.js</code> 已经在回前台那一趟调它。两条路：<b>甲</b>＝复用那一趟的结果取 <code>cards.length</code>（零新增接口，但第一屏得等那趟回来才有数，拿不到就画 0，与笔记页那格同一口径）；<b>乙</b>＝服务端补一个只回数量的轻口（多一个接口、多一条判据，但第一屏那一趟便宜）。<b>我建议甲</b>。<br>
③ <b>「卡片列表」这一页现在不存在</b>——<code>app.json</code> 十一个页面里没有它（<code>noCards = 还没有生成过卡片</code> 那句是详情页那一格用的）。所以"点卡片片→卡片列表"是<b>新建一页</b>：一张卡片一行（缩略图＋篇名＋日期＋撤回分享那个动作），数据就是 ② 那一趟的 <code>cards</code>。这条不在我这一轮擅自开工，等你一句。<b>过渡方案</b>：这一格先只做数字、不可点（或点了跳「我的 → 卡片模板」，但那不是卡片列表，口径不对，我不建议）。<br>
<div style="margin-top:10px;color:#7A756C">我的倾向：<b>甲</b>。它最照你附的那张图（一排数字卡、动作在末端），两枚数字片挨在一起才读得出"这是一组统计"，而 + 放右端正好接住底栏那颗 ＋；丙多占一行高，乙把统计拆散了。</div>
</div>`

const OUT_HTML = path.join(DIR, '数字片四方案.html')
// 浏览器不认 `rpx`：从 WXSS 抄过来的声明只要还带着 rpx，会被<b>静默丢掉</b>（字号退回继承值），
// 稿子看着"画了"其实量的不是那套皮。这一条就是钉住它——`.ph` 的框是 750px＝750rpx，一律写 px。
const leaked = css.match(/[:\s]-?[\d.]+rpx/g) || []
ck('CSS 里没有漏网的 rpx（浏览器不认，整条声明会静默失效）', leaked.length === 0, leaked.join(' '))
const open = (HTML.match(/<div\b/g) || []).length, close = (HTML.match(/<\/div>/g) || []).length
ck(`HTML 里 <div> 与 </div> 数量相等（${open}）`, open === close, `开 ${open} 闭 ${close}`)
fs.writeFileSync(OUT_HTML, HTML)
const PNG = path.join(DIR, '数字片四方案.png')
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
   '--window-size=1300,4200', `--screenshot=${PNG}`, '--virtual-time-budget=12000', 'file://' + OUT_HTML],
  { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] })
if (!fs.existsSync(PNG)) throw new Error('PNG 没出来')
execFileSync('python3', ['-c', `
from PIL import Image
im=Image.open(${JSON.stringify(PNG)}).convert('RGB'); W,H=im.size; px=im.load()
BG=(239,236,230)
def blank(y): return all(abs(px[x,y][i]-BG[i])<=4 for x in range(0,W,7) for i in range(3))
last=H-1
while last>0 and blank(last): last-=1
if last<H-1: im.crop((0,0,W,min(H,last+34))).save(${JSON.stringify(PNG)})
print('裁后', W, min(H,last+34))`], { encoding: 'utf8' })

/* ---------- ④ 在产物上量 ---------- */
const audit = JSON.parse(execFileSync('python3', ['-c', `
import json
from PIL import Image
im=Image.open(${JSON.stringify(PNG)}).convert('RGB'); W,H=im.size; px=im.load()
S=${LAY.scale}; PITCH=${PITCH}; PADX=${LAY.padX}
PAPER=(242,239,233)
def hx(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))
CHc=hx(${JSON.stringify(CH.bg)})
def near(a,b,t): return all(abs(a[i]-b[i])<=t for i in range(3))
out={}
for c in range(${COLS}):
    x0=int(PADX+PITCH*c+40); x1=int(PADX+PITCH*c+${LAY.slot}-40)
    rows=[y for y in range(H) if sum(1 for x in range(x0,x1,4) if near(px[x,y],CHc,12))>len(range(x0,x1,4))*0.55]
    cl=[]
    for y in rows:
        if cl and y-cl[-1][-1]<=6: cl[-1].append(y)
        else: cl.append([y])
    tabs=[g[0] for g in cl]
    # 每一台：入口那一组的**底边**与**顶边**＝底栏顶往上 8～260px 这一段里纸白的最下／最上一行
    bot=[];top=[]
    for t in tabs:
        b=tp=None
        for y in range(t-8,int(t-260),-1):
            if any(near(px[x,y],PAPER,8) for x in range(x0,x1)):
                if b is None: b=y
                tp=y
        bot.append(b); top.append(tp)
    out['col%d'%c]={'tabs':tabs,'bot':bot,'top':top}
print(json.dumps(out))`], { encoding: 'utf8' }))
const at = (i, k) => { const c = i % COLS, r = Math.floor(i / COLS); return audit['col' + c][k][r] }
ck('五台都渲出来了（第 1 列 3 台、第 2 列 2 台）',
  audit.col0.tabs.length === 3 && audit.col1.tabs.length === 2,
  `col0 ${audit.col0.tabs.length}／col1 ${audit.col1.tabs.length}`)
const dBot = [0, 1, 2, 3, 4].map((i) => (at(i, 'bot') == null ? null : at(i, 'tabs') - at(i, 'bot')))
ck('四版整组底边与现网同一条线（±4px，换成这四版都不动条底 618 那笔账）',
  dBot.every((v) => v != null) && Math.max(...dBot) - Math.min(...dBot) <= 4,
  `现网 ${dBot[0]}｜甲 ${dBot[1]}｜乙 ${dBot[2]}｜丙 ${dBot[3]}｜丁 ${dBot[4]}（px，离各自底栏顶）`)
const hOf = (i) => (at(i, 'top') == null ? null : at(i, 'bot') - at(i, 'top'))   // 组高＝最下那条纸白行 − 最上那条
ck(`甲／乙／丁 三版组高同一档（${CARD_H}rpx×${LAY.scale} ≈ ${(CARD_H * LAY.scale).toFixed(0)}px），丙 高一档（多一条 ${G.barH} 胶囊 + 缝 ${G.gap}）`,
  Math.abs(hOf(1) - hOf(2)) <= 4 && Math.abs(hOf(1) - hOf(4)) <= 4 && hOf(3) - hOf(1) > 60,
  `现网 ${hOf(0)}｜甲 ${hOf(1)}｜乙 ${hOf(2)}｜丙 ${hOf(3)}｜丁 ${hOf(4)}（px）`)
console.log(`\n现读进来的数：胶囊高 ${G.barH} 圆角 ${G.barR}、缝 ${G.gap}、条底档 ${BAR_BOTTOM}、片宽 ${TWO_PLUS.toFixed(1)}／${TWO_ONLY}、方块 ${PLUS}`)
console.log('产物：' + PNG)
if (bad.length) { console.log(`✗ ${bad.length} 条不过：` + bad.join(' / ')); process.exit(1) }
console.log('✓ 全过')
