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
  const done = []
  let sent = 0
  for (const entry of list) {
    try {
      await api.bindNoteAssets(entry.noteId, entry.items)
      sent += entry.items.length
      done.push(entry)
    } catch (e) {
      // 留着下次再试。404（笔记已经删了）会一直留在这条队列里直到被 50 条上限挤掉——
      // 那种残留只占 storage 里几十字节，不值得为它加一层"逐条判错误码"的复杂度。
      console.warn('补绑没成，留在队列里下次再试', e && (e.errMsg || e.message))
    }
  }
  _put(list.filter((x) => !done.includes(x)))
  return { sent, left: list.length - done.length }
}

module.exports = { KEY, MAX_QUEUE, take, push, flush }
