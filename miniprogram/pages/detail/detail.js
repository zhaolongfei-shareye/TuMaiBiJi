const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { blockSkinFor, toneVars, paleStep } = require('../../utils/palette.js')
const { formatDateTime, formatShortDate } = require('../../utils/date.js')
const cloudUpload = require('../../utils/cloudUpload.js')
const cardCloud = require('../../utils/cardCloud.js')
const poster = require('../../utils/poster.js')

const SOURCE_TYPE_KEYS = {
  wechat_article: 'sourceWechatArticle',
  web_article: 'sourceWebArticle',
  screenshot: 'sourceScreenshot',
  manual: 'sourceManual',
  share_import: 'sourceShareImport',
}

Page({
  data: {
    note: null,
    loading: true,
    showOriginal: false,
    themeClass: '',
    lang: 'zh',
    t: texts('zh'),
    noteId: null,
    shared: false,
    // 这篇的配图（云开发存储里的 fileID 列表）。这条链 10-07 整条上线了（后端 + 桶可写），
    // 没传过图的这篇才是空数组。
    noteImages: [],
    // 右上那一格：这篇留过的那张卡片（图已经被系统清掉的那一条不算，见 cardLog.aliveFor）
    // + 淡底方形的底色 + 品牌字。三个键的名字与详情窗那份逐字相同，两页画的是同一份标记。
    detailCards: [],
    swatchBg: paleStep('default'),
    brandGlyph: poster.BRAND_GLYPH,
    _loaded: false,
  },

  onLoad(options) {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      themeClass: app.applyTheme(app.getWallpaper()),
      // 那一格淡底的底色与这一页的主题吃同一份快照（都在进页这一下从当前壁纸算出来）：
      // 分两处取就会出现"纸面换了、淡底没换"的半新半旧。
      swatchBg: paleStep(app.getWallpaper()),
    })
    app.setNavTitle('navDetail', lang)
    if (options.id) {
      this.setData({ noteId: options.id })
      this.loadNote(options.id)
    }
  },

  onShow() {
    // Skip first show (onLoad already loaded), only reload on navigateBack
    if (this.data.noteId && this.data._loaded) {
      this.loadNote(this.data.noteId)
    }
  },

  async loadNote(id) {
    this.setData({ loading: true })
    try {
      let note = await api.getNote(id)
      if (note.is_private && !this._privateVerified) {
        const ok = await this._promptPrivatePassword()
        if (!ok) {
          this.setData({ loading: false })
          wx.navigateBack()
          return
        }
        this._privateVerified = true
        // 验完密码必须重取一次：第一份是服务端裁过的空壳（正文、要点、概要都是 null），
        // 直接渲染会渲染出一篇"什么都没有"的笔记。解锁凭证已经在 api.js 里存好了，
        // 这一次带上请求头，服务端才发全文。
        note = await api.getNote(id)
      }
      const lang = this.data.lang
      const key = SOURCE_TYPE_KEYS[note.source_type]
      note.source_type_label = key ? t(key, lang) : note.source_type
      note.created_at_label = formatDateTime(note.created_at)
      
      // Resolve category name from categories list
      let categoryName = null
      if (note.category_id) {
        try {
          const categories = await api.getCategories()
          const category = categories.find(c => c.id === note.category_id)
          if (category) {
            categoryName = category.name
          }
        } catch (err) {
          console.error('加载分类列表失败', err)
        }
      }
      note.category_name = categoryName

      // 详情页头部沿用列表那一行的方块：颜色与构图必须和列表里那条一模一样，
      // 所以复用 blockSkinFor，不在这另写一套取色规则。
      const skin = blockSkinFor(note.category_id, note.id)
      note.blockStyle = skin.style
      // 中性面板里的序号圆点要借分类色，但不能贴方块那串——那会把整块面板染成色块
      note.toneStyle = toneVars(note.category_id)
      note.motif = skin.motif
      // 方块上的字跟列表那条保持同一规则：第一个标签优先，没标签才回退分类名
      const firstTag = (note.tags || []).map((x) => (x || '').trim()).find(Boolean) || ''
      note.blockName = firstTag || note.category_name || (note.category_id == null ? this.data.t.noCategory : '')
      note.date_label = formatShortDate(note.created_at)
      // 转存进来的那一条才有：来源是服务端钉住的，编辑接口碰不到这一栏，所以这里只读。
      note.imported_label = note.imported_from ? formatShortDate(note.imported_from.imported_at) : ''
      
      // noteImages 跟着这一篇重新起头：这一页会从"另一篇"navigateTo 进来，onShow 也会
      // 用新的 id 重取。读图那一步要是慢了或失败了，留着上一篇的图就等于张冠李戴。
      // detailCards 同理跟着重读一遍：从笔记卡片页生成完返回这一页走的就是 onShow → 这里，
      // 右上那一格于是从「+」翻成那张缩略图——站长 10-07 报的就是这一页出完一张还能再点一次。
      // 这一趟先吃本机那一份（cellFor：文件在就画它），紧接着 loadCard 再从服务器补一次——
      // 本机那个 jpg 已经被系统清掉的那些，就是靠后一趟找回来的。
      this.setData({
        note, loading: false, _loaded: true, noteImages: [],
        detailCards: cardCloud.cellFor(note.id),
      })
      this.loadShareStatus(note.id)
      this.loadImages(note.id)
      this.loadCard(note.id)
      // 搜一搜索引页面标题：用笔记真实标题替代静态"笔记详情"
      if (note.title) {
        wx.setNavigationBarTitle({ title: note.title })
      }
    } catch (err) {
      console.error('加载笔记失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: t('loadFailed', this.data.lang), icon: 'none' })
    }
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

  // 这篇有哪些配图。
  //
  // 为什么先判 cloudReady 再打这个请求：`cloud://…` 这个地址只有在 wx.cloud.init 过的
  // 环境里才画得出来（app.js onLaunch 那一步），环境 ID 没填时就算把行读回来也只能画出一
  // 片破图。所以这一句同时挡住三件事：今天不新增任何请求、不出现破图、不让人以为"图丢了"。
  async loadImages(noteId) {
    if (!cloudUpload.cloudReady()) return
    try {
      const list = await api.getNoteAssets(noteId)
      // 拿回来的路上这一页可能已经切到别篇（onShow 重取）——按当前这一篇对一下号再画。
      if (String(this.data.noteId) !== String(noteId)) return
      this.setData({ noteImages: list || [] })
    } catch (err) {
      // 配图读不到不该影响这篇笔记本身，界面上也就是少一排缩略图
      console.warn('配图读取失败（不影响正文）', err && (err.errMsg || err.statusCode))
    }
  },

  // 右上那一格画哪一张（2.0.1 S2）。**判据在服务器那一行 `note_cards` 上**，不在本机那个 jpg：
  // 本机那张还在就照画（快、不花钱），不在了就用云上登记的这份顶上——后者就是站长 10-08
  // 定性成严重问题的那一态（"版本更新之后卡片不见了"）。
  // 先画本机那一份再等这一趟：这一格从来不是主流程，晚一拍补上比转圈合适。
  async loadCard(noteId) {
    if (!cloudUpload.cloudReady()) return
    try {
      const r = await cardCloud.refreshOne(noteId)
      if (!r || String(this.data.noteId) !== String(noteId)) return
      this.setData({ detailCards: cardCloud.cellFor(noteId) })
    } catch (err) {
      console.warn('卡片留档没读到（不影响正文）', err && (err.errMsg || err.statusCode))
    }
  },

  // 点缩略图看大图。urls 给整排而不是那一张：大图态里左右划能划到这篇的其余几张。
  onPreviewImage(e) {
    const urls = this.data.noteImages.map((x) => x.cloud_url).filter(Boolean)
    if (!urls.length) return
    const cur = e.currentTarget.dataset.url
    wx.previewImage({ current: cur && urls.indexOf(cur) >= 0 ? cur : urls[0], urls })
  },

  // 这篇对外不对外，只有服务端知道（海报可能是在另一台手机上生成的）。
  async loadShareStatus(noteId) {
    try {
      const s = await api.getShareStatus(noteId)
      this.setData({ shared: !!(s && s.active) })
    } catch (err) {
      // 读不到就不显示这一行。绝不能猜一个"没在公开"给人看——那等于把该收的东西留着。
      console.error('分享状态读取失败', err)
    }
  },

  onUnshare() {
    const { noteId, lang } = this.data
    wx.showModal({
      title: t('unshare', lang),
      content: t('unshareBody', lang),
      confirmText: t('unshareConfirm', lang),
      cancelText: t('cancel', lang),
      success: async (res) => {
        if (!res.confirm) return
        try {
          await api.revokeShare(noteId)
          this.setData({ shared: false })
          wx.showToast({ title: t('unshared', lang), icon: 'success' })
        } catch (err) {
          console.error('撤掉分享失败', err)
          wx.showToast({ title: t('unshareFailed', lang), icon: 'none' })
        }
      },
    })
  },

  onEdit() {
    const { note } = this.data
    wx.navigateTo({ 
      url: `/pages/write/write?id=${note.id}&mode=edit` 
    })
  },

  onDelete() {
    const { lang } = this.data
    wx.showModal({
      title: t('confirmDelete', lang),
      content: t('cannotRestore', lang),
      success: async (res) => {
        if (res.confirm) {
          try {
            const r = await api.deleteNote(this.data.note.id)
            // 行是服务端删的，**对象只有这一侧删得动**（那台后端没有云开发凭据）。
            // 不等它：这一句自己不会抛（cloudUpload 任何失败都回 0），而"删除成功"那声
            // 吐司不该被一次清库存的慢请求拖住。
            cloudUpload.dropFromDeleteRes(r)
            // 这篇的卡片留档也跟着忘：服务端那几行是 delete_note 一起删的（回体里就带着
            // 它们的 fileID），本机这一半漏了的话，SQLite 把同一个号发给下一篇时，
            // 那一篇头上会挂着这一篇那张图。
            cardCloud.forget(this.data.note.id)
            wx.showToast({ title: t('deleteSucceeded', lang), icon: 'success' })
            setTimeout(() => {
              wx.navigateBack()
            }, 1000)
          } catch (err) {
            wx.showToast({ title: t('deleteFailed', lang), icon: 'none' })
          }
        }
      },
    })
  },

  toggleOriginal() {
    this.setData({ showOriginal: !this.data.showOriginal })
  },

  openSourceUrl() {
    const { source_url } = this.data.note
    if (source_url) {
      wx.setClipboardData({
        data: source_url,
        success: () => {
          wx.showToast({ title: t('linkCopied', this.data.lang), icon: 'success' })
        },
      })
    }
  },

  /* 右上那一格 = 这一页出卡片的唯一入口（底排那枚「生成笔记卡片」10-07 撤了，
     同一件事不留两个把手；这条是 v20 那一稿早就拍了的口径）。两态两件事：
     · 这篇留过卡片 → 看那一张大图（跟详情窗那格点了拉成品弹窗同一句话："点小图直接看大图"，
       站长 10-04）。这一页没有画布，所以走 `wx.previewImage` 看台账里那份成品图。
     · 一张都没有 → 去笔记卡片页生成。生成完回来这一格自己会翻成缩略图（见 loadNote）。
     私密笔记走不到这里：那一格整块不渲染（与详情窗同一条口径），服务端也不许私密篇分享。 */
  onCardCell() {
    const cards = this.data.detailCards
    if (cards && cards.length) {
      wx.previewImage({ urls: [cards[0].p], current: cards[0].p })
      return
    }
    const { note } = this.data
    if (!note) return
    wx.navigateTo({ url: `/pages/share/share?id=${note.id}` })
  },
})
