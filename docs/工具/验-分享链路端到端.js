// 分享这一整条链路在"客户端这一侧"的端到端验证：跑在开发者工具里，打的是现网真接口。
// 后端那条探针（probes/share_live_probe.py）证明的是服务端行为对；这里证明的是
// "1.2.0 这个包里的界面真的按那些接口走"，包括生成海报、状态行出现、撤掉之后消失、
// 重新分享换新 token、以及已撤掉的旧 token 不会再被客户端拿去用。
//
// 用法（先起自动化会话，跑完记得关掉，否则真机调试会被这个会话占住）：
//   /Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
//       --project /Users/zlfmac/Documents/TuMaiBiJi/miniprogram --auto-port 9420
//   node docs/工具/验-分享链路端到端.js
//   /Applications/wechatwebdevtools.app/Contents/MacOS/cli close \
//       --project /Users/zlfmac/Documents/TuMaiBiJi/miniprogram
//
// 它会往现网真库里建一条标题为"分享链路自检 xxxxxx"的笔记，跑完按 id 删掉；
// 开头还会先清掉上一次挂掉时留下的同类笔记。用的登录态是模拟器里那个真实账号。
//
// 一处说明：wx.showModal 在这里被换成"直接确认"。弹层是微信自己画的、自动化点不到，
// 而确认之后的那段是产品代码本身（api.revokeShare → setData），所以这条缝只替掉了"用手指点一下"。
// 状态行本身是真点的（page.$('.share-state').tap()），不是直接调 onUnshare。
const automator = require('miniprogram-automator')

