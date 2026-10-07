// 模板小图一排：CSS 宽 176rpx，位图按 0.28 倍铺（和「卡片模板」页那 288rpx 的
// 小样同一套算法，只是更小），高度由 JS 按比例算好写进 style。
const PICK_W = 176
const PICK_SCALE = 0.28
// 小图圆角。不跟 app.wxss 的 --r-chip（28）：那一档换算到位图是 119 单位，
// block 那套最长的笔记里最贴角的是码下面那行引导语（英文比中文宽，居中在码下面，
// 会往右伸出码本身一圈），28 → 位图 119 时它的右下角越界 13.1 个单位。尺子
// 验-海报模板几何.js 最后一段十模板×六笔记×中英都量一遍，18 → 位图 77 后最不利的一格还剩 4.6 个单位余量。
// 真机上原生画布不吃 CSS 圆角，所以这个数才是最终外观；share.wxss 里的 border-radius
// 只是让模拟器跟它一致。
const PICK_R = 18
const MEASURE_H = 750

// 预览框定高（rpx，画布位图 1 像素 = 1rpx）。十套模板的成品图高度差得很多，
// 让图在一个不动的框里等比缩放居中，下面那排模板小图才不会跟着上下跳。
const PREVIEW_BOX = 900
function previewBox(w, h) {
  const scale = Math.min(1, PREVIEW_BOX / h)
  return { canvasW: Math.round(w * scale), canvasH: Math.round(h * scale) }
}

const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const poster = require('../../utils/poster.js')
const cardLog = require('../../utils/cardLog.js')
const cardInfo = require('../../utils/cardInfo.js')

