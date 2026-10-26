/* 本机真点：后台「用量看板」那一栏，在真浏览器里到底画得出什么。
 *
 * tests/test_用量看板.py 那 20 条钉的是回体与源码，现网那 24 条钉的是接口与页面字节，
 * 两把都钉不住 10-19 那一型（`renderBlocklist` 漏一句 appendChild，45 条全绿、屏上一片空）：
 * ① 点「用量看板」之后 `#aiusage` 里**真有节点**、两张卡真在屏上；
 * ② 那些句子真念得出来——「这一档还没开始记」而不是 0、余额 11.02 真上屏、屏上没有「总用量」；
 * ③ **真点**「重新读一次」，上游那一站的命中计数真的 +1。
 *
 * 库是编出来的（`/tmp/ops-usage-board.db`，先对它跑 `alembic upgrade head`，顺手证明 `daily_usage`
 * 建得出）；上游是**本机桩**（`DEEPSEEK_BASE_URL` 指到 127.0.0.1:8318，回体逐字抄现网那一份——
 * 金额是**字符串**，那正是 10-26 早上现网坏掉的那一处）。三档可切：正常／回 500／不吭声。
 * 现网一个字节都不碰，也不出网。
 *
 * 跑法（本机）：node docs/工具/验-后台用量看板栏.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import http from 'node:http';
const { randomBytes } = await import('node:crypto');
import { resolve } from 'node:path';

const ROOT = resolve('.');
const BACKEND = resolve('backend');
const DB = '/tmp/ops-usage-board.db';
const PORT = 8317;
const STUB = 8318;
const CDP_PORT = 9368;
const OUT = 'docs/design/后台用量看板-自证-20261026';
const PW = 'local-view-' + randomBytes(16).toString('hex');
const JWT = 'local-view-jwt-' + randomBytes(18).toString('hex');
const FAKE_KEY = 'sk-localview-' + randomBytes(12).toString('hex');
const OPS_URL = `http://127.0.0.1:${PORT}/ops`;
// 现网 10-26 现读的那一份，逐字抄（含"金额是字符串"这一件事实）。
const LIVE_BODY = { is_available: true, balance_infos: [
  { currency: 'CNY', total_balance: '11.02', granted_balance: '0', topped_up_balance: '11.02' }] };
const CANARY = 'CANARY-不许把上游回体往外递';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = [], bad = [];
const ck = (name, cond, got) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${got ? `　→ ${got}` : ''}`);
  (cond ? ok : bad).push(name);
};
function sh(cmd, args, env, opts) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd: (opts && opts.cwd) || ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let so = '', se = '';
    p.stdout.on('data', (d) => { so += d; });
    p.stderr.on('data', (d) => { se += d; });
    p.on('close', (c) => (c === 0 ? res(so) : rej(new Error(`退出码 ${c}：${se.slice(-500)}`))));
  });
}

// ── 上游桩：三档（ok 逐字现网回体／rejected 500 带一句金丝雀／timeout 一个字不回）
let mode = 'ok', hits = 0, sawAuth = '';
const stub = http.createServer((req, res) => {
  if (req.url.startsWith('/__hits')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ hits, sawAuth: sawAuth.slice(0, 12) }));
  }
  if (req.url.startsWith('/__mode')) {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    return req.on('end', () => {
      try { mode = JSON.parse(raw || '{}').mode || mode; } catch { }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"set":' + JSON.stringify(mode) + '}');
    });
  }
  if (req.url === '/user/balance') {
    hits += 1; sawAuth = String(req.headers.authorization || '');
    if (mode === 'timeout') return;
    if (mode === 'err500') { res.writeHead(500, { 'content-type': 'text/plain' }); return res.end(CANARY); }
    if (mode === 'err401') { res.writeHead(401, { 'content-type': 'text/plain' }); return res.end(CANARY); }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(LIVE_BODY));
  }
  res.writeHead(404); res.end();
});
const setMode = async (m) => { await fetch(`http://127.0.0.1:${STUB}/__mode`, { method: 'POST', body: JSON.stringify({ mode: m }) }); };
const readHits = async () => JSON.parse(await (await fetch(`http://127.0.0.1:${STUB}/__hits`)).text());

let chrome = null, server = null;
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

const ENV = {
  DATABASE_URL: `sqlite:///${DB}`, JWT_SECRET_KEY: JWT, ADMIN_TOKEN: PW,
  DEEPSEEK_BASE_URL: `http://127.0.0.1:${STUB}`,
  // 兜底那一层钉成空：无钥态那一档必须只由"库里那一行在不在"决定，不许被本机 `.env` 里那把真钥顶掉。
  DEEPSEEK: '', SEC_CHECK_ENABLED: 'true',
  // 档位钉成他拍的那两个数（本机 `.env` 里若有别的值，这一档读数就不等于屏上该念的话）。
  EXTRACT_DAILY_LIMIT: '50', SEC_CHECK_DAILY_LIMIT: '200', PYTHONPATH: BACKEND,
};

// 灌账：今天两档各几笔＋前天一笔（用来量"缺的那一天补 0"）；`roammark_draft` **故意一行都不灌**，
// 屏上那一格就该念"还没开始记"。钥走服务层那枚 `put`，不手写 SQL。
const SEED = `
from datetime import datetime, timedelta
from app.db.database import SessionLocal
from app.services import daily_budget, service_secrets
from app.models.daily_usage import DailyUsage
db = SessionLocal()
today = datetime.now(daily_budget.DAILY_TZ).strftime('%Y-%m-%d')
back2 = (datetime.now(daily_budget.DAILY_TZ) - timedelta(days=2)).strftime('%Y-%m-%d')
for _ in range(3):
    daily_budget.charge('u-local-1', 'extract')
daily_budget.charge('u-local-1', 'sec_check', times=20)
daily_budget.charge('u-local-2', 'sec_check')
db.add(DailyUsage(user_id='u-local-1', day=back2, kind='extract', count=5))
db.commit()
service_secrets.put(db, 'DEEPSEEK', ${JSON.stringify(FAKE_KEY)})
rows = sorted((r.day, r.kind, r.count) for r in db.query(DailyUsage).all())
print('SEEDED today=' + today + ' rows=' + str(rows))
`;

const UNSET_KEY = `
from app.db.database import SessionLocal
from app.services import service_secrets
db = SessionLocal()
print('DELETED ' + str(service_secrets.delete(db, 'DEEPSEEK')))
`;

try {
  if (existsSync(DB)) rmSync(DB);
  mkdirSync(OUT, { recursive: true });
  stub.listen(STUB, '127.0.0.1');

  await sh(`${BACKEND}/.venv/bin/python`, ['-m', 'alembic', 'upgrade', 'head'], ENV, { cwd: BACKEND });
  const tables = await sh(`${BACKEND}/.venv/bin/python`, ['-c',
    `import sqlite3;c=sqlite3.connect('${DB}');` +
    `print('daily_usage' in [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")])`], ENV, { cwd: BACKEND });
  console.log(`  · alembic upgrade head 跑完（临时库 ${DB}），daily_usage 在不在＝${tables.trim()}`);

  const seeded = await sh(`${BACKEND}/.venv/bin/python`, ['-c', SEED], ENV, { cwd: BACKEND });
  const line = seeded.trim().split('\n').pop();
  console.log(`  · ${line}`);
  if (!line.startsWith('SEEDED')) throw new Error('种子没灌进去：' + seeded.slice(-400));

  server = spawn(`${BACKEND}/.venv/bin/python`, ['-m', 'uvicorn', 'app.main:app', '--port', String(PORT), '--log-level', 'warning'],
    { cwd: BACKEND, env: { ...process.env, ...ENV }, stdio: 'ignore' });
  let live = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(OPS_URL)).ok) { live = true; break; } } catch { }
    await sleep(250);
  }
  ck(`本机后端起来了（:${PORT}/ops）`, live);
  if (!live) throw new Error('后端没起来，后面没法测');

  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/ops-usage-chrome-${Date.now()}`,
     '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { await j('/json/version'); break; } catch { await sleep(250); } if (i === 39) throw new Error('headless Chrome 没起来'); }
  const tab = await j('/json/new?url=about:blank', { method: 'PUT' });
  const cdp = connect(tab.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  const ev = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面里那段求值抛了：' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
  };
  const shot = async (name) => {
    const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}/${name}`, Buffer.from(s.data, 'base64'));
    console.log(`  · 屏照 ${OUT}/${name}`);
  };
  const readBoard = () => ev(`(() => {
    const box = document.getElementById('aiusage');
    const cards = [...box.querySelectorAll(':scope > section.card')];
    const rowText = (c) => [...c.querySelectorAll(':scope > .krow')].map(r => r.querySelector('b.knum').textContent + '‖' + r.querySelector('.kmeta div').textContent);
    return JSON.stringify({
      navCount: document.querySelectorAll('#nav button.navitem').length,
      boxChildren: box.children.length,
      cardCount: cards.length,
      titles: cards.map(c => c.querySelector('h2').textContent),
      keys: cards.map(c => c.dataset.key),
      rows0: cards[0] ? rowText(cards[0]) : [],
      rows1: cards[1] ? rowText(cards[1]) : [],
      hints1: cards[1] ? [...cards[1].querySelectorAll('.kmeta .note')].map(p => p.textContent) : [],
      notes: [...box.querySelectorAll('p.note')].map(p => p.textContent),
      tableHeads: [...box.querySelectorAll('table thead')].map(t => [...t.querySelectorAll('th')].map(x => x.textContent).join('｜')),
      tableRows: [...box.querySelectorAll('table')].map(t => [...t.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim()).join('｜'))),
      btns: [...box.querySelectorAll('button')].map(b => b.textContent),
      statsCards: document.querySelectorAll('#stats .card').length,
      // 用 textContent 不用 innerText：焦点落在「用量看板」那一栏时统计那八张是被藏的（一栏一屏），
      // innerText 对藏起来的元素回空串，会把"这一栏没被清走"念成假红。
      statsHasNumbers: /\\d/.test(document.getElementById('stats').textContent),
      visible: cards.length > 0 && !document.getElementById('view-stats').classList.contains('hidden')
               && cards[0].getBoundingClientRect().height > 60,
      bodyText: document.body.innerText
    });
  })()`);

  await cdp.send('Page.navigate', { url: OPS_URL });
  await sleep(1200);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await ev(`document.getElementById('pw').value = ${JSON.stringify(PW)}`);
  await ev(`[...document.querySelectorAll('#login button')].find(b => /登录/.test(b.textContent)).click()`);
  await sleep(2600);

  // ① 点得动＋真画出来
  const navHit = await ev(`(() => {
    const s = [...document.querySelectorAll('#nav button.navitem')].find(n => n.textContent === '用量看板');
    if (!s) return 'NAV 里没有这一条';
    s.click();
    return 'clicked';
  })()`);
  await sleep(1000);
  let st = JSON.parse(await readBoard());
  if (st.cardCount !== 2) {
    // 诊断而不是猜：这一栏没画出来时，把接口那一路的真实回话打出来（401 会直接 return、屏上一个字都不留，
    // 光看"容器空"分不出是接口红了还是渲染坏了）。
    const probe = await ev(`(async () => api('api/admin/usage/board?days=14')
      .then((d) => 'OK ' + JSON.stringify(d).slice(0, 160),
              (e) => 'ERR status=' + e.status + ' msg=' + e.message))()`);
    console.log(`  · 诊断（接口那一路此刻的回话）：${probe}`);
    console.log(`  · 诊断（#aiusage 里的 HTML）：${(await ev(`document.getElementById('aiusage').innerHTML`)).slice(0, 200)}`);
  }
  ck('左栏里有「用量看板」这一条，点得动', navHit === 'clicked', navHit);
  ck('点过去 `#aiusage` 里真有节点（不是只有源码里有）', st.boxChildren > 0 && st.cardCount === 2, `容器子节点 ${st.boxChildren}／卡 ${st.cardCount}`);
  ck('两张卡各说各的：一张小程序计数、一张 DeepSeek 余额',
    /图麦笔记这一侧/.test(st.titles[0]) && /RoamMark/.test(st.titles[1]), st.titles.join(' ｜ '));
  ck('两张卡都挂同一枚左栏 key（点一栏两张一起留下）', st.keys.every(k => k === 'aiusage'), st.keys.join('｜'));
  ck('那一屏真在视口里画出来（首张卡高 > 60 且 stats 视图未隐藏）', st.visible === true);
  ck('左栏共 17 条（这一栏是加进「数据」那一组的，配置那 8 条一条没少）', st.navCount === 17, `读到 ${st.navCount} 条`);

  // ② 屏上那些句子念的是真数（种子对得上）
  const r0 = Object.fromEntries(st.rows0.map(x => x.split('‖')).map(([v, l]) => [l, v]));
  ck('「今天已提炼」念 3 / 50（档位从服务端配置现读，不是抄的字面数）',
    r0['今天已提炼（条）'] === '3 / 50', String(r0['今天已提炼（条）']));
  ck('「今天已送检」念 21 / 200（两笔 charge 相加，含 times=20 那一次）',
    r0['今天已送检（次）'] === '21 / 200', String(r0['今天已送检（次）']));
  ck('「这 14 天合计」把前天那一笔也带上（3＋5＝8 条提炼）',
    r0['这 14 天合计（提炼／送检）'] === '8 / 21', String(r0['这 14 天合计（提炼／送检）']));
  const rows = st.tableRows.flat();
  ck('逐日那张表 14 行齐（缺的天补 0，不是一天一行）', rows.length === 14, `读到 ${rows.length} 行`);
  ck('前天那一行念 5／0、大前天那行念 0／0（"没来"与"没记"分得开）',
    rows.some(r => /｜5｜0$/.test(r)) && rows.some(r => /｜0｜0$/.test(r)));
  ck('屏上写明"含我们自己跑验收时打的那些"（绝对值前那句不撒谎的注解）',
    st.notes.some(n => /含我们自己跑验收时打的那些/.test(n)));

  const r1 = Object.fromEntries(st.rows1.map(x => x.split('‖')).map(([v, l]) => [l, v]));
  ck('「今天转发了几条景点初稿」念「这一档还没开始记」而不是 0',
    r1['今天转发了几条景点初稿'] === '这一档还没开始记', String(r1['今天转发了几条景点初稿']));
  ck('余额那句念得出 11.02（官方回的是**字符串**，这一格 10-26 早上真坏过）',
    /共 11\.02（赠金 0／充值 11\.02）/.test(r1['上游回的话'] || ''), String(r1['上游回的话']));
  ck('余额那一行单独也上屏：11.02 CNY，赠金／充值分开',
    r1['余额那一行 1'] === '11.02 CNY' && /赠金 0／充值 11\.02/.test(st.rows1.join('')), String(r1['余额那一行 1']));
  ck('钥那一格念「有（长度 …，指纹 …）」，值本身一个字都不上屏',
    /^有（长度 \d+，指纹 /.test(String(r1['这一栏拿去打上游的那把钥'])) && !st.bodyText.includes(FAKE_KEY),
    String(r1['这一栏拿去打上游的那把钥']));
  // 那条转发链挂没挂，本地这一趟与现网不是同一个答案（本机跑的是**工作树**，另一路那批 `main.py`
  // 就在盘上），所以这一把不预设脸色，钉的是"卡上那句话必须跟着接口里那个布尔走"。
  const flag = JSON.parse(await ev(`(async () => JSON.stringify(await api('api/admin/usage/board?days=14')))()`)).deepseek.forward_route_mounted;
  const hintStr = st.hints1.join(' ');
  ck('转发链那句说明跟着接口里的布尔走（不预设是哪一档）',
    flag ? hintStr.includes('挂在这台服务上') : hintStr.includes('今天还没上现网'),
    `接口回 forward_route_mounted＝${flag}`);
  ck('纪律：屏上没有「总用量」这三个字（次数与余额不许加在一起）', !st.bodyText.includes('总用量'));
  // 这一条是屏照看出来的（10-26）：这一页零 innerHTML、全部走 textContent，所以 markdown 痕迹
  // 不会被渲染成粗体，只会把 `**` 与反引号原样念给人看——10-22 那晚预置 84 篇的字面星号就是同一族。
  const md = (st.notes.concat(st.hints1, st.titles, Object.values(r0), Object.values(r1))
    .join(' ').match(/\*\*[^*]+\*\*|`[^`]+`/g) || []);
  ck('这一栏屏上没有一个 markdown 痕迹（**粗体**与 `代码` 在这一页只会露出符号）', md.length === 0, md.join('｜').slice(0, 120));
  await ev(`document.getElementById('aiusage').scrollIntoView({ block: 'start' })`);
  await sleep(400);
  await shot('用量看板-正常态.png');
  await ev(`document.querySelectorAll('#aiusage section.card')[1].scrollIntoView({ block: 'start' })`);
  await sleep(400);
  await shot('用量看板-余额那张卡.png');
  await ev(`document.getElementById('aiusage').scrollIntoView({ block: 'start' })`);
  await sleep(300);

  // ③ 真点「重新读一次」＝真走一趟上游
  const before = await readHits();
  await ev(`(() => { [...document.querySelectorAll('#aiusage button')].find(b => /重新读一次/.test(b.textContent)).click(); })()`);
  await sleep(1600);
  const after = await readHits();
  ck('真点「重新读一次」之后上游那一站的命中 +1', after.hits === before.hits + 1, `${before.hits} → ${after.hits}`);
  ck('打出去的那一发带的是 Authorization: Bearer <那把钥>（值只在桩里，不进对话）',
    after.sawAuth.startsWith('Bearer sk-'), after.sawAuth.slice(0, 10) + '…');

  // ④ 红了不许把统计那一栏带走
  await setMode('err500');
  await ev(`(() => { [...document.querySelectorAll('#aiusage button')].find(b => /重新读一次/.test(b.textContent)).click(); })()`);
  await sleep(1600);
  st = JSON.parse(await readBoard());
  ck('上游回 500：这一栏念"上游回 500，余额没读到"', String(st.rows1.join(' ')).includes('上游回 500，余额没读到'));
  ck('上游回 500：屏上没有转述回体里那句金丝雀', !st.bodyText.includes(CANARY));
  ck('上游回 500：两张卡还在、统计那一栏一个字节没被清走',
    st.cardCount === 2 && st.statsCards > 0 && st.statsHasNumbers, `卡 ${st.cardCount}／统计卡 ${st.statsCards}`);

  // ⑤ 不吭声那一档（8 秒顶）
  await setMode('timeout');
  await ev(`(() => { [...document.querySelectorAll('#aiusage button')].find(b => /重新读一次/.test(b.textContent)).click(); })()`);
  await sleep(9800);
  st = JSON.parse(await readBoard());
  ck('上游 8 秒不吭声：屏上念"8 秒内没回话"，页面不转圈、不空白',
    st.cardCount === 2 && String(st.rows1.join(' ')).includes('8 秒内没回话'));

  // ⑥ 无钥态：一次都不该打上游
  await setMode('ok');
  const hitsBefore = (await readHits()).hits;
  await sh(`${BACKEND}/.venv/bin/python`, ['-c', UNSET_KEY], ENV, { cwd: BACKEND });
  await ev(`(() => { [...document.querySelectorAll('#aiusage button')].find(b => /重新读一次/.test(b.textContent)).click(); })()`);
  await sleep(1600);
  st = JSON.parse(await readBoard());
  const hitsAfter = (await readHits()).hits;
  ck('库里那行撤掉后：这一栏念"还没有一把能用的钥"',
    String(st.rows1.join(' ')).includes('还没有一把能用的钥') && st.rows1.join(' ').includes('占位符'));
  ck('无钥态一次都不打上游（命中数不变）', hitsAfter === hitsBefore, `${hitsBefore} → ${hitsAfter}`);
  ck('无钥态：钥那一格念「没有」，且余额那一行整行消失',
    st.rows1.join(' ').includes('没有') && !st.rows1.some(r => r.endsWith('‖余额那一行 1')));

  ck('全程页面零异常抛出', cdp.exceptions.length === 0, cdp.exceptions.join(' | ').slice(0, 300));
  await ev(`document.getElementById('aiusage').scrollIntoView({ block: 'start' })`);
  await sleep(400);
  await shot('用量看板-无钥态.png');
} catch (e) {
  console.error('整支挂了：', e.message);
  bad.push('未捕获异常：' + e.message);
} finally {
  if (chrome) chrome.kill();
  if (server) server.kill();
  stub.close();
  console.log(`\n结论：${ok.length} 条过，${bad.length} 条红`);
  if (bad.length) console.log('红的：\n - ' + bad.join('\n - '));
  process.exit(bad.length ? 1 : 0);
}
