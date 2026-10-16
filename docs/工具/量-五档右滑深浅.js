/* 五档心情下"右滑那一条到底有多深"的现量探针（不判红绿，只给数；改 α 之前先跑这一把）。
   跑法：docs/工具/跑尺子.sh 9431 量-五档右滑深浅
        （或直接 NODE_PATH=$HOME/.mpauto/node_modules node docs/工具/量-五档右滑深浅.js，要先 cli auto）

   站长 10-16 18:3x 那句「墨版的右滑太深了，要对照其他色系深浅程度，按比例降低」里有两个量：
   ① 条身自己多深（他要对照的就是这个：墨 132 对彩色四档 160~168）；② 它相对紧挨着的面板低多少。
   两个都在屏上量。只推②会得出"把 α 降到看不见"那种结论，只纸上推①连数都拿不到。

   10-16 19:0x 改过取样法，原因记在这儿别再踩：**第一版把"条身"取在字所在的那一行**，
   中位数被字污染——墨档那条字是纸白，量到 132，而按 rgba(35,37,44,.62) 混在 197 的底上应该是 98；
   彩色四档字是深字，同一行又把它往下拽（象牙算式 177、量到 160）。两头反着偏，
   拿这组数去解 α 会得到"要降到 .24"这种荒唐读数。⇒ 现在取**字上下两侧那两行**（条高 110rpx，
   字压在 39~71rpx，取 22% 与 78% 两行各量一次再取均值），并且把"字那一行"一起留着当自证：
   墨档那一行该明显亮于条身、彩色四档该明显暗于条身，两个符号都对才算取干净了。
   窗口左右各退条宽 8%：躲开两端圆角，也躲开左边那枚 90rpx 圆钮（它在 0~45 CSS px）。

   取景用"节点矩形 ＋ 换算出来的截图缩放与偏移"，与 `验-统一录入条-真跑` 的 C8d（在图里自定位）
   是两种量法：那把要钉死一个判据，所以选不依赖任何布局常数的自定位；这一把要一次覆盖五档，
   改回坐标换算，并**自己核一遍换算对不对**（差＝条身比条外同一行暗多少，反号就是换算错了）。 */
