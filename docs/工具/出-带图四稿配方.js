// 站长 10-19 傍晚那一句的产物：「默认这个带图片的模板，风格样式参考这个排版（详情窗那一屏：
// 分类·来源·日期 / 大标题 / 标签 / 大图 / 摘要），但要加上我们一些特定元素，例如名字、一句话、二维码。
// 你安排设计几个版本，我选择。」
//
// 这一份只干一件事：把四稿配方落成 docs/design/10-19卡片带图模板四稿/<id>.json。
// 落完由现成的流水线去验，它自己不画图、不下发、不碰现网：
//   NEW_TPL_FILES="docs/design/10-19卡片带图模板四稿/sash.json …" bash docs/工具/跑尺子.sh 9431 出-新模板候选
// ⚠ **故意不落进 backend/seed/poster_extra/**：那一个是"看过图、下一步就进种子"的暂存位。
//   站在那儿会被 验-模板配方可执行 那把对账尺子读成一条"忘了重跑生成器"的红（除非带 TPL_PENDING），
//   而谁顺手真去重跑生成器，这四份**他还没挑过的**方案就跟着进种子、跟着上现网了。
//   挑定哪一稿，再把那一份复制进 poster_extra 走 跑新模板流程.sh。
//
// ⚠ 四稿都不新增绘制 op——只用包内那十种（fill/grad/radial/rrect/circle/line/dots/text/image/avatar）
//   和那份原语名单。这一条就是"不用发版"的依据：加一套卡＝服务端多一条数据。
//   反过来有一件做不到、所以四稿都没画：**每枚标签前面那个「#」**。
//   那个 # 是客户端显示时一枚一枚加的（#214），画布侧只有 tagsJoined（数组 join），
//   而配方里 `+` 是纯数值算子（num() 强转，喂字符串当场抛）⇒ 没有"逐枚加前缀"的口。
//   要 # 就得包内加一条原语＝发版。四稿的标签行统一走现成的「标签1 / 标签2」。
const fs = require('fs')
const path = require('path')

const OUT_DIR = path.resolve(__dirname, '../design/10-19卡片带图模板四稿')

const V = (p) => ({ var: p })
const N = (n) => n
const P = (name, args) => ({ prim: name, args: args || {} })
const add = (...a) => ({ '+': a })
const sub = (...a) => ({ '-': a })
const mul = (...a) => ({ '*': a })
const div = (a, b) => ({ '/': [a, b] })
const len = (a) => ({ len: a })
const mx = (...a) => ({ max: a })
// 值位的 if 是三连（引擎写明"要 [条件, 真, 假] 三个参数"），少给一个就会把 null 当值往下算。
const IF = (cond, then, els) => ({ if: [cond, then, els] })
const truthy = (v) => ({ truthy: v })
const tok = (name) => P('token', { name })
const L = (k, fields) => ({ emit: { k, ...fields } })
const Ls = (name) => ({ emitMany: { var: `${name}.layers` } })
const LET = (name, value) => ({ let: name, value })
// 步位的 if：这一位只在条件成立时画／算，不成立时给 else（可以是空数组）。
const STEP_IF = (cond, then, els) => ({ if: { cond, then, else: els || [] } })
// 图位只吃这一篇的配图，不写 {if:hasNote,'note','avatar'} 那种头像兜底：
// 已有六套那一条是"大图位没图就退成头像"，这四稿的卖点就是这张照片——
// 拿头像顶上会把"这篇没配图"画成"这篇有张脸"。
// 但**那一格的几何永远预留**：没图时里面落一枚品牌印（glyphPlate，与波普分格／杂志封面
// 同一句兜底），不留一块什么都不画的空底——留白就是"空框"，那是站长点过名不许画的东西。
// plate 两态共用（纸白那一层底），withPhoto 叠照片，noPhoto 叠印。
const PHOTO_SLOT = (plate, withPhoto, noPhoto) =>
  STEP_IF(truthy(V('hasNote')), [plate, ...withPhoto], [plate, ...noPhoto])
// 没配图那一态落在同一格里的品牌印（"麦"那一枚，出处是 poster.js 的 BRAND_GLYPH，配方不许抄字）。
const GLYPH = (x, y, w, h) => ({
  emitOne: { prim: 'glyphPlate', args: { x, y, w, h, color: P('withAlpha', { color: V('tone.ink'), alpha: 0.1 }) } },
})
// 摘要／标签这类可能为空的行：先声明成空数组，有才量（与玉版宣那一份同一写法，
// 直接对 null 调 fitLines 会在没摘要的那篇上抛）。
const MAYBE_LINES = (name, textVar, args) => [
  LET(name, []),
  STEP_IF(truthy(textVar), [LET(name, P('fitLines', { text: textVar, ...args }))]),
]
// 一行文字的收尾：y 是第一行基线，往下每行加 lh，最后一行只到基线附近再补半个字号。
const bottom = (topVar, linesVar, lh, size) =>
  add(V(topVar), mul(sub(len(V(linesVar)), 1), lh), N(size))
