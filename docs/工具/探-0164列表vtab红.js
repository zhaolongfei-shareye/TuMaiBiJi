// 10-15 上午：`验-列表v19-真跑` 一条红单独重跑仍复现——未选那枚 tab 读到整档墨（该 rgba .72）。
// 这一把不判红，只把"为什么"三格读出来：这一屏到底铺的哪张图、容器上挂着哪几串类、
// `bgLightLow` 是哪极性。因为 `.vtab` 那两档是"深图那一态抬到整档墨"，
// 只要 `has-bg` 且不带 `bg-light-low`，两枚就都是整档墨——那是样式本来就该这样，不是回归。
// 跑法：MP_ROOT=… docs/工具/跑尺子.sh 9431 探-0164列表vtab红
const automator = require('miniprogram-automator')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')
  const out = {}
  for (const route of ['/pages/create/create', '/pages/index/index', '/pages/me/me']) {
    await mp.reLaunch(route)
    await sleep(5000)
    const page = await mp.currentPage()
    const d = await page.data()
    const cont = await page.$('.container')
    const cls = String((cont && (await cont.attribute('class'))) || '')
    const tabAt = async (i) => {
      const all = await page.$$('.vtab')
      return all && all[i] ? String(await all[i].style('color')) : '(摸不到)'
    }
    // ⚠ 不在这里独立重算网格：`mp.evaluate` 跑在 appservice 那一侧，没有 fs、也没有 Node 的
    //   `__dirname`，写进去只会拿到 undefined（本文件上一版就是这么留了段死代码）。
    //   要独立重算请像 `验-第一屏三块-真跑` 那样先把 storage 里的原料取回来、在 Node 这侧算。
    out[route] = {
      bgSrc: String(d.bgSrc || ''),
      hasBg: /(^|\s)has-bg(\s|$)/.test(cls),
      bgLight: !!d.bgLight, bgLightLow: !!d.bgLightLow,
      dimV: d.dimV, dimScrim: String(d.dimScrim || ''),
      containerClass: cls,
      vtab: [await tabAt(0), await tabAt(1)],
      profile: await mp.evaluate(() => JSON.stringify(wx.getStorageSync('poster_profile') || null)),
      homeOff: await mp.evaluate(() => String(wx.getStorageSync('home_bg_off'))),
      opsAsset: await mp.evaluate(() => String(wx.getStorageSync('MP_ASSET_KEY_home_bg') || '')),
    }
  }
  // 探针那张红图还在不在本机（在＝上一把尺子写完没删净，屏上就可能还指着它）
  out.probeFileStillThere = await mp.evaluate(() => {
    try {
      const s = wx.getFileSystemManager().statSync(`${wx.env.USER_DATA_PATH}/probe-user-bg.png`)
      return JSON.stringify(s.stats ? { size: s.stats.size } : s)
    } catch (e) { return '不在（' + String(e && e.message).slice(0, 40) + '）' }
  })
  console.log(JSON.stringify(out, null, 1))
  mp.close()
  process.exit(0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
