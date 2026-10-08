// 第一屏第四版：背景图贯穿（撤掉那条压矮带），框体仍是现网 500rpx，只把白多一点、边做细。
// 跑法：node docs/design/10-08第一屏浅色三方向/画-c4.mjs
//
// 站长 10-08 深夜指着他截图里那两台说：「第一个是现网，我需求是把第一个现网的框体尺寸不变，
// 里面白色，外面浅麦色，调整白色与浅麦色的比例，稍微多一点。边框可以细一点，精致一点。
// 不要放大边框背景区域，我不明白第二个图为什么多了一块，然后背景图没有贯穿，这个不符合我的需求。」
// ——三件事，逐条落到这一稿：
// ① 「多了一块」＝c3 把背景带压到屏高 50%，带底与面板顶之间露出 183rpx 的麦色 page 底，
//    那一块是凭空多出来的。这一稿背景恢复现网那样满铺贯穿（100vh），那条蓝虚线与绿点线一起撤掉。
// ② 「白色稍微多一点」＝不再做 60→72→80 那种大跨度，只从现网那档 60.6% 往上挪一点：
//    丁 65.8%（挪一点点）、戊 69.3%（再多一点），两档都还在"外面一圈浅麦、里面白"这个结构里。
// ③ 「边框细一点、精致一点」＝面板与卡那两道描边从现网的 3rpx 收到 2rpx，投影也收小一档。
//    框体那四个数（高 500、底 152、左右 24、圆角 55）一个都没动，顶线仍是屏高 61.0%。
//
// 尺子全部现读（同 c3）：盒子等式与两个实测数从 create.wxss 注释里抠出来跟 CSS 对数；
// 层色＝规格 §1 那条派生式从 palette.chromeOf('tint-paper') 现算；两支橙＝规格-创建入口 §6.1；
// 界面话＝utils/i18n.js 的 zh 键；底图＝assets/home-bg-portrait.jpg 真件。
// 产物复核三件事：三台的框体柱子一般高（拿现网那台当尺子）、顶线同一条、
// 面板左右两侧那一窄条里"连续 10 像素以上是 page 底"的地方一处都不许有——那就是"多出来的一块"。
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

/* ---------- ① 框体几何：与 c3 同一套现读，一个数都不许自己填 ---------- */
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
const borderW = (v, w) => num(String(v).split(/\s+/)[0], w)
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
const EQ = /上内边距\s*([\d.]+)\s*\+\s*标签行\s*([\d.]+)\s*\+\s*卡上边距\s*([\d.]+)\s*\+\s*卡边框\s*([\d.]+)\s*\+\s*卡内边距\s*([\d.]+)\s*\+\s*内容\s*([\d.]+)\s*\+\s*下内边距\s*([\d.]+)/.exec(RAW)
const PHOTO = /快门\s*([\d.]+)\s*\+\s*间距\s*([\d.]+)\s*\+\s*那行字\s*([\d.]+)）?实测\s*([\d.]+)/.exec(RAW)
ck('从 create.wxss 注释里读到那条盒子等式与那两个实测数', !!(EQ && PHOTO), EQ ? EQ[0].slice(0, 46) + '…' : '等式没读到')
const [, ePadT, eModesH, eCardMt, eCardEdge, eCardPad, eInner, ePadB] = EQ.map(Number)
ck('等式里的四个数与 CSS 现读一致（读的是同一套盒子）',
  ePadT === G.padT && eCardMt === G.cardMt && eCardEdge === G.edge * 2 && eCardPad === G.cardPad * 2 && ePadB === G.padB,
  `注释 ${ePadT}/${eCardMt}/${eCardEdge}/${eCardPad}/${ePadB}　CSS ${G.padT}/${G.cardMt}/${G.edge * 2}/${G.cardPad * 2}/${G.padB}`)
ck('等式加总等于面板高（盒子闭合）',
  G.edge * 2 + ePadT + eModesH + eCardMt + eCardEdge + eCardPad + eInner + ePadB === G.liveH,
  `标签行 ${eModesH} ＋ 内容 ${eInner} 从这条等式反推，别处没写死`)
