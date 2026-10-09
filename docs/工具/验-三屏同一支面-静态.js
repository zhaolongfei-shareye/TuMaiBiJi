// #27 落码第 4 步（三屏同一支面）的静态自证。规格 §5 / §5.1 / §9 第 4 条。
// 这一把只读源码、不开开发者工具；"真页面上真渲染出那个数没有"归 验-四套莫兰迪落地.js。
//
// 它钉的是四种坏法：
//   ① `--layer-edge` 那条镜像与 palette 真身不一致（改一边不改另一边）；
//   ② 层色那四条在 `page{}` 里没有兜底——`themeClass` 是各页 applyTheme 之后才写进 data 的，
//      首帧容器上没有主题类，`var(--bg-layer)` 解不出值就是**透明**，那一层会闪一下页面底；
//   ③ 描边那一圈的浓度不是"按 3.0 反解出来的那一档"（这里独立跑一遍阶梯，不比 palette）；
//   ④ 四个落点没换成 var：`.float-sheet` 的面、`.ds-dock` 那条边、`.ds-ibtn` 的环、
//      详情/卡片两屏的主面与那条通栏底条。
//
// 跑法：node docs/工具/验-三屏同一支面-静态.js         正向，期望全过
//       node docs/工具/验-三屏同一支面-静态.js --rev   反向：改坏象牙的 --layer-edge → 必红那一条
//       node docs/工具/验-三屏同一支面-静态.js --rev2  反向：把 .actions-bar 的面换回 --bg-page → 必红那一条
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const MODE = process.argv.includes('--rev') ? 'rev' : (process.argv.includes('--rev2') ? 'rev2' : '')
const KEYS = ['tint-paper', 'tint-celadon', 'tint-blush', 'gradient-blue']
const CLASS = { 'tint-paper': 'theme-tint-paper', 'tint-celadon': 'theme-tint-celadon', 'tint-blush': 'theme-tint-blush', 'gradient-blue': 'theme-blue' }
const LABEL = { 'tint-paper': '象牙', 'tint-celadon': '天青', 'tint-blush': '樱落', 'gradient-blue': '雨雾' }
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got !== undefined ? `　→ ${got}` : ''}`)
  if (!ok) bad.push(name)
}
const norm = (s) => String(s).replace(/\s+/g, '').toLowerCase()
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const appSrc = () => {
  const s = read('miniprogram/app.wxss')
  if (MODE !== 'rev') return s
  // 反向那一刀只能落在**象牙那个块里面**：`page{}` 的兜底与象牙逐字同值，
  // 拿字符串全局替换会一次改到两处（② 那组判据会跟着红，反向名单就不干净了）。
  const at = s.indexOf('.theme-tint-paper {')
  const end = s.indexOf('\n}', at)
  const body = s.slice(at, end)
  return s.slice(0, at) + body.replace('--layer-edge: rgba(35, 37, 44, 0.6);', '--layer-edge: rgba(35, 37, 44, 0.5);') + s.slice(end)
}
const shareSrc = () => {
  const s = read('miniprogram/pages/share/share.wxss')
  if (MODE !== 'rev2') return s
  // 只动 `.actions-bar` 那一段：`.loading-overlay` 那段里也有 background 声明，
  // 全局替换会一次改到两处，反向名单就不干净了。
  const at = s.indexOf('.actions-bar {')
  const end = s.indexOf('}', at)
  const body = s.slice(at, end)
  return s.slice(0, at) + body.replace('background: var(--inner-face);', 'background: var(--bg-page);') + s.slice(end)
}

// 块内取值：从 `.theme-x { … }` 那一段里捞某条自定义属性
const pickIn = (src, cls, tok) => {
  const at = src.indexOf('.' + cls + ' {')
  if (at < 0) return null
  const end = src.indexOf('\n}', at)
  const body = src.slice(at, end < 0 ? src.length : end)
  const m = new RegExp('--' + tok + ':\\s*([^;]+);').exec(body)
  return m ? m[1].trim() : null
}
// page{} 那一段（第一个 `page {` 到它的闭合）
const pageBlock = (src) => {
  const at = src.indexOf('page {')
  if (at < 0) return ''
  const end = src.indexOf('\n}', at)
  return src.slice(at, end < 0 ? src.length : end)
}
// 规则体：从 `.sel {` 到最近的 `}`。**注释一律剥掉再比**——
// 这一轮的注释里就写着 `#FCFBF8`、"10% 墨的顶边"这些旧值，拿原文正则捞会把
// 自己写的说明当成声明，判据红得莫名其妙（[[feedback-ruler-units-and-box-model]] 那一族）。
const strip = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, '')
const ruleBody = (src, sel) => {
  const at = src.indexOf(sel + ' {')
  if (at < 0) return null
  const end = src.indexOf('}', at)
  return strip(src.slice(at, end < 0 ? src.length : end))
}

const p = require(path.resolve(__dirname, '../../miniprogram/utils/palette.js'))
// 打读数用的薄helper：把"抓第一条声明"这件事收在一处，免得每条判据各自写一遍 (exec || [x])[0]。
const grab = (body, re, msg) => {
  if (!body) return msg
  const m = re.exec(body)
  return m ? m[0] : msg
}
// ③ 那条要**独立**跑一遍阶梯，不能拿 palette 的函数当尺子量它自己。
// 阶梯与门槛抄规格 §5.1（图形档 3.0，从 .10 起），墨就是 layerSkinOf.ink 那支 #23252C。
const RING_LAD = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
const INK = '#23252C'

