/* 「我的 → 设置」那一栏：H5 侧截图＋逐行取数，与小程序侧那份 JSON 逐块对照。
 *
 * 口径（与 对照-设置栏小程序侧.js 同一套）：
 *   · 小程序吃 rpx、H5 吃 px（375 基线，1px = 2rpx）。两边一律换算成 rpx 再比，
 *     不拿 px 直接减——窗宽不是 375 时直接减就是假红。
 *   · 视口照小程序那份 JSON 里现读的 windowWidth/Height/pixelRatio 设，两张截图才同尺寸。
 *   · 共有四行（卡片市场／私密密码／我的邮箱／注销账号）逐块相等；H5 多出来的「账号」那一行
 *     是本轮新增（小程序走微信登录、没有也不该有），只许沿用同一套令牌，所以拿它跟那四行比。
 *
 * 跑法：先跑小程序侧那把，再 node docs/工具/对照-设置栏H5侧.mjs
 * 产出：docs/取证/1113-口令登录/对照/H5-设置栏.png ＋ .json ＋ 设置栏对照-读数.txt
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import http from 'node:http';

const H5_DIR = '/Users/zlfmac/Documents/TuMaiBiJi-H5';
const OUT = resolve('docs/取证/1113-口令登录/对照');
const MP_JSON = resolve(OUT, '小程序-设置栏.json');
const PORT = 8124, CDP_PORT = 9352;
const API_NOTE = '后端打的是现网真后端（这一把只读，不造号、不写库）';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = [], bad = [];
const ck = (name, cond, got) => {
  const line = `  ${cond ? '✓' : '✗'} ${name}${got !== undefined && got !== '' ? `　→ ${typeof got === 'string' ? got : JSON.stringify(got)}` : ''}`;
  console.log(line);
  (cond ? ok : bad).push(line);
};
const j = async (p, o) => (await fetch(`http://127.0.0.1:${CDP_PORT}${p}`, o)).json();

// rgb/rgba 两边写法可能差空格与尾零，抽数字再格式化，避免"同一个色判成两个"。
const col = (s) => {
  if (!s) return '';
  const n = String(s).match(/-?[\d.]+/g);
  if (!n) return String(s).trim();
  return 'c(' + n.map((x) => Number(Number(x).toFixed(3))).join(',') + ')';
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const exceptions = [], consoleErrs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') exceptions.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrs.push(m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
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

function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
  return http.createServer(async (req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (p.startsWith('/_bak') || p.startsWith('/capacitor')) { res.writeHead(404); return res.end('no'); }
    const f = resolve(H5_DIR, '.' + (p === '/' ? '/index.html' : p));
    if (!f.startsWith(H5_DIR) || !existsSync(f)) { res.writeHead(404); return res.end('no'); }
    const { readFile } = await import('node:fs/promises');
    res.writeHead(200, { 'content-type': types[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(f));
  });
}

let chrome = null, server = null, cdp = null;

async function main() {
  mkdirSync(OUT, { recursive: true });
  // 小程序侧那份读数缺了（IDE 登录态掉、要站长扫码）时，这一把仍跑 H5 自己的判据并出屏照，
  // 跨侧那几组**不判绿也不判红**，明说"没跑"。拿源码猜一份小程序读数来凑对照＝假证据。
  const mp = existsSync(MP_JSON) ? JSON.parse(readFileSync(MP_JSON, 'utf8')) : null;
  const W = mp ? mp.windowWidth : 390, H = mp ? mp.windowHeight : 844, DPR = mp ? (mp.pixelRatio || 2) : 2;
  const toRpx = (px) => (px * 750) / W;
  console.log(`=== 设置栏 H5 侧对照 ===\n视口：${W}×${H} @${DPR}x${mp ? '（照小程序现读）' : '（小程序侧缺读数，先用 390×844）'}\n${API_NOTE}\n`);
  if (!mp) console.log('⏸ 跨侧对照这一趟没跑：缺 小程序-设置栏.json（微信开发者工具要重新登录，只能站长扫码）\n');

  server = serve();
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/h5-setcmp-chrome-${Date.now()}`,
      '--no-first-run', '--disable-gpu', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await j('/json/version'); break; } catch { await sleep(250); } if (i === 59) throw new Error('headless Chrome 没起来'); }
  const tab = await j('/json/new?url=about:blank', { method: 'PUT' });
  cdp = connect(tab.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const ev = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面里那段求值抛了：' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
  };

  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  for (let i = 0; i < 60; i++) {
    const ready = await ev(`!!(window.App && App.globalData && App.globalData.isLoggedIn)`).catch(() => false);
    if (ready) break;
    await sleep(500);
    if (i === 59) throw new Error('H5 没开机（游客号没登上）');
  }
  await ev(`Router.go('me')`);
  // 邮箱／私密密码／会话三发回来都会重渲，等它们落定再量，否则量到的是半张屏。
  await sleep(4000);
  const onTab = await ev(`(() => { const s = document.querySelector('.mp-me .seg.on'); return s ? s.textContent : '' })()`);
  ck('停在设置档', onTab === '设置', onTab);

  const dump = await ev(`(() => {
    const cs = (el, k) => el ? getComputedStyle(el)[k] : '';
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
      return { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) }; };
    const items = [...document.querySelectorAll('.mp-me .menu-item')];
    const group = document.querySelector('.mp-me .menu-group');
    const sheet = document.querySelector('.mp-me .sheet');
    return JSON.stringify({
      rows: items.map((it) => {
        const lab = it.querySelector('.menu-label'), hint = it.querySelector('.menu-hint');
        const val = it.querySelector('.menu-value'), ico = it.querySelector('.ico'), cv = it.querySelector('.ico .cv');
        return {
          label: lab ? lab.textContent.replace(/\\s+/g, '') : '',
          hint: hint ? hint.textContent.replace(/\\s+/g, '') : '',
          value: val ? val.textContent.replace(/\\s+/g, '') : '',
          labelFs: cs(lab, 'fontSize'), labelColor: cs(lab, 'color'), labelWeight: cs(lab, 'fontWeight'),
          labelLs: cs(lab, 'letterSpacing'),
          hintFs: cs(hint, 'fontSize'), hintColor: cs(hint, 'color'), hintMr: cs(hint, 'marginRight'),
          valFs: cs(val, 'fontSize'), valColor: cs(val, 'color'),
          itemBorderBottom: cs(it, 'borderBottomWidth'), itemBorderBottomColor: cs(it, 'borderBottomColor'),
          hasIco: !!ico, icoRect: r(ico), cvRect: r(cv),
          cvBorderRight: cs(cv, 'borderRightWidth'), cvBorderRightColor: cs(cv, 'borderRightColor'),
          rect: r(it), labelRect: r(lab), hintRect: r(hint),
        };
      }),
      group: {
        paddingLeft: cs(group, 'paddingLeft'), paddingTop: cs(group, 'paddingTop'),
        radius: cs(group, 'borderTopLeftRadius'), borderWidth: cs(group, 'borderTopWidth'),
        borderColor: cs(group, 'borderTopColor'), bg: cs(group, 'backgroundColor'),
        shadow: cs(group, 'boxShadow'), marginBottom: cs(group, 'marginBottom'),
        rect: r(group),
      },
      sheetRect: r(sheet),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio,
    });
  })()`).then((s) => JSON.parse(s));

  const rows = dump.rows;
  const labels = rows.map((r) => r.label);
  ck('H5 设置栏五行（账号是本轮新增，其余四行与小程序同名同序）',
    labels.join('|') === '账号|卡片市场|私密密码|我的邮箱|注销账号', labels.join('|'));

  // ---- 共有四行逐块对照 ----
  const h5By = new Map(rows.map((r) => [r.label, r]));
  const diffs = [];
  const cmp = (what, a, b, tol, unit) => {
    const good = typeof a === 'number' ? near(a, b, tol) : a === b;
    if (!good) diffs.push(`${what}: ${a}${unit || ''} ≠ ${b}${unit || ''}`);
    return good;
  };
  if (mp) {
  const shared = ['卡片市场', '私密密码', '我的邮箱', '注销账号'];
  const mpBy = new Map(mp.rows.map((r) => [r.label, r]));
  for (const name of shared) {
    const m = mpBy.get(name), h = h5By.get(name);
    if (!m || !h) { ck(`「${name}」两边都在`, false, `mp=${!!m} h5=${!!h}`); continue; }
    const g = [];
    g.push(cmp(`${name} 行高`, +toRpx(m.rect.height).toFixed(1), +toRpx(h.rect.h).toFixed(1), 1, 'rpx'));
    g.push(cmp(`${name} 名字字号`, +toRpx(parseFloat(m.labelFs)).toFixed(1), +toRpx(parseFloat(h.labelFs)).toFixed(1), 0.6, 'rpx'));
    g.push(cmp(`${name} 名字字色`, col(m.labelColor), col(h.labelColor), 0));
    g.push(cmp(`${name} 名字字重`, String(m.labelWeight), String(h.labelWeight), 0));
    g.push(cmp(`${name} 名字字距`, +toRpx(parseFloat(m.labelLs)).toFixed(2), +toRpx(parseFloat(h.labelLs)).toFixed(2), 0.3, 'rpx'));
    g.push(cmp(`${name} 小字`, m.hint, h.hint, 0));
    if (m.hint || h.hint) {
      g.push(cmp(`${name} 小字字号`, +toRpx(parseFloat(m.hintFs)).toFixed(1), +toRpx(parseFloat(h.hintFs)).toFixed(1), 0.6, 'rpx'));
      g.push(cmp(`${name} 小字字色`, col(m.hintColor), col(h.hintColor), 0));
      g.push(cmp(`${name} 小字右缝`, +toRpx(parseFloat(m.hintMr)).toFixed(1), +toRpx(parseFloat(h.hintMr)).toFixed(1), 0.6, 'rpx'));
    }
    g.push(cmp(`${name} 值字号`, m.value ? +toRpx(parseFloat(m.valFs)).toFixed(1) : null,
      h.value ? +toRpx(parseFloat(h.valFs)).toFixed(1) : null, 0.6, 'rpx'));
    g.push(cmp(`${name} 箭头盒`, +toRpx(m.icoRect.width).toFixed(1), +toRpx(h.icoRect.w).toFixed(1), 1, 'rpx'));
    g.push(cmp(`${name} 箭头那一笔`, +toRpx(m.cvRect.width).toFixed(1), +toRpx(h.cvRect.w).toFixed(1), 1, 'rpx'));
    g.push(cmp(`${name} 箭头笔粗`, +toRpx(parseFloat(m.cvBorderRight)).toFixed(2), +toRpx(parseFloat(h.cvBorderRight)).toFixed(2), 0.6, 'rpx'));
    g.push(cmp(`${name} 箭头笔色`, col(m.cvBorderRightColor), col(h.cvBorderRightColor), 0));
    g.push(cmp(`${name} 分隔线粗`, +toRpx(parseFloat(m.itemBorderBottom)).toFixed(2), +toRpx(parseFloat(h.itemBorderBottom)).toFixed(2), 0.6, 'rpx'));
    g.push(cmp(`${name} 分隔线色`, col(m.itemBorderBottomColor), col(h.itemBorderBottomColor), 0));
    g.push(cmp(`${name} 名字不折行`, m.labelRect.height <= parseFloat(m.labelFs) * 1.8,
      h.labelRect.h <= parseFloat(h.labelFs) * 1.8, 0));
    ck(`「${name}」逐块与小程序相等（${g.length} 项）`, g.every(Boolean), g.every(Boolean) ? '' : diffs.slice(-g.length).join('；'));
  }

  // ---- 面板那一层 ----
  const gm = mp.group, gh = dump.group;
  const gk = [];
  gk.push(cmp('面板左内缩', +toRpx(parseFloat(gm.paddingLeft)).toFixed(1), +toRpx(parseFloat(gh.paddingLeft)).toFixed(1), 1, 'rpx'));
  gk.push(cmp('面板圆角', +toRpx(parseFloat(gm.radius)).toFixed(1), +toRpx(parseFloat(gh.radius)).toFixed(1), 1, 'rpx'));
  gk.push(cmp('面板描边粗', +toRpx(parseFloat(gm.borderWidth)).toFixed(2), +toRpx(parseFloat(gh.borderWidth)).toFixed(2), 0.6, 'rpx'));
  gk.push(cmp('面板描边色', col(gm.borderColor), col(gh.borderColor), 0));
  gk.push(cmp('面板底色', col(gm.bg), col(gh.bg), 0));
  gk.push(cmp('面板投影', gm.shadow, gh.shadow, 0));
  gk.push(cmp('面板下缝', +toRpx(parseFloat(gm.marginBottom)).toFixed(1), +toRpx(parseFloat(gh.marginBottom)).toFixed(1), 1, 'rpx'));
  ck('面板那一层与小程序相等（7 项）', gk.every(Boolean), gk.every(Boolean) ? '' : diffs.slice(-gk.length).join('；'));
  }

  // ---- 新增「账号」那一行只许沿用同一套令牌 ----
  const acct = h5By.get('账号'), ref = h5By.get('卡片市场');
  const ak = [];
  ak.push(cmp('账号行高与其余四行同', +toRpx(ref.rect.h).toFixed(1), +toRpx(acct.rect.h).toFixed(1), 0.6, 'rpx'));
  ak.push(cmp('账号名字字号同', ref.labelFs, acct.labelFs, 0));
  ak.push(cmp('账号名字字色同', col(ref.labelColor), col(acct.labelColor), 0));
  ak.push(cmp('账号名字字重同', ref.labelWeight, acct.labelWeight, 0));
  ak.push(cmp('账号名字字距同', ref.labelLs, acct.labelLs, 0));
  ak.push(cmp('账号小字字号同', ref.hintFs, acct.hintFs, 0));
  ak.push(cmp('账号小字字色同', col(ref.hintColor), col(acct.hintColor), 0));
  ak.push(cmp('账号箭头盒同', +toRpx(ref.icoRect.w).toFixed(1), +toRpx(acct.icoRect.w).toFixed(1), 0.6, 'rpx'));
  ak.push(cmp('账号行左缘与其余行对齐', +ref.rect.x.toFixed(1), +acct.rect.x.toFixed(1), 0.6, 'px'));
  ak.push(cmp('账号行右缘与其余行对齐', +(ref.rect.x + ref.rect.w).toFixed(1), +(acct.rect.x + acct.rect.w).toFixed(1), 0.6, 'px'));
  ck('新增「账号」那一行沿用同一套令牌（10 项）', ak.every(Boolean), ak.every(Boolean) ? '' : diffs.slice(-ak.length).join('；'));
  ck('账号那一行未登录时右边是引导句而不是空白', /登录/.test(acct.hint), acct.hint);

  // ---- 整屏 ----
  ck('没有横向溢出', !dump.overflowX, `scrollW vs innerW ${dump.innerWidth}`);
  const outside = rows.filter((r) => r.rect.x < dump.group.rect.x - 0.6 || r.rect.x + r.rect.w > dump.group.rect.x + dump.group.rect.w + 0.6);
  ck('五行都在面板横向范围内', outside.length === 0, outside.map((r) => r.label).join(','));
  ck('页面零未捕获异常', cdp.exceptions.length === 0, cdp.exceptions.slice(0, 3).join(' | '));
  ck('页面零 console.error', cdp.consoleErrs.length === 0, cdp.consoleErrs.slice(0, 3).join(' | '));

  const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(resolve(OUT, 'H5-设置栏.png'), Buffer.from(s.data, 'base64'));
  writeFileSync(resolve(OUT, 'H5-设置栏.json'), JSON.stringify({ side: 'h5', windowWidth: W, windowHeight: H, pixelRatio: DPR, toRpx: 'px*750/windowWidth', ...dump }, null, 2));

  const mpPng = resolve(OUT, '小程序-设置栏.png'), h5Png = resolve(OUT, 'H5-设置栏.png');
  const sizeOf = (f) => { const b = readFileSync(f); return `${b.readUInt32BE(16)}×${b.readUInt32BE(20)}`; };
  if (mp && existsSync(mpPng)) {
    ck('两张截图同尺寸（能并排给肉眼）', sizeOf(mpPng) === sizeOf(h5Png), `${sizeOf(mpPng)} / ${sizeOf(h5Png)}`);
  } else {
    console.log('⏸ 并排尺寸核对没跑：小程序侧屏照还没有');
  }

  console.log(`\n屏照与读数已落 ${OUT}`);
  return report();
}

function report() {
  const lines = [
    '设置栏对照：小程序 ↔ H5（共有四行逐块 ＋ 面板那一层 ＋ 新增账号行）',
    `生成时刻：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    `口径：一律换算成 rpx 再比；视口照小程序现读窗宽设，两张截图同尺寸`,
    existsSync(MP_JSON) ? '跨侧对照：已跑（小程序侧读数在档）' : '跨侧对照：没跑（缺小程序侧读数，IDE 需站长重新登录）',
    '', ...ok, ...bad, '',
    `=== ${ok.length} 过 / ${bad.length} 红 ===`,
  ];
  writeFileSync(resolve(OUT, '设置栏对照-读数.txt'), lines.join('\n') + '\n');
  console.log(`=== ${ok.length} 过 / ${bad.length} 红 ===`);
  return bad.length ? 1 : 0;
}

main().then(async (c) => {
  try { if (cdp) cdp.ws.close(); } catch { }
  try { if (chrome) chrome.kill(); } catch { }
  try { if (server) server.close(); } catch { }
  process.exit(c);
}).catch(async (e) => {
  console.error('脚本崩：', e && e.stack || e);
  try { if (chrome) chrome.kill(); } catch { }
  try { if (server) server.close(); } catch { }
  process.exit(2);
});