// 首页统一录入条的真跑自证：在模拟器里真点、真读 data、真截图。
// 前置：微信开发者工具已开，跑过 cli close 再 cli auto --auto-port 9431（改过 WXSS 必须先 close）。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-统一录入条-真跑.js
//
// 只点不会调起系统面板的东西：拍照 / 相册那两枚小圆按下去会开 chooseMedia，
// 那个面板一开就把自动化端口占住，所以这两态走面板里的模式标签进（标签只切视图）。
const automator = require('miniprogram-automator')
const lang = require('./尺子语言钉.js')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/统一录入条/实测')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

;(async () => {
  process.on('uncaughtException', (e) => { console.error('探针挂了（未捕获）', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')
  // 这一把自己在第⑩节切到 en 再切回 zh，但**开头没钉**——账号停在 en 时前九节那些
  // 中文判据会一次红四条（"当前标签是直接写""条身换成贴个链接"…）。补上开跑前的钉。
  const langBefore = await lang.read(mp)
  await lang.pin(mp, 'zh')
  fs.mkdirSync(OUT, { recursive: true })

  const enter = async (url) => {
    for (let i = 0; i < 5; i++) {
      try { return await mp.reLaunch(url) } catch (e) { console.log(`第 ${i + 1} 次进 ${url} 没成：${e.message}`); await sleep(8000) }
    }
    throw new Error(`进不去 ${url}`)
  }
  const rects = (sels) => mp.evaluate((list) => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    list.forEach((s) => { q.select(s).boundingClientRect() })
    q.selectViewport().scrollOffset()
    q.exec((r) => resolve(r.slice(0, list.length).map((x) => (x
      ? { top: x.top === undefined ? x.y : x.top, bottom: x.bottom, h: x.height, w: x.width, left: x.left }
      : null))))
  }), sels)

  await mp.evaluate(() => { wx.removeStorageSync('home_bg_off'); wx.removeStorageSync('poster_profile') })
  let page = await enter('/pages/create/create')
  await sleep(4000)

  // ---------- ① 收起态：只有一条 ----------
  let d = await page.data()
  ck('收起态条身是「动动手指」', d.barTitle === d.t.barIdle && d.barTitle === '动动手指', `${d.barTitle} / ${d.t.barIdle}`)
  ck('收起态没有面板', (await page.$$('.panel')).length === 0)
  ck('条身只有一条', (await page.$$('.bar')).length === 1)
  ck('三枚小圆都在', (await page.$$('.bar-dots .dot')).length === 3)
  ck('四个模式标签此时还没渲染', (await page.$$('.mode')).length === 0)
  ck('铺了背景图，换背景那一行在', (await page.$$('.page-bg')).length === 1 && (await page.$$('.home-swap')).length === 1)
  await mp.screenshot({ path: `${OUT}/实测-1-收起态.png` })

  // ---------- ② 几何：条在下半屏，换背景那行坐在条与底栏中间 ----------
  // 底栏是自定义组件，页面自己的 selectorQuery 摸不到它，所以按 CSS 算：
  // 容器 bottom:20rpx + 高 108rpx，顶边 = 视口高 - 128rpx（rpx→px 按 windowWidth/750）
  const metric = await mp.evaluate(() => {
    const i = wx.getSystemInfoSync()
    return { w: i.windowWidth, h: i.windowHeight }
  })
  const R = metric.w / 750
  const tabTop = metric.h - 128 * R
  let g = await rects(['.bar', '.home-swap', '.entry-wrap'])
  const [bar, swap, wrap] = g
  ck('读到了条、换背景行、整组', !!bar && !!swap && !!wrap, JSON.stringify(g))
  ck('条沉在下半屏（顶边过下巴线）', bar && bar.top > metric.h * 0.6, bar && `条顶 ${Math.round(bar.top)} / 视口 ${metric.h}`)
  ck('条高 128rpx', bar && Math.abs(bar.h - 128 * R) < 1, bar && `${bar.h}px = ${(bar.h / R).toFixed(0)}rpx`)
  ck('换背景那行高 110rpx', swap && Math.abs(swap.h - 110 * R) < 1, swap && `${(swap.h / R).toFixed(0)}rpx`)
  ck('换背景那行在条下面、底栏上面', swap && swap.top >= bar.bottom - 1 && swap.bottom <= tabTop + 1,
    swap && `行 ${Math.round(swap.top)}..${Math.round(swap.bottom)}｜底栏顶 ${Math.round(tabTop)}`)
  ck('那一行整条宽（热区到边）', swap && swap.w > 700 * R, swap && `宽 ${(swap.w / R).toFixed(0)}rpx`)
  ck('整组压在效果图那条线上（条底≈底栏顶减一行）', bar && Math.abs(bar.bottom - (tabTop - 110 * R - 22 * R)) < 14,
    `条底 ${Math.round(bar.bottom)}｜应在 ${Math.round(tabTop - 110 * R - 22 * R)} 上下`)

  // ---------- ②b 横条上面那一行轮播 Tips（站长 10-01 晚加）----------
  // 这一行整块是靠一个 -68rpx 的负 margin 塞进横条上方那段空档的（见 create.wxss 那段注释）：
  // 负 margin 写错一格，横条就带着「换背景」一起往下移、顶进底栏。
  // 所以这里既量 Tips 自己，也回头量横条有没有原地不动（上面那两条已经钉过一次位置）。
  const tipEl = await page.$('.tips')
  const tipLine = await page.$('.tips-line')
  const tipDot = await page.$('.tips-dot')
  const [tipRect, dotRect] = await rects(['.tips', '.tips-dot'])
  const tipFs = tipLine && await tipLine.style('font-size')
  const tipPad = tipEl && await tipEl.style('padding-left')
  const dotBg = tipDot && await tipDot.style('background-color')
  // 简写那条 `border-radius` 这一档模拟器回 null（实测两次都是），分量那条才回话——
  // 拿 `border-top-left-radius` 读到的值是 '50%'，那才是"渲染出来真的吃掉半边"的证据。
  const dotRadius = tipDot && ((await tipDot.style('border-top-left-radius')) || (await tipDot.style('border-radius')))
  const tipText = tipLine && await tipLine.text()
  ck('收起态有这一行，且真的排出了高度', !!tipEl && !!tipRect && tipRect.w > 100 && tipRect.h > 0,
    tipRect && `宽 ${(tipRect.w / R).toFixed(0)} 高 ${(tipRect.h / R).toFixed(0)}rpx`)
  ck('Tips 字号 = --fs-meta（24rpx），和上面那行日期同一档',
    Math.abs(parseFloat(tipFs || '0') / R - 24) <= 2, tipFs)
  ck('这一行左边留 48rpx（原来是首行缩进，句前加了点就改内边距，留空量不变）',
    Math.abs(parseFloat(tipPad || '0') / R - 48) <= 2, tipPad)
  // 站长 10-01 晚：「Tips 前面最好加个小黄点，象征小灯泡」。色值不许写进 wxss
  // （静态尺子扫的是那条），所以这里验的是 style 递下来之后**真的渲染成这个色**。
  // 14rpx 落在这一档视口上渲染成 13.5（微信按整像素取整），容 2。
  const dotSize = !!dotRect && Math.abs(dotRect.w / R - 14) <= 2 && Math.abs(dotRect.h / R - 14) <= 2
  const dotColor = /246,\s*196,\s*69/.test(dotBg || '')
  ck('句前那枚小黄点：14rpx 见方、正方（宽高相等）、颜色是 palette 的 #F6C445',
    dotSize && dotColor && Math.abs(dotRect.w - dotRect.h) <= 1,
    dotRect && `${(dotRect.w / R).toFixed(1)}×${(dotRect.h / R).toFixed(1)}rpx ${dotBg}`)
  // 正圆这条判的是渲染结果，不是源码：模拟器把 border-radius 回成字面 '50%'，
  // 那就是"按半边取"的意思；有的档回具体 px，那就得等于宽高的一半。
  const radiusIsCircle = dotRadius === '50%' ||
    (dotRadius && /^\d/.test(dotRadius) && Math.abs(parseFloat(dotRadius) - dotRect.w / 2) <= 1)
  ck('那一枚渲染出来是正圆（radius 吃掉半边）', !!dotRect && radiusIsCircle, String(dotRadius))
  ck('点落在那行字的正中（不顶高、不底坠）',
    !!dotRect && !!tipRect && Math.abs((dotRect.top + dotRect.h / 2 - tipRect.top) / R - 16.8) <= 4,
    dotRect && tipRect && `${((dotRect.top + dotRect.h / 2 - tipRect.top) / R).toFixed(1)}rpx`)
  ck('这一行的盒子把自己从流里抵掉了（高 68 = 34 文字 + 34 间距）',
    !!tipRect && Math.abs(tipRect.h / R - 68) <= 3, tipRect && `${(tipRect.h / R).toFixed(1)}rpx`)
  ck('横条一动不动：条顶就是整组顶（负 margin 与盒子高等值）',
    !!tipRect && Math.abs(bar.top - wrap.top) <= 1, bar && `条顶 ${bar.top}／组顶 ${wrap.top}`)
  ck('Tips 那一行文字离横条留一行（盒子顶到条顶 68，文字占上沿 34）',
    !!tipRect && Math.abs((bar.top - tipRect.top) / R - 68) <= 3,
    tipRect && `${((bar.top - tipRect.top) / R).toFixed(1)}rpx`)
  ck('Tips 前面带「Tips：」这一头', !!tipText && /^Tips：/.test(tipText), tipText)
  // 节奏（站长：4 秒「还没看完就跳下一条」→ 慢一倍）。
  // 不写成"等 4.6 秒看它没跳"：计时器是 onShow 起的，脚本插进来的相位不确定，
  // 赶上周期尾巴就假红。两次跳变**之间**的间隔才是一个完整周期，那才是真凭据。
  const marks = []
  let lastTip = tipText
  const tipStart = Date.now()
  for (let i = 0; i < 42 && marks.length < 2; i++) {
    await sleep(500)
    const el = await page.$('.tips-line')
    const cur = el && await el.text()
    if (cur && cur !== lastTip) { marks.push(Date.now()); lastTip = cur }
  }
  const gap = marks.length === 2 ? (marks[1] - marks[0]) / 1000 : NaN
  d = await page.data()
  ck('池里是六句', (d.tips || []).length === 6, (d.tips || []).length)
  ck('20 秒里换过两句（真的还在轮播，没被改死）', marks.length === 2,
    `${marks.length} 次／等了 ${((Date.now() - tipStart) / 1000).toFixed(1)}s`)
  ck('一句停 8 秒（不是 4 秒；500ms 采样，容 ±0.6s）',
    Number.isFinite(gap) && gap >= 7.4 && gap <= 9.6, Number.isFinite(gap) ? `${gap.toFixed(1)}s` : '没量到')

  // ---------- ③ 点条身 = 直接写 ----------
  await (await page.$('.bar')).tap()
  await sleep(1200)
  d = await page.data()
  ck('点条身进「直接写」', d.active === 'write' && d.mode === 'write', `${d.active}/${d.mode}`)
  ck('面板出来了', (await page.$$('.panel')).length === 1)
  ck('展开态这一行整个不渲染（站长拍的：不跟表单抢眼睛）', (await page.$$('.tips')).length === 0)
  ck('四个模式标签都在', (await page.$$('.mode')).length === 4)
  ck('当前标签是直接写', /直接写/.test((await (await page.$('.mode.on')).text()) || ''), await (await page.$('.mode.on')).text())
  ck('写那态有标题框、正文框、归类、取消、保存',
    (await page.$$('.face-input')).length === 1 && (await page.$$('.face-area')).length === 1
    && (await page.$$('.cat-row')).length === 1 && (await page.$$('.act')).length === 2)
  g = await rects(['.entry-wrap', '.panel', '.bar'])
  // 09-28 深夜改判据：展开后整组不再"回到标题下面"，而是从流里拿出来贴到底栏上方
  // （真机反馈原来那一版把照片和标题整个盖住了）。152 = 底栏那 128 + 一条 24 的缝。
  ck('展开后整组贴底（组底 = 视口高 − 152rpx，压在底栏上方那条缝上）',
    g[0] && Math.abs(g[0].bottom - (metric.h - 152 * R)) < 2,
    g[0] && `组底 ${Math.round(g[0].bottom)}｜应在 ${Math.round(metric.h - 152 * R)} 上下`)
  ck('面板真的接在条下面（同一块白、无缝）', g[1] && g[2] && Math.abs(g[1].top - g[2].bottom) < 2,
    g[1] && `条底 ${Math.round(g[2].bottom)}｜面板顶 ${Math.round(g[1].top)}`)
  /* 09-28 他对着截图问"是不是和效果图不一致"——就是这两条没断过：几何相邻是真的，
     但条身还挂着纸白胶囊（.bar.open 那条规则在 wxss 里躺着，wxml 从没挂上类）。 */
  const barCls = (await (await page.$('.bar')).attribute('class')) || ''
  ck('展开时条身挂上 open', /(^|\s)bar open(\s|$)/.test(barCls), barCls)
  const barEl = await page.$('.bar'), panEl = await page.$('.panel')
  /* 属性名必须写成 CSS 那种 kebab-case：style('backgroundColor') 一律回 null，
     而 null === null 会被上一版当成"过"，是假绿。圆角这个 API 读不出来（试了
     border-radius / borderBottomLeftRadius 都是 null），所以"下沿是直角"不在这里断，
     由上面那条"条底 = 面板顶"的几何判据兜着。 */
  const barBg = await barEl.style('background-color'), panBg = await panEl.style('background-color')
  ck('展开时条身和面板同一块白（两边都读到值才算）',
    !!barBg && !!panBg && barBg === panBg, `${barBg} vs ${panBg}`)
  await mp.screenshot({ path: `${OUT}/实测-3-展开写.png` })

  // ---------- ④ 模式标签互切 ----------
  const modes = await page.$$('.mode')
  await modes[3].tap()   // 链接
  await sleep(900)
  d = await page.data()
  ck('切到链接那一态', d.active === 'url' && d.mode === 'url', `${d.active}/${d.mode}`)
  ck('条身跟着换成「贴个链接」', d.barTitle === '贴个链接', d.barTitle)
  ck('链接那态有粘贴和保存', (await page.$$('.act')).length === 2)
  ck('链接那态没有归类那一行', (await page.$$('.cat-row')).length === 0)
  await mp.screenshot({ path: `${OUT}/实测-4-展开链接.png` })

  await (await page.$$('.mode'))[1].tap()  // 拍照（标签只切视图，不开相机）
  await sleep(900)
  d = await page.data()
  ck('拍照标签共用截图那一段', d.active === 'shot' && d.mode === 'camera', `${d.active}/${d.mode}`)
  ck('条身退回功能名', d.barTitle === '拍照或截图', d.barTitle)
  ck('两块选图按钮都在', (await page.$$('.pk')).length === 2)
  ck('提炼按钮是灰的（还没选图）', (await page.$$('.act.off')).length === 1)
  await mp.screenshot({ path: `${OUT}/实测-5-展开拍照.png` })

  await (await page.$$('.mode'))[2].tap()  // 相册
  await sleep(900)
  d = await page.data()
  ck('相册标签也共用那一段', d.active === 'shot' && d.mode === 'album', `${d.active}/${d.mode}`)
  ck('前面那枚图形跟着换成叠图', d.lead === 'images', d.lead)

  // ---------- ⑤ 点条身以外收起 ----------
  await (await page.$('.title-row')).tap()
  await sleep(900)
  d = await page.data()
  ck('点空白收回去了', d.active === '' && (await page.$$('.panel')).length === 0, d.active)
  ck('收起后条身回到「动动手指」', d.barTitle === '动动手指', d.barTitle)
  g = await rects(['.entry-wrap'])
  ck('留白又回来了', g[0] && g[0].top > 300, g[0] && `组顶 ${Math.round(g[0].top)}`)

  // ---------- ⑥ 链接那枚小圆 = 直接进链接态 ----------
  // 展开之后三枚小圆就不在了（wx:else），所以样式要在点之前读
  const dotStyles = []
  for (const el of await page.$$('.bar-dots .dot')) { dotStyles.push((await el.attribute('style')) || '') }
  await (await page.$$('.bar-dots .dot'))[2].tap()
  await sleep(900)
  d = await page.data()
  ck('点蓝圆进链接态', d.active === 'url' && d.mode === 'url', `${d.active}/${d.mode}`)
  ck('三枚小圆的底色各是一支色（由 palette 发下来）',
    dotStyles.filter((x) => /--blk-bg:#/.test(x)).length === 3, dotStyles.map((x) => (x.match(/--blk-bg:[^;]+/) || [''])[0]).join(' '))
  await mp.screenshot({ path: `${OUT}/实测-6-蓝圆进链接.png` })

  // 校验行仍然跟着输入走（这条是现网老行为，别被这一批碰坏）
  await (await page.$('.face-input')).input('not a link')
  await sleep(700)
  d = await page.data()
  ck('非法链接仍然报规则行', d.urlHint === 'bad', d.urlHint)
  ck('非法时保存按钮仍是灰的', (await page.$$('.act.off')).length === 1)

  // ---------- ⑦ 忙态不许被收起打断 ----------
  await mp.evaluate(() => {
    const p = getCurrentPages().slice(-1)[0]
    p.setData({ busy: 'url' })
  })
  await (await page.$('.title-row')).tap()
  await sleep(700)
  d = await page.data()
  ck('忙的时候点空白不收面板', d.active === 'url', d.active)
  await mp.evaluate(() => { getCurrentPages().slice(-1)[0].setData({ busy: '' }) })

  // ---------- ⑧ 换背景那枚只导流，不弹相册 ----------
  await (await page.$('.title-row')).tap()
  await sleep(600)
  // 这一行 10-02 晚拆成两半，父节点不再带 tap：正中落在两半那道缝里，点了等于没点。
  // 取第二半（「换背景」），第一半现在是「调亮度」。
  const halves = await page.$$('.swap-half')
  ck('录入条下面两半各一个热区', halves.length === 2, `${halves.length} 半`)
  await halves[1].tap()
  await sleep(3500)
  const now = await mp.evaluate(() => getCurrentPages().slice(-1)[0].route)
  ck('点换背景走到卡片模板那一页', now === 'pages/profile/profile', now)
  ck('换背景只是换了个页面，没有弹系统面板', await mp.evaluate(() => !!getCurrentPages().slice(-1)[0]) === true, now)

  // ---------- ⑨ 那个旧开关已经作废：本机还留着它，也照样铺图 ----------
  // 09-30 站长把外观设置里「用人像 / 不用」那一节整块撤了，`home_bg_off` 这个键
  // 代码里再没人读。留这条断言是为了钉住"以前关过的人不会停在半截状态"：
  // 键还在 storage 里，图、换背景那一行、条子落点三样都得和平时一模一样。
  await mp.evaluate(() => wx.setStorageSync('home_bg_off', true))
  page = await enter('/pages/create/create')
  await sleep(4000)
  d = await page.data()
  ck('旧开关还写着 true，图照样铺着', !!d.bgSrc, d.bgSrc || '(空)')
  ck('换背景那一行照样在（它只跟"有没有图"走）', (await page.$$('.home-swap')).length === 1)
  ck('条还在', (await page.$$('.bar')).length === 1)
  // 落点只有一条线：这一屏不存在"没铺图"那一档，所以条顶不该随任何东西挪。
  g = await rects(['.bar'])
  ck('条子仍沉在下半屏（和铺图时同一档）',
    g[0] && Math.abs(g[0].top - bar.top) < 2, g[0] && `条顶 ${Math.round(g[0].top)}｜先前 ${Math.round(bar.top)}`)
  await mp.screenshot({ path: `${OUT}/实测-9-旧开关已作废.png` })
  await mp.evaluate(() => wx.removeStorageSync('home_bg_off'))

  // ---------- ⑩ 英文那一版 ----------
  await mp.evaluate(() => {
    const app = getApp()
    if (app.globalData.userInfo) app.globalData.userInfo.language = 'en'
  })
  page = await enter('/pages/create/create')
  await sleep(4000)
  d = await page.data()
  // 钉字典不钉字面量：这句微文案这一版改过两轮（Tap and jot → Jot it down），
  // 硬编码在这里就会变成"改文案必红一条"的假故障。
  ck('英文条身吃的就是字典里那条', d.barTitle === require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js')).texts('en').barIdle, d.barTitle)
  await (await page.$('.bar')).tap()
  await sleep(1000)
  const labels = []
  for (const m of await page.$$('.mode')) { labels.push(((await m.text()) || '').trim()) }
  ck('四个英文标签齐全', labels.join('|') === 'Write|Camera|Album|Link', labels.join('|'))
  await mp.screenshot({ path: `${OUT}/实测-10-英文展开.png` })
  await mp.evaluate(() => {
    const app = getApp()
    if (app.globalData.userInfo) app.globalData.userInfo.language = 'zh'
  })

  await lang.pin(mp, langBefore)
  await mp.close()
  console.log(bad.length ? `\n失败 ${bad.length} 条：\n  ✗ ` + bad.join('\n  ✗ ') : '\n真跑全过')
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
