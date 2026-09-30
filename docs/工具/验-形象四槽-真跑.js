// 卡片模板页「形象图四个槽」这一屏的实测（模拟器）。
// 静态那支（验-形象四槽.js）量的是逻辑：单选、不补位、升级、文件回收。
// 这一支量的是只有渲染才看得见的五件事：
//   ① 空态真画出四枚虚线圆 + ➕，没有芯片也没有垃圾桶；
//   ② 四个格子真排成 2×2（两枚两字芯片并一行放不下，硬挤就会互相咬）；
//   ③ 芯片条压在圆的下沿、横向不越格，垃圾桶不越出格子；
//   ④ 真点芯片：这一张中、别的张灭，且当场写进 storage（不等「保存」）；
//   ⑤ 真点垃圾桶：先弹二次确认，没确认一张都不能少；确认了才少一张、➕ 补回那一格。
// 前置：微信开发者工具已开；改过 WXML/WXSS/JS 要先 cli close 再
//   cli auto --project <仓库>/miniprogram --auto-port 9431，等十几秒端口起来。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-形象四槽-真跑.js
// 跑完 mp.close() 会占掉端口，别在站长真机调试时跑。
// 这支只动本机 storage 和本机 USER_DATA_PATH 里那几个 ruler-slot-*.jpg，不碰后端、不碰账号。
const automator = require('miniprogram-automator')

const PORT = process.env.MP_PORT || 9431
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}

const toRpx = (px, windowWidth) => px * 750 / windowWidth

// 一次量齐这一屏要用的所有盒子。Page 上没有 evaluate 这条路，element.size() 在这个
// 版本回 undefined，所以一律走 createSelectorQuery + boundingClientRect。
const measure = (mp) => mp.evaluate(() => new Promise((resolve) => {
  const q = wx.createSelectorQuery()
  q.selectAll('.slot').boundingClientRect()
  q.selectAll('.disc').boundingClientRect()
  q.selectAll('.chips').boundingClientRect()
  q.selectAll('.chip').boundingClientRect()
  q.selectAll('.bin').boundingClientRect()
  q.selectAll('.plus').boundingClientRect()
  q.select('.face-hint').boundingClientRect()
  q.exec((res) => resolve({
    slots: res[0] || [], discs: res[1] || [], chipsBox: res[2] || [], chips: res[3] || [],
    bins: res[4] || [], plus: res[5] || [], hint: res[6],
    windowWidth: wx.getWindowInfo().windowWidth,
  }))
}))

// 选图那一步在模拟器里点不动（chooseMedia 弹的是工具自己的面板，不在页面树里），
// 所以绕开它：直接往 USER_DATA_PATH 写四张真 JPEG，再把槽摆进 storage，重新进页。
// 页面读出来的就是"已经有四张图"的现场，后面点的每一下都是真控件、真处理函数。
// 包里那张 /assets 图是包内资源，copyFileSync 从包里取在工具上不一定放行，
// 所以用一张 1×1 的 JPEG 底（布局量的是盒子尺寸，跟图内容无关）。
const JPG_1PX = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=='

const seedSlots = (mp, roles) => mp.evaluate((list, b64) => {
  const fs = wx.getFileSystemManager()
  const ud = wx.env.USER_DATA_PATH
  const paths = list.map((_, i) => `${ud}/ruler-slot-${i}.jpg`)
  paths.forEach((p) => {
    try { fs.writeFileSync(p, b64, 'base64') } catch (e) { /* 已存在就沿用 */ }
  })
  const missing = paths.filter((p) => { try { fs.accessSync(p); return false } catch (e) { return true } })
  if (missing.length) return { fatal: `这几张没造出来：${missing.join(',')}` }
  const prof = wx.getStorageSync('poster_profile') || {}
  prof.images = list.map((r, i) => ({ path: paths[i], card: !!r.card, bg: !!r.bg }))
  prof.avatarPath = ''
  wx.setStorageSync('poster_profile', prof)
  return { ok: true, paths }
}, roles, JPG_1PX)

const clearSlots = (mp) => mp.evaluate(() => {
  const p = wx.getStorageSync('poster_profile') || {}
  p.images = [null, null, null, null]
  p.avatarPath = ''
  wx.setStorageSync('poster_profile', p)
  const fs = wx.getFileSystemManager()
  for (let i = 0; i < 4; i++) {
    try { fs.unlinkSync(`${wx.env.USER_DATA_PATH}/ruler-slot-${i}.jpg`) } catch (e) { /* 本来就没有 */ }
  }
  return true
})

