// 分享海报的绘制引擎。
//
// 为什么从 share.js 里搬出来：模板要长到好几套，而每套的结构不一样（有的整屏铺色、
// 有的白卡、有的只要一句大字）。如果继续用"一个模板一份画布代码"，加一套就得抄一遍
// 量高度的逻辑，改一处漏一处。所以这里定成两件事：模板只负责**产出图层列表**，
// 一个通用绘制器负责把图层落到画布上。坐标在产出阶段全部算完，落笔阶段不再换算法。
//
// 色只从 palette.js 出。头像、名称、slogan 全部来自本机 storage（见 readProfile），
// 服务器不存任何一张用户图片。
const { toneFor, mix } = require('./palette.js')
const { formatShortDate } = require('./date.js')
const { t } = require('./i18n.js')

const W = 750
const INK = '#23252C'
const BODY = '#3C4046'
const MUTED = '#9A9EA6'
const PAPER = '#FFFFFF'

const PROFILE_KEY = 'poster_profile'
const AVATAR_NAME = 'poster-avatar.img'
const AVATAR_STAGED = 'poster-avatar-staged.img'
const DEFAULT_TEMPLATE = 'card'

const TEMPLATES = [
  { id: 'card', label: '经典卡片' },
  { id: 'quote', label: '金句大字' },
  { id: 'block', label: '撞色块' },
  { id: 'clean', label: '极简' },
]

// ---------------------------------------------------------------- 本地形象

function readProfile() {
  const p = wx.getStorageSync(PROFILE_KEY)
  return p && typeof p === 'object' ? p : {}
}

function writeProfile(patch) {
  const next = Object.assign({}, readProfile(), patch)
  wx.setStorageSync(PROFILE_KEY, next)
  return next
}

function exists(p) {
  if (!p) return false
  try {
    wx.getFileSystemManager().accessSync(p)
    return true
  } catch (e) {
    return false
  }
}

// 已经存下来的那张头像。文件被系统清掉时回退成空，海报就退回"没有头像"的样子。
function avatarPath() {
  const p = readProfile().avatarPath
  return exists(p) ? p : ''
}

function copyTo(src, name) {
  const dest = `${wx.env.USER_DATA_PATH}/${name}`
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().copyFile({ filePath: src, destPath: dest, success: () => resolve(dest), fail: reject })
  })
}

// 选完先落到"暂存"这个名字，点保存才搬到正式名字。
// 直接覆盖正式文件的话，用户选完图不点保存，海报也会跟着换成他没收的图。
function stageAvatar(tempPath) {
  return copyTo(tempPath, AVATAR_STAGED)
}

function commitAvatar(stagedPath) {
  return copyTo(stagedPath, AVATAR_NAME)
}

function dropAvatar() {
  try {
    wx.getFileSystemManager().unlinkSync(`${wx.env.USER_DATA_PATH}/${AVATAR_NAME}`)
  } catch (e) {
    // 没存过就会走到这里，不是错误
  }
}

// ---------------------------------------------------------------- 图层

const L = {
  fill: (x, y, w, h, color) => ({ k: 'fill', x, y, w, h, color }),
  grad: (x, y, w, h, c1, c2) => ({ k: 'grad', x, y, w, h, c1, c2 }),
  rrect: (x, y, w, h, r, o) => Object.assign({ k: 'rrect', x, y, w, h, r }, o || {}),
  // y 是第一行基线，与 canvas 的 fillText 语义一致
  text: (o) => Object.assign({ k: 'text', lines: [], lh: 40, size: 28, weight: 'normal', color: INK, align: 'left' }, o),
  circle: (x, y, r, o) => Object.assign({ k: 'circle', x, y, r }, o || {}),
  image: (key, x, y, w, h, o) => Object.assign({ k: 'image', key, x, y, w, h }, o || {}),
  avatar: (x, y, d, o) => Object.assign({ k: 'avatar', x, y, d, ring: 0 }, o || {}),
}

// 头像、二维码都要先解码成位图才能进画布。解码异常时 onload/onerror 可能一个都不
// 触发，所以带超时；返回 null 让海报少一块图继续出，而不是整张出不来。
function loadImage(canvas, src, timeoutMs) {
  if (!src) return Promise.resolve(null)
  return new Promise((done) => {
    const img = canvas.createImage()
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      done(ok ? { img, w: img.width, h: img.height } : null)
    }
    const timer = setTimeout(() => finish(false), timeoutMs || 4000)
    img.onload = () => finish(true)
    img.onerror = () => finish(false)
    img.src = src
  })
}

