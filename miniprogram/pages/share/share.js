const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { toneFor, mix } = require('../../utils/palette.js')
const { formatShortDate } = require('../../utils/date.js')

// 小程序 canvas 2d 的 roundRect 在部分基础库/机型上不存在，直接调用会抛 TypeError。
// 而绘图代码一旦抛在这一步，后面的导出根本不会执行，所以这里补一个等价实现。
function ensureRoundRect(ctx) {
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

// 海报的骨架尺寸。单位和原来一致（画布宽 750，1 像素 = 1rpx）。
// 抽出来是因为"量内容"和"落笔"分成两趟之后，两趟必须用同一套数，
// 否则量出来的高度和画出来的位置会对不上，二维码压到文字上。
const G = {
  width: 750,
  cardX: 40,
  cardY: 60,
  pad: 44,
  radius: 44,
  block: 148,
  blockSize: 28,
  titleSize: 34,
  titleLH: 46,
  metaSize: 22,
  bodySize: 27,
  bodyLH: 40,
  pointSize: 26,
  pointLH: 42,
  pointIndex: 21,
  pointHead: 44,
  qrSize: 120,
  // 文字下沿到下一块首行基线；描字后留的下沿余量
  blockGap: 40,
  descender: 8,
}

Page({
  data: {
    noteId: null,
    generating: true,
    imagePath: '',
    themeClass: '',
    lang: 'zh',
    t: texts('zh'),
    // 画布位图高度随内容变，CSS 高度得跟着改，否则预览会被压扁
    canvasH: 1200,
  },

  async onLoad(options) {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass: app.applyTheme(app.globalData.userInfo?.wallpaper || 'default'),
    })
    app.setNavTitle('navShare', lang)
    if (!options.id) {
      wx.navigateBack()
      return
    }
    this.setData({ noteId: parseInt(options.id) })
    await this.generateShareImage()
  },

  async generateShareImage() {
    const { noteId, lang } = this.data
    try {
      const share = await api.createShare(noteId)
      const note = await api.getNote(noteId)
      // 分类名不在笔记响应里，海报上那行小字要靠分类表查。
      // 查不到就只写来源，不写成"未分类"——它明明归了类。
      if (note.category_id) {
        try {
          const categories = await api.getCategories()
          const category = categories.find((c) => c.id === note.category_id)
          if (category) note.category_name = category.name
        } catch (err) {
          console.error('加载分类列表失败', err)
        }
      }
      const qrImagePath = await this.downloadQRImage(share.token)
      await this.renderToCanvas(note, share.token, qrImagePath)
    } catch (err) {
      console.error('生成分享图失败', err)
      wx.showToast({ title: t('generateFailed', lang), icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  downloadQRImage(token) {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url: api.getShareQRCodeUrl(token),
        success(res) {
          if (res.statusCode === 200) {
            resolve(res.tempFilePath)
          } else {
            reject(new Error(`QR download failed: ${res.statusCode}`))
          }
        },
        fail: reject,
      })
    })
  },

  renderToCanvas(note, token, qrImagePath) {
    // createSelectorQuery 的 exec 回调是"被微信异步调用"的，回调里抛出的异常既不会冒泡到
    // generateShareImage 的 try/catch，也不会被 await 感知（原实现 await 的是一个立刻 resolve
    // 的 undefined）。结果是画布一旦出错，页面就永久停在"生成分享图…"且没有任何提示。
    // 这里把回调包成 Promise，让异常能真正被上层捕获。
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .select('#shareCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          this.drawCard(res, note, qrImagePath).then(resolve, reject)
        })
    })
  },

  async drawCard(res, note, qrImagePath) {
    const canvas = res && res[0] && res[0].node
    if (!canvas) throw new Error('分享画布未就绪')
    const ctx = canvas.getContext('2d')
    ensureRoundRect(ctx)

    // 高度由内容算出来，不再先定死 1200 再往里塞：定高的时候短笔记会在二维码上方
    // 留出半屏空白，要点多了又只能靠"装不下就整块跳过"兜底。先量行数、再按量出来的
    // 尺寸落笔，两个问题一起没有。
    // 量之前先给一个够用的临时尺寸——改宽高会清掉画布状态，所以 paint 里每种字体都重新设。
    canvas.width = G.width
    canvas.height = 1400
    const plan = this.planPoster(ctx, note)

    canvas.width = plan.width
    canvas.height = plan.height
    // 位图是 750 宽、1 像素 = 1rpx，所以预览按同一比例给 CSS 高度就不会被压扁
    this.setData({ canvasH: plan.height })
    this.paintPoster(ctx, note, plan)

    if (qrImagePath) {
      const img = canvas.createImage()
      img.src = qrImagePath
      // 解码异常时 onload/onerror 可能一个都不触发，这里加超时兜底；
      // 否则整个 await 永久挂住，页面就停在"生成分享图…"出不来。
      await new Promise((done) => {
        const timer = setTimeout(done, 3000)
        img.onload = () => {
          clearTimeout(timer)
          ctx.drawImage(img, plan.qrX, plan.qrY, G.qrSize, G.qrSize)
          done()
        }
        img.onerror = () => {
          clearTimeout(timer)
          done()
        }
      })
    }

    // Export image
    await new Promise((done, fail) => {
      wx.canvasToTempFilePath({
        canvas,
        success: (r) => {
          this.setData({ imagePath: r.tempFilePath, generating: false })
          done()
        },
        fail,
      }, this)
    })
  },

  // 只量不画：把每块要显示的行截出来（含省略号），再推出各块基线和整张图的高度。
  planPoster(ctx, note) {
    const cardW = G.width - G.cardX * 2
    const contentX = G.cardX + G.pad
    const contentW = cardW - G.pad * 2
    const titleX = contentX + G.block + 24
    const titleW = contentW - G.block - 24

    ctx.font = `bold ${G.titleSize}px sans-serif`
    const allTitleLines = this.wrapText(note.title || '', titleW, ctx)
    const titleLines = allTitleLines.slice(0, 3)
    if (allTitleLines.length > 3) {
      titleLines[2] = this.ellipsize(titleLines[2], titleW, ctx)
    }
    const bandH = G.pad * 2 + Math.max(G.block, titleLines.length * G.titleLH)

    ctx.font = `bold ${G.metaSize}px sans-serif`
    const metaLine = this.ellipsize(
      [
        this.getSourceLabel(note.source_type),
        (note.tags || []).join(' / '),
      ].filter(Boolean).join(' · '),
      contentW,
      ctx,
    )

    ctx.font = `${G.bodySize}px sans-serif`
    let summaryLines = []
    if (note.summary) {
      const lines = this.wrapText(note.summary, contentW, ctx)
      summaryLines = lines.slice(0, 4)
      if (lines.length > 4) {
        summaryLines[3] = this.ellipsize(summaryLines[3], contentW, ctx)
      }
    }

    ctx.font = `${G.pointSize}px sans-serif`
    const points = (note.key_points || [])
      .slice(0, 5)
      .map((p) => this.ellipsize(p, contentW - 50, ctx))

    // y 是"下一行文字的基线"，bottom 是"上一块文字的下沿"，
    // 每块结束时都把它推进到位，所以最后不存在放不下这件事。
    const metaY = G.cardY + bandH + 56
    let bottom = metaY + G.descender

    let summaryTop = 0
    if (summaryLines.length) {
      summaryTop = bottom + G.blockGap
      bottom = summaryTop + (summaryLines.length - 1) * G.bodyLH + G.descender
    }

    let pointsTop = 0
    if (points.length) {
      pointsTop = bottom + G.blockGap
      const firstPoint = pointsTop + G.pointHead
      bottom = firstPoint + (points.length - 1) * G.pointLH + G.descender
    }

    const qrY = bottom + G.blockGap
    const cardBottom = qrY + G.qrSize + 34 + 24
    return {
      width: G.width,
      height: cardBottom + G.cardY,
      cardX: G.cardX,
      cardY: G.cardY,
      cardW,
      cardH: cardBottom - G.cardY,
      contentX,
      contentW,
      bandH,
      blkX: contentX,
      blkY: G.cardY + G.pad,
      titleX,
      titleLines,
      metaLine,
      metaY,
      summaryTop,
      summaryLines,
      pointsTop,
      points,
      qrX: (G.width - G.qrSize) / 2,
      qrY,
    }
  },

  // 只画不量：坐标全部来自 plan，这里不再换算法。
  paintPoster(ctx, note, p) {
    // 分类色定顶部色带和序号，和首页/详情页同一条笔记同色
    const tone = toneFor(note.category_id)
    const BODY = '#3c4046'
    const MUTED = '#9a9ea6'

    const gradient = ctx.createLinearGradient(0, 0, 0, p.height)
    // mix 的第三个参数是"第一个颜色占多少"，所以这里要给白色大权重：
    // 之前写成 0.88 / 0.94 等于整屏铺满分类色，实测海报底成了实心蓝块。
    gradient.addColorStop(0, mix(tone.bg, '#ffffff', 0.08))
    gradient.addColorStop(1, mix(tone.bg, '#ffffff', 0.22))
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, p.width, p.height)

    ctx.shadowColor = 'rgba(35, 37, 44, 0.10)'
    ctx.shadowBlur = 30
    ctx.shadowOffsetY = 8
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.roundRect(p.cardX, p.cardY, p.cardW, p.cardH, G.radius)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    // 顶部是一条分类色带，带里是"左半透明方块 + 标题"，和首页/详情页那一行同一套语法。
    // 色带要用卡片的圆角切边，所以先把卡片路径裁出来再填色。
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(p.cardX, p.cardY, p.cardW, p.cardH, G.radius)
    ctx.clip()
    ctx.fillStyle = tone.bg
    ctx.fillRect(p.cardX, p.cardY, p.cardW, p.bandH)
    // 方块是色带上的一层半透明白，不是第六种颜色，所以不引入 palette 之外的色值。
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
    ctx.beginPath()
    ctx.roundRect(p.blkX, p.blkY, G.block, G.block, 28)
    ctx.fill()
    ctx.restore()

    // 方块上的字跟列表、详情同一条规则：第一个标签优先，没标签才回退分类名。
    // 海报是发出去的门面，三处不一致的话别人转出去的图和自己在库里看到的就不是同一条。
    const firstTag = (note.tags || []).map((x) => (x || '').trim()).find(Boolean) || ''
    const blockName = firstTag || note.category_name || (note.category_id == null ? t('noCategory', this.data.lang) : '')
    ctx.fillStyle = tone.ink
    ctx.font = `bold ${G.blockSize}px sans-serif`
    // 画布里做不出界面那套"末端渐隐"，所以超长的分类名只能截断加省略号；
    // 方块内容宽 108px、字 28px，中文三四字以内不会走到这条分支。
    ctx.fillText(this.ellipsize(blockName, G.block - 40, ctx), p.blkX + 20, p.blkY + 48)
    ctx.font = 'bold 17px sans-serif'
    ctx.globalAlpha = 0.75
    ctx.fillText(formatShortDate(note.created_at), p.blkX + 20, p.blkY + G.block - 22)
    ctx.globalAlpha = 1

    ctx.font = `bold ${G.titleSize}px sans-serif`
    ctx.fillStyle = tone.ink
    let y = p.blkY + G.titleSize
    for (const line of p.titleLines) {
      ctx.fillText(line, p.titleX, y)
      y += G.titleLH
    }

    // 来源和标签并作一行小眉标。分类名已经在方块里了，这里不再重复一遍
    ctx.font = `bold ${G.metaSize}px sans-serif`
    ctx.fillStyle = MUTED
    ctx.fillText(p.metaLine, p.contentX, p.metaY)

    if (p.summaryLines.length) {
      let sy = p.summaryTop
      ctx.font = `${G.bodySize}px sans-serif`
      ctx.fillStyle = BODY
      for (const line of p.summaryLines) {
        ctx.fillText(line, p.contentX, sy)
        sy += G.bodyLH
      }
    }

    if (p.points.length) {
      ctx.fillStyle = MUTED
      ctx.font = `bold ${G.metaSize}px sans-serif`
      ctx.fillText(t('keyPoints', this.data.lang), p.contentX, p.pointsTop)
      let py = p.pointsTop + G.pointHead
      p.points.forEach((point, i) => {
        // 序号做成分类色圆块，和详情页的圆形序号同款
        ctx.fillStyle = tone.bg
        ctx.beginPath()
        ctx.arc(p.contentX + 18, py - 9, 18, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = tone.ink
        ctx.font = `bold ${G.pointIndex}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), p.contentX + 18, py - 2)
        ctx.textAlign = 'left'
        ctx.fillStyle = BODY
        ctx.font = `${G.pointSize}px sans-serif`
        ctx.fillText(point, p.contentX + 50, py)
        py += G.pointLH
      })
    }

    // 二维码下面那行引导语：基线位置在量高度时已经算进 cardBottom
    ctx.fillStyle = MUTED
    ctx.font = `${G.metaSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(t('scanToView', this.data.lang), p.width / 2, p.qrY + G.qrSize + 34)
    ctx.textAlign = 'left'
  },

  ellipsize(text, maxWidth, ctx) {
    if (ctx.measureText(text).width <= maxWidth) return text
    let truncated = text
    while (truncated.length > 1 && ctx.measureText(truncated + '...').width > maxWidth) {
      truncated = truncated.slice(0, -1)
    }
    return truncated + '...'
  },

  wrapText(text, maxWidth, ctx) {
    const lines = []
    let currentLine = ''
    const words = text.split('')

    for (const char of words) {
      const testLine = currentLine + char
      if (ctx.measureText(testLine).width > maxWidth) {
        lines.push(currentLine)
        currentLine = char
      } else {
        currentLine = testLine
      }
    }
    if (currentLine) lines.push(currentLine)
    return lines
  },

  getSourceLabel(sourceType) {
    const keys = {
      wechat_article: 'sourceWechatArticle',
      web_article: 'sourceWebArticle',
      screenshot: 'sourceScreenshot',
      manual: 'sourceManual',
    }
    const key = keys[sourceType]
    return key ? t(key, this.data.lang) : sourceType
  },

  saveToAlbum() {
    if (!this.data.imagePath) return
    const { lang } = this.data

    wx.saveImageToPhotosAlbum({
      filePath: this.data.imagePath,
      success: () => {
        wx.showToast({ title: t('savedToAlbum', lang), icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1000)
      },
      fail: (err) => {
        console.error('保存失败', err)
        if (err.errMsg.includes('auth')) {
          wx.showModal({
            title: t('needAlbumPermission', lang),
            content: t('permissionHint', lang),
            success: (res) => {
              if (res.confirm) wx.openSetting()
            },
          })
        } else {
          wx.showToast({ title: t('exportFailed', lang), icon: 'none' })
        }
      },
    })
  },

  onCancel() {
    wx.navigateBack()
  },
})
