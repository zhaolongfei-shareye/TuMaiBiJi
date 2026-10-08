// 卡片留档那一趟**真的发得出去**吗——这把尺子是跑代码的，不是读代码的。
//
// 为什么必须真跑：10-08 撤 S3（补卡那一趟）时把 `copyIn` 里那句判断的条件名一起删了，
// 留下一句 `if (起留档) _archive(...)`。`起留档` 从来没声明过 → 整个 success 回调抛
// ReferenceError。静态扫是扫不出来的（那是一句语法完全合法的代码），症状却有两层：
//   ① 云上永远没登记 → 现网 `note_cards` 实测 0 行，换台手机那张卡片凭空消失；
//   ② 下面那句 `resolve(keep)` 也永远不执行 → `await cardLog.record()` 两处一起挂死
//      （卡片页存相册后那句"已保存"吐司与 navigateBack、首页成品弹窗那枚"已有卡片"）。
// 所以这一把的判据是"这一趟发出去了、而且那个 promise 落地了"，两件事分开钉。
// 跑法：node docs/工具/验-留档那一趟真发出去.js
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const R = (p) => fs.readFileSync(path.resolve(ROOT, p), 'utf8')
const CARD_LOG = 'miniprogram/utils/cardLog.js'
const CARD_CLOUD = 'miniprogram/utils/cardCloud.js'
const DETAIL = 'miniprogram/pages/detail/detail.js'
const APP = 'miniprogram/app.js'

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}

/* ---------- 跑起来的那一半：拿假 wx 真执行 cardLog ---------- */
// 每跑一份代码都要一套全新的假环境（cardLog 顶层就跑 migrateKeepOnly/migrateOnePerNote）。
function harness(code, archiveImpl) {
  const store = {}
  const files = new Set()
  const calls = []
  // 回调里抛出来的错：真机上这一句是微信框架接住的（界面不崩，只是那一趟静默没做成），
  // 所以假文件系统也要接住，否则尺子会带着整个进程一起死、看不出红在哪一条。
  const errs = []
  const guard = (f) => (...a) => { try { f(...a) } catch (e) { errs.push(e) } }
  const wx = {
    env: { USER_DATA_PATH: 'http://usr' },
    getStorageSync: (k) => store[k],
    setStorageSync: (k, v) => { store[k] = v },
    getFileSystemManager: () => ({
      mkdirSync: () => {},
      unlinkSync: (p) => { files.delete(p) },
      accessSync: (p) => { if (!files.has(p)) throw new Error('no such file: ' + p) },
      copyFile: guard(({ destPath, success }) => { files.add(destPath); setTimeout(() => guard(success)({}), 0) }),
    }),
    canvasToTempFilePath: guard(({ success }) => setTimeout(() => guard(success)({ tempFilePath: 'wxfile://tmp_card.jpg' }), 0)),
  }
  const cloudStub = {
    archive: (noteId, entry) => {
      calls.push({ noteId, entry })
      return archiveImpl ? archiveImpl(noteId, entry) : Promise.resolve({ ok: true, fileID: 'cloud://x/cards/a.jpg' })
    },
  }
  const req = (p) => (String(p).indexOf('cardCloud') >= 0 ? cloudStub : require(p))
  const mod = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', 'wx', code)(req, mod, mod.exports, wx)
  return { cardLog: mod.exports, calls, errs, store, files, addFile: (p) => files.add(p) }
}

// 一次 record()：promise 落地了就回台账那一批，超时（挂死）就回 null。
function runRecord(cardLog, ms) {
  return Promise.race([
    cardLog.record(24, 'magazine', false, { canvas: 1 }, {}),
    new Promise((resolve) => setTimeout(() => resolve(null), ms || 1500)),
  ])
}

const logSrc = R(CARD_LOG)

