/* 一次性自证：把 /ops 那一页在 headless Chrome 里真打开、真登录、真整屏截图。
   判据不在这里（那是 tests/test_admin_fusion.py），这一步只管"屏上到底长什么样"。

   跑法：
     /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --headless=new \
       --remote-debugging-port=9333 --user-data-dir=/tmp/ops-shot-profile --no-first-run about:blank &
     OPS_BASE=http://127.0.0.1:8123 OPS_PW=local-dev-only node tools/shot-ops-page.mjs <输出.png>
*/
const BASE = process.env.OPS_BASE || 'http://127.0.0.1:8123';
const PW = process.env.OPS_PW || 'local-dev-only';
const OUT = process.argv[2] || '/tmp/ops-page.png';
const PORT = process.env.CDP_PORT || '9333';

const j = async (path, opt) => (await fetch(`http://127.0.0.1:${PORT}${path}`, opt)).json();

async function newTab(url) {
  try {
    return await j(`/json/new?url=${encodeURIComponent(url)}`, { method: 'PUT' });
  } catch {
    return await j(`/json/new?url=${encodeURIComponent(url)}`);
  }
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  const ready = new Promise((resolve) => ws.addEventListener('open', resolve));
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return { ready, send, ws };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await j('/json/version');
  const tab = await newTab(`${BASE}/ops`);
  const cdp = connect(tab.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: `${BASE}/ops` });
  await sleep(1500);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: 2, mobile: false });

  // 真走一次登录（不塞假票：这条链的口令比对与签发也要在这一趟里过一遍）
  const login = await cdp.send('Runtime.evaluate', {
    expression: `fetch('${BASE}/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:${JSON.stringify(PW)}})}).then(r=>r.json()).then(b=>b.session||'')`,
    awaitPromise: true, returnByValue: true,
  });
  const session = login.result.value;
  if (!session) throw new Error('登录没拿到 session');

  await cdp.send('Runtime.evaluate', {
    expression: `sessionStorage.setItem('opsSession', ${JSON.stringify(session)}); location.href = '${BASE}/ops';`,
  });
  await sleep(2500);

  const state = await cdp.send('Runtime.evaluate', {
    expression: `(() => { try { return JSON.stringify({
      loginHidden: document.getElementById('login').classList.contains('hidden'),
      statCards: document.querySelectorAll('#stats .card').length,
      kindCards: document.querySelectorAll('#kinds .card').length,
      textCards: document.querySelectorAll('#texts .card').length,
      statsText: (document.getElementById('stats').textContent||'').slice(0,400),
      height: document.body.scrollHeight,
      tableRows: document.querySelectorAll('#stats table.dt tbody tr').length,
      overflow: document.documentElement.scrollWidth > 900,
    }) } catch (e) { return JSON.stringify({ pageError: String(e && e.message || e), title: document.title, body: (document.body && document.body.innerText || '').slice(0,300) }) } })()`,
    returnByValue: true,
  });
  if (!state.result || state.result.value === undefined) {
    console.log('RAW ' + JSON.stringify(state));
    throw new Error('页面里那段求值没返回值');
  }
  console.log(JSON.stringify(JSON.parse(state.result.value), null, 2));

  const measured = JSON.parse(state.result.value);
  if (!measured.height) throw new Error('页面没量到高度：' + JSON.stringify(measured).slice(0, 300));
  const h = measured.height;
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: Math.min(h, 8000), deviceScaleFactor: 2, mobile: false });
  await sleep(400);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 900, height: Math.min(h, 8000), scale: 1 } });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('saved ' + OUT);
  cdp.ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
