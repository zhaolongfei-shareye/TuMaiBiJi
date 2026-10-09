// 「调亮度」这一枚灰度圆点的真跑自证：在模拟器里真点、真读计算样式、真从像素上量。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-背景亮度圆点-真跑.js
// 前置：微信开发者工具已开；这批改过 WXSS，要先 cli close 再 cli auto --auto-port 9431。
// 一把量四件事，都是静态尺子够不到的：
//  ① 默认停在半月（站长 10-02 夜里改的口：三档里默认中档，把选择权给用户），
//    点一下走 满月→半月→弯月→满月；照片亮度采样那段把键钉回弯月起步，
//    为的是三档之间真的分开——默认档本身由①那三条单独钉，不靠采样顺序；
//  ② 满月那一档照片真的等于原图亮度——罩子的 opacity 实读必须是 0，照片均值必须亮回去
//     （上一版栽在这条上：以为"不叠新层"＝"不压暗"，实测只有原图的 62%）；
//  ③ 罩子撤干净之后字上没有那道投影（站长 10-02 夜里否掉了它）——这一档的对比只打数不判红，
//     判据依赖的前提已经不在代码里了，留着就是一条钉着旧方案的假尺子；
//  ④ 三页吃同一个本机键，在首页点完，笔记页和「我的」页那层罩子跟着一起拧。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/背景亮度/实测')
const PROBE = path.resolve(__dirname, '采-亮度图层.py')
const p = require('../../miniprogram/utils/palette.js')

