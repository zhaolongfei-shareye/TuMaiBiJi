// 「推荐给好友」那一枚的**真跑**尺子（站长 10-20 一夜八句：加在英文下方 → 精致小巧不盖人、
// 长度不许超过英文 → 首屏和笔记列表都要、相同的位置 → 只放在首屏和拍照屏、整体80%透明度＋
// 字压成"推荐好友"前后加小圆点 → 字改「推荐给好友」、位置再上移、底＝黑半透明、字＝白、
// 一支黄色纸飞机 → 「纸飞机在文字左边，按钮高度维持之前高度」→ 「不是嵌入按钮，是在按钮上面，
// 高度要超过按钮高度，往下一点留出空间」→ 「按钮在纸飞机的底部，上尖超过、下尖也超过，
// 字体不要加粗，要清晰」→ 「按钮长度要长一点，能容纳纸飞机和文字」，最后这一句我摆出它与上一句
// 的矛盾请他指，他指的是"胶囊加宽、飞机照旧上下出头"那一格）。
// 跑法：docs/工具/跑尺子.sh 9431 验-推荐按钮两态-真跑
//
// 为什么静态那批不够、非要连 IDE：这一枚的坑正是**静态全绿、屏上是另一颗**。
// 微信给 button 自带一条 `.wx-btn { width:184px }`，特异度 0,1,0，与裸类 `.rec-bar` 同分却排在
// 后面 ⇒ 源码里 `width:146rpx` 写得清清楚楚，屏上渲染出来是 184px 居中的大胶囊，压在人脸上下巴
// 之间，其余属性一条不缺地生效。只有把屏拉起来量真实矩形才抓得到（第一版就是这么打回的）。
// 换皮之后同一族又添的格，全是"写在源码里、屏上未必吃进去"那一类：
// ① 半透明落在面上（`background` 从渐变换成一支 rgba，`.wx-btn` 那层要是不让，读回来是实心色）；
// ② 白字落在 `color` 上（色板发漏一档就读回框架给的默认字色）；
// ③ 不加粗落在 `font-weight` 上（⑦「字体不要加粗」——我上一版自己抬的 700 得从屏上撤掉）；
// ④ 「高度斜45度」落在 `transform` 上——转错了方向屏上照样是一支斜的飞机，只有计算值会说；
// ⑤ 出头那两截落在**渲染矩形**上：微信那层默认皮带裁切，源码写了 visible 而屏上被削平，
//    只有量矩形才看出来（所以下面按外接框的四条边现算）。
//
// ⚠ 关于"量到的是哪一格"：飞机是 mask 出来的，屏上读回来的矩形＝**元素的外接框**
//   （72×√2≈101.8 见方，含 mask 之外那圈全透明的空白），不是那支黄本身的框（82.7）。
//   判据按外接框钉、再把黄的位置从外接框**反算**回去（下面 MODEL 那几行），两个数不许混——
//   28 那一版就是把"黄的框 32.2"当成屏上该读到的数，连着假红两次。
//
// ⚠ 这一把管不了"不盖住人"那一句的全部：背景是站长自己挑的照片，脸上沿在哪一像素没有可编程的
// 依据。这里只能钉住可量的那一半，剩下那一半＋「纸飞机那张形状到底像不像」靠末尾那两张截图用眼睛过。
const automator = require('miniprogram-automator')

const PNG_W = 500
const EN_BAND = { x0: 101, x1: 422 }   // 位图画布上的英文墨迹（第三行 `Save what matters`）
const TIP_DOT = 'rgb(246, 196, 69)'    // 色板里那支芥末黄在屏上 read 回来的样子（rgb 写法）
const WHITE = 'rgb(255, 255, 255)'

