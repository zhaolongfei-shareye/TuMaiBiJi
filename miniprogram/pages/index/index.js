const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { catSkinFor, chromeOf, toneVars, withAlpha } = require('../../utils/palette.js')
const poster = require('../../utils/poster.js')
const { isPrivate } = require('../../utils/privateGate.js')
const { formatShortDate, formatDateTime } = require('../../utils/date.js')

// 统计看板一次读多少条：后端 /api/notes 的 limit 上限就是 100，写不了更大。
// 所以总数超过一百篇只能显示"100+"——接口没给 count，不能假装知道。
// （基础额度正好 100，靠邀请加成就可能超出一百，这一条从"到顶之前够用"变成"重度用户会撞到显示上限"。）
const STATS_LIMIT = 100

// 周一为一周起点（国内习惯）。用"本地零点"而不是把毫秒减 7 天，
// 否则跨月的那几天会算错。
function startOfWeek(now) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

const SOURCE_TYPE_KEYS = {
  wechat_article: 'sourceWechatArticle',
  web_article: 'sourceWebArticle',
  screenshot: 'sourceScreenshot',
  manual: 'sourceManual',
}

Page({
  data: {
    notes: [],
    categories: [],
    loading: true,
    searchKeyword: '',
    selectedCategory: null,
    lang: 'zh',
    themeClass: 'theme-default',
    t: texts('zh'),
    skip: 0,
    limit: 50,
    hasMore: true,
    loadingMore: false,
    // 「我的笔记」右上角那三个数：本周 / 本月 / 总数
    statsText: '',
    // 手风琴：一次只开一条；-1 = 全收起
    openIdx: -1,
    // 私密笔记：本会话里已经验过密码就不再重问
    _privateVerified: false,
    // v7 ③：详情浮窗——点已展开那行才浮它，窗内滚正文、动作钉在下沿 dock
    detailOpen: false,
    detailNote: null,
    shared: false,
    origOpen: false,
    // v7 ④⑤：模板独浮弹窗——拉它时详情窗整个藏掉，页面上只留这一个浮层
    templateOpen: false,
    posterNote: null,
    posterTpl: '',
    posterImagePath: '',
    posterW: 750,
    posterH: 900,
    posterBusy: false,
    // 弹窗里那个二维码开关：只影响这一张成品图，与海报页同一条语义
    noQr: false,
    // 搜索条那一块面不再是一支固定蓝，而是由当前壁纸的页面底派生（palette.chromeOf）。
    // data 字面量里这一次是模块加载时算的，主题还没落地，所以按 default 走——
    // 和 themeOf 拿不到 key 时回落 THEMES[0] 是同一条规则，不是另写一份兜底色。
    searchSkin: chromeOf().style,
    // 头部那一段铺不铺图：'' 表示不铺（用户在外观设置里关掉了，或形象文件被系统清了）。
    // 取图和新建页同一个口，不在这页另开一份判断。
    bgSrc: '',
  },

  async onShow() {
    const app = getApp()
    await app.getLoginPromise().catch(() => {})
    const themeClass = app.applyTheme(app.getWallpaper())
    const lang = app.globalData.userInfo?.language || 'zh'
    const wallpaper = app.getWallpaper()
    // 每次进页重取：在卡片模板页换完形象返回，这一屏的头部就该跟着换。
    const bgSrc = poster.homeBg()
    this.setData({
      lang,
      t: texts(lang),
      themeClass,
      bgSrc,
      // 搜索条那一块面由当前壁纸的页面底派生（palette.chromeOf），和底部导航那条胶囊同一个值；
      // 每次进页重算，留着 data 字面量那份就等于永远停在米白那一档。
      // 但铺了图就整串不发：style 上的自定义属性优先级高于任何选择器，
      // 带着它，CSS 里那条"图上换成纸白面"的规则一行都翻不动。
      searchSkin: bgSrc ? '' : chromeOf(wallpaper).style,
    })
    app.setNavTitle('appName', lang)
    // 铺了图才把导航条刷成罩层顶部那一档墨色，和新建页是同一条规则；
    // 没铺图时不碰它——上面 applyTheme 已经按壁纸底色设过了。
    if (this.data.bgSrc) {
      wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: '#181a20', fail() {} })
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateLabels()
      this.getTabBar().applyTheme(app.getWallpaper())
      this.getTabBar().setData({ selected: 1 })
    }
    this.loadCategories()
    this.loadStats()
    // onShow 每次切回该 tab 都会触发，必须 reset：否则非 reset 分支会把结果追加到旧列表上，
    // 同一条笔记被贴两遍。
    this._closeFloats()
    this.loadNotes(true)
  },

  // 下拉刷新：人停在列表页不动时 onShow 不会再触发，采集在后台完成的那条就一直不出现。
  // 三趟一起等完再收菊花，否则下拉框还转着、列表已经换了一批，看着像没刷出来。
  async onPullDownRefresh() {
    this._closeFloats()
    try {
      await Promise.all([this.loadCategories(), this.loadStats(), this.loadNotes(true)])
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  // 统计走一趟不带筛选条件的全量读：列表那一趟是按搜索词和分类过滤过的，
  // 拿它算出来的"总数"其实是"当前筛出来的条数"，会被搜索框里的词改数。
  async loadStats() {
    const lang = this.data.lang
    try {
      const all = await api.getNotes(0, STATS_LIMIT)
      const now = new Date()
      const ws = startOfWeek(now)
      const ms = new Date(now.getFullYear(), now.getMonth(), 1)
      // 时间按客户端本地解释，和列表方块上那个 MM-DD 用的是同一条转换
      // （utils/date.js 里也是 new Date(created_at)）——看板必须和它下面那些日期对得上，
      // 所以这里不另起一套时区口径。
      let week = 0
      let month = 0
      all.forEach((n) => {
        const d = new Date(n.created_at)
        if (d >= ws) week++
        if (d >= ms) month++
      })
      const total = all.length >= STATS_LIMIT ? `${STATS_LIMIT}+` : all.length
      // 分隔符两侧各留一个全角空格：半角空格在这行字号下几乎看不出来，三段会糊成一串数字。
      // 英文那一档没有全角标点的位置，照抄会让 "Week：3" 这种半中半英的写法出现在英文界面上，
      // 所以标点单独按语言取一份，中文那一版一字未动。
      const colon = lang === 'zh' ? '：' : ': '
      const gap = lang === 'zh' ? '　|　' : '  |  '
      this.setData({
        statsText: [
          `${t('statWeek', lang)}${colon}${week}`,
          `${t('statMonth', lang)}${colon}${month}`,
          `${t('statTotal', lang)}${colon}${total}`,
        ].join(gap),
      })
    } catch (err) {
      // 这三个数是装饰，拿不到就整块不显示，绝不能把列表一起拖挂
      console.error('加载统计失败', err)
    }
  },

  async loadCategories() {
    try {
      const categories = await api.getCategories()
      // chip 选中态的颜色必须和该分类的方块一致，所以取同一套派生规则，
      // 不用后端那个 category.color——两者对不上时用户会以为分类乱了
      categories.forEach((c) => { c.toneStyle = toneVars(c.id) })
      this.setData({ categories })
      // 分类比笔记晚到是常态：到了就得给已在屏上的行卡补上块内分类名，否则方块会一直空着。
      if (this.data.notes.length) this.setData({ notes: this.skin(this.data.notes) })
    } catch (err) {
      console.error('加载分类失败', err)
    }
  },

  skin(notes) {
    const nameOf = {}
    this.data.categories.forEach((c) => { nameOf[c.id] = c.name })
    const wallpaper = getApp().getWallpaper()
    notes.forEach((n) => {
      // 分类身份退成"一枚点 + 分类名"，两档色由 palette 现算（浅色卡按 5、深色卡按 7）。
      const s = catSkinFor(n.category_id, wallpaper)
      // --cat-chip 只给详情窗里的那几枚标签当底色（分类色 12% 铺在纸白卡上）。
      n.catStyle = `--cat-dot:${s.dot};--cat-ink:${s.text};--cat-chip:${withAlpha(s.dot, 0.12)}`
      n.catRing = s.ring
      // 这一格只写分类名，标签不再来顶替它：标签在下面自己有的一段（.tg），
      // 两处都写就成了同一串字出现两遍。分类查不到名字时宁可空着，也不要写成"未分类"——
      // 它明明归了类，只是这一批分类数据里没它。
      n.catLabel = n.category_id == null ? this.data.t.noCategory : (nameOf[n.category_id] || '')
      n.tagLine = (n.tags || []).join(' / ')
      // 私密判据：分类名等于"私密"。跟后端 get_note、录入侧那道拦截是同一条口径（utils/privateGate.js）。
      n.is_private = isPrivate(nameOf[n.category_id])
    })
    return notes
  },

  async loadNotes(reset = false) {
    if (reset) {
      this.setData({ skip: 0, notes: [], hasMore: true })
    }
    
    const { skip, limit, searchKeyword, selectedCategory, loadingMore } = this.data
    if (loadingMore) return

    // reset 走整表重载：显示加载态并清空，避免残留上一次的筛选结果；
    // 翻页走追加：保持列表可见，用 loadingMore 单独提示。
    this.setData({
      loading: reset,
      loadingMore: reset ? false : true,
    })
    
    try {
      const notes = await api.getNotes(skip, limit, selectedCategory, searchKeyword)
      const lang = this.data.lang
      notes.forEach(n => {
        const key = SOURCE_TYPE_KEYS[n.source_type]
        n.source_type_label = key ? t(key, lang) : n.source_type
        n.date_label = formatShortDate(n.created_at)
      })
      this.skin(notes)
      
      const allNotes = reset ? notes : [...this.data.notes, ...notes]
      this.setData({ 
        notes: allNotes, 
        loading: false,
        loadingMore: false,
        hasMore: notes.length === limit,
        skip: skip + notes.length,
      })
    } catch (err) {
      console.error('加载笔记失败', err)
      this.setData({ loading: false, loadingMore: false })
      wx.showToast({ title: t('loadFailed', this.data.lang), icon: 'none' })
    }
  },

  onLoadMore() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadNotes(false)
    }
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
  },

  onSearchConfirm() {
    this._closeFloats()
    this.loadNotes(true)
  },

  clearSearch() {
    this.setData({ searchKeyword: '' })
    this._closeFloats()
    this.loadNotes(true)
  },

  selectCategory(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ selectedCategory: id === null ? null : parseInt(id) })
    this._closeFloats()
    this.loadNotes(true)
  },

  // 手风琴：点收起的行=展开该行并收起之前那条；点已经展开的行=浮详情窗（v7 ③）。
  // 私密笔记进门前先验密码（会话里验过一次就不再问），密码不对既不开条也不开窗。
  async onRowTap(e) {
    const idx = e.currentTarget.dataset.idx
    const note = this.data.notes[idx]
    if (!note) return
    if (!note.is_private || this.data._privateVerified) {
      if (this.data.openIdx === idx) this._openDetail(idx)
      else this.setData({ openIdx: idx })
      return
    }
    const ok = await this._promptPrivatePassword()
    if (!ok) return
    this.setData({ _privateVerified: true, openIdx: idx })
  },

  // v7 ③：详情浮窗。列表项身上那些派生字段（分类色、来源、日期）这一屏早就算好了，
  // 直接拿来当开窗的第一帧；窗里多出来的三块（核心要点、来源链接、原文）只有详情接口有，
  // 所以再取一次全文。取失败不拦窗——列表上有的那几块照样能看，只是窗里没有要点和原文。
  // 私密笔记照取：进展开态那一步已经验过密码，窗里的要点和原文本来就该看得见。
  async _openDetail(idx) {
    const row = this.data.notes[idx]
    if (!row) return
    this.setData({ detailOpen: true, detailNote: row, origOpen: false, shared: false })
    try {
      const full = await api.getNote(row.id)
      if (!this.data.detailOpen) return
      const note = Object.assign({}, row, full)
      note.source_type_label = row.source_type_label
      note.date_label = row.date_label
      note.created_at_label = formatDateTime(full.created_at)
      this.setData({ detailNote: note })
    } catch (err) {
      console.error('详情窗取全文失败', err)
    }
    // 私密笔记不给分享这条线，公开状态那行也就不查了。
    if (!row.is_private) this._loadShareStatus(row.id)
  },

  // 这篇对外不对外，只有服务端知道（码可能是在另一台手机上生成的）。
  async _loadShareStatus(noteId) {
    try {
      const s = await api.getShareStatus(noteId)
      if (this.data.detailOpen) this.setData({ shared: !!(s && s.active) })
    } catch (err) {
      // 读不到就不显示那一行公开状态。绝不能猜一个"没在公开"给人看——那等于把该收的东西留着。
      console.error('分享状态读取失败', err)
    }
  },

  // 换筛选词、换分类、下拉刷新、切回这一屏——这四条都会重排整张列表。
  // 行号一指错，展开的那条和浮着的窗就成了别人的笔记，所以先把两层浮态收掉。
  _closeFloats() {
    if (this.data.openIdx !== -1 || this.data.detailOpen) {
      this.setData({ openIdx: -1, detailOpen: false })
    }
  },

  onCloseDetail() {
    this.setData({ detailOpen: false })
  },

  onToggleOrig() {
    this.setData({ origOpen: !this.data.origOpen })
  },

  openSourceUrl() {
    const url = (this.data.detailNote || {}).source_url
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: t('linkCopied', this.data.lang), icon: 'success' }),
    })
  },

  _promptPrivatePassword() {
    const { lang } = this.data
    return new Promise((resolve) => {
      wx.showModal({
        title: t('privatePasswordTitle', lang),
        editable: true,
        placeholderText: t('privatePasswordHint', lang),
        confirmText: t('privatePasswordOk', lang),
        cancelText: t('cancel', lang),
        success: async (res) => {
          if (!res.confirm) { resolve(false); return }
          const pwd = (res.content || '').trim()
          if (!/^\d{6}$/.test(pwd)) {
            wx.showToast({ title: t('privatePasswordHint', lang), icon: 'none' })
            resolve(false); return
          }
          try {
            await api.verifyPrivatePassword(pwd)
            resolve(true)
          } catch (err) {
            const msg = (err.data && err.data.detail) || t('privatePasswordWrong', lang)
            wx.showToast({ title: msg, icon: 'none' })
            resolve(false)
          }
        },
        fail: () => resolve(false),
      })
    })
  },

  // 详情窗下沿 dock 的四个动作 + 那行公开状态。
  // 置顶会把这条跳到队列第一条，所以重载后要把行号找回来，否则展开态会指到别的笔记上。
  async onSheetPin() {
    const note = this.data.detailNote
    if (!note) return
    try {
      await api.pinNote(note.id, !note.is_pinned)
      wx.showToast({ title: note.is_pinned ? t('unpin', this.data.lang) : t('pin', this.data.lang), icon: 'success' })
      await this.loadNotes(true)
      const idx = this.data.notes.findIndex((x) => x.id === note.id)
      this.setData({ openIdx: idx, 'detailNote.is_pinned': !note.is_pinned })
    } catch (err) {
      wx.showToast({ title: t('operationFailed', this.data.lang), icon: 'none' })
    }
  },

  onSheetEdit() {
    const note = this.data.detailNote
    if (!note) return
    // 改完回来 onShow 会重载列表，窗留着就是读旧内容，所以出门前把窗和展开态一起收掉。
    this.setData({ detailOpen: false, openIdx: -1 })
    wx.navigateTo({ url: `/pages/write/write?id=${note.id}&mode=edit` })
  },

  onSheetDelete() {
    const note = this.data.detailNote
    if (!note) return
    const { lang } = this.data
    wx.showModal({
      title: t('confirmDelete', lang),
      content: t('cannotRestore', lang),
      success: async (res) => {
        if (!res.confirm) return
        try {
          await api.deleteNote(note.id)
          wx.showToast({ title: t('deleteSucceeded', lang), icon: 'success' })
          this.setData({ openIdx: -1, detailOpen: false })
          this.loadNotes(true)
          this.loadStats()
        } catch (err) {
          wx.showToast({ title: t('deleteFailed', lang), icon: 'none' })
        }
      },
    })
  },

  onSheetUnshare() {
    const note = this.data.detailNote
    if (!note) return
    const { lang } = this.data
    wx.showModal({
      title: t('unshare', lang),
      content: t('unshareBody', lang),
      confirmText: t('unshareConfirm', lang),
      cancelText: t('cancel', lang),
      success: async (res) => {
        if (!res.confirm) return
        try {
          await api.revokeShare(note.id)
          this.setData({ shared: false })
          wx.showToast({ title: t('unshared', lang), icon: 'success' })
        } catch (err) {
          console.error('撤掉分享失败', err)
          wx.showToast({ title: t('unshareFailed', lang), icon: 'none' })
        }
      },
    })
  },

  // v7 ④：dock 的「转为笔记卡片」= 详情窗整个藏掉、只浮模板预览这一个弹窗（两层不叠）。
  // 列表那条保持展开，所以关掉弹窗后详情窗回来、里面内容还是这篇。
  async onSheetToPoster() {
    const note = this.data.detailNote
    if (!note || note.is_private) return
    const profile = poster.readProfile()
    this.setData({
      detailOpen: false,
      templateOpen: true,
      posterNote: note,
      posterTpl: profile.template || poster.DEFAULT_TEMPLATE,
      posterImagePath: '',
      posterBusy: true,
      noQr: false,
    })
    try {
      await this._ensurePosterAssets(note.id)
      await this._renderPoster()
    } catch (err) {
      console.error('生成海报失败', err)
      wx.showToast({ title: t('generateFailed', this.data.lang), icon: 'none' })
      this._closeTemplate()
    }
  },

  async _ensurePosterAssets(noteId) {
    if (this._posterAssets && this._posterAssets.noteId === noteId) return
    const note = await api.getNote(noteId)
    const share = await api.createShare(noteId, poster.readProfile().name)
    const qrPath = await this._downloadQR(share.token)
    // 分类名不在笔记响应里，海报上那行小字要靠分类表查——与 share.js 同一条口径。
    if (note.category_id) {
      try {
        const categories = await api.getCategories()
        const cat = categories.find((c) => c.id === note.category_id)
        if (cat) note.category_name = cat.name
      } catch (err) { /* 查不到就只写来源 */ }
    }
    this._posterAssets = { noteId, note, token: share.token, qrPath }
  },

  _downloadQR(token) {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url: api.getShareQRCodeUrl(token),
        success: (r) => r.statusCode === 200 ? resolve(r.tempFilePath) : reject(new Error('QR ' + r.statusCode)),
        fail: reject,
      })
    })
  },

  async _getCanvas() {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().select('#posterCanvas').fields({ node: true, size: true }).exec((res) => {
        const c = res && res[0] && res[0].node
        if (c) resolve(c); else reject(new Error('海报画布未就绪'))
      })
    })
  },

  // 与 share.js render() 同一套：先量后画、canvas 尺寸切两次、paintLayers 落笔、canvasToTempFilePath 出成品。
  // 画布藏在 left:-9999rpx 位置、不进 fixed，弹窗里只放成品 <image>——绕开 canvas-in-fixed 那条历史坑。
  async _renderPoster() {
    const a = this._posterAssets
    if (!a) return
    const lang = this.data.lang
    const profile = poster.readProfile()
    const canvas = await this._getCanvas()
    const ctx = canvas.getContext('2d')
    const images = { qr: await poster.loadImage(canvas, a.qrPath, 3000) }
    const avatar = poster.avatarPath()
    if (avatar) images.avatar = await poster.loadImage(canvas, avatar, 5000)
    canvas.width = poster.W
    canvas.height = 750
    const plan = poster.planPoster(ctx, a.note, this.data.posterTpl, profile, lang, { showQr: !this.data.noQr })
    canvas.width = plan.width
    canvas.height = plan.height
    poster.paintLayers(ctx, plan.layers, images)
    // 让图片在弹窗里等比缩到可视框（长图不能超过屏高）
    const scale = Math.min(1, 1200 / plan.height)
    this.setData({
      posterW: Math.round(plan.width * scale),
      posterH: Math.round(plan.height * scale),
    })
    const tmpPath = await new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({ canvas, fileType: 'png', success: (r) => resolve(r.tempFilePath), fail: reject }, this)
    })
    this.setData({ posterImagePath: tmpPath, posterBusy: false })
  },

  // v7 效果图里"左右滑换模板 / Swipe to change template"那条：横向滑过 60px 判定切换。
  onPosterTouchStart(e) {
    this._touchStartX = e.touches[0].clientX
  },

  onPosterTouchEnd(e) {
    if (this.data.posterBusy) return
    const dx = (e.changedTouches[0] || {}).clientX - this._touchStartX
    if (Math.abs(dx) < 60) return
    this._advanceTemplate(dx < 0 ? 1 : -1)
  },

  // v7 ⑤：按 poster.js 里那十套的顺序走，走到头就滑不动、不循环（效果图原话）。
  async _advanceTemplate(delta) {
    const list = poster.TEMPLATES
    const cur = list.findIndex((x) => x.id === this.data.posterTpl)
    const next = list[(cur < 0 ? 0 : cur) + delta]
    if (!next) return
    this.setData({ posterTpl: next.id, posterBusy: true })
    wx.showToast({ title: poster.templateLabel(next.id, this.data.lang), icon: 'none', duration: 1200 })
    try {
      await this._renderPoster()
    } catch (err) {
      console.error('换模板重画失败', err)
      wx.showToast({ title: t('generateFailed', this.data.lang), icon: 'none' })
      this.setData({ posterBusy: false })
    }
  },

  // 码的开关只影响这一张成品图：翻一下重画一次（与海报页同一条语义）。
  async onToggleQr() {
    if (this.data.posterBusy) return
    this.setData({ noQr: !this.data.noQr, posterBusy: true })
    try {
      await this._renderPoster()
    } catch (err) {
      console.error('重画失败', err)
      wx.showToast({ title: t('generateFailed', this.data.lang), icon: 'none' })
      this.setData({ posterBusy: false })
    }
  },

  // v7 ⑥：取消、保存成功、点把手三个口都收掉弹窗，回来的还是详情窗那一屏（不是列表）。
  // 生成失败也走这里——人留在原地，只是多一枚吐司。
  _closeTemplate() {
    const note = this.data.posterNote
    this.setData({
      templateOpen: false,
      posterImagePath: '',
      posterBusy: false,
      posterNote: null,
      detailOpen: !!note,
    })
    // 生成海报这一步已经把这篇的码建出来了，公开状态得跟着刷新，
    // 否则详情窗里那行「已经公开」永远不显示。
    if (note) this._loadShareStatus(note.id)
  },

  onCancelTemplate() { this._closeTemplate() },
  onHandleTap() { this._closeTemplate() },

  onSavePoster() {
    if (!this.data.posterImagePath) return
    const { lang } = this.data
    wx.saveImageToPhotosAlbum({
      filePath: this.data.posterImagePath,
      success: () => {
        wx.showToast({ title: t('savedToAlbum', lang), icon: 'success' })
        setTimeout(() => this._closeTemplate(), 800)
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        if (msg.indexOf('cancel') >= 0) return
        if (msg.indexOf('auth') >= 0) {
          wx.showModal({
            title: t('needAlbumPermission', lang),
            content: t('permissionHint', lang),
            success: (res) => { if (res.confirm) wx.openSetting() },
          })
        } else {
          wx.showToast({ title: t('exportFailed', lang), icon: 'none' })
        }
      },
    })
  },

  onReachBottom() {
    this.onLoadMore()
  },
})
