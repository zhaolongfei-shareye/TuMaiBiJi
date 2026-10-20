// 一次性取景：英文态卡片弹窗顶上那一行，最窄缝那一档（Magazine Cover）留一张图。只读，不发任何写请求。
const automator = require('miniprogram-automator')
const { texts } = require('/Users/zlfmac/Documents/TuMaiBiJi/miniprogram/utils/i18n.js')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  await mp.switchTab('/pages/index/index')
  const ip = await mp.currentPage()
  await ip.waitFor(2000)
  const notes = (await ip.data()).notes || []
  let opened = null
  for (const n of notes) {
    if (n.is_private) continue
    await ip.callMethod('_openPosterFor', n)
    await sleep(1300)
    const d = await ip.data()
    if (d.templateOpen && !d.posterHasCard) { opened = n; break }
    await ip.callMethod('_closeTemplate'); await sleep(300)
  }
  if (!opened) { console.log('!! 开不出未生成态那一层'); process.exit(1) }
  await ip.setData({ lang: 'en', t: texts('en') })
  await sleep(900)
  await ip.callMethod('_tplPick', 'cover')
  await sleep(700)
  const d = await ip.data()
  const els = await ip.$$('.float-sheet .grip .grip-tx')
  const box = []
  for (const el of els) { const o = await el.offset(); const s = await el.size(); box.push({ l: o.left, r: o.left + s.width, w: s.width }) }
  console.log('念的是：', JSON.stringify(d.posterTplName), '／左端那句：', JSON.stringify((d.t || {}).swipeHint))
  console.log('三枚盒子(css px)：', JSON.stringify(box))
  await mp.screenshot({ path: '/tmp/grip-en-Magazine-Cover.png' })
  await ip.callMethod('_closeTemplate')
  await ip.setData({ lang: 'zh', t: texts('zh') })
  await sleep(500)
  console.log('已留图：/tmp/grip-en-Magazine-Cover.png')
  process.exit(0)
})().catch((e) => { console.log('!! 崩：' + e.message); process.exit(1) })
