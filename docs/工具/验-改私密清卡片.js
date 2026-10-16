// 改私密那一刻，那张卡片要跟着没（站长 10-16 拍「乙」）。
//
// 这一把量的是 `utils/cardCloud.js` 的 `dropForPrivate`。它要挡的是这么一条今天真实存在的路：
//   笔记还公开时出过一张卡片 → 当时那张没传成功（离线／进程被杀）→ 后来把它归进私密
//   → 之后每次进前台，`backfillLocal` 只看"本机有没有图、云上有没有那一行"，
//     整条链上没有一处读"这篇是不是私密" ⇒ 这张印着私密正文的图被一遍遍重传上云。
// 服务端那道"私密篇不给登记"的闸拦的是新登记，拦不住这个——图是客户端直传的。
//
// 六条判据里最要紧的是第 ②与③：撤行没成就**不许**先把本机账清掉（地址一没人记得，
// 那个对象就永久占着全站配额，10-11 审计严重①同型）；而"云上本来没那一行"那种形状
// 必须不打任何网络请求就把本机清干净（那正是漏的那一条的正面）。
//
// 跑法：node docs/工具/验-改私密清卡片.js
const path = require('path')
const ROOT = path.resolve(__dirname, '../..')
const R = (m) => require(path.join(ROOT, 'miniprogram/utils', m))

const STORE = {}
global.wx = {
  getStorageSync: (k) => (k in STORE ? STORE[k] : ''),
  setStorageSync: (k, v) => { STORE[k] = v },
  removeStorageSync: (k) => { delete STORE[k] },
  getFileSystemManager: () => ({ accessSync: () => true, unlinkSync: () => {}, copyFile: (o) => o.success && o.success({}) }),
  env: { USER_DATA_PATH: '/u' },
  getImageInfo: ({ fail }) => fail && fail({}),
  cloud: { deleteFile: async ({ fileList }) => ({ fileIDList: fileList.map((f) => ({ fileID: f, status: 0 })) }) },
}

const api = R('api.js')
const cloudUpload = R('cloudUpload.js')
const cardQueue = R('cardQueue.js')
const cardLog = R('cardLog.js')
const cardCloud = R('cardCloud.js')

