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
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

Page({
  data: {
    note: null,
    loading: true,
    showOriginal: false,
    themeClass: '',
    lang: 'zh',
    t: texts('zh'),
    noteId: null,
    _loaded: false,
  },

  onLoad(options) {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass: app.getThemeClass(app.globalData.userInfo?.wallpaper || 'default'),
    })
    if (options.id) {
      this.setData({ noteId: options.id })
      this.loadNote(options.id)
    }
  },

  onShow() {
    // Skip first show (onLoad already loaded), only reload on navigateBack
    if (this.data.noteId && this.data._loaded) {
      this.loadNote(this.data.noteId)
    }
  },

  async loadNote(id) {
    this.setData({ loading: true })
    try {
      const note = await api.getNote(id)
      const lang = this.data.lang
      const key = SOURCE_TYPE_KEYS[note.source_type]
      note.source_type_label = key ? t(key, lang) : note.source_type
      note.created_at_label = formatTime(note.created_at)
      
      // Resolve category name from categories list
      let categoryName = null
      if (note.category_id) {
        try {
          const categories = await api.getCategories()
          const category = categories.find(c => c.id === note.category_id)
          if (category) {
            categoryName = category.name
          }
        } catch (err) {
          console.error('加载分类列表失败', err)
        }
      }
      note.category_name = categoryName
      
      this.setData({ note, loading: false, _loaded: true })
    } catch (err) {
      console.error('加载笔记失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: t('loadFailed', this.data.lang), icon: 'none' })
    }
  },

  async togglePin() {
    const { note, lang } = this.data
    try {
      await api.pinNote(note.id, !note.is_pinned)
      wx.showToast({ title: note.is_pinned ? t('unpin', lang) : t('pin', lang), icon: 'success' })
      this.loadNote(note.id)
    } catch (err) {
      wx.showToast({ title: t('operationFailed', lang), icon: 'none' })
    }
  },

  onEdit() {
    const { note } = this.data
    wx.navigateTo({ 
      url: `/pages/write/write?id=${note.id}&mode=edit` 
    })
  },

  onDelete() {
    const { lang } = this.data
    wx.showModal({
      title: t('confirmDelete', lang),
      content: t('cannotRestore', lang),
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.deleteNote(this.data.note.id)
            wx.showToast({ title: t('deleteSucceeded', lang), icon: 'success' })
            setTimeout(() => {
              wx.navigateBack()
            }, 1000)
          } catch (err) {
            wx.showToast({ title: t('deleteFailed', lang), icon: 'none' })
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
          wx.showToast({ title: t('linkCopied', this.data.lang), icon: 'success' })
        },
      })
    }
  },

  onShare() {
    const { note } = this.data
    wx.navigateTo({ url: `/pages/share/share?id=${note.id}` })
  },
})
