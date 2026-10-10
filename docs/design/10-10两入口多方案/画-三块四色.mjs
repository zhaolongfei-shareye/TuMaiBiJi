// 站长 10-10 第二句（附了一张深色 App 的截图：左边一枚大蓝块 Photo trans、右边两枚紫/绿小块）：
// 「参考这个设计风格重新设计，包括 ICON 和文字设计。左边方块是拍照入口，右上是笔记数量和入口，
//   右下是卡片数量和入口。这三个是核心部件，最上面的改为 Tips。最下面的横条不需要。
//   然后整体往下移，与目前位置保持相对一致，不遮挡默认背景图的主图人像。
//   配色方面，你参考图片，然后按照你的理解，和兼顾第二屏的配色，出几个效果图。」
// 跑法：node docs/design/10-10两入口多方案/画-三块四色.mjs
//
// 结构照他这句钉死，四套色只换皮不换骨：
//   上：一条 Tips 药丸（现网那句 Tips 搬进来）
//   中：左一块 308×308 方形＝拍照入口；右列两枚 382×148＝笔记数量／卡片数量
//   下：**没有那条胶囊了**（他说"最下面的横条不需要"）
//   ICON：照参考图做成"实心片＋片里的图形"（左块方片、右两枚圆片），块名降到 600 重、去负字距
//
// 两条量到的前提，写进判据：
// ① 人像下巴在屏高 55.6%、抬起那只手到 62%（源图 1116×1920，aspectFill 到 750×1670 竖向不裁，
//    所以源图百分比＝屏百分比）。组顶守住 **66.3%** 那条现网面板顶的拍过线，正好在手之下。
// ② 第二屏那五支分类色是 宝蓝 #3F52D6 / 紫 #6E4BD0 / 草绿 #46A863 / 橙 #E9723D / 芥末黄 #F6C445
//    （palette.TONES）。参考图那三支亮蓝紫绿与它们同族——同一支色在两个屏上指两件不同的事，
//    这条不当红来拦，但每套都把它标在稿上。
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

/* ---------- ① 现读：令牌、罩子、几何、字体 ---------- */
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
const scrim = (/\.page-scrim\s*\{[^}]*background:\s*(linear-gradient\([^;]*\))/.exec(CSS) || [])[1]
if (!scrim) throw new Error('读不到 .page-scrim 那条渐变')
const BAR = rule('.bar'), DOCK = rule('.container.entry-dock .entry-wrap')
const SC = { w: 750, h: 1670 }
const G = { side: 24, gap: 12, meta: px('--fs-meta'), tiny: px('--fs-tiny'), micro: px('--fs-micro'),
  h1: px('--fs-h1'), title: px('--fs-title') }
const BG = fs.readFileSync(path.join(MP, 'assets/home-bg-portrait.jpg')).toString('base64')
const bgUrl = `url(data:image/jpeg;base64,${BG})`
const CH = palette.chromeOf('tint-paper')

/* ---------- ② 这一组的几何（组顶守 66.3% 那条线，往下算出来） ---------- */
const TOP_PCT = 66.3                                  // 现网面板顶：站长拍过的"不挡脸"那一条
const Y_TOP = Math.round(SC.h * TOP_PCT / 100)         // 1107
const TIPS_H = 56, ROW_H = 148, COL_GAP = 12
const GRP_H = TIPS_H + G.gap + ROW_H * 2 + COL_GAP     // 376
const Y_BOT = Y_TOP + GRP_H                            // 1483
const TAB_TOP = SC.h - (20 + 108)                      // 1542
const LEFT_W = 308, RIGHT_W = SC.w - 2 * G.side - LEFT_W - COL_GAP   // 330
ck(`组顶停在拍过的那条 ${TOP_PCT}%（人像下巴 55.6%、手到 62%，都在它之上）`, Y_TOP === 1107, `y ${Y_TOP}`)
ck(`整组 ${GRP_H}rpx 装得下，且组底离底栏顶还留 ${TAB_TOP - Y_BOT}rpx（不叠、不挤）`,
  TAB_TOP - Y_BOT >= 40, `组底 y ${Y_BOT}（屏高 ${(Y_BOT / SC.h * 100).toFixed(1)}%）`)
