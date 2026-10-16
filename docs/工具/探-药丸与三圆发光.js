// 报数探针，不判红：把站长 10-17 点的那五样在屏上实际长什么样量出来。
// 为什么先量再改：他说「药丸没有上下等边，歪了」——这一条我从源码推是**对称的**
// （轨道 40 高压在 44 高的行里居中，上下各 2），所以要么是我的读法错了，要么是行里
// 那两枚字把它顶偏了。不量就改＝照着猜改。
// 前置：MP_ROOT=$PWD docs/工具/跑尺子.sh 9431 探-药丸与三圆发光
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '../..')
const PORT = process.env.APORT || '9431'
const OUT = path.join(ROOT, 'docs/design/10-17精致化/实测')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const unwrap = (r) => (r && typeof r === 'object' && 'result' in r ? r.result : r)
const I18N = require(path.join(ROOT, 'miniprogram/utils/i18n.js'))

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  let mp, lastErr = ''
  for (let i = 0; i < 12; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }); break } catch (e) {
      lastErr = String((e && e.message) || e); await sleep(10000)
    }
  }
  if (!mp) { console.log('!! 连不上自动化端口（环境红）：' + lastErr); process.exit(1) }

  const info = await mp.systemInfo()
  const R = info.windowWidth / 750
  const rx = (v) => (typeof v === 'number' ? Math.round(v / R * 10) / 10 : null)

  const retry = async (fn, times = 8) => {
    for (let i = 0; i < times; i += 1) { try { const v = await fn(); if (v) return v } catch (e) { /* 再试 */ } await sleep(1200) }
    return null
  }
  const geo = (sels) => mp.evaluate((list) => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    list.forEach((s) => { q.selectAll(s).boundingClientRect() })
    q.exec((r) => resolve(list.map((s, i) => (r[i] || []).map((x) => ({
      top: x.top, bottom: x.bottom, h: x.height, w: x.width, left: x.left, right: x.right,
    })))))
  }), sels)
  // 计算样式只能用 Element.style()：evaluate 跑在 appservice，那里没有 document/window，
  // 拿 getComputedStyle 的那条路一开始就写不通（写了也是死代码）。
  const st = async (page, sel, props) => {
    const el = await retry(() => page.$(sel))
    if (!el) return { sel, missing: true }
    const o = { sel }
    for (const p of props) {
      let v = null
      try { v = unwrap(await el.style(p)) } catch (e) { v = '读不到' }
      o[p] = v === undefined ? null : v
    }
    return o
  }

  /* ---------- 第一屏：三枚设置那一行的字档（他要"与首屏的三个设置字体一样大"） ---------- */
  let page
  for (let i = 0; i < 6; i += 1) {
    try {
      page = await mp.reLaunch('/pages/create/create')
      await sleep(2500)
      if (await page.$('.home-blk')) break
    } catch (e) { page = null }
    await sleep(2500)
  }
  if (!page) { console.log('✗ 进不去 /pages/create/create'); process.exit(1) }
  const zh = I18N.texts('zh')
  await page.setData({ lang: 'zh', t: zh })
  await sleep(800)
  console.log('—— 第一屏（收起）——')
  console.log('首屏三枚字档 ' + JSON.stringify(await st(page, '.swap-text', ['font-size', 'letter-spacing', 'line-height', 'font-weight'])))

  /* ---------- 第二屏：药丸那一行的几何 ---------- */
  await page.setData({ active: 'photo', sldIcon: 'images', previewImages: [] })
  await page.callMethod('_sync')
  await sleep(1200)
  const SELS = ['.out', '.wr-sw', '.wr-sw-track', '.wr-sw-dot', '.wr-sw-lab', '.wr-sw-hint', '.out-r',
    '.mini-c', '.shut', '.shut-core', '.crow', '.card', '.sld', '.sld-knob', '.sld-fill']
  const g = await geo(SELS)
  const one = (s) => { const a = g[SELS.indexOf(s)] || []; return a[0] || null }
  const all = (s) => g[SELS.indexOf(s)] || []
  const line = (s) => {
    const x = one(s)
    if (!x) return s + ' —'
    return `${s} 顶 ${rx(x.top)} 底 ${rx(x.bottom)} 高 ${rx(x.h)} 宽 ${rx(x.w)} 中线 ${rx((x.top + x.bottom) / 2)}`
  }
  console.log('—— 第二屏（照片·空三枚圈）——')
  for (const s of ['.out', '.wr-sw', '.wr-sw-track', '.wr-sw-dot', '.wr-sw-lab', '.wr-sw-hint', '.out-r']) console.log(line(s))
  for (const s of ['.crow', '.card', '.mini-c', '.shut', '.shut-core', '.sld', '.sld-knob', '.sld-fill']) console.log(line(s))
  console.log('mini-c 枚数 ' + all('.mini-c').length + '｜每枚中线 ' + JSON.stringify(all('.mini-c').map((x) => rx((x.top + x.bottom) / 2))))
  console.log('药丸行字档 ' + JSON.stringify([
    await st(page, '.out', ['font-size', 'line-height', 'letter-spacing']),
    await st(page, '.wr-sw-lab', ['font-size']),
    await st(page, '.wr-sw-hint', ['font-size']),
    await st(page, '.out-r', ['font-size']),
  ]))
  console.log('药丸皮 ' + JSON.stringify([
    await st(page, '.wr-sw-track', ['width', 'height', 'border-radius', 'background-color']),
    await st(page, '.wr-sw-dot', ['width', 'height', 'top', 'left']),
  ]))
  console.log('三枚圆与右滑圆的发光 ' + JSON.stringify([
    await st(page, '.mini-c', ['box-shadow', 'width', 'height', 'background-color']),
    await st(page, '.shut', ['box-shadow', 'border', 'background-color']),
    await st(page, '.shut-core', ['box-shadow', 'background-color']),
    await st(page, '.sld', ['box-shadow', 'overflow', 'height']),
    await st(page, '.sld-knob', ['box-shadow', 'width', 'height', 'background-color']),
  ]))
  await mp.screenshot({ path: path.join(OUT, '0-现状-第二屏照片态.png') })

  // 已选一张 → 右滑条出现（照片空态没有条，圆也就没画）
  await page.setData({ previewImages: ['http://usr/probe-0.png'] })
  await page.callMethod('_sync')
  await sleep(1200)
  const g2 = await geo(['.sld', '.sld-knob', '.sld-fill', '.card'])
  const o2 = (s) => (g2[['.sld', '.sld-knob', '.sld-fill', '.card'].indexOf(s)] || [])[0] || null
  console.log('—— 第二屏（照片·已选一张）——')
  for (const s of ['.sld', '.sld-knob', '.sld-fill']) {
    const x = o2(s)
    console.log(x ? `${s} 顶 ${rx(x.top)} 底 ${rx(x.bottom)} 高 ${rx(x.h)} 宽 ${rx(x.w)} 左 ${rx(x.left)} 右 ${rx(x.right)}` : s + ' —')
  }
  console.log('条与圆的上下余量：条内高-圆高 = ' + JSON.stringify(o2('.sld') && o2('.sld-knob')
    ? { 条高: rx(o2('.sld').h), 圆高: rx(o2('.sld-knob').h), 圆上距条顶: rx(o2('.sld-knob').top - o2('.sld').top), 圆下距条底: rx(o2('.sld').bottom - o2('.sld-knob').bottom), 圆左距条左: rx(o2('.sld-knob').left - o2('.sld').left) } : null))
  await mp.screenshot({ path: path.join(OUT, '0b-现状-第二屏右滑条.png') })

  /* ---------- 「我的」两个弹窗中间那句小字 ---------- */
  for (let i = 0; i < 6; i += 1) {
    try { await mp.switchTab('/pages/me/me') } catch (e) { try { await mp.reLaunch('/pages/me/me') } catch (e2) { /* 再试 */ } }
    await sleep(2500)
    const p = await mp.currentPage()
    if ((p.path || '').indexOf('pages/me/me') >= 0) break
  }
  page = await mp.currentPage()
  const tabv = unwrap(await retry(() => page.data('tab')))
  if (tabv !== 'set') { await page.callMethod('onTab', { currentTarget: { dataset: { key: 'set' } } }); await sleep(1500) }
  page = await mp.currentPage()
  console.log('—— 「我的」·菜单行那行备注（对照基准）——')
  console.log('menu-hint ' + JSON.stringify(await st(page, '.menu-hint', ['font-size', 'letter-spacing', 'line-height', 'font-family', 'color'])))
  const gh = await geo(['.menu-hint', '.menu-label'])
  console.log('menu-hint 首枚 ' + JSON.stringify((gh[0] || [])[0] && { h: rx((gh[0][0]).h), 顶: rx(gh[0][0].top) }))

  await page.callMethod('onTogglePwd'); await sleep(1500)
  page = await mp.currentPage()
  console.log('—— 密码那一层 ——')
  console.log('pwd-scene ' + JSON.stringify(await st(page, '.pwd-scene', ['font-size', 'letter-spacing', 'line-height', 'font-family', 'color'])))
  const gp = await geo(['.pwd-scene', '.pwd-name', '.pwd-card', '.pwd-boxes'])
  const gsel = (s) => (gp[['.pwd-scene', '.pwd-name', '.pwd-card', '.pwd-boxes'].indexOf(s)] || [])[0] || null
  console.log('pwd 几何 ' + JSON.stringify({
    scene: gsel('.pwd-scene') && { 高: rx(gsel('.pwd-scene').h), 顶: rx(gsel('.pwd-scene').top), 底: rx(gsel('.pwd-scene').bottom) },
    boxes顶: gsel('.pwd-boxes') && rx(gsel('.pwd-boxes').top),
    card: gsel('.pwd-card') && { 高: rx(gsel('.pwd-card').h), 宽: rx(gsel('.pwd-card').w) },
    文本宽: gsel('.pwd-scene') && rx(gsel('.pwd-scene').w),
  }))
  await mp.screenshot({ path: path.join(OUT, '1-现状-密码层.png') })
  try { await page.callMethod('onClosePwdPanel') } catch (e) { console.log('关密码层没走通：' + (e && e.message)) }
  await sleep(900)

  page = await mp.currentPage()
  await page.callMethod('onToggleEmail'); await sleep(1500)
  page = await mp.currentPage()
  console.log('—— 邮箱那一层 ——')
  console.log('me-email-scene ' + JSON.stringify(await st(page, '.me-email-scene', ['font-size', 'letter-spacing', 'line-height', 'font-family', 'color'])))
  const ge = await geo(['.me-email-scene', '.me-email-card', '.me-email-field'])
  const esel = (s) => (ge[['.me-email-scene', '.me-email-card', '.me-email-field'].indexOf(s)] || [])[0] || null
  console.log('email 几何 ' + JSON.stringify({
    scene: esel('.me-email-scene') && { 高: rx(esel('.me-email-scene').h), 宽: rx(esel('.me-email-scene').w) },
    card: esel('.me-email-card') && { 高: rx(esel('.me-email-card').h), 宽: rx(esel('.me-email-card').w) },
    field顶: esel('.me-email-field') && rx(esel('.me-email-field').top),
  }))
  await mp.screenshot({ path: path.join(OUT, '2-现状-邮箱层.png') })
  const back = await page.$('.me-email-btn.ghost')
  if (back) { await back.tap(); await sleep(900) }
  console.log('视口 ' + JSON.stringify({ w: info.windowWidth, h: rx(info.windowHeight) + 'rpx', dpr: info.pixelRatio }))
  console.log('截图目录 ' + OUT)
  await mp.close()
  process.exit(0)
})().catch((e) => { console.log('探针挂了 ' + (e && e.message)); process.exit(1) })
