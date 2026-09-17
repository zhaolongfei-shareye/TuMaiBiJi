const { request } = require('./utils/api')

App({
  globalData: {
    apiBase: 'http://localhost:8000',
    userInfo: null,
    isLoggedIn: false,
    userId: '',
    token: '',
  },

  onLaunch() {
    this.login()
  },

  async login() {
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
      }
      this.globalData.isLoggedIn = true
    } catch (err) {
      console.error('登录失败:', err)
    }
  },
})
