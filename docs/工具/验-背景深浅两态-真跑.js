// 背景图深浅自动翻色的真跑自证（模拟器里真跑，不看 CSS 声明也不看源码）。
// 跑法：docs/工具/跑尺子.sh 9431 验-背景深浅两态-真跑
//
// 这一把要证的三件事，静态尺子一件都证不了：
// ① 那张图**真的被 canvas 采过一次**并且判成浅色（storage 里落下 bgLumV2_<路径> 那一枚读数；
//    前缀 V2 是因为口径换过一代：V1 采整张图平均，V2 只采字压着那一条——旧值不升前缀就不会重算）；
// ② 采样回来之后 `bgLight` 与容器上的 `bg-light` 真的跟着翻了（有类名没规则、有规则没类名
//    都是静默不生效，两边都得量渲染后的值）；
// ③ 换一张深图翻得回去，而且旧那张的缓存键被扫掉（键只增不减那条债，就在这儿钉死）。
//
// 三张探针图是项目里那三枚纯色 JPEG（docs/design/背景图深浅/探针-浅·深·中灰.jpg，
// 加权亮度分别 ≈234／≈22／≈140），按 base64 参数递进小程序、用 FileSystemManager 落到 USER_DATA_PATH——
// **不在 evaluate 里碰 `wx.createSelectorQuery()`**：实测那一趟返回时结构体克隆不了，
// 报「An object could not be cloned」（画图交给宿主文件，采样仍由生产那套 canvas 自己跑）。
// 收尾把 poster_profile 还原、探针文件与 bgLum 那批键（含旧前缀）删净，不留痕。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, 'docs/design/背景图深浅/实测')
const LIGHT_FILE = 'probe-bg-light.jpg'
const DARK_FILE = 'probe-bg-dark.jpg'
const MID_FILE = 'probe-bg-mid.jpg'
const MIX_FILE = 'probe-bg-mix.jpg'
const b64Of = (rel) => fs.readFileSync(path.join(ROOT, rel)).toString('base64')
const LIGHT_B64 = b64Of('docs/design/背景图深浅/探针-浅.jpg')
const DARK_B64 = b64Of('docs/design/背景图深浅/探针-深.jpg')
const MID_B64 = b64Of('docs/design/背景图深浅/探针-中灰.jpg')
// 上三成 230、其余 30 那一枚：全图平均 90（旧那套"整张图取平均"判它是深、留白字），
// 但字压着的那一条是 230。站长 10-12 真机那张黑白合影就是这个形状，这一枚是它的替身。
const MIX_B64 = b64Of('docs/design/背景图深浅/探针-上浅下暗.jpg')

