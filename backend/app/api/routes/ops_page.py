"""`GET /ops`：后台那一页本身，后端直接吐一份单页 HTML。

方案 §四 P0-a 第 5 条 + 站长 10-11 拍的 B 甲。先例是 `routes/landing.py:260-268`（后端早就在
直接发 HTML，只是那一页面向公众、这一页面向操作者）。选它而不是做进官网（B 乙）的理由：
一处部署、跟着 `backend/deploy.sh` 走、不用配 CORS、**口令不落在 nginx 静态目录里**。

这一页零构建：原生 HTML + 原生 JS，没有打包步骤、没有依赖、不引前端框架。它的全部数据都从
`/api/admin/*` 那几个口现取，页面本身不含任何服务端拼出来的用户内容——所以这里没有一处
需要 HTML 转义，也就没有"漏了一个 `_e()`"这种坑。JS 里同理：**动态字符串一律走
`textContent`，全页零 `innerHTML`**，因为历史那些 `note` 是操作者手打的，谁也不知道他会粘什么进来。

地址这一头有两个坑，都在 `u()` 那一个函数里处理掉了，别在别处再拼一遍：
1. 浏览器看到的地址带 nginx 前缀（`https://api.agentsbin.cn/wtsj/ops`），而后端注册的路径不带
   （`/api/admin/*`）。所以取数一律用**相对当前目录**的写法，前缀在不在都对（本机 8000 直连也是同一句）。
2. 接口回的图地址是根相对的 `/api/mp/a/<token>`（那是给小程序拼它自己的 BASE 用的，见
   `services/mp_assets.url_of`），在这一页上要当预览图显示，得换成同一套相对写法。
"""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()

_NO_STORE = {"Cache-Control": "no-store", "Pragma": "no-cache"}

# 一句都不带变量：整份 HTML 是常量，页面上一切会变的字都来自接口。
_PAGE = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>运营后台 · 图麦笔记</title>
<style>
:root { --ink:#14161A; --muted:#6b6f78; --line:#e3e0d8; --paper:#F2EFE9; --clay:#D2683F; }
* { box-sizing:border-box }
body { margin:0; padding:28px 20px 60px; background:var(--paper); color:var(--ink);
  font:15px/1.65 -apple-system,"PingFang SC",system-ui,sans-serif; }
main { max-width:860px; margin:0 auto }
h1 { font-size:19px; margin:0 0 4px }
.sub { color:var(--muted); font-size:13px; margin:0 0 22px }
.card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:18px; margin-bottom:16px }
.card h2 { font-size:15px; margin:0 0 10px }
.row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:12px }
.note { color:var(--muted); font-size:13px }
.state { font-size:14px; margin:0 0 10px }
.state.on { color:#1d6b3f } .state.off { color:var(--muted) }
.banner { background:#fff4e6; border:1px solid #f0c48a; color:#7a4b12; border-radius:10px;
  padding:10px 14px; margin-bottom:16px; font-size:13px }
input[type=password],input[type=text] { border:1px solid var(--line); border-radius:8px;
  padding:9px 11px; font-size:14px; min-width:0; flex:1 }
button { border:0; border-radius:8px; padding:9px 15px; font-size:14px; cursor:pointer;
  background:var(--ink); color:#fff }
button.ghost { background:#fff; color:var(--ink); border:1px solid var(--line) }
button.danger { background:#fff; color:var(--clay); border:1px solid var(--clay) }
button:disabled { opacity:.45; cursor:default }
.err { color:var(--clay); font-size:13px; margin-top:10px; min-height:18px }
.err.ok { color:#1d6b3f }
.thumb { width:96px; height:96px; object-fit:cover; border-radius:8px; border:1px solid var(--line); display:block }
.big { width:100%; max-height:320px; object-fit:contain; border-radius:8px; border:1px solid var(--line);
  background:#faf9f6; margin-top:10px }
.hist { border-top:1px solid var(--line); margin-top:16px; padding-top:12px }
.hitem { display:flex; gap:12px; align-items:center; padding:9px 0; border-bottom:1px solid #f1efe9 }
.hitem .meta { flex:1; min-width:0; font-size:13px }
.hitem .meta b { font-weight:600 }
.swatches { display:flex; gap:10px; margin-top:10px }
.swatch { border:1px solid var(--line); border-radius:10px; padding:8px; background:#fff; cursor:pointer;
  text-align:center; font-size:12px; color:var(--muted) }
.swatch.cur { border-color:var(--ink); box-shadow:0 0 0 2px rgba(20,22,26,.08) }
.swatch img { width:72px; height:72px; object-fit:cover; border-radius:6px; display:block }
/* 文案那一栏：一行一句，所以给的是 textarea 而不是输入框。字号与正文同档，
   行高留宽一点是为了数得清句子。 */
textarea.ta { width:100%; box-sizing:border-box; border:1px solid var(--line); border-radius:8px;
  padding:9px 11px; font-size:14px; line-height:1.7; font-family:inherit; min-height:120px;
  resize:vertical; margin-top:8px }
.langlabel { font-size:12.5px; color:var(--muted); margin-top:12px }
.hidden { display:none }
.grp { font-size:11px; color:#a2a49c; letter-spacing:.08em; margin:14px 0 4px }
/* 壳页那一层（方向图 docs/design/后台融合-方向图-20261015.html 的 A 版信息架构）：
   顶栏一枚产品切换 → 左栏「数据／配置」两组 → 主区一屏只放一组。
   选中态是"文字加粗＋左边走一条墨线"，不是按钮：整页只有主按钮一种实心块，别处不再长第二套皮。 */
.top { display:flex; gap:16px; align-items:flex-start; justify-content:space-between;
  border-bottom:1px solid var(--line); padding-bottom:14px; margin-bottom:20px }
.sw { display:flex; gap:0; border:1px solid var(--line); border-radius:9px; overflow:hidden;
  background:#fff; flex:none }
.sw b { font-weight:500; font-size:13px; padding:7px 13px; color:var(--muted); white-space:nowrap }
.sw b.on { background:var(--ink); color:#fff; font-weight:600 }
.sw b { cursor:pointer }
/* 图麦克那一屏嵌的是它自己那一页（站长 10-16 拍「用 frame 模式实现图麦克的原页面」）。
   它那套皮按 1200 排，我们这一栏只有 704，所以那一屏要把整页放宽一档。 */
main.wide { max-width:1180px }
.frame { display:block; width:100%; height:calc(100vh - 150px); min-height:560px;
  border:1px solid var(--line); border-radius:12px; background:#fff }
.swnote { font-size:12px; color:var(--muted); margin:6px 0 0; text-align:right; max-width:280px }
.shell { display:flex; gap:24px; align-items:flex-start }
nav#nav { width:132px; flex:none; font-size:13px; color:var(--muted); position:sticky; top:20px }
nav#nav s { display:block; text-decoration:none; padding:6px 0 6px 11px; margin:1px 0;
  border-left:2px solid transparent; cursor:pointer; color:var(--ink) }
nav#nav s:hover { color:var(--clay) }
nav#nav s.on { border-left-color:var(--ink); font-weight:600 }
#main { flex:1; min-width:0 }
@media (max-width:720px) {
  body { padding:20px 14px 48px }
  .top { display:block } .swnote { text-align:left; max-width:none }
  .shell { display:block }
  nav#nav { width:auto; position:static; display:flex; flex-wrap:wrap; gap:2px 14px; margin-bottom:16px }
  nav#nav i { width:100% } nav#nav s { border-left:0; padding:4px 0; border-bottom:2px solid transparent }
  nav#nav s.on { border-left:0; border-bottom-color:var(--ink) }
}
/* 「数据」那一栏：数在左、口径在右，一行一条。数字统一右对齐 + 等宽数字，
   不然竖着看三行"12 / 1,204 / 7"会以为最后一行最大。 */
.krow { display:flex; gap:12px; align-items:baseline; padding:9px 0; border-bottom:1px solid #f1efe9 }
.krow:last-child { border-bottom:0 }
.knum { font-size:20px; font-weight:600; min-width:76px; text-align:right;
  font-variant-numeric:tabular-nums }
.kmeta { flex:1; min-width:0 }
table.dt { width:100%; border-collapse:collapse; font-size:13px; margin-top:10px }
table.dt th, table.dt td { text-align:right; padding:6px 4px; border-bottom:1px solid #f1efe9;
  font-variant-numeric:tabular-nums }
table.dt th { color:var(--muted); font-weight:500; font-size:12px }
table.dt th:first-child, table.dt td:first-child { text-align:left }
button.mini { padding:5px 11px; font-size:13px; background:#fff; color:var(--ink);
  border:1px solid var(--line) }
button.mini.cur { background:var(--ink); color:#fff; border-color:var(--ink) }
/* 「卡片模板」那一栏：一行一套，代号与状态在上，四个可改字段排成一排，配方只读折叠。
   输入框比配置那一栏矮一档，是因为一屏要放十套，不是把它当次要内容。 */
.tplhead { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap }
.tplhead code { font:13px/1.5 ui-monospace,Menlo,monospace; color:var(--ink) }
.tag { font-size:12px; padding:2px 8px; border-radius:999px; border:1px solid var(--line); color:var(--muted) }
.tag.live { color:#1d6b3f; border-color:#bcd8c4 }
.tag.draft { color:var(--clay); border-color:#f0c48a }
.fields { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px }
.fields label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted); flex:1; min-width:120px }
.fields label.w2 { flex:2; min-width:180px }
.fields input { border:1px solid var(--line); border-radius:8px; padding:8px 10px; font-size:14px;
  color:var(--ink); background:#fff; min-width:0; width:100% }
details.rec { margin-top:12px; border-top:1px solid var(--line); padding-top:10px }
details.rec summary { font-size:12.5px; color:var(--muted); cursor:pointer }
details.rec pre { margin:8px 0 0; padding:10px; background:#faf9f6; border:1px solid var(--line);
  border-radius:8px; font:12px/1.6 ui-monospace,Menlo,monospace; white-space:pre-wrap; word-break:break-all;
  max-height:260px; overflow:auto }
footer { color:var(--muted); font-size:12.5px; margin-top:24px; line-height:1.7 }
</style>
</head>
<body>
<main>
  <header class="top">
    <div>
      <h1>运营后台</h1>
      <p class="sub">左边切「数据」与「配置」两栏，这两栏只看运营内容本身，看不到任何用户的笔记与图片；图麦克那一屏是它自己的后台，看得到它自己的用户。</p>
    </div>
    <div>
      <div class="sw"><b class="on" id="swSelf">图麦笔记</b><b id="swOther">图麦克</b></div>
      <p class="swnote" id="swNote"></p>
    </div>
  </header>

  <div id="frozen" class="banner hidden"></div>

  <section id="login" class="card">
    <h2>管理口令</h2>
    <div class="row">
      <input id="pw" type="password" placeholder="输入 .env 里的 ADMIN_TOKEN" autocomplete="off">
      <button id="btnLogin">登录</button>
    </div>
    <div id="loginErr" class="err"></div>
    <p class="note">口令只存在这个标签页里（sessionStorage），关掉页面就没了；服务器换过口令后旧登录会立刻失效。</p>
  </section>

  <div id="app" class="hidden shell">
    <nav id="nav"></nav>
    <div id="main">
      <div id="view-stats" class="view"><div id="stats"></div></div>
      <div id="view-config" class="view hidden"><div id="kinds"></div><div id="texts"></div></div>
      <div id="view-tpl" class="view hidden"><div id="tpls"></div></div>
      <div id="view-tumaike" class="view hidden"><iframe id="frameOther" class="frame" title="图麦克后台" src="about:blank"></iframe></div>
      <footer>
        <div>换完之后：线上小程序要<strong>退出重进（冷启）</strong>才看到新图，正在用的用户不会当场被换。</div>
        <div>提醒：换一张明暗和原图差很多的，会把首页那几行字的对比度带偏——第一屏的字色是按壁纸档派生的，
        运营图不在这条派生链里。发布后请在真机上看一眼那一屏。</div>
        <div>文案那一栏同理：改了要等用户下一次冷启（拉到新那份之后）才轮得到，正在看的那一句不会当场跳。</div>
        <div>「卡片模板」那一栏改的是名单与叫法（哪几套在发、叫什么、排第几、要哪个包才给），画面本身在这里改不了。</div>
        <div>「数据」这一栏读的是业务库里的行数，现点现算；没有新增任何用户行为埋点。</div>
      </footer>
    </div>
  </div>
</main>
<script>
'use strict';
// 相对当前目录：浏览器地址可能带 nginx 的 /wtsj/ 前缀，后端注册的路径不带，这一句让两种访问方式都对。
var ROOT = location.pathname.replace(/[^/]*$/, '');
function u(p) { return ROOT + String(p).replace(/^\\//, ''); }
function session() { return sessionStorage.getItem('opsSession') || ''; }

function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  // 全页只有这一个造节点的路子，且只吃 textContent：note 是操作者手打的，不许变成 HTML。
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

function api(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers || {});
  if (session()) opts.headers['Authorization'] = 'Bearer ' + session();
  return fetch(u(path), opts).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (body) {
      if (r.status === 401) { sessionStorage.removeItem('opsSession'); showLogin(); }
      if (!r.ok) { var e = new Error(body.detail || ('HTTP ' + r.status)); e.status = r.status; throw e; }
      return body;
    });
  });
}

function showLogin() { $('app').classList.add('hidden'); $('login').classList.remove('hidden'); }
function showApp() { $('login').classList.add('hidden'); $('app').classList.remove('hidden'); }
function $(id) { return document.getElementById(id); }

// 左栏那两组：**一屏只放一组**（站长 10-15 17:5x「数据分析和配置要分开」，结构照方向图 A 版）。
// key 指向主区里那张卡的 data-key；点一条＝切到那一屏再滚到那张卡。
var NAV = [
  { grp: '数据', items: [
    { label: '总览', view: 'stats', key: 'overview' },
    { label: '逐日', view: 'stats', key: 'perday' },
    { label: '来源分布', view: 'stats', key: 'sources' },
    { label: '模板热度', view: 'stats', key: 'templates' },
    { label: '邀请对账', view: 'stats', key: 'invites' },
    { label: '分享', view: 'stats', key: 'shares' }
  ] },
  { grp: '配置', items: [
    { label: '运营图', view: 'config', key: 'kind:home_bg' },
    { label: '首屏 Tips', view: 'config', key: 'text:tips' },
    { label: '卡片模板', view: 'tpl', key: 'tpl:list' }
  ] }
];

function showView(v) {
  ['stats', 'config', 'tpl', 'tumaike'].forEach(function (name) {
    $('view-' + name).classList.toggle('hidden', v !== name);
  });
}

function markNav(key) {
  var all = $('nav').querySelectorAll('s');
  for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i].dataset.key === key);
}

function buildNav() {
  var nav = $('nav');
  while (nav.firstChild) nav.removeChild(nav.firstChild);
  NAV.forEach(function (g) {
    nav.appendChild(el('i', 'grp', g.grp));
    g.items.forEach(function (it) {
      var s = el('s', null, it.label);
      s.dataset.key = it.key;
      s.addEventListener('click', function () {
        setProduct('self');
        showView(it.view);
        var target = document.querySelector('[data-key="' + it.key + '"]');
        if (target) target.scrollIntoView({ block: 'start' });
        markNav(it.key);
      });
      nav.appendChild(s);
    });
  });
  markNav(NAV[0].items[0].key);
  showView('stats');
}

$('btnLogin').addEventListener('click', function () {
  $('loginErr').textContent = '';
  api('api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: $('pw').value })
  }).then(function (body) {
    sessionStorage.setItem('opsSession', body.session);
    $('pw').value = '';
    return refresh();
  }, function (e) { $('loginErr').textContent = e.message; });
});
$('pw').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') $('btnLogin').click(); });

function fmtBytes(n) { return n >= 1024 ? (Math.round(n / 102.4) / 10) + ' KB' : n + ' B'; }
function shortHash(h) { return String(h || '').slice(0, 8); }
function dayOf(iso) { return String(iso || '').slice(0, 10); }

// 图片地址：接口回的是给小程序拼 BASE 用的根相对路径，这一页改成相对当前目录。
function imgUrl(asset) { return asset ? u(asset.url) : ''; }

function imageBox(asset, cls) {
  var img = el('img', cls);
  img.alt = '';
  img.src = imgUrl(asset);
  return img;
}

function render(state) {
  $('frozen').classList.toggle('hidden', !state.frozen);
  if (state.frozen) {
    $('frozen').textContent = '下发已冻结（MP_ASSETS_FREEZE=1）：现在怎么改都不影响线上，解冻后生效。';
  }
  var box = $('kinds');
  while (box.firstChild) box.removeChild(box.firstChild);
  state.kinds.forEach(function (k) { box.appendChild(cardFor(k)); });
  // 文案栏与图片栏分开两组渲染（后端也是两套 kind 闭集）。`|| []` 不是防呆，是防"新页配旧后端"
  // 那一刻的空回体：这一页是静态 HTML、后端可能还在滚更新，红了整页打不开比少一组卡更糟。
  var tbox = $('texts');
  while (tbox.firstChild) tbox.removeChild(tbox.firstChild);
  (state.texts || []).forEach(function (t) { tbox.appendChild(textCardFor(t)); });
}

// 一行一句 ⇒ 一句一串。空行丢掉：手打的时候都会留个尾换行，那不该变成一句空文案
// （服务端也会再 strip 一道，两处口径一致：空句不是"一句话"，是"没写"）。
function linesOf(v) {
  return String(v || '').split('\\n').map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });
}

function textCardFor(t) {
  var card = el('section', 'card');
  card.dataset.key = 'text:' + t.kind;
  card.appendChild(el('h2', null, t.label));

  var cur = t.current;
  if (!t.registered) {
    card.appendChild(el('p', 'state off', '这台后台还没登记过这一栏（小程序用包里那一份）。'));
  } else if (!cur) {
    card.appendChild(el('p', 'state off', '当前停用：小程序用包里那六句。'));
  } else {
    card.appendChild(el('p', 'state on', '当前生效：中文 ' + (cur.zh || []).length + ' 句／英文 ' +
      (cur.en || []).length + ' 句。'));
  }
  card.appendChild(el('p', 'note',
    '一行一句，最多 ' + t.max_items + ' 句、每句 ' + t.max_chars + ' 字（超了整份退回，不收半份——' +
    '这一行是按顺序轮播的，丢一句就变成"少一句且没人知道少了哪句"）。两份语言都要填，' +
    '少一份切过去那一门会读到空、那一行整条消失。'));

  var areas = {};
  (t.langs || ['zh', 'en']).forEach(function (lang) {
    card.appendChild(el('div', 'langlabel', lang === 'zh' ? '中文' : 'English'));
    var ta = document.createElement('textarea');
    ta.className = 'ta';
    // 现值走 .value 赋值，绝不用拼字符串造节点：这一页的硬纪律是"任何动态串都不当 HTML 拼"
    // （tests/test_mp_assets_admin.py 里那条静态扫描就是在钉这件事，它扫的就是那几个属性名）。
    ta.value = ((cur || {})[lang] || []).join('\\n');
    areas[lang] = ta;
    card.appendChild(ta);
  });

  var msg = el('div', 'err');
  card.appendChild(msg);
  var row = el('div', 'row');
  var btnPub = el('button', null, '发布这一份');
  var btnOff = el('button', 'danger', '停用，回到包里那份');
  row.appendChild(btnPub); row.appendChild(btnOff);
  card.appendChild(row);

  btnPub.addEventListener('click', function () {
    var value = {};
    Object.keys(areas).forEach(function (lang) { value[lang] = linesOf(areas[lang].value); });
    putText(t.kind, value, msg, function () { return refresh(); });
  });
  btnOff.addEventListener('click', function () { putText(t.kind, null, msg, function () { return refresh(); }); });
  return card;
}

function cardFor(k) {
  var card = el('section', 'card');
  card.dataset.key = 'kind:' + k.kind;
  card.appendChild(el('h2', null, k.label));

  var st;
  if (!k.registered) {
    st = el('p', 'state off', '这台后台还没登记过这一栏（小程序正在用包里那一张）。');
  } else if (!k.current) {
    st = el('p', 'state off', '当前停用：小程序用包里那一张。');
  } else {
    var c = k.current;
    st = el('p', 'state on', '当前生效：#' + c.id + '　' + c.width + '×' + c.height +
      '　' + fmtBytes(c.file_size) + '　' + shortHash(c.content_hash) + '　上传于 ' + dayOf(c.created_at));
  }
  card.appendChild(st);

  // 预览那一格：进来时显示当前生效的那张，上传成功后换成刚传上来的那一张。
  // 这一格是"发布之前先看一眼"的地方——方案 §五.3 那条风险提示（换明暗差很多的图会带偏
  // 首页那几行字的对比度）只能靠这一眼看住，服务端算不出来。
  var prev = el('img', 'big hidden');
  prev.alt = '';
  card.appendChild(prev);
  if (k.current) { prev.src = imgUrl(k.current); prev.classList.remove('hidden'); }

  var up = el('div', 'row');
  var file = document.createElement('input');
  file.type = 'file'; file.accept = 'image/jpeg,image/png';
  var note = el('input', null);
  note.type = 'text'; note.placeholder = '备注（可选，历史里显示）';
  var btnUp = el('button', 'ghost', '上传');
  var btnPub = el('button', null, '发布这一张');
  var btnOff = el('button', 'danger', '停用');
  btnOff.disabled = !k.current;
  btnPub.disabled = true;
  up.appendChild(file); up.appendChild(note); up.appendChild(btnUp);
  card.appendChild(up);
  var msg = el('div', 'err');
  card.appendChild(msg);
  var acts = el('div', 'row');
  acts.appendChild(btnPub);
  acts.appendChild(btnOff);
  card.appendChild(acts);

  btnUp.addEventListener('click', function () {
    msg.textContent = '';
    var f = file.files && file.files[0];
    if (!f) { msg.textContent = '先选一张 JPG 或 PNG'; return; }
    var fd = new FormData();
    fd.append('kind', k.kind);
    fd.append('note', note.value);
    fd.append('file', f);
    btnUp.disabled = true;
    api('api/admin/mp/assets', { method: 'POST', body: fd }).then(function (asset) {
      btnPub.disabled = false;
      btnPub.assetId = asset.id;
      prev.src = u(asset.url);
      prev.classList.remove('hidden');
      msg.className = 'note';
      msg.textContent = '已存到服务器上：#' + asset.id + '　' + asset.width + '×' + asset.height +
        '　' + fmtBytes(asset.file_size) + '。上面这张就是它，还没动线上——看一眼再点「发布这一张」。';
    }, function (e) { msg.textContent = e.message; }).then(function () { btnUp.disabled = false; });
  });

  btnPub.addEventListener('click', function () {
    if (!btnPub.assetId) return;
    put(k.kind, btnPub.assetId, msg, function () { return refresh(); });
  });
  btnOff.addEventListener('click', function () { put(k.kind, null, msg, function () { return refresh(); }); });

  if (k.history.length) {
    var h = el('div', 'hist');
    h.appendChild(el('p', 'note', '历史（点一张就把它发出去，也就是"回滚到那一张"；' + k.history.length + ' 条以内）'));
    var sw = el('div', 'swatches');
    k.history.forEach(function (a) {
      var one = el('div', 'swatch' + (k.current && k.current.id === a.id ? ' cur' : ''), null);
      one.appendChild(imageBox(a, null));
      one.appendChild(el('div', null, '#' + a.id));
      one.appendChild(el('div', null, dayOf(a.created_at)));
      one.appendChild(el('div', null, a.note || shortHash(a.content_hash)));
      one.addEventListener('click', function () {
        if (k.current && k.current.id === a.id) return;
        put(k.kind, a.id, msg, function () { return refresh(); });
      });
      sw.appendChild(one);
    });
    h.appendChild(sw);
    card.appendChild(h);
  }
  return card;
}

function put(kind, assetId, msg, done) {
  msg.textContent = '';
  api('api/admin/mp/settings/' + encodeURIComponent(kind), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset_id: assetId })
  }).then(function () { return done && done(); }, function (e) { msg.textContent = e.message; });
}

// 与上面那个 put 同形状、不同口（图片改 asset_id，文案改 value）。
// 分开写而不是给 put 加一个参数：那参数会变成"这一栏到底是图还是话"的第三处猜测。
function putText(kind, value, msg, done) {
  msg.textContent = '';
  api('api/admin/mp/texts/' + encodeURIComponent(kind), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: value })
  }).then(function () { return done && done(); }, function (e) { msg.textContent = e.message; });
}

