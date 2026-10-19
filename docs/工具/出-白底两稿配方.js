// 站长 10-19 晚上更正的那一句：「你理解错误，我白底是指整个卡片模板白底，不是图片加白底。」
// ⇒ 上一趟（`出-白框两稿配方.js`，回滚点 4c48fad）把"白底"落在了照片那一圈卡纸上，读错了主体。
//   这一趟按更正后的读法重出：
//     · **整张卡的底＝纸白**（`token paper`，实测 #FFFFFF），不再吃 `paperOf` 那档分类色底；
//     · **灰色边框＝照片那一圈**（`stroke: token muted` #9A9EA6、3 宽），照片直接铺，中间那圈白衬撤掉。
//   两稿各撤「分类·来源·日期」与标签那两行（他上一句圈的红，这一句没改口）。
//
// 这一份只管把两稿配方落成 docs/design/10-19卡片白底两稿/<id>.json，不画图、不下发、不碰现网：
//   NEW_TPL_FILES="docs/design/10-19卡片白底两稿/sashWhite.json docs/design/10-19卡片白底两稿/topWhite.json" \
//     bash docs/工具/跑尺子.sh 9431 出-新模板候选
//
// ⚠ 底换成白以后，字色**必须**跟着换成全局那三枚令牌（ink/body/muted），一处都不许再引 `tone.ink`：
//   `paperOf` 返回的 ink 是"配那张底的字色"，深色档（PAPER_B）那枚是 #EEF0EB——
//   压在白底上就是一行几乎看不见的白字。这就是 §11.2 第 4 条"颜色要问落在什么底上"。
// ⚠ 同理 `signRow` 这一趟**显式**给 `onDark: false`。它内部是 `onDark ? PAPER : INK`，
//   省着不传＝按 false 走，白卡上正好；但上一趟那两版没显式写，碰上深色分类底就会把名字画成墨压墨。
const fs = require('fs')
const path = require('path')

const OUT_DIR = path.resolve(__dirname, '../design/10-19卡片白底两稿')

const V = (p) => ({ var: p })
const N = (n) => n
const P = (name, args) => ({ prim: name, args: args || {} })
const add = (...a) => ({ '+': a })
const sub = (...a) => ({ '-': a })
const mul = (...a) => ({ '*': a })
const len = (a) => ({ len: a })
const mx = (...a) => ({ max: a })
// 值位的 if 是三连（引擎写明"要 [条件, 真, 假] 三个参数"），少给一个就会把 null 当值往下算。
const IF = (cond, then, els) => ({ if: [cond, then, els] })
const truthy = (v) => ({ truthy: v })
const tok = (name) => P('token', { name })
const L = (k, fields) => ({ emit: { k, ...fields } })
const Ls = (name) => ({ emitMany: { var: `${name}.layers` } })
const LET = (name, value) => ({ let: name, value })
const STEP_IF = (cond, then, els) => ({ if: { cond, then, else: els || [] } })
// 灰框走令牌，不写死 hex（§11.2 第 3 条）。muted＝#9A9EA6，压白底 2.4:1，是一枚读得出来的浅灰线。
const gray = tok('muted')

// 照片那一圈：描边压在照片矩形边线上（canvas 的 stroke 居中于路径，3 宽＝内外各 1.5）。
// 没配图那一态照旧：几何照样预留，里面落一枚品牌印，不留一块什么都不画的空底（这一格他没拍过）。
const framed = (fx, fy, fw, fh) => {
  const plate = L('rrect', { x: fx, y: fy, w: fw, h: fh, r: 16, stroke: gray, strokeWidth: 3 })
  return STEP_IF(truthy(V('hasNote')),
    [L('image', { key: 'note', x: fx, y: fy, w: fw, h: fh, r: 14 }), plate],
    [{ emitOne: { prim: 'glyphPlate', args: { x: fx, y: fy, w: fw, h: fh, color: P('withAlpha', { color: tok('ink'), alpha: 0.1 }) } } }, plate])
}

const qrAt = (x, y, size) => LET('qr', P('qrSticker', {
  x, y, size, ink: gray, label: P('i18n', { key: 'scanToView' }),
}))
const signAt = (x, y, maxW) => LET('sign', P('signRow', {
  x, y, maxW, size: 30, avatarD: 76, onDark: false,
}))
const foot = (signTop, pad) => add(V(signTop), mx(V('sign.h'), P('footH', { qrSize: V('qrSize') })), N(pad))
const MIN_APP = '2.3.18'

