// 出包前的硬前置：界面里显示的号必须和要上传的体验版号是同一个。
// 这条踩过三次（1.1.14→1.1.15 那次也是上传完才想起来改），所以这里不再写死期望值——
// 期望值直接读 miniprogram/pages/about/about.js 里那个常量，两边不可能再各说一套。
const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')

const ABOUT = path.resolve(__dirname, '../../miniprogram/pages/about/about.js')
const EXPECT = /const VERSION = '([^']+)'/.exec(fs.readFileSync(ABOUT, 'utf8'))[1]
const PORT = process.env.APORT || '9420'
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
      ? `✓ 界面里的版本号是 ${d.version}，和 about.js 里的常量一致`
      : `✗ 界面版本号是 ${d.version}，about.js 写的是 ${EXPECT}`)
    if (d.version !== EXPECT) process.exitCode = 3
    await mp.screenshot({ path: '/tmp/mp-check/15-关于页.png' })
    console.log('截图 /tmp/mp-check/15-关于页.png')
  } finally { await mp.disconnect() }
})().catch(e => { console.error('出错', e.message); process.exit(2) })
