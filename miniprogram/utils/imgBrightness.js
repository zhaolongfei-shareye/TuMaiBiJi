// 背景图深浅：三个主 tab 的形象图上压着字，壁纸换浅了那一档白字读不了。
// 这一枚用 canvas 2d 把图缩到 32×32 采一次平均亮度，结果按路径存本机，同一张图只算一次。
//
// 阈值 160（0–255）的来处：默认「半月」档罩子 opacity .5、罩色 rgba(18,20,26)，
// 原图亮度 160 压完 ≈89，纸白字对比刚好过 4.5:1；再亮就兜不住，那态改翻墨字。
//
// 三页只在 onShow 各调一次 applyTone（这一份是唯一实现，页面里不抄逻辑）；
// 键按路径存，写新值时把旧的 bgLum_ 扫掉，所以换过多少张壁纸都不留残值。

const LUM_KEY = 'bgLum_'
const LIGHT_THRESHOLD = 160

/** 本机算过的就读缓存，第一帧直接给对的深浅；没算过回 null（由 measure 补算）。 */
function cachedLight(src) {
  if (!src) return false
  const v = wx.getStorageSync(LUM_KEY + src)
  if (v === '' || v === undefined || v === null) return null
  return Number(v) > LIGHT_THRESHOLD
}

/** 只留当前这张：换壁纸后旧路径的读数一条条堆在 storage 里没人清，这里顺手扫干净。 */
function sweepKeep(src) {
  const keep = LUM_KEY + src
  const info = wx.getStorageInfoSync()
  ;(info.keys || []).forEach((k) => {
    if (k.indexOf(LUM_KEY) === 0 && k !== keep) wx.removeStorageSync(k)
  })
}

/** 缩图采一次平均亮度。采不成（图坏了、这台不支持离屏 2d、读像素被拒）回 null＝维持深底白字。
 *  用 `wx.createOffscreenCanvas` 而不是页面里那枚 `<canvas>`：页面内的画布是原生同层组件，
 *  真机上 `position:fixed;left:-9999px` 不保证把它移出流内（10-12 真机反馈「标题能上下拖」＝
 *  首屏被它顶出一截、整页变成可滚）。离屏这一套 `utils/imageCompress.js` 已在真机跑通。 */
function measure(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    let canvas
    try {
      canvas = wx.createOffscreenCanvas({ type: '2d', width: 32, height: 32 })
    } catch (e) {
      return resolve(null)
    }
    const img = canvas.createImage()
    img.onload = () => {
      let data
      try {
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, 32, 32)
        data = ctx.getImageData(0, 0, 32, 32).data
      } catch (e) {
        return resolve(null)
      }
      let sum = 0
      for (let i = 0; i < data.length; i += 4) {
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      }
      const avg = Math.round(sum / (data.length / 4))
      wx.setStorageSync(LUM_KEY + src, avg)
      sweepKeep(src)
      resolve(avg > LIGHT_THRESHOLD)
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/**
 * 页面 onShow 里唯一的那个调用点：先按本机已知的深浅出字并铺导航条，
 * 这张图没算过时异步补算，算完发现翻了才重设一次。
 * @param {object} page 页面实例
 * @param {string} src  poster.homeBg() 那一张
 */
function applyTone(page, src) {
  const app = getApp()
  const known = cachedLight(src)
  const light = known === null ? false : known
  page.setData({ bgLight: light })
  app.applyNavForBand(src, light)
  if (!src || known !== null) return
  measure(src).then((v) => {
    if (v === null || v === page.data.bgLight) return
    page.setData({ bgLight: v })
    app.applyNavForBand(src, v)
  })
}

module.exports = { applyTone, cachedLight, LIGHT_THRESHOLD }
