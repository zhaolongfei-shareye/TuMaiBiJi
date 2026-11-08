// 「编辑提炼后的笔记，可以再补传新图（仍然 9 张，要过审）」的静态尺子。
// 跑法：node docs/工具/验-编辑补传配图.js
//
// 需求原话（站长 11-08 第 2 条）：「提炼笔记后，再编辑笔记，支持上传新的图片，仍然是 9 张，要过审。」
//
// 这把钉的是**代码形状**；屏上那一半由 `验-编辑补传配图-真跑.js` 量（那一把用模块打桩，
// 不往现网写一行）。
//
// ⚠ 先把一件事说清楚，不然这把尺子会骗人：**这一条链上服务端没有内容安全闸**。
//   补图的字节是"客户端直传云存储"，服务端那个绑图的口（POST /api/notes/{id}/assets）
//   只收 file_id，压根读不到那张图（后端没有云开发凭据）。真正跑微信内容安全的那道闸
//   （`enforce_image_safety`）在**录入提交**那条链上（ingest_tasks.py），不在这一条上。
//   ⇒ 「要过审」在这一条上**只能**落在客户端：`api.checkShot`（POST /api/ingest/screenshots/check，
//   服务端真跑微信 msgSecCheck，回 pass/risky/unavailable 三态），微信明确判 risky 的那一张
//   **不上云、不登记**。
//   ⇒ 所以这把尺子钉的是"送检在上传之前、risky 那一张绝不落到云上"，而不是"服务端会拦"。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const WRITE = read('miniprogram/pages/write/write.js')
const WXML = read('miniprogram/pages/write/write.wxml')
const I18N = read('miniprogram/utils/i18n.js')
const API = read('miniprogram/utils/api.js')
const CLOUD = read('miniprogram/utils/cloudUpload.js')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
// 取某个函数/方法的整段源码（按名字找起点，往下取到下一个同缩进的 `},`）
// ⚠ 名字前面可能有 `async`（这一页那几个方法大半是 async），漏了它就一个都取不到——
//   而取不到时下面每条判据都会红成"代码里没有"，那不是代码的问题，是尺子的。
const fnSrc = (src, name) => {
  const re = new RegExp(`\\n  (?:async\\s+)?${name}\\([^)]*\\)\\s*\\{`)
  const m = re.exec(src)
  if (!m) return ''
  const start = m.index + 1
  let i = src.indexOf('{', start)
  let depth = 0
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break } }
  }
  return src.slice(start, i)
}
// 取不到就要出声：静默返回空串会让后面每一条都红成"代码里没有"，那是尺子的锅不是代码的。
const mustFn = (name) => {
  const s = fnSrc(WRITE, name)
  if (!s) {
    ck(`（尺子自检）能取到 ${name} 的整段源码`, false, '没取到——后面所有关于它的判据都不可信')
    bad.push(`取不到 ${name}`)
  }
  return s
}

/* ---------- ① 补图那一格只在编辑态画 ---------- */
const addTile = /<view[^>]*class="wr-shot wr-shot-add[^"]*"[\s\S]{0,400}?<\/view>/.exec(WXML)
const addTileSrc = addTile ? addTile[0] : ''
ck('① 补图那一格（➕）存在', !!addTileSrc, addTileSrc.slice(0, 100))
ck('① 它只在编辑态画（新建笔记时那一格不出现）',
  /wx:if="\{\{isEdit\}\}"/.test(addTileSrc), addTileSrc.slice(0, 160))
ck('① 点它走的是 onAddShot（catchtap，不冒泡）',
  /catchtap="onAddShot"/.test(addTileSrc))
ck('① 那一排在编辑态至少画得出来（`isEdit || shots.length`）',
  /wx:if="\{\{isEdit \|\| shots\.length\}\}"/.test(WXML), (WXML.match(/wx:if="\{\{isEdit \|\| shots\.length\}\}"/) || [''])[0])

/* ---------- ② 张数：上限吃的是同一枚常量，还剩几格给几格 ---------- */
const addShot = mustFn('onAddShot')
ck('② 上限那一枚来自 `api.MAX_SHOTS`（不是这一页自己写的 9）',
  /maxShots:\s*api\.MAX_SHOTS/.test(WRITE), /maxShots:\s*api\.MAX_SHOTS/.test(WRITE) ? '吃常量' : '没吃')
