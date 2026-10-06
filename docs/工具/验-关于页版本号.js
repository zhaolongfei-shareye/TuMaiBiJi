// 出包前的硬前置：界面里显示的号必须和要上传的体验版号是同一个。
// 这条踩过三次（1.1.14→1.1.15 那次也是上传完才想起来改），所以这里不再写死期望值——
// 期望值直接读那个常量。1.9.0 起它搬到 utils/appInfo.js 了（「我的」那一页也要说同一句，
// 两处各写一份迟早走样），所以这里读 appInfo.js 而不是 about.js。
const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')

const INFO = path.resolve(__dirname, '../../miniprogram/utils/appInfo.js')
const HIT = /const VERSION = '([^']+)'/.exec(fs.readFileSync(INFO, 'utf8'))
if (!HIT) { console.error('✗ 在 utils/appInfo.js 里找不到 VERSION，这条尺子先失效了'); process.exit(2) }
const EXPECT = HIT[1]
// 默认端口跟着 `跑尺子.sh` 那条统一口径（本项目真跑那批一律 9431，这一把原来写死 9420，
// 用 runner 跑就连不上——报的是连接红，不是判据红）。要单独跑旧写法：APORT=9420 node ...
const PORT = process.env.APORT || '9431'
;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:' + PORT + '' })
  try {
    await mp.navigateTo('/pages/about/about')
    await new Promise(r => setTimeout(r, 2500))
    const d = await mp.evaluate(() => {
      const p = getCurrentPages().slice(-1)[0]
      const x = p.data || {}
      return { route: p.route, version: x.version, keys: Object.keys(x).filter(k => /version|quota|account|注销/i.test(k)).map(k => k + '=' + JSON.stringify(x[k])) }
    })
    console.log(JSON.stringify(d, null, 1))
    console.log(d.version === EXPECT
      ? `✓ 关于页版本号 ${d.version}，和 utils/appInfo.js 的常量一致`
      : `✗ 关于页版本号是 ${d.version}，appInfo.js 写的是 ${EXPECT}`)
    if (d.version !== EXPECT) process.exitCode = 3
    // 「我的」的关于那一栏也吃同一个常量：切过去量一次，两处不许各说一套
    await mp.switchTab('/pages/me/me')
    await new Promise(r => setTimeout(r, 3000))
    const me = await mp.currentPage()
    await me.setData({ tab: 'about' })
    await new Promise(r => setTimeout(r, 800))
    const mv = (await me.data()).version
    console.log(mv === EXPECT ? `✓ 「我的」里的版本号同为 ${mv}` : `✗ 「我的」写的是 ${mv}，appInfo.js 是 ${EXPECT}`)
    if (mv !== EXPECT) process.exitCode = 3
    await mp.screenshot({ path: '/tmp/mp-check/15-关于页.png' })
    console.log('截图 /tmp/mp-check/15-关于页.png')
  } finally { await mp.disconnect() }
})().catch(e => { console.error('出错', e.message); process.exit(2) })
