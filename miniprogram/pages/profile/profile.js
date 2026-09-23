const poster = require('../../utils/poster.js')
const { t, texts } = require('../../utils/i18n.js')

// 小样格子的显示宽度。画布位图固定 750 宽，格子只有 320，所以 CSS 高度要按同比例缩，
// 否则预览会被拉扁。
const THUMB_W = 320

Page({
  data: {
    lang: 'zh',
    t: texts('zh'),
    themeClass: '',
    avatar: '',
    avatarStaged: false,
    name: '',
    slogan: '',
    template: 'card',
    templates: poster.TEMPLATES,
    thumbs: [],
    saving: false,
  },

  onLoad() {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    const saved = poster.readProfile()
    this.setData({
      lang,
      t: texts(lang),
      themeClass: app.applyTheme(app.globalData.userInfo?.wallpaper || 'default'),
      name: saved.name || '',
      slogan: saved.slogan || '',
      template: saved.template || poster.DEFAULT_TEMPLATE,
      avatar: poster.avatarPath(),
    })
    app.setNavTitle('navProfile', lang)
    this.renderThumbs()
  },

  // 这里故意没有 onShow：从相册回来时真机会补发一次 onShow，那时候读一遍 storage
  // 会把用户刚填还没保存的名称、slogan 冲掉（新建页选完图没反应就是这个成因）。

  draftProfile() {
    return {
      name: this.data.name,
      slogan: this.data.slogan,
      template: this.data.template,
      avatarPath: this.data.avatar,
    }
  },

  async renderThumbs() {
    const { lang } = this.data
    const profile = this.draftProfile()
    const thumbs = []
    for (const tpl of poster.TEMPLATES) {
      try {
        const canvas = await this.getCanvas(`#tpl-${tpl.id}`)
        const ctx = canvas.getContext('2d')
        const images = {}
        if (profile.avatarPath) {
          images.avatar = await poster.loadImage(canvas, profile.avatarPath, 4000)
        }
        canvas.width = poster.W
        canvas.height = 2600
        const plan = poster.planPoster(ctx, poster.SAMPLE_NOTE, tpl.id, profile, lang)
        canvas.width = plan.width
        canvas.height = plan.height
        poster.paintLayers(ctx, plan.layers, images)
        thumbs.push({ id: tpl.id, h: Math.round((plan.height * THUMB_W) / poster.W) })
      } catch (err) {
        console.error('模板小样没画出来', tpl.id, err)
        thumbs.push({ id: tpl.id, h: Math.round(THUMB_W * 1.4) })
      }
    }
    this.setData({ thumbs })
  },

  getCanvas(selector) {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this)
        .select(selector)
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvas = res && res[0] && res[0].node
          if (canvas) resolve(canvas)
          else reject(new Error(`画布未就绪：${selector}`))
        })
    })
  },

  onPickAvatar() {
    const { lang } = this.data
    wx.chooseMedia({
      count: 1,
      mediaType: ['images'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const temp = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (!temp) return
        try {
          // 先落"暂存"文件名：没点保存之前不能动正式那张，否则海报会跟着换
          const staged = await poster.stageAvatar(temp)
          this.setData({ avatar: staged, avatarStaged: true })
          this.renderThumbs()
        } catch (err) {
          console.error('头像存不下来', err)
          wx.showToast({ title: t('avatarSaveFailed', lang), icon: 'none' })
        }
      },
      fail: (err) => {
        console.error('选图失败', err)
        const msg = (err && err.errMsg) || ''
        if (msg.indexOf('cancel') >= 0) return
        wx.showToast({ title: t('pickFailed', lang), icon: 'none' })
      },
    })
  },

  onDropAvatar() {
    this.setData({ avatar: '', avatarStaged: true })
    this.renderThumbs()
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onSloganInput(e) {
    this.setData({ slogan: e.detail.value })
  },

  onPickTemplate(e) {
    this.setData({ template: e.currentTarget.dataset.id })
  },

  async onSave() {
    if (this.data.saving) return
    const { lang } = this.data
    this.setData({ saving: true })
    try {
      const patch = {
        name: (this.data.name || '').trim().slice(0, 16),
        slogan: (this.data.slogan || '').trim().slice(0, 24),
        template: this.data.template,
      }
      if (this.data.avatar) {
        // 只有本次新选的那张才需要搬到正式文件名
        patch.avatarPath = this.data.avatarStaged
          ? await poster.commitAvatar(this.data.avatar)
          : this.data.avatar
      } else {
        patch.avatarPath = ''
        poster.dropAvatar()
      }
      poster.writeProfile(patch)
      wx.showToast({ title: t('profileSaved', lang), icon: 'success' })
      setTimeout(() => wx.navigateBack(), 900)
    } catch (err) {
      console.error('保存分享形象失败', err)
      wx.showToast({ title: t('setFailed', lang), icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
})
