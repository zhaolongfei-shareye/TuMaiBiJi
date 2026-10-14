// 五档彩色玻璃的**真跑**自证：在模拟器里真点首页那枚「换心情」，真读计算样式，底栏只能采像素。
// 跑法：MP_ROOT=/Users/zlfmac/Documents/TuMaiBiJi-2.2 docs/工具/跑尺子.sh 9431 验-五档彩色玻璃-真跑
// 静态那把（`验-五档彩色玻璃.js`）能钉"代码里写了什么"，钉不到这四件事：
//  ① `.mood-*` 那五块 CSS 真的挂上了容器（类名拼错、优先级被别的块压住，静态全绿屏上照样是墨）；
//  ② 计算样式里那一叠 `rgba()` 真的换成了这一档的色（`var()` 替换失败是 IACVT，静默按 unset 用）；
//  ③ 别的页跟着同色（他的原话是"其他页面有涉及毛玻璃的也用相同的颜色面板"——逐页各存一份的地方最容易漏）；
//  ④ 底栏那块面跟着换（custom-tab-bar 是组件，automator 的 page.$ 与 createSelectorQuery **都够不到**，
//     实测 .tab-bar/.tab-item 全回 null，所以这一块只能从截图上量，见 采-底栏像素.py）。
// 另外钉一条屏上才看得见的：壁纸与心情对不上账时**以壁纸为准**（换台手机不该出现"青底配一支粉玻璃"）。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const p = require('../../miniprogram/utils/palette.js')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/10-14五档彩色玻璃/实测')
const PILL = path.resolve(__dirname, '采-底栏像素.py')
const LINE = path.resolve(__dirname, '量-面板里有条线.py')
const SHADOW = path.resolve(__dirname, '量-抬起来阴影.py')
// 玻璃的闸是 `.container.has-bg`：没铺图 ⇒ 这些面根本不吃 `--glass-*`。§8.231 删了包内默认底图之后
// 这一屏可能"两级都空"，所以与 `验-背景亮度圆点-真跑` 同一处理：借一张包里还在的真位图按在屏上。
const PROBE_BG = '/assets/share-card.jpg'

const bad = []
let n = 0
const ck = (name, ok, got) => {
  n++
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const rgb = (hex) => [0, 1, 2].map((i) => parseInt(hex.replace('#', '').slice(i * 2, i * 2 + 2), 16))
// 计算样式里挑出第一组 rgba 的四个数（`background-image` 那种一长串取"第一处出现的这组三元组"）
const firstRGBA = (s) => {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/.exec(String(s || ''))
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null
}
const tripleIn = (s, want, tol) => {
  const list = String(s || '').match(/rgba?\(\s*[\d.,\s/]+\)/g) || []
  return list.some((x) => { const g = firstRGBA(x); return g && g.slice(0, 3).every((v, i) => Math.abs(v - want[i]) <= (tol === undefined ? 2 : tol)) })
}
const lumOf = (a) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('探针挂了（未处理拒绝）', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')
  fs.mkdirSync(OUT, { recursive: true })

  const enter = async (url) => {
    for (let i = 0; i < 5; i++) {
      try { return await withBg(await mp.reLaunch(url)) } catch (e) { console.log(`第 ${i + 1} 次进 ${url} 没成：${e.message}`); await sleep(8000) }
    }
    throw new Error(`进不去 ${url}`)
  }
  const withBg = async (page) => {
    const d = await page.data()
    if (d.bgSrc === undefined) return page
    if (!d.bgSrc) { await page.setData({ bgSrc: PROBE_BG }); await sleep(1200) }
    return page
  }
  const clsOf = async (page) => String(((await page.$('.container')) && (await (await page.$('.container')).attribute('class'))) || '')
  const styleOf = async (page, sel, prop) => {
    const el = await page.$(sel)
    return el ? String((await el.style(prop)) || '') : ''
  }
  const pill = (png) => JSON.parse(execFileSync('python3', [PILL, png], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))

  // 借走这台模拟器的两格本机偏好，量完原样还回去
  const before = await mp.evaluate(() => ({ mood: wx.getStorageSync('glassMood'), wp: wx.getStorageSync('wallpaperCache') }))
  await mp.evaluate(() => { wx.removeStorageSync('glassMood'); wx.removeStorageSync('wallpaperCache') })

  // ---------- ① 起点＝墨（今天那一屏），且这一屏真的铺着图 ----------
  let page = await enter('/pages/create/create')
  await sleep(4500)
  ck('这一屏铺着图（没铺图那些面不吃 `--glass-*`，下面全部结论不成立）', !!(await page.data()).bgSrc, (await page.data()).bgSrc || '(空)')
  let cls = await clsOf(page)
  ck('没有本机键时容器上是 `theme-tint-paper mood-ink`（默认态零变化的屏上证一遍）',
    /theme-tint-paper/.test(cls) && /mood-ink/.test(cls), cls)

  // ---------- ② 真点五下走满一圈：每档四项各量各的 ----------
  const MOODS = p.MOODS
  const seen = []
  const halves = await page.$$('.swap-half')
  ck('首页那一行是三半，第三半才是「换心情」', halves.length === 3, `${halves.length} 半`)
  const mood = halves[2]
  for (let i = 0; i < MOODS.length; i++) {
    const want = MOODS[i]
    const shot = path.join(OUT, `档${i + 1}-${want.label}.png`)
    await mp.screenshot({ path: shot })
    const cl = await clsOf(page)
    const tips = await styleOf(page, '.blk-tips-in', 'color')
    const count = await styleOf(page, '.blk-count', 'background-image')
    const fill = pill(shot).fill
    const line = JSON.parse(execFileSync('python3', [LINE, shot], { encoding: 'utf8' }))
    seen.push({ key: want.key, wantCls: want.cls, gotKey: (/mood-[a-z]+/.exec(cl) || ['(没读到)'])[0], cl, tips, count, fill, line, storage: await mp.evaluate(() => wx.getStorageSync('glassMood')) })
    ck(`第 ${i + 1} 档容器类是 ${want.cls}`, new RegExp(want.cls).test(cl), cl)
    ck(`${want.label}：压在面板上的那行字实读到 ${rgb(want.text).join(',')}（计算样式，不是源码）`,
      tripleIn(tips, rgb(want.text)), tips.slice(0, 60))
    ck(`${want.label}：左下那一格实读到 ${rgb(want.band).join(',')}（这一格与面板本来就是两支色）`,
      tripleIn(count, rgb(want.band)), count.slice(0, 74))
    ck(`${want.label}：这一档落账了（墨那一档是"没有键＝默认"，其余四档必须真在存储里）`,
      String(seen[i].storage || 'ink') === want.key, JSON.stringify(seen[i].storage))
    await mood.tap()
    await sleep(1400)
  }
  const after = await mp.evaluate(() => wx.getStorageSync('glassMood'))
  ck('点满五下回到起点那一档（循环，不是走到头就停）', after === 'ink', after)
  const distinct = new Set(seen.map((s) => s.gotKey))
  ck('五档各自读到**不同的**容器类（屏上真换了五张皮，不是同一个类读了五遍）',
    distinct.size === 5 && [...distinct].every((k) => /^mood-/.test(k)), [...distinct].join(' '))
  const inks = seen.map((s) => lumOf(s.fill))
  const spread = Math.max(...inks) - Math.min(...inks)
  ck('五档的底栏那块面在像素上互不相同（"tab 与上面同步"只能这么证：组件 automator 够不到）',
    spread > 40, `最亮-最暗＝${spread.toFixed(0)} 灰阶｜${seen.map((s, i) => `${s.key} ${s.fill.join(',')}(${inks[i].toFixed(0)})`).join(' / ')}`)
  ck('墨那一档的底栏**不再**是壁纸派生那支实心（改之前 10-14 18:5x 实测 67,59,40；他 19:3x 那句要的就是这个差别）',
    seen[0].fill.reduce((a, v, i) => a + Math.abs(v - [67, 59, 40][i]), 0) > 30, seen[0].fill.join(','))
  ck('墨那一档在五档里仍是最暗那一枚（它跟随的是那块墨玻璃，不是变浅）',
    lumOf(seen[0].fill) === Math.min(...inks), `${seen[0].fill.join(',')}｜亮度 ${lumOf(seen[0].fill).toFixed(0)}`)

  // 站长 10-14 19:3x 那句「黑色面板中间多了条线，其他色都没有，检查去掉」的量法：
  // 逐张图在面板内找"整幅都比上下亮 ≥4 灰阶"的那一行，取占比最大的一枚。
  // 为什么用"占比"而不是"跳档"：字和图标也会让某一行变亮，但它们只盖几列，一条线盖整幅——
  // 10-14 改前实测墨 0.47（就在渐变带与近实心那道交界 y1287），彩色四档 ≤0.10。
  // 阈值 0.15 卡在两堆数中间：改前墨档 0.47（那一行就是交界）超它三倍，改后五档 0.08～0.15 全落在
  // 字那一行的水位上；交界那一行的凸起改前墨 +4.4，改后五档 ≤0.4（x=400 那一列 55→48 一路单调，没有亮行）。
  ck('五档的面板里都不许有一条横贯整幅的线（占比 ≤0.15；底栏那道描边不在这段窗口里）',
    seen.every((s) => s.line.line_frac <= 0.15),
    seen.map((s) => `${s.key} ${s.line.line_frac}@y${s.line.line_y}｜交界 ${s.line.seam_delta}@y${s.line.seam_y}`).join(' / '))

  // ---------- ③ 别的页跟着同色（他现在钉在象牙档，两页各读一处玻璃面） ----------
  // ⚠ 期望值从 `moodVars()` 现读，不在这份尺子里另抄一遍：**玻璃那一族（纱／面／井）用的是
  //    "玻璃色往白并 .55"那支 piece**（同色的 .50 压在同色的 .95 上等于没画，见 规格 §1.5），
  //    只有那块深色面板才用玻璃本色。第一版我拿玻璃本色去比 `.sheet`，量到 (220,213,209) 判成红——
  //    红的不是屏，是我的期望值。
  await mp.evaluate(() => wx.setStorageSync('glassMood', 'ivory'))
  const ivVeil = firstRGBA(p.moodVars('ivory')['--glass-veil']).slice(0, 3)
  for (const [url, sel, prop] of [['/pages/index/index', '.sheet', 'background-image'], ['/pages/me/me', '.sheet', 'background-image']]) {
    page = await enter(url)
    await sleep(4500)
    const cl2 = await clsOf(page)
    ck(`${url} 这一页的容器也挂着 mood-ivory（一处出口，不逐页刷）`, /mood-ivory/.test(cl2), cl2)
    const got = await styleOf(page, sel, prop)
    ck(`${url} 的 ${sel} 里读得到象牙那一档的玻璃色 ${ivVeil.join(',')}（"其他页面也用相同的颜色面板"）`,
      tripleIn(got, ivVeil), got.slice(0, 74))
  }

  // ---------- ④ 壁纸与心情对不上账：以壁纸为准 ----------
  await mp.evaluate(() => { wx.setStorageSync('glassMood', 'ink'); wx.setStorageSync('wallpaperCache', 'tint-celadon') })
  page = await enter('/pages/create/create')
  await sleep(4500)
  cls = await clsOf(page)
  ck('本机留着墨、壁纸是天青 ⇒ 容器上是 mood-celadon（换台手机不许"青底配一支粉玻璃"）',
    /mood-celadon/.test(cls) && !/mood-ink/.test(cls), cls)
  ck('而且主题类跟着壁纸：theme-tint-celadon', /theme-tint-celadon/.test(cls), cls)

  // ---------- ⑤ 点它不许把录入面板带出来（catchtap 不吃整页的收起） ----------
  await mp.evaluate(() => { wx.removeStorageSync('glassMood'); wx.removeStorageSync('wallpaperCache') })
  page = await enter('/pages/create/create')
  await sleep(4500)
  const h3 = (await page.$$('.swap-half'))[2]
  await h3.tap()
  await sleep(1200)
  const dd = await page.data()
  ck('点「换心情」只换皮，不带出录入面板（与「调亮度」同一档 catchtap）',
    dd.active === '' || dd.active === undefined, JSON.stringify(dd.active))
  ck('点完之后容器上是下一档（mood-ivory），壁纸仍是 tint-paper（墨与象牙共用同一套壁纸）',
    /mood-ivory/.test(await clsOf(page)) && /theme-tint-paper/.test(await clsOf(page)), await clsOf(page))

  // ---------- 还原 ----------
  await mp.evaluate((v) => {
    if (v.mood === '' || v.mood === undefined || v.mood === null) wx.removeStorageSync('glassMood'); else wx.setStorageSync('glassMood', v.mood)
    if (v.wp === '' || v.wp === undefined || v.wp === null) wx.removeStorageSync('wallpaperCache'); else wx.setStorageSync('wallpaperCache', v.wp)
  }, before)
  const rest = await mp.evaluate(() => ({ mood: wx.getStorageSync('glassMood'), wp: wx.getStorageSync('wallpaperCache') }))
  ck('两格本机偏好已还原成探针进来前的值', String(rest.mood) === String(before.mood) && String(rest.wp) === String(before.wp),
    `${rest.mood}/${rest.wp} vs ${before.mood}/${before.wp}`)

  // ---------- ⑥ 向上阴影那一枚：三处落点在屏上都解析得出来（站长 10-14 20:5x） ----------
  // 静态那把（`验-向上阴影全局一枚`）读得出源码里写的是 `var(--sh-lift)`，读不出这一枚 var 在
  // 那一屏的祖先链上到底存不存在——少一枚就是 IACVT，整条 `box-shadow` 按 unset 用＝没投影，
  // 屏上又是最不容易看出来的一种。所以这里逐屏实读计算样式。
  // ⚠ 期望值不写死像素数：模拟器把 rpx 按屏宽折半（12rpx→6px、28rpx→14px），第一版我拿
  //   "1rpx＝1px"去比，三处全红——红的不是屏，是我把折算率当成了单位。这里只钉三件事：
  //   色是那一支、偏移朝上、**三处逐字相同**（他这句要的就是"风格和高度全局一致"）。
  const lifts = []
  for (const [url, sel, label] of [['/pages/index/index', '.sheet', '列表那张纸卡（正本）'],
  ['/pages/me/me', '.sheet', '「我的」那枚名片行（设置／关于两档共用）'],
  ['/pages/create/create', '.stage-panel', '新建那块通栏深色面板（首屏／二屏共用）']]) {
    const pg = await enter(url)
    await sleep(4500)
    const got = await styleOf(pg, sel, 'box-shadow')
    lifts.push({ label, got })
    const m = /^rgba\(18, 20, 26, 0?\.16\) 0px (-[\d.]+)px ([\d.]+)px 0px$/.exec(got.trim())
    ck(`${label}：屏上读到的 box-shadow 是那一枚（色＝rgba(18,20,26,.16)、偏移朝上、后面跟一档糊），不是 none`,
      !!m, got.slice(0, 84) || '(读不到)')
  }
  ck('三处读到的那一枚**逐字相同**（"风格和高度全局一致"只能这么证：一份令牌、三屏同一个解析结果）',
    lifts.every((l) => l.got === lifts[0].got), lifts.map((l) => l.got).join(' ＝ '))

  // ---------- ⑦ 无图那一态：这块玻璃底下是米白页面，糊没有对象，字能不能读要量 ----------
  // 只报数不判红的那条下限设 3.0：低于它就是真读不动了。4.5（AA 小字）这一档我没自己钉成红——
  // ⚠ 这里原来写着"墨档纸白压 .62 墨玻璃大概只剩 4.3:1"，那是拿**米白页面**当底算的；
  //   底栏其实压在深色面板上，下面那一行实测 (39,40,49) → 12.76:1，不存在要不要抬 α 的问题。
  page = await enter('/pages/create/create')
  await sleep(4500)
  await page.setData({ bgSrc: '' })
  await sleep(1200)
  const shotFlat = path.join(OUT, '档1-墨-无图那一态.png')
  await mp.screenshot({ path: shotFlat })
  const flat = pill(shotFlat)
  const relLum = (a) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }; return 0.2126 * f(a[0]) + 0.7152 * f(a[1]) + 0.0722 * f(a[2]) }
  const flatCr = (relLum([242, 239, 233]) + 0.05) / (relLum(flat.fill) + 0.05)
  console.log(`  ℹ 无图那一态：底栏那块面混出来 ${flat.fill.join(',')}，纸白 #F2EFE9 压上去 ${flatCr.toFixed(2)}:1（AA 小字要 4.5；这条只报数）`)
  ck('无图那一态那块面与纸白至少还分得开（>3.0；掉到 3 以下就是真读不动）', flatCr > 3.0, `${flatCr.toFixed(2)}:1`)
  // 计算样式读得到不等于屏上画得出来：`.stage-panel` 的 z-index 是 1，它头顶那一圈投影
  // 要是被同屏 z-index 2／6 那几样（插画、白卡、录入面板）压住，屏上就是"没有"，而上面那一条照样绿。
  // 所以这一处量**像素**：面板顶边上方那 6 行比再往上 25～45 行那一段暗多少。
  // 改前同一张图同一扇窗口实测 近带 220.0／远带 220.0 ⇒ 差 0.0，所以"暗 ≥3 灰阶"这一条有牙。
  const lift = JSON.parse(execFileSync('python3', [SHADOW, shotFlat, '548'], { encoding: 'utf8' }))
  ck('新建那一屏（无图态）：深色面板顶边上方那一条带确实被投影压暗了（≥3 灰阶）',
    lift.dip >= 3, `近带 ${lift.near}／远带 ${lift.far}／差 ${lift.dip}@y${lift.edge_y}｜${lift.profile.join(' ')}`)

  console.log(`\n${bad.length ? '✗ ' + bad.length + ' 条不过：' + bad.join('、') : `五档彩色玻璃 真跑：${n} 条全过`}`)
  console.log(`  图与数在 ${OUT}`)
  mp.close()
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
