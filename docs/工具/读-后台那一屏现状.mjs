/* 只读数、不动手：把 /ops 那一屏的界面与交互毛病量成数（站长 10-21「把之前官网后台优化的事情先做了」的开工底数）。
 *
 * 为什么不靠眼看：这一页的"哪里挤、哪里溢出、哪一处点下去当场改线上"三类毛病里，
 * 只有第三类能从代码里读出来，前两类眼睛会骗人（`display:none` 会造假红、写死的窗口宽会失效，
 * 见 [[web-layout-self-check-cdp]]）。所以这里一律走 CDP 量 `getBoundingClientRect` 与计算样式。
 *
 * 通篇只读：只点左栏那 14 条、7/14/30 那三枚窗口按钮、以及打开口令框那一屏。
 * 一个写口都不碰（不点上传、不点发布、不点保存、不点上架下架、不点拉黑）。
 * 「图麦克」那一屏也不点：那一枚会把票换到对面产品的事务里去，与这一把要量的东西无关。
 *
 * 跑法（口令走 stdin，不进 argv、不上屏、不进日志）：
 *   ssh agentsbin "cd /home/ubuntu/wtsj-backend && grep '^ADMIN_TOKEN=' .env | cut -d= -f2-" \
 *     | node docs/工具/读-后台那一屏现状.mjs
 */
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const OPS_URL = process.env.OPS_URL || 'https://api.agentsbin.cn/wtsj/ops'
// 写口那几条断言只在**本机那一份测试库**上跑（点一次「发布」就真的写一次库）。
// 现网那一趟从头到尾只读：量之前说过"只点导航"，这一条不许因为加了新功能就破。
const LOCAL = /127\.0\.0\.1|localhost/.test(OPS_URL)
const CDP_PORT = process.env.CDP_PORT || '9361'
const OUT = 'docs/design/后台优化-自证-20261021'
const TAG = process.env.TAG || '前'

const PW = (readFileSync(0, 'utf8').split('\n')[0] || '').trim()
if (!PW) { console.log('FAIL  stdin 没读到口令'); process.exit(1) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const j = async (p, o) => (await fetch(`http://127.0.0.1:${CDP_PORT}${p}`, o)).json()

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const exceptions = []
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text))
    }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id)
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result)
    }
  })
  const ready = new Promise((r) => ws.addEventListener('open', r))
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id; pending.set(n, { resolve: res, reject: rej })
    ws.send(JSON.stringify({ id: n, method, params }))
  })
  return { ready, send, ws, exceptions }
}

let chrome = null
const lines = []
const say = (s) => { lines.push(s); console.log(s) }

// 对比度那套算式要在**页面里**跑（量的是渲染出来的计算样式），所以下面 PROBE 自带一份。
// Node 侧这份只留给改动后用同一把尺子复算，两边同一套 WCAG 公式。

// 「卡片模板」那一栏的折叠读数。模板行带的是 data-id 不是 data-key，一栏一屏那一刀不许碰它们
// （见页面里 NAVKEYS 那段注释），所以这一栏归这一条自己量：默认合着、点开几套、预览画了几张。
// PROBE 里嵌的就是这一段——两处共用一把尺子，免得量法在两个地方长歪。
const FOLD = `(() => { const q = (s) => [...document.querySelectorAll(s)];
  const rows = q('#tpls .card[data-id]');
  if (!rows.length) return null;
  const open = rows.filter(function (c) { const b = c.querySelector('.tplbody'); return b && b.offsetParent !== null; });
  return { 行数: rows.length, 展开: open.length, 第一行高: Math.round(rows[0].getBoundingClientRect().height),
    全栏总高: Math.round(document.getElementById('tpls').getBoundingClientRect().height),
    画了几张预览: q('#tpls canvas').length,
    合着的输入框: q('#tpls .tplbody input').filter(function (i) { return i.offsetParent === null }).length }; })()`

