const app = getApp()

Page({
  data: {
    userInfo: {},
    isLoggedIn: false,
    currentLang: '中文',
  },

  onShow() {
    this.setData({
      userInfo: app.globalData.userInfo || {},
      isLoggedIn: app.globalData.isLoggedIn || false,
    })
  },

  async onLogin() {
    await app.login()
    this.setData({
      userInfo: app.globalData.userInfo || {},
      isLoggedIn: app.globalData.isLoggedIn || false,
    })
  },

  onNavigate(e) {
    const page = e.currentTarget.dataset.page
    wx.showToast({ title: `${page} 待开发`, icon: 'none' })
  },
})
