// 运营图下发：后台传一张背景图，小程序冷启 / 登录成功后拉一次，落到本机缓存。
//
// 为什么不直接让 homeBg() 每次现查服务器：首页 onShow 就要用那张图，等一趟 RTT 会让
// 首屏白一块。所以策略和 posterTemplates 一样——先读本机缓存画上去，后台静默拉新的，
// 下一次进首页自然就是新图。content_hash 判重：哈希没变就不下载，省流量也省一次写盘。
//
// 存储结构（wx.setStorageSync）：
//   MP_ASSET_KEY_home_bg → { filePath, contentHash }
// filePath 是 FileSystemManager.saveFile 落到的永久路径；contentHash 用来和服务器那次比对。
const { request } = require('./api.js')

const API_BASE = 'https://api.agentsbin.cn/wtsj'
const FS = wx.getFileSystemManager()

// 永久存放目录：wx.env.USER_DATA_PATH 是小程序沙盒根，杀进程不丢、卸载才清。
const DIR = `${wx.env.USER_DATA_PATH}/mp-assets`

function _key(kind) { return `MP_ASSET_KEY_${kind}` }

function _ensureDir() {
  try { FS.accessSync(DIR) } catch (_) { FS.mkdirSync(DIR, true) }
}

// 下载 + 落盘。返回永久路径。失败抛异常，调用方静默吃掉。
function _download(kind, url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: `${API_BASE}${url}`,
      success(res) {
        if (res.statusCode !== 200) {
          reject(new Error(`mp asset download ${res.statusCode}`))
          return
        }
        try {
          _ensureDir()
          // saveFile 从临时路径搬到永久目录；同名会覆盖，所以每次用时间戳做文件名。
          const dest = `${DIR}/${kind}-${Date.now()}`
          FS.saveFile({
            tempFilePath: res.tempFilePath,
            filePath: dest,
            success() { resolve(dest) },
            fail(e) { reject(e) },
          })
        } catch (e) { reject(e) }
      },
      fail: reject,
    })
  })
}

// 拉一次配置并按需下载。每种 kind 独立处理，一种失败不影响另一种。
async function pull() {
  let config
  try {
    config = await request('/api/mp/config', 'GET', undefined, { noUnlock: true })
  } catch (e) {
    console.warn('mpAssets pull: config 取失败', e)
    return
  }
  if (!config) return

  const kinds = Object.keys(config)
  for (const kind of kinds) {
    const entry = config[kind]
    if (!entry || !entry.content_hash) continue
    const cached = wx.getStorageSync(_key(kind))
    if (cached && cached.contentHash === entry.content_hash) continue
    try {
      const filePath = await _download(kind, entry.url)
      // 新文件落盘成功再清旧的，避免下载失败时把好的那份也删了。
      if (cached && cached.filePath && cached.filePath !== filePath) {
        try { FS.unlinkSync(cached.filePath) } catch (_) {}
      }
      wx.setStorageSync(_key(kind), { filePath, contentHash: entry.content_hash })
    } catch (e) {
      console.warn(`mpAssets pull: ${kind} 下载失败`, e)
    }
  }
}

// 返回当前缓存的那张背景图的本地路径，没有就 null。
function serverBgPath() {
  const cached = wx.getStorageSync(_key('home_bg'))
  return (cached && cached.filePath) || null
}

module.exports = { pull, serverBgPath }
