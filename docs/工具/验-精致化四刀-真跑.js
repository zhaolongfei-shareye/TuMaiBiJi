// 10-17「精致化」这一轮的真跑尺子（连模拟器，量屏上，不读源码）。
// 前置：docs/工具/跑尺子.sh 9431 验-精致化四刀-真跑
//
// 静态那把（`验-精致化四刀`）钉的是文件里挂没挂；这一把钉的是画没画出来。三条只有屏上说得清的：
//   ① 药丸与那一行的字**同不同轴**（"没有上下等边，歪了"是一句视觉话，只有中线能回答）；
//   ② 右滑那枚圆在条里上下余量等不等（改之前实测上 7.7／下 13.5，是取整造成的，静态读不出来）；
//   ③ 发光这几枚**真的画出来了没有**——`--glass-chrome-dock` 写在样式表里、被别的层盖掉，
//      静态一条不红（同一类坑的正本记在"改一层皮的十三种静默失效"那一条）。
// 另外钉两条防回归：进度那一片搬家之后左沿与宽度算法没变；密码那句中文撤了字距**仍是一行**。
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '../..')
const PORT = process.env.APORT || '9431'
const SHOT = path.join(ROOT, 'docs/design/10-17精致化/实测')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const unwrap = (r) => (r && typeof r === 'object' && 'result' in r ? r.result : r)
const I18N = require(path.join(ROOT, 'miniprogram/utils/i18n.js'))

