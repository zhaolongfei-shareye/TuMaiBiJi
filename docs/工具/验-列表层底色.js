// 一把静态尺子：列表那一层的色**只有一个出处**，而 `app.wxss` 那三条镜像必须逐字相等。
// 规格正本 `docs/规格-列表层底色与区内顶那一行.md` §1/§2/§5.3/§6，落码清单 §9 第 1、2 步，
// 它自己在 §10 里点名的两条新增判据也由这一把承担：
//   · `.sheet` 的底色必须等于 palette 那个出口函数的返回值（四套各钉一条，逐字相等）；
//   · `.xlist`／`.grid2` 那条 `padding-bottom:150rpx` 还在（§5.3 那条净空是规矩不是样式细节）。
//
// 跑法：node docs/工具/验-列表层底色.js            正向，期望全过
//       node docs/工具/验-列表层底色.js --rev      反向：把镜像值改坏一格，**必须红的事前那一串**
//       node docs/工具/验-列表层底色.js --rev2     反向：把派生系数改成"另挑一支色"，也必须红
//
// 为什么派生那条要**独立算一遍**而不是只比镜像：只比"wxss == palette"的话，palette 自己哪天被
// 改成另挑色相（v27 那支粉红就是这么被打回的），两边一起错、判据照绿。所以这里拿底栏那一支的
// H/S 现算一条等式：层色的 H 必须还等于底栏 `.bg` 的 H，S 必须是它的 0.35，L 必须是 78。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const MODE = process.argv.includes('--rev') ? 'rev' : (process.argv.includes('--rev2') ? 'rev2' : '')
const KEYS = ['tint-paper', 'tint-celadon', 'tint-blush', 'gradient-blue']
const CLASS = { 'tint-paper': 'theme-tint-paper', 'tint-celadon': 'theme-tint-celadon', 'tint-blush': 'theme-tint-blush', 'gradient-blue': 'theme-blue' }
const bad = []
const SEEN = []
const ALL = SEEN
const ck = (name, ok, got) => {
  SEEN.push(name)
  console.log(`${ok ? '✓' : '✗'} ${name}${got !== undefined ? `　→ ${got}` : ''}`)
  if (!ok) bad.push(name)
}
// 镜像值与真身的差别只在排版：wxss 里 `rgba(35, 37, 44, 0.72)` 有空格、palette 里没有；
// hex 一边大写一边小写。比较前一律归一，**归一的是空格与大小写，不是色值本身**。
const norm = (s) => String(s).replace(/\s+/g, '').toLowerCase()

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const wxssSrc = () => {
  let s = read('miniprogram/app.wxss')
  // 反向那一刀：只动 ivory 那一套的层色（改坏一格），别的全字不动。
  if (MODE === 'rev') s = s.replace('--bg-layer: #CDC9C1;', '--bg-layer: #CDC9C2;')
  return s
}
// 色板也要现编一份：`--rev2` 那把刀改的是**派生系数**，缓存的 require 拿不到变异体。
const paletteSrc = () => {
  let s = read('miniprogram/utils/palette.js')
  if (MODE === 'rev2') s = s.replace('const LAYER_SAT = 0.35', 'const LAYER_SAT = 1').replace('const LAYER_L = 78', 'const LAYER_L = 62')
  const m = { exports: {} }
  new Function('module', 'exports', 'require', '__dirname', s)(m, m.exports, require, path.join(ROOT, 'miniprogram/utils'))
  return m.exports
}

