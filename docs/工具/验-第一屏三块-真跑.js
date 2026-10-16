// 第一屏那一大块（2.2 B 方案）的视觉自证：模拟器里真点、真量，不是读源码。
// 前置：MP_ROOT=/Users/zlfmac/Documents/TuMaiBiJi-2.2 docs/工具/跑尺子.sh 9431 验-第一屏三块-真跑
//
// 这把只回答一件事：**屏上真是效果图那一版吗**。静态那把量的是源码里的数，而"源码写对、渲染不对"
// 是这一类改版最容易漏的——10-10 那一轮左块宽度算成 0（定宽没给 ＋ 兄弟 flex:1），
// 人物没地方画，屏上是什么都没有，源码里那三个数却一个都没错。
// 所以这里全部用元素自己的帧（offset/size）来量，rpx 换算按微信那条 rpx = 屏宽/750。
//
// ⚠ 为什么整把重写：10-11 那版的机器（白条 `.blk-jot`、两枚计数 `.blk-stat-*`、皮挂在
//   `.container.has-bg` 上）在 B 方案里整层撤了。尺子继续指着那些类名就是**假红**——
//   摸不到元素不等于渲染错了，是那一层根本不存在了。撤一个状态会作废一批判据，重算过才有新的。
// 截图落在 docs/design/10-12-2.2全量效果图/实测-首屏2.2.png，打开就能与单屏-B中-01.png 对。
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '../..')
const SHOT = path.join(ROOT, 'docs/design/10-12-2.2全量效果图/实测-首屏2.2.png')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PERSON_KEY = 'homePerson'
// §9 那一双"铺图／不铺图"里的探针用图：只是拿来当"背后有一张照片"，用完在收尾还回 before。
// 为什么不能用进来时那一张：那一屏可能本来就没铺（before.bgSrc 是空），
// 两态就量成同一个东西，"两态都挂"那几条会一起假绿。
// ⚠ 10-14 §8.231 把包内那张默认底图（`/assets/home-bg-portrait.jpg`）从包里删了，这一格跟着改指
//   包里还在的一张真位图：`share-card.jpg`（1280×1024 JPEG，宽度与原来那张同为 1280，不是产品资源）。
//   留着老路径的后果是"铺图那一态其实没铺上图"，而这一批判据全在"铺了图"那一态上——假绿。
const PROBE_BG = '/assets/share-card.jpg'

