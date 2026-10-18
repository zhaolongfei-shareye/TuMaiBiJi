/**
 * 一把尺子（真跑）：站长 10-18 那一刀在屏上到底念成什么、红在哪儿。
 * 原话「然后详情页顶部，来源前面加 |「分类 」 如果是私密，字体标红。列表页也同样加上。」
 * 排布他拍丙＝`「未分类」· 公众号文章 · 10月18日`（分类在最左、不要竖线）。
 *
 * 为什么静态那把不够、这一把必须真跑（静态只能证明"代码这么写了"）：
 *  ① 那个点号与后面那段之间那道缝，列表靠 flex 的 `gap`、两行 meta 靠挂在分类段自己身上的
 *    `margin-right` ⇒ 只能量面与面，读 innerText 量不出来（所以后面那段特意裹成 `.ds-rest`/`.hero-rest`）；
 *  ② 那一支红由 `.cat-priv` 上屏，加不加由 `priv`/`is_private` 决定 ⇒ 不实测就只是"应该是对的"。
 * ③ 私密那一行有没有，这台账号说了算：**没有就大声写"未量"，绝不拿非私密那一行冒充**。
 *    冒充出来的绿＝下一次改坏了也没人知道。
 * 跑法：docs/工具/跑尺子.sh 9431 验-来源前加分类-真跑
 */
const automator = require('miniprogram-automator')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const APORT = process.env.MP_PORT || 9431

const results = []
// ok === null 是"这一态这台机器上没有 ⇒ 未量"，与红分开计，不算过也不算红。
const ck = (name, ok, got) => {
  results.push({ name, ok })
  console.log(`  ${ok === null ? '–' : ok ? '✓' : '✗'} ${name}${got ? '　→ ' + got : ''}`)
}

// #A83224 = rgb(168, 50, 36)
const RED = [168, 50, 36, 1]
const rgbOf = (s) => {
  const m = String(s || '').match(/[\d.]+/g)
  if (!m) return null
  const n = m.map(Number)
  return n.length === 3 ? [n[0], n[1], n[2], 1] : n
}
const near = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 1.6)
// 8rpx 这道缝：390pt 屏上是 4.2px。取 [2,12] 是因为只钉"有没有缝、缝没大到换行"，不钉取整后的那位数。
const gapOk = (px) => px >= 2 && px <= 12

