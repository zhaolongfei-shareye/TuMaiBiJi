// 一次性探针：把「卡片上的信息」那一层的四枚格子量出来，看渲染后的盒子到底是什么形状。
// 起因：18:47 那把真跑尺子截出来的 06b 里，四枚本该 124×124 的圆画成了竖着的椭圆（约 124×230），
// 而 wxss 里 .ci-disc 明明写着 width:124rpx; height:124rpx。判据先别写，先把数读出来。
// 跑法：bash docs/工具/跑尺子.sh 9431 量-名片小弹窗   （或先 cli auto 起端口，再 node 这个文件）
const automator = require('miniprogram-automator')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  // 这套 automator 版本没有 mp.page(path)，只有 currentPage()；index 是 tab 页，
  // navigateTo 进不去，统一走 reLaunch（同 验-详情浮窗两层-真跑.js 的进页方式）。
  await mp.reLaunch('/pages/index/index')
  await sleep(4000)
  const page = await mp.currentPage()
  await page.callMethod('onOpenCardInfo')
  await sleep(800)
  const got = await mp.evaluate(() => new Promise((done) => {
    const q = wx.createSelectorQuery()
    q.selectAll('.ci-slot').boundingClientRect()
    q.selectAll('.ci-disc').boundingClientRect()
    q.selectAll('.ci-plus').boundingClientRect()
    q.selectAll('.ci-cap').boundingClientRect()
    q.select('.ci-slots').boundingClientRect()
    q.exec((r) => done(r))
  }))
  const names = ['.ci-slot', '.ci-disc', '.ci-plus', '.ci-cap']
  names.forEach((n, i) => {
    const list = got[i] || []
    console.log(n, list.map((b) => `${Math.round(b.width)}×${Math.round(b.height)}@${Math.round(b.left)},${Math.round(b.top)}`).join('  '))
  })
  console.log('.ci-slots', JSON.stringify({ w: Math.round(got[4].width), h: Math.round(got[4].height) }))
  // 小程序逻辑层没有 document，拿不到 computed style，所以再看一眼 rpx→px 的比例：
  const win = await mp.evaluate(() => wx.getWindowInfo())
  console.log('窗口', win.windowWidth, 'px；750rpx =', win.windowWidth, 'px → 1rpx =', (win.windowWidth / 750).toFixed(3), 'px')
  const d = await page.data()
  console.log('ciSlots 形状', d.ciSlots.map((s) => `${s.path ? '有图' : '空'}:${s.cap}`).join(' | '))
  await mp.close()
})().catch((e) => { console.error('探针挂了', e.message); process.exitCode = 1 })