ck(`宽度闭合：左块 ${LEFT_W} ＋ 缝 ${COL_GAP} ＋ 右列 ${RIGHT_W} = ${LEFT_W + COL_GAP + RIGHT_W}（等于那条胶囊的 702）`,
  LEFT_W + COL_GAP + RIGHT_W === SC.w - 2 * G.side)

/* ---------- ③ 四套色（同一副骨，只换皮） ---------- */
// 每套：Tips 药丸底／字，三块各自的底、字、图标，加一句"这套与第二屏撞不撞"
const P = (o) => o
const SKINS = [
  P({ id: '现网对照', note: '这一格不是方案，是位置尺：那条胶囊＋Tips 现在长在哪、组顶在哪。',
    live: true }),
  P({ id: '甲 照参考图（蓝·紫·绿）', tip: '#20242C', tipInk: '#F2EFE9',
    photo: ['#2F5BD6', '#FFFFFF'], notes: ['#6C4BD8', '#FFFFFF'], cards: ['#17754A', '#FFFFFF'],
    num: '#FFFFFF', deco: '块内右上那枚小圆点（半透明白）',
    clash: '⚠ 与第二屏分类色同族：宝蓝 #3F52D6、紫 #6E4BD0、草绿 #46A863。同一支色在两屏指两件事。' }),
  P({ id: '乙 橙主＋墨副（守现网那支橙）', tip: '#20242C', tipInk: '#F2EFE9',
    photo: ['#E9723D', '#2C1204'], notes: ['#262A33', '#F2EFE9'], cards: ['#262A33', '#F2EFE9'],
    num: '#F2EFE9', deco: '无装饰（三块只靠色块与图标分身份，最克制的一版）',
    clash: '不打架：橙＝拍照这一层意思在现网已经是快门那枚，等于把已有语义放大，不新增色相。' }),
  P({ id: '丙 淡彩＋墨字（明度高、饱和低，最柔的一版）', tip: '#F2EFE9', tipInk: '#23252C',
    photo: ['#8FB8FF', '#1A1D24'], notes: ['#F3B8CE', '#1A1D24'], cards: ['#8FE0B8', '#1A1D24'],
    num: '#1A1D24', deco: '左块右上角一枚半透明大圆（照参考图块面里那个亮斑）',
    clash: '不打架：这三支是分类色提亮降饱和的版本，明度差一大截，但同族色相，仍要你看一眼。' }),
  P({ id: '丁 墨玻璃＋一支强调线（最不打架）', tip: '#2A323D', tipInk: '#F2EFE9',
    photo: ['#1B232B', '#F2EFE9'], notes: ['#1B232B', '#F2EFE9'], cards: ['#1B232B', '#F2EFE9'],
    num: '#F2EFE9', trim: 6, deco: '每块顶边一条 6rpx 强调线：拍照橙、笔记蓝、卡片绿',
    clash: '不打架：块面统一墨玻璃，色只出现在三条细线上，分类色不会被抢身份。' }),
]
// 参考图那三块的图标不是"线稿直接压在块色上"，是**一块实心片 + 片里那枚本块色的图形**（左块圆角方、
// 右两枚圆形）。片要能看见（片压块底 ≥3.0），片里的图形也要能看见（图形压片 ≥3.0）：
// 白片压不住浅块（丙那三支淡彩压白只有 1.9），就换成块上那支字色做片、图形用块底。
const chipOf = (s, k) => {
  const bg = s[k][0], ink = s[k][1]
  for (const chip of ['#FFFFFF', ink]) {
    if (palette.crOf(chip, bg) >= 3.0 && palette.crOf(bg, chip) >= 3.0) return { chip, glyph: bg }
    if (palette.crOf(chip, bg) >= 3.0 && palette.crOf(ink, chip) >= 3.0) return { chip, glyph: ink }
  }
  return { chip: '#FFFFFF', glyph: ink }
}
// 门槛：块里的字（含数字）压那块底 ≥4.5。参考图那三支**亮**蓝紫绿白字压不住，所以甲用的是压深版。
const gate = SKINS.filter((s) => !s.live).map((s) => ({
  s, r: ['photo', 'notes', 'cards'].map((k) => ({ k, c: palette.crOf(s[k][1], s[k][0]) })),
  ic: ['photo', 'notes', 'cards'].map((k) => {
    const { chip, glyph } = chipOf(s, k)
    return { k, chip, c: Math.min(palette.crOf(chip, s[k][0]), palette.crOf(glyph, chip)) }
  }),
}))
ck('四套的每一块"字压块底"都过正文门槛 4.5',
  gate.every((g) => g.r.every((x) => x.c >= 4.5)),
  gate.map((g) => `${g.s.id.slice(0, 1)} ${g.r.map((x) => x.c.toFixed(2)).join('/')}`).join('　'))
