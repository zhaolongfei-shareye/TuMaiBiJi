// 站长 10-10 晚：用他给的三张 PNG 图标（卡通女孩 + 笔记铅笔 + 拍立得卡片），
// 去透明底，直接嵌入效果图。左块放女孩（超出边框），文字在右；右两枚横条换后两张 ICON。
// 跑法：node docs/design/10-10两入口多方案/画-PNG图标.mjs
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
const ck = (n, ok, d = '') => { if (!ok) bad.push(n); console.log(`${ok ? '✓' : '✗'} ${n}${d ? ` → ${d}` : ''}`) }
const cr = (a, b) => palette.crOf(a, b)

/* ---------- ① 现读：令牌、罩子、几何、字体、底图 ---------- */
const APP = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
const PB = APP.slice(APP.indexOf('page{') >= 0 ? APP.indexOf('page{') : APP.indexOf('page {'))
const tok = {}
for (const m of PB.slice(0, PB.indexOf('}')).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) tok[m[1]] = m[2].trim()
const px = (k) => { if (!tok[k]) throw new Error(`app.wxss 读不到 ${k}`); return parseInt(tok[k], 10) }
const MIND = (/src:\s*url\(data:font\/ttf;base64,([^)]+)\)/.exec(APP) || [])[1]
if (!MIND) throw new Error('app.wxss 里读不到 MIND 那支字体')
const CSS = fs.readFileSync(path.join(MP, 'pages/create/create.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const scrim = (/\.page-scrim\s*\{[^}]*background:\s*(linear-gradient\([^;]*\))/.exec(CSS) || [])[1]
if (!scrim) throw new Error('读不到 .page-scrim 那条渐变')
const SC = { w: 750, h: 1670 }
const G = { side: 24, gap: 12, meta: px('--fs-meta'), tiny: px('--fs-tiny'), micro: px('--fs-micro'), h1: px('--fs-h1') }
const BG = fs.readFileSync(path.join(MP, 'assets/home-bg-portrait.jpg')).toString('base64')
const bgUrl = `url(data:image/jpeg;base64,${BG})`
const CH = palette.chromeOf('tint-paper')

/* ---------- ② 骨 ---------- */
const TOP_PCT = 66.3, TIPS_H = 74, ROW_H = 148, COL_GAP = 12
const Y_TOP = Math.round(SC.h * TOP_PCT / 100)
const Y_BLOCKS = Y_TOP + TIPS_H + G.gap
const GRP_H = TIPS_H + G.gap + ROW_H * 2 + COL_GAP
const Y_BOT = Y_TOP + GRP_H
const TAB_TOP = SC.h - (20 + 108)
const LEFT_W = 308, RIGHT_W = SC.w - 2 * G.side - LEFT_W - COL_GAP
const RECT = {
  photo: [G.side, Y_BLOCKS, G.side + LEFT_W, Y_BLOCKS + LEFT_W],
  notes: [G.side + LEFT_W + COL_GAP, Y_BLOCKS, SC.w - G.side, Y_BLOCKS + ROW_H],
  cards: [G.side + LEFT_W + COL_GAP, Y_BLOCKS + ROW_H + COL_GAP, SC.w - G.side, Y_BOT],
}
ck(`组顶停在 ${TOP_PCT}%`, Y_TOP === 1107, `y ${Y_TOP}`)
ck(`整组 ${GRP_H}rpx，组底离底栏顶 ${TAB_TOP - Y_BOT}rpx`, TAB_TOP - Y_BOT >= 40, `组底 y ${Y_BOT}`)
ck(`左块 ${LEFT_W} 见方＝右列两枚 ${ROW_H}＋缝 ${COL_GAP}＋${ROW_H}`, LEFT_W === ROW_H * 2 + COL_GAP)

/* ---------- ③ 底图探针 ---------- */
const PROBE = path.join(DIR, '_底图探针')
fs.writeFileSync(PROBE + '.html', `<!doctype html><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}html,body{width:750px;height:1670px;overflow:hidden}
.ph{position:relative;width:750px;height:1670px;background:#EFE9DF}
.photo{position:absolute;inset:0;background-image:${bgUrl};background-size:cover;background-position:center}
.scrim{position:absolute;inset:0;background:${scrim}}</style>
<div class="ph"><div class="photo"></div><div class="scrim"></div></div>`)
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
   '--window-size=750,1670', `--screenshot=${PROBE}.png`, '--virtual-time-budget=9000', 'file://' + PROBE + '.html'],
  { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] })
