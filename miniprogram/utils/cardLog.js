/* 一篇笔记生成过哪几张卡片——这份账记在本机。
 *
 * 为什么记本机而不是服务器：服务端到现在一张成品图都没存过。`shares` 那行只有快照文字
 * 加一个 `cover_asset_id`（落地页那张封面），成品图是客户端画完直接发出去／存相册的。
 * 要在笔记列表里画"这篇有哪几张卡片"，只有两条路：服务端加一张表并在出图后上传（要部署、
 * 要存储），或者本机留档。站长 10-03 拍的是"按你建议来 + 开发吧"，这一批走本机——
 * 零后端、今天就能上真机。
 *
 * 这条路的代价要认得清：换设备、清微信缓存、删掉小程序，这一格就空了（回到"还没有生成过
 * 卡片"）。要跨设备得另开一批：服务端加 note_cards 表 + 出图后上传 + 部署。
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
function copyIn(noteId, tplId, noQr, srcPath) {
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
        keep.push({ p: filePath, tpl: tplId, at, noQr: !!noQr })
        map[noteId] = keep
        write(map)
        resolve(keep)
      },
      // 存不下就不记这一张。绝不能让"分享"那一步因为这一格失败。
      fail: (e) => { console.error('卡片留档失败', e); resolve(null) },
    })
  })
}

function record(noteId, tplId, noQr, canvas, page) {
  if (!noteId || !tplId || !canvas) return Promise.resolve(null)
  return new Promise((resolve) => {
    wx.canvasToTempFilePath({
      canvas, fileType: 'jpg', quality: 0.82,
      success: (r) => copyIn(noteId, tplId, noQr, r.tempFilePath).then(resolve),
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

module.exports = { record, forNote, aliveFor, dropNote, all: read, migrateKeepOnly, migrateOnePerNote, KEY, DIR, MODE_KEY, ONE_KEY }
