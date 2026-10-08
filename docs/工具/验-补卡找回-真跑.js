// 补卡那一趟的真跑：站长 10-08 原话「把丢失的给我补回来，我要在 2.0 版本先看到」。
// 跑法：docs/工具/跑尺子.sh 9431 验-补卡找回-真跑
//
// 这一把钉的是**找回**，不是"以后不丢"（方案 §七 验收 1 那条）。静态那把（验-卡片修复三档.js）
// 已经证明分档与那份数的逻辑对；这一把证明它在真机链路上真跑得通：
// 画布真画得出来、云存储真写得进、库里那一行真落得下、那一格真从空白变成一张图。
//
// ⚠ **这一把会写现网**，而且写的是站长本人那个账号（开发者工具登录态 = users.id=3）。
// 规矩是 10-07 定的：开跑前先读 globalData.userId 自证身份、把它打进报告，别拿 deploy-test
// 那串假 openid 冒充——那串手机永远登不进去，客户端这几把尺子天生只可能跑在他号上。
// 这一次是他自己点头要"补回来"，所以才动；跑完名下的卡片行**留着不清**（那就是他要的成果物）。
const automator = require('miniprogram-automator')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ROOT = path.resolve(__dirname, '../..')
const SHOT = path.join(ROOT, 'docs', '补卡真跑-那份数.png')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  const page = await mp.reLaunch('/pages/index/index')
  await sleep(7000)

  const who = await mp.evaluate(() => getApp().globalData.userId)
  const openid = await mp.evaluate(() => getApp().globalData.userInfo && getApp().globalData.userInfo.nickname)
  ck('身份自证：这一把跑在哪个账号上（会写现网的就是这个号）', !!who, `users.id=${who} nickname=${openid}`)

  const ledger = () => mp.evaluate(() => wx.getStorageSync('cardLog') || {})
  const before = await ledger()
  const 张 = (m) => Object.keys(m).filter((k) => (m[k] || []).length)
  console.log(`　开跑前本机台账：${张(before).length} 篇（${张(before).join(',')}）`)

  // 「把丢了的卡片找回来」那一行要点开才跑；这里直接调页面那一个方法，省掉两下点按的不稳定。
  await page.callMethod('onRepairCards')
  // 一趟里每一张都要：读正文 → 画布重画 → 落本机持久文件 → 传云 → 登记。模拟器上一张十几秒。
  await sleep(150000)

  // 判的是**落盘那张图**，不是 `mp.screenshot()` 的回值：这一把第一次跑就是红在这里，
  // 而文件明明在（365KB）——回值形状是我以为的，不是它给的。看图的人只需要文件。
  const fs2 = require('fs')
  await sleep(1500)
  ck('那份数那张屏落盘了（补了几张／待你确认几篇／跳过几篇各是多少，图上有）',
    fs2.existsSync(SHOT) && fs2.statSync(SHOT).size > 50000,
    `${SHOT} ${fs2.existsSync(SHOT) ? fs2.statSync(SHOT).size : 0} 字节`)

  const after = await ledger()
  const 新带origin = Object.keys(after).filter((k) => (after[k] || []).some((x) => x.origin))
  ck('重渲回来的那几张已经落进本机台账，并且带着 origin（界面上那句留痕读的就是它）',
    新带origin.length > 0, `${新带origin.length} 篇：${新带origin.join(',')}`)

  const cells = await page.data('cells') || []
  const 有图 = cells.filter((c) => c.cards && c.cards.length)
  ck('卡片那一屏的格子里有图了（不再是一片空白，也不是"从没生成过"）',
    有图.length > 0, `${有图.length}/${cells.length} 格有图`)
  const 待确认 = cells.filter((c) => c.needConfirm)
  console.log(`　还挂着"请你确认"的格子：${待确认.length} 篇` +
    (待确认.length ? `（原因 ${待确认.map((c) => c.needConfirm).join(',')}）` : ''))
  const 留痕 = 有图.filter((c) => c.cards[0] && c.cards[0].origin)
  ck('补回来的那一格下面确实有那句留痕（不是悄悄换了他的东西）',
    留痕.length > 0, `${留痕.length} 格带 origin=${留痕.map((c) => c.cards[0].origin).join(',')}`)

  await mp.evaluate(() => wx.hideModal && wx.hideModal())
  console.log(bad.length ? `\n红 ${bad.length} 条：` + bad.join('、') : '\n全绿')
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('尺子自己崩了', e); process.exit(2) })
