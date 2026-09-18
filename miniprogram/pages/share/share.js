const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')

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

  async renderToCanvas(note, token, qrImagePath) {
    const query = wx.createSelectorQuery()
    query.select('#shareCanvas')
      .fields({ node: true, size: true })
      .exec(async (res) => {
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        
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
        ctx.fillStyle = '#ffffff'
        ctx.roundRect(cardX, cardY, cardW, cardH, 24)
        ctx.fill()

        // Shadow effect
        ctx.shadowColor = 'rgba(0, 0, 0, 0.08)'
        ctx.shadowBlur = 20
        ctx.shadowOffsetY = 4

        // Title
        ctx.fillStyle = '#333333'
        ctx.font = 'bold 40px sans-serif'
        const title = this.truncateText(note.title, 30, ctx)
        ctx.fillText(title, cardX + 40, cardY + 80)

        // Source badge
        const sourceType = this.getSourceLabel(note.source_type)
        ctx.font = '24px sans-serif'
        ctx.fillStyle = '#07c160'
        ctx.fillText(sourceType, cardX + 40, cardY + 130)

        // Summary
        if (note.summary) {
          ctx.fillStyle = '#666666'
          ctx.font = '28px sans-serif'
          const summaryLines = this.wrapText(note.summary, 620, ctx)
          let y = cardY + 180
          for (let i = 0; i < Math.min(summaryLines.length, 4); i++) {
            ctx.fillText(summaryLines[i], cardX + 40, y)
            y += 40
          }
        }

        // Key points
        if (note.key_points && note.key_points.length > 0) {
          ctx.fillStyle = '#333333'
          ctx.font = 'bold 28px sans-serif'
          ctx.fillText(t('keyPoints', this.data.lang), cardX + 40, cardY + 380)
          
          ctx.font = '26px sans-serif'
          ctx.fillStyle = '#555555'
          let py = cardY + 420
          for (let i = 0; i < Math.min(note.key_points.length, 5); i++) {
            const point = `${i + 1}. ${this.truncateText(note.key_points[i], 35, ctx)}`
            ctx.fillText(point, cardX + 40, py)
            py += 36
          }
        }

        // Tags
        if (note.tags && note.tags.length > 0) {
          let tx = cardX + 40
          const ty = cardY + 620
          ctx.font = '22px sans-serif'
          for (const tag of note.tags.slice(0, 5)) {
            const tw = ctx.measureText(tag).width + 32
            ctx.fillStyle = 'rgba(7, 193, 96, 0.1)'
            ctx.roundRect(tx, ty - 20, tw, 36, 8)
            ctx.fill()
            ctx.fillStyle = '#07c160'
            ctx.fillText(tag, tx + 16, ty)
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
          await new Promise((resolve) => {
            img.onload = () => {
              ctx.drawImage(img, qrX, qrY, qrSize, qrSize)
              resolve()
            }
            img.onerror = () => resolve()
          })
        }

        // Export image
        wx.canvasToTempFilePath({
          canvas,
          success: (res) => {
            this.setData({ imagePath: res.tempFilePath, generating: false })
          },
          fail: () => {
            wx.showToast({ title: t('exportFailed', this.data.lang), icon: 'none' })
            this.setData({ generating: false })
          },
        }, this)
      })
  },

  truncateText(text, maxLen, ctx) {
    if (ctx.measureText(text).width <= maxLen * 20) return text
    let truncated = text
    while (ctx.measureText(truncated + '...').width > maxLen * 20 && truncated.length > 0) {
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
