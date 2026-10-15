/* 可行性试跑：把小程序那份绘制代码原样搬进浏览器，看它能不能在后台页里出图。
 *
 * 为什么要试这一条：`docs/方案-cn后台资产管理.md` §六 第 7 条把"后台出成品海报预览"
 * 列进负面清单，给的理由是**服务端没有 canvas**。但后台那一页本身是浏览器——它有 canvas，
 * 而 `miniprogram/utils/poster.js` 是纯 JS。这条要是跑得通，预览就不是"另外画一份"
 * （那才是第 7 条要防的），也不用上传一张会过期的缩略图。
 *
 * 这一把不改动任何一个源文件：用浏览器里的 CommonJS 装载器把 `poster.js` 那一族按磁盘上
 * 那一份读进来，喂 `SAMPLE_NOTE`，画到 canvas 上，存 PNG。
 * 跑不通就退回方案里那条已拍的甲：上传"后台自己看的"预览缩略图。
 *
 * 跑法（第二关要一份现网配方回体，先拿一次；不拿就只跑第一关）：
 *   ssh agentsbin "cd /home/ubuntu/wtsj-backend && grep '^ADMIN_TOKEN=' .env | cut -d= -f2-" \
 *     | node docs/工具/现网-取模板配方.js > /tmp/poster-recipes.json
 *   node docs/工具/试-后台预览跑客户端解释器.mjs
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

const UTILS = resolve('miniprogram/utils');
const OUT = resolve('docs/design/后台预览-试跑-20261016');
const RECIPES = '/tmp/poster-recipes.json';
const HTTP_PORT = 8266;
const CDP_PORT = 9361;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bad = [];
const ck = (name, cond, got) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${got ? `　→ ${got}` : ''}`);
  if (!cond) bad.push(name);
};

/* 依赖闭包从 `poster.js` 顺着 `require('…')` 一路走，只收 `miniprogram/utils` 这一层里的
 * 直接单层引用（这个名字形状里塞不进路径，也就走不出那个目录）。手写名单会漏——
 * 第一版就漏了 mpAssets → api.js 那一层。 */
const NAME = /^[A-Za-z][A-Za-z0-9_]*\.js$/;
function closureOf(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const n = queue.shift();
    if (seen.has(n) || !NAME.test(n) || !existsSync(join(UTILS, n))) continue;
    seen.add(n);
    const src = readFileSync(join(UTILS, n), 'utf8');
    for (const m of src.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      queue.push(m[1].replace(/^\.\//, ''));
    }
  }
  return [...seen].sort();
}
const FILES = closureOf('poster.js');

const PAGE = `<!doctype html><meta charset="utf-8">
<canvas id="c"></canvas>
<script>
// 小程序那一套 wx.* 在这一页里不需要真能力：预览不读用户文件、不存东西、不认得登录。
// 给的是"被调用就明确失败"的假 wx，好让任何一处真的走错了路立刻炸出来，
// 而不是静默画出一张不像的东西。
globalThis.__wx = {
  env: { USER_DATA_PATH: '/preview-has-no-sandbox' },
  getStorageSync: function () { return ''; }, setStorageSync: function () {},
  getFileSystemManager: function () { return {
    accessSync: function () { throw new Error('预览不该读本机文件'); },
    copyFile: function () { throw new Error('预览不该读本机文件'); },
    unlinkSync: function () {},
  }; },
};
var SRC = {};
// CommonJS 的 require 是同步的。装载器要是 async，require 就返回一个 Promise，
// 而解构一个 Promise 不报错、只是每个名字都成 undefined——poster.js 会跑到第 800 行
// 才报 "toneFor is not a function"，看着像源文件的毛病。所以先把源码全部取完，再同步执行。
window.__preload = async function (names) {
  for (var i = 0; i < names.length; i++) SRC[names[i]] = await (await fetch('/' + names[i])).text();
  return Object.keys(SRC).map(function (k) { return k + ':' + SRC[k].length; });
};
var cache = {};
function req(p) {
  var key = p.replace(/^\\.\\//, '');
  if (cache[key]) return cache[key].exports;
  if (!(key in SRC)) throw new Error('装载器没预取这个文件：' + key);
  var m = { exports: {} };
  cache[key] = m;
  // 传进 new Function 的那段源码只来自上面那个白名单目录里的本仓库文件，
  // 与 <script src> 同一信任级；这里没有任何外部值拼进源码。
  new Function('module', 'exports', 'require', 'wx', SRC[key])(m, m.exports, req, globalThis.__wx);
  return m.exports;
}
var PROFILE = { name: '阿飞', slogan: '每天读一点', avatarPath: '', template: 'quote' };
var canvas = document.getElementById('c');
var ctx = canvas.getContext('2d');

function drawOne(poster, note, id, lang, strict) {
  var plan = poster.planPoster(ctx, note, id, PROFILE, lang, strict ? { showQr: true, strict: true } : { showQr: true });
  canvas.width = plan.width; canvas.height = plan.height;
  poster.paintLayers(ctx, plan.layers, {});
  return { id: id, w: plan.width, h: plan.height, layers: plan.layers.length,
    png: canvas.toDataURL('image/png').split(',')[1] };
}

window.__smoke = function () {
  var poster = req('./poster.js');
  var pal = req('./palette.js');
  var o = drawOne(poster, poster.SAMPLE_NOTE, 'card', 'zh', false);
  o.ids = (poster.TEMPLATES || []).map(function (t) { return t.id; });
  o.tone = typeof pal.toneFor;
  return o;
};

window.__all = function () {
  var poster = req('./poster.js');
  var rows = [];
  poster.TEMPLATES.forEach(function (t) {
    [['zh', poster.SAMPLE_NOTE], ['en', poster.SAMPLE_NOTE_EN]].forEach(function (pair) {
      try {
        var o = drawOne(poster, pair[1], t.id, pair[0], false);
        o.tag = pair[0]; o.label = t.label; rows.push(o);
      } catch (e) { rows.push({ id: t.id, tag: pair[0], err: String((e && e.message) || e) }); }
    });
  });
  return JSON.stringify(rows);
};

// 第二关：走"下发配方"那一路——后台读到的就是这一份 JSON，不是包内那份 JS planner。
window.__recipes = function (rowsJson) {
  var poster = req('./poster.js');
  var rows = JSON.parse(rowsJson);
  poster.applyRemoteTemplates(rows);
  var out = [];
  rows.forEach(function (r) {
    try {
      var o = drawOne(poster, poster.SAMPLE_NOTE, r.template_id, 'zh', true);
      o.label = r.label; out.push(o);
    } catch (e) { out.push({ id: r.template_id, err: String((e && e.message) || e) }); }
  });
  return JSON.stringify(out);
};
</script>`;

function mimeOf(n) { return extname(n) === '.js' ? 'text/javascript; charset=utf-8' : 'text/plain'; }
const server = createServer((rq, res) => {
  const name = decodeURIComponent((rq.url || '').split('?')[0]).replace(/^\/+/, '');
  if (name === '') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); return; }
  if (!FILES.includes(name)) { res.writeHead(404).end('no'); return; }
  res.writeHead(200, { 'content-type': mimeOf(name), 'cache-control': 'no-store' });
  res.end(readFileSync(join(UTILS, name)));
});
await new Promise((r) => server.listen(HTTP_PORT, '127.0.0.1', r));

