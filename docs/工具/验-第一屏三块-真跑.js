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

// 下面这些"该落在哪"的数全从效果图正本换算来（图上 1px＝1rpx），推导写在静态那把
// `验-第一屏三块.js`；这里只干一件事：在屏上量到它。
const GROUP_H = 410        // 整组＝那一行左块的高（＝第二屏那张面板的高，同一根顶线）
const FACE_H = 213         // 上：纯白渐变毛玻璃那一片（＝女那张脚底落在哪，算出来的）
const BAND_H = 197         // 下：墨黑渐变毛玻璃那一片（410 − 213）
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
  for (let i = 0; i < 12; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }); break } catch (e) { await sleep(10000) }
  }
  if (!mp) { console.log('!! 连不上自动化端口，先跑 cli auto'); process.exit(1) }
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
  const cellNodes = await page.$$('.blk-cell')
  const cells = []
  for (const n of cellNodes) cells.push(await frame(n))
  ok('首屏这一版的十一枚都在（深色面板／整组／左块／白面／墨面／取景窗／人物／右列／Tips 格／圆 ➕／两枚计数）',
    !!(panel && blk && person && face && count && wrap && fig && col && tips && plus) && cells.length === 2,
    [!panel && '深色面板', !blk && '.home-blk', !person && '左块', !face && '白面', !count && '墨面',
      !wrap && '取景窗', !fig && '人物', !col && '右列', !tips && 'Tips 格', !plus && '圆 ➕',
      cells.length !== 2 && `计数枚数=${cells.length}`].filter(Boolean).join('、') || '都在')
  if (!panel || !person || !face || !count || cells.length !== 2) { await mp.close(); report(); return }

  /* ---------- 1. 那一块里外：同顶、同底、两片无缝 ---------- */
  ok('左块渲染成 308×410（与第二屏那张面板同高；±3rpx，被 flex 拉过就会扁）',
    near(q(person.w), 308, 3) && near(q(person.h), GROUP_H, 3),
    `${q(person.w).toFixed(1)}×${q(person.h).toFixed(1)}`)
  ok('白面 213 高、顶与左块同一条线、宽等于块宽（他 10-13「两个人背景用纯白渐变毛玻璃」那一片）',
    near(q(face.h), FACE_H, 3) && near(face.top, person.top, 2 * R) && near(q(face.w), 308, 3),
    `高 ${q(face.h).toFixed(1)}／顶差 ${q(face.top - person.top).toFixed(1)}／宽 ${q(face.w).toFixed(1)}`)
  ok('墨面 197 高、底与左块同一条线、与白面无缝相接（「下方数字区域用黑色毛玻璃」那一片）',
    near(q(count.h), BAND_H, 3) && near(count.bottom, person.bottom, 2 * R) && near(count.top, face.bottom, 2 * R),
    `高 ${q(count.h).toFixed(1)}／底差 ${q(count.bottom - person.bottom).toFixed(1)}／缝 ${q(count.top - face.bottom).toFixed(1)}`)
  ok('两片相加就是那一块（213＋197＝410；对不上＝有一片被哪条声明改过高度）',
    near(q(face.h + count.h), GROUP_H, 4), `量到 ${q(face.h + count.h).toFixed(1)}`)
  ok('两枚计数各 122 宽、同顶同高、互不相交，缝是那一道 20',
    near(q(cells[0].w), CELL_W, 3) && near(q(cells[1].w), CELL_W, 3)
    && near(cells[0].top, cells[1].top, 2 * R) && near(cells[0].h, cells[1].h, 2 * R)
    && cells[0].right <= cells[1].left + 1 && near(q(cells[1].left - cells[0].right), 20, 3),
    `宽 ${q(cells[0].w).toFixed(1)}／${q(cells[1].w).toFixed(1)}，缝 ${q(cells[1].left - cells[0].right).toFixed(1)}`)
  ok('两枚都待在墨面那一片里面（溢出到白面就是 absolute 那几条掉了一层）',
    cells.every((c) => c.top >= count.top - 1 && c.bottom <= count.bottom + 1),
    `墨面 ${q(count.top).toFixed(1)}~${q(count.bottom).toFixed(1)}／格 ${cells.map((c) => `${q(c.top).toFixed(1)}~${q(c.bottom).toFixed(1)}`).join('、')}`)
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
    near(plus.top, col.bottom - PLUS * R, 2 * R) && near(q(tips.bottom - plus.top), PLUS_GAP + PLUS, 6),
    `底差 ${q(plus.top - (col.bottom - PLUS * R)).toFixed(1)}／Tips 格底到 ➕ 顶 ${q(plus.top - tips.bottom).toFixed(1)}`)
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
  ok('窗高 161（410 − 52 − 197 那条等式在屏上成立）',
    near(q(wrap.h), GROUP_H - BLEED - BAND_H, 3), `${q(wrap.h).toFixed(1)}`)
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

  /* ---------- 8. 展开态那两处：顶线不动、那 107 还在原位 ----------
     B 方案那句「点击圆形＋，就是第二个屏」＋「左边内框要与第二个图高度对齐」在屏上的意思是：
     收起/展开换的是中间那块，面板顶与整组顶这条线一个字都不许动。 */
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
  const panelOn = await rect('.stage-panel')
  const outRow = await rect('.out')
  const entry = await rect('.panel')
  ok('展开态那 107 那一条真在面板顶上（框外那行小字占的就是这一段）',
    !!outRow && near(q(outRow.h), OUT_H, 4) && near(outRow.top, panelOn.top, 3 * R),
    outRow ? `行高 ${q(outRow.h).toFixed(1)}／行顶 ${q(outRow.top).toFixed(1)} vs 面板顶 ${q(panelOn.top).toFixed(1)}` : '屏上没有 .out')
  ok('两态的顶**不再是同一条线**（10-13 那一刀）：展开比收起高出去的那一段＝107 − 24',
    near(panel.top - panelOn.top, (OUT_H - BREATHE) * R, 3 * R),
    `收起 ${q(panel.top).toFixed(1)} → 展开 ${q(panelOn.top).toFixed(1)}（差 ${q((panel.top - panelOn.top) / R).toFixed(1)}rpx）`)
  // 这里**只钉顶线、不钉高度**：面板那张的高是 410 还是 490 还挂在他那条待拍上
  // （画法向下长会压住底栏 56，代码向上长会把 `.out` 那 107 留在面板之上），
  // 把还没拍的数钉成判据就是拿尺子替他做决定。
  ok('展开态那张录入面板的顶＝收起态那一组的顶（「左边内框要与第二个图高度对齐」在屏上的意思）',
    !!entry && near(entry.top, blk.top, 3 * R) && near(entry.top, panelOn.top + OUT_H * R, 3 * R),
    entry ? `面板顶 ${q(entry.top).toFixed(1)}／组顶 ${q(blk.top).toFixed(1)}／面板顶+107 ${q(panelOn.top + OUT_H * R).toFixed(1)}` : '屏上没有 .panel')
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
  await page.setData({ bgSrc: '' })
  await sleep(2200)
  const off = await readSkins('不铺图')
  await page.setData({ bgSrc: '/assets/home-bg-portrait.jpg' })
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
  await page.setData({ bgLight: !!before.bgLight })
  await sleep(800)
  const nowData = await page.data()
  ok('这一路把页面数据回原样（bgSrc／bgLight 不给下一把尺子留残值）',
    String(nowData.bgSrc || '') === String(before.bgSrc || '') && !!nowData.bgLight === !!before.bgLight,
    `回来 ${JSON.stringify(nowData.bgSrc)}／${nowData.bgLight}`)

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
