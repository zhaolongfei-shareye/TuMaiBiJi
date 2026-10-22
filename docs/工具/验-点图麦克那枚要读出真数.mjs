/* 只读数、不动手：站长 10-22 那句「图麦笔记在后台登录以后，点击跳转图麦克后台，数据能直接看到，而不需要二次登录」到底通不通，
 * 用三种态各跑一次现网（后端一个字节都不改，改后那份页面是用 CDP 的 Fetch 拦下来换进去的）：
 *
 *   REPRO  不改任何东西，只在框加载前把一枚**过期票**塞进 localStorage —— 复现他截图那一屏（全 0 ＋「共 undefined 用户」）
 *   FIXED  同一枚过期票，但把现网那份 `admin.html` 换成本机改后那份 —— 应当自己重换一把票、读出真数
 *   CLEAN  干净档案（没有旧票），走正常换票那一条 —— 防我这一刀把本来好的那条路改坏
 *   DIRECT 只塞旧票、**不给** opsSession（他自己在地址栏开 `/admin.html` 那一条）—— 改后那页要把口令框还回去并说清为什么，
 *          不许留着那一屏假 0。这一档不需要口令。
 *   LIVE   不带任何拦截，就打在现网那一份上，仍塞一枚过期票 —— 页面送上线之后的验收那一发：应当自己换到新票、读出真数。
 *          （上线之后 REPRO 那一档会转红，那是**预期的**：它钉的是"旧版那份会把 401 画成 0"，旧版不在了它就该红。）
 *
 * 为什么判据是"框里读到几个数"而不是"换票口回 200"：`探-现网后台融合.py` 那 45 条今早全过，
 * 屏上却是一排 0 —— 那条链的最后一米在浏览器里，只有读 `contentDocument` 才算证（[[feedback-claim-only-what-tools-show]]）。
 *
 * 跑法（口令走 stdin，不进 argv、不上屏；DIRECT 那一档 `echo x |` 即可）：
 *   ssh agentsbin "cd /home/ubuntu/wtsj-backend && sed -n 's/^ADMIN_TOKEN=//p' .env" \
 *     | MODE=REPRO CDP_PORT=9381 node docs/工具/验-点图麦克那枚要读出真数.mjs
 */
import { spawn } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const MODE = process.env.MODE || 'REPRO'
const CDP_PORT = process.env.CDP_PORT || '9381'
const OPS_URL = 'https://api.agentsbin.cn/wtsj/ops'
const THEIR_PAGE = 'https://api.agentsbin.cn/admin.html'
const PATCHED = process.env.PATCHED_HTML || '/Users/zlfmac/Documents/AgentsWatermark/cloud/image-service/app/admin.html'
const OUT = 'docs/design/后台融合-图麦克读数-20261022'
const W = 1440, H = 900

const PW = (readFileSync(0, 'utf8').split('\n')[0] || '').trim()
if (!PW && MODE !== 'DIRECT') { console.log('FAIL  stdin 没读到口令'); process.exit(1) }
const STALE = 'eyJ0aGlzIjoibm90L2EtdGlja2V0In0.past-the-window'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const j = async (p, o) => (await fetch(`http://127.0.0.1:${CDP_PORT}${p}`, o)).json()

let patchedBody = null
if (['FIXED', 'CLEAN', 'DIRECT'].includes(MODE)) patchedBody = readFileSync(PATCHED)   // 只有这三档拦下来换成本机那份

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const exceptions = []
  ws.addEventListener('message', (ev2) => {
    const m = JSON.parse(ev2.data)
    if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text))
    }
    if (m.method === 'Fetch.requestPaused') {
      const req = m.params.request
      if (patchedBody && req.url === THEIR_PAGE) {
        send('Fetch.fulfillRequest', {
          requestId: m.params.requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
          body: Buffer.from(patchedBody).toString('base64'),
        }).catch((e) => exceptions.push('拦截回填失败：' + e.message))
      } else {
        send('Fetch.continueRequest', { requestId: m.params.requestId }).catch(() => {})
      }
      return
    }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id)
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result)
    }
  })
  const ready = new Promise((r) => ws.addEventListener('open', r))
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id; pending.set(n, { resolve: res, reject: rej })
    ws.send(JSON.stringify({ id: n, method, params }))
  })
  return { ready, send, ws, exceptions }
}

