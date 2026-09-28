// 首页统一录入条的真跑自证：在模拟器里真点、真读 data、真截图。
// 前置：微信开发者工具已开，跑过 cli close 再 cli auto --auto-port 9431（改过 WXSS 必须先 close）。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-统一录入条-真跑.js
//
// 只点不会调起系统面板的东西：拍照 / 相册那两枚小圆按下去会开 chooseMedia，
// 那个面板一开就把自动化端口占住，所以这两态走面板里的模式标签进（标签只切视图）。
const automator = require('miniprogram-automator')
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

  // ---------- ③ 点条身 = 直接写 ----------
  await (await page.$('.bar')).tap()
  await sleep(1200)
  d = await page.data()
  ck('点条身进「直接写」', d.active === 'write' && d.mode === 'write', `${d.active}/${d.mode}`)
  ck('面板出来了', (await page.$$('.panel')).length === 1)
  ck('四个模式标签都在', (await page.$$('.mode')).length === 4)
  ck('当前标签是直接写', /直接写/.test((await (await page.$('.mode.on')).text()) || ''), await (await page.$('.mode.on')).text())
  ck('写那态有标题框、正文框、归类、取消、保存',
    (await page.$$('.face-input')).length === 1 && (await page.$$('.face-area')).length === 1
    && (await page.$$('.cat-row')).length === 1 && (await page.$$('.act')).length === 2)
  g = await rects(['.entry-wrap', '.panel', '.bar'])
  ck('展开后让出留白，整组回到标题下面', g[0] && g[0].top < metric.h * 0.3, g[0] && `组顶 ${Math.round(g[0].top)}`)
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
  ck('前面那枚图形跟着换成四格', d.lead === 'album', d.lead)

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
  await (await page.$('.home-swap')).tap()
  await sleep(3500)
  const now = await mp.evaluate(() => getCurrentPages().slice(-1)[0].route)
  ck('点换背景走到卡片模板那一页', now === 'pages/profile/profile', now)
  ck('换背景只是换了个页面，没有弹系统面板', await mp.evaluate(() => !!getCurrentPages().slice(-1)[0]) === true, now)

  // ---------- ⑨ 关掉背景图：那一行不该存在 ----------
  await mp.evaluate(() => wx.setStorageSync('home_bg_off', true))
  page = await enter('/pages/create/create')
  await sleep(4000)
  d = await page.data()
  ck('关掉背景后 bgSrc 是空', d.bgSrc === '', JSON.stringify(d.bgSrc))
  ck('没铺图时不渲染换背景那一行', (await page.$$('.home-swap')).length === 0)
  ck('没铺图时条还在', (await page.$$('.bar')).length === 1)
  // 落点不随背景开关变：关掉图条子也沉在同一条线上，不然就成了"上头一条、下面一片空"
  g = await rects(['.bar'])
  ck('没铺图时条子仍沉在下半屏（和铺图时同一档）',
    g[0] && Math.abs(g[0].top - bar.top) < 2, g[0] && `条顶 ${Math.round(g[0].top)}｜铺图时 ${Math.round(bar.top)}`)
  await mp.screenshot({ path: `${OUT}/实测-9-关掉背景.png` })
  await mp.evaluate(() => wx.removeStorageSync('home_bg_off'))

  // ---------- ⑩ 英文那一版 ----------
  await mp.evaluate(() => {
    const app = getApp()
    if (app.globalData.userInfo) app.globalData.userInfo.language = 'en'
  })
  page = await enter('/pages/create/create')
  await sleep(4000)
  d = await page.data()
  ck('英文条身是 Tap and jot', d.barTitle === 'Tap and jot', d.barTitle)
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

  await mp.close()
  console.log(bad.length ? `\n失败 ${bad.length} 条：\n  ✗ ` + bad.join('\n  ✗ ') : '\n真跑全过')
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
