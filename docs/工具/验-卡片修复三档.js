// 补卡那一趟（2.0.1 P0 · S3）的尺子——**静态、不打网络、不画图**，直接拿真模块跑三档现场。
//
// 这一条线是站长点名要的那一节（"只写'以后不再丢'＝当没解决"），所以这把尺子第一屏断的不是
// "以后不丢"，是**丢过的能按档找回来、找不回来的每一条都有理由**。
//
// 为什么能静态跑：`cardRepair.plan()` 刻意不写不画，输入全是可注入的（台账 / 服务器那两份名单 /
// 文件在不在 / 形象缺不缺）。`run()` 那一半把上传与画图收在注入点里，所以这里递假函数就能整趟跑通。
// 真画图那三档现场在 `验-卡片修复三档-真跑.js`（要开 IDE、要烧云存储），那一把管"画出来对不对"，
// 这一把管"分档与那份数对不对"——两把各钉一层，红了要知道是哪一层。
//
// 跑法：node docs/工具/验-卡片修复三档.js
const path = require('path')
const fs = require('fs')
const MP = path.resolve(__dirname, '../../miniprogram')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === false ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}

// 台账要在 require 之前就位：cardLog.js 顶上跑着两次一次性归一（migrateKeepOnly / migrateOnePerNote），
// 标记没立上就会把 preset 的台账清成空对象——那时候三档全空，红的是一句假话。
const UD = 'http://usr'
const DIR = `${UD}/cards`
let store
let gone = {}

function makeWx() {
  store = {
    cardLogKeepOnly: 1,
    cardLogOnePerNote: 1,
    cardLog: {
      // 甲 · 补传档：图还在、云上没这一行
      5: [{ p: `${DIR}/5-classic-1.jpg`, tpl: 'classic', at: 10, noQr: false }],
      // 乙 · 重渲档：账在图没了（站长 10-08 撞的就是这一态）
      6: [{ p: `${DIR}/6-quote-gone.jpg`, tpl: 'quote', at: 20, noQr: true }],
      // 台账整条没了的走服务端那份名单（7），这里不留
      8: [{ p: 'http://usr/ruler-detail-cell.jpg', tpl: 'classic', at: 1, noQr: false }],
      // 已经有服务器行的那篇：一都不欠
      99: [{ p: `${DIR}/99-classic-2.jpg`, tpl: 'classic', at: 5, noQr: false }],
    },
  }
  gone = { 'http://usr/cards/6-quote-gone.jpg': true }
  return {
    env: { USER_DATA_PATH: 'http://usr' },
    getImageInfo: ({ fail }) => fail && fail({}),
    getFileSystemManager: () => ({
      accessSync: (p) => { if (gone[p]) throw new Error('没了') },
      mkdirSync: () => {},
      unlinkSync: (p) => { gone[p] = true },
      copyFile: ({ success }) => success && success({}),
      statSync: () => ({ size: 1000 }),
    }),
    getStorageSync: (k) => store[k] || '',
    setStorageSync: (k, v) => { store[k] = v },
    showToast: () => {},
    showModal: () => {},
  }
}

function load() {
  delete require.cache[require.resolve(path.join(MP, 'utils/cardLog.js'))]
  delete require.cache[require.resolve(path.join(MP, 'utils/cardCloud.js'))]
  delete require.cache[require.resolve(path.join(MP, 'utils/cardQueue.js'))]
  delete require.cache[require.resolve(path.join(MP, 'utils/cardRepair.js'))]
  global.wx = makeWx()
  return {
    cardLog: require(path.join(MP, 'utils/cardLog.js')),
    cardCloud: require(path.join(MP, 'utils/cardCloud.js')),
    cardRepair: require(path.join(MP, 'utils/cardRepair.js')),
  }
}

// 服务器那三份数：卡片名单 / 待确认名单 / 那几篇当年的快照
const SERVER = {
  cards: [{ note_id: 99, cloud_url: 'cloud://x/99.jpg', tpl: 'classic', no_qr: false, origin: 'live' }],
  extra: {
    need_confirm: [7, 8],
    snapshots: [{ note_id: 7, title: '当年那版', summary: '当年摘要', key_points: ['当年第一条'] }],
  },
}

