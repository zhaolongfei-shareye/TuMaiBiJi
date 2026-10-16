/* 本机真点：后台「数据」那一屏新加的 A4／A9 两张卡，在真浏览器里到底画出什么。
 *
 * tests/test_admin_fusion.py 那批钉的是**回体与源码**：接口对了、页面字符串也在，
 * 但钉不住"这一屏真渲染出来了、那两句边界真在屏上、用户写的那个分类名真没露"。
 * 这一支起一个本机后端（不碰现网），真输口令、真读屏、真截整屏。
 *
 * 判据数字不写死在这里——读 `tools/dev_seed_admin_data.py` 打印的那一份，
 * 两处各写一遍常数迟早对不上。
 *
 * 跑法（本机，默认）：node docs/工具/验-后台数据屏分类与图片.mjs
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
const { randomBytes } = await import('node:crypto');
import { resolve } from 'node:path';

const ROOT = resolve('.');
const BACKEND = resolve('backend');
const DB = '/tmp/ops-data-screen.db';
const PORT = 8312;
const CDP_PORT = 9364;
const OUT = 'docs/design/后台数据屏-自证-20261016';
const PW = 'local-view-' + randomBytes(16).toString('hex');
const JWT = 'local-view-jwt-' + randomBytes(18).toString('hex');
const OPS_URL = `http://127.0.0.1:${PORT}/ops`;
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
    p.on('close', (c) => (c === 0 ? res(so) : rej(new Error(`退出码 ${c}：${se.slice(-400)}`))));
  });
}

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

const ENV = { DATABASE_URL: `sqlite:///${DB}`, JWT_SECRET_KEY: JWT, ADMIN_TOKEN: PW, PYTHONPATH: BACKEND };

try {
  if (existsSync(DB)) rmSync(DB);
  mkdirSync(OUT, { recursive: true });
  const seededRaw = await sh(`${BACKEND}/.venv/bin/python`, ['tools/dev_seed_admin_data.py'], ENV, { cwd: BACKEND });
  const EXP = JSON.parse(seededRaw.trim().split('\n').pop());
  console.log(`  · 本机库已编好，期望值读自种子：${JSON.stringify(EXP)}`);

  server = spawn(`${BACKEND}/.venv/bin/python`, ['-m', 'uvicorn', 'app.main:app', '--port', String(PORT), '--log-level', 'warning'],
    { cwd: BACKEND, env: { ...process.env, ...ENV }, stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(OPS_URL)).ok) { up = true; break; } } catch { }
    await sleep(250);
  }
  ck(`本机后端起来了（:${PORT}/ops）`, up);
  if (!up) throw new Error('后端没起来，后面没法测');

  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/ops-data-chrome-${Date.now()}`,
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

  await cdp.send('Page.navigate', { url: OPS_URL });
  await sleep(1200);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await ev(`document.getElementById('pw').value = ${JSON.stringify(PW)}`);
  await ev(`[...document.querySelectorAll('#login button')].find(b => /登录/.test(b.textContent)).click()`);
  await sleep(2000);
  ck('输一次口令进了壳页、数据那一屏是默认那一屏',
    await ev(`document.getElementById('login').classList.contains('hidden')`) === true &&
    await ev(`document.getElementById('view-stats').classList.contains('hidden')`) === false);

  const st = JSON.parse(await ev(`(() => {
    const cards = [...document.querySelectorAll('#stats .card')];
    const one = (t) => cards.find(c => c.querySelector('h2') && c.querySelector('h2').textContent.indexOf(t) === 0);
    const rows = (c) => [...c.querySelectorAll('.krow')].map(r => ({
      num: r.querySelector('.knum').textContent,
      label: r.querySelectorAll('.kmeta > div')[0].textContent,
      hint: (r.querySelectorAll('.kmeta > div')[1] || {}).textContent || ''
    }));
    const cat = one('分类与未分类'), as = one('图片云备份健康度');
    return JSON.stringify({
      n: cards.length,
      nav: [...document.querySelectorAll('#nav s')].map(s => s.textContent),
      cat: cat ? { title: cat.querySelector('h2').textContent, sub: cat.querySelector('.note').textContent, rows: rows(cat) } : null,
      assets: as ? { title: as.querySelector('h2').textContent, sub: as.querySelector('.note').textContent, rows: rows(as) } : null,
      bodyText: document.body.innerText,
      keys: cards.map(c => c.dataset.key)
    });
  })()`));

  ck(`数据那一屏八张卡（原来六张 + 这两张）`, st.n === 8, `${st.n} 张`);
  ck('左栏那八条都点得动，两条新的在名单里',
    st.nav.includes('分类与未分类') && st.nav.includes('图片备份') && st.nav.length >= 8, st.nav.join('／'));
  ck('两张新卡各挂了 data-key（没挂就滚不到位）',
    st.keys.includes('categories') && st.keys.includes('assets'), st.keys.join('／'));

  const E = EXP.categories, A = EXP.assets;
  ck(`A4 那三行按种子的数出来（未分类 ${E.uncategorized}／动笔 ${E.authored}）`,
    !!st.cat && st.cat.rows.length === 3 &&
    st.cat.rows[0].num === (Math.round(E.uncategorized * 1000 / E.authored) / 10) + '%' &&
    st.cat.rows[0].hint.includes(`动笔 ${E.authored} 篇里有 ${E.uncategorized} 篇`) &&
    st.cat.rows[0].hint.includes(`剩下 ${E.categorized} 篇分了类`) &&
    st.cat.rows[1].num === String(E.private) &&
    st.cat.rows[2].num === String(E.slots),
    st.cat && JSON.stringify(st.cat.rows.map(r => r.num)));
  ck('A4 那句"一个分类名都不列"真在卡上（不只在源码里）',
    !!st.cat && /一个分类名都不列/.test(st.cat.sub));
  ck('预置那两篇没进分母（占比按 3／6 而不是 5／8）',
    !!st.cat && st.cat.rows[0].num !== (Math.round(5 * 1000 / 8) / 10) + '%', st.cat && st.cat.rows[0].num);

  ck(`A9 那三行按种子的数出来（上传 ${A.uploaded}／总 ${A.total}、失败 ${A.failed}）`,
    !!st.assets && st.assets.rows.length === 3 &&
    st.assets.rows[0].num === `${A.uploaded} / ${A.total}` &&
    st.assets.rows[1].num === String(A.failed) &&
    st.assets.rows[0].hint.includes('backup_status 为空的老行') &&
    st.assets.rows[2].hint.includes(`有 ${A.size_unknown} 行没报体积`),
    st.assets && JSON.stringify(st.assets.rows.map(r => r.num)));
  ck('A9 那格把"只证上传侧／不许写成云端零孤儿"写在屏上',
    !!st.assets && /只证"上传侧"/.test(st.assets.sub) && /云端零孤儿/.test(st.assets.sub));
  ck('总字节是 3.4 KB（NULL 状态那两行进了和、失败那行没进）',
    !!st.assets && st.assets.rows[2].num === '3.4 KB', st.assets && st.assets.rows[2].num);

  // 这条是这一支最要紧的：用户自己写的那个分类名（含"编号7301"）一个字都不许上屏。
  ck('反向对照：用户写的分类名没出现在这一屏任何一处',
    !st.bodyText.includes('住院记录') && !st.bodyText.includes('编号7301'));
  ck('全程不抛异常', cdp.exceptions.length === 0, cdp.exceptions.join(' | ').slice(0, 300));

  const shot = async (name) => {
    const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}/${name}`, Buffer.from(s.data, 'base64'));
    console.log(`  · 屏照 ${OUT}/${name}`);
  };
  await ev(`document.querySelector('#stats .card[data-key="categories"]').scrollIntoView({behavior:'instant',block:'start'})`);
  await sleep(600);
  await shot('本机-分类与图片两格.png');
} finally {
  if (server) server.kill();
  if (chrome) chrome.kill();
}
console.log(`\n结果：过 ${ok.length} 条／红 ${bad.length} 条`);
if (bad.length) { console.log('红的：' + bad.join('、')); process.exitCode = 1; }
