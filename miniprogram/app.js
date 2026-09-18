const { request } = require('./utils/api')

const WALLPAPER_THEME = {
  'default': 'theme-default',
  'gradient-blue': 'theme-blue',
  'gradient-green': 'theme-green',
  'gradient-sunset': 'theme-sunset',
  'gradient-purple': 'theme-purple',
  'gradient-ocean': 'theme-ocean',
}

const DARK_THEMES = ['theme-purple', 'theme-ocean']

App({
  globalData: {
    apiBase: 'https://api.agentsbin.cn/wtsj',
    userInfo: null,
    isLoggedIn: false,
    userId: '',
    token: '',
    loginPromise: null,
  },

  onLaunch() {
    this.login()
  },

  getLoginPromise() {
    if (!this.globalData.loginPromise) {
      this.globalData.loginPromise = this._doLogin().finally(() => {
        this.globalData.loginPromise = null
      })
    }
    return this.globalData.loginPromise
  },

  async _doLogin() {
    try {
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject,
        })
      })
      const res = await request('/api/auth/wechat', 'POST', { code: loginRes.code })
      this.globalData.token = res.token
      this.globalData.userId = res.user_id
      this.globalData.userInfo = {
        nickName: res.nickname || '',
        avatarUrl: res.avatar_url || '',
        language: res.language || 'zh',
        wallpaper: res.wallpaper || 'default',
      }
      this.globalData.isLoggedIn = true
      this.applyTheme(this.globalData.userInfo.wallpaper)
    } catch (err) {
      console.error('登录失败:', err)
      throw err
    }
  },

  async login() {
    return this.getLoginPromise()
  },

  getThemeClass(wallpaper) {
    return WALLPAPER_THEME[wallpaper] || 'theme-default'
  },

  isDarkTheme(wallpaper) {
    return DARK_THEMES.includes(this.getThemeClass(wallpaper))
  },

  applyTheme(wallpaper) {
    const themeClass = this.getThemeClass(wallpaper)
    const dark = DARK_THEMES.includes(themeClass)
    wx.setNavigationBarColor({
      frontColor: dark ? '#ffffff' : '#000000',
      backgroundColor: dark ? '#0c0c1d' : '#f5f5f5',
    })
    const tabBar = this.getTabBar?.()
    if (tabBar) {
      tabBar.applyTheme?.(wallpaper)
    }
    return themeClass
  },
})
