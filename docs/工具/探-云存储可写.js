/**
 * 一次性探针（不是尺子）：云开发存储那一侧，客户端真写得进去、真删得掉吗？
 *
 * 为什么先跑这个再给你预览码：B 链的设计是"上传失败不阻断存笔记"，所有失败都只 console.warn。
 * 也就是说如果那个环境的存储没开通／权限不让客户端写，你真机上点保存会**看起来全对**——
 * 笔记存下来了，图一张没有，界面上没有任何一处会报错。这种半成品不该让你拿手机去撞。
 *
 * 它只碰云存储那一个对象：自己 writeFile 一张小文本 → uploadFile → deleteFile，
 * 一行数据库都不写、一篇笔记都不建（所以不会在你账号 id=3 上留下任何东西）。
 *
 * 跑法（IDE 得先带 auto 端口起来）：
 *   NODE_PATH=$HOME/.mpauto/node_modules node /tmp/probe-cloud-storage.js
 */
const fs = require('fs')
const path = require('path')
const automator = require('miniprogram-automator')

const ROOT = '/Users/zlfmac/Documents/TuMaiBiJi'
const src = fs.readFileSync(path.join(ROOT, 'miniprogram/utils/cloudUpload.js'), 'utf8')
const m = src.match(/^const CLOUD_ENV = '([^']+)'/m)
if (!m) {
  console.log('✗ 从源码里读不到 CLOUD_ENV（判据前置就红了，不是环境红）')
  process.exit(1)
}
const ENV = m[1]
const rand = Math.random().toString(36).slice(2, 8)
const CLOUD_PATH = `images/zzprobe/${new Date().toISOString().slice(0, 10).replace(/-/g, '')}/probe-${rand}.txt`
console.log(`现读 CLOUD_ENV=${ENV}  cloudPath=${CLOUD_PATH}`)

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9431' })
  const out = await mp.evaluate((d) => {
    return new Promise((resolve) => {
      const steps = { init: null, write: null, upload: null, remove: null }
      const localPath = `${wx.env.USER_DATA_PATH}/${d.fileName}`
      let fsMgr
      try {
        wx.cloud.init({ env: d.env, traceUser: false })
        steps.init = 'ok'
      } catch (e) {
        return resolve({ steps, err: 'init:' + ((e && e.message) || e) })
      }
      try {
        fsMgr = wx.getFileSystemManager()
        fsMgr.writeFileSync(localPath, 'tumaiji cloud storage selfcheck ' + d.cloudPath, 'utf8')
        steps.write = 'ok'
      } catch (e) {
        return resolve({ steps, err: 'write:' + ((e && e.errMsg) || e) })
      }
      wx.cloud.uploadFile({
        cloudPath: d.cloudPath,
        filePath: localPath,
        success: (r) => {
          steps.upload = { fileID: r.fileID }
          wx.cloud.deleteFile({
            fileList: [r.fileID],
            success: (d2) => {
              steps.remove = d2.fileList
              resolve({ steps, env: d.env })
            },
            fail: (e2) => resolve({ steps, err: 'delete:' + ((e2 && e2.errMsg) || e2) }),
          })
        },
        fail: (e) => resolve({ steps, err: 'upload:' + ((e && e.errMsg) || e) }),
      })
    })
  }, { env: ENV, cloudPath: CLOUD_PATH, fileName: `probe-${rand}.txt` })
  console.log(JSON.stringify(out, null, 2))
  const s = (out && out.steps) || {}
  const ok = s.init === 'ok' && s.write === 'ok' && s.upload && s.upload.fileID && s.remove
  console.log(ok ? '✓ 客户端在这一侧写得进去也删得掉' : `✗ 这一侧不通：${out && out.err}`)
  await mp.close()
  process.exit(ok ? 0 : 1)
})().catch((e) => {
  console.log('✗ 探针自己崩了：' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e))
  process.exit(2)
})
