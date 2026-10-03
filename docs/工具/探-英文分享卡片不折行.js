// 一次性探针（量完就删）：英文态那枚通栏「Share card: Chat / Moments / Official Account」
// 到底放不放得进条子的内沿。真跑尺子那一条判据钉的是中文串（20 个字），英文没量过就不能说"放得下"。
// 跑法：bash docs/工具/跑尺子.sh 9431 探-英文分享卡片不折行
const automator = require('miniprogram-automator')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const lang = require('./尺子语言钉.js')
const i18n = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  const before = await lang.read(mp)
  await lang.pin(mp, 'en')
  const page = await mp.reLaunch('/pages/index/index')
  await sleep(4500)
  const win = await mp.evaluate(() => wx.getWindowInfo().windowWidth)
  const R = win / 750
  await page.setData({ templateOpen: true, posterHasCard: true, posterImagePath: '/__probe__.jpg' })
  await sleep(900)
  const tx = await page.$('.tpl-main text')
  const box = await page.$('.tpl-main')
  const ts = tx && await tx.size()
  const bs = box && await box.size()
  const got = tx ? await tx.text() : '（这一枚没渲染）'
  const w = ts ? ts.width / R : -1
  const h = ts ? ts.height / R : -1
  const bw = bs ? bs.width / R : -1
  console.log(`界面语言=${await lang.read(mp)}`)
  console.log(`屏上=${got}`)
  console.log(`字典=${i18n.texts('en').cardShare}`)
  console.log(`字 ${w.toFixed(1)}×${h.toFixed(1)}rpx　条子 ${bw.toFixed(1)}rpx　一行=${h > 0 && h <= 44}　不越内沿=${w > 0 && w <= bw - 8}`)
  await page.callMethod('_closeTemplate')
  await lang.pin(mp, before)
  await mp.close()
})().catch((e) => {
  console.error('探针挂了：', e && e.message)
  process.exit(1)
})
