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

/* ---------- 1. 几何：三块是一个整体 ---------- */
const sPerson = seg('.blk-person')
const sStat = seg('.blk-stat')
const sCol = seg('.blk-col')
const sRow = seg('.blk-row')
const PERSON = num(sPerson, 'width')
const PERSON_H = num(sPerson, 'height')
const STAT_H = num(sStat, 'height')
const GAP = num(sRow, 'gap')
const COL_GAP = num(sCol, 'gap')
ok('左块是见方的（宽高不等就是被 flex 拉过）', PERSON === PERSON_H, `${PERSON}×${PERSON_H}`)
ok('左块 308 见方 = 右两枚各 148 ＋ 中间那道缝（148×2＋12）',
  PERSON === 308 && STAT_H === 148 && COL_GAP === 12 && PERSON === STAT_H * 2 + COL_GAP,
  `块 ${PERSON}／枚 ${STAT_H}／缝 ${COL_GAP}`)
ok('三块之间那两道缝同一个数（行内与列内不一致会看着像没对齐）', GAP === COL_GAP, `${GAP} vs ${COL_GAP}`)
ok('左块定宽不伸、右列吃余量（效果图那一版左块宽度算成 0，人物没地方画，就是这两条反了）',
  /flex:\s*none/.test(sPerson) && /flex:\s*1/.test(sCol) && /min-width:\s*0/.test(sCol))
// 页面内缩 24，所以右列宽 = 750 − 24×2 − 左块 − 缝。这个数不写在任何地方，是推出来的。
const RIGHT_W = 750 - 24 * 2 - PERSON - GAP
ok('右两枚推出来的宽度落在 382（效果图上量的那一个）', RIGHT_W === 382, `${RIGHT_W}`)

/* ---------- 2. 人物不许压住那条白底 ---------- */
const sWrap = seg('.blk-figwrap')
const sJot = seg('.blk-jot')
const sFig = seg('.blk-fig')
const OVER = -num(sWrap, 'top')            // 出血量：人物超出块顶那一段
const WRAP_BOTTOM = num(sWrap, 'bottom')   // 取景窗下沿离块底多少
const JOT_PAD = sJot.match(/padding:\s*([\d.]+)rpx\s*([\d.]+)rpx\s*([\d.]+)rpx\s*([\d.]+)rpx/)
// 白条自己的高度：上内边距＋「记下来」那一行＋小字上边距＋小字一行＋下内边距。
// 字号从现网令牌与样式里现读，不抄常量——改了字号这里要跟着变，写死就量不出来。
// 小字那一档现在走的是 `var(--fs-micro)`，所以两头都要能解令牌（sizeOf）。
const jotH = (() => {
  if (!JOT_PAD) return NaN
  const [, t, , b] = JOT_PAD      // 四段内边距的顺序是 上/右/下/左
  const big = sizeOf('.blk-jot-l', 'font-size')
  const bigLh = parseFloat(decl(seg('.blk-jot-l'), 'line-height') || '1.3')
  const cam = num(seg('.blk-cam'), 'height')   // 那一行是 flex：高度取字与快门里高的那个
  const small = sizeOf('.blk-jot-s', 'font-size')
  const smallMt = num(seg('.blk-jot-s'), 'margin-top')
  const rowH = Math.max(big * bigLh, cam)
  return parseInt(t, 10) + Math.round(rowH) + smallMt + Math.round(small * 1.4) + parseInt(b, 10)
})()
ok('取景窗有 overflow:hidden（没有它就裁不住，人物会盖到白条上）', /overflow:\s*hidden/.test(sWrap))
ok('人物上边出血 52rpx（这就是"超出边框一部分"那一下，归 0 等于撤了这条决定）',
  OVER === 52, `出血 ${OVER}`)
// 窗底必须停在白条上沿**或之上**（低过头就压字），又不许离得太远（留一条缝就不是"贴住"）。
// 104 是上面现读出来的白条高（14＋47＋2＋25＋16），105 是样式里那个数：中间这 1rpx 是留的呼吸，
// 超过 6 就是另一回事了。10-10 小字从 14 抬到 --fs-micro(18) 之后，白条高了 5，窗底跟着抬 5。
ok('取景窗下沿停在白条上沿（低过头压字，高太多就留缝）',
  WRAP_BOTTOM >= jotH && WRAP_BOTTOM - jotH <= 6, `窗底 ${WRAP_BOTTOM} vs 白条实测高 ${jotH}`)
