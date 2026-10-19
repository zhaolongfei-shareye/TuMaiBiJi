// 站长 10-19 晚上那一句：「标红的去掉，然后图片要白底，加灰色边框。这两个设计，再出一稿。」
// 两张截图上他各圈了两行 ⇒ 撤的是**眉标那一行（分类·来源·日期）与标签那一行**，两稿都撤；
// 「白底＋灰边框」＝照片不再直接贴在卡面上，改成**卡纸装裱**：一层纸白 + 一圈灰细边，照片缩进一圈。
// 这一份只管把两稿配方落成 docs/design/10-19卡片白框两稿/<id>.json，不画图、不下发、不碰现网：
//   NEW_TPL_FILES="docs/design/10-19卡片白框两稿/sashMat.json docs/design/10-19卡片白框两稿/topMat.json" \
//     bash docs/工具/跑尺子.sh 9431 出-新模板候选
//
// ⚠ 那圈灰不许写死 hex（§11.2 第 3 条）。走 `mix(ink, paper, 0.30)`＝八分纸二分墨，实测 #BDBCBB、
//   对纸白 #FFFDF8 是 1.87:1——装饰性的框这一档看得见又不抢照片；再淡到 0.16（#DCDAD7、1.37:1）
//   就贴着纸面看不出了。**`mix` 第三个参数是 c1 的权重**（形参就叫 weightOfA），写反了会得到一条近墨的线。
const fs = require('fs')
const path = require('path')

const OUT_DIR = path.resolve(__dirname, '../design/10-19卡片白框两稿')

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
const grayLine = P('mix', { c1: tok('ink'), c2: tok('paper'), w: 0.3 })

// 白底＋灰边那一格：框 = 纸白实心 + 3 宽的灰描边；照片缩进 mat 一圈，露出来的就是那圈卡纸。
// 没配图那一态照上一轮的口径：几何照样预留，里面落一枚品牌印，不留一块什么都不画的空底。
// mat 传进来的是**配方里的项**（`V('mat')`），不是 JS 数：所以两边衬都要走算子乘，不许写 `mat * 2`
// （那会算成 NaN，JSON.stringify 再把 NaN 写成 null，落盘就是一份读不懂的配方）。
const framed = (fx, fy, fw, fh, mat) => {
  const inner = { x: add(fx, mat), y: add(fy, mat), w: sub(fw, mul(mat, N(2))), h: sub(fh, mul(mat, N(2))) }
  const plate = L('rrect', { x: fx, y: fy, w: fw, h: fh, r: 20, fill: tok('paper'), stroke: grayLine, strokeWidth: 3 })
  return STEP_IF(truthy(V('hasNote')),
    [plate, L('image', { key: 'note', ...inner, r: 10 })],
    [plate, { emitOne: { prim: 'glyphPlate', args: { ...inner, color: P('withAlpha', { color: V('tone.ink'), alpha: 0.1 }) } } }])
}

const qrAt = (x, y, size) => LET('qr', P('qrSticker', {
  x, y, size, ink: tok('muted'), label: P('i18n', { key: 'scanToView' }),
}))
const signAt = (x, y, maxW) => LET('sign', P('signRow', { x, y, maxW, size: 30, avatarD: 76 }))
const foot = (signTop, pad) => add(V(signTop), mx(V('sign.h'), P('footH', { qrSize: V('qrSize') })), N(pad))
const MIN_APP = '2.3.18'

