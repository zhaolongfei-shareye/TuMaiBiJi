// 第一屏那三块（左块人物入口 + 右两枚计数）的静态尺子。不连模拟器，纯读文件。
// 跑法：node docs/工具/验-第一屏三块.js
//
// 要守的东西，全是这一轮真踩过或真拍过的：
// ① 几何：左块 308 见方 = 右两枚 148＋缝 12＋148，这条等式一断，三块就不再是一个整体；
// ② 人物不许压住「记下来」那一条白底——效果图里男那张比女那张高约 55rpx，就是这么翻车的，
//    落码靠"取景窗下沿 = 白条上沿"这道数收住，所以两头都要钉住；
// ③ 三块的面色与字色只能由 palette.entryBlocks() 从当前壁纸派生，样式表里不许抄色相；
//    门槛只有字压面 ≥4.5 这一头（四套 × 三块 = 12 个值）。"面压照片"那一头**没有尺子**：
//    照片是用户自己换的、运行时拿不到亮度，而 10-10 我立的那道 3.0 是站长没提过的东西，已撤。
// ④ 两个计数必须来自接口，不许把效果图上那两个占位数（128／46）抄进页面；
// ⑤ 卡片那一格的一次性落点标记：立一次、读一次、清一次，常驻就把「默认第一个 tab」那条废了；
// ⑥ 换人不靠"连点两下"（那一下会把每次开门延住 300ms，10-10 深夜他据此打回）：
//    主人物在前、另一张画成右后方淡灰剪影，点剪影换位；键名与两张路径只住在 utils/person.js；
// ⑦ 组顶那条 calc 里的数，是从"整组高＋底栏高＋最少留白 24"推出来的，任何一头改了这里要跟着改
//    （10-14 之前它是 `min(66.3%, 100vh−562)`：比例那一条与贴底那一条在 410 那一档正好交于同一处，
//     内框压矮之后两条分叉 ⇒ 只留贴底这一条，两屏共用同一根底线）。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const palette = require(P('utils/palette.js'))

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— ' + extra : ''))
}
const num = (seg, prop) => parseInt(new RegExp(prop + ':\\s*(-?\\d+)rpx').exec(seg)?.[1] ?? '', 10)
// 尺寸令牌允许写死，也允许走 `var(--fs-x)`——现网这一档走的是令牌。写死一处的数就会在改了令牌
// 之后量出一个假的"对不上"，所以取值统一走这一个口子：是令牌就去 app.wxss 把它自己那一条读出来。
const decl = (src, prop) => {
  const m = new RegExp(`${prop}:\\s*([^;]+)`).exec(src)
  return m ? m[1].trim() : ''
}
const sizeOf = (sel, prop) => {
  const raw = decl(seg(sel), prop)
  const tok = /^var\((--[a-z0-9-]+)\)$/.exec(raw)
  const v = parseFloat(tok ? decl(appWxss, tok[1]) : raw)
  return Number.isFinite(v) ? v : NaN
}
/* "抄色相"的判据按**饱和度**认，不按白名单认：白名单那几支（纯白、纯黑、两档灰）本身就是
   中性色，写死是站长拍过的；而只要一支色有彩度，就不许出现在这三块的样式表里。
   原来这里只扫 `#rrggbb` 六种位——`rgba()`、三位色、八位色都从指缝里过去了（10-10 审计点的就
   是这一条）。现在先把所有颜色写法收齐，再逐支算 (max−min)/255。 */
const COLOR_RE = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g
const rgbOf = (tok) => {
  if (/^#/.test(tok)) {
    const hex = tok.slice(1)
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.slice(0, 6)
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  }
  return (tok.match(/[\d.]+/g) || []).map(Number).slice(0, 3)
}
// 阈值定在 8/255，这个数两头都是现量出来的：这一份样式表里允许写死的四支中性色测得
// 0（纯白、纯黑）／2（#3A3A3C）／5（#6E6E73），而四套壁纸发出来的那十二枚 eb 值测得 11~27
// （最浅的一档是雨雾 cards #CED1D9＝11）。两头之间隔着这条线，抄进来的品牌色一个都跑不掉。
const satOf = (tok) => (/^hsl/i.test(tok)
  ? ((tok.match(/[\d.]+/g) || [])[1] || 0) * 2.55
  : Math.max(...rgbOf(tok)) - Math.min(...rgbOf(tok)))
const isHue = (tok) => satOf(tok) > 8

