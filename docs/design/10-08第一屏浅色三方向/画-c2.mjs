// 第一屏第二版：麦色（四套里第一套「象牙」）那一族做面板，白卡放大留白，背景带压矮。
// 跑法：node docs/design/10-08第一屏浅色三方向/画-c2.mjs
//
// 站长 10-08 晚连着三句：「官方默认色是麦色，你用这种色阶来设计」「乙方案，但白部分要大一点，
// 背景尽量空间小点，突出白色」「就是四个色第一个」→ 落成本稿：结构走 c1 的乙（面板吃层色那一档、
// 卡内白），色换成象牙那一族，白卡吃更大的屏占比，背景那条人像带压矮。
//
// 三档只差"白让出多少、背景退多少"：A 白卡 24% 屏 / B 27.5% / C 33.5%，面板顶随之从 53.8% 抬到 44.2%。
// 抬上去之后人像会不会被挡？——背景带与面板顶一起往下排，带底边就是那条蓝虚线，红虚线是面板顶；
// 下巴必须留在红虚线上面，这一版按产物复核（脚本末尾在 PNG 上量，不靠稿子的假设色自证）。
//
// 尺子全部现读：字号／描边 = app.wxss 的 page{}；面板几何 = create.wxss 逐条抠；
// 层色 = 规格 §1 那条派生式从 palette.chromeOf('tint-paper') 现算；两支橙 = 规格-创建入口 §6.1；
// 界面话 = utils/i18n.js 的 zh 键（字典里没有的一律标〔新拟〕）；底图 = assets/home-bg-portrait.jpg 真件。
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
const T = (k) => { if (!(k in ZH)) throw new Error(`i18n 里没有键 ${k}——屏上不许出现字典外的界面话`); return ZH[k] }

const bad = []
const ck = (n, ok, d = '') => { if (!ok) bad.push(n); console.log(`${ok ? '✓' : '✗'} ${n}` + (d ? `　→ ${d}` : '')) }

