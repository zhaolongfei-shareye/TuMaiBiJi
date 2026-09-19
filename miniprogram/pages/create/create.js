const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')

Page({
  data: {
    lang: 'zh',
    t: texts('zh'),
    themeClass: 'theme-default',
    showUrlDialog: false,
    urlInput: '',
    previewImages: [],
    submitting: false,
  },

  onShow() {
    const app = getApp()
    const themeClass = app.applyTheme(app.globalData.userInfo?.wallpaper || 'default')
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass,
      previewImages: [],
      urlInput: '',
      showUrlDialog: false,
    })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateLabels()
      this.getTabBar().setData({ selected: 1 })
    }
  },

  // URL 导入
  onUrlImport() {
    this.setData({ showUrlDialog: true, urlInput: '' })
  },

  closeUrlDialog() {
    this.setData({ showUrlDialog: false })
  },

  stopPropagation() {},

  onUrlInput(e) {
    this.setData({ urlInput: e.detail.value })
  },

  async submitUrl() {
    const url = this.data.urlInput.trim()
    const { lang } = this.data
    if (!url) {
      wx.showToast({ title: t('enterLink', lang), icon: 'none' })
      return
    }
    if (!url.startsWith('http')) {
      wx.showToast({ title: t('linkInvalid', lang), icon: 'none' })
      return
    }

    this.setData({ submitting: true, showUrlDialog: false })
    wx.showLoading({ title: t('taskProcessing', lang), mask: true })

    try {
      const { task_id } = await api.ingestUrl(url)
      const result = await api.pollTask(task_id)
      wx.hideLoading()
      wx.showToast({ title: t('extractSucceeded', lang), icon: 'success' })
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/detail/detail?id=${result.note_id}` })
        this.setData({ submitting: false })
      }, 1000)
    } catch (err) {
      wx.hideLoading()
      console.error('URL 导入失败', err)
      const msg = err.timeout
        ? t('taskTimeout', lang)
        : ((err.data && err.data.detail) || err.error || t('taskFailed', lang))
      wx.showToast({ title: msg, icon: 'none', duration: 3000 })
      this.setData({ submitting: false })
    }
  },

  // 截图导入
  onScreenshotImport() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = res.tempFiles.map(f => f.tempFilePath)
        this.setData({ previewImages: paths })
      },
    })
  },

  clearPreview() {
    this.setData({ previewImages: [] })
  },

  async submitScreenshots() {
    if (this.data.previewImages.length === 0) {
      wx.showToast({ title: t('selectScreenshot', this.data.lang), icon: 'none' })
      return
    }

    const { lang } = this.data
    this.setData({ submitting: true })
    wx.showLoading({ title: t('taskProcessing', lang), mask: true })

    try {
      const { task_id } = await api.ingestScreenshots(this.data.previewImages)
      const result = await api.pollTask(task_id)
      wx.hideLoading()
      wx.showToast({ title: t('extractSucceeded', lang), icon: 'success' })
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/detail/detail?id=${result.note_id}` })
        this.setData({ previewImages: [], submitting: false })
      }, 1000)
    } catch (err) {
      wx.hideLoading()
      console.error('截图导入失败', err)
      const msg = err.timeout
        ? t('taskTimeout', lang)
        : ((err.data && err.data.detail) || err.error || t('taskFailed', lang))
      wx.showToast({ title: msg, icon: 'none', duration: 3000 })
      this.setData({ submitting: false })
    }
  },

  // 手动撰写
  onManualWrite() {
    wx.navigateTo({ url: '/pages/write/write' })
  },
})
