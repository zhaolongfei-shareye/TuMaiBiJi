const api = require('../../utils/api.js')

Page({
  data: {
    noteId: null,
    generating: true,
    imagePath: '',
  },

  async onLoad(options) {
    if (!options.id) {
      wx.navigateBack()
      return
    }
    this.setData({ noteId: parseInt(options.id) })
    await this.generateShareImage()
  },

  async generateShareImage() {
    const { noteId } = this.data
    try {
      // Create share record
      const share = await api.createShare(noteId)
      
      // Load full note for rendering
      const note = await api.getNote(noteId)
      
      // Render to canvas
      await this.renderToCanvas(note, share.token)
    } catch (err) {
      console.error('生成分享图失败', err)
      wx.showToast({ title: '生成失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  async renderToCanvas(note, token) {
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
          ctx.fillText('核心要点', cardX + 40, cardY + 380)
          
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

        // Footer
        ctx.fillStyle = '#999999'
        ctx.font = '22px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('微图闪记 · 扫码查看原文', width / 2, cardY + cardH - 40)
        
        // QR Code placeholder (would use real QR in production)
        ctx.fillStyle = '#333333'
        ctx.font = 'bold 20px monospace'
        ctx.fillText(`Token: ${token.substring(0, 12)}...`, width / 2, cardY + cardH - 70)

        // Export image
        wx.canvasToTempFilePath({
          canvas,
          success: (res) => {
            this.setData({ imagePath: res.tempFilePath, generating: false })
          },
          fail: () => {
            wx.showToast({ title: '导出失败', icon: 'none' })
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
    const map = {
      wechat_article: '公众号文章',
      web_article: '网页文章',
      screenshot: '截图识别',
      manual: '手动撰写',
    }
    return map[sourceType] || sourceType
  },

  saveToAlbum() {
    if (!this.data.imagePath) return
    
    wx.saveImageToPhotosAlbum({
      filePath: this.data.imagePath,
      success: () => {
        wx.showToast({ title: '已保存到相册', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1000)
      },
      fail: (err) => {
        console.error('保存失败', err)
        if (err.errMsg.includes('auth')) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许访问相册',
            success: (res) => {
              if (res.confirm) wx.openSetting()
            },
          })
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      },
    })
  },

  onCancel() {
    wx.navigateBack()
  },
})
