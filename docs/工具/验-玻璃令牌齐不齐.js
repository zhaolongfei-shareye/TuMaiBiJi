// 10-11 毛玻璃这一档的"令牌齐不齐"静态尺子（不连模拟器，纯读文件）。
// 跑法：node docs/工具/验-玻璃令牌齐不齐.js
//
// 为什么要有这一把（每一条都对应 10-11 真栽过、或这一轮审查抓到的那一种死法）：
// ① 白纱 alpha 只有两枚出口，都写在 app.wxss：全站那档 `--glass-veil`＝.30（R10，站长在校准条上点的），
//    和卡顶那一段单独的 `--glass-veil-band`＝.60（10-12 21:4x 站长拍甲——.30 把近黑的图只提到
//    灰阶 89~175，那两行落在"墨嫌暗、白嫌亮"的死区，换哪一极都挂一半）。页面里再出现一支写死的白纱
//    ＝同一件事两份真相，下次调必漏改。
// ② `--glass-fade-card`／`--glass-fade-page` **跟着壁纸走**（渐退的终点＝本套 --bg-card／--bg-page
//    @62%，效果图第 229／332 行那两个档）。五块皮肤（`page`＋四套 `.theme-*`）各一份镜像值，值算错＝那一套下卡顶渐退到一支错色。
// ③ `var()` 替换成非法值在 CSS 里是 IACVT＝整条 `background` 当 unset 用、底色归 transparent
//    ⇒ 整张卡透空露出原图（＝"中间镂空"那一种，范围更大）。所以"缺一枚令牌"不是小事。
// ④ 压暗延段那支暗值必须等于**各自罩层渐变自己的末档**，不同＝542 那条线一道硬边＝R6 打回的"一刀切"。
// ⑤ 延段必须挂在 `.head-scrim` 自己身上：「调亮度」那一枚拧的是它的 inline opacity（默认半月 .5），
//    挂 `.head`／`.head-band` 就跟不了这一沉，默认档下当场出硬边。
// ⑥ iOS 的 WKWebView 只认 `-webkit-backdrop-filter`（效果图上每一行玻璃都是两条一起写的）。
// ⑦ 下移背景图那笔账（R12）散在 js 常量与几处样式里，本把把它们相互咬住。
// 每条都有反向自证：把那一条改坏一次，判据必须红——不然它只是在读文件，不是在守东西。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const read = (rel) => fs.readFileSync(P(rel), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')

const FILES = {
  app: read('app.wxss'),
  ix: read('pages/index/index.wxss'),
  me: read('pages/me/me.wxss'),
  cr: read('pages/create/create.wxss'),
  // 10-12：私密密码那一层的皮从 me.wxss 搬到这一份（三页共用）。它挂着 `.container.has-bg`
  // 那一档玻璃，所以必须和三个页面的表一起受这一把管——不然搬过去的这一份就成了没人查的暗号。
  sheet: read('styles/pwd-sheet.wxss'),
  ixjs: read('pages/index/index.js'),
  mejs: read('pages/me/me.js'),
  poster: read('utils/poster.js'),
}

