const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 契约：{cloud_path, data(base64)} 进 → {fileID, bytes} 出。不认身份、不碰数据库、不含业务分支。
// 与 `../extract/index.js` 同一个纪律：这是一根哑管道，规则都留在调用方（后端 services/note_images.py）。
//
// **第二型（10-24 站长一句「转存必须带图。乙，复制一份到自己名下」）**：
//   {copy_from: 'cloud://…', cloud_path: 'images/<uid>/<day>/<rand>.jpg'} 进 → {fileID, bytes} 出。
// 为什么复制要在环境里做完、而不是"函数把源图字节回给后端、后端再走第一型传上来"：
// 后端口里没有存储凭据（见下面那段），字节要出环境只能过网关的 JSON＋base64——一张 500KB 的图
// 进出各胖 4/3，九张就是十几 MB 白走一遍公网，还多两次往返。而**环境内就是两个调用**：
// `downloadFile` 拿到 buffer、`uploadFile` 落成另一个路径。
//
// 为什么这一型仍然只管"搬一张"、不认"谁转存了谁"：转存者是谁、复制到哪一篇、几张、失败几张
// 全是后端的事（`services/note_images.py` 的 `copy_for_import`）。函数这里多一个业务分支，
// 下一根管道就得再抄一份规则——与第一型写"只拒超长，不判该不该存"是同一条纪律。
//
// 为什么必须有这一层（docs/方案-公众号贴图随笔记存档.md 第三节末）：
// `assets.object_key` 存的必须是**真进了云开发存储才存在**的那个 `cloud://` fileID，
// 而自建后端手里没有存储凭据（服务器 .env 现读：只有 WECHAT_*/JWT_*/ADMIN_*/HUNYUAN_CF_*/
// DATABASE_URL/REDIS_URL/CORS_ORIGINS/SHARE_QR_ENV_VERSION 那些键）。云函数跑在环境里，
// 天然写得进用户自己上传那张图所在的那个桶——所以字节要进同一个桶，就得穿这一层。
//
// 上限 4MB 与后端 `MAX_UPLOAD_BYTES` 同一个数：base64 过网关，两头都得先拒再说，
// 只靠"压缩之后应该不大"迟早会在某张怪图上把一次上传撑爆。
// ⚠ 第二型也吃这一个上限（同一个 4MB 常量，不分两档）：用户自己直传那一路的账面上限是 20MB
// （`models/asset.MAX_FILE_BYTES`），所以**确实存在超过 4MB 的原图**。超了就回 error，
// 后端那一条把这一张记成"没复制上"、其余照复制——与"一张的失败不许变成整篇的失败"同口径。

const MAX_BYTES = 4 * 1024 * 1024
const MAX_PATH_LEN = 300
// `assets.object_key` 是 String(500)，比它长的地址根本落不进账，函数这一头先拦住。
const MAX_FILE_ID_LEN = 500

function badPath(p) {
  if (typeof p !== 'string' || !p) return 'cloud_path 是空的'
  if (p.length > MAX_PATH_LEN) return `cloud_path 过长（${p.length}）`
  if (p[0] === '/') return 'cloud_path 不许以 / 开头'
  if (p.indexOf('..') >= 0) return 'cloud_path 里不许有 ..'
  if (/\s/.test(p)) return 'cloud_path 里有空白'
  // 只许往用户那一层前缀里写：与 miniprogram/utils/cloudUpload.js 那条路径规则同一层，
  // 桶的读写权限、按天前缀清理、以及"哪些对象属于我们这一篇"三件事都靠这一层成立。
  if (p.indexOf('images/') !== 0) return 'cloud_path 必须以 images/ 开头'
  return null
}

function badFileID(f) {
  // 第二型只认"云开发自己的地址"这一种形状。不是因为它危险——`downloadFile` 本来就只解得开
  // 本环境的 fileID——而是因为**判不出来的时候回一句人话，比让 SDK 抛一个看不懂的错好定位**。
  if (typeof f !== 'string' || !f) return 'copy_from 是空的'
  if (f.indexOf('cloud://') !== 0) return 'copy_from 不是 cloud:// 打头'
  if (f.length > MAX_FILE_ID_LEN) return `copy_from 过长（${f.length}），落不进 object_key 那一栏`
  return null
}

// 两型共用的那一段：拿到 buffer → 量一次 → 落进桶 → 回 fileID。
// 抽出来不是为了少写五行，是为了**"上限在哪量"这件事只有一处**：第一型量 base64 解出来的那份，
// 第二型量 downloadFile 拿回来的那份，两型必须用同一个 4MB、同一个报错形状，
// 否则调用方那一头得为两种失败各写一条判据。
async function putIntoBucket(buffer, cloudPath) {
  if (!buffer || !buffer.length) return { error: '要存的字节是空的' }
  if (buffer.length > MAX_BYTES) return { error: `这张 ${buffer.length} B 超过 ${MAX_BYTES} B 上限` }
  try {
    const r = await cloud.uploadFile({ cloudPath, fileContent: buffer })
    if (!r || !r.fileID) return { error: `云开发没回 fileID：${JSON.stringify(r).slice(0, 200)}` }
    return { fileID: r.fileID, bytes: buffer.length }
  } catch (err) {
    // 抛出来比回 500 好定位：网关会把未捕获异常压成一个看不出原因的调用失败
    const resp = err && err.response
    const detail = resp && resp.data ? JSON.stringify(resp.data).slice(0, 300) : ''
    return { error: `uploadFile 异常：${(err && err.message) || String(err)}${detail ? ' ' + detail : ''}` }
  }
}

exports.main = async (event) => {
  const e = event || {}
  const pathErr = badPath(e.cloud_path)
  if (pathErr) return { error: pathErr }

  // ---- 第二型：环境内复制一张（转存带图走这一支）----
  if (e.copy_from) {
    const idErr = badFileID(e.copy_from)
    if (idErr) return { error: idErr }
    let src
    try {
      src = await cloud.downloadFile({ fileID: e.copy_from })
    } catch (err) {
      const resp = err && err.response
      const detail = resp && resp.data ? JSON.stringify(resp.data).slice(0, 300) : ''
      return { error: `downloadFile 异常：${(err && err.message) || String(err)}${detail ? ' ' + detail : ''}` }
    }
    const buffer = src && src.fileContent
    if (!Buffer.isBuffer(buffer)) return { error: `downloadFile 没回 buffer（拿到的是 ${Object.prototype.toString.call(buffer)}）` }
    return await putIntoBucket(buffer, e.cloud_path)
  }

  if (typeof e.data !== 'string' || !e.data) return { error: 'data 是空的' }

  let buffer
  try {
    buffer = Buffer.from(e.data, 'base64')
  } catch (err) {
    return { error: `base64 解不开：${err && err.message ? err.message : String(err)}` }
  }
  // 解完再量：base64 那串本来就比真字节大 4/3，只量字符串等于把上限抬了一档
  return await putIntoBucket(buffer, e.cloud_path)
}
