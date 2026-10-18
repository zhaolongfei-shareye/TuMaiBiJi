/**
 * 一把尺子（真跑）：两件事一次量清 ——
 *   ① 卡片右下角那一格小程序码为什么是白的（站长 10-19 回电「上面那个图，二维码为什么看不到」）；
 *   ② 现网那份种子换成 `backend/seed/poster_templates.json` 里这一版之后，杂志封面那张会长什么样
 *      （他那一句「什么时候能看到图？你验证一下」——不给图，这句就只是我的一句话）。
 *
 * 为什么①要拿像素说：白块有两种，**码位那块位图没拿到**（`paintLayers` 的 image 分支回退成
 * `ly.placeholder` 那块浅底圆角）与**这一套模板压根没画码位**。前者换一张真码就出黑白点，后者换不出来。
 * 所以这一把把同一篇、同一套模板画三遍：
 *   画 A＝现网那一份 cover ＋ 真码 → 码位该有黑白点（证明"码位本身是好的"，与配方无关）
 *   画 B＝新种子那一份 cover ＋ 真码 → 码位有黑白点 **且**上半截色数抬起来（配图画上去了）
 *   画 C＝新种子那一份 cover ＋ 空码 → 码位退回**单色**（复现他截图那一态，把归因钉死）
 * 三张截图落在 docs/design/卡片大图位-自证-20261019/，屏上有没有图由图说，不由我说。
 *
 * ⚠ 全程零写：拿码走的是 `GET /api/shares/status`（这一篇本来就有一张活码）＋`GET /api/shares/{token}/qrcode`，
 *   **刻意不走 `_ensurePosterAssets`**——那里面没码时会 POST 建码。非 GET 一律挡下并记名，最后一条判据钉＝0。
 * ⚠ 弹窗是 `setData({templateOpen:true})` 手动开的（只为了截图能照见那张成品），不走 `_openPosterFor`，
 *   所以这一趟不会建码、不会登记卡片；收尾 reLaunch 一次把页面数据冲干净。
 * ⚠ REMOTE 住在 poster 模块里，reLaunch 不清它 ⇒ 画 B／画 C 换进去的那一行**收尾必须原样还原**，
 *   否则下一趟（或他手工点一次）量到的就不是现网那份（10-19 为这条挂过一次假绿）。
 * 前置：本工作树已 `cli auto --auto-port 9431`（先比屏上版本号，别连到另一棵工作树那台）。
 * 跑法：docs/工具/跑尺子.sh 9431 验-卡片码位与新配方真机画得出来-真跑
 * 可选：MP_NOTE=67（默认，他截图那一篇）MP_TPL=cover
 */
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const APORT = process.env.MP_PORT || 9431
const LOCAL = require(path.resolve(__dirname, '../../miniprogram/utils/appInfo.js'))
const TPL = process.env.MP_TPL || 'cover'
const WANT_NOTE = Number(process.env.MP_NOTE || 67)
const SEED = require(path.resolve(__dirname, '../../backend/seed/poster_templates.json'))
const SEED_ROW = SEED.filter((r) => r.template_id === TPL)[0]
const OUT = path.resolve(__dirname, '../../docs/design/卡片大图位-自证-20261019')
fs.mkdirSync(OUT, { recursive: true })

const results = []
const ck = (name, ok, got) => {
  results.push({ name, ok })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : '　→ ' + got}`)
}

;(async () => {
  if (!SEED_ROW) { console.log('!! 环境红：种子里没有 ' + TPL + ' 这一行'); process.exit(2) }
  let mp
  for (let i = 0; i < 15 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${APORT}` }) } catch (e) { await sleep(4000) }
  }
  if (!mp) { console.log('!! 环境红：连不上自动化端口'); process.exit(2) }
  const call = async (label, fn, arg) => {
    for (let i = 0; i < 3; i++) {
      try { return await mp.evaluate(fn, arg) } catch (e) {
        console.log(`  （${label} 第 ${i + 1} 次没成：${String((e && e.message) || e).slice(0, 56)}）`)
        await sleep(10000)
      }
    }
    console.log(`!! 环境红：${label} 三次都没回话——是这一趟太重或这一台卡住，不是任何一条判据红`)
    process.exit(2)
  }
  for (let i = 0; i < 12; i++) { try { await mp.evaluate(() => 1); break } catch (e) { await sleep(10000) } }
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

  // ---------- 第 1 段：模块、版本、身份，和**上一把尺子留没留东西在这一页上** ----------
  const s1 = await call('第1段 开局读数', (tpl) => {
    const load = (name) => {
      for (const spec of [`utils/${name}.js`, `/utils/${name}.js`, `../utils/${name}.js`]) {
        try { return require(spec) } catch (e) {}
      }
      return null
    }
    const t = (globalThis.__cv = globalThis.__cv || {})
    t.poster = load('poster'); t.api = load('api'); t.noteImage = load('noteImage')
    t.appInfo = load('appInfo'); t.posterTemplates = load('posterTemplates')
    if (!t.poster || !t.api || !t.noteImage) return { 环境红: 'require 没成' }
    // 每一趟都从**本机缓存**（=上一次从现网拉回来的那十行）重新起底，不吃上一趟留在内存里那份：
    // REMOTE 住在 poster 模块里、reLaunch 不清它，而 globalThis.__cv 跨趟也不清——
    // 10-19 上一把就是栽在"上一趟挂在中途、REMOTE 被换过"上，量出来的"现网那份"是新配方。
    t.posterTemplates.restore()
    t.saved = Object.keys(t.poster.remoteTemplates() || {}).map((k) => (t.poster.remoteTemplates() || {})[k])
    const p = getCurrentPages().slice(-1)[0]
    const a = p._posterAssets || null
    return {
      version: t.appInfo ? t.appInfo.VERSION : null,
      userId: getApp().globalData.userId,
      下发套数: t.saved.length,
      当前来源: t.poster.recipeSource(tpl),
      这页缓存的noteId: a ? a.noteId : null,
      这页缓存的码路径长: a && a.qrPath != null ? String(a.qrPath).length : null,
      这页缓存的token长: a && a.token != null ? String(a.token).length : null,
    }
  }, TPL)
  if (s1.环境红) { console.log('!! 环境红：' + s1.环境红); mp.close(); process.exit(2) }
  ck('屏上这一台＝本工作树的包（防连到另一棵工作树）', s1.version === LOCAL.VERSION, `${s1.version} / 本地 ${LOCAL.VERSION}`)
  ck('跑在站长自己那个账号上（id=3，读数才是他真能撞到的）', s1.userId === 3, `userId=${s1.userId}`)
  ck('这台机器已经吃到下发那十套', s1.下发套数 === 10, `${s1.下发套数} 套，${TPL}=${s1.当前来源}`)
  console.log(`  · 开局这一页的 _posterAssets：noteId=${s1.这页缓存的noteId} 码路径长=${s1.这页缓存的码路径长} token长=${s1.这页缓存的token长}`)

  // ---------- 第 2 段：认篇（默认他截图那一篇）＋现读正文 ----------
  const s2 = await call('第2段 认篇与现读正文', (want) => {
    const t = globalThis.__cv
    const p = getCurrentPages().slice(-1)[0]
    const withCover = (p.data.notes || []).filter((n) => n.cover_file_id && !n.is_private)
    t.brief = withCover.find((n) => n.id === want) || withCover[0]
    if (!t.brief) return { 环境红: '列表里没有一篇带配图的（捞不到样本，不是产品红）' }
    return { noteId: t.brief.id, 标题: String(t.brief.title || '').slice(0, 16), 带配图候选: withCover.length }
  }, WANT_NOTE)
  if (s2.环境红) { console.log('!! 环境红：' + s2.环境红); mp.close(); process.exit(2) }
  const s2b = await call('第2b段 现读正文', async () => {
    const t = globalThis.__cv
    t.note = await t.api.getNote(t.brief.id)
    return { 正文取到: !!(t.note && t.note.title) }
  })
  ck('这一篇正文取回来了（GET）', !!(s2b && s2b.正文取到), `${s2.noteId}｜${s2.标题}`)

  // ---------- 第 3 段：第一张配图（清单 GET ＋ 云存储下载） ----------
  const s3 = await call('第3段 取第一张配图', async () => {
    const t = globalThis.__cv
    t.path = await t.noteImage.firstImage(t.brief.id)
    const holder = wx.createOffscreenCanvas({ type: '2d', width: 8, height: 8 })
    t.img = t.path ? await t.poster.loadImage(holder, t.path, 8000) : null
    return { 配图路径: t.path ? String(t.path).slice(-22) : null, 尺寸: t.img ? `${t.img.w}x${t.img.h}` : null }
  })
  ck('这一篇那一张配图取回来且解得开', !!s3.尺寸, `${s3.配图路径} ${s3.尺寸 || ''}`)

  // ---------- 第 4 段：拿**已经在用**的那张活码（两次 GET，绝不 POST 建码） ----------
  const s4 = await call('第4段 拿活码', async () => {
    const t = globalThis.__cv
    const st = await t.api.getShareStatus(t.brief.id)
    if (!st || !st.active || !st.token) return { 拿不到: JSON.stringify(st || {}) }
    t.token = st.token
    t.qrPath = await new Promise((resolve, reject) => {
      wx.downloadFile({
        url: t.api.getShareQRCodeUrl(st.token),
        success: (r) => r.statusCode === 200 ? resolve(r.tempFilePath) : reject(new Error('QR ' + r.statusCode)),
        fail: reject,
      })
    })
    const holder = wx.createOffscreenCanvas({ type: '2d', width: 8, height: 8 })
    t.qrImg = await t.poster.loadImage(holder, t.qrPath, 8000)
    return { token长: String(st.token).length, 码路径: String(t.qrPath).slice(-22), 码尺寸: t.qrImg ? `${t.qrImg.w}x${t.qrImg.h}` : null }
  })
  ck('这一篇本来就有一张活码（走 GET 拿，没建新的）', !!s4.码尺寸, `token长${s4.token长} ${s4.码尺寸 || s4.拿不到 || ''}`)

  // ---------- 画 A／B／C：同一篇、同一套模板，三份配方 × 两种码态 ----------
  // 一次调用只画一遍：整趟（渲染＋两次 getImageData＋planPoster）合起来会撞 automator 那句 30 秒超时。
  const paint = (o) => call(`画${o.tag}`, (arg) => {
    const t = globalThis.__cv
    if (!t.note) return { skipped: true }
    const p = getCurrentPages().slice(-1)[0]
    if (!t.saved || !t.saved.length) return { 环境红: '第1段没把下发底数存进来' }
    const rows = arg.rows === 'live' ? t.saved : t.saved.map((r) => (r.template_id === arg.rows.template_id ? arg.rows : r))
    t.poster.applyRemoteTemplates(rows)
    // 弹窗手动开着只为截图能照见成品；不走 _openPosterFor ⇒ 这一趟不建码、不登记卡片
    p.setData({
      templateOpen: true, detailOpen: false, posterNote: t.note, posterTpl: arg.use,
      posterTplName: t.poster.templateLabel(arg.use, p.data.lang), noQr: false,
      posterHasCard: false, posterBusy: false, posterImagePath: '',
    })
    p._posterAssets = { noteId: t.note.id, note: t.note, token: arg.qr ? t.token : '', qrPath: arg.qr ? t.qrPath : '', noteImgPath: t.path }
    return new Promise((resolve) => {
      p._renderPoster().catch((e) => { t.渲染fail = String((e && e.errMsg) || (e && e.message) || e).slice(0, 60) }).then(async () => {
        try {
          const c = await p._getCanvas()
          const ctx = c.getContext('2d')
          const prof = t.poster.posterProfile()
          const plan = t.poster.planPoster(ctx, t.note, arg.use, prof, p.data.lang, { showQr: true, hasNote: !!t.img })
          const M = t.poster.MATTE || 0
          const q = plan.layers.filter((l) => l.k === 'image' && l.key === 'qr')[0] || null
          const stat = (x, y, w, h) => {
            x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y))
            w = Math.max(1, Math.min(Math.round(w), c.width - x)); h = Math.max(1, Math.min(Math.round(h), c.height - y))
            const d = ctx.getImageData(x, y, w, h).data
            const seen = {}; let dark = 0, n = 0
            for (let i = 0; i < d.length; i += 4) {
              const r = d[i], g = d[i + 1], b = d[i + 2]
              seen[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)] = 1
              if ((r + g + b) / 3 < 110) dark += 1
              n += 1
            }
            return { 色数: Object.keys(seen).length, 深色占比: Math.round((dark / n) * 1000) / 10, 采样: n }
          }
          const top = Math.max(1, Math.min(c.height, 700))
          const dd = ctx.getImageData(0, 0, c.width, top).data
          const seen2 = {}; let n2 = 0
          for (let i = 0; i < dd.length; i += 4 * 97) {
            const r = dd[i], g = dd[i + 1], b = dd[i + 2]
            seen2[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)] = 1; n2 += 1
          }
          t['画' + arg.tag] = {
            来源: t.poster.recipeSource(arg.use),
            大块: plan.layers.filter((l) => l.k === 'image' || l.k === 'avatar').map((l) => `${l.k}:${l.key || 'avatar'}`).join(' + '),
            画布: `${c.width}x${c.height}`,
            码位: q ? stat(q.x + M, q.y + M, q.w, q.h) : { 色数: -1 },
            码位框: q ? `${Math.round(q.x)},${Math.round(q.y)},${Math.round(q.w)},${Math.round(q.h)}` : '没有这一层',
            上半截色数: Object.keys(seen2).length,
            渲染fail: t.渲染fail || null,
          }
          resolve(t['画' + arg.tag])
        } catch (e) { resolve({ 崩: String((e && e.message) || e).slice(0, 90) }) }
      })
    })
  }, o)

  const A = await paint({ tag: 'A', rows: 'live', qr: true, use: TPL })
  await sleep(1200); await mp.screenshot({ path: path.join(OUT, '画A-现网那份-真码.png') })
  const B = await paint({ tag: 'B', rows: SEED_ROW, qr: true, use: TPL })
  await sleep(1200); await mp.screenshot({ path: path.join(OUT, '画B-新种子那份-真码.png') })
  const C = await paint({ tag: 'C', rows: SEED_ROW, qr: false, use: TPL })
  await sleep(1200); await mp.screenshot({ path: path.join(OUT, '画C-新种子那份-空码复现.png') })

  const fmt = (x) => `${x.来源}｜大块 ${x.大块 || '（无）'}｜码位 ${x.码位 ? x.码位.色数 + '色/深色' + x.码位.深色占比 + '%' : '?'}｜上半截 ${x.上半截色数}色`
  console.log(`  · 画A ${fmt(A)}`)
  console.log(`  · 画B ${fmt(B)}`)
  console.log(`  · 画C ${fmt(C)}`)
  ck('三趟都真画出来了（没有渲染失败）', !A.崩 && !B.崩 && !C.崩 && !A.渲染fail && !B.渲染fail && !C.渲染fail, `${A.渲染fail || ''}${B.渲染fail || ''}${C.渲染fail || ''}`)
  ck('现网那份 cover 里**没有**大图位（这就是他看不见配图的原因）', !/image:note/.test(A.大块 || ''), A.大块 || '（无大块）')
  ck('新种子那份 cover 里大图位吃这篇配图', /image:note/.test(B.大块 || ''), B.大块)
  ck('换配方之后上半截像素真的变了（配图落笔了）', B.上半截色数 > A.上半截色数 * 1.5, `现网 ${A.上半截色数} → 新种子 ${B.上半截色数}`)
  ck('码位拿得到图就画得出来（现网那份也一样画得出）', A.码位.色数 >= 8 && A.码位.深色占比 >= 3, `现网那份码位 ${A.码位.色数}色、深色 ${A.码位.深色占比}%`)
  ck('新种子那份的码位同样画得出来', B.码位.色数 >= 8 && B.码位.深色占比 >= 3, `${B.码位.色数}色、深色 ${B.码位.深色占比}%`)
  ck('qrPath 为空 ⇒ 码位退成单色占位块（他截图那一态复现，归因钉死）', C.码位.色数 <= 2 && C.码位.深色占比 < 1, `${C.码位.色数}色、深色 ${C.码位.深色占比}%`)
  ck('空白那格与模板无关：三趟用的是同一套 cover、同一个码位框', A.码位框 === B.码位框 && B.码位框 === C.码位框, `框 ${A.码位框}`)

  // ---------- 收尾：还原下发、关掉手动开的弹窗、报零写 ----------
  const s9 = await call('收尾 还原', (tpl) => {
    const t = globalThis.__cv
    const p = getCurrentPages().slice(-1)[0]
    p.setData({ templateOpen: false })
    t.poster.applyRemoteTemplates(t.saved || [])
    const rep = t.posterTemplates.restore()
    return {
      还原后套数: Object.keys(t.poster.remoteTemplates() || {}).length,
      还原后来源: t.poster.recipeSource(tpl),
      还原的id: Object.keys(t.poster.remoteTemplates() || {}).join(','),
      本机缓存装回: rep && rep.accepted,
      非GET: (wx.__feiGET || []).length,
      清单: (wx.__feiGET || []).join(' , ').slice(0, 120),
    }
  }, TPL)
  await mp.reLaunch('/pages/index/index')
  ck('收尾下发原样还原（十套都在，没把新种子留在内存里）', s9.还原后套数 === 10, `${s9.还原后套数} 套，restore 装回 ${s9.本机缓存装回}`)
  ck('全程零写（非 GET 请求 0 条）', s9.非GET === 0, s9.清单)

  const red = results.filter((r) => !r.ok)
  console.log(`\n结论：${results.length} 条，红 ${red.length} 条${red.length ? '（红＝结论，不是环境）' : ''}`)
  console.log(`截图三张：${OUT}`)
  mp.close()
  process.exit(red.length ? 1 : 0)
})().catch((e) => { console.log('!! 这把自己抛了：', (e && e.stack) || e); process.exit(2) })
