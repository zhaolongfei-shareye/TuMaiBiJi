// 私密判据只有一个：分类名等于"私密"。后端 get_note、列表页 skin()、这里三处同一口径。
const api = require('./api.js')
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

module.exports = { PRIVATE_NAME, isPrivate, allowPrivate }