const PROBE = `(() => {
  const srgb = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) };
  const lum = (p) => 0.2126 * srgb(p[0]) + 0.7152 * srgb(p[1]) + 0.0722 * srgb(p[2]);
  const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
  const q = (s) => [...document.querySelectorAll(s)];
  const rect = (n) => { const r = n.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) } };
  const col = (n, p) => getComputedStyle(n)[p];
  const rgb = (s) => (String(s).match(/\\d+/g) || []).slice(0, 3).map(Number);
  // 背景一层一层往上找，直到碰到一个不透明的底色为止（.grp 住在 nav 里，nav 自己是透明的）。
  const bgOf = (n) => {
    let e = n;
    while (e && e !== document.documentElement) {
      const c = getComputedStyle(e).backgroundColor;
      const m = (String(c).match(/[\\d.]+/g) || []).map(Number);
      if (m.length >= 4 && m[3] > 0) return m.slice(0, 3);
      e = e.parentElement;
    }
    return rgb(getComputedStyle(document.body).backgroundColor);
  };
  const out = {
    url: location.href,
    hScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    docW: document.documentElement.clientWidth,
    nav: q('#nav s,#nav .navitem').map((n) => ({ tag: n.tagName, text: n.textContent, on: n.classList.contains('on'),
      focusable: n.tabIndex >= 0, role: n.getAttribute('role') || '', aria: n.getAttribute('aria-current') || '',
      box: rect(n) })),
    navGrp: q('#nav i').map((n) => ({ tag: n.tagName, text: n.textContent,
      color: col(n, 'color'), contrast: +ratio(rgb(col(n, 'color')), bgOf(n)).toFixed(2), size: col(n, 'fontSize') })),
    switcher: q('.sw b,.sw .switem').map((n) => ({ tag: n.tagName, text: n.textContent, focusable: n.tabIndex >= 0 })),
    noteContrast: (() => { const n = document.querySelector('.note'); return n ? +ratio(rgb(col(n, 'color')), bgOf(n)).toFixed(2) : null })(),
    tagContrast: (() => { const n = document.querySelector('.tag'); return n ? +ratio(rgb(col(n, 'color')), bgOf(n)).toFixed(2) : null })(),
    cards: q('.card').map((c) => ({ key: c.dataset.key || c.dataset.id || '', h: rect(c).h })),
    buttons: q('button').map((b) => ({ text: (b.textContent || '').trim().slice(0, 10), h: rect(b).h,
      disabled: b.disabled })).filter((b) => b.h > 0 && b.h < 34),
    tables: q('table.dt').map((t) => { const box = t.parentElement;
      return { w: rect(t).w, parentW: rect(box).w, over: rect(t).w > rect(box).w + 1,
        wrapScrollable: getComputedStyle(box).overflowX === 'auto' } }),
    inputs: q('input[type=text],input[type=password],textarea').map((i) => ({ ph: i.placeholder || '', h: rect(i).h })),
    // 一屏里"点下去当场改线上"的那类按钮，逐枚列出来（本尺子只列不点）。
    // 只数**在屏上的**：一栏一屏之后主区常驻着藏起来的卡，模板那二十行的保存／下架
    // 全在折叠体里，按 DOM 数会把"折叠没展开所以按不到"数成"矮过下限的按钮"。
    writeButtons: q('button').filter((b) => b.offsetParent !== null
      && /发布|停用|保存|上架|下架|拉黑|移出|上传|删除|替换/.test(b.textContent || ''))
      .map((b) => ({ text: (b.textContent || '').trim().slice(0, 14), h: rect(b).h, disabled: b.disabled })),
    scrollY: Math.round(window.scrollY),
    // 点完左栏那一条：这一栏是不是**只剩那一张卡**（一栏一屏的判据），它有没有落在视口上沿。
    // 以前这一条量的是"滚过去有没有到位"，现在量的是"别的藏干净了没有"——两回事，数都得留。
    landed: (() => {
      const on = document.querySelector('#nav s.on,#nav .navitem.on');
      if (!on) return { key: '(没有选中条)' };
      const k = on.getAttribute('data-key');
      const c = document.querySelector('#main .card[data-key="' + k + '"]');
      if (!c) return { key: k, 那张卡: '(主区里没有这张卡)' };
      const r = c.getBoundingClientRect();
      const view = c.closest('.view');
      // 只看**带左栏 key 的那几张**：模板行归折叠那条量（下面 tplFold），把它们算进"这一栏摊了几张"
      // 会把「卡片模板」那一条永远报成红，而它红的其实是我们想要的那件事（一栏里就是一列行）。
      const vis = view ? [...view.querySelectorAll('.card[data-key]')].filter((x) => x.offsetParent !== null) : [];
      return { key: k, 顶: Math.round(r.top), 栏顶: view ? Math.round(view.getBoundingClientRect().top) : -1,
        高: Math.round(r.height), y: Math.round(window.scrollY),
        这一栏可见卡: vis.length, 可见的是: vis.map((x) => x.getAttribute('data-key')).join(','),
        标题: (c.innerText || '').split('\\n')[0].slice(0, 12) };
    })(),
    // 「卡片模板」那一栏自己的折叠态：默认只出一行名字＋状态，点开一套才出预览与那四个框。
    tplFold: ${FOLD},
    // 整页横向溢出的时候，光看"溢出多少 px"没法定位。这一条把**没有被任何滚动壳夹住**、
    // 却伸出视口右沿的元素列出来（.tw 那种滚动壳里那张表是设计成能伸出去的，不算）。
    // 注意：这一段是模板字符串里的注释，里面不许出现反引号——那会当场把字符串截断（第一趟就是这么红的）。
    overflows: (() => {
      const cw = document.documentElement.clientWidth;
      const clipped = (n) => { let e = n.parentElement; while (e) { const o = getComputedStyle(e).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; e = e.parentElement; } return false; };
      return q('body *').filter((n) => { const r = n.getBoundingClientRect();
        return r.width > 0 && r.right > cw + 1 && !clipped(n); })
        .slice(0, 8).map((n) => n.tagName + (n.className ? '.' + String(n.className).split(' ')[0] : '')
          + ' 右' + Math.round(n.getBoundingClientRect().right));
    })(),
    logout: !!document.getElementById('btnLogout'),
    confirmGate: q('button').some((b) => /确定|再点一次|确认/.test(b.textContent || '')),
    busyWord: q('button').some((b) => /提交中|正在|保存中|发布中/.test(b.textContent || '')),
    navAria: q('#nav s,#nav .navitem').filter((n) => n.getAttribute('aria-current')).length,
    viewTall: (() => { const m = document.getElementById('main'); return m ? Math.round(m.getBoundingClientRect().height) : 0 })(),
  };
  return JSON.stringify(out);
})()`

