// 待补绑队列：图已经传到云上、但"归到哪篇笔记"这一步没做成的那批。
//
// 为什么会留下这么一批：B 链（压缩+直传）和 A 链（提炼建笔记）是同时起跑的两条路，
// 谁先跑完不固定。A 先完而 B 还在传，就没有 note_id 可绑；反过来 bind 请求本身也可能失败
// （弱网、后端在重启）。这些 fileID 一旦丢了就变成**云上有、库里没有**的对象——它占全站
// 那 5GB 配额，但配额接口是从库里 SUM 出来的，于是这笔账永远对不上，也没人能清理它。
//
// 所以：先落本机存储，下次进前台再补一次绑。上限 50 条，超了丢最旧的——丢掉的这几条
// 是真的漏了（对象留在云上），但比"队列无界长下去把 storage 撑爆"要好，而且这条路径
// 只在弱网下才会走到。丢了要能看见，所以留一个计数在日志里。

const KEY = 'pendingNoteAssets'
const MAX_QUEUE = 50

/** @returns {Array<{noteId:number, items:Array}>} 原样读出，不解释内容 */
function take() {
  const raw = wx.getStorageSync(KEY)
  return Array.isArray(raw) ? raw : []
}

function _put(list) {
  try {
    wx.setStorageSync(KEY, list)
  } catch (e) {
    // storage 写不进去（配额满/被系统清）就只能放弃这一批，不能因为它把调用方卡住
    console.warn('待补绑队列写入失败', e)
  }
}

/**
 * 追加一批待补绑。同一篇笔记的多次追加会并进同一条（bind 接口本身是幂等的，
 * 但并起来少打几次请求）。
 */
function push(noteId, items) {
  const list = take()
  const mine = list.find((x) => x && x.noteId === noteId)
  const fresh = (items || []).filter((it) => it && it.file_id)
  if (!fresh.length) return
  if (mine) {
    const seen = new Set(mine.items.map((it) => it.file_id))
    mine.items = mine.items.concat(fresh.filter((it) => !seen.has(it.file_id)))
  } else {
    list.push({ noteId, items: fresh })
  }
  if (list.length > MAX_QUEUE) {
    console.warn(`待补绑队列超过 ${MAX_QUEUE} 条，丢掉最旧的 ${list.length - MAX_QUEUE} 条`)
    list.splice(0, list.length - MAX_QUEUE)
  }
  _put(list)
}

/**
 * 把队列里能绑的都绑掉。绑成功的那条才从队列摘掉——一次网络抖动不该丢掉整批。
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
      await api.bindNoteAssets(entry.noteId, entry.items)
      sent += entry.items.length
      drop.push(entry)
    } catch (e) {
      // 服务端明确拒绝（4xx：笔记已删、地址不属于你、超张数）就摘掉——重试一万次也不会成，
      // 留着只会让每次进前台都白打一个请求。api.js 对非 2xx 回的是整个 res，所以这里读 statusCode。
      const code = e && e.statusCode
      if (code >= 400 && code < 500) {
        console.warn('补绑被服务端拒绝，这条不再重试', code)
        drop.push(entry)
        continue
      }
      // 剩下的（弱网、超时、5xx）留着下次再试：一次抖动不该丢掉整批。
      console.warn('补绑没成，留在队列里下次再试', e && (e.errMsg || e.message))
    }
  }
  _put(list.filter((x) => !drop.includes(x)))
  return { sent, left: list.length - drop.length }
}

/**
 * 注销之后必须整叠清掉（app.clearSession 那一步调）。
 * 留着会怎样：下一个身份（同一个人重新注册，或干脆是另一个人共用这台手机）第一次进前台
 * 就把这批 fileID 往那些 note id 上绑——bind 接口按当前 token 认人，要么 404 要么 400，
 * 于是这一条永远留在队列里，每次进前台重打一遍请求。
 */
function clear() {
  try {
    wx.removeStorageSync(KEY)
  } catch (e) {
    console.warn('待补绑队列清不掉', e)
  }
}

module.exports = { KEY, MAX_QUEUE, take, push, flush, clear }