Page({
  data: {
    noteId: null,
    generating: true,
    imagePath: '',
    themeClass: '',
    lang: 'zh',
    t: texts('zh'),
    // 画布位图高度随内容和模板变，CSS 尺寸得跟着等比改，否则预览会被压扁。
    // 两者都按 PREVIEW_BOX 缩到预览框里，换模板时框子不变，下面那排小图才不跳。
    canvasW: 750,
    canvasH: 900,
    tpls: [],
    picked: '',
    // 码要不要印在图上。发微信以外的平台（微博、小红书那类）常常看见第三方码就屏蔽整张图，
    // 所以这一页允许只留文字。默认带码——在自己群里转发时码才是入口。
    noQr: false,
    // 「卡片上的信息」那一层那四个键，与首页成品弹窗同一份初值（utils/cardInfo.js）
    ...cardInfo.initial(),
  },

  async onLoad(options) {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass: app.applyTheme(app.getWallpaper()),
    })
    app.setNavTitle('navShare', lang)
    if (!options.id) {
      wx.navigateBack()
      return
    }
    const noteId = parseInt(options.id)
    this.setData({ noteId })
    // 一篇只留一张卡片（站长 10-03 定的口径，10-07 他报这一页漏接了：从详情页进这一页，
    // 生成过一张之后还能再生成一张）。挡在**这一页**而不是只挡详情页那个入口——规矩要落在
    // 会出图的地方，这一页以后多几个入口（深链、列表里那枚）也照样拦得住。
    // 拿的是上面那个局部变量而不是 `this.data.noteId`：setData 对视图层是异步的，
    // 刚写完就读它，判的可能是上一个号的台账。
    // 顺序要紧：这一句必须在 `generateShareImage()` 前面，那一趟会先 POST 建一张分享码，
    // 挡晚了就等于"这篇不许有第二张卡片"和"这篇已经多了第二张活码"同时成立。
    // 判据用 `aliveFor` 而不是 `forNote`：详情页与详情窗右上那一格画不画缩略图吃的就是它
    // （账在本机 storage 里、图在应用私有目录，系统清缓存能只清图不清账）。两边要是各判各的，
    // 那一格显示"还没有生成过卡片"、点进来却被这道闸挡回"这篇已经有一张"——一屏两句反话。
    if (cardLog.aliveFor(noteId).length) {
      wx.showToast({ title: t('cardOneOnly', lang), icon: 'none', duration: 1800 })
      setTimeout(() => wx.navigateBack(), 1600)
      return
    }
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
    const profile = poster.posterProfile()   // avatarPath 这一栏要现算，见 poster.js
    const avatar = poster.cardPath()
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
    const plan = poster.planPoster(ctx, this._note, this.data.picked || profile.template, profile, lang, { showQr: !this.data.noQr })
    canvas.width = plan.width
    canvas.height = plan.height
    poster.paintLayers(ctx, plan.layers, images)

    this.setData(previewBox(plan.width, plan.height))

    await new Promise((done, fail) => {
      wx.canvasToTempFilePath({
        canvas,
        // 默认是 jpg。海报上是纯色块 + 小字 + 一张小程序码，JPEG 在码点边缘会压出
        // 振铃，某些镜头下就扫得慢甚至扫不上；PNG 对这些内容本来也更小更干净。
        fileType: 'png',
        success: (r) => {
          this.setData({ imagePath: r.tempFilePath, generating: false })
          // 画布与这一张用的是哪套模板、带没带码留着备用：台账只在人真存下这张时才记（见 _keepCard）。
          // 这两样都要在画布落图这一趟取，不能等记账那一刻现读 data——中途换过就不匹了。
          this._canvasNode = canvas
          this._renderedTpl = this.data.picked || profile.template
          this._renderedNoQr = !!this.data.noQr
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
    const profile = poster.posterProfile()   // avatarPath 这一栏要现算，见 poster.js
    const picked = this.data.picked || profile.template || poster.DEFAULT_TEMPLATE
    const avatar = poster.cardPath()
    // 合并后的那份（包内 ∪ 下发）：服务端多一套，这一排就多一格；收成 archived 就自己少一格。
    const tpls = poster.templateList().map((x) => ({
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
        const h = Math.round((plan.height * PICK_W) / poster.W)
        // 先让视图层把这一格的高度改成真实比例，再落笔（同 profile.js 那条：
        // 圆角是画进位图的，显示框还压在 4:3 占位里就会被看成一个竖扁的椭圆角）。
        const i = tpls.indexOf(x)
        this.setData({ [`tpls[${i}].h`]: h })
        await new Promise((r) => wx.nextTick(r))
        canvas.width = Math.round(plan.width * PICK_SCALE)
        canvas.height = Math.round(plan.height * PICK_SCALE)
        ctx.scale(PICK_SCALE, PICK_SCALE)
        poster.clipRounded(ctx, plan.width, plan.height, PICK_R, PICK_W)
        poster.paintLayers(ctx, plan.layers, images)
        x.h = h
      } catch (err) {
        console.error('模板小图没画出来', x.id, err)
      }
    }
    this.setData({ tpls: tpls.slice() })
  },

  // 开关只管上面那张成品图；下面那排小图按他说的保持固定样式，不跟着变。
  onToggleQr() {
    if (this.data.generating) return
    this.setData({ noQr: !this.data.noQr })
    this.render().catch((err) => {
      console.error('换码之后重画失败', err)
      wx.showToast({ title: t('generateFailed', this.data.lang), icon: 'none' })
    })
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

  // 台账记在"人真把这张存下来"那一刻，不记在画布落图那一步：换模板、开关码都会重画一次，
  // 那样一篇能记出五张（10-03 真机报的，见 utils/cardLog.js 顶上那段）。
  async _keepCard() {
    if (!this._note || !this._canvasNode) return
    await cardLog.record(this._note.id, this._renderedTpl, this._renderedNoQr, this._canvasNode, this)
  },

  saveToAlbum() {
    if (!this.data.imagePath) return
    const { lang } = this.data

    wx.saveImageToPhotosAlbum({
      filePath: this.data.imagePath,
      success: async () => {
        await this._keepCard()
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

  // ---------- 「卡片上的信息」（站长 10-07：这一页原来只有「取消」，没设形象就没法挑图） ----------
  // 实现与首页成品弹窗共用 utils/cardInfo.js 那一份，这一页只给一个钩子：改完收窗就把
  // 上面那张成品重画一遍。画布不清空、不摘层——这一页没有第二个 fixed 浮层要避让。
  _ciAfterChange() {
    if (this.data.generating) return
    this.render().catch((err) => {
      console.error('改完名片重画失败', err)
      wx.showToast({ title: t('generateFailed', this.data.lang), icon: 'none' })
    })
  },

  ...cardInfo.handlers,
})
