const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { catSkinFor, chromeOf, toneVars, toneColor, withAlpha, themeOf, mix, TIP_DOT } = require('../../utils/palette.js')
const poster = require('../../utils/poster.js')
const cardLog = require('../../utils/cardLog.js')
const { isPrivate } = require('../../utils/privateGate.js')
const { formatShortDate, formatDateTime } = require('../../utils/date.js')

const SOURCE_TYPE_KEYS = {
  wechat_article: 'sourceWechatArticle',
  web_article: 'sourceWebArticle',
  screenshot: 'sourceScreenshot',
  manual: 'sourceManual',
  // 转存别人分享的那一篇。这一支以前漏在表外：source_type 是 'share_import' 的行
  // 查不到键就直接把英文原文写到屏上了（站长 10-02 对 v18 时撞见）。字典里那串早就有。
  share_import: 'sourceShareImport',
}

/* v19（站长 10-03 凌晨拍）：这一屏不再有两种排布，而是列表区顶上两枚 tab——
   笔记列表（X 那种一行一条：左列日期 + 圆点，右列标题 / 摘要 /「显示更多」）
   与笔记卡片（两列白垫网格，只画生成过的）。
   上面那行 88 是搜索条压到 60 之后头部那一行的高，两枚 tab 那一行 70、通栏横线压在它下沿，
   都写在 wxss 里；两枚 tab 每次进页都从第一枚起（他原话"默认第一个tab"），所以不落本机。 */
/* 摘要那一列能放多少字：列宽 = 750 − 卡内缩 24×2 = 702，再减日期那一列 88 与间距 20 = 594，
   字号 --fs-meta 24 → 一行 24 个汉字、三行 72。「显示更多」画不画就按这个估，
   估的是汉字档（英文数字比汉字窄），所以这条线偏保守——宁可多给一枚出口，
   也不要在真被截断的那条上什么都不给。 */
const SUM_LINES = 3
const SUM_CHARS = 24

/* 详情窗右上那枚淡底方形的底色（站长 10-03 原话："做一个淡淡方形，用背景风格的主色阶"）。
   规则不是色号，三条：有色阶那两枚壁纸（象牙 / 天青）吃 steps[0]；浅色那四枚从**自己的页底**
   掺 8% 墨（米白 → #E3E0DC、雾蓝 → 淡蓝、松绿 → 淡绿、暮橙 → 淡桃，效果图 s2 那格就是这个数）；
   深色那两枚（夜紫 / 深海）不能照页底掺——页底是近黑，会把这块方染成近黑压在纸白窗上，
   那就是他打回过的"太明显了"，所以参照物换成窗口自己的纸白（.float-sheet 那个 #FCFBF8）。 */
const SHEET_PAPER = '#FCFBF8'
function paleStep(wallpaper) {
  const th = themeOf(wallpaper)
  if (th.ramp && th.ramp.steps && th.ramp.steps.length) return th.ramp.steps[0]
  return mix('#23252C', th.dark ? SHEET_PAPER : th.page, 0.08)
}

