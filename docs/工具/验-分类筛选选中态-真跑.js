/**
 * 一把尺子（真跑）：筛选那一枚要把"正在筛哪一格"标出来（站长 10-18 深夜）
 *   「选择笔记筛选某个分类，该分类要加下划线，字体加粗，提醒用户」
 * 这是 10-16 那句「不要加粗，不要纯黑，下划线也一样」撤掉三样之后，他自己把其中**两样**给回来：
 *   加粗与下划线回来了，**纯黑没有**（他没提 ⇒ 两支仍同一支 `--text-secondary`）。
 *
 * ⚠ 全程**零写**：只 `setData` 换 `selectedCategory`（本机的筛选态），不调 `selectCategory`、不点井格；
 *   `wx.request`／`wx.uploadFile` 被套了一层，非 GET 一律挡下并记名，最后一条钉的就是这个计数＝0。
 *
 * 跑法：docs/工具/跑尺子.sh 9431 验-分类筛选选中态-真跑
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
  await mp.switchTab('/pages/index/index')
  await sleep(4000)

  // ---------- 等逻辑层就位，且必须在**平时那一态**（管理态那一排没有「全部」，判据的对象就变了）----------
  let ready = null
  for (let i = 0; i < 12; i++) {
    ready = await mp.evaluate(() => {
      const p = getCurrentPages().slice(-1)[0]
      const d = (p && p.data) || {}
      if (d.catEdit && p._catExit) p._catExit()
      return { hasPage: !!(p && d.catView), edit: !!d.catEdit, cats: (d.categories || []).length }
    })
    if (ready && ready.hasPage && !ready.edit && ready.cats >= 1) break
    await sleep(5000)
  }
  if (!ready || !ready.hasPage || ready.edit || ready.cats < 1) {
    console.log(`!! 环境红：这一台没停在平时那一态或没有分类表（${JSON.stringify(ready)}）——不是产品红，是这一趟没起来`)
    process.exit(2)
  }

  // ---------- 记账套子：非 GET 一律挡下 ----------
  await mp.evaluate(() => {
    const w = globalThis.wx
    if (w.__zhangji) return 'already'
    w.__zhangji = 1
    w.__writes = []; w.__reads = 0
    w.__orig = { request: w.request, upload: w.uploadFile }
    w.request = (o) => {
      const m = String((o && o.method) || 'GET').toUpperCase()
      if (m === 'GET') { w.__reads += 1; return w.__orig.request(o) }
      w.__writes.push(m + ' ' + String((o && o.url) || ''))
      const bad = { errMsg: 'request:fail 尺子挡下非 GET' }
      if (o && o.fail) o.fail(bad)
      if (o && o.complete) o.complete(bad)
      return
    }
    w.uploadFile = (o) => {
      w.__writes.push('UPLOAD ' + String((o && o.url) || ''))
      const bad = { errMsg: 'uploadFile:fail 尺子挡下' }
      if (o && o.fail) o.fail(bad)
      if (o && o.complete) o.complete(bad)
      return
    }
    return 1
  })

  const page = await mp.currentPage()
  // 每一枚的类名＋它自己那枚文字节点的字重／下划线／字号（下划线挂在里层 `<text>`，所以必须量子节点）
  const shot = async () => {
    const els = await page.$$('.ix-cat')
    const texts = await page.$$('.ix-cat-t')
    const out = []
    for (let i = 0; i < els.length; i++) {
      const cls = String(await els[i].attribute('class') || '')
      out.push({
        i, on: cls.split(/\s+/).includes('on'),
        w: Number(await els[i].style('font-weight')),
        deco: String(await texts[i].style('text-decoration-line')),
        fs: String(await texts[i].style('font-size')),
        // 父节点自己不许带线：带上了就是把管理态那枚 × 一起划了一条线
        parentDeco: String(await els[i].style('text-decoration-line')),
      })
    }
    return out
  }
  const setFilter = (id) => mp.evaluate((v) => {
    getCurrentPages().slice(-1)[0].setData({ selectedCategory: v })
    return 1
  }, id)

  const s0 = await shot()
  const lit0 = s0.filter((x) => x.on)
  const unlit0 = s0.filter((x) => !x.on)
  console.log(`读数｜屏上 ${s0.length} 枚（「全部」＋${s0.length - 1} 格），此刻亮着第 ${lit0.map((x) => x.i).join('、') || '（没有）'} 枚`)

  ck('这一排恰好像一枚在筛：带 `.on` 的只有一枚（两枚同时亮＝筛选态串了）',
    lit0.length === 1 && unlit0.length >= 1, `亮 ${lit0.length}／不亮 ${unlit0.length}`)
  ck('亮那一枚加粗（≥500），不亮那几枚照旧常规（<500）——这就是他那句"提醒用户"落地的数',
    lit0.length === 1 && lit0[0].w >= 500 && unlit0.every((x) => x.w < 500),
    `亮 ${lit0.map((x) => x.w).join('、')}／不亮 ${unlit0.map((x) => x.w).join('、')}`)
  ck('亮那一枚的**文字**带下划线，不亮那几枚没有',
    lit0.length === 1 && /underline/.test(lit0[0].deco) && unlit0.every((x) => !/underline/.test(x.deco)),
    `亮「${lit0.map((x) => x.deco).join('、')}」／不亮「${unlit0.map((x) => x.deco).join('、')}」`)
  ck('反向钉：下划线挂在里层那枚 `<text>` 上、不在芯片自己身上（挂外面＝管理态那枚 × 也被划一条线）',
    s0.every((x) => !/underline/.test(x.parentDeco)), `父节点「${s0.map((x) => x.parentDeco).join('、')}」`)
  ck('这一刀没有改字号：亮与不亮是同一个字号（10-17 那句"分类字体也要小一点"仍然成立）',
    new Set(s0.map((x) => x.fs)).size === 1, `字号 ${[...new Set(s0.map((x) => x.fs))].join('、')}`)

  // ---------- 换一格筛：标记要跟着搬（钉的是"类驱动"，不是某一枚固定带线）----------
  const orig = await mp.evaluate(() => getCurrentPages().slice(-1)[0].data.selectedCategory)
  const catIds = await mp.evaluate(() => {
    const d = getCurrentPages().slice(-1)[0].data
    return (d.catView || []).filter((v) => v.key !== 'all').map((v) => ({ key: v.key, id: v.id }))
  })
  const target = catIds.filter((c) => c.id !== orig)[0]
  const beforeIdx = lit0.length === 1 ? lit0[0].i : -1
  ck('能换：这一台读得到可切过去的那一格（切不动下面几条就没有读数）', !!target && beforeIdx >= 0, JSON.stringify(target || null))
  if (target && beforeIdx >= 0) {
    await setFilter(target.id)
    await sleep(900)
    const s1 = await shot()
    const lit1 = s1.filter((x) => x.on)
    const unlit1 = s1.filter((x) => !x.on)
    ck('切到另一格之后标记**跟着搬**：新亮那一枚加粗＋带线',
      lit1.length === 1 && lit1[0].i !== beforeIdx && lit1[0].w >= 500 && /underline/.test(lit1[0].deco),
      `从第 ${beforeIdx} 枚搬到第 ${lit1.map((x) => x.i).join('、')} 枚／字重 ${lit1.map((x) => x.w).join('、')}`)
    const old = unlit1.filter((x) => x.i === beforeIdx)[0]
    ck('原来那一枚回到常规：400、无线（留着一枚固定带线＝筛选态是画上去的，不是跟着状态走的）',
      !!old && old.w < 500 && !/underline/.test(old.deco),
      `第 ${beforeIdx} 枚现在 字重 ${old ? old.w : '(还亮着)'}／线「${old ? old.deco : '(还亮着)'}」`)
    ck('同一时刻仍只有一枚亮着（搬走不留尾巴）', lit1.length === 1, `亮 ${lit1.length} 枚`)

    // ---------- 收回「全部」：那一枚也吃同一档（"没筛"也是一个身份，不是没有标记）----------
    await setFilter(null)
    await sleep(900)
    const s2 = await shot()
    const all0 = s2[0]
    ck('筛收回「全部」：那一枚吃同一档（加粗＋下划线），其余那几枚无线',
      all0 && all0.on && all0.w >= 500 && /underline/.test(all0.deco)
      && s2.slice(1).every((x) => !x.on && x.w < 500 && !/underline/.test(x.deco)),
      `「全部」字重 ${all0 ? all0.w : '?'}／线「${all0 ? all0.deco : '?'}」`)
  }

  // ---------- 收尾：筛选态**还原成开跑前那一格** + 套子拆掉 + 零写 ----------
  await mp.evaluate((v) => {
    getCurrentPages().slice(-1)[0].setData({ selectedCategory: v })
    const w = globalThis.wx
    if (w.__zhangji) { w.request = w.__orig.request; w.uploadFile = w.__orig.upload; delete w.__zhangji }
    return 1
  }, orig)
  await sleep(600)
  const end = await mp.evaluate(() => {
    const w = globalThis.wx
    const p = getCurrentPages().slice(-1)[0]
    return { writes: (w.__writes || []).slice(), edit: !!p.data.catEdit, note: p.data.catNote || '' }
  })
  ck('收尾：套子拆了、没进管理态、浮层没收着任何东西', !end.edit && !end.note, JSON.stringify(end))
  ck('全程零写：非 GET 的请求一条都没发出去（这一把不许碰现网的库）', end.writes.length === 0, end.writes.join('、') || '0 条')

  const bad = results.filter((r) => !r.ok)
  console.log(`\n${results.length - bad.length} 过 / ${bad.length} 红 / ${results.length} 条`)
  await mp.close()
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.log('!! 尺子崩：', e && e.message); process.exit(1) })
