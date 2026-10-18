const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { TIP_DOT, createSkin } = require('../../utils/palette.js')
const poster = require('../../utils/poster.js')
const cloudUpload = require('../../utils/cloudUpload.js')
const assetQueue = require('../../utils/assetQueue.js')
const { compressForBackup } = require('../../utils/imageCompress.js')
const person = require('../../utils/person.js')
const bgTone = require('../../utils/imgBrightness.js')
const mpAssets = require('../../utils/mpAssets.js')
const cardInfo = require('../../utils/cardInfo.js')

/* 深浅分两截判（站长 10-12 21:1x：「请按照上下部分来分别判断，避免全图平均，造成差异」）。
   这一页上截＝左上角那行大字与那枚标题图（实测落在屏高 9%~16%），
   下截＝「调亮度／换背景／换心情」那一行与「返回」那一枚（10-14 把这一行搬到面板上方之后
   它从 20% 掉到 **58.8%~64.8%**，探针量的帧：顶 443pt／底 488pt，框高 753pt ⇒ 归低带管，
   不再归上截；这句是 10-15 跟着改的，原来这里写的是"那一行实测在 20%"）；
   下面那三块面板自己有白底，不吃这一档，所以下截只取到 85%。
   ⚠ 两截都**贴着字所在的那一小段**取，不是"屏对半切"：上截 0~28% 里只有那行大字与标题图，
   再多就把中段空白算进平均了；下截 55%~85%（那一行工具条与「返回」都在这一段）。
   首页这张图是 `.page-bg`（750×100vh，`aspectFill` 居中裁）⇒ anchor 0.5，
   与另外两页那枚全站 15% 不是同一个取景，别抄。 */
function toneZones() {
  const wi = wx.getWindowInfo()
  return {
    boxH: Math.round((wi.windowHeight * 750) / wi.windowWidth),
    anchor: 0.5,
    top: [0, 0.28],
    low: [0.55, 0.85],
  }
}

// 链接规范：必须有协议头、主机名里要有顶级域、整串不能出现空白。
// 之前只判"以 http 开头且某处有个点"，`https://a.com 后面还有字` 和 `http:///a.b` 都能过，
// 到了服务端才失败，用户在卡里看到的是一句和输入对不上的错。
const LINK_RE = /^https?:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?(\/[^\s]*)?$/i

function isLink(value) {
  const s = (value || '').trim()
  if (!s || /\s/.test(s)) return false
  return LINK_RE.test(s)
}

/**
 * 「文字」那一档的标题：10-08 从面板上撤了（站长原话「标题和分类在详情页再修改」），
 * 但服务端那道 schema 要一个非空标题（IngestTextIn.title 是 min_length=1），
 * 所以这里从贴进来的原文里取第一行当标题——和 Bear / Notion 那个"首行即标题"的约定一致，
 * 落库之后在详情页「编辑」那一格随时改。取完剥掉头部的 # > * - 这类记号，截到 50 字
 * （列表那一行也放不下更长，而服务端 MAX_TITLE 是 500，不会顶）。
 *
 * ⚠️ 另一条路是"让模型起标题"（提炼那条链本来就出了一份 title，手打这一档现在不用它）。
 * 那条更准，但要动后端两处 + 部署，本轮没做，记在产品需求里待拍。
 */
