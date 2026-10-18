/**
 * 一把尺子（真跑）：卡片大图位**在这台跑着的模拟器上到底画不画得出配图**（站长 10-19 回电
 *   「我用新的包测试了，没出现大图在卡片模板里面，你自己验证一下，杂志海报那个试试」）。
 *
 * 静态那把（`验-卡片大图位吃配图.js`）量的是"代码里写没写"，量不到只有运行时才有的三件事：
 *   ① 这一台当前**吃的是哪一份配方**（下发的 / 包内的）；
 *   ② 云端第一张配图**取不取回来、解不解得开**；
 *   ③ 画完之后**那块常驻画布上的像素到底换了没有**（像素，不是图层清单）。
 * 所以这一把走页面自己那条渲染链（`_renderPoster`），把"现网那一份配方"与"包内那一份"**各画一遍
 *   再逐点比像素**——画没画上由像素说，"为什么不画"由配方来源说，两样都不靠猜。
 *
 * ⚠ 全程零写：只 `api.getNote`（GET）＋`noteImage.firstImage`（清单 GET＋云存储下载）。
 *   **刻意不走 `_ensurePosterAssets`**——那里面本机没码时会 POST 建码；所以把 `_posterAssets`
 *   照它那个形状自己递进去（qrPath 给空串：`loadImage('')` 回 null、缺位图那一层被 paintLayers 跳过）。
 *   `wx.request`／`wx.uploadFile`／`wx.downloadFile` 非 GET 一律挡下并记名（挡下时把 fail／complete 发完，
 *   不留一个永不结算的 await），最后一条判据钉这个计数＝0。
 *   撤 REMOTE 只动内存那一份、收尾原样还原；不发写请求、不写本机存储、不碰现网那十行。
 * ⚠ 拆成五段短 evaluate：一整趟（现读正文＋云下载＋两次出图＋两轮逐像素统计）一次调过去会撞
 *   automator 那句「timeout waiting for automator response」——10-19 第一版就是这么挂的，
 *   报出来像"产品崩了"，其实是**调用太重**，不是判据红。状态挂在 globalThis.__ct 上跨段传。
 * 前置：本工作树已 `cli auto --auto-port 9431`（先比屏上版本号，别连到另一棵工作树那台）。
 * 跑法：docs/工具/跑尺子.sh 9431 验-卡片大图位真机画得出来-真跑
 */
const automator = require('miniprogram-automator')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const APORT = process.env.MP_PORT || 9431
const LOCAL = require(path.resolve(__dirname, '../../miniprogram/utils/appInfo.js'))
const TPL = process.env.MP_TPL || 'cover' // 他点名的那一套：杂志封面

