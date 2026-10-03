// 「改笔记卡片上那张头像」这一条路在哪：从「我的」页设置那一栏一路点到四槽那一排，
// 每步一张实拍。站长 10-03 问"入口在哪，你发给我看下"，所以这一把既是路书也是判据——
// 哪天那一行被搬走或改名，这里就红。
// 跑法：bash docs/工具/跑尺子.sh 9431 看-形象入口（名字不带 .js）
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/形象入口-实拍')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}
const tx = async (el) => (el ? await el.text() : '（元素不存在）')

;(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  try {
    await mp.switchTab('/pages/me/me')
    await sleep(3500)
    let page = await mp.currentPage()
    // 「我的」页有两栏（介绍 / 设置），那一行在第二栏里，先切过去
    await page.callMethod('onTab', { currentTarget: { dataset: { key: 'set' } } })
    await sleep(1500)
    const row = await page.$('[data-page="profile"]')
    ck('「我的」→ 设置那一栏里有这一行', !!row, await tx(row))
    await mp.screenshot({ path: path.join(OUT, '01-我的页那一行.png') })

    await row.tap()
    await sleep(4000)
    page = await mp.currentPage()
    ck('点它就是卡片模板页（四槽在这页顶上第一块）',
      page.path === 'pages/profile/profile', page.path)
    const slots = await page.$$('.slot')
    const d = await page.data()
    const filled = (d.slots || []).filter(Boolean).length
    const chips = await page.$$('.chip-dot')
    const bins = await page.$$('.bin')
    const hint = await tx(await page.$('.face-hint'))
    ck('四个位置都画出来了', slots.length === 4, `${slots.length} 个`)
    // 两枚开关和垃圾桶只在"这一格有图"时才画（没图就一枚 + 号，没有可开关的东西）。
    // 模拟器这台四格全空，所以先钉这条不变量，再塞一张图进去把两种样子都拍到。
    ck('开关与垃圾桶跟着"有没有图"走（两枚／一格，没图就一枚都不画）',
      chips.length === filled * 2 && bins.length === filled,
      `有图 ${filled} 格 → 开关 ${chips.length} 枚、垃圾桶 ${bins.length} 枚`)
    ck('下面那行说明跟着槽位状态换', hint.length > 0, hint)
    await mp.screenshot({ path: path.join(OUT, '02-四格都空.png') })

    const one = (d.slots || []).slice()
    one[0] = { path: '/assets/home-bg-portrait.jpg', card: true, bg: true }
    await page.setData({ slots: one, allFull: false })
    await sleep(1500)
    const chips2 = await page.$$('.chip-dot')
    const bins2 = await page.$$('.bin')
    ck('放一张图进去：这一格下面立刻多出「卡片」「背景」两枚开关，右上角一枚垃圾桶',
      chips2.length === 2 && bins2.length === 1, `开关 ${chips2.length} 枚、垃圾桶 ${bins2.length} 枚`)
    await mp.screenshot({ path: path.join(OUT, '03-放了一张图那一格.png') })

    // 空槽点下去是系统选图面板（模拟器里点不动），所以这一步只看有没有那个口，不真点
    const plus = await page.$('.slot.empty .plus')
    ck('没放满时空那一格还是枚 + 号（点它选图）', !!plus)
    console.log(`\n${bad.length ? '未通过 ' + bad.length + ' 条：' + bad.join(' / ') : '全部通过'}（截图 → ${OUT}）`)
    process.exitCode = bad.length ? 1 : 0
  } finally {
    await mp.disconnect()
  }
})().catch((e) => { console.error('脚本崩了', e); process.exit(2) })
