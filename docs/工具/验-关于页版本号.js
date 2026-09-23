const automator = require('miniprogram-automator')
;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' })
  try {
    await mp.navigateTo('/pages/about/about')
    await new Promise(r => setTimeout(r, 2500))
    const d = await mp.evaluate(() => {
      const p = getCurrentPages().slice(-1)[0]
      const x = p.data || {}
      return { route: p.route, version: x.version, keys: Object.keys(x).filter(k => /version|quota|account|注销/i.test(k)).map(k => k + '=' + JSON.stringify(x[k])) }
    })
    console.log(JSON.stringify(d, null, 1))
    console.log(d.version === '1.1.15' ? '✓ 界面里的版本号是 1.1.15，和体验版号一致' : '✗ 界面版本号是 ' + d.version)
    await mp.screenshot({ path: '/tmp/mp-check/15-关于页.png' })
    console.log('截图 /tmp/mp-check/15-关于页.png')
  } finally { await mp.disconnect() }
})().catch(e => { console.error('出错', e.message); process.exit(2) })
