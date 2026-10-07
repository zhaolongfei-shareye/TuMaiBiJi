// 详情页右上那一格：两种画法、一个入口，而且那 readings 是从台账读回来的、不是喂进去的。
// 跑法：docs/工具/跑尺子.sh 9431 验-详情页那一格-真跑
//
// 站长 10-07 两句：「生成后，不应该出现生成卡片的入口，很多余，为什么不干掉。」
//               「我记得右上角是有笔记卡片的小图的，你是不是又漏了。」
// 这两句是同一件事的两面：v20 那一稿（10-03）把入口从底排挪进右上那一格——有卡片就画那张缩略图、
// 没有就画那枚淡底方形——但独立详情页从来没按这一稿落地过：底排那枚一直留着，右上那一格一直没有。
//
// 为什么必须真跑（静态那把 验-卡片那一格两页同源 查的是"两页一份实现"，查不到这四条）：
// ① 两种画法要问渲染后的面：`wx:if` 写反了屏上只会有一种，静态看不出来；
// ② **那一格的读数必须是台账里读回来的**：拿 setData 喂一张假卡片只能证明"会画"，证明不了
//    从笔记卡片页生成完退回这一页、那一格自己翻成缩略图（正是他报的第一句）；
// ③ 图被系统清了、账还留着那一态要退回「+」，而不是画一块白板；
// ④ 底排那枚撤了之后，屏上必须只剩一个把手，且两态各走对一条口（看大图 / 去生成）。
//
// 全程不写现网：用的笔记是他这台账号里**已有**的一篇（只读）。点那两下把 `wx.previewImage` 与
// `wx.navigateTo` 换成"只记不办"的替身——真进笔记卡片页会 POST 建一张分享码，那是写现网。
// 本机那本台账先整个抄下来、跑完原样放回；替身图跑完删掉。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const { i18n } = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))

const ROOT = path.resolve(__dirname, '../..')
const SHOT = path.join(ROOT, 'docs/design/10-07详情页那一格/实测')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const num = (v) => {
  const m = /(-?\d+(?:\.\d+)?)/.exec(String(v == null ? '' : v))
  return m ? Math.round(parseFloat(m[1])) : null
}
// 1×1 的 JPEG：只用来当"这张卡片还在"，不看内容。落进应用私有目录才有 `aliveFor` 那条的"图在"。
const JPG_B64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
  + 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf'
  + '/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=='

;(async () => {
  if (!fs.existsSync(SHOT)) fs.mkdirSync(SHOT, { recursive: true })
  let mp = null
  for (let i = 0; i < 6 && !mp; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上 9431，先跑 cli auto')

  /* 每一跳都重试：automator 在"页面刚被 navigateBack 拆掉"那一瞬会抛内部错
     （`Cannot destructure property 'rawPath' of getPageMetaByWebviewId(...) is null`）——
     那是工具在跟路由抢时机，不是判据红。路由只发不读，读页单独一跳，都用 callWxMethod：
     `mp.navigateTo(url)` 内部是"改路由→睡 3 秒→再读当前页"，那一页在这三秒里自己退掉就抛。 */
  const hop = async (label, fn, tries) => {
    let last = null
    for (let i = 0; i < (tries || 6); i += 1) {
      try { return await fn() } catch (e) { last = e; await sleep(6000) }
    }
    throw new Error(`${label} 连试六次都没成：${last && last.message}`)
  }
  const ev = (label, fn, arg) => hop(label, () => mp.evaluate(fn, arg))
  const go = (url) => hop(`进 ${url}`, () => mp.callWxMethod('navigateTo', { url }))
  const back = () => hop('退回', () => mp.callWxMethod('navigateBack', {}))
  const where = () => hop('读当前页', () => mp.currentPage())

  /* `mp.screenshot()` 是排队晚写的：同一批里前面那几张落盘时拍到的已是后面那一帧
     （10-03 实测过，两张文件名对不上内容）。拍之前记 mtime，拍完轮询它真的越过 t0。 */
  const shot = async (name) => {
    const p = path.join(SHOT, name)
    const t0 = fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0
    await hop(`拍 ${name}`, () => mp.screenshot({ path: p }))
    for (let i = 0; i < 30; i += 1) {
      if (fs.existsSync(p) && fs.statSync(p).mtimeMs > t0) return p
      await sleep(500)
    }
    throw new Error(`拍完没落盘：${name}`)
  }
  // 内置组件（image）没有 data()，attribute('src') 在不同基础库上不一定给，所以读渲染出来的那串。
  const attr = async (el, name) => {
    try {
      const v = (await el.attribute(name)) || ''
      if (v) return v
    } catch (e) { /* 落到下面读 outerWxml */ }
    const w = String((await el.outerWxml()) || '')
    const m = new RegExp(`${name}="([^"]*)"`).exec(w)
    return m ? m[1] : ''
  }

  await hop('进首页', () => mp.callWxMethod('reLaunch', { url: '/pages/index/index' }))
  await sleep(2500)

  // 挑一篇这一台账号里**已经存在**的非私密笔记（只读；私密那篇那一格整块不画）。
  const picked = await ev('挑一篇现成的笔记', () => {
    const p = getCurrentPages()[0]
    const ns = (p && p.data && p.data.notes) || []
    const first = ns.find((n) => !n.is_private)
    return { total: ns.length, id: first ? first.id : null, title: first ? String(first.title || '').slice(0, 12) : '' }
  })
  ck('这一台至少有一篇能读的笔记（读数那一半必须有真数据才跑得动，喂出来的不算）',
    picked && picked.id != null, `列表 ${picked && picked.total} 篇，拿的是「${picked && picked.title}」`)
  if (!picked || picked.id == null) {
    console.log('\n这一台没有可读的笔记，这一把停在第一步（不拿替身数据糊过去）')
    await mp.close()
    process.exit(1)
  }
  const NOTE_ID = picked.id

  // 先把这一台原本那本台账整个抄下来（他手机上这一格真可能有卡片），跑完原样放回。
  const snap = await ev('抄下原本那本账', () => {
    const raw = wx.getStorageSync('cardLog')
    return raw && typeof raw === 'object' ? JSON.parse(JSON.stringify(raw)) : {}
  })
  // 落那张替身图 + 摆"这一篇留过一张"。一次一趟传两个值：文件名写在函数体里，
  // 因为 `mp.evaluate` 是把函数序列化进小程序跑的，外面那个常量在那一侧不存在。
  // 写完立刻按 base64 读回一小段对一遍：`writeFileSync` 吃 ArrayBuffer 时编码参数写错是**静默**的
  // ——文件在、`accessSync` 过得去，但那不是一张图，屏上就是一块破图而判据全绿。
  const seeded = await ev('落那张替身图', (b64) => {
    const fp = `${wx.env.USER_DATA_PATH}/ruler-detail-cell.jpg`
    const fm = wx.getFileSystemManager()
    let wrote = ''
    let head = ''
    try {
      fm.writeFileSync(fp, wx.base64ToArrayBuffer(b64), 'binary')
      head = String(fm.readFileSync(fp, 'base64') || '').slice(0, 16)
    } catch (e) { wrote = `写替身图失败：${e && e.message}` }
    return { fp, wrote, head, want: String(b64).slice(0, 16) }
  }, JPG_B64)
  ck('替身那张"卡片"落进了应用私有目录，而且读回来还是那张 JPEG（不只是"文件在"）',
    seeded.wrote.indexOf('失败') < 0 && seeded.head === seeded.want,
    `读回 ${seeded.head} vs 应为 ${seeded.want}`)
  const FP = seeded.fp

  const seedOne = await ev('把这一篇那一格写成"留过一张、图还在"', (arg) => {
    const map = wx.getStorageSync('cardLog')
    const base = map && typeof map === 'object' ? map : {}
    base[String(arg.id)] = [{ p: arg.fp, tpl: 'classic', noQr: false, at: Date.now() }]
    wx.setStorageSync('cardLog', base)
    let alive = false
    try { wx.getFileSystemManager().accessSync(arg.fp); alive = true } catch (e) { alive = false }
    const n = (wx.getStorageSync('cardLog')[String(arg.id)] || []).length
    return { alive, entries: n }
  }, { id: NOTE_ID, fp: FP })
  ck('这一篇那一格里躺着一条"图还在"的留档（这是屏上那一格的唯一出处）',
    seedOne.alive === true && seedOne.entries === 1, JSON.stringify(seedOne))

  /* ---------- 一、有卡片那一态：画的是那张缩略图，屏上只剩一个把手 ---------- */
  await go(`/pages/detail/detail?id=${NOTE_ID}`)
  await sleep(3200)
  const d1 = await where()
  ck('当前停在详情页这一篇上（读的是真 id，不是 setData 喂的假状态）',
    d1 && d1.path === 'pages/detail/detail', d1 && d1.path)
  const pad = await d1.$('.ds-pad')
  ck('那一格画的是那张缩略图，不是「+」（留过卡片之后不该再给一个生成的口）', !!pad)
  ck('同一屏只有一个把手（`.ds-entry` 只一枚）',
    (await d1.$$('.ds-entry')).length === 1, `${(await d1.$$('.ds-entry')).length} 枚`)
  const bar1 = await d1.$$('.action-bar .icon-btn')
  const barTx1 = []
  for (const b of bar1) barTx1.push(await b.text())
  ck('底排那枚「生成笔记卡片」撤净了，只剩编辑／删除', barTx1.length === 2, barTx1.join('|'))
  const img = await d1.$('.ds-pad-img')
  const srcOfImg = img ? await attr(img, 'src') : ''
  ck('那张小图的 src 就是台账里那一条（贴别张就是"小图跟大图不匹对"那一类）',
    srcOfImg === FP, `${srcOfImg} vs ${FP}`)
  if (pad) {
    const s = await pad.size()
    const r = await (await d1.$('.ds-rt')).size()
    ck('白垫那一枚的面就是 252×352 那一份（与那一列同宽，不会被挤扁也不会留白条）',
      num(s.width) === num(r.width) && Math.abs(num(s.height) / num(s.width) - 352 / 252) < 0.03,
      `白垫 ${num(s.width)}×${num(s.height)}px · 那一列宽 ${num(r.width)}px · 比例 ${(num(s.height) / num(s.width)).toFixed(4)}（设计 ${(352 / 252).toFixed(4)}）`)
  }
  await shot('01-有卡片那一格.png')

  /* ---------- 二、点小图＝看大图（这一页没有画布，走 previewImage，不跳页） ---------- */
  await ev('把 previewImage 换成只记不办', () => {
    wx.__p1 = []
    if (!wx.__o1) wx.__o1 = wx.previewImage
    wx.previewImage = function (o) { wx.__p1.push(((o && o.urls) || []).slice()); return { errMsg: 'previewImage:ok(替身)' } }
    return true
  })
  await hop('点小图', async () => { await (await d1.$('.ds-pad')).tap() })
  await sleep(1200)
  const seen1 = await ev('读 previewImage 收到的是什么', () => ({
    got: (wx.__p1 || [])[0] || null, still: getCurrentPages().slice(-1)[0].route,
  }))
  ck('点那一格看的就是台账那张（urls 就是那一个地址，人还停在详情页）',
    Array.isArray(seen1.got) && seen1.got.length === 1 && seen1.got[0] === FP
    && seen1.still === 'pages/detail/detail', JSON.stringify(seen1))
  await ev('摘掉 previewImage 替身', () => { if (wx.__o1) { wx.previewImage = wx.__o1; delete wx.__o1 } return true })

  /* ---------- 三、账还在、图被系统清了：退回「+」那一态，不画白板 ---------- */
  await back()
  await sleep(1500)
  const deadSet = await ev('只撤那张图，账留着', (id) => {
    const fm = wx.getFileSystemManager()
    const fp = `${wx.env.USER_DATA_PATH}/ruler-detail-cell.jpg`
    try { fm.unlinkSync(fp) } catch (e) { /* 已经不在了也算撤了 */ }
    const m = wx.getStorageSync('cardLog')
    let fileGone = false
    try { fm.accessSync(fp); fileGone = false } catch (e) { fileGone = true }
    return { entryStillThere: ((m && m[String(id)]) || []).length, fileGone }
  }, NOTE_ID)
  ck('这一态摆好了：账里那条还在、图已经不在（他真机上清缓存就是这个形状）',
    deadSet.entryStillThere === 1 && deadSet.fileGone === true, JSON.stringify(deadSet))
  await go(`/pages/detail/detail?id=${NOTE_ID}`)
  await sleep(3200)
  const d2 = await where()
  ck('图没了就不画那块白板：那一格退回「+」那一态',
    !(await d2.$('.ds-pad')) && !!(await d2.$('.ds-empty')),
    `白垫=${!!(await d2.$('.ds-pad'))} 淡底方形=${!!(await d2.$('.ds-empty'))}`)
  ck('退回空态之后屏上仍是唯一一个把手',
    (await d2.$$('.ds-entry')).length === 1, `${(await d2.$$('.ds-entry')).length} 枚`)
  const e1 = await d2.$('.ds-e1'); const e2 = await d2.$('.ds-e2')
  ck('那两行小字是现网字典里那两句（不是这一轮新造的词）',
    !!e1 && !!e2 && (await e1.text()) === i18n.zh.shareAsImage && (await e2.text()) === i18n.zh.noCards,
    `${e1 ? await e1.text() : '—'} / ${e2 ? await e2.text() : '—'}`)
  if (e1) {
    const sw = await (await d2.$('.ds-swatch')).size()
    ck('那枚淡底方形还是 176 见方（吃列表那一枚方块的数，不是一页一个尺寸）',
      Math.abs(num(sw.height) - num(sw.width)) <= 2, `${num(sw.width)}×${num(sw.height)}px`)
  }
  await shot('02-图被清了退回那一格空态.png')

  /* ---------- 四、点空态那一格＝去生成（这一把只记不办：真去就会 POST 建码） ---------- */
  await ev('把 navigateTo 换成只记不办', () => {
    wx.__p2 = []
    if (!wx.__o2) wx.__o2 = wx.navigateTo
    wx.navigateTo = function (o) { wx.__p2.push((o && o.url) || ''); return { errMsg: 'navigateTo:ok(替身)' } }
    return true
  })
  await hop('点空态那一格', async () => { await (await d2.$('.ds-entry')).tap() })
  await sleep(1200)
  const seen2 = await ev('读 navigateTo 收到的是什么', () => ({
    got: (wx.__p2 || [])[0] || null, still: getCurrentPages().slice(-1)[0].route,
  }))
  ck('空态那一格点下去是去这一篇的笔记卡片页（带的就是这个 id，人没真跳过去）',
    seen2.got === `/pages/share/share?id=${NOTE_ID}` && seen2.still === 'pages/detail/detail',
    JSON.stringify(seen2))
  await ev('摘掉 navigateTo 替身', () => { if (wx.__o2) { wx.navigateTo = wx.__o2; delete wx.__o2 } return true })

  /* ---------- 五、还原 ---------- */
  await back()
  await sleep(1200)
  const rest = await ev('把原本那本账放回去', (book) => {
    wx.setStorageSync('cardLog', book)
    const fp = `${wx.env.USER_DATA_PATH}/ruler-detail-cell.jpg`
    try { wx.getFileSystemManager().unlinkSync(fp) } catch (e) { /* 本就没落 */ }
    let fileGone = false
    try { wx.getFileSystemManager().accessSync(fp); fileGone = false } catch (e) { fileGone = true }
    // 那两个记录数组也挂在 wx 上，跟替身一起摘掉——留着下次这把尺子读到上一轮的记录就是假绿。
    delete wx.__p1; delete wx.__p2
    const same = JSON.stringify(wx.getStorageSync('cardLog')) === JSON.stringify(book)
    return { same, fileGone, patched: !!wx.__o1 || !!wx.__o2 || !!wx.__p1 || !!wx.__p2 }
  }, snap)
  ck('收尾：原本那本账原样放回、替身图与那两层替身都不留在这台工具上',
    rest.same === true && rest.fileGone === true && rest.patched === false, JSON.stringify(rest))

  await mp.close()
  console.log(`\n${bad.length === 0 ? '全过' : `红 ${bad.length} 条`}`)
  bad.forEach((n) => console.log(`  ✗ ${n}`))
  console.log(`图：${SHOT}`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => {
  console.log(`✗ 这把尺子自己崩了（不是判据红）：${e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e}`)
  process.exit(2)
})
