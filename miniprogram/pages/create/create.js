const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')

const recorderManager = wx.getRecorderManager()

Page({
  data: {
    lang: 'zh',
    t: texts('zh'),
    themeClass: 'theme-default',
    showUrlDialog: false,
    urlInput: '',
    previewImages: [],
    submitting: false,
    showRecorder: false,
    isRecording: false,
    recorderTime: 0,
    recorderTimeText: '00:00',
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
      showRecorder: false,
      isRecording: false,
      recorderTime: 0,
      recorderTimeText: '00:00',
    })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateLabels()
      this.getTabBar().setData({ selected: 1 })
    }
  },

  onLoad() {
    recorderManager.onStart(() => {
      this.setData({ isRecording: true, recorderTime: 0, recorderTimeText: '00:00' })
      this._recorderTimer = setInterval(() => {
        const sec = this.data.recorderTime + 1
        const mm = String(Math.floor(sec / 60)).padStart(2, '0')
        const ss = String(sec % 60).padStart(2, '0')
        this.setData({ recorderTime: sec, recorderTimeText: `${mm}:${ss}` })
      }, 1000)
    })

    recorderManager.onStop((res) => {
      clearInterval(this._recorderTimer)
      this._recorderTimer = null
      if (this._voiceCancelled) {
        this._voiceCancelled = false
        this.setData({ showRecorder: false, isRecording: false, recorderTime: 0, recorderTimeText: '00:00' })
        return
      }
      if (this.data.recorderTime < 1) {
        this.setData({ showRecorder: false, isRecording: false })
        wx.showToast({ title: t('voiceTooShort', this.data.lang), icon: 'none' })
        return
      }
      this._uploadVoice(res.tempFilePath)
    })

    recorderManager.onError((err) => {
      clearInterval(this._recorderTimer)
      this._recorderTimer = null
      this.setData({ showRecorder: false, isRecording: false })
      wx.showToast({ title: err.errMsg || t('taskFailed', this.data.lang), icon: 'none' })
    })
  },

  onUnload() {
    clearInterval(this._recorderTimer)
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
        : (err.error || t('taskFailed', lang))
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
        : (err.error || t('taskFailed', lang))
      wx.showToast({ title: msg, icon: 'none', duration: 3000 })
      this.setData({ submitting: false })
    }
  },

  // 语音转写
  onVoiceImport() {
    if (this.data.showRecorder && this.data.isRecording) {
      this.stopRecording()
      return
    }
    this.setData({ showRecorder: true, isRecording: false, recorderTime: 0, recorderTimeText: '00:00' })
    setTimeout(() => {
      recorderManager.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'aac',
      })
    }, 300)
  },

  stopRecording() {
    recorderManager.stop()
  },

  cancelRecording() {
    this._voiceCancelled = true
    clearInterval(this._recorderTimer)
    this._recorderTimer = null
    recorderManager.stop()
    this.setData({ showRecorder: false, isRecording: false, recorderTime: 0, recorderTimeText: '00:00' })
  },

  async _uploadVoice(filePath) {
    const { lang } = this.data
    this.setData({ submitting: true, isRecording: false })
    wx.showLoading({ title: t('taskProcessing', lang), mask: true })

    try {
      const { task_id } = await api.ingestVoice(filePath)
      const result = await api.pollTask(task_id)
      wx.hideLoading()
      wx.showToast({ title: t('extractSucceeded', lang), icon: 'success' })
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/detail/detail?id=${result.note_id}` })
        this.setData({ showRecorder: false, submitting: false })
      }, 1000)
    } catch (err) {
      wx.hideLoading()
      console.error('语音转写失败', err)
      const msg = err.timeout
        ? t('taskTimeout', lang)
        : (err.error || t('taskFailed', lang))
      wx.showToast({ title: msg, icon: 'none', duration: 3000 })
      this.setData({ showRecorder: false, submitting: false })
    }
  },

  // 手动撰写
  onManualWrite() {
    wx.navigateTo({ url: '/pages/write/write' })
  },
})
