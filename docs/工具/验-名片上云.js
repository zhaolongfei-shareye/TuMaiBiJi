// 名片与亮度档上云（2.1 第一条）· 行为尺子（静态，不起模拟器、不打网络）。
//
// 这条链要修的是"换手机之后名片那四格是空的"——和 2.0.1 之前卡片那一格同一个根：
// 判据是"这台手机上那个文件在不在"。所以这把尺子盯的是**对齐那一步的六种走法**，
// 全部抽真代码跑（poster.js / cloudUpload.js / profileCloud.js 都是真身，只有 api 与 wx 是替身）：
// ① 地址没变且本机文件还在 → 一次都不许多下载（重下会顶掉画布正在用的那个路径）；
// 2 本机文件没了 → 从云上拉回来、一张一个新名字、fileID 记进本机那份；
// ③ **服务器上还没有这一行** → 一个文件都不许多删（这条写错就是数据丢失，不是显示问题）；
// ④ 读不到 → 本机一份都不动，也不 PUT；
// ⑤ 撤一格 → PUT 里那一格是 null，回体那份 file_ids 真的交给 deleteFile；
// ⑥ 亮度档落下来时不许回写一次（拿刚读到的值再 PUT 回去 = 白跑 + 顶新 updated_at）。
// 跑法：node docs/工具/验-名片上云.js
const path = require('path')

const MP = path.resolve(__dirname, '../../miniprogram')
const DIR = 'http://usr'

const FID_A = 'cloud://env.abc/images/3/20261008/a.jpg'
const FID_B = 'cloud://env.abc/images/3/20261008/b.jpg'
const P_A = `${DIR}/poster-avatar-1-1.img`
const P_B = `${DIR}/poster-avatar-2-2.img`

let store, files, calls, server, apiFail

function makeWx() {
  store = { poster_profile: { name: '赵龙飞', slogan: '一句话', images: [{ path: P_A, card: true, bg: true }] } }
  files = new Set([P_A])
  calls = { download: 0, upload: 0, unlink: 0, deleteFile: [], put: 0, get: 0, setBgDim: 0 }
  return {
    env: { USER_DATA_PATH: DIR },
    getStorageSync: (k) => (k in store ? store[k] : ''),
    setStorageSync: (k, v) => { store[k] = v },
    removeStorageSync: (k) => { delete store[k] },
    getImageInfo: ({ success }) => success && success({ width: 1080, height: 1440 }),
    getFileSystemManager: () => ({
      accessSync: (p) => { if (!files.has(p)) throw new Error('没了') },
      mkdirSync: () => {},
      statSync: () => ({ size: 12345 }),
      unlinkSync: (p) => { calls.unlink += 1; files.delete(p) },
      copyFile: ({ srcPath, destPath, success, fail }) => {
        if (!files.has(srcPath) && srcPath.indexOf('/tmp') < 0 && srcPath.indexOf('usr') < 0) return fail && fail({})
        files.add(destPath); success && success({})
      },
    }),
    cloud: {
      init: () => {},
      uploadFile: ({ cloudPath, success }) => { calls.upload += 1; success && success({ fileID: `cloud://env.abc/${cloudPath}` }) },
      downloadFile: ({ success }) => { calls.download += 1; success && success({ tempFilePath: `${DIR}/dl-${calls.download}.img` }) },
      deleteFile: ({ fileList, success }) => {
        calls.deleteFile = calls.deleteFile.concat(fileList)
        success && success({ fileList: fileList.map((f) => ({ fileID: f, status: 0 })) })
      },
    },
    showToast: () => {}, showModal: () => {},
  }
}

function load() {
  ;['poster.js', 'cloudUpload.js', 'assetPurge.js', 'api.js', 'profileCloud.js'].forEach((f) => {
    delete require.cache[require.resolve(path.join(MP, 'utils', f))]
  })
  global.wx = makeWx()
  const app = {
    globalData: { userId: 3, token: 't' },
    bgDim: () => 1,
    setBgDim: (v) => { calls.setBgDim += 1; store.bgDim = v },
    uiFont: () => 'default',
  }
  global.getApp = () => app
  const api = require(path.join(MP, 'utils/api.js'))
  api.getProfile = async () => {
    calls.get += 1
    if (apiFail) throw { statusCode: 500 }
    return server
  }
  api.putProfile = async (patch) => {
    calls.put += 1
    api._lastPut = patch
    return server._putRes || { profile: Object.assign({ updated_at: '2026-10-08T08:00:00Z' }, patch), file_ids: [] }
  }
  const poster = require(path.join(MP, 'utils/poster.js'))
  const cloud = require(path.join(MP, 'utils/profileCloud.js'))
  return { poster, cloud, api }
}

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}

