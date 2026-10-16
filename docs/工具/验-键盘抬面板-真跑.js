// 键盘抬面板这条链的真跑自证：站长 10-16 真机报「输入文字输入框，原文翻译那一行被输入框遮挡了，
// 所以要抬高」。微信默认那套 adjust-position 只保证**光标**露出来，光标在框里 ⇒ 框露了、
// 框底下那行「原文翻译」与右滑那一枚还压在键盘底下。这一把钉的就是改完之后那四件事：
//   ① 录入面板与背后那层玻璃面抬的是**同一个量**（只抬一层会把面板推出玻璃面之外）；
//   ② 抬量等于「键盘高 − 面板本来就压在键盘里的那 152rpx ＋ 8 呼吸」，不是整个键盘高；
//   ③ 「原文翻译」那一行与右滑那一枚都落在键盘上沿**之上**（这才是他报的那一条被修掉）；
//   ④ 键盘收回之后几何**原样回到基线**（不留悬空残态）。
// 模拟器不会真弹键盘，所以这里直接 callMethod 打那个事件进去——走的是真 handler，
// 连"扣 152rpx"那条算式一起量，不是拿 setData 硬摆一个数。
// 前置：docs/工具/跑尺子.sh 9431 验-键盘抬面板-真跑
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const lang = require('./尺子语言钉.js')

const bad = []
const ck = (name, cond, got) => {
  console.log(`${cond ? '✓' : '✗'} ${name}${got === undefined ? '' : `　→ ${got}`}`)
  if (!cond) bad.push(name)
}

