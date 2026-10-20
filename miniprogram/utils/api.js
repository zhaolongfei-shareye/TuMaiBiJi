// 接口地址属于前后端之间的那道边界，只在这里出现一次。
// 之前它挂在 app.globalData.apiBase 上，页面拼 URL 时还得绕回 getApp() 去取。
const API_BASE = 'https://api.agentsbin.cn/wtsj'

// 私密笔记的解锁凭证。服务端在"验对密码"那一步发一条 15 分钟短命的 token，
// 之后每个请求带上它，服务端才把私密笔记的正文和概要发下来——以前这道锁只在界面里，
// 同一个登录令牌直接打 GET /api/notes/{id} 就能拿到整篇正文。
// 只存内存（挂在 globalData 上，不落 storage）：杀了小程序重进就要重新输，
// 这一闸防的恰恰是"手机在别人手里"那一段时间。
// 本机判的有效期故意比服务端那 15 分钟短一分钟：卡在边界上时宁可多问一次密码，
// 也不要出现"客户端以为还解锁着、服务端已判未解锁"，那会让详情页拿到一份裁过的空壳。
const UNLOCK_TTL_MS = 14 * 60 * 1000

function _unlockToken() {
  const app = getApp()
  const u = app.globalData.privateUnlock
  if (!u || !u.token) return ''
  if (Date.now() > u.expireAt) {
    app.globalData.privateUnlock = null
    return ''
  }
  return u.token
}

function setPrivateUnlock(token) {
  const app = getApp()
  app.globalData.privateUnlock = token ? { token, expireAt: Date.now() + UNLOCK_TTL_MS } : null
}

function clearPrivateUnlock() {
  getApp().globalData.privateUnlock = null
}

function hasPrivateUnlock() {
  return !!_unlockToken()
}

function _headers(contentType, extra, withUnlock = true) {
  const h = {
    'content-type': contentType || 'application/json',
  }
  const app = getApp()
  if (app.globalData.token) {
    h['Authorization'] = `Bearer ${app.globalData.token}`
  }
  const unlock = withUnlock ? _unlockToken() : ''
  if (unlock) h['X-Private-Token'] = unlock
  if (extra) Object.assign(h, extra)
  return h
}

// 后端回体里的 `detail` 有两种来源：一种是我们服务端自己写的中文话术（能给他看），
// 一种是框架兜底的英文短语（"Method Not Allowed" 那类，10-20 被它顶到屏上，审计 N7）。
// 判据与 write.js 排序那一处同一条：带中文才留，其余一律当没有——各屏现有的
// `|| t('…Failed')` 兜底就此接得住。reject 前在这里洗一次，页面不许各写一份。
function friendlyDetail(text) {
  return typeof text === 'string' && /[\u4e00-\u9fff]/.test(text) ? text : ''
}

function _washRes(res) {
  const d = res && res.data
  if (d && typeof d === 'object' && d.detail !== undefined) d.detail = friendlyDetail(d.detail)
  return res
}

/**
 * 401 之后"准备重登"要清的那几格，**只有这一份**（审计 #7）。
 *
 * 原来 `request()` 与 `uploadSingleImage()` 各写一遍同一段，而上传那一份**漏了 `privateUnlock`**：
 * 症状是重登之后本机还留着上一身份的私密解锁凭证，下一次读私密笔记带着它打过去，
 * 拿到的是按旧 `generation` 裁过的空壳——用户看到的是"我的笔记突然没了"，而不是"请重新解锁"。
 * 两处各写一遍迟早漏一行，所以搬成一处。
 */
