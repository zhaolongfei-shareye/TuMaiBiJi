// 名片与外观档位上云那一条链（2.1 第一条）。
//
// 一句话：**换手机或重置手机之后，名片那四格图不该是空的。**
// 2.0.1 之前卡片那一格是同一个毛病（图只在本机、判据是"文件在不在"），S2 已经把它根治在
// `note_cards` 上；这一份是同一做法搬到"人"这一层——权威在服务器 `user_profiles` 那一行，
// 本机那四张 `.img` 降级成**缓存**：在就直接用（画布读本机路径，零改动），不在就从云上拉回来。
//
// 与 `cardCloud.js` 三条一样的纪律：
// · **全程不抛**。名片是附属品，读不到就维持本机那一份，不许把主流程带回错误提示。
// · 换下来的旧对象由回体 `file_ids` 交给 `cloudUpload.dropFromDeleteRes`——服务器删不掉它们。
// · 换身份／注销之后 `signOut()` 必须清内存那份，留着就是上一个人的名片画到这个人头上。
//
// ⚠ 一条与卡片不同的地方，也是最容易写出数据丢失的一条：**"云上没这一行"≠"云上四格都是空的"**。
// 老用户本机有图而服务器一行都还没有，这时候照"服务器权威"办就会把他那四张当"已删除"跟着删掉。
// 所以整个模块只认一个判据：`GET` 回体的 `updated_at` 是不是 null（见 utils/api.js 那条注释）。
const api = require('./api.js')
const cloudUpload = require('./cloudUpload.js')
const poster = require('./poster.js')

// 名片图放哪一层前缀。⚠ 复用已经量过的 `images` 那一层，**不自开 `profile/` 前缀**：
// 桶权限完全可能是按前缀给的，而这条链按设计不报错，写不进的症状是"每张都静默没上云"。
// 要单开一层，先跑 `APREFIX=profile zsh docs/工具/跑尺子.sh 9431 探-云存储可写` 量过再改这一栏。
const PROFILE_KIND = 'images'

const _bytes = (p) => {
  try {
    const s = wx.getFileSystemManager().statSync(p)
    const n = s && (s.size != null ? s.size : s.stats && s.stats.size)
    return Number.isFinite(Number(n)) ? Number(n) : null
  } catch (e) {
    return null
  }
}

const _dims = (p) => new Promise((resolve) => {
  wx.getImageInfo({ src: p, success: (r) => resolve({ width: r.width, height: r.height }), fail: () => resolve({}) })
})

const _download = (fileID) => new Promise((resolve) => {
  if (!cloudUpload.cloudReady() || !fileID) return resolve(null)
  wx.cloud.downloadFile({
    fileID,
    success: (r) => resolve((r && r.tempFilePath) || null),
    fail: (e) => {
      console.warn('名片那格的对象没拉下来（界面维持本机那一份）:', (e && e.errMsg) || e)
      resolve(null)
    },
  })
})

/** 把一张本机的图传上云，回 fileID（传不成回 null，不抛）。 */
async function _upload(path) {
  const userId = getApp().globalData.userId
  if (!userId || !path) return null
  const up = await cloudUpload.uploadImage(path, userId, PROFILE_KIND)
  return (up && up.fileID) || null
}

// ---------- 读的那一半 ----------

let serverProfile = null
let serverLoaded = false

function setServer(data) {
  serverProfile = data || null
  serverLoaded = true
}

function clearServer() {
  serverProfile = null
  serverLoaded = false
}

/** 服务器上有没有这一行。没有＝这个人从没登记过，此时本机那份才是唯一的一份。 */
function serverHasRow() {
  return !!(serverProfile && serverProfile.updated_at)
}

function isLoaded() {
  return serverLoaded
}

function serverState() {
  return serverProfile
}

