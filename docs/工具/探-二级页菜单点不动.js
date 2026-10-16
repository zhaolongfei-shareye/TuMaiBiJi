// 一次性探针：站在「我的·设置」那一屏，把每一行菜单的字、位置、点下去之后页面栈变成什么，全打一遍。
// 跑法：docs/工具/跑尺子.sh 9431 探-二级页菜单点不动
// 为什么要有这一把：`验-二级页左上角同档-真跑` 那一趟里，点「Card templates」那一行之后
// `currentPage()` 还是 pages/me/me，同一段代码点「My Email」那一行却开了层——差别只有"这一下要不要跨页"。
// 先量清楚是热区没命中、还是 `wx.navigateTo` 自己没成（它没有 fail 回调，成了没成只能读页面栈）。
const automator = require('miniprogram-automator')
const PORT = process.env.APORT || '9431'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const unwrap = (r) => (r && typeof r === 'object' && 'result' in r ? r.result : r)

;(async () => {
  let mp, lastErr = ''
  for (let i = 0; i < 12; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }); break } catch (e) {
      lastErr = String((e && e.message) || e); await sleep(10000)
    }
  }
  if (!mp) { console.log('!! 连不上（环境红）：' + lastErr); process.exit(1) }
  for (let i = 0; i < 40; i += 1) {
    try {
      const n = await mp.evaluate(() => { const a = getApp(); return a && a.globalData && a.globalData.token ? a.globalData.token.length : 0 })
      if (unwrap(n) > 100) break
    } catch (e) { /* 还没起来 */ }
    await sleep(3000)
  }
  for (let i = 0; i < 6; i += 1) {
    try { await mp.switchTab('/pages/me/me') } catch (e) { /* 再试 */ }
    await sleep(2500)
    const p = await mp.currentPage()
    if ((p.path || '').indexOf('pages/me/me') >= 0) break
  }
  const page = await mp.currentPage()
  const sys = await mp.systemInfo()
  const R = sys.windowWidth / 750
  const stack = async () => unwrap(await mp.evaluate(() => getCurrentPages().map((x) => x.route || x.__route__ || String(x))))
  console.log(`进来时页面栈＝${JSON.stringify(await stack())}`)
  const labels = await page.$$('.menu-label')
  console.log(`这一屏 .menu-label 一共 ${labels ? labels.length : 0} 枚`)
  for (const el of labels || []) {
    const t = String(await el.text())
    const o = await el.offset(); const s = await el.size()
    console.log(`  「${t}」 left ${(parseFloat(o.left) / R).toFixed(0)} top ${(parseFloat(o.top) / R).toFixed(0)} 宽 ${(parseFloat(s.width) / R).toFixed(0)}×高 ${(parseFloat(s.height) / R).toFixed(0)}rpx`)
  }
  const items = await page.$$('.menu-item')
  console.log(`.menu-item 一共 ${items ? items.length : 0} 枚（与上面那排数量对不对得上，对不上说明有一行没挂 label）`)
  // 逐行点：点 label 与点整行各试一次，看哪一种真的跨得过去
  for (const [tag, want] of [['label', 'Card templates'], ['item', 'Card templates']]) {
    const before = await stack()
    const arr = tag === 'label' ? labels : items
    let hit = null
    for (const e of arr || []) {
      const txt = String(await e.text())
      if (txt.indexOf(want) >= 0) { hit = e; break }
    }
    if (!hit) { console.log(`点 ${tag}：没找到含「${want}」的那一枚`); continue }
    await hit.tap(); await sleep(4000)
    const after = await stack()
    console.log(`点 ${tag} 之后页面栈＝${JSON.stringify(after)}（点之前 ${JSON.stringify(before)}）`)
    const cur = await mp.currentPage()
    console.log(`  currentPage()＝${cur.path}｜data.tab=${JSON.stringify(unwrap(await cur.data('tab')))}`)
    if ((cur.path || '').indexOf('pages/me/me') < 0) { await mp.navigateBack().catch(() => {}); await sleep(2000) }
  }
  process.exit(0)
})().catch((e) => { console.log('!! 探针挂了 ' + ((e && e.stack) || e)); process.exit(1) })
