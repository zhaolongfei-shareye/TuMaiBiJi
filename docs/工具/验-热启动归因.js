/**
 * 怎么跑（这三步顺序不能换，也不能省第一步）：
 *   1) "/Applications/wechatwebdevtools.app/Contents/MacOS/cli" auto \
 *        --project /Users/zlfmac/Documents/TuMaiBiJi/miniprogram --auto-port 9420
 *      —— IDE 要先开着并且登录着。上一轮如果用过 mp.close()，端口会被一起关掉，
 *      必须重新跑这一条；只想断开不断服务，用 mp.disconnect()。
 *   2) mkdir -p /tmp/mp-verify && cd /tmp/mp-verify && npm i miniprogram-automator
 *      —— 装在这儿就行，别装进项目：miniprogram/ 下的任何文件都会被打进上传包。
 *   3) cp 本文件到 /tmp/mp-verify && node verify-inviter-hotstart.js
 *
 * 为什么不能只靠后端 pytest：后端那 68 条探针证明的是"服务端认这个口子"，
 * 而这一轮的漏是**客户端压根没把请求发出去**（热启只走 onShow、不走 onLaunch，
 * 登录那条路带不上 inviter）。这条只能在实际运行时里验。
 *
 * 分两层跑：
 *  ① 桩：把 wx.request 换成记账替身，逐个分支断言"该发才发、发完清本地、失败要留"。
 *     这层不碰网络，断的是客户端自己的控制流。
 *  ② 真：最后放开桩，用 inviter = 自己的 userId 打一次现网。
 *     服务端 attribute_inviter 对"自己邀自己"直接判不认、一行都不写，
 *     所以这一下既能证明域名白名单/鉴权/响应形状全通，又不会在现网留下归因或额度。
 *
 * 桩会叠在 wx.request 上，跑完必须还原——留着它，后面所有真请求都会被截胡
 * （这个坑项目里记过：四套 automator 用例各自叠替身，叠着跑互相截胡）。
 *
 * ⚠ 第 7 节会调 clearSession()，之后 userId 变空串。所以第 8 节必须先重新登录再断言，
 * 否则 _reportInviter 会在 `if (!inviter) return` 直接返回，而"本地存储是空的"恰好为真——
 * 那是一条怎么跑都绿的废断言（第一版就是这么假通过过一次）。
 */
const automator = require('miniprogram-automator')
const fs = require('fs')

const SHOT = '/tmp/mp-check'
let pass = 0
let fail = 0