// ---- 「卡片模板」那一栏（方案 docs/方案-cn后台资产管理.md 的 P1，站长 10-15「先补笔记模板管理界面」）。
// 这一栏只改四样元数据＋上下架。配方（就是"画面长什么样"那份 JSON）**只给看，不给改**——
// 在线编辑配方是 P2，是唯一一个"不发版就能改用户看到的画"的口子，它没被拍开，所以界面上
// 连一个能输入配方的地方都不许出现：有落点就有人会去点它。
var TPL_STATUS_LABEL = { live: '线上', draft: '草稿（不下发）', archived: '已下架' };

function fieldInt(labelText, cls, value) {
  var lab = el('label', cls);
  lab.appendChild(el('span', null, labelText));
  var inp = document.createElement('input');
  inp.type = 'text';
  inp.value = String(value === null || value === undefined ? '' : value);
  lab.appendChild(inp);
  return { lab: lab, inp: inp };
}

function tplCard(r) {
  var card = el('section', 'card');
  card.dataset.id = r.id;  // 重读之后还要找得到这一行（回执要落在它身上，见 loadTemplates 的 flash）
  var head = el('div', 'tplhead');
  head.appendChild(el('code', null, r.template_id));
  head.appendChild(el('span', 'tag ' + r.status, TPL_STATUS_LABEL[r.status] || r.status));
  head.appendChild(el('span', 'note', '分组 ' + r.group_key + '　hash ' + shortHash(r.content_hash)));
  card.appendChild(head);

  card.appendChild(el('p', 'state ' + (r.status === 'live' ? 'on' : 'off'),
    r.status === 'live' ? '在线上：用户那道口能拿到这一套。'
      : (r.status === 'draft' ? '草稿：不下发，只有本地拿真机验的人看得见。' : '已下架：不再下发，但记录还在（历史行不许删）。')));
  card.appendChild(el('p', 'note', '出图 ' + r.used + ' 张　其中当前挂着 ' + r.used_current + ' 张　' +
    '改完要等客户端下一次冷启才换；' + (r.updated_at ? '上次改动 ' + dayOf(r.updated_at) + '。' : '今天还没改过。')));

  var fZh = fieldInt('中文名', 'w2', r.label);
  var fEn = fieldInt('英文名', 'w2', r.label_en);
  var fSort = fieldInt('排序（小的在前）', null, r.sort_order);
  var fVer = fieldInt('最低包版本', null, r.min_app_version);
  var fields = el('div', 'fields');
  fields.appendChild(fZh.lab); fields.appendChild(fEn.lab);
  fields.appendChild(fSort.lab); fields.appendChild(fVer.lab);
  card.appendChild(fields);

  var msg = el('div', 'err');
  card.appendChild(msg);
  var row = el('div', 'row');
  var btnSave = el('button', null, '保存这几项');
  var btnSt = el('button', r.status === 'live' ? 'danger' : 'ghost', r.status === 'live' ? '下架这一版' : '上架这一版');
  row.appendChild(btnSave); row.appendChild(btnSt);
  card.appendChild(row);

  // 只送"跟刚读出来的不一样"的那几项：全量回写会把没碰过的字段也重新判一遍，
  // 报回来的错就不是"我改错了"而是"我没改的那格错了"。
  btnSave.addEventListener('click', function () {
    msg.textContent = ''; msg.className = 'err';
    var body = {};
    if (fZh.inp.value !== String(r.label)) body.label = fZh.inp.value;
    if (fEn.inp.value !== String(r.label_en)) body.label_en = fEn.inp.value;
    if (fSort.inp.value !== String(r.sort_order)) body.sort_order = fSort.inp.value;
    if (fVer.inp.value !== String(r.min_app_version)) body.min_app_version = fVer.inp.value;
    if (!Object.keys(body).length) { msg.textContent = '这一行一个字都没改。'; return; }
    btnSave.disabled = true; btnSt.disabled = true;
    api('api/admin/poster/templates/' + r.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function () {
      return loadTemplates({ id: r.id, text: '已写入。用户那道口下一次冷启读到的是这一版。' });
    }, function (e) { msg.textContent = e.message; })
      .then(function () { btnSave.disabled = false; btnSt.disabled = false; });
  });
  btnSt.addEventListener('click', function () {
    msg.textContent = '';
    var to = r.status === 'live' ? 'archived' : 'live';
    btnSt.disabled = true;
    api('api/admin/poster/templates/' + r.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: to })
    }).then(function () {
      return loadTemplates({ id: r.id, text: to === 'live'
        ? '已上架：用户那道口下一次冷启能选到它。'
        : '已下架：不再下发，记录还在。' });
    },
      // 被挡下（同一套已经有一版在线上）时**只报错、不重读**：400 意味着库里一个字没动，
      // 屏上那份还是真的；而重读会把卡片连同这句"为什么没成"一起重建掉——
      // 症状是"点下架没反应，也没说为什么"。（本机 10-15 真点撞出来过。）
      function (e) { msg.textContent = e.message; btnSt.disabled = false; });
  });

  var rec = el('details', 'rec');
  rec.appendChild(el('summary', null, '配方（只读，' + ((r.recipe && r.recipe.steps) || []).length + ' 步）'));
  rec.appendChild(el('pre', null, JSON.stringify(r.recipe, null, 1)));
  card.appendChild(rec);
  return card;
}

