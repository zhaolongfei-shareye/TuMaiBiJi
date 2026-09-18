const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')

const LANGUAGES = [
  { key: 'zh', label: '中文', desc: '简体中文' },
  { key: 'en', label: 'English', desc: 'English' },
]

Page({
  data: {
    languages: LANGUAGES,
    currentLang: 'zh',
    themeClass: '',
    lang: 'zh',
    t: texts('zh'),
  },

  onLoad() {
    const app = getApp()
    const lang = (app.globalData.userInfo && app.globalData.userInfo.language) || 'zh'
    this.setData({
      currentLang: lang,
      lang,
      t: texts(lang),
      themeClass: app.getThemeClass(app.globalData.userInfo?.wallpaper || 'default'),
    })
  },

  async onSelect(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.currentLang) return

    const { lang } = this.data
    try {
      wx.showLoading({ title: t('switching', lang), mask: true })
      await api.updateLanguage(key)
      const app = getApp()
      if (app.globalData.userInfo) {
        app.globalData.userInfo.language = key
      }
      this.setData({ currentLang: key })
      wx.hideLoading()
      wx.showToast({ title: t('switched', lang), icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: t('switchFailed', lang), icon: 'none' })
    }
  },
})
