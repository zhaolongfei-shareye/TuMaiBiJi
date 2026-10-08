// 待删队列：笔记删了（或账号注销了）、服务端行没了，但**云上那个对象没删掉**的那批。
//
// 为什么要它：删对象只有客户端这一侧做得成——那台自建后端没有云开发凭据（见 cloudUpload.js
// 顶上那段注释）。而 `wx.cloud.deleteFile` 失败是不抛的（弱网、云能力没初始化、基础库不支持），
// 于是原来有一条静默漏法：**库里账没了、云上对象还在**，占的是全站那 5GB 配额，界面上谁都不记得它。
// 而关于页与提交给微信后台的《用户隐私保护指引》两句都写着"删除该条笔记或注销账号时云端那一份一并删除"
// ——这句话现在是承诺，不是尽力。所以删不成要落本机账，下次回到前台再删一次。
//
// 与 assetQueue（待补绑）是同族两回事：那一份记的是"传上去了没绑上"，这一份记的是"库里没了云上还在"。
// 上限 50 条、超了丢最旧的（丢了就是真漏，但比无界撑爆 storage 好），去重按 fileID。
// 已经删掉的对象再删一次会回非 0 状态，所以那几条会一直留在队列里——代价只是每次进前台多带几个 id，
// 比"漏掉一个真没删成的对象"便宜。

const KEY = 'pendingCloudPurge'
const MAX_QUEUE = 50

/** @returns {string[]} 待删的 fileID */
function take() {
  const raw = wx.getStorageSync(KEY)
  return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string' && x) : []
}

function _put(list) {
  try {
    wx.setStorageSync(KEY, list)
  } catch (e) {
    // storage 写不进去（配额满／被系统清）只能放弃这一批，不许因为它把调用方卡住
    console.warn('待删队列写入失败', e)
  }
}

/** 追加一批没删成的；同一号重复追加只留一条。 */
function push(ids) {
  const fresh = (ids || []).filter((x) => x && typeof x === 'string')
  if (!fresh.length) return
  const list = take()
  const seen = new Set(list)
  fresh.forEach((id) => { if (!seen.has(id)) list.push(id) })
  if (list.length > MAX_QUEUE) {
    console.warn(`待删队列超过 ${MAX_QUEUE} 条，丢掉最旧的 ${list.length - MAX_QUEUE} 条（这几个对象留在云上）`)
    list.splice(0, list.length - MAX_QUEUE)
  }
  _put(list)
}

/** 只摘真删掉的那些；一次网络抖动不该丢掉整批。 */
function drop(ids) {
  const gone = new Set(ids || [])
  if (!gone.size) return
  _put(take().filter((id) => !gone.has(id)))
}

/** **注销不许清这一叠**（与 assetQueue 相反）：注销那一步自己就是往这里塞东西的一方，
 * 清了等于把"云端那份一并删除"那句承诺刚欠下的账抹掉。留着也没有害处——deleteFile 只会把
 * 对象删掉，不会改谁的归属，下一个身份替上一个人重试删除正是我们要的。 */

module.exports = { KEY, MAX_QUEUE, take, push, drop }
