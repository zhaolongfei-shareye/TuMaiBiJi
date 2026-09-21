const app = getApp()
const { t, texts } = require('../../utils/i18n.js')

const LANG_MAP = { zh: '中文', en: 'English' }

const CONTACT_EMAIL = 'jacky28471258@gmail.com'
const OFFICIAL_ACCOUNT = '杰克AI日记'

Page({
  data: {
    displayName: '图麦用户',
    currentLang: '中文',
    lang: 'zh',
    themeClass: 'theme-default',
    t: texts('zh'),
    contactEmail: CONTACT_EMAIL,
    officialAccount: OFFICIAL_ACCOUNT,
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
    app.setNavTitle('tabMe', lang)
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

  onCopy(e) {
    const value = e.currentTarget.dataset.value
    if (!value) return
    wx.setClipboardData({
      data: value,
      success: () => wx.showToast({ title: t('copied', this.data.lang), icon: 'success' }),
    })
  },

  // 分享卡片落在新建页（新用户第一眼就是那三个色块），并带上邀请人 id。
  // 邀请人 id 只是参数，微信不会告诉我们"对方到底收没收到"，
  // 所以额度那一刀要等后端按"对方真的打开过"来记，这里不预先承诺已到账。
  onShareAppMessage() {
    const inviter = app.globalData.userId || ''
    return {
      title: t('shareCardTitle', this.data.lang),
      path: `/pages/create/create${inviter ? `?inviter=${inviter}` : ''}`,
    }
  },
})
