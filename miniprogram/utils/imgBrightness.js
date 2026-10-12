// 背景图深浅：三个主 tab 的形象图上压着字，那张图换浅了那一档白字读不了。
// 这一枚用 canvas 2d 把图缩成 32×32，**逐行**存亮度剖面（不是存一个平均数），
// 每页按自己那两截各判一次：上＝头部那几行大字与数字，下＝压在卡顶白纱上的那两行／首屏那行 Tips。
//
// 阈值 160（0–255）的来处：默认「半月」档罩子 opacity .5、罩色 rgba(18,20,26)，
// 原图亮度 160 压完 ≈89，纸白字对比刚好过 4.5:1；再亮就兜不住，那态改翻墨字。
//
// 为什么非要分上下两截（10-12 真机两刀追出来的，别再改回一个数）：
// ① 第一刀：原来取**整张图平均**。站长那张黑白合影上半是一整面浅墙（标题那一横带实测 208~219），
//    下半两大块黑衣＋那串黑字把全图平均压到 153.1 < 160 ⇒ 判"深"、标题留纸白 ⇒ 压在浅墙上 1.62:1。
//    ⇒ 改成只采"字压着的那一条"（V2）。
// ② 第二刀：一条判据仍撑不住两个落点——首屏那行 Tips 在屏高 ~68% 处，正压在那串黑字上，
//    整页翻"浅"之后标题对了、那一行反过来变成墨压暗底。他 10-12 21:1x：**「请按照上下部分来分别判断，
//    避免全图平均，造成差异」**。⇒ 存剖面、每页两截各判一次（V3）。
//
// 三页只在 onShow 各调一次 applyTone（这一份是唯一实现，页面里不抄逻辑）；
// 键按路径存，写新值时把旧的 bgLum 全扫掉，所以换过多少张壁纸都不留残值。

const poster = require('./poster')

/* 键前缀带版本号：同一张图换统计口径不会自己重算，不升前缀的话旧值还在，
   这一刀在他手机上等于没改（V1 全图平均 → V2 只采一条 → V3 存逐行剖面）。
   清扫按公共头 `bgLum` 扫，V1/V2 那批残值下次换图时一起带走。 */
const LUM_KEY = 'bgLumV3_'
const LUM_HEAD = 'bgLum'
const LIGHT_THRESHOLD = 160
const SIDE = 32

/** 一截"盒子比例"落在画布的第几行到第几行。
 *  画布是整张图**压扁**成的 32×32，所以第 r 行＝原图高度 r/32 那一处，两个方向不用各算一遍。
 *  盒子自身的取景同 `poster.bandGeom`：按宽铺满时往下挪 (byWidth−boxH)×anchor，
 *  按高铺满时整张高度都在屏上（b0=0、b1=1）。anchor 首页是 0.5（`aspectFill` 居中裁），
 *  列表与「我的」是 `poster.BG_ANCHOR`（全站那一枚 15%）。 */
function rowsFor(w, h, boxH, anchor, f0, f1) {
  const byWidth = (750 * h) / w
  let b0 = 0
  let b1 = 1
  if (byWidth >= boxH) {
    b0 = ((byWidth - boxH) * anchor) / byWidth
    b1 = b0 + boxH / byWidth
  }
  const r0 = Math.min(SIDE - 1, Math.floor((b0 + (b1 - b0) * f0) * SIDE))
  const r1 = Math.min(SIDE, Math.max(r0 + 1, Math.ceil((b0 + (b1 - b0) * f1) * SIDE)))
  return [r0, r1]
}

/** 那一截的亮度均值 >160 就是浅。剖面没算过（null）回 null，由 measure 补。 */
function zoneLight(prof, box, range) {
  if (!prof || !box || !range) return null
  const [r0, r1] = rowsFor(prof.w, prof.h, box.boxH, box.anchor, range[0], range[1])
  let sum = 0
  for (let r = r0; r < r1; r += 1) sum += prof.rows[r]
  return Math.round(sum / (r1 - r0)) > LIGHT_THRESHOLD
}

/** 本机算过的就读剖面，第一帧直接给对的深浅；没算过回 null。 */
function readProfile(src) {
  if (!src) return null
  const v = wx.getStorageSync(LUM_KEY + src)
  if (!v || typeof v !== 'object' || !Array.isArray(v.rows) || v.rows.length !== SIDE) return null
  return v
}

/** 只留当前这张：换壁纸后旧路径的读数一条条堆在 storage 里没人清，这里顺手扫干净。 */
function sweepKeep(src) {
  const keep = LUM_KEY + src
  const info = wx.getStorageInfoSync()
  ;(info.keys || []).forEach((k) => {
    if (k.indexOf(LUM_HEAD) === 0 && k !== keep) wx.removeStorageSync(k)
  })
}

/** 缩图采一次逐行亮度剖面。采不成（图坏了、这台不支持离屏 2d、读像素被拒）回 null＝维持深底白字。
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
      const rows = []
      for (let r = 0; r < SIDE; r += 1) {
        let sum = 0
        for (let c = 0; c < SIDE; c += 1) {
          const i = (r * SIDE + c) * 4
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        }
        rows.push(Math.round(sum / SIDE))
      }
      const prof = { w: img.width || SIDE, h: img.height || SIDE, rows }
      wx.setStorageSync(LUM_KEY + src, prof)
      sweepKeep(src)
      resolve(prof)
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/**
 * 页面 onShow 里唯一的那个调用点。
 * @param {object} page 页面实例
 * @param {string} src  poster.homeBg() 那一张
 * @param {object} zones 这一页那两截：{ boxH, anchor, top: [起, 止], low: [起, 止] }，
 *                       起止是**盒子比例**（0＝盒子顶、1＝盒子底）；
 *                       top 出 `bgLight`（头部大字、罩子、导航条），low 出 `bgLightLow`（压在卡顶白纱／图上的那几行小字）
 */
function applyTone(page, src, zones) {
  const app = getApp()
  const prof = readProfile(src)
  const both = (p) => ({
    bgLight: p === null ? false : zoneLight(p, zones, zones.top) === true,
    bgLightLow: p === null ? false : zoneLight(p, zones, zones.low) === true,
  })
  const t = both(prof)
  page.setData(t)
  app.applyNavForBand(src, t.bgLight)
  if (!src || prof) return
  measure(src).then((p) => {
    if (!p) return
    const n = both(p)
    if (n.bgLight === page.data.bgLight && n.bgLightLow === page.data.bgLightLow) return
    page.setData(n)
    app.applyNavForBand(src, n.bgLight)
  })
}

module.exports = { applyTone, readProfile, zoneLight, LIGHT_THRESHOLD }
