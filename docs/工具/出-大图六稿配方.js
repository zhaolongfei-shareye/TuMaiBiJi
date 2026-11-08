// 11-07 站长一句：「参考国外流行设计，设计几个卡片模板，主要是大图+文字。这是卡片市场的模板，不是卡片。」
//
// 所以这一份产出的是**配方**（后端推送、前端渲染的那份数据），不是六张画死的图：
//   落 docs/design/11-07卡片市场大图六稿/<id>.json ＋ rows.json（种子形状，供挑定后走 跑新模板流程.sh）
//   ⚠ 故意不落 backend/seed/poster_extra/：那是"看过图、下一步就进种子"的暂存位，
//     站在那儿会被对账尺子读成"忘了重跑生成器"，谁顺手重跑生成器这六份没挑过的稿就跟着上现网。
//
// 六稿都只用包内那十种绘制 op 与原语名单里的名字（不新增 op ⇒ 不用发版）；
// 大图位没图时一律落品牌印（glyphPlate），几何永远预留——拿头像顶照片会把"没配图"画成"有张脸"。
// 国外参照（取证板在同目录 board.html 顶部，五张真商店截图）：
//   明信片 ← Day One 的纸面留白＋日期栏；浮签 ← VSCO/Are.na 的浮层说明卡；
//   画廊 ← 美术馆标签/Lightroom 的宽卡纸＋小字签；胶片 ← Letterboxd/胶片机的齿孔与帧号；
//   刊栏 ← Medium/Substack 的左图右栏；叠影 ← Spotify/Adobe Express 的双色压图＋跨缝大字。
const fs = require('fs')
const path = require('path')

const OUT_DIR = path.resolve(__dirname, '../design/11-07卡片市场大图六稿')

const V = (p) => ({ var: p })
const P = (name, args) => ({ prim: name, args: args || {} })
const add = (...a) => ({ '+': a })
const sub = (...a) => ({ '-': a })
const mul = (...a) => ({ '*': a })
const div = (a, b) => ({ '/': [a, b] })
const mx = (...a) => ({ max: a })
const IF = (cond, then, els) => ({ if: [cond, then, els] })
const truthy = (v) => ({ truthy: v })
const tok = (name) => P('token', { name })
const alpha = (color, a) => P('withAlpha', { color, alpha: a })
const L = (k, fields) => ({ emit: { k, ...fields } })
const Ls = (name) => ({ emitMany: { var: `${name}.layers` } })
const LET = (name, value) => ({ let: name, value })
const STEP_IF = (cond, then, els) => ({ if: { cond, then, else: els || [] } })
const EACH = (over, as, doSteps) => ({ each: { over, as, do: doSteps } })
const scheme = (name) => P('scheme', { name, categoryId: V('note.category_id') })
const mast = (track, size) => P('clipTrack', {
  text: P('joinNonEmpty', { sep: ' · ', parts: [P('blockName'), P('noteDate')] }),
  maxW: sub(V('W'), 128), track, size, bold: true,
})
// 大图位：有配图吃配图；没图落品牌印，几何不塌。
const photo = (x, y, w, h, extra) => STEP_IF(truthy(V('hasNote')),
  [L('image', { key: 'note', x, y, w, h, ...(extra || {}) })],
  [{ emitOne: P('glyphPlate', { x, y, w, h, color: alpha(tok('ink'), 0.12) }) }])
const signAndQr = (pad, signTop, qrSize, onDark, inkOverride) => [
  LET('sign', P('signRow', {
    x: pad, y: signTop, maxW: sub(V('W'), mul(pad, 2), qrSize, 30),
    size: 28, avatarD: 72, onDark,
  })),
  Ls('sign'),
  LET('qr', P('qrSticker', {
    x: sub(V('W'), pad, qrSize), y: signTop, size: qrSize,
    offset: V('s.accent'), ink: inkOverride || V('s.sub'), label: P('i18n', { key: 'scanToView' }),
  })),
  Ls('qr'),
]

