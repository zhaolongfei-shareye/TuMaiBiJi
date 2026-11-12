// 取证件自审：node /tmp/rpt-selfcheck.js
const fs = require('fs')
const { spawn } = require('child_process')
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const FILE = 'file:///Users/zlfmac/Documents/TuMaiBiJi/docs/' + encodeURIComponent('修复报告-20261112-安卓v1.2与三处修复.html')

async function main() {
  const port = 9371
  const p = spawn(CH, ['--headless=new', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/cdp-rpt-self',
    '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore', detached: true })
  p.unref()
  await new Promise((r) => setTimeout(r, 3000))
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = list.find((x) => x.type === 'page') || list[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0; const waiting = new Map(); const errs = []
  const send = (m, q) => new Promise((res, rej) => { const n = ++id; waiting.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method: m, params: q || {} })) })
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 240))
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 240))
    if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result) }
  })
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  await send('Page.enable'); await send('Runtime.enable')
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails))
    return r.result.value
  }
  const probe = `(() => {
    const cw = document.documentElement.clientWidth
    const imgs = [].slice.call(document.images)
    return {
      clientW: cw, docW: document.documentElement.scrollWidth,
      hScroll: document.documentElement.scrollWidth > cw + 1,
      docH: document.documentElement.scrollHeight,
      imgs: imgs.length,
      broken: imgs.filter(i => i.getAttribute('src') && i.complete && i.naturalWidth === 0).length,
      notLoaded: imgs.filter(i => i.getAttribute('src') && !i.complete).length,
      overflow: [].slice.call(document.querySelectorAll('main *')).filter(n => { if (n.closest('.tw')) return false; const b = n.getBoundingClientRect(); return b.width > 0 && (b.right > cw + 1 || b.left < -1) }).map(n => n.tagName + '.' + (n.className || '')).slice(0, 8),
      tableScrollers: [].slice.call(document.querySelectorAll('.tw')).filter(d => d.scrollWidth > d.clientWidth + 1).length,
      navLinks: document.querySelectorAll('nav.rail a').length,
      navOn: document.querySelectorAll('nav.rail a.on').length,
      h2: document.querySelectorAll('h2').length,
      tables: document.querySelectorAll('table').length,
      copyables: document.querySelectorAll('code.copy').length,
      chars: (document.querySelector('main').innerText || '').replace(/\\s+/g, ' ').trim().length,
      emptyCells: [].slice.call(document.querySelectorAll('td')).filter(c => !c.textContent.trim()).length
    }
  })()`
  const out = []
  for (const [w, h, tag] of [[1440, 1000, 'desktop'], [900, 1000, 'tablet'], [390, 844, 'phone']]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 })
    await send('Page.navigate', { url: FILE })
    await new Promise((r) => setTimeout(r, 2600))
    // 触发全部 lazy 图：滚到底再回顶
    await ev(`(async()=>{ for(let y=0;y<document.body.scrollHeight;y+=800){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,40))} window.scrollTo(0,0); return 1 })()`)
    await new Promise((r) => setTimeout(r, 1200))
    const st = await ev(probe)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    const f = `/tmp/rpt-self-${tag}.png`
    fs.writeFileSync(f, Buffer.from(shot.data, 'base64'))
    // 交互：点第一张图开灯箱
    const lbOn = await ev(`(()=>{const i=document.querySelector('.shots img');i.click();const on=document.getElementById('lb').classList.contains('on');document.getElementById('lb').click();return {on:on, closed:!document.getElementById('lb').classList.contains('on')}})()`)
    // 交互：点导航第 6 项，看 scroll-spy
    const nav = await ev(`(async()=>{const a=document.querySelectorAll('nav.rail a')[5];a.click();await new Promise(r=>setTimeout(r,2000));
      const on=document.querySelector('nav.rail a.on');return {clicked:a.dataset.t, active:on?on.dataset.t:null, top:Math.round(document.getElementById(a.dataset.t).getBoundingClientRect().top)}})()`)
    out.push({ tag, width: w, ...st, lightbox: lbOn, nav, shot: f, bytes: fs.statSync(f).size })
    await ev(`window.scrollTo(0,0)`)
  }
  fs.writeFileSync('/tmp/rpt-selfcheck.json', JSON.stringify({ views: out, jsErrors: errs }, null, 1))
  console.log(JSON.stringify({ views: out.map(o => ({ tag: o.tag, clientW: o.clientW, docW: o.docW, hScroll: o.hScroll, docH: o.docH, imgs: o.imgs, broken: o.broken, notLoaded: o.notLoaded, overflow: o.overflow, tableScrollers: o.tableScrollers, navOn: o.navOn, h2: o.h2, tables: o.tables, emptyCells: o.emptyCells, chars: o.chars, lightbox: o.lightbox, nav: o.nav, bytes: o.bytes })), jsErrors: errs }, null, 1))
  ws.close()
  try { process.kill(-p.pid) } catch (e) {}
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })