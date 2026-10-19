// 站长 10-19 深夜那一句：「图再上文在下那种，但图片要顶满上面和左右。」
// ⇒ 版式沿用 `topWhite`（照片在上、文字在下），但照片**通栏出血**：x=0、y=0、宽＝画布宽，顶到上边与左右两边。
//
// ⚠ 顶满三条边之后，"照片外面那一圈灰框"就没地方落了：描边是**居中于路径**画的（poster.js:683），
//   压在画布边上的那一半直接出画布，读出来只剩 1.5px，而且三边都这样 ⇒ 等于没有框。
//   所以这一趟出两版，把"灰色边框"这一枚落到两个还能落的地方，让他挑：
//     ① `topBleed`「满幅顶格」——灰线压在**照片底边**那一刀（照片与文字的分界），三边出血、只有这一条边有线；
//     ② `topBleedEdge`「顶格描边」——灰框描在**整张卡的外沿**一圈，照片在框底下出血到顶。
//
// 两版都留着前面几趟已定的口径：整卡纸白、红框里那两行（分类·来源·日期／标签）撤着、
// 字色一律走全局令牌（底不再随分类换档，见 §11.2 第 11 条）、`signRow` 显式 `onDark:false`。
// 照片不再圆角：通栏出血那三边本来就该是直角，`r` 只有一枚、给不了"只圆下面两个角"（真机 roundRect 吃不吃数组我没验，不赌）。
//
// 这一份只管把两版配方落成 docs/design/10-19卡片顶格两稿/<id>.json，不画图、不下发、不碰现网：
//   NEW_TPL_FILES="docs/design/10-19卡片顶格两稿/topBleed.json docs/design/10-19卡片顶格两稿/topBleedEdge.json" \
//     bash docs/工具/跑尺子.sh 9431 出-新模板候选
const fs = require('fs')
const path = require('path')

const OUT_DIR = path.resolve(__dirname, '../design/10-19卡片顶格两稿')

const V = (p) => ({ var: p })
const N = (n) => n
const P = (name, args) => ({ prim: name, args: args || {} })
const add = (...a) => ({ '+': a })
const sub = (...a) => ({ '-': a })
const mul = (...a) => ({ '*': a })
const len = (a) => ({ len: a })
const mx = (...a) => ({ max: a })
const IF = (cond, then, els) => ({ if: [cond, then, els] })
const truthy = (v) => ({ truthy: v })
const tok = (name) => P('token', { name })
const L = (k, fields) => ({ emit: { k, ...fields } })
const Ls = (name) => ({ emitMany: { var: `${name}.layers` } })
const LET = (name, value) => ({ let: name, value })
const STEP_IF = (cond, then, els) => ({ if: { cond, then, else: els || [] } })
const gray = tok('muted')

// 通栏出血那一张照片：有图就铺图，没图那一态照样预留几何、里面落一枚品牌印（不留空底，这格他没拍过）。
const bleedPhoto = (h) => STEP_IF(truthy(V('hasNote')),
  [L('image', { key: 'note', x: 0, y: 0, w: V('W'), h })],
  [{ emitOne: { prim: 'glyphPlate', args: { x: 0, y: 0, w: V('W'), h, color: P('withAlpha', { color: tok('ink'), alpha: 0.1 }) } } }])

const qrAt = (x, y, size) => LET('qr', P('qrSticker', {
  x, y, size, ink: gray, label: P('i18n', { key: 'scanToView' }),
}))
const signAt = (x, y, maxW) => LET('sign', P('signRow', {
  x, y, maxW, size: 30, avatarD: 76, onDark: false,
}))
const foot = (signTop, pad) => add(V(signTop), mx(V('sign.h'), P('footH', { qrSize: V('qrSize') })), N(pad))
const MIN_APP = '2.3.18'
const PHOTO_H = 470
const GAP = 44