// 有就往下顶、没有就当它不存在（标签行／摘要行后面那一档的起点都这么算）。
const advance = (curVar, linesVar, gap) =>
  IF(truthy(V(linesVar)), add(V(curVar), gap), V(curVar))

const qrStickerAt = (x, y, size) => [
  LET('qr', P('qrSticker', { x, y, size, ink: tok('muted'), label: P('i18n', { key: 'scanToView' }) })),
]
const qrX = (pad, size) => rightX(pad, size)
// 贴右那一格通用的横坐标（码贴纸、侧影那一块方图都是这一句）。
const rightX = (padVar, wVar) => sub(sub(V('W'), V(padVar)), V(wVar))
const sqX = () => rightX('pad', 'sq')

const MIN_APP = '2.3.18' // 图位吃配图这套画法从这一号包才认（与种子那十行同一档）
// 眉标那一行＝分类 · 来源 · 日期，读序照详情窗那屏（块名在前，与列表页 #215 同一条口径）。
const metaLine = (maxW, size) => LET('meta', P('clipLine', {
  text: P('joinNonEmpty', { sep: ' · ', parts: [P('blockName'), P('sourceLabel'), P('noteDate')] }),
  maxW, size, bold: true,
}))
const tagsLine = (maxW, size) => LET('tagLine', P('clipLine', { text: P('tagsJoined', { sep: ' / ' }), maxW, size }))
const signRowAt = (x, y, maxW, size, avatarD) => LET('sign', P('signRow', { x, y, maxW, size, avatarD }))
// 卡总高＝署名那一档与码贴纸那一档取高，再加底边距（十套都是这一句收尾）。
const footHeight = (signTop, pad) => add(V(signTop), mx(V('sign.h'), P('footH', { qrSize: V('qrSize') })), N(pad))

// ================================================================ ① 推窗 sash
// 详情窗那一屏的读序原样搬到卡片上：眉标 → 大标题 → 标签 → 大图 → 摘要 → 署名＋码。
// 图在正文中间，四周留内边距、四角圆——就是那扇"窗"。
// 与已有十套的差别：玉版宣（默认那套）根本没有图位；叠翠右上方那枚是圆头像。这一稿放的是这篇的配图。
const SASH = {
  id: 'sash',
  min_version: 1,
  steps: [
    LET('pad', 48), LET('qrSize', 116),
    LET('tone', P('paperOf', { categoryId: V('note.category_id') })),
    LET('innerW', sub(V('W'), mul(V('pad'), 2))),
    metaLine(V('innerW'), 22),
    LET('titleLines', P('fitLines', { text: V('note.title'), maxW: V('innerW'), n: 3, size: 44, bold: true })),
    tagsLine(V('innerW'), 24),
    ...MAYBE_LINES('sumLines', V('note.summary'), { maxW: V('innerW'), n: 5, size: 28 }),
    // 照片按 3:2 定死：654 宽 → 405 高。drawCover 是居中裁切，比例一定，同一分类的多张卡才对得齐。
    LET('photoH', 405),
    LET('metaTop', 56),
    LET('titleTop', add(V('metaTop'), 22, 36)),
    LET('titleBottom', bottom('titleTop', 'titleLines', 60, 44)),
    LET('tagTop', add(V('titleBottom'), 26)),
    LET('afterTag', advance('tagTop', 'tagLine', 24)),
    LET('photoTop', add(V('afterTag'), 30)),
    LET('afterPhoto', add(V('photoTop'), V('photoH'))),
    LET('sumTop', add(V('afterPhoto'), 32)),
    LET('bodyBottom', add(V('sumTop'), IF(truthy(V('sumLines')), add(mul(sub(len(V('sumLines')), 1), 44), 28), N(0)))),
    LET('signTop', add(V('bodyBottom'), 46)),
    signRowAt(V('pad'), V('signTop'), sub(V('innerW'), V('qrSize'), 30), 30, 76),
    LET('height', footHeight('signTop', 56)),

    L('fill', { x: 0, y: 0, w: V('W'), h: V('height'), color: V('tone.bg') }),
    L('text', { x: V('pad'), y: add(V('metaTop'), 22), lines: [V('meta')], size: 22, weight: 'bold', color: tok('muted') }),
    L('text', { x: V('pad'), y: add(V('titleTop'), 44), lines: V('titleLines'), lh: 60, size: 44, weight: 'bold', color: V('tone.ink') }),
    PHOTO_SLOT(
      L('rrect', { x: V('pad'), y: V('photoTop'), w: V('innerW'), h: V('photoH'), r: 20, fill: tok('paper') }),
      [L('image', { key: 'note', x: V('pad'), y: V('photoTop'), w: V('innerW'), h: V('photoH'), r: 20 })],
      [GLYPH(V('pad'), V('photoTop'), V('innerW'), V('photoH'))]
    ),
    STEP_IF(truthy(V('tagLine')), [L('text', { x: V('pad'), y: add(V('tagTop'), 24), lines: [V('tagLine')], size: 24, color: tok('muted') })]),
    STEP_IF(truthy(V('sumLines')), [L('text', { x: V('pad'), y: add(V('sumTop'), 28), lines: V('sumLines'), lh: 44, size: 28, color: tok('body') })]),
    Ls('sign'),
    ...qrStickerAt(qrX('pad', 'qrSize'), V('signTop'), V('qrSize')),
    Ls('qr'),
  ],
}

