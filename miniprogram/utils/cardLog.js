/* 一篇笔记生成过哪几张卡片——**本机**这一本账。
 *
 * ⚠ 2.0.1 S2 起，"这篇有没有卡片"的权威已经挪到服务器那一行 `note_cards` 上了，
 * 这一本账降级成**这台手机还看得见哪一张**（缓存）。界面上那三处判据现在问的是
 * `cardCloud.cellFor()` / `cardCloud.hasCard()`（本机 ∪ 云上），不要再直接吃 `aliveFor`
 * 当"有没有卡片"——那正是"版本更新之后卡片不见了"那一态的根：账记在本机 storage、
 * 图存在应用私有目录，系统清缓存能只清图不清账，而旧判据看的是图在不在。
 *
 * 为什么本机这一本还要留着一个文件：一是列表那一格画起来不花钱、不等网络；二是 S3 的
 * 补传档要靠它认出"这张你还没上云"。它不是判据，是缓存 + 补传的线索。
 *
 * 历史（10-03 拍本机那一批的理由，留着是因为它解释了为什么有两个一次性归一）：
 * 服务端在 2.0.1 之前一张成品图都没存过，`shares` 那行只有快照文字加一个 `cover_asset_id`，
 * 要在列表里画"这篇有哪张卡片"只有两条路——服务端加表并在出图后上传，或者本机留档。
 * 代价站长自己也撞到了：换设备、清微信缓存、删掉小程序，那一格就空了。
 *
 * 存的是 JPEG 缩略那份，不是发出去的那张 PNG：台账这一格只用来认"这是哪一套模板"，
 * 要扫码的人走详情窗里那张成品（share.js:144 那条 PNG 的理由在这儿不成立）。
 *
 * ⚠ 记账时机＝**人真留下这张那一刻**（图片面板发出去／存进相册成功），不是画布落图那一刻。
 * 1.9.12 曾记在画布落图那一步，结果打开弹窗、每滑一次模板、每开关一次码都各算一张——
 * 站长 10-03 真机测出来两句："我明明没有生成 5 张，显示了我生成了 5 张同样内容的"、
 * "笔记生成卡片大图，但小图完全不匹对"（那一格画的是台账里最早的一张，不是他最后留下的那张）。
 */
const KEY = 'cardLog'
const DIR = `${wx.env.USER_DATA_PATH}/cards`

const fm = () => wx.getFileSystemManager()
const read = () => {
  const v = wx.getStorageSync(KEY)
  return v && typeof v === 'object' ? v : {}
}
const write = (map) => {
  try { wx.setStorageSync(KEY, map) } catch (e) { console.error('卡片台账写不进本机', e) }
}
const dropFile = (p) => { try { fm().unlinkSync(p) } catch (e) { /* 早被系统清了也算删掉了 */ } }
const ensureDir = () => { try { fm().mkdirSync(DIR, true) } catch (e) { /* 已存在会抛 */ } }

// 一台设备上的文件名必须带时间戳：本地图片是按路径缓存位图的，同名换内容时界面仍是第一张
// （10-01 那轮踩过）。同一篇同一套模板只留最新那一张，旧的那张连文件一起删。
// 那一格除了路径与模板还带 noQr：详情窗右上那一枚点开的是"这一张"，成品弹窗得照它把
// 二维码开关摆回当初的位置，否则同一套模板带码/不带码两种样子，小图跟大图又对不上。
// 落完本机账，顺手把这一张送上去（2.0.1 S2）。**不 await、不抛、失败只进队列**：
// 分享／存相册那一步已经成功了，留档是附属品，附属品不许把主流程带回错误提示（B 链同纪律）。
//
// 为什么写在这里而不是首页与卡片页那两个调用点各写一遍：那两处"人真留下这张"吃的本来就是
// 同一个 record，留档这条链也必须只有一个出处（与 aliveFor 那一个出处同一条理由）。
//
// require 写在函数里：cardCloud 顶层要 cardLog，两边都写顶层就绕成循环加载了。
function _archive(noteId, entry) {
  try {
    require('./cardCloud.js').archive(noteId, entry)
  } catch (e) {
    console.warn('卡片留档没起来（不影响这一张在本机的账）', e && (e.errMsg || e.message))
  }
}

