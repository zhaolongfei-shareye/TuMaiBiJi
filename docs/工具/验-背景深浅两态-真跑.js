// 背景图深浅自动翻色的真跑自证（模拟器里真跑，不看 CSS 声明也不看源码）。
// 跑法：docs/工具/跑尺子.sh 9431 验-背景深浅两态-真跑
//
// 这一把要证的三件事，静态尺子一件都证不了：
// ① 那张图**真的被 canvas 采过一次**并且判成浅色（storage 里落下 bgLum_<路径> 那一枚读数）；
// ② 采样回来之后 `bgLight` 与容器上的 `bg-light` 真的跟着翻了（有类名没规则、有规则没类名
//    都是静默不生效，两边都得量渲染后的值）；
// ③ 换一张深图翻得回去，而且旧那张的缓存键被扫掉（键只增不减那条债，就在这儿钉死）。
//
// 两张探针图是项目里那两枚纯色 JPEG（docs/design/背景图深浅/探针-浅·深.jpg，浅那张亮度 ≈234、
// 深那张 ≈22），按 base64 参数递进小程序、用 FileSystemManager 落到 USER_DATA_PATH——
// **不在 evaluate 里碰 `wx.createSelectorQuery()`**：实测那一趟返回时结构体克隆不了，
// 报「An object could not be cloned」（画图交给宿主文件，采样仍由生产那套 canvas 自己跑）。
// 收尾把 poster_profile 还原、探针文件与 bgLum_ 键删净，不留痕。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, 'docs/design/背景图深浅/实测')
const LIGHT_FILE = 'probe-bg-light.jpg'
const DARK_FILE = 'probe-bg-dark.jpg'
const b64Of = (rel) => fs.readFileSync(path.join(ROOT, rel)).toString('base64')
const LIGHT_B64 = b64Of('docs/design/背景图深浅/探针-浅.jpg')
const DARK_B64 = b64Of('docs/design/背景图深浅/探针-深.jpg')