const lines = []
const say = (s) => { lines.push(s); console.log(s) }

// 框里那一屏此刻念了什么。只读 DOM，一个字都不输、一枚按钮都不点。
const DIRECT = MODE === 'DIRECT'
const R = `(() => {
  const f = document.querySelector('iframe');
  const out = { 框在: ${DIRECT} ? true : !!f, src: ${DIRECT} ? '(顶层直接开那一页)' : (f ? (f.getAttribute('src') || '(没挂)') : '(没有框)') };
  try {
    const d = ${DIRECT} ? document : (f && f.contentDocument);
    if (!d || !d.body) { out.读不到 = '框里还没有文档'; return JSON.stringify(out); }
    const g = (id) => { const n = d.getElementById(id); return n ? (n.textContent || '').trim() : '(没有这一格)'; };
    const vis = (id) => { const n = d.getElementById(id); return !!n && !n.classList.contains('hidden'); };
    out.标题 = (d.title || '').slice(0, 24);
    out.六格 = { 总用户数: g('totalUsers'), 今日访问: g('todayVisits'), 本周新增: g('weekNewUsers'),
      图片处理总数: g('totalImages'), 今日处理: g('todayImages'), VIP兑换数: g('vipRedeems'), 未使用VIP码: g('unusedVipCodes') };
    out.那一行 = g('userStats');
    out.在屏上 = { dashboard: vis('dashboardView'), 口令页: vis('loginView') };
    out.那句报错 = g('fusionError');
    const pw = d.querySelector('#fusionPassword');
    out.口令框真在屏上 = !!pw && pw.getBoundingClientRect().height > 0;
    out.可见表行数 = [...d.querySelectorAll('tr')].filter((r) => r.getBoundingClientRect().height > 0).length;
    out.存过的票 = (() => { try { const v = d.localStorage.getItem('adminToken'); return v ? '有 ' + v.length + ' 字' : '无'; } catch (e) { return '(读不到)' } })();
  } catch (e) { out.读不到原因 = String(e && e.message || e).slice(0, 80) }
  return JSON.stringify(out);
})()`

async function ev(expr) {
  const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('页面里那句挂了：' + JSON.stringify(r.exceptionDetails).slice(0, 300))
  return r.result && r.result.value
}
const parse = async (expr) => JSON.parse(await ev(expr))