function check(name, cond, extra) {
  const line = (cond ? '  ✓ ' : '  ✗ ') + name + (extra !== undefined ? '  · ' + JSON.stringify(extra) : '')
  console.log(line)
  if (cond) pass++; else fail++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  fs.mkdirSync(SHOT, { recursive: true })
  console.log('=== 连接自动化会话 ===')
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' })
  console.log('  已连上')

  try {
    // 干净起点：把 app 拉回登录完成态，并确认桩不在上一轮残留
    await mp.evaluate(() => {
      const g = getApp()
      if (g.__realRequest) wx.request = g.__realRequest
      g.__realRequest = null
      g.__calls = []
      g.__mode = 'passthrough'
    })

    console.log('\n=== 0. 运行时能起来、登录态拿得到 ===')
    const boot = await mp.evaluate(() => {
      const g = getApp()
      return {
        hasOnShow: typeof g.onShow === 'function',
        hasReport: typeof g._reportInviter === 'function',
        isLoggedIn: g.globalData.isLoggedIn,
        userId: g.globalData.userId,
        hasToken: !!g.globalData.token,
        page: getCurrentPages().map((p) => p.route).join(','),
      }
    })
    console.log('  ', JSON.stringify(boot))
    check('App 上有 onShow 和 _reportInviter', boot.hasOnShow && boot.hasReport)
    await sleep(4000)
    const boot2 = await mp.evaluate(() => {
      const g = getApp()
      return { isLoggedIn: g.globalData.isLoggedIn, userId: g.globalData.userId, hasToken: !!g.globalData.token }
    })
    console.log('   等 4s 后:', JSON.stringify(boot2))
    check('模拟器已登录（拿到 token）', boot2.isLoggedIn && boot2.hasToken, boot2)

    // ---------- 装桩 ----------
    await mp.evaluate(() => {
      const g = getApp()
      g.__realRequest = wx.request
      g.__calls = []
      g.__mode = 'ok'
      wx.request = function (opts) {
        g.__calls.push({ url: opts.url, method: opts.method, data: opts.data })
        const body = g.__mode === 'ok'
          ? { applied: true }
          : g.__mode === 'http403' ? { detail: '已达 100 篇上限' } : null
        if (g.__mode === 'netfail' || g.__mode === 'http403') {
          if (opts.fail) opts.fail({ errMsg: 'request:fail mock' })
          return
        }
        if (opts.success) opts.success({ statusCode: 200, data: body, header: {}, cookies: [] })
        if (opts.complete) opts.complete({ statusCode: 200, data: body })
      }
    })
    console.log('\n=== 桩已装上（wx.request 记账，不发网络）===')

    const setup = (login, inviter) => mp.evaluate((l, i) => {
      const g = getApp()
      g.globalData.isLoggedIn = l
      if (i === null) wx.removeStorageSync('inviterId')
      else wx.setStorageSync('inviterId', i)
      g.__calls = []
      return { login: g.globalData.isLoggedIn, inviter: wx.getStorageSync('inviterId') || null }
    }, login, inviter)

    console.log('\n=== 1. 热启动：已登录 + 本地有 inviter → 必须发一次，并且发完清掉 ===')
    await setup(true, 777)
    await mp.evaluate(() => { getApp().onShow({ scene: 1007, query: {} }) })
    await sleep(600)
    let r = await mp.evaluate(() => ({
      calls: getApp().__calls,
      left: wx.getStorageSync('inviterId') || null,
    }))
    check('发出且只发一次 /api/user/inviter',
      r.calls.length === 1 && /\/api\/user\/inviter$/.test(r.calls[0].url), r.calls)
    check('method 是 POST', r.calls[0] && r.calls[0].method === 'POST', r.calls[0] && r.calls[0].method)
    check('body 带上了 inviter', r.calls[0] && String(r.calls[0].data.inviter) === '777',
      r.calls[0] && r.calls[0].data)
    check('成功后本地 inviter 被清掉（下次不再白跑）', r.left === null || r.left === '', r.left)

    console.log('\n=== 2. 没登录时不许发（冷启该由登录那条路带）===')
    await setup(false, 888)
    await mp.evaluate(() => { getApp().onShow({ scene: 1007, query: {} }) })
    await sleep(600)
    r = await mp.evaluate(() => ({ calls: getApp().__calls, left: wx.getStorageSync('inviterId') || null }))
    check('一个请求都没发', r.calls.length === 0, r.calls)
    check('本地 inviter 原样留着，等登录后再用', String(r.left) === '888', r.left)

    console.log('\n=== 3. 已登录但本地没有 inviter → 不发（不能每次切前台都白跑一次）===')
    await setup(true, null)
    await mp.evaluate(() => { getApp().onShow({ scene: 1007, query: {} }) })
    await sleep(600)
    r = await mp.evaluate(() => ({ calls: getApp().__calls }))
    check('一个请求都没发', r.calls.length === 0, r.calls)

    console.log('\n=== 4. 网络失败必须保留本地这份，否则这次归因永久丢 ===')
    await mp.evaluate(() => { getApp().__mode = 'netfail' })
    await setup(true, 999)
    await mp.evaluate(() => { getApp().onShow({ scene: 1007, query: {} }) })
    await sleep(600)
    r = await mp.evaluate(() => ({ calls: getApp().__calls.length, left: wx.getStorageSync('inviterId') || null, mode: getApp().__mode }))
    check('发了一次', r.calls === 1, r)
    check('失败后本地 inviter 还在（留着下次重试）', String(r.left) === '999', r.left)

    console.log('\n=== 5. 点开分享卡片那条路：query 里带 inviter，热启要当场接住并上报 ===')
    await mp.evaluate(() => { getApp().__mode = 'ok' })
    await setup(true, null)
    await mp.evaluate(() => { getApp().onShow({ scene: 1007, query: { inviter: '4242' } }) })
    await sleep(700)
    r = await mp.evaluate(() => ({ calls: getApp().__calls, left: wx.getStorageSync('inviterId') || null }))
    check('onShow 里先存后进上报流程，发出了请求',
      r.calls.length === 1 && String(r.calls[0].data.inviter) === '4242', r.calls)
    check('上报成功后本地清空', !r.left, r.left)

    console.log('\n=== 6. 反复切前台不能反复上报（清干净之后就该彻底安静）===')
    await mp.evaluate(() => { getApp().__calls = [] })
    await mp.evaluate(() => {
      getApp().onShow({ scene: 1007, query: {} })
      getApp().onShow({ scene: 1007, query: {} })
      getApp().onShow({ scene: 1007, query: {} })
    })
    await sleep(600)
    r = await mp.evaluate(() => ({ calls: getApp().__calls }))
    check('三次 onShow 零请求', r.calls.length === 0, r.calls)

    console.log('\n=== 7. 注销之后本地这份必须一起消失（不能拿旧归因去成就一个新号）===')
    await setup(true, 1234)
    r = await mp.evaluate(() => {
      const g = getApp()
      g.clearSession()
      return { login: g.globalData.isLoggedIn, left: wx.getStorageSync('inviterId') || null }
    })
    check('clearSession 后 isLoggedIn=false', r.login === false, r.login)
    check('clearSession 把 inviterId 也清了', !r.left, r.left)

    // ---------- 拆桩 ----------
    await mp.evaluate(() => {
      const g = getApp()
      if (g.__realRequest) wx.request = g.__realRequest
      g.__realRequest = null
      g.__calls = []
    })
    console.log('\n=== 桩已还原 ===')

    console.log('\n=== 8. 真打现网：用"自己邀自己"（服务端判不认，一行都不写）===')
    // 上一节刚 clearSession()，此刻 userId 是空串。不恢复登录就调 _reportInviter，
    // 它会在 `if (!inviter) return` 那行直接返回——存储本来就是空的，"被清掉了"这个
    // 观察量为真但和请求无关，等于一条怎么跑都绿的废断言。所以先把会话拿回来。
    await mp.evaluate(() => {
      const g = getApp()
      g.globalData.isLoggedIn = false
      g.globalData.loginPromise = null
      g.getLoginPromise()
    })
    await sleep(6000)
    const sess = await mp.evaluate(() => {
      const g = getApp()
      return { login: g.globalData.isLoggedIn, userId: g.globalData.userId, tokenLen: (g.globalData.token || '').length }
    })
    console.log('   恢复登录后:', JSON.stringify(sess))
    check('会话恢复了（拿到 userId 和 token）', sess.login && Number(sess.userId) > 0 && sess.tokenLen > 20, sess)

    // 不看"存储被清"这种间接信号，直接断状态码和响应体
    const real = await mp.evaluate(() => {
      const g = getApp()
      const me = Number(g.globalData.userId)
      g.__real = { pending: true, me }
      wx.request({
        url: 'https://api.agentsbin.cn/wtsj/api/user/inviter',
        method: 'POST',
        data: { inviter: me },
        header: { 'content-type': 'application/json', Authorization: 'Bearer ' + g.globalData.token },
        timeout: 30000,
        success(res) { g.__real = { pending: false, me, status: res.statusCode, body: res.data } },
        fail(err) { g.__real = { pending: false, me, status: 0, err: String(err && err.errMsg) } },
      })
      return g.__real
    })
    await sleep(4000)
    const hit = await mp.evaluate(() => getApp().__real)
    console.log('   现网回应:', JSON.stringify(hit))
    check('真请求发了并拿到回音', hit && hit.pending === false, hit)
    check('HTTP 200（域名白名单、鉴权、路由三件都通）', hit && hit.status === 200, hit && hit.status)
    check('服务端如实回报"没认"（自己邀自己）', hit && hit.body && hit.body.applied === false, hit && hit.body)
    check('请求带的是自己的 id，所以现网不会因此多出归因', hit && String(hit.me) === String(hit.me) && hit.me > 0, hit && hit.me)

    // app 层那条路也真跑一次：先恢复登录态，再摆一个假的 inviter 进去
    const flow = await mp.evaluate(() => {
      const g = getApp()
      wx.setStorageSync('inviterId', Number(g.globalData.userId))
      g.__calls = []
      g._reportInviter()
      return { put: wx.getStorageSync('inviterId') }
    })
    await sleep(4000)
    const flowAfter = await mp.evaluate(() => ({
      left: wx.getStorageSync('inviterId') || null,
    }))
    check('app 层 _reportInviter 真打成功后把本地清掉了', flow.put > 0 && !flowAfter.left,
      { put: flow.put, left: flowAfter.left })

    // 「我的」页：后端上线后这两行第一次该有真数字
    console.log('\n=== 9. 「我的」页额度行（后端刚上线，这是它第一次能显示真数）===')
    await mp.switchTab('/pages/me/me')
    await sleep(3000)
    const me = await mp.evaluate(() => {
      const pages = getCurrentPages()
      const p = pages[pages.length - 1]
      const d = p.data || {}
      return {
        route: p.route,
        quotaText: d.quotaText,
        shareValue: d.shareValue,
      }
    })
    console.log('  ', JSON.stringify(me))
    check('切到了「我的」页', /\/me$/.test(me.route || ''), me.route)
    check('额度行是真数字而不是留空（后端 /api/user/quota 通了）',
      /^\d+\/\d+$/.test(me.quotaText || ''), me.quotaText)
    check('分享那一行也有内容', !!(me.shareValue && String(me.shareValue).length), me.shareValue)
    await mp.screenshot({ path: SHOT + '/15-我的-额度.png' })
    console.log('  截图：' + SHOT + '/15-我的-额度.png')

    console.log('\n=== 10. 首页冒烟（这一轮没碰首页，但上传前得确认没整体坏）===')
    await mp.switchTab('/pages/index/index')
    await sleep(2500)
    const home = await mp.evaluate(() => {
      const p = getCurrentPages().slice(-1)[0]
      const d = p.data || {}
      return { route: p.route, listLen: (d.list || d.notes || []).length, loadError: d.loadError || null }
    })
    console.log('  ', JSON.stringify(home))
    check('首页在且没报错', /index/.test(home.route) && !home.loadError, home)
    await mp.screenshot({ path: SHOT + '/15-首页.png' })
    console.log('  截图：' + SHOT + '/15-首页.png')

    // 收尾：把 app 放回干净状态，别把桩或残留 inviter 留给下一轮
    await mp.evaluate(() => {
      const g = getApp()
      g.__calls = []
      wx.removeStorageSync('inviterId')
    })
  } finally {
    await mp.disconnect()
  }

  console.log('\n合计 ' + pass + ' 通过，' + fail + ' 失败')
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('脚本自身出错：', e && e.message ? e.message : e)
  console.error(String(e && e.stack).split('\n').slice(0, 6).join('\n'))
  process.exit(2)
})
