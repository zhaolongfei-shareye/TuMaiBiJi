/* 现网真点：一次口令进两个后台（融合后台 ③ 的验收）。
 *
 * 探针（探-现网后台融合.py）量的是接口；这一支量的是屏。站长拍的是「一个登录账号，
 * 就可以同时管理两个小程序」，那句话只有在浏览器里成立才算成立：
 * 在 admin.html 输一次口令 → 两把票都落对地方 → 同一个标签页里跳到 /wtsj/ops 不再要口令。
 *
 * 跑法（口令走 stdin，不进 argv、不上屏、不进日志）：
 *   ssh agentsbin "cd /home/ubuntu/wtsj-backend && grep '^ADMIN_TOKEN=' .env | cut -d= -f2-" \
 *     | node docs/工具/验-现网一次登录进两个后台.mjs
 * 只读现网：它不写任何东西，登出那一下也只清本机存储。
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';

const ADMIN_URL = 'https://api.agentsbin.cn/admin.html';
const OPS_URL = 'https://api.agentsbin.cn/wtsj/ops';
const CDP_PORT = process.env.CDP_PORT || '9355';
const OUT = process.env.SHOT_DIR || 'docs/design/后台融合-自证-20261016';

const PW = (readFileSync(0, 'utf8').split('\n')[0] || '').trim();
if (!PW) { console.log('FAIL  stdin 没读到口令（这一支只打现网，没口令就没法测）'); process.exit(1); }

let ok = 0, fail = 0;
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? `　→ ${detail}` : ''}`);
  cond ? ok++ : fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const j = async (p, o) => (await fetch(`http://127.0.0.1:${CDP_PORT}${p}`, o)).json();

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') exceptions.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  });
  const ready = new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  return { ready, send, ws, exceptions };
}

let chrome = null;
async function main() {
  const profile = mkdtempSync('/tmp/fusion-live-');
  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
     '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { await j('/json/version'); break; } catch { await sleep(250); } if (i === 39) throw new Error('headless Chrome 没起来'); }
  const tab = await j(`/json/new?url=${encodeURIComponent(ADMIN_URL)}`, { method: 'PUT' });
  const cdp = connect(tab.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: ADMIN_URL });
  await sleep(2500);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 2, mobile: false });

  const ev = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面里那段求值抛了：' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
  };
  // 屏照只截上半截：它那一页往下就是用户列表，openid 是真人标识，不该进仓库。
  const shot = async (name, height = 0) => {
    const params = height ? { format: 'png', clip: { x: 0, y: 0, width: 1100, height, scale: 1 } } : { format: 'png' };
    const s = await cdp.send('Page.captureScreenshot', params);
    writeFileSync(`${OUT}/${name}`, Buffer.from(s.data, 'base64'));
    console.log(`  · 屏照 ${OUT}/${name}`);
  };

  check('现网这一页加载不抛异常', cdp.exceptions.length === 0, cdp.exceptions.join(' | '));
  check('屏上默认只有一个入口（口令框在、邮箱密码收着）', await ev(`(() => {
      const vis = (id) => !document.getElementById(id).classList.contains('hidden');
      return vis('fusionForm') && !vis('loginForm'); })()`));
  await shot('现网-图麦克那一页-口令框.png');

  // 真点：填进框里、点那颗按钮，不直接调函数——要连 onclick 与按钮的 id 一起验。
  await ev(`(() => { const i = document.getElementById('fusionPassword'); i.value = ${JSON.stringify(PW)};
      return [...document.querySelectorAll('#fusionForm button')].map(b => b.textContent).join('/'); })()`);
  await ev(`[...document.querySelectorAll('#fusionForm button')].find(b => b.textContent.trim() === '登录').click()`);
  await sleep(2500);
  const after = JSON.parse(await ev(`JSON.stringify({
      mine: !!localStorage.getItem('adminToken'), ops: !!sessionStorage.getItem('opsSession'),
      by: sessionStorage.getItem('opsSessionSetBy'),
      dash: !document.getElementById('dashboardView').classList.contains('hidden'),
      err: document.getElementById('fusionError').textContent })`));
  check('点一下登录，它自己那把进 localStorage', after.mine);
  check('我们那把进 sessionStorage 且盖上"跟这把票走"的戳', after.ops && /^\d+:/.test(after.by || ''), after.by);
  check('进了它自己的 dashboard（屏上没有报错话）', after.dash && !after.err, after.err);
  await shot('现网-图麦克那一页-登录后.png', 420);

  // 关键那一条：同一个标签页里跳到 /wtsj/ops，不许再要一次口令。
  await cdp.send('Page.navigate', { url: OPS_URL });
  await sleep(3000);
  const ops = JSON.parse(await ev(`JSON.stringify({
      loginHidden: document.getElementById('login').classList.contains('hidden'),
      appShown: !document.getElementById('app').classList.contains('hidden'),
      tpl: (document.getElementById('tpls') ? document.getElementById('tpls').textContent : '').replace(/\\s+/g,' ').slice(0, 40) })`));
  check('同一个标签页里 /wtsj/ops 不再要口令（直接进壳页）', ops.loginHidden && ops.appShown, JSON.stringify(ops));
  check('壳页里那几栏真读到数（不是空壳）', /线上|套/.test(ops.tpl) || ops.tpl.length > 6, ops.tpl);
  await shot('现网-一次口令之后-wtsj-ops已登录.png');

  // 反向对照：清掉那把票，壳页必须回到口令框（证明它认的就是这一把，不是别处的缓存）
  await ev(`sessionStorage.removeItem('opsSession')`);
  await cdp.send('Page.navigate', { url: OPS_URL });
  await sleep(2500);
  check('撤了那把票，壳页立刻回到口令框（不是"还登着"）', await ev(
    `document.getElementById('login').classList.contains('hidden') === false`));

  // 反向那一半（10-16 对面接上换票口之后才有）：从壳页这一侧出去，也不该再要第二次口令。
  await ev(`localStorage.clear()`);   // 抹掉上一步留下的那把，逼它真走"拿 opsSession 去换票"那条路
  await ev(`(() => { document.getElementById('pw').value = ${JSON.stringify(PW)};
      document.getElementById('btnLogin').click(); return 1; })()`);
  await sleep(2500);
  check('在壳页这一侧输一次口令就进了壳页', await ev(
    `document.getElementById('app').classList.contains('hidden') === false`));
  await ev(`document.getElementById('swOther').click()`);
  await sleep(3500);
  const jumped = JSON.parse(await ev(`JSON.stringify({href: location.href,
      mine: !!localStorage.getItem('adminToken'),
      dash: !!document.getElementById('dashboardView') && !document.getElementById('dashboardView').classList.contains('hidden'),
      err: (document.getElementById('fusionError') || {}).textContent || ''})`));
  check('点那枚「图麦克」真跳到了它那一页', /\/admin\.html$/.test(jumped.href), jumped.href);
  check('落地就是它的 dashboard，全程没再输一次口令', jumped.dash && jumped.mine, jumped.err);
  await shot('现网-从壳页点图麦克-免口令落地.png', 420);

  // 登出：它自己那把要清掉；壳页那把不是它写的，所以不许被顺手抹掉
  await ev(`[...document.querySelectorAll('.logout-btn')].find(b => b.textContent.trim() === '退出登录').click()`);
  await sleep(600);
  check('点退出，它自己那把清了', await ev(`localStorage.getItem('adminToken') === null`));
  check('但没顺手抹掉壳页那把票（那一把不是这一页写的）', await ev(
    `sessionStorage.getItem('opsSession') !== null`));
  check('全程（真点登录、真点那枚切换、真点退出）没有未捕获异常', cdp.exceptions.length === 0, cdp.exceptions.join(' | '));

  cdp.ws.close();
  console.log(`\n${ok} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FAIL ' + (e && e.message || e)); process.exit(1); })
  .finally(() => { if (chrome) chrome.kill('SIGKILL'); });
