// 站长 10-10 那句：「面板常驻，如果改，你改为，两个面板入口，一个记录，一个查看，
// 用两个按钮并排，显示。你生成效果图，给我确认。」
// 跑法：node docs/design/10-10两个入口并排/画-两入口.mjs
//
// 这一稿只做一件事：把收起态那**一条**纸白胶囊换成**两枚并排**的纸白按钮
// （左「记录」开录入面板、右「查看」开查看面板），面板本身一个字不改（410／490、浅面、
// 墨环都是 10-10 已落的那批）。头部那层罩子**照现网不动**（他 10-10 明确说"变白"没下过需求）。
//
// 规矩：屏上每一句中文都从 utils/i18n.js 现读；几何、颜色、罩子那条渐变全部从
// create.wxss / app.wxss / palette.js 现读，一个数都不自己填（同口径那条账见
// [[feedback-mockup-same-rulers-as-code]]）。字典里没有的键会直接抛错，不许编。
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

/* ---------- ① 现读：令牌、几何、颜色、罩子那条渐变 ---------- */
const APP = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
const PB = APP.slice(APP.indexOf('page{') >= 0 ? APP.indexOf('page{') : APP.indexOf('page {'))
const tok = {}
for (const m of PB.slice(0, PB.indexOf('}')).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) tok[m[1]] = m[2].trim()
const px = (k) => { if (!tok[k]) throw new Error(`app.wxss 读不到 ${k}`); return parseInt(tok[k], 10) }
const RAW = fs.readFileSync(path.join(MP, 'pages/create/create.wxss'), 'utf8')
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (sel) => {
  const m = new RegExp('(^|\\})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(CSS)
  if (!m) throw new Error(`create.wxss 读不到 ${sel}，出处变了`)
  const o = {}
  for (const p of m[2].split(';')) { const i = p.indexOf(':'); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim() }
  return o
}
// 只换 app.wxss 里那批尺寸令牌；`var(--cp-*)` 那批是颜色、由 createSkin 现读，留原样不动
// （`num` 只取第一个数，后面跟着什么无所谓；真取不到数会由下面的 NaN 守卫抛出去）。
const val = (v) => String(v).replace(/var\((--[a-z0-9-]+)\)/g, (m, k) => (k in tok ? tok[k] : m))
const num = (v, w) => { const x = parseFloat(val(v)); if (!Number.isFinite(x)) throw new Error(`几何 NaN：${w} = ${v}`); return x }
const box = (v) => val(v).trim().split(/\s+/).map((x) => parseFloat(x))
const PANEL = rule('.panel'), CARD = rule('.card'), MD = rule('.md'), CROW = rule('.crow')
const MINI = rule('.mini-c'), SHUT = rule('.shut'), CORE = rule('.shut-core'), BAR = rule('.bar')
const DOCK = rule('.container.entry-dock .entry-wrap'), SWAPR = rule('.home-swap'), OUT = rule('.out')
const scrim = (/\.page-scrim\s*\{[^}]*background:\s*(linear-gradient\([^;]*\))/.exec(CSS) || [])[1]
if (!scrim) throw new Error('读不到 .page-scrim 那条渐变')
ck('罩子那条渐变是从 create.wxss 现读的（不是照稿抄）', /rgba\(18, 20, 26/.test(scrim),
  `${(scrim.match(/rgba\(18, 20, 26/g) || []).length} 个暗停点`)

const SC = { w: 750, h: 1670 }
const G = {
  side: num(DOCK.left, 'dock left'), bottom: num(DOCK.bottom, 'dock bottom'),
  panelH: num(PANEL.height, 'panel'), openH: num(rule('.panel-open').height || PANEL.height, 'open'),
  padT: box(PANEL.padding)[0], padX: box(PANEL.padding)[1], padB: box(PANEL.padding).slice(-1)[0],
  radius: num(PANEL['border-radius'], 'radius'), edge: num(PANEL.border, 'panel edge'),
  cardR: num(CARD['border-radius'], 'cardR'), cardPad: num(CARD.padding, 'cardPad'),
  cardEdge: num(CARD.border, 'cardEdge'), cardMt: num(CARD['margin-top'], 'cardMt'),
  mdFs: num(MD['font-size'], 'md'),
  mdPadB: num(MD['padding-bottom'], 'mdPadB'), mdLh: parseFloat(MD['line-height']),
  gap: num(CROW.gap, 'crowGap'), mini: num(MINI.width, 'mini'), shut: num(SHUT.width, 'shut'),
  core: num(CORE.width, 'core'), barH: num(BAR.height, 'bar'), barR: num(BAR['border-radius'], 'barR'),
  barFs: px('--fs-title'), meta: px('--fs-meta'), tiny: px('--fs-tiny'), h1: px('--fs-h1'),
  outPadB: box(OUT.padding).slice(-1)[0],
}
const IVORY = palette.THEMES.find((t) => t.key === 'tint-paper')
const CH = palette.chromeOf('tint-paper')
const SK = {}
for (const m of palette.createSkin('tint-paper').matchAll(/--(cp-[a-z0-9-]+):([^;]+)/g)) SK[m[1]] = m[2]
const PAGE = IVORY.page, INK = SK['cp-ink'], FACE = SK['cp-panel'], CARD_C = SK['cp-card']
const WELL = SK['cp-field'], RING = SK['cp-ring'], CAM = SK['cp-cam'], CAM_INK = SK['cp-cam-ink']
const PAPER = '#F2EFE9', PAPER_78 = 'rgba(242,239,233,.78)', PAPER_56 = 'rgba(242,239,233,.56)'
ck('面板那套浅面与快门那两枚橙都是从 palette.createSkin 现读（象牙那一枚）',
  FACE === palette.listLayerOf('tint-paper') && CAM === '#E9723D', `${FACE} / ${CAM}`)
const BG = fs.readFileSync(path.join(MP, 'assets/home-bg-portrait.jpg')).toString('base64')

/* ---------- ② 标签行那一格的高度：与静态尺子同一套算法（行高取微信实测 1.6） ---------- */
const MD_EXTRA = 22.2                       // 现网量到 77.5 里除去字身与下内边距，剩下那截留白
const rowH = MD_EXTRA + G.mdFs * 1.6 + G.mdPadB
const cardInner = G.panelH - 2 * G.edge - G.padT - rowH - G.cardMt - 2 * G.cardEdge - 2 * G.cardPad - G.padB
ck(`现读出来的盒子闭合：面板 ${G.panelH} = 描边 ${2 * G.edge} + 上 ${G.padT} + 标签行 ${rowH.toFixed(1)} + 卡上边距 ${G.cardMt} + 卡 ${2 * G.cardEdge}+${2 * G.cardPad}+内容 + 下 ${G.padB}`,
  cardInner > 200, `内容位 ${cardInner.toFixed(1)}；照片那一叠 ${(G.shut + 8 + 28.8).toFixed(1)}`)

/* ---------- ③ 两枚并排按钮的算法（这一稿唯一的新东西） ---------- */
// 外框沿用现网那条胶囊的落点：左右到 --sp-3 内缩、底边与胶囊同一条线（这样"换成两枚"
// 不改这一组在屏内的位置，也就不动条底 618 那笔账）。两枚等宽，中间一条缝取胶囊自己
// 那 22 的 gap（同一屏里"两枚东西并排"只有这一个现成的间距值，不另造一档）。
const PAIR_GAP = num(BAR.gap, 'bar gap')
const BAR_EDGE = num(BAR.border, 'bar border')
const BTN_W = (SC.w - 2 * G.side - PAIR_GAP) / 2
// 判据比的是**内白那一段**：描边那 3rpx 不是纸白，加上抗锯齿，产物上量到的会比外框少十几 rpx。
const WHITE_INNER = (outer) => outer - 2 * BAR_EDGE - 6
ck(`两枚按钮等宽且铺满原来那条胶囊的宽度：(${SC.w} − 2×${G.side} − ${PAIR_GAP}) ÷ 2 = ${BTN_W}`,
  BTN_W > 300 && BTN_W < 400, `高仍 ${G.barH}（与胶囊同一档），圆角 ${G.barR}`)
// 「查看」那一枚开的面板：与录入面板同一档高、同一块面，肚子里换成最近笔记那几行。
// 为什么同高：两枚按钮开出来的窗口如果一大一小，切一次窗口屏上跳一次（现网 10-08 就是
// 因为"四个模式的面板自然高度不一样"改成贴底定高的）。
const VIEW_ROWS = 2
const rowH5 = 96, rowGap = 14
const cardInnerH = G.panelH - (2 * G.edge + G.padT + rowH + G.cardMt + 2 * G.cardEdge + 2 * G.cardPad + G.padB)
const viewNeed = VIEW_ROWS * rowH5 + (VIEW_ROWS - 1) * rowGap
ck(`查看那一档与录入那一档同一高（${G.panelH}），卡内 ${cardInnerH.toFixed(1)} 装得下 ${VIEW_ROWS} 行（${viewNeed}），第三行起在卡里上下滑`,
  viewNeed <= cardInnerH, `余 ${(cardInnerH - viewNeed).toFixed(1)}；三行要 ${3 * rowH5 + 2 * rowGap}＝放不下，所以是滑不是加高`)

/* ---------- ④ 画 ---------- */
// 画面布局的三个数是死的，但**必须一处写、两处用**：CSS 拿它们排版，⑤ 拿它们算每一台的
// 取样窗口。上一版窗口里写死 398 的间距、漏了 .row 那 22 的 gap，于是第三、四台的取样列
// 扫到别人家身上——判据"四台都在画面里"就是被这个假红/假绿绕出来的。
const LAY = { padX: 30, slot: 398, gap: 22, scale: 0.53 }
const mix = (f, a, b) => {
  const H = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const F = H(f), B = H(b)
  return '#' + F.map((v, i) => Math.round(v * a + B[i] * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase()
}

const css = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,"PingFang SC",sans-serif;background:#EFECE6;padding:34px ${LAY.padX}px 44px;color:#14161A}
h1{font-size:27px;letter-spacing:-.4px}h1 span{font-size:15px;font-weight:400;color:#7A756C;margin-left:12px}
.lead{font-size:14.5px;line-height:1.75;color:#4A4741;margin:9px 0 20px;max-width:1700px}
.row{display:flex;gap:${LAY.gap}px;align-items:flex-start;margin-bottom:8px}
.slot{flex:none;min-width:0;overflow:hidden}
.slot{width:${LAY.slot}px}.ph{width:750px;height:1670px;border-radius:60px;overflow:hidden;position:relative;outline:2px solid #B9B6AF;transform:scale(${LAY.scale});transform-origin:top left;margin-bottom:-777px}
.cap{font-size:13px;line-height:1.65;color:#5C5850;margin-top:9px}
.page{position:absolute;inset:0;background:${PAGE}}
.photo{position:absolute;left:0;right:0;top:0;height:100%;background-size:cover;background-position:center}
.scrim{position:absolute;left:0;right:0;top:0;height:100%;background:${scrim}}
.status{position:absolute;left:0;right:0;top:0;height:94px;display:flex;align-items:center;justify-content:space-between;padding:0 44px;font-size:29px;font-weight:600;color:${PAPER}}
.nav{position:absolute;left:0;right:0;top:94px;height:90px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;color:${PAPER}}
.capsule{position:absolute;right:24px;top:22px;width:174px;height:46px;border-radius:999px;display:flex;align-items:center;justify-content:space-around;font-size:24px;background:rgba(0,0,0,.18);color:#fff;border:1px solid rgba(255,255,255,.32)}
.h1t{position:absolute;left:32px;top:206px;font-size:${G.h1}px;font-weight:700;letter-spacing:-1px;color:${PAPER}}
.lang{position:absolute;right:32px;top:212px;font-size:${G.meta}px;color:${PAPER_56}}
.lang b{color:${PAPER}}
.toolrow{position:absolute;left:22px;top:${SC.h - 1670 + 300}px;display:flex;align-items:center;gap:26px;font-size:${G.meta}px;font-weight:700;letter-spacing:1px;color:${PAPER_78}}
.toolrow{top:272px}
.toolrow i{font-style:normal;display:inline-flex;align-items:center;gap:10px}
.dotdim{width:24px;height:24px;border-radius:50%;border:2px solid rgba(8,9,12,.28);background:${mix('#23252C', .55, PAPER)}}
.dock{position:absolute;left:${G.side}px;right:${G.side}px;bottom:${G.bottom}px;display:flex;flex-direction:column}
/* 收起那一态不贴底：现网条底是站长拍过的 618 那一档＝底栏顶再往上 132rpx，
   所以这一组的底边离屏底 ${SC.h - (SC.h - G.bottom - 128 - 132) - G.barH}px，不是面板那 152。 */
.dock.up{bottom:${SC.h - (SC.h - G.bottom - 128 - 132) - G.barH}px}
.out{flex:none;display:flex;justify-content:space-between;padding:0 20px ${G.outPadB}px;font-size:${G.meta}px;line-height:1.4;letter-spacing:1px;color:${PAPER_56}}
.tips{flex:none;font-size:${G.meta}px;color:${PAPER_78};padding:0 0 10px 48px}
.tips u{text-decoration:none;color:${mix('#F6C445', .9, '#000')}}
.bars{display:flex;gap:${PAIR_GAP}px}
.bar{flex:1;height:${G.barH}px;border-radius:${G.barR}px;background:${PAPER};color:${INK};border:3px solid rgba(35,37,44,.10);display:flex;align-items:center;gap:22px;padding:0 20px 0 34px;box-shadow:0 18px 46px rgba(8,10,14,.42)}
.bar .lb{font-size:${G.barFs}px;font-weight:800;letter-spacing:-1px;line-height:1.1;white-space:nowrap}
.bar .gl{flex:none;width:52px;height:52px;background:${INK};-webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center}
.panel{border-radius:${G.radius}px;display:flex;flex-direction:column;background:${FACE};border:${G.edge}px solid ${SK['cp-edge-10']};box-shadow:0 16px 34px rgba(8,10,14,.10);padding:${G.padT}px ${G.padX}px ${G.padB}px}
.modes{display:flex;justify-content:center;gap:60px;flex:none;align-items:center;height:${rowH.toFixed(1)}px}
.md{font-size:${G.mdFs}px;letter-spacing:1px;position:relative;white-space:nowrap;color:${mix(INK, .5, FACE)}}
.md.on{color:${INK};font-weight:600}
.md.on::after{content:"";position:absolute;left:50%;transform:translateX(-50%);bottom:0;width:65px;height:5px;border-radius:3px;background:${INK}}
.card{flex:1;min-height:0;display:flex;flex-direction:column;border-radius:${G.cardR}px;background:${CARD_C};border:${G.cardEdge}px solid ${SK['cp-edge-12']};margin-top:${G.cardMt}px;padding:${G.cardPad}px;box-shadow:0 4px 14px rgba(8,10,14,.05)}
.crow{margin-top:auto;margin-bottom:auto;display:flex;justify-content:center;align-items:center;gap:${G.gap}px}
.mini{width:130px;flex:none;display:flex;flex-direction:column;align-items:center;gap:10px}
.mini-c{width:${G.mini}px;height:${G.mini}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${WELL}}
.mini-lb{font-size:${G.tiny}px;font-weight:700;letter-spacing:1px;color:${mix(INK, .62, CARD_C)}}
.shutcol{flex:none;display:flex;flex-direction:column;align-items:center;gap:8px}
.shut{width:${G.shut}px;height:${G.shut}px;border-radius:50%;border:10px solid ${RING};display:flex;align-items:center;justify-content:center}
.core{width:${G.core}px;height:${G.core}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${CAM}}
.lb-photo{font-size:${G.meta}px;font-weight:700;letter-spacing:1px;color:${mix(INK, .78, CARD_C)}}
.vrow{flex:none;display:flex;align-items:center;gap:18px;height:${rowH5}px;border-bottom:2px solid ${mix(INK, .08, CARD_C)}}
.vrow:last-child{border-bottom:0}
.vrow.cut{height:26px;overflow:hidden;opacity:.45}
.vt{flex:1;min-width:0;font-size:29px;font-weight:700;color:${INK};white-space:nowrap;overflow:hidden}
.vm{font-size:${G.tiny}px;color:${mix(INK, .5, CARD_C)}}
.vthumb{flex:none;width:72px;height:72px;border-radius:16px;background:${WELL}}
.g{display:block;background:currentColor;-webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center}
.cam{width:60px;height:60px;color:${CAM_INK};-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><path d='M4 8h3l2-2h6l2 2h3v11H4z'/><circle cx='12' cy='13' r='3.4'/></svg>")}
.imgs{width:40px;height:40px;color:${mix(INK, .62, WELL)};-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><rect x='3' y='6' width='15' height='13' rx='2'/><path d='M7 3h14v14'/><path d='M6 16l4-4 4 4'/></svg>")}
.lnk{width:40px;height:40px;color:${mix(INK, .62, WELL)};-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><path d='M10 14a4 4 0 0 1 0-5.6l2-2a4 4 0 1 1 5.6 5.6l-1 1'/><path d='M14 10a4 4 0 0 1 0 5.6l-2 2A4 4 0 1 1 6.4 12l1-1'/></svg>")}
.pen{color:${INK};-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M12 20h9'/><path d='M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'/></svg>")}
.eye{color:${INK};-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z'/><circle cx='12' cy='12' r='3'/></svg>")}
.bar2{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:44px;display:flex;align-items:center;justify-content:space-around;z-index:9;background:${CH.bg}}
.bar2 u{text-decoration:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:34px;color:${CH.idle}}
.bar2 u.sel{background:${CH.sel};color:${PAPER}}
.mark{position:absolute;left:0;right:0;border-top:5px dashed #E4462B;z-index:12}
.mark em{position:absolute;right:10px;top:-34px;font-size:22px;font-style:normal;padding:2px 9px;border-radius:8px;background:rgba(255,255,255,.9);color:#E4462B}
table{border-collapse:collapse;font-size:13.5px;background:#fff;box-shadow:0 1px 0 #D8D4CC}
th,td{border-bottom:1px solid #EAE6DF;padding:7px 12px;text-align:left;white-space:nowrap}
th{background:#F6F3EE;font-weight:600;color:#4A4741}
`
const head = `<div class="photo" style="background-image:url(data:image/jpeg;base64,${BG})"></div>
  <div class="scrim"></div>${'<div class="status">9:41<b style="font-weight:400">▮▮▮  ▰</b></div>'}
  <div class="nav">${T('appName')}<div class="capsule">•••　◎</div></div>
  <div class="h1t">${T('createHeading')}</div><div class="lang"><b>中</b>　EN</div>
  <div class="toolrow"><i><span class="dotdim"></span>${T('bgDimLabel')}</i><i>${T('homeBgSwap')} ›</i></div>`
const tabbar = `<div class="bar2"><u class="sel">＋</u><u>≡</u><u>◡</u></div>`
const photoPanel = `<div class="panel" style="height:${G.panelH}px">
    <div class="modes"><div class="md on">${T('modePhoto')}</div><div class="md">${T('modeUrl')}</div><div class="md">${T('modeWrite')}</div></div>
    <div class="card"><div class="crow">
      <div class="mini"><div class="mini-c"><span class="g imgs"></span></div><div class="mini-lb">${T('fromAlbum')}</div></div>
      <div class="shutcol"><div class="shut"><div class="core"><span class="g cam"></span></div></div><div class="lb-photo">${T('takePhoto')}</div></div>
      <div class="mini"><div class="mini-c"><span class="g lnk"></span></div><div class="mini-lb">${T('modeUrl')}</div></div>
    </div></div></div>`
const viewPanel = `<div class="panel" style="height:${G.panelH}px">
    <div class="modes"><div class="md on">${T('tabNotes')}</div><div class="md">${T('modeUrl')}</div><div class="md">${T('modeWrite')}</div></div>
    <div class="card">${[0, 1].map((i) => `<div class="vrow"><div class="vthumb"></div><div class="vt">${['示例笔记一', '示例笔记二'][i]}</div><div class="vm">10-0${9 - i}</div></div>`).join('')}
      <div class="vrow cut"><div class="vthumb"></div><div class="vt">示例笔记三</div><div class="vm">10-07</div></div></div></div>`
const pair = `<div class="bars">
    <div class="bar"><span class="g pen gl"></span><span class="lb">记录</span></div>
    <div class="bar"><span class="g eye gl"></span><span class="lb">查看</span></div></div>`
const oneBar = `<div class="bars"><div class="bar"><span class="g pen gl"></span><span class="lb">${T('barIdle')}</span></div></div>`
const tips = `<div class="tips"><u>●</u> ${T('tipsPrefix')}${Array.isArray(T('tips')) ? T('tips')[0] : ''}</div>`
const body = (kind) => `<div class="dock${kind === 'panel' || kind === 'view' ? '' : ' up'}">${kind === 'panel' || kind === 'view'
  // 这一支原来少写一个 `</div>`：`.dock` 没关，第三台被吞进第二台肚子里，于是第四台
  // 掉到第二台下面——PIL 量出来是"第四台不存在"，看着像窗口裁的，其实是我漏的括号。
  ? `<div class="out"><span>${T('chooseMode')}</span><span>${T('barCollapse')}</span></div>${kind === 'panel' ? photoPanel : viewPanel}</div>`
  : `${tips}${kind === 'one' ? oneBar : pair}</div>`}`
const phone = (kind, cap, mark) => `<div class="slot"><div class="ph"><div class="page"></div>${head}${body(kind)}${tabbar}
  ${mark ? `<div class="mark" style="top:${mark}px"><em>${typeof mark === 'number' ? '' : ''}面板顶 ${((mark / SC.h) * 100).toFixed(1)}%</em></div>` : ''}
  </div><div class="cap">${cap}</div></div>`
const HTML = `<!doctype html><meta charset="utf-8"><style>${css}</style>
<h1>第一屏：把那条胶囊换成两枚并排的入口按钮<span>站长 10-10 那句「两个面板入口，一个记录，一个查看，用两个按钮并排」</span></h1>
<div class="lead">四台从左到右：<b>现网对照</b>（一条胶囊）→ <b>甲 两枚并排</b>（默认态，这一屏还没有"面板常驻"）→ <b>点「记录」</b>（就是 10-10 已落的那张 410 录入面板，一个字没改）→ <b>点「查看」</b>（同一档高、同一块面，肚子里换成最近笔记）。
<br>两枚按钮的<b>外框与那条胶囊同一条线</b>：左右仍内缩 ${G.side}、底边仍离底栏顶 ${G.bottom - 128}、高仍 ${G.barH}、圆角仍 ${G.barR}、面仍是那支纸白 ${PAPER}＋墨字；中间那条缝取胶囊自己已有的 gap ${PAIR_GAP}，不另造一档。<b>所以这一改不动录入条的落点，也不动「调亮度｜换背景」那一行</b>。
<br>⚠ 两处要你眼睛判：<b>①「记录」「查看」这两个词字典里没有</b>（现网只有「动动手指」/「选择记录模式」/「笔记」），要新增就是中英各两键，英文我先按 Record / Browse 摆着，你定；<b>②「查看」开出来的是什么</b>——我画的是"最近笔记两行、第三行只露一条边（往上滑着看）"，如果你指的是笔记列表那个 tab，那这一枚就不该开面板、直接跳 tab，说一声我改。
<br>⚠ 头部那层罩子<b>照现网一字没改</b>（压暗那七档），昨天我照 c5 翻成白罩那条已撤回。</div>
<div class="row">
${phone('one', '<b>现网对照</b>：一条纸白胶囊，点它进「照片」那一档；右边没有第二枚。')}${phone('pair', `<b>甲 两枚并排（默认态）</b>：等宽各 ${(BTN_W.toFixed(0))}rpx、同一高 ${G.barH}、同一条底边。这一态不常驻面板——面板还是点出来才在。`)}${phone('panel', `<b>点「记录」</b>＝现在真机上跑的那张面板（410rpx、层灰框 ${FACE}、白卡、快门 ${G.shut}、墨环），这一稿一个字没动。`, SC.h - G.bottom - G.panelH)}${phone('view', `<b>点「查看」</b>：同一档高 ${G.panelH}、同一块面，肚子里换成最近笔记——卡内 ${cardInnerH.toFixed(0)}rpx 正好两行（每行 ${rowH5}），第三行只露一条边、往上滑着看（放不下不换结构、不加高）。行里的字是占位数据，不是界面文案。`)}
</div>
<table><tr><th>这一处</th><th>前景</th><th>背景</th><th>实测</th></tr>
${[['纸白按钮压暗罩上的照片（字）', INK, PAPER], ['墨字压纸白按钮', INK, PAPER],
   ['层灰面板压 page 底', FACE, PAGE], ['白卡压层灰面板', CARD_C, FACE],
   ['井那一档压白卡（控件）', WELL, CARD_C], ['墨环压白卡（快门那一圈）', RING, CARD_C]]
  .map(([l, f, b]) => `<tr><td>${l}</td><td>${f}</td><td>${b}</td><td>${palette.crOf(f, b).toFixed(2)}</td></tr>`).join('')}
</table>`
const OUT_HTML = path.join(DIR, '两入口并排-甲.html')
// 落盘前先数括号：少一个 `</div>` 不会报错，只会让下一台被吞进上一台肚子里，
// 然后在产物上量成"第四台不见了"——那看起来像窗口高度不够，其实是结构塌了。
const open = (HTML.match(/<div\b/g) || []).length, close = (HTML.match(/<\/div>/g) || []).length
ck(`HTML 里 <div> 与 </div> 数量相等（${open}）`, open === close, `开 ${open} 闭 ${close}，差 ${open - close}`)
fs.writeFileSync(OUT_HTML, HTML)
const PNG = path.join(DIR, '两入口并排-甲.png')
// 四台一行：宽是死的（4×398+3×22=1658＋左右内边距 60），高度靠渲完再量。
// 两台一行那版栽过：第二行第二台被窗口高度裁掉，而"窗口够不够"是我算出来猜的。
// 现在给足高度渲完，用像素找出内容的真实下边缘（页面底色 #EFECE6 是均匀的吗？不是——
// 底下那批空白才是，所以判"整行都是底色"才算空白）再裁，不靠算。
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
   '--window-size=1780,2400', `--screenshot=${PNG}`, '--virtual-time-budget=9000', 'file://' + OUT_HTML],
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
print('内容下边缘', last, '裁后高', min(H,last+34))`], { encoding: 'utf8' })

/* ---------- ⑤ 在产物上量，不靠稿子自述 ---------- */
const audit = JSON.parse(execFileSync('python3', ['-c', `
import json
from PIL import Image
im=Image.open(${JSON.stringify(PNG)}).convert('RGB'); W,H=im.size; px=im.load()
S=${LAY.scale}; PITCH=${LAY.slot + LAY.gap}; X0=${LAY.padX}
PAPER=(242,239,233)
def hx(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))
CHc=hx(${JSON.stringify(CH.bg)})
def near(a,b,tol): return all(abs(a[i]-b[i])<=tol for i in range(3))
# 每一台先按"底栏那一枚深色胶囊"定位（全图唯一一支颜色），再往上找按钮那一行。
# 不这么做的上一版栽了：窗口写死 range(1609,1795)，而整张图只有 1200 高，量出来是空的。
out={'H':H}
for k in range(4):          # 四台都要量到＝四台都在画面内、没有被裁
    x0=int(X0+PITCH*k+10); x1=int(min(W-2,X0+PITCH*k+10+750*S)-4)
    rows=[y for y in range(H) if sum(1 for x in range(x0,x1,4) if near(px[x,y],CHc,12))>len(range(x0,x1,4))*0.6]
    if not rows: out['phone%d'%k]={'segs':[]}; continue
    tab=min(rows)
    # 按钮那一行的中心在底栏顶往上 220rpx（条中心 1322、底栏顶 1542，两个数都从 CSS 现读的
    # 落点算出来）。取"单段最长"那一行为准——按 sum 会被行里的字与图形切碎的那几段带偏。
    # 在按钮那一整段高度里按列取"这一列有没有纸白"（OR 掉行与图形），再数连续列。
    # 单行取最长段会被"记录/查看"那两个字与图形切碎——上一版就是这么假红的。
    y0=tab-int(260*S); y1=tab-int(180*S)
    cols=[any(near(px[x,y],PAPER,8) for y in range(y0,y1)) for x in range(x0,x1)]
    run=0; segs=[]
    for c in cols:
        if c: run+=1
        elif run: segs.append(run); run=0
    if run: segs.append(run)
    out['phone%d'%k]={'tab':tab,'yc':(y0+y1)//2,'segs':sorted(segs,reverse=True)[:4]}
print(json.dumps(out))`], { encoding: 'utf8' }))
const segOf = (k) => (audit['phone' + k] || {}).segs || []
const rpx = (v) => (v / LAY.scale).toFixed(0)
const tabs = [0, 1, 2, 3].map((k) => audit['phone' + k]?.tab)
ck('四台都在画面里、且排在同一行（每台都量到了底栏那条胶囊，四台顶边同高）',
  tabs.every((t) => !!t) && Math.max(...tabs) - Math.min(...tabs) <= 3,
  tabs.join(' / ') + ` / 图高 ${audit.H}`)
ck(`现网那台那一行只有**一段**纸白（内白 ${rpx(segOf(0)[0] || 0)}rpx，算的是 ${WHITE_INNER(SC.w - 2 * G.side)}）`,
  segOf(0).length === 1 || segOf(0)[1] < 40,
  JSON.stringify(segOf(0)).concat(` / 外框 ${SC.w - 2 * G.side}、描边 ${BAR_EDGE}`))
ck(`甲那台是**两段等宽**（内白 ${rpx(segOf(1)[0] || 0)} / ${rpx(segOf(1)[1] || 0)}rpx，算的是 ${WHITE_INNER(BTN_W).toFixed(0)}），第三段只是那条缝的抗锯齿`,
  Math.abs(segOf(1)[0] / 0.53 - WHITE_INNER(BTN_W)) < 18
  && Math.abs(segOf(1)[1] / 0.53 - WHITE_INNER(BTN_W)) < 18 && (segOf(1)[2] || 0) < 40, JSON.stringify(segOf(1)))
ck('两台的按钮那一行在同一高度（换成两枚没把这一组挪位）',
  !!(audit.phone0 || {}).yc && !!(audit.phone1 || {}).yc && Math.abs(audit.phone0.yc - audit.phone1.yc) <= 3,
  `${(audit.phone0 || {}).yc} / ${(audit.phone1 || {}).yc}`)
console.log('\n产物：' + PNG)
if (bad.length) { console.log(`✗ ${bad.length} 条不过：` + bad.join(' / ')); process.exit(1) }
console.log('✓ 全过')
