// 背景图深浅：三个主 tab 的形象图上压着字，那张图换浅了那一档白字读不了。
// 这一枚用 canvas 2d 把图缩到 32×32 采一次亮度，结果按路径存本机，同一张图只算一次。
//
// 阈值 160（0–255）的来处：默认「半月」档罩子 opacity .5、罩色 rgba(18,20,26)，
// 原图亮度 160 压完 ≈89，纸白字对比刚好过 4.5:1；再亮就兜不住，那态改翻墨字。
//
// **采哪一条**（10-12 真机抓到才改的，别改回去）：字只压在屏上头部那一段，判据也就只采那一段。
// 原来这里取的是**整张图的平均**，于是"上浅下暗"那一类图必判错——站长那张黑白合影：
// 标题落在浅墙上（实测那一条 208~219），可下半两大块黑衣＋黑字把全图平均压到 153 < 160，
// 判成"深"、标题留在纸白，压在那面墙上只有 **1.62:1**。取景照 `poster.bandGeom` 那一条公式
// （同一枚全站锚点 `BG_ANCHOR`），再取那一段顶部 TEXT_FRAC——三页的大字、那两行数字、
// 「调亮度／换背景」都在这一截里。
//
// 三页只在 onShow 各调一次 applyTone（这一份是唯一实现，页面里不抄逻辑）；
// 键按路径存，写新值时把旧的 bgLum_ 扫掉，所以换过多少张壁纸都不留残值。

const poster = require('./poster')

/* 键前缀带 V2：V1 那批值是"整张图平均"算出来的，同一张图换个统计口径不会自己重算，
   不升前缀的话他手机上那张黑白合影还留着 153 那条旧值，读缓存直接判深＝这一刀在他眼前等于没改。
   清扫（sweepKeep）按 `bgLum` 这个公共头扫，所以 V1 那批残值会在他下次换图时被一起带走。 */
const LUM_KEY = 'bgLumV2_'
const LUM_HEAD = 'bgLum'
const LIGHT_THRESHOLD = 160
const TEXT_FRAC = 0.3
const SIDE = 32

/** 屏上"字压着的那一条"落在画布的第几行到第几行。
 *  画布是整张图**压扁**成的 32×32，所以第 r 行＝原图高度 r/32 那一处，两个方向不用各算一遍。
 *  取景与 `poster.bandGeom(w, h, HEAD_IMG_H)` 同一条公式：按宽铺满时那一段往下挪 (byWidth−boxH)×15%，
 *  按高铺满时整张高度都在屏上（f0=0、f1=1）。 */
function textRows(w, h) {
  const boxH = poster.HEAD_IMG_H
  const byWidth = (750 * h) / w
  let f0 = 0
  let f1 = 1
  if (byWidth >= boxH) {
    f0 = ((byWidth - boxH) * poster.BG_ANCHOR) / byWidth
    f1 = f0 + boxH / byWidth
  }
  const r0 = Math.min(SIDE - 1, Math.floor(f0 * SIDE))
  const r1 = Math.min(SIDE, Math.max(r0 + 1, Math.ceil((f0 + (f1 - f0) * TEXT_FRAC) * SIDE)))
  return [r0, r1]
}

/** 本机算过的就读缓存，第一帧直接给对的深浅；没算过回 null（由 measure 补算）。 */
function cachedLight(src) {
  if (!src) return false
  const v = wx.getStorageSync(LUM_KEY + src)
  if (v === '' || v === undefined || v === null) return null
  return Number(v) > LIGHT_THRESHOLD
}

/** 只留当前这张：换壁纸后旧路径的读数一条条堆在 storage 里没人清，这里顺手扫干净。
 *  ⚠ 按公共头 `bgLum` 扫、不按 `LUM_KEY` 扫——口径升过一代（V1 全图平均 → V2 只采字压那一条），
 *  旧前缀那些键再也没人写、也没人读，只有这一句能带走它们。 */
function sweepKeep(src) {
  const keep = LUM_KEY + src
  const info = wx.getStorageInfoSync()
  ;(info.keys || []).forEach((k) => {
    if (k.indexOf(LUM_HEAD) === 0 && k !== keep) wx.removeStorageSync(k)
  })
}

/** 缩图采一次"字压着那一条"的亮度。采不成（图坏了、这台不支持离屏 2d、读像素被拒）回 null＝维持深底白字。
 *  用 `wx.createOffscreenCanvas` 而不是页面里那枚 `<canvas>`：页面内的画布是原生同层组件，
 *  真机上 `position:fixed;left:-9999px` 不保证把它移出流内（10-12 真机反馈「标题能上下拖」＝
 *  首屏被它顶出一截、整页变成可滚）。离屏这一套 `utils/imageCompress.js` 已在真机跑通。 */
function measure(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    let canvas
    try {
      canvas = wx.createOffscreenCanvas({ type: '2d', width: SIDE, height: SIDE })
    } catch (e) {
      return resolve(null)
    }
    const img = canvas.createImage()
    img.onload = () => {
      let data
      try {
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, SIDE, SIDE)
        data = ctx.getImageData(0, 0, SIDE, SIDE).data
      } catch (e) {
        return resolve(null)
      }
      const w = img.width || SIDE
      const h = img.height || SIDE
      const [r0, r1] = textRows(w, h)
      let sum = 0
      for (let r = r0; r < r1; r += 1) {
        for (let c = 0; c < SIDE; c += 1) {
          const i = (r * SIDE + c) * 4
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        }
      }
      const avg = Math.round(sum / ((r1 - r0) * SIDE))
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