const PHOTO_BG = JSON.parse(execFileSync('python3', ['-c', `
import json
from PIL import Image
im=Image.open(${JSON.stringify(PROBE + '.png')}).convert('RGB'); px=im.load()
R=${JSON.stringify(RECT)}
out={}
for k,(x0,y0,x1,y1) in R.items():
    xs=range(x0+40,x1-40,6); ys=range(y0+40,y1-40,6)
    acc=[0,0,0]; n=0
    for y in ys:
        for x in xs:
            p=px[x,y]; acc[0]+=p[0]; acc[1]+=p[1]; acc[2]+=p[2]; n+=1
    out[k]='#%02X%02X%02X'%tuple(round(c/n) for c in acc)
print(json.dumps(out))`], { encoding: 'utf8' }))
console.log(`·块底下照片实测：拍照位 ${PHOTO_BG.photo}／笔记位 ${PHOTO_BG.notes}／卡片位 ${PHOTO_BG.cards}`)

/* ---------- ④ 皮 ---------- */
const THEMES = palette.THEMES.filter((t) => t.ramp && t.ramp.steps.length === 5)
ck('四套五档色阶', THEMES.length === 4, THEMES.map((t) => t.label).join('/'))
const NB = ['photo', 'notes', 'cards']
const RING_A = 0.9
const mk = (t, opt) => {
  const st = t.ramp.steps, ik = t.ramp.inks
  const f = opt.deep ? { photo: st[0], notes: st[1], cards: st[1], tip: t.line }
    : { photo: t.line, notes: st[1], cards: st[0], tip: st[0] }
  const inks = { photo: ik[0], notes: ik[1], cards: opt.deep ? ik[1] : ik[0], tip: opt.deep ? ik[0] : ik[0] }
  return {
    id: opt.deep ? `${t.label} 有色版（乙）` : `${t.label} ${t.key}`, key: t.key, t, deep: !!opt.deep,
    photo: [f.photo, inks.photo], notes: [f.notes, inks.notes], cards: [f.cards, inks.cards], tip: [f.tip, inks.tip],
    ring: opt.deep ? palette.mix('#F2EFE9', PHOTO_BG.photo, RING_A) : null,
  }
}
const SKINS = [...THEMES.map((t) => mk(t, {})), mk(THEMES[0], { deep: true }), { id: '现网对照', live: true }]
const NBL = SKINS.filter((s) => !s.live)

/* ---------- ⑤ 门槛 ---------- */
const ground = (s, k) => PHOTO_BG[k]
const rows = NBL.map((s) => ({
  s,
  ink: NB.map((k) => ({ k, c: cr(s[k][1], s[k][0]) })),
  face: NB.map((k) => {
    const bare = cr(s[k][0], ground(s, k))
    const ringed = s.ring && k === 'photo' ? cr(s.ring, ground(s, k)) : 0
    return { k, c: Math.max(bare, ringed), by: bare >= 3.0 ? '面' : '边' }
  }),
}))
ck('五套字压块面 ≥4.5', rows.every((r) => r.ink.every((x) => x.c >= 4.5)),
  rows.map((r) => `${r.s.id.slice(0, 2)} ${r.ink.map((x) => x.c.toFixed(2)).join('/')}`).join(' '))
ck('五套块压照片 ≥3.0', rows.every((r) => r.face.every((x) => x.c >= 3.0)),
  rows.map((r) => `${r.s.id.slice(0, 2)} ${r.face.map((x) => `${x.c.toFixed(2)}${x.by}`).join('/')}`).join(' '))
const dch = (a, b) => Math.max(...[1, 3, 5].map((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16))))
ck('Tips 药丸底与左块底色差 ≥12', NBL.every((s) => dch(s.tip[0], s.photo[0]) >= 12),
  NBL.map((s) => dch(s.tip[0], s.photo[0])).join(' / '))

