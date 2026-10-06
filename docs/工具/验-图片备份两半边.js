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
const MAIN = read('backend/app/main.py')

// 语法先过一遍：这两个文件里有 async/await 与可选链，node 直接 require 会去跑 wx.
// 所以只做语法检查，不执行。
const { execFileSync } = require('child_process')
for (const f of [
  'miniprogram/utils/imageCompress.js',
  'miniprogram/utils/cloudUpload.js',
  'miniprogram/utils/assetQueue.js',
  'miniprogram/pages/create/create.js',
  'miniprogram/app.js',
  'miniprogram/utils/api.js',
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
ck('张数上限两边同值 9（前端选图 9 张，服务端卡的也是"一篇 9 张"）',
  /MAX_ASSETS_PER_NOTE = 9/.test(BE) && /count: 9/.test(read('miniprogram/pages/create/create.js')))

/* ---------- 五、后端那三条口径不能被人改回"每人 5GB" ---------- */
ck('配额比值按全站算（total_bytes 不带 user 过滤）',
  /total_bytes = _sum_bytes\(db\)/.test(BE) && /used_ratio=round\(total_bytes \/ cap/.test(BE))
ck('NULL 的 backup_status 算进配额（SQL 三值逻辑那条坑）',
  /backup_status\.is_\(None\)/.test(BE))
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
ck('flush 只把绑成功的那条摘掉（一次抖动不该丢掉整批）',
  /_put\(list\.filter\(\(x\) => !done\.includes\(x\)\)\)/.test(QUEUE))
ck('push 对同一 fileID 去重（bind 幂等，但队列并起来才少打请求）',
  /new Set\(mine\.items\.map\(\(it\) => it\.file_id\)\)/.test(QUEUE))
ck('回到前台补一次绑，且被登录态挡着',
  /assetQueue\.flush\(apiModule\)/.test(APP) && /if \(this\.globalData\.isLoggedIn\) \{[\s\S]{0,120}?assetQueue\.flush/.test(APP))
ck('B 链的 gate 只有一处判 cloudReady（判两次会出现"一半传了一半没传"）',
  (CREATE.match(/cloudReady\(\)/g) || []).length === 1,
  `${(CREATE.match(/cloudReady\(\)/g) || []).length} 处`)

console.log(bad.length ? `\n✗ ${bad.length} 条不过：${bad.join(' / ')}` : '\n全过')
process.exit(bad.length ? 1 : 0)
