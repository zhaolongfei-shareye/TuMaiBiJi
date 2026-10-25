// 扫码那一页（分享落地页）：皮在不在 + 骨架是不是照列表那扇详情窗抄的同一份。
// 跑法：SHARE_TOKEN=<一枚活码> docs/工具/跑尺子.sh 9431 验-落地页玻璃-真跑
//
// 为什么要有这一把（两趟口径叠在一起）：
// 站长 10-24 第一句「我要是这种界面，三个按钮变成一个，存入笔记」⇒ 这一屏多了一层皮
// （壁纸 → 暗纱＋糊 → 白窗浮着）；第二句「你干嘛要自己重新设计……无论是自己看笔记，还是
// 别人看笔记，打开的风格布局要一致性。不要另外设计」⇒ 骨架整块改抄 `.float-sheet` 那一份：
// **窗锁死、只有中间那层 scroll-view 滚、底部动作条钉在窗底、窗外一个字都不留**。
// 这一屏因此是静默失效的高发地：
// ① 底图取不到（这台机没设过背景、运营图也没下到）时**只有壁纸那一层不画，窗外那档暗纱照旧铺满整屏**
//    ——10-25 站长真机打回「不能接受，外面没有毛玻璃，我都说了要一比一复刻」，根因正是这两层当年
//    共用了一枚 `wx:if="{{bgSrc}}"`：纱跟着壁纸一起没了，整屏退成一层平米白。列表那一扇的
//    `.float-mask` 从来只吃"窗开没开"（`index.wxml` 那两条），所以这一条判据现在**分两层各判**：
//    壁纸那一层取不到时不硬红、只报出来；纱那四条（糊／面／源里那条 -webkit／层序）**两态都必须过**。
// ② `backdrop-filter` 少一条、或纱的面写死成另一支 ⇒ 屏上看着"糊得不一样"，静态查不出来；
// ③ 层序写错（内容跑到纱底下）＝整屏点不动；
// ④ 窗锁死这件事**只有真跑读得到**：`.container` 少一条 `overflow:hidden`、或窗里那段没换成
//    `scroll-view`，屏上就退回"整页滚、按钮跟着一起走"那一版——正是他打回的那一版；
// ⑤ 窗内那几档灰是 10-21 钉死的中性壳，最容易被"顺手统一一下"改掉。
// ⚠ 落码那一趟栽过两条，都记在这儿免得下次再当判据写：wxss 注释的收尾必须 `*/`（写成 wxml 的
//    `-->` 会把后面整段规则当注释吞掉，静态尺子与 `node --check` 都查不出来）；Chromium 的
//    getComputedStyle **读不回** `-webkit-backdrop-filter`（它是别名），那一条只能查源码。
// ⚠ 没给 SHARE_TOKEN 时这把**退出码 2**（环境红），不许混成判据红。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const TOKEN = String(process.env.SHARE_TOKEN || '').trim()
const OUT = '/tmp/mp-check'
const WXSS = path.resolve(__dirname, '../../miniprogram/pages/share/view.wxss')
const WXML = path.resolve(__dirname, '../../miniprogram/pages/share/view.wxml')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

