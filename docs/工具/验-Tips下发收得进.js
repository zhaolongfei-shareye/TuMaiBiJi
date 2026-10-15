// 「服务端发了 ⇒ 客户端收得进 ⇒ 屏上那行字真的换了」——这一段不连模拟器，
// 但吃的是**真代码**：`utils/mpAssets.js` 与 `pages/create/create.js` 的 `tipsFor()` 原样 require 进来跑，
// 只把最外面那层 wx 换成替身（storage 用一个 Map，request 由每条用例现编）。
//
// 为什么要单独这一把：后端那 46 条 pytest 证的是"发得出去"，真跑那把证的是"屏上看得到"，
// 中间那一段——落账、判重、停用撤账、兜底顺序——两头都不碰。而这一段的坏法是**静默的**：
// 后台点了发布、接口回的东西也对，客户端一句都没落上，屏上还是包里那六句，全程不报错。
//
// ⚠ 替身必须写在 require **之前**（这条坑 10-15 刚踩过一次：`mpAssets.js` 在模块作用域就
//   `wx.getFileSystemManager()`，替身写在后面那六把尺子从加载那一刻就全崩，
//   而一把"加载就崩"的尺子不会自己挤进名单，所以批跑全绿从没暴露过它）。
//
// 跑法：NODE_PATH=$HOME/.mpauto/node_modules node docs/工具/验-Tips下发收得进.js
const path = require('path')

const MEM = new Map()
let DL = []        // downloadFile 被谁调过（每条用例开头清空）
let PUT = []       // setStorageSync 写过的键（判"没变就不重写"用）
const FS = {
  accessSync() {}, mkdirSync() {}, unlinkSync() {},
  saveFile({ filePath, success }) { success({ savedFilePath: filePath }) },
}

global.wx = {
  env: { USER_DATA_PATH: '/tmp/probe-user' },
  getFileSystemManager: () => FS,
  getStorageSync: (k) => (MEM.has(k) ? MEM.get(k) : ''),
  setStorageSync: (k, v) => { PUT.push(k); MEM.set(k, v) },
  removeStorageSync: (k) => { MEM.delete(k) },
  downloadFile({ url, success, complete }) {
    DL.push(url)
    const res = { statusCode: 200, tempFilePath: '/tmp/probe-tmp' }
    if (success) success(res)
    if (complete) complete(res)
  },
  // 每条用例现填；默认给一个"什么都没有"的空回体，免得某条用例忘了设就把上一条的结果读成这一条的
  request(o) {
    const data = (global.__CONFIG || {})
    const res = { statusCode: 200, data, header: {}, cookies: [], errMsg: 'request:ok' }
    if (o.success) o.success(res)
    if (o.complete) o.complete(res)
    return { abort() {} }
  },
}
global.getApp = () => ({ globalData: { token: 'probe-token', privateUnlock: null } })
// create.js 是 Page({...}) 那个形状，替身把那个对象接住，好直接调它的方法
global.Page = (o) => { global.__PAGE = o }

const ROOT = path.resolve(__dirname, '../..')
const mpAssets = require(path.join(ROOT, 'miniprogram/utils/mpAssets.js'))
const create = require(path.join(ROOT, 'miniprogram/pages/create/create.js'))
const i18n = require(path.join(ROOT, 'miniprogram/utils/i18n.js'))
const tipsFor = global.__PAGE.tipsFor

