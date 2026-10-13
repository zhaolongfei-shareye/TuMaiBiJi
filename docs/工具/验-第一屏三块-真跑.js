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
const PROBE_BG = '/assets/home-bg-portrait.jpg'

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
const OUT_H = 107          // 展开态：面板顶比组顶高出去那一段＝第二屏框外那行的小字
const BREATHE = 24         // 收起态：面板顶比组顶只高这一口＝那一组底离底栏顶的呼吸（静态那把钉的是"两口相等"这条等式，这里钉屏上量出来的数）
const CLAMP = GROUP_H + 128 + 24  // 组顶夹值：整组 ＋ 底栏 ＋ 最少留白 = 562
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
  const tapHit = async () => { await (await page.$('.blk-alt-hit')).tap(); await sleep(700) }
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
  cur = await mp.currentPage()
  ok('再普通进入一次回到默认那一枚（标记读一次就清了，没常驻）',
    (await cur.data()).view === 'list', `view=${(await cur.data()).view}`)

  await go('/pages/create/create')
  page = await mp.currentPage()
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
  const tTap = Date.now()
  await (await page.$('.blk-person')).tap()
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

  /* ---------- 8. 第二屏那三处：那一行整段坐在墨上、这层墨在两态之间不动 ----------
     B 方案那句「点击圆形＋，就是第二个屏」＋「左边内框要与第二个图高度对齐」在屏上的意思是：
     收起/展开换的是中间那块，面板顶与整组顶这条线一个字都不许动。
     10-13 D16 甲又加了一条：这一层墨的顶在第二屏之内也不动（原来它跟着 `panelOpen` 上下跳）。 */
  const tPlus = Date.now()
  await (await page.$('.blk-plus')).tap()
  let plusGap = -1
  for (let i = 0; i < 20; i += 1) {
    if ((await page.data()).active) { plusGap = Date.now() - tPlus; break }
    await sleep(50)
  }
  ok('圆 ➕ 也是开门（他原话「如果点击圆形+，就是第二个屏」），且同样零延迟',
    (await page.data()).active === 'photo' && plusGap > -1 && plusGap < 250,
    plusGap < 0 ? '没升起来' : `active=${(await page.data()).active}／${plusGap}ms`)
  /* 10-13 D16 甲换的就是这一段的口径。原来钉的两条——"那一行的顶＝墨顶"与"展开比收起高 107−24"——
     量的都是"闸挂在 `panelOpen` 上"那一版，留着就是两条必红的旧尺子。
     现在第二屏之内这一层是**一根不动的线**，而那行小字要**整段坐在墨上**（顶不在墨顶之下、底不压进面板）。
     ⚠ 三条全钉屏上量出来的**关系**，不引 100vh 那个绝对值：`windowHeight` 与 CSS 的 `100vh`
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
  const sits = (row, ink, pan) => !!row && !!ink && !!pan
    && row.top >= ink.top - 3 * R && row.top + row.h <= pan.top + 3 * R
  const fmt = (row, ink, pan) => row && ink && pan
    ? `行 ${q(row.top).toFixed(1)}~${q(row.top + row.h).toFixed(1)}／墨顶 ${q(ink.top).toFixed(1)}／面板顶 ${q(pan.top).toFixed(1)}` : '屏上没有 .out'
  ok('收起那一态：框外那一行整段坐在墨上（顶不悬在墨外、底不压进面板），高仍是那 107',
    sits(row1, ink1, pan1) && !!row1 && near(q(row1.h), OUT_H, 4),
    row1 ? `行高 ${q(row1.h).toFixed(1)}（应 ${OUT_H}）／${fmt(row1, ink1, pan1)}` : '屏上没有 .out')
  ok('展开那一态：那一行同样整段坐在墨上（顶钉在"展开那一档"就是为了这一态）',
    sits(row2, ink2, pan2), fmt(row2, ink2, pan2))
  ok('展开↔收起那一换，这层墨在屏上不动（旧挂法它往上跳 83rpx，那行悬空就是这一跳的因）',
    !!ink1 && !!ink2 && near(ink1.top, ink2.top, 2 * R),
    ink1 && ink2 ? `收起 ${q(ink1.top).toFixed(1)} → 展开 ${q(ink2.top).toFixed(1)}` : '量不到 .stage-panel')
  ok('进第二屏这一层比首屏那一条更高（往上让出框外那一行那一段，两态同一条线）',
    !!ink1 && ink1.top < panel.top - 20 * R,
    `首屏 ${q(panel.top).toFixed(1)} → 第二屏 ${q(ink1.top).toFixed(1)}`)
  // 这里**只钉顶线、不钉高度**：面板那张的高是 410 还是 490 还挂在他那条待拍上
  // （画法向下长会压住底栏 56，代码向上长会把 `.out` 那 107 留在面板之上），
  // 把还没拍的数钉成判据就是拿尺子替他做决定。
  ok('录入面板的顶＝收起态那一组的顶（「左边内框要与第二个图高度对齐」在屏上的意思）',
    !!pan1 && near(pan1.top, blk.top, 3 * R),
    pan1 ? `面板顶 ${q(pan1.top).toFixed(1)}／组顶 ${q(blk.top).toFixed(1)}` : '屏上没有 .panel')
  await page.callMethod('collapse')
  await sleep(1500)

  /* ---------- 9. 两片皮与那层面板：糊在、两态都在、字不许翻极性 ----------
     10-11 那一版的皮挂在 `.container.has-bg` 上（不铺图就没有玻璃），B 方案把皮写成**基础规则**：
     深色面板是这一屏的底板，铺不铺形象图都在。所以这里量的不是"有没有覆盖"，而是**两态都挂**。
     另一半是极性的坑：这一屏的字全压在恒深的面上，吃 `--text-*` 那一族的话，壁纸派生的
     `.bg-light` 一翻就把墨字放到墨面上（直接归零）。恒纸白才是对的。 */
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
  }
  // 极性翻那一态真打一次：`.bg-light` 一挂上，那两条旧翻转规则（已随这一层撤掉）要是还在，
  // 屏上那三行字会当街翻成墨。这一条在源码里读不出来，只有渲染层认不认得出。
  await page.setData({ bgLight: true })
  await sleep(1200)
  const lit = await readSkins('bg-light')
  ok('浅壁纸那一态字色不翻（面板恒深，那两条 `.bg-light` 翻转规则确实撤净了）',
    (rgbaOf(lit.numColor) || {}).rgb === '242, 239, 233' && (rgbaOf(lit.tipsColor) || {}).rgb === '242, 239, 233',
    `数字 ${lit.numColor}／Tips ${lit.tipsColor}`)
  // 两态量完，把进来时那两个值原样还回去（bgSrc 用 before，不用上面那枚探针值）。
  await page.setData({ bgSrc: before.bgSrc || '', bgLight: !!before.bgLight })
  await sleep(800)
  const nowData = await page.data()
  ok('这一路把页面数据回原样（bgSrc／bgLight 不给下一把尺子留残值）',
    String(nowData.bgSrc || '') === String(before.bgSrc || '') && !!nowData.bgLight === !!before.bgLight,
    `回来 ${JSON.stringify(nowData.bgSrc)}／${nowData.bgLight}　应回到 ${JSON.stringify(before.bgSrc || '')}／${before.bgLight}`)

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
