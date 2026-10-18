// 跑尺子.sh 用的一个小钉子：每一把开跑之前，把这台机此刻的界面语言钉成中文，并把读数打出来。
//
// 为什么必须有（10-18 那批 37 把真跑里 22 把有红，根因就在这）：
//   `globalData.userInfo.language` 是登录时从**服务端**带回来的。开发者工具登的是站长本人那个号，
//   而服务器那一行 `users.language` 现在是 `en`（10-18 现读：id=3，updated_at 14:51:21），
//   于是每一把冷启动之后屏上都是英文。37 把里只有 9 把自己引了 `尺子语言钉.js`，
//   其余 28 把拿硬写的中文串去比英文屏 ⇒ 红成一片，而那一片里真正是缺陷的没几条。
//   最坏的一型是第四把 `验-中英切换-真跑` 崩在恢复之前，把英文留给后面每一把——尺子之间的态会串。
//
// 这里只改**内存里那一份**，不写服务端、不改他账号（与 `尺子语言钉.js` 同一条纪律）。
// 时点也挑过：跑尺子.sh 在 `cli auto` 之后才叫这一把，那一刻登录已经回来，钉子不会被自己的登录盖掉。
// 失败不打断批跑（打一行 `!!` 让人看得见），因为这是量具的前置，不是被测的那件事。
const automator = require('miniprogram-automator')

const PORT = process.env.MP_PORT || process.argv[2] || 9431
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  let mp = null
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }) } catch (e) { await sleep(10000) }
  }
  if (!mp) { console.log('!! 语言钉子连不上自动化端口，这一把吃的还是屏上那一刻的语言'); process.exit(0) }
  const read = () => mp.evaluate(() => (getApp().globalData.userInfo || {}).language || 'zh')
  const pin = (l) => mp.evaluate((x) => {
    const a = getApp()
    a.globalData.userInfo = Object.assign({}, a.globalData.userInfo, { language: x })
    return a.globalData.userInfo.language
  }, l)
  try {
    const before = await read()
    const after = await pin('zh')
    console.log(`语言钉子：屏上此刻 ${before} → 钉成 ${after}`)
  } catch (e) {
    console.log(`!! 语言钉子这一趟没打成: ${e && e.message}`)
  }
  // ⚠ 这里**不许调 mp.close()**：close 会把自动化会话打死（端口还在监听、会话却是死的），
  // 而跑尺子.sh 是 quit→open→auto 之后先来叫这一把、再去叫真正的尺子——close 会把下一把的连接的
  // 唯一活会话掐掉，症状是"Connection closed, check if wechat web devTools is still running"。
  // 第一版就是这么写的，16:5x 那趟验证里 `验-我的页改版-真跑` 直接挂在这句上（自己踩自己记录过的坑）。
  // 进程退出自己会把 socket 关掉，不需要协议级 close。
  process.exit(0)
})()
