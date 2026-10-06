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

console.log(bad.length ? `\n✗ ${bad.length} 条不过：${bad.join(' / ')}` : '\n全过')
process.exit(bad.length ? 1 : 0)
