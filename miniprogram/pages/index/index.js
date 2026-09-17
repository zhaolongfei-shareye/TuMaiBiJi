const api = require('../../utils/api.js')

const SOURCE_TYPE_MAP = {
  wechat_article: '公众号文章',
  web_article: '网页文章',
  screenshot: '截图识别'
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

Page({
  data: {
    notes: [],
    loading: true
  },

  onShow() {
    this.loadNotes()
  },

  async loadNotes() {
    this.setData({ loading: true })
    try {
      const notes = await api.getNotes()
      notes.forEach(n => {
        n.source_type_label = SOURCE_TYPE_MAP[n.source_type] || n.source_type
        n.created_at_label = formatTime(n.created_at)
      })
      this.setData({ notes, loading: false })
    } catch (err) {
      console.error('加载笔记失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  goToCreate() {
    wx.switchTab({ url: '/pages/create/create' })
  }
})
