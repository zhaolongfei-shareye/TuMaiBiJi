// 一次性探针：站长 10-18 报「笔记里正文都是一段文字，没有任何换行、段落」——量屏上到底丢在哪一层。
// 跑法：docs/工具/跑尺子.sh 9431 量-正文换行两屏
//
// 判法：同一个类名、同一档字号，喂两串只差换行的文本比高度。
// 串里只用**短词**（甲乙丙丁戊），保证"塌成一行"时绝不换行、"换行被认"时必然是五行——
// 第一版拿 30 字整句当样本，两串都自己折到四行，量出来两个 95.2 一模一样，读不出任何结论。
// 比"数行盒"稳：这台工具的 automator 拿不到 Range.getClientRects，只拿得到元素的 boundingClientRect。
const automator = require('miniprogram-automator')
const path = require('path')

const PORT = process.env.APORT || '9431'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const FIVE = '甲\n\n乙\n\n丙\n\n丁\n\n戊'
const ONE = '甲 乙 丙 丁 戊'

const h = async (page, sel, marker) => {
  // 同一个类名在详情窗里有**两枚**（摘要那一枚 :252、原文那一枚 :269），
  // `page.$()` 返回的是文档序第一枚 ⇒ 上一版量到的是摘要，两串喂进去高度一模一样。
  // 所以要按"文本里有没有我喂进去的那个记号"挑元素，不按类名取第一枚。
  const all = await page.$$(sel)
  const list = Array.isArray(all) ? all : (all && all.result) || []
  for (const el of list) {
    const t = await el.text().catch(() => '')
    if (!String(t).includes(marker)) continue
    const s = await el.size()
    return s ? Math.round(s.height * 10) / 10 : null
  }
  return null
}

;(async () => {
  const mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` })
  await sleep(3000)

  // ---------- 首页详情窗里那一格（宿主是 <view class="ds-para">） ----------
  await mp.reLaunch('/pages/index/index')
  await sleep(6000)
  let page = await mp.currentPage()
  const d = await page.data()
  console.log('屏上路由:', await mp.currentPage ? page.path : '', '｜包内版本:', (d.lang ? '' : '') + (d.versionName || d.version || ''))
  const note = (d.notes || [])[0]
  if (!note) { console.log('!! 名下没有笔记，量不了'); process.exit(1) }
  const sheetNote = Object.assign({}, note, { original_content: FIVE })
  await page.setData({ detailOpen: true, origOpen: true, detailNote: sheetNote })
  await sleep(1200)
  const viewFive = await h(page, '.ds-para', '甲')
  await page.setData({ detailNote: Object.assign({}, note, { original_content: ONE }) })
  await sleep(1200)
  const viewOne = await h(page, '.ds-para', '甲')
  console.log(`详情窗 .ds-para　喂五段 ${viewFive}　喂一段 ${viewOne}　比值 ${viewFive && viewOne ? (viewFive / viewOne).toFixed(2) : 'n/a'}`)

  // ---------- 独立详情页那一格（宿主是 <text class="original-text">） ----------
  // 先走详情窗里那枚「更多」的真口（`onSheetMore`）；第一版直接 navigateTo 抛了个
  // `Uncaught [object Object]`，第二屏一趟没量到。
  await page.callMethod('onSheetMore').catch((e) => console.log('onSheetMore 这条路不通:', JSON.stringify(e && (e.message || e)).slice(0, 160)))
  await sleep(5000)
  page = await mp.currentPage()
  if (page.path !== 'pages/detail/detail') {
    console.log('点「更多」没进详情页（屏上还是', page.path, '），退回直拼 url 再试一次')
    await mp.navigateTo(`/pages/detail/detail?id=${note.id}`)
    await sleep(5000)
    page = await mp.currentPage()
  }
  console.log('第二屏路由:', page.path)
  const dd = await page.data()
  if (!dd.note) { console.log('!! 详情页没读到笔记，量不了'); process.exit(1) }
  await page.setData({ showOriginal: true, note: Object.assign({}, dd.note, { original_content: FIVE }) })
  await sleep(1200)
  const textFive = await h(page, '.original-text', '甲')
  await page.setData({ note: Object.assign({}, dd.note, { original_content: ONE }) })
  await sleep(1200)
  const textOne = await h(page, '.original-text', '甲')
  console.log(`详情页 .original-text　喂五段 ${textFive}　喂一段 ${textOne}　比值 ${textFive && textOne ? (textFive / textOne).toFixed(2) : 'n/a'}`)

  console.log('\n判读：比值 ≥3 ⇒ 换行真画出来了；≈1 ⇒ 那一格把 \\n 折成了空格')
  await mp.close()
})().catch((e) => {
  console.log('探针挂了:', e && e.message ? e.message : JSON.stringify(e).slice(0, 400))
  process.exit(1)
})
