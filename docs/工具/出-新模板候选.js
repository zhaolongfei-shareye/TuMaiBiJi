// P1：只用包内已有的十种绘制 op + 那份原语名单，现场拼两套**全新**的卡片模板，各出一张成品图。
//
// 要证的是一句话：加一套新花样＝服务端多一条数据，产品代码一行不用改。
// 所以这一趟不动 poster.js、不新增 JS planner、不出包、不部署；
// 两份新配方以纯 JSON 落进 docs/design/新模板候选/，由 wx.request 替身冒充"服务端"下发，
// 再走真运行时（分享页那一排真点）出 750 宽的成品 PNG。
//
// 两道关，顺序不能倒：
//   第 0 关在 node 里跑（几秒钟）：静态名单 + strict 规划 + 版面不溢出画布。
//     让模拟器去报"名单里有野字段"，回来的是一串克隆失败的错，看不出病名。
//   第 1 关在模拟器里跑：下发到客户端 → 十二格 → 真点新格子 → 真成品图。
// 跑法：bash docs/工具/跑尺子.sh 9431 出-新模板候选
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const poster = require(path.resolve(__dirname, '../../miniprogram/utils/poster.js'))
const engine = require(path.resolve(__dirname, '../../miniprogram/utils/posterRecipe.js'))
const pt = require(path.resolve(__dirname, '../../miniprogram/utils/posterTemplates.js'))

const PORT = process.env.MP_PORT || 9431
const OUT = path.resolve(__dirname, '../design/新模板候选')
const SANDBOX = path.join(process.env.HOME, 'Library/Application Support/微信开发者工具')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

// ---------------------------------------------------------------- 配方的写法（就是数据）
// 这三种骨架和包内那十份一模一样：{var:路径} 取数、{prim:名字,args} 叫原语、裸值是字面量。
const V = (p) => ({ var: p })
const P = (name, args) => ({ prim: name, args: args || {} })
const add = (...a) => ({ '+': a })
const sub = (...a) => ({ '-': a })
const mul = (...a) => ({ '*': a })
const div = (a, b) => ({ '/': [a, b] })
const len = (a) => ({ len: a })
const mx = (...a) => ({ max: a })
const IF = (cond, then, els) => ({ if: [cond, then, els] })
const truthy = (v) => ({ truthy: v })
const tok = (name) => P('token', { name })