let fails = 0
let total = 0
const ok = (name, cond, extra) => {
  total += 1
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
      if (k.indexOf('bgLum') === 0 || k === 'probe_draw') wx.removeStorageSync(k)
    })
    wx.setStorageSync('probe_profile_backup', wx.getStorageSync('poster_profile') || null)
    return true
  })

  let page = await mp.reLaunch('/pages/create/create')
  for (let i = 0; i < 8 && !(await page.$('.container')); i += 1) await sleep(1500)
  /* ① 这一条是真机反馈带出来的：「标题字竟然可以上下拖动，这个不是需求啊」。
     嫌疑是当时挂在页面里那枚 `<canvas type="2d">`——原生同层组件，真机上 `position:fixed`
     不保证把它移出流内，首屏被顶出一截就变成整页可滚。采样已改离屏，这一条钉的是
     **"首屏不许能滚"这个不变量本身**（不管以后是谁把什么东西顶出来的），模拟器量得到几何。 */
  const winH = await mp.evaluate(() => wx.getSystemInfoSync().windowHeight)
  const sz = await (await page.$('.container')).size()
  ok('① 新建页首屏不许被顶成可滚（容器高 ≤ 视口高＋2px；他真机反馈"标题能上下拖"就是这一档）',
    sz && sz.height <= winH + 2, `容器 ${sz && sz.height}／视口 ${winH}`)

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
  const wMid = await write(MID_FILE, MID_B64)
  const wMix = await write(MIX_FILE, MIX_B64)
  ok('② 浅色那张真落到本机用户目录', wLight === 'ok', wLight)
  ok('③ 深色那张真落到本机用户目录', wDark === 'ok', wDark)
  ok('③b 中灰那张真落到本机用户目录', wMid === 'ok', wMid)
  ok('③c 上浅下暗那张真落到本机用户目录', wMix === 'ok', wMix)
  if (wLight !== 'ok' || wDark !== 'ok' || wMid !== 'ok' || wMix !== 'ok') { mp.close(); process.exit(1) }

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
  for (let i = 0; i < 8 && !(await page.$('.container')); i += 1) await sleep(1500)
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
    .filter((k) => k.indexOf('bgLum') === 0)
    // V3 存的是逐行剖面（32 个数），这里那枚读数取 32 行的平均——纯色探针上它就是那张图的亮度
    .map((k) => { const pr = wx.getStorageSync(k)
      return `${k.slice(-18)}=${Math.round(pr.rows.reduce((a, b) => a + b, 0) / pr.rows.length)}` }))
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

  // ---------- 10-12 站长「范围扩展到笔记列表页和卡片列表页」：那两屏同一趟量一遍 ----------
  const ix = await mp.reLaunch('/pages/index/index')
  for (let i = 0; i < 8 && !(await ix.$('.container')); i += 1) await sleep(1500)
  await sleep(3500)
  const clsIx = String((await (await ix.$('.container')).attribute('class')) || '')
  ok('⑫ 笔记列表页那一屏容器带 bg-light（头部那两行固定字吃的是同一份翻转）',
    /bg-light/.test(clsIx), clsIx)
  await mp.screenshot({ path: path.join(OUT, '浅色-笔记列表.png') })
  const tabs = await ix.$$('.vtab')
  if (tabs && tabs[1]) { await tabs[1].tap(); await sleep(3000) }
  const clsCards = String((await (await ix.$('.container')).attribute('class')) || '')
  ok('⑬ 切到卡片列表那一屏，容器仍带 bg-light（同一份 markup，切 view 不许掉）',
    /bg-light/.test(clsCards), clsCards)
  await mp.screenshot({ path: path.join(OUT, '浅色-卡片列表.png') })
  await mp.reLaunch('/pages/create/create')
  await sleep(2500)

  // ---------- 换深那张 ----------
  await useSlot(DARK_FILE)
  page = await mp.reLaunch('/pages/create/create')
  for (let i = 0; i < 8 && !(await page.$('.container')); i += 1) await sleep(1500)
  let dark = null
  for (let i = 0; i < 12 && !dark; i += 1) {
    const d = await page.data()
    if (d && d.bgLight === false && /probe-bg-dark\.jpg$/.test(String(d.bgSrc || ''))) dark = d
    else await sleep(1000)
  }
  ok('⑧ 换深色那张之后翻回 false（不是停在上一张的判断上）', !!dark)
  const keysAfter = await mp.evaluate(() => (wx.getStorageInfoSync().keys || [])
    .filter((k) => k.indexOf('bgLum') === 0))
  ok('⑨ 旧那张的缓存键被扫掉（键只增不减那条债已还）',
    (keysAfter || []).length === 1, JSON.stringify(keysAfter))
  const clsDark = String((await (await page.$('.container')).attribute('class')) || '')
  ok('⑩ 深色那一态容器不带 bg-light', !/bg-light/.test(clsDark), clsDark)
  await mp.screenshot({ path: path.join(OUT, '深色那张.png') })
  await mp.reLaunch('/pages/me/me')
  await sleep(4000)
  await mp.screenshot({ path: path.join(OUT, '深色-我的.png') })

  /* ⑭⑮ 10-12 那两行固定字的深色态图证（浅那两张在 ⑫⑬ 那一段）。
     这两屏要的是**产物**：`量-两态字色.py` 拿这四张（列表／卡片 × 浅／深）加「我的」那两张，
     量未选中那几枚的字心灰阶，深态必须比浅态那两档更实。只看类名的话，
     "有类名没规则"和"规则被更高优先级吃掉"这两类静默不生效都抓不到。 */
  const ixDark = await mp.reLaunch('/pages/index/index')
  for (let i = 0; i < 8 && !(await ixDark.$('.container')); i += 1) await sleep(1500)
  await sleep(3500)
  const clsDarkIx = String((await (await ixDark.$('.container')).attribute('class')) || '')
  ok('⑭ 深色那一态笔记列表页容器不带 bg-light（这两行该走整档墨那一支）',
    !/bg-light/.test(clsDarkIx), clsDarkIx)
  await mp.screenshot({ path: path.join(OUT, '深色-笔记列表.png') })
  const tabsD = await ixDark.$$('.vtab')
  if (tabsD && tabsD[1]) { await tabsD[1].tap(); await sleep(3000) }
  await mp.screenshot({ path: path.join(OUT, '深色-卡片列表.png') })

  /* ⑯ 第三张探针：加权亮度 140 的那一枚纯色图（仍判"深"，但白纱压上去之后底落到 ≈135）。
     为什么还要第三张：只有"深／浅"两张的话，这一档翻没翻**量不出来**——22 那一档的深图，
     纱底只有 93，整档墨 53 与 `.72` 那档 64 挤在一起，判据等于没牙。中灰那张把两档拉开到
     53 与 76，`量-两态字色.py` 才量得出"这两行到底跟着图翻了没有"。
     图证落在 实测/中灰-*.png，四张（列表／卡片／我的 ＋ 浅态那三张）一起交给那把量。 */
  await useSlot(MID_FILE)
  page = await mp.reLaunch('/pages/create/create')
  for (let i = 0; i < 8 && !(await page.$('.container')); i += 1) await sleep(1500)
  let mid = null
  for (let i = 0; i < 12 && !mid; i += 1) {
    const d = await page.data()
    if (d && d.bgLight === false && /probe-bg-mid\.jpg$/.test(String(d.bgSrc || ''))) mid = d
    else await sleep(1000)
  }
  ok('⑯ 中灰那张（读数 140）判在深的那一侧，且真铺上了', !!mid)
  const ixMid = await mp.reLaunch('/pages/index/index')
  for (let i = 0; i < 8 && !(await ixMid.$('.container')); i += 1) await sleep(1500)
  await sleep(3500)
  await mp.screenshot({ path: path.join(OUT, '中灰-笔记列表.png') })
  const tabsM = await ixMid.$$('.vtab')
  if (tabsM && tabsM[1]) { await tabsM[1].tap(); await sleep(3000) }
  await mp.screenshot({ path: path.join(OUT, '中灰-卡片列表.png') })
  await mp.reLaunch('/pages/me/me')
  await sleep(4000)
  await mp.screenshot({ path: path.join(OUT, '中灰-我的.png') })

  /* ⑰ 判据取的是"字压着那一条"，不是整张图平均（10-12 他真机抓到：「怎么上面标题还是浅字体？
     你的逻辑是什么」）。这张替身图上半 230／其余 30：整张平均 90，按旧逻辑判"深"、标题留纸白，
     压在那面浅墙上实测只有 1.62:1。所以这两条是这一刀的正反两面——
     ⑰ 判出来的必须是浅（标题翻墨）；⑱ 缓存里那枚读数必须是那一条的亮度（>200），
     不是全图平均（90）——这条才是"取错了对象"直接能抓到的那一枚。图证：上浅下暗-首页.png。 */
  await useSlot(MIX_FILE)
  page = await mp.reLaunch('/pages/create/create')
  for (let i = 0; i < 8 && !(await page.$('.container')); i += 1) await sleep(1500)
  let mix = null
  for (let i = 0; i < 12 && !mix; i += 1) {
    const d = await page.data()
    if (d && d.bgLight === true && /probe-bg-mix\.jpg$/.test(String(d.bgSrc || ''))) mix = d
    else await sleep(1000)
  }
  // bgLightLow 与它相反才算分档做成；上面那个循环只等 bgLight，这里再等两秒让两枚都落定
  if (mix) { await sleep(2000); mix = await page.data() }
  ok('⑰ 上浅下暗那张：上截判浅（标题翻墨）、下截判深（那行 Tips 留纸白）——两枚必须不一致',
    !!mix && mix.bgLight === true && mix.bgLightLow === false,
    `bgLight=${mix && mix.bgLight} bgLightLow=${mix && mix.bgLightLow}`)
  const mixLum = await mp.evaluate(() => (wx.getStorageInfoSync().keys || [])
    .filter((k) => k.indexOf('bgLum') === 0)
    .map((k) => { const pr = wx.getStorageSync(k)
      return `${k.slice(-16)}:行${pr.rows.length} 顶${pr.rows[0]} 底${pr.rows[pr.rows.length - 1]}` }))
  ok('⑱ 缓存里是 32 行逐行剖面（顶行 >200、底行 <100），不是一个平均数',
    /行32 顶2\d\d 底\d\d\b/.test((mixLum || [])[0] || ''), JSON.stringify(mixLum))
  await mp.screenshot({ path: path.join(OUT, '上浅下暗-首页.png') })
  /* ⑲ 同一张图换一屏也要各自算一遍：列表页的上截取盒子 0~20%（大字那一小段＝这张图的浅带），
     下截取 73%~100%（卡顶那 158 的白纱＝这张图的暗带）⇒ 这一屏该挂 bg-light、**不**挂 bg-light-low，
     那两行固定字因此走"整档墨"那一支。两枚布尔一枚有一枚无，才是"上下分别判断"落到了样式上。 */
  const ixMix = await mp.reLaunch('/pages/index/index')
  for (let i = 0; i < 8 && !(await ixMix.$('.container')); i += 1) await sleep(1500)
  await sleep(3500)
  const clsMixIx = String((await (await ixMix.$('.container')).attribute('class')) || '')
  ok('⑲ 列表页在这张图上挂 bg-light、不挂 bg-light-low（两枚各自判，不是一枚管全页）',
    /(^| )bg-light( |$)/.test(clsMixIx) && !/bg-light-low/.test(clsMixIx), clsMixIx)
  await mp.screenshot({ path: path.join(OUT, '上浅下暗-笔记列表.png') })

  // ---------- 收尾：还原 profile、清掉探针文件与键 ----------
  await mp.evaluate((files) => {
    const b = wx.getStorageSync('probe_profile_backup')
    if (b && typeof b === 'object') wx.setStorageSync('poster_profile', b)
    else wx.removeStorageSync('poster_profile')
    ;(wx.getStorageInfoSync().keys || []).forEach((k) => {
      if (k.indexOf('bgLum') === 0 || k === 'probe_profile_backup' || k === 'probe_draw') wx.removeStorageSync(k)
    })
    const fm = wx.getFileSystemManager()
    files.forEach((f) => { try { fm.unlinkSync(`${wx.env.USER_DATA_PATH}/${f}`) } catch (e) {} })
    return true
  }, [LIGHT_FILE, DARK_FILE, MID_FILE, MIX_FILE])
  const leftover = await mp.evaluate((files) => {
    const fm = wx.getFileSystemManager()
    const still = files.filter((f) => {
      try { fm.accessSync(`${wx.env.USER_DATA_PATH}/${f}`); return true } catch (e) { return false }
    })
    const keys = (wx.getStorageInfoSync().keys || []).filter((k) =>
      k.indexOf('bgLum') === 0 || k === 'probe_profile_backup' || k === 'probe_draw')
    return { files: still, keys }
  }, [LIGHT_FILE, DARK_FILE, MID_FILE, MIX_FILE])
  ok('⑪ 探针不留痕（文件、profile 备份与缓存键都清干净）',
    leftover && leftover.files.length === 0 && leftover.keys.length === 0, JSON.stringify(leftover))

  mp.close()
  console.log(fails ? `\n✗ 背景深浅两态 真跑：红 ${fails} 条` : `\n✓ 背景深浅两态 真跑：${total} 条全过`)
  process.exit(fails ? 1 : 0)
}

main().catch((e) => { console.log('!! 尺子自己崩了：' + (e && e.message)); process.exit(1) })
