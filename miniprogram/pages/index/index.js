const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { catSkinFor, chromeOf, toneVars, toneColor, withAlpha, paperSkinFor, SHARED_TAG, TIP_DOT } = require('../../utils/palette.js')
const poster = require('../../utils/poster.js')
const { isPrivate } = require('../../utils/privateGate.js')
const { formatShortDate, formatDateTime, formatYearMonth } = require('../../utils/date.js')

const SOURCE_TYPE_KEYS = {
  wechat_article: 'sourceWechatArticle',
  web_article: 'sourceWebArticle',
  screenshot: 'sourceScreenshot',
  manual: 'sourceManual',
  // 转存别人分享的那一篇。这一支以前漏在表外：source_type 是 'share_import' 的行
  // 查不到键就直接把英文原文写到屏上了（站长 10-02 对 v18 时撞见）。字典里那串早就有。
  share_import: 'sourceShareImport',
}

/* v18 纸片墙的排布常量（1rpx 一比一照效果图那套数抄，见 docs/design/10-02三视图与背景亮度/画-v18.mjs）。
   一枚纸片 150×200：横向步 142 只压掉右边那 14 的内白、标题一个字都不遮；
   纵向步 176 压掉底边 24，日期抬到 bottom:30 正好躲开那 24。
   一行模式一条 88（撤了横线，只靠行高分）；月与月之间空 56。 */
