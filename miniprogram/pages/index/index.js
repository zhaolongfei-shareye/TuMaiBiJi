const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { catSkinFor, chromeOf, toneVars } = require('../../utils/palette.js')
const poster = require('../../utils/poster.js')
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
    // v7 模板独浮弹窗：详情窗（展开行）藏起来、只浮一个海报图 + 关闭/保存
    templateOpen: false,
    posterNote: null,
    posterTpl: '',
    posterImagePath: '',
    posterW: 750,
    posterH: 900,
    posterBusy: false,
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
    this.loadNotes(true)
  },

  // 下拉刷新：人停在列表页不动时 onShow 不会再触发，采集在后台完成的那条就一直不出现。
  // 三趟一起等完再收菊花，否则下拉框还转着、列表已经换了一批，看着像没刷出来。
  async onPullDownRefresh() {
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
      n.catStyle = `--cat-dot:${s.dot};--cat-ink:${s.text}`
      n.catRing = s.ring
      // 这一格只写分类名，标签不再来顶替它：标签在下面自己有的一段（.tg），
      // 两处都写就成了同一串字出现两遍。分类查不到名字时宁可空着，也不要写成"未分类"——
      // 它明明归了类，只是这一批分类数据里没它。
      n.catLabel = n.category_id == null ? this.data.t.noCategory : (nameOf[n.category_id] || '')
      n.tagLine = (n.tags || []).join(' / ')
      // 私密判据：分类名等于"私密"。跟后端 get_note 是同一条口径，两处一致。
      n.is_private = !!(n.category_id != null && nameOf[n.category_id] === '私密')
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
    this.loadNotes(true)
  },

  clearSearch() {
    this.setData({ searchKeyword: '' })
    this.loadNotes(true)
  },

  selectCategory(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ selectedCategory: id === null ? null : parseInt(id) })
    this.loadNotes(true)
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  // 手风琴：点收起的行=展开该行并收起之前那条；点已经展开的行=收起。
  // 私密笔记的行展开前先验密码（会话里验过一次就不再问），密码不对不展开。
  async onRowTap(e) {
    const idx = e.currentTarget.dataset.idx
    const note = this.data.notes[idx]
    if (!note) return
    if (this.data.openIdx === idx) {
      this.setData({ openIdx: -1 })
      return
    }
    if (note.is_private && !this.data._privateVerified) {
      const ok = await this._promptPrivatePassword()
      if (!ok) return
      this.setData({ _privateVerified: true })
    }
    this.setData({ openIdx: idx })
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

  // 展开行底部三个动作，事件不冒泡回 onRowTap（catchtap），点了不收起该行。
  async onRowTogglePin(e) {
    const idx = e.currentTarget.dataset.idx
    const note = this.data.notes[idx]
    if (!note) return
    try {
      await api.pinNote(note.id, !note.is_pinned)
      wx.showToast({ title: note.is_pinned ? t('unpin', this.data.lang) : t('pin', this.data.lang), icon: 'success' })
      this.loadNotes(true)
    } catch (err) {
      wx.showToast({ title: t('operationFailed', this.data.lang), icon: 'none' })
    }
  },

  onRowEdit(e) {
    const idx = e.currentTarget.dataset.idx
    const note = this.data.notes[idx]
    if (!note) return
    wx.navigateTo({ url: `/pages/write/write?id=${note.id}&mode=edit` })
  },

  onRowDelete(e) {
    const idx = e.currentTarget.dataset.idx
    const note = this.data.notes[idx]
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
          this.setData({ openIdx: -1 })
          this.loadNotes(true)
          this.loadStats()
        } catch (err) {
          wx.showToast({ title: t('deleteFailed', lang), icon: 'none' })
        }
      },
    })
  },

  // 展开行"转为笔记卡片" = 关掉展开行 + 打开 v7 独浮弹窗；
  // 详情窗藏起来（openIdx=-1）、弹窗里只浮海报图。关闭时把展开行还原。
  async onRowShare(e) {
    const idx = e.currentTarget.dataset.idx
    const note = this.data.notes[idx]
    if (!note || note.is_private) return
    this._prevOpenIdx = this.data.openIdx
    const profile = poster.readProfile()
    this.setData({
      openIdx: -1,
      templateOpen: true,
      posterNote: note,
      posterTpl: profile.template || poster.DEFAULT_TEMPLATE,
      posterImagePath: '',
      posterBusy: true,
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
    const plan = poster.planPoster(ctx, a.note, this.data.posterTpl, profile, lang)
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

  async _advanceTemplate(delta) {
    const list = poster.TEMPLATES
    const cur = list.findIndex((x) => x.id === this.data.posterTpl)
    const next = list[((cur < 0 ? 0 : cur) + delta + list.length) % list.length]
    if (next.id === this.data.posterTpl) return
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

  _closeTemplate() {
    this.setData({
      templateOpen: false,
      posterImagePath: '',
      posterBusy: false,
      posterNote: null,
      openIdx: typeof this._prevOpenIdx === 'number' ? this._prevOpenIdx : -1,
    })
    this._prevOpenIdx = undefined
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

  // catchtap 需要一个真函数才不吃事件；操作条本身点了不该收起该行。
  noop() {},

  onReachBottom() {
    this.onLoadMore()
  },
})
