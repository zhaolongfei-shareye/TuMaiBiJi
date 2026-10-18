const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 契约：{cloud_path, data(base64)} 进 → {fileID, bytes} 出。不认身份、不碰数据库、不含业务分支。
// 与 `../extract/index.js` 同一个纪律：这是一根哑管道，规则都留在调用方（后端 services/note_images.py）。
//
// 为什么必须有这一层（docs/方案-公众号贴图随笔记存档.md 第三节末）：
// `assets.object_key` 存的必须是**真进了云开发存储才存在**的那个 `cloud://` fileID，
// 而自建后端手里没有存储凭据（服务器 .env 现读：只有 WECHAT_*/JWT_*/ADMIN_*/HUNYUAN_CF_*/
// DATABASE_URL/REDIS_URL/CORS_ORIGINS/SHARE_QR_ENV_VERSION 那些键）。云函数跑在环境里，
// 天然写得进用户自己上传那张图所在的那个桶——所以字节要进同一个桶，就得穿这一层。
//
// 上限 4MB 与后端 `MAX_UPLOAD_BYTES` 同一个数：base64 过网关，两头都得先拒再说，
// 只靠"压缩之后应该不大"迟早会在某张怪图上把一次上传撑爆。

const MAX_BYTES = 4 * 1024 * 1024
const MAX_PATH_LEN = 300

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

exports.main = async (event) => {
  const e = event || {}
  const pathErr = badPath(e.cloud_path)
  if (pathErr) return { error: pathErr }
  if (typeof e.data !== 'string' || !e.data) return { error: 'data 是空的' }

  let buffer
  try {
    buffer = Buffer.from(e.data, 'base64')
  } catch (err) {
    return { error: `base64 解不开：${err && err.message ? err.message : String(err)}` }
  }
  // 解完再量：base64 那串本来就比真字节大 4/3，只量字符串等于把上限抬了一档
  if (!buffer.length) return { error: '解出来是 0 字节' }
  if (buffer.length > MAX_BYTES) return { error: `这张 ${buffer.length} B 超过 ${MAX_BYTES} B 上限` }

  try {
    const r = await cloud.uploadFile({ cloudPath: e.cloud_path, fileContent: buffer })
    if (!r || !r.fileID) return { error: `云开发没回 fileID：${JSON.stringify(r).slice(0, 200)}` }
    return { fileID: r.fileID, bytes: buffer.length }
  } catch (err) {
    // 抛出来比回 500 好定位：网关会把未捕获异常压成一个看不出原因的调用失败
    const resp = err && err.response
    const detail = resp && resp.data ? JSON.stringify(resp.data).slice(0, 300) : ''
    return { error: `uploadFile 异常：${(err && err.message) || String(err)}${detail ? ' ' + detail : ''}` }
  }
}
