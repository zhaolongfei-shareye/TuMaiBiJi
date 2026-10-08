// 云上对象"没删成"不许静默漏：待删队列那一条线的判据。
//
// 为什么要有这一把：关于页与提交给微信后台的《用户隐私保护指引》两句都写着
// 「用户删除该条笔记或注销账号时云端那一份一并删除」。而删对象只有客户端这一侧做得成
// （那台自建后端没有云开发凭据），`wx.cloud.deleteFile` 失败又是不抛的——原来有一条真漏法：
// 库里账没了、云上对象还在，占的是全站那 5GB 配额，界面上谁都不记得它，而那句承诺是半句假话。
// 更漏的那一条在 `cloudReady()` 假的时候：一次请求都没发出去，调用方却以为处理过了。
//
// 修法是把"这一趟没删成的那些"落进本机账（utils/assetPurge.js），下次回到前台由 app.onShow 再删一次。
// 这把尺子量的是**行为**（替身 wx.cloud 一路把 success/fail 发完），不是源码里有几个字。
//
// 跑法：node docs/工具/验-云对象待删台账.js
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const PURGE = path.join(ROOT, 'miniprogram/utils/assetPurge.js')
const CLOUD = path.join(ROOT, 'miniprogram/utils/cloudUpload.js')
const APP = path.join(ROOT, 'miniprogram/app.js')

const results = []
const ck = (name, pass, detail) => results.push([name, !!pass, pass ? '' : (detail || '')])

let store = {}
let warns = []
const origSet = (k, v) => { store[k] = v }
const origWarn = console.warn
console.warn = (...a) => { warns.push(a.join(' ')) }
const reset = () => { store = {}; warns = [] }
const ids = (n) => Array.from({ length: n }, (_, i) => `cloud://x/${i}.jpg`)

function installWx(cloud) {
  global.wx = {
    getStorageSync: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : ''),
    setStorageSync: origSet,
    removeStorageSync: (k) => { delete store[k] },
  }
  if (cloud) global.wx.cloud = cloud
}
// 替身要把 success/complete 一路发完——少发一个回调，promise 永挂，node 会静默 exit 0（判据看着全绿）。
const delOK = () => ({ deleteFile: ({ fileList, success }) => success({ fileList: fileList.map((f) => ({ fileID: f, status: 0 })) }) })
const delAllFail = () => ({ deleteFile: ({ fail }) => fail({ errMsg: 'deleteFile:fail network' }) })
const delSomeFail = (badIdx) => ({ deleteFile: ({ fileList, success }) => success({
  fileList: fileList.map((f, i) => ({ fileID: f, status: badIdx.includes(i) ? -1 : 0 })) }) })
const delNoFileList = () => ({ deleteFile: ({ success }) => success({}) })   // 老基础库那种缺字段的回体

function loadCloud(src) {
  const p = path.join(os.tmpdir(), `mut-${Math.random().toString(36).slice(2)}-cloudUpload.js`)
  // 变异体落在临时目录，那句相对 require 得改成绝对路径才找得着同一份 assetPurge
  const body = src.replace("require('./assetPurge.js')", `require(${JSON.stringify(PURGE)})`)
  if (body === src) throw new Error('变异体没改掉那句 require —— 文件头那条规矩变了，这把尺子要跟着改')
  fs.writeFileSync(p, body)
  delete require.cache[PURGE]
  const m = require(p)
  fs.unlinkSync(p)
  return m
}

