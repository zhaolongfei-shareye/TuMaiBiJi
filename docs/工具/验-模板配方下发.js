// P0-5 的尺子：下发那一路——拉来的一批能不能整套盖掉包内那份、坏的一套是不是整套丢、
// 撤回的那套是不是真的消失、缓存里存的是哪几条，以及最要紧的那条：
// 任何一条失败路径都不许把「生成笔记卡片」压死。
//
// 为什么不能只靠前面那两把：
//   验-模板配方等价.js 说"配方和 JS 画出来一样"，但它一辈子只吃包内那十套；
//   验-模板配方可执行.js 说"解释器认这份名单"，但它没管"服务端递过来的一整批"长什么样。
//   中间这一段（整批 → 逐条判定 → 合并 → 缓存 → 回退）是新的，而且它的失败**全是静默的**：
//   少一套、脏一套、版本门槛挡住一套，画面都不会报错，只会悄悄用回包内那份——
//   站长就会以为新模板生效了。所以这一把每一条脏行都配一条"把那个错拿掉就该收进来"。
//
// 跑法：node docs/工具/验-模板配方下发.js
const crypto = require('crypto')

// 存储要真存：这一把有一半在测缓存（写进去哪几条、读回来什么、读回来坏了怎么办）。
// 真机里"键不存在"时 getStorageSync 回空串而不是 undefined，替身照这个来。
const store = {}
global.wx = {
  getStorageSync: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: (k) => { delete store[k] },
  getFileSystemManager: () => ({ accessSync: () => true }),
  env: { USER_DATA_PATH: '/u' },
}

const poster = require('../../miniprogram/utils/poster.js')
const pt = require('../../miniprogram/utils/posterTemplates.js')
const RECIPES = require('../../miniprogram/utils/posterRecipes.js')

// 只记账的画布替身：量字按"汉字一个全宽、其他 0.55 宽"估，够几何自洽就行。
let fontPx = 28
const charW = (c) => (c.codePointAt(0) > 0x2e80 ? fontPx : fontPx * 0.55)
const newCtx = () => {
  const f = () => {}
  return new Proxy({}, {
    get: (_, k) => {
      if (k === 'measureText') return (s) => ({ width: Array.from(String(s || '')).reduce((a, c) => a + charW(c), 0) })
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') return () => ({ addColorStop: f })
      if (k === 'font') return ''
      return f
    },
    set: (_, k, v) => {
      if (k === 'font') { const m = /(\d+(?:\.\d+)?)px/.exec(String(v)); if (m) fontPx = parseFloat(m[1]) }
      return true
    },
  })
}

const NOTES = [
  { title: '测试标题', summary: '摘要一句', key_points: ['要点甲'], tags: ['甲'], category_id: 1, source_type: 'manual', created_at: '2026-09-24T06:00:00Z' },
  { title: 'A rather long English heading to force wrapping and shrinking', summary: 'One line of summary, a few words.', key_points: ['Point one', 'Point two'], tags: ['Read'], category_id: 2, source_type: 'link', created_at: '2026-09-24T06:00:00Z' },
]
const PROFILE = { name: '阿飞', slogan: '每天读一点再走' }

