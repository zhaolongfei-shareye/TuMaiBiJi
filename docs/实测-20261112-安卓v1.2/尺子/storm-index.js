// 风暴后落到首页看结果：node /tmp/storm-index.js <调试端口> <标签>
const fs = require('fs')
const { execFileSync } = require('child_process')
const dbg = process.argv[2]
const tag = process.argv[3]
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()
  const page = list.find((p) => p.type === 'page') || list[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const waiting = new Map()
  const reqs = []
  let counting = false
  const send = (m, p) => new Promise((res, rej) => { const n = ++id; waiting.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method: m, params: p || {} })) })
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Network.requestWillBeSent' && counting && m.params.request.url.includes('api.agentsbin.cn'))
      reqs.push(m.params.request.url.replace('https://api.agentsbin.cn/wtsj', ''))
    if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result) }
  })
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails))
    return r.result.value
  }
  counting = true
  await evaluate(`(function(){ Router.go('index'); return 1 })()`)
  await new Promise((r) => setTimeout(r, 6000))
  counting = false
  const byUrl = {}
  for (const u of reqs) byUrl[u] = (byUrl[u] || 0) + 1
  const state = await evaluate(`(function(){
    function box(id){ var n=document.getElementById(id); if(!n) return null; var s=getComputedStyle(n); var r=n.getBoundingClientRect()
      return { disp:s.display, text:(n.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60), y:Math.round(r.top), h:Math.round(r.height) } }
    var root=document.getElementById('app')
    return { hash:location.hash, uid:localStorage.getItem('authUserId'),
      loading:box('idx-loading'), empty:box('idx-empty'), stats:box('idx-stats'), cats:box('idx-cats'),
      rows: document.querySelectorAll('#idx-groups .ixl-row, #idx-list .ixl-row').length,
      tabbar:(function(){var n=document.getElementById('tab-bar');return n?getComputedStyle(n).display:null})(),
      chars:(root.innerText||'').replace(/\\s+/g,' ').trim().length,
      text:(root.innerText||'').replace(/\\s+/g,' ').trim().slice(0,160) }
  })()`)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const file = `/tmp/rpt-storm-${tag}-index.png`
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
  const out = { tag, api_requests_in_6s: reqs.length, byUrl, state, shot: file, shot_bytes: fs.statSync(file).size }
  fs.writeFileSync(`/tmp/rpt-storm-${tag}-index.json`, JSON.stringify(out, null, 1))
  console.log(JSON.stringify(out, null, 1))
  ws.close()
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })