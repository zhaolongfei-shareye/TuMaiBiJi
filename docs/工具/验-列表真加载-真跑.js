// 列表那一屏「真去现网加载一次」的尺子（站长 10-17 真机报 Load failed 之后补的）。
// 跑法：docs/工具/跑尺子.sh 9431 验-列表真加载-真跑
//
// 为什么非要有这一把：`探针-列表配图真图渲染.js` 那把是**直接 setData 喂渲染层**的，
// 它自己的文件头就写着"量的是渲染，不是接口"——可我当时正是拿它当"这一屏验过了"报出去的。
// 真机报的这条红走的是 `loadNotes()` 那条路：接口回来之后 `skin()`→`arrange()`→`setData()`
// 那一段里任何一句抛错，都会被 `catch` 吞成一句 toast「加载失败」，屏上看不出是哪个字段。
// ⇒ 静态尺子钉的是源码写了什么，喂数据的探针钉的是画出来什么样，**这一把钉的是那条真链路走不走得通**。
//
// 三条断言，缺一不可：
// ① 真打一次现网，`console.error` 一条都没响（被 catch 吞掉的那句在这儿接出来，带 stack）；
// ② 回得到的笔记真长成了屏上那些行（`notes`／`groups` 都非空，且行数之和等于笔记数）；
// ③ 每一行该有八档（`i`/`id`/`title`/`src`/`cover`/`priv`/`shared`/`card`），
//    且 `cover` 非空的那些行**必须是 `privKnown` 且不私密**的那几篇——私密闸漏水在这条上直接红。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ROOT = path.resolve(__dirname, '../..')
const SRC_VERSION = /const VERSION = '([\d.]+)'/.exec(
  fs.readFileSync(path.resolve(ROOT, 'miniprogram/utils/appInfo.js'), 'utf8'))[1]

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

;(async () => {
  process.on('unhandledRejection', (e) => { console.log('尺子挂了（未处理拒绝）', e && e.stack || e); process.exit(2) })

  let mp = null
  for (let i = 0; i < 8 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) { console.log('✗ 连不上 9431（环境红，不是产品红）'); process.exit(2) }

  // 先把 console.error 接走：`loadNotes` 那句 catch 只打这一条，不接住就只能看到一句 toast
  await mp.evaluate(() => {
    globalThis.__errCap = []
    const orig = console.error
    console.error = (...a) => {
      globalThis.__errCap.push(a.map((x) => (x && x.stack) ? x.stack : String(x)).join(' | '))
      orig.apply(console, a)
    }
  })

  let page = null
  for (let i = 0; i < 4 && !page; i++) {
    try { page = await mp.reLaunch('/pages/index/index') } catch (e) { await sleep(8000) }
  }
  if (!page) { console.log('✗ 进不去笔记列表页'); mp.close(); process.exit(2) }
  await sleep(6000)

  // 号对齐：读**运行时**关于页那一格（`globalData` 里根本没有 version，第一版我拿它当尺子，
  // 量回来一个 undefined——那是尺子读错了东西，不是产品红）。
  const aboutPage = await mp.reLaunch('/pages/about/about')
  const screenVersion = (await aboutPage.data()).version
  ck('IDE 里开的是这一条线（关于页那格＝源码那格）', String(screenVersion || '') === SRC_VERSION,
    `屏上 ${screenVersion}／源码 ${SRC_VERSION}`)
  page = await mp.reLaunch('/pages/index/index')
  await sleep(4000)

  let d = await page.data()
  if (!d.notes || !d.notes.length) {
    // 冷启那一趟可能赶在登录之前，显式再叫一次，把 catch 里那句逼出来
    try { await page.callMethod('loadNotes', true) } catch (e) { console.log('callMethod 报错：', e.message) }
    await sleep(5000)
    d = await page.data()
  }

  const errs = await mp.evaluate(() => globalThis.__errCap)
  ck('① 真打现网这一趟，console.error 一声没响', !errs || !errs.length,
    errs && errs.length ? errs.slice(0, 3).join('\n     ') : '')

  const notes = d.notes || []
  const groups = d.groups || []
  const rowCount = groups.reduce((s, g) => s + (g.rows ? g.rows.length : 0), 0)
  ck('② 笔记回得来且真长成行', notes.length > 0 && groups.length > 0,
    `notes ${notes.length}／groups ${groups.length}／行 ${rowCount}`)
  ck('②b 行数之和＝笔记数（一篇不许掉，也不许一篇画两行）', rowCount === notes.length,
    `行 ${rowCount} 对 笔记 ${notes.length}`)

  const rows = groups.flatMap((g) => g.rows || [])
  const missing = rows.filter((r) => ['i', 'id', 'title', 'src', 'cover', 'priv', 'shared', 'card']
    .some((k) => r[k] === undefined))
  ck('③ 每一行八档齐全', missing.length === 0, missing.length ? `缺档的行 ${missing.length} 条` : '')

  const skinned = notes.filter((n) => n.privKnown === undefined).length
  ck('③b 每一篇都过了 `skin()`（`privKnown` 是它算的，缺＝那一趟没跑）', skinned === 0,
    skinned ? `没过 skin 的 ${skinned} 篇` : '')

  const withCover = rows.filter((r) => r.cover)
  const privWithCover = withCover.filter((r) => r.priv)
  ck('④ 私密那一行一枚配图都没画（闸漏水直接红）', privWithCover.length === 0,
    privWithCover.length ? `漏了 ${privWithCover.length} 枚` : `有图行 ${withCover.length}/${rows.length}`)

  const serverCover = notes.filter((n) => n.cover_file_id).length
  console.log(`  · 服务端这页带 cover_file_id 的 ${serverCover} 篇；屏上真画出图的 ${withCover.length} 行`
    + `（差额应等于"分类表还没回来"或"云没就绪"那两类，不是丢图）`)
  if (withCover.length > serverCover) {
    ck('⑤ 屏上画的图不比服务端给的更多（不许拿本机路径冒充）', false,
      `画 ${withCover.length} > 服务端 ${serverCover}`)
  }

  await mp.evaluate(() => { delete globalThis.__errCap })

  // ⑥ 卡与卡之间的**净距**用布局算出来的 rect 量，不拿像素量。
  // 为什么搬到这里：像素那一把（`量-卡距与阴影-两图对比.py`）判"这一行是不是卡面"要靠一支亮度阈值，
  // 而五档心情那支浅面（`--glass-plate-dock`）在墨档压出"比面板亮 9 级"、在雨雾档压出"比面板暗 17 级"，
  // 同一把尺子换一档就切出 0 张卡——量法跟着皮的档位漂，读数就不能当判据。
  // rect 与皮无关：净距＝下一行顶 − 上一行底，应当等于 CSS 里那 28rpx（1rpx＝窗口宽／750）。
  const rowEls = await page.$$('.ixl-row')
  const boxes = []
  for (const el of rowEls.slice(0, 6)) {
    const o = await el.offset()
    const s = await el.size()
    boxes.push({ top: Number(o.top), h: parseFloat(s.height) })
  }
  const winW = await mp.evaluate(() => wx.getSystemInfoSync().windowWidth)
  const perRpx = winW / 750
  const gaps = []
  for (let i = 0; i + 1 < boxes.length; i++) gaps.push((boxes[i + 1].top - (boxes[i].top + boxes[i].h)) / perRpx)
  const gTxt = gaps.map((g) => g.toFixed(1)).join('／')
  ck('⑥ 相邻两行的净距＝CSS 那 28rpx（站长 10-17「上下面板几乎连起来」那一刀的落点）',
    boxes.length >= 2 && gaps.every((g) => g > 26 && g < 30),
    `窗口宽 ${winW}px⇒1rpx=${perRpx.toFixed(3)}px，量到净距 ${gTxt || '(不足两行)'}`)
  console.log(`  · 行高（rpx）：${boxes.map((b) => (b.h / perRpx).toFixed(1)).join('／')}`
    + `　这一档是"卡自己多高"，与净距两枚一起才决定"看不看得出缝"`)

  // 收尾留一张真数据的屏：上一轮就是"断言全绿可没人看过一眼"，而红恰好是断言够不着的那半句。
  const OUT = path.resolve(ROOT, 'docs/design/10-17列表合一/实测')
  fs.mkdirSync(OUT, { recursive: true })
  const shot = path.join(OUT, '实测-真数据列表-2.3.1.png')
  try {
    await mp.screenshot({ path: shot })
    console.log(`  · 真数据那张屏：${shot}`)
  } catch (e) {
    console.log(`  · 截图没成（不影响上面七条判据）：${e.message}`)
  }

  mp.close()
  console.log(`\n验-列表真加载：${bad.length ? '未过 ' + bad.length + ' 条' : '全部通过'}`)
  bad.forEach((b) => console.log('  ✗ ' + b))
  process.exit(bad.length ? 1 : 0)
})()
