// 一次性探针（站长 10-05 两条文案改动）：新加的小字在中英文两种态下**不许折行、不许顶出那一行**。
//   ① 「我的→设置」四行右侧说明——每句说这一行**拿来干嘛**（不是里面装着什么零件），
//     字面量一律现读字典，改文案不必来改这把尺子
//   ② 首页成品弹窗药丸上面那行，**开着与关掉两态各量一次**（站长 10-05：注释不能一开关就没）
// 为什么不能靠肉眼：`.menu-hint` 写了 `white-space: nowrap`，折行不会发生——**挤不下变成"顶出右边界"**，
// 而顶出去的东西在截图里常常看不出来（箭头被挤走、字压到卡片边缘）。所以这里量渲染盒子，不量字符串长度：
// 设置那四行是 flex 里的收缩件，盒子宽＝字的宽，逐行报「主字右沿／小字左右沿／箭头左沿／行右沿／高」，
// 判据三条：只有一行、没压到右边那枚箭头、没压到主字。药丸那行是块级（盒子永远等于容器宽，量不出字宽），
// 只由**高度**担保它没折行——两条各管各的，别互相顶。
// 跑法：bash docs/工具/跑尺子.sh 9431 探-小字不折行
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const lang = require('./尺子语言钉.js')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}

// 一次查询把三族盒子都拿回来（px），换算成 rpx 由调用方给比例
const grab = (mp) => mp.evaluate(() => new Promise((resolve) => {
  const q = wx.createSelectorQuery()
  q.selectAll('.menu-item').boundingClientRect()
  q.selectAll('.menu-label').boundingClientRect()
  q.selectAll('.menu-hint').boundingClientRect()
  q.selectAll('.ico').boundingClientRect()
  q.exec((res) => resolve({ items: res[0] || [], labels: res[1] || [], hints: res[2] || [], icos: res[3] || [] }))
}))

