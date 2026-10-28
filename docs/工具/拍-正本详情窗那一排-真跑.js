// 正本详情窗底下那一排（`.ds-dock`／`.ds-irow`／`.ds-ibtn`）现量＋真截图。
//
// 为什么单独跑这一把：站长 10-28 两句「甲，还有按钮是在底部的，不是中间的」——iPhone 那一排
// 现在钉在标题下面、还多一枚「书签」，他要三枚并搬回窗底。动手之前先把**正本那一屏到底长什么样**
// 用真渲染量出来：枚数、枚宽枚高、枚间、那一排离窗底多少、「显示更多」与它谁在上谁下。
// 只拿 wxss 里的字面量当读数＝没量过（rpx 那一条在渲染端还会被换算），所以这里问的是屏上位。
//
// 跑法：docs/工具/跑尺子.sh 9431 拍-正本详情窗那一排-真跑
// 判红怎么读：这一把**不判红**，它只出读数（除了"列表是空的""窗没开成"两种前提塌）。
// 列表为空退 3，连不上／没开窗退 2——都不许静默出一张空板子。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, 'docs/工具/实测/正本详情窗那一排')
fs.mkdirSync(OUT, { recursive: true })

const num = (v) => {
  const m = /(-?\d+(?:\.\d+)?)/.exec(String(v == null ? '' : v))
  return m ? parseFloat(m[1]) : null
}
const face = async (el) => {
  const s = await el.size()
  const o = await el.offset()
  return { w: num(s.width), h: num(s.height), top: num(o.top), left: num(o.left) }
}
const line = (label, obj) => console.log(`${label}　${JSON.stringify(obj)}`)

;(async () => {
  process.on('uncaughtException', (e) => { console.error('量到一半挂了', e); process.exit(2) })
  let mp = null
  for (let i = 0; i < 4 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(8000) }
  }
  if (!mp) { console.log('!! 连不上 9431（环境红，不是回归）'); process.exit(2) }

  await mp.reLaunch('/pages/index/index')
  await sleep(4000)
  const page = await mp.currentPage()
  const d = await page.data()
  if (!(d.notes || []).length) { console.log('!! 列表为空，这一把没有可量的窗'); process.exit(3) }
  await page.setData({ detailOpen: false, templateOpen: false })
  await sleep(600)

  // 挑第一篇**非私密**的（私密那篇点开要过密码闸），并且优先挑**有摘要**的——
  // 摘要那一格在不在，决定正文那一屏的高度，也就决定「那一排离窗底多少」这一条读数的语境。
  const pick = d.notes.findIndex((n) => !n.is_private && n.summary)
  const idx = pick >= 0 ? pick : d.notes.findIndex((n) => !n.is_private)
  if (idx < 0) { console.log('!! 全是私密笔记，开不了窗'); process.exit(3) }
  // 行那一枚在 2.3.0 列表合一之后换了名字：`.xrow` 已经不在树上（10-27 那批尺子还认它，
  // 今天现读 `.xrow`=0 而列表有 45 条 ⇒ 认错节点等于什么都没点到）。现在按天分组，
  // 每组里是 `.ixl-row`，`data-idx` 还是 notes 里的那个下标。
  let row = null
  const rows = await page.$$('.ixl-row')
  for (const e of rows) {
    if (Number(await e.attribute('data-idx')) === idx) { row = e; break }
  }
  if (!row) { console.log(`!! 列表里找不到那一行（.ixl-row 共 ${rows.length} 枚，要找的 idx=${idx}）`); process.exit(3) }
  await row.tap()
  await sleep(3000)
  const dd = await page.data()
  if (dd.detailOpen !== true) { console.log(`!! 窗没开成 detailOpen=${dd.detailOpen}`); process.exit(3) }
  console.log(`开窗的那一篇：${(dd.detailNote || {}).title}｜有摘要=${!!(dd.detailNote || {}).summary}`)

  const sheet = await page.$('.float-sheet')
  const dock = await page.$('.ds-dock')
  const more = await page.$('.ds-more')
  const btns = await page.$$('.ds-ibtn')
  if (!sheet || !dock) { console.log('!! .float-sheet 或 .ds-dock 不在树上'); process.exit(3) }

  const fSheet = await face(sheet)
  const fDock = await face(dock)
  const fMore = more ? await face(more) : null
  line('窗 .float-sheet', { ...fSheet, 底: fSheet.top + fSheet.h })
  line('那一排 .ds-dock', { ...fDock, 底: fDock.top + fDock.h })
  line('显示更多 .ds-more', fMore ? { ...fMore, 底: fMore.top + fMore.h } : '这一屏没有原文，不画')
  console.log(`枚数 .ds-ibtn = ${btns.length}`)
  const faces = []
  for (const b of btns) {
    const f = await face(b)
    faces.push(f)
    line('一枚', { 字: await b.text(), ...f, 右: f.left + f.w, 底: f.top + f.h })
  }
  for (let i = 1; i < faces.length; i++) {
    line(`枚间 ${i - 1}→${i}`, Math.round((faces[i].left - (faces[i - 1].left + faces[i - 1].w)) * 100) / 100)
  }
  const 排 = await page.$('.ds-irow')
  if (排) line('那一行 .ds-irow', await face(排))
  line('那一排离窗底（窗底 − dock 底）', Math.round((fSheet.top + fSheet.h - (fDock.top + fDock.h)) * 100) / 100)
  line('dock 左内缩（dock 左 − 窗左）', Math.round((fDock.left - fSheet.left) * 100) / 100)
  // 一枚的样式：字号／字重／字色／那一圈边（正本全走 var，这里读的是换算完的屏上值）
  const one = btns[0]
  for (const k of ['font-size', 'font-weight', 'color', 'box-shadow', 'border-radius', 'height']) {
    line(`一枚 style ${k}`, await one.style(k))
  }
  for (const k of ['padding', 'flex', 'background', 'background-color']) {
    line(`dock style ${k}`, await dock.style(k))
  }
  const danger = btns[btns.length - 1]
  line('最后一枚（删除）color', await danger.style('color'))
  line('最后一枚（删除）box-shadow', await danger.style('box-shadow'))

  await mp.screenshot({ path: path.join(OUT, '正本-详情窗那一排在窗底.png') })
  console.log(`截图 → ${path.join(OUT, '正本-详情窗那一排在窗底.png')}`)
  await mp.close()
  console.log('退出码 0')
})().catch((e) => { console.error(e); process.exit(2) })
