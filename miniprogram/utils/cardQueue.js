// 待补登记队列：卡片成品图**已经传到云上了**，但"这张归哪篇笔记"那一步没做成的那批。
//
// 与 `utils/assetQueue.js` 是同族两回事，别混：那一份是笔记配图（一篇多条 items，补的是绑图），
// 这一份是卡片成品（**一篇一条**，补的是登记）。两条链共用同一个纪律：上传失败不阻断分享／存相册，
// 失败的那一份落本机，下次进前台再补一次。
//
// 一篇只留一条，且**新的顶掉旧的**——这一条和 assetQueue 的"并进去"正好相反，理由是服务端那条
// "一篇只有一张当前"是数据库唯一索引钉着的（`note_cards.ux_note_cards_one_current_per_note`）。
// 队列里要是留着同一篇的两条旧 fileID 挨个补上去，最后赢的那条取决于队列顺序，而那是这台手机上
// 一个随时可能被系统清掉的数组——界面就成了不确定的。
//
// 上限 50 条，超了丢最旧的：丢掉的那几条是真漏了（对象留在云上占配额，而对象只有客户端删得动），
// 但比队列无界长下去把 storage 撑爆要好，而且这条路径只在弱网下才会走到。丢了要能看见，所以留日志。
const KEY = 'pendingNoteCards'
const MAX_QUEUE = 50

/** @returns {Array<{noteId:number, item:object}>} 原样读出，不解释内容 */
function take() {
  const raw = wx.getStorageSync(KEY)
  return Array.isArray(raw) ? raw : []
}

function _put(list) {
  try {
    wx.setStorageSync(KEY, list)
  } catch (e) {
    // storage 写不进去（配额满/被系统清）就只能放弃这一批，不能因为它把调用方卡住
    console.warn('卡片待补队列写入失败', e)
  }
}

/** 追加一条待补登记：同一篇再补一次就是覆盖那一条（见顶上那段"新的顶掉旧的"）。 */
function push(noteId, item) {
  if (!noteId || !item || !item.file_id) return
  const list = take().filter((x) => !(x && x.noteId === noteId))
  list.push({ noteId, item })
  if (list.length > MAX_QUEUE) {
    console.warn(`卡片待补队列超过 ${MAX_QUEUE} 条，丢掉最旧的 ${list.length - MAX_QUEUE} 条`)
    list.splice(0, list.length - MAX_QUEUE)
  }
  _put(list)
}

/**
 * 把队列里能登记的都登记掉。**一条一条摘**：一次网络抖动不该丢掉整批。
 * @param api 传 utils/api 进来（这个模块自己不 require api，免得和 app 启动顺序绕在一起）
 * @returns {Promise<{sent:number, left:number}>}
 */
async function flush(api) {
  const list = take()
  if (!list.length) return { sent: 0, left: 0 }
  const drop = []
  let sent = 0
  for (const entry of list) {
    try {
      await api.putNoteCard(entry.noteId, entry.item)
      sent += 1
      drop.push(entry)
    } catch (e) {
      // 服务端明确拒绝（4xx：笔记已删、地址不属于你、来源不认得）就摘掉——重试一万次也不会成，
      // 留着只会让每次进前台都白打一个请求。api.js 对非 2xx 回的是整个 res，所以这里读 statusCode。
      const code = e && e.statusCode
      if (code >= 400 && code < 500) {
        console.warn('卡片补登记被服务端拒绝，这条不再重试', code)
        drop.push(entry)
        continue
      }
      console.warn('卡片补登记没成，留在队列里下次再试', e && (e.errMsg || e.message))
    }
  }
  _put(list.filter((x) => !drop.includes(x)))
  return { sent, left: list.length - drop.length }
}

/**
 * 换身份／注销之后整叠清掉（`app.clearSession` 那一步调）。
 * 留着会怎样：下一个身份第一次进前台就把这批 fileID 往那些 note id 上登记——服务端按当前 token
 * 认人，要么 404 要么 400，于是这一条永远留在队列里，每次进前台重打一遍请求。
 *
 * ⚠ 与 `assetPurge`（待删对象）相反，那一叠**注销不许清**：注销那一步自己就是往里塞东西的一方。
 * 这一叠不一样——里面是"往库里写一行"的活儿，人没了就没有可写的库行了。
 */
function clear() {
  try {
    wx.removeStorageSync(KEY)
  } catch (e) {
    console.warn('卡片待补队列清不掉', e)
  }
}

module.exports = { KEY, MAX_QUEUE, take, push, flush, clear }