ck('② 还能选几张＝还剩几格',
  /const left = maxShots - shots\.length/.test(addShot))
ck('② 满了先给一句带那个数的吐司（静默截掉＝选了 12 张只留 9 张而界面一句都不说）',
  /if \(left <= 0\)/.test(addShot) && /t\('maxShots', lang\)/.test(addShot)
  && /\.replace\('\{n\}', maxShots\)/.test(addShot))
ck('② 选图 count 给的是剩余位（不是整个上限，也不多截）',
  /count:\s*left,/.test(addShot) && !/\.slice\(0,\s*maxShots\)/.test(addShot))
ck('② 现有几张没读回来 ⇒ 不许开选图（不知道还剩几格时选上来的必然装不下）',
  /shotsLoaded/.test(addShot) && /if \(!this\.data\.shotsLoaded\)/.test(addShot)
  && /t\('loadFailed', lang\)/.test(addShot))
ck('② 云开发没初始化时不许开选图（cloud:// 的地址画不出来）',
  /cloudUpload\.cloudReady\(\)/.test(addShot) && /t\('cloudNotReady', lang\)/.test(addShot))
ck('② 服务端那一枚上限也是 9（两侧同值；前端那一份在 utils/api.js）',
  /const MAX_SHOTS = 9/.test(API), (/const MAX_SHOTS = (\d+)/.exec(API) || [])[1])

/* ---------- ③ 要过审：送检在上传之前，risky 那一张不上云 ---------- */
const addShots = mustFn('_addShots')
const verdict = mustFn('_shotVerdict')
ck('③ 送检那一趟在上传那一趟**之前**（顺序反了＝先上云再判，判出来也晚了）',
  addShots.indexOf('_shotVerdict') >= 0
  && addShots.indexOf('_shotVerdict') < addShots.indexOf('cloudUpload.uploadImage'),
  `送检 @${addShots.indexOf('_shotVerdict')}／上传 @${addShots.indexOf('cloudUpload.uploadImage')}`)
