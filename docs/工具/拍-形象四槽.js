// 拍「形象图四个槽」这一屏，拍到 docs/design/卡片模板-四槽-实测/ 下面，共三张：
//   1-空态.png     四个位置都空（四枚虚线圆 + ➕）
//   2-满态.png     四张都放上、第 1 张当着两个位置
//   3-删掉一个.png  删掉第 2 格之后（那一格回 ➕，其余三张不动）
// 为什么要单独拍：这一屏的坑全是"只有渲染才看得见"的那一类——两字芯片会不会互相咬、
// 芯片条会不会越出圆、垃圾桶会不会盖住脸。尺子量的是盒子坐标，量不出"看着乱不乱"。
// 前置：先 cli close，再
//   cli auto --project <仓库>/miniprogram --auto-port 9431，等十几秒端口起来。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/拍-形象四槽.js
// 拍完 mp.close() 会占掉端口，别在站长真机调试时跑。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')

const PORT = process.env.MP_PORT || 9431
const OUT = path.resolve(__dirname, '../design/卡片模板-四槽-实测')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 与验-形象四槽-真跑.js 同一套摆法：选图那一步在模拟器里点不动，就直接把四张真 JPEG
// 写进 USER_DATA_PATH，再把槽摆进 storage，重新进页。
const JPG = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=='

const seed = (mp, roles) => mp.evaluate((list, b64) => {
  const f = wx.getFileSystemManager()
  const ud = wx.env.USER_DATA_PATH
  const paths = list.map((_, i) => `${ud}/ruler-slot-${i}.jpg`)
  paths.forEach((p) => { try { f.writeFileSync(p, b64, 'base64') } catch (e) { /* 已存在就沿用 */ } })
  const prof = wx.getStorageSync('poster_profile') || {}
  prof.images = list.map((r, i) => ({ path: paths[i], card: !!r.card, bg: !!r.bg }))
  prof.avatarPath = ''
  wx.setStorageSync('poster_profile', prof)
  return true
}, roles, JPG)

const clear = (mp) => mp.evaluate(() => {
  const p = wx.getStorageSync('poster_profile') || {}
  p.images = [null, null, null, null]
  p.avatarPath = ''
  wx.setStorageSync('poster_profile', p)
  const f = wx.getFileSystemManager()
  for (let i = 0; i < 4; i++) { try { f.unlinkSync(`${wx.env.USER_DATA_PATH}/ruler-slot-${i}.jpg`) } catch (e) { /* 本来就没有 */ } }
  return true
})

async function gotoProfile(mp) {
  for (let i = 0; ; i++) {
    try { await mp.reLaunch('/pages/profile/profile'); break } catch (e) {
      if (i >= 4) throw e
      console.log(`第 ${i + 1} 次进页没成：${e.message}`)
      await sleep(8000)
    }
  }
  // 十格模板小样是逐格画的，等它画完再拍，否则下面那排是半成品
  await sleep(9000)
  return mp.currentPage()
}

const shoot = async (mp, name) => {
  const r = await mp.screenshot({ path: path.join(OUT, name) })
  const p = (r && r.path) || path.join(OUT, name)
  console.log(`拍了 ${name} → ${p}`)
  return p
}

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('挂了（未处理拒绝）', e); process.exit(2) })
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error(`连不上自动化端口，先跑 cli auto --auto-port ${PORT}`)
  try {
    await clear(mp)
    await gotoProfile(mp)
    await shoot(mp, '1-空态.png')

    await seed(mp, [{ card: true, bg: true }, {}, {}, {}])
    await gotoProfile(mp)
    await shoot(mp, '2-满态.png')

    // 第 2 格删掉：走真控件（垃圾桶 + 二次确认那一支），不是直接改 storage。
    // showModal 弹的是工具的系统面板，automator 够不到按钮，所以让替身当场点「确定」。
    const page = await mp.currentPage()
    await mp.evaluate(() => {
      if (!wx.__realModal) wx.__realModal = wx.showModal
      wx.showModal = (o) => { if (o.success) o.success({ confirm: true, cancel: false }) }
      return true
    })
    const bins = await page.$$('.bin')
    await bins[1].tap()
    await sleep(2500)
    await mp.evaluate(() => { if (wx.__realModal) { wx.showModal = wx.__realModal; wx.__realModal = null } return true })
    await sleep(1500)
    await shoot(mp, '3-删掉一个.png')

    // 这一屏之外，首页头部也要拍一张：确认"勾了背景的那张"真的铺上去了
    await seed(mp, [{ card: false, bg: true }, { card: true, bg: false }, {}, {}])
    for (let i = 0; ; i++) {
      try { await mp.reLaunch('/pages/index/index'); break } catch (e) { if (i >= 4) throw e; await sleep(8000) }
    }
    await sleep(6000)
    await shoot(mp, '4-列表页头部.png')
  } finally {
    try { await clear(mp) } catch (e) { console.error('收尾清理没做成', e) }
    try { await mp.close() } catch (e) { /* 已经断了 */ }
  }
})().catch((e) => { console.error('挂了：', e); process.exitCode = 2 })
