// 头部那只盒子的封顶，与"取景只有一处说法"（10-16 审计第八条）。
//
// 要挡的事：`bandGeom` 按宽铺满算盒高，**没有任何上限**。1080×20000 那张微信拼长图（约 1:18.5）
// 算出来是 13889rpx ≈ 5.8 个视口高的一层 `<image>`。长截图是这个产品最自然的素材，
// 把它选成头部形象图是会发生的操作。
//
// 这一把真正要紧的不是那枚 3000，而是第三条：**采样与画面必须是同一次计算**。
// `utils/imgBrightness.js` 要照同一只盒子算"屏上那一条落在原图哪几行"来定字色深浅；
// 它原来自己抄了一遍 `(750*h)/w`。两处各写一遍，那么给盒子加封顶这一天，
// 采样的那一截和显示的那一截就分家了——症状是字色判的是画面里根本没显示的那一段。
// 这一族在 10-12／10-15 那几刀里已经踩过（`HEAD_IMG_H`／`BG_ANCHOR` 就是为这事才交出去的）。
//
// ③ 那两条是**行为**判据：把"只有哪几行是亮的"造成一个剖面喂进去，
// 判出来的深/浅直接暴露它读到的是哪几行——比拿同一条公式再算一遍期望值强。
//
// 跑法：node docs/工具/验-头部图封顶.js
global.wx = {
  getStorageSync: () => '',
  setStorageSync: () => {},
  getFileSystemManager: () => ({ accessSync: () => true }),
  env: { USER_DATA_PATH: '/u' },
}
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '../..')
const read = (rel) => fs.readFileSync(path.join(ROOT, 'miniprogram', rel), 'utf8')
/* 静态判据一律先去注释：这一族的注释本来就要写"原来那里抄了一遍 `(750 * h) / w`"这种话，
   不去注释的话这条判据从写下那句解释的那天起就永远红（而永远红的判据等于没有判据）。 */
const 去注释 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const poster = require(path.join(ROOT, 'miniprogram/utils/poster.js'))
const bright = require(path.join(ROOT, 'miniprogram/utils/imgBrightness.js'))