// ================================================================ ② 满幅 fullsweep
// 照片顶到画布边、通栏出血占最上那一段，字全在纸上。
// 与杂志封面那套的区别就在名字里：封面把标题压在图上（图是背景，靠一条渐变压住白字），
// 这一稿图就是图、字都在纸上——第一眼是那张照片，但标题不会被一张脸或一件白衣服吃掉。
const FULLSWEEP = {
  id: 'fullsweep',
  min_version: 1,
  steps: [
    LET('pad', 48), LET('qrSize', 116),
    LET('tone', P('paperOf', { categoryId: V('note.category_id') })),
    LET('innerW', sub(V('W'), mul(V('pad'), 2))),
    LET('photoH', 470),
    metaLine(V('innerW'), 22),
    LET('titleLines', P('fitLines', { text: V('note.title'), maxW: V('innerW'), n: 3, size: 46, bold: true })),
    tagsLine(V('innerW'), 24),
    ...MAYBE_LINES('sumLines', V('note.summary'), { maxW: V('innerW'), n: 6, size: 28 }),
    LET('metaTop', add(V('photoH'), 56)),
    LET('titleTop', add(V('metaTop'), 22, 36)),
    LET('titleBottom', bottom('titleTop', 'titleLines', 64, 46)),
    LET('tagTop', add(V('titleBottom'), 26)),
    LET('afterTag', advance('tagTop', 'tagLine', 24)),
    LET('sumTop', add(V('afterTag'), 24)),
    LET('bodyBottom', add(V('sumTop'), IF(truthy(V('sumLines')), add(mul(sub(len(V('sumLines')), 1), 44), 28), N(0)))),
    LET('signTop', add(V('bodyBottom'), 48)),
    signRowAt(V('pad'), V('signTop'), sub(V('innerW'), V('qrSize'), 30), 30, 76),
    LET('height', footHeight('signTop', 56)),

    L('fill', { x: 0, y: 0, w: V('W'), h: V('height'), color: V('tone.bg') }),
    PHOTO_SLOT(
      L('fill', { x: 0, y: 0, w: V('W'), h: V('photoH'), color: tok('paper') }),
      [L('image', { key: 'note', x: 0, y: 0, w: V('W'), h: V('photoH') })],
      [GLYPH(0, 0, V('W'), V('photoH'))]
    ),
    L('text', { x: V('pad'), y: add(V('metaTop'), 22), lines: [V('meta')], size: 22, weight: 'bold', color: tok('muted') }),
    L('text', { x: V('pad'), y: add(V('titleTop'), 46), lines: V('titleLines'), lh: 64, size: 46, weight: 'bold', color: V('tone.ink') }),
    STEP_IF(truthy(V('tagLine')), [L('text', { x: V('pad'), y: add(V('tagTop'), 24), lines: [V('tagLine')], size: 24, color: tok('muted') })]),
    STEP_IF(truthy(V('sumLines')), [L('text', { x: V('pad'), y: add(V('sumTop'), 28), lines: V('sumLines'), lh: 44, size: 28, color: tok('body') })]),
    Ls('sign'),
    ...qrStickerAt(qrX('pad', 'qrSize'), V('signTop'), V('qrSize')),
    Ls('qr'),
  ],
}

