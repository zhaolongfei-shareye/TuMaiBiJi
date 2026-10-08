const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { toneStyle, TIP_DOT, createSkin } = require('../../utils/palette.js')
const poster = require('../../utils/poster.js')
const cloudUpload = require('../../utils/cloudUpload.js')
const assetQueue = require('../../utils/assetQueue.js')
const { compressForBackup } = require('../../utils/imageCompress.js')

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

/* 一行放五格（小图 100 + 间距 16，五格 = 564 ≤ 卡内宽 566）。
   这个数是 WXSS 的几何事实，不是拍的：上限 9 张 + ➕ 那一格 = 10 格，
   五列是"展开只多一行"（两行放得下）的最小列数。改 .strip 的列数要连着改这里。 */
const ROW_CELLS = 5

/* 右滑那一枚的行程（rpx，与 create.wxss 里那三个数一一对上，改样式要连着改）：
   轨道内宽 = 卡内宽 566 − 自己那圈白边 5×2 = 556；圆 90；左边内缩 10。
   停在最右那一格 left = 556 − 90 − 10 = 456，所以行程 446。
   这里按 rpx 走而不查节点：手指位移换算成 rpx 只需要 windowWidth（微信 rpx = 屏宽/750），
   一次同步读取就够了，省下 touchstart 那一趟异步查询——快速一划就会掉在查询回来之前。 */
const SLD_REST_RPX = 10
const SLD_MAX_RPX = 456
// 差 12rpx 就算到位（手指按在圆右缘上再往外划不出这 12，宁可让人划到底也不要"差一点没反应"）
const SLD_SLOP_RPX = 12

