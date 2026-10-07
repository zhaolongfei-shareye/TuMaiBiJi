/**
 * 「卡片上的信息」那一层（改名片的小弹窗）——首页成品弹窗与笔记卡片页共用这一份实现。
 *
 * 为什么要收成一份：两个入口改的是同一份数据（`utils/poster.js` 的四槽 + 名称/一句话），
 * 而里面有几条不是"随便挑个函数都行"的规则，走样的症状都是**同一张卡在两个入口改出来不一样**：
 * ① 往已填的格上换图必须走 `replaceSlot` 不是 `placeSlot`（后者会重算角色，实测结果是
 *    "没人当卡片"、海报头像当场消失）；② 勾掉卡片**不会**自动挪给还留着的别的张（09-30 在
 *    「我的→卡片模板」那一页拍板的口径）；③ 删一格要把它正当着首页背景这件事说全；
 * ④ 那两只 input 的 `adjust-position` 必须关着（真机两轮 BUG，见 docs/产品需求.md §8.106/§8.107）。
 *
 * 页面侧要做的两件事：
 *   data 里带上 `cardInfo: cardInfo.initial()`（四个键），Page 方法里 spread 上 `cardInfo.handlers`；
 *   可选两个钩子——`_ciAfterCommit()` 回一份要一起 setData 的键（首页要顺手刷头部那张背景），
 *   `_ciAfterChange()` 在收窗且真动过时被调一次（两页都是重画那张成品图）。
 *
 * 真相只存 storage（`poster.readSlots()`），`ciSlots` 这份是装饰过的（带 cap/card/bg），
 * 所以任何一处改完都要走 `_ciCommit` 重新生成，别在页面里手拼那三个字段。
 */
const poster = require('./poster.js')
const { t } = require('./i18n.js')

// 弹窗那四个 data 键的初值。页面自己写死一份就会漂，所以由这里给。
function initial() {
  return { cardInfoOpen: false, ciSlots: [], ciName: '', ciSlogan: '' }
}

const handlers = {
  // 四枚下面那一行只写它当前的角色；勾哪一格当卡片是这一层给的口，
  // 而"这一格当不当首页背景"那个开关仍只在「我的→卡片模板」那一页——同一件事不留两个口。
  _ciCaps(slots) {
    const { lang } = this.data
    return slots.map((s, i) => ({
      path: s ? s.path : '',
      card: !!(s && s.card),
      bg: !!(s && s.bg),
      cap: s && s.bg && !s.card
        ? t('slotBg', lang)
        : `${t('slotPos', lang)} ${i + 1}`,
    }))
  },

  onOpenCardInfo() {
    const saved = poster.readProfile()
    this._ciDirty = false
    this.setData({
      cardInfoOpen: true,
      ciSlots: this._ciCaps(poster.readSlots()),
      ciName: saved.name || '',
      ciSlogan: saved.slogan || '',
    })
  },

  onCloseCardInfo() {
    this.setData({ cardInfoOpen: false })
    if (!this._ciDirty) return
    this._ciDirty = false
    // 动过名片就得把成品图重画一次：弹窗里看到的还是旧头像旧名字就是预览骗人。
    if (typeof this._ciAfterChange === 'function') this._ciAfterChange()
  },

  _ciCommit(next) {
    poster.writeSlots(next)
    this._ciDirty = true
    const patch = { ciSlots: this._ciCaps(next) }
    if (typeof this._ciAfterCommit === 'function') Object.assign(patch, this._ciAfterCommit() || {})
    this.setData(patch)
  },

  // 点下面那一行 = 把这一格指定为卡片：单选，别的张那枚自动灭。
  // 再点已经打勾的那枚就是取消——取消之后没人当卡片，海报头像不画，
  // **不会自动挪给还留着的别的张**（同「我的→卡片模板」那一页 09-30 拍板的口径）。
  // 空格不给勾：那一格没图，勾上就是让海报去取一张不存在的文件。
  onCiSetCard(e) {
    const at = Number(e.currentTarget.dataset.i)
    const cur = this.data.ciSlots[at]
    if (!cur || !cur.path) return
    const slots = poster.readSlots()
    const next = cur.card
      ? slots.map((s, j) => (j === at && s ? Object.assign({}, s, { card: false }) : s))
      : poster.takeRole(slots, at, 'card')
    this._ciCommit(next)
  },

  // 空格：整枚圆可点，就是"往这一格放一张"（与那一页同一条）。
  onCiSlotTap(e) {
    const at = Number(e.currentTarget.dataset.i)
    if (!(at >= 0) || this.data.ciSlots[at].path) return
    this._ciPick(at, false)
  },

  // 已填那一格的下沿一枚「更换」。现网那一页点已填的格子是故意不响应的（怕误一下把在用的
  // 图换掉），这里给的是明确一枚，不是把整枚圆变成可点。
  onCiReplace(e) {
    const at = Number(e.currentTarget.dataset.i)
    if (!(at >= 0) || !this.data.ciSlots[at].path) return
    this._ciPick(at, true)
  },

  // 换一张走 poster.replaceSlot，不走 placeSlot：后者是给空格用的，往已填的格上放会把
  // 那一格的角色重算一遍，实测算出来是"没人当卡片"——海报头像当场消失。规则本身连注释
  // 都写在 utils/poster.js 那两个函数上，这里只是选对哪一个。
  _ciPick(at, keep) {
    const { lang } = this.data
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      // 挑原图，落盘前由 poster.mintAvatar 自己缩到 1440 宽（同 profile.js 那一条，
      // 微信的 compressed 那档竖图只给到 750 宽，铺满整屏会被放大 1.49 倍发糊）。
      sizeType: ['original'],
      success: async (res) => {
        const temp = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (!temp) return
        try {
          const path = await poster.mintAvatar(temp)
          const next = poster.readSlots()
          this._ciCommit(keep ? poster.replaceSlot(next, at, path) : poster.placeSlot(next, at, path))
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

  onCiDrop(e) {
    const at = Number(e.currentTarget.dataset.i)
    const cur = this.data.ciSlots[at]
    if (!(at >= 0) || !cur.path) return
    const { lang } = this.data
    // 删之前把后果说全（跟那一页同一句）：它要是正当着首页背景，删完首页会跳回默认那张。
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
        const next = poster.readSlots()
        next[at] = null
        this._ciCommit(next)
      },
    })
  },

  onCiName(e) { this.setData({ ciName: e.detail.value }) },
  onCiSlogan(e) { this.setData({ ciSlogan: e.detail.value }) },

  onCiSave() {
    const { lang } = this.data
    const before = poster.readProfile()
    const patch = {
      name: (this.data.ciName || '').trim().slice(0, 16),
      slogan: (this.data.ciSlogan || '').trim().slice(0, 24),
    }
    poster.writeProfile(patch)
    if (patch.name !== (before.name || '') || patch.slogan !== (before.slogan || '')) this._ciDirty = true
    wx.showToast({ title: t('profileSaved', lang), icon: 'success' })
    this.onCloseCardInfo()
  },
}

module.exports = { initial, handlers }
