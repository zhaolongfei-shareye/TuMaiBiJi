// 11-07：把六稿配方用**产品真引擎**画成效果图板（卡片市场货架语言），自包含 HTML。
// 内嵌 miniprogram/utils 那十只引擎文件原文（CommonJS  shim + wx 替身），不另写一套画法：
// 板上每一格都是 planPoster(strict) → paintLayers 的真输出，改一个控件就重算重画。
// 跑法：node docs/工具/出-大图六稿效果图板.js
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '../..')
const U = (f) => path.join(ROOT, 'miniprogram/utils', f)
const OUT = path.join(ROOT, 'docs/design/11-07卡片市场大图六稿/board.html')

const MODULES = ['palette.js', 'date.js', 'i18n.js', 'sourceLabel.js', 'appInfo.js', 'safeStorage.js', 'api.js', 'mpAssets.js', 'posterRecipe.js', 'posterRecipes.js', 'poster.js']
const src = MODULES.map((f) => {
  const code = fs.readFileSync(U(f), 'utf8')
  return `define(${JSON.stringify(f)}, function(module, exports, require){\n${code}\n});`
}).join('\n')

const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/design/11-07卡片市场大图六稿/rows.json'), 'utf8'))
const b64 = (p) => fs.readFileSync(p).toString('base64')
const photo = 'data:image/jpeg;base64,' + b64('/tmp/cardref/photo.jpg')
const refs = ['pinterest', 'canva', 'vsco', 'day', 'letterboxd'].map((n) => ({
  n, src: 'data:image/jpeg;base64,' + b64(`/tmp/cardref/${n}.jpg`),
}))

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>卡片市场 · 大图六稿（真引擎渲染）</title>
<style>
  :root{
    --paper:#F2EFE9; --paper2:#E9E4DA; --ink:#14161A; --body:#3C4046; --muted:#8A8578;
    --clay:#D2683F; --amber:#F6C445; --magenta:#FF3D6E; --blue:#2B44FF; --mint:#00C7A9;
    --edge:#D8D2C6; --card:#FFFDF8;
  }
  *{box-sizing:border-box; margin:0; padding:0}
  html{scroll-behavior:smooth}
  body{
    background:
      radial-gradient(1200px 500px at 85% -10%, rgba(246,196,69,.20), transparent 60%),
      radial-gradient(900px 480px at -10% 30%, rgba(210,104,63,.14), transparent 60%),
      var(--paper);
    color:var(--ink);
    font:15px/1.65 -apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  }
  ::-webkit-scrollbar{width:10px;height:10px}
  ::-webkit-scrollbar-track{background:var(--paper2)}
  ::-webkit-scrollbar-thumb{background:var(--clay);border-radius:6px;border:2px solid var(--paper2)}
  ::-webkit-scrollbar-thumb:hover{background:var(--ink)}
  header{
    position:sticky; top:0; z-index:20; display:flex; align-items:center; gap:14px;
    padding:14px 26px; background:rgba(242,239,233,.92); backdrop-filter:blur(10px);
    border-bottom:2px solid var(--ink);
  }
  .mark{width:38px;height:38px;border-radius:10px;background:var(--ink);color:var(--amber);
    display:grid;place-items:center;font:700 22px/1 serif; flex:none}
  header h1{font:700 21px/1.2 serif; letter-spacing:.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  header > div{min-width:0}
  header{flex-wrap:wrap}
  header .sub{color:var(--muted); font-size:12.5px}
  .pill{margin-left:auto; flex:none; font-size:12px; font-weight:700; padding:6px 12px;
    border-radius:999px; background:var(--ink); color:var(--amber); white-space:nowrap}
  .pill.bad{background:var(--magenta); color:#fff}
  main{max-width:1280px; margin:0 auto; padding:26px 26px 70px}
  .kicker{font-size:12px; font-weight:700; letter-spacing:4px; color:var(--clay)}
  h2{font:700 26px/1.3 serif; margin:6px 0 4px}
  .lede{color:var(--body); max-width:760px; margin-bottom:18px}
  .shelf{display:flex; gap:16px; overflow-x:auto; padding:6px 4px 16px}
  .cell{flex:none; width:172px; background:var(--card); border:2px solid var(--edge);
    border-radius:14px; padding:8px 8px 10px; cursor:pointer; transition:transform .16s, border-color .16s, box-shadow .16s}
  .cell:hover{transform:translateY(-3px); box-shadow:0 10px 24px rgba(20,22,26,.14)}
  .cell.on{border-color:var(--ink); box-shadow:0 0 0 3px var(--amber), 0 12px 26px rgba(20,22,26,.18)}
  .cell canvas{width:152px; display:block; border-radius:8px; background:#fff}
  .cell .nm{font-weight:700; font-size:14px; margin-top:8px; display:flex; justify-content:space-between; align-items:baseline}
  .cell .nm em{font-style:normal; color:var(--muted); font-size:11px; font-weight:400}
  .cell .bw{color:var(--muted); font-size:11.5px; line-height:1.45; margin-top:2px; min-height:32px}
  .duo{display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:26px; margin-top:26px; align-items:start}
  .stage{background:var(--card); border:2px solid var(--ink); border-radius:18px; padding:22px;
    display:flex; gap:22px; align-items:flex-start; flex-wrap:wrap}
  .stage canvas{width:340px; max-width:100%; border-radius:10px; box-shadow:0 16px 40px rgba(20,22,26,.22); background:#fff}
  .stage .info{flex:1; min-width:240px}
  .stage h3{font:700 24px/1.3 serif}
  .stage .en{color:var(--muted); font-size:12px; letter-spacing:2px; text-transform:uppercase}
  .stage p{color:var(--body); margin:10px 0}
  .meta{display:flex; gap:8px; flex-wrap:wrap; margin:12px 0}
  .meta span{font:600 11.5px/1 ui-monospace,Menlo,monospace; background:var(--paper2); border:1px solid var(--edge);
    padding:6px 9px; border-radius:7px; color:var(--body)}
  .rail{position:sticky; top:76px; background:var(--ink); color:var(--paper); border-radius:18px; padding:18px}
  .rail h4{font:700 13px/1 sans-serif; letter-spacing:3px; color:var(--amber); margin-bottom:12px}
  .ctl{margin-bottom:12px}
  .ctl label{display:block; font-size:11.5px; color:rgba(242,239,233,.66); margin-bottom:5px; letter-spacing:1px}
  .ctl select{width:100%; padding:8px 10px; border-radius:9px; border:1px solid rgba(242,239,233,.28);
    background:#22242C; color:var(--paper); font-size:13px}
  .tgl{display:flex; align-items:center; gap:10px; cursor:pointer; user-select:none}
  .ctl label.tgl{display:flex; margin-bottom:0}
  .tgl .box{width:40px;height:22px;border-radius:999px;background:#3A3D46;position:relative;transition:background .15s;flex:none}
  .tgl .box::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--paper);transition:left .15s}
  .tgl input{display:none}
  .tgl input:checked + .box{background:var(--mint)}
  .tgl input:checked + .box::after{left:21px}
  .tgl span{font-size:13px}
  .btns{display:flex; gap:8px; margin-top:14px}
  button{flex:1; padding:10px 12px; border-radius:10px; border:2px solid var(--amber); background:var(--amber);
    color:var(--ink); font-weight:700; font-size:13px; cursor:pointer; transition:transform .12s, filter .12s}
  button:hover{filter:brightness(1.06); transform:translateY(-1px)}
  button.ghost{background:transparent; color:var(--paper); border-color:rgba(242,239,233,.4)}
  .refs{display:flex; gap:14px; overflow-x:auto; padding:8px 4px 16px}
  .refs figure{flex:none; width:150px}
  .refs img{width:150px; height:260px; object-fit:cover; object-position:top; border-radius:12px; border:2px solid var(--edge); display:block}
  .refs figcaption{font-size:11.5px; color:var(--body); margin-top:6px; line-height:1.45}
  .refs b{color:var(--ink)}
  footer{border-top:2px solid var(--ink); margin-top:34px; padding-top:14px; color:var(--muted); font-size:12.5px}
  footer code{background:var(--paper2); padding:1px 5px; border-radius:5px; color:var(--body)}
  .err{margin-top:10px; color:var(--magenta); font-weight:700; font-size:13px; white-space:pre-wrap}
  @media (max-width:560px){
    header .sub{display:none}
    header h1{font-size:17px}
    .pill{font-size:11px; padding:5px 9px}
    header{gap:10px}
  }
  @media (max-width:900px){
    .duo{grid-template-columns:1fr}
    .rail{position:static; order:-1}
    main{padding:18px 14px 50px}
    header{padding:12px 14px}
    .stage canvas{width:100%; max-width:340px}
  }
</style>
</head>
<body><header>
  <div class="mark">麦</div>
  <div><h1>卡片市场 · 大图六稿</h1><div class="sub">后端推送配方 / 前端真引擎渲染 · 11-08 已上现网 17 live · 新稿排前</div></div>
  <div class="pill" id="gate">闸门 …</div>
</header>
<main>
  <div class="kicker">候 选 货 架</div>
  <h2>六套「大图 + 文字」，点一格看大图</h2>
  <p class="lede">同一篇示例笔记、同一张配图压六套版式，比的是 layout 不是内容。每一格都由产品那份解释器与绘制层现算现画；没配图时大图位落品牌印，几何不塌。</p>
  <div class="shelf" id="shelf"></div>

  <div class="duo">
    <div class="stage">
      <canvas id="big"></canvas>
      <div class="info">
        <div class="en" id="bigEn"></div>
        <h3 id="bigName"></h3>
        <p id="bigNote"></p>
        <div class="meta" id="bigMeta"></div>
        <div class="err" id="err"></div>
      </div>
    </div>
    <aside class="rail">
      <h4>预 览 控 件</h4>
      <div class="ctl"><label>模板</label><select id="cTpl"></select></div>
      <div class="ctl"><label>示例笔记</label><select id="cNote">
        <option value="short">短标题 + 摘要</option><option value="long">长标题 + 长摘要</option><option value="bare">只有标题</option>
      </select></div>
      <div class="ctl"><label>示例图调（仅预览）</label><select id="cTone">
        <option value="orig">原图</option><option value="dark">压暗 0.62</option><option value="bright">提亮 1.30</option>
      </select></div>
      <div class="ctl"><label>语言</label><select id="cLang"><option value="zh">中文</option><option value="en">English</option></select></div>
      <div class="ctl"><label class="tgl"><input type="checkbox" id="cPhoto" checked><span class="box"></span><span>这篇有配图</span></label></div>
      <div class="ctl"><label class="tgl"><input type="checkbox" id="cQr" checked><span class="box"></span><span>带小程序码位</span></label></div>
      <div class="ctl"><label class="tgl"><input type="checkbox" id="cAvatar" checked><span class="box"></span><span>名片头像（署名行圆位）</span></label></div>
      <div class="ctl"><label>示例头像底色</label><select id="cAvatarHue">
        <option value="0">陶土</option><option value="1">电蓝</option><option value="2">青绿</option><option value="3">琥珀</option>
      </select></div>
      <div class="btns"><button id="bExport">导出 PNG</button><button id="bReset" class="ghost">重置</button></div>
    </aside>
  </div>

  <div class="kicker" style="margin-top:30px">现 网 对 照</div>
  <h2>在架的两套大图款，放在同一排比</h2>
  <div class="shelf" id="shelfOld"></div>

  <div class="kicker" style="margin-top:26px">国 外 取 证</div>
  <h2>五张真商店截图，各借一件事</h2>
  <div class="refs" id="refs"></div>

  <footer>
    配方正本：<code>docs/design/11-07卡片市场大图六稿/&lt;id&gt;.json</code> 与 <code>rows.json</code>；已进 <code>backend/seed/poster_extra/</code> 并灌现网（17 live，新稿 sort 1–6 排前）。收回某一稿＝库里那行改 archived，秒级生效、不发版。
    生成器 <code>docs/工具/出-大图六稿配方.js</code>；本板 <code>docs/工具/出-大图六稿效果图板.js</code>。
    引擎为 <code>miniprogram/utils/poster.js</code> 等十只文件原文内嵌，闸门与 strict 规划走真代码；码位为示意矩阵，真机替换为小程序码；示例配图为生成图，仅压版式用。
  </footer>
</main>
<script>
globalThis.wx = {
  getStorageSync: () => ({ name: '阿飞', slogan: '每天读一点再走', template: 'cover', avatarPath: '' }),
  setStorageSync: () => {}, removeStorageSync: () => {},
  getFileSystemManager: () => ({ accessSync: () => true, unlinkSync: () => {}, mkdirSync: () => {} }),
  env: { USER_DATA_PATH: '/u' },
  request: () => {}, downloadFile: () => {}, uploadFile: () => {},
}
const __mods = {}
function define(name, fn){ __mods[name] = { fn, exports: null, done: false } }
function require(name){
  const key = name.replace(/^\\.\\//, '')
  const m = __mods[key]
  if (!m) throw new Error('module not embedded: ' + name)
  if (!m.done){ m.exports = {}; m.done = true; m.fn(m, m.exports, require) }
  return m.exports
}
${src}
const ROWS = ${JSON.stringify(rows)};
const PHOTO = "${photo}";
const REFS = ${JSON.stringify(refs)};
</script>
<script>
(function(){
  const poster = require('poster.js')
  const $ = (id) => document.getElementById(id)
  const gate = poster.applyRemoteTemplates(ROWS.map(r => Object.assign({}, r, { content_hash: 'board-preview' })))
  const gateEl = $('gate')
  gateEl.textContent = gate.accepted === ROWS.length ? ('闸门 ' + gate.accepted + '/' + ROWS.length + ' 收') : ('闸门拒 ' + gate.rejected.length)
  if (gate.accepted !== ROWS.length) gateEl.classList.add('bad')

  const NOTES = {
    short: { id: 7, title: '在海边旧城，把一条下坡路走成傍晚', summary: '白墙、九重葛和一杯放凉的咖啡；读到的好句子都记在这一篇里。', key_points: ['下坡路尽头就是海'], tags: ['旅行', '阅读'], category_id: 3, source_type: 'manual', created_at: '2026-11-07T09:20:00Z' },
    long: { id: 12, title: '在海边旧城的那条下坡路上，我把一整本读过的书和没写完的信都摊在咖啡桌上了', summary: '一条链接、一张截图，或者自己写两句，存进来就自动分成能转发的样子；这一句故意写长，用来压两行摘要与多行标题的边界，看裁切与行距还站不站得住。', key_points: ['长标题压四行'], tags: ['旅行', '阅读', '咖啡'], category_id: 3, source_type: 'manual', created_at: '2026-11-07T09:20:00Z' },
    bare: { id: 3, title: '傍晚的下坡路', summary: '', key_points: [], tags: [], category_id: 3, source_type: 'manual', created_at: '2026-11-07T09:20:00Z' },
  }
  const PROFILE = { name: '阿飞', slogan: '每天读一点再走', avatarPath: 'board://avatar' }
  const AV_HUES = ['#D2683F', '#2B44FF', '#00C7A9', '#F6C445']
  function makeAvatar(hue) {
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 160
    const c = cv.getContext('2d')
    c.fillStyle = hue; c.beginPath(); c.arc(80, 80, 80, 0, Math.PI * 2); c.fill()
    c.fillStyle = hue === '#F6C445' ? '#14161A' : '#FFFFFF'
    c.font = 'bold 84px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.fillText('麦', 80, 86)
    return { img: cv, w: 160, h: 160 }
  }
  const DESIGNS = {
    postcard: ['明信片', 'Postcard', '明信片背面：上半照片＋右上邮票位码；下半竖栏线分开，左横排留言、右两列竖排（分类·日期＋一句话）右起读。'],
    floatcap: ['浮签', 'Float Caption', '借 VSCO / Are.na：整幅照片不动，说明卡左偏浮在下三分之一，投影把它托起来；码贴在右上不抢画面。'],
    gallery: ['画廊', 'Gallery Mat', '通栏大图边到边铺满上半；下半纸面竖排题右起两列、竖排款接其左，底部横排 meta＋署名＋码；无图＝通栏图位一枚麦。'],
    filmframe: ['胶片', 'Film Frame', '借 Letterboxd / 胶片机：暗底上下两排齿孔，mono 帧号右对齐；标题落在齿孔框外，像冲洗出来的一张。'],
    splitcol: ['刊栏', 'Split Column', '整幅照片铺满，右侧悬浮深色毛玻璃栏（同图去色＋半透明深罩＋细颗粒＋发丝边），眉标—标题—细线—摘要—标签—署名—码全落在玻璃上。'],
    duotone: ['圆窗叠影', 'Circle Overlay', '圆形遮罩吃原色照片＋双环描边，背景上黑下蓝三停渐变，居中黑体大字与摘要落在渐变上，琥珀眉标／码贴角呼应。'],
    cover: ['杂志封面', 'Magazine Cover', '现网在架对照：整幅图＋渐变纱＋左下大字。'],
    lit: ['纸间文艺', 'Paper & Ink', '现网在架对照：纸面文艺款。'],
  }
  const REF_CAP = {
    pinterest: ['Pinterest', '整幅图＋左上粗黑大标题＋一枚药丸：浮签与叠影的眉标药丸借它。'],
    canva: ['Canva', '高饱和色块＋模板货架＋分类芯片：本板货架与六稿的色胆借它。'],
    vsco: ['VSCO', '照片满幅＋字距拉开的大写小字＋底部安静说明：画廊的馆签借它。'],
    day: ['Day One', '纸面留白＋日期栏＋条目缩略图：明信片的留白与日期栏借它。'],
    letterboxd: ['Letterboxd', '暗底＋海报主体＋mono  meta 行＋小 inset：胶片的齿孔框外排字借它。'],
  }

  const state = { tpl: 'postcard', note: 'short', tone: 'orig', lang: 'zh', photo: true, qr: true, avatar: true, avatarHue: 0 }

  const measure = document.createElement('canvas').getContext('2d')
  const photoImg = new Image(); photoImg.src = PHOTO
  const qrCanvas = document.createElement('canvas'); qrCanvas.width = 210; qrCanvas.height = 210
  ;(function drawQr(){
    const c = qrCanvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 210, 210); c.fillStyle = '#14161A'
    let seed = 42
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const n = 25, cell = 210 / n
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const inFinder = (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7)
      if (!inFinder && rnd() > 0.52) c.fillRect(x * cell, y * cell, cell - 0.6, cell - 0.6)
    }
    const finder = (fx, fy) => { c.fillRect(fx, fy, 7 * cell, 7 * cell); c.fillStyle = '#fff'; c.fillRect(fx + cell, fy + cell, 5 * cell, 5 * cell); c.fillStyle = '#14161A'; c.fillRect(fx + 2 * cell, fy + 2 * cell, 3 * cell, 3 * cell) }
    finder(0, 0); finder((n - 7) * cell, 0); finder(0, (n - 7) * cell)
  })()
  const tones = {}
  function toneImg(which){
    if (which === 'orig') return { img: photoImg, w: photoImg.naturalWidth, h: photoImg.naturalHeight }
    if (tones[which]) return tones[which]
    const cv = document.createElement('canvas'); cv.width = photoImg.naturalWidth; cv.height = photoImg.naturalHeight
    const c = cv.getContext('2d'); c.filter = which === 'dark' ? 'brightness(0.62)' : 'brightness(1.30)'
    c.drawImage(photoImg, 0, 0); c.filter = 'none'
    tones[which] = { img: cv, w: cv.width, h: cv.height }
    return tones[which]
  }

  function planFor(tpl){
    return poster.planPoster(measure, NOTES[state.note], tpl, Object.assign({}, PROFILE, { avatarPath: state.avatar ? 'board://avatar' : '' }), state.lang, { hasNote: state.photo, showQr: state.qr, strict: true })
  }
  function paint(canvas, tpl, width){
    const plan = planFor(tpl)
    const scale = width / 750
    canvas.width = Math.round(750 * scale); canvas.height = Math.round(plan.height * scale)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    const images = { qr: { img: qrCanvas, w: 210, h: 210 } }
    if (state.photo) images.note = toneImg(state.tone)
    if (state.avatar) images.avatar = makeAvatar(AV_HUES[state.avatarHue])
    poster.paintLayers(ctx, plan.layers, images)
    return plan
  }

  const IDS = ROWS.slice().sort((x, y) => x.sort_order - y.sort_order).map(r => r.template_id)
  const OLD = ['cover', 'lit']
  function buildShelf(el, ids){
    el.innerHTML = ''
    ids.forEach((id) => {
      const d = DESIGNS[id]
      const cell = document.createElement('div'); cell.className = 'cell'; cell.dataset.id = id
      const cv = document.createElement('canvas'); cell.appendChild(cv)
      const nm = document.createElement('div'); nm.className = 'nm'
      const nmA = document.createElement('span'); nmA.textContent = d[0]
      const nmB = document.createElement('em'); nmB.textContent = d[1]
      nm.appendChild(nmA); nm.appendChild(nmB); cell.appendChild(nm)
      const bw = document.createElement('div'); bw.className = 'bw'; bw.textContent = d[2].split('：')[0]; cell.appendChild(bw)
      cell.addEventListener('click', () => { state.tpl = id; $('cTpl').value = id; renderAll() })
      el.appendChild(cell)
    })
  }
  buildShelf($('shelf'), IDS)
  buildShelf($('shelfOld'), OLD)
  IDS.concat(OLD).forEach((id) => {
    const op = document.createElement('option'); op.value = id
    op.textContent = DESIGNS[id][0] + ' · ' + DESIGNS[id][1]
    $('cTpl').appendChild(op)
  })
  REFS.forEach((r) => {
    const fig = document.createElement('figure')
    const img = document.createElement('img'); img.src = r.src; img.alt = REF_CAP[r.n][0] + ' 商店截图'
    const cap = document.createElement('figcaption')
    const b = document.createElement('b'); b.textContent = REF_CAP[r.n][0]
    cap.appendChild(b); cap.appendChild(document.createTextNode('　' + REF_CAP[r.n][1]))
    fig.appendChild(img); fig.appendChild(cap); $('refs').appendChild(fig)
  })

  function renderAll(){
    $('err').textContent = ''
    try {
      document.querySelectorAll('#shelf .cell, #shelfOld .cell').forEach((cell) => {
        const id = cell.dataset.id
        cell.classList.toggle('on', id === state.tpl)
        paint(cell.querySelector('canvas'), id, 152)
      })
      const plan = paint($('big'), state.tpl, 340)
      const d = DESIGNS[state.tpl]
      $('bigName').textContent = d[0]
      $('bigEn').textContent = d[1]
      $('bigNote').textContent = d[2]
      const bytes = new Blob([JSON.stringify(poster.recipeOf(state.tpl) || {})]).size
      $('bigMeta').textContent = ''
      ;['750 × ' + plan.height, plan.layers.length + ' 层', '配方 ' + bytes + ' B', (state.photo ? '有图' : '无图→品牌印'), (state.qr ? '带码' : '不带码'), state.lang].forEach((t) => {
        const sp = document.createElement('span'); sp.textContent = t; $('bigMeta').appendChild(sp)
      })
    } catch (e) {
      $('err').textContent = '渲染抛错：' + e.message
    }
  }
  $('cTpl').addEventListener('change', (e) => { state.tpl = e.target.value; renderAll() })
  $('cNote').addEventListener('change', (e) => { state.note = e.target.value; renderAll() })
  $('cTone').addEventListener('change', (e) => { state.tone = e.target.value; renderAll() })
  $('cLang').addEventListener('change', (e) => { state.lang = e.target.value; renderAll() })
  $('cPhoto').addEventListener('change', (e) => { state.photo = e.target.checked; renderAll() })
  $('cQr').addEventListener('change', (e) => { state.qr = e.target.checked; renderAll() })
  $('cAvatar').addEventListener('change', (e) => { state.avatar = e.target.checked; renderAll() })
  $('cAvatarHue').addEventListener('change', (e) => { state.avatarHue = +e.target.value; renderAll() })
  $('bReset').addEventListener('click', () => {
    Object.assign(state, { tpl: 'postcard', note: 'short', tone: 'orig', lang: 'zh', photo: true, qr: true, avatar: true, avatarHue: 0 })
    $('cTpl').value = state.tpl; $('cNote').value = state.note; $('cTone').value = state.tone
    $('cLang').value = state.lang; $('cPhoto').checked = true; $('cQr').checked = true
    $('cAvatar').checked = true; $('cAvatarHue').value = '0'
    renderAll()
  })
  $('bExport').addEventListener('click', () => {
    const cv = document.createElement('canvas')
    const plan = paint(cv, state.tpl, 750)
    const a = document.createElement('a')
    a.download = state.tpl + '-750x' + plan.height + '.png'
    a.href = cv.toDataURL('image/png')
    a.click()
  })
  window.__board = { state, renderAll, planFor, paint, gate }
  function selftest(){
    const out = { gate: gate.accepted, combos: 0, throws: [], blank: [], heights: {} }
    const ids = IDS.concat(OLD)
    ids.forEach((id) => {
      ;['short', 'long', 'bare'].forEach((nk) => {
        ;[true, false].forEach((ph) => {
          ;[true, false].forEach((qr) => {
            ;['zh', 'en'].forEach((lg) => {
              ;[true, false].forEach((av) => {
              Object.assign(state, { tpl: id, note: nk, photo: ph, qr: qr, lang: lg, avatar: av })
              out.combos++
              try {
                const cv = document.createElement('canvas')
                const plan = paint(cv, id, 150)
                out.heights[id] = plan.height
                const c = cv.getContext('2d')
                const d = c.getImageData(0, 0, cv.width, cv.height).data
                let nz = 0
                for (let i = 0; i < d.length; i += 40) if (d[i] || d[i + 1] || d[i + 2]) nz++
                if (nz < 50) out.blank.push(id + '/' + nk + '/' + ph + '/' + qr + '/' + lg)
              } catch (e) { out.throws.push(id + '/' + nk + '/' + ph + '/' + qr + '/' + lg + '/' + av + ': ' + e.message) }
              })
            })
          })
        })
      })
    })
    // 控件真的接上了吗：走 DOM 事件，不走内部函数
    const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }))
    $('cNote').value = 'long'; fire($('cNote'), 'change')
    out.handlerNote = state.note === 'long'
    $('cLang').value = 'en'; fire($('cLang'), 'change')
    out.handlerLang = state.lang === 'en'
    $('cPhoto').checked = false; fire($('cPhoto'), 'change')
    out.handlerPhoto = state.photo === false
    $('cQr').checked = false; fire($('cQr'), 'change')
    out.handlerQr = state.qr === false
    $('cAvatar').checked = false; fire($('cAvatar'), 'change')
    out.handlerAvatar = state.avatar === false
    $('cAvatarHue').value = '2'; fire($('cAvatarHue'), 'change')
    out.handlerHue = state.avatarHue === 2
    const cell = document.querySelector('#shelf .cell[data-id="filmframe"]')
    cell.click()
    out.handlerCell = state.tpl === 'filmframe'
    const bigH = $('big').height
    $('cPhoto').checked = true; fire($('cPhoto'), 'change')
    out.repaintOnChange = $('big').height > 0 && $('big').width === 340
    // 导出那条路：750 宽真画 + toDataURL
    const ec = document.createElement('canvas')
    paint(ec, 'postcard', 750)
    out.exportBytes = ec.toDataURL('image/png').length
    $('bReset').click()
    out.resetOk = state.tpl === 'postcard' && state.note === 'short' && state.lang === 'zh' && state.photo && state.qr
    Object.assign(state, { tpl: 'postcard', note: 'short', tone: 'orig', lang: 'zh', photo: true, qr: true, avatar: true, avatarHue: 0 })
    renderAll()
    const pre = document.createElement('pre')
    pre.id = 'selftest'
    const hd = document.querySelector('header'); const pr = document.getElementById('gate').getBoundingClientRect()
    out.header = { sw: hd.scrollWidth, cw: hd.clientWidth, pillRight: Math.round(pr.right), vw: window.innerWidth }
    pre.textContent = JSON.stringify(out)
    out.handlersOk = out.handlerNote && out.handlerLang && out.handlerPhoto && out.handlerQr && out.handlerAvatar && out.handlerHue && out.handlerCell && out.repaintOnChange && out.resetOk && out.exportBytes > 10000
    document.body.appendChild(pre)
    document.title = 'SELFTEST ' + (out.throws.length === 0 && out.blank.length === 0 && out.handlersOk ? 'PASS' : 'FAIL') + ' combos=' + out.combos
  }
  const deep = (location.hash || '').replace('#', '')
  if (DESIGNS[deep]) { state.tpl = deep; $('cTpl').value = deep }
  if (photoImg.complete) { renderAll(); if (location.hash === '#selftest') selftest() }
  else photoImg.addEventListener('load', () => { renderAll(); if (location.hash === '#selftest') selftest() })
})()
</script>
</body>
</html>
`
fs.writeFileSync(OUT, html)
console.log('板已落', OUT, Buffer.byteLength(html), 'B')
