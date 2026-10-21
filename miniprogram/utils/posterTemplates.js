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

// 那份"清单"：每行 `template_id:content_hash`，逐行用 \n 连起来。服务端
// `services/poster_templates.py:live_manifest` 回的是同一串，两边只做**字符串相等**这一件事。
// ⚠ 不许在这里再算一遍哈希：小程序里没有 sha256，自己补一份实现就是"第二份真相"，
//   而两边算出的串不一致的症状是"每次都去拉整批"——静默、不报错，谁也发现不了。
function manifestOf(rows) {
  if (!Array.isArray(rows)) return ''
  return rows.map((r) => `${(r && r.template_id) || ''}:${(r && r.content_hash) || ''}`).join('\n')
}

function cachedManifest() {
  const raw = readCache()
  // 老缓存里没有 manifest 这一格（这一条之前灌进去的那批）：回空串，让调用方去拉一次整批补上。
  return raw && typeof raw.manifest === 'string' ? raw.manifest : ''
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
      // `manifest` 存的是**服务端那一批原样**算出来的清单（含这一台的包不收的那几行），
      // 不是 `keep`：下一次比对要跟服务端逐行对得上，用收过的算就会永远"有变化"。
      wx.setStorageSync(STORE_KEY, { rows: keep, sig: poster.remoteSignature(), manifest: manifestOf(rows) })
    } catch (e) {
      // 存不下不影响这一次出图，只影响下一次冷启动的起点——不报错、不重试。
      report.storageError = true
    }
    return report
  }).catch((e) => ({ accepted: 0, rejected: [], error: true, reason: (e && e.message) || String(e) }))
}

// 先花不到 1 KB 问一句"清单变了吗"，没变就不拉那 50 KB 的整批（站长 10-21 提的那条"判断要便宜"）。
// 三个出口都要有数：本机一批都没有（第一次）／清单读不出来（老缓存、服务端没部署这一条）／清单变了
// ——前两种一律去拉整批，**宁可多拉一次也不许把新模板挡在门外**；只有"一字不差"那一种才跳过。
function pullIfChanged(fetchManifest, fetchAll) {
  const known = cachedManifest()
  if (!known) return refresh(fetchAll)
  if (typeof fetchManifest !== 'function') return refresh(fetchAll)
  return Promise.resolve().then(fetchManifest).then((body) => {
    const got = body && body.manifest
    if (typeof got !== 'string' || !got.length) return refresh(fetchAll)
    if (got === known) return { accepted: 0, rejected: [], skipped: true }
    return refresh(fetchAll)
  }).catch((e) => ({ accepted: 0, rejected: [], error: true, reason: (e && e.message) || String(e) }))
}

module.exports = { STORE_KEY, restore, refresh, pullIfChanged, manifestOf, cachedManifest }