function _dropAuthForRelogin(app) {
  app.globalData.token = ''
  app.globalData.userId = ''
  // 语言这一格不许跟着身份一起清：屏上已经换成英文，下一次 onShow 从 `userInfo` 读回来
  // 就是 undefined ⇒ 当场弹回中文（10-14 真跑实测到的，站长那句「切换中英文失效」的另一半
  // 成因）。身份该清（重登之后可能是另一个号），语言留到那一份被服务器覆盖为止。
  const keepLang = (app.globalData.userInfo || {}).language
  app.globalData.userInfo = keepLang ? { language: keepLang } : null
  app.globalData.isLoggedIn = false
  app.globalData.loginPromise = null // Reset login promise to allow retry
  // 解锁凭证跟着登录态一起清：重登之后可能是另一个 generation 的账号，
  // 留着旧凭证只会让下一次读私密笔记拿到一份裁过的空壳。
  app.globalData.privateUnlock = null
}

const request = (url, method, data, options = {}, retryCount = 0) => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}${url}`,
      method: method || 'GET',
      data: data || {},
      header: _headers(options.contentType, options.header, !options.noUnlock),
      timeout: 30000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // 注销这一类不可逆的写操作不带静默重登：401 之后换一个新账号重试，删掉的就是
          // 那个新号，用户看到"已注销"而自己的旧数据还在原地。宁可让他重进一次小程序。
          if (options.noRelogin) {
            reject(_washRes(res))
            return
          }
          // Prevent infinite relogin loop: only retry once
          if (retryCount >= 1) {
            reject(new Error('认证失败，请重新登录'))
            return
          }
          
          // Clear auth state on 401 and trigger re-login
          const app = getApp()
          _dropAuthForRelogin(app)
          
          // Trigger login and retry after successful authentication
          app.getLoginPromise()
            .then(() => {
              // Retry original request with new token (increment retry count)
              return request(url, method, data, options, retryCount + 1)
            })
            .then(resolve)
            .catch(reject)
        } else {
          reject(_washRes(res))
        }
      },
      fail(err) {
        reject(err)
      }
    })
  })
}

const uploadSingleImage = (url, filePath, formData, retryCount = 0) => {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE}${url}`,
      filePath,
      name: 'images',
      header: _headers(),
      formData,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // `wx.uploadFile` 的 data 恒是字符串，所以这里必须 parse；而 parse 会抛。
          // 不包起来的话异常吞在 wx 回调里，Promise 既不 resolve 也不 reject ——
          // 症状是"点了快门一直没反应"，转圈收不掉、日志一行不留（10-18 全量审查那条）。
          // 读不懂就按失败退，且**不编新话术**：把原始 res 交回调用方，页面走的还是它本来
          // 那一句失败兜底文案（与下面非 2xx 那一支的 catch 同一个回法）。
          try {
            resolve(JSON.parse(res.data))
          } catch (e) {
            reject(_washRes(res))
          }
        } else if (res.statusCode === 401) {
          // Prevent infinite relogin loop: only retry once
          if (retryCount >= 1) {
            reject(new Error('认证失败，请重新登录'))
            return
          }
          
          // Handle 401 for uploads: clear auth and trigger re-login
          // 与 `request()` 那一支**同一个函数**（审计 #7）：原来这里少清了一格解锁凭证。
          const app = getApp()
          _dropAuthForRelogin(app)
          
          app.getLoginPromise()
            .then(() => {
              // Retry upload with new token (increment retry count)
              return uploadSingleImage(url, filePath, formData, retryCount + 1)
            })
            .then(resolve)
            .catch(reject)
        } else {
          // wx.uploadFile 拿到的 data 是字符串，而 wx.request 的是对象。不统一成对象，
          // 页面里 err.data.detail 这种取法在上传失败时会拿到 undefined，用户只能看到兜底文案。
          try {
            reject(_washRes(Object.assign({}, res, { data: JSON.parse(res.data) })))
          } catch (e) {
            reject(_washRes(res))
          }
        }
      },
      fail(err) {
        reject(err)
      }
    })
  })
}

