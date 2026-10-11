/**
 * 六位密码那一层的"收键—推格—交出去"，三页共用的一份实现。
 * 站长 10-12 原话：「看笔记提示输入密码的框，跟设置密码的框风格不一致。要统一。」
 * 统一的是这一层：标记在 templates/pwd-sheet.wxml、皮在 styles/pwd-sheet.wxss、逻辑在这一个文件。
 *
 * 「我的」那一页**不**走这里——它那一层还管着两步确认与重置那一条链（me.js 的 pwdStep/advancePwd），
 * 那三样是它自己的事；但它挂的是同一张模板与同一张皮，所以风格与几何不可能再走样。
 * 首页与详情页只问一串，就走这里。
 *
 * 为什么不做成自定义组件：① 本项目页面层从没用过组件（全站唯一一处是 custom-tab-bar）；
 * ② 真跑尺子够不到组件内部（10-11 那条"底栏是自定义组件、automator 点不到，只能截图采像素"
 *    就是这一条）。模板渲染在页面自己的树里，`.pwd-cell` 点得到、也量得到。
 *
 * 用法（页面里）：
 *   const pwdSheet = require('../../utils/pwdSheet.js')
 *   onPwdBuf(e) { pwdSheet.input(this, e) },
 *   onPwdOk() { pwdSheet.submit(this) },
 *   onClosePwdPanel() { pwdSheet.cancel(this) },
 *   …await pwdSheet.ask(this, { lang, tryIt })
 */
const { t } = require('./i18n.js')

// 这一层只有"要输"那一态：六格、确定、取消。「我的」那两态里还有"已设过 + 重置"，
// 所以 pwdEntering 在这里恒为 true，模板那 `wx:else` 那一支画不到。
function show(page, lang) {
  page.setData({
    pwdOpen: true,
    pwdEntering: true,
    pwdBuf: '',
    pwdFocus: true,
    // 第一行放功能名（他 10-01 深夜的原话「里面是功能名称」），与「我的」那一层同一枚键；
    // 名字下面那句是"这串密码用在哪"（「密码使用场景说明要在页面里面写清楚」）；
    // 格子上方那句才是校验提醒。三句全吃现网字典，不新造词。
    pwdName: t('privatePassword', lang),
    pwdScene: t('privatePasswordScene', lang),
    pwdTip: t('privatePasswordHint', lang),
  })
}

// 只撤面、不动那一把 pending：给调用方在 tryIt 里用（例如服务端说"还没设密码"，
// 要先收掉六格再弹那一层"去「我的」设"）。
function hide(page) {
  // 连 focus 一起撤：这只 input 是透明的，键盘只认 focus 这一个开关（me.js 那条注释同口径）
  page.setData({ pwdOpen: false, pwdEntering: false, pwdFocus: false, pwdBuf: '' })
}

function finish(page, ok) {
  hide(page)
  const st = page._pin
  page._pin = null
  if (st && st.resolve) st.resolve(ok)
}

/**
 * 问一串密码，交不交得过由 tryIt 判。
 * tryIt 返回 true → 这一层收掉、ask  resolve(true)；
 * 返回 false → 这一层**留着**、六格清空（他 10-12 要的是"和设置密码那一框一样"，
 *   而「我的」那一层错了就是吐司一句 + 清空重来，不是整层消失）；
 * 点取消或遮罩 → resolve(false)。
 */
function ask(page, opts) {
  const lang = opts.lang
  return new Promise((resolve) => {
    // 已经浮着一层就先把旧的判掉：这里不叠两层，不然两个 pending 抢同一次输入。
    if (page._pin) finish(page, false)
    page._pin = { resolve, tryIt: opts.tryIt, busy: false }
    show(page, lang)
  })
}

function input(page, e) {
  const v = String((e && e.detail && e.detail.value) || '').replace(/\D/g, '').slice(0, 6)
  page.setData({ pwdBuf: v })
  // 满六位自动交出去：这是「我的」那一层 10-02 就定下的手感（onPwdBuf → advancePwd），不另起一套。
  if (v.length === 6) submit(page)
}

function submit(page) {
  const st = page._pin
  if (!st) return
  const lang = page.data.lang
  if (!/^\d{6}$/.test(page.data.pwdBuf)) {
    // 确定那一枚是给"没输满"那一态用的：满六位本来会自动交，按钮这时只负责把规则讲出来。
    wx.showToast({ title: t('privatePasswordHint', lang), icon: 'none' })
    return
  }
  if (st.busy) return
  st.busy = true
  Promise.resolve(st.tryIt(page.data.pwdBuf)).then((ok) => {
    st.busy = false
    if (!page._pin) return // tryIt 自己收过场了（例如那层"先去设密码"的模态）
    if (ok) { finish(page, true); return }
    page.setData({ pwdBuf: '' })
  }, () => {
    // tryIt 抛了：面板不能卡在"忙"那一态，否则六格再也按不动。清空当没输过。
    st.busy = false
    page.setData({ pwdBuf: '' })
  })
}

function cancel(page) {
  if (!page._pin) { hide(page); return }
  finish(page, false)
}

module.exports = { ask, input, submit, cancel }
