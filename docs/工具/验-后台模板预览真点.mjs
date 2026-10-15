/* 本机真点：后台「卡片模板」那一栏的预览，在真浏览器里能不能画出来。
 *
 * 静态判据（tests/test_admin_poster_preview.py）能钉住"字节同源、门、那几句话在源码里"，
 * 但钉不住"这一页在浏览器里真跑得起来"——那要装模块、要 canvas、要 measureText，
 * 任何一处对不上，症状都是屏上一格空白加一句引擎没加载成。
 * 所以这一支起一个本机后端（不碰现网），真点登录、真点那一栏、真数像素。
 *
 * 反向对照排在一个坏行后面：库里塞一行"客户端那道闸收不住的配方"，
 * 那一格必须写原因、且不许有 canvas——否则"画不出来"会被读成"这套卡片是白屏"。
 *
 * 跑法（本机，默认）：node docs/工具/验-后台模板预览真点.mjs
 * 跑法（现网，只读）：ssh agentsbin "cd /home/ubuntu/wtsj-backend && grep '^ADMIN_TOKEN=' .env | cut -d= -f2-" \
 *   | PREV_BASE=https://api.agentsbin.cn/wtsj node docs/工具/验-后台模板预览真点.mjs
 * 本机这一把现编一次性口令；现网那一把走 stdin，都不进 argv、不上屏。
 * 反向对照那两行坏配方只塞在本机库里，所以打现网时那两条自动跳过（屏上没有坏行）。
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const ROOT = resolve('.');
const BACKEND = resolve('backend');
const DB = '/tmp/prev-view.db';
const PORT = 8310;
const CDP_PORT = 9362;
const OUT = 'docs/design/后台预览-自证-20261016';
const LIVE = (process.env.PREV_BASE || '').replace(/\/+$/, '');
const PW = LIVE ? (readFileSync(0, 'utf8').split('\n')[0] || '').trim() : 'local-preview-' + randomBytes(16).toString('hex');
const OPS_URL = LIVE ? `${LIVE}/ops` : `http://127.0.0.1:${PORT}/ops`;
const TAG = LIVE ? '现网' : '本机';
const JWT = 'local-preview-jwt-' + randomBytes(18).toString('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = [], bad = [];
const ck = (name, cond, got) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${got ? `　→ ${got}` : ''}`);
  (cond ? ok : bad).push(name);
};
const run = (cmd, args, opts = {}) => spawn(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
const out = (cmd, args, env) => new Promise((res) => {
  const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env } });
  let s = '';
  p.stdout.on('data', (d) => { s += d; });
  p.on('close', () => res(s));
});

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
  if (LIVE) console.log(`>>> 打现网 ${LIVE}（只读：这一支不写任何东西）　口令 ${PW ? '读到' : '没读到'}`);
  if (!LIVE) await sh(`${BACKEND}/.venv/bin/python`, ['tools/dev_seed_fusion_view.py'], ENV, { cwd: BACKEND });
  // 塞两行坏的：一行"那道闸收不住"（分组不在本包认的那两组里），一行"收得进但跑不出图"（步型未知）。
  // 这两条走的是不同分支：前者根本不该画，后者画的时候抛。
  writeFileSync('/tmp/prev-bad.py', [
    'import sys',
    'sys.path.insert(0, ".")',
    'from app.db.database import SessionLocal',
    'from app.models.poster_template import PosterTemplate',
    'db = SessionLocal()',
    'db.add(PosterTemplate(template_id="badGroup", label="坏分组（反向对照）", label_en="Bad group",',
    '  group_key="notARealGroup", sort_order=900, status="draft", min_app_version="1.0.0",',
    '  content_hash="b" * 64, recipe={"id": "badGroup", "min_version": 1, "steps": []}))',
    'db.add(PosterTemplate(template_id="badStep", label="坏步型（反向对照）", label_en="Bad step",',
    '  group_key="classic", sort_order=901, status="draft", min_app_version="1.0.0",',
    '  content_hash="c" * 64, recipe={"id": "badStep", "min_version": 1, "steps": [{"k": "noSuchOp"}]}))',
    'db.commit(); db.close()',
    '',
  ].join('\n'))
  if (!LIVE) await sh(`${BACKEND}/.venv/bin/python`, ['/tmp/prev-bad.py'], ENV, { cwd: BACKEND });

  if (!LIVE) server = spawn(`${BACKEND}/.venv/bin/python`, ['-m', 'uvicorn', 'app.main:app', '--port', String(PORT), '--log-level', 'warning'],
    { cwd: BACKEND, env: { ...process.env, ...ENV }, stdio: 'ignore' });
  let up = !!LIVE;
  for (let i = 0; !LIVE && i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/ops`)).ok) { up = true; break; } } catch { }
    await sleep(250);
  }
  ck(LIVE ? '现网那一页打得开' : `本机后端起来了（:${PORT}/ops）`, up);
  if (!up) throw new Error('后端没起来，后面没法测');

  const profileDir = '/tmp/prev-chrome-';
  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profileDir}${Date.now()}`,
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
  const shot = async (name, clip) => {
    const s = await cdp.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    writeFileSync(`${OUT}/${name}`, Buffer.from(s.data, 'base64'));
    console.log(`  · 屏照 ${OUT}/${name}`);
  };

  await cdp.send('Page.navigate', { url: OPS_URL });
  await sleep(1200);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await ev(`document.getElementById('pw').value = ${JSON.stringify(PW)}`);
  await ev(`[...document.querySelectorAll('#login button')].find(b => /登录/.test(b.textContent)).click()`);
  await sleep(1500);
  ck('输一次口令进了壳页', await ev(`!document.getElementById('login').classList.contains('hidden') === false`));

  await ev(`[...document.querySelectorAll('#nav s')].find(n => /卡片模板/.test(n.textContent)).click()`);
  await sleep(6000);   // 引擎一口 320KB，本机 loopback 也要给它几秒

  const st = JSON.parse(await ev(`(() => {
      const boxes = [...document.querySelectorAll('.prev')];
      const cards = [...document.querySelectorAll('#tpls .card')];
      const px = (cv) => {
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        const seen = new Set();
        for (let i = 0; i < d.length; i += 4 * 997) seen.add((d[i] >> 3) + ',' + (d[i+1] >> 3) + ',' + (d[i+2] >> 3));
        return seen.size;
      };
      return JSON.stringify({
        cards: cards.length,
        boxes: boxes.length,
        drawn: boxes.filter(b => b.querySelector('canvas')).map(b => {
          const cv = b.querySelector('canvas');
          return { id: b.closest('.card').querySelector('code').textContent, w: cv.width, h: cv.height, colors: px(cv) };
        }),
        nos: boxes.filter(b => !b.querySelector('canvas')).map(b =>
          ({ id: b.closest('.card').querySelector('code').textContent, t: b.textContent.replace(/\\s+/g, ' ').slice(0, 70) })),
        caps: [...document.querySelectorAll('.prev .cap')].length,
        // 名字要按**这个页真打出去的那条 URL** 量：nginx 那层带 /wtsj/ 前缀，
        // 写死 '/api/…' 在现网这一把里永远是空数组（本机没前缀，所以本机测不出来）。
        eng: performance.getEntries().filter((e) => e.name.endsWith('/api/admin/poster/engine')).map((e) => e.responseStatus)
      });
    })()`));

  ck(`十套线上那几行都画出了图（${st.drawn.length} 格有 canvas）`, st.drawn.length >= 10, `卡片 ${st.cards} 张／预览格 ${st.boxes} 个`);
  ck('每张都不是白屏（采样到的颜色数 > 4）', st.drawn.every((d) => d.colors > 4),
    st.drawn.map((d) => `${d.id}:${d.colors}色`).join(' '));
  ck('画布尺寸是配方自己定的（750 宽、按内容定高）', st.drawn.every((d) => d.w === 750 && d.h > 400),
    st.drawn.map((d) => `${d.id} ${d.w}×${d.h}`).slice(0, 4).join('　'));
  ck('引擎只打一口且回 200', st.eng.length === 1 && st.eng[0] === 200, JSON.stringify(st.eng));
  ck('每一格都带那句限定（内置小样／占位／字宽）', st.caps === st.drawn.length, `${st.caps} 句 / ${st.drawn.length} 张`);

  const badGroup = st.nos.find((n) => n.id === 'badGroup');
  const badStep = st.nos.find((n) => n.id === 'badStep');
  if (LIVE) {
    console.log('  · 那两行坏配方只塞在本机库里 ⇒ 这两条反向对照打现网时是"没这一步"，不算过');
  } else {
    ck('反向对照①：分组收不住那一行写的是原因，不是空白格', !!badGroup && /客户端不会收下/.test(badGroup.t), badGroup && badGroup.t);
    // 这一行本来是想撞"收得进但跑不出图"那第二个分支，实际被第一道闸先拦了（validate 认得"不认的步型"）。
    // 第二个分支只在源码上钉（见 tests 里那条"画不出来必须说原因"），这里改判"它得说清为什么"。
    ck('反向对照②：步型不认识的那一行也写原因，不是空白格', !!badStep && /不认的步型/.test(badStep.t), badStep && badStep.t);
  }
  ck('两行坏的都各占一格，没混进"画出来了"那堆', st.drawn.every((d) => d.id !== 'badGroup' && d.id !== 'badStep'));
  ck(LIVE ? '现网十套线上模板每一套都画得出（一格不落）' : '十套线上那几行都画出了图',
    !LIVE || st.drawn.length >= 10, LIVE ? `画了 ${st.drawn.length} 格` : '');
  ck('全程不抛异常', cdp.exceptions.length === 0, cdp.exceptions.join(' | ').slice(0, 300));

  // 屏照按整屏截，不按元素裁：那一格在文档里第几张卡上，裁片的坐标要跟滚动位置对齐，
  // 而这一页有平滑滚动，`scrollIntoView` 之后立刻量的矩形还是滚之前那个（第一版裁出来两张全底色）。
  // 整屏这一张要能同时看到"图 + 那四句限定 + 下面那几格输入框"，那才是这一栏真实的样子。
  await ev(`document.querySelectorAll('#nav s')[document.querySelectorAll('#nav s').length - 1].scrollIntoView()`);
  await sleep(1200);
  await shot(`${TAG}-卡片模板那一栏.png`);
  await ev(`document.querySelector('.prev').classList.add('big')`);
  await sleep(600);
  await shot(`${TAG}-预览放大那一格.png`);
  console.log(`  · 画出来的十格：${st.drawn.map((d) => d.id).join('、')}`);
} finally {
  if (chrome) chrome.kill();
  if (server) server.kill();
}
console.log(bad.length ? `\nFAIL ${bad.length} 处：${bad.join('、')}` : `\nPASS ${ok.length} 条全过`);
process.exit(bad.length ? 1 : 0);