function copyIn(noteId, tplId, noQr, srcPath, opt) {
  const 起留档 = !(opt && opt.archive === false)
  return new Promise((resolve) => {
    ensureDir()
    const at = Date.now()
    const filePath = `${DIR}/${noteId}-${tplId}-${at}.jpg`
    fm().copyFile({
      srcPath,
      // 目标那一个键叫 destPath，不叫 filePath：写错时微信不报"不认识这个参数"，
      // 只回一句 `destPath should be String instead of Undefined`，位图静默不落盘（10-03 真跑抓的）。
      destPath: filePath,
      success: () => {
        const map = read()
        // 一篇同时只留一张（站长 10-03 23:40 做减法）：旧的不管出自哪套模板，连文件一起撤，
        // 再放这张进去。所以"要改存量"只有一条路——先在大图里删掉这一张，再重新生成。
        const keep = (map[noteId] || []).filter((x) => { dropFile(x.p); return false })
        const entry = { p: filePath, tpl: tplId, at, noQr: !!noQr }
        // 待确认那一档由他自己重出来的那一张要带 origin 存进本机这本账：详情窗里那句
        // 「这张是按当年那份快照重出的」读的就是它。本机这本账是**缓存**，判据仍在服务器那一行，
        // 但那一格画的是本机这张（快、不花钱），不带着这一栏那句话说不出来。
        if (opt && opt.origin) entry.origin = opt.origin
        keep.push(entry)
        map[noteId] = keep
        write(map)
        // 补卡那一趟自己会带着 origin 去登记（`re-rendered`／`backfilled`），所以它调 copyIn 时
        // 要把这一句关掉：默认这一趟的 origin 是 live，两句都落地就成了"这张是他刚生成的"——假话。
        if (起留档) _archive(noteId, entry)
        resolve(keep)
      },
      // 存不下就不记这一张。绝不能让"分享"那一步因为这一格失败。
      fail: (e) => { console.error('卡片留档失败', e); resolve(null) },
    })
  })
}

function record(noteId, tplId, noQr, canvas, page, opt) {
  if (!noteId || !tplId || !canvas) return Promise.resolve(null)
  return new Promise((resolve) => {
    wx.canvasToTempFilePath({
      canvas, fileType: 'jpg', quality: 0.82,
      success: (r) => copyIn(noteId, tplId, noQr, r.tempFilePath, opt).then(resolve),
      fail: (e) => { console.error('卡片留档取图失败', e); resolve(null) },
    }, page)
  })
}

function forNote(noteId) { return read()[noteId] || [] }

/* 这一篇**还看得见**的卡片：台账里那一条的文件真的还在，且按留下来的先后倒序（最新那张排第一）。
 *
 * 为什么要在 forNote 之上再筛一层：账记在本机 storage 里，图存在应用私有目录，系统清缓存能
 * 只清掉图而清不掉账（首页那张形象图同一处理：读不到就不铺）。指过去就是一块白板，看着像卡片
 * 坏了，宁可退回"还没有生成过卡片"那一格。10-03 模拟器实测到这一态：src 递到了、232×330 有尺寸，
 * 但 accessSync 说文件不在。
 *
 * 这一层必须只有一个出处：详情页右上那一格（画不画缩略图）、首页详情窗、以及笔记卡片页
 * 那道"一篇只留一张"的闸（share.js）三处吃的都是它。筛掉的那条不算数——否则界面显示"还没生成过"、
 * 点下去却被闸挡回"这篇已经有一张"，同一篇在一屏里同时成立两种状态。 */
