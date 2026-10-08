// 卡片留档上云那一条链（2.0.1 P0 · S2）：**一张成品图从"本机有"变成"服务器知道有"**。
//
// 为什么单独一个模块而不是塞进 `cardLog.js`：本机那本账管的是"这台手机还看得见哪张"，
// 这一份管的是"云上那份与库里那一行"。两件事的失败方式完全不同——本机写不进只是这一格画不出缩略图，
// 云上没登记就是换台手机那张卡片凭空消失（站长 10-08 定性成必须解决的严重问题）。
//
// **全程不抛**。这是 B 链那条纪律的照搬：出图那一步（分享／存相册）已经成功了，留档是附属品，
// 附属品失败不许把主流程带回错误提示。所以这里的返回值只用来给调用方记日志，不用来改界面。
// 也正因为它是静默的，任何"新开的层"都要先量过再开——见下面 CARD_KIND 那条。
const cloudUpload = require('./cloudUpload.js')
const cardQueue = require('./cardQueue.js')
const cardLog = require('./cardLog.js')
const api = require('./api.js')

// 卡片对象放哪一层前缀。⚠ 换前缀**必须先拿探针量过写得进**：桶权限完全可能是按前缀给的，
// 而这条链按设计不报错——写不进的症状是"每张卡片都静默没上云"，界面上零异常。
// 量法：`APREFIX=cards zsh docs/工具/跑尺子.sh 9431 探-云存储可写`。
// 10-08 现读结果：`cards/` 这一层**写得进也删得掉**（uploadFile 回 fileID
// `cloud://cloudbase-d6gzh0i0tff02943a.636c-…/cards/zzprobe/20261008/probe-ygt4w5.txt`，
// deleteFile 那一条 `status: 0`），所以这一栏定成 `cards`。
// 分层的用处：将来按前缀批量清理时，"这张是笔记配图还是卡片成品"在 fileID 上就看得出来；
// 真混进 `images/` 里，那批对象和配图就再也分不开了，而对象只有客户端删得动。
const CARD_KIND = 'cards'

const _bytes = (p) => {
  try {
    const s = wx.getFileSystemManager().statSync(p)
    const n = s && (s.size != null ? s.size : s.stats && s.stats.size)
    return Number.isFinite(Number(n)) ? Number(n) : null
  } catch (e) {
    return null
  }
}

// 尺寸取不到就留 null：那一栏只用来给占位与"这张多大"，取不到不该挡住登记。
// 但**bytes 一定要尽力取**——它就是"一张卡片到底多少字节"那个还没量到的实测数（≤200KB 是估算
// 入账口径，见 models/note_card.py 与 PRD §8.149），每条登记的这一栏自己会把那个数攒出来。
const _dims = (p) => new Promise((resolve) => {
  wx.getImageInfo({ src: p, success: (r) => resolve({ width: r.width, height: r.height }), fail: () => resolve({}) })
})

/**
 * 把本机那一张传上云并登记给这篇。
 * @param {number} noteId
 * @param {{p:string,tpl:string,noQr:boolean,origin?:string}} entry 本机台账那一条（cardLog.copyIn 给的形状）
 * @returns {Promise<{skipped?:boolean,ok?:boolean,queued?:boolean,fileID?:string,reason?:string}>}
 */
async function archive(noteId, entry) {
  try {
    if (!noteId || !entry || !entry.p || !entry.tpl) return { skipped: true }
    // 云能力不可用（环境没填、基础库太老）就没有 fileID 可登记，队列也帮不上——队列存的是 fileID。
    // 这一张于是留在"本机有、云上没"那一档，由 S3 的补传档处理，不在这里硬试。
    if (!cloudUpload.cloudReady()) return { skipped: true, reason: 'cloud' }
    const userId = getApp().globalData.userId
    // 判 falsy 不判 undefined：`clearSession` 把这一栏置成**空串**而不是删掉，
    // 只判 undefined 就会拼出 `cards//20261008/xxx.jpg` 那种带一个空段的路径——
    // 那一层的用处本来就是"这是谁的"，空了就没人在认得出来。
    if (!userId) return { skipped: true, reason: 'user' }
    const up = await cloudUpload.uploadImage(entry.p, userId, CARD_KIND)
    if (!up || !up.fileID) return { skipped: true, reason: 'upload' }
    const d = await _dims(entry.p)
    const item = {
      file_id: up.fileID,
      tpl: entry.tpl,
      no_qr: !!entry.noQr,
      size: _bytes(entry.p),
      width: d.width || null,
      height: d.height || null,
      // 来源写 live：这一趟只处理"用户刚留下的那一张"。补传／重渲那几档由 S3 显式带 origin 进来，
      // 不许靠默认值混成"用户刚生成的"——那会在界面上说出假话。
      origin: entry.origin || 'live',
    }
    try {
      await api.putNoteCard(noteId, item)
      return { ok: true, fileID: up.fileID }
    } catch (e) {
      cardQueue.push(noteId, item)
      return { ok: false, queued: true, fileID: up.fileID }
    }
  } catch (e) {
    console.warn('卡片留档这一趟没走完（不影响分享）', e && (e.errMsg || e.message))
    return { skipped: true, reason: 'throw' }
  }
}

/** 补登记：由 app.js 的 onShow 调（与待补绑、待删对象同一个位置）。 */
function flush() {
  return cardQueue.flush(api)
}

