const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { TIP_DOT } = require('../../utils/palette.js')
const poster = require('../../utils/poster.js')

/* 这一屏的底图与首页／列表**同一个出处**：`poster.homeBg()`＝本机那一枚「背景」槽 → 后台下发的
   运营图 → 空。取不到就是空，那一态两层都不画（见 view.wxml 那两条 `wx:if`），整屏退回原来那层米白。
   ⚠ 这一页原来还吃 `utils/imgBrightness.js` 的深浅两态（窗外那几行字要跟着壁纸翻墨／翻纸白）。
   站长 10-24 第二句「打开的风格布局要一致性，不要另外设计」之后窗外一个字都不留 ⇒ 这一页不再判深浅，
   共用实现本身一个字没动（首页／列表／详情窗照旧吃它）。 */

Page({
  data: {
    share: null,
    loading: true,
    error: '',
    lang: 'zh',
    t: texts('zh'),
    authorInitial: '',
    saving: false,
    saved: false,
    // 通栏大图那一块是**滑动**的，当前第几张必须有状态（数字与那一排点都吃它）。
    figAt: 0,
    // 那枚小黄点的色只从 palette 出，不许抄进 wxss（与列表那扇详情窗同一条规矩）。
    tipDotStyle: `background:${TIP_DOT}`,
    // 壁纸那一层的路径；**空＝只有这一层不画，窗外那档暗纱照旧铺满整屏**
    // （与列表 `.float-mask` 同一条口径：纱跟着"窗开着"走，不跟着"有没有壁纸"走）。
    bgSrc: '',
    // 顶上那一条导航条与整屏那套皮，走全站唯一出口 `app.applyTheme`（详见 view.wxml 头里那条）。
    themeClass: '',
  },

  async onLoad(options) {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    // themeClass 与其余页面同一句：这一屏外面那档暗纱要压在哪层底色上、窗那张面吃哪一档
    // `--bg-card`，全由它决定。原来这一页没走这一句 ⇒ 导航条停在 `app.json` 那条写死的
    // `#f4f2ec`，而列表那扇窗顶上是一条深色（站长 10-25「外面没有毛玻璃，一比一复刻」里
    // 最上面那截就是这么来的）。
    this.setData({ lang, t: texts(lang), themeClass: app.applyTheme(app.getWallpaper()) })
    app.setNavTitle('navShareView', lang)
    this._readBg()

    // 小程序码带进来的 scene 是一段没保证的外部输入：一个残缺的百分号就能让
    // decodeURIComponent 抛 URIError。原来这一句写在 try 外面，抛了之后 loading
    // 再没人改，页面就永久停在"加载中…"——比一句"链接不对"糟得多。
    let token = options.token || ''
    if (!token && options.scene) {
      try {
        token = decodeURIComponent(options.scene)
      } catch (err) {
        console.error('scene 参数解不开', options.scene, err)
        token = ''
      }
    }

    if (!token) {
      this.setData({ loading: false, error: t('invalidShare', lang) })
      return
    }

    try {
      const share = await api.getShare(token)
      // 首字在 JS 里取：WXML 的表达式取不了 String.prototype.slice，
      // 而那个圆形色块上必须印昵称的第一个字。
      // figAt 一起归零：这一页可以被复用（好友那条与朋友圈那条开的都是本页），
      // 不换 token 时它停在上一篇划到的那一张上，数字与点就跟着念错的张数。
      this.setData({ share, authorInitial: (share.author_name || '').slice(0, 1), figAt: 0, loading: false })
      if (share.title) {
        wx.setNavigationBarTitle({ title: share.title })
      }
      // 正文到手再读一次底图：运营图是 app.js 进门那趟 pull 下来的，从扫码**直达**这一页时
      // 它很可能比 onLoad 晚到几百毫秒，只读一次会让人停在"没有皮"那一态（同一台机第二次开就正常，
      // 最难复现的那种"有时有有时没有"）。
      this._readBg()
    } catch (err) {
      console.error('获取分享失败', err)
      this.setData({
        loading: false,
        error: err.statusCode === 404
          ? t('shareExpired', lang)
          : t('loadFailed', lang),
      })
    }
  },

  // 底图取一次；同一个值不重复 setData。
  _readBg() {
    const src = poster.homeBg() || ''
    if (src !== this.data.bgSrc) this.setData({ bgSrc: src })
  },

  // 存进自己的库：抄的是服务端那份公开快照，来源由服务端钉在笔记上，客户端改不掉。
  /* 存完落在**他自己的笔记列表**（站长 10-27 原话「存入后，不要跳到这里，要直接跳到用户的笔记
     列表」——把 10-25 那句「自动跳转到…该笔记详情页」翻了，落点从整页详情换成列表那一屏）。
     列表是 tab 页 ⇒ 只有 `switchTab` 进得去（`navigateTo`／`redirectTo` 对 tab 页一律失败）。
     ⚠ 这一跳会把落地页整个销毁（官方那句"并关闭所有其它页面"），三条连带都在这儿，别当漏改补回去：
     · 原来给"从详情页退回来"准备的那一面 `saved` 复位旗（M10）没有对象了 ⇒ 一并撤掉。
       "删了再存"那条路现在必然始于一屏全新的落地页（`saved` 出生就是假），不复位也存得进。
     · 服务端回体里那个 `id` 在这一屏没有消费者了，所以不接变量：列表 `onShow` 那趟按
       `created_at` 倒序重取整表，刚存那一篇自己就落在顶上第一行 ⇒ **回执由那一行给**。
       （原来那句「你已收藏该笔记」是详情页页底那条 bar 说的，换落点之后这一屏没有那条 bar；
        「有 N 张图没能存下来」那半句同理暂时没有说它的地方——已摆成待拍，不替他决定补不补。）
     · `saved` 这一枚仍置真：`switchTab` 万一没成（页面栈异常那一类），人留在这一屏，
       按钮得念「已存入笔记」，而不是让他再按一次。 */
  async saveToMine() {
    const { lang, share, saving, saved } = this.data
    if (!share || saving || saved) return
    this.setData({ saving: true })
    try {
      const app = getApp()
      // 落地页是免登录可读的，但"存进我的笔记"必须有身份。扫码进来时 onLaunch 那条
      // 静默登录通常早就回来了，这里只是兜住它还没回来的那一瞬。
      if (!app.globalData.token) await app.getLoginPromise()
      await api.importFromShare(share.token)
      this.setData({ saving: false, saved: true })
      wx.switchTab({ url: '/pages/index/index' })
    } catch (err) {
      console.error('转存失败', err)
      this.setData({ saving: false })
      // 服务端这类失败带的是中文原因（额度满了、这条已经关了），照实说比"没存上"有用
      const reason = (err && (err.detail || (err.data && err.data.detail))) || ''
      wx.showToast({ title: reason || t('saveMineFailed', lang), icon: 'none' })
    }
  },

  // 划到第几张：那一枚「1/5」与下面那一排点都吃这一个数。
  onFigChange(e) {
    this.setData({ figAt: (e && e.detail && e.detail.current) || 0 })
  },

  // 点大图看全屏：urls 给整排，大图态里左右划能划完这一篇的图（与详情页同一个动作）。
  onPreviewShot(e) {
    const list = (this.data.share && this.data.share.assets) || []
    const urls = list.map((x) => x && x.cloud_url).filter(Boolean)
    if (!urls.length) return
    const cur = e.currentTarget.dataset.url
    wx.previewImage({ current: cur && urls.indexOf(cur) >= 0 ? cur : urls[0], urls })
  },

  copySource() {
    const url = this.data.share && this.data.share.source_url
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: t('linkCopied', this.data.lang), icon: 'success' }),
    })
  },

  onShareAppMessage() {
    const { share } = this.data
    if (!share) return {}
    return {
      // 标题缺失时兜到应用名，且跟着当前语言走（这一行是发给接收方看的）
      title: share.title || t('appName', this.data.lang),
      path: `/pages/share/view?token=${share.token}`,
    }
  },

  // 朋友圈那条只能带 query、改不了路径，所以它开的就是本页；token 带上，点开看到的还是这一篇。
  onShareTimeline() {
    const { share } = this.data
    if (!share) return {}
    return {
      title: share.title || t('appName', this.data.lang),
      query: `token=${share.token}`,
    }
  },
})
