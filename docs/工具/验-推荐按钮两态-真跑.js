// 首屏那一枚「告诉好友」的**真跑**尺子（站长 10-20 一夜十五句，逐句原文与谁顶掉谁记在
// create.wxml 那一块注释与 PRD §8.393～§8.395；这里只留"屏上必须读到什么"）：
//   形：①黄色横条 → ②精致小巧 → ⑤黑半透明＋白字＋一支斜 45° 黄纸飞机 → ⑥⑦飞机上下出头 →
//       ⑧胶囊加宽 → ⑨与英文居中 → ⑩收缝 → ⑪透明度 50% → **⑫⑬ 照他给的图 1:1 复刻**
//       （黄底实心、图标与字是墨、飞机收进胶囊、圆角 13、投影撤）
//   落点：③英文下面＋列表页 → ④只留首屏与拍照屏 → **⑭移到左上角，住在那句话前面**
//   话术：④"推荐好友" → ⑤"推荐给好友" → ⑫"告诉好友" ＋ ⑮那一行改成「图麦笔记：仅需10秒拍照截图网页转笔记」
//   ⇒ ⑤⑥⑦⑨⑪ 那一串（暗纱、白字、出头、与英文居中、整枚透明度）到这一版全部作废，
//     留在尺子里就是假绿／假红，所以这一把从头重写。
// 跑法：docs/工具/跑尺子.sh 9431 验-推荐按钮两态-真跑
//
// 为什么静态那批不够、非要连 IDE：这一枚的坑正是**静态全绿、屏上是另一颗**。
// 微信给 button 自带一条 `.wx-btn { width:184px }`（特异度 0,1,0，与裸类同分却排在后面）⇒
// 源码 `width:144rpx` 写得清清楚楚，屏上渲染出来是 184px 居中的大胶囊。只有把屏拉起来量真实矩形才抓得到。
// 这一版另加三格也只有屏上会说：
// ① 「照这张图收进去」＝**四个边都在胶囊内**，源码不写 absolute 不等于屏上没被别处抬出去；
// ② ⑭ 那一刀把这一枚塞进一条 `nowrap` 的 flex 行 ⇒ 挤不挤得下只有量右沿知道（挤了不折行，
//    是把最右那枚中/EN 角标顶出屏，而静态三条声明一条都不会红）；
// ③ ⑮ 那句改短换来的正是这一行的**高度**：他 10-15 00:3x 钉过"这一行只要一行字那么高，不要浪费空间"
//    （≤96rpx），按钮 44 比那行字 32.4 高，撑没撑破那一档只有量渲染高度知道。
//
// ⚠ 关于"量到的是哪一格"：飞机是 mask 出来再转 45° 的，屏上读回来的矩形各端不一致——
//   有的端口报**转过的外接框**（18×√2≈25.5 见方，含 mask 之外那圈全透明的空白），有的只报布局框（18）。
//   所以下面一律先取**框心**，再从框心按 0.884／0.1178 那两个比例反算"看得见的墨迹"在哪，
//   绝不拿读回来的宽高直接当墨迹（28 那一版把"黄的框 32.2"当成屏上该读到的数，连着假红两次）。
const automator = require('miniprogram-automator')

const TIP_DOT = 'rgb(246, 196, 69)'   // 色板里唯一那支黄（实心，⑫「改为黄底」之后屏上就该读到它）
const INK = 'rgb(35, 37, 44)'         // LAYER_INK：图标与字共用这一档（⑬ 那张图是"一块实心色＋同色的图标与字"）

/* 下面这一组是**源文件里那一组数**（styles/rec-bar.wxss ＋ pages/create/create.wxss）。
   静态那把 `验-第一屏三块.js` 先把这几格的账逐条对一遍（每一档都是从站长那张图按 H 比例量回来的），
   这一把只证"屏上真的按这个数渲染了"。 */
const MODEL = {
  barW: 144, barH: 44, radius: 13,
  side: 18, planeML: 18, txML: 5,
  aiPad: 24,                         // 落点：`.ai-line` 的左右内缩就是这一枚的最左沿
  inkRatio: 0.884,                   // 斜 45° 后看得见的墨迹 ÷ 元素框（六个顶点现算，见静态那把的注释）
  shiftRatio: 0.1178,                // 墨迹中心比框中心偏左／偏下这么多 × 框宽
  stripMax: 96,                      // 10-15 00:3x 那一档：这一行整枚 ≤96rpx
}
MODEL.ink = MODEL.side * MODEL.inkRatio                 // 15.9 见方
MODEL.aabb = MODEL.side * Math.SQRT2                    // 有的端口读回来的是这一格：25.5
MODEL.inkRightFromCx = -MODEL.side * MODEL.shiftRatio + MODEL.ink / 2   // 墨迹右沿离框心 ＋5.84
MODEL.inkCyFromCy = MODEL.side * MODEL.shiftRatio       // 墨迹中心比框中心低 2.12

