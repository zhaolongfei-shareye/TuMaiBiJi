// 模板预览弹窗这一屏的几何自证（模拟器 + 现网后端）：卡片比例、底部圆点分页、把手行两句对称。
// 为什么要有：09-30 站长真机截图打回——"卡片预览选择时候，变形了，要修正，比例不要改，
// 展示要看实际比例"。变形的原因是展示框只按宽度算，高被 flex-shrink 与 max-height
// 压回可视框，宽留着、高被挤，于是整张卡扁了。静态尺子看不出这个，必须量渲染出来的盒子。
// 同一天追加的两条也在这里量：「左右滑换模板」挪到把手行左端、与「点一下收起」对称；
// 卡片下面那一排彩色圆点要"几套模板就几枚、当前那枚大一点、且停在当前位置"。
// 前置：微信开发者工具已开；改过 WXML/WXSS/JS 要先 cli close 再
//   cli auto --project <仓库>/miniprogram --auto-port 9431，等十秒端口起来。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-卡片预览比例-真跑.js
// 跑完 mp.close() 会占掉端口，别在站长真机调试时跑。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')

const PORT = process.env.MP_PORT || 9431
const OUT = path.resolve(__dirname, '../design/笔记列表-背景图/实测')
// 黑边那一档的宽度只有一份真相：界面加的是 poster.MATTE，判据也读同一个数。
const posterLib = require(path.resolve(__dirname, '../../miniprogram/utils/poster.js'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}

// 元素尺寸一律走 createSelectorQuery + boundingClientRect：
// Page 上没有 evaluate 这条路，而 element.size() 在这个版本里回 undefined。
const measure = (mp) => mp.evaluate(() => new Promise((resolve) => {
  const q = wx.createSelectorQuery()
  q.select('.tpl-body').boundingClientRect()
  q.select('.tpl-poster').boundingClientRect()
  q.selectAll('.tpl-dot').boundingClientRect()
  q.selectAll('.grip-tx').boundingClientRect()
  q.select('.grip').boundingClientRect()
  q.exec((res) => resolve({
    body: res[0], box: res[1], dots: res[2] || [], gripTx: res[3] || [], grip: res[4],
    windowWidth: wx.getWindowInfo().windowWidth,
  }))
}))

const toRpx = (px, windowWidth) => px * 750 / windowWidth

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('尺子挂了（未处理拒绝）', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error(`连不上自动化端口，先跑 cli auto --auto-port ${PORT}`)
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

  try {
    await sleep(2000)
    // 头一次切页会撞上开发者工具那句 rawPath is null（页面元信息没就绪），重试到成功为止。
    // v19 起这一屏没有排布档了（纸片墙／一行换成两枚 tab，且 view 不落本机、
    // 每次进页都回到「笔记列表」），所以这里不再清 listMode，也就没有"按下标取到 undefined"那一坑。
    for (let i = 0; ; i++) {
      try { await mp.reLaunch('/pages/index/index'); break } catch (e) {
        if (i >= 4) throw e
        console.log(`第 ${i + 1} 次进列表页没成：${e.message}`)
        await sleep(8000)
      }
    }
    await sleep(4000)
    const page = await mp.currentPage()
    let d = await page.data()
    // 私密笔记进不了这个弹窗（dock 那枚不渲染），所以挑一条能用的
    const at = (d.notes || []).findIndex((n) => !n.is_private)
    if (at < 0) { console.log('!! 库里没有非私密笔记，无法自证'); process.exit(3) }
    await page.setData({ detailOpen: false, templateOpen: false })
    await sleep(800)

    // v18 起列表没有"就地展开"那一态：点一行就直接浮详情窗（原来要两下）。
    // 而屏上那一批的顺序不等于 notes 的下标（分类筛选会挪位），
    // 所以按 data-idx 找那一条，不按下标取。
    const rowOf = async (want) => {
      for (const e of await page.$$('.xrow')) {
        if (Number(await e.attribute('data-idx')) === want) return e
      }
      return null
    }
    const row = await rowOf(at)
    if (!row) throw new Error(`屏上没有 data-idx=${at} 那一条，进不去弹窗`)
    await row.tap()
    await sleep(3000)
    d = await page.data()
    ck('详情窗浮起来了', d.detailOpen === true, `detailOpen=${d.detailOpen}`)
    const ibtn = await page.$('.ds-ibtn.primary')
    ck('详情窗 dock 里有「生成笔记卡片」那枚', !!ibtn)
    if (!ibtn) throw new Error('进不去弹窗，后面量不了')
    await ibtn.tap()
    let prevCanvasW = 0
    let prevCanvasH = 0

    for (let round = 0; round < 2; round++) {
      // 出图要等画布渲染 + canvasToTempFilePath。换套时先等 busy 落回 false，
      // 再等 js 写进来的那一对数确实变了——否则量到的是上一套留下的旧盒子。
      let d0 = await page.data()
      for (let i = 0; i < 14 && d0.posterBusy; i++) { await sleep(1000); d0 = await page.data() }
      for (let i = 0; i < 14 && d0.canvasW === prevCanvasW && d0.canvasH === prevCanvasH; i++) {
        await sleep(1000); d0 = await page.data()
      }
      prevCanvasW = d0.canvasW; prevCanvasH = d0.canvasH
      let poster = null
      for (let i = 0; i < 12 && !poster; i++) {
        await sleep(1500)
        poster = await page.$('.tpl-poster')
      }
      d = await page.data()
      ck(`第 ${round + 1} 套：弹窗里那张卡片渲染出来了`, !!poster, `tpl=${d.posterTpl}`)
      if (!poster) break

      const { body, box, windowWidth } = await measure(mp)
      ck(`第 ${round + 1} 套：量到了展示盒与可视框`, !!box && !!body,
        box ? `盒 ${Math.round(box.width)}×${Math.round(box.height)}px` : '（盒没量到）')
      if (!box || !body) break

      const shown = { w: toRpx(box.width, windowWidth), h: toRpx(box.height, windowWidth) }
      const shownRatio = shown.w / shown.h
      const trueRatio = d.canvasW / d.canvasH
      // 判据：渲染出来的宽高比 == 海报自己的宽高比。容差 1%（取整误差）。
      ck(`第 ${round + 1} 套：展示比例等于海报实际比例（不变形）`,
        Math.abs(shownRatio / trueRatio - 1) < 0.01,
        `展示 ${shownRatio.toFixed(3)} vs 实际 ${trueRatio.toFixed(3)}（${d.canvasW}×${d.canvasH}）`)
      ck(`第 ${round + 1} 套：js 算给 style 的那两个数也同比例`,
        Math.abs(d.posterW / d.posterH - trueRatio) < 0.01,
        `style ${d.posterW}×${d.posterH}rpx`)
      // 站长 10-01 深夜：递给微信那个图片面板的成品，外圈要留一档纯黑（面板本身全黑底，
      // 卡片直边贴上去像被裁一半）。canvasW 就是这张成品的宽，少那一档就是黑边没加上。
      ck(`第 ${round + 1} 套：成品外圈带着那一档纯黑（宽 = ${posterLib.W} + ${posterLib.MATTE}×2）`,
        d.canvasW === posterLib.W + posterLib.MATTE * 2, `${d.canvasW}`)
      // 不能溢出可视框，否则又会被压回去
      ck(`第 ${round + 1} 套：整张卡都在可视框里（没有溢出被裁）`,
        box.height <= body.height + 1 && box.width <= body.width + 1,
        `盒 ${Math.round(box.height)}px / 框 ${Math.round(body.height)}px`)
      // 也不能小得离谱：短边至少占框的一半，否则"看实际比例"等于看不清
      ck(`第 ${round + 1} 套：缩得不过分`, Math.min(shown.w / 702, shown.h / toRpx(body.height, windowWidth)) > 0.5,
        `占宽 ${(shown.w / 702 * 100).toFixed(0)}%`)

      /* ---------- 圆点分页：一共多少套、现在第几套 ---------- */
      const m2 = await measure(mp)
      const dots = m2.dots || []
      ck(`第 ${round + 1} 套：底部圆点有几套模板就几枚`, dots.length === d.tplIds.length,
        `${dots.length} 枚 / ${d.tplIds.length} 套`)
      if (dots.length) {
        const sizes = dots.map((x) => Math.round(x.width))
        const big = sizes.indexOf(Math.max(...sizes))
        const want = d.tplIds.findIndex((x) => x.id === d.posterTpl)
        ck(`第 ${round + 1} 套：当前那一枚确实比其他大一点`,
          sizes[big] - Math.max(...sizes.filter((_, i) => i !== big)) >= 3,
          `各枚 ${sizes.join(',')}`)
        ck(`第 ${round + 1} 套：大的那枚停在当前模板的位置`, big === want, `第 ${big + 1} 枚 / 应在第 ${want + 1} 枚`)
        // 判据取"同一根中线"而不是"同一个 top"：这一行是 align-items:center，
        // 当前那枚大 6rpx，top  naturally 会比别人小半个身位——按 top 判会永远红。
        const mid = dots.map((x) => Math.round(x.top + x.height / 2))
        ck(`第 ${round + 1} 套：十枚排在同一根中线上（没有错位或掉行）`,
          Math.max(...mid) - Math.min(...mid) <= 1, `中线 ${mid.join(',')}`)
      }

      /* ---------- 「左右滑换模板」挪到把手行左端，与「点一下收起」对称 ---------- */
      const gt = m2.gripTx || []
      ck('第 1 句提示挪到了把手行：这一行有两个文本', gt.length === 2, `读到 ${gt.length} 个`)
      if (gt.length === 2 && m2.grip) {
        const [L, R] = gt
        const edge = 34 * windowWidth / 750   // 样式里那 34rpx 折回 px
        ck('两句在同一行、同一顶边、同一高度',
          Math.abs(L.top - R.top) < 1 && Math.abs(L.height - R.height) < 1,
          `top ${Math.round(L.top)}/${Math.round(R.top)} 高 ${Math.round(L.height)}/${Math.round(R.height)}`)
        ck('左右各留 34rpx，两句真的对称',
          Math.abs(L.left - (m2.grip.left + edge)) < 2
          && Math.abs((m2.grip.left + m2.grip.width - edge) - (R.left + R.width)) < 2,
          `左距 ${Math.round(L.left - m2.grip.left)}px 右距 ${Math.round(m2.grip.left + m2.grip.width - R.left - R.width)}px`)
        ck('两句都在把手行里、没压到把手上',
          L.top >= m2.grip.top - 1 && L.top + L.height <= m2.grip.top + m2.grip.height + 1)
      }
      ck('卡片下面那句旧提示已经撤掉', !(await page.$('.tpl-swipe-hint')))

      await mp.screenshot({ path: path.join(OUT, `实测-卡片预览比例-${d.posterTpl || round}.png`) })
      if (round === 0) {
        // 换下一套：十套模板的 plan.height 各不相同，只量一套等于没量
        const before = d.posterTpl
        await page.callMethod('_advanceTemplate', 1)
        let after = before
        for (let i = 0; i < 12 && after === before; i++) { await sleep(1000); after = (await page.data()).posterTpl }
        ck('换到了另一套模板（各套高度不同，比例要各量一次）', after !== before, `${before} → ${after}`)
      }
    }
  } finally {
    await mp.close()
  }
  console.log(`\n${bad.length ? '未通过 ' + bad.length + ' 条：' + bad.join(' / ') : '全部通过'}`)
  process.exitCode = bad.length ? 1 : 0
})().catch((e) => { console.error('尺子跑挂了：', e.message); process.exitCode = 1 })
