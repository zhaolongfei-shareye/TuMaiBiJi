// 死票 401 风暴：同一把尺子量修复前/后两棵树。node /tmp/storm-count.js <调试端口> <站点端口> <标签>
const fs = require('fs')
const dbg = process.argv[2]
const site = process.argv[3]
const tag = process.argv[4]
const WINDOW = 6000

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()
  const page = list.find((p) => p.type === 'page') || list[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const waiting = new Map()
  const reqs = []
  const failed = []
  let counting = false
  let t0 = 0
  const send = (method, params) =>
    new Promise((res, rej) => {
      const n = ++id
      waiting.set(n, { res, rej })
      ws.send(JSON.stringify({ id: n, method, params: params || {} }))
    })
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Network.requestWillBeSent' && counting) {
      const u = m.params.request.url
      if (u.includes('api.agentsbin.cn')) {
        reqs.push({ t: Date.now() - t0, url: u.replace('https://api.agentsbin.cn/wtsj', '') })
      }
    }
    if (m.method === 'Network.loadingFailed' && counting) {
      failed.push(m.params.errorText)
    }
    if (m.id && waiting.has(m.id)) {
      const w = waiting.get(m.id)
      waiting.delete(m.id)
      if (m.error) w.rej(new Error(JSON.stringify(m.error)))
      else w.res(m.result)
    }
  })
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails))
    return r.result.value
  }

  // 1) 先进一次页，拿到 localStorage 的域
  await send('Page.navigate', { url: `http://127.0.0.1:${site}/index.html` })
  await new Promise((r) => setTimeout(r, 2500))
  const seeded = await evaluate(`(function(){
    localStorage.setItem('authToken','DEADTICKET-0000000000000000')
    localStorage.setItem('authUserId','246')
    return { token: localStorage.getItem('authToken'), uid: localStorage.getItem('authUserId'), origin: location.origin }
  })()`)

  // 2) 开表，重载，数 WINDOW 毫秒
  reqs.length = 0
  failed.length = 0
  counting = true
  t0 = Date.now()
  await send('Page.reload', { ignoreCache: true })
  await new Promise((r) => setTimeout(r, WINDOW))
  counting = false
  const elapsed = Date.now() - t0

  const byUrl = {}
  for (const r of reqs) byUrl[r.url] = (byUrl[r.url] || 0) + 1
  const state = await evaluate(`(function(){
    function box(id){ var n=document.getElementById(id); if(!n) return null; var s=getComputedStyle(n);
      return { disp:s.display, text:(n.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60) } }
    var root=document.getElementById('app')
    return {
      hash: location.hash,
      token: (localStorage.getItem('authToken')||'').slice(0,12),
      uid: localStorage.getItem('authUserId'),
      guestMode: !!(window.App && App.globalData.guestMode),
      loading: box('idx-loading'), empty: box('idx-empty'), stats: box('idx-stats'),
      tabbar: (function(){var n=document.getElementById('tab-bar'); return n?getComputedStyle(n).display:null})(),
      chars: (root.innerText||'').replace(/\\s+/g,' ').trim().length,
      head: (root.innerText||'').replace(/\\s+/g,' ').trim().slice(0,120)
    }
  })()`)

  const out = { tag, site: `http://127.0.0.1:${site}/`, window_ms: WINDOW, elapsed_ms: elapsed, seeded,
    total_api_requests: reqs.length, byUrl, loadingFailed: failed.length,
    failedKinds: Array.from(new Set(failed)), state, first20: reqs.slice(0, 20), last10: reqs.slice(-10) }
  fs.writeFileSync(`/tmp/rpt-storm-${tag}.json`, JSON.stringify(out, null, 1))
  console.log(JSON.stringify({ tag, total: out.total_api_requests, byUrl, failed: out.loadingFailed, state }, null, 1))
  ws.close()
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })