const { t, texts } = require('../../utils/i18n.js')

Page({
  data: {
    version: '1.1.0',
    themeClass: '',
    lang: 'zh',
    t: texts('zh'),
  },

  onLoad() {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass: app.applyTheme(app.globalData.userInfo?.wallpaper || 'default'),
    })
  },

  onCopyEmail() {
    wx.setClipboardData({
      data: 'support@tumaibiji.com',
      success: () => {
        wx.showToast({ title: t('copied', this.data.lang), icon: 'success' })
      }
    })
  },
})