// 下面这些"该落在哪"的数：整组／白面／墨面那三个从 create.wxss 现读，其余仍是效果图正本换算来
// （图上 1px＝1rpx），推导写在静态那把 `验-第一屏三块.js`。
//
// ⚠ 为什么这三个改成现读（10-13 这轮实测出来的）：这里原来写死 `FACE_H = 213 / BAND_H = 197 /
//   GROUP_H = 410`，而 D17 甲那一刀把白面改成「顶下留 24、高 189」，静态那把跟着改了口径、这把没跟上，
//   于是屏上量到 188.5 反被判成红——**188.5 恰恰是应该的那一版**。
//   这一把的任务是「渲染有没有照源码画出来」，"源码里那个数是不是效果图那一个"归静态那把钉；
//   两处都写死同一个数就是同一句话讲两遍，改一处就得记得改两处，忘了就造一条假红。
const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/create/create.wxss'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')           // 注释里那些"曾经是多少"不能被判据当真
const seg = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(wxss)
  return m ? m[1] : ''
}
const num = (s, prop) => parseInt(new RegExp(prop + ':\\s*(-?\\d+)rpx').exec(s)?.[1] ?? '', 10)
const GROUP_H = num(seg('.blk-person'), 'height')   // 整组＝那一行左块的高（＝第二屏那张面板的高，同一根顶线）
const FACE_H = num(seg('.blk-face'), 'height')      // 上：纯白渐变毛玻璃那一片
const FACE_TOP = num(seg('.blk-face'), 'top')       // 白面上沿离块顶那一口（10-13 追打那一刀之前恒为 0）
const BAND_H = num(seg('.blk-count'), 'height')     // 下：墨黑渐变毛玻璃那一片
const BREATHE = 24         // 收起态：面板顶比组顶只高这一口＝那一组底离底栏顶的呼吸（静态那把钉的是"两口相等"这条等式，这里钉屏上量出来的数）
const BLEED = 52           // 人物高出内框上沿那一段
const FIG_W = 220
const ALT_H = 132          // 剪影按高定，两态同一个数
const CELL_W = 122         // (308 − 22×2 − 20) / 2
const COL_W = 382          // 702 − 308 − 12
const PLUS = 140
const PLUS_GAP = 40        // 圆 ➕ 顶上与 Tips 那一段之间留的数

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
  // 10-13 这一轮就是栽在这儿：连接十二次全失败，尺子只打一句「连不上自动化端口」，
  // 把 automator 的报错原样吞了——真原因是 `cmpVersion(undefined)`（IDE 的 Tool.getInfo
  // 只回 version 不回 SDKVersion），靠这句才查得到。连接红必须自带最后一次的报错。
  let lastErr = ''
  for (let i = 0; i < 12; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }); break } catch (e) {
      lastErr = String((e && e.message) || e)
      await sleep(10000)
    }
  }
  if (!mp) {
    console.log('!! 连不上自动化端口，先跑 cli auto')
    console.log('   最后一次的报错原文：' + lastErr)
    console.log('   （ automator 的版本闸由 docs/工具/修-automator版本闸.js 管，先跑它一次再试）')
    process.exit(1)
  }
  // 自动化通道里"没有 id 的帧"走的是 `emit(method, params)`，而 MiniProgram 是 EventEmitter——
  // 万一哪天回的是这么一帧，Node 会因为 'error' 没人听而把参数直接抛出来。挂个监听把它变成一行日志。
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
  // 这一屏第一眼就该是收起态；带着上一趟的面板进来会把整组换掉（`wx:if="{{!active}}"`）。
  if ((await page.data()).active) { await mp.reLaunch('/pages/create/create'); await sleep(6000); page = await mp.currentPage() }
  /* 本机人物残值也要归位。§3 那条"220 宽、女那张 264.6 高"量的是**默认态**，而上一趟跑到一半被打断
     （10-16 那趟：包没编译过、进程被杀）就会把 `homePerson` 留在 `boy`，于是这一条量到 219.2×317.9
     ——那是男那张 360×522 的比例，渲染没错，是尺子拿别人的残值当默认态打分。
     归位（而不是"改成量男那张的比例"）才让 §3 与 §6 两条都还是真判据。清完要重新进页：
     这一屏画的是进页那一刻从 storage 读出来的那一张。 */
  const stalePerson = unwrap(await mp.callWxMethod('getStorageSync', PERSON_KEY))
  if (stalePerson && stalePerson !== 'girl') {
    await mp.callWxMethod('removeStorageSync', PERSON_KEY)
    await mp.reLaunch('/pages/create/create'); await sleep(6000); page = await mp.currentPage()
    console.log(`  · 进门残值 person=${JSON.stringify(stalePerson)} 已清，读回 ${JSON.stringify(unwrap(await mp.callWxMethod('getStorageSync', PERSON_KEY)))}（空＝走包内默认那张）`)
  }

  const sys = await mp.systemInfo()
  const R = sys.windowWidth / 750           // 1rpx = 多少 px
  const q = (px) => px / R                  // px → rpx（报数用）
  console.log(`视口 ${sys.windowWidth}×${sys.windowHeight} px（1rpx=${R.toFixed(3)}px）`)

  const frame = async (node) => {
    if (!node) return null
    const o = await node.offset()
    const s = await node.size()
    // `size()` 的类型声明写的是 string，实际回的是 number（10-10 那几轮就靠这个数判的）。
    // 这里统一 Number() 一下：万一哪天真回成 "308px"，`o.top + s.height` 会拼成字符串，
    // 整把尺子会红得查不出原因。
    const px = (v) => Number(typeof v === 'string' ? parseFloat(v) : v)
    const top = px(o.top), left = px(o.left), w = px(s.width), h = px(s.height)
    return { top, left, w, h, bottom: top + h, right: left + w }
  }
  const rect = async (sel) => frame(await page.$(sel))
  /* 首屏那几枚（`.blk-person`／`.blk-plus`／`.blk-alt-hit`）全住在 `wx:if="{{!active}}"` 里面：
     上一处判据刚把面板升起来，`collapse` 那一下还没落定就 `$()` 会回 null，`.tap()` 当场把整把
     尺子打断（10-15 01:5x 主树那一趟就断在 §8 那枚 ➕ 上，报的是一句查不出东西的
     `Cannot read properties of null (reading 'tap')`，前面几十条跟着白跑）。
     这是**尺子的前提**、不是产品的断言 ⇒ 等到它真在屏上再点；等不到就把 data 快照打出来再抛，
     别再留一句 null——快照里的 `active/busy/panelOpen` 才能分清"页面没收"和"这一版压根没渲染"。 */
  const tapBlk = async (sel) => {
    for (let i = 0; i < 30; i += 1) {
      const n = await page.$(sel)
      if (n) { await n.tap(); return }
      if ((await page.data()).active) await page.callMethod('collapse')
      await sleep(250)
    }
    const d = await page.data()
    throw new Error(`${sel} 摸不到：等了 7.5 秒（active=${JSON.stringify(d.active)} busy=${d.busy} panelOpen=${d.panelOpen}）`)
  }
  // 两枚计数**没有各自的类名**（B 方案就是两枚同类的 .blk-cell，靠 catchtap 分 goNotes/goCards），
  // 所以这里不用 `:first-child` 那种伪类——automator 的选择器引擎认不认它没验过，认错了就是"摸不到＝红"。
  // 走 `$$` 拿到的那两个节点，再各自往节点里查（Element.$ 是带作用域的）。
  const cellRect = async (i, sel) => frame(await cells[i].$(sel))
  const cellText = async (i, sel) => {
    const n = await cells[i].$(sel)
    return n ? String(await n.text()).trim() : '(摸不到)'
  }
  const cellStyle = async (i, sel, prop) => {
    const n = await cells[i].$(sel)
    return n ? String(await n.style(prop)) : '(摸不到)'
  }
  const styleOf = async (sel, prop) => {
    const node = await page.$(sel)
    return node ? String(await node.style(prop)) : '(摸不到)'
  }
  const textOf = async (sel) => {
    const node = await page.$(sel)
    return node ? String(await node.text()).trim() : '(摸不到)'
  }
  const ariaOf = async (sel) => {
    const node = await page.$(sel)
    return node ? String(await node.attribute('aria-label')) : ''
  }
  const near = (a, b, tol) => Math.abs(a - b) <= tol
  /** 渐变到底画没画出来：`background-image` 里数色标。
      ⚠ 读"这面是不是白半透"不能只读 `background-color`——给的是渐变时它会被静默算成 transparent（10-11 那轮的坑）。 */
  const gradStops = (s) => (String(s).match(/rgba?\(/g) || []).length
  const rgbaOf = (s) => {
    const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(String(s))
    return m ? { rgb: `${m[1]}, ${m[2]}, ${m[3]}`, a: m[4] === undefined ? 1 : Number(m[4]) } : null
  }

  /* ---------- 0. 这一版的每一枚真渲染出来了 ---------- */
  const panel = await rect('.stage-panel')
  const blk = await rect('.home-blk')
  const person = await rect('.blk-person')
  const face = await rect('.blk-face')
  const count = await rect('.blk-count')
  const wrap = await rect('.blk-figwrap')
  const fig = await rect('.blk-fig')
  const col = await rect('.blk-col')
  const tips = await rect('.blk-tips')
  const plus = await rect('.blk-plus')
  ok('收起态：内框离外框顶的那一口 ＝ 它离底栏顶的那一口（他 10-13「要与下方的 tab 面板距离一样」）',
    !!panel && !!blk && near(blk.top - panel.top, BREATHE * R, 3 * R),
    panel && blk ? `上留空 ${q((blk.top - panel.top) / R).toFixed(1)}rpx／应等于 ${BREATHE}rpx` : '没量到')
  // ⚠ `cells` 存的是**元素句柄**（往节点里查 `.blk-num`、点它、读它的 aria-label 都靠这个），
  //   量出来的帧另存 `cellBox`。原来两个名字是同一个，13 号那一跑就崩在
  //   `cells[i].$ is not a function`——句柄数组被帧对象覆盖掉了，而这条红长得像"页面渲染坏了"。
  const cells = await page.$$('.blk-cell')
  const cellBox = []
  for (const n of cells) cellBox.push(await frame(n))
  ok('首屏这一版的十一枚都在（深色面板／整组／左块／白面／墨面／取景窗／人物／右列／Tips 格／圆 ➕／两枚计数）',
    !!(panel && blk && person && face && count && wrap && fig && col && tips && plus) && cells.length === 2,
    [!panel && '深色面板', !blk && '.home-blk', !person && '左块', !face && '白面', !count && '墨面',
      !wrap && '取景窗', !fig && '人物', !col && '右列', !tips && 'Tips 格', !plus && '圆 ➕',
      cells.length !== 2 && `计数枚数=${cells.length}`].filter(Boolean).join('、') || '都在')
  if (!panel || !person || !face || !count || cells.length !== 2) { await mp.close(); report(); return }

  /* ---------- 1. 那一块里外：同顶、同底、两片无缝 ---------- */
  ok('左块渲染成 308 见方、高等源码那一档（与第二屏那张面板同高；±3rpx，被 flex 拉过就会扁）',
    near(q(person.w), 308, 3) && near(q(person.h), GROUP_H, 3),
    `量到 ${q(person.w).toFixed(1)}×${q(person.h).toFixed(1)}／应 308×${GROUP_H}`)
  ok('白面：高等源码那一档、顶比块顶低"那一口"（10-13 追打那一刀：女那张头带一半要出框）、宽等于块宽',
    near(q(face.h), FACE_H, 3) && near(q(face.top - person.top), FACE_TOP, 3) && near(q(face.w), 308, 3),
    `高 ${q(face.h).toFixed(1)}／应 ${FACE_H}·顶留空 ${q(face.top - person.top).toFixed(1)}／应 ${FACE_TOP}／宽 ${q(face.w).toFixed(1)}`)
  ok('墨面 197 高、底与左块同一条线、与白面无缝相接（「下方数字区域用黑色毛玻璃」那一片）',
    near(q(count.h), BAND_H, 3) && near(count.bottom, person.bottom, 2 * R) && near(count.top, face.bottom, 2 * R),
    `高 ${q(count.h).toFixed(1)}／应 ${BAND_H}·底差 ${q(count.bottom - person.bottom).toFixed(1)}／缝 ${q(count.top - face.bottom).toFixed(1)}`)
  ok('三段拼成整块：留空＋白面＋墨面＝块高（屏上量的；对不上＝有一片被哪条声明改过高度）',
    near(q(face.top - person.top) + q(face.h) + q(count.h), GROUP_H, 4),
    `屏上 ${(q(face.top - person.top) + q(face.h) + q(count.h)).toFixed(1)} vs 源码 ${FACE_TOP}＋${FACE_H}＋${BAND_H}＝${GROUP_H}`)
  ok('两枚计数各 122 宽、同顶同高、互不相交，缝是那一道 20',
    near(q(cellBox[0].w), CELL_W, 3) && near(q(cellBox[1].w), CELL_W, 3)
    && near(cellBox[0].top, cellBox[1].top, 2 * R) && near(cellBox[0].h, cellBox[1].h, 2 * R)
    && cellBox[0].right <= cellBox[1].left + 1 && near(q(cellBox[1].left - cellBox[0].right), 20, 3),
    `宽 ${q(cellBox[0].w).toFixed(1)}／${q(cellBox[1].w).toFixed(1)}，缝 ${q(cellBox[1].left - cellBox[0].right).toFixed(1)}`)
  ok('两枚都待在墨面那一片里面（溢出到白面就是 absolute 那几条掉了一层）',
    cellBox.every((c) => c.top >= count.top - 1 && c.bottom <= count.bottom + 1),
    `墨面 ${q(count.top).toFixed(1)}~${q(count.bottom).toFixed(1)}／格 ${cellBox.map((c) => `${q(c.top).toFixed(1)}~${q(c.bottom).toFixed(1)}`).join('、')}`)
  ok('右列宽 382、与左块同顶同底、顶上那道缝 12（列没吃余量时宽会跟着塌）',
    near(q(col.w), COL_W, 4) && near(col.top, person.top, 2 * R) && near(col.bottom, person.bottom, 2 * R)
    && near(q(col.left - person.right), 12, 3),
    `宽 ${q(col.w).toFixed(1)}／顶底差 ${q(col.top - person.top).toFixed(1)}・${q(col.bottom - person.bottom).toFixed(1)}／缝 ${q(col.left - person.right).toFixed(1)}`)
  ok('整组左右各留 24、通到同一根右边线（组宽 702）',
    near(q(blk.w), 702, 3) && near(q(blk.left), 24, 2) && near(blk.right, col.right, 2 * R),
    `宽 ${q(blk.w).toFixed(1)}／左 ${q(blk.left).toFixed(1)}`)

  /* ---------- 2. 圆 ➕ 与 Tips 那一格（他这两句都点过名） ---------- */
  ok('圆 ➕ 渲染成 140 见方（不是 110、也不是被 flex 压扁的椭圆）',
    near(q(plus.w), PLUS, 3) && near(q(plus.h), PLUS, 3) && near(q(plus.right - plus.left), PLUS, 3),
    `${q(plus.w).toFixed(1)}×${q(plus.h).toFixed(1)}`)
  ok('圆 ➕ 落在右列正中（他 10-13「右下的圆按钮要往中间靠，现在太边缘了，不行」）',
    near(q(plus.left + plus.w / 2), q(col.left + col.w / 2), 3),
    `圆心 x ${q(plus.left + plus.w / 2).toFixed(1)}／列中线 x ${q(col.left + col.w / 2).toFixed(1)}`)
  ok('圆 ➕ 贴住这一列的底，顶上留出与 Tips 那一段的 40',
    near(plus.top, col.bottom - PLUS * R, 2 * R) && near(q(plus.top - tips.bottom), PLUS_GAP, 6),
    // 原来第二条写的是 `tips.bottom - plus.top`（➕ 在格子下面，那是个负数）却拿去和
    // PLUS_GAP＋PLUS＝180 比——两条腿一条永远真、一条永远假，红得看不出是量法错了。
    `底差 ${q(plus.top - (col.bottom - PLUS * R)).toFixed(1)}／Tips 格底到 ➕ 顶 ${q(plus.top - tips.bottom).toFixed(1)}／应 ${PLUS_GAP}`)
  ok('Tips 格吃满 ➕ 以上那一段（顶贴列顶，不悬空也不重叠）',
    near(tips.top, col.top, 2 * R) && near(q(tips.h), GROUP_H - PLUS - PLUS_GAP, 6),
    `顶差 ${q(tips.top - col.top).toFixed(1)}／高 ${q(tips.h).toFixed(1)}`)
  const line = await rect('.blk-tips-line')
  const dot = await rect('.tips-dot')
  ok('Tips 在那一格里上下居中（他 10-13「每个图片 Tips 处在区域，Tips 要上下居中对齐」）',
    !!line && near(q((line.top + line.h / 2) - (tips.top + tips.h / 2)), 0, 6),
    line ? `句子中心 ${q(line.top + line.h / 2).toFixed(1)}／格子中心 ${q(tips.top + tips.h / 2).toFixed(1)}` : '屏上没有 .blk-tips-line')
  // 点跟着**第一行**走：折成两三行时 `line.h` 是两三行的总高，所以比的是"点中心落在第一行那 33.6 里"，
  // 不是"落在整段中间"（那是原来 `.out-dot` 的 align-self:flex-start 想说的同一件事）。
  const lineH = parseFloat(await styleOf('.blk-tips-line', 'line-height'), 10)
  ok('小圆点落在句子第一行的正中（14 见方，比现档小字还低一档）',
    !!dot && near(q(dot.w), 14, 2)
    && Math.abs((dot.top + dot.h / 2) - (line.top + Math.min(lineH, line.h) / 2)) <= 4 * R,
    dot ? `点 ${q(dot.w).toFixed(1)}见方·中心 ${q(dot.top + dot.h / 2).toFixed(1)}／第一行中心 ${q(line.top + Math.min(lineH, line.h) / 2).toFixed(1)}（行高 ${q(lineH).toFixed(1)}）` : '屏上没有 .tips-dot')
  const tipText = await textOf('.blk-tips-line')
  ok('屏上那句 Tips 真有内容（轮播起来之后不许是空串——空了那一格就塌）',
    tipText.length > 3 && tipText !== '(摸不到)', JSON.stringify(tipText.slice(0, 24)))

  /* ---------- 3. 取景窗与人物：出血、贴住黑条、剪影按高定 ----------
     ⚠ 底栏那一排在automator 里**摸不到**（它是自定义组件 `custom-tab-bar`，`page.$` 只走页面那棵树，
     10-01 那轮就记过：只能截图采像素）。所以"面板通栏贴到屏底会不会压住底栏两格"这条不在这里量，
     归静态那把 §9 最后一条（面板层号 < 底栏层号，两个数都从各自那一份样式表现读）。
     这一格留这句话是给下一个人：别在这里加 `.tab-bar` 的选择器，那是一条永远红不了的假判据。 */
  ok('人物上沿高过左块上沿（出血 52rpx，量到 40~64 都算成立；他 10-13「人头要高于内框上沿，与目前现网一样」）',
    person.top - fig.top >= 40 * R && person.top - fig.top <= 64 * R,
    `出血 ${q(person.top - fig.top).toFixed(1)}rpx`)
  ok('取景窗上沿就是那块出血的顶（−52）、下沿正好坐在黑条顶上（"下方不能悬空要与黑条靠着"）',
    near(q(wrap.top - person.top), -BLEED, 3) && near(wrap.bottom, count.top, 2 * R),
    `窗顶差 ${q(wrap.top - person.top).toFixed(1)}／窗底 ${q(wrap.bottom).toFixed(1)} vs 黑条顶 ${q(count.top).toFixed(1)}`)
  // 窗高那一条原来写的是 `GROUP_H − BLEED − BAND_H`（＝410−52−197＝161），
  // 而窗是"从出血的顶画到黑条顶上"，出血那一段在块顶**之上**、要加不是要减：
  // 正确等式是 `块高 − 墨面 ＋ 出血`＝410−197＋52＝265，屏上量到 265.4。
  // 这条红是量法错，不是渲染错——同一个数在相邻两条里一边判"贴住黑条顶"绿、一边判"窗高 161"红，
  // 就说明错的是那个减号。
  ok('窗高＝块高减墨面再加出血（窗从出血的顶画到黑条顶上，一段都不多一段都不少）',
    near(q(wrap.h), GROUP_H - BAND_H + BLEED, 3),
    `量到 ${q(wrap.h).toFixed(1)}／应 ${GROUP_H}−${BAND_H}＋${BLEED}＝${GROUP_H - BAND_H + BLEED}`)
  ok('主人物按宽定高：220 宽、女那张算出 264.6 高（写死方盒子会把其中一张拉扁）',
    near(q(fig.w), FIG_W, 3) && near(q(fig.h), 220 * 433 / 360, 6),
    `${q(fig.w).toFixed(1)}×${q(fig.h).toFixed(1)}`)
  const figZ = parseFloat(await styleOf('.blk-fig', 'z-index'), 10)
  const altZ = parseFloat(await styleOf('.blk-fig-alt', 'z-index'), 10)
  ok('剪影真在主人物后面（z 序 2 对 1；反了就是"大的挡小的"那一眼）',
    figZ > altZ, `主 ${figZ}／剪影 ${altZ}`)

  /* ---------- 4. 数字那一格的次序与字阶（他点名的两句话） ---------- */
  const d4 = await page.data()
  const t4 = d4.t
  const num0 = await cellRect(0, '.blk-num')
  const rule0 = await cellRect(0, '.blk-rule')
  const lab0 = await cellRect(0, '.blk-lab')
  ok('数字在横线上方、分类名在横线下方（同一条线不许交叉）',
    !!num0 && !!rule0 && !!lab0 && num0.bottom <= rule0.top + 2 * R && rule0.bottom <= lab0.top + 2 * R,
    num0 ? `数字底 ${q(num0.bottom).toFixed(1)}／线 ${q(rule0.top).toFixed(1)}~${q(rule0.bottom).toFixed(1)}／名顶 ${q(lab0.top).toFixed(1)}` : '三件没量全')
  ok('横线渲染成 88×2（那条"下划线可点击"的就是它，不是文字自带的 underline）',
    !!rule0 && near(q(rule0.w), 88, 3) && near(q(rule0.h), 2, 1.5),
    rule0 ? `${q(rule0.w).toFixed(1)}×${q(rule0.h).toFixed(1)}` : '')
  ok('数字 64、分类名走现成那档小字（18=--fs-micro，不为一枚名字另起一架字号）',
    near(q(parseFloat(await cellStyle(0, '.blk-num', 'font-size'), 10)), 64, 2)
    && near(q(parseFloat(await cellStyle(0, '.blk-lab', 'font-size'), 10)), 18, 1),
    `数字 ${q(parseFloat(await cellStyle(0, '.blk-num', 'font-size'), 10)).toFixed(1)}rpx／名 ${q(parseFloat(await cellStyle(0, '.blk-lab', 'font-size'), 10)).toFixed(1)}rpx`)
  ok('屏上两枚数字就是这个真数（不是 setData 里的另一份，也不是效果图那两个占位）',
    (await cellText(0, '.blk-num')) === String(d4.noteCount) && (await cellText(1, '.blk-num')) === String(d4.cardCount)
    && !(d4.noteCount === 128 && d4.cardCount === 46),
    `屏上 ${(await cellText(0, '.blk-num'))}・${(await cellText(1, '.blk-num'))} vs data ${d4.noteCount}・${d4.cardCount}`)
  ok('两枚名字就是屏上那两格已有的词（笔记／卡片），不借屏外新叫法',
    (await cellText(0, '.blk-lab')) === t4.statNotes && (await cellText(1, '.blk-lab')) === t4.statCards,
    `${await cellText(0, '.blk-lab')}／${await cellText(1, '.blk-lab')}`)

  /* ---------- 5. 读屏名字在渲染层也认（静态只能证明 markup 写了） ---------- */
  const aPerson = await ariaOf('.blk-person')
  const aPlus = await ariaOf('.blk-plus')
  const aNotes = String(await cells[0].attribute('aria-label'))
  const aCards = String(await cells[1].attribute('aria-label'))
  const aAlt = await ariaOf('.blk-alt-hit')
  ok('左块与圆 ➕ 念的是同一句「记下来」（屏上写的和读屏念的同一句，不许两份真相）',
    aPerson === t4.barIdle && aPlus === t4.barIdle, `${JSON.stringify(aPerson)}／${JSON.stringify(aPlus)}`)
  ok('两枚计数念的是「数字＋那一格的名字」（不只念一个数）',
    aNotes === `${d4.noteCount}${t4.statNotes}` && aCards === `${d4.cardCount}${t4.statCards}`,
    `${JSON.stringify(aNotes)}／${JSON.stringify(aCards)}`)
  ok('剪影那枚透明热区也有读屏名字（换人这一下不能只有眼睛看得见）',
    aAlt === t4.personSwap, JSON.stringify(aAlt))

  /* ---------- 6. 点右后方那枚剪影换人 ---------- */
  const tapHit = async () => { await tapBlk('.blk-alt-hit'); await sleep(700) }
  for (let i = 0; i < 2 && (await page.data()).personKey !== 'girl'; i += 1) await tapHit()
  const d6 = await page.data()
  ok('默认那一态：女在前、男在剪影位（两个位各绑一枚，不是一枚 src 翻两面）',
    d6.personKey === 'girl' && /ic-person\.png$/.test(d6.personSrc) && /ic-person-alt\.png$/.test(d6.personAltSrc),
    `${d6.personSrc} / ${d6.personAltSrc}`)
  const alt6 = await rect('.blk-fig-alt')
  const hit6 = await rect('.blk-alt-hit')
  ok('剪影按高定：屏上 132（两态同一个数；按宽定就是被打回的"换人矮一截"）',
    !!alt6 && near(q(alt6.h), ALT_H, 3), alt6 ? `高 ${q(alt6.h).toFixed(1)}／宽 ${q(alt6.w).toFixed(1)}` : '屏上没有 .blk-fig-alt')
  ok('剪影落在右下（右缘、底缘都贴到取景窗那两条边）',
    !!alt6 && near(alt6.right, wrap.right, 2 * R) && near(alt6.bottom, wrap.bottom, 2 * R),
    alt6 ? `右差 ${q(alt6.right - wrap.right).toFixed(1)}／底差 ${q(alt6.bottom - wrap.bottom).toFixed(1)}` : '')
  ok('热区盖得住剪影本身（宽或高小一档，剪影就有一段点了没反应）',
    !!hit6 && hit6.w >= alt6.w - 1 && hit6.h >= alt6.h - 1,
    `热区 ${hit6 && q(hit6.w).toFixed(1)}×${hit6 && q(hit6.h).toFixed(1)} vs 剪影 ${q(alt6.w).toFixed(1)}×${q(alt6.h).toFixed(1)}`)
  const srcBefore = d6.personSrc
  await tapHit()
  const d7 = await page.data()
  const fig7 = await rect('.blk-fig')
  const alt7 = await rect('.blk-fig-alt')
  ok('点剪影真的换了人（两个位同时对调）',
    d7.personKey === 'boy' && d7.personSrc !== srcBefore && d7.personAltSrc === srcBefore,
    `${srcBefore} → ${d7.personSrc}（剪影位 ${d7.personAltSrc}）`)
  ok('换到"男在前"之后剪影还是 132（"要与之前右侧男孩高度一致"量的就是这两行）',
    !!alt7 && near(q(alt7.h), ALT_H, 3) && Math.abs(alt7.h - alt6.h) <= 2 * R,
    `默认态 ${q(alt6.h).toFixed(1)} → 换人后 ${alt7 && q(alt7.h).toFixed(1)}`)
  ok('男那张确实高出取景窗（窗把它裁住，人头仍高于内框上沿；这条在女那张上几乎空转）',
    fig7.bottom > wrap.bottom + 20 * R && near(q(fig7.h), 220 * 522 / 360, 8),
    `图底 ${q(fig7.bottom).toFixed(1)}／窗底 ${q(wrap.bottom).toFixed(1)}／自身高 ${q(fig7.h).toFixed(1)}`)
  ok('换完人窗底仍然坐在黑条顶上（男性下半部不许越过数字那一格）',
    near(wrap.bottom, (await rect('.blk-count')).top, 2 * R), '')
  ok('换人这一下没顺手把面板升起来（热区吃 catchtap，没冒到左块那一档）',
    !!(await page.$('.home-blk')) && !(await page.$('.entry-wrap')) && !d7.active, `active=${d7.active}`)
  ok('换完写进本机（下次进页还是这一张）',
    unwrap(await mp.callWxMethod('getStorageSync', PERSON_KEY)) === 'boy',
    JSON.stringify(unwrap(await mp.callWxMethod('getStorageSync', PERSON_KEY))))
  await tapHit()
  const back6 = await page.data()
  ok('再点一次换得回原来那一个（两张各自都能站到前面来）',
    back6.personKey === 'girl' && back6.personSrc === srcBefore, `${back6.personKey}／主 ${back6.personSrc}`)
  await mp.callWxMethod('removeStorageSync', PERSON_KEY)   // 清残值：尺子不替他留下点过的状态

  /* ---------- 7. 三个入口各自落点 ＋ 开门零延迟 ----------
     `mp.switchTab(url)` / `mp.reLaunch(url)` 吃的是**字符串**，不是 `{ url }`：传对象会被套成
     `{url:{url:"…"}}` 再交给 wx，报回来的是一句查不出东西的 "Uncaught [object Object]"
     （10-10 在这把尺子自己身上踩的，不是产品问题）。 */
  const go = async (url) => {
    try { await mp.switchTab(url) } catch (e) { await mp.reLaunch(url) }
    await sleep(3500)
  }
  await cells[1].tap()
  await sleep(3500)
  let cur = await mp.currentPage()
  ok('点卡片那一枚落到笔记列表那一屏', /pages\/index\/index/.test(cur.path || ''), `落在 ${cur.path}`)
  ok('那一屏确实站在 cards 那一枚（标记递到了）', (await cur.data()).view === 'cards', `view=${(await cur.data()).view}`)
  await go('/pages/create/create')
  await go('/pages/index/index')
  // 10-14 23:1x 这一条读过一次 `view=undefined`：`view` 是 index.js 的 data 字面量里就有的键，
  // 首页不可能读不到，只有**读错了屏**才为空（切 tab 那 3.5 秒还没落定）。所以这里等到真的
  // 站在 index 上再读，最多再等 8 秒；断言本身一个字没松，只是不再拿上一屏的空对象当结论。
  cur = await mp.currentPage()
  for (let t = 0; t < 8 && !/pages\/index\/index/.test(cur.path || ''); t++) {
    await sleep(1000)
    cur = await mp.currentPage()
  }
  ok('再普通进入一次回到默认那一枚（标记读一次就清了，没常驻）',
    (await cur.data()).view === 'list', `view=${(await cur.data()).view}｜屏是 ${cur.path}`)

  await go('/pages/create/create')
  page = await mp.currentPage()
  // ⚠ 这一处原来直接量"回到首屏还是两枚计数"，在**主树那一趟**（10-15 01:2x）当场 `枚数=0` 而下一行
  // `cellsBack[0].tap()` 直接把尺子打断。差的不可能是包：合并后两支的 `miniprogram/` 是同一个树对象
  // （`0d6b99c…`），2.2 工作树那一趟 94/94。差在**进出路**——`go()` 是 `switchTab`，回到的是还活着的
  // 那一枚 tab 页实例，上一趟留在 `data.active` 里的展开态跟着回来了（`.home-blk` 是 `wx:if="{{!active}}"`，
  // 展开就没有这两枚）。⇒ 与文件开头那一处同款：这是**尺子的前提**，不是产品的断言（第一眼该是收起态，
  // 由这里自己把它钉回收起态；入口分型＝从别的页 switchTab 回来）。判据一个字没改，量的还是"重渲染后两枚计数"。
  if ((await page.data()).active) {
    await mp.reLaunch('/pages/create/create')
    await sleep(4000)
    page = await mp.currentPage()
  }
  // 换过页面之后上一批元素句柄就作废了（automator 的 Element 绑的是当时那一帧的 id），
  // 所以这里重新查一次两枚计数，不复用 §4 的 `cells`。
  const cellsBack = await page.$$('.blk-cell')
  ok('回到首屏还是两枚计数（换页回来整组重渲染，掉成一枚就是 wx:for/wx:if 那一段写坏）',
    cellsBack.length === 2, `枚数=${cellsBack.length}`)
  await cellsBack[0].tap()
  await sleep(3500)
  cur = await mp.currentPage()
  ok('点笔记那一枚也落在列表（默认那一枚）',
    /pages\/index\/index/.test(cur.path || '') && (await cur.data()).view === 'list',
    `path=${cur.path} view=${(await cur.data()).view}`)

  await go('/pages/create/create')
  page = await mp.currentPage()
  // 同一处分型，理由见上面那段：switchTab 回的是还活着的实例，展开态会跟着回来，
  // 而这一处要点 `.blk-person`（它在收起态才在屏上）并量"零延迟"。
  if ((await page.data()).active) {
    await mp.reLaunch('/pages/create/create')
    await sleep(4000)
    page = await mp.currentPage()
  }
  const tTap = Date.now()
  await tapBlk('.blk-person')
  let tapGap = -1
  for (let i = 0; i < 20; i += 1) {
    if ((await page.data()).active) { tapGap = Date.now() - tTap; break }
    await sleep(50)
  }
  ok('单点左块进的是拍照那一档', (await page.data()).active === 'photo', `active=${(await page.data()).active}`)
  ok('而且零延迟（那 300ms 定时器就是他打回上一版的理由，不许回来）',
    tapGap > -1 && tapGap < 250, tapGap < 0 ? '没升起来' : `${tapGap}ms`)
  await page.callMethod('collapse')
  await sleep(1500)

  /* ---------- 8. 两屏同一根墨顶、那一行抬到墨面之上、展开那档跟着卡长 ----------
     B 方案那句「点击圆形＋，就是第二个屏」＋ 10-14 那句「两个屏的内框高度要一致」在屏上的意思是：
     收起/展开换的是中间那块的高度，而**深色面板那层的顶线在两屏之间是同一根**
     （10-13 D16 甲那一版它差 163rpx，站长今天打回的就是这一条）。 */
  const tPlus = Date.now()
  await tapBlk('.blk-plus')
  let plusGap = -1
  for (let i = 0; i < 20; i += 1) {
    if ((await page.data()).active) { plusGap = Date.now() - tPlus; break }
    await sleep(50)
  }
  ok('圆 ➕ 也是开门（他原话「如果点击圆形+，就是第二个屏」），且同样零延迟',
    (await page.data()).active === 'photo' && plusGap > -1 && plusGap < 250,
    plusGap < 0 ? '没升起来' : `active=${(await page.data()).active}／${plusGap}ms`)
  /* 10-14 站长两句话把这一段的口径整个翻了过来：「第二屏，高度不准，要和第一屏一致」
     ＋「back 抬到暗面板上面」。所以原来那三条——"那一行整段坐在墨上（收起）"、
     "那一行整段坐在墨上（展开）"、"这层墨在两态之间不动"——量的都是 D16 甲那一版，
     留着就是三条必红的旧尺子。现在钉的是：
     ① 两屏的墨顶是**同一根线**（屏上量，不是算式）；
     ② 框外那一行整枚在墨顶**之上**（他这一句反过来要求的就是这件事），两态都算一次；
     ③ 展开那一档这层墨跟着那张卡一起长（墨顶到卡顶那一口在两态里是同一个数）——
        它不再"自己单独跳"，因为动的对象就是卡片本身。
     ⚠ 全钉屏上量出来的**关系**，不引 100vh 那个绝对值：`windowHeight` 与 CSS 的 `100vh`
     在带导航条的机型上不是一回事，拿它算绝对顶就是给自己造红（这一族坑在 §8 里记过）。 */
  const ink1 = await rect('.stage-panel')
  const row1 = await rect('.out')
  const pan1 = await rect('.panel')
  await page.setData({ panelOpen: true })
  await sleep(500)
  const ink2 = await rect('.stage-panel')
  const row2 = await rect('.out')
  const pan2 = await rect('.panel')
  await page.setData({ panelOpen: false })
  await sleep(500)
  // 行底（含它下面那档 margin）不许碰到墨顶：量的是屏上两个矩形之间的缝，不是声明值。
  const aboveInk = (row, ink) => !!row && !!ink && (row.top + row.h) < ink.top - 6 * R
  const fmt = (row, ink, pan) => row && ink && pan
    ? `行 ${q(row.top).toFixed(1)}~${q(row.top + row.h).toFixed(1)}／墨顶 ${q(ink.top).toFixed(1)}／面板顶 ${q(pan.top).toFixed(1)}` : '屏上没有 .out'
  ok('两屏的墨顶是同一根线（点 ➕ 那一下这一层在屏上一动不动）',
    !!ink1 && !!panel && near(ink1.top, panel.top, 3 * R),
    panel && ink1 ? `首屏 ${q(panel.top).toFixed(1)} → 第二屏 ${q(ink1.top).toFixed(1)}` : '量不到')
  ok('框外那一行整枚在墨顶之上（收起那一态）', aboveInk(row1, ink1), fmt(row1, ink1, pan1))
  ok('框外那一行整枚在墨顶之上（展开那一态，它跟着卡片一起往上长）',
    aboveInk(row2, ink2), fmt(row2, ink2, pan2))
  ok('展开那一档：墨顶到卡顶那一口与收起是同一个数（这层跟着卡长，不自己单独跳）',
    !!ink1 && !!ink2 && !!pan1 && !!pan2
    && near(pan1.top - ink1.top, pan2.top - ink2.top, 3 * R) && pan2.top > ink2.top,
    ink1 && ink2 && pan1 && pan2
      ? `收起 ${q(pan1.top - ink1.top).toFixed(1)}／展开 ${q(pan2.top - ink2.top).toFixed(1)}` : '量不到')
  ok('两屏的内框同高（屏上量的矩形，不是 CSS 声明）',
    !!pan1 && !!blk && near(pan1.h, blk.h, 3 * R),
    pan1 && blk ? `面板 ${q(pan1.h).toFixed(1)}／整组 ${q(blk.h).toFixed(1)}` : '量不到')
  // 上一版这里写的是"只钉顶线、不钉高度"——因为那两档的高还挂在他那条待拍上。
  // 10-14 他拍了：「两个屏的内框高度要一致」＋「第二屏的内面板，高度压缩一下」⇒ 高度本身
  // 成了拍过的内容，上面那条"两屏内框同高"就是它的尺子；具体那个数（372）仍从 CSS 现读，
  // 不钉成字面量。
  ok('录入面板的顶＝收起态那一组的顶（「左边内框要与第二个图高度对齐」在屏上的意思）',
    !!pan1 && near(pan1.top, blk.top, 3 * R),
    pan1 ? `面板顶 ${q(pan1.top).toFixed(1)}／组顶 ${q(blk.top).toFixed(1)}` : '屏上没有 .panel')
  await page.callMethod('collapse')
  await sleep(1500)

  /* ---------- 9. 两片皮与那层面板：糊在、两态都在、字不许翻极性 ----------
     10-11 那一版的皮挂在 `.container.has-bg` 上（不铺图就没有玻璃），B 方案把皮写成**基础规则**：
     深色面板是这一屏的底板，铺不铺形象图都在。所以这里量的不是"有没有覆盖"，而是**两态都挂**。
     另一半是极性的坑：这一屏的字全压在恒深的面上，吃 `--text-*` 那一族的话，壁纸派生的
     `.bg-light` 一翻就把墨字放到墨面上（直接归零）。恒纸白才是对的。
     ⚠ 10-14「换心情」之后，心情存本机（`glassMood`）、壁纸那一格权威在服务端（本机 `wallpaperCache`
     只是没有会话时的兜底缓存），而这一族判据钉的是**墨档**那一层（"基色 18,20,26""三样字全纸白"）。
     10-14 23:1x 那一趟六条全红、读数全是 (121,156,129)／(29,53,34)——上一把尺子把这台机器留在天青档，
     而"以壁纸为准"那条对账会连心情一起带过去。红的是前提不是屏，所以这里把前提钉死：
     进来先钉回默认（墨＋米白，钉法见下面那段），量完原样还回去。另外四档由
     `验-五档彩色玻璃-真跑` 钉，两把不重叠。 */
  // ⚠ 钉前提要钉**两头顶**：`getWallpaper()` 先读 `globalData.userInfo.wallpaper`（登录回包里那份，
  // 权威在服务端），本机缓存只是没有会话时的兜底。10-14 23:3x 第一版只摘了两个键，容器仍读回
  // `theme-tint-celadon mood-celadon`（这台账号服务端存的就是天青）——所以这里走 app 自己那两个 setter。
  // 只写本机，不发 PUT，服务端那一列一个字节不动。
  const pref = await mp.evaluate(() => ({ mood: wx.getStorageSync('glassMood'), wp: getApp().getWallpaper() }))
  const pinInk = () => mp.evaluate(() => {
    wx.removeStorageSync('glassMood')
    getApp().setWallpaper('tint-paper')
    getApp().applyTheme('tint-paper')
  })
  // ⚠ 钉**一次**不算数：登录那一趟回来会把服务端那份壁纸再 apply 一遍，把先钉的那顶顶回去
  //（10-14 23:5x 实测：同一趟 `验-五档彩色玻璃` 27 条红，全是这个竞态；10-15 00:4x 这一把也中了一次，
  // 容器读回 `mood-celadon` ⇒ 后面六条红的全是"墨档"那几条前提）。所以钉→看屏→没钉住就再钉。
  // **判据本身一个字没改**，改的是"钉前提"这个前置动作。
  // ⚠ 钉完之后必须**重进这一屏**才算钉上：`themeClass` 是页面自己的 data，只有 `onShow` 那句
  // `app.applyTheme()` 会把它重新算一遍；而 `go()` 走的是 `switchTab`，此刻正停在 create 这一枚 tab 上
  // ⇒ 切到自己＝空操作，onShow 根本不发（10-15 00:4x 实测：连钉四次、storage 已摘干净，容器仍读回
  // `mood-ivory`——那是上一把尺子留在屏上的那一层 data，不是本机偏好的真值）。这里改走 reLaunch。
  let cl = '(还没钉)', st = '(没读)', live = '(没读)'
  for (let i = 0; i < 4; i++) {
    await pinInk()
    await mp.reLaunch('/pages/create/create')
    await sleep(4500)
    page = await mp.currentPage()
    const node = await page.$('.container')
    cl = node ? String(await node.attribute('class')) : '(摸不到)'
    if (/mood-ink/.test(cl) && /theme-tint-paper/.test(cl)) break
    // 没钉住时把三个头一起报出来：本机那一格、app 现算的那一档、屏上那一串——
    // 三者对得上是竞态，对不上才是产品的事。
    st = String(await mp.evaluate(() => wx.getStorageSync('glassMood')))
    live = String(await mp.evaluate(() => getApp().glassMood().key))
    await sleep(4000)
  }
  ok('量墨档之前已把两头顶钉回默认（容器上是 mood-ink ＋ theme-tint-paper）',
    /mood-ink/.test(cl) && /theme-tint-paper/.test(cl),
    `${cl}／本机 glassMood=「${st}」／app 现算=「${live}」`)
  const before = await page.data()
  const readSkins = async (tag) => ({
    tag,
    faceImg: await styleOf('.blk-face', 'background-image'),
    faceBf: String((await styleOf('.blk-face', 'backdrop-filter')) || (await styleOf('.blk-face', '-webkit-backdrop-filter')) || 'none'),
    bandImg: await styleOf('.blk-count', 'background-image'),
    bandBf: String((await styleOf('.blk-count', 'backdrop-filter')) || (await styleOf('.blk-count', '-webkit-backdrop-filter')) || 'none'),
    panelBg: await styleOf('.stage-panel', 'background-color'),
    panelH: await styleOf('.stage-panel', 'height'),
    panelBf: String((await styleOf('.stage-panel', 'backdrop-filter')) || (await styleOf('.stage-panel', '-webkit-backdrop-filter')) || 'none'),
    numColor: await styleOf('.blk-num', 'color'),
    labColor: await styleOf('.blk-lab', 'color'),
    tipsColor: await styleOf('.blk-tips-in', 'color'),
    // 10-14 22:4x 新加的首屏那一行：层序这件事读 `color` 读不出来，只能读渲染层给的那两枚
    // （铺图那一态必须被抬层名单抬起来，否则整条压在罩层与照片底下＝看不见而判据全绿）。
    aiPos: await styleOf('.ai-line', 'position'),
    aiZ: await styleOf('.ai-line', 'z-index'),
    // ⚠ 这一枚原来读的是 `.ai-line .ai-text` 的 `white-space`，实测**永远回 null**（节点摸得到、
    //    这一档属性 devtools 不给），于是两态各红一条——红的是量法，不是屏。改成：读同一枚节点的
    //    `font-size`（这条读得回来，能证明类名没点空）＋ 全页 `.ai-text` 只有一枚（证明读到的就是那一行）；
    //    `white-space:nowrap` 本身挪到静态那把逐字钉（`验-五档彩色玻璃.js` 的"这一行的皮五条"）。
    aiTextFs: await styleOf('.ai-text', 'font-size'),
    aiTextN: (await page.$$('.ai-text')).length,
    // 10-14 23:5x＋00:0x 站长追的两句：「与下方的面板渐变方向相反。浅在下，深在上」「左上右不需要留空间，
    // 要通栏。左下和右下有圆弧，然后与背景之间带阴影。要与下方面板渐变毛玻璃风格一致」；
    // 00:2x 第三句「不要有空间，要顶上去…渐变的程度要与下方面板一样…太暗了…露出的透多一点」。
    // ⇒ 五条全部**对着面板那一枚现读现比**，判据里不写死 px／rpx（模拟器按屏宽折半换算，§9.22 那条自坑）。
    aiMt: await styleOf('.ai-line', 'margin-top'),
    aiH: await styleOf('.ai-line', 'height'),
    aiMl: await styleOf('.ai-line', 'margin-left'),
    boxPl: await styleOf('.container', 'padding-left'),
    aiRt: await styleOf('.ai-line', 'border-top-left-radius'),
    aiRb: await styleOf('.ai-line', 'border-bottom-left-radius'),
    pnlRt: await styleOf('.stage-panel', 'border-top-left-radius'),
    aiShadow: await styleOf('.ai-line', 'box-shadow'),
    pnlShadow: await styleOf('.stage-panel', 'box-shadow'),
    aiBf: String((await styleOf('.ai-line', 'backdrop-filter')) || (await styleOf('.ai-line', '-webkit-backdrop-filter')) || 'none'),
    aiBg: await styleOf('.ai-line', 'background-image'),
  })
  // 铺图那一态要的是"背后真有一张照片"，所以这里给一张**探针用的图**，不给 before.bgSrc：
  // 进来时若本来就不铺（before.bgSrc 为空），拿 before 去铺就变成"两态都没图"，
  // 那两条"两态都挂"的判据会一起量到同一个东西 ⇒ 假绿。用完在收尾那儿把 before 还回去。
  await page.setData({ bgSrc: '' })
  await sleep(2200)
  const off = await readSkins('不铺图')
  await page.setData({ bgSrc: PROBE_BG })
  await sleep(2600)
  const on = await readSkins('铺图')
  for (const s of [off, on]) {
    const w = rgbaOf(s.faceImg)
    ok(`${s.tag}那一态：白面真的画出了一条渐变（≥7 个色标，照现网 .page-scrim 那七档）`,
      gradStops(s.faceImg) >= 7 && !!w && w.rgb === '255, 255, 255',
      `色标 ${gradStops(s.faceImg)}／首个色 ${s.faceImg.slice(0, 52)}`)
    ok(`${s.tag}那一态：白面糊挂在身上（只半透不糊＝白纱，他打回过的那种）`, /blur/.test(s.faceBf), s.faceBf)
    const ink = rgbaOf(s.bandImg)
    ok(`${s.tag}那一态：墨面也是同串停点的渐变、基色是那支墨（18,20,26），不是照抄 .42→.72`,
      gradStops(s.bandImg) >= 7 && !!ink && ink.rgb === '18, 20, 26',
      `色标 ${gradStops(s.bandImg)}／首个色 ${s.bandImg.slice(0, 52)}`)
    ok(`${s.tag}那一态：墨面糊挂在身上`, /blur/.test(s.bandBf), s.bandBf)
    const p = rgbaOf(s.panelBg)
    ok(`${s.tag}那一态：深色面板那一层真在屏上占着下半截（它不吃 bgSrc，两态都得有实测高）`,
      parseFloat(s.panelH) > 200, `实测高 ${s.panelH}`)
    ok(`${s.tag}那一态：面板本体是透明的（实心那档只能归 ::after；写回本体＝与 ::before 相乘，`
      + `band 顶透出不到 2.3% —— 他 10-13「为什么看不到渐变毛玻璃」就是这一刀）`,
      !!s.panelBg && (/transparent/i.test(s.panelBg) || (!!p && p.a === 0)), `${s.panelBg}`)
    ok(`${s.tag}那一态：面板身上挂着 backdrop-filter（「上部要做渐变半透明毛玻璃」那一句）`,
      /blur/.test(s.panelBf), s.panelBf)
    const n = rgbaOf(s.numColor), l = rgbaOf(s.labColor), tp = rgbaOf(s.tipsColor)
    ok(`${s.tag}那一态：数字/名字/Tips 三样字全是纸白族（恒深面上不许随壁纸翻成墨）`,
      !!n && n.rgb === '242, 239, 233' && !!l && l.rgb === '242, 239, 233' && !!tp && tp.rgb === '242, 239, 233',
      `数字 ${s.numColor}／名 ${s.labColor}／Tips ${s.tipsColor}`)
    // 10-14 22:4x 那一趟新加的首屏那一行（`.ai-line`）。**层序读 color 读不出来**：它第一次落码时
    // 没进 `.container.has-bg` 那份抬层名单，铺图那一态整条压在罩层与照片底下，屏上看不见，
    // 而计算样式那几条照样绿——与 10-09 站长抓 `.home-swap` 那一次同一个形状（§8.178）。
    ok(`${s.tag}那一态：那一行的字节点真在渲染层里，且全页只有这一枚（font-size 读得回来＝类名没点空）`,
      s.aiTextN === 1 && /px$/.test(String(s.aiTextFs)), `枚数 ${s.aiTextN}／font-size ${s.aiTextFs}`)
    if (s.tag === '铺图') ok('铺图那一态：那一行被抬层名单抬起来了（position:relative ＋ z-index:2），不是压在照片底下',
      /relative/.test(s.aiPos) && /^2/.test(String(s.aiZ).trim()), `position=${s.aiPos}／z-index=${s.aiZ}`)
    // 顶上去（00:2x「不要有空间，要顶上去」）：这一枚自己的上外边距必须是 0。
    // 容器那口 2rpx 是堵外边距穿透的（app.wxss `.container`），不是间距，不归这一条管。
    const num = (v) => Number(String(v).replace(/[^0-9.\-]/g, '')) || 0
    ok(`${s.tag}那一态：那一行顶到最上面（自己的 margin-top 是 0，没有那口 48 的呼吸）`,
      num(s.aiMt) === 0, `margin-top=${s.aiMt}`)
    // 通栏：容器自己 `padding: 2rpx var(--sp-3) 0`，只把这一枚的 margin 写成 0 仍是内缩 24rpx。
    // 判据＝"负掉的量正好等于容器的内缩"，两头都现读，屏宽换算不进来。
    const ml = num(s.aiMl)
    const pl = num(s.boxPl)
    ok(`${s.tag}那一态：那一行真通栏（左外边距负掉容器那一口内缩，两边都贴到屏沿）`,
      pl > 0 && Math.abs(ml + pl) < 0.6, `margin-left=${s.aiMl}／容器 padding-left=${s.boxPl}`)
    ok(`${s.tag}那一态：上沿方角、下沿圆角，且那一枚半径与面板顶角同一个数（上下颠倒，不是另挑一档）`,
      num(s.aiRt) === 0 && num(s.aiRb) > 0 && Math.abs(num(s.aiRb) - num(s.pnlRt)) < 0.6,
      `上 ${s.aiRt}／下 ${s.aiRb}／面板顶 ${s.pnlRt}`)
    // 阴影：与面板那枚"同一支色、同一档模糊、偏移方向相反"（面板的边在上、这一行的边在下）。
    // ⚠ 计算样式回的是一串**带单位**的数（`rgba(…) 0px 6px 14px 0px`，末档是 spread）——
    //    直接 `Number("6px")` 得到 NaN，四条比较全是 false，看着像"阴影没画"其实是量法坏了。先剥 px。
    const sh = (v) => (String(v).match(/-?[\d.]+px/g) || []).map((x) => Number(x.replace('px', '')))
    const col = (v) => (String(v).match(/rgba?\([^)]*\)/) || [''])[0].replace(/\s+/g, '')
    const sa = sh(s.aiShadow), sp = sh(s.pnlShadow)
    ok(`${s.tag}那一态：与背景之间那枚阴影是面板那枚的镜像（色与模糊逐字相同、纵向偏移反号）`,
      sa.length >= 3 && sp.length >= 3 && col(s.aiShadow) === col(s.pnlShadow)
      && Math.abs(sa[0] - sp[0]) < 0.6 && Math.abs(sa[2] - sp[2]) < 0.6
      && sa[1] > 0 && sp[1] < 0 && Math.abs(sa[1] + sp[1]) < 0.6,
      `这一行 ${s.aiShadow}／面板 ${s.pnlShadow}`)
    ok(`${s.tag}那一态：这一行与面板吃同一档滤镜（「渐变毛玻璃风格一致」——只染色不糊＝不是毛玻璃）`,
      s.aiBf.replace(/\s+/g, '') === s.panelBf.replace(/\s+/g, ''), `这一行 ${s.aiBf}／面板 ${s.panelBf}`)
    // 00:2x「渐变的程度要与下方面板一样…太暗了」＋00:3x「高度压缩，看到一行文字就行了，不要浪费空间」
    // ⇒ 首档＝面板的 .94、末档＝面板的 .16、α 一路往下（不许有实心平台）；中间允许有过渡档（现是 .80@55%）。
    const seq = (String(s.aiBg).match(/rgba\([^)]*,\s*([\d.]+)\)/g) || [])
      .map((x) => Number(/,\s*([\d.]+)\)$/.exec(x)[1]))
    const mono = seq.length > 1 && seq.every((a, i) => i === 0 || a < seq[i - 1])
    ok(`${s.tag}那一态：那一行的底是面板那条坡反着走（首 .94、末 .16、一路往下没有实心平台）`,
      /^linear-gradient/.test(String(s.aiBg)) && seq[0] === 0.94
      && seq[seq.length - 1] === 0.16 && mono, `α ${seq.join('→')}（色标 ${seq.length} 枚）`)
    // 高度那一条量的是**渲染出来的这一枚**，不是源码里的 rpx 字面量（模拟器按屏宽折半换算）。
    // 与面板圆角半径比一个定档：40rpx 半径 ↔ 整枚 80.4rpx ⇒ 比值 2.01，钉 ≤4.8 是留余量的上界；
    // 00:2x 那一版（200.4rpx）比值 5.01 ⇒ 这一条当场红。**阈值 4.8 是我定的，他没给数。**
    ok(`${s.tag}那一态：那一枚整行只占一条窄带（实测高 ≤ 面板圆角半径的 4.8 倍，不是 00:2x 那条大灰带）`,
      num(s.aiH) > 0 && num(s.pnlRt) > 0 && num(s.aiH) <= num(s.pnlRt) * 4.8,
      `实测高 ${s.aiH}／面板圆角半径 ${s.pnlRt}`)
  }
  // 极性翻那一态真打一次：`.bg-light` 一挂上，那两条旧翻转规则（已随这一层撤掉）要是还在，
  // 屏上那三行字会当街翻成墨。这一条在源码里读不出来，只有渲染层认不认得出。
  await page.setData({ bgLight: true })
  await sleep(1200)
  const lit = await readSkins('bg-light')
  ok('浅壁纸那一态字色不翻（面板恒深，那两条 `.bg-light` 翻转规则确实撤净了）',
    (rgbaOf(lit.numColor) || {}).rgb === '242, 239, 233' && (rgbaOf(lit.tipsColor) || {}).rgb === '242, 239, 233',
    `数字 ${lit.numColor}／Tips ${lit.tipsColor}`)
  /* ---------- 9b. 10-15 02:5x／03:2x 那两句：按**元素自己那块矩形**判深浅，深色图自动翻纸白 ----------
     原话①「字体图片要支持遇到深色背景图自动反转色，然后三个设置也要这样自动切换」「然后字体颜色，
     与图片标题一样，70%黑透明。包括第二屏的back」；原话②「计算深浅背景区域仅限文字图片覆盖的区域的
     平均值。不需要全屏计算。包括三块设置也是只计算下方三行区域的平均值颜色」。
     这把尺子钉的是**渲染层那条链断没断**：data 那两枚 flag → 容器上的类名 → 屏上那支颜色／那个滤镜。
     三段里任何一段没接上（类名忘了挂、覆写规则类数不够、`:not()` 写反），源码读不出来、只有屏上认得出
     ——与 10-09 抓 `.home-swap` 那一次同一个形状。
     ⚠ 为什么不"换一张深照片"来测深色那一态：`/assets/` 里没有一张整幅都深的位图（`logo.png` 上深下浅、
     `share-card.jpg` 整幅浅），拿某一张的去赌两个矩形各自的读数，判据就变成"我对那张图的印象"。
     所以深色那一态走**强制 flag＝false**（`has-bg` 留着＝样式闸还在），浅那一态走**真测**（inject 包里
     那张图，让页面自己按矩形算一次）。两态合起来把那条等式钉死：
     **flag 浅 ⟺ 墨 @70 且不反色；flag 深 ⟺ 纸白 @70 且标题图挂 invert(1)。** */
  const INK70 = 'rgba(20,22,26,0.7)'
  const PAPER70 = 'rgba(242,239,233,0.7)'
  const squash = (v) => String(v).replace(/\s+/g, '')
  // ⚠ 摸不到 `.container` 要**报一条看得懂的**，不许直接把 null 递进 .attribute()：
  //   10-15 上午那趟就是这么整把崩掉的（批跑中途有人改了 miniprogram/ 里一个注释 ⇒ IDE 热重载
  //   ⇒ 页面句柄变 null ⇒ TypeError 冒到顶，后面 90 多条一条没跑，红字只有一句"读不到 attribute"，
  //   看不出是回归还是环境）。这一条改成红一条＋一句原因，剩下的判据照跑。
  const clsAll = async () => {
    const el = await page.$('.container')
    if (!el) throw new Error('摸不到 .container：这一屏被重载过（多半是跑中途动了 miniprogram/），不是判据红，重跑这一把')
    return String(await el.attribute('class'))
  }
  const itemState = async (it) => ({
    color: await styleOf(`.swap-${it} .swap-text`, 'color'),
    glyph: await styleOf(`.swap-${it} .swap-glyph`, 'background-color'),
  })
  const toneState = async () => ({
    cls: await clsAll(),
    d: await page.data(),
    titleFilter: await styleOf('.page-title', 'filter'),
    titleOpacity: await styleOf('.page-title', 'opacity'),
    dim: await itemState('dim'),
    wallpaper: await itemState('wallpaper'),
    mood: await itemState('mood'),
    outColor: await styleOf('.out', 'color'),
  })
  /* 那条等式按**屏上那一枚**判，但"判深浅"那一档 10-15 一天里改口两次，两趟都记下来免得下次照旧注释改回去：
     ① 清晨把那一行拆成三枚各一个 flag（他那张红框真机图同一条横带左中右三段实测中位 232／207／51，
        整行平均 174 压在阈值那一档（`LIGHT_THRESHOLD`，从实现现读）附近 ⇒ 一个数管三枚必有一头读不出来）；
     ② 09:2x 站长打回：「首屏下面三个设置，深浅字要一致，现在是左边两个黑，右边一个白，不合理。要一致。」
        ⇒ **并回一行一个 flag**（`.home-swap` 自己那块矩形），三枚共用同一个极性。
     浅 ⇒ 墨 @70；深 ⇒ 纸白 @70，标题图那一枚深态挂 `filter: invert(1)`（invert 的矩阵只动 RGB 三行、
     α 那一行是 [0,0,0,1,0] ⇒ 透明底不会被涂白，这正是它敢用位图当标题的原因）。
     ⚠ 并回之后这一族要钉的**不再是"三枚各判"，而是"三枚同极性"**——那才是他这句话的字面意思。
     代价一条由下面「逐枚对比度」那一发如实报数、不藏：那一行三枚各自底上的明暗能差到 180 灰阶，
     共用一个极性时必然有一枚对比度不足（那是他这句指令的物理后果，不是实现的 bug）。 */
  const KEYS = {
    title: { cls: 'bg-light-title', flag: 'bgLightTitle', label: '标题图那枚' },
    swap: { cls: 'bg-light-swap', flag: 'bgLightSwap', label: '那一行三枚' },
    out: { cls: 'bg-light-out', flag: 'bgLightOut', label: '第二屏那枚「返回」' },
  }
  // 三枚的身份类还在（wxml 上 `.swap-dim`／`-wallpaper`／`-mood`），只是不再各带一个深浅 flag；
  // 这一族留着读"三枚屏上到底同一个数没"，以及逐枚量自己那块底。
  const HALF = ['dim', 'wallpaper', 'mood']
  const eqOne = (tag, t, key) => {
    const K = KEYS[key]
    const has = new RegExp(` ${K.cls}[ "]`).test(`${t.cls} `)
    const light = t.d[K.flag] === true
    if (has !== light) {
      ok(`${tag}：${K.label}的类名跟着 data（类名没挂上＝样式闸没开，屏上还是老颜色）`, false,
        `类 ${has}／flag ${light}`)
      return
    }
    if (key === 'title') {
      ok(`${tag}：${K.label}判成"${light ? '浅' : '深'}" ⇒ ${light ? '不反色（filter none），只留那 80% 透明度' : '自动反色（invert(1)）'}`,
        light ? (squash(t.titleFilter) === 'none' && squash(t.titleOpacity) === '0.8')
          : (/invert\(1\)/.test(t.titleFilter) && squash(t.titleOpacity) === '0.8'),
        `filter ${t.titleFilter}／opacity ${t.titleOpacity}`)
      return
    }
    if (key === 'out') {
      const want = light ? INK70 : PAPER70
      ok(`${tag}：${K.label}判成"${light ? '浅' : '深'}" ⇒ ${light ? '墨 @70（他给的"70% 黑透明"就是这一支）' : '翻纸白 @70'}`,
        squash(t.outColor) === want, `字 ${t.outColor}`)
      return
    }
    const want = light ? INK70 : PAPER70
    // ★"一致"这一条要钉的是**三枚屏上只剩一个数**。只钉"每枚都与同一个 flag 同号"不够——
    //   退回"一枚一条覆写"时那三句照样各自成立，而他打的回票正是这个。
    const uniq = (f) => new Set(HALF.map((it) => squash(f(t[it])))).size
    ok(`${tag}：${K.label}判成"${light ? '浅' : '深'}" ⇒ 那一行三枚**同一个数**（09:2x 原话"深浅字要一致"）`
      + '，后面那枚小图形也是同一个数',
      uniq((x) => x.color) === 1 && uniq((x) => x.glyph) === 1
        && HALF.every((it) => squash(t[it].color) === want && squash(t[it].glyph) === want),
      HALF.map((it) => `${it} 字 ${t[it].color}／图形 ${t[it].glyph}`).join('　'))
  }
  const eqAll = (tag, t, keys) => keys.forEach((k) => eqOne(tag, t, k))
  // ① 真测那一发：inject 包里那张 1280×1024 的图，让页面自己按矩形量一次（`toneRects` 是页面上那个方法）。
  await page.setData({ bgSrc: PROBE_BG })
  await sleep(2000)
  await page.callMethod('toneRects')
  await sleep(3000)   // 第一次测那张图要等离屏 canvas 那趟回来（没网格时 applyRects 只挂 false）
  const meas = await toneState()
  /* 独立重算那一发。⚠ 不在 appservice 里 `require` 页面那份实现（试过：报
     `module '../../miniprogram/utils/imgBrightness.js' is not defined`——evaluate 打进去的那个
     模块上下文没有这条相对路径，整把尺子当场挂）。所以这里只从 storage 把**原料**取回来
     （32×32 那张网格＋图自己的宽高），换算在 Node 这一侧另写一遍：
     与 `验-列表头部-真跑` 那句"判据自己重算一遍＝与实现无关"同一个姿势，
     两边算出同一个数才算实现走的是矩形。键前缀从实现文件现读，不在这再抄一份。 */
  const lumSrc = fs.readFileSync(path.join(ROOT, 'miniprogram/utils/imgBrightness.js'), 'utf8')
  const lumKey = ((lumSrc.match(/const LUM_KEY\s*=\s*'([^']+)'/) || [, 'bgLumV4_'])[1])
  // 阈值与网格边长也从实现现读：这两枚是那一族的常量，在尺子里再写一遍数字＝两份真相，
  // 改实现的人不会想起来改这里（§8.178 那一族"两处必须相等"的老坑）。
  const THRESH = Number((lumSrc.match(/const LIGHT_THRESHOLD\s*=\s*(\d+)/) || [, '160'])[1])
  const SIDE = Number((lumSrc.match(/const SIDE\s*=\s*(\d+)/) || [, '32'])[1])
  const raw = await mp.evaluate((k) => {
    const pg = getCurrentPages().slice(-1)[0]
    const wi = wx.getWindowInfo()
    const prof = wx.getStorageSync(k + pg.data.bgSrc) || null
    const rect = (s) => new Promise((res) => {
      const q = wx.createSelectorQuery(); q.select(s).boundingClientRect(); q.exec((r) => res(r && r[0]))
    })
    return Promise.all([
      rect('.page-title'), rect('.home-swap'), rect('.out'),
      rect('.swap-dim'), rect('.swap-wallpaper'), rect('.swap-mood'),
    ]).then(([a, b, c, d1, d2, d3]) => ({
      src: pg.data.bgSrc,
      win: { w: wi.windowWidth, h: wi.windowHeight },
      prof: prof && { w: prof.w, h: prof.h, grid: prof.grid || null, rows: prof.rows || null },
      title: a && { left: a.left, top: a.top, width: a.width, height: a.height },
      swap: b && { left: b.left, top: b.top, width: b.width, height: b.height },
      out: c && { left: c.left, top: c.top, width: c.width, height: c.height },
      // 三枚各自的框从这一版起**不参与判定**（并回一行一个判据），只留着报逐枚对比度那一发。
      dim: d1 && { left: d1.left, top: d1.top, width: d1.width, height: d1.height },
      wallpaper: d2 && { left: d2.left, top: d2.top, width: d2.width, height: d2.height },
      mood: d3 && { left: d3.left, top: d3.top, width: d3.width, height: d3.height },
      flag: { title: pg.data.bgLightTitle, swap: pg.data.bgLightSwap,
        out: pg.data.bgLightOut, zone: pg.data.bgLight, low: pg.data.bgLightLow },
    }))
  }, lumKey)
  const vis = (w, h, boxH, anchor) => {
    const byW = (750 * h) / w
    if (byW >= boxH) { const y0 = ((byW - boxH) * anchor) / byW; return { x0: 0, x1: 1, y0, y1: y0 + boxH / byW } }
    const fitW = (boxH * w) / h
    const x0 = (1 - 750 / fitW) * 0.5
    return { x0, x1: x0 + 750 / fitW, y0: 0, y1: 1 }
  }
  const boxHrpx = Math.round((raw.win.h * 750) / raw.win.w)
  const gridAvg = (r, v) => {
    if (!raw.prof || !raw.prof.grid || !r) return null
    const span = (a, b, f0, f1) => {
      const c0 = Math.max(0, Math.min(SIDE - 1, Math.floor((a + (b - a) * f0) * SIDE)))
      const c1 = Math.max(c0 + 1, Math.min(SIDE, Math.ceil((a + (b - a) * f1) * SIDE)))
      return [c0, c1]
    }
    const [c0, c1] = span(v.x0, v.x1, r.x[0], r.x[1])
    const [r0, r1] = span(v.y0, v.y1, r.y[0], r.y[1])
    let s = 0, n = 0
    for (let i = r0; i < r1; i += 1) for (let j = c0; j < c1; j += 1) { s += raw.prof.grid[i][j]; n += 1 }
    return { avg: Math.round(s / n), n, light: s / n > THRESH }
  }
  const asRect = (r) => (r && r.width > 0 ? {
    x: [r.left / raw.win.w, (r.left + r.width) / raw.win.w],
    y: [r.top / raw.win.h, (r.top + r.height) / raw.win.h],
  } : null)
  const vv = raw.prof ? vis(raw.prof.w, raw.prof.h, boxHrpx, 0.5) : null
  const calc = { title: gridAvg(asRect(raw.title), vv), swap: gridAvg(asRect(raw.swap), vv),
    whole: gridAvg({ x: [0, 1], y: [0, 1] }, vv) }
  HALF.forEach((it) => { calc[it] = gridAvg(asRect(raw[it]), vv) })
  console.log('    [独立重算]', JSON.stringify({ src: raw.src, boxHrpx, visible: vv,
    标题: calc.title, 整行: calc.swap, 整幅: calc.whole,
    三枚各自: { 调亮度: calc.dim, 换背景: calc.wallpaper, 换心情: calc.mood },
    屏上flag: raw.flag }))
  // 真测那一发的渲染层等式：两枚各按自己的 flag 走一支（深浅两态都能量到，不靠今天这张正好是哪一头）。
  eqAll('真测那一张', meas, ['title', 'swap'])
  ok('屏上那两枚 flag 就是**按各自那块矩形**重算出来的那两个数（实现没偷偷退回整幅／整条）',
    ['title', 'swap'].every((k) => calc[k] && calc[k].light === !!raw.flag[k]),
    `重算 ${['title', 'swap'].map((k) => `${KEYS[k].label} ${calc[k] ? calc[k].avg : 'null'}`).join('／')}`
    + `（阈值 ${THRESH}）vs 屏上 ${['title', 'swap'].map((k) => raw.flag[k]).join('／')}`)
  /* ★逐枚对比度这一发**只报数、不判红**。它量的是"并回一行一个判据"这条指令的物理代价：
     三枚共用一个极性，而三枚各自那块底可以差很远（清晨那张真机图三段中位 232/207/51）。
     算法：那支 rgba 先与底按 α 混成实心，再走 WCAG 那条 (L1+0.05)/(L2+0.05)；底取**原图**均值、
     不含压暗罩（罩子会把三档都拉低，读了反而看不出"这一行本身垫不垫得住字"）。
     不判红的理由一条：要消掉这一发只有"给那一行垫一段纱／挪落点／换构图"三条路，
     三条都是他拍的事，尺子不许替他把"当前这张图上的余量"钉成回归闸。 */
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  const lumOf = (g) => 0.2126 * lin(g) + 0.7152 * lin(g) + 0.0722 * lin(g)
  const ratio = (a, b) => {
    const hi = Math.max(lumOf(a), lumOf(b)); const lo = Math.min(lumOf(a), lumOf(b))
    return ((hi + 0.05) / (lo + 0.05)).toFixed(2)
  }
  const sharedGray = squash(meas.dim.color) === INK70 ? (20 + 22 + 26) / 3 : (242 + 239 + 233) / 3
  const perItem = HALF.reduce((o, it) => {
    const c = calc[it]
    if (!c) { o[it] = '量不到'; return o }
    const mix = Math.round(0.7 * sharedGray + 0.3 * c.avg)
    o[it] = { 底: c.avg, 混后字: mix, 对比度: ratio(mix, c.avg) }
    return o
  }, {})
  console.log('    [逐枚对比度·只报数]', JSON.stringify(perItem))
  ok('那一行吃的是自己那块矩形（格数明显小于整幅那一发；还共用一个矩形＝并回没并成）',
    !!calc.swap && !!calc.whole && calc.swap.n > 0 && calc.swap.n < calc.whole.n,
    `整行 ${calc.swap && calc.swap.n} 格 vs 整幅 ${calc.whole && calc.whole.n} 格（网格 ${SIDE}x${SIDE}）`)
  ok('采到的格子确实只有字／图自己那一块（标题那一枚的格数明显小于整幅那一发）',
    !!calc.title && !!calc.whole && calc.title.n > 0 && calc.title.n < calc.whole.n,
    `标题 ${calc.title && calc.title.n} 格 vs 整幅 ${calc.whole && calc.whole.n} 格`
    + `（网格 ${SIDE}×${SIDE}）`)
  // 这一条是"不需要全屏计算"要的那个**结果**：同一张图上，框内与整幅落到了阈值两侧
  // （落不到不算红，只在屏上打一行——那是图本身的性质，不是实现的错）。
  const straddle = ['title', 'swap'].filter((k) => calc[k] && calc.whole
    && calc[k].light !== calc.whole.light)
  if (straddle.length) {
    ok('这张图上"框内"与"整幅"果然分处阈值两侧 ⇒ 旧那口径（整幅平均）会判反，新口径按框内判对了',
      straddle.every((k) => calc[k].light === !!raw.flag[k]),
      `${straddle.map((k) => `${KEYS[k].label} 框内 ${calc[k].avg}`).join('／')}／整幅 ${calc.whole.avg}／屏上按框内`)
  } else {
    console.log(`  ℹ 这张图上两枚框内与整幅同侧（${['title', 'swap'].map((k) => calc[k] && calc[k].avg).join('/')} vs ${calc.whole && calc.whole.avg}），`
      + '“判反”那一发今天量不到——不判红，只报数')
  }
  // ② 强制那一发：把那**两枚** flag 打成 false（深色照片在屏上的那一态），看渲染层跟不跟。
  await page.setData({ bgLightTitle: false, bgLightSwap: false })
  await sleep(1400)
  eqAll('强制深色那一态', await toneState(), ['title', 'swap'])
  // ③ 第二屏那枚「返回」（他点名的"包括第二屏的back"）：`.out` 挂在 `.entry-wrap` 的
  //   `wx:if="{{active}}"` 上，而 `active` 是**档名**（'photo'/'url'/'write'），不是布尔——
  //   第一版这里写 `setData({ panelOpen: true })`，那一枚根本没渲染，量回来的是「(摸不到)」两条假红。
  //   所以走页面自己那个 `open()`（它顺带就会补调一次 `toneRects`），再补一发防第一帧矩形还没稳。
  //   第一版这里写 `setData({ panelOpen: true })`，那一枚根本没渲染，量回来的是「(摸不到)」两条假红。
  //   `.out` 住的整块是 `wx:if="{{active}}"`，而 `active` 是**档名**（'photo'/'url'/'write'）不是布尔
  //   ⇒ 走页面自己那个 `open('url')`（它顺带就会补调一次 `toneRects`），再补一发防第一帧矩形还没稳。
  await page.callMethod('open', 'url')
  await sleep(1800)
  await page.callMethod('toneRects')
  await sleep(1800)
  eqAll('展开态·第二屏「返回」', await toneState(), ['out'])
  await page.setData({ bgLightOut: false })
  await sleep(1200)
  // 强制深色那一态：容器上别的 `bg-light`／`bg-light-low` 是头部与低带那两档自己的，
  // 这里只盯 `bg-light-out` 这一枚掉没掉、字有没有跟着翻纸白（原来那条把别的档位一起算进来＝会假红）。
  eqAll('强制深色那一态·「返回」', await toneState(), ['out'])
  await page.callMethod('collapse')
  await sleep(1000)
  // 两态量完，把进来时那两个值原样还回去（bgSrc 用 before，不用上面那枚探针值）。
  // ⚠ 9b 那一发还多拧了三枚 flag（强制深色）与一个展开态：还完 bgSrc 之后**让页面自己重算一次**，
  //   别把"强制"那两枚留到下一把尺子里（留着的后果是下一把量到墨字、报告说"翻色没生效"）。
  await page.setData({ bgSrc: before.bgSrc || '', bgLight: !!before.bgLight, active: before.active })
  await sleep(900)
  await page.callMethod('toneRects')
  await sleep(1200)
  const nowData = await page.data()
  ok('这一路把页面数据回原样（bgSrc／bgLight 不给下一把尺子留残值）',
    String(nowData.bgSrc || '') === String(before.bgSrc || '') && !!nowData.bgLight === !!before.bgLight,
    `回来 ${JSON.stringify(nowData.bgSrc)}／${nowData.bgLight}　应回到 ${JSON.stringify(before.bgSrc || '')}／${before.bgLight}`)
  // 上面钉过的那两格偏好也要还回去——不还的话，下一把尺子读到的就是这一把留下的墨档。
  await mp.evaluate((v) => {
    if (v.mood === '' || v.mood === undefined || v.mood === null) wx.removeStorageSync('glassMood'); else wx.setStorageSync('glassMood', v.mood)
    getApp().setWallpaper(v.wp)
    getApp().applyTheme(v.wp)
  }, pref)
  const backPref = await mp.evaluate(() => ({ mood: wx.getStorageSync('glassMood'), wp: getApp().getWallpaper() }))
  ok('两格偏好已还原成进来前的值（不给下一把尺子留档）',
    String(backPref.mood) === String(pref.mood) && String(backPref.wp) === String(pref.wp),
    `${backPref.mood}/${backPref.wp} vs ${pref.mood}/${pref.wp}`)

  /* ---------- 10. 整屏截图（对效果图用） ＋ 报错监听 ---------- */
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
    ? `\n✗ 第一屏 2.2 真跑：${pass}/${pass + fails.length} 过　红：${fails.join(' / ')}`
    : `\n✓ 第一屏 2.2 真跑：${pass} 条全过`)
  if (fails.length) process.exit(1)
}

main().catch((e) => { console.error('!! 尺子挂了', e && (e.stack || e.message)); process.exit(1) })