const recipes = []
const rows = []
// 站长 11-08：「卡片市场／模板选择要把新的排前面，否则用户不知道更新了」。
// sort_order 服务端下发即生效（templateList 整份吃它），不用发版；组内 1..6 排在包内 10..100 之前。
const pick = (dark, light) => ({ if: [truthy(V('hasNote')), dark, light] })
const paperScheme = () => P('scheme', { name: 'riso', categoryId: V('note.category_id') })
const SHELF = { postcard: ['classic', 1], gallery: ['classic', 2], floatcap: ['bold', 3], filmframe: ['bold', 4], splitcol: ['bold', 5], duotone: ['bold', 6] }
function put(id, label, labelEn, steps, group) {
  // 闸门（engine.validate）要求第一笔 emit 是 x=0/y=0/w=var W/h=var height 的全张底，
  // 所以 let 全部前置（height 依赖量字与 signRow，但那些都是 let，可以先算），emit 保持原序。
  const lets = steps.filter((st) => st.let !== undefined)
  const emits = steps.filter((st) => st.let === undefined)
  const ground = emits.find((st) => st.emit && st.emit.k === 'fill' && st.emit.x === 0 && st.emit.y === 0)
  if (ground) ground.emit.h = V('height')
  const recipe = { id, min_version: 1, steps: [...lets, ...emits] }
  recipes.push([id, recipe])
  const shelf = SHELF[id] || [group || 'bold', 90 + recipes.length]
  rows.push({ template_id: id, label, label_en: labelEn, group_key: shelf[0], sort_order: shelf[1], status: 'live', min_app_version: '2.4.25', recipe })
}

// ── 1 明信片：明信片**背面**——上半照片＋右上邮票位码；下半一条竖栏线分开：
//    左横排留言（眉标/serif 标题/摘要/署名），右两列竖排（分类·日期＋一句话），右起读。
{
  const s = []
  s.push(LET('s', scheme('riso')), LET('pad', 44), LET('imgH', 560), LET('qrSize', 112))
  s.push(LET('zoneTop', add(V('pad'), V('imgH'), 40)), LET('divX', 470), LET('leftW', sub(V('divX'), V('pad'), 24)))
  s.push(LET('kick', P('clipTrack', { text: P('joinNonEmpty', { sep: ' · ', parts: [P('blockName'), P('noteDate')] }), maxW: V('leftW'), track: 3, size: 20, bold: true })))
  s.push(LET('titleLines', P('fitLines', { text: V('note.title'), maxW: V('leftW'), n: 2, size: 40, bold: true })))
  s.push(LET('titleY', add(V('zoneTop'), 56)))
  s.push(LET('titleBottom', add(V('titleY'), mul(sub({ len: V('titleLines') }, 1), 54), 40)))
  s.push(LET('sumLines', IF(truthy(V('note.summary')), P('fitLines', { text: V('note.summary'), maxW: V('leftW'), n: 2, size: 22 }), [])))
  s.push(LET('sumY', add(V('titleBottom'), 30)))
  s.push(LET('sumBottom', IF(truthy({ len: V('sumLines') }), add(V('sumY'), mul(sub({ len: V('sumLines') }, 1), 32), 22), V('titleBottom'))))
  s.push(LET('signTop', add(V('sumBottom'), 48)))
  s.push(LET('sign', P('signRow', { x: V('pad'), y: V('signTop'), maxW: V('leftW'), size: 24, avatarD: 56, onDark: false })))
  s.push(LET('leftBottom', add(V('signTop'), V('sign.h'))))
  // 右栏两列竖排：列高写死 340，zone 高再取左栏与它的较大者，避免互相依赖
  s.push(LET('vk', P('vertCols', { text: { slice: [P('joinNonEmpty', { sep: ' · ', parts: [P('blockName'), P('noteDate')] }), 0, 14] }, colH: 340, step: 26, maxCols: 1, size: 20, fam: tok('serif') })))
  s.push(LET('vs', P('vertCols', { text: IF(truthy(V('profile.slogan')), V('profile.slogan'), ''), colH: 340, step: 26, maxCols: 1, size: 22, fam: tok('serif') })))
  s.push(LET('rightUsed', mx(P('maxOf', { values: V('vk.advs'), seed: 0 }), P('maxOf', { values: V('vs.advs'), seed: 0 }))))
  s.push(LET('zoneH', mx(sub(V('leftBottom'), V('zoneTop')), add(V('rightUsed'), 24), 364)))
  s.push(LET('qr', P('qrSticker', { x: sub(V('W'), V('pad'), V('qrSize')), y: add(V('pad'), 24), size: V('qrSize'), offset: V('s.accent'), ink: alpha(tok('hard'), 0.82), label: P('i18n', { key: 'scanToView' }) })))
  s.push(LET('height', add(V('zoneTop'), V('zoneH'), V('pad'))))
  s.push(L('fill', { x: 0, y: 0, w: V('W'), h: V('height'), color: V('s.bg') }))
  s.push(photo(V('pad'), V('pad'), sub(V('W'), mul(V('pad'), 2)), V('imgH'), { r: 4 }))
  s.push(L('rrect', { x: V('pad'), y: V('pad'), w: sub(V('W'), mul(V('pad'), 2)), h: V('imgH'), r: 4, stroke: alpha(V('s.ink'), 0.22), strokeWidth: 2 }))
  s.push(Ls('qr'))
  s.push(L('line', { x1: V('divX'), y1: V('zoneTop'), x2: V('divX'), y2: add(V('zoneTop'), V('zoneH')), w: 2, color: alpha(V('s.ink'), 0.2) }))
  s.push(L('text', { x: V('pad'), y: add(V('zoneTop'), 20), lines: [V('kick')], size: 20, weight: 'bold', color: V('s.accent'), track: 3 }))
  s.push(L('text', { x: V('pad'), y: V('titleY'), lines: V('titleLines'), lh: 54, size: 40, weight: 'bold', color: V('s.ink') }))
  s.push(STEP_IF(truthy({ len: V('sumLines') }), [
    L('text', { x: V('pad'), y: V('sumY'), lines: V('sumLines'), lh: 32, size: 22, color: V('s.sub') }),
  ]))
  s.push(Ls('sign'))
  s.push(STEP_IF(truthy({ len: V('vk.cols') }), [
    L('text', { x: 684, y: add(V('zoneTop'), 8), lines: V('vk.cols'), vert: true, lh: 26, size: 20, color: alpha(V('s.ink'), 0.62), fam: tok('serif'), vpunct: true }),
  ]))
  s.push(STEP_IF(truthy({ len: V('vs.cols') }), [
    L('text', { x: 628, y: add(V('zoneTop'), 8), lines: V('vs.cols'), vert: true, lh: 26, size: 22, color: V('s.ink'), fam: tok('serif'), vpunct: true }),
  ]))
  put('postcard', '明信片', 'Postcard', s)
}

