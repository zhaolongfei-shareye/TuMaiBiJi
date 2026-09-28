const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { catSkinFor, chromeOf, toneVars } = require('../../utils/palette.js')
const { formatShortDate } = require('../../utils/date.js')

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
    // 搜索条那一块面不再是一支固定蓝，而是由当前壁纸的页面底派生（palette.chromeOf）。
    // data 字面量里这一次是模块加载时算的，主题还没落地，所以按 default 走——
    // 和 themeOf 拿不到 key 时回落 THEMES[0] 是同一条规则，不是另写一份兜底色。
    searchSkin: chromeOf().style,
  },

  async onShow() {
    const app = getApp()
    await app.getLoginPromise().catch(() => {})
    const themeClass = app.applyTheme(app.getWallpaper())
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass,
      // 每次进页按当前主题重算：换壁纸时这块面和底部导航那条胶囊必须同步改色，
      // 留着 data 字面量那份就等于永远停在米白那一档。
      searchSkin: chromeOf(app.getWallpaper()).style,
    })
    app.setNavTitle('appName', lang)
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

  onReachBottom() {
    this.onLoadMore()
  },
})
