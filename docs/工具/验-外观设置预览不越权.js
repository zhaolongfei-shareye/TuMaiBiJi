// 外观设置这一屏的交互契约自证：点色块只试看（页面本身的主题不许动、本机偏好不许写），
// 点上面那部手机才真换。跑在模拟器里，真点、读 data、读存储，最后把壁纸还原回去。
// 前置：微信开发者工具已开，跑过 cli auto --auto-port 9431（改过 WXSS 必须先 close 再 auto）。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-外观设置预览不越权.js
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/外观设置-手机预览')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const readLocal = (mp) => mp.evaluate(() => wx.getStorageSync('localWallpaper') || '(空)')

;(async () => {
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')
  fs.mkdirSync(OUT, { recursive: true })

  const page = await mp.reLaunch('/pages/wallpaper/wallpaper')
  await sleep(4500)
  const start = await page.data()
  const startLocal = await readLocal(mp)
  const chips = await page.$$('.wp-chip')
  ck('条子里是八枚', chips.length === 8, `${chips.length} 枚`)
  ck('上面有一块手机预览', (await page.$$('.stage')).length === 1)
  ck('预览里画了四行笔记', (await page.$$('.mock-row')).length === 4)
  await mp.screenshot({ path: `${OUT}/实测-进页.png` })

  // ① 点最后那一枚（天青，带色阶、只存本机）——只该改预览
  await chips[7].tap()
  await sleep(1200)
  const p1 = await page.data()
  ck('点色块后 previewKey 是天青', p1.previewKey === 'tint-celadon', p1.previewKey)
  ck('点色块后标记成"在试看"', p1.previewing === true)
  ck('点色块不许改在用的壁纸', p1.currentWallpaper === start.currentWallpaper,
    `${start.currentWallpaper} → ${p1.currentWallpaper}`)
  ck('点色块不许改本页主题（themeClass 原样）', p1.themeClass === start.themeClass, p1.themeClass)
  const midLocal = await readLocal(mp)
  ck('点色块不许写本机偏好', midLocal === startLocal, `${startLocal} → ${midLocal}`)
  ck('条子滚到试看那一枚', p1.intoView === 'wp-tint-celadon', p1.intoView)
  await mp.screenshot({ path: `${OUT}/实测-试看天青.png` })

  // ② 点上面那部手机——这才算选定
  await (await page.$('.stage')).tap()
  await sleep(2000)
  const p2 = await page.data()
  ck('点手机预览才换上', p2.currentWallpaper === 'tint-celadon', p2.currentWallpaper)
  ck('换上了主题类名跟着走', /theme-tint-celadon/.test(p2.themeClass || ''), p2.themeClass)
  ck('换完不再是"试看"态', p2.previewing === false)
  const nowLocal = await readLocal(mp)
  ck('带色阶那枚只写本机', nowLocal === 'tint-celadon', nowLocal)
  await mp.screenshot({ path: `${OUT}/实测-换上象牙天青那枚.png` })

  // ③ 预览和在用是同一枚时再点，不该重复走一遍
  await (await page.$('.stage')).tap()
  await sleep(1200)
  const p3 = await page.data()
  ck('重复点同一枚不再走一次换壁纸', p3.currentWallpaper === 'tint-celadon' && p3.applying === false)

  // 还原：把进来时那枚点回去，别把模拟器的偏好留在试看态
  const idx = (p2.wallpapers || []).findIndex((x) => x.key === start.currentWallpaper)
  const chips2 = await page.$$('.wp-chip')
  if (idx >= 0 && idx < chips2.length) {
    await chips2[idx].tap()
    await sleep(800)
    await (await page.$('.stage')).tap()
    await sleep(1500)
  }
  const done = await page.data()
  ck('测完把壁纸还原回进页那一枚', done.currentWallpaper === start.currentWallpaper,
    `${start.currentWallpaper} ← ${done.currentWallpaper}`)
  console.log(bad.length ? `\n${bad.length} 条不过：${bad.join(' / ')}` : '\n全过')
  process.exitCode = bad.length ? 1 : 0
  mp.disconnect()
})().catch((e) => { console.error('探针挂了', e); process.exitCode = 1 })