// ── 2 浮签：整幅照片＋左偏浮层说明卡（VSCO / Are.na）
{
  const s = []
  s.push(LET('s', scheme('mono')), LET('sp', paperScheme()), LET('H', 1180), LET('pad', 40), LET('qrSize', 104))
  s.push(L('fill', { x: 0, y: 0, w: V('W'), h: V('H'), color: pick(V('s.bg'), V('sp.bg')) }))
  s.push(STEP_IF(truthy(V('hasNote')), [L('image', { key: 'note', x: 0, y: 0, w: V('W'), h: V('H') })],
    [{ emitOne: P('glyphPlate', { x: 0, y: 0, w: V('W'), h: V('panelY'), color: alpha(tok('ink'), 0.12) }) }]))
  s.push(STEP_IF(truthy(V('hasNote')), [L('grad', {
    x: 0, y: 0, w: V('W'), h: V('H'), c1: alpha(V('s.bg'), 0.1), c2: alpha(V('s.bg'), 0.5),
    stops: [{ obj: { at: 0, color: alpha(V('s.bg'), 0.05) } }, { obj: { at: 0.55, color: alpha(V('s.bg'), 0.12) } }, { obj: { at: 1, color: alpha(V('s.bg'), 0.62) } }],
  })]))
  s.push(LET('mast', mast(3, 18)))
  s.push(LET('mastW', add(P('trackWidth', { text: V('mast'), track: 3 }), 36)))
  s.push(L('rrect', { x: V('pad'), y: 36, w: V('mastW'), h: 40, r: 20, fill: pick(alpha(tok('hard'), 0.5), alpha(tok('ink'), 0.08)) }))
  s.push(L('text', { x: add(V('pad'), 18), y: 63, lines: [V('mast')], size: 18, weight: 'bold', color: pick(tok('paper'), tok('ink')), track: 3 }))
  s.push(LET('qr', P('qrSticker', { x: sub(V('W'), V('pad'), V('qrSize')), y: 36, size: V('qrSize'), offset: V('s.accent'), ink: alpha(tok('hard'), 0.82), label: P('i18n', { key: 'scanToView' }) })))
  s.push(Ls('qr'))
  s.push(LET('panelY', sub(V('H'), 400)), LET('panelW', sub(V('W'), 140)), LET('panelH', 340))
  s.push(L('rrect', { x: V('pad'), y: V('panelY'), w: V('panelW'), h: V('panelH'), r: 18, fill: tok('paper'), shadow: alpha(tok('hard'), 0.35), shadowBlur: 28, shadowY: 12 }))
  s.push(LET('innerW', sub(V('panelW'), 88)))
  s.push(LET('titleLines', P('fitLines', { text: V('note.title'), maxW: V('innerW'), n: 2, size: 40, bold: true })))
  s.push(L('text', { x: add(V('pad'), 44), y: add(V('panelY'), 76), lines: V('titleLines'), lh: 54, size: 40, weight: 'bold', color: tok('ink') }))
  s.push(LET('titleBottom', add(V('panelY'), 76, mul(sub({ len: V('titleLines') }, 1), 54), 40)))
  s.push(LET('sumLines', IF(truthy(V('note.summary')), P('fitLines', { text: V('note.summary'), maxW: V('innerW'), n: 2, size: 22 }), [])))
  s.push(STEP_IF(truthy({ len: V('sumLines') }), [
    L('text', { x: add(V('pad'), 44), y: add(V('titleBottom'), 40), lines: V('sumLines'), lh: 32, size: 22, color: tok('body') }),
  ]))
  s.push(LET('sign', P('signRow', { x: add(V('pad'), 44), y: add(V('panelY'), V('panelH'), -76), maxW: sub(V('innerW'), 0), size: 24, avatarD: 56, onDark: false })))
  s.push(Ls('sign'))
  s.push(LET('height', V('H')))
  put('floatcap', '浮签', 'Float Caption', s)
}

