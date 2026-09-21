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
      themeClass: app.applyTheme(app.globalData.userInfo?.wallpaper || 'default'),
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
        
        const width = 750
        const height = 1200
        canvas.width = width
        canvas.height = height

        // 分类色定顶部色带和序号，和首页/详情页同一条笔记同色
        const tone = toneFor(note.category_id)
        const BODY = '#3c4046'
        const MUTED = '#9a9ea6'

        // Background gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, height)
        // mix 的第三个参数是"第一个颜色占多少"，所以这里要给白色大权重：
        // 之前写成 0.88 / 0.94 等于整屏铺满分类色，实测海报底成了实心蓝块。
        gradient.addColorStop(0, mix(tone.bg, '#ffffff', 0.08))
        gradient.addColorStop(1, mix(tone.bg, '#ffffff', 0.22))
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, width, height)

        // Card background
        const cardX = 40
        const cardY = 60
        const cardW = width - 80
        const cardH = height - 160
        const R = 44
        // 色带和正文用同一圈内边距，两边对不齐的话海报会显得是两块东西拼起来的
        const PAD = 44
        const contentX = cardX + PAD
        const contentW = cardW - PAD * 2
        const qrSize = 120
        const qrY = cardY + cardH - 175
        const contentBottom = qrY - 30

        ctx.shadowColor = 'rgba(35, 37, 44, 0.10)'
        ctx.shadowBlur = 30
        ctx.shadowOffsetY = 8
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.roundRect(cardX, cardY, cardW, cardH, R)
        ctx.fill()
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
        ctx.shadowOffsetY = 0

        // 内容驱动布局：y 随每块实际行数推进，装不下的块整块跳过
        //
        // 顶部是一条分类色带，带里是"左半透明方块 + 标题"，和首页/详情页那一行同一套语法。
        // 色带要用卡片的圆角切边，所以先把卡片路径裁出来再填色。
        // 色带高度由标题实际行数算出来；标题最多三行，再长省略。
        const TITLE_SIZE = 34
        const TITLE_LH = 46
        const BLK = 148
        const blkX = cardX + PAD
        const blkY = cardY + PAD
        const titleX = blkX + BLK + 24
        const titleW = cardW - PAD * 2 - BLK - 24

        ctx.font = `bold ${TITLE_SIZE}px sans-serif`
        const allTitleLines = this.wrapText(note.title || '', titleW, ctx)
        const titleLines = allTitleLines.slice(0, 3)
        if (allTitleLines.length > 3) {
          titleLines[2] = this.ellipsize(titleLines[2], titleW, ctx)
        }
        const bandH = PAD * 2 + Math.max(BLK, titleLines.length * TITLE_LH)

        ctx.save()
        ctx.beginPath()
        ctx.roundRect(cardX, cardY, cardW, cardH, R)
        ctx.clip()
        ctx.fillStyle = tone.bg
        ctx.fillRect(cardX, cardY, cardW, bandH)
        // 方块是色带上的一层半透明白，不是第六种颜色，所以不引入 palette 之外的色值。
        // 画布里做不出界面那套"末端渐隐"，所以超长的分类名只能截断加省略号；
        // 方块内容宽 108px、字 28px，中文三四字以内不会走到这条分支。
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
        ctx.beginPath()
        ctx.roundRect(blkX, blkY, BLK, BLK, 28)
        ctx.fill()
        ctx.restore()

        ctx.fillStyle = tone.ink
        ctx.font = 'bold 28px sans-serif'
        const blockName = note.category_name || (note.category_id == null ? t('noCategory', this.data.lang) : '')
        ctx.fillText(this.ellipsize(blockName, BLK - 40, ctx), blkX + 20, blkY + 48)
        ctx.font = 'bold 17px sans-serif'
        ctx.globalAlpha = 0.75
        ctx.fillText(formatShortDate(note.created_at), blkX + 20, blkY + BLK - 22)
        ctx.globalAlpha = 1

        let y = blkY + TITLE_SIZE
        ctx.font = `bold ${TITLE_SIZE}px sans-serif`
        ctx.fillStyle = tone.ink
        for (const line of titleLines) {
          ctx.fillText(line, titleX, y)
          y += TITLE_LH
        }

        y = cardY + bandH + 56

        // 来源和标签并作一行小眉标。分类名已经在方块里了，这里不再重复一遍
        ctx.font = 'bold 22px sans-serif'
        ctx.fillStyle = MUTED
        const metaLine = [
          this.getSourceLabel(note.source_type),
          (note.tags || []).join(' / '),
        ].filter(Boolean).join(' · ')
        ctx.fillText(this.ellipsize(metaLine, contentW, ctx), contentX, y)
        y += 48

        // Summary，最多四行
        if (note.summary) {
          ctx.font = '27px sans-serif'
          ctx.fillStyle = BODY
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
          y += 24
        }

        // Key points，最多五条
        const points = (note.key_points || []).slice(0, 5)
        if (points.length && y + 44 + points.length * 42 <= contentBottom) {
          ctx.fillStyle = MUTED
          ctx.font = 'bold 22px sans-serif'
          ctx.fillText(t('keyPoints', this.data.lang), contentX, y)
          y += 44
          points.forEach((point, i) => {
            // 序号做成分类色圆块，和详情页的圆形序号同款
            ctx.fillStyle = tone.bg
            ctx.beginPath()
            ctx.arc(contentX + 18, y - 9, 18, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = tone.ink
            ctx.font = 'bold 21px sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText(String(i + 1), contentX + 18, y - 2)
            ctx.textAlign = 'left'
            ctx.fillStyle = BODY
            ctx.font = '26px sans-serif'
            ctx.fillText(this.ellipsize(point, contentW - 50, ctx), contentX + 50, y)
            y += 42
          })
          y += 14
        }

        // Footer - QR code and scan text
        const qrX = (width - qrSize) / 2
        ctx.fillStyle = MUTED
        ctx.font = '22px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(t('scanToView', this.data.lang), width / 2, qrY + qrSize + 34)
        ctx.textAlign = 'left'

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
