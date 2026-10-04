// 录入面板贴底 + 四屏等高的真跑自证：在模拟器里真量渲染后的几何，不看 CSS 声明。
// 静态尺子能证明"规则写了"，证不了"fixed 之后它真的落在底栏上方、四屏真的一样高、
// 内容没被 flex 压扁"——这三件事恰好是这一批的全部风险，所以全部量视图层算出来的值。
// 前置：微信开发者工具已开；改过 WXSS 要先 cli close 再 cli auto --auto-port 9431。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-录入面板沉底-真跑.js
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const i18n = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))
const OUT = path.resolve(__dirname, '../design/录入面板沉底/实测')
const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)

const wxss = fs.readFileSync(P('pages/create/create.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const barWxss = fs.readFileSync(P('custom-tab-bar/index.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const appWxss = fs.readFileSync(P('app.wxss'), 'utf8')
// 期望值全部从源码现读，探针里不抄第二份表
const PANEL_H = Number(/(?:^|\n)\.panel\s*\{[^}]*height:\s*(\d+)rpx/.exec(wxss)[1])
const DOCK_BOTTOM = Number(/(?:^|\n)\.container\.entry-dock \.entry-wrap\s*\{[^}]*bottom:\s*(\d+)rpx/.exec(wxss)[1])
const INSET = Number(/--sp-3:\s*(\d+)rpx/.exec(appWxss)[1])
const BAR_TOP_GAP = Number(/bottom:\s*(\d+)rpx/.exec(barWxss)[1])
  + Number(/\.tab-bar\s*\{[\s\S]*?height:\s*(\d+)rpx/.exec(barWxss)[1])

// 报错行用真串：从 i18n 里挑这一屏真会显示的那几条中最长的一条，不自己造一句话
const ERR_KEYS = ['taskTimeout', 'pasteEmpty', 'permCamera', 'permAlbum', 'pickFailed', 'needTitle', 'taskFailed', 'taskTimeout']
const longestErr = (lang) => ERR_KEYS.map((k) => i18n.t(k, lang)).reduce((a, b) => (b.length > a.length ? b : a), '')

const bad = []
const ck = (name, cond, got) => {
  console.log(`${cond ? '✓' : '✗'} ${name}${got === undefined ? '' : `　→ ${got}`}`)
  if (!cond) bad.push(name)
}
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  const win = await mp.systemInfo()
  const rpx = (v) => (v * win.windowWidth) / 750
  const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1.5 : tol)
  // 冷启动那一档要重试：跑尺子.sh 里 `cli auto` 之后只等 45 秒，模拟器这时可能还没把
  // 首页渲染出来。原来这里一把 `reLaunch` 就往下走，`.panel` 读到 null，第一条判据
  // 直接 TypeError 把整把尺子带崩（10-01 就是这么红了一次，重跑立刻全绿——那是连接红，
  // 不是回归）。别处那把尺子都有这个 for 重试，这里补上同一个姿势。
  let page
  for (let i = 0; i < 6; i++) {
    try {
      page = await mp.reLaunch('/pages/create/create')
      await sleep(1400)
      if (await page.$('.bar')) break
      page = null
    } catch (e) { page = null }
    await sleep(3000)
  }
  if (!page) { console.log('✗ 进不了 /pages/create/create（模拟器没渲染出来），重跑一次'); process.exit(1) }

  const geo = async (sel) => {
    const el = await page.$(sel)
    if (!el) return null
    const s = await el.size()
    const o = await el.offset()
    return { w: s.width, h: s.height, left: o.left, top: o.top, bottom: o.top + s.height, right: o.left + s.width }
  }

  for (const lang of ['zh', 'en']) {
    await page.setData({
      lang,
      t: i18n.texts(lang),
      shotDesc: i18n.t('albumDesc', lang),
      writeTitle: '',
      writeBody: '',
      urlInput: '',
      urlHint: 'idle',
    })
    const cases = [
      ['write', 'write', '直接写'],
      ['shot', 'camera', '拍照'],
      ['shot', 'album', '相册'],
      ['url', 'url', '链接'],
    ]
    for (const [active, mode, label] of cases) {
      await page.setData({
        active,
        mode,
        lead: mode,
        previewImages: active === 'shot'
          ? ['/assets/share-card.jpg', '/assets/share-card.jpg', '/assets/share-card.jpg'] : [],
        errLine: '',
      })
      await sleep(280)
      // 整份字典一次换掉（中英两态各一次）之后，视图层那一拍偶尔比 280ms 慢，`.panel`
      // 会读成 null。这里只重读节点、不改页面状态——读到 null 报 ✗ 并跳过这一档，
      // 而不是抛 TypeError 把后面几十条一起带崩（那是时序红，不是回归）。
      let panel = await geo('.panel')
      for (let i = 0; i < 6 && !panel; i++) { await sleep(300); panel = await geo('.panel') }
      const bar = await geo('.bar')
      const tag = `${lang} ${label}`
      if (!panel || !bar) {
        ck(`${tag}：面板与条身都读得到`, false, `panel=${!!panel} bar=${!!bar}`)
        continue
      }
      ck(`${tag}：面板高 = 源码那个数（${PANEL_H}rpx）`,
        near(panel.h, rpx(PANEL_H)), `${(panel.h * 750 / win.windowWidth).toFixed(1)}rpx`)
      ck(`${tag}：面板底边落在底栏上方那条缝上`,
        near(panel.bottom, win.windowHeight - rpx(DOCK_BOTTOM)),
        `距屏底 ${((win.windowHeight - panel.bottom) * 750 / win.windowWidth).toFixed(1)}rpx，底栏占 ${BAR_TOP_GAP}rpx`)
      ck(`${tag}：左右内缩等于 --sp-3，和收起态那条胶囊同宽`,
        near(panel.left, rpx(INSET)) && near(panel.w, win.windowWidth - 2 * rpx(INSET)),
        `左 ${(panel.left * 750 / win.windowWidth).toFixed(1)}rpx 宽 ${(panel.w * 750 / win.windowWidth).toFixed(1)}rpx`)
      ck(`${tag}：条身下沿与面板上沿无缝`, near(bar.bottom, panel.top),
        `差 ${((panel.top - bar.bottom) * 750 / win.windowWidth).toFixed(2)}rpx`)
      // 换背景那一行是 wx:if="{{bgSrc}}" 才存在的：没铺图时它本来就不在树里，也算通过。
      const swap = await page.$('.home-swap')
      ck(`${tag}：展开时「换背景」那一行不显示`,
        swap === null || (await swap.style('display')) === 'none')
      // "别挡住上部"翻成一条不碰坐标系的判据：整块（条身 + 面板）占掉的屏高不超过六成，
      // 上面那四成留给标题和照片。流内元素的 offset() 给的是文档坐标、fixed 给的是视口坐标，
      // 拿两者相减比上下沿是把两把尺子混着用，量出来对不上也不代表界面错了。
      const block = panel.h + bar.h
      ck(`${tag}：整块不超过屏高六成，上半屏仍露着`,
        block <= win.windowHeight * 0.6,
        `占 ${(block * 100 / win.windowHeight).toFixed(1)}% 屏高`)

      // 三步指引该不该在，取决于"这一档此刻有没有东西要填"：链接档空着→在；
      // 相册档这里铺了 3 张缩略图、直接写档本来就顶满→都不在。
      const gNow = await geo('.guide')
      ck(`${tag}：指引只在空着的那档出现`, (!!gNow) === (active === 'url'), gNow ? '有' : '无')

      // 控件没被 flex 压扁、也没被"顺手放大"：这几档高度是令牌定的。
      // 原文区写的是等于 300 而不是不低于——富余按 CSS 规则全被按钮行的 auto 边距吃掉了，
      // 真哪天它自己长高了，说明有人给 body 加了 flex-grow，这条会当场报出来。
      // 180→300：站长 10-04 把归类那一整行（88 + 16 间距）并进标题行，腾出来的还给原文；
      // 同一档里 `.cat-row` 换成了 `.wr-cat-face`（分类那一格，仍是 88 那一档）。
      const want = { '.face-box': 88, '.face-area': 300, '.pk': 164, '.shot-strip': 152, '.wr-cat-face': 88 }
      for (const [sel, hrpx] of Object.entries(want)) {
        const g = await geo(sel)
        if (g) ck(`${tag}：${sel} 仍是 ${hrpx}rpx 高`, near(g.h, rpx(hrpx)), `${(g.h * 750 / win.windowWidth).toFixed(1)}rpx`)
      }
      // 富余的那一段必须留在按钮行"上面"：底部那组（按钮行 + 它下面的提示/报错行）
      // 整体贴到面板内边沿，也就是离面板底正好一个 --sp-4 的内边距。
      // 挂在按钮行上量不行——链接那一屏它下面还压着一行提示，量出来永远是两段距离。
      const footer = []
      for (const sel of ['.acts', '.entry-note', '.entry-err']) {
        const g = await geo(sel)
        if (g) footer.push(g)
      }
      const last = footer.reduce((a, b) => (b.bottom > a.bottom ? b : a))
      const padBottom = Number(/--sp-4:\s*(\d+)rpx/.exec(appWxss)[1])
      ck(`${tag}：底部那组贴着面板内边沿，空出来的位置在按钮行上面`,
        near(panel.bottom - last.bottom, rpx(padBottom), 2),
        `离底 ${((panel.bottom - last.bottom) * 750 / win.windowWidth).toFixed(1)}rpx，内边距 ${padBottom}rpx`)

      // 最坏情况：报错行换成 i18n 里最长的那条真串，看它会不会把按钮行顶出面板
      await page.setData({ errLine: longestErr(lang) })
      await sleep(240)
      const err = await geo('.entry-err')
      const panel2 = await geo('.panel')
      const acts2 = await geo('.acts')
      ck(`${tag}：最长报错串下按钮行仍在面板内`,
        acts2.bottom <= panel2.bottom + 1 && err.bottom <= panel2.bottom + 1,
        `报错行下沿超界 ${((err.bottom - panel2.bottom) * 750 / win.windowWidth).toFixed(1)}rpx`)
      await page.setData({ errLine: '' })

      if (lang === 'zh') {
        await mp.screenshot({ path: path.join(OUT, `实测-贴底-${label}.png`) })
      }
    }

    /* 相册档空态专测：这一步循环里 shot 一直带着 3 张缩略图（那是最坏情况），
       指引真正会出现的"一张都没选"那一屏得单独摆出来量。
       断的是渲染出来的文字——<template is> 不继承页面 data，漏了 data="{{t}}" 时
       方块照样画、几行字全空，只看 .guide 在不在是抓不到这种事的。
       站长 10-01 深夜：三步改四步（种草转存那条），所以这里四句都得在。 */
    await page.setData({ active: 'shot', mode: 'album', lead: 'album', previewImages: [], errLine: '' })
    await sleep(320)
    const gEl = await page.$('.guide')
    const gTxt = gEl ? (await gEl.text()).replace(/\s+/g, '') : ''
    const need = [i18n.t('guide1T', lang), i18n.t('guide2T', lang), i18n.t('guide3T', lang),
      i18n.t('guide4T', lang), i18n.t('guide4D', lang)].map((x) => String(x).replace(/\s+/g, ''))
    ck(`${lang} 相册空态：四步指引在，且四行文字真渲染出来了（不只是小方块）`,
      !!gEl && need.every((x) => gTxt.indexOf(x) >= 0), `${gEl ? '在' : '不在'}｜${gTxt.slice(0, 20)}`)
    const gRows = await page.$$('.gstep')
    ck(`${lang} 指引正好四行（多一行少一行都是改版没跟到）`, gRows.length === 4, gRows.length)
    // 他打的第二处：「方块加 1,2,3 这种风格喧宾夺主，弱化成小黄点」。所以钉的是
    // 那一档里不再有数字方块，只有一枚点；点的颜色吃 palette.TIP_DOT（唯一色源）。
    ck(`${lang} 前面的 1/2/3 方块撤了，换成小黄点`,
      (await page.$$('.gnum')).length === 0 && (await page.$$('.gdot')).length === 4,
      `gnum=${(await page.$$('.gnum')).length} gdot=${(await page.$$('.gdot')).length}`)
    const dotEl = await page.$('.gdot')
    const dotStyle = dotEl ? await dotEl.style('background-color') : ''
    ck('小黄点吃 palette 的那个色（不另起一处色）',
      /rgb\(246,\s*196,\s*69\)/.test(dotStyle), dotStyle)
    // 站长 10-02 真机：这四行"字体太黑太重，喧宾夺主"，要的是"说明用小字、不加黑、
    // 只用不同色阶区分"。所以钉三条：粗体撤了、两半同一档小字、主次只由两档色阶给。
    const META = Number(/--fs-meta:\s*(\d+)rpx/.exec(appWxss)[1])
    const BODY = Number(/--fs-body:\s*(\d+)rpx/.exec(appWxss)[1])
    const tEl = await page.$('.gt-t')
    const dEl = await page.$('.gt-d')
    const rpxOf = (px) => (px * 750) / win.windowWidth
    const tFS = parseFloat(await tEl.style('font-size'))
    const dFS = parseFloat(await dEl.style('font-size'))
    const tFW = Number(await tEl.style('font-weight'))
    ck(`标题那半不再加黑、也降到 --fs-meta（${META} 而不是 ${BODY}），与说明同一档小字`,
      tFW < 600 && Math.abs(rpxOf(tFS) - META) <= 1 && Math.abs(rpxOf(dFS) - META) <= 1,
      `字重 ${tFW} 标题 ${rpxOf(tFS).toFixed(0)} 说明 ${rpxOf(dFS).toFixed(0)}rpx`)
    const tCol = await tEl.style('color')
    const dCol = await dEl.style('color')
    const alphaOf = (s) => { const m = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(s); return m ? Number(m[1]) : 1 }
    ck('主次只由两档色阶给：同一支墨，说明比标题浅一档',
      tCol !== dCol && alphaOf(dCol) < alphaOf(tCol) && alphaOf(tCol) <= 0.8,
      `标题 ${tCol} / 说明 ${dCol}`)
    const g2 = await geo('.guide'); const a2 = await geo('.acts'); const p2 = await geo('.panel')
    ck(`${lang} 相册空态：指引坐在按钮行上面，两样都还在面板里`,
      !!g2 && !!a2 && g2.bottom <= a2.top + 1 && a2.bottom <= p2.bottom + 1,
      `指引底 ${(g2.bottom * 750 / win.windowWidth).toFixed(0)} / 按钮行顶 ${(a2.top * 750 / win.windowWidth).toFixed(0)} / 面板底 ${(p2.bottom * 750 / win.windowWidth).toFixed(0)}rpx`)
    await page.setData({ previewImages: ['/assets/share-card.jpg'] })
    await sleep(320)
    ck(`${lang} 相册选上一张图之后：指引让位，不跟缩略图抢地方`, (await geo('.guide')) === null)

    /* 最坏组合：空态（指引在）+ 最长报错串（多一行）。英文说明每条比中文长一半，
       2026-10-01 审查就是这一格量出英文相册档溢出 40rpx——报错行画到面板外，
       正下方就是底栏。上面主循环那条 shot 用例永远铺 3 张图，测不到这个组合。 */
    const worst = i18n.t('taskTimeout', lang)
    for (const [seg, extra] of [['相册', { mode: 'album', lead: 'album' }], ['链接', { mode: 'url', lead: 'url', urlInput: '' }]]) {
      await page.setData({
        active: seg === '相册' ? 'shot' : 'url', ...extra,
        previewImages: seg === '相册' ? [] : undefined, errLine: worst,
      })
      await sleep(340)
      const g3 = await geo('.guide'); const a3 = await geo('.acts'); const e3 = await geo('.entry-err'); const p3 = await geo('.panel')
      ck(`${lang} ${seg}空态 + 最长报错串：指引、按钮行、报错行全在面板里`,
        !!g3 && !!e3 && e3.bottom <= p3.bottom + 1 && a3.bottom <= p3.bottom + 1,
        `指引 ${(g3 && g3.h * 750 / win.windowWidth).toFixed(0)}rpx　报错底 ${(e3.bottom * 750 / win.windowWidth).toFixed(0)} / 面板底 ${(p3.bottom * 750 / win.windowWidth).toFixed(0)}rpx`)
    }
    await page.setData({ errLine: '' })
  }

  // 收起态：贴底那条规则整个不生效，条子回到流里坐在 62vh 那段留白上。
  // 不量绝对坐标——offset() 对流内元素给的是文档坐标，和 fixed 那套视口坐标不同源，
  // 拿它反推 vh 会把两把尺子混成一把。判据改成"position 不再是 fixed"这一条本身。
  await page.setData({ active: '', mode: 'write', lead: 'pencil', previewImages: [], errLine: '' })
  await sleep(320)
  const wrapPos = await (await page.$('.entry-wrap')).style('position')
  ck('收起态：录入块不再是 fixed（贴底只在展开那一态）', wrapPos !== 'fixed', wrapPos)
  const swap2 = await page.$('.home-swap')
  ck('收起态：换背景那一行回来了',
    swap2 === null || (await swap2.style('display')) !== 'none')
  ck('收起态：三枚小圆回来了', (await page.$$('.dot')).length === 3)
  await mp.screenshot({ path: path.join(OUT, '实测-收起态.png') })

  await mp.close()
  console.log(`${bad.length ? '✗' : '✓'} 录入面板沉底 真跑：${bad.length ? bad.length + ' 条红' : '全绿'}`)
  if (bad.length) bad.forEach((b) => console.log('  ✗ ' + b))
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