// ---------------------------------------------------------------- 候选 A：色带横幅 band
// 整条顶部色块（波普那族配色，跟随分类）里装眉标与大标题，色块下沿压一条强调色硬边；
// 下面纸面是摘要 + 编号要点（圆片用强调色）；底排署名 + 码贴纸。
// 与已有十套的差别：叠翠是"上浅下白两张纸"、杂志封面是刊头排版，这一套是**一块到底的实心色**
// 把标题包住，标题坐在色里而不是浮在白纸上。
const BAND = {
  id: 'band',
  min_version: 1,
  steps: [
    { let: 's', value: P('scheme', { name: 'pop', categoryId: V('note.category_id') }) },
    { let: 'pad', value: 56 },
    { let: 'qrSize', value: 120 },
    { let: 'innerW', value: sub(V('W'), mul(V('pad'), 2)) },
    { let: 'kicker', value: P('clipLine', { text: P('joinNonEmpty', { sep: ' · ', parts: [P('blockName'), P('noteDate')] }), maxW: V('innerW'), size: 22, bold: true }) },
    { let: 'titleLines', value: P('fitLines', { text: V('note.title'), maxW: V('innerW'), n: 3, size: 46, bold: true }) },
    { let: 'tLH', value: 60 },
    { let: 'kickerBase', value: 104 },
    { let: 'titleTop', value: 142 },
    { let: 'titleBottom', value: add(V('titleTop'), mul(sub(len(V('titleLines')), 1), V('tLH')), 46) },
    { let: 'bandH', value: add(V('titleBottom'), 78) },
    { let: 'base', value: add(V('bandH'), 56) },
    { let: 'sumLines', value: [] },
    { if: { cond: truthy(V('note.summary')), then: [{ let: 'sumLines', value: P('fitLines', { text: V('note.summary'), maxW: V('innerW'), n: 4, size: 28 }) }] } },
    { let: 'sumBase', value: IF(truthy(V('sumLines')), add(V('base'), 28), 0) },
    { if: { cond: truthy(V('sumLines')), then: [{ let: 'base', value: add(V('sumBase'), mul(sub(len(V('sumLines')), 1), 44), 56) }] } },
    { let: 'pts', value: P('points', { limit: 3, maxW: sub(V('innerW'), 46), size: 26 }) },
    { let: 'ptsBase', value: IF(truthy(V('pts')), add(V('base'), 8), 0) },
    { if: { cond: truthy(V('pts')), then: [{ let: 'base', value: add(V('ptsBase'), mul(sub(len(V('pts')), 1), 44), 34) }] } },
    { let: 'ruleY', value: add(V('base'), 30) },
    { let: 'signTop', value: add(V('base'), 56) },
    { let: 'sign', value: P('signRow', { x: V('pad'), y: V('signTop'), maxW: sub(sub(V('innerW'), V('qrSize')), 36), size: 28, avatarD: 84, onDark: false }) },
    { let: 'foot', value: mx(P('qrStickerH', { size: V('qrSize') }), V('sign.h')) },
    { let: 'height', value: add(V('signTop'), V('foot'), 56) },
    // 落笔全排在底色之后：图层是按数组顺序画的，摘要要是先塞进去，
    // 后面那张纸白底会把它整个盖掉——第一版真成品图就是这么空着半张（模拟器实拍抓到）。
    { emit: { k: 'fill', x: 0, y: 0, w: V('W'), h: V('height'), color: tok('paper') } },
    { emit: { k: 'fill', x: 0, y: 0, w: V('W'), h: V('bandH'), color: V('s.bg') } },
    { emit: { k: 'fill', x: 0, y: sub(V('bandH'), 10), w: V('W'), h: 10, color: V('s.accent') } },
    { emit: { k: 'text', x: V('pad'), y: V('kickerBase'), lines: [V('kicker')], size: 22, weight: 'bold', color: V('s.ink'), alpha: 0.8, track: 2 } },
    { emit: { k: 'text', x: V('pad'), y: add(V('titleTop'), 46), lines: V('titleLines'), lh: V('tLH'), size: 46, weight: 'bold', color: V('s.ink') } },
    { if: { cond: truthy(V('sumLines')), then: [{ emit: { k: 'text', x: V('pad'), y: V('sumBase'), lines: V('sumLines'), lh: 44, size: 28, color: tok('body') } }] } },
    { if: { cond: truthy(V('pts')), then: [{ each: { over: V('pts'), as: 'p', index: 'pi', do: [
      { let: 'py', value: add(V('ptsBase'), mul(V('pi'), 44)) },
      { emit: { k: 'circle', x: add(V('pad'), 16), y: add(V('py'), -9), r: 16, fill: V('s.accent') } },
      { emit: { k: 'text', x: add(V('pad'), 16), y: add(V('py'), -2), lines: [{ str: add(V('pi'), 1) }], size: 20, weight: 'bold', align: 'center', color: V('s.accentInk') } },
      { emit: { k: 'text', x: add(V('pad'), 46), y: V('py'), lines: [V('p')], size: 26, color: tok('body') } },
    ] } }] } },
    // 分隔线不吃 s.dot：波普那族的 dot 是"深色底上的白点"，铺到白纸上就是隐形（第一版实拍抓到）。
    { emit: { k: 'line', x1: V('pad'), y1: V('ruleY'), x2: sub(V('W'), V('pad')), y2: V('ruleY'), w: 2, color: P('withAlpha', { color: tok('ink'), alpha: 0.14 }) } },
    { emitMany: V('sign.layers') },
    { let: 'qr', value: P('qrSticker', { x: sub(sub(V('W'), V('pad')), V('qrSize')), y: V('signTop'), size: V('qrSize'), offset: P('mix', { c1: tok('paper'), c2: V('s.accent'), w: 0.16 }), ink: tok('muted'), label: P('i18n', { key: 'scanToView' }) }) },
    { emitMany: V('qr.layers') },
  ],
}

