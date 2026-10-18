/**
 * 一把尺子（真跑）：分类那一排的闸（站长 10-18 三段话，最后一段把中间那一枚打回了）。
 *   「分类数量要做限制，最多8个包括私密分类，私密永远排最后一格。数量超过就，输入框就提示要删除才能添加。
 *     分类名称最多4个汉字。英文长度，你帮我设好（但显示时候，在列表页多个分类排列时候进行裁切…）但，不影响详情页显示。」
 *   「1。增加一个新增入口… 2。数量已达上限…名字被切短，划过去的那一句，显示在对应的元素上面」
 *   「列表上怎么多了一个“新增”，有点多余啊，去掉」← 中间那一枚芯片连同它的皮与话术一起撤净
 *
 * ⚠ 这一把**一个字都不上服务端**：全程只动本机草稿（`_catDraft`），收尾走 `_catExit()`（丢弃，不是保存）。
 *   另两重保险：`wx.request`／`wx.uploadFile` 被套了一层，非 GET 一律挡下并记名（最后一条钉的就是这个计数＝0）；
 *   `wx.showToast`／`wx.showModal` 只记账不真弹（免得一层盖住另一层的读数）。
 *   ⚠ 所以这一把量的是"逻辑、结构与落点坐标"。那句话说得对不对、浮层压在那一枚上面好不好看，
 *     这一把量不到 —— 那一段要他扫预览码在自己手机上看。
 *
 * 跑法：docs/工具/跑尺子.sh 9431 验-分类上限与长度-真跑
 */
const automator = require('miniprogram-automator')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const APORT = process.env.MP_PORT || 9431
const CAP_RPX = 150   // 与 index.wxss 的 `.ix-cat-t { max-width: 150rpx }` 同一个数
const CAT_MAX = 8     // 与 index.js 的 `CAT_MAX` 同一个数（这一把故意写死，为的是两端不一致时能红）

const results = []
const ck = (name, ok, got) => { results.push({ name, ok, got }); console.log(`  ${ok ? '✓' : '✗'} ${name}${got ? '　→ ' + got : ''}`) }

