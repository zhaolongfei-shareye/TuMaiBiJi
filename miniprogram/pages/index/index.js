const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { blockSkinFor, toneVars, toneStyle } = require('../../utils/palette.js')
const { formatShortDate } = require('../../utils/date.js')

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
    // onShow 每次切回该 tab 都会触发，必须 reset：否则非 reset 分支会把结果追加到旧列表上，
    // 同一条笔记被贴两遍。
    this.loadNotes(true)
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
