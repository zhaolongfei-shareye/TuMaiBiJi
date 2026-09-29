// 首页背景图这一批的真跑自证：在模拟器里真点、真读 data、真截图，最后把改过的存储还原回去。
// 三条链路都要落地：没设形象→站长那张；设了形象→用户那张（这就是"和卡片模板打通"）；开关→不铺图。
// 前置：微信开发者工具已开，跑过 cli close 再 cli auto --auto-port 9431（改过 WXSS 必须先 close）。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-首页背景图-真跑.js
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/人像背景/实测')
// 1×1 纯红 PNG。落进用户文件目录冒充"用户在卡片模板页挑的那张图"，
// 省掉相册选择器（模拟器里那个面板点不动），又能从像素上认出铺的确实是它。
const RED_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
const DEFAULT_BG = '/assets/home-bg-portrait.jpg'
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
  const readKey = (k) => mp.evaluate((key) => {
    const v = wx.getStorageSync(key)
    return v === '' || v === undefined ? '(空)' : JSON.stringify(v)
  }, k)

  // 先记下这一台模拟器原来的形象设置，探针结束时原样还回去
  const profileBefore = await readKey('poster_profile')
  const offBefore = await readKey('home_bg_off')

  // ---------- ① 没设形象：铺包里那张站长人像 ----------
  await mp.evaluate(() => { wx.removeStorageSync('home_bg_off'); wx.removeStorageSync('poster_profile') })
  let page = await enter('/pages/create/create')
  await sleep(4000)
  let d = await page.data()
  ck('没设形象时 bgSrc 是站长那张', d.bgSrc === DEFAULT_BG, d.bgSrc)
  ck('容器带上了 has-bg', (d.themeClass + ' has-bg').includes('has-bg') && !!d.bgSrc)
  ck('铺了 <image> 节点', (await page.$$('.page-bg')).length === 1)
  ck('铺了压暗罩', (await page.$$('.page-scrim')).length === 1)
  // 几何：图铺满整个视口、三块压在图之上（automator 的 Element 没有 boundingBox，走 selectorQuery）
  const rects = await mp.evaluate(() => new Promise((resolve) => {
    wx.createSelectorQuery().select('.page-bg').boundingClientRect()
      .select('.entry-wrap').boundingClientRect()
      .select('.page-scrim').boundingClientRect()
      .exec((r) => resolve(r.map((x) => x ? { y: (x.y === undefined ? x.top : x.y), h: x.height, w: x.width, raw: JSON.stringify(x) } : null)))
  }))
  const [bg, cards, scrim] = rects
  ck('图铺满视口宽', !!bg && bg.w >= 370, bg && `${bg.w}px`)
  ck('压暗罩和图同尺寸', !!bg && !!scrim && scrim.h === bg.h && scrim.w === bg.w,
    bg && scrim && `${scrim.w}x${scrim.h} vs ${bg.w}x${bg.h}`)
  ck('三块压在罩之上、整组落在下巴以下', !!cards && !!bg && Number(cards.y) > bg.h * 0.48,
    cards && `卡顶 ${cards.y} / 视口 ${bg.h}`)
  ck('三块底边不压住底栏（底栏占视口最下 64px）', !!cards && !!bg && (cards.y + cards.h) <= bg.h - 64,
    cards && `块底 ${Math.round(cards.y + cards.h)}，底栏顶 ${bg.h - 64}`)
  await mp.screenshot({ path: `${OUT}/实测-1-默认站长人像.png` })

  // ---------- ② 设了形象：铺用户那张（和卡片模板同一张图） ----------
  const userImg = await mp.evaluate((b64) => {
    const p = `${wx.env.USER_DATA_PATH}/probe-user-bg.png`
    wx.getFileSystemManager().writeFileSync(p, b64, 'base64')
    const prof = wx.getStorageSync('poster_profile') || {}
    prof.avatarPath = p
    wx.setStorageSync('poster_profile', prof)
    return p
  }, RED_PNG)
  page = await enter('/pages/create/create')
  await sleep(4000)
  d = await page.data()
  ck('设过形象后 bgSrc 换成用户那张', d.bgSrc === userImg, d.bgSrc)
  await mp.screenshot({ path: `${OUT}/实测-2-用用户的形象.png` })
  // ---------- ②b 展开录入条：整块贴底，换背景那一行让位 ----------
  // 09-28 起展开态不再是"回到标题下面"，而是 fixed 贴底（bottom 152rpx）：窗口不动，
  // 只换肚子里的内容。所以这里量的是"块底还压不压底栏"，不再是"块顶有没有抬到 120 以上"。
  await (await page.$('.bar')).tap()
  await sleep(1200)
  const openRect = await mp.evaluate(() => new Promise((resolve) => {
    wx.createSelectorQuery().select('.entry-wrap').boundingClientRect()
      .select('.page-bg').boundingClientRect()
      .select('.home-swap').boundingClientRect()
      .exec((r) => resolve(r.map((x) => x ? { y: (x.y === undefined ? x.top : x.y), h: x.height } : null)))
  }))
  ck('展开后整块贴底，底边不压住底栏',
    !!openRect[0] && !!openRect[1] && (openRect[0].y + openRect[0].h) <= openRect[1].h - 64,
    openRect[0] && openRect[1] && `块底 ${Math.round(openRect[0].y + openRect[0].h)}，底栏顶 ${openRect[1].h - 64}`)
  ck('展开时换背景那一行整个不渲染（不跟底栏抢位置）',
    openRect[2] === null || openRect[2].h === 0,
    openRect[2] && openRect[2].h ? `还在，块顶 ${Math.round(openRect[2].y)}、高 ${openRect[2].h}` : '')
  await mp.screenshot({ path: `${OUT}/实测-2b-展开让位.png` })
  await (await page.$('.title-row')).tap()   // 点条以外的空白收起，回到常态
  await sleep(900)

  // ---------- ③ 换图入口只有一个：首页那枚「换背景」导流到卡片模板页 ----------
  // 09-30 站长把外观设置里那一节整块撤了（图本来就和卡片形象同一个来源，
  // 不该有第二个门，也不给"关掉背景"这个状态）。
  page = await enter('/pages/wallpaper/wallpaper')
  await sleep(4000)
  ck('外观设置里那一节真的没了', (await page.$$('.bg-cell')).length === 0)
  const wd = await page.data()
  ck('页面数据里也不再挂开关状态', wd.bgOn === undefined && wd.bgThumb === undefined)
  await mp.screenshot({ path: `${OUT}/实测-3-外观设置没有背景图那一节.png` })

  page = await enter('/pages/create/create')
  await sleep(4000)
  d = await page.data()
  ck('首页一直铺着图（没有"关掉"这条路）', !!d.bgSrc, d.bgSrc || '(空)')
  await (await page.$('.home-swap')).tap()
  await sleep(2500)
  const now = await mp.currentPage()
  ck('点「换背景」落在卡片模板页', now.path === 'pages/profile/profile', now.path)
  await mp.screenshot({ path: `${OUT}/实测-4-换图入口在卡片模板页.png` })
  await mp.navigateBack().catch(() => {})
  await sleep(800)

  // ---------- ④ 还原这台模拟器的状态 ----------
  await mp.evaluate((profileRaw, offRaw) => {
    wx.removeStorageSync('poster_profile')
    wx.removeStorageSync('home_bg_off')
    try { wx.getFileSystemManager().unlinkSync(`${wx.env.USER_DATA_PATH}/probe-user-bg.png`) } catch (e) {}
    if (profileRaw && profileRaw !== '(空)') wx.setStorageSync('poster_profile', JSON.parse(profileRaw))
    if (offRaw && offRaw !== '(空)') wx.setStorageSync('home_bg_off', JSON.parse(offRaw))
  }, profileBefore, offBefore)
  page = await enter('/pages/create/create')
  await sleep(3500)
  d = await page.data()
  ck('还原后回到干净状态（默认那张、开着）', d.bgSrc === DEFAULT_BG, d.bgSrc)

  await mp.close()
  console.log(bad.length ? `\n${bad.length} 条没过：${bad.join('、')}` : '\n全过')
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针异常', e); process.exit(2) })