/**
 * 从服务器读那一份，并把本机对齐过去。返回一句发生了什么，只用来记日志与给测试钉判据，
 * 不用来改界面（界面照旧读 `poster.readSlots()`，本机文件在不在决定画哪一张）。
 *
 * 三种情况，走法完全不同：
 * 1. **读不到**（网络、401）→ 什么都不动，本机那一份照用。这一趟不许出声。
 * 2. **服务器上没这一行** → 这是老用户第一次升到 2.1：本机那四张是唯一的一份，
 *    于是反过来把本机这份推上去（登记）。**绝不许删本机任何一张**。
 * 3. **服务器有这一行** → 服务器权威，逐格对齐：地址没变且本机文件还在就沿用（不重下、不花钱），
 *    地址变了就拉新的并收回旧那张占的地方，云上这一格是空的就把本机这一格也撤掉。
 */
async function pull() {
  let r
  try {
    r = await api.getProfile()
  } catch (e) {
    console.warn('名片那一份没读到（维持本机这份）', e && (e.errMsg || e.statusCode))
    return { ok: false, reason: 'read' }
  }
  setServer(r || null)
  if (!r) return { ok: false, reason: 'empty' }
  if (!serverHasRow()) return await bootstrap()

  const local = poster.readSlots()          // 已经按"本机文件在不在"滤过：不在的那格是 null
  const byId = {}
  local.forEach((s) => { if (s && s.fileID) byId[s.fileID] = s })

  const remote = (Array.isArray(r.slots) ? r.slots : []).slice(0, poster.SLOT_COUNT)
  const next = poster.blankSlots()
  const removed = []
  let downloaded = 0
  let failed = 0

  for (let i = 0; i < poster.SLOT_COUNT; i++) {
    const s = remote[i]
    const L = local[i]
    if (!s || !s.file_id) {
      // 云上这一格是空的：本机这一格跟着撤（旧对象不在清单里——它本来就是被这一格引用的那张）
      if (L) { removed.push(L.path); next[i] = null }
      continue
    }
    if (L && L.fileID === s.file_id) {
      next[i] = { path: L.path, card: !!s.card, bg: !!s.bg, fileID: s.file_id }
      continue
    }
    const tmp = await _download(s.file_id)
    if (!tmp) {
      failed += 1
      // 拉不下来时本机那张还在就照画它：宁可画一张"云上已经换掉的旧图"，
      // 也不许把这一格画成空的——空的会让人以为名片丢了。
      next[i] = L ? { path: L.path, card: !!s.card, bg: !!s.bg, fileID: L.fileID || null } : null
      continue
    }
    const path = await poster.adoptLocal(tmp)
    if (!path) {
      failed += 1
      next[i] = L ? { path: L.path, card: !!s.card, bg: !!s.bg, fileID: L.fileID || null } : null
      continue
    }
    downloaded += 1
    if (L) removed.push(L.path)   // 换了一张：旧那份占着本机 10MB，收掉
    next[i] = { path, card: !!s.card, bg: !!s.bg, fileID: s.file_id }
  }

  poster.writeSlots(next)
  // 名称/一句话：服务器有这一行就以它为准（空就是空，本机那份是旧的那一档）。
  // 模板那一栏反过来判：null 是「没登记过」，不是「回到默认」——清成默认会让人莫名其妙换了套皮。
  poster.writeProfile({ name: r.name || '', slogan: r.slogan || '' })
  if (r.tpl) poster.writeProfile({ template: r.tpl })
  removed.forEach((p) => poster.removeAvatar(p))
  // 那两档外观：读回来有值才落本机（null 是"没登记过这一档"，不是"要清成默认"）
  const app = getApp()
  // 读回来有值才落本机（null 是"没登记过这一档"，不是"要清成默认"）
  if (app && r.bg_dim !== null && r.bg_dim !== undefined) app.setBgDim(r.bg_dim)
  return { ok: true, server: true, downloaded, failed, removed: removed.length }
}

/**
 * 服务器上还没有这一行：把本机这一份推上去（老用户升 2.1 的那一趟）。
 * 一张本机图都没有、名称与一句话也都没填过 → 什么都不做，也不建那一行
 * （建一行全空等于替他宣布"我名片是空的"，之后换手机就没有对照了）。
 */
