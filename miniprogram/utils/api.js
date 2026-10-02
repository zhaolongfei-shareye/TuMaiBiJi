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

function _headers(contentType, extra) {
  const h = {
    'content-type': contentType || 'application/json',
  }
  const app = getApp()
  if (app.globalData.token) {
    h['Authorization'] = `Bearer ${app.globalData.token}`
  }
  const unlock = _unlockToken()
  if (unlock) h['X-Private-Token'] = unlock
  if (extra) Object.assign(h, extra)
  return h
}

const request = (url, method, data, options = {}, retryCount = 0) => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}${url}`,
      method: method || 'GET',
      data: data || {},
      header: _headers(options.contentType, options.header),
      timeout: 30000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // 注销这一类不可逆的写操作不带静默重登：401 之后换一个新账号重试，删掉的就是
          // 那个新号，用户看到"已注销"而自己的旧数据还在原地。宁可让他重进一次小程序。
          if (options.noRelogin) {
            reject(res)
            return
          }
          // Prevent infinite relogin loop: only retry once
          if (retryCount >= 1) {
            reject(new Error('认证失败，请重新登录'))
            return
          }
          
          // Clear auth state on 401 and trigger re-login
          const app = getApp()
          app.globalData.token = ''
          app.globalData.userId = ''
          app.globalData.userInfo = null
          app.globalData.isLoggedIn = false
          app.globalData.loginPromise = null // Reset login promise to allow retry
          // 解锁凭证跟着登录态一起清：重登之后可能是另一个 generation 的账号，
          // 留着旧凭证只会让下一次读私密笔记拿到一份裁过的空壳。
          app.globalData.privateUnlock = null
          
          // Trigger login and retry after successful authentication
          app.getLoginPromise()
            .then(() => {
              // Retry original request with new token (increment retry count)
              return request(url, method, data, options, retryCount + 1)
            })
            .then(resolve)
            .catch(reject)
        } else {
          reject(res)
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
          resolve(JSON.parse(res.data))
        } else if (res.statusCode === 401) {
          // Prevent infinite relogin loop: only retry once
          if (retryCount >= 1) {
            reject(new Error('认证失败，请重新登录'))
            return
          }
          
          // Handle 401 for uploads: clear auth and trigger re-login
          const app = getApp()
          app.globalData.token = ''
          app.globalData.userId = ''
          app.globalData.userInfo = null
          app.globalData.isLoggedIn = false
          app.globalData.loginPromise = null
          
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
            reject(Object.assign({}, res, { data: JSON.parse(res.data) }))
          } catch (e) {
            reject(res)
          }
        }
      },
      fail(err) {
        reject(err)
      }
    })
  })
}

const ingestScreenshots = async (filePaths) => {
  let batchId = null
  for (const filePath of filePaths) {
    const formData = batchId ? { batch_id: batchId } : undefined
    const res = await uploadSingleImage('/api/ingest/screenshots/stage', filePath, formData)
    batchId = res.batch_id
  }
  return request('/api/ingest/screenshots/process', 'POST', { batch_id: batchId }, { contentType: 'application/x-www-form-urlencoded' })
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
            reject(data.result || { error: 'unknown' })
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
  getNotes: (skip = 0, limit = 20, categoryId, search) => {
    let url = `/api/notes/?skip=${skip}&limit=${limit}`
    if (categoryId != null) url += `&category_id=${categoryId}`
    if (search) url += `&search=${encodeURIComponent(search)}`
    return request(url)
  },
  getNote: (id) => request(`/api/notes/${id}`),
  createNote: (data) => request('/api/notes/', 'POST', data),
  updateNote: (id, data) => request(`/api/notes/${id}`, 'PUT', data),
  deleteNote: (id) => request(`/api/notes/${id}`, 'DELETE'),
  ingestUrl: (url) => request('/api/ingest/url', 'POST', { url }, { contentType: 'application/x-www-form-urlencoded' }),
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
  getQuota: () => request('/api/user/quota'),
  // 确认标志必须在服务端看得见的地方，所以是 POST 带 body，不是 DELETE 带 body
  deactivateAccount: () =>
    request('/api/user/deactivate', 'POST', { confirm: true }, { noRelogin: true }),
  updateWallpaper: (wallpaper) => request('/api/user/wallpaper', 'PUT', { wallpaper }),
  updateLanguage: (language) => request('/api/user/language', 'PUT', { language }),
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
