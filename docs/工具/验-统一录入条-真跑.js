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
// 面板两档与快门那一枚的边长也从源码现读：10-08 那轮 700→500/580、10-10 那轮 →410/490 且快门
// 210→180，两次都是判据里抄的数跟着红。环那一支同理——它 10-10 从纸白换成了 palette 算出来的
// `--cp-ring`，判据要跟着换就得现读，不然下一轮换皮又是一次全红。
const CWX = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/create/create.wxss'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
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
  const metric = await mp.evaluate(() => {
    const i = wx.getSystemInfoSync()
    return { w: i.windowWidth, h: i.windowHeight }
  })
  const R = metric.w / 750                       // 1rpx 等于多少 px
  const toRpx = (px) => px / R
  const rpxEq = (px, want, tol = 2) => Math.abs(toRpx(px) - want) <= tol
  const tabTop = metric.h - 128 * R              // 底栏顶边（bottom 20 + 高 108）
  const styleOf = async (sel) => { const el = await page.$(sel); return el ? await el.style('background-color') : null }
  const clsOf = async (sel) => { const el = await page.$(sel); return el ? ((await el.attribute('class')) || '') : '' }
  const txtOf = async (sel) => { const el = await page.$(sel); return el ? ((await el.text()) || '').trim() : null }

  // ---------- A 收起态：2.2 B 方案那一组（左块两片皮＋右列 Tips/圆 ➕，整组只有那一行 410） ----------
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
  // A8 钉两件事：那一行只一枚（`wx:if="{{bgSrc}}"`，默认那张形象图在就该有一枚），
  // 以及它此刻量在整组**上方**——站长 10-09 那句"换到日期下方"就是这个先后。
  const swapBox = (await rects(['.home-swap']))[0]
  ck('A8 那一行只一枚，且量到它坐在整组上方（搬去的位置就是那儿）',
    (await page.$$('.home-swap')).length === 1 && !!swapBox && !!blk0 && swapBox.bottom <= blk0.top + 1,
    swapBox && blk0 && `行底 ${Math.round(swapBox.bottom)}／组顶 ${Math.round(blk0.top)}`)
  await mp.screenshot({ path: `${OUT}/A-收起态.png` })

  // ---------- B 展开 · 照片档：三枚圈 ----------
  await top()
  await (await page.$('.blk-person')).tap()
  await sleep(1200)
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
  /* 框外那一行 10-10 深夜换了两头（他原话「"选择记录模式"改为 Tips，"点空白处收起"改为"返回"」）。
     两边都拿这一页自己那份字典比，不抄第二份中文——上一版这里写的就是那句死字符串。 */
  const outLTxt = await txtOf('.out-l')
  const tipList = d.t.tips || []
  ck('B6 左边那句是 Tips 那一串（前缀＋六句里的一句），右边那枚是字典里的「返回」',
    tipList.some((x) => outLTxt === `${d.t.tipsPrefix}${x}`) && (await txtOf('.out-r')) === d.t.back,
    `${outLTxt} | ${await txtOf('.out-r')}`)
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
  ck('B13 三枚圈各带一个字：相册 / 拍照 / 链接',
    (await txtOf('.mini-lb')) === '相册' && (await txtOf('.shut-lb')) === '拍照'
    && (await page.$$('.mini-lb'))[1] && (await (await page.$$('.mini-lb'))[1].text()) === '链接',
    `${await txtOf('.mini-lb')} / ${await txtOf('.shut-lb')}`)
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
  ck('C4 条高 110rpx、外圈那圈白边 5rpx',
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
  ck('D3 拖到底 → 真的进忙态（busy=url）', dD.busy === 'url', dD.busy)
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
  ck('D8 完成那一帧整条转实心、白环仍然在', /sld-done/.test(await clsOf('.sld')) && !!dDone, await clsOf('.sld'))
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
  await (await page.$('.blk-person')).tap()
  await sleep(1200)
  await (await page.$$('.md'))[2].tap()
  await sleep(900)
  d = await page.data()
  ck('E1 切到文字', d.active === 'write' && d.panelOpen === false, `${d.active}/${d.panelOpen}`)
  const ta = await page.$('.field-area')
  ck('E2 只有一个原文框（标题格撤了、这一档连 input 都没有），提示词吃 manualDesc',
    !!ta && (await ta.property('placeholder')) === d.t.manualDesc && (await page.$$('input')).length === 0,
    `${await (await page.$('.field-area')).property('placeholder')} vs ${d.t.manualDesc}`)
  /* 这一格 10-10 深夜多包了一层壳（textarea 装不下子节点，粘贴钮只能做兄弟），所以两头都要量：
     壳是屏上那个带皮的盒子（105/160），框是壳里面写字的那一层（扣掉壳那 3rpx 边框）。
     框只写 `height:100%` ＋ 上内边距而没写 box-sizing 的话，读数会是 129/184 —— 字掉到圆角外面，
     静态读源码一条都看不出来，只有在这里量渲染才抓得住。 */
  const [shell3, ta3] = await rects(['.field-write', '.field-area'])
  ck('E3 收起那一档这一格是一行（壳 105rpx，写字那一层 99rpx）',
    !!shell3 && rpxEq(shell3.h, 105, 3) && !!ta3 && rpxEq(ta3.h, 99, 3),
    `壳 ${shell3 && toRpx(shell3.h).toFixed(1)}／框 ${ta3 && toRpx(ta3.h).toFixed(1)}rpx`)
  /* ⑨ 文字档也要有粘贴钮，且与链接档一致——不只数节点：真往剪贴板塞一句话，点那枚钮，看进没进框。
     （数节点的判据抓不到"钮在、但读的是别的键"，那正是链接档原来那个 bug 的形状。） */
  await mp.evaluate(() => { wx.setClipboardData({ data: '验收用的那一句' }) })
  await sleep(500)
  const pasteBtn = await page.$('.field-write .field-paste')
  ck('E3b 文字档那格有粘贴钮（在格子里，与链接档同一个类名）', !!pasteBtn)
  if (pasteBtn) {
    const bodyBefore = (await page.data()).writeBody || ''
    await pasteBtn.tap()
    await sleep(700)
    const bodyAfter = (await page.data()).writeBody || ''
    ck('E3c 点一下真把剪贴板那句话接进框里（框里原来有字也不许把旧的顶掉）',
      /验收用的那一句/.test(bodyAfter) && bodyAfter.length > bodyBefore.length,
      `前 ${JSON.stringify(bodyBefore)} → 后 ${JSON.stringify(bodyAfter)}`)
    const bubAfter = await page.$$('.hint-bubble')
    ck('E3d 接进去了就不许再报"还没有内容"（那枚气泡不能因为粘贴而亮着）',
      bubAfter.length === 0 && !(await page.data()).hintLine, `${bubAfter.length} 枚`)
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
  ck('E5 壳跟着变成两行（160rpx，写在壳身上；写字那一层 154）',
    !!shell5 && rpxEq(shell5.h, 160, 4) && !!ta5 && rpxEq(ta5.h, 154, 4),
    `壳 ${shell5 && toRpx(shell5.h).toFixed(1)}／框 ${ta5 && toRpx(ta5.h).toFixed(1)}rpx`)
  ck('E6 「原文翻译」那枚开关在展开态出现，默认关',
    (await page.$$('.wr-sw')).length === 1 && d.writeTranslate === false)
  await mp.screenshot({ path: `${OUT}/E-文字-展开两行.png` })
  await (await page.$('.wr-sw')).tap()
  await sleep(700)
  d = await page.data()
  ck('E7 点开关只翻这一位，面板不收、不提交',
    d.writeTranslate === true && d.active === 'write' && !d.busy && (await page.$$('.panel')).length === 1,
    `${d.writeTranslate}/${d.active}/${d.busy}`)
  const offT = await styleOf('.wr-sw-track')
  await (await page.$('.wr-sw')).tap()
  await sleep(700)
  const onT = await styleOf('.wr-sw-track')
  ck('E8 开与关那一面换了色（两态看得出来）', !!offT && !!onT && offT !== onT, `${offT} → ${onT}`)
  await (await page.$('.field-area')).trigger('blur')
  await sleep(800)
  d = await page.data()
  ck('E9 离开焦点退回收起那一档，开关跟着撤',
    d.panelOpen === false && (await page.$$('.wr-sw')).length === 0
    && rpxEq((await rects(['.panel']))[0].h, PANEL_H, 4), `${d.panelOpen}`)

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
    !!th4[4] && !!cardR && Math.abs(th4[4].right - cardR.right + 33 * R) <= 6 * R,
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
    && !!cardR6 && Math.abs(th6[6].right - cardR6.right + 33 * R) <= 6 * R,
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
  await (await page.$('.blk-person')).tap()
  await sleep(1200)
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
  await mp.evaluate(() => {
    const app = getApp()
    if (app.globalData.userInfo) app.globalData.userInfo.language = 'en'
  })
  page = await enter('/pages/create/create')
  await sleep(4000)
  d = await page.data()
  ck('H1 英文左块那句吃的就是字典里那条', d.t.barIdle === I18N.texts('en').barIdle, d.t.barIdle)
  await (await page.$('.blk-person')).tap()
  await sleep(1200)
  const labels = []
  for (const m of await page.$$('.md')) { labels.push(((await m.text()) || '').trim()) }
  ck('H2 三个英文标签：Photo / Link / Text', labels.join('|') === 'Photo|Link|Text', labels.join('|'))
  await (await page.$$('.md'))[1].tap()
  await sleep(900)
  ck('H3 英文那句"右滑开始提炼"在条上', ((await txtOf('.sld-txt')) || '').indexOf('Slide to extract') > -1,
    await txtOf('.sld-txt'))
  const [outL, outR] = await rects(['.out-l', '.out-r'])
  ck('H4 框外那两枚英文不打架（左右之间还有缝）',
    !!outL && !!outR && outR.left - outL.right >= 0, outL && outR && `缝 ${Math.round(outR.left - outL.right)}px`)
  const sldTxt = (await rects(['.sld-txt']))[0]
  const sldBox = (await rects(['.sld']))[0]
  ck('H5 英文那句放得进条里（不溢出轨道）',
    !!sldTxt && !!sldBox && sldTxt.left >= sldBox.left && sldTxt.right <= sldBox.right,
    sldTxt && sldBox && `字 ${Math.round(sldTxt.w)}px／轨道 ${Math.round(sldBox.w)}px`)
  await mp.screenshot({ path: `${OUT}/H-英文链接档.png` })
  await mp.evaluate(() => {
    const app = getApp()
    if (app.globalData.userInfo) app.globalData.userInfo.language = 'zh'
  })

  await lang.pin(mp, langBefore)
  await mp.close()
  console.log(bad.length ? `\n失败 ${bad.length} 条：\n  ✗ ` + bad.join('\n  ✗ ') : '\n真跑全过')
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
