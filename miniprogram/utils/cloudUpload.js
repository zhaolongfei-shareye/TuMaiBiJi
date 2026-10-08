// 云开发存储直传：把压好的那张图换成一个 fileID，交给后端记账。
//
// 这一条链的设计前提（docs/图片云备份-开发方案.md §3.1.4）：**B 链的任何失败都不许让
// "笔记没存下来"发生**。所以这里没有一个 throw——全部 resolve(null)，调用方看到 null
// 就当这张没备份，主流程照走。
//
// ✅ CLOUD_ENV 10-07 填上了，整条链从此是开的（前提是后端那三个接口也上了现网——
// 现读：`/api/notes/{id}/assets`、`/api/user/storage-quota` 在 https://api.agentsbin.cn/wtsj 目前回 **404**，
// 也就是图能传上云、但"归到哪篇笔记"这一步服务端还没接，详情页读不回来。上传这一半不依赖后端，可以先验）。
// 这一串不是去控制台抄的：它就是提炼那条链在用的环境（docs/产品需求.md §6.1 那张表、§8.12 的实测读数），
// 10-07 从这台机器 POST `cloudbase-d6gzh0i0tff02943a.api.tcloudbasegateway.com/v1/functions/extract`
// 回 401、0.375s——环境活着、网关活着。存储桶有没有开仍然只在控制台能看到，代码侧证不了。
// 填上之后：
//   · app.js 那一步会真 `wx.cloud.init`；
//   · cloudReady() 回 true，录入页那条 B 链开始真传（失败仍然只 resolve(null)，不阻断建笔记）。

const CLOUD_ENV = 'cloudbase-d6gzh0i0tff02943a'
const purge = require('./assetPurge.js')

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
 *
 * **删不成不许静默留在云上**：这一趟没做成的那几条落进 `utils/assetPurge` 那本机账，
 * 下次回到前台由 `flushPurge()` 再删一次。关于页与提交给微信后台的《隐私保护指引》两句都写着
 * "删除该条笔记或注销账号时云端那一份一并删除"——落账这一步是把那句从"尽力"变成"做得到"。
 * 云能力没初始化（`cloudReady()` 假）也算这一趟没做成：原来那里直接 `resolve(0)`，
 * 那才是最大的一个漏法——一次请求都没发出去，而调用方以为处理过了。
 * @returns {Promise<number>} 成功删除的个数（不抛）
 */
function deleteFiles(fileIDs) {
  const ids = (fileIDs || []).filter(Boolean)
  if (!ids.length) return Promise.resolve(0)
  if (!cloudReady()) {
    purge.push(ids)
    console.warn('云能力这会儿不可用，这批对象进了待删队列')
    return Promise.resolve(0)
  }
  return _deleteOnce(ids).then((r) => {
    if (r.failed.length) purge.push(r.failed)
    return r.done
  })
}

// 一次真正的 deleteFile，不碰队列。回 {done, failed}——failed 是"这一趟没删成的那些"。
function _deleteOnce(ids) {
  return new Promise((resolve) => {
    wx.cloud.deleteFile({
      fileList: ids,
      success: (r) => {
        const list = (r && r.fileList) || []
        // 回体缺 fileList（老基础库给的形状不一样）就当整批没成：宁可下次多删一遍，
        // 也不能把"其实没删成"记成"删掉了"。
        if (!list.length) return resolve({ done: 0, failed: ids.slice() })
        const failed = list.filter((x) => !x || x.status !== 0).map((x) => x && x.fileID).filter(Boolean)
        resolve({ done: ids.length - failed.length, failed })
      },
      fail: (e) => {
        console.warn('云存储删除失败（进了待删队列，下次进前台再删）:', (e && e.errMsg) || e)
        resolve({ done: 0, failed: ids.slice() })
      },
    })
  })
}

/**
 * 把待删队列里那批再删一次。由 `app.js` 的 onShow 调（与待补绑队列同一个位置）。
 * @returns {Promise<number>} 这一趟删掉的个数
 */
function flushPurge() {
  const ids = purge.take()
  if (!ids.length) return Promise.resolve(0)
  if (!cloudReady()) return Promise.resolve(0)   // 云上不去就原样留着，下次进前台再试
  return _deleteOnce(ids).then((r) => {
    purge.drop(ids.filter((x) => r.failed.indexOf(x) < 0))
    return r.done
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

module.exports = { CLOUD_ENV, cloudReady, initCloud, uploadImage, deleteFiles, dropFromDeleteRes, flushPurge }
