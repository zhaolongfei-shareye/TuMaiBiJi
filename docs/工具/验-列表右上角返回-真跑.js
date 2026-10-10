// 笔记列表／笔记卡片那一屏右上角那一枚「返回」的真跑自证（外加"这一屏左上角不该有人"）。
// 前身是 `验-列表折叠口-真跑`（10-05 那件「点一下展开」）。**站长 10-10 深夜把展开整件撤了**：
// 「右上角"点一下展开"功能取消，改为"返回"，点击返回默认首页。卡片列表页同样处理。
//  这样每页右上角体验一致性」，同夜又补了一条「首页人物延续到笔记列表和卡片列表，
//  放在框外面的左上角，如果首页是男的，框外面就是男的」。
// ★10-11 第二句被他收回：「左上角的人，透明底侵入主图，列表左上角的人都去掉，维持只有首页有」（R8）。
// 所以这把量三件事：
// ① 那一枚在**两枚 tab 的每一枚上都存在、词都是「返回」、点下去落在第一屏**（一致性＝不随切 tab 变）；
// ② 展开那一态整个撤净（`listWide`／`.sheet.ix-wide`／`onToggleWide` 一处不留，留着就是两份真相）；
// ③ 这一屏**没有**框外那一位（markup、data、屏上三头都量）——首页那一位与"点剪影换大人"
//    归 验-第一屏三块-真跑，不在这里重复。
// 跑法：docs/工具/跑尺子.sh 9431 验-列表右上角返回-真跑
//
// automator 那三条坑仍然成立（v18/v19 那两把踩过）：e.style() 只认 kebab-case；
// size()/offset() 回的是变换后的外接框；1rpx 在这台视口约 0.52px，"落在几 rpx 格子上"一律放 ±2~3。
// 界面语言开跑前钉成中文、收尾还回去。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const lang = require('./尺子语言钉.js')
const i18n = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))
const OUT = path.resolve(__dirname, '../design/10-10列表右上角与人物')

const ROOT = path.resolve(__dirname, '../..')
const IDX_WXSS = fs.readFileSync(path.resolve(ROOT, 'miniprogram/pages/index/index.wxss'), 'utf8')
const IDX_WXML = fs.readFileSync(path.resolve(ROOT, 'miniprogram/pages/index/index.wxml'), 'utf8')
const IDX_JS = fs.readFileSync(path.resolve(ROOT, 'miniprogram/pages/index/index.js'), 'utf8')
const APP_WXSS = fs.readFileSync(path.resolve(ROOT, 'miniprogram/app.wxss'), 'utf8')

