/* H5 三枚粘贴钮 + 安卓壳剪贴板桥（11-17 甲）：本地 http 起页面，真点，不打任何业务后端口。
 *
 * 为什么必须有这一把：这次改动把三枚粘贴钮改成「先问原生桥、没桥退回浏览器老路」，
 * 桥的行为（回图／回链接／回文字／回空／拒绝）在浏览器里根本不存在，只有打桩才量得到；
 * 而「没桥时老路不变」这一条是老 v1.3 包用户不回归的保证，也要真点一遍。
 * 量八幕：
 *   A 桥回图       → 照片档真长出一枚缩略图（base64 → File → _addImages 整条通）
 *   B 桥回链接文字 → 跳链接档、输入框真填上
 *   C 桥回普通文字 → 跳文字档、文本域真填上
 *   D 桥回空       → 提示「剪贴板里没有能贴的内容」
 *   E 桥拒绝       → 提示「读不到剪贴板，麻烦长按输入框再粘」
 *   F 链接档那枚   → readText 填进链接框
 *   G 文字档那枚   → readText 填进正文域
 *   H 拆桥         → 退回浏览器老路（_pickImage 真被调到），什么都没贴、页面不炸
 * 桥是打桩的：window.Capacitor.Plugins.ClipboardBridge 由尺子注入，每幕现改行为；
 * 页面本身的游客登录照常打现网（跟邮箱那把尺子同一姿势），但粘贴全程零业务请求。
 *
 * 跑法：node docs/工具/验-H5粘贴三枚-真跑.mjs   （在 TuMaiBiJi 目录下跑，取证落在 docs/取证/）
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import http from 'node:http';

const H5_DIR = process.env.H5_DIR || '/Users/zlfmac/Documents/TuMaiBiJi-H5';
const OUT = resolve('docs/取证/1117-安卓壳剪贴板/屏照');
const READOUT = resolve('docs/取证/1117-安卓壳剪贴板/读数.txt');
const PORT = 8125;
const CDP_PORT = 9353;
const PAGE_URL = `http://127.0.0.1:${PORT}/index.html#/create`;
const W = 390, H = 844;

// 1×1 红色 PNG，当桥递上来的"剪贴板图"。
const PNG1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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

function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
  return http.createServer(async (req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (p.startsWith('/_bak') || p.startsWith('/capacitor') || p.includes('.bak')) { res.writeHead(404); return res.end('no'); }
    const f = resolve(H5_DIR, '.' + (p === '/' ? '/index.html' : p));
    if (!f.startsWith(H5_DIR) || !existsSync(f)) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'content-type': types[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(f));
  });
}

let chrome = null, server = null, cdp = null;

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log(`=== H5 粘贴三枚 × 剪贴板桥 真跑　页面：${PAGE_URL}（业务后端零请求） ===\n`);

  server = serve();
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/h5-paste-chrome-${Date.now()}`,
      '--no-first-run', '--disable-gpu', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
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
    return r.result?.value;
  };
  const shot = async (name) => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(OUT, name), Buffer.from(r.data, 'base64'));
  };
  const click = async (sel) => {
    const hit = await ev(`(function(){var el=document.querySelector(${JSON.stringify(sel)});if(!el)return '没找到';el.click();return '点了'})()`);
    if (hit !== '点了') throw new Error(`点不到 ${sel}：${hit}`);
    await sleep(350);
  };

  await cdp.send('Page.navigate', { url: PAGE_URL });
  for (let i = 0; i < 80; i++) {
    const ready = await ev(`document.readyState === 'complete' && !!document.getElementById('cp-plus') && !!window.Router && !!Router.pages && !!Router.pages.create`);
    if (ready) break;
    await sleep(250);
    if (i === 79) throw new Error('页面没起来（cp-plus / Router.pages.create 都没等到）');
  }
  await sleep(600); // 等首屏 渲染与游客登录安定
  ck('首屏起来了（➕ 在屏上、游客登录走完）', await ev(`!!document.getElementById('cp-plus') && !!App.globalData.token`) === true);

  // 打桩：桥装进 window.Capacitor，行为每幕现改。
  await ev(`(function(){
    window.__clip = {};
    window.Capacitor = { Plugins: { ClipboardBridge: {
      readImage: function () {
        if (window.__clip.rejectImage) return Promise.reject(new Error('stub 拒绝读图'));
        if (window.__clip.image) return Promise.resolve({ base64: window.__clip.image, mime: 'image/png' });
        return Promise.resolve({ text: window.__clip.text || '' });
      },
      readText: function () { return Promise.resolve({ text: window.__clip.text || '' }); },
    } } };
    return '桥已装';
  })()`);
  ck('剪贴板桥（打桩）已装进页面', await ev(`!!(window.Capacitor && window.Capacitor.Plugins.ClipboardBridge)`) === true);

  // ── A：桥回图 → 照片档长出缩略图 ──
  await ev(`window.__clip = { image: ${JSON.stringify(PNG1)} }`);
  await click('#cp-plus');
  ck('A0 点 ➕ 进照片档', await ev(`Router.pages.create._active`) === 'photo');
  await click('#cp-paste-img');
  await sleep(450);
  const thCount = await ev(`document.querySelectorAll('.mp-create .th-x').length`);
  ck('A1 桥回图：照片档真长出一枚缩略图（_preview=1、.th-x=1）',
    (await ev(`Router.pages.create._preview.length`) === 1) && thCount === 1, `preview=${await ev(`Router.pages.create._preview.length`)} th=${thCount}`);
  await shot('A-桥回图-缩略图.png');

  // 清场：点掉那枚缩略图再进下一幕。
  await click('.mp-create .th-x');
  ck('A2 清场：缩略图点掉归零', await ev(`Router.pages.create._preview.length`) === 0);

  // ── B：桥回链接文字 → 跳链接档 ──
  await ev(`window.__clip = { text: 'https://mp.weixin.qq.com/s/abc123' }`);
  await click('#cp-paste-img');
  const urlIn = await ev(`(function(){var i=document.getElementById('cp-url');return i ? i.value : ''})()`);
  ck('B1 桥回链接：跳到链接档且框里真填上',
    await ev(`Router.pages.create._active`) === 'url' &&
    await ev(`Router.pages.create._url`) === 'https://mp.weixin.qq.com/s/abc123' &&
    urlIn === 'https://mp.weixin.qq.com/s/abc123',
    `active=${await ev(`Router.pages.create._active`)} url=${urlIn}`);
  await shot('B-桥回链接-跳链接档.png');

  // ── C：桥回普通文字 → 跳文字档 ──
  await click('.md[data-tab="photo"]');
  await ev(`window.__clip = { text: '今天在公众号看到一段很值得记下来的话。' }`);
  await click('#cp-paste-img');
  const wArea = await ev(`(function(){var a=document.getElementById('cp-write');return a ? a.value : ''})()`);
  ck('C1 桥回文字：跳到文字档且域里真填上',
    await ev(`Router.pages.create._active`) === 'write' &&
    await ev(`Router.pages.create._writeText`) === '今天在公众号看到一段很值得记下来的话。' &&
    wArea === '今天在公众号看到一段很值得记下来的话。',
    `active=${await ev(`Router.pages.create._active`)} write=${wArea}`);
  await shot('C-桥回文字-跳文字档.png');

  // ── D：桥回空 → 说话 ──
  await click('.md[data-tab="photo"]');
  await ev(`window.__clip = { text: '' }`);
  await click('#cp-paste-img');
  const hintD = await ev(`(function(){var b=document.querySelector('.mp-create .panel .hint-bubble');return b ? b.textContent : ''})()`);
  ck('D 桥回空：提示「剪贴板里没有能贴的内容」', hintD === '剪贴板里没有能贴的内容', hintD);
  await shot('D-桥回空-提示.png');

  // ── E：桥拒绝 → 说话 ──
  await ev(`window.__clip = { rejectImage: true }`);
  await click('#cp-paste-img');
  const hintE = await ev(`(function(){var b=document.querySelector('.mp-create .panel .hint-bubble');return b ? b.textContent : ''})()`);
  ck('E 桥拒绝：提示「读不到剪贴板，麻烦长按输入框再粘」', hintE === '读不到剪贴板，麻烦长按输入框再粘', hintE);

  // ── F：链接档那枚粘贴 → readText 填链接框 ──
  await click('.md[data-tab="url"]');
  await ev(`window.__clip = { text: 'https://sspai.com/post/70483962' }`);
  await click('.field:not(.field-write) .field-paste');
  const urlF = await ev(`(function(){var i=document.getElementById('cp-url');return i ? i.value : ''})()`);
  ck('F 链接档粘贴钮：readText 真填进链接框',
    await ev(`Router.pages.create._url`) === 'https://sspai.com/post/70483962' && urlF === 'https://sspai.com/post/70483962', urlF);

  // ── G：文字档那枚粘贴 → readText 填正文域 ──
  await click('.md[data-tab="write"]');
  await ev(`window.__clip = { text: '从别处复制来的一段正文，准备直接提炼。' }`);
  await click('.field-write .field-paste');
  const wG = await ev(`(function(){var a=document.getElementById('cp-write');return a ? a.value : ''})()`);
  ck('G 文字档粘贴钮：readText 真填进正文域',
    await ev(`Router.pages.create._writeText`) === '从别处复制来的一段正文，准备直接提炼。' && wG === '从别处复制来的一段正文，准备直接提炼。', wG);
  await shot('G-文字档粘贴-填正文.png');

  // ── H：拆桥 → 退回浏览器老路 ──
  await ev(`(function(){
    var p = Router.pages.create, o = p._pickImage;
    window.__pick = 0;
    p._pickImage = function () { window.__pick++; return o.apply(this, arguments); };
    delete window.Capacitor;
    return '桥已拆';
  })()`);
  await click('.md[data-tab="photo"]');
  await click('#cp-paste-img');
  await sleep(500);
  ck('H 拆桥：退回浏览器老路（_pickImage 被调到、什么都没贴、页面活着）',
    (await ev(`window.__pick`) === 1) &&
    (await ev(`Router.pages.create._preview.length`) === 0) &&
    (await ev(`!!document.querySelector('.mp-create .panel') && !!document.getElementById('cp-paste-img')`) === true),
    `pick=${await ev(`window.__pick`)} preview=${await ev(`Router.pages.create._preview.length`)}`);

  // ── 全程零 JS 异常 ──
  ck('全程零 JS 异常（exceptionThrown=0）', cdp.exceptions.length === 0, cdp.exceptions.join(' | ') || '0');
  ck('全程零 console.error（consoleErrs=0）', cdp.consoleErrs.length === 0, cdp.consoleErrs.join(' | ') || '0');

  console.log('');
  const head = `=== 读数：${ok.length} 过 / ${bad.length} 红　${new Date().toLocaleString('zh-CN')}　页面 ${PAGE_URL} ===\n`;
  writeFileSync(READOUT, head + ok.concat(bad).join('\n') + '\n');
  console.log(`取证：${READOUT}`);
  console.log(bad.length ? `\n有红，别上屏。` : `\n八幕全过，桥这条链是真的。`);
  if (bad.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error('尺子自己崩了：', e?.message || e);
  process.exitCode = 2;
}).finally(() => {
  try { if (cdp) cdp.ws.close(); } catch { }
  try { if (chrome) chrome.kill(); } catch { }
  try { if (server) server.close(); } catch { }
});