function ensureRoundRect(ctx) {
  // 部分基础库/机型没有 roundRect，直接调用会抛 TypeError 并让整张图出不来
  if (typeof ctx.roundRect === 'function') return
  ctx.roundRect = function (x, y, w, h, r) {
    const rad = Math.max(0, Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2))
    this.beginPath()
    this.moveTo(x + rad, y)
    this.arcTo(x + w, y, x + w, y + h, rad)
    this.arcTo(x + w, y + h, x, y + h, rad)
    this.arcTo(x, y + h, x, y, rad)
    this.arcTo(x, y, x + w, y, rad)
    this.closePath()
    return this
  }
}

function paintLayers(ctx, layers, images) {
  ensureRoundRect(ctx)
  for (const ly of layers) {
    switch (ly.k) {
      case 'fill':
        ctx.fillStyle = ly.color
        ctx.fillRect(ly.x, ly.y, ly.w, ly.h)
        break
      case 'grad': {
        const g = ctx.createLinearGradient(ly.x, ly.y, ly.x, ly.y + ly.h)
        g.addColorStop(0, ly.c1)
        g.addColorStop(1, ly.c2)
        ctx.fillStyle = g
        ctx.fillRect(ly.x, ly.y, ly.w, ly.h)
        break
      }
      case 'rrect':
        if (ly.shadow) {
          ctx.shadowColor = ly.shadow
          ctx.shadowBlur = ly.shadowBlur || 30
          ctx.shadowOffsetY = ly.shadowY || 8
        }
        ctx.beginPath()
        ctx.roundRect(ly.x, ly.y, ly.w, ly.h, ly.r)
        if (ly.fill) {
          ctx.fillStyle = ly.fill
          ctx.fill()
        }
        if (ly.shadow) {
          ctx.shadowColor = 'transparent'
          ctx.shadowBlur = 0
          ctx.shadowOffsetY = 0
        }
        if (ly.stroke) {
          ctx.lineWidth = ly.strokeWidth || 2
          ctx.strokeStyle = ly.stroke
          ctx.stroke()
        }
        break
      case 'circle':
        ctx.beginPath()
        ctx.arc(ly.x, ly.y, ly.r, 0, Math.PI * 2)
        if (ly.fill) {
          ctx.fillStyle = ly.fill
          ctx.fill()
        }
        if (ly.stroke) {
          ctx.lineWidth = ly.strokeWidth || 2
          ctx.strokeStyle = ly.stroke
          ctx.stroke()
        }
        break
      case 'text': {
        ctx.font = `${ly.weight === 'bold' ? 'bold ' : ''}${ly.size}px sans-serif`
        ctx.fillStyle = ly.color
        ctx.textAlign = ly.align
        if (ly.alpha != null) ctx.globalAlpha = ly.alpha
        let y = ly.y
        for (const line of ly.lines) {
          ctx.fillText(line, ly.x, y)
          y += ly.lh
        }
        if (ly.alpha != null) ctx.globalAlpha = 1
        ctx.textAlign = 'left'
        break
      }
      case 'image': {
        const im = images && images[ly.key]
        if (!im || !im.img) {
          // 设置页的小样里没有真小程序码，留一块浅底占位，预览才和成品对得上
          if (ly.placeholder) {
            ctx.fillStyle = ly.placeholder
            if (ly.r) {
              ctx.beginPath()
              ctx.roundRect(ly.x, ly.y, ly.w, ly.h, ly.r)
              ctx.fill()
            } else {
              ctx.fillRect(ly.x, ly.y, ly.w, ly.h)
            }
          }
          break
        }
        if (ly.clipCircle) {
          ctx.save()
          ctx.beginPath()
          ctx.arc(ly.x + ly.w / 2, ly.y + ly.h / 2, Math.min(ly.w, ly.h) / 2, 0, Math.PI * 2)
          ctx.clip()
          drawCover(ctx, im, ly.x, ly.y, ly.w, ly.h)
          ctx.restore()
        } else {
          drawCover(ctx, im, ly.x, ly.y, ly.w, ly.h)
        }
        break
      }
      case 'avatar': {
        const im = images && images.avatar
        const cx = ly.x + ly.d / 2
        const cy = ly.y + ly.d / 2
        if (im && im.img) {
          ctx.save()
          ctx.beginPath()
          ctx.arc(cx, cy, ly.d / 2, 0, Math.PI * 2)
          ctx.clip()
          drawCover(ctx, im, ly.x, ly.y, ly.d, ly.d)
          ctx.restore()
        } else {
          // 没设头像时留一个同色圆，署名行不至于缺一块就歪
          ctx.beginPath()
          ctx.arc(cx, cy, ly.d / 2, 0, Math.PI * 2)
          ctx.fillStyle = ly.fallback || 'rgba(255,255,255,0.22)'
          ctx.fill()
        }
        if (ly.ring) {
          ctx.beginPath()
          ctx.arc(cx, cy, ly.d / 2 + ly.ring / 2, 0, Math.PI * 2)
          ctx.lineWidth = ly.ring
          ctx.strokeStyle = ly.ringColor || PAPER
          ctx.stroke()
        }
        break
      }
      default:
        break
    }
  }
}

