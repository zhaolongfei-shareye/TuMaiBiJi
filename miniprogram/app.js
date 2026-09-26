const { request } = require('./utils/api')
const { themeOf, setActiveTheme } = require('./utils/palette')
const { t } = require('./utils/i18n')

// 分享卡片的路径上带着邀请人的 user id（?inviter=123）。落到本地存储是因为它必须活到
// "这个人真的写下第一篇笔记"那一刻：冷启、热启、从分享卡片直接落到新建页，都只有这里
// 能一次接住。到底认不认、什么时候给额度，全在服务端判（见 backend/app/services/quota.py）。
const INVITER_KEY = 'inviterId'

// 淡雅那两枚壁纸（palette 里带 ramp 的）只存在这台设备上。
// 原因不是偷懒：后端 PUT /api/user/wallpaper 有一张 WALLPAPER_PRESETS 白名单，
// 那是现网代码，加两个 key 就要动后端并部署——这一轮明确不碰现网。
// 所以规则是：本机存过就用本机的，没存过用服务端那份；切回那六枚时把这份删掉，
// 让服务端重新当家（换设备、重装后还是原来那六枚的同步行为）。
const LOCAL_WALLPAPER_KEY = 'localWallpaper'

// 界面字体同理是本机偏好：它只影响这一台设备上的字长什么样，不需要同步，
// 也不该同步——安卓上这三档基本命不中，跟着账号跑到别人设备上只会让人看到"没生效"。
const UI_FONT_KEY = 'uiFont'
const UI_FONT_CLASS = { song: 'font-song', fang: 'font-fang', kai: 'font-kai' }

function rememberInviter(options) {
  const raw = options && options.query ? options.query.inviter : ''
  const id = parseInt(raw, 10)
  if (!id || id <= 0) return
  if (wx.getStorageSync(INVITER_KEY) === id) return
  wx.setStorageSync(INVITER_KEY, id)
}

