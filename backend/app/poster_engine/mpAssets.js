// 运营内容下发：后台传一张背景图、改一行 Tips，小程序冷启 / 登录成功后拉一次，落到本机缓存。
// （图是 P0-a 那一刀，文案是站长 10-15「Tips 改为后台配置」加的第二栏；两条共用同一次请求。）
//
// 为什么不直接让 homeBg() 每次现查服务器：首页 onShow 就要用那张图，等一趟 RTT 会让
// 首屏白一块。所以策略和 posterTemplates 一样——先读本机缓存画上去，后台静默拉新的，
// 下一次进首页自然就是新图。content_hash 判重：哈希没变就不下载，省流量也省一次写盘。
// 文案没有字节可哈希，判重那一格改用 updated_at。
//
// 存储结构（wx.setStorageSync）：
//   MP_ASSET_KEY_home_bg → { filePath, contentHash }
//   MP_TEXT_KEY_tips     → { zh: [...], en: [...], updatedAt }
// filePath 是 FileSystemManager.saveFile 落到的永久路径；contentHash 用来和服务器那次比对。
const { request } = require('./api.js')

const API_BASE = 'https://api.agentsbin.cn/wtsj'
const FS = wx.getFileSystemManager()

// 永久存放目录：wx.env.USER_DATA_PATH 是小程序沙盒根，杀进程不丢、卸载才清。
const DIR = `${wx.env.USER_DATA_PATH}/mp-assets`

function _key(kind) { return `MP_ASSET_KEY_${kind}` }
// 文案只有一栏，不需要按 kind 拼键名；单独一个键也方便上面那条"撤账"一步到位。
const TEXT_KEY = 'MP_TEXT_KEY_tips'

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

  // 文案先落账，再走图片那条循环：两条各自独立，一条坏了不许连累另一条
  // （与下面"一种 kind 失败不影响另一种"同一条纪律）。
  try { _saveTexts(config) } catch (e) { console.warn('mpAssets pull: 文案落账失败', e) }

  const kinds = Object.keys(config)
  for (const kind of kinds) {
    const entry = config[kind]
    if (!entry || !entry.content_hash) {
      // 服务端这一格明说"没有生效的那张"（停用、从没登记、审核期冻结三种在回体里塌成同一个 null）。
      // 官方那一篇的配图要把账一起撤掉：留着的话后台撤了图、屏上还画着那张已经不生效的旧图，
      // 而他在后台看到的话是"已停用"——与 `_saveTexts` 那句"只回 null 不撤账，这台机就永远显示旧那一份"
      // 是同一条纪律。**这里只管这一格，不管 `home_bg`**：背景图在冻结期该不该撤账是另一件事，
      // 他这句里没点，我不动它（`§8.231` 那两级兜底链的行为跟着现网走，要改要单独拍）。
      if (kind === 'preset_note_image') {
        // 撤账要连带删本机那个文件：只清账不删文件，那份字节就没人认得了——
        // 账上没它、屏上不读它、下次换图也不会去删它（换图那支只删"账上记着的那一份"）。
        try {
          const stale = wx.getStorageSync(_key(kind))
          if (stale && stale.filePath) FS.unlinkSync(stale.filePath)
        } catch (_) {}
        try { wx.removeStorageSync(_key(kind)) } catch (_) {}
      }
      continue
    }
    const cached = wx.getStorageSync(_key(kind))
    // 绝对地址每次落账都记一份：官方那一篇的配图要拿去喂 `previewImage`，而那条 API 只认
    // https／cloud://，不认本机 `USER_DATA_PATH`（detail.js 的 `onCardCell` 里 10-08 就记过这条）。
    // 后端那个口发的 URL 是唯一出处（`services/mp_assets.url_of`），域名那一半仍只在这台机上
    // 由 `utils/api.js` 拼，与下面 `_download` 用的 `${API_BASE}${url}` 同一个串。
    const remote = `${API_BASE}${entry.url}`
    if (cached && cached.contentHash === entry.content_hash) {
      // 这份账是旧版本写的（那时还没记 url）：内容没变、不必重下一遍，但**账要补上 url**。
      // 不补的话这一台机永远停在"有 filePath 没 url"那一态，官方那张图的大图入口点了没反应，
      // 而后台明明写着已发布——只有改了图才会重新落账，那种"等下一次才对"是最难查的半修。
      // 这一句也必须包起来：`setStorageSync` 在本机存储写满时会抛，而它抛在外面
      // 等于把整趟 `pull()` 打断 —— 后面每一个 kind 一个都落不了账，而 `app.js` 那边
      // 故意不 catch（首屏不许为它等、失败不许出声），最后变成一个没人接的拒绝。
      if (!cached.url) {
        try { wx.setStorageSync(_key(kind), { ...cached, url: remote }) } catch (e) {
          console.warn(`mpAssets pull: ${kind} 补 url 没落进账`, e)
        }
      }
      continue
    }
    try {
      const filePath = await _download(kind, entry.url)
      // 新文件落盘成功再清旧的，避免下载失败时把好的那份也删了。
      if (cached && cached.filePath && cached.filePath !== filePath) {
        try { FS.unlinkSync(cached.filePath) } catch (_) {}
      }
      wx.setStorageSync(_key(kind), { filePath, url: remote, contentHash: entry.content_hash })
    } catch (e) {
      console.warn(`mpAssets pull: ${kind} 下载失败`, e)
    }
  }
}