// 正方形原图塞进任意比例的块里会变形，所以等比放大到铺满、再居中裁。
function drawCover(ctx, im, x, y, w, h) {
  if (!im.w || !im.h) {
    ctx.drawImage(im.img, x, y, w, h)
    return
  }
  const scale = Math.max(w / im.w, h / im.h)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(im.img, (im.w - sw) / 2, (im.h - sh) / 2, sw, sh, x, y, w, h)
}

// ---------------------------------------------------------------- 排版原语

function wrap(ctx, text, maxW) {
  const lines = []
  let cur = ''
  for (const ch of String(text == null ? '' : text)) {
    if (ctx.measureText(cur + ch).width > maxW && cur) {
      lines.push(cur)
      cur = ch
    } else {
      cur += ch
    }
  }
  if (cur) lines.push(cur)
  return lines
}

function clip(ctx, text, maxW) {
  const s = String(text == null ? '' : text)
  if (ctx.measureText(s).width <= maxW) return s
  let out = s
  while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1)
  return out + '…'
}

// 取满 n 行，超出部分在最后一行加省略号
function fit(ctx, text, maxW, n) {
  const all = wrap(ctx, text, maxW)
  if (all.length <= n) return all
  const out = all.slice(0, n)
  out[n - 1] = clip(ctx, out[n - 1], maxW)
  return out
}