const automator = require('miniprogram-automator')
const { PNG } = require('pngjs')
const fs = require('fs')
const path = require('path')
const PAL = require(path.resolve(__dirname, '../../miniprogram/utils/palette.js'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SHOT = '/tmp/mood-depth.png'
const MOODS = PAL.MOODS.map((m) => ({ key: m.key, theme: m.theme, glass: m.glass }))

;(async () => {
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上 9431，先 cli auto')
  const back = await mp.evaluate(() => ({
    mood: wx.getStorageSync('glassMood') || 'ink',
    wall: wx.getStorageSync('localWallpaper') || 'tint-paper',
  }))

  const enter = async (url) => {
    for (let i = 0; i < 5; i++) {
      try { return await mp.reLaunch(url) } catch (e) { await sleep(8000) }
    }
    throw new Error(`进不去 ${url}`)
  }
  // 落到指定那一档：心情键、它钉的那套壁纸、主题重算——三步一个不能少（少第三步容器类不翻）
  const setMood = (key, theme) => mp.evaluate((k, t) => {
    wx.setStorageSync('glassMood', k)
    getApp().setWallpaper(t)
    getApp().applyTheme(t)
  }, key, theme)

  const rows = []
  for (const m of MOODS) {
    await setMood(m.key, m.theme)
    await enter('/pages/create/create')
    await sleep(3500)
    let page = await mp.currentPage()
    const p = await page.$('.blk-person')
    if (!p) throw new Error(`${m.key} 这一档没摸到进第二屏那枚角标`)
    await p.tap()
    await sleep(1200)
    page = await mp.currentPage()
    await (await page.$$('.md'))[1].tap()          // 链接那一档：屏上就是"待滑"那一帧
    await sleep(900)
    const rect = await mp.evaluate(() => new Promise((res) => {
      wx.createSelectorQuery().select('.sld').boundingClientRect((r) => res(r)).exec()
    }))
    const win = await mp.evaluate(() => {
      const w = wx.getWindowInfo()
      return { ww: w.windowWidth, sbh: w.statusBarHeight }
    })
    await mp.screenshot({ path: SHOT })
    const img = PNG.sync.read(fs.readFileSync(SHOT))
    const S = img.width / win.ww                    // 截图是整块设备屏：CSS px → 图里像素
    const yOf = (cssY) => Math.round((cssY + win.sbh + 44) * S)   // ＋状态栏 ＋默认导航条
    const xOf = (cssX) => Math.round(cssX * S)
    const L = (x, y) => {
      const i = (img.width * y + x) * 4
      return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
    }
    const med = (x0, x1, y) => {
      const s = []
      for (let x = x0; x <= x1; x += 2) s.push(L(x, y))
      s.sort((q, r) => q - r)
      return s[Math.floor(s.length / 2)]
    }
    // 条内：左右各退 8% 条宽；上下取字外那两行（22%／78%），字那一行另存着当自证
    const inset = Math.round(rect.width * 0.08)
    const x0 = xOf(rect.left + inset)
    const x1 = xOf(rect.right - inset)
    const yUp = yOf(rect.top + rect.height * 0.22)
    const yDn = yOf(rect.top + rect.height * 0.78)
    const yMid = yOf(rect.top + rect.height / 2)
    const up = med(x0, x1, yUp)
    const dn = med(x0, x1, yDn)
    const body = (up + dn) / 2
    const txtRow = med(x0, x1, yMid)
    // 条外同一行：左边那一窄条（面板／卡那面），发光够不到
    const outX1 = xOf(rect.left - 6)
    const outX0 = xOf(rect.left - 20)
    const panel = (med(outX0, outX1, yUp) + med(outX0, outX1, yDn)) / 2
    // 条底下那一层按 rgba(玻璃, 条面那枚 α) 反推：>255 就是取样或换算还有问题
    const a = Number(/,\s*([\d.]+)\s*\)$/.exec(PAL.moodVars(m.key)['--glass-chrome-slide'])[1])
    const luma = PAL.lumOf(m.glass)
    const base = (body - a * luma) / (1 - a)
    rows.push({
      档: m.key, 令牌: PAL.moodVars(m.key)['--glass-chrome-slide'], α: a,
      条身: Math.round(body), 上行: Math.round(up), 下行: Math.round(dn),
      字那一行: Math.round(txtRow), 字的号: Math.round(txtRow - body),
      条外: Math.round(panel), 条比条外低: Math.round(panel - body),
      反推底: Math.round(base), 本色: Math.round(luma),
    })
  }
  await mp.evaluate((b) => {
    wx.setStorageSync('glassMood', b.mood)
    getApp().setWallpaper(b.wall)
    getApp().applyTheme(b.wall)
  }, back)
  await mp.close()
  console.table(rows)

  // 「按比例」这一句要的那个数：彩色四档的条身取均值当目标，墨档解 α
  const col = rows.filter((r) => r.档 !== 'ink')
  const target = col.reduce((s, r) => s + r.条身, 0) / col.length
  const ink = rows.filter((r) => r.档 === 'ink')[0]
  const spread = Math.max(...col.map((r) => r.条身)) - Math.min(...col.map((r) => r.条身))
  const aSolve = (ink.反推底 - target) / (ink.反推底 - ink.本色)
  console.log(`彩色四档条身均值 ${target.toFixed(1)}（档间差 ${spread}）；墨档现在 ${ink.条身}`)
  console.log(`按 rgba(35,37,44,α) 混在反推底 ${ink.反推底} 上解：α = ${aSolve.toFixed(3)} ⇒ 写 .${Math.round(aSolve * 100)}`)
  // 取样自证：字那一行的偏移符号必须与色板判出来的极性同号（浅字→正、深字→负），反了就是没躲开字或换算错
  const want = PAL.MOODS.map((m) => {
    const v = PAL.moodVars(m.key)
    const a = Number(/,\s*([\d.]+)\s*\)$/.exec(v['--glass-chrome-slide'])[1])
    const faceLum = PAL.lumOf(PAL.mix(m.glass, '#FFFFFF', a))
    const r = rows.filter((x) => x.档 === m.key)[0]
    return { 档: m.key, 该: Math.sign(PAL.lumOf(v['--slide-ink']) - faceLum), 量到: Math.sign(r.字的号), 字: v['--slide-ink'] }
  })
  console.log('极性自证：' + want.map((x) => `${x.档} 该${x.该 > 0 ? '正' : '负'}/量到${x.量到 > 0 ? '正' : '负'}(${x.字})`).join(' / '))
  const bad = want.filter((x) => x.该 !== x.量到 || x.量到 === 0)
  if (bad.length) console.log('⚠ 取样或极性对不上：' + bad.map((x) => x.档).join(' / '))
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
