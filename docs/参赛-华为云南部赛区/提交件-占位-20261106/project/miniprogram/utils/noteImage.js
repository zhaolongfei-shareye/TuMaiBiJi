// 卡片模板上那枚**大图位**吃哪一张（站长 10-18）：
//   「把配图第一张取代之前的头像图片，但只针对大图替换，小图（名字前面的圆形占位）仍然还是头像图片」
// 所以本文件只管一件事：拿到"这一篇的第一张配图、本机能解码的那一条路径"。
// 拿不到就回 null ⇒ 出图那一路按"这篇没配图"走，大图位回退成头像（就是 10-18 之前那一版），
// 取图失败从来不该让一张卡片出不来。
//
// ⚠ 三条口径：
//  · "第一张"跟着服务端那一行 `order_by(Asset.id.asc())`（backend/app/api/routes/assets.py），
//    与详情窗那一排最左、通栏大图那一张是同一张。客户端不许自己再排一次序。
//  · `cloud://…` 那个地址在没 init 过云环境的地方画不出来 ⇒ 先过 `cloudReady()` 再打请求
//    （与详情窗、列表封面同一条门；判据也各自钉过这道门不许省）。
//  · 私密篇没解锁时服务端直接回**空数组**（那是闸，不是故障），这里同样回 null。
//
// 缓存只记"清单和字节是配对的哪一次"：每次都现读清单（一次 GET，很便宜），
// 只有第一张的 fileID 换了才重新下字节。删掉／换掉配图之后再来一次就拿到新的，
// 不会拿着上一张的路径画这一张（同名换内容那一坑的变种）。
const api = require('./api.js')
const cloudUpload = require('./cloudUpload.js')

// noteId → { fileID, path }
const CACHE = {}

function _download(fileID) {
  return new Promise((resolve) => {
    wx.cloud.downloadFile({
      fileID,
      success: (r) => resolve((r && r.tempFilePath) || null),
      // 不下"整篇都没图"的结论：这一趟失败只说明这次没拿到，下一趟照旧再试
      fail: (e) => {
        console.warn('卡片大图位没取到配图（这张卡照旧用头像）:', (e && e.errMsg) || e)
        resolve(null)
      },
    })
  })
}

/** 回这一篇第一张配图的本机路径；没有／取不到／云没就绪 ⇒ null。 */
async function firstImage(noteId) {
  if (!noteId || !cloudUpload.cloudReady()) return null
  let list
  try {
    list = await api.getNoteAssets(noteId)
  } catch (err) {
    console.warn('配图清单没读到（这张卡照旧用头像）:', err && (err.errMsg || err.statusCode))
    return null
  }
  const rows = Array.isArray(list) ? list : []
  const first = rows.find((x) => x && x.cloud_url) || null
  const key = String(noteId)
  const hit = CACHE[key]
  if (first && hit && hit.fileID === first.cloud_url && hit.path) return hit.path
  const path = first ? await _download(first.cloud_url) : null
  if (first && path) CACHE[key] = { fileID: first.cloud_url, path }
  else delete CACHE[key]
  return path || null
}

module.exports = { firstImage }
