const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')

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

Page({
  data: {
    noteId: null,
    generating: true,
    imagePath: '',
    themeClass: '',
    lang: 'zh',
    t: texts('zh'),
  },

  async onLoad(options) {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass: app.getThemeClass(app.globalData.userInfo?.wallpaper || 'default'),
    })
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
        
        const width = 750
        const height = 1200
        canvas.width = width
        canvas.height = height

        // Background gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, height)
        gradient.addColorStop(0, '#f8f9fa')
        gradient.addColorStop(1, '#e9ecef')
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, width, height)

        // Card background
        const cardX = 40
        const cardY = 60
        const cardW = width - 80
        const cardH = height - 160
        const contentX = cardX + 40
        const contentW = cardW - 80
        const qrTop = cardY + cardH - 180
        const contentBottom = qrTop - 36

        ctx.shadowColor = 'rgba(0, 0, 0, 0.08)'
        ctx.shadowBlur = 20
        ctx.shadowOffsetY = 4
        ctx.fillStyle = '#ffffff'
        ctx.roundRect(cardX, cardY, cardW, cardH, 24)
        ctx.fill()
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
        ctx.shadowOffsetY = 0

        // 内容驱动布局：y 随每块实际行数推进，装不下的块整块跳过
        let y = cardY + 76

        // Title，最多两行
        ctx.fillStyle = '#333333'
        ctx.font = 'bold 40px sans-serif'
        const allTitleLines = this.wrapText(note.title || '', contentW, ctx)
        const titleLines = allTitleLines.slice(0, 2)
        if (allTitleLines.length > 2) {
          titleLines[1] = this.ellipsize(titleLines[1], contentW, ctx)
        }
        for (const line of titleLines) {
          ctx.fillText(line, contentX, y)
          y += 52
        }

        // Source badge
        ctx.font = '24px sans-serif'
        ctx.fillStyle = '#07c160'
        y += 6
        ctx.fillText(this.getSourceLabel(note.source_type), contentX, y)
        y += 46

        // Summary，最多四行
        if (note.summary) {
          ctx.fillStyle = '#666666'
          ctx.font = '28px sans-serif'
          const lines = this.wrapText(note.summary, contentW, ctx)
          const shown = lines.slice(0, 4)
          if (lines.length > 4) {
            shown[3] = this.ellipsize(shown[3], contentW, ctx)
          }
          for (const line of shown) {
            if (y > contentBottom) break
            ctx.fillText(line, contentX, y)
            y += 40
          }
          y += 16
        }

        // Key points，最多五条
        const points = (note.key_points || []).slice(0, 5)
        if (points.length && y + 44 + points.length * 40 <= contentBottom) {
          ctx.fillStyle = '#333333'
          ctx.font = 'bold 28px sans-serif'
          ctx.fillText(t('keyPoints', this.data.lang), contentX, y)
          y += 44
          ctx.font = '26px sans-serif'
          ctx.fillStyle = '#555555'
          points.forEach((point, i) => {
            ctx.fillText(this.ellipsize(`${i + 1}. ${point}`, contentW, ctx), contentX, y)
            y += 40
          })
          y += 16
        }

        // Tags，单行，放不下就少画几个
        if (note.tags && note.tags.length && y + 40 <= contentBottom) {
          ctx.font = '22px sans-serif'
          let tx = contentX
          for (const tag of note.tags.slice(0, 5)) {
            const tw = ctx.measureText(tag).width + 32
            if (tx + tw > contentX + contentW) break
            ctx.fillStyle = 'rgba(7, 193, 96, 0.1)'
            ctx.roundRect(tx, y - 24, tw, 36, 8)
            ctx.fill()
            ctx.fillStyle = '#07c160'
            ctx.fillText(tag, tx + 16, y)
            tx += tw + 12
          }
        }

        // Footer - QR code and scan text
        ctx.fillStyle = '#999999'
        ctx.font = '22px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(t('scanToView', this.data.lang), width / 2, cardY + cardH - 40)

        // Draw QR code image
        const qrSize = 120
        const qrX = (width - qrSize) / 2
        const qrY = cardY + cardH - 180
        
        if (qrImagePath) {
          const img = canvas.createImage()
          img.src = qrImagePath
          // 解码异常时 onload/onerror 可能一个都不触发，这里加超时兜底；
          // 否则整个 await 永久挂住，页面就停在"生成分享图…"出不来。
          await new Promise((done) => {
            const timer = setTimeout(done, 3000)
            img.onload = () => {
              clearTimeout(timer)
              ctx.drawImage(img, qrX, qrY, qrSize, qrSize)
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
