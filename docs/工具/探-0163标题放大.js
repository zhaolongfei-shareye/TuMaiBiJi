// 站长 10-15 09:2x 两句一起量的探针（只报数、不判红）：
//   ① 「首屏左上角的图片文字，可以放大一点。现在有点小」⇒ 把标题那枚的**盒**与**源件比例**、
//      以及它右边那一列（头发／脸）在截图里的落点取出来，放大余量由同一张截图量，不由这把算。
//   ② 「三个设置深浅字要一致」⇒ 并回一行一个判据之后，那一行三枚各自底上的对比度到底多少，
//      这一把把三枚自己的框（不是整行那一个）报出来，好让 python 在同一张图上逐枚采样子。
// 跑法：MP_ROOT=… docs/工具/跑尺子.sh 9431 探-0163标题放大
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const DIR = path.resolve(__dirname, '../design/10-15标题放大')
const SHOT = path.join(DIR, '探针-首屏.png')
const num = (v) => Math.round(Number(v) * 10) / 10

// 几何一律走 `page.$$(sel)` + offset/size，不在 evaluate 里拿 createSelectorQuery：
//   那是查询接口、要等 exec 回调，evaluate 的返回被序列化时容易只拿到 undefined，
//   读回来是"这屏没有这个元素"其实是根本没等到。正本抄 探-0150六件 的 frames()。
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

;(async () => {
  fs.mkdirSync(DIR, { recursive: true })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')
  await mp.reLaunch('/pages/create/create')
  await sleep(6000)
  const page = await mp.currentPage()
  const wi = await mp.evaluate(() => {
    const i = wx.getWindowInfo()
    return { w: i.windowWidth, h: i.windowHeight, dpr: i.pixelRatio }
  })
  const d = await page.data()
  const geo = await frames(page, ['.ai-line', '.page-title', '.home-swap', '.swap-half',
    '.swap-text', '.swap-glyph', '.stage-panel'])
  // 容器上那一串类名是从**渲染层**读的：data 里 true 而类名没挂上＝wxml 那条三元没接对，
  // 只读 data 看不出来（"有值没皮"这一类坑本仓踩过几次）。
  const cls = String((await (await page.$('.container')).attribute('class')) || '')
  await mp.screenshot({ path: SHOT })
  const src = (() => {
    // ⚠ 只取 bgSrc 这一格：上一版写成 `geo.title && geo.bgSrc`，`&&` 回的是左边那个对象，
    //   path.join 直接抛 TypeError ⇒ 探针在打印前挂掉，看着像"跑不通"其实是取错了格。
    const rel = String(d.bgSrc || '').replace(/^\//, '')
    const f = path.join(__dirname, '../../miniprogram', rel)
    if (!rel || !fs.existsSync(f)) return '(源件读不到)'
    const buf = fs.readFileSync(f)
    // PNG IHDR：宽在 16~19、高在 20~23（大端）；jpg 走不了这条
    if (buf.slice(0, 4).readUInt32BE(0) !== 0x89504e47) return { 非PNG: true, file: rel }
    return { file: rel, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  })()
  console.log(JSON.stringify({
    shot: SHOT, win: wi, pxPerRpx: wi.w / 750, src, containerClass: cls, imgStyle: d.imgStyle || '',
    flags: { hasBg: !!d.bgSrc, bgLight: !!d.bgLight, bgLightLow: !!d.bgLightLow,
      bgLightTitle: !!d.bgLightTitle, bgLightSwap: !!d.bgLightSwap, bgLightOut: !!d.bgLightOut, dimV: d.dimV },
    geo,
  }, null, 1))
  mp.close()
  process.exit(0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
