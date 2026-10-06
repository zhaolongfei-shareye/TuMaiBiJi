const apiModule = require('./utils/api')
const { request } = apiModule
const assetQueue = require('./utils/assetQueue')
const posterTemplates = require('./utils/posterTemplates')
const cloudUpload = require('./utils/cloudUpload')
const { themeOf, setActiveTheme, dimAt, dimNext, dimDotStyle, dimScrimStyle } = require('./utils/palette')
const { t } = require('./utils/i18n')

// 分享卡片的路径上带着邀请人的 user id（?inviter=123）。落到本地存储是因为它必须活到
// "这个人真的写下第一篇笔记"那一刻：冷启、热启、从分享卡片直接落到新建页，都只有这里
// 能一次接住。到底认不认、什么时候给额度，全在服务端判（见 backend/app/services/quota.py）。
const INVITER_KEY = 'inviterId'

// 界面字体同理是本机偏好：它只影响这一台设备上的字长什么样，不需要同步，
// 也不该同步——安卓上这三档基本命不中，跟着账号跑到别人设备上只会让人看到"没生效"。
const UI_FONT_KEY = 'uiFont'
const UI_FONT_CLASS = { song: 'font-song', fang: 'font-fang', kai: 'font-kai' }

// 背景形象图压多深，同样是本机偏好：它只改这一台设备上那张图的明暗，
// 跟着账号跑到另一台设备上，只会让人看到"我的图怎么自己变黑了"。
// 三档的值与那两枚灰度都在 utils/palette.js 的 BG_DIMS 里，这里只管存哪一个档被选中。
const BG_DIM_KEY = 'bgDim'

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
    // 私密笔记的解锁凭证（{ token, expireAt }）。只存内存：杀了重进就要重新输密码，
    // 这一闸防的正是"手机在别人手里"那一段时间。读写都在 utils/api.js 里收口。
    privateUnlock: null,
  },

  onLaunch(options) {
    rememberInviter(options)
    // 字体那一排入口已撤（iOS 与安卓真机都不换字），但测试期可能在这台机器上留下过选择。
    // 留着它就等于一个看不见的开关在生效，所以启动先清掉；重新做字体时删掉这一行即可。
    wx.removeStorageSync(UI_FONT_KEY)
    // 云开发存储（图片备份那条 B 链）。CLOUD_ENV 没填之前这是一个空操作——
    // 不 init 就不会有任何一次上传，行为和今天一字不差（见 utils/cloudUpload.js 顶上那段）。
    cloudUpload.initCloud()
    // 卡片模板配方：先把上一回拉到的那批端回来（只读本机存储、同步、不查网），
    // 于是这一次会话从第一张卡起吃的就是上次那批下发值。拉新的一批在「卡片模板」页里。
    // 坏了也只是"这批没有"——包内那十套是 poster.js 里的常量，跟这里通不通没关系。
    posterTemplates.restore()
    this.login()
  },

  // 小程序已经活着的时候点开分享卡片只补发 onShow，不会走 onLaunch。
  onShow(options) {
    rememberInviter(options)
    // 冷启由 _doLogin 带着 inviter 一起走；这里只管"已经登录着"的热启那条路。
    if (this.globalData.isLoggedIn && wx.getStorageSync(INVITER_KEY)) {
      this._reportInviter()
    }
    // 待补绑队列：图传上去了但"归到哪篇笔记"没做成（B 链比 A 链慢、或 bind 那一下弱网）。
    // 这批对象在云上占着全站配额、库里却没有账，所以每次回到前台补一次。
    // 不 await、不提示：它属于"看不见但迟早要对上"的那一类。
    if (this.globalData.isLoggedIn) {
      assetQueue.flush(apiModule).then((r) => {
        if (r && r.sent) console.log(`补绑回 ${r.sent} 张图`)
      })
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
  // 留着 inviter 会让一个已经注销过的号再去成就别人一次，
  // 留着待补绑队列会让下一个身份第一次进前台就替别人重试一遍绑图（收口在这里而不是
  // 让注销那条路自己记得清，是因为 clearSession 是唯一一个"身份没了"的出口）。
  clearSession() {
    this.globalData.token = ''
    this.globalData.userId = ''
    this.globalData.userInfo = null
    this.globalData.isLoggedIn = false
    this.globalData.loginPromise = null
    assetQueue.clear()
    wx.removeStorageSync(INVITER_KEY)
  },

  /**
   * 当前该用哪套壁纸：本机那份优先，没有才用服务端的。
   * @param fromServer 登录接口返回的原值，只在 _doLogin 那一步传进来
   *
   * 返回的是**解析后的 canonical key**（themeOf 里那张 WALLPAPER_ALIAS 表把六枚旧值压成四枚）。
   * 这一句 10-04 改过两次：
   * ① 原来这里判 `themeOf(wanted).dark ? 'default' : wanted`——深色那两枚（夜紫/深海）09-30 起
   *    整条链路屏蔽，因为这一屏永远铺背景图，而深色主题的卡底是 rgba(255,255,255,.05) 那层薄膜，
   *    贴在照片上等于没有，站长真机反馈"卡片是透明的、完全看不清"。现在四枚壁纸全浅色、
   *    旧 key 一律由别名表落到浅色那枚，那个三元成了死路，所以撤干净，不留兼容壳。
   * ② 原来直接把 wanted 原样返回，于是存过 'default' 的人拿到的就是 'default'，
   *    而壁纸条里已经没有这一格 → 实际生效的是象牙，条上却一格都不亮（外观设置页那个高亮 bug）。
   *    取 .key 就是把这件事收在一处：往下所有人拿到的都是四枚之一的 key。
   */
  getWallpaper(fromServer) {
    const wanted = fromServer || (this.globalData.userInfo && this.globalData.userInfo.wallpaper) || 'default'
    return themeOf(wanted).key
  },

  /**
   * 选完壁纸之后落一次账。四枚现在都由服务端当家（站长 10-04 拍「统一」，
   * 后端白名单已加这三个新 key），所以这里只更新内存里那一份，不再写本机存储。
   */
  setWallpaper(key) {
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

  /**
   * 背景形象图那一档深浅，三页（新建／笔记／我的）每次进页读一次。
   * dimV 是当前档（0 最亮 / 1 压一半 / 2 现网那一档），dimDot 是那一枚点的灰度，
   * dimScrim 是**现网那层压暗罩自己**的透明度样式串——不是再叠一层黑。
   * 最沉那一档 dimScrim 是空串（罩子照 CSS 全铺）；最亮那一档是 opacity:0，
   * 照片就等于原图，站长拿原图对过才认的这一档。
   */
  bgSkin() {
    const v = dimAt(wx.getStorageSync(BG_DIM_KEY)).v
    return { dimV: v, dimDot: dimDotStyle(v), dimScrim: dimScrimStyle(v) }
  },

  // 点一下换一档：最亮 → 压一半 → 全铺 → 回最亮。存完把新那档原样返回，页面 setData 就行。
  cycleBgDim() {
    const v = dimNext(dimAt(wx.getStorageSync(BG_DIM_KEY)).v)
    wx.setStorageSync(BG_DIM_KEY, v)
    return { dimV: v, dimDot: dimDotStyle(v), dimScrim: dimScrimStyle(v) }
  },

  // .container 上那一串类名 = 主题 + 界面字体。页面只管贴，不各自拼第二份规则。
  containerClass(wallpaper) {
    return [themeOf(wallpaper).cls, this.uiFontClass()].filter(Boolean).join(' ')
  },

  getThemeClass(wallpaper) {
    return this.containerClass(wallpaper)
  },

  applyTheme(wallpaper) {
    // 先把当前主题记进 palette：方块按分类取哪一档、新建页那三张卡用什么面，
    // 全看这一步有没有先落地（palette.js 里 ACTIVE_THEME 那段注释写了为什么做成模块状态）。
    const theme = setActiveTheme(wallpaper)
    // 导航条必须和页面底色同值，否则卡片滚到顶部会看出一条色差。
    // 之前这里写死 '#f5f5f5'，和四套主题的底色一个都对不上。
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

  // 铺了形象图的那三页（新建／笔记／我的），导航条跟着翻成深底白字。
  // 「按背景深浅自动反差」这条为什么不用去读那张图：图上面压的那层罩子顶部是
  // rgba(18,20,26,.58)，不管用户换哪张形象图，压完都是 #181A20 这一档的深，字就得是纸白。
  // 没铺图的态不碰导航条——上面 applyTheme 已经按壁纸底色设过了，别在这里把主题色改丢。
  // 原来这条判断在笔记页和新建页里各写一份，「我的」页漏了，于是三页的导航条两深一浅。
  applyNavForBand(hasBg) {
    if (!hasBg) return
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: '#181a20',
      fail() {},
    })
  },

  // 导航条标题原来只写在 pages/*/*.json 里，全是硬编码中文：英文用户在语言页切完，
  // 满屏内容都变了、顶上那行还是中文。JSON 没法动态，所以统一由页面在同步 lang 时调这里。
  setNavTitle(key, lang) {
    const k = lang || this.globalData.userInfo?.language || 'zh'
    wx.setNavigationBarTitle({ title: t(key, k), fail() {} })
  },
})