const bad = []
let n = 0
const ck = (name, ok, got) => {
  n++
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const rgbOf = (s) => (String(s).match(/-?\d+(\.\d+)?/g) || []).map(Number)
const hexArr = (h) => [0, 1, 2].map((i) => parseInt(h.replace('#', '').slice(i * 2, i * 2 + 2), 16))
const near = (a, b, tol) => a.length >= b.length
  && b.every((v, i) => Math.abs(a[i] - v) <= (tol === undefined ? 2 : tol))
// 亮度取样：四个数是 rpx，从元素自己的矩形现算，不在这份脚本里另记一遍屏幕比例
const lum = (png, x0, x1, y0, y1, mode) => JSON.parse(execFileSync('python3',
  [PROBE, png, String(Math.round(x0)), String(Math.round(x1)), String(Math.round(y0)),
    String(Math.round(y1)), mode || 'mean'],
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
  const opacityOf = async (page, sel) => Number(await styleOf(page, sel, 'opacity'))

  // 借走的是这台模拟器的本机偏好，量完原样还回去
  const dimBefore = await mp.evaluate(() => wx.getStorageSync('bgDim'))
  await mp.evaluate(() => wx.removeStorageSync('bgDim'))

  // ---------- ① 默认＝半月（站长 10-02 夜里改的口：三档里默认中档，把选择权给用户） ----------
  let page = await enter('/pages/create/create')
  await sleep(4500)
  let d = await page.data()
  ck('首页铺着图（不然这一档无从谈起）', !!d.bgSrc, d.bgSrc || '(空)')
  const win = (await rects(['.page-bg']))[0]
  const R = win.width / 750                      // 截图就是视口：1rpx = R 个像素
  const rpx = (px) => px / R
  ck('本机没有键时停在中间那一档（罩子拧半档，不是铺满也不是全开）',
    d.dimV === 1 && d.dimScrim === 'opacity:0.5', JSON.stringify([d.dimV, d.dimScrim]))
  ck('罩子的 opacity 实读是 0.5', (await opacityOf(page, '.page-scrim')) === 0.5)
  ck('那一枚点是中档那支灰（实心，没有 mask 也没有投影）',
    d.dimDot === 'background:#A7ABB2', d.dimDot)
  // 下面②③量的是"三档之间照片真的分开"，走的是 弯月→满月→半月→弯月 那一圈，
  // 所以这里把本机键钉回弯月再进页——默认档已经由上面三条钉住了，
  // 这一句只是让亮度采样的顺序和原来那把尺子对得上（截图文件名里的档名不用改）。
  await mp.evaluate(() => wx.setStorageSync('bgDim', 2))
  page = await enter('/pages/create/create')
  await sleep(4500)
  d = await page.data()
  ck('钉到弯月之后罩子整层铺满（这一档才是改版前那一眼看到的样子）',
    d.dimV === 2 && d.dimScrim === '' && (await opacityOf(page, '.page-scrim')) === 1,
    JSON.stringify([d.dimV, d.dimScrim]))
  ck('那一枚点是最深那档的灰（实心，没有 mask 也没有投影）',
    d.dimDot === 'background:#5C6169', d.dimDot)
  const one = await rects(['.title-row', '.date-row', '.entry-wrap', '.dim-dot'])
  const [t0, t1] = [rpx(one[0].top), rpx(one[0].bottom)]
  const [py0, py1] = [rpx(one[1].bottom) + 30, rpx(one[2].top) - 40]
  const photo = (png) => lum(png, 36, 150, py0, py1)
  const titleC = (png) => lum(png, rpx(one[0].left) + 4, rpx(one[0].left) + 210, t0 + 4, t1 - 4, 'contrast')
  const shotWan = path.join(OUT, '圆点-1-弯月（现网那一档）.png')
  await mp.screenshot({ path: shotWan })
  const W0 = photo(shotWan)
  await sleep(500)

  // ---------- ② 点一下＝满月：罩子拧到 0，照片等于原图亮度 ----------
  const halves = await page.$$('.swap-half')
  // 这两句串从**这一屏自己那份字典**现读，不写死中文：这一档账号的语言是登录带回的，
  // 测试号存的是 en（同一件事 `验-列表头部铺图-真跑` 里已经记过一次），写死就是一句假红。
  // 判据要守的东西没变：还是"两半、左调亮度右换背景"，只是拿本机的串去比。
  const dT = (await page.data()).t || {}
  ck('这一行是两半：左「调亮度」、右「换背景」（串读的是这一屏的字典，语言跟着账号走）',
    halves.length === 2
    && (await (await halves[0].$('.swap-text')).text()) === dT.bgDimLabel
    && (await (await halves[1].$('.swap-text')).text()) === dT.homeBgSwap,
    `${halves.length} 半｜字典 ${dT.bgDimLabel} / ${dT.homeBgSwap}`)
  const half = halves[0]
  await half.tap()
  await sleep(1000)
  d = await page.data()
  ck('点一下到满月（dimScrim 就是 opacity:0）',
    d.dimV === 0 && d.dimScrim === 'opacity:0', JSON.stringify([d.dimV, d.dimScrim]))
  const opFull = await opacityOf(page, '.page-scrim')
  ck('罩子自己的 opacity 真的被拧到 0（不是又叠了一层黑）', opFull === 0, opFull)
  ck('那一层黑已经不在树上了（上一版那两枚 .page-dim/.head-dim 撤了）',
    (await page.$$('.page-dim')).length === 0)
  const shotFull = path.join(OUT, '圆点-2-满月（原图亮度）.png')
  await mp.screenshot({ path: shotFull })
  await sleep(500)
  const F0 = photo(shotFull)
  ck('满月那一档照片亮回去了（均值比弯月高出一档以上）', F0.mean > W0.mean * 1.25,
    `弯月 ${W0.mean} → 满月 ${F0.mean}`)
  // 站长 10-02 夜里否掉了那道淡投影，撤了。撤完这一档的白字就是直接压在原图上，
  // 这里只把实测对比打出来给他看代价，不钉成红——判据的前提已经不在代码里了。
  const TC = titleC(shotFull)
  const sh = String(await styleOf(page, '.title-row', 'text-shadow'))
  console.log(`!! 满月档标题实测：字 ${TC.glyph} / 圈 ${TC.ring} → ${TC.ratio}:1（无投影，只报数不判红）`)
  ck('字上没有投影（计算样式是 none）', sh === 'none' || !/rgba|px/.test(sh), sh.slice(0, 46))

  // ---------- ③ 点两下＝半月，点三下＝回弯月 ----------
  await half.tap()
  await sleep(1000)
  d = await page.data()
  ck('再点一下到半月（半档）', d.dimV === 1 && d.dimScrim === 'opacity:0.5',
    JSON.stringify([d.dimV, d.dimScrim]))
  ck('罩子实读 0.5，照片落在满月与弯月之间',
    (await opacityOf(page, '.page-scrim')) === 0.5)
  ck('存储跟着落账（退出这一页再进来还是它）',
    (await mp.evaluate(() => wx.getStorageSync('bgDim'))) === 1)
  const shotHalf = path.join(OUT, '圆点-3-半月.png')
  await mp.screenshot({ path: shotHalf })
  const H0 = photo(shotHalf)
  ck('半月确实夹在中间（比满月暗、比弯月亮）', H0.mean < F0.mean && H0.mean > W0.mean,
    `满月 ${F0.mean} / 半月 ${H0.mean} / 弯月 ${W0.mean}`)
  await half.tap()
  await sleep(1000)
  d = await page.data()
  ck('三下走满一轮回到弯月', d.dimV === 2 && (await opacityOf(page, '.page-scrim')) === 1, d.dimV)
  ck('点它不会把录入条带出来（catchtap 不吃整页的收起）',
    (await page.data()).active === '' || (await page.data()).active === undefined, (await page.data()).active)
  const dots = new Set()
  for (let i = 0; i < 3; i++) {
    dots.add((await page.data()).dimDot)
    await half.tap()
    await sleep(600)
  }
  ck('三档三枚灰度互不相同（白／中灰／深灰），且只有 background 这一段',
    dots.size === 3 && [...dots].every((s) => /^background:#[0-9A-F]{6}$/.test(s)), [...dots].join(' | '))

  // ---------- ④ 三页吃同一个键 ----------
  await mp.evaluate(() => wx.setStorageSync('bgDim', 0))
  page = await enter('/pages/index/index')
  await sleep(4500)
  d = await page.data()
  ck('笔记页进页读到的也是满月', d.dimV === 0 && d.dimScrim === 'opacity:0', JSON.stringify([d.dimV]))
  ck('笔记页头部那层罩子的 opacity 一起拧到 0', (await opacityOf(page, '.head-scrim')) === 0)
  const head = await rects(['.head', '.h1'])
  const shotI0 = path.join(OUT, '圆点-4-笔记页满月.png')
  await mp.screenshot({ path: shotI0 })
  await mp.evaluate(() => wx.setStorageSync('bgDim', 2))
  page = await enter('/pages/index/index')
  await sleep(4500)
  ck('笔记页切回弯月，罩子又铺满', (await opacityOf(page, '.head-scrim')) === 1)
  const shotI2 = path.join(OUT, '圆点-5-笔记页弯月.png')
  await mp.screenshot({ path: shotI2 })
  if (head[0] && head[1]) {
    const x0 = rpx(head[0].left) + 250, x1 = rpx(head[0].left) + 330
    const y0 = rpx(head[0].top) + 140, y1 = rpx(head[0].top) + 320
    const A0 = lum(shotI0, x0, x1, y0, y1), A2 = lum(shotI2, x0, x1, y0, y1)
    ck('笔记页的照片跟着一起亮回去', A0.mean > A2.mean * 1.2, `弯月 ${A2.mean} → 满月 ${A0.mean}`)
    const C0 = lum(shotI0, rpx(head[1].left), rpx(head[1].left) + 150,
      rpx(head[1].top) + 2, rpx(head[1].bottom) - 2, 'contrast')
    console.log(`!! 笔记页大标题（满月档、无投影）实测：字 ${C0.glyph} / 圈 ${C0.ring} → ${C0.ratio}:1（只报数不判红）`)
  } else ck('笔记页的照片跟着一起亮回去', false, '头部或标题量不到矩形')

  await mp.evaluate(() => wx.setStorageSync('bgDim', 0))
  page = await enter('/pages/me/me')
  await sleep(4500)
  ck('「我的」页同档、罩子一起拧到 0',
    (await page.data()).dimV === 0 && (await opacityOf(page, '.head-scrim')) === 0,
    JSON.stringify([(await page.data()).dimV]))
  await mp.screenshot({ path: path.join(OUT, '圆点-6-我的页满月.png') })

  page = await enter('/pages/create/create')
  await sleep(4500)
  ck('回到首页还是那一档（没有各页一份）', (await page.data()).dimV === 0, (await page.data()).dimV)
  // 这一档下再点「换背景」那半截，仍要走到卡片模板页：两半各管各的，别互相吃掉
  const hv = await page.$$('.swap-half')
  await hv[1].tap()
  await sleep(3000)
  const now = await mp.evaluate(() => getCurrentPages().slice(-1)[0].route)
  ck('右半截照旧导流去卡片模板页', now === 'pages/profile/profile', now)

  // ---------- ⑤ 英文那一版：两半挤不挤得下 ----------
  await mp.evaluate(() => {
    const app = getApp()
    if (app.globalData.userInfo) app.globalData.userInfo.language = 'en'
  })
  page = await enter('/pages/create/create')
  await sleep(4500)
  const i18n = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))
  const halvesEn = await page.$$('.swap-half')
  // 两半的矩形必须走 selectAll：`.select()` 只回第一个，写两遍拿到的是同一个元素的两份拷贝，
  // "不重叠"那条永远绿（自己钉自己）。
  const hrect = await mp.evaluate(() => new Promise((resolve) => {
    wx.createSelectorQuery().selectAll('.swap-half').boundingClientRect().exec((r) => resolve(r[0]))
  }))
  ck('英文两半的文案就是字典那两条',
    halvesEn.length === 2
    && (await (await halvesEn[0].$('.swap-text')).text()) === i18n.texts('en').bgDimLabel
    && (await (await halvesEn[1].$('.swap-text')).text()) === i18n.texts('en').homeBgSwap,
    hrect.map((x) => x && Math.round(x.width)).join(' / '))
  const row = (await rects(['.home-swap']))[0]
  ck('英文态两半不重叠、不撞行边',
    hrect[0] && hrect[1] && row
    && hrect[0].right <= hrect[1].left + 0.5
    && hrect[0].left >= row.left - 0.5 && hrect[1].right <= row.right + 0.5,
    hrect[0] && hrect[1] && row
      ? `左 ${Math.round(rpx(hrect[0].left))}..${Math.round(rpx(hrect[0].right))} `
        + `右 ${Math.round(rpx(hrect[1].left))}..${Math.round(rpx(hrect[1].right))} 行 ${Math.round(rpx(row.width))}`
      : '量不到')
  await mp.screenshot({ path: path.join(OUT, '圆点-7-英文两半.png') })
  await mp.evaluate(() => {
    const app = getApp()
    if (app.globalData.userInfo) app.globalData.userInfo.language = 'zh'
  })

  // ---------- 还原 ----------
  await mp.evaluate((v) => {
    if (v === '' || v === undefined || v === null) wx.removeStorageSync('bgDim')
    else wx.setStorageSync('bgDim', v)
  }, dimBefore)
  const after = await mp.evaluate(() => wx.getStorageSync('bgDim'))
  ck('本机键已还原成探针进来前的值', String(after) === String(dimBefore), `${after} vs ${dimBefore}`)

  console.log(`\n${bad.length ? '✗ ' + bad.length + ' 条不过：' + bad.join('、') : `背景亮度圆点 真跑：${n} 条全过`}`)
  mp.close()
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