// ================================================================ ③ 信片 postcard
// 通栏居中：图当一张冲印片摆在正中（外面垫一层纸白＋淡影，照片缩进一圈 ⇒ 看着就是带白边的相纸），
// 字在图下面居中，最下一条细分隔线压住署名与码。十套里没有一稿是通栏居中的。
const POSTCARD = {
  id: 'postcard',
  min_version: 1,
  steps: [
    LET('pad', 56), LET('qrSize', 112), LET('inset', 14),
    LET('tone', P('paperOf', { categoryId: V('note.category_id') })),
    LET('frameW', sub(V('W'), mul(V('pad'), 2))),
    LET('photoH', add(mul(V('frameW'), 0.62), mul(V('inset'), 2))),
    LET('cx', div(V('W'), 2)),
    LET('textW', sub(V('frameW'), 40)),
    metaLine(V('textW'), 22),
    LET('titleLines', P('fitLines', { text: V('note.title'), maxW: V('textW'), n: 3, size: 42, bold: true })),
    tagsLine(V('textW'), 24),
    ...MAYBE_LINES('sumLines', V('note.summary'), { maxW: V('textW'), n: 4, size: 27 }),
    LET('metaTop', 68),
    LET('frameTop', add(V('metaTop'), 22, 34)),
    LET('titleTop', add(V('frameTop'), V('photoH'), 44)),
    LET('titleBottom', bottom('titleTop', 'titleLines', 58, 42)),
    LET('tagTop', add(V('titleBottom'), 24)),
    LET('afterTag', advance('tagTop', 'tagLine', 24)),
    LET('sumTop', add(V('afterTag'), 22)),
    LET('bodyBottom', add(V('sumTop'), IF(truthy(V('sumLines')), add(mul(sub(len(V('sumLines')), 1), 42), 27), N(0)))),
    LET('ruleY', add(V('bodyBottom'), 44)),
    LET('signTop', add(V('ruleY'), 34)),
    signRowAt(V('pad'), V('signTop'), sub(V('frameW'), V('qrSize'), 30), 28, 72),
    LET('height', footHeight('signTop', 56)),

    L('fill', { x: 0, y: 0, w: V('W'), h: V('height'), color: V('tone.bg') }),
    L('text', { x: V('cx'), y: add(V('metaTop'), 22), lines: [V('meta')], size: 22, weight: 'bold', color: tok('muted'), align: 'center' }),
    // 相纸那一层：rrect 先铺纸白＋淡影，照片缩进 inset 一圈贴在它上面 ⇒ 视觉上是一张带白边的照片。
    PHOTO_SLOT(
      L('rrect', { x: V('pad'), y: V('frameTop'), w: V('frameW'), h: V('photoH'), r: 18, fill: tok('paper'), shadow: 'rgba(35, 37, 44, 0.12)' }),
      [L('image', { key: 'note', x: add(V('pad'), V('inset')), y: add(V('frameTop'), V('inset')), w: sub(V('frameW'), mul(V('inset'), 2)), h: sub(V('photoH'), mul(V('inset'), 2)), r: 8 })],
      [GLYPH(V('pad'), V('frameTop'), V('frameW'), V('photoH'))]
    ),
    L('text', { x: V('cx'), y: add(V('titleTop'), 42), lines: V('titleLines'), lh: 58, size: 42, weight: 'bold', color: V('tone.ink'), align: 'center' }),
    STEP_IF(truthy(V('tagLine')), [L('text', { x: V('cx'), y: add(V('tagTop'), 24), lines: [V('tagLine')], size: 24, color: tok('muted'), align: 'center' })]),
    STEP_IF(truthy(V('sumLines')), [L('text', { x: V('cx'), y: add(V('sumTop'), 27), lines: V('sumLines'), lh: 42, size: 27, color: tok('body'), align: 'center', fam: tok('serif') })]),
    L('line', { x1: V('pad'), y1: V('ruleY'), x2: sub(V('W'), V('pad')), y2: V('ruleY'), w: 2, color: P('mix', { c1: V('tone.ink'), c2: tok('paper'), w: 0.82 }) }),
    Ls('sign'),
    ...qrStickerAt(qrX('pad', 'qrSize'), V('signTop'), V('qrSize')),
    Ls('qr'),
  ],
}