const ingestScreenshots = async (filePaths, translate) => {
  let batchId = null
  for (const filePath of filePaths) {
    const formData = batchId ? { batch_id: batchId } : undefined
    const res = await uploadSingleImage('/api/ingest/screenshots/stage', filePath, formData)
    batchId = res.batch_id
  }
  // translate 这一位 10-16 才接上：站长「把原文翻译的开关…三个tab全局都可用」。
  // 显式发 'true'/'false' 而不是省掉——后端那一格默认是 None（不表态），老包不带才回落到今天的行为。
  return request('/api/ingest/screenshots/process', 'POST',
    { batch_id: batchId, translate: translate ? 'true' : 'false' }, { contentType: 'application/x-www-form-urlencoded' })
}

const getTaskStatus = (taskId) => request(`/api/tasks/${taskId}`)

const pollTask = (taskId, intervalMs = 2000, maxWaitMs = 300000) => {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const poll = () => {
      if (Date.now() - start > maxWaitMs) {
        reject({ timeout: true })
        return
      }
      getTaskStatus(taskId)
        .then((data) => {
          if (data.status === 'completed') {
            resolve(data.result)
          } else if (data.status === 'failed') {
            // 同一条收口（N7）：任务失败回体里的 `error` 常常是英文甚至字面 "unknown"，
            // 上屏就是框外气泡一句天书（create.js 的 errLine 直接吃 err.error）；洗成空，让它落回那句「处理失败，请重试」。
            const r = data.result && typeof data.result === 'object' ? data.result : {}
            if (r.error !== undefined) r.error = friendlyDetail(r.error)
            if (r.detail !== undefined) r.detail = friendlyDetail(r.detail)
            reject(r)
          } else {
            setTimeout(poll, intervalMs)
          }
        })
        .catch(reject)
    }
    poll()
  })
}

