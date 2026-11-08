const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const pwdSheet = require('../../utils/pwdSheet.js')
const { allowPrivate, isPrivate, unlockOn, exitOrHome } = require('../../utils/privateGate.js')
const { labelOf } = require('../../utils/catText.js')
const cardCloud = require('../../utils/cardCloud.js')
const cloudUpload = require('../../utils/cloudUpload.js')
// 补传配图那一条要的两枚（11-08）：压图走 imageCompress（与录入页同一个压法，
// 免得同一张图在这一页压成另一副样子），"传上去了还没登记"那批走 assetQueue
// （与录入页 B 链同一条路：app.js 在进前台时把那批补上）。
const { compressForBackup } = require('../../utils/imageCompress.js')
const assetQueue = require('../../utils/assetQueue.js')

/* 这一页要发出去的那五栏，读回来时先存一份基线（站长 10-12 拍 C3 甲）。两个用途：
   ① 保存只发**真动过**的那几栏——原来这一页是整份 PUT，拿一份服务端裁过的空壳去存，
      等于把他真正的概要和要点清空（§七 严重③，那一趟只堵住了"猜是不是 null"那一半）；
   ② 基线没建起来（读详情那一趟挂了、或凭证在这一页中途过期）就一个字都不发。
   ⚠ 归一化必须两头同一把尺：库里是数组、屏上是文本框，两边都折成"去掉项目符号的那些行"，
      否则"他一个字没改"也会被算成改过，这一刀就白补了。 */
const normLines = (v) => (Array.isArray(v) ? v : (v == null ? [] : [v]))
  .map((x) => String(x || '').replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean).join('\n')
// ⚠ 这一把尺两头喂进来的形状不一样：库里 `tags` 是**数组**（`/api/notes/{id}` 直接回
//   `["邓丽君","林青霞"]`），屏上那一只文本框读回来是**字符串**。原来这里只把非数组那支折成字符串，
//   数组那一支原样交给 `.split` ⇒ 每次进「编辑笔记」都在建基线那一行抛 `split is not a function`，
//   被 catch 接住就成了"内容都铺出来了、却弹一句加载失败"（10-18 站长真机抓到，模拟器同一篇复现）。
const normTags = (v) => (Array.isArray(v) ? v.join(',') : (v == null ? '' : String(v)))
  .split(/[，,]/).map((x) => x.trim()).filter(Boolean).join(',')

