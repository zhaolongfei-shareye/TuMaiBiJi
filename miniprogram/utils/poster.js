// 分享海报的绘制引擎。
//
// 为什么从 share.js 里搬出来：模板要长到好几套，而每套的结构不一样（有的整屏铺色、
// 有的白卡、有的只要一句大字）。如果继续用"一个模板一份画布代码"，加一套就得抄一遍
// 量高度的逻辑，改一处漏一处。所以这里定成两件事：模板只负责**产出图层列表**，
// 一个通用绘制器负责把图层落到画布上。坐标在产出阶段全部算完，落笔阶段不再换算法。
//
// 色只从 palette.js 出。头像、名称、slogan 全部来自本机 storage（见 readProfile），
// 服务器不存任何一张用户图片。
const { toneFor, mix, schemeFor, plateColors, withAlpha } = require('./palette.js')
const { formatShortDate } = require('./date.js')
const { t } = require('./i18n.js')

const W = 750
const INK = '#23252C'
const BODY = '#3C4046'
const MUTED = '#9A9EA6'
const PAPER = '#FFFFFF'
// 下面三个是"结构色"，不参与分类配色：波普的描边与压底黑带、文艺的暖纸。
const HARD = '#12121A'
const WARM = '#FFF6E5'
// 实测模拟器里 serif / sans-serif / Georgia 三种量出来的宽度互不相同，说明真能解析出
// 衬线体；机型没有这个字族时会退回默认字体，属于可接受降级，不会报错。
const SERIF = 'serif'
const MONO = 'Courier New'

const PROFILE_KEY = 'poster_profile'
const AVATAR_NAME = 'poster-avatar.img'
const AVATAR_STAGED = 'poster-avatar-staged.img'
const DEFAULT_TEMPLATE = 'card'

const TEMPLATES = [
  { id: 'card', label: '经典卡片', labelEn: 'Classic Card', group: 'classic' },
  { id: 'quote', label: '金句大字', labelEn: 'Big Quote', group: 'classic' },
  { id: 'block', label: '撞色块', labelEn: 'Color Block', group: 'classic' },
  { id: 'clean', label: '极简', labelEn: 'Minimal', group: 'classic' },
  { id: 'popGrid', label: '波普分格', labelEn: 'Pop Panels', group: 'bold' },
  { id: 'popDots', label: '网点漫画', labelEn: 'Ben-Day Comic', group: 'bold' },
  { id: 'acid', label: '荧光渐变', labelEn: 'Acid Gradient', group: 'bold' },
  { id: 'cover', label: '人像封面', labelEn: 'Portrait Cover', group: 'bold' },
  { id: 'lit', label: '纸间文艺', labelEn: 'Paper & Ink', group: 'bold' },
  { id: 'spec', label: '规格卡', labelEn: 'Spec Sheet', group: 'bold' },
]
const TEMPLATE_GROUPS = [
  { id: 'classic', label: '经典款', labelEn: 'Classic' },
  { id: 'bold', label: '个性款', labelEn: 'Expressive' },
]

// 海报出中英文两版，模板名也就得跟着语言走。
// 名字留在模板表里而不是 i18n 里：加一套模板只改一处，不会漏掉一半键值。
function templateLabel(id, lang) {
  const tpl = TEMPLATES.find((x) => x.id === id)
  if (!tpl) return ''
  return lang === 'en' ? tpl.labelEn || tpl.label : tpl.label
}

function groupName(id, lang) {
  const g = TEMPLATE_GROUPS.find((x) => x.id === id)
  if (!g) return ''
  return lang === 'en' ? g.labelEn || g.label : g.label
}

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
  // 目标名是固定的（暂存/正式各一个），所以第二次覆盖时 dest 一定已经存在。
  // 真机的 copyFile 在目标已存在时会回 EEXIST（errno 17），开发者工具的替身不报这个——
  // 表现就是"第一张头像好好的，选第二张就存不下来"。先把老的删掉再拷，覆盖就变成一次纯新建。
  try {
    wx.getFileSystemManager().unlinkSync(dest)
  } catch (e) {
    // 头一次存，本来就没有旧文件
  }
  return new Promise((resolve, reject) => {
    // 参数名是 srcPath，不是 filePath——真机上写错的表现是 errno 1001
    // "parameter.srcPath should be String instead of Undefined"，
    // 而开发者工具的替身不校验这个，模拟器里一路都是绿的。
    wx.getFileSystemManager().copyFile({ srcPath: src, destPath: dest, success: () => resolve(dest), fail: reject })
  })
}

// 选完先落到"暂存"这个名字，点保存才搬到正式名字。
// 直接覆盖正式文件的话，用户选完图不点保存，海报也会跟着换成他没收的图。
function stageAvatar(tempPath) {
  return copyTo(tempPath, AVATAR_STAGED)
}

function commitAvatar(stagedPath) {
  return copyTo(stagedPath, AVATAR_NAME).then((dest) => {
    // 正式文件已经在了，暂存那份就是纯多余的一份拷贝
    dropStaged()
    return dest
  })
}

function dropAvatar() {
  try {
    wx.getFileSystemManager().unlinkSync(`${wx.env.USER_DATA_PATH}/${AVATAR_NAME}`)
  } catch (e) {
    // 没存过就会走到这里，不是错误
  }
}

// 暂存那张只"在这页还没点保存"这段时间里有意义：点了保存上面就会删它，没点保存
// 也要删（用户没要这张图）。让它留着，等于用户随口选的一张图一直躺在本机里。
function dropStaged() {
  try {
    wx.getFileSystemManager().unlinkSync(`${wx.env.USER_DATA_PATH}/${AVATAR_STAGED}`)
  } catch (e) {
    // 十有八九是本来就没有暂存文件，不是错误
  }
}

// ---------------------------------------------------------------- 图层

