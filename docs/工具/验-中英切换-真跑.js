// 「中／EN」那一枚角标真点得动吗？——站长 10-13 23:3x 真机原话「切换中英文失效」。
// 10-15 01:4x 他把那**两枚**（`.lang-switch` 里两枚 `.lang-seg`，一边一个词）并成**一枚**：
// 「变成 中和EN切换，只显示其中一个。显示待切换」⇒ 屏上现在是右上角那一枚 `.lang-corner`，
// 里面写的就是"点下去会换成的那一门"（中文态显示 EN、英文态显示 中），`data-key` 同一个条件。
// 静态尺子能证明那句 `catchtap` 挂在这枚 view 上、证明 i18n 两档都有词，证不了
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
const PAL = require(path.resolve(__dirname, '../../miniprogram/utils/palette.js'))
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
// ⚠ 10-14 22:4x 站长把大标题拆成两行（`.page-title` 里两枚 `.pt-l`），10-15 01:4x 又把它整枚换成
// **一张透明底的图片字**（「中英文不影响，都只显示图片」）⇒ 两门共用同一张图，屏上读不到文字了，
// 而字典里那两个键仍在渲染里（那一枚的 `aria-label` ＝ 两行连起来，见 `create.wxml:58`）。
// 所以"大标题跟着换语言"这一条今天只能量到**读屏那一份**：期望值仍是字典那两行连起来（不抄字面量），
// 拿 `aria-label` 逐字比。图自己两门同一张 ⇒ 另一发判据是「切来切去 `src` 不许变」。
/* 期望值走**页面同一扇门** `texts(lang)`：它是 `Object.assign({}, zh, dict)`，en 那一档留的空串会真盖成空；
   而 `t(key,lang)` 写的是 `dict[key] || zh[key] || key`——空串是 falsy，会被中文那一句顶回来。
   ⇒ 屏上只有一行（页面走 texts），判据按两行算（走 t）就是尺子自己红，不是屏红（10-14 23:5x 实测到这一条）。 */
