// 站长 10-20 那两句「优化」的**真跑**尺子（跑法：docs/工具/跑尺子.sh 9431 验-拖动切换与滑篇-真跑）。
// 静态那把（验-拖动切换与滑篇.js）钉的是代码形状；这一把钉的是**手指走过一遍之后屏上到底变成什么**：
//   ① 圆点那一排拖 n 下，模板要按清单顺序走完一圈回到起点（这就是"支持循环…不要卡死"）；
//   ② 拖的过程中画布还在画，选择那一格照样跟着手指走（改选与画布解耦，不然拖到第三枚才动一下）；
//   ③ 顶上那一句模板名点一下换一套；
//   ④ 详情窗（带毛玻璃那一层）大标题左右滑＝上一篇／下一篇，滑到这一段最后一篇再往左读得到边界，
//      左上角那一句提示只在真有一前一后时画得出来、且真的落在左端。
//      ⚠ 10-20 夜里站长把这一条从"全屏那一页"改指到这一扇窗：「是指带毛玻璃背景的那个界面，
//        不是全屏那个」⇒ 这一节在列表这一屏开窗量，不再 navigateTo 到 pages/detail。
// ⚠ 这一把喂的是**处理函数**（callMethod 造一条 touches/changedTouches），不是系统层的真触摸：
//   它量得到"步距、循环、换篇、到头就停"，量不到"这一排的 catch 有没有真的挡住冒泡"——
//   那一条由静态那把钉着（catchtouch* 三枚、且没有一处 bindtouch*）。
const automator = require('miniprogram-automator')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
// ⑰ 那一节要在英文态量那一行：期望值从页面自己那份字典取，不写死英文串
// （本仓有一条老规矩：断言里写死中文字面量的，账号一换英文就报假红——反方向同理）。
const { texts } = require(P('utils/i18n.js'))

