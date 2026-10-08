// 【10-08 深夜被 画-c4.mjs 取代】框体这一条他认了（"第一个是现网，尺寸不变"），但我自己长出来的第二个变量被打回：
// 下面 BAND_PCT=50 把背景带压矮，带底与面板顶之间露出 183rpx 麦色 page 底＝他说的"多了一块"，而且背景图不再贯穿。
// 白麦跨度也太大（60.6→80.3%），他要的是"稍微多一点"。文件留着当返工痕迹，别再照它落码。
// 第一屏第三版：框体一寸不动（照现网 500rpx、顶线 61.0%），只调"白底 : 麦色底"的比例。
// 跑法：node docs/design/10-08第一屏浅色三方向/画-c3.mjs
//
// 站长 10-08 深夜把我上一稿打回来：「原来的框体大小不变，只是白底和带颜色的底比例要调整，
// 不是把整个框体变大。重来。」——c2 那三档 620/700/780 犯的正是"把框放大"这条，作废。
// 这一稿把框锁死在现网那两个数（高 500、底 152、左右 24、圆角 55），三档只动框肚子里：
// 麦色那圈框有多厚、白卡顶到哪。白从占面板 62.9% → 71.9% → 80.3%，麦从 37.1% 退到 19.7%。
//
// 上一稿还有个连带错：它把背景带压到屏高 38–47%，那样带边会切在下巴上面（下巴在源图 56% 那一档，
// 是我在 c1 产物上量到的）。这一稿背景带四台共用一个数（50% 屏高），带边离下巴还留 185rpx，
// 稿子上另画一条绿虚线标下巴，肉眼可核。
//
// 尺子全部现读：面板盒子等式与那两个实测数（内容 263.5／照片那叠 254.4）从 create.wxss 那段注释里
// 抠出来，再跟 CSS 逐条对数（对不上就红）；字号／描边 = app.wxss；层色 = 规格 §1 那条派生式从
// palette.chromeOf('tint-paper') 现算；两支橙 = 规格-创建入口 §6.1；界面话 = utils/i18n.js 的 zh 键
// （字典里没有的标〔新拟〕）；底图 = assets/home-bg-portrait.jpg 真件。
// 产物复核：四台机器在 PNG 上量到的面板高度必须相等（±3px）——"框体没变大"这条不靠稿子自述。
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
const ck = (nme, ok, d = '') => { if (!ok) bad.push(nme); console.log(`${ok ? '✓' : '✗'} ${nme}` + (d ? `　→ ${d}` : '')) }

