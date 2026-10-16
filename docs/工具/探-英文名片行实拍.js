// 一次性探针：把模拟器切到英文态，实拍「我的」那一行两句话，再切回中文并读回证明还原了。
// 跑法：docs/工具/跑尺子.sh 9431 探-英文名片行实拍
//
// 为什么单独一个文件：`量-名片行英文不截断` 那把尺子**不切语言**（切语言会 PUT 到服务端，
// 尺子不该替站长改账号设置），英文那一格它是拿离屏画布算的字宽。而画布那支 `sans-serif`
// 比真机上那支系统字**窄**——他截图上 22 个字母只露出 18 个，画布却量出来"刚好放得下"。
// 所以改完文案必须拿英文态的真截图看一眼，这一把就是干这个的：
// ① 真点首屏左上角那枚「EN」（会 PUT 到服务端，这是产品自己的入口，不是尺子造的捷径）；
// ② 到「我的」那一屏拍一张英文态，再切回中文拍一张同角度对照；
// ③ 收尾读回 `globalData.userInfo.language`，不是 zh 就是没还原。
//    ⚠ 结论只有那两张图。这一把**不自动判有没有打点**：原来那条"渲染宽 ≥ 格子宽 ⇒ 被截断"
//    的几何断言是假的（理由写在下面 ② 那段注释里），留着会稳定报一条假红。
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')
const PORT = process.env.APORT || '9431'
const OUT = path.resolve(__dirname, '../../docs/design/10-16全局品牌位图/实测')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const unwrap = (r) => (r && typeof r === 'object' && 'result' in r ? r.result : r)

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  let mp, lastErr = ''
  for (let i = 0; i < 12; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }); break } catch (e) {
      lastErr = String((e && e.message) || e); await sleep(10000)
    }
  }
  if (!mp) { console.log('!! 连不上自动化端口（环境红）：' + lastErr); process.exit(1) }
  for (let i = 0; i < 40; i += 1) {
    try {
      const n = await mp.evaluate(() => { const a = getApp(); return a && a.globalData && a.globalData.token ? a.globalData.token.length : 0 })
      if (unwrap(n) > 100) break
    } catch (e) { /* 还没起来 */ }
    await sleep(3000)
  }
  const langNow = async () => unwrap(await mp.evaluate(() => {
    const a = getApp(); return a && a.globalData && a.globalData.userInfo ? a.globalData.userInfo.language : ''
  }))
  const sys = await mp.systemInfo(); const R = sys.windowWidth / 750
  console.log(`进门时账号语言＝${JSON.stringify(await langNow())}`)

  const toCreate = async () => { try { await mp.switchTab('/pages/create/create') } catch (e) { await mp.reLaunch('/pages/create/create') } await sleep(3000) }
  const tapLang = async () => {
    await toCreate()
    const page = await mp.currentPage()
    for (let i = 0; i < 20; i += 1) {
      const el = await page.$('.lang-corner')
      if (el) { await el.tap(); await sleep(4000); return true }
      await sleep(1000)
    }
    return false
  }

  /* ① 切到英文（真点那枚角标） */
  if (!(await tapLang())) { console.log('!! 摸不到 .lang-corner（环境红）'); process.exit(1) }
  const afterEn = await langNow()
  console.log(`点过一次角标之后＝${JSON.stringify(afterEn)}（期望 en；不是 en 就是这一路没走通）`)
  if (afterEn !== 'en') { console.log('✗ 没切进英文态，后面读到的都不算英文证据'); process.exit(1) }

  /* ② 到「我的」拍一张（英文态），再切回中文补一张同角度的，两份放一起看 */
  const shot = async (page, tag) => {
    const box = parseFloat((await (await page.$('.sheet-text')).size()).width)
    const txt = async (sel) => {
      const el = await page.$(sel)
      return el ? String(await el.text()) : null
    }
    const a = await txt('.sheet-name')
    const b = await txt('.sheet-slogan')
    console.log(`${tag}：格子 ${(box / R).toFixed(1)}rpx｜上句屏上「${a}」｜下句屏上「${b}」`)
    await mp.screenshot({ path: path.join(OUT, `7-英文态名片行${tag === '英文态' ? '' : '-对照'}.png`) })
    return { a, b }
  }
  try { await mp.switchTab('/pages/me/me') } catch (e) { await mp.reLaunch('/pages/me/me') }
  await sleep(3500)
  const enPage = await mp.currentPage()
  const en = await shot(enPage, '英文态')
  /* ⚠ 这里原来还有一条"渲染宽 ≥ 格子宽 ⇒ 被截断"的几何断言，**它是假的**：
     `.sheet-name`／`.sheet-slogan` 是 `.sheet-text`（`flex-direction:column`，`align-items` 默认
     stretch）的两个子项 ⇒ 两枚的盒子宽**恒等于**格子宽，截不截断都相等，量不出东西。
     屏上 `text()` 拿到的永远是字典全文（`text-overflow:ellipsis` 只裁像素、不改文本），
     离屏画布 `measureText` 那支 `sans-serif` 又比真机那支字窄 ⇒ 三条路都不作数。
     所以这一把的结论就是那两张图，自己打开看一眼末尾有没有"…"，别只信上面那行数。 */

  /* ③ 切回中文，再拍一张同角度的当对照，并读回语言证明还原了 */
  if (!(await tapLang())) console.log('!! 第二下没点到，语言可能还留在英文——手工切回来')
  const back = await langNow()
  try { await mp.switchTab('/pages/me/me') } catch (e) { await mp.reLaunch('/pages/me/me') }
  await sleep(3500)
  const zhPage = await mp.currentPage()
  const zh = await shot(zhPage, '中文态')
  console.log(`  · 收尾读回账号语言＝${JSON.stringify(back)}（要的是 "zh"；不是 zh 就是没还原，别当过了）`)
  const ok = back === 'zh' && !!en.a && !!en.b && !!zh.a
  console.log(ok
    ? '✓ 两态截图都拿到了，且已还原成中文态 —— 结论看那两张图末尾有没有打点'
    : '✗ 这一趟没走全（截图缺或语言没还原），上面那行数不算证据')
  console.log(`截图在 ${OUT}/ 下那两张 7-*.png（自己打开看一眼，别只信上面那行数）`)
  process.exit(ok ? 0 : 1)
})().catch((e) => { console.log('!! 探针挂了 ' + ((e && e.stack) || e)); process.exit(1) })
