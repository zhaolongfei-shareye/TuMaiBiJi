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

    const token = options.scene
      ? decodeURIComponent(options.scene)
      : options.token

    if (!token) {
      this.setData({ loading: false, error: t('invalidShare', lang) })
      return
    }

    try {
      const share = await api.getShare(token)
      this.setData({ share, loading: false })
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

  onShareAppMessage() {
    const { share } = this.data
    if (!share) return {}
    return {
      title: share.title || '图麦笔记',
      path: `/pages/share/view?token=${share.token}`,
    }
  },
})