// 开局先自查这段字符串还是不是合法 JS：模板字面量里写 \n 会被 Node 先吃掉一个反斜杠，
// 到了页面里就变成"字符串中间一个真空行"。不先查的症状是**跑完登录、走完十几屏才红**，
// 白等一趟（10-21 就是这么栽的）。PROBE 是一段**没有任何插值的常量**（`${` 一个都没有），
// 这里只 compile 不执行，所以不存在把外部值拼进代码这回事。
try { new Function(PROBE) } catch (e) {
  console.log('FAIL 那段求值自己就不是合法 JS：' + e.message)
  process.exit(1)
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const profile = '/tmp/ops-read-' + Date.now()
  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
     '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
  for (let i = 0; i < 40; i++) { try { await j('/json/version'); break } catch { await sleep(250) } if (i === 39) throw new Error('headless Chrome 没起来') }
  const tab = await j(`/json/new?url=${encodeURIComponent(OPS_URL)}`, { method: 'PUT' })
  const cdp = connect(tab.webSocketDebuggerUrl)
  await cdp.ready
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  // `/json/new?url=` 在 headless=new 下不一定真把这一页装进去（第一趟就是这么栽的：
  // 求值落在 about:blank 上，`getElementById('pw')` 回 null）。所以显式 navigate 一次。
  await cdp.send('Page.navigate', { url: OPS_URL })
  await sleep(3000)

  const ev = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    // 报错话里带上这段求值的开头：这一把跑在现网页面上，哪一句挂了得能当场认出来（第一趟就是被一句 `)` 卡住、又没落读数文件）。
    if (r.exceptionDetails) throw new Error('那段求值抛了：' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      + '\n   ← 求值开头：' + expression.replace(/\s+/g, ' ').slice(0, 90))
    return r.result ? r.result.value : undefined
  }
  const setView = async (w, h) => cdp.send('Emulation.setDeviceMetricsOverride',
    { width: w, height: h, deviceScaleFactor: 2, mobile: w < 500 })
  // 屏照：`clip` 配 `captureBeyondViewport:true` 才给真东西。第一趟没带这个开关，
  // 于是滚到 12,000px 深处那几屏截回来是一张整页空白（视口之外的像素 Chrome 压根没画），
  // 看着像"这一栏是空的"——那是截图在骗人，不是页面。
  // 每一张都按"点完左栏那一条之后实际滚到的位置"去截，量的是操作者眼里的那一屏。
  let clipW = 1440
  const shot = async (name, h) => {
    const y = await ev('Math.round(window.scrollY)')
    const s = await cdp.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true, clip: { x: 0, y: y, width: clipW, height: h || 900, scale: 1 } })
    writeFileSync(`${OUT}/${name}`, Buffer.from(s.data, 'base64'))
  }

  await setView(1440, 900); clipW = 1440
  await sleep(1500)
  // 口令框那一屏
  await shot(`${TAG}-00-口令框.png`, 620)
  const before = JSON.parse(await ev(PROBE))
  say(`口令框那一屏：横向溢出 ${before.hScroll} px`)

  await ev(`document.getElementById('pw').value = ${JSON.stringify(PW)}; document.getElementById('btnLogin').click(); 1`)
  await sleep(3500)
  const logged = await ev(`!document.getElementById('app').classList.contains('hidden')`)
  if (!logged) { say('FAIL  没登进去（口令不对，或那一侧接口变了）'); process.exit(1) }
  say('登进去了')

  // 逐条走左栏那 14 条：点一条 → 量一次 → 截一张（只点导航，不点任何提交动作）
  const keys = await ev(`(() => { const a = [...document.querySelectorAll('#nav s,#nav .navitem')];
    return JSON.stringify(a.map((n, i) => i)); })()`).then((s) => JSON.parse(s))
  for (let i = 0; i < keys.length; i++) {
    await ev(`document.querySelectorAll('#nav s,#nav .navitem')[${i}].click(); 1`)
    await sleep(1200)
    const d = JSON.parse(await ev(PROBE))
    const label = (d.nav[i] && d.nav[i].text) || `#${i + 1}`
    // 甲之后的判据两条：这一栏只剩那一张带 key 的卡，而且它就顶在栏子的最上面（不用滚）。
    const land = d.landed || {}
    const 差 = typeof land.顶 === 'number' && typeof land.栏顶 === 'number' ? land.顶 - land.栏顶 : null
    say(`\n── 左栏第 ${i + 1} 条「${label}」`)
    if (typeof land.顶 === 'number') {
      say(`   落点：${JSON.stringify(land)}`
        + (land.这一栏可见卡 > 1 ? `　← 红：这一栏还摊着 ${land.这一栏可见卡} 张（${land.可见的是}）` : '')
        + (差 !== null && Math.abs(差) > 4 ? `　← 红：那一张顶在栏子里 ${差}px 的位置，屏上还得滚一下才看到标题` : ''))
    } else say(`   落点：${JSON.stringify(land)}`)
    if (d.tplFold) say(`   模板栏折叠：${JSON.stringify(d.tplFold)}`)
    say(`   主区高 ${d.viewTall}px · 卡 ${d.cards.length} 张 · 横向溢出 ${d.hScroll}px · 选中态落在第 ${(d.nav.findIndex((n) => n.on) + 1)} 条`)
    if (d.navGrp.length) say(`   组标题「${d.navGrp.map((g) => g.text + ' ' + g.contrast + ':1').join(' / ')}」`)
    if (d.noteContrast) say(`   .note ${d.noteContrast}:1　.tag ${d.tagContrast}:1`)
    if (d.buttons.length) say(`   矮过 34px 的按钮 ${d.buttons.length} 枚：${d.buttons.slice(0, 5).map((b) => b.text + ' ' + b.h).join('、')}`)
    const over = d.tables.filter((t) => t.over)
    if (d.tables.length) say(`   表 ${d.tables.length} 张，超出容器 ${over.length} 张（外层能横滚的 ${d.tables.filter((t) => t.wrapScrollable).length} 张）`)
    say(`   导航元素标签 ${[...new Set(d.nav.map((n) => n.tag))].join('/')}，可 Tab 聚焦 ${d.nav.filter((n) => n.focusable).length}/${d.nav.length}，aria-current ${d.navAria}`)
    say(`   切换那两枚标签 ${[...new Set(d.switcher.map((s) => s.tag))].join('/')}（可聚焦 ${d.switcher.filter((s) => s.focusable).length}）`)
    say(`   有没有：退出 ${d.logout ? '有' : '没有'}／此刻屏上挂着"再点一次"的 ${d.confirmGate ? '有' : '没有'}／提交中字样 ${d.busyWord ? '有' : '没有'}`)
    if (d.overflows.length) say(`   伸出视口右沿且没被滚动壳夹住的元素：${d.overflows.join('、')}`)
    if (d.writeButtons.length) say(`   这一屏点下去就改线上的按钮 ${d.writeButtons.length} 枚：${d.writeButtons.slice(0, 8).map((b) => b.text + '(' + b.h + 'px' + (b.disabled ? '，灰着' : '') + ')').join('、')}`)
    await shot(`${TAG}-导航${String(i + 1).padStart(2, '0')}-${label.replace(/[ /]/g, '')}.png`, 900)
  }

  // 7/14/30 那三枚（只读数，不写）。这一段挂了不许把窄屏那一档一起带走：
  // 第一趟就是栽在这三行上，结果最想量的 390 宽溢出那条数一条没落到。
  try {
    await ev(`document.querySelectorAll('#nav s,#nav .navitem')[0].click(); 1`)
    await sleep(1200)
    const atNav = await ev(`JSON.stringify({ y: Math.round(window.scrollY), 顶部那张: (document.querySelector('#view-stats .card') || {}).innerText ? document.querySelector('#view-stats .card').innerText.split('\\n')[0] : '(没有)', 选中: (document.querySelector('#nav s.on,#nav .navitem.on') || {}).textContent || '(无)' })`)
    say(`\n── 点左栏「总览」之后落点：${atNav}`)
    const yBefore = await ev('Math.round(window.scrollY)')
    await ev(`(() => { const b = [...document.querySelectorAll('button.mini')].find(function (x) { return /30\\s*天/.test(x.textContent || ''); }); if (b) b.click(); return 1; })()`)
    await sleep(2500)
    const afterDays = JSON.parse(await ev(PROBE))
    const scroll = await ev(`JSON.stringify({ y: Math.round(window.scrollY), on: (document.querySelector('#nav s.on,#nav .navitem.on') || {}).textContent || '(没有选中条)' })`)
    say(`── 换 30 天窗口：点之前 y=${yBefore}，重画之后 ${scroll}`)
    say(`   卡片数 ${afterDays.cards.length}，主区高 ${afterDays.viewTall}px`)
  } catch (e) { say(`\n── 30 天那一档没量到：${e && e.message || e}`) }

  // 一栏一屏（站长 10-21 拍甲）之后的三条读数：滚动不再改高亮（跟随那套撤了），
  // 模板那一栏的折叠归自己管，以及从「图麦克」那屏回来到不能是一片空白。
  try {
    await ev(`document.querySelectorAll('#nav s,#nav .navitem')[0].click(); 1`)
    await sleep(800)
    const spy = await ev(`(() => {
      const cards = [...document.querySelectorAll('#view-stats .card')];
      const before = (document.querySelector('#nav s.on,#nav .navitem.on') || {}).textContent || '(无)';
      if (cards[3]) cards[3].scrollIntoView({ block: 'start' });
      window.scrollBy(0, -80);
      return new Promise(function (res) { setTimeout(function () {
        const now = (document.querySelector('#nav s.on,#nav .navitem.on') || {}).textContent || '(无)';
        const top = cards.filter(function (c) { return c.getBoundingClientRect().top < 200; }).length;
        res(JSON.stringify({ 点的是: before, 滚之后高亮: now, 屏上可见的卡: cards.filter(function (c) { return c.offsetParent !== null }).length, 已滚过卡片: top, scrollY: Math.round(window.scrollY) }));
      }, 700); });
    })()`)
    say(`\n── 滚动还跟不跟高亮（甲之后应当"不跟"）：${spy}`)
  } catch (e) { say(`\n── 滚动跟随没量到：${e && e.message || e}`) }

  // 卡片模板那一栏的折叠：默认全合、点开一套只画那一张预览、点另一套上一套自己合上。
  // 只点「展开这一套」这一枚——它不碰接口，一个字都不写。
  try {
    await ev(`(() => { const n = [...document.querySelectorAll('#nav .navitem')].find(function (x) { return /卡片模板/.test(x.textContent || ''); }); if (n) n.click(); return 1; })()`)
    await sleep(1500)
    const fold0 = await ev(`JSON.stringify(${FOLD})`)
    say(`\n── 「卡片模板」刚点开的折叠态：${fold0}`)
    await shot(`${TAG}-模板栏默认全合.png`, 900)
    const open1 = await ev(`(() => { const cs = [...document.querySelectorAll('#tpls .card[data-id]')];
      cs[1].querySelector('.tpltoggle').click();
      return new Promise(function (res) { setTimeout(function () { res(JSON.stringify(${FOLD})); }, 1800); }); })()`)
    say(`── 点开第二行之后：${open1}`)
    await ev(`(() => { const cs = [...document.querySelectorAll('#tpls .card[data-id]')];
      cs[1].scrollIntoView({ block: 'start' }); return 1; })()`)
    await sleep(400)
    await shot(`${TAG}-模板点开一套.png`, 1000)
    const open2 = await ev(`(() => { const cs = [...document.querySelectorAll('#tpls .card[data-id]')];
      cs[3].querySelector('.tpltoggle').click();
      return new Promise(function (res) { setTimeout(function () { res(JSON.stringify(${FOLD})); }, 1800); }); })()`)
    say(`── 再点第四行（第二行应当自己合上）：${open2}`)
    // 往格子里打一句"没保存的字"只在**本机那一份测试库**上做：现网那一趟一个字都不许进输入框。
    // （它不发请求，但"在现网界面上留下过什么"这件事本身就不该发生。）
    const back = LOCAL ? await ev(`(() => { const cs = [...document.querySelectorAll('#tpls .card[data-id]')];
      const inp = [...document.querySelectorAll('#tpls .tplbody:not(.hidden) input')];
      if (inp.length) { inp[0].value = '甲-自证没保存'; inp[0].dispatchEvent(new Event('input', { bubbles: true })); }
      return new Promise(function (res) { setTimeout(function () {
        const chip = cs[3].querySelector('.dirty');
        res(JSON.stringify({ 没保存的角标: chip ? chip.textContent : '(没有)', 角标在屏上: !!(chip && chip.offsetParent !== null) }));
      }, 400); }); })()`) : null
    if (LOCAL) say(`── 展开那一行里打一格字：${back}`)
    const close = await ev(`(() => { const cs = [...document.querySelectorAll('#tpls .card[data-id]')];
      cs[3].querySelector('.tpltoggle').click();
      return new Promise(function (res) { setTimeout(function () {
        res(JSON.stringify({ 折叠后角标还在: !!([...cs[3].querySelectorAll('.dirty')].find(function (x) { return x.offsetParent !== null })),
          那一格的字: (cs[3].querySelector('.tplbody input') || {}).value || '(没有框)' }));
      }, 400); }); })()`)
    say(LOCAL ? `── 合上那一行（刚打的字与角标都不许丢）：${close}`
      : `── 合上那一行（现网这一趟一个字没打过，只核折叠本身）：${close}`)
    await ev(`(() => { var b = document.getElementById('swOther'); if (b) b.click(); return 1; })()`)
    await sleep(1200)
    const other = await ev(`JSON.stringify({ 屏上可见卡: [...document.querySelectorAll('#main .view')].filter(function (v) { return v.offsetParent !== null }).map(function (v) { return v.id }).join(',') })`)
    say(`── 切到「图麦克」：${other}`)
    await ev(`document.getElementById('swSelf').click(); 1`)
    await sleep(1200)
    const home = await ev(`(() => { const v = document.querySelector('#view-stats:not(.hidden)');
      const vis = v ? [...v.querySelectorAll('.card')].filter(function (c) { return c.offsetParent !== null }) : [];
      return JSON.stringify({ 回来这一栏: v ? v.id : '(没有可见的栏)', 可见卡数: vis.length, 是哪一张: vis.map(function (c) { return (c.innerText || '').split('\\n')[0].slice(0, 12) }).join(','), 高亮: (document.querySelector('#nav .navitem.on') || {}).textContent || '(无)' }); })()`    )
    say(`── 从「图麦克」回来到的是数据栏第一张（不是空白）：${home}`)
  } catch (e) { say(`\n── 一栏一屏那几条没量到：${e && e.message || e}`) }

  // 窄屏那一档：现网真有人在手机上开这一页。14 条全走一遍——「来源黑名单」那张六列表
  // 与「卡片模板」那一栏只有在这两屏才看得出挤不挤，前六条量不到。
  await setView(390, 844); clipW = 390
  await sleep(800)
  for (let i = 0; i < keys.length; i++) {
    try {
      await ev(`document.querySelectorAll('#nav s,#nav .navitem')[${i}].click(); 1`)
      await sleep(900)
      const d = JSON.parse(await ev(PROBE))
      const nm = (d.nav[i] && d.nav[i].text) || `#${i + 1}`
      const over = d.tables.filter((t) => t.over)
      say(`390 宽「${nm}」：横向溢出 ${d.hScroll}px，表 ${d.tables.length} 张里 ${over.length} 张超出容器（外层可横滚 ${d.tables.filter((t) => t.wrapScrollable).length}）`)
      if (d.overflows.length) say(`   390 宽伸出视口的元素：${d.overflows.join('、')}`)
      const vis = d.writeButtons.filter((b) => b.h > 0)
      if (vis.length) say(`   390 宽这一屏写口按钮 ${vis.length} 枚，最矮 ${Math.min(...vis.map((b) => b.h))}px`)
      await shot(`${TAG}-窄屏${String(i + 1).padStart(2, '0')}-${nm.replace(/[ /]/g, '')}.png`, 844)
    } catch (e) { say(`390 宽第 ${i + 1} 条没量到：${e && e.message || e}`) }
  }

  // ---- 写口那道闸有没有牙：只有本机那一份一次性测试库才跑这一段。
  // 它**真点写口**（点第二下就真改一次库），所以外面那一趟（现网）从头到尾到不了这里。
  if (LOCAL) {
    await setView(1440, 900); clipW = 1440
    await sleep(700)
    say('\n── 写口那道闸有没有牙（本机测试库，真点）')
    try {
      await ev(`(() => { if (window.__w) return 1; const of = window.fetch; window.__w = [];
        window.fetch = function (a, b) { const s = String(a); window.__w.push(((b && b.method) || 'GET') + ' ' + (s.indexOf('/api/') >= 0 ? s.split('/api/')[1] : s)); return of.apply(this, arguments); };
        return 1 })()`)
      const puts = async () => JSON.parse(await ev('JSON.stringify((window.__w||[]).filter(function(x){return /^PUT|^POST|^DELETE/.test(x)}))'))
      // ⓪ 先把状态铺平，再量闸。上一趟这一段跑完是把 home_bg **停用**了：那一枚当场置灰，
      // `arm()` 对 disabled 的按钮第一现就早退，于是"第一下 0 条写请求"量的是灰按钮，是假绿
      // （10-21 第二趟就撞出这一句：第一下之后 {"染橙":false,"置灰":true}、第二下什么也没发）。
      // 所以先把历史里那一张发出去（这一趟本身就要点两下，正好先走一遍闸），再开始逐条量。
      await ev(`document.querySelectorAll('#nav s,#nav .navitem')[8].click(); 1`); await sleep(1200)
      const prep = await ev(`(() => { const card = document.querySelector('#kinds .card[data-key="kind:home_bg"]');
        if (!card) return '(找不到首页背景那张卡)';
        const b = [...card.querySelectorAll('button')].find(function (x) { return /停用/.test(x.textContent) });
        if (b && !b.disabled) return '停用本来是点得动的，不用铺';
        const s = [...card.querySelectorAll('.swatch')].find(function (x) { return !x.classList.contains('cur') });
        if (!s) return '(历史里没有第二张可发)';
        s.click(); s.click(); return '已用历史那一格把这一张发出去（两下走的同一道闸）'; })()`)
      await sleep(2500)
      say(`   铺状态：${prep}`)
      // ① 「停用」第一下：不许发出任何写请求，只许把这一枚换成确认话术
      await ev(`document.querySelectorAll('#nav s,#nav .navitem')[8].click(); 1`); await sleep(1200)
      const before = (await puts()).length
      const first = await ev(`(() => { const b = [...document.querySelectorAll('#kinds .card button')].find(function (x) { return /停用/.test(x.textContent) });
        if (!b) return '这一屏没找到停用那枚'; b.click();
        return JSON.stringify({ 文本: b.textContent, 染橙: b.classList.contains('arm'), 置灰: b.disabled }); })()`)
      await sleep(500)
      say(`   第一下之后：${first}`)
      say(`   第一下发出的写请求 ${await puts().then((a) => a.length - before)} 条（要的是 0）`)
      // ② 第二下：这才许真发
      await ev(`(() => { const b = [...document.querySelectorAll('#kinds .card button')].find(function (x) { return /再点一次/.test(x.textContent) }); if (b) b.click(); return 1 })()`)
      await sleep(1800)
      const after = await puts()
      say(`   第二下发出：${JSON.stringify(after.slice(before))}（要的是那条 PUT settings/home_bg）`)
      await shot(`${TAG}-写口第二下之后-已停用.png`, 900)
      // ③ 历史那一格：点第一下同样不许发
      const n0 = (await puts()).length
      const sw = await ev(`(() => { const s = document.querySelector('#kinds .card .swatch'); if (!s) return '这一屏没有历史缩略图（本机库里只有一张？）';
        s.click(); return JSON.stringify({ 染橙: s.classList.contains('arm'), 那句: (s.querySelector('.ask') || {}).textContent || '' }); })()`)
      await sleep(500)
      say(`   历史那一格第一下：${sw}，发出写请求 ${(await puts()).length - n0} 条（要的是 0）`)
      // ④ 未保存的字：打进去 → 角标出现 → 整栏重建 → 字还在、角标还在
      await ev(`document.querySelectorAll('#nav s,#nav .navitem')[9].click(); 1`); await sleep(1000)
      const typed = await ev(`(() => { const ta = document.querySelector('#texts .card[data-key="text:tips"] textarea.ta');
        if (!ta) return '没找到 Tips 那个框'; ta.value = ta.value + '\\n自证第三句';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        const chip = document.querySelector('#texts .card[data-key="text:tips"] .dirty');
        return JSON.stringify({ 角标: chip ? chip.textContent : '(没有角标)', 藏着: chip ? chip.classList.contains('hidden') : null }); })()`)
      say(`   打字之后：${typed}`)
      await ev('window.refresh(); 1'); await sleep(2200)
      const kept = await ev(`(() => { const ta = document.querySelector('#texts .card[data-key="text:tips"] textarea.ta');
        const chip = document.querySelector('#texts .card[data-key="text:tips"] .dirty');
        return JSON.stringify({ 字还在: /自证第三句/.test(ta ? ta.value : ''), 角标: chip ? chip.textContent : '(没有角标)' }); })()`)
      say(`   整栏重建之后：${kept}（旧版这一句会是"字还在:false"，而且不报错）`)
      await shot(`${TAG}-重建之后那两句还在.png`, 900)
      // ⑤ 退出：只清这一页那把票
      const out = await ev(`(() => { document.getElementById('btnLogout').click();
        return JSON.stringify({ 口令框: !document.getElementById('login').classList.contains('hidden'),
          票: sessionStorage.getItem('opsSession'), 壳还在: !document.getElementById('app').classList.contains('hidden') }); })()`)
      say(`   退出之后：${out}`)
    } catch (e) { say(`   这一段没跑完：${e && e.message || e}`) }
  } else {
    say('\n── 写口那一段没跑：这一趟打的是现网，通篇只读（要跑得把 OPS_URL 指到本机测试库）')
  }

  say(`\n未捕获异常 ${cdp.exceptions.length} 条${cdp.exceptions.length ? '：' + cdp.exceptions.join(' | ') : ''}`)
  writeFileSync(`${OUT}/${TAG}-量数.txt`, lines.join('\n') + '\n')
  say(`读数已落 ${OUT}/${TAG}-量数.txt`)
  cdp.ws.close()
  // 不许在这里 process.exit：那样 `.finally` 跑不到，headless Chrome 就留在机器上（前面两趟就是这么漏的）。
}
main().catch((e) => { console.error('FAIL ' + (e && e.message || e)) })
  .finally(() => {
    // 中途挂了也要把已经量到的数落盘：这一把量的是现网，重来一趟要重新登录、重新等渲染。
    try { writeFileSync(`${OUT}/${TAG}-量数.txt`, lines.join('\n') + '\n') } catch {}
    if (chrome) chrome.kill('SIGKILL')
  })
