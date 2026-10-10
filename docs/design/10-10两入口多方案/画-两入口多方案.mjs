// 站长 10-10 那句：「两入口的设计不好看，请参考国外优秀的 UI 设计，生成多个方案，给我选择。」
// 跑法：node docs/design/10-10两入口多方案/画-两入口多方案.mjs
//
// 四个方案，全部只动**第一屏那两枚入口**，其余一律照现网（10-10 已落的那批）：
// 背景形象图满铺、头部那层压暗罩一字不改、面板 410／490、贴底 152、内缩 24、浅面那三层、
// 底栏三枚、条底 618 那一档。参考图是从 App Store 现抓的真截图（参考/原图/、参考/裁/），
// 不是凭印象画的"别人家"。取证的口径：只引我看过的那几张，画面上没出现的细节不写。
//
// 规矩照旧：屏上每一句中文都从 utils/i18n.js 现读，几何／颜色／罩子那条渐变全部从
// create.wxss / app.wxss / palette.js 现读（[[feedback-mockup-same-rulers-as-code]]）。
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

/* ---------- ① 现读：令牌、几何、颜色、罩子 ---------- */
const APP = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
const PB = APP.slice(APP.indexOf('page{') >= 0 ? APP.indexOf('page{') : APP.indexOf('page {'))
const tok = {}
for (const m of PB.slice(0, PB.indexOf('}')).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) tok[m[1]] = m[2].trim()
const px = (k) => { if (!tok[k]) throw new Error(`app.wxss 读不到 ${k}`); return parseInt(tok[k], 10) }
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
const box = (v) => val(v).trim().split(/\s+/).map((x) => parseFloat(x))
const PANEL = rule('.panel'), BAR = rule('.bar'), DOCK = rule('.container.entry-dock .entry-wrap')
const scrim = (/\.page-scrim\s*\{[^}]*background:\s*(linear-gradient\([^;]*\))/.exec(CSS) || [])[1]
if (!scrim) throw new Error('读不到 .page-scrim 那条渐变')
ck('罩子那条渐变是从 create.wxss 现读的（七个暗停点＝压暗那一版，没跟着翻白）',
  /rgba\(18, 20, 26/.test(scrim), `${(scrim.match(/rgba\(18, 20, 26/g) || []).length} 个暗停点`)

const SC = { w: 750, h: 1670 }
const G = {
  side: num(DOCK.left, 'dock left'), bottom: num(DOCK.bottom, 'dock bottom'),
  panelH: num(PANEL.height, 'panel'), barH: num(BAR.height, 'bar'), barR: num(BAR['border-radius'], 'barR'),
  edge: num(PANEL.border, 'panel edge'), barEdge: num(BAR.border, 'bar border'),
  gap: num(BAR.gap || '22rpx', 'bar gap'), shut: num(rule('.shut').width, 'shut'),
  h1: px('--fs-h1'), meta: px('--fs-meta'), tiny: px('--fs-tiny'), title: px('--fs-title'),
}
// 条底那一档是站长拍过的 618：底栏顶（离底 20＋高 108）再往上 132。四个方案都守这一条线。
const TAB_TOP = 20 + 108
const BAR_BOTTOM = G.bottom + TAB_TOP + 132 - G.barH
const IVORY = palette.THEMES.find((t) => t.key === 'tint-paper')
const CH = palette.chromeOf('tint-paper')
const SK = {}
for (const m of palette.createSkin('tint-paper').matchAll(/--(cp-[a-z0-9-]+):([^;]+)/g)) SK[m[1]] = m[2]
const PAGE = IVORY.page, FACE = SK['cp-panel'], CAM = SK['cp-cam'], CAM_INK = SK['cp-cam-ink']
const PAPER = '#F2EFE9', INK = SK['cp-ink'], PAPER_78 = 'rgba(242,239,233,.78)', PAPER_56 = 'rgba(242,239,233,.56)'
const BG = fs.readFileSync(path.join(MP, 'assets/home-bg-portrait.jpg')).toString('base64')
const bgUrl = `url(data:image/jpeg;base64,${BG})`
ck('浅面与快门那两枚橙从 palette.createSkin 现读；条底那一档算出来是 ' + (SC.h - BAR_BOTTOM - G.barH),
  FACE === palette.listLayerOf('tint-paper') && CAM === '#E9723D', `${FACE} / ${CAM}`)

/* ---------- ② 画面布局的数：一处写，两处用（CSS 排版 & ④ 在产物上取样） ---------- */
const LAY = { padX: 30, slot: 398, refW: 175, gap: 24, scale: 0.53 }
const CELL_W = LAY.slot + 10 + LAY.refW
const PITCH = CELL_W + LAY.gap
const COLS = 2

/* ---------- ③ 画 ---------- */
const css = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,"PingFang SC",sans-serif;background:#EFECE6;padding:34px ${LAY.padX}px 44px;color:#14161A}
h1{font-size:27px;letter-spacing:-.4px}h1 span{font-size:15px;font-weight:400;color:#7A756C;margin-left:12px}
.lead{font-size:14.5px;line-height:1.75;color:#4A4741;margin:9px 0 20px;max-width:${COLS * PITCH}px}
.grid{display:flex;flex-wrap:wrap;gap:${LAY.gap}px;align-items:flex-start}
.cell{flex:none;min-width:0;width:${CELL_W}px;display:flex;gap:10px;align-items:flex-start}
.left{flex:none;width:${LAY.slot}px;min-width:0}
.pw{width:${LAY.slot}px;overflow:hidden}.ph{width:750px;height:1670px;border-radius:60px;overflow:hidden;position:relative;outline:2px solid #B9B6AF;transform:scale(${LAY.scale});transform-origin:top left;margin-bottom:-777px}
.cap{font-size:13px;line-height:1.6;color:#5C5850;margin-top:9px;width:${LAY.slot}px}
.cap b{color:#14161A}
.refcol{flex:none;width:${LAY.refW}px}
.refcol img{width:${LAY.refW}px;display:block;border-radius:10px;outline:2px solid #C9C5BD}
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
.tips{flex:none;font-size:${G.meta}px;color:${PAPER_78};padding:0 0 10px 48px}
.tips u{text-decoration:none;color:#E5B93F}
.bar{height:${G.barH}px;border-radius:${G.barR}px;background:${PAPER};color:${INK};border:${G.barEdge}px solid rgba(35,37,44,.10);display:flex;align-items:center;gap:22px;padding:0 20px 0 34px;box-shadow:0 18px 46px rgba(8,10,14,.42)}
.bar .lb{font-size:${G.title}px;font-weight:800;letter-spacing:-1px;line-height:1.1;white-space:nowrap}
.g{display:block;background:currentColor;-webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;mask-size:contain;mask-repeat:no-repeat;mask-position:center}
.gl{flex:none;width:52px;height:52px}
.pen{-webkit-mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M12 20h9'/><path d='M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'/></svg>")}
.listg{-webkit-mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round'><path d='M4 6h16M4 12h16M4 18h16'/></svg>")}
.camg{width:60px;height:60px;color:${CAM_INK};-webkit-mask-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8'><path d='M4 8h3l2-2h6l2 2h3v11H4z'/><circle cx='12' cy='13' r='3.4'/></svg>")}
/* 甲：缩略片左下、快门右下（Halide 那一排的两个角，中间空出来给那张脸） */
.camrow{display:flex;justify-content:space-between;align-items:flex-end;height:${G.shut}px}
.chip{width:132px;height:132px;border-radius:28px;border:3px solid rgba(242,239,233,.92);background-image:${bgUrl};background-size:cover;background-position:center 18%;box-shadow:0 14px 34px rgba(8,10,14,.42)}
.shut2{width:${G.shut}px;height:${G.shut}px;border-radius:50%;border:7px solid ${PAPER};display:flex;align-items:center;justify-content:center;box-shadow:0 16px 40px rgba(8,10,14,.46)}
.core2{width:138px;height:138px;border-radius:50%;background:${CAM};display:flex;align-items:center;justify-content:center}
/* 乙：最近那篇露一条边（Day One 那张抽屉、Readwise 那面卡片墙），点边＝查看 */
.peek{height:64px;border-radius:26px 26px 0 0;background:${PAPER};opacity:.96;display:flex;align-items:flex-start;gap:18px;padding:14px 20px 0;margin-bottom:14px;overflow:hidden}
.pk-t{font-size:29px;font-weight:700;color:${INK};white-space:nowrap;overflow:hidden;flex:1;min-width:0}
.pk-n{font-size:${G.tiny}px;color:rgba(35,37,44,.5)}
.pk-th{width:44px;height:44px;border-radius:12px;background-image:${bgUrl};background-size:cover;background-position:center 18%;flex:none}
/* 丁：一实一虚、一长一短（Things 3 那枚主行动 + Cubox 那个 Home） */
.pair2{display:flex;gap:${G.gap}px}
.pri{flex:0 0 460px}
.sec{flex:1;background:transparent;border:${G.barEdge}px solid rgba(242,239,233,.62);color:${PAPER};justify-content:center;box-shadow:none}
.bar2{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:44px;display:flex;align-items:center;justify-content:space-around;background:${CH.bg}}
.bar2 u{text-decoration:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:34px;color:${CH.idle}}
.bar2 u.sel{background:${CH.sel};color:${PAPER}}
.bar2 u.hot{background:${PAPER};color:${INK}}
.pin{position:absolute;width:46px;height:46px;border-radius:50%;background:#E4462B;color:#fff;font-size:26px;font-weight:700;display:flex;align-items:center;justify-content:center;z-index:14}
.note{background:#fff;border-radius:14px;padding:18px 20px;font-size:13.5px;line-height:1.85;color:#3A3733;width:${CELL_W}px;box-shadow:0 1px 0 #D8D4CC}
.note h3{font-size:14.5px;margin-bottom:8px}
`
const head = `<div class="photo"></div><div class="scrim"></div>
  <div class="status">9:41<b style="font-weight:400">▮▮▮  ▰</b></div>
  <div class="nav">${T('appName')}<div class="capsule">•••　◎</div></div>
  <div class="h1t">${T('createHeading')}</div><div class="lang"><b>中</b>　EN</div>
  <div class="toolrow"><i><span class="dotdim"></span>${T('bgDimLabel')}</i><i>${T('homeBgSwap')} ›</i></div>`
const tabbar = (hot) => `<div class="bar2">${hot ? '<u class="hot">＋</u>' : '<u class="sel">＋</u>'}<u>≡</u><u>◡</u></div>`
const tips = `<div class="tips"><u>●</u> ${T('tipsPrefix')}${Array.isArray(T('tips')) ? T('tips')[0] : ''}</div>`
const ENTRIES = {
  one: `<div class="bar"><span class="g pen gl"></span><span class="lb">${T('barIdle')}</span></div>`,
  甲: `<div class="camrow"><div class="chip"></div><div class="shut2"><div class="core2"><span class="g camg"></span></div></div></div>`,
  乙: `<div class="peek"><div class="pk-th"></div><div class="pk-t">示例笔记一<span class="pk-n">　10-09</span></div></div>
       <div class="bar"><span class="g pen gl"></span><span class="lb">${T('barIdle')}</span></div>`,
  丙: '',
  丁: `<div class="pair2"><div class="bar pri"><span class="g pen gl"></span><span class="lb">记录</span></div>
        <div class="bar sec"><span class="g listg gl"></span><span class="lb" style="font-weight:600;letter-spacing:0">查看</span></div></div>`,
}
const phone = (kind, extra) => `<div class="pw"><div class="ph"><div class="page"></div>${head}
  ${kind === '丙' ? '' : `<div class="dock up">${tips}${ENTRIES[kind]}</div>`}${tabbar(kind === '丙')}${extra || ''}</div></div>`
const refs = (list) => `<div class="refcol">${list.map(([f, t]) =>
  `<img src="参考/裁/${f}.jpg"><i>${t}</i>`).join('')}</div>`
const CELL = (kind, cap, rf) => `<div class="cell"><div class="left">${phone(kind)}<div class="cap">${cap}</div></div>${rf || ''}</div>`

const HTML = `<!doctype html><meta charset="utf-8"><style>${css}</style>
<h1>第一屏那两枚入口：四个方案<span>站长 10-10「两入口的设计不好看，参考国外优秀的 UI 设计，生成多个方案」</span></h1>
<div class="lead">四个方案<b>只动第一屏这一组入口</b>，其余照现网一字不动：形象图满铺、头部那层压暗罩（七个暗停点）、面板 410／490、浅面那三层、底栏三枚、条底 618 那一档。
<br>每一台右边那两张小图是<b>从 App Store 现抓的真截图</b>（裁到入口那一段），不是我凭印象画的"别人家"。
<br>共同点：<b>两枚入口不再等宽等重</b>——上一版栽就栽在两个一模一样的白胶囊并排，读起来像两个 tab，不像"一个动作＋一个去处"。</div>
<div class="grid">
${CELL('one', '<b>现网对照</b>：一条纸白胶囊（「动动手指」），点它进「照片」那一档。右边没有第二枚——上一稿加的"记录／查看"两枚等宽胶囊你打回了。')}
${CELL('甲', '<b>甲 相机那一排</b>：左下一枚最近一篇的封面片＝查看，右下一枚大快门＝记录，中间空出来给那张脸。<b>不新增任何文案</b>（图标与封面自己会说话），快门 180 与面板里那枚同档。', refs([['甲-Halide-快门与缩略片', 'Halide Mark III：左下缩略片＋中央快门，两枚一大一小、一实一圆']]))}
${CELL('乙', '<b>乙 抽屉露一条边</b>：胶囊仍是记录（一个字不改），它上面露出最近那篇的一条边（64rpx，圆角朝上）＝查看，点那条边或往上滑进列表。<b>代价：那条边会压掉照片下沿一截</b>，且和面板展开后的内容重复一层。', refs([['乙-DayOne-抽屉peek', 'Day One：彩色 hero 之上是一张圆角 sheet，顶部 List/Calendar/Media/Map 四个标签',], ['乙-Readwise-卡片墙', 'Readwise Reader：查看＝封面卡片墙，不是一枚按钮']]))}
${CELL('丙', '<b>丙 两枚都住底栏</b>：第一屏<b>不放任何入口控件</b>——记录＝底栏那颗 ＋（这一版把它换成纸白实心、比现网更强调），查看＝底栏第二格 ≡。<b>最省屏、最干净</b>；代价是"两个按钮"退成底栏两格，屏上看不见"记录"这件事的形状。', refs([['丙-Strava-底栏五格', 'Strava：Record 就是底栏正中间那一格，不另开控件'], ['丙-Instagram-底栏两枚', 'Instagram：拍摄与浏览都在底栏，首屏零入口']]))}
${CELL('丁', '<b>丁 一实一虚</b>：还是并排，但<b>不等宽不等重</b>——左 460rpx 实心纸白「记录」（主行动），右 220rpx 只有描边的幽灵「查看」（次行动）。两枚加起来仍等于那条胶囊的 702。', refs([['丁-Things3-主行动加号', 'Things 3：一枚蓝色实心 ＋ 是唯一的主动作，列表本身承担"查看"'], ['丁-Cubox-Home与加号', 'Cubox Home：一枚 ＋ 与一屏内容并存，不做两个同重的按钮']]))}
</div>
<div class="note" style="margin-top:26px">
<h3>三处要你判（都在"拍哪个"之前）</h3>
① <b>「记录」「查看」这两个词字典里没有</b>（现网只有「动动手指」／「选择记录模式」／「笔记」）。甲、乙、丙<b>一句新话都不用加</b>；只有丁要新增中英各两键。<br>
② <b>「查看」开的是什么</b>：甲的封面片、乙的那条边、丙的 ≡ 都指向<b>笔记列表那个 tab</b>（跳过去，不再开一层面板）；只有丁留了"开面板"这一解。你上一句说的是"两个面板入口"，所以这条得你定：<b>查看是跳列表，还是在本页开一张窗</b>。<br>
③ <b>甲与丙会把"拍照"这件事做得比"记录"更大</b>（快门／＋ 都是相机语言）。现网那条 slogan 是「看到好内容，随手记下来」，而面板里除了拍照还有链接与文字两档——<b>快门那枚会不会把"只能拍照"暗示得太死</b>，只有你能判。<br>
<div style="margin-top:10px;color:#7A756C">我的倾向：<b>甲</b>。它把两枚入口分成"一去处、一动作"，不新增文案、不动条底，也不像丙那样把记录藏进底栏；快门这层相机语言正好对上你那句"默认就是拍照"。乙那条边我不推荐——它和面板展开后的内容重复，等于同一件事画两遍。</div>
</div>`

const OUT_HTML = path.join(DIR, '两入口四方案.html')
const open = (HTML.match(/<div\b/g) || []).length, close = (HTML.match(/<\/div>/g) || []).length
ck(`HTML 里 <div> 与 </div> 数量相等（${open}）`, open === close, `开 ${open} 闭 ${close}`)
fs.writeFileSync(OUT_HTML, HTML)
const PNG = path.join(DIR, '两入口四方案.png')
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
   '--window-size=1300,3800', `--screenshot=${PNG}`, '--virtual-time-budget=12000', 'file://' + OUT_HTML],
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

/* ---------- ④ 在产物上量，不靠稿子自述 ---------- */
const audit = JSON.parse(execFileSync('python3', ['-c', `
import json
from PIL import Image
im=Image.open(${JSON.stringify(PNG)}).convert('RGB'); W,H=im.size; px=im.load()
S=${LAY.scale}; PITCH=${PITCH}; PADX=${LAY.padX}; COLS=${COLS}
PAPER=(242,239,233)
def hx(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))
CHc=hx(${JSON.stringify(CH.bg)})
def near(a,b,t): return all(abs(a[i]-b[i])<=t for i in range(3))
out={}
# 每一列自上而下有几台：格子里第 i 台 → 列 i%COLS、行 i//COLS。
# 底栏那条胶囊是全图唯一一支颜色，按列扫出它的连续段＝每一台的锚点；台数对不上＝有台被裁了。
for c in range(COLS):
    x0=int(PADX+PITCH*c+40); x1=int(PADX+PITCH*c+${LAY.slot}-40)
    rows=[y for y in range(H) if sum(1 for x in range(x0,x1,4) if near(px[x,y],CHc,12))>len(range(x0,x1,4))*0.55]
    cl=[]
    for y in rows:
        if cl and y-cl[-1][-1]<=6: cl[-1].append(y)
        else: cl.append([y])
    tabs=[g[0] for g in cl]
    # 每一台：入口那一组的底边＝底栏顶往上 8～159px 这一段里，最后一个纸白像素的 y
    bottoms=[]
    for t in tabs:
        b=None
        for y in range(t-8,int(t-159),-1):
            if any(near(px[x,y],PAPER,8) for x in range(x0,x1)): b=y; break
        bottoms.append(b)
    out['col%d'%c]={'tabs':tabs,'bottoms':bottoms}
print(json.dumps(out))`], { encoding: 'utf8' }))
const flat = []
for (let c = 0; c < COLS; c++) for (const t of audit['col' + c].tabs) flat.push({ c, t })
ck('五台都渲出来了：每列量到的台数对得上（第 1 列 3 台、第 2 列 2 台）',
  audit.col0.tabs.length === 3 && audit.col1.tabs.length === 2,
  `col0 ${audit.col0.tabs.length}／col1 ${audit.col1.tabs.length}`)
const bOf = (i) => { const c = i % COLS, r = Math.floor(i / COLS); return audit['col' + c].bottoms[r] }
const tOf = (i) => { const c = i % COLS, r = Math.floor(i / COLS); return audit['col' + c].tabs[r] }
// 比的是**每台自己那一屏里"入口底边距底栏顶"那一段**，不是绝对 y——五台分处三行，
// 拿绝对 y 比必然越比越大（第一版就是这么假红的）。
const lines = [0, 1, 2, 4].map((i) => (bOf(i) == null ? null : tOf(i) - bOf(i)))
ck('甲／乙／丁 三台入口底边离底栏顶那一段与现网同一档（±4px，换成这四版都不动条底 618 那笔账）',
  lines.every((v) => v != null) && Math.max(...lines) - Math.min(...lines) <= 4,
  `现网 ${lines[0]}｜甲 ${lines[1]}｜乙 ${lines[2]}｜丁 ${lines[3]}（px，离各自底栏顶）`)
ck('丙那一台入口那一段没有纸白控件（第一屏真的什么都不放，只剩底栏）',
  bOf(3) == null, `量到 ${bOf(3)}`)
console.log(`\n现读进来的数：面板 ${G.panelH}、胶囊高 ${G.barH} 圆角 ${G.barR}、快门 ${G.shut}、缝 ${G.gap}、条底档 ${BAR_BOTTOM}（离屏底）`)
console.log('产物：' + PNG)
if (bad.length) { console.log(`✗ ${bad.length} 条不过：` + bad.join(' / ')); process.exit(1) }
console.log('✓ 全过')
