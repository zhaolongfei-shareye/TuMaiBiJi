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
  // 收口走 api.friendlyDetail（N7）：框架那类英文兜底短语在这里一律当没有，
  // 认的就是服务端自己写的这一句中文。
  const d = api.friendlyDetail(err && err.data && err.data.detail)
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
        wx.showToast({
          // 这里**不再念服务端那句原文**（站长 10-12 拍 C5 甲）。原来那句是
          // `wx.showToast({ title: err.data.detail })`：连错十次撞上 slowapi 的 10/分钟，
          // 屏上就是一串英文 "Rate limit exceeded: 10 per 1 minute"，读着像乱码，
          // 而且它本来是写给日志看的话。现在只按状态码分流，话一律由字典出（中英各一句）。
          title: t(err && err.statusCode === 429 ? 'privateRateLimited' : 'privatePasswordWrong', lang),
          icon: 'none',
        })
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
/**
 * 这一篇现在到底要不要问一遍。判据不是"这一屏问过没有"，而是服务端认得的那把凭证＋这一篇的号。
 * unlockOn 用它，首页"要不要先把详情窗收掉"也用它——同一个判据写两处就会长出一份记法，
 * 而首页那个窗的 z-index 是 101、密码面板是 100，收早了闪一下、收晚了面板看不见。
 * ⚠ 「验过哪一篇」记在**模块里这一份**，不记在页面实例上（站长 10-18「看笔记已经输入一次密码，
 * 编辑时候不应该再输入一次，然后返回列表又要输一次，这个要去掉」）：编辑那一屏是新起的页面实例，
 * 原来它自己那份标记是空的 ⇒ 同一篇要问三回。服务端那把凭证本来就是发给"人"的短命 JWT
 * （`backend/app/core/private_access.py`：绑的是密码列指纹 `pk`，不是笔记号），所以全站一份对得上语义。
 * 仍然与 `api.hasPrivateUnlock()` 相与：改密／重置／过期都会把凭证清掉，那时这一格是死的，
 * 不会像 10-12 那样"页面那个布尔没人清"。换一篇照旧必问（那一条是站长 10-12 拍的，今天这句没翻它）。
 */
let unlockedNoteId = 0

function needsUnlock(note) {
  if (!note || !note.is_private) return false
  return !(unlockedNoteId === note.id && api.hasPrivateUnlock())
}

async function unlockOn(page, note) {
  // 这一趟是**真验了一次**、还是手里那把还管用。详情页拿它决定要不要重取那一趟全文：
  // 凭证还活着时第一次读回来的就已经是全文，再打一趟是白要的。
  page._unlockRenewed = false
  if (!needsUnlock(note)) return true
  // 先作废手上这把再问：留着的话"问了"只是形式，正文照旧拿旧凭证读出来。
  api.clearPrivateUnlock()
  unlockedNoteId = 0
  if (!(await _promptPassword(page, page.data.lang))) return false
  unlockedNoteId = note.id
  page._unlockRenewed = true
  return true
}

/**
 * 验不成该去哪儿：能退就退，退无可退回首页。
 * 深链／扫码直接落详情页时页面栈只有这一层，`wx.navigateBack()` 一声不响地失败，
 * 人就停在一屏空白上（站长 10-12 拍 C4）。详情页与编辑页两处走同一句，别再各写一份。
 */
function exitOrHome() {
  if (getCurrentPages().length > 1) wx.navigateBack()
  else wx.switchTab({ url: '/pages/index/index' })
}

module.exports = { PRIVATE_NAME, isPrivate, allowPrivate, needsUnlock, unlockOn, exitOrHome }
