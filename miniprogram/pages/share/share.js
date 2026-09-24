// 模板小图一排：CSS 宽 176rpx，位图按 0.28 倍铺（和「卡片模板」页那 288rpx 的
// 小样同一套算法，只是更小），高度由 JS 按比例算好写进 style。
const PICK_W = 176
const PICK_SCALE = 0.28
const MEASURE_H = 750

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
    tpls: [],
    picked: '',
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
      // 海报上那个名字是本地画进图片的，服务器原本不知道；扫码落地页要显示"原创作者"
      // 就得在建分享时把它带上去一次（服务端会截到 32 字并和正文一起过内容安全）。
      const share = await api.createShare(noteId, poster.readProfile().name)
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
      this.renderPicker()
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
    // 默认沿用「卡片模板」里选的那套；这一页手动换过之后以这一页的为准（不回写设置）
    const plan = poster.planPoster(ctx, this._note, this.data.picked || profile.template, profile, lang)
    canvas.width = plan.width
    canvas.height = plan.height
    poster.paintLayers(ctx, plan.layers, images)

    this.setData({ canvasH: plan.height })

    await new Promise((done, fail) => {
      wx.canvasToTempFilePath({
        canvas,
        // 默认是 jpg。海报上是纯色块 + 小字 + 一张小程序码，JPEG 在码点边缘会压出
        // 振铃，某些镜头下就扫得慢甚至扫不上；PNG 对这些内容本来也更小更干净。
        fileType: 'png',
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
  getCanvas(selector) {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .select(selector || '#shareCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvas = res && res[0] && res[0].node
          if (canvas) resolve(canvas)
          else reject(new Error('分享画布未就绪'))
        })
    })
  },

  // 那一排小图只画一次：它的用处是"这一套长什么样"，画的是当前这条笔记的缩略版，
  // 不跟着上面的点击变——跟着变就看不出每套的区别了。
  async renderPicker() {
    if (this._pickerDone || !this._note) return
    this._pickerDone = true
    const { lang } = this.data
    const profile = poster.readProfile()
    const picked = this.data.picked || profile.template || poster.DEFAULT_TEMPLATE
    const avatar = poster.avatarPath()
    const tpls = poster.TEMPLATES.map((x) => ({
      id: x.id,
      label: poster.templateLabel(x.id, lang),
      h: Math.round((PICK_W * 4) / 3),
    }))
    this.setData({ tpls, picked })
    for (const x of tpls) {
      try {
        const canvas = await this.getCanvas(`#pick-${x.id}`)
        const ctx = canvas.getContext('2d')
        const images = { qr: await poster.loadImage(canvas, this._qrPath, 3000) }
        if (avatar) images.avatar = await poster.loadImage(canvas, avatar, 4000)
        canvas.width = poster.W
        canvas.height = MEASURE_H
        const plan = poster.planPoster(ctx, this._note, x.id, profile, lang)
        canvas.width = Math.round(plan.width * PICK_SCALE)
        canvas.height = Math.round(plan.height * PICK_SCALE)
        ctx.scale(PICK_SCALE, PICK_SCALE)
        poster.paintLayers(ctx, plan.layers, images)
        x.h = Math.round((plan.height * PICK_W) / poster.W)
      } catch (err) {
        console.error('模板小图没画出来', x.id, err)
      }
    }
    this.setData({ tpls: tpls.slice() })
  },

  // 换一套模板 = 上面那张重画一遍（码、头像、正文都复用，只是排法换）
  onPickTemplate(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.picked) return
    this.setData({
      picked: id,
      tpls: this.data.tpls.map((x) => Object.assign({}, x, { active: x.id === id })),
    })
    this.render().catch((err) => {
      console.error('换模板后重画失败', err)
      wx.showToast({ title: t('generateFailed', this.data.lang), icon: 'none' })
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
        const msg = (err && err.errMsg) || ''
        // 相册面板上按"取消"也会走 fail。真机每次保存都会先弹这个面板，
        // 不认 cancel 的话，用户收起了面板就被判了一句"导出失败"。
        if (msg.indexOf('cancel') >= 0) return
        if (msg.indexOf('auth') >= 0) {
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