;(async () => {
  const app = appSrc()
  const ix = strip(read('miniprogram/pages/index/index.wxss'))
  const dt = strip(read('miniprogram/pages/detail/detail.wxss'))
  const sh = strip(shareSrc())

  // ---------- ① 四套的 --layer-edge 镜像 ----------
  for (const k of KEYS) {
    const want = p.layerSkinOf(k).edge
    const got = pickIn(app, CLASS[k], 'layer-edge')
    ck(`${LABEL[k]}：--layer-edge 与 palette.layerSkinOf().edge 逐字相等`,
      got !== null && norm(got) === norm(want), `${got} vs ${want}`)
  }

  // ---------- ③ 浓度是真的按 3.0 反解出来的（独立算，不叫 palette 那个函数） ----------
  for (const k of KEYS) {
    const layer = p.listLayerOf(k)
    const firstOver = RING_LAD.find((a) => p.crOf(p.mix(INK, layer, a), layer) >= 3.0)
    const gotStr = pickIn(app, CLASS[k], 'layer-edge')
    const gm = gotStr ? /,\s*([\d.]+)\s*\)/.exec(gotStr) : null
    const gotA = gm ? Number(gm[1]) : NaN
    const cr = p.crOf(p.mix(INK, layer, gotA), layer)
    ck(`${LABEL[k]}：那一圈的浓度＝独立反解出来的第一档过 3.0`,
      gotA === firstOver, `屏上 ${gotA}，独立算 ${firstOver}`)
    ck(`${LABEL[k]}：比它低的那一档真的不过 3.0（反解不是从楼梯顶上挑的）`,
      RING_LAD.indexOf(firstOver) === 0 || p.crOf(p.mix(INK, layer, RING_LAD[RING_LAD.indexOf(firstOver) - 1]), layer) < 3.0,
      `低一档 ${RING_LAD[RING_LAD.indexOf(firstOver) - 1]} → ${p.crOf(p.mix(INK, layer, RING_LAD[RING_LAD.indexOf(firstOver) - 1]), layer).toFixed(2)}`)
    ck(`${LABEL[k]}：混成实心之后压层过 3.0`, cr >= 3.0, cr.toFixed(2))
  }

  // ---------- ② page{} 那五兜底 ----------
  const pb = pageBlock(app)
  const ivory = {
    'bg-layer': p.listLayerOf('tint-paper'),
    'ink-on-layer': p.layerSkinOf('tint-paper').ink,
    'ink-on-layer-soft': p.layerSkinOf('tint-paper').soft,
    'layer-edge': p.layerSkinOf('tint-paper').edge,
    'inner-face': p.INNER_FACE,
  }
  for (const tok of Object.keys(ivory)) {
    const m = new RegExp('--' + tok + ':\\s*([^;]+);').exec(pb)
    ck(`page{} 有 --${tok} 的兜底，且等于象牙那一套（首帧没主题类那一刹不透明）`,
      !!m && norm(m[1]) === norm(ivory[tok]), m ? `${m[1].trim()} vs ${ivory[tok]}` : '(这一条根本没有)')
  }

  // ---------- ④ 四个落点 ----------
  const fs1 = ruleBody(ix, '.float-sheet')
  ck('详情浮窗那张窗的面吃 var(--bg-layer)', !!fs1 && /background:\s*var\(--bg-layer\)/.test(fs1),
    grab(fs1, /background:[^;]+;/, '(没有 background 声明)'))
  ck('整份 index.wxss 的**声明**里那支写死的 #FCFBF8 一枚不剩（注释里提它是历史，不算）',
    !/FCFBF8/i.test(strip(ix)), (strip(ix).match(/FCFBF8/gi) || []).length + ' 处')
  const dock = ruleBody(ix, '.ds-dock')
  ck('浮窗底排那条 10% 墨的顶边撤了（§5.1 第④条）', !!dock && !/border-top/.test(dock),
    grab(dock, /border-top:[^;]+;/, '(没有 border-top)'))
  const ibtn = ruleBody(ix, '.ds-ibtn')
  ck('浮窗那两枚描边按钮的环走 var(--layer-edge)，不是字面 rgba',
    !!ibtn && /box-shadow:[^;]*var\(--layer-edge\)/.test(ibtn),
    grab(ibtn, /box-shadow:[^;]+;/, '(没有 box-shadow)'))

  for (const [name, src] of [['详情独立页', dt], ['笔记卡片页', sh]]) {
    const c = ruleBody(src, '.container')
    ck(`${name}：这一屏的主面吃 var(--bg-layer)`, !!c && /background:\s*var\(--bg-layer\)/.test(c),
      grab(c, /background:[^;]+;/, '(没有 background 声明)'))
  }
  const ab = ruleBody(sh, '.actions-bar')
  ck('卡片页那条通栏底条走白内框那一档（面＝var(--inner-face)）',
    !!ab && /background:\s*var\(--inner-face\)/.test(ab),
    grab(ab, /background:[^;]+;/, '(没有 background 声明)'))
  ck('它与层靠一条上投影分开（box-shadow 有 y 分量是负的那一条）',
    !!ab && /box-shadow:\s*0\s*-/.test(ab), grab(ab, /box-shadow:[^;]+;/, '(没有 box-shadow)'))
  const lo = ruleBody(sh, '.loading-overlay')
  ck('卡片页那块加载垫跟着主面走层色（不闪回页面底）',
    !!lo && /background:\s*var\(--bg-layer\)/.test(lo),
    grab(lo, /background:[^;]+;/, '(没有 background 声明)'))

  console.log(`\n${bad.length ? `✗ 红 ${bad.length} 条：${bad.join(' | ')}` : '全过'}`)
  process.exitCode = bad.length ? 1 : 0
})().catch((e) => { console.error('尺子挂了', e); process.exitCode = 2 })