ok('人物只定宽、高由 widthFix 算（两张图比例不同：女 0.832／男 0.689，写死方盒会拉扁）',
  /width:\s*\d+rpx/.test(sFig) && !/height:/.test(sFig) && /mode="widthFix"/.test(wxml))
ok('男那张（更高）也在同一道窗里被裁齐：源件宽高比确实不同，判据才不是空转',
  (() => {
    const r = (f) => { const b = fs.readFileSync(P(f)); return b.readUInt32BE(16) / b.readUInt32BE(20) }
    const a = r('assets/ic-person.png'), b = r('assets/ic-person-alt.png')
    return Math.abs(a - b) > 0.1
  })(),
  '两张比例相同的话这一组判据没在管任何东西')
ok('白条是纯白（他原话「底色换成纯白」），且不是纸白 #F2EFE9 那一枚',
  /background:\s*#FFFFFF/i.test(sJot) && !/#f2efe9/i.test(sJot))
// 两档灰的**色号**钉死（他 10-10 晚改的口：小字原来 14rpx／#8E8E93 在白底上只有 3.26，读不动），
// 但**对比度另算一条、且从样式表现读**——色号这条只管"是不是这一支"，管不了"换一支会不会掉线"。
const jotInk = (/#(?:[0-9a-fA-F]{6})\b/.exec(seg('.blk-jot-l'))?.[0] || '').toUpperCase()
const jotSInk = (/#(?:[0-9a-fA-F]{6})\b/.exec(seg('.blk-jot-s'))?.[0] || '').toUpperCase()
ok('「记下来」深灰 #3A3A3C、小字 #6E6E73（他 10-10 晚改的口，不是橙也不是白）',
  jotInk === '#3A3A3C' && jotSInk === '#6E6E73', `${jotInk}／${jotSInk}`)
ok('小字这一档从 14rpx 抬到了 --fs-micro（抬字是拍板的一半，另一半不能悄悄掉回 14）',
  sizeOf('.blk-jot-s', 'font-size') === 18, `${decl(seg('.blk-jot-s'), 'font-size')}`)
ok('两档写死的灰都压得住白条那张纯白（≥4.5）——读不到色号直接红，不许空过',
  !!jotInk && !!jotSInk && palette.crOf(jotInk, '#FFFFFF') >= 4.5 && palette.crOf(jotSInk, '#FFFFFF') >= 4.5,
  `${jotInk} ${palette.crOf(jotInk || '#000000', '#FFFFFF').toFixed(2)}／${jotSInk} ${palette.crOf(jotSInk || '#000000', '#FFFFFF').toFixed(2)}`)
ok('白条底下那一层 85% 半透明白（.blk-strip）没有把字冲淡：四套 × 两枚 ≥4.5',
  palette.THEMES.every((th) => {
    const b = palette.entryBlocks(th.key)
    return ['notes', 'cards'].every((k) => {
      const strip = palette.mix('#FFFFFF', b.face[k], 0.85)
      return palette.crOf(b.ink[k], strip) >= 4.5
    })
  }),
  palette.THEMES.map((th) => {
    const b = palette.entryBlocks(th.key)
    return `${th.label} ${['notes', 'cards'].map((k) => palette.crOf(b.ink[k], palette.mix('#FFFFFF', b.face[k], 0.85)).toFixed(2)).join('/')}`
  }).join(' '))
ok('快门那枚复用第二屏那支 Lucide camera（同一份 mask，不另画一份）',
  /class="blk-cam glyph-camera"/.test(wxml)
  && /\.blk-cam[^{]*\{[^}]*\}/.test(wxss)
  && new RegExp('\\.blk-cam[^{]*\\.paste-glyph[^{]*\\{[^}]*mask-repeat').test(wxss))

/* ---------- 3. 颜色只能由 palette 派生 ---------- */
const usedEb = [...new Set((wxss.match(/var\((--eb-[a-z0-9-]+)\)/g) || []).map((x) => /--eb[a-z0-9-]*/.exec(x)[0]))]
const ebSkin = palette.entryBlocks().style
ok('三块用到的每一枚 --eb-* 都由 entryBlocks() 发得出来（拼错不会红、只会静默透明）',
  usedEb.length === 6 && usedEb.every((v) => ebSkin.includes(`${v}:`)),
  usedEb.filter((v) => !ebSkin.includes(`${v}:`)).join(',') || `只读到 ${usedEb.length} 枚`)
ok('create.js 每次进页重发这套面（换壁纸回来三块要跟上，初值那一枚不算）',
  /blkSkin: entryBlocks\(app\.getWallpaper\(\)\)\.style/.test(js))
// 只扫这三块自己那些选择器那几段（同一份样式表下面还有面板、卡、滑条那些色，
// 拿整份来判"不许抄色相"会一把红到底，量不到任何东西）。
const blkSels = wxss.match(/^\.home-blk[-\w.,\s]*\{[^}]*\}|^\.blk[-\w.,\s]*\{[^}]*\}/gm) || []
const blkSegs = blkSels.join('\n')
// 这一段必须先自证"真的扫到了东西"：原来这条判据在 `blkSegs` 为空时是 `[] .length === 0` → 绿。
// 10-10 那次翻车（组名从 `.blk` 改成 `.home-blk`）只要正则少写一个分支，整组色判据就会集体假绿。
ok('色扫真扫到了三块那几段（匹配到 0 段时，下面几条"没有抄色相"全是假绿）',
  blkSels.length >= 15 && blkSegs.length > 800,
  `${blkSels.length} 段／${blkSegs.length} 字符`)
const huesInBlk = (blkSegs.match(COLOR_RE) || []).filter(isHue)
ok('三块那几段样式表里没有抄进来的色相（白名单换成按饱和度认：中性色放行，有彩度就红）',
  huesInBlk.length === 0, huesInBlk.join(','))
// 写死的背景同样按饱和度认。原来这里额外放行 `rgba(255,255,255,*)`／`rgba(0,0,0,*)`，
// 那是给半透明白与黑开的洞——但 rgba 里换成 `rgba(210,104,63,.5)` 一样从洞里过去了。
const hardBg = (blkSegs.match(/(?:background|background-color):\s*([^;}]+)/g) || [])
  .flatMap((s) => (s.match(COLOR_RE) || []))
  .filter(isHue)