function renderTemplates(d, flash) {
  var box = $('tpls');
  while (box.firstChild) box.removeChild(box.firstChild);

  var c = d.counts || {};
  var sum = statCard('线上几套', '这一栏改的是"哪几套卡片在被下发、叫什么、排第几、要哪个包才给"。' +
    '改完落库即生效于下发口那个回体，但正在用的用户要等下一次冷启。');
  sum.dataset.key = 'tpl:list';
  knum(sum, numOf(c.live), '线上', '客户端「卡片模板」那一页能选到的套数');
  knum(sum, numOf(c.draft), '草稿', '不进下发口，改的人本地验');
  knum(sum, numOf(c.archived), '已下架', '不再下发，记录留着（老包拿过的那份要一直收得住）');
  box.appendChild(sum);

  (d.rows || []).forEach(function (r) { box.appendChild(tplCard(r)); });
  if (!(d.rows || []).length) box.appendChild(el('p', 'note', '库里一行模板都没有（闸没开或种子没灌）。'));

  // 回执落在**重读之后那一行**上：卡片是刚重建的，写进旧节点等于没写
  // （本机 10-15 真点出来过——保存成功了屏上却一个字没变，只剩顺序自己动了）。
  if (flash) {
    var hit = box.querySelector('.card[data-id="' + flash.id + '"]');
    if (hit) {
      var m = hit.querySelector('.err');
      m.classList.add('ok');  // 类名只加不换：这一格的标识要是被换掉，页面上"上一句成了还是砸了"就没处找了
      m.textContent = flash.text;
    }
  }
}

function loadTemplates(flash) {
  return api('api/admin/poster/templates').then(function (d) {
    renderTemplates(d, flash);
  }, function (e) {
    if (e.status === 401) return;
    var box = $('tpls');
    while (box.firstChild) box.removeChild(box.firstChild);
    box.appendChild(el('p', 'note', '这一栏没读到：' + e.message));
  });
}

// ---- 「数据」那一栏（方案 docs/方案-cn后台融合.md §3；口径正本在 docs/规格-后台数据分析这一栏.md）。
// 只读：这一排按钮一个写口都不碰。每个数后面那句"这是什么数"不是装饰——
// 少了它，"累计 1,204" 会被读成"新增 1,204"，而这一栏最容易卖出去的就是那种假数。
var statsDays = 14;
var SOURCE_LABELS = {
  wechat_article: '公众号文章', web_article: '网页文章', screenshot: '截图识别',
  manual: '亲自撰写', share_import: '转存自分享', preset: '官方预置'
};
var TPL_HINT = '卡片记录时写下的模板代号，原样显示（这里不另起一套名字，免得和下发那套长歪）';

function numOf(v) { return (v === null || v === undefined) ? '—' : String(v); }

function statCard(title, sub) {
  var c = el('section', 'card');
  c.appendChild(el('h2', null, title));
  if (sub) c.appendChild(el('p', 'note', sub));
  return c;
}

