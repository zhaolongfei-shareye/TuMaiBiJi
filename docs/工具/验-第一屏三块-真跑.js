// 第一屏三块的视觉自证（模拟器里真点、真量，不是读源码）。
// 前置：docs/工具/跑尺子.sh 9431 验-第一屏三块-真跑
//
// 这把只回答一件事：**屏上真是那三块吗**。静态那把量的是源码里的数，而"源码写对、渲染不对"
// 是这一类改版最容易漏的——效果图那一轮左块宽度算成 0（定宽没给 + 兄弟 flex:1），
// 人物没地方画，屏上是什么都没有，源码里那三个数却一个都没错。
// 所以这里全部用元素自己的帧（offset/size）来量，rpx 换算按微信那条 rpx = 屏宽/750。
//
// 截图落在 docs/design/10-10两入口多方案/模拟器-第一屏.png，直接打开就能对效果图。
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '../..')
const SHOT = path.join(ROOT, 'docs/design/10-10两入口多方案/模拟器-第一屏.png')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PERSON_KEY = 'homePerson'

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); return }
  fails.push(name)
  console.log('  ✗ ' + name + (extra ? ' —— ' + extra : ''))
}
const unwrap = (r) => (r && typeof r === 'object' && 'result' in r ? r.result : r)
const safeJson = (v) => { try { return JSON.stringify(v) } catch (e) { return String(v) } }

