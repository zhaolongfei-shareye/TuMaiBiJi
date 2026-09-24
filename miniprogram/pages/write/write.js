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
    tagList: [],
    categories: [],
    categoryNames: [],
    selectedCategoryIndex: -1,
    originalCategoryId: null, // Store original category ID to avoid clearing on failed load
  },

  async onLoad(options) {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      categoryNames: [t('noCategory', lang)],
      themeClass: app.applyTheme(app.globalData.userInfo?.wallpaper || 'default'),
    })
    app.setNavTitle('writeNote', lang)
    await this.loadCategories()

    if (options.id && options.mode === 'edit') {
      this.setData({ noteId: parseInt(options.id), isEdit: true })
      app.setNavTitle('editNote', this.data.lang)
      await this.loadNoteForEdit()
    }
  },

  async loadCategories() {
    try {
      const categories = await api.getCategories()
      this.setData({
        categories,
        // 第一项是"未分类"这个概念，跟着界面语言走；后面那些是用户自己起的名字，不翻
        categoryNames: [t('noCategory', this.data.lang)].concat(categories.map((c) => c.name)),
      })
    } catch (err) {
      console.error('加载分类失败', err)
    }
  },

  async loadNoteForEdit() {
    try {
      const note = await api.getNote(this.data.noteId)
      const categoryIndex = note.category_id 
        ? this.data.categories.findIndex(c => c.id === note.category_id)
        : -1
      
      this.setData({
        'formData.title': note.title || '',
        'formData.summary': note.summary || '',
        keyPointsText: (note.key_points || []).join('\n'),
        tagsText: (note.tags || []).join(', '),
        tagList: (note.tags || []).map((s) => (s || '').trim()).filter(Boolean),
        selectedCategoryIndex: categoryIndex,
        originalCategoryId: note.category_id, // Preserve original even if categories fail to load
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
    const tagsText = e.detail.value
    this.setData({ tagsText, tagList: this.splitTags(tagsText) })
  },

  // 标签顺序就是"色块上显示哪个字"的顺序：第一位上列表方块。
  // 所以这里不让人拖拽，只给一个动作——点任意一个标签，它就到第一位去了。
  splitTags(text) {
    return (text || '').split(/[，,]/).map((s) => s.trim()).filter(Boolean)
  },

  promoteTag(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!index) return
    const tagList = this.data.tagList.slice()
    tagList.unshift(tagList.splice(index, 1)[0])
    this.setData({ tagList, tagsText: tagList.join(', ') })
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
    const { lang, isEdit, noteId, categories, selectedCategoryIndex, originalCategoryId } = this.data
    if (!title.trim()) {
      wx.showToast({ title: t('enterTitle', lang), icon: 'none' })
      return
    }

    wx.showLoading({ title: t('saving', lang), mask: true })

    try {
      // Use original category ID if categories failed to load and user didn't change it
      let categoryId
      if (categories.length === 0 && originalCategoryId) {
        // Categories failed to load, preserve original
        categoryId = originalCategoryId
      } else if (selectedCategoryIndex >= 0) {
        categoryId = categories[selectedCategoryIndex].id
      } else {
        categoryId = null
      }
      
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
        if (isEdit) {
          // Navigate back to detail page instead of creating duplicate
          wx.navigateBack()
        } else {
          wx.redirectTo({ url: `/pages/detail/detail?id=${note.id}` })
        }
      }, 800)
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      const msg = (err.data && err.data.detail) || t('saveFailed', lang)
      wx.showToast({ title: msg, icon: 'none' })
    }
  },
})