let chrome = null;
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

try {
  mkdirSync(OUT, { recursive: true });
  const profile = mkdtempSync('/tmp/prev-proto-');
  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
     '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { await j('/json/version'); break; } catch { await sleep(250); } if (i === 39) throw new Error('headless Chrome 没起来'); }
  const tab = await j('/json/new?url=about:blank', { method: 'PUT' });
  const cdp = connect(tab.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/` });
  await sleep(800);
  const ev = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面里那段求值抛了：' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
  };

  const srcs = await ev(`window.__preload(${JSON.stringify(FILES)})`);
  ck(`依赖闭包 ${FILES.length} 个文件按磁盘上那一份取进来了`, srcs.length === FILES.length, srcs.join(' '));

  const smoke = await ev(`window.__smoke()`);
  ck('palette.js 的导出不丢（require 必须同步这一条成立）', smoke.tone === 'function', `typeof toneFor = ${smoke.tone}`);
  ck('poster.js 在浏览器里跑得起来、模板表读得到', smoke.ids && smoke.ids.length >= 10, smoke.ids.join(','));
  ck('包内那套先出一张（图层不是 0）', smoke.layers > 3, `card ${smoke.w}×${smoke.h}／${smoke.layers} 层`);
  writeFileSync(`${OUT}/浏览器出图-${smoke.id}-zh.png`, Buffer.from(smoke.png, 'base64'));

  const rows = JSON.parse(await ev(`window.__all()`));
  const drawn = rows.filter((r) => !r.err);
  ck(`${rows.length / 2} 套 × 中英小样在浏览器里各出一张`, drawn.length === rows.length,
    rows.filter((r) => r.err).map((r) => `${r.id}/${r.tag}:${r.err}`).join(' | ').slice(0, 400));
  for (const r of drawn) writeFileSync(`${OUT}/浏览器出图-${r.id}-${r.tag}.png`, Buffer.from(r.png, 'base64'));

  let n2 = 0;
  if (existsSync(RECIPES)) {
    const recipeRows = JSON.parse(readFileSync(RECIPES, 'utf8'));
    const out2 = JSON.parse(await ev(`window.__recipes(${JSON.stringify(JSON.stringify(recipeRows))})`));
    const ok2 = out2.filter((r) => !r.err);
    ck(`现网 ${recipeRows.length} 行配方在浏览器里各出一张（走 strict 那一档）`, ok2.length === recipeRows.length,
      out2.filter((r) => r.err).map((r) => `${r.id}:${r.err}`).join(' | ').slice(0, 400));
    for (const r of ok2) writeFileSync(`${OUT}/现网配方出图-${r.id}.png`, Buffer.from(r.png, 'base64'));
    n2 = ok2.length;
  } else {
    console.log(`  · 跳过现网配方那一关：没有 ${RECIPES}`);
  }
  ck('全程不抛异常', cdp.exceptions.length === 0, cdp.exceptions.join(' | ').slice(0, 300));
  console.log(`  · 出图目录 ${OUT}（${drawn.length + n2} 张）`);
} finally {
  if (chrome) chrome.kill();
  server.close();
}
console.log(bad.length ? `\nFAIL ${bad.length} 处：${bad.join('、')}` : '\nPASS 浏览器里跑客户端那份解释器这条路成立');
process.exit(bad.length ? 1 : 0);
