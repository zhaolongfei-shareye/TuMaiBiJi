// 创建入口这一版的真跑自证：在模拟器里真点、真拖、真截图（不连生产后端，见下面那段桩）。
// 前置：docs/工具/跑尺子.sh 9431 验-统一录入条-真跑   （它会先 quit + 重开 + cli auto）
// 单独跑：NODE_PATH=$HOME/.mpauto/node_modules node docs/工具/验-统一录入条-真跑.js
//
// 这一把钉的是"屏上真的长这样、真的点得动"，静态那把（验-统一录入条.js）钉的是"源码里这么写"。
// 两把都要跑：静态那把算不出 flex 的 auto 边距把框顶到哪儿，真跑这把读不出 wxml 里没画的东西。
//
// ⚠️ 拍照 / 相册那两枚按下去会开系统选择器，那个面板一占就把自动化端口吃住，
//    所以 F 那一节先把 wx.chooseMedia 换成桩（桩只回一组临时路径，不开面板），
//    点的是真入口、走的是 pickImage 那整趟——图必须由这条路喂进来，见 F 节开头那段注释。
// ⚠️ 提交那一条会打现网，所以中途把 wx.request 换成桩（只接 /api/ingest 与 /api/tasks），
//    别的 URL 一律走回原函数；跑完当场还原。为的是"整条滑动→忙态→进度→吐司→跳详情"
//    真跑一遍而不往现网落一条垃圾笔记。跳转那一趟也挡下来（记下目标 url 就算证）。
const automator = require('miniprogram-automator')
const lang = require('./尺子语言钉.js')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/10-08创建入口暗面板/实测')
const I18N = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))
// 「停在最右」那一格从 create.js 现读，不抄进判据：10-10 面板内边距 32→24 一改，行程就从
// 456 变 476；上一版把 456 抄在这里，改样式那一轮它只是**跟着红**，白费劲。
const SLD_MAX = Number(/const SLD_MAX_RPX = (\d+)/.exec(
  fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/create/create.js'), 'utf8'))[1])
// 「粘贴」那一枚的超时兜底也从同一个文件现读（同一套路）：P3 那一条要"等过它再说一句没来"，
// 把 1500 抄进判据，换档那一趟它只会跟着红，不会跟着说明。
const CJ_S = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/create/create.js'), 'utf8')
const WAIT_PASTE_MS = Number(/const PASTE_WAIT_MS = (\d+)/.exec(CJ_S)[1])
// 面板两档与快门那一枚的边长也从源码现读：10-08 那轮 700→500/580、10-10 那轮 →410/490 且快门
// 210→180，两次都是判据里抄的数跟着红。环那一支同理——它 10-10 从纸白换成了 palette 算出来的
// `--cp-ring`，判据要跟着换就得现读，不然下一轮换皮又是一次全红。
const CWX = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/create/create.wxss'), 'utf8')
// 井这一层现在有两枚出处，两枚都不抄字面：
// 框＝`--cp-card`（createSkin 那支白，从 palette 现读）；条＝`moodVars(心情)['--glass-chrome-slide']`
// ——这一枚的**权威出处也在 palette**（彩色四档它等于底栏组件那枚 `--chrome-bg`，墨档 18:3x 按比例降了一半），
// CSS 与 app.wxss 里那几行都只是它的镜像。
// 所以期望值现算：改 α、换心情、两处漂任何一处，C8b/C8c 当场红（与下面 RING_CSS 同一套路）。
const PAL = require(path.resolve(__dirname, '../../miniprogram/utils/palette.js'))
const CARD_HEX = (/--cp-card:\s*([^;\n]+)/.exec(PAL.createSkin()) || [0, ' #FFFFFF'])[1].trim()
const INK_HEX = (/--cp-ink:\s*([^;\n]+)/.exec(PAL.createSkin()) || [0, ' #23252C'])[1].trim()
// `#rrggbb` / `rgba(r,g,b,a)` → computed style 那个写法（逗号后一个空格、括号里不留空格）
const toComputed = (c) => {
  const h = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(c.trim())
  if (h) return `rgb(${[1, 2, 3].map((i) => parseInt(h[i], 16)).join(', ')})`
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(c)
  if (!m) return ''
  return m[4] === undefined ? `rgb(${m[1]}, ${m[2]}, ${m[3]})` : `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${m[4]})`
}
const PANEL_H = Number(/\.panel\s*\{[\s\S]*?height:\s*(\d+)rpx/.exec(CWX)[1])
const PANEL_OPEN_H = Number(/\.panel-open\s*\{\s*height:\s*(\d+)rpx/.exec(CWX)[1])
const SHUT_W = Number(/\.shut\s*\{[\s\S]*?width:\s*(\d+)rpx/.exec(CWX)[1])
// 收起态那一组的数也从样式表现读（10-10 晚是"胶囊→三块"，10-13 B 方案又是"三块→左块两片皮＋右列"）。
// 抄成常量的话，下一轮改块高就只是"判据跟着红"，白费劲——和上面 PANEL_H 同一个理由。
// ⚠ 2.2：`.tips`（整组上方那一行）与 `.blk-stat`（两枚计数）都随 B 方案撤了——整组现在只有那一行 410，
//   Tips 搬进右列（`.blk-tips`），计数变成墨面里两枚同类的 `.blk-cell`。原来那三行 lenOf 就是假红的源头。
const segOf = (sel) => (new RegExp(`(?:^|\\n)${sel}\\s*\\{([^}]*)\\}`).exec(CWX) || [0, ''])[1]
const lenOf = (sel, prop) => Number(new RegExp(`${prop}:\\s*(\\d+)rpx`).exec(segOf(sel))?.[1])
const PERSON_W_CSS = lenOf('.blk-person', 'width')
const PERSON_H_CSS = lenOf('.blk-person', 'height')
// 两枚计数**没写宽**（`flex:1`），所以期望宽要从那一条的左右内边距与缝倒算——写死 122 就是第二份真相。
const COUNT_SEG = segOf('.blk-count')
const GAP_CSS = Number(/(?:^|;)\s*gap:\s*(\d+)rpx/.exec(COUNT_SEG)[1])
const PAD_CSS = Number(/(?:^|;)\s*padding:\s*0\s+(\d+)rpx/.exec(COUNT_SEG)[1])
const CELL_W_WANT = (PERSON_W_CSS - 2 * PAD_CSS - GAP_CSS) / 2
const GROUP_H_CSS = PERSON_H_CSS                          // 整组＝那一行左块，Tips 不再占组外一段
// ➕ 那一格的右边缘离「卡」右边缘的那一口 ＝ 卡的内边距 ＋ 卡那圈描边。
// 判据原来抄的是 33（＝内边距 30＋描边 2＋1），10-14 站长那句「排版紧凑一点」把内边距压到 24，
// 它就以 25 的量红在 F2/F6 两条上——那是判据跟着红，不是屏上错了（同一个理由见文件头 PANEL_H 那段注释）。
const CARD_INSET = lenOf('.card', 'padding') + lenOf('.card', 'border')
const RING_CSS = (/--cp-ring:([^;]+)/.exec(
  require(path.resolve(__dirname, '../../miniprogram/utils/palette.js')).createSkin()) || [0, ''])[1].trim()
// `rgba(35,37,44,0.5)` 这种写法在 palette 里不带空格，而 getComputedStyle 回来带——比对前归一
const RING_RGB = RING_CSS.replace(/\(\s*/, '(').replace(/\s*,\s*/g, ', ')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

;(async () => {
  process.on('uncaughtException', (e) => { console.error('探针挂了（未捕获）', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')
  const langBefore = await lang.read(mp)
  await lang.pin(mp, 'zh')
  fs.mkdirSync(OUT, { recursive: true })

  const enter = async (url) => {
    for (let i = 0; i < 5; i++) {
      try { return await mp.reLaunch(url) } catch (e) { console.log(`第 ${i + 1} 次进 ${url} 没成：${e.message}`); await sleep(8000) }
    }
    throw new Error(`进不去 ${url}`)
  }
  // 一次拿一组节点的上下左右宽高（page 自己的 selectorQuery 够用：这一页没有自定义组件要摸）
  const rects = (sels) => mp.evaluate((list) => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    list.forEach((s) => { q.select(s).boundingClientRect() })
    q.exec((r) => resolve(list.map((s, i) => (r[i] ? {
      top: r[i].top, bottom: r[i].bottom, h: r[i].height, w: r[i].width, left: r[i].left, right: r[i].right,
    } : null))))
  }), sels)
  const rectsAll = (sel) => mp.evaluate((s) => new Promise((resolve) => {
    wx.createSelectorQuery().selectAll(s).boundingClientRect().exec((r) => resolve(
      (r[0] || []).map((x) => ({ top: x.top, bottom: x.bottom, h: x.height, w: x.width, left: x.left, right: x.right }))))
  }), sel)
  const set = (patch) => mp.evaluate((p) => {
    getCurrentPages().slice(-1)[0].setData(p)
  }, patch)
  const call = (fn, arg) => mp.evaluate((name, a) => {
    const p = getCurrentPages().slice(-1)[0]
    p[name](a)
  }, fn, arg)

  await mp.evaluate(() => { wx.removeStorageSync('home_bg_off') })
  let page = await enter('/pages/create/create')
  await sleep(4000)
  /* 每一节开头都重新取一次当前页：`reLaunch` 之后 app.js 那条登录链还会补发一次跳转，
     拿着旧 handle 去 `page.data()` 就报 "page is not on top of page stack"，
     整把尺子一条判据都没吐就崩（10-08 真跑就这么红过一次，重跑立刻好——那是时序红，不是回归）。 */
  const top = async () => { page = await mp.currentPage(); return page }
  /* 从首屏踏进第二屏那一枚人物角标，与上面同一味时序红：10-16 连着两趟在 D 节 reLaunch 之后
     3.5s 仍摸不到 `.blk-person`（一趟拿到 null 整把崩，一趟崩在下一句）。判据内容一条不松，
     只是给它三次机会、每次先重进页面——把"环境还没渲染完"与"这一枚真没了"分开。 */
  const openEntry = async () => {
    for (let i = 0; i < 3; i++) {
      await top()
      const p = await page.$('.blk-person')
      if (p) { await p.tap(); await sleep(1200); return }
      console.log(`第 ${i + 1} 次没摸到 .blk-person，重进一次再试`)
      page = await enter('/pages/create/create')
      await sleep(3500)
    }
    throw new Error('三次都没摸到 .blk-person——这一回不是时序，得查首屏那一枚还在不在')
  }
  const metric = await mp.evaluate(() => {
    const i = wx.getSystemInfoSync()
    return { w: i.windowWidth, h: i.windowHeight }
  })
  const R = metric.w / 750                       // 1rpx 等于多少 px
  const toRpx = (px) => px / R
  const rpxEq = (px, want, tol = 2) => Math.abs(toRpx(px) - want) <= tol
  const tabTop = metric.h - 128 * R              // 底栏顶边（bottom 20 + 高 108）
  const styleOf = async (sel) => { const el = await page.$(sel); return el ? await el.style('background-color') : null }
  // 10-16 加：井那一组（撤白线／上下渐变／反白／inset 顶影）判的是**画出来长什么样**，
  // 样式表源码里对、被别一层覆掉或简写吃底色那几型只有 computed style 才抓得到（见 [[feedback-surface-css-silent-noop]]）。
  const cssOf = async (sel, prop) => { const el = await page.$(sel); return el ? await el.style(prop) : null }
  const clsOf = async (sel) => { const el = await page.$(sel); return el ? ((await el.attribute('class')) || '') : '' }
  const txtOf = async (sel) => { const el = await page.$(sel); return el ? ((await el.text()) || '').trim() : null }

  // ---------- A 收起态：2.2 B 方案那一组（左块两片皮＋右列 Tips/圆 ➕，整组只有那一行） ----------
  await top()
  let d = await page.data()
  ck('A1 收起态没有面板', (await page.$$('.panel')).length === 0)
  ck('A2 收起态只有那一组，且左块那句读的是「记下来」',
    (await page.$$('.home-blk')).length === 1 && d.t.barIdle === '记下来', d.t.barIdle)
  ck('A3 条身右边那三枚小圆真撤了（屏上一枚都不该剩）', (await page.$$('.bar-dots .dot')).length === 0)
  ck('A4 组外那一行 Tips 不再回来（它搬进右列 `.blk-tips`，整组上方不许再有一行 `.tips`）',
    (await page.$$('.tips')).length === 0 && (await page.$$('.blk-tips')).length === 1,
    `.tips ${(await page.$$('.tips')).length} 枚／.blk-tips ${(await page.$$('.blk-tips')).length} 枚`)
  const [blk0, person0, col0] = await rects(['.home-blk', '.blk-person', '.blk-col'])
  const cellBox = await page.$$('.blk-cell')
  const cells0 = []
  for (const n of cellBox) { const o = await n.offset(); const s = await n.size(); cells0.push({ top: o.top, left: o.left, w: s.width, h: s.height, bottom: o.top + s.height, right: o.left + s.width }) }
  ck('A5 整组一动不动：组顶 == 左块顶（组没有内边距，第一档就贴着顶）',
    !!blk0 && !!person0 && Math.abs(blk0.top - person0.top) <= 1,
    blk0 && person0 && `组顶 ${Math.round(blk0.top)}／块顶 ${Math.round(person0.top)}`)
  ck(`A6 整组高 ${GROUP_H_CSS}rpx（就是左块那一条，Tips 不再占组外一段；原来 394＝Tips74＋缝12＋块308 那串作废）`,
    !!blk0 && rpxEq(blk0.h, GROUP_H_CSS, 4), blk0 && `${toRpx(blk0.h).toFixed(1)}rpx`)
  ck(`A6b 左块渲染成 ${PERSON_W_CSS}×${PERSON_H_CSS}（不再 308 见方；全局同名那条把整组裁成 176 的一刀就红在这里）`,
    !!person0 && rpxEq(person0.w, PERSON_W_CSS) && rpxEq(person0.h, PERSON_H_CSS)
    && cells0.length === 2 && rpxEq(cells0[0].w, CELL_W_WANT, 3),
    person0 && cells0[0] && `左块 ${toRpx(person0.w).toFixed(0)}×${toRpx(person0.h).toFixed(0)}／计数枚 ${cells0.length}·宽 ${toRpx(cells0[0].w).toFixed(0)}（该 ${CELL_W_WANT}）`)
  ck('A6c 两枚计数同宽，右列右边缘与整组右边缘对齐（列没吃余量时这里先红）',
    cells0.length === 2 && !!col0 && !!blk0 && Math.abs(cells0[0].w - cells0[1].w) <= 1
    && Math.abs(col0.right - blk0.right) <= 2,
    cells0.length === 2 && `枚宽 ${toRpx(cells0[0].w).toFixed(0)}・${toRpx(cells0[1].w).toFixed(0)}／列右 ${Math.round(col0 && col0.right)}／组右 ${Math.round(blk0 && blk0.right)}`)
  // 组底那一条缝：整组是 fixed，顶走 min(66.3%, 100vh−562rpx)（562＝整组 410＋底栏 128＋留白 24，
  // B 方案之前那条是 546＝Tips74＋缝12＋块308＋底栏128＋24），底就落在底栏上方 24rpx。
  // 这一条守的是"不许插进底栏"，与原来那条"条底不随搬家漂"是同一件事的两种写法。
  ck('A7 组底落在底栏上方一条 24rpx 的缝上（矮屏上 min() 夹的那一头也成立）',
    !!blk0 && Math.abs(blk0.bottom - (tabTop - 24 * R)) < 14,
    blk0 && `组底 ${Math.round(blk0.bottom)}｜应在 ${Math.round(tabTop - 24 * R)} 上下`)
  // A8 钉两件事：那一行只有一条（`.home-swap` 一枚），以及它坐在整组**上方**。
  // ⚠ "上方"这一半今天换了量法，不是把预算放松：原来比的是**盒子**（行底 ≤ 组顶），
  //   而 10-15 01:4x 他那句「调亮度等三块…离框框太高了，浪费空间」之后，`.home-swap` 带着
  //   `margin: -14rpx 0 -22rpx`（`create.wxss:1525`）——那 −22rpx 就是"把下面那组抬上来"的手，
  //   盒底因此天然比组顶低 ≈11px，拿盒底判红的正是这一刀本身。
  //   ⇒ 改比**看得见的字**（两枚 `.swap-text` 的字节点底边不许越过组顶），盒子的数照量照报。
  const swapBox = (await rects(['.home-swap']))[0]
  const swapInk = await rectsAll('.swap-text')
  const inkBottom = swapInk.length ? Math.max(...swapInk.map((x) => x.bottom)) : NaN
  ck('A8 那一行只一条，且它的**字**坐在整组上方（搬去的位置就是那儿；盒底吃进那口空白是 −22rpx 的设计）',
    (await page.$$('.home-swap')).length === 1 && !!swapBox && !!blk0 && swapInk.length >= 1 && inkBottom <= blk0.top + 1,
    swapBox && blk0 && `字底 ${Math.round(inkBottom)}／组顶 ${Math.round(blk0.top)}／盒底 ${Math.round(swapBox.bottom)}`)
  await mp.screenshot({ path: `${OUT}/A-收起态.png` })

  // ---------- B 展开 · 照片档：三枚圈 ----------
  await top()
  await openEntry()
  d = await page.data()
  ck('B1 点条身进「照片」（10-08 起默认档不再是直接写）', d.active === 'photo', d.active)
  const [panel1, out1] = await rects(['.panel', '.out'])
  ck(`B2 面板高 ${PANEL_H}rpx`, !!panel1 && rpxEq(panel1.h, PANEL_H, 3), panel1 && `${toRpx(panel1.h).toFixed(1)}rpx`)
  ck('B3 整组贴底：面板底 = 视口高 − 152rpx',
    !!panel1 && Math.abs(panel1.bottom - (metric.h - 152 * R)) < 3,
    panel1 && `底 ${Math.round(panel1.bottom)}｜应在 ${Math.round(metric.h - 152 * R)}`)
  ck('B4 那行小字在面板**外面**（它底边不越过面板顶边）',
    !!out1 && !!panel1 && out1.bottom <= panel1.top + 1,
    out1 && panel1 && `字底 ${Math.round(out1.bottom)}｜面板顶 ${Math.round(panel1.top)}`)
  /* 这一条守的是站长两轮"继续压低"要保的东西：面板顶不许盖住那张脸。
     脸在屏上第几行是背景图的事，探针算不出来（它只能量节点），所以这里钉的是**换算**：
     视口 753 时实测顶 414 = 0.55 屏，眼睛线在 0.47、下巴线在 0.56——面板顶落在两者之下。
     门槛取 0.5：把面板改回现网那 700rpx，顶就掉到 0.47（红），改到 580 是 0.52（绿）。
     "到底挡没挡脸"最后仍由这一把存的截图目视确认（B/C/D/F 各一张）。 */
  ck('B5 面板顶在视口 50% 以下（改回 700rpx 会掉到 0.47 当场红；脸的位置看截图）',
    !!panel1 && panel1.top / metric.h > 0.5, panel1 && `顶 ${Math.round(panel1.top)} / ${metric.h} = ${(panel1.top / metric.h).toFixed(2)}`)
  /* 10-14 站长「第二屏，Tips 去掉」⇒ 框外这一行只剩「返回」一枚，屏上查不到第二屏的 Tips。
     原来这一条比的是"左边那句等于六句里的一句"（两边都拿这一页自己那份字典比，不抄死字符串），
     载体撤了一处，"比字典"那半件事搬到了首屏那一格（§A 那批管 `.blk-tips-line`）。
     10-16 站长「把原文翻译的开关上移到与返回同一行左边」⇒ 行里从一枚变两枚，这一条的前提跟着改：
     数枚数钉的是**两枚且第二枚是那枚开关**，Tips 那两枚载体（`.out-l`／`.out-dot`）仍一条不许回来。 */
  const outKids = (await page.$$('.out > *')).length
  ck('B6 框外那一行两枚：左边那枚开关＋字典里那句「返回」，屏上没有第二屏的 Tips 与它前面那枚点',
    (await txtOf('.out-r')) === d.t.back && !(await page.$('.out-l')) && !(await page.$('.out-dot'))
    && outKids === 2 && (await page.$$('.out > .wr-sw')).length === 1,
    `「${await txtOf('.out-r')}」／枚数 ${outKids}／开关 ${(await page.$$('.out > .wr-sw')).length}`)
  const mds = await page.$$('.md')
  ck('B7 三个标签（相册并进照片了）', mds.length === 3, mds.length)
  ck('B8 当前标签是照片', /(^|\s)md on(\s|$)/.test(await clsOf('.md')) && (await txtOf('.md.on')) === '照片', await txtOf('.md.on'))
  ck('B9 这一态没有滑动条（没图就没得提炼）', (await page.$$('.sld')).length === 0)
  const [crow, shut, miniA, miniB] = await rects(['.crow', '.shut', '.mini', '.card'])
  ck(`B10 三枚圈都在：快门 ${SHUT_W}rpx、两枚小圆 105rpx`,
    !!shut && rpxEq(shut.w, SHUT_W, 3) && Math.abs(toRpx((await rects(['.mini-c']))[0].w) - 105) <= 3,
    shut && `快门 ${toRpx(shut.w).toFixed(1)}rpx`)
  ck('B11 那一排居中（crow 中心 == 卡中心，左右偏差不超过 3rpx）',
    !!crow && !!miniB && Math.abs((crow.left + crow.w / 2) - (miniB.left + miniB.w / 2)) <= 3,
    crow && miniB && `排中心 ${Math.round(crow.left + crow.w / 2)}｜卡中心 ${Math.round(miniB.left + miniB.w / 2)}`)
  // 10-10 站长那句"白环换墨环"：白环压白卡对比 1.00＝等于没画。
  ck(`B12 快门那一圈就是 palette 发下来那支环（现读 --cp-ring，不抄字面）`,
    (await (await page.$('.shut')).style('border-top-color')) === RING_RGB,
    await (await page.$('.shut')).style('border-top-color'))
  // 第三枚 10-16 从「链接」换成「粘贴」（站长原话「照片第三个按钮，改为"粘贴"」）。
  // 屏上那几个字是字典里读出来的，判据也从字典现读，不抄字面（抄了下一轮换词又是一次全红）。
  const LBD = d.t
  ck('B13 三枚圈各带一个字：相册 / 拍照 / 粘贴（第三枚不再写死"链接"）',
    (await txtOf('.mini-lb')) === LBD.fromAlbum && (await txtOf('.shut-lb')) === LBD.takePhoto
    && (await page.$$('.mini-lb'))[1] && (await (await page.$$('.mini-lb'))[1].text()) === LBD.paste,
    `${await txtOf('.mini-lb')} / ${await txtOf('.shut-lb')} / ${await (await page.$$('.mini-lb'))[1].text()}`)
  ck('B14 这一态没有多余的提示词行（拍照下面那句撤了）',
    (await page.$$('.entry-desc')).length === 0 && (await page.$$('.note')).length === 0)
  /* ⑥ 他原话「照片，链接，文字，三个Tab很难点，把按键区域扩大」。量的是渲染出来的按键面：
     高吃满那一行（≥56）、宽含左右内缩（≥88），两枚之间只剩那条 gap——
     指头落在字旁边也点得中。只数 markup 抓不到"类名写了、align-items 没给 stretch"那一类。 */
  const mdBoxes = await rectsAll('.md')
  ck('B15 三枚标签的按键面：每枚高 ≥56rpx、宽 ≥88rpx（不再只有字那么大）',
    mdBoxes.length === 3 && mdBoxes.every((x) => toRpx(x.h) >= 56 && toRpx(x.w) >= 88),
    mdBoxes.map((x) => `${toRpx(x.w).toFixed(0)}×${toRpx(x.h).toFixed(0)}`).join(' '))
  ck('B16 相邻两枚之间只剩那条缝（0~30rpx），热区既不重叠也不各奔东西',
    mdBoxes.length === 3 && mdBoxes.slice(1).every((x, i) => {
      const g = toRpx(x.left - mdBoxes[i].right)
      return g >= 0 && g <= 30
    }),
    mdBoxes.slice(1).map((x, i) => toRpx(x.left - mdBoxes[i].right).toFixed(0)).join('/'))
  ck('B17 热区扩了这一行没把面板顶高（还是那一档，卡里那两格的账没动）',
    rpxEq((await rects(['.panel']))[0].h, PANEL_H, 3),
    `${toRpx((await rects(['.panel']))[0].h).toFixed(1)}rpx`)
  await mp.screenshot({ path: `${OUT}/B-照片三枚圈.png` })

  // ---------- C 链接档：一个框 + 一枚条 ----------
  await top()
  await (await page.$$('.md'))[1].tap()
  await sleep(900)
  d = await page.data()
  ck('C1 切到链接', d.active === 'url', d.active)
  const [field1, sld1, panelC] = await rects(['.field', '.sld', '.panel'])
  ck('C2 只有一个输入框，高 105rpx', (await page.$$('.field')).length === 1 && !!field1 && rpxEq(field1.h, 105, 3),
    field1 && `${toRpx(field1.h).toFixed(1)}rpx`)
  const phAttr = await (await page.$('.field-input')).property('placeholder')
  ck('C3 提示词在框里（placeholder 就是 linkDesc 那句，从节点属性读）',
    phAttr === d.t.linkDesc, `${phAttr} vs ${d.t.linkDesc}`)
  ck('C4 条高 110rpx、外圈那一圈边 5rpx（10-16 起这一圈是墨，不再是白/浅灰）',
    !!sld1 && rpxEq(sld1.h, 110, 3), sld1 && `${toRpx(sld1.h).toFixed(1)}rpx`)
  const knob1 = (await rects(['.sld-knob']))[0]
  ck('C5 圆停在最左那一格（left ≈ 10rpx，与 SLD_REST 对得上）',
    !!knob1 && Math.abs(toRpx(knob1.left - sld1.left) - 15) <= 2,
    knob1 && sld1 && `圆离轨道左沿 ${toRpx(knob1.left - sld1.left).toFixed(1)}rpx（边框 5 + 内缩 10）`)
  ck('C6 圆宽 90rpx', !!knob1 && rpxEq(knob1.w, 90, 3), knob1 && `${toRpx(knob1.w).toFixed(1)}rpx`)
  ck('C7 这一格还空着 → 条是"按不动"那一档（sld-off 挂上了）',
    /sld-off/.test(await clsOf('.sld')), await clsOf('.sld'))
  // 他把锁从"皮"挪到了"行为"上：圆仍然是那一枚橙（10-10 深夜原话「拖动的圆ICON要换成橙色」），
  // 但空着拖不动（下面 D1 量的是真拖）。所以这一条要在 sld-off 挂着的时候量颜色。
  ck('C7b 空着那一档圆仍然是提炼那支橙（不跟壁纸走，也不许洗成灰）',
    /rgb\(196,\s*84,\s*31\)/.test(await styleOf('.sld-knob')) && /sld-off/.test(await clsOf('.sld')),
    await styleOf('.sld-knob'))
  ck('C7c 圆里那枚图形吃的是橙底上的白字（--cp-extract-ink），不是墨',
    /rgb\(255,\s*255,\s*255\)/.test(await styleOf('.sld-glyph')), await styleOf('.sld-glyph'))
  ck('C8 框与条之间有缝、框不贴面板上沿（两档 auto 边距真的分到了地方）',
    !!field1 && !!sld1 && sld1.top - field1.bottom >= 8 * R && field1.top - (await rects(['.card']))[0].top >= 8 * R,
    field1 && sld1 && `框底到条顶 ${toRpx(sld1.top - field1.bottom).toFixed(1)}rpx`)
  /* C8b/C8c 站长 10-16 最后一趟（拿真机截图那句）：「输入框要纯白，右滑要与下方三个按钮 bar 同色」，
     18:3x 又追一句「墨版的右滑太深了，要对照其他色系深浅程度，按比例降低」。
     四条都在 computed style 上量（样式表里写对却被别一层覆掉、变量指空、简写吃底色那几型，
     只有摸渲染才抓得到；这一格前面两趟就是这么骗过静态读数的）：
     框＝`rgb(255, 255, 255)` 实心、零描边、零阴影、墨字；
     条＝**当前心情那一档的条面**（期望值现算：`moodVars(屏上那档心情)` 里的 `--glass-chrome-slide`，
         彩色四档它等于底栏那一枚、墨档是他这一句降下来的 .28），那一圈不刷色，
         字＝`--slide-ink`（色板在两支候选里挑压得住这张面的那一支，墨档 18:3x 之后是深字）。 */
  const moodKey = await mp.evaluate(() => getApp().glassMood().key)
  const MOOD_V = PAL.moodVars(moodKey)
  const CHROME_RGB = toComputed(MOOD_V['--glass-chrome-slide'])
  const INK_RGB = toComputed(INK_HEX)
  const CARD_RGB = toComputed(CARD_HEX)
  const TXT_RGB = toComputed(MOOD_V['--slide-ink'])
  const fldBg = await cssOf('.field', 'background-color')
  const fldBorder = await cssOf('.field', 'border-top-width')
  const fldShadow = await cssOf('.field', 'box-shadow')
  const fldInk = await cssOf('.field-input', 'color')
  ck('C8b 那一格画出来：纯白实心＋零描边＋零阴影＋墨字（他要的那句"输入框要纯白"量在这四枚上）',
    fldBg === CARD_RGB && parseFloat(fldBorder || '9') === 0 && /none/.test(fldShadow || '')
    && fldInk === INK_RGB,
    `面 ${fldBg}（该 ${CARD_RGB}）｜边框 ${fldBorder}｜影 ${fldShadow}｜字 ${fldInk}（该 ${INK_RGB}）`)
  const sldBg = await cssOf('.sld', 'background-color')
  const sldRing = await cssOf('.sld', 'border-top-color')
  const sldInk = await cssOf('.sld-txt', 'color')
  const sldBf = await cssOf('.sld', 'backdrop-filter')
  /* 字这一枚要**跟着屏上那一档判**：C 段这一趟是"链接框还没填"那一刻量的，那时 `.sld-off` 正挂着，
     屏上读到的就是退一层那档 `--slide-ink-dim`（＝条上那支字淡到 .72）；拿满档去比会红成"实现错了"，
     其实是我拿错了期望值（10-16 这条第一次跑就是这么红的）。两档都钉：off→.72、非 off→满档。 */
  const sldCls = await clsOf('.sld')
  const TXT_DIM_RGB = toComputed(MOOD_V['--slide-ink-dim'])
  const wantInk = /sld-off/.test(sldCls) ? TXT_DIM_RGB : TXT_RGB
  ck(`C8c 右滑那一条＝这一档的条面（心情 ${moodKey}）：面吃 --glass-chrome-slide、那一圈不刷色、字吃这一档挑出来那支（这一档：${/sld-off/.test(sldCls) ? '空着·退一层' : '有内容·满档'}）、糊挂着`,
    sldBg === CHROME_RGB && /rgba\(0,\s*0,\s*0,\s*0\)/.test(sldRing || '') && sldInk === wantInk
    && !/none/.test(sldBf || 'none'),
    `面 ${sldBg}（该 ${CHROME_RGB}）／圈 ${sldRing}（该透明）｜字 ${sldInk}（该 ${wantInk}）｜糊 ${sldBf}`)
  /* C8d 站长 10-16 17:2x 附真机截图：「墨色，右滑的 bar 黑边换成发光，其他也一样」。
     这一条不读 computed style，读**屏上那几行像素**——因为"黑边"这件事在 computed style 里根本不存在：
     上一版面与圈都是 `rgba(35,37,44,.62)`，两个读数一模一样，可 `background` 默认铺到 border-box、
     border 又在同一像素上再刷一层 ⇒ 那一圈实算 α .856，屏上一条硬边（他那张截图穿过条左沿：
     条身 113／边圈 65／面板 198）。只有采像素抓得到这一型（"改一层皮的十三种静默失效"里
     "补色自己成新台阶"那一型）。
     ⚠ 定位这一趟换过两次，两次都是自己的坑，别再改回去：
       第一版拿 `boundingClientRect` × 一个缩放去对截图，被自己那条取景守卫打红：截图量的是**整块设备屏**
         （390×844 → 734×1588），节点 y 却住在 **webview** 那一层（753 高，上面压着 47 状态栏＋44 导航栏），
         两个比例对不上（1588/734＝2.16 ≠ 753/390＝1.93），采到的"条身"其实是上面那格白框（211 比面板还亮）。
       第二版改用"在图里自定位"——在下半屏 45%~88% 找"整行中位最暗"连成的一段。这一版**建立在条是
         那一横排里最暗的东西上**，而站长 18:3x 那句「墨版的右滑太深了…按比例降低」正好把这条前提撤掉了：
         面从 113 抬到 ~185 之后，最暗那一段落回面板/屏底那一排，量到的"条身"不是条。
       ⇒ 现在按节点矩形映射（`y = (cssY + statusBarHeight + 44) × 缩放`，与 `docs/工具/量-五档右滑深浅.js`
         同一把），并且**自己核一遍映射对不对**：① 条上下两行取到的必须等值（同一层面）；
         ② 条身必须比它左右那一窄条暗（暗才说明套在条上，不是套在上面的白框）；
         ③ 字那一行的偏移符号必须与色板判出来的极性一致（浅字→偏亮、深字→偏暗）。
         三条里任何一条反了就是取景错，不当"实现红"报。取样还统一取**字上下那两行**（条高 110rpx，
         字压在 39~71rpx）：第一把的"条身 132"就是被纸白字抬上去的污染读数，量的时候躲开。 */
  {
    const shot = `${OUT}/C-条身那一圈与外发光.png`
    await mp.screenshot({ path: shot })
    const { PNG } = require('pngjs')
    const img = PNG.sync.read(fs.readFileSync(shot))
    const win = await mp.evaluate(() => { const w = wx.getWindowInfo(); return { ww: w.windowWidth, sbh: w.statusBarHeight } })
    const S = img.width / win.ww
    const xOf = (cssX) => Math.round(cssX * S)
    const yOf = (cssY) => Math.round((cssY + win.sbh + 44) * S)   // ＋状态栏 ＋默认导航条
    const L = (x, y) => {
      const i = (img.width * y + x) * 4
      return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
    }
    const med = (a, b, y) => {
      const s = []
      for (let x = a; x <= b; x += 2) s.push(L(x, y))
      s.sort((p, q) => p - q)
      return s[Math.floor(s.length / 2)]
    }
    const inset = Math.round(sld1.w * 0.08)            // 躲开两端圆角，也躲开左边那枚 90rpx 圆钮
    const xA = xOf(sld1.left + inset), xB = xOf(sld1.right - inset)
    const yUp = yOf(sld1.top + sld1.h * 0.22)
    const yDn = yOf(sld1.top + sld1.h * 0.78)
    const yMid = yOf(sld1.top + sld1.h / 2)
    const up = med(xA, xB, yUp), dn = med(xA, xB, yDn)
    const bodyL = (up + dn) / 2
    const txtRow = med(xA, xB, yMid)
    const oA = xOf(sld1.left - 20), oB = xOf(sld1.left - 6)   // 条外那一窄条（发光够不到的地方）
    const panelL = (med(oA, oB, yUp) + med(oA, oB, yDn)) / 2
    // 极性：色板判出来那支字比这张面亮还是暗（面＝这一档玻璃按 α 混在白卡上，与静态 ⑤b 同一个算式）
    const slideA = Number(/,\s*([\d.]+)\s*\)$/.exec(MOOD_V['--glass-chrome-slide'])[1])
    const faceHex = PAL.mix(PAL.moodOf(moodKey).glass, CARD_HEX, slideA)
    const wantSign = Math.sign(PAL.lumOf(MOOD_V['--slide-ink']) - PAL.lumOf(faceHex))
    const gotSign = Math.sign(txtRow - bodyL)
    const rE = xOf(sld1.right)
    const seg = (a, b) => { const s = []; for (let x = rE + a; x <= rE + b; x++) s.push(L(x, yMid)); return s }
    const inner = seg(-8, -1), body2 = seg(-60, -20), glow = seg(3, 26)
    const segMed = (s) => s.slice().sort((p, q) => p - q)[Math.floor(s.length / 2)]
    ck('C8d-取景 矩形映射真的套在条上：上下两行等值、条身比它左右暗、字那一行的偏移与色板判出来的极性同号',
      Math.abs(up - dn) <= 4 && panelL - bodyL >= 5 && gotSign === wantSign && Math.abs(txtRow - bodyL) >= 5,
      `上行 ${up.toFixed(0)}／下行 ${dn.toFixed(0)}｜条身 ${bodyL.toFixed(0)} 比条外 ${panelL.toFixed(0)} 低 ${(panelL - bodyL).toFixed(0)}`
      + `｜字行偏移 ${(txtRow - bodyL).toFixed(0)}（该 ${wantSign > 0 ? '正' : '负'}＝这一档字比面${wantSign > 0 ? '亮' : '暗'}，面按 ${faceHex} 算）`)
    ck('C8d 那一圈不再比条身深（黑边＝同一枚色刷两遍，撤了不许回来；判据不看绝对深度，换 α 不作废这一条）',
      Math.min(...inner) >= bodyL - 10,
      `心情 ${moodKey}｜内圈最暗 ${Math.min(...inner).toFixed(0)}／条身 ${bodyL.toFixed(0)}（右段中段现量 ${segMed(body2).toFixed(0)}）`
      + `／差 ${(Math.min(...inner) - bodyL).toFixed(0)}`)
    /* 发光"该亮多少"**不许写死一个数**：这一圈吃 `--glass-plate-dock`＝本档 `piece`（玻璃向白提亮 55%）@.72，
       墨档那一边是**纯白**（压在条旁边能差三十几格），彩色四档那一边只是本色的浅 tint（同一行实测差 5 格）。
       写死「≥6」的那一版在墨档一路绿，屏上切到象牙当场红——那是判据拿一档的数当五档的数，不是屏上没了光。
       ⇒ 应有抬升现算：Δ应 ＝ α ×（piece 的亮度 − 条外那一窄条的实测亮度），**实测要到它的四成**才算有这圈光
         （撤掉 box-shadow 实测 Δ≈0，当场红）。期望本身 ≤5 格的那一档（这块底上这圈光本来就几乎看不见）
         只钉"不许比旁边暗"，读数照样报出来。
       ⚠ 这一条顺带是一条**产品读数**：彩色四档那圈光实测只有 +5 格。站长那句「其他也一样」要不要把四档的光
         也抬到墨档那个显眼度，等他一句话——**不在这一刀里改**。 */
    const glowTok = MOOD_V['--glass-plate-dock']
    const gc = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(glowTok || '')
    const pieceL = gc ? 0.299 * +gc[1] + 0.587 * +gc[2] + 0.114 * +gc[3] : 0
    const glowA = gc && gc[4] !== undefined ? Number(gc[4]) : 1
    const baseL = med(rE + 32, rE + 44, yMid)
    const wantD = glowA * (pieceL - baseL)
    const gotD = Math.max(...glow) - baseL
    ck('C8d-b 外沿那一圈比它旁边亮到应有抬升的四成（发光真的在画；这一档该差多少由色板现算，不写死）',
      wantD > 5 ? gotD >= wantD * 0.4 : Math.max(...glow) >= baseL - 2,
      `心情 ${moodKey}｜发光 ${glowTok}｜条外最亮 ${Math.max(...glow).toFixed(0)} 比再往外 ${baseL.toFixed(0)} 差 ${gotD.toFixed(0)}`
      + `（该 ≥ ${(wantD * 0.4).toFixed(0)}＝应有 ${wantD.toFixed(0)} 的四成${wantD > 5 ? '' : '；这一档应有抬升本身 ≤5，只钉"不许比旁边暗"'}）`)
  }
  ck('C9 链接档没有归类那一格、没有粘贴按钮', (await page.$$('.wr-cat-face')).length === 0 && !/pasteUrl/.test(JSON.stringify(d)))

  await (await page.$('.field-input')).input('not a link')
  await sleep(700)
  d = await page.data()
  const bubBefore = await rects(['.hint-bubble'])
  ck('C10 非法链接：urlHint 走 bad，那句规则行当场就说出来（不必等滑到底）',
    d.urlHint === 'bad' && d.hintLine === d.t.linkRule && bubBefore.length === 1,
    `hint=${d.hintLine} 气泡 ${bubBefore.length} 枚`)
  const [bub1, fld1, modes1, sld1b, panelNow] = await rects(['.hint-bubble', '.field', '.modes', '.sld', '.panel'])
  ck('C11 报错换了地方之后，面板纹丝不动（原来那一行会把整组顶高一格，这是他要挪走的原因）',
    !!bub1 && !!panelNow && Math.abs(panelNow.h - panelC.h) <= 1 && Math.abs(panelNow.top - panelC.top) <= 1,
    panelNow && `面板顶 ${Math.round(panelNow.top)}（原 ${Math.round(panelC.top)}）／高 ${toRpx(panelNow.h).toFixed(1)}（原 ${toRpx(panelC.h).toFixed(1)}）`)
  // 它**就是要压住框那一截上沿**（框里那行字竖直居中，压在它上面才读得出"这是说这一格的"），
  // 所以这里钉的是"顶边在模式行下面、在框顶上面"，不钉"整枚在框上面"——后者量的是没发生的事。
  ck('C11b 气泡画在面板里面、压在输入框上沿（顶边在模式那一行之下、在框顶之上，不骑在标签行上）',
    !!bub1 && !!panelNow && !!modes1 && !!fld1
    && bub1.top >= panelNow.top && bub1.top >= modes1.bottom && bub1.top < fld1.top,
    bub1 && `气泡 ${Math.round(bub1.top)}~${Math.round(bub1.bottom)}／模式行底 ${Math.round(modes1.bottom)}／框顶 ${Math.round(fld1.top)}`)
  // 「压在框上沿」可以，「挡住框里的字」不行：字竖直居中，盖过一半就会吃到那一行。
  ck('C11c 气泡盖过输入框上沿但没盖过一半（字在中间，那一行露得出来）',
    !!bub1 && !!fld1 && bub1.bottom <= fld1.top + fld1.h / 2,
    bub1 && fld1 && `气泡底 ${Math.round(bub1.bottom)}／框 ${Math.round(fld1.top)}~${Math.round(fld1.bottom)}`)
  ck('C11d 气泡是浮层：不占流内高度（它出现时框的位置与之前一致）',
    !!fld1 && !!field1 && Math.abs(fld1.top - field1.top) <= 1,
    fld1 && field1 && `现在 ${Math.round(fld1.top)}／无报错时 ${Math.round(field1.top)}`)
  const bubEl = await page.$('.hint-bubble')
  const bubShadow = bubEl ? await bubEl.style('box-shadow') : ''
  ck('C11e 带阴影的长条（他那句"用带阴影长条形气泡框"）：box-shadow 真算出来了，且是一整条横宽的',
    !!bub1 && !!bubShadow && bubShadow !== 'none' && bub1.w > 300 * R,
    `${bubShadow || '读不到'}／宽 ${bub1 ? toRpx(bub1.w).toFixed(0) : '?'}rpx`)
  await mp.screenshot({ path: `${OUT}/C-链接-报错气泡在框上方.png` })

  await (await page.$('.field-input')).input('https://mp.weixin.qq.com/s/abcdef')
  await sleep(700)
  d = await page.data()
  ck('C12 合法链接：ready 翻成 true，sld-off 撤掉',
    d.urlHint === 'ok' && d.ready === true && !/sld-off/.test(await clsOf('.sld')), `ready=${d.ready} ${await clsOf('.sld')}`)
  // 与 C8c 成对：那一头量的是"空着·退一层"，这一头量"有内容·满档"。
  // 两档都必须是**心情那一支**字色（跟着底栏那三枚图形一起翻），换心情才不会一头深一头浅。
  ck('C12b 撤掉 sld-off 之后，条上那句真的抬到满档（两档之间的落差在渲染上成立，不只是 class 换了）',
    (await cssOf('.sld-txt', 'color')) === TXT_RGB,
    `${await cssOf('.sld-txt', 'color')}（该 ${TXT_RGB}）`)

  // ---------- D 真拖：未就绪挡住、就绪触发 ----------
  await top()
  const drag = async (steps = 8) => {
    const track = (await rects(['.sld']))[0]
    const k = (await rects(['.sld-knob']))[0]
    const x0 = k.left + k.w / 2
    const y = k.top + k.h / 2
    const el = await page.$('.sld')
    await el.touchstart({ touches: [{ identifier: 0, clientX: x0, clientY: y }] })
    const probe = { midRpx: null, midLeft: null }
    for (let i = 1; i <= steps; i++) {
      const x = x0 + ((track.right - 20 * R - x0) * i) / steps
      await el.touchmove({ touches: [{ identifier: 0, clientX: x, clientY: y }] })
      await sleep(70)
      if (i === Math.floor(steps / 2)) {
        // 拖到一半量一次"屏上那枚圆真挪了没"：只读 data 里的 knobRpx 抓不到 10-08 那次的漏绑定
        //（数据一路走到 456、屏上原地不动），必须摸渲染结果。
        await sleep(220)
        probe.midRpx = (await page.data()).knobRpx
        probe.midLeft = toRpx(((await rects(['.sld-knob']))[0] || {}).left || 0) - toRpx(track.left) - 5
      }
    }
    // 松手前一刻先读一次：红了就能分清"第 5~8 那几笔 touchmove 根本没进"（这里就还是中途那个数）
    // 与"走到了最右、松手却没触发提交"（这里是 488 而 busy 空）。
    probe.preEnd = (await page.data()).knobRpx
    await el.touchend({ touches: [] })
    await sleep(400)
    return probe
  }
  await (await page.$('.field-x')).tap()      // 清空 → 这一格又空了
  await sleep(600)
  d = await page.data()
  ck('D0 清空之后 ready 退回 false', d.urlInput === '' && d.ready === false, `${d.urlInput}/${d.ready}`)
  const pr0 = await drag()
  d = await page.data()
  const bubDrag = await page.$$('.hint-bubble')
  ck('D1 空着拖：不提交（没进忙态），但话说出来了（气泡在框上方，不再是一枚吐司）',
    !d.busy && !!d.hintLine && bubDrag.length === 1, `busy=${d.busy} hint=${d.hintLine} 气泡 ${bubDrag.length} 枚`)
  // 他把锁从"皮"挪到"行为"：以前空着照样跟手、松手回弹，圆洗成灰当提示；
  // 现在空着起不了拖，圆保持橙色。中途那一次探针量的就是"真没跟着手指走"。
  ck('D1b 空着那一档**拖不动**：data 与屏上两头都停在最左那一格',
    d.knobRpx === 10 && Math.abs(pr0.midRpx - 10) <= 3 && Math.abs(pr0.midLeft - 10) <= 6,
    `中途 data ${pr0.midRpx}／屏上 ${pr0.midLeft.toFixed(0)}／收尾 ${d.knobRpx}`)
  await mp.screenshot({ path: `${OUT}/D-空着拖-圆不动且气泡在框上方.png` })
  // 「几秒后消失」是一条有时间常量的判据：等满 HINT_MS 再加一段余量，仍然在屏上就是红。
  await sleep(4600)
  ck('D1c 那枚气泡几秒后自己走（不用等这一格有内容，也不用再点一下）',
    (await page.$$('.hint-bubble')).length === 0 && !(await page.data()).hintLine,
    `hint=${(await page.data()).hintLine}`)

  /* ---------- D1d–D1j 这一枚的皮（站长 10-18 00:1x 拿着真机图那一句） ----------
     原话：「提炼前的报错提示，不要用灰底白字，要换成白底，深灰字，不要加粗，外框用阴影浮起。
     加抖一抖动态。」静态那把（`验-统一录入条`）钉的是样式表里挂的哪一档令牌；这几条钉
     **屏上算出来的是什么**——皮这一类最容易"源码写了、渲染没生效"（`.mini-c` 那回是类名点空、
     `.container.has-bg` 那回是权重不够，两回结构判据全绿、只有截图是坏的）。
     阴影不在这队里：C11e 已经拿同一个元素量过 `box-shadow`，同一件事不留两处判据。
     ⚠ 期望色一律现读（面＝`palette.createSkin()` 的 `--cp-card`，字＝`--cp-ink-78`），
        写成 `rgb(255,255,255)` 那种字面就是给梯子钉第二份真相，下一轮换壁纸它只会跟着红。
     ⚠ 对比这一条拿**屏上读回来的两支计算色**现算：alpha 先合成到它落的那块面上再按 WCAG 算。
        样式注释里那句 7.46 是给人看的，漂了没人知道；读数不会。
     ⚠ 抖一抖只有"节点真挪过"才算落：`@keyframes` 写了而渲染不认（或 transform 里那个单位掉下来），
        屏上就是原地不动，而静态那几条照样全绿。动画只有几百毫秒，所以**手指按下之后立刻开始采**，
        采完才松手——拿"拖一趟再回头看"那种写法一定采不到。 */
  const kfText = (CWX.match(/@keyframes\s+cre-hint-shake\s*\{([\s\S]*?)\n\}/) || [0, ''])[1]
  const SHAKE_RPX = Math.max(0, ...[...kfText.matchAll(/translateX\(\s*(-?[\d.]+)rpx\s*\)/g)].map((m) => Math.abs(Number(m[1]))))
  const ANIM_MS = Number((/animation:\s*[\w-]+\s+(\d+)ms/.exec(segOf('.hint-bubble')) || [0, '420'])[1])
  const BUB_FACE = toComputed(CARD_HEX)
  const BUB_INK = toComputed((/--cp-ink-78:\s*([^;\n]+)/.exec(PAL.createSkin()) || [0, 'rgba(35,37,44,0.78)'])[1].trim())
  const rgbOf = (s) => {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/.\s]+([\d.]+))?/.exec(String(s))
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null
  }
  const lin8 = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const lum8 = (p) => 0.2126 * lin8(p[0]) + 0.7152 * lin8(p[1]) + 0.0722 * lin8(p[2])
  const cr8 = (f, g) => { const a = lum8(f), b = lum8(g); return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 }
  const sldEl2 = await page.$('.sld')
  const knob2 = (await rects(['.sld-knob']))[0]
  const seenLeft = []
  await sldEl2.touchstart({ touches: [{ identifier: 0, clientX: knob2.left + knob2.w / 2, clientY: knob2.top + knob2.h / 2 }] })
  const tShake = Date.now()
  while (Date.now() - tShake < ANIM_MS + 380) {
    const b = (await rects(['.hint-bubble']))[0]
    if (b) seenLeft.push(b.left)
    await sleep(20)
  }
  await sldEl2.touchend({ touches: [] })
  await sleep(250)
  const bubSkinEl = await page.$('.hint-bubble')
  const spreadPx = seenLeft.length ? (Math.max(...seenLeft) - Math.min(...seenLeft)) : 0
  const faceNow = bubSkinEl ? String(await bubSkinEl.style('background-color') || '') : ''
  const inkNow = bubSkinEl ? String(await bubSkinEl.style('color') || '') : ''
  const weightNow = bubSkinEl ? String(await bubSkinEl.style('font-weight') || '') : ''
  const animNow = bubSkinEl ? String(await bubSkinEl.style('animation-name') || '') : ''
  const faceRgb = rgbOf(faceNow)
  const inkRgb = rgbOf(inkNow)
  // 深灰字本身带 alpha ⇒ 先合成到它真正落的那块面上（读回来的面，不是我假设的白）再算对比
  const onFace = inkRgb && faceRgb
    ? [0, 1, 2].map((k) => inkRgb[k] * inkRgb[3] + faceRgb[k] * (1 - inkRgb[3])) : null
  ck('D1d 面是白的：屏上算出来的 background-color 就是 palette 那支 --cp-card（暗面 --cp-ink 不许回来）',
    !!faceNow && faceNow === BUB_FACE, `屏上 ${faceNow || '(读不到)'}／该 ${BUB_FACE}`)
  ck('D1e 字是深灰：屏上算出来的 color 就是这一屏已有的那档 --cp-ink-78（不新起梯子）',
    !!inkNow && inkNow === BUB_INK, `屏上 ${inkNow || '(读不到)'}／该 ${BUB_INK}`)
  ck('D1f 不加粗：屏上算出来的 font-weight 是 400（他这句明写"不要加粗"）',
    /^(400|normal)$/.test(weightNow), `屏上 ${weightNow || '(读不到)'}`)
  const crBub = onFace ? cr8(onFace, faceRgb) : null
  ck(`D1g 白底压深灰字读得清：这两支计算色合成后对比 ≥ 4.5（AA 小字线）`,
    crBub !== null && crBub >= 4.5, crBub === null ? '(色没读全，不算数)' : `实测 ${crBub}:1`)
  ck('D1h 抖一抖挂在屏上：这一枚算出来的 animation-name 就是样式表里那个 @keyframes',
    animNow === 'cre-hint-shake', `屏上 ${animNow || '(读不到)'}`)
  ck(`D1i 而且真动了：出现那几百毫秒里节点的 left 来回挪过（静止不动＝@keyframes 白写）`,
    seenLeft.length >= 3 && spreadPx >= 1.5,
    `采样 ${seenLeft.length} 拍／最大位移 ${spreadPx.toFixed(2)}px（源码写的摆幅 ±${SHAKE_RPX}rpx＝${(SHAKE_RPX * R).toFixed(2)}px、时长 ${ANIM_MS}ms）`)
  // 采完把这一枚放干净：D1c 之后那几段（E 粘贴那一族）的前提是"屏上没有气泡"。
  const tClear = Date.now()
  while (Date.now() - tClear < 8000 && (await page.data()).hintLine) await sleep(400)
  ck('D1j 这一枚还是几秒自己走（重新触发也一样，不用人再点一下）',
    (await page.$$('.hint-bubble')).length === 0 && !(await page.data()).hintLine)

  // 换桩：只接提炼那两条，别的 URL 走回原函数，免得往现网落一条垃圾笔记
  const stubbed = await mp.evaluate(() => {
    if (wx.__probeRaw) return false
    wx.__probeRaw = wx.request
    wx.request = (o) => {
      const u = (o && o.url) || ''
      if (u.indexOf('/api/ingest') > -1) {
        setTimeout(() => o.success && o.success({ statusCode: 200, data: { status: 'queued', task_id: 'probe-task' } }), 60)
        return { abort() {} }
      }
      // 详情页那一趟也别打现网：桩直接回一句"没有这条"，它走自己本地的错误态
      if (u.indexOf('/api/notes') > -1) {
        setTimeout(() => o.success && o.success({ statusCode: 404, data: { detail: 'probe' } }), 20)
        return { abort() {} }
      }
      if (u.indexOf('/api/tasks/probe-task') > -1) {
        // 第一次回 processing、第二次才回 completed：pollTask 是"一进来先问一次"，
        // 不挡这一下的话整条 0.1 秒就走完了，"拖动中·进度"那张截图会拍到已完成那一帧。
        wx.__probePolls = (wx.__probePolls || 0) + 1
        const done = wx.__probePolls > 3
        setTimeout(() => o.success && o.success({
          statusCode: 200,
          data: done ? { status: 'completed', result: { note_id: 'probe-note' } } : { status: 'processing' },
        }), 60)
        return { abort() {} }
      }
      return wx.__probeRaw(o)
    }
    // 跳转这一趟也挡住：完成那一帧只活 800ms，靠 sleep 去撞它必然掷硬币（10-08 D8 就这么红过一次——
    // 红的是"读不到"而不是"画错了"）。桩把目标 url 记下来，D8 从容态里量，D9 改判"有没有约成这一跳"。
    if (!wx.__probeRawNav) {
      wx.__probeRawNav = wx.navigateTo
      wx.__probeNav = []
      wx.navigateTo = (o) => { wx.__probeNav.push((o && o.url) || '') }
    }
    return true
  })
  ck('D2 wx.request 换成桩了（这一节不会打现网）', stubbed === true, String(stubbed))

  await (await page.$('.field-input')).input('https://mp.weixin.qq.com/s/abcdef')
  await sleep(700)
  await mp.evaluate(() => { wx.__probePolls = 0 })   // 计数归零，"第 4 次才回 completed"才是硬时刻
  const pr = await drag()
  let dD = await page.data()
  ck('D3 拖到底 → 真的进忙态（busy=url）', dD.busy === 'url',
    `${dD.busy}｜松手前一刻 knob=${pr.preEnd}`)
  ck('D3b 拖到一半屏上那枚圆真跟着走（不是只写在 data 里）',
    pr.midRpx > 120 && Math.abs(pr.midLeft - pr.midRpx) <= 8, `data ${pr.midRpx}rpx｜屏上 ${pr.midLeft.toFixed(0)}rpx`)
  await sleep(1400)
  dD = await page.data()
  ck(`D4 圆停在最右那一格 ${SLD_MAX}rpx、且颜色没变（class 里没有一档改色）`,
    dD.knobRpx === SLD_MAX && !/sld-done|sld-off/.test(await clsOf('.sld')),
    `knob=${dD.knobRpx} class=${await clsOf('.sld')}`)
  ck('D5 进度那一格走起来了（假进度按秒推，>0 就算在动）', dD.fillPct > 0, `fillPct=${dD.fillPct}`)
  const fillW = (await rects(['.sld-fill']))[0]
  ck('D6 进度填充盖不住那圈白边（填充左边 == 轨道内沿，白边那一档还在）',
    !!fillW && Math.abs(fillW.left - ((await rects(['.sld']))[0].left + 5 * R)) <= 2,
    fillW && `填充左 ${Math.round(fillW.left)}`)
  await mp.screenshot({ path: `${OUT}/D-拖动中-进度.png` })
  // 完成那一帧不再靠 sleep 撞：跳转已被桩挡住，所以这一格会一直停在已完成，量得从容。
  const waitDone = async () => {
    for (let i = 0; i < 40; i++) {
      const x = await mp.evaluate(() => {
        const pg = getCurrentPages().filter((p) => p.route === 'pages/create/create').slice(-1)[0]
        return pg ? { done: pg.data.done, fillPct: pg.data.fillPct, busy: pg.data.busy, urlInput: pg.data.urlInput } : null
      })
      if (x && x.done) return x
      await sleep(200)
    }
    return null
  }
  const dDone = await waitDone()
  ck('D7 接口回来 → 满格 + 完成那一帧（done=true、fillPct=100、草稿已清）',
    !!dDone && dDone.done === true && dDone.fillPct === 100 && !dDone.busy && dDone.urlInput === '',
    JSON.stringify(dDone))
  /* D8 除了 class 还必须**摸到那一层橙**：10-16 之前"完成转实心"在铺了形象图那一态从没画出来过
     （`.container.has-bg .sld` 那条 0-3-0 压住了 `.sld-done`），而 class 与圆的位置两条判据一直绿。
     这一轮把那条覆盖整条撤了，覆盖没了、前提也没了——所以这里量的不再是"抬到 0-4-0 之后有没有现面"，
     而是"撤完之后仍然现面"。字仍是配那支橙的纯白。
     那一圈 17:2x 起不再跟着转橙，而是与常态同一档**不刷色**：站长那句"黑边"的根因就是同一枚色刷两层，
     完成这一帧要是还写"圈＝面"，等于把同一个画法留在第二态里（D8b 吃的仍是那 5rpx 结构，宽度没动）。 */
  const EXTRACT_RGB = toComputed((/--cp-extract:\s*([^;\n]+)/.exec(PAL.createSkin()) || [0, ' #C4541F'])[1].trim())
  const doneBg = await cssOf('.sld', 'background-color')
  const doneRing = await cssOf('.sld', 'border-top-color')
  const doneInk = await cssOf('.sld-txt', 'color')
  ck('D8 完成那一帧整条转实心、那一圈不刷第二层色（面摸到那支橙，不是只看 class）',
    /sld-done/.test(await clsOf('.sld')) && !!dDone
    && doneBg === EXTRACT_RGB && /rgba\(0,\s*0,\s*0,\s*0\)/.test(doneRing || '')
    && /rgb\(255,\s*255,\s*255\)/.test(doneInk || ''),
    `面 ${doneBg}（该 ${EXTRACT_RGB}）｜圈 ${doneRing}（该透明）｜字 ${doneInk}｜${await clsOf('.sld')}`)
  const knobDone = (await rects(['.sld-knob']))[0]
  ck('D8b 完成那一帧圆仍钉在最右那一格（没回弹）',
    !!knobDone && Math.abs(knobDone.left - ((await rects(['.sld']))[0].left + (SLD_MAX + 5) * R)) <= 3 * R,
    knobDone && `圆左 ${toRpx(knobDone.left).toFixed(0)}rpx`)
  await mp.screenshot({ path: `${OUT}/D-完成那一帧.png` })
  await sleep(1200)
  const nav = await mp.evaluate(() => wx.__probeNav || [])
  ck('D9 吐司之后约成了跳笔记详情页这一跳（url 带 probe-note）',
    nav.length === 1 && nav[0] === '/pages/detail/detail?id=probe-note', JSON.stringify(nav))
  const route = await mp.evaluate(() => getCurrentPages().slice(-1)[0].route)
  ck('D9b 探针自己没把页面跳走（还停在创建这一屏，桩挡住的那跳不会真发生）', route === 'pages/create/create', route)
  await mp.evaluate(() => {
    if (wx.__probeRaw) { wx.request = wx.__probeRaw; delete wx.__probeRaw }
    if (wx.__probeRawNav) { wx.navigateTo = wx.__probeRawNav; delete wx.__probeRawNav; delete wx.__probeNav }
  })
  page = await enter('/pages/create/create')
  await sleep(3500)

  // ---------- E 文字档：一个框，展开才变两行 ----------
  await top()
  await openEntry()
  await (await page.$$('.md'))[2].tap()
  await sleep(900)
  d = await page.data()
  ck('E1 切到文字', d.active === 'write' && d.panelOpen === false, `${d.active}/${d.panelOpen}`)
  const ta = await page.$('.field-area')
  ck('E2 只有一个原文框（标题格撤了、这一档连 input 都没有），提示词吃 manualDesc',
    !!ta && (await ta.property('placeholder')) === d.t.manualDesc && (await page.$$('input')).length === 0,
    `${await (await page.$('.field-area')).property('placeholder')} vs ${d.t.manualDesc}`)
  /* 这一格 10-10 深夜多包了一层壳（textarea 装不下子节点，粘贴钮只能做兄弟），所以两头都要量：
     壳是屏上那个带皮的盒子（105/160），框是壳里面写字的那一层。
     ⚠ 10-16「不要白线」把壳那 3rpx 描边撤了 ⇒ 两层读数**并成同一个数**（原来 105／99、160／154，
        现在 105／105、160／160）。框只写 `height:100%` ＋ 上内边距而没写 box-sizing 的话，
        读数会是 136/191（内边距加在 100% 外面）—— 静态读源码看不出来，只有在这里量渲染才抓得住。 */
  const [shell3, ta3] = await rects(['.field-write', '.field-area'])
  ck('E3 收起那一档这一格是一行（壳 105rpx；撤了描边之后写字那一层与壳同高＝105）',
    !!shell3 && rpxEq(shell3.h, 105, 3) && !!ta3 && rpxEq(ta3.h, 105, 3),
    `壳 ${shell3 && toRpx(shell3.h).toFixed(1)}／框 ${ta3 && toRpx(ta3.h).toFixed(1)}rpx`)
  /* ⑨ 文字档也要有粘贴钮，且这一枚点下去真把内容接进框里、不顶掉旧字。
     （只数节点的判据抓不到"钮在、但读的是别的键"，那正是链接档原来那个 bug 的形状。）

     ⚠⚠ 模拟器里剪贴板这一对 API 是**死的**，10-16 实测两次：
       ① `evaluate(() => new Promise(d => wx.getClipboardData(...)))` 把整把尺子挂到
          `timeout waiting for automator response` 退出（回调一个都不发，Promise 永远不落地）；
       ② 改成"回调只往 wx 上写槽、第二趟当普通值读回"再探一次，set 与 get 各等 1.5s，
          读数 `{set:"no-callback", get:"no-callback"}` —— success／fail／complete 三条全没走；
       ③ 宿主机 `pbpaste` 在 `wx.setClipboardData` 前后都是空 ⇒ 模拟器根本不写系统板。
       所以这一节**不许**再靠真剪贴板：靠系统能力的那半只有真机能证。
     打法与本把 F 节（chooseMedia）／D 节（wx.request）同一套路子：把 `wx.getClipboardData` 换成桩、
     桩把 success 与 complete 都发完，**点的仍是屏上那枚真钮、走的仍是 onPasteWrite 整趟**。
     桩证明的是接线与语义（读到的那串真进了框、接在旧字后面、不亮报错气泡），
     证明不了的是"iOS/安卓上长按系统剪贴板读得到东西"——那一句写在读数里，不糊过去。 */
  const CLIP = '剪贴板里那一句'
  const OLD = '第一段旧字'
  // 连着两趟整把尺子死在 E3 之后（`timeout waiting for automator response`），而单独探针里这一串
  // 三步全通（input 进得了 writeBody、点钮真把桩里那句接在旧字后面、errLine 空）。
  // 所以先给这一段每一步落一行脚印：再挂就挂在哪一句，不用猜。
  console.log('→ E3a 装剪贴板桩')
  await mp.evaluate((sentinel) => {
    if (!wx.__clipRaw) wx.__clipRaw = wx.getClipboardData
    wx.getClipboardData = (o) => {
      const res = { data: sentinel, errMsg: 'getClipboardData:ok' }
      if (o.success) o.success(res)
      if (o.complete) o.complete(res)
    }
  }, CLIP)
  console.log('→ E3b 找那枚钮')
  const pasteBtn = await page.$('.field-write .field-paste')
  ck('E3b 文字档那格有粘贴钮（在格子里，与链接档同一个类名）', !!pasteBtn)
  if (pasteBtn) {
    console.log('→ E3 往框里打旧字')
    await (await page.$('.field-area')).input(OLD)   // 先让框里有旧字：这一位的语义是"接在后面"，不是替换
    await sleep(400)
    const bodyBefore = (await page.data()).writeBody || ''
    console.log('→ E3c 点那枚钮')
    await pasteBtn.tap()
    await sleep(700)
    const a3 = await page.data()
    const bodyAfter = a3.writeBody || ''
    ck('E3c 点那枚钮真走 onPasteWrite：读到的一串接在旧字**后面**（旧字一个字不许没）',
      bodyBefore === OLD && bodyAfter === `${OLD}\n${CLIP}`,
      `前 ${JSON.stringify(bodyBefore)} → 后 ${JSON.stringify(bodyAfter)}｜报错行 ${JSON.stringify(a3.errLine || '')}（桩证的接线，真读系统剪贴板只有真机能证）`)
    const bubAfter = await page.$$('.hint-bubble')
    ck('E3d 接进去了就不许再报"还没有内容"（那枚气泡不能因为粘贴而亮着）',
      bubAfter.length === 0 && !(await page.data()).hintLine, `${bubAfter.length} 枚`)
    // 桩当场还原、旧字擦干净：后面 E4~E9 与 G 节量的是焦点／ready 那一套，
    // 框里留一句哨兵会让"空着不许能提交"那类判据变成假绿（与 D 节 wx.request 那副替身同规矩）。
    console.log('→ E3 还原桩并擦净框')
    await mp.evaluate(() => { if (wx.__clipRaw) { wx.getClipboardData = wx.__clipRaw; delete wx.__clipRaw } })
    await (await page.$('.field-area')).input('')
    await sleep(400)
  }
  // ⚠️ 这里用 trigger('focus') 而不是 tap()：模拟器里 tap 一枚原生 <textarea> **不会**把焦点落上去
  //（实测 bodyFocus 一直是 false，E4/E5/E6 三条连着红，而面板高度那条量出来是 500 没错）。
  // trigger 走的是 bind 事件那条通道，证的正是"焦点这一位接上了没"——真机上键盘起来必然发 focus，
  // 那是平台行为，不在这一把的责任范围。
  await ta.trigger('focus')
  await sleep(900)
  d = await page.data()
  ck(`E4 焦点进框里 → 面板抬到展开那一档（${PANEL_OPEN_H}rpx，只多一行）`,
    d.bodyFocus === true && d.panelOpen === true && rpxEq((await rects(['.panel']))[0].h, PANEL_OPEN_H, 4),
    `focus=${d.bodyFocus} open=${d.panelOpen} 高 ${toRpx((await rects(['.panel']))[0].h).toFixed(1)}rpx`)
  const [shell5, ta5] = await rects(['.field-write', '.field-area'])
  ck('E5 壳跟着变成两行（160rpx，写在壳身上；撤了描边之后写字那一层同高＝160）',
    !!shell5 && rpxEq(shell5.h, 160, 4) && !!ta5 && rpxEq(ta5.h, 160, 4),
    `壳 ${shell5 && toRpx(shell5.h).toFixed(1)}／框 ${ta5 && toRpx(ta5.h).toFixed(1)}rpx`)
  // E6~E9 这一组 10-16 改口径：站长「把原文翻译的开关上移到与返回同一行左边，三个tab全局都可用」
  // ＋「默认是翻译，关闭就不翻译」。原来那四条钉的是"展开态才出现、默认关、离开焦点跟着撤"，
  // 这三条前提今天全不成立（撤一个状态会作废一批判据，见 [[feedback-removing-a-state-invalidates-rulers]]）。
  // 现在钉的是：① 它一直在（展开收起都在，因为闸从节点上拿掉了）② 它落在面板**之上**（真的在框外那一行，
  // 不是类名对却还在卡里）③ 默认是开 ④ 点一下只翻这一位。
  const swE6 = await page.$$('.wr-sw')
  const [swBox6, panelBox6, outBox6] = await rects(['.wr-sw', '.panel', '.out'])
  ck('E6 「原文翻译」那枚一直在，且默认就是开（站长 10-16「默认是翻译」）',
    swE6.length === 1 && d.writeTranslate === true, `${swE6.length} 枚／writeTranslate=${d.writeTranslate}`)
  // 位置判据两头：① 整枚落在面板顶**之上**（真的搬出卡子了）；② 它与那一行**同轴**（垂直中心差 ≤ 8px）。
  // 不钉"整枚在行的盒子内"——那枚开关故意上下各垫了 10rpx 透明 padding（热区），盒子比行高 4px 是设计值，
  // 拿行的盒子当边界量它必红（量法要跟着实现改，预算不松：见 [[feedback-ruler-units-and-box-model]]）。
  const swMid = swBox6 && swBox6.top + swBox6.h / 2
  const outMid = outBox6 && outBox6.top + outBox6.h / 2
  ck('E6b 它坐在框外那一行里：整枚落在面板顶**之上**、且与那一行同轴（搬对了位置，不是只改了类名）',
    !!swBox6 && !!panelBox6 && !!outBox6 && swBox6.bottom <= panelBox6.top + 1
    && Math.abs(swMid - outMid) <= 8,
    `开关 ${swBox6 && swBox6.top.toFixed(1)}~${swBox6 && swBox6.bottom.toFixed(1)}（中 ${swMid && swMid.toFixed(1)}）／那一行中 ${outMid && outMid.toFixed(1)}／面板顶 ${panelBox6 && panelBox6.top.toFixed(1)}`)
  /* E6c/E6d 站长 10-16 第三刀的两头，在屏上量：
       「药丸按钮改为最靠左」＝这一组**第一枚就是轨道**（左沿与整组左沿同一条线，名字与说明排在它右边）；
       「文字说明字体样式与返回一样」＝同一档字号（computed font-size 逐字相等）。
     钉渲染不钉源码：样式表里写了 `flex-start` 却被人用 order／margin 搬回右边，静态读不出来。 */
  const [trackR6, labR6, hintR6] = await rects(['.wr-sw-track', '.wr-sw-lab', '.wr-sw-hint'])
  ck('E6c 轨道落在这一组最左（名字在它右边、说明在名字右边，三枚按这个次序排）',
    !!swBox6 && !!trackR6 && !!labR6 && !!hintR6
    && Math.abs(trackR6.left - swBox6.left) <= 1
    && trackR6.right <= labR6.left + 1 && labR6.right <= hintR6.left + 1,
    `组左 ${swBox6 && swBox6.left.toFixed(1)}／轨道 ${trackR6 && `${trackR6.left.toFixed(1)}~${trackR6.right.toFixed(1)}`}／名字 ${labR6 && labR6.left.toFixed(1)}／说明 ${hintR6 && hintR6.left.toFixed(1)}`)
  const hintFsPx = await cssOf('.wr-sw-hint', 'font-size')
  const backFsPx = await cssOf('.out-r', 'font-size')
  ck('E6d 那句说明与「返回」同一档字号（computed 逐字相等，不是各自写同一个 rpx 猜的）',
    !!hintFsPx && hintFsPx === backFsPx, `说明 ${hintFsPx}／返回 ${backFsPx}`)
  await mp.screenshot({ path: `${OUT}/E-文字-展开两行.png` })
  await (await page.$('.wr-sw')).tap()
  await sleep(700)
  d = await page.data()
  ck('E7 点开关只翻这一位（开→关），面板不收、不提交',
    d.writeTranslate === false && d.active === 'write' && !d.busy && (await page.$$('.panel')).length === 1,
    `${d.writeTranslate}/${d.active}/${d.busy}`)
  const offT = await styleOf('.wr-sw-track')
  // 关掉那一刻屏上读到的那句：站长给的原话（字典里那一枚），两态必须换、且不许被截断成省略号。
  const hintOff = await txtOf('.wr-sw-hint')
  await (await page.$('.wr-sw')).tap()
  await sleep(700)
  const onT = await styleOf('.wr-sw-track')
  const dOn = await page.data()
  const hintOn = await txtOf('.wr-sw-hint')
  ck('E8 开与关那一面换了色（两态看得出来）', !!offT && !!onT && offT !== onT, `${offT} → ${onT}`)
  ck('E8b 关那一档的面是**灰**（这一页那支墨的 50%），开那一档才是提炼那支橙（站长「关闭状态，按钮变灰」）',
    /rgba\(35,\s*37,\s*44,\s*0\.5\)/.test(offT || '') && /rgb\(196,\s*84,\s*31\)/.test(onT || ''),
    `关 ${offT}／开 ${onT}`)
  ck('E8c 文案跟着这一位换（开一句、关一句，都从字典现读；两态各自截不断）',
    hintOn === dOn.t.translateOn && hintOff === dOn.t.translateOff && hintOn !== hintOff
    && !/…$/.test(hintOn) && !/…$/.test(hintOff),
    `开「${hintOn}」／关「${hintOff}」`)
  await (await page.$('.field-area')).trigger('blur')
  await sleep(800)
  d = await page.data()
  ck('E9 离开焦点只退回收起那一档，**开关不跟着撤**（三档全局＝这一档也在）',
    d.panelOpen === false && (await page.$$('.wr-sw')).length === 1
    && rpxEq((await rects(['.panel']))[0].h, PANEL_H, 4), `${d.panelOpen}／${(await page.$$('.wr-sw')).length} 枚`)

  // ---------- F 照片档：小图一行、展开只多一行、满了给话 ----------
  await top()
  // 上一节停在文字档，这一节的"格数/行数"只有在照片档才画得出来，先切回照片那一档。
  // ⚠️ 图只能走"桩住 wx.chooseMedia + 真点入口"这条路喂：拿 mp.evaluate 直接 setData 一个数组，
  // 服务层 data 到位、渲染层却不跟（10-08 实测：evaluate 设 1 张，屏上仍是空态；同一位真点走 pickImage
  // 立刻出 5 格）。这把尺子量的是屏上那一排，所以必须走真路径。
  await (await page.$$('.md'))[0].tap()
  await sleep(700)
  await mp.evaluate(() => {
    if (wx.__rawChoose) return
    wx.__rawChoose = wx.chooseMedia
    wx.__chooseCalls = 0
    wx.__shots = []
    wx.chooseMedia = (o) => {
      wx.__chooseCalls += 1
      const res = { type: 'image', tempFiles: (wx.__shots || []).map((p) => ({ tempFilePath: p })) }
      if (o.success) o.success(res)
      if (o.complete) o.complete(res)
    }
  })
  const clearShots = async () => {
    for (let i = 0; i < 12; i++) {
      const x = await page.$('.th-x')
      if (!x) break
      await x.tap()
      await sleep(220)
    }
    await sleep(500)
  }
  const setShots = async (n) => {
    await clearShots()
    await mp.evaluate((k) => {
      // 路径必须互不相同：wx:key="*this" 拿路径当键，撞了键那一串整个不渲染
      wx.__shots = Array.from({ length: k }, (_, i) => `http://usr/probe-${i}.png`)
    }, n)
    const add = await page.$('.th-add')
    await (add || (await page.$$('.mini'))[0]).tap()
    await sleep(1100)
    return page.data()
  }
  let f = await setShots(4)
  const n4 = (await page.$$('.strip .th')).length
  ck(`F1 四张 + ➕ 仍在同一行（5 格装得下），面板还是 ${PANEL_H}`,
    f.panelOpen === false && n4 === 5
    && rpxEq((await rects(['.panel']))[0].h, PANEL_H, 4), `${n4} 格 / open=${f.panelOpen} / active=${f.active}`)
  const th4 = await rectsAll('.strip .th')
  const cardR = (await rects(['.card']))[0]
  ck('F2 ➕ 钉在这一行最右端（它的右边 == 卡内右边）',
    !!th4[4] && !!cardR && Math.abs(th4[4].right - cardR.right + CARD_INSET * R) <= 6 * R,
    th4[4] && cardR ? `➕右 ${Math.round(th4[4].right)}｜卡右 ${Math.round(cardR.right)}` : `格数 ${th4.length}`)
  ck('F3 序号标在图里（读到 1…4），没有"已选 N 张"那一行',
    (await page.$$('.th-no')).length === 4 && (await txtOf('.th-no')) === '1'
    && (await page.$$('.cnt')).length === 0, await txtOf('.th-no'))
  ck('F4 四张图各自真画出来了（宽 100rpx 见方）',
    th4.length === 5 && th4.slice(0, 4).every((x) => rpxEq(x.w, 100, 4) && Math.abs(x.h - x.w) <= 2),
    th4.slice(0, 4).map((x) => `${toRpx(x.w).toFixed(0)}×${toRpx(x.h).toFixed(0)}`).join(' ') || '没有格')
  await mp.screenshot({ path: `${OUT}/F-四张一行.png` })

  f = await setShots(6)
  ck(`F5 第六格放不下 → 自己多一行，面板到 ${PANEL_OPEN_H} 为止`,
    f.panelOpen === true && rpxEq((await rects(['.panel']))[0].h, PANEL_OPEN_H, 4), `open=${f.panelOpen}`)
  const th6 = await rectsAll('.strip .th')
  const cardR6 = (await rects(['.card']))[0]
  ck('F6 真排成两行（第六格与第一格不在同一行），➕ 被 margin-left:auto 钉在第二行最右端',
    th6.length === 7 && th6[0].top !== th6[5].top
    && !!cardR6 && Math.abs(th6[6].right - cardR6.right + CARD_INSET * R) <= 6 * R,
    `格数 ${th6.length}｜➕右 ${th6[6] && Math.round(th6[6].right)}｜卡右 ${cardR6 && Math.round(cardR6.right)}`)
  ck('F7 一行放五格（不是四格、也不是六格）：数一数第一行几枚',
    th6.length === 7 && th6.filter((x) => Math.abs(x.top - th6[0].top) <= 2).length === 5,
    `${th6.length ? th6.filter((x) => Math.abs(x.top - th6[0].top) <= 2).length : 0} 枚`)
  await mp.screenshot({ path: `${OUT}/F-六张两行.png` })

  f = await setShots(9)
  ck('F8 满 9 张：➕ 转灰（th-add-dis 挂上）',
    f.shotsFull === true && /th-add-dis/.test(await clsOf('.th-add')), await clsOf('.th-add'))
  const before9 = (await page.data()).previewImages.length
  const calls9 = await mp.evaluate(() => wx.__chooseCalls)
  await (await page.$('.th-add')).tap()
  await sleep(1200)
  const after9 = (await page.data()).previewImages.length
  const calls9b = await mp.evaluate(() => wx.__chooseCalls)
  const route9 = await mp.evaluate(() => getCurrentPages().slice(-1)[0].route)
  ck('F9 满了还点 ➕：不开系统选择器、张数不变（挡在门口 + 一句吐司）',
    after9 === before9 && calls9b === calls9 && route9 === 'pages/create/create',
    `${before9} → ${after9} 张｜chooseMedia 被叫 ${calls9b - calls9} 次 @ ${route9}`)
  await mp.screenshot({ path: `${OUT}/F-满9张点加号.png` })
  await (await page.$('.th-x')).tap()
  await sleep(900)
  f = await page.data()
  ck('F10 删掉一张就退回 8 张，➕ 不再灰',
    f.previewImages.length === 8 && f.shotsFull === false && !/th-add-dis/.test(await clsOf('.th-add')),
    `${f.previewImages.length} 张`)
  ck('F11 序号跟着重排（第一枚还是 1）', (await txtOf('.th-no')) === '1', await txtOf('.th-no'))
  await mp.evaluate(() => {
    if (wx.__rawChoose) { wx.chooseMedia = wx.__rawChoose; delete wx.__rawChoose; delete wx.__shots }
  })

  // ---------- G 收起与忙态 ----------
  await top()
  await set({ previewImages: [], writeBody: '', urlInput: '' })
  await call('_sync')
  await sleep(700)
  await (await page.$('.title-row')).tap()
  await sleep(900)
  d = await page.data()
  ck('G1 点空白收回去：面板没了、条回来了',
    d.active === '' && (await page.$$('.panel')).length === 0 && (await page.$$('.home-blk')).length === 1, d.active)
  ck('G2 收起之后那三位都归位（不留在上一档的样子）',
    d.panelOpen === false && d.knobRpx === 10 && d.fillPct === 0 && d.done === false,
    `open=${d.panelOpen} knob=${d.knobRpx} fill=${d.fillPct}`)
  await openEntry()
  await set({ busy: 'url' })
  await (await page.$('.title-row')).tap()
  await sleep(700)
  d = await page.data()
  ck('G3 忙的时候点空白不收（别把进度藏起来）', d.active !== '', d.active)
  await set({ busy: '' })
  await call('collapse')
  await sleep(600)

  // ---------- H 英文那一版 ----------
  await top()
  // 走那份共用钉子，不走"直接改 globalData"：10-13 实测这一版会话里 `globalData.userInfo`
  // 根本不存在（探针回 `hasUserInfo:false`），于是原来那句
  // `if (app.globalData.userInfo) … = 'en'` 被自己的守卫挡成**空操作**——
  // 语言一直没换，H1/H2/H3 三条量的是中文，红得像是英文坏了。
  // `尺子语言钉.js` 的 pin 用的是 Object.assign，没有那一格也会造出来，所以真换得动。
  await lang.pin(mp, 'en')
  page = await enter('/pages/create/create')
  await sleep(4000)
  d = await page.data()
  ck('H1 英文左块那句吃的就是字典里那条', d.t.barIdle === I18N.texts('en').barIdle, d.t.barIdle)
  await openEntry()
  const labels = []
  for (const m of await page.$$('.md')) { labels.push(((await m.text()) || '').trim()) }
  ck('H2 三个英文标签：Photo / Link / Text', labels.join('|') === 'Photo|Link|Text', labels.join('|'))
  await (await page.$$('.md'))[1].tap()
  await sleep(900)
  ck('H3 英文那句"右滑开始提炼"在条上', ((await txtOf('.sld-txt')) || '').indexOf('Slide to extract') > -1,
    await txtOf('.sld-txt'))
  // 原来这一条量的是"Tips 与「返回」左右不打架"；行里只剩一枚，打架这件事没有了对象。
  // 换成钉他 10-14 那一句在**英文档**也成立：「Back」整枚在深色面板之上（英文字比中文长，
  // 万一它把那一行顶高、压过墨顶，只有这一档量得出来）。
  const [outR, inkH] = await rects(['.out-r', '.stage-panel'])
  ck('H4 英文那枚「Back」整枚在深色面板之上（抬到暗面板上面，英文档同样成立）',
    !!outR && !!inkH && (outR.top + outR.h) < inkH.top,
    outR && inkH ? `行底 ${Math.round(outR.bottom)}／墨顶 ${Math.round(inkH.top)}` : '量不到')
  const sldTxt = (await rects(['.sld-txt']))[0]
  const sldBox = (await rects(['.sld']))[0]
  ck('H5 英文那句放得进条里（不溢出轨道）',
    !!sldTxt && !!sldBox && sldTxt.left >= sldBox.left && sldTxt.right <= sldBox.right,
    sldTxt && sldBox && `字 ${Math.round(sldTxt.w)}px／轨道 ${Math.round(sldBox.w)}px`)
  /* H6 10-16 说明那句从 18rpx 抬到与「返回」同档（24rpx）——英文那侧字比中文长，
     这一档抬上去到底放不放得下，静态那把按 0.5em 折算是**估**，这一条量的是屏上真渲染：
     ① 读出来就是字典那一枚（没被省略号吃掉），② 它的右沿不超过「返回」的左沿（超了就是折行/挤出）。 */
  const hintEN = await txtOf('.wr-sw-hint')
  const hintR = (await rects(['.wr-sw-hint']))[0]
  ck('H6 英文那一档说明那句读得全、且不与「Back」打架（抬到同字号之后真量一次）',
    hintEN === d.t.translateOn && !/…$/.test(hintEN || '') && !!hintR && !!outR && hintR.right <= outR.left + 1,
    `读到的「${hintEN}」／字典「${d.t.translateOn}」／说明右 ${hintR && hintR.right.toFixed(1)}／Back 左 ${outR && outR.left.toFixed(1)}`)
  await mp.screenshot({ path: `${OUT}/H-英文链接档.png` })
  // 这里原来还有一句"改回 zh"的守卫式赋值（同上，空操作）。收尾本来就有
  // `lang.pin(mp, langBefore)` 把进来时那一档还回去，不需要第二个人做同一件事。

  await lang.pin(mp, langBefore)
  /* ---------- P 照片那一档第三枚「粘贴」（站长 10-16 原话「照片第三个按钮，改为"粘贴"从剪贴板
     粘贴图片，如果非图片，就直接跳转到链接，或者文字」）----------
     放在最后、且在语言还回去之后：这一节要重新进页面、要改 `wx.getClipboardData`，
     夹在中间会把后面几节的"零张照片态"顶掉。
     ⚠ 不拿真系统剪贴板测：一把尺子每跑一趟就把站长按过的东西换掉一次，那是副作用不是取证。
       替身按 F 节 `chooseMedia` 那一套路写（success 与 complete 都发完，只发一条是假绿），
       三种回话各钉一次：文本＝像链接的串、文本＝不像链接的串、不回话（图片那一型的实测形状：
       两个回调六秒零回话，所以这一型只能靠超时那一条认）。 */
  await mp.evaluate(() => {
    if (wx.__rawPaste) return
    wx.__rawPaste = wx.getClipboardData
    wx.__pasteData = ''
    wx.__pasteMode = 'ok'
    wx.getClipboardData = (o) => {
      if (wx.__pasteMode === 'silent') return
      if (wx.__pasteMode === 'fail') {
        const e = { errMsg: 'getClipboardData:fail mock' }
        if (o.fail) o.fail(e)
        if (o.complete) o.complete(e)
        return
      }
      const res = { errMsg: 'getClipboardData:ok', data: wx.__pasteData }
      if (o.success) o.success(res)
      if (o.complete) o.complete(res)
    }
  })
  page = await enter('/pages/create/create')
  await sleep(4000)
  await top()
  await openEntry()
  const pasteMini = (await page.$$('.mini'))[1]
  ck('P0 替身挂上了、且照片那一档那三枚圈在屏上（第三枚就是要点的那一枚）',
    !!pasteMini && (await page.$$('.crow .mini')).length === 2)
  const LINK_PROBE = 'https://mp.weixin.qq.com/s/pasteProbe'
  await mp.evaluate((s) => { wx.__pasteMode = 'ok'; wx.__pasteData = s }, LINK_PROBE)
  await pasteMini.tap()
  await sleep(900)
  d = await page.data()
  ck('P1 剪贴板里是链接 → 跳到「链接」那一档，串填进框、且判成合法（不是只切了档没带东西）',
    d.active === 'url' && d.urlInput === LINK_PROBE && d.urlHint === 'ok' && !d.hintLine,
    `档 ${d.active}／框「${d.urlInput}」／hint ${d.urlHint}／气泡「${d.hintLine || '无'}」`)
  await top()
  await (await page.$$('.md'))[0].tap()
  await sleep(700)
  const TEXT_PROBE = '一句不像链接的中文'
  await mp.evaluate((s) => { wx.__pasteMode = 'ok'; wx.__pasteData = s }, TEXT_PROBE)
  await (await page.$$('.crow .mini'))[1].tap()
  await sleep(900)
  d = await page.data()
  ck('P2 剪贴板里是别的文字 → 跳到「文字」那一档，且原文框里真有这句',
    d.active === 'write' && String(d.writeBody || '').includes(TEXT_PROBE) && !d.hintLine,
    `档 ${d.active}／原文「${String(d.writeBody || '').slice(0, 24)}」`)
  await top()
  await (await page.$$('.md'))[0].tap()
  await sleep(700)
  await mp.evaluate(() => { wx.__pasteMode = 'silent' })
  await (await page.$$('.crow .mini'))[1].tap()
  await sleep(WAIT_PASTE_MS + 900)
  d = await page.data()
  ck('P3 不回话那一型（图片就是这样）：超时那条把话说出来，不许按下去静默',
    d.hintLine === d.t.pasteNoText, `气泡「${d.hintLine || '空'}」／该「${d.t.pasteNoText}」`)
  await top()
  await mp.evaluate(() => { wx.__pasteMode = 'fail' })
  await (await page.$$('.crow .mini'))[1].tap()
  await sleep(900)
  d = await page.data()
  ck('P4 fail 那一型单独一句（与"读不出文字"不是一件事，也不许多等那 1.5 秒）',
    d.hintLine === d.t.pasteReadFail, `气泡「${d.hintLine || '空'}」／该「${d.t.pasteReadFail}」`)
  await mp.evaluate(() => {
    if (wx.__rawPaste) { wx.getClipboardData = wx.__rawPaste; delete wx.__rawPaste }
  })
  await mp.screenshot({ path: `${OUT}/P-粘贴那一枚.png` })
  await mp.close()
  console.log(bad.length ? `\n失败 ${bad.length} 条：\n  ✗ ` + bad.join('\n  ✗ ') : '\n真跑全过')
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