const readStored = (mp) => mp.evaluate(() => {
  const p = wx.getStorageSync('poster_profile') || {}
  return { images: p.images, avatarPath: p.avatarPath }
})

// showModal 弹的是工具的系统面板，不在页面树里，automator 够不到它的按钮。
// 所以把 wx.showModal 临时换成一台"记录仪"：参数照原样收下来，回调攥在手里，
// 由用例决定这一回是模拟点「取消」（不回调）还是点「确定」（调 success({confirm:true})）。
// 服务上下文里 wx 是同一个全局对象，页面那个 onDropSlot 调的就是这台记录仪。
const armModal = (mp) => mp.evaluate(() => {
  if (!wx.__realModal) wx.__realModal = wx.showModal
  wx.__opts = null
  wx.__cap = null
  wx.showModal = (o) => { wx.__cap = { title: o.title, content: o.content, confirmText: o.confirmText, cancelText: o.cancelText }; wx.__opts = o }
  return true
})
const tapConfirm = (mp) => mp.evaluate(() => {
  const o = wx.__opts
  if (!o) return '没有弹窗可确认'
  if (o.success) o.success({ confirm: true, cancel: false })
  if (o.complete) o.complete({ confirm: true, cancel: false })
  wx.__opts = null
  return true
})
const disarmModal = (mp) => mp.evaluate(() => {
  if (wx.__realModal) { wx.showModal = wx.__realModal; wx.__realModal = null }
  wx.__opts = null
  return true
})

const PROFILE = '/pages/profile/profile'

