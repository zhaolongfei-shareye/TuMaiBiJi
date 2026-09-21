const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { toneStyle } = require('../../utils/palette.js')

// 链接规范：必须有协议头，域名里至少带一个点。后端拿到这个串直接抓，所以不在这里放水。
const LINK_RE = /^https?:\/\/\S+\.\S+/i

Page({
  data: {
    lang: 'zh',
    t: texts('zh'),
    themeClass: 'theme-default',
    // 手风琴：'' | 'url' | 'shot' | 'write'，同一时刻最多一个
    active: '',
    busy: '',
    errLine: '',
    errPerm: false,
    urlInput: '',
    urlHint: 'idle',
    previewImages: [],
    shotDesc: '',
    writeTitle: '',
    writeBody: '',
    // 三张卡各自的饱和色，色值和字色配对仍归 palette 管
    skinUrl: toneStyle(1),
    skinShot: toneStyle(2),
    skinWrite: toneStyle(0),
  },

  onShow() {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass: app.applyTheme(app.globalData.userInfo?.wallpaper || 'default'),
      active: '',
      busy: '',
      errLine: '',
      errPerm: false,
      urlInput: '',
      urlHint: 'idle',
      previewImages: [],
      shotDesc: t('albumDesc', lang),
      writeTitle: '',
      writeBody: '',
    })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateLabels()
      this.getTabBar().setData({ selected: 1 })
    }
  },

  hintFor(value) {
    const s = (value || '').trim()
    if (!s) return 'idle'
    return LINK_RE.test(s) ? 'ok' : 'bad'
  },

  // 卡片外任意空白都收起到默认态；忙的时候不收，别把进度藏起来
  collapse() {
    if (this.data.busy || !this.data.active) return
    this.setData({ active: '', errLine: '', errPerm: false })
  },

  toggleCard(e) {
    const kind = e.currentTarget.dataset.kind
    if (this.data.busy || this.data.active === kind) return
    this.setData({
      active: kind,
      errLine: '',
      errPerm: false,
      urlHint: this.hintFor(this.data.urlInput),
    })
  },

  // ---------- URL 导入 ----------
  onUrlInput(e) {
    const value = e.detail.value
    this.setData({ urlInput: value, urlHint: this.hintFor(value), errLine: '' })
  },

  clearUrl() {
    this.setData({ urlInput: '', urlHint: 'idle' })
  },

  pasteUrl() {
    const { lang } = this.data
    wx.getClipboardData({
      success: (res) => {
        const value = (res.data || '').trim()
        if (!value) {
          this.setData({ errLine: t('pasteEmpty', lang) })
          return
        }
        this.setData({ urlInput: value, urlHint: this.hintFor(value), errLine: '' })
      },
      fail: () => this.setData({ errLine: t('pasteEmpty', lang) }),
    })
  },

  async submitUrl() {
    const url = this.data.urlInput.trim()
    const { lang } = this.data
    if (!LINK_RE.test(url)) {
      this.setData({ urlHint: 'bad' })
      return
    }
    this.setData({ busy: 'url', errLine: '' })
    try {
      const { task_id } = await api.ingestUrl(url)
      const result = await api.pollTask(task_id)
      this.setData({ busy: '', urlInput: '', urlHint: 'idle' })
      wx.showToast({ title: t('extractSucceeded', lang), icon: 'success' })
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/detail/detail?id=${result.note_id}` })
      }, 800)
    } catch (err) {
      console.error('URL 导入失败', err)
      this.setData({
        busy: '',
        errLine: err.timeout
          ? t('taskTimeout', lang)
          : ((err.data && err.data.detail) || err.error || t('taskFailed', lang)),
      })
    }
  },

  // ---------- 截图导入 ----------
  pickImage(e) {
    const source = e.currentTarget.dataset.source
    const { lang } = this.data
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: [source],
      success: (res) => {
        const merged = this.data.previewImages
          .concat(res.tempFiles.map(f => f.tempFilePath))
          .slice(0, 9)
        this.setData({
          previewImages: merged,
          shotDesc: t('pickedCount', lang).replace('{n}', merged.length),
          errLine: '',
          errPerm: false,
        })
      },
      // 原来这里只有 success：权限被拒或系统选择器起不来时界面静默无反应，
      // 用户只能对着屏幕再点一次。fail 补上，并把"去设置"挂在提示行上。
      fail: (err) => {
        const msg = String((err && err.errMsg) || '')
        if (msg.indexOf('cancel') > -1) return
        console.error('chooseMedia 失败', msg)
        this.setData({
          errLine: source === 'camera' ? t('permCamera', lang) : t('permAlbum', lang),
          errPerm: true,
        })
      },
    })
  },

  openPermSetting() {
    if (!this.data.errPerm) return
    wx.openSetting({})
  },

  removeShot(e) {
    const index = e.currentTarget.dataset.index
    const left = this.data.previewImages.slice()
    left.splice(index, 1)
    const { lang } = this.data
    this.setData({
      previewImages: left,
      shotDesc: left.length
        ? t('pickedCount', lang).replace('{n}', left.length)
        : t('albumDesc', lang),
    })
  },

  clearShots() {
    this.setData({ previewImages: [], shotDesc: t('albumDesc', this.data.lang) })
  },

  async submitScreenshots() {
    if (this.data.previewImages.length === 0 || this.data.busy) return
    const { lang } = this.data
    this.setData({ busy: 'shot', errLine: '' })
    try {
      const { task_id } = await api.ingestScreenshots(this.data.previewImages)
      const result = await api.pollTask(task_id)
      this.setData({ busy: '', previewImages: [], shotDesc: t('albumDesc', lang) })
      wx.showToast({ title: t('extractSucceeded', lang), icon: 'success' })
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/detail/detail?id=${result.note_id}` })
      }, 800)
    } catch (err) {
      console.error('截图导入失败', err)
      this.setData({
        busy: '',
        errLine: err.timeout
          ? t('taskTimeout', lang)
          : ((err.data && err.data.detail) || err.error || t('taskFailed', lang)),
      })
    }
  },

  // ---------- 手动撰写 ----------
  onWriteTitle(e) {
    this.setData({ writeTitle: e.detail.value, errLine: '' })
  },

  onWriteBody(e) {
    this.setData({ writeBody: e.detail.value })
  },

  cancelWrite() {
    this.setData({ active: '', errLine: '', errPerm: false })
  },

  async saveManual() {
    const title = this.data.writeTitle.trim()
    const { lang } = this.data
    if (!title) {
      this.setData({ errLine: t('needTitle', lang) })
      return
    }
    this.setData({ busy: 'write', errLine: '' })
    try {
      const note = await api.createNote({
        title,
        summary: this.data.writeBody.trim() || null,
        source_type: 'manual',
      })
      this.setData({ busy: '', writeTitle: '', writeBody: '', active: '' })
      wx.showToast({ title: t('saveSucceeded', lang), icon: 'success' })
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/detail/detail?id=${note.id}` })
      }, 800)
    } catch (err) {
      console.error('保存失败', err)
      this.setData({
        busy: '',
        errLine: (err.data && err.data.detail) || t('saveFailed', lang),
      })
    }
  },
})
