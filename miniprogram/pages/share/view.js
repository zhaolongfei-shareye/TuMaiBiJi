const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')

Page({
  data: {
    share: null,
    loading: true,
    error: '',
    lang: 'zh',
    t: texts('zh'),
    authorInitial: '',
    saving: false,
    saved: false,
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
      // 首字在 JS 里取：WXML 的表达式取不了 String.prototype.slice，
      // 而那个圆形色块上必须印昵称的第一个字。
      this.setData({ share, authorInitial: (share.author_name || '').slice(0, 1), loading: false })
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

  // 存进自己的库：抄的是服务端那份公开快照，来源由服务端钉在笔记上，客户端改不掉。
  async saveToMine() {
    const { lang, share, saving, saved } = this.data
    if (!share || saving || saved) return
    this.setData({ saving: true })
    try {
      const app = getApp()
      // 落地页是免登录可读的，但"存进我的笔记"必须有身份。扫码进来时 onLaunch 那条
      // 静默登录通常早就回来了，这里只是兜住它还没回来的那一瞬。
      if (!app.globalData.token) await app.getLoginPromise()
      await api.importFromShare(share.token)
      this.setData({ saving: false, saved: true })
      wx.showToast({ title: t('savedToMine', lang), icon: 'success' })
    } catch (err) {
      console.error('转存失败', err)
      this.setData({ saving: false })
      // 服务端这类失败带的是中文原因（额度满了、这条已经关了），照实说比"没存上"有用
      const reason = (err && (err.detail || (err.data && err.data.detail))) || ''
      wx.showToast({ title: reason || t('saveMineFailed', lang), icon: 'none' })
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
