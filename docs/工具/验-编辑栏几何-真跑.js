/**
 * 一把尺子（真跑）：「编辑笔记」那一屏六栏的几何。
 * 它要钉的是两类**只有真机看得见、模拟器量平**的错，两类都在 10-18 被站长当场打回过：
 *  ① `<textarea>` 的 CSS 不给 `width` 就退回原生**固定 300px**（不随屏宽缩）⇒ 屏一窄就溢出、压在卡片右沿被裁。
 *     模拟器 390 宽上 300px＋内边距与内容区只差 1.3pt，肉眼与 boundingClientRect 都看不出来，
 *     所以这里判的是**六栏左右沿必须同一对**（左右不一致＝有一栏比内容区宽）。
 *  ② 反过来，给 `<input>` 挂 `box-sizing: border-box` 会让左右内边距把那个原生高度吃干净，
 *     字被横切一半（10-18 我改 ① 的时候就一并踩了这个，量到那两格从 46 掉到 24 高）。
 *     所以这里给单行那三栏一条**最低高度**，单位用 rpx（与屏宽无关，换机型不漂）。
 * 跑法：docs/工具/跑尺子.sh 9431 验-编辑栏几何-真跑
 */
const automator = require('miniprogram-automator')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const APORT = process.env.MP_PORT || 9431

const results = []
const ck = (name, ok, got) => { results.push({ name, ok, got }); console.log(`  ${ok ? '✓' : '✗'} ${name}${got ? '　→ ' + got : ''}`) }

;(async () => {
  let mp
  for (let i = 0; i < 12; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${APORT}` }); break }
    catch (e) { await sleep(4000) }
  }
  if (!mp) { console.log('!! 连不上自动化端口'); process.exit(2) }

  const listPage = await mp.switchTab('/pages/index/index')
  await sleep(3000)
  const ld = await listPage.data()
  const list = ld.notes || ld.list || ld.notesList || []
  if (!list.length) { console.log('!! 列表空的，量不了'); process.exit(3) }
  const withBody = list.find((n) => n.cover_file_id) || list[0]

  await mp.evaluate((u) => new Promise((res) => { wx.navigateTo({ url: u, success: res, fail: res }) }),
    `/pages/write/write?id=${withBody.id}&mode=edit`)
  await sleep(4500)

  const W = await mp.evaluate(() => wx.getSystemInfoSync().windowWidth)
  const toRpx = (px) => (px * 750) / W
  const q = (sel) => mp.evaluate((s) => new Promise((res) => {
    const qq = wx.createSelectorQuery().in(getCurrentPages().slice(-1)[0])
    qq.selectAll(s).boundingClientRect()
    qq.exec((r) => res((r && r[0]) || []))
  }), sel)

  const inputs = await q('.input')
  const areas = await q('.textarea')
  const orig = await q('.textarea-orig')
  const pickers = await q('.picker-value')
  const all = [].concat(inputs, areas, pickers)
  console.log(`读数｜屏宽 ${W}px，量到 .input ${inputs.length} 格／.textarea ${areas.length} 格（其中原文 ${orig.length}）／.picker-value ${pickers.length} 格`)

  ck('六栏都在屏上（三格单行＋三格 textarea，原文那一格算第三格）',
    inputs.length === 2 && areas.length === 3 && pickers.length === 1,
    `input ${inputs.length}／textarea ${areas.length}／picker ${pickers.length}`)

  const edges = new Set(all.map((x) => `${Math.round(x.left)}..${Math.round(x.right)}`))
  ck('每一栏左右沿同一对（有一栏比内容区宽就是它退回了固定 300px）',
    edges.size === 1, [...edges].join(' '))

  const over = all.filter((x) => x.right > W + 0.5)
  ck('没有一栏越过屏右沿', over.length === 0, over.map((x) => Math.round(x.right)).join(' '))

  const thin = all.filter((x) => toRpx(x.height) < 78)
  ck('没有一栏被内边距压成半截（最低 78rpx）', thin.length === 0,
    thin.map((x) => `${Math.round(toRpx(x.height))}rpx`).join(' ') || `最矮 ${Math.round(Math.min(...all.map((x) => toRpx(x.height))))}rpx`)

  const short = areas.filter((x) => x !== orig[0]).filter((x) => toRpx(x.height) < 196)
  ck('摘要／要点那两格守住最短 198rpx（border-box 换档时这个数要跟着抬）', short.length === 0,
    short.map((x) => `${Math.round(toRpx(x.height))}rpx`).join(' '))

  ck('原文那一格是定高滚动（300rpx ±4），不跟字数长',
    orig.length === 1 && Math.abs(toRpx(orig[0].height) - 300) <= 4,
    orig.length ? `${Math.round(toRpx(orig[0].height))}rpx` : '读不到那一格')

  const ed = await (await mp.currentPage()).data()
  ck('原文这一栏真的铺进了表单（不是只画了个空框）',
    typeof ed.originalText === 'string' && ed.originalText.length > 0,
    `${(ed.originalText || '').length} 字`)
  ck('基线里带着原文那一栏（没动它就不许发这一栏，防覆盖）',
    await mp.evaluate(() => {
      const p = getCurrentPages().slice(-1)[0]
      return !!(p && p._baseline && typeof p._baseline.original === 'string')
    }), '读 `_baseline.original`')

  await mp.evaluate(() => new Promise((res) => { wx.navigateBack({ delta: 1, success: res, fail: res }) }))
  await sleep(1500)

  const bad = results.filter((r) => !r.ok)
  console.log(`\n${results.length - bad.length} 过 / ${bad.length} 红 / ${results.length} 条`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.log('!! 尺子崩：', e && e.message); process.exit(1) })