;(async () => {
  // 期望值从源码现读，不在这把尺子里抄第二份表
  const wxss = fs.readFileSync(P('pages/create/create.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const dock = /(?:^|\n)\.container\.entry-dock \.entry-wrap\s*\{([^}]*)\}/.exec(wxss)
  const DOCK_BOTTOM = dock ? Number(/bottom:\s*([\d.]+)rpx/.exec(dock[1])[1]) : NaN
  const liftRule = /(?:^|\n)\.container\.kb-up \.entry-wrap,\s*\n?\.container\.kb-up \.stage-panel\s*\{([^}]*)\}/.exec(wxss)
  const wxml = fs.readFileSync(P('pages/create/create.wxml'), 'utf8')
  if (!Number.isFinite(DOCK_BOTTOM) || !liftRule) {
    console.log('✗ 读不出期望值：entry-wrap 的 bottom 或 .kb-up 那条规则不在', DOCK_BOTTOM, !!liftRule)
    process.exit(1)
  }
  console.log(`　从源码读到：entry-wrap bottom ${DOCK_BOTTOM}rpx；.kb-up 那条规则在`)

  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) { console.log('连不上自动化端口，先跑 cli auto'); process.exit(1) }
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
  if (!page) { console.log('✗ 进不去 /pages/create/create（模拟器没渲染出来），重跑一次'); process.exit(1) }
  const langBefore = await lang.read(mp)
  await lang.pin(mp, 'zh')

  const win = await mp.systemInfo()
  const px = (v) => (v * win.windowWidth) / 750
  const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 2 : tol)
  // 量视图层算出来的盒子（`boundingClientRect` 吃 transform），不是读 CSS 声明。
  // 用 mp.evaluate + createSelectorQuery 这一套：这台工具不认子选择器，一枚一枚 select 才拿得到。
  const geo = (sels) => mp.evaluate((list) => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    list.forEach((s) => { q.select(s).boundingClientRect() })
    q.exec((r) => resolve(list.map((s, i) => (r[i] ? {
      top: r[i].top, bottom: r[i].bottom, h: r[i].height, w: r[i].width, left: r[i].left,
    } : null))))
  }), sels)

  // ---- 站长 10-16 追加那三句的账：「默认不抬，保持切换tab时候，高度一样，只是点击输入框时候抬」。
  // 所以先把三档**都不聚焦**走一遍：位移必须处处 0，卡子的高度与落点必须三档一模一样
  // （切 tab 不许把面板撑高或挪位置——那是"展开"那条链的事，这一把钉的是它不许跟着 tab 漂）。
  const sweep = {}
  for (const tab of ['photo', 'url', 'write']) {
    await page.setData({ active: tab, bodyFocus: false, writeBody: '', urlInput: '', previewImages: [] })
    await page.callMethod('_sync')
    await sleep(600)
    const g = await geo(['.entry-wrap'])
    const dd = await page.data()
    sweep[tab] = { h: g[0] && g[0].h, top: g[0] && g[0].top, lift: dd.kbLift, panelOpen: dd.panelOpen }
  }
  console.log('　三档都不聚焦：' + JSON.stringify(sweep))
  ck('默认不抬：三档的位移全是 0（面板还沉在 bottom 152 那一档）',
    Object.values(sweep).every((s) => s.lift === 0), JSON.stringify(Object.values(sweep).map((s) => s.lift)))
  ck('切 tab 高度一样：三档卡子等高',
    sweep.photo && sweep.url && sweep.write && near(sweep.photo.h, sweep.url.h) && near(sweep.url.h, sweep.write.h),
    `照片 ${sweep.photo.h}｜链接 ${sweep.url.h}｜文字 ${sweep.write.h}`)
  ck('切 tab 落点也一样（不许哪一档自己往上挪）',
    near(sweep.photo.top, sweep.url.top, 2) && near(sweep.url.top, sweep.write.top, 2),
    `照片 ${sweep.photo.top}｜链接 ${sweep.url.top}｜文字 ${sweep.write.top}`)

  // 进「文字」那一档的展开态：聚焦就是这一档唯一的展开理由
  await page.setData({ active: 'write', bodyFocus: true, writeBody: '', previewImages: [], urlInput: '' })
  await page.callMethod('_sync')
  await sleep(900)
  let d = await page.data()
  ck('展开态在（框换成两行那一档；「原文翻译」那枚 10-16 起常驻框外那一行，不再算展开态的东西）',
    d.panelOpen === true && d.kbLift === 0, JSON.stringify([d.panelOpen, d.kbLift]))
  const sw = await page.$('.wr-sw')
  const lab = await page.$('.wr-sw-lab')
  ck('「原文翻译」那一行渲染出来了（不是只有节点在、字是空的）',
    !!sw && !!lab && (await lab.text()) === '原文翻译', lab ? await lab.text() : '(没这枚字)')
  // 这一枚现在坐在**框外那一行**里：它跟着那一行与面板一起抬，所以这一把它量的还是它。
  // 位置本身（落在面板顶之上）由 `验-统一录入条-真跑` 的 E6b 钉，这里不重复钉。

  const SELS = ['.entry-wrap', '.stage-panel', '.wr-sw', '.sld']
  const base = await geo(SELS)
  ck('四枚都量得到（.entry-wrap／.stage-panel／.wr-sw／.sld）', base.every(Boolean), JSON.stringify(base.map(Boolean)))
  if (!base.every(Boolean)) { await lang.pin(mp, langBefore); mp.close(); process.exit(1) }

  // ---- 键盘进来：打一个真高度进真 handler（iOS 中文键盘常见 300～336px，这里取 300）----
  const KB = 300
  await page.callMethod('onKeyboardHeight', { detail: { height: KB } })
  await sleep(700)                       // 过渡 .22s，留足
  d = await page.data()
  const want = Math.round(KB - px(DOCK_BOTTOM)) + 8
  ck('kbLift 落在「键盘高 − 压在键盘里的那 152rpx ＋ 8」这一档', d.kbLift === want, `${d.kbLift}｜期望 ${want}`)
  const lifted = await geo(SELS)
  const dWrap = base[0].top - lifted[0].top
  const dPane = base[1].top - lifted[1].top
  ck('面板与背后那层玻璃抬的是同一个量', near(dWrap, dPane, 2), `entry-wrap ${dWrap.toFixed(1)}｜stage-panel ${dPane.toFixed(1)}`)
  ck('抬量就是 kbLift（渲染出来的位移，不是 CSS 声明）', near(dWrap, want, 2), `${dWrap.toFixed(1)}｜${want}`)
  const kbTop = win.windowHeight - KB
  ck('「原文翻译」那一行整行落在键盘上沿之上', lifted[2].bottom <= kbTop + 1, `行底 ${lifted[2].bottom.toFixed(1)}｜键盘上沿 ${kbTop}`)
  ck('右滑那一枚也落在键盘上沿之上', lifted[3].bottom <= kbTop + 1, `底 ${lifted[3].bottom.toFixed(1)}｜键盘上沿 ${kbTop}`)
  ck('抬起来之后展开态没被收回（框还是两行那一档）', lifted[0].h === base[0].h, `${base[0].h}→${lifted[0].h}`)

  // ---- 键盘收回：几何必须原样回基线 ----
  await page.callMethod('onKeyboardHeight', { detail: { height: 0 } })
  await sleep(700)
  d = await page.data()
  ck('键盘收回后 kbLift 归零', d.kbLift === 0, d.kbLift)
  const back = await geo(SELS)
  ck('四枚的落点全部回到基线（不留悬空残态）',
    base.every((b, i) => near(b.top, back[i].top, 2)),
    JSON.stringify(base.map((b, i) => +(b.top - back[i].top).toFixed(1))))

  // ---- 「链接」那一档的输入框：它同样撤了 adjust-position（改成自算），所以必须一起量。
  // 不量这一条就是"只把报的那一档修好、另一档悄悄撤了默认避让"。
  await page.setData({ active: 'url', bodyFocus: false, urlInput: '' })
  await page.callMethod('_sync')
  await sleep(600)
  const urlBase = await geo(['.entry-wrap', '.field'])
  await page.callMethod('onKeyboardHeight', { detail: { height: KB } })
  await sleep(700)
  const urlLift = await geo(['.entry-wrap', '.field'])
  const du = urlBase[0].top - urlLift[0].top
  ck('链接那一档点输入框，抬的是同一个量', near(du, want, 2), `${du.toFixed(1)}｜${want}`)
  ck('链接那一行也整行落在键盘上沿之上', urlLift[1].bottom <= kbTop + 1,
    `行底 ${urlLift[1].bottom.toFixed(1)}｜键盘上沿 ${kbTop}`)
  await page.callMethod('onKeyboardHeight', { detail: { height: 0 } })
  await sleep(700)
  const urlBack = await geo(['.entry-wrap', '.field'])
  ck('链接那一档键盘收回后回基线', near(urlBase[0].top, urlBack[0].top, 2),
    `${urlBase[0].top}→${urlBack[0].top}`)

  // ---- 抬的闸本身：容器上那一档类、内联里那一枚变量，都得是"真挂上了"而不是靠 CSS 猜。
  // 上面那条位移判据已经反向钉过"变量没定义 ⇒ 位移 0"（10-16 那根刺正是这样现身的）。
  await page.callMethod('onKeyboardHeight', { detail: { height: KB } })
  await sleep(700)
  const cls = await (await page.$('.container')).attribute('class')
  ck('容器上挂着 kb-up 这一档（抬的闸在，不靠 CSS 猜）', /\bkb-up\b/.test(cls || ''), cls)
  const st = await (await page.$('.container')).attribute('style')
  ck(`内联 style 里那枚 --kb 就是 ${want}px`, new RegExp(`--kb:\\s*${want}px`).test(st || ''), st)
  // 10-16 这一刀钉的是根因本身：`skinPanel` 那串末尾**没有分号**，所以把 `--kb` 拼在它后面会被
  // 粘成上一条变量的值（自定义属性能吞下几乎任意一串 token），变量压根没定义、位移恒 0。
  // 判据只有一句：`--kb` 前面必须是「串首」或「分号」，它才是一条独立声明。
  const kbAt = (st || '').indexOf('--kb:')
  ck('--kb 自己是一条独立声明（前面只能是串首或分号，不能是空格）',
    kbAt === 0 || (st || '')[kbAt - 1] === ';',
    kbAt < 0 ? '(串里没有 --kb)' : (kbAt === 0 ? '就在串首' : `前一个字符「${st[kbAt - 1]}」`))
  await page.callMethod('onKeyboardHeight', { detail: { height: 0 } })
  await sleep(700)
  const cls2 = await (await page.$('.container')).attribute('class')
  ck('键盘不在时 kb-up 与 --kb 一起撤下（不留一条恒挂的位移）', !/\bkb-up\b/.test(cls2 || ''), cls2)

  await lang.pin(mp, langBefore)
  console.log('')
  console.log(bad.length ? `✗ 键盘抬面板 真跑：${bad.length} 条红：${bad.join('｜')}` : `✓ 键盘抬面板 真跑：全过（抬量 ${want}px，两层同量，那两枚落在键盘之上）`)
  mp.close()
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('脚本崩：', e && e.stack || e); try { mp.close() } catch (_) {} process.exit(1) })
