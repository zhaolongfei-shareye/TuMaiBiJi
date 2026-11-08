// 「浏览卡片市场」那一层的**真跑**尺子。
// 跑法：docs/工具/跑尺子.sh 9431 验-卡片市场浮窗-真跑
//
// 静态那把（`验-卡片市场浮窗.js`）钉的是**代码形状**；这一把钉的是**屏上**：
// 那一层真的浮出来了、真的不是全屏、真的是上下两层、真的能左右横着滑、
// 点一格真的回到「生成分享图」那一屏。
//
// 需求原话（站长 11-08 第 1 条）：「生成分享图时候，左上角的左右滑换模板，改为"浏览卡片市场"，
//   浮窗里面显示，现有所有卡片，上下两层，左右切换浏览，该界面仍然是四周毛玻璃的风格，不要全屏。
//   点击选中后，回到生成分享图界面。」
//
// 这一把量八件事：
//   ① 连的是不是这一条线这一号的包（屏上 version ＝ 源码 appInfo.VERSION）；
//   ② 左上角那一句念的是「浏览卡片市场」，而且点它**不会顺手把成品弹窗收了**
//      （它住在 `.grip` 里，`.grip` 那条 bindtap 是"点把手收窗"——不 catchtap 就白点）；
//   ③ 这一层真的**不是全屏**：四边都留了缝（四周看得见后面的东西）；
//   ④ 四周那一圈仍是**磨砂玻璃**（`.float-mask` 那一支：铺满整屏＋backdrop-filter 挂 blur）；
//   ⑤ **上下两层**，每层一条 `scroll-x` 的货架，且货架内容比可视区宽（有东西可滑）；
//   ⑥ 格子里是**每一套现役模板**（与成品弹窗顶上那排圆点同一份清单，一个不多一个不少）；
//   ⑦ 每格小样画的是**它自己那一套的高**（逐格提交的那条路真的走到视图层了）；
//   ⑧ 点一格 → 收这一层、回到生成分享图那一屏、换的那一套真的画出来了；
//      收这一层的两个口（✕／点窗外）都收得掉这一层，且**不连带收掉底下那层**。
//
// ⚠ 这一把**不往现网写一行**：开窗、出图、换模板全在这一台模拟器里；
//   唯一打到服务端的是读（列表／笔记／模板名单／分享码），写的一律没有。
// ⚠ 截图落在 /tmp/ruler-market-*.png（这一把不往 docs/工具/实测/ 里塞一次性的图）。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const SRC_VERSION = /const VERSION = '([\d.]+)'/.exec(
  fs.readFileSync(P('utils/appInfo.js'), 'utf8'))[1]
// 期望值一律从本仓那份字典现取，不写死中文字面量（账号一换英文就报假红）。
const { texts } = require(P('utils/i18n.js'))
const T = texts('zh')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

