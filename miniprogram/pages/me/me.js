const app = getApp()
const api = require('../../utils/api.js')
const poster = require('../../utils/poster.js')
const { t, texts } = require('../../utils/i18n.js')
const { CONTACT_EMAIL } = require('../../utils/contact.js')
const { VERSION, SITE, INTRO_LEAD } = require('../../utils/appInfo.js')

// {n} 这类占位由服务端给的数字填，界面里不自己写死额度规则
function fmt(tpl, map) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (map[k] == null ? '' : map[k]))
}

/* 头图在这一页要单独定锚点：aspectFill 只会把画面正中间那一条留在框里，
   人像照的中段是胸口和手，脸会被裁掉。所以先按宽铺满算出图的真实高度，
   再把"超出盒子的那截余量"按 15% 分给上面——也就是留 15% 的头顶空间。 */
const BAND_H = 542
const BG_ANCHOR = 0.15
function bandGeom(w, h) {
  if (!w || !h) return ''
  const byWidth = (750 * h) / w
  if (byWidth >= BAND_H) {
    const top = -Math.round((byWidth - BAND_H) * BG_ANCHOR)
    return `width:750rpx;height:${Math.round(byWidth)}rpx;left:0;top:${top}rpx`
  }
  const bw = Math.round((BAND_H * w) / h)
  return `width:${bw}rpx;height:${BAND_H}rpx;left:${Math.round((750 - bw) / 2)}rpx;top:0`
}

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
    themeClass: 'theme-default',
    t: texts('zh'),
    // 药丸：默认停在「设置」，「关于」的内容直接长在头部下面，不分二级
    tab: 'set',
    // 头部那一块：底图、圆 LOGO、昵称与口号、脑力值
    bgSrc: '',
    imgStyle: '',
    logoSrc: '/assets/logo.png',
    nameText: '',
    sloganText: '',
    scoreText: '',
    shareValue: '',
    // 私密密码：设没设只吃服务端读数；面板就地展开在列表里
    privateSet: false,
    pwdOpen: false,
    pwd1: '',
    pwd2: '',
    // 关于那几行只读，值全部来自现成的两处来源
    version: VERSION,
    site: SITE,
    contactEmail: CONTACT_EMAIL,
    introLead: INTRO_LEAD,
  },

  onShow() {
    const userInfo = app.globalData.userInfo || {}
    const lang = userInfo.language || 'zh'
    const themeClass = app.applyTheme(app.getWallpaper())
    // 形象与昵称都是本机设置，读一次很便宜；从「卡片模板」改完回到这里要立刻看到
    const prof = poster.readProfile()
    this.setData({
      lang,
      t: texts(lang),
      themeClass,
      bgSrc: poster.homeBg(),
      logoSrc: poster.cardPath() || '/assets/logo.png',
      nameText: (prof.name && String(prof.name).trim()) || t('meGreeting', lang),
      // 口号只填了一项时另一项各自退回默认，不整块消失
      sloganText: (prof.slogan && String(prof.slogan).trim()) || t('slogan', lang),
    })
    this.fitBand()
    app.setNavTitle('tabMe', lang)
    // 朋友圈这一路只在本页开：它要的是"单页可被转发"，别处不铺入口
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'], fail() {} })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateLabels()
      this.getTabBar().applyTheme(app.getWallpaper())
      this.getTabBar().setData({ selected: 2 })
    }
    this.loadQuota()
    this.loadPwdStatus()
  },

  // 图的尺寸要问出来才知道往上顶多少；读不到就退回 aspectFill 的默认居中
  fitBand() {
    const src = this.data.bgSrc
    if (!src) return
    wx.getImageInfo({
      src,
      success: (info) => this.setData({ imgStyle: bandGeom(info.width, info.height) }),
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
        shareValue: fmt(t('shareRewardN', lang), { n: q.reward_each }),
      })
      this.quota = q
    } catch (err) {
      console.error('额度读取失败', err)
    }
  },

  onTab(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.tab) return
    // 切走之前把展开着的面板收掉：两层内容叠在一起会读成"这一格里还有一格"
    this.setData({ tab: key, pwdOpen: false, pwd1: '', pwd2: '' })
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

  onTogglePwd() {
    const open = !this.data.pwdOpen
    this.setData({ pwdOpen: open, pwd1: '', pwd2: '' })
  },

  onClosePwdPanel() {
    this.setData({ pwdOpen: false, pwd1: '', pwd2: '' })
  },

  onPwdInput1(e) { this.setData({ pwd1: e.detail.value }) },
  onPwdInput2(e) { this.setData({ pwd2: e.detail.value }) },

  // 两格都过一遍"6 位数字"，再比一致；不一致就一个字节都不发，第二格清空让人重输。
  async onPwdSave() {
    const { pwd1, pwd2, lang } = this.data
    if (!/^\d{6}$/.test(pwd1)) {
      wx.showToast({ title: t('privatePasswordHint', lang), icon: 'none' })
      return
    }
    if (pwd1 !== pwd2) {
      this.setData({ pwd2: '' })
      wx.showToast({ title: t('privatePasswordMismatch', lang), icon: 'none' })
      return
    }
    try {
      await api.setPrivatePassword(pwd1)
      this.setData({ pwdOpen: false, pwd1: '', pwd2: '', privateSet: true })
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
    const mode = this.bioMode === undefined ? (this.bioMode = await probeBio()) : this.bioMode
    if (!mode) {
      wx.showModal({
        title: t('privatePasswordReset', lang),
        content: `${t('bioUnavailable', lang)}${t('privatePasswordResetBody', lang)}`,
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
    const { lang } = this.data
    try {
      await api.resetPrivatePassword()
      this.setData({ privateSet: false, pwd1: '', pwd2: '' })
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
    }
  },

  // 分享卡片固定落在新建页（新用户第一眼就是那三个色块），并带上邀请人 id。
  // 归因到这里就结束了：对方打没打开、算不算邀请成功，服务端按"他真的存下第一条笔记"
  // 来结账（backend/app/services/quota.py：自己动笔写第一篇、或把别人那篇转存进自己库里，
  // 两条都算，一人一次、同一篇笔记一次，带来几个人不限），所以这行写的是一笔真实的兑换，
  // 不是许愿。
  // 封面是自己画的一张 5:4 图（assets/share-card.png，80KB，微信上限 128KB）：
  // 不给 imageUrl 的话微信会截当前页，截到的是一屏菜单，推广位就废了。
  onShareAppMessage() {
    const inviter = app.globalData.userId || ''
    return {
      title: t('shareCardTitle', this.data.lang),
      path: `/pages/create/create${inviter ? `?inviter=${inviter}` : ''}`,
      imageUrl: '/assets/share-card.png',
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
      await api.deactivateAccount()
      wx.hideLoading()
      // 本地这套 token/userId 必须跟着清：留着下一个请求就带着一个已经不存在的身份去敲门。
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