const grabPill = (mp) => mp.evaluate(() => new Promise((resolve) => {
  const q = wx.createSelectorQuery()
  q.select('.pill-lab').boundingClientRect()
  q.select('.tpl-dock').boundingClientRect()
  q.exec((res) => resolve({ lab: res[0], dock: res[1] }))
}))

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('探针挂了（未处理拒绝）', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上 9431，先跑 cli auto')

  const original = await lang.read(mp)
  const win = await mp.evaluate(() => wx.getWindowInfo().windowWidth)
  const R = win / 750
  const toR = (v) => Math.round(v / R)

  try {
    for (const L of ['zh', 'en']) {
      await lang.pin(mp, L)
      console.log(`\n———— 界面语言钉成 ${L}（窗口 ${win}px，1rpx=${(R).toFixed(4)}px）————`)

      const page = await mp.reLaunch('/pages/me/me')
      await sleep(4500)
      await page.setData({ tab: 'set' })
      await sleep(1200)
      const dict = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js')).texts(L)
      const g = await grab(mp)
      ck(`${L}｜设置那组正好四行带小字说明（注销账号那行没加，站长没点它）`,
        g.hints.length === 4, `量到 ${g.hints.length} 条`)
      if (g.hints.length !== 4) { console.log('  !! 条数不对，后面逐行判据跳过'); continue }

      // 逐行文本现读字典（站长改过一轮口径：不许把字面量钉进尺子，否则每次改微文案假红一次）。
      // 顺带钉住"这行说的是这行自己的功能"——四句按 DOM 序对四个键，串了位也算红。
      const hintEls = await page.$$('.menu-hint')
      const hintTexts = []
      for (const e of hintEls) hintTexts.push(e ? await e.text() : '')
      const hintKeys = ['navProfileTip', 'wallpaperTip', 'categoriesTip', 'privatePasswordTip']

      g.hints.forEach((h, i) => {
        // 逐行配对按"竖直方向落在哪一行的带里"，不按数组下标——这一页还有别的 .menu-item
        // （分享那一枚按钮复用了同一个类），按下标会错位。
        const it = g.items.find((x) => h.top >= x.top - 2 && h.bottom <= x.bottom + 2) || g.items[i]
        const lb = g.labels.find((x) => Math.abs(x.top - h.top) < 40) || g.labels[i]
        const mid = (h.top + h.bottom) / 2
        const ico = g.icos.find((x) => Math.abs((x.top + x.bottom) / 2 - mid) < 30)
        const lineH = toR(h.height), hRight = toR(h.right)
        const arrowLeft = ico ? toR(ico.left) : null
        console.log(`  第 ${i + 1} 行：主字右沿 ${lb ? toR(lb.right) : '?'}rpx · 小字 ${toR(h.left)}→${hRight}rpx · 箭头左沿 ${arrowLeft === null ? '?' : arrowLeft}rpx · 行右沿 ${toR(it.right)}rpx · 高 ${lineH}rpx`)
        ck(`${L}｜第 ${i + 1} 行小字只有一行`, lineH <= 34, `高 ${lineH}rpx`)
        // `.menu-hint` 是 flex 里的收缩件，盒子宽就是字的宽，所以这两条量得动（不像药丸那行是块级）
        ck(`${L}｜第 ${i + 1} 行小字没压到右边那枚箭头`,
          arrowLeft === null ? false : hRight <= arrowLeft,
          arrowLeft === null ? '没配到箭头' : `小字右沿 ${hRight} vs 箭头左沿 ${arrowLeft}`)
        ck(`${L}｜第 ${i + 1} 行小字没顶出那一行的右边界`, hRight <= toR(it.right), `差 ${toR(it.right) - hRight}rpx`)
        ck(`${L}｜第 ${i + 1} 行小字没压住主字`, !lb ? false : h.left >= lb.right,
          lb ? `间隙 ${toR(h.left - lb.right)}rpx` : '没配到主字')
        ck(`${L}｜第 ${i + 1} 行屏上就是字典里那句（${hintKeys[i]}，没串位、没留旧串）`,
          hintTexts[i] === dict[hintKeys[i]], `屏上「${hintTexts[i]}」／字典「${dict[hintKeys[i]]}」`)
      })

      // 药丸那行**两态各量一次**：站长 10-05 打回的第二条就是"一开关注释就没了"，所以两态都必须
      // 自带说明（句中含分隔符），且必须等于字典里那一句——不许有一态是光秃秃的状态词。
      const p = await mp.reLaunch('/pages/index/index')
      await sleep(4500)
      for (const off of [false, true]) {
        await p.setData({ detailOpen: false, posterHasCard: false, templateOpen: true, noQr: off, posterImagePath: '' })
        await sleep(1200)
        const q = await grabPill(mp)
        const tag = `${L}｜${off ? '关掉' : '开着'}那一态`
        const want = off ? dict.qrOff : dict.qrOn
        if (!q.lab) { ck(`${tag}那行渲染出来了`, false, '没量到 .pill-lab（弹窗没开成？）'); continue }
        const h = toR(q.lab.height)
        console.log(`  ${off ? '关掉' : '开着'}那态：高 ${h}rpx · 盒子宽 ${toR(q.lab.width)}rpx`)
        ck(`${tag}只有一行`, h <= 34, `高 ${h}rpx`)
        // 这里**不量右边界**：`.pill-lab` 是块级 `display:block`，盒子永远等于容器内沿，
        // 量出来是容器的宽、不是字的宽，拿它判"挤不挤"是永真式（10-05 第一趟就是被这条坑红的，
        // 当时还把 24rpx 写成减 24px，两个错叠一起）。块级这一行的"不折行"只由**高度**担保。
        const el = await p.$('.pill-lab')
        const txt = el ? await el.text() : ''
        console.log(`    渲染出来的字：${txt}`)
        ck(`${tag}渲染的就是字典里那一句（不抄死）`, txt === want, `期望 ${want}`)
        ck(`${tag}自带说明（含分隔符，不是光一个状态词）`,
          /[｜|]/.test(txt) && txt.split(/[｜|]/)[1].trim().length >= 6, txt)
      }

      // 两种语言各存一张「我的→设置」实拍，给他对着看四行小字
      const OUT = path.resolve(__dirname, '../design/10-05小字说明')
      if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
      await mp.reLaunch('/pages/me/me')
      await sleep(4000)
      await (await mp.currentPage()).setData({ tab: 'set' })
      await sleep(1200)
      await mp.screenshot({ path: path.join(OUT, `实测-设置四行-${L}.png`) })
      console.log(`  已存实拍：docs/design/10-05小字说明/实测-设置四行-${L}.png`)
    }
  } finally {
    await lang.pin(mp, original).catch(() => {})
    console.log(`\n（界面语言已钉回 ${original}）`)
    try { await mp.close() } catch (e) { /* 已经断了就算了 */ }
  }

  console.log(`\n${bad.length ? '红 ' + bad.length + ' 条：' + bad.join('、') : '全绿'}（退出码 ${bad.length ? 1 : 0}）`)
  process.exit(bad.length ? 1 : 0)
})()