// 一行：左边那个数，右边"叫什么 + 从哪来"。
function knum(parent, value, label, hint) {
  var row = el('div', 'krow');
  row.appendChild(el('b', 'knum', value));
  var meta = el('div', 'kmeta');
  meta.appendChild(el('div', null, label));
  if (hint) meta.appendChild(el('div', 'note', hint));
  row.appendChild(meta);
  parent.appendChild(row);
}

function tableOf(parent, head, rows) {
  var t = el('table', 'dt');
  var htr = el('tr');
  head.forEach(function (h) { htr.appendChild(el('th', null, h)); });
  var thead = el('thead');
  thead.appendChild(htr);
  t.appendChild(thead);
  var tb = el('tbody');
  rows.forEach(function (r) {
    var tr = el('tr');
    r.forEach(function (cell) { tr.appendChild(el('td', null, cell)); });
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  parent.appendChild(t);
}

function renderStats(d) {
  var box = $('stats');
  while (box.firstChild) box.removeChild(box.firstChild);

  var src = '现点现算，读的是业务库那五张表（笔记／账号／卡片／邀请／分享），不是行为埋点。';
  var t = d.totals || {};
  var per = d.per_day || [];
  var winNotes = 0, winAccounts = 0;
  per.forEach(function (r) { winNotes += r.notes || 0; winAccounts += r.accounts || 0; });

  var c1 = statCard('总量与这一段时间', '日期按 ' + (d.tz || 'UTC') + ' 分桶——与小程序里那串日期同一套日子，这一页不擅自换算成北京时间。' + src);
  var days = el('div', 'row');
  [7, 14, 30].forEach(function (v) {
    var b = el('button', 'mini' + (v === statsDays ? ' cur' : ''), v + ' 天');
    b.addEventListener('click', function () { if (v !== statsDays) { statsDays = v; loadStats(); } });
    days.appendChild(b);
  });
  c1.appendChild(days);
  knum(c1, numOf(winNotes), '这 ' + d.window_days + ' 天的新增笔记', '已剔除官方预置那一篇，所以它是"真的有人记了东西"');
  knum(c1, numOf(winAccounts), '这 ' + d.window_days + ' 天的新账号', '注册落在 users 表的行，不含注销');
  knum(c1, numOf(t.notes), '累计笔记', '同样剔除预置；库里现存 ' + numOf(t.preset_notes_excluded) + ' 篇预置没算进来');
  knum(c1, numOf(t.accounts), '累计账号', '一个账号一行，不认设备');
  box.appendChild(c1);

  var c2 = statCard('逐日', '缺的那一天补 0，所以"三天没数"和"那三天没人来"在这张表上是两回事。');
  tableOf(c2, ['日期', '新增笔记', '转存', '新账号'], per.map(function (r) {
    return [r.date, numOf(r.notes), numOf(r.imports), numOf(r.accounts)];
  }));
  box.appendChild(c2);

  var c3 = statCard('来源分布', '分得开"公众号文章"与"网页文章"是这一栏有用与否的关键；转存那一支是别人把某一篇存进他自己的库。');
  tableOf(c3, ['来源', '篇数'], (d.sources || []).map(function (s) {
    return [SOURCE_LABELS[s.source_type] || s.source_type, numOf(s.count)];
  }));
  box.appendChild(c3);

  var c4 = statCard('模板热度榜', '"当前在用"只数每张笔记现在挂着的那一版；全量那一列含历史版本，所以它是"被试过"而不是"在被用"。' + TPL_HINT + '。');
  tableOf(c4, ['模板', '出图总数', '当前在用', '不带码'], (d.templates || []).map(function (x) {
    return [x.tpl, numOf(x.total), numOf(x.current), numOf(x.without_qr)];
  }));
  box.appendChild(c4);

  var iv = d.invitations || {};
  var c5 = statCard('邀请对账', '两个数一起给，这一页不替你判等：台账发的奖励与账号里持有的加成今天应当相等，不等说明有一笔走到了别的路上——但"差多少算异常"没有公开标准。');
  knum(c5, numOf(iv.invitations), '邀请记录条数', 'invitations 表');
  knum(c5, numOf(iv.rewards_granted), '台账发出的奖励合计', '按 invitations 里那条 reward 累加');
  knum(c5, numOf(iv.quota_bonus_held), '账号侧持有合计', 'users.quota_bonus 之和');
  box.appendChild(c5);

  var sh = d.shares || {};
  var c6 = statCard('分享', '活着的张数由那个"公开／不公开"开关说话（撤回置 0），不按有效期现算——过期还没清掉的一批在库里仍然是活着的行，两种数会打架。');
  knum(c6, numOf(sh.created), '建过的分享', '包含已撤回的');
  knum(c6, numOf(sh.active), '当前活着的', '只有这一部分能被扫码看到');
  box.appendChild(c6);

  // 左栏那六条要能各指到一张卡：按出场顺序挂 key，与 NAV 里那份名单一一对应。
  var keys = ['overview', 'perday', 'sources', 'templates', 'invites', 'shares'];
  var cards = box.querySelectorAll('.card');
  for (var i = 0; i < cards.length && i < keys.length; i++) cards[i].dataset.key = keys[i];
}

function loadStats() {
  return api('api/admin/stats/overview?days=' + statsDays).then(function (d) {
    renderStats(d);
  }, function (e) {
    // 401 那条由 api() 统一处理（把这一页收回口令框），这里只接其余的：
    // 红了不许整页空白——配置那一栏读到了就照常能用，方案里那句"少一组卡比整页打不开好"同理。
    if (e.status === 401) return;
    var box = $('stats');
    while (box.firstChild) box.removeChild(box.firstChild);
    box.appendChild(el('p', 'note', '这一栏没读到数：' + e.message));
  });
}

function refresh() {
  return api('api/admin/mp/state').then(function (state) {
    showApp();
    render(state);
    // 三屏各读各的口，互不牵连：统计或模板那一头红了，不许把配置那栏一起带走（两个函数自己吞错）。
    return Promise.all([loadStats(), loadTemplates()]);
  }, function (e) {
    if (e.status === 503) { $('login').classList.remove('hidden'); $('loginErr').textContent = e.message; }
  });
}

// 顶栏那枚产品切换。**站长 10-16 拍「用 frame 模式实现图麦克的原页面」**：点它不跳走，
// 而是在主区嵌一个 iframe 指它那一页。两边同源（都在 api.agentsbin.cn），它那一页开局读的就是
// 同源的存储，所以这一侧登过之后框里直接是它的 dashboard，不会再要第二次口令。
// src 只在第一次点的时候挂：不点就不去它那口上花一次请求。这一页仍不替它存任何凭证
// （本页硬纪律：只吃 sessionStorage，见 `test_mp_assets_admin` 里那条"不许出现另一种存储"的判据）。
function setProduct(which) {
  var other = which === 'other';
  $('swSelf').classList.toggle('on', !other);
  $('swOther').classList.toggle('on', other);
  document.querySelector('main').classList.toggle('wide', other);
  $('swNote').textContent = other
    ? '这一屏是图麦克自己的后台（嵌它那一页）。它那边的钱、用户与图片不流到我们这一侧来。'
    : '点上面那枚「图麦克」看它的后台——同一把口令，不用再输一次。';
}
$('swSelf').addEventListener('click', function () { setProduct('self'); showView('stats'); });
$('swOther').addEventListener('click', function () {
  if (!session()) { $('swNote').textContent = '先在这一侧登录（下面那个口令框），那一枚才换得到票。'; showLogin(); return; }
  var f = $('frameOther');
  if (!f.dataset.on) { f.src = '/admin.html'; f.dataset.on = '1'; }   // 绝对路径：走 u() 会被加上 /wtsj/ 前缀
  setProduct('other');
  showView('tumaike');
});
setProduct('self');
buildNav();

if (session()) refresh();
</script>
</body>
</html>"""


@router.get("/ops", response_class=HTMLResponse)
def ops_page():
    """那一页。本身不设凭证——口令是这一页要的东西，不是它保护的东西。

    没登录时打开它只能看到一个口令框：`/api/admin/*` 那四个口在没有管理 session 时一律 401，
    这一页也就一个字节的事实都读不到。`noindex` 是给搜索引擎的，`no-store` 是给浏览器的，
    两行都不要缓存这一页（缓存了就会出现"改了状态还在显示旧的"）。
    """
    return HTMLResponse(_PAGE, headers=_NO_STORE)