const wxml = fs.readFileSync(P('pages/create/create.wxml'), 'utf8')
const wxssRaw = fs.readFileSync(P('pages/create/create.wxss'), 'utf8')
const wxss = wxssRaw.replace(/\/\*[\s\S]*?\*\//g, '')
const js = fs.readFileSync(P('pages/create/create.js'), 'utf8')
const jsOnly = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const ixJs = fs.readFileSync(P('pages/index/index.js'), 'utf8')
const tabWxss = fs.readFileSync(P('custom-tab-bar/index.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
// 全局那一份要在 §2 就把令牌值读出来（`var(--fs-micro)` 这一档落在这里），所以提前到取文件这一段。
const appWxss = fs.readFileSync(P('app.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const zh = require(P('utils/i18n.js')).texts('zh')
const en = require(P('utils/i18n.js')).texts('en')

// 只扫"这一个选择器自己那一段"：选择器必须顶到行首，否则 `.blk-stat-notes` 会被当成
// `.blk-stat` 那一段先命中，读到的就不是它自己的规则了。
const seg = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(wxss)
  return m ? m[1] : ''
}

/* ---------- 1. 几何：一块卡（两片皮）＋ 一列（2.2 B 方案） ---------- */
const sPerson = seg('.blk-person')
const sFace = seg('.blk-face')
const sCount = seg('.blk-count')
const sCol = seg('.blk-col')
const sRow = seg('.blk-row')
const PERSON = num(sPerson, 'width')
const PERSON_H = num(sPerson, 'height')
const FACE_H = num(sFace, 'height')
// 白面上沿离块顶多少：10-13 追打那一刀之前恒为 0（白面贴块顶），现在是女那张头带中点那一档。
const FACE_TOP = num(sFace, 'top')
const COUNT_H = num(sCount, 'height')
const GAP = num(sRow, 'gap')
// 面板那一档的高度从 `.panel` 现读，不写进判据：他这句「与第二个图高度对齐」说的是**关系**，
// 面板以后改成别的数，左块要跟着走，判据不该反过来把 410 钉成真理。
const PANEL_H = num(seg('.panel'), 'height')
ok('左块宽 308、高与第二屏那块面板同一个数（「左边内框要与第二个图高度对齐」）',
  PERSON === 308 && PERSON_H > 0 && PANEL_H > 0 && PERSON_H === PANEL_H,
  `块 ${PERSON}×${PERSON_H}／面板 ${PANEL_H}`)
/* 三段的账：白面上沿那一档留空 ＋ 白面 ＋ 墨面 ＝ 整块高。
   10-13 追打之前白面贴块顶（留空 0），等式退化成"两片皮拼成整块"；现在那 24 是**出血的一部分**，
   不写进等式的话，中间开缝或有一片溢出去都不红（块顶到白面顶那一条是透明带，屏上就是深色面板）。 */
ok('三段拼成整块：白面上沿留空 ＋ 白面 ＋ 墨面 ＝ 块高（对不上就是开了缝、或有一片溢出去）',
  FACE_H > 0 && COUNT_H > 0 && FACE_TOP >= 0 && FACE_TOP + FACE_H + COUNT_H === PERSON_H,
  `留空 ${FACE_TOP} ＋ 白面 ${FACE_H} ＋ 墨面 ${COUNT_H} vs 块 ${PERSON_H}`)
/* ⚠ 10-13 23:36 站长真机图：「漫画女背景多了一层」。成因就是原先描在整块外沿那一圈 2rpx 细边——
   白面从块顶往下留了 24（D17 甲），于是"描边 ＋ 描边与白板之间那条透出深色面板的带"读成第二层板。
   撤掉之后屏上只剩白面与墨面两片。这一条钉的是反面的不变量：这一层从此不许再有任何描边。
   （圆 ➕ 那一圈在 `.blk-plus` 上，是另一枚东西，另一条判据管着，别把这两件事混成一件。） */
ok('左块这一层不许再描边（一圈细边会被读成白板外面的第二层板）',
  !/box-shadow/.test(sPerson) && !/(?:^|[;\n])\s*border(?:-width|-style)?\s*:/.test(sPerson),
  (sPerson.match(/(?:box-shadow|border)[^;\n]*/g) || []).join(' ｜ ') || '没有描边')
/* ⚠ 这一条是他 10-13 那一刀的正面口径：「两个人切换到大人时候，人头要高于内框上沿，与目前现网一样」。
   上一版把 overflow 写在卡上，上面那 52rpx 的出血被裁平、人头齐根断。卡这一层从此只能不裁。 */
ok('卡自己不许出现 overflow（裁在卡上＝把出血那 52 一起切掉，人头被切平）',
  !/overflow/.test(sPerson), sPerson.replace(/\s+/g, ' ').trim().slice(0, 80))
ok('两片皮各自带圆角、各自裁（裁的是自己的角，不是整块）',
  /border-radius:\s*34rpx 34rpx 0 0/.test(sFace) && /overflow:\s*hidden/.test(sFace)
  && /border-radius:\s*0 0 34rpx 34rpx/.test(sCount) && /overflow:\s*hidden/.test(sCount),
  `白面 radius=${decl(sFace, 'border-radius')}／墨面 radius=${decl(sCount, 'border-radius')}`)
ok('左块定宽不伸、右列吃余量（效果图那一版左块宽度算成 0，人物没地方画，就是这两条反了）',
  /flex:\s*none/.test(sPerson) && /flex:\s*1/.test(sCol) && /min-width:\s*0/.test(sCol))
// 页面内缩 24，所以右列宽 = 750 − 24×2 − 左块 − 缝。这个数不写在任何地方，是推出来的。
const RIGHT_W = 750 - 24 * 2 - PERSON - GAP
ok('右列推出来的宽度落在 382（效果图上量的那一个）', RIGHT_W === 382, `${RIGHT_W}`)
// 列里那两样的账：➕ 定死 140 贴列底、与 Tips 那一格之间留 40，剩下的归 Tips 那一格。
const PLUS_W = num(seg('.blk-plus'), 'width')
const PLUS_H = num(seg('.blk-plus'), 'height')
const PLUS_GAP = num(seg('.blk-plus'), 'margin-top')
ok('圆形 ➕ 见方、贴列底，列高这本账（块高 − 缝 − ➕）正好是 Tips 那一格吃余量的那一段',
  PLUS_W > 0 && PLUS_W === PLUS_H && PLUS_GAP > 0
  && /flex:\s*1/.test(seg('.blk-tips')) && /align-self:\s*center/.test(seg('.blk-plus')),
  `➕ ${PLUS_W}×${PLUS_H}／缝 ${PLUS_GAP}／列 ${PERSON_H} ⇒ Tips 那一格 ${PERSON_H - PLUS_W - PLUS_GAP}`)
ok('➕ 在列的正中（他 10-13「右下的圆按钮要往中间靠，现在太边缘了」）',
  /align-self:\s*center/.test(seg('.blk-plus')) && !/right:\s*0/.test(seg('.blk-plus')))
// 两枚计数：块内左右各缩 22、中间缝 20，两枚等宽——这个数是从 `.blk-count` 那一段现读的，
// 只有等式成立才说明 markup 里真是两枚（写第三枚的话 flex 会把它们各自挤瘦，屏上不报错）。
const CNT_PAD = (decl(sCount, 'padding').match(/\d+/g) || []).map(Number)
const CNT_GAP = num(sCount, 'gap')
const CELL_W = (PERSON - (CNT_PAD[1] || CNT_PAD[0] || 0) * 2 - CNT_GAP) / 2
ok('两枚计数等宽（块内缩 22、中间缝 20 推出来那一档），且都带 min-width:0',
  (wxml.match(/class="blk-cell"/g) || []).length === 2
  && /flex:\s*1/.test(seg('.blk-cell')) && /min-width:\s*0/.test(seg('.blk-cell'))
  && CELL_W > 0 && CELL_W === Math.floor(CELL_W),
  `每枚 ${CELL_W}`)

/* ---------- 2. 人物那一张与那扇窗 ---------- */
const sWrap = seg('.blk-figwrap')
const sFig = seg('.blk-fig')
const OVER = -num(sWrap, 'top')            // 出血量：人物超出块顶那一段
const WRAP_BOTTOM = num(sWrap, 'bottom')   // 取景窗下沿离块底多少
const ratioOf = (f) => { const b = fs.readFileSync(P(f)); return b.readUInt32BE(20) / b.readUInt32BE(16) }
const FIG_W = num(sFig, 'width')
// 窗的"应然高度"从两张源件自己的像素尺寸算（10-13 他这一刀的数就是这么来的）：
// 女那张按宽 220 缩放的自然高，正好等于 出血 52 ＋ 白面 213 ⇒ 脚底压在墨面上沿、不悬空。
const FIG_F = Math.round(FIG_W * ratioOf('assets/ic-person.png'))
ok('取景窗有 overflow:hidden（没有它就裁不住，人物会盖到数字那一格上）', /overflow:\s*hidden/.test(sWrap))
ok('人物上边出血 52rpx（这就是"超出内框上沿"那一下，归 0 等于撤了这条决定）',
  OVER === 52, `出血 ${OVER}`)
/* 窗底必须正好停在墨面那一格的上沿——他 10-13 的原话是「女人上抬，下方不能悬空要与黑条靠着」。
   原来钉的是"窗底 ≥ 白条实测高，且不超 6rpx 呼吸"，因为那时脚底落在哪由白条多高说了算；
   现在那一格是墨面，窗底与它同一条线是**等式**而不是区间：不等就是悬空（窗底 < 墨面高）
   或者压进数字（窗底 > 墨面高）。 */
ok('窗底与墨面上沿是同一条线（悬空 或 压进数字都算红）',
  WRAP_BOTTOM === COUNT_H, `窗底 ${WRAP_BOTTOM} vs 墨面 ${COUNT_H}`)
const FIG_SRC_W = (() => { const b = fs.readFileSync(P('assets/ic-person.png')); return b.readUInt32BE(16) })()
/* 女那张的头带两行（发顶＝贝蕾帽那一截、下巴）：从 `docs/design/10-12-2.2全量效果图/标-女那张头带.png`
   逐行读出来的（那张图每 20 行一条横线并标行号），不是估的。源件 360×433，块内缩放比 ＝ 220/360。 */
const CROWN_ROW = 40, CHIN_ROW = 210
const HEAD_MID_BLOCK = -OVER + ((CROWN_ROW + CHIN_ROW) / 2) * (FIG_W / FIG_SRC_W)
const ALT_TOP = PERSON_H - WRAP_BOTTOM - num(seg('.blk-fig-alt'), 'height')   // 男剪影在块内的顶（窗底 213 − 高 132）
ok('窗高等于女那张按宽缩放的自然高（脚底刚好落在墨面上沿，一个像素不悬空）',
  FIG_W + OVER > 0 && (PERSON_H - WRAP_BOTTOM) + OVER === FIG_F,
  `窗高 ${(PERSON_H - WRAP_BOTTOM) + OVER} vs 女那张 ${FIG_F}`)
/* 站长 10-13 追打那一句的两半，各钉一条：「漫画女背景的白框，上部分，往下一点，让头部一半在框外，
   然后漫画男在框内」。原来这两句是"白面贴块顶 ＋ 窗顶出血 52"，白面顶在 0、女那张头带跨 −28..76
   ⇒ 只有出血那 28 在框外（约头的 28%），不是"一半"。 */
ok('白面上沿落在女那张的头带中点（±2rpx 内）⇒ 头部一半在框外',
  FACE_TOP > 0 && Math.abs(FACE_TOP - HEAD_MID_BLOCK) <= 2,
  `白面顶 ${FACE_TOP} vs 头带中点 ${HEAD_MID_BLOCK.toFixed(1)}（发顶 ${CROWN_ROW}／下巴 ${CHIN_ROW}）`)
ok('男剪影整张仍在白框内（它的顶必须低于白面上沿，否则这一刀把它也推出框了）',
  ALT_TOP > FACE_TOP, `剪影顶 ${ALT_TOP} vs 白面顶 ${FACE_TOP}`)
ok('人物只定宽、高由 widthFix 算（两张图比例不同：女 0.832／男 0.689，写死方盒会拉扁）',
  /width:\s*\d+rpx/.test(sFig) && !/height:/.test(sFig) && /mode="widthFix"/.test(wxml))
ok('男那张（更高）也在同一道窗里被裁齐：源件比例确实不同、且确实高出窗顶',
  (() => {
    const a = ratioOf('assets/ic-person.png'), b = ratioOf('assets/ic-person-alt.png')
    return Math.abs(a - b) > 0.1 && Math.round(FIG_W * b) > FACE_H + OVER
  })(),
  `窗高 ${FACE_H + OVER}／男那张按宽缩放 ${Math.round(FIG_W * ratioOf('assets/ic-person-alt.png'))}`
  + '（两个数相等或男不比窗高，这一组判据就没在管任何东西）')

/* ---------- 3. 两片皮：同一串停点、看得出的幅度、压得住的字 ----------
   他 10-13 两句一起管：「要与现网的渐变的过程一样」（＝停点位置照 .page-scrim，不自造缓动）
   与「内框也要有渐变效果，要有一定半透明」（＝幅度得看得见）。
   上一版在这两处各翻过一次车：① 照抄 .page-scrim 那串 .42→.72 到已经近实心的墨面上，
   合成只差 2 级＝画了跟没画一样（他那句"黑底的半透明渐变效果不好"就是这个）；
   ② 停点自己另写一套，与现网那条曲线不是"同一个过程"。所以这里两头都钉。 */
/* ⚠ `Number('43%')` 是 NaN、`JSON.stringify` 又把 NaN 写成 null——
   原来这里 `map(Number)` 之后比的是两串 null，**永远相等**，停点改成 38% 也不红（刀试出来的）。
   取百分比一律 parseFloat，并且先自证读到了七档，读不到就红，不许空过。 */
const stops = (src) => (src.match(/[\d.]+%/g) || []).map(parseFloat)
const scrimStops = stops(seg('.page-scrim') || segRaw('.page-scrim'))
const alphas = (src) => (src.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/g) || [])
  .map((s) => Number((/([\d.]+)\s*\)/.exec(s) || [0, 0])[1]))
function segRaw(sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(wxssRaw)
  return m ? m[1] : ''
}
/* ---------- 10-14 五档彩色毛玻璃：这几条读的值搬家了 ----------
   面板那三段（band／实心／左下那一格）与压在面板上的三档字，源码里现在写的是 `var(--stage-*)`
   与 `var(--blk-count-bg)`，**值在 `app.wxss` 的 `.mood-*` 那五块里**（真身在 utils/palette.js 的 moodVars）。
   所以这一组判据先按"墨那一档"把 var() 展开成它实际落地的值，再照原来的算法算合成灰阶与对比度——
   判的还是他 10-13 拍过的那几档数，只是量的位置从样式表挪到了令牌表。
   ⚠ 展开取的是 `.mood-ink`（默认那一档）：彩色那四档由 `验-五档彩色玻璃.js` 逐档钉，两边不重复。 */
const MOOD_INK = ((/\.mood-ink\s*\{([^}]*)\}/.exec(appWxss) || [0, ''])[1])
const tok = (v) => {
  const m = /var\((--[\w-]+)\)/.exec(v || '')
  if (!m) return v || ''
  const d = new RegExp('\\s*' + m[1] + ':([^;]+);').exec(MOOD_INK)
  return d ? d[1].trim() : v
}
const val = (segTxt, prop) => tok(decl(segTxt, prop))

ok('白面与墨面各是一条七档渐变（不是两档糊过去）',
  (val(sFace, 'background').match(/\d+%/g) || []).length === 7
  && (val(sCount, 'background').match(/\d+%/g) || []).length === 7,
  `白面 ${(val(sFace, 'background').match(/\d+%/g) || []).length} 档／墨面 ${(val(sCount, 'background').match(/\d+%/g) || []).length} 档`)
ok('两片皮的停点位置与现网 .page-scrim 逐档相同（"与现网的过程一样"）',
  scrimStops.length === 7
  && JSON.stringify(stops(val(sFace, 'background'))) === JSON.stringify(scrimStops)
  && JSON.stringify(stops(val(sCount, 'background'))) === JSON.stringify(scrimStops),
  `现网 ${scrimStops}／白面 ${stops(val(sFace, 'background'))}／墨面 ${stops(val(sCount, 'background'))}`)
ok('两片的基色一支是白、一支是 .page-scrim 那支 (18,20,26)',
  /rgba\(255,\s*255,\s*255/.test(val(sFace, 'background'))
  && /rgba\(18,\s*20,\s*26/.test(val(sCount, 'background')))
/* 幅度这一头按**合成后的灰阶差**判，不按透明度差判：透明度差 .3 压在近实心的墨底上，
   灰阶可能只动 2 级（那就是"画了等于没画"那一刀）。底取面板那支实心墨 #23252C（保守——
   真机上 .95 的面板还压着一张会透出来的图，底只会更浅，差只会更大不会更小）。
   门槛 6 级：现量白面 ≈60 级、墨面 ≈8 级，而他打回那一版（照抄 .page-scrim 的 .42→.72）实测 2 级，
   6 这条线正好卡在"看得出一个渐变"与"看不出来"中间。 */
const PANEL_FACE = '#23252C'
const toHexLocal = (rgb) => '#' + rgb.map((v) =>
  Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
// 一支 rgba(...) 压在实心底上合成出来的实心色——半透明层"画没画"只能这样算，盯着 alpha 会受骗
// （10-11 那条"白纱 .30 叠白 .70 合成 .79"的教训是同一件事的另一头）。
const over = (tok, bg) => {
  const n = ((tok || '').match(/[\d.]+/g) || []).map(Number)
  if (n.length < 4) return null
  const b = palette.hexToRgb(bg)
  return toHexLocal([0, 1, 2].map((i) => n[i] * n[3] + b[i] * (1 - n[3])))
}
const gradTok = (src, first) => {
  const t = (src.match(/rgba\([^)]*\)/g) || [])
  return first ? t[0] : t[t.length - 1]
}
const gradSpan = (src) => {
  const a = over(gradTok(src, true), PANEL_FACE)
  const b = over(gradTok(src, false), PANEL_FACE)
  return a && b ? Math.abs(palette.lumOf(a) - palette.lumOf(b)) : NaN
}
ok('白面渐变合成到墨面板之后上下两端差 ≥6 级（照抄 .42→.72 那种只差 2 级的算没画）',
  gradSpan(val(sFace, 'background')) >= 6,
  `实测 ${Math.round(gradSpan(val(sFace, 'background')))} 级`)
ok('墨面渐变合成到墨面板之后同样差 ≥6 级',
  gradSpan(val(sCount, 'background')) >= 6,
  `实测 ${Math.round(gradSpan(val(sCount, 'background')))} 级`)
// 字压面：那一格的底取**渐变最浅那一端**（最难读的头），字与横线各自先合成成实心再算。
const COUNT_FLOOR = over(gradTok(val(sCount, 'background'), true), PANEL_FACE)
const solidOf = (sel, prop) => {
  const raw = val(seg(sel), prop)
  return /^#/.test(raw) ? raw : over(raw, COUNT_FLOOR)
}
const crNum = palette.crOf(solidOf('.blk-num', 'color'), COUNT_FLOOR)
const crLab = palette.crOf(solidOf('.blk-lab', 'color'), COUNT_FLOOR)
const crRule = palette.crOf(solidOf('.blk-rule', 'background'), COUNT_FLOOR)
/* 读不到色号必须红，不许空过：solidOf 拿不到东西时返回 ''，crOf('') 会算出一个"看起来过了"的数。
   原来这一条就是靠 `!!jotInk &&` 挡的，换了三样东西之后那道挡箭牌也跟着换成三样都得是 hex。 */
const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '')
ok('数字与小字压得住墨面最难读那一端（≥4.5），横线作为图形 ≥3.0',
  isHex(COUNT_FLOOR) && isHex(solidOf('.blk-num', 'color')) && isHex(solidOf('.blk-lab', 'color'))
  && isHex(solidOf('.blk-rule', 'background'))
  && crNum >= 4.5 && crLab >= 4.5 && crRule >= 3.0,
  `底 ${COUNT_FLOOR}：数字 ${crNum.toFixed(2)}／小字 ${crLab.toFixed(2)}／横线 ${crRule.toFixed(2)}`)
ok('数字那一档是 64rpx 那支 Thin、小字吃现成的 --fs-micro（"与正常小字一样"＝同一档，不自起一架）',
  num(seg('.blk-num'), 'font-size') === 64 && /WtsjMind/.test(seg('.blk-num'))
  && /var\(--fs-micro\)/.test(seg('.blk-lab'))
  && sizeOf('.blk-lab', 'font-size') === 18,
  `数字 ${num(seg('.blk-num'), 'font-size')}／小字 ${sizeOf('.blk-lab', 'font-size')}`)

/* ---------- 4. 色相仍然只许从 palette 来 ---------- */
// 只扫这一组自己那些选择器那几段（同一份样式表下面还有面板、卡、滑条那些色，
// 拿整份来判"不许抄色相"会一把红到底，量不到任何东西）。
const blkSels = wxss.match(/^\.home-blk[-\w.,\s]*\{[^}]*\}|^\.blk[-\w.,\s]*\{[^}]*\}/gm) || []
const blkSegs = blkSels.join('\n')
// 这一段必须先自证"真的扫到了东西"：原来这条判据在 `blkSegs` 为空时是 `[] .length === 0` → 绿。
// 10-10 那次翻车（组名从 `.blk` 改成 `.home-blk`）只要正则少写一个分支，整组色判据就会集体假绿。
ok('色扫真扫到了这一组那几段（匹配到 0 段时，下面几条"没有抄色相"全是假绿）',
  blkSels.length >= 15 && blkSegs.length > 800,
  `${blkSels.length} 段／${blkSegs.length} 字符`)
const huesInBlk = (blkSegs.match(COLOR_RE) || []).filter(isHue)
/* 唯一允许出现在这一组里的彩度，是**全站那一枚纸白**（`--btn-ink` #F2EFE9，暖白，实测彩度 9，
   正好越过上面那条 8 级的线）——压在恒深的深色面板上，字只能写死这一支，
   吃 `--text-*` 那一族会随壁纸/深浅翻成墨（见 create.wxss 那一段注释）。
   放行条件是**逐通道与那一枚完全同值**，不是"看着像白就放行"：
   阈值那档（8）不能放宽，四套壁纸发出来的 eb 值实测 11~27，放宽就会放进一支真的品牌色；
   而别的暖白（比如随手抄的 #F5F0E6）通道不同，照样红。
   ⚠ 这一枚的值从 app.wxss 现读，抄进判据就成了两份真相。 */