// ── 3 画廊：通栏大图＋纸面竖排题跋（站长 11-08：「画廊模版改改，图片通栏」）。
//    图边到边铺满上半；下半纸面上竖排题右起两列、竖排款接在其左，底部横排 meta＋署名＋码。
//    无图＝纸面＋通栏图位一枚「麦」（旧模板语言）。
{
  const s = []
  s.push(LET('s', scheme('riso')), LET('pad', 64), LET('imgH', 720), LET('qrSize', 108))
  s.push(LET('colTop', add(V('imgH'), 48)), LET('colH', 380), LET('slot', 64), LET('x0', sub(V('W'), 70)))
  s.push(LET('T', P('vertCols', { text: V('note.title'), colH: V('colH'), step: 54, maxCols: 2, size: 42, bold: true, fam: tok('serif') })))
  s.push(LET('tN', { len: V('T.cols') }))
  s.push(LET('B', P('vertCols', { text: IF(truthy(V('note.summary')), V('note.summary'), ''), colH: V('colH'), step: 30, maxCols: 2, size: 22, fam: tok('serif') })))
  s.push(LET('sumX', sub(V('x0'), mul(add(V('tN'), 1), V('slot')))))
  s.push(LET('usedH', mx(P('maxOf', { values: V('T.advs'), seed: 0 }), P('maxOf', { values: V('B.advs'), seed: 0 }))))
  s.push(LET('meta', P('joinNonEmpty', { sep: ' · ', parts: [P('sourceLabel'), P('noteDate')] })))
  s.push(LET('metaY', add(V('colTop'), V('usedH'), 44)))
  s.push(LET('signTop', add(V('metaY'), 48)))
  s.push(LET('sign', P('signRow', { x: V('pad'), y: V('signTop'), maxW: sub(V('W'), mul(V('pad'), 2), V('qrSize'), 30), size: 26, avatarD: 64, onDark: false })))
  s.push(LET('qr', P('qrSticker', { x: sub(V('W'), V('pad'), V('qrSize')), y: V('signTop'), size: V('qrSize'), offset: V('s.accent'), ink: V('s.sub'), label: P('i18n', { key: 'scanToView' }) })))
  s.push(LET('height', add(V('signTop'), mx(V('sign.h'), P('footH', { qrSize: V('qrSize') })), 48)))
  s.push(L('fill', { x: 0, y: 0, w: V('W'), h: V('height'), color: V('s.bg') }))
  s.push(STEP_IF(truthy(V('hasNote')), [
    L('image', { key: 'note', x: 0, y: 0, w: V('W'), h: V('imgH') }),
  ], [
    { emitOne: P('glyphPlate', { x: 0, y: 0, w: V('W'), h: V('imgH'), color: alpha(tok('ink'), 0.12) }) },
  ]))
  s.push(L('line', { x1: 0, y1: V('imgH'), x2: V('W'), y2: V('imgH'), w: 2, color: alpha(V('s.ink'), 0.18) }))
  s.push(STEP_IF(truthy({ len: V('T.cols') }), [
    L('text', { x: V('x0'), y: V('colTop'), lines: V('T.cols'), vert: true, lh: 54, colGap: sub(V('slot'), 54), size: 42, weight: 'bold', color: V('s.ink'), fam: tok('serif'), vpunct: true }),
  ]))
  s.push(STEP_IF(truthy({ len: V('B.cols') }), [
    L('text', { x: V('sumX'), y: V('colTop'), lines: V('B.cols'), vert: true, lh: 30, colGap: sub(V('slot'), 30), size: 22, color: alpha(V('s.ink'), 0.72), fam: tok('serif'), vpunct: true }),
  ]))
  s.push(L('text', { x: V('pad'), y: V('metaY'), lines: [V('meta')], size: 20, color: V('s.sub') }))
  s.push(Ls('sign'))
  s.push(Ls('qr'))
  put('gallery', '画廊', 'Gallery Mat', s)
}

