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
//
// 「服务端明确不要了」那一档不能只丢账（11-16 Z49）：笔记删了／地址不是你的／来源不认得这类 4xx
// 重试一万次也不会成，可那张成品图已经在云上了。原来摘条就完事，留下一批谁都不认得的孤儿；
// 现在摘条的同时把地址也从 `flush` 的第二个回调交出去删（与 `write.js` 直发那一条同一个口径）。
// 上面那档"超上限丢最旧的"仍只丢账，那是本机存储撑不住的取舍，本轮没改。
const KEY = 'pendingNoteCards'
const MAX_QUEUE = 50
// 本机存储读写统一走这一枚（M15），见 utils/safeStorage.js 顶上那段。
const storage = require('./safeStorage.js')

// take() 读不到时回一份空队列，但**这一趟不许整表写回**：队列里已经欠着的那几条一被空表盖掉，
// 就是"云上有对象、库里没那一行"，而界面上谁都看不见它（与 utils/assetQueue.js 同一笔账）。
let readFailed = false

/** @returns {Array<{noteId:number, item:object}>} 原样读出，不解释内容 */
function take() {
  const r = storage.tryRead(KEY)
  readFailed = !r.ok
  return Array.isArray(r.value) ? r.value : []
}

function _put(list) {
  if (readFailed) { console.warn('卡片待补队列这次没读到，先不写回（免得把欠着的几条盖掉）'); return }
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
  // ⚠ 落库前先归成一枚**数**（审计 #17）。这一篇的 id 从两条路来：出图那一头给的是数，
  // 台账（`cardLog`）那本对象交回来的键是**字符串**——JS 的对象键只有字符串这一种。
  // 原来这里用 `===` 比，两种类型永远不相等 ⇒ 同一篇在队列里留下两条，而 flush 按顺序挨个 PUT，
  // 服务端那条"一篇只有一张当前"的唯一索引让**最后一条赢**＝上一张顶掉刚出的那张。
  // 归成数与本文件顶上那句 `{noteId:number}` 是同一份口径；比对仍统一走 String 那一层，
  // 因为调用方塞进来的类型不归这条路管。
  const id = Number(noteId)
  if (!Number.isFinite(id) || id <= 0) return
  const list = take().filter((x) => !(x && String(x.noteId) === String(id)))
  list.push({ noteId: id, item })
  if (list.length > MAX_QUEUE) {
    console.warn(`卡片待补队列超过 ${MAX_QUEUE} 条，丢掉最旧的 ${list.length - MAX_QUEUE} 条`)
    list.splice(0, list.length - MAX_QUEUE)
  }
  _put(list)
}

/**
 * 这一篇刚刚**直发登记成功**了（`cardCloud.archive` 那条正常路）：把队列里同篇那条旧账摘掉。
 * 不摘的后果（10-11 审计）：离线时 A 那张 PUT 失败落进队列，回来之后用户重出一张 B 直发成功，
 * 下次进前台 flush 会把**旧的 A** 再补一次——服务端那条"一篇只有一张当前"的唯一索引于是把 B 顶成
 * 历史，界面上"我刚生成的那张"在别的设备上变成上一张。队列"新的顶掉旧的"只管得住 `push` 之间，
 * 管不住"直发也赢了"这一头。
 */
function settle(noteId) {
  if (!noteId) return
  const list = take()
  const left = list.filter((x) => !(x && String(x.noteId) === String(noteId)))
  if (left.length !== list.length) _put(left)
}

/**
 * 把队列里能登记的都登记掉。**一条一条摘**：一次网络抖动不该丢掉整批。
 * @param api 传 utils/api 进来（这个模块自己不 require api，免得和 app 启动顺序绕在一起）
 * @param onOrphan 可选：这一趟**该删的** `cloud://` 地址，两种都从这里走（`cardCloud` 递给 cloudUpload.deleteFiles）：
 *                 ① 回体里被顶成历史的那几张（10-11 审计）；② 被服务端永久拒掉那几条手上的那一张（11-16 Z49）。
 * @returns {Promise<{sent:number, left:number}>}
 */
