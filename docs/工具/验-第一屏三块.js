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
// ⑦ 组顶那条 min() 里的 546，是从"整组高＋底栏高＋最少留白"推出来的，任何一头改了这里要跟着改。
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
const COUNT_H = num(sCount, 'height')
const GAP = num(sRow, 'gap')
// 面板那一档的高度从 `.panel` 现读，不写进判据：他这句「与第二个图高度对齐」说的是**关系**，
// 面板以后改成别的数，左块要跟着走，判据不该反过来把 410 钉成真理。
const PANEL_H = num(seg('.panel'), 'height')
ok('左块宽 308、高与第二屏那块面板同一个数（「左边内框要与第二个图高度对齐」）',
  PERSON === 308 && PERSON_H > 0 && PANEL_H > 0 && PERSON_H === PANEL_H,
  `块 ${PERSON}×${PERSON_H}／面板 ${PANEL_H}`)
ok('两片皮正好拼成整块，不多不少（对不上就是中间开了缝、或者有一片溢出去）',
  FACE_H > 0 && COUNT_H > 0 && FACE_H + COUNT_H === PERSON_H,
  `白面 ${FACE_H} ＋ 墨面 ${COUNT_H} vs 块 ${PERSON_H}`)
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
ok('窗高等于女那张按宽缩放的自然高（脚底刚好落在墨面上沿，一个像素不悬空）',
  FIG_W + OVER > 0 && FACE_H + OVER === FIG_F, `窗高 ${FACE_H + OVER} vs 女那张 ${FIG_F}`)
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
ok('白面与墨面各是一条七档渐变（不是两档糊过去）',
  (decl(sFace, 'background').match(/\d+%/g) || []).length === 7
  && (decl(sCount, 'background').match(/\d+%/g) || []).length === 7,
  `白面 ${(decl(sFace, 'background').match(/\d+%/g) || []).length} 档／墨面 ${(decl(sCount, 'background').match(/\d+%/g) || []).length} 档`)
ok('两片皮的停点位置与现网 .page-scrim 逐档相同（"与现网的过程一样"）',
  scrimStops.length === 7
  && JSON.stringify(stops(decl(sFace, 'background'))) === JSON.stringify(scrimStops)
  && JSON.stringify(stops(decl(sCount, 'background'))) === JSON.stringify(scrimStops),
  `现网 ${scrimStops}／白面 ${stops(decl(sFace, 'background'))}／墨面 ${stops(decl(sCount, 'background'))}`)
ok('两片的基色一支是白、一支是 .page-scrim 那支 (18,20,26)',
  /rgba\(255,\s*255,\s*255/.test(decl(sFace, 'background'))
  && /rgba\(18,\s*20,\s*26/.test(decl(sCount, 'background')))
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
  gradSpan(decl(sFace, 'background')) >= 6,
  `实测 ${Math.round(gradSpan(decl(sFace, 'background')))} 级`)
ok('墨面渐变合成到墨面板之后同样差 ≥6 级',
  gradSpan(decl(sCount, 'background')) >= 6,
  `实测 ${Math.round(gradSpan(decl(sCount, 'background')))} 级`)
// 字压面：那一格的底取**渐变最浅那一端**（最难读的头），字与横线各自先合成成实心再算。
const COUNT_FLOOR = over(gradTok(decl(sCount, 'background'), true), PANEL_FACE)
const solidOf = (sel, prop) => {
  const raw = decl(seg(sel), prop)
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
ok('那一支纸白确实写在这一组里（一条都没有＝面板上的字全成了 var(--text-*)，浅壁纸那一态会翻墨）',
  huesInBlk.filter(isPaperWhite).length >= 4,
  `${huesInBlk.filter(isPaperWhite).length} 处`)
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
  && /class="container[^"]*"\s+style="\{\{skinPanel\}\}"/.test(wxml)
  && !/class="panel[^"]*"[^>]*style="\{\{skinPanel\}\}"/.test(wxml))
/* 两态同一条顶线（深色面板那一层就是"两态共用"的那一层）：面板顶 ＝ 那一组顶 − 框外那一行的高。
   数从三处现读、不写进判据：`.home-blk` 的夹值、`.stage-panel` 的那两个数、`.out` 的高。
   ⚠ `decl()` 取的是**第一条**，而这两处都是"退路一条 ＋ min() 一条"成对写的（老安卓不认 min()），
   所以这里要把该选择器所有同名声明都收出来，再挑带 min()/calc() 的那一条。 */
