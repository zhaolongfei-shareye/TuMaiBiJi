/* 一次性：查"点左栏那一条为什么没滚到那张卡"（10-21 后台优化这一轮，本机测试库）。
 * 只读，不点任何写口。跑法：
 *   echo <本机口令> | node docs/工具/探-左栏落点.mjs
 */
import { spawn } from 'node:child_process'

const OPS_URL = process.env.OPS_URL || 'http://127.0.0.1:8123/ops'
const PORT = process.env.CDP_PORT || '9371'
const PW = (await import('node:fs')).readFileSync(0, 'utf8').split('\n')[0].trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const j = async (p, o) => (await fetch(`http://127.0.0.1:${PORT}${p}`, o)).json()

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/ops-probe-${Date.now()}`,
   '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
for (let i = 0; i < 40; i++) { try { await j('/json/version'); break } catch { await sleep(250) } }
const tab = await j(`/json/new?url=${encodeURIComponent(OPS_URL)}`, { method: 'PUT' })
const ws = new WebSocket(tab.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result) }
})
await new Promise((r) => ws.addEventListener('open', r))
const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: n, method, params })) })
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text))
  return r.result ? r.result.value : undefined
}
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: OPS_URL })
await sleep(2500)
await ev(`document.getElementById('pw').value = ${JSON.stringify(PW)}; document.getElementById('btnLogin').click(); 1`)
await sleep(3000)

// 先滚到深处（复现"从卡片模板那一栏跳回总览"），再点第一条，逐时刻读落点。
await ev(`(() => { const a=[...document.querySelectorAll('#nav .navitem')]; a[13].click(); return 1 })()`)
await sleep(1200)
console.log('点第 14 条之后 y =', await ev('Math.round(window.scrollY)'))
console.log(await ev(`(() => {
  const a = [...document.querySelectorAll('#nav .navitem')];
  const out = { 起点: Math.round(window.scrollY) };
  a[0].click();
  out.点完立刻 = Math.round(window.scrollY);
  const card = document.querySelector('[data-key="overview"]');
  const r = card.getBoundingClientRect();
  out.那张卡 = { top: Math.round(r.top), 文档位置: Math.round(r.top + window.scrollY), 高: Math.round(r.height) };
  out.滚动元素 = { docScrollTop: document.documentElement.scrollTop, bodyScrollTop: document.body.scrollTop,
    winY: window.scrollY, docH: document.documentElement.scrollHeight, viewH: window.innerHeight };
  return JSON.stringify(out, null, 1)
})()`))
await sleep(1000)
console.log('一秒后 y =', await ev('Math.round(window.scrollY)'), '高亮 =', await ev('(document.querySelector("#nav .navitem.on")||{}).textContent'))
ws.close(); chrome.kill('SIGKILL')