ck('③ 微信明确判 risky 的那一张：continue 跳过（不上云、不登记）',
  /if \(v\.risky\)\s*\{\s*risky\s*\+=\s*1;\s*continue/.test(addShots),
  (addShots.match(/if \(v\.risky\)[\s\S]{0,80}/) || [''])[0].replace(/\s+/g, ' '))
ck('③ 判 risky 的那一张连登记都不排（登记名单里只有过了检的那些）',
  /if \(v\.risky\)[\s\S]{0,400}?items\.push/.test(addShots)
  && !/if \(v\.risky\)[\s\S]{0,120}?items\.push/.test(addShots))
ck('③ 送检那一个口真跑微信内容安全（`api.checkShot`，不是本地判大小）',
  /api\.checkShot\(path\)/.test(WRITE) && /checkShot/.test(API))
ck('③ 三态分开：risky 拦、badFormat 是格式问题（不当违规说）、其余放行',
  /verdict === 'risky'/.test(verdict)
  && /badFormat/.test(verdict) && /return \{ ok: true \}/.test(verdict))
ck('③ 「没检成 ≠ 这张有问题」（微信抖动不许变成"用户存不了自己的笔记"）',
  /catch \(e\)\s*\{[\s\S]{0,400}?return \{ ok: true \}/.test(verdict)
  || /catch \(e\)[\s\S]{0,400}?return \{ ok: true \}/.test(verdict),
  (verdict.match(/catch[\s\S]{0,200}/) || [''])[0].replace(/\s+/g, ' '))
ck('③ 400 是格式那一档，单独说（说成"违规"是一句冤枉话）',
  /e\.statusCode === 400/.test(verdict) && /badFormat/.test(verdict))
ck('③ 一张都没成时话分两句（"全没过审"与"全传不上"要分得开）',
  /risky \? t\('shotBlocked', lang\)/.test(addShots)
  && /t\('shotsSaveFailed', lang\)/.test(addShots))
ck('③ 部分没过审时说的话里带那个数',
  /t\('shotsAddedSome', lang\)\.replace\('\{n\}', risky\)/.test(addShots))

/* ---------- ④ 登记只发 file_id：字节不过服务端 ---------- */
ck('④ 登记的那一格只带 file_id/size/width/height（不发字节、不发本地路径）',
  /file_id:\s*up\.fileID/.test(addShots) && !/base64|data:image|readFileSync/.test(addShots))
ck('④ 登记走的是绑图那一个口（POST /api/notes/{id}/assets）',
  /api\.bindNoteAssets\(noteId, items\)/.test(addShots)
  && /bindNoteAssets: \(id, items\) => request\(`\/api\/notes\/\$\{id\}\/assets`, 'POST'/.test(API))
ck('④ 登记回体只回这次登记的那几行 ⇒ 屏上那一排要重读整排',
  /await this\._refreshShots\(\)/.test(addShots)
  && /getNoteAssets\(this\.data\.noteId\)/.test(WRITE))

/* ---------- ⑤ 失败的两条路：不留孤儿对象，也不假装存好了 ---------- */
ck('⑤ 绑图 4xx（除 429）⇒ 删掉刚上云的那些对象（不占全站配额、没人认得的孤儿）',
  /code >= 400 && code < 500 && code !== 429/.test(addShots)
  && /await cloudUpload\.deleteFiles\(fileIDs\)/.test(addShots),
  (addShots.match(/if \(code[\s\S]{0,300}/) || [''])[0].replace(/\s+/g, ' ').slice(0, 160))
ck('⑤ 其余失败（网络／5xx／429）⇒ 进待补队列（图片已经在云上，登记下趟补）',
  /assetQueue\.push\(noteId, items\)/.test(addShots)
  && /t\('shotsQueued', lang\)/.test(addShots))
ck('⑤ 队列是本仓那一个（与录入页 B 链同一条路）',
  /require\('\.\.\/\.\.\/utils\/assetQueue\.js'\)/.test(WRITE)
  && /function push/.test(read('miniprogram/utils/assetQueue.js')))

/* ---------- ⑥ 串行 + 在飞闸 ---------- */
ck('⑥ 一张一张走（九张 4000×3000 一起重绘离屏 canvas 会把内存吃穿）',
  /for \(const p of paths\)/.test(addShots) && !/Promise\.all/.test(addShots))
ck('⑥ 在飞闸在 handler 入口（连按两下不许上传两遍）',
  /if \(this\.data\.shotsBusy \|\| !noteId\) return/.test(addShots)
  && /this\.setData\(\{ shotsBusy: true \}\)/.test(addShots))
ck('⑥ 失败那一路把闸放开（不放＝这一屏再也传不了图）',
  (addShots.match(/shotsBusy: false/g) || []).length >= 3,
  `${(addShots.match(/shotsBusy: false/g) || []).length} 处`)

/* ---------- ⑦ 压图与上云的口 ---------- */
ck('⑦ 压图走本仓那一个（与录入页同一个压法，免得同一张图压成另一副样子）',
  /require\('\.\.\/\.\.\/utils\/imageCompress\.js'\)/.test(WRITE)
  && /compressForBackup/.test(WRITE))
ck('⑦ 上云走本仓那一个（cloudUpload.uploadImage，字节直传云存储）',
  /cloudUpload\.uploadImage\(src\.path, userId\)/.test(addShots)
  && /function uploadImage/.test(CLOUD))
ck('⑦ 压不动就交原图（宁可这一张大一点，也不要"图丢了"）',
  /const src = small \|\| \{ path: p, bytes: null \}/.test(addShots))

/* ---------- ⑧ 词典 ---------- */
const keys = ['addShot', 'shotsUploading', 'cloudNotReady', 'shotsQueued', 'shotsAdded', 'shotsAddedSome', 'shotsSaveFailed', 'pickFailed', 'maxShots', 'shotBlocked']
keys.forEach((k) => {
  const n = (I18N.match(new RegExp('\\b' + k + ':', 'g')) || []).length
  ck(`⑧ 字典两门都有 ${k}`, n === 2, `${n} 处`)
})
ck('⑧ 那一格的名字走字典（页面上不写死中文）',
  /aria-label="\{\{t\.addShot\}\}"/.test(WXML))

console.log(bad.length ? `\n✗ ${bad.length} 条不过：${bad.join(' / ')}` : '\n全过')
process.exit(bad.length ? 1 : 0)