// 图层清单指纹：按键名排序规范化（与那把等价尺子同一条口径——键序对画面没有影响，
// 但少一个字段、改一个数、换个顺序都必须看得见）。
const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`
  if (typeof v === 'number') return String(Math.round(v * 1000) / 1000)
  return JSON.stringify(v)
}
// 十套 × 两条笔记 × 中英 × 码开关 = 40 组一屏跑完，够抓"整套覆盖却换了一种画法"。
const matrix = (id) => NOTES.flatMap((n) => ['zh', 'en'].flatMap((lang) => [true, false].map((showQr) => {
  const plan = poster.planPoster(newCtx(), n, id, PROFILE, lang, { showQr })
  return crypto.createHash('sha256').update(canon({ width: plan.width, height: plan.height, layers: plan.layers })).digest('hex').slice(0, 16)
})))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const results = []
const ok = (name, pass, detail) => results.push([name, !!pass, detail || ''])

// 一份"像服务端会发的那种"的行：字段名跟着接口那侧走（template_id / group_key / label_en / min_app_version）。
const rowOf = (id, over) => {
  const t = poster.TEMPLATES.find((x) => x.id === id) || { id, label: id, labelEn: id, group: 'bold' }
  return Object.assign({
    template_id: t.id, label: t.label, label_en: t.labelEn, group_key: t.group,
    sort_order: 100, min_app_version: '1.0.0', content_hash: `h-${t.id}`, recipe: RECIPES[t.id],
  }, over || {})
}
const ALL = poster.TEMPLATES.map((t, i) => rowOf(t.id, { sort_order: (i + 1) * 10 }))
const clearRemote = () => poster.applyRemoteTemplates([])

async function main() {
  // ---------- ① 什么都没下发的时候 ----------
  clearRemote()
  ok('没下发时十套来源都是"包内配方"，列表就是包内那十项',
    poster.TEMPLATES.every((t) => poster.recipeSource(t.id) === 'bundled') && poster.templateList().length === 10,
    poster.TEMPLATES.map((t) => `${t.id}:${poster.recipeSource(t.id)}`).join(' '))
  const before = {}
  poster.TEMPLATES.forEach((t) => { before[t.id] = matrix(t.id) })

  // ---------- ② 整套覆盖不许带来任何差异（这一批的核心承诺） ----------
  const rep2 = poster.applyRemoteTemplates(ALL)
  ok(`下发这十套：十条全收（${rep2.accepted}）`, rep2.accepted === 10 && rep2.rejected.length === 0, rep2.rejected.slice(0, 2).join(' | '))
  ok('收下之后来源改成"下发"（P0-6 那条运行时反证就靠这个口子）',
    poster.TEMPLATES.every((t) => poster.recipeSource(t.id) === 'remote'))
  const drift = poster.TEMPLATES.filter((t) => !same(before[t.id], matrix(t.id)))
  ok('覆盖前后各 8 组图层清单逐套一致（下发这一路没换成另一种画法）', drift.length === 0, drift.map((t) => t.id).join('、'))

  // ---------- ③ 改一个数，不重启就该看得见（这条同时是上面那条的反证） ----------
  const bump = (recipe) => {
    const copy = JSON.parse(JSON.stringify(recipe))
    const step = copy.steps.find((s) => s.emit && s.emit.k === 'fill')
    if (!step) throw new Error('这份配方里没有 fill 那一步，探针得换一个字段')
    step.emit.x = { lit: 10 }
    return copy
  }
  poster.applyRemoteTemplates(ALL.map((r) => (r.template_id === 'quote' ? rowOf('quote', { recipe: bump(RECIPES.quote), content_hash: 'h-quote-v2' }) : r)))
  ok('把下发那一套的一个坐标改成 10 → 清单立刻跟着变（不用重启）', !same(before.quote, matrix('quote')))
  poster.applyRemoteTemplates(ALL)
  ok('改回来之后又与包内那套逐组一致（证明上面那条红是那个数带来的）', same(before.quote, matrix('quote')))

  // ---------- ④ 脏行：整套丢，不许画半张 ----------
  const dirtyCases = [
    ['未知 op', rowOf('quote', { recipe: { id: 'quote', min_version: 1, steps: [{ let: 'height', value: 1200 }, { emit: { k: 'nope', x: 0 } }] } })],
    ['未知原语', rowOf('quote', { recipe: { id: 'quote', min_version: 1, steps: [{ let: 'height', value: { prim: 'noSuchPrim', args: {} } }] } })],
    ['超字节', rowOf('quote', { recipe: { id: 'quote', min_version: 1, steps: [{ let: 'height', value: 1200 }, { do: { lit: new Array(17000).join('x') } }] } })],
    ['没有 let height', rowOf('quote', { recipe: { id: 'quote', min_version: 1, steps: [{ emit: { k: 'fill', x: { lit: 0 }, y: { lit: 0 }, w: { lit: 750 }, h: { lit: 1200 }, fill: { lit: 'paper' } } }] } })],
    ['解释器版本太新', rowOf('quote', { recipe: { id: 'quote', min_version: 99, steps: [{ let: 'height', value: 1200 }] } })],
    ['包版本门槛太高', rowOf('quote', { min_app_version: '9.9.9' })],
    ['分组不在名单', rowOf('quote', { group_key: 'fancy' })],
    ['少了名字', rowOf('quote', { label: '' })],
    ['recipe 不是对象', rowOf('quote', { recipe: 'quote' })],
    ['行不是对象', null],
    // 名字对、内容不对：这一行的 id 是 quote，配方里写的却是 card 的 id。
    // 它的对照组就是下面第⑥段——把 id 改成一致的第 11 套就该收进来。
    ['配方 id 与这行不符', rowOf('quote', { recipe: Object.assign({}, RECIPES.card, { id: 'card' }) })],
  ]
  const dirtyDetail = []
  dirtyCases.forEach(([name, row]) => {
    const rep = poster.applyRemoteTemplates(ALL.map((r) => (r.template_id === 'quote' ? row : r)))
    const onlyThat = rep.rejected.length === 1 && rep.accepted === 9
    const backInside = poster.recipeSource('quote') === 'bundled'
    const othersIntact = poster.recipeSource('card') === 'remote'
    const sameAsInside = same(before.quote, matrix('quote'))
    if (!(onlyThat && backInside && othersIntact && sameAsInside)) {
      dirtyDetail.push(`${name}：只丢那一条=${onlyThat}（${JSON.stringify(rep.rejected).slice(0, 50)}）回到包内=${backInside} 别的不受牵连=${othersIntact} 画面与包内一致=${sameAsInside}`)
    }
  })
  ok(`${dirtyCases.length} 种脏行各丢整套：那一套回包内、其余九套照用、画面与包内逐组一致`, dirtyDetail.length === 0, dirtyDetail.join(' | '))
  poster.applyRemoteTemplates(ALL)
  ok('反证：同样的十行（不带那些错）十条全收', poster.applyRemoteTemplates(ALL).accepted === 10)

  // ---------- ⑤ 服务端撤一套＝本地那套当场消失 ----------
  poster.applyRemoteTemplates(ALL.filter((r) => r.template_id !== 'quote'))
  ok('下发里少了那一套（改 status＝撤回）→ 列表还是十项、那一套来源回包内、别的照用',
    poster.templateList().length === 10 && poster.recipeSource('quote') === 'bundled' && poster.recipeSource('card') === 'remote',
    `quote=${poster.recipeSource('quote')} card=${poster.recipeSource('card')}`)

  // ---------- ⑥ 第 11 套：新 id 要出现在列表里，也得真能出图 ----------
  // 拿 quote 那份配方改个 id 当"第 11 套"——这是这一批唯一能真跑的假想新模板（P1 才写真的）。
  const eleventh = Object.assign({}, RECIPES.quote, { id: 'extra' })
  poster.applyRemoteTemplates(ALL.concat([rowOf('extra', { recipe: eleventh, label: '新添一套', label_en: 'Extra', group_key: 'bold', sort_order: 110, content_hash: 'h-extra' })]))
  const boldN = poster.templateList().filter((x) => x.group === 'bold').length
  ok('新 id 进列表：十一项、个性款那一组从 6 变 7（分组那个数字跟着合并后的列表走）',
    poster.templateList().length === 11 && boldN === 7, `${poster.templateList().length} 项 / 个性款 ${boldN}`)
  const extraPlan = poster.planPoster(newCtx(), NOTES[0], 'extra', PROFILE, 'zh', {})
  ok('新 id 真能出图（planPoster 没把它当"不认识的模板"退回默认那套）',
    extraPlan.template === 'extra' && extraPlan.layers.length > 0, `template=${extraPlan.template} 层数=${extraPlan.layers.length}`)
  ok('新那一套画的与包内 quote 逐组一致（它此刻吃的就是 quote 那份配方）', same(matrix('extra'), before.quote))
  const fallback = poster.planPoster(newCtx(), NOTES[0], 'no_such_template', PROFILE, 'zh', {})
  ok('真·不认识的 id 退回默认那一套，不是一张空白', fallback.template === poster.DEFAULT_TEMPLATE && fallback.layers.length > 0)

  // ---------- ⑦ 缓存：只写合格那几条；读回来坏了也不抛 ----------
  clearRemote()
  const halfDirty = ALL.map((r) => (r.template_id === 'quote' ? rowOf('quote', { recipe: { id: 'quote', min_version: 1, steps: [{ emit: { k: 'nope' } }] } }) : r))
  await pt.refresh(() => halfDirty)
  const cached = store[pt.STORE_KEY]
  ok('缓存里只留合格那九条（脏的那条不进机器，免得每次冷启动重踩一遍）',
    cached && Array.isArray(cached.rows) && cached.rows.length === 9 && !cached.rows.some((r) => r.template_id === 'quote'),
    cached && `${cached.rows.length} 条`)
  clearRemote()
  const r1 = pt.restore()
  ok('冷启动 restore 把缓存那九条端回来，来源标成"下发"',
    r1.accepted === 9 && r1.cached === true && poster.recipeSource('card') === 'remote' && poster.recipeSource('quote') === 'bundled',
    JSON.stringify(r1))
  store[pt.STORE_KEY] = '不是数组也没关系'
  const r2 = pt.restore()
  // 只钉"不抛、当这批没有"。不清掉内存里那一套是有意的：能读到坏缓存的时机只有冷启动，
  // 而冷启动时内存本来就是空的（这里的 REMOTE 是上面几步留下的，真机走不到这个状态）。
  ok('缓存被写成奇怪的东西：restore 不抛、当"这批没有"', r2.accepted === 0 && r2.cached === false, JSON.stringify(r2))
  delete store[pt.STORE_KEY]
  ok('缓存压根没有：restore 也不抛，十套照旧走包内', pt.restore().accepted === 0 && poster.templateList().length === 10)

  // ---------- ⑧ 拉取那条路失败时，上一批得留着 ----------
  store[pt.STORE_KEY] = { rows: ALL, sig: 'seed' }
  pt.restore()
  const keepSig = poster.remoteSignature()
  const e1 = await pt.refresh(() => { throw new Error('404（现网那张表还没建，真就是这个）') })
  ok('接口报错：refresh 不 reject，只回一份报告', e1.error === true && e1.accepted === 0, JSON.stringify(e1))
  ok('接口报错之后上一批还在用（不是"拉失败就没模板了"）',
    poster.remoteSignature() === keepSig && poster.recipeSource('card') === 'remote')
  const e2 = await pt.refresh(() => ({ rows: '这形状根本不对' }))
  ok('返回一个不是数组的东西：整批判脏、一条不收，上一批不受影响',
    e2.accepted === 0 && e2.rejected.length === 1 && poster.recipeSource('card') === 'remote', JSON.stringify(e2))
  await pt.refresh(() => [])
  ok('服务端回空数组（十套全收成 archived）→ 本地清空、全部回包内',
    poster.templateList().length === 10 && poster.TEMPLATES.every((t) => poster.recipeSource(t.id) === 'bundled'))
  await pt.refresh(() => ALL)
  ok('再拉一次同一批：签名与第一次一模一样（界面据此不重画那十格小样）', poster.remoteSignature() === keepSig)

  // ---------- ⑨ 名单拦不住、只能靠回退的那种 ----------
  // `{var:'从没 let 出来的名字'}` 静态查不出毛病（它就是个合法字符串），跑起来才抛——
  // 这正是"validate 全过但这一篇笔记就是画不出来"那类，只能靠 planPoster 那道 try 兜。
  const runtimeBad = ALL.map((r) => rowOf(r.template_id, {
    content_hash: `rb-${r.template_id}`,
    recipe: { id: r.template_id, min_version: 1, steps: [{ let: 'height', value: 1200 }, { do: { var: 'no_such_var' } }] },
  }))
  poster.applyRemoteTemplates(runtimeBad)
  ok('这一种静态名单挑不出错，十条照样全收（红就说明闸门把它当脏的了）',
    poster.recipeSource('acid') === 'remote' && poster.remoteSignature().indexOf('rb-acid') >= 0, poster.recipeSource('acid'))
  const lenient = poster.planPoster(newCtx(), NOTES[0], 'acid', PROFILE, 'zh', {})
  ok('跑起来才抛的那种：线上这一路不抛、照样出一张完整卡（回退到 JS 那份 planner）',
    lenient.layers.length > 0 && lenient.height > 0, `${lenient.layers.length} 层 / 高 ${lenient.height}`)
  ok('回退出来的那张与包内那套逐组一致（回退不是"少画一层"）', same(before.acid, matrix('acid')))
  let threw = ''
  try { poster.planPoster(newCtx(), NOTES[0], 'acid', PROFILE, 'zh', { strict: true }) } catch (e) { threw = e.message }
  ok('同一份在尺子那一路（strict）必须抛——少了这道区分，坏配方会一路用 JS 分支而基线照样全绿',
    threw.length > 0, threw.slice(0, 70))

  let n = 0
  for (const [name, pass, detail] of results) {
    console.log(`${pass ? '✓' : '✗'} ${name}${pass || !detail ? '' : `　→ ${detail}`}`)
    if (!pass) n++
  }
  console.log(`${results.length} 条，红 ${n} 条`)
  process.exit(n ? 1 : 0)
}

main().catch((e) => { console.error('尺子自己炸了：', e && e.stack || e); process.exit(1) })