function font(ctx, size, bold) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px sans-serif`
}

// 海报上"这条笔记属于哪儿"那行小字，和列表/详情同一条规则：第一个标签优先
function blockNameOf(note, lang) {
  const firstTag = (note.tags || []).map((x) => (x || '').trim()).find(Boolean) || ''
  return firstTag || note.category_name || (note.category_id == null ? t('noCategory', lang) : '')
}

function sourceLabelOf(note, lang) {
  const keys = {
    wechat_article: 'sourceWechatArticle',
    web_article: 'sourceWebArticle',
    screenshot: 'sourceScreenshot',
    manual: 'sourceManual',
  }
  const key = keys[note.source_type]
  return key ? t(key, lang) : note.source_type || ''
}

// 金句：要点第一条最像"值得转发的一句话"，没有就退到摘要首句，再退到标题
function quoteOf(note) {
  const kp = (note.key_points || []).map((x) => (x || '').trim()).find(Boolean)
  if (kp) return kp
  const sum = (note.summary || '').trim()
  if (sum) {
    const first = sum.split(/[。！？!?\n]/).map((s) => s.trim()).find((s) => s.length > 4)
    if (first) return first + '。'
  }
  return (note.title || '').trim()
}

// ---------------------------------------------------------------- 署名区
//
// 头像 + 名称 + slogan。三种模板共用一个排法，只是配色和位置不同。
// 返回图层和这一块占掉的总高度，让调用方接着往下排。

function signRow({ ctx, x, y, maxW, size, avatarD, onDark, profile, hasAvatar }) {
  const name = (profile.name || '').trim()
  const slogan = (profile.slogan || '').trim()
  if (!name && !slogan && !hasAvatar) return { layers: [], h: 0 }
  const layers = []
  const main = onDark ? PAPER : INK
  const sub = onDark ? 'rgba(255,255,255,0.72)' : MUTED
  if (hasAvatar) {
    layers.push(L.avatar(x, y, avatarD, {
      fallback: onDark ? 'rgba(255,255,255,0.22)' : 'rgba(35,37,44,0.08)',
    }))
  }
  const tx = hasAvatar ? x + avatarD + 22 : x
  const textW = Math.max(60, x + maxW - tx)
  const sSize = Math.round(size * 0.8)
  let textBottom = y
  if (name) {
    font(ctx, size, true)
    layers.push(L.text({ x: tx, y: y + size, lines: [clip(ctx, name, textW)], size, weight: 'bold', color: main }))
    textBottom = y + size
  }
  if (slogan) {
    font(ctx, sSize, false)
    const sy = name ? y + size + 16 + sSize : y + sSize
    layers.push(L.text({ x: tx, y: sy, lines: [clip(ctx, slogan, textW)], size: sSize, color: sub }))
    textBottom = sy
  }
  return { layers, h: Math.max(hasAvatar ? avatarD : 0, textBottom - y + 8) }
}

// ---------------------------------------------------------------- 模板

function planCard(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const tone = toneFor(note.category_id)
  const cardX = 40
  const cardY = 60
  const pad = 44
  const radius = 44
  const block = 148
  const titleSize = 34
  const titleLH = 46
  const metaSize = 22
  const bodySize = 27
  const bodyLH = 40
  const pointSize = 26
  const pointLH = 42
  const qrSize = 120

  const cardW = W - cardX * 2
  const contentX = cardX + pad
  const contentW = cardW - pad * 2
  const titleX = contentX + block + 24
  const titleW = contentW - block - 24

  font(ctx, titleSize, true)
  const titleLines = fit(ctx, note.title || '', titleW, 3)
  const bandH = pad * 2 + Math.max(block, titleLines.length * titleLH)

  font(ctx, metaSize, true)
  const metaLine = clip(ctx, [sourceLabelOf(note, lang), (note.tags || []).join(' / ')].filter(Boolean).join(' · '), contentW)

  font(ctx, bodySize, false)
  const summaryLines = note.summary ? fit(ctx, note.summary, contentW, 4) : []

  font(ctx, pointSize, false)
  const points = (note.key_points || []).slice(0, 5).map((p) => clip(ctx, p, contentW - 50))

  const metaY = cardY + bandH + 56
  let bottom = metaY + 8
  let summaryTop = 0
  if (summaryLines.length) {
    summaryTop = bottom + 40
    bottom = summaryTop + (summaryLines.length - 1) * bodyLH + 8
  }
  let pointsTop = 0
  if (points.length) {
    pointsTop = bottom + 40
    bottom = pointsTop + 44 + (points.length - 1) * pointLH + 8
  }

  // 署名行放在码上方；没有形象信息时这块高度为 0，与改版前逐像素一致
  const sign = signRow({ ctx, x: contentX, y: bottom + 40, maxW: contentW, size: 28, avatarD: 76, profile, hasAvatar })
  bottom = sign.h ? bottom + 40 + sign.h : bottom

  const qrY = bottom + 40
  const cardBottom = qrY + qrSize + 34 + 24
  const height = cardBottom + cardY

  const layers = []
  layers.push(L.grad(0, 0, W, height, mix(tone.bg, '#ffffff', 0.08), mix(tone.bg, '#ffffff', 0.22)))
  layers.push(L.rrect(cardX, cardY, cardW, cardBottom - cardY, radius, { fill: PAPER, shadow: 'rgba(35, 37, 44, 0.10)' }))
  // 色带顶边要沿卡片的圆角切，底边是方的：先画一枚四角都圆的，再用一条方角矩形
  // 盖掉它下半截的圆角，就得到"上圆下方"。
  layers.push(L.rrect(cardX, cardY, cardW, bandH, radius, { fill: tone.bg }))
  layers.push(L.fill(cardX, cardY + radius, cardW, bandH - radius, tone.bg))
  layers.push(L.rrect(contentX, cardY + pad, block, block, 28, { fill: 'rgba(255, 255, 255, 0.16)' }))

  font(ctx, 28, true)
  layers.push(L.text({
    x: contentX + 20, y: cardY + pad + 48, lines: [clip(ctx, blockNameOf(note, lang), block - 40)], size: 28, weight: 'bold', color: tone.ink,
  }))
  layers.push(L.text({
    x: contentX + 20, y: cardY + pad + block - 22, lines: [formatShortDate(note.created_at)], size: 17, weight: 'bold', color: tone.ink, alpha: 0.75,
  }))
  layers.push(L.text({
    x: titleX, y: cardY + pad + titleSize, lines: titleLines, lh: titleLH, size: titleSize, weight: 'bold', color: tone.ink,
  }))
  layers.push(L.text({ x: contentX, y: metaY, lines: [metaLine], size: metaSize, weight: 'bold', color: MUTED }))
  if (summaryLines.length) {
    layers.push(L.text({ x: contentX, y: summaryTop, lines: summaryLines, lh: bodyLH, size: bodySize, color: BODY }))
  }
  if (points.length) {
    layers.push(L.text({ x: contentX, y: pointsTop, lines: [t('keyPoints', lang)], size: metaSize, weight: 'bold', color: MUTED }))
    points.forEach((p, i) => {
      const py = pointsTop + 44 + i * pointLH
      layers.push(L.circle(contentX + 18, py - 9, 18, { fill: tone.bg }))
      layers.push(L.text({ x: contentX + 18, y: py - 2, lines: [String(i + 1)], size: 21, weight: 'bold', color: tone.ink, align: 'center' }))
      layers.push(L.text({ x: contentX + 50, y: py, lines: [p], size: pointSize, color: BODY }))
    })
  }
  layers.push(...sign.layers)
  layers.push(L.image('qr', (W - qrSize) / 2, qrY, qrSize, qrSize, { placeholder: '#EFEDE6' }))
  layers.push(L.text({
    x: W / 2, y: qrY + qrSize + 34, lines: [t('scanToView', lang)], size: metaSize, color: MUTED, align: 'center',
  }))
  return { width: W, height, layers, template: 'card' }
}

function planQuote(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const tone = toneFor(note.category_id)
  const cardX = 40
  const cardY = 60
  const pad = 52
  const cardW = W - cardX * 2
  const innerW = cardW - pad * 2
  const qrSize = 128

  font(ctx, 24, true)
  const kicker = clip(ctx, [blockNameOf(note, lang), formatShortDate(note.created_at)].filter(Boolean).join(' · '), innerW)

  const qSize = 46
  const qLH = 68
  font(ctx, qSize, true)
  const quoteLines = fit(ctx, quoteOf(note), innerW, 5)

  const tSize = 26
  font(ctx, tSize, false)
  const titleLine = note.title ? [clip(ctx, note.title, innerW)] : []

  const kickerY = cardY + pad + 24
  const quoteTop = kickerY + 52
  const quoteBottom = quoteTop + (quoteLines.length - 1) * qLH + qSize
  let titleBottom = quoteBottom
  if (titleLine.length) titleBottom = quoteBottom + 40 + tSize
  const cardBottom = titleBottom + pad
  const cardH = cardBottom - cardY

  const signTop = cardBottom + 56
  const sign = signRow({ ctx, x: cardX + pad, y: signTop, maxW: innerW, size: 30, avatarD: 88, onDark: true, profile, hasAvatar })
  const qrY = signTop + Math.max(sign.h, 88) + 40
  const height = qrY + qrSize + 74

  const layers = []
  layers.push(L.fill(0, 0, W, height, tone.bg))
  layers.push(L.rrect(cardX, cardY, cardW, cardH, 48, { fill: PAPER }))
  // 眉标不能直接用分类色写字：芥末黄压白底只有 1.63 的对比度（palette.js 里那条），
  // 掺一半墨下去保住色相又能看清。
  layers.push(L.text({ x: cardX + pad, y: kickerY, lines: [kicker], size: 24, weight: 'bold', color: mix(tone.bg, INK, 0.55) }))
  layers.push(L.text({ x: cardX + pad, y: quoteTop + qSize, lines: quoteLines, lh: qLH, size: qSize, weight: 'bold', color: INK }))
  if (titleLine.length) {
    layers.push(L.text({ x: cardX + pad, y: quoteBottom + 40 + tSize, lines: titleLine, size: tSize, color: MUTED }))
  }
  layers.push(...sign.layers)
  layers.push(L.rrect(cardX + pad, qrY - 14, qrSize + 28, qrSize + 28, 28, { fill: PAPER }))
  layers.push(L.image('qr', cardX + pad + 14, qrY, qrSize, qrSize))
  // 引导语直接坐在分类色上，所以用它自己配好的那个字色，不写死白
  layers.push(L.text({
    x: cardX + pad + qrSize + 56, y: qrY + qrSize / 2 + 10, lines: [t('scanToView', lang)], size: 22, weight: 'bold', color: tone.ink,
  }))
  return { width: W, height, layers, template: 'quote' }
}

function planBlock(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const tone = toneFor(note.category_id)
  const pad = 44
  const qrSize = 120
  const avatarD = 132
  const cardX = 40
  const cardW = W - cardX * 2
  const innerW = cardW - pad * 2

  font(ctx, 40, true)
  const titleLines = fit(ctx, note.title || '', W - pad * 2, 3)
  font(ctx, 22, true)
  const metaLine = clip(ctx, [blockNameOf(note, lang), sourceLabelOf(note, lang)].filter(Boolean).join(' · '), W - pad * 2)

  const metaY = 92
  const titleTop = metaY + 52
  const titleBottom = titleTop + (titleLines.length - 1) * 54 + 40
  // 头像压在色块与白卡的那条边上，所以色块下沿留出一截，白卡再从下沿下方起
  const bandBottom = titleBottom + 96
  const cardTop = bandBottom + 40
  const contentTop = cardTop + (hasAvatar ? avatarD / 2 + 24 : pad)

  font(ctx, 27, false)
  const summaryLines = note.summary ? fit(ctx, note.summary, innerW, 4) : []
  font(ctx, 26, false)
  const points = (note.key_points || []).slice(0, 3).map((p) => clip(ctx, p, innerW - 46))

  let base = contentTop + 27
  const summaryY = summaryLines.length ? base : 0
  if (summaryLines.length) base += (summaryLines.length - 1) * 40 + 40
  const pointsY = points.length ? base + 8 : 0
  if (points.length) base = pointsY + 40 + (points.length - 1) * 42 + 26
  // 这块本来就在色块与白卡交界画了一枚大头像，署名行再带一枚就成两个自己了
  const sign = signRow({ ctx, x: cardX + pad, y: base + 36, maxW: innerW, size: 28, avatarD: 76, profile, hasAvatar: false })
  const cardBottom = (sign.h ? base + 36 + sign.h + 12 : base + 8) + pad
  const qrY = cardBottom + 44
  const height = qrY + qrSize + 34 + 24

  const layers = []
  layers.push(L.fill(0, 0, W, height, '#F5F4F0'))
  layers.push(L.fill(0, 0, W, bandBottom, tone.bg))
  layers.push(L.text({ x: pad, y: metaY, lines: [metaLine], size: 22, weight: 'bold', color: tone.ink, alpha: 0.8 }))
  layers.push(L.text({ x: pad, y: titleTop + 40, lines: titleLines, lh: 54, size: 40, weight: 'bold', color: tone.ink }))
  layers.push(L.rrect(cardX, cardTop, cardW, cardBottom - cardTop, 44, { fill: PAPER, shadow: 'rgba(35, 37, 44, 0.10)' }))
  if (hasAvatar) {
    layers.push(L.avatar((W - avatarD) / 2, bandBottom - avatarD / 2, avatarD, { ring: 8, ringColor: PAPER }))
  }
  if (summaryLines.length) {
    layers.push(L.text({ x: cardX + pad, y: summaryY, lines: summaryLines, lh: 40, size: 27, color: BODY }))
  }
  if (points.length) {
    points.forEach((p, i) => {
      const py = pointsY + i * 42
      layers.push(L.circle(cardX + pad + 16, py - 9, 16, { fill: tone.bg }))
      layers.push(L.text({ x: cardX + pad + 16, y: py - 2, lines: [String(i + 1)], size: 20, weight: 'bold', color: tone.ink, align: 'center' }))
      layers.push(L.text({ x: cardX + pad + 46, y: py, lines: [p], size: 26, color: BODY }))
    })
  }
  layers.push(...sign.layers)
  layers.push(L.image('qr', (W - qrSize) / 2, qrY, qrSize, qrSize, { placeholder: '#EFEDE6' }))
  layers.push(L.text({ x: W / 2, y: qrY + qrSize + 34, lines: [t('scanToView', lang)], size: 22, color: MUTED, align: 'center' }))
  return { width: W, height, layers, template: 'block' }
}

function planClean(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const tone = toneFor(note.category_id)
  const pad = 56
  const qrSize = 112
  const MIN_H = 980

  font(ctx, 22, true)
  const kicker = clip(ctx, [blockNameOf(note, lang), formatShortDate(note.created_at)].filter(Boolean).join(' · '), W - pad * 2)
  font(ctx, 42, true)
  const titleLines = fit(ctx, note.title || '', W - pad * 2, 4)
  font(ctx, 27, false)
  const summaryLines = note.summary ? fit(ctx, note.summary, W - pad * 2, 5) : []

  const barH = 14
  const signH = Math.max(84, qrSize)
  // 先按"内容自然往下堆"算一遍位置
  const k0 = barH + 92
  const t0 = k0 + 62
  const tb0 = t0 + (titleLines.length - 1) * 58 + 42
  const s0 = summaryLines.length ? tb0 + 34 : 0
  const sb0 = summaryLines.length ? s0 + (summaryLines.length - 1) * 40 + 27 : tb0
  const r0 = sb0 + 56
  // 只有个标题的笔记会让这张变成横图，社交平台上横图很小，所以给一个竖版下限
  const natural = r0 + 44 + signH + 56
  const height = Math.max(natural, MIN_H)
  // 撑出来的空白不能全堆在正文和署名之间，那样看着像少了一块；
  // 上下对半分，整段正文往下挪一点，才像一张有意留白的海报。
  const shift = Math.round((height - natural) * 0.45)
  const kickerY = k0 + shift
  const titleTop = t0 + shift
  const summaryTop = s0 + shift
  const ruleY = r0 + shift
  const signTop = height - 56 - signH
  const sign = signRow({ ctx, x: pad, y: signTop, maxW: W - pad * 2 - qrSize - 40, size: 30, avatarD: 84, profile, hasAvatar })

  const layers = []
  layers.push(L.fill(0, 0, W, height, PAPER))
  layers.push(L.fill(0, 0, W, barH, tone.bg))
  layers.push(L.text({ x: pad, y: kickerY, lines: [kicker], size: 22, weight: 'bold', color: MUTED }))
  layers.push(L.text({ x: pad, y: titleTop + 42, lines: titleLines, lh: 58, size: 42, weight: 'bold', color: INK }))
  if (summaryLines.length) {
    layers.push(L.text({ x: pad, y: summaryTop + 27, lines: summaryLines, lh: 40, size: 27, color: BODY }))
  }
  layers.push(L.fill(pad, ruleY, W - pad * 2, 2, 'rgba(35,37,44,0.10)'))
  layers.push(...sign.layers)
  layers.push(L.image('qr', W - pad - qrSize, signTop, qrSize, qrSize, { placeholder: '#EFEDE6', r: 12 }))
  return { width: W, height, layers, template: 'clean' }
}

const PLANNERS = { card: planCard, quote: planQuote, block: planBlock, clean: planClean }

// ---------------------------------------------------------------- 入口

function planPoster(ctx, note, templateId, profile, lang) {
  const tpl = PLANNERS[templateId] ? templateId : DEFAULT_TEMPLATE
  const p = profile || {}
  return PLANNERS[tpl](ctx, { note, profile: p, hasAvatar: !!p.avatarPath, lang: lang || 'zh' })
}

// 设置页那几格小样用的内置笔记：不依赖用户数据，四套模板都能立刻看到效果
const SAMPLE_NOTE = {
  id: 0,
  title: '把读过的东西存成能转发的笔记',
  summary: '一条链接、一张截图，或者自己写两句，存进来就自动分成能转发的样子。',
  key_points: ['一句话顶做大字，别人扫一眼就记得住', '自己的头像和名字印在图上'],
  tags: ['阅读'],
  category_id: 1,
  source_type: 'manual',
  created_at: '2026-09-23T10:00:00Z',
}

module.exports = {
  W,
  TEMPLATES,
  DEFAULT_TEMPLATE,
  SAMPLE_NOTE,
  PROFILE_KEY,
  readProfile,
  writeProfile,
  avatarPath,
  stageAvatar,
  commitAvatar,
  dropAvatar,
  planPoster,
  paintLayers,
  loadImage,
  quoteOf,
}