// ================================================================ ① 推窗白底 sashWhite
// 大标题在顶上，中间那张带灰边的照片当窗，摘要在下面。整张卡是纸白。
const SASH_WHITE = {
  id: 'sashWhite',
  min_version: 1,
  steps: [
    LET('pad', 48), LET('qrSize', 116),
    LET('innerW', sub(V('W'), mul(V('pad'), 2))),
    LET('titleLines', P('fitLines', { text: V('note.title'), maxW: V('innerW'), n: 3, size: 46, bold: true })),
    LET('sumLines', P('fitLines', { text: V('note.summary'), maxW: V('innerW'), n: 5, size: 28 })),
    LET('photoH', 420),
    LET('titleTop', 72),
    LET('titleBottom', add(V('titleTop'), mul(sub(len(V('titleLines')), 1), 64), 46)),
    LET('frameTop', add(V('titleBottom'), 40)),
    LET('sumTop', add(V('frameTop'), V('photoH'), 40)),
    LET('bodyBottom', add(V('sumTop'), IF(truthy(V('sumLines')), add(mul(sub(len(V('sumLines')), 1), 44), 28), N(0)))),
    LET('signTop', add(V('bodyBottom'), 48)),
    signAt(V('pad'), V('signTop'), sub(V('innerW'), V('qrSize'), 30)),
    LET('height', foot('signTop', 56)),

    L('fill', { x: 0, y: 0, w: V('W'), h: V('height'), color: tok('paper') }),
    L('text', { x: V('pad'), y: add(V('titleTop'), 46), lines: V('titleLines'), lh: 64, size: 46, weight: 'bold', color: tok('ink') }),
    framed(V('pad'), V('frameTop'), V('innerW'), V('photoH')),
    STEP_IF(truthy(V('sumLines')), [L('text', { x: V('pad'), y: add(V('sumTop'), 28), lines: V('sumLines'), lh: 44, size: 28, color: tok('body') })]),
    Ls('sign'),
    qrAt(sub(sub(V('W'), V('pad')), V('qrSize')), V('signTop'), V('qrSize')),
    Ls('qr'),
  ],
}

// ================================================================ ② 满幅白底 topWhite
// 带灰边的照片占最上面那一段（外边距 32，还是"满幅"那个第一眼），标题在图下面。整张卡是纸白。
const TOP_WHITE = {
  id: 'topWhite',
  min_version: 1,
  steps: [
    LET('pad', 48), LET('qrSize', 116), LET('out', 32),
    LET('innerW', sub(V('W'), mul(V('pad'), 2))),
    LET('frameW', sub(V('W'), mul(V('out'), 2))),
    LET('photoH', 470),
    LET('titleLines', P('fitLines', { text: V('note.title'), maxW: V('innerW'), n: 3, size: 48, bold: true })),
    LET('sumLines', P('fitLines', { text: V('note.summary'), maxW: V('innerW'), n: 6, size: 28 })),
    LET('titleTop', add(V('photoH'), V('out'), 44)),
    LET('titleBottom', add(V('titleTop'), mul(sub(len(V('titleLines')), 1), 66), 48)),
    LET('sumTop', add(V('titleBottom'), 30)),
    LET('bodyBottom', add(V('sumTop'), IF(truthy(V('sumLines')), add(mul(sub(len(V('sumLines')), 1), 44), 28), N(0)))),
    LET('signTop', add(V('bodyBottom'), 48)),
    signAt(V('pad'), V('signTop'), sub(V('innerW'), V('qrSize'), 30)),
    LET('height', foot('signTop', 56)),

    L('fill', { x: 0, y: 0, w: V('W'), h: V('height'), color: tok('paper') }),
    framed(V('out'), V('out'), V('frameW'), V('photoH')),
    L('text', { x: V('pad'), y: add(V('titleTop'), 48), lines: V('titleLines'), lh: 66, size: 48, weight: 'bold', color: tok('ink') }),
    STEP_IF(truthy(V('sumLines')), [L('text', { x: V('pad'), y: add(V('sumTop'), 28), lines: V('sumLines'), lh: 44, size: 28, color: tok('body') })]),
    Ls('sign'),
    qrAt(sub(sub(V('W'), V('pad')), V('qrSize')), V('signTop'), V('qrSize')),
    Ls('qr'),
  ],
}

const ROWS = [
  { template_id: 'sashWhite', label: '推窗白底', label_en: 'Sash, White', group_key: 'classic', sort_order: 150, min_app_version: MIN_APP, recipe: SASH_WHITE },
  { template_id: 'topWhite', label: '满幅白底', label_en: 'Full Sweep, White', group_key: 'classic', sort_order: 160, min_app_version: MIN_APP, recipe: TOP_WHITE },
]

fs.mkdirSync(OUT_DIR, { recursive: true })
ROWS.forEach((row) => {
  const p = path.join(OUT_DIR, `${row.template_id}.json`)
  fs.writeFileSync(p, `${JSON.stringify(row, null, 1)}\n`, 'utf8')
  console.log(`✓ ${path.relative(path.resolve(__dirname, '../..'), p)}　（${row.label}／${row.recipe.steps.length} 步）`)
})