const BASE = 'https://api.agentsbin.cn/wtsj'
const MARK = Date.now().toString(36).slice(-6)
const TITLE = `分享链路自检 ${MARK}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const ck = (name, ok, detail) => {
  results.push([name, !!ok, detail])
  console.log(`${ok ? '✓' : '✗'} ${name}` + (detail ? `  · ${detail}` : ''))
}
const pub = async (token) => {
  const r = await fetch(`${BASE}/api/shares/${token}`)
  let body = ''
  try { body = await r.text() } catch (e) {}
  return { status: r.status, body }
}

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' })
  let noteId = null
  let jwt = ''
  try {
    // 登录是异步的：app.onLaunch 里 wx.login → 后端换 JWT，模拟器起来那一瞬还没有 token
    let tok = ''
    for (let i = 0; i < 40 && !tok; i++) {
      await sleep(500)
      tok = await mp.evaluate(() => getApp().globalData.token || '')
    }
    jwt = tok
    ck('模拟器里已登录，拿到现网 JWT', jwt.length > 30, `长度 ${jwt.length}`)
    if (!jwt) throw new Error('没拿到 token，后面全是空跑，直接停')

    // 上一次跑挂在这儿的话会留一条自检笔记在真库里；先按标题清干净再建新的
    const H = { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` }
    const list = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    const leftovers = (list.items || list).filter((n) => String(n.title || '').startsWith('分享链路自检'))
    for (const n of leftovers) {
      const r = await fetch(`${BASE}/api/notes/${n.id}`, { method: 'DELETE', headers: H })
      ck(`清掉上一次遗留的自检笔记 id=${n.id}`, [200, 204].includes(r.status), `HTTP ${r.status}`)
    }

    // 笔记本身用接口建，测的是分享这条链，不是新建表单；跑完按 id 删掉
    const created = await fetch(`${BASE}/api/notes/`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ title: TITLE, summary: `这一条只给自检用 ${MARK}`, source_url: `https://example.com/${MARK}` }),
    })
    noteId = (await created.json()).id
    ck('在现网建了一条自检用的笔记', created.status === 200 && !!noteId, `id=${noteId} HTTP ${created.status}`)

    const page = async (url) => {
      await mp.reLaunch(url)
      await sleep(2600)
      for (let i = 0; i < 20 && !(await mp.currentPage()); i++) await sleep(400)
      const pg = await mp.currentPage()
      if (!pg) throw new Error(`reLaunch ${url} 之后拿不到页面对象`)
      return pg
    }

    // ---- 1. 还没分享过：那行不该出现 ------------------------------------------
    let p = await page(`/pages/detail/detail?id=${noteId}`)
    let d = await p.data()
    ck('刚建好的笔记，详情页知道它没在公开', d.shared === false, `shared=${JSON.stringify(d.shared)}`)
    ck('状态行确实没渲染出来', (await p.$$('.share-state')).length === 0)

    // ---- 2. 生成分享图：出图 + 拿到 token --------------------------------------
    await mp.navigateTo(`/pages/share/share?id=${noteId}`)
    await sleep(6000)
    let sd = await mp.evaluate(() => {
      const q = getCurrentPages().slice(-1)[0]
      return { route: q.route, generating: q.data.generating, imagePath: q.data.imagePath, canvasH: q.data.canvasH, token: q._token }
    })
    ck('海报页走到终点，没卡在"生成中"', sd.generating === false && sd.imagePath, `imagePath=${String(sd.imagePath).slice(0, 34)}`)
    ck('拿到分享 token', !!sd.token, `${String(sd.token).slice(0, 8)}…`)
    ck('海报按内容定高（不是写死的 1200）', sd.canvasH > 600 && sd.canvasH !== 1200, `canvasH=${sd.canvasH}`)
    await mp.screenshot({ path: `/tmp/mp-verify/分享-${MARK}.png` })

    const before = await pub(sd.token)
    ck('① 这张码匿名扫得开，公开页带着真实标题', before.status === 200 && before.body.includes(TITLE), `HTTP ${before.status}`)
    const token1 = sd.token

    // ---- 3. 回到详情页：那一行应该自己冒出来 ----------------------------------
    p = await page(`/pages/detail/detail?id=${noteId}`)
    d = await p.data()
    ck('② 回详情页后状态行出现（onShow 会重读状态，不是只在 onLoad 读一次）',
      d.shared === true && (await p.$$('.share-state')).length === 1)

    // ---- 4. 撤掉分享：整段产品代码跑真接口 ------------------------------------
    let overrideOk = true
    await mp.evaluate(() => {
      try {
        wx.showModal = (o) => {
          o.success && o.success({ confirm: true, cancel: false })
          o.complete && o.complete({ confirm: true, cancel: false })
          return Promise.resolve({ confirm: true, cancel: false })
        }
      } catch (e) {
        return 'fail'
      }
    }).catch(() => { overrideOk = false })
    const tapped = await p.$('.share-state')
    if (tapped && overrideOk) await tapped.tap()
    else await mp.evaluate(() => getCurrentPages().slice(-1)[0].onUnshare())
    await sleep(2200)
    d = await (await mp.evaluate(() => {
      const q = getCurrentPages().slice(-1)[0]
      return Promise.resolve(q.data)
    }))
    const rowsAfter = (await (await mp.currentPage()).$$('.share-state')).length
    ck('③ 点撤掉之后界面立刻改口：不再公开', d.shared === false && rowsAfter === 0,
      `shared=${JSON.stringify(d.shared)} · 状态行 ${rowsAfter} 个 · 走的是${(tapped && overrideOk) ? '真点那一行' : 'onUnshare()'}`)
    const after = await pub(token1)
    ck('③ 已经发出去那张码，服务端这边当场扫不开', after.status === 404, `HTTP ${after.status}`)

    // ---- 5. 重新分享：换新码，旧码不复活 --------------------------------------
    await mp.navigateTo(`/pages/share/share?id=${noteId}`)
    await sleep(5500)
    const sd2 = await mp.evaluate(() => {
      const q = getCurrentPages().slice(-1)[0]
      return { generating: q.data.generating, token: q._token }
    })
    ck('④ 重新分享给的是全新的一张码', sd2.generating === false && !!sd2.token && sd2.token !== token1,
      `旧 ${token1.slice(0, 6)}… → 新 ${String(sd2.token).slice(0, 6)}…`)
    const oldAgain = await pub(token1)
    const newOne = await pub(sd2.token)
    ck('④ 旧码没被这次分享救活', oldAgain.status === 404, `HTTP ${oldAgain.status}`)
    ck('④ 新码扫得开', newOne.status === 200, `HTTP ${newOne.status}`)
    p = await page(`/pages/detail/detail?id=${noteId}`)
    ck('④ 回到详情页又如实显示"这篇已经公开"', (await p.data()).shared === true)

    // ---- 6. 收尾：删掉这条笔记，那张码也该跟着死 ------------------------------
    const del = await fetch(`${BASE}/api/notes/${noteId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${jwt}` } })
    ck('删掉自检用的笔记', [200, 204].includes(del.status), `HTTP ${del.status}`)
    const gone = await pub(sd2.token)
    ck('删完那张码扫不开（隐私承诺那条在客户端链路上也成立）', gone.status === 404, `HTTP ${gone.status}`)
    noteId = null
  } catch (e) {
    ck('脚本自身没炸', false, e.message)
  } finally {
    await mp.disconnect()
    const bad = results.filter(([, ok]) => !ok)
    console.log(`\n${results.length - bad.length}/${results.length} 条通过  · 标记=${MARK}`)
    if (bad.length) bad.forEach(([n, , det]) => console.log(`  ✗ ${n} — ${det}`))
    if (noteId) console.log(`注意：自检笔记 id=${noteId} 没删掉，要手工清`)
    process.exit(bad.length ? 1 : 0)
  }
})().catch((e) => { console.error('连不上自动化会话：', e.message); process.exit(2) })