/* ---------- ① 令牌与面板几何（现读） ---------- */
const APP = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
const PB = APP.slice(APP.indexOf('page{') >= 0 ? APP.indexOf('page{') : APP.indexOf('page {'))
const tok = {}
for (const m of PB.slice(0, PB.indexOf('}')).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) tok[m[1]] = m[2].trim()
const px = (k) => { if (!tok[k]) throw new Error(`app.wxss 读不到 ${k}`); return parseInt(tok[k], 10) }
const CSS = fs.readFileSync(path.join(MP, 'pages/create/create.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (sel) => {
  const m = new RegExp('(^|\\})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(CSS)
  if (!m) throw new Error(`create.wxss 读不到 ${sel}，几何出处变了`)
  const o = {}
  for (const p of m[2].split(';')) { const i = p.indexOf(':'); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim() }
  return o
}
const n = (v) => parseInt(String(v), 10)
const PANEL = rule('.panel'), MODES = rule('.modes'), MD = rule('.md'), CARD = rule('.card')
const CROW = rule('.crow'), MINI = rule('.mini-c'), SHUT = rule('.shut'), SHUT_CORE = rule('.shut-core')
const SHUT_LB = rule('.shut-lb'), SLD = rule('.sld'), KNOB = rule('.sld-knob'), FIELD = rule('.field')
const OUTROW = rule('.out'), DOCK = rule('.container.entry-dock .entry-wrap')
const G = {
  edge: px('--w-edge'), padT: n(PANEL.padding), padX: n(PANEL['padding-left']), padB: (() => {
    const a = String(PANEL.padding).split(/\s+/).map(n); return a.length === 3 ? a[2] : a[0] })(),
  radius: n(PANEL['border-radius']), modesMt: n(MODES['margin-top']), mdPadB: n(MD['padding-bottom']),
  mdGap: n(MODES.gap), cardMt: n(CARD['margin-top']), cardPad: n(CARD.padding), cardR: n(CARD['border-radius']),
  crowGap: n(CROW.gap), mini: n(MINI.width), shut: n(SHUT.width), ring: n(SHUT['border-width']),
  core: n(SHUT_CORE.width), shutLbLh: Math.round(parseFloat(SHUT_LB['line-height']) * px('--fs-meta')),
  sldH: n(SLD.height), knob: n(KNOB.width), fieldH: n(FIELD.height), outPadB: (() => { const a = String(OUTROW.padding || OUTROW['padding-bottom']).split(/\s+/).map(n)
      return a.length === 3 ? a[2] : a[0] })(),
  outH: 0,
  bottom: n(DOCK.bottom), side: n(DOCK.left), liveH: n(PANEL.height),
}
const SC = { w: 750, h: 1670 }
// .out 的 font-size 写的是 var(--fs-meta)，所以字号从令牌表里取，别 n() 那个 var() 串（那会得到 NaN）
G.outH = Math.round(parseFloat(OUTROW['line-height']) * px('--fs-meta')) + G.outPadB
const liveTop = SC.h - G.bottom - G.liveH
// 这一版：快门缩一档（沿用 c1 那档），面板反而放大——多出来的高度全给白卡那一段留白
const SHUT_NEW = 180, CORE_NEW = 132
const MODES_H = px('--fs-title') * 1.6 + G.mdPadB
const cardOf = (ph) => ph - G.edge - G.padT - MODES_H - G.cardMt - G.edge * 2 - G.cardPad * 2 - G.padB
const innerOf = (ph) => cardOf(ph) - G.edge * 2 - G.cardPad * 2
const VARIANTS = [
  { id: 'A', ph: 620, name: 'A 白卡 24% 屏', band: 0.47 },
  { id: 'B', ph: 700, name: 'B 白卡 27.5% 屏', band: 0.425 },
  { id: 'C', ph: 780, name: 'C 白卡 33.5% 屏', band: 0.38 },
]
for (const v of VARIANTS) {
  v.top = SC.h - G.bottom - v.ph
  v.topPct = (v.top / SC.h) * 100
  v.bandH = Math.round(SC.h * v.band)
  v.card = cardOf(v.ph)
  v.cardPct = (v.card / SC.h) * 100
  v.stackPhoto = SHUT_NEW + G.crowGap + G.shutLbLh
  v.stackField = G.fieldH + 20 + G.sldH
  ck(`${v.id}：背景带底边在面板顶之上（带与面板之间留出那句小字的一段）`, v.bandH + G.outH + 12 <= v.top,
    `带底 ${v.bandH} + 那句小字 ${G.outH} ≤ 面板顶 ${v.top}`)
  ck(`${v.id}：照片那一叠放得进白卡（还剩下大量留白）`, v.stackPhoto <= innerOf(v.ph),
    `${v.stackPhoto} ≤ ${innerOf(v.ph)}，白卡 ${v.card}px ≈ 屏高 ${v.cardPct.toFixed(1)}%`)
  ck(`${v.id}：链接那一叠也放得进`, v.stackField <= innerOf(v.ph), `${v.stackField} ≤ ${innerOf(v.ph)}`)
}
ck('三档都是把面板抬高、把背景压矮（相对现网）', VARIANTS.every((v) => v.top < liveTop && v.bandH < liveTop),
  `现网面板顶 ${((liveTop / SC.h) * 100).toFixed(1)}% → 这一版 ${VARIANTS.map((v) => v.topPct.toFixed(1) + '%').join(' / ')}；背景带 ${VARIANTS.map((v) => (v.band * 100).toFixed(1) + '%').join(' / ')}`)

/* ---------- ② 色：麦色阶（象牙）现算，两支橙从规格现读 ---------- */
const rgbToHsl = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  let h = 0, s = 0
  if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60 }
  return [h, s * 100, l * 100]
}
const hslToHex = (h, s, l) => { s /= 100; l /= 100
  const k = (x) => (x + h / 30) % 12, a = s * Math.min(l, 1 - l)
  const f = (x) => l - a * Math.max(-1, Math.min(k(x) - 3, Math.min(9 - k(x), 1)))
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase() }
const IVORY = palette.THEMES.find((t) => t.key === 'tint-paper')
const CH = palette.chromeOf('tint-paper')
const [ih, is] = rgbToHsl(CH.bg)
const LAYER = hslToHex(ih, is * 0.35, 78)          // 规格 §1：层色＝底栏那一支 H、S×0.35、L78
const RAMP = IVORY.ramp.steps                        // 麦色阶五档（现读，不手抄）
const PAGE = IVORY.page
const PAL = fs.readFileSync(path.join(MP, 'utils/palette.js'), 'utf8')
const SURF = /CREATE_SURFACE\s*=\s*\{([^}]+)\}/.exec(PAL)
const surf = {}
for (const m of SURF[1].matchAll(/(\w+)\s*:\s*['"]([^'"]+)['"]/g)) surf[m[1]] = m[2]
const SPEC = fs.readFileSync(path.join(ROOT, 'docs/规格-创建入口这一条线.md'), 'utf8')
const CAM = /#E9723D/i.test(SPEC) ? '#E9723D' : null, EXTRACT = /#C4541F/i.test(SPEC) ? '#C4541F' : null
ck('两支橙是从规格 §6.1 现读到的', !!(CAM && EXTRACT), `${CAM} / ${EXTRACT}`)
ck('层色与规格 §2 那张表里象牙那一行对得上（现算，不是抄）', LAYER === '#CDC9C1', `算出来 ${LAYER}`)
const INK = '#23252C', PAPER = '#F2EFE9', WHITE = '#FFFFFF', TIP = palette.TIP_DOT
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const mix = (f, a, b) => { const F = hex2rgb(f), B = hex2rgb(b)
  return '#' + F.map((v, i) => Math.round(v * a + B[i] * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase() }
const cr = (a, b) => Number(palette.crOf(a, b).toFixed(2))
const rgbOf = (h) => 'rgb(' + hex2rgb(h).join(', ') + ')'
const rgbaOf = (h, a) => (a >= 1 ? rgbOf(h) : `rgba(${hex2rgb(h).join(', ')}, ${a})`)
const solve = (ink, face, need) => { for (const a of [.3, .35, .4, .45, .5, .55, .6, .65, .7, .75, .8, .85, .9, .95, 1]) if (cr(mix(ink, a, face), face) >= need) return a; return 1 }
// 控件那一档：拿它所在那块面，往"更深一档"与"更亮一档"两个候选里取分离更大的那个
const wellOf = (s) => { const a = mix(INK, .12, s), b = mix(PAPER, .90, s); return cr(a, s) >= cr(b, s) ? a : b }
const FACE = LAYER, CARD_C = WHITE
const WELL = wellOf(CARD_C), WELL_INK = solve(INK, WELL, 4.5)
const RING = solve(INK, FACE, 3.0), RING_IN = solve(INK, CARD_C, 3.0)
const ROWS = []
const row = (l, f, b, need, note) => ROWS.push({ l, f, b, need, c: cr(f, b), note })
row('现网对照：纸白字压那块黑框', PAPER, surf.panel, 4.5)
row('现网对照：快门若还跟色阶（象牙第3档）压黑框', RAMP[2], surf.panel, 3.0)
row('麦色面板与页面底（象牙 page）的分离', FACE, PAGE, 1.1, '〔这一条是"面板看不看得见"，不是文字门槛〕')
row('白卡与麦色面板的分离', CARD_C, FACE, 1.1, '大留白靠这一档＋那条墨边撑起边界')
row('墨字压白卡', INK, CARD_C, 4.5)
row('墨字压麦色面板（规格 §2 象牙那行 9.27）', INK, FACE, 4.5)
row('模式标签未选那档（按面板反解）', mix(INK, solve(INK, FACE, 4.5), FACE), FACE, 4.5)
row('框里那句提示字（按条底反解到 ' + WELL_INK + '）', mix(INK, WELL_INK, WELL), WELL, 4.5)
row('控件那一档与白卡的分离', WELL, CARD_C, 1.1, '小圆/输入框/右滑条同一档')
row('快门那圈墨环压麦面板（反解到 ' + RING + '）', mix(INK, RING, FACE), FACE, 3.0)
row('〔反向对照〕同一圈若仍画白环', PAPER, FACE, 3.0)
row('拍照那支橙压白卡', CAM, CARD_C, 3.0)
row('拍照那支橙压麦色面板', CAM, FACE, 3.0)
row('快门里那个图形：深字压橙', '#2C1204', CAM, 4.5)
row('提炼那支橙圆压条底', EXTRACT, WELL, 3.0)
row('条里那句墨字压条底', INK, WELL, 4.5)
row('底栏那支深麦（象牙 chromeOf.bg）压白卡', CH.bg, CARD_C, 3.0)
row('底栏选中那枚圆底与底栏的分离', CH.sel, CH.bg, 1.1)
row('选中那枚底下那条短杠（这一屏吃墨，不吃那支黄）', INK, FACE, 3.0)
row('〔反向对照〕黄短杠若照列表页那档搬过来（TIP_DOT 压麦色面板）', TIP, FACE, 3.0)
row('〔反向对照〕现网那条短杠吃快门色（cp-cam），搬到浅面上', CAM, FACE, 3.0)

/* ---------- ③ 页面 ---------- */
const BG = fs.readFileSync(path.join(MP, 'assets/home-bg-portrait.jpg')).toString('base64')
const REFS = ['flomo-0', 'cubox-0', 'mem-0'].map((k) => {
  const p = path.join(ROOT, 'docs/效果图/2.1-ui/ref', k + '.png')
  if (!fs.existsSync(p)) throw new Error(`参考图读不到：${p}`)
  return { k, b64: fs.readFileSync(p).toString('base64') } })
const css = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,"PingFang SC",sans-serif;background:#EFECE6;padding:34px 30px 44px;color:#14161A}
h1{font-size:27px;letter-spacing:-.4px}h1 span{font-size:15px;font-weight:400;color:#7A756C;margin-left:12px}
.lead{font-size:14.5px;line-height:1.75;color:#4A4741;margin:9px 0 20px;max-width:1900px}
.row{display:flex;gap:26px;align-items:flex-start;margin-bottom:8px;flex-wrap:wrap}
.slot{width:398px}.ph{width:750px;height:1670px;border-radius:60px;overflow:hidden;position:relative;outline:2px solid #B9B6AF;transform:scale(.53);transform-origin:top left;margin-bottom:-785px}
.cap{font-size:13px;line-height:1.65;color:#5C5850;margin-top:9px}
.page{position:absolute;inset:0;background:${PAGE}}
.photo{position:absolute;left:0;right:0;top:0;background-size:cover;background-position:center 16%}
.wash{position:absolute;left:0;right:0;top:0;background:linear-gradient(180deg,rgba(255,255,255,.82) 0%,rgba(255,255,255,.60) 26%,rgba(255,255,255,.26) 58%,rgba(255,255,255,0) 100%)}
.scrim{position:absolute;left:0;right:0;top:0;background:linear-gradient(180deg,rgba(18,20,26,.58) 0%,rgba(18,20,26,.44) 52%,rgba(18,20,26,.30) 100%)}
.status{position:absolute;left:0;right:0;top:0;height:94px;display:flex;align-items:center;justify-content:space-between;padding:0 44px;font-size:29px;font-weight:600}
.nav{position:absolute;left:0;right:0;top:94px;height:90px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600}
.capsule{position:absolute;right:24px;top:22px;width:174px;height:46px;border-radius:999px;display:flex;align-items:center;justify-content:space-around;font-size:24px}
.h1{position:absolute;left:32px;top:206px;font-size:${px('--fs-h1')}px;font-weight:700;letter-spacing:-1px}
.toolrow{position:absolute;left:32px;top:272px;display:flex;align-items:center;gap:26px;font-size:${px('--fs-meta')}px;font-weight:700;letter-spacing:1px}
.toolrow i{font-style:normal;display:inline-flex;align-items:center;gap:10px}
.dotdim{width:24px;height:24px;border-radius:50%;border:2px solid rgba(8,9,12,.28)}
.lang{position:absolute;right:32px;top:212px;font-size:${px('--fs-meta')}px}
.dock{position:absolute;left:${G.side}px;right:${G.side}px;bottom:${G.bottom}px;display:flex;flex-direction:column}
.out{display:flex;justify-content:space-between;padding:0 20px ${G.outPadB}px;font-size:${px('--fs-meta')}px;line-height:1.4;letter-spacing:1px}
.panel{height:100%;border-radius:${G.radius}px;padding:${G.padT}px ${G.padX}px ${G.padB}px;display:flex;flex-direction:column;border:${G.edge}px solid ${rgbaOf(INK, .10)};box-shadow:0 22px 46px rgba(8,10,14,.14)}
.modes{display:flex;justify-content:center;gap:${G.mdGap}px;margin-top:${G.modesMt}px;flex:none}
.md{font-size:${px('--fs-title')}px;line-height:1.3;letter-spacing:1px;padding-bottom:${G.mdPadB}px;position:relative;white-space:nowrap}
.md.on::after{content:"";position:absolute;left:0;right:0;bottom:0;height:5px;border-radius:3px;background:${INK}}
.panel.old .md.on::after{background:${RAMP[2]}}
.card{margin-top:${G.cardMt}px;flex:1;min-height:0;border-radius:${G.cardR}px;padding:${G.cardPad}px;display:flex;flex-direction:column;border:${G.edge}px solid ${rgbaOf(INK, .08)};background:${CARD_C}}
.crow{margin-top:auto;margin-bottom:auto;display:flex;align-items:flex-start;justify-content:center;gap:${G.crowGap}px}
.mini{width:130px;flex:none;display:flex;flex-direction:column;align-items:center;gap:10px}
.mini-c{width:${G.mini}px;height:${G.mini}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${WELL}}
.mini-lb{font-size:${px('--fs-tiny')}px;font-weight:700;letter-spacing:1px}
.shutcol{flex:none;display:flex;flex-direction:column;align-items:center;gap:8px}
.shut{border-radius:50%;display:flex;align-items:center;justify-content:center;box-sizing:border-box}
.core{border-radius:50%;display:flex;align-items:center;justify-content:center;background:${CAM}}
.field{margin-top:auto;margin-bottom:auto;height:${G.fieldH}px;border-radius:18px;display:flex;align-items:center;padding:0 28px;font-size:${px('--fs-body')}px;background:${WELL};border:${G.edge}px solid ${rgbaOf(INK, .08)}}
.sld{position:relative;flex:none;margin-bottom:auto;margin-top:20px;height:${G.sldH}px;border-radius:55px;display:flex;align-items:center;justify-content:center;font-size:${px('--fs-title')}px;font-weight:700;letter-spacing:1px;background:${WELL};box-shadow:inset 0 0 0 5px ${WELL}}
.knob{position:absolute;left:10px;top:5px;width:${G.knob}px;height:${G.knob}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${EXTRACT}}
.g{display:block;background:currentColor;-webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center}
.cam{width:60px;height:60px;-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><path d='M4 8h3l2-2h6l2 2h3v11H4z'/><circle cx='12' cy='13' r='3.4'/></svg>")}
.imgs{width:40px;height:40px;-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><rect x='3' y='6' width='15' height='13' rx='2'/><path d='M7 3h14v14'/><path d='M6 16l4-4 4 4'/></svg>")}
.lnk{width:40px;height:40px;-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><path d='M10 14a4 4 0 0 1 0-5.6l2-2a4 4 0 1 1 5.6 5.6l-1 1'/><path d='M14 10a4 4 0 0 1 0 5.6l-2 2A4 4 0 1 1 6.4 12l1-1'/></svg>")}
.bar2{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:44px;display:flex;align-items:center;justify-content:space-around;z-index:9;background:${CH.bg}}
.bar2 u{text-decoration:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:34px}
.line{position:absolute;left:0;right:0;border-top:6px dashed #E4462B;z-index:12}
.band{position:absolute;left:0;right:0;border-top:4px dashed #2E6BFF;z-index:12}
.line em,.band em{position:absolute;right:8px;top:-32px;font-size:21px;font-style:normal;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.88)}
.line em{color:#E4462B}.band em{color:#2E6BFF}
table{border-collapse:collapse;font-size:13.5px;background:#fff;box-shadow:0 1px 0 #D8D4CC;margin-top:14px}
th,td{border-bottom:1px solid #EAE6DF;padding:7px 12px;text-align:left;white-space:nowrap}
th{background:#F6F3EE;font-weight:600;color:#4A4741}
td.no{color:#B3261E;font-weight:700}td.ok{color:#2C6E49}
.sw{display:inline-block;width:13px;height:13px;border-radius:3px;vertical-align:-2px;margin-right:6px;border:1px solid rgba(0,0,0,.14)}
.ramp{display:flex;gap:6px;margin:10px 0 0}.ramp div{width:96px;height:52px;border-radius:8px;font-size:11.5px;color:#fff;padding:6px;box-shadow:0 1px 0 #D8D4CC}
.ref{background:#fff;padding:10px;border-radius:14px;box-shadow:0 1px 0 #D8D4CC}.ref img{width:230px;display:block;border-radius:8px}.ref p{font-size:12.5px;color:#5C5850;margin-top:7px}
`
const statusbar = (c) => `<div class="status" style="color:${c}">9:41<b style="font-weight:400">▮▮▮ ⌒ ▰</b></div>`
const navbar = (c, cap) => `<div class="nav" style="color:${c}">图麦笔记<div class="capsule" style="background:${cap.bg};color:${cap.ink};border:1px solid ${cap.edge}">•••　◎</div></div>`
const head = (v, old) => {
  const c = old ? PAPER : INK
  const cap = old ? { bg: 'rgba(0,0,0,.18)', ink: '#fff', edge: 'rgba(255,255,255,.32)' } : { bg: 'rgba(255,255,255,.66)', ink: '#14161A', edge: 'rgba(20,22,26,.18)' }
  const bh = old ? SC.h : v.bandH
  return `<div class="photo" style="height:${bh}px;background-image:url(data:image/jpeg;base64,${BG})"></div>
    <div class="${old ? 'scrim' : 'wash'}" style="height:${bh}px"></div>${statusbar(c)}${navbar(c, cap)}
    <div class="h1" style="color:${c}">${T('createHeading')}</div>
    <div class="lang" style="color:${old ? mix(PAPER, .5, surf.panel) : mix(INK, .55, PAGE)}"><b style="color:${c}">中</b>　EN</div>
    <div class="toolrow" style="color:${old ? mix(PAPER, .72, surf.panel) : mix(INK, .78, PAGE)}">
      <i><span class="dotdim" style="background:${mix(INK, .55, PAPER)}"></span>${T('bgDimLabel')}</i><i>${T('homeBgSwap')} ›</i></div>`
}
const modes = (on, old) => ['photo', 'url', 'write'].map((k) => {
  const sel = on === k
  const c = old ? (sel ? PAPER : mix(PAPER, .5, surf.panel)) : (sel ? INK : mix(INK, solve(INK, FACE, 4.5), FACE))
  return `<div class="md ${sel ? 'on' : ''}" style="color:${c};font-weight:${sel ? 600 : 400}">${T(k === 'photo' ? 'modePhoto' : k === 'url' ? 'modeUrl' : 'modeWrite')}</div>` }).join('')
const body = (v, mode, old) => {
  const face = old ? surf.panel : FACE, card = old ? surf.card : CARD_C
  const mute = old ? mix(PAPER, .5, surf.panel) : mix(INK, WELL_INK, WELL)
  const ring = old ? PAPER : mix(INK, RING, face)
  const core = old ? RAMP[2] : CAM, coreInk = old ? PAPER : '#2C1204'
  const shut = old ? G.shut : SHUT_NEW, cor = old ? G.core : CORE_NEW
  const inner = mode === 'url'
    ? `<div class="field" style="${old ? 'background:' + surf.field + ';color:' + mute : 'color:' + mute}">${T('linkDesc')}</div>
       <div class="sld" style="${old ? 'background:' + PAPER : ''}"><span style="position:relative;color:${old ? face : INK}">----　${T('slideExtract')}　----</span>
       <span class="knob" style="${old ? 'background:' + RAMP[3] : ''}"><span class="g lnk" style="color:${old ? PAPER : PAPER}"></span></span></div>`
    : `<div class="crow">
        <div class="mini"><div class="mini-c" style="${old ? 'background:' + surf.field : ''}"><span class="g imgs" style="color:${mute}"></span></div><div class="mini-lb" style="color:${mute}">${T('fromAlbum')}</div></div>
        <div class="shutcol"><div class="shut" style="width:${shut}px;height:${shut}px;border:${G.ring}px solid ${ring}"><div class="core" style="width:${cor}px;height:${cor}px">${'<span class="g cam" style="color:' + coreInk + '"></span>'}</div></div><div class="mini-lb" style="font-size:${px('--fs-meta')}px;color:${mute}">${T('takePhoto')}</div></div>
        <div class="mini"><div class="mini-c" style="${old ? 'background:' + surf.field : ''}"><span class="g lnk" style="color:${mute}"></span></div><div class="mini-lb" style="color:${mute}">${T('modeUrl')}</div></div></div>`
  return `<div class="dock" style="height:${old ? G.liveH : v.ph}px">
      <div class="out" style="color:${old ? mix(PAPER, .56, '#000') : mix(INK, .62, PAGE)}"><span>${T('chooseMode')}</span><span>${T('barCollapse')}</span></div>
      <div class="panel ${old ? 'old' : ''}" style="background:${face};border-color:${old ? 'rgba(242,239,233,.10)' : rgbaOf(INK, .10)}">
        <div class="modes">${modes(mode, old)}</div>
        <div class="card" style="${old ? 'background:' + surf.card + ';border-color:rgba(242,239,233,.07)' : ''}">${inner}</div></div></div>`
}
const tabbar = () => `<div class="bar2"><u style="background:${CH.sel};color:${PAPER}">＋</u><u style="color:${rgbaOf(PAPER, .62)}">≡</u><u style="color:${rgbaOf(PAPER, .62)}">◡</u></div>`
const phone = (v, mode, old = false) => `<div class="slot"><div class="ph"><div class="page"></div>${head(v, old)}${body(v, mode, old)}${tabbar()}
  ${old ? `<div class="line" style="top:${liveTop}px"><em>现网面板顶 ${((liveTop / SC.h) * 100).toFixed(1)}%</em></div>` : ''}
  ${!old && mode === 'photo' ? `<div class="line" style="top:${v.top}px"><em>面板顶 ${v.topPct.toFixed(1)}%</em></div><div class="band" style="top:${v.bandH}px"><em>背景带底 ${Math.round(v.band * 100)}%</em></div>` : ''}
</div></div>`
const cap = (v) => `<div class="slot"><div class="cap">${v.name}：背景带压到屏高 ${Math.round(v.band * 100)}%（现网是满屏铺），面板 ${G.liveH}→${v.ph}rpx、顶在 ${v.topPct.toFixed(1)}%，白卡净高 ${v.card}px ≈ 屏高 ${v.cardPct.toFixed(1)}%。快门 ${G.shut}→${SHUT_NEW}、白环换墨环（压面板 ${cr(mix(INK, RING, FACE), FACE)}）。${v.id === 'C' ? '这一档白卡里那三枚圈上下各空出一大段，"突出白色"最狠，代价是背景只剩一条。' : v.id === 'A' ? '最接近现网那一屏的取景，人像是主视觉。' : '中间那一档：人像与白卡各占一半。'}</div></div>`
const table = `<table><tr><th>这一处</th><th>前景</th><th>背景</th><th>实测</th><th>门槛</th></tr>` + ROWS.map((r) =>
  `<tr><td>${r.l}${r.note ? '　<span style="color:#8A857C">' + r.note + '</span>' : ''}</td><td><span class="sw" style="background:${rgbOf(r.f)}"></span>${r.f}</td><td><span class="sw" style="background:${rgbOf(r.b)}"></span>${r.b}</td><td class="${r.c >= r.need ? 'ok' : 'no'}">${r.c.toFixed(2)}</td><td>${r.need}</td></tr>`).join('') + '</table>'
const ramp = `<div class="ramp">${RAMP.map((c, i) => `<div style="background:${c};color:${IVORY.ramp.inks[i]}">${c}<br>第${i + 1}档</div>`).join('')}<div style="background:${LAYER};color:${INK}">${LAYER}<br>层色（派生）</div><div style="background:${PAGE};color:${INK}">${PAGE}<br>page 底</div></div>`
const HTML = `<!doctype html><meta charset="utf-8"><style>${css}</style>
<h1>第一屏 · 麦色面板 + 大留白白卡 + 压矮背景<span>结构＝c1 的乙；色＝四套里第一套「象牙」那一族（现读 palette.THEMES）；代码一行没动</span></h1>
<div class="lead">三档只差"白让出多少、背景退多少"，从左到右白卡越来越大、人像带越来越矮。每一台里：<b>红虚线＝面板顶</b>（下巴必须留在它上面）、<b>蓝虚线＝背景带底边</b>。第一台是现网那块黑框做对照。这一版仍然带着上一条那六件事：默认＝面板展开那一版、日期撤掉换成左上角「调亮度｜换背景」、快门缩一档、拍照与提炼两枚固定橙（白环在浅面上只有 ${cr(PAPER, FACE)}，一律换墨环）、头部那层罩子从深罩换白罩（标题与导航条的字因此反过来吃墨）。</div>
<div class="row">${phone({}, 'photo', true)}${VARIANTS.map((v) => phone(v, 'photo')).join('')}</div>
<div class="row">${cap({ name: '<b>现网对照（那块黑框）</b>', band: 1, ph: G.liveH, top: liveTop, topPct: (liveTop / SC.h) * 100, card: cardOf(G.liveH), cardPct: (cardOf(G.liveH) / SC.h) * 100, id: 'X' })}${VARIANTS.map((v) => cap(v)).join('')}</div>
<div class="row" style="margin-top:18px">${VARIANTS.map((v) => phone(v, 'url')).join('')}</div>
<div class="row">${VARIANTS.map((v) => `<div class="slot"><div class="cap"><b>${v.id} · 链接那一档</b>：输入框与右滑条同一档（${WELL}，压白卡 ${cr(WELL, CARD_C)}），圆是提炼那支橙 ${EXTRACT}（压条底 ${cr(EXTRACT, WELL)}），那句字吃墨（${cr(INK, WELL)}）。</div></div>`).join('')}</div>
<div class="row">${REFS.map((r) => `<div class="ref"><img src="data:image/png;base64,${r.b64}"/><p>${r.k}（外部取证：只抄"白为主、图退一条"这个结构，不抄它的装饰件）</p></div>`).join('')}${`<div style="max-width:520px;font-size:13.5px;line-height:1.7;color:#4A4741">麦色阶这五档与派生出来的层色、page 底：<div style="font-size:12px;color:#7A756C;margin-top:6px">RAMP 与 page 现读 palette.THEMES 里 tint-paper 那一条；层色按规格 §1 那条式子从 chromeOf 现算。</div></div>`}</div>
<div class="row" style="width:100%">${ramp}</div>
<div class="row" style="width:100%">${table}</div>`
const OUT = path.join(DIR, 'c2-第一屏麦色大留白.html')
fs.writeFileSync(OUT, HTML)
const PNG = path.join(DIR, 'c2-第一屏麦色大留白.png')
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
   '--window-size=2120,9000', `--screenshot=${PNG}`, '--virtual-time-budget=9000', 'file://' + OUT],
  { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] })
const audit = JSON.parse(execFileSync('python3', ['-c', `
from PIL import Image
import json
im=Image.open(${JSON.stringify(PNG)}).convert('RGB'); W,H=im.size; px=im.load()
BGc=(239,236,230)
def isbg(c): return all(abs(c[i]-BGc[i])<=3 for i in range(3))
last=0
for y in range(H-1,-1,-1):
    if any(not isbg(px[x,y]) for x in range(0,W,13)): last=y; break
faces=${JSON.stringify([surf.panel, FACE, CARD_C, PAGE].map(hex2rgb))}
def near(c,t,tol=4): return all(abs(c[i]-t[i])<=tol for i in range(3))
counts=[sum(1 for y in range(0,last,3) for x in range(0,W,3) if near(px[x,y],t)) for t in faces]
red=sum(1 for y in range(0,last) for x in range(0,W,2) if abs(px[x,y][0]-228)<26 and abs(px[x,y][1]-70)<26 and abs(px[x,y][2]-43)<26)
blue=sum(1 for y in range(0,last) for x in range(0,W,2) if abs(px[x,y][0]-46)<30 and abs(px[x,y][1]-107)<30 and abs(px[x,y][2]-255)<30)
print(json.dumps({"W":W,"H":H,"last":last,"counts":counts,"red":red,"blue":blue}))`], { encoding: 'utf8' }))
ck('内容末行落在窗口内（没被窗口高度截掉）', audit.last < audit.H - 60, `末行 ${audit.last} / 窗口高 ${audit.H}`)
;[['黑框', surf.panel], ['麦色面板', FACE], ['白卡', CARD_C], ['page 底', PAGE]].forEach(([l, c], i) =>
  ck(`产物上找得到${l}（${c}）`, audit.counts[i] > 900, `${audit.counts[i]} 个采样点`))
ck('红虚线与蓝虚线都画出来了', audit.red > 900 && audit.blue > 300, `红 ${audit.red}、蓝 ${audit.blue}`)
execFileSync('python3', ['-c', `
from PIL import Image
im=Image.open(${JSON.stringify(PNG)}).convert('RGB')
im.crop((0,0,im.width,min(im.height,${audit.last} + 46))).save(${JSON.stringify(PNG)})`])
console.log(`\n${bad.length ? '✗ ' + bad.length + ' 条不过：' + bad.join('、') : '第一屏麦色大留白 静态+产物：全过'}`)
if (bad.length) process.exit(1)
console.log('正本：' + PNG)
