// P0-5：卡片模板配方的"拉、存、交回"。这份**不判断方合不合格**——名单（op 的字段表、
// 原语的参数表）唯一出处在 poster.js，闸门也只在那儿（`applyRemoteTemplates`）。
// 这里要是自己也认一遍名单，就成了第二份真相，而两份迟早对不上。
//
// 三条硬规矩，都是从"生成笔记卡片"那枚按钮不许变灰推出来的：
//   ① 任何一步出错都只回一份报告，绝不抛：弱网、后台没返回、返回被拦、存储坏了，
//      一律当"这次没拿到"，包内那十套照样画；
//   ② 只把**合格的那几行**写进本机存储。脏的那行不进缓存，否则每次冷启动都要重踩一遍；
//   ③ 一次下发＝整份替换。服务端把某套收成 archived，本地那一份必须当场消失，
//      不能等"下一次覆盖同一个 id"——撤回要秒级生效（方案 §四 第 5 条）。
const poster = require('./poster.js')

const STORE_KEY = 'poster_templates_v1'

function readCache() {
  let raw
  try {
    raw = wx.getStorageSync(STORE_KEY)
  } catch (e) {
    return null
  }
  if (!raw || !Array.isArray(raw.rows)) return null
  return raw
}

// 冷启动第一件做的事：把上次那批端回来。同步、不查网，所以再慢的网也不挡首页。
function restore() {
  const raw = readCache()
  if (!raw) return { accepted: 0, rejected: [], cached: false }
  const report = poster.applyRemoteTemplates(raw.rows)
  report.cached = true
  return report
}

// fetcher 由调用方给（页面里就是 () => api.getPosterTemplates()）：
// 这份工具不认识 api.js，也就不在 util 里 getApp()。
function refresh(fetcher) {
  if (typeof fetcher !== 'function') return Promise.resolve({ accepted: 0, rejected: ['没给取数的那一步'], error: true })
  return Promise.resolve().then(fetcher).then((rows) => {
    const report = poster.applyRemoteTemplates(rows)
    const keep = Object.keys(poster.remoteTemplates()).map((id) => poster.remoteTemplates()[id])
    try {
      wx.setStorageSync(STORE_KEY, { rows: keep, sig: poster.remoteSignature() })
    } catch (e) {
      // 存不下不影响这一次出图，只影响下一次冷启动的起点——不报错、不重试。
      report.storageError = true
    }
    return report
  }).catch((e) => ({ accepted: 0, rejected: [], error: true, reason: (e && e.message) || String(e) }))
}

module.exports = { STORE_KEY, restore, refresh }