// ================================================================ ④ 侧影 sidepiece
// 图缩到右上那一块方形，标题从左侧绕过去——四稿里塞得下最多字的一稿。
// 与叠翠的区别：叠翠右上方那枚是圆头像，这一稿那块是这篇的配图；头像退到底部署名行那枚小圆
// （signRow 自己带，不在上面重复占位）。
const SIDEPIECE = {
  id: 'sidepiece',
  min_version: 1,
  steps: [
    LET('pad', 48), LET('qrSize', 116), LET('sq', 236), LET('gap', 26),
    LET('tone', P('paperOf', { categoryId: V('note.category_id') })),
    LET('innerW', sub(V('W'), mul(V('pad'), 2))),
    LET('titleW', sub(V('innerW'), V('sq'), V('gap'))),
    metaLine(V('innerW'), 22),
    LET('titleLines', P('fitLines', { text: V('note.title'), maxW: V('titleW'), n: 4, size: 40, bold: true })),
    tagsLine(V('innerW'), 24),
    ...MAYBE_LINES('sumLines', V('note.summary'), { maxW: V('innerW'), n: 8, size: 28 }),
    LET('metaTop', 56),
    LET('titleTop', add(V('metaTop'), 22, 34)),
    LET('titleBottom', bottom('titleTop', 'titleLines', 54, 40)),
    LET('photoTop', add(V('metaTop'), 22, 22)),
    // 那一格的高度永远预留（有图放图、没图放品牌印），下面那一行的起点跟着它走，不许压在图上。
    LET('rowBottom', mx(V('titleBottom'), add(V('photoTop'), V('sq')))),
    LET('tagTop', add(V('rowBottom'), 30)),
    LET('afterTag', advance('tagTop', 'tagLine', 24)),
    LET('sumTop', add(V('afterTag'), 22)),
    LET('bodyBottom', add(V('sumTop'), IF(truthy(V('sumLines')), add(mul(sub(len(V('sumLines')), 1), 44), 28), N(0)))),
    LET('signTop', add(V('bodyBottom'), 46)),
    signRowAt(V('pad'), V('signTop'), sub(V('innerW'), V('qrSize'), 30), 30, 76),
    LET('height', footHeight('signTop', 56)),

    L('fill', { x: 0, y: 0, w: V('W'), h: V('height'), color: V('tone.bg') }),
    L('text', { x: V('pad'), y: add(V('metaTop'), 22), lines: [V('meta')], size: 22, weight: 'bold', color: tok('muted') }),
    L('text', { x: V('pad'), y: add(V('titleTop'), 40), lines: V('titleLines'), lh: 54, size: 40, weight: 'bold', color: V('tone.ink') }),
    PHOTO_SLOT(
      L('rrect', { x: sqX(), y: V('photoTop'), w: V('sq'), h: V('sq'), r: 20, fill: tok('paper') }),
      [L('image', { key: 'note', x: sqX(), y: V('photoTop'), w: V('sq'), h: V('sq'), r: 20 })],
      [GLYPH(sqX(), V('photoTop'), V('sq'), V('sq'))]
    ),
    STEP_IF(truthy(V('tagLine')), [L('text', { x: V('pad'), y: add(V('tagTop'), 24), lines: [V('tagLine')], size: 24, color: tok('muted') })]),
    STEP_IF(truthy(V('sumLines')), [L('text', { x: V('pad'), y: add(V('sumTop'), 28), lines: V('sumLines'), lh: 44, size: 28, color: tok('body') })]),
    Ls('sign'),
    ...qrStickerAt(qrX('pad', 'qrSize'), V('signTop'), V('qrSize')),
    Ls('qr'),
  ],
}

const ROWS = [
  { template_id: 'sash', label: '推窗', label_en: 'Open Sash', group_key: 'classic', sort_order: 110, min_app_version: MIN_APP, recipe: SASH },
  { template_id: 'fullsweep', label: '满幅', label_en: 'Full Sweep', group_key: 'classic', sort_order: 120, min_app_version: MIN_APP, recipe: FULLSWEEP },
  { template_id: 'postcard', label: '信片', label_en: 'Postcard', group_key: 'classic', sort_order: 130, min_app_version: MIN_APP, recipe: POSTCARD },
  { template_id: 'sidepiece', label: '侧影', label_en: 'Side Piece', group_key: 'classic', sort_order: 140, min_app_version: MIN_APP, recipe: SIDEPIECE },
]

fs.mkdirSync(OUT_DIR, { recursive: true })
ROWS.forEach((row) => {
  const p = path.join(OUT_DIR, `${row.template_id}.json`)
  fs.writeFileSync(p, `${JSON.stringify(row, null, 1)}\n`, 'utf8')
  console.log(`✓ ${path.relative(path.resolve(__dirname, '../..'), p)}　（${row.label}／${row.recipe.steps.length} 步）`)
})