let pass = 0
const fails = []
function ok(name, cond, extra) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ' —— ' + (extra || '')}`)
  if (cond) pass += 1; else fails.push(name)
}

;(async () => {
  fs.mkdirSync(SHOT, { recursive: true })
  let mp, lastErr = ''
  for (let i = 0; i < 12; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }); break } catch (e) {
      lastErr = String((e && e.message) || e); await sleep(10000)
    }
  }
  if (!mp) { console.log('!! 连不上自动化端口（环境红，不是判据红）：' + lastErr); process.exit(1) }

  const retry = async (fn, times = 8) => {
    for (let i = 0; i < times; i += 1) { try { const v = await fn(); if (v) return v } catch (e) { /* 还没起来 */ } await sleep(1200) }
    return null
  }
  const info = await mp.systemInfo()
  const R = info.windowWidth / 750
  const rx = (v) => (typeof v === 'number' ? Math.round(v / R * 10) / 10 : null)

  let page
  for (let i = 0; i < 6; i += 1) {
    try {
      page = await mp.reLaunch('/pages/create/create')
      await sleep(2500)
      if (await page.$('.home-blk')) break
      page = null
    } catch (e) { page = null }
    await sleep(2500)
  }
  if (!page) { console.log('✗ 进不去 /pages/create/create'); process.exit(1) }
  await page.setData({ lang: 'zh', t: I18N.texts('zh') })
  await sleep(900)

  const rects = async (sels) => {
    const raw = unwrap(await retry(() => mp.evaluate((list) => new Promise((resolve) => {
      const q = wx.createSelectorQuery()
      list.forEach((s) => { q.selectAll(s).boundingClientRect() })
      q.exec((res) => {
        const out = []
        for (let i = 0; i < list.length; i += 1) {
          const arr = (res && res[i]) || []
          out.push(arr.map((x) => ({
            top: x.top, bottom: x.bottom, h: x.height, w: x.width, left: x.left, right: x.right,
          })))
        }
        resolve(out)
      })
    }), sels)))
    const r = raw || []
    return sels.map((s, i) => (r[i] || [])[0] || null)
  }
  const styleOf = async (sel, prop) => {
    const el = await retry(() => page.$(sel))
    if (!el) return null
    return unwrap(await retry(() => el.style(prop)))
  }

  /* ---------- 首屏那一行的字档（对照基准） ---------- */
  const swapFs = await styleOf('.swap-text', 'font-size')
  ok('③ 首屏三枚设置读到的是 21rpx 那一档（对照基准先站稳）',
    !!swapFs && Math.abs(parseFloat(swapFs) - 21 * R) <= 1.2, `computed ${swapFs}`)

  /* ---------- 第二屏：药丸那一行 ---------- */
  await page.setData({ active: 'photo', sldIcon: 'images', previewImages: [] })
  await page.callMethod('_sync')
  await sleep(1400)
  const outFs = await styleOf('.out', 'font-size')
  ok('③ 那一行与首屏三枚 computed 逐字同一档（不是各自写同一个 rpx 猜的）',
    !!outFs && outFs === swapFs, `那一行 ${outFs}／首屏 ${swapFs}`)
  const hintFs = await styleOf('.wr-sw-hint', 'font-size')
  const labFs = await styleOf('.wr-sw-lab', 'font-size')
  const backFs = await styleOf('.out-r', 'font-size')
  ok('③ 名字／说明／返回三枚 computed 全等于那一行（谁没跟着降，屏上就两种大小）',
    !!hintFs && hintFs === outFs && labFs === outFs && backFs === outFs,
    `名字 ${labFs}／说明 ${hintFs}／返回 ${backFs}／行 ${outFs}`)

  const [outR, swR, trackR, dotR, labR] = await rects(['.out', '.wr-sw', '.wr-sw-track', '.wr-sw-dot', '.wr-sw-lab'])
  const mid = (x) => (x ? (x.top + x.bottom) / 2 : null)
  ok('② 药丸与那一行、与「原文翻译」那四个字同轴（上下等边：三枚中线两两差 ≤ 1px）',
    !!outR && !!trackR && !!labR && Math.abs(mid(outR) - mid(trackR)) <= 1
    && Math.abs(mid(outR) - mid(labR)) <= 1,
    `行 ${mid(outR) && mid(outR).toFixed(1)}／面 ${mid(trackR) && mid(trackR).toFixed(1)}／字 ${mid(labR) && mid(labR).toFixed(1)}`)
  ok('① 面屏上读到的是 54×30（±2rpx），比改之前那一档 72×40 小一圈',
    !!trackR && Math.abs(rx(trackR.w) - 54) <= 2 && Math.abs(rx(trackR.h) - 30) <= 2,
    trackR && `${rx(trackR.w)}×${rx(trackR.h)}`)
  /* 点落在面里哪一头，看这一位是开还是关（10-16 起默认开＝点在右）。
     第一版这条一上来就红：我拿"关"那一档的数去量"开"那一态——两态各读一遍、各钉一头才算对。 */
  const gaps = (t, d) => (t && d ? {
    左: rx(d.left - t.left), 上: rx(d.top - t.top), 右: rx(t.right - d.right), 下: rx(t.bottom - d.bottom),
  } : null)
  const near = (v, want) => typeof v === 'number' && Math.abs(v - want) <= 2.2
  const gOn = gaps(trackR, dotR)
  ok('① 开那一态：点贴右沿（右 ≈ 4）、上下各 ≈ 4（四边内缩同一档，垂直不许偏）',
    !!gOn && near(gOn.右, 4) && near(gOn.上, 4) && near(gOn.下, 4) && gOn.左 > 20, JSON.stringify(gOn))
  await (await page.$('.wr-sw')).tap()
  await sleep(800)
  const [trackOff, dotOff] = await rects(['.wr-sw-track', '.wr-sw-dot'])
  const gOff = gaps(trackOff, dotOff)
  ok('① 关那一态：点贴左沿（左 ≈ 4）、上下仍各 ≈ 4（两态只差水平那一头）',
    !!gOff && near(gOff.左, 4) && near(gOff.上, 4) && near(gOff.下, 4) && gOff.右 > 20, JSON.stringify(gOff))
  ok('① 两态落点差 ≈ 24rpx（位移写错一个数，点要么顶出面、要么留一条缝）',
    !!dotR && !!dotOff && Math.abs(Math.abs(dotOff.left - dotR.left) / R - 24) <= 2.5,
    dotR && dotOff && `实测 ${Math.abs(dotOff.left - dotR.left) / R}`)
  await (await page.$('.wr-sw')).tap()
  await sleep(600)
  ok('② 热区没跟着缩：整枚可点区 ≥ 54rpx（名义 60＝面 30＋上下各 15；390 这一台取整读到 55.8，改之前同为名义 60 读到 57.7——那 1px 是 750 折算的取整残渣，不是我把热区缩了）',
    !!swR && rx(swR.h) >= 54, swR && `高 ${rx(swR.h)}`)
  await mp.screenshot({ path: path.join(SHOT, 'A-药丸那一行.png') })

  /* ---------- 三枚圆的发光 ---------- */
  const GLOW = /rgba?\(/
  const miniSh = await styleOf('.mini-c', 'box-shadow')
  const shutSh = await styleOf('.shut', 'box-shadow')
  ok('④ 相册／粘贴那两枚圆屏上读得到外发光（不是 none：样式表写了却没画出来是这一类改版最常见的假绿）',
    !!miniSh && miniSh !== 'none' && GLOW.test(miniSh), String(miniSh))
  ok('④ 拍照那一枚读得到同一份外发光', !!shutSh && shutSh !== 'none' && GLOW.test(shutSh), String(shutSh))
  ok('④ 三枚的发光 computed 逐字相等（两种光晕＝他说的"不精致"）',
    !!miniSh && miniSh === shutSh, `小圆 ${miniSh}／快门 ${shutSh}`)

  /* ---------- 右滑：条、圆、发光、上下余量 ---------- */
  await page.setData({ previewImages: ['http://usr/probe-0.png'] })
  await page.callMethod('_sync')
  await sleep(1400)
  // `_sync` 会把这一位算回 0，所以进度宽度要在它之后单独喂（`验-录入面板沉底-真跑` 同一趟量法）
  await page.setData({ fillPct: 42 })
  await sleep(500)
  const [sldR, knobR, fillR, clipR] = await rects(['.sld', '.sld-knob', '.sld-fill', '.sld-clip'])
  const knobSh = await styleOf('.sld-knob', 'box-shadow')
  const sldSh = await styleOf('.sld', 'box-shadow')
  ok('④ 右滑那枚圆屏上读得到外发光，且与条身那一份不是同一支色（条吃提亮、圆吃本色）',
    !!knobSh && knobSh !== 'none' && !!sldSh && sldSh !== 'none' && knobSh !== sldSh,
    `圆 ${knobSh}／条 ${sldSh}`)
  ok('② 圆在条里上下余量差 ≤ 2rpx（改之前实测上 7.7／下 13.5，差 5.8）',
    !!sldR && !!knobR && Math.abs(rx(knobR.top - sldR.top) - rx(sldR.bottom - knobR.bottom)) <= 2,
    sldR && knobR && `上 ${rx(knobR.top - sldR.top)}／下 ${rx(sldR.bottom - knobR.bottom)}`)
  ok('④ 进度那一片搬进单独一层之后：左沿仍是条左＋那一圈 5rpx 边，宽度仍是条内宽的 42%',
    !!sldR && !!fillR && !!clipR && Math.abs(fillR.left - (sldR.left + 5 * R)) <= 2
    && Math.abs(fillR.w - (sldR.w - 2 * 5 * R) * 0.42) <= 12 * R,
    sldR && fillR && `填充左 ${fillR.left.toFixed(1)}（应 ${sldR.left.toFixed(1)}＋${(5 * R).toFixed(1)}）宽 ${fillR.w.toFixed(1)}／内宽 ${(sldR.w - 10 * R).toFixed(1)}`)
  ok('④ 条身自己那一份发光没动（他没指这一处）',
    !!sldSh && /rgba?\(/.test(sldSh), String(sldSh))
  await mp.screenshot({ path: path.join(SHOT, 'B-右滑条与圆发光.png') })

  /* ---------- 「我的」两个弹窗那句小字 ---------- */
  for (let i = 0; i < 6; i += 1) {
    try { await mp.switchTab('/pages/me/me') } catch (e) { try { await mp.reLaunch('/pages/me/me') } catch (e2) { /* 再试 */ } }
    await sleep(2500)
    const p = await mp.currentPage()
    if ((p.path || '').indexOf('pages/me/me') >= 0) break
  }
  page = await mp.currentPage()
  const tabv = unwrap(await retry(() => page.data('tab')))
  if (tabv !== 'set') { await page.callMethod('onTab', { currentTarget: { dataset: { key: 'set' } } }); await sleep(1500) }
  page = await mp.currentPage()
  const hintLs = await styleOf('.menu-hint', 'letter-spacing')
  const hintFs2 = await styleOf('.menu-hint', 'font-size')
  ok('⑤ 对照基准：菜单行后面那行备注读到的字距是 normal、字档 21rpx',
    !!hintLs && /normal/.test(String(hintLs)) && Math.abs(parseFloat(hintFs2) - 21 * R) <= 1.2,
    `${hintLs}／${hintFs2}`)

  await page.callMethod('onTogglePwd'); await sleep(1600)
  page = await mp.currentPage()
  const pLs = await styleOf('.pwd-scene', 'letter-spacing')
  const pFs = await styleOf('.pwd-scene', 'font-size')
  const [pSceneR, pBoxR, pTwoR] = await rects(['.pwd-scene', '.pwd-boxes', '.pwd-two'])
  ok('⑤ 密码那一层中间那句：computed 字距与备注同一支（normal），不再是 −1px',
    !!pLs && /normal/.test(String(pLs)) && pLs === hintLs && pFs === hintFs2,
    `字距 ${pLs}／字档 ${pFs}／备注 ${hintLs} ${hintFs2}`)
  ok('⑤ 撤了字距之后中文那句仍是一行（10-02 那笔账：一回行就把下面那一叠挤走）',
    !!pSceneR && rx(pSceneR.h) < 34, pSceneR && `那句高 ${rx(pSceneR.h)}（一行该 ≈ 28.8）`)
  // 六格（`.pwd-boxes`）只在"正在输"那一态存在；他这台已设过，进来读到的是不带六格的那一态。
  // 原来这条拿 `.pwd-boxes` 当必存在 ⇒ 恒红（尺子错，不是产品错）。改拿按钮行当下面那道参照。
  ok('⑤ 那句的底仍在按钮那一行之上（不挤走下面的出口）',
    !!pSceneR && !!pTwoR && pSceneR.bottom <= pTwoR.top + 1,
    pSceneR && pTwoR && `那句底 ${rx(pSceneR.bottom)}／按钮行顶 ${rx(pTwoR.top)}／六格 ${pBoxR ? '在' : '不在这一态'}`)
  await mp.screenshot({ path: path.join(SHOT, 'C-密码层小字.png') })
  try { await page.callMethod('onClosePwdPanel') } catch (e) { /* 关不掉就放着，下一把尺子自己 reLaunch */ }
  await sleep(1000)

  page = await mp.currentPage()
  await page.callMethod('onToggleEmail'); await sleep(1600)
  page = await mp.currentPage()
  const eLs = await styleOf('.me-email-scene', 'letter-spacing')
  const eFs = await styleOf('.me-email-scene', 'font-size')
  const [eSceneR, eFieldR] = await rects(['.me-email-scene', '.me-email-field'])
  ok('⑤ 邮箱那一层中间那句：computed 字距与备注同一支（normal）',
    !!eLs && /normal/.test(String(eLs)) && eLs === hintLs && eFs === hintFs2,
    `字距 ${eLs}／字档 ${eFs}`)
  ok('⑤ 那句与下面那个输入框之间仍留得住（中文两行；英文那侧行数只报数不判红）',
    !!eSceneR && !!eFieldR && eSceneR.bottom <= eFieldR.top + 1,
    eSceneR && eFieldR && `那句底 ${rx(eSceneR.bottom)}（${Math.round(rx(eSceneR.h) / 28.8)} 行）／输入框顶 ${rx(eFieldR.top)}`)
  await mp.screenshot({ path: path.join(SHOT, 'D-邮箱层小字.png') })
  const closeBtn = await page.$('.me-email-btn.ghost')
  if (closeBtn) { await closeBtn.tap(); await sleep(900) }

  console.log(`\n视口 ${info.windowWidth}×${rx(info.windowHeight)}rpx｜1rpx＝${R.toFixed(3)}px`)
  console.log(`${fails.length ? '✗ 红 ' + fails.length + ' 条' : '✓ 全绿 ' + pass + ' 条'}`)
  await mp.close()
  process.exit(fails.length ? 1 : 0)
})().catch((e) => { console.log('探针挂了 ' + (e && e.message)); process.exit(1) })