automator.connect({ wsEndpoint: 'ws://localhost:9431' }).then(async (mp) => {
  let ip = null

  // 读几个选择器的矩形 + 屏的尺寸（一次 exec 读完，避免多次往返）。
  // ⚠ automator 的 Element 上**没有** boundingClientRect（只有 size/offset），
  //   要矩形就得走页面自己的 selectorQuery（同「我的」页那份量法）。
  const rectsOf = (sels) => mp.evaluate((list) => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    list.forEach((s) => { q.select(s).boundingClientRect() })
    q.exec((r) => {
      const info = wx.getWindowInfo()
      const out = {}
      list.forEach((s, i) => { out[s] = (r && r[i]) || null })
      resolve({ rects: out, winW: info.windowWidth, winH: info.windowHeight })
    })
  }), sels)

  try {
    /* ---------- ① 连的是不是这一条线、这一号的包 ---------- */
    const meP = await mp.switchTab('/pages/me/me')
    await sleep(1800)
    const shown = (await meP.data()).version
    ck('① IDE 里开的是这一条线这一号的包（屏上 version ＝ 源码 VERSION）',
      String(shown) === SRC_VERSION, `屏上 v${shown}／源码 v${SRC_VERSION}`)
    if (String(shown) !== SRC_VERSION) throw new Error('版本对不上，后面量到的都是别人的包')

    /* ---------- 开一层"未生成态"的成品弹窗（已生成态那一句不画） ---------- */
    await mp.switchTab('/pages/index/index')
    ip = await mp.currentPage()
    await ip.waitFor(1800)
    const notes = (await ip.data()).notes || []
    ck('① 列表读得到笔记（这一把要开一层成品弹窗）', notes.length >= 1, `${notes.length} 篇`)

    let opened = null
    for (const n of notes) {
      if (n.is_private) continue
      await ip.callMethod('_openPosterFor', n)
      await sleep(1400)
      const d = await ip.data()
      if (d.templateOpen && !d.posterHasCard) { opened = n; break }
      await ip.callMethod('_closeTemplate')
      await sleep(400)
    }
    ck('① 能开出一层「未生成态」的成品弹窗（已生成态左上角那一句本来就不画）', !!opened,
      opened ? `note ${opened.id}` : '每一篇都已有卡片')
    if (!opened) throw new Error('没有可量的那一篇（每一篇都已有卡片）')

    // 下发名单那一趟（`_pullTemplatesForPoster`）还在飞的时候，marketSkeleton 读到的清单可能是旧的
    // ⇒ 等它落定再开这一层（它落定时会把 tplIds 一起刷平）。
    let pulling = true
    for (let i = 0; i < 40 && pulling; i += 1) {
      pulling = await mp.evaluate(() => {
        const p = getCurrentPages().slice(-1)[0]
        return !!(p && p._tplPulling)
      })
      if (pulling) await sleep(500)
    }
    ck('① 下发名单那一趟落定了（清单与圆点同一份的前提）', !pulling, pulling ? '还在飞' : '已落定')
    await sleep(800)

    /* ---------- ② 左上角那一句：念的是「浏览卡片市场」，点它不连带收窗 ---------- */
    const entries = await ip.$$('.grip-tx-l')
    ck('② 成品弹窗左上角那一句在（详情窗那一枚此刻不画，屏上只有一枚）',
      entries.length === 1, `${entries.length} 枚`)
    if (!entries.length) throw new Error('左上角那一句没画出来，后面量不了')
    const entryText = String(await entries[0].text() || '').trim()
    ck('② 那一句念的是字典里的「浏览卡片市场」（不是旧那句「左右滑换模板」）',
      entryText === T.browseMarket, `屏上「${entryText}」／字典「${T.browseMarket}」`)

    await entries[0].tap()
    await sleep(1000)
    const d1 = await ip.data()
    ck('② 点它浮出了这一层（marketOpen 翻真）', d1.marketOpen === true, `marketOpen=${d1.marketOpen}`)
    ck('② 而且**没有**顺手把成品弹窗收了（那一句住在 .grip 里，.grip 的 bindtap 是"点把手收窗"）',
      d1.templateOpen === true, `templateOpen=${d1.templateOpen}`)

    /* ---------- ③ 不是全屏：四边都留着缝 ---------- */
    const g = await rectsOf(['.mkt-sheet', '.mkt-mask'])
    const sh = g.rects['.mkt-sheet']
    const mk = g.rects['.mkt-mask']
    if (!sh) throw new Error('这一层没画出来（量不到矩形）')
    const gaps = {
      左: sh.left, 上: sh.top,
      右: g.winW - (sh.left + sh.width),
      下: g.winH - (sh.top + sh.height),
    }
    ck('③ 这一层不是全屏：左右上下四边都留着缝（缝 > 0 ⇒ 四周看得见后面的东西）',
      gaps.左 > 0 && gaps.上 > 0 && gaps.右 > 0 && gaps.下 > 0,
      `左 ${gaps.左.toFixed(1)}／上 ${gaps.上.toFixed(1)}／右 ${gaps.右.toFixed(1)}／下 ${gaps.下.toFixed(1)} px`)
    ck('③ 屏上还有一块是它盖不住的（它比整屏小）',
      sh.width < g.winW && sh.height < g.winH,
      `窗 ${sh.width.toFixed(0)}×${sh.height.toFixed(0)}／屏 ${g.winW}×${g.winH}`)
    ck('③ 底下那层成品弹窗还在树里（这一层是盖在它上头，不是把它摘了）',
      !!(await ip.$('.tpl-sheet')))

    /* ---------- ④ 四周那一圈仍是磨砂玻璃 ---------- */
    ck('④ 玻璃那一层铺满整屏（四边都是 0 ⇒ 真的是"四周那一圈"）',
      !!mk && mk.left === 0 && mk.top === 0
      && Math.abs(mk.width - g.winW) <= 1 && Math.abs(mk.height - g.winH) <= 1,
      mk ? `左 ${mk.left}／上 ${mk.top}／${mk.width.toFixed(0)}×${mk.height.toFixed(0)}（屏 ${g.winW}×${g.winH}）` : '量不到')
    const maskEl = await ip.$('.mkt-mask')
    const bf = maskEl ? String(await maskEl.style('backdrop-filter') || '') : ''
    if (/blur\(/.test(bf)) {
      ck('④ 那一圈挂着模糊（backdrop-filter 里有 blur）', true, `backdrop-filter=${bf}`)
    } else {
      // 模拟器这一格读不到就是读不到：不能拿"读不到"当"有"，也不能当"没有"。
      // 只报事实，让看的人自己判（真机那一格才有最终读数）。
      console.log(`⚠ ④ 这一条环境读不到：模拟器算出来的 backdrop-filter 是「${bf || '空'}」，`)
      console.log('   —— 判「没有模糊」是判据自己的错（模拟器不算这属性）。玻璃那一层由静态那把钉着。')
    }
    const maskBg = maskEl ? String(await maskEl.style('background-color') || '') : ''
    ck('④ 那一圈是暗纱而不是一块实底（不吃成死黑）',
      !/rgb\(0, 0, 0\)|rgba\(0, 0, 0, 1\)/.test(maskBg), `底色 ${maskBg || '（读不到）'}`)

    /* ---------- ⑤ 上下两层，每层一条能横着滑的货架 ---------- */
    const rows = await ip.$$('.mkt-row')
    const scrolls = await ip.$$('.mkt-scroll')
    ck('⑤ 上下两层（组数＝2）', rows.length === 2, `${rows.length} 层`)
    ck('⑤ 每层一条横着滚的货架（scroll-view 一条一条对得上）',
      scrolls.length === rows.length, `${scrolls.length} 条`)
    const heads = await ip.$$('.mkt-row-h')
    const headTexts = []
    for (const h of heads) headTexts.push(String(await h.text() || '').trim())
    ck('⑤ 两层各有一个组名（经典款／个性款，名字跟着界面语言走）',
      headTexts.length === 2 && headTexts.every((x) => x.length > 0), headTexts.join('｜'))

    // 货架内容比可视区宽 ⇒ 真的有东西可以左右滑。
    const shelf = []
    for (let i = 0; i < scrolls.length; i += 1) {
      const sw = Number(await scrolls[i].scrollWidth())
      const bw = (await scrolls[i].size()).width
      shelf.push({ sw, bw })
    }
    ck('⑤ 每条货架的内容都不比可视区窄（scrollWidth ≥ 盒子宽）',
      shelf.every((s) => s.sw >= s.bw - 1),
      shelf.map((s) => `${s.sw.toFixed(0)}/${s.bw.toFixed(0)}`).join('｜'))
    const wide = shelf.findIndex((s) => s.sw > s.bw + 1)
    ck('⑤ 至少有一条货架真的比可视区宽（有东西可滑，"左右切换浏览"才成立）',
      wide >= 0, wide >= 0 ? `第 ${wide + 1} 条 ${shelf[wide].sw.toFixed(0)}>${shelf[wide].bw.toFixed(0)}` : '一条都不宽')
    if (wide >= 0) {
      const el = scrolls[wide]
      const beforeLeft = Number(await el.property('scrollLeft') || 0)
      await el.scrollTo(120, 0)
      await sleep(900)
      const afterLeft = Number(await el.property('scrollLeft') || 0)
      ck('⑤ 那条货架真的能横着滚（scrollTo 之后 scrollLeft 真的动了）',
        afterLeft > beforeLeft, `${beforeLeft} → ${afterLeft}`)
      await el.scrollTo(0, 0)
      await sleep(400)
    }

    /* ---------- ⑥ 每一套现役模板都在这一层里（与顶上那排圆点同一份清单） ---------- */
    const d2 = await ip.data()
    const flat = []
    for (const grp of (d2.marketRows || [])) for (const it of (grp.items || [])) flat.push(it)
    const cells = await ip.$$('.mkt-cell')
    ck('⑥ 这一层里的格数＝清单里的套数（一个都不少）',
      cells.length === flat.length && flat.length > 0,
      `屏上 ${cells.length} 格／清单 ${flat.length} 套`)
    ck('⑥ 清单与成品弹窗顶上那排圆点是同一份（"现有所有卡片"，不多不少）',
      flat.length === (d2.tplIds || []).length,
      `市场 ${flat.length}／圆点 ${(d2.tplIds || []).length}`)
    ck('⑥ 屏上每一格都画了真小样（canvas 一枚一个，不是占位块）',
      (await ip.$$('.mkt-canvas')).length === cells.length,
      `${(await ip.$$('.mkt-canvas')).length} 枚 canvas／${cells.length} 格`)
    const onCells = await ip.$$('.mkt-on')
    ck('⑥ 当前这一套在市场里是亮着的那一格（选中的看得见）',
      onCells.length === 1, `亮着 ${onCells.length} 格`)

    /* ---------- ⑦ 每格小样画的是它自己那一套的高（逐格提交那条路真走到视图层了） ---------- */
    const canvases = await ip.$$('.mkt-canvas')
    const per = []
    for (let i = 0; i < canvases.length; i += 1) {
      const s = await canvases[i].size()
      per.push({ 实得: s.height, 期望: Math.round((flat[i].h * g.winW) / 750) })
    }
    const off = per.filter((p) => Math.abs(p.实得 - p.期望) > 2)
    ck('⑦ 每一格小样的高度＝它自己那一套算出来的高（逐格提交真走到视图层了）',
      off.length === 0 && per.length > 0,
      off.length ? `差得远的有 ${off.length} 格（第一处：实得 ${off[0].实得}／期望 ${off[0].期望}）`
        : `${per.length} 格都对得上（例：${per[0] ? per[0].实得 + 'px' : '—'}）`)

    // ⚠ 上面那条可能"恰好全对"（所有模板同比例时，占位高与真高一样），
    //   所以再钉一条**能分辨的**：把某一格的高度改成一个别的数，视图层必须跟着变。
    //   这一条钉的是"格子高度真的是逐格绑到那一格上的"，不是"读数碰巧相等"。
    const probe = 400
    const orig = flat[0].h
    await ip.setData({ 'marketRows[0].items[0].h': probe })
    let followed = false
    let got = 0
    for (let i = 0; i < 12 && !followed; i += 1) {
      await sleep(600)
      const s = await (await ip.$$('.mkt-canvas'))[0].size()
      got = s.height
      if (Math.abs(got - (probe * g.winW) / 750) <= 2) followed = true
    }
    ck('⑦ 那一格的高度是**逐格**绑上去的（改一格的高度，视图层跟着变）', followed,
      `改成 ${probe}rpx 后屏上 ${got.toFixed(0)}px（期望 ${((probe * g.winW) / 750).toFixed(0)}px）`)
    await ip.setData({ 'marketRows[0].items[0].h': orig })
    await sleep(600)

    await mp.screenshot({ path: '/tmp/ruler-market-01-浮窗在屏上.png' })

    /* ---------- ⑧ 点一格 → 收这一层、回成品那一屏、换的那套真画出来了 ---------- */
    // 找一格**不是**当前这一套的（点当前那格＝没换，等于没量到"选中"这件事）。
    let pickIdx = -1
    for (let i = 0; i < cells.length; i += 1) {
      const cls = String(await cells[i].attribute('class') || '')
      if (cls.indexOf('mkt-on') < 0) { pickIdx = i; break }
    }
    ck('⑧ 有一格不是当前这一套（可点的目标）', pickIdx >= 0, `第 ${pickIdx + 1} 格`)
    if (pickIdx < 0) throw new Error('每一格都亮着，量不了"换一套"')
    const wantId = flat[pickIdx].id
    const tplBefore = (await ip.data()).posterTpl
    await cells[pickIdx].tap()
    await sleep(1200)
    const d3 = await ip.data()
    ck('⑧ 点一格把这一层收了', d3.marketOpen === false, `marketOpen=${d3.marketOpen}`)
    ck('⑧ 而且回到了「生成分享图」那一屏（底下那层没被收掉）',
      d3.templateOpen === true, `templateOpen=${d3.templateOpen}`)
    ck('⑧ 选中的是刚点的那一套', d3.posterTpl === wantId,
      `点的是 ${wantId}／屏上 ${d3.posterTpl}（点前 ${tplBefore}）`)
    ck('⑧ 顶上那一行念的是新选的那一套的名字',
      String(d3.posterTplName || '') === String(flat[pickIdx].label || ''),
      `屏上「${d3.posterTplName}」`)
    await sleep(2600)
    const d4 = await ip.data()
    ck('⑧ 新那一张真的画出来了（不是只换了名字）',
      !!d4.posterImagePath && d4.posterBusy === false,
      `有图=${!!d4.posterImagePath}／忙=${d4.posterBusy}`)
    await mp.screenshot({ path: '/tmp/ruler-market-02-选完回到成品那一屏.png' })

    /* ---------- 收这一层的两个口：✕ 与点窗外，都不连带收掉底下那层 ---------- */
    const entry2 = await ip.$$('.grip-tx-l')
    if (entry2.length) await entry2[0].tap()
    await sleep(900)
    const d5 = await ip.data()
    ck('⑧ 再点那一句，这一层又浮出来了（可以反复进）', d5.marketOpen === true, `marketOpen=${d5.marketOpen}`)
    const x = await ip.$('.mkt-x')
    ck('⑧ 收这一层的那枚 ✕ 在', !!x)
    if (x) {
      await x.tap()
      await sleep(800)
      const d6 = await ip.data()
      ck('⑧ 点 ✕ 收掉这一层，而底下那层还在', d6.marketOpen === false && d6.templateOpen === true,
        `marketOpen=${d6.marketOpen}／templateOpen=${d6.templateOpen}`)
    }

    const entry3 = await ip.$$('.grip-tx-l')
    if (entry3.length) await entry3[0].tap()
    await sleep(900)
    const mask2 = await ip.$('.mkt-mask')
    ck('⑧ 点窗外那一层在（glass 那一层铺满整屏）', !!mask2)
    if (mask2) {
      // 这一层的窗盖住了屏幕正中 ⇒ automator 的 tap()（点元素中心）会落在窗上、点不到罩子。
      // 所以这里用 trigger 把 tap 直接送到罩子那一枚节点上（走的是同一套事件分发）。
      await mask2.trigger('tap')
      await sleep(800)
      const d7 = await ip.data()
      ck('⑧ 点窗外收掉这一层，而底下那层还在',
        d7.marketOpen === false && d7.templateOpen === true,
        `marketOpen=${d7.marketOpen}／templateOpen=${d7.templateOpen}`)
    }
    await mp.screenshot({ path: '/tmp/ruler-market-03-收掉之后.png' })
  } catch (err) {
    console.log('脚本停了：' + (err && err.message ? err.message : err))
    bad.push('脚本没跑完')
  } finally {
    try {
      // 收尾：把这一层与成品弹窗都收干净，别给下一把尺子留一个浮着的窗。
      const p = ip || await mp.currentPage()
      await p.setData({ marketOpen: false })
      await p.callMethod('_closeTemplate')
      await mp.switchTab('/pages/index/index')
      await sleep(800)
      console.log('还原：这一层与成品弹窗都收了')
    } catch (e) { /* 收尾失败不影响这一把的判红 */ }
    try { mp.disconnect() } catch (e) { /* 断不开就算了 */ }
  }
  console.log(`\n${bad.length === 0 ? '真跑全过' : `红 ${bad.length} 条`}`)
  bad.forEach((n) => console.log('  ✗ ' + n))
  process.exit(bad.length ? 1 : 0)
}).catch((e) => { console.error(e); process.exit(2) })
