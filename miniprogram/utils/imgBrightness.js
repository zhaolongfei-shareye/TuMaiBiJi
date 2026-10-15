// 背景图深浅：三个主 tab 的形象图上压着字，那张图换浅了那一档白字读不了。
// 这一枚用 canvas 2d 把图缩成 32×32，**存这一张二维网格**（不是存一个平均数），
// 每页按自己那两截各判一次：上＝头部那几行大字与数字，下＝压在卡顶白纱上的那两行／首屏那行 Tips。
// 10-15 03:2x 站长再加一档：「计算深浅背景区域**仅限文字图片覆盖的区域**的平均值，不需要全屏计算。
// 包括三块设置也是只计算下方三行区域的平均值颜色」⇒ 除了那两截，还可以按**元素自己的矩形**判
// （见下面 `rectLights`／`applyRects`）。网格就是为这一档存的：V3 只存逐行均值，
// 横向只能整幅看，那一枚标题图占屏宽 3%~31%，整幅平均里全是右边的墙，判出来必然不对。
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
// ③ 第三刀（10-15）：上下两截还是"整幅宽的一条"，管不住**横向**——同一屏上左边那枚标题图压在
//    深色头发上、右边那一截是浅墙。他这句要的是"字压着的那一块"，所以采样的窗口要收到矩形。
//
// 三页只在 onShow 各调一次 applyTone（这一份是唯一实现，页面里不抄逻辑）；
// 键按路径存，写新值时把旧的 bgLum 全扫掉，所以换过多少张壁纸都不留残值。

const poster = require('./poster')

/* 键前缀带版本号：同一张图换统计口径不会自己重算，不升前缀的话旧值还在，
   这一刀在他手机上等于没改（V1 全图平均 → V2 只采一条 → V3 存逐行剖面 → V4 存二维网格）。
   清扫按公共头 `bgLum` 扫，V1/V2/V3 那批残值下次换图时一起带走。 */
const LUM_KEY = 'bgLumV4_'
const LUM_HEAD = 'bgLum'
const LIGHT_THRESHOLD = 160
const SIDE = 32

/** 一张 w×h 的图按 `aspectFill` 摆进 750×boxH 这只盒子之后，**盒子里看到的是原图的哪一段**
    （两轴都用 0~1 的"原图比例"说话）。纵向那一段由 `anchor` 定（首页居中裁 0.5、
    列表与「我的」用全站那一枚 15%），横向 `aspectFill` 只有居中一种，所以写死 0.5。
    按宽铺满时图比盒子高 ⇒ 裁上下、横向整幅（x0=0、x1=1）；按高铺满时图比盒子宽 ⇒ 裁左右、
    纵向整幅。这正是原来 `rowsFor` 里那两行，抽出来是为了让横向也能算——
    10-15 那一刀要把采样窗口收到元素自己的矩形，只会算上下截不够。 */
function visible(w, h, boxH, anchor) {
  const byWidth = (750 * h) / w
  if (byWidth >= boxH) {
    const y0 = ((byWidth - boxH) * anchor) / byWidth
    return { x0: 0, x1: 1, y0, y1: y0 + boxH / byWidth }
  }
  // 按宽铺满时图不够高 ⇒ `aspectFill` 改按**高**铺满，这时候被裁的是左右。
  // ⚠ 这一支第一次落码时把"按高铺满之后有多宽"写成了 `750×w/h`（那是"高铺到 750 时有多宽"，
  //   与这只盒子 1448 的高没关系），拿它去除 750 会回一个 >1 的数 ⇒ x0 变成负数、
  //   取列时越界成 undefined ⇒ 整块平均 NaN ⇒ 判据一律回 false。
  //   站长 10-15 03:2x 那一刀当时屏上就是"三枚全按深底出白字"，靠这句才查回来。
  const fitWidth = (boxH * w) / h
  const x0 = (1 - 750 / fitWidth) * 0.5
  return { x0, x1: x0 + 750 / fitWidth, y0: 0, y1: 1 }
}

/** 一截"盒子比例"落在画布的第几行到第几行。
 *  画布是整张图**压扁**成的 32×32，所以第 r 行＝原图高度 r/32 那一处，两个方向不用各算一遍。 */
