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
  // 冷启动那一下最容易翻车：cli auto 刚编完，app 还在启动页，这时 reLaunch 会让 IDE 报
  // "getPageMetaByWebviewId(...) is null"（它还没给这个 webview 登记页面元信息）。
  // 所以进来先重试几次；同时兜住 uncaughtException——这个报错是从 WebSocket 回调里抛的，
  // 没有待办的请求时它会直接掀掉进程，而不接住的话 node 会挂在活着端口上永远不退出。
  process.on('uncaughtException', (e) => { console.error('探针挂了（未捕获）', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')
  fs.mkdirSync(OUT, { recursive: true })

  let page
  for (let i = 0; i < 5 && !page; i++) {
    try { page = await mp.reLaunch('/pages/wallpaper/wallpaper') } catch (e) { console.log(`第 ${i + 1} 次进页没成：${e.message}`); await sleep(8000) }
  }
  if (!page) throw new Error('reLaunch 五次都没进这页')
  await sleep(4500)
  const start = await page.data()
  const startLocal = await readLocal(mp)
  const chips = await page.$$('.wp-chip')
  ck('条子里是八枚', chips.length === 8, `${chips.length} 枚`)
  ck('上面有一块手机预览', (await page.$$('.stage')).length === 1)
  ck('预览里画了四行笔记', (await page.$$('.mock-row')).length === 4)
  await mp.screenshot({ path: `${OUT}/实测-进页.png` })

  // ① 点那两枚"带色阶、只存本机"之一——只该改预览。
  // 挑哪一枚要看进来时在用哪枚：previewing 的语义是 key !== 在用（wallpaper.js:120），
  // 固定点天青而进来时正好是天青，这一条怎么点都是 false——上一把那条红就是这个原因，
  // 不是代码坏了，是探针把"起点不是天青"这个前提写死了。
  const targetKey = (start.currentWallpaper === 'tint-celadon' ? 'tint-paper' : 'tint-celadon')
  const targetIdx = (start.wallpapers || []).findIndex((x) => x.key === targetKey)
  ck('试看那一枚在条子里', targetIdx >= 0 && !!chips[targetIdx], `index=${targetIdx}`)
  await chips[targetIdx].tap()
  await sleep(1200)
  const p1 = await page.data()
  ck(`点色块后 previewKey 是${targetKey === 'tint-celadon' ? '天青' : '象牙'}`, p1.previewKey === targetKey, p1.previewKey)
  ck('点色块后标记成"在试看"', p1.previewing === true)
  ck('点色块不许改在用的壁纸', p1.currentWallpaper === start.currentWallpaper,
    `${start.currentWallpaper} → ${p1.currentWallpaper}`)
  ck('点色块不许改本页主题（themeClass 原样）', p1.themeClass === start.themeClass, p1.themeClass)
  const midLocal = await readLocal(mp)
  ck('点色块不许写本机偏好', midLocal === startLocal, `${startLocal} → ${midLocal}`)
  ck('条子滚到试看那一枚', p1.intoView === `wp-${targetKey}`, p1.intoView)
  await mp.screenshot({ path: `${OUT}/实测-试看${targetKey}.png` })

  // ② 点上面那部手机——这才算选定
  await (await page.$('.stage')).tap()
  await sleep(2000)
  const p2 = await page.data()
  ck('点手机预览才换上', p2.currentWallpaper === targetKey, p2.currentWallpaper)
  ck('换上了主题类名跟着走', new RegExp('theme-' + targetKey).test(p2.themeClass || ''), p2.themeClass)
  ck('换完不再是"试看"态', p2.previewing === false)
  const nowLocal = await readLocal(mp)
  ck('带色阶那枚只写本机', nowLocal === targetKey, nowLocal)
  await mp.screenshot({ path: `${OUT}/实测-换上${targetKey}.png` })

  // ③ 预览和在用是同一枚时再点，不该重复走一遍
  await (await page.$('.stage')).tap()
  await sleep(1200)
  const p3 = await page.data()
  ck('重复点同一枚不再走一次换壁纸', p3.currentWallpaper === targetKey && p3.applying === false)

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
})().catch((e) => { console.error('探针挂了', e); process.exit(1) })