// 两版共用的那一段：照片（顶格）→ 标题 → 摘要 → 署名＋码。返回 { let 段, 落笔段 } 太绕，直接整份写两遍。
// 之所以复制而不是抽函数：配方里 let 的引用顺序不能倒（§11.2 第 2 条），抽出来还要把 W/pad/qrSize 当参数递，
// 递错一个就是 null；两遍各 20 行，读的人一眼能对着画布数。
function build(id, edgeFrame) {
  const steps = [
    LET('pad', 48), LET('qrSize', 116),
    LET('innerW', sub(V('W'), mul(V('pad'), 2))),
    LET('titleLines', P('fitLines', { text: V('note.title'), maxW: V('innerW'), n: 3, size: 48, bold: true })),
    LET('sumLines', P('fitLines', { text: V('note.summary'), maxW: V('innerW'), n: 6, size: 28 })),
    LET('titleTop', add(N(PHOTO_H), N(GAP))),
    LET('titleBottom', add(V('titleTop'), mul(sub(len(V('titleLines')), 1), 66), 48)),
    LET('sumTop', add(V('titleBottom'), 30)),
    LET('bodyBottom', add(V('sumTop'), IF(truthy(V('sumLines')), add(mul(sub(len(V('sumLines')), 1), 44), 28), N(0)))),
    LET('signTop', add(V('bodyBottom'), 48)),
    signAt(V('pad'), V('signTop'), sub(V('innerW'), V('qrSize'), 30)),
    LET('height', foot('signTop', 56)),
  ]
  const paint = [
    L('fill', { x: 0, y: 0, w: V('W'), h: V('height'), color: tok('paper') }),
    bleedPhoto(N(PHOTO_H)),
  ]
  if (!edgeFrame) {
    // ① 灰线压在照片底边那一刀：描边居中 ⇒ 上下各吃 1.5px，正好把出血那张照片与下面的字分开。
    paint.push(L('line', { x1: 0, y1: N(PHOTO_H), x2: V('W'), y2: N(PHOTO_H), w: 3, color: gray }))
  }
  paint.push(
    L('text', { x: V('pad'), y: add(V('titleTop'), 48), lines: V('titleLines'), lh: 66, size: 48, weight: 'bold', color: tok('ink') }),
    STEP_IF(truthy(V('sumLines')), [L('text', { x: V('pad'), y: add(V('sumTop'), 28), lines: V('sumLines'), lh: 44, size: 28, color: tok('body') })]),
    Ls('sign'),
    qrAt(sub(sub(V('W'), V('pad')), V('qrSize')), V('signTop'), V('qrSize')),
    Ls('qr'),
  )
  if (edgeFrame) {
    // ② 灰框描在整张卡外沿：路径往内让半个描边（1.5），3 宽才整条落在画布里；照片在它底下出血到顶，所以那三边是"框压着图"。
    paint.push(L('rrect', {
      x: N(1.5), y: N(1.5),
      w: sub(V('W'), N(3)), h: sub(V('height'), N(3)), r: 0, stroke: gray, strokeWidth: 3,
    }))
  }
  return { id, min_version: 1, steps: steps.concat(paint) }
}

const ROWS = [
  { template_id: 'topBleed', label: '满幅顶格', label_en: 'Full Bleed Top', group_key: 'classic', sort_order: 170, min_app_version: MIN_APP, recipe: build('topBleed', false) },
  { template_id: 'topBleedEdge', label: '顶格描边', label_en: 'Bleed, Framed', group_key: 'classic', sort_order: 180, min_app_version: MIN_APP, recipe: build('topBleedEdge', true) },
]

fs.mkdirSync(OUT_DIR, { recursive: true })
ROWS.forEach((row) => {
  const p = path.join(OUT_DIR, `${row.template_id}.json`)
  fs.writeFileSync(p, `${JSON.stringify(row, null, 1)}\n`, 'utf8')
  console.log(`✓ ${path.relative(path.resolve(__dirname, '../..'), p)}　（${row.label}／${row.recipe.steps.length} 步）`)
})