/* 下面这一组是**源文件里那一组数**（styles/rec-bar.wxss），抄在这儿是为了先把"屏上该读到什么"算出来。
   谁改了皮，静态那把 `验-第一屏三块.js` 会先把这几格的账逐条对一遍（斜过来那支黄多大、
   出头两头各多少、两列横向排不排得开都在那边钉着）；这一把只证"屏上真的按这个数渲染了"。 */
const MODEL = {
  barW: 208, barH: 44, padR: 12, fsTiny: 21, zhChars: 5,
  side: 72, top: -25, left: 6,
  // 路径自己在 24 格画布上占宽 21／高 18（x 2→23、y 3→21）：转 45° 后横竖都变成 (宽＋高)×sin45。
  inkRatio: ((21 + 18) / 24) * Math.SQRT1_2,
}
MODEL.tilt = MODEL.side * MODEL.inkRatio                      // 看得见的那一支黄＝82.7
MODEL.aabb = MODEL.side * Math.SQRT2                          // 屏上读回来的那一格＝101.8
MODEL.inkTop = MODEL.top + MODEL.side / 2 - MODEL.tilt / 2    // 相对胶囊顶边（负＝在顶边之上）
MODEL.inkBottom = MODEL.top + MODEL.side / 2 + MODEL.tilt / 2 // 相对胶囊顶边（>44＝在底边之下）
MODEL.inkRight = MODEL.left + MODEL.side / 2 + MODEL.tilt / 2 // 黄那一列的右沿
MODEL.txLeft = MODEL.barW - MODEL.padR - MODEL.zhChars * MODEL.fsTiny // 五个字那一列的左沿

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

// 英文墨迹换算到屏上（b 是那一枚 <image> 的真实矩形；等比，所以直接按宽的比例切）
const ink = (b) => ({
  left: b.left + b.width * (EN_BAND.x0 / PNG_W),
  width: b.width * ((EN_BAND.x1 - EN_BAND.x0) / PNG_W),
})

