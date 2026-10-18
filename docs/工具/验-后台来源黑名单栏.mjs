/* 本机真点：后台「来源黑名单」那一栏，在真浏览器里到底画得出什么、点得动什么。
 *
 * tests/test_source_blocklist.py 那 45 条钉的是回体与源码，钉不住三件事：
 * ① 那一栏真渲染出来了（`render()` 里少一行调用＝后端全对、屏上"这功能没做"）；
 * ② 六个数逐列真在屏上，且"还差 2 次"那半句不是只有源码里有；
 * ③ **真点**：往那格输入框里敲一个主机名、点「拉黑这一台」，屏上真多一行；
 *      点「移出」，那一行真消失。这两下走的是真 HTTP 口＋真页面 JS，不是 TestClient。
 *
 * 库是编出来的：先对一只 /tmp 的临时库跑 `alembic upgrade head`（**顺手证明那条新迁移建得出这张表**），
 * 再灌三行样本（一台攒满 3 次、一台只攒 1 次、一台手工）。现网一个字节都不碰。
 *
 * 跑法（本机，默认）：node docs/工具/验-后台来源黑名单栏.mjs
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
const { randomBytes } = await import('node:crypto');
import { resolve } from 'node:path';

const ROOT = resolve('.');
const BACKEND = resolve('backend');
const DB = '/tmp/ops-blocklist.db';
const PORT = 8313;
const CDP_PORT = 9365;
const OUT = 'docs/design/后台来源黑名单-自证-20261019';
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
    p.on('close', (c) => (c === 0 ? res(so) : rej(new Error(`退出码 ${c}：${se.slice(-500)}`))));
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

// 三行样本：一台自动攒满 3 次（该拦）、一台自动只攒 1 次（不该拦、要显出"还差 2 次"）、一台手工（该拦）。
// 走服务层那两枚函数写，不在这里手写 SQL——手写就会与真实计数路径分叉。
const SEED = `
from app.db.database import SessionLocal
from app.services import source_blocklist as bl
db = SessionLocal()
for _ in range(3):
    bl.note_site_failure(db, 'https://www.zhihu.com/question/1/answer/2', 403)
bl.note_site_failure(db, 'https://zhuanlan.zhihu.com/a', 500)
bl.add_manual(db, 'weibo.com')
rows = [(r.host, r.fail_count, r.last_status, r.source, bl.row_is_blocked(r)) for r in db.query(bl.SourceBlocklist).all()]
print('SEEDED ' + str(sorted(rows)))
`;

try {
  if (existsSync(DB)) rmSync(DB);
  mkdirSync(OUT, { recursive: true });

  // ① 迁移这一段：只对临时库跑，现网那条链一个字不动。
  const up = await sh(`${BACKEND}/.venv/bin/python`, ['-m', 'alembic', 'upgrade', 'head'], ENV, { cwd: BACKEND });
  const idx = await sh(`${BACKEND}/.venv/bin/python`, ['-c',
    `import sqlite3;c=sqlite3.connect('${DB}');` +
    `print([r[1] for r in c.execute("PRAGMA index_list('source_blocklist')")]);` +
    `print([r[1] for r in c.execute("PRAGMA table_info(source_blocklist)")])`], ENV, { cwd: BACKEND });
  console.log(`  · alembic upgrade head 跑完（临时库 ${DB}）：${idx.trim()}`);

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
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/ops-block-chrome-${Date.now()}`,
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
  const readCard = () => ev(`(() => {
    const c = document.querySelector('#block .card[data-key="block:list"]');
    if (!c) return JSON.stringify({ missing: true, navHas: [...document.querySelectorAll('#nav s')].map(s => s.textContent) });
    const trs = [...c.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim()));
    return JSON.stringify({
      title: c.querySelector('h2').textContent,
      state: c.querySelector('.state').textContent,
      note: c.querySelector('.note').textContent,
      head: [...c.querySelectorAll('thead th')].map(t => t.textContent),
      rows: trs,
      hasInput: !!c.querySelector('input[type=text]'),
      btns: [...c.querySelectorAll('button')].map(b => b.textContent),
      err: (c.querySelector('.err') || {}).textContent || '',
      visible: c.getBoundingClientRect().height > 40 &&
               !document.getElementById('view-config').classList.contains('hidden'),
      bodyText: document.body.innerText
    });
  })()`);

  await cdp.send('Page.navigate', { url: OPS_URL });
  await sleep(1200);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await ev(`document.getElementById('pw').value = ${JSON.stringify(PW)}`);
  await ev(`[...document.querySelectorAll('#login button')].find(b => /登录/.test(b.textContent)).click()`);
  await sleep(2000);

  // ① 那一栏在不在：左栏「配置」那一组里要点得到，点过去要真画出来
  const navHit = await ev(`(() => {
    const s = [...document.querySelectorAll('#nav s')].find(n => n.textContent === '来源黑名单');
    if (!s) return 'NAV 里没有这一条';
    s.click();
    return 'clicked';
  })()`);
  await sleep(900);
  ck('左栏「配置」那一组里有「来源黑名单」这一条，点得动', navHit === 'clicked', navHit);

  let st = JSON.parse(await readCard());
  ck('那一栏真渲染出来了（不是只有源码里有）', !st.missing && st.visible === true, JSON.stringify(st.navHas || st.title));
  ck('标题与那句"拦着几台"对得上种子', st.title === '来源黑名单' && /^现在拦着 2 台/.test(st.state), st.state);

  // ② 六个数一列不省
  ck('表头六列齐（主机名／失败次数／最后一次 HTTP／最后一次失败／进名单方式／移出）',
    JSON.stringify(st.head) === JSON.stringify(['主机名', '失败次数', '最后一次 HTTP', '最后一次失败', '进名单方式', '移出']),
    st.head.join('｜'));
  const byHost = Object.fromEntries(st.rows.map(r => [r[0], r]));
  const order = st.rows.map(r => r[0]);
  // 服务层那句排序是 `fail_count DESC, host ASC`：三 → 一 → 零
  ck('三行都在，且按失败次数从多到少排（3 → 1 → 0）',
    JSON.stringify(order) === JSON.stringify(['www.zhihu.com', 'zhuanlan.zhihu.com', 'weibo.com']), order.join('｜'));
  ck('攒满 3 次那一行写「自动（已拦）」、HTTP 那格是 403',
    byHost['www.zhihu.com'] && byHost['www.zhihu.com'][4] === '自动（已拦）' && byHost['www.zhihu.com'][2] === '403',
    byHost['www.zhihu.com'] && byHost['www.zhihu.com'].join('｜'));
  // 这条是这一支最要紧的一条：**还没够阈值的行也列、且明写还差几次**——只给已拦的那几行，
  // "失败次数"那一列就没法证明 3 这条线真存在。
  ck('只攒 1 次那一行没被拦、且屏上写明「还差 2 次」',
    byHost['zhuanlan.zhihu.com'] && byHost['zhuanlan.zhihu.com'][4] === '自动（还差 2 次）' && byHost['zhuanlan.zhihu.com'][2] === '500',
    byHost['zhuanlan.zhihu.com'] && byHost['zhuanlan.zhihu.com'].join('｜'));
  ck('手工那一行是 0 次也标「手工（已拦）」',
    byHost['weibo.com'] && byHost['weibo.com'][4] === '手工（已拦）' && byHost['weibo.com'][1] === '0',
    byHost['weibo.com'] && byHost['weibo.com'].join('｜'));
  ck('屏上那两句边界真在（只有链接提取受管／四类故障不记账）',
    /只有「贴链接提取」这一条受它管/.test(st.note) && /不记在这里/.test(st.note));
  ck('移出按钮每行一枚（三行三枚，加那一枚「拉黑这一台」共四枚）',
    st.btns.filter(b => b === '移出').length === 3 && st.hasInput, st.btns.join('｜'));

  // ③ 真点：手工加一台 → 屏上多一行
  await ev(`(() => {
    const c = document.querySelector('#block .card');
    c.querySelector('input[type=text]').value = 'https://www.douban.com/topic/1';
    [...c.querySelectorAll('button')].find(b => /拉黑/.test(b.textContent)).click();
  })()`);
  await sleep(1600);
  st = JSON.parse(await readCard());
  const douban = st.rows.find(r => r[0] === 'www.douban.com');
  ck('真点「拉黑这一台」之后屏上多出那一行（输入的是整条链接，也被收成主机名）', !!douban, JSON.stringify(st.rows));
  ck('新那一行当场标「手工（已拦）」、回执落在重读之后的卡片上',
    douban && douban[4] === '手工（已拦）' && /已加入/.test(st.err), st.err);
  ck('那句回执之后屏上"拦着几台"跟着涨到 3', /^现在拦着 3 台/.test(st.state), st.state);

  // 反向：坏形状那一句要红在屏上，且不许重读（卡不许被重建掉）
  await ev(`(() => {
    const c = document.querySelector('#block .card');
    c.querySelector('input[type=text]').value = 'localhost';
    [...c.querySelectorAll('button')].find(b => /拉黑/.test(b.textContent)).click();
  })()`);
  await sleep(1400);
  st = JSON.parse(await readCard());
  ck('主机名形状不对时红话落在这一栏、且那一行没被加进去',
    /主机名形状不对/.test(st.err) && !st.rows.some(r => r[0] === 'localhost'), st.err);

  // ④ 真点：移出一台 → 那一行真没了
  await ev(`(() => {
    const tr = [...document.querySelectorAll('#block tbody tr')].find(t => t.textContent.indexOf('www.douban.com') === 0);
    [...tr.querySelectorAll('button')].find(b => /移出/.test(b.textContent)).click();
  })()`);
  await sleep(1600);
  st = JSON.parse(await readCard());
  ck('真点「移出」之后那一行从屏上没了', !st.rows.some(r => r[0] === 'www.douban.com'), st.rows.map(r => r[0]).join('｜'));
  ck('移出那一句的回执也落在重读之后那一栏上', /已移出/.test(st.err), st.err);

  // ⑤ 这一栏只该列主机名：链接里那一段路径（用户提交的东西）不该上屏
  ck('反向对照：屏上只有主机名，没有那条链接里的路径', !st.bodyText.includes('/question/'));
  ck('全程不抛异常', cdp.exceptions.length === 0, cdp.exceptions.join(' | ').slice(0, 300));

  const shot = async (name) => {
    const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}/${name}`, Buffer.from(s.data, 'base64'));
    console.log(`  · 屏照 ${OUT}/${name}`);
  };
  await ev(`document.querySelector('#block .card').scrollIntoView({ block: 'start' })`);
  await sleep(500);
  await shot('黑名单栏-三行样本.png');
} catch (e) {
  console.error('整支挂了：', e.message);
  bad.push('未捕获异常：' + e.message);
} finally {
  if (chrome) chrome.kill();
  if (server) server.kill();
  console.log(`\n结论：${ok.length} 条过，${bad.length} 条红`);
  if (bad.length) console.log('红的：\n - ' + bad.join('\n - '));
  process.exit(bad.length ? 1 : 0);
}
