// 一把静态尺子（跑代码，不读源码）：证明 `尺子挑没卡片那一篇.js` 那三档烤出来的函数体真能执行、
// 摘得掉也装得回。**为什么要有它**：10-09 给助手加了第三档（`RULER_NOTE_ID` 点名）之后，
// 三档的 `mp.evaluate` 全从"值当第二个参数递"改成**烤进函数体字面量**（`MiniProgram.evaluate` 不吃参数）。
// 烤出来的是一段字符串源码——`node --check` 只能证明**外层**那份文件能解析，证明不了拼进 `${...}`
// 的那个值不破坏语法，更证明不了它在小程序侧跑得动。而"借"那一档今天没被用上，
// 不写这一把就等于"改了一条没人复跑的路径"（[[feedback-ruler-units-and-box-model]] 第 42 条那个形状）。
//
// 跑法：node docs/工具/验-借那一档摘得装得回.js            正向，期望 15 条全绿
//       … --rev   把助手源码里的 `'cardLog'` 换成另一本账 → **必须红的事前一名单，且只红这些**
//       … --rev2  假 storage 在"装回"那一步吞掉写 → 必须红的是那两条现读复核
//
// 假 storage **只认 `cardLog` 这一本真账**（那是应用真正的钥匙，`cardCloud.hasCard` 读的就是它）。
// 反向那两刀各自证明一件独立的事：键名错＝它动的不是用户那本账；吞掉写＝"写过"不等于"立上了"那句
// 现读复核不是摆设。哪一刀落下而没有对应的红，就说明那一条判据其实是永真式。
const fs = require('fs')
const path = require('path')

