// 报数探针，不判红：把两屏每一态的几何全打成 rpx，用来定「内框等高＋第二屏压紧凑」那一刀该给多少。
// 为什么单独一把：`验-录入面板沉底-真跑.js` 钉的是"等式成立"，它只吐红绿；
// 这一把要的是**每张卡里那几段的实际顶底边**（哪一段是死空间），那个数判据里不出现。
// 前置：MP_ROOT=$PWD docs/工具/跑尺子.sh 9431 探-第二屏几何
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const i18n = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))
const OUT = path.resolve(__dirname, '../design/10-12-2.2全量效果图/实测')

const SELS = ['.stage-panel', '.home-blk', '.blk-person', '.blk-face', '.blk-count', '.blk-col',
  '.blk-tips', '.blk-plus', '.home-swap', '.title-row', '.entry-wrap', '.out', '.out-r',
  '.panel', '.modes', '.card', '.crow', '.strip', '.field', '.sld', '.wr-sw', '.tab-bar']
const STATES = [
  ['', 0, false, '① 首屏（收起）'],
  ['photo', 0, false, '② 照片·空三枚圈'],
  ['photo', 4, false, '③ 照片·4 张（一行）'],
  ['photo', 9, false, '④ 照片·9 张（两行·展开）'],
  ['url', 0, false, '⑤ 链接·一个框＋右滑条'],
  ['write', 0, false, '⑥ 文字·收起一行'],
  ['write', 0, true, '⑦ 文字·展开两行'],
]

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) { console.log('连不上自动化端口，先跑 cli auto'); process.exit(1) }
  let page
  for (let i = 0; i < 6; i++) {
    try {
      page = await mp.reLaunch('/pages/create/create')
      await sleep(2500)
      if (await page.$('.home-blk')) break
      page = null
    } catch (e) { page = null }
    await sleep(3000)
  }
  if (!page) { console.log('✗ 进不去 /pages/create/create'); process.exit(1) }

  const win = await mp.systemInfo()
  const K = win.windowWidth / 750
  const rpx = (v) => Math.round(v / K * 10) / 10
  const geo = (list) => mp.evaluate((sels) => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    sels.forEach((s) => { q.selectAll(s).boundingClientRect() })
    q.exec((r) => resolve(sels.map((s, i) => (r[i] || []).map((x) => ({
      top: x.top, bottom: x.bottom, h: x.height, w: x.width, left: x.left,
    })))))
  }), list)

  const rows = []
  for (const [active, shots, open, label] of STATES) {
    await page.setData({
      lang: 'zh', t: i18n.texts('zh'), active,
      sldIcon: { photo: 'images', url: 'link', write: 'pen' }[active] || 'images',
      previewImages: Array.from({ length: shots }, (_, i) => `http://usr/probe-${i}.png`),
      urlInput: active === 'url' ? 'https://mp.weixin.qq.com/s/abcdef' : '',
      urlHint: active === 'url' ? 'ok' : 'idle',
      writeBody: active === 'write' ? '第一段\n第二段' : '',
      bodyFocus: !!open, errLine: '',
    })
    await page.callMethod('_sync')
    await sleep(900)
    const g = await geo(SELS)
    const one = (s) => (g[SELS.indexOf(s)][0] || null)
    const all = (s) => g[SELS.indexOf(s)]
    const f = (x) => (x ? `顶 ${rpx(x.top)} 底 ${rpx(x.bottom)} 高 ${rpx(x.h)}` : '—')
    const line = { 态: label, 墨顶: rpx((one('.stage-panel') || {}).top || NaN) }
    for (const s of ['.home-blk', '.blk-person', '.blk-face', '.blk-count', '.blk-tips', '.blk-plus',
      '.entry-wrap', '.out', '.out-r', '.panel', '.modes', '.card', '.crow', '.field', '.sld', '.wr-sw'])
      line[s] = f(one(s))
    line['.strip'] = all('.strip').length ? f(all('.strip')[0]) + `｜格 ${all('.th') ? all('.th').length : '?'}` : '—'
    // 卡里那几段之间的死空间：卡顶→第一段顶、每段之间、最后一段底→卡底
    const kids = ['.crow', '.strip', '.field', '.wr-sw', '.sld'].flatMap((s) => all(s))
      .filter((x) => x && x.h).sort((a, b) => a.top - b.top)
    const card = one('.card')
    if (card && kids.length) {
      const gaps = [rpx(kids[0].top - card.top)]
      for (let i = 1; i < kids.length; i++) gaps.push(rpx(kids[i].top - kids[i - 1].bottom))
      gaps.push(rpx(card.bottom - kids[kids.length - 1].bottom))
      line.卡内缝 = gaps.join(' / ')
      line.卡内容高 = rpx(kids.reduce((a, x) => a + x.h, 0))
    }
    rows.push(line)
    console.log(JSON.stringify(line))
  }
  const shot1 = path.join(OUT, '探针-首屏.png')
  const shot2 = path.join(OUT, '探针-第二屏.png')
  await page.setData({ lang: 'zh', t: i18n.texts('zh'), active: '', previewImages: [], bodyFocus: false })
  await page.callMethod('_sync'); await sleep(700)
  await mp.screenshot({ path: shot1 })
  await page.setData({ active: 'photo', sldIcon: 'images' })
  await page.callMethod('_sync'); await sleep(700)
  await mp.screenshot({ path: shot2 })
  /* D23 那条待拍要的三个数（只报数、不判）：默认这张形象图上下两档各判成什么、
     抬到墨面之上那一枚在屏上算出来的字色到底是纸白还是墨。
     判据在 utils/imgBrightness.js（阈值 160），这里读的是它跑完之后的真值。 */
  const outEl = await page.$('.out')
  const swapEl = await page.$('.home-swap')
  const td = await page.data()
  console.log('深浅 ' + JSON.stringify({
    bgSrc: String(td.bgSrc || '').slice(-30), bgLight: td.bgLight, bgLightLow: td.bgLightLow,
    返回字色: outEl ? await outEl.style('color') : null,
    换背景行字色: swapEl ? await swapEl.style('color') : null,
  }))
  console.log('视口 ' + JSON.stringify(win.windowWidth) + '×' + rpx(win.windowHeight) + 'rpx')
  console.log('截图 ' + shot1 + '｜' + shot2)
  await mp.close()
  process.exit(0)
})().catch((e) => { console.log('探针挂了', e && e.message); process.exit(1) })
