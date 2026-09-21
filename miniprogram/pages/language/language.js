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
      themeClass: app.applyTheme(app.globalData.userInfo?.wallpaper || 'default'),
    })
    app.setNavTitle('language', lang)
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
      // Update both currentLang and lang to refresh UI
      this.setData({ 
        currentLang: key,
        lang: key,
        t: texts(key),
      })
      // 切完当场就得变：toast 是这一页自己弹的，标题也是这一页的，
      // 等下一次 onShow 才改的话用户会先看到一行旧语言。
      app.setNavTitle('language', key)
      wx.hideLoading()
      wx.showToast({ title: t('switched', key), icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: t('switchFailed', lang), icon: 'none' })
    }
  },
})