const declsOf = (src, prop) => (src.match(new RegExp(`${prop}:\\s*([^;]+)`, 'g')) || [])
ok('两态的顶是同一条线（面板顶 ＝ 那一组顶那一档往上「框外那一行的高」）', (() => {
  const all = (sel) => declsOf(seg(sel), 'top').join(' | ')
  const group = all('.home-blk'), panel = all('.stage-panel')
  const outH = num(seg('.out'), 'height')
  const gClamp = Number((/calc\(100vh - (\d+)rpx\)/.exec(group) || [0, 0])[1])
  const pShift = Number((/calc\(66\.3% - (\d+)rpx\)/.exec(panel) || [0, 0])[1])
  const pClamp = Number((/calc\(100vh - (\d+)rpx\)/.exec(panel) || [0, 0])[1])
  // 退路那条也得在（老安卓不认 min() 时整条掉下来＝面板顶塌成写死）
  return /min\(/.test(panel) && /min\(/.test(group) && pShift > 0 && pShift === outH
    && gClamp > 0 && pClamp === gClamp + outH
    && (panel.match(/calc\(66\.3% - /g) || []).length >= 2
})(), `组 top=${declsOf(seg('.home-blk'), 'top').join('｜')}／面板 top=${declsOf(seg('.stage-panel'), 'top').join('｜')}／那一行高 ${num(seg('.out'), 'height')}`)

/* 面板那三段皮的**分工**（他 10-13「新增面板为什么看不到渐变毛玻璃」追出来的）：
   本体必须透明。实心 .95 一旦写回本体，就与压在它上面的 `::before` 相乘
   ⇒ band 顶透出 1−(1−.95)(1−.32)＝3.4%、band 底 0.30%，整块 97% 实心，
   "上部渐变半透明毛玻璃"画了等于没画，而且**静态几何全绿、截图也看不出差别**（它就是那一片墨）。
   所以这一条只能按结构钉，不能靠眼看。 */
const sPanel = seg('.stage-panel')
const sPanelBand = seg('.stage-panel::before')
const sPanelBody = seg('.stage-panel::after')
ok('深色面板本体透明（实心只能归 ::after；写回本体＝与 ::before 相乘，band 透出不到 3.4%）',
  /^(transparent|none)$/i.test(decl(sPanel, 'background')),
  `本体 background=${decl(sPanel, 'background') || '(没写)'}`)
const BAND_H_CSS = num(sPanelBand, 'height')
ok('band 那一段是 ::before 的 .32→.94 两档（同色只走透明度；顶档 10-13 从 .55 收到 .32＝"上面渐变加强一点"）',
  BAND_H_CSS > 0 && /rgba\(35,\s*37,\s*44,\s*0?\.32\)/.test(decl(sPanelBand, 'background'))
  && /rgba\(35,\s*37,\s*44,\s*0?\.94\)/.test(decl(sPanelBand, 'background')),
  `高 ${BAND_H_CSS}／${decl(sPanelBand, 'background') || '(没写)'}`)
ok('实心 .95 挂在 ::after 上，从 band 底下起、贴到屏底（top 与 ::before 的高是同一个数）',
  /rgba\(35,\s*37,\s*44,\s*0?\.95\)/.test(decl(sPanelBody, 'background'))
  && num(sPanelBody, 'top') === BAND_H_CSS && /bottom:\s*0\b/.test(sPanelBody),
  `::after top=${num(sPanelBody, 'top')}／bottom=${decl(sPanelBody, 'bottom')}／background=${decl(sPanelBody, 'background') || '(没写)'}`)
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
ok('两枚各自绑自己的位（noteCount／cardCount），且都从接口来',
  /class="blk-num">\{\{noteCount\}\}<\/text>/.test(wxml)
  && /class="blk-num">\{\{cardCount\}\}<\/text>/.test(wxml)
  && /api\.getQuota\(\)/.test(jsOnly) && /api\.getMyCards\(\)/.test(jsOnly))
ok('两个口各自独立：任一拉不到不许把另一格和这一屏一起拖挂（各包各的 try）',
  (jsOnly.match(/try \{[\s\S]*?getQuota[\s\S]*?\} catch/g) || []).length === 1
  && (jsOnly.match(/try \{[\s\S]*?getMyCards[\s\S]*?\} catch/g) || []).length === 1)
ok('读不到画 0，不画杠也不留空（沿用笔记页那一列 10-01 定的口径）',
  /noteCount: 0/.test(js) && /cardCount: 0/.test(js))
ok('每次进页重读这两个数（出完图回来该跟着涨）',
  /this\.loadEntryStats\(\)/.test(js.split('async onShow')[1].split('hintFor(value)')[0]))

/* ---------- 6. 三块的落点 ---------- */
ok('左块点下去仍是 openBar 那一档（拍照），没有另起一套开门逻辑',
  /openBar\(\)\s*\{[\s\S]{0,200}this\.open\('photo'\)/.test(js)
  && /class="blk-person"[^>]*catchtap="openBar"/.test(wxml))
ok('笔记那一格切到列表 tab；卡片那一格切过去并落第二枚',
  /goNotes\(\)[\s\S]{0,160}switchTab\(\{ url: '\/pages\/index\/index' \}/.test(js)
  && /goCards\(\)[\s\S]{0,200}ixOpenCardsTab = true[\s\S]{0,120}switchTab/.test(js))
// 一次性标记：立一次、读一次、清一次。index 里读与清必须是同一段，
// 且"默认第一枚"那条对底栏切回来仍然成立。
const ixBody = ixJs.split('async onShow')[1] || ''
ok('index 那头读这一枚标记并就地清掉（常驻就把「默认第一个 tab」废了）',
  /openCardsTab = !!app\.globalData\.ixOpenCardsTab/.test(ixBody)
  && /app\.globalData\.ixOpenCardsTab = false/.test(ixBody))
ok('标记只赢过"无条件复位"，赢不过"从这一页 push 出去再返回"那一型',
  /view: keepView \? this\.data\.view : \(openCardsTab \? 'cards' : 'list'\)/.test(ixBody))
ok('清标记这一行排在取 view 之前（先算后清会读到上一趟的残值）',
  ixBody.indexOf('ixOpenCardsTab = false') < ixBody.indexOf("view: keepView"))

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

/* ---------- 9. 组顶那道 min() 的常数与两头同源 ---------- */
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
ok('min() 里那个夹值是推出来的、不是拍的：整组 ＋ 底栏 ＋ 最少留白 24',
  /min\(66\.3%,\s*calc\(100vh - (\d+)rpx\)\)/.test(sBlk)
  && parseInt(/min\(66\.3%,\s*calc\(100vh - (\d+)rpx\)\)/.exec(sBlk)[1], 10) === GROUP_H + TAB_H + 24,
  `整组 ${GROUP_H} ＋ 底栏 ${TAB_H} ＋ 留白 24 = ${GROUP_H + TAB_H + 24}`)
ok('min() 之前留了一行不带函数的退路（老安卓不认 min() 时不许塌成写死）',
  (sBlk.match(/top:\s*66\.3%/) || []).length >= 1 && /top:\s*min\(/.test(sBlk))
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
ok('两枚计数的标签成对（statNotes／statCards），且不借名片那一格的 slotCard',
  !!zh.statNotes && !!zh.statCards && !!en.statNotes && !!en.statCards
  && /t\.statNotes/.test(wxml) && /t\.statCards/.test(wxml) && !/t\.slotCard/.test(wxml))
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
  && /aria-label="\{\{cardCount\}\}\{\{t\.statCards\}\}"/.test(wxml))
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
const collide = [...usedClasses].filter((c) => !SHARED_OK.includes(c)
  && new RegExp(`\\.${c}(?![\\w-])`).test(appWxss))
ok('这一屏用的类名没有一枚和 app.wxss 同名（撞上的话全局那一份会静默补进来）',
  collide.length === 0, collide.join(' '))
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

console.log(fails.length ? `✗ 第一屏三块：${pass}/${pass + fails.length} 条通过` : `✓ 第一屏三块：${pass} 条全过`)
if (fails.length) { fails.forEach((f) => console.log('  · ' + f)); process.exit(1) }
