// 第 0 关（纯 node，不连开发者工具）：图片备份这条链的**两份真相是不是同一条线**。
// 跑法：node docs/工具/验-图片备份两半边.js
//
// 为什么这把要先跑：B 链的失败全是静默的——路径拼错就是 404、gate 没关就是"每张图都
// 上传失败但笔记照样存下来"。这类问题在真机上表现为"图呢？"，查起来最费时间。
// 所以这里钉的全是"跨端各写一份、漂了就没人报警"的那几条。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

const CMP_SRC = read('miniprogram/utils/imageCompress.js')
const UP_SRC = read('miniprogram/utils/cloudUpload.js')
// 判"有没有 throw / reject"必须先把注释剥掉：这两个文件的注释里就写着"这里没有一个 throw"，
// 不剥注释这条判据会红在自己的说明文字上（第一趟就是这么红的）。
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const CMP = stripComments(CMP_SRC)
const UP = stripComments(UP_SRC)
const API = read('miniprogram/utils/api.js')
const APP = read('miniprogram/app.js')
const BE = read('backend/app/api/routes/assets.py')
// 这两个数从 routes/assets.py 搬到了 models/asset.py：公开页（routes/shares.py）也要认
// 同一个 9 和同一个"这张图到底还在不在"的判断，留在某个路由里就得让另一个路由 import 它。
const MODEL = read('backend/app/models/asset.py')
const SHARES = read('backend/app/api/routes/shares.py')
const USER_ROUTE = read('backend/app/api/routes/user.py')
const NOTE_ROUTE = read('backend/app/api/routes/notes.py')
const MAIN = read('backend/app/main.py')

// 语法先过一遍：这两个文件里有 async/await 与可选链，node 直接 require 会去跑 wx.
// 所以只做语法检查，不执行。
const { execFileSync } = require('child_process')
for (const f of [
  'miniprogram/utils/imageCompress.js',
  'miniprogram/utils/cloudUpload.js',
  'miniprogram/utils/assetQueue.js',
  'miniprogram/pages/create/create.js',
  'miniprogram/pages/detail/detail.js',
  'miniprogram/pages/index/index.js',
  'miniprogram/pages/me/me.js',
  'miniprogram/pages/share/view.js',
  'miniprogram/app.js',
  'miniprogram/utils/api.js',
  'miniprogram/utils/i18n.js',
]) {
  let ok = true
  let why = ''
  try {
    execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' })
  } catch (e) {
    ok = false
    why = String(e.stderr || e.message).split('\n')[0]
  }
  ck(`${f.split('/').pop()} 语法过`, ok, why)
}

/* ---------- 一、B 链不许抛穿（这是它和 A 链唯一的边界） ---------- */
ck('imageCompress 里没有 throw / reject（失败一律 resolve(null)）',
  !/\bthrow\b/.test(CMP) && !/reject\(/.test(CMP))
ck('cloudUpload 里没有 throw / reject',
  !/\bthrow\b/.test(UP) && !/reject\(/.test(UP))
ck('上传失败只 console.warn，不动界面', /console\.warn\('云存储上传失败/.test(UP))

/* ---------- 二、压缩那三个数与"为什么不用 compressImage" ---------- */
ck('长边上限 1920、预算 500KB、质量三档 0.7/0.5/0.3',
  /MAX_LONG_EDGE = 1920/.test(CMP) && /BUDGET_BYTES = 500 \* 1024/.test(CMP)
    && /QUALITY_LADDER = \[0\.7, 0\.5, 0\.3\]/.test(CMP))
ck('canvasToTempFilePath 显式给了 destWidth/destHeight（不给会再乘一次设备像素比）',
  /destWidth: w, destHeight: h/.test(CMP))
ck('三档都超就交最后一次（"宁可大一点也不丢图"这条取舍在代码里）',
  /overBudget/.test(CMP) && /return last/.test(CMP))

/* ---------- 三、没填环境时整条链必须是关着的（今天的行为一字不变） ---------- */
ck('CLOUD_ENV 默认空串（云开发环境 ID 还没读回来，不许假装它存在）',
  /const CLOUD_ENV = ''/.test(UP))
ck('cloudReady 同时看 env 与 wx.cloud（基础库没有云能力时也不许往下走）',
  /return !!CLOUD_ENV && !!wx\.cloud/.test(UP))
ck('uploadImage 第一行就挡：不 ready 直接 null',
  /async function uploadImage[\s\S]{0,220}?if \(!cloudReady\(\)/.test(UP))
ck('app.js 里 initCloud 只有一处调用',
  (APP.match(/cloudUpload\.initCloud\(\)/g) || []).length === 1)

/* ---------- 四、跨端那三条路径逐字对齐（漂了就是一辈子 404） ---------- */
const FE_CALLS = [
  ['/api/notes/${id}/assets', 'POST'],
  ['/api/notes/${id}/assets', 'GET'],
  ['/api/user/storage-quota', 'GET'],
]
FE_CALLS.forEach(([p]) => {
  ck(`前端 api.js 里有 ${p}`, API.includes(p))
  ck(`后端 routes/assets.py 里有同一条 ${p.replace(/\$\{id\}/, '{note_id}')}`,
    BE.includes(p.replace(/\$\{id\}/, '{note_id}')))
})
ck('assets 路由在 main.py 注册了（没注册就是 404，且没有任何报错）',
  /app\.include_router\(assets\.router/.test(MAIN))
// 张数那一条（前端 count / 服务端一篇上限 / 一批上限 / 两个读口都不许多截一刀）
// 整批归 `验-张数只有一个出处.js` 管，这里不抄第二条：两条尺子各钉一份同一个数，
// 改数量时就有一条会悄悄失效（这一轮就差点留下一条"公开页也认这个常量"的旧判据）。

/* ---------- 五、后端那三条口径不能被人改回"每人 5GB" ---------- */
ck('配额比值按全站算（total_bytes 不带 user 过滤）',
  /total_bytes = _sum_bytes\(db\)/.test(BE) && /used_ratio=round\(total_bytes \/ cap/.test(BE))
ck('NULL 的 backup_status 算进配额（SQL 三值逻辑那条坑）',
  /backup_status\.is_\(None\)/.test(MODEL))
ck('"这张图到底还在不在"只有一个定义，四处都调它',
  (MODEL.match(/def not_failed/g) || []).length === 1
    && (BE.match(/not_failed\(\)/g) || []).length === 3
    && (SHARES.match(/not_failed\(\)/g) || []).length === 1
    && (USER_ROUTE.match(/not_failed\(\)/g) || []).length === 1,
  `定义 ${(MODEL.match(/def not_failed/g) || []).length} / assets ${(BE.match(/not_failed\(\)/g) || []).length}`)
ck('张数卡的是"这篇最终有多少张"，不是"这一次送几条"',
  /current \| \{it\.file_id for it in items\}/.test(BE))
ck('fileID 光杆 cloud:// 被拒（前缀之外还得有东西）',
  /rest = fid\[len\("cloud:\/\/"\):\]/.test(BE) && /if not rest/.test(BE))

/* ---------- 六、A/B 双链：B 链不许有任何一条路挡住"笔记存下来" ---------- */
const CREATE = stripComments(read('miniprogram/pages/create/create.js'))
const QUEUE = stripComments(read('miniprogram/utils/assetQueue.js'))
ck('submitScreenshots 里 B 链是"起头不等收尾"（const backup = this._backupShots，没有 await）',
  /const backup = this\._backupShots\(batch\)/.test(CREATE) && !/await this\._backupShots/.test(CREATE))
ck('A 链失败那条口也收尾（_settleBackup(null, backup) → 把孤儿对象删掉）',
  /catch \(err\) \{[\s\S]{0,200}?this\._settleBackup\(null, backup\)/.test(CREATE))
ck('B 链逐张串行，不 Promise.all（九张 4000×3000 一起重绘会吃穿内存）',
  /for \(const p of paths/.test(CREATE) && !/Promise\.all/.test(CREATE))
ck('_settleBackup 整体裹在 try 里，任何炸法都不冒 unhandled rejection',
  /async _settleBackup[\s\S]{0,700}?console\.warn\('图片备份收尾没走完/.test(CREATE))
ck('压不动就传原图（"宁可大一点也不丢图"在调用侧也成立）',
  /const src = small \|\| \{ path: p, bytes: null \}/.test(CREATE))

/* ---------- 七、待补绑队列：云上占着账、库里没有，是最难查的那种漏 ---------- */
ck('队列有上限 50 且超限丢最旧（无界会把 storage 撑爆）',
  /MAX_QUEUE = 50/.test(QUEUE) && /list\.splice\(0, list\.length - MAX_QUEUE\)/.test(QUEUE))
ck('flush 把"绑成功"和"服务端明确拒绝（4xx）"两种摘掉，弱网留着下次再试',
  /_put\(list\.filter\(\(x\) => !drop\.includes\(x\)\)\)/.test(QUEUE)
    && /code >= 400 && code < 500/.test(QUEUE))
ck('push 对同一 fileID 去重（bind 幂等，但队列并起来才少打请求）',
  /new Set\(mine\.items\.map\(\(it\) => it\.file_id\)\)/.test(QUEUE))
ck('回到前台补一次绑，且被登录态挡着',
  /assetQueue\.flush\(apiModule\)/.test(APP) && /if \(this\.globalData\.isLoggedIn\) \{[\s\S]{0,120}?assetQueue\.flush/.test(APP))
ck('B 链的 gate 只有一处判 cloudReady（判两次会出现"一半传了一半没传"）',
  (CREATE.match(/cloudReady\(\)/g) || []).length === 1,
  `${(CREATE.match(/cloudReady\(\)/g) || []).length} 处`)

/* ---------- 八、交付那一半：读回来画得出去，删掉之后云上真没了 ---------- */
const DETAIL = stripComments(read('miniprogram/pages/detail/detail.js'))
const DETAIL_WXML = read('miniprogram/pages/detail/detail.wxml')
const INDEX = stripComments(read('miniprogram/pages/index/index.js'))
const ME = stripComments(read('miniprogram/pages/me/me.js'))
const ME_WXML = read('miniprogram/pages/me/me.wxml')
const VIEW = stripComments(read('miniprogram/pages/share/view.js'))
const VIEW_WXML = read('miniprogram/pages/share/view.wxml')
const I18N = read('miniprogram/utils/i18n.js')

ck('file_ids 这个键名在两个回体里都存在（删笔记 / 注销）',
  /"file_ids": file_ids/.test(NOTE_ROUTE) && /"file_ids": asset_ids/.test(USER_ROUTE))
ck('清单只在删除那一刻交出去一次：注销那一路先读 fileID、再删行',
  USER_ROUTE.indexOf('asset_ids = [') < USER_ROUTE.indexOf('"assets": db.query(Asset)'))
ck('两个"删一篇"的口都去清对象（详情页 + 列表详情窗，漏一个就残留一排）',
  /cloudUpload\.dropFromDeleteRes\(r\)/.test(DETAIL) && /cloudUpload\.dropFromDeleteRes\(r\)/.test(INDEX))
ck('注销也清，而且排在 clearSession 之前（过了那一步再没有身份能问出这份清单）',
  /dropFromDeleteRes\(r\)[\s\S]{0,220}?app\.clearSession\(\)/.test(ME))
ck('clearSession 里连待补绑队列一起清（留着会让下一个身份替别人重试绑图）',
  /assetQueue\.clear\(\)/.test(APP))
ck('读配图第一步判 cloudReady（环境没填连请求都不发，也就不可能出现画不出来的破图）',
  /async loadImages\(noteId\)[\s\S]{0,160}?if \(!cloudUpload\.cloudReady\(\)\) return/.test(DETAIL))
ck('换一篇的时候 noteImages 先归零（读图慢了或失败，不许把上一篇的图挂在这一篇上）',
  /note, loading: false, _loaded: true, noteImages: \[\]/.test(DETAIL))
ck('读回来先对一下号：这一页可能已经切到别篇了',
  /String\(this\.data\.noteId\) !== String\(noteId\)/.test(DETAIL))
ck('看大图给的是整排 urls，不是只给被点那一张（详情页与分享落地页同一条动作）',
  /const urls = this\.data\.noteImages\.map\(\(x\) => x\.cloud_url\)/.test(DETAIL)
    && /const urls = list\.map\(\(x\) => x && x\.cloud_url\)/.test(VIEW))
ck('缩略图定宽又定高 + aspectFill（只定宽用 widthFix 会被夹扁那条坑）',
  /mode="aspectFill"/.test(DETAIL_WXML) && /width: 180rpx;[\s\S]{0,40}?height: 180rpx/.test(read('miniprogram/pages/detail/detail.wxss')))
ck('落地页那一排也是定宽定高 + aspectFill',
  /mode="aspectFill"/.test(VIEW_WXML)
    && /width: 150rpx;[\s\S]{0,40}?height: 150rpx/.test(read('miniprogram/pages/share/view.wxss')))
// 只看类体里那些"字段行"（四个空格 + 名字 + 冒号），docstring 里的中文行不算——
// 直接对整段正则会被说明文字里那句"id / file_size / user_id"骗红（第一趟就是这么红的），
// 而 `[\s\S]*?\n\n` 与 `(?:\n[ \t].*)*` 都会在 docstring 中间那个**空行**处截断
// （第二、三趟各红在一个上面）。按行取到下一个顶格非空行为止才是类体本身。
const SHARES_LINES = SHARES.split('\n')
const SA_START = SHARES_LINES.findIndex((l) => /^class ShareAsset\(BaseModel\):/.test(l))
const SA_FIELDS = []
for (let i = SA_START + 1; i < SHARES_LINES.length; i++) {
  const l = SHARES_LINES[i]
  if (l.trim() && !/^[ \t]/.test(l)) break
  if (/^ {4}\w+: /.test(l)) SA_FIELDS.push(l.trim())
}
ck('分享带图从公开口只出去一个字段（class ShareAsset 里只有 cloud_url）',
  SA_START >= 0 && SA_FIELDS.length === 1 && SA_FIELDS[0] === 'cloud_url: str',
  SA_FIELDS.join(' | '))
ck('公开响应里"现查、没送检"那一列写在代码里（LIVE_PUBLIC_FIELDS），不是只写在测试里',
  /LIVE_PUBLIC_FIELDS = \{"assets"\}/.test(SHARES) && /resp\.assets = _public_assets/.test(SHARES))
ck('配额告警线 0.9 只有一处，且读失败就整行收起',
  (ME.match(/STORAGE_WARN_RATIO = 0\.9/g) || []).length === 1
    && /ratio > STORAGE_WARN_RATIO/.test(ME) && /storageWarn: false/.test(ME))
ck('配额那一行先判 cloudReady（今天这一页一个新请求都不多打）',
  /async loadStorage\(\)[\s\S]{0,200}?if \(!cloudUpload\.cloudReady\(\)\)/.test(ME))
ck('配额行不是菜单里的一格（没有能点进去的页面就不画成门）',
  !/wx:if="\{\{storageWarn\}\}" class="menu-item/.test(ME_WXML) && /class="me-storage"/.test(ME_WXML))
;['shotsLabel', 'storageSpace', 'storageTip'].forEach((k) => {
  const n = (I18N.match(new RegExp(`\\n\\s*${k}:`, 'g')) || []).length
  ck(`字典里 ${k} 中英各一处（缺一个语言就是一屏生字）`, n === 2, `${n} 处`)
})
// 那句告警的**措辞**也是口径：比值是全站合计，写成"你的空间"会让人去删自己的笔记，
// 而删了也不动那一个池子。字典是唯一出处，所以这条查字典本身。
const DICT = require(path.join(ROOT, 'miniprogram/utils/i18n.js')).i18n
ck('配额那句说的是"全站"那一池，不写成"你的空间"',
  /全站/.test(DICT.zh.storageTip) && !/你的空间/.test(DICT.zh.storageTip), DICT.zh.storageTip)
ck('栏名不叫"原始图片"（存下来的是压过的那一张）',
  !/原始/.test(DICT.zh.shotsLabel), DICT.zh.shotsLabel)
ck('新写类名带页面前缀（dt- / sv- / me-storage），别的页面同名 class 不会串',
  /\.dt-shots/.test(read('miniprogram/pages/detail/detail.wxss'))
    && /\.sv-shots/.test(read('miniprogram/pages/share/view.wxss'))
    && /\.me-storage/.test(read('miniprogram/pages/me/me.wxss')))

/* ---------- 九、队列跑起来（不以正则为准：真把产品那份 require 进来打一遍） ---------- */
/* 上面八段查的都是"代码长这样"。这一段查"它真那么做"：拿一个会数调用次数的假 api 与一个假
   wx storage，把六条路径各走一遍——空队列、绑成、弱网、服务端拒绝、去重合并、超限丢弃。
   为什么值得单独跑：这条链今天在线上一次都没真跑过（CLOUD_ENV 空着，整条是关的），
   它坏了没人会看见，只会几个月后配额对不上账时才发现"原来弱网那一次根本没补绑上"。
   这八条不是永真式：10-06 拿六份改坏的 assetQueue 各跑过一遍（去掉 4xx 摘除／让弱网也丢整批／
   去掉 fileID 去重／去掉 50 条上限／让 storage 写失败抛穿／让空队列也打一次请求），
   每一份都把自己那一条判据翻成红，其余不动。
   （踩过的坑记一笔：往 /tmp 写变异副本时，文件名别拿中文名的字节前缀算——"去掉 50 条上限"和
   "去掉同 fileID 去重"前四个字节一样，两份副本撞成同一个文件，第二次的改动根本没生效。） */
const finish = () => {
  clearTimeout(watchdog)
  console.log(bad.length ? `\n✗ ${bad.length} 条不过：${bad.join(' / ')}` : '\n全过')
  process.exit(bad.length ? 1 : 0)
}
/* 看门狗：这一段是异步的，任何一条路把某个 Promise 挂住（替身少发一个回调就会这样），
   node 会在事件循环空掉时**静默 exit 0**——上面 66 条已经打完全绿，退出码 0，
   而第九、十段一条都没跑。所以跑不完必须是红，不能是"没声音"。 */
const watchdog = setTimeout(() => {
  console.log('\n✗ 第九/十段没跑完（有替身没把回调发完，promise 永挂 → node 会静默 exit 0，这条就是防它）')
  process.exit(1)
}, 30000)
;(async () => {
  let store = {}
  let warns = []
  const realWarn = console.warn
  const origSet = (k, v) => { store[k] = v }
  global.wx = {
    getStorageSync: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : ''),
    setStorageSync: origSet,
    removeStorageSync: (k) => { delete store[k] },
  }
  console.warn = (...a) => { warns.push(a.join(' ')) }
  const reset = () => { store = {}; warns = [] }
  const mkApi = (mode) => {
    const calls = []
    return { calls, async bindNoteAssets(noteId, items) {
      calls.push({ noteId, n: items.length })
      if (mode === 'net') throw new Error('request:fail timeout')
      if (mode === 'reject') { const e = new Error('not found'); e.statusCode = 404; throw e }
      return { bound: items.length }
    } }
  }
  const shot = (id) => ({ file_id: `cloud://x/${id}.jpg`, size: 1, width: 2, height: 3 })
  const q = require(path.join(ROOT, 'miniprogram/utils/assetQueue.js'))

  reset()
  const a0 = mkApi('ok')
  const r0 = await q.flush(a0)
  ck('跑起来：空队列 flush 一次请求都不发（今天 CLOUD_ENV 没填，进前台就是这个形状）',
    a0.calls.length === 0 && r0.sent === 0 && r0.left === 0, `打了 ${a0.calls.length} 次`)

  reset()
  q.push(11, [shot('a'), shot('b')])
  q.push(22, [shot('c')])
  const a1 = mkApi('ok')
  const r1 = await q.flush(a1)
  ck('跑起来：两篇各打一次、绑成之后队列真的空了',
    a1.calls.length === 2 && q.take().length === 0 && r1.sent === 3 && r1.left === 0,
    `打 ${a1.calls.length} 次 / sent ${r1.sent} / 剩 ${q.take().length}`)

  reset()
  q.push(11, [shot('a')])
  const a2 = mkApi('net')
  const r2 = await q.flush(a2)
  // "还留着"只能在**那一刻**读：第二次 flush 一跑队列就空了。第一版把 `q.take()` 写进最后那条
  // && 里，读到的是自己被清掉的现场，于是当场假红——观测要贴着产生它的那一步取。
  const stillThere = q.take().length
  const a2b = mkApi('ok')
  const r2b = await q.flush(a2b)
  ck('跑起来：弱网那一次不丢整批，下一次进前台真的又试了一次',
    r2.left === 1 && stillThere === 1 && a2b.calls.length === 1 && r2b.sent === 1,
    `第一次 left ${r2.left} / 当场还剩 ${stillThere} / 第二次打 ${a2b.calls.length} 次`)

  reset()
  q.push(11, [shot('a')])
  const a3 = mkApi('reject')
  const r3 = await q.flush(a3)
  const a3b = mkApi('ok')
  await q.flush(a3b)
  ck('跑起来：服务端明确拒绝（4xx）当场摘掉，不再每次进前台白打一遍',
    r3.left === 0 && q.take().length === 0 && a3b.calls.length === 0,
    `left ${r3.left} / 剩 ${q.take().length} / 第二次打 ${a3b.calls.length} 次`)

  reset()
  q.push(11, [shot('a'), shot('b')])
  q.push(11, [shot('b'), shot('c')])
  const a4 = mkApi('ok')
  await q.flush(a4)
  ck('跑起来：同一篇的两次追加并成一条、同一个 fileID 不重复绑（少打请求也少占账）',
    a4.calls.length === 1 && a4.calls[0].n === 3, JSON.stringify(a4.calls))

  reset()
  for (let i = 1; i <= 51; i++) q.push(i, [shot(`f${i}`)])
  const left51 = q.take()
  ck(`跑起来：超过 ${q.MAX_QUEUE} 条丢最旧，且丢的是最早那一条（不是随机丢）`,
    left51.length === q.MAX_QUEUE && left51[0].noteId === 2 && !left51.some((x) => x.noteId === 1),
    `剩 ${left51.length} 条，第一条 noteId=${left51[0] && left51[0].noteId}`)
  ck('丢了要能看见：超限那一次留了告警（悄悄丢等于账面上从没存在过）',
    warns.some((w) => /超过/.test(w) && /丢掉/.test(w)), warns.join(' | ') || '一条告警都没有')

  reset()
  q.push(11, [shot('a')])
  q.clear()
  ck('跑起来：clear() 之后队列是空的（注销那一步收口在这里，否则下一个身份替别人重试绑图）',
    q.take().length === 0)

  reset()
  global.wx.setStorageSync = () => { throw new Error('storage full') }
  let threw = null
  try { q.push(11, [shot('a')]) } catch (e) { threw = e }
  global.wx.setStorageSync = origSet
  ck('跑起来：storage 写不进去时 push 不抛穿（调用方是 B 链收尾，它一抛就会冒 unhandled rejection）',
    threw === null, threw && threw.message)
  /* ---------- 十、今天这一支整条链是"关着的"——跑出来，不是读出来 ---------- */
  /* 上面 §三 那四条查的是源码形状。这里给一个**功能齐全**的假 wx.cloud（env 没填才是关着的原因，
     不是因为设备没有云能力），逐个数调用：真机上开发者工具会连 wx.cloud 都给你，
     所以只有"init/upload/delete 一次都没打"才算证明今天的行为一字不变。 */
  const cloudCalls = { init: 0, upload: 0, remove: 0 }
  /* 假 wx.cloud 一律**把 success 回调发完**。云开发那几个 API 是回调式的外壳（里面才包 Promise），
     替身只 return 不调 success，那条 `new Promise` 就永远不 settle——而 node 在事件循环空了的时候
     会**静默 exit 0**，整把尺子一条没打却"通过"（10-06 反向对照时就是这么假绿的）。 */
  global.wx = {
    cloud: {
      init: () => { cloudCalls.init++ },
      uploadFile: (o) => { cloudCalls.upload++; if (o && o.success) o.success({ fileID: 'cloud://should-not-happen', statusCode: 204 }) },
      deleteFile: (o) => { cloudCalls.remove++; if (o && o.success) o.success({ fileList: (o.fileList || []).map(() => ({ status: 0 })) }) },
    },
    getStorageSync: () => '', setStorageSync: () => {}, removeStorageSync: () => {},
    getFileSystemManager: () => ({ accessSync: () => true }),
    env: { USER_DATA_PATH: '/u' },
    compressImage: (o) => { if (o && o.fail) o.fail({ errMsg: '不该被调用' }) },
  }
  const cu = require(path.join(ROOT, 'miniprogram/utils/cloudUpload.js'))
  ck('跑起来：CLOUD_ENV 空着，即便设备有完整 wx.cloud，cloudReady 也回 false',
    cu.CLOUD_ENV === '' && cu.cloudReady() === false, `CLOUD_ENV="${cu.CLOUD_ENV}"`)
  ck('跑起来：initCloud 是空操作（一次 wx.cloud.init 都没打）',
    cu.initCloud() === false && cloudCalls.init === 0, JSON.stringify(cloudCalls))
  const up = await cu.uploadImage('/tmp/fake.jpg', 1)
  ck('跑起来：uploadImage 回 null 且一次上传都没打（B 链今天一张都不传）',
    up === null && cloudCalls.upload === 0, JSON.stringify(cloudCalls))
  const delN = await cu.deleteFiles(['cloud://a.jpg', 'cloud://b.jpg'])
  ck('跑起来：deleteFiles 回 0 且一次 wx.cloud.deleteFile 都没打（三个删除口今天都走它）',
    delN === 0 && cloudCalls.remove === 0, JSON.stringify(cloudCalls))
  const dropN = await cu.dropFromDeleteRes({ file_ids: ['cloud://a.jpg'] })
  ck('跑起来：拿后端那份清单喂进去也一样静默（回体里真有 file_ids 也不许打）',
    dropN === 0 && cloudCalls.remove === 0, JSON.stringify(cloudCalls))
  const savedCloud = global.wx.cloud
  delete global.wx.cloud
  ck('跑起来：设备没有云能力这一路也挡得住（cloudReady 两个条件是"与"，少一个都不许往下走）',
    cu.cloudReady() === false && cu.initCloud() === false)
  global.wx.cloud = savedCloud
  console.warn = realWarn
})().then(finish).catch((e) => {
  console.log(`✗ 第九段自己崩了（这不是判据红，是尺子坏了）：${e && e.stack ? e.stack.split('\n')[0] : e}`)
  process.exit(2)
})
