// 逐屏真跑：node /tmp/wv-screens.js <端口>
const fs = require('fs')
const { execFileSync } = require('child_process')
const port = process.argv[2] || '9340'
const ADB = '/opt/homebrew/share/android-commandlinetools/platform-tools/adb'

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = list.find((p) => p.type === 'page') || list[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const waiting = new Map()
  const errors = []
  const send = (method, params) =>
    new Promise((res, rej) => {
      const n = ++id
      waiting.set(n, { res, rej })
      ws.send(JSON.stringify({ id: n, method, params: params || {} }))
    })
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 300))
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 300))
    }
    if (m.id && waiting.has(m.id)) {
      const w = waiting.get(m.id)
      waiting.delete(m.id)
      if (m.error) w.rej(new Error(JSON.stringify(m.error)))
      else w.res(m.result)
    }
  })
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  await send('Runtime.enable')
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception))
    return r.result.value
  }
  const probe = `(function(){
    var root = document.getElementById('app');
    var cw = document.documentElement.clientWidth;
    var txt = (root.innerText || '').replace(/\\s+/g,' ').trim();
    var imgs = [].slice.call(root.querySelectorAll('img'));
    var broken = imgs.filter(function(i){ return i.src && i.complete && i.naturalWidth === 0 }).map(function(i){ return i.src.slice(-50) });
    var over = [].slice.call(root.querySelectorAll('*')).filter(function(n){ var r=n.getBoundingClientRect(); return r.width>0 && (r.right > cw+1 || r.left < -1) }).length;
    var tb = document.getElementById('tab-bar'), nb = document.getElementById('nav-bar');
    return { hash: location.hash, chars: txt.length, head: txt.slice(0,90), imgs: imgs.length, broken: broken, overflow: over,
      docW: document.documentElement.scrollWidth, clientW: cw,
      tabbar: tb ? getComputedStyle(tb).display : 'MISSING', navbar: nb ? getComputedStyle(nb).display : 'MISSING' };
  })()`
  const steps = [
    ['index', `Router.go('index')`],
    ['me', `Router.go('me')`],
    ['market', `Router.go('market')`],
    ['about', `Router.go('about')`],
    ['create', `Router.go('create')`],
  ]
  const out = []
  for (const [name, expr] of steps) {
    await evaluate(`(function(){ ${expr}; return 1 })()`)
    await new Promise((r) => setTimeout(r, 2200))
    const st = await evaluate(probe)
    const shot = `/tmp/ev-apk-screen-${name}.png`
    fs.writeFileSync(shot, execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 32 * 1024 * 1024 }))
    out.push({ name, ...st, shot })
  }
  console.log(JSON.stringify({ screens: out, jsErrors: errors }, null, 1))
  ws.close()
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })