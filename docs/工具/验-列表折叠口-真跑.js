// 列表区那枚折叠口的真跑自证（站长 10-05：「笔记列表和笔记卡片右侧加一个，点一下展开和点一下
// 收起的，整个下部往上加高，下方内容同步增加，方便用户浏览更多内容。展开高度与笔记详情页高度一致」）。
// 跑法：docs/工具/跑尺子.sh 9431 验-列表折叠口-真跑
//
// 这一把要钉住的四件事：
// ① **展开态的顶边 == 详情浮窗的顶边**——这条不在源码里比数字，是真点一次详情窗、量同一屏上
//    两个盒子的 top 相对另一枚比（改了 `.float-sheet` 那个 130，折叠口这边不跟着动就会红）；
// ② "下方内容同步增加"——列表那一区的高度增量要等于顶边上抬的量，只挪顶边不涨内容 = 红；
// ③ 折叠口本身在中英文里都不许折行、不许压到第二枚 tab（同「我的」页那四行小字一条规矩）；
// ④ 它管的是**整块纸卡**，不是某一行——展开态点一行仍然直接浮详情窗，v19 那条"不就地展开"
//    必须还是活的（这条最容易在加功能时被动掉）。
//
// 三条 automator 的坑仍然成立（v18/v19 那两把踩过）：e.style() 只认 kebab-case；
// size()/offset() 回的是变换后的外接框；1rpx 在这台视口是 0.52px，"落在几 rpx 格子上"
// 一律放 ±2~3。界面语言开跑前钉成中文、收尾还回去。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const lang = require('./尺子语言钉.js')
const i18n = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))
const OUT = path.resolve(__dirname, '../design/10-05列表加高')

const IDX_WXSS = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/index/index.wxss'), 'utf8')
const IDX_WXML = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/index/index.wxml'), 'utf8')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
fs.mkdirSync(OUT, { recursive: true })

// 详情浮窗那条顶边从 wxss 现读（同一个文件里那一段），折叠口这边不抄第二份数
const seg = (css, sel) => {
  const m = new RegExp('\\' + sel + '\\s*\\{([^}]*)\\}').exec(css) || [, '']
  return m[1]
}
const FLOAT_TOP = Number((/top:\s*(-?[\d.]+)rpx/.exec(seg(IDX_WXSS, '.float-sheet')) || [NaN, NaN])[1])
const WIDE_TOP = Number((/top:\s*(-?[\d.]+)rpx/.exec(seg(IDX_WXSS, '.sheet\\.ix-wide')) || [NaN, NaN])[1])

// 屏上渲染出几行——`mp.evaluate` 里现查。
// ⚠ 两个坑叠在这一格上（10-05 卡了两次才看出来）：
//  ① `MiniProgram.evaluate` **只认第一个函数参数**（d.ts 里没有第二个形参），传进去的值到不了
//    小程序侧，选择器成了 undefined、query 永远不回，最后报 `timeout waiting for automator response`，
//    长得像端口死了。要变的量写进闭包。
//  ② 在 evaluate 里必须走 **`q.exec(cb)`** 那种写法；`boundingClientRect((r) => …)` 那个回调形式
//    在这条通道里不回回调（同一趟里 `grab` 用 exec 好好的，这一格用回调就卡死）。
const countXrows = (mp) => mp.evaluate(() => new Promise((resolve) => {
  const q = wx.createSelectorQuery()
  q.selectAll('.xrow').boundingClientRect()
  q.exec((res) => resolve((res[0] || []).length))
}))

// 一次查询把这一屏相关的盒子都拿回来（px），换算成 rpx 由调用方给比例
const grab = (mp) => mp.evaluate(() => new Promise((resolve) => {
  const q = wx.createSelectorQuery()
  q.select('.sheet').boundingClientRect()
  q.select('.list').boundingClientRect()
  q.select('.vtabs').boundingClientRect()
  q.selectAll('.vtab').boundingClientRect()
  q.select('.ix-fold').boundingClientRect()
  q.select('.float-sheet').boundingClientRect()
  q.select('.tools').boundingClientRect()
  q.exec((res) => resolve({
    sheet: res[0], list: res[1], vtabs: res[2], vtab: res[3] || [], fold: res[4], float: res[5],
    tools: res[6],
  }))
}))

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('尺子挂了（未处理拒绝）', e); process.exit(2) })

  // ---- 第 0 关：静态三条，不用起模拟器 ----
  ck('wxss 里那两条顶边都读得出数（`.float-sheet` 与 `.sheet.ix-wide`）',
    Number.isFinite(FLOAT_TOP) && Number.isFinite(WIDE_TOP), `详情窗 ${FLOAT_TOP}rpx ／ 展开态 ${WIDE_TOP}rpx`)
  ck('展开态顶边 == 详情浮窗顶边（源码那一条先对上，真跑再拿同一屏比一次）',
    Number.isFinite(FLOAT_TOP) && WIDE_TOP === FLOAT_TOP, `差 ${WIDE_TOP - FLOAT_TOP}rpx`)
  ck('折叠口在 wxml 里是 catchtap + onToggleWide（冒泡上去会连带清掉搜索词）',
    /class="ix-fold" catchtap="onToggleWide"/.test(IDX_WXML))
  ck('那枚字两态各读一个字典键，没抄死中文',
    /\{\{listWide \? t\.collapseTip : t\.expandTip\}\}/.test(IDX_WXML))
  ck('`.sheet.ix-wide` 把基础那条 margin-top: -40 归零了（不归零顶边会差 40，就不是"与详情页一致"）',
    /margin-top:\s*0/.test(seg(IDX_WXSS, '.sheet\\.ix-wide')))
  // 「展开就不提供搜索」必须落在 `wx:if` 上：那一行 z-index 5 比纸卡的 2 高，
  // 抬上来的卡盖不住它——不摘就正好压在卡面中间，成一枚看得见、点不动的孤点。
  ck('展开态那一行搜索是 wx:if 摘掉、不是靠被盖住',
    /<view wx:if="\{\{!listWide\}\}" class="tools">/.test(IDX_WXML))
  for (const L of ['zh', 'en']) {
    const d = i18n.texts(L)
    ck(`${L}｜两态各有一句、且不是同一句`, !!d.expandTip && !!d.collapseTip && d.expandTip !== d.collapseTip,
      `${d.expandTip} ／ ${d.collapseTip}`)
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

  try {
    for (const L of ['zh', 'en']) {
      await lang.pin(mp, L)
      const T = i18n.texts(L)
      console.log(`\n———— 界面语言钉成 ${L}（窗口 ${win}px，1rpx=${R.toFixed(4)}px）————`)

      console.log('  …reLaunch 首页')
      const page = await mp.reLaunch('/pages/index/index')
      await sleep(8000)
      console.log('  …读首帧 data')
      const d0 = await page.data()
      console.log('  …读到，开始逐条判')
      ck(`${L}｜进页默认就是收起那一态（这不该记住上次的选择）`,
        d0.listWide === false, `listWide=${d0.listWide}`)
      ck(`${L}｜这一屏真有几行笔记可滚（空着跑后面全是空过）`,
        (d0.rows || []).length > 0, `rows=${(d0.rows || []).length} 条`)

      console.log('  …量收起态那一组盒子')
      const g0 = await grab(mp)
      console.log('  …量到')
      const topClose = toR(g0.sheet.top), listClose = toR(g0.list.height)
      const rowsClose = await countXrows(mp)
      console.log(`  收起态：卡顶 ${topClose}rpx · 列表区高 ${listClose}rpx · 屏上渲染出 ${rowsClose} 行`)

      // ① + ②：点折叠口
      await (await page.$('.ix-fold')).tap()
      await sleep(1200)
      const g1 = await grab(mp)
      const topWide = toR(g1.sheet.top), listWideH = toR(g1.list.height)
      const dW = await page.data()
      ck(`${L}｜点一下确实翻到展开态`, dW.listWide === true, `listWide=${dW.listWide}`)
      ck(`${L}｜展开态顶边落在详情浮窗那一条线上（同一屏上真比一次，不比源码数字）`,
        Math.abs(topWide - FLOAT_TOP) <= 3, `卡顶 ${topWide}rpx vs 源码 ${FLOAT_TOP}rpx`)
      ck(`${L}｜顶边真的往上走了`, topWide < topClose, `${topClose}→${topWide}rpx，抬了 ${topClose - topWide}rpx`)
      ck(`${L}｜下方内容同步加高（列表区高度增量 == 顶边上抬的量，只挪顶边不算）`,
        Math.abs((listWideH - listClose) - (topClose - topWide)) <= 4,
        `列表区 ${listClose}→${listWideH}rpx（涨 ${listWideH - listClose}）vs 上抬 ${topClose - topWide}rpx`)
      ck(`${L}｜下沿没动（加高只往上要地方，不跟底栏抢）`,
        Math.abs(toR(g1.sheet.bottom) - toR(g0.sheet.bottom)) <= 3,
        `${toR(g0.sheet.bottom)}→${toR(g1.sheet.bottom)}rpx`)
      const rowsWide = await countXrows(mp)
      ck(`${L}｜同一批数据、只是多露几行（行数由数据定，不由这一态定）`,
        rowsWide === rowsClose, `${rowsClose}→${rowsWide} 行`)

      // ④：展开态点一行仍然直接浮详情窗（v19 那条"不就地摊开某一行"必须还活着）
      await (await page.$('.xrow')).tap()
      await sleep(1500)
      const gF = await grab(mp)
      const dF = await page.data()
      ck(`${L}｜展开态点一行仍然浮详情窗（折叠口管的是整块卡，不是就地摊开某一行）`,
        dF.detailOpen === true && !!gF.float, `detailOpen=${dF.detailOpen}`)
      ck(`${L}｜展开态的卡顶与详情浮窗顶落在同一条线（±3rpx）`,
        !!gF.float && Math.abs(toR(gF.float.top) - topWide) <= 3,
        gF.float ? `浮窗 ${toR(gF.float.top)}rpx vs 卡顶 ${topWide}rpx` : '没量到浮窗')
      await page.setData({ detailOpen: false })
      await sleep(1000)

      // ③：折叠口这一枚本身（两态各量一次，展开态那句"收起"更长）
      for (const [tag, want] of [['展开态', T.collapseTip], ['收起态', T.expandTip]]) {
        if (tag === '收起态') {
          await (await (await mp.currentPage()).$('.ix-fold')).tap()
          await sleep(1200)
        }
        const p2 = await mp.currentPage()
        const g = await grab(mp)
        const fold = g.fold
        if (!fold) { ck(`${L}｜${tag}折叠口量得到`, false, '没量到 .ix-fold'); continue }
        const el = await p2.$('.ix-fold')
        const txt = el ? await el.text() : ''
        ck(`${L}｜${tag}那枚字就是字典里那句`, txt === want, `屏上「${txt}」／字典「${want}」`)
        ck(`${L}｜${tag}那枚字只有一行`, toR(fold.height) <= 34, `高 ${toR(fold.height)}rpx`)
        const second = (g.vtab || [])[1]
        ck(`${L}｜${tag}那枚字没压到第二枚 tab`,
          !second ? false : fold.left >= second.right,
          second ? `间隙 ${toR(fold.left - second.right)}rpx` : '没量到第二枚 tab')
        ck(`${L}｜${tag}那枚字没顶出这一行右边界`,
          toR(fold.right) <= toR(g.vtabs.right), `超 ${toR(fold.right) - toR(g.vtabs.right)}rpx`)
        ck(tag === '展开态'
          ? `${L}｜展开态不给搜索那一行（摘掉，不是被盖住）`
          : `${L}｜收回之后搜索那一行回到原位`,
          tag === '展开态' ? !g.tools : !!g.tools,
          g.tools ? `量到 .tools（顶 ${toR(g.tools.top)}rpx）` : '没量到 .tools')
      }

      // 摊开搜索之后再点展开：条子要按"退出搜索"那一档收干净（缩回＋清词＋重拉）。
      // 不许留一把已经看不见的筛子还在筛列表——那正是他 10-03 打回过的
      // "条子一收，下面还挂着上一次的结果，看着像没退出来"。
      await (await (await mp.currentPage()).$('.ic')).tap()
      await sleep(900)
      await page.setData({ searchKeyword: '一把故意留下的测试词' })
      await (await (await mp.currentPage()).$('.ix-fold')).tap()
      await sleep(1500)
      const dS = await page.data()
      ck(`${L}｜带着摊开的搜索点展开：条子缩回、词清掉、这一态翻到展开`,
        dS.listWide === true && dS.searchOpen === false && dS.searchKeyword === '',
        `wide=${dS.listWide} open=${dS.searchOpen} 词长 ${(dS.searchKeyword || '').length}`)
      await (await (await mp.currentPage()).$('.ix-fold')).tap()
      await sleep(1200)

      // 卡片那一枚共用同一枚口：切过去再展开一次，看那批也一起加高
      // （按 `$$('.vtab')` 的下标点，不写属性选择器——automator 那个 `$` 的选择器方言不认它）
      await (await (await (await mp.currentPage()).$$('.vtab'))[1]).tap()
      await sleep(1200)
      const gc0 = await grab(mp)
      await (await (await mp.currentPage()).$('.ix-fold')).tap()
      await sleep(1200)
      const gc1 = await grab(mp)
      ck(`${L}｜卡片那一枚也用同一枚口，顶边抬到同一条线`,
        Math.abs(toR(gc1.sheet.top) - FLOAT_TOP) <= 3, `卡顶 ${toR(gc1.sheet.top)}rpx`)
      ck(`${L}｜卡片那一区也同步加高（不是只有列表那一枚管用）`,
        toR(gc1.list.height) - toR(gc0.list.height) >= toR(gc0.sheet.top) - toR(gc1.sheet.top) - 4,
        `列表区 ${toR(gc0.list.height)}→${toR(gc1.list.height)}rpx`)

      // 两张实拍给他对着看
      const p3 = await mp.currentPage()
      await p3.setData({ listWide: false })
      await sleep(1000)
      await mp.screenshot({ path: path.join(OUT, `收起-${L}.png`) })
      await (await p3.$('.ix-fold')).tap()
      await sleep(1200)
      await mp.screenshot({ path: path.join(OUT, `展开-${L}.png`) })
      console.log(`  已存实拍：docs/design/10-05列表加高/{收起,展开}-${L}.png`)
    }
  } finally {
    await lang.pin(mp, original).catch(() => {})
    console.log(`\n（界面语言已钉回 ${original}）`)
    try { await mp.close() } catch (e) { /* 已经断了就算了 */ }
  }

  console.log(`\n${bad.length ? '红 ' + bad.length + ' 条：' + bad.join('、') : '全绿'}（退出码 ${bad.length ? 1 : 0}）`)
  process.exit(bad.length ? 1 : 0)
})()