async function shot(name) {
  const r = await c.send('Page.captureScreenshot', { format: 'png' })
  if (r.data) { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${MODE}-${name}.png`, Buffer.from(r.data, 'base64')) }
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/tmk-read-${MODE}-${Date.now()}`,
    '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
for (let i = 0; i < 60; i++) { try { await j('/json/version'); break } catch (e) { await sleep(500) } }

const list = await j('/json/list')
await j(`/json/new?${encodeURIComponent(OPS_URL)}`, { method: 'PUT' }).catch(() => {})
const l2 = await j('/json/list')
const p2 = l2.find((x) => x.type === 'page' && /ops/.test(x.url)) || l2.find((x) => x.type === 'page') || list[0]
const c = connect(p2.webSocketDebuggerUrl)
await c.ready
await c.send('Runtime.enable')
await c.send('Page.enable')
if (patchedBody) await c.send('Fetch.enable', { patterns: [{ urlPattern: '*agentsbin.cn/admin.html', requestStage: 'Request' }] })
await c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
await c.send('Page.navigate', { url: OPS_URL })
await sleep(3000)

let code = 0
try {
  if (DIRECT) {
    await c.send('Page.navigate', { url: THEIR_PAGE })
    await sleep(2500)
    await ev(`localStorage.setItem('adminToken', ${JSON.stringify(STALE)}); 1`)
    say('只塞一枚过期票、不给 opsSession（他自己在地址栏开 /admin.html 那一条路）')
    await c.send('Page.navigate', { url: THEIR_PAGE })
    await sleep(4000)
  } else {
  await ev(`(() => { const i = document.getElementById('pw'); if (!i) return 1; i.value = ${JSON.stringify(PW)};
    document.getElementById('btnLogin').click(); return 1 })()`)
  await sleep(2500)
  const ok = await ev(`(() => { const a = document.getElementById('app'); return a && !a.classList.contains('hidden') ? 1 : 0 })()`)
  if (!ok) { say('FAIL  没登进 /ops（口令不对，或那一侧接口变了）'); throw new Error('login') }
  say(`模式 ${MODE}　${patchedBody ? '框里那份页面用的是本机改后版' : '框里那份页面就是现网现役版'}`)

  if (MODE !== 'CLEAN') {
    // 同源：这一行写的就是框里那一页读的那只 localStorage。模拟"上一次登过、票已过期、浏览器一直留着"。
    await ev(`localStorage.setItem('adminToken', ${JSON.stringify(STALE)}); 1`)
    say('塞进一枚过期票：' + STALE.length + ' 字（模拟他浏览器里那只 localStorage 存着的旧票）')
  }

  await ev(`document.getElementById('swOther').click(); 1`)
  await sleep(6000)
  }
  const r = await parse(R)
  say('\n屏上读到的：')
  say('  ' + JSON.stringify(r, null, 0).replace(/","/g, '"，"'))
  await shot('图麦克那一栏')

  const n = r.六格 || {}
  const num = (s) => Number(String(s).replace(/[^0-9]/g, ''))
  const realNumbers = num(n.总用户数) > 0 && /共\s*\d+\s*用户/.test(r.那一行 || '')
  const fakeZeros = n.总用户数 === '0' && /undefined/.test(r.那一行 || '')
  const loginBack = r.口令框真在屏上 === true

  if (MODE === 'LIVE') {
    const pass = realNumbers && !loginBack && !fakeZeros
    say(`\n${pass ? '✓' : '✗'} LIVE：现网那一份（无拦截）遇到过期票应当自己换新票、读出真数 → 总用户数 ${n.总用户数}／${r.那一行}／表行 ${r.可见表行数}　口令框回屏=${loginBack}`)
    if (!pass) { code = 1; say('   还是假 0 或退回了口令框 ⇒ 那一刀没落进现网那份，去比 md5') }
  } else if (DIRECT) {
    const pass = loginBack && !realNumbers && !r.在屏上.dashboard
    say(`\n${pass ? '✓' : '✗'} DIRECT：没有现票可换时，那一屏必须退回口令框、不许留假 0 → 口令框在屏上=${loginBack}　dashboard=${r.在屏上.dashboard}　那句报错="${r.那句报错 || '(空)'}"`)
    if (!pass) { code = 1; say('   这一档没退回来：改后的开局分支有问题，别上线') }
  } else if (MODE === 'REPRO') {
    const pass = fakeZeros && !realNumbers
    say(`\n${pass ? '✓' : '✗'} 复现成立：过期票直接进那一屏 ⇒ 屏上就是「全 0 ＋共 undefined 用户」（现网那份页面没改，所以本该复现）`)
    if (!pass) { code = 1; say('   这一趟没复现出假 0 —— 若现网那份已是改后版，这一条本就该红（验收看 LIVE 那一档）') }
  } else {
    const pass = realNumbers && !loginBack && !fakeZeros
    say(`\n${pass ? '✓' : '✗'} ${MODE}：期望框里直接读出真数且不再要第二次口令 → 总用户数 ${n.总用户数}／${r.那一行}／可见表行 ${r.可见表行数}`)
    if (!pass) { code = 1; say('   没读到位：口令框回屏=' + loginBack + '　假 0=' + fakeZeros + '　那句报错=' + (r.那句报错 || '(空)')) }
  }
  say('未捕获异常 ' + c.exceptions.length + ' 条')
  c.exceptions.slice(0, 3).forEach((x) => say('  ! ' + x.slice(0, 160)))
} finally {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/${MODE}-读数.txt`, lines.join('\n') + '\n', 'utf8')
  chrome.kill('SIGKILL')
  c.ws.close()
}
process.exit(code)
