// 笔记列表"头部铺图（C 方案）"的真跑自证：在模拟器里真读计算样式、真量几何、真截图。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-列表头部铺图-真跑.js
// 前置：微信开发者工具已开；改过 WXSS 要先 cli close 再 cli auto --auto-port 9431。
// 一把量两个状态：开关开着（头部是照片 + 纸白搜索条 + 暗玻璃 chip + 一张纸）
// 和开关关掉（这一屏必须逐条退回 D2 那一版）。只量前一个状态等于没量——
// "关掉开关还剩一半铺图痕迹"是这类改动最容易漏的那件事。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/笔记列表-背景图/实测')
const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const p = require(P('utils/palette.js'))

const bad = []
const ck = (name, cond, got) => {
  console.log(`${cond ? '✓' : '✗'} ${name}${got === undefined ? '' : `　→ ${got}`}`)
  if (!cond) bad.push(name)
}
const rgbOf = (s) => (String(s).match(/-?\d+(\.\d+)?/g) || []).slice(0, 3).map(Number)
const hexArr = (h) => {
  const m = /#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(h)
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : []
}
const near = (a, b, tol) => a.length === 3 && b.length === 3
  && a.every((v, i) => Math.abs(v - b[i]) <= (tol === undefined ? 2 : tol))
// 颜色比的是三元数组（near），几何比的是单个数——两者不能混用一个函数：
// 第一版拿 near 去比 [top, h]，两个元素过不了 near 里的 length===3，量对了也判红。
const closeTo = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 2 : tol)
// 纸白从 palette 现读：WXSS 里那支 #f2efe9 必须和它是同一个值，两边各写一份迟早会走样
const PAPER = /const PAPER = '(#[0-9A-Fa-f]{6})'/.exec(fs.readFileSync(P('utils/palette.js'), 'utf8'))[1]
const INK = hexArr(/--chrome-ink: (#23252c)/i.exec(
  fs.readFileSync(P('pages/index/index.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))[1])

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
  const win = await mp.evaluate(() => {
    const i = wx.getSystemInfoSync()
    return { w: i.windowWidth, h: i.windowHeight }
  })
  const R = win.w / 750
  // 几何一律走 mp.evaluate + createSelectorQuery：Page 对象上没有 evaluate 这条路，
  // 统一录入条那把真跑尺子就是这么量的。
  const rects = (sels) => mp.evaluate((list) => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    list.forEach((s) => { q.select(s).boundingClientRect() })
    q.exec((r) => resolve(r.slice(0, list.length).map((x) => (x
      ? { top: x.top, bottom: x.bottom, h: x.height, w: x.width, left: x.left } : null))))
  }), sels)
  const styleOf = async (page, sel, prop) => {
    const el = await page.$(sel)
    if (!el) return null
    const v = await el.style(prop)
    // 读不到值要单独算红：null === null 那种假绿不能再犯
    if (v === null || v === undefined) throw new Error(`${sel} 的 ${prop} 读不到`)
    return v
  }

  // 壁纸键要原样读回来。上一版套了一层 JSON.stringify，拿到的是 '"tint-celadon"'（带引号），
  // themeOf/chromeOf 认不出这个键就静默回落到米白那一档，于是"和底栏同一个函数"这条
  // 判据其实是在拿另一支色比另一支色——两边都不红才怪。
  const wall = await mp.evaluate(() => wx.getStorageSync('localWallpaper') || 'default')
  const bgOffBefore = await mp.evaluate(() => !!wx.getStorageSync('home_bg_off'))
  const chrome = p.chromeOf(wall)

  // ---------- ① 开关开着：头部是照片，纸在下面盖住它 ----------
  await mp.evaluate(() => wx.removeStorageSync('home_bg_off'))
  let page = await enter('/pages/index/index')
  await sleep(4500)
  page = await enter('/pages/index/index')
  await sleep(4500)
  const cls = (await (await page.$('.container')).attribute('class')) || ''
  ck('铺图时容器带 has-bg', /has-bg/.test(cls), cls)
  const [bgRect, scrimRect, sheetRect] = await rects(['.page-bg', '.page-scrim', '.sheet'])
  ck('图带从视口顶起、高 700rpx', bgRect && closeTo(bgRect.top, 0) && closeTo(bgRect.h, 700 * R),
    bgRect && `顶 ${Math.round(bgRect.top)} 高 ${(bgRect.h / R).toFixed(0)}rpx`)
  ck('罩层和图带同一块地', scrimRect && closeTo(scrimRect.top, bgRect.top) && closeTo(scrimRect.h, bgRect.h))
  ck('纸是满宽的（左右负出容器的 24 内缩）',
    sheetRect && Math.abs(sheetRect.left) < 1 && Math.abs(sheetRect.w - win.w) < 2,
    sheetRect && `左 ${Math.round(sheetRect.left)} 宽 ${(sheetRect.w / R).toFixed(0)}rpx`)
  ck('纸顶落在图带之内，图不会在纸下面漏出来',
    sheetRect && sheetRect.top > 0 && sheetRect.top < 700 * R,
    `纸顶 ${(sheetRect.top / R).toFixed(0)}rpx / 带底 700rpx`)
  const num = (s) => Number(String(s).match(/[\d.]+/)?.[0] || NaN)
  const rTL = num(await styleOf(page, '.sheet', 'border-top-left-radius'))
  const rBL = num(await styleOf(page, '.sheet', 'border-bottom-left-radius'))
  ck('纸上沿两个角是 40rpx 圆角、下面直角',
    Math.abs(rTL - 40 * R) < 1.5 && rBL === 0, `上 ${rTL}px（应≈${(40 * R).toFixed(1)}）下 ${rBL}px`)
  ck('纸底吃的是壁纸底色（和容器无缝）',
    near(rgbOf(await styleOf(page, '.sheet', 'background-color')),
      hexArr(p.themeOf(wall).page)),
    await styleOf(page, '.sheet', 'background-color'))
  const rowRect = (await rects(['.note-row']))[0]
  if (rowRect) ck('第一张行卡在纸内（不是浮在图上）', rowRect.top >= sheetRect.top,
    `卡顶 ${(rowRect.top / R).toFixed(0)}rpx / 纸顶 ${(sheetRect.top / R).toFixed(0)}rpx`)
  ck('搜索条翻成纸白那一面',
    near(rgbOf(await styleOf(page, '.sc-card', 'background-color')), hexArr(PAPER)),
    await styleOf(page, '.sc-card', 'background-color'))
  ck('「搜索笔记」那几个字在纸白面上是墨色',
    near(rgbOf(await styleOf(page, '.sc-go', 'color')), INK),
    await styleOf(page, '.sc-go', 'color'))
  ck('占位符那一档也跟着翻（读的是同一个 --chrome-idle）',
    near(rgbOf(await styleOf(page, '.sc-input', 'color')), INK),
    await styleOf(page, '.sc-input', 'color'))
  ck('页头那行大字是纸白',
    near(rgbOf(await styleOf(page, '.page-title', 'color')), hexArr(PAPER), 6),
    await styleOf(page, '.page-title', 'color'))
  const chips = await page.$$('.chip')
  ck('这一趟至少有两枚 chip（"全部" + 一枚分类），暗玻璃那条才量得到', chips.length > 1, `${chips.length} 枚`)
  // 未选中那一枚：默认停在"全部"上，所以"全部"是 active，往后找第一枚不带 active 的
  let idleBg = null
  let chipH = 0
  for (const el of chips) {
    if (!/active/.test((await el.attribute('class')) || '')) {
      idleBg = await el.style('background-color')
      chipH = ((await rects(['.chip']))[0] || {}).h || 0
      break
    }
  }
  ck('未选中的分类 chip 在图上垫了一层暗玻璃', /rgba\(18, 20, 26/.test(idleBg || ''), idleBg)
  ck('选中那枚换成纸白',
    near(rgbOf(await styleOf(page, '.chip.active', 'background-color')), hexArr(PAPER)),
    await styleOf(page, '.chip.active', 'background-color'))
  await mp.screenshot({ path: path.join(OUT, '实测-列表头部铺图.png') })

  // ---------- ② 开关关掉：逐条退回 D2 那一版 ----------
  await mp.evaluate(() => wx.setStorageSync('home_bg_off', true))
  page = await enter('/pages/index/index')
  await sleep(4500)
  page = await enter('/pages/index/index')
  await sleep(4500)
  ck('关掉后图带整个不在了', (await page.$('.page-bg')) === null)
  ck('关掉后罩层也不在', (await page.$('.page-scrim')) === null)
  ck('关掉后容器不再带 has-bg', !/has-bg/.test(((await page.$('.container')).attribute('class')) || ''))
  ck('关掉后搜索条回到壁纸派生那一支色（和底栏同一个函数）',
    near(rgbOf(await styleOf(page, '.sc-card', 'background-color')), hexArr(chrome.bg)),
    `${await styleOf(page, '.sc-card', 'background-color')}｜chromeOf=${chrome.bg}`)
  ck('关掉后那张纸是透明的（不留一块色板在列表底下）',
    /rgba\(0, 0, 0, 0\)|transparent/.test(await styleOf(page, '.sheet', 'background-color')),
    await styleOf(page, '.sheet', 'background-color'))
  ck('关掉后纸没有圆角', num(await styleOf(page, '.sheet', 'border-top-left-radius')) === 0,
    await styleOf(page, '.sheet', 'border-top-left-radius'))
  ck('关掉后 chip 回到壁纸那一档（不再是暗玻璃）',
    !/rgba\(18, 20, 26/.test(await styleOf(page, '.chip', 'background-color')),
    await styleOf(page, '.chip', 'background-color'))
  // 那圈描边写成 inset 而不是 border：border 会把整排 chips 撑高，一撑高纸顶就往下挪
  ck('两态下 chip 同一档高度（inset 描边没把它撑高）',
    Math.abs(((await rects(['.chip']))[0] || {}).h - chipH) < 1.5,
    `铺图 ${(chipH / R).toFixed(1)}rpx / 不铺 ${(((await rects(['.chip']))[0] || {}).h / R).toFixed(1)}rpx`)
  await mp.screenshot({ path: path.join(OUT, '实测-列表不铺图.png') })

  // ---------- 还原：借走的是他的真机偏好 ----------
  await mp.evaluate((wasOff) => {
    if (wasOff) wx.setStorageSync('home_bg_off', true)
    else wx.removeStorageSync('home_bg_off')
  }, bgOffBefore)
  const after = await mp.evaluate(() => !!wx.getStorageSync('home_bg_off'))
  ck('背景开关已还原', after === bgOffBefore, `${after} vs ${bgOffBefore}`)

  console.log(`\n${bad.length ? '✗ ' + bad.length + ' 条不过：' + bad.join('、') : '列表头部铺图 真跑：全过'}`)
  mp.close()
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