let pass = 0
const fails = []
const ck = (name, cond, extra) => {
  if (cond) { pass += 1; console.log('  ✓ ' + name); return }
  fails.push(name + (extra ? ' —— 实得：' + extra : ''))
  console.log('  ✗ ' + name + ' —— 实得：' + extra)
}

async function box(page, sel) {
  const el = await page.$(sel)
  if (!el) return null
  const o = await el.offset()
  const s = await el.size()
  return { left: o.left, top: o.top, width: s.width, height: s.height, right: o.left + s.width, bottom: o.top + s.height }
}
const boxes = async (page, sel) => {
  const out = []
  for (const el of await page.$$(sel)) { const o = await el.offset(); const s = await el.size(); out.push({ left: o.left, top: o.top, width: s.width, height: s.height, right: o.left + s.width, bottom: o.top + s.height }) }
  return out
}
const st = async (page, sel, prop) => { const el = await page.$(sel); return el ? await el.style(prop) : null }

// 一屏该量的全量一遍：两态用的是同一份皮、同一个落点式子，判据也必须是同一组。
async function measure(page, tag, R, toRpx) {
  const bar = await box(page, '.rec-bar')
  const strip = await box(page, '.ai-line')
  const tx = await box(page, '.rec-bar .rec-tx')
  const aiTx = await box(page, '.ai-text')
  const corner = await box(page, '.lang-corner')
  const panel = await box(page, '.home-blk')
  console.log(`  读数 ${tag}：bar ` + JSON.stringify(bar) + `\n           ai-line ` + JSON.stringify(strip))
  ck(`${tag}这一枚渲染得出来（静态全绿不代表屏上有东西，button 里塞子元素这一族更要量）`, !!bar, JSON.stringify(bar))
  if (!bar) return null
  ck(`${tag}屏上宽度＝照那张图一排加出来的 ${MODEL.barW}rpx，不是微信默认那条 184px 静默顶上来`,
    Math.abs(toRpx(bar.width) - MODEL.barW) <= 3 && bar.width < 130,
    `${bar.width.toFixed(1)}px ≈ ${toRpx(bar.width).toFixed(1)}rpx（184px 那一档会是 ${toRpx(184).toFixed(1)}rpx）`)
  ck(`${tag}高维持 ④ 那一档 ${MODEL.barH}rpx（⑤⑥⑦ 三句钉「按钮高度维持之前高度」，到 ⑮ 没被撤）`,
    Math.abs(toRpx(bar.height) - MODEL.barH) <= 2, `${bar.height.toFixed(1)}px ≈ ${toRpx(bar.height).toFixed(1)}rpx`)
  ck(`${tag}圆角读回来是图里那档 0.286H＝${MODEL.radius}rpx（不是原来 22 那一档胶囊帽）`,
    Math.abs(toRpx(parseFloat(await st(page, '.rec-bar', 'border-top-left-radius')) || 0) - MODEL.radius) <= 2,
    await st(page, '.rec-bar', 'border-top-left-radius'))
  ck(`${tag}整枚不在这下方那块面板之上（⑭ 之后它住在最上面那一行，爬进面板就是落点错了）`,
    !panel || bar.bottom <= panel.top + 1, `按钮底 ${bar.bottom.toFixed(1)} / 面板顶 ${panel && panel.top.toFixed(1)}`)
  /* ⑫「改为黄底」：底是**实心**那支黄。屏上读到 rgba 就是旧那层暗纱（⑤⑪）还挂着；
     读到框架默认那支灰白就是色板那一档没发下来（`--cp-rec-plate` 漏一档＝那条属性整条没值）。 */
  const bgc = await st(page, '.rec-bar', 'background-color')
  ck(`${tag}面上读回来就是色板那支实心黄（⑫「改为黄底」；不是 rgba、不是旧暗纱、不是微信那层默认灰）`,
    bgc === TIP_DOT, JSON.stringify(bgc))
  const bgi = await st(page, '.rec-bar', 'background-image')
  ck(`${tag}旧那层渐变／立体那档已经不在这枚上（⑬ 那张图是扁平的）`, !/gradient/.test(bgi || ''), JSON.stringify(bgi))
  const shd = await st(page, '.rec-bar', 'box-shadow')
  ck(`${tag}屏上没有投影（⑬「1:1 复刻」随那张图一起撤的，它边缘量不到第二层暗边）`,
    !shd || /none/.test(shd), JSON.stringify(shd))
  ck(`${tag}整枚没有 opacity（④ 那层 .8 与 ⑪ 那一档都随「黄底」撤净；实心黄跟着淡就又是一层纱）`,
    parseFloat(await st(page, '.rec-bar', 'opacity')) === 1, await st(page, '.rec-bar', 'opacity'))
  /* ⑫ 之后图标与字**共用同一档墨**：白压那支黄只有 1.63（正文门槛 4.5），所以这一枚不可能白字。
     字色读回框架默认（黑）或纯白都算红——前者＝色板没发下来，后者＝有人把 ⑤ 那句"字体白色"挂回去。 */
  ck(`${tag}字面渲染出来是色板那支墨（不是白、也不是没发下来时框架给的那支）`,
    (await st(page, '.rec-bar', 'color')) === INK, await st(page, '.rec-bar', 'color'))
  const fw = await st(page, '.rec-bar', 'font-weight')
  ck(`${tag}字重渲染出来不是 700（⑦「字体不要加粗」；700 是我上一版自己抬的）`,
    fw !== '700' && fw !== 'bold', JSON.stringify(fw))
  /* 层序那一刀（10-20「推荐好友要拉起分享的页面」）：这一屏有一层 fixed ＋ z-index:1 ＋ 铺满
     750rpx×100vh 的调亮度罩子 ⇒ **opacity 为 0 也照样吃点击**（透明≠不可点）。
     ⑭ 之后这一枚住在 `.ai-line` 里，而那一行本来就在抬层名单里；名单里 `.rec-bar` 那一笔我没删，
     这一条钉的就是渲染端真的按它排（同一族前两次：.home-swap／.ai-line 都是"声明在、屏上没生效"）。 */
  const scrim = await page.$('.page-scrim')
  const zBar = parseFloat(await st(page, '.rec-bar', 'z-index'))
  if (scrim) {
    const zScrim = parseFloat(await scrim.style('z-index'))
    ck(`${tag}铺图那一态：按钮的层排在调亮度罩子之上（不然罩子把 open-type="share" 那一下吃掉）`,
      zBar > zScrim, `按钮 z-index ${zBar} vs 罩子 ${zScrim}`)
    ck(`${tag}罩子仍吃点击（这一条是"为什么原来按不动"的根，撤了它上一条就没意义了）`,
      (await scrim.style('pointer-events')) !== 'none', await scrim.style('pointer-events'))
  } else ck(`${tag}这一态没有那层罩子（无图态本来就没有，按钮不需要抬）`, true, '没渲染 .page-scrim')
  const dots = await boxes(page, '.rec-bar .rec-dot')
  ck(`${tag}④ 那两颗点不在这一枚上（⑤ 换图标时撤的——**这一处是我自己撤的、他没点名**）`,
    dots.length === 0, `${dots.length} 枚：${JSON.stringify(dots)}`)
  const slot = await box(page, '.rec-slot')
  ck(`${tag}⑥ 那一版"飞机外挂一层壳"不在屏上（留着一层就是两版摆法同时挂在屏上）`, !slot, JSON.stringify(slot))
  const plane = await box(page, '.rec-bar .rec-plane')
  ck(`${tag}纸飞机那一格画得出来（button 里装子元素这一族，屏上有没有东西只有量知道）`,
    !!plane && plane.width > 0 && plane.height > 0, JSON.stringify(plane))
  const tf = await st(page, '.rec-bar .rec-plane', 'transform')
  const mat = /matrix\(([^)]*)\)/.exec(tf || '')
  const isUpTilt = /rotate\(\s*-45deg\s*\)/.test(tf || '') || (!!mat && parseFloat(mat[1].split(',')[1]) <= -0.5)
  ck(`${tag}飞机真的斜过来了、且是机头朝右上那一头（−45°；读回 none 或正值＝平躺／朝下扎）`,
    isUpTilt, JSON.stringify(tf))
  const planeInkBgc = await st(page, '.rec-bar .rec-plane', 'background-color')
  const barColor = await st(page, '.rec-bar', 'color')
  ck(`${tag}图标吃的是**字同一档墨**（⑬ 那张图是"实心色块＋同色的图标与字"；发两档就是下一次各说一套）`,
    planeInkBgc === barColor && planeInkBgc === INK, `图标 ${JSON.stringify(planeInkBgc)}／字 ${JSON.stringify(barColor)}`)
  if (plane) {
    /* ⑫ 那一句「照这张图收进去」＝顶、底、左、右四条边都不许出胶囊。
       读回来的框不管是 18 还是 25.5（转过的外接框），它一定是墨迹的超集 ⇒ 外接框都在里面，
       墨迹一定在里面。⑥⑦ 那一版反过来钉"两头都出头"，那两条旧判据不许回来。 */
    ck(`${tag}飞机整枚收在胶囊里（⑫「照这张图收进去」；⑥⑦ 那两截出头已作废）`,
      plane.left >= bar.left - 0.5 && plane.right <= bar.right + 0.5
      && plane.top >= bar.top - 0.5 && plane.bottom <= bar.bottom + 0.5,
      `框 ${toRpx(plane.left - bar.left).toFixed(1)},${toRpx(plane.top - bar.top).toFixed(1)} 起、${toRpx(plane.width).toFixed(1)}×${toRpx(plane.height).toFixed(1)}rpx vs 胶囊 ${MODEL.barW}×${MODEL.barH}`)
    ck(`${tag}那一格读回来是 18 或 18×√2≈25.5 见方（两端口两样，但一定是正方；读出 72＝旧那一档没撤）`,
      Math.abs(plane.width - plane.height) <= 1
      && (Math.abs(toRpx(plane.width) - MODEL.side) <= 2 || Math.abs(toRpx(plane.width) - MODEL.aabb) <= 2),
      `${plane.width.toFixed(1)}×${plane.height.toFixed(1)}px ≈ ${toRpx(plane.width).toFixed(1)}rpx 见方（布局框 ${MODEL.side}／转过的框 ${MODEL.aabb.toFixed(1)}）`)
    if (tx) {
      /* 下面三格量的都是**看得见的墨迹**：从框心按 0.884／0.1178 那两个比例反算，
         不拿读回来的框直接当墨迹（框外面那一圈是 mask 的空白，压到字上什么也画不出来）。 */
      const cx = (plane.left + plane.width / 2 - bar.left) / R
      const cy = (plane.top + plane.height / 2 - bar.top) / R
      const inkR = cx + MODEL.inkRightFromCx
      const inkCy = cy + MODEL.inkCyFromCy
      const txL = (tx.left - bar.left) / R
      const txCy = (tx.top + tx.height / 2 - bar.top) / R
      ck(`${tag}墨迹与字之间那道缝＝图里量到的 0.190H≈8.4rpx（⑩「空隙太大」在 1:1 那版的落点，±2.5）`,
        txL > inkR && Math.abs((txL - inkR) - 0.190 * MODEL.barH) <= 2.5,
        `墨迹右沿 ${inkR.toFixed(1)} → 字左 ${txL.toFixed(1)}＝${(txL - inkR).toFixed(1)}rpx（皮里 ${MODEL.planeML}＋${MODEL.side}＋${MODEL.txML}）`)
      ck(`${tag}墨迹与字同一条中线（斜过来之后墨迹比框低 0.118×size，那一格 top:-2rpx 没写就是屏上低一截）`,
        Math.abs(inkCy - txCy) <= 2.5, `墨迹心 y ${inkCy.toFixed(1)} vs 字心 ${txCy.toFixed(1)}rpx`)
      /* 字面左沿＝18＋18＋5＝41rpx，这一档是源码写死的、两端口都一样；
         而"右内缩"＝板宽−字左沿−**渲染出来的字宽**，四个汉字在开发者工具里被取整成 10px（76.9rpx）、
         真机按 1em 走是 84rpx——同一句源码两块屏差 7rpx（§8.393 那一刀就是这么红的）。
         所以这里钉两条：左沿必须正好 41（±2），右内缩只卡"不许小于图里那档 18.2、也不许多出
         模拟器那一档取整量（7）再加 5 的余量"。拿 18.2 直接卡死＝把模拟器判成错。 */
      /* ±4rpx 不是放松预算，是这条链上**三段取整**的量：18／18／5rpx 在屏上分别是 9.36／9.36／2.6px，
         三头各吃掉不到半像素，最坏能差到 2px＝这一档窗口下 3.8rpx。⑩ 那一刀真错的时候量到的是 11.5
         对 1.6（差 10rpx），这一档卡得住。 */
      ck(`${tag}字那一列的左沿＝皮里写死的 18＋18＋5＝41rpx（两端口都一样，差只许到取整那一档）`,
        Math.abs(txL - (MODEL.planeML + MODEL.side + MODEL.txML)) <= 4,
        `字左沿 ${txL.toFixed(1)}rpx vs 应有 ${MODEL.planeML + MODEL.side + MODEL.txML}`)
      const rInset = (bar.right - tx.right) / R
      ck(`${tag}四个字的右沿离胶囊右沿＝图里那档 0.413H≈18.2（真机那一头），模拟器取整那一档也不许多过 30`,
        rInset >= 0.413 * MODEL.barH - 1 && rInset <= 0.413 * MODEL.barH + 12,
        `右内缩 ${rInset.toFixed(1)}rpx、字面宽 ${toRpx(tx.width).toFixed(1)}rpx（模拟器 10px/字＝76.9、真机 1em＝84）`)
    }
  }
  /* ---------- ⑭⑮ 那一格：这一枚现在住在首屏最上面那一行里 ---------- */
  if (strip && aiTx && corner) {
    ck(`${tag}⑭ 左上角：这一枚的最左沿就是那一行的内缩 ${MODEL.aiPad}rpx（不另带 margin-left，缝不许住两处）`,
      Math.abs(toRpx(bar.left - strip.left) - MODEL.aiPad) <= 2,
      `按钮左 ${bar.left.toFixed(1)} − 行左 ${strip.left.toFixed(1)}＝${toRpx(bar.left - strip.left).toFixed(1)}rpx`)
    ck(`${tag}这一枚整枚在那一条玻璃带之内（住进来了，不是飘在带子上面／下面）`,
      bar.top >= strip.top - 0.5 && bar.bottom <= strip.bottom + 0.5,
      `按钮 ${bar.top.toFixed(1)}–${bar.bottom.toFixed(1)} vs 带 ${strip.top.toFixed(1)}–${strip.bottom.toFixed(1)}`)
    /* 抬 6 那一格（`margin-top: -6rpx`）：静态那把按声明算，这一条按屏上两个矩形的中心比。
       读回来差得多＝那一行的 `align-items` 或那行字的 line-height 与这里假设的不是同一档。 */
    ck(`${tag}与那行字同一条中线（±2rpx；不抬那一格屏上黄块比字低一截）`,
      Math.abs((bar.top + bar.height / 2) - (aiTx.top + aiTx.height / 2)) / R <= 2,
      `按钮心 ${(bar.top + bar.height / 2).toFixed(1)} vs 字心 ${(aiTx.top + aiTx.height / 2).toFixed(1)}＝${toRpx((bar.top + bar.height / 2) - (aiTx.top + aiTx.height / 2)).toFixed(1)}rpx`)
    /* ⑮ 那句改短换来的正是这一格：那一行是 `nowrap`，挤不下**不折行**，而是把最右那枚角标顶出屏。
       所以这里钉两条：字与角标不许重叠、角标的右沿不许越过那一行的内缩。 */
    ck(`${tag}⑮ 之后这一行仍然排得下：那行字与最右那枚中/EN 角标不重叠`,
      aiTx.right <= corner.left + 0.5, `字右 ${aiTx.right.toFixed(1)} vs 角标左 ${corner.left.toFixed(1)}`)
    ck(`${tag}角标没被顶出那一行（右沿离带右沿＝${MODEL.aiPad}rpx 内缩，±3）`,
      Math.abs(toRpx(strip.right - corner.right) - MODEL.aiPad) <= 3,
      `带右 ${strip.right.toFixed(1)} − 角标右 ${corner.right.toFixed(1)}＝${toRpx(strip.right - corner.right).toFixed(1)}rpx`)
    console.log(`  · 备忘（不是判据）${tag}：这一行现在 ${toRpx(strip.height).toFixed(1)}rpx 高（按钮 ${toRpx(bar.height).toFixed(1)}、字 ${toRpx(aiTx.height).toFixed(1)}；上限那一档 ${MODEL.stripMax}）`)
  } else ck(`${tag}那一行读得全（玻璃带／那行字／角标三枚都要在）`, false, `strip ${JSON.stringify(strip)} aiTx ${JSON.stringify(aiTx)} corner ${JSON.stringify(corner)}`)
  ck(`${tag}首屏那一行整枚不超过 10-15 00:3x 那一档 ≤${MODEL.stripMax}rpx（塞进 44 高的按钮不许把它撑破）`,
    !!strip && toRpx(strip.height) <= MODEL.stripMax, strip && `${toRpx(strip.height).toFixed(1)}rpx`)
  return bar
}

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  const R = (await mp.systemInfo()).windowWidth / 750   // 屏上 1rpx 是多少 px
  const toRpx = (px) => px / R
  console.log(`  窗口 ${(await mp.systemInfo()).windowWidth}px ⇒ 1rpx=${R.toFixed(4)}px`)

  // ---------- ① 首屏（收起那一态）----------
  await mp.switchTab('/pages/create/create')
  const hp = await mp.currentPage(); await hp.waitFor(900)
  const dockClass0 = (await (await hp.$('.container')).attribute('class')) || ''
  const bar0 = await measure(hp, '首屏', R, toRpx)
  const txEl = await hp.$('.rec-bar .rec-tx')
  const aiEl = await hp.$('.ai-text')
  ck('首屏那一枚屏上念的就是 ⑫ 那四个字（读渲染端的 text，不读字典——字典发了而屏上没换＝另有来源）',
    txEl ? ((await txEl.text()) || '').trim() === '告诉好友' : false, txEl ? JSON.stringify(await txEl.text()) : '没抓到 .rec-bar .rec-tx')
  ck('那一行屏上念的是 ⑮ 那一句（「图麦笔记：仅需10秒拍照截图网页转笔记」）',
    aiEl ? ((await aiEl.text()) || '').trim() === '图麦笔记：仅需10秒拍照截图网页转笔记' : false,
    aiEl ? JSON.stringify(await aiEl.text()) : '没抓到 .ai-text')

  // ---------- ② 展开那一屏（快门／拍照那一档＝他说的"拍照屏"）----------
  await hp.setData({ active: 'photo' })
  await hp.waitFor(900)
  const dockClass = (await (await hp.$('.container')).attribute('class')) || ''
  ck('展开那一态容器真挂上了 entry-dock（不然量的还是首屏那一态）',
    /(?:^|\s)entry-dock(?:\s|$)/.test(dockClass) && !/(?:^|\s)entry-dock(?:\s|$)/.test(dockClass0), dockClass)
  const bar1 = await measure(hp, '拍照屏', R, toRpx)
  ck('两态是同一颗：屏上位置与大小一模一样（两态各画一枚、迟早长得不一样）',
    !!bar0 && !!bar1 && Math.abs(bar0.width - bar1.width) <= 1 && Math.abs(bar0.height - bar1.height) <= 1
    && Math.abs(bar0.left - bar1.left) <= 1 && Math.abs(bar0.top - bar1.top) <= 1,
    `首屏 ${bar0 && bar0.left.toFixed(1)},${bar0 && bar0.top.toFixed(1)} ${bar0 && bar0.width.toFixed(1)}×${bar0 && bar0.height.toFixed(1)}px／拍照屏 ${bar1 && bar1.left.toFixed(1)},${bar1 && bar1.top.toFixed(1)} ${bar1 && bar1.width.toFixed(1)}×${bar1 && bar1.height.toFixed(1)}px`)
  await hp.setData({ active: '' })

  // ---------- ③ 列表那一屏：④ 说"不再放在列表页"，撤掉的东西不许还在屏上 ----------
  await mp.switchTab('/pages/index/index')
  const ip = await mp.currentPage(); await ip.waitFor(900)
  const iBar = await box(ip, '.rec-bar')
  ck('笔记列表那一屏读不到这一枚（④「不再放在列表页」——撤干净了才谈得上"只放在首屏和拍照屏"）',
    !iBar, JSON.stringify(iBar))

  // ---------- 两张图留给人看 ----------
  const shots = []
  const fs = require('fs')
  await mp.switchTab('/pages/create/create')
  const cp = await mp.currentPage()
  for (const [tag, act] of [['首屏', ''], ['拍照屏', 'photo']]) {
    await cp.setData({ active: act })
    await cp.waitFor(900)
    const f = `/tmp/rec-bar-${tag}.png`
    await mp.screenshot({ path: f })
    if (fs.existsSync(f)) shots.push(f)
  }
  await cp.setData({ active: '' })
  console.log('  两张图：' + shots.join('　'))

  await mp.disconnect()
  console.log(`\n验-推荐按钮两态-真跑：${pass} 过${fails.length ? `　✗ ${fails.length} 条：\n  ` + fails.join('\n  ') : '　全绿'}`)
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.log('!! 尺子挂：' + e.message); process.exit(1) })
