// 死票回归 + 现截两帧：node /tmp/wv-deadticket-shot.js <port>
const fs = require('fs')
const { execFileSync } = require('child_process')
const port = process.argv[2] || '9340'
const ADB = '/opt/homebrew/share/android-commandlinetools/platform-tools/adb'
const shot = (f) => fs.writeFileSync(f, execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 32 * 1024 * 1024 }))

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = list.find((p) => p.type === 'page') || list[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0; const waiting = new Map()
  const send = (m, p) => new Promise((res, rej) => { const n = ++id; waiting.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method: m, params: p || {} })) })
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result) } })
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  await send('Runtime.enable'); await send('Page.enable')
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails))
    return r.result.value
  }
  await evaluate(`(function(){ Router.go('index'); return 1 })()`)
  await new Promise((r) => setTimeout(r, 1500))
  const before = await evaluate(`(function(){
    var t = localStorage.getItem('authToken') || ''
    localStorage.setItem('authToken', t.slice(0, -6) + 'AAAAAA')
    return { len: t.length, userId: localStorage.getItem('authUserId'), hash: location.hash }
  })()`)
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__probe = { n: 0, byUrl: {}, t0: Date.now() }
    ;(function(){ var of = window.fetch
      window.fetch = function(u){ window.__probe.n++
        var k = String(typeof u === 'string' ? u : (u && u.url) || '').replace('https://api.agentsbin.cn/wtsj','')
        window.__probe.byUrl[k] = (window.__probe.byUrl[k] || 0) + 1
        return of.apply(this, arguments) } })()
  ` })
  await send('Page.reload', { ignoreCache: false })
  await new Promise((r) => setTimeout(r, 900))
  shot('/tmp/rpt-dead-01-ticket.png')
  const early = await evaluate(`(function(){ return { n: (window.__probe||{}).n, hash: location.hash,
    loading: (function(){var e=document.getElementById('idx-loading');return e?getComputedStyle(e).display:null})() } })()`)
  await new Promise((r) => setTimeout(r, 8500))
  const after = await evaluate(`(function(){
    var g = App.globalData
    var q = function(id){ var e = document.getElementById(id); return e ? { disp: getComputedStyle(e).display, text: (e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,40) } : null }
    return { probe: window.__probe, elapsed_ms: Date.now() - window.__probe.t0,
      hash: location.hash, userId: g.userId, guestMode: !!g.guestMode, isGuestAccount: !!g.isGuestAccount,
      storedUserId: localStorage.getItem('authUserId'),
      loading: q('idx-loading'), empty: q('idx-empty'), stats: q('idx-stats'), cats: q('idx-cats'),
      tabbar: getComputedStyle(document.getElementById('tab-bar')).display,
      text: (document.getElementById('app').innerText||'').replace(/\\s+/g,' ').trim().slice(0,140) }
  })()`)
  shot('/tmp/rpt-dead-02-recovered.png')
  const out = { before, early, after, shots: ['/tmp/rpt-dead-01-ticket.png', '/tmp/rpt-dead-02-recovered.png'] }
  fs.writeFileSync('/tmp/rpt-deadticket-shot.json', JSON.stringify(out, null, 1))
  console.log(JSON.stringify(out, null, 1))
  ws.close()
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })