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
    note: null,
    loading: true
  },

  onLoad(options) {
    if (options.id) {
      this.loadNote(options.id)
    }
  },

  async loadNote(id) {
    this.setData({ loading: true })
    try {
      const note = await api.getNote(id)
      note.source_type_label = SOURCE_TYPE_MAP[note.source_type] || note.source_type
      note.created_at_label = formatTime(note.created_at)
      this.setData({ note, loading: false })
    } catch (err) {
      console.error('加载笔记失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  async deleteNote() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复',
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.deleteNote(this.data.note.id)
            wx.showToast({ title: '已删除', icon: 'success' })
            setTimeout(() => {
              wx.navigateBack()
            }, 1500)
          } catch (err) {
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  }
})