const rgbOf = (hex) => [1, 2, 3].map((i) => parseInt(hex.slice(i * 2 - 1, i * 2 + 1), 16))
const blockOf = (src, sel) => (new RegExp(
  `(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(src) || [, ''])[1]
const num = (s, re) => Number((re.exec(s) || [, '0'])[1])
/** 读一枚写成算式的常量（`const GLASS_BAND_H = 542 + 198`）：只取第一个数的正则会把 542 当成 740。 */
const sum = (s, re) => ((re.exec(s) || [, '0'])[1]).split('+').reduce((a, x) => a + Number(x.trim()), 0)
const glassRules = (src) => [...src.matchAll(/\.container\.has-bg[^{]*\{([^}]*)\}/g)].map((m) => m[1]).join('\n')
const lastStop = (src, sel) => {
  const b = blockOf(src, sel)
  const g = /linear-gradient\(([^;]*)\)/.exec(b)
  if (!g) return ''
  const st = g[1].match(/rgba\([^)]*\)/g) || []
  return (st[st.length - 1] || '').replace(/\s+/g, ' ').trim()
}
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim()

/** 全部判据都跑在这一个函数上：真文件调一次，每一种改坏各调一次，红绿都由它说了算。 */
function evaluate(F) {
  const APP = strip(F.app), IX = strip(F.ix), ME = strip(F.me), CR = strip(F.cr)
  const SH = strip(F.sheet)
  const out = []
  const ok = (name, cond, extra) => { if (!cond) out.push(name + (extra ? ` —— ${extra}` : '')) }

  const BLOCKS = ['page', '.theme-tint-paper', '.theme-tint-celadon', '.theme-tint-blush', '.theme-blue']
  BLOCKS.forEach((sel) => {
    const b = blockOf(APP, sel)
    const pageHex = (/--bg-page:\s*(#[0-9A-Fa-f]{6})/.exec(b) || [])[1]
    const cardHex = (/--bg-card:\s*(#[0-9A-Fa-f]{6})/.exec(b) || [])[1]
    const fadeCard = flat((/rgba\([^)]*\)/.exec((/--glass-fade-card:\s*([^;]*)/.exec(b) || [])[1] || '') || [])[0])
    const fadePage = flat((/rgba\([^)]*\)/.exec((/--glass-fade-page:\s*([^;]*)/.exec(b) || [])[1] || '') || [])[0])
    ok(`${sel}：两枚渐退令牌都在`, !!pageHex && !!cardHex && !!fadeCard && !!fadePage)
    if (!pageHex || !cardHex) return
    ok(`${sel}：--glass-fade-card ＝ 本套 --bg-card ${cardHex} @0.62`,
      fadeCard === `rgba(${rgbOf(cardHex).join(', ')}, 0.62)`, fadeCard)
    ok(`${sel}：--glass-fade-page ＝ 本套 --bg-page ${pageHex} @0.62`,
      fadePage === `rgba(${rgbOf(pageHex).join(', ')}, 0.62)`, fadePage)
  })

  const base = blockOf(APP, 'page')
  /* `--glass-jot`（首页白条那一档 .38）随 2.2 B 方案从名单里删：白条本身被他撤了
     （「左下的记下来这部部分，去掉」），create.wxss 那两条消费方一起退。
     这一份名单**就是"该定义哪几枚"的真相**：谁往 app.wxss 里加一枚新令牌，必须同时加进这里，
     否则"定义了没人吃"与"吃了没定义"两类静默都不红。 */
  ;['--glass-veil', '--glass-veil-band', '--glass-bf', '--glass-hair', '--glass-fill', '--glass-plate'].forEach((v) =>
    ok(`app.wxss 的 page 那一块定义了 ${v}`, base.includes(`${v}:`)))
  /* 只钉"声明"与"消费方"两种形态，不钉名字——app.wxss/create.wxss 里那段退役说明会**提到**这枚令牌，
     按名字搜会把注释也算成残留（10-13 这一把第一版就是这么自己诈自己一次的）。 */
  ok('`--glass-jot` 的定义与消费都删净了（注释里提到它不算残留）',
    !/--glass-jot\s*:/.test(APP) && !/var\(--glass-jot\)/.test(APP)
    && !/--glass-jot\s*:/.test(read('pages/create/create.wxss')) && !/var\(--glass-jot\)/.test(read('pages/create/create.wxss')))
  ok('全站那档白纱还是 .30（R10 那一枚，弹窗与密码面板吃它）',
    /--glass-veil:\s*rgba\(255, 255, 255, 0\.30\)/.test(APP),
    flat((/--glass-veil:[^;]*/.exec(APP) || [])[0]))
  /* 站长 10-12 21:4x 拍甲：卡顶那一段玻璃单独一档 .60（.30 把近黑的图只提到灰阶 89~175，
     那两行落在"墨嫌暗、白嫌亮"的死区——数见 `docs/design/背景图深浅/量-卡顶纱档位.py`）。
     两头都要钉：这一档不许被改回 .30，也不许被顺手抬到全站那一枚头上（弹窗那三枚底下垫的是暗遮罩，
     跟着抬等于把弹窗改成半张白纸，不在他这一刀里）。 */
  ok('卡顶那一段单独一档＝.60（甲案那一枚，两页共用）',
    /--glass-veil-band:\s*rgba\(255, 255, 255, 0\.60\)/.test(APP),
    flat((/--glass-veil-band:[^;]*/.exec(APP) || [])[0]))
  ok('列表与「我的」那两段 `.sheet` 真在吃这一枚（令牌定义了、样式没挂上＝静默不生效）',
    [/var\(--glass-veil-band\)\s+0,\s*var\(--glass-veil-band\)\s+158rpx/.test(IX),
     /var\(--glass-veil-band\)\s+0,\s*var\(--glass-veil-band\)\s+56rpx/.test(ME)].every(Boolean),
    `列表158=${/var\(--glass-veil-band\)\s+0,\s*var\(--glass-veil-band\)\s+158rpx/.test(IX)} 我的56=${/var\(--glass-veil-band\)\s+0,\s*var\(--glass-veil-band\)\s+56rpx/.test(ME)}`)
  ok('那三枚弹窗与密码面板没跟着抬（还吃全站 .30）',
    [/\.container\.has-bg \.ci-card\.glass-dialog\s*\{[^}]*var\(--glass-veil\)\s*;/.test(IX)
      && /\.container\.has-bg \.me-email-card\.glass-dialog\s*\{[^}]*var\(--glass-veil\)\s*;/.test(ME)
      && /background:\s*var\(--glass-veil\)\s*;/.test(SH),
     !/--glass-veil-band/.test(SH)].every(Boolean),
    `弹窗index=${/\.ci-card\.glass-dialog\s*\{[^}]*var\(--glass-veil\)\s*;/.test(IX)} 弹窗me=${/\.me-email-card\.glass-dialog\s*\{[^}]*var\(--glass-veil\)\s*;/.test(ME)} 密码面板=${/background:\s*var\(--glass-veil\)\s*;/.test(SH)}`)
  /* 10-13 23:5x 站长（真机第三张图：「我的」页那层六位密码面板）原话
     「密码弹窗突然变暗，这个不合理，要亮度不变」⇒ 这一层外面那圈遮罩改成完全透明：
     六位那一格坐在原来那片墨面上，屏的亮度一个字不动。
     ⚠ 只改了这一枚。全站另有四支同值的 `.dialog-mask`（app.wxss／me／create／categories），
       他没指那几处，所以那几处照旧压暗——"去掉"只覆盖他点的那一处。 */
  ok('六位密码那一层的遮罩不压暗（必须 transparent；那支 rgba(20,20,28,.55) 不许回来）',
    /\.pwd-mask\s*\{[^}]*background:\s*transparent/.test(SH)
    && !/\.pwd-mask\s*\{[^}]*background:\s*rgba\(/.test(SH),
    (blockOf(SH, '.pwd-mask').match(/background:[^;]*/) || ['(没写 background)'])[0])
  // 只管**真挂了滤镜的那几块面**：10-10 那批在照片上垫的 `.srch` 一层 .18 白＋.36 描边是他
  // 上一轮点头那一版里的，不属这一轮的玻璃档（这一轮的档＝带 backdrop-filter 的那几块）；
  // 把它一起圈进来＝尺子越界去重判他已经收过的那一格。
  const glassBlocks = [IX, ME, CR, SH]
    .flatMap((src) => [...src.matchAll(/\.container\.has-bg[^{]*\{([^}]*)\}/g)].map((m) => m[1]))
    .filter((b) => /backdrop-filter/.test(b))
    .join('\n')
  const surfaces = glassBlocks.split('\n').filter((l) => /^\s*background(-color)?:/.test(l))
    .join('\n').match(/rgba\(255,\s*255,\s*255,\s*0?\.\d+\)/g) || []
  ok('每一块挂了滤镜的玻璃面，底色都走 var()（页面里不许有第二支白纱）',
    surfaces.length === 0, surfaces.join('、'))
  ok('app.wxss 里不许出现 `.container.has-bg`（闸名进全局表会让 验-第一屏三块 那把永久假红）',
    !/\.container\.has-bg/.test(APP))

  /* ---------- 10-13 第二屏方案 D17 甲／D18 落码之后，这两条得有人看着 ----------
     把 `.container.entry-dock` 那两枚令牌删掉、或把 `.th-add` 从玻璃名单里摘出去，屏上不会报错、
     静态几何也全绿，而"第二屏那块面糊不出东西"这一整刀就白落了。
     ⚠ 抬档写的是**令牌的值**（消费方仍走 var()），所以上面那条"页面里不许有第二支白纱"圈不到它——
     那条只扫 `.container.has-bg` 且带滤镜的块里的 `background:` 字面值。这一条补的是另一个方向。 */
  const ENTRY = blockOf(CR, '.container.entry-dock')
  ok('第二屏就地抬的那两档白纱在（面 .72／井 .42），且只有这一屏吃',
    /--glass-plate:\s*rgba\(255, 255, 255, 0\.72\)/.test(ENTRY)
    && /--glass-fill:\s*rgba\(255, 255, 255, 0\.42\)/.test(ENTRY),
    ENTRY.trim().slice(0, 90) || '(create.wxss 里没有 `.container.entry-dock` 那一段)')
  ok('首屏那两档没被顺手抬走（app.wxss 仍是面 .50／井 .20——D12 那一问还没拍，不许替他答）',
    /--glass-plate:\s*rgba\(255, 255, 255, 0\.50\)/.test(base)
    && /--glass-fill:\s*rgba\(255, 255, 255, 0\.20\)/.test(base),
    `${(/--glass-plate:[^;]*/.exec(base) || ['(缺)'])[0]}／${(/--glass-fill:[^;]*/.exec(base) || ['(缺)'])[0]}`)
  /* 光钉 app.wxss 那一档不够：在 create.wxss 里再写一条 `.container{--glass-plate:.72}` 就把首屏一起抬了，
     而上面那两条都还是绿的。所以钉"这一份表里重定义这两枚令牌的选择器只有一个、且就是它"。 */
  const redef = [...CR.matchAll(/([^{}]*)\{[^}]*--glass-(?:plate|fill)\s*:/g)]
    .map((m) => m[1].replace(/\s+/g, ' ').trim())
  ok('create.wxss 里重定义这两枚令牌的只有 `.container.entry-dock` 一处（抬档只挂这一屏的身份）',
    redef.length === 1 && redef[0] === '.container.entry-dock',
    redef.join(' ｜ ') || '(一处都没有)')
  ok('已选那排最右那枚 ➕ 格真在玻璃名单里，且带 `:not(.th-add-dis)` 那道闸',
    /\.container\.has-bg \.th-add:not\(\.th-add-dis\)\s*\{[^}]*var\(--glass-fill\)/.test(CR),
    blockOf(CR, '.container.has-bg .th-add:not(.th-add-dis)').trim().slice(0, 60) || '(没这一条)')

  ok('首页延段那支暗值＝首页罩层渐变的末档（撞 R6 的那种硬边就红在这里）',
    flat((/background:\s*(rgba\([^)]*\))/.exec(blockOf(IX, '.container.has-bg .head-scrim::after')) || [])[1])
    === lastStop(IX, '.head-scrim'),
    `延段 ${flat((/background:\s*(rgba\([^)]*\))/.exec(blockOf(IX, '.container.has-bg .head-scrim::after')) || [])[1])}／末档 ${lastStop(IX, '.head-scrim')}`)
  ok('「我的」延段那支暗值＝本页罩层渐变的末档',
    flat((/background:\s*(rgba\([^)]*\))/.exec(blockOf(ME, '.head-scrim::after')) || [])[1])
    === lastStop(ME, '.head-scrim'),
    `延段 ${flat((/background:\s*(rgba\([^)]*\))/.exec(blockOf(ME, '.head-scrim::after')) || [])[1])}／末档 ${lastStop(ME, '.head-scrim')}`)
  ok('两页的延段都挂在 `.head-scrim` 上（吃得到「调亮度」那枚 opacity），不挂 .head／.head-band',
    !/\.container\.has-bg \.head::after/.test(IX) && !/^\.head-band::after/m.test(ME)
    && /\.container\.has-bg \.head-scrim::after/.test(IX) && /^\.head-scrim::after/m.test(ME))

  /* ---------- 10-13 23:3x 站长翻案：罩层只有一支，永远压暗 ----------
     原话「背景图，调亮度应该是压暗，现在变成提亮（要对照现网逻辑）」。10-12 那批给浅照片
     另开了一支纸白提亮罩（`.bg-light` 下的 `.page-scrim`／`.head-scrim` 与各自的延段），
     今天整族撤掉——罩层那一层不再随图片深浅翻极性，翻的只有字（下面那条还钉着）。
     原来这三条钉的是"浅色那态的延段值＝浅色渐变的末档"，被撤的状态撑不起判据，
     所以换成钉反面的不变量（撤一个状态会作废一批判据：改判据，不把代码改回去迁就旧尺子）。 */
  const SCRIM_LIGHT = /\.bg-light[^{]*\.(?:page|head)-scrim/
  ok('首页这一份里没有"浅色态另开一支罩层"那条覆盖（罩层只有一支＝恒压暗）', !SCRIM_LIGHT.test(IX),
    (SCRIM_LIGHT.exec(IX) || ['(没有)'])[0])
  ok('「我的」这一份里同样没有', !SCRIM_LIGHT.test(ME), (SCRIM_LIGHT.exec(ME) || ['(没有)'])[0])
  ok('录入页这一份里同样没有（三页共用同一个键，别处漏一条就是"这一屏提亮、那一屏压暗"）',
    !SCRIM_LIGHT.test(CR), (SCRIM_LIGHT.exec(CR) || ['(没有)'])[0])
  ok('浅色那态翻了三级字（只翻罩子不翻字＝白字压浅底，这一格就是需求本身）',
    /\.container\.has-bg\.bg-light\s*\{[^}]*--text-primary:\s*rgba\(20, 22, 26/.test(CR),
    blockOf(CR, '.container.has-bg.bg-light').trim().slice(0, 60))

  ;[['index', IX], ['me', ME], ['create', CR], ['密码面板那一份', SH]].forEach(([who, src]) => {
    const lines = src.split('\n')
    const at = (i) => String((lines[i] || '').trim())
    // 两个方向都要查：只查"`backdrop-filter` 后面跟没跟 -webkit-"的话，
    // **把标准那行删掉、只留 -webkit-** 就永远红不起来（10-11 审查抓到的没牙位）。
    const noWebkit = lines.map((l, i) => ({ l: at(i), i })).filter((o) => /^backdrop-filter:/.test(o.l))
      .filter((o) => !/^-webkit-backdrop-filter:/.test(at(o.i + 1)))
    const noStd = lines.map((l, i) => ({ l: at(i), i })).filter((o) => /^-webkit-backdrop-filter:/.test(o.l))
      .filter((o) => !/^backdrop-filter:/.test(at(o.i - 1)))
    ok(`${who}：每一行 backdrop-filter 与 -webkit- 那行成对（缺任一行都算不生效）`,
      noWebkit.length === 0 && noStd.length === 0,
      [noWebkit.map((o) => `缺前缀 ${o.l}`).join('、'), noStd.map((o) => `缺标准行 ${o.l}`).join('、')]
        .filter(Boolean).join('；') || `${(src.match(/^backdrop-filter:/gm) || []).length} 对`)
  })

  const ixBand = sum(F.ixjs, /const GLASS_BAND_H\s*=\s*(\d+(?:\s*\+\s*\d+)*)/)
  const ixHeadH = num(IX, /\.head\s*\{[^}]*?height:\s*(\d+)rpx/)
  const ixAfter = blockOf(IX, '.container.has-bg .head-scrim::after')
  const ixAftH = num(ixAfter, /height:\s*(\d+)rpx/)
  ok('首页 740 ＝ 头部 542 ＋ 延段 198（js 那一枚常量与样式两头同源）',
    ixBand === 740 && ixHeadH === 542 && ixAftH === 198 && ixHeadH + ixAftH === ixBand,
    `band ${ixBand}／head ${ixHeadH}／延段 ${ixAftH}`)
  ok('首页延段用 top:100%（跟着罩层自己走），不写死 542', /top:\s*100%/.test(ixAfter), ixAfter.trim().slice(0, 60))
  ok('首页铺图态那枚图自己先给到 740 高（首帧与 getImageInfo 失败那一态底下不至于没图）',
    /height:\s*740rpx/.test(blockOf(IX, '.container.has-bg .head-img')),
    blockOf(IX, '.container.has-bg .head-img').trim().slice(0, 60))
  const HEAD = num(F.poster, /const HEAD_IMG_H\s*=\s*(\d+)/)
  const meBandH = num(ME, /\.head-band\s*\{[^}]*?height:\s*(\d+)rpx/)
  const meBottom = num(ME, /\.head-scrim\s*\{[^}]*?bottom:\s*(\d+)rpx/)
  const meAftH = num(ME, /\.head-scrim::after\s*\{[^}]*?height:\s*(\d+)rpx/)
  const meSheetM = num(ME, /\.sheet\s*\{[^}]*?margin-top:\s*-?(\d+)rpx/)
  ok('「我的」646 ＝ 罩层守的 542 ＋ 延段那 104，且名片行往上盖住那一档＝延段＋原来那 40',
    meBandH === 646 && meBottom + 542 === meBandH
    && meAftH === meBottom && meSheetM === meAftH + 40,
    `盒 ${meBandH}／bottom ${meBottom}／延段 ${meAftH}／sheet margin ${meSheetM}`)
  /* ★这一组是 10-11 11:2x 那一格的正主（「我第二，第三切换时候背景图为什么会上下跳到…你是否有其他代码影响」）。
     实测跳幅 13.5rpx ≈ 7 视口 px（`探-头部图两页对位.js`），根因就是两页把**各自**的带高递给了 bandGeom。
     锚点收成 poster.HEAD_IMG_H 一枚之后，这三条才钉得住"以后谁再各写一个数就红"。 */
  ok('两页递给 bandGeom 的都是那一枚全站锚点（谁再写回自己的带高＝背景图两页顶边又岔开）',
    /poster\.bandGeom\(info\.width, info\.height, poster\.HEAD_IMG_H\)/.test(F.ixjs)
    && /poster\.bandGeom\(info\.width, info\.height, poster\.HEAD_IMG_H\)/.test(F.mejs))
  ok('锚点取的是两页里大的那一档（＝列表那笔版式账 740），取小了「我的」名片行底下会没图＝"中间镂空"复发',
    HEAD === ixBand && HEAD >= meBandH, `HEAD_IMG_H ${HEAD}／列表带 ${ixBand}／「我的」带 ${meBandH}`)
  ok('两页都不再把本页那枚版式常量递给 bandGeom（一笔账拆成两件事：带高归 CSS，取景归锚点）',
    !/bandGeom\([^)]*GLASS_BAND_H/.test(F.ixjs) && !/bandGeom\([^)]*GLASS_BAND_H/.test(F.mejs))
  // 选择器命中不到节点＝玻璃静默缺席（`.mini .c` 那一刀就是这么漏的）。
  // ⚠ 要比的是**从样式表里现读出来的类名**，不是我在尺子里手抄的一份清单——手抄那种，
  // 把 CSS 改错也量不到（反向自证第一轮就是这样没牙的）。
  const WXML = { index: read('pages/index/index.wxml'), me: read('pages/me/me.wxml'),
    create: read('pages/create/create.wxml') }
  const classesOf = (src) => {
    const s = new Set()
    const clean = src.replace(/<!--[\s\S]*?-->/g, '')
    for (const m of clean.matchAll(/class="([^"]+)"/g))
      m[1].replace(/\{\{([^}]*)\}\}/g, (_, inner) =>
        [...inner.matchAll(/'([^']*)'/g)].map((q) => q[1]).join(' '))
        .split(/\s+/).filter(Boolean).forEach((c) => s.add(c))
    return s
  }
  // 取每条规则的选择器串（允许一行好几个选择器、也允许跨行），只留带 `.container.has-bg` 的那些，
  // 再把伪元素（::after 之类）剔掉——剩下的类名必须都能在 markup 里找到。
  const selectorClasses = (src) => [...src.matchAll(/([^{}]*)\{/g)]
    .flatMap((m) => m[1].split(','))
    .map((sel) => sel.replace(/\/\*[\s\S]*?\*\//g, '').trim())
    .filter((sel) => /\.container\.has-bg/.test(sel))
    .flatMap((sel) => (sel.replace(/::?[a-zA-Z][\w-]*(\([^)]*\))?/g, ' ')
      .match(/\.([a-zA-Z][\w-]*)/g) || []).map((x) => x.slice(1)))
  const GLOBAL_OK = ['container', 'has-bg', 'card']  // 全局那张表里本来就有的三枚
  Object.keys(WXML).forEach((p) => {
    const src = p === 'index' ? IX : p === 'me' ? ME : CR
    const have = classesOf(WXML[p])
    const gone = [...new Set(selectorClasses(src))].filter((c) => !have.has(c) && !GLOBAL_OK.includes(c))
    ok(`${p} 页每一条玻璃规则点的类，markup 里都真有（少一枚＝这一格根本没玻璃）`,
      gone.length === 0, gone.join('、'))
  })
  return out
}

const real = evaluate(FILES)
console.log(real.length ? `\n✗ 玻璃令牌齐不齐：红 ${real.length} 条` : '\n✓ 玻璃令牌齐不齐：全过')
real.forEach((f) => console.log('  · ' + f))

// ---------- 反向自证：下面每一种改坏，都必须被逮住 ----------
const MUT = [
  ['删掉 celadon 那一套的 fade-card 令牌', 'app', (s) => s.replace(
    '  --glass-fade-card: rgba(241, 243, 242, 0.62);\n', '')],
  ['celadon 那支 fade-card 偷写成白', 'app', (s) => s.replace(
    '--glass-fade-card: rgba(241, 243, 242, 0.62)', '--glass-fade-card: rgba(255, 255, 255, 0.62)')],
  ['把白纱那一档从 .30 改成 .35', 'app', (s) => s.replace(
    '--glass-veil: rgba(255, 255, 255, 0.30)', '--glass-veil: rgba(255, 255, 255, 0.35)')],
  // 这一刀原来锚在 `background: var(--glass-veil);` 那一行上——13:0x 面板与三块都改吃 `--glass-plate` 之后
  // 那行在 create.wxss 里没有了，replace 打空、刀变成没牙（跑出来就是"反向那一刀没切进去"）。
  // 锚点跟着换成现在真实挂在滤镜前面的那一枚令牌。
  /* ⚠ 10-13 又没牙一次，这一回的因由不同：`String.replace` 只换**第一处**，而
     `background: var(--glass-plate);\n  backdrop-filter` 这两行在 create.wxss 里第一处落在
     **`.blk-plus`**（首屏那枚圆形 ➕，行 4223 字节处）而不是 `.container.has-bg .panel`（行 1.1 万之后）。
     切进 `.blk-plus` 的那支字面白纱，被上面那条 `surfaces` 扫描（只圈 `.container.has-bg` 且带滤镜的块）
     整个漏掉 ⇒ 刀切了、判据不红。锚点因此加长到"面板那一段独有的后三行"，确保切中的是面板。
     （10-13 第二屏方案 D17 甲之后，`.container.entry-dock` 里也写了 `--glass-plate` 的字面值——
     那是**令牌定义**、不是消费方，`surfaces` 那条圈的是 `.container.has-bg` 块里的 `background:`，两不冲突。） */
  ['玻璃面那一档里自己写一支白纱（不走 var()）', 'cr', (s) => s.replace(
    '  background: var(--glass-plate);\n  backdrop-filter: var(--glass-bf);\n  -webkit-backdrop-filter: var(--glass-bf);\n  border-color: var(--glass-hair);',
    '  background: rgba(255, 255, 255, 0.44);\n  backdrop-filter: var(--glass-bf);\n  -webkit-backdrop-filter: var(--glass-bf);\n  border-color: var(--glass-hair);')],
  // 锚点必须带行首：10-12 起 me.wxss 里还有一支 `.head-band.has-bg.bg-light .head-scrim::after`，
  // 它含 `.head-scrim::after {` 这个子串，不带 \n 的那一刀会先切中它、于是深态那把刀就没牙了（实测红过一次）。
  ['延段挪回 .head-band（吃不到「调亮度」那枚 opacity）', 'me', (s) => s.replace(
    '\n.head-scrim::after {', '\n.head-band::after {')],
  ['延段那支比自家末档深一档（542 出硬边）', 'me', (s) => s.replace(
    '.head-scrim::after {\n  content: \'\';\n  position: absolute;\n  left: 0;\n  right: 0;\n  top: 100%;\n  height: 104rpx;\n  background: rgba(18, 20, 26, 0.44);',
    '.head-scrim::after {\n  content: \'\';\n  position: absolute;\n  left: 0;\n  right: 0;\n  top: 100%;\n  height: 104rpx;\n  background: rgba(18, 20, 26, 0.60);')],
  ['删掉 create 里一行的 -webkit- 前缀', 'cr', (s) => s.replace(
    '  backdrop-filter: var(--glass-bf);\n  -webkit-backdrop-filter: var(--glass-bf);\n  border-color',
    '  backdrop-filter: var(--glass-bf);\n  border-color')],
  ['反过来：删掉标准那行、只留 -webkit-（这一刀以前逮不住）', 'cr', (s) => s.replace(
    '  backdrop-filter: var(--glass-bf);\n  -webkit-backdrop-filter: var(--glass-bf);\n  border-color',
    '  -webkit-backdrop-filter: var(--glass-bf);\n  border-color')],
  ['首页那笔版式账改回裸 542（玻璃带底下会没图）', 'ixjs', (s) => s.replace(
    'const GLASS_BAND_H = 542 + 198', 'const GLASS_BAND_H = 542')],
  ['★全站锚点改成「我的」那档 646（＝10-11 11:2x 那趟的错：两页顶边岔 13.5rpx，切 tab 背景图上下跳）', 'poster', (s) => s.replace(
    'const HEAD_IMG_H = 740', 'const HEAD_IMG_H = 646')],
  ['★「我的」把本页带高递回 bandGeom（锚点又变成两页各一个数）', 'mejs', (s) => s.replace(
    'poster.bandGeom(info.width, info.height, poster.HEAD_IMG_H)', 'poster.bandGeom(info.width, info.height, 646)')],
  ['玻璃规则点一枚 markup 里没有的类（`.mini .c` 那一刀）', 'cr', (s) => s.replace(
    '.container.has-bg .mini-c {', '.container.has-bg .mini .c {')],
  // 10-13 第二屏方案那两刀（D17 甲抬档／D18 ➕ 格挂玻璃）——每一刀对应"这一屏静默退回修前那一档"的一种画法。
  ['★第二屏那两档抬纱整段删掉（D17 甲白落，那块面退回 .50）', 'cr', (s) => s.replace(
    '.container.entry-dock {\n  --glass-plate: rgba(255, 255, 255, 0.72);\n  --glass-fill: rgba(255, 255, 255, 0.42);\n}', '')],
  ['★只抬面不抬井（同一屏两档皮，"齐不齐"这件事又破一次）', 'cr', (s) => s.replace(
    '  --glass-fill: rgba(255, 255, 255, 0.42);', '  --glass-fill: rgba(255, 255, 255, 0.20);')],
  ['★把首屏那档也一起抬到 .72（D12 他没拍，这一刀等于替他答了）', 'cr', (s) => s.replace(
    '.container.entry-dock {', '.container {\n  --glass-plate: rgba(255, 255, 255, 0.72);\n}\n.container.entry-dock {')],
  ['★➕ 格那道 `:not(.th-add-dis)` 被抹平（满了那一态的"转灰"被三条类推掉）', 'cr', (s) => s.replace(
    '.container.has-bg .th-add:not(.th-add-dis) {', '.container.has-bg .th-add {')],
  ['★➕ 格从玻璃名单里整条摘掉（D18 白落）', 'cr', (s) => s.replace(
    '.container.has-bg .th-add:not(.th-add-dis) {', '.container.has-bg .th-add-XX:not(.th-add-dis) {')],
  // 10-13 23:3x/23:5x 站长两刀之后的四把：原来那三把"浅色那态的延段…"锚在被撤掉的提亮罩上，
  // 撤掉之后 `replace` 找不到锚点 ⇒ 报的是"这一刀没切进去"（不是绿）。换成反向四把：
  // 谁把提亮罩／那圈压暗遮罩加回来，这一把必须当场咬住。
  ['★把首页那支纸白提亮罩加回来（「调亮度」又变成提亮）', 'ix', (s) => s.replace(
    '.container.has-bg .head-scrim::after {',
    '.container.has-bg.bg-light .head-scrim {\n  background: rgba(242, 239, 233, 0.3);\n}\n.container.has-bg .head-scrim::after {')],
  ['★把「我的」那支提亮罩加回来（同一把键，三页里漏一页＝那一屏提亮这一屏压暗）', 'me', (s) => s.replace(
    '.head-scrim::after {',
    '.head-band.has-bg.bg-light .head-scrim {\n  background: rgba(242, 239, 233, 0.22);\n}\n.head-scrim::after {')],
  ['★把录入页那一层提亮罩加回来（D20 那半边假账的成因）', 'cr', (s) => s.replace(
    '.page-scrim {',
    '.container.has-bg.bg-light .page-scrim {\n  background: rgba(242, 239, 233, 0.35);\n}\n.page-scrim {')],
  ['★六位密码那一层外面又压暗（他 10-13 那句「突然变暗，不合理」回来）', 'sheet', (s) => s.replace(
    '  background: transparent;', '  background: rgba(20, 20, 28, 0.55);')],
  ['★浅色那态只翻罩子不翻字（白字压浅底＝需求本身没落）', 'cr', (s) => s.replace(
    '--text-primary: rgba(20, 22, 26, 0.92)', '--text-primary: #f2efe9')],
  // 10-12 21:4x 甲案（卡顶那一段单独 .60）的四刀：这一档两头都要有牙——
  // 不许被改回 .30（甲等于没落），也不许被顺手抬到全站那一枚头上（弹窗那三枚会跟着变白纸）。
  ['★列表卡顶那一段偷回全站 .30（甲没落，那两行还在死区里）', 'ix', (s) => s.replace(
    'var(--glass-veil-band) 0, var(--glass-veil-band) 158rpx',
    'var(--glass-veil) 0, var(--glass-veil) 158rpx')],
  ['★「我的」名片行那一段偷回全站 .30（同一张图两个 tab 两档密度）', 'me', (s) => s.replace(
    'var(--glass-veil-band) 0, var(--glass-veil-band) 56rpx',
    'var(--glass-veil) 0, var(--glass-veil) 56rpx')],
  ['★卡顶那一档从 .60 挪到 .50（乙案那一档，推算「返回」只有 3.85 不过线）', 'app', (s) => s.replace(
    '--glass-veil-band: rgba(255, 255, 255, 0.60)', '--glass-veil-band: rgba(255, 255, 255, 0.50)')],
  ['★弹窗跟着被抬到 .60（他 10-11 拍过的那版皮被这一刀顺走）', 'ix', (s) => s.replace(
    '.container.has-bg .ci-card.glass-dialog {\n  background: var(--glass-veil);',
    '.container.has-bg .ci-card.glass-dialog {\n  background: var(--glass-veil-band);')],
]
let teeth = 0
MUT.forEach(([name, key, mut]) => {
  const F = Object.assign({}, FILES)
  F[key] = mut(F[key])
  if (F[key] === FILES[key]) { console.log(`  !! 反向那一刀没切进去，等于没测：${name}`); return }
  const red = evaluate(F).length > 0
  if (red) teeth += 1
  console.log(`  ${red ? '✓' : '★没牙'} 反向：${name}`)
})
console.log(`反向 ${teeth}/${MUT.length} 有牙`)
process.exit(real.length || teeth < MUT.length ? 1 : 0)
