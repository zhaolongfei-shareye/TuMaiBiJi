// 「调亮度」这一枚圆点的真跑自证：在模拟器里真点、真读计算样式、真从像素上量。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-背景亮度圆点-真跑.js
// 前置：微信开发者工具已开；这批改过 WXSS，要先 cli close 再 cli auto --auto-port 9431。
// 一把量四件事，都是静态尺子够不到的：
//  ① 点一下真换一档，三下回到纯白（界面那一枚点的颜色就是当前档）；
//  ② 纯白那一档**没有**多叠一层——不是叠了层全透明，照片还是现网那张；
//  ③ 那层黑压得住照片，但压不到字：照片那块均值要掉一半，标题最亮的那个像素不许掉；
//  ④ 三页吃同一个本机键，在首页点完，笔记页和「我的」页一起沉。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/背景亮度/实测')
const PROBE = path.resolve(__dirname, '采-亮度图层.py')
const p = require('../../miniprogram/utils/palette.js')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const rgbOf = (s) => (String(s).match(/-?\d+(\.\d+)?/g) || []).map(Number)
const hexArr = (h) => [0, 1, 2].map((i) => parseInt(h.replace('#', '').slice(i * 2, i * 2 + 2), 16))
const near = (a, b, tol) => a.length >= b.length
  && b.every((v, i) => Math.abs(a[i] - v) <= (tol === undefined ? 2 : tol))
// 那层黑要连 alpha 一起比：只比三个通道的话，0.25 和 0.5 两档看起来一模一样。
const isVeil = (s, alpha) => {
  const n = rgbOf(s)
  return n.length === 4 && near(n, [8, 9, 12, alpha], 0.005)
}
// 亮度取样：四个数是 rpx，从元素自己的矩形现算，不在这份脚本里另记一遍屏幕比例
const lum = (png, x0, x1, y0, y1) => JSON.parse(
  execFileSync('python3', [PROBE, png, String(Math.round(x0)), String(Math.round(x1)),
    String(Math.round(y0)), String(Math.round(y1))],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('探针挂了（未处理拒绝）', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')
  fs.mkdirSync(OUT, { recursive: true })

  const enter = async (url) => {
    for (let i = 0; i < 5; i++) {
      try { return await mp.reLaunch(url) } catch (e) { console.log(`第 ${i + 1} 次进 ${url} 没成：${e.message}`); await sleep(8000) }
    }
    throw new Error(`进不去 ${url}`)
  }
  const rects = (sels) => mp.evaluate((list) => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    list.forEach((s) => { q.select(s).boundingClientRect() })
    q.exec((r) => resolve(r.slice(0, list.length)))
  }), sels)
  const styleOf = async (page, sel, prop) => {
    const el = await page.$(sel)
    if (!el) return null
    return el.style(prop)
  }

  // 借走的是这台模拟器的本机偏好，量完原样还回去
  const dimBefore = await mp.evaluate(() => wx.getStorageSync('bgDim'))
  await mp.evaluate(() => wx.removeStorageSync('bgDim'))

  // ---------- ① 纯白＝现网那张照片，一层都没多 ----------
  let page = await enter('/pages/create/create')
  await sleep(4500)
  let d = await page.data()
  ck('首页铺着图（不然这一档无从谈起）', !!d.bgSrc, d.bgSrc || '(空)')
  const win = (await rects(['.page-bg']))[0]
  const R = win.width / 750                      // 截图就是视口：1rpx = R 个像素
  const rpx = (px) => px / R
  ck('进页默认 0 档，dimVeil 是空串', d.dimV === 0 && d.dimVeil === '', JSON.stringify([d.dimV, d.dimVeil]))
  ck('0 档不渲染那一层（不是叠了一层全透明）', (await page.$$('.page-dim')).length === 0)
  ck('现网那层罩子照旧在', (await page.$$('.page-scrim')).length === 1)
  ck('点它是纯白那一枚', near(rgbOf(await styleOf(page, '.dim-dot', 'background-color')), hexArr(p.BG_DIMS[0].dot)),
    await styleOf(page, '.dim-dot', 'background-color'))
  const one = await rects(['.title-row', '.date-row', '.entry-wrap', '.home-swap'])
  const shot0 = path.join(OUT, '实测-1-纯白0档.png')
  await mp.screenshot({ path: shot0 })
  await sleep(600)

  // ---------- ② 点两下走完 25 → 50 ----------
  const halves0 = await page.$$('.swap-half')
  ck('这一行是两半：左「调亮度」、右「换背景」',
    halves0.length === 2
    && (await (await halves0[0].$('.swap-text')).text()) === '调亮度'
    && (await (await halves0[1].$('.swap-text')).text()) === '换背景',
    halves0.length + ' 半')
  const half = halves0[0]
  await half.tap()
  await sleep(900)
  d = await page.data()
  ck('点一下到 25 档', d.dimV === 25 && d.dimVeil === p.dimVeilStyle(25), JSON.stringify([d.dimV, d.dimVeil]))
  const veilCss = await styleOf(page, '.page-dim', 'background-color')
  ck('那一层真渲染出来了，颜色就是 palette 发下来的那支黑（连 alpha 一起对）',
    (await page.$$('.page-dim')).length === 1 && isVeil(veilCss, 0.25), veilCss)
  await half.tap()
  await sleep(900)
  d = await page.data()
  ck('再点一下到 50 档', d.dimV === 50, d.dimV)
  ck('存储跟着落账（退出这一页再进来还是它）',
    (await mp.evaluate(() => wx.getStorageSync('bgDim'))) === 50)
  ck('点的颜色跟着走到最深那一档',
    near(rgbOf(await styleOf(page, '.dim-dot', 'background-color')), hexArr(p.BG_DIMS[2].dot)),
    await styleOf(page, '.dim-dot', 'background-color'))
  const shot50 = path.join(OUT, '实测-2-点到50档.png')
  await mp.screenshot({ path: shot50 })
  await sleep(600)

  // ---------- ③ 压得住照片、压不到字 ----------
  // 照片取样点：日期行以下、录入条以上那一截左边的空地——整块就是那张人像，没有别的面。
  // （第一版抄了「换背景」那一行的左端，量到 205→193 只掉 6%：那一行正坐在录入条下面
  //  那张白卡上，压的是白卡不是照片，判据本身错了。）
  const [t0, s0] = [rpx(one[0].top), rpx(one[0].bottom)]
  const [py0, py1] = [rpx(one[1].bottom) + 30, rpx(one[2].top) - 40]
  const photo = (png) => lum(png, 36, 150, py0, py1)
  const title = (png) => lum(png, rpx(one[0].left) + 4, rpx(one[0].left) + 200, t0 + 4, s0 - 4)
  const P0 = photo(shot0), P50 = photo(shot50), T0 = title(shot0), T50 = title(shot50)
  ck('50 档照片真的沉了（均值掉到原来的 0.75 倍以下）', P50.mean < P0.mean * 0.75,
    `均值 ${P0.mean} → ${P50.mean}`)
  ck('沉得接近半档黑（不是叠了两层）', P50.mean > P0.mean * 0.35, `比值 ${(P50.mean / P0.mean).toFixed(2)}`)
  ck('标题那个字没有被一起压黑（最亮的那个像素还是纸白档）', T50.max >= T0.max * 0.92,
    `最亮 ${T0.max} → ${T50.max}`)
  ck('而且那一层在罩子之上、字之下（同层靠源码顺序）',
    Number(await styleOf(page, '.page-dim', 'z-index')) === 1
    && Number(await styleOf(page, '.title-row', 'z-index')) === 2,
    `层 ${await styleOf(page, '.page-dim', 'z-index')} / 字 ${await styleOf(page, '.title-row', 'z-index')}`)

  // ---------- ④ 点第三下回到纯白 ----------
  await half.tap()
  await sleep(900)
  d = await page.data()
  ck('三下循环回纯白，那一层又没了', d.dimV === 0 && (await page.$$('.page-dim')).length === 0, d.dimV)
  ck('点它不会把录入条带出来（catchtap 不吃整页的收起）',
    (await page.data()).active === '' || (await page.data()).active === undefined, (await page.data()).active)

  // ---------- ⑤ 三页吃同一个键：笔记页两档各拍一张，同一块地方比 ----------
  await mp.evaluate(() => wx.removeStorageSync('bgDim'))
  page = await enter('/pages/index/index')
  await sleep(4500)
  const head = await rects(['.head', '.h1'])
  const shotI0 = path.join(OUT, '实测-3a-笔记页纯白档.png')
  await mp.screenshot({ path: shotI0 })
  await mp.evaluate(() => wx.setStorageSync('bgDim', 50))
  page = await enter('/pages/index/index')
  await sleep(4500)
  d = await page.data()
  ck('笔记页进页读到的也是 50 档', d.dimV === 50 && d.dimVeil === p.dimVeilStyle(50), JSON.stringify([d.dimV]))
  const iv = await styleOf(page, '.head-dim', 'background-color')
  ck('笔记页头部那一层在，颜色同值', (await page.$$('.head-dim')).length === 1 && isVeil(iv, 0.5), iv)
  const shotI50 = path.join(OUT, '实测-3b-笔记页50档.png')
  await mp.screenshot({ path: shotI50 })
  if (head[0] && head[1]) {
    // 取样点：头部那条带子里、大标题右边那一截（左边是字、右边是那三列数字，中间是纯照片）
    const x0 = rpx(head[0].left) + 250, x1 = rpx(head[0].left) + 330
    const y0 = rpx(head[0].top) + 140, y1 = rpx(head[0].top) + 320
    const A0 = lum(shotI0, x0, x1, y0, y1), A50 = lum(shotI50, x0, x1, y0, y1)
    const H0 = lum(shotI0, rpx(head[1].left), rpx(head[1].left) + 150,
      rpx(head[1].top) + 2, rpx(head[1].bottom) - 2)
    const H50 = lum(shotI50, rpx(head[1].left), rpx(head[1].left) + 150,
      rpx(head[1].top) + 2, rpx(head[1].bottom) - 2)
    ck('笔记页的照片跟着一起沉（和首页同一把尺子）', A50.mean < A0.mean * 0.75,
      `均值 ${A0.mean} → ${A50.mean}`)
    ck('笔记页的大标题没被压黑', H50.max >= H0.max * 0.92, `最亮 ${H0.max} → ${H50.max}`)
  } else ck('笔记页的照片跟着一起沉（和首页同一把尺子）', false, '头部或标题量不到矩形')

  page = await enter('/pages/me/me')
  await sleep(4500)
  ck('「我的」页同一档、同一层',
    (await page.data()).dimV === 50 && (await page.$$('.head-dim')).length === 1,
    JSON.stringify([(await page.data()).dimV]))
  await mp.screenshot({ path: path.join(OUT, '实测-4-我的页50档.png') })

  page = await enter('/pages/create/create')
  await sleep(4500)
  ck('回到首页还是那一档（没有各页一份）', (await page.data()).dimV === 50, (await page.data()).dimV)
  // 这一档下再点「换背景」那半截，仍要走到卡片模板页：两半各管各的，别互相吃掉
  const halves = await page.$$('.swap-half')
  await halves[1].tap()
  await sleep(3000)
  const now = await mp.evaluate(() => getCurrentPages().slice(-1)[0].route)
  ck('右半截照旧导流去卡片模板页', now === 'pages/profile/profile', now)

  // ---------- 还原 ----------
  await mp.evaluate((v) => {
    if (v === '' || v === undefined || v === null) wx.removeStorageSync('bgDim')
    else wx.setStorageSync('bgDim', v)
  }, dimBefore)
  const after = await mp.evaluate(() => wx.getStorageSync('bgDim'))
  ck('本机键已还原成探针进来前的值', String(after) === String(dimBefore), `${after} vs ${dimBefore}`)

  console.log(`\n${bad.length ? '✗ ' + bad.length + ' 条不过：' + bad.join('、') : '背景亮度圆点 真跑：全过'}`)
  mp.close()
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
