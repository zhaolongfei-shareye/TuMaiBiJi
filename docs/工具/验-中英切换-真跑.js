// 「中／EN」那两枚切换器真点得动吗？——站长 10-13 23:3x 真机原话「切换中英文失效」。
// 静态尺子能证明那句 catchtap 挂在两枚 view 上、证明 i18n 两档都有词，证不了
// 「指头落得上去」这一件事；而这一屏恰好有一整层 `position:fixed` 的罩子与深色面板，
// 落点又只有字那么大（`--fs-meta` 那一档）。所以这一把全部真点，不 setData 假装。
//
// 三条通道分开量，红了能直接说是哪一条坏了：
//   ① 落点多大（Element 的盒子）——这一条不需要登录，模拟器量得准
//   ② 把那条 PUT 换成"必定成功"的桩，真点 → 界面换过去之后**停不停得住**（也不需要登录，
//      量的正是本地那一份写入与 `onShow` 读回这一趟；10-13 那句带 `if` 的空操作就红在这里）
//   ③ 真网络：真点 → 换不换、服务端那一栏记不记得住
//      ⚠ 模拟器这一档 `wx.login` 直接报 **41002 appid missing**（10-14 零点实测），
//        没有 token 的那一趟会话里 ③ 必然红——那是环境红，不是产品红，所以 ③ 单独记一笔，
//        不与产品红混进同一个计数（混了就把"没验到"说成了"验过了"）。
// 前置：MP_ROOT=$PWD docs/工具/跑尺子.sh 9431 验-中英切换-真跑
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const i18n = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))
const lang = require('./尺子语言钉.js')
const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)