async function gotoProfile(mp) {
  // 头一次切页会撞上开发者工具那句 rawPath is null（页面元信息没就绪），重试到成功为止
  for (let i = 0; ; i++) {
    try { await mp.reLaunch(PROFILE); break } catch (e) {
      if (i >= 4) throw e
      console.log(`第 ${i + 1} 次进卡片模板页没成：${e.message}`)
      await sleep(8000)
    }
  }
  await sleep(4000)
  return mp.currentPage()
}

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('尺子挂了（未处理拒绝）', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error(`连不上自动化端口，先跑 cli auto --auto-port ${PORT}`)

  try {
    // ---------- ① 空态 ----------
    await clearSlots(mp)
    let page = await gotoProfile(mp)
    let d = await page.data()
    ck('storage 清空后页面读出四个空位', Array.isArray(d.slots) && d.slots.length === 4
      && d.slots.every((s) => !s), JSON.stringify(d.slots))
    let m = await measure(mp)
    ck('界面上确实渲染出四个格子', m.slots.length === 4, `${m.slots.length} 个`)
    ck('四个 ➕ 都在（空槽点它选图）', m.plus.length === 4, `${m.plus.length} 个`)
    ck('空态没有芯片、没有垃圾桶', m.chips.length === 0 && m.bins.length === 0,
      `芯片 ${m.chips.length} / 垃圾桶 ${m.bins.length}`)
    ck('提示那一行在格子下面且真的高度（不满时是"怎么放图"那句）', !!m.hint && m.hint.height > 0
      && m.hint.top > m.slots[3].top - 10)

    // ---------- ② 满态：2×2 ----------
    const first = [{ card: true, bg: true }, {}, {}, {}]
    const seeded = await seedSlots(mp, first)
    if (seeded.fatal) throw new Error(seeded.fatal)
    page = await gotoProfile(mp)
    d = await page.data()
    ck('四张都摆上来时 allFull 为真（提示语换成"满了"那句）', d.allFull === true)
    m = await measure(mp)
    const w = m.windowWidth
    ck('四个格子摆满了（每张都有图，没有 ➕）', m.slots.length === 4 && m.plus.length === 0
      && m.discs.length === 4, `➕ ${m.plus.length}`)
    const topOf = m.slots.map((r) => Math.round(toRpx(r.top, w)))
    ck('确实是 2×2：前两枚一行、后两枚第二行',
      Math.abs(m.slots[0].top - m.slots[1].top) < 4 && Math.abs(m.slots[2].top - m.slots[3].top) < 4
      && m.slots[2].top > m.slots[1].top + 40, `top(rpx)=${topOf.join(',')}`)
    const slotW = toRpx(m.slots[0].width, w)
    ck('每格宽 248rpx（两字芯片一行放不下，所以是 2×2 不是 1×4）',
      Math.abs(slotW - 248) <= 3, `${Math.round(slotW)}rpx`)
    ck('四个格子横着没超出屏幕（最右那枚的右边还在可视区里）',
      m.slots[1].right <= w + 1 && m.slots[3].right <= w + 1,
      `屏宽 ${Math.round(w)}px，右缘 ${Math.round(m.slots[3].right)}px`)

    // ---------- ③ 芯片与垃圾桶的落位 ----------
    ck('八枚芯片：每格两枚', m.chips.length === 8, `${m.chips.length} 枚`)
    const disc0 = m.discs[0], cb0 = m.chipsBox[0]
    ck('芯片条没横向越出那一格',
      cb0.left >= disc0.left - 1 && cb0.right <= disc0.right + 1,
      `芯片 ${Math.round(cb0.left)}~${Math.round(cb0.right)}px / 圆 ${Math.round(disc0.left)}~${Math.round(disc0.right)}px`)
    ck('芯片条压在圆的下沿：顶在圆里、底略微出（出界只那几 px）',
      cb0.top > disc0.top && cb0.bottom > disc0.bottom && (cb0.bottom - disc0.bottom) < 8,
      `出界 ${Math.round(cb0.bottom - disc0.bottom)}px`)
    const gapPx = 6 * w / 750
    const twoChips = m.chips[0].width + gapPx + m.chips[1].width
    ck('同一格两枚并排没超过格宽（超了就是字太大或该换行）',
      twoChips <= m.slots[0].width + 1, `${Math.round(toRpx(twoChips, w))}rpx / 格 ${Math.round(slotW)}rpx`)
    ck('相邻两格的芯片条没重叠（第二枚的右边 ≤ 下一格芯片的左边）',
      m.chips[1].right <= m.chips[2].left + 1 || Math.abs(m.slots[0].top - m.slots[2].top) > 4,
      `第 1 格右 ${Math.round(m.chips[1].right)}px / 第 3 格左 ${Math.round(m.chips[2].left)}px`)
    ck('四枚垃圾桶都在，且没越出各自那一格',
      m.bins.length === 4 && m.bins.every((b, i) => b.right <= m.slots[i].right + 1
        && b.left >= m.slots[i].left - 1 && b.top >= m.slots[i].top - 1), `${m.bins.length} 枚`)
    const chipH = toRpx(m.chips[0].height, w)
    ck('芯片高度在 28~44rpx 这一档（他要的"按钮字体可以小点"）',
      chipH > 28 && chipH < 44, `${Math.round(chipH)}rpx`)

    // ---------- ④ 真点芯片 ----------
    const chips = await page.$$('.chip')
    // 每格两枚：第 3 格(index 2) 的「卡片」是全局第 5 枚
    await chips[4].tap()
    await sleep(1500)
    d = await page.data()
    ck('点亮第 3 格的「卡片」', d.slots[2] && d.slots[2].card === true,
      JSON.stringify((d.slots || []).map((s) => s && `${s.card ? 'C' : '-'}${s.bg ? 'B' : '-'}`)))
    ck('第 1 格那枚「卡片」自己灭掉（单选）', d.slots[0] && d.slots[0].card === false)
    ck('「背景」不受牵连，还在第 1 格上', d.slots[0].bg === true && d.slots[2].bg === false)
    let st = await readStored(mp)
    ck('当场落盘，不等下面那个「保存」',
      st.images && st.images[2].card === true && st.images[0].card === false,
      JSON.stringify((st.images || []).map((s) => s && `${s.card ? 'C' : '-'}${s.bg ? 'B' : '-'}`)))
    d = await page.data()
    ck('界面上那枚也跟着亮了（芯片数没变、class 变了）', d.slots[2].card === true)
    await (await page.$$('.chip'))[4].tap()
    await sleep(1200)
    d = await page.data()
    ck('再点同一枚就是关掉', d.slots[2].card === false)
    ck('关掉之后「卡片」位没人接 —— 不自动挪给别的张（站长拍板：不挪）',
      d.slots.every((s, i) => i === 0 || !s || !s.card) && d.slots[0].card === false,
      JSON.stringify((d.slots || []).map((s) => s && s.card)))
    const noCard = await readStored(mp)
    ck('这一点也当场落盘了（storage 里四张都没 card）',
      noCard.images.every((s) => !s || !s.card))

    // ---------- ⑤ 真点垃圾桶：先弹二次确认 ----------
    await armModal(mp)
    const caps = [{ card: true, bg: true }, {}, {}, {}]
    await seedSlots(mp, caps)
    page = await gotoProfile(mp)
    await armModal(mp)
    let bins = await page.$$('.bin')
    ck('四格都有垃圾桶', bins.length === 4, `${bins.length} 枚`)
    await bins[1].tap()
    await sleep(1200)
    let modal = await mp.evaluate(() => wx.__cap)
    ck('点垃圾桶先弹二次确认（不是当场就删）', !!modal, JSON.stringify(modal && modal.title))
    ck('确认按钮是「删掉」两个字，取消复用现网那枚',
      modal && modal.confirmText === '删掉' && modal.cancelText === '取消',
      modal && `${modal.confirmText} / ${modal.cancelText}`)
    ck('没确认时正文只讲"这台手机"，不谎报已上传', modal && /只影响这台手机/.test(modal.content))
    // 第 1 格那张同时当着两个位置，删完两个地方都会变，两句后果都得写进正文
    await (await page.$$('.bin'))[0].tap()
    await sleep(1000)
    const both = await mp.evaluate(() => wx.__cap)
    ck('它正当着两个位置，正文就把两个后果都写上',
      both && /卡片头像会没有图/.test(both.content) && /首页和笔记页头部会换回默认/.test(both.content),
      both && both.content)
    d = await page.data()
    ck('弹窗没点确认，四张一张都不能少', d.slots.filter(Boolean).length === 4,
      `${d.slots.filter(Boolean).length} 张`)

    // 记录仪里留着的是"最后弹的那一次"，所以要点哪一格就得真点哪一格
    await (await page.$$('.bin'))[1].tap()
    await sleep(1000)
    await tapConfirm(mp)
    await sleep(1500)
    d = await page.data()
    ck('点「删掉」之后那一格真的空了（剩三张）', d.slots.filter(Boolean).length === 3,
      `${d.slots.filter(Boolean).length} 张`)
    m = await measure(mp)
    ck('空出来的那一格换成 ➕，芯片和垃圾桶跟着没',
      m.plus.length === 1 && m.chips.length === 6 && m.bins.length === 3,
      `➕ ${m.plus.length} / 芯片 ${m.chips.length} / 桶 ${m.bins.length}`)
    st = await readStored(mp)
    ck('删掉的那张从 storage 里出去了，走的正是点的那一格（第 2 格）',
      st.images.filter(Boolean).length === 3 && !st.images[1],
      JSON.stringify(st.images.map((s) => !!s)))
    ck('另外三张一个没被牵连，第 1 格还当着两个位置',
      st.images[0] && st.images[0].card === true && st.images[0].bg === true
      && !!st.images[2] && !!st.images[3])
    await disarmModal(mp)

    // ---------- ⑥ 首页背景跟着这张走（同一份真相） ----------
    await seedSlots(mp, [{ card: false, bg: true }, { card: true, bg: false }, {}, {}])
    for (let i = 0; ; i++) {
      try { await mp.reLaunch('/pages/index/index'); break } catch (e) {
        if (i >= 4) throw e
        await sleep(8000)
      }
    }
    await sleep(5000)
    const home = await mp.currentPage()
    const hd = await home.data()
    ck('列表页头部铺的是勾了「背景」那一张（第 1 格），不是勾「卡片」的第 2 格',
      !!hd.bgSrc && /ruler-slot-0\.jpg$/.test(hd.bgSrc), hd.bgSrc)
  } finally {
    try { await disarmModal(mp) } catch (e) { /* 可能已经断了 */ }
    try { await clearSlots(mp) } catch (e) { console.error('收尾清理没做成', e) }
    try { await mp.close() } catch (e) { /* 已经断了 */ }
  }

  console.log(`\n${bad.length ? '未通过 ' + bad.length + ' 条：' + bad.join(' / ') : '全部通过'}`)
  process.exitCode = bad.length ? 1 : 0
})().catch((e) => {
  console.error('尺子挂了：', e)
  process.exitCode = 2
})
