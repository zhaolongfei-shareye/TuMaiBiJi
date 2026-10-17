/**
 * 真跑尺子：编辑这一屏把配图排出来，并让「删一张」这一趟按顺序走完。
 *
 * 站长 10-18：「编辑时，图片要展示，然后支持删除图片。」这一把量的就是那两句：
 * ① 展示——服务端那一排 assets 真落到屏上（枚数对得上、每枚画出方格、方格没被夹扁、每枚配了一只 ✕）；
 * ② 删除——按 ✕ 先弹二次确认；取消 ⇒ 一枚不少、待删那一格不塞、请求不发；
 *    确认 ⇒ **先把这张地址记进待删那一格、再**发那趟 DELETE（拦在 `wx.request` 那一刻读的队列就是现场证据），
 *    没成 ⇒ 预留撤回去（10-11 审计严重①那一刀）；成了 ⇒ 拿回体少一枚、`deleteFile` 拿到的是同一条地址、
 *    队列不留尾巴。
 *
 * ⚠ 现网那台后端**还没有这个 DELETE 口**（`routes/assets.py` 那一支只在工作树里），所以删的那两半
 *   全打在本地：替身只截「方法为 DELETE、路径里带 /assets/ 那一段」的这一条，其余请求照原样走网络。
 *   库里那行与云上那个对象一次都没真动过——最后一条判据拿的就是这件事（重新进这一篇，枚数原样回来）。
 *   「删一张」的服务端语义（归属、跨篇、删掉封面那张、私密没解锁 403）由
 *   `backend/tests/test_note_assets.py` 第六节那 6 条钉，不归这一把。
 */
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')

