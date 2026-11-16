// Z69（第十轮 §6.4 的 E2-7 那一格）：卡片「补传」那一趟，判"云上没那一行"之前先把名单读回来。
//
// 两端同一形状的一刀：
//   miniprogram/utils/cardCloud.js 的 backfillLocal()
//   TuMaiBiJi-H5/js/cardCloud.js   的 backfillLocal()
// 这一把不数源码文本（注释里本来就写着那句话，数它等于没数）：真实字节送进 `node:vm`，
// 只把它依赖的四只模块换成**会记账的桩**。桩的形状照真实实现：
//   `pendingBackfill()` 回 `[{noteId, entry:{p,tpl,noQr,at}}]`（utils/cardLog.js:145、js/cardLog.js:108）
//   `getMyCards()` 回 `{cards:[{note_id,cloud_url,tpl,no_qr,origin}]}`（js/api.js:266）
//   进桶那两口回 `{fileID}`（utils/cloudUpload.js:59）／`{file_id,size,width,height}`（js/api.js:270）
//   `putNoteCard()` 回 `{replaced_file_ids:[]}`（routes/cards.py 那一口的回体）
// 于是"这一趟送了几张""台账那几条有没有被立成 up"全是数出来的，不是看出来的。
//
// 它钉的坏法（改之前真实会发生的那一态）：冷开时 `app.onShow`／`App.flushQueues` 不等列表页那一趟名单，
// 内存里 `serverCards` 是空的；`backfillLocal` 原来只问"本机有没有、`serverCard()` 读不读得回来"，
// 于是本机每张没登记成的都被当成"云上缺"重送一趟，而服务端「一篇一张」的唯一索引让**后到的赢**
// ⇒ 另一台设备刚出的那一张被这台设备那份旧缓存顶成历史。更要紧的是送完就把台账那一条立上 `up`：
// 欠账被洗掉，下一次进前台连补的机会都没有。
//
// 六组读数（每组两端各跑一遍）：
//   S1 名单读不回来 ⇒ 整趟不送：进桶 0 张、登记 0 次、立 up 0 条、回 `deferred: true`；
//   S2 名单读回来了 ⇒ 云上已有那一行的那张不重送（只立 up），缺的那一张才送；
//   S3 名单早就读回来过 ⇒ 这一趟不再白打一次名单（`getMyCards` 0 发），该送的照送；
//   S4 本机没有欠账 ⇒ 当场回，名单一发都不打；
//   S5 没登录／云能力不可用 ⇒ 当场回，名单一发都不打；
//   S6 名单读回来是**空的**（这人确实一张都没登记过）⇒ 该送还得送，不许拿"读过＝空"整趟不送。
//
// 跑法：node docs/工具/验-审计Z69补传先读名单-静态.js          正向，期望六组×两端＋结构三组全过
//       node docs/工具/验-审计Z69补传先读名单-静态.js --rev     反向：撤掉 `!isLoaded()` 那一闸 → S1+S2+S6 两端必红
//       node docs/工具/验-审计Z69补传先读名单-静态.js --rev2    反向：撤掉"没有欠账就当场回" → S4 两端必红
//       node docs/工具/验-审计Z69补传先读名单-静态.js --rev3    反向：撤掉"没上云就当场回" → S5 两端必红
// ⚠ 反向那三种模式**只跑六组读数、不跑结构三组**：G1/G2 钉的就是那一闸的字节，撤掉它必红，
//   混进判据里就分不清"这一刀有牙"和"这一刀拆了别处"。
// ⚠ `--rev` 一次红三组不是"牵连"，是这一闸本来就干两件事：撤了它，S1 不再拦（进桶 2 张＝那一态），
//   S2 因为名单没读回来 ⇒ 云上已有那一行的那张也重送（同样进桶 2 张），S6 因为不再打名单而拿不到"读过"。
//   所以每一枚反向都写明"该红的是哪几组"，R2 只许这些组红。
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ROOT = path.resolve(__dirname, '../..')
const H5 = path.resolve(ROOT, '../TuMaiBiJi-H5')
const MP_FILE = path.join(ROOT, 'miniprogram/utils/cardCloud.js')
const H5_FILE = path.join(H5, 'js/cardCloud.js')
const MODE = process.argv.includes('--rev') ? 'rev'
  : process.argv.includes('--rev2') ? 'rev2'
    : process.argv.includes('--rev3') ? 'rev3' : ''
// 每一枚反向只该红哪几组（上面注释写明为什么 `--rev` 是三组）
const MUST_RED = { rev: ['S1', 'S2', 'S6'], rev2: ['S4'], rev3: ['S5'] }

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got !== undefined ? `　→ ${got}` : ''}`)
  if (!ok) bad.push(name)
}

const read = (p) => {
  if (!fs.existsSync(p)) { console.error(`源码不在：${p}`); process.exit(2) }
  return fs.readFileSync(p, 'utf8')
}

// ---------- 三处反向 mutation：只动被测那一句，别的一字不改 ----------
// 找不到那一处就当场退出：反向验证最怕"mutation 没生效，于是红的是别处"。
const cut = (text, re, label) => {
  if (!re.test(text)) { console.error(`反向失效：${label} 没在这份字节里找到`); process.exit(2) }
  return text.replace(re, '')
}
const mutators = {
  // Z69 那一闸整块（三行）
  rev: (t) => cut(t, /\n[ \t]*if \(!isLoaded\(\)\) \{\n[ \t]*await refresh\(\)\n[ \t]*if \(!isLoaded\(\)\) return \{ sent: 0, total: pending\.length, deferred: true \}\n[ \t]*\}/, 'Z69 那一闸'),
  // 没有欠账就当场回
  rev2: (t) => cut(t, /\n[ \t]*if \(!pending\.length\) return \{ sent: 0, total: 0 \}/, '没有欠账就当场回'),
  // 没上云／没登录就当场回（两端各一枚谓词）
  rev3: (t) => cut(t, /\n[ \t]*if \((?:!_onServer\(\)|!cloudUpload\.cloudReady\(\))\) return \{ sent: 0, total: 0 \}/, '没上云就当场回'),
}
const mutate = (text) => (MODE ? mutators[MODE](text) : text)

const mpSrc = mutate(read(MP_FILE))
const h5Src = mutate(read(H5_FILE))

// ---------- 世界：一次全新的 vm 上下文 + 一份会记账的桩 ----------
// o = { pending, roster, rosterFail, offline }；n 是这一趟的账。
const P2 = [
  { noteId: '7', p: 'wxfile://tmp/card-7.jpg' },
  { noteId: '8', p: 'wxfile://tmp/card-8.jpg' },
]
const card = (noteId) => ({
  note_id: noteId, cloud_url: `cloud://env/notes/${noteId}.jpg`, tpl: 'q:v2', no_qr: false, origin: 'live',
})
const pendingStub = (o) => (o.pending || []).map((x) => ({
  noteId: x.noteId, entry: { p: x.p, tpl: 'q:v2', noQr: false, at: 0 },
}))

const worldMP = (o) => {
  const n = { getMyCards: 0, getNoteCard: 0, upload: 0, put: 0, mark: 0, settle: 0 }
  const mods = {
    './cloudUpload.js': {
      cloudReady: () => !o.offline,
      uploadImage: async (p) => { n.upload += 1; return { fileID: 'cloud://env.cards/' + p } },
      deleteFiles: async () => true,
      dropFromDeleteRes: async () => 0,
      reservePurge: () => {}, unreservePurge: () => {},
    },
    './cardQueue.js': {
      settle: () => { n.settle += 1 }, push: () => {}, take: () => [], clear: () => {}, flush: async () => {},
    },
    './cardLog.js': {
      pendingBackfill: () => pendingStub(o),
      markUploaded: () => { n.mark += 1 },
      aliveFor: () => [], forNote: () => [], dropNote: () => {},
    },
    './api.js': {
      getMyCards: async () => {
        n.getMyCards += 1
        if (o.rosterFail) throw { statusCode: 401, errMsg: 'request:fail' }
        return { cards: o.roster || [], need_confirm: [], snapshots: [] }
      },
      getNoteCard: async () => { n.getNoteCard += 1; return { card: null, had_share: false } },
      putNoteCard: async () => { n.put += 1; return { replaced_file_ids: [] } },
      deleteNoteCard: async () => ({ file_ids: [] }),
      friendlyDetail: (d) => d || '',
    },
  }
  const ctx = vm.createContext({
    console, Promise, JSON, Math, Date, Number, Object, Array, String, RegExp,
    module: { exports: {} }, exports: {},
    require: (id) => {
      if (!mods[id]) { console.error(`桩没配这一只模块：${id}`); process.exit(2) }
      return mods[id]
    },
    getApp: () => ({ globalData: { userId: 'u1' } }),
    wx: {
      getFileSystemManager: () => ({ statSync: () => ({ size: 88000 }) }),
      getImageInfo: (arg) => { arg.success({ width: 900, height: 1200 }) },
    },
  })
  vm.runInContext(mpSrc, ctx)
  return { CC: ctx.module.exports, n }
}

