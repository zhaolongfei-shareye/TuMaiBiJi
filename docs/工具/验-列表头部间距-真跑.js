/**
 * 一把尺子（真跑）：笔记列表面板顶那两行之间的间距（站长 10-18「『全部』和上方 icon 之间浪费了一行空间，要去掉」）。
 * 为什么必须真跑：这一刀动的是三个数（行高 88→64、分类行上内缩 20→0、管理态 26→6），
 * 而"浪费的那一行"是这三段空叠出来的**视觉结果**——只读样式表算得出的数，模拟器一渲染就可能不是那个数
 * （letter-spacing 取整、chip 自己的内缩、`.srch` 60 塞进行 64 那一档都是这类）。
 * 这里量的是屏上真实的两条边：图形底 → 分类那一枚的顶。
 * 跑法：docs/工具/跑尺子.sh 9431 验-列表头部间距-真跑
 */
const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const APORT = process.env.MP_PORT || 9431
const ROOT = path.resolve(__dirname, '../..')

const results = []
const ck = (name, ok, got) => { results.push({ name, ok, got }); console.log(`  ${ok ? '✓' : '✗'} ${name}${got ? '　→ ' + got : ''}`) }

;(async () => {
  let mp
  for (let i = 0; i < 12; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${APORT}` }); break }
    catch (e) { await sleep(4000) }
  }
  if (!mp) { console.log('!! 连不上自动化端口'); process.exit(2) }

  await mp.switchTab('/pages/index/index')
  const listPage = await mp.currentPage()
  await sleep(3000)

  const W = await mp.evaluate(() => wx.getSystemInfoSync().windowWidth)
  const toRpx = (px) => (px * 750) / W
  const q = (sel) => mp.evaluate((s) => new Promise((res) => {
    const qq = wx.createSelectorQuery().in(getCurrentPages().slice(-1)[0])
    qq.selectAll(s).boundingClientRect()
    qq.exec((r) => res((r && r[0]) || []))
  }), sel)

  const bar = await q('.ixl-bar')
  const ics = await q('.ixl-ic')
  // ⚠ 这里不敢用 `.ixl-ic > view`：那一条在本机 SelectorQuery 上量回来是**空数组**（子代组合符配标签名
  //   不支持），拿空数组去 Math.min 会打出 ±Infinity 而不是报错——比红更难查。只按类名一枚一枚查。
  //   平时那一态屏上只有 icon 里这一枚放大镜（搜索条没展开时 `.srch` 整支不渲染），所以查 `.glyph-search` 不歧义。
  const glyphs = (await q('.ixl-glyph-grid')).concat(await q('.glyph-search'))
  const cats = await q('.cats')
  const chips = await q('.ix-cat')

  if (!bar.length || ics.length < 2 || !cats.length || !chips.length || glyphs.length < 2) {
    console.log(`!! 元素没读齐：bar ${bar.length}／ic ${ics.length}／图形 ${glyphs.length}／cats ${cats.length}／chip ${chips.length}`)
    process.exit(3)
  }

  // 两枚图形不一样高（井格 32、放大镜 38，都竖向居中在 64 那一行里）⇒ 它们各自底边到分类那一枚的顶
  // 是两个数：井格那一侧 16、放大镜那一侧 13。取**大的那一侧**当判据，小的那一侧只是顺带。
  const tops = glyphs.map((g) => g.bottom)
  const gapHigh = toRpx(chips[0].top - Math.min(...tops))
  const gapLow = toRpx(chips[0].top - Math.max(...tops))
  console.log(`读数｜屏宽 ${W}px；两枚 icon 的面 ${ics.map((x) => `${Math.round(toRpx(x.width))}×${Math.round(toRpx(x.height))}rpx`).join('、')}`)
  console.log(`读数｜图形底→分类那一枚的顶：井格那侧 ${Math.round(gapHigh)}rpx／放大镜那侧 ${Math.round(gapLow)}rpx；再加 chip 自己那 10 的上内缩，字顶分别差 ${Math.round(gapHigh + 10)}／${Math.round(gapLow + 10)}rpx`)

  ck('面板顶那一行与两枚热区都是 64rpx（±3，改前 88）',
    Math.abs(toRpx(bar[0].height) - 64) <= 3 && ics.every((x) => Math.abs(toRpx(x.height) - 64) <= 3),
    `行 ${Math.round(toRpx(bar[0].height))}／热区 ${ics.map((x) => Math.round(toRpx(x.height))).join(' ')}`)

  ck('图形底到分类那一枚的顶只剩一道缝（高那侧 ≤20rpx；改前那一侧是 48）',
    gapHigh <= 20 && gapHigh >= 0 && gapLow <= gapHigh, `井格 ${Math.round(gapHigh)}／放大镜 ${Math.round(gapLow)}rpx`)

  ck('两枚各占一头、且都没越过卡片右沿',
    ics[0].left < ics[ics.length - 1].left && ics[ics.length - 1].right <= W + 0.5,
    `左 ${Math.round(ics[0].left)} 右 ${Math.round(ics[ics.length - 1].right)}／屏宽 ${W}`)

  // 搜索那一态：条子 60 塞进行 64，只许竖向居中，不许顶出去。
  // ⚠ `q()` 回来的是 boundingClientRect 的**纯数据**，上面没有 `.tap()`；要点就得拿
  //   automator 的元素句柄（`listPage.$$`），两条路别混着用（10-18 这把第一趟就是崩在这儿）。
  const icEls = await listPage.$$('.ixl-ic')
  await icEls[icEls.length - 1].tap()
  await sleep(1200)
  const srch = await q('.srch')
  const bar2 = await q('.ixl-bar')
  ck('点开搜索后那条 60 高的输入条子仍在 64 那一行里（不溢出、不把行顶高）',
    srch.length === 1 && toRpx(srch[0].height) <= 66 && srch[0].top >= bar2[0].top - 1 && srch[0].bottom <= bar2[0].bottom + 1,
    srch.length ? `条子 ${Math.round(toRpx(srch[0].height))}rpx，行 ${Math.round(toRpx(bar2[0].height))}rpx` : '读不到条子')
  await mp.evaluate(() => new Promise((res) => {
    const p = getCurrentPages().slice(-1)[0]
    p.setData({ searchOpen: false, searchFocus: false })
    res()
  }))
  await sleep(800)

  // 管理态：那一档的上内缩从 26 降到 6，钉的是"进那一态整行不许往下跳一截"。
  const catsTop0 = (await q('.cats'))[0].top
  const gridEl = (await listPage.$$('.ixl-ic'))[0]
  await gridEl.tap()
  await sleep(1500)
  const catsTop1 = (await q('.cats'))[0].top
  const chips1 = await q('.ix-cat')
  ck('进管理态那一行只往下让 6rpx（±6；照抄改前那 26 就会跳 20）',
    Math.abs(toRpx(catsTop1 - catsTop0) - 6) <= 6, `${Math.round(toRpx(catsTop1 - catsTop0))}rpx`)
  // 上内缩从 26 降到 6 之后唯一的新风险：× 是绝对挂在 chip 自己的顶（top:0、44 高），
  // 而 `.cat-scroll` 是 overflow——那一层盒子顶若比 × 的顶低，× 的上半截就被切掉。
  // ⚠ 数量这里不敢判"每枚都有"：私密那一枚按他 10-17 那一句不画 ×（禁删），所以只判"有且不被切"。
  const xs = await q('.ix-cat-x')
  const scroll = await q('.cat-scroll')
  ck('管理态里那几枚 × 都画得出来，且没被 `.cat-scroll` 那层切掉上半截',
    xs.length > 0 && scroll.length === 1 && xs.every((x) => x.top >= scroll[0].top - 0.5),
    `× ${xs.length} 枚（chip ${chips1.length} 枚，私密那枚本就不画）／最矮那一枚顶差 ${(scroll.length ? Math.min(...xs.map((x) => x.top)) - scroll[0].top : NaN).toFixed(1)}px`)
  await mp.evaluate(() => new Promise((res) => {
    const p = getCurrentPages().slice(-1)[0]
    p.setData({ catEdit: false })
    res()
  }))
  await sleep(800)

  // 号：屏上那一行与源头那个常量必须相等（两处不许各说各话）。
  const src = fs.readFileSync(path.join(ROOT, 'miniprogram/utils/appInfo.js'), 'utf8')
  const ver = (src.match(/const VERSION = '([\d.]+)'/) || [])[1]
  await mp.evaluate(() => new Promise((res) => { wx.navigateTo({ url: '/pages/about/about', success: res, fail: res }) }))
  await sleep(2500)
  const about = await mp.evaluate((v) => {
    const p = getCurrentPages().slice(-1)[0]
    const d = p.data || {}
    return { brand: String(d.version || ''), hits: JSON.stringify(d).split(v).length - 1 }
  }, ver)
  const shown = about.brand
  const p2 = path.join(ROOT, 'docs/design/10-18-列表头部间距/实测', `30-列表头部-${ver}.png`)
  await mp.evaluate(() => new Promise((res) => { wx.navigateBack({ delta: 1, success: res, fail: res }) }))
  await sleep(1200)
  await mp.screenshot({ path: p2 })
  ck('关于页那枚号与源头常量同一个数，且这一屏两处都跟着（brand ＋ 那一行「版本」）',
    !!ver && shown === ver && about.hits >= 2, `源头 ${ver}／屏上 ${shown || '没读到'}／整屏命中 ${about.hits} 处`)
  console.log('截图｜列表那一屏', p2)

  const bad = results.filter((r) => !r.ok)
  console.log(`\n${results.length - bad.length} 过 / ${bad.length} 红 / ${results.length} 条`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.log('!! 尺子崩：', e && e.message); process.exit(1) })