// ---------- ① 三档分对 ----------
console.log('\n———— ① 三档分对（缺一档就是没解决） ————')
{
  const { cardCloud, cardRepair } = load()
  cardCloud.setServer(SERVER.cards, SERVER.extra)
  const p = cardRepair.plan({ avatarMissing: false })
  ck('前提：这批数真从服务器读回来过', p.loaded === true)
  ck('补传档＝图还在、云上没行的那一篇', p.backfill.length === 1 && p.backfill[0].noteId === 5,
    JSON.stringify(p.backfill.map((x) => x.noteId)))
  ck('重渲档＝账在图没了的那一篇', p.reRender.length === 1 && p.reRender[0].noteId === 6,
    JSON.stringify(p.reRender.map((x) => x.noteId)))
  ck('待确认档＝连账都没了、服务端说该有一张的那几篇',
    p.needConfirm.map((x) => x.noteId).sort().join() === '7,8',
    JSON.stringify(p.needConfirm.map((x) => x.noteId)))
  ck('已经有服务器行的那篇一都不欠', !p.backfill.concat(p.reRender, p.needConfirm).some((x) => x.noteId === 99))
  ck('那份数按档分开报，不是一句"已修复"',
    p.数.补传 === 1 && p.数.重渲 === 1 && p.数.待确认 === 2, JSON.stringify(p.数))
}

// ---------- ② 台账里那条不是卡片的（S0 现读出来的脏数据） ----------
console.log('\n———— ② 不是 cards/ 的那条：不补、不重渲、不计进那份数 ————')
{
  const { cardCloud, cardRepair } = load()
  cardCloud.setServer(SERVER.cards, SERVER.extra)
  const p = cardRepair.plan({ avatarMissing: false })
  const 假 = p.backfill.concat(p.reRender).filter((x) => x.entry && !cardRepair.isCardPath(x.entry.p))
  ck('它没被当成"这张还没上云"去补传', 假.length === 0, JSON.stringify(假.map((x) => x.noteId)))
  ck('它单独进"摘掉"那一栏（要报数，不是悄悄不管）',
    p.foreign.length === 1 && p.foreign[0].noteId === 8, JSON.stringify(p.foreign))
  ck('摘掉那一条指向的文件不是 cards/ 底下', p.foreign[0].p === 'http://usr/ruler-detail-cell.jpg', p.foreign[0].p)
  // 这一条不是预想：10-08 S0 在那台模拟器上现读到台账里混着一条尺子的自证截图，tpl 还填着 classic
  const 源码 = fs.readFileSync(path.join(MP, 'utils/cardRepair.js'), 'utf8')
  // 剥掉整行注释再判：那个文件里有一句注释写的正是"不许再拼一次 USER_DATA_PATH"，
  // 不剥就永远红——而红判据看多了，真漏的那天就没人看了（S1 那把尺子同一条教训）。
  const 去注释 = 源码.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
  ck('判据只认 cardLog.DIR 那一个常量，没在第二处重拼目录',
    /cardLog\.DIR/.test(去注释) && !/USER_DATA_PATH/.test(去注释))
}

// ---------- ③ 快照跟着进重渲/待确认那两档 ----------
console.log('\n———— ③ 正文优先用当年那份分享快照 ————')
{
  const { cardCloud, cardRepair } = load()
  cardCloud.setServer(SERVER.cards, SERVER.extra)
  const p = cardRepair.plan({ avatarMissing: false })
  const 七 = p.needConfirm.find((x) => x.noteId === 7)
  const 八 = p.needConfirm.find((x) => x.noteId === 8)
  ck('有分享记录的待确认那篇带上快照（按快照渲才是当年那张）',
    七 && 七.snapshot && 七.snapshot.summary === '当年摘要', JSON.stringify(七))
  ck('没分享记录的待确认那篇快照是 null（回退读笔记当前内容，不许替它编一份）',
    八 && (八.snapshot === null || 八.snapshot === undefined), JSON.stringify(八 && 八.snapshot))
}

// ---------- ④ 形象缺图那道 guard ----------
console.log('\n———— ④ 形象图不在手机上：不自动重渲 ————')
{
  const { cardCloud, cardRepair } = load()
  cardCloud.setServer(SERVER.cards, SERVER.extra)
  const p = cardRepair.plan({ avatarMissing: true })
  ck('缺图那篇不进重渲档', !p.reRender.some((x) => x.noteId === 6))
  ck('它归进待确认、带着「形象缺图」那个理由',
    p.needConfirm.some((x) => x.noteId === 6 && x.reason === 'avatar'),
    JSON.stringify(p.needConfirm.filter((x) => x.noteId === 6)))
}

// ---------- ⑤ 服务器那批数没读回来时不许动 ----------
console.log('\n———— ⑤ 没读过服务器名单：一句都不补（"这篇没有卡片行"这话没依据） ————')
{
  const { cardCloud, cardRepair } = load()
  cardCloud.clearServer()
  const p = cardRepair.plan({ avatarMissing: false })
  ck('loaded 是 false', p.loaded === false)
  ck('三档全空、那份数是 null', p.数 === null && !p.backfill.length && !p.reRender.length)
}