const MODES_H = eModesH
const LB_LINE = Number(PHOTO[3]) || 32.4
const SHUT_GAP = Number(PHOTO[2])
const SHUT_NEW = 180, CORE_NEW = 132
const stackPhoto = (s) => s + SHUT_GAP + LB_LINE
const SC = { w: 750, h: 1670 }
G.outH = Math.round(parseFloat(OUTROW['line-height']) * G.meta) + G.outPadB
const liveTop = SC.h - G.bottom - G.liveH
const panelW = SC.w - G.side * 2
const eOf = (v) => v.edge || G.edge
const cardW = (v) => panelW - eOf(v) * 2 - v.padX * 2
const cardOuter = (v) => G.liveH - eOf(v) * 2 - v.padT - MODES_H - v.cardMt - v.padB
const cardInner = (v) => cardOuter(v) - eOf(v) * 2 - v.cardPad * 2
const whitePct = (v) => (cardW(v) * cardOuter(v)) / ((panelW - G.edge * 2) * (G.liveH - G.edge * 2)) * 100

/* ---------- ② 两档：白"稍微多一点"，描边收到 2rpx；框体那四个数不动 ---------- */
const EDGE_NEW = 2                                   // 「边框可以细一点」：3rpx → 2rpx（再细就量不出来了）
const VARIANTS = [
  { id: 'D', name: '丁 白稍多一点＋细边', padT: 22, padX: 24, padB: 24, cardMt: 18, cardPad: G.cardPad, edge: EDGE_NEW },
  { id: 'E', name: '戊 白再多一点＋细边', padT: 18, padX: 18, padB: 20, cardMt: 14, cardPad: G.cardPad, edge: EDGE_NEW },
]
const geoOf = (o) => ({ ...o, topPct: liveTop / SC.h * 100, card: cardOuter(o), inner: cardInner(o),
  white: whitePct(o), wheat: 100 - whitePct(o), edge: eOf(o) })
const OLD = geoOf({ name: '<b>现网对照（那块黑框）</b>', shut: G.shut, padT: G.padT, padX: G.padX, padB: G.padB, cardMt: G.cardMt, cardPad: G.cardPad, edge: G.edge })
for (const v of VARIANTS) { Object.assign(v, geoOf(v)); v.shut = SHUT_NEW }
const LIVE_WHITE = whitePct(OLD)
ck('两档都比现网那档白得多一点，但都只挪一点（不是 c3 那种一步到 80%）',
  VARIANTS.every((v) => v.white > LIVE_WHITE && v.white < LIVE_WHITE + 12),
  `现网 ${LIVE_WHITE.toFixed(1)}% → ${VARIANTS.map((v) => v.id + ' ' + v.white.toFixed(1) + '%').join(' → ')}`)
for (const v of VARIANTS) {
  ck(`${v.id}：框体没变大（面板 ${G.liveH}、顶 ${(v.topPct).toFixed(1)}%、底 ${G.bottom}、左右 ${G.side}、圆角 ${G.radius}，与现网一字不差）`,
    v.topPct === (liveTop / SC.h) * 100, `只有描边 ${G.edge}→${v.edge}rpx 与框肚子里的内边距在让位`)
  ck(`${v.id}：照片那一叠（快门缩到 ${SHUT_NEW}）放得进白卡`, stackPhoto(SHUT_NEW) <= v.inner,
    `${stackPhoto(SHUT_NEW)} ≤ 内容位 ${v.inner.toFixed(1)}，白卡外高 ${v.card.toFixed(1)}`)
  ck(`${v.id}：恒等式成立（涨出来的白＝麦框让出来的，不是扩框）`,
    Math.abs((cardOuter(v) + v.padT + v.cardMt + v.padB) - (G.liveH - v.edge * 2 - MODES_H)) < 0.01)
}

/* ---------- ③ 背景：满铺贯穿（现网那样），不许露出 page 底那一条 ---------- */
const BAND = SC.h
ck('背景带＝整屏（与现网同），c3 那条"压到 50%"的带作废', BAND === SC.h,
  `c3 露出的那一块 = 面板顶 ${liveTop} − 带底 ${Math.round(SC.h * 0.5)} = ${liveTop - Math.round(SC.h * 0.5)}rpx 麦色 page 底，这一稿为 0`)