;(async () => {
  const purge = require(PURGE)
  reset(); installWx(delOK())
  const cu = loadCloud(fs.readFileSync(CLOUD, 'utf8'))
  ck('模块接得上（cloudUpload 导出 flushPurge，assetPurge 导出 take/push/drop）',
    typeof cu.flushPurge === 'function' && typeof purge.take === 'function' && typeof purge.push === 'function' && typeof purge.drop === 'function')

  // 1 全失败
  reset(); installWx(delAllFail())
  ck('① deleteFile 整个 fail → 五条全进台账，返回值仍是 0（不抛）',
    (await cu.deleteFiles(ids(5))) === 0 && purge.take().length === 5, JSON.stringify(purge.take()))

  // 2 部分失败
  reset(); installWx(delSomeFail([1, 3]))
  const n2 = await cu.deleteFiles(ids(5))
  ck('② 五条里两条 status 非 0 → 台账正好那两条、这一趟算删掉三条',
    n2 === 3 && JSON.stringify(purge.take()) === JSON.stringify([ids(5)[1], ids(5)[3]]), `${n2} / ${JSON.stringify(purge.take())}`)

  // 3 回体缺 fileList
  reset(); installWx(delNoFileList())
  const n3 = await cu.deleteFiles(ids(4))
  ck('③ 回体没有 fileList（老基础库形状）→ 整批进台账，不许记成"删掉了"',
    n3 === 0 && purge.take().length === 4, `${n3} / ${purge.take().length}`)

  // 4 云能力不可用
  reset(); installWx(null)
  const n4 = await cu.deleteFiles(ids(3))
  ck('④ 没有 wx.cloud（云能力不可用）→ 三条进台账，不再静默丢掉 ← 原来最大的那个漏法',
    n4 === 0 && purge.take().length === 3, `${n4} / ${purge.take().length}`)

  // 5 去重
  reset(); installWx(delAllFail())
  await cu.deleteFiles(ids(3)); await cu.deleteFiles(ids(3))
  ck('⑤ 同一批号删两次只留三条（按 fileID 去重，不然每次进前台都翻倍）', purge.take().length === 3, purge.take().length)

  // 6 上限
  reset(); installWx(delAllFail())
  await cu.deleteFiles(ids(51))
  ck(`⑥ 队列有上限 ${purge.MAX_QUEUE} 且超限丢最旧（无界会把 storage 撑爆）`,
    purge.take().length === purge.MAX_QUEUE && purge.take()[0] === 'cloud://x/1.jpg' && warns.some((w) => /丢掉最旧/.test(w)),
    `${purge.take().length} 条，头一条 ${purge.take()[0]}`)

  // 7 flushPurge 全成
  reset(); installWx(delAllFail())
  await cu.deleteFiles(ids(4))
  installWx(delOK())
  const f7 = await cu.flushPurge()
  ck('⑦ 下次进前台 flushPurge → 四条全删掉、台账清空、回 4',
    f7 === 4 && purge.take().length === 0, `${f7} / 剩 ${purge.take().length}`)

  // 8 flushPurge 部分成
  reset(); installWx(delAllFail())
  await cu.deleteFiles(ids(4))
  installWx(delSomeFail([0, 2]))
  const f8 = await cu.flushPurge()
  ck('⑧ flushPurge 里两条没成 → 只摘掉成了的那两条，失败那两条留着下次',
    f8 === 2 && purge.take().length === 2, `${f8} / 剩 ${JSON.stringify(purge.take())}`)

  // 9 flushPurge 时云仍不可用
  reset(); installWx(delAllFail())
  await cu.deleteFiles(ids(3))
  installWx(null)
  const f9 = await cu.flushPurge()
  ck('⑨ 云还是不可用 → 台账原样留着（一次都没发的请求不许记成"删过了"）',
    f9 === 0 && purge.take().length === 3, `${f9} / 剩 ${purge.take().length}`)

  // 10 接线：写了得有人调
  const appSrc = fs.readFileSync(APP, 'utf8')
  const q = (appSrc.match(/flushQueues\(\) \{[\s\S]*?\n  \},/) || [''])[0]
  ck('⑩ 待删这一头真有人调，且闸门只写一处（flushQueues 开头一句 isLoggedIn 判定）',
    /cloudUpload\.flushPurge\(\)/.test(q) && /if \(!this\.globalData\.isLoggedIn\) return/.test(q),
    q ? '' : 'flushQueues 那段没匹配到')
  // 10b 两个时机都得叫它：冷启动那次 onShow 早于登录回来，只挂 onShow 等于第一趟一个都不补
  const shown = (appSrc.match(/onShow\(options\) \{[\s\S]*?\n  \},/) || [''])[0]
  const login = (appSrc.match(/async _doLogin\(\) \{[\s\S]*?\n  \},/) || [''])[0]
  ck('⑩b 回前台与刚登录两处都调（原来只挂 onShow，冷启动那一趟一头都不补）',
    /this\.flushQueues\(\)/.test(shown) && /this\.flushQueues\(\)/.test(login))

  // 11 接线：三个调用方仍走同一条路
  const dropRes = (fs.readFileSync(CLOUD, 'utf8').match(/function dropFromDeleteRes[\s\S]*?\n}/) || [''])[0]
  ck('⑪ 删笔记／注销那三个调用方吃的仍是同一个 dropFromDeleteRes → deleteFiles（不各写一份）',
    /deleteFiles\(ids\)/.test(dropRes) && /file_ids/.test(dropRes), dropRes.slice(0, 60))

  // 12 注销不许清这一叠
  const clearFn = (appSrc.match(/clearSession\(\) \{[\s\S]*?\n  \},/) || [''])[0]
  ck('⑫ 注销 clearSession 里**没有**清待删队列（注销正是往这里塞东西的一方）',
    clearFn.length > 0 && !/assetPurge/.test(clearFn) && !/pendingCloudPurge/.test(clearFn), clearFn.slice(0, 80))

  // 反向①：摘掉"部分失败要落账"那一行 → 判据②必须红
  const mut1 = fs.readFileSync(CLOUD, 'utf8').replace('if (r.failed.length) purge.push(r.failed)', 'if (false) purge.push(r.failed)')
  reset(); installWx(delSomeFail([1, 3]))
  const cu1 = loadCloud(mut1)
  await cu1.deleteFiles(ids(5))
  ck('反向① 把"失败那几条落账"摘掉 → ② 那条必须红（不然这把尺子是恒真式）', purge.take().length === 0, purge.take().length)

  // 反向②：把云不可用那条短路改回原样（直接 return 0）→ 判据④必须红
  const mut2 = fs.readFileSync(CLOUD, 'utf8')
    .replace('  if (!cloudReady()) {\n    purge.push(ids)', '  if (!cloudReady()) {\n    void purge')
  reset(); installWx(null)
  const cu2 = loadCloud(mut2)
  await cu2.deleteFiles(ids(3))
  ck('反向② 把"云不可用也落账"改回原来那句直接 return → ④ 那条必须红', purge.take().length === 0, purge.take().length)

  console.warn = origWarn
  let n = 0
  for (const [name, pass, detail] of results) {
    console.log(`${pass ? '✓' : '✗'} ${name}${pass || !detail ? '' : `　→ ${detail}`}`)
    if (!pass) n++
  }
  console.log(`${results.length} 条，红 ${n} 条`)
  process.exit(n ? 1 : 0)
})().catch((e) => { console.warn = origWarn; console.error('尺子自己炸了：', e && e.stack || e); process.exit(1) })

// 看门狗：替身少发一个回调 → promise 永挂 → node 静默 exit 0、上面全绿而其实没跑完。跑不完必须是红。
const watchdog = setTimeout(() => {
  console.log('\n✗ 没跑完（有替身没把回调发完，promise 永挂 → node 会静默 exit 0，这条就是防它）')
  process.exit(1)
}, 30000)
process.on('exit', () => clearTimeout(watchdog))