const results = []
const ck = (name, ok, got) => {
  results.push({ name, ok })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : '　→ ' + got}`)
}

;(async () => {
  let mp
  for (let i = 0; i < 15 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${APORT}` }) } catch (e) { await sleep(4000) }
  }
  if (!mp) { console.log('!! 环境红：连不上自动化端口'); process.exit(2) }
  // 每一段单独重试，并在挂掉时**点出是哪一段**：整条链一路 await，不点名的话一句"超时"看着都像产品崩了。
  // automator 那条命令超时是 30 秒量级 ⇒ 哪一段太重就拆哪一段（10-19 第一版整趟一次调过去，就是这么挂的）。
  const call = async (label, fn, ...args) => {
    for (let i = 0; i < 3; i++) {
      try { return await mp.evaluate(fn, ...args) } catch (e) {
        console.log(`  （${label} 第 ${i + 1} 次没成：${String((e && e.message) || e).slice(0, 56)}）`)
        await sleep(10000)
      }
    }
    console.log(`!! 环境红：${label} 三次都没回话——是这一趟太重或这一台卡住，不是任何一条判据红`)
    process.exit(2)
  }
  // 暖机：逻辑层没就绪时任何调用都会超时，拿最轻的一句探到它答话为止。
  for (let i = 0; i < 12; i++) {
    try { await mp.evaluate(() => 1); break } catch (e) { await sleep(10000) }
  }
  // 头一次进页会撞上开发者工具那句 rawPath is null（页面元信息没就绪），重试到成功为止（同 验-卡片预览比例）。
  for (let i = 0; ; i++) {
    try { await mp.reLaunch('/pages/index/index'); break } catch (e) {
      if (i >= 4) throw e
      console.log(`第 ${i + 1} 次进列表页没成：${e.message}`)
      await sleep(8000)
    }
  }
  await sleep(5000)

  // ---------- 第 0 段：零写记账（非 GET 挡下并记名）＋等列表真加载完 ----------
  await mp.evaluate(() => {
    const w = globalThis.wx
    if (w.__zhangji) return 'already'
    w.__zhangji = 1
    w.__feiGET = []
    const wrap = (name) => {
      const orig = w[name]
      w[name] = function (opt) {
        const m = String((opt && opt.method) || 'GET').toUpperCase()
        if (m !== 'GET') {
          w.__feiGET.push(`${name} ${m} ${(opt && opt.url) || ''}`)
          if (opt && typeof opt.fail === 'function') opt.fail({ errMsg: `${name}:blocked 尺子挡下非 GET` })
          if (opt && typeof opt.complete === 'function') opt.complete({ errMsg: `${name}:blocked` })
          return
        }
        return orig.apply(this, arguments)
      }
    }
    wrap('request'); wrap('uploadFile'); wrap('downloadFile')
    return 'ok'
  })
  let ready = 0
  for (let i = 0; i < 10; i++) {
    try {
      ready = await mp.evaluate(() => {
        const p = getCurrentPages().slice(-1)[0]
        return ((p && p.data && p.data.notes) || []).length
      })
    } catch (e) { ready = 0 }
    if (ready > 0) break
    await sleep(6000)
  }
  if (!ready) { console.log('!! 环境红：这一台没把笔记列表加载出来（不是产品红，是这一趟没起来）'); process.exit(2) }

  // ---------- 第 1 段：模块、版本、这一台吃哪份配方、下发那份认不认配图 ----------
  const s1 = await call('第1段 模块与配方来源', (tpl) => {
    // ⚠ require 写法：这段注入的是**页面模块作用域**，`/utils/poster.js` 与 `../utils/poster.js` 都报
    //   "module is not defined"，只有 `utils/poster.js`（应用根相对）认——10-19 在这里挂过两次。
    const load = (name) => {
      for (const spec of [`utils/${name}.js`, `/utils/${name}.js`, `../utils/${name}.js`]) {
        try { const m = require(spec); (globalThis.__ct = globalThis.__ct || {}).用哪条 = ((globalThis.__ct || {}).用哪条 || {}); globalThis.__ct.用哪条[name] = spec; return m } catch (e) {}
      }
      return null
    }
    const t = (globalThis.__ct = globalThis.__ct || {})
    t.poster = load('poster'); t.api = load('api'); t.noteImage = load('noteImage'); t.appInfo = load('appInfo')
    t.posterTemplates = load('posterTemplates')
    // 上一趟这一把挂在中途时，内存里那份下发会被清空（REMOTE 住在 poster 模块里，reLaunch 不清它）。
    // 先按本机缓存 restore，还空就现读一次下发（GET）——量"现网那份"之前，这一台得先站在现网那份上。
    // ⚠ 只读：这一句是 restore()——把上次端回来那批从**本机缓存**装回内存（冷启动 app.js 同一条），
    //   不查网、不写存储。缓存也空 ⇒ 这一台还没拿到任何下发，这一把没法量"现网那一份"，直接判环境红。
    if (!Object.keys(t.poster.remoteTemplates() || {}).length) t.posterTemplates && t.posterTemplates.restore()
    if (!Object.keys(t.poster.remoteTemplates() || {}).length) {
      return { 环境红: '这台机器的下发是空的（内存与本机缓存都没有），量不到"现网那一份"' }
    }
    if (!t.poster || !t.api || !t.noteImage) return { require失败: Object.keys(t.用哪条 || {}) }
    const p = getCurrentPages().slice(-1)[0]
    const out = { version: t.appInfo ? t.appInfo.VERSION : null }
    const cands = (p.data.notes || []).filter((n) => n.cover_file_id && !n.is_private)
    out.候选篇数 = cands.length
    if (!cands.length) return out
    t.brief = cands[0]
    out.noteId = cands[0].id
    out.标题 = String(cands[0].title || '').slice(0, 14)
    t.原始 = Object.keys(t.poster.remoteTemplates() || {}).map((k) => (t.poster.remoteTemplates() || {})[k])
    const row = (t.poster.remoteTemplates() || {})[tpl]
    const txt = row ? JSON.stringify(row.recipe) : ''
    out.当前来源 = t.poster.recipeSource(tpl)
    out.下发那份含hasNote = txt.indexOf('hasNote') >= 0
    out.下发那份含note位 = txt.indexOf('"note"') >= 0
    out.下发配方字节 = txt.length
    out.下发门槛 = row ? row.min_app_version : null
    out.下发全部模板 = Object.keys(t.poster.remoteTemplates() || {}).length
    out.每一套来源 = Object.keys(t.poster.remoteTemplates() || {}).map((k) => `${k}=${t.poster.recipeSource(k)}`).join(' ')
    return out
  }, TPL)

  if (s1.环境红) { console.log('!! 环境红：' + s1.环境红); mp.close(); process.exit(2) }

  // ---------- 第 2 段：现读正文（GET）与取第一张配图（清单 GET＋云存储下载）**分两趟**——
  // 合在一趟里，云那一步慢一点就把整段推到命令超时外面（10-19 就是这么挂的第二次）。----------
  const s2a = await call('第2a段 现读正文', async () => {
    const t = globalThis.__ct
    if (!t || !t.brief) return { skipped: true }
    t.note = await t.api.getNote(t.brief.id)
    return { 正文取到: !!(t.note && t.note.title), 正文有换行: !!t.note && String(t.note.content || '').indexOf('\n') >= 0 }
  })
  const s2b = await call('第2b段 取第一张配图', async () => {
    const t = globalThis.__ct
    if (!t || !t.brief) return { skipped: true }
    t.path = await t.noteImage.firstImage(t.brief.id)
    const holder = wx.createOffscreenCanvas({ type: '2d', width: 8, height: 8 })
    t.img = t.path ? await t.poster.loadImage(holder, t.path, 8000) : null
    return { 配图路径: t.path ? String(t.path).slice(-24) : null, 配图尺寸: t.img ? `${t.img.w}x${t.img.h}` : null }
  })

  // ---------- 第 3／4 段：两份配方各画一遍，量常驻画布上的像素 ----------
  // ⚠ automator 的 evaluate 只把**一个**入参递进应用：10-19 传两个时第二个恒 undefined，
  //   于是两趟都把像素写到同一个键上，"逐点差异"那条量不到数——报起来像"画面没变"，其实是参数没进去。
  const shoot = (useRemote) => call(`第${useRemote ? '3' : '4'}段 ${useRemote ? '现网' : '包内'}那份画一遍`, (o) => {
    const tpl = o.tpl, use = o.use
    const t = globalThis.__ct
    if (!t || !t.note) return { skipped: true }
    const p = getCurrentPages().slice(-1)[0]
    const saved = Object.keys(t.poster.remoteTemplates() || {}).map((k) => (t.poster.remoteTemplates() || {})[k])
    t.saved = saved
    t.poster.applyRemoteTemplates(use ? saved : [])
    p.setData({ posterNote: t.note, posterTpl: tpl, noQr: false })
    p._posterAssets = { noteId: t.note.id, note: t.note, token: '', qrPath: '', noteImgPath: t.path }
    // _renderPoster 是异步的：这一趟把画布画完之后，把统计挂回 __ct，返回一句"画完了"
    return new Promise((resolve) => {
      p._renderPoster().catch((e) => { t.渲染fail = String((e && e.errMsg) || (e && e.message) || e).slice(0, 60) }).then(async () => {
        try {
          const c = await p._getCanvas()
          const ctx = c.getContext('2d')
          const h = Math.max(1, Math.min(c.height, 700))
          const d = ctx.getImageData(0, 0, c.width, h).data
          const seen = {}
          let sum = 0, sq = 0, n = 0
          for (let i = 0; i < d.length; i += 4) {
            seen[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)] = 1
            const lum = (d[i] + d[i + 1] + d[i + 2]) / 3
            sum += lum; sq += lum * lum; n += 1
          }
          const plan = t.poster.planPoster(ctx, t.note, tpl, t.poster.posterProfile(), 'zh', { showQr: false, hasNote: !!t.img })
          // 粗采样：每 997 个像素取一个（2.3M 字节 → 约 2.3k 个采样点）。
          // ⚠ 上一版在这里整份 `d.slice()` 存两份再逐点比，一趟的活太重，automator 直接命令超时——
          //   超时后它自己会重试，第二趟看到的状态已经不是第一趟那份，量出来的数不可信（10-19 踩过）。
          const sm = []
          for (let i = 0; i < d.length; i += 4 * 997) sm.push(d[i], d[i + 1], d[i + 2])
          t[use ? '样A' : '样B'] = sm
          t[use ? '画完A' : '画完B'] = {
            来源: t.poster.recipeSource(tpl),
            大块: plan.layers.filter((l) => l.k === 'image' || l.k === 'avatar').map((l) => `${l.k}:${l.key || 'avatar'}`).join(' + '),
            画布: `${c.width}x${c.height}`,
            色数: Object.keys(seen).length,
            std: Math.round(Math.sqrt(sq / n - Math.pow(sum / n, 2)) * 10) / 10,
          }
          resolve(Object.assign({}, t[use ? '画完A' : '画完B'], { 渲染fail: t.渲染fail || null }))
        } catch (e) { resolve({ 崩: String((e && e.message) || e).slice(0, 90) }) }
      })
    })
  }, { tpl: TPL, use: useRemote })

  const a = await shoot(true)
  const b = await shoot(false)
  const s5 = await call('第5段 比采样并还原下发', (tpl) => {
    const t = globalThis.__ct
    const o = {}
    const A = t.样A, B = t.样B
    if (A && B && A.length === B.length) {
      let diff = 0, acc = 0
      const n = A.length / 3
      for (let i = 0; i < A.length; i += 3) {
        const dd = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2])
        if (dd > 12) diff += 1
        acc += dd
      }
      o.采样点数 = n
      o.采样差异点 = diff
      o.平均色差 = Math.round((acc / n) * 10) / 10
    } else o.采样不齐 = `A=${A ? A.length : '无'} B=${B ? B.length : '无'}`
    // 还原：先按本机缓存，还空就现读一次（这一趟不许把"下发被清空"留给下一趟读）
    t.posterTemplates.restore()
    o.还原后来源 = t.poster.recipeSource(tpl)
    o.还原后几行 = Object.keys(t.poster.remoteTemplates() || {}).length
    return o
  }, TPL)

  const fei = await call('第6段 读零写账', () => globalThis.wx.__feiGET || [])
  // 逐点差异那三个数是从"包内那一趟"里带回来的（就地比的），提到顶层给判据读
  const r = Object.assign({}, s1, s2a, s2b, { 现网那份: a, 包内那份: b }, s5)
  console.log('运行时读数：', JSON.stringify(r, null, 1))

  ck('屏上跑的就是本树这一版（没连到另一棵工作树）', r.version === LOCAL.VERSION, `屏上 ${r.version}／本树 ${LOCAL.VERSION}`)
  ck('有一篇现成"带配图"的笔记可拿（不现建、不写库）', r.候选篇数 > 0, `${r.候选篇数} 篇候选，用 ${r.noteId}／${r.标题}`)
  ck('云端第一张配图取回来了（这条链在真机通）', !!r.配图路径, `…${r.配图路径}`)
  ck('位图解码成功（hasNote 与 images.note 同源那条才成立）', !!r.配图尺寸, String(r.配图尺寸))
  ck(`现网下发的 ${TPL} 配方认得"配图"（含 hasNote 与 note 位）`,
    r.下发那份含hasNote === true && r.下发那份含note位 === true,
    `含hasNote=${r.下发那份含hasNote}／含"note"位=${r.下发那份含note位}／门槛 ${r.下发门槛}／${r.下发配方字节} 字节`)
  ck('用现网那份画，图层清单里有一块吃 note（画面上那一大位）',
    /image:note/.test((r.现网那份 || {}).大块 || ''), `现网那份大块＝${(r.现网那份 || {}).大块}`)
  ck('用包内那份新配方画，图层清单里有一块吃 note',
    /image:note/.test((r.包内那份 || {}).大块 || ''), `包内那份大块＝${(r.包内那份 || {}).大块}`)
  ck('两次画到常驻画布上的上半截真的不同（采样差异 >1% 且平均色差 >3）',
    r.采样点数 > 0 && r.采样差异点 / r.采样点数 > 0.01 && r.平均色差 > 3,
    `差异 ${r.采样差异点}/${r.采样点数}，平均色差 ${r.平均色差}，色数 现网 ${(r.现网那份 || {}).色数}／包内 ${(r.包内那份 || {}).色数}，std ${(r.现网那份 || {}).std}/${(r.包内那份 || {}).std}${r.采样不齐 ? '（' + r.采样不齐 + '）' : ''}`)
  ck('两次都没崩、也没被 canvasToTempFilePath 那步带倒',
    !(r.现网那份 || {}).崩 && !(r.包内那份 || {}).崩,
    `现网 ${(r.现网那份 || {}).崩 || '无'}／包内 ${(r.包内那份 || {}).崩 || '无'}／渲染 fail ${(r.现网那份 || {}).渲染fail || '无'}`)
  ck('这一台当前吃的是下发那一份（这条只报状态）',
    r.当前来源 === 'remote' || r.当前来源 === 'bundled', `${r.当前来源}；十套＝${r.每一套来源}`)
  ck('这一台开局确实站在"下发那一份"上（十套都收进了，不是空内存）',
    r.下发全部模板 === 10, `收到 ${r.下发全部模板} 套；${r.每一套来源}`)
  ck('收尾把下发还原回来了（不许把"REMOTE 被清空"留给下一趟读）',
    r.还原后来源 === 'remote' && r.还原后几行 === 10, `还原后 ${r.还原后来源}／${r.还原后几行} 行`)
  ck('零写：非 GET 的请求一条都没发出去', fei.length === 0, fei.length ? fei.join(' | ') : '0 条')

  const red = results.filter((x) => !x.ok).length
  console.log(`\n${results.length} 条，红 ${red} 条`)
  mp.close()
  process.exit(red ? 1 : 0)
})().catch((e) => { console.error('尺子挂了', e); process.exit(2) })