const PER = 4
const XS = 142
const YS = 176
const NOTE_H = 200
const GROUP_GAP = 56
const ROW_H = 88
const JOG = [0, 10, 4, 13]     // 每行四枚各自的竖向错位
const TILT = [-2.2, 1.6, -1.1, 2.4]  // 和倾角——不像贴出来的方阵
const LIST_MODE_KEY = 'listMode'
const dayKey = (iso) => (iso || '').slice(0, 10)
const monthKey = (iso) => (iso || '').slice(0, 7)
const cut = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : s || '')

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
    // 「置顶笔记」选中那枚下面的短黄杠画在 ::after 上，递不进 style，
    // 所以这一档改走自定义属性：色值仍只从 palette.TIP_DOT 出，WXSS 里只写 var(--tip)。
    tipVarStyle: `--tip:${TIP_DOT}`,
    // 头部那一列数字：只有「笔记」。v18 做减法把「分享」「种草」两列撤了
    // （那两列是给分享/种草两屏回看用的，那两屏不做）。值仍来自 /api/user/quota，本页不自己相加。
    stats: [],
    // v18 列表这一屏：纸片墙 / 一行两种排布 + 「只看置顶」那一档，都是本机偏好与视图态
    listMode: 'desk',
    pinnedOnly: false,
    // 排布算完的结果（月份分组、每枚纸片的坐标与倾角、时间轴上那个月的位置）
    groups: [],
    stageH: 0,
    // 私密笔记：本会话里已经验过密码就不再重问
    _privateVerified: false,
    // 点一枚纸片 / 一行 = 直接浮详情窗（v18 两档排布都不就地展开，理由见 onRowTap）
    detailOpen: false,
    detailNote: null,
    shared: false,
    origOpen: false,
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
    // 头部那张图的摆法，由 fitHead() 问过图片尺寸之后现算（同一套数在 poster.bandGeom）
    imgStyle: '',
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
      // 排布那一档是本机偏好（纸片墙 / 一行），没存过就走 v18 的默认：纸片墙。
      // 每次进页重读，和深浅那一档同一做法——在别的入口改过，回到这一屏就得跟着变。
      listMode: wx.getStorageSync(LIST_MODE_KEY) === 'rows' ? 'rows' : 'desk',
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
    if (!src) { this.setData({ imgStyle: '' }); return }
    wx.getImageInfo({
      src,
      success: (info) => this.setData({ imgStyle: poster.bandGeom(info.width, info.height) }),
      fail: () => this.setData({ imgStyle: '' }),
    })
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
        this.setData({ notes, ...this.layout(notes) })
      }
    } catch (err) {
      console.error('加载分类失败', err)
    }
  },

  skin(notes) {
    const nameOf = {}
    const posOf = {}
    // 纸片吃哪一枚莫兰迪由"这个分类在分类表里排第几"决定（见 palette.paperSkinFor 那段注释），
    // 所以这里要的是序号，不是 id。序号从 1 起（0 那一档留给未分类）。
    this.data.categories.forEach((c, i) => { nameOf[c.id] = c.name; posOf[c.id] = i + 1 })
    const wallpaper = getApp().getWallpaper()
    notes.forEach((n) => {
      // 分类色仍按 V2 那套派生（详情窗里那几枚标签和要点序号吃 --cat-ink/--cat-dot/--cat-chip）。
      const s = catSkinFor(n.category_id, wallpaper)
      // --cat-chip 只给详情窗里的那几枚标签当底色（分类色 12% 铺在纸白卡上）。
      n.catStyle = `--cat-dot:${s.dot};--cat-ink:${s.text};--cat-chip:${withAlpha(s.dot, 0.12)}`
      // v18 纸片墙那一枚的底色：吃莫兰迪那一族（palette.PAPERS），不吃行卡那套饱和分类色——
      // 一枚 150rpx 见方的纸片整块铺饱和色会抢掉标题。唯一出口在 palette，这里只递字符串。
      const p = paperSkinFor(n.category_id == null ? 0 : posOf[n.category_id])
      n.paperStyle = `background:${p.bg};color:${p.ink}`
      // 「已分享」是一屏上唯一一种状态标记（站长 10-02：其他状态什么都不画）。
      // 判据是服务端那两样新字段之一：此刻有没有一张开着的码——撤回之后当场就不画了。
      n.shared = !!n.has_active_share
      n.sharedStyle = `background:${SHARED_TAG.bg};color:${SHARED_TAG.ink}`
      // 昵称那一格只在"这篇是别人那儿转存来的"时出现（②）。判据用 source_type，
      // 不用"有没有昵称"——自己分享出去的那篇，服务端那份快照是自己的名字，
      // 画在自己纸片上是噪声。
      n.is_import = n.source_type === 'share_import'
      n.who = n.is_import ? (n.share_author_name || '') : ''
      // 私密判据：分类名等于"私密"。跟后端 get_note、录入侧那道拦截是同一条口径（utils/privateGate.js）。
      n.is_private = isPrivate(nameOf[n.category_id])
    })
    return notes
  },

  /* v18 的排布：把这一屏的笔记算成"月—行—枚"三层坐标（算法照效果图那份 lay()/geom() 抄，
     数从上面那组常量来，不在 wxss 里再写一份）。
     三条硬规矩是站长 10-02 第三轮定的：同一日期必在同一行、一行满 4 枚往下一行续、
     不同日期一定另起一行。服务端那一份是"置顶优先 + 时间倒序"，同一天可能被别的日期
     插在中间，所以先按天聚堆再排行。z 取整（1 + y/10 出 18.6 这种值会被整条丢掉，
     丢掉之后只有第一行拿到 z-index，反倒盖住后面所有行——效果图那轮真踩过）。
     ⚠ mode / pinned 只能由调用方当参数递进来：setData 不是同步生效的，同一个 setData 里
     现读 this.data 算到的还是切之前那一档（模拟器实测：切「一行」后月档高仍是墙的 552、
     点「只看置顶」屏上枚数仍是全部 4 篇）。 */
  layout(notes, mode = this.data.listMode, pinned = this.data.pinnedOnly) {
    const at = new Map()
    notes.forEach((n, i) => at.set(n.id, i))
    const src = pinned ? notes.filter((n) => n.is_pinned) : notes
    const gs = []
    // 月份也按"聚堆"切，不按连续成段切（和下面那一天一行的规矩是同一件事）：
    // 服务端那份序是"置顶优先 + 时间倒序"，一篇九月的置顶会把十月那几篇插到它前面，
    // 按连续成段切就会在时间轴上画出 26/09 → 26/10 → 又一块 26/09（实测截图就是这个）。
    // 堆与堆的先后仍按各堆头一条在原序里的位置，所以置顶那篇还在它那一月最前面。
    const byMonth = new Map()
    src.forEach((n) => {
      const mk = monthKey(n.created_at)
      if (!byMonth.has(mk)) {
        byMonth.set(mk, { mk, ym: n.ym_label, cards: [] })
        gs.push(byMonth.get(mk))
      }
      byMonth.get(mk).cards.push(n)
    })
    let y = 0
    const groups = gs.map((g) => {
      // 先按天聚堆再排行：服务端那一份是"置顶优先 + 时间倒序"，同一天可能被别的日期
      // 插在中间（实测 09-25 / 09-23 / 09-30 / 09-25 就是这么来的），而硬规矩是
      // "同一日期必在同一行"。天与天的先后按各堆头一条在原序里的位置，堆内保持原序，
      // 所以置顶那篇仍然排在它那一天那一堆的最前面。
      const order = []
      const byDay = new Map()
      g.cards.forEach((n) => {
        const dk = dayKey(n.created_at)
        if (!byDay.has(dk)) { byDay.set(dk, []); order.push(dk) }
        byDay.get(dk).push(n)
      })
      const cells = []
      let row = 0
      let col = PER
      order.forEach((dk) => {
        const list = byDay.get(dk)
        list.forEach((n, k) => {
          if (k === 0) { if (cells.length) row += 1; col = 0 }   // 不同日期必另起一行
          else if (col >= PER) { row += 1; col = 0 }             // 同一日期满 4 枚往下一行续
          const c = col
          col += 1
          const jy = row * YS + JOG[c % PER]
          cells.push({
            i: at.get(n.id), id: n.id,
            // 纸片只有 122 宽，标题只留前 12 字；一行模式吃满横向字数，交 CSS 省略
            title: n.title, ptitle: cut(n.title, 12),
            tail: n.date_label,
            who: n.who, shared: n.shared, sharedStyle: n.sharedStyle, paperStyle: n.paperStyle,
            x: (c % PER) * XS, y: jy, r: TILT[c % PER], z: 1 + Math.round(jy / 10),
          })
        })
      })
      // 一个月那一档占多高：墙按行数算（行步 176 + 最后一枚自己的 200），
      // 一行模式按条数算（一条 88）。天数少的月份不会留下一段空白行。
      const h = mode === 'rows' ? g.cards.length * ROW_H : row * YS + NOTE_H
      const top = y
      y += h + GROUP_GAP
      return { mk: g.mk, ym: g.ym, top, h, cards: cells }
    })
    return { groups, stageH: Math.max(y - GROUP_GAP + 24, 0) }
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
        // 纸片角上那档是 MM/DD，时间轴那一列是 YY/MM（同一族极简写法，年份不重复第二遍）
        n.date_label = formatShortDate(n.created_at)
        n.ym_label = formatYearMonth(n.created_at)
      })
      this.skin(notes)
      
      const allNotes = reset ? notes : [...this.data.notes, ...notes]
      this.setData({ 
        notes: allNotes, 
        loading: false,
        loadingMore: false,
        hasMore: notes.length === limit,
        skip: skip + notes.length,
        // 排布跟着数据走：追加一批、筛一个分类、切一种排布都重算一遍（一次 setData 交出去）
        ...this.layout(allNotes),
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

  // 搜索条收在分类那一行里（09-30 v8，站长："搜索条目前看起来太大，不美观"）。
  // 展开时 `focus="{{searchOpen}}"` 直接把键盘带起来；点条子以外的任何空白就收回——
  // 包括点中某条笔记：那一行该开还是开，条子收起来正好把结果让出来。
  // 缩回不清词，清词是 ✕ 那一枚的活，两件事不捆在一起。
  onOpenSearch() {
    this.setData({ searchOpen: true })
  },

  onBlankTap() {
    if (this.data.searchOpen) this.setData({ searchOpen: false })
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
    const id = e.currentTarget.dataset.id
    this.setData({ selectedCategory: id === null ? null : parseInt(id) })
    this._closeFloats()
    this.loadNotes(true)
  },

  // 纸片墙 / 一行两枚切换 icon：这一档和壁纸、界面字体同一性质（本机偏好，不上服务器），
  // 换设备回到默认那一档就行。切完只重算排布，不重新拉数据——数据没变，变的是摆法。
  onToggleMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode === this.data.listMode) return
    wx.setStorageSync(LIST_MODE_KEY, mode)
    this.setData({ listMode: mode, ...this.layout(this.data.notes, mode) })
  },

  // 「置顶笔记」那一档钉在分类行的最左边，点它=只看置顶、再点=回正常显示。
  // 不新增接口：is_pinned 本来就在每行上，服务端也早就是置顶优先排。
  // 效果图上那句写的是"只看这两篇"，字典里改成不带数目的说法——置顶几篇是用户自己的事。
  onTogglePinned() {
    const next = !this.data.pinnedOnly
    this.setData({ pinnedOnly: next, ...this.layout(this.data.notes, undefined, next) })
    this._closeFloats()
  },

  // v18：两档排布都不就地展开——点一枚纸片 / 一行 = 直接浮详情窗。
  // 纸片只有 150×200，塞不下概要；一行模式的月份档是定高摆的（一组 n×88），
  // 就地展开会把下一组顶歪。摘要、要点、原文本来就在详情窗里。
  // 私密笔记进门前先验密码（会话里验过一次就不再问），密码不对既不开窗也不重载。
  async onRowTap(e) {
    const idx = e.currentTarget.dataset.idx
    const note = this.data.notes[idx]
    if (!note) return
    if (!note.is_private || this.data._privateVerified) { this._openDetail(idx); return }
    const ok = await this._promptPrivatePassword()
    if (!ok) return
    this.setData({ _privateVerified: true })
    // 验完密码重取列表：服务端锁着的时候私密笔记那行的 summary 是裁掉的，
    // 不重取的话窗里没有摘要，看着像"这篇没有概要"。
    // 重取会整表重排，所以按 id 把行号找回来再开窗（和置顶那条同一个做法）。
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
  // 行号一指错，浮着的窗就成了别人的笔记，所以先把窗口收掉。
  _closeFloats() {
    if (this.data.detailOpen) this.setData({ detailOpen: false })
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
  // 置顶会把这条挪到队列第一条，所以重载一次整屏重排；窗里那篇自己改标记就行。
  async onSheetPin() {
    const note = this.data.detailNote
    if (!note) return
    try {
      await api.pinNote(note.id, !note.is_pinned)
      wx.showToast({ title: note.is_pinned ? t('unpin', this.data.lang) : t('pin', this.data.lang), icon: 'success' })
      await this.loadNotes(true)
      this.setData({ 'detailNote.is_pinned': !note.is_pinned })
    } catch (err) {
      wx.showToast({ title: t('operationFailed', this.data.lang), icon: 'none' })
    }
  },

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

  // v7 ④：dock 的「转为笔记卡片」= 详情窗整个藏掉、只浮模板预览这一个弹窗（两层不叠）。
  // 列表那条保持展开，所以关掉弹窗后详情窗回来、里面内容还是这篇。
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
  // 而浮窗是 top 130 / bottom 152 跟着屏高走的，同一套模板在不同机型上可视高也不一样。
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
      success: () => this._closeTemplate(),
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

  // v12：列表不再整页滚，Page.onReachBottom 这一辈子都不会再触发，
  // 取下一批改挂在 scroll-view 的 bindscrolltolower 上。
  onListToLower() {
    this.onLoadMore()
  },
})
