// 「编辑提炼后的笔记，可以再补传新图（仍然 9 张，要过审）」的**真跑**尺子。
// 跑法：docs/工具/跑尺子.sh 9431 验-编辑补传配图-真跑
//
// 静态那把（`验-编辑补传配图.js`）钉的是**代码形状**；这一把钉的是**屏上那一半**：
// 编辑那一屏真的画得出补图那一枚、点了真的开选图、能选几张＝还剩几格、
// 满了会说话、没过审的那一张**不上云不登记**、过了审的**上云并登记**、
// 登记失败的两条路各自走对（4xx 删干净、5xx 进待补队列）。
//
// 需求原话（站长 11-08 第 2 条）：「提炼笔记后，再编辑笔记，支持上传新的图片，仍然是 9 张，要过审。」
//
// ⚠ 先把一件事说清楚，不然这把尺子会骗人：**这一条链上服务端没有内容安全闸**。
//   补图的字节是"客户端直传云存储"，服务端那个绑图的口（POST /api/notes/{id}/assets）
//   只收 file_id，压根读不到那张图（后端没有云开发凭据）。真正跑微信内容安全的那道闸
//   （`enforce_image_safety`）在**录入提交**那条链上（ingest_tasks.py），不在这一条上。
//   ⇒ 「要过审」在这一条上**只能**落在客户端：`api.checkShot`（服务端真跑微信 msgSecCheck，
//     回 pass/risky/unavailable 三态），微信明确判 risky 的那一张**不上云、不登记**。
//   这一把量的就是这条客户端闸：risky 那一张走完一趟，**云上传 0 次、登记 0 次**。
//
// ⚠ 这一把**不往现网写一行**：
//   · `wx.chooseMedia`／`wx.showToast`／`wx.uploadFile`（送检那一趟）／
//     `wx.cloud.uploadFile`／`wx.cloud.deleteFile`／`wx.request`（只拦绑图那一个口）
//     全部在 app 上下文里打桩，桩完还原；
//   · 打桩的那张图是写进本机 USER_DATA_PATH 的 1×1 占位张（选图那一趟要一条能读尺寸的路径）；
//   · 唯一真打到服务端的是读（笔记／分类／那一篇现有配图）。
//   ⇒ 登记那一趟的成败由桩自己回（200／400／500），现网那篇笔记的配图行一个字节没动。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const SRC_VERSION = /const VERSION = '([\d.]+)'/.exec(
  fs.readFileSync(P('utils/appInfo.js'), 'utf8'))[1]
// 期望值一律从本仓那份字典现取，不写死中文字面量（界面语言一换就报假红）。
const { texts } = require(P('utils/i18n.js'))
const T = texts('zh')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitFor = async (fn, ms = 20000, step = 300) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    let v = null
    try { v = await fn() } catch (e) { v = null }
    if (v) return v
    await sleep(step)
  }
  return null
}
// 补图那一枚在那一屏的第六栏，多半在折叠线以下 ⇒ 点之前先把它滚进可视区。
// automator 的 tap 落在节点的屏幕位置上，节点在屏外就点不到（那不是产品红，是尺子没到位）。
// ⚠ `mp` 是 connect() 那个回调里的形参，模块层看不见 ⇒ 这里**必须**由调用方传进来
//   （模块层直接写 mp 会 ReferenceError：mp is not defined）。
const ensureVisible = async (mp) => {
  const r = await mp.evaluate(() => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    q.select('.wr-shot-add').boundingClientRect()
    q.exec((res) => {
      const rect = res && res[0]
      let h = 0
      try { h = wx.getWindowInfo().windowHeight } catch (e) { h = 0 }
      resolve(rect ? { top: rect.top, bottom: rect.bottom, h } : null)
    })
  }))
  if (r && r.h && (r.top < 0 || r.bottom > r.h)) {
    await mp.callWxMethod('pageScrollTo', { scrollTop: Math.max(0, r.top - 80), duration: 0 })
    await sleep(700)
  }
  return r
}

// 1×1 的真 JPEG（占位张）：选图那一趟要给一条能读出尺寸的路径，否则压图那一趟直接退成原图。
const JPG_1PX = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=='

