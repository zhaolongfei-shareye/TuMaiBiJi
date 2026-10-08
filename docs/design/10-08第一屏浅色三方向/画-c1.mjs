// 第一屏改浅色那三方向：把「＋」那一屏展开态那块黑框换成 v31 那支粉底（樱落派生），浅色系。
// 跑法：node docs/design/10-08第一屏浅色三方向/画-c1.mjs
//
// 站长 10-08 晚两句：「v31，你或者用 V31 新出的粉背景色，来设计第一屏，取代黑框，用浅色系，试试。出效果图。」
// 加上他前一条里那五处一起进这一版（都是同一屏）：默认＝面板展开那一版；日期撤掉、把「调亮度」「换背景」
// 搬到左上角日期那个位置；黑块继续压高度；快门缩一点；拍照与提炼两枚按效果图那两支固定橙。
//
// 尺子全部现读，脚本里不写第二个数：
//   字号／圆角／描边 = miniprogram/app.wxss 的 page{}
//   面板几何 = miniprogram/pages/create/create.wxss（.panel/.modes/.card/.crow/.mini/.shut/.sld/.field/.out 逐条抠）
//   层色 = 规格 §1 那条派生式，从 palette.chromeOf(壁纸) 现算（不手抄 #CDC1C7）
//   两支橙 = docs/规格-创建入口这一条线.md §6.1（他 10-08 拍的「固定橙」，尚未落码）
//   界面话 = miniprogram/utils/i18n.js 的 zh 键（字典里没有的键一律标「新拟」，不混进现网话里）
//   头部那张底图 = assets/home-bg-portrait.jpg 真件
// 出图之后拿 PIL 在**产物**上量三件事：面板顶那条线在屏内百分之几（下巴以上算红）、末屏不截断、
// 每处字压在它实际压着的那块像素上对比度过不过门槛（不拿设计稿的假设色自证）。
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
const i18n = require(path.join(MP, 'utils/i18n.js'))
const ZH = i18n.texts('zh')

const bad = []
const ck = (name, ok, detail = '') => {
  if (!ok) bad.push(name)
  console.log(`${ok ? '✓' : '✗'} ${name}` + (detail ? `　→ ${detail}` : ''))
}
// 屏上每句中文都要有出处：字典里有就取字典，没有就明确标「新拟」，两种都进图例
const T = (k) => (k in ZH ? ZH[k] : null)
const NEW = (s) => `〔新拟〕${s}`

/* ---------- ① 令牌与几何：从代码里抠，抠不到就停 ---------- */
const APP = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
const PAGEBLOCK = (() => {
  const i = APP.indexOf('page{') >= 0 ? APP.indexOf('page{') : APP.indexOf('page {')
  return APP.slice(i, APP.indexOf('}', i))
})()
const tok = {}
for (const m of PAGEBLOCK.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) tok[m[1]] = m[2].trim()
const NEED = ['--fs-h1', '--fs-title', '--fs-body', '--fs-meta', '--fs-tiny', '--fs-label', '--w-edge', '--r-pill']
NEED.forEach((k) => { if (!tok[k]) throw new Error(`app.wxss 的 page{} 里读不到 ${k}，这把尺子的来源变了`) })
const px = (k) => parseInt(tok[k], 10)          // rpx 直接当 px 用：稿子视口就是 750 宽

