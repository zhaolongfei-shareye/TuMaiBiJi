const { request } = require('./utils/api')
const { themeOf } = require('./utils/palette')

App({
  globalData: {
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
    return themeOf(wallpaper).cls
  },

  isDarkTheme(wallpaper) {
    return themeOf(wallpaper).dark
  },

  applyTheme(wallpaper) {
    const theme = themeOf(wallpaper)
    // 导航条必须和页面底色同值，否则卡片滚到顶部会看出一条色差。
    // 之前这里写死 '#f5f5f5'，和六套主题的底色一个都对不上。
    // 页面刚 onLoad 时这个接口可能直接 fail，忽略即可，底色由容器自己画。
    wx.setNavigationBarColor({
      frontColor: theme.dark ? '#ffffff' : '#000000',
      backgroundColor: theme.page,
      fail() {},
    })
    const tabBar = this.getTabBar?.()
    if (tabBar) {
      tabBar.applyTheme?.(wallpaper)
    }
    return theme.cls
  },
})