/* ---------- ⑥ PNG 图标内嵌（去白底版） ---------- */
const girlB64 = fs.readFileSync(path.join(DIR, '_girl_t.png')).toString('base64')
const boyB64 = fs.readFileSync(path.join(DIR, '_boy_t.png')).toString('base64')
const noteB64 = fs.readFileSync(path.join(DIR, '_note_t.png')).toString('base64')
const cardB64 = fs.readFileSync(path.join(DIR, '_card_t.png')).toString('base64')
const girlUrl = `data:image/png;base64,${girlB64}`
const boyUrl = `data:image/png;base64,${boyB64}`
const noteUrl = `data:image/png;base64,${noteB64}`
const cardUrl = `data:image/png;base64,${cardB64}`

/* ---------- ⑦ 画 ---------- */
const LAY = { padX: 30, slot: 398, colW: 380, gap: 24, scale: 0.53 }
const CELL_W = LAY.slot + 10 + LAY.colW, PITCH = CELL_W + LAY.gap, COLS = 2
const NUM = 88, NAME = 20
// 左块：女孩图占左半边，文字在右，人物明显超出方块边界
const GIRL_W = 220, GIRL_H = 360  // 更高但窄一些，右侧留文字空间
const GIRL_OX = 0, GIRL_OY = -52   // 左侧不超出，上方超出
const SM_IC = 160  // 右两枚 ICON 大小（抬高，减少上方空白）
const CAM_ORANGE = '#E9723D'  // 第二屏拍照按钮同色