const worldH5 = (o) => {
  const n = { getMyCards: 0, getNoteCard: 0, upload: 0, put: 0, mark: 0, settle: 0 }
  const ctx = vm.createContext({
    console, Promise, JSON, Math, Date, Number, Object, Array, String, RegExp,
    Api: {
      getMyCards: async () => {
        n.getMyCards += 1
        if (o.rosterFail) throw { statusCode: 401, detail: '票没了' }
        return { cards: o.roster || [], need_confirm: [], snapshots: [] }
      },
      getNoteCard: async () => { n.getNoteCard += 1; return { card: null, had_share: false } },
      putNoteCard: async () => { n.put += 1; return { replaced_file_ids: [] } },
      deleteNoteCard: async () => ({ file_ids: [] }),
      uploadCardImage: async (id, p) => {
        n.upload += 1
        return { file_id: 'cloud://cards/' + p, size: 88000, width: 900, height: 1200 }
      },
      friendlyDetail: (d) => d || '',
    },
    CardLog: {
      pendingBackfill: () => pendingStub(o),
      markUploaded: () => { n.mark += 1 },
      aliveFor: () => [], forNote: () => [], dropNote: () => {},
    },
    CardQueue: {
      KEY: 'cardQueue', MAX_QUEUE: 20,
      settle: () => { n.settle += 1 }, push: () => {}, take: () => [], clear: () => {}, flush: async () => {},
    },
    CloudUrl: { toHttp: (u) => (u ? 'https://cdn/x' + u : '') },
    App: { globalData: { token: o.offline ? '' : 'tk', guestMode: !!o.offline, userId: 'u1' } },
  })
  ctx.window = ctx
  ctx.globalThis = ctx
  vm.runInContext(h5Src, ctx)
  return { CC: ctx.window.CardCloud, n }
}

// 六组：每组一个**全新的世界**（内存里那份名单是模块级状态，复用世界就会互相漏数）。
const groups = () => ([
  {
    name: 'S1', o: { pending: P2, rosterFail: true },
    fn: async (w) => {
      const r = await w.CC.backfillLocal()
      ck(`${w.tag} S1 名单读不回来 ⇒ 整趟不送：进桶 0／登记 0／立 up 0／deferred 那句给了`,
        !!r && r.deferred === true && r.sent === 0 && r.total === 2
        && w.n.getMyCards === 1 && w.n.upload === 0 && w.n.put === 0 && w.n.mark === 0,
        `名单 ${w.n.getMyCards} 发、进桶 ${w.n.upload} 张、立 up ${w.n.mark} 条`)
    },
  },
  {
    name: 'S2', o: { pending: P2, roster: [card(7)] },
    fn: async (w) => {
      const r = await w.CC.backfillLocal()
      ck(`${w.tag} S2 名单读回来了 ⇒ 云上已有那一行的不重送（只立 up），缺的那一张才送`,
        !!r && r.deferred === undefined && r.sent === 1 && r.total === 2
        && w.n.getMyCards === 1 && w.n.upload === 1 && w.n.put === 1 && w.n.mark === 2,
        `进桶 ${w.n.upload} 张（该 1）／登记 ${w.n.put} 次（该 1）／立 up ${w.n.mark} 条（该 2）`)
    },
  },
  {
    name: 'S3', o: { pending: [P2[1]], roster: [] },
    fn: async (w) => {
      w.CC.setServer([card(9)])           // 列表页那一趟已经把名单读回来了
      const r = await w.CC.backfillLocal()
      ck(`${w.tag} S3 名单早读过 ⇒ 这一趟不再白打名单，该送的那张照送`,
        !!r && r.sent === 1 && w.n.getMyCards === 0 && w.n.upload === 1 && w.n.put === 1,
        `名单 ${w.n.getMyCards} 发（该 0）／进桶 ${w.n.upload} 张（该 1）`)
    },
  },
  {
    name: 'S4', o: { pending: [], roster: [] },
    fn: async (w) => {
      const r = await w.CC.backfillLocal()
      ck(`${w.tag} S4 本机没欠账 ⇒ 当场回，名单一发都不打`,
        !!r && r.sent === 0 && r.total === 0 && w.n.getMyCards === 0 && w.n.upload === 0,
        `名单 ${w.n.getMyCards} 发`)
    },
  },
  {
    name: 'S5', o: { pending: [P2[0]], offline: true, roster: [] },
    fn: async (w) => {
      const r = await w.CC.backfillLocal()
      ck(`${w.tag} S5 没登录／云能力不可用 ⇒ 当场回，名单一发都不打`,
        !!r && r.sent === 0 && r.total === 0 && w.n.getMyCards === 0 && w.n.upload === 0,
        `名单 ${w.n.getMyCards} 发`)
    },
  },
  {
    name: 'S6', o: { pending: [P2[0]], roster: [] },
    fn: async (w) => {
      const r = await w.CC.backfillLocal()
      ck(`${w.tag} S6 名单读回来是空的（真的一张没登记）⇒ 该送还得送，不许拿"读过＝空"整趟不送`,
        !!r && r.deferred === undefined && r.sent === 1 && r.total === 1
        && w.n.getMyCards === 1 && w.n.upload === 1,
        `进桶 ${w.n.upload} 张（该 1）／deferred=${r && r.deferred}`)
    },
  },
])

