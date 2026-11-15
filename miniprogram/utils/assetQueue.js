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
//
// 「服务端明确不要了」那一档不一样，不能只丢账：11-16 Z49。笔记删了／地址不是你的／超张数
// 这类 4xx 重试一万次也不会成，可那几张图**已经在云上**了。原来摘掉条目就完事，于是留下一批
// 谁都不认得的孤儿（只有客户端删得动，注销也清不掉），永久占全站那 5GB。现在摘条的同时把地址
// 交给 `onOrphan`（`app.js` 递的是 `cloudUpload.deleteFiles`，与录入页直发那一条同一个口径）。
// 上限 50 那一档仍只丢账不删：那是本机存储撑不住的取舍，见上面那句，本轮没改。

const KEY = 'pendingNoteAssets'
const MAX_QUEUE = 50

// 与 `cardQueue` 同一个道理：**抛了**才算"这一趟没读到"，此时不许整表写回、也不许据此删对象
// ——现表里欠着的那几条被空表盖掉＝孤儿，被空表当成"没人要"删掉＝破图。
// ⚠ 「读到 `''`」不是没读到：微信对"本机没有这一栏"的原样返回就是空串，那是**空队列**。
// 把它也算成没读到，新装手机的第一笔 push 会被下面那道闸当场吞掉（11-16 现撞，老尺子 ④ 报的红）。
let readFailed = false

/** @returns {Array<{noteId:number, items:Array}>} 原样读出，不解释内容 */
function take() {
  // 读也会抛（与同仓 posterTemplates／person 同一口径）：这一抛不许打断 flush 或调用方（N8）。
  let threw = false
  let raw
  try { raw = wx.getStorageSync(KEY) } catch (e) { threw = true }
  readFailed = threw
  return Array.isArray(raw) ? raw : []
}

function _put(list) {
  // 与 `cardQueue._put` 同一道闸（11-16 Z49 补）：没读到现表就当"还不知道欠着谁"，这一趟不写。
  // 少了这道闸，`push()` 会把 `take()` 那份**空表**当成现表——一条新账写回去，把欠着的几条整表盖掉，
  // 留下的正是文件头说的那笔"云上有对象、库里没那一行"；`_prune()` 同理会把整叠清成空。
  if (readFailed) { console.warn('待补绑队列这次没读到，先不写回（免得把欠着的几条盖掉）'); return }
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
 * @param onOrphan 可选：这一趟被服务端**永久**拒掉的那几条手上的 `cloud://` 地址（Z49）。
 *                 调用方（`app.js`）递给 `cloudUpload.deleteFiles`；删不成由那边自己落进待删队列。
 * @returns {Promise<{sent:number, left:number}>}
 */
async function flush(api, onOrphan) {
  const list = take()
  if (!list.length) return { sent: 0, left: 0 }
  const bound = []
  const rejected = []
  let sent = 0
  for (const entry of list) {
    try {
      await api.bindNoteAssets(entry.noteId, entry.items)
      sent += entry.items.length
      bound.push(entry)
    } catch (e) {
      // 服务端明确拒绝（4xx：笔记已删、地址不属于你、超张数）就摘掉——重试一万次也不会成，
      // 留着只会让每次进前台都白打一个请求。api.js 对非 2xx 回的是整个 res，所以这里读 statusCode。
      const code = e && e.statusCode
      // 429 不算「永久拒绝」。⚠ 这一口（`POST /api/notes/{id}/assets`）现读**没挂**限流 decorator
      // （`assets.py` 里 `limiter` 现读 0 处），但同仓另两口挂了、且挂限流只是加一行 decorator 的事：
      // `cards.py:156` 60/分钟、`profiles.py:183` 30/分钟。这里不豁免＝哪天挂上，
      // 一次进前台几队齐发撞上 429 的那笔配图账就被永远丢掉，留下的正是文件头那笔「云上有对象、库里没账」。
      // 它只是「现在别打」，下次进前台再试。
      if (code >= 400 && code < 500 && code !== 429) {
        console.warn('补绑被服务端拒绝，这条不再重试', code)
        rejected.push(entry)
        continue
      }
      // 剩下的（弱网、超时、5xx）留着下次再试：一次抖动不该丢掉整批。
      console.warn('补绑没成，留在队列里下次再试', e && (e.errMsg || e.message))
    }
  }
  _prune(bound.concat(rejected))
  // 摘条不等于这笔账结了：图已经在云上，不删就是占全站配额又没人认得的孤儿。
  // 现表这次没读到就当"还有人要"（宁可留一个孤儿下次再删，也不许删掉还活着的那一份——
  // 与 `cloudUpload.unreservePurge` 顶上那段两种失败不对称的说法同一条）。
  const still = take()
  const ids = readFailed ? [] : _orphanIds(rejected, still, bound)
  if (ids.length && typeof onOrphan === 'function') {
    console.warn('补绑被永久拒绝，这批云上对象交给删除', ids.length)
    onOrphan(ids)
  }
  return { sent, left: take().length }
}

/** 一条待补绑手上的那几个云上地址。 */
function _idsOf(entry) {
  return ((entry && entry.items) || []).map((it) => it && it.file_id).filter(Boolean)
}

/**
 * 被永久拒掉那几条的地址，扣掉两种"还有人要"的：
 * ① 摘完之后现表里还留着的——`_prune` 那条纪律说了，几条 await 之间被重新 `push` 过的那条要留着补绑，
 *    它的地址此刻还在账上；② 这一趟真绑成的——同一个地址并成两条过时那边已经进库。
 * 少扣一种，症状就是详情页那一排破图。与 `cardQueue._orphanIds` 同形（那一份一条 item，这一份一批）。
 */
function _orphanIds(rejected, stillQueued, bound) {
  const wanted = new Set()
  for (const x of stillQueued.concat(bound)) for (const id of _idsOf(x)) wanted.add(id)
  const out = []
  for (const x of rejected) {
    for (const id of _idsOf(x)) if (!wanted.has(id) && out.indexOf(id) < 0) out.push(id)
  }
  return out
}

/**
 * 收尾按**差量**写回，与 `cardQueue._prune` 同一个道理（那边有注释）：原来拿循环开头那份快照
 * 整表覆盖，几条 await 之间新 push 进来的那一批（同一篇并进来几条 items 也算）会被静默盖掉，
 * 留下的就是文件头说的那笔"云上占着配额、库里没有账、永远对不上"的对不上账。
 */
function _prune(done) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  _put(take().filter((x) => {
    if (!x) return true
    const was = done.find((d) => d && d.noteId === x.noteId)
    return !was || !same(was, x)
  }))
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