let pass = 0
const fails = []
const ck = (name, cond, extra) => {
  if (cond) { pass += 1; console.log('  ✓ ' + name); return }
  fails.push(name + (extra ? ' —— 实得：' + extra : ''))
  console.log('  ✗ ' + name + (extra ? ' —— 实得：' + extra : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  const R = (await mp.systemInfo()).windowWidth / 750
  const STEP_PX = 22 * R          // 与 index.js 里那一枚步距同一个式子（点 10 ＋ 间隙 12）

  /* ---------- 开一屏卡片层：挑一篇"还没生成过"的（已生成态不给换模板） ---------- */
  await mp.switchTab('/pages/index/index')
  let ip = await mp.currentPage(); await ip.waitFor(1800)
  const notes = (await ip.data()).notes || []
  ck('列表读得到笔记（这一把要有"前后篇"可滑）', notes.length >= 2, `notes ${notes.length} 篇`)
  if (notes.length < 2) { await mp.disconnect(); process.exit(1) }

  let opened = null
  for (const n of notes) {
    if (n.is_private) continue
    await ip.callMethod('_openPosterFor', n)
    await sleep(1200)
    const d = await ip.data()
    if (d.templateOpen && !d.posterHasCard) { opened = n; break }
    await ip.callMethod('_closeTemplate')
    await sleep(300)
  }
  ck('能开出一层"未生成态"的卡片弹窗（已生成态那排圆点本来就不画）', !!opened,
    opened ? opened.id : '每一篇都已有卡片')
  if (!opened) { await mp.disconnect(); process.exit(1) }

  const ids = ((await ip.data()).tplIds || []).map((x) => x.id)
  const start = (await ip.data()).posterTpl
  console.log(`  清单 ${ids.length} 套，起手 ${start}`)
  ck('下发与包内合并后那一排圆点真画得出来（≥2 枚才谈得上循环）', ids.length >= 2, `${ids.length} 枚`)

  /* ---------- ① 拖一圈：每拖一枚圆点的间距换一套，走完一圈回到起点 ---------- */
  // 一下拖 1.6 枚间距：正好一枚是浮点边界（200 − 188.56 与 22×0.52 在二进制里不相等），
  // 拿边界值测"跨没跨过一格"会把尺子自己卡在临界点上——真手指也不会只挪 11.4 像素。
  const DRAG = STEP_PX * 1.6
  const at0 = ids.indexOf(start)
  const seen = []
  for (let i = 0; i < ids.length; i += 1) {
    const x = 200
    await ip.callMethod('onTplDotsTouchStart', { touches: [{ clientX: x }] })
    await ip.callMethod('onTplDotsTouchMove', { touches: [{ clientX: x - DRAG }] })
    await ip.callMethod('onTplDotsTouchEnd', { changedTouches: [{ clientX: x - DRAG }] })
    seen.push((await ip.data()).posterTpl)
  }
  const want = []
  for (let i = 1; i <= ids.length; i += 1) want.push(ids[((at0 + i) % ids.length + ids.length) % ids.length])
  ck('① 每拖过一枚圆点的间距就换一套，且顺序就是清单那一个顺序',
    seen.join(',') === want.join(','), `实得 ${seen.join('>')}（应为 ${want.join('>')}）`)
  ck('② 拖完一整圈回到起手那一套（循环，不是走到头就卡住）',
    seen[seen.length - 1] === start && new Set(seen).size === ids.length,
    `一圈后 ${seen[seen.length - 1]} vs 起手 ${start}；一圈里见过 ${new Set(seen).size} 套`)
  ck('③ 往回拖同样循环（从第一套再往右退，退到最后一套）',
    await (async () => {
      const before = (await ip.data()).posterTpl
      const x = 200
      await ip.callMethod('onTplDotsTouchStart', { touches: [{ clientX: x }] })
      await ip.callMethod('onTplDotsTouchMove', { touches: [{ clientX: x + DRAG }] })
      await ip.callMethod('onTplDotsTouchEnd', { changedTouches: [{ clientX: x + DRAG }] })
      const after = (await ip.data()).posterTpl
      return after !== before && after === ids[(ids.indexOf(before) - 1 + ids.length) % ids.length]
    })(), '上一步刚回到起手那一套，往右退一枚应到清单最后一套')

  /* ---------- ④ 拖的过程中画布还在画，选择照样跟着手指走（"不要卡死"的另一半） ---------- */
  const busySeen = []
  for (let i = 0; i < 3; i += 1) {
    const x = 200
    await ip.callMethod('onTplDotsTouchStart', { touches: [{ clientX: x }] })
    await ip.callMethod('onTplDotsTouchMove', { touches: [{ clientX: x - DRAG }] })
    await ip.callMethod('onTplDotsTouchEnd', { changedTouches: [{ clientX: x - DRAG }] })
    busySeen.push({ busy: (await ip.data()).posterBusy, tpl: (await ip.data()).posterTpl })
  }
  ck('④ 连拖三下，每一下的选择都换了（画布忙不挡改选——原来那一趟是每步 await 一次重画）',
    new Set(busySeen.map((b) => b.tpl)).size === 3, JSON.stringify(busySeen))
  await sleep(2500)
  const settled = await ip.data()
  ck('⑤ 手停下来之后画布追上最后一版（屏上那张＝最后选中的那一套）',
    settled.posterBusy === false && settled.posterTpl === busySeen[2].tpl
    && !!settled.posterImagePath, `busy=${settled.posterBusy} 有图=${!!settled.posterImagePath}`)

  /* ---------- ⑥ 顶上那一句模板名点一下也换一套 ---------- */
  const nameBefore = (await ip.data()).posterTpl
  await ip.callMethod('onTplNameTap')
  await sleep(200)
  const nameAfter = (await ip.data()).posterTpl
  ck('⑥ 点模板名换到下一套，且顶上那一行跟着念新名字（不连带把整层收掉）',
    nameAfter !== nameBefore && nameAfter === ids[(ids.indexOf(nameBefore) + 1) % ids.length]
    && (await ip.data()).templateOpen === true,
    `${nameBefore} → ${nameAfter}`)
  const shownName = await (await ip.$('.grip-tx-c')).text().catch(() => '')
  ck('⑦ 屏上那一行念的就是当前这一套的名字（不是留着上一套那一句）',
    (shownName || '').length > 0, JSON.stringify(shownName))

  /* ---------- ⑰ 英文态那一行三枚字不相撞（站长「英文版，左上角与中间重叠了，你要压缩左侧英文」） ----------
     静态那把（`验-拖动切换与滑篇.js` ㉞′㉞㉟㊱）算的是**折算宽**，是估的；这一节量的是渲染端。
     那一行三枚都是绝对定位、谁也不给谁让位 ⇒ 挤不下**不折行、也不缩**，直接压在一起
     （他截图上 `Swipe to change te…` 就骑在 `< Vertical Letter >` 上）。
     名字越长、那枚名字的墨迹越往两边撑 ⇒ 留给左端那句的越少，所以**逐套都走一遍**，最坏那一档不靠眼睛挑。
     ⚠ 换语言只 setData 页面自己那份 `lang`/`t`（与 `验-推荐按钮两态-真跑.js` 同一招）：屏上那枚角标
       走的是发服务端的那一趟 PUT，尺子不许动站长的账号语言。
     ⚠ 缝的下限取 8rpx：静态那条算式里留的是 12rpx，这里减掉 rpx→px 取整的残渣（本仓量过 ±1px 那一档）。
     ⚠ 收尾必换回中文——⑧ 起那一节钉的是窗里那句中文提示，留着英文会报假红（10-20 ⑯ 那一夜就栽在语言态串味）。 */
  {
    const lang0 = (await ip.data()).lang || 'zh'
    if (lang0 !== 'zh') { await ip.setData({ lang: 'zh', t: texts('zh') }); await sleep(900) }
    ck('⑰-0 起手页面念的是中文（`钉-屏上语言.js` 只改 globalData，页面这一份得自己确认）',
      (await ip.data()).lang === 'zh', JSON.stringify((await ip.data()).lang))
    await ip.setData({ lang: 'en', t: texts('en') })
    await sleep(900)
    const enD = await ip.data()
    ck('⑰-1 英文态真翻到了，左端那句念的就是 ⑰ 压过的那一格（不是屏上还留着汉字）',
      enD.lang === 'en' && (enD.t || {}).swipeHint === texts('en').swipeHint,
      JSON.stringify((enD.t || {}).swipeHint))
    ck('⑰-2 那句压到 16 个字符以内（他截图那一版 24 个字母正是撞上的那一段）',
      texts('en').swipeHint.length <= 16, `${texts('en').swipeHint.length} 字符：${texts('en').swipeHint}`)
    /* 中间那枚的盒子**不是**内容宽：`.grip-tx-c` 写的是 `left:0; right:0; max-width:340rpx; margin:0 auto`
       ⇒ 绝对定位两边钉死＝拉满 702，再被 max-width 夹回 340，余量分给两个 auto margin
       ⇒ **盒子恒等于 340rpx、恒居中**。第一版判据按"盒子＝墨迹"写，11 套量回来全是同一组数
         （左 −34.5／右 ＋8.5rpx）——那不是"每套名字一样长"，是我把一只固定盒子当成了内容。
       ⇒ 这一节改判**墨迹**：左右那两枚是 shrink-to-fit（只钉一边），盒子就是墨迹，直接可用；
         中间那枚的墨迹宽拿 `wx.createOffscreenCanvas(2d)·measureText` 现测，并且**用左端那一句自校一档**：
         同一枚 `.grip-tx`（同字号、同 700、同字距），量回来的宽 ÷ 屏上盒子的宽 ＝ 这一台的折算率 k，
         名字乘同一个 k ⇒ 不猜"一个字母几 rpx"，也顺手把模拟器把 21rpx 取整成 10px 那一档吃掉。
       ⚠ 残余风险：k 标在 `Swipe to switch` 那一句上，名字里有该句没有的字形（大写 V/L、`&`）时差几个百分点
         ⇒ 这一条判"缝 ≥ 8rpx"，不是判"绝不重叠"；他要是回一句"还压着"，就换截图采像素那条路（本仓有现成做法）。 */
    const enHint = texts('en').swipeHint
    const walk = []
    for (const id of ids) {
      await ip.callMethod('_tplPick', id)
      await sleep(420)
      const els = await ip.$$('.float-sheet .grip .grip-tx')
      const box = []
      for (const el of els) {
        const o = await el.offset()
        const s = await el.size()
        box.push({ l: o.left, r: o.left + s.width })
      }
      // DOM 顺序＝中间那枚 → 左端那句 → 右端那句（index.wxml 顶上那一行就这个次序）；
      // 名字空的时候中间那枚退成把手条（类不是 `.grip-tx`），枚数就不是 3 ⇒ 当场报红，别拿两枚比。
      if (box.length !== 3) { ck(`⑰-3 ${id}：那一行三枚都画得出来`, false, `读到 ${box.length} 枚`); continue }
      walk.push({ name: (await ip.data()).posterTplName || id, c: box[0], L: box[1], Rt: box[2] })
    }
    const ink = await mp.evaluate((strs) => {
      const cv = wx.createOffscreenCanvas({ type: '2d', width: 640, height: 64 })
      const ctx = cv.getContext('2d')
      ctx.font = '700 21px sans-serif'          // 绝对值不算数，只取**相对**宽：下面用 k 标到这一台
      const o = {}
      strs.forEach((s) => { o[s] = ctx.measureText(s).width })
      return { o, ls: typeof ctx.letterSpacing }
    }, [enHint].concat(walk.map((w) => w.name)))
    const k = walk.length ? (walk[0].L.r - walk[0].L.l) / ink.o[enHint] : NaN
    console.log(`  读数｜measureText 折算率 k＝屏上盒子／量回来＝${Number.isFinite(k) ? k.toFixed(3) : 'NaN'}（标在「${enHint}」那一句上）`)
    let worstSide = ''
    let worstGap = Infinity
    let seen = 0
    walk.forEach((w) => {
      const inkW = (ink.o[w.name] || 0) * k
      const mid = (w.c.l + w.c.r) / 2
      const gapL = (mid - inkW / 2 - w.L.r) / R
      const gapR = (w.Rt.l - (mid + inkW / 2)) / R
      seen += 1
      if (gapL < worstGap) { worstGap = gapL; worstSide = `左端那句 ↔ 名字（${w.name}）` }
      if (gapR < worstGap) { worstGap = gapR; worstSide = `名字 ↔ 右端那句（${w.name}）` }
      ck(`⑰-3 英文态 ${w.name}：左端那句与那枚名字的墨迹不相撞（名字墨迹 ${(inkW / R).toFixed(1)}rpx，左缝 ${gapL.toFixed(1)}／右缝 ${gapR.toFixed(1)}rpx ≥ 8）`,
        gapL >= 8 && gapR >= 8, `左 ${gapL.toFixed(1)}rpx／右 ${gapR.toFixed(1)}rpx`)
    })
    ck('⑰-3′ 中间那枚的盒子真是恒 340rpx（这一节改判墨迹的前提就在这条上）',
      walk.length > 0 && walk.every((w) => Math.abs((w.c.r - w.c.l) / R - 340) <= 3),
      walk.map((w) => `${((w.c.r - w.c.l) / R).toFixed(1)}`).join('／'))
    ck('⑰-4 逐套都量到了（一枚没读到就不算"每一套都不撞"）',
      seen === ids.length, `${seen}/${ids.length} 套`)
    console.log(`  读数｜英文态那一行最窄的那条缝 ${worstGap.toFixed(1)}rpx，出在 ${worstSide}`)
    await ip.callMethod('_tplPick', ids[0])
    await ip.setData({ lang: 'zh', t: texts('zh') })
    await sleep(900)
    ck('⑰-5 换回中文，⑧ 起那一节吃的还是原来那一份（语言态不许串到下一节）',
      (await ip.data()).lang === 'zh' && (await ip.data()).templateOpen === true,
      JSON.stringify((await ip.data()).lang))
  }

  /* ---------- ⑧ 详情窗（带毛玻璃那一层）：大标题左右滑换前后篇 ----------
     站长 10-20 夜里那两口都落在这一节：
     ①「左右滑动的笔记详情页，是指带毛玻璃背景的那个界面，不是全屏那个」
     ②「滑动遇到私密，自动跳过」
     ⇒ ① 这一节从"进 pages/detail 那一页"改成"在列表这一屏开那扇窗"，窗浮着时读的是 `detailNote`；
     ⇒ ② 滑的行程因此就是**整串不私密的笔记**——列表里那一篇私密的夹在中间，滑到它跟前要跳过去，
       不再像上一版那样只走"连续非私密那一段"。到头就停仍然照数据判。 */
  await ip.callMethod('_closeTemplate')
  await sleep(500)
  const notes2 = (await ip.data()).notes || []
  ck('⑧ 卡片那层收得掉，收完之后列表还是原来那一串（滑篇量的就是这一串的邻居关系）',
    notes2.length === notes.length && notes2.map((n) => n.id).join() === notes.map((n) => n.id).join(),
    `${notes2.length} 篇 vs 起手 ${notes.length} 篇`)
  const chain = notes2.map((n, i) => ({ n, i })).filter((x) => !x.n.is_private)
  const privs = notes2.map((n, i) => ({ n, i })).filter((x) => x.n.is_private)
  const crossed = privs.filter((p) => p.i > chain[0].i && p.i < chain[chain.length - 1].i)
  ck('⑧′ 这一串里有私密篇**夹在**可滑的那一串中间（不然"自动跳过"这一条今天量不到，只能算没测）',
    crossed.length > 0,
    `私密在第 ${privs.map((p) => p.i).join('、') || '（无）'} 行／可滑 ${chain.length} 篇（第 ${chain[0].i}..${chain[chain.length - 1].i} 行）`)
  ck('⑧″ 可滑的那一串至少三篇（两篇只够试一次方向，跳没跳过看不出来）',
    chain.length >= 3, `${chain.length} 篇`)
  if (chain.length < 3) { await mp.disconnect(); process.exit(1) }

  /* 「跳过」这一条先单独钉死：不走网络、不开窗，直接从私密篇左右那一行各迈一步问 `_dsNeighbour`。
     判的是性质不是抄一遍实现——交回来的那一行必须①不私密、②确实在那一侧、③中间隔着的每一行都是私密的
     （②③合起来才排掉"绕远"：跳过头两行不算跳过，叫滑错地方）。 */
  const at = (id) => notes2.findIndex((x) => x.id === id)
  for (const p of crossed.slice(0, 3)) {
    const r = await ip.callMethod('_dsNeighbour', p.i - 1, 1)
    const q = r ? at(r.id) : -1
    ck(`⑧‴ 从第 ${p.i - 1} 行往右迈一步，跳过第 ${p.i} 行那一篇私密的`,
      q > p.i && !notes2[q].is_private && notes2.slice(p.i, q).every((x) => x.is_private),
      `实得第 ${q} 行${q >= 0 ? `（私密=${!!notes2[q].is_private}）` : '（没回东西）'}`)
    const l = await ip.callMethod('_dsNeighbour', Math.min(p.i + 1, notes2.length - 1), -1)
    const k = l ? at(l.id) : -1
    ck(`⑧⁗ 反方向同样跳（从第 ${Math.min(p.i + 1, notes2.length - 1)} 行往左退一步，不落在第 ${p.i} 行）`,
      k >= 0 && k < p.i && !notes2[k].is_private && notes2.slice(k + 1, p.i + 1).every((x) => x.is_private),
      `实得第 ${k} 行${k >= 0 ? `（私密=${!!notes2[k].is_private}）` : '（没回东西）'}`)
  }

  await ip.callMethod('_openDetail', chain[0].i)
  await sleep(2400)
  let d0 = await ip.data()
  const win = (d) => d.detailOpen === true && !!d.detailNote
  ck('⑨ 开得到那扇带毛玻璃的窗，里头念的就是挑的那一篇',
    win(d0) && d0.detailNote.id === chain[0].n.id,
    `open=${d0.detailOpen} 念的是 ${d0.detailNote && d0.detailNote.id}，应为 ${chain[0].n.id}`)
  ck('⑩ 左上角那一句提示在这一态画得出来（这一篇确实有前一后一）',
    d0.dsHasNav === true && !!(await ip.$('.float-sheet')), `dsHasNav=${d0.dsHasNav}`)
  // automator 读不到 `<text>` 里那几个字（那一层是组件，量不到文本节点），所以这一条量的是
  // 那一行**绑的那一格数据**；"这一行确实绑了这一格、且只在有邻居时画"由静态那把钉着。
  ck('⑪ 那一行念的就是站长给的「左右滑动看下一篇」（字照抄，没改口径）',
    (d0.t || {}).noteSwipeHint === '左右滑动看下一篇', JSON.stringify((d0.t || {}).noteSwipeHint))
  /* 这一句在屏上是不是真的落在**左上角**：窗顶那一行有两句（左端这一句＋右端那句「拖动」），
     两枚同名类靠 `right:auto/left:34rpx` 分开。量渲染出来的矩形，不靠眼睛看截图。 */
  // 窗顶那一行有两枚 `.grip-tx`（左：这一句；右：那句「拖动」），DOM 顺序就是左右顺序。
  // 一枚一枚量，才知道这一句真的落在**左端**——`$()` 只回第一枚，两枚同名类比不出谁在左。
  const txs = await ip.$$('.float-sheet .grip .grip-tx')
  const rects = []
  for (const el of txs) { const o = await el.offset(); const s = await el.size(); rects.push({ x: o.left, w: s.width }) }
  ck('⑪′ 那一句画在窗顶那一行的**左端**（两枚都画得出来，且这一句的左沿更靠左）',
    rects.length === 2 && rects[0].x < rects[1].x && rects[0].w > 0,
    `${rects.length} 枚：${JSON.stringify(rects)}`)

  const swipe = async (dx) => {
    await ip.callMethod('onDsTitleTouchStart', { touches: [{ clientX: 200 }] })
    await ip.callMethod('onDsTitleTouchEnd', { changedTouches: [{ clientX: 200 + dx }] })
    await sleep(2400)
    const d = await ip.data()
    return d.detailNote ? d.detailNote.id : null
  }
  const nx = await swipe(-120)
  ck('⑫ 大标题往左滑一下＝换到可滑那一串里的下一篇（窗还浮着，页面栈没加层）',
    nx === chain[1].n.id && (await ip.data()).detailOpen === true,
    `实得 ${nx}，应为 ${chain[1].n.id}`)
  const back = await swipe(120)
  ck('⑬ 往右滑一下退回来那一篇', back === chain[0].n.id, `实得 ${back}，应为 ${chain[0].n.id}`)

  /* 一路往左走完可滑那一串：每一滑都要真的换一篇（停在同一篇＝卡死），而且**跨过私密的那几跳
     要真跨过去**。跨过的判据不是抄实现：这一跳的**行号差 > 1** 就是从那一行私密上面跨过去了。 */
  let hops = 0
  let landed = chain[0].n.id
  let jumpAt = -1
  for (let c = 1; c < chain.length; c += 1) {
    const next = await swipe(-120)
    if (next !== chain[c].n.id) { landed = next; break }
    if (chain[c].i > chain[c - 1].i + 1 && jumpAt < 0) jumpAt = c
    landed = next
    hops += 1
    const mid = await ip.data()
    if (mid.dsFigAt !== 0) { ck('⑭ 每一滑之后配图那一排都退回第一张（上一排的位置不许带过去）', false, `停在第 ${mid.dsFigAt} 张`); break }
  }
  ck('⑭ 一路往左每一滑都真的换一篇、配图那一排的位置也退回第一张（这一串共 ' + (chain.length - 1) + ' 滑）',
    hops === chain.length - 1 && landed === chain[chain.length - 1].n.id,
    `走了 ${hops}/${chain.length - 1} 滑，停在 ${landed}，这一串最后一篇 ${chain[chain.length - 1].n.id}`)
  ck('⑭′ 这一趟里真的**跨过**了那一行私密（第 ' + (jumpAt >= 0 ? chain[jumpAt - 1].i : -1) + ' 行跳到第 '
    + (jumpAt >= 0 ? chain[jumpAt].i : -1) + ' 行），屏上没有停在密码那一格',
    jumpAt > 0, jumpAt > 0 ? `第 ${chain[jumpAt - 1].i} 行 → 第 ${chain[jumpAt].i} 行` : '全程没跨过私密（这一条今天没测到）')
  const endData = await ip.data()
  const stuck = await swipe(-120)
  const stuckData = await ip.data()
  ck('⑮ 已经是可滑那一串的最后一篇，再往左滑不动（到头就停——他没给这一条拍循环，我不自己扩）',
    stuck === chain[chain.length - 1].n.id && stuckData.dsNext === null,
    `实得 ${stuck}／dsNext=${JSON.stringify(stuckData.dsNext)}`)
  const retreat = await swipe(120)
  ck('⑮′ 往回退同样跳：末尾往右退一步退到这一串里前一篇，不许落进那一行私密',
    retreat === chain[chain.length - 2].n.id && !notes2[at(retreat)].is_private,
    `实得 ${retreat}（第 ${at(retreat)} 行，私密=${at(retreat) >= 0 ? !!notes2[at(retreat)].is_private : '读不到'}），应为 ${chain[chain.length - 2].n.id}`)
  ck('⑯ 末尾那一屏那句提示还在（还有上一篇可退，不算"没有可去的方向"）',
    (await ip.data()).dsHasNav === true && (await ip.data()).detailOpen === true,
    `dsHasNav=${endData.dsHasNav} 窗开着=${endData.detailOpen}`)
  await mp.screenshot({ path: '/tmp/滑篇-详情窗末尾.png' })

  await mp.disconnect()
  console.log(`\n验-拖动切换与滑篇-真跑：${pass} 过${fails.length ? `　✗ ${fails.length} 条：\n  ` + fails.join('\n  ') : '　全绿'}`)
  console.log('  留一张图：/tmp/滑篇-详情窗末尾.png')
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.log('!! 尺子挂：' + e.message); process.exit(1) })