const css = `
@font-face{font-family:'WtsjMind';src:url(data:font/ttf;base64,${MIND}) format('truetype');font-weight:100}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,"PingFang SC",sans-serif;background:#EFECE6;padding:34px ${LAY.padX}px 44px;color:#14161A}
h1{font-size:27px;letter-spacing:-.4px}h1 span{font-size:15px;font-weight:400;color:#7A756C;margin-left:12px}
.lead{font-size:14.5px;line-height:1.75;color:#4A4741;margin:9px 0 18px;max-width:${2 * PITCH}px}
.grid{display:flex;flex-wrap:wrap;gap:${LAY.gap}px;align-items:flex-start}
.cell{flex:none;min-width:0;width:${CELL_W}px;display:flex;gap:10px;align-items:flex-start}
.left{flex:none;width:${LAY.slot}px;min-width:0}
.pw{width:${LAY.slot}px;overflow:hidden}
.ph{width:750px;height:1670px;border-radius:60px;overflow:hidden;position:relative;outline:2px solid #B9B6AF;transform:scale(${LAY.scale});transform-origin:top left;margin-bottom:-777px}
.cap{font-size:13px;line-height:1.6;color:#5C5850;margin-top:9px;width:${LAY.slot}px}.cap b{color:#14161A}
.col{flex:none;width:${LAY.colW}px}
.sw{display:flex;gap:5px;margin:0 0 8px}.sw i{flex:1;height:40px;border-radius:9px;outline:1px solid rgba(20,22,26,.16);display:flex;align-items:flex-end;justify-content:center;font-size:9px;font-style:normal;padding-bottom:2px}
.kv{font-size:12.5px;line-height:1.75;color:#4A4741}.kv b{color:#14161A}
.page{position:absolute;inset:0;background:#EFE9DF}
.photo{position:absolute;inset:0;background-image:${bgUrl};background-size:cover;background-position:center}
.scrim{position:absolute;inset:0;background:${scrim}}
.nav{position:absolute;left:0;right:0;top:94px;height:90px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;color:#F2EFE9}
.h1t{position:absolute;left:32px;top:206px;font-size:${G.h1}px;font-weight:700;letter-spacing:-1px;color:#F2EFE9}
.grp{position:absolute;left:${G.side}px;right:${G.side}px;top:${Y_TOP}px}
.tips{position:relative;z-index:3;height:${TIPS_H}px;display:flex;align-items:flex-start;gap:12px;padding:10px 20px 0 48px;font-size:${G.tiny}px;letter-spacing:.4px;margin-bottom:${G.gap}px}
.tips .dot{width:18px;height:18px;border-radius:50%;flex:none;background:${palette.TIP_DOT}}
.tips .tx{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.blocks{position:relative;z-index:2;display:flex;gap:${COL_GAP}px}
.b{position:relative;border-radius:34px;display:flex;flex-direction:column;padding:22px}
.big{flex:none;clip-path:inset(-52px -34px -34px -34px round 34px);transition:transform .25s}
.big:hover{transform:scale(1.02)}
.big .girl{position:absolute;left:${GIRL_OX}px;top:${GIRL_OY}px;width:${GIRL_W}px;height:${GIRL_H}px;object-fit:contain;object-position:top left;z-index:5;clip-path:inset(-60px 0 100px 0);transition:transform .25s}
.big .txt{position:absolute;left:0;right:0;bottom:0;z-index:6;background:#FFFFFF;padding:14px 18px 16px 36px;border-radius:0 0 34px 34px}
.big .nm{font-size:36px;font-weight:700;letter-spacing:1px;line-height:1.3;color:#3A3A3C;display:flex;align-items:center;gap:10px}
.big .nm svg{width:32px;height:32px;flex:none}
.big .ds{font-size:14px;font-weight:500;margin-top:2px;letter-spacing:.5px;color:#8E8E93}
/* 右两枚横条：ICON 被白条遮住下半部分，hover 放大 */
.sm{width:${RIGHT_W}px;height:${ROW_H}px;flex-direction:row;align-items:center;padding:0 22px;overflow:hidden}
.sm .ic{position:absolute;left:12px;bottom:-25px;width:${SM_IC}px;height:${SM_IC}px;object-fit:contain;z-index:1;transition:transform .25s}
.sm:hover .ic{transform:scale(1.08)}
.sm .num{position:absolute;right:22px;top:50%;transform:translateY(-55%);font-family:'WtsjMind','Poppins',sans-serif;font-weight:100;font-size:${NUM}px;line-height:.84;letter-spacing:-2px;z-index:2}
.sm .strip{position:absolute;left:0;right:0;bottom:0;height:40px;background:rgba(255,255,255,.85);border-radius:0 0 34px 34px;display:flex;align-items:center;padding:0 22px;z-index:3}
.sm .nm{font-size:${NAME}px;font-weight:400;letter-spacing:2px;display:flex;align-items:center;gap:8px}
.sm .nm::before{content:'';width:8px;height:8px;border-radius:50%;background:currentColor;opacity:.45;flex:none}
.bar2{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:44px;display:flex;align-items:center;justify-content:space-around;background:${CH.bg}}
.bar2 u{text-decoration:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:34px;color:${CH.idle}}
.bar2 u.sel{background:${CH.sel};color:#F2EFE9}
.oldbar{height:128px;border-radius:999px;background:#F2EFE9;color:#23252C;border:3px solid rgba(35,37,44,.10);display:flex;align-items:center;gap:22px;padding:0 20px 0 34px;box-shadow:0 18px 46px rgba(8,10,14,.42);font-size:32px;font-weight:800;letter-spacing:-1px}
.guide{position:absolute;left:0;right:0;top:${Y_TOP}px;border-top:3px dashed rgba(255,120,60,.9);z-index:20}
.guide em{position:absolute;right:8px;top:-30px;font-size:20px;font-style:normal;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.86);color:#D24A1F}
`
const MODE = [T('modePhoto'), T('modeUrl'), T('modeWrite')].join(' · ')

const CAM_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#3A3A3C" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/></svg>`

