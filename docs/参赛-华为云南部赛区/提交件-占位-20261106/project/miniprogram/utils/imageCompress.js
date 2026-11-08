// 备份用的图片压缩：把一张截图/照片压到"能存进云开发免费额度"的那一档。
//
// 为什么不用 `wx.compressImage`：它只降质量、**不改尺寸**。一张 4000×3000 的手机截图
// 就算 q30 也常常还在 500KB 以上，而配额算的就是字节数（docs/图片云备份-开发方案.md §二：
// 5GB ÷ 500KB ≈ 一万张）。尺寸这一步必须自己下刀，所以走离屏 canvas 重绘。
//
// 失败一律返回 null，不抛：这条链是 B 链，它的任何一次失败都不该让"笔记没存下来"。
// 调用方拿到 null 自己决定退路（原样上传那张，或者放弃这张）。

const MAX_LONG_EDGE = 1920
const BUDGET_BYTES = 500 * 1024
// 从 0.7 往下试三档。第三档还超就交最后一次的结果——"宁可大一点也不丢图"
// 是方案里写死的取舍：少一张图对用户是看得见的丢失，多占 200KB 是看不见的。
const QUALITY_LADDER = [0.7, 0.5, 0.3]

const _info = (src) => new Promise((resolve) => {
  wx.getImageInfo({ src, success: resolve, fail: () => resolve(null) })
})

const _fileSize = (path) => new Promise((resolve) => {
  try {
    wx.getFileSystemManager().getFileInfo({
      filePath: path,
      success: (r) => resolve(r.size),
      fail: () => resolve(null),
    })
  } catch (e) {
    resolve(null)
  }
})

const _draw = (src, w, h) => new Promise((resolve) => {
  let canvas
  try {
    canvas = wx.createOffscreenCanvas({ type: '2d', width: w, height: h })
  } catch (e) {
    resolve(null)
    return
  }
  const img = canvas.createImage()
  img.onload = () => {
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, w, h)
    resolve(canvas)
  }
  img.onerror = () => resolve(null)
  img.src = src
})

const _export = (canvas, w, h, quality) => new Promise((resolve) => {
  wx.canvasToTempFilePath({
    canvas,
    // destWidth/destHeight 必须显式给：不给的话它按 canvas 尺寸 × 设备像素比再放大一倍，
    // 我们这里算出来的 w/h 已经是"最终要的那张图"的像素，再乘一次 pixelRatio 就白压了。
    x: 0, y: 0, width: w, height: h, destWidth: w, destHeight: h,
    fileType: 'jpg',
    quality,
    success: (r) => resolve(r.tempFilePath),
    fail: () => resolve(null),
  })
})

/**
 * @param {string} srcPath 原图的 tempFilePath
 * @returns {Promise<{path:string, bytes:number|null, width:number, height:number, quality:number, overBudget:boolean}|null>}
 *          null = 这张压不了（读不到图/画不出来），调用方自己决定退路
 */
async function compressForBackup(srcPath) {
  if (!srcPath) return null
  const info = await _info(srcPath)
  if (!info || !info.width || !info.height) return null

  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(info.width, info.height))
  const w = Math.max(1, Math.round(info.width * scale))
  const h = Math.max(1, Math.round(info.height * scale))

  const canvas = await _draw(srcPath, w, h)
  if (!canvas) return null

  let last = null
  for (const q of QUALITY_LADDER) {
    const path = await _export(canvas, w, h, q)
    if (!path) break
    const bytes = await _fileSize(path)
    last = { path, bytes, width: w, height: h, quality: q, overBudget: !!bytes && bytes > BUDGET_BYTES }
    if (!last.overBudget) return last
  }
  // 三档都超：交最后一次能拿到的那张。bytes 为 null（取不到文件大小）时也照交——
  // 拿不到大小不等于图坏了，拦下来反而丢图。
  return last
}

module.exports = { compressForBackup, MAX_LONG_EDGE, BUDGET_BYTES, QUALITY_LADDER }
