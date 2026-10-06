const app = getApp()
const api = require('../../utils/api.js')
const poster = require('../../utils/poster.js')
const { t, texts } = require('../../utils/i18n.js')
const { CONTACT_EMAIL } = require('../../utils/contact.js')
const { VERSION, SITE, introLead } = require('../../utils/appInfo.js')
const { TIP_DOT } = require('../../utils/palette.js')
const cloudUpload = require('../../utils/cloudUpload.js')

// 配额告警线。比值来自 GET /api/user/storage-quota 的 used_ratio，**它是全站口径**
// （云开发那 5GB 是一个环境一个池子，不是每人 5GB），所以这一行说的是"这一池水快见底了"，
// 不是"你的空间快满了"——文案里不许写成后者，那会让人以为删自己的笔记就能解决。
const STORAGE_WARN_RATIO = 0.9

// {n} 这类占位由服务端给的数字填，界面里不自己写死额度规则
function fmt(tpl, map) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (map[k] == null ? '' : map[k]))
}

/* 头图的摆法（按宽铺满、往上顶 15% 留头顶空间）已收进 utils/poster.js 的 bandGeom：
   首页那一屏要的是同一个人、同一个取景，两页各留一份数迟早走样。 */

/* 这台手机能不能用指纹／面容，只能问它自己：文档写明的只有指纹，
   iOS 走面容没写在文档里，所以探不到就当没有——探不到时重置退回普通确认，
   绝不因为"没有生物识别"就把人堵在门外。 */
function probeBio() {
  return new Promise((resolve) => {
    if (!wx.checkIsSupportSoterAuthentication) return resolve('')
    wx.checkIsSupportSoterAuthentication({
      success: (r) => {
        const modes = r.supportMode || []
        const mode = modes.indexOf('fingerPrint') >= 0 ? 'fingerPrint'
          : modes.indexOf('facial') >= 0 ? 'facial' : ''
        if (!mode || !wx.checkIsSoterEnrolledInDevice) return resolve('')
        wx.checkIsSoterEnrolledInDevice({
          checkAuthMode: mode,
          success: (e) => resolve(e && e.isEnrolled ? mode : ''),
          fail: () => resolve(''),
        })
      },
      fail: () => resolve(''),
    })
  })
}

