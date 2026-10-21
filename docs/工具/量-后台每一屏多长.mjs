/* 只读数、不动手：回答两件事——「哪一屏太长、长在哪一块」＋「一次登录是不是真打通了两个后台」。
 * 站长 10-21：「优化目的，1，一次登录能同时打通两个小程序后台，界面上，要调整布局，现在有些配置页面太长，不方便浏览」。
 *
 * 为什么不靠眼看：`display:none` 会造假红、写死的窗口宽会失效（见 [[web-layout-self-check-cdp]]），
 * 而"几屏才碰到那一张卡"这种东西只有拿 `getBoundingClientRect` 与 `scrollHeight` 才算得出数。
 *
 * 通篇只读：只切那一屏（showView／点图麦克那一枚），一个写口都不碰、不在对面那一页里输任何东西。
 *
 * 跑法（口令走 stdin，不进 argv、不上屏、不进日志）：
 *   # 本机那份一次性测试库
 *   echo "<本机口令>" | OPS_URL=http://127.0.0.1:8123/ops TAG=后 CDP_PORT=9371 node docs/工具/量-后台每一屏多长.mjs
 *   # 现网（只读）
 *   ssh agentsbin "cd /home/ubuntu/wtsj-backend && grep '^ADMIN_TOKEN=' .env | cut -d= -f2-" \
 *     | OPS_URL=https://api.agentsbin.cn/wtsj/ops TAG=现网 CDP_PORT=9372 node docs/工具/量-后台每一屏多长.mjs
 */
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const OPS_URL = process.env.OPS_URL || 'https://api.agentsbin.cn/wtsj/ops'
const CDP_PORT = process.env.CDP_PORT || '9371'
const OUT = 'docs/design/后台布局-量数-20261021'
const TAG = process.env.TAG || '现网'
const W = Number(process.env.W || 1440)
const H = Number(process.env.H || 900)

const PW = (readFileSync(0, 'utf8').split('\n')[0] || '').trim()
if (!PW) { console.log('FAIL  stdin 没读到口令'); process.exit(1) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const j = async (p, o) => (await fetch(`http://127.0.0.1:${CDP_PORT}${p}`, o)).json()

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const exceptions = []
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text))
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

let chrome = null
const lines = []
const say = (s) => { lines.push(s); console.log(s) }

// 每一张卡：标题、整卡高、在文档里的顶、要滚几屏才碰到，再把它**内部超过 60px 的那几块**列出来
// ——"配置页面太长"这种话要落到"长在哪一块"才能改：是一整列卡片排长，还是某一张自己就三屏。
const M = `(() => {
  const q = (s) => [...document.querySelectorAll(s)];
  const t = (n) => (n.innerText || '').split('\\n')[0].trim().slice(0, 18);
  const vh = window.innerHeight;
  const docH = Math.round(document.documentElement.scrollHeight);
  const cards = q('#main .card').filter((c) => c.offsetParent !== null).map((c) => {
    const r = c.getBoundingClientRect();
    const y = Math.round(r.top + window.scrollY);
    const parts = [...c.children].filter((k) => k.getBoundingClientRect().height > 60).map((k) =>
      (k.tagName + (k.className ? '.' + String(k.className).split(' ')[0] : '')) + ' ' + Math.round(k.getBoundingClientRect().height) + 'px');
    return { key: c.getAttribute('data-key') || '', 题: t(c), 高: Math.round(r.height),
      文档顶: y, 几屏: Math.round(y / vh * 100) / 100, 内部: parts };
  });
  const view = (q('#main .view').filter((v) => v.offsetParent !== null).map((v) => v.id) || []).join(',');
  return JSON.stringify({ vh: vh, docH: docH, view: view, cards: cards,
    nav: q('#nav .navitem').map((n) => ({ 文: (n.textContent || '').trim(), 选中: n.classList.contains('on') })) });
})()`

// 对面那一栏（图麦克）此刻是什么态：**只看不碰**。
// 判据三条：框有没有真挂上 src；iframe 里是它的 dashboard 还是它的口令页；它那一页认的是哪一枚存储。
const K = `(() => {
  const f = document.querySelector('iframe');
  const out = { 框在: !!f, src: f ? (f.getAttribute('src') || '(没挂)') : '(没有框)', 同域读得到: false };
  try {
    const d = f && f.contentDocument;
    if (d && d.body) {
      out.同域读得到 = true;
      out.它的标题 = (d.title || '').slice(0, 24);
      out.它的正文头 = (d.body.innerText || '').split('\\n').filter(function (x) { return x.trim() }).slice(0, 3).join(' / ').slice(0, 90);
      out.它的口令框 = !!d.querySelector('input[type=password]');
      // 「框里到底是它的 dashboard 还是它的口令页」——口令框存在于 DOM 不算，要看**是不是真在屏上**：
      //  many 后台把登录表单常驻 DOM 只是没显示。判据是"那个带口令框的块自己可见，且它的祖先链没有 hidden"。
      var pw = d.querySelector('input[type=password]'), vis = false, host = '';
      if (pw) { var e = pw; while (e && e !== d.body) { const cs = (e.ownerDocument.defaultView || window).getComputedStyle(e);
          if (cs.display === 'none' || cs.visibility === 'hidden') break; e = e.parentElement; }
        vis = !!e && e !== d.body ? false : !!(pw.getBoundingClientRect().height > 0); host = pw.closest('section,div') ? (pw.closest('section,div').id || pw.closest('section,div').className) : ''; }
      out.口令框在屏上 = vis; out.口令框所在块 = String(host).slice(0, 24);
      out.可见行数 = (d.body.innerText || '').split('\\n').filter(function (x) { return x.trim() }).length;
      out.可见表行数 = [...d.querySelectorAll('tr')].filter(function (r) { return r.getBoundingClientRect().height > 0 }).length;
      out.可见大数字 = [...d.querySelectorAll('b, .num, h2, .knum')].filter(function (n) { return n.getBoundingClientRect().height > 0 }).length;
      const keys = [];
      try { for (var i = 0; i < d.localStorage.length; i++) keys.push(d.localStorage.key(i)); } catch (e) {}
      try { for (var i2 = 0; i2 < d.sessionStorage.length; i2++) keys.push('[S]' + d.sessionStorage.key(i2)); } catch (e2) {}
      out.它的存储键 = keys.slice(0, 12);   // 只列键名，一个值都不读
    }
  } catch (e) { out.读不到原因 = String(e && e.message || e).slice(0, 80) }
  return JSON.stringify(out);
})()`

