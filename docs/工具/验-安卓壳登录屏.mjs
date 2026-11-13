// 安卓壳（Capacitor WebView）里真跑部署后的登录屏：只量屏，不造号（不耗注册闸）。
// 跑法：node docs/工具/验-安卓壳登录屏.mjs
// 前提：emulator-5554 已起、cn.agentsbin.tumarknote 已装（debug 包才有 devtools socket）。
// 产物：docs/取证/1113-口令登录/屏照-安卓/*.png ＋ 安卓壳-读数.txt
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ADB = '/opt/homebrew/share/android-commandlinetools/platform-tools/adb';
const PKG = 'cn.agentsbin.tumarknote';
const PORT = 9340;
const OUT = resolve('docs/取证/1113-口令登录/屏照-安卓');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (...args) => execFileSync(ADB, args, { encoding: 'utf8' });
const ok = [], bad = [];
const ck = (name, cond, got) => {
  const line = `  ${cond ? '✓' : '✗'} ${name}${got !== undefined && got !== '' ? `　→ ${typeof got === 'string' ? got : JSON.stringify(got)}` : ''}`;
  console.log(line);
  (cond ? ok : bad).push(line);
};

mkdirSync(OUT, { recursive: true });
sh('shell', 'am', 'force-stop', PKG);
sh('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
await sleep(6000);
const unix = sh('shell', 'cat', '/proc/net/unix');
const m = unix.match(/webview_devtools_remote_(\d+)/);
if (!m) { console.log('✗ 没找到 WebView devtools socket（包不是 debug？）'); process.exit(1); }
sh('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${m[1]}`);
console.log('WebView pid', m[1]);

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && /agentsbin\.cn\/app/.test(t.url || ''));
ck('壳里那一页就是现网 /app/', !!page, page && page.url);
if (!page) process.exit(1);

const ws = new WebSocket(`ws://127.0.0.1:${PORT}/devtools/page/${page.id}`);
let id = 0; const pending = new Map(); const errs = [];
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id; pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
ws.onmessage = (ev) => {
  const d = JSON.parse(ev.data);
  if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); }
  if (d.method === 'Runtime.exceptionThrown') errs.push('exception: ' + JSON.stringify(d.params.exceptionDetails?.exception?.description || d.params));
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push('console.error: ' + d.params.args.map((a) => a.value || a.description).join(' '));
};
await new Promise((r) => (ws.onopen = r));
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.reload');
await sleep(6000);

const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('页面求值抛了：' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result ? r.result.value : undefined;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, 'base64'));
  console.log('  · 屏照', name);
};
const screen = () => ev(`(() => {
  const card = document.getElementById('login-card');
  const vis = (el) => !!el && getComputedStyle(el).display !== 'none';
  return JSON.stringify({
    loginVisible: vis(document.getElementById('login-screen')),
    appVisible: vis(document.getElementById('app')),
    sub: card ? (card.querySelector('.login-sub') || {}).textContent || '' : '',
    note: card ? [...card.querySelectorAll('.login-note')].map(n => n.textContent) : [],
    fields: card ? [...card.querySelectorAll('input')].map(i => i.id) : [],
    links: card ? [...card.querySelectorAll('.login-link')].map(a => a.textContent) : [],
    guest: card ? [...card.querySelectorAll('.login-back')].map(x => x.textContent) : [],
    rows: [...document.querySelectorAll('#page-root .menu-item')].map(x => x.textContent.trim()),
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    ua: navigator.userAgent
  });
})()`).then((s) => JSON.parse(s));

let s = await screen();
ck('安卓壳开机进应用或登录屏（不白屏）', s.appVisible || s.loginVisible, { app: s.appVisible, login: s.loginVisible });
ck('WebView UA 带 Android/wv', /Android/.test(s.ua) && /wv|Version\/4/.test(s.ua), s.ua.slice(0, 90));
await shot('01-开机');

await ev(`Router.go('me')`); await sleep(900);
await ev(`(() => { const t = [...document.querySelectorAll('#page-root [data-tab]')].find(x => /设置/.test(x.textContent)); if (t) t.click() })()`);
await sleep(1400);
s = await screen();
ck('设置栏第一行＝账号', s.rows[0] && s.rows[0].startsWith('账号'), s.rows);
await shot('02-设置栏');

await ev(`(() => { const r = [...document.querySelectorAll('#page-root .menu-item')].find(x => /账号/.test(x.textContent)); if (r) r.click() })()`);
await sleep(1200);
s = await screen();
ck('点账号行进登录屏', s.loginVisible && s.sub === '登录', { login: s.loginVisible, sub: s.sub });
ck('登录屏两只框', JSON.stringify(s.fields) === JSON.stringify(['lg-name', 'lg-pass']), s.fields);
ck('登录屏注册/忘记入口＋本机试用退路', s.links.includes('注册新账号') && s.links.includes('忘记密码') && s.guest.some((t) => /本机试用/.test(t)), { links: s.links, guest: s.guest });
ck('登录屏零横向溢出', !s.overflowX);
await shot('03-登录屏');

await ev(`document.querySelector('#login-card [data-act="register"]').click()`); await sleep(700);
s = await screen();
ck('注册屏写明不发验证码', s.note.some((t) => /不会发验证码/.test(t)), s.note);
await shot('04-注册屏');
await ev(`document.querySelector('#login-card [data-act="login"]').click()`); await sleep(500);
await ev(`document.querySelector('#login-card [data-act="recover"]').click()`); await sleep(700);
s = await screen();
ck('找回屏念最近一次那串码', s.note.some((t) => /填最近一次给你那串恢复码/.test(t)), s.note);
await shot('05-找回屏');

const realErrs = errs.filter((e) => !/Failed to load resource|401|404|400/.test(e));
ck('全程零未捕获异常／console.error（4xx 资源噪声除外）', realErrs.length === 0, realErrs.slice(0, 3));

console.log(`\n=== ${ok.length} 过 / ${bad.length} 红 ===`);
writeFileSync(resolve('docs/取证/1113-口令登录/安卓壳-读数.txt'),
  [`页面：https://agentsbin.cn/app/（安卓壳 WebView，pid ${m[1]}）`, `档：安卓壳 UI（不造号）`, '', ...ok, ...bad, '', `${ok.length} 过 / ${bad.length} 红`].join('\n'));
ws.close();
process.exit(bad.length ? 1 : 0);