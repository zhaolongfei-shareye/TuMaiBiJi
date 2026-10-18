/**
 * 探针（不是长期尺子）：站长 10-18 18:4x 一句「有问题，编辑笔记仍然出问题，看不到原文，和图片」。
 * 这一把不判对错，只把**此刻这一屏真铺出来的是什么**逐栏打出来，好把三件事分开：
 *   ① 表单那几栏到底有没有货（他那句"原文"如果指标题/摘要/要点，这一栏就是证据）；
 *   ② 配图那一排枚数，与每一枚方格**真画出像素没有**（枚数与面积都证不了图进去了——
 *      只定宽定高的 `<image>` 拿一个取不到的地址照样有 78×78 的面）；
 *   ③ 独立详情页里那两样（正文/原文的字数、配图那一排）——"原文"这一栏编辑页本来就没有，
 *      他若指的是正文与原文，落点在详情那一屏，得先确认这一屏有没有画。
 * 全程只 GET、只导航，不保存、不写库。跑法：docs/工具/跑尺子.sh 9431 探-编辑与详情此刻铺开什么
 */
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')

const OUT = path.resolve(__dirname, '../design/10-18-编辑页配图/实测')
const APORT = process.env.MP_PORT || 9431
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  let mp
  for (let i = 0; i < 12; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${APORT}` }); break }
    catch (e) { await sleep(4000) }
  }
  if (!mp) { console.log('!! 连不上自动化端口'); process.exit(2) }
  const logs = []
  try { mp.on('console', (m) => logs.push(`${m.type}: ${(m.args || []).map((a) => a && a.description || '').join(' ')}`)) } catch (e) {}

  const listPage = await mp.switchTab('/pages/index/index')
  await sleep(3000)
  const ld = await listPage.data()
  const list = ld.notes || ld.list || ld.notesList || []
  if (!list.length) { console.log('!! 列表空的，量不了'); process.exit(3) }
  const withCover = list.filter((n) => n.cover_file_id)
  const pick = withCover[0] || list[0]
  console.log(`读数｜列表 ${list.length} 篇，其中带 cover_file_id 的 ${withCover.length} 篇；挑这一篇量：id=${pick.id} 标题「${(pick.title || '').slice(0, 18)}」`)

  /* ---------- 一、编辑这一屏 ---------- */
  const routeOf = () => mp.evaluate(() => (getCurrentPages().slice(-1)[0] || {}).route || '?')
  const cells = async (page) => (await page.$$('.wr-shot')).length
  async function editOf(id, tag) {
    logs.length = 0
    await mp.evaluate((u) => new Promise((res) => { wx.navigateTo({ url: u, success: res, fail: res }) }),
      `/pages/write/write?id=${id}&mode=edit`)
    await sleep(4500)
    const ep = await mp.currentPage()
    const ed = await ep.data()
    console.log(`\n【${tag}】id=${id}`)
    console.log('读数｜此刻这一屏的路由 =', await routeOf())
    console.log('读数｜标题栏 =', JSON.stringify((ed.formData || {}).title || '').slice(0, 46))
    console.log('读数｜摘要栏字数 =', String((ed.formData || {}).summary || '').length)
    console.log('读数｜要点栏字数 =', String(ed.keyPointsText || '').length)
    console.log('读数｜标签栏 =', JSON.stringify(ed.tagsText || '').slice(0, 40), '| tagList', (ed.tagList || []).length, '枚')
    console.log('读数｜配图 shots =', (ed.shots || []).length, '枚，地址前缀 =',
      String(((ed.shots || [])[0] || {}).cloud_url || '').slice(0, 14))
    console.log('读数｜这一页 data 里有没有正文/原文那两栏 =',
      'content' in ed ? '有 content' : '没有 content', '/', 'original' in ed ? '有 original' : '没有 original')
    console.log('读数｜进门这一趟 console 里有没有「加载笔记失败」 =',
      logs.some((l) => /加载笔记失败/.test(l)) ? '有（这就是那句报错）' : '没有')
    const imgSel = await ep.$$('.wr-shot-img')
    // 面积用平台那把尺量（这一版 automator 的**页面对象没有 evaluate()**，只有小程序对象有；
    // 量法走 getCurrentPages() 现读当前页，不依赖页面对象的口）
    const rects = await mp.evaluate(() => new Promise((res) => {
      const out = []
      const q = wx.createSelectorQuery().in(getCurrentPages().slice(-1)[0])
      q.selectAll('.wr-shot-img').boundingClientRect()
      q.exec((r) => res((r && r[0]) || []))
    }))
    console.log('读数｜屏上方格枚数 =', await cells(ep), '| 图节点(data) =', imgSel.length,
      '| 面积 =', rects.map((x) => `${Math.round(x.width)}×${Math.round(x.height)}@(${Math.round(x.left)},${Math.round(x.top)})`).join(' '))
    // 「页面错位」这条要的是数，不是眼：任何一枚方格的右沿越过屏宽＝真溢出
    const win = await mp.evaluate(() => wx.getSystemInfoSync().windowWidth)
    const over = rects.filter((x) => x.right > win + 0.5)
    console.log(`读数｜屏宽 = ${win}px | 越过右沿的方格 = ${over.length} 枚`,
      over.length ? over.map((x) => `${Math.round(x.right)}px`).join(' ') : '')
    // 2.3.11 那一刀的自证：五栏（三格 input／两格 textarea／一格 picker）现在必须**同一对左右沿**。
    // 站长真机上量到的是两格 textarea 992px、三格 901px（原生 textarea 吃固定 300px），
    // 模拟器 390 宽上两者只差 1.3pt，所以这一栏在模拟器是"看不出修好了"，只能钉"没改坏"。
    const fields = await mp.evaluate(() => new Promise((res) => {
      const q = wx.createSelectorQuery().in(getCurrentPages().slice(-1)[0])
      q.selectAll('.input').boundingClientRect()
      q.selectAll('.textarea').boundingClientRect()
      q.selectAll('.picker-value').boundingClientRect()
      q.exec((r) => res(r || []))
    }))
    const flat = fields.filter(Boolean).flat().map((x) => `${Math.round(x.left)}..${Math.round(x.right)}(${Math.round(x.width)}×${Math.round(x.height)})`)
    const uniq = new Set(flat.map((s) => s.split('(')[0]))
    console.log('读数｜五栏左右沿 =', flat.join(' '), '| 是否同一对边 =', uniq.size === 1 ? '是' : `否（${uniq.size} 种）`)
    await mp.evaluate(() => new Promise((res) => { wx.pageScrollTo({ scrollTop: 0, success: res, fail: res }) }))
    await sleep(900)
    const p = path.join(OUT, `20-编辑-${tag}-${id}.png`)
    await mp.screenshot({ path: p })
    console.log('截图｜', p, '| 面积 JSON =', JSON.stringify(rects))
    // 上面那张截不到配图那一排：方格在 top=836，视口只有 844 高、下面还有安全区。
    // 滚到那一排再截一张——枚数与面积都证不了"图进去了"，只有这一张能证。
    if (rects.length) {
      await mp.evaluate((top) => new Promise((res) => {
        wx.pageScrollTo({ scrollTop: Math.max(0, top), duration: 260, success: res, fail: res })
      }), Math.max(0, rects[0].top - 180))
      await sleep(2500)
      const p2 = path.join(OUT, `22-编辑-滚到配图-${tag}-${id}.png`)
      await mp.screenshot({ path: p2 })
      console.log('截图｜滚到那一排之后', p2)
    }
    await mp.evaluate(() => new Promise((res) => { wx.navigateBack({ delta: 1, success: res, fail: res }) }))
    await sleep(2200)
  }

  const preset = list.filter((n) => n.is_preset)
  await editOf(pick.id, withCover.length ? '普通篇(带配图)' : '普通篇')
  if (preset.length) await editOf(preset[0].id, '帮助文档那一篇')
  else console.log('\n读数｜列表里挑不到 `is_preset` 那一篇（这一栏在列表回体里有没有，本身就是一条读数）')

  /* ---------- 二、独立详情页那一屏（正文／原文／配图都在这儿） ---------- */
  const dp = await mp.switchTab('/pages/index/index')
  await sleep(2500)
  await mp.evaluate((u) => new Promise((res) => { wx.navigateTo({ url: u, success: res, fail: res }) }),
    `/pages/detail/detail?id=${pick.id}`)
  await sleep(4500)
  const page = await mp.currentPage()
  const dd = await page.data()
  const note = dd.note || {}
  console.log('\n【详情这一屏】id=' + pick.id)
  console.log('读数｜正文 content 字数 =', String(note.content || '').length,
    '| 原文 original_content 字数 =', String(note.original_content || '').length,
    '| 原文那一栏此刻是', dd.showOriginal ? '展开' : '收起（要点一下标题才展开）')
  console.log('读数｜配图 noteImages =', (dd.noteImages || []).length, '枚')
  const dImgs = await page.$$('.dt-shots-panel image, .dp-shot, .ix-shot')
  console.log('读数｜详情那一排图节点 =', dImgs.length, '枚')
  console.log('读数｜这一趟 console 里的 error =',
    logs.filter((l) => /^error/.test(l)).slice(0, 3).join(' || ') || '零条')
  const p2 = path.join(OUT, `21-详情-${pick.id}.png`)
  await mp.screenshot({ path: p2 })
  console.log('截图｜', p2)
  process.exit(0)
})().catch((e) => { console.log('!! 探针崩：', e && e.message); process.exit(1) })