// ================================================================ ① 推窗白框 sashMat
// 大标题在顶上，中间那张卡纸装裱的照片当窗，摘要在下面。上一稿那两行（眉标／标签）撤净。
const SASH_MAT = {
  id: 'sashMat',
  min_version: 1,
  steps: [
    LET('pad', 48), LET('qrSize', 116), LET('mat', 18),
    LET('tone', P('paperOf', { categoryId: V('note.category_id') })),
    LET('innerW', sub(V('W'), mul(V('pad'), 2))),
    LET('titleLines', P('fitLines', { text: V('note.title'), maxW: V('innerW'), n: 3, size: 46, bold: true })),
    LET('sumLines', P('fitLines', { text: V('note.summary'), maxW: V('innerW'), n: 5, size: 28 })),
    LET('photoH', 405),
    LET('frameH', add(V('photoH'), mul(V('mat'), 2))),
    LET('titleTop', 72),
    LET('titleBottom', add(V('titleTop'), mul(sub(len(V('titleLines')), 1), 64), 46)),
    LET('frameTop', add(V('titleBottom'), 40)),
    LET('sumTop', add(V('frameTop'), V('frameH'), 40)),
    LET('bodyBottom', add(V('sumTop'), IF(truthy(V('sumLines')), add(mul(sub(len(V('sumLines')), 1), 44), 28), N(0)))),
    LET('signTop', add(V('bodyBottom'), 48)),
    signAt(V('pad'), V('signTop'), sub(V('innerW'), V('qrSize'), 30)),
    LET('height', foot('signTop', 56)),

    L('fill', { x: 0, y: 0, w: V('W'), h: V('height'), color: V('tone.bg') }),
    L('text', { x: V('pad'), y: add(V('titleTop'), 46), lines: V('titleLines'), lh: 64, size: 46, weight: 'bold', color: V('tone.ink') }),
    framed(V('pad'), V('frameTop'), V('innerW'), V('frameH'), V('mat')),
    STEP_IF(truthy(V('sumLines')), [L('text', { x: V('pad'), y: add(V('sumTop'), 28), lines: V('sumLines'), lh: 44, size: 28, color: tok('body') })]),
    Ls('sign'),
    qrAt(sub(sub(V('W'), V('pad')), V('qrSize')), V('signTop'), V('qrSize')),
    Ls('qr'),
  ],
}

// ================================================================ ② 满幅白框 topMat
// 装裱过的照片占最上面那一段（外边距压到 32，还是"满幅"那个第一眼），标题在图下面。
const TOP_MAT = {
  id: 'topMat',
  min_version: 1,
  steps: [
    LET('pad', 48), LET('qrSize', 116), LET('mat', 18), LET('out', 32),
    LET('tone', P('paperOf', { categoryId: V('note.category_id') })),
    LET('innerW', sub(V('W'), mul(V('pad'), 2))),
    LET('frameW', sub(V('W'), mul(V('out'), 2))),
    LET('photoH', 470),
    LET('frameH', add(V('photoH'), mul(V('mat'), 2))),
    LET('titleLines', P('fitLines', { text: V('note.title'), maxW: V('innerW'), n: 3, size: 48, bold: true })),
    LET('sumLines', P('fitLines', { text: V('note.summary'), maxW: V('innerW'), n: 6, size: 28 })),
    LET('titleTop', add(V('frameH'), V('out'), 44)),
    LET('titleBottom', add(V('titleTop'), mul(sub(len(V('titleLines')), 1), 66), 48)),
    LET('sumTop', add(V('titleBottom'), 30)),
    LET('bodyBottom', add(V('sumTop'), IF(truthy(V('sumLines')), add(mul(sub(len(V('sumLines')), 1), 44), 28), N(0)))),
    LET('signTop', add(V('bodyBottom'), 48)),
    signAt(V('pad'), V('signTop'), sub(V('innerW'), V('qrSize'), 30)),
    LET('height', foot('signTop', 56)),

    L('fill', { x: 0, y: 0, w: V('W'), h: V('height'), color: V('tone.bg') }),
    framed(V('out'), V('out'), V('frameW'), V('frameH'), V('mat')),
    L('text', { x: V('pad'), y: add(V('titleTop'), 48), lines: V('titleLines'), lh: 66, size: 48, weight: 'bold', color: V('tone.ink') }),
    STEP_IF(truthy(V('sumLines')), [L('text', { x: V('pad'), y: add(V('sumTop'), 28), lines: V('sumLines'), lh: 44, size: 28, color: tok('body') })]),
    Ls('sign'),
    qrAt(sub(sub(V('W'), V('pad')), V('qrSize')), V('signTop'), V('qrSize')),
    Ls('qr'),
  ],
}

const ROWS = [
  { template_id: 'sashMat', label: '推窗白框', label_en: 'Sash, Matted', group_key: 'classic', sort_order: 150, min_app_version: MIN_APP, recipe: SASH_MAT },
  { template_id: 'topMat', label: '满幅白框', label_en: 'Full Sweep, Matted', group_key: 'classic', sort_order: 160, min_app_version: MIN_APP, recipe: TOP_MAT },
]

fs.mkdirSync(OUT_DIR, { recursive: true })
ROWS.forEach((row) => {
  const p = path.join(OUT_DIR, `${row.template_id}.json`)
  fs.writeFileSync(p, `${JSON.stringify(row, null, 1)}\n`, 'utf8')
  console.log(`✓ ${path.relative(path.resolve(__dirname, '../..'), p)}　（${row.label}／${row.recipe.steps.length} 步）`)
})
