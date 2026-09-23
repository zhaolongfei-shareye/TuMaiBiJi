const poster = require('../../utils/poster.js')
const { t, texts } = require('../../utils/i18n.js')

// 小样格子的显示宽度。画布位图固定 750 宽，格子只有 320，所以 CSS 高度要按同比例缩，
// 否则预览会被拉扁。
const THUMB_W = 320
// 十格同屏，每格都按 750 全尺寸开位图要吃三十多兆显存，低端安卓会直接崩画布。
// 小样只是挑样式，0.46 倍落笔在 320rpx 的格子里看不出差别。
const THUMB_SCALE = 0.46
// 量高度用的临时画布：排版只依赖字体度量，跟画布多大无关，所以给一张小的就够。
// （以前是 750×2600，那已经超出部分机型的单画布上限。）
const MEASURE_H = 750

// 格子的骨架：先有 id 和占位高度，画布节点得先存在，小样才画得上去。
function groupSkeleton(lang) {
  return poster.TEMPLATE_GROUPS.map((g) => ({
    id: g.id,
    label: poster.groupName(g.id, lang),
    items: poster.TEMPLATES.filter((x) => x.group === g.id).map((x) => ({
      id: x.id,
      label: poster.templateLabel(x.id, lang),
      h: Math.round((THUMB_W * 4) / 3),
    })),
  }))
}

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
    groups: groupSkeleton('zh'),
    saving: false,
  },

  onLoad() {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    const saved = poster.readProfile()
    // 小样要等骨架落到视图层之后再画，否则按选择器取不到画布节点
    this.setData(
      {
        lang,
        t: texts(lang),
        themeClass: app.applyTheme(app.globalData.userInfo?.wallpaper || 'default'),
        name: saved.name || '',
        slogan: saved.slogan || '',
        template: saved.template || poster.DEFAULT_TEMPLATE,
        avatar: poster.avatarPath(),
        groups: groupSkeleton(lang),
      },
      () => this.renderThumbs()
    )
    app.setNavTitle('navProfile', lang)
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
    // 英文界面下小样得用英文笔记：断行、字距、行高在两种语言下不是一套数
    const sample = lang === 'en' ? poster.SAMPLE_NOTE_EN : poster.SAMPLE_NOTE
    const groups = this.data.groups.map((g) => ({ id: g.id, label: g.label, items: g.items.slice() }))
    for (let gi = 0; gi < groups.length; gi++) {
      for (let ii = 0; ii < groups[gi].items.length; ii++) {
        const tpl = groups[gi].items[ii]
        try {
          const canvas = await this.getCanvas(`#tpl-${tpl.id}`)
          const ctx = canvas.getContext('2d')
          const images = {}
          if (profile.avatarPath) {
            images.avatar = await poster.loadImage(canvas, profile.avatarPath, 4000)
          }
          canvas.width = poster.W
          canvas.height = MEASURE_H
          const plan = poster.planPoster(ctx, sample, tpl.id, profile, lang)
          // 改宽高会重置画布状态，所以 scale 必须在之后设
          canvas.width = Math.round(plan.width * THUMB_SCALE)
          canvas.height = Math.round(plan.height * THUMB_SCALE)
          ctx.scale(THUMB_SCALE, THUMB_SCALE)
          poster.paintLayers(ctx, plan.layers, images)
          groups[gi].items[ii] = Object.assign({}, tpl, { h: Math.round((plan.height * THUMB_W) / poster.W) })
        } catch (err) {
          console.error('模板小样没画出来', tpl.id, err)
          groups[gi].items[ii] = Object.assign({}, tpl, { h: Math.round(THUMB_W * 1.4) })
        }
      }
    }
    this.setData({ groups })
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
