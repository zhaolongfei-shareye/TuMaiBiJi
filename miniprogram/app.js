const apiModule = require('./utils/api')
const { request } = apiModule
const assetQueue = require('./utils/assetQueue')
const posterTemplates = require('./utils/posterTemplates')
const cloudUpload = require('./utils/cloudUpload')
const cardCloud = require('./utils/cardCloud')
const profileCloud = require('./utils/profileCloud')
const mpAssets = require('./utils/mpAssets')
const { themeOf, setActiveTheme, dimAt, dimNext, dimDotStyle, dimScrimStyle, DIM_PLAIN, moodOf, moodNext, moodOfWallpaper, navFor } = require('./utils/palette')
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

/**
 * 「心情」那一档彩色玻璃（站长 10-14：「切换毛玻璃改到首页，增加一个入口『换心情』…每次点击切换一种」）。
 *
 * 为什么只存本机：服务端那一列叫 `wallpaper`，只有四套壁纸的值，**表达不了"同一套壁纸配墨面板
 * 还是配彩色玻璃"**——墨与象牙共用 tint-paper 这一枚。要让它跨设备，得给 `user_profiles` 加一列并部署。
 * 代价说清楚：换手机或重装之后这一档回到默认（墨＝今天那一屏），壁纸本身照旧从服务端带回来。
 * 加不加那一列归他拍（本轮先按"入口搬到首页"这条做完，不替他扩需求）。
 *
 * ⚠ 但本机这一档不能压着服务端带回来的壁纸乱配：壁纸是青的、心情还是旧的樱落，屏上就成
 * "青底配一支粉玻璃"。所以读的时候先对一次账，两档同壁纸（墨与象牙都是 tint-paper）才认本机那一位。
 */
const MOOD_KEY = 'glassMood'

