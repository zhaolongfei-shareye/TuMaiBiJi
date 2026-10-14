// 一次性探针（不是判据）：两件事，都要**亚像素**才量得出来。
// ① 第二屏展开态那枚「返回」的字色（站长 10-15 02:5x「包括第二屏的 back」）。
//    上一把探针只把 `bgLightOut` 那枚 data 读回来了，屏上那支 `color` 没量 ⇒ 这条还不算闭环。
// ②「我的」页那条线（#151）。`element.offset()` 给的数是**截断**的（74.88 报成 74），
//    而这一条线的根因就在亚像素那半格上：带子、名片行、照片、卡片各自的底沿落在
//    第几个 1/3 像素上，用截断的数永远对不齐 ⇒ 这一把直接走 `boundingClientRect` 拿全浮点。
// 跑法：MP_ROOT=/Users/zlfmac/Documents/TuMaiBiJi docs/工具/跑尺子.sh 9431 探-0151那条线
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '../..')
const DIR = path.join(ROOT, 'docs/design/10-15首屏六件')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const unwrap = (r) => (r && typeof r === 'object' && 'result' in r ? r.result : r)

async function main() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true })
  let mp
  for (let i = 0; i < 12; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }); break } catch (e) { await sleep(8000) }
  }
  if (!mp) { console.log('!! 连不上自动化端口'); process.exit(1) }
  await sleep(5000)

  // ---------- ① 第二屏那枚「返回」 ----------
  await mp.reLaunch('/pages/create/create')
  await sleep(5000)
  let page = await mp.currentPage()
  await (await page.$('.blk-plus')).tap()
  await sleep(3000)
  page = await mp.currentPage()
  const cls = String((await (await page.$('.container')).attribute('class')))
  console.log('展开态容器类名：', cls)
  const out = await page.$('.out')
  console.log('第二屏 back 的字色：', JSON.stringify({
    color: String((await out.style('color'))),
    bg: String((await out.style('background-color'))),
  }))
  const d = await page.data()
  console.log('展开态 data：', JSON.stringify({
    bgLightTitle: d.bgLightTitle, bgLightSwap: d.bgLightSwap, bgLightOut: d.bgLightOut,
    hasBg: !!d.bgSrc,
  }))
  await mp.screenshot({ path: path.join(DIR, '探针-0151-第二屏back.png') })

  // ---------- ②「我的」那条线：亚像素层账 ----------
  await mp.switchTab('/pages/me/me')
  await sleep(4500)
  const rects = unwrap(await mp.evaluate(() => new Promise((res) => {
    const q = wx.createSelectorQuery()
    const list = ['.head', '.head-band', '.head-img', '.head-scrim', '.sheet', '.me-body', '.menu-group']
    list.forEach((s) => q.select(s).boundingClientRect())
    q.exec((r) => {
      const o = {}
      list.forEach((s, i) => {
        const n = r[i]
        o[s] = n ? { top: n.top, bottom: n.bottom, h: n.height, left: n.left, right: n.right } : null
      })
      res(o)
    })
  })))
  console.log('\n== 我的：亚像素层账（bottom 全浮点）==')
  console.log(JSON.stringify(rects, null, 1))
  // 那一档 --bg-page 与卡片色也要现读：判"哪一层漏在缝里"靠的是颜色归属，不是猜。
  const paint = {}
  for (const s of ['.head-band', '.sheet', '.menu-group', '.container']) {
    const n = await (await mp.currentPage()).$(s)
    if (!n) { paint[s] = null; continue }
    paint[s] = {
      bg: String((await n.style('background-color'))),
      img: String((await n.style('background-image'))).slice(0, 170),
      z: String((await n.style('z-index'))),
      pos: String((await n.style('position'))),
    }
  }
  console.log('\n各层皮：', JSON.stringify(paint, null, 1))
  await mp.screenshot({ path: path.join(DIR, '探针-0151-me.png') })
  await mp.close()
  console.log('\n探针完')
}
main().catch((e) => { console.log('!! 探针挂了：' + String((e && e.message) || e)); process.exit(1) })