// ---------- ⑥ run()：那份数与"每一条都有下落" ----------
console.log('\n———— ⑥ 跑一趟：origin 与那份数 ----------')
async function runPass() {
  const { cardLog, cardCloud, cardRepair } = load()
  cardCloud.setServer(SERVER.cards, SERVER.extra)
  const 上传 = []
  const 台账写 = []
  // 只换掉"要花钱的那两件事"：上传登记 与 本机落盘。分档、排队、那份数全走真代码。
  cardCloud.refresh = async () => ({ cards: SERVER.cards, need_confirm: [], snapshots: [] })
  cardCloud.archive = async (noteId, entry) => { 上传.push({ noteId, origin: entry.origin }); return { ok: true, fileID: 'cloud://y/' + noteId } }
  cardLog.copyIn = async (noteId, tpl, noQr, srcPath, opt) => {
    台账写.push({ noteId, archiveOff: !!(opt && opt.archive === false) })
    return [{ p: `${DIR}/${noteId}-${tpl}-9.jpg`, tpl, noQr, at: 9 }]
  }
  cardLog.pruneNotCards = (pred) => {
    // 真的那一份在这儿跑一遍：摘完之后台账里不该再留非 cards/ 的条目
    const before = Object.keys(store.cardLog).length
    store.cardLog = Object.fromEntries(Object.entries(store.cardLog)
      .map(([k, v]) => [k, v.filter((x) => pred(x.p))]).filter(([, v]) => v.length))
    return before - Object.keys(store.cardLog).length
  }

  const res = await cardRepair.run({
    avatarMissing: false,
    check: () => ({ tpl: 'classic' }),
    render: async (x) => `tmp/${x.noteId}.png`,
  })
  const 报 = res.报告
  ck('补传那一张带的 origin 是 backfilled（不是 live）',
    上传.some((u) => u.noteId === 5 && u.origin === 'backfilled'), JSON.stringify(上传))
  ck('重渲那一张带的 origin 是 re-rendered',
    上传.some((u) => u.noteId === 6 && u.origin === 're-rendered'), JSON.stringify(上传))
  // 10-08 之后落本机台账的不只重渲那一张：待确认那两篇按默认版式重出也走同一条（copyIn + archive:false）。
  ck('凡是补卡这一趟落的台账，自动留档全被关掉（否则 origin 又被改回 live）',
    台账写.length === 3 && 台账写.every((x) => x.archiveOff === true), JSON.stringify(台账写))
  ck('那份数：补传 1／重渲 1', 报.补传 === 1 && 报.重渲 === 1, JSON.stringify(报))
  ck('那份数：待确认那两篇按现在的版式自动重出了（不再推给他点）', 报.重出 === 2, 报.重出)
  ck('重出那两篇登记的 origin 是 from-share-snapshot（不冒充当年那张）',
    上传.filter((u) => u.origin === 'from-share-snapshot').map((u) => u.noteId).sort().join() === '7,8',
    JSON.stringify(上传))
  ck('那份数：台账里那条不是卡片的被摘掉并报了数', 报.摘掉 === 1, 报.摘掉)
  ck('报出来的数与实际处理条数相等（§七 验收 1.3）', 报.数对得上 === true && 报.应补 === 4,
    `应补 ${报.应补}／实补 ${报.实补}／跳过 ${报.跳过.length}／失败 ${报.失败.length}`)

  // check 回 skip 的那些必须逐条带理由，一条都不许静默消失
  const res2 = await (async () => {
    const again = load()
    again.cardCloud.setServer(SERVER.cards, SERVER.extra)
    again.cardCloud.refresh = async () => ({ cards: SERVER.cards, need_confirm: [], snapshots: [] })
    again.cardCloud.archive = async () => ({ ok: true })
    again.cardLog.copyIn = async (noteId, tpl, noQr) => [{ p: `${DIR}/${noteId}-${tpl}-9.jpg`, tpl, noQr }]
    again.cardLog.pruneNotCards = () => 0
    return again.cardRepair.run({
      avatarMissing: false,
      check: (x) => (x.noteId === 5 ? { skip: 'private' } : x.noteId === 6 ? { skip: 'noToken' } : { tpl: 'classic' }),
      render: async () => 'tmp.png',
    })
  })()
  const 报2 = res2.报告
  ck('跳过的每一篇都列得出为什么（私密／不能再替它开公开码）',
    报2.跳过.length === 2 && 报2.跳过.some((s) => s.reason === 'private') && 报2.跳过.some((s) => s.reason === 'noToken'),
    JSON.stringify(报2.跳过))
  ck('一篇没补成也不许那份数对不上', 报2.数对得上 === true && 报2.实补 === 2, JSON.stringify({ 应补: 报2.应补, 实补: 报2.实补 }))

  return { cardLog, cardCloud, cardRepair }
}