// ---------------------------------------------------------------- 候选 B：墨晕卡 halo
// 一整张深色卡（墨那族配色，跟随分类），金句居中大字，背后一圈径向光晕把它托出来；
// 金句下面一道强调色短横，再下面居中的摘要；底排署名反白 + 码贴纸。
// 十套里没有一张是"整张深底 + 居中一句话 + 光晕"：荧光渐变那道是斜向彩条、规格卡是表格味，
// 这一套靠光晕把视线收到中间那一句上。
const HALO = {
  id: 'halo',
  min_version: 1,
  steps: [
    { let: 's', value: P('scheme', { name: 'mono', categoryId: V('note.category_id') }) },
    { let: 'pad', value: 60 },
    { let: 'qrSize', value: 118 },
    { let: 'innerW', value: sub(V('W'), mul(V('pad'), 2)) },
    { let: 'cx', value: div(V('W'), 2) },
    { let: 'kicker', value: P('clipTrack', { text: P('joinNonEmpty', { sep: ' · ', parts: [P('blockName'), P('sourceLabel')] }), maxW: V('innerW'), track: 6, size: 22, bold: true }) },
    { let: 'qLines', value: P('fitLines', { text: P('quoteText'), maxW: sub(V('innerW'), 40), n: 5, size: 46, bold: true }) },
    { let: 'qLH', value: 68 },
    { let: 'kickerBase', value: 132 },
    { let: 'quoteTop', value: 184 },
    { let: 'quoteBottom', value: add(V('quoteTop'), mul(sub(len(V('qLines')), 1), V('qLH')), 46) },
    { let: 'glowY', value: add(V('quoteTop'), mul(div(len(V('qLines')), 2), V('qLH'))) },
    { let: 'ruleY', value: add(V('quoteBottom'), 46) },
    { let: 'sumLines', value: [] },
    { if: { cond: truthy(V('note.summary')), then: [{ let: 'sumLines', value: P('fitLines', { text: V('note.summary'), maxW: V('innerW'), n: 4, size: 26 }) }] } },
    { let: 'sumBase', value: IF(truthy(V('sumLines')), add(V('ruleY'), 72), add(V('ruleY'), 30)) },
    { let: 'more', value: mx(0, sub(len(V('sumLines')), 1)) },
    { let: 'bodyBottom', value: add(V('sumBase'), mul(V('more'), 42)) },
    { let: 'signTop', value: add(V('bodyBottom'), 58) },
    { let: 'sign', value: P('signRow', { x: V('pad'), y: V('signTop'), maxW: sub(sub(V('innerW'), V('qrSize')), 30), size: 26, avatarD: 80, onDark: true }) },
    { let: 'foot', value: mx(P('qrStickerH', { size: V('qrSize') }), V('sign.h')) },
    { let: 'height', value: add(V('signTop'), V('foot'), 60) },
    // 光晕半径必须长到"离圆心最远那道画布边"：半径短于中心到下沿的距离时，光晕会在
    // 落笔范围那条直边上被切掉，画出来是一块带硬边的亮板（第一版实拍就是金句下面那道缝）。
    { let: 'glowR', value: mx(V('glowY'), sub(V('height'), V('glowY'))) },
    { emit: { k: 'fill', x: 0, y: 0, w: V('W'), h: V('height'), color: V('s.bg') } },
    { emit: { k: 'radial', x: V('cx'), y: V('glowY'), r0: 0, r1: V('glowR'), c1: P('withAlpha', { color: V('s.accent'), alpha: 0.45 }), c2: P('withAlpha', { color: V('s.accent'), alpha: 0 }), box: [0, 0, V('W'), V('height')] } },
    { emit: { k: 'text', x: V('cx'), y: V('kickerBase'), lines: [V('kicker')], size: 22, weight: 'bold', color: V('s.sub'), align: 'center', track: 6 } },
    { emit: { k: 'text', x: V('cx'), y: add(V('quoteTop'), 46), lines: V('qLines'), lh: V('qLH'), size: 46, weight: 'bold', color: V('s.ink'), align: 'center' } },
    { emit: { k: 'line', x1: sub(V('cx'), 56), y1: V('ruleY'), x2: add(V('cx'), 56), y2: V('ruleY'), w: 6, color: V('s.accent') } },
    { if: { cond: truthy(V('sumLines')), then: [{ emit: { k: 'text', x: V('cx'), y: V('sumBase'), lines: V('sumLines'), lh: 42, size: 26, color: V('s.sub'), align: 'center' } }] } },
    { emitMany: V('sign.layers') },
    { let: 'qr', value: P('qrSticker', { x: sub(sub(V('W'), V('pad')), V('qrSize')), y: V('signTop'), size: V('qrSize'), offset: V('s.c2'), ink: P('withAlpha', { color: tok('paper'), alpha: 0.72 }), label: P('i18n', { key: 'scanToView' }) }) },
    { emitMany: V('qr.layers') },
  ],
}