// 返回当前缓存的那张背景图的本地路径，没有（或那半截账对不上文件）就 null。
/* ⚠ 必须验文件真在，且验不到就把那半截账一起撤掉，两条是一起的：
   ① 账在文件不在时这里回一个**不存在的非空路径**，`homeBg()` 就当"有图"往外发 ⇒
      `wx:if="{{bgSrc}}"` 成立、`has-bg` 被点亮，图上那一整套纸白字压在浅壁纸上＝看不见
      （§8.231 判据 6 点名的正是这一态；`<image>` 解不出东西，屏上什么也不会报错）。
      同一条纪律 `poster.readSlots()` 对四个槽早就在做（`exists(s.path)`），这一级一直是漏的。
   ② 光回 null 不够：`pull()` 判的是 `contentHash` 相等就 `continue`，留着这条账这台机
      **永远不会再下第二次**，运营图就永久白底。撤掉账，下一趟 `pull()` 才把它补回来。 */
function serverBgPath() {
  const cached = wx.getStorageSync(_key('home_bg'))
  if (!cached || !cached.filePath) return null
  try {
    FS.accessSync(cached.filePath)
  } catch (_) {
    wx.removeStorageSync(_key('home_bg'))
    return null
  }
  return cached.filePath
}

// 官方那一篇（「帮助文档」）的那张配图。返回**后端那个匿名口的绝对地址**，没有就 null。
/* 为什么这里给的是 https 串而不是像 `serverBgPath()` 那样给本机路径：这一张要画在三个落点上
   （列表右侧那块封面、详情窗那一排、独立详情页那一格），而后两排点一下要看大图——
   `wx.previewImage` 不认本机 `USER_DATA_PATH` 那个路径（`pages/detail/detail.js` 的 `onCardCell`
   里 10-08 就记过这一条：小图画得出来、大图看不到）。同一条 URL 既能画小图也能看大图，
   三个落点因此吃的是同一个出处，不用哪一处再单独退回本机路径。
   那张图由 `pull()` 顺带下到本机（走的是图片栏那条通用链，没为它开分支），但屏上不读那个文件。 */
function serverPresetImage() {
  const cached = wx.getStorageSync(_key('preset_note_image'))
  return (cached && cached.url) || null
}

// 运营文案（站长 10-15「Tips 改为后台配置」）。形状与图片那份完全不同：没有 url、没有字节、
// 也没有 content_hash 可哈希，所以**不挤进上面那个 kind 循环**——挤进去就要在循环里判
// "这一条是图还是话"，那等于把后端的两个 kind 闭集在客户端抄第三份。
// 判重那一格用 updated_at（服务端那条链里"改过没有"的唯一证据）。
function _saveTexts(config) {
  const entry = Object.prototype.hasOwnProperty.call(config, 'tips') ? config.tips : null
  if (!entry || !Array.isArray(entry.zh) || !Array.isArray(entry.en)) {
    // 服务端明说"停用"（回 null）时要把账一起撤掉，和 `serverBgPath()` 那句"账对不上文件就撤账"
    // 是同一条纪律。只回 null 不撤账，这台机就会永远显示旧那一份，而后台写着"已停用"。
    // 老后端根本没这个键时走的是同一条路径：撤一个从没写过的键，无害。
    try { wx.removeStorageSync(TEXT_KEY) } catch (_) {}
    return
  }
  const cached = wx.getStorageSync(TEXT_KEY)
  if (cached && cached.updatedAt === entry.updated_at) return
  wx.setStorageSync(TEXT_KEY, { zh: entry.zh, en: entry.en, updatedAt: entry.updated_at })
}

// 当前缓存的那一份文案；没有（从没下发过、或已停用、或那一门是空数组）就 null。
// 返回 null 是**正常状态不是错误**：调用方（create.js 的 tipsFor）落回包里那六句。
function serverTips(lang) {
  const cached = wx.getStorageSync(TEXT_KEY)
  if (!cached) return null
  const arr = cached[lang]
  return Array.isArray(arr) && arr.length ? arr : null
}

module.exports = { pull, serverBgPath, serverPresetImage, serverTips }
