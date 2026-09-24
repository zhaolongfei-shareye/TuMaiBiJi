const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const poster = require('../../utils/poster.js')

Page({
  data: {
    noteId: null,
    generating: true,
    imagePath: '',
    themeClass: '',
    lang: 'zh',
    t: texts('zh'),
    // 画布位图高度随内容和模板变，CSS 高度得跟着改，否则预览会被压扁
    canvasH: 1200,
    templateLabel: '',
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
      this._note = note
      this._token = share.token
      this._qrPath = await this.downloadQRImage(share.token)
      await this.render()
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
          if (res.statusCode === 200) resolve(res.tempFilePath)
          else reject(new Error(`QR download failed: ${res.statusCode}`))
        },
        fail: reject,
      })
    })
  },

  // 码没解码成功就出一张"留了个空白方块"的海报：看上去是完整的，谁也扫不开。
  // 先重新下一趟再试；还不行就直接失败让他重试，不静默出一张废图。
  async loadQr(canvas) {
    let qr = await poster.loadImage(canvas, this._qrPath, 3000)
    if (!qr) {
      this._qrPath = await this.downloadQRImage(this._token)
      qr = await poster.loadImage(canvas, this._qrPath, 3000)
    }
    if (!qr) throw new Error('小程序码解不开')
    return qr
  },

  async render() {
    const { lang } = this.data
    const profile = poster.readProfile()
    const avatar = poster.avatarPath()
    const canvas = await this.getCanvas()
    const ctx = canvas.getContext('2d')

    const images = { qr: await this.loadQr(canvas) }
    if (avatar) images.avatar = await poster.loadImage(canvas, avatar, 5000)

    // 先量后画：两趟必须用同一套数，否则量出来的高度和画出来的位置对不上。
    // 改宽高会清掉画布状态，所以模板里每种字体都重新设过。
    // 量那一趟只需要字体度量，不需要真画出内容，所以临时画布给 750×750 就够——
    // 750×2600 已经超出部分机型单张画布的上限，安卓上有崩的风险。
    canvas.width = poster.W
    canvas.height = 750
    const plan = poster.planPoster(ctx, this._note, profile.template, profile, lang)
    canvas.width = plan.width
    canvas.height = plan.height
    poster.paintLayers(ctx, plan.layers, images)

    this.setData({ canvasH: plan.height, templateLabel: poster.templateLabel(plan.template, lang) })

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

  // createSelectorQuery 的 exec 回调是"被微信异步调用"的，回调里抛出的异常既不会冒泡到
  // generateShareImage 的 try/catch，也不会被 await 感知（原实现 await 的是一个立刻 resolve
  // 的 undefined）。结果是画布一旦出错，页面就永久停在"生成分享图…"且没有任何提示。
  getCanvas() {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .select('#shareCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvas = res && res[0] && res[0].node
          if (canvas) resolve(canvas)
          else reject(new Error('分享画布未就绪'))
        })
    })
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
