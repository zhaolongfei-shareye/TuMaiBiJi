const api = require('../../utils/api.js')
const { t } = require('../../utils/i18n.js')

const SOURCE_TYPE_MAP = {
  wechat_article: '公众号文章',
  web_article: '网页文章',
  screenshot: '截图识别',
  manual: '手动撰写',
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
    t,
  },

  onShow() {
    this.setData({ lang: getApp().globalData.userInfo?.language || 'zh' })
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
      notes.forEach(n => {
        n.source_type_label = SOURCE_TYPE_MAP[n.source_type] || n.source_type
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
