// 左上角那枚书法位图"铺到全局"的真跑尺子（连模拟器，量屏上那一枚，不读源码）。
// 前置：docs/工具/跑尺子.sh 9431 验-全局品牌位图-真跑
//
// 静态那把（`验-全局品牌位图`）钉的是"文件里挂没挂"，这一把钉的是**画没画出来**：
// 站长 10-16 夜这一句改的是四屏的同一格，而"源码写对、渲染不对"正是这一类改版最容易漏的
// （10-10 那一轮左块宽度算成 0，屏上什么都没有，源码里三个数却一个没错）。
// 所以这里四屏各量三件事：① 那一枚的帧（宽＝228rpx、高按位图纵横比 0.492 等比走）；
// ② 它有没有压到同一屏的邻居（笔记页右上角那两枚数字、「我的」那枚 MIND、外观设置页下面那句提示）；
// ③ 最顶上那一栏念的是不是"搬走之前那行字"——这一条只能把 `wx.setNavigationBarTitle` 在
//    appservice 里包一层记账再读实参（拿 i18n 文件推是推不出"这一屏此刻切到哪一档"的）。
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '../..')
const PORT = process.env.APORT || '9431'
const SHOT_DIR = path.join(ROOT, 'docs/design/10-16全局品牌位图/实测')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const unwrap = (r) => (r && typeof r === 'object' && 'result' in r ? r.result : r)

