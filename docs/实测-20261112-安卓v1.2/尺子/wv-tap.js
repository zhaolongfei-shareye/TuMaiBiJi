// 真输入事件（走浏览器命中测试，isTrusted=true），不是 element.click()。
// 用法: node wv-tap.js <port> <cssX> <cssY>
const [port, sx, sy] = process.argv.slice(2)
const x = Number(sx), y = Number(sy)
async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = list.find((p) => p.type === 'page') || list[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0; const waiting = new Map()
  const send = (m, p) => new Promise((res, rej) => { const n = ++id; waiting.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method: m, params: p || {} })) })
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result) } })
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  await send('Runtime.enable')
  const hit = await send('Runtime.evaluate', { expression: `(() => { const t = document.elementFromPoint(${x}, ${y}); return t ? t.tagName + '.' + (t.className || '') + ' | ' + (t.innerText||'').trim().slice(0,30) : null })()`, returnByValue: true })
  const base = { x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'touch' }
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base, buttons: 0 })
  console.log(JSON.stringify({ tapped: [x, y], elementAtPoint: hit.result.value }))
  ws.close()
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })