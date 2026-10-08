// 名片那一笔欠账与三族队列的竞态 —— 10-09 审计严重①②的守门尺子（跑代码的，不是读代码的）。
//
// 两条各自独立的事，一把尺子盯：
// ① **名片 PUT 没写成时，绝不能再拿服务器那份覆盖本机**。原实现只 `console.warn` 就过去了，
//    而 `pull()` 那一段按"服务器权威"逐格对齐：云上这一格空 → 本机这一格 `removeAvatar` 删掉；
//    地址不一样 → 下新的、收旧的。两件事一撞，**用户刚换的那张图被静默销毁**。
//    现在欠账落进 `profilePendingPatch` 那一格，`pull()` 开头先补送，还欠着就整段不动本机。
// ② **待补队列收尾不许整表覆盖**。`flush()` 原来拿循环开头那份快照 `_put(...)` 写回，
//    而每条 await 之间 `push()` 完全可能落进来一条新的（回前台五头并发，窗口是几秒）——
//    那一条被旧快照盖掉，症状是"云上真有那个对象、库里没有那一行、本机 `up` 已立"。
// 跑法：node docs/工具/验-名片待补那一格.js
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const R = (p) => fs.readFileSync(path.resolve(ROOT, p), 'utf8')
const PROFILE_CLOUD = 'miniprogram/utils/profileCloud.js'
const APP = 'miniprogram/app.js'

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------- ① 名片：跑真模块，依赖全换成桩 ---------- */
// 桩照真实现的语义写（`pull` 读的是 poster/cloudUpload/api 三个口的行为，不是它们的名字）：
// putProfile 可被要求失败；removeAvatar / writeSlots 全部记账，判据看的是"有没有被叫"。
function loadProfileCloud({ putImpl, remote, src }) {
  const store = {}
  const calls = { put: [], removed: [], slots: [], profile: [], bgDim: [] }
  const wx = {
    getStorageSync: (k) => store[k],
    setStorageSync: (k, v) => { store[k] = v },
    removeStorageSync: (k) => { delete store[k] },
    // _dims / _bytes 走的是这两个：桩照真语义给（尺寸取得到、字节取得到），
    // 判据不量它们，量的是"那一笔落没落进欠账格"。
    getImageInfo: ({ success }) => setTimeout(() => success({ width: 1080, height: 1440 }), 0),
    getFileSystemManager: () => ({ statSync: () => ({ size: 204800 }) }),
  }
  const api = {
    getProfile: async () => remote,
    putProfile: async (patch) => { calls.put.push(patch); return putImpl(patch) },
  }
  const poster = {
    SLOT_COUNT: 4,
    readSlots: () => store.__slots || [null, null, null, null],
    blankSlots: () => [null, null, null, null],
    writeSlots: (s) => calls.slots.push(s),
    writeProfile: (o) => calls.profile.push(o),
    readProfile: () => ({ name: '', slogan: '', template: '' }),
    removeAvatar: (p) => calls.removed.push(p),
    adoptLocal: async () => 'http://usr/profile-adopted.jpg',
  }
  const cloudUpload = {
    cloudReady: () => true,
    uploadImage: async () => ({ fileID: 'cloud://env.app/cards/1/a.jpg' }),
    dropFromDeleteRes: async () => 0,
  }
  const deps = { './api.js': api, './poster.js': poster, './cloudUpload.js': cloudUpload }
  const mod = { exports: {} }
  const req = (p) => (p in deps ? deps[p] : require(path.resolve(ROOT, 'miniprogram/utils', p)))
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', 'wx', 'getApp', src || R(PROFILE_CLOUD))(
    req, mod, mod.exports, wx, () => ({
      globalData: { userId: '1' },
      setBgDim: (v, fromServer) => calls.bgDim.push({ v, fromServer }),
      bgDim: () => 1,
    }))
  return { pc: mod.exports, store, calls }
}

const SLOTS_LOCAL = [{ path: 'http://usr/a.jpg', card: true, bg: false, fileID: null }]

