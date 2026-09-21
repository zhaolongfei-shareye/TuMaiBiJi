const { t, texts } = require('../../utils/i18n.js')

Page({
  data: {
    version: '1.1.6',
    themeClass: '',
    lang: 'zh',
    t: texts('zh'),
    contactEmail: 'jacky28471258@gmail.com',
    officialAccount: '杰克AI日记',
  },

  onLoad() {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass: app.applyTheme(app.globalData.userInfo?.wallpaper || 'default'),
    })
    app.setNavTitle('aboutApp', lang)
  },

  onCopy(e) {
    const value = e.currentTarget.dataset.value
    if (!value) return
    wx.setClipboardData({
      data: value,
      success: () => {
        wx.showToast({ title: t('copied', this.data.lang), icon: 'success' })
      }
    })
  },
})