// 一屏该量的全量一遍：两态用的是同一份皮、同一个落点式子，判据也必须是同一组。
async function measure(page, tag, R, toRpx) {
  const bar = await box(page, '.rec-bar')
  const title = await box(page, '.page-title')
  const panel = await box(page, '.home-blk')
  console.log(`  读数 ${tag}：bar ` + JSON.stringify(bar) + `\n           title ` + JSON.stringify(title))
  ck(`${tag}这一枚渲染得出来（静态全绿不代表屏上有东西，button 里塞子元素这一族更要量）`, !!bar, JSON.stringify(bar))
  if (!bar) return null
  ck(`${tag}屏上宽度是 ⑧ 那一档 ${MODEL.barW}rpx，不是微信默认那条 184px 静默顶上来`,
    Math.abs(toRpx(bar.width) - MODEL.barW) <= 3 && bar.width < 130,
    `${bar.width.toFixed(1)}px ≈ ${toRpx(bar.width).toFixed(1)}rpx（184px 那一档会是 ${toRpx(184).toFixed(1)}rpx）`)
  ck(`${tag}高维持 ④ 那一档 44rpx（⑤⑥⑦ 三句都钉「按钮高度维持之前高度」；竖排那一版抬到 70 已撤回）`,
    Math.abs(toRpx(bar.height) - MODEL.barH) <= 2, `${bar.height.toFixed(1)}px ≈ ${toRpx(bar.height).toFixed(1)}rpx`)
  ck(`${tag}整枚在下方那块面板之上（不许爬进面板里盖东西）`,
    !panel || bar.bottom <= panel.top + 1, `按钮底 ${bar.bottom.toFixed(1)} / 面板顶 ${panel && panel.top.toFixed(1)}`)
  // ④「整体80%透明度」：从**渲染端**读回那一档。写在 wxss 里不等于吃进去了——
  // 与 `.wx-btn` 那一族同一个病：选择器／作用域不对时它静默回 1。
  const op = await st(page, '.rec-bar', 'opacity')
  ck(`${tag}渲染出来的 opacity 就是 0.8（不是写在源码里、屏上静默回 1）`,
    parseFloat(op) === 0.8, JSON.stringify(op))
  // ⑤「黑色半透明」：这一档落在**面上**，而 `background-image` 从渐变变成了 none——
  // 所以这一格改读 `background-color`，并且钉两条：alpha 必须是 .8（不是框架那层实心色顶回来）、
  // `background-image` 里不许还挂着旧的渐变（旧皮没换干净时屏上是一块黄，静态看不出来）。
  const bgc = await st(page, '.rec-bar', 'background-color')
  ck(`${tag}面上读回来是黑色的半透明那一档（alpha 0.8，不是被微信那层实心色顶掉）`,
    /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.8\s*\)/.test(bgc || ''), JSON.stringify(bgc))
  const bgi = await st(page, '.rec-bar', 'background-image')
  ck(`${tag}旧的那层黄渐变已经不在这枚上（换皮换干净了）`,
    !/gradient/.test(bgi || ''), JSON.stringify(bgi))
  // ⑤「字体变成白色」：字色吃 --cp-rec-ink，色板那一档发漏了会静默回框架默认（黑）。
  ck(`${tag}字面渲染出来是纯白（不是色板没发下来时那支墨）`,
    (await st(page, '.rec-bar', 'color')) === WHITE, await st(page, '.rec-bar', 'color'))
  // ⑦「字体不要加粗，要清晰」：这一格只能屏上读——继承链上任何一层写了 700，源码那条声明管不住。
  const fw = await st(page, '.rec-bar', 'font-weight')
  ck(`${tag}字重渲染出来不是 700（⑦ 撤掉的那一档；700 是我上一版自己抬的）`,
    fw !== '700' && fw !== 'bold', JSON.stringify(fw))
  /* 层序那一刀（站长 10-20「推荐好友要拉起分享的页面」）：这一屏有一层 fixed ＋ z-index:1 ＋
     铺满 750rpx×100vh 的调亮度罩子，而微信给 button 的默认皮只给到 `position:relative`、
     z-index 停在 auto ⇒ 罩子排在按钮之上，**opacity 为 0 也照样吃点击**（透明≠不可点）。
     屏上实测过：罩子 z-index 1 / pointer-events auto，按钮 z-index auto ⇒ 那一下 `open-type="share"`
     从来落不到按钮上。修法＝把 `.rec-bar` 抬进这份名单（z-index 2）。
     这一条钉的是渲染端的两个计算值，不是源码里那条声明——同一族前两次（.home-swap／.ai-line）
     都是"声明在、屏上没生效"。 */
  const scrim = await page.$('.page-scrim')
  const zBar = parseFloat(await st(page, '.rec-bar', 'z-index'))
  if (scrim) {
    const zScrim = parseFloat(await scrim.style('z-index'))
    ck(`${tag}铺图那一态：按钮的层排在调亮度罩子之上（不然罩子把 open-type="share" 那一下吃掉）`,
      zBar > zScrim, `按钮 z-index ${zBar} vs 罩子 ${zScrim}`)
    ck(`${tag}罩子仍吃点击（这一条是"为什么原来按不动"的根，撤了它上一条就没意义了）`,
      (await scrim.style('pointer-events')) !== 'none', await scrim.style('pointer-events'))
  } else ck(`${tag}这一态没有那层罩子（无图态本来就没有，按钮不需要抬）`, true, '没渲染 .page-scrim')
  /* ⑤「黄色纸飞机 ICON」＋他纠回来的「纸飞机在文字左边…高度斜45度，有飞行的感觉」
     ⇒ 横排两格，飞机在左、字在右，并且飞机真的被转了 45°。
     这几格只有屏上会说：`flex-direction` 被 `.wx-btn` 顶掉时静态全绿而屏上是竖的；
     `transform` 那一条没生效时屏上是**一支平躺的纸飞机**，形状照样对、读不出"飞行"。
     ⚠ 渲染框报回来的是"转过的框"还是"没转的框"，各端不一致，所以这里不猜：
     直接读 `transform` 那一个计算值，并把飞机的实际矩形原样打进读数——
     32 见方＝量到了转过之后的框；28 见方＝这个端口只报布局框（那"转过没有"就只由 transform 那条判）。 */
  const dots = await boxes(page, '.rec-bar .rec-dot')
  ck(`${tag}④ 那两颗点已经不在这枚上（⑤ 换图标时撤的——**这一处是我自己撤的、他没点名**）`,
    dots.length === 0, `${dots.length} 枚：${JSON.stringify(dots)}`)
  // ⑥ 那一版曾把飞机挂成按钮的兄弟、外面套一层 `.rec-slot`；⑦⑧ 改成"住回按钮里"，旧壳不许还在屏上。
  const slot = await box(page, '.rec-slot')
  ck(`${tag}⑥ 那一版的壳不在屏上（留着一层就是两版摆法同时挂在屏上）`, !slot, JSON.stringify(slot))
  const plane = await box(page, '.rec-bar .rec-plane')
  const tx = await box(page, '.rec-bar .rec-tx')
  ck(`${tag}纸飞机那一格画得出来（button 里装子元素这一族，屏上有没有东西只有量知道）`,
    !!plane && plane.width > 0 && plane.height > 0, JSON.stringify(plane))
  const tf = await st(page, '.rec-bar .rec-plane', 'transform')
  const mat = /matrix\(([^)]*)\)/.exec(tf || '')
  /* 转角必须钉**方向**：纯位移读回来是 matrix(1,0,0,1,tx,ty)，正弦项（第二位）为 0；
     −45° 那一位是 −0.707，+45° 是 +0.707——取错符号机头就朝下扎，看着仍是"斜的"。 */
  const isUpTilt = /rotate\(\s*-45deg\s*\)/.test(tf || '') || (!!mat && parseFloat(mat[1].split(',')[1]) <= -0.5)
  ck(`${tag}飞机真的斜过来了、且是机头朝上那一头（−45°；读回 none 或正值＝平躺／朝下扎）`,
    isUpTilt, JSON.stringify(tf))
  if (plane) {
    ck(`${tag}飞机那一格是正方、屏上读回来＝72×√2≈${MODEL.aabb.toFixed(1)}rpx（读成 72 说明 transform 没进渲染框）`,
      Math.abs(plane.width - plane.height) <= 1 && Math.abs(toRpx(plane.width) - MODEL.aabb) <= 3,
      `${plane.width.toFixed(1)}×${plane.height.toFixed(1)}px ≈ ${toRpx(plane.width).toFixed(1)}rpx 见方`)
    ck(`${tag}那一格吃的是色板那支芥末黄（不是跟着字色变白、也不是没发下来时的透明）`,
      (await st(page, '.rec-bar .rec-plane', 'background-color')) === TIP_DOT,
      await st(page, '.rec-bar .rec-plane', 'background-color'))
    /* ⑦「上尖超过、下尖也超过」：按屏上那一圈**透明外接框**的四条边判——它是那支黄的超集，
       外接框都没出头，黄一定没出头；出头量再按 MODEL 那组数打进读数里给眼睛对。
       ⚠ 原来这一格钉的是"整枚还在板子里"（⑤⑥ 两版飞机都没出头），⑦ 把它反过来了：
       现在**不许**读到"还在板子里"，那条旧判据留在尺子里就是假绿。 */
    const overTop = (bar.top - plane.top) / R
    const overBottom = (plane.bottom - bar.bottom) / R
    ck(`${tag}飞机整支比按钮高、两头都出头（外接框顶边在胶囊之上、底边在胶囊之下）`,
      plane.top < bar.top - 1 && plane.bottom > bar.bottom + 0.5,
      `外接框上凸 ${overTop.toFixed(1)}／下超 ${overBottom.toFixed(1)}rpx（那支黄该是 ${(-MODEL.inkTop).toFixed(1)}／${(MODEL.inkBottom - MODEL.barH).toFixed(1)}）`)
    ck(`${tag}出头那两截没被削平（微信那层默认皮带裁切，overflow 没吃进去时上下尖会成一条直线）`,
      toRpx(plane.height) >= MODEL.aabb - 3 && toRpx(plane.width) >= MODEL.aabb - 3,
      `外接框 ${toRpx(plane.width).toFixed(1)}×${toRpx(plane.height).toFixed(1)}rpx vs 应有 ${MODEL.aabb.toFixed(1)}`)
    ck(`${tag}飞机的中心还落在胶囊的竖直范围内（不许整支飞到按钮上面或下面去）`,
      plane.top + plane.height / 2 >= bar.top - 1 && plane.top + plane.height / 2 <= bar.bottom + 1,
      `框心 y ${(plane.top + plane.height / 2).toFixed(1)} vs 胶囊 ${bar.top.toFixed(1)}–${bar.bottom.toFixed(1)}`)
    ck(`${tag}黄那一列的左尖不许飘出板的左沿（⑧ 要"容纳"；飘出去就是压在照片上，这一层不裁溢出）`,
      plane.left + (plane.width - MODEL.tilt * R) / 2 >= bar.left - 0.5,
      `黄的左尖 ${(plane.left + (plane.width - MODEL.tilt * R) / 2).toFixed(1)}px vs 板左 ${bar.left.toFixed(1)}px`)
  }
  if (plane && tx) {
    /* ⑧「能容纳纸飞机和文字」＋⑦「要清晰」：屏上必须真的排成两列——比的是**那支黄的右沿**
       （从外接框框心反算回来，不是外接框的右沿：外接框比黄宽 ${(MODEL.aabb - MODEL.tilt).toFixed(1)}rpx，
       那一圈是透明的，压到字上什么也画不出来，拿它当判据会假红）。
       黄压白字＝1.63:1，等于糊掉——所以这一格才是"清晰"真正的落点。 */
    const inkRightPx = plane.left + plane.width / 2 + (MODEL.tilt / 2) * R
    const gapPx = tx.left - inkRightPx
    ck(`${tag}排布是"飞机在左、字在右"两列：黄那一列的右沿在第一个字之前（≥4rpx 缝）`,
      gapPx >= 4 * R - 0.5,
      `黄右沿 ${inkRightPx.toFixed(1)}px → 字左 ${tx.left.toFixed(1)}px＝${toRpx(gapPx).toFixed(1)}rpx（屏上按 ${MODEL.inkRight.toFixed(1)}／${MODEL.txLeft.toFixed(1)}rpx 排）`)
    ck(`${tag}字面没折行（折了的话「推荐给好友」五个字被切成两截、这一枚变成两行高）`,
      tx.height > 0 && tx.height <= MODEL.barH * R + 2 && tx.right <= bar.right + 1,
      `字面 ${tx.width.toFixed(1)}×${tx.height.toFixed(1)}px（高上限 ${(MODEL.barH * R).toFixed(1)}px）`)
  }
  if (title) {
    const e = ink(title)
    ck(`${tag}左沿对齐英文墨迹（±3px；③「在英文下放」那一半，⑧ 之后仍不动）`,
      Math.abs(bar.left - e.left) <= 3, `按钮 ${bar.left.toFixed(1)} vs 墨迹 ${e.left.toFixed(1)}`)
    /* ⚠ 这一档**不再是判据**：②「按钮长度不要超过英文」已被 ⑧「按钮长度要长一点，能容纳
       纸飞机和文字」顶掉（他本人前后两句话，后一句算）。这里只念一句屏上的实话，不钉阈值。 */
    console.log(`  · 备忘（不是判据）${tag}：板宽 ${bar.width.toFixed(1)}px 对那行英文墨迹 ${e.width.toFixed(1)}px`
      + `＝越过 ${toRpx(bar.width - e.width).toFixed(1)}rpx`)
    /* ⑤「再上移」32→8、⑥「往下一点」8→60、⑦⑧ 之后上尖只凸出 30.4 ⇒ 40。
       按 **rpx** 量（⚠ 这一条原来写的是 `toRpx(24) * R`，那两个函数互为逆运算、乘回来正好是 24
       **px**，等于把 24px＝48rpx 当门槛，32rpx 那一档一直是从这条松掉的缝里混过去的）。
       判的是"那支黄的上尖不许咬进位图"——从胶囊顶往回推 30.4rpx，再与位图底比。 */
    const gapR = toRpx(bar.top - title.bottom)
    ck(`${tag}落在英文正下方、缝给得上上尖那一截（≥凸出量＋6rpx 透气，⑥ 那句"往下一点"）`,
      gapR >= -1 && gapR >= -MODEL.inkTop + 6,
      `位图底 ${title.bottom.toFixed(1)} → 按钮顶 ${bar.top.toFixed(1)}＝${gapR.toFixed(1)}rpx vs 上凸 ${(-MODEL.inkTop).toFixed(1)}rpx`)
    // 上尖不许咬进那行英文的位图（这一条量的就是屏上真实的两条边，不靠上面那组数自证）
    const planeTop = plane ? plane.top + (plane.height - MODEL.tilt * R) / 2 : null
    if (planeTop !== null) ck(`${tag}那支黄的上沿还在位图之下（不许咬进"Save what matters"那一行）`,
      planeTop >= title.bottom - 0.5, `黄上沿 ${planeTop.toFixed(1)}px vs 位图底 ${title.bottom.toFixed(1)}px`)
    // 下尖不许压进下方那块面板（首屏那一态面板顶由 `.home-blk` 给；无面板时跳过）
    const planeBottom = plane ? plane.bottom - (plane.height - MODEL.tilt * R) / 2 : null
    if (planeBottom !== null && panel) ck(`${tag}那支黄的下沿还在面板之上（下尖出头不许盖住面板）`,
      planeBottom <= panel.top + 0.5, `黄下沿 ${planeBottom.toFixed(1)}px vs 面板顶 ${panel.top.toFixed(1)}px`)
  } else ck(`${tag}能读到英文那枚位图`, false, '.page-title 没抓到')
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

  // ---------- ② 展开那一屏（快门／拍照那一档＝他说的"拍照屏"）----------
  // 走 setData 而不是点那枚圆形 ➕：这一把要量的是"两态同一份皮"，那一下点击归
  // `验-首页背景图-真跑` 那类尺子管；这里只把 `active` 摆成拍照那一档（同型走法见 `验-精致化四刀-真跑`）。
  await hp.setData({ active: 'photo' })
  await hp.waitFor(900)
  const dockClass = (await (await hp.$('.container')).attribute('class')) || ''
  ck('展开那一态容器真挂上了 entry-dock（不然量的还是首屏那一态）',
    /(?:^|\s)entry-dock(?:\s|$)/.test(dockClass) && !/(?:^|\s)entry-dock(?:\s|$)/.test(dockClass0), dockClass)
  const bar1 = await measure(hp, '拍照屏', R, toRpx)
  ck('两态是同一颗：屏上宽高一模一样（两态各画一枚、迟早长得不一样）',
    !!bar0 && !!bar1 && Math.abs(bar0.width - bar1.width) <= 1 && Math.abs(bar0.height - bar1.height) <= 1,
    `首屏 ${bar0 && bar0.width.toFixed(1)}×${bar0 && bar0.height.toFixed(1)}px／拍照屏 ${bar1 && bar1.width.toFixed(1)}×${bar1 && bar1.height.toFixed(1)}px`)
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
