const app = getApp()

function _headers(contentType, extra) {
  const h = {
    'content-type': contentType || 'application/json',
  }
  if (app.globalData.token) {
    h['Authorization'] = `Bearer ${app.globalData.token}`
  }
  if (extra) Object.assign(h, extra)
  return h
}

const request = (url, method, data, options = {}) => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBase}${url}`,
      method: method || 'GET',
      data: data || {},
      header: _headers(options.contentType, options.header),
      timeout: 30000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
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

const uploadSingleImage = (url, filePath) => {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${app.globalData.apiBase}${url}`,
      filePath,
      name: 'images',
      header: _headers(),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(res.data))
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

const ingestScreenshots = (filePaths) => {
  return new Promise((resolve, reject) => {
    let completed = 0
    let lastResult = null
    let hasError = false

    filePaths.forEach((filePath) => {
      uploadSingleImage('/api/ingest/screenshot_single', filePath)
        .then((result) => {
          if (hasError) return
          lastResult = result
          completed++
          if (completed === filePaths.length) {
            resolve(lastResult)
          }
        })
        .catch((err) => {
          if (hasError) return
          hasError = true
          reject(err)
        })
    })
  })
}

module.exports = {
  request,
  getNotes: (skip = 0, limit = 20, categoryId) => {
    let url = `/api/notes/?skip=${skip}&limit=${limit}`
    if (categoryId != null) url += `&category_id=${categoryId}`
    return request(url)
  },
  getNote: (id) => request(`/api/notes/${id}`),
  createNote: (data) => request('/api/notes/', 'POST', data),
  updateNote: (id, data) => request(`/api/notes/${id}`, 'PUT', data),
  deleteNote: (id) => request(`/api/notes/${id}`, 'DELETE'),
  pinNote: (id, pin) => request(`/api/notes/${id}/pin?pin=${pin}`, 'POST'),
  ingestUrl: (url) => request('/api/ingest/url', 'POST', { url }, { contentType: 'application/x-www-form-urlencoded' }),
  ingestScreenshots,
  getCategories: () => request('/api/categories/'),
  createCategory: (data) => request('/api/categories/', 'POST', data),
  updateCategory: (id, data) => request(`/api/categories/${id}`, 'PUT', data),
  deleteCategory: (id) => request(`/api/categories/${id}`, 'DELETE'),
  reorderCategories: (ids) => request('/api/categories/reorder', 'POST', { ids }),
  createShare: (noteId) => request('/api/shares/', 'POST', { note_id: noteId }),
}
