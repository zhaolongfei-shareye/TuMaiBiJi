const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { blockSkinFor, toneVars, toneStyle } = require('../../utils/palette.js')
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
    // 搜索卡那一整块色：跟新建页那张 URL 卡同一个发色函数、同一块蓝，颜色仍只从 palette 出
    searchSkin: toneStyle(1),
  },

  async onShow() {
    const app = getApp()
    await app.getLoginPromise().catch(() => {})
    const themeClass = app.applyTheme(app.globalData.userInfo?.wallpaper || 'default')
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass,
    })
    app.setNavTitle('appName', lang)
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateLabels()
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
      this.setData({
        // 分隔符两侧各留一个全角空格：半角空格在这行字号下几乎看不出来，三段会糊成一串数字
        statsText: `${t('statWeek', lang)}：${week}　|　${t('statMonth', lang)}：${month}　|　${t('statTotal', lang)}：${total}`,
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
    notes.forEach((n) => {
      const s = blockSkinFor(n.category_id, n.id)
      n.blockStyle = s.style
      n.motif = s.motif
      // 方块上的字改成"第一个标签"：标签是用户自己写的，比分类名更能说明这一条是什么；
      // 颜色仍按分类走，所以"扫颜色分流、读字辨条"这两件事没有互相抢。
      // 没有标签时退回分类名；分类也查不到名字时宁可空着，也不要写成"未分类"——
      // 它明明归了类，只是这一批分类数据里没它，空着时方块只剩颜色，识别照旧成立。
      const firstTag = (n.tags || []).map((x) => (x || '').trim()).find(Boolean) || ''
      n.blockName = firstTag || (n.category_id == null ? this.data.t.noCategory : (nameOf[n.category_id] || ''))
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
      wx.showToast({ title: '加载失败', icon: 'none' })
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