/* ---------- ① 框体几何：全部现读，一个都不许自己填 ---------- */
const APP = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
const PB = APP.slice(APP.indexOf('page{') >= 0 ? APP.indexOf('page{') : APP.indexOf('page {'))
const tok = {}
for (const m of PB.slice(0, PB.indexOf('}')).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) tok[m[1]] = m[2].trim()
const px = (k) => { if (!tok[k]) throw new Error(`app.wxss 读不到 ${k}`); return parseInt(tok[k], 10) }
const RAW = fs.readFileSync(path.join(MP, 'pages/create/create.wxss'), 'utf8')
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (sel) => {
  const m = new RegExp('(^|\\})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(CSS)
  if (!m) throw new Error(`create.wxss 读不到 ${sel}，几何出处变了`)
  const o = {}
  for (const p of m[2].split(';')) { const i = p.indexOf(':'); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim() }
  return o
}
const num = (v, w) => { const x = parseFloat(String(v)); if (!Number.isFinite(x)) throw new Error(`几何取到 NaN：${w} = ${v}`); return x }
const borderW = (v, w) => num(String(v).split(/\s+/)[0], w)   // 现网写的是 border 简写：10rpx solid var(--cp-ink)
const box = (v) => String(v).trim().split(/\s+/).map((s) => parseFloat(s))
const PANEL = rule('.panel'), CARD = rule('.card'), MODES = rule('.modes'), MD = rule('.md')
const CROW = rule('.crow'), MINI = rule('.mini-c'), SHUT = rule('.shut'), SLD = rule('.sld')
const KNOB = rule('.sld-knob'), FIELD = rule('.field'), OUTROW = rule('.out'), DOCK = rule('.container.entry-dock .entry-wrap')
const G = {
  edge: px('--w-edge'), radius: num(PANEL['border-radius'], 'radius'),
  padT: num(PANEL.padding, 'padT'), padB: (() => { const a = box(PANEL.padding); return a.length === 3 ? a[2] : a[0] })(),
  padX: (() => { const a = box(PANEL.padding); return a.length === 3 ? a[1] : a[0] })(),
  liveH: num(PANEL.height, 'panelH'), cardMt: num(CARD['margin-top'], 'cardMt'),
  cardPad: num(CARD.padding, 'cardPad'), cardR: num(CARD['border-radius'], 'cardR'),
  crowGap: num(CROW.gap, 'crowGap'), mini: num(MINI.width, 'mini'), shut: num(SHUT.width, 'shut'),
  ring: borderW(SHUT.border, 'ring'), fieldH: num(FIELD.height, 'field'),
  sldH: num(SLD.height, 'sld'), knob: num(KNOB.width, 'knob'),
  outPadB: (() => { const a = box(OUTROW.padding || OUTROW['padding-bottom']); return a.length === 3 ? a[2] : a[0] })(),
  bottom: num(DOCK.bottom, 'bottom'), side: num(DOCK.left, 'side'),
  mdFs: px('--fs-title'), meta: px('--fs-meta'),
}
// 面板盒子等式是这段注释自己写的（"高度两个数都是按盒子模型算出来再拿真跑那把尺子量过的"），
// 从注释里抠出来跟 CSS 对数：对得上说明我读的是同一套盒子，不是照印象拼
const EQ = /上内边距\s*([\d.]+)\s*\+\s*标签行\s*([\d.]+)\s*\+\s*卡上边距\s*([\d.]+)\s*\+\s*卡边框\s*([\d.]+)\s*\+\s*卡内边距\s*([\d.]+)\s*\+\s*内容\s*([\d.]+)\s*\+\s*下内边距\s*([\d.]+)/.exec(RAW)
const PHOTO = /快门\s*([\d.]+)\s*\+\s*间距\s*([\d.]+)\s*\+\s*那行字\s*([\d.]+)）?实测\s*([\d.]+)/.exec(RAW)
ck('从 create.wxss 注释里读到那条盒子等式与那两个实测数', !!(EQ && PHOTO), EQ ? EQ[0].slice(0, 46) + '…' : '等式没读到')
const [, ePadT, eModesH, eCardMt, eCardEdge, eCardPad, eInner, ePadB] = EQ.map(Number)
ck('等式里的四个数与 CSS 现读一致（读的是同一套盒子）',
  ePadT === G.padT && eCardMt === G.cardMt && eCardEdge === G.edge * 2 && eCardPad === G.cardPad * 2 && ePadB === G.padB,
  `注释 ${ePadT}/${eCardMt}/${eCardEdge}/${eCardPad}/${ePadB}　CSS ${G.padT}/${G.cardMt}/${G.edge * 2}/${G.cardPad * 2}/${G.padB}`)
ck('等式加总等于面板高（盒子闭合）',
  G.edge * 2 + ePadT + eModesH + eCardMt + eCardEdge + eCardPad + eInner + ePadB === G.liveH,
  `标签行 ${eModesH} ＋ 内容 ${eInner} 是从这条等式反推的，别处没写死`)
const MODES_H = eModesH                       // 标签行那一格的实际高度（注释里的实测数）
const LB_LINE = Number(PHOTO[3]) || 32.4      // 「那行字」
const SHUT_GAP = Number(PHOTO[2])             // 快门与那行字之间实测吃掉的 12（gap 8 加字形留白）
const SHUT_NEW = 180                           // 沿用他 10-08 那句「拍照按钮缩一点」那一档
const stackPhoto = (s) => s + SHUT_GAP + LB_LINE
const stackUrl = G.fieldH + 20 + G.sldH
ck('现网那一叠（快门 210）确实顶到等式给的内容位（差在 10 以内，说明这两个数是一回事）',
  Math.abs(stackPhoto(G.shut) - eInner) <= 10, `快门 ${G.shut}+间距 ${SHUT_GAP}+字 ${LB_LINE} = ${stackPhoto(G.shut)}，内容位 ${eInner}`)
const SC = { w: 750, h: 1670 }
G.outH = Math.round(parseFloat(OUTROW['line-height']) * G.meta) + G.outPadB
const liveTop = SC.h - G.bottom - G.liveH
const panelW = SC.w - G.side * 2                       // 面板外宽（左右各 24）
const cardW = (padX) => panelW - G.edge * 2 - padX * 2
const cardOuter = (v) => G.liveH - G.edge * 2 - v.padT - MODES_H - v.cardMt - v.padB
const cardInner = (v) => cardOuter(v) - G.edge * 2 - v.cardPad * 2
const whitePct = (v) => (cardW(v.padX) * cardOuter(v)) / ((panelW - G.edge * 2) * (G.liveH - G.edge * 2)) * 100

/* ---------- ② 三档：只动"麦框多厚、白卡顶到哪"，框体那四个数一台都不改 ---------- */
const VARIANTS = [
  { id: 'A', name: '甲 麦框照现网厚度', padT: G.padT, padX: G.padX, padB: G.padB, cardMt: G.cardMt, cardPad: G.cardPad, bleed: false },
  { id: 'B', name: '乙 麦框四边压薄', padT: 14, padX: 18, padB: 16, cardMt: 12, cardPad: G.cardPad, bleed: false },
  { id: 'C', name: '丙 麦只剩顶上那条标签带', padT: 10, padX: 0, padB: 0, cardMt: 10, cardPad: G.cardPad, bleed: true },
]
for (const v of VARIANTS) {
  v.h = G.liveH
  v.top = liveTop                                   // 与现网同一条线：61.0%
  v.topPct = (liveTop / SC.h) * 100
  v.card = cardOuter(v)
  v.inner = cardInner(v)
  v.white = whitePct(v)
  v.wheat = 100 - v.white
  ck(`${v.id}：框体没变大也没变小（面板高 ${G.liveH}、顶 ${v.topPct.toFixed(1)}%、底 ${G.bottom}、左右 ${G.side}，四台同一个数）`,
    v.h === G.liveH && v.top === liveTop, `面板 ${G.liveH}rpx 不变，只动肚子里的内边距`)
  ck(`${v.id}：照片那一叠（快门缩到 ${SHUT_NEW}）放得进白卡`, stackPhoto(SHUT_NEW) <= v.inner,
    `${stackPhoto(SHUT_NEW)} ≤ 内容位 ${v.inner.toFixed(1)}，白卡净高 ${v.card.toFixed(1)} ≈ 屏高 ${(v.card / SC.h * 100).toFixed(1)}%`)
  ck(`${v.id}：链接那一叠也放得进`, stackUrl <= v.inner, `${stackUrl} ≤ ${v.inner.toFixed(1)}`)
}
ck('三档的白底占比是一档比一档大，麦色底一档比一档小（这才是这一稿唯一的变量）',
  VARIANTS.every((v, i) => i === 0 || v.white > VARIANTS[i - 1].white),
  VARIANTS.map((v) => `${v.id} 白 ${v.white.toFixed(1)}%／麦 ${v.wheat.toFixed(1)}%`).join('　'))
ck('白卡高度在 500 的框里涨，涨出来的部分正好等于麦框让出来的（不守恒就是我在偷偷扩框）',
  VARIANTS.every((v) => Math.abs((cardOuter(v) + v.padT + v.cardMt + v.padB) - (G.liveH - G.edge * 2 - MODES_H)) < 0.01),
  `卡外高 ＋ 上内边距 ＋ 卡上边距 ＋ 下内边距 ＝ 框内高 − 标签行，恒等`)

/* ---------- ③ 背景带：四台共用一个数，且不能切下巴 ---------- */
const CHIN_SRC = 0.56                                 // 下巴在源图高度上的那档（c1 在产物上量到的）
const IMG = { w: 1116, h: 1920 }
{
  const s = fs.statSync(path.join(MP, 'assets/home-bg-portrait.jpg'))
  const dim = execFileSync('python3', ['-c', `
from PIL import Image
im=Image.open(${JSON.stringify(path.join(MP, 'assets/home-bg-portrait.jpg'))}); print(im.width, im.height)`], { encoding: 'utf8' })
  const [w, h] = dim.trim().split(/\s+/).map(Number)
  ck('底图尺寸现读（ cover 裁切要按它算，不能凭印象）', w === IMG.w && h === IMG.h, `${w}×${h}，文件 ${Math.round(s.size / 1024)}KB`)
}
const BAND_PCT = 50
const BAND = Math.round(SC.h * BAND_PCT / 100)
// cover：宽先撑满（750/1116=.672），带高不足 1290 时按宽缩放、上下裁；position 中心 16%
const scale = (b) => Math.max(SC.w / IMG.w, b / IMG.h)
const chinY = (b) => { const sc = scale(b); const rendered = IMG.h * sc
  return Math.round(rendered * CHIN_SRC - (rendered - b) * 0.16) }
ck('背景带底边在下巴下面（带边不许切下巴）', chinY(BAND) + 150 <= BAND,
  `带底 ${BAND}（屏高 ${BAND_PCT}%），下巴落 ${chinY(BAND)}，离带边还有 ${BAND - chinY(BAND)}rpx`)
ck('带底与面板顶之间还塞得下那句小字（框体不动，那 52rpx 是固定的）', BAND + G.outH + 12 <= liveTop,
  `带底 ${BAND} ＋ 那句小字 ${G.outH} ≤ 面板顶 ${liveTop}`)
ck('这一版背景带比上一稿矮、但比现网满屏那版省（对照：上一稿 38–47% 会切下巴）',
  BAND < liveTop && BAND / SC.h < 0.62, `${BAND_PCT}% 屏高；现网是 100% 满铺`)

/* ---------- ④ 色：象牙那一族现算，两支橙从规格现读 ---------- */
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
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const mix = (f, a, b) => { const F = hex2rgb(f), B = hex2rgb(b)
  return '#' + F.map((v, i) => Math.round(v * a + B[i] * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase() }
const cr = (a, b) => Number(palette.crOf(a, b).toFixed(2))
const rgbOf = (h) => 'rgb(' + hex2rgb(h).join(', ') + ')'
const rgbaOf = (h, a) => (a >= 1 ? rgbOf(h) : `rgba(${hex2rgb(h).join(', ')}, ${a})`)
const solve = (ink, face, need) => { for (const a of [.3, .35, .4, .45, .5, .55, .6, .65, .7, .75, .8, .85, .9, .95, 1]) if (cr(mix(ink, a, face), face) >= need) return a; return 1 }
const wellOf = (s) => { const a = mix(INK, .12, s), b = mix(PAPER, .90, s); return cr(a, s) >= cr(b, s) ? a : b }
const IVORY = palette.THEMES.find((t) => t.key === 'tint-paper')
const CH = palette.chromeOf('tint-paper')
const [ih, is] = rgbToHsl(CH.bg)
const LAYER = hslToHex(ih, is * 0.35, 78)
const RAMP = IVORY.ramp.steps, PAGE = IVORY.page
const PAL = fs.readFileSync(path.join(MP, 'utils/palette.js'), 'utf8')
const surf = {}
for (const m of /CREATE_SURFACE\s*=\s*\{([^}]+)\}/.exec(PAL)[1].matchAll(/(\w+)\s*:\s*['"]([^'"]+)['"]/g)) surf[m[1]] = m[2]
const SPEC = fs.readFileSync(path.join(ROOT, 'docs/规格-创建入口这一条线.md'), 'utf8')
const CAM = /#E9723D/i.test(SPEC) ? '#E9723D' : null, EXTRACT = /#C4541F/i.test(SPEC) ? '#C4541F' : null
ck('两支橙是从规格 §6.1 现读到的', !!(CAM && EXTRACT), `${CAM} / ${EXTRACT}`)
ck('层色与规格 §2 那张表里象牙那一行对得上（现算，不是抄）', LAYER === '#CDC9C1', `算出来 ${LAYER}`)
const INK = '#23252C', PAPER = '#F2EFE9', WHITE = '#FFFFFF', TIP = palette.TIP_DOT
const FACE = LAYER, CARD_C = WHITE
const WELL = wellOf(CARD_C), WELL_INK = solve(INK, WELL, 4.5)
const RING = solve(INK, FACE, 3.0), OUT_INK = solve(INK, PAGE, 4.5)
const ROWS = []
const row = (l, f, b, need, note) => ROWS.push({ l, f, b, need, c: cr(f, b), note })
row('现网对照：纸白字压那块黑框', PAPER, surf.panel, 4.5)
row('现网对照：快门若还跟色阶（象牙第 3 档）压黑框', RAMP[2], surf.panel, 3.0)
row('麦色面板与 page 底的分离', FACE, PAGE, 1.1, '〔丙 那一档麦只剩 19.7%，轮廓全靠这条＋投影〕')
row('白卡与麦色面板的分离', CARD_C, FACE, 1.1, '大留白靠这条 + 那条墨边撑边界')
row('墨字压白卡（标题、选中那个标签）', INK, CARD_C, 4.5)
row('墨字压麦色面板（标签行那一段还在麦上）', INK, FACE, 4.5)
row('模式标签未选那档（按面板反解）', mix(INK, solve(INK, FACE, 4.5), FACE), FACE, 4.5)
row('框外那句小字压 page 底（带压矮后它落在麦色底上，反解到 ' + OUT_INK + '）', mix(INK, OUT_INK, PAGE), PAGE, 4.5)
row('框里那句提示字（按条底反解到 ' + WELL_INK + '）', mix(INK, WELL_INK, WELL), WELL, 4.5)
row('控件那一档与白卡的分离', WELL, CARD_C, 1.1, '小圆/输入框/右滑条同一档')
row('快门那圈墨环压麦面板（反解到 ' + RING + '）', mix(INK, RING, FACE), FACE, 3.0)
row('快门那圈墨环压白卡（丙 那一档环贴着白卡边）', mix(INK, RING, CARD_C), CARD_C, 3.0)
row('〔反向对照〕同一圈若仍画白环', PAPER, FACE, 3.0)
row('拍照那支橙压白卡', CAM, CARD_C, 3.0)
row('拍照那支橙压麦色面板', CAM, FACE, 3.0)
row('快门里那个图形：深字压橙', '#2C1204', CAM, 4.5)
row('提炼那支橙圆压条底', EXTRACT, WELL, 3.0)
row('条里那句墨字压条底', INK, WELL, 4.5)
row('底栏那支深麦压白卡', CH.bg, CARD_C, 3.0)
row('选中那枚底下那条短杠（这一屏吃墨，不吃那支黄）', INK, FACE, 3.0)
row('〔反向对照〕黄短杠若照列表页那档搬过来', TIP, FACE, 3.0)

/* ---------- ⑤ 页面 ---------- */
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
.h1t{position:absolute;left:32px;top:206px;font-size:${px('--fs-h1')}px;font-weight:700;letter-spacing:-1px}
.toolrow{position:absolute;left:32px;top:272px;display:flex;align-items:center;gap:26px;font-size:${px('--fs-meta')}px;font-weight:700;letter-spacing:1px}
.toolrow i{font-style:normal;display:inline-flex;align-items:center;gap:10px}
.dotdim{width:24px;height:24px;border-radius:50%;border:2px solid rgba(8,9,12,.28)}
.lang{position:absolute;right:32px;top:212px;font-size:${px('--fs-meta')}px}
.dock{position:absolute;left:${G.side}px;right:${G.side}px;bottom:${G.bottom}px;display:flex;flex-direction:column}
.out{flex:none;display:flex;justify-content:space-between;padding:0 20px ${G.outPadB}px;font-size:${px('--fs-meta')}px;line-height:1.4;letter-spacing:1px}
.panel{height:${G.liveH}px;border-radius:${G.radius}px;display:flex;flex-direction:column;box-shadow:0 22px 46px rgba(8,10,14,.14)}
.modes{display:flex;justify-content:center;gap:${num(MODES.gap, 'mdGap')}px;flex:none;height:${MODES_H}px;align-items:center}
.md{font-size:${G.mdFs}px;line-height:1.3;letter-spacing:1px;padding-bottom:${num(MD['padding-bottom'], 'mdPadB')}px;position:relative;white-space:nowrap}
.md.on::after{content:"";position:absolute;left:0;right:0;bottom:0;height:5px;border-radius:3px;background:${INK}}
.panel.old .md.on::after{background:${RAMP[2]}}
.card{flex:1;min-height:0;display:flex;flex-direction:column}
.crow{margin-top:auto;margin-bottom:auto;display:flex;align-items:flex-start;justify-content:center;gap:${G.crowGap}px}
.mini{width:130px;flex:none;display:flex;flex-direction:column;align-items:center;gap:10px}
.mini-c{width:${G.mini}px;height:${G.mini}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${WELL}}
.mini-lb{font-size:${px('--fs-tiny')}px;font-weight:700;letter-spacing:1px}
.shutcol{flex:none;display:flex;flex-direction:column;align-items:center;gap:${SHUT_GAP - 4}px}
.shut{border-radius:50%;display:flex;align-items:center;justify-content:center}
.core{border-radius:50%;display:flex;align-items:center;justify-content:center;background:${CAM}}
.field{height:${G.fieldH}px;border-radius:18px;display:flex;align-items:center;padding:0 28px;font-size:${px('--fs-body')}px;background:${WELL}}
.sld{position:relative;flex:none;margin-top:20px;height:${G.sldH}px;border-radius:55px;display:flex;align-items:center;justify-content:center;font-size:${G.mdFs}px;font-weight:700;letter-spacing:1px;background:${WELL}}
.knob{position:absolute;left:10px;top:5px;width:${G.knob}px;height:${G.knob}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${EXTRACT}}
.g{display:block;background:currentColor;-webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center}
.cam{width:60px;height:60px;-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><path d='M4 8h3l2-2h6l2 2h3v11H4z'/><circle cx='12' cy='13' r='3.4'/></svg>")}
.imgs{width:40px;height:40px;-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><rect x='3' y='6' width='15' height='13' rx='2'/><path d='M7 3h14v14'/><path d='M6 16l4-4 4 4'/></svg>")}
.lnk{width:40px;height:40px;-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><path d='M10 14a4 4 0 0 1 0-5.6l2-2a4 4 0 1 1 5.6 5.6l-1 1'/><path d='M14 10a4 4 0 0 1 0 5.6l-2 2A4 4 0 1 1 6.4 12l1-1'/></svg>")}
.bar2{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:44px;display:flex;align-items:center;justify-content:space-around;z-index:9;background:${CH.bg}}
.bar2 u{text-decoration:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:34px}
.line{position:absolute;left:0;right:0;border-top:6px dashed #E4462B;z-index:12}
.band{position:absolute;left:0;right:0;border-top:4px dashed #2E6BFF;z-index:12}
.chin{position:absolute;left:0;right:0;border-top:4px dotted #177A3E;z-index:12}
.line em,.band em,.chin em{position:absolute;right:8px;top:-32px;font-size:21px;font-style:normal;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.88)}
.line em{color:#E4462B}.band em{color:#2E6BFF}.chin em{color:#177A3E}
table{border-collapse:collapse;font-size:13.5px;background:#fff;box-shadow:0 1px 0 #D8D4CC;margin-top:14px}
th,td{border-bottom:1px solid #EAE6DF;padding:7px 12px;text-align:left;white-space:nowrap}
th{background:#F6F3EE;font-weight:600;color:#4A4741}
td.no{color:#B3261E;font-weight:700}td.ok{color:#2C6E49}
.sw{display:inline-block;width:13px;height:13px;border-radius:3px;vertical-align:-2px;margin-right:6px;border:1px solid rgba(0,0,0,.14)}
.geo{border-collapse:collapse;font-size:13.5px;background:#fff;box-shadow:0 1px 0 #D8D4CC;margin-top:14px}
.ramp{display:flex;gap:6px;margin:10px 0 0}.ramp div{width:96px;height:52px;border-radius:8px;font-size:11.5px;color:#fff;padding:6px;box-shadow:0 1px 0 #D8D4CC}
.ref{background:#fff;padding:10px;border-radius:14px;box-shadow:0 1px 0 #D8D4CC}.ref img{width:230px;display:block;border-radius:8px}.ref p{font-size:12.5px;color:#5C5850;margin-top:7px}
`
const statusbar = (c) => `<div class="status" style="color:${c}">9:41<b style="font-weight:400">▮▮▮ ⌒ ▰</b></div>`
const navbar = (c, cap) => `<div class="nav" style="color:${c}">图麦笔记<div class="capsule" style="background:${cap.bg};color:${cap.ink};border:1px solid ${cap.edge}">•••　◎</div></div>`
const head = (old) => {
  const c = old ? PAPER : INK
  const cap = old ? { bg: 'rgba(0,0,0,.18)', ink: '#fff', edge: 'rgba(255,255,255,.32)' } : { bg: 'rgba(255,255,255,.66)', ink: '#14161A', edge: 'rgba(20,22,26,.18)' }
  const bh = old ? SC.h : BAND
  return `<div class="photo" style="height:${bh}px;background-image:url(data:image/jpeg;base64,${BG})"></div>
    <div class="${old ? 'scrim' : 'wash'}" style="height:${bh}px"></div>${statusbar(c)}${navbar(c, cap)}
    <div class="h1t" style="color:${c}">${T('createHeading')}</div>
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
  const shut = old ? G.shut : SHUT_NEW, cor = old ? 155 : 132
  const padX = old ? G.padX : v.padX, padT = old ? G.padT : v.padT, padB = old ? G.padB : v.padB
  const cmt = old ? G.cardMt : v.cardMt, cpad = old ? G.cardPad : v.cardPad
  const inner = mode === 'url'
    ? `<div class="field" style="${old ? 'margin-top:auto;margin-bottom:auto;background:' + surf.field + ';color:' + mute : 'margin-top:auto;margin-bottom:auto;color:' + mute}">${T('linkDesc')}</div>
       <div class="sld" style="${old ? 'background:' + PAPER : ''}"><span style="position:relative;color:${old ? face : INK}">----　${T('slideExtract')}　----</span>
       <span class="knob" style="${old ? 'background:' + RAMP[3] : ''}"><span class="g lnk" style="color:${PAPER}"></span></span></div>`
    : `<div class="crow">
        <div class="mini"><div class="mini-c" style="${old ? 'background:' + surf.field : ''}"><span class="g imgs" style="color:${mute}"></span></div><div class="mini-lb" style="color:${mute}">${T('fromAlbum')}</div></div>
        <div class="shutcol"><div class="shut" style="width:${shut}px;height:${shut}px;border:${G.ring}px solid ${ring}"><div class="core" style="width:${cor}px;height:${cor}px"><span class="g cam" style="color:${coreInk}"></span></div></div><div class="mini-lb" style="font-size:${G.meta}px;color:${mute}">${T('takePhoto')}</div></div>
        <div class="mini"><div class="mini-c" style="${old ? 'background:' + surf.field : ''}"><span class="g lnk" style="color:${mute}"></span></div><div class="mini-lb" style="color:${mute}">${T('modeUrl')}</div></div></div>`
  return `<div class="dock">
      <div class="out" style="color:${old ? mix(PAPER, .56, '#000') : mix(INK, OUT_INK, PAGE)}"><span>${T('chooseMode')}</span><span>${T('barCollapse')}</span></div>
      <div class="panel ${old ? 'old' : ''}" style="background:${face};border:${G.edge}px solid ${old ? 'rgba(242,239,233,.10)' : rgbaOf(INK, .10)};padding:${padT}px ${padX}px ${padB}px">
        <div class="modes">${modes(mode, old)}</div>
        <div class="card" style="margin-top:${cmt}px;padding:${cpad}px;border-radius:${v.bleed && !old ? G.cardR + 'px ' + G.cardR + 'px ' + (G.radius - G.edge) + 'px ' + (G.radius - G.edge) + 'px' : G.cardR + 'px'};background:${card};border:${G.edge}px solid ${old ? 'rgba(242,239,233,.07)' : rgbaOf(INK, .08)}}">${inner}</div></div></div>`
}
const tabbar = () => `<div class="bar2"><u style="background:${CH.sel};color:${PAPER}">＋</u><u style="color:${rgbaOf(PAPER, .62)}">≡</u><u style="color:${rgbaOf(PAPER, .62)}">◡</u></div>`
const phone = (v, mode, old = false) => `<div class="slot"><div class="ph"><div class="page"></div>${head(old)}${body(v, mode, old)}${tabbar()}
  ${old ? `<div class="line" style="top:${liveTop}px"><em>现网面板顶 ${(liveTop / SC.h * 100).toFixed(1)}%</em></div>`
    : `<div class="line" style="top:${liveTop}px"><em>面板顶 ${(liveTop / SC.h * 100).toFixed(1)}%（四台同一条线，框没动）</em></div>
       <div class="band" style="top:${BAND}px"><em>背景带底 ${BAND_PCT}%</em></div>
       <div class="chin" style="top:${chinY(BAND)}px"><em>下巴 ${Math.round(chinY(BAND) / SC.h * 100)}%</em></div>`}
</div></div>`
const geoOf = (o) => ({ ...o, topPct: liveTop / SC.h * 100, card: cardOuter(o), inner: cardInner(o),
  white: whitePct(o), wheat: 100 - whitePct(o) })
const OLD = geoOf({ name: '<b>现网对照（那块黑框）</b>', shut: G.shut, padT: G.padT, padX: G.padX, padB: G.padB, cardMt: G.cardMt, cardPad: G.cardPad })
for (const v of VARIANTS) { Object.assign(v, geoOf(v)); v.shut = SHUT_NEW }
const cap = (v) => {
  const note = v.id === 'A' ? '这一档就是"把现网那块黑框原样换成麦色"，比例一点没动，当下限参照。'
    : v.id === 'B' ? '四边都压薄一档：麦框还认得出是一圈，白卡净高多了 ' + (VARIANTS[1].card - VARIANTS[0].card).toFixed(1) + 'rpx。'
    : v.id === 'C' ? '麦只剩顶上那条标签带 + 一圈描边，白卡左右下贴到框边（下面两个圆角要改成 52 = 55−3）。结构没搬，只是框边让位。'
    : `这一档的白卡内容位 ${v.inner.toFixed(1)}rpx，照片那一叠（快门 ${v.shut}）占 ${stackPhoto(v.shut)}，装得下。快门 ${G.shut}→${SHUT_NEW} 与白环换墨环照旧。`
  return `<div class="slot"><div class="cap"><b>${v.name}</b>：面板 ${G.liveH}rpx、顶 ${v.topPct.toFixed(1)}%、底 ${G.bottom}、左右 ${G.side}——与现网一字不差。框肚子里：白卡 ${cardW(v.padX)}×${v.card.toFixed(1)}，占面板 <b>${v.white.toFixed(1)}%</b>（麦色 ${v.wheat.toFixed(1)}%）、占整屏 ${(cardW(v.padX) * v.card / (SC.w * SC.h) * 100).toFixed(1)}%；卡内内容位 ${v.inner.toFixed(1)}rpx，照片那一叠（快门 ${v.shut}）${stackPhoto(v.shut)}，余量 ${(v.inner - stackPhoto(v.shut)).toFixed(1)}rpx。<br>${note}</div></div>`
}
const geoTable = `<table class="geo"><tr><th>这一档</th><th>上内边距</th><th>左右内边距</th><th>下内边距</th><th>卡上边距</th><th>卡内边距</th><th>白卡外高</th><th>内容位</th><th>白占面板</th><th>麦占面板</th><th>框体高</th></tr>` +
  VARIANTS.map((v) => `<tr><td>${v.name}</td><td>${v.padT}</td><td>${v.padX}</td><td>${v.padB}</td><td>${v.cardMt}</td><td>${v.cardPad}</td><td>${v.card.toFixed(1)}</td><td>${v.inner.toFixed(1)}</td><td><b>${v.white.toFixed(1)}%</b></td><td>${v.wheat.toFixed(1)}%</td><td>${v.h}（不变）</td></tr>`).join('') + '</table>'
const table = `<table><tr><th>这一处</th><th>前景</th><th>背景</th><th>实测</th><th>门槛</th></tr>` + ROWS.map((r) =>
  `<tr><td>${r.l}${r.note ? '　<span style="color:#8A857C">' + r.note + '</span>' : ''}</td><td><span class="sw" style="background:${rgbOf(r.f)}"></span>${r.f}</td><td><span class="sw" style="background:${rgbOf(r.b)}"></span>${r.b}</td><td class="${r.c >= r.need ? 'ok' : 'no'}">${r.c.toFixed(2)}</td><td>${r.need}</td></tr>`).join('') + '</table>'
const ramp = `<div class="ramp">${RAMP.map((c, i) => `<div style="background:${c};color:${IVORY.ramp.inks[i]}">${c}<br>第${i + 1}档</div>`).join('')}<div style="background:${LAYER};color:${INK}">${LAYER}<br>层色（派生）</div><div style="background:${PAGE};color:${INK}">${PAGE}<br>page 底</div></div>`
const HTML = `<!doctype html><meta charset="utf-8"><style>${css}</style>
<h1>第一屏 · 框体不动，只调「白 : 麦」的比例<span>面板仍是现网那 500rpx／顶线 61.0%；色＝四套第一套「象牙」那一族；代码一行没动</span></h1>
<div class="lead">上一稿（c2）错在<b>把框放大</b>了，作废。这一稿从左到右四台：<b>第 1 台是现网那块黑框做对照</b>，后三台框体那四个数（高 500、底 152、左右 24、圆角 55）与现网一字不差，只有框肚子里的内边距在让位——白卡从占面板 ${VARIANTS[0].white.toFixed(1)}% → ${VARIANTS[1].white.toFixed(1)}% → ${VARIANTS[2].white.toFixed(1)}%，麦色那一圈从 ${VARIANTS[0].wheat.toFixed(1)}% 退到 ${VARIANTS[2].wheat.toFixed(1)}%。每台里<b>红实线＝面板顶（四台同一条）</b>、<b>蓝虚线＝背景带底边（四台同一个数，屏高 ${BAND_PCT}%）</b>、<b>绿点线＝人像下巴</b>，绿线必须留在蓝线上面。上一稿还把带压到 38–47%，那样带边会切在下巴上，这条也一并改回来了。其余六件事照旧：默认＝面板展开、日期撤掉换成左上角「调亮度｜换背景」、快门 ${G.shut}→${SHUT_NEW}、拍照与提炼两枚固定橙（${CAM}／${EXTRACT}；白环在浅面上只有 ${cr(PAPER, FACE)}，一律换墨环 ${mix(INK, RING, FACE)}）、头部那层罩子从深罩换白罩。</div>
<div class="row">${phone({}, 'photo', true)}${VARIANTS.map((v) => phone(v, 'photo')).join('')}</div>
<div class="row">${cap(OLD)}${VARIANTS.map(cap).join('')}</div>
<div class="row" style="width:100%">${geoTable}</div>
<div class="row">${VARIANTS.map((v) => phone(v, 'url')).join('')}</div>
<div class="row">${VARIANTS.map((v) => `<div class="slot"><div class="cap"><b>${v.name.slice(0, 1)} · 链接那一档</b>：卡内内容位 ${v.inner.toFixed(1)}，输入框 ${G.fieldH} ＋ 那 20 ＋ 右滑条 ${G.sldH} ＝ ${stackUrl}，同一档 ${WELL}（压白卡 ${cr(WELL, CARD_C)}），圆是提炼那支橙 ${EXTRACT}（压条底 ${cr(EXTRACT, WELL)}）。</div></div>`).join('')}</div>
<div class="row">${REFS.map((r) => `<div class="ref"><img src="data:image/png;base64,${r.b64}"/><p>${r.k}（外部取证：只抄"白为主、图退一条"这个结构，不抄它的装饰件）</p></div>`).join('')}${`<div style="max-width:520px;font-size:13.5px;line-height:1.7;color:#4A4741">麦色阶这五档与派生出来的层色、page 底：<div style="font-size:12px;color:#7A756C;margin-top:6px">RAMP 与 page 现读 palette.THEMES 里 tint-paper 那一条；层色按规格 §1 那条式子从 chromeOf 现算。</div></div>`}</div>
<div class="row" style="width:100%">${ramp}</div>
<div class="row" style="width:100%">${table}</div>`
const OUT = path.join(DIR, 'c3-第一屏框体不变只调白麦比例.html')
fs.writeFileSync(OUT, HTML)
const PNG = path.join(DIR, 'c3-第一屏框体不变只调白麦比例.png')
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
   '--window-size=2120,9000', `--screenshot=${PNG}`, '--virtual-time-budget=9000', 'file://' + OUT],
  { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] })

/* ---------- ⑥ 在产物上量：框没变大这条不许靠稿子自述 ---------- */
const SCALE = 0.53
const audit = JSON.parse(execFileSync('python3', ['-c', `
import json
from PIL import Image
im=Image.open(${JSON.stringify(PNG)}).convert('RGB'); W,H=im.size; px=im.load()
BGc=(239,236,230)
def isbg(c): return all(abs(c[i]-BGc[i])<=3 for i in range(3))
last=0
for y in range(H-1,-1,-1):
    if any(not isbg(px[x,y]) for x in range(0,W,13)): last=y; break
def hx(h): return [int(h[i:i+2],16) for i in (1,3,5)]
SCALE=${SCALE}
FACE=hx(${JSON.stringify(FACE)}); CARD=hx(${JSON.stringify(CARD_C)}); PAGE=hx(${JSON.stringify(PAGE)})
DARK=hx(${JSON.stringify(surf.panel)}); SCARD=hx(${JSON.stringify(surf.card)})
def near(c,t,tol=5): return all(abs(c[i]-t[i])<=tol for i in range(3))
RED=[228,70,43]
# 每台的 x 带：slot 宽 398、gap 26、body 左内边距 30。两根量尺柱子都落在框内：
# xA＝面板左边往里 39rpx（甲/乙 那一列整根都是麦框，丙 是"上麦下白"，现网那台整根是黑框）
# xB＝往里 80rpx（白卡里那三枚圈的左边在 155rpx，这一列躲开了它们，能量到白卡的整根净高）
phones=[]
def col_run(x,sets,y0,y1,tol=2,gap=2):
    # 连续匹配，但允许中间断 2 行——丙 那一档麦框与白卡之间那道 3px 描边两头都不沾色，
    # 不许它把一根尺子劈成两段；面板底下的投影正好从第 4 行起才沾色，断 3 行就收
    start=None; last=None; miss=0
    for y in range(y0,y1):
        if any(near(px[x,y],t,tol) for t in sets):
            if start is None: start=y
            last=y; miss=0
        elif start is not None:
            miss+=1
            if miss>gap: break
    return ((last-start+1) if start is not None else 0), start
for i in range(4):
    L=30+i*424
    xA=L+int(39*SCALE); xB=L+int(80*SCALE)
    allow=[DARK,SCARD] if i==0 else [FACE,CARD]
    line=None
    for y in range(0,last):
        hit=tot=0
        for x in range(L+int(24*SCALE),L+int(726*SCALE),2):
            tot+=1
            if near(px[x,y],RED,30): hit+=1
        if tot and hit/tot>0.22: line=y; break
    y0=(line if line is not None else 0)+8; y1=y0+int(500*SCALE)+40
    ph,ph_top=col_run(xA,allow,y0,y1)
    cd,cd_top=col_run(xB,[CARD],y0,y1) if i else (0,0)
    phones.append({"line":line,"panel":ph,"panel_top_off":(ph_top-line) if line else None,
                   "card":cd})
counts=[sum(1 for y in range(0,last,3) for x in range(0,W,3) if near(px[x,y],t,4)) for t in (FACE,CARD,PAGE,DARK)]
def band(target,tol=30):
    return sum(1 for y in range(0,last) for x in range(0,W,2)
               if all(abs(px[x,y][i]-target[i])<tol for i in range(3)))
red=band((228,70,43)); blue=band((46,107,255)); green=band((23,122,62))
print(json.dumps({"W":W,"H":H,"last":last,"counts":counts,"phones":phones,"red":red,"blue":blue,"green":green}))`], { encoding: 'utf8' }))
ck('内容末行落在窗口内（没被窗口高度截掉）', audit.last < audit.H - 60, `末行 ${audit.last} / 窗口高 ${audit.H}`)
;[['麦色面板', FACE], ['白卡', CARD_C], ['page 底', PAGE], ['现网黑框', surf.panel]].forEach(([l, c], i) =>
  ck(`产物上找得到${l}（${c}）`, audit.counts[i] > 900, `${audit.counts[i]} 个采样点`))
ck('红/蓝/绿三条参考线都画出来了', audit.red > 900 && audit.blue > 300 && audit.green > 300,
  `红 ${audit.red}、蓝 ${audit.blue}、绿 ${audit.green}`)
// 那根柱子（x=39rpx）离面板左边 15rpx，圆角 55 在上下各吃掉一段，先把这段算出来再谈期望值
const arcAt = (() => { const d = G.radius - 15; return G.radius - Math.sqrt(G.radius * G.radius - d * d) })()
const want = Math.round((G.liveH - G.edge * 2 - 2 * arcAt) * SCALE)
const gotP = audit.phones.map((p) => p.panel)
const lines = audit.phones.map((p) => p.line)
const offs = audit.phones.map((p) => p.panel_top_off)
ck('四台都找到了那条顶线，且四条在同一条高度（±3px）',
  lines.every((y) => y !== null) && Math.max(...lines) - Math.min(...lines) <= 3, `量到 ${lines.join(' / ')}`)
ck(`四台量到的框体柱子一般高（最多差 ${Math.max(...gotP) - Math.min(...gotP)}px）——"框体没变大"是拿现网那台当尺子量出来的`,
  Math.max(...gotP) - Math.min(...gotP) <= 3 && gotP.every((h) => Math.abs(h - want) <= 12),
  `期望 ${want}px（(500−6−上下圆角 ${arcAt.toFixed(1)}×2)×0.53），四台量到 ${gotP.join(' / ')}`)
ck('四台的框都从那条线下面第一像素起，没有一台越线往上长',
  offs.every((o) => o !== null && o >= 8 && o <= 18), `顶线→框起点的距离 ${offs.join(' / ')}`)
const cards = audit.phones.slice(1).map((p) => p.card)
const cardArc = (() => { const d = G.cardR - (80 - (G.side + G.edge + G.padX)); return G.cardR - Math.sqrt(G.cardR * G.cardR - d * d) })()
const wantC = VARIANTS.map((v) => Math.round((v.card - 2 * cardArc) * SCALE))
ck('白卡净高在产物上一档比一档高，且与算出来的对得上（±8px）',
  cards[0] < cards[1] && cards[1] < cards[2] && cards.every((h, i) => Math.abs(h - wantC[i]) <= 8),
  `量到 ${cards.join('/')}px，算出来 ${wantC.join('/')}`)
console.log(`绿点线（下巴）落在蓝虚线（带底）上面——带边没切下巴：下巴 ${(chinY(BAND) / SC.h * 100).toFixed(1)}%、带底 ${BAND_PCT}%、面板顶 ${(liveTop / SC.h * 100).toFixed(1)}%`)
execFileSync('python3', ['-c', `
from PIL import Image
im=Image.open(${JSON.stringify(PNG)}).convert('RGB')
im.crop((0,0,im.width,min(im.height,${audit.last} + 46))).save(${JSON.stringify(PNG)})`])
console.log(`\n${bad.length ? '✗ ' + bad.length + ' 条不过：' + bad.join('、') : '第一屏框体不变只调白麦比例 静态+产物：全过'}`)
if (bad.length) process.exit(1)
console.log('正本：' + PNG)