ck('那句小字（选记录模式／点空白处收起）落在底图上，不在 page 底上', true,
  `它占面板顶上面那 ${G.outH}rpx，那一段现在是底图＋白罩`)

/* ---------- ④ 色 ---------- */
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
const RING = solve(INK, FACE, 3.0)
// 那句小字现在压在底图＋白罩上，那块的底色不能凭印象：按 cover 的裁切把源图对应那一条采样、
// 再按白罩在那一行的实际透明度混出来
const OUT_FACE = (() => {
  const out = execFileSync('python3', ['-c', `
from PIL import Image
im=Image.open(${JSON.stringify(path.join(MP, 'assets/home-bg-portrait.jpg'))}).convert('RGB')
sc=max(${SC.w} / 1116, ${SC.h} / 1920)          # cover：满铺时按高铺，宽要裁两边
ox=(${SC.w} - 1116*sc)/2/sc                     # 屏上 x=0 对应源图的那一列
ys=[(${liveTop} - ${G.outH} + k*8) / sc for k in range(6)]   # 那句小字占的那一段，换算回源图行
pts=[im.getpixel((int(ox + x), int(min(im.height-1, y)))) for y in ys for x in range(int(ox)+20, 700, 40)]
pts.sort(key=lambda p: sum(p)); med=pts[len(pts)//2]
a=0.26                                           # 白罩在那一行的透明度（渐变 82/60/26/0 在 0/26/58/100%）
print('#' + ''.join('%02X' % round(med[i]*a + 255*(1-a)) for i in range(3)))`], { encoding: 'utf8' }).trim()
  if (!/^#[0-9A-F]{6}$/.test(out)) throw new Error('采不到那句小字底下的颜色：' + out)
  return out
})()
const OUT_INK = solve(INK, OUT_FACE, 4.5)
ck('那句小字底下的颜色是从源图那一条采出来再混白罩算的（不是拿 page 底糊过去）', true,
  `混出来 ${OUT_FACE}，墨字反解到 ${OUT_INK} → ${cr(mix(INK, OUT_INK, OUT_FACE), OUT_FACE)}`)
const ROWS = []
const row = (l, f, b, need, note) => ROWS.push({ l, f, b, need, c: cr(f, b), note })
row('现网对照：纸白字压那块黑框', PAPER, surf.panel, 4.5)
row('麦色面板与 page 底的分离', FACE, PAGE, 1.1, '〔背景贯穿之后这一条只在框子最外那圈用得上〕')
row('白卡与麦色面板的分离', CARD_C, FACE, 1.1, '白多麦少就靠这条＋那道细边撑边界')
row('墨字压白卡（标题、选中那个标签）', INK, CARD_C, 4.5)
row('墨字压麦色面板（标签行那一格仍在麦上）', INK, FACE, 4.5)
row('模式标签未选那档（按面板反解）', mix(INK, solve(INK, FACE, 4.5), FACE), FACE, 4.5)
row('框外那句小字压底图＋白罩（反解到 ' + OUT_INK + '）', mix(INK, OUT_INK, OUT_FACE), OUT_FACE, 4.5)
row('框里那句提示字（按条底反解到 ' + WELL_INK + '）', mix(INK, WELL_INK, WELL), WELL, 4.5)
row('控件那一档与白卡的分离', WELL, CARD_C, 1.1, '小圆/输入框/右滑条同一档——浅面上这一条本来就弱')
row('快门那圈墨环压白卡（环画在白卡里）', mix(INK, RING, CARD_C), CARD_C, 3.0)
row('〔反向对照〕同一圈若仍画白环', PAPER, CARD_C, 3.0)
row('拍照那支橙压白卡', CAM, CARD_C, 3.0)
row('〔反向对照〕拍照那支橙若挪到麦框上', CAM, FACE, 3.0)
row('快门里那个图形：深字压橙', '#2C1204', CAM, 4.5)
row('提炼那支橙圆压条底', EXTRACT, WELL, 3.0)
row('条里那句墨字压条底', INK, WELL, 4.5)
row('描边那道墨（2rpx，ink 12%）压麦框', mix(INK, .12, FACE), FACE, 1.1, '「细一点」收到 2rpx，靠色差不靠粗细')
row('选中那枚底下那条短杠（这一屏吃墨）', INK, FACE, 3.0)
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
.lead{font-size:14.5px;line-height:1.75;color:#4A4741;margin:9px 0 20px;max-width:1500px}
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
.panel{height:${G.liveH}px;border-radius:${G.radius}px;display:flex;flex-direction:column}
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
.g{display:block;background:currentColor;-webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center}
.cam{width:60px;height:60px;-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><path d='M4 8h3l2-2h6l2 2h3v11H4z'/><circle cx='12' cy='13' r='3.4'/></svg>")}
.imgs{width:40px;height:40px;-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><rect x='3' y='6' width='15' height='13' rx='2'/><path d='M7 3h14v14'/><path d='M6 16l4-4 4 4'/></svg>")}
.lnk{width:40px;height:40px;-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><path d='M10 14a4 4 0 0 1 0-5.6l2-2a4 4 0 1 1 5.6 5.6l-1 1'/><path d='M14 10a4 4 0 0 1 0 5.6l-2 2A4 4 0 1 1 6.4 12l1-1'/></svg>")}
.bar2{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:44px;display:flex;align-items:center;justify-content:space-around;z-index:9;background:${CH.bg}}
.bar2 u{text-decoration:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:34px}
.line{position:absolute;left:0;right:0;border-top:6px dashed #E4462B;z-index:12}
.line em{position:absolute;right:8px;top:-32px;font-size:21px;font-style:normal;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.88);color:#E4462B}
table{border-collapse:collapse;font-size:13.5px;background:#fff;box-shadow:0 1px 0 #D8D4CC;margin-top:14px}
th,td{border-bottom:1px solid #EAE6DF;padding:7px 12px;text-align:left;white-space:nowrap}
th{background:#F6F3EE;font-weight:600;color:#4A4741}
td.no{color:#B3261E;font-weight:700}td.ok{color:#2C6E49}
.sw{display:inline-block;width:13px;height:13px;border-radius:3px;vertical-align:-2px;margin-right:6px;border:1px solid rgba(0,0,0,.14)}
.ramp{display:flex;gap:6px;margin:10px 0 0}.ramp div{width:96px;height:52px;border-radius:8px;font-size:11.5px;color:#fff;padding:6px;box-shadow:0 1px 0 #D8D4CC}
.ref{background:#fff;padding:10px;border-radius:14px;box-shadow:0 1px 0 #D8D4CC}.ref img{width:230px;display:block;border-radius:8px}.ref p{font-size:12.5px;color:#5C5850;margin-top:7px}
`
const statusbar = (c) => `<div class="status" style="color:${c}">9:41<b style="font-weight:400">▮▮▮  ▰</b></div>`
const navbar = (c, cap) => `<div class="nav" style="color:${c}">图麦笔记<div class="capsule" style="background:${cap.bg};color:${cap.ink};border:1px solid ${cap.edge}">•••　◎</div></div>`
const head = (old) => {
  const c = old ? PAPER : INK
  const cap = old ? { bg: 'rgba(0,0,0,.18)', ink: '#fff', edge: 'rgba(255,255,255,.32)' } : { bg: 'rgba(255,255,255,.66)', ink: '#14161A', edge: 'rgba(20,22,26,.18)' }
  return `<div class="photo" style="height:${BAND}px;background-image:url(data:image/jpeg;base64,${BG})"></div>
    <div class="${old ? 'scrim' : 'wash'}" style="height:${BAND}px"></div>${statusbar(c)}${navbar(c, cap)}
    <div class="h1t" style="color:${c}">${T('createHeading')}</div>
    <div class="lang" style="color:${old ? mix(PAPER, .5, surf.panel) : mix(INK, .55, OUT_FACE)}"><b style="color:${c}">中</b>　EN</div>
    <div class="toolrow" style="color:${old ? mix(PAPER, .72, surf.panel) : mix(INK, .78, OUT_FACE)}">
      <i><span class="dotdim" style="background:${mix(INK, .55, PAPER)}"></span>${T('bgDimLabel')}</i><i>${T('homeBgSwap')} ›</i></div>`
}
const modes = (on, old) => ['photo', 'url', 'write'].map((k) => {
  const sel = on === k
  const c = old ? (sel ? PAPER : mix(PAPER, .5, surf.panel)) : (sel ? INK : mix(INK, solve(INK, FACE, 4.5), FACE))
  return `<div class="md ${sel ? 'on' : ''}" style="color:${c};font-weight:${sel ? 600 : 400}">${T(k === 'photo' ? 'modePhoto' : k === 'url' ? 'modeUrl' : 'modeWrite')}</div>` }).join('')
const body = (v, old) => {
  const face = old ? surf.panel : FACE, card = old ? surf.card : CARD_C
  const mute = old ? mix(PAPER, .5, surf.panel) : mix(INK, WELL_INK, WELL)
  const ring = old ? PAPER : mix(INK, RING, CARD_C)
  const core = old ? RAMP[2] : CAM, coreInk = old ? PAPER : '#2C1204'
  const shut = old ? G.shut : SHUT_NEW, cor = old ? 155 : CORE_NEW
  const padX = old ? G.padX : v.padX, padT = old ? G.padT : v.padT, padB = old ? G.padB : v.padB
  const cmt = old ? G.cardMt : v.cardMt, cpad = old ? G.cardPad : v.cardPad, ed = old ? G.edge : v.edge
  const shd = old ? '0 24rpx 52rpx rgba(8,10,14,.34)' : '0 16px 34px rgba(8,10,14,.10)'
  return `<div class="dock">
      <div class="out" style="color:${old ? mix(PAPER, .56, '#000') : mix(INK, OUT_INK, OUT_FACE)}"><span>${T('chooseMode')}</span><span>${T('barCollapse')}</span></div>
      <div class="panel ${old ? 'old' : ''}" style="background:${face};border:${ed}px solid ${old ? 'rgba(242,239,233,.10)' : rgbaOf(INK, .10)};padding:${padT}px ${padX}px ${padB}px;box-shadow:${shd}">
        <div class="modes">${modes('photo', old)}</div>
        <div class="card" style="margin-top:${cmt}px;padding:${cpad}px;border-radius:${G.cardR}px;background:${card};border:${ed}px solid ${old ? 'rgba(242,239,233,.07)' : rgbaOf(INK, .12)}">
          <div class="crow">
            <div class="mini"><div class="mini-c" style="${old ? 'background:' + surf.field : ''}"><span class="g imgs" style="color:${mute}"></span></div><div class="mini-lb" style="color:${mute}">${T('fromAlbum')}</div></div>
            <div class="shutcol"><div class="shut" style="width:${shut}px;height:${shut}px;border:${G.ring}px solid ${ring}"><div class="core" style="width:${cor}px;height:${cor}px"><span class="g cam" style="color:${coreInk}"></span></div></div><div class="mini-lb" style="font-size:${G.meta}px;color:${mute}">${T('takePhoto')}</div></div>
            <div class="mini"><div class="mini-c" style="${old ? 'background:' + surf.field : ''}"><span class="g lnk" style="color:${mute}"></span></div><div class="mini-lb" style="color:${mute}">${T('modeUrl')}</div></div></div>
        </div></div></div>`
}
const tabbar = () => `<div class="bar2"><u style="background:${CH.sel};color:${PAPER}">＋</u><u style="color:${rgbaOf(PAPER, .62)}">≡</u><u style="color:${rgbaOf(PAPER, .62)}">◡</u></div>`
const phone = (v, old = false) => `<div class="slot"><div class="ph"><div class="page"></div>${head(old)}${body(v, old)}${tabbar()}
  <div class="line" style="top:${liveTop}px"><em>${old ? '现网面板顶 61.0%' : '面板顶 61.0%（三台同一条线，框没动）'}</em></div>
</div></div>`
const cap = (v) => {
  const note = v.id === 'D' ? '比现网那档多让出 8rpx 上边距、8rpx 左右、7rpx 卡上边距；描边 3→2rpx，投影从 24/52 收到 16/34。'
    : v.id === 'E' ? '再让一档：麦框四边只剩 18rpx，白卡顶到标签行下面。再往上就得动结构（把标签搬进白卡），那不是你这一句要的事。'
    : '这一台是尺子：面板 500、白卡 632×329.5、描边 3rpx、投影 24/52、背景满铺。'
  return `<div class="slot"><div class="cap"><b>${v.name}</b>：框体 ${G.liveH}rpx、顶 ${v.topPct.toFixed(1)}%、底 ${G.bottom}、左右 ${G.side}、圆角 ${G.radius}——与现网一字不差。白卡 ${cardW(v)}×${v.card.toFixed(1)}，占面板 <b>${v.white.toFixed(1)}%</b>（现网 ${LIVE_WHITE.toFixed(1)}%，多 ${(v.white - LIVE_WHITE).toFixed(1)} 个点）、占整屏 ${(cardW(v) * v.card / (SC.w * SC.h) * 100).toFixed(1)}%；描边 ${v.edge}rpx；卡内内容位 ${v.inner.toFixed(1)}，照片那一叠（快门 ${v.shut}）${stackPhoto(v.shut)}，余量 ${(v.inner - stackPhoto(v.shut)).toFixed(1)}。<br>${note}</div></div>`
}
const geoTable = `<table><tr><th>这一台</th><th>框体高</th><th>描边</th><th>上内边距</th><th>左右内边距</th><th>下内边距</th><th>卡上边距</th><th>白卡外高</th><th>内容位</th><th>白占面板</th><th>麦占面板</th></tr>` +
  [OLD, ...VARIANTS].map((v) => `<tr><td>${v.name}</td><td>${G.liveH}${v.id ? '' : '（不变）'}</td><td>${v.edge}</td><td>${v.padT}</td><td>${v.padX}</td><td>${v.padB}</td><td>${v.cardMt}</td><td>${v.card.toFixed(1)}</td><td>${v.inner.toFixed(1)}</td><td><b>${v.white.toFixed(1)}%</b></td><td>${v.wheat.toFixed(1)}%</td></tr>`).join('') + '</table>'
const table = `<table><tr><th>这一处</th><th>前景</th><th>背景</th><th>实测</th><th>门槛</th></tr>` + ROWS.map((r) =>
  `<tr><td>${r.l}${r.note ? '　<span style="color:#8A857C">' + r.note + '</span>' : ''}</td><td><span class="sw" style="background:${rgbOf(r.f)}"></span>${r.f}</td><td><span class="sw" style="background:${rgbOf(r.b)}"></span>${r.b}</td><td class="${r.c >= r.need ? 'ok' : 'no'}">${r.c.toFixed(2)}</td><td>${r.need}</td></tr>`).join('') + '</table>'
const ramp = `<div class="ramp">${RAMP.map((c, i) => `<div style="background:${c};color:${IVORY.ramp.inks[i]}">${c}<br>第${i + 1}档</div>`).join('')}<div style="background:${LAYER};color:${INK}">${LAYER}<br>层色（派生）</div><div style="background:${OUT_FACE};color:${INK}">${OUT_FACE}<br>那句小字底下（源图采出来混白罩）</div></div>`
const NPH = 1 + VARIANTS.length
const HTML = `<!doctype html><meta charset="utf-8"><style>${css}</style>
<h1>第一屏 · 背景贯穿、框体不动、白稍多一点、边收细<span>现网那块黑框刷成浅麦＋白；面板仍是 500rpx／顶线 61.0%；代码一行没动</span></h1>
<div class="lead">三台从左到右：<b>第 1 台是现网那块黑框（尺子）</b>，后两台只改两件事——<b>白稍多一点</b>（占面板 ${LIVE_WHITE.toFixed(1)}% → ${VARIANTS[0].white.toFixed(1)}% → ${VARIANTS[1].white.toFixed(1)}%）与<b>描边收细</b>（${G.edge}rpx → ${EDGE_NEW}rpx，投影 24/52 收到 16/34）。上一稿（c3）那两条蓝虚线、绿点线一起撤掉：背景照现网满铺贯穿，面板顶上面不再露出麦色 page 底那一块。其余照旧：默认＝面板展开、日期撤掉换成左上角「调亮度｜换背景」、快门 ${G.shut}→${SHUT_NEW}、拍照与提炼两枚固定橙（${CAM}／${EXTRACT}）、白环换墨环（白环压白卡只有 ${cr(PAPER, CARD_C)}，等于没有）、头部那层罩子从深罩换白罩。</div>
<div class="row">${phone({}, true)}${VARIANTS.map((v) => phone(v)).join('')}</div>
<div class="row">${cap(OLD)}${VARIANTS.map(cap).join('')}</div>
<div class="row" style="width:100%">${geoTable}</div>
<div class="row">${REFS.map((r) => `<div class="ref"><img src="data:image/png;base64,${r.b64}"/><p>${r.k}（外部取证：白为主、图当背景这一条结构照它，不抄它的装饰件）</p></div>`).join('')}</div>
<div class="row" style="width:100%">${ramp}</div>
<div class="row" style="width:100%">${table}</div>`
const OUT = path.join(DIR, 'c4-第一屏背景贯穿白稍多细边.html')
fs.writeFileSync(OUT, HTML)
const PNG = path.join(DIR, 'c4-第一屏背景贯穿白稍多细边.png')
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
   '--window-size=1420,9000', `--screenshot=${PNG}`, '--virtual-time-budget=9000', 'file://' + OUT],
  { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] })

/* ---------- ⑥ 在产物上量：框没变大、背景真贯穿，两条都不许靠稿子自述 ---------- */
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
SCALE=${SCALE}; NPH=${NPH}
FACE=hx(${JSON.stringify(FACE)}); CARD=hx(${JSON.stringify(CARD_C)}); PAGE=hx(${JSON.stringify(PAGE)})
DARK=hx(${JSON.stringify(surf.panel)}); SCARD=hx(${JSON.stringify(surf.card)}); RED=[228,70,43]
def near(c,t,tol=5): return all(abs(c[i]-t[i])<=tol for i in range(3))
def col_run(x,sets,y0,y1,tol=2,gap=2):
    # 连续匹配，中间允许断 2 行（丙 那种麦框与白卡之间那道描边两头都不沾色，不许把尺子劈成两段）
    start=None; last=None; miss=0
    for y in range(y0,y1):
        if any(near(px[x,y],t,tol) for t in sets):
            if start is None: start=y
            last=y; miss=0
        elif start is not None:
            miss+=1
            if miss>gap: break
    return ((last-start+1) if start is not None else 0), start
def page_run(x,y0,y1):
    best=0; cur=0
    for y in range(y0,y1):
        cur=cur+1 if near(px[x,y],PAGE,4) else 0
        best=max(best,cur)
    return best
phones=[]
for i in range(NPH):
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
    top=int(line-${liveTop}*SCALE) if line is not None else 0
    bot=top+int(${SC.h}*SCALE)
    y0=(line or 0)+8; y1=y0+int(500*SCALE)+40
    ph,ph_top=col_run(xA,allow,y0,y1)
    cd,_=col_run(xB,[CARD] if i else [SCARD],y0,y1)
    # 面板左右外侧那一窄条：那里若出现连续 10 像素以上的 page 底，就是"多出来的一块"
    side=max(page_run(xA,y0,bot),page_run(L+int(712*SCALE),y0,bot),page_run(xA,top,line or 0))
    phones.append({"line":line,"panel":ph,"off":(ph_top-line) if line else None,
                   "card":cd,"side_page_run":side,"top":top,"bot":bot})
counts=[sum(1 for y in range(0,last,3) for x in range(0,W,3) if near(px[x,y],t,4)) for t in (FACE,CARD,PAGE,DARK)]
red=sum(1 for y in range(0,last) for x in range(0,W,2) if near(px[x,y],RED,30))
print(json.dumps({"W":W,"H":H,"last":last,"counts":counts,"phones":phones,"red":red}))`], { encoding: 'utf8' }))
ck('内容末行落在窗口内（没被窗口高度截掉）', audit.last < audit.H - 60, `末行 ${audit.last} / 窗口高 ${audit.H}`)
;[['麦色面板', FACE, 900], ['白卡', CARD_C, 900], ['现网黑框', surf.panel, 200]].forEach(([l, c, floor], i) =>
  // 现网那台只占这一行的三分之一，且它那一块 DARK 是框环（肚子里是 SCARD 另一档色），门槛单独定
  ck(`产物上找得到${l}（${c}）`, audit.counts[i] > floor, `${audit.counts[i]} 个采样点，门槛 ${floor}`))
ck(`那条顶线画到了（${audit.red} 个采样点），${NPH} 台都在同一条高度（±3px）`, audit.red > 700 &&
  audit.phones.map((p) => p.line).every((y) => y !== null) &&
  Math.max(...audit.phones.map((p) => p.line)) - Math.min(...audit.phones.map((p) => p.line)) <= 3,
  `量到 ${audit.phones.map((p) => p.line).join(' / ')}`)
const arcAt = (() => { const d = G.radius - 15; return G.radius - Math.sqrt(G.radius * G.radius - d * d) })()
const want = Math.round((G.liveH - G.edge * 2 - 2 * arcAt) * SCALE)
const gotP = audit.phones.map((p) => p.panel)
ck(`三台量到的框体柱子一般高（最多差 ${Math.max(...gotP) - Math.min(...gotP)}px，含现网那台）——"框体尺寸不变"是量出来的`,
  Math.max(...gotP) - Math.min(...gotP) <= 3 && gotP.every((h) => Math.abs(h - want) <= 12),
  `期望 ${want}px（(500−6−上下圆角 ${arcAt.toFixed(1)}×2)×0.53），三台量到 ${gotP.join(' / ')}`)
ck('三台的框都从那条线下面第一像素起，没有一台越线往上长',
  audit.phones.every((p) => p.off !== null && p.off >= 8 && p.off <= 18), `顶线→框起点 ${audit.phones.map((p) => p.off).join(' / ')}`)
const cards = audit.phones.slice(1).map((p) => p.card)
// 那根白卡柱子（x=80rpx）离各台自己的卡左边不等远，圆角吃掉的量要按每台各算一次
const cardArcOf = (v) => { const dx = 80 - (G.side + v.edge + v.padX); const d = G.cardR - dx
  return dx >= G.cardR ? 0 : G.cardR - Math.sqrt(G.cardR * G.cardR - d * d) }
const wantC = VARIANTS.map((v) => Math.round((v.card - 2 * cardArcOf(v)) * SCALE))
const oldC = Math.round((OLD.card - 2 * cardArcOf(OLD)) * SCALE)
ck('白卡净高在产物上比现网那台高，且与算出来的对得上（±8px）',
  cards.every((h, i) => h > audit.phones[0].card + 6 && Math.abs(h - wantC[i]) <= 8) && cards[1] > cards[0] &&
  Math.abs(audit.phones[0].card - oldC) <= 8,
  `量到 现网${audit.phones[0].card}（算 ${oldC}）／${cards.join('／')}px，算出来 ${wantC.join('/')}`)
ck('面板外侧与顶线以上都没有"连续 10 像素以上的 page 底"——背景真贯穿，那块多出来的东西没了',
  audit.phones.every((p) => p.side_page_run <= 10),
  `三台各自最长的 page 底连续段 ${audit.phones.map((p) => p.side_page_run).join(' / ')}px（c3 那一块是 ${Math.round((liveTop - SC.h * 0.5) * SCALE)}px 高）`)
execFileSync('python3', ['-c', `
from PIL import Image
im=Image.open(${JSON.stringify(PNG)}).convert('RGB')
im.crop((0,0,im.width,min(im.height,${audit.last} + 46))).save(${JSON.stringify(PNG)})`])
console.log(`\n${bad.length ? '✗ ' + bad.length + ' 条不过：' + bad.join('、') : '第一屏背景贯穿白稍多细边 静态+产物：全过'}`)
if (bad.length) process.exit(1)
console.log('正本：' + PNG)
