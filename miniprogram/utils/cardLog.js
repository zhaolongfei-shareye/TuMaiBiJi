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
function copyIn(noteId, tplId, srcPath) {
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
        const keep = (map[noteId] || []).filter((x) => { if (x.tpl === tplId) { dropFile(x.p); return false } return true })
        keep.push({ p: filePath, tpl: tplId, at })
        map[noteId] = keep
        write(map)
        resolve(keep)
      },
      // 存不下就不记这一张。绝不能让"保存并分享"那一步因为这一格失败。
      fail: (e) => { console.error('卡片留档失败', e); resolve(null) },
    })
  })
}

function record(noteId, tplId, canvas, page) {
  if (!noteId || !tplId || !canvas) return Promise.resolve(null)
  return new Promise((resolve) => {
    wx.canvasToTempFilePath({
      canvas, fileType: 'jpg', quality: 0.82,
      success: (r) => copyIn(noteId, tplId, r.tempFilePath).then(resolve),
      fail: (e) => { console.error('卡片留档取图失败', e); resolve(null) },
    }, page)
  })
}

function forNote(noteId) { return read()[noteId] || [] }

// 笔记删了，它那一格的文件与索引一起清掉：留着既没人看，也是这台设备上清不掉的孤儿
function dropNote(noteId) {
  const map = read()
  if (!map[noteId]) return
  ;(map[noteId] || []).forEach((x) => dropFile(x.p))
  delete map[noteId]
  write(map)
}

module.exports = { record, forNote, dropNote, all: read, KEY, DIR }
