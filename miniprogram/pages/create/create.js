const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { toneStyle } = require('../../utils/palette.js')

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
    // 手风琴：'' | 'url' | 'shot' | 'write'，同一时刻最多一个
    active: '',
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
    // 三张卡各自的饱和色，色值和字色配对仍归 palette 管
    skinUrl: toneStyle(1),
    skinShot: toneStyle(2),
    skinWrite: toneStyle(0),
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
      themeClass: app.applyTheme(app.globalData.userInfo?.wallpaper || 'default'),
      shotDesc: this.shotDescFor(this.data.previewImages.length),
    })
    app.setNavTitle('navCreate', lang)
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateLabels()
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

  // 卡片外任意空白都收起到默认态；忙的时候不收，别把进度藏起来
  collapse() {
    if (this.data.busy || !this.data.active) return
    this.setData({ active: '', errLine: '', errPerm: false })
  },

  toggleCard(e) {
    const kind = e.currentTarget.dataset.kind
    if (this.data.busy || this.data.active === kind) return
    this.setData({
      active: kind,
      errLine: '',
      errPerm: false,
      urlHint: this.hintFor(this.data.urlInput),
    })
    if (kind === 'write') this.loadCategories()
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

  onPickCategory(e) {
    const i = Number(e.detail.value)
    if (!(i >= 0)) return
    this.setData({ catIndex: Math.min(i, Math.max(this.data.categoryNames.length - 1, 0)) })
  },

  // ---------- URL 导入 ----------
  onUrlInput(e) {
    const value = e.detail.value
    this.setData({ urlInput: value, urlHint: this.hintFor(value), errLine: '' })
  },

  clearUrl() {
    this.setData({ urlInput: '', urlHint: 'idle' })
  },

  pasteUrl() {
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
    })
  },

  clearShots() {
    if (this.data.busy) return
    this.setData({ previewImages: [], shotDesc: this.shotDescFor(0) })
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
      this.setData({ busy: '', previewImages: [], shotDesc: this.shotDescFor(0) })
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
    this.setData({ active: '', errLine: '', errPerm: false })
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
      this.setData({ busy: '', writeTitle: '', writeBody: '', catIndex: 0, active: '' })
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