Page({
  data: {
    lang: 'zh',
    t: texts('zh'),
    themeClass: '',
    noteId: null,
    isEdit: false,
    formData: {
      title: '',
      summary: '',
    },
    keyPointsText: '',
    tagsText: '',
    tagList: [],
    shots: [],
    shotDrag: -1,   // 拖动中那一枚的下标（-1＝没在拖）。只用来给它挂一枚浮起来的皮
    // 补传配图那几格（11-08「提炼笔记后，再编辑笔记，支持上传新的图片，仍然是 9 张，要过审」）
    shotsBusy: false,   // 那一趟在飞（压图→送检→上传→登记，串行走一遍）
    shotsLoaded: false, // 这一篇现有几张读回来过：读失败就不知道还剩几格，不许开选图
    maxShots: api.MAX_SHOTS, // 一篇能挂几张（同一个出处：utils/api.js；前后端两侧同值由尺子钉）
    // 「原文」这一栏（站长 10-18 连着三句「看不到原文」）。编辑这一屏原来只有五栏，
    // 原文只在详情那一屏、还默认收起——他要的是在改的这一屏就能看见它。
    originalText: '',
    categories: [],
    categoryNames: [],
    selectedCategoryIndex: -1,
    originalCategoryId: null, // Store original category ID to avoid clearing on failed load
  },

  async onLoad(options) {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData({
      lang,
      t: texts(lang),
      categoryNames: [t('noCategory', lang)],
      themeClass: app.applyTheme(app.getWallpaper()),
    })
    app.setNavTitle('writeNote', lang)
    await this.loadCategories()

    if (options.id && options.mode === 'edit') {
      this.setData({ noteId: parseInt(options.id), isEdit: true })
      app.setNavTitle('editNote', this.data.lang)
      await this.loadNoteForEdit()
    }
  },

  async loadCategories() {
    try {
      const categories = await api.getCategories()
      this.setData({
        categories,
        // 第一项是"未分类"这个概念，跟着界面语言走；后面那些是他自己起的名字——
        // 10-17 起也跟着界面语言走（他那句「分类名称是中文，切换英文，自动翻译；如果翻译不了，就维持原文」），
        // 规则只在 utils/catText.js 那一份里。
        // ⚠ 上面 `categories` 那一栏原样留着：私密那道闸（`allowPrivate`）判的是 `c.name`，
        //   那是身份，不许被译文换掉。
        categoryNames: [t('noCategory', this.data.lang)].concat(
          categories.map((c) => labelOf(c, this.data.lang))
        ),
      })
    } catch (err) {
      console.error('加载分类失败', err)
    }
  },

  async loadNoteForEdit() {
    try {
      let note = await api.getNote(this.data.noteId)
      // 没解锁时服务端把私密笔记的概要、要点、正文都裁成 null（后端 app/core/private_access.py）。
      // 这一页保存是 PUT 回去的，拿一份裁过的空壳去存，等于把他真正的概要和要点清空。
      // C3 甲（站长 10-12）：**这一页进门就自己问一次**，不再依赖"上一屏问过没有"——
      // 上一版是读回来发现没凭证就吐司一句再退走，那一句「请先解锁」没给出口，
      // 而且深链／编辑重进／凭证刚好在这一刻过期，三种都能撞上去。
      // 判据与两处详情窗同一个出处（utils/privateGate.js 的 unlockOn）：真验过一次才算解锁。
      if (note.is_private && !(await unlockOn(this, note))) {
        exitOrHome()
        return
      }
      if (this._unlockRenewed) {
        // 刚验完必须重取：上一份还是服务端裁过的空壳，直接铺进表单就是把空壳当"他的原文"。
        note = await api.getNote(this.data.noteId)
      }
      const categoryIndex = note.category_id 
        ? this.data.categories.findIndex(c => c.id === note.category_id)
        : -1
      
      this.setData({
        'formData.title': note.title || '',
        'formData.summary': note.summary || '',
        keyPointsText: (note.key_points || []).join('\n'),
        tagsText: (note.tags || []).join(', '),
        tagList: (note.tags || []).map((s) => (s || '').trim()).filter(Boolean),
        originalText: note.original_content || '',
        selectedCategoryIndex: categoryIndex,
        originalCategoryId: note.category_id, // Preserve original even if categories fail to load
      })
      // 基线就是"这一页刚铺开的那六栏"，与上面 setData 同一趟建，别事后从 data 里回读
      // （回读会把他刚敲进去的字也算成改动）。
      this._baseline = {
        title: note.title || '',
        summary: note.summary || '',
        key_points: normLines(note.key_points),
        tags: normTags(note.tags),
        original: note.original_content || '',
        category_id: note.category_id == null ? null : note.category_id,
      }
      // 配图那一排跟着这一篇一起铺（不等它：读图不该拖住表单出字）。
      // 锁着的私密篇服务端回的是空数组，所以这里不用另判解锁。
      this.loadShots()
    } catch (err) {
      console.error('加载笔记失败', err)
      wx.showToast({ title: t('loadFailed', this.data.lang), icon: 'none' })
    }
  },

  onTitleInput(e) {
    this.setData({ 'formData.title': e.detail.value })
  },

  onSummaryInput(e) {
    this.setData({ 'formData.summary': e.detail.value })
  },

  onKeyPointsInput(e) {
    this.setData({ keyPointsText: e.detail.value })
  },

  onTagsInput(e) {
    const tagsText = e.detail.value
    this.setData({ tagsText, tagList: this.splitTags(tagsText) })
  },

  onOriginalInput(e) {
    this.setData({ originalText: e.detail.value })
  },

  // 标签顺序就是"色块上显示哪个字"的顺序：第一位上列表方块。
  // 所以这里不让人拖拽，只给一个动作——点任意一个标签，它就到第一位去了。
  splitTags(text) {
    return (text || '').split(/[，,]/).map((s) => s.trim()).filter(Boolean)
  },

  promoteTag(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!index) return
    const tagList = this.data.tagList.slice()
    tagList.unshift(tagList.splice(index, 1)[0])
    this.setData({ tagList, tagsText: tagList.join(', ') })
  },

  async onCategoryChange(e) {
    const idx = parseInt(e.detail.value)
    const next = idx === 0 ? -1 : idx - 1
    const name = next >= 0 ? (this.data.categories[next] || {}).name : ''
    // 私密分类要先设密码才让选；被挡下时不改 selectedCategoryIndex，
    // 界面上那一行还是原来那格，不会出现"提示没设密码、分类却已经变了"。
    if (!(await allowPrivate(name, this.data.lang))) return
    this.setData({ selectedCategoryIndex: next })
  },

  onCancel() {
    wx.navigateBack()
  },

  // 配图那一排（站长 10-18：「编辑时，图片要展示，然后支持删除图片」）。
  // 与详情页那一排同一个口、同一个前提：`cloud://` 那个地址只有在 wx.cloud.init 过的环境里
  // 画得出来，所以 cloudReady() 假的时候连请求都不发。
  // 读失败只留一行日志、不弹「加载失败」：这一排不在保存那条主流程上，
  // 一句报错会让人以为这篇笔记坏了。
  async loadShots() {
    if (!cloudUpload.cloudReady()) return
    try {
      const list = await api.getNoteAssets(this.data.noteId)
      this.setData({ shots: list || [], shotsLoaded: true })
    } catch (err) {
      console.warn('配图读取失败（不影响正文）', err && (err.errMsg || err.statusCode))
    }
  },

  // 重读整排（登记完那一次用）。绑图那个口回的是**这次登记的那几行**、不是整排，
  // 拿它直接铺会只剩新加的那几张、老的那几张从屏上消失。
  async _refreshShots() {
    try {
      const list = await api.getNoteAssets(this.data.noteId)
      this.setData({ shots: list || [] })
    } catch (err) {
      console.warn('配图重读失败（屏上这一排是登记前的）', err && (err.errMsg || err.statusCode))
    }
  },

  // ---------- 补传配图（11-08「提炼笔记后，再编辑笔记，支持上传新的图片，仍然是 9 张，要过审」）
  //
  // 这一条与录入页那一条**不是同一条链**，差别决定了两件事：
  //  · 录入页那批图是提炼的**原料**：走 ingest 提交，服务端那道内容安全闸
  //    （`wechat.enforce_image_safety`）在提交那一趟上。
  //  · 这一页补的是**已经建好的那一篇**的配图：字节客户端直传云存储，登记只发 file_id，
  //    服务端那个绑图的口（POST /api/notes/{id}/assets）只管张数与归属，**不碰字节**
  //    ——后端没有云开发凭据，它压根读不到那张图。
  // ⇒ "要过审"这一格只能在这一侧落地：上传之前先送 `api.checkShot`（服务端真跑微信内容安全，
  //   回 pass/risky/unavailable 三态），微信明确说 risky 的那一张**不上云、不登记**。
  // 纪律与录入页那一趟同一支：只有微信明确判 risky 才拦；unavailable（微信抖动）与没检成
  // 一律放行——微信侧抖动不许变成"用户存不了自己的笔记"。

  // 补图那一枚（➕）。点了先过四道：编辑态、有没有这篇、这一篇现有几张读回来过、还剩几格。
  onAddShot() {
    const { lang, noteId, shots, maxShots } = this.data
    if (!this.data.isEdit || !noteId) return
    if (this.data.shotsBusy) return
    if (!this.data.shotsLoaded) {
      // 现有几张没读回来 ⇒ 不知道还剩几格。这时候放选图，选上来的必然装不下，
      // 而症状是静默少图（界面不报错，绑图那一个口回一句 400 也只是半句）。宁可先说加载失败。
      wx.showToast({ title: t('loadFailed', lang), icon: 'none' })
      return
    }
    const left = maxShots - shots.length
    if (left <= 0) {
      // 满了。静默截掉是这一条最容易犯的错（选了 12 张只留 9 张、界面一句都不说），
      // 所以先给话，而且话里带那个数（从常量拼，不在字典里写死第二个数）。
      wx.showToast({ title: t('maxShots', lang).replace('{n}', maxShots), icon: 'none' })
      return
    }
    if (!cloudUpload.cloudReady()) {
      wx.showToast({ title: t('cloudNotReady', lang), icon: 'none' })
      return
    }
    wx.chooseMedia({
      // 只给"还剩几格"：系统选择器自己就把上限卡住了，这里不需要再截一刀
      count: left,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = (res && res.tempFiles) || []
        if (!files.length) {
          wx.showToast({ title: t('noImagePicked', lang), icon: 'none' })
          return
        }
        this._addShots(files.map((f) => f.tempFilePath))
      },
      fail: (err) => {
        const msg = String((err && err.errMsg) || '')
        if (msg.indexOf('cancel') > -1) return   // 他自己按了取消，不是故障
        console.error('chooseMedia 失败', msg)
        // 这一屏没有"点这里去设置"那一格 ⇒ 不许说去设置（说了他找不到那个口），
        // 只说没能打开相册／相机，请再试一次。
        wx.showToast({ title: t('pickFailed', lang), icon: 'none' })
      },
    })
  },

  // 一张一张走：压 → 送检 → 上云 → 登记。**串行**（与录入页同一条理由：九张 4000×3000
  // 一起重绘离屏 canvas 会把内存吃穿，真机在这件事上比模拟器诚实得多）。
  async _addShots(paths) {
    const { lang, noteId } = this.data
    if (this.data.shotsBusy || !noteId) return
    this.setData({ shotsBusy: true })
    wx.showLoading({ title: t('shotsUploading', lang), mask: false })
    const userId = getApp().globalData.userId
    const items = []
    const fileIDs = []
    let risky = 0
    let badFormat = ''
    try {
      for (const p of paths) {
        const small = await compressForBackup(p)
        // 压不动（读不到尺寸／画不出来）就交原图：宁可这一张大一点，也不要"图丢了"
        const src = small || { path: p, bytes: null }
        const v = await this._shotVerdict(src.path)
        if (v.risky) { risky += 1; continue }   // 没过审的那一张：不上云、不登记
        if (v.badFormat) { badFormat = v.badFormat; continue }
        const up = await cloudUpload.uploadImage(src.path, userId)
        if (!up) continue
        fileIDs.push(up.fileID)
        items.push({
          file_id: up.fileID,
          size: small ? small.bytes : null,
          width: small ? small.width : null,
          height: small ? small.height : null,
        })
      }
      if (!items.length) {
        // 一张都没成：要么全没过审，要么全传不上。这两种话说两句不同的实话，
        // 不许合成一句"失败"——他分不清该换图还是该重试。
        wx.hideLoading()
        this.setData({ shotsBusy: false })
        wx.showToast({
          title: risky ? t('shotBlocked', lang) : (badFormat || t('shotsSaveFailed', lang)),
          icon: 'none',
        })
        return
      }
      try {
        await api.bindNoteAssets(noteId, items)
      } catch (e) {
        const code = e && e.statusCode
        // 4xx（超张数／不是你的／这篇没了）⇒ 这批对象永远绑不上（绑图那一个口只认"登记"这一件事），
        // 留着就是占全站配额又没人认得的孤儿 ⇒ 删掉，并把服务端那句话照实说出来。
        // 其它（网络／5xx／429）⇒ 图已经上去了，登记这一趟下次进前台补
        // （assetQueue 与录入页 B 链同一条路）。
        if (code && code >= 400 && code < 500 && code !== 429) {
          await cloudUpload.deleteFiles(fileIDs)
          wx.hideLoading()
          this.setData({ shotsBusy: false })
          wx.showToast({ title: (e.data && e.data.detail) || t('saveFailed', lang), icon: 'none' })
          return
        }
        assetQueue.push(noteId, items)
        wx.hideLoading()
        this.setData({ shotsBusy: false })
        wx.showToast({ title: t('shotsQueued', lang), icon: 'none' })
        return
      }
      await this._refreshShots()
      wx.hideLoading()
      this.setData({ shotsBusy: false })
      wx.showToast({
        title: risky
          ? t('shotsAddedSome', lang).replace('{n}', risky)
          : t('shotsAdded', lang),
        icon: risky ? 'none' : 'success',
      })
    } catch (err) {
      wx.hideLoading()
      this.setData({ shotsBusy: false })
      console.error('补传配图失败', err)
      wx.showToast({ title: t('shotsSaveFailed', lang), icon: 'none' })
    }
  },

  // 送检那一趟，回三态：
  //   risky     —— 微信明确说这张有问题：**拦住**（不上云、不登记）
  //   badFormat —— 门口就拒的那两种（不是能识别的图片、大过那一道）：这是**格式**问题，
  //                说成"违规"是一句冤枉话，所以单独一档，念的是后端回的那句实话
  //   ok        —— 过检，或没检成（微信抖动／网络）。**没检成 ≠ 这张有问题**，放行。
  async _shotVerdict(path) {
    try {
      const res = await api.checkShot(path)
      if (res && res.verdict === 'risky') return { risky: true }
      return { ok: true }
    } catch (e) {
      if (e && e.statusCode === 400) {
        return { badFormat: (e.data && e.data.detail) || t('shotBadFormat', this.data.lang) }
      }
      console.warn('这张没检成，按未检成放行', e)
      return { ok: true }
    }
  },

  // 删一张。两趟的顺序照 cardCloud.dropServer 那一条（10-11 审计严重①就是从它的反面来的）：
  // ① 先把这张的地址记进待删那一格，**再**发请求——服务端那一步删的是行，而云上那个对象
  //    只有这一侧删得动（那台后端没有云开发凭据）。回体要是丢在网络上，行没了、地址也没人
  //    记得，那个对象就永久占着全站配额，而界面上谁也看不见它。
  // ② 行删成之后拿回体刷新那一排（回的就是剩下的那批），再去清对象；清对象这一趟不等——
  //    `deleteFiles` 自己不会抛，而「已删除」那声吐司不该被一次清库存的慢请求拖住。
  // ③ 请求没成时把①那条预留撤掉：留着会让下一次进前台删掉一张**界面上还在**的图。
  onDelShot(e) {
    const { lang, noteId } = this.data
    const { id, url } = e.currentTarget.dataset
    wx.showModal({
      title: t('confirmDelete', lang),
      content: t('cannotRestore', lang),
      success: async (res) => {
        if (!res.confirm) return
        if (url) cloudUpload.reservePurge([url])
        try {
          wx.showLoading({ title: t('deleting', lang), mask: true })
          const left = await api.deleteNoteAsset(noteId, id)
          wx.hideLoading()
          this.setData({ shots: left || [] })
          wx.showToast({ title: t('deleteSucceeded', lang), icon: 'success' })
          if (url) cloudUpload.deleteFiles([url])
        } catch (err) {
          wx.hideLoading()
          if (url) cloudUpload.unreservePurge([url])
          console.error('删除配图失败', err)
          wx.showToast({ title: (err.data && err.data.detail) || t('deleteFailed', lang), icon: 'none' })
        }
      }
    })
  },

  // ---------- 配图拖动排序（站长 10-19「笔记编辑时候，配图要支持拖动排序，方便用户选择好的图片作为头图」）
  // 构造照抄笔记页分类那一排（`pages/index/index.js` 的 `onCatDragStart` 那一组），两处按这一屏重算：
  // ① 分类那一排是一行横着滚，越过相邻那枚的中线就换；这一排是**会换行的方格**（一行四枚、最多九枚两行），
  //    只看 x 会在换行那两枚之间滑不动，所以落点改成"手指离谁的中心最近就换到谁的位置"——
  //    横竖两个方向一次判掉，不必为"上一行末"与"下一行首"那一条缝另写规则。
  // ② 分类那一排的顺序只是本机草稿，点空白才提交；这一排**松手就发**：同一排的 ✕ 本来就是
  //    当场删到服务端（10-18 那一条），一排东西两种落库时机比两种都发更让人摸不着。
  //    ⚠ 这一条他没拍过，我按"这一排本来就即时改服务端"落的；要挪到「保存」那一趟一起发，说一声。
  // ⚠ 事件一律 bind 不 catch，与分类那一排同一条：那一排也是拖得动、页面也滚得动。
  //    代价写在这儿——手指压在方格上往下滑，这一屏会跟着滚，同时顺序也可能被他改掉一格。
  // 落点全靠现量：每次换完必须重新量 rect，数组一调序手上那份就全部过期（分类那一排同一条）。
  //    起拖那一枚不需要手指坐标——第一次 touchmove 就带着，比 `longpress` 那个事件里
  //    在部分机型会空掉的 `touches` 可靠。
  onShotDragStart(e) {
    const i = Number(e.currentTarget.dataset.index)
    const shots = this.data.shots || []
    if (!(i >= 0 && i < shots.length) || shots.length < 2) return
    this._shotDrag = { i, from: shots.map((s) => s.id) }
    this.setData({ shotDrag: i })
  },

  async onShotDragMove(e) {
    const d = this._shotDrag
    if (!d || this._shotBusy) return
    const t0 = e.touches && e.touches[0]
    if (!t0) return
    this._shotBusy = true
    try {
      await this._shotDragStep(t0.clientX, t0.clientY)
    } finally {
      this._shotBusy = false
    }
  },

  async _shotDragStep(x, y) {
    const d = this._shotDrag
    if (!d) return
    const shots = this.data.shots || []
    const rects = await this._shotRects()
    // 量回来的枚数与草稿对不上 ⇒ 渲染还没跟上这一次 setData，宁可这一趟不换，
    // 也别拿过期的 rect 表去比中心（分类那一排同一条，10-18 就是栽在这儿）。
    if (rects.length !== shots.length || shots.length < 2) return
    let to = -1, best = Infinity
    for (let k = 0; k < rects.length; k++) {
      const r = rects[k]
      if (!r) continue
      const dx = x - (r.left + r.width / 2)
      const dy = y - (r.top + r.height / 2)
      const dist = dx * dx + dy * dy
      if (dist < best) { best = dist; to = k }
    }
    if (to < 0 || to === d.i) return
    const next = shots.slice()
    const it = next.splice(d.i, 1)[0]
    next.splice(to, 0, it)
    d.i = to
    this.setData({ shots: next, shotDrag: to })
    // 排布是渲染层算的，setData 回来那一瞬量到的还是换之前的位置：等一帧再量。
    await new Promise((resolve) => setTimeout(resolve, 30))
  },

  onShotDragEnd() {
    const d = this._shotDrag
    if (!d) return
    this._shotDrag = null
    this.setData({ shotDrag: -1 })
    const now = (this.data.shots || []).map((s) => s.id)
    if (now.join() === d.from.join()) return   // 拖了一圈又回到原位：不发那一趟
    this._saveShotOrder(now, d.from)
  },

  async _saveShotOrder(now, from) {
    const { lang, noteId } = this.data
    try {
      const left = await api.reorderNoteAssets(noteId, now)
      // 服务端那份才是准的：它可能把这一屏没见过的行（另一台手机刚补的一张）挪到末尾，
      // 拿回体铺一遍，屏上就不会留一份"看着存好了、其实与服务端不同序"的假象。
      if (Array.isArray(left) && left.length) this.setData({ shots: left })
    } catch (err) {
      // 发失败 ⇒ 把那一排摆回拖之前的样子再说实话。留着新序不改，屏上那枚头图就是句假话：
      // 列表、详情窗、卡片大图位读的都是服务端那一份，它们不会跟着换。
      const back = (this.data.shots || []).slice()
      const byId = {}
      back.forEach((s) => { byId[s.id] = s })
      const restored = from.map((id) => byId[id]).filter(Boolean)
      this.setData({ shots: restored.length === back.length ? restored : back })
      console.error('配图排序失败', err)
      // detail 有两种来源，屏上只许出现那一种是我们自己写的：
      // 这条口唯一的业务错是 403「这篇是私密笔记，先解锁」（中文，能给他看）；
      // 而 405/404 那种是框架兜底短语（"Method Not Allowed"），站长 10-20 就是被它顶到屏上截了图。
      // ⇒ 带中文才上屏，其余一律改说本机那句「保存失败，请重试」。
      const detail = (err.data && err.data.detail) || ''
      wx.showToast({ title: /[一-龥]/.test(detail) ? detail : t('saveFailed', lang), icon: 'none' })
    }
  },

  _shotRects() {
    return new Promise((resolve) => {
      wx.createSelectorQuery().selectAll('.wr-shot').boundingClientRect().exec((res) => {
        resolve((res && res[0]) || [])
      })
    })
  },

  // 私密解锁那一层（templates/pwd-sheet.wxml，与首页详情窗、独立详情页同一份）的三个把手。
  // 这一页 10-12 起自己问一次（C3 甲），所以这三枚不能少：少了 ask 那一把 pending 永远没人结，
  // 面板起来就再也下不去。
  onPwdBuf(e) { pwdSheet.input(this, e) },
  onPwdOk() { pwdSheet.submit(this) },
  onClosePwdPanel() { pwdSheet.cancel(this) },

  async onSave() {
    const { title } = this.data.formData
    const { lang, isEdit, noteId, categories, selectedCategoryIndex, originalCategoryId } = this.data
    if (!title.trim()) {
      wx.showToast({ title: t('enterTitle', lang), icon: 'none' })
      return
    }
    // M16：在飞闸钉在 handler 入口，不钉在 `wx.showLoading({mask:true})` 的时机上。
    // 原来这一趟唯一挡重复按的就是那层蒙层，而成功那一路 `hideLoading` 之后还有一枚吐司＋800ms
    // 才跳转——那 800 毫秒里按钮可点、无任何判据，连按两下真造得出第二篇。写法照本页编辑模式
    // 那一道早退闸（`!base` 那一支：入口判一条判据，不满足就 return，不碰按钮的视觉）。
    // 放闸的时机是"人已跳走"，任何一条失败路径当场放；
    // 闸门只在 handler 里，不写进按钮的 disabled／视觉（本仓定过的口径）。
    if (this._saving) return
    this._saving = true

    wx.showLoading({ title: t('saving', lang), mask: true })

    try {
      // Use original category ID if categories failed to load and user didn't change it
      let categoryId
      if (categories.length === 0 && originalCategoryId) {
        // Categories failed to load, preserve original
        categoryId = originalCategoryId
      } else if (selectedCategoryIndex >= 0) {
        categoryId = categories[selectedCategoryIndex].id
      } else {
        categoryId = null
      }
      
      const keyPoints = this.data.keyPointsText
        .split('\n')
        .map(s => s.replace(/^[•\-\*]\s*/, '').trim())
        .filter(s => s)

      const tags = this.data.tagsText
        .split(/[，,]/)
        .map(s => s.trim())
        .filter(s => s)

      const now = {
        title: title.trim(),
        summary: this.data.formData.summary.trim() || null,
        key_points: keyPoints.length > 0 ? keyPoints : null,
        tags: tags.length > 0 ? tags : null,
        original: this.data.originalText.trim() || null,
        category_id: categoryId,
      }

      let note
      let dropNote = ''
      if (isEdit) {
        // 编辑：只发**真动过**的那几栏（站长 10-12 拍 C3 甲）。原来整份 PUT，屏上铺的又是服务端
        // 裁过的空壳时，一次保存就把他真正的概要和要点清空。上面那道 unlockOn 已经把"空壳铺进表单"
        // 这一支堵住了，这里是第二层：基线没建起来（读详情那一趟挂了）就一个字都不发，
        // 宁可存不下，也不拿一份不知道哪来的东西去覆盖。
        const base = this._baseline
        if (!base) {
          // 这一支同样是"没打成这一趟"：闸当场放，否则人回到那一屏再点一次保存就永远没反应了。
          this._saving = false
          wx.hideLoading()
          wx.showToast({ title: t('loadFailed', lang), icon: 'none' })
          exitOrHome()
          return
        }
        const payload = {}
        if (now.title !== base.title) payload.title = now.title
        if ((now.summary || '') !== (base.summary || '')) payload.summary = now.summary
        if (normLines(now.key_points) !== base.key_points) payload.key_points = now.key_points
        if (normTags(now.tags) !== base.tags) payload.tags = now.tags
        // 原文：清空也要发得出去。后端那一条是 `model_dump(exclude_unset=True)`，
        // 显式带 `null` 才代表"我要抹掉它"，不带这一栏才是"我没动"。
        if ((now.original || '') !== (base.original || '')) payload.original_content = now.original
        if (now.category_id !== base.category_id) payload.category_id = now.category_id
        // 一个字没动就不打这一趟 PUT：PUT 会把 updated_at 顶上去、列表跟着换序，
        // 而这一趟没有任何东西要写。
        if (Object.keys(payload).length > 0) {
          note = await api.updateNote(noteId, payload)
          // 这一趟把这篇挪进了私密分类 ⇒ 它那张卡片要跟着没（站长 10-16 拍乙）。
          // 判据与卡片那一排、详情窗那两处同一个出处（privateGate.isPrivate 吃分类名）。
          // 只在**真的从别的分类挪进来**那一格动手：本来就私密的篇目每存一次都清一遍，
          // 会把"私密篇重新出一张卡"那条路也堵死（那条路服务端本来就拒，界面上不该有动作）。
          const movedIn = payload.category_id !== undefined
            && isPrivate(((categories.find((c) => c.id === categoryId) || {}).name) || '')
          if (movedIn) {
            const dropped = await cardCloud.dropForPrivate(noteId)
            if (dropped !== 'dropped' && dropped !== 'none') {
              // 服务端真回了一句原因的照着实心念（与详情页那一格同一个口径），
              // 没原因的那种（离线／超时）走字典里那句不猜原因的实话——不许把内部状态码拼上屏。
              dropNote = typeof dropped === 'string'
                ? t('cardPrivateDropFail', lang) + dropped
                : t('cardPrivateDropOffline', lang)
              // 只换那句话，**不拦后面的返回**：笔记这一步是真存成了，
              // 停在编辑页再点一次保存反而修不好——那时分类已经没变，这一趟根本不会再打 PUT，
              // 清卡片那段就成了永远走不到的分支。
            }
          }
        }
      } else {
        note = await api.createNote(Object.assign({}, now, { source_type: 'manual' }))
      }

      wx.hideLoading()
      // 卡片没清掉的时候不许念"已更新"了事——那等于屏上一句半假话（那句从字典里出，不在这儿拼词）。
      wx.showToast(dropNote
        ? { title: dropNote, icon: 'none', duration: 2600 }
        : { title: isEdit ? t('updateSucceeded', lang) : t('saveSucceeded', lang), icon: 'success' })
      setTimeout(() => {
        // 闸放到这一格才放（M16）：上面那枚吐司的 800 毫秒正是原来无人看管的窗口。
        // 先放再跳是留给"跳转本身失败"那一态（页面栈满／redirectTo 被拒）——那时人还站在
        // 这一屏，闸若还立着就再也点不动了，而那篇是真存过的。
        this._saving = false
        if (isEdit) {
          // Navigate back to detail page instead of creating duplicate
          wx.navigateBack()
        } else {
          wx.redirectTo({ url: `/pages/detail/detail?id=${note.id}` })
        }
      }, 800)
    } catch (err) {
      this._saving = false
      wx.hideLoading()
      console.error('保存失败', err)
      const msg = (err.data && err.data.detail) || t('saveFailed', lang)
      wx.showToast({ title: msg, icon: 'none' })
    }
  },
})