const OUT = path.resolve(__dirname, '../design/10-18-编辑页配图/实测')
const KEY = 'pendingCloudPurge'
let reds = 0
const ck = (name, pass, got) => {
  console.log(`${pass ? '✓' : '✗'} ${name}${got === undefined ? '' : `　→ ${got}`}`)
  if (!pass) reds++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  const logs = []
  const bind = (name, fn) => { try { if (typeof mp.on === 'function') mp.on(name, fn) } catch (e) { /* 没这个事件口就不拦 */ } }
  bind('console', (m) => logs.push(`${m && m.type}: ${m && m.args ? m.args.map((a) => (a && a.description) || String(a)).join(' ') : m}`))

  /* ---------- 〇、从列表挑一篇真带配图的（不许自己编 id） ---------- */
  await mp.switchTab('/pages/index/index')
  await sleep(3000)
  const list = (await (await mp.currentPage()).data()).notes || []
  const pub = (n) => !n.is_private
  const pick = list.filter((n) => pub(n) && n.cover_file_id)[0]
  const bare = list.filter((n) => pub(n) && !n.cover_file_id)[0]
  if (!pick) { console.log('!! 列表里没有一篇带配图的公开笔记，这一把量不了（量不了不是过）'); process.exit(3) }
  console.log(`　用的这篇 id=${pick.id}　封面 ${String(pick.cover_file_id).slice(0, 44)}…` +
    (bare ? `　无图那篇 id=${bare.id}` : '　（没有无图的公开篇 ⇒ 空态那一条没量成，下面自己会红）'))

  const openEdit = async (id) => {
    await mp.evaluate((u) => new Promise((res) => { wx.navigateTo({ url: u, success: res, fail: res }) }),
      `/pages/write/write?id=${id}&mode=edit`)
    await sleep(4000)
    return mp.currentPage()
  }

  /* ---------- 一、展示 ---------- */
  logs.length = 0
  let page = await openEdit(pick.id)
  let wd = await page.data()
  const shots = wd.shots || []
  ck('前提：这一篇在服务器确实有配图（`shots` 有货，每项带数字 id 与 cloud:// 地址）　注：这条要是假的，后面全白测',
    shots.length > 0 && shots.every((x) => Number.isFinite(x.id)
      && typeof x.cloud_url === 'string' && x.cloud_url.startsWith('cloud://')),
    `${shots.length} 张，id=${JSON.stringify(shots.map((x) => x.id))}`)
  ck('读这一排没失败（console 里不许有「配图读取失败」）',
    !logs.some((l) => /配图读取失败/.test(l)), logs.filter((l) => /配图读取失败/.test(l))[0] || '没有这一句')

  const tiles = await page.$$('.wr-shot')
  const xs = await page.$$('.wr-shot-x')
  ck('屏上方格枚数＝服务端那张数（一排一个不多、一个不少）',
    tiles.length === shots.length, `.wr-shot ${tiles.length} 枚 / 服务端 ${shots.length} 张`)
  ck('每枚方格都配了一只 ✕（只展示不配口＝他那第二句落空）',
    xs.length === shots.length, `.wr-shot-x ${xs.length} 枚`)
  const sz = await mp.evaluate(() => new Promise((res) => {
    // 用平台那把尺量，不用 automator 的 Element.size()：这一版 automator 的元素口没验过（能用的
    // 只有 text()/tap()），而 `createSelectorQuery().boundingClientRect()` 是官方口径，量歪了怪不到工具。
    const q = wx.createSelectorQuery().select('.wr-shot-img')
    q.boundingClientRect((r) => res(r || null)).exec()
  }))
  ck('第一枚真画出了面积、且是个方格（只定宽不定高时被 flex 压扁，红的就是这一条）',
    !!sz && sz.width > 0 && sz.height > 0 && Math.abs(sz.width - sz.height) <= 2,
    sz ? `${Math.round(sz.width)}×${Math.round(sz.height)}` : '量不到 .wr-shot-img 的面')
  await mp.screenshot({ path: path.join(OUT, '01-编辑页有配图一排.png') })

  /* ---------- 替身上场：截住那一条 DELETE，别打到还没有这个口的现网 ---------- */
  const q0 = await mp.evaluate((k) => (wx.getStorageSync(k) || []).slice(), KEY)
  await mp.evaluate((purgeKey) => {
    // 两位分开：`confirm` 只管"这只弹窗按的是确认还是取消"，`reply` 只管"那趟 DELETE 回成了还是回挂了"。
    // ⚠ 上一版把它们并成了一格，设成 fakeOk 时弹窗答的其实是"取消" ⇒ 三条红的是这支替身写歪，
    //   不是删一张的实现错了（判据写歪就先改判据）。
    const P = { modals: [], reqs: [], deletes: [], confirm: false, reply: 'fail' }
    globalThis.__probe = P
    if (!wx.__orig) {
      wx.__orig = { showModal: wx.showModal, request: wx.request, deleteFile: (wx.cloud || {}).deleteFile }
    }
    wx.showModal = function (o) {
      P.modals.push({ title: o.title, content: o.content })
      // 替身要把 success／complete 都发完，只发 success 的那种页面里的收尾会挂住。
      const s = { confirm: P.confirm, cancel: !P.confirm }
      if (o.success) o.success(s)
      if (o.complete) o.complete(s)
    }
    wx.request = function (o) {
      // 拦的口故意放宽到"任何打到 /assets/ 的 DELETE"：尾巴形状对不对靠下面那条判据去量，
      // 但拦不能靠形状——万一形状差一点放它走了网络，量个尺子就把现网真删掉一张图。
      const mine = o.method === 'DELETE' && String(o.url || '').indexOf('/assets/') >= 0
      if (!mine) return wx.__orig.request(o)
      // 记的是**发请求这一刻**的待删队列：先塞地址再发请求才留得住这条证据；
      // 哪个实现改成"成功了才记"，这里的队列就是空的 ⇒ 红。
      P.reqs.push({ url: String(o.url), queue: (wx.getStorageSync(purgeKey) || []).slice() })
      setTimeout(() => {
        if (P.reply === 'ok') {
          const p = getCurrentPages().slice(-1)[0]
          const gone = Number(String(o.url).replace(/.*\//, ''))
          if (o.success) o.success({ statusCode: 200, data: (p.data.shots || []).filter((x) => x.id !== gone) })
        } else if (o.fail) {
          o.fail({ errMsg: 'request:fail 尺子拦的，没发到现网' })
        }
        if (o.complete) o.complete({})
      }, 30)
      return {}
    }
    if (wx.cloud) wx.cloud.deleteFile = function (o) {
      P.deletes.push((o.fileList || []).slice())
      // 回 status 0 是**假的**：云上那个对象一次都没被删（最后一条判据量的就是这件事）。
      setTimeout(() => {
        if (o.success) o.success({ fileList: (o.fileList || []).map((f) => ({ fileID: f, status: 0 })) })
      }, 20)
    }
  }, KEY)
  // 替身没挂上就一条都不许点：这一把后面按的是"删一张"，让它走真网络就是删现网的数据。
  const guarded = await mp.evaluate(() => ({
    modal: wx.showModal !== (wx.__orig || {}).showModal,
    request: wx.request !== (wx.__orig || {}).request,
    deleteFile: !!wx.cloud && wx.cloud.deleteFile !== (wx.__orig || {}).deleteFile,
  }))
  if (!(guarded.modal && guarded.request && guarded.deleteFile)) {
    console.log(`!! 替身没挂上（modal=${guarded.modal} request=${guarded.request} deleteFile=${guarded.deleteFile}）⇒ 停手，一条都不点`)
    process.exit(4)
  }
  const readQ = () => mp.evaluate((k) => (wx.getStorageSync(k) || []).slice(), KEY)
  const resetTrace = () => mp.evaluate(() => {
    const P = globalThis.__probe
    P.modals = []; P.reqs = []; P.deletes = []; P.confirm = false; P.reply = 'fail'
  })
  const trace = () => mp.evaluate(() => ({
    modals: globalThis.__probe.modals.slice(),
    reqs: globalThis.__probe.reqs.map((r) => ({ url: r.url, queue: r.queue.slice() })),
    deletes: globalThis.__probe.deletes.map((d) => d.slice()),
  }))

  /* ---------- 二、按 ✕ 先弹二次确认；点取消 ⇒ 什么都没发生 ---------- */
  await resetTrace()
  const n2 = (await page.data()).shots.length
  await xs[0].tap()
  await sleep(900)
  let tr = await trace()
  const m = tr.modals[0] || {}
  ck('按 ✕ 弹的是二次确认，且那两句用的是删一篇同一个说法（没另造一套话术）',
    m.title === '确认删除' && m.content === '删除后无法恢复',
    `「${m.title}」／「${m.content}」`)
  ck('取消 ⇒ 一枚没少', (await page.data()).shots.length === n2, `${n2} 张还在`)
  ck('取消 ⇒ 一条删除请求都没发', tr.reqs.length === 0, `${tr.reqs.length} 条`)
  ck('取消 ⇒ 待删那一格也没被塞（没确认就不许预留）',
    (await readQ()).length === q0.length, `队列 ${q0.length} → ${(await readQ()).length}`)

  /* ---------- 三、确认了，但那趟没成 ⇒ 先预留、再撤回 ---------- */
  await resetTrace()
  await mp.evaluate(() => { globalThis.__probe.confirm = true })
  const t3 = (await page.data()).shots[0]
  await xs[0].tap()
  await sleep(1200)
  tr = await trace()
  const r3 = tr.reqs[0] || { url: '', queue: [] }
  ck('发出去的是那一条 DELETE，且路径尾巴是**那一行的数字 id**（fileID 里全是 /，塞进路径段路由直接不匹配＝后端第一版 404 的根因）',
    tr.reqs.length === 1 && /\/assets\/\d+$/.test(r3.url) && r3.url.endsWith(`/${t3.id}`)
    && r3.url.indexOf('cloud://') < 0, r3.url.slice(-60))
  ck('**先预留再发请求**：发这一条的那一刻，这张的地址已经在待删那一格里了',
    r3.queue.indexOf(t3.cloud_url) >= 0, `此刻队列 ${JSON.stringify(r3.queue).slice(0, 70)}`)
  ck('没成 ⇒ 预留撤回去了、队列回到原样（留着会让下一次进前台删掉一张界面上还在的图）',
    JSON.stringify(await readQ()) === JSON.stringify(q0), `队列 ${(await readQ()).length} 条／原本 ${q0.length} 条`)
  ck('没成 ⇒ 一枚没少（不许先把图划掉再等服务器）',
    (await page.data()).shots.length === n2, `${(await page.data()).shots.length} 张`)

  /* ---------- 四、确认了，且那趟成了 ⇒ 少一枚、去清对象、不留尾巴 ---------- */
  await resetTrace()
  await mp.evaluate(() => { const P = globalThis.__probe; P.confirm = true; P.reply = 'ok' })
  const xs4 = await page.$$('.wr-shot-x')
  const t4 = (await page.data()).shots[0]
  const expectLeft = (await page.data()).shots.slice(1).map((x) => x.id)
  await xs4[0].tap()
  await sleep(1500)
  tr = await trace()
  const wd4 = await page.data()
  const tiles4 = await page.$$('.wr-shot')
  ck('删成 ⇒ 那一排少一枚，且少的就是点的那一枚（拿回体刷新，不回头再读一次列表）',
    (wd4.shots || []).length === n2 - 1
    && JSON.stringify((wd4.shots || []).map((x) => x.id)) === JSON.stringify(expectLeft),
    `剩 ${(wd4.shots || []).map((x) => x.id).join(',')}／该剩 ${expectLeft.join(',')}`)
  ck('屏上方格跟着少一枚（数据少了、屏上没少＝那一栏是画的假图）',
    tiles4.length === n2 - 1, `.wr-shot ${tiles4.length} 枚`)
  ck('删成的这一张交给云上去清，且交的就是它自己那条地址（行是服务端删的，对象只有客户端删得动）',
    tr.deletes.length === 1 && tr.deletes[0].length === 1 && tr.deletes[0][0] === t4.cloud_url,
    JSON.stringify(tr.deletes[0] || []).slice(0, 80))
  ck('真删成的那条自己从队列里摘掉 ⇒ 队列回到原样、不留尾巴',
    JSON.stringify(await readQ()) === JSON.stringify(q0), `${(await readQ()).length} 条`)
  await mp.screenshot({ path: path.join(OUT, '02-删一枚后少一枚.png') })

  /* ---------- 五、反向：这一把的假删一次都没落到现网 ---------- */
  await mp.evaluate(() => {
    if (wx.__orig) { wx.showModal = wx.__orig.showModal; wx.request = wx.__orig.request; if (wx.cloud) wx.cloud.deleteFile = wx.__orig.deleteFile }
    globalThis.__probe = null
  })
  await mp.switchTab('/pages/index/index')
  await sleep(2000)
  page = await openEdit(pick.id)
  wd = await page.data()
  ck('反向有牙：重新进这一篇，那一排还是原来那么多 ⇒ 库里那行与云上对象一个字没动过（现网没这个口，这一把不该写进去）',
    (wd.shots || []).length === n2, `重新读到 ${(wd.shots || []).length} 张／进来时 ${n2} 张`)

  /* ---------- 六、空态：没配图那一整栏不画 ---------- */
  if (bare) {
    await mp.switchTab('/pages/index/index')
    await sleep(2000)
    const p6 = await openEdit(bare.id)
    const d6 = await p6.data()
    const t6 = await p6.$$('.wr-shot')
    ck('没配图那一篇：整栏不画（既没有空框，也没有"还没有配图"那种念着像坏了的一句话）',
      (d6.shots || []).length === 0 && t6.length === 0,
      `id=${bare.id} shots ${(d6.shots || []).length} 张、屏上 ${t6.length} 枚`)
    await mp.screenshot({ path: path.join(OUT, '03-无图那篇整栏不画.png') })
  } else {
    ck('空态那一条没量成：列表里找不下一篇「没配图的公开笔记」——这条要红着提醒，不算过', false, '挑不到样本')
  }

  console.log(`截图目录：${OUT}`)
  mp.disconnect()
  console.log(reds === 0 ? '\n真跑全过' : `\n红 ${reds} 条`)
  process.exit(reds === 0 ? 0 : 1)
})().catch((e) => { console.log('脚本停了：', e && e.message); process.exit(2) })