// ── 4 胶片：暗底＋上下齿孔＋帧号（Letterboxd / 胶片机）
{
  const s = []
  s.push(LET('s', scheme('mono')), LET('sp', paperScheme()), LET('pad', 40), LET('imgY', 84), LET('imgH', 780), LET('qrSize', 108))
  s.push(L('fill', { x: 0, y: 0, w: V('W'), h: V('H'), color: pick(V('s.bg'), V('sp.bg')) }))
  const holes = [56, 146, 236, 326, 416, 506, 596, 686]
  s.push(EACH(holes, 'hx', [
    L('rrect', { x: V('hx'), y: 26, w: 44, h: 30, r: 6, fill: pick(alpha(tok('paper'), 0.14), alpha(tok('ink'), 0.14)) }),
    L('rrect', { x: V('hx'), y: sub(V('H'), 56), w: 44, h: 30, r: 6, fill: pick(alpha(tok('paper'), 0.14), alpha(tok('ink'), 0.14)) }),
  ]))
  s.push(photo(V('pad'), V('imgY'), sub(V('W'), mul(V('pad'), 2)), V('imgH'), { r: 4 }))
  s.push(LET('frame', P('joinNonEmpty', { sep: ' ', parts: ['FR', { padStart: [V('note.id'), 2] }, P('noteDate')] })))
  s.push(L('text', { x: sub(V('W'), V('pad')), y: 70, lines: [V('frame')], size: 20, fam: tok('mono'), color: pick(V('s.accent'), V('sp.accent')), align: 'right' }))
  s.push(LET('titleY', add(V('imgY'), V('imgH'), 72)))
  s.push(LET('titleLines', P('fitLines', { text: V('note.title'), maxW: sub(V('W'), mul(V('pad'), 2)), n: 2, size: 48, bold: true })))
  s.push(L('text', { x: V('pad'), y: V('titleY'), lines: V('titleLines'), lh: 62, size: 48, weight: 'bold', color: pick(V('s.ink'), V('sp.ink')) }))
  s.push(LET('titleBottom', add(V('titleY'), mul(sub({ len: V('titleLines') }, 1), 62), 48)))
  s.push(LET('sumLines', IF(truthy(V('note.summary')), P('fitLines', { text: V('note.summary'), maxW: sub(V('W'), mul(V('pad'), 2)), n: 2, size: 24 }), [])))
  s.push(STEP_IF(truthy({ len: V('sumLines') }), [
    L('text', { x: V('pad'), y: add(V('titleBottom'), 36), lines: V('sumLines'), lh: 36, size: 24, color: pick(V('s.sub'), V('sp.sub')) }),
  ]))
  s.push(LET('sumBottom', IF(truthy({ len: V('sumLines') }), add(V('titleBottom'), 36, mul(sub({ len: V('sumLines') }, 1), 36), 24), V('titleBottom'))))
  s.push(LET('signTop', add(V('sumBottom'), 56)))
  // 卡高跟着内容走：署名/码再往下留 216，底排齿孔才不会被码贴纸压住
  s.push(LET('H', add(V('signTop'), 216)))
  s.push(...signAndQr(V('pad'), V('signTop'), V('qrSize'), pick(true, false), pick(V('s.sub'), V('sp.sub'))))
  s.push(LET('height', V('H')))
  put('filmframe', '胶片', 'Film Frame', s)
}