Page({
  data: {
    lang: 'zh',
    themeClass: 'theme-tint-paper',  // 未登录/首帧的占位：类名必须真的存在，四枚里象牙是 THEMES[0]
    t: texts('zh'),
    // 药丸：默认停在「设置」，「关于」的内容直接长在头部下面，不分二级
    tab: 'set',
    // 头部那一段铺不铺图：'' 表示不铺（形象文件被系统清了）。
    bgSrc: '',
    // 背景深浅那一档：初值给中档（站长 10-02 夜里定的默认档，也是 app.bgSkin() 在本机读不到
    // 键时回落的那一档），免得第一帧先闪一下别的深浅。三样每次进页由 app.bgSkin() 重读。
    dimV: 1,
    dimDot: '',
    dimScrim: '',
    imgStyle: '',
    logoSrc: '/assets/logo.png',
    nameText: '',
    sloganText: '',
    scoreText: '',
    mindRules: [],
    // 规则块每行前面那枚点：与新建页四步指引、Tips 同一枚黄点，色值只从 palette 发下来，
    // 写进 me.wxss 就会被 `验-统一录入条` 那把尺子扫成"色板走了两份"。
    ruleDotStyle: 'background:' + TIP_DOT,
    // 私密密码：设没设只吃服务端读数；输入那一层是整屏遮罩 + 居中卡（见上面那组方法）
    privateSet: false,
    // 图片云空间告警那一行：默认不出现，只有现读回来的比值过了线才亮。
    storageWarn: false,
    storageTip: '',
    pwdOpen: false,
    pwdEntering: false,
    pwdStep: 1,
    pwdBuf: '',
    pwdFirst: '',
    pwdFocus: false,
    pwdName: '',
    pwdScene: '',
    pwdTip: '',
    // 关于那几行只读，值全部来自现成的两处来源
    version: VERSION,
    site: SITE,
    contactEmail: CONTACT_EMAIL,
    introLead: introLead('zh'),
  },

  onShow() {
    const userInfo = app.globalData.userInfo || {}
    const lang = userInfo.language || 'zh'
    const themeClass = app.applyTheme(app.getWallpaper())
    // 站长 10-01：这三样是**应用自己**的自我介绍，不是用户的签名——原来它吃本机填的
    // 名称/一句话/形象图，英文态就把人自己写的"阿麦"顶到了这一屏最上面。
    // 卡片模板页那两栏照旧留着，它们印在海报上；这一格不再跟着走。
    this.setData({
      lang,
      t: texts(lang),
      themeClass,
      bgSrc: poster.homeBg(),
      ...app.bgSkin(),
      logoSrc: '/assets/logo.png',
      nameText: t('meGreeting', lang),
      sloganText: t('slogan', lang),
      // 介绍卡那句话是这一页唯一不在 t 里的中文长句，所以跟着 lang 一起重取
      introLead: introLead(lang),
    })
    this.fitBand()
    // 这一页原来只有导航条标题跟着语言走、底色永远吃壁纸：另外两页铺了图会翻成深底白字，
    // 于是三个 tab 顶上两深一浅。站长 10-01 晚要"按背景深浅自动反差"，这里补上同一条出口。
    app.setNavTitle('appName', lang)
    app.applyNavForBand(this.data.bgSrc)
    // 朋友圈这一路只在本页开：它要的是"单页可被转发"，别处不铺入口
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'], fail() {} })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateLabels()
      this.getTabBar().applyTheme(app.getWallpaper())
      this.getTabBar().setData({ selected: 2 })
    }
    this.loadQuota()
    this.loadStorage()
    this.loadPwdStatus()
  },

  // 图的尺寸要问出来才知道往上顶多少；读不到就退回 aspectFill 的默认居中
  fitBand() {
    const src = this.data.bgSrc
    if (!src) return
    wx.getImageInfo({
      src,
      success: (info) => this.setData({ imgStyle: poster.bandGeom(info.width, info.height) }),
      fail: () => this.setData({ imgStyle: '' }),
    })
  },

  // MIND 只读服务端那一个数（规则整条写在 backend/app/services/quota.py，界面不再自己相加，
  // 免得两边各算一套）。读不到就整块不占位：宁可空着，也不摆一个猜的数。
  async loadQuota() {
    const lang = this.data.lang
    try {
      const q = await api.getQuota()
      this.setData({
        scoreText: q.mind == null ? '' : String(q.mind),
        // 三个数缺任何一个就整块不占位——宁可空着，也不摆半套猜的规则。
        mindRules:
          q.base == null || q.reward_each == null || q.import_each == null
            ? []
            : [
                { label: t('mindRuleNewUser', lang), value: String(q.base) },
                { label: t('mindRuleInvite', lang), value: fmt(t('mindPlusN', lang), { n: q.reward_each }) },
                { label: t('mindRuleSaved', lang), value: fmt(t('mindPlusN', lang), { n: q.import_each }) },
              ],
      })
    } catch (err) {
      console.error('额度读取失败', err)
    }
  },

  // 图片云空间的比值现读一次（方案 §3.1.8）。
  //
  // 没填 CLOUD_ENV 就整段跳过：那时候全库不会有 assets 行，读回来永远是 0%，
  // 而今天这一页一个请求都不该多打（B 链还没开，这一路也不该先响）。
  async loadStorage() {
    const lang = this.data.lang
    if (!cloudUpload.cloudReady()) {
      this.setData({ storageWarn: false, storageTip: '' })
      return
    }
    try {
      const q = await api.getStorageQuota()
      const ratio = q && typeof q.used_ratio === 'number' ? q.used_ratio : 0
      this.setData({
        storageWarn: ratio > STORAGE_WARN_RATIO,
        // 那一行整句由字典 + 现读的百分比拼出来，界面里不自己写死规则
        storageTip: fmt(t('storageTip', lang), { pct: Math.round(ratio * 100) }),
      })
    } catch (err) {
      // 读不到就不显示：这一行是提醒，不是状态。宁可漏报，也不摆一个猜的百分比。
      console.warn('云空间配额读取失败', err && (err.errMsg || err.statusCode))
      this.setData({ storageWarn: false, storageTip: '' })
    }
  },

  onTab(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.tab) return
    // 切走之前把浮着的那一层收掉：两层内容叠在一起会读成"这一格里还有一格"
    this.setData({ tab: key })
    this.onClosePwdPanel()
    wx.pageScrollTo({ scrollTop: 0, duration: 120 })
  },

  onNavigate(e) {
    const page = e.currentTarget.dataset.page
    const routes = {
      categories: '/pages/categories/categories',
      wallpaper: '/pages/wallpaper/wallpaper',
      profile: '/pages/profile/profile',
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

  // ---------- 私密密码那一层（站长 10-01 晚：不在原菜单里就地展开，改屏幕下方浮起 1/3 屏）----------
  // 六个方格是同一只隐藏 input 的显示面，所以状态只有"这一遍输到第几位"：
  // 第一遍满六位自动跳到第二遍（他要的就是"输入一次后，再输入一次 6 个方格"），
  // 第二遍满六位才比一致、才发请求。不一致只清第二遍，第一遍留着不用重打。

  async onTogglePwd() {
    if (this.data.pwdOpen) {
      this.onClosePwdPanel()
      return
    }
    // 设没设是服务端说了算的。冷启动或 401 重登时那条读数可能要一秒多才回来，
    // 期间点这一行会先按"未设置"画出六个格子，读数一到 privateSet 翻转，
    // wx:if 把整块销毁——人已经输进去的六位数字当场蒸发，界面上也不说为什么。
    if (!this.pwdReady) await this.loadPwdStatus()
    this.openPwdSheet(!this.data.privateSet)
  },

  // 弹层里那两行字（第一行功能名、格子上方那句校验）在这里现算，wxml 只递字段：
  // 让模板去写三层三元，字典改一个词就得同时改两处。
  openPwdSheet(entering) {
    const lang = this.data.lang
    this.setData({
      pwdOpen: true,
      pwdEntering: entering,
      pwdStep: 1,
      pwdBuf: '',
      pwdFirst: '',
      pwdFocus: entering,
      // 第一行放的是**功能名**（他原话「里面是功能名称」），两态都一样；
      // 差额全在右边那枚按钮和提醒那句上——要是标题也跟着换成"重置密码"，
      // 就和右边那枚撞成同一句话了。
      pwdName: t('privatePassword', lang),
      // 功能名下面那句是"这串密码用在哪"（他原话「密码使用场景说明要在页面里面写清楚」）；
      // 格子上方那句才是校验提醒，只在要输的那两态出现。
      pwdScene: entering ? t('privatePasswordScene', lang) : t('privatePasswordSetHint', lang),
      pwdTip: t('privatePasswordNew', lang),
    })
  },

  onClosePwdPanel() {
    // 连 focus 一起撤：这只 input 是透明的，键盘只认 focus 这一个开关
    this.setData({
      pwdOpen: false, pwdEntering: false, pwdFocus: false,
      pwdStep: 1, pwdBuf: '', pwdFirst: '',
    })
  },

  onPwdBuf(e) {
    const v = String(e.detail.value || '').replace(/\D/g, '').slice(0, 6)
    this.setData({ pwdBuf: v })
    if (v.length === 6) this.advancePwd()
  },

  advancePwd() {
    const lang = this.data.lang
    if (this.data.pwdStep === 1) {
      this.setData({
        pwdFirst: this.data.pwdBuf,
        pwdStep: 2,
        pwdBuf: '',
        pwdTip: t('privatePasswordAgain', lang),
      })
      return
    }
    if (this.data.pwdBuf !== this.data.pwdFirst) {
      // 不一致就一个字节都不发（沿用旧那条）
      this.setData({ pwdBuf: '' })
      wx.showToast({ title: t('privatePasswordMismatch', lang), icon: 'none' })
      return
    }
    this.savePwd(this.data.pwdBuf)
  },

  // 确定那一枚是给"没输满"那一态用的：满六位本来会自动跳，按钮这时负责把规则讲出来。
  onPwdOk() {
    if (!/^\d{6}$/.test(this.data.pwdBuf)) {
      wx.showToast({ title: t('privatePasswordHint', this.data.lang), icon: 'none' })
      return
    }
    this.advancePwd()
  },

  async savePwd(pwd) {
    const lang = this.data.lang
    try {
      await api.setPrivatePassword(pwd)
      this.setData({ privateSet: true })
      this.onClosePwdPanel()
      wx.showToast({ title: t('privatePasswordSaved', lang), icon: 'success' })
    } catch (err) {
      wx.showToast({ title: (err.data && err.data.detail) || t('operationFailed', lang), icon: 'none' })
    }
  },

  // 重置只清密码这一列，笔记和分类一个字不动；清完面板留着，下一步就是重新设一条。
  // 生物识别只卡在这一道门上：看私密笔记仍然只认密码（指纹只能证明"是本人按的"，
  // 换不来笔记内容）。探到可用才先识别再重置；探不到就照原来的两步确认走。
  async onPwdReset() {
    const lang = this.data.lang
    const mode = await probeBio()
    if (!mode) {
      wx.showModal({
        title: t('privatePasswordReset', lang),
        content: t('bioUnavailable', lang) + (lang === 'en' ? ' ' : '') + t('privatePasswordResetBody', lang),
        confirmText: t('privatePasswordResetConfirm', lang),
        cancelText: t('cancel', lang),
        success: (res) => { if (res.confirm) this.doPwdReset() },
      })
      return
    }
    wx.showModal({
      title: t('resetWithBioTitle', lang),
      content: t('resetWithBioBody', lang),
      confirmText: t('resetWithBioOk', lang),
      cancelText: t('cancel', lang),
      success: (res) => {
        if (!res.confirm) return
        wx.startSoterAuthentication({
          requestAuthModes: [mode],
          challenge: `wtsj-pwd-reset-${Date.now()}`,
          authContent: t('privatePasswordReset', lang),
          success: () => this.doPwdReset(),
          // 识别没过就当什么都没发生：密码留着，用户随时可以再点一次
          fail: () => wx.showToast({ title: t('operationFailed', lang), icon: 'none' }),
        })
      },
    })
  },

  async doPwdReset() {
    const lang = this.data.lang
    try {
      await api.resetPrivatePassword()
      this.setData({ privateSet: false })
      // 重置只清密码这一列，笔记和分类一个字不动；清完这一层直接翻成"输两遍"那一态，
      // 人不用退出再进来一次（站长 10-01：新增和重置是同一条路）
      this.openPwdSheet(true)
      wx.showToast({ title: t('privatePasswordResetDone', lang), icon: 'none' })
    } catch (err) {
      wx.showToast({ title: (err.data && err.data.detail) || t('operationFailed', lang), icon: 'none' })
    }
  },

  // 设没设只认服务端那一条：本机记一份"已设置"会在换设备后说谎。
  async loadPwdStatus() {
    try {
      const s = await api.getPrivatePasswordStatus()
      this.setData({ privateSet: !!(s && s.is_set) })
    } catch (err) {
      console.error('私密密码状态读取失败', err)
    } finally {
      this.pwdReady = true
    }
  },

  // 分享卡片固定落在新建页（新用户第一眼就是那三个色块），并带上邀请人 id。
  // 归因到这里就结束了：对方打没打开、算不算邀请成功，服务端按"他真的存下一条笔记"
  // 来结账（backend/app/services/quota.py：动笔写名下第一条 +10，别人把某一转存进自己库
  // 里作者 +1；带来几个人不限、同一篇被几个人转存就算几次，但同一个人对同一篇只算一次），
  // 所以这行写的是一笔真实的兑换，不是许愿。
  // 封面是自己排的一张 5:4 杂志版式图（assets/share-card.jpg，114KB / 117,090 字节，微信上限 128KB）：
  // 不给 imageUrl 的话微信会截当前页，截到的是一屏菜单，推广位就废了。
  // 源件在 docs/design/分享图-重设计/杂志版甲-纸白.html，改字改色都从它重出，别手改 PNG。
  onShareAppMessage() {
    const inviter = app.globalData.userId || ''
    return {
      title: t('shareCardTitle', this.data.lang),
      path: `/pages/create/create${inviter ? `?inviter=${inviter}` : ''}`,
      imageUrl: '/assets/share-card.jpg',
    }
  },

  // 朋友圈那条只能带 query、不能指定路径，所以它开的是本页；
  // 邀请参数同样带上，拿不到就退化成裸参数——分享本身不该因为归因失败而点不动。
  onShareTimeline() {
    const inviter = app.globalData.userId || ''
    return {
      title: t('shareCardTitle', this.data.lang),
      query: inviter ? `inviter=${inviter}` : '',
    }
  },

  // 注销：先现读一次条数，为的是第一道确认里那两个条数是真的，不是"你的全部数据"这种含糊话。
  // 读不到就停在这里——看不清要删什么的时候不该往下走。
  async onDeleteAccount() {
    if (this.deleting) return
    const lang = this.data.lang
    let q
    try {
      q = await api.getQuota()
    } catch (err) {
      wx.showToast({ title: t('loadFailed', lang), icon: 'none' })
      return
    }
    this.quota = q
    wx.showModal({
      title: t('deleteTitle', lang),
      content: fmt(t('deleteStep1', lang), { notes: q.used, cats: q.categories }),
      confirmText: t('deleteConfirm', lang),
      cancelText: t('deleteCancel', lang),
      success: (r1) => {
        if (!r1.confirm) return
        // 第二道只问一句：第一道讲的是"删哪些"，这一道讲的是"回不来"。
        wx.showModal({
          title: t('deleteTitle', lang),
          content: t('deleteStep2', lang),
          confirmText: t('deleteConfirm', lang),
          cancelText: t('deleteCancel', lang),
          success: (r2) => {
            if (r2.confirm) this.doDeactivate()
          },
        })
      },
    })
  },

  async doDeactivate() {
    const lang = this.data.lang
    this.deleting = true
    wx.showLoading({ title: t('deletingAccount', lang), mask: true })
    try {
      const r = await api.deactivateAccount()
      wx.hideLoading()
      // 云上那批对象只有这一侧删得动，而**这是最后一次有机会**：注销之后 token 就废了，
      // 再没有哪个接口能问出"这个人留了哪些图"。清单在服务端这次的回体里（file_ids）。
      cloudUpload.dropFromDeleteRes(r)
      // 本地这套 token/userId 必须跟着清：留着下一个请求就带着一个已经不存在的身份去敲门。
      // （clearSession 里面会连待补绑队列一起清掉。）
      app.clearSession()
      wx.showToast({ title: t('accountDeleted', lang), icon: 'success' })
      setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 900)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: (err && err.data && err.data.detail) || t('deleteAccountFailed', lang),
        icon: 'none',
      })
    } finally {
      this.deleting = false
    }
  },
})
