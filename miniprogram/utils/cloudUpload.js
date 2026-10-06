// 云开发存储直传：把压好的那张图换成一个 fileID，交给后端记账。
//
// 这一条链的设计前提（docs/图片云备份-开发方案.md §3.1.4）：**B 链的任何失败都不许让
// "笔记没存下来"发生**。所以这里没有一个 throw——全部 resolve(null)，调用方看到 null
// 就当这张没备份，主流程照走。
//
// ⚠ CLOUD_ENV 现在是空串，整条链是**关着的**。
// 空着的原因不是没写完，是环境 ID 只能从云开发控制台读，而我这侧的后台登录态是掉的
// （读到的是"请使用微信扫码"）。填上这一格之前：
//   · app.js 那一步 init 会直接跳过，不会拿空 env 去调用（那样每次上传都报一条看不懂的红）；
//   · cloudReady() 回 false，录入页那条 B 链一张都不传，行为和今天一模一样。
// 填法：小程序后台 → 云开发 → 环境管理 → 环境 ID（形如 xxx-1g2h3i4j），抄进下面这一格。

const CLOUD_ENV = ''

const _ext = (path) => {
  const m = /\.([a-zA-Z0-9]{2,4})$/.exec(String(path || ''))
  return m ? m[1].toLowerCase() : 'jpg'
}

const _day = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

const _rand = () => Math.random().toString(36).slice(2, 10)

/** 环境没填、基础库没有 wx.cloud，都算"这条链不可用"。 */
function cloudReady() {
  return !!CLOUD_ENV && !!wx.cloud
}

/** app.js 在 onLaunch 里调一次。没配环境就是空操作，不打扰任何人。 */
function initCloud() {
  if (!cloudReady()) return false
  wx.cloud.init({ env: CLOUD_ENV, traceUser: true })
  return true
}

/**
 * 上传一张图。
 * @param {string} tempPath 压完那张的 tempFilePath
 * @param {number|string} userId app.globalData.userId（不是 openid，openid 从不下发到客户端）
 * @returns {Promise<{fileID:string, bytes:number|null}|null>}
 *
 * 路径 `images/{userId}/{YYYYMMDD}/{随机}.{ext}`：userId 那一层是隔离，日期那一层是
 * 以后真要清理时能按天前缀扫（fileID 一旦散成一堆随机名就没人敢批量删）。
 * 随机段用两个数拼，撞上的概率对"一人一天几百张"这个量级足够小；
 * 真撞了就是覆盖同一张，后端那一行的幂等也接得住（同 fileID 重复 bind 只更新不新增）。
 */
async function uploadImage(tempPath, userId) {
  if (!cloudReady() || !tempPath || userId === undefined || userId === null) return null
  const cloudPath = `images/${userId}/${_day()}/${Date.now().toString(36)}${_rand()}.${_ext(tempPath)}`
  return await new Promise((resolve) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath: tempPath,
      success: (r) => resolve({ fileID: r.fileID, bytes: null }),
      fail: (e) => {
        // 只 console：这条链失败时界面不该有动静，但排查时要能看到到底是权限还是网络
        console.warn('云存储上传失败（不影响笔记保存）:', (e && e.errMsg) || e)
        resolve(null)
      },
    })
  })
}

/**
 * 删对象。只有客户端这一侧删得掉——那台自建后端没有云开发的凭据。
 * 所以后端 DELETE /api/notes/{id} 会把 file_ids 一起回出来，谁删的笔记谁负责清。
 * @returns {Promise<number>} 成功删除的个数（失败不抛）
 */
function deleteFiles(fileIDs) {
  const ids = (fileIDs || []).filter(Boolean)
  if (!cloudReady() || !ids.length) return Promise.resolve(0)
  return new Promise((resolve) => {
    wx.cloud.deleteFile({
      fileList: ids,
      success: (r) => resolve(((r && r.fileList) || []).filter((x) => x.status === 0).length),
      fail: (e) => {
        console.warn('云存储删除失败（对象会残留，占全站配额）:', (e && e.errMsg) || e)
        resolve(0)
      },
    })
  })
}

/**
 * 删笔记 / 注销账号的回体里那份清单直接交给它。
 *
 * 收在一处是因为 `file_ids` 这个键名是服务端定的（routes/notes.py 的 delete_note、
 * routes/user.py 的 deactivate_account），三个调用方（详情页删一篇、列表详情窗删一篇、
 * 我的页注销）各写一份 `(r && r.file_ids) || []` 的话，哪天真要改键名就会漏掉一处，
 * 而漏掉的那一处的症状是"对象留在云上占全站配额，界面上谁都不记得它"。
 */
function dropFromDeleteRes(res) {
  const ids = (res && res.file_ids) || []
  if (!ids.length) return Promise.resolve(0)
  return deleteFiles(ids)
}

module.exports = { CLOUD_ENV, cloudReady, initCloud, uploadImage, deleteFiles, dropFromDeleteRes }