// 壁纸那四枚的**本机缓存**（权威仍在服务端，见 `setWallpaper` 那段）。单独起一个键名，
// 不复用历史上可能的 'wallpaper'：那一枚在 10-04 之后已经没人写，读它会把老版本残留当成新选择。
const WALLPAPER_CACHE_KEY = 'wallpaperCache'

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
    // §8.232：这一次登录是服务端**建出来的新号**，他名下那篇预置笔记的 id 在这里等着被取走一次。
    // 放 globalData 而不是 storage：它只对"这一台设备上这个账号刚出生"那一趟冷启有意义，
    // 存进本机就变成"重装之后又认它是新人"，那颗种子就会再去出第二张卡片。
    seededNoteId: 0,
    // 私密笔记的解锁凭证（{ token, expireAt }）。只存内存：杀了重进就要重新输密码，
    // 这一闸防的正是"手机在别人手里"那一段时间。读写都在 utils/api.js 里收口。
    privateUnlock: null,
    // 提炼成了之后"要站到哪一扇窗前"的那一次交接（站长 10-19：「提炼完，直接跳到这个详情页，
    // 就是带背景毛玻璃这个，用户有需要再修改」）。`switchTab` 带不了参数，只能放这里等列表页取走。
    // 同样只放内存：这是一次导航意图，不是一台设备的状态——留着它，下次进列表页会莫名弹出一扇
    // 他三分钟前刚存过的笔记。取走即清，见 consumePendingDetail()。
    pendingDetailNoteId: 0,
  },

  consumePendingDetail() {
    const id = this.globalData.pendingDetailNoteId
    this.globalData.pendingDetailNoteId = 0
    return id || 0
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
    this.flushQueues()
  },

  /**
   * 五头欠账一起补：待补绑、待删对象、卡片待补登记、卡片补传、名片待补写。
   *
   * 为什么收成一个方法而不是留在 onShow 里：**冷启动那一次 onShow 早于 `_doLogin` 回来**，
   * 这一趟的闸门 `isLoggedIn` 那时还是 false，于是一头都不补，要等用户把小程序切到后台再回来
   * 才补第一次（10-09 审计那条）。所以登录成功那一刻也要自己叫一次，两处同一个出处。
   */
  flushQueues() {
    if (!this.globalData.isLoggedIn) return
    assetQueue.flush(apiModule).then((r) => {
      if (r && r.sent) console.log(`补绑回 ${r.sent} 张图`)
    })
    // 待删队列：笔记删了、云上对象没删成的那批（同一族，另一头）。不 await、不提示。
    cloudUpload.flushPurge().then((n) => {
      if (n) console.log(`补删掉 ${n} 个云上对象`)
    })
    // 卡片待补登记：成品图传上去了、但"这一张归哪篇"那一步没做成的那批（同一族，第三个头）。
    // 这批最坏的情况是"云上有一张图、库里没有那一行"——界面上看不见，换台手机更看不见。
    cardCloud.flush().then((r) => {
      if (r && r.sent) console.log(`补登记回 ${r.sent} 张卡片`)
    })
    // 卡片补传：图还在本机、云上却没有那一行的那几张（10-08 那一趟留档静默死掉留下的存量）。
    cardCloud.backfillLocal().then((r) => {
      if (r && r.sent) console.log(`补传上云 ${r.sent} 张卡片`)
    })
    // 名片待补写：换图／改名那一下 PUT 没成的那一笔。不补的话下一次 pull 会拿服务器那份
    // 覆盖本机，把用户刚换的那张删掉（profileCloud 顶上那格注释写着这条）。
    profileCloud.flushPending().then((cleared) => {
      if (!cleared) console.warn('名片那一笔这次还没补成，留在本机')
    })
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

  consumeSeededNote() {
    // 取走即清：首启那张卡片只许出一次。出图失败也不放回去——失败静默是 §8.232 口径 5，
    // 每次冷启重试一次就是让"我们替他写的那篇"变成他删不掉的影子。
    const id = this.globalData.seededNoteId
    this.globalData.seededNoteId = 0
    return id || 0
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
      // §8.232：服务端只在这次登录**建出了新账号**那一次带回来一个笔记 id（老用户永远是 null）。
      // 存这一格不是为了"他有预置笔记"这件事本身——库里那一行自己会说话——
      // 而是给首启那一张卡片一个**一次性的**发令：谁取走谁清，取不到就是不该再出图。
      this.globalData.seededNoteId = res.seeded_note_id || 0
      this.globalData.userInfo = {
        nickName: res.nickname || '',
        avatarUrl: res.avatar_url || '',
        language: res.language || 'zh',
        wallpaper: this.getWallpaper(res.wallpaper),
      }
      this.globalData.isLoggedIn = true
      this.applyTheme(this.globalData.userInfo.wallpaper)
      // 五头欠账：冷启动那一次 onShow 比这里早，那时 isLoggedIn 还是 false，所以补账必须
      // 在登录回来的这一刻自己叫一次，不能等用户切后台再回来（10-09 审计那条）。
      this.flushQueues()
      // 2.1 第一条：名片那四格与两档外观的权威在服务器 `user_profiles`，本机那份降级成缓存。
      // 挂在"登录成功"这一刻，是因为站长把跨端定义成一句话——同一个微信号换手机／重置手机之后
      // **再登录**就该是自己的东西，不该还要他去点一枚「恢复」。
      // 故意不 await：读不到就维持本机这一份，首屏不许为它多等一趟；失败也不出声（那条链按设计静默）。
      profileCloud.pull().then((r) => {
        if (r && !r.ok) console.warn('名片那份这次没对齐:', r.reason)
      })
      // 运营图（首页背景图）：后台传了新图就静默拉下来缓存，下一屏 homeBg() 自然取到。
      // 故意不 await：首屏不等它；失败也不出声（和 profileCloud.pull 同一纪律）。
      // 但"不出声"不等于"不接"：不 catch 的话这趟一旦reject 就是一个未处理的 Promise 拒绝，
      // 屏上什么都没有、日志里也捞不到（10-18 全量审查那条）。
      mpAssets.pull().catch((e) => console.warn('mpAssets.pull 这一趟没走完:', e))
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
    // 卡片这一族两个头一起收（待补登记队列 + 从服务器读回来那份名单），收在 cardCloud 一个
    // 出处里：留着名单就是下一个身份第一次进首页看见上一个人的卡片。
    cardCloud.signOut()
    // 名片那一份同理：内存里那份是"上一个人登记过的名片"，留着就是下一个身份一进卡片模板页
    // 看见别人的头像与一句话。本机那四张文件**一个都不动**——它们是这个人自己的东西。
    profileCloud.signOut()
    // 私密解锁那把凭证也跟着身份走：它证明的是"**这个账号**刚验过密码"，而 globalData 是进程里
    // 一份，换一个新 token 并不会把它换掉。留着就是下一个身份不必重输也能读上一个人的私密正文
    // （10-12 代码审查严重③；与上面卡片、名片那两个 signOut 同一口径）。
    apiModule.clearPrivateUnlock()
    // 待删队列**故意不跟着清**：注销那一步自己就是往这里塞东西的一方（删云上对象没成的那批），
    // 清了等于把"云端那份一并删除"那句承诺刚欠下的账抹掉。下一个身份替上一个人重试删除没有害处
    // ——deleteFile 只会把对象删掉，不会改谁的归属。
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
    const wanted = fromServer || (this.globalData.userInfo && this.globalData.userInfo.wallpaper)
      || wx.getStorageSync(WALLPAPER_CACHE_KEY) || 'default'
    return themeOf(wanted).key
  },

  /**
   * 选完壁纸之后落一次账。四枚的**权威在服务端**（站长 10-04 拍「统一」，后端白名单已加这三个新 key）：
   * 登录回来时 `getWallpaper(fromServer)` 吃服务端那一枚，本机这一份只是没有会话时的兜底缓存——
   * 与 2.1 名片那四格「服务端为权威、本机降级成缓存」同一手法。
   * 为什么现在要留这一份缓存：模拟器与登录失败那一趟 `globalData.userInfo` 是空的（§D22 同一症状），
   * 而「换心情」那一档要与壁纸对账；没有缓存，天青／樱落／雨雾三档会被对账判成"对不上"而退回墨，
   * 首页那枚就只剩两档可点。
   */
  setWallpaper(key) {
    if (this.globalData.userInfo) this.globalData.userInfo.wallpaper = key
    wx.setStorageSync(WALLPAPER_CACHE_KEY, key)
    return key
  },

  uiFont() {
    const k = wx.getStorageSync(UI_FONT_KEY)
    return UI_FONT_CLASS[k] ? k : 'default'
  },

  // 这一档**不上云**（2.1 定）：它不是"没备份"，是不该同步——理由见上面 UI_FONT_KEY 那段。
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
   * 背景形象图那一档深浅，**只有新建页（首屏＋第二屏）**每次进页读一次。
   * 10-15 09:2x 站长把笔记／我的那两页搬去下面那道 `bgSkinLocked()`，所以这里"三页"的说法作废。
   * dimV 是当前档（0 最亮 / 1 压一半 / 2 现网那一档），dimDot 是那一枚点的灰度，
   * dimScrim 是**现网那层压暗罩自己**的透明度样式串——不是再叠一层黑。
   * 最沉那一档 dimScrim 是空串（罩子照 CSS 全铺）；最亮那一档是 opacity:0，
   * 照片就等于原图，站长拿原图对过才认的这一档。
   */
  bgSkin() {
    const v = dimAt(wx.getStorageSync(BG_DIM_KEY)).v
    return { dimV: v, dimDot: dimDotStyle(v), dimScrim: dimScrimStyle(v) }
  },

  /**
   * 站长 10-15 09:2x「笔记列表，卡片列表，我的，设置，上面的背景图，不需要跟随首页调亮度。
   * 首页调亮度只影响首屏和第二屏」，11:0x 又追了一句把它说死：**「是要正常亮度，不是压暗！」**
   * ⇒ 那四屏不再读本机那一档，恒给**最亮那一档**（`DIM_PLAIN`＝满月，veil 0 ⇒ 罩层 `opacity:0`
   * ＝照片等于原图，站长拿原图对过才认的这一档）。
   * ⚠ 我第一版落成了"锁在默认那一档（半月 .5）"，把"不跟随"错当成"锁默认"——他要的是不压暗，
   *   这一句已经改口，别照着旧注释再改回去。
   * ⚠ 只改这一处，**不许在页面里各写一份**（那正是这一刀要撤掉的"四处各算一遍"）；
   *   `DIM_DEFAULT`（半月）那枚常量仍然归首页那枚「调亮度」的兜底用，两件事不是一个数，别合。
   */
  bgSkinLocked() {
    const v = DIM_PLAIN.v
    return { dimV: v, dimDot: dimDotStyle(v), dimScrim: dimScrimStyle(v) }
  },

  // 点一下换一档：最亮 → 压一半 → 全铺 → 回最亮。存完把新那档原样返回，页面 setData 就行。
  // 顺手登记一次（2.1）：这一档以前只在本机，换台手机就回到默认，而界面上那句"你选的亮度"
  // 看不出来已经变了——静默的差别最难查，所以跟着名片那一条链一起收口。
  cycleBgDim() {
    const v = dimNext(dimAt(wx.getStorageSync(BG_DIM_KEY)).v)
    wx.setStorageSync(BG_DIM_KEY, v)
    profileCloud.pushDim(v)
    return { dimV: v, dimDot: dimDotStyle(v), dimScrim: dimScrimStyle(v) }
  },

  // 2.1 起这一档要能"照服务器那一份原样落下来"，cycle 那一圈解决不了"云上存的是 0、本机是 2"。
  // 脏值（别的版本写过的数、云上以后加了新档而本机还不认）由 dimAt 兜回默认那一档，
  // 所以这里不收范围——收范围等于再写一份规则，两处迟早对不上。
  bgDim() {
    return dimAt(wx.getStorageSync(BG_DIM_KEY)).v
  },

  setBgDim(v, fromServer) {
    const got = dimAt(v).v
    wx.setStorageSync(BG_DIM_KEY, got)
    if (!fromServer) profileCloud.pushDim(got)
    return { dimV: got, dimDot: dimDotStyle(got), dimScrim: dimScrimStyle(got) }
  },

  // .container 上那一串类名 = 主题 + 界面字体。页面只管贴，不各自拼第二份规则。
  containerClass(wallpaper) {
    return [themeOf(wallpaper).cls, this.glassMood(wallpaper).cls, this.uiFontClass()].filter(Boolean).join(' ')
  },

  /**
   * 当前那一档心情。脏值与"从来没点过"落回第一档墨＝今天那一屏；
   * 本机这一档与服务端带回来的壁纸对不上账时以壁纸为准，不然换台手机就是"青底配一支粉玻璃"。
   * （墨与象牙共用 tint-paper，所以同壁纸的那两档仍由本机这一位说了算。）
   */
  glassMood(wallpaper) {
    const w = wallpaper || this.getWallpaper()
    const m = moodOf(wx.getStorageSync(MOOD_KEY))
    return m.theme === themeOf(w).key ? m : moodOfWallpaper(w)
  },

  /**
   * 点一次换一档。**这里只做本机的三件事**：记档、把壁纸跟着换成本档钉的那套、让主题重算。
   * 往服务端那一趟由调用方发（首页那枚按钮），理由与 `pages/wallpaper` 原来那条
   * `applyWallpaper` 一样：PUT 是异步的，界面不能等它。
   * 彩色那四档各自钉着一套壁纸，所以这一枚按下去，整屏（页面底色、卡片、底栏、玻璃）一起换——
   * 「四种界面配色…改为不同颜色的毛玻璃」要的就是这个一起换，不是只换面板那一层。
   */
  cycleGlassMood() {
    const m = moodNext(this.glassMood().key)
    wx.setStorageSync(MOOD_KEY, m.key)
    this.setWallpaper(m.theme)
    this.applyTheme(m.theme)
    return m
  },

  getThemeClass(wallpaper) {
    return this.containerClass(wallpaper)
  },

  applyTheme(wallpaper) {
    // 先把当前主题记进 palette：方块按分类取哪一档、新建页那三张卡用什么面，
    // 全看这一步有没有先落地（palette.js 里 ACTIVE_THEME 那段注释写了为什么做成模块状态）。
    setActiveTheme(wallpaper)
    // 顶上那一条跟着**这一档心情**走（站长 10-15 拍甲：有图没图都跟，整屏从上到下同族）。
    // 这里原来吃 `theme.page`——四套壁纸全是浅色 ⇒ 没铺图那一态顶上永远一条浅；而铺图那三页
    // 另由 `applyNavForBand` 发两枚写死的 `#f2efe9`／`#181a20`。同一条栏两套真相，
    // 就是他今天那句"有些是黑底、有些是白底"。两枚一起作废，值只剩 `navFor(心情)` 一处。
    this.applyNav()
    // tab 栏不在这里推：getTabBar 是 Page 的 API，App 实例上根本没有这个方法，
    // 原来那句 this.getTabBar?.() 恒为 undefined，等于没人管过 tab 栏的颜色和字体。
    // 三个 tab 页各自在 onShow 里已经有 this.getTabBar() 那一串，由它们推。
    return this.containerClass(wallpaper)
  },

  /**
   * 顶上那一条唯一的出口。面＝该档面板皮那支本色，字＝按皮的亮度在微信只认的两枚里挑
   * （`frontColor` 只吃 `#ffffff`／`#000000`，写别的会被静默丢掉）。
   * 页面不许自己碰——原来"铺没铺图"那一档判断在笔记页和新建页各写一份、「我的」页漏了，
   * 于是三页的导航条两深一浅（10-01 收进一个出口，10-15 这一刀把"深浅"那一档整个撤掉）。
   */
  applyNav() {
    const nav = navFor(this.glassMood().key)
    wx.setNavigationBarColor({ frontColor: nav.front, backgroundColor: nav.face, fail() {} })
  },

  // 导航条标题原来只写在 pages/*/*.json 里，全是硬编码中文：英文用户在语言页切完，
  // 满屏内容都变了、顶上那行还是中文。JSON 没法动态，所以统一由页面在同步 lang 时调这里。
  setNavTitle(key, lang) {
    const k = lang || this.globalData.userInfo?.language || 'zh'
    wx.setNavigationBarTitle({ title: t(key, k), fail() {} })
  },
})