const blocksOf = (s) => {
  const photoBlock = `<div class="b big" style="width:${LEFT_W}px;height:${LEFT_W}px;background:${s.photo[0]};color:${s.photo[1]}${s.ring ? `;box-shadow:inset 0 0 0 2px ${s.ring}` : ''}">
    <img class="girl" src="${girlUrl}" alt="">
    <div class="txt"><div class="nm">${CAM_SVG}记下来</div><div class="ds">${MODE}</div></div>
  </div>`
  const noteBlock = `<div class="b sm" style="background:${s.notes[0]};color:${s.notes[1]}">
    <img class="ic" src="${noteUrl}" alt="">
    <span class="num">128</span>
    <div class="strip"><span class="nm">${T('statNotes')}</span></div>
  </div>`
  const cardBlock = `<div class="b sm" style="background:${s.cards[0]};color:${s.cards[1]}">
    <img class="ic" src="${cardUrl}" alt="">
    <span class="num">46</span>
    <div class="strip"><span class="nm">${T('slotCard')}</span></div>
  </div>`
  return `<div class="blocks">${photoBlock}
    <div style="flex:1;display:flex;flex-direction:column;gap:${COL_GAP}px">${noteBlock}${cardBlock}</div></div>`
}
const tabbar = `<div class="bar2"><u class="sel">＋</u><u>≡</u><u>◡</u></div>`
const phoneOf = (s) => {
  const head = `<div class="page"></div><div class="photo"></div><div class="scrim"></div>
    <div class="nav">${T('appName')}</div><div class="h1t">${T('createHeading')}</div>`
  if (s.live) return `<div class="pw"><div class="ph">${head}
    <div class="grp" style="top:auto;bottom:284px"><div class="tips" style="background:transparent;color:rgba(242,239,233,.78);margin-bottom:0"><span class="dot"></span><span class="tx">${T('tipsPrefix')}${T('tips')[0]}</span></div><div class="oldbar" style="margin-top:14px">${T('barIdle')}</div></div>${tabbar}
    <div class="guide"><em>66.3% 组顶线</em></div></div></div>`
  return `<div class="pw"><div class="ph">${head}
    <div class="grp"><div class="tips" style="color:${s.tip[1]}"><span class="dot"></span><span class="tx">${T('tipsPrefix')}${T('tips')[0]}</span></div>${blocksOf(s)}</div>${tabbar}</div></div>`
}
const capOf = (s) => {
  if (s.live) return `<b>现网对照</b>：位置尺。`
  const f = NB.map((k) => {
    const bare = cr(s[k][0], PHOTO_BG[k]), ringed = s.ring && k === 'photo' ? cr(s.ring, PHOTO_BG[k]) : 0
    return `${Math.max(bare, ringed).toFixed(2)}${bare >= 3.0 ? '面' : '边'}`
  }).join(' / ')
  return `<b>${s.id}</b>：${s.deep
    ? `左块也吃第 1 档（${s.photo[0]}），补一道 <b>2rpx 纸白细边</b>（${s.ring}）托轮廓。`
    : `左块面＝卡底 ${s.photo[0]}，右两枚＝第 2／1 档。`}
  <br>块压照片 <b>${f}</b>（门槛 3.0）。<br>左块：女孩 PNG 从上方超出方块，左侧裁齐；文字「记下来」+ 模式行在右下角。右两枚：ICON 从底部露出被裁，hover 放大。`
}
const swOf = (s) => s.live ? '' : `<div class="sw">${[0, 1, 2, 3, 4].map((i) =>
  `<i style="background:${s.t.ramp.steps[i]};color:${s.t.ramp.inks[i]}">${s.t.ramp.steps[i].slice(1)}</i>`).join('')}</div>`
const kvOf = (s) => s.live ? '' : `<div class="kv">左块 ${LEFT_W}×${LEFT_W}｜右上 ${RIGHT_W}×${ROW_H}（笔记 <b>128</b>）｜右下 ${RIGHT_W}×${ROW_H}（卡片 <b>46</b>）。<br>女孩图 ${GIRL_W}×${GIRL_H}，左侧裁齐、上方出血 ${Math.abs(GIRL_OY)}rpx。<br>右两枚 ICON ${SM_IC}rpx 从底部露出、裁掉一部分；hover 放大 1.08。数字 ${NUM}rpx 极细体，名字 ${NAME}rpx 在数字下方。</div>`
const CELL = (s) => `<div class="cell"><div class="left">${phoneOf(s)}<div class="cap">${capOf(s)}</div></div><div class="col">${swOf(s)}${kvOf(s)}</div></div>`

const HTML = `<!doctype html><meta charset="utf-8"><style>${css}</style>
<h1>第一屏引导 · PNG 图标版<span>站长 10-10 晚：卡通女孩放左块（超出边框），文字在右；右两枚换笔记铅笔 + 拍立得卡片</span></h1>
<div class="lead">三张 PNG 全部去透明底直接嵌入：<b>① 左块</b>＝卡通女孩（贝雷帽拿手机），超出左边和上边，文字「记下来」+ 模式行在右下角。<b> 右上横条</b>＝笔记铅笔 ICON。<b>③ 右下横条</b>＝拍立得卡片 ICON。四套莫兰迪配色 + 乙版（有色左块+纸白边）+ 现网对照。<br><b>交互</b>：双击人物图可在女性/男性之间切换。</div>
<div class="grid">${SKINS.map((s) => CELL(s)).join('')}</div>
<script>
const GIRL=${JSON.stringify(girlUrl)},BOY=${JSON.stringify(boyUrl)};
document.querySelectorAll('img.girl').forEach(el=>{el.style.cursor='pointer';el.addEventListener('dblclick',()=>{el.src=el.src===GIRL?BOY:GIRL})});
<\/script>`