Page({
  data: {
    lang: 'zh',
    t: texts('zh'),
    themeClass: 'theme-tint-paper',  // 未登录/首帧的占位：类名必须真的存在，四枚里象牙是 THEMES[0]
    // 展开的是哪一档：'' | 'photo' | 'url' | 'write'，同一时刻最多一个。
    // 10-08 起相册不再是独立的一档（它是「照片」那一态左边那枚小圆），所以 mode 那一位也撤了：
    // 面板上只有三个标签，一个真相。
    active: '',
    // 面板的两档高度：收起 500、展开 580（只多一行）。由 _syncPanelOpen 现算，
    // 别在调用点手写 true/false——两个入口（原文框聚焦 / 图多了排不下）会各说一套。
    panelOpen: false,
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
    // 「原文翻译」那枚小开关（站长 10-04）：默认关＝摘要跟随原文的语言，打开才整理成中文。
    // 只活在这一次提交里：落库成功后跟着原文一起归零，不留到下一篇。
    writeTranslate: false,
    // 右滑那一枚的四个态（待滑 / 拖动中 / 就位 / 完成）都靠这几位说话。
    ready: false,   // 这一格有没有东西可提交（决定圆是实心还是灰、滑到底触不触发）
    dragging: false,
    done: false,    // 完成那一帧：整条转实心 + 白环仍在，紧接着吐司再跳详情页
    knobRpx: SLD_REST_RPX,
    fillPct: 0,
    sldIcon: 'pen',
    // 四个入口各自的饱和色，色值和字色配对仍归 palette 管。
    // 三枚小圆仍是 toneStyle 那三档（条身上），面板那一整套暗面改由 createSkin() 一次发下来。
    skinUrl: toneStyle(1),
    skinShot: toneStyle(2),
    skinAlbum: toneStyle(3),
    skinPanel: createSkin(),
    // 首页背景：'' 表示这一屏不铺图（用户在外观设置里关掉了）
    bgSrc: '',
    // 背景深浅那一档：初值给中档（站长 10-02 夜里定的默认档，也是 app.bgSkin() 在本机读不到
    // 键时回落的那一档），免得第一帧先闪一下别的深浅。三样每次进页由 app.bgSkin() 重读。
    dimV: 1,
    dimDot: '',
    dimScrim: '',
    // slogan 下面那行：onShow 里现算，这里先给空串免得第一帧闪一个空行
    dateText: '',
    weekText: '',
    // 横条上面那一行轮播 Tips（站长 10-01 晚）：句子整批从 i18n 取，界面按 tipIdx 指哪一句。
    // 空数组是"这一档还没有可提示的"，模板整行不渲染，不会留一条空行。
    tips: [],
    tipIdx: 0,
    tipsPrefix: t('tipsPrefix', 'zh'),
    // Tips 前面那枚小黄点（站长 10-01 晚：象征小灯泡）。色值必须由 palette 发下来：
    // `验-统一录入条.js` 专门扫 create.wxss 里有没有 #F6C445，写进样式表就红。
    tipDotStyle: 'background:' + TIP_DOT,
  },

  // slogan 下面那行日期 + 星期（效果图「统一录入条」那一稿就有，之前落地时漏了）。
  // 它是提醒、不是信息主体：字号跟右边「中」一致，颜色吃 --text-secondary/--text-tertiary
  // ——铺了背景图时这两个变量本身就是半透明纸白，没铺时是灰字，两头都不用另写规则。
  dateLineFor(lang) {
    const n = new Date()
    if (lang === 'en') {
      const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const W = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      return { dateText: `${M[n.getMonth()]} ${n.getDate()}`, weekText: W[n.getDay()] }
    }
    const W = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return { dateText: `${n.getMonth() + 1}月${n.getDate()}日`, weekText: W[n.getDay()] }
  },

  // 横条上面那一行轮播 Tips：六句教人用现成的能力（拍照提炼、链接、分享选模板、
  // 卡片那枚「分享」、私密那一格、外观）。句子全在 i18n，这里只管取和切。
  tipsFor(lang) {
    const arr = t('tips', lang)
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
  },

  onUnload() {
    this.stopTips()
    this.stopProgress()
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
      // 三个入口的颜色同样是在 data 字面量里定的（模块加载时主题还没落地），
      // 每次进页按当前主题重算，淡雅那两枚才会真的把蓝/橙/绿/黄换成同色阶的四档。
      skinUrl: toneStyle(1),
      skinShot: toneStyle(2),
      skinAlbum: toneStyle(3),
      // 面板那套暗面里的快门与滑动条吃当前壁纸的色阶，跟着上面三枚一起重算。
      skinPanel: createSkin(),
      // 每次进页重取：在分享形象页换完图返回，这一屏就该跟着换（onShow 不碰草稿，见上面那段注释）。
      bgSrc: poster.homeBg(),
      // 背景深浅那一档也是每次进页重读：在「我的」页里改过、或别的 tab 点过那枚点，回到这一屏就该跟上。
      ...app.bgSkin(),
      // 日期 + 星期：跨零点回来也要跟着翻，所以每次进页现算
      ...this.dateLineFor(lang),
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
    app.applyNavForBand(this.data.bgSrc)
    this.startTips()
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
  },

  // 条身前面那枚图形与滑动条圆里那枚图形，都是"现在这一档是干什么的"。
  // 收起态那条固定用钢笔（它现在永远只说「动动手指」，不再跟着模式换字），
  // 展开态那一枚跟着三档走：照片=叠图、链接=链环、文字=钢笔。
  // 这三支和底栏那三支是同一套 Lucide 几何（见 create.wxss 那一段注释）。
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
  },

  // 点条身 = 「照片」那一档（这一屏第一眼就该是那枚快门）。
  // 原来点条身进的是「直接写」，10-08 那轮把默认档换成照片：
  // 站长的原话是"拍照是大按钮、其他的用小按钮"，那一大钮就是这一屏的门面。
  openBar() {
    if (this.data.busy) return
    if (this.data.active) { this.collapse(); return }
    this.open('photo')
  },

  // 三枚小圆是三个入口本身，不只是"展开到那一态"：橙=开相机、绿=开相册、蓝=进链接那一态。
  // 选完图返回时面板已经停在对应那一档，刚选的图就在眼前。
  onDotShot(e) {
    if (this.data.busy) return
    const source = e.currentTarget.dataset.source
    this.open('photo')
    this.pickImage({ currentTarget: { dataset: { source } } })
  },

  onDotUrl() {
    if (this.data.busy) return
    this.open('url')
  },

  // 面板里那三个标签只切视图，不顺手开相机：进来挑模式的人不该被系统选择器打断，
  // 真要开相机有点那枚快门、也有条身那枚小圆。
  onTab(e) {
    if (this.data.busy) return
    this.open(e.currentTarget.dataset.tab)
  },

  // 点一下换一档深浅：纯白 → 25% → 50% → 回纯白。不给吐司也不给弹层——
  // 那枚点本身的灰度就是当前档，照片跟着一起沉，用户看得见，多说一句反而挡画面。
  onCycleDim() {
    this.setData(getApp().cycleBgDim())
  },

  // 换背景图只是导流：选图这件事仍然只在「我的 → 卡片模板」那一页做一次。
  goHomeBg() {
    wx.navigateTo({ url: '/pages/profile/profile' })
  },

  // 条外任意空白都收回到默认那条；忙的时候不收，别把进度藏起来
  collapse() {
    if (this.data.busy || !this.data.active) return
    this.setData({
      active: '',
      panelOpen: false,
      bodyFocus: false,
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
    if (app.globalData.userInfo) app.globalData.userInfo.language = key
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
    // 只有"到位 + 这一格真有东西"才把圆钉在最右那一格进忙态；
    // 空着滑到底要说一句、但圆必须回弹（效果图那枚 off 态写的就是这个：滑到最右也回弹）。
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
          wx.showToast({ title: t('pasteEmpty', this.data.lang), icon: 'none' })
          return
        }
        this.setData({ urlInput: s, urlHint: this.hintFor(s), errLine: '' })
        this._sync()
      },
      fail: () => {
        // 读不到与"里面没东西"是两件事，不许合成一句糊过去
        wx.showToast({ title: t('pasteFailed', this.data.lang), icon: 'none' })
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
      const { task_id } = await api.ingestUrl(url)
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
      wx.showToast({ title: t('maxShots', lang).replace('{n}', MAX_SHOTS), icon: 'none' })
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
      wx.showToast({ title: t('maxShots', this.data.lang).replace('{n}', MAX_SHOTS), icon: 'none' })
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
      const { task_id } = await api.ingestScreenshots(batch)
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
        // 后端字段名就叫 translate，默认 false。这一位一路走到提示词里那行「输出语言」，
        // 关掉它才是要的效果：英文原文出英文摘要，不再被自动写成中文。
        translate: this.data.writeTranslate,
      })
      const result = await api.pollTask(task_id)
      this._extractDone(result.note_id, { writeBody: '', writeTranslate: false, bodyFocus: false })
    } catch (err) {
      console.error('文字提炼失败', err)
      this._extractFail(err)
    }
  },
})
