const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { toneVars } = require('../../utils/palette.js')

Page({
  data: {
    categories: [],
    loading: true,
    showAddDialog: false,
    newCategoryName: '',
    editingId: null,
    editingName: '',
    themeClass: '',
    lang: 'zh',
    t: texts('zh'),
  },

  onShow() {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass: app.applyTheme(app.globalData.userInfo?.wallpaper || 'default'),
    })
    this.loadCategories()
  },

  async loadCategories() {
    this.setData({ loading: true })
    try {
      const categories = await api.getCategories()
      // 色点用派生色，和首页那张色卡取同一个函数，两边不可能再对不上
      categories.forEach((c) => { c.toneStyle = toneVars(c.id) })
      this.setData({ categories, loading: false })
    } catch (err) {
      console.error('加载分类失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: t('loadFailed', this.data.lang), icon: 'none' })
    }
  },

  onAddTap() {
    this.setData({ showAddDialog: true, newCategoryName: '' })
  },

  onCloseDialog() {
    this.setData({ showAddDialog: false, newCategoryName: '' })
  },

  onNameInput(e) {
    this.setData({ newCategoryName: e.detail.value })
  },

  async onAddConfirm() {
    const { lang } = this.data
    const name = this.data.newCategoryName.trim()
    if (!name) {
      wx.showToast({ title: t('addCategoryPrompt', lang), icon: 'none' })
      return
    }
    try {
      wx.showLoading({ title: t('adding', lang), mask: true })
      await api.createCategory({ name })
      wx.hideLoading()
      this.setData({ showAddDialog: false, newCategoryName: '' })
      wx.showToast({ title: t('added', lang), icon: 'success' })
      this.loadCategories()
    } catch (err) {
      wx.hideLoading()
      const msg = (err.data && err.data.detail) || t('addFailed', lang)
      wx.showToast({ title: msg, icon: 'none' })
    }
  },

  onEditTap(e) {
    const { id, name } = e.currentTarget.dataset
    this.setData({ editingId: id, editingName: name })
  },

  onEditInput(e) {
    this.setData({ editingName: e.detail.value })
  },

  async onEditConfirm() {
    const { lang } = this.data
    const name = this.data.editingName.trim()
    if (!name) {
      wx.showToast({ title: t('nameRequired', lang), icon: 'none' })
      return
    }
    try {
      wx.showLoading({ title: t('saving', lang), mask: true })
      await api.updateCategory(this.data.editingId, { name })
      wx.hideLoading()
      this.setData({ editingId: null, editingName: '' })
      wx.showToast({ title: t('saveSucceeded', lang), icon: 'success' })
      this.loadCategories()
    } catch (err) {
      wx.hideLoading()
      const msg = (err.data && err.data.detail) || t('updateFailed', lang)
      wx.showToast({ title: msg, icon: 'none' })
    }
  },

  onEditCancel() {
    this.setData({ editingId: null, editingName: '' })
  },

  onDeleteTap(e) {
    const { id, name } = e.currentTarget.dataset
    const { lang } = this.data
    wx.showModal({
      title: t('delete', lang),
      content: t('deleteCategoryConfirm', lang),
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: t('deleting', lang), mask: true })
            await api.deleteCategory(id)
            wx.hideLoading()
            wx.showToast({ title: t('deleteSucceeded', lang), icon: 'success' })
            this.loadCategories()
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: t('deleteFailed', lang), icon: 'none' })
          }
        }
      }
    })
  },

  async onMoveUp(e) {
    const { index } = e.currentTarget.dataset
    if (index === 0) return
    const { categories } = this.data
    const ids = categories.map(c => c.id)
    const temp = ids[index]
    ids[index] = ids[index - 1]
    ids[index - 1] = temp
    try {
      await api.reorderCategories(ids)
      this.loadCategories()
    } catch (err) {
      wx.showToast({ title: t('sortFailed', this.data.lang), icon: 'none' })
    }
  },

  async onMoveDown(e) {
    const { index } = e.currentTarget.dataset
    const { categories } = this.data
    if (index === categories.length - 1) return
    const ids = categories.map(c => c.id)
    const temp = ids[index]
    ids[index] = ids[index + 1]
    ids[index + 1] = temp
    try {
      await api.reorderCategories(ids)
      this.loadCategories()
    } catch (err) {
      wx.showToast({ title: t('sortFailed', this.data.lang), icon: 'none' })
    }
  },
})
