// 量"深色面板上沿那条阴影在五档里到底读不读得出来"（站长 10-15：「默认黑色的两个面板好像没做阴影，其他颜色面板是有阴影的」）。
//
// 为什么必须量数不靠眼看：这句话是**五张图之间比出来的**，而静态代码已经能证一件事——
// `--sh-lift` 只在 `app.wxss` 的 `page{}` 里定义过一枚，五块 `.mood-*` 各自那 16 枚令牌里
// 没有任何一枚是阴影，`.stage-panel` 上那条 `box-shadow` 也不带档位分支。
// ⇒ **"墨档漏写阴影"这个假设已经被代码否掉了**，剩下的唯一解释是同一枚深色投影压在不同深浅的皮上
//    读出的落差不同。落差这件事只有像素能证。
//
// 三枚数（都以"面板上沿那一行"为原点，全部现算，不写死 y）：
//   ① L_photo —— 上沿以上 140rpx～60rpx 那一段的平均亮度＝没被投影碰到的照片本色；
//   ② L_shad  —— 上沿以上 24rpx～6rpx 那一段＝投影该落在的那一条；
//   ③ L_panel —— 上沿以下 30rpx～70rpx 那一段＝面板皮自己（渐变已经走完，近实心）。
// 判读方向是**反的**：浮起感要 L_shad < L_panel（面板上方比面板暗）。
// 要是 L_shad > L_panel，那一条读出来就是"面板上面亮着一圈"，人眼记成"没做阴影"。
//
// 跑法：MP_ROOT=/Users/zlfmac/Documents/TuMaiBiJi docs/工具/跑尺子.sh 9431 量-面板阴影五档读数
const automator = require('miniprogram-automator')
const path = require('path')
const { execFileSync } = require('child_process')

const PORT = process.env.MP_PORT || 9431
const OUT = '/tmp/shadow5'
const PY = path.resolve(__dirname, '量-面板阴影五档读数.py')
const p = require('../../miniprogram/utils/palette.js')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const fs = require('fs')
  fs.mkdirSync(OUT, { recursive: true })
  let mp
  try {
    mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` })
  } catch (e) {
    console.error(`连不上模拟器端口 ${PORT}（要走 跑尺子.sh）：${e.message}`)
    process.exit(2)
  }
  try {
    let page = await mp.reLaunch('/pages/create/create')
    await sleep(6000)
    const clsOf = async () => String(((await page.$('.container')) && (await (await page.$('.container')).attribute('class'))) || '')
    // 钉回墨档：最多点五下，直到容器上是 mood-ink。
    for (let i = 0; i < 6; i++) {
      if (/mood-ink/.test(await clsOf())) break
      const hs = await page.$$('.swap-half')
      await hs[2].tap()
      await sleep(1500)
    }
    page = (await mp.currentPage()) || page

    const hs = await page.$$('.swap-half')
    const mood = hs[2]
    const rows = []
    for (let i = 0; i < p.MOODS.length; i++) {
      const want = p.MOODS[i]
      const shot = `${OUT}/档${i + 1}-${want.label}.png`
      await mp.screenshot({ path: shot })
      // 计算样式那一头也读一次：这条阴影是不是真的五档同一个值（读的是运行时，不是源码）。
      const el = await page.$('.stage-panel')
      const bs = el ? String(await el.style('box-shadow') || '') : '(没有 .stage-panel)'
      const j = JSON.parse(execFileSync('python3', [PY, shot], { encoding: 'utf8' }))
      rows.push(Object.assign({ key: want.key, label: want.label, cls: (/mood-[a-z]+/.exec(await clsOf()) || ['?'])[0], shadow_css: bs.replace(/\s+/g, ' ') }, j))
      await mood.tap()
      await sleep(1500)
    }
    console.log(JSON.stringify(rows, null, 1))
    console.log('\n档     L_photo  L_shad  L_panel   上方减照片  上方减面板  读法')
    for (const r of rows) {
      const dPhoto = (r.L_shad - r.L_photo).toFixed(1)
      const dPanel = (r.L_shad - r.L_panel).toFixed(1)
      const how = Number(dPanel) < 0 ? '面板上方更暗＝浮得起' : '面板上方反而更亮＝读成"没阴影"'
      console.log(`${r.label.padEnd(5)} ${String(r.L_photo).padStart(7)} ${String(r.L_shad).padStart(7)} ${String(r.L_panel).padStart(8)} ${String(dPhoto).padStart(10)} ${String(dPanel).padStart(11)}  ${how}`)
    }
  } catch (e) {
    console.error('跑挂了：', e && e.message ? e.message : e)
  } finally {
    try { await mp.close() } catch (_) {}
  }
})()
