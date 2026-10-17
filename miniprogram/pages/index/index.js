const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { catSkinFor, toneColor, withAlpha, TIP_DOT } = require('../../utils/palette.js')
const poster = require('../../utils/poster.js')
const cardLog = require('../../utils/cardLog.js')
const cardCloud = require('../../utils/cardCloud.js')
const cardInfo = require('../../utils/cardInfo.js')
const { isPrivate, needsUnlock, unlockOn } = require('../../utils/privateGate.js')
// 分类名那一档显示值：一句规则四处吃（列表、录入、详情、海报），口径写在文件头。
const { labelOf } = require('../../utils/catText.js')
// 私密解锁那一层六位密码面板的三个方法转给它（标记与皮三页共用，见 utils/pwdSheet.js 头）。
const pwdSheet = require('../../utils/pwdSheet.js')
const cloudUpload = require('../../utils/cloudUpload.js')
const { formatDate, formatDateTime, formatShortDate, formatWeekday } = require('../../utils/date.js')
const bgTone = require('../../utils/imgBrightness.js')

/* 深浅分两截判（站长 10-12 21:1x：「请按照上下部分来分别判断，避免全图平均，造成差异」）。
   取景盒是全站那一枚 `poster.HEAD_IMG_H`(740)、锚点 `poster.BG_ANCHOR`(15%)——与 fitHead 递给
   bandGeom 的是同一条，判的才是屏上真显示的那一截。
   上截 0~0.20＝头部那两行字自己那一小段（大字与右边那两个数都落在盒子 3%~12%，
   贴着字取才不会被中段空白把平均冲掉——同首页那一条规矩）；
   下截 0.73~1＝卡顶那 158 的白纱（两枚 tab＋返回、分类那一排，10-12 那两行固定字就在这一截）。
   ⚠ 搜索那一枚 icon 落在盒子 63% 那一处，吃的是上截这一档（它是描边不是字，没另开一档）。 */
const TONE_BOX = { boxH: poster.HEAD_IMG_H, anchor: poster.BG_ANCHOR }
function toneZones() {
  return Object.assign({}, TONE_BOX, { top: [0, 0.2], low: [0.73, 1] })
}
// 10-11：这一屏不再画那一位小人（站长「列表左上角的人都去掉，维持只有首页有」），
// 所以 `utils/person.js` 在这一页的 require 一并撤——首页那一屏仍在用它，别处不许跟着删。

/* 卡顶玻璃那一段要糊到多高（rpx）。= 头部 542 + 玻璃段超出头部的那 198（238 那段里被头
   部盖住的 40 已由 .sheet 的 margin-top:-40 抵掉）。与 index.wxss 里 `.head-scrim::after`
   的 top:100%／height:198、`.sheet` 那一条渐变的 158／198／238 是同一笔账。
   ⚠ 10-11 11:2x 起这一枚**不再递给 bandGeom**：照片的锚点盒高收成了全站唯一一枚
   `poster.HEAD_IMG_H`（同一个人两页必须同一个落点，否则切 tab 背景图上下跳，他抓过两次）。
   这一枚只留作本页那笔版式账，由 `验-玻璃令牌齐不齐` 钉它等于 542＋198。 */
const GLASS_BAND_H = 542 + 198

const SOURCE_TYPE_KEYS = {
  wechat_article: 'sourceWechatArticle',
  web_article: 'sourceWebArticle',
  screenshot: 'sourceScreenshot',
  manual: 'sourceManual',
  // 转存别人分享的那一篇。这一支以前漏在表外：source_type 是 'share_import' 的行
  // 查不到键就直接把英文原文写到屏上了（站长 10-02 对 v18 时撞见）。字典里那串早就有。
  share_import: 'sourceShareImport',
  // §8.232 新用户出生那一篇（服务端 source_type='preset'）。漏在表外的值会把英文原文写上屏（站长 10-02 撞过一次）。
  preset: 'sourcePreset',
}

/* 话术里那一个 {n}／{names}。做法与「我的」页那份 `fmt` 一模一样；
   没有把它提到 utils/i18n.js 去，是因为那一改要牵动几页共用的取键口，不属于这一轮。 */
function fmt(tpl, map) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (map && map[k] !== undefined ? String(map[k]) : m))
}

/* 10-17 列表合一（站长原话「合并笔记列表和卡片列表，只展示一个列表，就是围绕笔记本身，
   然后只显示笔记标题，右侧是笔记的配图，如果有就显示，没有不显示」）：
   v19 那两枚 tab 与卡片那一屏整块撤掉，摘要那三行与「显示更多」一起撤——
   于是原来为「显示更多」估那笔字数的 `SUM_LINES`／`SUM_CHARS` 两个常量同时没有消费者，
   删净（留着就是"屏上不再画的东西还在代码里被算"，下一轮谁都不敢撤）。
   现在一行三档：来源小字 → 标题 → 标识轨（★ 分享过／▢ 出过卡片／🔒 私密），
   左槽一天一组一个大数字。规格与效果图：docs/方案-列表合一-20261017.md。 */

/* 重渲那一张要用**当年那份分享快照**的正文，不是笔记现在的内容（方案 §二：按快照渲出来的才是当年那张）。
   但快照只覆盖它真有的那几栏：`shares` 那几列都可能为 null（老行、没提炼的篇），
   把 null 一起 Object.assign 进去就等于拿"没有"去盖掉"有"——渲出来是一张缺摘要缺要点的另一张。 */

/* 详情窗右上那一格的空态（一枚淡底方形 + 「还没有生成过卡片」两行小字）10-17 撤净：
   站长那句「如果没卡片图，这个位置就完全被标题占满」。它带的两枚 data 键（`swatchBg` 淡底色、
   `brandGlyph` 品牌字）同时没有消费者，一起删——留着就是"屏上不再画的东西还在代码里被算"。 */