automator.connect({ wsEndpoint: 'ws://localhost:9431' }).then(async (mp) => {
  let wp = null
  let noteId = 0
  let realShots = []
  let queueBefore = null
  let installed = false

  // ---- 打桩（在 app 上下文里装，桩完还原）----
  const install = () => mp.evaluate((b64) => {
    const app = getApp()
    const S = {
      orig: {
        request: wx.request,
        uploadFile: wx.uploadFile,
        chooseMedia: wx.chooseMedia,
        showToast: wx.showToast,
        cloudUpload: wx.cloud && wx.cloud.uploadFile,
        cloudDelete: wx.cloud && wx.cloud.deleteFile,
      },
      pickMode: 'none',     // none=不回调（当用户没选）／one=回调一张／cancel=回调失败
      verdict: 'pass',       // 送检那一趟回什么
      bindStatus: 0,         // 0=放行到真服务端；200/400/500=桩自己回
      bindDetail: '',
      calls: { choose: [], upload: [], cloud: [], del: [], req: [] },
      toasts: [],
      imgPath: '',
    }
    app.globalData.__ruler423 = S
    try {
      const fsx = wx.getFileSystemManager()
      const p = `${wx.env.USER_DATA_PATH}/ruler423-shot.jpg`
      fsx.writeFileSync(p, b64, 'base64')
      S.imgPath = p
    } catch (e) { S.imgPath = '' }

    wx.chooseMedia = function (o) {
      const S2 = getApp().globalData.__ruler423
      S2.calls.choose.push({
        count: o && o.count, mediaType: o && o.mediaType, sourceType: o && o.sourceType,
      })
      const mode = S2.pickMode
      if (mode === 'one' && S2.imgPath) {
        setTimeout(() => {
          o && o.success && o.success({
            tempFiles: [{ tempFilePath: S2.imgPath, size: 128 }],
            tempFilePaths: [S2.imgPath],
          })
        }, 0)
        return
      }
      if (mode === 'cancel') {
        setTimeout(() => o && o.fail && o.fail({ errMsg: 'chooseMedia:fail cancel' }), 0)
      }
      // none ⇒ 什么都不做（模拟用户还没挑完）
    }

    wx.showToast = function (o) {
      const S2 = getApp().globalData.__ruler423
      S2.toasts.push({ title: String((o && o.title) || ''), icon: o && o.icon })
      return S2.orig.showToast.apply(wx, arguments)
    }

    // 送检那一趟（api.checkShot → uploadSingleImage → wx.uploadFile）
    wx.uploadFile = function (o) {
      const S2 = getApp().globalData.__ruler423
      const url = String((o && o.url) || '')
      if (url.indexOf('/api/ingest/screenshots/check') >= 0) {
        S2.calls.upload.push({ url, filePath: o && o.filePath, verdict: S2.verdict })
        setTimeout(() => {
          o && o.success && o.success({ statusCode: 200, data: JSON.stringify({ verdict: S2.verdict }) })
        }, 0)
        return
      }
      return S2.orig.uploadFile.apply(wx, arguments)
    }

    if (wx.cloud) {
      wx.cloud.uploadFile = function (o) {
        const S2 = getApp().globalData.__ruler423
        S2.calls.cloud.push({ cloudPath: o && o.cloudPath, filePath: o && o.filePath })
        const fileID = `cloud://ruler423/fake-${S2.calls.cloud.length}.jpg`
        setTimeout(() => o && o.success && o.success({ fileID }), 0)
      }
      wx.cloud.deleteFile = function (o) {
        const S2 = getApp().globalData.__ruler423
        const list = ((o && o.fileList) || []).slice()
        S2.calls.del.push(list)
        setTimeout(() => {
          o && o.success && o.success({ fileList: list.map((id) => ({ fileID: id, status: 0 })) })
        }, 0)
      }
    }

    wx.request = function (o) {
      const S2 = getApp().globalData.__ruler423
      const url = String((o && o.url) || '')
      const method = String((o && o.method) || 'GET')
      const isBind = method === 'POST' && /\/api\/notes\/\d+\/assets$/.test(url)
      S2.calls.req.push({ url, method, data: o && o.data, bind: isBind })
      if (isBind && S2.bindStatus) {
        const st = S2.bindStatus
        setTimeout(() => {
          if (st >= 200 && st < 300) o.success && o.success({ statusCode: st, data: [] })
          else o.success && o.success({ statusCode: st, data: { detail: S2.bindDetail } })
        }, 0)
        return
      }
      return S2.orig.request.apply(wx, arguments)
    }
    return { ok: true, imgPath: S.imgPath, hasCloud: !!wx.cloud }
  }, JPG_1PX)

  const setCfg = (o) => mp.evaluate((c) => {
    Object.assign(getApp().globalData.__ruler423, c)
    return true
  }, o)

  const resetCalls = () => mp.evaluate(() => {
    const S = getApp().globalData.__ruler423
    S.calls = { choose: [], upload: [], cloud: [], del: [], req: [] }
    S.toasts = []
    return true
  })

  const st = () => mp.evaluate(() => {
    const S = getApp().globalData.__ruler423
    let queue = []
    try {
      const q = wx.getStorageSync('pendingNoteAssets')
      queue = Array.isArray(q) ? q : []
    } catch (e) { queue = [] }
    return {
      toasts: (S.toasts || []).map((t) => t.title),
      choose: S.calls.choose || [],
      upload: S.calls.upload || [],
      cloud: S.calls.cloud || [],
      del: S.calls.del || [],
      binds: (S.calls.req || []).filter((r) => r.bind),
      queue,
    }
  })

  const restore = () => mp.evaluate(() => {
    const app = getApp()
    const S = app.globalData.__ruler423
    if (!S) return false
    try {
      wx.request = S.orig.request
      wx.uploadFile = S.orig.uploadFile
      wx.chooseMedia = S.orig.chooseMedia
      wx.showToast = S.orig.showToast
      if (wx.cloud) {
        wx.cloud.uploadFile = S.orig.cloudUpload
        wx.cloud.deleteFile = S.orig.cloudDelete
      }
      if (S.imgPath) {
        try { wx.getFileSystemManager().unlinkSync(S.imgPath) } catch (e) { /* 本来就没有 */ }
      }
    } catch (e) { /* 还原失败不影响判红，但要说出来 */ }
    delete app.globalData.__ruler423
    return true
  })

  try {
    /* ---------- ① 连的是不是这一条线、这一号的包 ---------- */
    const meP = await mp.switchTab('/pages/me/me')
    await sleep(1800)
    const shown = (await meP.data()).version
    ck('① IDE 里开的是这一条线这一号的包（屏上 version ＝ 源码 VERSION）',
      String(shown) === SRC_VERSION, `屏上 v${shown}／源码 v${SRC_VERSION}`)
    if (String(shown) !== SRC_VERSION) throw new Error('版本对不上，后面量到的都是别人的包')

    /* ---------- ② 找一篇可量的笔记（非私密：私密篇要过解锁那一层） ---------- */
    await mp.switchTab('/pages/index/index')
    const ip = await mp.currentPage()
    await ip.waitFor(1800)
    const notes = (await ip.data()).notes || []
    ck('② 列表读得到笔记（这一把要挑一篇进编辑态）', notes.length >= 1, `${notes.length} 篇`)
    const target = notes.find((n) => n && !n.is_private)
    if (!target) throw new Error('没有可量的笔记（全是私密篇，这一把量不了）')
    noteId = target.id
    ck('② 挑到的那一篇不是私密篇（私密篇要过解锁那一层）', !!target, `note ${noteId}`)

    /* ---------- ③ 装桩 ---------- */
    const ins = await install()
    installed = !!ins.ok
    ck('③ 桩装上了（选图／送检／上云／删对象／绑图／吐司）', installed, ins && ins.ok ? '装上了' : '没装上')
    if (!installed) throw new Error('桩没装上，后面量不了')
    ck('③ 云开发在这一台模拟器里可用（cloud:// 的地址画不出来时补图那一枚点不动）',
      !!ins.hasCloud, ins.hasCloud ? 'wx.cloud 在' : 'wx.cloud 不在')

    queueBefore = (await st()).queue

    /* ---------- ④ 进编辑那一屏：补图那一枚在不在 ---------- */
    await mp.reLaunch(`/pages/write/write?id=${noteId}&mode=edit`)
    wp = await mp.currentPage()
    await wp.waitFor(2500)
    const d0 = await wp.data()
    ck('④ 进的是编辑态（isEdit 翻真、认得这一篇）',
      d0.isEdit === true && Number(d0.noteId) === Number(noteId),
      `isEdit=${d0.isEdit}／noteId=${d0.noteId}`)
    ck('④ 这一篇现有几张读回来了（没读回来就不许开选图）',
      d0.shotsLoaded === true, `shotsLoaded=${d0.shotsLoaded}／现有 ${(d0.shots || []).length} 张`)
    realShots = d0.shots || []
    ck('④ 张数上限吃的是那一枚常量（屏上 9）',
      Number(d0.maxShots) === 9, `maxShots=${d0.maxShots}`)

    // 界面语言：这一把拿仓库那份字典当期望值，所以屏上必须是中文（跑尺子.sh 负责钉）
    const tNow = d0.t || {}
    ck('④ 屏上语言是中文（期望值取自仓库那份字典）',
      String(tNow.addShot || '') === T.addShot, `屏上「${tNow.addShot}」／字典「${T.addShot}」`)
    if (String(tNow.addShot || '') !== T.addShot) throw new Error('屏上语言不是中文，期望值取不到')

    const addTile = await wp.$('.wr-shot-add')
    ck('④ 补图那一枚（➕）在屏上', !!addTile)
    if (!addTile) throw new Error('补图那一枚没画出来，后面量不了')
    const aria = await addTile.attribute('aria-label')
    ck('④ 它那一枚的名字走字典（不是写死的中文）',
      String(aria || '') === T.addShot, `屏上「${aria}」／字典「${T.addShot}」`)
    ck('④ 配图那一排在屏上（这一栏画得出来）', !!(await wp.$('.wr-shots')))

    /* ---------- ⑤ 点它开选图，能选几张＝还剩几格 ---------- */
    await resetCalls()
    await setCfg({ pickMode: 'none' })
    await ensureVisible(mp)
    await addTile.tap()
    let s = await waitFor(async () => {
      const x = await st()
      return x.choose.length ? x : null
    }, 8000)
    ck('⑤ 点它真的开了系统选择器（屏上那一枚是通的）', !!s,
      s ? `count=${s.choose[0].count}` : '没调到 chooseMedia')
    if (s) {
      ck('⑤ 能选几张＝还剩几格（不是写死 9）',
        Number(s.choose[0].count) === 9 - realShots.length,
        `count=${s.choose[0].count}／还剩 ${9 - realShots.length}`)
      ck('⑤ 只准选图片', Array.isArray(s.choose[0].mediaType) && s.choose[0].mediaType.indexOf('image') >= 0,
        JSON.stringify(s.choose[0].mediaType))
    }

    // ⚠ 上面那条可能"恰好相等"（一篇没图的笔记，还剩几格正好＝9），所以再钉一条**能分辨的**：
    //   屏上摆三张（假的），还剩几格应当变成 6 —— 若 count 是写死的 9，这一格就红。
    const fake3 = [1, 2, 3].map((i) => ({ id: 90000 + i, cloud_url: `cloud://ruler423/fake-${i}.jpg` }))
    await wp.setData({ shots: fake3 })
    await sleep(700)
    await resetCalls()
    await setCfg({ pickMode: 'none' })
    await ensureVisible(mp)
    await addTile.tap()
    s = await waitFor(async () => {
      const x = await st()
      return x.choose.length ? x : null
    }, 8000)
    ck('⑤ 屏上现有三张时，还剩几格真的变成 6（不是写死的 9）',
      !!s && Number(s.choose[0].count) === 6, s ? `count=${s.choose[0].count}` : '没调到 chooseMedia')
    await wp.setData({ shots: realShots })
    await sleep(500)

    /* ---------- ⑥ 满了：先给一句带那个数的话，不许静默截掉 ---------- */
    const fake9 = []
    for (let i = 0; i < 9; i += 1) fake9.push({ id: 91000 + i, cloud_url: `cloud://ruler423/f9-${i}.jpg` })
    await wp.setData({ shots: fake9 })
    await sleep(700)
    await resetCalls()
    await setCfg({ pickMode: 'one' })
    await ensureVisible(mp)
    await addTile.tap()
    await sleep(1200)
    s = await st()
    ck('⑥ 满了的时候不开选图（静默截掉＝选了 12 张只留 9 张而界面一句都不说）',
      s.choose.length === 0, `chooseMedia 调了 ${s.choose.length} 次`)
    ck('⑥ 并且当场说了那句话（话里带那个数）',
      s.toasts.indexOf(T.maxShots.replace('{n}', '9')) >= 0,
      `吐司「${s.toasts.join('｜')}」／要念「${T.maxShots.replace('{n}', '9')}」`)
    await wp.setData({ shots: realShots })
    await sleep(500)

    /* ---------- ⑦ 没过审的那一张：不上云、不登记 ---------- */
    await resetCalls()
    await setCfg({ pickMode: 'one', verdict: 'risky', bindStatus: 0 })
    await ensureVisible(mp)
    await addTile.tap()
    s = await waitFor(async () => {
      const x = await st()
      return x.toasts.length ? x : null
    }, 20000)
    ck('⑦ 微信明确判 risky 的那一张：送检了（真的走了那一趟）',
      !!s && s.upload.length === 1, s ? `送检 ${s.upload.length} 次／回 ${s.upload[0] && s.upload[0].verdict}` : '没走完')
    ck('⑦ 它**没有上云**（没过审的那一张一个字节都不许落到云上）',
      !!s && s.cloud.length === 0, s ? `上云 ${s.cloud.length} 次` : '没走完')
    ck('⑦ 它**也没有登记**（登记名单里只该有过检的那些）',
      !!s && s.binds.length === 0, s ? `登记 ${s.binds.length} 次` : '没走完')
    ck('⑦ 屏上说的是"这张没过审"那一句（不是"存不上"那种含混话）',
      !!s && s.toasts.indexOf(T.shotBlocked) >= 0,
      s ? `吐司「${s.toasts.join('｜')}」／要念「${T.shotBlocked}」` : '没走完')

    /* ---------- ⑧ 过审的那一张：上云 → 登记 → 重读整排 ---------- */
    await resetCalls()
    await setCfg({ pickMode: 'one', verdict: 'pass', bindStatus: 200 })
    await ensureVisible(mp)
    await addTile.tap()
    s = await waitFor(async () => {
      const x = await st()
      return x.binds.length ? x : null
    }, 25000)
    ck('⑧ 过审的那一张上了云（登记之前先过审、过审才上云）',
      !!s && s.cloud.length === 1, s ? `上云 ${s.cloud.length} 次` : '没走完')
    ck('⑧ 真的登记了（绑图那一个口打了一次）',
      !!s && s.binds.length === 1, s ? `登记 ${s.binds.length} 次` : '没走完')
    if (s && s.binds.length) {
      const items = (s.binds[0].data && s.binds[0].data.items) || []
      const keys = items.length ? Object.keys(items[0]).sort() : []
      ck('⑧ 登记那一格只带 file_id/size/width/height（字节不过服务端）',
        items.length === 1 && ['file_id', 'height', 'size', 'width'].join() === keys.join(),
        `键：${keys.join(',') || '（一个都没有）'}`)
      ck('⑧ 登记的正是刚上云那一张的地址',
        items.length === 1 && String(items[0].file_id).indexOf('cloud://ruler423/') === 0,
        items.length ? String(items[0].file_id) : '（没有那一项）')
      ck('⑧ 登记那一趟是绑图那一个口（POST /api/notes/{id}/assets）',
        /\/api\/notes\/\d+\/assets$/.test(String(s.binds[0].url)),
        String(s.binds[0].url))
    }
    ck('⑧ 屏上说的是"已加上"那一句',
      !!s && s.toasts.indexOf(T.shotsAdded) >= 0,
      s ? `吐司「${s.toasts.join('｜')}」／要念「${T.shotsAdded}」` : '没走完')
    // 登记回体只回"这次登记的那几行"，所以屏上那一排必须**重读整排**（老的那几张不许消失）
    const after = await wp.data()
    ck('⑧ 登记之后重读了整排（屏上那一排还是真读回来的那一份，不是只剩新加的那张）',
      after.shotsLoaded === true && Array.isArray(after.shots),
      `shotsLoaded=${after.shotsLoaded}／${(after.shots || []).length} 张`)

    /* ---------- ⑨ 登记 4xx：删掉刚上云的那些（不留孤儿对象） ---------- */
    await resetCalls()
    await setCfg({ pickMode: 'one', verdict: 'pass', bindStatus: 400, bindDetail: '一篇笔记最多 9 张图' })
    await ensureVisible(mp)
    await addTile.tap()
    s = await waitFor(async () => {
      const x = await st()
      return x.toasts.length ? x : null
    }, 25000)
    ck('⑨ 绑图 4xx 时把刚上云的那些对象删掉了（不占全站配额、没人认得的孤儿）',
      !!s && s.del.length === 1 && s.del[0].length === 1,
      s ? `删 ${s.del.length} 次／共 ${s.del.reduce((a, b) => a + b.length, 0)} 个` : '没走完')
    ck('⑨ 删的正是刚上云那一张的地址',
      !!s && s.del.length === 1 && s.del[0][0] && String(s.del[0][0]).indexOf('cloud://ruler423/') === 0,
      s && s.del[0] ? String(s.del[0][0]) : '（没删）')
    ck('⑨ 服务端那句话照实说出来（不是一句"保存失败"）',
      !!s && s.toasts.indexOf('一篇笔记最多 9 张图') >= 0,
      s ? `吐司「${s.toasts.join('｜')}」` : '没走完')
    const qAfter4 = (await st()).queue
    ck('⑨ 4xx 这一档不进待补队列（绑不上的图删了就完了，不留账）',
      qAfter4.length === (queueBefore ? queueBefore.length : 0),
      `队列 ${(queueBefore ? queueBefore.length : 0)} → ${qAfter4.length}`)

    /* ---------- ⑩ 登记 5xx：图已经在云上 ⇒ 进待补队列，不删 ---------- */
    await resetCalls()
    await setCfg({ pickMode: 'one', verdict: 'pass', bindStatus: 500, bindDetail: '服务器开小差了' })
    await ensureVisible(mp)
    await addTile.tap()
    s = await waitFor(async () => {
      const x = await st()
      return x.toasts.length ? x : null
    }, 25000)
    ck('⑩ 绑图 5xx 时图已经在云上了 ⇒ 不删对象（删了就等于把这张图丢了）',
      !!s && s.del.length === 0, s ? `删 ${s.del.length} 次` : '没走完')
    const qAfter5 = (await st()).queue
    const mine = qAfter5.filter((e) => e && Number(e.noteId) === Number(noteId))
    ck('⑩ 登记这一趟进了待补队列（下次进前台补）',
      qAfter5.length === (queueBefore ? queueBefore.length : 0) + 1 && mine.length === 1,
      `队列 ${(queueBefore ? queueBefore.length : 0)} → ${qAfter5.length}（本篇 ${mine.length} 条）`)
    ck('⑩ 屏上说的是"图已传上去了，稍后自动补记"那一句（不是"存不上"）',
      !!s && s.toasts.indexOf(T.shotsQueued) >= 0,
      s ? `吐司「${s.toasts.join('｜')}」／要念「${T.shotsQueued}」` : '没走完')

    /* ---------- ⑪ 新建那一篇（还没建出来）没有补图那一枚 ---------- */
    await mp.reLaunch('/pages/write/write')
    const cp = await mp.currentPage()
    await cp.waitFor(2000)
    const cd = await cp.data()
    ck('⑪ 新建那一篇是新建态（isEdit 假）', cd.isEdit === false, `isEdit=${cd.isEdit}`)
    ck('⑪ 新建态没有补图那一枚（没建出来的篇没有可绑的篇，补图那个口不该在）',
      (await cp.$$('.wr-shot-add')).length === 0,
      `${(await cp.$$('.wr-shot-add')).length} 枚`)

    await mp.screenshot({ path: '/tmp/ruler-shots-01-补图那一枚.png' })
  } catch (err) {
    console.log('脚本停了：' + (err && err.message ? err.message : err))
    const msg = String((err && err.message) || '')
    if (msg.indexOf('量不了') >= 0) {
      console.log('（环境不足，不参与判红）')
      console.log(`\n${bad.length === 0 ? '没法量' : `红 ${bad.length} 条`}`)
      process.exit(bad.length ? 1 : 3)
    }
    bad.push('脚本没跑完')
  } finally {
    // 还原：桩撤掉、待补队列写回原样、占位张删掉、回到首页。
    try {
      if (installed) {
        await mp.evaluate((before) => {
          try { wx.setStorageSync('pendingNoteAssets', before) } catch (e) { /* 写不回去就算了 */ }
          return true
        }, queueBefore || [])
        await restore()
      }
      await mp.switchTab('/pages/index/index')
      await sleep(600)
      console.log('还原：桩已撤／待补队列已写回／占位张已删')
    } catch (e) { /* 还原失败不影响这一把判红 */ }
    try { mp.disconnect() } catch (e) { /* 断不开就算了 */ }
  }
  console.log(`\n${bad.length === 0 ? '真跑全过' : `红 ${bad.length} 条`}`)
  bad.forEach((n) => console.log('  ✗ ' + n))
  process.exit(bad.length ? 1 : 0)
}).catch((e) => { console.error(e); process.exit(2) })
