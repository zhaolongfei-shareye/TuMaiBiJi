const api = require('../../utils/api.js')

Page({
  data: {
    inputMode: 'url',
    url: '',
    images: [],
    submitting: false
  },

  switchMode(e) {
    this.setData({ inputMode: e.currentTarget.dataset.mode })
  },

  onUrlInput(e) {
    this.setData({ url: e.detail.value })
  },

  chooseImages() {
    wx.chooseMedia({
      count: 9 - this.data.images.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFiles.map(f => f.tempFilePath)
        this.setData({
          images: [...this.data.images, ...newImages]
        })
      }
    })
  },

  removeImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(index, 1)
    this.setData({ images })
  },

  async submit() {
    if (this.data.submitting) return

    const { inputMode, url, images } = this.data

    if (inputMode === 'url' && !url.trim()) {
      wx.showToast({ title: '请输入链接', icon: 'none' })
      return
    }

    if (inputMode === 'screenshot' && images.length === 0) {
      wx.showToast({ title: '请选择截图', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '正在提取内容...', mask: true })

    try {
      let result
      if (inputMode === 'url') {
        result = await api.ingestUrl(url)
      } else {
        result = await api.ingestScreenshots(images)
      }

      wx.hideLoading()

      if (result && result.note_id) {
        wx.showToast({ title: '提取成功', icon: 'success' })
        setTimeout(() => {
          wx.navigateTo({
            url: `/pages/detail/detail?id=${result.note_id}`
          })
          this.setData({ url: '', images: [], submitting: false })
        }, 1000)
      } else {
        wx.showToast({ title: '提交成功', icon: 'success' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' })
        }, 1500)
      }
    } catch (err) {
      wx.hideLoading()
      console.error('提交失败', err)
      const msg = (err.data && err.data.detail) || '提取失败，请重试'
      wx.showToast({ title: msg, icon: 'none', duration: 3000 })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
