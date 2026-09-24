const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { blockSkinFor, toneVars } = require('../../utils/palette.js')
const { formatDateTime, formatShortDate } = require('../../utils/date.js')

const SOURCE_TYPE_KEYS = {
  wechat_article: 'sourceWechatArticle',
  web_article: 'sourceWebArticle',
  screenshot: 'sourceScreenshot',
  manual: 'sourceManual',
  share_import: 'sourceShareImport',
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
    shared: false,
    _loaded: false,
  },

  onLoad(options) {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass: app.applyTheme(app.globalData.userInfo?.wallpaper || 'default'),
    })
    app.setNavTitle('navDetail', lang)
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
      note.created_at_label = formatDateTime(note.created_at)
      
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

      // 详情页头部沿用列表那一行的方块：颜色与构图必须和列表里那条一模一样，
      // 所以复用 blockSkinFor，不在这另写一套取色规则。
      const skin = blockSkinFor(note.category_id, note.id)
      note.blockStyle = skin.style
      // 中性面板里的序号圆点要借分类色，但不能贴方块那串——那会把整块面板染成色块
      note.toneStyle = toneVars(note.category_id)
      note.motif = skin.motif
      // 方块上的字跟列表那条保持同一规则：第一个标签优先，没标签才回退分类名
      const firstTag = (note.tags || []).map((x) => (x || '').trim()).find(Boolean) || ''
      note.blockName = firstTag || note.category_name || (note.category_id == null ? this.data.t.noCategory : '')
      note.date_label = formatShortDate(note.created_at)
      // 转存进来的那一条才有：来源是服务端钉住的，编辑接口碰不到这一栏，所以这里只读。
      note.imported_label = note.imported_from ? formatShortDate(note.imported_from.imported_at) : ''
      
      this.setData({ note, loading: false, _loaded: true })
      this.loadShareStatus(note.id)
      // 搜一搜索引页面标题：用笔记真实标题替代静态"笔记详情"
      if (note.title) {
        wx.setNavigationBarTitle({ title: note.title })
      }
    } catch (err) {
      console.error('加载笔记失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: t('loadFailed', this.data.lang), icon: 'none' })
    }
  },

  // 这篇对外不对外，只有服务端知道（海报可能是在另一台手机上生成的）。
  async loadShareStatus(noteId) {
    try {
      const s = await api.getShareStatus(noteId)
      this.setData({ shared: !!(s && s.active) })
    } catch (err) {
      // 读不到就不显示这一行。绝不能猜一个"没在公开"给人看——那等于把该收的东西留着。
      console.error('分享状态读取失败', err)
    }
  },

  onUnshare() {
    const { noteId, lang } = this.data
    wx.showModal({
      title: t('unshare', lang),
      content: t('unshareBody', lang),
      confirmText: t('unshareConfirm', lang),
      cancelText: t('cancel', lang),
      success: async (res) => {
        if (!res.confirm) return
        try {
          await api.revokeShare(noteId)
          this.setData({ shared: false })
          wx.showToast({ title: t('unshared', lang), icon: 'success' })
        } catch (err) {
          console.error('撤掉分享失败', err)
          wx.showToast({ title: t('unshareFailed', lang), icon: 'none' })
        }
      },
    })
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
