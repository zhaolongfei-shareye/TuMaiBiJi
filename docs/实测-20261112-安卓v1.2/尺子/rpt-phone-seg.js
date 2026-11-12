// 手机档分段现截：整页 20080px 超过 Chrome 单面 16384 上限，整页图会重复贴，必须分段
const fs = require('fs')
const { spawn } = require('child_process')
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const FILE = 'file:///Users/zlfmac/Documents/TuMaiBiJi/docs/' + encodeURIComponent('修复报告-20261112-安卓v1.2与三处修复.html')

async function main() {
  const port = 9373
  const p = spawn(CH, ['--headless=new', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/cdp-rpt-seg',
    '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore', detached: true })
  p.unref()
  await new Promise((r) => setTimeout(r, 3000))
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = list.find((x) => x.type === 'page') || list[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0; const waiting = new Map()
  const send = (m, q) => new Promise((res, rej) => { const n = ++id; waiting.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method: m, params: q || {} })) })
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result) }
  })
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  await send('Page.enable'); await send('Runtime.enable')
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails))
    return r.result.value
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url: FILE })
  await new Promise((r) => setTimeout(r, 2600))
  await ev(`(async()=>{ for(let y=0;y<document.body.scrollHeight;y+=800){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,30))} window.scrollTo(0,0); return 1 })()`)
  await new Promise((r) => setTimeout(r, 1000))
  const H = await ev('document.documentElement.scrollHeight')
  const STEP = 3200
  const files = []
  for (let y = 0, i = 1; y < H; y += STEP, i++) {
    const h = Math.min(STEP, H - y)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y, width: 390, height: h, scale: 1 } })
    const f = `/tmp/rpt-seg-phone-${String(i).padStart(2, '0')}.png`
    fs.writeFileSync(f, Buffer.from(shot.data, 'base64'))
    files.push({ f, y, h, bytes: fs.statSync(f).size })
  }
  fs.writeFileSync('/tmp/rpt-seg-phone.json', JSON.stringify({ docH: H, step: STEP, files }, null, 1))
  console.log(JSON.stringify({ docH: H, files }, null, 1))
  ws.close()
  try { process.kill(-p.pid) } catch (e) {}
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })