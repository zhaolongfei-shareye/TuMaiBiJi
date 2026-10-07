// 一篇只留一张卡片：笔记卡片页这一页也守得住吗。跑法：docs/工具/跑尺子.sh 9431 验-一篇一张-真跑
//
// 站长 10-07 报的漏口：「生成一次后，还能继续生成卡片，这个不符合之前的约定。无论有没有附上
// 图片，每个笔记只能生成一张卡片，除非删除了再生成。」首页那层成品弹窗一直有"已生成态"
// （1.9.19），漏的是 `pages/share/share` 这一页——从详情页进它，台账里有没有这张它都照出。
//
// 这一把要拿到的证据有两层，缺一层都不算数：
//   ① 挡下来了（页面被退回原页，人不会停在一个能继续点的屏上）；
//   ② **是在 POST 建分享码之前挡下的**——`generateShareImage()` 第一趟就是建码，挡晚了等于
//      "这篇不许有第二张卡片"和"这篇已经多了第二张活码"同时成立，而后者是写现网的。
// 所以这里给 `wx.request` 套一层记录器，逐条记下 method + url，判的是"这一趟没有
// POST /api/shares/"。**不是判"请求数为 0"**：挡下之后退回首页，首页 onShow 自己就要拉
// 笔记/分类/额度三趟，数总数会把那三趟算成这一页的（第一版就是这么假红一条）。
//
// 全程不碰现网数据：用的笔记 id 是一个不存在的号（987654），台账那一格是本机塞进去的替身。
// 替身摆三态：账在图在（该挡）、账在图没（**不该挡**——这一态详情页那一格画的是「+」）、
// 整条撤掉（该放行）。后两态各发一次 createShare 打一个不存在的 id → 服务端 `_owned_note`
// 判 404，一行都不写；这两趟存在的意义是证明"挡住①的是那道闸，不是别的东西"，以及
// "闸和那一格吃的是同一条判据"。跑完把本机存储、那张替身图与 wx 上那两层补丁都还原。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const { i18n } = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))

const ROOT = path.resolve(__dirname, '../..')
const FAKE_ID = 987654
const MSG = i18n.zh.cardOneOnly
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

// ---------- 静态：顺序与"另一处入口没被带歪" ----------
const SHARE_JS = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/share/share.js'), 'utf8')
const SHARE_WXML = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/share/share.wxml'), 'utf8')
const INDEX_WXML = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxml'), 'utf8')
const atGuard = SHARE_JS.indexOf('cardLog.aliveFor(')
const atCreate = SHARE_JS.indexOf('api.createShare(')
const atRender = SHARE_JS.indexOf('this.generateShareImage()')
ck('这一页确实问了台账', atGuard > 0)
ck('问台账排在建分享码之前（顺序错了就是"卡片只许一张"和"活码多了一张"同时成立）',
  atGuard > 0 && atGuard < atCreate, `aliveFor@${atGuard} createShare@${atCreate}`)
ck('也排在整趟生成之前（generateShareImage 里第一件就是那次 POST）',
  atGuard > 0 && atGuard < atRender, `aliveFor@${atGuard} generate@${atRender}`)
/* 这道闸和"右上那一格画不画图"必须是同一条判据（`cardLog.aliveFor`：倒序 + 图不在就不列）。
   各判各的会长出这样一屏：那一格显示"还没有生成过卡片"，点进来被挡回"这篇已经有一张"。
   10-07 之前 share.js 吃的是裸 `forNote`（账在就算有），详情页与详情窗吃的是筛过图的那一份。 */
const DETAIL_JS = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/detail/detail.js'), 'utf8')
const INDEX_JS = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.js'), 'utf8')
ck('闸与两页那一格吃同一个谓词（三处都走 cardLog.aliveFor，没有第二份筛选）',
  /cardLog\.aliveFor\(noteId\)\.length/.test(SHARE_JS)
  && /cardLog\.aliveFor\(note\.id\)/.test(DETAIL_JS)
  && /cardLog\.aliveFor\(noteId\)/.test(INDEX_JS)
  && !/cardLog\.forNote\(/.test(SHARE_JS + DETAIL_JS + INDEX_JS),
  `闸=${/aliveFor/.test(SHARE_JS)} 详情页=${/aliveFor/.test(DETAIL_JS)} 首页=${/aliveFor/.test(INDEX_JS)} 还吃裸 forNote=${/cardLog\.forNote\(/.test(SHARE_JS + DETAIL_JS + INDEX_JS)}`)
ck('挡下时给的是字典里那句（不写死中文，这台工具可能停在英文态）',
  /t\('cardOneOnly', lang\)/.test(SHARE_JS) && !!MSG, MSG)
ck('这一页仍然留着退回（不是一句提示把人钉在屏上）',
  /setTimeout\(\(\) => wx\.navigateBack\(\), 1600\)/.test(SHARE_JS))
// 首页那一处：生成那一枚必须只在"未生成"那一态里。分支写法是 `<block wx:if="{{posterHasCard}}">`
// …`<block wx:else>`…，所以判的是**位置**（在 else 之后），不是"这一串里有没有"——
// 第一版拿 `wx:if="{{!posterHasCard}}"` 去切，那个串在文件里只挂在圆点那一行上，切出来的
// 那段既没有生成按钮也没有分享按钮，判据当场假红。
const hasAt = INDEX_WXML.indexOf('wx:if="{{posterHasCard}}"')
const elseAt = INDEX_WXML.indexOf('<block wx:else>', hasAt)
const genAt = INDEX_WXML.indexOf('onSavePoster')
ck('首页那枚「生成分享图」在未生成那一态（排在 posterHasCard 的 else 之后）',
  hasAt > 0 && elseAt > 0 && genAt > elseAt, `has@${hasAt} else@${elseAt} gen@${genAt}`)
ck('已生成那一态里没有生成按钮，只有再分享／查看笔记／删除这三枚',
  hasAt > 0 && elseAt > hasAt
  && INDEX_WXML.slice(hasAt, elseAt).indexOf('onSavePoster') < 0
  && /onShareCard/.test(INDEX_WXML.slice(hasAt, elseAt))
  && /onDropCard/.test(INDEX_WXML.slice(hasAt, elseAt)))
ck('中英两侧都有那一句', !!i18n.zh.cardOneOnly && !!i18n.en.cardOneOnly,
  `${i18n.zh.cardOneOnly} / ${i18n.en.cardOneOnly}`)

// ---------- 真跑：挡下来 + 一个请求都没发 ----------
;(async () => {
  let mp = null
  for (let i = 0; i < 6 && !mp; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上 9431，先跑 cli auto')
  /* automator 在"页面刚被 navigateBack 拆掉"那一瞬会抛内部错
     （实测：`Cannot destructure property 'rawPath' of getPageMetaByWebviewId(...) is null`）。
     这不是判据红，是工具在跟路由抢时机——所以每一跳都重试一次，别把它记成回归。
     同一条道理写在 验-配图三处渲染-真跑 的进页循环里。 */
  const hop = async (label, fn, tries) => {
    let last = null
    for (let i = 0; i < (tries || 6); i += 1) {
      try { return await fn() } catch (e) { last = e; await sleep(6000) }
    }
    throw new Error(`${label} 连试六次都没成：${last && last.message}`)
  }

  await hop('进首页', () => mp.callWxMethod('reLaunch', { url: '/pages/index/index' }))
  await sleep(2500)

  // 给 wx.request / wx.showToast 各套一层记录器（跑完还原）。
  // 记的是**每一条的 method + url**，不是总数：这一页挡下之后会退回首页，而首页 onShow 自己
  // 要拉笔记/分类/额度那三趟——第一版判"请求数为 0"，被这三趟顶红了一条，那不是我改坏的，
  // 是判据数错了对象。这一条真正要钉的是"没顺手 POST 建出第二张分享码"。
  const ev = (label, fn, arg) => hop(label, () => mp.evaluate(fn, arg))
  await ev('装记录器', () => {
    if (!wx.__orig) {
      wx.__orig = { request: wx.request, showToast: wx.showToast }
      wx.__calls = { req: [], toast: [] }
      wx.request = function (o) {
        wx.__calls.req.push(((o && o.method) || 'GET') + ' ' + String((o && o.url) || '').split('?')[0])
        return wx.__orig.request.apply(wx, arguments)
      }
      wx.showToast = function (o) {
        wx.__calls.toast.push((o && o.title) || '')
        return wx.__orig.showToast.apply(wx, arguments)
      }
    }
    return true
  })
  const reset = () => ev('清记录', () => { wx.__calls = { req: [], toast: [] }; return true })
  const readBack = () => ev('读记录', () => ({
    req: wx.__calls.req.slice(), toast: wx.__calls.toast.slice(),
  }))
  /* 替身怎么摆：闸现在吃的是 `cardLog.aliveFor`——"账里有一条 **而且那张图还在**"才算有。
     所以替身必须真落一个文件（原来那版只塞 `{tpl, noQr, thumb}`、没有 `p`，在新谓词下会被
     筛掉，测的就不是那道闸了；这是判据要跟着谓词走，不是把代码改回去迁就旧尺子）。
     'live'＝账在且图在（该挡）；'dead'＝账在但图被清掉（**不该挡**，正是详情页那一格会画成
     「+」的那一态）；'off'＝整条撤掉（该放行）。 */
  const PROBE = 'ruler-live-card-987654.jpg'
  const seed = (mode) => ev('摆替身', (v) => {
    const key = 'cardLog'
    const map = wx.getStorageSync(key)
    const base = map && typeof map === 'object' ? map : {}
    // 文件名写在函数体里，不从外面递：`mp.evaluate` 是把函数序列化进那台小程序跑的，
    // 外面那个 PROBE 常量在那一侧不存在（只能拿它核对读数）。
    const fp = `${wx.env.USER_DATA_PATH}/ruler-live-card-987654.jpg`
    const fm = wx.getFileSystemManager()
    if (v === 'off') {
      delete base['987654']
      try { fm.unlinkSync(fp) } catch (e) { /* 本就没落 */ }
    } else {
      if (v === 'live') { try { fm.writeFileSync(fp, 'ruler-substitute', 'utf8') } catch (e) { return `写替身图失败:${e && e.message}` } }
      // 'dead' 必须**主动把上一态那张图撤掉**：live 那一趟已经落过盘了，只"不写"等于还留着，
      // 那一态就摆不出来（第一版就是这么红的——它测的是"撤没撤干净"，不是"写没写"）。
      if (v === 'dead') { try { fm.unlinkSync(fp) } catch (e) { /* 本就没落，也算撤了 */ } }
      base['987654'] = [{ p: fp, tpl: 'classic', noQr: false, at: Date.now() }]
    }
    wx.setStorageSync(key, base)
    let hasFile = false
    try { fm.accessSync(fp); hasFile = true } catch (e) { hasFile = false }
    return { keys: Object.keys(wx.getStorageSync(key) || {}).length, hasFile, mode: v }
  }, mode)
  // 路由走 callWxMethod 而不是 mp.navigateTo：后者内部是"改路由 → 睡 3 秒 → 再读当前页"，
  // 这一页在它那三秒里自己 navigateBack 掉了，读那一趟就抛上面那个内部错，而重试会变成
  // **再推一层这一页**——判据就测的不是那一次进入了。拆开：只发路由，读页单独重试。
  const go = () => hop('进卡片页', () => mp.callWxMethod('navigateTo', { url: `/pages/share/share?id=${FAKE_ID}` }))
  const where = () => hop('读当前页', () => mp.currentPage())

  const isCreateShare = (l) => /^POST .*\/api\/shares\/$/.test(l)

  // ① 账在、图也在：应当被挡下，且一条建码请求都不发
  const s1 = await seed('live')
  ck('替身落进本机台账了，而且那张"图"真的在盘上（新谓词认的是账 + 图两样）',
    s1 && s1.keys >= 1 && s1.hasFile === true, JSON.stringify(s1))
  await reset()
  await go()
  await sleep(3000)
  const cur = await where()
  const r1 = await readBack()
  ck('台账里已有这张：这一页没留住人，退回原页',
    cur && cur.path !== 'pages/share/share', cur && cur.path)
  ck('而且没顺手建出第二张分享码（这一趟一条 POST /api/shares/ 都没有）',
    r1.req.filter(isCreateShare).length === 0, JSON.stringify(r1.req))
  ck('给的那句就是字典里那句', r1.toast.indexOf(MSG) >= 0, JSON.stringify(r1.toast))

  // ② 账在、图被系统清了：这一态详情页与详情窗那一格画的是「+」（点得动），所以这道闸**不许**挡。
  //    10-07 之前闸吃裸 forNote、那一格吃筛过图的那份，两边会在这一态打架：界面说"还没生成过"，
  //    点进来回一句"这篇已经有一张"。
  const s2 = await seed('dead')
  ck('第二态摆好了：账里那条还在、图已经不在了',
    s2 && s2.keys >= 1 && s2.hasFile === false, JSON.stringify(s2))
  await reset()
  await go()
  await sleep(1500)
  const r2 = await readBack()
  ck('图不在了就不挡：同一趟照常去建码（闸跟那一格吃同一条判据）',
    r2.req.filter(isCreateShare).length >= 1 && r2.toast.indexOf(MSG) < 0,
    `${JSON.stringify(r2.req)} / 吐司=${JSON.stringify(r2.toast)}`)
  await sleep(3000) // 那趟会因 404 自己退回，别把补丁留在飞着的页上

  // ③ 反向对照：整条撤掉，同一页同一 id 也真去建码——证明①那条红不会是"这一页根本没跑起来"
  await seed('off')
  await reset()
  await go()
  await sleep(1500)
  const r3 = await readBack()
  ck('反向对照：台账空着时同一趟真会 POST 建码（所以①那条红不会是"页面没跑起来"）',
    r3.req.filter(isCreateShare).length >= 1, JSON.stringify(r3.req))
  await sleep(3000) // 那趟会因 404 自己退回，别把补丁留在飞着的页上
  const cur2 = await where()
  ck('不存在的笔记 id 打建码接口：服务端不认，页面自己退回（现网零写入）',
    cur2 && cur2.path !== 'pages/share/share', cur2 && cur2.path)

  // 还原
  await ev('还原补丁', () => {
    if (wx.__orig) { wx.request = wx.__orig.request; wx.showToast = wx.__orig.showToast; delete wx.__orig }
    const m = wx.getStorageSync('cardLog')
    if (m && m['987654']) { delete m['987654']; wx.setStorageSync('cardLog', m) }
    try { wx.getFileSystemManager().unlinkSync(`${wx.env.USER_DATA_PATH}/ruler-live-card-987654.jpg`) } catch (e) { /* 本就没落 */ }
    return true
  })
  const left = await ev('复查还原', () => {
    const m = wx.getStorageSync('cardLog')
    let fileStillThere = true
    try { wx.getFileSystemManager().accessSync(`${wx.env.USER_DATA_PATH}/ruler-live-card-987654.jpg`) } catch (e) { fileStillThere = false }
    return !!(m && m['987654']) || !!wx.__orig || fileStillThere
  })
  ck('收尾：替身那条账、那张替身图、那两层补丁都不留在这台工具上', left === false, String(left))
  await mp.close()

  console.log(`\n${bad.length === 0 ? '全过' : `红 ${bad.length} 条`}`)
  bad.forEach((n) => console.log(`  ✗ ${n}`))
  process.exit(bad.length ? 1 : 0)
})().catch((e) => {
  console.log(`✗ 这把尺子自己崩了（不是判据红）：${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`)
  process.exit(2)
})