async function main() {
    // —— ① 地址没变、本机那张还在 ——
    {
      server = { updated_at: '2026-10-01', name: '赵龙飞', slogan: '一句话',
        slots: [{ file_id: FID_A, card: true, bg: true, width: 1080, height: 1440, size: 12345 }, null, null, null] }
      apiFail = false
      const { poster, cloud } = load()
      // 本机这一份带上 fileID ＝ "已经登记过、云上认得这张"那个稳态（bootstrap 或 pushSlots 之后）。
      // 不带 fileID 的那一份会走重下那一条——那是**对的**（服务器权威，且没有别的办法判断本机这张
      // 与云上那张是不是同一张），②那一节量的就是它。
      poster.writeSlots([{ path: P_A, card: true, bg: true, fileID: FID_A }, null, null, null])
      const r = await cloud.pull()
      ck('① 地址没变且本机文件在：一次都不重下', calls.download === 0, `download=${calls.download}`)
      ck('① 本机那张的路径没被换掉（画布正用它）', poster.readSlots()[0].path === P_A, poster.readSlots()[0].path)
      ck('① 对齐成功且认出这是服务器那一份', r.ok && r.server === true)
    }

    // —— ② 本机文件被系统清掉了（这一态就是这次要修的） ——
    {
      server = { updated_at: '2026-10-01', name: '赵龙飞', slogan: '一句话',
        slots: [{ file_id: FID_A, card: true, bg: true }, null, null, null] }
      apiFail = false
      const { poster, cloud } = load()
      files.delete(P_A)                      // 模拟系统清缓存：账还在、文件没了
      const before = poster.readSlots()[0]
      ck('② 前置：文件没了那一格在本机读出来就是空的', !before, JSON.stringify(before))
      const r = await cloud.pull()
      const s = poster.readSlots()[0]
      ck('② 从云上拉回来一格', !!s && calls.download === 1, `download=${calls.download}`)
      ck('② 落成本机一个新名字（同路径换内容是另一坑）', !!s && s.path !== P_A && files.has(s.path), s && s.path)
      ck('② fileID 记回本机这一份（下次不重下）', !!s && s.fileID === FID_A, s && s.fileID)
      ck('② 角色跟着服务器那一份走', !!s && s.card === true && s.bg === true)
      ck('② 这一趟没删任何本机文件之外的东西', r.ok && r.downloaded === 1)
    }

    // —— ③ 服务器上还没有这一行（老用户第一次升 2.1）——
    {
      server = { updated_at: null, name: null, slogan: null, slots: null }
      apiFail = false
      const { poster, cloud } = load()
      const unlinkBefore = calls.unlink
      const r = await cloud.pull()
      ck('③ 一个本机文件都不许多删（这条写错就是数据丢失）', calls.unlink === unlinkBefore, `unlink=${calls.unlink}`)
      ck('③ 那格图还在原位', poster.readSlots()[0] && poster.readSlots()[0].path === P_A)
      ck('③ 改成把本机这份推上去（bootstrap）', r.ok === true && calls.put === 1 && calls.upload === 1,
        `put=${calls.put} upload=${calls.upload}`)
      ck('③ 推上去的那一份带着 file_id 与角色', (() => {
        const p = require(path.join(MP, 'utils/api.js'))._lastPut
        return p && p.slots && p.slots[0] && p.slots[0].file_id && p.slots[0].card === true && p.name === '赵龙飞'
      })(), JSON.stringify(require(path.join(MP, 'utils/api.js'))._lastPut))
      ck('③ 亮度档也一起登记（本机那一档 1）', require(path.join(MP, 'utils/api.js'))._lastPut.bg_dim === 1)
    }

    // —— ④ 读不到 ——
    {
      server = { updated_at: '2026-10-01', slots: [{ file_id: FID_B, card: true, bg: false }] }
      apiFail = true
      const { poster, cloud } = load()
      const r = await cloud.pull()
      ck('④ 读不到时不 PUT、不下载、不删', r.ok === false && calls.put === 0 && calls.download === 0 && calls.unlink === 0)
      ck('④ 本机那一份原样还在', poster.readSlots()[0] && poster.readSlots()[0].path === P_A)
    }

    // —— ⑤ 撤掉一格：PUT 里是 null，回体那份清单真的去删 ——
    {
      server = { updated_at: '2026-10-01', slots: [{ file_id: FID_A, card: true, bg: true }, null, null, null],
        _putRes: { profile: { updated_at: '2026-10-08' }, file_ids: [FID_A] } }
      apiFail = false
      const { poster, cloud } = load()
      await cloud.pull()
      const api = require(path.join(MP, 'utils/api.js'))
      calls.put = 0; calls.deleteFile = []
      await cloud.pushSlots([null, null, null, null])
      ck('⑤ PUT 出去的 slots 四格齐、被撤那格是 null', (() => {
        const s = api._lastPut.slots
        return s.length === 4 && s[0] === null
      })(), JSON.stringify(api._lastPut.slots))
      ck('⑤ 回体里那个旧地址真的交给 deleteFile', calls.deleteFile.indexOf(FID_A) >= 0, JSON.stringify(calls.deleteFile))
    }

    // —— ⑥ 亮度档从服务器上落下来时不许回写 ——
    {
      server = { updated_at: '2026-10-01', name: '甲', slogan: '乙',
        slots: [{ file_id: FID_A, card: true, bg: true }, null, null, null], bg_dim: 0 }
      apiFail = false
      const { cloud } = load()
      await cloud.pull()
      ck('⑥ 亮度档落到本机', calls.setBgDim === 1 && store.bgDim === 0, `setBgDim=${calls.setBgDim}`)
      ck('⑥ 落完之后没有再 PUT 一次（拿刚读到的值写回去是白跑）', calls.put === 0, `put=${calls.put}`)
    }

    // —— ⑦ 换身份：内存那份清了，本机文件一个都不动 ——
    {
      server = { updated_at: '2026-10-01', slots: [{ file_id: FID_A, card: true, bg: true }] }
      apiFail = false
      const { cloud } = load()
      await cloud.pull()
      const unlinkBefore = calls.unlink
      cloud.signOut()
      ck('⑦ 注销之后本机文件一个都不删', calls.unlink === unlinkBefore)
      ck('⑦ 内存里那一份清了（下一个身份不该看见上一个人的名片）', cloud.serverState() === null && !cloud.isLoaded())
    }

    // —— 静态两条：那两条闸一旦被改坏，行为用例红在哪一条不够醒目，这里直接钉源码 ——
    const fs = require('fs')
    const PC = fs.readFileSync(path.join(MP, 'utils/profileCloud.js'), 'utf8')
    const shape = (src) => ({
        keep: /if \(L && L\.fileID === s\.file_id\)/.test(src),
        bootstrapFirst: /if \(!serverHasRow\(\)\) return await bootstrap\(\)/.test(src),
        noThrow: /catch \(e\) \{\s*console\.warn\('名片这一趟没登记上/.test(src),
    })
    const now = shape(PC)
    ck('源码里"同一张就沿用"那一条在（撤掉它＝每次开机重下一遍，还会顶掉画布在用的路径）', now.keep)
    ck('源码里"云上没这一行就先 bootstrap"挡在逐格对齐之前（撤掉它＝把老用户那四张当已删除）', now.bootstrapFirst)
    const m1 = PC.replace('if (L && L.fileID === s.file_id)', 'if (false)')
    const m2 = PC.replace('if (!serverHasRow()) return await bootstrap()', '')
    ck('反向①：把"沿用"改成永不沿用，这条判据会红', !shape(m1).keep)
    ck('反向②：把 bootstrap 那道闸撤掉，这条判据会红', !shape(m2).bootstrapFirst)

    console.log('\n' + (bad.length ? `✗ 红 ${bad.length} 条：${bad.join('、')}` : '全绿'))
  process.exit(bad.length ? 1 : 0)
}

main()