const bad = []
const ck = (name, cond, got) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${got === undefined ? '' : `　→ ${JSON.stringify(got)}`}`)
  if (!cond) bad.push(name)
}
const NOTE = 4242
const OTHER = 9999

// 每把都记："打了哪些请求、按什么顺序"。顺序就是这条链的判据本身。
let trace
function harness({ serverRow, queueRows, localRows, dropFails }) {
  trace = []
  // `setServer` 吃的是**整份名单**且按 `note_id` 归堆（权威从本机文件换成服务器那一行），
  // 所以这里一次给全，不能一枚一枚塞。
  const rows = []
  if (serverRow) rows.push(Object.assign({ note_id: NOTE }, serverRow))
  if (serverRow && serverRow.foreign) rows.push(Object.assign({ note_id: OTHER }, serverRow.foreign))
  cardCloud.setServer(rows)
  cardQueue.clear()
  if (queueRows) queueRows.forEach((f) => cardQueue.push(NOTE, { file_id: f, tpl: 'card' }))
  // 本机台账直接写 storage（`record` 那一路要真文件，这里只测清账那一半读的东西）
  STORE[cardLog.KEY] = localRows ? { [NOTE]: [{ p: '/u/a.jpg', tpl: 'card', up: !!localRows.up }] } : {}
  api.deleteNoteCard = async () => {
    trace.push('deleteNoteCard')
    if (dropFails === 'silent') throw new Error('网络断了')
    if (dropFails) { const e = new Error('撤不掉'); e.data = { detail: '这篇的卡片是自带的，不能删' }; throw e }
    return { file_ids: serverRow ? [serverRow.cloud_url] : [] }
  }
  cloudUpload.reservePurge = (ids) => trace.push('reservePurge:' + ids.join('+'))
  cloudUpload.unreservePurge = (ids) => trace.push('unreservePurge:' + ids.join('+'))
  cloudUpload.deleteFiles = async (ids) => { trace.push('deleteFiles:' + ids.join('+')); return ids }
  cloudUpload.dropFromDeleteRes = async (res) => { trace.push('dropFromDeleteRes'); return (res && res.file_ids) || [] }
  cloudUpload.cloudReady = () => true
}

async function main() {
  // ① 云上有一行：先记地址、再撤行、最后清本机账，三处一起没
  harness({ serverRow: { cloud_url: 'cloud://cards/a.jpg' }, localRows: {}, queueRows: null })
  ck('① 有云上那一行 → 回 dropped', await cardCloud.dropForPrivate(NOTE) === 'dropped')
  ck('① 顺序是"先记待删、再撤行"', trace[0] === 'reservePurge:cloud://cards/a.jpg' && trace[1] === 'deleteNoteCard', trace)
  ck('① 本机台账跟着清了', !cardLog.forNote(NOTE).length && !cardCloud.serverCard(NOTE))

  // ② 撤行失败：本机账必须原样留着（清了就没人在认得那个地址，对象永久占配额）
  harness({ serverRow: { cloud_url: 'cloud://cards/b.jpg' }, localRows: { up: true }, dropFails: true })
  const r2 = await cardCloud.dropForPrivate(NOTE)
  ck('② 撤不下来时回的是服务端那句原因，不是布尔', typeof r2 === 'string' && /自带的/.test(r2), r2)
  ck('② 本机台账一个字没清', cardLog.forNote(NOTE).length === 1, cardLog.forNote(NOTE))
  ck('② 云上那一行也还在（下次还能重来）', !!cardCloud.serverCard(NOTE))
  ck('② 预留过就把预留退回去，不留下会误删在用它对象的尾巴',
    trace.includes('reservePurge:cloud://cards/b.jpg') && trace.includes('unreservePurge:cloud://cards/b.jpg'), trace)

  // ②b 撤行失败、而且服务端没回原因（离线／超时）：交出去的不许是一个内部码——
  // 调用方会把拿到的东西原样拼进吐司，屏上就长出字典里没有的英文（10-16 第一版就是这么写的）。
  harness({ serverRow: { cloud_url: 'cloud://cards/b2.jpg' }, localRows: { up: true }, dropFails: 'silent' })
  const r2b = await cardCloud.dropForPrivate(NOTE)
  ck('②b 没原因的失败回布尔 false，不回 "failed" 那种码', r2b === false, r2b)
  ck('②b 本机账同样一个字没清', cardLog.forNote(NOTE).length === 1, cardLog.forNote(NOTE))

  // ③ 只有本机那张 jpg、云上没登记 —— 这条就是漏的那一型，必须零请求清掉
  harness({ serverRow: null, localRows: { up: false }, queueRows: null })
  ck('③ 云上没那一行 → 不打任何请求', await cardCloud.dropForPrivate(NOTE) === 'dropped' && trace.filter((x) => x === 'deleteNoteCard').length === 0, trace)
  ck('③ 本机 jpg 与台账一起清了', !cardLog.forNote(NOTE).length)

  // ④ 队列里那条是"对象已上传、只差登记"：行一没就再没人登记它，地址得进待删那一格
  // 队列本来就"一篇只留一条"（`push` 里按 noteId 覆盖），所以这里塞两条只会剩后一条——
  // 那不是这一把要测的东西，按它的设计给一条。
  harness({ serverRow: null, localRows: { up: false }, queueRows: ['cloud://cards/q1.jpg'] })
  ck('④ 队列里那条的地址进了待删并真删', await cardCloud.dropForPrivate(NOTE) === 'dropped'
    && trace.some((x) => x === 'reservePurge:cloud://cards/q1.jpg')
    && trace.some((x) => x === 'deleteFiles:cloud://cards/q1.jpg'), trace)
  ck('④ 这一篇的队列摘干净了', cardQueue.take().length === 0, cardQueue.take())

  // ⑤ 三处都空：不许打请求、不许动别的篇的账
  harness({ serverRow: null, localRows: null, queueRows: null })
  cardCloud.setServer([{ note_id: OTHER, cloud_url: 'cloud://cards/other.jpg' }])
  ck('⑤ 这一篇什么都没有 → 回 none 且零请求', await cardCloud.dropForPrivate(NOTE) === 'none' && trace.length === 0, trace)
  ck('⑤ 别篇那一行没被牵连', !!cardCloud.serverCard(OTHER))

  // ⑥ 静态：写的那一侧只该在"真的挪进私密"那一格动手。
  // 这一段抽成一个函数，是因为它得能拿**变异过的源码**再跑一遍（反向①②）——
  // 内联写的话，"这条判据到底红不红得起来"就只能靠手改代码证一次，下次改回来就没人复验了。
  const fs = require('fs')
  const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
  const N_两句话 = '⑥ 有原因／没原因两条话分开走'
  const N_字典 = '⑥ 两句中文与两句英文'
  const 静态 = (src, cloud, i18n) => {
    const b = []
    const k = (name, cond) => { console.log(`  ${cond ? '✓' : '✗'} ${name}`); if (!cond) b.push(name) }
    // ⚠ JS 的 `split(sep, limit)` 是"只留前 limit 段"，不是 Python 的 maxsplit：
    // `split(x, 1)[1]` 永远是 undefined，写出来是一把"永远不匹配"的静态判据（第一版就是这么红的）。
    const MARK = 'if (Object.keys(payload).length > 0) {'
    k('⑥ 那一段找得到（找不到就是判据自己写错了）', src.includes(MARK))
    const seg = src.slice(src.indexOf(MARK) + MARK.length)
    k('⑥ 触发条件是"这次 PUT 真的改了分类"，不是"每次保存"', /payload\.category_id !== undefined/.test(seg))
    k('⑥ 私密判据走的是同一个出处（privateGate.isPrivate 吃分类名）', /isPrivate\(/.test(seg) && /const \{ allowPrivate, isPrivate/.test(src))
    k('⑥ 没清掉时那句原因顶替掉"已更新"，且仍照常返回（停在编辑页再点一次反而修不好）',
      /cardPrivateDropFail/.test(seg) && !/return\s*\n\s*\}\s*\n\s*\}\s*\n\s*\}/.test(seg))
    k(`${N_两句话}（服务端那句才接在"没删掉："后面，布尔那句不拼词）`,
      /typeof dropped === 'string'/.test(seg) && /cardPrivateDropOffline/.test(seg))
    k('⑥ 这一支不许往外吐内部码字符串（屏上那句必须出自字典）', !/return 'failed'/.test(cloud))
    k(`${N_字典}都在字典里（t() 没有插值，所以只留前半句）`,
      (i18n.match(/cardPrivateDropFail/g) || []).length === 2
      && (i18n.match(/cardPrivateDropOffline/g) || []).length === 2 && !/\{reason\}/.test(i18n))
    return b
  }
  const W = 'miniprogram/pages/write/write.js', C = 'miniprogram/utils/cardCloud.js', I = 'miniprogram/utils/i18n.js'
  bad.push(...静态(rd(W), rd(C), rd(I)))

  // 反向①：把"有原因／没原因分开走"那一支改回第一版那种直接把返回值拼上屏（那时布尔 false
  // 会被拼成一句 "…没删掉：false"）。判据要抓得住它，否则这条等于没写。
  const TWO = /dropNote = typeof dropped === 'string'\n\s*\?\s*t\('cardPrivateDropFail', lang\) \+ dropped\n\s*: t\('cardPrivateDropOffline', lang\)/
  const wNow = rd(W)
  const m1 = wNow.replace(TWO, 'dropNote = dropped')
  console.log('\n———— 反向①：返回值直接拼上屏 ————')
  const 红1 = m1 !== wNow && 静态(m1, rd(C), rd(I)).some((x) => x.startsWith(N_两句话))
  // 反向②：字典里少一句（漏 en 是这一族最常犯的——`t()` 拿不到就把 key 本身念出来）
  const iNow = rd(I)
  const m2 = iNow.replace(/ {4}cardPrivateDropOffline: '[^']*',\n/, '')
  console.log('\n———— 反向②：字典里少那一句 ————')
  const 红2 = m2 !== iNow && 静态(rd(W), rd(C), m2).some((x) => x.startsWith(N_字典))

  console.log(`反向①拼上屏 ${红1 ? '红在对的地方' : '没红＝这条判据是假的'}`)
  console.log(`反向②字典少一句 ${红2 ? '红在对的地方' : '没红＝这条判据是假的'}`)
  console.log(bad.length ? `\nFAIL ${bad.length} 条：${bad.join('、')}` : '\nPASS 六组全过')
  process.exit(bad.length || !红1 || !红2 ? 1 : 0)
}
main()
