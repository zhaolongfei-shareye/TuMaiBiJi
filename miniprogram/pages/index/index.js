const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')

const SOURCE_TYPE_KEYS = {
  wechat_article: 'sourceWechatArticle',
  web_article: 'sourceWebArticle',
  screenshot: 'sourceScreenshot',
  manual: 'sourceManual',
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

Page({
  data: {
    notes: [],
    categories: [],
    loading: true,
    searchKeyword: '',
    selectedCategory: null,
    lang: 'zh',
    themeClass: 'theme-default',
    t: texts('zh'),
  },

  onShow() {
    const app = getApp()
    const themeClass = app.applyTheme(app.globalData.userInfo?.wallpaper || 'default')
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass,
    })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateLabels()
      this.getTabBar().setData({ selected: 0 })
    }
    this.loadCategories()
    this.loadNotes()
  },

  async loadCategories() {
    try {
      const categories = await api.getCategories()
      this.setData({ categories })
    } catch (err) {
      console.error('加载分类失败', err)
    }
  },

  async loadNotes() {
    this.setData({ loading: true })
    try {
      const { searchKeyword, selectedCategory } = this.data
      const notes = await api.getNotes(0, 50, selectedCategory)
      const lang = this.data.lang
      notes.forEach(n => {
        const key = SOURCE_TYPE_KEYS[n.source_type]
        n.source_type_label = key ? t(key, lang) : n.source_type
        n.created_at_label = formatTime(n.created_at)
      })
      // Filter by search keyword on frontend for MVP
      let filtered = notes
      if (searchKeyword) {
        const kw = searchKeyword.toLowerCase()
        filtered = notes.filter(n => 
          n.title.toLowerCase().includes(kw) || 
          (n.summary && n.summary.toLowerCase().includes(kw))
        )
      }
      this.setData({ notes: filtered, loading: false })
    } catch (err) {
      console.error('加载笔记失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
  },

  onSearchConfirm() {
    this.loadNotes()
  },

  clearSearch() {
    this.setData({ searchKeyword: '' })
    this.loadNotes()
  },

  selectCategory(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ selectedCategory: id === null ? null : parseInt(id) })
    this.loadNotes()
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },
})
