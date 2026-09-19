const { t, texts } = require('../../utils/i18n.js')

Page({
  data: {
    version: '1.0.1',
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
      themeClass: app.getThemeClass(app.globalData.userInfo?.wallpaper || 'default'),
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
