// 探针（不是判据）：把三枚居中弹窗压在玻璃上的**字**实际对比度量出来。
// 为什么单独一把：站长 10-11 拍的 α=.30 是**全站一个值**（R10），而这三枚底下垫的是
// `rgba(20,20,28,.55)` 那层暗遮罩（X4 他回「4、做」时谁也没算过这一层）。白纱压暗底会落成中灰，
// 里面的墨字很可能不到小字门槛 4.5:1。**我不自己抬 α**（那条是他拍的），只把数量出来，
// 过不过线由他判——要抬就单给这三枚抬一档，要压字色就动 `--text-primary`，两条都是他的决定。
//
// 跑法：docs/工具/跑尺子.sh 9431 探-弹窗玻璃对比度
//      然后 python3 docs/工具/量-玻璃面与字.py docs/design/10-11毛玻璃/实测/弹窗.json
//
// 量法（两头都不靠"我以为"）：
//   面＝从**截图像素**上取弹窗内一块没有字的区域的中位色（这才是白纱与真实背景合成完的结果，
//        拿公式合成会漏掉底下那张图本身的明暗）；
//   字＝`element.style('color')` 读回来的**计算值**（含 alpha 的那份，不是样式表里写的 var()）。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/10-11毛玻璃/实测')

// 每一枚：弹窗选择器、里面要量的字选择器、以及"拿来取面色的那块无字区域"选哪一枚元素。
const TARGETS = [
  { who: '密码那一层', page: '/pages/me/me', open: 'pwdOpen', card: '.pwd-card',
    texts: ['.pwd-name', '.pwd-scene', '.pwd-tip'] },
  { who: '我的邮箱那一层', page: '/pages/me/me', open: 'emailOpen', card: '.me-email-card',
    texts: ['.me-email-name', '.me-email-scene', '.me-email-field'] },
  { who: '卡片上的信息那一层', page: '/pages/index/index', open: 'cardInfoOpen', card: '.ci-card',
    texts: ['.ci-title', '.ci-hint', '.ci-cap'] },
]

;(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上 9431，先跑 cli auto')
  const rows = []
  for (const t of TARGETS) {
    await mp.switchTab(t.page)
    await sleep(6000)
    let page = await mp.currentPage()
    // 「我的邮箱」那一层 me.js 在读回来之前不让打开（预填成空再引导去点保存＝替他清掉原来那条），
    // 所以这里直接调 setData 把门打开——探针要的是"那一层的皮长什么样"，不是走用户那条路。
    await page.setData({ [t.open]: true })
    await sleep(2500)
    page = await mp.currentPage()
    const card = await page.$(t.card)
    if (!card) { rows.push({ who: t.who, err: '弹窗没开' }); continue }
    // automator 的 Element 没有 boundingClientRect（10-11 第一版就是这么崩的），量走页面里查询。
    // 一起把 windowWidth／windowHeight 带回去：rect 是**视口 px**，而 screenshot 拍的是整块屏
    // （顶上还有状态栏＋导航条），换算要靠这两枚数——写死 750 当宽会把框画到遮罩上。
    const boxes = await mp.evaluate((sels) => new Promise((resolve) => {
      const i = wx.getWindowInfo()
      const q = wx.createSelectorQuery()
      sels.forEach((s) => { q.select(s).boundingClientRect() })
      q.exec((r) => resolve({ rect: r[0], win: { w: i.windowWidth, h: i.windowHeight } }))
    }), [t.card])
    const rect = boxes && boxes.rect
    const win = boxes && boxes.win
    const bg = String(await card.style('background-color') || '')
    const bf = String(await card.style('backdrop-filter') || await card.style('-webkit-backdrop-filter') || '')
    const bgi = String(await card.style('background-image') || '')
    const shot = `${t.who}-${t.page.split('/').pop()}.png`.replace(/\s/g, '')
    await mp.screenshot({ path: `${OUT}/${shot}` })
    const texts = []
    for (const sel of t.texts) {
      const el = await page.$(sel)
      if (!el) continue
      texts.push({
        sel, color: String(await el.style('color') || ''),
        fontSize: String(await el.style('font-size') || ''),
        fontWeight: String(await el.style('font-weight') || ''),
        text: String(await el.text() || '').slice(0, 24),
      })
    }
    rows.push({
      who: t.who, shot, card: t.card, win,
      rect: rect && { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      veil: bg, backdropFilter: bf, backgroundImage: bgi,
      texts,
    })
    await page.setData({ [t.open]: false })
    await sleep(600)
  }
  const file = `${OUT}/弹窗.json`
  fs.writeFileSync(file, JSON.stringify(rows, null, 1))
  console.log(`存 ${file}（${rows.length} 枚）`)
  rows.forEach((r) => console.log(`  ${r.who}：面底色 ${r.veil || '(读不到)'}｜滤镜 ${r.backdropFilter || '(读不到)'}｜渐变 ${/linear-gradient/.test(r.backgroundImage || '') ? '有' : '无'}`))
  await mp.close()
})().catch((e) => { console.error('!! 探针挂了', e && (e.stack || e.message)); process.exit(1) })
