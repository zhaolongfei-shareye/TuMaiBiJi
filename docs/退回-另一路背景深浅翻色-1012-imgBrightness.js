/**
 * 背景图深浅判断。三个主 tab 页（新建／笔记／我的）的形象图上方有文字，
 * 当前 .has-bg 一律翻暖白——换浅色壁纸时白字压在浅底上读不了。
 * 这一枚用 canvas 把图缩到 32×32 采一次平均亮度，结果存 localStorage，
 * 同一张图只算一次（路径做键，本地图片按路径缓存位图那条规矩在这里也成立）。
 *
 * 阈值 160（0–255）：默认半月档暗罩 opacity .5、罩色 rgba(18,20,26)，
 * 原图 160 压完 ≈ 89，白字对比度刚好过 4.5:1；再亮就兜不住了。
 */

const LUM_KEY_PREFIX = 'bgLum_'
const LIGHT_THRESHOLD = 160

/**
 * 分析一张背景图的亮度，返回 true = 浅色（字要翻深）。
 * @param {string} src  图片路径（本地 /assets/… 或云开发 cloud://…）
 * @param {string} canvasId  页面里那枚隐藏 canvas 的 id
 * @param {object} inst  页面实例（this），createSelectorQuery().in(inst) 要用
 * @returns {Promise<boolean>}
 */
function analyzeBgBrightness(src, canvasId, inst) {
  return new Promise((resolve) => {
    if (!src) return resolve(false)

    const cacheKey = LUM_KEY_PREFIX + src
    const cached = wx.getStorageSync(cacheKey)
    if (cached !== '' && cached !== undefined && cached !== null) {
      return resolve(Number(cached) > LIGHT_THRESHOLD)
    }

    const query = wx.createSelectorQuery().in(inst)
    query.select('#' + canvasId).fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return resolve(false)
      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const img = canvas.createImage()
      img.onload = () => {
        canvas.width = 32
        canvas.height = 32
        ctx.drawImage(img, 0, 0, 32, 32)
        let pixelData
        try {
          pixelData = ctx.getImageData(0, 0, 32, 32).data
        } catch (_) {
          return resolve(false)
        }
        let sum = 0
        const total = pixelData.length / 4
        for (let i = 0; i < pixelData.length; i += 4) {
          sum += 0.299 * pixelData[i] + 0.587 * pixelData[i + 1] + 0.114 * pixelData[i + 2]
        }
        const avg = sum / total
        wx.setStorageSync(cacheKey, Math.round(avg))
        resolve(avg > LIGHT_THRESHOLD)
      }
      img.onerror = () => resolve(false)
      img.src = src
    })
  })
}

/**
 * 清掉某张图的缓存（换壁纸时调用，避免旧值残留）。
 */
function clearBrightnessCache(src) {
  if (src) wx.removeStorageSync(LUM_KEY_PREFIX + src)
}

module.exports = { analyzeBgBrightness, clearBrightnessCache, LIGHT_THRESHOLD }