function aliveFor(noteId) {
  const fm = wx.getFileSystemManager()
  const alive = (p) => { try { fm.accessSync(p); return true } catch (e) { return false } }
  return forNote(noteId)
    .filter((x) => x && x.p && alive(x.p))
    .slice()
    .sort((x, y) => (y.at || 0) - (x.at || 0))
}

// 站长 10-03 23:40：「一个笔记同一时间只能生成一张笔记卡片，要改存量的必须删除旧的才能新增」。
// 台账本来就是一篇一套模板一条，所以这里把"一篇一条"落成硬规则：copyIn 一次只留最新那张，
// 另外给一次性的归一（下面 migrateOnePerNote）——他手机上那几篇留过两张以上的，进页就归成
// 最新那一张，其余连文件删掉。 ‹ 1/3 › 那一行随之撤净，不支持来回切换。
function migrateOnePerNote() {
  if (wx.getStorageSync(ONE_KEY) === 1) return false
  const map = read()
  Object.keys(map).forEach((id) => {
    const list = map[id] || []
    const keep = list.slice().sort((a, b) => (b.at || 0) - (a.at || 0))[0]
    list.forEach((x) => { if (!keep || x.p !== keep.p) dropFile(x.p) })
    map[id] = keep ? [keep] : []
  })
  write(map)
  try { wx.setStorageSync(ONE_KEY, 1) } catch (e) { /* 标记立不上，下次进页再归一次而已 */ }
  return true
}

// 1.9.12 那本账是按"画布落图"记的，里面每一格都分不清是他真留下的还是滑模板滑出来的，
// 所以换时机的那一次整个清掉——只清这一次，清完立个标记，以后进页不再动它。
const MODE_KEY = 'cardLogKeepOnly'
const ONE_KEY = 'cardLogOnePerNote'
function migrateKeepOnly() {
  if (wx.getStorageSync(MODE_KEY) === 1) return false
  const map = read()
  Object.keys(map).forEach((id) => (map[id] || []).forEach((x) => dropFile(x.p)))
  write({})
  try { wx.setStorageSync(MODE_KEY, 1) } catch (e) { /* 标记立不上，下次进页再清一次而已 */ }
  return true
}
migrateKeepOnly()
migrateOnePerNote()

// 笔记删了，它那一格的文件与索引一起清掉：留着既没人看，也是这台设备上清不掉的孤儿
function dropNote(noteId) {
  const map = read()
  if (!map[noteId]) return
  ;(map[noteId] || []).forEach((x) => dropFile(x.p))
  delete map[noteId]
  write(map)
}

/* 把台账里**不属于卡片**的那几条摘掉，返回摘掉的条数。
 *
 * 为什么会有这种东西：10-08 S0 在那台模拟器上现读到台账里混着一条 `http://usr/ruler-detail-cell.jpg`
 * ——某把真跑尺子往这本账写过一条自证截图，`tpl` 还填着 classic。留着它，详情页那一格会照着它
 * 去指一张调试图；更坏的是补卡那一趟把它当"这张你还没上云"给补传上去。
 * ⚠ 只摘账、**不动那个文件**：那条路径指向的东西不是我们的（可能是别的尺子的临时截图），
 * 我们没有任何资格去 unlink 一个自己没建的文件。判据由调用方递进来（`cardRepair.isCardPath`），
 * 那一个出处与 `DIR` 同一个常量。 */
function pruneNotCards(isCard) {
  const map = read()
  let n = 0
  Object.keys(map).forEach((id) => {
    const list = map[id] || []
    const kept = list.filter((x) => x && x.p && isCard(x.p))
    n += list.length - kept.length
    if (kept.length) map[id] = kept
    else delete map[id]
  })
  if (n) write(map)
  return n
}

module.exports = { record, copyIn, forNote, aliveFor, dropNote, pruneNotCards, all: read, migrateKeepOnly, migrateOnePerNote, KEY, DIR, MODE_KEY, ONE_KEY }