async function main() {
  console.log('———— ① 现在这份代码：那一趟必须真发出去，promise 必须落地 ————')
  const h = harness(logSrc)
  const keep = await runRecord(h.cardLog)
  ck('record() 的 promise 落地了（挂死＝copyIn 那个 success 回调中途抛了）', !!keep,
    keep === null ? '1.5 秒没 resolve' : '')
  const entry = keep && keep[0]
  ck('本机账里那一格指向 cards 目录下那张 jpg', !!entry && /^http:\/\/usr\/cards\/24-magazine-\d+\.jpg$/.test(entry.p),
    entry && entry.p)
  ck('留档那一趟真的发出去了（cardCloud.archive 被调一次，noteId 与模板都对）',
    h.calls.length === 1 && String(h.calls[0].noteId) === '24' && h.calls[0].entry.tpl === 'magazine',
    `调了 ${h.calls.length} 次`)
  // _archive 不 await，所以这一句要等微任务队列走完。
  await new Promise((r) => setTimeout(r, 30))
  ck('送成了就在本机账上立 `up`（下面那把补传的尺子只认这一栏）',
    !!(h.cardLog.forNote(24)[0] || {}).up)
  ck('这一趟走完没留下任何被接住的错', h.errs.length === 0, h.errs.map(String).join('；'))

  console.log('\n———— ② pendingBackfill：只挑"图还在、没立过 up、且落定超过 60 秒"的那几条 ————')
  const h2 = harness(logSrc)
  const old = Date.now() - 3600000
  const fresh = Date.now()
  const dir = 'http://usr/cards'
  h2.addFile(`${dir}/1-a.jpg`)          // 老、图在、没 up → 该补
  h2.addFile(`${dir}/2-a.jpg`)          // 老、图在、立过 up → 不补
  h2.addFile(`${dir}/3-a.jpg`)          // 新（60 秒内）、live 那一趟可能还在飞 → 这一趟不补
  h2.store.cardLog = {
    1: [{ p: `${dir}/1-a.jpg`, tpl: 'a', at: old, noQr: false }],
    2: [{ p: `${dir}/2-a.jpg`, tpl: 'a', at: old, noQr: false, up: 1 }],
    3: [{ p: `${dir}/3-a.jpg`, tpl: 'a', at: fresh, noQr: false }],
    4: [{ p: `${dir}/4-a.jpg`, tpl: 'a', at: old, noQr: false }],   // 图已经不在了 → 做不了，也不许谎称"找回"
  }
  const pend = h2.cardLog.pendingBackfill()
  ck('名单里只有那一条该补的（noteId=1）', pend.length === 1 && String(pend[0].noteId) === '1',
    pend.map((x) => x.noteId).join(','))
  h2.cardLog.markUploaded(1, `${dir}/1-a.jpg`)
  ck('markUploaded 立得上去，立完就不再进名单',
    h2.cardLog.forNote(1)[0].up === 1 && h2.cardLog.pendingBackfill().length === 0)

  console.log('\n———— ③ 反向：把当年那句 `if (起留档)` 原样钉回来 ————')
  const mut = logSrc.replace('        _archive(noteId, entry)', '        if (起留档) _archive(noteId, entry)')
  if (mut === logSrc) { console.log('✗ 变异没打上（锚点漂了）'); process.exit(2) }
  const h3 = harness(mut)
  const keep3 = await runRecord(h3.cardLog, 800)
  const 红3a = h3.calls.length === 0
  const 红3b = keep3 === null
  const 红3c = h3.errs.some((e) => /起留档/.test(String(e && e.message)))
  console.log(`${红3a ? '✓' : '✗'} 那一趟没发出去 → 判据"真的发出去了"红（现网 0 行就是这么来的）`)
  console.log(`${红3b ? '✓' : '✗'} promise 挂死 → 判据"promise 落地"红（两处 await 一起卡住）`)
  console.log(`${红3c ? '✓' : '✗'} 抛的就是那一句 ReferenceError（界面上一个字都不显示）`)
  if (!红3a || !红3b || !红3c) bad.push('反向③没红在对的地方：那几条判据是假的')

  console.log('\n———— ④ 反向：整句撤掉留档（promise 会落地，但云上永远没那一行） ————')
  const mut2 = logSrc.replace('        _archive(noteId, entry)\n', '')
  if (mut2 === logSrc) { console.log('✗ 变异没打上（锚点漂了）'); process.exit(2) }
  const h4 = harness(mut2)
  const keep4 = await runRecord(h4.cardLog, 800)
  const 红4 = !!keep4 && h4.calls.length === 0
  console.log(`${红4 ? '✓' : '✗'} promise 落地了、那一趟却没发 → 只有"真的发出去了"这一条红（两条判据互不遮蔽）`)
  if (!红4) bad.push('反向④没红在对的地方')

  console.log('\n———— ⑤ 接线：大图吃云上那一份、补传那一头挂在回前台 ————')
  const cloud = R(CARD_CLOUD), det = R(DETAIL), app = R(APP)
  ck('cellFor 每一格都额外带 `cloud`（本机那一路也带，大图要用）',
    /const local = cardLog\.aliveFor\(noteId\)\.map\(\(x\) => Object\.assign\(\{\}, x, \{ cloud \}\)\)/.test(cloud))
  ck('详情页那枚大图吃 cloud、退回本机路径（本机那张在 USER_DATA_PATH 下，previewImage 真机不认）',
    /const url = cards\[0\]\.cloud \|\| cards\[0\]\.p/.test(det) && /wx\.previewImage\(\{ urls: \[url\], current: url \}\)/.test(det))
  ck('补传那一头挂在 app.onShow（与待补绑、待删、待补登记同一处）',
    /cardCloud\.backfillLocal\(\)/.test(app))
  ck('补传只处理"图还在本机"这一档，origin 走服务端已有的 backfilled',
    /origin: 'backfilled'/.test(cloud) && /cardLog\.pendingBackfill\(\)/.test(cloud))
  ck('云上已经有那一行的不重复传（只立 up）——一次 onShow 多传一个没人认的对象是白丢配额',
    /if \(serverCard\(it\.noteId\)\) \{ cardLog\.markUploaded\(it\.noteId, it\.entry\.p\); continue \}/.test(cloud))
  ck('补传这一族全程不抛、不 await、不动界面（archive 自己那一层已经包死）',
    /async function backfillLocal\(\)/.test(cloud) && !/await cardCloud\.backfillLocal/.test(app))

  console.log(`\n${bad.length ? '红 ' + bad.length + ' 条：' + bad.join('、') : '全绿'}`)
  process.exit(bad.length ? 1 : 0)
}

main().catch((e) => { console.error('尺子自己崩了：', e && (e.stack || e.message)); process.exit(1) })
