// 配图拖动排序这一轮的静态尺子（站长 10-19「笔记编辑时候，配图要支持拖动排序，方便用户选择好的图片作为头图」）。
// 跑法：node docs/工具/验-配图拖动排序.js
//
// 这一把只管**结构与两份真相对不对得上**：排序键有几份定义、四处读口吃不吃它、两处建行走不走追加、
// 客户端那条路径与后端注册的字符串一字不一字不差。手势真不真、松手那一趟发没发出去，
// 是 `验-配图拖动排序-真跑.js` 那把的事（它要连 IDE）。
//
// 三条最要紧的，都是"红的时候屏上看不出来"那种：
// - **排序键只许有一份**。四处读口（列表封面、配图列表、删完的回体、公开页）各写一遍 `asc()`，
//   漏改的那一处不报错，症状是"他拖完了，列表上那枚还是旧那张"。
// - **新登记的行不许吃默认 0**。吃了就插到排好序的那批前面，等于给一篇老笔记静默换头图。
// - **客户端那条路径与后端注册的字符串必须相等**。不等打的是 404，而 404 被页面的 catch 接住，
//   屏上只有一句"保存失败"——查的人只会去怀疑网络。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const BP = (rel) => path.join(ROOT, 'backend', rel)
const rd = (f) => fs.readFileSync(f, 'utf8')
const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  .replace(/<!--[\s\S]*?-->/g, '')

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— 实得：' + extra : ''))
}
const count = (s, re) => (s.match(re) || []).length

const MODEL = rd(BP('app/models/asset.py'))
const A_API = rd(BP('app/api/routes/assets.py'))
const N_API = rd(BP('app/api/routes/notes.py'))
const S_API = rd(BP('app/api/routes/shares.py'))
const N_IMG = rd(BP('app/services/note_images.py'))
const WXML = strip(rd(P('pages/write/write.wxml')))
const JS = rd(P('pages/write/write.js'))
const WXSS = rd(P('pages/write/write.wxss'))
const CL_API = rd(P('utils/api.js'))
// 只扫业务代码，不扫 alembic/tests：迁移里那句 `sa.Column('sort_order', …)` 本来就该出现一次。
const APP_PY = ['app/api/routes/assets.py', 'app/api/routes/notes.py', 'app/api/routes/shares.py',
  'app/models/asset.py', 'app/services/note_images.py'].map((f) => rd(BP(f))).join('\n')

// 取一段方法体（与「验-分类面板内管理」同一把尺：锚点必须给到"定义那一行的开头"，
// 只给方法名会锚到第一个调用点上，截出来一段空的，负向判据对空串永远为真＝假绿）。
const seg = (src, head) => {
  const i = src.indexOf(head)
  if (i < 0) return ''
  const j = src.indexOf('\n  }', i)
  return j < 0 ? src.slice(i) : src.slice(i, j + 4)
}

// ---------- S1 那一列与那条迁移 ----------
ok('S1 模型有 sort_order，且带 server_default（SQLite 上 ADD COLUMN 的默认值必须是常量表达式）',
  /sort_order = Column\(Integer, nullable=False, default=0, server_default="0"\)/.test(MODEL))
ok('S1 迁移文件在、挂在链上（父级＝上一支头），降级走 batch_alter_table',
  fs.existsSync(BP('alembic/versions/a4d7e2b91c58_asset_sort_order.py'))
  && /revision: str = 'a4d7e2b91c58'/.test(rd(BP('alembic/versions/a4d7e2b91c58_asset_sort_order.py')))
  && /down_revision.*= 'f0a3b9c6d172'/.test(rd(BP('alembic/versions/a4d7e2b91c58_asset_sort_order.py')))
  && /op\.add_column\(\s*'assets'/.test(rd(BP('alembic/versions/a4d7e2b91c58_asset_sort_order.py')))
  && /batch_alter_table\('assets'\)/.test(rd(BP('alembic/versions/a4d7e2b91c58_asset_sort_order.py'))))

// ---------- S2 排序键只有一份，四处吃它 ----------
ok('S2 排序键的定义全仓只有 models/asset.py 那一处',
  count(MODEL, /function|def order_by_note/g) === 1 && /def order_by_note\(\)/.test(MODEL))
ok('S2 除那一处定义外，app/ 里再没有手写的 `Asset.id.asc()`（漏改的那一处不报错，只是那一处读的还是旧序）',
  count(APP_PY, /Asset\.id\.asc\(\)/g) === 1, `${count(APP_PY, /Asset\.id\.asc\(\)/g)} 处`)
;[['列表封面 _attach_covers', N_API, 'def _attach_covers'],
  ['配图列表 list_note_assets', A_API, 'def list_note_assets'],
  ['删完的回体 delete_note_asset', A_API, 'def delete_note_asset'],
  ['公开页 _public_assets', S_API, 'def _public_assets'],
].forEach(([name, src, anchor]) => {
  const i = src.indexOf(anchor)
  const body = i < 0 ? '' : src.slice(i, i + 2600)
  ok(`S2 ${name}吃的是那一份排序键`, i >= 0 && /order_by_note\(\)/.test(body))
})
ok('S2 那一份排序键被五处引用（四处读口＋reorder 自己读当前先后），一处不多一处不少',
  count(APP_PY, /\*order_by_note\(\)/g) === 5, `实得 ${count(APP_PY, /\*order_by_note\(\)/g)} 处`)

// ---------- S3 两处建行都追加到最后，不吃默认 0 ----------
ok('S3 追加那一步只有一个出处（next_sort_order 定义在模型里，两个登记口都读它）',
  /def next_sort_order/.test(MODEL)
  && /sort_order=next_order/.test(seg(A_API, '        else:\n            row = Asset('))
  && /sort_order=next_order/.test(N_IMG))
ok('S3 一批里逐张递增（只算一次 max 的话，同批第二张与第一张撞在同一个序号上，由 id 决胜）',
  /next_order \+= 1/.test(A_API) && /next_order \+= 1/.test(N_IMG))
ok('S3 幂等补绑那一支不许碰位置（`if row:` 那一支只改尺寸，不改 sort_order）',
  (() => {
    const i = A_API.indexOf('        if row:')
    const j = A_API.indexOf('        else:', i)
    const body = A_API.slice(i, j)
    return i > 0 && j > i && !/sort_order/.test(body)
  })())

// ---------- S4 reorder 那个口 ----------
ok('S4 序号从 1 起（第一名拿 0 就与"从没排过"挤在同一个数上，撞了由 id 决胜＝拖了没生效）',
  /    order = 1\n    for asset_id in body\.ids:/.test(A_API))
ok('S4 名单里没点名的行也派号（留在旧序号上会与新写的撞值）',
  /for row in rows:[^\n]*\n\s*if by_id\.get\(row\.id\) is not None:/.test(A_API))
ok('S4 私密闸写在写库之前，且被挡下时一个字都不写（commit 在那道 raise 之后）',
  (() => {
    const i = A_API.indexOf('def reorder_note_assets')
    const body = i < 0 ? '' : A_API.slice(i, i + 2200)
    return i >= 0 && body.length > 600
      && body.indexOf('status_code=403') >= 0
      && body.indexOf('status_code=403') < body.indexOf('db.commit()')
  })())
ok('S4 回的是按新序排好的那一批（客户端拿它直接铺，不必再读一次列表）',
  /return _views\(sorted\(rows, key=lambda r: \(r\.sort_order, r\.id\)\)\)/.test(A_API))
ok('S4 一次查完再在内存里派号，不许照 id 逐格问（一格一问＝9 张 9 个来回）',
  (() => {
    const i = A_API.indexOf('def reorder_note_assets')
    const body = i < 0 ? '' : A_API.slice(i, A_API.indexOf('def _sum_bytes', i))
    return i >= 0 && body.length > 600 && !/for idx, .* in enumerate\(body\.ids\)[\s\S]{0,240}db\.query/.test(body)
  })())

// ---------- S5 客户端与后端那条路径两处相等 ----------
ok('S5 客户端打的那条路径与后端注册的字符串一字不差（不等是 404，而 404 被 catch 接住成一句"保存失败"）',
  /reorderNoteAssets: \(id, ids\) => request\(`\/api\/notes\/\$\{id\}\/assets\/reorder`, 'POST', \{ ids \}\)/.test(CL_API)
  && /@router\.post\("\/api\/notes\/\{note_id\}\/assets\/reorder"/.test(A_API))

// ---------- S6 那一排的把手 ----------
ok('S6 四个把手全挂在方格自己身上（longpress / touchmove / touchend / touchcancel 少一个就会拖得起、放不下）',
  /bindlongpress="onShotDragStart"/.test(WXML) && /bindtouchmove="onShotDragMove"/.test(WXML)
  && /bindtouchend="onShotDragEnd"/.test(WXML) && /bindtouchcancel="onShotDragEnd"/.test(WXML))
ok('S6 那一排的事件全用 bind 不用 catch（与分类那一排同一条：那一排也是拖得动、页面也滚得动）',
  !/catchtouch(move|start)="onShot/.test(WXML))
ok('S6 右上角那枚 ✕ 仍是 catchtap（点它只删图，不许顺手起拖）',
  /class="wr-shot-x"[^>]*catchtap="onDelShot"/.test(WXML))
ok('S6 wx:key 用的是 id 不是 index（按 index 铺，调序时那一枚的位移动画会挂到错的图上）',
  /class="wr-shot[^"]*"\s*\n\s*wx:for="\{\{shots\}\}" wx:key="id"/.test(WXML)
  || /wx:for="\{\{shots\}\}" wx:key="id"/.test(WXML))

// ---------- S7 松手那一趟 ----------
const END = seg(JS, 'onShotDragEnd() {')
const SAVE = seg(JS, 'async _saveShotOrder(now, from) {')
ok('S7 松手才发（拖的过程中一格一问服务端），且顺序没变一个字都不发',
  END.length > 60 && !/api\./.test(END) && /_saveShotOrder\(now, d\.from\)/.test(END)
  && /now\.join\(\) === d\.from\.join\(\)\) return/.test(END))
ok('S7 发成功拿回体铺一遍（服务端可能把这一屏没见过的行挪到末尾，留本机那份就是两份真相）',
  SAVE.length > 200 && /api\.reorderNoteAssets/.test(SAVE) && /this\.setData\(\{ shots: left \}\)/.test(SAVE))
ok('S7 发失败要摆回拖之前那一份再说实话（留着新序，屏上那枚头图就是句假话：列表与卡片读的是服务端）',
  /setData\(\{ shots: restored/.test(SAVE) && /wx\.showToast/.test(SAVE)
  && SAVE.indexOf('setData({ shots: restored') < SAVE.indexOf('wx.showToast'))
ok('S7 换中心最近那一枚判落点（这一排会换行，只比 x 会在换行那两枚之间滑不动）',
  /const dy = y - \(r\.top \+ r\.height \/ 2\)/.test(seg(JS, 'async _shotDragStep(x, y) {')))
ok('S7 每换一次重新量，且枚数与草稿对不上时这一趟不换（拿过期的 rect 表比中心＝滑到别处去）',
  /if \(rects\.length !== shots\.length \|\| shots\.length < 2\) return/
    .test(seg(JS, 'async _shotDragStep(x, y) {'))
  && /setTimeout\(resolve, 30\)/.test(JS))

// ---------- S8 那一枚浮起来的皮 ----------
ok('S8 浮起来那一枚用 compound 类 `.wr-shot.wr-drag`（只写 `.wr-drag` 类数与 `.wr-shot` 相同，会被后写的压掉）',
  /\.wr-shot\.wr-drag\s*\{/.test(WXSS) && /transform: scale\(1\.06\)/.test(WXSS))
ok('S8 这一枚不许带 transition（换序那一瞬它正被挪到新位置，缓动会把那一帧拉成一段漂移）',
  !/\.wr-shot[^{]*\{[^}]*transition/.test(WXSS))
ok('S8 那一枚状态只有一个出口：data 里初值一枚，setData 三处（起拖／换一格／松手），别处不再写',
  count(JS, /setData\(\{[^}]*\bshotDrag:/g) === 3 && /shotDrag: -1/.test(seg(JS, 'data: {')),
  `setData 里 ${count(JS, /setData\(\{[^}]*\bshotDrag:/g)} 处`)

// ---------- S9 那把 pytest 尺子在，且钉的是这五条 ----------
const PY = fs.existsSync(BP('tests/test_asset_order.py')) ? rd(BP('tests/test_asset_order.py')) : ''
ok('S9 pytest 那把尺子在，用例不少于 11 条', PY.length > 2000 && count(PY, /^def test_/gm) >= 11,
  PY ? `${count(PY, /^def test_/gm)} 条` : '文件不存在')
;[['存量不换手', '存量'], ['拖一次五处跟着换', '头图一起换'], ['公开页', '公开页'],
  ['新补一张不冒头', '新的排在最后'], ['漏报名字', '没点名'], ['越权', '别人的图'], ['私密闸', '私密篇'],
].forEach(([name, needle]) => {
  ok(`S9 那把 pytest 里有「${name}」这一条`, PY.indexOf(needle) >= 0)
})

console.log(`验-配图拖动排序：${pass} 过 ${fails.length ? `　红 ${fails.length} 条` : '　全绿'}`)
fails.forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
