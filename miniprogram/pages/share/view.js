const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')

Page({
  data: {
    share: null,
    loading: true,
    error: '',
    lang: 'zh',
    t: texts('zh'),
  },

  async onLoad(options) {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({ lang, t: texts(lang) })
    app.setNavTitle('navShareView', lang)

    // 小程序码带进来的 scene 是一段没保证的外部输入：一个残缺的百分号就能让
    // decodeURIComponent 抛 URIError。原来这一句写在 try 外面，抛了之后 loading
    // 再没人改，页面就永久停在"加载中…"——比一句"链接不对"糟得多。
    let token = options.token || ''
    if (!token && options.scene) {
      try {
        token = decodeURIComponent(options.scene)
      } catch (err) {
        console.error('scene 参数解不开', options.scene, err)
        token = ''
      }
    }

    if (!token) {
      this.setData({ loading: false, error: t('invalidShare', lang) })
      return
    }

    try {
      const share = await api.getShare(token)
      this.setData({ share, loading: false })
      if (share.title) {
        wx.setNavigationBarTitle({ title: share.title })
      }
    } catch (err) {
      console.error('获取分享失败', err)
      this.setData({
        loading: false,
        error: err.statusCode === 404
          ? t('shareExpired', lang)
          : t('loadFailed', lang),
      })
    }
  },

  copySource() {
    const url = this.data.share && this.data.share.source_url
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: t('linkCopied', this.data.lang), icon: 'success' }),
    })
  },

  onShareAppMessage() {
    const { share } = this.data
    if (!share) return {}
    return {
      title: share.title || '图麦笔记',
      path: `/pages/share/view?token=${share.token}`,
    }
  },
})
