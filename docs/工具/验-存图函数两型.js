// `cloudfunctions/image_store/index.js` 那两种动作的本地真跑判据。
//
// 为什么要有这一把：这只函数是"字节唯一一条进云开发那个桶的路"，而它**在本地没法对着真环境验**
// ——`cloud.uploadFile`／`cloud.downloadFile` 只有跑在环境里才解得开。要等部署完才发现契约写歪，
// 代价是"用户转存那一篇一张图都没带过来"，而且报错发生在现网、看不到原因。
// 所以这里把 `wx-server-sdk` 换成一个记调用、可回预置结果的替身，**函数本体一行不改**地跑进来。
//
// 跑法（不需要 IDE、不需要网络、不需要任何密钥）：
//     node docs/工具/验-存图函数两型.js
// 退出码：0＝全过；3＝反向验证那一格失效（撤掉实现断言仍然绿＝这把尺子没牙）；1＝有判据红。
//
// 第二型（`copy_from`，10-24 站长一句「转存必须带图。乙，复制一份到自己名下」）钉的是四件事：
// ① 源字节**逐字不变**地落到新路径上（复制不是转码，动一根手指就不是同一张图）；
// ② 闸门在动作之前——地址不像样时 `downloadFile` 一次都不许被调；
// ③ 一张里两个动作共用同一个 4MB 上限；
// ④ 任一动作抛了，回的是 `{error}` 而不是把异常抛给网关压成看不懂的调用失败。
const fs = require('fs')
const path = require('path')
const Module = require('module')

const REAL = path.resolve(__dirname, '../../cloudfunctions/image_store/index.js')
const results = []
const ck = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail: detail || '' })
  console.log(`${ok ? '✓' : '✗'} ${name}` + (detail ? `  · ${detail}` : ''))
}

// —— 替身：记每一次 downloadFile／uploadFile 的入参，按脚本回预置结果 ——
function makeSdk(script) {
  const calls = { download: [], upload: [] }
  const sdk = {
    DYNAMIC_CURRENT_ENV: 'DYNAMIC_CURRENT_ENV',
    init() {},
    async downloadFile({ fileID }) {
      calls.download.push(fileID)
      if (script && script.throwOnDownload) {
        const err = new Error(script.throwOnDownload)
        err.response = { data: { code: 'STORAGE_FILE_NONEXIST' } }
        throw err
      }
      if (script && script.noBuffer) return { fileContent: null }
      return { fileContent: script.buffer }
    },
    async uploadFile({ cloudPath, fileContent }) {
      calls.upload.push({ cloudPath, size: fileContent.length, sha: require('crypto').createHash('sha1').update(fileContent).digest('hex') })
      if (script && script.throwOnUpload) {
        const err = new Error(script.throwOnUpload)
        err.response = { data: { message: 'bucket busy' } }
        throw err
      }
      if (script && script.noFileID) return { somethingElse: 1 }
      return { fileID: 'cloud://env.x/bucket/' + cloudPath }
    },
    calls,
  }
  return sdk
}

// 把函数"就地换一份源码"跑（反向验证用）。写法说明：那份改动只有一处——把 `copy_from` 那道
// 地址闸门从字符串里剪掉——剪完**落到一个临时文件里 require 进来**，不用 `new Function` 编译字符串：
// 一是让跑的东西与盘上真文件同形（同一个模块加载路径），二是别在判据里开一个"字符串当代码执行"的口。
// 临时文件落在 `os.tmpdir()` 的一次性目录里，跑完删掉，不进工作树。
const os = require('os')
let TMP_DIR = null
function loadFunction(sdk, fileOverride) {
  const origLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'wx-server-sdk') return sdk
    return origLoad.apply(this, arguments)
  }
  const target = fileOverride || REAL
  try {
    delete require.cache[target]
    return require(target)
  } finally {
    if (fileOverride) {
      delete require.cache[target]
      fs.rmSync(fileOverride, { force: true })
    }
    Module._load = origLoad
  }
}

