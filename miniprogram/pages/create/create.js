const api = require('../../utils/api.js')
const { t } = require('../../utils/i18n.js')

Page({
  data: {
    lang: 'zh',
    t,
    showUrlDialog: false,
    urlInput: '',
    previewImages: [],
    submitting: false,
  },

  onShow() {
    this.setData({ 
      lang: getApp().globalData.userInfo?.language || 'zh',
      previewImages: [],
      urlInput: '',
      showUrlDialog: false,
    })
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
    if (!url) {
      wx.showToast({ title: '请输入链接', icon: 'none' })
      return
    }
    if (!url.startsWith('http')) {
      wx.showToast({ title: '链接格式不正确', icon: 'none' })
      return
    }

    this.setData({ submitting: true, showUrlDialog: false })
    wx.showLoading({ title: '正在提取...', mask: true })

    try {
      const result = await api.ingestUrl(url)
      wx.hideLoading()
      wx.showToast({ title: '提取成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/detail/detail?id=${result.note_id}` })
        this.setData({ submitting: false })
      }, 1000)
    } catch (err) {
      wx.hideLoading()
      console.error('URL 导入失败', err)
      const msg = (err.data && err.data.detail) || '提取失败，请重试'
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
      wx.showToast({ title: '请选择截图', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: 'OCR 识别中...', mask: true })

    try {
      const result = await api.ingestScreenshots(this.data.previewImages)
      wx.hideLoading()
      wx.showToast({ title: '提取成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/detail/detail?id=${result.note_id}` })
        this.setData({ previewImages: [], submitting: false })
      }, 1000)
    } catch (err) {
      wx.hideLoading()
      console.error('截图导入失败', err)
      const msg = (err.data && err.data.detail) || '提取失败，请重试'
      wx.showToast({ title: msg, icon: 'none', duration: 3000 })
      this.setData({ submitting: false })
    }
  },

  // 手动撰写
  onManualWrite() {
    wx.navigateTo({ url: '/pages/write/write' })
  },
})
