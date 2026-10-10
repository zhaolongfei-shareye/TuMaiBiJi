// 站长 10-10 下午第四句（附一张多色平涂小人参考图）：
// 「第一个方形卡片文字，改为通用一点，不限于拍照，否则以为只能拍照记录。这里只是把创建笔记的入口做个引导，
//   然后各种 ICON，你要放大一点，斜一点压住左边，有一部分被遮罩压住，看不到全部，提升视觉的趣味性。
//   拍照的 ICON，可以用拟人形象，例如一个卡通人拿手机拍照的形象，单色，但很可爱。」
// 「类似这种，可以再可爱一点，只是参考，不能照搬，要符合我们文艺范的风格。」
//
// 四条各自怎么落的：
// ① 左块那行字改成**不限方式**：正本用现网 slogan 里那三个字「随手记」的动词部分——「记下来」，
//    下面那行小字直接抄现网三个模式标签拼出来（照片 · 链接 · 文字），一句新文案都不写。
//    另给四个候选排在稿底（记下来／记一条／新建笔记／随手记——最后那枚撞一个知名记账 App 的名字，写在稿上）。
// ② 三枚图标全部**放大、斜 8°、压住左边**：左块那枚 250rpx（块本身才 308），出血到块外、被块自己的
//    左边与顶边裁掉一角 ⇒ "看不全部"。要它再被 Tips 药丸压住，得把小人提到块外另立一层，那是另一种结构，稿上先不做。
// ③ 拟人形象：一个举手机拍照的小人。**上一条他要"单色"，这一条给的参考是多色平涂**，我按新的这条走，
//    并且为了贴"文艺范"改成**线描＋平涂**（绘本那种一根细线勾形＋莫兰迪平涂），单色剪影那版留作备选。
//    颜色全部现读 palette.THEMES 那四套莫兰迪五档色阶，零自创色值。
// ④ 数字仍是主角：88rpx 极细体（MIND）；名字降到 20rpx、字重 400、字距 2。
//
// 一条量出来的硬事实（决定这一稿能不能有大色块）：罩层压过之后三块坐的那片照片是中灰
// （③ 里 1:1 渲一张只铺底图＋罩层的页，在三个块的位置各采一片均色），五档色阶里连最浅那一档
// 坐在左块那一处都只有 2.7~2.9（图形边界门槛 3.0）。所以：
//   甲（四台）＝左块面退到这套的**卡底**那一支近白，右两枚用第 2／1 档；
//   乙（一台）＝左块也吃第 1 档（四套差别更大、更有色相），代价是补一道纸白细边把轮廓托住。
// 跑法：node docs/design/10-10两入口多方案/画-莫兰迪四套.mjs
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

/* ---------- ② 骨（他 10-10 钉的那三块，一处没动） ---------- */
const TOP_PCT = 66.3, TIPS_H = 56, ROW_H = 148, COL_GAP = 12
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
ck(`组顶停在拍过的那条 ${TOP_PCT}%（人像下巴 55.6%、手到 62% 都在它之上）`, Y_TOP === 1107, `y ${Y_TOP}`)
ck(`整组 ${GRP_H}rpx，组底离底栏顶留 ${TAB_TOP - Y_BOT}rpx`, TAB_TOP - Y_BOT >= 40, `组底 y ${Y_BOT}（${(Y_BOT / SC.h * 100).toFixed(1)}%）`)
ck(`左块 ${LEFT_W} 见方＝右列两枚 ${ROW_H}＋缝 ${COL_GAP}＋${ROW_H}（上下沿齐平）`, LEFT_W === ROW_H * 2 + COL_GAP)

/* ---------- ③ 先量"块底下那张照片"：1:1 渲一张只铺底图＋罩层的页，三处各采一片均色 ---------- */
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
    xs=range(x0+40,x1-40,6); ys=range(y0+40,y1-40,6)   # 圆角 34rpx，往里收 40 再采
    acc=[0,0,0]; n=0
    for y in ys:
        for x in xs:
            p=px[x,y]; acc[0]+=p[0]; acc[1]+=p[1]; acc[2]+=p[2]; n+=1
    out[k]='#%02X%02X%02X'%tuple(round(c/n) for c in acc)