const headLine = (l) => {
  const d = i18n.texts(l)
  return (String(d.createHeading || '') + String(d.createHeading2 || '')).trim()
}
const ZH_SHOWN = headLine('zh')
const EN_SHOWN = headLine('en')
// 这一屏「调亮度／换背景」那一行给指头的盒子，用来把角标的落点说成一句有参照的话（只为把话说清楚，不判红）
const FS_META = Number(/--fs-meta:\s*(\d+(?:\.\d+)?)rpx/.exec(appWxss)[1])
const CORNER = seg('.lang-corner')
const CORNER_FS = num(CORNER, 'font-size')
const CORNER_LINE = /line-height:\s*([\d.]+)/.exec(CORNER)
const CORNER_PB = num(CORNER, 'padding-bottom') || 0
const CORNER_BD = num(CORNER, 'border-bottom') || 0
const CORNER_H_DECL = Math.round((FS_META * (CORNER_LINE ? Number(CORNER_LINE[1]) : 1.4) + CORNER_PB + CORNER_BD) * 10) / 10
// 落点下限不自己发明：这一屏「调亮度／换背景」那一行给指头的盒子就是 88（44pt），
// 站长 10-10 那句「三个Tab很难点，把按键区域扩大」之后全站按这一档收。
const SW = seg('.home-swap')
const BOX_MIN = Number(/(?:^|[;\n])\s*height:\s*(\d+)rpx/.exec(SW)[1])
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
    q.selectAll('.lang-corner').boundingClientRect()
    q.select('.ai-line').boundingClientRect()
    q.exec((r) => resolve({ segs: r[0] || [], row: r[1] }))
  }))
  const win = await mp.systemInfo()
  const R = win.windowWidth / 750
  const toRpx = (v) => Math.round(v / R * 10) / 10

  // ---------- ① 落点：那一枚在不在屏上、多大 ----------
  const g0 = await geo()
  ck('首屏那一枚语言角标在屏上，而且**只有一枚**（他要的是"只显示其中一个"，两枚＝旧的 `.lang-seg` 复活）',
    g0.segs.length === 1, JSON.stringify(g0.segs.map((s) => toRpx(s.width) + '×' + toRpx(s.height))))
  const boxes = g0.segs.map((s) => ({ w: toRpx(s.width), h: toRpx(s.height), top: toRpx(s.top), right: toRpx(s.right) }))
  const one = boxes[0] || { w: 0, h: 0 }
  // 这一条原来是"两枚都 ≥88rpx"，那是 D21 那两条路（扩／不扩）的账。并成一枚之后落点更小，
  // 但它挂在整行最右、行本身可点（`.ai-line` 那一行）——**不改成"看着绿"的判据，改成如实报数**，
  // 要不要给这一枚单独垫到 88 仍归 D21 拍（#122），这里不自己拍。
  console.log(`　落点实测 ${one.w}×${one.h}rpx（对照：「调亮度」那一行的盒子 ${BOX_MIN}rpx；`
    + `CSS 里这一枚字号 ${CORNER_FS}、算出来那一档 ≈${CORNER_H_DECL}rpx 高）→ 落点要不要单独垫到 ${BOX_MIN}＝待拍 D21`)
  ck('那一枚落在最上面那一行里、没被别的层盖住（顶线在行内、右缘不出视口）',
    !!g0.row && one.top >= toRpx(g0.row.top) - 1 && one.right <= win.windowWidth / R + 1,
    g0.row ? `行 ${toRpx(g0.row.top)}~${toRpx(g0.row.bottom)}，角标顶 ${one.top}、右 ${one.right}` : '读不到 .ai-line')

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
  const cS = await page.$('.lang-corner')
  ck('中文态那一枚写的就是待切换的那一门（屏上那两个字是「EN」）',
    !!cS && String(await cS.text()) === 'EN', cS ? await cS.text() : '(摸不到)')
  if (!cS) {
    // 后面每一条都要点它，摸不到就别再往下量（往下量出来的一片红是尺子的，不是产品的）。
    await stub(false); await lang.pin(mp, langBefore); await mp.close()
    console.log('\n✗ 那一枚角标不在屏上 ⇒ 后面全是空跑，不装绿')
    process.exit(1)
  }
  // 他 10-15 14:0x 那三样（撤下划线／撤加粗／前面加小黄点）在**屏上**真的生效了吗？
  // 静态那把只证 markup 挂着、源码里那两行删了；"类名点空、补的那层没挂上带 inline 的那层"
  // 这一类静默失效只有计算样式读得出来（`改一层皮的十三种静默失效` 那条清单里的第 2、4 项）。
  const rgbOf = (s) => (String(s).match(/\d+/g) || []).map(Number).slice(0, 3)
  const WANT_DOT = [1, 3, 5].map((i) => parseInt(PAL.TIP_DOT.slice(i, i + 2), 16))
  const dotS = await page.$('.lang-dot')
  // `Element.size()` 是**不带参数**的，返回 `{width, height}`（automator/out/Element.js 里
  // `size(){const[e,t]=await this.domProperty(["offsetWidth","offsetHeight"]);…}`）。
  // 写成 `size('width')` 不报错、只把那个对象丢进 `Number(...)` ⇒ 永远 NaN，红得像"点没画出来"。
  const ds = dotS ? await dotS.size() : null
  ck('前面那枚小黄点在屏上真有一块面（宽高都不为 0，不是个空标签）',
    !!ds && Number(ds.width) > 0 && Number(ds.height) > 0 && Number(ds.width) === Number(ds.height),
    ds ? `${ds.width}×${ds.height}` : '(摸不到 .lang-dot)')
  ck('它的底色就是 palette 那支 TIP_DOT——色走 style 出口发下来，屏上实读同一个 rgb',
    !!dotS && rgbOf(await dotS.style('background-color')).join(',') === WANT_DOT.join(','),
    dotS ? `${await dotS.style('background-color')}／期望 rgb(${WANT_DOT.join(', ')})` : '(摸不到)')
  const cw = Number(rgbOf(await cS.style('border-bottom-width'))[0])
  const cfw = await cS.style('font-weight')
  ck('那一条下划线在屏上真的没宽度了（撤的是现读的那一层，不是源码少一行）',
    cw === 0, `border-bottom-width=${cw}`)
  ck('那一枚也不再加粗（屏上实读的字重不是 700／bold）',
    !/700|800|900|bold/i.test(String(cfw)), `font-weight=${cfw}`)
  await cS.tap()
  await sleep(1200)
  const dS = await page.data()
  const tS = await page.$('.page-title')
  ck('把那条 PUT 换成成功的桩，真点那一枚之后屏上换成英文（大标题的读屏话术跟着字典走）',
    dS.lang === 'en' && String(await tS.attribute('aria-label')) === EN_SHOWN,
    `lang=${dS.lang}　aria＝「${tS ? await tS.attribute('aria-label') : ''}」　期望「${EN_SHOWN}」`)
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
  const segs = await page.$$('.lang-corner')
  ck('automator 拿得到那一枚的句柄', segs.length === 1, String(segs.length))
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
  await segs[0].tap()
  await sleep(2500)
  const d1 = await page.data()
  const p1 = await probe()
  sk('真点那一枚角标，这一屏的 lang 真的换成 en（走真的那条 PUT）', d1.lang === 'en',
    `lang=${d1.lang}　吐司=${JSON.stringify(p1.toasts.slice(before.toasts.length))}　报错=${JSON.stringify(p1.errs.slice(before.errs.length))}　登录=${JSON.stringify(p1.login)}`,
    NO_SESSION ? '这一趟没有 token，那条 PUT 必然 401' : '')
  const t1 = await page.$('.page-title')
  const shown = t1 ? String(await t1.attribute('aria-label')) : ''
  sk('大标题那一枚读屏话术跟着换成英文（词从 i18n 现读；图片两门同一张，文字撤了）',
    shown === EN_SHOWN, `aria＝「${shown}」，期望「${EN_SHOWN}」`,
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
  // ⚠ 并成一枚之后，"点左边那枚／点右边那枚"这个说法没有了——这一枚是**开关**，点一下就翻到对面。
  //   第一版照旧写"先点一次摆回英文"，结果 ③ 已经把这屏换成英文了，那一下反而翻回中文，
  //   下面两条一起红（红的就是这一发的假设，不是屏）。⇒ 起点按 data 里那一枚真值决定，不猜。
  const flipTo = async (want) => {
    for (let i = 0; i < 4; i += 1) {
      if ((await page.data()).lang === want) return true
      const n = await page.$('.lang-corner')
      if (!n) return false
      await n.tap()
      await sleep(2000)
    }
    return (await page.data()).lang === want
  }
  const atEn = await flipTo('en')
  const dMid = await page.data()
  const gEn = await page.$('.lang-corner')
  console.log(`　往返起点（按屏上真值定的）：lang=${dMid.lang}　那一枚此刻写的是「${gEn ? await gEn.text() : ''}」`)
  ck('摆到英文这一档才往下量（翻不动就是这一枚点不动，红得有名字）', atEn && dMid.lang === 'en', `lang=${dMid.lang}`)
  // 「显示待切换」的另一半：英文态那一枚自己就该写「中」（旧的两枚版没有这一发，
  // 因为两枚都常驻；并成一枚之后这就是它唯一能被量到的语义，不补一条就没人守着）。
  ck('英文态那一枚跟着翻成「中」（同一枚、两个方向都只写待切换那一门）',
    !!gEn && String(await gEn.text()) === '中', gEn ? await gEn.text() : '(摸不到)')
  const atZh = await flipTo('zh')
  const d3 = await page.data()
  const t3 = await page.$('.page-title')
  ck('真点那一枚换得回中文（往返不留半程）',
    atZh && d3.lang === 'zh' && String(await t3.attribute('aria-label')) === ZH_SHOWN,
    `lang=${d3.lang}　aria＝「${t3 ? await t3.attribute('aria-label') : ''}」`)
  await stub(false)
  await lang.pin(mp, langBefore)
  await mp.close()
  const tail = env.length ? `　另有 ${env.length} 条环境红（模拟器没有登录态那三条）` : ''
  console.log(bad.length ? `\n✗ ${bad.length} 条红：${bad.join('、')}${tail}` : `\n✓ 全过${tail}`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.log('✗ 尺子自己挂了：', e && e.stack || e); process.exit(1) })