ok('三块的面色确实一段都不写死（背景全是 var(--eb-*)，只有纯白与快门的灰是拍过的中性色）',
  /\.blk-person\s*\{[^}]*background:\s*var\(--eb-person\)/.test(wxss) && hardBg.length === 0,
  hardBg.join(','))

/* ---------- 4. 门槛：字压面 ≥4.5（四套 × 三块 = 12 个值） ----------
   这里**只钉得住"换壁纸这一头不许塌"**。"面压照片"那一头当初也立过一条 3.0，10-10 撤了：
   一是站长从没提过这条门槛（我自己加的），二是我当时报的那三个探点色 #7A7D84/#625A56/#5D5959
   取的是**最暗那一档（弯月）**罩后的读数——默认那档（半月）实测最低 1.98、满月档 1.28，
   那句"十二个值全过 3.0"当时就是假的。三档数字与量法记在 docs/规格-创建入口这一条线.md §6.2。 */
for (const th of palette.THEMES) {
  const b = palette.entryBlocks(th.key)
  const ink = Object.keys(b.face).map((k) => ({ k, c: palette.crOf(b.ink[k], b.face[k]) }))
  ok(`${th.label}：字压面三块全 ≥4.5`, ink.every((x) => x.c >= 4.5),
    ink.map((x) => `${x.k} ${x.c.toFixed(2)}`).join(' '))
}

/* ---------- 5. 两个计数来自接口 ---------- */
ok('效果图上那两个占位数没被抄进页面（128／46 一旦落进 wxml 就是永远显示假数）',
  !/>\{\{?(128|46)\}?\}/.test(wxml) && !/class="blk-n">128</.test(wxml))
