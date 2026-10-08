// 探针（不是判据）：微信有没有"不弹分享面板、单独拉起某个出口"的接口。
// 跑法：先 cli auto --project <repo>/miniprogram --auto-port 9431，等约 90 秒，再
//   NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/探-分享独立出口.js
//
// 背景：站长 10-01 晚想把卡片图分享那一排（发送给好友／分享到朋友圈／收藏／保存图片／
// 转发为贴图）拆成我们自己的平面按钮，逐个直调。`wx.showShareImageMenu` 只有"打开面板"
// 一种行为（官方 d.ts 里它的 option 只有 path / entrancePath / needShowEntrance），
// 但开发者工具自带那份 `lib.wx.api.d.ts` 里还有一族 `share*ToGroup` 与
// `shareToOfficialAccount`，注释写的是「转发图片到聊天」「拉起贴图发表页」。
// 这一把要拿实测回答两件事：① 这些接口在当前基础库里存不存在；② 调用时微信给的
// errno/errMsg 是"接口没有"还是"场景不对"——后者才说明真机上换个入口就能用。
const automator = require('miniprogram-automator')

const APIS = [
  'showShareImageMenu',
  'shareImageToGroup',
  'shareAppMessageToGroup',
  'shareFileToGroup',
  'shareEmojiToGroup',
  'shareVideoToGroup',
  'shareFileMessage',
  'shareVideoMessage',
  'shareToOfficialAccount',
  'saveImageToPhotosAlbum',
]

const CALLS = [
  { name: 'shareImageToGroup', arg: { imagePath: '/assets/logo.png' } },
  { name: 'shareToOfficialAccount', arg: { imagePath: '/assets/logo.png' } },
]

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  try {
    const out = await mp.evaluate((apis, calls) => new Promise((resolve) => {
      const base = (wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync()) || {}
      const exist = {}
      apis.forEach((k) => { exist[k] = typeof wx[k] })
      const results = []
      let pending = calls.length
      if (!pending) resolve({ sdk: base.SDKVersion, exist, results })
      calls.forEach((c) => {
        const done = (r) => {
          results.push(Object.assign({ api: c.name }, r))
          if (--pending === 0) resolve({ sdk: base.SDKVersion, exist, results })
        }
        if (typeof wx[c.name] !== 'function') return done({ skipped: '接口不存在' })
        const timer = setTimeout(() => done({ timedOut: '4 秒内没有回调（模拟器可能把面板挂住了）' }), 4000)
        wx[c.name](Object.assign({}, c.arg, {
          success: (res) => { clearTimeout(timer); done({ ok: true, res }) },
          fail: (err) => { clearTimeout(timer); done({ ok: false, errMsg: (err && err.errMsg) || String(err), errno: err && err.errno }) },
        }))
      })
    }), APIS, CALLS)

    console.log(`基础库 SDKVersion = ${out.sdk}\n`)
    console.log('接口存在性（function = 有这个接口）')
    APIS.forEach((k) => console.log(`  ${k.padEnd(24)} ${out.exist[k]}`))
    console.log('\n真调一次看微信回什么')
    out.results.forEach((r) => {
      console.log(`  ${r.api}: ${r.skipped || (r.ok ? 'success（模拟器接住了）' : r.timedOut || `fail errno=${r.errno} ${r.errMsg}`)}`)
    })
    console.log('\n读法：fail 里出现 "not supported"/"invalid" 一类是接口本身不通；')
    console.log('     出现"场景""群聊""entrance"一类是入口不对，真机从对应场景进就能用。')
  } finally {
    await mp.disconnect()
  }
})().catch((e) => { console.error('探针崩了', e.message); process.exit(2) })
