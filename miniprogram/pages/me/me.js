const app = getApp()
const { t, texts } = require('../../utils/i18n.js')

const LANG_MAP = { zh: '中文', en: 'English' }

Page({
  data: {
    displayName: '图麦用户',
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
      // 昵称取不到是常态（微信已不返回资料），给一个稳定称谓，
      // 不要显示"未登录"——登录是静默完成的，这里也没有可点的登录入口
      displayName: userInfo.nickName || '图麦用户',
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