;(async () => {
  if (!TOKEN) { console.log('环境红：没给 SHARE_TOKEN（要一枚现网活着的分享码）'); process.exit(2) }
  fs.mkdirSync(OUT, { recursive: true })
  const SRC = fs.readFileSync(WXSS, 'utf8')
  // 源码级断言一律在**剥掉注释之后**的那一份上跑：这一堆规则每条头上都写着一段来历，
  // 而注释里出现 `page{}` 这种花括号会把 `[^}]*` 那种"只看这一条规则体内"的写法截断
  // ——10-25 第一次跑这把就红在这一枚括号上（屏上是对的，尺子读错了）。注释成不成对仍看原文。
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '')
  const MARKUP = fs.readFileSync(WXML, 'utf8')
  // 注释成不成对：这一把是这一趟自己踩出来的（`-->` 收尾吞掉整段规则，屏上读得出、静态查不出）。
  const nOpen = (SRC.match(/\/\*/g) || []).length, nClose = (SRC.match(/\*\//g) || []).length
  ck('wxss 注释成对（`/*` 与 `*/` 一样多；少一枚就有一段规则被当注释吞掉）',
    nOpen === nClose, `${nOpen} 开 / ${nClose} 闭`)

  let mp = null
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上 9431，先跑 cli auto')
  await mp.reLaunch('/pages/share/view?token=' + encodeURIComponent(TOKEN))
  await sleep(4000)
  const page = await mp.currentPage()
  const route = await mp.evaluate(() => getCurrentPages().slice(-1)[0].route)
  ck('开到的就是扫码那一页', route === 'pages/share/view', route)
  const d = await page.data()
  ck('正文真的到手了（不是停在加载／报错）', !d.loading && !d.error && !!d.share,
    `loading=${d.loading} error=${JSON.stringify(d.error)} 有 share=${!!d.share}`)
  ck('这一页不再判深浅（窗外没字了，`bgLight`／`bgLightLow` 已从 data 里撤干净）',
    d.bgLight === undefined && d.bgLightLow === undefined,
    `bgLight=${d.bgLight} bgLightLow=${d.bgLightLow}`)
  const win = await mp.evaluate(() => { const w = wx.getWindowInfo(); return { w: w.windowWidth, h: w.windowHeight } })
  const R = win.w / 750
  const rect = async (sel) => {
    const e = await page.$(sel)
    if (!e) return null
    const s = await e.size(), o = await e.offset()
    return { w: s.width, h: s.height, left: o.left, top: o.top }
  }
  // 视口相对的落点：流里的块会随页面滚动变，fixed 的层恒不动——量这一枚才叫"锁没锁死"。
  const live = async (sel) => await mp.evaluate((s) => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    q.select(s).boundingClientRect()
    q.selectViewport().scrollOffset()
    q.exec((res) => resolve({ top: res[0] ? res[0].top : null, h: res[0] ? res[0].height : null, pageScroll: res[1] ? res[1].scrollTop : null }))
  }), sel)
  const css = async (sel, prop) => { const e = await page.$(sel); return e ? await e.style(prop) : null }

  // ---------- 皮：窗外那一档纱（**两态都必须过**，壁纸那一层才分态） ----------
  ck('纱那一层在 wxml 里不带任何属性（10-25 那一刀的真根因：它当年与壁纸共用同一枚 `wx:if="{{bgSrc}}"`）',
    /<view class="sv-veil"><\/view>/.test(MARKUP), '源码级断言')
  const bf = await css('.sv-veil', 'backdrop-filter')
  ck('纱那一层真的在糊（计算出来的 backdrop-filter 不是 none）',
    !!bf && !/none/.test(String(bf)), `标准=${bf}`)
  ck('源码里 `-webkit-backdrop-filter` 那一条在（iOS 只认这一条，计算样式读不回，只能查源码）',
    /-webkit-backdrop-filter:\s*var\(--glass-bf\)/.test(CODE), '源码级断言')
  const vb = await css('.sv-veil', 'background-color')
  ck('纱的面吃的是与列表那扇窗同一枚令牌（rgba(8, 10, 14, 0.45)）',
    /rgba\(\s*8,\s*10,\s*14,\s*0?\.45\s*\)/.test(String(vb)), vb)
  const veilBox = await rect('.sv-veil')
  ck('纱铺满整屏（宽高＝视口，误差 ≤2px）',
    !!veilBox && Math.abs(veilBox.w - win.w) <= 2 && Math.abs(veilBox.h - win.h) <= 2,
    veilBox ? `${veilBox.w}×${veilBox.h} vs 视口 ${win.w}×${win.h}` : '没有 .sv-veil 这一格')
  const zBg = await css('.sv-bg', 'z-index'), zVeil = await css('.sv-veil', 'z-index'), zSheet = await css('.sv-sheet', 'z-index')
  ck('三层叠得对：底图 < 纱 < 窗（层序照详情窗那一对 100／101）',
    Number(zBg) < Number(zVeil) && Number(zVeil) < Number(zSheet), `${zBg} / ${zVeil} / ${zSheet}`)
  ck('纱底下那一层底吃 `--bg-page`（没铺图的人打开时它是屏上唯一那层色，写死一枚米白＝五档心情在这页全退成同一支）',
    /\.container\s*\{[^}]*background:\s*var\(--bg-page\)/.test(CODE), '源码级断言')
  ck('这一页走全站那唯一的导航条出口（`app.applyTheme(app.getWallpaper())`；不走它顶上那条就停在 app.json 那枚写死的浅米）',
    /app\.applyTheme\(app\.getWallpaper\(\)\)/.test(fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/share/view.js'), 'utf8')),
    '源码级断言')

  // ---------- 皮：壁纸那一层（取不到是合法兜底态，只报不红） ----------
  ck('底图那一层画上了（bgSrc 非空＝这台机那枚背景槽或运营图取到了）',
    !!d.bgSrc, d.bgSrc ? `本机路径 ${String(d.bgSrc).replace(/^.*?(\/[^/]+)$/, '$1')}` : '空：这一屏没有可糊的花纹，纱与白窗照旧（与列表那扇同态）')
  if (!d.bgSrc) { console.log('　→ 这台机没铺图态：壁纸那一层的落点测不到，判据不硬判') }
  else {
    const bg = await rect('.sv-bg')
    ck('底图铺满整屏（宽高＝视口，误差 ≤2px）',
      !!bg && Math.abs(bg.w - win.w) <= 2 && Math.abs(bg.h - win.h) <= 2,
      bg ? `${bg.w}×${bg.h} vs 视口 ${win.w}×${win.h}` : '没有 .sv-bg 这一格')
  }

  // ---------- 骨架：照 `.float-sheet` 抄的那一组数 ----------
  const sheet = await rect('.sv-sheet')
  ck('窗的左右内缩与列表那扇同一枚（24rpx，误差 ≤1px）',
    !!sheet && Math.abs(sheet.left - 24 * R) <= 1, sheet ? `屏上 ${sheet.left.toFixed(1)}px｜24rpx=${(24 * R).toFixed(1)}px` : '没有 .sv-sheet')
  const topPx = await css('.sv-sheet', 'top')
  ck('窗顶那一枚照抄 130rpx', !!topPx && Math.abs(parseFloat(topPx) - 130 * R) <= 1, topPx)
  // ⚠ 窗底那一条不在这里核，见下面「屏上窗底到视口下沿」——`getComputedStyle` 会把 calc 折成
  // 实际像素（第一版拿字符串对 `24rpx`/`safe-area-inset-bottom`，判了条假红）。
  ck('源码里窗底写的是 24rpx ＋ 系统底部安全区（这一页没有底栏，列表那枚 192 不能照抄）',
    /\.sv-sheet\s*\{[^}]*bottom:\s*calc\(24rpx \+ env\(safe-area-inset-bottom\)\)/.test(CODE), '源码级断言')
  ck('窗的圆角与投影抄同一份（`--r-block` ＋ 0 30rpx 60rpx rgba(8,10,14,.32)）',
    /\.sv-sheet\s*\{[^}]*border-radius:\s*var\(--r-block\)/.test(CODE) &&
    /\.sv-sheet\s*\{[^}]*box-shadow:\s*0 30rpx 60rpx rgba\(8, 10, 14, 0\.32\)/.test(CODE), '源码级断言')
  ck('描边已撤（`.float-sheet` 没有描边，照图 ⇒ 这一层不许留 `border:`）',
    !/\.sv-sheet\s*\{[^}]*[^-]border:/.test(CODE), '源码级断言')

  // ---------- 骨架：窗锁死、只有中间滚、动作条钉住 ----------
  ck('中间那层是 `scroll-view scroll-y`（不是流里的一段）',
    /<scroll-view[^>]*class="sv-body"[^>]*scroll-y/.test(MARKUP), '源码级断言')
  ck('`.sv-body` 吃 `flex:1` ＋ `min-height:0`（少那一行就顶穿窗底）',
    /\.sv-body\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0/.test(CODE), '源码级断言')
  ck('动作条挂在 scroll-view 外面、吃 `flex:none`（窗滚它不动）',
    /\.sv-dock\s*\{[^}]*flex:\s*none/.test(CODE) && MARKUP.indexOf('<view class="sv-dock">') > MARKUP.indexOf('</scroll-view>'),
    '源码级断言')
  const before = await live('.sv-sheet'), parA = await live('.sv-para'), dockA = await live('.sv-dock')
  await mp.evaluate(() => wx.pageScrollTo({ scrollTop: 600, duration: 0 }))
  await sleep(900)
  const after = await live('.sv-sheet'), parB = await live('.sv-para'), dockB = await live('.sv-dock')
  ck('页面自己一点都没滚（照详情窗：窗锁死，`wx.pageScrollTo` 之后视口滚动量仍是 0）',
    after.pageScroll === 0 && Math.abs(after.top - before.top) <= 0.5,
    `视口滚动=${after.pageScroll}｜窗的落点 ${before.top.toFixed(1)} → ${after.top.toFixed(1)}`)
  ck('正文那一块在窗里、不在页面流里（它的落点由 scroll-view 自己给）',
    !!parA && !!sheet && parA.top > before.top && parA.top < before.top + before.h + 1,
    parA ? `正文 top=${parA.top.toFixed(1)}｜窗 ${before.top.toFixed(1)}~${(before.top + before.h).toFixed(1)}` : '这篇没摘要那一块')
  ck('动作条钉在窗底（贴窗的下沿，且没跟着正文走）',
    !!dockA && Math.abs((dockA.top + dockA.h) - (before.top + before.h)) <= 2 &&
    !!dockB && Math.abs(dockB.top - dockA.top) <= 0.5,
    dockA ? `条底 ${(dockA.top + dockA.h).toFixed(1)} vs 窗底 ${(before.top + before.h).toFixed(1)}｜滚后位移 ${dockB ? (dockB.top - dockA.top).toFixed(1) : '—'}` : '没有 .sv-dock')
  const gapBottom = win.h - (before.top + before.h)
  ck('屏上窗底到视口下沿＝那一档（24rpx 起跳，多出来的只可能是系统底部安全区）',
    gapBottom >= 24 * R - 1 && gapBottom <= 24 * R + 40,
    `屏上 ${gapBottom.toFixed(1)}px｜24rpx=${(24 * R).toFixed(1)}px＋安全区`)
  const bodyBox = await live('.sv-body')
  const bodyEl = await page.$('.sv-body')
  const bodyScroll = await mp.evaluate(() => new Promise((resolve) => {
    const q = wx.createSelectorQuery(); q.select('.sv-body').scrollOffset(); q.exec((r) => resolve(r[0]))
  }))
  ck('中间那一层确实装得下比窗还高的内容（真能滚，不是空转的一层）',
    !!bodyScroll && !!bodyBox && bodyScroll.scrollHeight > bodyBox.h,
    `窗内净高 ${bodyBox ? bodyBox.h.toFixed(0) : '—'}px｜这一层的内容 ${bodyScroll ? bodyScroll.scrollHeight : '—'}px`)
  // 真把中间那一层滚一下：正文得跟着走，动作条与窗一毫米都不许动（这一条才是"界面锁死、只有文字滚"）。
  // ⚠ 位移的期望值不写死一个数：这一层能滚的最大值＝内容高－窗内净高，随这一篇的长短变。
  //    第一版写的是"位移 > 200"，拿一篇短验收笔记（三张图＋两句要点）开就假红——
  //    屏上已经滚到底（116px 就是它的天花板），尺子在要一个物理上不存在的位移。
  const maxScroll = bodyScroll && bodyBox ? bodyScroll.scrollHeight - bodyBox.h : 0
  const want = Math.min(300, maxScroll)
  const dockA2 = await live('.sv-dock'), parA2 = await live('.sv-para')
  await bodyEl.scrollTo(0, 300)
  await sleep(900)
  const dockB2 = await live('.sv-dock'), parB2 = await live('.sv-para'), pageNow = await live('.sv-sheet')
  const moved = parA2 && parB2 ? parA2.top - parB2.top : 0
  ck('窗里那一滚，正文真的上去了（位移＝min(300, 这一层能滚的最大值)，容 ±20）',
    !!parA2 && !!parB2 && want >= 60 && Math.abs(moved - want) <= 20,
    parA2 && parB2 ? `正文 top ${parA2.top.toFixed(1)} → ${parB2.top.toFixed(1)}＝位移 ${moved.toFixed(1)}px｜这一层最大可滚 ${maxScroll.toFixed(0)}px` : '这篇没有摘要那一块')
  ck('同一趟里动作条与窗都没动（钉在窗底那一枚不跟着滚）',
    !!dockA2 && !!dockB2 && Math.abs(dockB2.top - dockA2.top) <= 0.5 && pageNow.pageScroll === 0,
    dockA2 && dockB2 ? `条位移 ${(dockB2.top - dockA2.top).toFixed(1)}px｜视口滚动 ${pageNow.pageScroll}` : '—')

  // ---------- 窗外不留字 + 窗内色一支没动 ----------
  // 读落点前先窗内滚回顶部：上面那一条真把中间那层滚了 300px，眉标跟着滚出窗的上沿，
  // 那时读到的负数是尺子自己的顺序错了（第一版就这么假红过一条）。
  if (bodyEl) await bodyEl.scrollTo(0, 0)
  await sleep(600)
  const eb = await live('.eyebrow')
  // ⚠ `live()` 找不到元素时回的是**一个 top 为 null 的对象**，不是 null（这一坑在这一把里第二次踩）。
  const ebGone = !eb || eb.top === null
  ck('眉标「分享笔记」已经不画了（他 10-25「把多余的去掉，一比一」——参考那一窗里没有这一行）',
    ebGone && !/class="eyebrow"/.test(MARKUP) && !/\.eyebrow\s*\{/.test(CODE),
    ebGone ? '屏上与源码都读不到 .eyebrow' : `还在，top=${eb.top.toFixed(1)}`)
  // 撤一行不许顺手把窗顶那一档也撤掉：第一行到窗顶仍是 34rpx（原来挂在眉标上，现在挂在作者行上）。
  const ar = await live('.author-row')
  const firstRow = ar && ar.top !== null ? ar : await live('.sv-h2')
  ck('窗顶到第一行字那一档没跟着漂（34rpx 搬到了现在的第一行身上）',
    ebGone && !!firstRow && firstRow.top !== null
      && firstRow.top - before.top >= 34 * R - 2 && firstRow.top - before.top <= 34 * R + 6,
    firstRow && firstRow.top !== null
      ? `第一行 top=${firstRow.top.toFixed(1)}｜窗顶 ${before.top.toFixed(1)}＝差 ${(firstRow.top - before.top).toFixed(1)}px（34rpx=${(34 * R).toFixed(1)}px）`
      : '第一行都读不到')
  // ⚠ 原来这里还有一条"眉标吃的那支灰 #9a9ea6 不许改"——元素 10-25 整枚撤掉了，那条判据跟着撤
  // （撤一个状态会作废一批判据，反过来留着它就是一条永远红得没道理的尺子）。
  // 留在这里的那几条色判同一条老规矩：**不许拿源码那三位数当尺子**，模拟器把 sRGB 折进显示色域，
  // 差个位数是色域转换造的，所以一律逐通道 ±8。
  ck('窗的面吃的是与列表那扇同一枚 `--bg-card`（源码里不许写死成一支色）',
    /\.sv-sheet\s*\{[^}]*background:\s*var\(--bg-card\)/.test(CODE), '源码级断言')
  const face = String(await css('.sv-sheet', 'background-color'))
  const fc = (face.match(/\d+/g) || []).map(Number)
  ck('屏上读回的窗面＝墨档那一份 #F3F3F1（容 ±8：色域转换会造出个位数差）',
    fc.length === 3 && fc.every((v, i) => Math.abs(v - [243, 243, 241][i]) <= 8),
    `屏上 ${face}｜令牌 #F3F3F1`)
  ck('卡内标题仍是那档墨（rgba(35,37,44,.9)）',
    /rgba\(\s*35,\s*37,\s*44,\s*0?\.9\s*\)/.test(String(await css('.sv-h2', 'color'))),
    await css('.sv-h2', 'color'))
  const btns = await page.$$('.sv-ibtn')
  const label = btns.length ? String(await btns[0].text()).trim() : ''
  ck('底部仍只有一枚，字照他点名的「存入笔记」（或已存那一态）',
    btns.length === 1 && /存入笔记|已存进我的笔记|保存中/.test(label), `${btns.length} 枚：${label}`)
  // 那一枚药丸的描边：两扇窗现在底下是同一支面（都吃 `--bg-card`），描边就没有理由两档。
  // 10-25 之前这一页写死过一枚 `rgba(35,37,44,.24)`，理由"这一页的卡是纯白"在窗面换成
  // `--bg-card` 那一刻就作废了——这一条把"两页同一枚令牌"钉成断言，不靠人记注释。
  const IDX = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/index/index.wxss'), 'utf8')
  const IDX_CODE = IDX.replace(/\/\*[\s\S]*?\*\//g, '')
  ck('动作条那一枚的描边与详情窗 `.ds-ibtn` 吃同一枚令牌（两份源码都写 `var(--layer-edge)`）',
    /\.sv-ibtn\s*\{[^}]*box-shadow:\s*inset 0 0 0 var\(--w-edge\) var\(--layer-edge\)/.test(CODE) &&
    /\.ds-ibtn\s*\{[^}]*box-shadow:\s*inset 0 0 0 var\(--w-edge\) var\(--layer-edge\)/.test(IDX_CODE),
    '源码级断言（两文件）')
  const bs = String(await css('.sv-ibtn', 'box-shadow'))
  ck('屏上读回的描边是 60% 那一档墨（rgba(35, 37, 44, 0.6)，不是这一页自己那枚 24%）',
    /rgba\(\s*35,\s*37,\s*44,\s*0?\.6\s*\)/.test(bs), bs)
  ck('屏上没有窗外的字了（作者行／品牌行两家都在 `.sv-sheet` 里面；眉标 10-25 整枚撤了，不再数它）',
    !/class="sv-fg"/.test(MARKUP) &&
    MARKUP.indexOf('class="sv-sheet"') < MARKUP.indexOf('class="brand-row"') &&
    MARKUP.indexOf('class="sv-sheet"') < MARKUP.indexOf('class="author-row"'),
    '源码级断言')

  const shot = async (name) => {
    const f = path.join(OUT, name)
    const t0 = fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0
    for (let i = 0; i < 8; i++) {
      await mp.screenshot({ path: f })
      await sleep(400)
      if (fs.statSync(f).mtimeMs !== t0) break
      await sleep(400)
    }
    return f
  }
  if (bodyEl) await bodyEl.scrollTo(0, 0)
  await sleep(700)
  console.log('　截图 ' + await shot('69-落地页同窗-进门.png'))
  if (bodyEl) await bodyEl.scrollTo(0, 99999)
  await sleep(1200)
  console.log('　截图 ' + await shot('69-落地页同窗-窗内滚到底.png'))

  // ---------- 报错那一态：也必须在同一张窗里（今天两态搬进来的目的就是"三态同一张壳"） ----------
  // 拿一枚必然不存在的码开这一页：过期／撤回的读者看到的就是这一屏，它要是还压在纱上，
  // 深壁纸配深字＝读不到——那正是撤掉深浅翻色后唯一可能露出来的洞。
  await mp.reLaunch('/pages/share/view?token=' + encodeURIComponent('nomadesuchsharetoken0'))
  await sleep(3500)
  const errPage = await mp.currentPage()
  const errData = await errPage.data()
  ck('码不对时念的是那句报错（不是停在"加载中…"）', !!errData.error && !errData.loading,
    `error=${JSON.stringify(errData.error)} loading=${errData.loading}`)
  const errSheet = await errPage.$('.sv-sheet'), errText = await errPage.$('.sv-para')
  ck('报错那一态仍画着同一张窗（窗在、正文不在）', !!errSheet && !errText,
    `窗=${!!errSheet} 正文=${!!errText}`)
  const errBox = await errPage.$('.error-text')
  const errLive = await mp.evaluate(() => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    q.select('.error-text').boundingClientRect()
    q.select('.sv-sheet').boundingClientRect()
    q.exec((r) => resolve({ e: r[0], s: r[1] && { top: r[1].top, h: r[1].height } }))
  }))
  ck('那句报错落在窗内（不再直接压在纱上）',
    !!errLive && !!errLive.e && !!errLive.s && errLive.e.top > errLive.s.top && errLive.e.top < errLive.s.top + errLive.s.h,
    errLive && errLive.e ? `报错 top=${errLive.e.top.toFixed(1)}｜窗 ${errLive.s.top.toFixed(1)}~${(errLive.s.top + errLive.s.h).toFixed(1)}` : '没读到')
  ck('报错那一态不画动作条（没有可存的东西）', (await errPage.$$('.sv-ibtn')).length === 0,
    `${(await errPage.$$('.sv-ibtn')).length} 枚`)
  console.log('　截图 ' + await shot('69-落地页同窗-码不对.png'))
  if (errBox) {
    const c = String(await errBox.style('color'))
    const n = (c.match(/\d+/g) || []).map(Number)
    ck('报错那句字的色＝这一页自己那支灰 #5c6068（白窗里的墨字，不吃壁纸）',
      n.length === 3 && n.every((v, i) => Math.abs(v - [92, 96, 104][i]) <= 8), `屏上 ${c}`)
  }
  // ---------- 没铺图那一态（10-25 他真机看到的就是这一态） ----------
  // 上面那一段量的是"这台机背景槽里有图"。他打回那一刀的场景是**图取不到**：
  // 读者那台机从没设过背景、运营图那趟 pull 也还没落地 ⇒ `bgSrc` 是空串。
  // 当场把这一页的 `bgSrc` 抹成空（只动页面 data，不碰这台机存过的那枚背景槽）再量一遍：
  // 壁纸那一层该撤、纱那一层该还在、纱底下那层底该读回 `--bg-page`。
  await mp.reLaunch('/pages/share/view?token=' + encodeURIComponent(TOKEN))
  await sleep(4000)
  const p2 = await mp.currentPage()
  await p2.setData({ bgSrc: '' })
  await sleep(1400)
  const noBg = await p2.$('.sv-bg'), noVeil = await p2.$('.sv-veil')
  ck('抹掉壁纸那一格：壁纸层撤了、纱那一层还在（这一条就是 10-25 那一刀的回归闸）',
    !noBg && !!noVeil, `壁纸=${!!noBg} 纱=${!!noVeil}`)
  if (noVeil) {
    const bf2 = String(await noVeil.style('backdrop-filter'))
    const vb2 = String(await noVeil.style('background-color'))
    ck('同一态下纱仍在糊、面仍是那枚暗纱令牌', !/none/.test(bf2) && /rgba\(\s*8,\s*10,\s*14/.test(vb2), `${bf2}｜${vb2}`)
    const cEl = await p2.$('.container')
    const cRaw = cEl ? String(await cEl.style('background-color')) : ''
    const cn = (cRaw.match(/\d+/g) || []).map(Number)
    ck('同一态下纱底下那层底＝`--bg-page` 那一档（墨档 #E2DED4，屏上容 ±8：色域转换造个位数差）',
      cn.length === 3 && cn.every((v, i) => Math.abs(v - [226, 222, 212][i]) <= 8), `屏上 ${cRaw}`)
  }
  console.log('　截图 ' + await shot('69-落地页同窗-没铺图那一态.png'))

  // ---------- 存完跳到详情页＋页底那条 bar（站长 10-25「存入后，自动跳转到转存用户的图麦笔记
  // 该笔记详情页，就是下方多了 bar，提醒用户，你已收藏该笔记」）----------
  // ⚠ 这一节**只读现网、一行都不写**：拿他名下已有的一篇，带 `saved=1` 开一次、不带再开一次。
  //    为什么不在这儿真点那枚「存入笔记」：那一下会在现网多造一篇笔记＋最多九行云上配图，
  //    跑一遍留一次残留（#337 那一格还挂着没清，不能再往里添）。真点那一段归
  //    `验-转存与作者.js`——它跑在本地临时库上、吃的就是这一份树，去重与跳转都归它验。
  const APIJS = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/utils/api.js'), 'utf8')
  const BASE_URL = (APIJS.match(/const API_BASE = '([^']+)'/) || [])[1] || ''
  const VIEWJS = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/share/view.js'), 'utf8')
  const DETAILJS = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/detail/detail.js'), 'utf8')
  const DETAILWXSS = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/detail/detail.wxss'), 'utf8')
  const DETAILWXML = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/detail/detail.wxml'), 'utf8')
  const I18N = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'), 'utf8')
  const DCODE = DETAILWXSS.replace(/\/\*[\s\S]*?\*\//g, '')
  // 落地页那一头的接线（源码级）：存完拿服务端回的 `note.id` 跳详情页，带上 `saved=1`。
  const saveBody = (VIEWJS.match(/async saveToMine\(\)[\s\S]*?\n  \},/) || [''])[0]
  ck('存完那一趟跳详情页，url 带的是服务端回的 `note.id` ＋ `saved=1`（源码级）',
    /wx\.navigateTo\(\{ url: `\/pages\/detail\/detail\?id=\$\{note\.id\}&saved=1` \}\)/.test(saveBody),
    saveBody ? '这一句在' : 'saveToMine 函数体没抠出来')
  // ⚠ 只看**成功那一段**（`} catch` 之前）：失败那一路的 toast 是留着的（念服务端回的那句原因），
  //   拿整段函数体判"有没有 showToast"会把这条留着的正确行为判成红——第一版就红在这枚括号上。
  ck('成功那枚 toast 撤了（同一句话由详情页那条 bar 说，两页各念一遍是重复）',
    !/wx\.showToast/.test((saveBody.split('} catch')[0] || '').split('await api.importFromShare')[1] || ''),
    '源码级断言')
  ck('那一枚开关只认 `saved === \'1\'`（平时从列表点开同一篇不许再提醒一遍）',
    /savedBar: options\.saved === '1'/.test(DETAILJS), '源码级断言')
  ck('那句话写死两支都在，中文逐字＝他原话「你已收藏该笔记」（屏上不许拼词、也不许留英文占位）',
    /savedNoteBar: '你已收藏该笔记'/.test(I18N) && /savedNoteBar: 'Saved to your notes'/.test(I18N),
    '源码级断言（i18n 双语两支）')

  const nid = await mp.evaluate((b) => new Promise((resolve) => {
    const app = getApp()
    const tk = app.globalData.token
    if (!tk || !b) { resolve(null); return }
    wx.request({
      url: `${b}/api/notes/?limit=1`,
      header: { Authorization: 'Bearer ' + tk },
      success: (r) => {
        const arr = Array.isArray(r.data) ? r.data : (r.data && r.data.items) || []
        resolve(r.statusCode === 200 && arr.length ? arr[0].id : null)
      },
      fail: () => resolve(null),
    })
  }), BASE_URL)
  ck(`拿到他名下已有的一篇笔记（这一节的前置；API_BASE=${BASE_URL}）`, !!nid,
    nid ? `id=${nid}` : '列表口回空／这台模拟器没登录——环境红，下面那几条没跑')
  if (nid) {
    await mp.navigateTo(`/pages/detail/detail?id=${nid}&saved=1`)
    await sleep(4000)
    const dp = await mp.currentPage()
    const dd = await dp.data()
    const dRoute = await mp.evaluate(() => getCurrentPages().slice(-1)[0].route)
    ck('带 `saved=1` 落的就是详情页那一屏', dRoute === 'pages/detail/detail', dRoute)
    ck('这一页的内容真到手了（不是停在加载／报错）', !!dd.note, `note=${!!dd.note}`)
    ck('页面 data 里那一枚开关是开着的', dd.savedBar === true, `savedBar=${dd.savedBar}`)
    const bars = await dp.$$('.saved-bar')
    ck('页底那条 bar 画出来了，且只有一条', bars.length === 1, `${bars.length} 条`)
    const wantTxt = String((dd.t && dd.t.savedNoteBar) || '')
    const gotTxt = bars.length ? String(await bars[0].text()).trim() : ''
    ck('那条 bar 念的字＝字典里那一支（屏上文本与 `t.savedNoteBar` 逐字相等，不许写死在 wxml）',
      !!wantTxt && gotTxt === wantTxt, `屏上「${gotTxt}」｜字典「${wantTxt}」`)
    ck('那条 bar 的面吃的是这一页 `.panel` 同一枚令牌（源码里不许写死一支色）',
      /\.saved-bar\s*\{[^}]*background:\s*var\(--bg-card\)/.test(DCODE), '源码级断言')
    const barBox = await live('.saved-bar')
    ck('那条 bar 贴在视口下沿那一档（底距＝24rpx 起跳，多出来的只可能是系统底部安全区）',
      !!barBox && barBox.top !== null,
      barBox && barBox.top !== null
        ? `条底 ${(barBox.top + barBox.h).toFixed(1)}｜视口 ${win.h}＝差 ${(win.h - barBox.top - barBox.h).toFixed(1)}px`
        : '读不到')
    const barEl = bars.length ? bars[0] : null
    let zBar = null
    if (barEl) {
      const bs = await barEl.size(), bo = await barEl.offset()
      ck('那条 bar 的左右内缩与全站那扇窗同一枚（24rpx，误差 ≤1px）',
        Math.abs(bo.left - 24 * R) <= 1 && Math.abs((win.w - (bo.left + bs.width)) - 24 * R) <= 1,
        `左 ${bo.left.toFixed(1)}｜右 ${(win.w - bo.left - bs.width).toFixed(1)}｜24rpx=${(24 * R).toFixed(1)}px`)
      const face = String(await barEl.style('background-color'))
      const fc2 = (face.match(/\d+/g) || []).map(Number)
      ck('屏上读回的 bar 面＝墨档那一份 #F3F3F1（容 ±8：色域转换会造出个位数差）',
        fc2.length === 3 && fc2.every((v, i) => Math.abs(v - [243, 243, 241][i]) <= 8), `屏上 ${face}`)
      // ⚠ 这一条量的是**那一行字**（`.saved-bar-x`），不是外面那只盒子：`.saved-bar` 自己没写 color，
      //   拿它读"这行字什么色"读到的是页面继承下来的那支（这台模拟器回 rgb(53,46,29)），假红一条。
      const xEl = await dp.$('.saved-bar-x')
      const xColor = xEl ? String(await xEl.style('color')) : ''
      ck('bar 里那行字仍是这一页那档墨（rgba(35,37,44,.9)，与 `.sv-h2`／`.panel` 同一支）',
        /rgba\(\s*35,\s*37,\s*44,\s*0?\.9\s*\)/.test(xColor), xColor || '读不到 .saved-bar-x')
      ck('那一行字吃的是 `--fs-meta`、并且带 700（与列表那几格同档，不新造字号）',
        /\.saved-bar-x\s*\{[^}]*font-size:\s*var\(--fs-meta\)/.test(DCODE) &&
        /\.saved-bar-x\s*\{[^}]*font-weight:\s*700/.test(DCODE), '源码级断言')
      // 层序现在读（再往下一趟就 reLaunch 了，`barEl` 会成"不在栈顶那一页"的元素、一读就崩）。
      zBar = Number(await barEl.style('z-index'))
    }
    // fixed 这件事只有真跑读得出：写成 absolute 就跟着内容走，屏上看着"在底下"、一滚就上来。
    const barA = await live('.saved-bar')
    await mp.evaluate(() => wx.pageScrollTo({ scrollTop: 600, duration: 0 }))
    await sleep(1200)
    const barMid = await live('.saved-bar')
    ck('整页滚了 600 那条 bar 一毫米都没动（它是钉住的那一层，不是流里的一格）',
      !!barA && !!barMid && barA.top !== null && barMid.top !== null && Math.abs(barMid.top - barA.top) <= 0.5,
      barA && barMid ? `${barA.top.toFixed(1)} → ${barMid.top.toFixed(1)}` : '读不到')
    // 钉住的那一层最容易压住最后一格：流里那一段留白（`.saved-space`）就是给它让的位置。
    // ⚠ 判"压没压住"必须**先真滚到底**：只 `scrollTop:600` 时文档还没到底，读到的落点是中间态。
    await mp.evaluate(() => wx.pageScrollTo({ scrollTop: 99999, duration: 0 }))
    await sleep(1200)
    const spaceA = await live('.saved-space')
    ck('流里给 bar 留的那一段在（没有它，最后一格会被钉住的那层压住）',
      !!spaceA && spaceA.top !== null && spaceA.h > 0,
      spaceA && spaceA.top !== null ? `留白高 ${spaceA.h.toFixed(1)}px` : '没读到 .saved-space')
    const barAtBottom = await live('.saved-bar')
    const lastPanel = (await dp.$$('.panel')).slice(-1)[0]
    if (lastPanel && barAtBottom && barAtBottom.top !== null) {
      const lp = await lastPanel.size(), lo = await lastPanel.offset()
      ck('滚到底时最后一格内容仍在 bar 上方（屏上不许出现"字压在条上"）',
        lo.top + lp.height <= barAtBottom.top + 1,
        `最后一格底 ${(lo.top + lp.height).toFixed(1)}｜bar 顶 ${barAtBottom.top.toFixed(1)}`)
    }
    console.log('　截图 ' + await shot('70-详情页存完那条bar.png'))
    // 反向：同一篇不带 `saved=1` 再开一次 ⇒ 那条 bar 不许在。这一条是那枚开关唯一的牙
    // （留着它就等于"每次点开任何一篇都在页底提醒一句已收藏"）。
    await mp.reLaunch(`/pages/detail/detail?id=${nid}`)
    await sleep(4000)
    const dp2 = await mp.currentPage()
    const dd2 = await dp2.data()
    ck('不带 `saved=1` 从列表那一头开同一篇：那条 bar 不画',
      dd2.savedBar === false && (await dp2.$$('.saved-bar')).length === 0
      && (await dp2.$('.saved-space')) === null,
      `savedBar=${dd2.savedBar}｜bar ${(await dp2.$$('.saved-bar')).length} 条｜留白 ${await dp2.$('.saved-space') ? '在' : '不在'}`)
    console.log('　截图 ' + await shot('70-详情页平时态没有bar.png'))
    // 层序：bar 60 在内容之上、私密那一层 `.pwd-mask`（100）之下 ⇒ 锁着的笔记弹出密码面板时不被条压住。
    const PWD = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/styles/pwd-sheet.wxss'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const zPwd = Number(((PWD.match(/\.pwd-mask\s*\{[^}]*z-index:\s*(\d+)/) || [])[1]) || NaN)
    ck('层序对：那条 bar（60）压在内容之上、私密那一层 `.pwd-mask` 之下',
      Number.isFinite(zBar) && Number.isFinite(zPwd) && zBar < zPwd, `bar=${zBar}｜pwd-mask=${zPwd}`)
  }

  console.log(`\n${bad.length ? '红 ' + bad.length + ' 条：' + bad.join(' / ') : '全过'}`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('崩：', e && e.message ? e.message : e); process.exit(3) })