let pass = 0
const fails = []
function ok(name, cond, extra) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ' —— ' + (extra || '')}`)
  if (cond) pass += 1; else fails.push(name)
}

const I18N = require(path.join(ROOT, 'miniprogram/utils/i18n.js'))
const SRC = '/assets/title-heading.png'
const W = 228
const RATIO = 0.492          // 源件 500×246，mode=widthFix ⇒ 高＝宽×0.492

;(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  let mp
  let lastErr = ''
  for (let i = 0; i < 12; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }); break } catch (e) {
      lastErr = String((e && e.message) || e); await sleep(10000)
    }
  }
  if (!mp) {
    console.log('!! 连不上自动化端口（这是环境红，不是判据红）先跑 cli auto')
    console.log('   最后一次报错原文：' + lastErr)
    process.exit(1)
  }
  // 冷启动头十几秒 appservice 还没接电话，任何 evaluate/data 读数都会抛 ⇒ 先轮询两道
  for (let i = 0; i < 40; i += 1) {
    try {
      const n = await mp.evaluate(() => {
        const a = getApp()
        return a && a.globalData && a.globalData.token ? a.globalData.token.length : 0
      })
      if (unwrap(n) > 100) break
    } catch (e) { /* 还没起来，继续等 */ }
    await sleep(3000)
  }
  const lang = unwrap(await mp.evaluate(() => {
    const a = getApp(); return a && a.globalData ? a.globalData.userInfo && a.globalData.userInfo.language : ''
  })) || 'zh'
  console.log(`账号语言那一档读回来是 ${JSON.stringify(lang)}（截图上的中文/英文以此为准，不假设）`)

  // 导航条标题：把 `wx.setNavigationBarTitle` 包一层记账再放行（这台工具没有别的口子能读实参）
  await mp.evaluate(() => {
    const w = wx
    if (w.__navRaw) return
    w.__navRaw = w.setNavigationBarTitle
    w.__nav = []
    w.setNavigationBarTitle = (o) => { w.__nav.push(String((o && o.title) || '')); return w.__navRaw(o) }
  })
  const navLast = async () => {
    const a = await mp.evaluate(() => (wx.__nav && wx.__nav.length) ? wx.__nav[wx.__nav.length - 1] : '')
    return unwrap(a)
  }

  const R = (await mp.systemInfo()).windowWidth / 750
  const q = (px) => px / R
  const retry = async (fn, times = 6) => {
    for (let i = 0; i < times; i += 1) { try { return await fn() } catch (e) { await sleep(1500) } }
    return null
  }
  const go = async (url) => {
    for (let i = 0; i < 5; i += 1) {
      try { await mp.switchTab(url) } catch (e) { try { await mp.reLaunch(url) } catch (e2) { /* 换下一页再试 */ } }
      await sleep(2500)
      const cur = await mp.currentPage()
      if (cur && (cur.path || '').indexOf(url.replace(/^\//, '')) >= 0) return cur
    }
    throw new Error(`进不去 ${url}（导航类环境红，不是判据红）`)
  }
  // 渲染层轮询：喂完导航要等图真在屏上，否则后面量的几何是上一帧的
  const mark = async (page, sel) => {
    for (let i = 0; i < 24; i += 1) {
      const el = await retry(() => page.$(sel))
      if (el) {
        const s = await retry(() => el.size()); const o = await retry(() => el.offset())
        if (s && o) return { w: parseFloat(s.width), h: parseFloat(s.height), left: parseFloat(o.left), top: parseFloat(o.top) }
      }
      await sleep(500)
    }
    return null
  }

  /* 站长 10-16 夜第二句把范围收窄成"只在有背景图那一态"⇒ 这里只量那两屏（笔记列表／卡片列表
     同一屏的两个 view ＋「我的」两档）。分类页与外观设置页（pages/wallpaper）**不铺**（那两屏没有背景照片那一态），
     由静态那把 `验-全局品牌位图` 的负面清单钉住；无图那一态回到纯文字，也在静态那把钉。 */
  const SCREENS = [
    { key: '笔记列表', url: '/pages/index/index', sel: '.h1', tab: true, shot: '1-笔记列表.png' },
    { key: '卡片列表', url: '/pages/index/index', sel: '.h1', tab: true, cards: true, shot: '2-卡片列表.png' },
    { key: '我的·设置', url: '/pages/me/me', sel: '.h1', tab: true, shot: '3-我的设置.png' },
    { key: '我的·关于', url: '/pages/me/me', sel: '.h1', tab: true, about: true, shot: '4-我的关于.png' },
  ]

  for (const s of SCREENS) {
    if (s.tab) await go(s.url)
    else { try { await mp.navigateTo(s.url) } catch (e) { await go(s.url) } }
    await sleep(2500)
    const page = await mp.currentPage()
    if ((page.path || '').indexOf(s.url.replace(/^\//, '')) < 0) {
      ok(`${s.key}：真的站在这一屏（导航没落定就读＝给上一帧打分）`, false, `屏是 ${page.path}`)
      continue
    }
    if (s.cards) {
      /* 真点那一枚分类条上的「笔记卡片」，不用 setData 喂 `view`：
         尺子往屏上喂列表/状态只有两条路——走真入口，或 automator 侧的 page.setData。
         这里有更真的那条可走（这一屏本来就有这枚 tab），就别拿替身打分。 */
      const tabs = await page.$$('.vtab')
      if (tabs[1]) { await tabs[1].tap(); await sleep(2000) }
      const v = unwrap(await retry(() => page.data('view')))
      ok(`${s.key}：真点分类条那一枚才切得过去（屏上 view=${JSON.stringify(v)}）`, v === 'cards', String(v))
    }
    if (s.about) {
      await page.callMethod('onTab', { currentTarget: { dataset: { key: 'about' } } }); await sleep(1500)
    }
    const el0 = await retry(() => page.$(s.sel))
    const src = el0 ? unwrap(await retry(() => el0.attribute('src'))) : ''
    const f = await mark(page, s.sel)
    ok(`${s.key}：左上角真画出了那枚位图（src 就是首屏那张正本）`, src === SRC, `src ${JSON.stringify(src)}`)
    ok(`${s.key}：屏上宽 ${f ? q(f.w).toFixed(1) : '—'}rpx ＝ 228、高 ${f ? q(f.h).toFixed(1) : '—'}rpx 按位图纵横比等比走（不是方盒子、也没被 flex 压扁）`,
      !!f && Math.abs(q(f.w) - W) <= 3 && Math.abs(q(f.h) - W * RATIO) <= 4,
      f ? `${q(f.w).toFixed(1)}×${q(f.h).toFixed(1)}` : '屏上摸不到那一枚')
    ok(`${s.key}：左沿落在这一页自己的对齐线上（±6rpx；位图自己带一段留白，不拿它去对首屏那 −17）`,
      !!f && Math.abs(q(f.left)) >= 20 && Math.abs(q(f.left)) <= 46, f ? `左沿 ${q(f.left).toFixed(1)}rpx` : '')
    const nav = await navLast()
    const want = s.key === '卡片列表' ? I18N.t('notesHeading', lang)
      : s.key === '我的·关于' ? I18N.t('pillAbout', lang)
      : s.key === '我的·设置' ? I18N.t('pillSettings', lang)
      : s.key === '笔记列表' ? I18N.t('notesHeading', lang)
      : s.key === '分类页' ? I18N.t('categories', lang)
      : I18N.t('wallpaper', lang)
    ok(`${s.key}：最顶上那一栏念的是"搬走之前那行字"（期望值从字典现读，不抄字面量）`,
      nav === want, `屏上 ${JSON.stringify(nav)}／期望 ${JSON.stringify(want)}`)
    await retry(() => mp.screenshot({ path: path.join(SHOT_DIR, s.shot) }))
    if (!s.tab) await mp.navigateBack().catch(() => {})
  }

  /* ---------- 邻居：这一枚比原来那行字高，最容易撞的就是同一屏右上角那两坨 ---------- */
  await go('/pages/index/index')
  let page = await mp.currentPage()
  const f1 = await mark(page, '.h1')
  const st = await retry(() => page.$('.stats'))
  if (f1 && st) {
    const o = await st.offset(); const sz = await st.size()
    ok('笔记页：这一枚的右沿没顶到右上角那两枚数字（两张脸不许叠）',
      f1.left + f1.w <= parseFloat(o.left) + 1, `图右沿 ${q(f1.left + f1.w).toFixed(1)}／数字左沿 ${q(parseFloat(o.left)).toFixed(1)}rpx`)
  } else ok('笔记页：这一枚的右沿没顶到右上角那两枚数字（两张脸不许叠）', false, '两枚之一没摸到')
  await go('/pages/me/me')
  page = await mp.currentPage()
  const f2 = await mark(page, '.h1')
  const sc = await retry(() => page.$('.score'))
  if (f2 && sc) {
    const o = await sc.offset()
    ok('「我的」：这一枚的右沿没顶到右上角那枚 MIND 数字',
      f2.left + f2.w <= parseFloat(o.left) + 1, `图右沿 ${q(f2.left + f2.w).toFixed(1)}／数字左沿 ${q(parseFloat(o.left)).toFixed(1)}rpx`)
  } else ok('「我的」：这一枚的右沿没顶到右上角那枚 MIND 数字', false, '两枚之一没摸到（数字没读回来时整块不占位，那条是产品行为）')

  /* ---------- 深浅翻色：铺了深色图才反白；无图态与浅图态都不许反 ----------
     ⚠ `el.style('filter')` 这台工具不一定给计算值（已知 `white-space`／`overflow` 一律回 null）。
     所以这一发分两层：能读到 `filter` 就读它（那是屏上真正生效的东西），读不到就退回读
     **闸门本身**（容器 class 里 `has-bg` 与 `bg-light` 那两枚在不在），并在报告里写明读的是哪一层——
     不许把"读不到"当成"没生效"报成产品红。 */
  await go('/pages/index/index')
  page = await mp.currentPage()
  const d = await page.data()
  const cont = await page.$('.container')
  const contCls = cont ? String(await cont.attribute('class')) : ''
  const el = await page.$('.h1')
  const fl = el ? String(await el.style('filter')) : '(摸不到)'
  const readable = /invert|none/.test(fl)
  const wantInvert = !!d.bgSrc && !d.bgLight
  if (readable) {
    ok(`笔记页（bgSrc=${d.bgSrc ? '有' : '无'}、bgLight=${d.bgLight}）⇒ 屏上 filter 该是 ${wantInvert ? 'invert(1)' : '不反色'}`,
      wantInvert ? /invert\(1\)/.test(fl) : !/invert/.test(fl), `屏上 filter ${fl}`)
  } else {
    ok(`笔记页翻色闸门（这台工具读不到 filter 计算值，退而读容器 class）：has-bg ${d.bgSrc ? '在' : '不该在'}、bg-light ${d.bgSrc && d.bgLight ? '在' : '不该在'}`,
      /(^|\s)has-bg(\s|$)/.test(contCls) === !!d.bgSrc
      && /(^|\s)bg-light(\s|$)/.test(contCls) === !!(d.bgSrc && d.bgLight),
    `容器 class ${contCls.slice(0, 120)}`)
    console.log(`     （读不到的那条读数原文：filter = ${fl}）`)
  }

  console.log(`\n截图在 ${SHOT_DIR}`)
  // 收尾把替身摘掉：这台 IDE 长驻，不还原会吃掉后面几把尺子的导航
  await mp.evaluate(() => { if (wx.__navRaw) { wx.setNavigationBarTitle = wx.__navRaw; delete wx.__navRaw; delete wx.__nav } }).catch(() => {})
  console.log(`${fails.length ? '✗' : '✓'} 全局品牌位图 真跑：${pass}/${pass + fails.length} 过${fails.length ? '　红：' + fails.join('；') : ''}`)
  process.exit(fails.length ? 1 : 0)
})().catch((e) => { console.log('!! 尺子挂了 ' + (e && e.stack || e)); process.exit(1) })