const CANDS = [BAND, HALO]

// ---------------------------------------------------------------- 第 0 关：node 侧规划
// 假画布：只需要 measureText 和切字号，与 docs/工具/验-模板配方可执行.js 同一套量法。
global.wx = {
  getStorageSync: () => ({ name: '阿飞', slogan: '每天读一点再走', template: 'quote', avatarPath: '' }),
  setStorageSync: () => {},
  getFileSystemManager: () => ({ accessSync: () => true }),
  env: { USER_DATA_PATH: '/u' },
}
let fontPx = 28
const charW = (c) => (c.codePointAt(0) > 0x2e80 ? fontPx : fontPx * 0.55)
const fakeCtx = new Proxy({}, {
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

// 一层大概落到哪里收尾：text 要按行数把 lh 摊完，其他按 y+h。量不到就先不动它（line/circle 那种）。
const bottomOf = (l) => {
  const n = Array.isArray(l.lines) ? l.lines.length : 1
  if (l.k === 'text') return (l.y || 0) + Math.max(0, n - 1) * (l.lh || 0) + (l.size || 0) * 0.34
  if (l.k === 'line') return Math.max(l.y1 || 0, l.y2 || 0)
  if (l.k === 'circle') return (l.y || 0) + (l.r || 0)
  if (l.k === 'avatar') return (l.y || 0) + (l.d || 0)
  return (l.y || 0) + (l.h || 0)
}

const primKeys = Object.keys(poster.RECIPE_PRIMS).reduce((a, n) => { a[n] = poster.RECIPE_PRIMS[n].keys; return a }, {})

fs.mkdirSync(OUT, { recursive: true })
console.log('—— 第 0 关：静态名单 + strict 规划（node，不启动模拟器）')
CANDS.forEach((r) => {
  const errs = engine.validate(r, { opKeys: poster.RECIPE_OP_KEYS, primKeys })
  ck(`${r.id}：静态名单过得去`, errs.length === 0, errs.slice(0, 4).join('；'))
})
if (bad.length) {
  console.log(`\n红 ${bad.length} 条，没往模拟器送`)
  CANDS.forEach((r) => fs.writeFileSync(path.join(OUT, `配方-${r.id}.json`), JSON.stringify(r, null, 1), 'utf8'))
  process.exit(1)
}

// 下发那一路的闸门也真走一遍：不通过 applyRemoteTemplates 就进不了 recipeOf。
const rows = CANDS.map((r, i) => ({
  template_id: r.id, label: r.id === 'band' ? '色带横幅' : '墨晕卡', label_en: r.id === 'band' ? 'Colour Band' : 'Ink Halo',
  group_key: 'bold', sort_order: 110 + i * 10, min_app_version: '1.0.0', content_hash: `p1-${r.id}`, recipe: r,
}))
const rep = poster.applyRemoteTemplates(rows)
ck('下发闸门：两条新配方整套收下、零退回', rep.accepted === 2 && rep.rejected.length === 0,
  `收 ${rep.accepted} 退 ${rep.rejected.length}${rep.rejected.length ? `（${rep.rejected.map((x) => `${x.id}：${x.problems.join('、')}`).join(' | ')}` : ''}`)
ck('来源读数：这两套现在吃的是下发的配方，不是包内那一份',
  poster.recipeSource('band') === 'remote' && poster.recipeSource('halo') === 'remote',
  `${poster.recipeSource('band')} / ${poster.recipeSource('halo')}`)
ck('合并列表：十套包内 + 两套新的 = 十二套，且新 id 排在末尾',
    poster.templateList().length === 12 && poster.templateList().slice(-2).map((x) => x.id).join(',') === 'band,halo',
  poster.templateList().map((x) => x.id).join(','))

const profile = { name: '阿飞', slogan: '每天读一点再走', avatarPath: '' }
const notes = [['中文小样', poster.SAMPLE_NOTE], ['英文小样', poster.SAMPLE_NOTE_EN]]
notes.forEach(([tag, note]) => {
  CANDS.forEach((r) => {
    let plan = null
    try { plan = poster.planPoster(fakeCtx, note, r.id, profile, tag === '中文小样' ? 'zh' : 'en', { strict: true }) } catch (e) {
      ck(`${r.id}·${tag}：strict 规划跑得通`, false, e.message)
      return
    }
    ck(`${r.id}·${tag}：成图落在这套上、高度按内容定（不塌不超限）`,
      plan.template === r.id && plan.height > 700 && plan.height < 2600,
      `template=${plan.template} height=${plan.height} 层数=${plan.layers.length}`)
    const bottoms = plan.layers.map(bottomOf)
    const over = Math.max(...bottoms)
    ck(`${r.id}·${tag}：没有一层画到画布外面`, over <= plan.height + 2, `最深 ${Math.round(over)} / 画布 ${plan.height}`)
    // 图层是按数组顺序一张张贴上去的：铺满整张的底色要是排在内容后面，就把内容盖掉了。
    // 第一版 band 的真成品图就是这么空着半张（摘要和要点都画了，被纸白底压住），
    // 溢出那条查不出来，只有这条"底色必须打头"查得出来。
    const first = plan.layers[0]
    const covered = plan.layers.findIndex((l, i) => i > 0 && (l.h || 0) >= plan.height * 0.9 && l.k === 'fill')
    ck(`${r.id}·${tag}：铺满整张的底色排在最前面，没有内容层被它盖住`,
      !!first && first.k === 'fill' && (first.h || 0) >= plan.height * 0.9 && covered < 0,
      `第 1 层=${first && first.k} 高=${first && first.h}／画布 ${plan.height}${covered >= 0 ? `　第 ${covered + 1} 层又有一张满铺底色` : ''}`)
    const ks = {}
    plan.layers.forEach((l) => { ks[l.k] = (ks[l.k] || 0) + 1 })
    console.log(`    ${r.id}·${tag} 图层　${Object.keys(ks).map((k) => `${k}×${ks[k]}`).join(' ')}`)
  })
})
if (bad.length) {
  console.log(`\n红 ${bad.length} 条，没往模拟器送`)
  process.exit(1)
}
CANDS.forEach((r) => fs.writeFileSync(path.join(OUT, `配方-${r.id}.json`), JSON.stringify(r, null, 1), 'utf8'))
console.log(`　两份配方 JSON 落盘：${OUT}`)
if (process.env.MP_STAGE === 'node') process.exit(0)

// ---------------------------------------------------------------- 第 1 关：模拟器真下发真出图
const findInSandbox = (name, depth = 8) => {
  const walk = (dir, d) => {
    if (d > depth) return null
    let items = []
    try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return null }
    for (const it of items) if (it.isFile() && it.name === name) return path.join(dir, it.name)
    for (const it of items) {
      if (it.isDirectory()) { const hit = walk(path.join(dir, it.name), d + 1); if (hit) return hit }
    }
    return null
  }
  return walk(SANDBOX, 0)
}

const enter = async (mp, url) => {
  for (let i = 0; ; i++) {
    try { await mp.reLaunch(url); break } catch (e) {
      if (i >= 4) throw e
      console.log(`　第 ${i + 1} 次进 ${url} 没成：${e.message}`); await sleep(8000)
    }
  }
  for (let i = 0; ; i++) {
    try { const p = await mp.currentPage(); if (p) return p } catch (e) { /* 冷启动头十几秒读不到页 */ }
    await sleep(3000)
    if (i > 8) throw new Error(`进了 ${url} 但页面一直读不到`)
  }
}

;(async () => {
  process.on('uncaughtException', (e) => { console.error('挂了（未捕获）', e && e.message ? e.message : e); process.exit(2) })
  process.on('unhandledRejection', (e) => { console.error('挂了（未处理拒绝）', e); process.exit(2) })

  console.log('\n—— 第 1 关：模拟器下发 + 真点出图')
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }) } catch (e) { await sleep(12000) }
  }
  if (!mp) { console.error(`连不上 ${PORT}（环境红，不是判据红）。先跑：bash docs/工具/跑尺子.sh ${PORT} 出-新模板候选`); process.exit(2) }

  // 只下发那两条新的：包内十套由 templateList() 自己并进来，少抄一份少一处走偏。
  await mp.evaluate((payload) => {
    wx.__origRequest = wx.request
    wx.removeStorageSync(payload.key)
    wx.request = (o) => {
      if (o && /poster\/templates/.test(String(o.url))) {
        if (o.success) o.success({ statusCode: 200, data: payload.rows, header: {}, cookies: [], errMsg: 'request:ok' })
        if (o.complete) o.complete({ statusCode: 200, errMsg: 'request:ok' })
        return { abort() {} }
      }
      return wx.__origRequest(o)
    }
  }, { key: pt.STORE_KEY, rows })

  const profile1 = await enter(mp, '/pages/profile/profile')
  await sleep(6000)
  const cells = ((await profile1.data('groups')) || []).reduce((a, g) => a.concat(g.items || []), [])
  ck('下发到客户端：卡片模板页十二格（十包内 + 2 新）',
    cells.length === 12 && cells.some((c) => c.id === 'band') && cells.some((c) => c.id === 'halo'),
    `${cells.length} 格 / ${cells.map((c) => c.id).join(',')}`)

  await enter(mp, '/pages/index/index')
  await sleep(9000)
  const home = await (await mp.currentPage()).data()
  const list = (home.notes && home.notes.length ? home.notes : home.list) || []
  const noteId = list.length ? (list[0].id || list[0].note_id) : null
  ck('首页列表里拿到一篇真笔记当画芯（不自己造数据）', !!noteId, noteId ? `note.id=${noteId}「${list[0].title || ''}」` : `读到 ${list.length} 篇`)
  if (!noteId) throw new Error('没有画芯，往下走没有意义')

  const page = await enter(mp, `/pages/share/share?id=${noteId}`)
  const tpls = (await page.data('tpls')) || []
  ck('分享页那一排跟着变十二格', tpls.length === 12, tpls.map((x) => x.id).join(','))

  const stamp = Date.now()
  for (const id of ['band', 'halo']) {
    const idx = tpls.findIndex((x) => x.id === id)
    const before = (await page.data('imagePath')) || ''
    const picks = await page.$$('.pick')
    if (idx < 0 || !picks[idx]) { ck(`${id}：模板条里有格子`, false, `idx=${idx} 格子数=${picks ? picks.length : 0}`); continue }
    ck(`${id}：格子在条里第 ${idx + 1} 位，名字是「${(tpls[idx].label)}」`, true)
    await picks[idx].tap()
    let st = {}
    for (let i = 0; i < 40; i++) {
      st = await page.data()
      if (st.picked === id && st.generating === false && st.imagePath && st.imagePath !== before) break
      await sleep(1000)
    }
    ck(`${id}：真点之后重画完成、成品落盘（不是还没渲完）`,
      st.picked === id && !!st.imagePath && st.imagePath !== before,
      `picked=${st.picked} generating=${st.generating} imagePath=${st.imagePath ? '有' : '空'}`)
    if (!st.imagePath) continue

    const inBox = `p1-${id}-${stamp}.png`
    const got = await mp.evaluate((name) => {
      const p = getCurrentPages().slice(-1)[0]
      try {
        wx.getFileSystemManager().copyFileSync(p.data.imagePath, `${wx.env.USER_DATA_PATH}/${name}`)
        return name
      } catch (e) { return `拷贝失败：${(e && e.message) || e}` }
    }, inBox)
    if (got !== inBox) { ck(`${id}：写进沙盒`, false, String(got)); continue }
    let local = null
    for (let i = 0; i < 10 && !local; i++) { local = findInSandbox(inBox); if (!local) await sleep(2000) }
    ck(`${id}：成品图从沙盒搬进仓库`, !!local, local || '没搜到那个文件名')
    if (local) {
      const dest = path.join(OUT, `新模板-${id}.png`)
      fs.copyFileSync(local, dest)
      const sz = fs.statSync(dest).size
      ck(`${id}：成品图不是 0 字节（模拟器落盘有半张的时候）`, sz > 3000, `${dest}　${sz} 字节`)
    }
  }

  await mp.evaluate((key) => { wx.removeStorageSync(key); if (wx.__origRequest) { wx.request = wx.__origRequest; wx.__origRequest = null } }, pt.STORE_KEY)
  try { await mp.disconnect() } catch (e) { /* 收尾断不干净由跑尺子.sh 下一次整体重启兜 */ }
  console.log(bad.length ? `\n红 ${bad.length} 条：${bad.join('、')}` : `\n全过　成品目录：${OUT}`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('跑挂了', e && e.message ? e.message : e); process.exit(2) })
