const app = getApp()
const { t, texts } = require('../../utils/i18n.js')

const LANG_MAP = { zh: '中文', en: 'English' }

Page({
  data: {
    userInfo: {},
    isLoggedIn: false,
    currentLang: '中文',
    lang: 'zh',
    themeClass: 'theme-default',
    t: texts('zh'),
  },

  onShow() {
    const userInfo = app.globalData.userInfo || {}
    const lang = userInfo.language || 'zh'
    const langLabel = LANG_MAP[lang] || '中文'
    const themeClass = app.applyTheme(userInfo.wallpaper || 'default')
    this.setData({
      userInfo,
      isLoggedIn: app.globalData.isLoggedIn || false,
      currentLang: langLabel,
      lang,
      t: texts(lang),
      themeClass,
    })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateLabels()
      this.getTabBar().setData({ selected: 2 })
    }
  },

  async onLogin() {
    await app.login()
    const userInfo = app.globalData.userInfo || {}
    const lang = userInfo.language || 'zh'
    this.setData({
      userInfo,
      isLoggedIn: app.globalData.isLoggedIn || false,
      currentLang: LANG_MAP[lang] || '中文',
      lang,
      t: texts(lang),
    })
  },

  onNavigate(e) {
    const page = e.currentTarget.dataset.page
    const routes = {
      categories: '/pages/categories/categories',
      wallpaper: '/pages/wallpaper/wallpaper',
      language: '/pages/language/language',
      about: '/pages/about/about',
    }
    const url = routes[page]
    if (url) {
      wx.navigateTo({ url })
    }
  },
})
