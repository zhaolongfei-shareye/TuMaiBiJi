// 站长 10-10 那句：「丁，但面板给几个配色方案，可爱风，文艺范，等，然后可以加些小装饰图片，抽象一点。」
// 跑法：node docs/design/10-10两入口多方案/画-面板配色.mjs
//
// 每一套色都同时上在**两处**：录入面板（410，展开那一态）与刚拍定的丁那一组（两枚数字片＋一枚圆 +，
// 收起那一态、落在照片上）。这样"面板"到底指哪一处不必来回问。
//
// 口径：几何全部现读（面板 410、内缩 24、缝 22、快门 180、数字那支 Poppins Thin 的 base64）；
// 颜色这一稿是新开的四套，所以每套都带**算出来的对比读数**，过不了门槛的我不画成"好看就行"。
// 装饰件一律 CSS/SVG 画，不引一张位图——主包那 150KB 的天花板是给默认底图的，别拿装饰去挤。
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
const T = (k) => { if (!(k in ZH)) throw new Error(`i18n 里没有键 ${k}`); return ZH[k] }
const bad = []
const ck = (n, ok, d = '') => { if (!ok) bad.push(n); console.log(`${ok ? '✓' : '✗'} ${n}${d ? `　→ ${d}` : ''}`) }

/* ---------- ① 现读几何 ---------- */
const APP = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
const PB = APP.slice(APP.indexOf('page{') >= 0 ? APP.indexOf('page{') : APP.indexOf('page {'))
const tok = {}
for (const m of PB.slice(0, PB.indexOf('}')).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) tok[m[1]] = m[2].trim()
const px = (k) => { if (!tok[k]) throw new Error(`app.wxss 读不到 ${k}`); return parseInt(tok[k], 10) }
const MIND = (/src:\s*url\(data:font\/ttf;base64,([^)]+)\)/.exec(APP) || [])[1]
const CSS = fs.readFileSync(path.join(MP, 'pages/create/create.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (sel) => {
  const m = new RegExp('(^|\\})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(CSS)
  if (!m) throw new Error(`create.wxss 读不到 ${sel}`)
  const o = {}
  for (const p of m[2].split(';')) { const i = p.indexOf(':'); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim() }
  return o
}
const val = (v) => String(v).replace(/var\((--[a-z0-9-]+)\)/g, (m, k) => (k in tok ? tok[k] : m))
const num = (v, w) => { const x = parseFloat(val(v)); if (!Number.isFinite(x)) throw new Error(`NaN：${w}`); return x }
const PANEL = rule('.panel'), CARD = rule('.card'), MD = rule('.md'), BAR = rule('.bar'), SHUT = rule('.shut')
const scrim = (/\.page-scrim\s*\{[^}]*background:\s*(linear-gradient\([^;]*\))/.exec(CSS) || [])[1]
const SC = { w: 750, h: 1670 }
const G = {
  panelH: num(PANEL.height, 'panel'), padT: num(PANEL.padding, 'padT'), padX: num(PANEL.padding, 'padX'),
  radius: num(PANEL['border-radius'], 'radius'), cardR: num(CARD['border-radius'], 'cardR'),
  cardPad: num(CARD.padding, 'cardPad'), shut: num(SHUT.width, 'shut'), barH: num(BAR.height, 'bar'),
  mdFs: num(MD['font-size'], 'md'), gap: num(BAR.gap || '22rpx', 'gap'), side: 24,
  h1: px('--fs-h1'), meta: px('--fs-meta'), micro: px('--fs-micro'), title: px('--fs-title'),
}
const BG = fs.readFileSync(path.join(MP, 'assets/home-bg-portrait.jpg')).toString('base64')
const bgUrl = `url(data:image/jpeg;base64,${BG})`
ck('几何与罩子、数字字体全部现读（面板 ' + G.panelH + '、快门 ' + G.shut + '、缝 ' + G.gap + '）',
  !!scrim && !!MIND && G.panelH === 410, `罩子 ${(scrim.match(/rgba\(18, 20, 26/g) || []).length} 个暗停点`)

/* ---------- ② 四套色（每套六个面：面板／卡／井／字／描边／强调）＋现网对照 ---------- */
const P = (name, o) => Object.assign({ name }, o)
const SKINS = [
  P('现网对照（层灰·跟壁纸派生）', { face: '#CDC9C1', card: '#FFFFFF', field: '#E5E5E6', ink: '#23252C',
    edge: '#B4B0A8', accent: '#E9723D', aInk: '#2C1204', deco: 'none', on: '#23252C' }),
  P('可爱（奶油草莓）', { face: '#FBE3E9', card: '#FFFFFF', field: '#F6D2DD', ink: '#4A2530',
    edge: '#E7B9C6', accent: '#D2496B', aInk: '#FFF3F6', deco: 'dots', on: '#4A2530' }),
  P('文艺（宣纸墨竹）', { face: '#F1EBDD', card: '#FBF7EE', field: '#E4DAC6', ink: '#2C2A24',
    edge: '#C9BCA1', accent: '#A8352A', aInk: '#FBF7EE', deco: 'seal', on: '#2C2A24' }),
  P('明快（柠檬高饱和）', { face: '#F6D64A', card: '#FFFCEC', field: '#EBC53A', ink: '#23252C',
    edge: '#C9A81F', accent: '#E9723D', aInk: '#2C1204', deco: 'arc', on: '#23252C' }),
  P('静奢（夜墨铜）', { face: '#23252C', card: '#2E313A', field: '#3A3E49', ink: '#F2EFE9',
    edge: '#5A5F6B', accent: '#C98A5E', aInk: '#23180F', deco: 'hair', on: '#F2EFE9' }),
]
// 三道读数，门槛只压两处：正文（字压卡）≥4.5 与**那一圈环压卡**≥3.0。
// 为什么不拿"橙芯压卡"当门槛：现网那一档橙压白实测就 2.98，边界一直是外面那一圈环守的
// （站长 10-08 那句"白环换墨环"说的就是这件事），拿 3.0 去压橙芯会把现网自己判红。
// 环这一档不手填浓度：直接用 `palette.layerEdgeOf(卡)` 那一架梯子，与现网同一个口径。
const blend = (fg, bg) => {
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(fg)
  if (!m) return fg
  const a = parseFloat(m[4]), H = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const B = H(bg), C = [1, 2, 3].map((i) => parseInt(m[i], 10))
  return '#' + C.map((v, i) => Math.round(v * a + B[i] * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase()
}
// 现网那架 `layerEdgeOf` 只往"墨压背景"一边走（LAYER_INK 一支），暗底上任何墨浓度都到不了 3.0，
// 它会回 alpha=1——画出来就是"环与卡同色、等于没画"。所以深底那一套得反过来用**纸白**描边。
// 这一条不是稿子上偷偷绕过去的变通，是要写进 palette.js 的缺口：见本节末那条读数。
const edgeOn = (bg) => {
  const ink = blend(palette.layerEdgeOf(bg), bg)
  if (palette.crOf(ink, bg) >= 3.0) return { ring: ink, side: '墨' }
  for (let a = 0.05; a <= 1.0001; a += 0.05) {
    const c = blend(`rgba(242,239,233,${a.toFixed(2)})`, bg)
    if (palette.crOf(c, bg) >= 3.0) return { ring: c, side: '纸白' }
  }
  return { ring: bg, side: '到不了' }
}
const rows = SKINS.map((s) => {
  const e = edgeOn(s.card)
  s.ring = e.ring
  return { s, ring: e.ring, side: e.side, body: palette.crOf(s.ink, s.card),
    ringCr: palette.crOf(e.ring, s.card), acc: palette.crOf(s.accent, s.card),
    card: palette.crOf(s.card, s.face), edge: palette.crOf(s.edge, s.face) }
})
ck('四套＋对照：每套"字压卡"都过正文门槛 4.5',
  rows.every((r) => r.body >= 4.5), rows.map((r) => `${r.s.name.slice(0, 2)} ${r.body.toFixed(2)}`).join('　'))
ck('每套"快门那一圈环压卡"都过图形门槛 3.0（浓度按梯子反解，不手填）',
  rows.every((r) => r.ringCr >= 3.0),
  rows.map((r) => `${r.s.name.slice(0, 2)} ${r.ring}/${r.side} ${r.ringCr.toFixed(2)}`).join('　'))
console.log('·橙芯压卡（只报数，边界由环守）：' +
  rows.map((r) => `${r.s.name.slice(0, 2)} ${r.acc.toFixed(2)}`).join('　'))
const weak = rows.filter((r) => r.card < 1.15).map((r) => r.s.name)
console.log(`·卡压面不足 1.15（分层只能靠描边撑）：${weak.join('、') || '无'}`)

/* ---------- ③ 画 ---------- */
const LAY = { padX: 30, slot: 398, colW: 380, gap: 24, scale: 0.53 }
const CELL_W = LAY.slot + 10 + LAY.colW, PITCH = CELL_W + LAY.gap, COLS = 2
const css = `
@font-face{font-family:'WtsjMind';src:url(data:font/ttf;base64,${MIND}) format('truetype');font-weight:100}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,"PingFang SC",sans-serif;background:#EFECE6;padding:34px ${LAY.padX}px 44px;color:#14161A}
h1{font-size:27px;letter-spacing:-.4px}h1 span{font-size:15px;font-weight:400;color:#7A756C;margin-left:12px}
.lead{font-size:14.5px;line-height:1.75;color:#4A4741;margin:9px 0 20px;max-width:${2 * PITCH}px}
.grid{display:flex;flex-wrap:wrap;gap:${LAY.gap}px;align-items:flex-start}
.cell{flex:none;min-width:0;width:${CELL_W}px;display:flex;gap:10px;align-items:flex-start}
.left{flex:none;width:${LAY.slot}px;min-width:0}
.pw{width:${LAY.slot}px;overflow:hidden}
.ph{width:750px;height:1670px;border-radius:60px;overflow:hidden;position:relative;outline:2px solid #B9B6AF;transform:scale(${LAY.scale});transform-origin:top left;margin-bottom:-777px}
.cap{font-size:13px;line-height:1.6;color:#5C5850;margin-top:9px;width:${LAY.slot}px}.cap b{color:#14161A}
.col{flex:none;width:${LAY.colW}px}
.mini{position:relative;width:${LAY.colW}px;height:250px;border-radius:22px;overflow:hidden;outline:2px solid #C9C5BD}
.mini .in{position:absolute;left:0;top:0;width:750px;height:${250 / (LAY.colW / 750)}px;transform:scale(${(LAY.colW / 750).toFixed(4)});transform-origin:top left}
.mini .bgp{position:absolute;inset:0;background-image:${bgUrl};background-size:cover;background-position:center 62%}
.mini .sc{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,20,26,.55),rgba(18,20,26,.42))}
.sw{display:flex;gap:6px;margin:12px 0 8px}
.sw i{flex:1;height:38px;border-radius:9px;outline:1px solid rgba(20,22,26,.14);display:flex;align-items:flex-end;justify-content:center;font-size:9.5px;font-style:normal;color:rgba(0,0,0,.5);padding-bottom:2px}
.kv{font-size:12px;line-height:1.75;color:#4A4741}
.kv b{font-family:ui-monospace,Menlo,monospace;font-weight:600;color:#14161A}
.kv .no{color:#B3261E}
.page{position:absolute;inset:0;background:#EFE9DF}
.photo{position:absolute;inset:0;background-image:${bgUrl};background-size:cover;background-position:center}
.scrim{position:absolute;inset:0;background:${scrim}}
.nav{position:absolute;left:0;right:0;top:94px;height:90px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;color:#F2EFE9}
.h1t{position:absolute;left:32px;top:206px;font-size:${G.h1}px;font-weight:700;letter-spacing:-1px;color:#F2EFE9}
.dock{position:absolute;left:24px;right:24px;bottom:152px}
.out{display:flex;justify-content:space-between;padding:0 20px 14px;font-size:${G.meta}px;letter-spacing:1px;color:rgba(242,239,233,.56)}
.panel{position:relative;height:${G.panelH}px;border-radius:${G.radius}px;padding:${G.padT}px ${G.padX}px 14px;border:2px solid transparent;display:flex;flex-direction:column;overflow:hidden}
.modes{display:flex;justify-content:center;gap:60px;flex:none;align-items:center;height:78px}
.md{font-size:${G.mdFs}px;letter-spacing:1px;position:relative;white-space:nowrap}
.md.on::after{content:"";position:absolute;left:50%;transform:translateX(-50%);bottom:0;width:65px;height:5px;border-radius:3px;background:currentColor}
.card{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;border-radius:${G.cardR}px;margin-top:6px;border:2px solid transparent}
.crow{display:flex;align-items:center;gap:34px}
.mini2{width:130px;flex:none;display:flex;flex-direction:column;align-items:center;gap:10px}
.mine{width:130px;height:130px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.mlb{font-size:21px;font-weight:700;letter-spacing:1px}
.shut{width:${G.shut}px;height:${G.shut}px;border-radius:50%;border:10px solid transparent;display:flex;align-items:center;justify-content:center}
.core{width:132px;height:132px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.g{display:block;background:currentColor;-webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center}
.camg{width:60px;height:60px;-webkit-mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><path d='M4 8h3l2-2h6l2 2h3v11H4z'/><circle cx='12' cy='13' r='3.4'/></svg>")}
.plusg{width:66px;height:66px;-webkit-mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'><path d='M12 5v14M5 12h14'/></svg>")}
.imgg{width:40px;height:40px;-webkit-mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><rect x='3' y='6' width='15' height='13' rx='2'/><path d='M7 3h14v14'/><path d='M6 16l4-4 4 4'/></svg>")}
.linkg{width:40px;height:40px;-webkit-mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><path d='M10 14a4 4 0 0 1 0-5.6l2-2a4 4 0 1 1 5.6 5.6l-1 1'/><path d='M14 10a4 4 0 0 1 0 5.6l-2 2A4 4 0 1 1 6.4 12l1-1'/></svg>")}
/* 丁那一组（两枚数字片＋一枚圆 +），落在照片上 */
.grp{position:absolute;left:24px;right:24px;bottom:22px;display:flex;gap:${G.gap}px;align-items:flex-end}
.st{flex:none;width:150px;height:152px;border-radius:30px;display:flex;flex-direction:column;align-items:center;padding-top:18px}
.st .n{font-family:'WtsjMind','Poppins',sans-serif;font-weight:100;font-size:64px;line-height:.9}
.st .u{width:56px;height:6px;border-radius:3px;margin-top:8px}
.st .l{font-size:${G.micro}px;font-weight:700;letter-spacing:4px;margin-top:10px}
.pt{flex:none;width:152px;height:152px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-left:auto}
/* 装饰件：一律 CSS 画，零位图 */
.d-dots i,.d-dots b{position:absolute;border-radius:50%;display:block}
.d-seal{position:absolute;right:18px;top:14px;width:40px;height:40px;border-radius:8px}
.d-seal::after{content:"";position:absolute;left:9px;top:9px;width:22px;height:22px;border-radius:4px;border:3px solid rgba(255,255,255,.85)}
.d-arc{position:absolute;left:-40px;bottom:-40px;width:150px;height:150px;border-radius:50%;border:12px solid rgba(35,37,44,.14);border-top-color:transparent;border-left-color:transparent;transform:rotate(20deg)}
.d-hair{position:absolute;inset:8px;border-radius:22px;border:1px solid rgba(242,239,233,.22);pointer-events:none}
.d-hair::after{content:"";position:absolute;right:16px;top:16px;width:14px;height:14px;background:rgba(201,138,94,.85);transform:rotate(45deg)}
`
const deco = (s) => s.deco === 'none' ? '' : s.deco === 'dots'
  ? `<div class="d-dots"><i style="right:22px;top:16px;width:34px;height:34px;background:rgba(210,73,107,.16)"></i><i style="right:64px;top:34px;width:16px;height:16px;background:rgba(210,73,107,.28)"></i><b style="right:18px;top:64px;width:44px;height:10px;border-radius:6px;background:rgba(210,73,107,.14)"></b></div>`
  : s.deco === 'seal' ? `<div class="d-seal" style="background:#A8352A"></div>`
    : s.deco === 'arc' ? `<div class="d-arc"></div><div style="position:absolute;right:20px;top:18px;display:flex;gap:8px"><i style="width:14px;height:14px;border-radius:50%;background:#23252C;display:block"></i><i style="width:14px;height:14px;border-radius:50%;background:#E9723D;display:block"></i><i style="width:14px;height:14px;border-radius:50%;background:rgba(35,37,44,.28);display:block"></i></div>`
      : `<div class="d-hair"></div>`
const panelOf = (s) => `<div class="panel" style="background:${s.face};border-color:${s.edge};color:${s.ink}">
  ${deco(s)}
  <div class="modes"><div class="md on" style="color:${s.ink};font-weight:600">${T('modePhoto')}</div><div class="md" style="color:${s.ink}88">${T('modeUrl')}</div><div class="md" style="color:${s.ink}88">${T('modeWrite')}</div></div>
  <div class="card" style="background:${s.card};border-color:${s.edge}">
    <div class="crow">
      <div class="mini2"><div class="mine" style="background:${s.field};color:${s.ink}"><span class="g imgg"></span></div><div class="mlb" style="color:${s.ink}cc">${T('fromAlbum')}</div></div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px"><div class="shut" style="border-color:${s.ring}"><div class="core" style="background:${s.accent};color:${s.aInk}"><span class="g camg"></span></div></div><div class="mlb" style="color:${s.ink};font-size:${G.meta}px">${T('takePhoto')}</div></div>
      <div class="mini2"><div class="mine" style="background:${s.field};color:${s.ink}"><span class="g linkg"></span></div><div class="mlb" style="color:${s.ink}cc">${T('modeUrl')}</div></div>
    </div>
  </div></div>`
const groupOf = (s) => `<div class="grp">
  <div class="st" style="background:${s.card};color:${s.ink}"><div class="n">128</div><div class="u" style="background:${s.accent}55"></div><div class="l" style="color:${s.ink}9e">${T('statNotes')}</div></div>
  <div class="st" style="background:${s.card};color:${s.ink}"><div class="n">46</div><div class="u" style="background:${s.accent}55"></div><div class="l" style="color:${s.ink}9e">${T('slotCard')}</div></div>
  <div class="pt" style="background:${s.accent};color:${s.aInk}"><span class="g plusg"></span></div></div>`
const phoneOf = (s) => `<div class="left"><div class="pw"><div class="ph"><div class="page"></div><div class="photo"></div><div class="scrim"></div>
  <div class="nav">${T('appName')}</div><div class="h1t">${T('createHeading')}</div>
  <div class="dock"><div class="out"><span>${T('chooseMode')}</span><span>${T('barCollapse')}</span></div>${panelOf(s)}</div></div></div>
  <div class="cap"><b>${s.name}</b>：录入面板 410 那一态。字压卡 <b>${palette.crOf(s.ink, s.card).toFixed(2)}</b>（门槛 4.5）、那一圈环压卡 <b>${palette.crOf(s.ring, s.card).toFixed(2)}</b>（门槛 3.0，浓度按梯子反解：浅底走墨、<b>深底得反过来走纸白</b>——现网 <code>layerEdgeOf</code> 只有墨那一档，深底上它会回 alpha=1、等于没画）、橙芯压卡 ${palette.crOf(s.accent, s.card).toFixed(2)}（现网同一档就是 2.98，边界一直是环守的）、卡压面板 ${palette.crOf(s.card, s.face).toFixed(2)}。</div></div>`
// mini 里那条丁是**按 750 宽画完再整体缩**的（`.in` 那层 scale）：380px 的框塞不下 702 那一排
// （两枚片＋一枚圆要 474），圆 + 会被 overflow 裁掉——第一版就是这么漏的，产物上只量到 326 px。
const miniOf = (s) => `<div class="mini"><div class="bgp"></div><div class="sc"></div><div class="in">${groupOf(s)}</div></div>`
const swOf = (s) => `<div class="sw">${['face', 'card', 'field', 'ink', 'edge', 'accent'].map((k) =>
  `<i style="background:${s[k]}">${s[k]}</i>`).join('')}</div>`
const CELL = (s) => `<div class="cell">${phoneOf(s)}<div class="col">${miniOf(s)}${swOf(s)}
  <div class="kv">上面那一条是<b>丁那一组落在照片上</b>（收起态）。两枚数字片用这套的<b>卡</b>那一色、圆 + 用<b>强调</b>那一色。<br>
  装饰件：<b>${{ none: '无（现网）', dots: '两枚半透明圆点＋一条胶囊点', seal: '一枚朱砂方印（描白框）', arc: '四分之一圆弧＋三枚大圆点', hair: '一道内勾细线＋一枚菱形' }[s.deco]}</b>，全部 CSS 画、<b>零位图</b>（主包那 150KB 是给默认底图的）。</div></div></div>`
const HTML = `<!doctype html><meta charset="utf-8"><style>${css}</style>
<h1>面板配色：四套方向，每套同时上在"录入面板"与"丁那一组"上<span>站长 10-10「给几个配色方案，可爱风，文艺范，等；加些小装饰图片，抽象一点」</span></h1>
<div class="lead">左边那台是<b>录入面板 410 展开那一态</b>（几何全现读：面板 410、内缩 24、快门 180、卡内那一排居中）；右边最上面那一条是<b>刚拍定的丁</b>（两枚数字片＋一枚圆 +）<b>落在照片上</b>那一态——因为这两处的底色不是同一件事：面板压在浅面上，丁那组压在暗罩＋人像上。<br>
每套下面那排色块是它自己的六个面，读数都是 <code>palette.crOf</code> 现算的：<b>正文门槛 4.5、图形门槛 3.0</b>（3.0 那条是站长拍过的）。<br>
⚠ 一条口径要先说：现网面板底色是<b>跟壁纸派生</b>的（<code>listLayerOf</code>，象牙/天青/樱落/雨雾四档）。再加一层"风格"就有两套真相——<b>要么风格覆盖派生（选了就固定，壁纸不再影响面板）</b>，<b>要么风格只调装饰件与强调色、底色仍跟壁纸</b>。这一条得你定，稿上我先按"覆盖"画（不然四套色看不出差）。<br>
⚠ 另一条：外观设置那一页你 09-30 刚撤掉"背景图"那一节（一个功能只留一个入口）。这一层如果要能选，入口放哪儿、跟壁纸那四档怎么并存，是另一个决定，<b>我不擅自加</b>。</div>
<div class="grid">${rows.map((r) => CELL(r.s)).join('')}</div>`

const OUT_HTML = path.join(DIR, '面板配色四套.html')
const leaked = css.match(/[:\s]-?[\d.]+rpx/g) || []
ck('CSS 里没有漏网的 rpx（浏览器不认，整条声明静默失效）', leaked.length === 0, leaked.join(' '))
const open = (HTML.match(/<div\b/g) || []).length, close = (HTML.match(/<\/div>/g) || []).length
ck(`HTML 里 <div> 与 </div> 数量相等（${open}）`, open === close, `开 ${open} 闭 ${close} 差 ${open - close}`)
fs.writeFileSync(OUT_HTML, HTML)
const PNG = path.join(DIR, '面板配色四套.png')
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
   '--window-size=1700,4000', `--screenshot=${PNG}`, '--virtual-time-budget=12000', 'file://' + OUT_HTML],
  { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] })
if (!fs.existsSync(PNG)) throw new Error('PNG 没出来')
execFileSync('python3', ['-c', `
from PIL import Image
im=Image.open(${JSON.stringify(PNG)}).convert('RGB'); W,H=im.size; px=im.load()
BG=(239,236,230)
def blank(y): return all(abs(px[x,y][i]-BG[i])<=4 for x in range(0,W,7) for i in range(3))
last=H-1
while last>0 and blank(last): last-=1
if last<H-1: im.crop((0,0,W,min(H,last+34))).save(${JSON.stringify(PNG)})`], { encoding: 'utf8' })

/* ---------- ④ 在产物上量：每一格右边那条 mini 里，卡色与强调色都真的画到了 ---------- */
const audit = JSON.parse(execFileSync('python3', ['-c', `
import json
from PIL import Image
im=Image.open(${JSON.stringify(PNG)}).convert('RGB'); W,H=im.size; px=im.load()
def hx(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))
SK=[{'card':hx(c),'acc':hx(a)} for c,a in ${JSON.stringify(SKINS.map((s) => [s.card, s.accent]))}]
OUT=hx('#C9C5BD'); PITCH=${PITCH}; PADX=${LAY.padX}; COLS=${COLS}; SLOT=${LAY.slot}; COLW=${LAY.colW}
def near(a,b,t=6): return all(abs(a[i]-b[i])<=t for i in range(3))
# 锚点用 mini 自己那圈外框（#C9C5BD，全图只有它在用）。注意这个框**上下两条边都会命中**，
# 所以按"离上一条保留的超过 300px 才算新的一格顶边"过一遍（框高 250，上下两条边差 250＜300）。
minis=[]
for c in range(COLS):
    x0=PADX+PITCH*c+SLOT+10; x1=x0+COLW
    ys=[y for y in range(H) if sum(1 for x in range(x0+8,x1-8,6) if near(px[x,y],OUT,10))>len(range(x0+8,x1-8,6))*0.8]
    cl=[]
    for y in ys:
        if cl and y-cl[-1][-1]<=6: cl[-1].append(y)
        else: cl.append([y])
    last=-999
    for g in cl:
        if g[0]-last>300: minis.append((c,g[0])); last=g[0]
minis.sort()
out=[]
for i in range(len(SK)):
    c=i%COLS; r=i//COLS
    hit=[m for m in minis if m[0]==c]
    if r>=len(hit): out.append({'i':i,'card':0,'acc':0,'why':'格顶没找到'}); continue
    x0=PADX+PITCH*c+SLOT+14; y0=hit[r][1]+4
    card=acc=0
    for y in range(y0,min(H,y0+244)):
        for x in range(x0,min(W,x0+COLW-8)):
            p=px[x,y]
            if near(p,SK[i]['card']): card+=1
            if near(p,SK[i]['acc']): acc+=1
    out.append({'i':i,'card':card,'acc':acc})
print(json.dumps(out))`], { encoding: 'utf8' }))
ck('五格都渲出来了：每格右边那条 mini 里"卡"那一色与"强调"那一色都画到了（各 >200 px）',
  audit.every((a) => a.card > 200 && a.acc > 200),
  audit.map((a) => `${a.i} 卡${a.card}/调${a.acc}`).join(' '))
console.log('产物：' + PNG)
if (bad.length) { console.log(`✗ ${bad.length} 条不过：` + bad.join(' / ')); process.exit(1) }
console.log('✓ 全过')