ck('四套的图标片"片压块底"与"图形压片"都过图形门槛 3.0',
  gate.every((g) => g.ic.every((x) => x.c >= 3.0)),
  gate.map((g) => `${g.s.id.slice(0, 1)} ${g.ic.map((x) => `${x.chip === '#FFFFFF' ? '白' : '墨'}${x.c.toFixed(1)}`).join('/')}`).join('　'))
const bright = ['#4A7BF7', '#8A6CF2', '#45C88A']
console.log(`·参考图那三支原亮度（白字压）：${bright.map((c) => palette.crOf('#FFFFFF', c).toFixed(2)).join(' / ')} —— 都够不上 4.5，所以甲是压深版`)
// 判据在产物上是**按颜色认块**的（⑤ 里沿着一列扫左块那一支色）。药丸底要是跟左块差得不够远，
// 会被算进块里：第一版丁的 #20242C 压 #1B232B 三通道只差 5/1/1，扫出来的"块高"多出药丸那 56＋缝 12
// ＝68rpx。同理丙那块左下的半透明亮斑把采样列截了 101rpx——装饰一律挪到采样列（块左边沿往里
// ~38rpx 那一竖条）之外。这两条不该靠肉眼看图找，当场钉住。
const dch = (a, b) => Math.max(...[1, 3, 5].map((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16))))
ck('四套的 Tips 药丸底与左块底色差 ≥12（差太小 ⑤ 会把药丸量成块的一部分）',
  SKINS.filter((s) => !s.live).every((s) => dch(s.tip, s.photo[0]) >= 12),
  SKINS.filter((s) => !s.live).map((s) => dch(s.tip, s.photo[0])).join(' / '))