async function main() {
  let mp
  for (let i = 0; i < 12; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }); break } catch (e) { await sleep(10000) }
  }
  if (!mp) { console.log('!! 连不上自动化端口，先跑 cli auto'); process.exit(1) }
  // 保险：自动化通道里"没有 id 的帧"走的是 `emit(method, params)`，而 MiniProgram 是 EventEmitter——
  // 万一哪天回的是这么一帧，Node 会因为 'error' 没人听而把参数直接抛出来。挂个监听把它变成一行日志，
  // 顺带把页面报错打出来。（这一把真正撞到的不是它，是下面 §7 那条参数形状；留着不删是因为它便宜。）
  const pageErrs = []
  mp.on('error', (e) => {
    pageErrs.push(e)
    console.log('  ⚠ 页面报错帧：' + safeJson(e).slice(0, 300))
  })

  await sleep(6000)
  let page = await mp.currentPage()
  if (!/pages\/create\/create/.test(page.path || '')) {
    await mp.reLaunch('/pages/create/create')
    await sleep(6000)
    page = await mp.currentPage()
  }
  // 这一屏第一眼就该是收起态；带着上一趟的面板进来会把三块整个换掉。
  if ((await page.data()).active) { await mp.reLaunch('/pages/create/create'); await sleep(6000); page = await mp.currentPage() }

  const sys = await mp.systemInfo()
  const R = sys.windowWidth / 750           // 1rpx = 多少 px
  const q = (px) => px / R                  // px → rpx（报数用）
  console.log(`视口 ${sys.windowWidth}×${sys.windowHeight} px（1rpx=${R.toFixed(3)}px）`)

  const rect = async (sel) => {
    const node = await page.$(sel)
    if (!node) return null
    const o = await node.offset()
    const s = await node.size()
    return { top: o.top, left: o.left, w: s.width, h: s.height, bottom: o.top + s.height, right: o.left + s.width }
  }
  const disjoint = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top

  /* ---------- 0. 三块真渲染出来了 ---------- */
  const blk = await rect('.home-blk')
  const person = await rect('.blk-person')
  const jot = await rect('.blk-jot')
  const wrap = await rect('.blk-figwrap')
  const fig = await rect('.blk-fig')
  const col = await rect('.blk-col')
  const stN = await rect('.blk-stat-notes')
  const stC = await rect('.blk-stat-cards')
  ok('收起态那三块都在（.home-blk／左块／白条／两枚计数）',
    !!(blk && person && jot && wrap && fig && col && stN && stC),
    [!blk && '.home-blk', !person && '左块', !jot && '白条', !wrap && '取景窗', !fig && '人物', !stN && '笔记枚', !stC && '卡片枚'].filter(Boolean).join('、') || '都在')
  if (!person || !stN || !stC) { await mp.close(); report(); return }

  /* ---------- 1. 几何：屏上量的就是拍的那组数 ---------- */
  ok('左块渲染成 308 见方（±3rpx：被 flex 拉过就会扁）',
    Math.abs(q(person.w) - 308) <= 3 && Math.abs(q(person.h) - 308) <= 3,
    `${q(person.w).toFixed(1)}×${q(person.h).toFixed(1)}`)
  ok('右两枚各 148 高且同宽（列没吃余量时宽会跟着塌）',
    Math.abs(q(stN.h) - 148) <= 3 && Math.abs(q(stC.h) - 148) <= 3 && Math.abs(stN.w - stC.w) <= 1,
    `笔记 ${q(stN.w).toFixed(1)}×${q(stN.h).toFixed(1)}／卡片 ${q(stC.w).toFixed(1)}×${q(stC.h).toFixed(1)}`)
  ok('右两枚宽 382（效果图上量的那一个）', Math.abs(q(stN.w) - 382) <= 4, `${q(stN.w).toFixed(1)}`)
  ok('左块顶与两枚顶齐平（不同顶＝行内被哪样东西顶开了）',
    Math.abs(person.top - stN.top) <= 2, `差 ${q(person.top - stN.top).toFixed(1)}rpx`)
  ok('左块与右列、两枚之间都是同一道 12（缝不一致会看着像没对齐）',
    Math.abs(q(col.left - person.right) - 12) <= 3 && Math.abs(q(stC.top - stN.bottom) - 12) <= 3,
    `行内 ${q(col.left - person.right).toFixed(1)}／列内 ${q(stC.top - stN.bottom).toFixed(1)}`)
  ok('卡片那枚右边缘与整组右边缘对齐（三块是一个整体）',
    Math.abs(col.right - blk.right) <= 2 && Math.abs(stC.right - col.right) <= 2,
    `组右 ${q(blk.right).toFixed(1)}／列右 ${q(col.right).toFixed(1)}`)

  /* ---------- 2. 人物：上半真出血、下半真没压住白条 ---------- */
  ok('人物上沿高过左块上沿（出血 52rpx，量到 40~64 都算成立）',
    person.top - fig.top >= 40 * R && person.top - fig.top <= 64 * R,
    `出血 ${q(person.top - fig.top).toFixed(1)}rpx`)
  ok('取景窗下沿不低过白条上沿（低过头就是人物压住「记下来」）',
    wrap.bottom <= jot.top + 2 * R, `窗底 ${q(wrap.bottom).toFixed(1)}／白条顶 ${q(jot.top).toFixed(1)}`)
  ok('白条贴在左块最下面那一段（底对齐、宽等于块宽）',
    Math.abs(jot.bottom - person.bottom) <= 2 && Math.abs(jot.w - person.w) <= 2,
    `白条 ${q(jot.w).toFixed(1)}×${q(jot.h).toFixed(1)}`)
  // 这一条挪到"换到男那张之后"再量（见 §6 末）：女那张 219×318 与窗高 260 只差一点点，
  // 真正吃到这一刀的是男那张。在女那一张上量，这条几乎是在空转。
  const jotText = await (await page.$('.blk-jot-l')).text()
  ok('左块那句是「记下来」（现网字典那一条，不是效果图草稿）',
    /记下来|Jot it down/.test(jotText), JSON.stringify(jotText))
  // 三块的无障碍名字要在**屏上**成立才算数：静态只能证明 markup 写了，证明不了渲染层认这个属性
  // （小程序里 aria-label 不是所有节点都吃得下去）。10-10 实测 `attribute('aria-label')` 读得到。
  const ariaOf = async (sel) => {
    const e = await page.$(sel)
    return e ? await e.attribute('aria-label') : ''
  }
  const dd = await page.data()
  const t = dd.t                                   // 拿这一页自己那份字典比，不另 require 一份（两份真相）
  const aPerson = await ariaOf('.blk-person')
  const aNotes = await ariaOf('.blk-stat-notes')
  const aCards = await ariaOf('.blk-stat-cards')
  ok('三块各自有读屏名字，且就是屏上那一句（左块＝「记下来」，两枚＝数字＋那一格的名字）',
    aPerson === t.barIdle && aNotes === `${dd.noteCount}${t.statNotes}` && aCards === `${dd.cardCount}${t.statCards}`,
    `${JSON.stringify(aPerson)}／${JSON.stringify(aNotes)}／${JSON.stringify(aCards)}`)
  ok('小字那一行屏上真是「照片 · 链接 · 文字」三个现网标签（不是效果图上那句说明）',
    (await (await page.$('.blk-jot-s')).text()) === `${t.modePhoto} · ${t.modeUrl} · ${t.modeWrite}`,
    JSON.stringify(await (await page.$('.blk-jot-s')).text()))

  /* ---------- 3. 右两枚：图标从白条后面露出来、数字与名字各就各位 ---------- */
  const ic = await rect('.blk-stat-notes .blk-ic')
  const strip = await rect('.blk-stat-notes .blk-strip')
  const nm = await rect('.blk-stat-notes .blk-n')
  ok('图标上半看得见、下半掉进白条里（"从里面露出来"那一下）',
    ic.top < strip.top && ic.bottom > strip.bottom,
    `图 ${q(ic.top).toFixed(0)}~${q(ic.bottom).toFixed(0)}／白条 ${q(strip.top).toFixed(0)}~${q(strip.bottom).toFixed(0)}`)
  ok('数字与图标两个框不相交（数字被图标压住就是这一条）', disjoint(nm, ic),
    `数字 ${q(nm.left).toFixed(0)}~${q(nm.right).toFixed(0)}／图标 ${q(ic.left).toFixed(0)}~${q(ic.right).toFixed(0)}`)
  ok('名字那一行在数字下面（他原话「下移到数字下面」）',
    strip.top >= nm.bottom - 6 * R, `白条顶 ${q(strip.top).toFixed(1)}／数字底 ${q(nm.bottom).toFixed(1)}`)

  /* ---------- 4. 组顶那条线：比例值与夹值取小的那一个 ---------- */
  const wantTop = Math.min(sys.windowHeight * 0.663, sys.windowHeight - (394 + 128 + 24) * R)
  ok('整组顶落在 min(66.3%, 100vh−546rpx) 那一头',
    Math.abs(blk.top - wantTop) <= 4 * R, `实测 ${blk.top.toFixed(1)} / 该落 ${wantTop.toFixed(1)}`)
  ok('整组不撞底栏（卡片那枚底下还留得到留白）',
    sys.windowHeight - stC.bottom >= 23 * R, `底下余 ${q(sys.windowHeight - stC.bottom).toFixed(1)}rpx`)

  /* ---------- 5. 两个计数是真数 ---------- */
  const d = await page.data()
  ok('两枚各自有数、都是数字（读不到画 0，不画杠也不留空）',
    typeof d.noteCount === 'number' && typeof d.cardCount === 'number',
    `note=${d.noteCount} card=${d.cardCount}`)
  ok('屏上不是效果图那两个占位（128／46 落进码里就是永远显示假数）',
    !(d.noteCount === 128 && d.cardCount === 46), `note=${d.noteCount} card=${d.cardCount}`)
  const shownN = await (await page.$('.blk-stat-notes .blk-n')).text()
  ok('那一格屏上写的就是这个数', String(shownN).trim() === String(d.noteCount), `${JSON.stringify(shownN)} vs ${d.noteCount}`)

  /* ---------- 6. 双击换人 ---------- */
  const before = d.personSrc
  const p = await page.$('.blk-person')
  const t0 = Date.now()
  await p.tap()
  await p.tap()
  const gap = Date.now() - t0
  await sleep(1200)
  let after = (await page.data()).personSrc
  if (after === before) {
    // 两下之间隔着两次 WebSocket 往返，慢机器上可能已经过了那 300ms。
    // 换走"直接打两次处理函数"这条路——它测的还是同一段判间隔的代码，只是不吃派发延迟。
    await page.callMethod('onTapPerson')
    await page.callMethod('onTapPerson')
    await sleep(900)
    after = (await page.data()).personSrc
    console.log(`    （两下相隔 ${gap}ms，超过 300ms 那档；改走直调处理函数那一验）`)
  }
  ok('连点两下换到另一张人物', before !== after, `${before} → ${after}`)
  ok('换完写进本机（下次进页还是这一张）',
    ['boy', 'girl'].includes(unwrap(await mp.callWxMethod('getStorageSync', PERSON_KEY))),
    JSON.stringify(unwrap(await mp.callWxMethod('getStorageSync', PERSON_KEY))))
  ok('换人这一下没顺手把面板升起来（第一下被那枚定时器延住了）',
    !!(await page.$('.home-blk')) && !(await page.$('.entry-wrap')))
  // 换人那一下是"翻一张"，而 storage 会跨轮停在任意一张上——先把画面钉在男那一张再量，
  // 不然这一条测到的是女那张（女那张只高窗 5rpx，量出来就是在掷硬币）。
  await page.setData({ personSrc: '/assets/ic-person-alt.png' })
  await sleep(1500)
  const figB = await rect('.blk-fig')
  const wrapB = await rect('.blk-figwrap')
  const jotB = await rect('.blk-jot')
  ok('男那张确实高出取景窗（窗把它裁住，这条才不是在空转）',
    figB.bottom > wrapB.bottom + 20 * R, `图底 ${q(figB.bottom).toFixed(1)}／窗底 ${q(wrapB.bottom).toFixed(1)}`)
  ok('换完人，窗底仍然不低过白条上沿（这一条是"男性下半部不要遮挡白色横条"那一句）',
    wrapB.bottom <= jotB.top + 2 * R, `窗底 ${q(wrapB.bottom).toFixed(1)}／白条顶 ${q(jotB.top).toFixed(1)}`)
  await page.setData({ personSrc: '/assets/ic-person.png' })
  await sleep(900)
  // 清残值：站在那一张上是他自己的选择，这一把尺子不该替他留下一个"双击过"的状态。
  await mp.callWxMethod('removeStorageSync', PERSON_KEY)

  /* ---------- 7. 三块各自的落点 ----------
     `mp.switchTab(url)` / `mp.reLaunch(url)` 吃的是**字符串**，不是 `{ url }`：传对象会被套成
     `{url:{url:"…"}}` 再交给 wx，报回来的是一句查不出东西的 "Uncaught [object Object]"
     （10-10 在这把尺子自己身上踩的，不是产品问题）。退到 reLaunch 只是保险——两者走的都是同一条 onShow。 */
  const go = async (url) => {
    try { await mp.switchTab(url) } catch (e) { await mp.reLaunch(url) }
    await sleep(3500)
  }
  // 卡片那枚 = 笔记列表第二枚 tab；标记是一次性的，所以点完还得验证"下一次普通进入回到第一枚"。
  await (await page.$('.blk-stat-cards')).tap()
  await sleep(3500)
  let cur = await mp.currentPage()
  ok('点卡片那一枚落到笔记列表那一屏', /pages\/index\/index/.test(cur.path || ''), `落在 ${cur.path}`)
  ok('那一屏确实站在 cards 那一枚（标记递到了）', (await cur.data()).view === 'cards', `view=${(await cur.data()).view}`)
  await go('/pages/create/create')
  await go('/pages/index/index')
  cur = await mp.currentPage()
  ok('再普通进入一次回到默认那一枚（标记读一次就清了，没常驻）',
    (await cur.data()).view === 'list', `view=${(await cur.data()).view}`)

  await go('/pages/create/create')
  page = await mp.currentPage()
  await (await page.$('.blk-stat-notes')).tap()
  await sleep(3500)
  cur = await mp.currentPage()
  ok('点笔记那一枚也落在列表（默认那一枚）',
    /pages\/index\/index/.test(cur.path || '') && (await cur.data()).view === 'list',
    `path=${cur.path} view=${(await cur.data()).view}`)

  await go('/pages/create/create')
  page = await mp.currentPage()
  await (await page.$('.blk-person')).tap()
  await sleep(1500)
  ok('单点左块（等满那 300ms）进的是拍照那一档', (await page.data()).active === 'photo',
    `active=${(await page.data()).active}`)
  await page.callMethod('collapse')
  await sleep(1500)

  /* ---------- 8. 整屏截图（对效果图用） ---------- */
  ok('这一路走下来页面没有报过错（报了不一定看得出现在这一屏）',
    pageErrs.length === 0, pageErrs.length ? safeJson(pageErrs[0]).slice(0, 200) : '')
  fs.mkdirSync(path.dirname(SHOT), { recursive: true })
  await mp.screenshot({ path: SHOT })
  ok('截图落盘', fs.existsSync(SHOT) && fs.statSync(SHOT).size > 8000, SHOT)
  console.log('  截图：' + SHOT)

  await mp.close()
  report()
}

function report() {
  console.log(fails.length
    ? `\n✗ 第一屏三块 真跑：${pass}/${pass + fails.length} 过　红：${fails.join(' / ')}`
    : `\n✓ 第一屏三块 真跑：${pass} 条全过`)
  if (fails.length) process.exit(1)
}

main().catch((e) => { console.error('!! 尺子挂了', e && (e.stack || e.message)); process.exit(1) })