// ---------- 读的那一半：这篇到底有没有卡片、画哪一张 ----------
//
// 这是"更新之后卡片不见了"那一态的根治点。今天三处判据（首页那一格、详情页右上那一格、
// 笔记卡片页那道「一篇只留一张」的闸）吃的都是"这台手机上那个 jpg 还在不在"——
// 系统清缓存、删小程序重装、换手机，图先没、账常留着，那一格就退回"从没生成过"，不报错也不留痕。
// 从 S2 起权威换成服务器那行 `note_cards`，本机文件降级成**缓存**：在就画它（快、不花钱），
// 不在就画云上那一份（`cloud://` 直接给 `<image src>`，与笔记配图那一路同一个用法）。
let serverCards = {}
let serverLoaded = false

function setServer(list) {
  serverCards = {}
  ;(list || []).forEach((c) => {
    if (c && c.note_id != null) serverCards[String(c.note_id)] = c
  })
  serverLoaded = true
}

/** 换身份／注销之后必须清：留着就是上一个人的卡片画到这个人头上。 */
function clearServer() {
  serverCards = {}
  serverLoaded = false
}

function serverCard(noteId) {
  return serverCards[String(noteId)] || null
}

/** 这批数有没有真从服务端读回来过。没读回来时"没有卡片"这句话不成立，界面对此要保守。 */
function isLoaded() {
  return serverLoaded
}

/**
 * 这一格画什么。**本机那张优先**：它是刚生成的那一张，可能还没来得及登记（登记是异步的，
 * 也可能正躺在待补队列里）。云上那份只在"本机这个文件已经不在了"时顶上——那正是这次要修的那一态。
 * @returns {Array<{p:string,tpl:string,noQr:boolean,at:number,fromServer:boolean,origin?:string}>}
 */
function cellFor(noteId) {
  const local = cardLog.aliveFor(noteId)
  if (local.length) return local
  const s = serverCard(noteId)
  if (!s || !s.cloud_url) return []
  return [{
    p: s.cloud_url,
    tpl: s.tpl,
    noQr: !!s.no_qr,
    at: 0,
    fromServer: true,
    origin: s.origin,
  }]
}

/** 「一篇只留一张」那道闸与"有没有卡片"全部问这一个谓词——两处各判各的就会一屏两句反话。 */
function hasCard(noteId) {
  return cellFor(noteId).length > 0
}

/** 拉一次全量（列表页那一批 + 待确认名单）。失败不抛：读不到就维持上一次那份数。 */
async function refresh() {
  try {
    const r = await api.getMyCards()
    setServer((r && r.cards) || [])
    return r || { cards: [], need_confirm: [] }
  } catch (e) {
    console.warn('卡片留档名单没读到（不影响界面）', e && (e.errMsg || e.statusCode))
    return null
  }
}

/** 读一篇（详情页与那道闸要用 had_share 那一栏）。 */
async function refreshOne(noteId) {
  try {
    const r = await api.getNoteCard(noteId)
    const card = r && r.card
    if (card) {
      serverCards = Object.assign({}, serverCards, { [String(noteId)]: card })
      serverLoaded = true
    }
    return r || { card: null, had_share: false }
  } catch (e) {
    console.warn('这一篇的卡片登记没读到', e && (e.errMsg || e.statusCode))
    return null
  }
}

/**
 * 撤掉这一格（界面上那枚「删除」）。**先撤服务器那一行，撤成了才动本地那份数**：
 * 反过来做会留孤儿——本机清了、云上那个对象再没人记得要去删（对象只有客户端删得动），
 * 而它一直占着全站那 5GB。回体那份 `file_ids` 直接交给 `dropFromDeleteRes`，
 * 删不成的那几条自己落待删队列（与删笔记、注销同一条路）。
 * @returns {Promise<boolean>} 服务器上确实撤掉了没有
 */
async function dropServer(noteId) {
  try {
    const res = await api.deleteNoteCard(noteId)
    serverCards = Object.assign({}, serverCards)
    delete serverCards[String(noteId)]
    await cloudUpload.dropFromDeleteRes(res)
    return true
  } catch (e) {
    console.warn('服务器那一行没撤掉，这一格先照原样留着', e && (e.errMsg || e.statusCode))
    return false
  }
}

/**
 * 换身份／注销之后由 `app.clearSession` 调这一个（不收在 app.js 里挨个调两下，是为了
 * 让"这一叠必须一起清"只有一份说法）：
 * · 待补登记队列——里面是"往库里写一行"的活儿，人没了就没有可写的库行了；
 * · 从服务器读回来那份卡片名单——留着就是下一个身份第一次进首页看见上一个人的卡片。
 * ⚠ 与 `assetPurge`（待删对象）相反，那一叠注销不许清：见 assetQueue.js 顶上那段同一条对比。
 */
function signOut() {
  cardQueue.clear()
  clearServer()
}

/**
 * 这篇没了：本机那本账（连那张位图）与从服务器读回来那一份都要跟着忘。
 * 收成一个出处是因为漏一半的症状很坏：SQLite 在非 AUTOINCREMENT 主键上**会复用刚空出来的号**
 * （注销那一条踩过，见 PRD），下一篇文章拿到同一个 note_id 时，留着的那一份会把上一个人的
 * 卡片画到新文章头上。
 */
function forget(noteId) {
  cardLog.dropNote(noteId)
  serverCards = Object.assign({}, serverCards)
  delete serverCards[String(noteId)]
}

module.exports = {
  CARD_KIND, archive, flush,
  setServer, clearServer, serverCard, isLoaded, cellFor, hasCard, refresh, refreshOne, dropServer, signOut, forget,
}
