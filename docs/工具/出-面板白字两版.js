/**
 * 出一张决策图：首屏那枚面板，五档心情 ×（现在这版 / 面压深＋统一白字）。
 * 色全部现读：面色＝今天五张实测截图上采到的那块面（不是算的）；改后的面色＝把同一支色
 * 按色相比例压暗到"纸白压上去 ≥5.5:1"；字色、底栏、➕ 从 palette 读；屏上每句中文从 i18n 字典读。
 * 用法：node docs/工具/出-面板白字两版.js  →  同目录一张 PNG
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const ROOT = process.env.MP_ROOT || path.resolve(__dirname, '..', '..')
const OUT = path.join(ROOT, 'docs/design/10-14面板白字两版/对比.png')
const { MOODS, THEMES, createSkin, TIP_DOT } = require(path.join(ROOT, 'miniprogram/utils/palette.js'))
const { i18n } = require(path.join(ROOT, 'miniprogram/utils/i18n.js'))
// createSkin() 回的是 style 串（屏上就是这么挂的），拆成对象好用
const skinOf = (theme) => Object.fromEntries(createSkin(theme).split(';').map((p) => p.split(':').map((s) => s.replace(/^--/, ''))))

// 今天从 docs/design/10-14五档彩色玻璃/实测/档?-*.png 面板右半无字处采到的那块面（五档各一）
const FACE_NOW = { ink: [36, 37, 43], ivory: [152, 142, 136], celadon: [141, 163, 145], blush: [156, 147, 165], mist: [145, 153, 166] }
const PAPER = [242, 239, 233]
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`
const lum = (p) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4) }; return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]) }
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
// 按色相比例压暗到目标亮度（二分），色相与饱和度比例不动 —— 只改明度，不改"是哪支色"
function darkenTo(face, targetL) {
  let lo = 0, hi = 1
  const at = (k) => face.map((v) => Math.round(v * k))
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (lum(at(mid)) > targetL) hi = mid; else lo = mid }
  return at((lo + hi) / 2)
}
const TARGET_CR = 5.5
const needL = (lum(PAPER) + 0.05) / TARGET_CR - 0.05

const zh = i18n.zh
const rows = { 现在: [], 改后: [] }
MOODS.forEach((m) => {
  const theme = THEMES.filter((t) => t.key === m.theme)[0]
  const skin = skinOf(m.theme)
  const now = FACE_NOW[m.key]
  const deep = darkenTo(now, needL)
  const pageBg = theme.page
  ;[[now, '现在'], [deep, '改后']].forEach(([face, kind]) => {
    const ink = kind === '现在' ? m.text : '#F2EFE9'
    const inkDim = kind === '现在' ? `rgba(${hex2arr(m.text)},0.72)` : `rgba(242,239,233,0.72)`
    const band = darkenTo(face, lum(face) * 0.62)
    const crText = cr(hex2arr3(ink), face)
    rows[kind].push(`
<div class="cell">
  <div class="cap"><b>${m.label}</b><span>字对底 ${crText.toFixed(1)}:1</span></div>
  <div class="ph" style="background:${pageBg}">
    <div class="nav">图麦笔记<i></i></div>
    <div class="swap" style="color:rgba(242,239,233,.85)">${zh.homeBgSwap} ›<span>${zh.moodSwap} ☁</span></div>
    <div class="art">提炼成<br>干货</div>
    <div class="panel" style="background:${rgb(face)}">
      <div class="face"><span class="fig"></span><span class="fig2"></span></div>
      <div class="count" style="background:${rgb(band)};color:${ink}">
        <div><em>0</em><hr><span style="color:${inkDim}">${zh.statNotes}</span></div>
        <div><em>0</em><hr><span style="color:${inkDim}">${zh.statImages}</span></div>
      </div>
      <div class="tips" style="color:${ink}"><i style="background:${TIP_DOT}"></i>${zh.tipsPrefix}${zh.tips[1]}</div>
      <div class="plus" style="background:${skin['cp-cam']};color:${skin['cp-cam-ink']}">+</div>
      <div class="tab" style="background:${rgba(face, 0.62)}">
        <b style="background:${kind === '现在' ? skin['cp-cam'] : rgb(darkenTo(face, needL * 0.8))}">+</b><u></u><u></u>
      </div>
    </div>
  </div>
</div>`)
  })
})
function hex2arr(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)].join(',') }
function hex2arr3(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] }
function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})` }

const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#F2EFE9;font-family:-apple-system,"PingFang SC",sans-serif;padding:18px}
h1{font-size:16px;margin:0 0 4px}p{font-size:12px;margin:0 0 14px;color:#555}
.rowlab{font-size:13px;font-weight:700;margin:16px 0 6px;color:#14161A}
.grid{display:grid;grid-template-columns:repeat(5,196px);gap:14px 10px}
.cell{width:196px}.cap{font-size:11px;line-height:1.35;margin:0 0 5px;color:#14161A}
.cap b{font-size:12px}.cap span{color:#777;margin-left:5px}
.ph{width:182px;height:394px;border-radius:22px;overflow:hidden;position:relative;box-shadow:0 2px 10px rgba(0,0,0,.14)}
.nav{height:22px;display:flex;align-items:center;justify-content:center;font-size:9px;position:relative}
.nav i{position:absolute;right:6px;top:5px;width:26px;height:12px;border-radius:7px;border:1px solid rgba(0,0,0,.25)}
.swap{position:absolute;top:26px;left:8px;right:8px;font-size:8px;display:flex;justify-content:space-between}
.art{position:absolute;top:44px;left:8px;right:8px;height:150px;border:1px solid rgba(0,0,0,.18);border-radius:10px 10px 0 0;display:flex;align-items:center;font-size:26px;font-weight:700;color:#14161A;padding-left:10px;line-height:1.1}
.panel{position:absolute;left:0;right:0;bottom:0;height:133px;border-radius:10px 10px 0 0;box-shadow:0 -3px 7px rgba(18,20,26,.16)}
.face{position:absolute;left:8px;top:6px;width:66px;height:54px;background:#fff;border-radius:6px;overflow:hidden}
.fig{position:absolute;left:14px;bottom:0;width:26px;height:40px;border-radius:13px 13px 0 0;background:#C9C4BC}
.fig2{position:absolute;right:6px;bottom:0;width:18px;height:30px;border-radius:9px 9px 0 0;background:#D8D4CD}
.count{position:absolute;left:8px;top:63px;width:66px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:space-around}
.count div{text-align:center}.count em{font-style:normal;font-size:17px;font-weight:200;color:inherit}
.count hr{border:0;border-top:1px solid rgba(128,128,128,.5);margin:1px 6px}
.count span{font-size:7px}
.tips{position:absolute;left:84px;top:10px;width:90px;font-size:9px;line-height:1.45}
.tips i{display:inline-block;width:5px;height:5px;border-radius:50%;margin-right:4px;vertical-align:1px}
.plus{position:absolute;left:108px;top:52px;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:300}
.tab{position:absolute;left:6px;right:6px;bottom:4px;height:22px;border-radius:11px;display:flex;align-items:center;justify-content:space-around}
.tab b{width:17px;height:17px;border-radius:50%;color:#F2EFE9;font-size:11px;display:flex;align-items:center;justify-content:center;font-weight:300}
.tab u{width:11px;height:11px;border-radius:3px;background:rgba(128,128,128,.55);text-decoration:none}
</style>
<h1>首屏那枚面板：五档心情，现在这版 ／ 面压深＋统一白字</h1>
<p>面色取自今天五张实测截图；下排把同一支色按色相压暗到纸白压得住（≥5.5:1），色相不动、只降明度。屏上每句中文抄自现网字典。</p>
<div class="rowlab">现在这版（字跟着心情翻：墨＝白、彩色四档＝深）</div><div class="grid">${rows['现在'].join('')}</div>
<div class="rowlab">改后（五档一律白字，代价是那四档的面要压深）</div><div class="grid">${rows['改后'].join('')}</div>`

const tmp = path.join(ROOT, 'docs/design/10-14面板白字两版/对比.html')
fs.mkdirSync(path.dirname(tmp), { recursive: true })
fs.writeFileSync(tmp, html)
spawnSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
  '--window-size=1080,1010', `--screenshot=${OUT}`, `file://${tmp}`,
], { stdio: 'inherit' })
console.log('图在', OUT)
MOODS.forEach((m) => {
  const now = FACE_NOW[m.key], deep = darkenTo(now, needL)
  console.log(`${m.label}：现面 ${now} 纸白 ${cr(PAPER, now).toFixed(2)}:1 → 压深后 ${deep} 纸白 ${cr(PAPER, deep).toFixed(2)}:1`)
})