const bad = []
const ck = (name, okv, got) => {
  console.log(`${okv ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!okv) bad.push(name)
}
fs.mkdirSync(OUT, { recursive: true })
const seg = (css, sel) => {
  const m = new RegExp('\\' + sel + '\\s*\\{([^}]*)\\}').exec(css) || [, '']
  return m[1]
}

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('尺子挂了（未处理拒绝）', e); process.exit(2) })

  // ---- 第 0 关：静态，不用起模拟器 ----
  ck('那一枚在 wxml 里是 catchtap + goFirstScreen，且词吃 t.back（冒泡上去会连带清掉搜索词）',
    /class="ix-back" role="button" aria-label="\{\{t\.back\}\}" catchtap="goFirstScreen">\{\{t\.back\}\}<\/text>/.test(IDX_WXML))
  ck('goFirstScreen 走的是 switchTab 到第一屏（列表是 tab 页，navigateBack 在没有上一页时会失败）',
    /goFirstScreen\(\)\s*\{[\s\S]{0,160}switchTab\(\{ url: '\/pages\/create\/create' \}/.test(IDX_JS))
  // 展开那一态撤净这一条要扫三头：数据位、样式、方法。少扫一头就会留下"看着还在、点了没反应"的东西。
  // ⚠ 扫的是**去掉注释之后**的那三份：这三处退役都在注释里各留了一句"为什么没了"，那是该留的说明，
  //    不是第二条代码路径。（字典键那一批反过来——键名连注释都不许出现，见 `验-统一录入条.js` §1。）
  const code = (s) => s
    .replace(/<!--[\s\S]*?-->/g, '')      // wxml 的注释是这一种，漏了它整条判据就红在说明文字上
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const wideLeft = ['listWide', 'ix-wide', 'onToggleWide']
    .filter((k) => code(IDX_WXML + IDX_WXSS + IDX_JS).includes(k))
  ck('展开那一态整件撤净（数据位／样式／方法一处不留，注释里那句"为什么撤"不算）',
    wideLeft.length === 0, wideLeft.join(','))
  ck('两枚 tab 共用这一枚：它在 .vtabs 那一行里，不在某一块列表里面',
    IDX_WXML.indexOf('class="ix-back"') > IDX_WXML.indexOf('class="vtabs"')
    && IDX_WXML.indexOf('class="ix-back"') < IDX_WXML.indexOf('class="cats"'))
  // ★10-11 R8（他原话「左上角的人，透明底侵入主图，列表左上角的人都去掉，维持只有首页有」）：
  // 上一轮那四句"这一页也画那一位／首页是谁这里就是谁"整组前提被他撤掉了，所以这里反过来钉——
  // 这一页一个字都不该沾那一位；沾回来就是撞 R8。首页那一屏的人物与"点剪影换大人"由
  // 验-第一屏三块-真跑 钉，不在这里重复一遍（同一件事不留两个口）。
  ck('列表页框外那一位已经去掉：markup 里没有 .ix-person，data 里也不带 personSrc',
    !/ix-person|personSrc/.test(IDX_WXML.replace(/<!--[\s\S]*?-->/g, ''))
    && !/personSrc/.test(IDX_JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')),
    IDX_WXML.includes('ix-person') ? 'markup 里还有人' : '')
  ck('这一页不再读 utils/person.js（读回来就是下一次把他接回去的接头）',
    !/utils\/person\.js/.test(IDX_JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')))
  ck('路径没有在本页抄第二份（抄了就总有一天会和首页不一致）',
    !/ic-person|homePerson/.test(IDX_JS))
  // 新写类名必须带页面前缀，而且不许和 app.wxss 撞——撞了全局那一份会静默补进来（10-10 那把最贵的刀）。
  const collide = ['ix-back'].filter((c) => new RegExp(`\\.${c}(?![\\w-])`).test(APP_WXSS))
  ck('ix-back 没和 app.wxss 同名（同名＝全局那一份静默盖进来）', collide.length === 0, collide.join(','))
  for (const L of ['zh', 'en']) {
    const d = i18n.texts(L)
    ck(`${L}｜「返回」这一个词在两门字典里都有，且不超过四个字`, !!d.back && d.back.length <= 4, d.back)
  }
  if (bad.length) {
    console.log(`\n第 0 关就红 ${bad.length} 条，不往模拟器里跑（退出码 1）`)
    bad.forEach((x) => console.log('  · ' + x))
    process.exit(1)
  }

  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上 9431，先跑 cli auto')

  const original = await lang.read(mp)
  const win = await mp.evaluate(() => wx.getWindowInfo().windowWidth)
  const R = win / 750
  const toR = (v) => Math.round(v / R)
  const grab = () => mp.evaluate(() => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    q.select('.sheet').boundingClientRect()
    q.select('.head').boundingClientRect()
    q.select('.ix-back').boundingClientRect()
    q.select('.ix-person').boundingClientRect()
    q.select('.tools').boundingClientRect()
    q.select('.h1').boundingClientRect()
    q.select('.vtabs').boundingClientRect()
    // ⚠ 判"压住没压住"要量**画出来的那一样东西**，不能量它所在的那一整行：
    //   .tools 是 left:24 / right:24 的整行（justify-content:flex-end），收起态只有右端 .acts 那一枚有像素，
    //   拿整行去撞左边的小人，撞中的是行里那段真空白——10-11 那把就是这么假红的。
    q.select('.acts').boundingClientRect()
    q.select('.srch').boundingClientRect()
    // boundingClientRect 回的是 width/height；判据里写得短一点，这里统一换一次名。
    const box = (x) => (x ? {
      top: x.top, left: x.left, bottom: x.bottom, right: x.right, w: x.width, h: x.height,
    } : null)
    q.exec((res) => resolve({
      sheet: box(res[0]), head: box(res[1]), back: box(res[2]), person: box(res[3]),
      tools: box(res[4]), h1: box(res[5]), vtabs: box(res[6]),
      acts: box(res[7]), srch: box(res[8]),
    }))
  }))

  try {
    for (const L of ['zh', 'en']) {
      await lang.pin(mp, L)
      const T = i18n.texts(L)
      console.log(`\n———— 界面语言钉成 ${L}（窗口 ${win}px，1rpx=${R.toFixed(4)}px）————`)

      await mp.reLaunch('/pages/create/create')
      await sleep(5000)
      await mp.switchTab('/pages/index/index')
      await sleep(8000)
      let page = await mp.currentPage()
      const d0 = await page.data()
      ck(`${L}｜这一屏真有几条笔记可看（空着跑后面全是空过）`,
        (d0.rows || []).length > 0 || (d0.cells || []).length > 0,
        `rows=${(d0.rows || []).length} cells=${(d0.cells || []).length}`)

      // ---------- 1. 右上角那一枚：词、位置、两枚 tab 都在 ----------
      const g0 = await grab(mp)
      const backEl = await page.$('.ix-back')
      const backTxt = ((await backEl.text()) || '').trim()
      ck(`${L}｜那一枚写的就是字典里那句「返回」（不是旧的"点一下展开"）`, backTxt === T.back, backTxt)
      /* 它在最右端。⚠ 别拿 `.vtabs` 的右沿当基准：那一行是**整宽**的（0~750），
         卡的内缩挂在它自己的 padding 上，所以"离行右端 ≤40rpx"这种写法必红（实测差 56）。
         比的是**那张卡的右沿**：枚右缘到卡右沿只剩这一行的内缩。 */
      ck(`${L}｜它在那一行的右端（枚右缘离卡右沿只剩内缩，且整枚在右半），与那两枚 tab 同一行`,
        !!g0.back && !!g0.vtabs && !!g0.sheet
        && g0.back.right <= g0.sheet.right + 1 && g0.sheet.right - g0.back.right <= 80 * R
        && g0.back.left > (g0.vtabs.left + g0.vtabs.right) / 2
        && g0.back.top >= g0.vtabs.top && g0.back.bottom <= g0.vtabs.bottom,
        g0.back && g0.sheet && `枚 ${toR(g0.back.left)}~${toR(g0.back.right)}／卡右 ${toR(g0.sheet.right)}／行 ${toR(g0.vtabs.left)}~${toR(g0.vtabs.right)}`)
      // 小字折行是这一版反复栽过的一刀（「我的」页那四行同规矩）：一行高不许超过字号的 1.6 倍。
      const fsMeta = parseFloat((/--fs-meta:\s*([\d.]+)rpx/.exec(APP_WXSS) || [, '26'])[1])
      ck(`${L}｜这两个字不折行（量到的高度就是一行，中英都算）`,
        !!g0.back && toR(g0.back.h) <= fsMeta * 1.6 + 4, `${toR(g0.back.h)}rpx 高／字号 ${fsMeta}`)
      // 卡片那一格共用同一枚（他那句"每页右上角体验一致"就是这个意思）
      await (await page.$$('.vtab'))[1].tap()
      await sleep(1500)
      const g1 = await grab(mp)
      const cardsEl = await (await mp.currentPage()).$('.ix-back')
      const cardsBack = (cardsEl ? await cardsEl.text() : '') || ''
      ck(`${L}｜切到卡片那一格，右上角还是同一枚、同一个词`, cardsBack.trim() === T.back && !!g1.back, cardsBack.trim())
      await (await page.$$('.vtab'))[0].tap()
      await sleep(1200)

      // ---------- 2. 点一下回第一屏 ----------
      await (await (await mp.currentPage()).$('.ix-back')).tap()
      await sleep(3000)
      const cur = await mp.currentPage()
      ck(`${L}｜点「返回」落回第一屏（新建那一屏）`, /pages\/create\/create/.test(cur.path || ''), `落在 ${cur.path}`)

      // ---------- 3. 框外那一位：这一屏该是空的（R8） ----------
      await mp.switchTab('/pages/index/index')
      await sleep(7000)
      page = await mp.currentPage()
      const g2 = await grab(mp)
      const pd = await page.data()
      // 上面 grab() 里那句 `q.select('.ix-person')` 留着，它就是这一条的探针：
      // 那一格没渲染出来时 boundingClientRect 回 null。人回来（或有人只删 markup 不删 data），
      // 这两条立刻红。
      ck(`${L}｜列表那一格左上角没有人（屏上量不到 .ix-person）`,
        !g2.person, g2.person && `还量到一枚：${toR(g2.person.left)}~${toR(g2.person.right)}／顶 ${toR(g2.person.top)}`)
      ck(`${L}｜这一页 data 里不带 personSrc／personKey（人撤了键留着＝下一次接回去的接头）`,
        !('personSrc' in pd) && !('personKey' in pd),
        Object.keys(pd).filter((k) => /person/i.test(k)).join(','))
      await mp.screenshot({ path: `${OUT}/${L}-列表-返回.png` })
      // 卡片那一格（他那句"列表和卡片列表"点名的第二格）同样没有人，而且返回那枚还在原位。
      await (await page.$$('.vtab'))[1].tap()
      await sleep(2000)
      const g2c = await grab(mp)
      ck(`${L}｜卡片那一格也没有那一位，且右上角那枚返回与列表同一位置`,
        !g2c.person && !!g2c.back && Math.abs(g2c.back.top - g2.back.top) <= 2
        && (await (await mp.currentPage()).data()).view === 'cards',
        g2c.back && `顶 ${toR(g2c.back.top)} vs ${toR(g2.back.top)}／view=${(await (await mp.currentPage()).data()).view}`)
      await mp.screenshot({ path: `${OUT}/${L}-卡片.png` })
    }
  } finally {
    // 语言钉没有 restore：只改内存里那一份，收尾把登录时那一位还回去（pin 走的就是同一个口子）。
    await lang.pin(mp, original)
    await mp.close()
  }
  console.log(bad.length ? `\n✗ 列表右上角 真跑：红 ${bad.length} 条` : '\n✓ 列表右上角 真跑：全过')
  if (bad.length) bad.forEach((x) => console.log('  · ' + x))
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('!! 尺子挂了', e && (e.stack || e.message)); process.exit(1) })
