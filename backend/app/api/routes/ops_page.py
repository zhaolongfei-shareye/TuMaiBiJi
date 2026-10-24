"""`GET /ops`：后台那一页本身，后端直接吐一份单页 HTML。

方案 §四 P0-a 第 5 条 + 站长 10-11 拍的 B 甲。先例是 `routes/landing.py:260-268`（后端早就在
直接发 HTML，只是那一页面向公众、这一页面向操作者）。选它而不是做进官网（B 乙）的理由：
一处部署、跟着 `backend/deploy.sh` 走、不用配 CORS、**口令不落在 nginx 静态目录里**。

这一页零构建：原生 HTML + 原生 JS，没有打包步骤、没有依赖、不引前端框架。它的全部数据都从
`/api/admin/*` 那七个口现取，页面本身不含任何服务端拼出来的用户内容——所以这里没有一处
需要 HTML 转义，也就没有"漏了一个 `_e()`"这种坑。JS 里同理：**动态字符串一律走
`textContent`，全页零 `innerHTML`**，因为历史那些 `note` 与密钥备注是操作者手打的，
谁也不知道他会粘什么进来。

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
<title>图麦笔记后台</title>
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
.hidden { display:none }
footer { color:var(--muted); font-size:12.5px; margin-top:24px; line-height:1.7 }
</style>
</head>
<body>
<main>
  <h1>图麦笔记后台</h1>
  <p class="sub">换小程序的默认背景图、改服务器上的凭据，都在这里，不用发版也不用重启服务。
  这里看不到任何用户的笔记与图片；密钥存进去之后只显示长度与指纹，原值页面读不回来。</p>

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

  <div id="app" class="hidden">
    <div id="kinds"></div>

    <section class="card">
      <h2>密钥配置</h2>
      <p class="note" id="secHint">库里这一行优先于服务器上的 <code>.env</code>；删掉一行，那个名字当场回到 <code>.env</code> 的值。</p>
      <div id="secList"></div>
      <div class="row">
        <input id="secName" type="text" placeholder="名字，例 DEEPSEEK_API_KEY">
        <input id="secValue" type="password" placeholder="粘贴密钥值（保存后清空，不回显）" autocomplete="off">
        <input id="secNote" type="text" placeholder="备注（可选，只显示这一次存的是哪一把）">
        <button id="btnSaveSec">保存</button>
      </div>
      <div id="secErr" class="err"></div>
    </section>

    <footer>
      <div><strong>换图之后</strong>：线上小程序要<strong>退出重进（冷启）</strong>才看到新图，正在用的用户不会当场被换。</div>
      <div><strong>改密钥之后</strong>：不用重启，下一次用到这个名字的请求就是新值（服务只按名字查库，没有缓存）。</div>
      <div>提醒：换一张明暗和原图差很多的，会把首页那几行字的对比度带偏——第一屏的字色是按壁纸档派生的，
      运营图不在这条派生链里。发布后请在真机上看一眼那一屏。</div>
    </footer>
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
// 密钥那一栏用这个，不用上面那个：接口回的是带 Z 的 UTC 串，`slice(0,10)` 切出来是 UTC 那一天。
// 实测（本机 00:45 存的一把）账上写的是"更新于 2026-10-24"，而他那边已经是 10-25——
// 刚存完就看到"昨天"，正是 `core/timefmt.py` 文件头那条老坑在这一页上的形状。
// 运营图那几栏仍用 `dayOf`：那是已经在他用的显示，改它得单独说一句。
function localDay(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso || '').slice(0, 10);
  var m = ('0' + (d.getMonth() + 1)).slice(-2), day = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day;
}

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
}

function cardFor(k) {
  var card = el('section', 'card');
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

// ---------------------------------------------------------------- 密钥配置
// 这一节只有一个口：`api/admin/secrets`。接口回体里根本没有 value 那一个字段，
// 所以这一侧不可能"忘了清"——原值从服务端就没出来过。
var SEC = 'api/admin/secrets';

function secSourceLine(it) {
  // 三句话分别管三件事：值从哪一层来、删了会去哪、这个名字今天有没有人读。
  // 第三句必须说：他存一个还没接上的名字时，页面不许装作"配好了"。
  var s = '生效值：库里这一行（删除后回到 .env）';
  if (!it.env_present) s = '生效值：库里这一行（.env 里没有这一行，删除后就没有值了）';
  if (!it.consumed) s += '　·　还没有代码读这个名字';
  return s;
}

function renderSecrets(items) {
  var box = $('secList');
  while (box.firstChild) box.removeChild(box.firstChild);
  if (!items.length) {
    box.appendChild(el('p', 'note', '库里现在一条都没有：下面那几个名字都还在用 .env 的值。'));
    return;
  }
  items.forEach(function (it) {
    var row = el('div', 'hitem');
    var meta = el('div', 'meta');
    meta.appendChild(el('b', null, it.name));
    meta.appendChild(el('div', null, '长度 ' + it.length + ' 字　指纹 ' + it.fingerprint +
      '　更新于 ' + localDay(it.updated_at)));
    meta.appendChild(el('div', null, it.note ? '备注：' + it.note : '（没写备注）'));
    meta.appendChild(el('div', null, secSourceLine(it)));
    row.appendChild(meta);
    var del = el('button', 'danger', '删除');
    del.addEventListener('click', function () { removeSecret(it); });
    row.appendChild(del);
    box.appendChild(row);
  });
}

function secMsg(cls, text) {
  var n = $('secErr');
  n.className = cls;
  n.textContent = text;
}

function removeSecret(it) {
  // 删除这一句必须写清楚"删掉之后值从哪来"：库里这一行是覆盖层，
  // 而 .env 里到底有没有同一个名字，只有服务端知道（`env_present`）。
  var q = '删除 ' + it.name + '？';
  q += it.env_present ? '删掉后这个名字回到 .env 的值。' : '删掉后这个名字就没有值了（.env 里没有这一行）。';
  if (!window.confirm(q)) return;
  secMsg('err', '');
  api(SEC + '/' + encodeURIComponent(it.name), { method: 'DELETE' })
    .then(function () { return refreshSecrets(); }, function (e) { secMsg('err', '删不掉：' + e.message); });
}

function saveSecret() {
  var name = $('secName').value.trim();
  var value = $('secValue').value;
  secMsg('err', '');
  if (!name) { secMsg('err', '先写名字，例 DEEPSEEK_API_KEY'); return; }
  if (!value) { secMsg('err', '再粘贴密钥值'); return; }
  // 先清空再发：这一句是"值不在 DOM 里过夜"的唯一防线，失败也不回填（重粘一次的成本
  // 换的是这一页刷新一次就什么都读不出来了）。
  $('secValue').value = '';
  $('btnSaveSec').disabled = true;
  api(SEC + '/' + encodeURIComponent(name), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: value, note: $('secNote').value })
  }).then(function (it) {
    $('secName').value = '';
    $('secNote').value = '';
    secMsg('note', '已存下：' + it.name + '　长度 ' + it.length + ' 字　指纹 ' + it.fingerprint +
      '（原值不再回显，只能重新粘贴覆盖）');
    return refreshSecrets();
  }, function (e) {
    secMsg('err', '存不下：' + e.message);
  }).then(function () { $('btnSaveSec').disabled = false; });
}

$('btnSaveSec').addEventListener('click', saveSecret);

function refreshSecrets() {
  return api(SEC).then(function (body) {
    renderSecrets(body.items);
  }, function (e) {
    // 这一句不能写成"一条都没有"：401/503 与真空表是两件事，写成一句会让人以为
    // 服务器上的密钥全没了（与运营图那一栏同一纪律）。
    $('secList').textContent = '';
    secMsg('err', '密钥那一份读不到：' + e.message);
  });
}

function refresh() {
  return api('api/admin/mp/state').then(function (state) {
    showApp();
    render(state);
    return refreshSecrets();
  }, function (e) {
    if (e.status === 503) { $('login').classList.remove('hidden'); $('loginErr').textContent = e.message; }
  });
}

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