async function flush(api, onOrphan) {
  const list = take()
  if (!list.length) return { sent: 0, left: 0 }
  const done = []
  const bound = []
  const rejected = []
  let sent = 0
  for (const entry of list) {
    try {
      const res = await api.putNoteCard(entry.noteId, entry.item)
      // 这一趟顶成历史的那几张：对象只有客户端删得动。直发那一条（`cardCloud.archive`）早就处理了
      // 这个回体，队列这一条原来没接——被顶掉的那张就永久占着全站配额（10-11 审计）。
      const replaced = (res && res.replaced_file_ids) || []
      if (replaced.length && typeof onOrphan === 'function') onOrphan(replaced)
      sent += 1
      done.push(entry)
      bound.push(entry)
    } catch (e) {
      // 服务端明确拒绝（4xx：笔记已删、地址不属于你、来源不认得）就摘掉——重试一万次也不会成，
      // 留着只会让每次进前台都白打一个请求。api.js 对非 2xx 回的是整个 res，所以这里读 statusCode。
      const code = e && e.statusCode
      // 429 不算「永久拒绝」：这一口自己就挂了限流（`cards.py:156` `POST /api/notes/{id}/card` 60/分钟），
      // 一次进前台几队齐发或连点生成就会撞上。撞上就摘条 = 这笔卡片账被永远丢掉，
      // 留下的正是文件头说的那笔「云上有对象、库里没账」。它只是「现在别打」，下次进前台再试。
      if (code >= 400 && code < 500 && code !== 429) {
        console.warn('卡片补登记被服务端拒绝，这条不再重试', code)
        done.push(entry)
        rejected.push(entry)
        continue
      }
      console.warn('卡片补登记没成，留在队列里下次再试', e && (e.errMsg || e.message))
    }
  }
  _prune(done)
  // 摘条不等于这笔账结了：那张成品图已经在云上，不删就是占全站配额又没人认得的孤儿（Z49）。
  // 现表这次没读到就当"还有人要"——宁可留孤儿下次再删，也不许删掉还活着的那一份（与 assetQueue 同一条）。
  const still = take()
  const ids = readFailed ? [] : _orphanIds(rejected, still, bound)
  if (ids.length && typeof onOrphan === 'function') {
    console.warn('卡片补登记被永久拒绝，这张云上对象交给删除', ids.length)
    onOrphan(ids)
  }
  return { sent, left: take().length }
}

/** 一条待补登记手上的那一个云上地址。 */
function _idsOf(entry) {
  const id = entry && entry.item && entry.item.file_id
  return id ? [id] : []
}

/**
 * 被永久拒掉那几条的地址，扣掉两种"还有人要"的：① 摘完之后现表里还留着的
 * （`_prune` 那条纪律：几条 await 之间被重新 push 过的那条留着要补登记，它的地址还在账上）；
 * ② 这一趟真登记成的（一篇只有一张当前，同一个地址并成两条过时那边已进库）。
 * 与 `assetQueue._orphanIds` 同形，只是这一族一条只有一个地址。
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
 * 收尾按**差量**写回：重读一次现表，只摘掉"这一趟真处理完、且内容没在这期间被动过"的那几条。
 *
 * 原来这里是 `_put(list.filter(...))`——拿循环开头那份快照整表覆盖。而每条 await 之间
 * `push()` 完全可能落进来一条新的（回前台四头并发打接口，窗口是几秒），那一条就会被这份旧快照
 * 盖掉。丢掉的后果不是"少补一次"，是**云上真有那个对象、库里没有那一行、而本机 `up` 已立**
 * ——登记没人做、清理也没人做，界面上永远看不见它（10-09 审计第二条，`assetQueue` 同型）。
 * 所以比对内容：同一个 noteId 但 item 变了，说明中间被重新 push 过，那条要留着。
 */
function _prune(done) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  _put(take().filter((x) => {
    if (!x) return true
    const was = done.find((d) => d && String(d.noteId) === String(x.noteId))
    return !was || !same(was, x)
  }))
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

module.exports = { KEY, MAX_QUEUE, take, push, flush, settle, clear }
