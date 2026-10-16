// 「我的」那一行两句话放不放得下的真跑尺子（连模拟器）。
// 跑法：docs/工具/跑尺子.sh 9431 量-名片行英文不截断
//
// 站长 10-16 夜：「关于和设置，英文下，那句 hello！.... 被遮挡一部分，你修改一下，上下标题，
// 意思差不多就行。」⇒ 那一行是 `white-space:nowrap` ＋ `text-overflow:ellipsis`，
// 放不下不是换行而是打点——**屏上少字，源码里一个字都不缺**，静态尺子永远看不出来。
//
// 怎么量的口径（先说死，免得下次以为这是"算出来的"）：
//   ① 格子宽：automator `size()` 读渲染后的 `.sheet-text` 框——这是**屏上实测**，中文态。
//   ② 英文态那一格有多宽：那一行的总宽是「LOGO ＋ 两行字 ＋ 药丸」，字那一格吃剩下的，
//      所以药丸一变宽，格子就变窄。药丸两枚的字宽用离屏 2d 画布 `measureText` 现量，
//      内边距那几枚常数从 `me.wxss` 现读（不写死），于是
//      `格子(en) = 格子(zh) − 药丸(zh) + 药丸(en)`，每一项都是量出来的。
//   ③ 两句话的自然宽：同一把画布，字号字重从屏上那两枚的计算样式现读。
//      ⚠ 画布用的是 `sans-serif`，与真机上那支系统字不完全同一份度量 ⇒ 这一把报的是
//      "差多少"，不是"正好多少"；判据钉在格子宽的 **95%**（两处偏差同向，见下面 `MARGIN` 那段），
//      改完还要看一张真截图（`探-英文名片行实拍`）。
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')
const PORT = process.env.APORT || '9431'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const unwrap = (r) => (r && typeof r === 'object' && 'result' in r ? r.result : r)
const I18N = require(path.join(__dirname, '../../miniprogram/utils/i18n.js'))
const ROOT = path.resolve(__dirname, '../..')

let pass = 0
const fails = []
function ok(name, cond, extra) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ' —— ' + (extra || '')}`)
  if (cond) pass += 1; else fails.push(name)
}

;(async () => {
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
  const sys = await mp.systemInfo()
  const R = sys.windowWidth / 750
  const measure = async (text, fontPx, weight) => unwrap(await mp.evaluate((t, f, w) => {
    const cv = wx.createOffscreenCanvas({ type: '2d', width: 900, height: 60 })
    const ctx = cv.getContext('2d')
    ctx.font = `${w} ${f}px sans-serif`
    return Math.ceil(ctx.measureText(t).width)
  }, text, fontPx, weight))

  try { await mp.switchTab('/pages/me/me') } catch (e) { await mp.reLaunch('/pages/me/me') }
  await sleep(3000)
  const page = await mp.currentPage()
  const lang = unwrap(await page.data('lang'))
  const nameEl = await page.$('.sheet-name')
  const sloEl = await page.$('.sheet-slogan')
  const boxEl = await page.$('.sheet-text')
  if (!nameEl || !sloEl || !boxEl) { console.log('!! 那一行三枚没摸到（环境红）'); process.exit(1) }
  const boxPx = parseFloat((await boxEl.size()).width)
  const namePx = parseFloat(await nameEl.style('font-size'))
  const sloPx = parseFloat(await sloEl.style('font-size'))
  const nameW = parseFloat(await nameEl.style('font-weight')) || 800
  console.log(`账号语言＝${lang}｜格子（当前态）${(boxPx / R).toFixed(1)}rpx｜上句字号 ${namePx}px／字重 ${nameW}｜下句字号 ${sloPx}px`)

  /* 药丸那一格两枚各多宽：内边距与间隙从 me.wxss 现读，不写死 */
  const meWxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/me/me.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const segPad = parseFloat((meWxss.match(/\.seg\s*\{[^}]*padding:\s*0\s+(\d+)rpx/) || [, '24'])[1])
  const pillPad = parseFloat((meWxss.match(/\.pill\s*\{[^}]*padding:\s*(\d+)rpx/) || [, '5'])[1])
  const pillGap = parseFloat((meWxss.match(/\.pill\s*\{[^}]*gap:\s*(\d+)rpx/) || [, '4'])[1])
  const segFontRpx = parseFloat((fs.readFileSync(path.join(ROOT, 'miniprogram/app.wxss'), 'utf8').match(/--fs-meta:\s*(\d+)rpx/) || [, '24'])[1])
  const pillWidth = async (l) => {
    const a = await measure(I18N.t('pillSettings', l), segFontRpx * R, 700)
    const b = await measure(I18N.t('pillAbout', l), segFontRpx * R, 700)
    return (a + 2 * segPad * R) + (b + 2 * segPad * R) + pillGap * R + 2 * pillPad * R
  }
  const pillNow = await pillWidth(lang)
  const boxOther = async (other) => {
    const p = await pillWidth(other)
    return boxPx + pillNow - p
  }

  const ROWS = [
    { key: 'meGreeting', px: namePx, w: nameW },
    { key: 'slogan', px: sloPx, w: 400 },
  ]
  /* 判据留 5% 的活口，不是"放得进就行"——两处已知偏差**同向**都偏乐观：
     ① 画布那支 `sans-serif` 比真机那支系统字窄（他那张截图上 22 个字母只露出 18 个）；
     ② 英文态那一格是**算**出来的（`格子(zh) − 药丸(zh) + 药丸(en)`，药丸宽也出自同一把画布）。
     10-16 21:47 那对真截图把 ② 校准了一次：算出来 250.0rpx，屏上实测 `.sheet-text` ＝ 241.7rpx
     （差 3.4%）。所以这条线钉在 95%，改完文案仍以真截图收尾（`探-英文名片行实拍`）。 */
  const MARGIN = 0.95
  for (const l of ['zh', 'en']) {
    const box = l === lang ? boxPx : await boxOther(l)
    for (const r of ROWS) {
      const s = I18N.t(r.key, l)
      const nat = await measure(s, r.px, r.w)
      const slack = (box - nat) / R
      ok(`${l}｜${r.key}「${s}」放得进 ${(box / R).toFixed(1)}rpx 那一格的 95%（余量 ${slack.toFixed(1)}rpx）`,
        nat <= box * MARGIN, `自然 ${(nat / R).toFixed(1)}rpx，超出那条线 ${((nat - box * MARGIN) / R).toFixed(1)}rpx`)
    }
  }
  console.log(`  · 药丸宽：${lang} ${(pillNow / R).toFixed(1)}rpx（内边距 ${segPad}rpx×2/枚、间隙 ${pillGap}rpx、外框 ${pillPad}rpx 全从 me.wxss 现读）`)
  console.log(`${fails.length ? '✗' : '✓'} 名片行不截断：${pass}/${pass + fails.length} 过`)
  process.exit(fails.length ? 1 : 0)
})().catch((e) => { console.log('!! 尺子挂了 ' + ((e && e.stack) || e)); process.exit(1) })
