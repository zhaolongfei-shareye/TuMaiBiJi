function _headers(contentType, extra) {
  const h = {
    'content-type': contentType || 'application/json',
  }
  const app = getApp()
  if (app.globalData.token) {
    h['Authorization'] = `Bearer ${app.globalData.token}`
  }
  if (extra) Object.assign(h, extra)
  return h
}

const request = (url, method, data, options = {}, retryCount = 0) => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getApp().globalData.apiBase}${url}`,
      method: method || 'GET',
      data: data || {},
      header: _headers(options.contentType, options.header),
      timeout: 30000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
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

const uploadSingleImage = (url, filePath, formData) => {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${getApp().globalData.apiBase}${url}`,
      filePath,
      name: 'images',
      header: _headers(),
      formData,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(res.data))
        } else if (res.statusCode === 401) {
          // Handle 401 for uploads: clear auth and trigger re-login
          const app = getApp()
          app.globalData.token = ''
          app.globalData.userId = ''
          app.globalData.userInfo = null
          app.globalData.isLoggedIn = false
          app.globalData.loginPromise = null
          
          app.getLoginPromise()
            .then(() => {
              // Retry upload with new token
              return uploadSingleImage(url, filePath, formData)
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

const uploadFile = (url, filePath, name) => {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${getApp().globalData.apiBase}${url}`,
      filePath,
      name: name || 'file',
      header: _headers(),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(res.data))
        } else if (res.statusCode === 401) {
          // Handle 401 for uploads: clear auth and trigger re-login
          const app = getApp()
          app.globalData.token = ''
          app.globalData.userId = ''
          app.globalData.userInfo = null
          app.globalData.isLoggedIn = false
          app.globalData.loginPromise = null
          
          app.getLoginPromise()
            .then(() => {
              // Retry upload with new token
              return uploadFile(url, filePath, name)
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

const ingestVoice = (filePath) => {
  return uploadFile('/api/ingest/voice', filePath, 'audio')
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
  pinNote: (id, pin) => request(`/api/notes/${id}/pin?pin=${pin}`, 'POST'),
  ingestUrl: (url) => request('/api/ingest/url', 'POST', { url }, { contentType: 'application/x-www-form-urlencoded' }),
  ingestScreenshots,
  ingestVoice,
  getTaskStatus,
  pollTask,
  getCategories: () => request('/api/categories/'),
  createCategory: (data) => request('/api/categories/', 'POST', data),
  updateCategory: (id, data) => request(`/api/categories/${id}`, 'PUT', data),
  deleteCategory: (id) => request(`/api/categories/${id}`, 'DELETE'),
  reorderCategories: (ids) => request('/api/categories/reorder', 'POST', { ids }),
  createShare: (noteId) => request('/api/shares/', 'POST', { note_id: noteId }),
  getShareQRCodeUrl: (token) => `${getApp().globalData.apiBase}/api/shares/${token}/qrcode`,
  getWallpaperOptions: () => request('/api/user/wallpaper/options'),
  updateWallpaper: (wallpaper) => request('/api/user/wallpaper', 'PUT', { wallpaper }),
  updateLanguage: (language) => request('/api/user/language', 'PUT', { language }),
}