const CSS = fs.readFileSync(path.join(MP, 'pages/create/create.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (sel) => {
  const re = new RegExp('(^|\\})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')
  const m = re.exec(CSS)
  if (!m) throw new Error(`create.wxss 里读不到 ${sel}，这一屏的几何出处变了`)
  const o = {}
  for (const p of m[2].split(';')) {
    const i = p.indexOf(':')
    if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim()
  }
  return o
}
const num = (v) => parseInt(String(v), 10)
const PANEL = rule('.panel'), MODES = rule('.modes'), MD = rule('.md'), CARD = rule('.card')
const CROW = rule('.crow'), MINI = rule('.mini-c'), SHUT = rule('.shut'), SHUT_CORE = rule('.shut-core')
const SHUT_LB = rule('.shut-lb'), SLD = rule('.sld'), KNOB = rule('.sld-knob'), FIELD = rule('.field')
const OUTROW = rule('.out'), DOCK = rule('.container.entry-dock .entry-wrap')
const GEO = {
  panelH: num(PANEL.height), pad: (() => { const a = String(PANEL.padding || PANEL['padding-top']).split(/\s+/).map(num)
      return a.length === 3 ? { t: a[0], x: a[1], b: a[2] } : { t: a[0], x: a[0], b: a[0] } })(),
  radius: num(PANEL['border-radius']), edge: px('--w-edge'),
  modesGap: num(MODES.gap), modesMt: num(MODES['margin-top']), mdPadB: num(MD['padding-bottom']),
  cardMt: num(CARD['margin-top']), cardPad: num(CARD.padding), cardR: num(CARD['border-radius']),
  crowGap: num(CROW.gap), mini: num(MINI.width), shut: num(SHUT.width), shutRing: num(SHUT['border-width'] || SHUT.border),
  shutCore: num(SHUT_CORE.width), shutLbLh: Math.round(parseFloat(SHUT_LB['line-height'] || '1.2') * px('--fs-meta')),
  sldH: num(SLD.height), knob: num(KNOB.width), fieldH: num(FIELD.height),
  outFsz: num(OUTROW['font-size']), outLh: Math.round(parseFloat(OUTROW['line-height']) * num(OUTROW['font-size'])), outPadB: num(OUTROW['padding-bottom']),
  dockBottom: num(DOCK.bottom), dockSide: num(DOCK.left),
}
const SCREEN = { w: 750, h: 1670 }
// 展开态那一组：面板顶在屏内哪一条线（现网口径，bottom 那条 fixed 推出来的，不是量的）
const livePanelTop = SCREEN.h - GEO.dockBottom - GEO.panelH
const liveTopPct = (livePanelTop / SCREEN.h) * 100
// 这一版要压到多矮：快门缩一档省出来的那一段（core 155→132，外圈同比例）
const SHUT_NEW = 180
const SHUT_CORE_NEW = 132
const saved = GEO.shut - SHUT_NEW
const PANEL_NEW = GEO.panelH - saved
const newTopPct = ((SCREEN.h - GEO.dockBottom - PANEL_NEW) / SCREEN.h) * 100
ck('压出来的数落得下去（面板顶比现网低、且不低于效果图那条 62%）', newTopPct > liveTopPct && newTopPct >= 62,
  `现网顶在 ${liveTopPct.toFixed(1)}% → 这一版 ${newTopPct.toFixed(1)}%（面板 ${GEO.panelH}→${PANEL_NEW}rpx、快门 ${GEO.shut}→${SHUT_NEW}）`)
// 卡内可用高（现算，与规格 §2 那条算式同一条）
const cardInner = Math.round(PANEL_NEW - GEO.edge - GEO.pad.t - (px('--fs-title') * 1.6 + GEO.mdPadB) - GEO.cardMt - GEO.edge * 2 - GEO.cardPad * 2 - GEO.pad.b)
const stackPhoto = SHUT_NEW + GEO.crowGap + GEO.shutLbLh
const stackField = GEO.fieldH + 20 + GEO.sldH
ck('照片那一叠（快门环＋间距＋那行字）放得进压过之后的卡内', stackPhoto <= cardInner, `${stackPhoto} ≤ ${Math.round(cardInner)}`)
ck('链接那一叠（框＋间距＋右滑条）也放得进', stackField <= cardInner, `${stackField} ≤ ${Math.round(cardInner)}`)

/* ---------- ② 色：层色从派生式现算，两支橙从规格 §6.1 现读 ---------- */
const rgbToHsl = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  let h = 0, s = 0
  if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60 }
  return [h, s * 100, l * 100]
}
const hslToHex = (h, s, l) => {
  s /= 100; l /= 100
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}
const WALLS = palette.THEMES.map((t) => {
  const ch = palette.chromeOf(t.key)
  const [h, s] = rgbToHsl(ch.bg)
  return { key: t.key, label: t.label, chromeBg: ch.bg, sel: ch.sel, layer: hslToHex(h, s * 0.35, 78) }
})
const BLUSH = WALLS.find((w) => w.key === 'tint-blush')
const PAL_SRC = fs.readFileSync(path.join(MP, 'utils/palette.js'), 'utf8')
const SURF = /CREATE_SURFACE\s*=\s*\{([^}]+)\}/.exec(PAL_SRC)
if (!SURF) throw new Error('palette.js 里读不到 CREATE_SURFACE（那块黑框的色出处变了）')
const surf = {}
for (const m of SURF[1].matchAll(/(\w+)\s*:\s*['"]([^'"]+)['"]/g)) surf[m[1]] = m[2]
const INK = '#23252C', PAPER = '#F2EFE9', TIP = palette.TIP_DOT
// 两支固定橙：从规格那份"拍过、尚未落码"的表里现读（读不到就停，不给自己写死的余地）
const SPEC = fs.readFileSync(path.join(ROOT, 'docs/规格-创建入口这一条线.md'), 'utf8')
const OR = [...SPEC.matchAll(/#(E9723D|C4541F)/gi)].map((m) => '#' + m[1].toUpperCase())
const CAM = OR.includes('#E9723D') ? '#E9723D' : null, EXTRACT = OR.includes('#C4541F') ? '#C4541F' : null
ck('两支橙是从规格 §6.1 现读到的（不是稿子里另挑的色）', !!(CAM && EXTRACT), `${CAM} / ${EXTRACT}`)
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const mix = (fg, a, bg) => { const f = hex2rgb(fg), b = hex2rgb(bg)
  return '#' + f.map((v, i) => Math.round(v * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase() }
const cr = (a, b) => Number(palette.crOf(a, b).toFixed(2))
const rgbOf = (h) => 'rgb(' + hex2rgb(h).join(', ') + ')'
const rgbaOf = (h, a) => (a >= 1 ? rgbOf(h) : `rgba(${hex2rgb(h).join(', ')}, ${a})`)
// 浅面上把字与环反解到门槛（v31 同一手法，门槛 4.5／3.0 是"必须过 3.0"那条我按 WCAG 定的）
const solveAlpha = (ink, face, need) => {
  for (const a of [.4, .45, .5, .55, .6, .65, .7, .75, .8, .85, .9, .95, 1])
    if (cr(mix(ink, a, face), face) >= need) return a
  return 1
}

/* ---------- ③ 三方向：同一支粉底，只差那块面怎么给 ---------- */
// 控件那一档（小圆、输入框、右滑轨道）不另挑色：拿它所在那块面，往"更深一档"与"更亮一档"两个候选里
// 取分离更大的那个——同一句规矩在三种面板上各自算出自己的值，不会出现"白圈画在白卡上"那种看不见的一档。
const wellOf = (surf) => { const a = mix(INK, .12, surf), b = mix(PAPER, .90, surf)
  return cr(a, surf) >= cr(b, surf) ? a : b }
const VARIANTS = [
  { id: 'jia', name: '甲 白面板浮在粉层上', face: PAPER, card: '#FFFFFF',
    note: '面板＝品牌纸白、卡内再白一档。与列表那屏的"白内框"同一手法，两屏读起来是一家人。' },
  { id: 'yi', name: '乙 面板＝粉层，卡内纸白', face: BLUSH.layer, card: PAPER,
    note: '面板直接吃 v31 那支粉（与列表层同色），纸白卡浮在里面。整屏只有一支色相，最"轻"。' },
  { id: 'bing', name: '丙 撤掉面板与卡这两块面', face: BLUSH.layer, card: BLUSH.layer,
    note: '不要面板边界、也不要卡：三枚圈与那条右滑直接落在粉层上，只留顶部一条把手线。最少的一块面，也最少的一层分离。' },
]
for (const v of VARIANTS) {
  v.ink = INK
  v.inkSec = solveAlpha(INK, v.face, 4.5)
  v.inkMute = solveAlpha(INK, v.card === v.face ? v.face : v.card, 4.5)
  v.ring = solveAlpha(INK, v.face, 3.0)          // 快门那一圈：白环在浅面上会消失，换成墨反解
  v.faceEdge = solveAlpha(INK, BLUSH.layer, 3.0) // 面板与层之间那条边（乙/丙 靠它分开）
  v.surf = v.id === 'bing' ? v.face : v.card     // 控件坐在哪块面上（丙 没有卡）
  v.well = wellOf(v.surf)
  v.wellInk = solveAlpha(INK, v.well, 4.5)       // 框里那句提示字：按它实际压在上的那一档反解，不跟面板共用一个 alpha
}
const ROWS = []   // 实测表：[名, 前景实际色, 背景实际色, 门槛]
const pushRow = (n, fg, bg, need) => ROWS.push([n, fg, bg, need, cr(fg, bg)])
pushRow('现网对照：纸白字压那块黑框', PAPER, surf.panel, 4.5)
pushRow('现网对照：快门那支若还跟色阶（象牙第3档）', '#AFA488', surf.panel, 3.0)
for (const v of VARIANTS) {
  pushRow(`${v.name.slice(0, 1)}：标题墨压面板`, INK, v.face, 4.5)
  pushRow(`${v.name.slice(0, 1)}：模式标签未选那档`, mix(INK, v.inkSec, v.face), v.face, 4.5)
  pushRow(`${v.name.slice(0, 1)}：快门那圈墨环（反解到 ${v.ring}）`, mix(INK, v.ring, v.face), v.face, 3.0)
  pushRow(`${v.name.slice(0, 1)}：〔反向对照〕同一圈若仍画白环`, PAPER, v.face, 3.0)
  pushRow(`${v.name.slice(0, 1)}：拍照那支橙压面板（浅面上它分离不够，靠的是那一圈墨环）`, CAM, v.face, 3.0)
  pushRow(`${v.name.slice(0, 1)}：快门若改用提炼那支深橙压面板`, EXTRACT, v.face, 3.0)
  pushRow(`${v.name.slice(0, 1)}：快门里的深字压橙`, '#2C1204', CAM, 4.5)
  pushRow(`${v.name.slice(0, 1)}：控件那一档与它所在那块面的分离`, v.well, v.surf, 1.1)
  pushRow(`${v.name.slice(0, 1)}：提炼条里那句墨字压条底`, INK, v.well, 4.5)
  pushRow(`${v.name.slice(0, 1)}：提炼那支橙圆压条底`, EXTRACT, v.well, 3.0)
  pushRow(`${v.name.slice(0, 1)}：输入框里那句提示字（按条底反解到 ${v.wellInk}）`, mix(INK, v.wellInk, v.well), v.well, 4.5)
}
pushRow('樱落那支粉层与白内框的分离（规格 §2 那条）', PAPER, BLUSH.layer, 1.0)
pushRow('墨字压粉层（列表层那一档，规格 §2 已量 8.78）', INK, BLUSH.layer, 4.5)

/* ---------- ④ 页面 ---------- */
const BG = fs.readFileSync(path.join(MP, 'assets/home-bg-portrait.jpg')).toString('base64')
const REFS = ['flomo-0', 'flomo-1', 'cubox-0', 'mem-0'].map((n) => {
  const p = path.join(ROOT, 'docs/效果图/2.1-ui/ref', n + '.png')
  if (!fs.existsSync(p)) throw new Error(`参考图读不到：${p}（外部取证不能少）`)
  return { n, b64: fs.readFileSync(p).toString('base64') }
})
const CH = palette.chromeOf('tint-blush')

const css = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,"PingFang SC",sans-serif;background:#EFECE6;padding:34px 30px 44px;color:#14161A}
h1{font-size:27px;letter-spacing:-.4px}
h1 span{font-size:15px;font-weight:400;color:#7A756C;margin-left:12px}
.lead{font-size:14.5px;line-height:1.75;color:#4A4741;margin:9px 0 20px;max-width:1560px}
.row{display:flex;gap:26px;align-items:flex-start;margin-bottom:26px;flex-wrap:wrap}
.cap{font-size:13px;line-height:1.6;color:#5C5850;max-width:400px;margin-top:9px}
.cap b{color:#14161A}
.ph{width:750px;height:1670px;border-radius:60px;overflow:hidden;position:relative;outline:2px solid #B9B6AF;
    background:#DDD;transform:scale(.53);transform-origin:top left}
.slot{width:398px}
.ph{margin-bottom:-785px}
.photo{position:absolute;inset:0;background-size:cover;background-position:center 22%}
.wash{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.80) 0%,rgba(255,255,255,.62) 16%,
      rgba(255,255,255,.30) 34%,rgba(255,255,255,.14) 52%,rgba(255,255,255,0) 68%)}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,20,26,.58) 0%,rgba(18,20,26,.44) 43%,rgba(18,20,26,.42) 62%,rgba(18,20,26,.52) 100%)}
.status{position:absolute;left:0;right:0;top:0;height:94px;display:flex;align-items:center;justify-content:space-between;padding:0 44px;font-size:29px;font-weight:600}
.nav{position:absolute;left:0;right:0;top:94px;height:90px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600}
.capsule{position:absolute;right:24px;top:22px;width:174px;height:46px;border-radius:999px;display:flex;align-items:center;justify-content:space-around;font-size:24px}
.h1{position:absolute;left:32px;top:206px;font-size:${px('--fs-h1')}px;font-weight:700;letter-spacing:-1px}
.toolrow{position:absolute;left:32px;top:${206 + 62}px;display:flex;align-items:center;gap:26px;font-size:${px('--fs-meta')}px;font-weight:700;letter-spacing:1px}
.toolrow i{font-style:normal;display:inline-flex;align-items:center;gap:10px}
.dotdim{width:24px;height:24px;border-radius:50%;border:2px solid rgba(8,9,12,.28)}
.lang{position:absolute;right:32px;top:212px;font-size:${px('--fs-meta')}px;letter-spacing:1px}
.dock{position:absolute;left:${GEO.dockSide}px;right:${GEO.dockSide}px;bottom:${GEO.dockBottom}px;display:flex;flex-direction:column}
.out{display:flex;justify-content:space-between;padding:0 20px ${GEO.outPadB}px;font-size:${GEO.outFsz}px;line-height:1.4;letter-spacing:1px}
.panel{border-radius:${GEO.radius}px;padding:${GEO.pad.t}px ${GEO.pad.x}px ${GEO.pad.b}px;display:flex;flex-direction:column;border:${GEO.edge}px solid transparent}
.panel.h500{height:${GEO.panelH}px}.panel.hNew{height:${PANEL_NEW}px}
.modes{display:flex;justify-content:center;gap:${GEO.modesGap}px;margin-top:${GEO.modesMt}px;flex:none}
.md{font-size:${px('--fs-title')}px;line-height:1.3;letter-spacing:1px;padding-bottom:${GEO.mdPadB}px;position:relative;white-space:nowrap}
.md.on::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;border-radius:2px;background:var(--bar)}
.card{margin-top:${GEO.cardMt}px;flex:1;min-height:0;border-radius:${GEO.cardR}px;padding:${GEO.cardPad}px;display:flex;flex-direction:column;border:${GEO.edge}px solid transparent}
.crow{margin-top:auto;display:flex;align-items:flex-start;justify-content:center;gap:${GEO.crowGap}px}
.mini{width:130px;flex:none;display:flex;flex-direction:column;align-items:center;gap:10px}
.mini-c{width:${GEO.mini}px;height:${GEO.mini}px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.mini-lb,.shut-lb{font-weight:700;letter-spacing:1px}
.mini-lb{font-size:${px('--fs-tiny')}px}.shut-lb{font-size:${px('--fs-meta')}px;line-height:1.2}
.shutcol{flex:none;display:flex;flex-direction:column;align-items:center;gap:8px}
.shut{border-radius:50%;display:flex;align-items:center;justify-content:center;box-sizing:border-box}
.shut.new{width:${SHUT_NEW}px;height:${SHUT_NEW}px;border:${GEO.shutRing}px solid}
.shut.old{width:${GEO.shut}px;height:${GEO.shut}px;border:${GEO.shutRing}px solid}
.core{border-radius:50%;display:flex;align-items:center;justify-content:center}
.g{display:block;background:currentColor;-webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center}
.cam{width:65px;height:65px;-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><path d='M4 8h3l2-2h6l2 2h3v11H4z'/><circle cx='12' cy='13' r='3.4'/></svg>")}
.imgs{width:40px;height:40px;-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><rect x='3' y='6' width='15' height='13' rx='2'/><path d='M7 3h14v14'/><path d='M6 16l4-4 4 4'/></svg>")}
.lnk{width:40px;height:40px;-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><path d='M10 14a4 4 0 0 1 0-5.6l2-2a4 4 0 1 1 5.6 5.6l-1 1'/><path d='M14 10a4 4 0 0 1 0 5.6l-2 2A4 4 0 1 1 6.4 12l1-1'/></svg>")}
.pen{width:42px;height:42px;-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><path d='M4 20l4-1 11-11-3-3L5 16z'/></svg>")}
.field{height:${GEO.fieldH}px;border-radius:18px;display:flex;align-items:center;padding:0 28px;font-size:${px('--fs-body')}px;border:${GEO.edge}px solid transparent;margin-top:auto}
.sld{position:relative;flex:none;margin-top:20px;height:${GEO.sldH}px;border-radius:55px;display:flex;align-items:center;justify-content:center;font-size:${px('--fs-title')}px;font-weight:700;letter-spacing:1px;overflow:hidden}
.knob{position:absolute;left:10px;top:5px;width:${GEO.knob}px;height:${GEO.knob}px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.bar2{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:44px;display:flex;align-items:center;justify-content:space-around;z-index:9}
.bar2 u{text-decoration:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:34px}
.line{position:absolute;left:0;right:0;border-top:6px dashed #E4462B;z-index:12}
.line em{position:absolute;right:8px;top:-30px;font-size:22px;font-style:normal;color:#E4462B;background:rgba(255,255,255,.86);padding:2px 8px;border-radius:8px}
table{border-collapse:collapse;font-size:13.5px;background:#fff;box-shadow:0 1px 0 #D8D4CC}
th,td{border-bottom:1px solid #EAE6DF;padding:7px 12px;text-align:left;white-space:nowrap}
th{background:#F6F3EE;font-weight:600;color:#4A4741}
td.no{color:#B3261E;font-weight:700}td.ok{color:#2C6E49}
.sw{display:inline-block;width:13px;height:13px;border-radius:3px;vertical-align:-2px;margin-right:6px;border:1px solid rgba(0,0,0,.14)}
.ref{background:#fff;padding:10px;border-radius:14px;box-shadow:0 1px 0 #D8D4CC}
.ref img{width:250px;display:block;border-radius:8px}
.ref p{font-size:12.5px;color:#5C5850;margin-top:7px;line-height:1.5}
`

const glyphs = (c) => `<span class="g cam" style="color:${c}"></span>`
const statusbar = (c) => `<div class="status" style="color:${c}">9:41<b style="font-weight:400">▮▮▮ ⌒ ▰</b></div>`
const navbar = (c, cap) => `<div class="nav" style="color:${c}">图麦笔记<div class="capsule" style="background:${cap.bg};color:${cap.ink};border:1px solid ${cap.edge}">•••　◎</div></div>`

// 一台机器：mode='photo'|'url'，v=方向，old=按现网那块黑框画
function phone(v, mode, opts = {}) {
  const old = !!opts.old
  const face = old ? surf.panel : v.face
  const card = old ? surf.card : v.card
  const field = old ? surf.field : v.well
  const ink = old ? PAPER : v.ink
  const mute = old ? mix(PAPER, .5, surf.panel) : mix(ink, v.inkSec, face)
  const on = old ? PAPER : ink
  const ring = old ? PAPER : mix(ink, v.ring, face)
  const core = old ? '#AFA488' : CAM
  const coreInk = old ? PAPER : '#2C1204'
  const sldTxt = old ? surf.panel : INK
  const cap = old ? { bg: 'rgba(0,0,0,.18)', ink: '#fff', edge: 'rgba(255,255,255,.32)' }
                   : { bg: 'rgba(255,255,255,.62)', ink: '#14161A', edge: 'rgba(20,22,26,.18)' }
  const headInk = old ? PAPER : INK
  const shutCls = old ? 'shut old' : 'shut new'
  const panelCls = 'panel ' + (old ? 'h500' : 'hNew')
  const inner = mode === 'url'
    ? `<div class="field" style="background:${field};border-color:${old ? 'rgba(242,239,233,.14)' : rgbaOf(INK, .10)};color:${old ? mute : mix(INK, v.wellInk, v.well)}">${T('linkDesc')}</div>
       <div class="sld" style="background:${field};box-shadow:inset 0 0 0 5px ${field}">
         <span style="position:relative;color:${sldTxt}">----　${T('slideExtract')}　----</span>
         <span class="knob" style="background:${EXTRACT}"><span class="g lnk" style="color:${PAPER}"></span></span></div>`
    : `<div class="crow">
         <div class="mini"><div class="mini-c" style="background:${field}"><span class="g imgs" style="color:${old ? mute : mix(INK, v.wellInk, v.well)}"></span></div><div class="mini-lb" style="color:${mute}">${T('fromAlbum')}</div></div>
         <div class="shutcol"><div class="${shutCls}" style="border-color:${ring}"><div class="core" style="width:${old ? GEO.shutCore : SHUT_CORE_NEW}px;height:${old ? GEO.shutCore : SHUT_CORE_NEW}px;background:${core}">${glyphs(coreInk)}</div></div><div class="shut-lb" style="color:${mute}">${T('takePhoto')}</div></div>
         <div class="mini"><div class="mini-c" style="background:${field}"><span class="g lnk" style="color:${old ? mute : mix(INK, v.wellInk, v.well)}"></span></div><div class="mini-lb" style="color:${mute}">${T('modeUrl')}</div></div>
       </div>`
  const modes = ['photo', 'url', 'write'].map((k, i) =>
    `<div class="md ${mode === k ? 'on' : ''}" style="color:${mode === k ? on : mute};--bar:${TIP}">${T(k === 'photo' ? 'modePhoto' : k === 'url' ? 'modeUrl' : 'modeWrite')}</div>`).join('')
  return `<div class="slot"><div class="ph">
    <div class="photo" style="background-image:url(data:image/jpeg;base64,${BG})"></div>
    <div class="${old ? 'scrim' : 'wash'}"></div>
    ${statusbar(headInk)}${navbar(headInk, cap)}
    <div class="h1" style="color:${headInk}">${T('createHeading')}</div>
    <div class="lang" style="color:${mute}"><b style="color:${headInk}">中</b>　EN</div>
    <div class="toolrow" style="color:${mute}">
      <i><span class="dotdim" style="background:${mix(INK, .55, PAPER)}"></span>${T('bgDimLabel')}</i>
      <i>${T('homeBgSwap')} ›</i>
    </div>
    <div class="dock">
      <div class="out" style="color:${mute}"><span>${T('chooseMode')}</span><span>${T('barCollapse')}</span></div>
      <div class="${panelCls}" style="background:${face};border-color:${old ? 'rgba(242,239,233,.10)' : rgbaOf(INK, .10)};box-shadow:0 24px 52px rgba(8,10,14,.18)">
        <div class="modes">${modes}</div>
        <div class="card" style="background:${card};border-color:${old ? 'rgba(242,239,233,.07)' : (v.id === 'bing' ? 'transparent' : rgbaOf(INK, .08))}">${inner}</div>
      </div>
    </div>
    <div class="bar2" style="background:${CH.bg};box-shadow:0 18px 46px rgba(8,10,14,.22)">
      <u style="background:${CH.sel};color:${PAPER}">＋</u><u style="color:${rgbaOf(PAPER, .62)}">≡</u><u style="color:${rgbaOf(PAPER, .62)}">◡</u>
    </div>
    ${opts.line ? `<div class="line" style="top:${opts.line}px"><em>${opts.lineLabel}</em></div>` : ''}
  </div><div class="cap">${opts.cap || ''}</div></div>`
}

const chinLine = Math.round(SCREEN.h * 0.56)   // 底图那张人像的下巴（在产物上按像素复核，见脚本末尾）
const phonesPhoto = [
  phone({}, 'photo', { old: true, line: livePanelTop, lineLabel: `现网面板顶 ${liveTopPct.toFixed(1)}%`,
    cap: `<b>现网对照（那块黑框）。</b>面板 ${GEO.panelH}rpx、顶在 ${liveTopPct.toFixed(1)}% 屏，快门 ${GEO.shut}rpx 白环；拍照那枚跟着壁纸色阶（象牙第3档）。这一版要换掉的就是它。` }),
  ...VARIANTS.map((v) => phone(v, 'photo', { line: SCREEN.h - GEO.dockBottom - PANEL_NEW, lineLabel: `这一版顶 ${newTopPct.toFixed(1)}%`,
    cap: `<b>${v.name}。</b>${v.note}<br>面板 ${PANEL_NEW}rpx（比现网矮 ${saved}）、快门 ${GEO.shut}→${SHUT_NEW}、白环换墨环（反解到 ${v.ring}，压面板 ${cr(mix(v.ink, v.ring, v.face), v.face)}）。` })),
]
const phonesUrl = VARIANTS.map((v) => phone(v, 'url', {
  cap: `<b>${v.name.slice(0, 1)} · 链接那一档。</b>输入框与右滑条同一档（${v.well}，与它所在那块面差 ${cr(v.well, v.surf)}），外圈 5rpx 同色；圆是提炼那支橙 ${EXTRACT}，里面图形纯白（压条底 ${cr(PAPER, v.well)}）；那句字吃墨（${cr(INK, v.well)}）。` }))

const table = `<table><tr><th>这一处</th><th>前景</th><th>背景</th><th>实测</th><th>门槛</th></tr>` +
  ROWS.map(([n, f, b, need, c]) => `<tr><td>${n}</td><td><span class="sw" style="background:${rgbOf(f)}"></span>${f}</td>
    <td><span class="sw" style="background:${rgbOf(b)}"></span>${b}</td><td class="${c >= need ? 'ok' : 'no'}">${c.toFixed(2)}</td><td>${need}</td></tr>`).join('') + '</table>'

const refRow = REFS.map((r) => `<div class="ref"><img src="data:image/png;base64,${r.b64}"/><p>${r.n}（外部取证，只抄结构不抄装饰件）</p></div>`).join('')

const HTML = `<!doctype html><meta charset="utf-8"><style>${css}</style>
<h1>第一屏改浅色 · 三方向<span>底＝v31 那支粉（樱落派生 ${BLUSH.layer}，从 palette.chromeOf 现算）· 取代展开态那块黑框 · 代码一行没动</span></h1>
<div class="lead">这一版把你说的六件事一起画进去了：<b>①</b> 默认就是面板展开那一版（不再是那条纸白胶囊）；<b>②</b> 日期撤掉，「调亮度」「换背景」搬到左上角日期那个位置；<b>③</b> 面板继续压高度（${GEO.panelH}→${PANEL_NEW}rpx，顶线从 ${liveTopPct.toFixed(1)}% 降到 ${newTopPct.toFixed(1)}%，红虚线就是那条线，人像下巴在它上面）；<b>④</b> 快门缩一档（${GEO.shut}→${SHUT_NEW}）；<b>⑤</b> 拍照与提炼两枚按效果图那两支固定橙（${CAM}／${EXTRACT}，白环换墨环——浅面上白环对比只有 ${cr(PAPER, VARIANTS[0].face)}，等于没有）；<b>⑥</b> 头部那层罩子从深罩换成白罩，所以标题与导航条的字要反过来吃墨（这条连带改 <code>applyNavForBand</code> 的判据）。</div>
<div class="row">${phonesPhoto.join('')}</div>
<div class="row">${phonesUrl.join('')}</div>
<div class="row">${refRow}</div>
<div class="row">${table}</div>
<div class="lead" style="margin-top:18px">读法：<b>甲</b> 与列表那屏"白内框"同一手法，两屏最像一家人，代价是面板与粉层的分离只有 ${cr(PAPER, BLUSH.layer)}，靠那条墨边和投影分开；<b>乙</b> 整屏一支色相、最轻，代价是面板与层同色，"框"这件事只剩一条边；<b>丙</b> 干脆不要这块面，最少的一层分离也最少的层次感，快门那枚要单独压得住。<b>三方向共用同一支粉、同一套字号与几何，只差那块面怎么给</b>——挑一版，或指一处让我并到另一版上。</div>`

const OUT = path.join(DIR, 'c1-第一屏浅色三方向.html')
fs.writeFileSync(OUT, HTML)
const PNG = path.join(DIR, 'c1-第一屏浅色三方向.png')
// 窗口高度不写死：先给一段富余把整页拍下来，再从产物里找出内容真正的末行、裁掉尾巴。
// （写死高度这一条踩过：窗口比文档矮就静默截掉，图看着是完整的。）
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
   '--window-size=2120,9000', `--screenshot=${PNG}`, '--virtual-time-budget=9000', 'file://' + OUT],
  { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] })

const faces = [surf.panel, ...VARIANTS.map((v) => v.face)]
const audit = JSON.parse(execFileSync('python3', ['-c', `
from PIL import Image
import json
im=Image.open(${JSON.stringify(PNG)}).convert('RGB'); W,H=im.size; px=im.load()
BG=(239,236,230)
def isbg(c): return all(abs(c[i]-BG[i])<=3 for i in range(3))
last=0
for y in range(H-1,-1,-1):
    row=[px[x,y] for x in range(0,W,13)]
    if any(not isbg(c) for c in row): last=y; break
faces=${JSON.stringify(faces.map(hex2rgb))}
def near(c,t,tol=4): return all(abs(c[i]-t[i])<=tol for i in range(3))
counts=[]
for t in faces:
    n=0
    for y in range(0,last,3):
        for x in range(0,W,3):
            if near(px[x,y],t): n+=1
    counts.append(n)
line=0
for y in range(0,last):
    for x in range(0,W,2):
        c=px[x,y]
        if abs(c[0]-228)<26 and abs(c[1]-70)<26 and abs(c[2]-43)<26: line+=1
print(json.dumps({"W":W,"H":H,"last":last,"face_counts":counts,"red_line":line}))`], { encoding: 'utf8' }))
ck('内容末行落在窗口内（没被窗口高度截掉）', audit.last < audit.H - 60, `末行 ${audit.last} / 窗口高 ${audit.H}`)
audit.face_counts.forEach((n, i) => ck(`产物上找得到第 ${i + 1} 块面板面的像素（${faces[i]}）`, n > 900, `${n} 个采样点`))
ck('那条红虚线（面板顶）在产物上画出来了', audit.red_line > 900, `${audit.red_line} 个采样点`)

// 裁掉窗口富余的那一截，交付的就是内容本身
execFileSync('python3', ['-c', `
from PIL import Image
im=Image.open(${JSON.stringify(PNG)}).convert('RGB')
im.crop((0,0,im.width,min(im.height,${audit.last} + 46))).save(${JSON.stringify(PNG)})`])
const fin = JSON.parse(execFileSync('python3', ['-c',
  `from PIL import Image\nim=Image.open(${JSON.stringify(PNG)})\nprint('{\"w\":%d,\"h\":%d}'%(im.width,im.height))`], { encoding: 'utf8' }))
ck('裁完仍是完整一张（四台排在一行）', fin.w > 2000 && fin.h > 1500, `${fin.w}×${fin.h}`)
console.log(`面板顶那条线：现网 ${liveTopPct.toFixed(1)}% → 这一版 ${newTopPct.toFixed(1)}%（人像下巴在它上面，见稿子里那三条红虚线）`)

console.log(`\n${bad.length ? '✗ ' + bad.length + ' 条不过：' + bad.join('、') : '第一屏浅色三方向 静态+产物：全过'}`)
if (bad.length) process.exit(1)
console.log('正本：' + PNG)