const bodyOf = (src, endMark, who) => {
  const at = src.indexOf('async function backfillLocal()')
  if (at < 0) { console.error(`${who} 的 backfillLocal 没找到`); process.exit(2) }
  const end = src.indexOf(endMark, at)
  if (end < 0) { console.error(`${who} 的 backfillLocal 收口没找到`); process.exit(2) }
  return src.slice(at, end)
}

async function main() {
  console.log(`Z69 补传先读名单 · ${MODE ? '反向 ' + MODE : '正向'}`)
  const reds = {}
  for (const pair of [
    { tag: '小程序', world: worldMP },
    { tag: 'H5', world: worldH5 },
  ]) {
    const before = bad.length
    for (const g of groups()) {
      const w = pair.world(g.o)
      w.tag = `${pair.tag}`
      await g.fn(w)
    }
    reds[pair.tag] = bad.slice(before).map((x) => x.split(' ')[1])
  }

  if (!MODE) {
    // ---------- 结构那一组：给上面六组的"为什么"留一枚精确靶（只看代码，不看注释） ----------
    const strip = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\*\*[\s\S]*?\*\//g, '')
    const mpBody = strip(bodyOf(read(MP_FILE), '\n}', '小程序'))
    const h5Body = strip(bodyOf(read(H5_FILE), '\n  }', 'H5'))
    const gateAt = (b) => b.indexOf('if (!isLoaded())')
    const firstHit = (b) => b.indexOf('serverCard(')
    ck('G1 两端都在第一次问 `serverCard()` 之前放了这道闸（顺序错了六组全是假绿）',
      gateAt(mpBody) >= 0 && firstHit(mpBody) >= 0 && gateAt(mpBody) < firstHit(mpBody)
      && gateAt(h5Body) >= 0 && firstHit(h5Body) >= 0 && gateAt(h5Body) < firstHit(h5Body),
      `小程序 ${gateAt(mpBody)}<${firstHit(mpBody)}　H5 ${gateAt(h5Body)}<${firstHit(h5Body)}`)
    const shape = /if \(!isLoaded\(\)\) \{\s*await refresh\(\)\s*if \(!isLoaded\(\)\) return \{ sent: 0, total: pending\.length, deferred: true \}/
    ck('G2 闸里就是"先补读一次、仍读不回来就整趟不送"那两句（没有第三种出口）',
      shape.test(mpBody) && shape.test(h5Body), '')
    ck('G3 闸只读名单一次：`await refresh()` 每端一处、`isLoaded` 每端两处',
      (mpBody.match(/await refresh\(\)/g) || []).length === 1
      && (mpBody.match(/isLoaded\(\)/g) || []).length === 2
      && (h5Body.match(/await refresh\(\)/g) || []).length === 1
      && (h5Body.match(/isLoaded\(\)/g) || []).length === 2,
      `小程序 ${(mpBody.match(/isLoaded\(\)/g) || []).length}／H5 ${(h5Body.match(/isLoaded\(\)/g) || []).length} 处`)
  }

  console.log('')
  if (MODE) {
    const want = MUST_RED[MODE]
    const mpHit = reds['小程序']
    const h5Hit = reds['H5']
    const miss = want.filter((g) => mpHit.indexOf(g) < 0 || h5Hit.indexOf(g) < 0)
    ck(`R1 反向 ${MODE}：该红的 ${want.join('/')} 在**两端**都红了`, miss.length === 0,
      miss.length ? `没红 [${miss.join(',')}]` : `小程序红 [${mpHit.join(',')}]／H5 红 [${h5Hit.join(',')}]`)
    const others = Array.from(new Set(mpHit.concat(h5Hit).filter((g) => want.indexOf(g) < 0)))
    ck(`R2 反向 ${MODE}：只红这几组，别的一组没被牵连`, others.length === 0, `牵连 [${others.join(',')}]`)
    const pass = miss.length === 0 && others.length === 0
    console.log(`合计：${pass ? `反向验证成立（${want.join('/')} 该红的红了、别处没被牵连）` : '反向有问题'}`)
    process.exit(pass ? 0 : 1)
  }
  console.log(`合计：${bad.length === 0 ? '全过' : '红 ' + bad.length + ' 条'}`)
  if (bad.length) bad.forEach((x) => console.log(`  ✗ ${x}`))
  process.exit(bad.length ? 1 : 0)
}

main().catch((e) => { console.error('尺子自己崩了：', e && e.stack ? e.stack : e); process.exit(3) })