function titleFromText(content) {
  const line = (content || '').split('\n').map((s) => s.trim()).find(Boolean) || ''
  const cleaned = line.replace(/^[#>*\-\s]+/, '').trim()
  const title = cleaned || line
  return title.length > 50 ? title.slice(0, 50) : title
}

/* 一篇笔记选几张图。这个数**跨语言有两份**（这里一份、服务端 `models/asset.py`
   的 MAX_ASSETS_PER_NOTE 一份），合成不了，所以规矩是"每一侧只写一次 + 两边同值"，
   由 docs/工具/验-张数只有一个出处.js 守着。
   10-08 起这里**不再自己截一刀**：满了就不让再开选择器（给一句吐司），没满时把"还能选几张"
   交给系统选择器（count = 剩余位），所以选得上来的必然装得下，slice 那一刀没有存在必要了。
   原来那刀是静默的：选了 12 张只留 9 张，界面上一句都不说。 */
const MAX_SHOTS = 9

/* 一行放五格（小图 100 + 间距 16，五格 = 564 ≤ 卡内宽 586）。
   这个数是 WXSS 的几何事实，不是拍的：上限 9 张 + ➕ 那一格 = 10 格，
   五列是"展开只多一行"（两行放得下）的最小列数。改 .strip 的列数要连着改这里。
   卡内宽 10-10 从 566 变 586（面板内边距 32→24 让出来的），10-14 再变 598（卡内边距 30→24
   让出来的，站长那一句「排版紧凑一点」），列数两回都没跟着变。 */
const ROW_CELLS = 5

/* 右滑那一枚的行程（rpx，与 create.wxss 里那三个数一一对上，改样式要连着改）：
   轨道内宽 = 卡内宽 598 − 自己那圈同色边 5×2 = 588；圆 90；左边内缩 10。
   停在最右那一格 left = 588 − 90 − 10 = 488，所以行程 478。
   10-10 面板压进红框之前这三个数算的是 456／446——`验-统一录入条.js` 有一条专门钉
   "JS 里这个数 == 轨道内宽 − 圆宽 − 左内缩"，只改样式不改这里就会红。
   这里按 rpx 走而不查节点：手指位移换算成 rpx 只需要 windowWidth（微信 rpx = 屏宽/750），
   一次同步读取就够了，省下 touchstart 那一趟异步查询——快速一划就会掉在查询回来之前。 */
const SLD_REST_RPX = 10
const SLD_MAX_RPX = 488
// 差 12rpx 就算到位（手指按在圆右缘上再往外划不出这 12，宁可让人划到底也不要"差一点没反应"）
const SLD_SLOP_RPX = 12
// 报错气泡在屏上停多久（站长 10-10 深夜只说了"几秒后消失"，没给数）。
// 3600ms 是"读完最长那句（英文 43 个字母）再抬眼"的那一档；再短会让人怀疑自己看漏了。
const HINT_MS = 3600

/* 照片那一档「粘贴」小圆等多久算"读不出文字"。这一枚不是拍的：10-16 在模拟器里做过 A/B—
   剪贴板放纯文本时 getClipboardData 立刻回 success；放图片（pbpaste 侧确认是 «class PNGf» 41582 字节）
   时 success 与 fail 两个回调六秒一个都没回来。图片这条平台根本不给东西，所以只能靠"没有回话"
   认出它，然后说一句实话。2000ms 是"点了没反应、该给一句"那一档，比 HINT_MS 短。 */
const PASTE_WAIT_MS = 2000

/* 左块那一张人物与它的剪影：键名、两张路径、谁在前都在 utils/person.js（列表页那两处要画同一个人）。
   10-10 深夜改口：换性别不再靠"连点两下"，改成点右后方那枚淡灰剪影换位（见 swapPerson）。 */

Page({
  data: {
    lang: 'zh',
    t: texts('zh'),
    // 未登录/首帧的占位：类名必须真的存在。四枚壁纸里象牙是 THEMES[0]，五档心情里墨是 MOODS[0]，
    // 而墨那一档的九枚玻璃数与 page{} 那份兜底逐字相同 ⇒ 这一帧就算没等到 applyTheme 也不会花。
    themeClass: 'theme-tint-paper mood-ink',
    // 「换心情」那一枚的挡手位：同一帧连点两下会发两次 PUT（与 pages/wallpaper 那条 applying 同一个理由）。
    moodBusy: false,
    // 展开的是哪一档：'' | 'photo' | 'url' | 'write'，同一时刻最多一个。
    // 10-08 起相册不再是独立的一档（它是「照片」那一态左边那枚小圆），所以 mode 那一位也撤了：
    // 面板上只有三个标签，一个真相。
    active: '',
    // 面板的两档高度：收起 372、展开 490（只多一行，10-14 压过一档）。由 _syncPanelOpen 现算，
    // 别在调用点手写 true/false——两个入口（原文框聚焦 / 图多了排不下）会各说一套。
    panelOpen: false,
    // 键盘顶起来时整块面板的抬量（px，0＝键盘不在）。站长 10-16 真机报「原文翻译那一行被输入框
    // 遮挡了，所以要抬高」——微信默认的 adjust-position 只保证**光标**露出来，而光标在框里，
    // 所以框露了、框下面那行「原文翻译」与右滑那一枚还压在键盘底下。改成自己抬，见 onKeyboardHeight。
    kbLift: 0,
    busy: '',
    errLine: '',
    // 框外那一行实际说的话：报错优先，其次"链接那一格正在输、但还不像链接"那句规则。
    // 现网原来是用 urlHint==='bad' 单独驱动一行的，改成一位驱动就不是两份真相（见 _sync）。
    hintLine: '',
    errPerm: false,
    urlInput: '',
    urlHint: 'idle',
    previewImages: [],
    shotsFull: false,
    writeBody: '',
    // 原文框有没有焦点：它是「文字」那一档展开/收起的唯一开关。
    bodyFocus: false,
    // 「原文翻译」那枚小开关。站长 10-04 要它的时候默认关；10-16 改口「默认是翻译，关闭就不翻译」
    // ⇒ 默认**开**＝摘要一律整理成中文，关掉才跟随原文的语言。同一句里他还要求「三个tab全局都可用」，
    // 所以这一位不再只服务文字档：链接抓来的正文与照片 OCR 出来的字，提炼前是同一串文本，共用这一位。
    // ⚠ 复位那一处（`_extractDone` 的 patch）必须跟着回到 true：只改默认不改那里，第一篇存成功之后
    // 默认就悄悄变回关了——那是第二份真相，屏上看不出来。
    writeTranslate: true,
    // 右滑那一枚的四个态（待滑 / 拖动中 / 就位 / 完成）都靠这几位说话。
    ready: false,   // 这一格有没有东西可提交（决定那枚圆让不让你拖，10-10 深夜起不再决定它的颜色）
    dragging: false,
    done: false,    // 完成那一帧：整条转实心 + 白环仍在，紧接着吐司再跳详情页
    knobRpx: SLD_REST_RPX,
    fillPct: 0,
    sldIcon: 'pen',
    // 四个入口各自的饱和色，色值和字色配对仍归 palette 管。
    // 条身那三枚小圆的色随那三枚一起撤了（10-09）；面板那一整套浅面仍由 createSkin() 一次发下来，
    // 10-10 起它要吃当前壁纸那一档层色（站长拿效果图 c5 打回的浅面，见 palette.js 那段注释）。
    // 2.2 B 方案：这一整套变量改挂在**容器**上（原来挂在 .panel 那一枚元素上），
    // 因为首屏那枚圆形 ➕ 要吃的 `--cp-cam` 在 .panel 外面（与第二屏快门同一支色）。
    // 这里不带参数是故意的：data 在模块加载时就求值，那时 `getApp()` 还没有，
    // 空参回落到色板第一枚（象牙），每次进页由 onShow 拿真壁纸覆盖。
    skinPanel: createSkin(),
    // 收起态那三块原来吃的一整套 `--eb-*`（palette.entryBlocks() 从壁纸派生）随 2.2 B 方案一起退：
    // 右两枚计数块被他撤了（「右侧两块去掉」），左块那两条白条也被两片新皮替了
    // （白面渐变毛玻璃 ＋ 墨面渐变毛玻璃，都是中性色，不吃壁纸）。
    // 左块那一张人物 + 右后方那枚剪影：初值按本机存的那一性读，没存过就是女。
    ...person.figure(),
    // 右两枚的计数。两个数都是装饰性的读数，拉不到就画 0（沿用笔记页那一条口径：
    // 空着或画杠读起来像坏了），但拉取本身绝不许把这一屏拖挂。
    noteCount: 0,
    imageCount: 0,
    // 首页背景：'' 表示这一屏不铺图（用户在外观设置里关掉了）
    bgSrc: '',
    // 这张背景图是浅色（字翻墨、罩子翻提亮）：每次进页由 bgTone.applyTone 定，
    // 本机算过就直接给对的第一帧，没算过先按深底出字、采样回来那一趟再翻。
    bgLight: false,
    bgLightLow: false,
    // 10-15 03:2x 起再加几格：那几枚各按**自己那块矩形**判一次（`toneRects`），
    // 不再共用上面那两截整幅宽的带。名字跟着元素走：标题图／那一行整条／第二屏的返回。
    // ⚠ 10-15 09:2x 那一行**并回一个矩形**（站长原话「首屏下面三个设置，深浅字要一致，
    //   现在是左边两个黑，右边一个白，不合理。要一致」）：三枚各判是上一刀做的，
    //   它把"浅底浅字"修好了却把这一行拆成两种极性 —— 他要的是同一行同一个色。
    //   判的还是**那一行自己那块矩形**（`.home-swap` 的框），不是整条横带、更不是全屏，
    //   所以 03:2x 那句"不需要全屏计算"仍然成立。代价一条见 create.wxss 那一条注释。
    bgLightTitle: false,
    bgLightSwap: false,
    bgLightOut: false,
    // 背景深浅那一档：初值给中档（站长 10-02 夜里定的默认档，也是 app.bgSkin() 在本机读不到
    // 键时回落的那一档），免得第一帧先闪一下别的深浅。三样每次进页由 app.bgSkin() 重读。
    dimV: 1,
    dimDot: '',
    dimScrim: '',
    // 横条上面那一行轮播 Tips（站长 10-01 晚）：句子整批从 i18n 取，界面按 tipIdx 指哪一句。
    // 空数组是"这一档还没有可提示的"，模板整行不渲染，不会留一条空行。
    tips: [],
    tipIdx: 0,
    tipsPrefix: t('tipsPrefix', 'zh'),
    // Tips 前面那枚小黄点（站长 10-01 晚：象征小灯泡）。色值必须由 palette 发下来：
    // `验-统一录入条.js` 专门扫 create.wxss 里有没有 #F6C445，写进样式表就红。
    tipDotStyle: 'background:' + TIP_DOT,
    // 语言角标前面那枚小黄点（站长 10-15 14:0x「中 EN 的下划线去掉，不要加粗，前面加小黄点就行」）。
    // 与上面那句 Tips 的点**同一支色、同一个出口**：色值只从 palette 来，一次都不许写进 WXSS。
    langDotStyle: 'background:' + TIP_DOT,
    // 「卡片上的信息」那一层那四个键由 utils/cardInfo.js 给初值（三页共用一份，别各写一份）。
    ...cardInfo.initial(),
  },

  // 横条上面那一行轮播 Tips：六句教人用现成的能力（拍照提炼、链接、分享选模板、
  // 卡片那枚「分享」、私密那一格、外观）。
  // 站长 10-15「Tips 改为后台配置」⇒ 现在**两份来源**：后台下发那份优先，拿不到才落回 i18n。
  // 顺序不许倒过来判：包里那六句是兜底真相，下发那一头坏了（没拉到、停用了、数组是空）
  // 屏上必须还有字，而不是那一行整条消失（`wx:if="{{tips.length}}"` 会把空数组渲染成没有这一行）。
  // 下发也不走"合并"：一次下发＝整份替换，与卡片模板那条同纪律，撤回才能秒级生效。
  tipsFor(lang) {
    const remote = mpAssets.serverTips(lang)
    const arr = remote || t('tips', lang)
    return Array.isArray(arr) ? arr : []
  },

  // 一句停 8 秒（站长 10-01 晚：4 秒"还没看完就跳下一条了"，慢一倍）。
  // 小于两句就不起表（只有一句时它不该自己跳，也没有可跳的）。
  // 定时器挂在实例上、不进 data：它是节奏不是状态，进 data 只会多一堆无意义的 setData。
  startTips() {
    this.stopTips()
    const n = this.data.tips.length
    if (n < 2) return
    this._tipTimer = setInterval(() => {
      this.setData({ tipIdx: (this.data.tipIdx + 1) % n })
    }, 8000)
  },

  // 离开这一页就停：切到别的 tab 之后这一屏不再渲染，表还在跑就是白耗电，
  // 而且回来时第一句会是随机某一条、不像"从头讲起"。
  stopTips() {
    if (this._tipTimer) {
      clearInterval(this._tipTimer)
      this._tipTimer = null
    }
  },

  onHide() {
    this.stopTips()
    // 那一格进度表也是同一个道理：这一屏不在前面了，别再空转 setData。
    // ⚠️ 只停表不清 busy——提炼那条请求还在飞，回来还要接着说话（见下面 _extractDone 的注释）。
    this.stopProgress()
    // 气泡那枚"几秒后消失"的表也要撤：人在别的 tab 上时不该有个定时器还想着这一屏。
    this._clearHint()
  },

  onUnload() {
    this.stopTips()
    this.stopProgress()
    this._clearHint()
  },

  // onShow 只同步主题/语言/tab，**绝不重置草稿**。
  // 真机实测：从相机或相册返回时小程序会补发一次 onShow，一旦在这里清 previewImages
  // 和 active，刚选好的图就凭空消失、面板自己收起，界面上不留任何痕迹——
  // 这就是"选完照片没反应、也没提示"的成因。草稿改在保存成功后各自清。
  async onShow() {
    const app = getApp()
    // 新建页现在是启动页，冷启动时登录还没回来。不等一下就取 globalData，
    // 英文用户会在第一屏看到中文，切个 tab 才变——所以先等登录这条链。
    await app.getLoginPromise().catch(() => {})
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass: app.applyTheme(app.getWallpaper()),
      // 这一整套 `--cp-*` 现在发在容器上（首屏那枚圆形 ➕ 与第二屏那块面板共用同一支橙），
      // 里面唯一随壁纸走的是层色 `--cp-panel`，每次进页重算；圆形 ➕ 吃的那两档是固定值，
      // 换壁纸不会让它变，但仍是同一趟 setData 带下来，出口只有一个。
      skinPanel: createSkin(app.getWallpaper()),
      // 三块那套 `--eb-*` 随 2.2 B 方案撤干净（右两枚没了、左块换了两片中性的皮）：
      // 漏在这里删掉而 wxml 还留着 `style="{{blkSkin}}"` 的话，三块会静默变透明——
      // 所以那一位也从模板里一起删了，`验-第一屏三块.js` 钉的是"模板里没有 blkSkin"。
      // 每次进页重取：在分享形象页换完图返回，这一屏就该跟着换（onShow 不碰草稿，见上面那段注释）。
      bgSrc: poster.homeBg(),
      // 背景深浅那一档也是每次进页重读：在「我的」页里改过、或别的 tab 点过那枚点，回到这一屏就该跟上。
      ...app.bgSkin(),
      // Tips 跟着语言整批换（英文态不能看到六句中文），并从第 1 句起重播
      tips: this.tipsFor(lang),
      tipIdx: 0,
      tipsPrefix: t('tipsPrefix', lang),
    })
    // 从详情页返回、或从相机/相册回来：这一枚要退回"待滑"那一帧，再把那三位重算一遍。
    // 忙态进行中什么都不动（提炼那条请求还在飞，那一帧正该停在原位）。
    if (!this.data.busy) {
      this.setData({ done: false, fillPct: 0, dragging: false, knobRpx: SLD_REST_RPX })
    }
    this._sync()
    app.setNavTitle('appName', lang)
    // 深浅这一档与导航条同一趟给（applyTone 里读缓存→出字→设导航条；这张图没算过时异步补算）。
    bgTone.applyTone(this, this.data.bgSrc, toneZones())
    // 再按**元素自己那块矩形**各判一次（站长 10-15 03:2x 那一刀，见下面 `toneRects` 那段）。
    this.toneRects()
    this.startTips()
    this.loadEntryStats()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateLabels()
      this.getTabBar().applyTheme(app.getWallpaper())
      this.getTabBar().setData({ selected: 0 })
    }
  },

  hintFor(value) {
    const s = (value || '').trim()
    if (!s) return 'idle'
    return isLink(s) ? 'ok' : 'bad'
  },

  /**
   * 说一句"这一格现在不对"。10-10 深夜起所有输入类报错只有这一条通道：
   * errLine → _sync → hintLine → 输入框上方那枚气泡（几秒自己走）。
   * 原来这些是散在六处的 `wx.showToast`，同一件事两种说法、两个位置——
   * 他的原话是"所有输入错误提示都用这种方式"。
   * ⚠ 两件事没并进来，是故意的：语言切换失败（收起态也会发生，那时没有面板、气泡无处浮）
   *   与「已存入笔记」那声成功（不是报错）。
   */
  sayErr(msg, perm) {
    this.setData({ errLine: msg, errPerm: !!perm })
    this._sync()
  },

  // 面板上"这一格能不能提交"由三档各自的条件拼出来，而这一位同时决定
  // 圆的颜色（实心/灰）与滑到底触不触发。判据与三个 submit 里的校验逐字一致，
  // 所以不会出现"看着能滑、滑到底报一句不能提交"。
  readyFor() {
    const { active, urlHint, writeBody, previewImages } = this.data
    if (active === 'url') return urlHint === 'ok'
    if (active === 'write') return !!writeBody.trim()
    return previewImages.length > 0
  },

  // 一处算、三处用（ready / shotsFull / panelOpen 都从当前状态推出来）。
  // 每次动到 urlInput、writeBody、previewImages、active 都要过一遍，
  // 漏一处就是"界面停在上一档的样子"。
  _sync() {
    const { active, previewImages, errLine, urlHint, lang } = this.data
    const patch = {
      ready: this.readyFor(),
      // 报错优先；没有报错时，链接那一档"正在输但不像链接"仍然要说一句（现网就是这么演的：
      // 那行规则字跟着 urlHint 走，不是等点下去才说）。
      hintLine: errLine || (active === 'url' && urlHint === 'bad' ? t('linkRule', lang) : ''),
      shotsFull: previewImages.length >= MAX_SHOTS,
      // 「文字」那一档的展开由原文框的焦点说话；「照片」那一档由"这一行放不下了"说话
      // （5 格是行宽，第 6 格起要第二排）。链接只有单行输入，永远不展开。
      panelOpen: active === 'write' ? this.data.bodyFocus
        : active === 'photo' && previewImages.length + 1 > ROW_CELLS,
    }
    this.setData(patch)
    // 气泡"几秒后消失"（站长 10-10 深夜那句）。计时挂在算出这一位之后，不在各个报错点各排一次——
    // 那样会有人忘了排；同一趟里再报一句就把表重头走，读的人看到的是"这条是新的"。
    if (patch.hintLine) this._armHint()
    else this._clearHint()
  },

  _armHint() {
    this._clearHint()
    this._hintTimer = setTimeout(() => {
      this._hintTimer = null
      // 只收气泡，不清 errLine 本身：那一位是"这一格现在有没有错"的状态，
      // 下一次 _sync 还会按它重算（真要在屏上再看一次，重新触发一次校验就有）。
      this.setData({ hintLine: '' })
    }, HINT_MS)
  },

  _clearHint() {
    if (this._hintTimer) { clearTimeout(this._hintTimer); this._hintTimer = null }
  },

  // 气泡整枚可点：只有权限那一类有地方可去（直接进设置），其余只是读。
  // 为什么不在 wxml 里写 `catchtap="{{errPerm ? 'a' : 'b'}}"`：事件名那一位要的是静态字符串。
  onHintTap() {
    if (!this.data.errPerm) return
    this.openPermSetting()
  },

  // 滑动条圆里那枚图形跟着三档走：照片=叠图、链接=链环、文字=钢笔。
  // 这三支和底栏那三支是同一套 Lucide 几何（见 create.wxss 那一段注释）。
  // 收起态那一枚不归这里管：白条那枚快门（.blk-cam）随 2.2 B 方案撤了，
  // 首屏现在唯一的图形是右列那枚圆形 ➕（.blk-plus-glyph，样式表里直接挂 glyph-plus，也不吃这一位）。
  sldIconFor(active) {
    return { photo: 'images', url: 'link', write: 'pen' }[active] || 'pen'
  },

  open(active) {
    this.setData({
      active,
      sldIcon: this.sldIconFor(active),
      errLine: '',
      hintLine: '',
      errPerm: false,
      urlHint: this.hintFor(this.data.urlInput),
      // 每一档进来都从"待滑"那一帧起：圆停在最左、轨道全白。
      knobRpx: SLD_REST_RPX,
      fillPct: 0,
      done: false,
      dragging: false,
    })
    this._sync()
    // 展开那一态才有 `.out`（第二屏框外那枚「返回」）⇒ 它的矩形此刻才量得到，这一趟补上它。
    this.toneRects()
  },

  /** 站长 10-15 03:2x「计算深浅背景区域**仅限文字图片覆盖的区域**的平均值，不需要全屏计算。
   *   包括三块设置也是只计算下方三行区域的平均值颜色」⇒ 这三枚各按自己那块矩形判一次深浅，
   *   不再共用"上下两截"那两条整幅宽的带。
   *  折算很直接：这一屏的形象图那只盒子（`.page-bg`）就是 750rpx × 100vh、铺满视口，
   *  所以元素在屏上的像素矩形 ÷ 视口宽高＝盒子比例，不用另算偏移、也不用管图片怎么裁。
   *  ⚠ `.out` 只有展开那一态在屏上，收起态根本不渲染 ⇒ 摸不到就不写那一格（宁可留上一帧的值，
   *  也不按"整幅一条"猜一个），`open()` 里会再量一次。
   *  ⚠ 那枚标题图是 `mode="widthFix"`：高度要等图本身回来才定，第一帧常常量到 0。
   *  所以这一趟**跑两遍**（立刻一次、400ms 后补一次）——第二遍才是给标题用的。
   *  判据 `验-第一屏三块-真跑` 里钉的是"这三格各自与它那块矩形的实测均值同向"，
   *  少跑这一趟那一格就是红的。 */
  toneRects() {
    const once = () => {
      const wi = wx.getWindowInfo()
      // ⚠ 不带 `.in(this)`：那是给**自定义组件**划作用域用的，页面实例递进去这份查询直接回空，
      //   于是三格 data 一个都没写、屏上就是"三枚全按深底出白字"，而一句错都不报。
      //   正本抄 `pages/index/index.js` 那句 `.select('.tpl-body').boundingClientRect(...)`。
      const q = wx.createSelectorQuery()
      q.select('.page-title').boundingClientRect()
      // 那一行只量**整条一次**（`.home-swap` 自己的框：space-between 把三枚顶到两端，
      // 这一枚的框就等于三枚并起来那一块）。10-15 09:2x 之前这里是三枚各 select 一次，
      // 判出三种极性，站长打回"要一致"——见 data 里 `bgLightSwap` 那一段。
      q.select('.home-swap').boundingClientRect()
      q.select('.out').boundingClientRect()
      q.exec((r) => {
        const list = r || []
        const rect = (n) => (n && n.width > 0 && n.height > 0
          ? {
            x: [n.left / wi.windowWidth, (n.left + n.width) / wi.windowWidth],
            y: [n.top / wi.windowHeight, (n.top + n.height) / wi.windowHeight],
          }
          : null)
        const rects = {}
        const put = (key, n) => {
          const v = rect(n)
          if (v) rects[key] = v
        }
        put('title', list[0])
        put('swap', list[1])
        put('out', list[2])
        bgTone.applyRects(this, this.data.bgSrc, toneZones(), rects)
      })
    }
    once()
    setTimeout(once, 400)
  },

  // 点条身 = 「照片」那一档（这一屏第一眼就该是那枚快门）。
  // 原来点条身进的是「直接写」，10-08 那轮把默认档换成照片：
  // 站长的原话是"拍照是大按钮、其他的用小按钮"，那一大钮就是这一屏的门面。
  // 10-10 晚条身换成左块人物，这一句就是左块那一点的行为（中间没有定时器延它）。
  openBar() {
    if (this.data.busy) return
    if (this.data.active) { this.collapse(); return }
    this.open('photo')
  },

  /**
   * 点右后方那枚剪影 = 换到那一个人（站长 10-10 深夜改的口，原话「两个人切换体验不太好，
   * 改为左右有人点击右侧人像切换」）。以前是"连点左块两下"，代价是每一次打开面板都要先
   * 被一枚 300ms 定时器延住——那一下的手感就是他打回这一版的理由。
   * 现在左块那一点直接开门（openBar，零延迟），换人只走剪影那一枚。
   * 只换图，不动 active／草稿／忙态——这一屏别的什么都不该因为换张图而变。
   */
  swapPerson() {
    const next = person.other(this.data.personKey)
    person.remember(next)
    this.setData(person.figure(next))
  },

  /**
   * 右两枚的计数。两个口各自独立：笔记数拉不到不影响图片数那一格，反之也一样。
   * 口径与笔记页那一列一致（读不到当 0，不画杠也不留空），且整块包在 try 里——
   * 这两个数是装饰，绝不能把这一屏的门面拖挂。
   */
  async loadEntryStats() {
    try {
      const q = await api.getQuota()
      this.setData({ noteCount: typeof q.used === 'number' && isFinite(q.used) ? q.used : 0 })
    } catch (err) {
      console.warn('笔记那一格的数没读到（不影响界面）', err && (err.errMsg || err.statusCode))
      this.setData({ noteCount: 0 })
    }
    try {
      // 站长 10-18「把首屏左下角的『卡片』和上面的『数量』，改为图片和数量」⇒ 这一枚数的是
      // 名下笔记的配图张数，与服务端那一行配额同一个出处（`storage-quota` 的 `user_count`，
      // 按 `not_failed()` 数）。不在客户端自己数第二遍——两份真相迟早分开错。
      const s = await api.getStorageQuota()
      this.setData({ imageCount: typeof s.user_count === 'number' && isFinite(s.user_count) ? s.user_count : 0 })
    } catch (err) {
      console.warn('图片那一格的数没读到（不影响界面）', err && (err.errMsg || err.statusCode))
      this.setData({ imageCount: 0 })
    }
  },

  // 右上那枚 = 笔记列表那一枚 tab（默认那一枚，切过去就是它，不用另递话）。
  goNotes() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  // 右下那枚原来指到「笔记卡片」那一枚 tab，并递一个一次性标记过去；10-17 两屏合一之后那枚 tab 没了，
  // 标记与读它的那一段一起作废，这里只剩切过去这一个动作。
  // ⚠ 10-18 这一枚改口念「图片」＋配图张数（站长那句），**落点没动**：合一那一屏右侧就是配图，
  // 所以点「图片」跳去那里是对的。两枚现在落同一个屏——这是合一带出来的后果，不是这一刀引进的；
  // 要不要并成一格，等他一句，我不自己撤。
  goImages() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  // 三枚小圆 10-09 撤了（站长："原来横条右边那三个按钮不清晰，默认就是直接拍照那一档"）。
  // 相册没丢：面板里那枚 mini 就是选相册图；链接在面板顶上那排标签里切。

  // 面板里那三个标签只切视图，不顺手开相机：进来挑模式的人不该被系统选择器打断，
  // 真要开相机有点那枚快门。
  onTab(e) {
    if (this.data.busy) return
    this.open(e.currentTarget.dataset.tab)
  },

  // 点一下换一档深浅：纯白 → 25% → 50% → 回纯白。不给吐司也不给弹层——
  // 那枚点本身的灰度就是当前档，照片跟着一起沉，用户看得见，多说一句反而挡画面。
  onCycleDim() {
    this.setData(getApp().cycleBgDim())
  },

  /**
   * 「换心情」：点一次切一档彩色毛玻璃（站长 10-14「每次点击切换一种」）。
   * 本机立刻生效、底栏跟着立刻换；服务端那一趟**只在壁纸真的换了的那一档才发**——
   * 墨与象牙共用 tint-paper 这一枚壁纸值，切这两档 PUT 的是同一个数，发一次等于白跑一趟、
   * 还多开一个失败面。PUT 失败要说一句：界面已经变了而服务端没记下，下次登录会回到服务端那一份，
   * 不报就是静默不一致（与 `pages/wallpaper` 原来那条 applyWallpaper 同一口径）。
   * 同一帧连点两下会发两次 PUT，所以先挡手（那条链原来就写着这一句）。
   */
  onCycleMood() {
    if (this.data.moodBusy) return
    const app = getApp()
    const before = app.getWallpaper()
    this.setData({ moodBusy: true })
    app.cycleGlassMood()
    const after = app.getWallpaper()
    this.setData({
      moodBusy: false,
      themeClass: app.containerClass(after),
      // 层色那一套跟着壁纸走，换档不换它就是"面板换了色、录入条还是旧层色"
      skinPanel: createSkin(after),
    })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().applyTheme(after)
    if (after === before) return
    api.updateWallpaper(after).catch(() => {
      wx.showToast({ title: t('setFailed', this.data.lang), icon: 'none' })
    })
  },

  // 「换背景」不再导流去「我的 → 卡片模板」：站长 10-18 01:1x 原话
  // 「首页换背景，也要拉起这个弹窗，不需要跳到设置里面换」。这一层里那两枚芯片（卡片／背景）
  // 改的就是同一份四槽，「背景」那一枚当场把首页这张图换掉（钩子在下面 `_ciAfterCommit`）。
  // 那一页的两枚芯片这一轮没撤——他这句说的是"这一枚不必跳过去"，不是"那一页的开关不要了"。
  goHomeBg() {
    this.onOpenCardInfo()
  },

  // ---------- 「卡片上的信息」（首页这一屏由上面那枚「换背景」拉起） ----------
  // 实现整份在 utils/cardInfo.js（与首页成品弹窗、笔记卡片页同一份），这一页只给下面这一个钩子。

  // 首页那张背景图就是四槽里挂着「背景」角色的那一张，而 bgSrc 平时只在进页那一趟重取。
  // 这一层不跳页 ⇒ 不接这一刀，勾完芯片屏上还是旧图（他那句「背景图自动刷新为最新」）。
  // 换图的同时把深浅那一档重算：新铺上来的这张可能是浅的，字不翻就白压白（10-12 那一族静默失效）。
  _ciAfterCommit() {
    const bg = poster.homeBg()
    bgTone.applyTone(this, bg, toneZones())
    this.toneRects()
    return { bgSrc: bg }
  },

  ...cardInfo.handlers,

  // 条外任意空白都收回到默认那条；忙的时候不收，别把进度藏起来
  collapse() {
    if (this.data.busy || !this.data.active) return
    this.setData({
      active: '',
      panelOpen: false,
      bodyFocus: false,
      // 收回这一屏时键盘也不在了。`keyboardheightchange` 在输入框被 `wx:if` 摘掉那一趟不保证补发 0，
      // 所以这里自己归零，不留一个"面板悬在半空"的残态。
      kbLift: 0,
      errLine: '',
      hintLine: '',
      errPerm: false,
      knobRpx: SLD_REST_RPX,
      fillPct: 0,
      done: false,
      dragging: false,
    })
  },

  // 整页是"收起"点击区，这几处自己吃掉点击，不该顺手把面板收掉。
  noop() {},

  // 语言只切界面：不动账号、不重新登录，服务端那一栏由 PUT /api/user/language 记着。
  // 失败就说失败，不改本地那一份——否则界面变英文而服务器记的是中文，
  // 换设备登录又弹回中文，那比切不过去更难解释。
  async onSwitchLang(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.lang || this.data.busy) return
    try {
      await api.updateLanguage(key)
    } catch (err) {
      console.error('语言切换失败', err)
      wx.showToast({ title: t('switchFailed', this.data.lang), icon: 'none' })
      return
    }
    const app = getApp()
    // 这一格**不许带 `if`**。原来写的是 `if (app.globalData.userInfo) userInfo.language = key`，
    // 而登录没回来的那一档 `userInfo` 就是 null（10-13 探针实测这一趟会话里它根本不存在），
    // 于是这一句整个是空操作——可下面那句 `this.onShow()` 读语言走的正是同一个地方
    // （`app.globalData.userInfo?.language || 'zh'`），当场把界面读回中文：
    // 闪一下英文、又弹回原样，在他那边就是「切换中英文失效」。改成无条件并进去，
    // 没有那一格也会造出来（同一类写法当天在尺子里也踩过一次，见方案 §9.16 ①）。
    app.globalData.userInfo = Object.assign({}, app.globalData.userInfo, { language: key })
    this.setData({ lang: key, t: texts(key) })
    this.onShow()
  },

  // ---------- 右滑才开始提炼 ----------
  // 圆跟着手指走、停在最右、颜色全程不变；轨道随进度由纸白吃成实心，那一圈白环一直在。
  // 位移换算是同步的（windowWidth 一次读取用到底），所以快速一划也不会掉在异步查询前面。
  rpxFactor() {
    if (!this._rpx) this._rpx = 750 / (wx.getSystemInfoSync().windowWidth || 375)
    return this._rpx
  },

  onSlideStart(e) {
    if (this.data.busy || this.data.done || !e.touches || !e.touches.length) return
    // 这一格还没内容：**不给起拖**（站长 10-10 深夜「输入框里面没内容，不允许滑动圆ICON」）。
    // 以前是"照样跟手、松手回弹"，圆的颜色洗成灰当锁——他现在把锁从皮挪到行为上，
    // 圆保持橙色，但手指拖不动它。话还是要说（沿用"灰按钮被点也要给话"那条规矩），
    // 所以这里直接走那一趟校验，让输入框上面那枚气泡当场说出来（10-10 深夜报错换了地方）。
    if (!this.data.ready) { this.runSubmit(); return }
    this._drag = { x0: e.touches[0].clientX, base: this.data.knobRpx }
    this.setData({ dragging: true })
  },

  onSlideMove(e) {
    const d = this._drag
    if (!d || this.data.busy) return
    const dx = ((e.touches[0] || e.changedTouches[0] || {}).clientX || d.x0) - d.x0
    const next = Math.max(SLD_REST_RPX, Math.min(SLD_MAX_RPX, d.base + dx * this.rpxFactor()))
    // 小于 3rpx 不写：一屏手指抖一下就是十几拍 setData，圆不会更跟手，只会更卡
    if (Math.abs(next - this.data.knobRpx) < 3) return
    this.setData({ knobRpx: next })
  },

  onSlideEnd() {
    const d = this._drag
    this._drag = null
    if (!d || this.data.busy) return
    const reached = this.data.knobRpx >= SLD_MAX_RPX - SLD_SLOP_RPX
    // 到位才进忙态；半路松手一律回弹。`ready` 这一半现在其实进不来（上面 `!ready` 根本不起拖），
    // 留着是防"拖到一半内容被清空"那一类竞态，不当成空着能滑到底的那条老路径。
    const go = reached && this.data.ready
    this.setData({ dragging: false, knobRpx: go ? SLD_MAX_RPX : SLD_REST_RPX })
    if (reached) this.runSubmit()
  },

  // 轨道点一下（不滑）：还没东西可提交时把那句校验说出来，别让人对着一枚按不动的条猜。
  // 已经填好了什么也不做——那才是这枚条的意义：必须滑过去，等于让他先看一眼这一屏。
  onSldTap() {
    if (this.data.busy || this.data.done || this.data.ready) return
    this.runSubmit()
  },

  runSubmit() {
    const { active } = this.data
    if (active === 'url') return this.submitUrl()
    if (active === 'write') return this.submitManual()
    return this.submitScreenshots()
  },

  // 三档共用的那一趟忙态。原来三处各写一遍"置忙 → 提交 → 轮询 → 清草稿 → 吐司 → 跳详情"，
  // 改成滑动确认之后这六步的时序必须完全一致，所以收在一起。
  _extractBegin(kind) {
    this.setData({ busy: kind, errLine: '', hintLine: '', errPerm: false, done: false, fillPct: 0 })
    this.startProgress()
  },

  _extractDone(noteId, patch) {
    const { lang } = this.data
    this.stopProgress()
    // 满格 + 完成那一帧（整条转实心、白环仍在），紧接着吐司一句「已存入笔记」，800ms 后跳详情页。
    // 草稿按 patch 清，面板这一趟先不收起：跳走之前那一帧要看得见"成了"。
    this.setData({ busy: '', fillPct: 100, done: true, knobRpx: SLD_MAX_RPX, ...patch })
    // 草稿清完跟着把"能不能提交"重算一遍——不然从详情页返回时那一枚还停在已完成的样子。
    this._sync()
    wx.showToast({ title: t('extractSucceeded', lang), icon: 'success' })
    setTimeout(() => {
      wx.navigateTo({ url: `/pages/detail/detail?id=${noteId}` })
    }, 800)
  },

  _extractFail(err) {
    this.stopProgress()
    const { lang } = this.data
    // 没成就把这一枚退回待滑那一帧：圆回最左、轨道全白，留着那句错在框外说
    this.setData({
      busy: '',
      fillPct: 0,
      knobRpx: SLD_REST_RPX,
      errLine: err.timeout
        ? t('taskTimeout', lang)
        : ((err.data && err.data.detail) || err.error || t('taskFailed', lang)),
    })
    this._sync()
  },

  /**
   * 进度那一格是**按时间推的假进度**，不是真进度。
   * 服务端那一趟任务在 redis 里只有 status/result/user_id（app/services/queue.py 的 set_task_status），
   * 压根没有百分比；客户端两秒轮一次、最长 300 秒（utils/api.js 的 pollTask）。
   * 站长 10-08 拍的是「进度条不需要太精准」，所以这里不动后端：一条 30 秒过半、封顶 90% 的曲线
   * 慢慢走，接口回来的那一刻才钉到满。真要把第 k 张／共 n 张报出来，就得给任务加 done/total 两个字段。
   */
  startProgress() {
    this.stopProgress()
    this._t0 = Date.now()
    this._progress = setInterval(() => {
      const sec = (Date.now() - this._t0) / 1000
      const pct = Math.min(90, Math.round(90 * (1 - Math.exp(-sec / 30))))
      if (pct !== this.data.fillPct) this.setData({ fillPct: pct })
    }, 600)
  },

  stopProgress() {
    if (this._progress) {
      clearInterval(this._progress)
      this._progress = null
    }
  },

  // ---------- URL 导入 ----------
  onUrlInput(e) {
    this.setData({ urlInput: e.detail.value, urlHint: this.hintFor(e.detail.value), errLine: '' })
    this._sync()
  },

  clearUrl() {
    if (this.data.busy) return
    this.setData({ urlInput: '', urlHint: 'idle' })
    this._sync()
  },

  // 站长 10-08 真机反馈：链接那一档长按粘不上，所以把「粘贴」这枚加回输入框右侧
  // （当初撤它的理由是"交给系统长按"，那条在真机上不成立）。
  // 读剪贴板走 wx.getClipboardData：iOS 16+ 那一下由系统自己弹「粘贴」提示，不由我们请权限。
  onPasteUrl() {
    if (this.data.busy) return
    wx.getClipboardData({
      success: (res) => {
        const s = String((res && res.data) || '').trim()
        if (!s) {
          this.sayErr(t('pasteEmpty', this.data.lang))
          return
        }
        this.setData({ urlInput: s, urlHint: this.hintFor(s), errLine: '' })
        this._sync()
      },
      fail: () => {
        // 读不到与"里面没东西"是两件事，不许合成一句糊过去
        this.sayErr(t('pasteFailed', this.data.lang))
      },
    })
  },

  // 「文字」那一档的粘贴（站长 10-10 深夜：与链接那一档同一个 ICON、同一个位置）。
  // 语义与链接那一档**故意不同**：链接是一行，贴进去就是替换；原文框是多行，
  // 已经有内容时贴进来是接在后面（换行分隔），不许把人已经打好的字整段顶掉。
  // 读不到与"剪贴板里没东西"仍是两句话，沿用链接那两条键。
  onPasteWrite() {
    if (this.data.busy) return
    wx.getClipboardData({
      success: (res) => {
        const s = String((res && res.data) || '').trim()
        if (!s) {
          this.sayErr(t('pasteEmpty', this.data.lang))
          return
        }
        const had = this.data.writeBody
        this.setData({ writeBody: had ? `${had.replace(/\s+$/, '')}\n${s}` : s })
        this._sync()
      },
      fail: () => {
        this.sayErr(t('pasteFailed', this.data.lang))
      },
    })
  },

  // 照片那一档第三枚小圆（站长 10-16 原话「照片第三个按钮，改为"粘贴"从剪贴板粘贴图片，
  // 如果非图片，就直接跳转到链接，或者文字」）。
  // ⚠ 图片那一半平台做不到，这条是实测出来的、不是照文档猜的：剪贴板里确认放了 PNG
  //   （`pbpaste` 那侧读到 «class PNGf» 41582 字节），模拟器里 `wx.getClipboardData` 的
  //   **success 与 fail 两个回调六秒内一个都没回来**；换成纯文本就正常回 `{errMsg, data}`。
  //   也就是说这一门只把"文字"给出来，图片它既不报错也不给东西 ⇒ 只能靠超时那一条认出来。
  // 落点按他这句话分：像链接的字符串就跳「链接」那一档并把串填进去，其余的跳「文字」那一档。
  // 多行原文框沿用 onPasteWrite 的语义（已有内容时接在后面，不顶掉他打好的字）。
  onPasteAny() {
    if (this.data.busy) return
    if (this._pasteTimer) clearTimeout(this._pasteTimer)
    this._pasteTimer = setTimeout(() => {
      this._pasteTimer = null
      this.sayErr(t('pasteNoText', this.data.lang))
    }, PASTE_WAIT_MS)
    const stop = () => {
      if (this._pasteTimer) {
        clearTimeout(this._pasteTimer)
        this._pasteTimer = null
      }
    }
    wx.getClipboardData({
      success: (res) => {
        stop()
        const s = String((res && res.data) || '').trim()
        if (!s) {
          this.sayErr(t('pasteNoText', this.data.lang))
          return
        }
        if (isLink(s)) {
          // errLine 不在这里清：open() 那一段本来就把它与气泡一起抹了，
          // 在这里再写一遍等于同一件事两处记（判据钉的就是"每一处写 errLine 都要过一遍 _sync"）。
          this.setData({ urlInput: s })
          this.open('url')
          return
        }
        const had = this.data.writeBody
        this.setData({ writeBody: had ? `${had.replace(/\s+$/, '')}\n${s}` : s })
        this.open('write')
      },
      fail: () => {
        stop()
        this.sayErr(t('pasteReadFail', this.data.lang))
      },
    })
  },

  async submitUrl() {
    const url = this.data.urlInput.trim()
    if (this.data.busy) return
    if (!isLink(url)) {
      // 轨道被点到但这一格还空着/不像链接：把那句话说出来，不能静默
      this.setData({ urlHint: 'bad', errLine: t('linkRule', this.data.lang) })
      this._sync()
      return
    }
    this._extractBegin('url')
    try {
      // 10-16 站长「三个tab全局都可用」⇒ 这一位要跟着送出去：原来只有文字那条请求带 translate，
      // 链接与照片两条不带，后端拿到的就是 `None`（提示词里连"输出语言"那一段都不写）。
      const { task_id } = await api.ingestUrl(url, this.data.writeTranslate)
      const result = await api.pollTask(task_id)
      this._extractDone(result.note_id, { urlInput: '', urlHint: 'idle' })
    } catch (err) {
      console.error('URL 导入失败', err)
      this._extractFail(err)
    }
  },

  // ---------- 拍照 / 相册 ----------
  // source 三种：camera 直接开快门、album 开相册、any 开系统那个"拍照或截图"两用的选择器
  // （➕ 那一枚走 any：它只说"再加一张"，不再替用户分今天是拍还是选）。
  pickImage(e) {
    const source = e.currentTarget.dataset.source
    const { lang } = this.data
    // 提炼进行中不能再改图：新加的图不在这次提交数组里，成功后却一起被清空
    if (this.data.busy) return
    const left = MAX_SHOTS - this.data.previewImages.length
    if (left <= 0) {
      // 满了。原来这里是静默的（选得上来、合并时 slice 掉、界面什么都不说），
      // 现在➕转灰 + 一句吐司，告诉他是"满了"不是"没反应"。
      this.sayErr(t('maxShots', lang).replace('{n}', MAX_SHOTS))
      return
    }
    const sourceType = source === 'any' ? ['album', 'camera'] : [source]
    wx.chooseMedia({
      // 只给"还能选几张"：系统选择器自己就把上限卡住了，这里不需要再截一刀
      count: left,
      mediaType: ['image'],
      sourceType,
      success: (res) => {
        const files = (res && res.tempFiles) || []
        if (files.length === 0) {
          // 微信偶尔会回一个空列表（比如格式不被接受），不给提示就等于"点了没反应"
          this.setData({ errLine: t('noImagePicked', lang), errPerm: false })
          this._sync()
          return
        }
        // 这里**不再截一刀**：还能选几张已经交给系统选择器（count = 剩余位），满了根本不开选择器。
        // 原来那一刀是静默的（slice(0, MAX_SHOTS)），症状是"能选 9 张、只留 9 张里被砍掉的那几张"。
        this.setData({ previewImages: this.data.previewImages.concat(files.map((f) => f.tempFilePath)) })
        this._sync()
      },
      // 原来这里只有 success：权限被拒或系统选择器起不来时界面静默无反应，
      // 用户只能对着屏幕再点一次。fail 补上。
      fail: (err) => {
        const msg = String((err && err.errMsg) || '')
        if (msg.indexOf('cancel') > -1) return
        console.error('chooseMedia 失败', msg)
        // 只有真是权限问题才引导去设置，否则用户按提示开了权限还是好不了
        const denied = /auth deny|authorize|permission/i.test(msg)
        this.setData({
          errLine: denied
            ? (source === 'camera' ? t('permCamera', lang) : t('permAlbum', lang))
            : t('pickFailed', lang),
          errPerm: denied,
        })
        this._sync()
      },
    })
  },

  // ➕ 那一枚：满了不走选择器，直接给话。
  onAddShot(e) {
    if (this.data.shotsFull) {
      this.sayErr(t('maxShots', this.data.lang).replace('{n}', MAX_SHOTS))
      return
    }
    this.pickImage(e)
  },

  openPermSetting() {
    if (!this.data.errPerm) return
    wx.openSetting({})
  },

  removeShot(e) {
    if (this.data.busy) return
    const index = e.currentTarget.dataset.index
    const left = this.data.previewImages.slice()
    left.splice(index, 1)
    this.setData({ previewImages: left })
    this._sync()
  },

  async submitScreenshots() {
    if (this.data.busy) return
    if (this.data.previewImages.length === 0) {
      // 灰圆被点到也要给话，不能静默
      this.setData({ errLine: t('pickFirst', this.data.lang) })
      this._sync()
      return
    }
    this._extractBegin('shot')
    // 提交的是点下去那一刻的那批图，后面列表再怎么变都不影响这一单
    const batch = this.data.previewImages.slice()
    // B 链（把图留下来）与 A 链（提炼建笔记）同时起跑，谁也不等谁。这里**不 await**：
    // 它慢、它失败，都不该让"笔记没存下来"这件事发生（方案 §3.1.4 那条关键原则）。
    // CLOUD_ENV 没填时 cloudReady() 是 false，这一趟直接跳过，行为和今天一字不差。
    const backup = this._backupShots(batch)
    try {
      const { task_id } = await api.ingestScreenshots(batch, this.data.writeTranslate)
      const result = await api.pollTask(task_id)
      this._extractDone(result.note_id, { previewImages: [] })
      this._settleBackup(result.note_id, backup)
    } catch (err) {
      console.error('截图导入失败', err)
      // 这篇笔记没建出来，已经传上去的图就是孤儿对象——占全站那 5GB 却没人记得它，
      // 所以顺手删掉。删不动（弱网）就留给云上，这条残留记在方案 §3 阶段 3 的出口条件里。
      this._settleBackup(null, backup)
      this._extractFail(err)
    }
  },

  /**
   * B 链：逐张压、逐张传，攒出 bind 要的那批 items。
   * **串行不并行**——九张 4000×3000 的截图一起重绘离屏 canvas 会把内存吃穿，
   * 而真机在这件事上比模拟器诚实得多。
   */
  async _backupShots(paths) {
    if (!cloudUpload.cloudReady()) return { skipped: true, items: [], fileIDs: [] }
    const userId = getApp().globalData.userId
    const items = []
    for (const p of paths || []) {
      const small = await compressForBackup(p)
      // 压不动（读不到尺寸/画不出来）就传原图：宁可这一张大一点，也不要"图丢了"
      const src = small || { path: p, bytes: null }
      const up = await cloudUpload.uploadImage(src.path, userId)
      if (!up) continue
      items.push({
        file_id: up.fileID,
        size: small ? small.bytes : null,
        width: small ? small.width : null,
        height: small ? small.height : null,
      })
    }
    return { skipped: false, items, fileIDs: items.map((i) => i.file_id) }
  },

  /** 收尾：A 链给了 note_id 就绑，绑不上就落本机队列下次补；A 链没成就把对象删掉。 */
  async _settleBackup(noteId, backupPromise) {
    try {
      const r = await backupPromise
      if (!r || r.skipped || !r.items.length) return
      if (!noteId) {
        await cloudUpload.deleteFiles(r.fileIDs)
        return
      }
      try {
        await api.bindNoteAssets(noteId, r.items)
      } catch (e) {
        assetQueue.push(noteId, r.items)
      }
    } catch (e) {
      // 这条链任何一处炸了都不许冒出 unhandled rejection：它整个是附属品
      console.warn('图片备份收尾没走完（不影响笔记）', e && (e.errMsg || e.message))
    }
  },

  // ---------- 文字（站长 10-04 改口径：贴原文 → 模型出摘要；10-08 起标题与归类挪到详情页改） ----------
  // 这一档和拍照／链接走同一条提炼链路，摘要、要点都由模型出。
  // 标题为什么不在这里填：面板压到 500rpx 之后只放得下"一个框 + 一枚条"，
  // 而详情页那格「编辑」本来就能改标题与归类（write 页两样都在），能力没少一个入口。
  onWriteBody(e) {
    this.setData({ writeBody: e.detail.value, errLine: '' })
    this._sync()
  },

  // 原文框一聚焦就把面板抬到展开那一档（两行的框 + 那枚「原文翻译」）， blur 回来。
  // 焦点是这一档唯一的展开理由：没有第二个"展开"按钮，也不许它自己乱长。
  onBodyFocus() {
    this.setData({ bodyFocus: true })
    this._sync()
  },

  onBodyBlur() {
    this.setData({ bodyFocus: false })
    this._sync()
  },

  // 键盘进出 → 整块录入面板抬到键盘上沿之上。三档共用这一位（照片那一档没有文字输入，
  // 永远收不到这个事件，抬量恒 0）。
  // 抬量为什么是「键盘高 − 152rpx」而不是键盘高：面板本来就离底栏 152rpx（`.entry-wrap` 那条
  // fixed 的 bottom），那 152 已经压在键盘里了；再抬整个键盘高就会多抬 152。
  // ⚠ 抬的是 `.entry-wrap` 与 `.stage-panel` **两层同一个量**：那两层是一根链上的（玻璃面顶
  //   按内框顶往上 24 算），只抬一层会把面板推出玻璃面之外。
  onKeyboardHeight(e) {
    const h = (e && e.detail && e.detail.height) || 0
    const wi = wx.getWindowInfo()
    const gap = (152 * wi.windowWidth) / 750
    const lift = h > gap ? Math.round(h - gap) + 8 : 0
    if (lift !== this.data.kbLift) this.setData({ kbLift: lift })
  },

  // 整行都是落点（wxml 把 catchtap 绑在这一行的外壳上），所以这里只管翻一下状态。
  // 用 catchtap 而不是 bindtap：面板外壳挂着「点空白收回」，冒上去就顺手把面板收掉了。
  onToggleTranslate() {
    this.setData({ writeTranslate: !this.data.writeTranslate })
  },

  async submitManual() {
    if (this.data.busy) return
    const content = this.data.writeBody.trim()
    if (!content) {
      this.setData({ errLine: t('needBody', this.data.lang) })
      this._sync()
      return
    }
    this._extractBegin('write')
    try {
      const { task_id } = await api.ingestText({
        title: titleFromText(content),
        content,
        // 后端字段名就叫 translate。这一位一路走到提示词里那行「输出语言」：开＝一律整理成中文，
        // 关＝跟随原文语言（英文原文出英文摘要）。后端那个默认值仍是 false，给的是不带这一位的
        // 老包（1.9.24 及以前），新包三档都显式发，不靠默认。
        translate: this.data.writeTranslate,
      })
      const result = await api.pollTask(task_id)
      // 复位回**默认那一档（开）**，不是回 false——站长 10-16「默认是翻译」。
      this._extractDone(result.note_id, { writeBody: '', writeTranslate: true, bodyFocus: false })
    } catch (err) {
      console.error('文字提炼失败', err)
      this._extractFail(err)
    }
  },
})