const wxss = fs.readFileSync(P('pages/create/create.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const appWxss = fs.readFileSync(P('app.wxss'), 'utf8')
const seg = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(wxss)
  return m ? m[1] : ''
}
const num = (css, prop) => {
  const m = new RegExp(`(?:^|[;\\n])\\s*${prop}:\\s*([^;\\n]*)`).exec(css)
  if (!m) return NaN
  const v = /(-?[\d.]+)rpx/.exec(m[1])
  if (v) return Number(v[1])
  const t = /var\(--([a-z0-9-]+)\)/.exec(m[1])
  if (!t) return NaN
  const k = new RegExp(`--${t[1]}:\\s*(\\d+(?:\\.\\d+)?)rpx`).exec(appWxss)
  return k ? Number(k[1]) : NaN
}
// 字面期望值全从 i18n 现读，这把尺子里不抄第二份词表
const ZH = i18n.t('createHeading', 'zh')
const EN = i18n.t('createHeading', 'en')
// 这一屏自己那两枚的字号／内边距／下划线，用来算"不扩热区时落点有多大"（只为把话说清楚，不判红）
const FS_META = Number(/--fs-meta:\s*(\d+(?:\.\d+)?)rpx/.exec(appWxss)[1])
const SEG = seg('.lang-seg')
const SEG_PAD = num(SEG, 'padding')
const SEG_BORDER = num(SEG, 'border-bottom') || num(SEG, 'border')
const LINE_H = /line-height:\s*([\d.]+)(?!rpx)/.exec(SEG)
const SEG_H_DECL = Math.round((FS_META * (LINE_H ? Number(LINE_H[1]) : 1.4) + (SEG_PAD || 0) + (SEG_BORDER || 0)) * 10) / 10
// 落点下限不自己发明：这一屏「调亮度／换背景」那一行给指头的盒子就是 88（44pt），
// 站长 10-10 那句「三个Tab很难点，把按键区域扩大」之后全站按这一档收。
const SW = seg('.home-swap')
const BOX_MIN = Number(/(?:^|[;\n])\s*height:\s*(\d+)rpx/.exec(SW)[1])
// 两枚之间那道缝（他要的"两段纯文字＋一条下划线"那一版里就是 20）——落点为什么扩不到 88 要说得出数
const GAP_TXT = num(seg('.lang-switch'), 'gap')
if (!Number.isFinite(BOX_MIN) || !Number.isFinite(FS_META)) {
  console.log('✗ 从源码读不出落点下限（.home-swap 那一档盒子）：', BOX_MIN, FS_META)
  process.exit(1)
}

const bad = []
const ck = (name, cond, got) => {
  console.log(`${cond ? '✓' : '✗'} ${name}${got === undefined ? '' : `　→ ${got}`}`)
  if (!cond) bad.push(name)
}

;(async () => {
  let mp, lastErr
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { lastErr = e; await sleep(12000) }
  }
  if (!mp) {
    console.log('✗ 连不上自动化端口，最后一次的报错原文：', lastErr && lastErr.message)
    process.exit(1)
  }
  let page
  for (let i = 0; i < 6; i++) {
    try {
      page = await mp.reLaunch('/pages/create/create')
      await sleep(2500)
      if (await page.$('.home-blk')) break
      page = null
    } catch (e) { page = null }
    await sleep(3000)
  }
  if (!page) { console.log('✗ 进不去 /pages/create/create'); process.exit(1) }

  const langBefore = await lang.read(mp)
  await lang.pin(mp, 'zh')
  page = await mp.reLaunch('/pages/create/create')
  await sleep(2500)

  // 把这一趟的报错与吐司收进一个数组：红的时候要说得出为什么红，别只说"没换"。
  // ⚠ 序列化必须自己写：`console.error('登录失败:', err)` 里那个 err 是 wx.request 的 fail 对象
  //   （{errMsg:'login:fail …'}）或一个 Error，直接 String() 会打成 `[object Object]`——
  //   10-13 第一次跑就是被这四个字挡住，看不出是"网络没通"还是"通了但后面那一刀抛了"。
  await mp.evaluate(() => {
    const ser = (x) => {
      if (x === null || x === undefined) return String(x)
      if (typeof x === 'string') return x
      const o = { errMsg: x.errMsg, message: x.message, statusCode: x.statusCode }
      if (x.data !== undefined) o.detail = typeof x.data === 'string' ? x.data : (x.data && x.data.detail)
      if (x.errMsg || x.message || x.statusCode || o.detail) return JSON.stringify(o)
      try { return JSON.stringify(x) } catch (e) { return Object.prototype.toString.call(x) }
    }
    const g = getApp()
    g.__langProbe = { toasts: [], errs: [], login: [] }
    try {
      const st = wx.showToast
      wx.showToast = (o) => { g.__langProbe.toasts.push((o && o.title) || ''); return st.call(wx, o) }
    } catch (e) {}
    try {
      const ce = console.error
      console.error = function () {
        g.__langProbe.errs.push(Array.prototype.map.call(arguments, ser).join(' | '))
        return ce.apply(console, arguments)
      }
    } catch (e) {}
    // 登录这一趟单独钉：它成没成、token 落没落、抛在哪一行，全在这里看
    try {
      const dl = g._doLogin.bind(g)
      g._doLogin = function () {
        return dl().then((r) => {
          g.__langProbe.login.push({ ok: true, tokenLen: (g.globalData.token || '').length,
            logged: !!g.globalData.isLoggedIn, lang: (g.globalData.userInfo || {}).language })
          return r
        }, (e) => {
          g.__langProbe.login.push({ ok: false, err: ser(e), tokenLen: (g.globalData.token || '').length,
            logged: !!g.globalData.isLoggedIn })
          throw e
        })
      }
    } catch (e) {}
    return true
  })
  const probe = () => mp.evaluate(() => ({
    toasts: (getApp().__langProbe || {}).toasts || [],
    errs: (getApp().__langProbe || {}).errs || [],
    login: (getApp().__langProbe || {}).login || [],
  }))
  const sess = () => mp.evaluate(() => ({
    tokenLen: (getApp().globalData.token || '').length,
    logged: !!getApp().globalData.isLoggedIn,
    lang: (getApp().globalData.userInfo || {}).language,
  }))

  const geo = () => mp.evaluate(() => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    q.selectAll('.lang-seg').boundingClientRect()
    q.select('.title-row').boundingClientRect()
    q.exec((r) => resolve({ segs: r[0] || [], row: r[1] }))
  }))
  const win = await mp.systemInfo()
  const R = win.windowWidth / 750
  const toRpx = (v) => Math.round(v / R * 10) / 10

  // ---------- ① 落点：两枚在不在屏上、多大 ----------
  const g0 = await geo()
  ck('首屏那两枚切换器在屏上（中／EN）', g0.segs.length === 2, JSON.stringify(g0.segs.map((s) => toRpx(s.width) + '×' + toRpx(s.height))))
  const boxes = g0.segs.map((s) => ({ w: toRpx(s.width), h: toRpx(s.height), top: toRpx(s.top), right: toRpx(s.right) }))
  const smallest = boxes.reduce((a, b) => (Math.min(b.w, b.h) < Math.min(a.w, a.h) ? b : a), boxes[0] || { w: 0, h: 0 })
  ck(`两枚的落点都够指头按（每边 ≥${BOX_MIN}rpx，与「调亮度／换背景」那一行的盒子同档）`,
    boxes.length === 2 && boxes.every((b) => b.h >= BOX_MIN && b.w >= BOX_MIN),
    `实测最小那枚 ${smallest.w}×${smallest.h}　（CSS 算出来那一档 ≈${SEG_H_DECL}rpx 高）`
    + `　已知红：横向要到 ${BOX_MIN} 就得把两枚之间那 ${GAP_TXT} 的缝让掉一半以上，那是他拍过的几何 ⇒ 挂成待拍 D21`)
  ck('两枚都落在标题那一行里、没被别的层盖住（顶线在行内）',
    !!g0.row && boxes.every((b) => b.top >= toRpx(g0.row.top) - 1 && b.right <= win.windowWidth / R + 1),
    g0.row ? `行 ${toRpx(g0.row.top)}~${toRpx(g0.row.bottom)}，两枚顶 ${boxes.map((b) => b.top).join('/')}` : '读不到 .title-row')

  // ---------- ② 先量"不需要登录"的那半条：本地那一份写入 + onShow 读回 ----------
  // 为什么要有这一节：模拟器这一趟 `wx.login` 直接报 41002（下面 ③ 那三条因此是环境红，
  // 不是产品红），而站长那一条「切换中英文失效」的成因里有一条**与网络无关**——
  // `onSwitchLang` 里那句带 `if` 的本地写入是空操作，紧跟其后的 `onShow()` 又从同一个地方
  // 把语言读回中文。这一节把那条 PUT 换成"必定成功"的桩，专门量这一段：界面换过去之后
  // **必须停得住**，三秒后弹回中文就是那条 `if` 回来了。
  const env = []
  const sk = (name, cond, got, why) => {
    if (why) { console.log(`! ${name}　→ 环境红，不计产品账：${why}`); env.push(name); return }
    ck(name, cond, got)
  }
  // 桩打在**最下面那一层**：`require('/utils/api.js')` 在 evaluate 的模块作用域里取不到
  // （10-14 实测报 "module '/utils/api.js' is not defined"），而 `wx.request` 是 api.js 每次
  // 现取的属性，替它就行。success 与 complete 都要发完——少发一个，这一趟就永远悬着（旧坑）。
  const stub = (on) => mp.evaluate((want) => {
    if (want) {
      if (!wx.__realRequest) wx.__realRequest = wx.request
      wx.request = (o) => {
        const url = String((o && o.url) || '')
        const lang2 = ((o && o.data) || {}).language
        if (o && o.method === 'PUT' && /\/api\/user\/language$/.test(url)) {
          wx.__stubbedLang = (wx.__stubbedLang || []).concat(lang2)
          const res = { statusCode: 200, data: { language: lang2 }, header: {}, cookies: [] }
          setTimeout(() => o.success && o.success(res), 120)
          setTimeout(() => o.complete && o.complete(res), 160)
          return
        }
        return wx.__realRequest.call(wx, o)
      }
      return true
    }
    if (wx.__realRequest) wx.request = wx.__realRequest
    return true
  }, on)
  await mp.evaluate(() => {
    const g = getApp()
    g.__langProbe = g.__langProbe || { toasts: [], errs: [], login: [] }
    return true
  })
  await stub(true)
  await lang.pin(mp, 'zh')
  page = await mp.reLaunch('/pages/create/create')
  await sleep(2500)
  const segsS = await page.$$('.lang-seg')
  await segsS[1].tap()
  await sleep(1200)
  const dS = await page.data()
  const tS = await page.$('.page-title')
  ck('把那条 PUT 换成成功的桩，真点 EN 之后屏上换成英文',
    dS.lang === 'en' && (!tS || (await tS.text()) === EN),
    `lang=${dS.lang}　屏上「${tS ? await tS.text() : ''}」`)
  await sleep(3000)
  const dS2 = await page.data()
  const sS = await sess()
  ck('并且**停得住**（三秒后不许被 onShow 读回中文——那句带 if 的本地写入就是这一条的成因）',
    dS2.lang === 'en' && sS.lang === 'en',
    `三秒后 lang=${dS2.lang}　globalData.userInfo.language=${sS.lang}`)

  // ---------- ③ 真网络：真点右边那枚 ----------
  await stub(false)
  // ② 那一节把这一屏留在了英文上，这里先把起点摆回中文再往下量（不然第一条就是假红）。
  await lang.pin(mp, 'zh')
  page = await mp.reLaunch('/pages/create/create')
  await sleep(2500)
  const segs = await page.$$('.lang-seg')
  ck('automator 拿得到这两枚的句柄', segs.length === 2, String(segs.length))
  const d0 = await page.data()
  ck('起点是中文', d0.lang === 'zh' && d0.t.createHeading === ZH, `${d0.lang}｜${d0.t && d0.t.createHeading}`)
  const before = await probe()
  const s0 = await sess()
  const NO_SESSION = s0.tokenLen === 0
  console.log(`　这一趟会话起手：token ${s0.tokenLen} 个字符、isLoggedIn=${s0.logged}、userInfo.language=${s0.lang}`)
  if (NO_SESSION) {
    const why = ((await probe()).login.slice(-1)[0] || {}).err || '没有登录态'
    console.log(`　!! 模拟器这一趟登录没成（${why}）⇒ 下面三条要真网络，记环境红、不记产品红`)
  }
  await segs[1].tap()
  await sleep(2500)
  const d1 = await page.data()
  const p1 = await probe()
  sk('真点右边那枚 EN，这一屏的 lang 真的换成 en（走真的那条 PUT）', d1.lang === 'en',
    `lang=${d1.lang}　吐司=${JSON.stringify(p1.toasts.slice(before.toasts.length))}　报错=${JSON.stringify(p1.errs.slice(before.errs.length))}　登录=${JSON.stringify(p1.login)}`,
    NO_SESSION ? '这一趟没有 token，那条 PUT 必然 401' : '')
  const t1 = await page.$('.page-title')
  const shown = t1 ? await t1.text() : ''
  sk('屏上那行大标题跟着换成英文（词从 i18n 现读）', shown === EN, `屏上「${shown}」，期望「${EN}」`,
    NO_SESSION ? '同上' : '')

  // ---------- ④ 服务端那一栏真记住了 ----------
  const server = await mp.evaluate(() => new Promise((resolve) => {
    const app = getApp()
    const snap = (ok) => {
      const L = (app.__langProbe || {}).login || []
      resolve({ ok, 那一趟: L[L.length - 1] || '(没记上)',
        lang: (app.globalData.userInfo || {}).language, tokenLen: (app.globalData.token || '').length })
    }
    app.globalData.loginPromise = null
    app._doLogin().then(() => snap(true), (e) => snap(false))
  }))
  sk('重新登录一次，服务端回来的 language 就是 en（换设备还是这一门）',
    server.ok && server.lang === 'en', JSON.stringify(server),
    NO_SESSION ? '这一趟模拟器连登录都没成，服务端那一栏无从谈起' : '')

  // ---------- ⑤ 往返：仍用那一把成功的桩（量的是"换得回来"，不是网络） ----------
  await stub(true)
  // ③ 在没有登录态的那一趟里换不动（那是环境红），往返这一条不能从"已经是中文"起步——
  // 那样点「中」会被 `key === this.data.lang` 直接挡回去，判据绿得没有意义。先真点回英文。
  const sEn = await page.$$('.lang-seg')
  await sEn[1].tap()
  await sleep(2000)
  const dMid = await page.data()
  console.log(`　往返起点摆回英文：lang=${dMid.lang}`)
  const segs2 = await page.$$('.lang-seg')
  await segs2[0].tap()
  await sleep(2500)
  const d3 = await page.data()
  const t3 = await page.$('.page-title')
  ck('真点左边那枚「中」换得回来（往返不留半程）', d3.lang === 'zh' && (!t3 || (await t3.text()) === ZH),
    `lang=${d3.lang}　屏上「${t3 ? await t3.text() : ''}」`)
  await stub(false)
  await lang.pin(mp, langBefore)
  await mp.close()
  const tail = env.length ? `　另有 ${env.length} 条环境红（模拟器没有登录态那三条）` : ''
  console.log(bad.length ? `\n✗ ${bad.length} 条红：${bad.join('、')}${tail}` : `\n✓ 全过${tail}`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.log('✗ 尺子自己挂了：', e && e.stack || e); process.exit(1) })
