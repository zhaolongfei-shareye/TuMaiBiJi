// 一次性探针（不是判据）：把 10-15 01:4x 那六件＋02:5x／03:0x／03:2x 那三句涉及的屏各截一张、
// 把关键元素的帧与那三格新 data 打出来。
// 为什么要先探：站长说「面板中间多了一条线」，他给的是一张**裁过的**截图（791×362），
// 裁掉的偏移量不知道 ⇒ 那条线到底是"名片行那层玻璃的底沿"还是"下面那张卡的顶沿"，
// 从裁图里量不出来。这里连元素自己的 offset 一起打，两边一对就知道是哪一层。
// 跑法：MP_ROOT=/Users/zlfmac/Documents/TuMaiBiJi docs/工具/跑尺子.sh 9431 探-0150六件
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '../..')
const DIR = path.join(ROOT, 'docs/design/10-15首屏六件')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const unwrap = (r) => (r && typeof r === 'object' && 'result' in r ? r.result : r)

const num = (v) => Number(typeof v === 'string' ? parseFloat(v) : v)

async function frames(page, sels) {
  const out = {}
  for (const sel of sels) {
    const all = await page.$$(sel)
    if (!all || !all.length) { out[sel] = null; continue }
    const one = async (n) => {
      const o = await n.offset()
      const s = await n.size()
      return { top: num(o.top), left: num(o.left), w: num(s.width), h: num(s.height) }
    }
    out[sel] = all.length === 1 ? await one(all[0]) : await Promise.all(all.map(one))
  }
  return out
}

// 那条 1 像素的横线只有四种来源：渐变带自己的接缝、描边、投影、或某层背景图的边缘。
// 帧只能告诉我"哪一层的底沿落在那一行"，说不清是谁画的 ⇒ 这四枚一起读回来，两边一对就有归属。
async function paint(page, sels) {
  const out = {}
  for (const sel of sels) {
    const n = await page.$(sel)
    if (!n) { out[sel] = null; continue }
    out[sel] = {
      bg: String((await n.style('background-color')) || ''),
      img: String((await n.style('background-image')) || '').slice(0, 150),
      filter: String((await n.style('filter')) || ''),
      opacity: String((await n.style('opacity')) || ''),
      color: String((await n.style('color')) || ''),
    }
  }
  return out
}

async function main() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true })
  let mp
  for (let i = 0; i < 12; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }); break } catch (e) { await sleep(8000) }
  }
  if (!mp) { console.log('!! 连不上自动化端口'); process.exit(1) }
  await sleep(5000)
  const sys = await mp.systemInfo()
  const R = sys.windowWidth / 750
  console.log(`视口 ${sys.windowWidth}×${sys.windowHeight}（1rpx=${R.toFixed(3)}px）`)

  // 视口自己滚不滚。⚠ 不能用 `document`：evaluate 跑在 appservice 那一侧，没有 DOM，
  //   写了它读回来是 undefined ⇒ 看上去"这屏不滚"其实是根本没读到。正本抄 `验-列表头部铺图-真跑`。
  const readVp = async () => unwrap(await mp.evaluate(() => new Promise((res) => {
    wx.createSelectorQuery().selectViewport().scrollOffset().exec((r) => res(r && r[0]))
  })))

  // ---------- 首屏（create）：那一行、那枚角、那张标题图、那三块与面板顶 ----------
  await mp.reLaunch('/pages/create/create')
  await sleep(6000)
  let page = await mp.currentPage()
  const CREATE = ['.ai-line', '.ai-text', '.lang-corner', '.title-row', '.page-title',
    '.home-swap', '.swap-half', '.swap-text', '.swap-glyph', '.stage-panel', '.home-blk']
  console.log('\n== create 收起态 ==')
  console.log(JSON.stringify(await frames(page, CREATE), null, 1))
  const d0 = await page.data()
  console.log('三格按矩形的深浅：', JSON.stringify({
    hasBg: !!d0.bgSrc, bgLight: d0.bgLight, bgLightLow: d0.bgLightLow,
    bgLightTitle: d0.bgLightTitle, bgLightSwap: d0.bgLightSwap, bgLightOut: d0.bgLightOut,
  }))
  console.log('容器上那串类名：', String((await (await page.$('.container')).attribute('class'))))
  console.log('标题图与三枚的字色／滤镜：', JSON.stringify(await paint(page,
    ['.page-title', '.swap-text', '.swap-glyph', '.home-swap']), null, 1))
  await mp.screenshot({ path: path.join(DIR, '探针-create-收起.png') })

  // 英文态这一趟**不在探针里切**：`onSwitchLang` 那一句会真发 PUT /api/user/language
  // （现网那一栏跟着变），探针不该带写。

  // 展开态（第二屏）：那一行该整条不占位；三档各自那个框
  await mp.reLaunch('/pages/create/create')
  await sleep(4000)
  page = await mp.currentPage()
  await (await page.$('.blk-plus')).tap()
  await sleep(3000)
  let p2 = await mp.currentPage()
  console.log('== create 展开态：那一行还在不在 ==')
  console.log(JSON.stringify(await frames(p2, ['.home-swap', '.out', '.stage-panel']), null, 1))
  const d1 = await p2.data()
  console.log('展开态三格：', JSON.stringify({ bgLightTitle: d1.bgLightTitle, bgLightSwap: d1.bgLightSwap, bgLightOut: d1.bgLightOut }))
  await mp.screenshot({ path: path.join(DIR, '探针-entry-photo.png') })
  const ENTRY = ['.panel', '.card', '.field', '.field-input', '.field-area', '.field-paste',
    '.paste-glyph', '.field-x', '.crow', '.sld', '.modes']
  for (const tab of ['url', 'write']) {
    await p2.callMethod('onTab', { currentTarget: { dataset: { tab } } })
    await sleep(1800)
    p2 = await mp.currentPage()
    console.log(`== 第二屏 ${tab} ==`)
    console.log(JSON.stringify(await frames(p2, ENTRY), null, 1))
    await mp.screenshot({ path: path.join(DIR, `探针-entry-${tab}.png`) })
  }

  // ---------- 我的：那条线在哪一层 + 这一屏谁在滚 ----------
  await mp.switchTab('/pages/me/me')
  await sleep(4000)
  page = await mp.currentPage()
  const ME = ['.container', '.head', '.head-band', '.head-scrim', '.sheet', '.pill', '.me-body',
    '.menu-group', '.menu-item']
  const ME_PAINT = ['.head-band', '.sheet', '.menu-group', '.container']
  console.log('== 我的（设置档）==')
  console.log(JSON.stringify(await frames(page, ME), null, 1))
  console.log(JSON.stringify(await paint(page, ME_PAINT), null, 1))
  console.log('视口（scrollHeight 应＝窗口高，滚的是 .me-body）：', JSON.stringify(await readVp()))
  await mp.screenshot({ path: path.join(DIR, '探针-me-设置.png') })
  await page.callMethod('onTab', { currentTarget: { dataset: { key: 'about' } } })
  await sleep(2500)
  console.log('== 我的（关于档）==')
  page = await mp.currentPage()
  console.log(JSON.stringify(await frames(page, ME), null, 1))
  console.log('视口：', JSON.stringify(await readVp()))
  await mp.screenshot({ path: path.join(DIR, '探针-me-关于.png') })
  await mp.close()
  console.log('\n探针完（这张 mp.close() 是必须的：不关端口下一把连不上）')
}
main().catch((e) => { console.log('!! 探针挂了：' + String((e && e.message) || e)); process.exit(1) })