const REV = process.argv.includes('--rev')
const REV2 = process.argv.includes('--rev2')
const TRUE_KEY = 'cardLog'                       // 应用那本真账，假 storage 只供这一本
const LS = String.fromCharCode(0x2028)           // 行终止符：JSON 合法、JS 源码里会断句，值里偏要有
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got !== undefined ? `　→ ${got}` : ''}`)
  if (!ok) bad.push(name)
}

// 假的一台小程序：storage 是一个对象，`getCurrentPages()` 回一篇列表，`evaluate` 直接**执行**收到的函数
// （automator 那边是把源码字符串发过去执行，这里等价——烤坏的字符串在这一步就 SyntaxError）。
const makeMp = (notes, ledger) => {
  const store = {}
  store[TRUE_KEY] = JSON.parse(JSON.stringify(ledger || {}))
  let freeze = false                              // --rev2 的那一刀
  globalThis.wx = {
    getStorageSync: (k) => JSON.parse(JSON.stringify(store[k] || {})),
    setStorageSync: (k, v) => { if (!freeze) store[k] = JSON.parse(JSON.stringify(v)) },
  }
  globalThis.getCurrentPages = () => [{ data: { notes } }]
  const mp = {
    async callWxMethod() {},
    async evaluate(fn) { return await fn() },
    __store: () => store,
    __real: (id) => (store[TRUE_KEY] || {})['' + id],
    __freeze: (on) => { freeze = !!on },
  }
  return mp
}

// 变异体必须现编一份源码：`require()` 拿到的是缓存，改了文件也读不到新的。
const loadHelper = () => {
  let src = fs.readFileSync(path.resolve(__dirname, '尺子挑没卡片那一篇.js'), 'utf8')
  if (REV) src = src.split("'" + TRUE_KEY + "'").join("'cardLogWRONG'")
  const m = { exports: {} }
  new Function('module', 'exports', 'require', '__dirname', src)(m, m.exports, require, __dirname)
  return m.exports
}

const N1 = '没点名时：free 只装真没卡片的那两篇'
const N2 = '没点名时：all 给整份名单并带上 hasCard（"借"那一档靠它挑）'
const N3 = '点名那一篇：free 只剩它（烤进函数体那个数真跑得动）'
const N4 = '点名那一篇：want 原样回出来（判据红时要能看出点了谁）'
const N5 = '点名一篇列表里没有的：不许伪装成 free，回 namedFound=false'
const N6 = '点名给一个带引号花括号的脏形状：`/^(\\d+)$/` 那道闸要真挡得住（烤之前先收窄）'
const T1 = '借：那一栏真摘掉了（stillThere 必须 false，removed 是原来那一条）'
const T2 = '借：真账里那一栏确实没了、这本账没剩别的栏'
const P1 = '装回：现读那一份与原样快照逐字相等（"写过"不等于"立上了"）'
const P2 = '装回：那一条真的回到**真账**上（不是回到助手自己另起的那本）'
const T3 = '借一篇本来就没卡片的：回 removed=null，调用方因此不去装（不假装摘了什么）'
const P3 = '没借到就不许写回（skipped 那一条要真空转）'
const U1 = '借一条值里带 U+2028 的：摘得动（先证明这一把喂的东西真带那个字符）'
const U2 = '带 U+2028 那一条装回后现读相等（转义没把值改掉、也没把源码弄断）'
const G1 = 'noteId 不是纯数字：当场回 err，不往函数体里拼'
const ALL = [N1, N2, N3, N4, N5, N6, T1, T2, P1, P2, T3, P3, U1, U2, G1]

;(async () => {
  const freeNote = loadHelper()
  const notes = [{ id: 7, title: '有卡片的一篇' }, { id: 8, title: '空的一篇' }, { id: 9, title: '验收 Acceptance 9' }]
  const ONE = [{ p: `http://usr/${LS}cards/8-classic-1.jpg`, tpl: 'classic', at: 1, noQr: 0, up: 1 }]
  const ledger = { 7: [{ p: 'http://usr/cards/7-classic-1.jpg', tpl: 'classic', at: 1, noQr: 0, up: 1 }] }

  // ---------- ① find：三档共同的入口，值全烤在函数体里 ----------
  process.env.RULER_NOTE_ID = ''
  let mp = makeMp(notes, ledger)
  let f = await freeNote.find(mp)
  ck(N1, f.free.length === 2 && f.free.every((n) => !n.hasCard) && f.total === 3,
    `total=${f.total} free=${f.free.map((n) => n.id).join(',')} withCard=${f.withCard}`)
  ck(N2, f.all.length === 3 && f.all.filter((n) => n.hasCard).length === 1,
    `带卡片那一篇=${(f.all.filter((n) => n.hasCard)[0] || {}).id}`)

  process.env.RULER_NOTE_ID = '9'
  mp = makeMp(notes, ledger)
  f = await freeNote.find(mp)
  ck(N3, f.free.length === 1 && String(f.free[0].id) === '9' && f.namedFound === true,
    `free=${JSON.stringify(f.free.map((n) => n.id))} namedFound=${f.namedFound}`)
  ck(N4, f.want === '9', String(f.want))

  process.env.RULER_NOTE_ID = '999'
  mp = makeMp(notes, ledger)
  f = await freeNote.find(mp)
  ck(N5, f.free.length === 0 && f.namedFound === false, `free=${f.free.length} namedFound=${f.namedFound}`)

  process.env.RULER_NOTE_ID = '7" }'
  ck(N6, freeNote.wantedId() === '', `wantedId()=${JSON.stringify(freeNote.wantedId())}`)

  // ---------- ② takeOver / putBack：今天没被用上那一档 ----------
  delete process.env.RULER_NOTE_ID
  mp = makeMp(notes, ledger)
  const t = await freeNote.takeOver(mp, 7)
  ck(T1, t.stillThere === false && Array.isArray(t.removed) && t.removed.length === 1, JSON.stringify(t.removed))
  ck(T2, mp.__real(7) === undefined && Object.keys(mp.__store()[TRUE_KEY] || {}).length === 0,
    `剩下的栏=${JSON.stringify(Object.keys(mp.__store()[TRUE_KEY] || {}))}`)

  if (REV2) mp.__freeze(true)               // 这一刀：装回那一步的写被 storage 吞掉
  const back = await freeNote.putBack(mp, 7, t.removed)
  ck(P1, back.ok === true, JSON.stringify(back))
  ck(P2, Array.isArray(mp.__real(7)) && mp.__real(7)[0].p === ledger[7][0].p, JSON.stringify(mp.__real(7)))
  if (REV2) mp.__freeze(false)

  mp = makeMp(notes, ledger)
  const t2 = await freeNote.takeOver(mp, 8)
  ck(T3, t2.removed === null, JSON.stringify(t2))
  const b2 = await freeNote.putBack(mp, 8, t2.removed)
  ck(P3, b2.ok === true && !!b2.skipped, String(b2.skipped))

  mp = makeMp(notes, { 8: ONE })
  const t3 = await freeNote.takeOver(mp, 8)
  ck(U1, !!(t3.removed && t3.removed[0].p.indexOf(LS) >= 0), JSON.stringify(t3.removed && t3.removed[0].p))
  if (REV2) mp.__freeze(true)
  const b3 = await freeNote.putBack(mp, 8, t3.removed)
  ck(U2, b3.ok === true, JSON.stringify(b3))
  if (REV2) mp.__freeze(false)

  const t4 = await freeNote.takeOver(mp, '7 or 1=1')
  ck(G1, !!t4.err, JSON.stringify(t4))

  // ---------- 反向：该红的事前一名单，且**只许红这些** ----------
  const EXPECT = { rev: [N1, N2, T1, T2, U1], rev2: [P1, P2, U2] }
  const want = REV ? EXPECT.rev : (REV2 ? EXPECT.rev2 : [])
  if (want.length) {
    const gotList = ALL.filter((n) => bad.includes(n))
    ck(`反向（${REV ? '键名挪到另一本账' : '装回那一步吞掉写'}）红的就是事前那一串`,
      gotList.join('|') === want.join('|'), `应红 ${want.length} 条：${want.join(' | ')}　实红：${gotList.join(' | ') || '（一条都没红＝这几条是永真式）'}`)
    console.log('　· 没点名/点名那几条在"键名"这一刀下面**不该**红（点名走的是列表那一半，与台账无关）——'
      + '这一条是 10-09 我先猜错了一次才写死的：反向验证要逐句对，不能只看红了几条。')
    process.exit(bad.includes(`反向（${REV ? '键名挪到另一本账' : '装回那一步吞掉写'}）红的就是事前那一串`) ? 1 : 0)
  }

  console.log(`\n${bad.length ? `✗ ${bad.length} 条不过：${bad.join(' | ')}` : '全过'}`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('✗ 跑挂了：', (e && e.message) || JSON.stringify(e)); process.exit(1) })