const PAPER = ((/--btn-ink:\s*(#[0-9a-fA-F]{6})/.exec(appWxss) || [0, ''])[1] || '').toLowerCase()
const rgbOfPaper = palette.hexToRgb(PAPER || '#000000')
const isPaperWhite = (tok) => {
  if (!PAPER) return false
  const n = rgbOf(tok)
  return n.length >= 3 && n.slice(0, 3).every((v, i) => Math.round(v) === rgbOfPaper[i])
}
const offenders = huesInBlk.filter((t) => !isPaperWhite(t))
ok('这一组那几段样式表里没有抄进来的色相（中性色放行；唯一那支暖白必须是全站 `--btn-ink`）',
  !!PAPER && offenders.length === 0,
  offenders.join(',') || `纸白核对：${PAPER}`)
/* 10-14 之前这一条数的是 create.wxss 里那几处写死的 #F2EFE9；现在那四处换成 var(--stage-ink-*)，
   数源码里的字面量必然红。判据的前提跟着搬：**四处引用要在，且墨档展开出来必须还是那一枚纸白**
   （少一处＝那一处会跟着彩色档翻墨；展开不是纸白＝默认那一屏的字色被他没指的这一刀改掉了）。 */
const INK_REFS = ['.blk-num', '.blk-lab', '.blk-rule', '.blk-tips-in']
const inkRefOk = (sel) => /var\(--stage-ink[-\w]*\)/.test(seg(sel))   // 四枚后缀各不相同（-solid/-dim/空/-strong），别挨个列
const inkTokVals = ['.blk-num', '.blk-lab', '.blk-rule', '.blk-tips-in']
  .map((sel) => val(seg(sel), /blk-rule/.test(sel) ? 'background' : 'color'))
const inkTokPaper = inkTokVals.every((v) => isPaperWhite(v) || (v || '').toLowerCase() === PAPER.toLowerCase())
ok('面板上那四处字色各引一枚 `--stage-ink-*`，且墨档展开回来仍是全站那一枚纸白',
  INK_REFS.every(inkRefOk) && !!PAPER && inkTokPaper,
  `${INK_REFS.filter(inkRefOk).length}/4 引用齐；展开值 ${inkTokVals.join(' ')}`)
ok('这一组不再吃 `--eb-*`，也没有一处还写 `blkSkin`（那套随壁纸派生的面整条退役了）',
  !/--eb-|blkSkin|entryBlocks/.test(wxss + wxml + jsOnly),
  (/--eb-[a-z0-9-]+|blkSkin|entryBlocks/.exec(wxss + wxml + jsOnly) || ['(无)'])[0])
/* 10-13 站长「按钮变成白色风格。类似第二屏毛玻璃」⇒ 这一枚不再是快门橙，而是第二屏那面玻璃的同一配方。
   钉三样：① 吃 `--glass-plate` 且挂了糊（只写白不写糊＝一张白饼，不是毛玻璃）；② 不许写死色值；
   ③ 容器上那一套 `--cp-*` 仍要发——图形那枚吃 `--cp-cam-ink`，搬到 `.panel` 上首屏就拿不到。 */
ok('➕ 是第二屏那一配方（白 .50  plate ＋ 糊 ＋ 细边），且没有抄进来的色值',
  /background:\s*var\(--glass-plate\)/.test(seg('.blk-plus'))
  && /backdrop-filter:\s*var\(--glass-bf\)/.test(seg('.blk-plus'))
  && /-webkit-backdrop-filter:\s*var\(--glass-bf\)/.test(seg('.blk-plus'))
  && /var\(--glass-hair\)/.test(seg('.blk-plus'))
  && !/#[0-9A-Fa-f]{6}/.test(seg('.blk-plus')),
  decl(seg('.blk-plus'), 'background') || '(没写)')
ok('容器仍发那套 --cp-*（图形吃 --cp-cam-ink；发在 .panel 上首屏拿不到＝透明）',
  /background:\s*var\(--cp-cam-ink\)/.test(seg('.blk-plus-glyph'))
  // 10-16 放宽成"容器那条 style 里含 skinPanel"：`--kb` 必须拼在 skinPanel **前面**
  // （skinPanel 末尾没分号，拼在后面会把 --kb 吞成上一条变量的值），所以不再钉字面量顺序。
  && /class="container[^"]*"\s+style="[^"]*\{\{skinPanel\}\}[^"]*"/.test(wxml)
  && !/class="panel[^"]*"[^>]*style="\{\{skinPanel\}\}"/.test(wxml))
/* 10-13 D19 甲：首屏圆内那枚 ➕ 单独加粗到 2.4。这里钉的是**选择器的形状**，不只是"有个 2.4"——
   markup 是 `class="blk-plus-glyph glyph-plus"`，一枚元素两个类，写成裸 `.blk-plus-glyph` 就是
   1 类 vs 1 类、纯靠源码顺序赢（今天赢着，谁挪一下那两段就静默退回 1.6，屏上看不出来）。
   两行都必须在：iOS 的 WKWebView 只认 `-webkit-mask-image`。 */
ok('首屏那枚 ➕ 的 2.4 挂在 `.blk-plus .blk-plus-glyph`（两枚类，不靠源码顺序）且标准＋-webkit- 成对',
  (() => {
    const m = /(?:^|\n)\.blk-plus \.blk-plus-glyph\s*\{([^}]*)\}/.exec(wxssRaw)
    return !!m && (m[1].match(/stroke-width='2\.4'/g) || []).length === 2
      && /-webkit-mask-image:/.test(m[1]) && /(?<!-webkit-)mask-image:/.test(m[1])
  })(),
  (/(?:^|\n)\.blk-plus \.blk-plus-glyph\s*\{/.test(wxssRaw) ? '两行不齐' : '没有那条两枚类的规则'))
/* 面板顶这一档 10-14 又换了一次口径。三版账：
   ① 效果图那一版：两态同一个顶＝组顶往上 107（框外那一行的高）；
   ② 10-13 站长「深色面板调下…内框与上面外框的距离，要与下方的 tab 面板距离一样」⇒
      收起态改成"上下两口留空相等"（24），展开态另钉一根（152＋107＋490）；
   ③ 10-14 站长「第二屏，高度不准，要和第一屏一致」＋「back 抬到暗面板上面」⇒
      框外那一行只剩「返回」并且整枚抬到墨面之上，②里为那 107 预留的死墨没有对象了
      ⇒ 两根并成一根：顶＝内框的顶往上那口呼吸，而内框两屏同高、同一条底线。
   数全部现读：组顶那条 calc、面板那条 calc、录入条的 bottom、面板两档的高、底栏的高＋bottom。 */
const declsOf = (src, prop) => (src.match(new RegExp(`${prop}:\\s*([^;]+)`, 'g')) || [])
const topOf = (sel) => declsOf(seg(sel), 'top').join(' | ')
const numIn = (src, re) => Number((re.exec(src) || [0, 0])[1])
const BREATHE = numIn(seg2(tabWxss, '.tab-bar'), /height:\s*(\d+)rpx/)
  + numIn(seg2(tabWxss, '.tab-bar'), /bottom:\s*(\d+)rpx/)      // 底栏那一格占掉的高＋离底
const ENTRY_B = num(seg('.container.entry-dock .entry-wrap'), 'bottom')
const OPEN_H = num(seg('.panel-open'), 'height')
const GROUP_OFF = numIn(topOf('.home-blk'), /calc\(100vh - (\d+)rpx\)/)
const INK_OFF = numIn(topOf('.stage-panel'), /calc\(100vh - (\d+)rpx\)/)
ok('收起态：组顶与录入条同一条底线，而面板顶到组顶的留空＝组底到顶栏那一口（上下两口同值）', (() => {
  const below = GROUP_OFF - PERSON_H - BREATHE          // 组底离底栏顶那一口：524 − 372 − 128 = 24
  return GROUP_OFF > 0 && INK_OFF > 0 && GROUP_OFF - PERSON_H === ENTRY_B
    && below > 0 && INK_OFF - GROUP_OFF === below
})(), `组顶 calc(100vh − ${GROUP_OFF})／内框 ${PERSON_H}／墨顶 calc(100vh − ${INK_OFF})／底栏占 ${BREATHE}`)
/* 第二屏不再另钉一根：`.container.entry-dock .stage-panel` 那条 749 一回来，两屏就又分叉
   （1669 那台上量过：首屏 1083／第二屏 920，差 163rpx，点一下 ➕ 背景自己往上跑一趟）。
   展开那一档另给一条 `.dock-open`，但它不是"第二屏那根"——它跟的是**这一档卡片自己的顶**，
   收起↔展开之间这一层与那张卡一起长，两屏之间这一层一动不动。 */
ok('第二屏不再另钉一根顶（`.entry-dock .stage-panel` 一条不剩＝两屏同一根线）',
  !/\.entry-dock\s+\.stage-panel/.test(wxss), topOf('.stage-panel'))
const OUT_H = num(seg('.out'), 'height')
const bandOff = numIn(declsOf(seg('.container.dock-open .stage-panel'), 'top').join(' | '), /calc\(100vh - (\d+)rpx\)/)
ok('展开那一档：这一层的顶＝展开卡片的顶往上同一口（卡片穿出墨面＝白给的那一段）',
  ENTRY_B > 0 && OPEN_H >= PANEL_H && bandOff === ENTRY_B + OPEN_H + (INK_OFF - GROUP_OFF),
  `顶 calc(100vh − ${bandOff}) vs ${ENTRY_B}＋${OPEN_H}＋${INK_OFF - GROUP_OFF}=${ENTRY_B + OPEN_H + (INK_OFF - GROUP_OFF)}`)
// 那一行现在只剩「返回」一枚，它坐在墨面之上靠的是 `.out` 自己那档 margin-bottom：
// 行底的"离底距离"＝ 录入条离底 ＋ 卡片高 ＋ 这一档；墨顶＝录入条离底 ＋ 卡片高 ＋ 那口呼吸。
// 前者大于后者 ⇒ 整枚在墨面之上。两档都从 CSS 现读，改哪一头都红（收起、展开各算一次）。
const OUT_MB = num(seg('.out'), 'margin-bottom')
ok('框外那一行整枚在墨顶之上（收起、展开两档都算一次）', (() => {
  const shut = ENTRY_B + PANEL_H + OUT_MB      // 行底离屏底：152＋372＋36 ＝ 560
  const open = ENTRY_B + OPEN_H + OUT_MB       // 展开那一档：152＋490＋36 ＝ 678
  return OUT_H > 0 && shut > INK_OFF && open > bandOff
})(), `行底离屏底 收起 ${ENTRY_B + PANEL_H + OUT_MB} vs 墨顶 ${INK_OFF}／展开 ${ENTRY_B + OPEN_H + OUT_MB} vs ${bandOff}`)
ok('这一层自己身上不挂动态类（它跟着卡片长，靠的是容器那一条 `.dock-open`）',
  !/stage-panel-open/.test(wxss + wxml) && /class="stage-panel"/.test(wxml)
  && /class="container[\s\S]*?\{\{panelOpen \? 'dock-open' : ''\}\}/.test(wxml),
  (wxml.match(/class="stage-panel[^"]*"/) || ['(没找到)'])[0])

/* 面板那几段皮的**分工**（他 10-13「新增面板为什么看不到渐变毛玻璃」追出来的）：
   本体必须透明。实心 .95 一旦写回本体，就与压在它上面的 `::before` 相乘
   ⇒ band 顶透出 1−(1−.95)(1−.16)＝4.2%、band 底 0.30%，整块 96% 实心，
   "上部渐变半透明毛玻璃"画了等于没画，而且**静态几何全绿、截图也看不出差别**（它就是那一片墨）。
   ⚠ 10-14 那一刀改了分工的形状：原来是 `::before`（高 240rpx 的 .16→.94）＋ `::after`（240rpx 以下铺 .95）
   两枚层并排，交界正落在面板正中 ⇒ 那一行少铺一点，透出后面的糊面，读成一条亮线（他：
   「还有黑色面板中间多了条线，其他色都没有，检查去掉」；实测墨档整幅亮占比 0.47、彩色四档 ≤0.10，
   把 `::after` 的 top 从 240rpx 挪到 200rpx，那条线跟着挪到 y1248）。现在**一层画完**：
   一条渐变里 .16→.94→.95，收口位置是百分比停点（240/面板高），不再有两枚层的边。
   所以底下这几条钉的是"只有一枚层、且它铺满"，不再是"两枚层的高与 top 相等"。 */
const sPanel = seg('.stage-panel')
const sPanelBand = seg('.stage-panel::before')
const sPanelBody = seg('.stage-panel::after')
ok('深色面板本体透明（色只能归那一枚铺满的层；写回本体＝与它相乘，band 透出不到 4.2%）',
  /^(transparent|none)$/i.test(decl(sPanel, 'background')),
  `本体 background=${decl(sPanel, 'background') || '(没写)'}`)
const FACE_CSS = val(sPanelBand, 'background')
ok('面板那一整面是一条 .16→.94→.95 的渐变（同色只走透明度；10-13 两刀把顶档从 .55 一路收到 .16＝"透明度多一点，现在太暗了"）',
  /rgba\(35,\s*37,\s*44,\s*0?\.16\)/.test(FACE_CSS) && /rgba\(35,\s*37,\s*44,\s*0?\.94\)/.test(FACE_CSS)
  && /rgba\(35,\s*37,\s*44,\s*0?\.95\)/.test(FACE_CSS),
  FACE_CSS || '(没写)')
ok('只许一枚层铺满整面（top:0＋bottom:0、不写 height；再并第二枚层＝中间那条亮线长回来）',
  /top:\s*0\s*;/.test(sPanelBand) && /bottom:\s*0\b/.test(sPanelBand) && !/height:/.test(sPanelBand)
  && sPanelBody === '',
  `::before top=${(decl(sPanelBand, 'top') || '(没写)')}／bottom=${decl(sPanelBand, 'bottom') || '(没写)'}／height=${decl(sPanelBand, 'height') || '没写'}；::after 段长 ${sPanelBody.length}`)
ok('糊挂在面板本体上（本体透明又不挂 blur ⇒ 那一段就是一张洞，什么都不糊）',
  /backdrop-filter:\s*blur/.test(sPanel) && /-webkit-backdrop-filter:\s*blur/.test(sPanel),
  decl(sPanel, 'backdrop-filter') || '(没写)')

/* ---------- 5. 两个计数来自接口 ---------- */
/* 原来这一条只挡效果图上那两个旧占位数（128／46）。B 方案稿上写的是「笔记:16 卡片:13」，
   那两个数一样可能被抄进模板——所以改成挡"这一格里是个写死的数字"，不枚举哪两个数。
   数从 markup 现数：两枚 .blk-num，一枚不是 mustache 就是假数常驻。 */
ok('两枚数字那一格只能是 mustache，不许是写死的数字（稿上那两枚一旦落进 wxml 就是永远显示假数）',
  (wxml.match(/class="blk-num">[^<{]*\d/g) || []).length === 0
  && (wxml.match(/class="blk-num">\{\{/g) || []).length === 2
  && !/>\{\{?(128|46|16|13)\}?\}/.test(wxml))
/* 10-18 站长「把首屏左下角的『卡片』和上面的『数量』，改为图片和数量」⇒ 右边那一枚从
   "卡片几张"（`getMyCards().cards.length`）换成"配图几张"（`storage-quota` 的 `user_count`，
   服务端按 not_failed 数）。下面三条跟着改口，另补一条钉"不许在客户端数第二遍"。 */
ok('两枚各自绑自己的位（noteCount／imageCount），且都从接口来',
  /class="blk-num">\{\{noteCount\}\}<\/text>/.test(wxml)
  && /class="blk-num">\{\{imageCount\}\}<\/text>/.test(wxml)
  && /api\.getQuota\(\)/.test(jsOnly) && /api\.getStorageQuota\(\)/.test(jsOnly))
ok('图片那一格的数只有服务端那一个出处（不许在客户端拿卡片清单或别的数组现数一遍）',
  /imageCount: typeof s\.user_count === 'number'/.test(jsOnly)
  && !/imageCount: Array\.isArray/.test(jsOnly)
  && !/api\.getMyCards\(\)/.test(jsOnly))
ok('两个口各自独立：任一拉不到不许把另一格和这一屏一起拖挂（各包各的 try）',
  (jsOnly.match(/try \{[\s\S]*?getQuota[\s\S]*?\} catch/g) || []).length === 1
  && (jsOnly.match(/try \{[\s\S]*?getStorageQuota[\s\S]*?\} catch/g) || []).length === 1)
ok('读不到画 0，不画杠也不留空（沿用笔记页那一列 10-01 定的口径）',
  /noteCount: 0/.test(js) && /imageCount: 0/.test(js))
ok('每次进页重读这两个数（出完图回来该跟着涨）',
  /this\.loadEntryStats\(\)/.test(js.split('async onShow')[1].split('hintFor(value)')[0]))

/* ---------- 6. 三块的落点 ---------- */
ok('左块点下去仍是 openBar 那一档（拍照），没有另起一套开门逻辑',
  /openBar\(\)\s*\{[\s\S]{0,200}this\.open\('photo'\)/.test(js)
  && /class="blk-person"[^>]*catchtap="openBar"/.test(wxml))
/* 10-17 列表合一：首屏那两格原来一枚切第一枚 tab、一枚切第二枚（靠一个一次性标记），
   合一之后 index 只剩一屏 ⇒ 三寸旧口径一起改。这两条钉的是**当下**的规矩：
   ① 两格都还切得动（入口没撤，撤的只是"落到哪一枚"）；
   ② 那枚标记全站不许再出现——留着就是给一个不存在的状态传话（旧键比新键更危险：
      它会让人以为还有第二枚可落）。 */
ok('首屏那两格都还是 switchTab 到笔记列表（合一之后两格同一个落点，入口一枚没撤）',
  /goNotes\(\)[\s\S]{0,160}switchTab\(\{ url: '\/pages\/index\/index' \}/.test(js)
  && /goImages\(\)[\s\S]{0,160}switchTab\(\{ url: '\/pages\/index\/index' \}/.test(js))
ok('那一枚一次性标记全站清零（写它的、读它的、清它的都不许在；注释里留来历不算）',
  !/ixOpenCardsTab/.test(jsOnly)
  && !/ixOpenCardsTab/.test(ixJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')))
ok('index 那头不再有"视图态"这一说（keepView／openCardsTab／view 三样在代码里都不许在）',
  (() => {
    const c = ixJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    return !/keepView/.test(c) && !/openCardsTab/.test(c) && !/\bview:\s*['"]/.test(c)
  })())

/* ---------- 7. 人物与它的剪影（10-10 深夜换的切换方式） ----------
   他这一轮的原话：「两个人切换体验不太好，改为左右有人点击右侧人像切换，例如女人在前，
   男人就在右侧，用剪影淡灰缩小在右下，高度约为女的一半，在女的后面。如果点击男的，
   男的就切换在左边，正常高度位置，女的就缩到右边，与男的处理一致。」
   再加上「首页人物延续到笔记列表和卡片列表，放在框外面的左上角，首页是男的那里就是男的」。
   ★10-11 这一句被他自己收回：「左上角的人，透明底侵入主图，列表左上角的人都去掉，维持只有首页有」
   （R8）。所以这一组现在只钉一件事：① 首页那一位的切换画法与落点；② 列表页那一位不许回来。
   "三处同一个他"那份唯一性随之作废——只剩一处，无从对撞。 */
const intOf = (s, prop) => parseInt(new RegExp(`${prop}:\\s*(-?\\d+)`).exec(s)?.[1] ?? '', 10)
const sFigAlt = seg('.blk-fig-alt')
const sAltHit = seg('.blk-alt-hit')
const personSeg = /class="blk-person"[\s\S]*?catchtap="openBar"/.test(wxml)
ok('没把原生双击当能力用（小程序没有 dblclick，写了就是静默不响应）',
  !/binddblclick|catchdblclick|onDoubleTap/.test(wxml + js))
// 反向钉他那句"体验不太好"打回的东西：整套自己数两下的机器一行都不许留。
// 留着不报错、只是每一次开门先被定时器延住——正是他这次要撤掉的手感。
const dblGone = ['DBL_TAP_MS', 'onTapPerson', 'togglePerson', '_tapTimer', '_cancelPersonTap']
  .filter((k) => (wxml + wxssRaw + js).includes(k))
ok('双击那套机器整条撤净（常量、两个方法、定时器、收尾那一趟都不许留残）',
  dblGone.length === 0, dblGone.join(','))
ok('左块那一点没有任何延迟（开门不等第二下）',
  personSeg && !/setTimeout/.test((/openBar\(\)\s*\{([\s\S]*?)\n  \}/.exec(js)?.[1] || '')))
ok('前后两张各绑自己的位：主人物吃 personSrc，剪影吃 personAltSrc（写反＝点剪影换到的是它自己）',
  /class="blk-fig" src="\{\{personSrc\}\}"/.test(wxml)
  && /class="blk-fig-alt" src="\{\{personAltSrc\}\}"/.test(wxml))
ok('剪影在主人物**后面**（z-index 比它小），且落在右下（right/bottom 顶到窗边）',
  intOf(sFigAlt, 'z-index') < intOf(sFig, 'z-index')
  && /right:\s*0/.test(sFigAlt) && /bottom:\s*0/.test(sFigAlt),
  `剪影 ${intOf(sFigAlt, 'z-index')} vs 主人物 ${intOf(sFig, 'z-index')}`)
ok('剪影是"淡灰剪影"不是"另一张小图"：灰度＋半透明两条都在',
  /grayscale\(\s*1/.test(sFigAlt) && /opacity:\s*\.[0-9]/.test(sFigAlt),
  sFigAlt.replace(/\s+/g, ' ').trim())
/* 这条的量法在 10-11 13:2x 跟着他改口换过一次。原来剪影**按宽定**（widthFix＋91），两张源件比例
   不同（女 0.8314／男 0.6897）→ 同一个 91 宽算出两档高（男 132／女 109.5），换到男孩那一态小人矮一截。
   他那句「要与之前右侧男孩高度一致」要的是**两态同高**，所以实现改成按高定（heightFix＋132），
   宽由各自比例倒算 ⇒ 判据不能再从 width 倒推高了。
   高差那两档现在各自是 0.499（女当主人）／0.414（男当主人）：下界从 .45 松到 .40 是因为他把"同高"
   钉成了绝对数，这一态的比值必然掉到"一半"以下——不是把它做矮了，是男那张本来就比女那张高 54。
   要再收小只能抬这一枚的高，那是他那句之外的另一个数，没他的话我不自己抬。 */
const figAR = (() => {
  const r = (f) => { const b = fs.readFileSync(P(f)); return b.readUInt32BE(16) / b.readUInt32BE(20) }
  return { girl: r('assets/ic-person.png'), boy: r('assets/ic-person-alt.png') }
})()
const altH = sizeOf('.blk-fig-alt', 'height')
const altW = (ar) => altH * ar
const mainW = sizeOf('.blk-fig', 'width')
const mainH = (ar) => mainW / ar
ok('剪影改成按高定：wxml 走 heightFix、wxss 只给高不给宽（还按宽给＝换人矮一截，就是他打回的那个）',
  /class="blk-fig-alt"[^>]*mode="heightFix"/.test(wxml)
  && Number.isFinite(altH) && !/\bwidth:/.test(sFigAlt),
  `mode=${/class="blk-fig-alt"[^>]*mode="([a-zA-Z]+)"/.exec(wxml)?.[1]}，wxss 高 ${altH}，宽那行${/\bwidth:/.test(sFigAlt) ? '还在' : '已撤'}`)
for (const [tag, ar] of [['默认那态（女当主人物）', figAR.girl], ['换人后（男当主人物）', figAR.boy]]) {
  const ratio = altH / mainH(ar)
  ok(`${tag}：剪影屏上高仍在主人物的 0.40~0.55 档（"约一半"那一档，两态同高后男主人那一态必然掉到 .41）`,
    ratio >= 0.40 && ratio <= 0.55,
    `主人物 ${mainH(ar).toFixed(1)}、剪影 ${altH} → ${ratio.toFixed(3)}`)
}
// 点击为什么不在剪影那张图上：它压在主人物后面，重叠那一条被上面那张吞掉。
// 所以热区必须盖在**最上层**，而且要比两张里宽／高的那一张更大——少一挡就有一段点了没反应。
ok('点的是透明热区，不是那张图：热区 z-index 盖过前后两张',
  intOf(sAltHit, 'z-index') > intOf(sFig, 'z-index')
  && intOf(sAltHit, 'z-index') > intOf(sFigAlt, 'z-index'),
  `热区 ${intOf(sAltHit, 'z-index')}／主 ${intOf(sFig, 'z-index')}／剪影 ${intOf(sFigAlt, 'z-index')}`)
ok('热区盖得住两张里更宽的那一张，也盖得住高（按高定之后"更高"两态一样，"更宽"变成女那张）',
  sizeOf('.blk-alt-hit', 'width') >= Math.max(altW(figAR.girl), altW(figAR.boy))
  && sizeOf('.blk-alt-hit', 'height') >= altH,
  `热区 ${sizeOf('.blk-alt-hit', 'width')}×${sizeOf('.blk-alt-hit', 'height')} vs 剪影 宽 ${Math.max(altW(figAR.girl), altW(figAR.boy)).toFixed(1)}（男 ${altW(figAR.boy).toFixed(1)}／女 ${altW(figAR.girl).toFixed(1)}）×高 ${altH}`)
ok('热区用 catchtap（不是 bindtap）——冒泡到左块就顺手把面板打开了，换人变成"换人＋开门"',
  /class="blk-alt-hit"[^>]*catchtap="swapPerson"/.test(wxml)
  && !/class="blk-alt-hit"[^>]*[^-]bindtap=/.test(wxml))
ok('换人只换图，不动 active／草稿／忙态',
  (() => {
    const m = /swapPerson\(\)\s*\{([\s\S]*?)\n  \}/.exec(jsOnly)
    return !!m && !/previewImages|active:|busy|linkBody|writeBody/.test(m[1])
  })(), 'swapPerson 里出现了不该有的那几位')
/* 一个人三处画（第一屏、笔记列表框外、卡片列表框外），所以键名与两张路径只许住在
   utils/person.js 里。抄第二份的下场是"首页是男的、列表页还是女的"——他这条要的就是跟着走。 */
const personJs = fs.readFileSync(P('utils/person.js'), 'utf8')
const hardSrc = [P('pages/create/create.js'), P('pages/index/index.js')]
  .filter((f) => /ic-person|homePerson/.test(fs.readFileSync(f, 'utf8')))
  .map((f) => path.relative(ROOT, f))
/* 那两枚计数图标（ic-stat-notes／ic-stat-cards）随右两枚计数块一起出了包：
   留着就是包里 18KB 没人读的字节。它们**曾经**是"压平到实心"的四张里的两张，
   所以这一条同时钉两头——该在的两张在、该走的两张连引用都不许剩。 */
ok('人物那两张还在包里，两张计数图标连文件带引用一起撤净',
  fs.existsSync(P('assets/ic-person.png')) && fs.existsSync(P('assets/ic-person-alt.png'))
  && !fs.existsSync(P('assets/ic-stat-notes.png')) && !fs.existsSync(P('assets/ic-stat-cards.png'))
  && sweep(P('')).filter((f) => /ic-stat-/.test(fs.readFileSync(f, 'utf8'))).length === 0
  && /girl: '\/assets\/ic-person\.png', boy: '\/assets\/ic-person-alt\.png'/.test(personJs)
  && hardSrc.length === 0,
  hardSrc.join(','))
// ★10-11 改钉：上面那两条"两页都取／列表页也吃同一枚"的前提被他这句撤掉了——
//   「左上角的人，透明底侵入主图，列表左上角的人都去掉，维持只有首页有」（需求清单 R8）。
//   所以列表页现在**一个字都不该沾**这三位；首页（pages/create）那两位与"点小人换大人"照旧。
//   反向钉留着：只要有人把那位再请回列表页，这两条立刻红。
//   ⚠ 比的是**代码**，不是整份文件：index.js 顶上那段注释就写着"这一页的 require 一并撤"，
//   拿含注释的原文去比 `utils/person.js` 会当场假红（上面那行留下的记录本身就是这句话）。
const ixCode = ixJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
ok('取数只剩首页一屏（列表页不再 require person.js，也不 spread figure()）',
  /require\('\.\.\/\.\.\/utils\/person\.js'\)/.test(js) && /\.\.\.person\.figure\(\)/.test(js)
  && !/utils\/person\.js/.test(ixCode) && !/person\.figure\(\)/.test(ixCode),
  [/\.\.\.person\.figure\(\)/.test(ixCode) ? '列表页又 spread 了 figure()' : ''].join(','))
const ixWxml = fs.readFileSync(P('pages/index/index.wxml'), 'utf8')
const ixWxss = fs.readFileSync(P('pages/index/index.wxss'), 'utf8')
ok('列表页框外那一位已经去掉：markup 与样式表里都不留 .ix-person',
  !/ix-person/.test(ixWxml.replace(/<!--[\s\S]*?-->/g, ''))
  && !/^\.ix-person\s*[,{]/m.test(ixWxss.replace(/\/\*[\s\S]*?\*\//g, '')),
  '列表页还有人＝撞 R8')
ok('列表页 data 里不带 personSrc（人撤了，键留着就是下一次把它接回去的接头）',
  !/personSrc/.test(ixWxml) && !/personSrc/.test(ixCode))
ok('选择写本机、下次进页沿用（读写都走 person.js 那一个键）',
  /wx\.setStorageSync\(KEY/.test(personJs) && /wx\.getStorageSync\(KEY\)/.test(personJs))

/* ---------- 8. 按下有反馈（他要的"轻微放大"） ----------
   这一组不是走形式：10-10 落码第一版写的是 hover-class="blk-press"，而样式表里那两条叫
   .blk-person-press / .blk-stat-press，两个名字对不上——按下什么都不放大，界面照样能用、
   截图也看不出来（不按下就永远不出现那一帧）。所以两头都要钉：
   ① markup 里出现的每一枚 hover-class，样式表里必须有以它为选择器起头的一条规则；
   ② 反过来，样式表里 .blk-*-press 那几条也必须有 markup 指过来（孤儿规则＝改了个没人挂的类名）。 */
const hoverNames = [...new Set((wxml.match(/hover-class="([^"]+)"/g) || [])
  .map((x) => /hover-class="([^"]+)"/.exec(x)[1])
  .filter((x) => /^blk-/.test(x)))]
ok('三样共用一套按下态，且名字与 markup 两头对得上（枚数从 markup 现数）',
  hoverNames.length === 3 && (wxml.match(/hover-class="blk-[a-z-]+"/g) || []).length === 4,
  hoverNames.join(','))
ok('每一枚 hover-class 在样式表里真有一条规则接着（名字对不上＝静默不放大）',
  hoverNames.every((n) => new RegExp(`(?:^|\\n)\\.${n}[\\s,{][^}]*\\{[^}]*\\}`).test(wxss)),
  hoverNames.filter((n) => !new RegExp(`(?:^|\\n)\\.${n}[\\s,{]`).test(wxss)).join(','))
ok('样式表里没有"挂了但没人指"的 .blk-*-press（孤儿规则）',
  (wxss.match(/^\.blk-[a-z-]*press(?=[\s,{])/gm) || [])
    .every((s) => hoverNames.includes(s.slice(1).replace(/\s+$/, ''))),
  (wxss.match(/^\.blk-[a-z-]*press/gm) || []).join(','))
/* 按下态那一帧本身尺子量不到（automator 的 tap 不派发 touchstart／touchend，见规格 §8 那条），
   这里只能钉"规则在、且改的是可控的那一档"。原来钉的是"放大只给图标、不给整块"——
   图标跟着右两枚一起没了，剩下三枚都没有子图标可放大：
   卡仍是整块 scale(1.02)（那一条他没动过），两枚计数格与 ➕ 用透明度退一档。
   ⚠ 计数格不许学卡那样整块放大：它在那 197 的墨面里、外面还套着 `overflow:hidden` 的窗，
   放大就会被裁出一截，那正是"按下反而像坏了"。 */
ok('按下态三种载体各归其位：整块放大只给卡，计数格与 ➕ 走透明度',
  /\.blk-person-press\s*\{[^}]*transform:\s*scale/.test(wxss)
  && /\.blk-cell-press\s*\{[^}]*opacity/.test(wxss) && !/\.blk-cell-press\s*\{[^}]*transform/.test(wxss)
  && /\.blk-plus-press\s*\{[^}]*opacity/.test(wxss)
  && !/blk-stat-press|\.blk-ic/.test(wxss + wxml),
  '旧那两枚计数块的按下态与图标缩放规则')

/* ---------- 9. 组顶那条 calc 的常数与两头同源 ---------- */
const sBlk = seg('.home-blk')
// 2.2 B 方案：整组只剩那一行（Tips 搬进右列里、不再单独占一行），所以整组高＝左块高。
// 原来这一式子是 `Tips 74 ＋ margin 12 ＋ 左块 308 = 394`，那三样现在都不在组的"纵向累加"里了。
const GROUP_H = PERSON_H
// 底栏占的那一段 = 它自己那条 height ＋ 它离底那条 bottom，两个都从底栏那一份样式表现读。
const sTab = seg2(tabWxss, '.tab-bar')
const TAB_H = num(sTab, 'height') + num(sTab, 'bottom')
function seg2(src, sel) {
  const m = new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(src)
  return m ? m[1] : ''
}
ok('整组高就是那一行（Tips 已搬进列里，不再单独占一行）', GROUP_H === PERSON_H, `${GROUP_H}`)
ok('底栏占的那一段从底栏自己那一份现读（128 = 108 高 ＋ 20 离底）', TAB_H === 128, `${TAB_H}`)
ok('组顶那条 calc 里的数是推出来的、不是拍的：整组 ＋ 底栏 ＋ 最少留白 24',
  /top:\s*calc\(100vh - (\d+)rpx\)/.test(sBlk)
  && parseInt(/top:\s*calc\(100vh - (\d+)rpx\)/.exec(sBlk)[1], 10) === GROUP_H + TAB_H + 24,
  `整组 ${GROUP_H} ＋ 底栏 ${TAB_H} ＋ 留白 24 = ${GROUP_H + TAB_H + 24}`)
ok('66.3%／min() 那一族整族退场（贴底定的东西撞不到底栏，既不用夹刀、也不用老安卓退路）',
  !/66\.3%|min\(/.test(sBlk), sBlk.replace(/\s+/g, ' ').slice(0, 80))
/* 面板那一层是 `position:fixed; bottom:0` 的通栏一整片，它往上盖的那一段正好罩住底栏那枚胶囊。
   底栏是**自定义组件**，automator 的 `page.$` 够不到它的节点（10-01 那轮就记过：只能截图采像素），
   所以"点得到点不到"这一条真跑量不出来，只能在这里钉层号：面板那枚 z-index 必须**低于**底栏那一枚。
   两个数都从各自那一份样式表现读，不抄——底栏将来改层号，这一条跟着走。 */
const Z_PANEL = (/z-index:\s*(-?\d+)/.exec(seg('.stage-panel')) || [])[1]
const Z_TAB = (/z-index:\s*(-?\d+)/.exec(sTab) || [])[1]
ok('深色面板那层的层号低于底栏（面板通栏贴到屏底，压过 999 就是把"回列表／去我的"那两格点了没反应）',
  Z_PANEL !== undefined && Z_TAB !== undefined && Number(Z_PANEL) < Number(Z_TAB),
  `面板 ${Z_PANEL}／底栏 ${Z_TAB}`)

/* ---------- 10. 字典 ---------- */
/* 「记下来」这一句从屏上撤了（他 10-12「左下的记下来这部部分，去掉」），但**键不许删**：
   左块与圆形 ➕ 的 aria-label 还吃它（读屏念的那句就是屏上以前写的那句）。
   所以这一条改钉两头：键还在、且两枚入口都还指它。 */
ok('barIdle 那一键中英都在（屏上不写了，读屏还念它）',
  zh.barIdle === '记下来' && en.barIdle === 'Jot it down')
ok('屏面上不再出现那一整条白皮（`.blk-jot` 的 markup 与样式都没有，含它那句「照片 · 链接 · 文字」）',
  !/blk-jot/.test(wxml + wxss)
  && !/\{\{t\.modePhoto\}\} · \{\{t\.modeUrl\}\} · \{\{t\.modeWrite\}\}/.test(wxml))
/* 10-18 那一句改口之后，右边那一枚的键叫 statImages（值是「图片」／"Images"）。
   旧键 statCards 整把尺子扫全站确认没有第二个消费者，所以是**改名**不是加键——
   留一个没人读的键，下次谁搜「卡片」会读到它并以为那一格还在数卡片。 */
ok('两枚计数的标签成对（statNotes／statImages），且不借名片那一格的 slotCard',
  !!zh.statNotes && !!zh.statImages && !!en.statNotes && !!en.statImages
  && zh.statImages === '图片' && !/statCards/.test(JSON.stringify([zh, en]))
  && /t\.statNotes/.test(wxml) && /t\.statImages/.test(wxml) && !/t\.slotCard/.test(wxml))
// 这一组里每一枚"整块可点"的东西都得有 role＋aria-label，词**全部复用屏上已有的字典键**，
// 不另编一句。枚数从 markup 现数：卡、两枚计数格、剪影热区、圆形 ➕ ＝ 5 枚，一枚都不能漏
// （漏的那一枚读屏只念数字或不念，屏上看着没毛病）。
const ariaTags = (wxml.match(/<view\s+class="(?:blk-person|blk-cell|blk-plus|blk-alt-hit)"/g) || [])
const ariaHeads = (wxml.match(/<view\s+class="(?:blk-person|blk-cell|blk-plus|blk-alt-hit)"[^>]*>/g) || [])
ok('这一组每一枚可点的都挂了 role="button" + aria-label（5 枚，一枚不落）',
  ariaTags.length === 5 && ariaHeads.length === 5
  && ariaHeads.every((t) => /role="button"/.test(t) && /aria-label="\{\{/.test(t))
  && /class="blk-person" role="button" aria-label="\{\{t\.barIdle\}\}"/.test(wxml)
  && /class="blk-plus" role="button" aria-label="\{\{t\.barIdle\}\}"/.test(wxml),
  `${ariaHeads.length} 枚／缺 role 或 aria 的：` + ariaHeads.filter((t) => !/role="button"/.test(t)).length)
ok('两枚计数的 aria-label 是「数字＋那一格的名字」拼出来的，不借屏外新词',
  /aria-label="\{\{noteCount\}\}\{\{t\.statNotes\}\}"/.test(wxml)
  && /aria-label="\{\{imageCount\}\}\{\{t\.statImages\}\}"/.test(wxml))
ok('中英键数相等', Object.keys(zh).length === Object.keys(en).length,
  `${Object.keys(zh).length} vs ${Object.keys(en).length}`)
// 旧胶囊那句撤干净没有，要扫整个 miniprogram 目录（不止这一页：别处也可能还写着那句）。
// 早先这里写成 fs.readFileSync(<目录>)，那是 EISDIR——抛出去之前整把尺子一条都不落地。
// 这一把是 `function` 声明（不是 const 箭头）：§8 那一条"两张计数图标连引用都不许剩"要先用它，
// 改成 const 就成了"用到它时还没定义"——那种红看着像代码错，其实是判据自己的顺序错。
function sweep(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const f = path.join(dir, name)
    if (fs.statSync(f).isDirectory()) { if (name !== 'node_modules') sweep(f, out); continue }
    if (/\.(wxml|wxss|js|json)$/.test(name)) out.push(f)
  }
  return out
}
const staleBar = sweep(path.join(ROOT, 'miniprogram'))
  .filter((f) => fs.readFileSync(f, 'utf8').includes('动动手指'))
  .map((f) => path.relative(ROOT, f))
ok('旧胶囊那句「动动手指」整个小程序里一处不留（键值改了要看还有没有别处在写它）',
  staleBar.length === 0, staleBar.join(','))
ok('旧胶囊那套类名也没留残（.bar／.bar-lead／.bar-label 的样式与 markup 一起撤走）',
  !/(?:^|\n)\.bar[-\w]*\s*\{/.test(wxss) && !/class="bar["\s]/.test(wxml))

/* ---------- 11. 类名不许和 app.wxss 撞（这一轮真翻过的车，最贵的一条） ----------
   10-10 落码第一版把收起态那一组命名为 `.blk`，而 app.wxss 里 `.blk` 早就存在——笔记列表那枚
   "分类色方块"：176 见方、18 内边距、overflow:hidden、flex 纵排。全局样式表同名就同吃，
   页面这一份只写了自己那几条，剩下的全被全局那一份补上，结果整组被裁成一块 176 的小方盒、
   右边两枚宽度算成 0。静态那几把判据当时**一条都没红**（它们量的是页面样式表里的数，
   而那几页样式表确实一个字没错），只有模拟器截图看得见。
   所以这一条不量几何，只堵源头：这一屏用的每一个类名，要么全局没定义，要么在白名单里。
   白名单那两枚是**故意**共用的：`.container` 就是全局那个页面容器，`.card` 走的是全局卡面
   （见 §8.191 那条"大卡三种画法"的账）。新增同名要先问一句是不是又要撞。
   ⚠ 这里的 `appWxss` 与上面取文件那一段是同一份（§2 读 `--fs-micro` 就用它）。 */
const SHARED_OK = ['container', 'card']
const usedClasses = new Set()
// class 里除了裸词，还有 `{{active ? 'entry-dock' : ''}}` 这种三元分支——原来只按空格切整串，
// 引号里那两枚永远进不了集合，撞了全局也量不到。现在把 mustache 里的引号字面量也收进来。
// ⚠ 剩下两种写法静态确实量不到：`{{themeClass}}` 这种**整枚来自数据**、`class="glyph-{{sldIcon}}"`
// 这种**拼接**。这两类拼出来的名字要看运行时，只能靠真跑尺子在模拟器里读元素的实际 class。
// 这一条堵的是"整枚类名写在 markup 里（含三元分支）"的情况。
const collect = (s) => {
  // 只取 mustache 里**带引号的那几枚**（三元分支的两个落点）。整串去掉花括号会把条件名
  // （active／panelOpen 这些数据键）也当成类名收进来，那是另一回事，不是这一条要管的。
  const lit = s.replace(/\{\{([^}]*)\}\}/g,
    (_, inner) => [...inner.matchAll(/'([^']*)'/g)].map((q) => q[1]).join(' '))
  for (const raw of lit.split(/[\s,]+/)) if (/^[a-zA-Z][\w-]*$/.test(raw)) usedClasses.add(raw)
}
for (const m of wxml.matchAll(/class="([^"]+)"/g)) collect(m[1])
for (const m of wxml.matchAll(/hover-class="([^"]+)"/g)) collect(m[1])
// 「图片设置」那一族（原名「卡片上的信息」）10-18 起也在这一屏——首页那枚「换背景」拉起同一层。
// 那一族的样式**本来就在 app.wxss**、三页共用一份（`验-名片弹窗两页同源` 钉的是"页面 wxss 里
// 一条 .ci-* 都不许有"），所以它"和全局同名"是设计，不是这一条要堵的事故。
// 它自己那两枚状态词（role／ghost／pri）只在 .ci-* 那一族里出现，一并算进去。
const CI_FAMILY = /^ci-/
const CI_STATES = ['role', 'ghost', 'pri']
const inCiFamily = (c) => CI_FAMILY.test(c) || CI_STATES.includes(c)
const collide = [...usedClasses].filter((c) => !SHARED_OK.includes(c) && !inCiFamily(c)
  && new RegExp(`\\.${c}(?![\\w-])`).test(appWxss))
ok('这一屏用的类名没有一枚和 app.wxss 同名（撞上的话全局那一份会静默补进来；.ci-* 那一族除外，见上面）',
  collide.length === 0, collide.join(' '))
ok('豁免那条前缀不是空转：这一屏确实在用 .ci-* 那一族，且那三枚状态词也在用',
  [...usedClasses].some((c) => CI_FAMILY.test(c)) && CI_STATES.every((c) => usedClasses.has(c)),
  `${[...usedClasses].filter((c) => CI_FAMILY.test(c)).length} 枚 .ci-* 类名`)
ok('三元分支里那几枚也一起扫了（不是只扫了空格切出来的裸词）',
  ['entry-dock', 'has-bg', 'panel-open'].every((c) => usedClasses.has(c)),
  [...usedClasses].filter((c) => c.includes('-')).length + ' 枚带连字符的类名')
// 白名单本身也要钉死：里面躺着不起作用的条目，就等于"下次真撞进来的那枚也会被当成名单内的"。
ok('白名单那两枚确实都还在和全局同名（名单只收当下真的撞着的那两枚）',
  SHARED_OK.every((c) => usedClasses.has(c) && new RegExp(`\\.${c}(?![\\w-])`).test(appWxss)),
  SHARED_OK.filter((c) => !usedClasses.has(c) || !new RegExp(`\\.${c}(?![\\w-])`).test(appWxss)).join(','))
ok('三块那几段样式表自己也不许再出现裸 `.blk`（组名带前缀是这条决定的一部分）',
  !/(?:^|\n)\.blk\s*\{/.test(wxss) && !/(?:^|[\s"])class="blk"/.test(wxml))
ok('全局那枚 `.blk` 还在为笔记列表服务（这条不是"删掉全局"，是"这一屏别同名"）',
  /\.blk\s*\{[^}]*width:\s*var\(--blk\)/.test(appWxss))

/* ---------- 首屏那枚「推荐给好友」（站长 10-20 五句话，⑤ 把整块皮换了一次）----------
   ①「随手记下来英文的下方增加一个黄色醒目立体横条按钮，推荐好友使用，点击就是拉起微信小程序分享页面」
   ②「按钮太大了，要精致小巧，不能盖住人，按钮长度不要超过英文」
   ③「位置要在英文下放，首屏和笔记列表都要，相同的位置」
   ④「推荐好友使用的按钮，只放在首屏和拍照屏，不再放在列表页」＋「按钮整体80%透明度。
      字体压缩成"推荐好友"前后加小圆点」
   ⑤「推荐好友，改为推荐给好友，长度多一点，然后按钮位置再上移一点，字母与按钮空间太大了。
      按钮能否改为，黄色纸飞机 ICON，然后按钮和文字在底下，黑色半透明，字体变成白色」
      ＋当场纠回来的一句「纸飞机在文字左边，按钮高度维持之前高度。纸飞机要大一点。高度斜45度，
      有飞行的感觉」
   ⇒ ③ 挂到笔记列表的那一枚已被 ④ 收回；这一枚现在只住新建页的两态（第一屏＋展开那一屏＝他说的
     拍照屏）。④ 改了字面与透明度，⑤ 又改了字面（四字→五字）、落点（上移）、一整块皮
     （芥末黄立体渐变→黑半透明纱＋白字＋左侧一支斜 −45° 的黄纸飞机），高维持 ④ 那一档 44。
     ⚠ ⑤ 那句「按钮和文字在底下」我第一版读成竖排（飞机在上、字在下、高抬到 70），
     他当场打回 ⇒ 这一组判据跟着钉横排那一套；别拿旧稿读这一节。
   下面这一组钉的是这五句里能落成判据的每一格；凡被 ⑤ 作废的旧格（两颗点、受光面、底下实边、
   墨字压黄面）一律改成钉"旧形不许还在屏上"，不留着当假绿。
   皮住在 styles/rec-bar.wxss（一页两态共一份），落点 create.wxss 那一条 margin。
   "英文"＝那枚书法位图最下面一行 "Save what matters"。 */
const recWxss = fs.readFileSync(P('styles/rec-bar.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const blockOf = (src, sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(src)
  return m ? m[1] : ''
}
// 皮（共用那一份）＋ 落点（这一页那一条）拼起来看，才是这一枚按钮在首屏上的完整规则。
/* ⑧ 之后这一枚回到"一架飞机 ＋ 一行字"住在同一枚 `<button>` 里（没有壳）：
   飞机吃绝对定位（不占流、跨出胶囊上下沿），字面靠右内缩 12。
   皮仍然只有一份（rec-bar.wxss），落点仍然只在 create.wxss 那一条 margin（挂在按钮上）。 */
const recSeg = `${blockOf(recWxss, 'button.rec-bar')}\n${seg('button.rec-bar')}`
const ixWxss2 = fs.readFileSync(P('pages/index/index.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const recIdxTitle = wxml.indexOf('class="page-title"')
const recIdxBar = wxml.indexOf('class="rec-bar"')
const recIdxSwap = wxml.indexOf('class="home-swap"')
ok('黄条排在标题图之后、「调亮度｜换背景｜换心情」那一行之前（＝他指的"英文的下方"）',
  recIdxTitle > 0 && recIdxBar > recIdxTitle && recIdxSwap > recIdxBar,
  `模板里三个位置 ${recIdxTitle} / ${recIdxBar} / ${recIdxSwap}`)
const recBtn = /<button[^>]*class="rec-bar"[^>]*>[\s\S]*?<\/button>/.exec(wxml)
ok('这一枚本身就是 button[open-type=share]（拉起微信原生分享面板，不自己画一层）',
  !!recBtn && /open-type="share"/.test(recBtn[0]), recBtn && recBtn[0].slice(0, 60))
ok('文案从字典取，不在模板里写死一句', !!recBtn && /\{\{t\.recBarTitle\}\}/.test(recBtn[0]))
const recTx = /<text class="rec-tx">\{\{t\.recBarTitle\}\}<\/text>/.exec(wxml)
/* ⑦⑧ 指定的那一格（「胶囊加宽、飞机照旧上下出头」）：这一枚里是"飞机＋字"两枚、飞机在按钮里面。
   画序：飞机吃绝对定位，所以它**画在纱之上**；它压不压字由横向那两列的账管（见下面几何那一段），
   不由 DOM 顺序管——所以这里只钉"两枚都在 button 里、飞机在前"，反向钉一条"旧形不许还在"：
   ④ 那两颗小圆点随 ⑤ 撤了（**这一处是我自己撤的、他没点名**），点一旦留在模板里就变成"点—图—字—点"。 */
ok('模板＝按钮里"飞机 → 字"两枚（飞机不外挂、不另起一层壳），那两颗点已撤净',
  !!recBtn && !!recTx
  && /class="rec-plane"><\/view>\s*<text class="rec-tx">/.test(recBtn[0])
  && !/rec-dot/.test(wxml) && !/rec-slot/.test(wxml),
  recBtn && recBtn[0].replace(/\s+/g, ' ').slice(0, 130))
const { i18n: I18N } = require(P('utils/i18n.js'))
ok('zh 那一格逐字＝⑤ 那五个字「推荐给好友」（④ 压成四字、⑤ 又加回一个字），en 非空',
  I18N.zh.recBarTitle === '推荐给好友' && !!I18N.en.recBarTitle,
  `zh ${I18N.zh.recBarTitle}／en ${I18N.en.recBarTitle}`)
// 皮：四档必须真的从 createSkin 发下来。少发一档不是"颜色浅一点"，是那条属性整个没有值＝静默失效。
const recVars = ['--cp-rec', '--cp-rec-plate', '--cp-rec-ink', '--cp-rec-shadow']
const skinOut = palette.createSkin()
ok('createSkin() 四档 cp-rec 全发得出来（发不出来时 wxss 那几条 var 静默没有值）',
  recVars.every((v) => skinOut.includes(v + ':')), recVars.filter((v) => !skinOut.includes(v + ':')).join(','))
ok('旧形那两档（受光面 top／底下实边 edge）不再发、也没人偷偷吃（留着就是下一次往回挂的把手）',
  !skinOut.includes('--cp-rec-top:') && !skinOut.includes('--cp-rec-edge:')
  && !/--cp-rec-(top|edge)/.test(recSeg) && !/--cp-rec-(top|edge)/.test(recWxss),
  `这一页 ${recSeg.match(/--cp-rec-(?:top|edge)/g) || '无'}／共用那份 ${(recWxss.match(/--cp-rec-(?:top|edge)/g) || []).length} 处`)
ok('.rec-bar 那一份皮（连那枚纸飞机）四档全走 var，整份样式表一支 hex 都不写（饱和色只住在 palette）',
  recVars.every((v) => recWxss.includes(`var(${v})`)) && !/#[0-9a-fA-F]{3,8}/.test(recWxss),
  recVars.filter((v) => !recWxss.includes(`var(${v})`)).join(',') || `写了 hex：${(/#[0-9a-fA-F]{3,8}/.exec(recWxss) || ['(无)'])[0]}`)
const REC = palette.RECOMMEND_BAR
const isHex6 = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '')
/* ⑤「黑色半透明，字体变成白色」这一档不能只钉"色板里写的是白"——白字压不压得住要看**板铺在
   什么底上**，再算上整枚那一档 `opacity: .8`（④ 那句他没撤）。最坏的底是纯白（照片亮到爆），
   所以这里现算：板（rgba .8）over 纯白 → 再吃整枚 .8 → 拿这一个数与白字比。
   逐档试过才取 .8：板 @.6 白字只有 3.69（不过线），@.7 是 4.88、@.8 是 6.69。
   那支黄压同一块板走图形门槛 3.0（纸飞机是图形不是正文，项目里那条口径见 §5.1）。 */
const plateWorst = palette.mix(palette.mix('#000000', '#FFFFFF', REC.plateAlpha), '#FFFFFF', 0.8)
ok('白字压得住黑半透明板（最浅底＋整枚 80% 两层都算进去，≥4.5）',
  isHex6(REC.ink) && REC.ink.toUpperCase() === '#FFFFFF'
  && palette.crOf(REC.ink, plateWorst) >= 4.5,
  `字 ${REC.ink} 压 ${plateWorst}＝${palette.crOf(REC.ink, plateWorst).toFixed(2)}（板 alpha ${REC.plateAlpha}）`)
/* ⑧ 之后飞机回到纱**之上**（不再是躲在纱后面），所以这一枚有两笔各钉一头的账：
   · 白字压板（正文门槛 4.5）——它成立的前提是"黄与字横向不重叠"，那一格由几何那一段现算，
     一旦哪天字挪到黄底上，这一条的数就不再是屏上真正的数（所以那条不许撤）。
   · 黄压板（图形门槛 3.0，§5.1 那一条口径）：黄吃整枚 .8 之后与那块板比。 */
ok('那支黄压得住黑半透明板（图形门槛 3.0；它现在是画在纱之上的）',
  palette.crOf(palette.mix(REC.face, '#FFFFFF', 0.8), plateWorst) >= 3.0,
  `黄 ${REC.face}（吃整枚 .8 后 ${palette.mix(REC.face, '#FFFFFF', 0.8)}）压最浅底那块板 ${plateWorst}`
  + `＝${palette.crOf(palette.mix(REC.face, '#FFFFFF', 0.8), plateWorst).toFixed(2)}`)
/* ⚠ 这一笔账在这一夜跟着落点换过两次方向，别再照旧话读：
   ⑥ 那一版飞机整支在按钮上方 ⇒ 黄压在板外，"黄压板"那一格不存在，我改钉"白字压板＋板压在黄面上"；
   ⑦⑧ 这一版飞机回到纱之上、与字左右分列 ⇒ 黄压板（上一条 3.0）回来了，而"板压在黄面上"作废。
   仍要念一句实话：飞机出头那两截**飘到板外**，那一段对的是页面底——铺照片那态看照片，
   白底那一态对纯白只有 1.63（低于 §5.1 图形门槛 3.0）。这一格我没钉阈值：它是装饰图形，
   识别这一枚靠的是"推荐给好友"那五个字。要按 3.0 达标得给那支黄描一圈深边或换深色——他没提，我不做。 */
console.log(`  · 备忘（不是判据）：飞机飘到板外那一圈对纯白底 ${palette.crOf(REC.face, '#FFFFFF').toFixed(2)}，对纯黑底 ${palette.crOf(REC.face, '#000000').toFixed(2)}`)
ok('黄还是 TIP_DOT 那一支，屏上不起第二支黄', REC.face.toUpperCase() === palette.TIP_DOT.toUpperCase())
ok('按压反馈留着（:active 下沉），而"立体"那档底下 3rpx 实边已随黑半透明撤掉',
  /translateY\(/.test(blockOf(recWxss, 'button.rec-bar:active'))
  && !/0 \d+rpx 0 var\(--cp-rec/.test(recSeg),
  blockOf(recWxss, 'button.rec-bar:active'))
/* ⚠ 这一枚的选择器必须带 `button` 前缀（0,1,1），裸 `.rec-bar`（0,1,0）压不住微信给 button
   自带的那层 `.wx-btn` 默认值。10-20 第一版就是那么写的：高度、渐变、阴影、下边距全生效了，
   **只有 `width: 100%` 静默不生效**，模拟器屏上量到 184px 一枚居中小胶囊——他要的是横条。
   me.wxss 那枚 `.menu-item.share-row` 没露馅，因为它写的是两枚类（0,2,0）。
   这条只能这样钉：静态尺子读不到渲染结果，而"改一层皮的静默失效"这一族全靠源码里那条选择器兜。 */
ok('这一枚的样式挂在 button.rec-bar 上，不是裸 .rec-bar（裸类名会被微信默认的 184px 宽吃掉）',
  blockOf(recWxss, 'button.rec-bar').length > 0 && !/(?:^|\n)\.rec-bar\s*\{/.test(recWxss)
  && seg('.rec-bar') === '' && !/(?:^|\n)\.rec-bar\s*\{/.test(wxss),
  `共用那份 ${blockOf(recWxss, 'button.rec-bar').length} 字／这一页 ${seg('button.rec-bar').length} 字`)
ok('展开那一屏照旧画（④「只放在首屏和拍照屏」＝两态都要有，那一枚 display:none 已随这一句撤掉）',
  !/display:\s*none/.test(recSeg) && !/display:\s*none/.test(seg('button.rec-bar'))
  && !/\.rec-bar[^{]*\{[^}]*display:\s*none/.test(wxss) && !/wx:if/.test(recBtn[0].slice(0, recBtn[0].search(/>/))),
  `这一页 ${seg('button.rec-bar').trim().replace(/\s+/g, ' ') || '(无落点)'}／皮里 display ${/display:/.test(recSeg) ? '有' : '无'}`)
/* ④「按钮整体80%透明度」落在 `opacity` 这一档——⑤ 换皮时这一句他没撤，照旧钉。
   但⑤ 把"半透明"这件事另落在了**面上**（黑色半透明），所以现在两档各有各的差事：
   板（`--cp-rec-plate`）必须是 rgba，字与那支黄必须是实心色。
   只留板半透明而撤掉整枚那一档，屏上读出来是"一块实黑底上贴淡字"；只留整枚那一档而板是实心，
   读出来是"一块不透明的黑方块"——两种都不是他那句「黑色半透明」。 */
const recActive = blockOf(recWxss, 'button.rec-bar:active')
const opVal = parseFloat((/(?:^|;)\s*opacity:\s*([0-9.]+)/.exec(recSeg) || [, ''])[1])
const isRgba = (v) => /rgba?\(|[0-9a-fA-F]{8}$/.test(String(v || ''))
ok('整枚 80% 不透明＝皮里那一条 opacity: 0.8（⑤ 换皮没撤它），且:active 里不重复写（按下去会跳变）',
  Math.abs(opVal - 0.8) < 1e-9 && !/opacity/.test(recActive),
  `皮里 ${(/(?:^|;)\s*opacity:[^;]+/.exec(recSeg) || ['(无)'])[0].trim()}／:active 里 ${/opacity/.test(recActive) ? '也写了一条' : '没写'}`)
ok('「黑色半透明」落在面上（板那一档是 rgba 且样式表吃的是 var），字与那支黄仍是实心色',
  isRgba(REC.plate) && /var\(--cp-rec-plate\)/.test(recSeg)
  && [REC.face, REC.ink].every((v) => !isRgba(v)),
  `板 ${REC.plate}／字 ${REC.ink}／黄 ${REC.face}`)
ok('rgba 这一支黑只住在色板：整份皮里一个 rgba 都不许手写（写第二处就是两档各说一套）',
  !/rgba?\(/.test(recWxss) && isHex6(REC.face) && isHex6(REC.ink),
  `这一份样式表里 rgba ${(recWxss.match(/rgba?\(/g) || []).length} 处`)
/* ⑤「黄色纸飞机 ICON」＋「纸飞机在文字左边…纸飞机要大一点。高度斜45度，有飞行的感觉」
   ＋⑦「上尖超过、下尖也超过」＋⑧「胶囊加宽、能容纳纸飞机和文字」（他指的那一格）
   ⇒ 飞机那一格钉三件事：正方、色走 --cp-rec（那支芥末黄，不另起一支）、形状靠 mask 出，外加一条"斜过来了"；
   落点＝**住在按钮里面、吃绝对定位**（top 是负数，所以它跨出胶囊的上下沿；不占流，字才轮得到右边那一列）。
   这几格任一松掉，屏上读出来分别是"糊成一块"、"跟着字色变白"、"一整块实心黄方块"、"平躺着的纸飞机"、
   "又缩回胶囊里不出头"——mask／transform／absolute 都是静默失效那一族，写错一句错都不报，
   所以两支前缀都要在、旋转角与定位那两格必须现读。 */
const planeSeg = blockOf(recWxss, 'button.rec-bar .rec-plane')
const txSeg = blockOf(recWxss, 'button.rec-bar .rec-tx')
ok('那枚飞机是正方形、色从 --cp-rec 取（不另起一支黄），而 ④ 那两颗点已随新形撤净',
  num(planeSeg, 'width') > 0 && num(planeSeg, 'width') === num(planeSeg, 'height')
  && num(planeSeg, 'width') >= 40 && /background-color:\s*var\(--cp-rec\)/.test(planeSeg)
  && blockOf(recWxss, 'button.rec-bar .rec-dot') === '',
  planeSeg.trim().replace(/\s+/g, ' '))
ok('飞机斜 45°、且是**机头朝上**那一头（−45；CSS 正角顺时针，取正就变成朝下扎）',
  /transform:\s*rotate\(\s*-45deg\s*\)/.test(planeSeg),
  (/(?:^|;)\s*transform:[^;]+/.exec(planeSeg) || ['(无)'])[0].trim())
ok('飞机靠 mask 出形，两支前缀都写（漏 -webkit- 那一支在某些机型就是一块实心黄）',
  /-webkit-mask-image:\s*url\("data:image\/svg\+xml,/.test(planeSeg)
  && /(?:^|;)\s*mask-image:\s*url\("data:image\/svg\+xml,/.test(planeSeg),
  `mask ${(planeSeg.match(/mask-image:/g) || []).length} 条／svg ${(planeSeg.match(/data:image\/svg/g) || []).length} 条`)
/* ⑦ 那两截出头靠的是"绝对定位 ＋ 负 top"，而父级必须给得起坐标系且不裁切：
   这四格（absolute／top 为负／父级 relative／父级 overflow:visible）少任一格，屏上分别读成
   "缩回胶囊里"／"整支飞到按钮下面"／"按整页定位、跑到别处"／"上下尖被削平"——同样一句错都不报。
   ⚠ 上一版（⑥ 之后）钉的是 `bottom: 100%`＝整支悬在按钮上方；⑦⑧ 改成跨在按钮上，
     所以那一格现在反过来：出现 `bottom` 定位就是旧形没撤净。 */
ok('飞机吃绝对定位、负 top 跨出胶囊，父级给得起坐标系又不裁切（relative ＋ overflow:visible）',
  /position:\s*absolute/.test(planeSeg) && num(planeSeg, 'top') < 0 && !/bottom:/.test(planeSeg)
  && /position:\s*relative/.test(recSeg) && /overflow:\s*visible/.test(recSeg),
  `飞机 ${decl(planeSeg, 'position')}／top ${decl(planeSeg, 'top')}／按钮 position ${decl(recSeg, 'position')}／overflow ${decl(recSeg, 'overflow')}`)
/* ⑧「能容纳纸飞机和文字」⇒ 两列横向要排得开：字那一列靠右（justify-content: flex-end ＋ 右内缩），
   飞机那一列吃绝对定位（不占流）。竖排那一版（⑤ 第一回）的 `flex-direction: column` 不许回来。 */
ok('胶囊里两列横向分工：字靠右那一列（flex-end＋右内缩），不许竖排、不许再挤一个 gap',
  /display:\s*flex/.test(recSeg) && !/flex-direction:\s*column/.test(recSeg)
  && /align-items:\s*center/.test(recSeg) && /justify-content:\s*flex-end/.test(recSeg)
  && !/(?:^|;)\s*gap:/.test(recSeg),
  `direction ${decl(recSeg, 'flex-direction') || '(默认 row)'}／justify ${decl(recSeg, 'justify-content')}／gap ${decl(recSeg, 'gap') || '(无)'}`)
ok('⑦「字体不要加粗」⇒ 这一枚不许再写 700（那一档是我上一版自己抬的，他这一句撤掉）',
  !/font-weight:\s*(?:700|bold)/.test(recSeg), `字重 ${decl(recSeg, 'font-weight') || '(跟默认)'}`)
ok('字面那一枚不许折行（nowrap）：折了之后 44rpx 的定高把「推荐给好友」切成两截',
  /white-space:\s*nowrap/.test(txSeg), txSeg.trim().replace(/\s+/g, ' '))
/* 那行英文的墨迹宽仍是**左沿对齐**要用的数（③「在英文下放、贴着左沿」这一半没被顶掉）：
   位图 500×246，逐行扫 α>40 分带，最下面那一带（英文）占 x 101~422。
   重量法（改图后要重新量）：
     python3 -c "from PIL import Image; a=Image.open('miniprogram/assets/title-heading.png').getchannel('A') …"
   宽按屏上那一枚 `.page-title` 的实际宽折算，所以改了标题字号这一档跟着动，不会各说一套。
   ⚠ ② 那句「按钮长度不要超过英文」已被 ⑧「按钮长度要长一点，能容纳纸飞机和文字」顶掉：
     这一档不再是上限，只是一个**参照**（208 对 146.8 ⇒ 右沿越过英文 61.2），所以这里不钉阈值，
     只把两个数一起打出来——原先那条 `REC_W <= EN_W` 留在尺子里就是假红（他会说"我后来改过主意"）。 */
const EN_BAND = { x0: 101, x1: 422 }
const PNG_W = (() => { const b = fs.readFileSync(P('assets/title-heading.png')); return b.readUInt32BE(16) })()
const TITLE_W = num(seg('.page-title'), 'width')
const EN_W = ((EN_BAND.x1 + 1 - EN_BAND.x0) * TITLE_W) / PNG_W
const EN_LEFT = (EN_BAND.x0 * TITLE_W) / PNG_W
const REC_W = num(recSeg, 'width')
/* ⑦ 钉竖直（高 44 不动、飞机两头都要出头）＋⑧ 钉横向（宽要排得下"飞机那一列＋五个字"）。
   横向＝字面宽（汉字一个字正好一个 em，等宽 advance，不是估的）；内框＝width − 右内缩。 */
const FS_TINY = parseInt(/--fs-tiny:\s*(\d+)rpx/.exec(appWxss)[1], 10)
// `num()` 只认带 rpx 的数，而 `padding: 0 12rpx 0 0` 是四值简写——按位拆开读，别只读第一个。
const padParts = (src) => {
  const p = (src.match(/(?:^|;)\s*padding:\s*([^;]+)/) || [, ''])[1].trim().split(/\s+/).map((x) => parseInt(x, 10))
  if (!p.length || Number.isNaN(p[0])) return null
  if (p.length === 1) return { top: p[0], right: p[0], bottom: p[0], left: p[0] }
  if (p.length === 2) return { top: p[0], right: p[1], bottom: p[0], left: p[1] }
  if (p.length === 3) return { top: p[0], right: p[1], bottom: p[2], left: p[1] }
  return { top: p[0], right: p[1], bottom: p[2], left: p[3] }
}
const REC_PAD = padParts(recSeg) || { right: NaN, left: NaN }
const zhInk = I18N.zh.recBarTitle.length * FS_TINY
const REC_H = num(recSeg, 'height')
/* 斜 45° 之后那一格占多少，只能算不能猜，而且**要算两个数**（这一格是本轮真跑现量出来的差别）：
   · 看得见的那一支黄：路径自己在 24 格画布上占宽 21／高 18（x 2→23、y 3→21；换形状要重量——
     把 SVG path 的顶点打出来取 min/max 即可），折到 size 那一档是 size×21/24 与 size×18/24；
     绕中心转 45° 后横竖两向都变成 (宽＋高)×sin45。**⑦ 那句「超过按钮高度」量的就是这一个数。**
   · 屏上量得到的那一格＝元素的外接矩形 size×√2（mask 之外那圈空白也算进去，而且是透明的）——
     真跑尺子读回来的是它，不是上面那个数（28 那一版推 32.2、屏上量到 38.1，就是这个差别）。
     它比墨迹大一圈，所以**不许拿它去卡"有没有出板"**：那半截是空的，画不出东西。 */
const PLANE_INK = { w: 21, h: 18, box: 24 }
const SIDE = num(planeSeg, 'width')
const tilt = (SIDE * (PLANE_INK.w + PLANE_INK.h) / PLANE_INK.box) * Math.SQRT1_2
const aabb = SIDE * Math.SQRT2
const PLANE_L = num(planeSeg, 'left')
const PLANE_T = num(planeSeg, 'top') // 负数＝元素顶边在胶囊顶边之上
const inkL = PLANE_L + SIDE / 2 - tilt / 2
const inkR = PLANE_L + SIDE / 2 + tilt / 2
const inkTop = PLANE_T + SIDE / 2 - tilt / 2 // 相对胶囊顶边（负＝在顶边之上）
const inkBottom = PLANE_T + SIDE / 2 + tilt / 2
const txLeft = REC_W - REC_PAD.right - zhInk // 字靠右那一列的左沿（justify-content: flex-end）
ok('⑦ 那句「高度要超过按钮高度」成立：斜过来的那支黄（不是按钮里那格）比 44 的胶囊高',
  REC_H > 0 && tilt > REC_H, `黄 ${tilt.toFixed(1)}rpx vs 按钮高 ${REC_H}rpx（外接框 ${aabb.toFixed(1)} 是空的，不算这一格）`)
ok('⑦ 那两句「上尖超过、下尖也超过」两头都为正：墨迹顶边在胶囊之上、底边在胶囊之下',
  REC_H > 0 && inkTop < 0 && inkBottom > REC_H,
  `上凸 ${(-inkTop).toFixed(1)}／下超 ${(inkBottom - REC_H).toFixed(1)}rpx（元素 ${PLANE_T}～${PLANE_T + SIDE}）`)
ok('飞机的墨迹横向仍在板内（左沿不出板、飘出去就直接压在照片上——这一层不裁溢出）',
  PLANE_L >= 0 && inkL >= 0 && inkR <= REC_W,
  `left ${PLANE_L}＋居中一半 ⇒ 墨迹 ${inkL.toFixed(1)}～${inkR.toFixed(1)} vs 板宽 ${REC_W}`)
ok('⑧「能容纳纸飞机和文字」横向排得开：黄那一列与五个字之间还留 ≥4 的缝，字也不许贴出右内缩',
  REC_W > 0 && zhInk > 0 && txLeft >= inkR + 4 && txLeft + zhInk <= REC_W - 8,
  `黄右沿 ${inkR.toFixed(1)}＋缝 ${(txLeft - inkR).toFixed(1)}＋字 ${zhInk}＝到 ${txLeft + zhInk} vs 板 ${REC_W}／右内缩 ${REC_PAD.right}`)
console.log(`  · 备忘（不是判据）：⑧ 顶掉 ② 之后板宽 ${REC_W} 对那行英文墨迹 ${EN_W.toFixed(1)}＝越过 ${(REC_W - EN_W).toFixed(1)}rpx`)
ok('五个字的横向宽压得进这一枚的内容盒（宽 − 左右内缩；英文那一门由真跑尺子量实际矩形）',
  zhInk <= REC_W - REC_PAD.left - REC_PAD.right,
  `${I18N.zh.recBarTitle.length}×${FS_TINY}＝${zhInk}rpx vs 内容盒 ${REC_W - REC_PAD.left - REC_PAD.right}rpx`)
ok('高维持 ④ 那一档 44（他「按钮高度维持之前高度」；竖排那一版抬到 70 已撤回），字仍吃 --fs-tiny',
  REC_H === 44 && /font-size:\s*var\(--fs-tiny\)/.test(recSeg),
  `高 ${REC_H}／字 ${decl(recSeg, 'font-size')}`)
// 左沿对齐：这一枚的左边要和那行英文的左边在同一条线上（这才叫"在英文下放"）。
// 同一个选择器在一个文件里可以写两条（`.title-row .page-title` 一条管 opacity、一条管 margin-left），
// 而 `seg()` 只回第一条——拿它读 margin 会读出 NaN，再把"算不出来"当成"算出来够"。
// 所以按需要的那条属性去挑块，而不是按出现顺序拿第一块。
const segsOf = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const out = []
  const re = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`, 'g')
  let m
  while ((m = re.exec(wxss))) out.push(m[1])
  return out
}
const segProp = (sel, prop) => (segsOf(sel).find((b) => new RegExp(`${prop}:`).test(b)) || '')
const marginParts = (raw) => {
  const p = (raw.match(/(?:^|;)\s*margin:\s*([^;]+)/) || [, ''])[1].trim().split(/\s+/).map((x) => parseInt(x, 10))
  if (!p.length || Number.isNaN(p[0])) return null
  if (p.length === 1) return { top: p[0], right: p[0], bottom: p[0], left: p[0] }
  if (p.length === 2) return { top: p[0], right: p[1], bottom: p[0], left: p[1] }
  if (p.length === 3) return { top: p[0], right: p[1], bottom: p[2], left: p[1] }
  return { top: p[0], right: p[1], bottom: p[2], left: p[3] }
}
const SP3 = parseInt(/--sp-3:\s*(\d+)rpx/.exec(appWxss)[1], 10)
const TITLE_ML = (marginParts(segProp('.title-row .page-title', 'margin')) || { left: NaN }).left
const recM = marginParts(recSeg)
const swapM = marginParts(seg('.home-swap'))
ok('左沿与那行英文的左沿在同一条线上（±3rpx 以内）',
  recM && Math.abs((SP3 + recM.left) - (SP3 + TITLE_ML + EN_LEFT)) <= 3,
  `按钮左沿 ${SP3 + (recM ? recM.left : NaN)}rpx／英文左沿 ${(SP3 + TITLE_ML + EN_LEFT).toFixed(1)}rpx`)
/* 与「调亮度｜换背景｜换心情」那一行的实际缝：抵掉 .home-swap 那道负 margin-top 之后还剩多少。
   原来这一格还要"容得得下立体那 3rpx 实边"，⑤ 把实边撤了 ⇒ 这一档只剩呼吸量，取 12rpx。
   ⚠ 不许再从 `box-shadow: 0 (\d+)rpx` 里读那个数：⑤ 之后那条 shadow 是投影（0 6rpx 14rpx），
   把它当"实边厚度"会凭空多要 6rpx，判据红在一支跟落点无关的属性上。 */
ok('与「调亮度」那一行的实际缝算得出来（抵掉 .home-swap 那道负 top，且 ≥12rpx 呼吸）',
  recM && swapM && recM.bottom - Math.abs(swapM.top) >= 12,
  `margin-bottom ${recM && recM.bottom}／.home-swap margin-top ${swapM && swapM.top}`)
/* ⑤「按钮位置再上移一点」⇒ 32 收到 8；⑥「目前按钮离英文太近了，往下一点，留出空间给纸飞机ICON」
   ⇒ 8 放到 60。钉的是同一个数、方向相反，两句都是他本人的话，所以判据跟着第二次改（不改代码迁就旧尺子）。
   这一档必须 ≥ 飞机凸出量＋一点透气；反向再钉一条"按钮自己不许有 margin-top"：缝要只住一处，
   两处各写一半就没人说得清屏上那道缝是谁给的——同一类账在 §8.170 那行日期、10-01 那行 Tips 上各欠过一次。 */
const TITLE_MB = parseInt((/(?:^|;)\s*margin-bottom:\s*(\d+)rpx/.exec(segProp('.title-row', 'margin-bottom')) || [, ''])[1], 10)
ok('⑥ 那一刀落了：标题行底下那道缝 ≥ 飞机凸出量＋8（给纸飞机留出空间），且这一枚自己没有 margin-top 来分这笔账',
  TITLE_MB >= -inkTop + 8 && recM && recM.top === 0,
  `.title-row margin-bottom ${TITLE_MB}rpx vs 飞机上尖凸出 ${(-inkTop).toFixed(1)}rpx／按钮 margin-top ${recM && recM.top}rpx`)
/* ④「只放在首屏和拍照屏，不再放在列表页」——这一句把 ③ 里"首屏和笔记列表都要"那一半收掉了。
   于是那份共用皮现在只有一页吃（新建页的两态），三件事必须一起成立：
   ① 列表页真撤净（代码、样式、发下来的那五档变量都不留残；留残是下一次往回挂的诱饵）；
   ② 皮只 import 一次（两处 import 同一份文件＝同一枚按钮长两个样，屏上看不出来）；
   ③ 这一页那一条只管落点，不许把 width／阴影抄回页面里（那样皮就分成两半，改一档漏一处）。
   palette 里那支 `recBarVars()` 是当初为列表页补发的口子，现在没人用了，一起撤——
   留着它，下次谁看到"哦还有个列表页专用的口"就会把那枚按钮挂回去。 */
const ixWxml2 = fs.readFileSync(P('pages/index/index.wxml'), 'utf8')
const ixJs2 = fs.readFileSync(P('pages/index/index.js'), 'utf8')
const ixWxssClean = ixWxss2.replace(/\/\*[\s\S]*?\*\//g, '')
const crWxssClean = wxssRaw.replace(/\/\*[\s\S]*?\*\//g, '')
const importRe = /@import\s+'[^']*styles\/rec-bar\.wxss'/
ok('列表页撤净：模板、样式表、页面脚本里 rec-bar / recSkin / recBarVars 一个不留',
  !/rec-bar/.test(ixWxml2) && !/rec-bar/.test(ixWxssClean)
  && !/recBarVars|recSkin/.test(ixJs2.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')),
  `wxml ${(ixWxml2.match(/rec-bar/g) || []).length}／wxss ${(ixWxssClean.match(/rec-bar/g) || []).length}／js ${(ixJs2.match(/recBarVars|recSkin/g) || []).length} 处残留`)
ok('那份皮只被一页 import（两处 import 同一份＝同一枚按钮长两个样）',
  (crWxssClean.match(new RegExp(importRe.source, 'g')) || []).length === 1 && !importRe.test(ixWxssClean),
  `新建页 ${(crWxssClean.match(new RegExp(importRe.source, 'g')) || []).length} 处／列表页 ${(ixWxssClean.match(new RegExp(importRe.source, 'g')) || []).length} 处`)
ok('palette 不再 export 那支只给列表页用的 recBarVars()',
  typeof palette.recBarVars === 'undefined')
ok('这一页那一条只管落点：只有 margin，没把 width／高／阴影抄回页面里（皮只住在共用那份）',
  /margin:/.test(seg('button.rec-bar')) && !/\b(width|height|box-shadow|background|opacity):/.test(seg('button.rec-bar')),
  `这一页那一条：${seg('button.rec-bar').trim().replace(/\s+/g, ' ') || '(无)'}`)
ok('整页只有一枚这一按钮（两态共用同一枚 DOM；一态画一枚迟早长得不一样）',
  (wxml.match(/class="rec-bar"/g) || []).length === 1, `${(wxml.match(/class="rec-bar"/g) || []).length} 枚`)
// 两个入口一张卡：载荷只许有一个出处。me.js 那枚先存在，新建页这一枚是第二枚。
const meJs = fs.readFileSync(P('pages/me/me.js'), 'utf8')
const shareJs = fs.readFileSync(P('utils/shareCard.js'), 'utf8')
ok('两枚分享入口的载荷共用 utils/shareCard.js 一份实现（两页自己都不许再写 imageUrl）',
  /appSharePayload\(/.test(jsOnly) && /appSharePayload\(/.test(meJs)
  && !/imageUrl:/.test(jsOnly) && !/imageUrl:/.test(meJs))
ok('那份载荷落的就是新建页 ＋ assets/share-card.jpg（与「我的」页那枚真跑尺子钉的同一组值）',
  /path: `\/pages\/create\/create/.test(shareJs) && shareJs.includes("'/assets/share-card.jpg'"),
  shareJs.split('\n').filter((l) => /path:|SHARE_IMAGE =/.test(l)).join(' ⏎ '))

console.log(fails.length ? `✗ 第一屏三块：${pass}/${pass + fails.length} 条通过` : `✓ 第一屏三块：${pass} 条全过`)
if (fails.length) { fails.forEach((f) => console.log('  · ' + f)); process.exit(1) }