let bad = 0
const ck = (name, cond, got) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${got === undefined ? '' : `　→ ${got}`}`)
  if (!cond) bad += 1
}

const BOX = poster.HEAD_IMG_H          // 全站那一枚 740
const MAX = poster.BAND_MAX_H
const SIDE = 32

/* 改之前那条公式，原样抄在这里当**对照**：1:4 以内每一档必须逐字相同，
   不然这一刀就不是"只挡超长图"，而是动了所有人今天看得见的取景。 */
const 旧公式 = (w, h, boxH) => {
  const byWidth = (750 * h) / w
  if (byWidth >= boxH) {
    const top = -Math.round((byWidth - boxH) * 0.15)
    return `width:750rpx;height:${Math.round(byWidth)}rpx;left:0;top:${top}rpx`
  }
  const bw = Math.round((boxH * w) / h)
  return `width:${bw}rpx;height:${boxH}rpx;left:${Math.round((750 - bw) / 2)}rpx;top:0`
}
const 高度 = (s) => Number(/height:(\d+)rpx/.exec(s)[1])
/** 画面那一只盒子覆盖到画布的第 a..b 行（画布是整张图压扁成的 32×32，与 imgBrightness 同一套）。 */
const 覆盖行 = (w, h) => {
  const g = poster.bandBox(w, h, BOX, poster.BG_ANCHOR)
  const a = Math.min(SIDE - 1, Math.floor(g.y0 * SIDE))
  const b = Math.min(SIDE, Math.max(a + 1, Math.ceil(g.y1 * SIDE)))
  return [a, b]
}
const 剖面 = (亮a, 亮b) => ({ w: 1, h: 1, rows: Array.from({ length: SIDE }, (_, r) => (r >= 亮a && r < 亮b ? 255 : 20)) })
const 判 = (prof) => bright.zoneLight(prof, { boxH: BOX, anchor: poster.BG_ANCHOR }, [0, 1])

console.log('———— ① 一屏到 1:4：取景一个字节都不许变 ————')
const 常规 = [[1080, 1080, '1:1'], [1080, 1440, '3:4'], [865, 1670, '站长那张黑白合影'],
  [1080, 1920, '9:16'], [1080, 2160, '1:2'], [1080, 3240, '1:3'], [1080, 4320, '1:4＝正好卡在封顶那一档']]
let 变了 = []
for (const [w, h, 名] of 常规) {
  const got = poster.bandGeom(w, h, BOX), want = 旧公式(w, h, BOX)
  if (got !== want) { 变了.push(名); console.log(`      ${名} ${w}x${h} 变了：${got} ≠ ${want}`) }
}
ck('常规那七档与旧公式逐字相同', 变了.length === 0, 变了.join('、') || `${常规.length} 档全同`)

console.log('\n———— ② 超长图：那只盒子不许再无限长 ————')
const 超长 = [[1080, 5400, '1:5'], [1080, 10800, '1:10'], [1080, 20000, '微信拼长图 1:18.5']]
for (const [w, h, 名] of 超长) {
  const hh = 高度(poster.bandGeom(w, h, BOX)), 自然 = Math.round((750 * h) / w)
  console.log(`      ${名} ${w}x${h}：自然 ${自然}rpx → 盒 ${hh}rpx`)
}
ck('三档超长图那只盒子都不超过 BAND_MAX_H', 超长.every(([w, h]) => 高度(poster.bandGeom(w, h, BOX)) <= MAX), `上限 ${MAX}rpx`)
ck('封顶那一枚是写明的常量，且真的进算式',
  /const BAND_MAX_H = \d+/.test(去注释(read('utils/poster.js'))) && /Math\.min\(natural, BAND_MAX_H\)/.test(去注释(read('utils/poster.js'))))
ck('封顶之后 1:18.5 那一档被压到正好那一枚上限', 高度(poster.bandGeom(1080, 20000, BOX)) === MAX)
ck('取景只往下移不往上顶（top ≤ 0，位移不超过一只盒子那一截）',
  超长.concat(常规).every(([w, h]) => { const g = poster.bandBox(w, h, BOX); return g.top <= 0 && -g.top <= g.byWidth - BOX }),
  超长.map(([w, h]) => poster.bandBox(w, h, BOX).top).join('/'))

console.log('\n———— ③ 采样读的那几行＝画面覆盖的那几行（行为判据）————')
const 三档 = [[1080, 1440], [1080, 4320], [1080, 20000]]
let 跟得上 = true, 漏 = []
for (const [w, h] of 三档) {
  const [a, b] = 覆盖行(w, h)
  // 正着量：只有盒子覆盖的那几行是亮的 ⇒ 必须判"浅"
  const p = 剖面(a, b); p.w = w; p.h = h
  if (判(p) !== true) { 跟得上 = false;漏.push(`${w}x${h} 亮带在覆盖行里却判成深`) }
  // 反着量：把亮带整块挪到覆盖行之外 ⇒ 必须判"深"。读错行的实现会在这里翻成"浅"。
  if (!(a === 0 && b === SIDE)) {
    const q = 剖面(0, SIDE); q.w = w; q.h = h
    for (let r = a; r < b; r += 1) q.rows[r] = 20      // 覆盖行改暗，其余全亮
    if (判(q) !== false) { 跟得上 = false; 漏.push(`${w}x${h} 覆盖行是暗的却判成浅`) }
  }
  console.log(`      ${w}x${h} → 画布第 ${a}..${b - 1} 行`)
}
ck('三档各正反量一次：采样确实跟着画面那只盒子走', 跟得上, 漏.join('；'))
ck('`utils/imgBrightness.js` 里不许再有第二份 `(750 * h) / w`',
  !/\(\s*750\s*\*\s*h\s*\)\s*\/\s*w/.test(去注释(read('utils/imgBrightness.js'))))
ck('它改成从 poster.bandBox 拿取景', /poster\.bandBox\(/.test(去注释(read('utils/imgBrightness.js'))))
ck('bandGeom 只是 bandBox 的排版输出，不自己重算一遍',
  /function bandGeom[\s\S]{0,400}?bandBox\(/.test(去注释(read('utils/poster.js')))
  && !/function bandGeom[\s\S]{0,400}?750\s*\*\s*h/.test(去注释(read('utils/poster.js'))))
ck('判不出尺寸时回 null，不许静默回"深底白字"',
  判(Object.assign(剖面(0, SIDE), { w: 0, h: 0 })) === null, String(判(Object.assign(剖面(0, SIDE), { w: 0, h: 0 }))))

console.log('\n———— 反向①：没封顶会长成什么样，拿上面照抄的旧公式当场算 ————')
// `bandBox` 是纯函数，"撤掉封顶"这件事旧公式那条式子就是它本身，不必往包里落一份变异体。
const 撤封顶 = 高度(旧公式(1080, 20000, BOX))
ck('撤掉封顶那一档就是 13889rpx 那种盒子（②量的东西真存在）', 撤封顶 > MAX, `${撤封顶}rpx`)

console.log('\n———— 反向②：采样那头改回自己抄一遍公式（真跑一份变异体）————')
// 这一把值得起一份临时文件：上面那两条静态判据只证明"文本变了"，
// 而这一刀真正要防的是"两处各写一遍之后会读出画面里没显示的那几行"——那只有把第二份真跑起来才量得到。
// 临时文件落在 `miniprogram/utils/` 里是因为变异体那句 `require('./poster')` 要能对上；
// 名字带 `.tmp`、跑完就删，且不在提交清单里（这个工作树还有第二支 agent 的未跟踪文件，别往里扫）。
const MUT = path.join(ROOT, 'miniprogram/utils/.变异-imgBrightness.tmp.js')
const ib = read('utils/imgBrightness.js')
const m2 = ib.replace('  const g = poster.bandBox(w, h, boxH, anchor)\n  if (!g) return null\n  return { x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1 }',
  '  const byWidth = (750 * h) / w\n  const y0 = ((byWidth - boxH) * anchor) / byWidth\n  return { x0: 0, x1: 1, y0, y1: y0 + boxH / byWidth }')
ck('抄回第二份时那两条"只有一处说法"立刻红（不红＝它们是假的）',
  m2 !== ib && /\(\s*750\s*\*\s*h\s*\)\s*\/\s*w/.test(去注释(m2)) && !/poster\.bandBox\(/.test(去注释(m2)))
try {
  fs.writeFileSync(MUT, m2)
  const second = require(MUT)
  const [a, b] = 覆盖行(1080, 20000)                 // 封顶之后画面实际覆盖的那几行
  // 把变异体那一份读的哪几行也印出来：文档里那句"第 4..6 行"要能指到这里的输出，不是我另算一遍。
  const 旧行 = (() => {
    const byWidth = (750 * 20000) / 1080
    const y0 = ((byWidth - BOX) * poster.BG_ANCHOR) / byWidth
    return [Math.floor(y0 * SIDE), Math.ceil((y0 + BOX / byWidth) * SIDE) - 1]
  })()
  const p = 剖面(a, b); p.w = 1080; p.h = 20000
  const 跟着画面 = 判(p)
  const 第二份 = second.zoneLight(Object.assign({}, p), { boxH: BOX, anchor: poster.BG_ANCHOR }, [0, 1])
  ck('1:18.5 那一档两读的判定**确实分家**（不分家＝③那两条量不到东西）',
    第二份 !== 跟着画面,
    `画面覆盖第 ${a}..${b - 1} 行 → ${String(跟着画面)}；第二份读第 ${旧行[0]}..${旧行[1]} 行 → ${String(第二份)}`)
} finally {
  fs.rmSync(MUT, { force: true })
  delete require.cache[MUT]
  ck('临时变异体删干净了（不许留在包里）', !fs.existsSync(MUT))
}

console.log(bad ? `\nFAIL ${bad} 条` : '\n全绿')
process.exit(bad ? 1 : 0)
