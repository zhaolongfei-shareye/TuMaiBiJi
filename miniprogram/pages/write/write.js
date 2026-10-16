const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const pwdSheet = require('../../utils/pwdSheet.js')
const { allowPrivate, isPrivate, unlockOn, exitOrHome } = require('../../utils/privateGate.js')
const cardCloud = require('../../utils/cardCloud.js')

/* 这一页要发出去的那五栏，读回来时先存一份基线（站长 10-12 拍 C3 甲）。两个用途：
   ① 保存只发**真动过**的那几栏——原来这一页是整份 PUT，拿一份服务端裁过的空壳去存，
      等于把他真正的概要和要点清空（§七 严重③，那一趟只堵住了"猜是不是 null"那一半）；
   ② 基线没建起来（读详情那一趟挂了、或凭证在这一页中途过期）就一个字都不发。
   ⚠ 归一化必须两头同一把尺：库里是数组、屏上是文本框，两边都折成"去掉项目符号的那些行"，
      否则"他一个字没改"也会被算成改过，这一刀就白补了。 */
const normLines = (v) => (Array.isArray(v) ? v : (v == null ? [] : [v]))
  .map((x) => String(x || '').replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean).join('\n')
const normTags = (v) => (Array.isArray(v) ? v : (v == null ? '' : String(v)))
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
        // 第一项是"未分类"这个概念，跟着界面语言走；后面那些是用户自己起的名字，不翻
        categoryNames: [t('noCategory', this.data.lang)].concat(categories.map((c) => c.name)),
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
        selectedCategoryIndex: categoryIndex,
        originalCategoryId: note.category_id, // Preserve original even if categories fail to load
      })
      // 基线就是"这一页刚铺开的那五栏"，与上面 setData 同一趟建，别事后从 data 里回读
      // （回读会把他刚敲进去的字也算成改动）。
      this._baseline = {
        title: note.title || '',
        summary: note.summary || '',
        key_points: normLines(note.key_points),
        tags: normTags(note.tags),
        category_id: note.category_id == null ? null : note.category_id,
      }
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
        if (isEdit) {
          // Navigate back to detail page instead of creating duplicate
          wx.navigateBack()
        } else {
          wx.redirectTo({ url: `/pages/detail/detail?id=${note.id}` })
        }
      }, 800)
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      const msg = (err.data && err.data.detail) || t('saveFailed', lang)
      wx.showToast({ title: msg, icon: 'none' })
    }
  },
})