const OUT_HTML = path.join(DIR, 'PNG图标.html')
const leaked = css.match(/[:\s]-?[\d.]+rpx/g) || []
ck('CSS 无 rpx', leaked.length === 0, leaked.join(' '))
const open = (HTML.match(/<div\b/g) || []).length, close = (HTML.match(/<\/div>/g) || []).length
ck(`<div> 数量相等（${open}）`, open === close)
ck('三张 PNG 都嵌入了（每套皮 3 处，≥15）', (HTML.match(/data:image\/png;base64/g) || []).length >= 15)
fs.writeFileSync(OUT_HTML, HTML)
const PNG = path.join(DIR, 'PNG图标.png')
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
   '--window-size=1700,3200', `--screenshot=${PNG}`, '--virtual-time-budget=12000', 'file://' + OUT_HTML],
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

/* ---------- ⑧ 审计 ---------- */
const audit = JSON.parse(execFileSync('python3', ['-c', `
import json
from PIL import Image
im=Image.open(${JSON.stringify(PNG)}).convert('RGB'); W,H=im.size; px=im.load()
S=${LAY.scale}; PITCH=${PITCH}; PADX=${LAY.padX}; COLS=${COLS}; SLOT=${LAY.slot}
def hx(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))
CHc=hx(${JSON.stringify(CH.bg)})
FACES=[hx(s) for s in ${JSON.stringify(NBL.map((s) => s.photo[0]))}]
CELL=${JSON.stringify(NBL.map((s) => SKINS.indexOf(s)))}
def near(a,b,t=8): return all(abs(a[i]-b[i])<=t for i in range(3))
def near4(a,b): return all(abs(a[i]-b[i])<=2 for i in range(3))
out={'H':H}; cols={}
for c in range(COLS):
    x0=int(PADX+PITCH*c+40); x1=int(PADX+PITCH*c+SLOT-40)
    rows=[y for y in range(H) if sum(1 for x in range(x0,x1,4) if near4(px[x,y],CHc))>len(range(x0,x1,4))*0.55]
    cl=[]
    for y in rows:
        if cl and y-cl[-1][-1]<=6: cl[-1].append(y)
        else: cl.append([y])
    cols[c]=[g[0] for g in cl if len(g)>=40]
out['col0']=cols[0]; out['col1']=cols[1]
res=[]
for i in range(len(FACES)):
    c=CELL[i]%COLS; r=CELL[i]//COLS
    if r>=len(cols[c]): res.append(None); continue
    tab=cols[c][r]; blockLocalX = 290 if c == 0 else 256
    x=int(PADX+PITCH*c+${LAY.scale}*blockLocalX)
    seg=[];cur=0
    for y in range(tab-430,tab):
        if near(px[x,y],FACES[i]): cur+=1
        else:
            if cur>=4: seg.append((y-cur,y-1))
            cur=0
    if cur>=4: seg.append((tab-1-cur,tab-1))
    if not seg: res.append(None); continue
    top=min(s for s,e in seg); bot=max(e for s,e in seg)
    res.append({'h':round((bot-top)/S,0),'gapTab':round((tab-bot)/S,0),'topFromTab':round((tab-top)/S,0)})
out['blocks']=res
print(json.dumps(out))`], { encoding: 'utf8' }))
const phones = audit.col0.length + audit.col1.length
ck(`六台都渲出来了（col0 ${audit.col0.length}／col1 ${audit.col1.length}，共 ${phones}）`, phones === 6, `图高 ${audit.H}`)
console.log(`\n产物：${PNG}`)
if (bad.length) { console.log(`✗ ${bad.length} 条不过：` + bad.join(' / ')); process.exit(1) }
console.log('✓ 全过')