module.exports = {
  request,
  // 收口后的那一句：只有带中文的才留得下来（N7）——utils 里自己读 `err.data.detail` 的
  // 两处（privateGate／cardCloud）都走这一枚，别再各写一份判据。
  friendlyDetail,
  getNotes: (skip = 0, limit = 20, categoryId, search) => {
    let url = `/api/notes/?skip=${skip}&limit=${limit}`
    if (categoryId != null) url += `&category_id=${categoryId}`
    if (search) url += `&search=${encodeURIComponent(search)}`
    // 这一趟**永远不带解锁凭证**（站长 10-12：「不输入密码就只能看标题」）。带着它，
    // 服务端就会把这一页里**所有**私密笔记的 summary 一起发下来（锁着时只裁 summary 那一列），
    // 而这些行会留在 this.data.notes 里——症状是"验过一次之后，别的私密篇不问就露摘要"。
    // 正文与摘要只从 getNote(id) 那一条口取，那一口才许带凭证。
    return request(url, 'GET', undefined, { noUnlock: true })
  },
  getNote: (id) => request(`/api/notes/${id}`),
  createNote: (data) => request('/api/notes/', 'POST', data),
  updateNote: (id, data) => request(`/api/notes/${id}`, 'PUT', data),
  deleteNote: (id) => request(`/api/notes/${id}`, 'DELETE'),
  // 笔记配图那三接口（2.0 的 B 链）。图片字节不经过后端，这里传的每一项都是
  // {file_id, size, width, height}——**方案文档 §3.1.5 原来写的是只传 file_ids 字符串数组**，
  // 少了 size 就没法算配额（后端那 5GB 是按 SUM(file_size) 看的），所以按 items 传。
  // size 拿不到时可以不给，那一行就不计入配额，比"因为取不到大小而整张图存不上"好。
  bindNoteAssets: (id, items) => request(`/api/notes/${id}/assets`, 'POST', { items }),
  getNoteAssets: (id) => request(`/api/notes/${id}/assets`),
  // 删掉这一篇里的某一张。路径上带的是**那一行的数字 id**，不是 fileID——fileID 里全是 `/`，
  // 塞进路径段会被多切两截，路由直接不匹配（后端 routes/assets.py 那条注释记的就是这个）。
  // 回的是**剩下的那批**（与 GET 同一个形状），界面拿它直接刷新那一排，不必再读一次列表。
  deleteNoteAsset: (id, assetId) => request(`/api/notes/${id}/assets/${assetId}`, 'DELETE'),
  // 把这一篇配图的先后改成 `ids` 这个次序（10-19 站长「编辑时，配图要支持拖动排序，
  // 方便用户选择好的图片作为头图」）。**第一张就是头图**：列表右侧那枚、详情窗那张大图、
  // 卡片模板的大图位、公开页那一批，五处读的都是服务端这一个序号。
  // 与删除那一口同一条：路径上带数字 id，回的是**排完之后按新序的那一批**，界面直接拿它刷新那一排。
  reorderNoteAssets: (id, ids) => request(`/api/notes/${id}/assets/reorder`, 'POST', { ids }),
  getStorageQuota: () => request('/api/user/storage-quota'),
  // 卡片留档那三个口（2.0.1 P0 · S1 的服务端，S2 接上客户端）。
  // 形状与配图那一路同型：图片字节不经过后端，这里传的每一项都是登记信息。
  // putNoteCard 是**幂等 upsert**：同一张再登记一次只更新那一行，所以补传重跑安全。
  putNoteCard: (id, card) => request(`/api/notes/${id}/card`, 'POST', card),
  // 读一篇回的是 {card, had_share}：had_share 是"这篇公开过但服务器没卡片行"，
  // 那一格是补卡那一趟（S3）的入口，所以不能只回 card。
  getNoteCard: (id) => request(`/api/notes/${id}/card`),
  // 列表页一次拿全：{cards, need_confirm}。判据在服务器，不在这台手机的文件目录——
  // 这正是"更新之后卡片不见了"那一态的根治。
  getMyCards: () => request('/api/user/cards'),
  // 撤掉这一格（界面上那枚「删除」）。回体带的还是 `file_ids` 那个键——对象只有客户端删得动，
  // 拿到清单直接交给 cloudUpload.dropFromDeleteRes，与删笔记、注销同一条路。
  // 这里用 DELETE 不违反注销那条"不用 DELETE"：那条挡的是**带请求体的 DELETE** 在 wx.request 里
  // 怎么序列化没有保证，这一趟 note id 全在路径上，一个字节的身子都不发。
  deleteNoteCard: (id) => request(`/api/notes/${id}/card`, 'DELETE'),
  // 名片与那两档外观（2.1）。`updated_at` 为 null ＝ 这个人**从来没登记过**，
  // 与"登记过、四格都是空的"是两件事——pull 那一路靠这一个数区分，区分错的后果是
  // 把老用户本机那四张图当成"云上已经删了"跟着删掉。
  getProfile: () => request('/api/user/profile'),
  // PUT 是补丁语义：只改传进来的那几栏（只提交亮度档那一趟不许抹掉名称）。
  // 回体里的 `file_ids` 是这次被换下／撤掉的旧地址，键名与删笔记、注销、撤卡片一致。
  putProfile: (patch) => request('/api/user/profile', 'PUT', patch),
  // 与截图那条同一个理由：translate 显式发字符串，后端不接就不动（10-16 站长「三个tab全局都可用」）。
  ingestUrl: (url, translate) => request('/api/ingest/url', 'POST',
    { url, translate: translate ? 'true' : 'false' }, { contentType: 'application/x-www-form-urlencoded' }),
  // 手打这一档也交给模型提炼：送的是用户自己写的标题 + 原文，回来的是摘要。
  // 归类跟着这一篇走（服务端认人不认客户端说的 source_type）。
  ingestText: (data) => request('/api/ingest/text', 'POST', data),
  ingestScreenshots,
  getTaskStatus,
  pollTask,
  getCategories: () => request('/api/categories/'),
  createCategory: (data) => request('/api/categories/', 'POST', data),
  updateCategory: (id, data) => request(`/api/categories/${id}`, 'PUT', data),
  deleteCategory: (id) => request(`/api/categories/${id}`, 'DELETE'),
  reorderCategories: (ids) => request('/api/categories/reorder', 'POST', { ids }),
  // 昵称是"分享形象"里用户自己填的，只在主动分享这一刻才跟着上服务器，
  // 和标题摘要同性质——都是他选择公开的内容，不是我们采集的账号资料。
  createShare: (noteId, authorName) =>
    request('/api/shares/', 'POST', { note_id: noteId, author_name: authorName || null }),
  // 把别人分享页上那一条整份抄进自己库。来源信息由服务端钉在笔记上，客户端碰不到它。
  importFromShare: (token) => request('/api/notes/from-share', 'POST', { token }),
  // 分享状态：详情页拿它决定要不要显示"撤掉分享"这一行
  getShareStatus: (noteId) => request(`/api/shares/status?note_id=${noteId}`),
  // 撤掉之后那张码扫开就是"分享已关闭"，再点分享会给一张新码
  revokeShare: (noteId) => request('/api/shares/revoke', 'POST', { note_id: noteId }),
  // 分享落地页原来直接调 api.request 拼路径，等于绕过了这一层
  getShare: (token) => request(`/api/shares/${encodeURIComponent(token)}`),
  getShareQRCodeUrl: (token) => `${API_BASE}/api/shares/${token}/qrcode`,
  getWallpaperOptions: () => request('/api/user/wallpaper/options'),
  // 卡片模板配方下发（P0-5）。路径尾巴那个斜杠是必须的：FastAPI 那里注册的是 ""，
  // 少一个斜杠服务端回 307，而 wx.request 对重定向的处理在各端不一致——别拿它赌。
  // 现网那张表还没建（这一批没部署），所以现在打过来只会 404，
  // posterTemplates.refresh 那边把任何失败都当"这次没拿到"，包内那十套照样画。
  getPosterTemplates: () => request('/api/poster/templates/'),
  getQuota: () => request('/api/user/quota'),
  // 确认标志必须在服务端看得见的地方，所以是 POST 带 body，不是 DELETE 带 body
  deactivateAccount: () =>
    request('/api/user/deactivate', 'POST', { confirm: true }, { noRelogin: true }),
  updateWallpaper: (wallpaper) => request('/api/user/wallpaper', 'PUT', { wallpaper }),
  updateLanguage: (language) => request('/api/user/language', 'PUT', { language }),
  // 用户自己填的联系邮箱（账号能力）。空串在**服务端**就是清除这一格，不是"保持原值"，
  // 所以界面上那一句"清空并保存＝不再留"吃的是这条契约（backend/app/api/routes/user.py）。
  getContactEmail: () => request('/api/user/contact-email'),
  setContactEmail: (email) => request('/api/user/contact-email', 'PUT', { email }),
  setPrivatePassword: async (password) => {
    // 换密码会让服务端手上那批解锁凭证当场作废（凭证绑在旧密码摘要上），
    // 本机这份也跟着清掉，别留一条"界面以为还解锁着、服务端已经不认"的凭证。
    const r = await request('/api/user/private-password', 'PUT', { password })
    clearPrivateUnlock()
    return r
  },
  // 验对密码 = 拿到解锁凭证。收口在这里而不是让各页面自己记得存，
  // 是因为漏存的那一处症状很隐蔽：详情页能打开，但正文和概要是空的。
  verifyPrivatePassword: async (password) => {
    const r = await request('/api/user/private-password/verify', 'POST', { password })
    if (r && r.unlock_token) setPrivateUnlock(r.unlock_token)
    return r
  },
  getPrivatePasswordStatus: () => request('/api/user/private-password'),
  // 重置走 POST 不走 DELETE：与注销那条同一条理由——动作要在服务端日志里看得见实体。
  resetPrivatePassword: async () => {
    const r = await request('/api/user/private-password/reset', 'POST', {})
    clearPrivateUnlock()
    return r
  },
  // 解锁凭证这一头一尾三个口：详情页验完密码要重取列表时用它判"现在解没解锁"，
  // 退出登录那一步要清掉它，别把上一账号的解锁状态留给下一个。
  setPrivateUnlock,
  clearPrivateUnlock,
  hasPrivateUnlock,
}
