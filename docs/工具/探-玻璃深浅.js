// 10-11 09:2x 站长报「毛玻璃明显过深，与效果图不一致」——这一把不判对错，只把"深"拆成两笔账：
//   一笔是**他 10-10 拍的「调亮度」默认档**（半月＝罩层 opacity .5），一笔是**白纱本身**（他拍的 .30）。
// 做法：同一屏、同一张包内形象图，只把 `dimV` 从默认那档换到"满月"（罩层＝0，等于没有压暗），各拍一张。
// 跑法：docs/工具/跑尺子.sh 9431 探-玻璃深浅
// 数怎么读：`量-玻璃深浅.py`（同一份脚本里也带了简版读数，跑完直接打印）。
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/10-11毛玻璃/实测')
const BG = '/assets/home-bg-portrait.jpg'

;(async () => {
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上 9431，先跑 cli auto')
  const geo = () => mp.evaluate(() => new Promise((resolve) => {
    const i = wx.getWindowInfo()
    const q = wx.createSelectorQuery()
    q.select('.sheet').boundingClientRect()
    q.select('.head').boundingClientRect()
    q.exec((r) => resolve({ win: { w: i.windowWidth, h: i.windowHeight }, box: r }))
  }))
  const rows = []
  await mp.switchTab('/pages/index/index')
  await sleep(8000)
  const page = await mp.currentPage()
  // ⚠ 第一版这一把是**没牙的**：它只 setData({dimV:0})，而罩子吃的是 `dimScrim` 那枚内联透明度串
  //   （每次进页由 `app.bgSkin()` 从本机存储读进来），`dimV` 只是给那枚点看的。两张图一模一样、
  //   差值报 0，看着像"这一档不影响"，其实是我没拨到东西。所以这里直接给 `dimScrim`，
  //   值就照 `palette.dimScrimStyle()` 那一支产出的串，并把节点上的 style 读回来自证它落上了。
  const TIERS = [['半月（默认档）', 'opacity:0.5'], ['满月（罩层=0）', 'opacity:0']]
  for (const [档, style] of TIERS) {
    await page.setData({ bgSrc: BG, dimScrim: style })
    await sleep(3500)
    // 自证这一枚 data 真落上了（`page.data()` 读的是页面自己的 data，不是我以为的值）。
    // ⚠ 上一版这里用的是 `mp.evaluate` + `q.select('.head-scrim').fields(...)`，跑起来报
    //   "An object could not be cloned"——automator 把那枚节点对象往回传时序列化不掉，
    //   读 data 就够了，不必去摸节点。
    const back = String(await page.data('dimScrim'))
    const g = await geo()
    const scale = g.win.w / 750
    const sheet = g.box[0], head = g.box[1]
    if (!sheet) throw new Error('摸不到 .sheet，这两张不能用')
    rows.push({
      档: 档, dimScrim: style, scrimNode: back,
      file: `深浅-${style === 'opacity:0' ? '0' : '1'}.png`,
      win: g.win,
      // 玻璃带：卡顶往下 158rpx（白纱那一段），取卡左那条无字竖带之外的整宽
      glass: [sheet.left, sheet.top, sheet.width, Math.min(158 * scale, sheet.height)],
      // 罩层带：头部里、卡顶以上那一条（只有压暗、没有白纱）——用它证明"这一档到底压了多少"
      scrim: [head.left + 8 * scale, Math.max(0, sheet.top - 120 * scale), head.width, 100 * scale],
    })
    await mp.screenshot({ path: `${OUT}/深浅-${style === 'opacity:0' ? '0' : '1'}.png` })
    console.log(`${档}｜写进去=${style}｜页面 data 读回＝${back}｜卡顶视口 y=${sheet.top.toFixed(1)}px`)
    if (back !== style) throw new Error(`data 没落上（写 ${style}、读回 ${back}）＝这一把没牙，不出数`)
  }
  fs.writeFileSync(`${OUT}/深浅.json`, JSON.stringify(rows, null, 1))
  console.log(`存 ${OUT}/深浅.json（两张：深浅-1.png＝默认档、深浅-0.png＝罩层 0）`)
  await mp.close()
})().catch((e) => { console.error('!! 探针挂了', e && (e.stack || e.message)); process.exit(1) })
