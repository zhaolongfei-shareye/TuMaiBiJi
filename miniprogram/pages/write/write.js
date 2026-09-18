const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')

Page({
  data: {
    lang: 'zh',
    t: texts('zh'),
    themeClass: '',
    noteId: null,
    isEdit: false,
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

  async onLoad(options) {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass: app.getThemeClass(app.globalData.userInfo?.wallpaper || 'default'),
    })
    await this.loadCategories()

    if (options.id && options.mode === 'edit') {
      this.setData({ noteId: parseInt(options.id), isEdit: true })
      wx.setNavigationBarTitle({ title: t('editNote', this.data.lang) })
      await this.loadNoteForEdit()
    }
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

  async loadNoteForEdit() {
    try {
      const note = await api.getNote(this.data.noteId)
      this.setData({
        'formData.title': note.title || '',
        'formData.summary': note.summary || '',
        keyPointsText: (note.key_points || []).join('\n'),
        tagsText: (note.tags || []).join(', '),
        selectedCategoryIndex: note.category_id 
          ? this.data.categories.findIndex(c => c.id === note.category_id)
          : -1,
      })
    } catch (err) {
      console.error('加载笔记失败', err)
      wx.showToast({ title: t('loadFailed', this.data.lang), icon: 'none' })
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
    const { lang, isEdit, noteId, categories, selectedCategoryIndex } = this.data
    if (!title.trim()) {
      wx.showToast({ title: t('enterTitle', lang), icon: 'none' })
      return
    }

    wx.showLoading({ title: t('saving', lang), mask: true })

    try {
      const categoryId = selectedCategoryIndex >= 0 ? categories[selectedCategoryIndex].id : null
      
      const keyPoints = this.data.keyPointsText
        .split('\n')
        .map(s => s.replace(/^[•\-\*]\s*/, '').trim())
        .filter(s => s)

      const tags = this.data.tagsText
        .split(/[，,]/)
        .map(s => s.trim())
        .filter(s => s)

      const payload = {
        title: title.trim(),
        summary: this.data.formData.summary.trim() || null,
        key_points: keyPoints.length > 0 ? keyPoints : null,
        tags: tags.length > 0 ? tags : null,
        category_id: categoryId,
      }

      let note
      if (isEdit) {
        payload.source_type = undefined
        note = await api.updateNote(noteId, payload)
      } else {
        payload.source_type = 'manual'
        note = await api.createNote(payload)
      }

      wx.hideLoading()
      wx.showToast({ title: isEdit ? t('updateSucceeded', lang) : t('saveSucceeded', lang), icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/detail/detail?id=${note.id}` })
      }, 800)
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      const msg = (err.data && err.data.detail) || t('saveFailed', lang)
      wx.showToast({ title: msg, icon: 'none' })
    }
  },
})
