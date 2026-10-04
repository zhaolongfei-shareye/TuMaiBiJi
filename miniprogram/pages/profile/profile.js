const poster = require('../../utils/poster.js')
const { t, texts } = require('../../utils/i18n.js')

// 画布自己的显示宽度，必须和 profile.wxss 里 .cell-canvas 的 width 是同一个数。
// 之前这里填的是 320——那是格子的外宽，含内边距。拿它折算高度等于把每张预览纵向
// 拉长 750/675≈11%，圆形头像在小样里被画成椭圆，而成品海报是对的：预览骗人。
const THUMB_W = 288
// 小样圆角。app.wxss 里 --r-chip 是 28rpx，但真机上原生画布不吃 CSS 圆角，
// 所以这个值还要再画进位图一次（见 poster.clipRounded）。
// 28 在这一档是安全的：换算到位图是 73 单位，验-海报模板几何.js 最后一段把十个模板
// 乘六种笔记都量过，最不利的一格离弧还留着余量（分享页那一排更窄，同一档会咬到字，
// 所以那边收到 20）。改这个数要跟着改 profile.wxss 的 .cell-canvas，尺子会核。
const THUMB_R = 28
// 十格同屏，每格都按 750 全尺寸开位图要吃三十多兆显存，低端安卓会直接崩画布。
// 小样只是挑样式，0.46 倍落笔在 320rpx 的格子里看不出差别。
const THUMB_SCALE = 0.46
// 量高度用的临时画布：排版只依赖字体度量，跟画布多大无关，所以给一张小的就够。
// （以前是 750×2600，那已经超出部分机型的单画布上限。）
const MEASURE_H = 750

// 格子的骨架：先有 id 和占位高度，画布节点得先存在，小样才画得上去。
function groupSkeleton(lang) {
  return poster.TEMPLATE_GROUPS.map((g) => ({
    id: g.id,
    label: poster.groupName(g.id, lang),
    items: poster.TEMPLATES.filter((x) => x.group === g.id).map((x) => ({
      id: x.id,
      label: poster.templateLabel(x.id, lang),
      h: Math.round((THUMB_W * 4) / 3),
    })),
  }))
}

