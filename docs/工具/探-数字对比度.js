// 探针（不是判据）：把界面上那些**数字**的实际对比度量出来。
// 跑法：bash docs/工具/跑尺子.sh 9431 探-数字对比度
//
// 为什么要有这一把：站长 10-05 真机（天青那一套）一句"部分数字颜色太浅，与背景太接近，很难看清，
// 请调高一档"。这类问题肉眼在截图上判不稳（同一档墨色，**Poppins Thin 那支细笔画就是比旁边的汉字淡**，
// 而字号、字重、色档三个变量绞在一起），只能把渲染出来的前景色与它真正的底 blend 完算 WCAG 对比度。
// 判档线：小字（<24rpx 或非粗）AA 要 4.5:1；这一把把每个字段落在哪一档打出来，不硬判红绿——
// 抬到哪一档是他审美决定，这把尺子只负责"别再出现 3.2:1 那种"。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const lang = require('./尺子语言钉.js')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// 顺手把"他截图的那两屏"拍下来：判对比度靠数，判"看着是否还浅"要靠图，
// 尤其那两枚是 Poppins Thin 的细笔画——数字达标了笔画仍可能显淡，只有眼睛能收这一口。
const SHOT = path.resolve(__dirname, '../design/10-05小字说明')

// 解析 'rgba(29, 53, 34, 0.72)' / 'rgb(29, 53, 34)'
const parse = (s) => {
  const m = /rgba?\(([^)]+)\)/.exec(String(s || ''))
  if (!m) return null
  const p = m[1].split(',').map((x) => parseFloat(x.trim()))
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
}
const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
})
const lum = (c) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(c.r) + 0.7154 * f(c.g) + 0.0722 * f(c.b)
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('探针挂了', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上 9431，先跑 cli auto')

  // 字段表里第三位写 'photo' 的那些**不参与对比度判定**：它们的底是形象图（一张照片 + 一层
  // 渐变罩），不是任何一块纯色令牌，按纯色底去算会量错对象（第一趟就把头部那列白字量成
  // 1.13:1，因为往上找到的第一个实底是 .sheet 的纸色——那是窗口的底，不是字的底）。
  // 那一类只能看实拍，或改成从截图里按字所在那一块取色再算。
  const show = async (label, page, fields) => {
    console.log(`\n———— ${label} ————`)
    const theme = (await page.data()).themeClass || ''
    console.log(`  主题类：${theme}`)
    // 底：先取字段自己那格的背景，取到透明再往上找（.card / .sheet 各是一档底）
    const bgOf = async (sel) => {
      const chain = [sel, '.card', '.sheet', '.container']
      for (const s of chain) {
        const el = await page.$(s)
        if (!el) continue
        const c = parse(await el.style('background-color'))
        if (c && c.a > 0.9) return { c, from: s }
      }
      return { c: { r: 255, g: 255, b: 255, a: 1 }, from: '白（没找到实底）' }
    }
    for (const [sel, what, kind] of fields) {
      const el = await page.$(sel)
      if (!el) { console.log(`  ${what.padEnd(26)} ${sel} → 这一屏没这个节点，跳过`); continue }
      const fsRaw = await el.style('font-size')
      const fw = await el.style('font-weight')
      const fg = parse(await el.style('color'))
      if (kind === 'photo') {
        console.log(`  ${what.padEnd(26)} ${sel.padEnd(14)} 字 ${fsRaw} 重 ${fw} · 底是形象图（照片＋渐变罩），` +
          `按纯色底算会量错对象 → 只记色：${fg ? `rgba(${fg.r},${fg.g},${fg.b},${fg.a})` : '读不到'}，判它要看实拍`)
        continue
      }
      const { c: bg, from } = await bgOf(sel)
      if (!fg) { console.log(`  ${what.padEnd(26)} ${sel} → 读不到色`); continue }
      const solid = over(fg, bg)
      const r = ratio(solid, bg)
      const win = await el.size()
      console.log(`  ${what.padEnd(26)} ${sel.padEnd(14)} 字 ${fsRaw} 重 ${fw} alpha ${fg.a}` +
        ` · 底 ${from} · 前景 rgb(${solid.r.toFixed(0)},${solid.g.toFixed(0)},${solid.b.toFixed(0)})` +
        ` · 对比度 ${r.toFixed(2)}:1 ${r >= 4.5 ? '≥AA' : '★低于 AA 4.5'}${Number.parseFloat(fw) <= 200 ? ' · Thin 笔画' : ''}`)
      void win
    }
  }

  try {
    // 他发来的那两张是真机英文界面（天青那一套），实拍要跟它同一档才好对着看；
    // 收尾把语言点回去（四枚壁纸/语言都走服务端，这一趟会真发 PUT，所以必须还原）。
    const langBefore = await lang.read(mp)
    await lang.pin(mp, 'en')
    const snap = async (name, page) => {
      fs.mkdirSync(SHOT, { recursive: true })
      const theme = (await page.data()).themeClass || '未知主题'
      await mp.screenshot({ path: path.join(SHOT, `实拍-${name}-${theme}.png`) })
      console.log(`  → 实拍落盘：docs/design/10-05小字说明/实拍-${name}-${theme}.png`)
    }

    const idx = await mp.reLaunch('/pages/index/index')
    await sleep(6000)
    await show('首页（列表那一枚）', idx, [
      ['.xd-d', '列表行日期 MM/DD'],
      ['.x-t', '列表行标题'],
      ['.x-s', '列表行摘要'],
      ['.stat .n', '头部那列数字（笔记数）', 'photo'],
      ['.stat .l', '数字下面那个词', 'photo'],
    ])
    await snap('列表', idx)

    const me = await mp.reLaunch('/pages/me/me')
    await sleep(6000)
    await me.setData({ tab: 'about' })
    await sleep(1500)
    await show('我的 → 关于', me, [
      ['.rule-value', '魅力值那三行的数'],
      ['.rule-label', '规则那三句标签'],
      ['.menu-value', '网站 / 邮箱那两串'],
      ['.about-ver', '版本号那一枚'],
      ['.about-p', '产品介绍正文'],
      ['.copyright', '最底下版权那一行'],
    ])
    await snap('关于', me)
    await me.setData({ tab: 'set' })
    await sleep(1500)
    await show('我的 → 设置', me, [
      ['.menu-hint', '四行右侧的小字说明'],
      ['.menu-label', '四行的主字'],
    ])
    await snap('设置', me)

    const tpl = await mp.reLaunch('/pages/index/index')
    await sleep(6000)
    await tpl.setData({ detailOpen: false, posterHasCard: false, templateOpen: true, noQr: false, posterImagePath: '' })
    await sleep(1500)
    await show('首页 → 成品弹窗（药丸那行）', tpl, [
      ['.pill-lab', '二维码开关那行小字'],
      ['.tpl-actions', '弹窗里那行按钮（对照）'],
    ])
    await snap('成品弹窗', tpl)
    await lang.pin(mp, langBefore)
  } finally {
    try { await mp.close() } catch (e) { /* 已经断了就算了 */ }
  }
  console.log('\n（这一把只打数并顺手实拍；判档线是 WCAG 小字 AA 4.5——.72 那一档由站长 10-05 晚拍）')
})()