const L = {
  fill: (x, y, w, h, color) => ({ k: 'fill', x, y, w, h, color }),
  // dir: 'v'(默认，上→下) | 'h'(左→右)。stops 给了就按多段画，否则 c1→c2。
  grad: (x, y, w, h, c1, c2, o) => Object.assign({ k: 'grad', x, y, w, h, c1, c2 }, o || {}),
  // 径向：圆心 (x,y)，从内半径 r0 到外半径 r1，只在 box=[x,y,w,h] 里落笔。
  // 画"人像后面那圈光""渐变底的一团雾"用这个。
  radial: (x, y, r0, r1, c1, c2, box) => ({ k: 'radial', x, y, r0, r1, c1, c2, box }),
  rrect: (x, y, w, h, r, o) => Object.assign({ k: 'rrect', x, y, w, h, r }, o || {}),
  // y 是第一行基线，与 canvas 的 fillText 语义一致
  text: (o) => Object.assign({ k: 'text', lines: [], lh: 40, size: 28, weight: 'normal', color: INK, align: 'left' }, o),
  circle: (x, y, r, o) => Object.assign({ k: 'circle', x, y, r }, o || {}),
  // 两点线段（杂志封面那类细线、波普的斜切条）
  line: (x1, y1, x2, y2, w, color) => ({ k: 'line', x1, y1, x2, y2, w, color }),
  // 网点阵：波普/孔版印刷的质感来源。gap 是间距，r 是点半径，oddRowShift 让隔行错开。
  dots: (x, y, w, h, o) => Object.assign({ k: 'dots', x, y, w, h, gap: 30, r: 5, color: 'rgba(0,0,0,0.12)', oddRowShift: 0 }, o || {}),
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

// 一行的落笔。track（字距）是"高级感"里最便宜的一招，但 canvas 没有 letterSpacing，
// 只能逐字量宽往后推；整行的对齐要先把加过距的总宽算出来。
// stroke 是描边：先描后填，字就带一圈外发光式的边（波普贴纸那种）。
function drawLine(ctx, line, ly, y) {
  const align = ly.align || 'left'
  if (!ly.track) {
    ctx.textAlign = align
    if (ly.stroke) {
      ctx.lineJoin = 'round'
      ctx.lineWidth = ly.strokeWidth || 8
      ctx.strokeStyle = ly.stroke
      ctx.strokeText(line, ly.x, y)
    }
    ctx.fillText(line, ly.x, y)
    ctx.textAlign = 'left'
    return
  }
  const chars = Array.from(line)
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0) + ly.track * Math.max(0, chars.length - 1)
  let x = align === 'center' ? ly.x - total / 2 : align === 'right' ? ly.x - total : ly.x
  ctx.textAlign = 'left'
  if (ly.stroke) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = ly.strokeWidth || 8
    ctx.strokeStyle = ly.stroke
  }
  chars.forEach((c, i) => {
    if (ly.stroke) ctx.strokeText(c, x, y)
    ctx.fillText(c, x, y)
    x += widths[i] + ly.track
  })
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
        const g = ly.dir === 'h'
          ? ctx.createLinearGradient(ly.x, ly.y, ly.x + ly.w, ly.y)
          : ctx.createLinearGradient(ly.x, ly.y, ly.x, ly.y + ly.h)
        if (ly.stops) ly.stops.forEach((s) => g.addColorStop(s.at, s.color))
        else {
          g.addColorStop(0, ly.c1)
          g.addColorStop(1, ly.c2)
        }
        ctx.fillStyle = g
        ctx.fillRect(ly.x, ly.y, ly.w, ly.h)
        break
      }
      case 'radial': {
        const g = ctx.createRadialGradient(ly.x, ly.y, Math.max(0, ly.r0), ly.x, ly.y, ly.r1)
        g.addColorStop(0, ly.c1)
        g.addColorStop(1, ly.c2)
        ctx.fillStyle = g
        ctx.fillRect(ly.box[0], ly.box[1], ly.box[2], ly.box[3])
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
      case 'line':
        ctx.beginPath()
        ctx.moveTo(ly.x1, ly.y1)
        ctx.lineTo(ly.x2, ly.y2)
        ctx.lineWidth = ly.w
        ctx.strokeStyle = ly.color
        ctx.stroke()
        break
      case 'dots': {
        // 点数按面积走，设置页一格一张、十张同屏，所以超过上限就自动放大间距：
        // 网点是质感，不是分辨率，糊成一片比稀一点更难看。
        let step = Math.max(12, ly.gap)
        while ((ly.w / step) * (ly.h / step) > 1500) step += 4
        ctx.save()
        ctx.beginPath()
        ctx.rect(ly.x, ly.y, ly.w, ly.h)
        ctx.clip()
        ctx.fillStyle = ly.color
        let row = 0
        for (let yy = ly.y + step / 2; yy <= ly.y + ly.h; yy += step, row++) {
          const off = row % 2 ? ly.oddRowShift : 0
          for (let xx = ly.x + step / 2 + off; xx <= ly.x + ly.w; xx += step) {
            ctx.beginPath()
            ctx.arc(xx, yy, ly.r, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        ctx.restore()
        break
      }
      case 'text': {
        ctx.font = `${ly.weight === 'bold' ? 'bold ' : ''}${ly.size}px ${ly.fam || 'sans-serif'}`
        ctx.fillStyle = ly.color
        if (ly.alpha != null) ctx.globalAlpha = ly.alpha
        if (ly.vert) {
          // 竖排：从右往左一列一列走（中文的传统读序），每列从上往下逐字落笔。
          // 文艺/杂志那类版式没有竖排就立不住，而横排堆字做不到。
          const step = ly.lh
          ly.lines.forEach((line, col) => {
            const cx = ly.x - col * (step + (ly.colGap || 0))
            let cy = ly.y
            ctx.textAlign = 'center'
            for (const ch of Array.from(line)) {
              ctx.fillText(ch, cx, cy)
              cy += step
            }
          })
          ctx.textAlign = 'left'
        } else {
          let y = ly.y
          for (const line of ly.lines) {
            drawLine(ctx, line, ly, y)
            y += ly.lh
          }
        }
        if (ly.alpha != null) ctx.globalAlpha = 1
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
        ctx.save()
        ctx.beginPath()
        if (ly.clipCircle) ctx.arc(ly.x + ly.w / 2, ly.y + ly.h / 2, Math.min(ly.w, ly.h) / 2, 0, Math.PI * 2)
        else if (ly.r) ctx.roundRect(ly.x, ly.y, ly.w, ly.h, ly.r)
        else ctx.rect(ly.x, ly.y, ly.w, ly.h)
        ctx.clip()
        // 下面三样都在同一个裁剪区里做，所以只影响这张图，不会碰已画好的别的层。
        // filter 万一某机型不认，图就还是彩色，属于能接受的降级，不报错。
        if (ly.gray) {
          ctx.filter = 'grayscale(1)'
          drawCover(ctx, im, ly.x, ly.y, ly.w, ly.h)
          ctx.filter = 'none'
        } else {
          drawCover(ctx, im, ly.x, ly.y, ly.w, ly.h)
        }
        if (ly.tint) {
          ctx.fillStyle = ly.tint
          ctx.fillRect(ly.x, ly.y, ly.w, ly.h)
        }
        if (ly.fadeFrom != null) {
          // destination-in + 一条由实到透的渐变 = 照片下半截融进底色，
          // 人像封面那种"从画面里长出来"的效果靠这个，不需要模糊也不需要混合模式。
          ctx.globalCompositeOperation = 'destination-in'
          const g = ctx.createLinearGradient(ly.x, ly.y, ly.x, ly.y + ly.h)
          g.addColorStop(0, 'rgba(0,0,0,1)')
          g.addColorStop(Math.max(0.05, Math.min(0.95, ly.fadeFrom)), 'rgba(0,0,0,1)')
          g.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = g
          ctx.fillRect(ly.x, ly.y, ly.w, ly.h)
        }
        ctx.restore()
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

// 断行单位：中日韩逐字，拉丁按词。
// 原来是一个字符一个字符地切，中文没问题，但英文会被从单词中间腰斩成
// "理 / 论"式的一地碎片——海报要出英文版，这一步必须按词。
const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u3000-\u303F]/
function units(text) {
  const s = String(text == null ? '' : text)
  const out = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (/\s/.test(ch)) {
      let j = i
      while (j < s.length && /\s/.test(s[j])) j++
      out.push(s.slice(i, j))
      i = j
    } else if (CJK.test(ch)) {
      out.push(ch)
      i += 1
    } else {
      let j = i
      while (j < s.length && !/\s/.test(s[j]) && !CJK.test(s[j])) j++
      out.push(s.slice(i, j))
      i = j
    }
  }
  return out
}

function wrap(ctx, text, maxW) {
  const us = units(text)
  const lines = []
  let cur = ''
  const push = (s) => {
    const t = s.replace(/\s+$/, '')
    if (t) lines.push(t)
  }
  for (const u of us) {
    if (ctx.measureText(cur + u).width > maxW && cur.trim()) {
      push(cur)
      cur = u.replace(/^\s+/, '')
      // 一个词比整行还长（长 URL、长英文术语）：只能硬切，切不断就整张海报少一行
      while (ctx.measureText(cur).width > maxW && cur.length > 1) {
        let k = 1
        while (k < cur.length && ctx.measureText(cur.slice(0, k + 1)).width <= maxW) k++
        lines.push(cur.slice(0, k))
        cur = cur.slice(k)
      }
    } else {
      cur += u
    }
  }
  if (cur.trim()) push(cur)
  return lines
}

function clip(ctx, text, maxW) {
  const s = String(text == null ? '' : text)
  if (ctx.measureText(s).width <= maxW) return s
  let out = s
  while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1)
  // 英文截到半个词比截到半个字难看十倍：往回收到最后那个完整词
  const sp = out.lastIndexOf(' ')
  if (sp > out.length * 0.55) out = out.slice(0, sp)
  return out.trim() + '…'
}

// 取满 n 行，超出部分在最后一行加省略号
function fit(ctx, text, maxW, n) {
  const all = wrap(ctx, text, maxW)
  if (all.length <= n) return all
  const out = all.slice(0, n)
  out[n - 1] = clip(ctx, out[n - 1], maxW)
  return out
}

function font(ctx, size, bold, fam) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${fam || 'sans-serif'}`
}

// 带字距的文字要占多宽：字距只加在字与字之间，所以是 n-1 段。
// 不做这个的话，加了 tracking 的眉标会悄悄超出画布右边。
function trackW(ctx, text, track) {
  const s = String(text == null ? '' : text)
  const chars = Array.from(s)
  if (!track || chars.length < 2) return ctx.measureText(s).width
  return chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + track * (chars.length - 1)
}

// 同上，但超出时按字距一起裁掉尾巴
function clipTrack(ctx, text, maxW, track) {
  const chars = Array.from(String(text == null ? '' : text))
  if (trackW(ctx, chars.join(''), track) <= maxW) return chars.join('')
  const out = []
  for (const c of chars) {
    if (trackW(ctx, out.concat([c, '…']).join(''), track) > maxW) break
    out.push(c)
  }
  return out.join('') + '…'
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

// ---------------------------------------------------------------- 出跳款
//
// 上面四套全部跟着分类色走，安静克制，代价是"人人都一样、转发出去不显眼"。
// 这一批改的是情绪：波普、网点、荧光渐变、人像封面、文艺、规格卡。
// 两条共同规矩：
// ① 色不再从分类借，而是从 palette.js 的 POSTER_SCHEMES 里按风格取一组，
//    同一条笔记在同一风格下取到哪一组是确定的（换分类才会换色）。
// ② 字号整体抬一档（56~82，原来最大 46）。社交平台上图是被缩着看的，
//    字小就等于没有。
// ③ 再加模板时高度不许超过 1360：安卓对单张画布的大小有上限，9:16（750×1334）
//    已经够竖版用，这批最高的一套是 1350。

// 码不当补丁：白贴纸 + 一块硬偏移的同色底托 + 一行小字。
// 硬偏移代替投影是这批模板统一的收口手法——投影在低分屏上会糊成脏影。
function qrSticker({ layers, x, y, size, offset, ink, label }) {
  const drop = Math.round(size * 0.09)
  const r = size * 0.18
  layers.push(L.rrect(x + drop, y + drop, size, size, r, { fill: offset }))
  layers.push(L.rrect(x, y, size, size, r, { fill: PAPER }))
  const padIn = Math.round(size * 0.09)
  layers.push(L.image('qr', x + padIn, y + padIn, size - padIn * 2, size - padIn * 2, { placeholder: '#EFEEE8' }))
  if (label) {
    layers.push(L.text({
      // 引导语跟着二维码本身居中：右对齐时它比那张码宽出一截，看上去就是挂歪的。
      x: x + size / 2, y: y + size + drop + 26, lines: [label], size: 18, color: ink, align: 'center',
    }))
  }
  return size + drop + (label ? 34 : 0)
}

// 没设形象时，人像位不能空着。取标题第一个字当"丝网版上的大字"，
// 换色不换字，四格各转一次色，看着仍像一版印出来的。
function glyphPlate(ctx, { x, y, w, h, note, color }) {
  const ch = clip(ctx, (note.title || '记').trim().slice(0, 1), w - 60)
  return L.text({
    x: x + w / 2, y: y + h / 2 + Math.round(h * 0.18), lines: [ch],
    size: Math.round(Math.min(w, h) * 0.72), weight: 'bold', color, align: 'center',
  })
}

// 底行给"署名 + 码贴纸"占多高。码贴纸带一行引导语，比署名块高，所以取两者的大。
function footH(qrSize) {
  return qrSize + 46
}

function planPopGrid(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const s = schemeFor('pop', note.category_id)
  const pad = 44
  const gut = 10
  const cellW = (W - gut) / 2
  const cellH = 296
  const gridH = cellH * 2 + gut
  const qrSize = 118
  const plates = plateColors(note.category_id)

  font(ctx, 58, true)
  const titleLines = fit(ctx, note.title || '', W - pad * 2, 2)
  font(ctx, 24, false)
  const sumLines = note.summary ? fit(ctx, note.summary, W - pad * 2, 2) : []
  font(ctx, 22, true)
  const kicker = clipTrack(ctx, [blockNameOf(note, lang), formatShortDate(note.created_at)].filter(Boolean).join(' · '), W - pad * 2, 3)

  const kickerY = gridH + 76
  const titleTop = kickerY + 34
  const titleBottom = titleTop + (titleLines.length - 1) * 70 + 58
  const sumTop = sumLines.length ? titleBottom + 26 : 0
  const sumBottom = sumLines.length ? sumTop + (sumLines.length - 1) * 36 + 24 : titleBottom
  const signTop = sumBottom + 44
  const sign = signRow({ ctx, x: pad, y: signTop, maxW: W - pad * 2 - qrSize - 30, size: 28, avatarD: 74, onDark: true, profile, hasAvatar })
  const height = signTop + Math.max(sign.h, footH(qrSize)) + 48

  const layers = []
  layers.push(L.fill(0, 0, W, height, HARD))
  plates.forEach((c, i) => {
    const x = (i % 2) * (cellW + gut)
    const y = Math.floor(i / 2) * (cellH + gut)
    layers.push(L.fill(x, y, cellW, cellH, c))
    layers.push(hasAvatar
      // 先转灰再压一层半透明的版色：四格是同一张脸的四次套印，不是四张不同的图
      ? L.image('avatar', x, y, cellW, cellH, { gray: true, tint: withAlpha(c, 0.62) })
      : glyphPlate(ctx, { x, y, w: cellW, h: cellH, note, color: withAlpha(HARD, 0.2) }))
  })
  layers.push(L.text({ x: pad, y: kickerY, lines: [kicker], size: 22, weight: 'bold', color: s.bg, track: 3 }))
  layers.push(L.text({ x: pad, y: titleTop + 58, lines: titleLines, lh: 70, size: 58, weight: 'bold', color: PAPER }))
  if (sumLines.length) {
    layers.push(L.text({ x: pad, y: sumTop + 24, lines: sumLines, lh: 36, size: 24, color: 'rgba(255,255,255,0.7)' }))
  }
  layers.push(...sign.layers)
  qrSticker({ layers, x: W - pad - qrSize, y: signTop, size: qrSize, offset: s.accent, ink: 'rgba(255,255,255,0.66)', label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'popGrid' }
}

function planPopDots(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const s = schemeFor('pop', note.category_id)
  const pad = 46
  const avatarD = 200
  const qrSize = 116
  const light = mix(s.bg, '#FFFFFF', 0.66)
  // 主墨不是纯黑：往 HARD 里渗一点这组的底色，描边和字就和画面是一版的。
  // 权重是 HARD 的占比——写反过一次，结果描边成了亮蓝，漫画的"黑框"就没了。
  const dark = mix(HARD, s.bg, 0.85)

  font(ctx, 22, true)
  const kicker = clipTrack(ctx, [blockNameOf(note, lang), sourceLabelOf(note, lang)].filter(Boolean).join(' · '), W - pad * 2 - avatarD - 24, 2)
  font(ctx, 76, true)
  const titleLines = fit(ctx, note.title || '', W - pad * 2, 3)
  font(ctx, 26, false)
  const sumLines = note.summary ? fit(ctx, note.summary, W - pad * 2 - 56, 3) : []
  font(ctx, 25, false)
  const points = (note.key_points || []).slice(0, 2).map((p) => clip(ctx, p, W - pad * 2 - 120))

  const kickerY = 100
  const titleTop = Math.max(kickerY + 60, avatarD + 56) + 76
  const titleBottom = titleTop + (titleLines.length - 1) * 88 + 76
  const cardTop = titleBottom + 40
  const cardH = 44 + (sumLines.length ? (sumLines.length - 1) * 40 + 34 + 22 : 0) + (points.length ? points.length * 44 : 0) + 20
  const signTop = cardTop + cardH + 44
  // 上面已经有一枚大头像了，署名行只留字：同一张脸上出现两次自己很难看
  const sign = signRow({ ctx, x: pad, y: signTop, maxW: W - pad * 2 - qrSize - 30, size: 28, avatarD: 74, profile, hasAvatar: false })
  const height = signTop + Math.max(sign.h, footH(qrSize)) + 48

  const layers = []
  layers.push(L.fill(0, 0, W, height, light))
  layers.push(L.dots(0, 0, W, cardTop - 20, { gap: 26, r: 4.5, color: s.dot, oddRowShift: 13 }))
  // 套印错位：同一句标题先按强调色往右下偏 9px 画一遍，再用主墨色压在原位画
  layers.push(L.text({ x: pad + 13, y: titleTop + 89, lines: titleLines, lh: 88, size: 76, weight: 'bold', color: s.accent }))
  layers.push(L.text({ x: pad, y: titleTop + 76, lines: titleLines, lh: 88, size: 76, weight: 'bold', color: dark }))
  layers.push(L.rrect(pad - 8, kickerY - 30, trackW(ctx, kicker, 2) + 32, 44, 22, { fill: s.accent }))
  layers.push(L.text({ x: pad + 8, y: kickerY, lines: [kicker], size: 22, weight: 'bold', color: s.accentInk, track: 2 }))
  if (hasAvatar) {
    layers.push(L.avatar(W - pad - avatarD, 40, avatarD, { ring: 10, ringColor: dark, fallback: withAlpha(dark, 0.16) }))
  } else {
    layers.push(glyphPlate(ctx, { x: W - pad - avatarD, y: 40, w: avatarD, h: avatarD, note, color: withAlpha(dark, 0.18) }))
  }
  const drop = 12
  layers.push(L.rrect(pad + drop, cardTop + drop, W - pad * 2, cardH, 28, { fill: withAlpha(dark, 0.9) }))
  layers.push(L.rrect(pad, cardTop, W - pad * 2, cardH, 28, { fill: PAPER, stroke: dark, strokeWidth: 4 }))
  let cy = cardTop + 44
  if (sumLines.length) {
    layers.push(L.text({ x: pad + 28, y: cy, lines: sumLines, lh: 40, size: 26, color: BODY }))
    cy += (sumLines.length - 1) * 40 + 56
  }
  points.forEach((p, i) => {
    // 序号点用白底：这组的底色本身就有浅的，蓝底压蓝字的"1"根本认不出来
    layers.push(L.circle(pad + 46, cy - 9, 18, { fill: PAPER, stroke: dark, strokeWidth: 3 }))
    layers.push(L.text({ x: pad + 46, y: cy - 2, lines: [String(i + 1)], size: 20, weight: 'bold', color: dark, align: 'center' }))
    layers.push(L.text({ x: pad + 78, y: cy, lines: [p], size: 25, color: INK }))
    cy += 44
  })
  layers.push(...sign.layers)
  qrSticker({ layers, x: W - pad - qrSize, y: signTop, size: qrSize, offset: s.accent, ink: dark, label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'popDots' }
}

function planAcid(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const s = schemeFor('neon', note.category_id)
  const pad = 48
  const avatarD = 380
  const qrSize = 118
  const topH = 540
  const pillGap = 84

  font(ctx, 22, true)
  const kicker = clipTrack(ctx, [blockNameOf(note, lang), formatShortDate(note.created_at)].filter(Boolean).join(' · '), W - pad * 2, 4)
  font(ctx, 72, true)
  const titleLines = fit(ctx, note.title || '', W - pad * 2, 2)
  font(ctx, 25, false)
  const points = (note.key_points || []).slice(0, 3).map((p) => clip(ctx, p, W - pad * 2 - 76))

  const avatarTop = 76
  const kickerY = topH + 74
  const titleTop = kickerY + 44
  const titleBottom = titleTop + (titleLines.length - 1) * 88 + 72
  const pointsTop = titleBottom + 44
  const signTop = pointsTop + points.length * pillGap + (points.length ? 24 : 0)
  const sign = signRow({ ctx, x: pad, y: signTop, maxW: W - pad * 2 - qrSize - 30, size: 28, avatarD: 74, onDark: true, profile, hasAvatar: false })
  const height = signTop + Math.max(sign.h, footH(qrSize)) + 48

  const layers = []
  layers.push(L.grad(0, 0, W, height, s.c1, s.c2, {
    stops: [{ at: 0, color: s.c1 }, { at: 0.52, color: mix(s.c1, s.c2, 0.5) }, { at: 1, color: s.c2 }],
  }))
  // 人像后面那团光：径向渐变从半透明白走到全透，把大圆从渐变里"托"出来
  layers.push(L.radial(W - pad - avatarD / 2, avatarTop + avatarD / 2, 0, avatarD * 1.05,
    withAlpha('#FFFFFF', 0.38), withAlpha('#FFFFFF', 0), [0, 0, W, topH]))
  layers.push(L.fill(0, topH - 1, W, height - topH + 1, withAlpha(HARD, 0.28)))
  if (hasAvatar) {
    layers.push(L.avatar(W - pad - avatarD, avatarTop, avatarD, { ring: 6, ringColor: withAlpha('#FFFFFF', 0.6), fallback: withAlpha('#FFFFFF', 0.2) }))
  } else {
    layers.push(glyphPlate(ctx, { x: W - pad - avatarD, y: avatarTop, w: avatarD, h: avatarD, note, color: withAlpha('#FFFFFF', 0.28) }))
  }
  layers.push(L.text({ x: pad, y: kickerY, lines: [kicker], size: 22, weight: 'bold', color: s.sub, track: 4 }))
  layers.push(L.text({ x: pad, y: titleTop + 72, lines: titleLines, lh: 88, size: 72, weight: 'bold', color: s.ink }))
  points.forEach((p, i) => {
    const py = pointsTop + i * pillGap
    layers.push(L.rrect(pad, py - 34, W - pad * 2, 76, 38, { fill: withAlpha('#FFFFFF', 0.14) }))
    layers.push(L.circle(pad + 30, py, 22, { fill: s.accent }))
    layers.push(L.text({ x: pad + 30, y: py + 8, lines: [String(i + 1)], size: 22, weight: 'bold', color: s.accentInk, align: 'center' }))
    layers.push(L.text({ x: pad + 66, y: py + 9, lines: [p], size: 25, color: s.panelInk }))
  })
  layers.push(...sign.layers)
  qrSticker({ layers, x: W - pad - qrSize, y: signTop, size: qrSize, offset: s.accent, ink: 'rgba(255,255,255,0.72)', label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'acid' }
}

function planCover(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const s = schemeFor('mono', note.category_id)
  const pad = 48
  const qrSize = 116
  // 文字块从哪儿开始压住人像：这一段以下渐变已经压到 0.88 以上，够白字站住
  const textTop = 720

  font(ctx, 20, true)
  const mast = clipTrack(ctx, [blockNameOf(note, lang), formatShortDate(note.created_at)].filter(Boolean).join(' · '), W - pad * 2 - 40, 4)
  font(ctx, 76, true)
  const titleLines = fit(ctx, note.title || '', W - pad * 2, 2)
  font(ctx, 26, false)
  const sumLines = note.summary ? fit(ctx, note.summary, W - pad * 2, 2) : []

  const mastY = pad + 20
  const titleTop = 796
  const titleBottom = titleTop + (titleLines.length - 1) * 90 + 76
  const sumTop = sumLines.length ? titleBottom + 30 : 0
  const sumBottom = sumLines.length ? sumTop + (sumLines.length - 1) * 40 + 26 : titleBottom
  const signTop = sumBottom + 52
  const sign = signRow({ ctx, x: pad, y: signTop, maxW: W - pad * 2 - qrSize - 30, size: 30, avatarD: 80, onDark: true, profile, hasAvatar })
  const height = signTop + Math.max(sign.h, footH(qrSize)) + 48

  const layers = []
  layers.push(L.fill(0, 0, W, height, s.bg))
  if (hasAvatar) {
    // 彩色整幅人像铺满全张，眉标、标题、署名、码全部压在图上。
    // 压得住靠这条渐变：脸那一段（上半张）几乎不加暗，到标题那一段已经到 0.88，
    // 白字落在浅色衣服或白墙上也不会糊掉。
    layers.push(L.image('avatar', 0, 0, W, height))
    layers.push(L.grad(0, 0, W, height, withAlpha(s.bg, 0.2), withAlpha(s.bg, 0.97), {
      stops: [
        { at: 0, color: withAlpha(s.bg, 0.2) },
        { at: 0.5, color: withAlpha(s.bg, 0.42) },
        { at: 0.66, color: withAlpha(s.bg, 0.88) },
        { at: 1, color: withAlpha(s.bg, 0.97) },
      ],
    }))
  } else {
    layers.push(L.radial(W / 2, height * 0.34, 0, height * 0.62, withAlpha(s.accent, 0.34), withAlpha(s.bg, 0), [0, 0, W, height]))
    layers.push(glyphPlate(ctx, { x: 0, y: 0, w: W, h: height, note, color: withAlpha(s.ink, 0.1) }))
  }
  const mastW = trackW(ctx, mast, 4) + 40
  layers.push(L.rrect(pad, mastY - 30, mastW, 44, 22, { fill: withAlpha(HARD, 0.5) }))
  layers.push(L.text({ x: pad + 20, y: mastY, lines: [mast], size: 20, weight: 'bold', color: '#FFFFFF', track: 4 }))
  layers.push(L.text({ x: pad, y: titleTop + 76, lines: titleLines, lh: 90, size: 76, weight: 'bold', color: s.ink }))
  layers.push(L.fill(pad, titleTop - 26, 84, 8, s.accent))
  if (sumLines.length) {
    layers.push(L.text({ x: pad, y: sumTop + 26, lines: sumLines, lh: 40, size: 26, color: s.sub }))
  }
  layers.push(...sign.layers)
  qrSticker({ layers, x: W - pad - qrSize, y: signTop, size: qrSize, offset: s.accent, ink: s.sub, label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'cover' }
}

function planLit(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const s = schemeFor('riso', note.category_id)
  const pad = 56
  const archW = 380
  const archH = 380
  const archX = (W - archW) / 2
  const vertX = W - 44
  const contentCx = (W - 68) / 2
  const qrSize = 108

  font(ctx, 20, true, SERIF)
  const kicker = clipTrack(ctx, [blockNameOf(note, lang), formatShortDate(note.created_at)].filter(Boolean).join(' · '), W - pad * 2, 6)
  font(ctx, 52, true, SERIF)
  const titleLines = fit(ctx, note.title || '', W - pad * 2 - 60, 3)
  font(ctx, 27, false)
  const sumLines = note.summary ? fit(ctx, note.summary, W - pad * 2 - 50, 3) : []
  // 竖排那一列写来源。不写 slogan：slogan 已经在署名行里，同一句话出现两次很廉价。
  const vertText = (sourceLabelOf(note, lang) || formatShortDate(note.created_at)).slice(0, 10)
  const vertStep = 40
  const archTop = 92
  const kickerY = archTop + archH + 76
  const titleTop = kickerY + 40
  const vertTop = titleTop
  const titleBottom = titleTop + (titleLines.length - 1) * 74 + 52
  const ruleY = titleBottom + 46
  const sumTop = sumLines.length ? ruleY + 44 : 0
  const sumBottom = sumLines.length ? sumTop + (sumLines.length - 1) * 42 + 27 : ruleY
  const signTop = Math.max(sumBottom, vertTop + Array.from(vertText).length * vertStep) + 52
  const sign = signRow({ ctx, x: pad, y: signTop, maxW: W - pad * 2 - qrSize - 30, size: 28, avatarD: 72, profile, hasAvatar: false })
  const height = signTop + Math.max(sign.h, footH(qrSize)) + 48

  const layers = []
  layers.push(L.fill(0, 0, W, height, s.bg))
  // 拱门：四角全圆的长条 + 一条方角矩形盖住下半截的圆角
  layers.push(L.rrect(archX, archTop, archW, archH, archW / 2, { fill: s.accent }))
  layers.push(L.fill(archX, archTop + archH - archW / 2, archW, archW / 2, s.accent))
  const badge = 220
  if (hasAvatar) {
    layers.push(L.avatar(archX + (archW - badge) / 2, archTop + 56, badge, { ring: 8, ringColor: s.bg, fallback: withAlpha(s.bg, 0.3) }))
  } else {
    layers.push(glyphPlate(ctx, { x: archX, y: archTop, w: archW, h: archH, note, color: withAlpha(s.accentInk, 0.22) }))
  }
  layers.push(L.text({ x: contentCx, y: kickerY, lines: [kicker], size: 20, weight: 'bold', color: s.sub, track: 6, align: 'center', fam: SERIF }))
  layers.push(L.text({
    x: contentCx, y: titleTop + 52, lines: titleLines, lh: 74, size: 52, weight: 'bold', color: s.ink, align: 'center', fam: SERIF,
  }))
  layers.push(L.line(pad, ruleY, W - pad, ruleY, 2, withAlpha(s.ink, 0.18)))
  if (sumLines.length) {
    layers.push(L.text({ x: pad, y: sumTop + 27, lines: sumLines, lh: 42, size: 27, color: mix(s.ink, s.bg, 0.78) }))
  }
  layers.push(L.text({
    x: vertX, y: vertTop, lines: [vertText], vert: true, lh: vertStep, size: 28, color: withAlpha(s.ink, 0.62), fam: SERIF,
  }))
  layers.push(...sign.layers)
  qrSticker({ layers, x: W - pad - qrSize, y: signTop, size: qrSize, offset: s.accent, ink: s.sub, label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'lit' }
}

function planSpec(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const s = schemeFor('spec', note.category_id)
  const pad = 52
  const qrSize = 112
  const rule = withAlpha(s.ink, 0.14)
  const SPEC_MIN_H = 1040

  font(ctx, 20, false, MONO)
  const meta = clipTrack(ctx, [
    `NO.${String((note.id || 0) % 1000).padStart(3, '0')}`,
    formatShortDate(note.created_at),
    sourceLabelOf(note, lang),
  ].filter(Boolean).join('  /  '), W - pad * 2, 1)
  font(ctx, 20, true)
  const kicker = clipTrack(ctx, blockNameOf(note, lang), W - pad * 2, 5)
  font(ctx, 60, true)
  const titleLines = fit(ctx, note.title || '', W - pad * 2, 3)
  font(ctx, 26, false)
  const sumLines = note.summary ? fit(ctx, note.summary, W - pad * 2 - 60, 3) : []
  font(ctx, 26, false)
  const points = (note.key_points || []).slice(0, 4).map((p) => clip(ctx, p, W - pad * 2 - 150))

  const metaY = pad + 20
  const barY = metaY + 26
  const kickerY = barY + 56
  const titleTop = kickerY + 34
  const titleBottom = titleTop + (titleLines.length - 1) * 74 + 60
  let y = titleBottom + 44
  const sumTop = sumLines.length ? y : 0
  if (sumLines.length) y += (sumLines.length - 1) * 40 + 76
  const listTop = points.length ? y : 0
  if (points.length) y += points.length * 74
  const foot = Math.max(
    signRow({ ctx, x: pad, y: 0, maxW: W - pad * 2 - qrSize - 30, size: 28, avatarD: 76, profile, hasAvatar }).h,
    footH(qrSize),
  )
  // 只有一条要点的笔记会让这张变成横图，所以给一个竖版下限。
  // 多出来的空白对半分：一半进正文上方，一半留在正文与底行之间，底行贴住画布下沿，
  // 看着像一张摊开的表格，而不是像缺了半页内容。
  const natural = y + 40 + foot + 48
  const height = Math.max(natural, SPEC_MIN_H)
  const bodyShift = Math.round((height - natural) * 0.5)
  const signTop = height - 48 - foot
  const sign = signRow({ ctx, x: pad, y: signTop, maxW: W - pad * 2 - qrSize - 30, size: 28, avatarD: 76, profile, hasAvatar })

  const layers = []
  layers.push(L.fill(0, 0, W, height, s.bg))
  layers.push(L.grad(pad, barY, W - pad * 2, 10, s.accent, withAlpha(s.accent, 0.1), { dir: 'h' }))
  layers.push(L.text({ x: pad, y: metaY, lines: [meta], size: 20, color: s.sub, fam: MONO, track: 1 }))
  layers.push(L.text({ x: pad, y: kickerY, lines: [kicker], size: 20, weight: 'bold', color: s.accent, track: 5 }))
  layers.push(L.text({ x: pad, y: titleTop + 60, lines: titleLines, lh: 74, size: 60, weight: 'bold', color: s.ink }))
  if (sumLines.length) {
    layers.push(L.text({ x: pad, y: sumTop + 26 + bodyShift, lines: sumLines, lh: 40, size: 26, color: mix(s.ink, s.bg, 0.78) }))
  }
  points.forEach((p, i) => {
    const py = listTop + bodyShift + i * 74
    layers.push(L.line(pad, py - 30, W - pad, py - 30, 1.5, rule))
    layers.push(L.text({ x: pad, y: py + 4, lines: [String(i + 1).padStart(2, '0')], size: 22, color: s.accent, fam: MONO, weight: 'bold' }))
    layers.push(L.text({ x: pad + 62, y: py + 4, lines: [p], size: 26, color: mix(s.ink, s.bg, 0.86) }))
  })
  if (points.length) {
    const endY = listTop + bodyShift + points.length * 74 - 30
    layers.push(L.line(pad, endY, W - pad, endY, 1.5, rule))
  }
  layers.push(...sign.layers)
  qrSticker({ layers, x: W - pad - qrSize, y: signTop, size: qrSize, offset: s.accent, ink: s.sub, label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'spec' }
}

const PLANNERS = {
  card: planCard, quote: planQuote, block: planBlock, clean: planClean,
  popGrid: planPopGrid, popDots: planPopDots, acid: planAcid, cover: planCover, lit: planLit, spec: planSpec,
}

// ---------------------------------------------------------------- 入口

// 关掉二维码：微信以外的平台看见第三方码就直接屏蔽这张图，所以宁可留字不留码。
// 十套模板码位各不相同（有的在右下贴纸、有的在底部居中、有的在左下配一行侧标），
// 与其十处各写一遍，不如从图层里把"这一张码 + 给它垫底的块 + 它下面那行引导语"摘掉，
// 原地换成两行纯文字。摘的条件是中心离码中心近、面积不超过码的四倍，
// 所以整张卡的大底不会被误摘。
// 文字不许截成"图麦笔…"：那种位置宁可字号小一档，所以按框宽往下试字号而不是裁字。
function fitSize(ctx, text, maxW, want, floor) {
  let s = Math.max(want, floor)
  for (;;) {
    font(ctx, s, false)
    if (ctx.measureText(text).width <= maxW || s <= floor) return s
    s = Math.max(Math.round(s * 0.9), floor)
  }
}

function stripQr(plan, ctx, lang) {
  const qr = plan.layers.filter((l) => l.k === 'image' && l.key === 'qr').pop()
  if (!qr) return plan
  const cx = qr.x + qr.w / 2
  const cy = qr.y + qr.h / 2
  const qrArea = qr.w * qr.h
  const scan = t('scanToView', lang)
  const belongsToQr = (l) => {
    if (l.k === 'text') return (l.lines || []).some((s) => String(s) === scan)
    if (l.k !== 'rrect' && l.k !== 'circle') return false
    const w = l.k === 'circle' ? l.r * 2 : l.w
    const h = l.k === 'circle' ? l.r * 2 : l.h
    const x = l.k === 'circle' ? l.x - l.r : l.x
    const y = l.k === 'circle' ? l.y - l.r : l.y
    return Math.abs(x + w / 2 - cx) < qr.w * 0.6 &&
      Math.abs(y + h / 2 - cy) < qr.h * 0.6 &&
      w * h <= qrArea * 4
  }
  const kept = plan.layers.filter((l) => l !== qr && !belongsToQr(l))
  const cap = plan.layers.find((l) => l.k === 'text' && (l.lines || []).some((s) => String(s) === scan))
  const ink = cap ? cap.color : INK
  const name = t('appName', lang)
  const hint = t('noQrMark', lang)
  const maxW = qr.w - 8
  const s1 = fitSize(ctx, name, maxW, Math.round(qr.w * 0.22), Math.round(qr.w * 0.1))
  const s2 = fitSize(ctx, hint, maxW, Math.round(qr.w * 0.115), Math.round(qr.w * 0.06))
  kept.push(L.text({
    x: cx, y: cy - qr.w * 0.04 + s1 * 0.34, lines: [name], size: s1, weight: 'bold', color: ink, align: 'center',
  }))
  kept.push(L.text({
    x: cx, y: cy + qr.w * 0.2 + s2 * 0.34, lines: [hint], size: s2, color: ink, align: 'center',
  }))
  return { width: plan.width, height: plan.height, layers: kept, template: plan.template }
}

function planPoster(ctx, note, templateId, profile, lang, opts) {
  const tpl = PLANNERS[templateId] ? templateId : DEFAULT_TEMPLATE
  const p = profile || {}
  const o = opts || {}
  const plan = PLANNERS[tpl](ctx, { note, profile: p, hasAvatar: !!p.avatarPath, lang: lang || 'zh' })
  return o.showQr === false ? stripQr(plan, ctx, lang || 'zh') : plan
}

// 设置页那几格小样用的内置笔记：不依赖用户数据，每套模板都能立刻看到效果。
// 中英文各一份，是因为英文的断行、字距、行高和中文不是一回事，只看中文会漏。
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

const SAMPLE_NOTE_EN = {
  id: 0,
  title: 'Turn anything you read into a note worth forwarding',
  summary: 'A link, a screenshot, or two lines of your own — it comes back as something you can share.',
  key_points: ['One line, set big enough to remember', 'Your own avatar and name printed on it'],
  tags: ['Reading'],
  category_id: 1,
  source_type: 'manual',
  created_at: '2026-09-23T10:00:00Z',
}

module.exports = {
  W,
  TEMPLATES,
  TEMPLATE_GROUPS,
  DEFAULT_TEMPLATE,
  SAMPLE_NOTE,
  SAMPLE_NOTE_EN,
  PROFILE_KEY,
  readProfile,
  writeProfile,
  avatarPath,
  stageAvatar,
  commitAvatar,
  dropAvatar,
  dropStaged,
  planPoster,
  templateLabel,
  groupName,
  paintLayers,
  loadImage,
  quoteOf,
}
