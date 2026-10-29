/* 本机真点：后台「来源站点名」那一栏，在真浏览器里到底画得出什么、点得动什么。
 *
 * tests/test_site_names.py 那 28 条钉的是链与回体，钉不住四件事：
 * ① 那一栏真渲染出来了（`render()` 里少一行 `tables.forEach`＝后端全对、屏上"这功能没做"）；
 * ② **加一行／删一行之后刚打的字还在**——这一栏的行模型存在页面里，重画走的是
 *    `harvestTable` 收字那一步，漏了它不报错，症状是"打到一半、点一下加一行，那几个字没了"；
 * ③ 两下才保存得掉（这一栏的"保存"就是发布：worker 下一趟转存就按它念）；
 * ④ **这一栏接在链上**——存进去的名字要能被 `site_names.resolve` 读出来、停用之后读不出来。
 *    这一条是整栏的存在理由：写口与读口对不上时，屏上是绿的、链是空的。
 *
 * ②丙那条纪律在这里量的是"表里存的就是站名本身"：存进去的人写「人民网」，
 * 读出来的就是「人民网」，一个字都不许多。
 *
 * 库是编出来的：先对一只 /tmp 的临时库跑 `alembic upgrade head`（顺手证明挂在链尾那支新迁移
 * 真把那一个 kind 的空格子建出来了），现网一个字节都不碰。`EXTRACT_PROVIDER=none` ⇒
 * 全程不出网、第 4 级一次都不发。
 *
 * 跑法（本机，仓库根）：node docs/工具/验-后台来源站点名栏.mjs
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync, openSync } from 'node:fs';
const { randomBytes } = await import('node:crypto');
import { resolve } from 'node:path';

const ROOT = resolve('.');
const BACKEND = resolve('backend');
const DB = '/tmp/ops-site-names.db';
const PORT = 8315;
const CDP_PORT = 9368;
const LOG = '/tmp/ops-site-names-uvicorn.log';
const OUT = 'docs/design/后台来源站点名-自证-20261029';
const PW = 'local-view-' + randomBytes(16).toString('hex');
const JWT = 'local-view-jwt-' + randomBytes(18).toString('hex');
const OPS_URL = `http://127.0.0.1:${PORT}/ops`;
// 这一家**故意不在内置词表里**：只有后台那张表能给它名字。
// 用它才分得开"表在读"与"词表在读"——拿 163.com 测的话，撤掉这一栏照样回「网易」，那条红看不出来。
const DOMAIN = 'people.com.cn';
const NAME_ZH = '人民网';
const NAME_EN = 'People.cn';
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

// 环境变量罩住 .env：口令、JWT、库全是本机的临时值，真实凭据一个字不进这一趟。
const ENV = {
  DATABASE_URL: `sqlite:///${DB}`, JWT_SECRET_KEY: JWT, ADMIN_TOKEN: PW,
  EXTRACT_PROVIDER: 'none', SEC_CHECK_ENABLED: 'false', PYTHONPATH: BACKEND,
};

// 只读这一栏在库里的那一格。库里存的是 JSON 串（中文是 `\uXXXX` 转义的），
// 所以要 json 解回来再比——直接对原始串搜「人民网」永远搜不到，那条红是假的。
const SQL = (q) => sh(`${BACKEND}/.venv/bin/python`, ['-c',
  `import sqlite3;c=sqlite3.connect('${DB}');print(c.execute(${JSON.stringify(q)}).fetchall())`],
  ENV, { cwd: BACKEND });
const STORED = () => sh(`${BACKEND}/.venv/bin/python`, ['-c', [
  `import json,sqlite3`,
  `raw=sqlite3.connect('${DB}').execute("select text_value from mp_settings where kind='site_names'").fetchone()[0]`,
  `print(json.dumps(json.loads(raw), ensure_ascii=False) if raw else 'NULL')`,
].join('\n')], ENV, { cwd: BACKEND }).then((s) => s.trim().split('\n').pop());

// 拿真链读一遍这张表：第 1 级命中的那一家，屏上那一枚该念什么。
const RESOLVE = (url) => sh(`${BACKEND}/.venv/bin/python`, ['-c', [
  'import asyncio',
  'from app.db.database import SessionLocal',
  'from app.services import site_names',
  'db=SessionLocal()',
  `print(asyncio.run(site_names.resolve(db, ${JSON.stringify(url)}, '', '', '')))`,
].join('\n')], ENV, { cwd: BACKEND }).then((s) => s.trim().split('\n').pop());

try {
  if (existsSync(DB)) rmSync(DB);
  if (existsSync(LOG)) rmSync(LOG);
  mkdirSync(OUT, { recursive: true });

  // ① 迁移那一段：那一格的「空」必须显式存在，否则"这一栏不存在"与"这一栏空着"在界面上是两句话。
  await sh(`${BACKEND}/.venv/bin/python`, ['-m', 'alembic', 'upgrade', 'head'], ENV, { cwd: BACKEND });
  const cells = await SQL("select kind, text_value, asset_id from mp_settings order by kind");
  ck(`迁移把每一已知栏目的空格子都显式建出来了（这一栏在内，值与图都是 NULL）`,
    /site_names/.test(cells) && cells.indexOf('None, None') >= 0, cells.slice(0, 160));

  const logFd = openSync(LOG, 'w');
  server = spawn(`${BACKEND}/.venv/bin/python`, ['-m', 'uvicorn', 'app.main:app', '--port', String(PORT),
    '--log-level', 'info'], { cwd: BACKEND, env: { ...process.env, ...ENV }, stdio: ['ignore', logFd, logFd] });
  let live = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(OPS_URL)).ok) { live = true; break; } } catch { }
    await sleep(250);
  }
  ck(`本机后端起来了（:${PORT}/ops）`, live);
  if (!live) throw new Error('后端没起来，后面没法测');

  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/ops-site-chrome-${Date.now()}`,
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
    const c = document.querySelector('#tables .card[data-key="table:site_names"]');
    if (!c) return JSON.stringify({ missing: true, boxHas: document.getElementById('tables').children.length });
    return JSON.stringify({
      title: c.querySelector('h2').textContent,
      state: c.querySelector('.state').textContent,
      notes: [...c.querySelectorAll('.note')].map(n => n.textContent),
      head: [...c.querySelectorAll('thead th')].map(t => t.textContent),
      rows: [...c.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('input')].map(i => i.value)),
      limits: [...c.querySelectorAll('tbody input')].map(i => i.maxLength),
      ph: [...c.querySelectorAll('tbody input')].map(i => i.placeholder),
      btns: [...c.querySelectorAll('button')].map(b => b.textContent),
      dirty: (c.querySelector('.dirty') || {}).textContent || '',
      err: (c.querySelector('.err') || {}).textContent || '',
      visible: c.getBoundingClientRect().height > 40 && !document.getElementById('view-config').classList.contains('hidden')
    });
  })()`);
  // 只动屏上那一排输入框：写值之后必须派发 input 事件，否则这一页那套"没保存"的记账读不到。
  const type = (row, col, value) => ev(`(() => {
    const tr = document.querySelectorAll('#tables .card[data-key="table:site_names"] tbody tr')[${row}];
    const inp = tr.querySelectorAll('input')[${col}];
    inp.value = ${JSON.stringify(value)};
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return inp.value;
  })()`);
  const clickBtn = (re) => ev(`(() => {
    const c = document.querySelector('#tables .card[data-key="table:site_names"]');
    const b = [...c.querySelectorAll('button')].find(x => ${re}.test(x.textContent));
    if (!b) return 'no-button';
    b.click();
    return b.textContent;
  })()`);
  const addRow = () => clickBtn('/加一行/');
  const saveOnce = () => clickBtn('/保存这张表|再点一次=立刻生效/');

  await cdp.send('Page.navigate', { url: OPS_URL });
  await sleep(1200);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await ev(`document.getElementById('pw').value = ${JSON.stringify(PW)}`);
  await ev(`[...document.querySelectorAll('#login button')].find(b => /登录/.test(b.textContent)).click()`);
  await sleep(2500);

  // ② 那一栏在不在：左栏「配置」那一组里要点得到，点过去要真画出来
  const navHit = await ev(`(() => {
    const s = [...document.querySelectorAll('#nav .navitem')].find(n => n.textContent === '来源站点名');
    if (!s) return 'NAV 里没有这一条';
    s.click();
    return 'clicked';
  })()`);
  ck('左栏「配置」那一组里有「来源站点名」这一条，点得动', navHit === 'clicked', navHit);

  let st = JSON.parse(await readCard());
  ck('那一栏真渲染出来了（不是只有源码里有）', !st.missing && st.visible === true,
    st.missing ? `那一格里有 ${st.boxHas} 个子节点` : st.title);
  ck('空着那一句念的是后端给的"退到后面那三级"，不是"回到包里那一张"',
    st.state.indexOf('这一栏空着') === 0 && /页面自报/.test(st.state) && st.state.indexOf('包里') < 0, st.state);
  ck('表头五列齐（域名／中文站名／English／备注／删掉）',
    JSON.stringify(st.head) === JSON.stringify(['域名', '中文站名', 'English', '备注（只给自己看）', '删掉']),
    st.head.join('｜'));
  ck('还没填过一行时表体是空的，只有那三枚按钮',
    st.rows.length === 0 && st.btns.filter(b => /加一行|保存这张表|停用这一栏/.test(b)).length === 3,
    st.btns.join('｜'));

  // ③ 上限那三枚数是从回体来的，不是网页抄的
  const stateBody = JSON.parse(await ev(`api('api/admin/mp/state').then(d => JSON.stringify(d.tables))`));
  const spec = stateBody.find((b) => b.kind === 'site_names');
  await addRow();
  await sleep(400);
  st = JSON.parse(await readCard());
  ck('三格输入框的 maxLength 与后端那张表逐格对上（域名／中文／英文＝备注）',
    st.limits[0] === spec.max_domain_chars && st.limits[1] === spec.max_site_chars &&
    st.limits[2] === spec.max_site_chars && st.limits[3] === spec.max_note_chars,
    JSON.stringify(st.limits) + ' vs ' + JSON.stringify([spec.max_domain_chars, spec.max_site_chars, spec.max_site_chars, spec.max_note_chars]));
  ck('提示那四格给的是"网易"这种形状，不是"网易文章"（②拍丙）',
    st.ph[1] === '网易' && st.ph[0] === 'www.163.com' &&
    !/文章|笔记|贴图|链接/.test(st.ph.join('')), st.ph.join('｜'));

  // ④ 打字 → 再点「加一行」（整排重画）→ 刚打的字必须还在。这一条是行模型那一步的牙。
  await type(0, 0, ' ' + DOMAIN.toUpperCase() + ' ');
  await type(0, 1, NAME_ZH);
  await type(0, 2, NAME_EN);
  await type(0, 3, '站长 10-29 要求人工能改这一格');
  await sleep(300);
  const dirtyBefore = (JSON.parse(await readCard())).dirty;
  ck('打了四格之后标题上那句"没保存"数得到（四格是四个字段，不是四行）',
    /有 4 处没保存/.test(dirtyBefore), dirtyBefore);
  await addRow();
  await sleep(500);
  st = JSON.parse(await readCard());
  ck('再点「加一行」之后第一行那几个字还在（收字→改模型→重画那三步没漏）',
    st.rows.length === 2 && st.rows[0][1] === NAME_ZH && st.rows[0][3] === '站长 10-29 要求人工能改这一格',
    JSON.stringify(st.rows));
  const dirtyAfterAdd = (JSON.parse(await readCard())).dirty;
  ck('加了空行之后那句还是 4 处（空行没有要保存的东西，不该把数字吹大）',
    /有 4 处没保存/.test(dirtyAfterAdd), dirtyAfterAdd);

  // ⑤ 两下才保存
  const first = await saveOnce();
  await sleep(900);
  st = JSON.parse(await readCard());
  ck('第一下只把按钮换成确认话术，库里一个字没写（屏上还念「这一栏空着」）',
    first === '再点一次=立刻生效' && st.state.indexOf('这一栏空着') === 0, first + ' / ' + st.state);
  await saveOnce();
  await sleep(2200);
  st = JSON.parse(await readCard());
  ck('第二下真保存：状态那句改成"表里 1 家"（空着的那一行没被发上去）',
    /^现在表里 1 家/.test(st.state), st.state);
  ck('域名存进去是 trim＋小写那一份', st.rows[0] && st.rows[0][0] === DOMAIN, st.rows[0] && st.rows[0][0]);
  ck('中文与英文两格原样回来', st.rows[0] && st.rows[0][1] === NAME_ZH && st.rows[0][2] === NAME_EN,
    JSON.stringify(st.rows[0]));
  ck('备注那一格也回来了', st.rows[0] && st.rows[0][3] === '站长 10-29 要求人工能改这一格', st.rows[0] && st.rows[0][3]);
  ck('保存之后角标消失（没有"字留着了、角标没了"那一型，也没有反过来）',
    (JSON.parse(await readCard())).dirty === '', (JSON.parse(await readCard())).dirty);
  const raw = await STORED();
  ck('库里那一格存的就是站名本身，没有拼任何后缀（②拍丙的落盘形状）',
    raw.indexOf('"zh": "' + NAME_ZH + '"') >= 0 && !/文章|笔记|平台|网站/.test(raw), raw.slice(0, 200));

  // ⑥ 这一栏接在链上（写口与读口对得上）
  const hit = await RESOLVE(`http://www.${DOMAIN}/n1/20261029/article.html`);
  ck('存完再走一遍四级链：第 1 级命中，回的就是表里那两个字',
    hit.indexOf("'zh': '" + NAME_ZH + "'") >= 0 && hit.indexOf("'via': 'table'") >= 0, hit);
  const miss = await RESOLVE('https://www.thepaper.cn/newsDetail_forward_1');
  ck('表里没写的那一家不受影响：仍由内置词表那一级念', miss.indexOf("'via': 'builtin'") >= 0, miss);

  // ⑦ 整份退回：坏域名／重复域名／只填域名，三种都在这一栏念出服务端那句话，且原有那行不许掉
  const delRow = (i) => ev(`(() => {
    const tr = document.querySelectorAll('#tables .card[data-key="table:site_names"] tbody tr')[${i}];
    if (!tr) return 'no-row';
    tr.querySelector('button').click();
    return document.querySelectorAll('#tables .card[data-key="table:site_names"] tbody tr').length;
  })()`);
  await addRow();
  await sleep(400);
  await type(1, 0, 'https://www.sina.com.cn');
  await type(1, 1, '新浪');
  await sleep(300);
  await saveOnce(); await sleep(300); await saveOnce();
  await sleep(1800);
  st = JSON.parse(await readCard());
  ck('域名带了 https:// 时红话念「域名形状不对」，且整张表退回（原来那一行还在）',
    /域名形状不对/.test(st.err) && /^现在表里 1 家/.test(st.state), st.err);
  await addRow();
  await sleep(400);
  await type(1, 0, DOMAIN);
  await type(1, 1, '人民日报');
  await sleep(300);
  await saveOnce(); await sleep(300); await saveOnce();
  await sleep(1800);
  st = JSON.parse(await readCard());
  ck('同一家写两行时红话念「出现了两次」（不猜哪一行生效）',
    /出现了两次/.test(st.err), st.err);
  // 那两行没存的草稿得先清掉，否则下面每一趟保存都在第一处错上就停了，读不出第三条红话。
  ck('屏上此刻摊着三行（两行是刚试坏的草稿，服务端那份始终只有 1 家）',
    st.rows.length === 3, st.rows.length + ' 行');
  await delRow(2); await sleep(500);
  await delRow(1); await sleep(700);
  st = JSON.parse(await readCard());
  ck('点「删」之后那一行立刻从屏上少掉，而服务端那份没动（状态仍念 1 家）',
    st.rows.length === 1 && /^现在表里 1 家/.test(st.state), st.rows.length + ' 行 / ' + st.state);
  ck('删掉那两行的草稿不再算进"没保存"（清不干净就会一直拦着关页面）',
    st.dirty === '', st.dirty);
  await addRow();
  await sleep(400);
  await type(1, 0, 'sohu.com');
  await sleep(300);
  await saveOnce(); await sleep(300); await saveOnce();
  await sleep(1800);
  st = JSON.parse(await readCard());
  ck('只有域名、两个名字都空时红话念「两个名字都没填」',
    /两个名字都没填/.test(st.err), st.err);
  await delRow(1); await sleep(600);

  // ⑧ 删掉那唯一一行、保存 —— 第 1 级撤的就是这一栏
  await delRow(0);
  await sleep(700);
  st = JSON.parse(await readCard());
  ck('表体空了而状态那句仍是 1 家（删了没保存＝线上那份一字未动）',
    st.rows.length === 0 && /^现在表里 1 家/.test(st.state), st.rows.length + ' 行 / ' + st.state);
  await saveOnce(); await sleep(300); await saveOnce();
  await sleep(2000);
  st = JSON.parse(await readCard());
  ck('保存那张空表：这一栏回到「空着」', st.state.indexOf('这一栏空着') === 0, st.state);
  const after = await RESOLVE(`http://www.${DOMAIN}/n1/20261029/article.html`);
  ck('撤掉这一栏之后链上读不出名字（证明第 1 级撤的就是这一栏，不是别处）', after === '{}', after);

  // ⑨ 停用那一枚：写一张表回去，再整栏停掉
  await addRow();
  await sleep(400);
  await type(0, 0, DOMAIN);
  await type(0, 1, NAME_ZH);
  await sleep(300);
  await saveOnce(); await sleep(300); await saveOnce();
  await sleep(2000);
  const off1 = await ev(`(() => {
    const c = document.querySelector('#tables .card[data-key="table:site_names"]');
    const b = [...c.querySelectorAll('button')].find(x => /停用这一栏/.test(x.textContent));
    b.click(); return b.textContent;
  })()`);
  await sleep(900);
  const off2 = await ev(`(() => {
    const c = document.querySelector('#tables .card[data-key="table:site_names"]');
    const b = [...c.querySelectorAll('button')].find(x => /再点一次=停用/.test(x.textContent));
    b.click(); return 'kicked';
  })()`);
  await sleep(2200);
  st = JSON.parse(await readCard());
  ck('停用也要两下（第一下只换话术），第二下之后屏上念「这一栏空着」',
    off1 === '再点一次=停用' && off2 === 'kicked' && st.state.indexOf('这一栏空着') === 0,
    off1 + ' / ' + st.state);
  // 停用写回的是 SQLAlchemy 的 JSON `null`（这一列的 `none_as_null` 是默认 False，
  // 与文案栏「停用」那一路同一形状、已上现网几个月）。判据只看两件事：**那一行还在**
  // （"发布过、现在停用"与"这台后台没登记过"必须是两句话），以及读不出任何一行。
  const stillRow = await SQL(`select count(*) from mp_settings where kind='site_names'`);
  const nulled = await STORED();
  ck('停用是留行不留值：那一行还在，而表里读不出任何一家',
    stillRow.indexOf('[(1,)]') >= 0 && (nulled === 'null' || nulled === 'None' || nulled === '[]'),
    stillRow + ' / ' + nulled);

  // ⑩ 这一栏与别的栏互不开门：拿文案栏的 kind 走这个口应当红
  const cross = await ev(`api('api/admin/mp/tables/tips', {method:'PUT',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify({value:[{domain:'a.com', zh:'甲'}]})})
    .then(function(){return 'ACCEPTED'}, function(e){return e.message})`);
  ck('表栏这个口不收别的组那一栏（文案栏的 kind 走这里当场红）',
    /不是表格栏/.test(String(cross)), String(cross));

  ck('全程不抛异常', cdp.exceptions.length === 0, cdp.exceptions.join(' | ').slice(0, 300));

  await addRow();
  await sleep(300);
  await type(0, 0, DOMAIN);
  await type(0, 1, NAME_ZH);
  await type(0, 2, NAME_EN);
  await sleep(400);
  await ev(`document.querySelector('#tables .card').scrollIntoView({ block: 'start' })`);
  await sleep(600);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/来源站点名栏-填了一行.png`, Buffer.from(shot.data, 'base64'));
  console.log(`  · 屏照 ${OUT}/来源站点名栏-填了一行.png`);
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
