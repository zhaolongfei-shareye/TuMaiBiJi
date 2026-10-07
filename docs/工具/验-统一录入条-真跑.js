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

  // ---------- A 收起态：还是那一条纸白胶囊 ----------
  await top()
  let d = await page.data()
  ck('A1 收起态没有面板', (await page.$$('.panel')).length === 0)
  ck('A2 条身只有一条，且读的是「动动手指」', (await page.$$('.bar')).length === 1 && d.t.barIdle === '动动手指', d.t.barIdle)
  ck('A3 三枚小圆都在', (await page.$$('.bar-dots .dot')).length === 3)
  ck('A4 Tips 那一行在（展开才撤的那一位，此刻该留着）', (await page.$$('.tips')).length === 1)
  const [bar0, wrap0, tip0] = await rects(['.bar', '.entry-wrap', '.tips'])
  ck('A5 横条一动不动：条顶 == 整组顶（Tips 那盒子被负 margin 抵干净）',
    !!bar0 && !!wrap0 && Math.abs(bar0.top - wrap0.top) <= 1,
    bar0 && wrap0 && `条顶 ${Math.round(bar0.top)}／组顶 ${Math.round(wrap0.top)}`)
  ck('A6 条高 128rpx', !!bar0 && rpxEq(bar0.h, 128), bar0 && `${toRpx(bar0.h).toFixed(1)}rpx`)
  ck('A7 条底落在底栏上方一条缝上（110 那行换背景 + 22 的间距）',
    !!bar0 && Math.abs(bar0.bottom - (tabTop - 110 * R - 22 * R)) < 14,
    bar0 && `条底 ${Math.round(bar0.bottom)}｜应在 ${Math.round(tabTop - 132 * R)} 上下`)
  ck('A8 换背景那一行在', (await page.$$('.home-swap')).length === 1)
  await mp.screenshot({ path: `${OUT}/A-收起态.png` })

  // ---------- B 展开 · 照片档：三枚圈 ----------
  await top()
  await (await page.$('.bar')).tap()
  await sleep(900)
  d = await page.data()
  ck('B1 点条身进「照片」（10-08 起默认档不再是直接写）', d.active === 'photo', d.active)
  const [panel1, out1] = await rects(['.panel', '.out'])
  ck('B2 面板高 500rpx', !!panel1 && rpxEq(panel1.h, 500, 3), panel1 && `${toRpx(panel1.h).toFixed(1)}rpx`)
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
  ck('B6 左边那句是「选择记录模式」，右边那句是「点空白处收起」',
    (await txtOf('.out-l')) === '选择记录模式' && (await txtOf('.out-r')) === '点空白处收起',
    `${await txtOf('.out-l')} | ${await txtOf('.out-r')}`)
  const mds = await page.$$('.md')
  ck('B7 三个标签（相册并进照片了）', mds.length === 3, mds.length)
  ck('B8 当前标签是照片', /(^|\s)md on(\s|$)/.test(await clsOf('.md')) && (await txtOf('.md.on')) === '照片', await txtOf('.md.on'))
  ck('B9 这一态没有滑动条（没图就没得提炼）', (await page.$$('.sld')).length === 0)
  const [crow, shut, miniA, miniB] = await rects(['.crow', '.shut', '.mini', '.card'])
  ck('B10 三枚圈都在：快门 210rpx、两枚小圆 105rpx',
    !!shut && rpxEq(shut.w, 210, 3) && Math.abs(toRpx((await rects(['.mini-c']))[0].w) - 105) <= 3,
    shut && `快门 ${toRpx(shut.w).toFixed(1)}rpx`)
  ck('B11 那一排居中（crow 中心 == 卡中心，左右偏差不超过 3rpx）',
    !!crow && !!miniB && Math.abs((crow.left + crow.w / 2) - (miniB.left + miniB.w / 2)) <= 3,
    crow && miniB && `排中心 ${Math.round(crow.left + crow.w / 2)}｜卡中心 ${Math.round(miniB.left + miniB.w / 2)}`)
  ck('B12 快门那一圈是纸白的环（border 读得出、且就是 --cp-ink 那一支）',
    (await (await page.$('.shut')).style('border-top-color')) === 'rgb(242, 239, 233)',
    await (await page.$('.shut')).style('border-top-color'))
  ck('B13 三枚圈各带一个字：相册 / 拍照 / 链接',
    (await txtOf('.mini-lb')) === '相册' && (await txtOf('.shut-lb')) === '拍照'
    && (await page.$$('.mini-lb'))[1] && (await (await page.$$('.mini-lb'))[1].text()) === '链接',
    `${await txtOf('.mini-lb')} / ${await txtOf('.shut-lb')}`)
  ck('B14 这一态没有多余的提示词行（拍照下面那句撤了）',
    (await page.$$('.entry-desc')).length === 0 && (await page.$$('.note')).length === 0)
  await mp.screenshot({ path: `${OUT}/B-照片三枚圈.png` })

  // ---------- C 链接档：一个框 + 一枚条 ----------
  await top()
  await (await page.$$('.md'))[1].tap()
  await sleep(900)
  d = await page.data()
  ck('C1 切到链接', d.active === 'url', d.active)
  const [field1, sld1] = await rects(['.field', '.sld'])
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
  ck('C8 框与条之间有缝、框不贴面板上沿（两档 auto 边距真的分到了地方）',
    !!field1 && !!sld1 && sld1.top - field1.bottom >= 8 * R && field1.top - (await rects(['.card']))[0].top >= 8 * R,
    field1 && sld1 && `框底到条顶 ${toRpx(sld1.top - field1.bottom).toFixed(1)}rpx`)
  ck('C9 链接档没有归类那一格、没有粘贴按钮', (await page.$$('.wr-cat-face')).length === 0 && !/pasteUrl/.test(JSON.stringify(d)))

  await (await page.$('.field-input')).input('not a link')
  await sleep(700)
  d = await page.data()
  ck('C10 非法链接：urlHint 走 bad，且那句规则行当场就说出来（不必等滑到底）',
    d.urlHint === 'bad' && d.hintLine === d.t.linkRule && (await page.$$('.out-err')).length === 1,
    `hint=${d.hintLine}`)
  const [err1] = await rects(['.out-err'])
  ck('C11 那句报错把整组往上顶了一行，而面板高度没变（还是 500）',
    !!err1 && err1.bottom <= panel1.top + 1 && rpxEq((await rects(['.panel']))[0].h, 500, 3),
    err1 && `报错底 ${Math.round(err1.bottom)}／面板顶 ${Math.round(panel1.top)}`)
  await mp.screenshot({ path: `${OUT}/C-链接-非法报错在框外.png` })

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
  await drag()
  d = await page.data()
  ck('D1 空着拖到底：不提交，但把话说了（沿用"灰按钮被点也要给话"那条规矩）',
    !d.busy && !!d.errLine && d.knobRpx === 10, `busy=${d.busy} err=${d.errLine} knob=${d.knobRpx}`)

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
  ck('D4 圆停在最右那一格 456rpx、且颜色没变（class 里没有一档改色）',
    dD.knobRpx === 456 && !/sld-done|sld-off/.test(await clsOf('.sld')),
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
    !!knobDone && Math.abs(knobDone.left - ((await rects(['.sld']))[0].left + (456 + 5) * R)) <= 3 * R,
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
  await (await page.$('.bar')).tap()
  await sleep(700)
  await (await page.$$('.md'))[2].tap()
  await sleep(900)
  d = await page.data()
  ck('E1 切到文字', d.active === 'write' && d.panelOpen === false, `${d.active}/${d.panelOpen}`)
  const ta = await page.$('.field-area')
  ck('E2 只有一个原文框（标题格撤了、这一档连 input 都没有），提示词吃 manualDesc',
    !!ta && (await ta.property('placeholder')) === d.t.manualDesc && (await page.$$('input')).length === 0,
    `${await (await page.$('.field-area')).property('placeholder')} vs ${d.t.manualDesc}`)
  ck('E3 收起那一档这个框是一行（105rpx）', rpxEq((await rects(['.field-area']))[0].h, 105, 3),
    `${toRpx((await rects(['.field-area']))[0].h).toFixed(1)}rpx`)
  // ⚠️ 这里用 trigger('focus') 而不是 tap()：模拟器里 tap 一枚原生 <textarea> **不会**把焦点落上去
  //（实测 bodyFocus 一直是 false，E4/E5/E6 三条连着红，而面板高度那条量出来是 500 没错）。
  // trigger 走的是 bind 事件那条通道，证的正是"焦点这一位接上了没"——真机上键盘起来必然发 focus，
  // 那是平台行为，不在这一把的责任范围。
  await ta.trigger('focus')
  await sleep(900)
  d = await page.data()
  ck('E4 焦点进框里 → 面板抬到展开那一档（580rpx，只多一行）',
    d.bodyFocus === true && d.panelOpen === true && rpxEq((await rects(['.panel']))[0].h, 580, 4),
    `focus=${d.bodyFocus} open=${d.panelOpen} 高 ${toRpx((await rects(['.panel']))[0].h).toFixed(1)}rpx`)
  ck('E5 框跟着变成两行（160rpx）', rpxEq((await rects(['.field-area']))[0].h, 160, 4),
    `${toRpx((await rects(['.field-area']))[0].h).toFixed(1)}rpx`)
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
    && rpxEq((await rects(['.panel']))[0].h, 500, 4), `${d.panelOpen}`)

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
  ck('F1 四张 + ➕ 仍在同一行（5 格装得下），面板还是 500',
    f.panelOpen === false && n4 === 5
    && rpxEq((await rects(['.panel']))[0].h, 500, 4), `${n4} 格 / open=${f.panelOpen} / active=${f.active}`)
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
  ck('F5 第六格放不下 → 自己多一行，面板到 580 为止',
    f.panelOpen === true && rpxEq((await rects(['.panel']))[0].h, 580, 4), `open=${f.panelOpen}`)
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
    d.active === '' && (await page.$$('.panel')).length === 0 && (await page.$$('.bar')).length === 1, d.active)
  ck('G2 收起之后那三位都归位（不留在上一档的样子）',
    d.panelOpen === false && d.knobRpx === 10 && d.fillPct === 0 && d.done === false,
    `open=${d.panelOpen} knob=${d.knobRpx} fill=${d.fillPct}`)
  await (await page.$('.bar')).tap()
  await sleep(700)
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
  ck('H1 英文条身吃的就是字典里那条', d.t.barIdle === I18N.texts('en').barIdle, d.t.barIdle)
  await (await page.$('.bar')).tap()
  await sleep(900)
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