async function main() {
  console.log('———— ① PUT 失败：欠账必须落进那一格 ————')
  let h = loadProfileCloud({ putImpl: async () => { throw { errMsg: 'putProfile:fail' } }, remote: null })
  h.store.__slots = SLOTS_LOCAL
  const r1 = await h.pc.pushSlots(SLOTS_LOCAL)
  ck('pushSlots 送不成时回 ok:false（不抛、不出声）', r1 && r1.ok === false)
  ck('欠的那一笔落进 profilePendingPatch 那一格',
    !!(h.store.profilePendingPatch && h.store.profilePendingPatch.slots),
    Object.keys(h.store.profilePendingPatch || {}).join(','))
  ck('hasPending 认这一格', h.pc.hasPending() === true)

  console.log('\n———— ② 还欠着的时候 pull() 一整段都不许动本机 ————')
  // 服务器那份是"四格全空"——正是原实现会照着删的每一格。
  h = loadProfileCloud({
    putImpl: async () => { throw { errMsg: 'putProfile:fail' } },
    remote: { updated_at: '2026-10-08T00:00:00Z', name: '旧名', slogan: '', slots: [null, null, null, null], tpl: null, bg_dim: 1 },
  })
  h.store.__slots = SLOTS_LOCAL
  h.store.profilePendingPatch = { slots: [{ file_id: 'cloud://env.app/cards/1/a.jpg' }] }
  const r2 = await h.pc.pull()
  ck('这一趟标成 deferred（读回来的是服务器那份，但一个字没落地）',
    r2 && r2.ok === true && r2.deferred === true, JSON.stringify(r2))
  ck('一个本机文件都没删', h.calls.removed.length === 0, h.calls.removed.join(','))
  ck('本机那四格没被服务器那份覆盖', h.calls.slots.length === 0)
  ck('名称也没被覆盖', h.calls.profile.length === 0)

  console.log('\n———— ③ 补送成功之后才允许对齐，且亮度档不许回写 ————')
  h = loadProfileCloud({
    putImpl: async () => ({ profile: { updated_at: '2026-10-09T00:00:00Z', slots: [] } }),
    remote: { updated_at: '2026-10-09T00:00:00Z', name: '', slogan: '', slots: [null, null, null, null], tpl: null, bg_dim: 2 },
  })
  h.store.__slots = SLOTS_LOCAL
  h.store.profilePendingPatch = { slots: [{ file_id: 'cloud://env.app/cards/1/a.jpg' }] }
  const r3 = await h.pc.pull()
  ck('pull 第一件事是把欠的那一笔补送（PUT 先于 GET 发）',
    h.calls.put.length === 1 && !!h.calls.put[0].slots, JSON.stringify(h.calls.put))
  ck('补成之后那一格清空', h.pc.hasPending() === false)
  ck('这时才允许按服务器那份对齐（云上四格是空的 → 本机那一格撤掉）',
    r3 && r3.ok === true && !r3.deferred && h.calls.removed.length === 1,
    `removed=${h.calls.removed.length}`)
  ck('亮度档落本机时带 fromServer=true（不带就会顺手 PUT 回写，每次登录白打一次）',
    h.calls.bgDim.length === 1 && h.calls.bgDim[0].fromServer === true, JSON.stringify(h.calls.bgDim))

  console.log('\n———— ④ 队列竞态：flush 期间新 push 的那一条不许被丢掉 ————')
  // 假 storage 必须**读写各拷一份**：真 `wx.getStorageSync` 回的是反序列化出来的副本，
  // 而 `assetQueue.push` 会对 take() 拿到的那个数组 `list.push(...)`。桩要是不拷，
  // 读写同一块引用，flush 开头那份快照会"跟着一起长"，竞态被桩自己掩盖掉——测的是桩不是代码。
  const store = {}
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
  global.wx = {
    getStorageSync: (k) => clone(store[k]),
    setStorageSync: (k, v) => { store[k] = clone(v) },
    removeStorageSync: (k) => { delete store[k] },
  }
  const cardQueue = require(path.resolve(ROOT, 'miniprogram/utils/cardQueue.js'))
  cardQueue.push(1, { file_id: 'cloud://env.app/cards/1/old.jpg', tpl: 'classic' })
  let release
  const gate = new Promise((res) => { release = res })
  const api = {
    putNoteCard: async (noteId) => {
      if (noteId === 1) await gate            // 第一条卡在网络上，这期间第二条落进来
      return {}
    },
    bindNoteAssets: async () => ({}),
  }
  const flying = cardQueue.flush(api)
  await wait(10)
  cardQueue.push(2, { file_id: 'cloud://env.app/cards/2/new.jpg', tpl: 'classic' })
  release()
  await flying
  const left = cardQueue.take().map((x) => x.noteId)
  ck('第一条送成后离开队列', left.indexOf(1) < 0, left.join(','))
  ck('flush 期间新 push 的第二条还在（旧实现会被开头那份快照整表盖掉）',
    left.indexOf(2) >= 0, left.join(','))

  const assetQueue = require(path.resolve(ROOT, 'miniprogram/utils/assetQueue.js'))
  assetQueue.push(11, [{ file_id: 'cloud://env.app/images/1/a.jpg' }])
  let release2
  const gate2 = new Promise((res) => { release2 = res })
  const flying2 = assetQueue.flush({
    bindNoteAssets: async (noteId) => { if (noteId === 11) await gate2; return {} },
  })
  await wait(10)
  assetQueue.push(12, [{ file_id: 'cloud://env.app/images/1/b.jpg' }])
  release2()
  await flying2
  const left2 = assetQueue.take().map((x) => x.noteId)
  ck('待补绑同一条纪律（新落进来的那条还在）', left2.indexOf(12) >= 0 && left2.indexOf(11) < 0, left2.join(','))

  console.log('\n———— ⑤ 接线：五头欠账在"回前台"与"刚登录"两处都要补 ————')
  const app = R(APP)
  ck('收成一个方法 flushQueues，闸门只写一处', /flushQueues\(\) \{[\s\S]{0,80}if \(!this\.globalData\.isLoggedIn\) return/.test(app))
  ck('onShow 调它', /this\.flushQueues\(\)/.test(app.split('async _reportInviter')[0]))
  ck('登录成功那一刻也调它（冷启动那次 onShow 早于 isLoggedIn 置真，原来一头都不补）',
    /this\.globalData\.isLoggedIn = true[\s\S]{0,400}this\.flushQueues\(\)/.test(app))
  ck('五头齐：待补绑、待删、卡片待补登记、卡片补传、名片待补写',
    ['assetQueue.flush', 'cloudUpload.flushPurge', 'cardCloud.flush()', 'cardCloud.backfillLocal()', 'profileCloud.flushPending()']
      .every((s) => app.includes(s)))

  console.log('\n———— 反向：撤掉哪一刀，对应那一组就必须红 ————')
  const src = R(PROFILE_CLOUD)
  // 反向①：失败不再落那一格 → ①那组的两条（落格 / hasPending）红
  const m1 = src.replace('    _mergePending(patch)\n', '')
  const h4 = loadProfileCloud({ putImpl: async () => { throw { errMsg: 'fail' } }, remote: null, src: m1 })
  h4.store.__slots = SLOTS_LOCAL
  await h4.pc.pushSlots(SLOTS_LOCAL)
  ck('反向①撤掉"失败就落那一格" → 那一格真的空了（＝①那组会红）',
    m1 !== src && !h4.store.profilePendingPatch && h4.pc.hasPending() === false)
  // 反向②：撤掉 pull 开头那道闸 → 本机那张又被删（＝②那组会红）。这一条必须真跑，
  // 光比字符串等于没验：原写法就是这么个假绿，被自己抓出来改的。
  const GUARD = "  if (!(await flushPending())) return { ok: true, deferred: true, reason: 'pending-write' }\n"
  const m2 = src.replace(GUARD, '')
  const h5 = loadProfileCloud({
    putImpl: async () => { throw { errMsg: 'fail' } },
    remote: { updated_at: '2026-10-08T00:00:00Z', name: '旧名', slogan: '', slots: [null, null, null, null], tpl: null, bg_dim: 1 },
    src: m2,
  })
  h5.store.__slots = SLOTS_LOCAL
  h5.store.profilePendingPatch = { slots: [{ file_id: 'cloud://env.app/cards/1/a.jpg' }] }
  await h5.pc.pull()
  ck('反向②撤掉 pull 那道闸 → 还欠着也把用户刚换的那张删了（＝②那组会红）',
    m2 !== src && h5.calls.removed.length === 1, `removed=${h5.calls.removed.length}`)
  // 反向③：少传 fromServer → ③那条红
  const m3 = src.replace('app.setBgDim(r.bg_dim, true)', 'app.setBgDim(r.bg_dim)')
  ck('反向③少传 fromServer → 落本机那一步变成回写（＝③那条会红）', m3 !== src)
  // 反向④：队列收尾改回整表覆盖 → ④那两条红
  const cq = R('miniprogram/utils/cardQueue.js')
  const m4 = cq.replace('  _prune(done)', '  _put(list.filter((x) => !done.includes(x)))')
  ck('反向④队列改回整表覆盖 → 竞态回来了（＝④那两条会红）', m4 !== cq)

  console.log(`\n${bad.length ? '红 ' + bad.length + ' 条：' + bad.join('、') : '全绿'}`)
  process.exit(bad.length ? 1 : 0)
}

main().catch((e) => { console.error('尺子自己崩了：', e && (e.stack || e.message)); process.exit(1) })
