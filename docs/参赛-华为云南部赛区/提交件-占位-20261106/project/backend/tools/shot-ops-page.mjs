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
      tplCards: document.querySelectorAll('#tpls .card').length,
      tplSummary: (document.getElementById('tpls').textContent||'').replace(/\\s+/g,' ').slice(0,160),
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
  const { writeFileSync } = await import('node:fs');

  // 一屏一张：数据 / 配置 / 卡片模板（OPS_CLICK 给逗号分隔的左栏条目名，各存一张）。
  const labels = (process.env.OPS_CLICK || '').split(',').map((s) => s.trim()).filter(Boolean);
  const shots = labels.length
    ? [{ file: OUT.replace(/\.png$/, '-数据.png'), label: null },
       ...labels.map((lb) => ({ file: OUT.replace(/\.png$/, `-${lb}.png`), label: lb }))]
    : [{ file: OUT, label: null }];

  for (const s of shots) {
    if (s.label) {
      await cdp.send('Runtime.evaluate', {
        expression: `(() => { const all = document.querySelectorAll('#nav s');
          for (const n of all) if (n.textContent === ${JSON.stringify(s.label)}) { n.click(); return 'clicked'; }
          return 'nav 里没这条：' + Array.from(all).map(x => x.textContent).join('/'); })()`,
        returnByValue: true,
      });
      await sleep(500);
    }
    const m = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({shown:[...document.querySelectorAll('#app .view')].filter(v=>!v.classList.contains('hidden')).map(v=>v.id), navOn:(document.querySelector('#nav s.on')||{}).textContent, height:document.body.scrollHeight})`,
      returnByValue: true,
    });
    console.log(s.file.split('/').pop() + ' → ' + m.result.value);
    const info = JSON.parse(m.result.value);
    const h = Math.min(info.height, 8000);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: h, deviceScaleFactor: 2, mobile: false });
    await sleep(300);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 900, height: h, scale: 1 } });
    writeFileSync(s.file, Buffer.from(shot.data, 'base64'));
    console.log('saved ' + s.file);
  }
  cdp.ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
