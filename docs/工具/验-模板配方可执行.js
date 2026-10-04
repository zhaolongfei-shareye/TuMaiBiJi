// P0-2 的尺子：配方解释器本身对不对，以及三份名单会不会各说各话。
//
// 为什么需要第二把尺子：验-模板配方等价.js 只说"画面没变"，它说不出
// "配方这条路到底有没有在跑""名单漏了一个字段会不会悄悄少画一层"。
// 所以这把尺子干两件事：
//   ① 从 poster.js 源码把 paintLayers 的 case 名和 ly.xxx 读回来，跟 RECIPE_OP_KEYS 对表——
//      加了绘制字段忘了名单，那正是"配方里写了也不生效"的那种坑；
//   ② 拿一份故意写坏的配方打解释器，逐条确认它红。每条都带"这条为什么必须红"。
// 跑法：node docs/工具/验-模板配方可执行.js
const fs = require('fs')
const path = require('path')
const poster = require('../../miniprogram/utils/poster.js')
const engine = require('../../miniprogram/utils/posterRecipe.js')
const RECIPES = require('../../miniprogram/utils/posterRecipes.js')

global.wx = {
  getStorageSync: () => ({ name: '阿飞', slogan: '每天读一点再走', template: 'quote', avatarPath: '' }),
  setStorageSync: () => {},
  getFileSystemManager: () => ({ accessSync: () => true }),
  env: { USER_DATA_PATH: '/u' },
}

let fontPx = 28
const charW = (c) => (c.codePointAt(0) > 0x2e80 ? fontPx : fontPx * 0.55)
const ctx = new Proxy({}, {
  get: (_, k) => {
    if (k === 'measureText') return (s) => ({ width: Array.from(String(s || '')).reduce((a, c) => a + charW(c), 0) })
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') return () => ({ addColorStop() {} })
    if (k === 'font') return ''
    return () => {}
  },
  set: (_, k, v) => {
    if (k === 'font') { const m = /(\d+(?:\.\d+)?)px/.exec(String(v)); if (m) fontPx = parseFloat(m[1]) }
    return true
  },
})

const note = { title: '测试标题', summary: '摘要一句', key_points: ['要点甲'], tags: ['甲'], category_id: 1, source_type: 'manual', created_at: '2026-09-24T06:00:00Z' }
const d = { note, profile: { name: '阿飞', slogan: '每天读一点再走' }, hasAvatar: false, lang: 'zh' }

const results = []
const ok = (name, pass, detail) => results.push([name, !!pass, detail || ''])

// ---------- ① 名单与绘制层对表（数字全从源码现读，抄在尺子里就会走偏）----------
const SRC = fs.readFileSync(path.join(__dirname, '../../miniprogram/utils/poster.js'), 'utf8')
function region(from, to) {
  const i = SRC.indexOf(from)
  if (i < 0) throw new Error(`源码里没找到 ${from}`)
  const j = SRC.indexOf(to, i)
  if (j < 0) throw new Error(`${from} 之后没找到 ${to}`)
  return SRC.slice(i, j)
}
const painted = region('function paintLayers(', '// 正方形原图塞进任意比例的块里')
const caseNames = [...painted.matchAll(/case '([a-zA-Z]+)':/g)].map((m) => m[1])
const listed = Object.keys(poster.RECIPE_OP_KEYS)
ok('十种绘制 op：paintLayers 的 case 与名单一模一样',
  caseNames.length === listed.length && caseNames.every((c) => listed.indexOf(c) >= 0),
  `case ${caseNames.join(',')} | 名单 ${listed.join(',')}`)

// buildRecipeLayer 是"名字 → L.xxx"那层转换，它的 case 漏一个就是名单里有、跑起来却抛错
const builder = region('function buildRecipeLayer(', '// L2 原语')
const builtCases = [...builder.matchAll(/case '([a-zA-Z]+)':/g)].map((m) => m[1])
const builderDefault = /default: return L\.avatar/.test(builder)
ok('buildRecipeLayer 把每一种 op 都接住了（含走 default 的 avatar）',
  listed.every((c) => builtCases.indexOf(c) >= 0 || (c === 'avatar' && builderDefault)),
  `接住 ${builtCases.join(',')}，avatar 走 default：${builderDefault}`)

// 全文里绘制层真读过的字段，一个都不许落在名单外——漏了就是"配方写了也没用"。
// `xxx` 是从注释里那句"ly.xxx"读出来的（本文件自己就写了这么一行说明），不是真代码。
const usedFields = [...new Set([...SRC.matchAll(/\bly\.([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]))]
  .filter((f) => f !== 'k' && f !== 'xxx')
const allowed = [...new Set(listed.reduce((acc, k) => acc.concat(poster.RECIPE_OP_KEYS[k]), []))]
const stray = usedFields.filter((f) => allowed.indexOf(f) < 0)
ok('画布真读的每一个 ly.xxx 都在 op 字段名单里', stray.length === 0, `名单外：${stray.join(',') || '无'}`)
// 上面那条不能是空过：抽查三个只可能从真代码里读出来的字段名（各属于一种 op）。
ok('这条读字段确实读到了东西（shadowBlur/fadeFrom/vpunct 三个都在读回来的集合里）',
  ['shadowBlur', 'fadeFrom', 'vpunct'].every((f) => usedFields.indexOf(f) >= 0),
  `读到 ${usedFields.length} 个字段`)

// 两张 op 表（全字段 / 哪些进可选项参数）不能各说各话
const optMismatch = listed.filter((k) => (poster.RECIPE_OPT_KEYS[k] || []).some((f) => poster.RECIPE_OP_KEYS[k].indexOf(f) < 0))
ok('RECIPE_OPT_KEYS 里没有 RECIPE_OP_KEYS 之外的字段', optMismatch.length === 0, `对不上：${optMismatch.join(',') || '无'}`)

// 走配方的那几套：两边（名字表 / 内容表）不多不少
const declared = poster.RECIPE_IDS.slice().sort()
const present = Object.keys(RECIPES).sort()
ok('RECIPE_IDS 与 posterRecipes.js 的键完全对齐', JSON.stringify(declared) === JSON.stringify(present),
  `名单 ${declared.join(',') || '空'} | 内容 ${present.join(',') || '空'}`)
const plannerIds = [...region('const PLANNERS = {', '// 已经转写成配方的那几套')
  .matchAll(/([a-zA-Z]+): plan([A-Z][a-zA-Z]+)/g)].map((m) => m[1])
ok('走配方的那几套仍然留在 PLANNERS 里（P0-3 才一份份删）',
  declared.every((id) => plannerIds.indexOf(id) >= 0), `PLANNERS: ${plannerIds.join(',')}`)
const templateIds = poster.TEMPLATES.map((t) => t.id)
ok('TEMPLATES 的 id 与 PLANNERS 一一对应', templateIds.length === plannerIds.length && templateIds.every((id) => plannerIds.indexOf(id) >= 0),
  `模板 ${templateIds.join(',')} | planner ${plannerIds.join(',')}`)

// ---------- ② 解释器得能量出错：每条都用一份改坏的配方打它 ----------
const deep = (o) => JSON.parse(JSON.stringify(o))
const quoteRecipe = () => deep(RECIPES.quote)
const validateIt = (r) => engine.validate(r, { opKeys: poster.RECIPE_OP_KEYS, primKeys: Object.keys(poster.RECIPE_PRIMS).reduce((m, n) => { m[n] = poster.RECIPE_PRIMS[n].keys; return m }, {}) })

// 先钉"配方这条路真的在跑"：同一篇笔记，直接跑配方 == 走 planPoster(strict) 的结果
const direct = poster.planFromRecipe(ctx, d, quoteRecipe())
const throughEntry = poster.planPoster(ctx, note, 'quote', d.profile, 'zh', { showQr: true, strict: true })
ok('quote 走的是解释器不是 JS planner（同一篇笔记两条路同高同层）',
  direct.layers.length > 0 && direct.height === throughEntry.height && direct.layers.length === throughEntry.layers.length,
  `${direct.layers.length} 层 / 高 ${direct.height}`)

// 改一个数，结果必须跟着动——否则"跑起来了"可能只是查表
const bumped = quoteRecipe()
bumped.steps[2] = { let: 'pad', value: 70 }
const moved = poster.planFromRecipe(ctx, d, bumped)
ok('配方里改一个数（pad 52→70）成品高度真的变了', moved.height !== direct.height && moved.layers.length === direct.layers.length,
  `${direct.height} → ${moved.height}`)

const throws = (fn) => { try { fn(); return false } catch (e) { return e } }
// staticToo=false：变量名对不对这种事静态查不出来（要跑过才知道有没有算出来），
// 那类只钉"跑的时候抛"，其余一律两条都钉。
const strictRejects = (mutate, name, staticToo) => {
  const r = quoteRecipe()
  mutate(r)
  const errs = validateIt(r)
  const caught = throws(() => poster.planFromRecipe(ctx, d, r))
  ok(name, !!caught && (staticToo === false || errs.length > 0), errs[0] || (caught && caught.message) || '')
}

strictRejects((r) => { r.steps.find((s) => s.emit && s.emit.k === 'fill').emit.k = 'squircle' }, '未知绘制 op：静态检查报出来、跑的时候抛')
strictRejects((r) => { r.steps.find((s) => s.emit && s.emit.k === 'fill').emit.shadowBlur = 10 }, 'op 里没有的字段（fill 不能带 shadowBlur）报出来')
strictRejects((r) => { r.steps[0] = { let: 'x', value: { prim: 'doSomethingEvil', args: {} } } }, '名单外的原语报出来')
strictRejects((r) => { r.steps[0] = { let: 'x', value: { pow: [{ var: 'W' }, 2] } } }, '名单外的算子报出来')
strictRejects((r) => { r.steps[0] = { let: 'x', value: { '+': [] } } }, '空的变长算子（{"+":[]} 会算成 0）报出来')
strictRejects((r) => { r.steps[0] = { let: 'x', value: { var: 'notThere.yet' } } }, '还没算出来的变量：跑的时候抛', false)
strictRejects((r) => { r.steps.forEach((s) => { if (s.let === 'height') s.let = 'h' }) }, '没有 let height 这一步就报（画布高度只许这一处说）')
strictRejects((r) => { r.min_version = 99 }, '配方要的解释器版本比这台客户端新 → 报')

// 死分支里藏错误：这一篇笔记不走 else，但静态检查必须照样抓到
strictRejects((r) => {
  r.steps.push({ if: { cond: { truthy: 0 }, then: [{ let: 'noop', value: 1 }], else: [{ emit: { k: 'nope', x: 0 } }] } })
}, 'if 的 else 分支（这条笔记走不到）里藏未知 op，静态检查照样红')

// 不许顺着原型链摸到函数：那是"数据"往"代码"跑的那道缝
const proto = throws(() => poster.planFromRecipe(ctx, d, {
  id: 'p', min_version: 1, steps: [{ let: 'height', value: { var: 'note.constructor' } }],
}))
const globalVar = throws(() => poster.planFromRecipe(ctx, d, {
  id: 'g', min_version: 1, steps: [{ let: 'height', value: { var: 'globalThis' } }],
}))
ok('配方摸不到原型链与全局对象（constructor 读成 null、globalThis 直接抛）',
  !!proto && !!globalVar, `${proto && proto.message} | ${globalVar && globalVar.message}`)

// 线上那一路：坏了不许抛，要退回 JS 那份，卡片不能画不出来。
// 这里只把包内那份换成写坏的，跑完立刻换回原对象——不然下一条会因为"配方已经好了"而假绿。
const originalQuote = RECIPES.quote
let lenient
try {
  const broken = deep(originalQuote)
  broken.steps.find((s) => s.emit && s.emit.k === 'fill').emit.k = 'squircle'
  RECIPES.quote = broken
  lenient = poster.planPoster(ctx, note, 'quote', d.profile, 'zh', { showQr: true })
} catch (e) {
  lenient = { error: e.message }
} finally {
  RECIPES.quote = originalQuote
}
ok('坏配方在线上这一路不抛：回退到 JS 那份 planner，照样出一张卡',
  !!lenient && !lenient.error && lenient.layers.length > 0 && lenient.height > 300,
  (lenient && lenient.error) || (lenient && `${lenient.layers.length} 层 / 高 ${lenient.height}`))
ok('换回来之后包内那份配方又是好的（这条是给上一条兜底的，防止改坏没还原）',
  validateIt(RECIPES.quote).length === 0, validateIt(RECIPES.quote)[0] || '')

// 步型覆盖：quote 没碰到的 emitOne / each / lit，用一份合成配方打一遍
const synth = {
  id: 'synth',
  min_version: 1,
  steps: [
    { let: 'height', value: 400 },
    { emit: { k: 'radial', x: 100, y: 100, r0: 0, r1: 90, c1: '#fff', c2: '#000', box: { lit: [0, 0, 200, 200] } } },
    { emitOne: { prim: 'glyphPlate', args: { x: 10, y: 10, w: 60, h: 60, color: '#000' } } },
    { each: { over: { lit: [1, 2, 3] }, as: 'i', do: [{ emit: { k: 'circle', x: 20, y: { '*': [{ var: 'i' }, 40] }, r: 6, fill: '#fff' } }] } },
    { do: { prim: 'setFont', args: { size: 30, bold: true } } },
    { emit: { k: 'text', x: 20, y: 300, lines: [{ prim: 'i18n', args: { key: 'scanToView' } }], size: 30 } },
  ],
}
let synthPlan = null
const synthErr = throws(() => { synthPlan = poster.planFromRecipe(ctx, d, synth) })
const kinds = synthPlan ? synthPlan.layers.map((l) => l.k) : []
ok('emitOne / each / lit / do 这几种步型都跑得通（合成配方 6 层）',
  !synthErr && kinds.join(',') === 'radial,text,circle,circle,circle,text',
  synthErr ? synthErr.message : kinds.join(','))
ok('glyphPlate 交回来的是带品牌字的一层文字',
  !!synthPlan && synthPlan.layers[1].lines[0] === poster.BRAND_GLYPH,
  synthPlan && JSON.stringify(synthPlan.layers[1].lines))
ok('each 里那个 index 前的乘算真按元素走（三枚圆 40/80/120）',
  !!synthPlan && [synthPlan.layers[2].y, synthPlan.layers[3].y, synthPlan.layers[4].y].join(',') === '40,80,120',
  synthPlan && [synthPlan.layers[2].y, synthPlan.layers[3].y, synthPlan.layers[4].y].join(','))

// emitOne/emitMany 交回来的层不经过 buildRecipeLayer，所以字段名单要在这里再查一遍：
// 否则一份坏配方可以拿 {lit:{k:'fill',…,随便一个键:1}} 绕开名单夹带字段，而那些键画的时候会被静默吃掉。
const smuggle = {
  id: 'smuggle', min_version: 1,
  steps: [{ let: 'height', value: 300 }, { emitOne: { lit: { k: 'fill', x: 0, y: 0, w: 10, h: 10, color: '#000', bogus: 1 } } }],
}
ok('emitOne 用 lit 夹带一个名单外的字段：抛（不给"画的时候忽略掉"那条宽容路）',
  !!throws(() => poster.planFromRecipe(ctx, d, smuggle)), '居然放行了')
const smuggleOk = {
  id: 'smuggle-ok', min_version: 1,
  steps: [{ let: 'height', value: 300 }, { emitOne: { lit: { k: 'fill', x: 0, y: 0, w: 10, h: 10, color: '#000' } } }],
}
ok('同一份去掉那个野字段就放行（证明上面那条红是字段名单抓的，不是 emitOne 本身不通）',
  !throws(() => poster.planFromRecipe(ctx, d, smuggleOk)), '好的也被拦了')
// obj 是新加的项型（渐变色标那种 [{at,color}]）：形状写错要在静态检查就红，而不是跑起来才知道
const gradStep = (stops) => ({
  id: 'x', min_version: 1,
  steps: [{ let: 'height', value: 300 }, { emit: { k: 'grad', x: 0, y: 0, w: 10, h: 10, c1: '#fff', c2: '#000', stops } }],
})
ok('obj 给的是数组而不是键值对象 → validate 红',
  validateIt(gradStep([{ obj: [0, 1] }])).length > 0, '居然放行了')
// 这条是关键：obj 的键值必须也当表达式走一遍名单，否则一个不认的算子藏在色标里就能混过静态检查
ok('obj 的值里藏一个不认的算子 → validate 红（不是"跳过不查"）',
  validateIt(gradStep([{ obj: { at: 0, color: { 不存在的算子: 1 } } }])).length > 0, '居然放行了')
ok('obj 里的值可以现算（色标那一档混色真的落到图层里）',
  (() => {
    const p = poster.planFromRecipe(ctx, d, {
      id: 'x', min_version: 1,
      steps: [
        { let: 'height', value: 300 },
        { let: 's', value: { prim: 'scheme', args: { name: 'neon', categoryId: 1 } } },
        { emit: { k: 'grad', x: 0, y: 0, w: 10, h: 10, c1: { var: 's.c1' }, c2: { var: 's.c2' }, stops: [{ obj: { at: 0.5, color: { prim: 'mix', args: { c1: { var: 's.c1' }, c2: { var: 's.c2' }, w: 0.5 } } } }] } },
      ],
    })
    const st = p.layers[0].stops
    return Array.isArray(st) && st.length === 1 && st[0].at === 0.5 && typeof st[0].color === 'string' && st[0].color !== '{'
  })(), '')

// 十套模板 × 六条笔记里凡是走配方的那几套，逐套都要能出图（不许有哪一篇跑不出来）
const sampleNotes = [
  { title: '测试', summary: '人性就是这么现实啊。你', key_points: [], tags: [], category_id: null, source_type: 'manual', created_at: '2026-09-24T06:00:00Z' },
  { title: '', summary: null, key_points: null, tags: null, category_id: 3, source_type: 'screenshot', created_at: '2026-09-24T06:00:00Z' },
  { title: 'WAICFuture 2026 微信小程序开发大赛全球启动', summary: 'The quick brown fox jumps over the lazy dog.', key_points: ['甲', '乙'], tags: ['甲'], category_id: 1, source_type: 'web_article', created_at: '2026-09-24T06:00:00Z' },
]
const outOfRange = []
for (const id of poster.RECIPE_IDS) {
  for (let i = 0; i < sampleNotes.length; i++) {
    for (const lang of ['zh', 'en']) {
      for (const showQr of [true, false]) {
        const e = throws(() => poster.planPoster(ctx, sampleNotes[i], id, d.profile, lang, { showQr, strict: true }))
        if (e) outOfRange.push(`${id}/${i}/${lang}/${showQr ? 'qr' : 'noqr'}：${e.message}`)
      }
    }
  }
}
ok(`走配方的那几套 × 空笔记/长英文 × 中英 × 码开关全跑通（${poster.RECIPE_IDS.length * 12} 组）`,
  outOfRange.length === 0, outOfRange.slice(0, 2).join(' | '))

let n = 0
for (const [name, pass, detail] of results) {
  console.log(`${pass ? '✓' : '✗'} ${name}${pass || !detail ? '' : `　→ ${detail}`}`)
  if (!pass) n++
}
console.log(`${results.length} 条，红 ${n} 条`)
process.exit(n ? 1 : 0)