Page({
  data: {
    notes: [],
    categories: [],
    loading: true,
    searchKeyword: '',
    searchOpen: false,
    selectedCategory: null,
    lang: 'zh',
    themeClass: 'theme-default',
    t: texts('zh'),
    skip: 0,
    limit: 50,
    hasMore: true,
    loadingMore: false,
    // 头部那一行的轮播 Tips（v18 把这一行从"分类 + 圆钮"换成"Tips + 三枚 icon"）：
    // 句子与新建页同一批（i18n 的 tips 池），小黄点颜色仍由 palette.TIP_DOT 从 style 递进来。
    tips: [],
    tipIdx: 0,
    tipDotStyle: `background:${TIP_DOT}`,
    // 小黄点仍由 palette.TIP_DOT 从 style 递进来（wxss 里不许抄饱和色）。
    // 「置顶」那枚下面一条短黄杠用的 --tip 自定义属性随置顶一起撤了：
    // v19 两枚 tab 选中那枚下面的短杠吃墨色，走 var(--text-primary) 就够。
    // 头部那一列数字：只有「笔记」。v18 做减法把「分享」「种草」两列撤了
    // （那两列是给分享/种草两屏回看用的，那两屏不做）。值仍来自 /api/user/quota，本页不自己相加。
    stats: [],
    // v19 这一屏的两枚 tab：'list' = 笔记列表（默认那一枚），'cards' = 笔记卡片。
    // 这是视图态，不落本机——他原话"默认第一个 tab"，每次进这一屏都从第一枚起。
    view: 'list',
    // 两枚 tab 各自画的那两批，都由 arrange() 从同一份 notes 现算（同一份序、同一份筛选）
    rows: [],
    cells: [],
    // 私密笔记：本会话里已经验过密码就不再重问
    _privateVerified: false,
    // 点一枚纸片 / 一行 = 直接浮详情窗（v18 两档排布都不就地展开，理由见 onRowTap）
    detailOpen: false,
    detailNote: null,
    shared: false,
    origOpen: false,
    // v22（站长 10-03）：详情窗右上那一格读这篇在本机台账里留过的卡片，
    // ‹ i/n › 由 detailCardIdx 指当前那一张；一篇一张时不画那一行（与卡片那一屏同一条口径）。
    detailCards: [],
    detailCardIdx: 0,
    // 「显示更多」要把正文滚到原文那一段，靠 scroll-into-view 换值才真会滚
    dsTo: '',
    // v7 ④⑤：模板独浮弹窗——拉它时详情窗整个藏掉，页面上只留这一个浮层
    templateOpen: false,
    posterNote: null,
    posterTpl: '',
    // 弹窗底部那一排圆点：每套模板一枚，颜色吃分类那同一套色板（toneColor），
    // 谁被选中由 wxml 现比 posterTpl，所以换模板时不用再 setData 一次这个数组。
    tplIds: [],
    posterImagePath: '',
    posterW: 750,
    posterH: 900,
    // 藏起来的画布那一格：永远等于海报本身，不跟着弹窗的展示框走
    canvasW: poster.W,
    canvasH: 750,
    posterBusy: false,
    // 微信那个五枚按钮的图片面板压不住自己半透明的底，能压的是它底下这一页（见 onSavePoster）
    shareDim: false,
    // 弹窗里那个二维码开关：只影响这一张成品图，与海报页同一条语义
    noQr: false,
    // 搜索条那一块面不再是一支固定蓝，而是由当前壁纸的页面底派生（palette.chromeOf）。
    // data 字面量里这一次是模块加载时算的，主题还没落地，所以按 default 走——
    // 和 themeOf 拿不到 key 时回落 THEMES[0] 是同一条规则，不是另写一份兜底色。
    searchSkin: chromeOf().style,
    // 头部那一段铺不铺图：'' 表示不铺（用户在外观设置里关掉了，或形象文件被系统清了）。
    // 取图和新建页同一个口，不在这页另开一份判断。
    bgSrc: '',
    // 淡底方形左上角那枚品牌字，与海报上无形象时的占位字是同一个常量（poster.BRAND_GLYPH）
    brandGlyph: poster.BRAND_GLYPH,
    // 右上那枚淡底方形的底：每次进页跟着壁纸重算（见 paleStep 那条规则）
    swatchBg: paleStep('default'),
    // 头部那张图的摆法，由 fitHead() 问过图片尺寸之后现算（同一套数在 poster.bandGeom）
    imgStyle: '',
    // 详情窗那一态要把同一张图铺满整屏（站长 10-03："形象图贯穿，与其他页面保持风格统一"），
    // 盒子高换成 webview 实测高，算法与锚点仍是 bandGeom 那一条，不分第二条公式。
    imgStyleThru: '',
    // 背景深浅那一档：初值给中档（站长 10-02 夜里定的默认档，也是 app.bgSkin() 在本机读不到
    // 键时回落的那一档），免得第一帧先闪一下别的深浅。三样每次进页由 app.bgSkin() 重读。
    dimV: 1,
    dimDot: '',
    dimScrim: '',
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
      // 两枚 tab 每次进这一屏都回到第一枚（他原话"默认第一个 tab"），不是本机偏好；
      // 卡片那一格的台账在下面 loadNotes 里重读，从详情窗出完图回来就能看到新那一张。
      view: 'list',
      // Tips 跟着语言整批换（英文态不能看到那六句中文），并从第 1 句起重播。
      tips: this.tipsFor(lang),
      tipIdx: 0,
      // 深浅每次进页重读：在首页那枚点上换过档，回到这一屏头部就该跟着沉或跟着亮。
      ...app.bgSkin(),
      // 搜索条那一块面由当前壁纸的页面底派生（palette.chromeOf），和底部导航那条胶囊同一个值；
      // 每次进页重算，留着 data 字面量那份就等于永远停在米白那一档。
      // 但铺了图就整串不发：style 上的自定义属性优先级高于任何选择器，
      // 带着它，CSS 里那条"图上换成纸白面"的规则一行都翻不动。
      searchSkin: bgSrc ? '' : chromeOf(wallpaper).style,
      // 右上那枚淡底方形跟着壁纸走（象牙 #EAE0CE / 天青 #DDE7DF / 其余从窗口纸白掺 8% 墨）
      swatchBg: paleStep(wallpaper),
    })
    // 三个 tab 的导航条标题统一成应用名（站长 10-01 晚）：原来这一页是「图麦笔记」、
    // 新建页是「新建笔记」、「我的」页是「我的」，顶上跳来跳去读起来像三个应用。
    // 页面里本来就有左上角那行大字说"这是哪一页"，导航条不必再报一遍。
    app.setNavTitle('appName', lang)
    this.fitHead(bgSrc)
    app.applyNavForBand(this.data.bgSrc)
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateLabels()
      this.getTabBar().applyTheme(app.getWallpaper())
      this.getTabBar().setData({ selected: 1 })
    }
    this.loadCategories()
    this.loadQuota()
    this.startTips()
    // onShow 每次切回该 tab 都会触发，必须 reset：否则非 reset 分支会把结果追加到旧列表上，
    // 同一条笔记被贴两遍。
    this._closeFloats()
    this.loadNotes(true)
  },

  // 头部那一行的轮播 Tips：句子和新建页同一批（i18n 的 tips 池），这里只管取和切。
  // 效果图那一行不带「Tips：」前缀——这一行右边还有三枚 icon，可用宽只剩 20 个汉字，
  // 前缀那五个字符会把句子本身吃掉。
  tipsFor(lang) {
    const arr = t('tips', lang)
    return Array.isArray(arr) ? arr : []
  },

  // 一句停 8 秒，和新建页同一档（他 10-01 晚：4 秒"还没看完就跳下一条了"）。
  // 定时器挂在实例上、不进 data：它是节奏不是状态。
  startTips() {
    this.stopTips()
    const n = this.data.tips.length
    if (n < 2) return
    this._tipTimer = setInterval(() => {
      this.setData({ tipIdx: (this.data.tipIdx + 1) % n })
    }, 8000)
  },

  // 离开这一屏就停：这一屏不再渲染，表还在跑就是白耗电，回来时第一句也会是随机某一条。
  stopTips() {
    if (this._tipTimer) {
      clearInterval(this._tipTimer)
      this._tipTimer = null
    }
  },

  onHide() {
    this.stopTips()
  },

  onUnload() {
    this.stopTips()
  },

  // 头部那张图的取景：先问出图片真实尺寸，再按「我的」页那套数摆（poster.bandGeom，
  // 按宽铺满、往上顶 15% 留头顶空间）。原来这里只是裸 aspectFill 塞进 750x542，
  // 同一个人在这页成了大特写、在「我的」页是半身——站长 10-01 真机对出来打回的。
  // 问不到尺寸就退回 aspectFill 的默认居中，不猜。
  fitHead(src) {
    if (!src) { this.setData({ imgStyle: '', imgStyleThru: '' }); return }
    wx.getImageInfo({
      src,
      success: (info) => this.setData({
        imgStyle: poster.bandGeom(info.width, info.height),
        imgStyleThru: poster.bandGeom(info.width, info.height, this._webviewH()),
      }),
      fail: () => this.setData({ imgStyle: '', imgStyleThru: '' }),
    })
  },

  // webview 自己有多高（rpx）：样式里写的是 rpx，getWindowInfo 回的是 px，
  // 换算那一次与 _tplBoxRpx 同一条式子。头部铺满整屏时盒子高就是它，不猜机型。
  _webviewH() {
    const wi = wx.getWindowInfo()
    return Math.round((wi.windowHeight * 750) / wi.windowWidth)
  },

  // 下拉刷新：人停在列表页不动时 onShow 不会再触发，采集在后台完成的那条就一直不出现。
  // 三趟一起等完再收菊花，否则下拉框还转着、列表已经换了一批，看着像没刷出来。
  async onPullDownRefresh() {
    this._closeFloats()
    try {
      await Promise.all([this.loadCategories(), this.loadQuota(), this.loadNotes(true)])
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  // 顶部那三列一次读回来：/api/user/quota 一趟给 used / shares_active / saved_by_users。
  // 不再自己数列表那一趟（它被搜索词和分类筛过，数出来的是"当前筛出的条数"），也不再
  // 读 100 条去凑总数——那趟读法撞得到 100 的显示上限，而这两个数本来就是服务端算好的状态量：
  // 客户端拿不到原始台账，也就没有"自己开关一下把数字刷大"这条路。
  async loadQuota() {
    const lang = this.data.lang
    try {
      const q = await api.getQuota()
      // 后端没部署到带这个字段的版本时读到的是 undefined——站长 10-01 拍板：画 0。
      // 早先那版画「—」的理由是"0 是假话"，他把这一条翻过来了：这一格是给人看的进度，
      // 空着或画杠读起来像坏了。所以这一档的口径是"读不到就当还没有"，不是"读到了 0"。
      const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0)
      this.setData({ stats: [{ key: 'notes', n: n(q.used), l: t('statNotes', lang) }] })
    } catch (err) {
      // 这个数是装饰，拿不到就整块不显示，绝不能把列表一起拖挂
      console.error('加载那一列数字失败', err)
      this.setData({ stats: [] })
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
      if (this.data.notes.length) {
        const notes = this.skin(this.data.notes)
        this.setData({ notes, ...this.arrange(notes) })
      }
    } catch (err) {
      console.error('加载分类失败', err)
    }
  },

  skin(notes) {
    const nameOf = {}
    // 分类色仍按 V2 那套派生（详情窗里那几枚标签和要点序号吃 --cat-ink/--cat-dot/--cat-chip）。
    // 纸片墙那一族莫兰迪（paperSkinFor）与「已分享」那一小块（SHARED_TAG）随 v19 一起撤了：
    // 列表不再按分类铺底色，状态标记也不在列表上画——公不公开只在详情窗下沿那一句里说。
    this.data.categories.forEach((c) => { nameOf[c.id] = c.name })
    const wallpaper = getApp().getWallpaper()
    notes.forEach((n) => {
      const s = catSkinFor(n.category_id, wallpaper)
      // --cat-chip 只给详情窗里的那几枚标签当底色（分类色 12% 铺在纸白卡上）。
      n.catStyle = `--cat-dot:${s.dot};--cat-ink:${s.text};--cat-chip:${withAlpha(s.dot, 0.12)}`
      // 昵称那一格只在"这篇是别人那儿转存来的"时出现（②）。判据用 source_type，
      // 不用"有没有昵称"——自己分享出去的那篇，服务端那份快照是自己的名字，
      // 画在自己那一行上是噪声。
      n.is_import = n.source_type === 'share_import'
      n.who = n.is_import ? (n.share_author_name || '') : ''
      // 私密判据：分类名等于"私密"。跟后端 get_note、录入侧那道拦截是同一条口径（utils/privateGate.js）。
      n.is_private = isPrivate(nameOf[n.category_id])
    })
    return notes
  },

  /* v19 的两批屏：两枚 tab 读同一份 notes，所以序、筛选、翻页天然同源（他那句"排列的顺序
     与笔记列表排序一致"就是这么成立的）。
     · rows = 笔记列表那一屏。一行一条，左列只有日期（MM/DD，现网 formatShortDate）+ 一枚
       小黄点，右列标题 / 摘要 /「显示更多」。摘要真放不下三行才画「显示更多」（效果图
       那一屏第三条就只有两行、没有那枚蓝字，他认的就是这一版）；放不下多少由下面那对
       常量估，标题与摘要本身都交给 CSS 截（标题一行省略号、摘要三行折完）。
     · cells = 笔记卡片那一屏。只有本机台账里有图的那几篇才进；一格一篇，格里的 ‹ i/n ›
       由 cur 指当前那一张，n 是这篇留过档的张数。
     ⚠ 只能由调用方把 notes 当参数递进来：setData 不是同步生效的，同一个 setData 里现读
     this.data 算到的还是上一批（v18 那轮实测过）。 */
  arrange(notes) {
    const rows = notes.map((n, i) => {
      const s = n.summary || ''
      return {
        i, id: n.id, title: n.title, tail: n.date_label, who: n.who, summary: s,
        more: s.replace(/\s/g, '').length > SUM_LINES * SUM_CHARS,
      }
    })
    const cells = []
    notes.forEach((n, i) => {
      const list = this._cardsOf(n.id)
      if (!list.length) return
      cells.push({ i, id: n.id, title: n.title, cards: list, cur: 0 })
    })
    // 两批都现算：切到卡片那一枚时台账可能刚被详情窗里那次出图改过，
    // 而这一屏每次数据动过都会重算，不需要额外的脏标记。
    return { rows, cells }
  },

  // 台账里这一篇留过的卡片，一律按"留下来的先后"倒序——最新那张排第一。
  // 卡片那一屏的 cells 与详情窗右上那一格都走这一个口，两处不再各排各的：
  // 顺着放就会拿"最早那一张"当封面，站长 10-03 报的"小图跟大图完全不匹对"就是这个错位。
  // 文件已经不在的那一条不列：账在本机 storage 里，图在应用私有目录，系统清缓存能只清掉图
  // （首页那张形象图同一处理，见 bgSrc 那一条）。指过去就是一块白板，看着像卡片坏了，
  // 宁可退回空态那一格让人重新出一张。10-03 模拟器实测到这一态：src 递到了、文件不在。
  _cardsOf(noteId) {
    const fm = wx.getFileSystemManager()
    const alive = (p) => { try { fm.accessSync(p); return true } catch (e) { return false } }
    return (cardLog.forNote(noteId) || [])
      .filter((x) => x && x.p && alive(x.p))
      .slice()
      .sort((x, y) => (y.at || 0) - (x.at || 0))
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
        // 左边那一列只有这一档：MM/DD（年份在这条上没用，跨年看详情窗那一行完整日期）
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
        // 两批屏跟着数据走：追加一批、筛一个分类、搜一个词都重算一遍（一次 setData 交出去）
        ...this.arrange(allNotes),
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

  onOpenSearch() {
    this.setData({ searchOpen: true })
  },

  // 搜索条收在分类那一行里（09-30 v8，站长："搜索条目前看起来太大，不美观"）。
  // 展开时 `focus="{{searchOpen}}"` 直接把键盘带起来。
  // 站长 10-03 改口（原来那条"缩回不清词"作废）：点条子以外的**真空白**就是退出搜索——
  // 条子收回、关键字清掉、列表重拉回未搜的状态。不这么做的话条子一收，
  // 下面还挂着上一次的结果，看着像没退出来。
  // 点中某条笔记或某一枚分类不算"点空白"：那两处在自己的 handler 里收条子、词留着
  // （icon 那枚亮着表示词还在，✕ 仍是就地清词的口）。
  onBlankTap() {
    if (!this.data.searchOpen) return
    this.setData({ searchOpen: false, searchKeyword: '' })
    this.loadNotes(true)
  },

  // 挂在展开的条子上专门挡冒泡：条子里头（包括输入框右边那片空白）的点击
  // 不该被当成"点了条以外的空白"。
  noop() {},

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
    // 同 onRowTap：分类是 catchtap，收条子但不清词，于是这一次筛的是"结果里再挑这一类"。
    if (this.data.searchOpen) this.setData({ searchOpen: false })
    const id = e.currentTarget.dataset.id
    this.setData({ selectedCategory: id === null ? null : parseInt(id) })
    this._closeFloats()
    this.loadNotes(true)
  },

  // 列表区顶上那两枚 tab：只换视图，不重新拉数据——数据没变，变的是这一屏画哪一批。
  // 也不落本机（他原话"默认第一个 tab"），所以这一枚点了只管这一次停留。
  // 详情窗浮着的时候这两枚被盖得严严实实，点不到，也就不用在收窗上做文章。
  onViewTap(e) {
    const view = e.currentTarget.dataset.view
    if (view === this.data.view) return
    this.setData({ view })
  },

  // 卡片那一格第二行的 ‹ i/n ›：左右各一次点击换一张，走到头就点不动、不循环
  // （与模板弹窗那十套同一做法）。只动这一格的 cur，两批屏都不重算。
  // catchtap 挂在两枚箭头上：它们在这一格里，不该被当成"点了这一篇"而浮详情窗。
  onCardStep(e) {
    const { k, step } = e.currentTarget.dataset
    const c = this.data.cells[k]
    if (!c) return
    const next = c.cur + Number(step)
    if (next < 0 || next >= c.cards.length) return
    this.setData({ [`cells[${k}].cur`]: next })
  },

  // v19：两枚 tab 那两批屏都不就地展开——点一行 / 点一格 = 直接浮详情窗。
  // 列表那一行只给三行摘要的位置，就地展开会把下面那条顶歪、也把「显示更多」那枚的出口废掉；
  // 摘要全文、要点、原文本来就在详情窗里。卡片那一格同理：白垫是固定一档，塞不下正文。
  // 私密笔记进门前先验密码（会话里验过一次就不再问），密码不对既不开窗也不重载。
  async onRowTap(e) {
    // 行是 catchtap：它不该被当成"点了空白"（那样会把关键字一起清掉）。
    // 但条子要收——收起来正好把结果让给这一屏。词留着，✕ 才是清词的口。
    if (this.data.searchOpen) this.setData({ searchOpen: false })
    const idx = e.currentTarget.dataset.idx
    const note = this.data.notes[idx]
    if (!note) return
    if (!note.is_private || this.data._privateVerified) { this._openDetail(idx); return }
    const ok = await this._promptPrivatePassword()
    if (!ok) return
    this.setData({ _privateVerified: true })
    // 验完密码重取列表：服务端锁着的时候私密笔记那行的 summary 是裁掉的，
    // 不重取的话窗里没有摘要，看着像"这篇没有概要"。
    // 重取会整表重排，所以按 id 把行号找回来再开窗。
    await this.loadNotes(true)
    const at = this.data.notes.findIndex((n) => n.id === note.id)
    if (at >= 0) this._openDetail(at)
  },

  // v7 ③：详情浮窗。列表项身上那些派生字段（分类色、来源、日期）这一屏早就算好了，
  // 直接拿来当开窗的第一帧；窗里多出来的三块（核心要点、来源链接、原文）只有详情接口有，
  // 所以再取一次全文。取失败不拦窗——列表上有的那几块照样能看，只是窗里没有要点和原文。
  // 私密笔记照取：进展开态那一步已经验过密码，窗里的要点和原文本来就该看得见。
  async _openDetail(idx) {
    const row = this.data.notes[idx]
    if (!row) return
    this.setData({
      detailOpen: true, detailNote: row, origOpen: false, shared: false,
      detailCards: this._cardsOf(row.id), detailCardIdx: 0, dsTo: '',
    })
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
  // 行号一指错，浮着的窗就成了别人的笔记，所以先把窗口收掉。
  _closeFloats() {
    if (this.data.detailOpen) this.setData({ detailOpen: false })
  },

  onCloseDetail() {
    this.setData({ detailOpen: false, dsTo: '' })
  },

  // 右上那一格左右那两枚：换这篇留过的下一张 / 上一张，走到头不循环（与卡片那一屏同一条口径）。
  onSheetCardStep(e) {
    const list = this.data.detailCards
    if (list.length < 2) return
    const next = this.data.detailCardIdx + Number(e.currentTarget.dataset.step)
    if (next < 0 || next >= list.length) return
    this.setData({ detailCardIdx: next })
  },

  // 「显示更多」（站长 10-03：第一屏要有个口，点了能跳到下面看原文）：
  // 展开原文并把正文滚到那一段；已经展开就收回去、滚回顶上。
  // 原来挂在「原文内容」那一行右边那枚 展开/收起 撤掉了——同一个功能不留第二个把手。
  onSheetMore() {
    if (this.data.origOpen) { this.setData({ origOpen: false, dsTo: 'ds-top' }); return }
    this.setData({ origOpen: true })
    // 原文那一块是展开之后才占高度的，先让它排一帧再指过去，否则滚过去的位置是旧的
    setTimeout(() => { if (this.data.origOpen) this.setData({ dsTo: 'ds-orig' }) }, 60)
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

  // 详情窗下沿 dock 的三个动作 + 那行公开状态（v19：「置顶」那一枚随这一屏的置顶一起撤了，
  // 独立详情页 pages/detail 那枚也在 10-03 跟着撤净——字典里 pin/unpin/pinned 三串一起删了，
  // 服务端那个 is_pinned 与 /pin 接口还在，只是客户端再没有写它的路径）。
  onSheetEdit() {
    const note = this.data.detailNote
    if (!note) return
    // 改完回来 onShow 会重载列表，窗留着就是读旧内容，所以出门前把窗收掉。
    this.setData({ detailOpen: false })
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
          cardLog.dropNote(note.id)
          wx.showToast({ title: t('deleteSucceeded', lang), icon: 'success' })
          this.setData({ detailOpen: false })
          this.loadNotes(true)
          this.loadQuota()
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

  // v7 ④：出卡片这一个动作 = 详情窗整个藏掉、只浮模板预览这一个弹窗（两层不叠）。
  // 所以关掉弹窗后回来的是详情窗、里面内容还是这篇。
  // v22（站长 10-03）：入口从底排那枚按钮挪到右上那一格（有卡片就是那张缩略图，
  // 一张都没有就是那枚淡底方形），底排不再留第二个把手。
  async onSheetToPoster() {
    const note = this.data.detailNote
    if (!note || note.is_private) return
    const profile = poster.posterProfile()   // avatarPath 这一栏要现算，见 poster.js
    this.setData({
      detailOpen: false,
      templateOpen: true,
      posterNote: note,
      posterTpl: profile.template || poster.DEFAULT_TEMPLATE,
      tplIds: poster.TEMPLATES.map((x, i) => ({ id: x.id, color: toneColor(i) })),
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

  // 弹窗里那一格实际能给多大，只有量了才知道：十套模板的 plan.height 各不相同，
  // 而浮窗是 top 130 / bottom 192 跟着屏高走的，同一套模板在不同机型上可视高也不一样。
  // boundingClientRect 回的是 px，而样式里写的是 rpx，所以拿 windowWidth 换算一次。
  async _tplBoxRpx() {
    const rect = await new Promise((resolve) => {
      wx.createSelectorQuery().select('.tpl-body').boundingClientRect((r) => resolve(r)).exec()
    })
    if (!rect || !rect.width || !rect.height) return null
    const toRpx = (px) => px * 750 / wx.getWindowInfo().windowWidth
    // 左右各 24rpx 的 padding，和下面那一排圆点（16 上间距 + 16 当前那枚的直径）
    return { w: Math.round(toRpx(rect.width)) - 48, h: Math.round(toRpx(rect.height)) - 32 }
  },

  // 与 share.js render() 同一套：先量后画、canvas 尺寸切两次、paintLayers 落笔、canvasToTempFilePath 出成品。
  // 画布藏在 left:-9999rpx 位置、不进 fixed，弹窗里只放成品 <image>——绕开 canvas-in-fixed 那条历史坑。
  async _renderPoster() {
    const a = this._posterAssets
    if (!a) return
    const lang = this.data.lang
    const profile = poster.posterProfile()   // avatarPath 这一栏要现算，见 poster.js
    const canvas = await this._getCanvas()
    const ctx = canvas.getContext('2d')
    const images = { qr: await poster.loadImage(canvas, a.qrPath, 3000) }
    const avatar = poster.cardPath()
    if (avatar) images.avatar = await poster.loadImage(canvas, avatar, 5000)
    canvas.width = poster.W
    canvas.height = 750
    const plan = poster.planPoster(ctx, a.note, this.data.posterTpl, profile, lang, { showQr: !this.data.noQr })
    // 成品外圈那一档纯黑只加在这里（MATTE 见 poster.js）：微信的图片面板是全黑底，
    // 卡片直边贴上去像被裁了一半。外圈跟着一起出，弹窗里预览到的就是递出去的那张。
    const outW = plan.width + poster.MATTE * 2
    const outH = plan.height + poster.MATTE * 2
    canvas.width = outW
    canvas.height = outH
    // 画布那一格永远等于成品本身（含上面那圈黑），不跟着展示框走：
    // 出的是 750 + 40×2 = 830 宽的一张，而不是"缩到弹窗里那么大"的那张。
    this.setData({ canvasW: outW, canvasH: outH })
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, outW, outH)
    ctx.save()
    ctx.translate(poster.MATTE, poster.MATTE)
    poster.paintLayers(ctx, plan.layers, images)
    ctx.restore()
    // 展示框按海报自己的比例算，宽和高吃同一个 scale——分开定就会变形。
    const box = await this._tplBoxRpx()
    if (box) {
      const scale = Math.min(1, box.w / outW, box.h / outH)
      this.setData({
        posterW: Math.round(outW * scale),
        posterH: Math.round(outH * scale),
      })
    }
    const tmpPath = await new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({ canvas, fileType: 'png', success: (r) => resolve(r.tempFilePath), fail: reject }, this)
    })
    // 这张画布留着：人真留下这张时要拿它现出一张小图进台账（见 _keepPoster 与 utils/cardLog.js）。
    this._posterCanvas = canvas
    this.setData({ posterImagePath: tmpPath, posterBusy: false })
  },

  // 「生成过卡片」这本账记在这里——人真把这张留下来的那一刻：微信图片面板发出去（真机那条路），
  // 或者存进相册成功（开发者工具里面板一定 fail，走的就是这条）。
  // 不记在画布落图那一步：打开弹窗、每滑一次模板、每开关一次码都会重画一次，那样一篇能记出五张。
  async _keepPoster() {
    const a = this._posterAssets
    if (!a || !this._posterCanvas) return
    await cardLog.record(a.noteId, this.data.posterTpl, this._posterCanvas, this)
    this.setData(this.arrange(this.data.notes))
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
      // 刚刚真留下来的那张要立刻出现在右上那一格（台账是 _keepPoster 里写的），
      // 并把指针对到第一张——倒序之后第一张就是最新那张。
      detailCards: note ? this._cardsOf(note.id) : [],
      detailCardIdx: 0,
    })
    // 生成海报这一步已经把这篇的码建出来了，公开状态得跟着刷新，
    // 否则详情窗里那行「已经公开」永远不显示。
    if (note) this._loadShareStatus(note.id)
  },

  onCancelTemplate() { this._closeTemplate() },
  onHandleTap() { this._closeTemplate() },

  // 站长 10-01：账号认证下来了，图片分享能力可以接。这枚按钮从"存进相册"换成弹微信那个
  // 五枚一排的图片面板（发送给朋友 / 分享到朋友圈 / 收藏 / 保存图片 / 转发为贴图），存和发一次给完。
  // 这个面板只在真机有——开发者工具里一定 fail，所以那条路退回"直接存相册"，不让人白点一次。
  // 站长 10-02 iPhone 11：面板自己是半透明的底，我们那一页（弹窗、取消/保存并分享、底栏、
  // 另一张码）全从它背后透出来，看着杂乱无章。面板那层压不住（微信的），能压的只有它底下这一页：
  // 拉起之前先整屏盖成纯黑，面板一收（成功、取消、失败三条口都走 complete）就把这层撤掉。
  onSavePoster() {
    const path = this.data.posterImagePath
    if (!path) return
    this.setData({ shareDim: true })
    wx.showShareImageMenu({
      path,
      success: async () => { await this._keepPoster(); this._closeTemplate() },
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        if (msg.indexOf('cancel') >= 0) return
        this._saveToAlbum()
      },
      complete: () => this.setData({ shareDim: false }),
    })
  },

  _saveToAlbum() {
    if (!this.data.posterImagePath) return
    const { lang } = this.data
    wx.saveImageToPhotosAlbum({
      filePath: this.data.posterImagePath,
      success: async () => {
        await this._keepPoster()
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

  // v12：列表不再整页滚，Page.onReachBottom 这一辈子都不会再触发，
  // 取下一批改挂在 scroll-view 的 bindscrolltolower 上。
  onListToLower() {
    this.onLoadMore()
  },
})