Page({
  data: {
    lang: 'zh',
    t: texts('zh'),
    themeClass: '',
    // 四个形象槽（null=空位，画那枚虚线 ➕）。这一块即时生效，不等下面的「保存」。
    slots: poster.blankSlots(),
    allFull: false,
    name: '',
    slogan: '',
    template: 'card',
    groups: groupSkeleton('zh'),
    saving: false,
  },

  onLoad() {
    const app = getApp()
    // 上一回挑完没落盘的、或者中途被系统杀掉留下的那些张，本机里已经没人认得它们了；
    // 先按这一页手上的名单收一遍，再按"这台手机存过哪些头像文件"的名单扫一遍。
    poster.dropUncommitted()
    poster.pruneAvatars()
    const lang = app.globalData.userInfo?.language || 'zh'
    const saved = poster.readProfile()
    const slots = poster.readSlots()
    // 小样要等骨架落到视图层之后再画，否则按选择器取不到画布节点
    this.setData(
      {
        lang,
        t: texts(lang),
        themeClass: app.applyTheme(app.getWallpaper()),
        name: saved.name || '',
        slogan: saved.slogan || '',
        template: saved.template || poster.DEFAULT_TEMPLATE,
        slots,
        allFull: !slots.some((s) => !s),
        groups: groupSkeleton(lang),
      },
      () => this.renderThumbs()
    )
    app.setNavTitle('navProfile', lang)
  },

  // 这里故意没有 onShow：从相册回来时真机会补发一次 onShow，那时候读一遍 storage
  // 会把用户刚填还没保存的名称、slogan 冲掉（新建页选完图没反应就是这个成因）。
  // 形象那一块不受这条影响——它是即时生效的，重读 storage 读到的就是刚写进去的。

  // 十格小样要的那份：名称/一句话/模板用这一页还没保存的输入，头像取「卡片」那张
  // （posterProfile 里现算，见 utils/poster.js 那条注释——直接 readProfile 会让小样没头像）
  draftProfile() {
    return Object.assign(poster.posterProfile(), {
      name: this.data.name,
      slogan: this.data.slogan,
      template: this.data.template,
    })
  },

  async renderThumbs() {
    // 两遍重画会打架：连点两次换图，前一遍解码头像慢、后落盘，界面就停在旧内容上
    // （实测过一次：头像已经去掉了，画布上却又把旧头像画回来）。每轮领一个号，
    // 落盘前对号，号不对的那轮直接放弃。
    const gen = (this._renderGen || 0) + 1
    this._renderGen = gen
    const { lang } = this.data
    const profile = this.draftProfile()
    // 英文界面下小样得用英文笔记：断行、字距、行高在两种语言下不是一套数
    const sample = lang === 'en' ? poster.SAMPLE_NOTE_EN : poster.SAMPLE_NOTE
    const groups = this.data.groups.map((g) => ({ id: g.id, label: g.label, items: g.items.slice() }))
    for (let gi = 0; gi < groups.length; gi++) {
      for (let ii = 0; ii < groups[gi].items.length; ii++) {
        if (this._renderGen !== gen) return
        const tpl = groups[gi].items[ii]
        try {
          const canvas = await this.getCanvas(`#tpl-${tpl.id}`)
          const ctx = canvas.getContext('2d')
          const images = {}
          if (profile.avatarPath) {
            images.avatar = await poster.loadImage(canvas, profile.avatarPath, 4000)
          }
          canvas.width = poster.W
          canvas.height = MEASURE_H
          const plan = poster.planPoster(ctx, sample, tpl.id, profile, lang)
          const h = Math.round((plan.height * THUMB_W) / poster.W)
          // 高度必须在落笔之前逐格提交给视图层：这一格显示的真是 {{item.h}}rpx，
          // 骨架里那是个 4:3 的占位数。等整轮画完再一次性 setData，画的过程中这十格
          // 都被压在占位框里竖着挤一挤——圆角跟着挤成椭圆（clipRounded 是画进位图的，
          // 位图不弯、显示弯）。一格里一次 setData 只改一个字段，代价比看到的问题小。
          this.setData({ [`groups[${gi}].items[${ii}].h`]: h })
          await new Promise((r) => wx.nextTick(r))
          // 改宽高会重置画布状态，所以 scale 必须在之后设
          canvas.width = Math.round(plan.width * THUMB_SCALE)
          canvas.height = Math.round(plan.height * THUMB_SCALE)
          ctx.scale(THUMB_SCALE, THUMB_SCALE)
          poster.clipRounded(ctx, plan.width, plan.height, THUMB_R, THUMB_W)
          // 解码头像可以慢到四秒，落笔前必须再对一次号。
          // 只在循环头对不够：那一遍等完回来，新的一遍可能已经画到同一张画布上，
          // 后落笔的覆盖先落笔的——旧内容反而成了最终画面。
          if (this._renderGen !== gen) return
          poster.paintLayers(ctx, plan.layers, images)
          groups[gi].items[ii] = Object.assign({}, tpl, { h })
        } catch (err) {
          console.error('模板小样没画出来', tpl.id, err)
          groups[gi].items[ii] = Object.assign({}, tpl, { h: Math.round(THUMB_W * 1.4) })
        }
      }
    }
    if (this._renderGen !== gen) return
    this.setData({ groups })
  },

  getCanvas(selector) {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this)
        .select(selector)
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvas = res && res[0] && res[0].node
          if (canvas) resolve(canvas)
          else reject(new Error(`画布未就绪：${selector}`))
        })
    })
  },

  // 落盘 + 同步界面。这一块即时生效（点芯片、删图都当场写），不像名称/一句话那样等
  // 「保存」——因为删除那一步有二次确认，确认完还要等保存才真删，那句确认就是假话。
  _commitSlots(next) {
    poster.writeSlots(next)
    this.setData({ slots: next, allFull: !next.some((s) => !s) })
    this.renderThumbs()
  },

  // 只有空槽响应整枚圆的点击。已经放了图的那一格，动作全在芯片和垃圾桶上，
  // 点照片本身什么都不做——误一下就把在用的图换掉，代价太大。
  onTapSlot(e) {
    const i = Number(e.currentTarget.dataset.i)
    if (!(i >= 0) || this.data.slots[i]) return
    const { lang } = this.data
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      // 挑原图，不用微信那档 compressed：它给竖图只到 750 宽（实测存下来 750×1448），
      // 而头部那一段是 `width:750rpx`＝整屏宽，真机 1116 物理像素，750 的源件被放大 1.49 倍
      // ——站长 10-04 报的"底图看上去被拉伸"就是这一条。落盘前由 poster.mintAvatar
      // 自己缩到 1440 宽（实测 300~500KB 一张），10MB 本机配额照样够四个槽用。
      sizeType: ['original'],
      success: async (res) => {
        const temp = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (!temp) return
        try {
          this._commitSlots(poster.placeSlot(this.data.slots, i, await poster.mintAvatar(temp)))
        } catch (err) {
          console.error('形象图存不下来', err)
          poster.dropUncommitted()
          wx.showToast({ title: t('avatarSaveFailed', lang), icon: 'none' })
        }
      },
      fail: (err) => {
        console.error('选图失败', err)
        if (((err && err.errMsg) || '').indexOf('cancel') >= 0) return
        wx.showToast({ title: t('pickFailed', lang), icon: 'none' })
      },
    })
  },

  // 两个角色各自单选：点亮这一张的「卡片」，别的张那枚自己灭掉（takeRole 在 poster.js）。
  // 再点一次已经亮着的那枚就是关掉它——关掉之后这个位置没人占，
  // 不会自动挪给别的张（站长 09-30 拍板：不挪）。
  onToggleRole(e) {
    const { i, role } = e.currentTarget.dataset
    const at = Number(i)
    const cur = this.data.slots[at]
    if (!cur) return
    const key = role === 'card' ? 'card' : 'bg'
    const next = cur[key]
      ? this.data.slots.map((s, j) => (j === at ? Object.assign({}, s, { [key]: false }) : s))
      : poster.takeRole(this.data.slots, at, key)
    this._commitSlots(next)
  },

  onDropSlot(e) {
    const at = Number(e.currentTarget.dataset.i)
    const cur = this.data.slots[at]
    if (!cur) return
    const { lang } = this.data
    // 删之前把后果说全：它要是正当着首页背景，删完首页会跳回包里那张默认图——
    // 这个跳变是当场看得见的，不提前讲一句，看起来像界面自己坏了。
    // 中文每句自带句号，接着写就行；英文要留空格，不然 "uploaded.Your poster" 粘成一坨。
    const parts = [t('slotDropBody', lang)]
    if (cur.card) parts.push(t('slotDropWasCard', lang))
    if (cur.bg) parts.push(t('slotDropWasBg', lang))
    wx.showModal({
      title: t('slotDropTitle', lang),
      content: parts.join(lang === 'zh' ? '' : ' '),
      confirmText: t('slotDropOk', lang),
      cancelText: t('cancel', lang),
      success: (res) => {
        if (!res.confirm) return
        const next = this.data.slots.slice()
        next[at] = null
        this._commitSlots(next)
      },
    })
  },

  // 改了名称/一句话，十格小样上印的还是旧的那一份——保存之后成品才变，预览就是骗人。
  // 但逐字重画太贵（十张画布，每张都要重排一遍、解一遍头像），所以输入停下 400ms 画一次。
  scheduleThumbs() {
    if (this._thumbTimer) clearTimeout(this._thumbTimer)
    this._thumbTimer = setTimeout(() => {
      this._thumbTimer = null
      this.renderThumbs()
    }, 400)
  },

  onUnload() {
    if (this._thumbTimer) clearTimeout(this._thumbTimer)
    // 四个槽那一块是即时落盘的，走到这里通常已经没东西可收；留着这一句是为了
    // 唯一那种漏网：复制成功、写 storage 之前抛了异常，那张谁都没用上的图。
    poster.dropUncommitted()
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
    this.scheduleThumbs()
  },

  onSloganInput(e) {
    this.setData({ slogan: e.detail.value })
    this.scheduleThumbs()
  },

  onPickTemplate(e) {
    this.setData({ template: e.currentTarget.dataset.id })
  },

  async onSave() {
    if (this.data.saving) return
    const { lang } = this.data
    this.setData({ saving: true })
    try {
      const patch = {
        name: (this.data.name || '').trim().slice(0, 16),
        slogan: (this.data.slogan || '').trim().slice(0, 24),
        template: this.data.template,
      }
      // 形象那一块不在这里：四个槽当场就写了，这一句只管名称/一句话/模板
      poster.writeProfile(patch)
      wx.showToast({ title: t('profileSaved', lang), icon: 'success' })
      setTimeout(() => wx.navigateBack(), 900)
    } catch (err) {
      console.error('保存分享形象失败', err)
      wx.showToast({ title: t('setFailed', lang), icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
})