Page({
  data: {
    notes: [],
    categories: [],
    // 面板内管理分类（站长 10-17「分类设置，改到当前面板，内完成，不需要跳转」）。
    // `catView` 是那一排芯片**唯一**的渲染源：平时那一态由 `categories` 现算，
    // 管理态由本机草稿 `_catDraft` 现算——两份都走同一个口，所以 wxml 里只有一套标记。
    // 草稿与"待删那几格"记在页面实例上（`_catDraft`／`_catDel`），不进 data：
    // 它们只被 js 读，跟着 setData 白跑一趟（同上面 `_unlockedNoteId` 那条理由）。
    catEdit: false,
    catView: [],
    catNewName: '',
    loading: true,
    searchKeyword: '',
    // 两枚分开：`searchOpen` 是"屏上显示着输入关键字那一态"，`searchFocus` 只是"刚点开那一下要键盘"。
    // 原来 `focus` 直接吃 `searchOpen`，于是这两件事被绑成一件：点开一篇笔记就得先把条子收掉
    // （否则键盘一直压着详情窗），而条子一收、关键字还留着 ⇒ 返回来只剩一枚放大镜，
    // 列表却仍按那个词筛着，看着就像"别的笔记打不开了"（站长 10-17 报的那一条）。
    searchOpen: false,
    searchFocus: false,
    selectedCategory: null,
    lang: 'zh',
    themeClass: 'theme-tint-paper',  // 未登录/首帧的占位：类名必须真的存在，四枚里象牙是 THEMES[0]
    t: texts('zh'),
    skip: 0,
    limit: 50,
    hasMore: true,
    loadingMore: false,
    // 那枚小黄点的色仍由 palette.TIP_DOT 从 style 递进来（wxss 里不许抄饱和色）：
    // 头部那一行轮播 Tips 站长 10-04 撤了，但搜索词下面那枚点和详情窗要点那四行还在吃它。
    tipDotStyle: `background:${TIP_DOT}`,
    // 10-17 合一之后这一屏不再有深面那一行：v19~v30 那两枚 tab 整块撤，`rowSkin`（那行
    // 从 `createSkin()` 递进来的面/字/杠三个数）随之没有宿主。底色全走浅层那一张皮。
    // 头部那一列数字：只有「笔记」。v18 做减法把「分享」「种草」两列撤了
    // （那两列是给分享/种草两屏回看用的，那两屏不做）。值仍来自 /api/user/quota，本页不自己相加。
    stats: [],
    // 合一之后只剩一批屏：`groups` 是一天一组（左槽那个大数字就是组头），组内一行一篇。
    // 原来这两个位置放的是 `view`／`rows`／`cells`——视图态与第二屏一起撤，
    // 「每次进页退回第一枚 tab」那条规矩连同它那两个一次性标记（`_keepView`、
    // `globalData.ixOpenCardsTab`）一起作废：只剩一屏，没有"站错的那一枚"可退。
    groups: [],
    // 私密解锁的状态**不记在这一格里**：它记在页面实例的 `_unlockedNoteId` 上，
    // 判据是服务端认得的那把凭证（来龙去脉见 utils/privateGate.js 的 unlockOn）。
    // 原来这是一个 data 里的 `_privateVerified`——首页是常驻 tab，它记一次就整个会话不再问；
    // 重置／换密码把凭证清了却清不到它，症状是点开一篇私密笔记既不弹密码框、又只剩标题。
    // 再说这一格视图层根本不读，跟着 setData 白跑一趟。
    // 点一枚纸片 / 一行 = 直接浮详情窗（v18 两档排布都不就地展开，理由见 onRowTap）
    detailOpen: false,
    detailNote: null,
    shared: false,
    origOpen: false,
    // v22（站长 10-03）：详情窗右上那一格读这篇在本机台账里留过的卡片，
    // 一篇同时只有一张（站长 10-03 23:40 做减法）：这一组最多一条，‹ i/n › 那行随之撤掉，
    // 不支持来回切换。posterHasCard 决定成品弹窗底排是"生成那一套"还是"删除｜取消"。
    detailCards: [],
    // 这篇的配图那一排（站长 10-17 深夜「详情窗里加一排配图小图，点了拉大图」）。
    // 与列表右侧那枚封面不是一件事：那一枚由列表那一趟一栏 `cover_file_id` 带回来，
    // 这一排只有开窗看这一篇时才问一次 `/api/notes/{id}/assets`（私密篇连这一趟都不发）。
    detailImages: [],
    // 通栏大图停在第几张（10-17 深夜那一句：「显示数字，和下方圆点，横杠」）。
    // 它是"这一篇的图"的一份游标，开窗与配图到货两处都归 0，不许带着上一配的号进来。
    dsFigAt: 0,
    posterHasCard: false,
    // 「显示更多」要把正文滚到原文那一段，靠 scroll-into-view 换值才真会滚
    dsTo: '',
    // v7 ④⑤：模板独浮弹窗——拉它时详情窗整个藏掉，页面上只留这一个浮层
    templateOpen: false,
    posterNote: null,
    posterTpl: '',
    // 成品弹窗里那一行常驻的模板名字（滑到哪一套念哪一套）。原来只有滑那一下一枚 1.2 秒 toast，
    // 开窗那一下从来不报 ⇒ 站长那句"以前还有提醒模板名称的，现在好像看不见"。
    posterTplName: '',
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
    // 「卡片上的信息」那一层那四个键由 utils/cardInfo.js 给初值（两页共用一份，别各写一份）。
    ...cardInfo.initial(),
    // 搜索条与分类输入框那一格不再有一支派生色：站长 10-17「搜索框太深，笔记分类输入框同样，
    // 要改为透明输入框状态…类似邮箱输入框那种风格，淡淡的框体，还是深色字体」⇒ 皮抄 `.me-email-field`
    // 那三条令牌（`--chip-idle` 面＋`--card-edge` 淡边＋`--text-primary` 深色字），全走 wxss 的类。
    // 于是这一页不再需要 `--chrome-*` 那一场内联变量：`searchSkin` 这一格、`onShow` 里那一次重算、
    // wxml 两处 `style="{{searchSkin}}"` 一起撤。⚠ 撤的是**这一页的消费**，不是那个派生函数——
    // 底栏胶囊与实心按钮仍由 palette 的 chromeOf／moodChromeOf 一处给（`--chrome-bg` 那两条仍在 app.wxss）。
    // 「不发内联变量 ⇒ `background: var(--chrome-bg)` 当场 IACVT 成透明」那条坑随这一刀自然消失：
    // 现在屏上那层透明是**要的**，边框由 inset box-shadow 画，不靠变量。
    // 头部那一段铺不铺图：'' 表示不铺（用户在外观设置里关掉了，或形象文件被系统清了）。
    // 取图和新建页同一个口，不在这页另开一份判断。
    bgSrc: '',
    // 背景图浅到白字兜不住那一档：与新建页、「我的」页同一个口（utils/imgBrightness.js）。
    bgLight: false,
    bgLightLow: false,
    // 淡底方形左上角那枚品牌字 / 右上那枚淡底方形的底：两枚键随空态一起撤（理由见上面那段）
    // 头部那张图的摆法，由 fitHead() 问过图片尺寸之后现算（同一套数在 poster.bandGeom）
    imgStyle: '',
    // 详情窗那一态要把同一张图铺满整屏（站长 10-03："形象图贯穿，与其他页面保持风格统一"），
    // 盒子高换成 webview 实测高，算法与锚点仍是 bandGeom 那一条，不分第二条公式。
    imgStyleThru: '',
    // 背景深浅那一档：这一页**不跟首页那枚「调亮度」走**，恒给最亮那一档（罩层 opacity 0＝原图）。
    // 站长 10-15 09:2x「不需要跟随首页调亮度」＋11:0x 追死「是要正常亮度，不是压暗！」，
    // 数从 `app.bgSkinLocked()` 那一道口出，这里那个 0 只是第一帧的初值，与那道口同一个数。
    dimV: 0,
    dimDot: '',
    dimScrim: '',
  },

  async onShow() {
    const app = getApp()
    await app.getLoginPromise().catch(() => {})
    const themeClass = app.applyTheme(app.getWallpaper())
    const lang = app.globalData.userInfo?.language || 'zh'
    // 每次进页重取：在卡片模板页换完形象返回，这一屏的头部就该跟着换。
    const bgSrc = poster.homeBg()
    this.setData({
      lang,
      t: texts(lang),
      themeClass,
      bgSrc,
      // 深浅这一档**不再跟随首页那枚「调亮度」**（站长 10-15 09:2x「笔记列表，卡片列表，我的，设置，
      // 上面的背景图，不需要跟随首页调亮度。首页调亮度只影响首屏和第二屏」）⇒ 锁在默认那一档，
      // 理由与"为什么不是完全不压暗"都写在 app.bgSkinLocked() 那一段。
      ...app.bgSkinLocked(),
    })
    // 三个 tab 的导航条标题统一成应用名（站长 10-01 晚）：原来这一页是「图麦笔记」、
    // 新建页是「新建笔记」、「我的」页是「我的」，顶上跳来跳去读起来像三个应用。
    // 页面里本来就有左上角那行大字说"这是哪一页"，导航条不必再报一遍。
    // ⚠ 10-16 夜他自己把这条翻了：左上角那行字换成首屏那枚书法位图（图不报页名），
    // 于是"这是哪一页"改由导航条说 ⇒ 这一栏念的就是左上角原来那行原文字。
    // 两版口径都留字在这里，别再当成漏改补回去。
    app.setNavTitle('notesHeading', lang)
    this.fitHead(bgSrc)
    bgTone.applyTone(this, this.data.bgSrc, toneZones())
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateLabels()
      this.getTabBar().applyTheme(app.getWallpaper())
      this.getTabBar().setData({ selected: 1 })
    }
    this.loadCategories()
    this.loadQuota()
    // onShow 每次切回该 tab 都会触发，必须 reset：否则非 reset 分支会把结果追加到旧列表上，
    // 同一条笔记被贴两遍。
    this._closeFloats()
    // 去编辑那一趟回来要重新站到详情窗前（他 10-03：没保存点取消，回列表等于把人甩回原地找路）。
    // 和验完密码那条同一个做法：等整表重排完再按 id 找回那一行，先开窗后重排会开成别人的笔记。
    const reopen = this._backToDetail
    this._backToDetail = 0
    await this.loadNotes(true)
    if (reopen) await this._reopenDetail(reopen)
  },

  // 头部那张图的取景：先问出图片真实尺寸，再按「我的」页那套数摆（poster.bandGeom，
  // 按宽铺满、往上顶 15% 留头顶空间）。原来这里只是裸 aspectFill 塞进 750x542，
  // 同一个人在这页成了大特写、在「我的」页是半身——站长 10-01 真机对出来打回的。
  // 问不到尺寸就退回 aspectFill 的默认居中，不猜。
  // ★10-11 毛玻璃 R12（「毛玻璃白底下面如果没有背景图，你可以下移背景图」）：
  //   盒子高从 `poster.BAND_H`(542) 递到 GLASS_BAND_H(740)。bandGeom 那条公式与 15% 锚点一个字没改，
  //   只是盒子变高 → 顶边由 −112 变 −83，图就往下垫到卡顶那 238 后面，玻璃有东西可糊。
  //   与 index.wxss 里 `.head::after` 的 top:542／height:198 是同一笔账，改一处要改两处。
  fitHead(src) {
    if (!src) { this.setData({ imgStyle: '', imgStyleThru: '' }); return }
    wx.getImageInfo({
      src,
      success: (info) => this.setData({
        imgStyle: poster.bandGeom(info.width, info.height, poster.HEAD_IMG_H),
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

  // 右上角那一列数字：/api/user/quota 一趟只读 used。
  // 原话是「分享」「种草」两列一起干掉（10-04），那两个字段也从服务端撤了，
  // 所以这里不再自己数列表那一趟（它被搜索词和分类筛过，数出来的是"当前筛出的条数"），
  // 也不读 100 条去凑总数——客户端拿不到原始台账，也就没有"自己开关一下把数字刷大"这条路。
  async loadQuota() {
    const lang = this.data.lang
    try {
      const q = await api.getQuota()
      // 接口挂了或字段缺失时这一格画 0（站长 10-01 拍板，把早先画「—」那版翻过来了）：
      // 这一档是给人看的进度，空着或画杠读起来像坏了。口径是"读不到就当还没有"。
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
      // 分类行从 v30 起就不穿各自分类的实色胶囊，10-16 又把选中那条短杠撤了 ⇒ 这一行不吃分类色；
      // 10-17 合一再撤一处：旧行左端那枚分类色点（`.xd-dot`）随整行一起没了。
      // 所以分类色在这一屏只剩详情窗那一份（挂在 `detailNote.catStyle` 上）。
      // 分类比笔记晚到是常态，这一趟重算**不只是补名字**：`is_private`／`privKnown` 都由分类名判，
      // 表还没回来时它们一律"不私密"，合一之后那一行右侧还画配图 ⇒ 重算就是那道闸的一部分。
      this.setData({ categories, catView: this._catView(this.data.catEdit) })
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
    // 纸片墙那一族莫兰迪（paperSkinFor）随 v19 一起撤了：列表不按分类铺底色。
    // ⚠ 这一句原来还带着"状态标记也不在列表上画，公不公开只在详情窗下沿那一句里说"——
    // 10-17 合一把它翻了一半：行上那条标识轨（★ 分享过／▢ 出过卡片／🔒 私密）就是状态标记，
    // 用的是同一支墨、不穿色块，所以"不按分类铺底色"照旧成立。
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
      // 「这一格到底判得准不准」单独留一栏：分类那一张表还没拉回来（冷启第一屏、或那一趟挂了）
      // 时 nameOf 是空的，`isPrivate(undefined)` 一律回 false——那是**不知道**，不是**不私密**。
      // 卡片那一排不许拿"不知道"当"不私密"画（站长 10-12 拍 C1 甲：宁可偶尔少画几张）。
      n.privKnown = n.category_id == null || nameOf[n.category_id] !== undefined
    })
    return notes
  },

  /* 合一之后只剩一批屏（10-17）：一天一组，组头是左槽那一个大数字，组内一行一篇。
     序与筛选仍是 `notes` 那一份原样，所以"翻页/筛分类/搜一个词"三条都不必另算一遍。

     一行三档，全部是**现成的数**，这一趟不新增任何请求：
     · `src`    ← 服务端那栏 `source_type` 映出来的字典串（上面那六支，走 `SOURCE_TYPE_KEYS`）
     · `title`  ← 只有标题一行（摘要那三行与「显示更多」随这次做减法一起撤）
     · `shared` ← 服务端列表响应里那栏 `has_active_share`（今天就在下发，**这一枚是它的第一个消费者**）
     · `card`   ← `cardCloud.hasCard(id)`：内存里那份全量名单，零请求
     · `priv`   ← 客户端 `isPrivate(分类名)`（`skin()` 已经算在 `n.is_private` 上）
     · `cover`  ← 服务端新那栏 `cover_file_id`（没部署／没配过图／备份失败 ⇒ 空 ⇒ 那一格不画）

     ⚠ 私密那一行**一律不画配图**，这是闸不是装饰：服务端锁着时那一行按九栏白名单重建，
     `cover_file_id` 天然拿不到（`tests/test_list_cover.py` 钉了正反两条）；这一句 `!n.is_private`
     挡的是"凭证还留着、正文已解锁"那一态之外的一层——一张照片里可能正写着密码、脸、票据，
     列表那一屏是最不该露它们的地方。
     ⚠ `privKnown === false`（分类表还没拉回来）按甲处理：宁可少画一张图，不拿"不知道"当"不私密"。 */
  arrange(notes) {
    const canDrawCloud = cloudUpload.cloudReady()
    const todayKey = formatDate(new Date())
    const groups = []
    let cur = null
    notes.forEach((n, i) => {
      const key = formatDate(n.created_at)
      if (!cur || cur.key !== key) {
        cur = { key, d: key.slice(8), w: formatWeekday(n.created_at), today: key === todayKey, rows: [] }
        groups.push(cur)
      }
      const hideCover = n.is_private || !n.privKnown
      cur.rows.push({
        i,
        id: n.id,
        title: n.title,
        src: n.source_type_label,
        // 转存来的那一篇，来源那一档后面跟着原分享者的昵称（服务端那栏 `share_author_name`）。
        // 原来它钉在摘要那一行右端，摘要随这次做减法撤了——**信息没撤**，搬进同一档里念。
        who: n.who || '',
        shared: !!n.has_active_share,
        card: cardCloud.hasCard(n.id),
        priv: !!n.is_private,
        cover: hideCover || !canDrawCloud ? '' : n.cover_file_id || '',
      })
    })
    // 卡片那一叠的台账是异步读回来的（`loadNotes` 里那一趟 `cardCloud.refresh()`），
    // 回来之后重算一遍 ▢ 那一枚才会补上；这一屏每次数据动过都重算，不需要额外的脏标记。
    return { groups }
  },

  // 这一格画哪一张。**2.0.1 S2 起权威在服务器**：本机那张还在就画它（快、不花钱），
  // 不在了就用云上登记的那一份顶上——后者就是"版本更新之后卡片不见了"那一态的修法。
  // 谓词收在 `cardCloud.cellFor` 一个出处：首页这一格、详情页右上那一格、笔记卡片页那道
  // 「一篇只留一张」的闸三处必须问同一个问题，各判各的就会一屏两句反话（10-07 定 aliveFor
  // 一个出处时讲的是同一件事，今天只是把那一个出处往上挪了一层）。
  _cardsOf(noteId) {
    return cardCloud.cellFor(noteId)
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
      // 「哪几篇有卡片」这一叠从服务器读（2.0.1 S2）。**不等它**：笔记列表先画出来，
      // 卡片那一格晚一拍补上——留档从来不是主流程。但也不能不读：只吃本机那个 jpg
      // 就是"更新之后卡片不见了"的根。整表重载才读，翻页那几趟不重复打（这一个口回的是全量）。
      if (reset || !cardCloud.isLoaded()) {
        cardCloud.refresh().then((r) => {
          if (r) this.setData(this.arrange(this.data.notes))
        })
      }
      // §8.232 首启那一张卡片：服务端这次登录**建出了新账号**并替他存了那一篇，才会带一个 id 过来。
      // 三处纪律照需求原文：① 排在这次 setData **之后**、不 await（列表首帧不许为它多等，判据 3）；
      // ② 失败不出声（口径 5，与 app.js 里 `mpAssets.pull()` 同一条）；
      // ③ `consumeSeededNote()` 取走即清 ⇒ 这一趟只发一次令，用户删掉那一篇之后不会再长出卡片。
      if (reset) {
        const seededId = getApp().consumeSeededNote()
        if (seededId) this._autoFirstCard(seededId).catch((err) => console.warn('首启那张卡片没出成：', err && err.message))
      }
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
    this.setData({ searchOpen: true, searchFocus: true })
  },

  // 搜索条收在分类那一行里（09-30 v8，站长："搜索条目前看起来太大，不美观"）。
  // 展开时 `focus="{{searchFocus}}"` 把键盘带起来一次；之后键盘开不开由 `searchFocus` 单独管，
  // 不再跟"屏上是不是输入关键字那一态"绑成一枚（站长 10-17 报的那一条的病根就在这一绑上）。
  // 点条子以外的**真空白**：管理态里那一下是"存"（站长 10-17 原话「然后点击页面空白区，就自动保存」）；
  // 搜索那一态里那一下是"退"（站长 10-17 这一句：「如果点击空白区，就自动清空搜索框，恢复到放大镜状态」）。
  // ⚠ 判"要不要退"不能只看 `searchOpen`：点分类那一枚与进管理态都会把条子收起而把词留着，
  // 那时屏上是一枚放大镜＋一个还在筛列表的词——只看 `searchOpen` 就当场 return，
  // 那正是"返回后清不掉、看不了别的笔记"的卡死处。所以词非空也算"还开着搜索"。
  // 两态不会同时开着（`onCatManageTap` 进来先把条子收回），所以先判管理、后判搜索。
  // 点中某条笔记或某一枚分类不算"点空白"：那两处都是 catchtap，冒泡不上来；
  // 行那一处在 `onRowTap` 里另有一条"管理态中 ⇒ 只存不开窗"的短路。
  async onBlankTap() {
    if (this.data.catEdit) {
      await this._saveCatEdit()
      return
    }
    if (!this.data.searchOpen && !this.data.searchKeyword) return
    this.setData({ searchOpen: false, searchFocus: false, searchKeyword: '' })
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
    // 分类是 catchtap：它不该被当成"点了空白"。这一枚**照旧收条子、不清词**（10-03 那版口径，
    // 站长这一轮点的是"点开笔记返回"那一条，没提分类），词仍由 ✕ 与点空白清。
    // ⚠ 键盘那一样得跟着收——`focus` 不再吃 `searchOpen`，只收条子会一直压着这一屏。
    if (this.data.searchOpen || this.data.searchFocus) this.setData({ searchOpen: false, searchFocus: false })
    const id = e.currentTarget.dataset.id
    this.setData({ selectedCategory: id === null ? null : parseInt(id) })
    this._closeFloats()
    this.loadNotes(true)
  },

  /* ── 面板内管理分类（站长 10-17 那一轮，逐字原话与验收在 docs/方案-分类面板内管理-20261017.md）
     「分类设置，改到当前面板，内完成，不需要跳转」＝按那枚井格就地换管理态，全程不跳页；
     「在分类ICON右侧，多一个输入框，代表新增分类，支持同时输入多个新增，用空格区隔」＝输入框长在井格右手边；
     「下方已有的，右上角多个×，可以点击删除」＝每枚右上角一枚 ×（私密那一枚不画，他同轮拍「禁止删除」）；
     「也可以按压拖动，排序」＝长按起拖，越过相邻那枚的中线就换位置；
     「点击页面空白区，就自动保存」＝改动全留本机，点空白那一下批量提交。
     ⚠ 原来那枚井格是 `wx.navigateTo('/pages/categories/categories')`（`goCategories`），
       这一轮撤掉：他说的是"不需要跳转"，而他补的那句「原设置的分类入口关闭」把另一处入口
       （「我的」页那一行，`me.js`）也一起撤了。`pages/categories/` 那一页的文件先留着不删，
       理由写在方案 §4——删页要连 `app.json` 注册与那页的判据一起动，是另一刀。
     本机草稿三样记在页面实例上、不进 data（只被 js 读）：
       `_catDraft` 当前顺序与待建那几格、`_catDel` 等着删的那几格、`_catOrder0` 进来时服务端那一份顺序。 */

  _catFind(key) {
    return (this._catDraft || []).find((x) => x.key === key)
  },

  _toDraft(list) {
    return (list || []).map((c) => ({
      key: 'c' + c.id, id: c.id, name: c.name, name_zh: c.name_zh, name_en: c.name_en,
      note_count: c.note_count, isPrivate: isPrivate(c.name), renamed: false,
    }))
  },

  // 那一排芯片**唯一**的渲染源。`edit` 由调用方传进来，不现读 `this.data.catEdit`：
  // 进出管理态那两趟要在同一次 setData 里同时换 `catEdit` 与 `catView`，
  // 现读 data 拿到的是旧的那一态，画出来就是一屏对不上号的混合体。
  _catView(edit) {
    const lang = this.data.lang
    const out = []
    if (!edit) {
      out.push({ key: 'all', id: null, label: t('allCategories', lang), x: false, state: '' })
      this.data.categories.forEach((c) => out.push({
        key: 'c' + c.id, id: c.id, label: labelOf(c, lang), x: false, state: '',
      }))
      return out
    }
    ;(this._catDraft || []).forEach((it) => {
      // 待建与待改那两档，屏上直接念他刚打的字：那两档服务端还没有对应译名，
      // 拿旧行的 name_zh／name_en 去显示，显示的就是上一个名字的译名。
      const raw = it.id === null || it.renamed
      const st = (raw ? ' pending' : '')
        + (this._drag && this._drag.key === it.key ? ' dragging' : '')
      out.push({
        key: it.key,
        id: it.id,
        label: raw ? it.name : labelOf(it, lang),
        x: !it.isPrivate,
        state: st.trim(),
      })
    })
    return out
  },

  // 面板顶左端那一枚井格：按一下进管理态，再按一下存并退出（同一个口，不另设"完成"按钮——
  // 他给的是「点击页面空白区，就自动保存」，多加一枚按钮就是第二个入口）。
  onCatManageTap() {
    if (this.data.catEdit) { this._saveCatEdit(); return }
    this._catDraft = this._toDraft(this.data.categories)
    this._catDel = []
    this._catOrder0 = this.data.categories.map((c) => c.id)
    this._drag = null
    this._catSeq = 0
    // 搜索条与管理态两立：进来先把条子收回（词不清，✕ 才是清词的口，与点分类那一枚同一条规矩）。
    this.setData({
      catEdit: true,
      searchOpen: false,
      searchFocus: false,
      catNewName: '',
      catView: this._catView(true),
    })
  },

  onCatChipTap(e) {
    if (!this.data.catEdit) { this.selectCategory(e); return }
    const it = this._catFind(e.currentTarget.dataset.key)
    // 私密那一格：能拖动、不给改名（站长 10-17 拍的甲）。点下去什么都不发生是设计，
    // 不是坏了——服务端那一道 PUT 也无条件挡着，两条腿都钉在尺子里。
    if (!it || it.isPrivate) return
    this._catRename(it)
  },

  onCatAddInput(e) {
    this.setData({ catNewName: e.detail.value })
  },

  // 空格切段 ⇒ 一次落多格（「支持同时输入多个新增，用空格区隔」）。
  // confirm（键盘那一枚"完成"）与 blur（点别处）都走这里：点空白那一下的次序正好是
  // 先 blur 再 bindtap，所以新词先变成屏上的待建格，再跟着那一次保存一起发出去。
  onCatAddCommit() {
    if (!this.data.catEdit) return
    const names = String(this.data.catNewName || '').split(/\s+/).filter(Boolean)
    if (!names.length && !this.data.catNewName) return
    const draft = this._catDraft || (this._catDraft = [])
    names.forEach((n) => {
      const low = String(n).toLowerCase()
      // 同一次输入里重复的词只留第一次；与已有那几格重名的也先挡在本地（服务端那一道还会再挡一次，
      // 但让他在屏上看到"这一格没有多出来"比等一次失败toast 便宜）。
      if (draft.some((x) => String(x.name).toLowerCase() === low)) return
      this._catSeq = (this._catSeq || 0) + 1
      draft.push({ key: 'n' + this._catSeq, id: null, name: n, isPrivate: false, renamed: false })
    })
    this.setData({ catNewName: '', catView: this._catView(true) })
  },

  // × 那一下：先问一句再删（站长 10-17 补的那一句「删除要二次确认」）。
  // 问话要报"这一格里 N 篇会归到未分类"——这条链上唯一不可逆的就是那个归类关系（笔记本身不动，
  // 也没有撤销口）。N 读服务端 GET 带回的 `note_count`；读不到（老服务端）就退回原来那句不报数的现网话术，
  // 绝不拿本机已加载的那几十篇凑一个数。
  onCatDeleteTap(e) {
    const key = e.currentTarget.dataset.key
    const i = (this._catDraft || []).findIndex((x) => x.key === key)
    if (i < 0) return
    const it = this._catDraft[i]
    if (it.isPrivate) return   // 那一枚本来不画 ×；这一道是给以后改皮的人留的闸
    const lang = this.data.lang
    const n = typeof it.note_count === 'number' ? it.note_count : null
    wx.showModal({
      title: t('delete', lang),
      content: n === null ? t('deleteCategoryConfirm', lang) : fmt(t('catDelBody', lang), { n }),
      confirmText: t('delete', lang),
      cancelText: t('cancel', lang),
      success: (res) => {
        if (!res.confirm) return
        this._catDraft.splice(i, 1)
        this._catDel.push(it)
        this.setData({ catView: this._catView(true) })
      },
    })
  },

  // 改名：这一轮他没提，但那是现网就有的能力，而他要求把别的入口关掉（方案 §4 记的是我这一条）。
  // 走系统弹窗那一条可编辑的（`editable`），不自画一层皮；改动同样先留本机，点空白那一趟才发 PUT。
  _catRename(it) {
    const lang = this.data.lang
    wx.showModal({
      title: t('editCategory', lang),
      editable: true,
      placeholderText: t('categoryName', lang),
      content: it.name,
      confirmText: t('save', lang),
      cancelText: t('cancel', lang),
      success: (res) => {
        if (!res.confirm) return
        const name = String(res.content || '').trim()
        if (!name || name === it.name) return
        if (it.id === null) it.name = name        // 还没上服务端的待建格：就地改字，不算一次改动
        else { it.name = name; it.renamed = true }
        this.setData({ catView: this._catView(true) })
      },
    })
  },

  // ---------- 按压拖动 ----------
  // 落点全靠现量：longpress 那个事件里 `touches` 在部分机型是空的，所以 touchstart 先把
  // 手指那一处的 x 存下来当备胎。换过一次顺序之后**必须重新量**——数组一调序，手上那份 rect
  // 全部过期，拿它再判第二次就滑到别处去了。
  onCatTouchStart(e) {
    if (!this.data.catEdit) return
    const t0 = e.touches && e.touches[0]
    if (t0) this._catFingerX = t0.clientX
  },

  onCatDragStart(e) {
    if (!this.data.catEdit) return
    const key = e.currentTarget.dataset.key
    const i = (this._catDraft || []).findIndex((x) => x.key === key)
    if (i < 0) return
    const t0 = e.touches && e.touches[0]
    const x = t0 ? t0.clientX : this._catFingerX
    this._drag = { key, i, x: typeof x === 'number' ? x : 0 }
    this.setData({ catView: this._catView(true) })
  },

  async onCatDragMove(e) {
    const d = this._drag
    if (!d || this._dragBusy) return
    const t0 = e.touches && e.touches[0]
    if (!t0) return
    d.x = t0.clientX
    this._dragBusy = true
    try {
      await this._catDragStep()
    } finally {
      this._dragBusy = false
    }
  },

  async _catDragStep() {
    // 一次移动最多换三格：手指甩得快时也不会把整排搅成一团，剩下的交给下一个 touchmove。
    for (let guard = 0; guard < 3; guard++) {
      const d = this._drag
      if (!d) return
      const rects = await this._catRects()
      if (rects.length !== (this._catDraft || []).length || rects.length < 2) return
      const mid = (r) => r.left + r.width / 2
      const right = d.i + 1 < rects.length ? rects[d.i + 1] : null
      const left = d.i - 1 >= 0 ? rects[d.i - 1] : null
      let to = -1
      if (right && d.x > mid(right)) to = d.i + 1
      else if (left && d.x < mid(left)) to = d.i - 1
      if (to < 0) return
      const it = this._catDraft.splice(d.i, 1)[0]
      this._catDraft.splice(to, 0, it)
      d.i = to
      this.setData({ catView: this._catView(true) })
      // 排布是渲染层算的，setData 回来那一瞬量到的还是换之前的位置：等一帧再量。
      await this._catNextFrame()
    }
  },

  onCatDragEnd() {
    if (!this._drag) return
    this._drag = null
    this.setData({ catView: this._catView(true) })
    // 松手**不发请求**：顺序只是本机草稿，保存那一趟才发 reorder（他点的是"点空白自动保存"）。
  },

  _catRects() {
    return new Promise((resolve) => {
      wx.createSelectorQuery().selectAll('.ix-cat').boundingClientRect().exec((res) => {
        resolve((res && res[0]) || [])
      })
    })
  },

  _catNextFrame() {
    return new Promise((resolve) => setTimeout(resolve, 30))
  },

  // 要不要发 reorder：已有那几格的相对顺序变了，或者有待建格被放在了某一枚已有格之前
  // （服务端"新增一律排最后"给的位置不是他拖的位置）。
  _catOrderDirty() {
    const draft = this._catDraft || []
    const now = draft.filter((x) => typeof x.id === 'number').map((x) => x.id)
    const base = (this._catOrder0 || []).filter((id) => now.indexOf(id) >= 0)
    if (now.join() !== base.join()) return true
    return draft.some((x, i) => x.id === null && draft.slice(i + 1).some((y) => typeof y.id === 'number'))
  },

  /* 批量提交那一条线：删 → 改名 → 建 → 排序。
     这个次序是按"哪一步会失败"排的：改名与建格会被重名挡（可重来），删那一趟几乎不会失败，
     而只有前三步全成，才配发最后那一次 reorder（否则新格还没身份 id，那份顺序是编出来的）。
     没成的那几条**点名**报出来，人留在管理态里——不许"看起来保存了"。 */
  async _saveCatEdit() {
    if (this._savingCat) return
    this._savingCat = true
    const lang = this.data.lang
    this.onCatAddCommit()
    const dels = (this._catDel || []).slice()
    const renames = (this._catDraft || []).filter((x) => typeof x.id === 'number' && x.renamed)
    const news = (this._catDraft || []).filter((x) => x.id === null)
    const dirty = dels.length || renames.length || news.length || this._catOrderDirty()
    if (!dirty) {
      this._catExit()
      this._savingCat = false
      return
    }
    wx.showLoading({ title: t('saving', lang), mask: true })
    const bad = []
    const stillDel = []
    for (const it of dels) {
      try { await api.deleteCategory(it.id) } catch (err) {
        bad.push(it); stillDel.push(it)
        console.error('分类没删掉', it.name, err)
      }
    }
    this._catDel = stillDel
    for (const it of renames) {
      try {
        const r = await api.updateCategory(it.id, { name: it.name })
        it.name = r.name; it.name_zh = r.name_zh; it.name_en = r.name_en; it.renamed = false
      } catch (err) {
        bad.push(it)
        console.error('分类名没改掉', it.name, err)
      }
    }
    for (const it of news) {
      try {
        const r = await api.createCategory({ name: it.name })
        // 服务端那份才是身份：id、两档显示值都按回来的写，本地那一格就此"落地"（pending 那一档自然消失）。
        it.id = r.id; it.name = r.name; it.name_zh = r.name_zh; it.name_en = r.name_en
      } catch (err) {
        bad.push(it)
        console.error('分类没建起来', it.name, err)
      }
    }
    let orderErr = false
    if (!bad.length && this._catOrderDirty()) {
      const ids = this._catDraft.filter((x) => typeof x.id === 'number').map((x) => x.id)
      try { await api.reorderCategories(ids) } catch (err) {
        orderErr = true
        console.error('分类顺序没存上', err)
      }
    }
    wx.hideLoading()

    if (bad.length || orderErr) {
      // 有没成的：先把服务端那一份真的读回来（成的那些必须立刻在屏上落定），
      // 再把没成的贴回草稿继续挂着。名字只报中文那一份就够了——那是他自己打的字。
      const names = bad.map((x) => x.name).join('、')
      await this.loadCategories()
      this._catResync(bad)
      const tail = orderErr ? (names ? '；' + t('sortFailed', lang) : t('sortFailed', lang)) : ''
      wx.showToast({
        title: names ? fmt(t('catSaveFailed', lang), { names }) + tail : tail,
        icon: 'none',
      })
      this._savingCat = false
      return
    }
    this._catExit()
    await this.loadCategories()
    // 他正筛着的那一格被删掉了 ⇒ 不把筛选撤回来，屏上就是一片空白加一个"还有筛选"的状态，
    // 看着像列表坏了。清掉重拉一次，让他站在"全部"那一格上。
    const live = {}
    this.data.categories.forEach((c) => { live[c.id] = true })
    const sel = this.data.selectedCategory
    if (sel !== null && !live[sel]) {
      this.setData({ selectedCategory: null })
      this.loadNotes(true)
      return
    }
    wx.showToast({ title: t('saveSucceeded', lang), icon: 'success' })
    this._savingCat = false
  },

  _catExit() {
    this._drag = null
    this._catDraft = null
    this._catDel = []
    this.setData({ catEdit: false, catNewName: '', catView: this._catView(false) })
  },

  // 部分失败之后把草稿重建到"服务端真的那一份 ＋ 没成的那几条"上：
  // 没成的删除继续挂着（从重建的草稿里摘掉那一格）、没成的改名继续显示他打的新字、
  // 没成的新建回到末尾（他原来拖的位置随这一次失败一起丢了，重进管理态也读不回来——
  // 这一点写在方案 §4，不是我漏了）。
  _catResync(bad) {
    const draft = this._toDraft(this.data.categories)
    const stillDel = []
    ;(this._catDel || []).forEach((it) => {
      if (bad.indexOf(it) < 0) return
      stillDel.push(it)
      const k = draft.findIndex((x) => x.id === it.id)
      if (k >= 0) draft.splice(k, 1)
    })
    this._catDel = stillDel
    bad.forEach((it) => {
      if (it.id === null) { draft.push(this._toLocal(it)); return }
      const k = draft.findIndex((x) => x.id === it.id)
      if (k >= 0 && it.renamed) draft[k] = Object.assign(draft[k], { name: it.name, renamed: true })
    })
    this._catDraft = draft
    this._catOrder0 = draft.filter((x) => typeof x.id === 'number').map((x) => x.id)
    this.setData({ catView: this._catView(true) })
  },

  _toLocal(it) {
    return {
      key: it.key, id: it.id, name: it.name, name_zh: it.name_zh, name_en: it.name_en,
      note_count: it.note_count, isPrivate: it.isPrivate, renamed: it.renamed,
    }
  },

  // 10-17 合一之后这一屏没有 onHide：他停在列表页切走 tab、或去编辑那一趟，管理态里的草稿
  // 会静默丢掉（拖完一切照旧、回来顺序还是老的）。这一句把"切走"也接到同一条保存线上——
  // 他要的是"点空白就存"，切走是同一件事的第二个出口，不另设一套写法。
  onHide() {
    if (this.data.catEdit) this._saveCatEdit()
  },

  // 10-17 合一：`onViewTap`（两枚 tab 只换视图、不重拉数据）与 `goFirstScreen`
  // （那一行右端的「返回」，10-10 深夜由「点一下展开」翻成「返回」）一起撤——
  // 只剩一屏，没有第二枚可切；回第一屏走底栏第一格，那一格本来就压在这一层上面。
  // 两枚的旧口径都留在 docs/方案-列表合一-20261017.md §3，别再当成漏画补回去。

  // 一行只给"来源／标题／标识轨"三档，不就地展开——摘要全文、要点、原文本来就在详情窗里。
  // 私密笔记进门前先验密码：**每一次点开一篇都要输**（站长 10-12「每次看详细都要输入一次」），
  // 密码不对或他取消就既不开窗也不发请求。判据与那一趟输入都在 utils/privateGate.js 的 unlockOn。
  async onRowTap(e) {
    // 行是 catchtap：它不该被当成"点了空白"（那样会把关键字一起清掉）。
    // 站长 10-17 这一句改的是**原来那句"收条子、留词"**：「搜索完结果，显示结果，上面的搜索框
    // 应该依旧显示输入关键字状态」。原来收条子只为了腾地方，实际后果是返回来只剩一枚放大镜、
    // 列表却仍按那个词筛着 ⇒ 看着像"别的笔记打不开了"。条子与词都留着，只把键盘收掉，
    // 否则详情窗被键盘压着一半。词仍由 ✕ 与点空白清。
    if (this.data.searchFocus) this.setData({ searchFocus: false })
    // 管理态里点某一行的笔记＝"点了别处"：只把这一屏的分类改动存下去，不开详情窗。
    // 不开窗是对的——他要的是"点空白自动保存"，而人在管理分类时点到行上多半是想腾个地方；
    // 反过来（先存再开窗）会把一次误触变成一个密码框。
    if (this.data.catEdit) { await this._saveCatEdit(); return }
    const idx = e.currentTarget.dataset.idx
    const note = this.data.notes[idx]
    if (!note) return
    if (!(await unlockOn(this, note))) return
    // 验完**不再整表重取**：列表那一趟今天永远不带凭证（api.js 的 getNotes 那条），
    // 窗里的正文与摘要由 _openDetail 那一次 getNote 带着凭证取回来。
    // 原来那句"验完重取列表拿摘要"正是泄密那一条：它把这一页所有私密行的 summary 一起留在内存里。
    // 但行号还是要按 id 找回来：面板浮着的那一段时间里，人会切到底栏另一格再回来
    // （底栏是自定义组件、z-index 999，压得过这一层的 100），onShow 那趟会重拉整表、序也变。
    // 拿着点下去那一刻的号开窗＝验的是 A、开的是 B（B 是私密也照开，凭证是全局那一把）。
    const at = this.data.notes.findIndex((n) => n.id === note.id)
    if (at < 0) return
    this._openDetail(at)
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
      detailCards: this._cardsOf(row.id), dsTo: '',
      // 上一配的配图不许留在这一屏上：那一排是"这一篇的"，不是全局的一份。
      detailImages: [], dsFigAt: 0,
    })
    // 这一篇算不算私密，先按列表那一行那一份猜（本机按分类名现算的），拿到详情再换成服务端钉的。
    let priv = !!row.is_private
    try {
      let full = await api.getNote(row.id)
      if (!this.data.detailOpen) return
      // 详情那一份的 is_private 才是服务端钉的（backend/app/core/private_access.py 的
      // locked_response），列表那一行的不是——列表响应里根本没这一栏，本机是拿分类名现算的。
      // 分类那一张表没拉到或拉挂的当口，现算的那份会一律判成"不私密"，上面那道闸就被跳过：
      // 于是点开一篇私密笔记既不问密码、又只看见一个标题（站长 10-12 报的那一条的另一半）。
      // 所以这里以详情为准再走一次同一道闸；没验成就把窗收掉，半截空壳都不画。
      priv = !!full.is_private
      const gate = { id: row.id, is_private: priv }
      // 要问的时候先把窗收掉再问：`.float-sheet` 的 z-index 是 101，而那一层密码面板是 100
      // （me.wxss 那份皮搬到 styles/pwd-sheet.wxss 时这一档一个字没改）。
      // 先浮面板再收窗，面板就画在窗底下——人只看见一篇带标题的窗，屏上没有输入框、
      // 也没有能关掉的地方（10-12 审计严重④，是上一批补闸时我自己引进来的）。
      const askFirst = needsUnlock(this, gate)
      if (askFirst) this.setData({ detailOpen: false, detailNote: row })
      if (!(await unlockOn(this, gate))) return
      if (askFirst) this.setData({ detailOpen: true })
      if (this._unlockRenewed) full = await api.getNote(row.id)
      if (this._unlockRenewed) full = await api.getNote(row.id)
      const note = Object.assign({}, row, full)
      note.source_type_label = row.source_type_label
      note.date_label = row.date_label
      note.created_at_label = formatDateTime(full.created_at)
      this.setData({ detailNote: note })
    } catch (err) {
      console.error('详情窗取全文失败', err)
    }
    // 私密笔记不给分享这条线，公开状态那行也就不查了。配图那一排同理：那一趟也不发。
    if (!priv) {
      this._loadShareStatus(row.id)
      this._loadDetailImages(row.id)
    }
  },

  // 这一排的数与那页独立详情页同一组（`.dt-shots`／`.dt-shot`），话也走同一个口：
  // 先判 `cloudReady` 再打请求——`cloud://…` 那个地址在没 init 过云环境的地方画不出来，
  // 判在前面就同时挡住"多一个请求""一片破图""让人以为图丢了"三件事。
  async _loadDetailImages(noteId) {
    if (!cloudUpload.cloudReady()) return
    try {
      const list = await api.getNoteAssets(noteId)
      // 拿回来的路上窗可能已经关了、或开的是另一篇：对一下号再画，别把上一配的图挂在这一配上。
      const cur = this.data.detailNote
      if (!this.data.detailOpen || !cur || cur.id !== noteId) return
      this.setData({ detailImages: list || [], dsFigAt: 0 })
    } catch (err) {
      // 配图读不到不该影响这篇笔记本身：那一排不画，正文照看
      console.warn('详情窗配图读取失败（不影响正文）', err && (err.errMsg || err.statusCode))
    }
  },

  // 通栏大图左右滑：数字那一枚与下面那一排点都跟着这一份游标走（`dsFigAt`）。
  // 只认 swiper 自己报的 current，不去猜方向。
  onDsFigChange(e) {
    const i = Number(e && e.detail && e.detail.current)
    if (!(i >= 0) || i === this.data.dsFigAt) return
    this.setData({ dsFigAt: i })
  },

  // 点缩略图看大图：整排都给 `previewImage`，所以大图态里左右划能划到这篇其余几张
  // （与独立详情页那一条一模一样，不是只给点到的那一张）。
  onPreviewDetailImage(e) {
    const urls = this.data.detailImages.map((x) => x && x.cloud_url).filter(Boolean)
    if (!urls.length) return
    const cur = e.currentTarget.dataset.url
    wx.previewImage({ current: cur && urls.indexOf(cur) >= 0 ? cur : urls[0], urls })
  },

  // 列表整表重排之后按 id 把那一行找回来再开窗。现在只剩一条路走这里：从编辑那一趟回来。
  // 找不到就是不开了——那篇已在别处被删掉，硬开只能凭空造一份内容。
  // 回来这一趟也要过 unlockOn：同一篇、凭证还活着就不重复问；
  // 凭证在他编辑那一阵里过期了就再问一次，不能拿一份只有标题的空壳当"这篇没内容"。
  async _reopenDetail(noteId) {
    const at = this.data.notes.findIndex((n) => n.id === noteId)
    if (at < 0) return
    if (!(await unlockOn(this, this.data.notes[at]))) return
    this._openDetail(at)
  },

  // 私密解锁那一层（templates/pwd-sheet.wxml，与「我的」同一份）的三个把手。
  // 方法名是模板里写死的那三枚——模板只能按名字找页面自己的方法，所以这三枚不许改名。
  // 收键、推格、交出去全在 utils/pwdSheet.js，这一页只负责把事件递过去，不再各写一遍。
  onPwdBuf(e) { pwdSheet.input(this, e) },
  onPwdOk() { pwdSheet.submit(this) },
  onClosePwdPanel() { pwdSheet.cancel(this) },

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

  // 详情窗下沿 dock 的三个动作 + 那行公开状态（v19：「置顶」那一枚随这一屏的置顶一起撤了，
  // 独立详情页 pages/detail 那枚也在 10-03 跟着撤净——字典里 pin/unpin/pinned 三串一起删了，
  // 服务端那个 is_pinned 与 /pin 接口还在，只是客户端再没有写它的路径）。
  onSheetEdit() {
    const note = this.data.detailNote
    if (!note) return
    // 出门前把窗收掉：改完回来 onShow 会重载列表，窗留着就是读旧内容。
    // 但记下这一篇，重排完在 onShow 里把窗重新开回来（取消没改也一样回窗，不是回列表）。
    this._backToDetail = note.id
    this.setData({ detailOpen: false })
    wx.navigateTo({ url: `/pages/write/write?id=${note.id}&mode=edit` })
  },

  // 中间那一枚「分享笔记」（站长 10-17 深夜：「点击切换卡片大图窗口」）——
  // 办事的还是那一个口 `_openPosterFor`，右上那一格（有卡片时）与这一枚绑同一个函数，
  // 不另开第二条出图链。私密篇这一枚在屏上是置灰的，这里那道 `is_private` 是它背后那一扇：
  // 置灰只是画，挡住了才是真挡（服务端 cards.py／shares.py 同一句，客户端不许自己客气）。
  onSheetShare() {
    const note = this.data.detailNote
    if (!note || note.is_private) return
    return this._openPosterFor(note)
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
        // 与详情页那一条同一个动作、同一个顺序：先把这篇在云上的地址记进待删那一格，再发删除。
        // 回体丢在网络上时，行没了而对象还在，就只有"本机曾经知道"这一条路能把它找回来。
        const known = cardCloud.serverCard(note.id)
        if (known && known.cloud_url) cloudUpload.reservePurge([known.cloud_url])
        try {
          const r = await api.deleteNote(note.id)
          // 与详情页那一条同一个动作：服务端删行，这一侧删云上的对象（后端没那个凭据）。
          cloudUpload.dropFromDeleteRes(r)
          cardCloud.forget(note.id)
          wx.showToast({ title: t('deleteSucceeded', lang), icon: 'success' })
          this.setData({ detailOpen: false })
          this.loadNotes(true)
          this.loadQuota()
        } catch (err) {
          // 服务端那一行没撤掉，预留的那条地址就得还回去（同 `detail.js` 那一条，10-11 审计严重①）
          if (known && known.cloud_url) cloudUpload.unreservePurge([known.cloud_url])
          // 与详情页同一句：服务端回了原因的念原因（10-14「自带那一篇是产品说明，删不掉」）
          wx.showToast({ title: (err.data && err.data.detail) || t('deleteFailed', lang), icon: 'none' })
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
  // 10-17 深夜站长那一句「统一把右侧的笔记卡片图位置去掉」把这一屏唯一的入口撤了，
  // 所以这里不再有 `onCardCell`：出图那一趟现在只有下面那枚「分享笔记」（`onSheetShare`）一个口，
  // 它绑的实现与原来那一格是同一个 `_openPosterFor`（一份实现，两枚口）。
  // 独立详情页那一屏右上那一格与它自己的 `onCardCell` 这一轮没动。

  /* §8.232 首启那一张卡片：给服务端刚种下去的那一篇，静默走一遍**和用户自己出图完全同一条链**
     （`_ensurePosterAssets` → `_renderPoster` → `_keepPoster`，一篇一张、生成即上传都在里面）。
     和 `_openPosterFor` 的差别只有一处：不开那层弹窗——`templateOpen` 这一栏一个字都不碰。
     画布本来就在屏外（`poster-canvas-offscreen`，wxml 里是常驻节点，不跟着弹窗的 wx:if 走），
     所以弹窗关着也画得出来；`_tplBoxRpx()` 量不到展示框时返回 null，那一条自己就跳过了。
     模板与"带不带码"取的是这台设备存的那套默认（`posterProfile().template`），不是替用户猜一套。 */
  async _autoFirstCard(noteId) {
    // `posterBusy` 那一格是弹窗那条链自己的忙碌旗：它开着就说明有人在这条链上，这一趟不挤进去。
    if (this.data.templateOpen || this.data.detailOpen || this.data.posterBusy) return
    const note = (this.data.notes || []).find((n) => n.id === noteId)
    // 私密那一格本来就不许出卡片（10-12 那条闸，服务端 cards.py 同一句），这里跟着同一条判据；
    // 台账里已经有了也不重复出——一篇一张是这本账自己的规则，不是为这一条新起的。
    if (!note || note.is_private || this._cardsOf(noteId).length) return
    const profile = poster.posterProfile()
    this.setData({
      posterNote: note,
      posterTpl: profile.template || poster.DEFAULT_TEMPLATE,
      noQr: false,
    })
    /* ⚠ 每 await 一步都回头看一眼这一趟还占不占着画布：`_posterAssets`、`#posterCanvas`、
       `posterImagePath` 三样都是和成品弹窗**共用**的，而这一趟是后台自己多出来的第二个调用者。
       这中间他自己点开过任何一篇（`_openPosterFor` 会把 `_posterAssets` 换成他那一篇），
       继续画就是两趟往同一块画布上上下下——站长 10-03 报过的"无论点哪张小图，大图都是同一张"
       就是这个共享位被两趟踩出来的，只是那次是弹窗自己内部，这次多了一个不开窗的调用者。
       让位就是让位：这一趟整个丢掉，不发第二次的令（`consumeSeededNote` 已经取走即清）。 */
    await this._ensurePosterAssets(noteId)
    if (this.data.templateOpen || this.data.detailOpen) return
    if (!this._posterAssets || this._posterAssets.noteId !== noteId) return
    await this._renderPoster()
    if (this.data.templateOpen || this.data.detailOpen) return
    if (!this._posterAssets || this._posterAssets.noteId !== noteId) return
    await this._keepPoster()
  },

  /* 开窗起手那一套模板。站长 10-17 深夜：「制作时候，不再固定默认模板，随时出现模板，
     然后用户自行滑动选择」＋追那一句「随机意思是，不要每次都固定出现同一样的模板，
     新用户以为只有一种模板」⇒ 未生成态开窗从合并后的清单里取一套，且**不与上一套相同**
     （连着两篇开出同一套，"随机"在读的人那儿就成了"固定"）。
     台账里已经有那张的笔记不走这里——他同一轮拍「生产过就不支持换卡片模板」，照旧念台账那一套。
     清单只有一套时没得随机，就是那一套；空清单（下发与包内都读不到）退回 DEFAULT_TEMPLATE。 */
  _pickOpeningTemplate(list) {
    if (!list || !list.length) return poster.DEFAULT_TEMPLATE
    if (list.length === 1) return list[0].id
    let pick
    do {
      pick = list[Math.floor(Math.random() * list.length)]
    } while (pick.id === this._lastTplId)
    this._lastTplId = pick.id
    return pick.id
  },

  // 两条入口共用同一段开窗逻辑：from 记的是"关掉之后回哪一层"（见 _closeTemplate）。
  async _openPosterFor(note) {
    if (!note || note.is_private) return
    // 台账里那一格现在指着哪一张，这一趟就照那一张开：模板和二维码开关两样都跟它对齐。
    // 站长 10-03 真机报的"无论点哪张小图，大图都是同一张"——原来这里读的是「我的→卡片模板」
    // 存的那套默认模板，跟台账里这一张没有任何关系，所以 ‹ i/n › 滑得再欢，开出来还是那一套。
    // 台账里那套模板要是已经不在合并后的模板列表里（改名／撤掉／下发收走了），走未生成那一支。
    const list = poster.templateList()
    const cur = (this._cardsOf(note.id) || [])[0]
    const known = !!(cur && cur.tpl && list.some((x) => x.id === cur.tpl))
    const start = known ? cur.tpl : this._pickOpeningTemplate(list)
    this.setData({
      detailOpen: false,
      templateOpen: true,
      posterNote: note,
      posterTpl: start,
      // 名字那一行常驻（原来只有滑那一下一枚 1.2 秒 toast，开窗那一下从来不报）
      posterTplName: poster.templateLabel(start, this.data.lang),
      tplIds: list.map((x, i) => ({ id: x.id, color: toneColor(i) })),
      posterImagePath: '',
      posterBusy: true,
      noQr: known ? !!cur.noQr : false,
      // 台账里有这一篇那一张＝已生成态：底排给「查看笔记｜删除」，模板不能滑、名片不能改
      posterHasCard: known,
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
    // 缓存只留给码：那一趟要 POST 建码、要下一张图，重开一次成品弹窗烧不起。
    // **正文每次现读**——站长 10-07 真机报"标题已经改了，卡片上还是旧标题"：原来这里
    // 整份短路，`_renderPoster` 画的就是 `this._posterAssets.note`，于是首页这一层改完
    // 标题回到首页再开弹窗，画布照画第一次缓存进去那份旧字（笔记卡片页没这个毛病，它每次 onLoad 现拉）。
    const cached = this._posterAssets && this._posterAssets.noteId === noteId ? this._posterAssets : null
    const note = await api.getNote(noteId)
    // 分类名不在笔记响应里，海报上那行小字要靠分类表查——与 share.js 同一条口径。
    if (note.category_id) {
      try {
        const categories = await api.getCategories()
        const cat = categories.find((c) => c.id === note.category_id)
        if (cat) note.category_name = labelOf(cat, this.data.lang)
      } catch (err) { /* 查不到就只写来源 */ }
    }
    if (cached) {
      this._posterAssets = { noteId, note, token: cached.token, qrPath: cached.qrPath }
      return
    }
    const share = await api.createShare(noteId, poster.readProfile().name)
    const qrPath = await this._downloadQR(share.token)
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
    await cardLog.record(a.noteId, this.data.posterTpl, this.data.noQr, this._posterCanvas, this)
    // 记完这一张就"有了"：底排立刻换成「删除｜取消」，不给第二张的入口（一篇一张）
    this.setData(Object.assign({ posterHasCard: true }, this.arrange(this.data.notes)))
  },

  // v7 效果图里"左右滑换模板 / Swipe to change template"那条：横向滑过 60px 判定切换。
  onPosterTouchStart(e) {
    this._touchStartX = e.touches[0].clientX
  },

  onPosterTouchEnd(e) {
    if (this.data.posterBusy || this.data.posterHasCard) return
    const dx = (e.changedTouches[0] || {}).clientX - this._touchStartX
    if (Math.abs(dx) < 60) return
    this._advanceTemplate(dx < 0 ? 1 : -1)
  },

  // v7 ⑤：按合并后那份模板列表（包内 ∪ 下发）的顺序走，走到头就滑不动、不循环（效果图原话）。
  async _advanceTemplate(delta) {
    const list = poster.templateList()
    const cur = list.findIndex((x) => x.id === this.data.posterTpl)
    const next = list[(cur < 0 ? 0 : cur) + delta]
    if (!next) return
    this.setData({
      posterTpl: next.id,
      posterTplName: poster.templateLabel(next.id, this.data.lang),
      posterBusy: true,
    })
    // 名字写在屏上那一行，不再发 toast：同一件事不留两处，而且原来那一枚 1.2 秒的 toast
    // 就压在画布出图那一趟上（站长 10-17 深夜「以前还有提醒模板名称的，现在好像看不见」）。
    this._lastTplId = next.id
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
  // 10-04 那条"从卡片那一格的小图直接开大图，收掉就回到卡片那一屏"（`_posterFrom === 'grid'`）
  // 随卡片那一屏一起撤：现在只剩详情窗那一条入口，`_posterFrom` 这个分支没有第二种取值了。
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
      posterHasCard: false,
    })
    // 生成海报这一步已经把这篇的码建出来了，公开状态得跟着刷新，
    // 否则详情窗里那行「已经公开」永远不显示。
    if (note) this._loadShareStatus(note.id)
  },

  onCancelTemplate() { this._closeTemplate() },
  onHandleTap() { this._closeTemplate() },

  // 大图底下左端那枚原来是「取消」，站长 10-04 要它改成「查看笔记」，点了进这篇的独立详情页。
  // 收窗那两条口没动（顶上「点一下收起」+ 点窗外那层遮罩），所以撤掉这枚"退出"不让人困在里面。
  // 先走 _closeTemplate 再跳：浮层状态留在页面上，从详情页返回会看见一张还盖着的大图
  // （而且 `_closeTemplate` 把 posterImagePath 清了，留下的是一张空窗）。
  // 原来这一趟还要打一个 `_keepView`，好让回来仍站在他自己那一枚 tab 上（10-06 真机报的
  // 就是"被无条件甩回第一枚"）——合一之后只剩一屏，那个标记随两枚 tab 一起撤了。
  onViewNote() {
    const note = this.data.posterNote
    if (!note) return
    this._closeTemplate()
    wx.navigateTo({ url: `/pages/detail/detail?id=${note.id}` })
  },

  // 站长 10-01：账号认证下来了，图片分享能力可以接。这枚按钮从"存进相册"换成弹微信那个
  // 五枚一排的图片面板（发送给朋友 / 分享到朋友圈 / 收藏 / 保存图片 / 转发为贴图），存和发一次给完。
  // 这个面板只在真机有——开发者工具里一定 fail，所以那条路退回"直接存相册"，不让人白点一次。
  // 站长 10-02 iPhone 11：面板自己是半透明的底，我们那一页（弹窗、取消/分享、底栏、
  // 另一张码）全从它背后透出来，看着杂乱无章。面板那层压不住（微信的），能压的只有它底下这一页：
  // 拉起之前先整屏盖成纯黑，面板一收（成功、取消、失败三条口都走 complete）就把这层撤掉。
  // 已生成态那枚通栏：发的就是台账里那一张（弹窗这一态换不了模板，所以画布上这张＝留档那张），
  // 因此**一次都不记账**——记账只挂在"第一次真留下这张"那一步（§8.99）。
  // 面板打不开就退回存这张原图，不走 _saveToAlbum()：那一条会重画画布并再记一笔。
  onShareCard() {
    const path = this.data.posterImagePath
    if (!path) return
    const lang = this.data.lang
    this.setData({ shareDim: true })
    wx.showShareImageMenu({
      path,
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        if (msg.indexOf('cancel') >= 0) return
        wx.saveImageToPhotosAlbum({
          filePath: path,
          success: () => wx.showToast({ title: t('savedToAlbum', lang), icon: 'success' }),
          fail: () => wx.showToast({ title: t('exportFailed', lang), icon: 'none' }),
        })
      },
      complete: () => this.setData({ shareDim: false }),
    })
  },

  /* 站长 10-17 深夜这一句改的是**次序**：「生成完，自动保存图片到手机，然后等用户选择分享路径。
     用户再点保存图片，就静默。」
     原来这一枚只开微信那排面板（保存那一步藏在面板里），存相册只是面板打不开时的退路；
     现在按下去是三步：① 这张进相册 → ② 记台账（`_keepPoster`，生成即上传那条链在这一步里）
     → ③ 把面板开起来让他自己挑发给谁。
     ⚠ 幂等判据用的是那张临时文件的路径本身：`_renderPoster` 每换一次模板就出一张新文件，
     所以"滑到另一套模板再按"照旧真存，不会被这一句挡掉；同一张再按才是他说的"静默"。
     ⚠ 面板里那一枚「保存图片」是微信系统层（样式与行为都不归我们管），他真的再点一次，
     相册里就是两张——这一条我们拦不住，所以不拿"已存过"当借口把面板关掉。 */
  onSavePoster() {
    const path = this.data.posterImagePath
    if (!path) return
    if (this._savedPosterPath === path) { this._openShareMenu(path); return }
    this._saveToAlbum(path)
  },

  _saveToAlbum(path) {
    const { lang } = this.data
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: async () => {
        this._savedPosterPath = path
        await this._keepPoster()
        wx.showToast({ title: t('savedToAlbum', lang), icon: 'success' })
        this._openShareMenu(path)
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        if (msg.indexOf('auth') >= 0) {
          // 没给相册权限：只给这一句引导，这一趟不开面板——两层系统浮层叠着会互相压住
          // （10-12 那条"先浮密码面板再收详情窗，面板就画在窗底下"是同一类坑）。
          // 他去设置里开完回来再按一次，那一趟就是正常那一趟。
          wx.showModal({
            title: t('needAlbumPermission', lang),
            content: t('permissionHint', lang),
            success: (res) => { if (res.confirm) wx.openSetting() },
          })
          return
        }
        // 存不成功（拒绝授权那一支走 cancel，不报错）不该把分享这条路一起堵死
        if (msg.indexOf('cancel') < 0) wx.showToast({ title: t('exportFailed', lang), icon: 'none' })
        this._openShareMenu(path)
      },
    })
  },

  // 微信那排面板只在真机有——开发者工具里一定 fail，所以那条路什么都不做：
  // 图已经在相册里了，再报一句"导出失败"是骗人。台账在存那一步已经记过，这里成功只收窗，
  // 不记第二笔（一篇一张是这本账自己的规则）。
  _openShareMenu(path) {
    this.setData({ shareDim: true })
    wx.showShareImageMenu({
      path,
      success: () => this._closeTemplate(),
      fail: () => {},
      complete: () => this.setData({ shareDim: false }),
    })
  },

  // v12：列表不再整页滚，Page.onReachBottom 这一辈子都不会再触发，
  // 取下一批改挂在 scroll-view 的 bindscrolltolower 上。
  onListToLower() {
    this.onLoadMore()
  },

  // ---------- 「卡片上的信息」（站长 10-03：出卡片这一屏要能就地改名片） ----------
  // 实现收在 utils/cardInfo.js（笔记卡片页 10-07 也要同一层，两处改的是同一份数据，
  // 各写一份迟早变成"同一张卡在两个入口改出来不一样"）。这一页只给两个钩子。

  // 首页头部那张也吃这四个槽（「背景」那一枚），而 bgSrc 只在 onShow 重取——
  // 这一层不跳页，不顺手带一下，收掉弹窗之后头部还是旧照片。
  _ciAfterCommit() {
    return { bgSrc: poster.homeBg() }
  },

  // 收窗且真动过：成品弹窗开着就得把这一张重画一遍，否则弹窗里看到的还是旧头像旧名字。
  _ciAfterChange() {
    if (!this.data.templateOpen) return
    this.setData({ posterBusy: true })
    this._renderPoster().catch((err) => {
      console.error('改完名片重画失败', err)
      wx.showToast({ title: t('generateFailed', this.data.lang), icon: 'none' })
      this.setData({ posterBusy: false })
    })
  },

  ...cardInfo.handlers,

  // 「删除」这一枚：把这篇的卡片整条撤掉——**服务器那一行 + 云上那个对象 + 本机这本账与位图**。
  // 删完回详情窗，右上那一格退回"没生成过卡片"那一态（淡底方形＋加号），想再要就重新生成一张。
  // shares 那张活码一行都不碰，所以"已分享的依旧有效"（站长 10-03 23:40 要的那句小字）。
  //
  // 2.0.1 S2 起这一枚多了一步：判据已经在服务器上，只清本机就是**那一格删不掉**——下一次进
  // 详情页又从云上读回来画上去。顺序是"先撤服务器、撤成了才清本机"：反过来做，云上那个对象
  // 就没人记得要去删了（对象只有客户端删得动），而它一直占着全站那 5GB。
  // 撤不成（离线、后端在重启）就当这一格没删：屏上照原样留着 + 一句实话，不做半截。
  onDropCard() {
    const note = this.data.posterNote
    if (!note) return
    const { lang } = this.data
    // 这枚「删除」点下去当场就删（本机留档 + 那张位图），没有撤销，所以门口拦一道。
    // 文案吃现成那句 `cardDropHint`（弹窗底排本来就写着），说的是卡片不是笔记。
    // 按钮一律用系统默认那对（确定／取消）：自定义 confirmText 超 4 字会被静默截断。
    wx.showModal({
      title: t('confirmDelete', lang),
      content: t('cardDropHint', lang),
      success: async (res) => {
        if (!res.confirm) return
        const dropped = await cardCloud.dropServer(note.id)
        if (dropped !== true) {
          // 服务端真回了一句原因的（10-14 那道「自带那一篇的卡片删不掉」）就照实念，
          // 不许念成"没连上后端"——那会让人以为是网络问题，然后反复点。
          // 没有原因的那种才是离线／后端没回，仍走原来那句实话。
          wx.showToast({
            title: typeof dropped === 'string' ? dropped : t('cardDropOffline', lang),
            icon: 'none',
            duration: 2000,
          })
          return
        }
        // 本机那本账与服务器读回来那一份一起忘掉（一个出处，见 cardCloud.forget）：
        // 只清本机那一半，下一次进详情页又从云上读回来画上去——那一格就成了"删不掉"。
        cardCloud.forget(note.id)
        this._closeTemplate()
        this.setData(this.arrange(this.data.notes))
      },
    })
  },

})