;(async () => {
  let mp
  for (let i = 0; i < 12; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${APORT}` }); break }
    catch (e) { await sleep(4000) }
  }
  if (!mp) { console.log('!! 连不上自动化端口'); process.exit(2) }

  await mp.switchTab('/pages/index/index')
  await sleep(3500)
  let page = await mp.currentPage()

  const st = await mp.evaluate(() => {
    const p = getCurrentPages().slice(-1)[0]
    const d = p.data || {}
    const rows = (d.groups || []).reduce((a, g) => a.concat(g.rows || []), [])
    return {
      route: p.route, lang: d.lang, cats: (d.categories || []).length,
      rows: rows.map((r, k) => ({ k, id: r.id, cat: r.cat, src: r.src, priv: !!r.priv })),
    }
  })
  // 钉子与读数都要"这一屏已经登录完、表与列表都到货"才有意义：IDE 刚 auto 起来那半分钟里
  // `getCurrentPages()` 拿到的是空 data（10-18 这一趟第一跑就是语言 undefined／表 0 格／列表 0 行），
  // 那不是判据红，是环境没就位 ⇒ 等它，等到才算数。
  let waited = 0
  while (!(st.lang && st.rows.length) && waited < 12) {
    await sleep(5000); waited += 5
    await mp.switchTab('/pages/index/index'); await sleep(1500)
    page = await mp.currentPage()
    Object.assign(st, await mp.evaluate(() => {
      const p = getCurrentPages().slice(-1)[0]
      const d = p.data || {}
      const rows = (d.groups || []).reduce((a, g) => a.concat(g.rows || []), [])
      return {
        route: p.route, lang: d.lang, cats: (d.categories || []).length,
        rows: rows.map((r, k) => ({ k, id: r.id, cat: r.cat, src: r.src, priv: !!r.priv })),
      }
    }))
  }
  const W = await mp.evaluate(() => wx.getSystemInfoSync().windowWidth)
  const rect = (sel) => mp.evaluate((s) => new Promise((res) => {
    wx.createSelectorQuery().in(getCurrentPages().slice(-1)[0]).selectAll(s).boundingClientRect()
      .exec((r) => res((r && r[0]) || []))
  }), sel)

  console.log(`读数｜那一屏 ${st.route}／语言 ${st.lang}／分类表 ${st.cats} 格／列表 ${st.rows.length} 行（带分类 ${st.rows.filter((r) => r.cat).length}、私密 ${st.rows.filter((r) => r.priv).length}）／屏宽 ${W}px${waited ? `／等了 ${waited}s` : ''}`)

  const withCat = st.rows.find((r) => r.cat && !r.priv) || st.rows.find((r) => r.cat)
  const privRow = st.rows.find((r) => r.cat && r.priv)
  const plainRow = st.rows.find((r) => r.cat && !r.priv)
  // 环境没就位与"这一台没东西可测"要分开报：前者打三行空读数就够看清，别让人去查代码。
  if (!st.lang || !st.rows.length) {
    console.log('!! 环境红：首页那一屏既没语言也没列表（IDE 刚起来还没登录完，或 9431 连到了别的工作树）——先确认再谈判据')
    process.exit(2)
  }
  ck('这一台有东西可测：至少一行带出分类那一档', !!withCat, withCat ? `第 ${withCat.k + 1} 行念「${withCat.cat}」` : '一行都没有')
  if (!withCat) { console.log('\n!! 没有带分类的行，后面全部跳过'); process.exit(1) }

  // ---------- ① 列表那一行 ----------
  const cats = await rect('.ixl-cat')
  const srcs = await rect('.ixl-src-t')
  ck('列表：分类段那枚 `<text>` 真的上了屏（数量＝带分类的行数）',
    cats.length === st.rows.filter((r) => r.cat).length, `屏上 ${cats.length} 枚／数据 ${st.rows.filter((r) => r.cat).length} 行`)
  // 屏上那几枚 `.ixl-cat` 的顺序＝"带分类的那些行"的顺序（没分类的行不画这一枚），所以按行找下标
  // 只能在同一份过滤后的名单里数，拿 `r.k` 直接当下标会串到别的行上去。
  const catIx = (row) => st.rows.filter((r) => !!r.cat).findIndex((r) => r.k === row.k)
  const firstIx = catIx(withCat)
  const catTx = cats.length ? String(await (await page.$$('.ixl-cat'))[firstIx].text() || '').trim() : ''
  ck('列表：那一档渲染成 `「分类名」·`（丙那一版：不是竖线、不是光一个名字）',
    /^「.+」·$/.test(catTx) || /^".+"·$/.test(catTx), `实得「${catTx}」`)
  // 索引对齐才敢拿这两面相减（万一某行没带分类，两面就不是同一行）
  const aligned = cats.length === st.rows.filter((r) => r.cat).length
  const gap = aligned && cats[firstIx] && srcs[withCat.k] ? srcs[withCat.k].left - cats[firstIx].right : null
  ck('列表：分类段与来源之间那道缝在屏上（gap 8rpx；源码里的空格靠不住，这里量的是面与面）',
    gap === null ? null : gapOk(gap), gap === null ? '行数不对齐，未量' : `${gap.toFixed(1)}px`)
  const rowTx = await (await page.$$('.ixl-src'))[withCat.k].text()
  ck('列表：那一行一根竖线都没有（丙不要竖线）', !/[|｜]/.test(String(rowTx)), String(rowTx).replace(/\s+/g, ' '))

  const catEls = await page.$$('.ixl-cat')
  if (plainRow) {
    const col = catEls[catIx(plainRow)] && await catEls[catIx(plainRow)].style('color')
    ck('列表：非私密那一行的分类段仍是那一档灰（红挂错地方就会在这儿红）',
      !!col && !near(rgbOf(col), RED), `第 ${plainRow.k + 1} 行量到 ${col}`)
  }
  if (privRow) {
    const j = catIx(privRow)
    const col = j >= 0 && catEls[j] ? await catEls[j].style('color') : null
    ck('列表：私密那一行的分类段＝`--priv-ink` 那一支红（只红那一段）',
      !!col && near(rgbOf(col), RED), `第 ${privRow.k + 1} 行量到 ${col}`)
    const whole = await (await page.$$('.ixl-src'))[privRow.k].style('color')
    ck('列表：私密那一行的**整行**没跟着变红（现在落的是甲；要乙说一句就换）',
      !!whole && !near(rgbOf(whole), RED), `整行量到 ${whole}`)
  } else {
    ck('列表：私密那一行——这台账号列表里没有带分类的私密笔记，这一条未量（不拿非私密冒充）', null)
    ck('列表：整行不红——同上，未量', null)
  }

  // ---------- ② 详情窗（真点一行，不手搭状态） ----------
  const rowEls = await page.$$('.ixl-row')
  await rowEls[withCat.k].tap()
  await sleep(2600)
  page = await mp.currentPage()
  const dsMeta = await page.$('.ds-meta')
  const metaTx = dsMeta ? String(await dsMeta.text() || '').replace(/\s+/g, ' ').trim() : ''
  ck('详情窗：那一行以 `「分类」·` 打头，后面才是来源与时间（丙那一版）',
    /^「.+」·.+·.+$/.test(metaTx) || /^".+"·.+·.+$/.test(metaTx), `实得「${metaTx}」`)
  const dCat = (await rect('.ds-cat'))[0]
  const dRest = (await rect('.ds-rest'))[0]
  ck('详情窗：分类段与后面那段之间那道缝在屏上（margin-right 8rpx）',
    !!dCat && !!dRest && gapOk(dRest.left - dCat.right),
    dCat && dRest ? `${(dRest.left - dCat.right).toFixed(1)}px` : '两枚没读齐')
  const dsCatEl = await page.$('.ds-cat')
  const dsCol = dsCatEl && await dsCatEl.style('color')
  const dsPriv = await mp.evaluate(() => !!(getCurrentPages().slice(-1)[0].data.detailNote || {}).is_private)
  ck('详情窗：分类段的红跟着这一篇的是否私密走',
    !!dsCol && (dsPriv ? near(rgbOf(dsCol), RED) : !near(rgbOf(dsCol), RED)),
    `这一篇${dsPriv ? '是私密（该红）' : '不是私密（不该红）'}，量到 ${dsCol}`)
  await (await page.$('.grip')).tap()
  await sleep(1200)

  // ---------- ③ 独立详情页 ----------
  await mp.navigateTo(`/pages/detail/detail?id=${withCat.id}`)
  await sleep(3200)
  page = await mp.currentPage()
  const heroEl = await page.$('.hero-meta')
  const heroTx = heroEl ? String(await heroEl.text() || '').replace(/\s+/g, ' ').trim() : ''
  ck('独立详情页：与详情窗同一版排布 `「分类」· 来源 · 时间`，且没有竖线',
    (/^「.+」·.+·.+$/.test(heroTx) || /^".+"·.+·.+$/.test(heroTx)) && !/[|｜]/.test(heroTx), `实得「${heroTx}」`)
  const hCat = (await rect('.hero-cat'))[0]
  const hRest = (await rect('.hero-rest'))[0]
  ck('独立详情页：那一枚也画出来了，与后面那段之间同样留着一道缝',
    !!hCat && !!hRest && gapOk(hRest.left - hCat.right),
    hCat && hRest ? `${(hRest.left - hCat.right).toFixed(1)}px` : '两枚没读齐')
  await mp.navigateBack()
  await sleep(1000)

  const bad = results.filter((r) => r.ok === false).length
  const skipped = results.filter((r) => r.ok === null).length
  console.log(`\n${results.length - bad - skipped} 过 / ${bad} 红 / ${skipped} 条未量 / ${results.length} 条`)
  process.exit(bad ? 1 : 0)
})().catch((e) => { console.log('!! 尺子崩：', e && e.message); process.exit(1) })
