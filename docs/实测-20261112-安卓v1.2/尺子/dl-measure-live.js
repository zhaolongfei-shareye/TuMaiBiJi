// 下载页三档宽度现量：node /tmp/dl-measure-live.js
const fs = require('fs')
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const { spawn } = require('child_process')

async function main() {
  const port = 9361
  const p = spawn(CH, ['--headless=new', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/cdp-dl-live',
    '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore', detached: true })
  p.unref()
  await new Promise((r) => setTimeout(r, 3000))
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = list.find((x) => x.type === 'page') || list[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0; const waiting = new Map()
  const send = (m, q) => new Promise((res, rej) => { const n = ++id; waiting.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method: m, params: q || {} })) })
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result) } })
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  await send('Page.enable'); await send('Runtime.enable')
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails))
    return r.result.value
  }
  const probe = `(() => {
    const t = document.querySelector('table')
    const btns = [].slice.call(document.querySelectorAll('a.dl'))
    const rr = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] }
    const cw = document.documentElement.clientWidth
    return {
      clientW: cw, docW: document.documentElement.scrollWidth,
      hScroll: document.documentElement.scrollWidth > cw,
      rows: t ? t.rows.length : 0,
      table: t ? rr(t) : null,
      buttons: btns.map(b => ({ text: (b.textContent||'').trim(), rect: rr(b), right: Math.round(b.getBoundingClientRect().right),
        inside: b.getBoundingClientRect().right <= cw + 1, href: b.getAttribute('href') })),
      overflowEls: [].slice.call(document.querySelectorAll('*')).filter(n => { const b = n.getBoundingClientRect(); return b.width > 0 && b.right > cw + 1 }).length,
      versionTexts: [].slice.call(document.querySelectorAll('td')).map(c=>c.textContent.trim()).filter(s=>/^v?1\\.[012]$/.test(s))
    }
  })()`
  const out = []
  for (const [w, h] of [[390, 844], [768, 1024], [1200, 900]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: w < 500 })
    await send('Page.navigate', { url: 'https://agentsbin.cn/app/dl/' })
    await new Promise((r) => setTimeout(r, 2500))
    const st = await evaluate(probe)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    const file = `/tmp/rpt-dl-live-${w}.png`
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
    out.push({ width: w, ...st, shot: file, shot_bytes: fs.statSync(file).size })
  }
  fs.writeFileSync('/tmp/rpt-dl-live.json', JSON.stringify(out, null, 1))
  console.log(JSON.stringify(out.map(o => ({ w: o.width, clientW: o.clientW, docW: o.docW, hScroll: o.hScroll, rows: o.rows,
    buttons: o.buttons.map(b => ({ t: b.text, right: b.right, inside: b.inside })), overflowEls: o.overflowEls, versions: o.versionTexts, bytes: o.shot_bytes })), null, 1))
  ws.close()
  try { process.kill(-p.pid) } catch (e) {}
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })