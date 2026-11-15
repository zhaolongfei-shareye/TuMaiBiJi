// 第十轮审计 Z49（11-16）：待补队列被服务端**永久**拒掉时，那批已经在云上的对象必须交给删除。
//
// 这条尺子量的是"摘条不等于这笔账结了"。`assetQueue.flush` / `cardQueue.flush` 原来把 4xx 那几条
// 从队列里摘掉就完事——重试一万次也不会成，可图**已经在云上了**，而云上对象只有客户端删得动
// （`backend/app/api/routes/deletion.py` 顶上那句）。留下一批谁都不认得的孤儿，永久占全站那 5GB，
// 而配额是从库里 SUM 出来的 ⇒ 这笔账永远对不上。现在摘条的同时把地址交给 `flush` 的第二个回调。
//
// 三条不许反的纪律，这把尺子各有一格盯着：
// ① 429 不算永久拒绝（限流只是"现在别打"，摘了就把这笔账永远丢掉）；
// ② 交出去之前要扣掉两种"还有人要"的地址——摘完后现表里还留着的（几条 await 之间被重新 push 过），
//    和这一趟真绑成／真登记成的（同一个地址并成两条过时那边已进库）。少扣一种，症状就是详情页那一排破图；
// ③ 现表这次没读到就当"还有人要"：宁可留一个孤儿下次再删，也不许删掉还活着的那一份。
//    同一趟里 `_put` 也不许拿空表写回——盖掉的是欠着的别的几条的账。
// 跑法：node docs/工具/验-审计Z49队列永久拒绝删孤儿.js
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const R = (p) => fs.readFileSync(path.resolve(ROOT, p), 'utf8')
const AQ = 'miniprogram/utils/assetQueue.js'
const CQ = 'miniprogram/utils/cardQueue.js'
const APP = 'miniprogram/app.js'
const CC = 'miniprogram/utils/cardCloud.js'

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

// 假 storage 照真 API 的语义：**读写各拷一份**（真 `getStorageSync` 回的是反序列化出来的副本，
// 而 `push` 会对 take() 拿到的那个数组直接改）。桩要是不拷，读写同一块引用，竞态被桩自己掩盖＝测的是桩。
// 没有的那一栏回 `''`——这是微信的原样返回，不是 `undefined`；桩回错型就量不到"空队列 vs 没读到"那一档。
// `failReadsAfter: N` 让第 N+1 次读起就抛——这一档量的不是"队列本来是空的"，是**中途读坏**。
function loadQueue(rel, store, opts) {
  const o = opts || {}
  let reads = 0
  const wx = {
    getStorageSync: (k) => {
      reads += 1
      if (o.failReadsAfter !== undefined && reads > o.failReadsAfter) throw new Error('storage 坏了')
      return k in store ? clone(store[k]) : ''
    },
    setStorageSync: (k, v) => { store[k] = clone(v) },
    removeStorageSync: (k) => { delete store[k] },
  }
  global.wx = wx
  const mod = { exports: {} }
  const req = (p) => require(path.resolve(ROOT, 'miniprogram/utils', p))
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', 'wx', o.src || R(rel))(req, mod, mod.exports, wx)
  return mod.exports
}

const SPEC = {
  aq: {
    rel: AQ, key: 'pendingNoteAssets',
    entry: (n, ids) => ({ noteId: n, items: ids.map((f) => ({ file_id: f, status: 'done' })) }),
  },
  cq: {
    rel: CQ, key: 'pendingNoteCards',
    entry: (n, ids) => ({ noteId: n, item: { file_id: ids[0], tpl: 'classic' } }),
  },
}

// 一格用例：`beh` 按 noteId 点名为 'ok' / 一个状态码 / 'net'（连 statusCode 都没有的弱网）/ 一个回体对象；
// `hold` 让那几个 noteId 卡在半路（等 `midFlight` 落完账再放行）；`want` 是期望的交出地址与队列余量。
async function exec(c) {
  const spec = SPEC[c.which]
  const store = {}
  const q = loadQueue(spec.rel, store, { src: c.src, failReadsAfter: c.failReadsAfter })
  // `prePush` 走模块自己的 `push()`（量的就是"这一笔落不落得下去"），`entries` 直接摆表（量的只是 flush）。
  if (c.prePush) {
    for (const p of c.prePush) q.push(p[0], p[1])
    if (c.pushOnly) return { handoff: [], left: (store[spec.key] || []).length }
  } else {
    store[spec.key] = c.entries.map((e) => spec.entry(e[0], e[1]))
  }
  const releases = []
  const gates = {}
  for (const n of (c.hold || [])) {
    let r
    gates[n] = new Promise((res) => { r = res })
    releases.push(r)
  }
  const answer = (noteId) => {
    const b = (c.beh || {})[noteId]
    if (b === undefined || b === 'ok') return { ret: {} }
    if (typeof b === 'object') return { ret: b }
    if (b === 'net') { const e = new Error('request:fail'); return { err: e } }
    const e = new Error('HTTP ' + b)
    e.statusCode = b
    return { err: e }
  }
  const api = {
    bindNoteAssets: async (noteId) => {
      if (gates[noteId]) await gates[noteId]
      const a = answer(noteId)
      if (a.err) throw a.err
      return a.ret
    },
    putNoteCard: async (noteId) => {
      if (gates[noteId]) await gates[noteId]
      const a = answer(noteId)
      if (a.err) throw a.err
      return a.ret
    },
  }
  const handoff = []
  const flying = q.flush(api, (ids) => { handoff.push(...ids) })
  if (c.midFlight) {
    await wait(5)
    c.midFlight(q)
  }
  releases.forEach((r) => r())
  await flying
  const table = store[spec.key] || []
  return { handoff, left: table.length }
}

const CASES = {
  A0: { which: 'aq', name: '全新手机（这一栏本来就没有）第一笔 push 必须落得下去',
    pushOnly: true, prePush: [[11, [{ file_id: '/11/a.jpg', status: 'done' }]]],
    want: { handoff: [], left: 1 } },
  C0: { which: 'cq', name: '卡片那一族同一档：这一栏没有 ≠ 没读到',
    pushOnly: true, prePush: [[21, { file_id: '/21/x.jpg', tpl: 'classic' }]],
    want: { handoff: [], left: 1 } },
  A1: { which: 'aq', name: '待补绑被 400 拒掉：摘条的同时把那几个地址交给删除',
    entries: [[11, ['/11/a.jpg', '/11/b.jpg']]], beh: { 11: 400 },
    want: { handoff: ['/11/a.jpg', '/11/b.jpg'], left: 0 } },
  A2: { which: 'aq', name: '429 只是"现在别打"：条目留着、一个地址都不交',
    entries: [[11, ['/11/a.jpg']]], beh: { 11: 429 },
    want: { handoff: [], left: 1 } },
  A3: { which: 'aq', name: '弱网（回体根本没状态码）：条目留着、不交',
    entries: [[11, ['/11/a.jpg']]], beh: { 11: 'net' },
    want: { handoff: [], left: 1 } },
  A4: { which: 'aq', name: '真绑成的那一条不但不交，还得从表里摘掉',
    entries: [[11, ['/11/a.jpg']]], beh: {},
    want: { handoff: [], left: 0 } },
  A5a: { which: 'aq', name: '一条绑成、一条被拒：只交被拒那一条手上的图',
    entries: [[13, ['/13/c.jpg']], [14, ['/14/d.jpg']]], beh: { 13: 'ok', 14: 400 },
    want: { handoff: ['/14/d.jpg'], left: 0 } },
  A5b: { which: 'aq', name: '同一个地址一条绑成、一条被拒：那张刚进了库，一页都不许删',
    entries: [[13, ['/s/c.jpg']], [14, ['/s/c.jpg']]], beh: { 13: 'ok', 14: 400 },
    want: { handoff: [], left: 0 } },
  A6: { which: 'aq', name: '几条 await 之间同一篇又被 push：那条还欠着账，地址不许交出去',
    entries: [[11, ['/11/a.jpg']]], beh: { 11: 400 }, hold: [11],
    midFlight: (q) => q.push(11, [{ file_id: '/11/b.jpg', status: 'done' }]),
    want: { handoff: [], left: 1 } },
  A7: { which: 'aq', name: '中途现表读不到：宁可留孤儿，一个地址都不许删',
    entries: [[11, ['/11/a.jpg']]], beh: { 11: 400 }, failReadsAfter: 1,
    want: { handoff: [], left: 1 } },

  C1: { which: 'cq', name: '卡片补登记被 400 拒掉：摘条的同时把那一张交给删除',
    entries: [[21, ['/21/x.jpg']]], beh: { 21: 400 },
    want: { handoff: ['/21/x.jpg'], left: 0 } },
  C2: { which: 'cq', name: '登记成了、回体里被顶成历史的那几张照旧交给删除（这一张自己不交）',
    entries: [[22, ['/22/y.jpg']]], beh: { 22: { replaced_file_ids: ['/old/o1.jpg', '/old/o2.jpg'] } },
    want: { handoff: ['/old/o1.jpg', '/old/o2.jpg'], left: 0 } },
  C3: { which: 'cq', name: '卡片这一族同样不把 429 当永久拒绝',
    entries: [[21, ['/21/x.jpg']]], beh: { 21: 429 },
    want: { handoff: [], left: 1 } },
  C4: { which: 'cq', name: '卡片混合：顶下的历史与被拒的这张都从同一个回调交出去',
    entries: [[21, ['/21/x.jpg']], [22, ['/22/y.jpg']]],
    beh: { 21: 400, 22: { replaced_file_ids: ['/old/o.jpg'] } },
    want: { handoff: ['/old/o.jpg', '/21/x.jpg'], left: 0 } },
}

// 反向：每一把都要把指定那一格打红，否则那条判据自己就是假的。
const MUT = [
  { label: '反向①摘条却不交地址（Z49 之前那个样子）', which: 'aq', case: 'A1',
    fn: (s) => s.replace('    onOrphan(ids)\n', '') },
  { label: '反向②卡片这一族摘条却不交地址', which: 'cq', case: 'C1',
    fn: (s) => s.replace('    onOrphan(ids)\n', '') },
  { label: '反向③排除集不扣"还留在队列里的那条"', which: 'aq', case: 'A6',
    fn: (s) => s.replace('_orphanIds(rejected, still, bound)', '_orphanIds(rejected, [], bound)') },
  { label: '反向④排除集不扣"这一趟真绑成的"', which: 'aq', case: 'A5b',
    fn: (s) => s.replace('_orphanIds(rejected, still, bound)', '_orphanIds(rejected, still, [])') },
  { label: '反向⑤读不到也照样删（撤掉 readFailed 那道闸）', which: 'aq', case: 'A7',
    fn: (s) => s.replace('readFailed ? [] : _orphanIds', '_orphanIds') },
  { label: '反向⑥读不到仍拿空表整表写回（`_put` 那道闸撤掉）', which: 'aq', case: 'A7',
    fn: (s) => s.replace("  if (readFailed) { console.warn('待补绑队列这次没读到，先不写回（免得把欠着的几条盖掉）'); return }\n", '') },
  { label: '反向⑦429 被当成永久拒绝（一笔账就此丢掉）', which: 'aq', case: 'A2',
    fn: (s) => s.replace('code >= 400 && code < 500 && code !== 429', 'code >= 400 && code < 500') },
  { label: '反向⑧卡片那一族 429 被当成永久拒绝', which: 'cq', case: 'C3',
    fn: (s) => s.replace('code >= 400 && code < 500 && code !== 429', 'code >= 400 && code < 500') },
  // 这一把是本轮现撞出来的真红：`readFailed` 一度把"这一栏本来就没有"（微信回 `''`）也算成没读到，
  // 于是新装手机第一笔 push 被 `_put` 那道闸当场吞掉。极性写反的判据必须由这一格打红。
  { label: '反向⑨把"这一栏没有"当成"没读到"（待补绑那一族）', which: 'aq', case: 'A0',
    fn: (s) => s.replace('  readFailed = threw\n', "  readFailed = threw || raw === ''\n") },
  { label: '反向⑩同一条极性与卡片那一族（改错 safeStorage 那一头的读回）', which: 'cq', case: 'C0',
    fn: (s) => s.replace('readFailed = !r.ok', "readFailed = !r.ok || r.value === ''") },
]

async function main() {
  console.log('———— 正例：两族队列各自的行为 ————')
  for (const k of Object.keys(CASES)) {
    const c = CASES[k]
    const g = await exec(c)
    ck(`${k} ${c.name}`,
      JSON.stringify(g.handoff) === JSON.stringify(c.want.handoff) && g.left === c.want.left,
      `交出=${JSON.stringify(g.handoff)} 余量=${g.left}｜期望 交出=${JSON.stringify(c.want.handoff)} 余量=${c.want.left}`)
  }

  console.log('\n———— 接线：两个调用口都把地址递给 deleteFiles ————')
  const app = R(APP)
  const cloud = R(CC)
  ck('回前台那一趟补绑把地址交给 cloudUpload.deleteFiles（Z49 前只传一个参数）',
    app.includes('assetQueue.flush(apiModule, (ids) => cloudUpload.deleteFiles(ids))'))
  ck('卡片那一族走 cardCloud 同一个回调',
    cloud.includes('cardQueue.flush(api, (ids) => cloudUpload.deleteFiles(ids))'))
  ck('两份队列都接了排除集，且两边同形',
    R(AQ).includes('_orphanIds(rejected, still, bound)') && R(CQ).includes('_orphanIds(rejected, still, bound)'),
    '各一处')
  // 这一条不看整份文件，只取 `_put` 那一段正文——判据要指得准那一格，别在别处读到 `readFailed` 就算过。
  const putBody = (src) => {
    const i = src.indexOf('function _put(list) {')
    return i < 0 ? '' : src.slice(i, src.indexOf('\n}', i))
  }
  ck('两份队列的写回都带"没读到不写回"那道闸（本轮把 assetQueue 补齐到与 cardQueue 同形）',
    putBody(R(AQ)).includes('if (readFailed)') && putBody(R(CQ)).includes('if (readFailed)'),
    `aq=${putBody(R(AQ)).includes('if (readFailed)')} cq=${putBody(R(CQ)).includes('if (readFailed)')}`)

  console.log('\n———— 反向：撤掉哪一刀，对应那一格就必须红 ————')
  for (const m of MUT) {
    const rel = SPEC[m.which].rel
    const src = R(rel)
    const mutated = m.fn(src)
    if (mutated === src) { ck(`${m.label}：变异打上（锚点没漂）`, false, '锚点漂了＝这把反向是假的'); continue }
    const g = await exec(Object.assign({}, CASES[m.case], { src: mutated }))
    const stillGreen = JSON.stringify(g.handoff) === JSON.stringify(CASES[m.case].want.handoff)
      && g.left === CASES[m.case].want.left
    ck(`${m.label} → ${m.case} 真的红`, !stillGreen, `交出=${JSON.stringify(g.handoff)} 余量=${g.left}`)
  }

  console.log(`\n${bad.length ? '红 ' + bad.length + ' 条：' + bad.join('、') : '全绿'}`)
  process.exit(bad.length ? 1 : 0)
}

main().catch((e) => { console.error('尺子自己崩了：', e && (e.stack || e.message)); process.exit(1) })
