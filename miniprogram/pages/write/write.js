const api = require('../../utils/api.js')
const { t } = require('../../utils/i18n.js')

Page({
  data: {
    lang: 'zh',
    t,
    formData: {
      title: '',
      summary: '',
    },
    keyPointsText: '',
    tagsText: '',
    categories: [],
    categoryNames: ['不分类'],
    selectedCategoryIndex: -1,
  },

  onShow() {
    this.setData({ lang: getApp().globalData.userInfo?.language || 'zh' })
    this.loadCategories()
  },

  async loadCategories() {
    try {
      const categories = await api.getCategories()
      this.setData({ 
        categories,
        categoryNames: ['不分类', ...categories.map(c => c.name)],
      })
    } catch (err) {
      console.error('加载分类失败', err)
    }
  },

  onTitleInput(e) {
    this.setData({ 'formData.title': e.detail.value })
  },

  onSummaryInput(e) {
    this.setData({ 'formData.summary': e.detail.value })
  },

  onKeyPointsInput(e) {
    this.setData({ keyPointsText: e.detail.value })
  },

  onTagsInput(e) {
    this.setData({ tagsText: e.detail.value })
  },

  onCategoryChange(e) {
    const idx = parseInt(e.detail.value)
    this.setData({ selectedCategoryIndex: idx === 0 ? -1 : idx - 1 })
  },

  onCancel() {
    wx.navigateBack()
  },

  async onSave() {
    const { title } = this.data.formData
    if (!title.trim()) {
      wx.showToast({ title: '请输入标题', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...', mask: true })

    try {
      const { categories, selectedCategoryIndex } = this.data
      const categoryId = selectedCategoryIndex >= 0 ? categories[selectedCategoryIndex].id : null
      
      const keyPoints = this.data.keyPointsText
        .split('\n')
        .map(s => s.replace(/^[•\-\*]\s*/, '').trim())
        .filter(s => s)

      const tags = this.data.tagsText
        .split(/[，,]/)
        .map(s => s.trim())
        .filter(s => s)

      const note = await api.createNote({
        title: title.trim(),
        summary: this.data.formData.summary.trim() || null,
        key_points: keyPoints.length > 0 ? keyPoints : null,
        tags: tags.length > 0 ? tags : null,
        source_type: 'manual',
        category_id: categoryId,
      })

      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/detail/detail?id=${note.id}` })
      }, 800)
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      const msg = (err.data && err.data.detail) || '保存失败，请重试'
      wx.showToast({ title: msg, icon: 'none' })
    }
  },
})
