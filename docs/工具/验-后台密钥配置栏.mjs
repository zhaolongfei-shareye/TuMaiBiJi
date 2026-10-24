/* 本机真点：后台「密钥配置」那一栏，在真浏览器里到底画得出什么、点得动什么。
 *
 * tests/test_service_secrets.py 那 44 条钉的是回体与源码，钉不住四件事：
 * ① 那一栏真渲染出来了（`refresh()` 里少一行调用＝后端全对、屏上"这功能没做"）；
 * ② **值不外流**这一条只能在屏上量：存进去一把哨兵值，屏上、DOM、服务端日志三处都搜不到它；
 * ③ 两下才删得掉（第一下只换话术，行还在）——这一枚改的是线上正在用的凭据，删错就是登录断；
 * ④ 库里那一行真盖得住 `.env`：存一把假的 `WECHAT_APP_SECRET` 进去，`resolve()` 回的是库里那把，
 *      删掉之后回的是调用方传进来的 fallback。这一条是整节的存在理由，静态钉子量不出来。
 *
 * 库是编出来的：先对一只 /tmp 的临时库跑 `alembic upgrade head`（**顺手证明挂在链尾那支新迁移
 * 真建得出这张表**），现网一个字节都不碰。全程不调任何外部接口（EXTRACT_PROVIDER=none、
 * SEC_CHECK_ENABLED=false），所以那把假的微信 AppSecret 只会躺在临时库里。
 *
 * 跑法（本机，仓库根）：node docs/工具/验-后台密钥配置栏.mjs
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
const { randomBytes, createHash } = await import('node:crypto');
import { resolve } from 'node:path';

const ROOT = resolve('.');
const BACKEND = resolve('backend');
const DB = '/tmp/ops-secrets.db';
const PORT = 8314;
const CDP_PORT = 9367;
const LOG = '/tmp/ops-secrets-uvicorn.log';
const OUT = 'docs/design/后台密钥配置-自证-20261025';
const PW = 'local-view-' + randomBytes(16).toString('hex');
const JWT = 'local-view-jwt-' + randomBytes(18).toString('hex');
const OPS_URL = `http://127.0.0.1:${PORT}/ops`;
// 三把哨兵值：只在临时库里活一分钟，判据是"屏上与日志里都搜不到它们"。
const V_DS = 'sk-sentinel-' + randomBytes(12).toString('hex');
const V_WX = 'wx-sentinel-' + randomBytes(12).toString('hex');
const V_ZZ = 'zz-sentinel-' + randomBytes(12).toString('hex');
const SHA8 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8);
const TODAY = (() => { const d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); })();
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

try {
  if (existsSync(DB)) rmSync(DB);
  if (existsSync(LOG)) rmSync(LOG);
  mkdirSync(OUT, { recursive: true });

  // ① 迁移这一段：只对临时库跑，现网那条链一个字不动。
  await sh(`${BACKEND}/.venv/bin/python`, ['-m', 'alembic', 'upgrade', 'head'], ENV, { cwd: BACKEND });
  const tbl = await sh(`${BACKEND}/.venv/bin/python`, ['-c',
    `import sqlite3;c=sqlite3.connect('${DB}');` +
    `cols=[r[1] for r in c.execute("PRAGMA table_info(service_secrets)")];` +
    `pk=[r[1] for r in c.execute("PRAGMA table_info(service_secrets)") if r[5]];` +
    `n=c.execute("SELECT COUNT(*) FROM service_secrets").fetchone()[0];` +
    `print(str(cols)+'|PK='+str(pk)+'|rows='+str(n))`], ENV, { cwd: BACKEND });
  console.log(`  · alembic upgrade head 跑完（临时库 ${DB}）：${tbl.trim()}`);
  ck('新迁移在链尾真建得出这张表（五栏齐、主键是 name、一行都不预建）',
    /name|value|note|created_at|updated_at/.test(tbl) && tbl.includes("PK=['name']") && tbl.includes('rows=0'),
    tbl.trim());

  const logFd = (await import('node:fs')).openSync(LOG, 'w');
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
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/ops-secret-chrome-${Date.now()}`,
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
    const c = document.querySelector('#secrets .card[data-key="secret:list"]');
    if (!c) return JSON.stringify({ missing: true, boxHas: document.getElementById('secrets').children.length });
    const trs = [...c.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim()));
    const ins = [...c.querySelectorAll('input')].map(i => ({ type: i.type, ph: i.placeholder, v: i.value }));
    return JSON.stringify({
      title: c.querySelector('h2').textContent,
      state: c.querySelector('.state').textContent,
      note: c.querySelector('.note').textContent,
      head: [...c.querySelectorAll('thead th')].map(t => t.textContent),
      rows: trs, inputs: ins,
      btns: [...c.querySelectorAll('button')].map(b => b.textContent),
      err: (c.querySelector('.err') || {}).textContent || '',
      errOk: !!document.querySelector('#secrets .card .err.ok'),
      visible: c.getBoundingClientRect().height > 40 &&
               !document.getElementById('view-config').classList.contains('hidden'),
      html: c.innerHTML, bodyText: document.body.innerText
    });
  })()`);

  await cdp.send('Page.navigate', { url: OPS_URL });
  await sleep(1200);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await ev(`document.getElementById('pw').value = ${JSON.stringify(PW)}`);
  await ev(`[...document.querySelectorAll('#login button')].find(b => /登录/.test(b.textContent)).click()`);
  await sleep(2500);

  // ② 那一栏在不在：左栏「配置」那一组里要点得到，点过去要真画出来
  const navHit = await ev(`(() => {
    const s = [...document.querySelectorAll('#nav .navitem')].find(n => n.textContent === '密钥配置');
    if (!s) return 'NAV 里没有这一条';
    s.click();
    return 'clicked';
  })()`);
  await sleep(1200);
  ck('左栏「配置」那一组里有「密钥配置」这一条，点得动', navHit === 'clicked', navHit);

  let st = JSON.parse(await readCard());
  ck('那一栏真渲染出来了（不是只有源码里有）', !st.missing && st.visible === true,
    st.missing ? `那一格里有 ${st.boxHas} 个子节点` : st.title);
  ck('空表那句话说的是"还在用 .env"，不是"没配凭据"',
    st.state === '库里一条都没有：每一个名字都还在用 .env 的值。', st.state);
  ck('空表那一段没有表格、只有那一句「表里一行都没有」',
    st.rows.length === 0 && st.html.indexOf('表里一行都没有') >= 0);
  ck('边界那句在屏上（只回长度与指纹、原值读不回去）',
    /值只有长度与指纹回得来，原值这一页读不回去/.test(st.note), st.note.slice(0, 40));
  ck('今天真被代码读的名字逐个列出来了',
    st.note.indexOf('WECHAT_APP_SECRET、HUNYUAN_CF_KEY') >= 0, st.note.slice(-90));

  // ③ 真存：小写名字 + 值 + 备注 → 屏上那行的每一格
  const put = async (name, value, note) => ev(`(() => {
    const c = document.querySelector('#secrets .card');
    const ins = [...c.querySelectorAll('input')];
    ins[0].value = ${JSON.stringify(name)}; ins[1].value = ${JSON.stringify(value)}; ins[2].value = ${JSON.stringify(note)};
    [...c.querySelectorAll('button')].find(b => /保存这一把/.test(b.textContent)).click();
    return 'kicked';
  })()`);
  await put('deepseek_api_key', V_DS, 'DeepSeek 后台 2026-10 新建的那把');
  await sleep(2000);
  st = JSON.parse(await readCard());
  const ds = st.rows.find(r => r[0] === 'DEEPSEEK_API_KEY');
  ck('用小写名存的一把，屏上那行的名字是大写规范化后的', !!ds, st.rows.map(r => r[0]).join('｜'));
  ck('长度那格是值的字数（不是原值）', ds && ds[1] === String(V_DS.length), ds && ds[1]);
  ck('指纹那格＝sha256 前 8 位（与在 node 里独立算的对上）', ds && ds[2] === SHA8(V_DS), ds && ds[2] + ' vs ' + SHA8(V_DS));
  ck('更新那格是本地这一天（不是 UTC 切前 10 位）', ds && ds[3] === TODAY, ds && ds[3] + ' / 本地 ' + TODAY);
  ck('备注那格原样回来', ds && ds[4] === 'DeepSeek 后台 2026-10 新建的那把', ds && ds[4]);
  ck('没接上的名字，屏上直接说「还没有代码读这个名字」', ds && /还没有代码读这个名字/.test(ds[5]), ds && ds[5]);
  // 这一格钉的是"屏上不许有关于文件的假话"：`DEEPSEEK_API_KEY` 在 `.env` 里**写着那一行**，
  // 但 `config.py` 没声明它（`extra="ignore"`），回退那一路拿不到 ⇒ 屏上只能写"删掉就没有值了"。
  ck('回退那一路拿不到的名字，屏上写「删掉就没有值了」而不是关于 .env 文件的那半句',
    ds && /库里这一行（删掉就没有值了）/.test(ds[5]) && ds[5].indexOf('.env 里没有这一行') < 0, ds && ds[5]);
  // 另一头：`config.py` 声明过、`.env` 里有值的名字（`WECHAT_APP_SECRET`）才该写"回到 .env"，
  // 这一格在 ④ 里对同一句话做反向对照——两句话只有按 flag 分岔才对得上。
  ck('存完值输入框已清空（不回显）', st.inputs[1] && st.inputs[1].v === '' && st.inputs[1].type === 'password',
    JSON.stringify(st.inputs[1]));
  // 那句回执里必须有长度与指纹，且不出现原值。字数是编出来的哨兵串的长度，
  // 拼进式子（写成正则字面量里的 `' + … + '` 是死的，那一趟红过一次）。
  ck('回执落在重读之后那一栏上、且带"原值不再回显"',
    new RegExp('已存下：DEEPSEEK_API_KEY　长度 ' + V_DS.length + ' 字　指纹 [0-9a-f]{8}（原值不再回显）').test(st.err) && st.errOk,
    st.err);
  ck('表头七列齐（名字／长度／指纹／更新／备注／生效值／删掉）',
    JSON.stringify(st.head) === JSON.stringify(['名字', '长度', '指纹', '更新', '备注', '生效值', '删掉']), st.head.join('｜'));

  // ④ 两把对照：一把代码在读、一把 .env 里根本没有
  await put('WECHAT_APP_SECRET', V_WX, '本机自证用的假值');
  await sleep(2000);
  await put('ZZ_NOT_IN_ENV_KEY', V_ZZ, '.env 里没有的名字');
  await sleep(2000);
  st = JSON.parse(await readCard());
  const wx = st.rows.find(r => r[0] === 'WECHAT_APP_SECRET');
  const zz = st.rows.find(r => r[0] === 'ZZ_NOT_IN_ENV_KEY');
  ck('代码在读那一把：屏上不再补"还没有代码读这个名字"', wx && wx[5] === '库里这一行（删掉回到 .env）', wx && wx[5]);
  ck('.env 里没有那一把：屏上写明"删掉就没值了"', zz && /库里这一行（删掉就没有值了）/.test(zz[5]), zz && zz[5]);
  ck('状态那句跟着数走（三个名字）', /^库里现在管着 3 个名字/.test(st.state), st.state);

  // ⑤ 值不外流：屏上文字、卡片 HTML、服务端日志、接口回体四处都搜不到哨兵
  const leaks = [V_DS, V_WX, V_ZZ];
  ck('反向：屏上任何一处（含 innerHTML 属性）都搜不到三把原值',
    !leaks.some((v) => st.bodyText.includes(v) || st.html.includes(v)));
  // 走页面自己那个 `api()`：这一句读的是真口、真票，不是另搭一条 fetch。
  const apiBody = await ev(`api('api/admin/secrets').then(d => JSON.stringify(d))`);
  ck('反向：接口回体里没有 value 这个键、也没有原值',
    !leaks.some((v) => apiBody.includes(v)) && apiBody.indexOf('"value"') < 0, apiBody.slice(0, 60));
  await sleep(500);
  const logTxt = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '';
  ck('反向：uvicorn 的访问／错误日志里搜不到原值', !leaks.some((v) => logTxt.includes(v)),
    `日志 ${logTxt.length} B`);
  ck('反向：这一页 HTML 源码里也不含管理口令', !(await ev('document.documentElement.outerHTML')).includes(PW));

  // ⑥ 库里那一行真盖得住 .env（这一条是整节的存在理由）
  // 探针只印判定词，不印值：`.env` 里那把真的微信 AppSecret 不能进这趟读数，
  // 所以对照的是"与 settings 那一份不相等"，而不是把两份都打出来比。
  const PROBE = `
import os
from app.core.config import settings
from app.services import service_secrets as ss
v = os.environ['SENTINEL']
got = ss.resolve('WECHAT_APP_SECRET', 'FALLBACK-FAKE')
print('OVERRIDE' if got == v else ('FALLBACK' if got == 'FALLBACK-FAKE' else 'OTHER'))
print('DIFFERS_FROM_ENV' if got != (settings.WECHAT_APP_SECRET or '') else 'SAME_AS_ENV')
`;
  const pre = await sh(`${BACKEND}/.venv/bin/python`, ['-c', PROBE], { ...ENV, SENTINEL: V_WX }, { cwd: BACKEND });
  const preLines = pre.trim().split('\n').slice(-2);
  ck('存进去之后 `resolve()` 回的是库里那一把（不是 .env 的）',
    preLines[0] === 'OVERRIDE' && preLines[1] === 'DIFFERS_FROM_ENV', preLines.join('｜'));

  // ⑦ 两下才删得掉
  const tap1 = await ev(`(() => {
    const tr = [...document.querySelectorAll('#secrets tbody tr')].find(t => t.textContent.indexOf('WECHAT_APP_SECRET') === 0);
    const b = [...tr.querySelectorAll('button')].find(x => /删掉|再点一次/.test(x.textContent));
    b.click();
    return b.textContent;
  })()`);
  await sleep(900);
  st = JSON.parse(await readCard());
  ck('第一下只换话术、那一行还在（这一枚改的是线上正在用的值）',
    st.rows.some(r => r[0] === 'WECHAT_APP_SECRET') && tap1 === '再点一次=删掉', tap1);
  await ev(`(() => {
    const tr = [...document.querySelectorAll('#secrets tbody tr')].find(t => t.textContent.indexOf('WECHAT_APP_SECRET') === 0);
    [...tr.querySelectorAll('button')].find(x => /再点一次/.test(x.textContent)).click();
    return 'kicked';
  })()`);
  await sleep(2200);
  st = JSON.parse(await readCard());
  ck('第二下真删掉：那一行从屏上没了', !st.rows.some(r => r[0] === 'WECHAT_APP_SECRET'), st.rows.map(r => r[0]).join('｜'));
  ck('删完的回执说的是"回到 .env"', /已删掉 WECHAT_APP_SECRET（这个名字回到 .env 的值）/.test(st.err), st.err);
  const post = await sh(`${BACKEND}/.venv/bin/python`, ['-c', `from app.services import service_secrets as ss;print(ss.resolve('WECHAT_APP_SECRET','FALLBACK-FAKE'))`], ENV, { cwd: BACKEND });
  ck('删掉那一行后 `resolve()` 立刻回到调用方传的那一份（撤回不必知道旧值）',
    post.trim().split('\n').pop() === 'FALLBACK-FAKE', post.trim().split('\n').pop());

  // ⑧ 坏形状红在这一栏
  await put('bad name!', 'x', '');
  await sleep(1600);
  st = JSON.parse(await readCard());
  ck('名字形状不对时红话落在这一栏、且没写进库',
    /存不下：名字要用大写英文/.test(st.err) && !st.rows.some(r => r[0].indexOf('bad') === 0), st.err);
  await put('DEEPSEEK_API_KEY', '', '');
  await sleep(1200);
  st = JSON.parse(await readCard());
  ck('值空着时根本不发请求，屏上问「再粘贴密钥值」', /再粘贴密钥值/.test(st.err), st.err);
  await put('', 'x', '');
  await sleep(1200);
  st = JSON.parse(await readCard());
  ck('名字空着时屏上问「先写名字」', /先写名字/.test(st.err), st.err);

  // ⑨ 覆盖：同名再存一次只有一行
  await put('deepseek_api_key', V_ZZ, '第二次覆盖的那把');
  await sleep(2200);
  st = JSON.parse(await readCard());
  const dsn = st.rows.filter(r => r[0] === 'DEEPSEEK_API_KEY');
  ck('同名再存一次是覆盖不是新增（屏上仍只有一行、指纹换成了新那把）',
    dsn.length === 1 && dsn[0][2] === SHA8(V_ZZ) && dsn[0][4] === '第二次覆盖的那把', dsn.length + ' 行');

  ck('全程不抛异常', cdp.exceptions.length === 0, cdp.exceptions.join(' | ').slice(0, 300));

  const shot = async (name) => {
    const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}/${name}`, Buffer.from(s.data, 'base64'));
    console.log(`  · 屏照 ${OUT}/${name}`);
  };
  await ev(`document.querySelector('#secrets .card').scrollIntoView({ block: 'start' })`);
  await sleep(600);
  await shot('密钥配置栏-两行与覆盖.png');
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
