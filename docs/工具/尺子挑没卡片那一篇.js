// 一把小助手：真跑尺子要进「笔记卡片」那一页之前，先挑一篇**进得去那一屏**的笔记。
//
// 为什么要有它：10-03 站长定了「一篇只留一张卡片」，10-08 S2 把那一道闸的判据从"本机那个 jpg"
// 换成 `cardCloud.hasCard`＝**本机台账 ∪ 服务器那一行**。于是任何一把硬写 `share?id=7` 的真跑尺子，
// 只要那一篇在这台机器上生成过一次卡片，进页就被挡（toast 一句 + navigateBack），
// 屏上既没有成品图也没有模板条——红是"进页面先出一张图"和 `picks[i].tap()` 崩，
// 看着像这一页坏了，其实**代码按定的规矩做得对，是尺子的前提没了**（10-09 实测：`验-竖排信笺出图`、
// `验-经典三款纸色出图` 两把一起这样红；现读这台模拟器的台账，12 篇**全都有**卡片，
// 而且那 12 个 jpg 逐个都在沙盒里 `.../wx4416d1283b5de721/usr/cards/`，所以不是判据读空了的假红）。
//
// 两档：
//  ① `find` 只读，手里那份列表 + 台账，不打任何写口；
//  ② 一篇都不空时 `takeOver` **借**一篇：只把台账里那一栏摘下来（位图一个都不动），
//     跑完 `putBack` 原样装回去并现读复核。借的是本机 storage 里的一格，不碰现网、不删文件，
//     崩溃时把快照 JSON 打进日志，照着写回去就能还原。
//     ⚠ 这一档**默认不开**（要 `RULER_BORROW=1`）。理由不是它危险，是它不够：借来那一栏摘掉之后
//     进的那一页会真发一次 `POST /api/shares`（建一张活码，现网写），而 10-09 实测那一趟在这台机器上
//     连画都没画出来（挑到/借到都回 0 格）——先查清那一趟，再谈要不要常态借。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const KEY = 'cardLog'
const mayBorrow = () => process.env.RULER_BORROW === '1'

module.exports = {
  mayBorrow,

  async find(mp, { wait = 7000 } = {}) {
    // 走 callWxMethod 而不是 mp.reLaunch：首页是 tab 页，automator 对"reLaunch 一个 tab 页"
    // 的回信本来就不稳（实测 `timeout waiting for automator response`，见 验-经典三款纸色出图.js
    // 收尾那条同注释）——这里只是借那一页手里已经拉回来的列表，不值得为它挂一次红。
    await mp.callWxMethod('reLaunch', { url: '/pages/index/index' })
    await sleep(wait)
    // ⚠ `mp.evaluate` 那**第二个参数到不了小程序侧**（见 [[Ruler units and box model]] 第 17 条：
    // 拿它传选择器时那个值是 undefined，整把尺子卡成 timeout）。所以这一把里被 evaluate 用到的
    // 键一律在函数体里写死字面量 `'cardLog'`，不从外面递进去；下面两个 evaluate 同理。
    return mp.evaluate(() => {
      const p = getCurrentPages().slice(-1)[0]
      const led = wx.getStorageSync('cardLog') || {}
      const notes = ((p.data && p.data.notes) || []).filter((n) => n && n.id != null)
      // 台账里有那一栏＝这一篇进不去卡片页（本机这一半）。云上那一行这一把读不到，
      // 真撞上时调用方那一条"进页面模板条是十格"会红，并写明去查服务器那一行——不会假绿。
      const has = (id) => { const a = led[String(id)]; return Array.isArray(a) && a.length > 0 }
      const all = notes.map((n) => ({ id: n.id, title: String(n.title || '').slice(0, 30), hasCard: has(n.id) }))
      // 整份名单都给出去：有的尺子要挑"标题里中英混排"那一篇（竖排信笺量拉丁段横躺那一支）。
      return { total: notes.length, withCard: Object.keys(led).length, all, free: all.filter((n) => !n.hasCard) }
    }, KEY)
  },

  // 借一篇：摘掉台账里那一栏，位图与原样快照都留给调用方去还原。
  async takeOver(mp, noteId) {
    const snap = await mp.evaluate((pair) => {
      const led = wx.getStorageSync(pair.k) || {}
      const before = led[pair.id]
      if (!Array.isArray(before) || !before.length) return { removed: null, files: 0 }
      delete led[pair.id]
      try { wx.setStorageSync(pair.k, led) } catch (e) { return { err: String((e && e.errMsg) || e) } }
      const now = wx.getStorageSync(pair.k) || {}
      return { removed: before, stillThere: Array.isArray(now[pair.id]) }
    }, { k: KEY, id: String(noteId) })
    return Object.assign({ noteId }, snap)
  },

  // 装回去：写回那一栏，再现读一次确认它真在那儿（"写过"不等于"立上了"）。
  async putBack(mp, noteId, removed) {
    if (!removed || !removed.length) return { noteId, ok: true, skipped: '本来就没借' }
    const r = await mp.evaluate((pair) => {
      const led = wx.getStorageSync(pair.k) || {}
      led[pair.id] = pair.list
      try { wx.setStorageSync(pair.k, led) } catch (e) { return { err: String((e && e.errMsg) || e) } }
      const now = wx.getStorageSync(pair.k) || {}
      return { back: JSON.stringify(now[pair.id] || null) === JSON.stringify(pair.list) }
    }, { k: KEY, id: String(noteId), list: removed })
    return Object.assign({ noteId }, r, { ok: !!r.back })
  },

  sleep,
}
