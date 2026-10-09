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
// 三档：
//  ① `find` 只读：手里那份列表 + 本机台账，不打任何写口，也不删别人的卡片；
//  ② `takeOver`／`putBack` **借**一篇：只把台账里那一栏摘下来（位图一个都不动），跑完原样装回并现读复核。
//     ⚠ 默认不开（要 `RULER_BORROW=1`）：**借只摘得掉本机这一半，服务器那一行还站着**，而那道闸问的是
//     "本机 ∪ 服务器"，所以借来的那一篇照样进不去。10-09 我先把它记成"进页那一趟没成"——**那是判错了**；
//     后来拿③那一篇真没卡片的笔记 `peek` 过一次：`imagePath` 有、`.pick` 实测 10 格，那一屏一直是对的。
//  ③ 10-09 站长拍的第三条（乙路）：环境变量 `RULER_NOTE_ID=<一篇的 id>` **点名要哪一篇**。
//     配套那把现建现删的脚本是 `出-验收笔记.js`（make / peek / drop）。两把出图尺子当天就是靠它跑通的：
//     29 给 `验-竖排信笺出图`（10 条全过）、30 给 `验-经典三款纸色出图`（14 条全过），跑完 drop，
//     现网三张表复查回到原底数（notes 23 / note_cards 12 / shares 19）。这一档只改变"挑哪一篇"，
//     助手本身仍一行都不写。
//
// ⚠ 这一把里**每一个** `mp.evaluate` 都不走第二个参数：`MiniProgram.evaluate` 不吃它
// （见 [[Ruler units and box model]] 第 17 条，实测那个值到不了小程序侧、整把尺子卡成 timeout），
// 要递进去的值一律烤进函数体字面量。烤之前先过形状闸：id 只收 `/^\d+$/`，
// 台账那串走 `JSON.stringify` 再把 U+2028/U+2029 换成转义（它们在 JSON 合法、在 JS 源码里是行终止符）。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const mayBorrow = () => process.env.RULER_BORROW === '1'

// 只收纯数字：笔记 id 服务端就是整数，别的形状一律不回（环境变量是输入口，也得有个闸）。
const wantedId = () => (/^\d+$/.test(String(process.env.RULER_NOTE_ID || '')) ? String(process.env.RULER_NOTE_ID) : '')

module.exports = {
  mayBorrow,
  wantedId,

  async find(mp, { wait = 7000 } = {}) {
    // 走 callWxMethod 而不是 mp.reLaunch：首页是 tab 页，automator 对"reLaunch 一个 tab 页"
    // 的回信本来就不稳（实测 `timeout waiting for automator response`，见 验-经典三款纸色出图.js
    // 收尾那条同注释）——这里只是借那一页手里已经拉回来的列表，不值得为它挂一次红。
    await mp.callWxMethod('reLaunch', { url: '/pages/index/index' })
    await sleep(wait)
    const want = wantedId()
    const body = `
      return (function () {
        const p = getCurrentPages().slice(-1)[0]
        const led = wx.getStorageSync('cardLog') || {}
        const notes = ((p.data && p.data.notes) || []).filter(function (n) { return n && n.id != null })
        // 台账里有那一栏＝这一篇进不去卡片页（本机这一半）。云上那一行这一把读不到，
        // 真撞上时调用方那一条"进页面模板条是十格"会红，并写明去查服务器那一行——不会假绿。
        const has = function (id) { const a = led[String(id)]; return Array.isArray(a) && a.length > 0 }
        const all = notes.map(function (n) { return { id: n.id, title: String(n.title || '').slice(0, 30), hasCard: has(n.id) } })
        const free = all.filter(function (n) { return !n.hasCard })
        const want = '${want}'
        const named = want ? all.filter(function (n) { return String(n.id) === want }) : []
        // 点名那一篇**在本机列表里读不到**时不装成 free：回 namedFound=false，调用方那条前提判据会红，
        // 红得能看出是"这篇不在列表里"，而不是"这一页坏了"。
        return {
          total: notes.length,
          withCard: Object.keys(led).length,
          want: want || null,
          namedFound: named.length > 0,
          all: all,
          free: want ? named : free,
        }
      })()
    `
    return mp.evaluate(new Function(body))
  },

  // 借一篇：摘掉台账里那一栏，位图与原样快照都留给调用方去还原。
  async takeOver(mp, noteId) {
    const id = /^\d+$/.test(String(noteId)) ? String(noteId) : ''
    if (!id) return { noteId, err: `noteId 不是纯数字：${JSON.stringify(String(noteId))}` }
    const snap = await mp.evaluate(new Function(`
      return (function () {
        const led = wx.getStorageSync('cardLog') || {}
        const before = led['${id}']
        if (!Array.isArray(before) || !before.length) return { removed: null, files: 0 }
        delete led['${id}']
        try { wx.setStorageSync('cardLog', led) } catch (e) { return { err: String((e && e.errMsg) || e) } }
        const now = wx.getStorageSync('cardLog') || {}
        return { removed: before, stillThere: Array.isArray(now['${id}']) }
      })()
    `))
    return Object.assign({ noteId }, snap)
  },

  // 装回去：写回那一栏，再现读一次确认它真在那儿（"写过"不等于"立上了"）。
  // `removed` 是上一档打进日志的那串 JSON（10-09 实测过一次崩在 IDE 被 quit 之后），
  // 所以调用方必须在 finally 里把它递回来。
  async putBack(mp, noteId, removed) {
    const id = /^\d+$/.test(String(noteId)) ? String(noteId) : ''
    if (!id) return { noteId, ok: false, err: 'noteId 不是纯数字' }
    if (!removed || !removed.length) return { noteId, ok: true, skipped: '本来就没借' }
    const list = JSON.stringify(removed).split(String.fromCharCode(0x2028)).join("\\u2028").split(String.fromCharCode(0x2029)).join("\\u2029")
    const r = await mp.evaluate(new Function(`
      return (function () {
        const led = wx.getStorageSync('cardLog') || {}
        const want = ${list}
        led['${id}'] = want
        try { wx.setStorageSync('cardLog', led) } catch (e) { return { err: String((e && e.errMsg) || e) } }
        const now = wx.getStorageSync('cardLog') || {}
        return { back: JSON.stringify(now['${id}'] || null) === JSON.stringify(want) }
      })()
    `))
    return Object.assign({ noteId }, r, { ok: !!r.back })
  },

  sleep,
}