const bad = []
let n = 0
const ck = (name, ok, got) => {
  n++
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const reset = () => { MEM.clear(); DL = []; PUT = [] }
const TIPS = { zh: ['第一句下发', '第二句下发'], en: ['remote one', 'remote two'], updated_at: '2026-10-15T06:00:00+00:00' }
const BG = { url: '/api/mp/a/tk', content_hash: 'abc123', updated_at: '2026-10-15T06:00:00+00:00' }

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('尺子自己炸了', e); process.exit(2) })

  // ---------- ① 一份带文案的回体收得进来 ----------
  reset()
  global.__CONFIG = { home_bg: null, tips: TIPS }
  await mpAssets.pull()
  ck('pull 之后本机真有那一份文案', JSON.stringify(mpAssets.serverTips('zh')) === JSON.stringify(TIPS.zh),
    JSON.stringify(mpAssets.serverTips('zh')))
  ck('两份语言各存各的（英文那份不许串到中文里）',
    JSON.stringify(mpAssets.serverTips('en')) === JSON.stringify(TIPS.en),
    JSON.stringify(mpAssets.serverTips('en')))

  // ---------- ② 判重：同一份重发不许再写一次盘 ----------
  const writes = PUT.length
  reset()
  MEM.set('MP_TEXT_KEY_tips', { zh: TIPS.zh, en: TIPS.en, updatedAt: TIPS.updated_at })
  PUT = []
  global.__CONFIG = { home_bg: null, tips: TIPS }
  await mpAssets.pull()
  ck('updated_at 没变 ⇒ 一次写盘都不发生（每次冷启都重写 storage 是白写）', PUT.length === 0, `${PUT.length} 次写`)
  ck('而读回来还是那一份', JSON.stringify(mpAssets.serverTips('zh')) === JSON.stringify(TIPS.zh))
  void writes

  // ---------- ③ 停用（回 null）要连账一起撤 ----------
  reset()
  global.__CONFIG = { home_bg: null, tips: TIPS }
  await mpAssets.pull()
  global.__CONFIG = { home_bg: null, tips: null }
  await mpAssets.pull()
  ck('后台点了「停用」⇒ 本机那份账被撤掉，serverTips 回 null',
    mpAssets.serverTips('zh') === null && !MEM.has('MP_TEXT_KEY_tips'),
    mpAssets.serverTips('zh') === null ? 'null' : '还留着旧那一份')

  // ---------- ④ 老回体（没有 tips 这个键）不许炸 ----------
  reset()
  global.__CONFIG = { home_bg: BG }
  let threw = ''
  try { await mpAssets.pull() } catch (e) { threw = String(e && e.message) }
  ck('后端还没上那一栏时（回体里根本没这个键）：不抛、不出声、也不落账',
    !threw && mpAssets.serverTips('zh') === null, threw || '没抛')
  ck('同一次 pull 里图片那条路照旧走得通（文案那一支坏了不许连累它）',
    DL.some((u) => /api\/mp\/a\/tk/.test(u)), DL.join(' | ') || '(一次都没下)')

  // ---------- ⑤ 兼容：老包那段"没 content_hash 就跳过"仍然护住文案 ----------
  reset()
  DL = []
  global.__CONFIG = { home_bg: null, tips: TIPS }
  await mpAssets.pull()
  ck('文案那份绝不会被当成图片去下载（downloadFile 一次都不为它发）',
    DL.length === 0, DL.join(' | ') || '(零次)')

  // ---------- ⑥ 屏上那一行：下发优先、包里兜底 ----------
  reset()
  global.__CONFIG = { home_bg: null, tips: TIPS }
  await mpAssets.pull()
  const ctx = { data: {} }
  ck('tipsFor 读到的是**下发那一份**，不是包里那六句',
    JSON.stringify(tipsFor.call(ctx, 'zh')) === JSON.stringify(TIPS.zh),
    JSON.stringify(tipsFor.call(ctx, 'zh')))
  const PKG = i18n.texts('zh').tips
  reset()
  const back = tipsFor.call(ctx, 'zh')
  ck('撤了账（＝从没下发过 / 已停用）⇒ 落回包里那六句，那一行不许空掉',
    JSON.stringify(back) === JSON.stringify(PKG) && back.length === 6,
    `${back.length} 句`)
  reset()
  MEM.set('MP_TEXT_KEY_tips', { zh: [], en: TIPS.en, updatedAt: 'x' })
  ck('下发那份是空数组也算"没有"：回兜底，而不是让 `wx:if="{{tips.length}}"` 把整行抹掉',
    JSON.stringify(tipsFor.call(ctx, 'zh')) === JSON.stringify(PKG),
    `${tipsFor.call(ctx, 'zh').length} 句`)
  reset()
  MEM.set('MP_TEXT_KEY_tips', { zh: TIPS.zh, en: [], updatedAt: 'x' })
  ck('切到英文而英文那份空 ⇒ 中文那份不许串过来（串了就是英文界面读中文文案）',
    JSON.stringify(tipsFor.call(ctx, 'en')) === JSON.stringify(i18n.texts('en').tips),
    `${tipsFor.call(ctx, 'en').length} 句`)

  console.log(`\nTips 下发收得进：通过 ${n - bad.length} / ${n}`)
  if (bad.length) {
    bad.forEach((b) => console.log('  ✗ ' + b))
    console.log('')
    process.exit(1)
  }
})()