async function bootstrap() {
  const p = poster.readProfile()
  const local = poster.readSlots()
  const slots = []
  let uploaded = 0
  for (const s of local) {
    if (!s) { slots.push(null); continue }
    let fileID = s.fileID
    if (!fileID) {
      fileID = await _upload(s.path)
      if (fileID) uploaded += 1
    }
    slots.push({ file_id: fileID || null, card: !!s.card, bg: !!s.bg,
      width: null, height: null, size: fileID ? _bytes(s.path) : null })
  }
  const body = { slots }
  if (p.template) body.tpl = p.template
  if (p.name) body.name = p.name
  if (p.slogan) body.slogan = p.slogan
  const app = getApp()
  if (app && typeof app.bgDim === 'function') body.bg_dim = app.bgDim()
  const hasAnything = local.some(Boolean) || p.name || p.slogan
  if (!hasAnything) return { ok: false, reason: 'nothing-local' }
  return push(body, { bootstrap: true, uploaded })
}

// ---------- 写的那一半 ----------

/**
 * 把一份补丁送到服务器，并把回体里"被换下／撤掉"的旧对象删掉。
 * @param {object} patch 只带要改的那几栏（服务端是补丁语义）
 */
function push(patch, meta) {
  if (!patch || !Object.keys(patch).length) return Promise.resolve({ ok: false, reason: 'empty' })
  return _push(patch, meta)
}

async function _push(patch, meta) {
  try {
    const res = await api.putProfile(patch)
    setServer(Object.assign({}, serverProfile || {}, res && res.profile ? res.profile : patch,
      { updated_at: (res && res.profile && res.profile.updated_at) || new Date().toISOString() }))
    serverLoaded = true
    const dropped = await cloudUpload.dropFromDeleteRes(res)
    return Object.assign({ ok: true, dropped }, meta || {})
  } catch (e) {
    console.warn('名片这一趟没登记上（界面上还是本机那份）', e && (e.errMsg || e.statusCode))
    return Object.assign({ ok: false, reason: 'write' }, meta || {})
  }
}

/**
 * 四格变了（放一张／换一张／撤掉一格／勾角色）：先把还没有 fileID 的本机图传上云，
 * 再整份 PUT 那四格。**先传后写、写成了才删旧**——反过来会留孤儿，
 * 而孤儿占的是全站那 5GB，且只有客户端删得动。
 */
async function pushSlots(slots) {
  const local = (slots || []).slice()
  const out = []
  let uploaded = 0
  for (let i = 0; i < local.length; i++) {
    const s = local[i]
    if (!s) { out.push(null); continue }
    let fileID = s.fileID
    if (!fileID && s.path) {
      fileID = await _upload(s.path)
      if (fileID) uploaded += 1
    }
    const d = fileID ? await _dims(s.path) : {}
    out.push({ file_id: fileID || null, card: !!s.card, bg: !!s.bg,
      width: d.width || null, height: d.height || null, size: fileID ? _bytes(s.path) : null })
    if (fileID && !s.fileID) local[i] = Object.assign({}, s, { fileID })
  }
  // 新拿到的 fileID 记回本机这一份：不记的话下一次 pull 认不出"云上这一格就是本机这张"，
  // 会白下一遍，而落下来的新文件会顶掉画布正在用的那个路径。
  if (uploaded) poster.writeSlots(local)
  return push({ slots: out }, { uploaded })
}

/** 名称／一句话／选的那一套模板（卡片模板那一页保存时调）。 */
function pushText(patch) {
  const body = { name: patch.name || '', slogan: patch.slogan || '' }
  if (patch.template) body.tpl = patch.template
  return push(body)
}

/** 亮度档：改一档就顺手登记一次（不弹窗、不出声，失败维持本机）。
 * 字体档**不在这条链上**：`app.js` 顶上那段写着安卓命不中那三档字体，跟着账号跑到别人
 * 设备上只会让人看到"没生效"。那不是丢东西，是那台设备本来就没这个能力。 */
function pushDim(v) { return push({ bg_dim: v }) }

/** 换身份／注销之后由 app.clearSession 调：内存那份与待补都清，本机文件一份都不动。 */
function signOut() {
  clearServer()
}

module.exports = {
  PROFILE_KIND,
  pull, bootstrap, push, pushSlots, pushText, pushDim,
  setServer, clearServer, serverHasRow, serverState, isLoaded, signOut,
}