// 只把源码剪到"少一道闸门"那一处，剪完写进一次性目录，返回那条路径。
function mutantPath(src, from, to) {
  const cut = src.replace(from, to)
  if (cut === src) return null
  if (!TMP_DIR) TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'imgstore-mutant-'))
  const p = path.join(TMP_DIR, 'index.js')
  fs.writeFileSync(p, cut, 'utf8')
  return p
}

const PNG = Buffer.from('89504e470d0a1a0a' + '00'.repeat(64), 'hex')
const OK_PATH = 'images/7/20261024/abc123.jpg'

;(async () => {
  const src = fs.readFileSync(REAL, 'utf8')
  ck('读到了函数本体', src.length > 500, `${src.length} B`)

  // ---------- 第一型：base64 进（外链贴图那条链在用，一行都不许被我这次改动带坏）----------
  let sdk = makeSdk({ buffer: PNG })
  let f = loadFunction(sdk)
  let r = await f.main({ cloud_path: OK_PATH, data: PNG.toString('base64') })
  ck('第一型照常回 fileID', !r.error && String(r.fileID).indexOf('cloud://') === 0, JSON.stringify(r))
  ck('第一型落的字节＝解出来的那份（不是 base64 串）', r.bytes === PNG.length && sdk.calls.upload[0].size === PNG.length,
    `bytes=${r.bytes} 传进桶=${sdk.calls.upload[0].size} 原件=${PNG.length}`)

  r = await f.main({ cloud_path: OK_PATH, data: Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64') })
  ck('第一型超 4MB 当场拒', r.error && /超过/.test(r.error), r.error)
  r = await f.main({ cloud_path: 'other/20261024/x.jpg', data: PNG.toString('base64') })
  ck('第一型只许往 images/ 那一层写', r.error && /images\//.test(r.error), r.error)
  r = await f.main({ cloud_path: 'images/7/../../etc.jpg', data: PNG.toString('base64') })
  ck('第一型带 .. 的路径拒', r.error && /\.\./.test(r.error), r.error)

  // ---------- 第二型：环境内复制一张 ----------
  sdk = makeSdk({ buffer: PNG })
  f = loadFunction(sdk)
  const SRC = 'cloud://env.x/bucket/images/3/20261010/deadbeef.jpg'
  r = await f.main({ copy_from: SRC, cloud_path: OK_PATH })
  ck('第二型回 fileID 且落在给定的新路径上',
    !r.error && r.fileID === 'cloud://env.x/bucket/' + OK_PATH && r.bytes === PNG.length, JSON.stringify(r))
  ck('取字节用的是给进去那一个地址（不是新路径）',
    sdk.calls.download.length === 1 && sdk.calls.download[0] === SRC, sdk.calls.download.join(','))
  ck('复制过去的是逐字相同的字节（不转码、不重压）',
    sdk.calls.upload.length === 1 && sdk.calls.upload[0].sha === require('crypto').createHash('sha1').update(PNG).digest('hex'),
    `源 sha1 …${require('crypto').createHash('sha1').update(PNG).digest('hex').slice(0, 8)} 落桶 sha1 …${(sdk.calls.upload[0] || {}).sha || ''}`.slice(0, 200))

  sdk = makeSdk({ buffer: PNG })
  f = loadFunction(sdk)
  r = await f.main({ copy_from: 'https://cdn.example.com/a.jpg', cloud_path: OK_PATH })
  ck('第二型地址不是 cloud:// 打头就拒', r.error && /cloud:\/\//.test(r.error), r.error)
  ck('闸门在动作之前：那次 downloadFile 一次都没发生',
    sdk.calls.download.length === 0 && sdk.calls.upload.length === 0,
    `download ${sdk.calls.download.length} 次／upload ${sdk.calls.upload.length} 次`)

  r = await f.main({ copy_from: 'cloud://' + 'x'.repeat(600), cloud_path: OK_PATH })
  ck('第二型地址过长就拒（落不进 object_key 那一栏）', r.error && /过长/.test(r.error), r.error)
  r = await f.main({ copy_from: 'cloud://env.x/a.jpg', cloud_path: 'other/x.jpg' })
  ck('第二型的目标路径吃同一条前缀规则', r.error && /images\//.test(r.error), r.error)

  sdk = makeSdk({ buffer: Buffer.alloc(4 * 1024 * 1024 + 1) })
  f = loadFunction(sdk)
  r = await f.main({ copy_from: 'cloud://env.x/big.jpg', cloud_path: OK_PATH })
  ck('第二型共用同一个 4MB 上限（用户直传那一路账面允许 20MB，超了也只拒这一张）',
    r.error && /超过/.test(r.error) && sdk.calls.upload.length === 0, r.error)

  sdk = makeSdk({ buffer: PNG, throwOnDownload: 'file not exists' })
  f = loadFunction(sdk)
  r = await f.main({ copy_from: 'cloud://env.x/gone.jpg', cloud_path: OK_PATH })
  ck('取字节失败回 error 且不再往桶里写',
    r.error && /downloadFile/.test(r.error) && /file not exists/.test(r.error) && sdk.calls.upload.length === 0, r.error)
  ck('失败原因里带上 SDK 回的那段细节（不然现网没法归因）',
    /STORAGE_FILE_NONEXIST/.test(r.error || ''), r.error)

  sdk = makeSdk({ buffer: null })
  f = loadFunction(sdk)
  r = await f.main({ copy_from: 'cloud://env.x/a.jpg', cloud_path: OK_PATH })
  ck('downloadFile 回的不是 buffer 也算失败', r.error && /buffer/.test(r.error), r.error)

  sdk = makeSdk({ buffer: PNG, throwOnUpload: 'bucket busy' })
  f = loadFunction(sdk)
  r = await f.main({ copy_from: 'cloud://env.x/a.jpg', cloud_path: OK_PATH })
  ck('写桶失败回 error（不抛给网关）', r.error && /uploadFile/.test(r.error), r.error)

  sdk = makeSdk({ buffer: PNG, noFileID: true })
  f = loadFunction(sdk)
  r = await f.main({ copy_from: 'cloud://env.x/a.jpg', cloud_path: OK_PATH })
  ck('云开发没回 fileID 也算失败', r.error && /没回 fileID/.test(r.error), r.error)

  r = await f.main({ cloud_path: OK_PATH })
  ck('两型都没给时回的是"data 是空的"（老行为没被我改丢）', r.error && /data 是空的/.test(r.error), r.error)

  // ---------- 反向验证：把第二型那道地址闸门撤掉，上面那条必须红 ----------
  const GATE = /    const idErr = badFileID\(e\.copy_from\)\n    if \(idErr\) return \{ error: idErr \}\n/
  const mp = mutantPath(src, GATE, '')
  ck('反向验证的刀确实落到了源码上（撤掉了那道闸门）', !!mp, mp ? `临时副本 ${mp}` : '源码里找不到那段闸门，这条反向验证是空跑')
  if (mp) {
    sdk = makeSdk({ buffer: PNG })
    const fm = loadFunction(sdk, mp)
    const rm = await fm.main({ copy_from: 'https://cdn.example.com/a.jpg', cloud_path: OK_PATH })
    ck('撤掉闸门后那条判据会红（这把尺子有牙）',
      rm.error === undefined && sdk.calls.download.length === 1,
      `error=${JSON.stringify(rm.error)} download ${sdk.calls.download.length} 次`)
  }

  const bad = results.filter((x) => !x.ok)
  console.log(`\n合计 ${results.length} 条，不过 ${bad.length} 条`)
  bad.forEach((b) => console.log('  ✗ ' + b.name + ' · ' + b.detail))
  const toothless = bad.some((b) => b.name.indexOf('有牙') >= 0)
  if (TMP_DIR) fs.rmSync(TMP_DIR, { recursive: true, force: true })
  console.log('（这一把不写现网、不建对象：uploadFile/downloadFile 全是替身）')
  process.exit(bad.length ? (toothless ? 3 : 1) : 0)
})()