async function ev(expr) {
  const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('页面里那句挂了：' + JSON.stringify(r.exceptionDetails).slice(0, 300) + '\n  句子开头：' + expr.slice(0, 160))
  return r.result && r.result.value
}

async function shot(name) {
  const r = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  if (r.data) { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64')) }
}

const c = await (async () => {
  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/ops-len-${Date.now()}`,
      '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
  for (let i = 0; i < 60; i++) { try { return await j('/json/version') && null } catch (e) { await sleep(500) } }
  throw new Error('Chrome 没起来')
})().then(async () => {
  const list = await j('/json/list')
  const page = list.find((x) => x.type === 'page') || list[0]
  await j(`/json/new?${encodeURIComponent(OPS_URL)}`, { method: 'PUT' }).catch(() => {})
  const l2 = await j('/json/list')
  const p2 = l2.find((x) => x.type === 'page' && /ops/.test(x.url)) || l2.find((x) => x.type === 'page')
  const cc = connect(p2.webSocketDebuggerUrl)
  await cc.ready
  await cc.send('Runtime.enable')
  await cc.send('Page.enable')
  await cc.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 500 })
  await cc.send('Page.navigate', { url: OPS_URL })
  await sleep(3000)
  return cc
})

const parse = async (expr) => JSON.parse(await ev(expr))

try {
  await ev(`(() => { const i = document.getElementById('pw'); if (!i) return 1; i.value = ${JSON.stringify(PW)};
    document.getElementById('btnLogin').click(); return 1 })()`)
  await sleep(2500)
  const ok = await ev(`(() => { const a = document.getElementById('app'); return a && !a.classList.contains('hidden') ? 1 : 0 })()`)
  if (!ok) { say('FAIL  没登进去（口令不对，或那一侧接口变了）'); throw new Error('login') }
  say('登进去了　' + OPS_URL + '　视口 ' + W + '×' + H)

  for (const v of ['stats', 'config', 'tpl']) {
    await ev(`showView('${v}'); 1`)
    await sleep(1500)
    const d = await parse(M)
    const n = d.cards.length
    say(`\n══ ${v}：${n} 张卡　整屏文档高 ${d.docH}px ＝ ${(d.docH / d.vh).toFixed(2)} 屏（一屏 ${d.vh}px）`)
    const shown = d.cards.slice(0, 12)
    shown.forEach((k, i) => {
      say(`   ${String(i + 1).padStart(2)}. ${k.题}（${k.key}）　高 ${k.高}px ＝ ${(k.高 / d.vh).toFixed(2)} 屏　顶在 ${k.文档顶}px → 要滚 ${k.几屏} 屏才碰到`)
      say(`       超过 60px 的那几块：${k.内部.join('、') || '(都是小块)'}`)
    })
    if (d.cards.length > shown.length) {
      const rest = d.cards.slice(12)
      say(`   另 ${rest.length} 张同类卡（${rest.map((k) => k.高).join('、')}px）——**整屏就是被这一串同类卡撑长的**`)
    }
    await shot(`${TAG}-${W}宽-${v}.png`)
  }

  // 对面那一栏：图麦克。切过去之后**只看框里是什么态**，一个字都不输、一枚按钮都不点。
  say('\n══ 切到「图麦克」那一枚之后（只看，不碰）')
  try {
    await ev(`document.getElementById('swOther').click(); 1`)
    await sleep(4000)
    const k = await parse(K)
    say('   ' + JSON.stringify(k, null, 0).replace(/","/g, '"，"'))
    await shot(`${TAG}-${W}宽-图麦克那一栏.png`)
    const 我们这一侧 = await parse(`(() => { const o = {}; for (var i = 0; i < sessionStorage.length; i++) { var k = sessionStorage.key(i); o[k] = String(sessionStorage.getItem(k)).length }
      var l = []; for (var i2 = 0; i2 < localStorage.length; i2++) l.push(localStorage.key(i2)); return JSON.stringify({ 我们的会话键: o, 我们的本地键: l }) })()`)
    say('   我们这一侧存的：' + JSON.stringify(我们这一侧))
  } catch (e) { say('   这一栏没读到：' + (e && e.message || e)) }

  say('\n未捕获异常 ' + c.exceptions.length + ' 条')
  c.exceptions.slice(0, 3).forEach((x) => say('  ! ' + x.slice(0, 160)))
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/${TAG}-量数.txt`, lines.join('\n') + '\n', 'utf8')
  say('读数已落 ' + OUT + '/' + TAG + '-量数.txt')
} finally {
  if (chrome) chrome.kill('SIGKILL')
}