// ── 5 刊栏：整幅照片铺满，右侧一枚悬浮的**深色毛玻璃**栏，字全落在玻璃上。
//    包内十种 op 没有 blur（加 op＝发版），磨砂感用同图去色＋半透明深罩＋细颗粒＋发丝边做：
//    玻璃里那层是同一张配图 gray＋tint，细节被抽掉只剩影调，隔着它看照片＝磨砂。
{
  const s = []
  s.push(LET('s', scheme('mono')), LET('sp', paperScheme()), LET('H', 1160), LET('gx', 396), LET('gy', 24), LET('gw', 330), LET('gh', sub(V('H'), 48)), LET('gr', 22))
  s.push(LET('pad', 32), LET('innerX', add(V('gx'), V('pad'))), LET('innerW', sub(V('gw'), mul(V('pad'), 2))), LET('qrSize', 100))
  s.push(LET('kick', P('clipTrack', { text: P('joinNonEmpty', { sep: ' · ', parts: [P('blockName'), P('noteDate')] }), maxW: V('innerW'), track: 3, size: 18, bold: true })))
  s.push(LET('titleLines', P('fitLines', { text: V('note.title'), maxW: V('innerW'), n: 4, size: 40, bold: true })))
  s.push(LET('titleY', 144))
  s.push(LET('titleBottom', add(V('titleY'), mul(sub({ len: V('titleLines') }, 1), 54), 40)))
  s.push(LET('sumLines', IF(truthy(V('note.summary')), P('fitLines', { text: V('note.summary'), maxW: V('innerW'), n: 5, size: 22 }), [])))
  s.push(LET('tags', P('clipLine', { text: P('tagsJoined', { sep: ' / ' }), maxW: V('innerW'), size: 20 })))
  s.push(LET('sign', P('signRow', { x: V('innerX'), y: sub(V('H'), 272), maxW: V('innerW'), size: 22, avatarD: 52, onDark: pick(true, false) })))
  s.push(LET('qr', P('qrSticker', { x: V('innerX'), y: sub(V('H'), 196), size: V('qrSize'), offset: V('s.accent'), ink: pick(V('s.sub'), V('sp.sub')), label: P('i18n', { key: 'scanToView' }) })))
  s.push(LET('height', V('H')))
  s.push(L('fill', { x: 0, y: 0, w: V('W'), h: V('height'), color: pick(V('s.bg'), V('sp.bg')) }))
  s.push(STEP_IF(truthy(V('hasNote')), [L('image', { key: 'note', x: 0, y: 0, w: V('W'), h: V('H') })],
    [{ emitOne: P('glyphPlate', { x: 0, y: 0, w: V('gx'), h: V('H'), color: alpha(tok('ink'), 0.12) }) }]))
  // 玻璃本体：不重画图（重画会 cover 再裁一遍＝玻璃里出现第二个人）。
  // 直接在原图对应位置罩半透明深纱＋颗粒＝位置天然对齐的磨砂；真 blur 要加 op＝发版，不做。
  s.push(STEP_IF(truthy(V('hasNote')), [
    L('rrect', { x: V('gx'), y: V('gy'), w: V('gw'), h: V('gh'), r: V('gr'), fill: alpha(tok('hard'), 0.68) }),
  ], [
    L('rrect', { x: V('gx'), y: V('gy'), w: V('gw'), h: V('gh'), r: V('gr'), fill: tok('paper') }),
  ]))
  s.push(L('rrect', { x: V('gx'), y: V('gy'), w: V('gw'), h: V('gh'), r: V('gr'), fill: pick(alpha(tok('hard'), 0.16), alpha(tok('ink'), 0.04)), shadow: alpha(tok('hard'), 0.5), shadowBlur: 34, shadowY: 12 }))
  s.push(L('rrect', { x: V('gx'), y: V('gy'), w: V('gw'), h: V('gh'), r: V('gr'), stroke: pick(alpha(tok('paper'), 0.3), alpha(tok('ink'), 0.18)), strokeWidth: 2 }))
  s.push(L('line', { x1: add(V('gx'), 24), y1: add(V('gy'), 3), x2: sub(add(V('gx'), V('gw')), 24), y2: add(V('gy'), 3), w: 2, color: pick(alpha(tok('paper'), 0.35), alpha(tok('ink'), 0.12)) }))
  s.push(L('dots', { x: add(V('gx'), 20), y: add(V('gy'), 20), w: sub(V('gw'), 40), h: sub(V('gh'), 40), gap: 10, r: 1, color: pick(alpha(tok('paper'), 0.07), alpha(tok('ink'), 0.05)), oddRowShift: 5 }))
  s.push(L('text', { x: V('innerX'), y: 88, lines: [V('kick')], size: 18, weight: 'bold', color: pick(V('s.accent'), V('sp.accent')), track: 3 }))
  s.push(L('text', { x: V('innerX'), y: V('titleY'), lines: V('titleLines'), lh: 54, size: 40, weight: 'bold', color: pick(V('s.ink'), V('sp.ink')) }))
  s.push(L('line', { x1: V('innerX'), y1: add(V('titleBottom'), 30), x2: sub(add(V('gx'), V('gw')), V('pad')), y2: add(V('titleBottom'), 30), w: 2, color: pick(alpha(tok('paper'), 0.25), alpha(tok('ink'), 0.18)) }))
  s.push(STEP_IF(truthy({ len: V('sumLines') }), [
    L('text', { x: V('innerX'), y: add(V('titleBottom'), 72), lines: V('sumLines'), lh: 34, size: 22, color: pick(V('s.sub'), V('sp.sub')) }),
  ]))
  s.push(STEP_IF(truthy({ len: V('tags') }), [
    L('text', { x: V('innerX'), y: sub(V('H'), 320), lines: [V('tags')], size: 20, color: pick(V('s.accent'), V('sp.accent')) }),
  ]))
  s.push(Ls('sign'))
  s.push(Ls('qr'))
  put('splitcol', '刊栏', 'Split Column', s)
}

// ── 6 叠影·圆窗：圆形遮罩吃原色照片，背景上黑下蓝渐变，字落在渐变上。
//    站长 11-08 一句：「叠影，换成圆形遮罩，图片用原色，背景用渐变，上黑下蓝」。
//    蓝是这一稿自己的强调色：包内色名单（paper/ink/body/muted/hard/warm）没有蓝，
//    加色名要发版；包内 cover 那套也有写死 '#FFFFFF' 的先例，故此处写死两枚蓝／琥珀，
//    它们不跟全局墨色统一走（统一墨色时这一枚不变，是模板自己的色）。
{
  const s = []
  const BLUE = '#2B44FF', MID = '#141A3C', AMBER = '#F6C445'
  s.push(LET('sp', paperScheme()), LET('H', 1240), LET('pad', 44), LET('d', 560), LET('cx', div(V('W'), 2)), LET('cy', 400), LET('qrSize', 108))
  s.push(LET('kick', P('clipTrack', { text: P('joinNonEmpty', { sep: ' · ', parts: [P('blockName'), P('noteDate')] }), maxW: sub(V('W'), mul(V('pad'), 2)), track: 4, size: 20, bold: true })))
  s.push(LET('titleLines', P('fitLines', { text: V('note.title'), maxW: sub(V('W'), mul(V('pad'), 2)), n: 2, size: 60, bold: true })))
  s.push(LET('titleY', 772))
  s.push(LET('titleBottom', add(V('titleY'), mul(sub({ len: V('titleLines') }, 1), 78), 60)))
  s.push(LET('sumLines', IF(truthy(V('note.summary')), P('fitLines', { text: V('note.summary'), maxW: 560, n: 2, size: 24 }), [])))
  s.push(LET('sumY', add(V('titleBottom'), 36)))
  s.push(LET('sumBottom', IF(truthy({ len: V('sumLines') }), add(V('sumY'), mul(sub({ len: V('sumLines') }, 1), 36), 24), V('titleBottom'))))
  s.push(LET('signTop', mx(add(V('sumBottom'), 52), sub(V('H'), 176))))
  s.push(LET('sign', P('signRow', { x: V('pad'), y: V('signTop'), maxW: sub(V('W'), mul(V('pad'), 2), V('qrSize'), 30), size: 26, avatarD: 64, onDark: pick(true, false) })))
  s.push(LET('qr', P('qrSticker', { x: sub(V('W'), V('pad'), V('qrSize')), y: V('signTop'), size: V('qrSize'), offset: AMBER, ink: pick(alpha(tok('paper'), 0.8), V('sp.sub')), label: P('i18n', { key: 'scanToView' }) })))
  s.push(LET('height', V('H')))
  s.push(L('fill', { x: 0, y: 0, w: V('W'), h: V('height'), color: pick(tok('hard'), V('sp.bg')) }))
  s.push(STEP_IF(truthy(V('hasNote')), [L('grad', { x: 0, y: 0, w: V('W'), h: V('height'), c1: pick(tok('hard'), V('sp.bg')), c2: pick(BLUE, P('mix', { c1: V('sp.bg'), c2: V('sp.accent'), w: 0.32 })), stops: [
    { obj: { at: 0, color: pick(tok('hard'), V('sp.bg')) } }, { obj: { at: 0.5, color: pick(MID, P('mix', { c1: V('sp.bg'), c2: V('sp.accent'), w: 0.14 })) } }, { obj: { at: 1, color: pick(BLUE, P('mix', { c1: V('sp.bg'), c2: V('sp.accent'), w: 0.32 })) } },
  ] })]))
  s.push(L('dots', { x: 24, y: 24, w: sub(V('W'), 48), h: sub(V('height'), 48), gap: 12, r: 1, color: pick(alpha(tok('paper'), 0.05), alpha(tok('ink'), 0.05)), oddRowShift: 6 }))
  s.push(L('circle', { x: V('cx'), y: V('cy'), r: 308, stroke: pick(alpha(tok('paper'), 0.14), alpha(tok('ink'), 0.12)), strokeWidth: 2 }))
  s.push(STEP_IF(truthy(V('hasNote')), [
    L('image', { key: 'note', x: sub(V('cx'), div(V('d'), 2)), y: sub(V('cy'), div(V('d'), 2)), w: V('d'), h: V('d'), clipCircle: true }),
  ], [
    L('circle', { x: V('cx'), y: V('cy'), r: div(V('d'), 2), fill: pick(alpha(tok('paper'), 0.08), alpha(tok('ink'), 0.06)) }),
    { emitOne: P('glyphPlate', { x: sub(V('cx'), div(V('d'), 2)), y: sub(V('cy'), div(V('d'), 2)), w: V('d'), h: V('d'), color: pick(alpha(tok('paper'), 0.1), alpha(tok('ink'), 0.12)) }) },
  ]))
  s.push(L('circle', { x: V('cx'), y: V('cy'), r: 282, stroke: pick(alpha(tok('paper'), 0.3), alpha(tok('ink'), 0.25)), strokeWidth: 2 }))
  s.push(L('text', { x: V('cx'), y: 72, lines: [V('kick')], size: 20, weight: 'bold', color: pick(AMBER, V('sp.accent')), track: 4, align: 'center' }))
  s.push(L('text', { x: V('cx'), y: V('titleY'), lines: V('titleLines'), lh: 78, size: 60, weight: 'bold', color: pick(tok('paper'), V('sp.ink')), align: 'center' }))
  s.push(STEP_IF(truthy({ len: V('sumLines') }), [
    L('text', { x: V('cx'), y: V('sumY'), lines: V('sumLines'), lh: 36, size: 24, color: pick(alpha(tok('paper'), 0.78), V('sp.sub')), align: 'center' }),
  ]))
  s.push(Ls('sign'))
  s.push(Ls('qr'))
  put('duotone', '圆窗叠影', 'Circle Overlay', s)
}

fs.mkdirSync(OUT_DIR, { recursive: true })
recipes.forEach(([id, recipe]) => {
  fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify(recipe, null, 2) + '\n')
})
rows.sort((x, y) => x.sort_order - y.sort_order)
fs.writeFileSync(path.join(OUT_DIR, 'rows.json'), JSON.stringify(rows, null, 2) + '\n')
console.log(`落 ${recipes.length} 份配方 → ${OUT_DIR}`)
recipes.forEach(([id, r]) => {
  const bytes = Buffer.byteLength(JSON.stringify(r), 'utf8')
  console.log(`  ${id.padEnd(10)} ${String(bytes).padStart(6)} B  steps=${r.steps.length}`)
})