function rowsFor(w, h, boxH, anchor, f0, f1) {
  const v = visible(w, h, boxH, anchor)
  const r0 = Math.min(SIDE - 1, Math.floor((v.y0 + (v.y1 - v.y0) * f0) * SIDE))
  const r1 = Math.min(SIDE, Math.max(r0 + 1, Math.ceil((v.y0 + (v.y1 - v.y0) * f1) * SIDE)))
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

/** 一个**矩形**的亮度均值 >160 就是浅。`rect` 的两组数都是"盒子比例"（0＝盒子那一条边的起点）。
 *  这就是站长 10-15 03:2x 要的那一档：窗口只框住字／图自己压着的那一块，不再整幅取一条。
 *  老剖面（V3 那份只有 rows、没有 grid）回 null ⇒ 调用方按"判不出＝维持深底白字"那一档走。 */
function rectLight(prof, box, rect) {
  if (!prof || !prof.grid || !box || !rect || !rect.x || !rect.y) return null
  const v = visible(prof.w, prof.h, box.boxH, box.anchor)
  // 两头都夹进 [0, SIDE]：越界一格就会读到 undefined，`sum += undefined` 把整块平均变成 NaN，
  // 而 `NaN > 160` 是 false ⇒ **静默判成"深底"**，屏上表现为"三枚全出白字"、一句错都不报。
  const span = (a, b, f0, f1) => {
    const c0 = Math.max(0, Math.min(SIDE - 1, Math.floor((a + (b - a) * f0) * SIDE)))
    const c1 = Math.max(c0 + 1, Math.min(SIDE, Math.ceil((a + (b - a) * f1) * SIDE)))
    return [c0, c1]
  }
  const [c0, c1] = span(v.x0, v.x1, rect.x[0], rect.x[1])
  const [r0, r1] = span(v.y0, v.y1, rect.y[0], rect.y[1])
  let sum = 0
  for (let r = r0; r < r1; r += 1) {
    const row = prof.grid[r]
    for (let c = c0; c < c1; c += 1) sum += row[c]
  }
  const avg = sum / ((r1 - r0) * (c1 - c0))
  return Number.isFinite(avg) ? Math.round(avg) > LIGHT_THRESHOLD : null
}

/** 本机算过的就读网格，第一帧直接给对的深浅；没算过回 null。 */
function readProfile(src) {
  if (!src) return null
  const v = wx.getStorageSync(LUM_KEY + src)
  if (!v || typeof v !== 'object' || !Array.isArray(v.rows) || v.rows.length !== SIDE) return null
  // V4 才有 grid；V3 那份读回来 rows 是好的、grid 没有 ⇒ 两截那一档照判，
  // 矩形那一档回 null（`rectLight` 自己挡），下一次 measure 会把它补成 V4。
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
      const grid = []
      for (let r = 0; r < SIDE; r += 1) {
        const line = []
        for (let c = 0; c < SIDE; c += 1) {
          const i = (r * SIDE + c) * 4
          line.push(Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]))
        }
        grid.push(line)
        rows.push(Math.round(line.reduce((s, v) => s + v, 0) / SIDE))
      }
      const prof = { w: img.width || SIDE, h: img.height || SIDE, rows, grid }
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
  /* 无图这一档先分流，不跟着下面那套"按像素判极性"走。
     §8.234 第 0 步要的是**显式的无图分支**，而不是让 `p === null ? false` 那一档巧合地落在墨字上：
     三页那些翻色规则全都挂在 `.has-bg` 底下，没有图就没有这个名字 ⇒ 屏上吃的就是基样式那一套墨字，
     导航条也不在这里设（10-15 那一刀之后它只跟心情走，见下面那段注释），
     落回 `applyTheme` 进门那一趟。
     实测过才敢这么写：三屏 × 四套壁纸 ＝ 12 个组合、48 枚字，无图态对比度全 ≥4.5
     （`docs/工具/量-无图态字色-真跑.js` ＋ `量-无图态字色.py`，10-14）。
     这两枚 data 在没有图时其实是"没有样式吃它"的死值，这里照样归置成 false，
     免得哪一天有人加一条不带 `.has-bg` 的 `.bg-light` 规则，把白底上的墨字翻成白字。 */
  if (!src) {
    page.setData({ bgLight: false, bgLightLow: false })
    return
  }
  const prof = readProfile(src)
  const both = (p) => ({
    bgLight: p === null ? false : zoneLight(p, zones, zones.top) === true,
    bgLightLow: p === null ? false : zoneLight(p, zones, zones.low) === true,
  })
  const t = both(prof)
  page.setData(t)
  /* 这一趟不碰顶上那一条（站长 10-15 拍甲之后）：它的值只剩"当前那一档心情"一个来源，
     由 `app.applyNav()` 在 `applyTheme` 里发——每一页进门都会走那一趟，深浅这一档不再参与。
     原来这里按 `bgLight` 发两枚写死的 hex，于是同一条栏在铺图页与没铺图页两套真相。 */
  if (!src || prof) return
  measure(src).then((p) => {
    if (!p) return
    const n = both(p)
    if (n.bgLight === page.data.bgLight && n.bgLightLow === page.data.bgLightLow) return
    page.setData(n)
  })
}

/** 按元素自己的矩形各判一次深浅（站长 10-15 03:2x 那一刀，理由抄在文件头 ③）。
 *  @param page  页面实例
 *  @param src   poster.homeBg() 那一张；空串＝这一屏没铺图
 *  @param box   { boxH, anchor }——这一屏形象图那只盒子（与 applyTone 用的同一只）
 *  @param rects { title: { x:[f0,f1], y:[f0,f1] }, swap: {...}, ... }
 *               两组数都是**盒子比例**（0＝盒子那条边的起点、1＝终点），由页面从
 *               `boundingClientRect` 自己折算——元素在哪儿只有页面知道，这一份只管"那一块是深是浅"。
 *  写回 data 的键＝`bgLight` ＋ 首字母大写的名字 ⇒ title→bgLightTitle、swap→bgLightSwap。
 *  三条出口都要挡：① 没铺图 ⇒ 全 false（没有"深"可判，字吃基样式那支墨）；
 *  ② 这台算不出网格（离屏画布不可用、图坏了）⇒ 也全 false，**不许**悄悄退回去按整幅平均判
 *    （那正是他这一刀要打掉的东西）；③ 本机存的是 V3 那份没有 grid 的老剖面 ⇒ measure 补一次。 */
function applyRects(page, src, box, rects) {
  const keys = Object.keys(rects || {})
  if (!src || !keys.length) {
    const off = {}
    keys.forEach((k) => { off['bgLight' + k.charAt(0).toUpperCase() + k.slice(1)] = false })
    if (keys.length) page.setData(off)
    return
  }
  const fold = (p) => {
    const d = {}
    keys.forEach((k) => {
      d['bgLight' + k.charAt(0).toUpperCase() + k.slice(1)] = rectLight(p, box, rects[k]) === true
    })
    return d
  }
  const prof = readProfile(src)
  if (prof && prof.grid) return page.setData(fold(prof))
  measure(src).then((p) => { if (p && p.grid) page.setData(fold(p)) })
}

module.exports = { applyTone, applyRects, readProfile, zoneLight, rectLight, LIGHT_THRESHOLD }