ok('两枚各自绑自己的位（noteCount／cardCount），且都从接口来',
  /class="blk-n">\{\{noteCount\}\}<\/text>/.test(wxml)
  && /class="blk-n">\{\{cardCount\}\}<\/text>/.test(wxml)
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
/* 「高度约为女的一半」这条按源件比例现算，不抄常量：主人物宽 220 时女那张屏上 264 高，
   剪影宽 w 时男那张屏上 w/0.6897 高——比值要落在 0.45~0.55。
   原来给的是 110 宽 → 160 高 = 0.60 倍，比他那句大一档，这一条当时量不到（判据写死 110/132）。 */
const figAR = (() => {
  const r = (f) => { const b = fs.readFileSync(P(f)); return b.readUInt32BE(16) / b.readUInt32BE(20) }
  return { girl: r('assets/ic-person.png'), boy: r('assets/ic-person-alt.png') }
})()
const mainH = sizeOf('.blk-fig', 'width') / figAR.girl
const altH = sizeOf('.blk-fig-alt', 'width') / figAR.boy
ok('剪影屏上高 ≈ 主人物的一半（他原话"高度约为女的一半"，比值 0.45~0.55）',
  altH / mainH >= 0.45 && altH / mainH <= 0.55,
  `主人物 ${mainH.toFixed(1)}、剪影 ${altH.toFixed(1)} → ${(altH / mainH).toFixed(2)}`)
// 点击为什么不在剪影那张图上：它压在主人物后面，重叠那一条被上面那张吞掉。
// 所以热区必须盖在**最上层**，而且要比两张里高的那一张更大——少一挡就有一段点了没反应。
const tallerAlt = Math.max(sizeOf('.blk-fig-alt', 'width') / figAR.girl, altH)
ok('点的是透明热区，不是那张图：热区 z-index 盖过前后两张',
  intOf(sAltHit, 'z-index') > intOf(sFig, 'z-index')
  && intOf(sAltHit, 'z-index') > intOf(sFigAlt, 'z-index'),
  `热区 ${intOf(sAltHit, 'z-index')}／主 ${intOf(sFig, 'z-index')}／剪影 ${intOf(sFigAlt, 'z-index')}`)
ok('热区盖得住两张里更高的那一张（宽和高都不得小于剪影本身）',
  sizeOf('.blk-alt-hit', 'width') >= sizeOf('.blk-fig-alt', 'width')
  && sizeOf('.blk-alt-hit', 'height') >= tallerAlt,
  `热区 ${sizeOf('.blk-alt-hit', 'width')}×${sizeOf('.blk-alt-hit', 'height')} vs 剪影最高 ${tallerAlt.toFixed(1)}`)
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
ok('两份图各在包里，且键名／路径／存储只写在 utils/person.js 一处',
  fs.existsSync(P('assets/ic-person.png')) && fs.existsSync(P('assets/ic-person-alt.png'))
  && fs.existsSync(P('assets/ic-stat-notes.png')) && fs.existsSync(P('assets/ic-stat-cards.png'))
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
ok('三块各自挂了按下态（hover-class，不是 :active——小程序里 :active 不稳）',
  hoverNames.length === 2 && (wxml.match(/hover-class="blk-[a-z-]+"/g) || []).length === 3,
  hoverNames.join(','))
ok('每一枚 hover-class 在样式表里真有一条规则接着（名字对不上＝静默不放大）',
  hoverNames.every((n) => new RegExp(`(?:^|\\n)\\.${n}[\\s,{][^}]*\\{[^}]*\\}`).test(wxss)),
  hoverNames.filter((n) => !new RegExp(`(?:^|\\n)\\.${n}[\\s,{]`).test(wxss)).join(','))
ok('样式表里没有"挂了但没人指"的 .blk-*-press（孤儿规则）',
  (wxss.match(/^\.blk-[a-z-]*press(?=[\s,{])/gm) || [])
    .every((s) => hoverNames.includes(s.slice(1).replace(/\s+$/, ''))),
  (wxss.match(/^\.blk-[a-z-]*press/gm) || []).join(','))
ok('放大只给图标自己、不给整块（整块会长高，把两枚之间那道 12 的缝吃掉）',
  /\.blk-stat-press \.blk-ic\s*\{[^}]*transform:\s*scale/.test(wxss)
  && !/\.blk-stat-press\s*\{[^}]*transform/.test(wxss))

/* ---------- 9. 组顶那道 min() 的常数与两头同源 ---------- */
const sBlk = seg('.home-blk')
const GROUP_H = num(seg('.tips'), 'height') + num(seg('.tips'), 'margin-bottom') + PERSON_H
// 底栏占的那一段 = 它自己那条 height ＋ 它离底那条 bottom，两个都从底栏那一份样式表现读。
const sTab = seg2(tabWxss, '.tab-bar')
const TAB_H = num(sTab, 'height') + num(sTab, 'bottom')
function seg2(src, sel) {
  const m = new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(src)
  return m ? m[1] : ''
}
ok('整组高 394（Tips 74 ＋ 它下面 12 ＋ 左块 308）', GROUP_H === 394, `${GROUP_H}`)
ok('底栏占的那一段从底栏自己那一份现读（128 = 108 高 ＋ 20 离底）', TAB_H === 128, `${TAB_H}`)
ok('min() 里那个夹值是推出来的、不是拍的：整组 ＋ 底栏 ＋ 最少留白 24',
  /min\(66\.3%,\s*calc\(100vh - (\d+)rpx\)\)/.test(sBlk)
  && parseInt(/min\(66\.3%,\s*calc\(100vh - (\d+)rpx\)\)/.exec(sBlk)[1], 10) === GROUP_H + TAB_H + 24,
  `整组 ${GROUP_H} ＋ 底栏 ${TAB_H} ＋ 留白 24 = ${GROUP_H + TAB_H + 24}`)
ok('min() 之前留了一行不带函数的退路（老安卓不认 min() 时不许塌成写死）',
  (sBlk.match(/top:\s*66\.3%/) || []).length >= 1 && /top:\s*min\(/.test(sBlk))

/* ---------- 10. 字典 ---------- */
ok('左块那句中英各一份（zh 换成「记下来」，en 本来就是同一句，不许有一边空着）',
  zh.barIdle === '记下来' && en.barIdle === 'Jot it down')
ok('两枚计数的标签成对（statNotes／statCards），且不借名片那一格的 slotCard',
  !!zh.statNotes && !!zh.statCards && !!en.statNotes && !!en.statCards
  && /t\.statNotes/.test(wxml) && /t\.statCards/.test(wxml) && !/t\.slotCard/.test(wxml))
ok('模式那一行吃现网三个标签，不新造叫法',
  /t\.modePhoto.*t\.modeUrl.*t\.modeWrite/.test(wxml.replace(/\s+/g, '')))
// 三块都是"整块可点"的入口，markup 上没有文字之外的可读名字（数字在 blk-n 里，读屏只念数字）。
// 10-10 拍板补 role="button" + aria-label，词**全部复用屏上已有的字典键**，不另编一句（同 :30/:34
// 那两枚 lang-seg 的先例）。这里钉的是"三块都挂了、且挂的是那两个键"，不是钉某句中文。
const ariaBlocks = (wxml.match(/class="(?:blk-person|blk-stat blk-stat-\w+)"[^>]*>/g) || [])
ok('三块每枚都挂了 role="button" + aria-label（读屏念的是「12 笔记」这一句，不只念一个数）',
  ariaBlocks.length === 3 && ariaBlocks.every((t) => /role="button"/.test(t) && /aria-label="\{\{/.test(t)),
  `${ariaBlocks.length} 枚`)
ok('两枚计数的 aria-label 是「数字＋那一格的名字」拼出来的，不借屏外新词',
  /aria-label="\{\{noteCount\}\}\{\{t\.statNotes\}\}"/.test(wxml)
  && /aria-label="\{\{cardCount\}\}\{\{t\.statCards\}\}"/.test(wxml))
ok('左块那句吃 t.barIdle（屏上写的和读屏念的同一句，不许两份真相）',
  /class="blk-person" role="button" aria-label="\{\{t\.barIdle\}\}"/.test(wxml))
ok('中英键数相等', Object.keys(zh).length === Object.keys(en).length,
  `${Object.keys(zh).length} vs ${Object.keys(en).length}`)
// 旧胶囊那句撤干净没有，要扫整个 miniprogram 目录（不止这一页：别处也可能还写着那句）。
// 早先这里写成 fs.readFileSync(<目录>)，那是 EISDIR——抛出去之前整把尺子一条都不落地。
const sweep = (dir, out = []) => {
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