print(json.dumps(out))`], { encoding: 'utf8' }))
console.log(`·块底下那张照片（罩层之后）实测：拍照位 ${PHOTO_BG.photo}／笔记位 ${PHOTO_BG.notes}／卡片位 ${PHOTO_BG.cards}`)

/* ---------- ④ 皮：全部现读 palette.THEMES ---------- */
const THEMES = palette.THEMES.filter((t) => t.ramp && t.ramp.steps.length === 5)
ck('palette.THEMES 里能捞出四套五档色阶（捞不到整稿作废，不许我手敲色值）', THEMES.length === 4,
  THEMES.map((t) => t.label).join('/'))
const NB = ['photo', 'notes', 'cards']
const RING_A = 0.9   // 乙那一台补的那道纸白描边（.6 混出来比块面还暗，量过；.9 才把轮廓托住）
const mk = (t, opt) => {
  const st = t.ramp.steps, ik = t.ramp.inks
  const f = opt.deep ? { photo: st[0], notes: st[1], cards: st[1], tip: t.line }
    : { photo: t.line, notes: st[1], cards: st[0], tip: st[0] }
  const inks = { photo: ik[0], notes: ik[1], cards: opt.deep ? ik[1] : ik[0], tip: opt.deep ? ik[0] : ik[0] }
  return {
    id: opt.deep ? `${t.label} 有色版（乙）` : `${t.label} ${t.key}`, key: t.key, t, deep: !!opt.deep,
    photo: [f.photo, inks.photo], notes: [f.notes, inks.notes], cards: [f.cards, inks.cards], tip: [f.tip, inks.tip],
    ring: opt.deep ? palette.mix('#F2EFE9', PHOTO_BG.photo, RING_A) : null,
    // 小人的四支色：描线＝最深那档，皮肤＝第 1 档，头发＝最深，上衣＝第 4 档，手机＝第 2 档
    art: { line: st[4], skin: st[0], hair: st[4], top: st[3], phone: st[1], paper: t.line, blush: palette.PAPERS[3].bg },
  }
}
const SKINS = [...THEMES.map((t) => mk(t, {})), mk(THEMES[0], { deep: true }), { id: '现网对照', live: true }]
const NBL = SKINS.filter((s) => !s.live)
const SHALLOW = THEMES.map((t) => cr(t.ramp.steps[0], PHOTO_BG.photo).toFixed(2)).join('/')
console.log(`·五档里最浅那档坐在左块那一处只有 ${SHALLOW}（门槛 3.0）——乙那一台就是拿一道细边去补这一笔`)

/* ---------- ⑤ 门槛 ---------- */
const ground = (s, k) => PHOTO_BG[k]
const rows = NBL.map((s) => ({
  s,
  ink: NB.map((k) => ({ k, c: cr(s[k][1], s[k][0]) })),
  art: NB.map((k) => ({ k, c: cr(s.art.line, s[k][0]) })),
  face: NB.map((k) => {
    const bare = cr(s[k][0], ground(s, k))
    const ringed = s.ring && k === 'photo' ? cr(s.ring, ground(s, k)) : 0
    return { k, c: Math.max(bare, ringed), by: bare >= 3.0 ? '面' : '边' }
  }),
}))
ck('五套的"字／数字压块面"都过正文门槛 4.5（这一档是 ramp.inks 配好的，不是我挑的）',
  rows.every((r) => r.ink.every((x) => x.c >= 4.5)),
  rows.map((r) => `${r.s.id.slice(0, 2)} ${r.ink.map((x) => x.c.toFixed(2)).join('/')}`).join('　'))
ck('五套的小人／图标**描线压块面**都过图形门槛 3.0（平涂那几支本来就与面同族，靠这根线立形）',
  rows.every((r) => r.art.every((x) => x.c >= 3.0)),
  rows.map((r) => `${r.s.id.slice(0, 2)} ${r.art.map((x) => x.c.toFixed(2)).join('/')}`).join('　'))
ck('五套的三块压"照片"都过图形边界 3.0（乙那一台由那道纸白细边承载，检查名里标了是面还是边）',
  rows.every((r) => r.face.every((x) => x.c >= 3.0)),
  rows.map((r) => `${r.s.id.slice(0, 2)} ${r.face.map((x) => `${x.c.toFixed(2)}${x.by}`).join('/')}`).join('　'))
const dch = (a, b) => Math.max(...[1, 3, 5].map((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16))))
ck('五套的 Tips 药丸底与左块底色差 ≥12（差太小，⑧ 在产物上量块高会把药丸算进块里）',
  NBL.every((s) => dch(s.tip[0], s.photo[0]) >= 12), NBL.map((s) => dch(s.tip[0], s.photo[0])).join(' / '))
ck('稿上没有一处我手敲的色值：小人身上六支色、三块的面与字，全部出自这套主题的 ramp／卡底／PAPERS',
  NBL.every((s) => {
    const t = s.t, st = t.ramp.steps
    const okFace = NB.concat('tip').every((k) => {
      const i = st.indexOf(s[k][0]); if (i >= 0) return t.ramp.inks[i] === s[k][1]
      return s[k][0] === t.line && t.ramp.inks[0] === s[k][1]
    })
    const art = [s.art.line, s.art.skin, s.art.hair, s.art.top, s.art.phone, s.art.paper]
    return okFace && art.every((c) => st.includes(c) || c === t.line) && s.art.blush === palette.PAPERS[3].bg
  }), NBL.map((s) => `${s.art.line}/${s.art.top}/${s.art.phone}`).join(' '))

/* ---------- ⑥ 图：线描＋平涂，全部放大、斜 8°、压住左边 ---------- */
const hero = (a) => `<svg viewBox='0 0 132 132' xmlns='http://www.w3.org/2000/svg'>
 <path d='M62 6a14 14 0 1 1 .1 0z' fill='${a.hair}' stroke='${a.line}' stroke-width='2.6'/>
 <path d='M36 132v-24c0-15 12-24 26-24s26 9 26 24v24z' fill='${a.top}' stroke='${a.line}' stroke-width='2.6' stroke-linejoin='round'/>
 <path d='M57 82l7 11 7-11' fill='none' stroke='${a.line}' stroke-width='2.6' stroke-linecap='round'/>
 <g transform='rotate(12 104 55)'><path d='M92 30h24a8 8 0 0 1 8 8v34a8 8 0 0 1-8 8H92a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8z' fill='${a.phone}' stroke='${a.line}' stroke-width='2.6'/>
 <circle cx='104' cy='44' r='6' fill='${a.paper}' stroke='${a.line}' stroke-width='2.6'/></g>
 <path d='M96 88c-8-2-12-8-10-16 8-4 16-2 20 4z' fill='${a.skin}' stroke='${a.line}' stroke-width='2.6'/>
 <circle cx='62' cy='50' r='31' fill='${a.skin}' stroke='${a.line}' stroke-width='2.6'/>
 <path d='M31 48c2-19 17-30 31-26 11 3 20 13 24 24-9-7-17-10-26-10-10 0-21 4-29 12z' fill='${a.hair}' stroke='${a.line}' stroke-width='2.6' stroke-linejoin='round'/>
 <path d='M46 55q6-8 12 0M70 55q6-8 12 0' fill='none' stroke='${a.line}' stroke-width='3.2' stroke-linecap='round'/>
 <path d='M55 68q8 8 17 1' fill='none' stroke='${a.line}' stroke-width='3' stroke-linecap='round'/>
 <ellipse cx='41' cy='64' rx='5' ry='3.2' fill='${a.blush}' opacity='.85'/>
 <ellipse cx='83' cy='64' rx='5' ry='3.2' fill='${a.blush}' opacity='.85'/></svg>`
const note = (a) => `<svg viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'>
 <path d='M26 12h48l22 22v74a8 8 0 0 1-8 8H26a8 8 0 0 1-8-8V20a8 8 0 0 1 8-8z' fill='${a.paper}' stroke='${a.line}' stroke-width='3'/>
 <path d='M74 12v22h22z' fill='${a.phone}' stroke='${a.line}' stroke-width='3' stroke-linejoin='round'/>
 <path d='M34 52h46M34 68h46M34 84h28' fill='none' stroke='${a.line}' stroke-width='4' stroke-linecap='round' opacity='.5'/>
 <path d='M64 12h12l-14 26 14 26-12 0-14-26z' fill='${a.top}' stroke='${a.line}' stroke-width='2.4'/></svg>`
const card = (a) => `<svg viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'>
 <rect x='10' y='28' width='100' height='66' rx='12' fill='${a.paper}' stroke='${a.line}' stroke-width='3'/>
 <rect x='10' y='42' width='100' height='14' fill='${a.top}' stroke='${a.line}' stroke-width='3'/>
 <rect x='24' y='68' width='26' height='14' rx='4' fill='${a.phone}' stroke='${a.line}' stroke-width='2.6'/>
 <path d='M62 75h32' fill='none' stroke='${a.line}' stroke-width='4' stroke-linecap='round' opacity='.5'/></svg>`
const ART = { photo: hero, notes: note, cards: card }

/* ---------- ⑦ 画 ---------- */
const LAY = { padX: 30, slot: 398, colW: 380, gap: 24, scale: 0.53 }
const CELL_W = LAY.slot + 10 + LAY.colW, PITCH = CELL_W + LAY.gap, COLS = 2
const NUM = 88, NAME = 20, HERO = 250, SM_IC = 150
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
.tips{position:relative;z-index:3;height:${TIPS_H}px;border-radius:999px;display:flex;align-items:center;gap:12px;padding:0 20px;font-size:${G.tiny}px;letter-spacing:.4px;margin-bottom:${G.gap}px}
.tips .dot{width:18px;height:18px;border-radius:50%;flex:none;background:${palette.TIP_DOT}}
.tips .tx{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.blocks{position:relative;z-index:2;display:flex;gap:${COL_GAP}px}
.b{position:relative;border-radius:34px;overflow:hidden;display:flex;flex-direction:column;padding:22px}
.b svg{position:absolute;left:-30px;top:-18px;width:${HERO}px;height:${HERO}px;transform:rotate(-8deg);display:block}
.big{width:${LEFT_W}px;height:${LEFT_W}px}
.big .nm{margin-top:auto;position:relative;z-index:2;font-size:34px;font-weight:500;letter-spacing:1px}
.big .ds{position:relative;z-index:2;margin-top:6px;font-size:${NAME + 2}px;font-weight:400;letter-spacing:1px;opacity:.66}
.sm{width:${RIGHT_W}px;height:${ROW_H}px;flex-direction:row;align-items:center;padding:0 22px}
.sm svg{left:-34px;top:${(ROW_H - 128) / 2}px;width:${SM_IC}px;height:${SM_IC}px;transform:rotate(-7deg)}
.sm .num{margin-left:auto;position:relative;z-index:2;font-family:'WtsjMind','Poppins',sans-serif;font-weight:100;font-size:${NUM}px;line-height:.84;letter-spacing:-2px}
.sm .nm{position:relative;z-index:2;font-size:${NAME}px;font-weight:400;letter-spacing:2px;opacity:.62;margin-left:10px}
.bar2{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:44px;display:flex;align-items:center;justify-content:space-around;background:${CH.bg}}
.bar2 u{text-decoration:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:34px;color:${CH.idle}}
.bar2 u.sel{background:${CH.sel};color:#F2EFE9}
.oldbar{height:128px;border-radius:999px;background:#F2EFE9;color:#23252C;border:3px solid rgba(35,37,44,.10);display:flex;align-items:center;gap:22px;padding:0 20px 0 34px;box-shadow:0 18px 46px rgba(8,10,14,.42);font-size:32px;font-weight:800;letter-spacing:-1px}
.guide{position:absolute;left:0;right:0;top:${Y_TOP}px;border-top:3px dashed rgba(255,120,60,.9);z-index:20}
.guide em{position:absolute;right:8px;top:-30px;font-size:20px;font-style:normal;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.86);color:#D24A1F}
.strip{margin-top:30px;display:flex;gap:18px;align-items:flex-start}
.strip h3{font-size:16px;margin-bottom:2px}
.opt{width:${Math.round(LEFT_W * LAY.scale)}px}
.opt .box{position:relative;border-radius:22px;overflow:hidden;display:flex;flex-direction:column;padding:14px;height:${Math.round(LEFT_W * LAY.scale * 0.66)}px}
.opt .box svg{left:-12px;top:-16px;width:118px;height:118px}
.opt .box .nm{margin-top:auto;position:relative;z-index:2;font-size:16px;font-weight:500}
.opt .box .ds{position:relative;z-index:2;font-size:10.5px;opacity:.66;margin-top:2px}
.opt p{font-size:12px;line-height:1.55;color:#4A4741;margin-top:6px}
`
const MODE = [T('modePhoto'), T('modeUrl'), T('modeWrite')].join(' · ')
const COPY = {
  pick: ['记下来', MODE],
  opts: [
    ['记下来', MODE, '现网 slogan 就是「看到好内容，随手记下来」，块上这三个字与它同一句，不限方式。', '推荐'],
    ['记一条', MODE, '带量词，像"记一条笔记"。比"记下来"多一点"条"的意思，也多一点后台味。', '备选'],
    ['新建笔记', MODE, '最直白，谁都看得懂；但它像表单按钮，不像引导页的话。', '最白'],
    ['随手记', '拍照 · 链接 · 文字，都算', '两个字最好听，但它<b>是一个知名记账 App 的名字</b>，撞品牌。', '⚠ 撞名'],
  ],
}
const blocksOf = (s) => {
  const one = (k, cls, w, h, nm, num) => `<div class="b ${cls}" style="background:${s[k][0]};color:${s[k][1]}${s.ring && k === 'photo' ? `;box-shadow:inset 0 0 0 2px ${s.ring}` : ''}">
    ${ART[k](s.art)}${num ? `<span class="num">${num}</span><span class="nm">${nm}</span>`
    : `<div class="nm">${COPY.pick[0]}</div><div class="ds">${COPY.pick[1]}</div>`}</div>`
  return `<div class="blocks">${one('photo', 'big', LEFT_W, LEFT_W, '', '')}
    <div style="flex:1;display:flex;flex-direction:column;gap:${COL_GAP}px">
      ${one('notes', 'sm', RIGHT_W, ROW_H, T('statNotes'), '128')}${one('cards', 'sm', RIGHT_W, ROW_H, T('slotCard'), '46')}</div></div>`
}
const tabbar = `<div class="bar2"><u class="sel">＋</u><u>≡</u><u>◡</u></div>`
const phoneOf = (s) => {
  const head = `<div class="page"></div><div class="photo"></div><div class="scrim"></div>
    <div class="nav">${T('appName')}</div><div class="h1t">${T('createHeading')}</div>`
  if (s.live) return `<div class="pw"><div class="ph">${head}
    <div class="grp" style="top:auto;bottom:284px"><div class="tips" style="background:transparent;color:rgba(242,239,233,.78);margin-bottom:0"><span class="dot"></span><span class="tx">${T('tipsPrefix')}${T('tips')[0]}</span></div><div class="oldbar" style="margin-top:14px">${T('barIdle')}</div></div>${tabbar}
    <div class="guide"><em>66.3% 组顶线</em></div></div></div>`
  return `<div class="pw"><div class="ph">${head}
    <div class="grp"><div class="tips" style="background:${s.tip[0]};color:${s.tip[1]}"><span class="dot"></span><span class="tx">${T('tipsPrefix')}${T('tips')[0]}</span></div>${blocksOf(s)}</div>${tabbar}</div></div>`
}
const capOf = (s) => {
  if (s.live) return `<b>现网对照</b>：位置尺。那条胶囊与 Tips 现在长在哪；新方案整组的顶边压在橙虚线那条 <b>66.3%</b>（现网面板顶、他拍过的"不挡脸"线）。`
  const f = NB.map((k) => {
    const bare = cr(s[k][0], PHOTO_BG[k]), ringed = s.ring && k === 'photo' ? cr(s.ring, PHOTO_BG[k]) : 0
    return `${Math.max(bare, ringed).toFixed(2)}${bare >= 3.0 ? '面' : '边'}`
  }).join(' / ')
  const ic = NB.map((k) => cr(s.art.line, s[k][0]).toFixed(2)).join(' / ')
  return `<b>${s.id}</b>：${s.deep
    ? `左块也吃第 1 档（${s.photo[0]}），四套的色相差别就出来了；代价是它压照片只有 ${cr(s.photo[0], PHOTO_BG.photo).toFixed(2)}，所以补一道 <b>2rpx 纸白细边</b>（rgba(242,239,233,${RING_A}）＝${s.ring}）由边来承载轮廓。`
    : `左块面＝这套的卡底 ${s.photo[0]}（照片最亮那一处也沉得住的只有它），右两枚＝第 2／1 档。`}
  <br>块压照片 <b>${f}</b>（门槛 3.0）；小人描线压块面 <b>${ic}</b>（门槛 3.0，平涂那几支与面同族、故意低对比，形靠这根线立）。
  <br>小人身上六支色全部现读：描线／头发 ${s.art.hair}、皮肤 ${s.art.skin}、上衣 ${s.art.top}、手机 ${s.art.phone}、腮红＝PAPERS 那支藕荷 ${s.art.blush}。`
}
const swOf = (s) => s.live ? '' : `<div class="sw">${[0, 1, 2, 3, 4].map((i) =>
  `<i style="background:${s.t.ramp.steps[i]};color:${s.t.ramp.inks[i]}">${s.t.ramp.steps[i].slice(1)}</i>`).join('')}</div>`
const kvOf = (s) => s.live ? '' : `<div class="kv">左块 ${LEFT_W}×${LEFT_W}（创建笔记的引导）｜右上 ${RIGHT_W}×${ROW_H}（笔记 <b>128</b>）｜右下 ${RIGHT_W}×${ROW_H}（卡片 <b>46</b>，数字是占位）。<br>小人 ${HERO}rpx、斜 8°、往左出血 30rpx、往上出血 18rpx，<b>被块自己的边裁掉一角</b>（看不全部）。右两枚那两件 ${SM_IC}rpx 同画法。<br>数字 ${NUM}rpx 极细体当主角，名字 ${NAME}rpx／字重 400／字距 2。</div>`
const CELL = (s) => `<div class="cell"><div class="left">${phoneOf(s)}<div class="cap">${capOf(s)}</div></div><div class="col">${swOf(s)}${kvOf(s)}</div></div>`
const stripOf = () => `<div class="strip"><div style="width:160px;flex:none"><h3>左块那行字（不限方式）</h3>
  <p style="font-size:12px;line-height:1.6;color:#4A4741">他的原话：改为通用一点，不限于拍照，否则以为只能拍照记录。下面那行小字全部拿现网三个模式标签拼，一句新文案都不写。</p></div>
  ${COPY.opts.map((o, i) => `<div class="opt"><div class="box" style="background:${SKINS[0].photo[0]};color:${SKINS[0].photo[1]}">
      ${hero(SKINS[0].art)}<div class="nm">${o[0]}</div><div class="ds">${o[1]}</div></div>
      <p><b>${'甲乙丙丁'[i]}</b>（${o[3]}）：${o[2]}</p></div>`).join('')}</div>`

const HTML = `<!doctype html><meta charset="utf-8"><style>${css}</style>
<h1>第一屏引导 · 线描小人＋四套莫兰迪（跟壁纸走）<span>站长 10-10「第一个方块那行字改通用，别限定拍照；ICON 放大、斜一点压住左边、被遮罩压住一角看不全；拍照那枚用拟人卡通；要符合我们文艺范」</span></h1>
<div class="lead">四条各自怎么落的：<b>① 那行字</b>改成不限方式——正本用<b>「记下来」</b>（现网 slogan 就是「看到好内容，随手记下来」，同一句里的词），下面那行小字直接拿现网三个模式标签拼：<b>${MODE}</b>，一句新文案都不写；另三个候选排在稿底（其中「随手记」撞一个知名记账 App 的名字，写在稿上了）。
<br><b>② 图标</b>全部放大到 ${HERO}rpx／${SM_IC}rpx、斜 8°、压住左边出血，<b>看不全部</b>由块自己的边做到：小人往左出血 30rpx、往上出血 18rpx，被块的圆角矩形裁掉那一角。
<br><b>③ 拟人</b>：一个举手机拍照的小人。<b>上一条他要"单色"，这一条给的参考是多色平涂</b>——我按新的这条走，并为了贴"文艺范"改成<b>线描＋平涂</b>（绘本那种一根细线勾形＋莫兰迪平涂），单色剪影那版留作备选。身上六支色全部现读 <b>palette.THEMES</b>／<b>PAPERS</b>，零自创色值（⑤ 有一条钉这个，乱配就红）。
<br><b>④ 数字</b> ${NUM}rpx 极细体当主角，名字 ${NAME}rpx、字重 400、字距 2。
<br>⚠ <b>量出来的一条硬事实</b>：罩层压过之后三块坐的那片照片是 ${Object.values(PHOTO_BG).join('／')} 这种中灰，五档色阶里连最浅那一档坐在左块那一处都只有 ${SHALLOW}（图形边界门槛 3.0）。所以前四台（甲）左块面退到这套的<b>卡底</b>那一支近白；第五台（乙）让左块也吃第 1 档、四套的色相差别更大，代价是补一道 2rpx 纸白细边把轮廓托住。<b>这两条的差别就在"要不要那道边"，你挑。</b></div>
<div class="grid">${SKINS.map((s) => CELL(s)).join('')}</div>${stripOf()}`

const OUT_HTML = path.join(DIR, '莫兰迪四套.html')
const leaked = css.match(/[:\s]-?[\d.]+rpx/g) || []
ck('CSS 里没有漏网的 rpx（浏览器不认，整条声明静默失效）', leaked.length === 0, leaked.join(' '))
const open = (HTML.match(/<div\b/g) || []).length, close = (HTML.match(/<\/div>/g) || []).length
ck(`HTML 里 <div> 与 </div> 数量相等（${open}）`, open === close, `开 ${open} 闭 ${close} 差 ${open - close}`)
ck('三件图各自都是闭合的 <svg>（少一个就会把后面那台手机整个吞掉）',
  (HTML.match(/<svg /g) || []).length === (HTML.match(/<\/svg>/g) || []).length && (HTML.match(/<svg /g) || []).length === NBL.length * 3 + COPY.opts.length,
  `开 ${(HTML.match(/<svg /g) || []).length} 闭 ${(HTML.match(/<\/svg>/g) || []).length}，应为 ${NBL.length * 3 + COPY.opts.length}`)
fs.writeFileSync(OUT_HTML, HTML)
const PNG = path.join(DIR, '莫兰迪四套.png')
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

/* ---------- ⑧ 在产物上量：六台都在、五套的左块外沿与离底栏距离 ---------- */
// 采样列走左块内 256rpx 那一竖条：小人那枚 250 宽、左边距 -30，最右只到块内 220，256 那一条是干净的面。
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
out={'H':H}; cols={}
for c in range(COLS):
    x0=int(PADX+PITCH*c+40); x1=int(PADX+PITCH*c+SLOT-40)
    rows=[y for y in range(H) if sum(1 for x in range(x0,x1,4) if near(px[x,y],CHc,12))>len(range(x0,x1,4))*0.55]
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
    tab=cols[c][r]; x=int(PADX+PITCH*c+${Math.round((G.side + 256) * LAY.scale)})
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
ck(`五套的左块都是 ${LEFT_W}rpx 见方、块底离底栏顶都是 ${TAB_TOP - Y_BOT}rpx（±6rpx）`,
  audit.blocks.length === NBL.length && audit.blocks.every((b) => b
    && Math.abs(b.h - LEFT_W) <= 6 && Math.abs(b.gapTab - (TAB_TOP - Y_BOT)) <= 6),
  audit.blocks.map((b) => b && `高${b.h}/离底栏${b.gapTab}`).join('　'))
const wantTop = TAB_TOP - Y_BLOCKS
ck(`五套的块顶都停在同一处（离底栏顶 ${wantTop}rpx＝屏高 ${(Y_BLOCKS / SC.h * 100).toFixed(1)}%，人像下巴 55.6%、手 62% 都在它之上）`,
  audit.blocks.every((b) => b && Math.abs(b.topFromTab - wantTop) <= 6),
  audit.blocks.map((b) => b && b.topFromTab).join(' / '))
console.log(`\n现读进来的数：组顶 y ${Y_TOP}（${TOP_PCT}%）、整组高 ${GRP_H}、组底 ${Y_BOT}（${(Y_BOT / SC.h * 100).toFixed(1)}%）、离底栏顶 ${TAB_TOP - Y_BOT}`)
console.log('产物：' + PNG)
if (bad.length) { console.log(`✗ ${bad.length} 条不过：` + bad.join(' / ')); process.exit(1) }
console.log('✓ 全过')