App({
  globalData: {
    userInfo: null,
    isLoggedIn: false,
    userId: '',
    token: '',
    loginPromise: null,
  },

  onLaunch(options) {
    rememberInviter(options)
    // 字体那一排入口已撤（iOS 与安卓真机都不换字），但测试期可能在这台机器上留下过选择。
    // 留着它就等于一个看不见的开关在生效，所以启动先清掉；重新做字体时删掉这一行即可。
    wx.removeStorageSync(UI_FONT_KEY)
    this.login()
  },

  // 小程序已经活着的时候点开分享卡片只补发 onShow，不会走 onLaunch。
  onShow(options) {
    rememberInviter(options)
    // 冷启由 _doLogin 带着 inviter 一起走；这里只管"已经登录着"的热启那条路。
    if (this.globalData.isLoggedIn && wx.getStorageSync(INVITER_KEY)) {
      this._reportInviter()
    }
  },

  async _reportInviter() {
    const inviter = wx.getStorageSync(INVITER_KEY)
    if (!inviter) return
    try {
      await request('/api/user/inviter', 'POST', { inviter })
      // 认不认都由服务端判，而且判过就不会再改（已有归属/名下已有笔记都挡着），
      // 所以只要这一趟通了就把本地这份扔掉——留着它每次启动都要白跑一次请求。
      wx.removeStorageSync(INVITER_KEY)
    } catch (err) {
      // 网络这一类失败要留着下次再报，不然这次归因就永久丢了。
      console.error('邀请归因上报失败，保留待下次重试:', err)
    }
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
      const body = { code: loginRes.code }
      const inviter = wx.getStorageSync(INVITER_KEY)
      if (inviter) body.inviter = inviter
      const res = await request('/api/auth/wechat', 'POST', body)
      this.globalData.token = res.token
      this.globalData.userId = res.user_id
      this.globalData.userInfo = {
        nickName: res.nickname || '',
        avatarUrl: res.avatar_url || '',
        language: res.language || 'zh',
        wallpaper: this.getWallpaper(res.wallpaper),
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

  // 注销之后本地这一整套都要跟着清掉：留着旧 token 会让每一个请求都去撞 401，
  // 留着 inviter 会让一个已经注销过的号再去成就别人一次。
  clearSession() {
    this.globalData.token = ''
    this.globalData.userId = ''
    this.globalData.userInfo = null
    this.globalData.isLoggedIn = false
    this.globalData.loginPromise = null
    wx.removeStorageSync(INVITER_KEY)
  },

  /**
   * 当前该用哪套壁纸：本机那份优先，没有才用服务端的。
   * @param fromServer 登录接口返回的原值，只在 _doLogin 那一步传进来
   */
  getWallpaper(fromServer) {
    const local = wx.getStorageSync(LOCAL_WALLPAPER_KEY)
    if (local) return local
    return fromServer || (this.globalData.userInfo && this.globalData.userInfo.wallpaper) || 'default'
  },

  /**
   * 选完壁纸之后落一次账。带 local 标记的那两枚只写本机，其余那六枚删掉本机这份、
   * 让服务端继续当家——这样"换设备还是原来那套"的老行为一点没变。
   */
  setWallpaper(key) {
    if (themeOf(key).local) wx.setStorageSync(LOCAL_WALLPAPER_KEY, key)
    else wx.removeStorageSync(LOCAL_WALLPAPER_KEY)
    if (this.globalData.userInfo) this.globalData.userInfo.wallpaper = key
    return key
  },

  uiFont() {
    const k = wx.getStorageSync(UI_FONT_KEY)
    return UI_FONT_CLASS[k] ? k : 'default'
  },

  setUIFont(key) {
    const k = UI_FONT_CLASS[key] ? key : 'default'
    if (k === 'default') wx.removeStorageSync(UI_FONT_KEY)
    else wx.setStorageSync(UI_FONT_KEY, k)
    return k
  },

  uiFontClass() {
    return UI_FONT_CLASS[this.uiFont()] || ''
  },

  // .container 上那一串类名 = 主题 + 界面字体。页面只管贴，不各自拼第二份规则。
  containerClass(wallpaper) {
    return [themeOf(wallpaper).cls, this.uiFontClass()].filter(Boolean).join(' ')
  },

  getThemeClass(wallpaper) {
    return this.containerClass(wallpaper)
  },

  isDarkTheme(wallpaper) {
    return themeOf(wallpaper).dark
  },

  applyTheme(wallpaper) {
    // 先把当前主题记进 palette：方块按分类取哪一档、新建页那三张卡用什么面，
    // 全看这一步有没有先落地（palette.js 里 ACTIVE_THEME 那段注释写了为什么做成模块状态）。
    const theme = setActiveTheme(wallpaper)
    // 导航条必须和页面底色同值，否则卡片滚到顶部会看出一条色差。
    // 之前这里写死 '#f5f5f5'，和六套主题的底色一个都对不上。
    // 页面刚 onLoad 时这个接口可能直接 fail，忽略即可，底色由容器自己画。
    wx.setNavigationBarColor({
      frontColor: theme.dark ? '#ffffff' : '#000000',
      backgroundColor: theme.page,
      fail() {},
    })
    // tab 栏不在这里推：getTabBar 是 Page 的 API，App 实例上根本没有这个方法，
    // 原来那句 this.getTabBar?.() 恒为 undefined，等于没人管过 tab 栏的颜色和字体。
    // 三个 tab 页各自在 onShow 里已经有 this.getTabBar() 那一串，由它们推。
    return this.containerClass(wallpaper)
  },

  // 导航条标题原来只写在 pages/*/*.json 里，全是硬编码中文：英文用户在语言页切完，
  // 满屏内容都变了、顶上那行还是中文。JSON 没法动态，所以统一由页面在同步 lang 时调这里。
  setNavTitle(key, lang) {
    const k = lang || this.globalData.userInfo?.language || 'zh'
    wx.setNavigationBarTitle({ title: t(key, k), fail() {} })
  },
})