// ---------- 反向钉：撤掉哪一步，哪一步必须红 ----------
console.log('\n———— 反向钉 ----------')
async function reverses() {
  // ① 撤掉重渲那一步（只留补传）——那份数必须自己喊"对不上"
  {
    const m = load()
    m.cardCloud.setServer(SERVER.cards, SERVER.extra)
    m.cardCloud.refresh = async () => ({ cards: SERVER.cards, need_confirm: [], snapshots: [] })
    m.cardCloud.archive = async () => ({ ok: true })
    m.cardLog.copyIn = async (n, tpl, noQr) => [{ p: `${DIR}/${n}-${tpl}-9.jpg`, tpl, noQr }]
    m.cardLog.pruneNotCards = () => 0
    const r = await m.cardRepair.run({ avatarMissing: false, check: () => ({ tpl: 'classic' }), render: null })
    ck('反向①：没有画布那一步就红（不许静默少补一张）',
      r.报告.数对得上 === false || (r.报告.重渲 + r.报告.重出) === 0,
      `数对得上=${r.报告.数对得上} 重渲=${r.报告.重渲} 失败=${r.报告.失败.length}`)
  }
  // ② 撤掉缺图那道 guard：那篇会被当"能自动补"，界面上就承诺了一张渲不出原样的图
  {
    const m = load()
    m.cardCloud.setServer(SERVER.cards, SERVER.extra)
    const src = fs.readFileSync(path.join(MP, 'utils/cardRepair.js'), 'utf8')
    const 变异 = src.replace(/if \(o\.avatarMissing\)/, 'if (false)')
    ck('反向②：那道 guard 在源码里只有一处、且真被走到（变异锚点没漂）', 变异 !== src)
    const p = m.cardRepair.plan({ avatarMissing: true })
    ck('反向②：avatarMissing 传对时那篇确实不在重渲档', !p.reRender.some((x) => x.noteId === 6))
  }
  // ③ 把"三档"收成"只补传"：待确认那两篇消失，§五 那条"缺一档就是没解决"必须能被发现
  {
    const m = load()
    m.cardCloud.setServer(SERVER.cards, SERVER.extra)
    const p = m.cardRepair.plan({ avatarMissing: false, needConfirm: [] })
    ck('反向③：服务端那份名单一旦不读，待确认档就空——所以那条链路必须留着',
      p.needConfirm.length === 0, p.needConfirm.length)
  }
  // ④ 默认 origin 不许是 backfilled/re-rendered 混进正常生成那一路
  {
    const m = load()
    m.cardCloud.setServer(SERVER.cards, SERVER.extra)
    const 全部 = []
    m.cardCloud.refresh = async () => ({ cards: [], need_confirm: [], snapshots: [] })
    m.cardCloud.archive = async (n, e) => { 全部.push(e.origin); return { ok: true } }
    m.cardLog.copyIn = async (n, tpl, noQr) => [{ p: `${DIR}/${n}-${tpl}-9.jpg`, tpl, noQr }]
    m.cardLog.pruneNotCards = () => 0
    await m.cardRepair.run({ avatarMissing: false, check: () => ({ tpl: 'classic' }), render: async () => 't.png' })
    ck('反向④：这一趟登记的四张里没有一张被记成 live（live 只留给他自己刚生成的那一张）',
      全部.length === 4 && 全部.every((o) => o !== 'live'), JSON.stringify(全部))
  }
  // ⑤ 站长 10-08 打回那 11 个虚线空框之后，两条必须钉住：格子只画真存在的图；补卡不许新开公开码
  {
    const code = fs.readFileSync(path.join(MP, 'pages/index/index.js'), 'utf8')
    const wxml = fs.readFileSync(path.join(MP, 'pages/index/index.wxml'), 'utf8')
    ck('反向⑤：卡片那一屏只画真存在的图（不再有待确认那种空框）',
      !/needConfirm/.test(wxml) && !/needText/.test(code))
    const 那一段 = code.split('_repairCheck(x)')[1].split('_repairRender')[0]
    ck('反向⑤b：补卡那一趟里没有 createShare（只复用开着的码，绝不为出图把一篇再公开）',
      !/createShare/.test(那一段) && /getShareStatus/.test(那一段))
  }
}

;(async () => {
  await runPass()
  await reverses()
  console.log(bad.length ? `\n红 ${bad.length} 条：\n` + bad.map((b) => ' · ' + b).join('\n') : '\n全绿')
  process.exit(bad.length ? 1 : 0)
})()
