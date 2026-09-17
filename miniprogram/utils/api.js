const app = getApp()

const request = (url, options = {}) => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBase}${url}`,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'content-type': options.contentType || 'application/json',
        ...options.header
      },
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
  getNotes: (skip = 0, limit = 20) => request(`/api/notes/?skip=${skip}&limit=${limit}`),
  getNote: (id) => request(`/api/notes/${id}`),
  createNote: (data) => request('/api/notes/', { method: 'POST', data }),
  deleteNote: (id) => request(`/api/notes/${id}`, { method: 'DELETE' }),
  ingestUrl: (url) => request('/api/ingest/url', {
    method: 'POST',
    data: { url },
    contentType: 'application/x-www-form-urlencoded'
  }),
  ingestScreenshots
}
