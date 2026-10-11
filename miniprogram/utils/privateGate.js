// 私密判据只有一个：分类名等于"私密"。后端 get_note、列表页 skin()、这里三处同一口径。
const api = require('./api.js')
const pwdSheet = require('./pwdSheet.js')
const { t } = require('./i18n.js')

const PRIVATE_NAME = '私密'

function isPrivate(name) {
  return name === PRIVATE_NAME
}

// 想把笔记归到私密、这个账号还没设密码：吐司告诉他去哪儿设，这次选择不放行。
// 每次都现读服务端、不缓存——刚设完密码立刻就能用，不会拿着旧答案把人挡在门外。
// 读不到状态也不放行：宁可让他重试一次，也不要悄悄把一篇笔记锁进没有密码的私密分类。
async function allowPrivate(categoryName, lang) {
  if (!isPrivate(categoryName)) return true
  let s = null
  try {
    s = await api.getPrivatePasswordStatus()
  } catch (err) {
    wx.showToast({ title: t('operationFailed', lang), icon: 'none' })
    return false
  }
  if (s && s.is_set) return true
  wx.showToast({ title: t('privatePasswordRequired', lang), icon: 'none' })
  return false
}

// 服务端这一句是**给日志看的**，不是给人看的（backend/app/api/routes/user.py 那个 verify 口，
// 密码列被清空时回 400「尚未设置私密密码」）。原来两页都把它原样当吐司发出去：
// 那一列空着的时候输什么都不会对，人就卡在"既进不去、又不知道该去哪儿"（站长 10-12 报的死路）。
// 所以这一种失败单独认，认出来就给一个能走的口；其余失败照旧回那句"密码不正确"。
function _noPasswordSet(err) {
  const d = (err && err.data && err.data.detail) || ''
  return d.indexOf('尚未设置私密密码') > -1
}

// 那一串六位数的输入面：与「我的」设／改／重置那一层同一张模板、同一张皮、同一条收键逻辑。
// 站长 10-12 原话「看笔记提示输入密码的框，跟设置密码的框风格不一致。要统一」——统一的就是这一层。
// （原来这里用 wx.showModal({editable:true})：系统那枚框没有掩码参数，六位密码是明文摆在屏上的。）
function _promptPassword(page, lang) {
  return pwdSheet.ask(page, {
    lang,
    // 交过去的那一串对不对，只有服务端知道。true = 收层放行；
    // false = 层留着、六格清空（照「我的」那一层的错法：吐司一句、当场重输，不是整层消失）。
    tryIt: async (pwd) => {
      try {
        await api.verifyPrivatePassword(pwd)
        return true
      } catch (err) {
        if (_noPasswordSet(err)) {
          // 先把六格收掉再弹那一层"去「我的」设"——留着的话 ask 那一把 pending 永远没人结，
          // 这一屏下一次点私密笔记会一声不响（cancel 走的是同一条收尾）。
          pwdSheet.cancel(page)
          wx.showModal({
            title: t('privatePasswordTitle', lang),
            content: t('privatePasswordRequired', lang),
            confirmText: t('privatePasswordOk', lang),
            cancelText: t('cancel', lang),
            success: (r) => {
              if (r.confirm) wx.switchTab({ url: '/pages/me/me' })
            },
          })
          return false
        }
        wx.showToast({ title: (err.data && err.data.detail) || t('privatePasswordWrong', lang), icon: 'none' })
        return false
      }
    },
  })
}

/**
 * 解锁这一趟全站只有一份实现（首页详情窗与独立详情页都调它，不许各存一份）。
 * 判据**不是**"这一屏问过没有"，而是服务端认得的那把凭证 + 这一篇的号。
 * 站长 10-12 两条回电都出在把"问过没有"记在页面上：首页是常驻 tab，记一次就整个会话不再问；
 * 而重置／换密码会把凭证清掉（api.js 里那两位都跟着 clear），页面那个布尔没人清，
 * 于是点开一篇私密笔记既不弹密码框、又只看到标题——服务端这时按
 * app/core/private_access.py 判未解锁，把正文那五列一律裁成 null。
 * 两条边界照站长拍的口径：同一篇从编辑那一趟回来不重复问（那是回到同一篇，不是新开一篇），
 * 换一篇必问；凭证一过期就再问（宁可多问一次，不让他对着一篇只有标题的笔记发懵）。
 */
async function unlockOn(page, note) {
  // 这一趟是**真验了一次**、还是手里那把还管用。详情页拿它决定要不要重取那一趟全文：
  // 凭证还活着时第一次读回来的就已经是全文，再打一趟是白要的。
  page._unlockRenewed = false
  if (!note || !note.is_private) return true
  if (page._unlockedNoteId === note.id && api.hasPrivateUnlock()) return true
  // 先作废手上这把再问：留着的话"问了"只是形式，正文照旧拿旧凭证读出来。
  api.clearPrivateUnlock()
  page._unlockedNoteId = 0
  if (!(await _promptPassword(page, page.data.lang))) return false
  page._unlockedNoteId = note.id
  page._unlockRenewed = true
  return true
}

module.exports = { PRIVATE_NAME, isPrivate, allowPrivate, unlockOn }