let fails = 0
const ok = (name, cond, extra) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${extra ? '　→ ' + extra : ''}`)
  if (!cond) fails += 1
}

async function main() {
  let mp
  for (let i = 0; i < 3; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
    if (mp) break
  }
  if (!mp) { console.log('连不上自动化端口，先跑 cli auto'); process.exit(1) }

  await mp.evaluate(() => {
    ;(wx.getStorageInfoSync().keys || []).forEach((k) => {
      if (k.indexOf('bgLum_') === 0 || k === 'probe_draw') wx.removeStorageSync(k)
    })
    wx.setStorageSync('probe_profile_backup', wx.getStorageSync('poster_profile') || null)
    return true
  })

  let page = await mp.reLaunch('/pages/create/create')
  for (let i = 0; i < 8 && !(await page.$('#bgBrite')); i += 1) await sleep(1500)
  ok('① 新建页那枚隐藏画布真在页面树里（生产那套采样就挂在它上面）', !!(await page.$('#bgBrite')))

  // ---------- 落两张纯色探针图 ----------
  const write = (name, data) => mp.evaluate((payload) => {
    const i = payload.indexOf('|')
    const file = payload.slice(0, i)
    const to = `${wx.env.USER_DATA_PATH}/${file}`
    try {
      wx.getFileSystemManager().writeFileSync(to, payload.slice(i + 1), 'base64')
      wx.getFileSystemManager().accessSync(to)
      return 'ok'
    } catch (e) { return `fail:${e && e.message}` }
  }, `${name}|${data}`)
  const wLight = await write(LIGHT_FILE, LIGHT_B64)
  const wDark = await write(DARK_FILE, DARK_B64)
  ok('② 浅色那张真落到本机用户目录', wLight === 'ok', wLight)
  ok('③ 深色那张真落到本机用户目录', wDark === 'ok', wDark)
  if (wLight !== 'ok' || wDark !== 'ok') { mp.close(); process.exit(1) }

  const useSlot = (file) => mp.evaluate((f) => {
    const p = wx.getStorageSync('poster_profile') || {}
    const list = Array.isArray(p.images) ? p.images : []
    list[0] = { path: `${wx.env.USER_DATA_PATH}/${f}`, card: false, bg: true }
    p.images = list
    wx.setStorageSync('poster_profile', p)
    return true
  }, file)

  // ---------- 浅那一态 ----------
  await useSlot(LIGHT_FILE)
  page = await mp.reLaunch('/pages/create/create')
  for (let i = 0; i < 8 && !(await page.$('#bgBrite')); i += 1) await sleep(1500)
  let light = null
  for (let i = 0; i < 12 && !light; i += 1) {
    const d = await page.data()
    if (d && d.bgLight === true) light = d
    else await sleep(1000)
  }
  ok('④ 浅色那张铺上之后 data.bgLight 翻成 true（canvas 采样真跑回来过）', !!light)
  ok('⑤ bgSrc 就是那张探针图（不是回落包内默认那张）',
    /probe-bg-light\.jpg$/.test(String((light || {}).bgSrc || '')), String((light || {}).bgSrc))

  const lumKeys = await mp.evaluate(() => (wx.getStorageInfoSync().keys || [])
    .filter((k) => k.indexOf('bgLum_') === 0)
    .map((k) => `${k.slice(-18)}=${wx.getStorageSync(k)}`))
  const lumNum = Number(/=(\d+)$/.exec((lumKeys || [])[0] || '=0')[1])
  ok('⑥ 读数按路径落进缓存，且落在浅色那一侧（>160）',
    (lumKeys || []).length === 1 && lumNum > 160, JSON.stringify(lumKeys))

  const clsLight = String((await (await page.$('.container')).attribute('class')) || '')
  ok('⑦ 容器上真有 bg-light（类名没挂上＝那一档样式一条都不生效）', /bg-light/.test(clsLight), clsLight)
  await mp.screenshot({ path: path.join(OUT, '浅色那张.png') })
  // 「我的」那一屏也铺同一张图，头部那两行 MIND 数字同样压在图上——各留一张图证。
  await mp.reLaunch('/pages/me/me')
  await sleep(4000)
  await mp.screenshot({ path: path.join(OUT, '浅色-我的.png') })
  await mp.reLaunch('/pages/create/create')
  await sleep(2500)

  // ---------- 换深那张 ----------
  await useSlot(DARK_FILE)
  page = await mp.reLaunch('/pages/create/create')
  for (let i = 0; i < 8 && !(await page.$('#bgBrite')); i += 1) await sleep(1500)
  let dark = null
  for (let i = 0; i < 12 && !dark; i += 1) {
    const d = await page.data()
    if (d && d.bgLight === false && /probe-bg-dark\.jpg$/.test(String(d.bgSrc || ''))) dark = d
    else await sleep(1000)
  }
  ok('⑧ 换深色那张之后翻回 false（不是停在上一张的判断上）', !!dark)
  const keysAfter = await mp.evaluate(() => (wx.getStorageInfoSync().keys || [])
    .filter((k) => k.indexOf('bgLum_') === 0))
  ok('⑨ 旧那张的缓存键被扫掉（键只增不减那条债已还）',
    (keysAfter || []).length === 1, JSON.stringify(keysAfter))
  const clsDark = String((await (await page.$('.container')).attribute('class')) || '')
  ok('⑩ 深色那一态容器不带 bg-light', !/bg-light/.test(clsDark), clsDark)
  await mp.screenshot({ path: path.join(OUT, '深色那张.png') })
  await mp.reLaunch('/pages/me/me')
  await sleep(4000)
  await mp.screenshot({ path: path.join(OUT, '深色-我的.png') })

  // ---------- 收尾：还原 profile、清掉探针文件与键 ----------
  await mp.evaluate((files) => {
    const b = wx.getStorageSync('probe_profile_backup')
    if (b && typeof b === 'object') wx.setStorageSync('poster_profile', b)
    else wx.removeStorageSync('poster_profile')
    ;(wx.getStorageInfoSync().keys || []).forEach((k) => {
      if (k.indexOf('bgLum_') === 0 || k === 'probe_profile_backup' || k === 'probe_draw') wx.removeStorageSync(k)
    })
    const fm = wx.getFileSystemManager()
    files.forEach((f) => { try { fm.unlinkSync(`${wx.env.USER_DATA_PATH}/${f}`) } catch (e) {} })
    return true
  }, [LIGHT_FILE, DARK_FILE])
  const leftover = await mp.evaluate((files) => {
    const fm = wx.getFileSystemManager()
    const still = files.filter((f) => {
      try { fm.accessSync(`${wx.env.USER_DATA_PATH}/${f}`); return true } catch (e) { return false }
    })
    const keys = (wx.getStorageInfoSync().keys || []).filter((k) =>
      k.indexOf('bgLum_') === 0 || k === 'probe_profile_backup' || k === 'probe_draw')
    return { files: still, keys }
  }, [LIGHT_FILE, DARK_FILE])
  ok('⑪ 探针不留痕（文件、profile 备份与缓存键都清干净）',
    leftover && leftover.files.length === 0 && leftover.keys.length === 0, JSON.stringify(leftover))

  mp.close()
  console.log(fails ? `\n✗ 背景深浅两态 真跑：红 ${fails} 条` : '\n✓ 背景深浅两态 真跑：11 条全过')
  process.exit(fails ? 1 : 0)
}

main().catch((e) => { console.log('!! 尺子自己崩了：' + (e && e.message)); process.exit(1) })
