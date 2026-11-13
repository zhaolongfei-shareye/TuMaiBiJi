/* H5 口令登录：在真浏览器里真点一遍（本机 http 起页面，后端打的是**现网真后端**）。
 *
 * 为什么必须有这一把：`tests/test_password_auth.py` 那 50 条钉的是回体与库，
 * `probes/password_live_probe.py` 那 34 条钉的是现网接口——两把都钉不住"屏上画不出来"那一型
 *（10-19 后台那一栏就是 45 条全绿、屏上一片空）。这一把量的是：
 *   ① 七态每一态真在屏上、句子真念得出来、按钮真点得动；
 *   ② 注册 → 建笔记 → 退出 → 登录 → **同一篇还在**（站长要的那件事）；
 *   ③ 换一台设备（换 deviceId＋清空本机）登录 → 同一篇还在；
 *   ④ 游客升级后 account 不换人、笔记不丢；
 *   ⑤ 找回／改密之后旧票真的废了；
 *   ⑥ 注销之后本机与库里都干净，且**不会静默换个游客身份接着用**。
 *
 * 收尾纪律：造出来的号在 finally 里全部走 `/api/user/deactivate`（体里 `confirm:true`）真删，
 * 删完再读一次确认 401。半路崩了也走 finally；删不掉会把话说出来，不许报绿。
 *
 * ⚠ 限流（按 IP）：register 3/小时、password-login 10/分、recover 5/小时、upgrade 5/小时、
 *   change-password 5/小时。这一把用 register 1／upgrade 1／recover 1／change 1。
 *   **一小时内别连跑三趟**。
 *
 * 跑法：node docs/工具/验-H5口令登录-真跑.mjs            （默认打本机 8123 起的页面）
 *       H5_URL=https://agentsbin.cn/app/ node docs/工具/验-H5口令登录-真跑.mjs   （打现网那一页）
 *       UI_ONLY=1 node docs/工具/验-H5口令登录-真跑.mjs  （只量七态排版，一个号都不造）
 *       SMOKE=1 H5_URL=https://agentsbin.cn/app/ node docs/工具/验-H5口令登录-真跑.mjs
 *         （现网冒烟：注册→建笔记→退出→登录→同一篇→注销。只吃 register 1，
 *           部署后能在同一个限流窗口里紧接着全量那一趟跑——全量吃 register 2，两趟全量必撞 3/小时 的闸）
 *
 * ⚠ 额度别猜，现读：`ssh agentsbin 'redis-cli get "LIMITS:LIMITER/<出口IP>//v1/auth/register/3/1/hour"'`
 *   （限流存储是真 Redis，`app/core/rate_limit.py:39`）。满了就等 TTL，**不许自己去清那个键**。
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import http from 'node:http';

const H5_DIR = process.env.H5_DIR || '/Users/zlfmac/Documents/TuMaiBiJi-H5';
// 反向验证（H5_DIR 指到弄坏的副本）那一趟不许覆盖真证据：屏照与读数各走一个槽。
const SMOKE = !!process.env.SMOKE;
// 三档各走一个证据槽：本机全量／弄坏副本的反向／现网冒烟，谁也不许覆盖谁。
const SLOT = process.env.H5_DIR ? '-反向' : (SMOKE ? '-现网' : '');
const OUT = resolve(`docs/取证/1113-口令登录/屏照${SLOT}`);
const PORT = 8123;
const CDP_PORT = 9351;
const H5_URL = process.env.H5_URL || `http://127.0.0.1:${PORT}/index.html`;
const API = 'https://api.agentsbin.cn/wtsj';
const W = 390, H = 844;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = [], bad = [];
const ck = (name, cond, got) => {
  const line = `  ${cond ? '✓' : '✗'} ${name}${got !== undefined && got !== '' ? `　→ ${typeof got === 'string' ? got : JSON.stringify(got)}` : ''}`;
  console.log(line);
  (cond ? ok : bad).push(line);
};
const j = async (p, o) => (await fetch(`http://127.0.0.1:${CDP_PORT}${p}`, o)).json();

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const exceptions = [], consoleErrs = [], failedReq = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrs.push(m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
    }
    if (m.method === 'Network.loadingFailed') failedReq.push(m.params.errorText);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
  });
  const ready = new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id; pending.set(n, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return { ready, send, ws, exceptions, consoleErrs, failedReq };
}

// 静态文件服务：只服务 H5 那棵树，`_bak-*` 与 capacitor 不给（免得把备份件当成现网件量）。
function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
  return http.createServer(async (req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (p.startsWith('/_bak') || p.startsWith('/capacitor')) { res.writeHead(404); return res.end('no'); }
    const f = resolve(H5_DIR, '.' + (p === '/' ? '/index.html' : p));
    if (!f.startsWith(H5_DIR) || !existsSync(f)) { res.writeHead(404); return res.end('no'); }
    const { readFile } = await import('node:fs/promises');
    const ext = f.slice(f.lastIndexOf('.'));
    res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(f));
  });
}

let chrome = null, server = null, cdp = null;
const made = [];   // [{login, password, token, label}]  收尾按这个名单真删

async function apiCall(method, path, body, token) {
  const r = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let d = null; try { d = await r.json(); } catch { }
  return { status: r.status, body: d };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const tag = randomBytes(5).toString('hex');
  const LOGIN = `h5-${tag}@example.com`;
  const PASS = 'h5-pass-' + tag;
  const PASS2 = 'h5-new-' + tag;
  const PASS3 = 'h5-rec-' + tag;
  const UP_LOGIN = `h5up-${tag}@example.com`;
  const UP_PASS = 'h5-up-' + tag;
  const NOTE = '口令登录验收-' + tag;
  const UP_NOTE = '游客升级验收-' + tag;
  let curPass = PASS;   // ⑪⑫ 会换口令；⑮ 登回去要用"此刻真正有效"的那一枚
  console.log(`=== H5 口令登录真跑 tag=${tag} ===`);
  console.log(`页面：${H5_URL}\n后端：${API}\n`);

  if (!process.env.H5_URL) {
    server = serve();
    await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  }
  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/h5-pwd-chrome-${Date.now()}`,
      '--no-first-run', '--disable-gpu', '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await j('/json/version'); break; } catch { await sleep(250); } if (i === 59) throw new Error('headless Chrome 没起来'); }
  const tab = await j('/json/new?url=about:blank', { method: 'PUT' });
  cdp = connect(tab.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const ev = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面里那段求值抛了：' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
  };
  const shot = async (name) => {
    const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, 'base64'));
    console.log(`  · 屏照 ${name}.png`);
  };
  // 屏上那一态的整份读数：文字用 textContent（藏起来的元素 innerText 回空串＝假红）
  const screen = () => ev(`(() => {
    const card = document.getElementById('login-card');
    const ls = document.getElementById('login-screen');
    const app = document.getElementById('app');
    const vis = (el) => !!el && getComputedStyle(el).display !== 'none';
    const btn = card && card.querySelector('.login-submit');
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    return JSON.stringify({
      loginVisible: vis(ls), appVisible: vis(app),
      sub: card ? (card.querySelector('.login-sub') || {}).textContent || '' : '',
      note: card ? [...card.querySelectorAll('.login-note')].map(n => n.textContent) : [],
      fields: card ? [...card.querySelectorAll('input')].map(i => ({ id: i.id, type: i.type, ph: i.placeholder, ac: i.getAttribute('autocomplete') })) : [],
      btn: btn ? { text: btn.textContent, disabled: btn.disabled, box: r(btn) } : null,
      links: card ? [...card.querySelectorAll('.login-link')].map(a => a.textContent) : [],
      rows: card ? [...card.querySelectorAll('.login-row')].map(x => x.textContent) : [],
      code: card ? (card.querySelector('.recovery-code') || {}).textContent || '' : '',
      err: (document.getElementById('login-error') || {}).textContent || '',
      guest: card ? [...card.querySelectorAll('.login-back')].map(x => x.textContent) : [],
      cardBox: r(card),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      page: ((window.Router && Router.current && Router.current()) || {}).name || '',
      g: { isLoggedIn: App.globalData.isLoggedIn, guestMode: App.globalData.guestMode, isGuestAccount: App.globalData.isGuestAccount, accountLogin: App.globalData.accountLogin || '', providers: App.globalData.accountProviders || [], userId: String(App.globalData.userId || '') },
      token: App.globalData.token || ''
    });
  })()`).then((s) => JSON.parse(s));
  const clickAct = (act) => ev(`(() => { const el = document.querySelector('#login-card [data-act="${act}"]'); if (!el) return false; el.click(); return true })()`);
  const fill = (id, v) => ev(`(() => { const el = document.getElementById(${JSON.stringify(id)}); if (!el) return false; el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('input', {bubbles:true})); return true })()`);
  const submit = async () => { await clickAct('submit'); };
  const waitMode = async (sub, ms = 12000) => {
    for (let i = 0; i < ms / 200; i++) { const s = await screen(); if (s.sub === sub && !(s.btn && s.btn.disabled)) return s; await sleep(200); }
    return await screen();
  };
  const waitApp = async (ms = 15000) => {
    for (let i = 0; i < ms / 200; i++) { const s = await screen(); if (s.appVisible && !s.loginVisible) return s; await sleep(200); }
    return await screen();
  };
  const goBoot = async () => { await cdp.send('Page.navigate', { url: H5_URL }); await sleep(3500); };
  const openSettings = async () => {
    await ev(`Router.go('me')`); await sleep(900);
    await ev(`(() => { const t = [...document.querySelectorAll('#page-root [data-tab]')].find(x => /设置/.test(x.textContent)); if (t) t.click() })()`);
    await sleep(1400);
  };
  const noteTitles = () => ev(`(() => [...document.querySelectorAll('#page-root .ixl-tt')].map(x => x.textContent))()`);

  const report = () => {
    console.log(`\n=== ${ok.length} 过 / ${bad.length} 红 ===`);
    writeFileSync(resolve(`docs/取证/1113-口令登录/H5真跑-读数${SLOT}.txt`),
      [`页面：${H5_URL}`, `后端：${API}`, `视口：${W}×${H} @2x`, `档：${process.env.UI_ONLY ? 'UI_ONLY（只量屏上七态，一个号都没造）' : SMOKE ? 'SMOKE 现网冒烟（注册→建笔记→退出→登录→同一篇→注销，register 1）' : '全量十六组'}`, '', ...ok, ...bad, '', `${ok.length} 过 / ${bad.length} 红`].join('\n'));
    return bad.length ? 1 : 0;
  };

  try {
    // ── ① 冷启动：本机什么都没有 ⇒ 自动开设备游客号，直接进应用（不是登录屏）
    await goBoot();
    let s = await screen();
    ck('① 冷启动直接进应用（设备游客号）', s.appVisible && !s.loginVisible, { page: s.page, isLoggedIn: s.g.isLoggedIn });
    ck('① 这一态是设备游客号（还没口令）', s.g.isGuestAccount === true && s.g.accountLogin === '', s.g);
    ck('① 屏上零横向溢出', s.overflowX === false);
    await shot('01-冷启动首页');

    // ── ② 我的 → 设置：「账号」那一行在，且念的是"登录 / 注册"
    await openSettings();
    const setRows = await ev(`(() => [...document.querySelectorAll('#page-root .menu-item')].map(x => ({
      label: (x.querySelector('.menu-label')||{}).textContent || '',
      right: x.textContent.replace(((x.querySelector('.menu-label')||{}).textContent||''), ''),
      h: Math.round(x.getBoundingClientRect().height),
      wrapped: [...x.querySelectorAll('.menu-label,.menu-hint,.menu-value')].some(n => n.getBoundingClientRect().height > 26)
    })))()`);
    ck('② 设置栏第一行＝账号', setRows[0] && setRows[0].label === '账号', setRows.map((r) => r.label));
    ck('② 未设口令时那一行念「登录 / 注册，换设备也能看到」', /登录 \/ 注册，换设备也能看到/.test(setRows[0].right), setRows[0].right);
    ck('② 设置栏五行齐（账号／卡片市场／私密密码／我的邮箱／注销账号）',
      JSON.stringify(setRows.map((r) => r.label)) === JSON.stringify(['账号', '卡片市场', '私密密码', '我的邮箱', '注销账号']), setRows.map((r) => r.label));
    ck('② 每行仍是 53px（新增一行没把既有行挤扁）', setRows.every((r) => r.h === 53), setRows.map((r) => r.h));
    ck('② 没有一行文字折行', setRows.every((r) => !r.wrapped), setRows.filter((r) => r.wrapped));
    await shot('02-设置栏-未登录');

    // ── ③ 点「账号」⇒ 登录屏（login 态），且带"给本机这个账号设密码"那一枝
    await ev(`document.querySelector('#page-root .menu-item[data-action="account"]').click()`);
    await sleep(600);
    s = await screen();
    ck('③ 点账号进登录屏', s.loginVisible && !s.appVisible && s.sub === '登录', s.sub);
    ck('③ 两只输入框：登录名＋密码（密码框 type=password）',
      s.fields.length === 2 && s.fields[0].id === 'lg-name' && s.fields[1].type === 'password', s.fields);
    ck('③ 登录名框 autocomplete=username（系统密码管理器认得）', s.fields[0].ac === 'username', s.fields[0].ac);
    ck('③ 三个入口：注册新账号／忘记密码／给本机这个账号设密码',
      JSON.stringify(s.links) === JSON.stringify(['注册新账号', '忘记密码', '给本机这个账号设密码 ›']), s.links);
    ck('③ 留了本机试用的退路', s.guest.length === 1 && /先随便看看，本机试用/.test(s.guest[0]), s.guest);
    ck('③ 登录卡不溢出屏幕', s.cardBox && s.cardBox.x >= 0 && s.cardBox.x + s.cardBox.w <= W, s.cardBox);
    ck('③ 主按钮不折行（高度 ≤ 52）', s.btn && s.btn.box.h <= 52 && s.btn.text === '登录', s.btn);
    await shot('03-登录屏');

    // ── ④ 注册态：两句实话必须在屏上
    await clickAct('register'); await sleep(400);
    s = await screen();
    ck('④ 注册态三只框（登录名／密码／再输一遍）', s.fields.map((f) => f.id).join(',') === 'lg-name,lg-pass,lg-pass2', s.fields.map((f) => f.id));
    ck('④ 屏上写明「不会发验证码」', s.note.some((n) => /手机号或邮箱只当登录名用，我们不会发验证码。/.test(n)), s.note);
    ck('④ 主按钮念「注册并登录」', s.btn.text === '注册并登录', s.btn.text);
    await shot('04-注册屏');

    // ④a 本地闸：登录名形状不对／密码太短／两次不一样，都不该出网
    await fill('lg-name', 'abc'); await fill('lg-pass', PASS); await fill('lg-pass2', PASS);
    await submit(); await sleep(500);
    s = await screen();
    ck('④a 登录名形状不对 ⇒ 屏上拦住', /登录名要填手机号或邮箱/.test(s.err), s.err);
    await fill('lg-name', LOGIN); await fill('lg-pass', '123'); await fill('lg-pass2', '123');
    await submit(); await sleep(400);
    ck('④a 密码太短 ⇒ 屏上拦住', /密码要 8–64 位/.test((await screen()).err));
    await fill('lg-pass', PASS); await fill('lg-pass2', PASS + 'x');
    await submit(); await sleep(400);
    ck('④a 两次不一样 ⇒ 屏上拦住', /两次输入的密码不一样/.test((await screen()).err));

    // UI_ONLY：注册闸此刻满着（3/小时，现读 Redis 计数），造号那一半等窗口回来再跑。
    // 这一档把**七态的排版**全量一遍——一个号都不造、一发写请求都不发。
    if (process.env.UI_ONLY) {
      const want = {
        login: { sub: '登录', fields: 'lg-name,lg-pass', btn: '登录' },
        register: { sub: '注册新账号', fields: 'lg-name,lg-pass,lg-pass2', btn: '注册并登录' },
        recover: { sub: '找回密码', fields: 'lg-name,lg-code,lg-pass', btn: '重置密码并登录' },
        upgrade: { sub: '给本机账号设密码', fields: 'lg-name,lg-pass,lg-pass2', btn: '设好密码' },
        change: { sub: '修改密码', fields: 'lg-old,lg-pass,lg-pass2', btn: '改密码' },
        account: { sub: '账号', fields: '', btn: '' },
      };
      for (const [mode, w] of Object.entries(want)) {
        await ev(`Login.show(${JSON.stringify(mode)})`); await sleep(350);
        const t = await screen();
        ck(`⑰ ${mode} 态标题「${w.sub}」`, t.sub === w.sub, t.sub);
        ck(`⑰ ${mode} 态输入框 ${w.fields || '（无）'}`, t.fields.map((f) => f.id).join(',') === w.fields, t.fields.map((f) => f.id));
        if (w.btn) ck(`⑰ ${mode} 态主按钮「${w.btn}」`, t.btn && t.btn.text === w.btn, t.btn && t.btn.text);
        ck(`⑰ ${mode} 态零横向溢出`, t.overflowX === false);
        ck(`⑰ ${mode} 态卡片在屏内`, t.cardBox && t.cardBox.x >= 0 && t.cardBox.x + t.cardBox.w <= W && t.cardBox.y >= 0, t.cardBox);
        const wrapped = await ev(`(() => [...document.querySelectorAll('#login-card .login-submit,#login-card .login-link,#login-card .login-note,#login-card .login-row-label')].filter(n => { const b = n.getBoundingClientRect(); return b.height > 0 && (b.right > window.innerWidth + 1 || b.left < -1) }).map(n => n.textContent))()`);
        ck(`⑰ ${mode} 态没有元素横向出屏`, wrapped.length === 0, wrapped);
        await shot(`20-态-${mode}`);
      }
      // 恢复码那一态：拿一串**样本码**只量排版（不是真下发的码，名字里写明）
      await ev(`Login.showRecovery('ABCD-EFGH-JKLM-NPQR')`); await sleep(350);
      const rc = await screen();
      ck('⑰ recovery 态（样本码，只量排版）标题对', rc.sub === '记下这串恢复码', rc.sub);
      ck('⑰ recovery 态码原样在屏上', rc.code === 'ABCD-EFGH-JKLM-NPQR', rc.code);
      ck('⑰ recovery 态两枚按钮：复制／我记下了',
        await ev(`(() => [...document.querySelectorAll('#login-card button')].map(b => b.textContent).join(','))()`) === '复制,我记下了');
      ck('⑰ recovery 态零横向溢出', rc.overflowX === false);
      await shot('20-态-recovery');
      ck('⑰ 全程页面零未捕获异常', cdp.exceptions.length === 0, cdp.exceptions.slice(0, 3).join(' | ').slice(0, 300));
      const uiErrs = cdp.consoleErrs.filter((e) => !/favicon|Failed to load resource: the server responded with a status of 4/.test(e));
      ck('⑰ 全程零 console.error（4xx 资源噪声除外）', uiErrs.length === 0, uiErrs.slice(0, 3).join(' | ').slice(0, 300));
      console.log('\n（UI_ONLY 档结束：一个号都没造，现网零写入）');
      return report();
    }

    // ── ⑤ 真注册 ⇒ 一次性恢复码那一屏
    await fill('lg-pass2', PASS);
    await submit();
    s = await waitMode('记下这串恢复码');
    ck('⑤ 注册成功进恢复码屏', s.sub === '记下这串恢复码', { sub: s.sub, err: s.err });
    ck('⑤ 恢复码 16 位四段', /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(s.code), s.code);
    ck('⑤ 屏上写明只显示这一次', s.note.some((n) => /这串恢复码只显示这一次。密码和恢复码都丢了，账号就找不回来了。/.test(n)), s.note);
    ck('⑤ 注册这一趟已换到真账号（不再是游客）', s.g.isGuestAccount === false && s.g.accountLogin === LOGIN, s.g);
    const RECOVERY = s.code;
    made.push({ login: LOGIN, password: PASS, token: s.token, label: '注册号' });
    await shot('05-一次性恢复码');
    // 复制按钮真点（headless 里 clipboard 可能被拒，两条路都算通，但话必须对）
    await clickAct('copy'); await sleep(500);
    const copyText = await ev(`(() => { const b = document.querySelector('#login-card .login-ghost'); return b ? b.textContent : '' })()`);
    ck('⑤ 复制按钮点了有反馈', copyText === '已复制' || /复制不了，长按上面那串码手动复制/.test((await screen()).err), copyText);
    await clickAct('done');
    s = await waitApp();
    ck('⑤「我记下了」回到应用', s.appVisible && !s.loginVisible, { app: s.appVisible, login: s.loginVisible });

    // ── ⑥ 建一篇真笔记（走应用自己的写口，与手写页同一条），列表真读得回
    const created = await ev(`Api.createNote({ title: ${JSON.stringify(NOTE)}, content: '这一篇用来验换设备登录还看得到。', original_content: '这一篇用来验换设备登录还看得到。' }).then(n => JSON.stringify({id: n && n.id, title: n && n.title}))`);
    const note = JSON.parse(created);
    ck('⑥ 真建了一篇笔记', !!note.id, note);
    await ev(`Router.go('index')`); await sleep(2500);
    let titles = await noteTitles();
    ck('⑥ 列表页真画出这一篇', titles.some((t) => t.includes(NOTE)), titles.slice(0, 5));
    await shot('06-列表-注册后');

    // ── ⑦ 账号面板：登录名在屏上，三行齐
    await openSettings();
    const acctRight = await ev(`(() => { const x = document.querySelector('#page-root .menu-item[data-action="account"]'); return x ? x.textContent : '' })()`);
    ck('⑦ 设置栏那一行现在念登录名', acctRight.includes(LOGIN), acctRight);
    await shot('07-设置栏-已登录');
    await ev(`document.querySelector('#page-root .menu-item[data-action="account"]').click()`);
    await sleep(600);
    s = await screen();
    ck('⑦ 进的是账号面板', s.sub === '账号', s.sub);
    ck('⑦ 三行：登录名／修改密码／退出登录', s.rows.length === 3 && /登录名/.test(s.rows[0]) && s.rows[0].includes(LOGIN) && /修改密码/.test(s.rows[1]) && /退出登录/.test(s.rows[2]), s.rows);
    await shot('08-账号面板');

    // ── ⑧ 退出登录 ⇒ 登录屏；**刷新之后仍停在登录屏**（不许静默换个游客身份）
    const oldToken = s.token;
    await clickAct('signout'); await sleep(900);
    s = await screen();
    ck('⑧ 退出后回登录屏', s.loginVisible && !s.g.isLoggedIn, { login: s.loginVisible, isLoggedIn: s.g.isLoggedIn });
    ck('⑧ 退出后本机票清了', await ev(`!localStorage.getItem('authToken') && !localStorage.getItem('authUserId')`));
    ck('⑧ 落了「主动退出过」那一枚', await ev(`!!localStorage.getItem('signedOut')`));
    await shot('09-退出后登录屏');
    await goBoot();
    s = await screen();
    ck('⑧ 刷新后仍在登录屏（没静默开新游客号）', s.loginVisible && !s.g.isLoggedIn, { login: s.loginVisible, isLoggedIn: s.g.isLoggedIn });
    ck('⑧ 这一态不再显示"给本机账号设密码"（没票了）', !s.links.some((l) => /设密码/.test(l)), s.links);

    // ⑧a 错密码：屏上要念服务端那句话，不许静默变成游客
    await fill('lg-name', LOGIN); await fill('lg-pass', 'wrong-pass-xxx');
    await submit(); await sleep(2200);
    s = await screen();
    ck('⑧a 错密码屏上念「登录名或密码不对」', /登录名或密码不对/.test(s.err), s.err);
    ck('⑧a 错密码之后没被静默换成游客', s.loginVisible && !s.g.isLoggedIn, { login: s.loginVisible, isLoggedIn: s.g.isLoggedIn });
    await shot('10-错密码');

    // ── ⑨ 真登录 ⇒ 同一篇笔记还在
    await fill('lg-pass', PASS);
    await submit();
    s = await waitApp();
    ck('⑨ 登录成功进应用', s.appVisible && s.g.accountLogin === LOGIN, { app: s.appVisible, accountLogin: s.g.accountLogin, err: s.err });
    ck('⑨ 换到的票与退出前不是同一枚', s.token && s.token !== oldToken);
    await ev(`Router.go('index')`); await sleep(2500);
    titles = await noteTitles();
    ck('⑨ 退出再登，那一篇还在', titles.some((t) => t.includes(NOTE)), titles.slice(0, 5));
    await shot('11-重新登录后列表');

    // 冒烟档（SMOKE=1）跳过 ⑩–⑭：那一串要吃 register 2／recover 3／change 1／upgrade 1，
    // 部署后紧接着再跑一趟全量必撞 register 3/小时 的闸。冒烟只走
    // 注册→建笔记→退出→登录→同一篇→注销（register 1），够证"现网这一页真能用"。
    if (!SMOKE) {
      // ── ⑩ 换一台设备：清空本机（含 deviceId）＋新 deviceId ⇒ 登录后仍读到同一篇
      const uidBefore = s.g.userId;
      await ev(`localStorage.clear()`);
      await goBoot();
      s = await screen();
      ck('⑩ 清空本机后冷启动开的是**另一个**设备游客号', s.appVisible && s.g.userId !== uidBefore, { before: uidBefore, after: s.g.userId });
      const otherDeviceNote = await noteTitles();
      ck('⑩ 新设备看不到上一个人的笔记', !(otherDeviceNote || []).some((t) => t.includes(NOTE)), (otherDeviceNote || []).slice(0, 5));
      await openSettings();
      await ev(`document.querySelector('#page-root .menu-item[data-action="account"]').click()`);
      await sleep(600);
      await fill('lg-name', LOGIN); await fill('lg-pass', PASS);
      await submit();
      s = await waitApp();
      ck('⑩ 换设备登录成功', s.appVisible && s.g.accountLogin === LOGIN, { app: s.appVisible, err: s.err });
      await ev(`Router.go('index')`); await sleep(2500);
      titles = await noteTitles();
      ck('⑩ **换设备登录读到同一篇**（站长要的那件事）', titles.some((t) => t.includes(NOTE)), titles.slice(0, 5));
      await shot('12-换设备登录后列表');

      // ── ⑪ 修改密码：与找回同一套后果（抬代次＋换恢复码＋发新钥匙）
      // ⚠ 成功之后**停在一次性恢复码屏**，不是直接回应用：后端 `set_password` 换发了新码，
      //   H5 `_go` 见 `recovery_code` 就摆那一屏。11-13 第一版尺子按"直接回应用"断言，
      //   于是 ⑪ 红、⑫ 拿着注册那枚已作废的码去找回又红，一路连锁到 ⑭⑮（8 条红全是这一处）。
      await openSettings();
      await ev(`document.querySelector('#page-root .menu-item[data-action="account"]').click()`); await sleep(500);
      await clickAct('change'); await sleep(400);
      s = await screen();
      ck('⑪ 改密态三只框（现在的／新／再输一遍）', s.fields.map((f) => f.id).join(',') === 'lg-old,lg-pass,lg-pass2', s.fields.map((f) => f.id));
      ck('⑪ 改密屏先说清会换码、旧码作废', s.note.some((n) => /改好会换一串新恢复码，旧的那串当场作废。/.test(n)), s.note);
      await shot('13-修改密码屏');
      const tokenBeforeChange = s.token;
      ck('⑪ 改密之前手里有票（后面那条 401 才有牙）', !!tokenBeforeChange);
      await fill('lg-old', PASS); await fill('lg-pass', PASS2); await fill('lg-pass2', PASS2);
      await submit();
      s = await waitMode('记下这串恢复码');
      ck('⑪ 改密成功进一次性恢复码屏（后端换发了新码）', s.sub === '记下这串恢复码', { sub: s.sub, err: s.err });
      ck('⑪ 换发的新码与注册那枚不同', /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(s.code) && s.code !== RECOVERY, s.code);
      await shot('13b-改密后一次性恢复码');
      const CHANGED_RECOVERY = s.code;
      made.find((m) => m.login === LOGIN).password = PASS2;
      curPass = PASS2;
      made.find((m) => m.login === LOGIN).token = s.token;
      const changedTok = await apiCall('GET', '/api/user/profile', undefined, tokenBeforeChange);
      ck('⑪ 改密之前那枚票立刻 401（抬了代次）', changedTok.status === 401, changedTok.status);
      await clickAct('done');
      s = await waitApp();
      ck('⑪「我记下了」回到应用（不重进页）', s.appVisible && !s.loginVisible, { app: s.appVisible, err: s.err });
      const oldPw = await apiCall('POST', '/v1/auth/password-login', { login: LOGIN, password: PASS });
      ck('⑪ 旧密码真登不进（400）', oldPw.status === 400, oldPw.status);
      const newPw = await apiCall('POST', '/v1/auth/password-login', { login: LOGIN, password: PASS2 });
      ck('⑪ 新密码真登得进（200）', newPw.status === 200, newPw.status);
      if (newPw.body && newPw.body.token) made.find((m) => m.login === LOGIN).token = newPw.body.token;

      // ── ⑫ 忘记密码：恢复码重置 ⇒ 旧票立刻废、旧恢复码作废、笔记不搬家
      const tokenBeforeRecover = (await screen()).token;
      await ev(`App.clearSession()`); await sleep(800);
      await clickAct('recover'); await sleep(400);
      s = await screen();
      ck('⑫ 找回态四只框（登录名／恢复码／新密码）', s.fields.map((f) => f.id).join(',') === 'lg-name,lg-code,lg-pass', s.fields.map((f) => f.id));
      ck('⑫ 找回屏写明填最近一次那串码（改密之后注册那枚已作废）', s.note.some((n) => /填最近一次给你那串恢复码，设一个新密码。/.test(n)), s.note);
      await shot('14-找回密码屏');
      // 恢复码故意不带连字符：库里比的是去掉分隔符那 16 位
      await fill('lg-name', LOGIN); await fill('lg-code', CHANGED_RECOVERY.replace(/-/g, '')); await fill('lg-pass', PASS3);
      await submit();
      s = await waitMode('记下这串恢复码');
      ck('⑫ 恢复码不带连字符也认（重置成功）', s.sub === '记下这串恢复码', { sub: s.sub, err: s.err });
      ck('⑫ 换发了新恢复码且与旧的不同', /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(s.code) && s.code !== CHANGED_RECOVERY, s.code);
      made.find((m) => m.login === LOGIN).password = PASS3;
      curPass = PASS3;
      made.find((m) => m.login === LOGIN).token = s.token;
      const oldTok = await apiCall('GET', '/api/user/profile', undefined, tokenBeforeRecover);
      ck('⑫ 找回之前那枚票立刻 401', oldTok.status === 401, oldTok.status);
      const oldCode = await apiCall('POST', '/v1/auth/recover', { login: LOGIN, recovery_code: CHANGED_RECOVERY, new_password: 'another-pass-xxx' });
      ck('⑫ 刚用过那枚恢复码再用一次进不去', oldCode.status >= 400, oldCode.status);
      const firstCode = await apiCall('POST', '/v1/auth/recover', { login: LOGIN, recovery_code: RECOVERY, new_password: 'another-pass-xxx' });
      ck('⑫ 注册那枚码在改密之后就作废了', firstCode.status >= 400, firstCode.status);
      await clickAct('done'); await waitApp();
      await ev(`Router.go('index')`); await sleep(2500);
      titles = await noteTitles();
      ck('⑫ 找回之后笔记没搬家', titles.some((t) => t.includes(NOTE)), titles.slice(0, 5));
      await shot('15-找回后列表');

      // ── ⑬ 游客升级：另开一台设备 ⇒ 建一篇 ⇒ 给本机账号设密码 ⇒ account 不换人、笔记不丢
      await ev(`localStorage.clear()`);
      await goBoot();
      s = await screen();
      const guestUid = s.g.userId;
      ck('⑬ 新设备是游客号', s.g.isGuestAccount === true && s.g.accountLogin === '', s.g);
      await ev(`Api.createNote({ title: ${JSON.stringify(UP_NOTE)}, content: '升级前建的。', original_content: '升级前建的。' }).then(n => n && n.id)`);
      const acctBefore = await ev(`Api.getSession().then(s => JSON.stringify(s))`);
      await openSettings();
      await ev(`document.querySelector('#page-root .menu-item[data-action="account"]').click()`); await sleep(600);
      await clickAct('upgrade'); await sleep(400);
      s = await screen();
      ck('⑬ 升级态标题「给本机账号设密码」', s.sub === '给本机账号设密码', s.sub);
      ck('⑬ 升级屏写明笔记跟着账号走', s.note.some((n) => /设好之后，这台设备上的笔记跟着这个账号走，换设备登录就能看到。/.test(n)), s.note);
      await shot('16-游客升级屏');
      await fill('lg-name', UP_LOGIN); await fill('lg-pass', UP_PASS); await fill('lg-pass2', UP_PASS);
      await submit();
      s = await waitMode('记下这串恢复码');
      ck('⑬ 升级成功进恢复码屏', s.sub === '记下这串恢复码', { sub: s.sub, err: s.err });
      made.push({ login: UP_LOGIN, password: UP_PASS, token: s.token, label: '升级号' });
      ck('⑬ 升级后 userId 没换人', s.g.userId === guestUid, { before: guestUid, after: s.g.userId });
      ck('⑬ 升级后不再是游客账号', s.g.isGuestAccount === false && s.g.accountLogin === UP_LOGIN, s.g);
      await clickAct('done'); await waitApp();
      await ev(`Router.go('index')`); await sleep(2500);
      titles = await noteTitles();
      ck('⑬ 升级前那一篇没丢', titles.some((t) => t.includes(UP_NOTE)), titles.slice(0, 5));
      await shot('17-升级后列表');
      // 换设备用刚设的口令登得进、读到同一篇
      await ev(`localStorage.clear()`);
      await goBoot();
      await openSettings();
      await ev(`document.querySelector('#page-root .menu-item[data-action="account"]').click()`); await sleep(600);
      await fill('lg-name', UP_LOGIN); await fill('lg-pass', UP_PASS);
      await submit();
      s = await waitApp();
      ck('⑬ 换设备用升级后的口令登得进', s.appVisible && s.g.accountLogin === UP_LOGIN, { app: s.appVisible, err: s.err });
      await ev(`Router.go('index')`); await sleep(2500);
      titles = await noteTitles();
      ck('⑬ 换设备读到升级前那一篇', titles.some((t) => t.includes(UP_NOTE)), titles.slice(0, 5));

      // ── ⑭ 同名注册：屏上念 409 那句话，且原主密码没被改
      await ev(`App.clearSession()`); await sleep(800);
      await clickAct('register'); await sleep(400);
      await fill('lg-name', LOGIN); await fill('lg-pass', 'squatter-pass-xxx'); await fill('lg-pass2', 'squatter-pass-xxx');
      await submit(); await sleep(2500);
      s = await screen();
      ck('⑭ 同名注册屏上被拒（不是静默成功）', s.loginVisible && s.err && !/记下这串恢复码/.test(s.sub), { sub: s.sub, err: s.err });
      await shot('18-同名注册被拒');
      const ownerStill = await apiCall('POST', '/v1/auth/password-login', { login: LOGIN, password: PASS3 });
      ck('⑭ 抢名之后原主密码没被改', ownerStill.status === 200, ownerStill.status);
      if (ownerStill.body && ownerStill.body.token) made.find((m) => m.login === LOGIN).token = ownerStill.body.token;

    }

    // ── ⑮ 注销账号：真删 ＋ 本机抹净 ＋ 回登录屏且刷新不静默开游客号
    // 冒烟档跳过 ⑭，此刻可能还在应用里，所以先自己退到登录屏（全量档里 ⑭ 已退过，再退一次无副作用）。
    await ev(`App.clearSession()`); await sleep(800);
    await fill('lg-name', LOGIN); await fill('lg-pass', curPass);
    await clickAct('login'); await sleep(300);
    await fill('lg-name', LOGIN); await fill('lg-pass', curPass);
    await submit();
    s = await waitApp();
    ck('⑮ 为注销先登回去', s.appVisible && s.g.accountLogin === LOGIN, { app: s.appVisible, err: s.err });
    const delTok = s.token;
    // 没票的话下面那三条（票 401／登录名 400／本机抹净）全是假绿：11-13 那趟登录失败，
    // 三条照样"过"，而 `dead=true` 无条件落 ⇒ 收尾跳过注销 ⇒ 现网真留了一枚号（事后另清）。
    ck('⑮ 登回去之后手里有票（后面三条判据才有牙）', !!delTok);
    await openSettings();
    await ev(`window.confirm = () => true`);
    await ev(`document.querySelector('#page-root .menu-item[data-action="deactivate"]').click()`);
    await sleep(3500);
    s = await screen();
    ck('⑮ 注销后回登录屏', s.loginVisible && !s.g.isLoggedIn, { login: s.loginVisible, isLoggedIn: s.g.isLoggedIn });
    ck('⑮ 注销后本机 localStorage 抹净（只留 signedOut）',
      await ev(`Object.keys(localStorage).filter(k => k !== 'signedOut').length === 0`), await ev(`Object.keys(localStorage)`));
    const gone = await apiCall('GET', '/api/user/profile', undefined, delTok);
    ck('⑮ 注销后那枚票 401', gone.status === 401, gone.status);
    const relogin = await apiCall('POST', '/v1/auth/password-login', { login: LOGIN, password: curPass });
    ck('⑮ 注销后同一个登录名登不进（400）', relogin.status === 400, relogin.status);
    const reallyGone = !!delTok && gone.status === 401 && relogin.status === 400;
    ck('⑮ 库里真删了（有票＋票废＋名登不进，三条一起才算）', reallyGone, { 有票: !!delTok, 票: gone.status, 名: relogin.status });
    if (reallyGone) made.find((m) => m.login === LOGIN).dead = true;
    else console.log('  ⚠ ⑮ 没真注销 ⇒ 不标 dead，收尾补删');
    await shot('19-注销后登录屏');
    await goBoot();
    s = await screen();
    ck('⑮ 注销后刷新仍停登录屏（不静默换身份）', s.loginVisible && !s.g.isLoggedIn, { login: s.loginVisible, isLoggedIn: s.g.isLoggedIn });

    // ── ⑯ 全程健康
    ck('⑯ 全程页面零未捕获异常', cdp.exceptions.length === 0, cdp.exceptions.slice(0, 3).join(' | ').slice(0, 300));
    const realErrs = cdp.consoleErrs.filter((e) => !/favicon|Failed to load resource: the server responded with a status of 4/.test(e));
    ck('⑯ 全程零 console.error（4xx 资源噪声除外）', realErrs.length === 0, realErrs.slice(0, 3).join(' | ').slice(0, 300));
  } finally {
    console.log('\n--- 收尾：造出来的号真删 ---');
    for (const m of made) {
      if (m.dead) { console.log(`  · ${m.label} 已在⑮真注销`); continue; }
      let tok = m.token;
      if (!tok) {
        const r = await apiCall('POST', '/v1/auth/password-login', { login: m.login, password: m.password });
        tok = r.body && r.body.token;
      }
      if (!tok) { console.log(`  ✗ ${m.label} 拿不到票，删不掉 —— 现网可能留着 ${m.login}`); bad.push(`收尾 ${m.label} 删不掉`); continue; }
      let d = await apiCall('POST', '/api/user/deactivate', { confirm: true }, tok);
      if (d.status === 401) {
        const r = await apiCall('POST', '/v1/auth/password-login', { login: m.login, password: m.password });
        if (r.body && r.body.token) d = await apiCall('POST', '/api/user/deactivate', { confirm: true }, r.body.token);
      }
      ck(`收尾 ${m.label} 注销 200`, d.status === 200, d.status);
      if (d.status === 200) ck(`收尾 ${m.label} deleted.passwords 在场`, d.body && d.body.deleted && 'passwords' in d.body.deleted, d.body && d.body.deleted);
      const after = await apiCall('GET', '/api/user/profile', undefined, tok);
      ck(`收尾 ${m.label} 旧票 401`, after.status === 401, after.status);
    }
    try { if (cdp) cdp.ws.close(); } catch { }
    try { if (chrome) chrome.kill(); } catch { }
    try { if (server) server.close(); } catch { }
  }

  return report();
}

main().then((c) => process.exit(c)).catch(async (e) => {
  console.error('崩了：', e && e.stack || e);
  try { if (cdp) cdp.ws.close(); } catch { }
  try { if (chrome) chrome.kill(); } catch { }
  try { if (server) server.close(); } catch { }
  process.exit(2);
});