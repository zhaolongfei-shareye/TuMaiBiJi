/* H5 邮箱绑定那一格：在真浏览器里真点一遍（本机 http 起页面，后端打的是**现网真后端**）。
 *
 * 为什么必须有这一把：`tests/test_email_bind.py` 那 31 条钉的是回体与库，
 * `docs/工具/探针-并账后邮箱登录落哪一行.py` 钉的是服务层——两把都钉不住"屏上画不出来"那一型
 *（10-19 后台那一栏就是 45 条全绿、屏上一片空）。这一把量的正是第八十五次收尾时写在代码里的那句实话：
 *   「此刻唯一的缺口在客户端：三端都还没有让用户填这 6 位码的那一格。」
 * 量四件事：
 *   ① 三屏（填邮箱 → 填 6 位码 → 绑好之后）真在屏上、句子念得出来、按钮点得动、不许横向溢出；
 *   ② 两道前置闸真有牙：地址形状不对 ⇒ 一次发码请求都不许出；码不是 6 位 ⇒ 一次绑定请求都不许出；
 *   ③ 绑定成功那一趟**当场换新票**（不换 = 点完"绑定成功"下一发就 401；10-25 那格"屏上全是 0"
 *      记的就是票死的形状），并把 providers 里的 email 读回来 ⇒ 账号那一行念「已绑定」；
 *   ④ 端到端真走现网那四扇门：页面自己的游客票 → 发码 → 从服务器 Redis 现读那枚码 → 先故意填错一次
 *      （验"一枚码换一次机会"）→ 重新发 → 填对 → 库里真长出一行 `provider='email'` → 销号删净。
 *
 * ⚠ 全量那一档会**真发两封信**（首发＋重发各一封），收件地址是 `h5b-<随机名>@example.com` 这种
 *   不存在的域 ⇒ 腾讯云那本账上会多两行"没递送成功"。只想量屏就跑 `UI_ONLY=1`，那一档一封信都不发、
 *   一个号都不造。同一小时内别连着跑超过三次全量（`/email/send` 按来源 IP 限 3/分）。
 *
 * 收尾纪律：端到端那个游客号在 finally 之前走 `/api/user/deactivate`（体里 `confirm:true`）真删，
 * 删完复量 accounts／users／provider=email 三格回到动手前；崩在半路也补一次销号，删不掉会把话说出来。
 *
 * 跑法：node docs/工具/验-H5邮箱绑定-真跑.mjs                     （全量：屏＋端到端）
 *       UI_ONLY=1 node docs/工具/验-H5邮箱绑定-真跑.mjs           （只量三屏与两道闸）
 *       H5_URL=https://agentsbin.cn/app/ node docs/工具/验-H5邮箱绑定-真跑.mjs   （打现网那一页）
 *       ⚠ 打现网前先确认现网那三只字节就是这一版：本机与暂存与现网抓回三份 md5 逐只对等，
 *         量法是 `deploy` 那一节写在 docs/产品需求.md §8.531 里的三方核归属。
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import http from 'node:http';

const H5_DIR = process.env.H5_DIR || '/Users/zlfmac/Documents/TuMaiBiJi-H5';
const UI_ONLY = !!process.env.UI_ONLY;
const SLOT = UI_ONLY ? '-只量屏' : (process.env.H5_URL ? '-现网' : '');
const OUT = resolve(`docs/取证/1116-邮箱绑定界面/屏照${SLOT}`);
const READOUT = resolve(`docs/取证/1116-邮箱绑定界面/读数${SLOT}.txt`);
const PORT = 8124;
const CDP_PORT = 9352;
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

// 远端只读两条：Redis 那枚验证码、SQLite 那三格计数。
// ⚠ 一律 execFileSync('ssh', [host, 固定命令])——argv 里没有拼进来的用户输入；远端那串里唯一
//   动态的东西是 `ADDR`，而它是本文件自己生成的 `h5b-<8 位十六进制>@example.com`，先过一遍死板
//   的正闸：不匹配就当场停，绝不把任何别的内容送进那台 shell。
const ADDR_RE = /^h5b-[0-9a-f]{8}@example\.com$/;
function redisCmd(cmd, addr) {
  if (addr && !ADDR_RE.test(addr)) throw new Error(`收件地址形状不对，不往服务器送：${addr}`);
  return execFileSync('ssh', ['agentsbin', cmd], { encoding: 'utf8' }).trim();
}
const redisGet = (field, addr) => redisCmd(`redis-cli ${field} 'email:code:${addr}'`, addr);
const redisCool = (field, addr) => redisCmd(`redis-cli ${field} 'email:cool:${addr}'`, addr);
// 远端数三格：accounts／users 两张总数＋`provider='email'` 那一档的行数。
// ⚠ 回体必须现拼成 JSON：python 的 dict 打出来是单引号，`JSON.parse` 当场炸（第一趟就是这么红的）。
// ⚠ SQL 里那枚 `'email'`：整串 python 源码在远端 shell 的双引号里，python 字符串用单引号，
//   所以内层那两枚单引号要在 python 侧转义；JS 源码写 `\\'` 才是把 `\'` 送过去。
const BASE_SQL = `cd /home/ubuntu/wtsj-backend && .venv/bin/python -c "import json,sqlite3;c=sqlite3.connect('file:wtsj.db?mode=ro',uri=True);q=lambda t:c.execute(t).fetchone()[0];print(json.dumps({'accounts':q('select count(*) from accounts'),'users':q('select count(*) from users'),'email':q('select count(*) from account_identities where provider=\\'email\\'')}))"`;
const baseline = () => JSON.parse(redisCmd(BASE_SQL));

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const exceptions = [], consoleErrs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrs.push(m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
    }
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
  return { ready, send, ws, exceptions, consoleErrs };
}

// 静态服务只服务 H5 那棵树；`.bak` 与 capacitor 不给（免得把回滚副本当成现网件量）。
function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
  return http.createServer(async (req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (p.startsWith('/_bak') || p.startsWith('/capacitor') || p.includes('.bak')) { res.writeHead(404); return res.end('no'); }
    const f = resolve(H5_DIR, '.' + (p === '/' ? '/index.html' : p));
    if (!f.startsWith(H5_DIR) || !existsSync(f)) { res.writeHead(404); return res.end('no'); }
    const { readFile } = await import('node:fs/promises');
    res.writeHead(200, { 'content-type': types[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(f));
  });
}

let chrome = null, server = null, cdp = null;
let victim = null;   // 这一趟页面自己开的那枚游客号 { token, uid }：两档都要销，崩在半路也要销

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
  const tag = randomBytes(4).toString('hex');
  const ADDR = `h5b-${tag}@example.com`;
  console.log(`=== H5 邮箱绑定真跑 tag=${tag} 档=${UI_ONLY ? 'UI_ONLY（不发一封信、不造一个号）' : '全量（屏＋端到端，真发两封信到不存在的域）'} ===`);
  console.log(`页面：${H5_URL}\n后端：${API}\n收件地址（端到端那一档才用）：${ADDR}\n`);

  if (!process.env.H5_URL) {
    server = serve();
    await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  }
  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/h5-bind-chrome-${Date.now()}`,
      '--no-first-run', '--disable-gpu', '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await j('/json/version'); break; } catch { await sleep(250); } if (i === 59) throw new Error('headless Chrome 没起来'); }
  const tab = await j('/json/new?url=about:blank', { method: 'PUT' });
  cdp = connect(tab.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
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
  // 屏上那一屏的整份读数：文字走 textContent（藏起来的元素 innerText 会回空串＝假红）。
  const screen = () => ev(`(() => {
    const card = document.getElementById('login-card');
    const q = (s) => card ? (card.querySelector(s) || {}) : {};
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const btn = card && card.querySelector('.login-submit');
    const ghost = card && card.querySelector('.login-ghost');
    return JSON.stringify({
      sub: q('.login-sub').textContent || '',
      note: card ? [...card.querySelectorAll('.login-note')].map(n => n.textContent) : [],
      fields: card ? [...card.querySelectorAll('input')].map(i => ({ id: i.id, type: i.type, ph: i.placeholder, ac: i.getAttribute('autocomplete'), im: i.getAttribute('inputmode'), max: i.getAttribute('maxlength'), value: i.value })) : [],
      btn: btn ? { text: btn.textContent, disabled: btn.disabled, box: r(btn) } : null,
      ghost: ghost ? { text: ghost.textContent, disabled: ghost.disabled, box: r(ghost) } : null,
      links: card ? [...card.querySelectorAll('.login-link')].map(a => a.textContent) : [],
      rows: card ? [...card.querySelectorAll('.login-row')].map(x => x.textContent) : [],
      err: (document.getElementById('login-error') || {}).textContent || '',
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      cardBox: r(card),
      g: { accountLogin: App.globalData.accountLogin || '', providers: App.globalData.accountProviders || [], isGuestAccount: App.globalData.isGuestAccount, isLoggedIn: App.globalData.isLoggedIn },
      token: App.globalData.token || '',
      stored: localStorage.getItem('authToken') || '',
    });
  })()`).then((s) => JSON.parse(s));
  const clickAct = (act) => ev(`(() => { const el = document.querySelector('#login-card [data-act="${act}"]'); if (!el) return false; el.click(); return true })()`);
  const fill = (id, v) => ev(`(() => { const el = document.getElementById('${id}'); if (!el) return false; el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`);
  const goto = async (url) => { await cdp.send('Page.navigate', { url }); await sleep(4000); };

  // ── ① 进页：页面自己那一路（游客自动登录会真打现网 `/v1/auth/guest`）
  // 基线必须在**第一次加载页面之前**取。为什么：① 那一趟游客自动登录会在库里真开一个号，
  // 第⑨组用的正是它、收尾销的也是它——上一趟把基线取在端到端开头，那枚号已经算进 243 里，
  // 销完自然少 1（11-16 第一趟的两枚红里就有这一枚，红的是尺子不是产品）。
  let base = { accounts: 0, users: 0, email: 0 };
  base = baseline();
  console.log(`  · 动手前基线（页面还没加载过）accounts=${base.accounts} users=${base.users} provider=email ${base.email} 行`);
  await goto(H5_URL);
  let s = await screen();
  const booted = JSON.parse(await ev(`JSON.stringify({ 三只都在: !!(window.App && window.Login && window.Api), uid: String(App.globalData.userId || ''), token: App.globalData.token || '' })`));
  // ⚠ 那把票的**值**不许进读数文件：读数要留档、留档要进仓，而这是一枚真 JWT（半串也是串）。
  //   判据只看"有没有票、票多长"，收尾销号用的那把留在内存里，不落盘。
  const 票读数 = { 三只都在: booted['三只都在'], uid: booted.uid, 票长: booted.token.length };
  ck('① 页面起来了：App／Login／Api 三只都在', booted['三只都在'] === true, 票读数);
  victim = { token: booted.token, uid: booted.uid };   // 崩在半路也要销掉这一趟开的那枚号
  ck('① 一屏不横向溢出', s.overflowX === false, { overflowX: s.overflowX });

  // ── ② 入口两条：账号那一屏那一行（两种状态都摆一遍）＋ 登录屏那条游客入口
  const bindRow = JSON.parse(await ev(`(() => {
    const keep = App.globalData.accountProviders;
    App.globalData.accountProviders = ['guest'];
    Login.show('account');
    const 未绑定 = [...document.querySelectorAll('#login-card .login-row')].map(x => x.textContent);
    App.globalData.accountProviders = ['email', 'guest'];
    Login._render();
    const 已绑定 = [...document.querySelectorAll('#login-card .login-row')].map(x => x.textContent);
    App.globalData.accountProviders = keep;
    return JSON.stringify({ 未绑定, 已绑定 })
  })()`));
  ck('② 账号那一屏有「绑定邮箱」那一行，没绑时念「未绑定」', bindRow['未绑定'].some((t) => /绑定邮箱/.test(t) && /未绑定/.test(t)), bindRow['未绑定']);
  ck('② 绑过之后同一行念「已绑定」（读的是服务端 providers，不是本机猜的）', bindRow['已绑定'].some((t) => /绑定邮箱/.test(t) && /已绑定/.test(t)), bindRow['已绑定']);

  const guestLink = JSON.parse(await ev(`(() => {
    const keepG = { in: App.globalData.isLoggedIn, gs: App.globalData.isGuestAccount };
    App.globalData.isLoggedIn = true; App.globalData.isGuestAccount = true;
    Login.show('login');
    const 本机游客号 = [...document.querySelectorAll('#login-card .login-link')].map(x => x.textContent);
    App.globalData.isGuestAccount = false;
    Login._render();
    const 已有口令 = [...document.querySelectorAll('#login-card .login-link')].map(x => x.textContent);
    App.globalData.isLoggedIn = keepG.in; App.globalData.isGuestAccount = keepG.gs;
    return JSON.stringify({ 本机游客号, 已有口令 })
  })()`));
  ck('② 本机游客号（没设过口令）在登录屏就够得着绑定——否则这一格只对已注册的人存在', guestLink['本机游客号'].some((t) => /绑一枚邮箱/.test(t)), guestLink['本机游客号']);
  ck('② 已有口令的人不在登录屏看见第二条（同一功能只留一处入口：账号那一屏）', guestLink['已有口令'].every((t) => !/绑一枚邮箱/.test(t)), guestLink['已有口令']);
  await shot('01-登录屏那条游客入口');

  // ── ③ 第一屏：填邮箱
  await ev(`Login.show('bind')`); await sleep(400);
  s = await screen();
  ck('③ 第一屏标题念「绑定邮箱」', s.sub === '绑定邮箱', s.sub);
  ck('③ 那两句实话齐：说了为什么要绑，也说了「登录名和密码都不变」', s.note.length >= 2 && /身份/.test(s.note.join('')) && /登录名和密码都不变/.test(s.note.join('')), s.note);
  ck('③ 邮箱那一格 type／inputmode／autocomplete 三样都按一次性输入该有的给', s.fields.length === 1 && s.fields[0].id === 'lg-mail' && s.fields[0].type === 'email' && s.fields[0].im === 'email' && s.fields[0].ac === 'email', s.fields);
  ck('③ 主按钮念「发验证码」且没锁住', !!s.btn && s.btn.text === '发验证码' && s.btn.disabled === false, s.btn);
  ck('③ 第一屏还没有重发倒计时（只有码真发出去之后才出现那一枚）', s.ghost === null, s.ghost);
  ck('③ 第一屏不横向溢出', s.overflowX === false, { cardBox: s.cardBox });
  await shot('02-第一屏填邮箱');

  // ── ④～⑦ 这一段用桩：只数"该不该发请求"，一个字节都不碰现网
  const stubbed = JSON.parse(await ev(`(() => {
    window.__n = { send: 0, bind: 0 };
    window.__真发码 = App.bindEmailSend;      // ⑧ 与端到端那一档要把真货换回来
    window.__真绑定 = App.bindEmailConfirm;
    App.bindEmailSend = function (e) { window.__n.send++; return Promise.resolve({}) };
    App.bindEmailConfirm = function (e, c) { window.__n.bind++; return Promise.resolve({ merged: true, token: 'STUB-' + c }) };
    return JSON.stringify({ 挂了: true })
  })()`));
  ck('④ 桩挂上了（这一组只量闸，不动现网；真货留在 window 上等下几组换回来）', stubbed['挂了'] === true, stubbed);

  await fill('lg-mail', 'not-an-email');
  await clickAct('submit'); await sleep(400);
  s = await screen();
  let cnt = JSON.parse(await ev(`JSON.stringify(window.__n)`));
  ck('④ 地址不对：当场念一句人话', /邮箱地址看着不对/.test(s.err), s.err);
  ck('④ 地址不对：一次发码请求都没发出去（前置闸不是装饰——服务端对烂地址也回 {}，看不见就以为发了）', cnt.send === 0, cnt);
  ck('④ 地址不对：还停在第一屏', s.sub === '绑定邮箱', s.sub);
  await shot('03-地址不对当场拦');

  await fill('lg-mail', `H5B-${tag.toUpperCase().slice(0, 4)}X@example.com`);   // 故意大小写混着打
  await clickAct('submit'); await sleep(500);
  s = await screen();
  cnt = JSON.parse(await ev(`JSON.stringify(window.__n)`));
  ck('⑤ 交出去之前已抹平成小写（服务端 Redis 那枚键是按小写读的）', cnt.send === 1, cnt);
  ck('⑤ 第二屏标题念「填 6 位验证码」', s.sub === '填 6 位验证码', s.sub);
  ck('⑤ 第二屏那句里带着刚才那枚地址＋「只认一次」', /h5b-/.test(s.note.join(' ')) && /只认一次/.test(s.note.join(' ')), s.note);
  ck('⑤ 码那一格只收 6 位：maxlength=6、inputmode=numeric、autocomplete=one-time-code', s.fields.length === 1 && s.fields[0].id === 'lg-code6' && s.fields[0].max === '6' && s.fields[0].im === 'numeric' && s.fields[0].ac === 'one-time-code', s.fields);
  ck('⑤ 主按钮换成「绑定」', !!s.btn && s.btn.text === '绑定', s.btn);
  ck('⑤ 重发那一枚出现且锁住、文案带 60 秒倒计时', !!s.ghost && s.ghost.disabled === true && /^重新发送（60 秒）$/.test(s.ghost.text), s.ghost);
  ck('⑤ 第二屏不横向溢出', s.overflowX === false, { cardBox: s.cardBox });
  await shot('04-第二屏填码与倒计时');
  const coolA = s.ghost ? s.ghost.text : '';
  await sleep(2300);
  s = await screen();
  const coolB = s.ghost ? s.ghost.text : '';
  ck('⑤ 倒计时真的在走（2.3 秒后那枚数字小了，不是画上去的）', coolA !== coolB && /^重新发送（5[5-9] 秒）$/.test(coolB), { coolA, coolB });
  ck('⑤ 倒计时每秒只改那一枚按钮的字：输入框还在屏上（整屏重画会把人打进半截的码抹掉）', s.fields.length === 1 && s.fields[0].id === 'lg-code6', s.fields);

  await fill('lg-code6', '12345');
  await clickAct('submit'); await sleep(400);
  s = await screen();
  cnt = JSON.parse(await ev(`JSON.stringify(window.__n)`));
  ck('⑥ 少一位：当场念「验证码是 6 位数字」', /6 位数字/.test(s.err), s.err);
  ck('⑥ 少一位：一次绑定请求都没发出去（省下一次把码销毁的机会）', cnt.bind === 0, cnt);

  await clickAct('bindback'); await sleep(400);
  s = await screen();
  ck('⑦ 退回第一屏：刚才那枚地址还在框里（不让人重打一遍）', s.sub === '绑定邮箱' && /^h5b-/i.test(s.fields[0].value), s.fields);
  const xss = JSON.parse(await ev(`(() => {
    window.__xss = 0;
    Login._bindEmail = '"><img src=x onerror="window.__xss=1">';
    Login._bindStep = 'email'; Login._render();
    const 裸标签 = !!document.querySelector('#login-card img[src="x"]');
    const 值在框里 = (document.getElementById('lg-mail') || {}).value === '"><img src=x onerror="window.__xss=1">';
    return JSON.stringify({ 裸标签, 值在框里, 执行了: window.__xss === 1 })
  })()`));
  ck('⑦ 地址是转义进 HTML 的：没长出裸标签、没执行、值原样在框里', xss['裸标签'] === false && xss['执行了'] === false && xss['值在框里'] === true, xss);

  // ── ⑧ 绑定成功那一趟：走**真的** `App.bindEmailConfirm`（只把最外面那层 Api 桩掉）
  await ev(`(() => {
    App.bindEmailSend = window.__真发码; App.bindEmailConfirm = window.__真绑定;
    window.__真Api绑定 = Api.bindEmail;
    Api.bindEmail = function () { return Promise.resolve({ account_id: 'a', merged: true, token: 'NEWTOKEN-abcdef' }) };
    App.globalData.token = 'OLDTOKEN-999999'; localStorage.setItem('authToken', 'OLDTOKEN-999999');
    Login._bindEmail = 'x@y.com'; Login._bindStep = 'code'; Login._render();
    return true
  })()`);
  await fill('lg-code6', '246813');
  await clickAct('submit'); await sleep(800);
  s = await screen();
  ck('⑧ 绑定成功后屏上念「已绑定」', s.sub === '已绑定', { sub: s.sub, err: s.err });
  ck('⑧ 并账那一趟实话说了（merged=true ⇒ 念"两边的笔记并到了一起"）', /并到了一起/.test(s.note.join('')), s.note);
  ck('⑧ 手里那把票当场换成回体那把新的', s.token === 'NEWTOKEN-abcdef', { token: s.token });
  ck('⑧ 本机存的也是新票（不换 = 下一发 401，屏上会突然全是 0 或直接跳回登录屏）', s.stored === 'NEWTOKEN-abcdef', { stored: s.stored });
  ck('⑧ 第三屏没有输入框、没倒计时，只留一句「知道了」', s.fields.length === 0 && s.ghost === null && !!s.btn && s.btn.text === '知道了', { fields: s.fields.length, ghost: s.ghost, btn: s.btn });
  await shot('05-绑好之后那一屏');
  await ev(`(() => { Api.bindEmail = window.__真Api绑定; return true })()`);
  ck('⑧ 这一组全程零未捕获异常', cdp.exceptions.length === 0, cdp.exceptions.slice(0, 2).join(' | ').slice(0, 200));

  if (UI_ONLY) {
    // 「只量屏、一个号都没造」这句话不能是我说的，得有牙：① 那一趟页面自己打了 `/v1/auth/guest`，
    // 库里就真多一行（Chrome 每趟换 `--user-data-dir` ⇒ deviceId 每趟是新的，不会复用上一趟的号）。
    // 所以这一档收尾也走一遍应用自己的销号口，再复量两格总数。
    // 如果 ① 没拿到票（后端限流 ⇒ 页面退回纯本地游客），那一趟本来就没建号，下面两条照样成立。
    if (booted.token) {
      const del = await apiCall('POST', '/api/user/deactivate', { confirm: true }, booted.token);
      ck('收尾（UI_ONLY 档）① 页面自开的那枚游客号已按应用自己的口销掉', del.status === 200, { 状态: del.status });
    } else {
      ck('收尾（UI_ONLY 档）① 没拿到票 ⇒ 这一趟页面退回纯本地游客，压根没建号', true, { 票: '无' });
    }
    const backUI = baseline();
    ck('收尾（UI_ONLY 档）库里 accounts／users 两格回到动手前（一个号都没留，是量出来的）',
      backUI.accounts === base.accounts && backUI.users === base.users, { 动手前: base, 收尾: backUI });
    return report();
  }

  // ── ⑨～⑯ 端到端：真走现网那四扇门，码从服务器 Redis 现读，不靠任何人收信
  console.log('\n--- 端到端（现网真后端＋服务器 Redis 现读那枚码）---');
  console.log(`  · 端到端用的那枚号：动手前基线 accounts=${base.accounts} users=${base.users} provider=email ${base.email} 行`);

  await goto(H5_URL);                        // 换回真货：上一档的桩随页面重载没了
  const real = JSON.parse(await ev(`JSON.stringify({ token: App.globalData.token || '', uid: String(App.globalData.userId || '') })`));
  victim = { token: real.token, uid: real.uid };
  ck('⑨ 页面自己那一路拿到游客票（不是我在外面拿 curl 造的）', !!real.token && !!real.uid, { uid: real.uid, 票长: (real.token || '').length });

  await ev(`Login.show('bind')`); await sleep(300);
  await fill('lg-mail', ADDR);
  await clickAct('submit'); await sleep(2500);
  s = await screen();
  ck('⑩ 真发码：屏上切到第二屏（服务端回体恒 {}，屏上这一格就是唯一看得见的证据）', s.sub === '填 6 位验证码', { sub: s.sub, err: s.err });
  const code1 = redisGet('get', ADDR);
  const ttl1 = Number(redisGet('ttl', ADDR));
  ck('⑪ 服务器 Redis 里真长出那枚 6 位码', /^\d{6}$/.test(code1), { 长: code1.length });
  ck('⑪ TTL 在 300 以内 ⇒ 屏上那句「5 分钟内有效」不是编的', ttl1 > 0 && ttl1 <= 300, { ttl: ttl1 });

  const wrong = String((Number(code1) + 1) % 1000000).padStart(6, '0');
  await fill('lg-code6', wrong);
  await clickAct('submit'); await sleep(2500);
  s = await screen();
  const ttlWrong = Number(redisGet('ttl', ADDR));
  ck('⑫ 故意填错：屏上念的是服务端那句「验证码错误或已过期」', /验证码错误或已过期/.test(s.err), s.err);
  ck('⑫ 填错也把这枚码销毁了（键没了 ⇒ 猜第二次也没有目标）', ttlWrong === -2, { ttl: ttlWrong });
  ck('⑫ 绑定没成 ⇒ 票没换（手里还是第⑨组那把）', s.token === real.token, { 换没换: s.token !== real.token });
  ck('⑫ 填错还留在第二屏、没假装成功', s.sub === '填 6 位验证码', s.sub);

  // 重发这一发必须等冷却真过完：服务端那格键是 60 秒，没到点就点是白点（`check_cooldown>0` 直接
  // 回 `{}`，既不存新码也不发信），而上一枚刚在第⑫组被销毁 ⇒ 这时候去读 Redis 只会读到空。
  // 所以这里等到屏上那枚按钮自己解锁为止，等的过程本身就是"倒计时不是画上去的"那一格的证据。
  let unlocked = false;
  for (let i = 0; i < 100; i++) {
    s = await screen();
    if (s.ghost && s.ghost.text === '重新发送' && s.ghost.disabled === false) { unlocked = true; break; }
    await sleep(1000);
  }
  ck('⑬ 60 秒走完：那枚按钮自己解锁、文案回到「重新发送」（等到这里花了多少秒就是冷却多久）', unlocked, s.ghost);
  await clickAct('resend'); await sleep(2500);
  const code2 = redisGet('get', ADDR);
  ck('⑬ 「重新发送」真换了一枚新码（不是把刚销毁那枚又读出来）', /^\d{6}$/.test(code2) && code2 !== code1, { 第一枚长: code1.length, 第二枚长: code2.length });
  s = await screen();
  ck('⑬ 重发之后倒计时又开了一轮、按钮又锁上', !!s.ghost && s.ghost.disabled === true && /^重新发送（5[5-9] 秒）$/.test(s.ghost.text), s.ghost);

  await fill('lg-code6', code2);
  await clickAct('submit'); await sleep(3000);
  s = await screen();
  await shot('06-真端到端绑好之后');
  ck('⑭ 填对：屏上念「已绑定」', s.sub === '已绑定', { sub: s.sub, err: s.err });
  ck('⑭ 第一次绑 ⇒ 没并账，"并到了一起"那一句不该出现', !/并到了一起/.test(s.note.join('')), s.note);
  ck('⑭ 票当场换了（回体那把与第⑨组那把不同）', !!s.token && s.token !== real.token, { 两把不同: s.token !== real.token });
  // 只报"两把一样长且逐字相等"这一件事，不报票的任何一段：那一串是本机内存里的凭据形状，
  // 就算这一趟收尾把号销了，读数文件还要留档、留档就要进仓——半串也是串。
  ck('⑭ 本机也存了这把新票（下一次开机不该拿那把已过代的）', s.stored === s.token && !!s.token, { 长度: s.stored.length });
  const prov = JSON.parse(await ev(`JSON.stringify(App.globalData.accountProviders || [])`));
  ck('⑭ providers 里真读回 email ⇒ 账号那一行从此念「已绑定」', prov.includes('email'), prov);
  victim = { token: s.token, uid: real.uid };   // 销号要用这把新票

  const after = baseline();
  ck('⑮ 库里真长出一行 provider=email（真人第一次绑的就是这一发）', after.email === base.email + 1, { 动手前: base.email, 现在: after.email });

  const del = await apiCall('POST', '/api/user/deactivate', { confirm: true }, victim.token);
  ck('收尾 销号 200', del.status === 200, { 状态: del.status, 回体: JSON.stringify(del.body).slice(0, 200) });
  const dead = await apiCall('GET', '/api/user/profile', undefined, victim.token);
  ck('收尾 旧票立刻 401', dead.status === 401, dead.status);
  const back = baseline();
  ck('收尾 库里三格回到动手前（accounts／users／provider=email 逐格相等）',
    back.accounts === base.accounts && back.users === base.users && back.email === base.email, { 动手前: base, 收尾: back });
  // 残留分两档判，理由不同：
  // · `email:code:<地址>` 那一档必须当场就没（填对那一发把它吃掉了）——留着＝别人拿同一枚码还能再试。
  // · `email:cool:<地址>` 是服务端那 60 秒冷却，绑定成功**不主动删**（删了就等于对外说"这枚地址刚绑成"，
  //   这扇门就成了枚举器），所以要等它自己过期。这一等本身就是"冷却写的是 60 秒不是别的数"的证据。
  // ⚠ 只数我这枚地址名下的键，不数全库 `email:*`：本线这段是往现网真库里跑，别人同一分钟绑一枚邮箱
  //   是合法存在的事，把"全库零枚"当判据会红得不讲道理（11-16 第一趟那枚红的成因）。
  const 码键 = Number(redisGet('ttl', ADDR));
  ck('收尾 我那枚地址的验证码键当场已无（ttl=-2）', 码键 === -2, { ttl: 码键 });
  let 冷却等了 = -1;
  for (let i = 0; i < 75; i++) {
    if (Number(redisCool('ttl', ADDR)) === -2) { 冷却等了 = i; break; }
    await sleep(1000);
  }
  const 我的键 = redisCmd(`redis-cli --scan --pattern 'email:*${ADDR}' | wc -l`, ADDR);
  ck('收尾 冷却键自己过期（等了多少秒就是它的寿命）', 冷却等了 >= 0, { 等了秒: 冷却等了 });
  ck('收尾 Redis 里我这名下 email:* 零残留', Number(我的键) === 0, { 条数: 我的键 });
  console.log(`  · 全库 email:* 此刻 ${redisCmd(`redis-cli --scan --pattern 'email:*' | wc -l`)} 条（含同一分钟里别人的，不作为判据）`);
  return report();
}

function report() {
  console.log(`\n=== ${ok.length} 过 / ${bad.length} 红 ===`);
  writeFileSync(READOUT, [
    `页面：${H5_URL}`, `后端：${API}`, `视口：${W}×${H} @2x`,
    `档：${UI_ONLY ? 'UI_ONLY（只量屏与两道闸：一封信都没发；① 页面自开的那枚游客号收尾已按应用自己的口销掉）' : '全量（屏＋端到端，真发两封信到不存在的域，那枚号与那行绑定收尾删净）'}`, '',
    ...ok, ...bad, '', `${ok.length} 过 / ${bad.length} 红`,
  ].join('\n'));
  return bad.length ? 1 : 0;
}

main().then((c) => process.exit(c)).catch(async (e) => {
  console.error('崩了：', e && e.stack || e);
  if (victim && victim.token) {
    console.log('崩在半路 ⇒ 补一次销号');
    const d = await apiCall('POST', '/api/user/deactivate', { confirm: true }, victim.token);
    console.log('  补删状态', d.status);
  } else {
    console.log('⚠ 崩在半路且没有可删的号——端到端那一档如果已经建了号，得手动清');
  }
  try { if (cdp) cdp.ws.close(); } catch { }
  try { if (chrome) chrome.kill(); } catch { }
  try { if (server) server.close(); } catch { }
  process.exit(2);
});