function hue(hex) {
  const n = (x) => parseInt(hex.substr(1 + x * 2, 2), 16)
  const r = n(0) / 255, g = n(1) / 255, b = n(2) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  if (!d) return 0
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return h * 60
}
function satOf(hex) {
  const n = (x) => parseInt(hex.substr(1 + x * 2, 2), 16)
  const r = n(0) / 255, g = n(1) / 255, b = n(2) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  if (!d) return 0
  const l = (mx + mn) / 2
  return d / (1 - Math.abs(2 * l - 1)) * 100
}
// 只取某一个 `.theme-*` 规则体里的声明，不读整份文件（负向钉读全文会为无关的事假红）。
function declIn(css, cls, token) {
  const at = css.indexOf('.' + cls + ' {')
  if (at < 0) return null
  const end = css.indexOf('}', at)
  const body = css.slice(at, end)
  const m = body.match(new RegExp('--' + token + ':\\s*([^;]+);'))
  return m ? m[1] : null
}

;(async () => {
  const p = paletteSrc()
  const css = wxssSrc()

  // ---------- ① 出口函数在不在，先自证（读不到就红，不许 skip） ----------
  ck('palette 导出了那一层唯一的色值出口 listLayerOf', typeof p.listLayerOf === 'function', typeof p.listLayerOf)
  ck('palette 导出了那一层的两档字 layerSkinOf', typeof p.layerSkinOf === 'function', typeof p.layerSkinOf)
  if (typeof p.listLayerOf !== 'function') { console.log('\n✗ 出口都没有，下面全是空转'); process.exit(1) }

  // ---------- ② 四套的镜像逐字相等（§10 点名的第一条） ----------
  const mirrorHits = KEYS.filter((k) => declIn(css, CLASS[k], 'bg-layer') !== null)
  ck('四套 `.theme-*` 里都读得到 `--bg-layer`（捞空不等于通过）', mirrorHits.length === KEYS.length, `读到 ${mirrorHits.length}/4 套`)
  for (const k of KEYS) {
    const want = p.listLayerOf(k)
    const got = declIn(css, CLASS[k], 'bg-layer')
    ck(`${k}：--bg-layer 逐字等于 listLayerOf()`, norm(got) === norm(want), `屏上 ${got} ／ 真身 ${want}`)
  }

  // ---------- ③ 派生那条：独立算一遍，不比镜像（防"两边一起错"） ----------
  for (const k of KEYS) {
    const bg = p.chromeOf(k).bg
    const layer = p.listLayerOf(k)
    // 容差给到 10°：**这条挡的是"另挑一支色相"**（v27 那支粉是 H340，离 H43 差 297°），不是量化尾巴。
    // 层色的 S 只有 10 出头，8 位色上一个通道差 1 个字节点，算出来的 H 就能摆两三度——
    // 拿 1.5° 去卡会红在量化上（[[feedback-ruler-units-and-box-model]] 第 18 条同一族：先问读数本身的量化误差）。
    ck(`${k}：层色的色相还等于底栏那一支的色相（不许另挑色相）`, Math.abs(hue(layer) - hue(bg)) < 10,
      `底栏 ${bg} 的 H=${hue(bg).toFixed(1)}，层 ${layer} 的 H=${hue(layer).toFixed(1)}（差 ${Math.abs(hue(layer) - hue(bg)).toFixed(1)}°）`)
    ck(`${k}：层的饱和＝底栏那一支的 0.35（系数是他点的，改系数就是改拍过的口径）`,
      Math.abs(satOf(layer) - satOf(bg) * 0.35) < 1.0,
      `底栏 ${bg} 的 S=${satOf(bg).toFixed(1)} → 层 ${layer} 的 S=${satOf(layer).toFixed(1)}（期望 ${(satOf(bg) * 0.35).toFixed(1)}）`)
  }

  // ---------- ④ 那一层的两档字（§6：先试纸白，压不住整层翻墨；淡档由 4.5 反解） ----------
  for (const k of KEYS) {
    const skin = p.layerSkinOf(k)
    const inkGot = declIn(css, CLASS[k], 'ink-on-layer')
    const softGot = declIn(css, CLASS[k], 'ink-on-layer-soft')
    ck(`${k}：--ink-on-layer 逐字等于 layerSkinOf().ink`, norm(inkGot) === norm(skin.ink), `屏上 ${inkGot} ／ 真身 ${skin.ink}`)
    ck(`${k}：--ink-on-layer-soft 逐字等于 layerSkinOf().soft`, norm(softGot) === norm(skin.soft), `屏上 ${softGot} ／ 真身 ${skin.soft}`)
    // §6 那条"不写死 alpha"要真钉住：它自己混成实心必须 ≥4.5，而**阶梯里比它低的每一档都不到 4.5**。
    // 半透明不落地去谈对比就是假数，所以这里先 mix 成实心再算（mix／crOf 是色彩算法，
    // 不是 `layerSkinOf` 里那一段选档逻辑——拿选档的函数验选档才是永真式）。
    const crAt = (a) => p.crOf(p.mix(skin.ink, skin.bg, a), skin.bg)
    const LAD = [0.5, 0.55, 0.6, 0.66, 0.72, 0.78, 0.85, 0.92, 1]
    const lower = LAD.filter((a) => a < skin.alpha)
    ck(`${k}：淡档那一档混成实心后过 4.5，且比它低的 ${lower.length} 档全不过（不是手挑的数）`,
      crAt(skin.alpha) >= 4.5 && lower.every((a) => crAt(a) < 4.5),
      `alpha=${skin.alpha} 对比 ${crAt(skin.alpha).toFixed(2)}；低档 ${lower.map((a) => `${a}:${crAt(a).toFixed(2)}`).join(' ')}`)
  }

  // ---------- ⑤ §5.3 那条净空是规矩，不是样式细节 ----------
  const ix = read('miniprogram/pages/index/index.wxss')
  const grab = (sel) => {
    const at = ix.indexOf(sel + ' {')
    if (at < 0) return null
    return ix.slice(at, ix.indexOf('}', at))
  }
  for (const sel of ['.xlist', '.grid2']) {
    const body = grab(sel)
    ck(`${sel} 那条 padding-bottom:150rpx 还在（最后一格不许切进浮栏）`,
      !!body && /padding[^;]*150rpx/.test(body), body ? (body.match(/padding[^;]*/) || ['没写 padding'])[0].trim() : '那段读不到')
  }
  // 层已经换成浅灰，"别顺手补一条描边"这条也得钉住（§5 第 1 条：那条缝撤掉，现网本来就没有）。
  const sheet = grab('.sheet')
  ck('.sheet 里没有多出那条 3rpx 的层顶边（撤掉就是撤掉，不许落码时补回来）',
    !!sheet && !/3rpx/.test(sheet), sheet ? '读过那段' : '.sheet 那段读不到')

  // ---------- 反向：该红的事前一名单 ----------
  if (MODE === 'rev') {
    const wantExact = ['tint-paper：--bg-layer 逐字等于 listLayerOf()']
    const gotList = ALL.filter((n) => bad.includes(n))
    ck('反向（把象牙那套镜像改坏一格）红的正好是事前那一条', gotList.join('|') === wantExact.join('|'),
      `实红：${gotList.join(' | ') || '（一条都没红＝这条判据是永真式）'}`)
  }
  if (MODE === 'rev2') {
    // 派生系数一改，**该红的那一族是四条镜像**（真身变了、屏上没跟着变）。这里判"必须包含"而不是"正好相等"：
    // 系数一动，饱和那条、淡档选档那条本来也该跟着红，多红是诚实的表现，硬要凑成等集反倒是在挑判据。
    const must = KEYS.map((k) => `${k}：--bg-layer 逐字等于 listLayerOf()`)
    const miss = must.filter((n) => !bad.includes(n))
    ck('反向（把派生系数改成另挑一支色）四条镜像必须都红', miss.length === 0,
      miss.length ? `没红：${miss.join(' | ')}` : `红了 ${bad.length} 条（含这 4 条镜像）`)
  }

  console.log(`\n${bad.length ? `✗ ${bad.length} 条不过：${bad.join(' | ')}` : '全过'}`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('✗ 跑挂了：', (e && e.message) || JSON.stringify(e)); process.exit(1) })
