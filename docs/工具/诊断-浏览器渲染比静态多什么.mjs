/* 同一批链接，**真浏览器渲染一遍**，量"渲染比静态 HTML 多拿到什么"。
   这一把回答的是站长 10-19 那句「能否根据 URL 拉起页面、无法获取图片时自动截图写入笔记」里最硬的一格：
   装一个浏览器到底能不能过那些壳页——**能不能，不靠推断，靠这一段求值读回来的字数与张数**。

   跑法（本机；现网那台机器上没有任何浏览器，跑不了这一把）：
     "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
       --remote-debugging-port=9344 --user-data-dir=/tmp/url-render-profile --no-first-run about:blank &
     node docs/工具/诊断-浏览器渲染比静态多什么.mjs

   ⚠ 三条读数限制，报出去的时候必须一起说：
   ① 用的是**全新无 cookie 的 profile**（等于"用户没登录"这一档），所以它测的是"渲染能不能替掉登录态"，
      不是"我们的服务器能不能登录那些站"；
   ② headless 的 `navigator.webdriver` 是真的，站点认得出来 ⇒ **这一把红不能当"渲染没用"的终判**，
      只能说"headless 无 cookie 这一档没过那道门"；要判终局得在现网装一个真浏览器再打一次；
   ③ 本机静态那一路同一把脚本两趟落点不同（一趟笔记 69,039 B、一趟登录壳 36,211 B），
      所以本机的读数**不能倒推现网**。
*/
const PORT = process.env.CDP_PORT || '9344';
const SETTLE = Number(process.env.SETTLE_MS || 6000);

const URLS = [
  ['微博·正文页', 'https://weibo.com/1649679354/5353881820204840'],
  ['微博·移动版同形', 'https://m.weibo.cn/status/5353881820204840'],
  ['小红书·短链', 'https://xhslink.cn/o/9F1fAXNBL1I'],
  ['知乎·站根', 'https://www.zhihu.com/'],
  ['公众号·图文型（对照）', 'https://mp.weixin.qq.com/s/H2BANSW_U-Jjl1Ic_ZuZKA'],
];

const j = async (path, opt) => (await fetch(`http://127.0.0.1:${PORT}${path}`, opt)).json();

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.stringify ? JSON.parse(ev.data) : ev.data;
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  const ready = new Promise((r) => ws.addEventListener('open', r));
  return {
    ready,
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    }),
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 这一段在页面里跑：只读 DOM，不点任何东西、不填任何东西。
const PROBE = `(() => {
  const imgs = Array.from(document.images || []);
  const big = imgs.filter(i => i.naturalWidth >= 200 && i.naturalHeight >= 200);
  const txt = (document.body && document.body.innerText || '').replace(/\\s+/g, ' ');
  return JSON.stringify({
    href: location.href,
    title: document.title,
    bodyChars: txt.length,
    bodyHead: txt.slice(0, 90),
    imgTags: imgs.length,
    bigImgs: big.length,
    bigSrcs: big.slice(0, 3).map(i => i.currentSrc || i.src).map(s => String(s).slice(0, 90)),
    docHeight: document.body.scrollHeight,
    webdriver: !!navigator.webdriver,
  });
})()`;

async function openOne(cdp, url) {
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url });
  // 不追 loadEventFired 那一枚事件（这一把要的就是"跑完之后屏上有什么"，给它固定一段沉降时间更稳）
  await sleep(SETTLE);
  const r = await cdp.send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  if (!r.result || typeof r.result.value !== 'string') {
    return { probeError: JSON.stringify(r).slice(0, 200) };
  }
  return JSON.parse(r.result.value);
}

try {
  await j('/json/version');
} catch {
  console.log(`!! 9344 上没有 Chrome：先按文件头那一行把 --headless=new 起起来`);
  process.exit(1);
}
console.log(`这台机器 本机 Chrome headless｜沉降 ${SETTLE} ms／条`);
for (const [label, url] of URLS) {
  let tab;
  try {
    tab = await j('/json/new?url=about%3Ablank', { method: 'PUT' });
    const cdp = connect(tab.webSocketDebuggerUrl);
    await cdp.ready;
    const out = await openOne(cdp, url);
    console.log(`\n=== ${label}`);
    console.log(`  渲染后  ${out.href ? out.href.slice(0, 110) : ''}｜title=${JSON.stringify(out.title)}`);
    console.log(`  正文字数 ${out.bodyChars}｜图 ${out.bigImgs} 张大图／共 ${out.imgTags} 枚 img`);
    console.log(`  正文前 90 字 ${JSON.stringify(out.bodyHead)}`);
    (out.bigSrcs || []).forEach((s, k) => console.log(`  大图${k + 1} ${s}`));
    console.log(`  页高 ${out.docHeight}｜navigator.webdriver=${out.webdriver}`);
    // 关掉那一页只是收尾，CDP 在这儿回的是纯文本 "Target is closing"，不该把它当一次失败
    await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch(() => {});
  } catch (e) {
    console.log(`\n=== ${label}\n  !! 这一条没跑成：${String(e.message || e).slice(0, 160)}`);
  }
}
console.log('\n（这一把只在浏览器里读 DOM，不写任何东西；跑完关掉那个临时 profile）');
