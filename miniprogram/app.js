const { request } = require('./utils/api')
const { themeOf } = require('./utils/palette')
const { t } = require('./utils/i18n')

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
    // 已经登录过就直接给一个已完成的 Promise。原来这里在登录成功后把
    // loginPromise 置空，于是每次 onShow 等它都会重新走一遍 wx.login + 换票——
    // 新建页当上启动页之后，从相机/相册返回也要等一次，纯属白跑。
    if (this.globalData.isLoggedIn && this.globalData.token) {
      return Promise.resolve()
    }
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

  // 导航条标题原来只写在 pages/*/*.json 里，全是硬编码中文：英文用户在语言页切完，
  // 满屏内容都变了、顶上那行还是中文。JSON 没法动态，所以统一由页面在同步 lang 时调这里。
  setNavTitle(key, lang) {
    const k = lang || this.globalData.userInfo?.language || 'zh'
    wx.setNavigationBarTitle({ title: t(key, k), fail() {} })
  },
})