;(async () => {
  let mp
  for (let i = 0; i < 12; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${APORT}` }); break }
    catch (e) { await sleep(4000) }
  }
  if (!mp) { console.log('!! 连不上自动化端口'); process.exit(2) }
  await mp.switchTab('/pages/index/index')
  await sleep(4000)

  // ---------- 等逻辑层就位（这一型红过：拿到空 data 就当读数）----------
  let ready = null
  for (let i = 0; i < 12; i++) {
    ready = await mp.evaluate(() => {
      const p = getCurrentPages().slice(-1)[0]
      const d = (p && p.data) || {}
      return { hasPage: !!(p && d.catView), cats: (d.categories || []).length }
    })
    if (ready && ready.hasPage && ready.cats >= 1) break
    await sleep(5000)
  }
  if (!ready || !ready.hasPage || ready.cats < 1) {
    console.log(`!! 环境红：这一台没读到分类表（${JSON.stringify(ready)}）——不是产品红，是这一趟没起来`)
    process.exit(2)
  }

  // ---------- 三层记账套子（只记不弹，非 GET 一律挡下）----------
  await mp.evaluate(() => {
    const w = globalThis.wx
    if (w.__zhangji) return 'already'
    w.__zhangji = 1
    w.__toasts = []; w.__modals = []; w.__writes = []; w.__reads = 0
    w.__orig = { toast: w.showToast, modal: w.showModal, request: w.request, upload: w.uploadFile }
    w.showToast = (o) => { w.__toasts.push(String((o && o.title) || '')) }
    w.showModal = (o) => {
      w.__modals.push(String((o && o.title) || ''))
      if (o && o.success) o.success({ confirm: false, cancel: true })
    }
    const oReq = w.request
    w.request = (o) => {
      const m = String((o && o.method) || 'GET').toUpperCase()
      if (m === 'GET') { w.__reads += 1; return oReq.call(w, o) }
      w.__writes.push(m + ' ' + String((o && o.url) || '').replace(/^https?:\/\/[^/]+/, ''))
      if (o && typeof o.fail === 'function') o.fail({ errMsg: '尺子挡下：这一把不许写服务端' })
      return { abort() {} }
    }
    const oUp = w.uploadFile
    w.uploadFile = (o) => {
      w.__writes.push('UPLOAD ' + String((o && o.url) || '').replace(/^https?:\/\/[^/]+/, ''))
      if (o && typeof o.fail === 'function') o.fail({ errMsg: '尺子挡下' })
      return { abort() {} }
    }
    return 'on'
  })

  const snap = () => mp.evaluate(() => {
    const p = getCurrentPages().slice(-1)[0]
    const d = p.data || {}
    return {
      cats: (d.categories || []).length,
      view: (d.catView || []).map((v) => ({ key: v.key, label: v.label, state: v.state || '', lock: v.lock || '' })),
      draft: (p._catDraft || []).map((x) => ({ key: x.key, name: x.name, isPrivate: !!x.isPrivate })),
      edit: !!d.catEdit, ph: d.catPh || '', newName: d.catNewName || '',
      note: d.catNote || '', noteKey: d.catNoteKey || '', noteX: d.catNoteX || 0, noteY: d.catNoteY || 0,
      toasts: (globalThis.wx.__toasts || []).slice(), modals: (globalThis.wx.__modals || []).slice(),
      writes: (globalThis.wx.__writes || []).slice(),
      win: (globalThis.wx.getWindowInfo ? globalThis.wx.getWindowInfo() : globalThis.wx.getSystemInfoSync()).windowWidth,
    }
  })
  // ⚠ 交完必须等一拍再读那一句：浮层是 `createSelectorQuery().exec` 的回调里才 setData 的，
  //   10-18 现量落点约 300ms（这一把自己红过两条，红的全是尺子读早了，不是产品没画）。
  const commit = async (text) => {
    await mp.evaluate((t) => {
      const p = getCurrentPages().slice(-1)[0]
      p.setData({ catNewName: t })
      p.onCatAddCommit()
      return 1
    }, text)
    await sleep(500)
  }
  // 一屏上量的两件事：那一排每一枚里层文字盒的宽，与"那一个东西"现在在屏上的位置
  const chipWidths = () => mp.evaluate(() => new Promise((res) => {
    const p = getCurrentPages().slice(-1)[0]
    p.createSelectorQuery().selectAll('.ix-cat-t').boundingClientRect().exec((r) => res(((r && r[0]) || []).map((x) => x.width)))
  }))
  // ⚠ 括号要数清楚：少一个右括号，`, sel, i)` 就被吸进 `new Promise(...)` 的实参里，
  //   外层那枚箭头函数变成"只吃 s、idx 两个形参、体内却念 sel"——`node --check` 照样过，
  //   连上 IDE 才报 `Uncaught sel is not defined`（10-18 这一把就崩在 R4c 之前）。
  const rectOf = (sel, i) => mp.evaluate((s, idx) => new Promise((res) => {
    const p = getCurrentPages().slice(-1)[0]
    p.createSelectorQuery().selectAll(s).boundingClientRect().exec((r) => {
      const list = ((r && r[0]) || [])
      res(list[idx] ? { left: list[idx].left, top: list[idx].top, width: list[idx].width } : null)
    })
  }), sel, i)

  const a = await snap()
  const capPx = Math.round(CAP_RPX * a.win / 750 * 100) / 100
  console.log(`读数｜平时那一态：分类 ${a.cats} 格／屏上 ${a.view.length} 枚／屏宽 ${a.win}px／150rpx 折算 ${capPx}px`)

  // ---------- ① 那一排只有「全部」＋他自己的那几格（「新增」那一枚他打回了）----------
  ck('R1 那一排没有多出来的「新增」：枚数＝分类数＋1（只多「全部」），且没有 key=add、没有念「新增」的那一枚',
    a.view.length === a.cats + 1 && !a.view.some((v) => v.key === 'add') && !a.view.some((v) => /^新增$/.test(v.label)),
    `${a.view.length} 枚／要 ${a.cats + 1}`)
  const privIdx = a.view.findIndex((v) => /私密/.test(v.label))
  ck('R2 平时那一态：私密那一格排在最后一位（「永远排最后一格」）',
    privIdx < 0 || privIdx === a.view.length - 1, `私密在第 ${privIdx}／共 ${a.view.length} 枚`)

  // ---------- ② 裁切：规则落没落到节点上，长名字裁不裁 ----------
  const w0 = await chipWidths()
  ck('R2b 屏上每一枚文字盒都不超上界（150rpx 折算那一个数）',
    w0.length > 0 && w0.every((x) => x <= capPx + 1), `${w0.length} 枚，最宽 ${Math.max.apply(null, w0.concat(0)).toFixed(1)}px`)
  const page = await mp.currentPage()
  // 变量名一律拉丁字母：`const盒` 这种"关键字紧跟中文"写出来是一个标识符，node --check 过得了、
  // 跑起来才报 `盒 is not defined`（10-18 这一把自己崩在 R2c 之前，崩之前 R1／R2b 都已绿）。
  const ttEls = await page.$$('.ix-cat-t')
  const capStyle = ttEls.length ? await ttEls[0].style('max-width') : ''
  ck('R2c 裁切那条规则真的落在节点上（里层盒子的计算 max-width 就是折算那一个数）',
    ttEls.length > 0 && Math.abs(parseFloat(capStyle) - capPx) <= 1, `${ttEls.length} 枚，计算值 ${capStyle}`)
  // 这一台此刻没有超长名字可裁（最宽那枚才 20 几 px）⇒ 拿一枚替身把"裁不裁"量实：
  // 只改渲染源那一格，一个字都不进数据、不发请求，量完立刻还原。
  const fed = await mp.evaluate(() => {
    const p = getCurrentPages().slice(-1)[0]
    p.__probe0 = (p.data.catView || []).slice()
    p.setData({ catView: p.__probe0.concat([{
      key: '__probe', id: 999999, label: '这一枚名字故意取得很长很长看看它裁不裁得掉', x: false, state: ' pending', lock: '',
    }]) })
    return p.data.catView.length
  })
  await sleep(700)
  const w1 = await chipWidths()
  const probeW = w1.length ? w1[w1.length - 1] : 0
  await mp.evaluate(() => {
    const p = getCurrentPages().slice(-1)[0]
    p.setData({ catView: p.__probe0 })
  })
  await sleep(500)
  ck('R2d 喂一枚长标签进去（只改渲染源）：那一枚被夹到上界，长名字真裁得掉',
    fed > 0 && probeW >= capPx - 1 && probeW <= capPx + 1, `替身宽 ${probeW.toFixed(1)}px／上界 ${capPx}px`)

  // ---------- ③ 进管理态：长度闸 ----------
  await mp.evaluate(() => { getCurrentPages().slice(-1)[0].onCatManageTap() })
  await sleep(1200)
  const m0 = await snap()
  ck('R3 管理态进得去，草稿长度 = 分类数（这一趟只画皮，没动数据）',
    m0.edit && m0.draft.length === m0.cats, `草稿 ${m0.draft.length}／表 ${m0.cats}`)

  // 这一台账号本来就满 8 格 ⇒ 先在**本机草稿**里腾出一格，好让"落得进去"那一段真走到（只删草稿、
  // 一个字都不上服务端，收尾走 `_catExit` 丢弃，R10b 钉的就是全程零写）。不腾这一格，R4～R6 量到的
  // 全是数量闸在挡路：长度闸挡没挡、新格落不落得进去，两条都没有读数＝假绿（10-18 就是这么红了一次）。
  const freed = await mp.evaluate(() => {
    const p = getCurrentPages().slice(-1)[0]
    const i = (p._catDraft || []).findIndex((x) => !x.isPrivate && x.id !== null)
    if (i < 0) return null
    p._catDraft.splice(i, 1)
    p.setData(p._catPaint(true))
    return i
  })
  await sleep(600)
  const m1 = await snap()
  ck('R3b 本机草稿里腾出一格：草稿少一格，且屏上那一排的枚数跟着少一枚（渲染源与草稿同数＝拖动那条映射才对得上）',
    freed !== null && m1.draft.length === m1.cats - 1 && m1.view.length === m1.draft.length,
    `腾在第 ${freed} 格／草稿 ${m1.draft.length}／表 ${m1.cats}／屏上 ${m1.view.length} 枚`)
  const before = m1.draft.length
  await commit('这个名字长得超出上限了')
  const cjk = await snap()
  await commit('abcdefghijklmnop')
  const lat = await snap()
  ck('R4 超长那两条一条都没落（汉字与字母各数各的，两条都挡住）',
    cjk.draft.length === before && lat.draft.length === before, `要停在 ${before}，实得 ${cjk.draft.length}／${lat.draft.length}`)
  ck('R4b 没落的字**原样留在框里**（不许静默吞掉他打的那几个字）',
    cjk.newName.indexOf('这个名字长得超出上限了') >= 0 && lat.newName.indexOf('abcdefghijklmnop') >= 0,
    `框里＝「${lat.newName}」`)
  const addRect = await rectOf('.ixl-add', 0)
  ck('R4c 那一句浮在**输入框那一片**上面（他第二句「显示在对应的元素上面」），不是屏中央那一条闪',
    /4 个汉字|10 个字母|Chinese characters/.test(lat.note) && !!addRect
    && Math.abs(lat.noteX - (addRect.left + addRect.width / 2)) <= 1.5
    && Math.abs(lat.noteY - (addRect.top - 8)) <= 1.5,
    `「${lat.note}」 @(${lat.noteX.toFixed(0)}, ${lat.noteY.toFixed(0)})／框中心 ${addRect ? (addRect.left + addRect.width / 2).toFixed(0) : '?'},${addRect ? (addRect.top - 8).toFixed(0) : '?'}`)
  ck('R4d 同一趟**没有**再走屏中央那一条 toast（一句提示弹两下算两处落点）',
    lat.toasts.length === 0, `toast 计数 ${lat.toasts.length}`)

  await commit('尺甲91')
  const mix = await snap()
  // 这一条不许钉"必须落一格"：这一台账号本来就满 8 格（10-18 实测 cats=8），格子满了任何合格的名字都落不进，
  // 那是**数量闸**在说话，不是长度闸。所以判据按有没有格子分两支——两支共用的那一句话是：
  // 「2 汉字＋2 字母」这种混合串在长度这一关是过了的（顶回来的那句绝不能是"最多 4 个汉字"）。
  const room = mix.draft.length === before + 1
  ck('R5 混合那一串（2 汉字＋2 字母＝4 个字符）过的是长度这一关：有格子就落格，满格子说的也是"先删"而不是"太长"',
    room ? mix.draft.some((x) => /尺甲91/.test(x.name))
      : (/先删|delete one/.test(mix.note) && !/汉字|characters/.test(mix.note)),
    room ? `落进去了（草稿 ${mix.draft.length}，末格＝${(mix.draft[mix.draft.length - 1] || {}).name}——私密恒在最后，新格不在末位）`
      : `这一台本来就满 ${CAT_MAX} 格，顶回来那句＝「${mix.note}」`)

  // ---------- ④ 数量闸：本地补到 8，再交一条 ----------
  let cur = mix
  for (let i = 92; cur.draft.length < CAT_MAX && i < 130; i++) {
    await commit(`尺甲${i}`)
    cur = await snap()
  }
  ck(`R6 落完正好满 ${CAT_MAX} 格（含私密那一格一起数）`, cur.draft.length === CAT_MAX,
    `${cur.draft.length} 格（这一趟本机补进 ${cur.draft.length - before} 格，其余靠开局那几格）`)
  const hasPriv = cur.draft.some((x) => x.isPrivate)
  const privIdx2 = cur.draft.findIndex((x) => x.isPrivate)
  ck('R7 满那一档私密那一格仍在草稿最后一格（新格落进来要重沉一次，不许插到它后面）',
    !hasPriv || privIdx2 === cur.draft.length - 1,
    hasPriv ? `私密在第 ${privIdx2}／共 ${cur.draft.length} 格` : '这一台没有私密那一格（这一条没有读数）')
  const nBefore = cur.draft.length
  await commit('尺乙01 尺乙02')
  const over = await snap()
  ck(`R8 满 ${CAT_MAX} 再交两条 ⇒ 一条都不落（全有全无），那一句说的是"先删掉一个才能加"`,
    over.draft.length === nBefore && /8 个|delete one/.test(over.note), `草稿 ${over.draft.length}／「${over.note}」`)
  ck('R8b 被挡的那几个字照原样留在框里', over.newName.indexOf('尺乙01') >= 0, `框里＝「${over.newName}」`)
  ck('R8c 满那一档：输入框那句占位话改口了', /8/.test(over.ph) && /删|delete/.test(over.ph), `catPh＝「${over.ph}」`)

  // ---------- ⑤ 私密那一格：点下去不弹改名框，话浮在它上面 ----------
  const modalsBefore = over.modals.length
  const privKey = await mp.evaluate(() => {
    const p = getCurrentPages().slice(-1)[0]
    const it = (p._catDraft || []).filter((x) => x.isPrivate)[0]
    if (!it) return ''
    p.onCatChipTap({ currentTarget: { dataset: { key: it.key, id: it.id } } })
    return it.key
  })
  await sleep(900)
  const priv = await snap()
  const chipRect = privKey ? await rectOf('.ix-cat', priv.view.findIndex((v) => v.key === privKey)) : null
  ck('R9 点私密那一格：不弹改名的框（服务端那一道 PUT 也无条件挡着，两条腿各钉一处）',
    !privKey || priv.modals.length === modalsBefore, `弹窗计数 ${modalsBefore}→${priv.modals.length}`)
  // ⚠ 落点比的是**夹进屏宽之后**的那个中心，不是芯片自己的中心：那一排在横向 scroll-view 里，
  //   私密那一格恒在最后，九格时它整枚都在屏右之外，直接把话浮过去就是一半在屏外（实现里就是夹了才画的）。
  const chipCenter = chipRect ? chipRect.left + chipRect.width / 2 : 0
  const wantX = chipRect ? Math.max(96, Math.min(priv.win - 96, chipCenter)) : 0
  ck('R9b 那一句浮在**那一枚芯片**上面：落点是它自己的中心（被滚出屏外时夹进屏宽），不是输入框那一片',
    !privKey || (/最后|last/.test(priv.note) && !!chipRect
      && Math.abs(priv.noteX - wantX) <= 1.5
      && Math.abs(priv.noteY - (chipRect.top - 8)) <= 1.5),
    `「${priv.note}」 @(${priv.noteX.toFixed(0)}, ${priv.noteY.toFixed(0)})／芯片中心 ${chipCenter.toFixed(0)}`
    + `（屏宽 ${priv.win}，${chipCenter > priv.win - 96 ? '已被夹进屏宽' : '就在屏上没夹'}）key=${privKey || '（这一台没有私密那一格）'}`)

  // ---------- ⑥ 丢弃收尾：一次保存都没发生 ----------
  await mp.evaluate(() => { getCurrentPages().slice(-1)[0]._catExit() })
  await sleep(900)
  const end = await snap()
  ck('R10 收尾走丢弃：管理态收了、草稿没了、那一句也收了（全程没点井格，一次保存都没发生）',
    !end.edit && end.draft.length === 0 && !end.note, `edit=${end.edit} 草稿 ${end.draft.length} 浮层「${end.note}」`)
  ck('R10b 全程零写：非 GET 的请求一条都没发出去（这一把不许碰现网的库）',
    end.writes.length === 0, end.writes.join('、') || '0 条')
  ck('R10c 屏上那几格回到服务端那一份（丢弃没把表改脏，也没有那枚「新增」留下的残骸）',
    end.cats === a.cats && end.view.length === a.cats + 1, `${end.cats} 格／${end.view.length} 枚 ↔ 开局 ${a.cats}／${a.view.length}`)

  await mp.evaluate(() => {
    const w = globalThis.wx
    if (!w.__zhangji) return 0
    w.showToast = w.__orig.toast; w.showModal = w.__orig.modal
    w.request = w.__orig.request; w.uploadFile = w.__orig.upload
    delete w.__zhangji
    return 1
  })
  const bad = results.filter((r) => !r.ok)
  console.log(`\n${results.length - bad.length} 过 / ${bad.length} 红 / ${results.length} 条`)
  console.log('!! 那两句话说得对不对、浮层的长相好不好看，这一把量不到（套子里 showToast 没真弹）——那一段要他扫预览码看')
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.log('!! 尺子崩：', e && e.message); process.exit(1) })
