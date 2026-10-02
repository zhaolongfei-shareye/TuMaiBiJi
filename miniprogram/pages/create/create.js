const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { toneStyle, TIP_DOT } = require('../../utils/palette.js')
const poster = require('../../utils/poster.js')
const { allowPrivate } = require('../../utils/privateGate.js')

// 链接规范：必须有协议头、主机名里要有顶级域、整串不能出现空白。
// 之前只判"以 http 开头且某处有个点"，`https://a.com 后面还有字` 和 `http:///a.b` 都能过，
// 到了服务端才失败，用户在卡里看到的是一句和输入对不上的错。
const LINK_RE = /^https?:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?(\/[^\s]*)?$/i

function isLink(value) {
  const s = (value || '').trim()
  if (!s || /\s/.test(s)) return false
  return LINK_RE.test(s)
}

Page({
  data: {
    lang: 'zh',
    t: texts('zh'),
    themeClass: 'theme-default',
    // 展开的是哪一段：'' | 'url' | 'shot' | 'write'，同一时刻最多一个。
    // mode 是条身上那四个标签里当前哪一个（write | camera | album | url）：
    // camera 和 album 共用 shot 那一段表单，分开记只为了高亮和条身前面那枚图形。
    active: '',
    mode: 'write',
    lead: 'pen',
    barTitle: '',
    busy: '',
    errLine: '',
    errPerm: false,
    urlInput: '',
    urlHint: 'idle',
    previewImages: [],
    shotDesc: '',
    writeTitle: '',
    writeBody: '',
    // 「亲自撰写」的分类：0 是「未分类」，往后依次是用户自己的分类。
    // 只在第一次展开这张卡时取一次，这一页是启动页，冷启动就去拉没意义。
    categories: [],
    categoryNames: [],
    catIndex: 0,
    // 四个入口各自的饱和色，色值和字色配对仍归 palette 管
    skinUrl: toneStyle(1),
    skinShot: toneStyle(2),
    skinAlbum: toneStyle(3),
    skinWrite: toneStyle(0),
    // 首页背景：'' 表示这一屏不铺图（用户在外观设置里关掉了）
    bgSrc: '',
    // 背景深浅那一档：初值给最沉那档（=今天现网的样子，也是 app.bgSkin() 在本机读不到键时
    // 回落的那一档），免得第一帧先闪一下原图亮度再压暗。三样每次进页由 app.bgSkin() 重读。
    dimV: 2,
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
  // 卡片保存并分享、私密那一格、外观）。句子全在 i18n，这里只管取和切。
  tipsFor(lang) {
    const arr = t('tips', lang)
    return Array.isArray(arr) ? arr : []
  },

  // 一句停 8 秒（站长 10-01 晚：4 秒"还没看完就跳下一条了"，慢一倍）。
  // 24rpx 一行最长 20 个汉字，8 秒够读完一遍还有余量；再长就成"卡住了"。
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
  },

  onUnload() {
    this.stopTips()
  },

  // onShow 只同步主题/语言/tab，**绝不重置草稿**。
  // 真机实测：从相机或相册返回时小程序会补发一次 onShow，一旦在这里清 previewImages
  // 和 active，刚选好的图就凭空消失、卡片自己收起，界面上不留任何痕迹——
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
      // 四个入口的颜色同样是在 data 字面量里定的（模块加载时主题还没落地），
      // 每次进页按当前主题重算，淡雅那两枚才会真的把蓝/橙/绿/黄换成同色阶的四档。
      skinUrl: toneStyle(1),
      skinShot: toneStyle(2),
      skinAlbum: toneStyle(3),
      skinWrite: toneStyle(0),
      shotDesc: this.shotDescFor(this.data.previewImages.length),
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
    this.setData({ barTitle: this.barTitleFor(this.data.active, this.data.previewImages.length) })
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

  // 选图说明跟着语言重算：onLoad 时登录还没回来，写进去的是默认中文，
  // 英文账号切回来会看到"卡里一行中文一行英文"。
  shotDescFor(count) {
    const { lang } = this.data
    return count ? t('pickedCount', lang).replace('{n}', count) : t('albumDesc', lang)
  },

  // 条身前面那枚图形跟着模式走：写=钢笔、拍照=相机、相册=两张叠图、链接=链环。
  // 图形只说明"现在这一条是干什么的"，不承担颜色识别——颜色在三枚小圆上。
  // 这四支和底栏那三支是同一套 Lucide 几何（见 create.wxss 那一段注释）；
  // 原来相册那枚是"四格"，那是"网格"的意思不是"照片"的意思，换成叠图才读得出"从相册里挑"。
  leadFor(mode) {
    return { write: 'pen', camera: 'camera', album: 'images', url: 'link' }[mode] || 'pen'
  },

  // 条身那句话就是这一屏唯一的动词：收起态一律「动动手指」，
  // 展开后按模式换成「贴个链接」「选了 2 张」，让收起之前也能从条身读出当前进度。
  // 传参而不是读 this.data：setData 之前这一份还是旧值，切换那一瞬间条身会慢一拍。
  barTitleFor(active, count) {
    const { t } = this.data
    if (active === 'url') return t.barUrl
    if (active === 'shot') return count ? t.barShot.replace('{n}', count) : t.importScreenshot
    return t.barIdle
  },

  open(mode) {
    const active = mode === 'camera' || mode === 'album' ? 'shot' : mode
    this.setData({
      mode,
      active,
      lead: this.leadFor(mode),
      barTitle: this.barTitleFor(active, this.data.previewImages.length),
      errLine: '',
      errPerm: false,
      urlHint: this.hintFor(this.data.urlInput),
    })
    if (active === 'write') this.loadCategories()
  },

  // 点条身 = 直接写（默认那一段）。已经展开时再点条身等于点空白，收回去。
  openBar() {
    if (this.data.busy) return
    if (this.data.active) { this.collapse(); return }
    this.open('write')
  },

  // 三枚小圆是三个入口本身，不只是"展开到那一态"：橙=开相机、绿=开相册、蓝=进链接那一态。
  // 选完图返回时面板已经停在对应那一态，刚选的图就在眼前。
  onDotShot(e) {
    if (this.data.busy) return
    const source = e.currentTarget.dataset.source
    this.open(source)
    this.pickImage({ currentTarget: { dataset: { source } } })
  },

  onDotUrl() {
    if (this.data.busy) return
    this.open('url')
  },

  // 面板里的四个标签只切视图，不顺手开相机：进来挑模式的人不该被系统选择器打断，
  // 真要开相机有点按钮、也有条身那枚小圆。
  onMode(e) {
    if (this.data.busy) return
    this.open(e.currentTarget.dataset.mode)
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
    this.setData({ active: '', mode: 'write', lead: 'pen', barTitle: this.barTitleFor('', 0), errLine: '', errPerm: false })
  },

  // 手写这条路上原本只有标题和正文，分类要等保存完再进「编辑」才挑得到；
  // 所以在卡片里给一个选择器，当场归类。取失败不拦人——大不了回头在编辑里补。
  async loadCategories() {
    if (this.data.categories.length) return
    const { lang } = this.data
    try {
      const categories = await api.getCategories()
      this.setData({
        categories,
        categoryNames: [t('noCategory', lang)].concat(categories.map((c) => c.name)),
      })
    } catch (err) {
      console.error('加载分类失败', err)
    }
  },

  async onPickCategory(e) {
    const i = Number(e.detail.value)
    if (!(i >= 0)) return
    // 私密分类要先设密码才让选；挡下时不改 catIndex，那一行显示的还是原来那格
    if (!(await allowPrivate(this.data.categoryNames[i], this.data.lang))) return
    this.setData({ catIndex: Math.min(i, Math.max(this.data.categoryNames.length - 1, 0)) })
  },

  // 整页是"收起"点击区，这颗开关自己吃掉点击，切语言不该顺手把展开的卡收掉。
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
    this.setData({ lang: key, t: texts(key), categoryNames: this.categoryNamesFor(key) })
    this.onShow()
  },

  // 分类那一列的首项是"未分类"这个概念，跟着语言走；后面是用户自己起的名字，不翻。
  categoryNamesFor(lang) {
    return [t('noCategory', lang)].concat(this.data.categories.map((c) => c.name))
  },

  // ---------- URL 导入 ----------
  onUrlInput(e) {
    const value = e.detail.value
    this.setData({ urlInput: value, urlHint: this.hintFor(value), errLine: '' })
  },

  clearUrl() {
    if (this.data.busy) return
    this.setData({ urlInput: '', urlHint: 'idle' })
  },

  pasteUrl() {
    // 忙态下这两条不改 urlInput：清空会让"这一档还没东西"重新成立，
    // 三步指引在提炼进行中冒出来，而下面那颗按钮已经是灰的。
    if (this.data.busy) return
    const { lang } = this.data
    wx.getClipboardData({
      success: (res) => {
        const value = (res.data || '').trim()
        if (!value) {
          this.setData({ errLine: t('pasteEmpty', lang) })
          return
        }
        this.setData({ urlInput: value, urlHint: this.hintFor(value), errLine: '' })
      },
      fail: () => this.setData({ errLine: t('pasteEmpty', lang) }),
    })
  },

  async submitUrl() {
    const url = this.data.urlInput.trim()
    const { lang } = this.data
    // 按钮变灰只是视觉，点还是会进来：不挡第二下就会提两个任务、落两条重复笔记
    if (this.data.busy) return
    if (!isLink(url)) {
      this.setData({ urlHint: 'bad' })
      return
    }
    this.setData({ busy: 'url', errLine: '' })
    try {
      const { task_id } = await api.ingestUrl(url)
      const result = await api.pollTask(task_id)
      this.setData({ busy: '', urlInput: '', urlHint: 'idle' })
      wx.showToast({ title: t('extractSucceeded', lang), icon: 'success' })
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/detail/detail?id=${result.note_id}` })
      }, 800)
    } catch (err) {
      console.error('URL 导入失败', err)
      this.setData({
        busy: '',
        errLine: err.timeout
          ? t('taskTimeout', lang)
          : ((err.data && err.data.detail) || err.error || t('taskFailed', lang)),
      })
    }
  },

  // ---------- 截图导入 ----------
  pickImage(e) {
    const source = e.currentTarget.dataset.source
    const { lang } = this.data
    // 提炼进行中不能再改图：新加的图不在这次提交数组里，成功后却一起被清空
    if (this.data.busy) return
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: [source],
      success: (res) => {
        const files = (res && res.tempFiles) || []
        if (files.length === 0) {
          // 微信偶尔会回一个空列表（比如格式不被接受），不给提示就等于"点了没反应"
          this.setData({ errLine: t('noImagePicked', lang), errPerm: false })
          return
        }
        const merged = this.data.previewImages
          .concat(files.map(f => f.tempFilePath))
          .slice(0, 9)
        this.setData({
          previewImages: merged,
          shotDesc: this.shotDescFor(merged.length),
          barTitle: this.barTitleFor(this.data.active, merged.length),
          errLine: '',
          errPerm: false,
        })
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
      },
    })
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
    this.setData({
      previewImages: left,
      shotDesc: this.shotDescFor(left.length),
      barTitle: this.barTitleFor(this.data.active, left.length),
    })
  },

  clearShots() {
    if (this.data.busy) return
    this.setData({ previewImages: [], shotDesc: this.shotDescFor(0), barTitle: this.barTitleFor(this.data.active, 0) })
  },

  async submitScreenshots() {
    const { lang } = this.data
    if (this.data.busy) return
    if (this.data.previewImages.length === 0) {
      // 灰按钮被点到也要给话，不能静默
      this.setData({ errLine: t('pickFirst', lang) })
      return
    }
    this.setData({ busy: 'shot', errLine: '' })
    // 提交的是点下去那一刻的那批图，后面列表再怎么变都不影响这一单
    const batch = this.data.previewImages.slice()
    try {
      const { task_id } = await api.ingestScreenshots(batch)
      const result = await api.pollTask(task_id)
      this.setData({ busy: '', previewImages: [], shotDesc: this.shotDescFor(0), barTitle: this.barTitleFor('shot', 0) })
      wx.showToast({ title: t('extractSucceeded', lang), icon: 'success' })
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/detail/detail?id=${result.note_id}` })
      }, 800)
    } catch (err) {
      console.error('截图导入失败', err)
      this.setData({
        busy: '',
        errLine: err.timeout
          ? t('taskTimeout', lang)
          : ((err.data && err.data.detail) || err.error || t('taskFailed', lang)),
      })
    }
  },

  // ---------- 手动撰写 ----------
  onWriteTitle(e) {
    this.setData({ writeTitle: e.detail.value, errLine: '' })
  },

  onWriteBody(e) {
    this.setData({ writeBody: e.detail.value })
  },

  cancelWrite() {
    this.collapse()
  },

  async saveManual() {
    const title = this.data.writeTitle.trim()
    const { lang } = this.data
    if (this.data.busy) return
    if (!title) {
      this.setData({ errLine: t('needTitle', lang) })
      return
    }
    this.setData({ busy: 'write', errLine: '' })
    try {
      const picked = this.data.catIndex > 0 ? this.data.categories[this.data.catIndex - 1] : null
      const note = await api.createNote({
        title,
        summary: this.data.writeBody.trim() || null,
        category_id: picked ? picked.id : null,
        source_type: 'manual',
      })
      this.setData({ busy: '', writeTitle: '', writeBody: '', catIndex: 0, active: '', mode: 'write', lead: 'pen', barTitle: '' })
      wx.showToast({ title: t('saveSucceeded', lang), icon: 'success' })
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/detail/detail?id=${note.id}` })
      }, 800)
    } catch (err) {
      console.error('保存失败', err)
      this.setData({
        busy: '',
        errLine: (err.data && err.data.detail) || t('saveFailed', lang),
      })
    }
  },
})
