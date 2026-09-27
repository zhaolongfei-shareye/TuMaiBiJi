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
  // ---------- ②b 展开录入条：留白必须让出来 ----------
  await (await page.$('.bar')).tap()
  await sleep(1200)
  const openRect = await mp.evaluate(() => new Promise((resolve) => {
    wx.createSelectorQuery().select('.entry-wrap').boundingClientRect()
      .select('.page-bg').boundingClientRect()
      .exec((r) => resolve(r.map((x) => x ? { y: (x.y === undefined ? x.top : x.y), h: x.height } : null)))
  }))
  ck('展开后录入条回到标题下面（留白让出来）',
    !!openRect[0] && openRect[0].y < 120, openRect[0] && `块顶 ${openRect[0].y}`)
  await mp.screenshot({ path: `${OUT}/实测-2b-展开让位.png` })
  await (await page.$('.title-row')).tap()   // 点条以外的空白收起，回到常态
  await sleep(900)

  // ---------- ③ 外观设置里那个开关 ----------
  page = await enter('/pages/wallpaper/wallpaper')
  await sleep(4000)
  let cells = await page.$$('.bg-cell')
  ck('外观设置里有两格开关', cells.length === 2, `${cells.length} 格`)
  let wd = await page.data()
  ck('进来显示"在用"', wd.bgOn === true)
  ck('缩略图画的是用户那张（不是默认）', wd.bgThumb === userImg, wd.bgThumb)
  await mp.screenshot({ path: `${OUT}/实测-3-外观设置开关.png` })
  await cells[1].tap()   // 不用
  await sleep(1200)
  wd = await page.data()
  ck('点"不用"后状态翻过去', wd.bgOn === false)
  ck('开关真的落到本机存储', (await readKey('home_bg_off')) === 'true', await readKey('home_bg_off'))
  page = await enter('/pages/create/create')
  await sleep(4000)
  d = await page.data()
  ck('关掉后首页不铺图', d.bgSrc === '' && (await page.$$('.page-bg')).length === 0, d.bgSrc || '(空)')
  await mp.screenshot({ path: `${OUT}/实测-4-关掉背景图.png` })

  // 再打开，确认能回去
  page = await enter('/pages/wallpaper/wallpaper')
  await sleep(3500)
  cells = await page.$$('.bg-cell')
  await cells[0].tap()
  await sleep(1200)
  ck('点"用人像"能开回来', (await page.data()).bgOn === true)

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
