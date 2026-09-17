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
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

Page({
  data: {
    note: null,
    loading: true,
    showOriginal: false,
    lang: 'zh',
    t,
  },

  onLoad(options) {
    this.setData({ lang: getApp().globalData.userInfo?.language || 'zh' })
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

  async togglePin() {
    const { note } = this.data
    try {
      await api.pinNote(note.id, !note.is_pinned)
      wx.showToast({ title: note.is_pinned ? '已取消置顶' : '已置顶', icon: 'success' })
      this.loadNote(note.id)
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  onEdit() {
    const { note } = this.data
    wx.navigateTo({ 
      url: `/pages/write/write?id=${note.id}&mode=edit` 
    })
  },

  onDelete() {
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
            }, 1000)
          } catch (err) {
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      },
    })
  },

  toggleOriginal() {
    this.setData({ showOriginal: !this.data.showOriginal })
  },

  openSourceUrl() {
    const { source_url } = this.data.note
    if (source_url) {
      wx.setClipboardData({
        data: source_url,
        success: () => {
          wx.showToast({ title: '链接已复制', icon: 'success' })
        },
      })
    }
  },

  onShare() {
    wx.showToast({ title: '分享功能开发中', icon: 'none' })
  },
})
