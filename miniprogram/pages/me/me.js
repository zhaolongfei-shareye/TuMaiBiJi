const app = getApp()
const api = require('../../utils/api.js')
const poster = require('../../utils/poster.js')
const { t, texts } = require('../../utils/i18n.js')

const CONTACT_EMAIL = 'jacky28471258@gmail.com'
const OFFICIAL_ACCOUNT = '杰克AI日记'

// {n} 这类占位由服务端给的数字填，界面里不自己写死额度规则
function fmt(tpl, map) {
  return String(tpl).replace(/\{(\w+)\}/g, (t, k) => (map[k] == null ? '' : map[k]))
}

Page({
  data: {
    displayName: '图麦用户',
    lang: 'zh',
    themeClass: 'theme-default',
    t: texts('zh'),
    contactEmail: CONTACT_EMAIL,
    officialAccount: OFFICIAL_ACCOUNT,
    // 额度没读回来之前这两行留空：宁可少一行字，也不先写一个服务端不认的数
    quotaText: '',
    shareValue: '',
    profileSummary: '',
  },

  onShow() {
    const userInfo = app.globalData.userInfo || {}
    const lang = userInfo.language || 'zh'
    const themeClass = app.applyTheme(userInfo.wallpaper || 'default')
    // 分享形象是本机设置，读一次很便宜；从那一页改完回到这里要能立刻看到用的是哪套
    const prof = poster.readProfile()
    this.setData({
      // 昵称取不到是常态（微信已不返回资料），给一个稳定称谓，
      // 不要显示"未登录"——登录是静默完成的，这里也没有可点的登录入口
      displayName: userInfo.nickName || '图麦用户',
      lang,
      t: texts(lang),
      themeClass,
      profileSummary: poster.templateLabel(prof.template || poster.DEFAULT_TEMPLATE, lang),
    })
    app.setNavTitle('tabMe', lang)
    // 朋友圈这一路只在本页开：它要的是"单页可被转发"，别处不铺入口
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'], fail() {} })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateLabels()
      this.getTabBar().setData({ selected: 2 })
    }
    this.loadQuota()
  },

  // 额度和邀请进度都读这一个接口：数字只有一个来源，页面不再自己算 100。
  async loadQuota() {
    const lang = this.data.lang
    try {
      const q = await api.getQuota()
      this.setData({
        quotaText: `${q.used}/${q.limit}`,
        shareValue: q.invites_left > 0
          ? fmt(t('shareRewardN', lang), { n: q.reward_each })
          : t('shareRewardMax', lang),
      })
      this.quota = q
    } catch (err) {
      // 读不到就把这两行留空，绝不显示一个猜的数
      console.error('额度读取失败', err)
    }
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

  // 分享卡片固定落在新建页（新用户第一眼就是那三个色块），并带上邀请人 id。
  // 归因到这里就结束了：对方打没打开、算不算邀请成功，服务端按"他真的写下第一篇笔记"
  // 来记（backend/app/services/quota.py），所以这行写的是一笔真实的兑换，不是许愿。
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

  // 注销：先现读一次额度，为的是第一道确认里那两个条数是真的，不是"你的全部数据"这种含糊话。
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