/* ---------- ④ 画 ---------- */
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
.sw{display:flex;gap:6px;margin:0 0 8px}.sw i{flex:1;height:40px;border-radius:10px;outline:1px solid rgba(20,22,26,.16);display:flex;align-items:flex-end;justify-content:center;font-size:9.5px;font-style:normal;color:rgba(255,255,255,.75);padding-bottom:2px}
.kv{font-size:12.5px;line-height:1.8;color:#4A4741}
.kv b{color:#14161A}.kv .warn{color:#9A3412}
.page{position:absolute;inset:0;background:#EFE9DF}
.photo{position:absolute;inset:0;background-image:${bgUrl};background-size:cover;background-position:center}
.scrim{position:absolute;inset:0;background:${scrim}}
.nav{position:absolute;left:0;right:0;top:94px;height:90px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;color:#F2EFE9}
.h1t{position:absolute;left:32px;top:206px;font-size:${G.h1}px;font-weight:700;letter-spacing:-1px;color:#F2EFE9}
.grp{position:absolute;left:${G.side}px;right:${G.side}px;top:${Y_TOP}px}
.tips{height:${TIPS_H}px;border-radius:999px;display:flex;align-items:center;gap:14px;padding:0 22px;font-size:${G.meta}px;letter-spacing:.5px;margin-bottom:${G.gap}px}
.tips .dot{width:22px;height:22px;border-radius:50%;flex:none;background:#E5B93F}
.tips .tx{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.blocks{display:flex;gap:${COL_GAP}px}
.b{position:relative;border-radius:34px;overflow:hidden;display:flex;flex-direction:column;padding:20px}
.b .ic{flex:none}
.b .icw{flex:none;display:flex;align-items:center;justify-content:center;background:#FFFFFF}
.big .icw{width:128px;height:128px;border-radius:36px}
.sm .icw{width:76px;height:76px;border-radius:50%}
.b .lb{margin-top:auto;font-size:${G.title}px;font-weight:600;letter-spacing:0;line-height:1.1}
.b .n{position:absolute;right:22px;top:16px;font-family:'WtsjMind','Poppins',sans-serif;font-weight:100;font-size:76px;line-height:.86}
.b .sub{font-size:${G.micro}px;font-weight:700;letter-spacing:3px;margin-top:6px;opacity:.72}
.big{width:${LEFT_W}px;height:${LEFT_W}px}
.big .ic{width:96px;height:96px}
.big .lb{font-size:40px}
.sm{width:${RIGHT_W}px;height:${ROW_H}px;flex-direction:row;align-items:center;gap:16px;padding:0 22px}
.sm .ic{width:44px;height:44px}
.sm .lb{margin-top:0;font-size:30px;font-weight:600}
.sm .n{position:static;font-size:58px;margin-left:auto}
.sm .col2{display:flex;flex-direction:column;gap:2px}
.blip{position:absolute;right:-26px;top:-26px;width:96px;height:96px;border-radius:50%;background:rgba(255,255,255,.16)}
.blob{position:absolute;right:-30px;top:-46px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.10)}
.top{position:absolute;left:0;right:0;top:0;height:6px}
.g{display:block;background:currentColor;-webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center}
.ic-cam{-webkit-mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'><path d='M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1.3-2h5l1.3 2h1.7A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z'/><circle cx='12' cy='13' r='4'/></svg>")}
.ic-note{-webkit-mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'><path d='M6 3h9l4 4v14H6z'/><path d='M14.5 3v5h5'/><path d='M9.5 12h6M9.5 16h4'/></svg>")}
.ic-card{-webkit-mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'><rect x='2.5' y='5' width='19' height='14' rx='3'/><path d='M2.5 10h19'/><path d='M6 15h5'/></svg>")}
.bar2{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:44px;display:flex;align-items:center;justify-content:space-around;background:${CH.bg}}
.bar2 u{text-decoration:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:34px;color:${CH.idle}}
.bar2 u.sel{background:${CH.sel};color:#F2EFE9}
.oldbar{height:128px;border-radius:999px;background:#F2EFE9;color:#23252C;border:3px solid rgba(35,37,44,.10);display:flex;align-items:center;gap:22px;padding:0 20px 0 34px;box-shadow:0 18px 46px rgba(8,10,14,.42);font-size:${G.title}px;font-weight:800;letter-spacing:-1px}
.guide{position:absolute;left:0;right:0;top:${Y_TOP}px;border-top:3px dashed rgba(255,120,60,.9);z-index:20}
.guide em{position:absolute;right:8px;top:-30px;font-size:20px;font-style:normal;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.86);color:#D24A1F}
`
const blocksOf = (s) => {
  const one = (k, cls, label, num) => {
    const { chip, glyph } = chipOf(s, k)
    return `<div class="b ${cls}" style="background:${s[k][0]};color:${s[k][1]}">
    ${s.deco.indexOf('大圆') >= 0 && cls === 'big' ? '<div class="blob"></div>' : ''}
    ${s.deco.indexOf('小圆点') >= 0 ? '<div class="blip"></div>' : ''}
    ${s.deco.indexOf('强调线') >= 0 ? `<div class="top" style="background:${{ big: '#E9723D', sm1: '#5B8DEF', sm2: '#3FBF87' }[label]}"></div>` : ''}
    <span class="icw" style="background:${chip}"><span class="g ic ic-${{ big: 'cam', sm1: 'note', sm2: 'card' }[label]}" style="color:${glyph}"></span></span>
    ${num ? `<div class="n">${num}</div>` : ''}
    <div class="lb">${T(label === 'big' ? 'takePhoto' : label === 'sm1' ? 'statNotes' : 'slotCard')}</div>
    ${num ? '' : '<div class="col2"></div>'}</div>`
  }
  return `<div class="blocks">${one('photo', 'big', 'big', '')}<div style="flex:1;display:flex;flex-direction:column;gap:${COL_GAP}px">${one('notes', 'sm', 'sm1', '128')}${one('cards', 'sm', 'sm2', '46')}</div></div>`
}
const phoneOf = (s) => {
  const inner = s.live
    ? `<div class="grp" style="top:auto;bottom:284px"><div class="tips" style="background:transparent;color:rgba(242,239,233,.78);margin-bottom:0"><span class="dot"></span><span class="tx">${T('tipsPrefix')}${T('tips')[0]}</span></div><div class="oldbar" style="margin-top:14px">${T('barIdle')}</div></div>`
    : `<div class="grp"><div class="tips" style="background:${s.tip};color:${s.tipInk}"><span class="dot"></span><span class="tx">${T('tipsPrefix')}${T('tips')[0]}</span></div>${blocksOf(s)}</div>`
  return `<div class="pw"><div class="ph"><div class="page"></div><div class="photo"></div><div class="scrim"></div>
    <div class="nav">${T('appName')}</div><div class="h1t">${T('createHeading')}</div>${inner}${tabbar}
    ${s.live ? `<div class="guide"><em>66.3% 组顶线</em></div>` : ''}</div></div>`
}
const tabbar = `<div class="bar2"><u class="sel">＋</u><u>≡</u><u>◡</u></div>`
const capOf = (s) => {
  if (s.live) return `<b>现网对照</b>：那条胶囊（128 高、底边离屏底 284）与 Tips 现在长在哪。新方案整组的顶边就压在这条橙色虚线上——**66.3% 是现网面板顶、站长拍过的"不挡脸"那一线**，人像下巴在 55.6%、抬起那只手到 62%，都在这条线之上。`
  const r = ['photo', 'notes', 'cards'].map((k) => palette.crOf(s[k][1], s[k][0]).toFixed(2)).join(' / ')
  const chips = ['photo', 'notes', 'cards'].map((k) => chipOf(s, k).chip === '#FFFFFF' ? '白片' : '墨片').join('·')
  const icr = ['photo', 'notes', 'cards'].map((k) => {
    const { chip, glyph } = chipOf(s, k)
    return Math.min(palette.crOf(chip, s[k][0]), palette.crOf(glyph, chip)).toFixed(1)
  }).join(' / ')
  return `<b>${s.id}</b>：三块的字压块底 <b>${r}</b>（门槛 4.5）。图标照参考图做成实心片：${chips}，片压块底＋图形压片 <b>${icr}</b>（门槛 3.0）。装饰：${s.deco}。<br><span class="${/不打架/.test(s.clash) ? '' : 'warn'}">${s.clash}</span>`
}
const swOf = (s) => s.live ? '' : `<div class="sw">${['photo', 'notes', 'cards', 'tip'].map((k) => {
  const c = k === 'tip' ? s.tip : s[k][0]
  return `<i style="background:${c}">${c}</i>` }).join('')}</div>`
const kvOf = (s) => s.live ? '' : `<div class="kv">结构这一版四套<b>完全一样</b>：上 Tips 药丸 ${TIPS_H} ＋ 左块 ${LEFT_W}×${LEFT_W}（拍照）＋ 右列两枚 ${RIGHT_W}×${ROW_H}（笔记 128／卡片 46，数字是占位数据）。<br>整组高 <b>${GRP_H}rpx</b>，顶在 <b>${TOP_PCT}%</b>，底在 <b>${(Y_BOT / SC.h * 100).toFixed(1)}%</b>——比现网那条胶囊的底（83.0%）<b>沉 ${(Y_BOT - 1386).toFixed(0)}rpx</b>，离底栏顶还剩 <b>${TAB_TOP - Y_BOT}rpx</b>。这是"往下移、又不挡脸"能给的极限。</div>`
const CELL = (s) => `<div class="cell"><div class="left">${phoneOf(s)}<div class="cap">${capOf(s)}</div></div><div class="col">${swOf(s)}${kvOf(s)}</div></div>`
const HTML = `<!doctype html><meta charset="utf-8"><style>${css}</style>
<h1>第一屏：三块核心件（拍照／笔记／卡片）＋ 一条 Tips<span>站长 10-10「参考这张深色图的风格重画，包括 ICON 和文字；最上面改为 Tips；最下面的横条不需要；整体往下移，不挡人像」</span></h1>
<div class="lead">骨定死、只换皮：<b>左块＝拍照入口</b>（点它开录入面板停「照片」那一档）、<b>右上＝笔记数量＋入口</b>（跳笔记列表）、<b>右下＝卡片数量＋入口</b>（跳卡片列表）、<b>上面那条＝Tips</b>（现网那句原话搬进药丸）、<b>底下那条胶囊撤掉</b>。
<br>ICON 与文字照参考图的路子改：图标不再直接画在块色上，改成<b>一块实心片（左块圆角方、右两枚圆形）＋片里那枚图形</b>；块名从原来的 800 重降到 <b>600</b>、去掉负字距（参考图那三块的名字是常规重的无衬线，不是大黑体）；数字仍用现网那套 MIND 极细体，跟"提要/摘要"那两处同源。全部 SVG 画、<b>零位图</b>。
<br>片这一处不是想换就换：<b>片压块底、图形压片都得过 3.0</b>。甲／丁拿到白片（跟参考图一样）；丙那三支淡彩压白只有 1.9，片只能反过来用墨；乙的橙块同理，只有那一块是墨片。
<br>位置：整组顶边压在<b>橙虚线那条 66.3%</b>（现网面板顶、你拍过的"不挡脸"线）；组底比现网那条胶囊沉 ${(Y_BOT - 1386).toFixed(0)}rpx，离底栏顶留 ${TAB_TOP - Y_BOT}rpx。<b>再往下就没有余量了</b>——要么压到脸/手，要么贴到底栏。
<br>⚠ 一条要你先知道的冲突：第二屏那五支<b>分类色</b>已经是 宝蓝 #3F52D6／紫 #6E4BD0／草绿 #46A863／橙 #E9723D／芥末黄 #F6C445。参考图那三支亮蓝紫绿与它们同族——<b>甲</b>最像参考图，但同一支色在两个屏上会指两件不同的事；<b>乙</b>与<b>丁</b>绕开了这一条。
<br>⚠ 另一条：参考图那三支<b>原亮度</b>（#4A7BF7/#8A6CF2/#45C88A）压白字只有 ${bright.map((c) => palette.crOf('#FFFFFF', c).toFixed(2)).join(' / ')}，够不上 4.5——所以甲画的是<b>压深版</b>，不是照抄。</div>
<div class="grid">${SKINS.map((s) => CELL(s)).join('')}</div>`

const OUT_HTML = path.join(DIR, '三块四色.html')
const leaked = css.match(/[:\s]-?[\d.]+rpx/g) || []
ck('CSS 里没有漏网的 rpx（浏览器不认，整条声明静默失效）', leaked.length === 0, leaked.join(' '))
const open = (HTML.match(/<div\b/g) || []).length, close = (HTML.match(/<\/div>/g) || []).length
ck(`HTML 里 <div> 与 </div> 数量相等（${open}）`, open === close, `开 ${open} 闭 ${close} 差 ${open - close}`)
fs.writeFileSync(OUT_HTML, HTML)
const PNG = path.join(DIR, '三块四色.png')
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
   '--window-size=1700,4200', `--screenshot=${PNG}`, '--virtual-time-budget=12000', 'file://' + OUT_HTML],
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

/* ---------- ⑤ 在产物上量：五台都在、四套的三块尺寸与离底栏的距离都对 ---------- */
// 位置一律**相对底栏那条胶囊量**，不去推算手机顶边：罩层压在人像上会形成一条与底栏同色系的暗带，
// 拿"这一列最早命中底栏色的那行"当手机锚点会读到那条带上（第一版读出来 76.9%，其实是锚点错了 200 多 px）。
const audit = JSON.parse(execFileSync('python3', ['-c', `
import json
from PIL import Image
im=Image.open(${JSON.stringify(PNG)}).convert('RGB'); W,H=im.size; px=im.load()
S=${LAY.scale}; PITCH=${PITCH}; PADX=${LAY.padX}; COLS=${COLS}; SLOT=${LAY.slot}
def hx(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))
CHc=hx(${JSON.stringify(CH.bg)})
BLOCKS=[[hx(t[0]) for t in trio] for trio in ${JSON.stringify(SKINS.filter((s) => !s.live).map((s) => [s.photo, s.notes, s.cards]))}]
def near(a,b,t=8): return all(abs(a[i]-b[i])<=t for i in range(3))
out={'H':H}
cols={}
for c in range(COLS):
    x0=int(PADX+PITCH*c+40); x1=int(PADX+PITCH*c+SLOT-40)
    rows=[y for y in range(H) if sum(1 for x in range(x0,x1,4) if near(px[x,y],CHc,12))>len(range(x0,x1,4))*0.55]
    cl=[]
    for y in rows:
        if cl and y-cl[-1][-1]<=6: cl[-1].append(y)
        else: cl.append([y])
    # 真底栏那一条高 108rpx≈57 行；罩层形成的暗带比这薄得多，按段长滤掉
    cols[c]=[g[0] for g in cl if len(g)>=40]
out['col0']=cols[0]; out['col1']=cols[1]
res=[]
for i in range(len(BLOCKS)):
    c=(i+1)%COLS; r=(i+1)//COLS          # 网格里第 0 格是「现网对照」，四套从第 1 格起
    if r>=len(cols[c]): res.append(None); continue
    tab=cols[c][r]; x=int(PADX+PITCH*c+${Math.round((G.side + LEFT_W / 2) * LAY.scale)})   # 采样走左块**竖向中线**（块内 154rpx 处）：
    # 左边那枚图标片占到块内 148rpx、右边的亮斑/小圆点从 188rpx 起，中线是这两拨装饰之间唯一的空档。
    # 早先贴着左边沿采，丙那块左下的亮斑把竖条截了 101rpx，量出来"高208"——装饰骗了尺子，不是布局错。
    # 块面会被自己身上的图标/文字/装饰切开（实测那一列断成 5 段），所以取"所有 ≥4px 的段的
    # 最小起点与最大终点"当上下沿；找最长的那一段读出来是 134rpx，不是 308。
    seg=[];cur=0
    for y in range(tab-420,tab):
        if near(px[x,y],BLOCKS[i][0]): cur+=1
        else:
            if cur>=4: seg.append((y-cur,y-1))
            cur=0
    if cur>=4: seg.append((tab-1-cur,tab-1))
    if not seg: res.append(None); continue
    top=min(s for s,e in seg); bot=max(e for s,e in seg)
    res.append({'h':round((bot-top)/S,0),                          # 块高，rpx
                'gapTab':round((tab-bot)/S,0),                     # 块底离底栏顶，rpx
                'topFromTab':round((tab-top)/S,0)})                # 块顶离底栏顶，rpx
out['blocks']=res
print(json.dumps(out))`], { encoding: 'utf8' }))
const phones = audit.col0.length + audit.col1.length
ck(`五台都渲出来了（col0 ${audit.col0.length}／col1 ${audit.col1.length}，共 ${phones}）`, phones === 5, `图高 ${audit.H}`)
// ⑤ 只认"块那一支色"，所以**故意画在块顶的装饰**（丁那 6rpx 强调线）会把块色竖条削短 6rpx。
// 这一笔必须在方案里写明（`trim`），补回去再比：块的实际外沿仍是 308 见方、顶边仍在那条线上。
// 没写 trim 的方案要是也少了一截，就是真错——不许把 trim 当万金油。
const TRIM = SKINS.filter((s) => !s.live).map((s) => s.trim || 0)
const wantTop = TAB_TOP - Y_TOP - TIPS_H - G.gap
ck(`四套的左块外沿都是 ${LEFT_W}rpx 见方、块底离底栏顶都是 ${TAB_TOP - Y_BOT}rpx（±6rpx；补回各自声明的遮挡 ${TRIM.join('/')}）`,
  audit.blocks.length === 4 && audit.blocks.every((b, i) => b
    && Math.abs(b.h + TRIM[i] - LEFT_W) <= 6 && Math.abs(b.gapTab - (TAB_TOP - Y_BOT)) <= 6),
  audit.blocks.map((b, i) => b && `高${b.h}+${TRIM[i]}/离底栏${b.gapTab}`).join('　'))
ck('四套的块顶都停在同一处（外沿离底栏顶 ' + wantTop + 'rpx，即屏高 ' +
  ((Y_TOP + TIPS_H + G.gap) / SC.h * 100).toFixed(1) + '%；人像下巴 55.6%、手 62% 都在它之上）',
  audit.blocks.every((b, i) => b && Math.abs(b.topFromTab + TRIM[i] - wantTop) <= 6),
  audit.blocks.map((b, i) => b && `${b.topFromTab}+${TRIM[i]}`).join(' / '))
console.log(`\n现读进来的数：组顶 y ${Y_TOP}（${TOP_PCT}%）、整组高 ${GRP_H}、组底 ${Y_BOT}（${(Y_BOT / SC.h * 100).toFixed(1)}%）、离底栏顶 ${TAB_TOP - Y_BOT}`)
console.log('产物：' + PNG)
if (bad.length) { console.log(`✗ ${bad.length} 条不过：` + bad.join(' / ')); process.exit(1) }
console.log('✓ 全过')
