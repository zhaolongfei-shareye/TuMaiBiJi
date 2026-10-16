// 一把静态尺子：五档彩色毛玻璃（「心情」那一档）。不连模拟器，纯读文件＋现编色板。
// 跑法：node docs/工具/验-五档彩色玻璃.js
//
// 需求正本＝站长 10-14 两句原话：
//   「四种界面配色（加上目前深色面板），改为不同颜色的毛玻璃，参考其他AI生成的效果图，
//    下方的tab也与上面的同步，其他页面有涉及毛玻璃的也用相同的颜色面板。同步修改。
//    设置里面的风格入口隐藏。切换毛玻璃改到，首页 增加一个入口"换心情" icon是小云朵。每次点击切换一种。」
// 参考图三张：`docs/design/毛玻璃参考图三张/`（同一版首页布局，只差面板那一层的颜色）。
//
// 这一把管四件事，每件都对应一种"屏上看不出来的静默失效"：
// ① **镜像**：`app.wxss` 那五块 `.mood-*` 必须逐字等于 `palette.moodVars()` 的输出。
//    哪天改了色板忘了改 CSS（或反过来），屏上只有那一档下颜色不对，四档里挑出来极难。
// ② **零回归**：墨那一档（默认）展开出来的九枚玻璃数必须与 `page{}` 那份兜底逐字相同。
//    ⚠ 底栏不在这一条里了——站长 10-14 19:3x 追了一句「换成彩色玻璃后，底部的 tab 要跟随上面的玻璃」，
//    所以墨档底栏**也跟着换成玻璃**（rgba(35,37,44,.62)＋糊），默认那一屏这一处是他指的改动。
//    ⚠ 10-15 拍甲之后**投影那两枚也不在这条里**（墨档 α 抬到 .42，兜底留 .16），
//      顶上那一条（原生导航条）也一样：默认态的面值从壁纸底色换成 #23252C，这两处都是他指着的改动。
// ③ **α 不许跟着色一起动**：透明度那几档（.30/.60/.50/.20/.72/.42/.16→.94→.95/七档渐变）
//    是他 10-11～10-13 逐条拍的，这一轮换的只有色相。所以每档都按同一架 α 梯子核。
// ④ **入口只有一处**：首页那枚「换心情」在、设置里「外观设置」那一格不在（隐藏不是删能力）。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const FILES = {
  app: 'miniprogram/app.wxss',
  palette: 'miniprogram/utils/palette.js',
  appjs: 'miniprogram/app.js',
  createWxss: 'miniprogram/pages/create/create.wxss',
  ixWxss: 'miniprogram/pages/index/index.wxss',
  meWxss: 'miniprogram/pages/me/me.wxss',
  createWxml: 'miniprogram/pages/create/create.wxml',
  createJs: 'miniprogram/pages/create/create.js',
  meWxml: 'miniprogram/pages/me/me.wxml',
  tabJs: 'miniprogram/custom-tab-bar/index.js',
  tabWxss: 'miniprogram/custom-tab-bar/index.wxss',
  i18n: 'miniprogram/utils/i18n.js',
}

// 色板现编一份：刀要改的就是这份真身，`require` 的缓存拿不到变异体（同 验-列表层底色.js 那条）。
const compile = (src) => {
  const m = { exports: {} }
  new Function('module', 'exports', 'require', '__dirname', src)(
    m, m.exports, require, path.join(ROOT, 'miniprogram/utils'))
  return m.exports
}

// 比较色值前只归一空格与大小写——归一是排版，不是色值本身。
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase()
const blockOf = (src, sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`).exec(src)
  return m ? m[1] : ''
}
// 同一个选择器在一份 wxss 里可以有**好几块**（CSS 是叠加生效的）。10-16 那一趟把五枚别名
// 抬到 `.container`，于是新建那一屏多出一块只管令牌的 `.container {}`，排在带 `padding-top: 0`
// 那块之前——只取第一块的读法当场把"顶内缩收到 0"读成"没有这一行"（红的是尺子，不是屏）。
const blocksOf = (src, sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`, 'g')
  let m, all = ''
  while ((m = re.exec(src))) all += m[1] + '\n'
  return all
}
/* 先把注释剥掉再按行取声明：这些块里大量声明的上一行是注释（以 `星号斜杠` 结尾），
   拿 `(?:^|;)` 当锚就会漏掉"紧跟在注释后面的那一枚"——第一版正是这样把四枚玻璃令牌
   读成 null，看着像"page{} 里没有"，其实是解析器没剥注释。 */
const declOf = (block, name) => {
  const code = String(block || '').replace(/\/\*[\s\S]*?\*\//g, '')
  const m = new RegExp(`^\\s*${name}:\\s*([^;]*);`, 'm').exec(code)
  return m ? m[1].trim() : null
}
const alphaOf = (v) => { const m = /,\s*([\d.]+)\s*\)$/.exec(String(v || '')); return m ? Number(m[1]) : null }
const rgbOf = (v) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(v || '')); return m ? [+m[1], +m[2], +m[3]] : null }

// 半透明字要先按实际底色混成实心再算对比（alpha 不落地就是假数——10-09 那条"混成实心"同理会骗人）。
const overHex = (fg, bgHex) => {
  const n = rgbOf(fg) || (/^#[0-9a-f]{6}$/i.test(fg || '') ? [1, 2, 3].map((i) => parseInt(fg.slice(1 + i * 2, 3 + i * 2), 16)) : null)
  if (!n) return null
  const a = /rgba/.test(fg) ? alphaOf(fg) : 1
  const b = rgbOf('#' + bgHex.slice(1)) || [0, 0, 0]
  const bg2 = '#' + [0, 1, 2].map((i) => Math.round(n[i] * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join('')
  return bg2
}

function evaluate(S) {
  const P = compile(S.palette)
  const out = []
  const ck = (name, cond, got) => out.push({ name, ok: !!cond, got })
  const V = (key) => P.moodVars(key)

  /* ---------- ① 色板那一头 ---------- */
  ck('MOODS 是五档（四种界面配色＋目前深色面板）', P.MOODS.length === 5, P.MOODS.length)
  ck('五枚 key 不重、五枚 cls 不重', new Set(P.MOODS.map((m) => m.key)).size === 5
    && new Set(P.MOODS.map((m) => m.cls)).size === 5)
  ck('第一档就是"目前深色面板"（默认态＝今天那一屏）', P.MOODS[0].key === 'ink' && P.MOODS[0].glass === '#23252C', P.MOODS[0].glass)
  ck('其余四档各自钉着一套壁纸，且那四套正好是 THEMES 那四枚', (() => {
    const keys = P.MOODS.slice(1).map((m) => m.theme)
    return JSON.stringify(keys.slice().sort()) === JSON.stringify(P.THEMES.map((t) => t.key).sort())
  })(), P.MOODS.map((m) => m.theme).join('/'))
  ck('脏值（别的版本写过的 key、本机读不到的数）落回第一档', P.moodOf('nope').key === 'ink' && P.moodOf('').key === 'ink')
  ck('点五次回到原点（"每次点击切换一种"是一圈，不是走到头就死）', (() => {
    let k = ''
    for (let i = 0; i < 5; i++) k = P.moodNext(k).key
    return k === 'ink'
  })())
  ck('五档玻璃色互不相同（"不同颜色的毛玻璃"这件事真的成立）', (() => {
    const g = P.MOODS.map((m) => m.glass)
    return new Set(g).size === 5
  })(), P.MOODS.map((m) => m.glass).join(' '))
  /* 参考图那三个数钉死：这一档的色不是审美值，是量出来的。谁哪天换成"看着更好看"的数，这条先红。 */
  const REF = { ivory: ['#B1A299', '#8D7564'], mist: ['#A4B0C0', '#6D8DAA'], blush: ['#B5A8BF', '#9E95B0'] }
  Object.keys(REF).forEach((k) => ck(`参考图现量值钉住：${k} 的玻璃／底带＝${REF[k].join('／')}`,
    P.MOODS.filter((m) => m.key === k)[0].glass === REF[k][0]
    && P.MOODS.filter((m) => m.key === k)[0].band === REF[k][1]))
  ck('天青那一档没有参考图，源码里写明"是我推的、他没拍过"',
    /天青那一档参考图里没有/.test(S.palette) && /他没拍过/.test(S.palette))

  /* ---------- ② α 梯子：五档必须同一架 ---------- */
  const LADDER = {
    '--glass-veil': 0.30, '--glass-veil-band': 0.60, '--glass-plate': 0.50, '--glass-fill': 0.20,
    '--glass-plate-dock': 0.72, '--glass-fill-dock': 0.42,
    '--stage-ink-strong': 0.96, '--stage-ink': 0.85, '--stage-ink-soft': 0.78, '--stage-ink-faint': 0.56,
  }
  P.MOODS.forEach((m) => {
    const v = V(m.key)
    const off = Object.keys(LADDER).filter((k) => alphaOf(v[k]) !== LADDER[k])
    ck(`${m.key}：十枚 α 与他拍过的那一架逐档相同`, off.length === 0, off.join(',') || '齐')
    const face = (v['--stage-face'].match(/,\s*([\d.]+)\s*\)/g) || []).map((t) => Number(/([\d.]+)\s*\)/.exec(t)[1]))
    ck(`${m.key}：面板那一整面仍是 .16→.94→.95（10-13 两刀收出来的那一档，10-14 并成一条渐变）`,
      JSON.stringify(face) === JSON.stringify([0.16, 0.94, 0.95, 0.95]), face.join('→'))
    /* 首屏那一行的底必须与面板**同一条坡、反着走**——站长 10-14 23:5x「与下方的面板渐变方向相反。浅在下，深在上」，
       10-15 00:2x 附真机截图追「渐变的程度，要与下方面板一样，现在根本不是，太暗了…会浅一点，露出的透多一点」。
       上面那条"五块逐字等于 moodVars()"只比 `app.wxss` 与色板是否一致，**色板里写成什么它都绿**；
       所以这一条钉的是坡本身：① 端点＝面板那两个 α（.94 与 .16）反序；② 只有首尾两个停点＝一条连续的坡，
       **不许有实心平台**（上一版把面板底部那 43.8% 的实心地板一起镜像到顶上，屏上就是一整块黑板，就是他打的回）。 */
    const strip = (v['--stage-strip'].match(/,\s*([\d.]+)\s*\)/g) || []).map((t) => Number(/([\d.]+)\s*\)/.exec(t)[1]))
    const stripStops = (v['--stage-strip'].match(/[\d.]+(?=%)/g) || []).map(Number)
    const mono = strip.every((a, i) => i === 0 || a < strip[i - 1])
    ck(`${m.key}：首屏那一行与面板同一条坡反着走（首档＝面板的 .94、末档＝面板的 .16、α 一路往下＝没有实心平台）`,
      strip[0] === face[1] && strip[strip.length - 1] === face[0] && mono
      && stripStops[0] === 0 && stripStops[stripStops.length - 1] === 100,
      `α ${strip.join('→')}／停点 ${stripStops.join(' ')}（面板 ${face.join('→')}）`)
    const cnt = (v['--blk-count-bg'].match(/,\s*([\d.]+)\s*\)/g) || []).map((t) => Number(/([\d.]+)\s*\)/.exec(t)[1]))
    ck(`${m.key}：左下那一格仍是那七个停点的 α（10-13「黑底的半透明渐变效果不好」那一版）`,
      JSON.stringify(cnt) === JSON.stringify([0.45, 0.45, 0.38, 0.35, 0.50, 0.68, 0.92]), cnt.join('/'))
  })
  /* 压在玻璃上的字读不读得出来：拿"面板实心那一档"当底（.95 的玻璃），五档各算一次。 */
  P.MOODS.forEach((m) => {
    const face = '#' + rgbOf(V(m.key)['--stage-face']).map((x) => x.toString(16).padStart(2, '0')).join('')
    const cr = P.crOf(overHex(V(m.key)['--stage-ink-strong'], face) || '', face)
    const crSolid = P.crOf(V(m.key)['--stage-ink-solid'], face)
    ck(`${m.key}：面板上的字压得住这一档的玻璃（强档与实心档都 ≥4.5）`, cr >= 4.5 && crSolid >= 4.5,
      `${cr.toFixed(2)}／${crSolid.toFixed(2)} 底 ${face}`)
  })

  /* ---------- ②′ 首屏那一行的皮：五条写在 create.wxss 里的硬约束（真跑那把读不动的这几枚） ----------
     站长 10-14 22:4x→10-15 00:2x 四句都落在这枚 `.ai-line` 上。真跑那把（`验-第一屏三块-真跑`）
     量的是"渲染层读不读得回来"，而 `white-space` 这一档 devtools 实测**永远回 null**（量法本身撑不住），
     所以这一枚的几何与折行改由这把逐字钉。 */
  const AILINE = blockOf(S.createWxss, '.ai-line')
  ck('首屏那一行：不许折行（white-space:nowrap 在 `.ai-line .ai-text` 那一条里）',
    /\.ai-text\s*\{[^}]*white-space:\s*nowrap/.test(S.createWxss))
  ck('首屏那一行：顶上去（`margin` 的第一档＝上外边距是 0，也不许另写 `margin-top`）',
    /margin:\s*0(\s|;)/.test(AILINE) && !/margin-top\s*:/.test(AILINE),
    (/margin:[^;]*/.exec(AILINE) || ['(没写 margin)'])[0])
  ck('首屏那一行：通栏靠负掉容器那一口内缩（`calc(0px - var(--sp-3))` 在，不是写死的 -24rpx）',
    /margin:[^;]*calc\(0px\s*-\s*var\(--sp-3\)\)/.test(AILINE))
  // 半径这一档 10-16 起钉的是**写法**（吃令牌）而不是字面量 `40rpx`：那一枚全站只在 `page{}` 定义一次，
  // 值仍是同一个 40rpx ⇒ 换成令牌零像素变化，但反过来若有人把数抄回样式表，这一条会红（与上面那枚
  // `box-shadow: var(--sh-drop)` 同一条规矩）。展开后仍比一次实际值，防"令牌名对了、值被人改过"。
  const R_CARD = (declOf(blockOf(S.app, 'page'), '--r-card') || '').trim()
  const cornersOf = (blk) => ((/border-radius:\s*([^;]*)/.exec(blk) || [, ''])[1]).trim().split(/\s+/)
  const expands = (c) => {
    const m = /^var\((--[\w-]+)\)$/.exec(c)
    return m ? (declOf(blockOf(S.app, 'page'), m[1]) || '〈令牌不存在〉').trim() : c
  }
  const AI_RAW = cornersOf(AILINE)
  const AI_C = AI_RAW.map(expands)
  const PANEL_C = cornersOf(blockOf(S.createWxss, '.stage-panel')).map(expands)
  ck('首屏那一行：上沿两角方、下沿两角吃全站那一份 `--r-card`（半径不许另抄一个数）',
    AI_RAW.join(' ') === '0 0 var(--r-card) var(--r-card)',
    AI_RAW.join(' ') || '(没写 border-radius)')
  ck('首屏那一行与面板那枚是同一个半径的镜像（上圆下方 ↔ 下方上圆，两个数都从令牌展开后比）',
    AI_C.length === 4 && PANEL_C.length === 4
    && AI_C.every((c, i) => c === PANEL_C[3 - i])
    && AI_C[2] === R_CARD && AI_C[0] === '0' && R_CARD === '40rpx',
    `.ai-line[${AI_C.join(' ')}] ↔ 面板[${PANEL_C.join(' ')}]，令牌＝${R_CARD || '(读不到)'}`)
  ck('首屏那一行：阴影吃 `var(--sh-drop)`（不抄字面量，全站一份值那条规矩）',
    /box-shadow:\s*var\(--sh-drop\)/.test(AILINE))
  ck('首屏那一行：滤镜两条成对（iOS 的 WKWebView 只认 -webkit- 那一行）',
    /backdrop-filter:\s*blur\(30px\)\s*saturate\(1\.15\)/.test(AILINE)
    && /-webkit-backdrop-filter:\s*blur\(30px\)\s*saturate\(1\.15\)/.test(AILINE))
  const pad = (/padding:\s*([\d.]+)rpx\s+var\(--sp-3\)\s+([\d.]+)rpx/.exec(AILINE) || []).slice(1).map(Number)
  const bandH = (pad[0] || 0) + 24 * 1.35 + (pad[1] || 0)
  ck('首屏那一行只有一行字那么高（整枚 ≤96rpx——00:3x「高度压缩，看到一行文字就行了，不要浪费空间」；⚠ 阈值 96 是我按"一行字＋一段淡出"定的，他没给数）',
    pad.length === 2 && bandH <= 96, `上 ${pad[0]}＋字 32.4＋下 ${pad[1]} ＝ ${bandH.toFixed(1)}rpx`)
  /* ---------- ②″ 面板与背景之间那一条投影（10-15 拍甲进五档 → 17:3x 又打回"不许开特例"） ----------
     他先说「默认黑色的两个面板，好像没做阴影」，我给的解法是**只抬墨档那一枚 α**（.16→.42）；
     真机两张图一来，他那句是「墨档的阴影过黑，与其他色的阴影不一致。你的算法不一样吗？」
     ——是，那一版给的就是两个数。现在回到**全站一枚 .16，五档谁都不特殊**：同一枚 α 压在同一支背景上，
     五档压暗的格数本来就相同，这才是"一致"。
     ⚠ 代价钉在这儿，别偷偷改回上一版：墨档那条只有 9.8 格，正是他 14:5x 说"没做阴影"的那个读数。
        真要抬，这一把只允许一种抬法——**六份（`page{}` 兜底＋五块心情）一起抬成同一个数**。
     四件事：① 字面量只住在 `app.wxss`（两枚令牌各六份，少一份＝那一档悄悄掉回兜底）；
     ② 每块里 `--sh-drop` 是同块 `--sh-lift` 的镜像（只有纵向偏移取反）；
     ③ **六份的 α 全等于 .16**，哪一档单独抬／单独降都红；
     ④ 几何那半（`0 ±12rpx 28rpx`）与色底（18,20,26）十二处一个数不许动：10-14「高度全局一致」。 */
  const SH = { '--sh-lift': '0 -12rpx 28rpx', '--sh-drop': '0 12rpx 28rpx' }
  const SH_SEL = ['page'].concat(P.MOODS.map((m) => '.' + m.cls))
  const SH_A = 0.16
  /* 形状拆成"几何"与"色底"两段，α 由 `alphaOf` 另取：这样"改了 α"与"改了偏移／换了色底"各红各的，
     不会合成一条读不出来的读数。写不进这个形状的值（比如 `0 -20rpx`）算几何红，不当"没定义"。 */
  const shParts = (v) => {
    const m = /^(0 -?\d+rpx \d+rpx) rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/
      .exec(String(v == null ? '' : v).replace(/\s+/g, ' ').trim())
    return m ? { geo: m[1], rgb: `${m[2]},${m[3]},${m[4]}`, a: Number(m[5]) } : null
  }
  const shDecl = (sel, tok) => declOf(blockOf(S.app, sel), tok)
  const shRead = (sel, tok) => shParts(shDecl(sel, tok))
  Object.keys(SH).forEach((tok) => {
    const miss = SH_SEL.filter((sel) => shDecl(sel, tok) === null)
    ck(`${tok} 六份都在（page 兜底＋五块心情），少一份就是那一档悄悄掉回兜底而屏上看不出来`,
      miss.length === 0 && (S.app.match(new RegExp(`${tok}:`, 'g')) || []).length === 6,
      `缺 ${miss.join(',') || '无'}／共 ${(S.app.match(new RegExp(`${tok}:`, 'g')) || []).length} 份`)
    const bad = SH_SEL.filter((sel) => {
      const p = shRead(sel, tok)
      return !p || p.geo !== SH[tok] || p.rgb !== '18,20,26'
    })
    ck(`${tok} 的几何与色底六处一个数不许动（只许动 α——10-14「高度全局一致」钉的就是它）`, bad.length === 0,
      bad.map((sel) => `${sel}=${shDecl(sel, tok)}`).join(' ') || `${SH[tok]} rgba(18,20,26,·)`)
  })
  ck('每一块里 `--sh-drop` 都是同块 `--sh-lift` 的镜像（只有纵向偏移取反；偏移没取反＝一枚假令牌，首屏那条读成"浮在导航条上"）',
    SH_SEL.every((sel) => {
      const l = shDecl(sel, '--sh-lift'), d = shDecl(sel, '--sh-drop')
      return !!l && !!d && norm(d) === norm(l.replace('0 -12rpx', '0 12rpx'))
    }), SH_SEL.map((sel) => `${sel}:${shDecl(sel, '--sh-drop') || '(无)'}`).join(' ').slice(0, 90))
  ck('六份的 α 全等于 .16——**任何一档单独抬或单独降都红**（10-15 17:3x 他打回的就是我给墨档开的那个 .42 特例）',
    SH_SEL.every((sel) => ['--sh-lift', '--sh-drop']
      .every((t) => (shRead(sel, t) || {}).a === SH_A)),
    SH_SEL.map((sel) => `${sel.replace('.', '')}:${(shRead(sel, '--sh-lift') || {}).a}`).join(' '))
  ck('色板那两枚与 CSS 同档同 α（正本只有 `moodVars` 一份，CSS 是镜像）',
    P.MOODS.every((m) => ['--sh-lift', '--sh-drop']
      .every((t) => norm(V(m.key)[t]) === norm(declOf(blockOf(S.app, '.' + m.cls), t)))))

  /* ---------- ②‴ 顶上那一条（原生导航条）跟着心情走（站长 10-15 拍甲：有图没图都跟） ----------
     原来两套真相：`applyTheme` 吃 `theme.page`（四套壁纸全是浅色 ⇒ 没铺图的页顶上永远一条浅），
     铺图那三页另由 `applyNavForBand` 发两枚写死的 `#f2efe9`／`#181a20` ⇒ 同一条栏两深一浅，
     就是他今天那句「最顶上的色块…依据什么，我看有些是黑底，有些是白底」。这一刀合成一个出口，
     值只剩"当前那一档心情"一处。 */
  ck('导航条全站只有一个出口：`app.js` 里 `setNavigationBarColor` 只出现一次，面与字都取自 `navFor(当前心情)`',
    (S.appjs.match(/setNavigationBarColor/g) || []).length === 1
    && /const nav = navFor\(this\.glassMood\(\)\.key\)/.test(S.appjs)
    && /backgroundColor:\s*nav\.face/.test(S.appjs) && /frontColor:\s*nav\.front/.test(S.appjs),
    `出现 ${(S.appjs.match(/setNavigationBarColor/g) || []).length} 次`)
  // 10-15 这一轮我自己踩中的一条：`navFor` 用了却没进解构名单 ⇒ applyNav 一调就 ReferenceError，
  // 顶上那条一动不动，而静态色板与 CSS 全绿。这类"用了没引"只能单独钉。
  ck('`navFor` 已在 app.js 的 require 名单里（漏一行＝ReferenceError，导航条停在默认色）',
    /const \{[^}]*\bnavFor\b[^}]*\} = require\('\.\/utils\/palette'\)/.test(S.appjs),
    (/const \{[^}]*\} = require\('\.\/utils\/palette'\)/.exec(S.appjs) || ['(没读到名单)'])[0].slice(0, 60))
  ck('`applyNavForBand` 那一支删净了（声明与调用都不许在；注释里提到它不算残留）',
    !/applyNavForBand\s*\(/.test(S.appjs) && !/applyNavForBand\s*\(/.test(S.createJs),
    (S.appjs.match(/.{0,12}applyNavForBand\s*\(.{0,12}/g) || []).join(' | '))
  ck('五档的导航条面值＝五档面板那支玻璃本色，且互不相同（整屏从上到下同族）',
    P.MOODS.every((m) => P.navFor(m.key).face === m.glass)
    && new Set(P.MOODS.map((m) => P.navFor(m.key).face)).size === 5,
    P.MOODS.map((m) => P.navFor(m.key).face).join(' '))
  ck('墨档白字、其余四档黑字，且 frontColor 只用微信认的那两枚（写别的会被静默丢掉）',
    P.navFor('ink').front === '#ffffff' && P.MOODS.slice(1).every((m) => P.navFor(m.key).front === '#000000'),
    P.MOODS.map((m) => `${m.key}:${P.navFor(m.key).front}`).join(' '))
  /* ⚠ 墨档（＝没点过心情的默认态）导航条**不在下面③"零回归"那一组里**：面值从壁纸底色换成
     #23252C、字换成白，这是"顶上的色块跟毛玻璃色阶同步"这句的直接结果，不是漏改。
     谁要把导航条扩进③，先红在这里。 */
  ck('墨档导航条那一面就是墨档玻璃本色 #23252C（默认态跟着换＝他这一刀要的，不许当成回归改回去）',
    P.navFor('ink').face === '#23252C', P.navFor('ink').face)
  /* 导航条翻深之后带出来的第二条（站长 10-15 真机两张图：「为什么顶部有条线，要去掉」）：
     app.wxss 的 `.container { padding: 2rpx var(--sp-3) 0 }` 顶部那一档不是间距，是堵外边距穿透的，
     它露出来的是**容器自己那支底色**——浅色导航条底下看不出来，深色底下就是一条亮带。
     拿他那张原图量过：亮带正好 3 设备像素 ÷ 1.488 ＝ 2rpx，落点 y274（导航条 37／亮带 230／条面 48）。
     笔记页与「我的」页 10-04 为同一条线各自把容器 `padding: 0` 收过（`验-我的页改版-真跑` 钉着），
     这一屏当时没轮到 ⇒ 三个 tab 现在必须都收到 0，写法两样（简写 0 或 `padding-top: 0`）都算。 */
  const TOP_INSET = [
    ['新建', S.createWxss], ['笔记', S.ixWxss], ['「我的」', S.meWxss],
  ].map(([label, src]) => {
    const b = blocksOf(src.replace(/\/\*[\s\S]*?\*\//g, ''), '.container')
    const short = (/padding:\s*([^;]*);/.exec(b) || [])[1]
    const top = (/padding-top:\s*([^;]*);/.exec(b) || [])[1]
    const zero = (v) => v !== undefined && v.trim().split(/\s+/).every((n) => /^0/.test(n))
    return { label, got: `padding:${short === undefined ? '—' : short}／padding-top:${top === undefined ? '—' : top}`, ok: zero(top) || zero(short) }
  })
  TOP_INSET.forEach((t) => ck(`${t.label}那一屏：容器顶内缩收到 0（深色导航条底下那条 2rpx 亮带就是这么来的）`,
    t.ok, t.got))

  /* ---------- ③ 零回归：墨档 == 今天 ---------- */
  const PAGE = blockOf(S.app, 'page')
  const INK = V('ink')
  ;['--glass-veil', '--glass-veil-band', '--glass-plate', '--glass-fill'].forEach((k) =>
    ck(`${k}：墨档那份与 page{} 兜底逐字相同（默认态零变化的证据）`, norm(INK[k]) === norm(declOf(PAGE, k)),
      `page=${declOf(PAGE, k)}／ink=${INK[k]}`))
  ck('page{} 那五枚玻璃原值一个没动（兜底还在，缺类也不花）',
    /--glass-hair:\s*rgba\(255, 255, 255, 0\.55\)/.test(PAGE) && /--glass-bf:\s*blur\(23px\) saturate\(1\.8\)/.test(PAGE))
  ck('五档底栏都是 `rgba(这一档的玻璃色, .62)`（**含墨档**——他这句「底部的 tab 要跟随上面的玻璃」指的是五档）',
    P.MOODS.every((m) => {
      const g = m.glass.replace('#', '')
      const rgb = [0, 1, 2].map((i) => parseInt(g.substr(i * 2, 2), 16))
      return P.moodChromeOf(m.key).bg === `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.62)`
    }), P.MOODS.map((m) => `${m.key} ${P.moodChromeOf(m.key).bg}`).join(' / '))
  // 10-14 19:3x 他追那一句之前，这一条钉的是反面（"墨档 = chromeOf 原样，只多一 --chrome-blur:none"）。
  // 撤一个状态会作废一批判据：换的是这条判据，不是拿代码去迁就旧尺子。
  ck('墨档底栏不再是壁纸派生那支实心（谁把 `chromeOf` 塞回墨档谁红）',
    P.moodChromeOf('ink').bg !== P.chromeOf('tint-paper').bg,
    `${P.moodChromeOf('ink').bg} vs ${P.chromeOf('tint-paper').bg}`)
  ck('五档底栏那块圆底都仍是 chromeOf 算的那一支（只转发、不另算；站长 10-04 那条"深色按钮＝底栏选中那枚圆底"不在这一刀里）',
    P.MOODS.every((m) => P.moodChromeOf(m.key).sel === P.chromeOf(m.theme).sel))
  ck('每一档都发同一支 --chrome-blur：少一枚就是 IACVT，那条 backdrop-filter 整行掉下来',
    P.MOODS.every((m) => /--chrome-blur:blur\(23px\) saturate\(1\.8\)/.test(P.moodChromeOf(m.key).style)))

  /* ---------- ④ CSS 镜像 ---------- */
  const pos = P.MOODS.map((m) => S.app.indexOf('.' + m.cls + ' {'))
  ck('五块 `.mood-*` 都在 app.wxss 里', pos.every((p) => p > 0), pos.join(','))
  ck('五块排在四块 `.theme-*` 之后（同档 specificity，源码顺序决定谁赢）',
    S.app.indexOf('.theme-blue {') < Math.min(...pos.filter((p) => p > 0)))
  P.MOODS.forEach((m) => {
    const blk = blockOf(S.app, '.' + m.cls)
    const v = V(m.key)
    const diff = Object.keys(v).filter((k) => norm(declOf(blk, k)) !== norm(v[k]))
    const extra = (blk.match(/--[\w-]+\s*:/g) || []).map((s) => s.replace(':', '').trim()).filter((k) => !(k in v))
    ck(`${m.cls} 与 moodVars 逐字等值（少一枚、多一枚、值漂一格都算）`,
      Object.keys(v).every((k) => declOf(blk, k) !== null) && diff.length === 0 && extra.length === 0,
      `缺/错 ${diff.join(',')}　多 ${extra.join(',')}`)
  })
  ck('create.wxss 里那六处引用都在（面板那一整面两态各一条、左下一格、四档字色）',
    ['--stage-face', '--stage-face-open', '--blk-count-bg', '--stage-ink-solid', '--stage-ink-strong', '--stage-ink-dim']
      .every((k) => new RegExp(`var\\(${k}\\)`).test(S.createWxss)))
  /* 站长 10-14 19:3x「还有黑色面板中间多了条线，其他色都没有，检查去掉」——根因那一层：
     面板原来是**两枚并排的层**（`::before` 高 240rpx ＋ `::after` 从 240rpx 起），交界落在面板正中，
     模拟器把两枚层各自贴到设备像素 ⇒ 那一行少铺一点 ⇒ 透出后面的糊面，读成一条亮线。
     挪 `::after` 的 top 那条线跟着挪（实测 y1287→y1248），所以这一处钉的是**结构**：只许一层铺满。
     停点那两枚百分比从 create.wxss 现读的两个数算（顶线 548、展开 666），不在这把尺子里抄第二份。
     ⚠ 下面这几条一律读剥过注释的 `CSS`：拿原文读，我自己写的那段说明里有令牌名，会假绿。 */
  const CSS = S.createWxss.replace(/\/\*[\s\S]*?\*\//g, '')
  ck('create.wxss 里那六处引用都在（面板那一整面两态各一条、左下一格、四档字色）',
    ['--stage-face', '--stage-face-open', '--blk-count-bg', '--stage-ink-solid', '--stage-ink-strong', '--stage-ink-dim']
      .every((k) => new RegExp(`var\\(${k}\\)`).test(CSS)))
  const before = blockOf(CSS, '.stage-panel::before')
  ck('`.stage-panel::before` 一层铺满（top:0 且 bottom:0，不许再写 height:240rpx 只盖上面那截）',
      /top:\s*0\s*;/.test(before) && /bottom:\s*0\s*;/.test(before) && !/height:/.test(before), before.replace(/\s+/g, ' ').slice(0, 90))
  ck('`.stage-panel::after` 这一枚整个撤掉（两枚层并排＝中间那条线会长回来）',
      !/\.stage-panel::after\s*\{/.test(CSS))
  const TOP = Number(/\.stage-panel \{[^}]*?top: calc\(100vh - (\d+)rpx\)/.exec(CSS)[1])
  const OPEN = Number(/\.container\.dock-open \.stage-panel \{[^}]*?top: calc\(100vh - (\d+)rpx\)/.exec(CSS)[1])
  const pctOf = (tok) => Number(/0\.94\) ([\d.]+)%/.exec(V('ink')[tok])[1])
  ck('带高仍是 240rpx：闭合那一档的停点＝240/顶线，展开那一档＝240/666（改了面板高就得跟着改）',
      Math.abs(pctOf('--stage-face') - 240 / TOP * 100) < 0.1 && Math.abs(pctOf('--stage-face-open') - 240 / OPEN * 100) < 0.1,
      `${pctOf('--stage-face')}% vs ${TOP}／${pctOf('--stage-face-open')}% vs ${OPEN}`)
  ck('两态各发一条渐变（展开那一档不换停点，带就会跟着面板长到 292rpx）',
      /background: var\(--stage-face\)/.test(before)
      && /container\.dock-open \.stage-panel::before \{[^}]*background: var\(--stage-face-open\)/.test(CSS))
  // 它 10-14 19:3x 那句里的"线"还有一处候选：`.blk-count` 上沿那枚白色 inset 高光（我从效果图抄进来的
  // 装饰）。它压在墨档深底上落差 42.7、压在彩色四档浅底上只有 15～17 ⇒ 只有黑色那一档看得见。撤了。
  ck('`.blk-count` 身上不许有白色 inset 高光（那道 1px 白线只有墨档读得出来）',
    !/\.blk-count\s*\{[^}]*inset[^}]*rgba\(255,\s*255,\s*255/.test(CSS))
  ck('第二屏就地抬那两档发的是 var(--glass-*-dock)（写死白值＝五档同色，D17 甲白落）',
    /--glass-plate:\s*var\(--glass-plate-dock\)/.test(blockOf(S.createWxss, '.container.entry-dock'))
    && /--glass-fill:\s*var\(--glass-fill-dock\)/.test(blockOf(S.createWxss, '.container.entry-dock')))
  ck('底栏那两条滤镜成对（iOS 的 WKWebView 只认 -webkit- 那行）',
    /backdrop-filter:\s*var\(--chrome-blur\)/.test(S.tabWxss)
    && /-webkit-backdrop-filter:\s*var\(--chrome-blur\)/.test(S.tabWxss))

  /* ---------- ⑤ 入口与状态 ---------- */
  ck('首页有「换心情」那一枚：catchtap＋小云朵＋跟着语言的文案',
    /catchtap="onCycleMood"/.test(S.createWxml) && /glyph-cloud/.test(S.createWxml)
    && /\{\{t\.moodSwap\}\}/.test(S.createWxml))
  ck('它是往后加的（调亮度 → 换背景 → 换心情，前面两枚的落点没动）',
    S.createWxml.indexOf('onCycleDim') < S.createWxml.indexOf('goHomeBg')
    && S.createWxml.indexOf('goHomeBg') < S.createWxml.indexOf('onCycleMood'))
  ck('小云朵两条 mask 都写、且挂在共用属性名单里（只写一条＝iPhone 上静默不显形）',
    (S.createWxss.match(/\.glyph-cloud \{[^}]*-webkit-mask-image/g) || []).length === 1
    && /\.glyph-cloud \{[^}]*\n\s*mask-image/.test(S.createWxss)
    && /\.swap-glyph[^}]*\.glyph-cloud|\.glyph-cloud[^}]*\{/.test(S.createWxss.split('\n').find((l) => /blk-plus-glyph, \.mini-glyph/.test(l)) || ''))
  ck('app.js：心情类跟着壁纸一起发在容器上（每一页都走 containerClass，一处改全站）',
    /this\.glassMood\(wallpaper\)\.cls/.test((/containerClass\(wallpaper\)[\s\S]{0,220}/.exec(S.appjs) || [''])[0]))
  ck('app.js：心情先跟壁纸对一次账（本机那档与服务端带回来的壁纸不是同一家族时以壁纸为准）',
    /m\.theme === themeOf\(w\)\.key \? m : moodOfWallpaper\(w\)/.test(S.appjs))
  ck('app.js：cycleGlassMood 从对过账的那一档起（不然壁纸是青的、点一下跳回象牙＋纸底）',
    /moodNext\(this\.glassMood\(\)\.key\)/.test(S.appjs))
  ck('app.js：壁纸在本机留一份缓存（登录没回来时五档才点得动），但服务端那一枚仍排在前面',
    /wx\.setStorageSync\(WALLPAPER_CACHE_KEY, key\)/.test(S.appjs)
    && (() => { const g = (/getWallpaper\(fromServer\)\s*\{([\s\S]{0,240})/.exec(S.appjs) || ['', ''])[1]
      return g.search(/fromServer/) >= 0 && g.includes('WALLPAPER_CACHE_KEY')
        && g.search(/fromServer/) < g.search(/WALLPAPER_CACHE_KEY/) })())
  ck('app.js：cycleGlassMood 一次做齐三件（记档、跟着换壁纸、重算主题）',
    /wx\.setStorageSync\(MOOD_KEY, m\.key\)/.test(S.appjs) && /this\.setWallpaper\(m\.theme\)/.test(S.appjs)
    && /this\.applyTheme\(m\.theme\)/.test(S.appjs))
  ck('首帧占位那一位带 mood-ink（不带＝第一帧没类，落到 page 兜底；带着才是"默认态零变化"）',
    /themeClass: 'theme-tint-paper mood-ink'/.test(S.createJs))
  ck('首页那一枚：只在壁纸真的变了才 PUT，且失败要说一句',
    /if \(after === before\) return/.test(S.createJs) && /api\.updateWallpaper\(after\)/.test(S.createJs)
    && /t\('setFailed'/.test(S.createJs))
  ck('点完底栏跟着重取色（tab 的色由 JS 递，不重推就是上面换了下面没换）',
    /getTabBar\(\)\.applyTheme\(after\)/.test(S.createJs))
  ck('心情这一档只在本机（服务端那一列表达不了"同壁纸两档玻璃"），代价写在注释里',
    /MOOD_KEY = 'glassMood'/.test(S.appjs) && /换手机或重装之后这一档回到默认/.test(S.appjs))
  ck('i18n：moodSwap 中英两份都在，中文三个字',
    /moodSwap: '换心情'/.test(S.i18n) && /moodSwap: 'Mood'/.test(S.i18n))
  /* 「设置里面的风格入口隐藏」——去的是入口，不是能力。 */
  const meLive = S.meWxml.replace(/<!--[\s\S]*?-->/g, '')
  ck('「外观设置」那一格在界面上不再出现（隐藏，不是留着两个入口）',
    !/data-page="wallpaper"/.test(meLive))
  ck('能力没丢：壁纸页与路由都还在，首页那一枚走的是同一条 PUT',
    fs.existsSync(path.join(ROOT, 'miniprogram/pages/wallpaper/wallpaper.js'))
    && /wallpaper: '\/pages\/wallpaper\/wallpaper'/.test(S.appjs.replace(/\s/g, '')
      .replace(/wallpaper:'\/pages\/wallpaper\/wallpaper'/, "wallpaper: '\/pages\/wallpaper\/wallpaper'"))
      || /wallpaper: '\/pages\/wallpaper\/wallpaper'/.test(read('miniprogram/pages/me/me.js')))
  ck('隐藏那一处写明了是谁哪句（可追溯，不是谁顺手删的）',
    /设置里面的风格入口隐藏/.test(S.meWxml) && /切换毛玻璃改到首页/.test(S.meWxml))

  return out
}

/* ---------- 反向自证：每一刀都对应"屏上看不出来的一种静默失效" ---------- */
const KNIVES = [
  ['★删掉 `.mood-blush` 整块（那一档下所有玻璃静默退回 page 兜底＝五档里有一档是白的）', 'app',
    (s) => s.replace(/\.mood-blush \{[^}]*\}/, '')],
  ['★把雨雾那一块的 stage-face 顶档改成 .20（α 梯子被他没拍的那一刀动了）', 'app',
    (s) => s.replace(/(\.mood-mist \{[^}]*?--stage-face: linear-gradient\(180deg, rgba\([^)]*, )0\.16/, '$10.20')],
  ['★把闭合那一档的停点从 43.8% 写成 50%（带高不再是 240rpx，中间那道收口跟着往下漂）', 'palette',
    (s) => s.replace('stageFace(43.8)', 'stageFace(50)')],
  ['★首屏那一行的底写成与面板同向（他那句「浅在下，深在上」整个反了：字压在最淡那一档上）', 'palette',
    (s) => s.replace('${rgba(g, 0.94)} 0%, ${rgba(g, 0.80)} 55%, ${rgba(g, 0.16)} 100%',
      '${rgba(g, 0.16)} 0%, ${rgba(g, 0.80)} 55%, ${rgba(g, 0.94)} 100%')],
  ['★把实心平台加回来（.95 平铺到 56.2% 再掉到 .16＝面板底部那块地板镜像到顶上，就是他 00:2x 打回的那块黑板）', 'palette',
    (s) => s.replace('${rgba(g, 0.94)} 0%, ${rgba(g, 0.80)} 55%, ${rgba(g, 0.16)} 100%',
      '${rgba(g, 0.95)} 0%, ${rgba(g, 0.95)} 56.2%, ${rgba(g, 0.94)} 56.2%, ${rgba(g, 0.16)} 100%')],
  ['★顶档从 .94 抬到 .99（"再深一点更清楚"——首档就不再是面板那个数了，五档一起比面板实）', 'palette',
    (s) => s.replace('${rgba(g, 0.94)} 0%, ${rgba(g, 0.80)} 55%', '${rgba(g, 0.99)} 0%, ${rgba(g, 0.80)} 55%')],
  ['★色板里把樱落那档的玻璃色换成一支"更好看"的（参考图那三个数被换掉）', 'palette',
    (s) => s.replace("glass: '#B5A8BF', band: '#9E95B0'", "glass: '#C0A8C8', band: '#9E95B0'")],
  ['★色板里把墨档的 band 写成面板那支 #23252C（左下那一格与今天差一档）', 'palette',
    (s) => s.replace("glass: '#23252C', band: '#12141A'", "glass: '#23252C', band: '#23252C'")],
  ['★moodChromeOf 里给彩色档另算一支圆底（"深色按钮与底栏选中那枚同色"那条 10-04 的规矩）', 'palette',
    (s) => s.replace('sel: base.sel,', 'sel: hslToHex(0, 40, 40),')],
  ['★把墨档底栏退回壁纸派生那支实心（他 10-14 19:3x 那句「底部的 tab 要跟随上面的玻璃」白落）', 'palette',
    (s) => s.replace('  const rgb = hexToRgb(m.glass)\n  const bg = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.62)`',
      '  if (m.key === \'ink\') return base\n  const rgb = hexToRgb(m.glass)\n  const bg = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.62)`')],
  ['★containerClass 不再发心情类（五块 CSS 变成没人挂的孤儿）', 'appjs',
    (s) => s.replace('this.glassMood(wallpaper).cls, ', '')],
  ['★心情不与壁纸对账（服务端带回青底、本机还留着旧的樱落 ⇒ 青底配一支粉玻璃）', 'appjs',
    (s) => s.replace('return m.theme === themeOf(w).key ? m : moodOfWallpaper(w)', 'return m')],
  ['★换档从一个没对过账的值起（壁纸是青的，点一下跳回象牙＋纸底）', 'appjs',
    (s) => s.replace('moodNext(this.glassMood().key)', 'moodNext(wx.getStorageSync(MOOD_KEY))')],
  ['★壁纸不留本机缓存（登录没回来那一趟，天青／樱落／雨雾三档被对账判成"对不上"⇒ 首页那枚只剩两档能点）', 'appjs',
    (s) => s.replace('    wx.setStorageSync(WALLPAPER_CACHE_KEY, key)\n', '')],
  ['★把缓存排到服务端那一枚前面（换手机后他选的壁纸被本机旧值顶掉，10-04 那条"服务端当家"就翻了）', 'appjs',
    (s) => s.replace("const wanted = fromServer || (this.globalData.userInfo && this.globalData.userInfo.wallpaper)\n      || wx.getStorageSync(WALLPAPER_CACHE_KEY) || 'default'",
      "const wanted = wx.getStorageSync(WALLPAPER_CACHE_KEY) || fromServer || (this.globalData.userInfo && this.globalData.userInfo.wallpaper) || 'default'")],
  ['★cycleGlassMood 不写本机存储（点一下当场变了，重进就回默认）', 'appjs',
    (s) => s.replace('wx.setStorageSync(MOOD_KEY, m.key)', '')],
  ['★create.wxss 那处引用换回写死的墨（这一档下面板还是黑的）', 'createWxss',
    (s) => s.replace('background: var(--stage-face);', 'background: rgba(35, 37, 44, 0.95);')],
  ['★把面板那枚层退回"只盖上面 240rpx"（下面空出来，两枚层并排＝中间那条线长回来）', 'createWxss',
    (s) => s.replace('  top: 0;\n  bottom: 0;\n  background: var(--stage-face);',
      '  top: 0;\n  height: 240rpx;\n  background: var(--stage-face);')],
  ['★把 `.stage-panel::after` 那枚第二层加回来（10-14 那条亮线的原样）', 'createWxss',
    (s) => s.replace('.stage-panel::before {', '.stage-panel::after { content: ""; position: absolute; top: 240rpx; bottom: 0; }\n.stage-panel::before {')],
  ['★展开那一档不换停点（面板长到 666，带跟着长到 292rpx）', 'createWxss',
    (s) => s.replace('.container.dock-open .stage-panel::before {\n  background: var(--stage-face-open);\n}', '')],
  ['★把 `.blk-count` 上沿那道白高光加回来（他 10-14 19:3x 那句"中间多了条线"又长回来一次）', 'createWxss',
    (s) => s.replace('  background: var(--blk-count-bg);',
      '  background: var(--blk-count-bg);\n  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, 0.18);')],
  ['★「外观设置」那一格放回来（同一件事两个入口）', 'meWxml',
    (s) => s.replace('</block>', '<view class="menu-item" bindtap="onNavigate" data-page="wallpaper"><text class="menu-label">x</text></view></block>')],
  ['★首页那枚只换本机、不 PUT 服务端（换台手机就回到旧壁纸，而界面上明明是他选的）', 'createJs',
    (s) => s.replace('api.updateWallpaper(after)', 'Promise.resolve()')],
  ['★i18n 只补中文那一份（英文态那枚按钮是空白）', 'i18n',
    (s) => s.replace("    moodSwap: 'Mood',\n", '')],
  ['★首屏那一行撤掉 `white-space:nowrap`（英文那一句被撑成两行，他 23:0x 那句"不希望回行"白落）', 'createWxss',
    (s) => s.replace('  line-height: 1.35;\n  white-space: nowrap;', '  line-height: 1.35;')],
  ['★首屏那一行的圆角长回上沿（他那句「左上右不需要留空间」当场反了）', 'createWxss',
    (s) => s.replace('  border-radius: 0 0 var(--r-card) var(--r-card);',
                    '  border-radius: var(--r-card) var(--r-card) 0 0;')],
  ['★首屏那一行的阴影换回 `--sh-lift`（偏移朝上＝读成这块板浮在导航条上，不是"与背景之间带阴影"）', 'createWxss',
    (s) => s.replace('  box-shadow: var(--sh-drop);', '  box-shadow: var(--sh-lift);')],
  ['★那口 48rpx 的上外边距长回来（00:2x 那句「不要有空间，要顶上去」白说）', 'createWxss',
    (s) => s.replace('  margin: 0 calc(0px - var(--sp-3)) 0;', '  margin: var(--sp-5) calc(0px - var(--sp-3)) 0;')],
  ['★`--sh-drop` 的偏移没取反（与 `--sh-lift` 一模一样＝"镜像"那一枚是枚假令牌）', 'app',
    (s) => s.replace('--sh-drop: 0 12rpx 28rpx', '--sh-drop: 0 -12rpx 28rpx')],
  ['★把 `page{}` 那枚兜底投影抬到 .42（分享页那一屏没挂心情类，跟着变深＝超出他那一刀）', 'app',
    (s) => s.replace('--sh-lift: 0 -12rpx 28rpx rgba(18, 20, 26, 0.16);', '--sh-lift: 0 -12rpx 28rpx rgba(18, 20, 26, 0.42);')],
  ['★把墨档那一枚投影抬到 .42（＝10-15 17:3x 他打回的那一版：只有墨档特殊，读起来"过黑、不一致"）', 'app',
    (s) => s.replace(/--sh-(lift|drop): (0 -?12)rpx 28rpx rgba\(18, 20, 26, 0\.16\);(\n  --sh-(?:lift|drop): [^\n]+\n\})/, '--sh-$1: $2rpx 28rpx rgba(18, 20, 26, 0.42);$3')],
  ['★把彩色那一档（象牙）的投影单独抬到 .42——五档里只有一档特殊，与墨档那一刀是同一个坏法的另一半', 'app',
    (s) => {
      const PAT = '--sh-lift: 0 -12rpx 28rpx rgba(18, 20, 26, 0.16);\n  --sh-drop: 0 12rpx 28rpx rgba(18, 20, 26, 0.16);'
      // 第一处相邻成对的 .16 现在是墨档（10-15 撤特例之后六份同值），所以这一刀要跳过去打第二处＝象牙。
      const first = s.indexOf(PAT)
      const i = s.indexOf(PAT, first + 1)
      return i < 0 ? s : s.slice(0, i) + PAT.replace(/0\.16/g, '0.42') + s.slice(i + PAT.length)
    }],
  ['★`.mood-mist` 那两枚投影删掉（雨雾那一档悄悄掉回 `page{}` 兜底，六份少一份）', 'app',
    (s) => {
      const i = s.lastIndexOf('--sh-lift: 0 -12rpx 28rpx rgba(18, 20, 26, 0.16);')
      return s.slice(0, i) + s.slice(i)
        .replace('--sh-lift: 0 -12rpx 28rpx rgba(18, 20, 26, 0.16);\n', '')
        .replace('  --sh-drop: 0 12rpx 28rpx rgba(18, 20, 26, 0.16);\n', '')
    }],
  ['★把雨雾那一枚 `--sh-drop` 的偏移从 12rpx 改成 20rpx（说好了只改 α，几何却跟着漂＝几屏高度不一致）', 'app',
    (s) => {
      const i = s.lastIndexOf('--sh-drop: 0 12rpx 28rpx rgba(18, 20, 26, 0.16);')
      return s.slice(0, i) + s.slice(i).replace('0 12rpx 28rpx', '0 20rpx 28rpx')
    }],
  ['★`navFor` 从 app.js 的解构名单里漏掉（用了没引＝ReferenceError，导航条停在默认色而全批静态绿）', 'appjs',
    (s) => s.replace(', moodOfWallpaper, navFor }', ', moodOfWallpaper }')],
  ['★导航条那两枚写死的色塞回 app.js（一条栏两套真相长回来：铺图的页与没图的页又能各翻各的）', 'appjs',
    (s) => s.replace('wx.setNavigationBarColor({ frontColor: nav.front, backgroundColor: nav.face, fail() {} })',
      'wx.setNavigationBarColor({ frontColor: nav.face === "#23252C" ? "#ffffff" : "#000000", backgroundColor: "#181a20", fail() {} })')],
  ['★`applyNavForBand` 那一支加回来（两个出口，「我的」页当年漏抄那两行＝两深一浅的老病根）', 'appjs',
    (s) => s.replace('  applyNav() {',
      '  applyNavForBand(hasBg) { if (hasBg) wx.setNavigationBarColor({ frontColor: \'#000000\', backgroundColor: \'#f2efe9\', fail() {} }) },\n  applyNav() {')],
  ['★色板里把墨档的投影那两枚撤掉（CSS 与色板对不上，且这一族从五档里掉出去）', 'palette',
    (s) => s.replace(/    '--sh-lift'[^\n]*\n    '--sh-drop'[^\n]*\n/, '')],
  ['★新建那一屏的 `padding-top: 0` 撤掉（深色导航条底下那条 2rpx 亮带长回来＝他 17:3x 打回的那条线）', 'createWxss',
    (s) => s.replace('  padding-top: 0;\n  padding-bottom: 140rpx;', '  padding-bottom: 140rpx;')],
  ['★笔记那一屏的容器 `padding: 0` 改回带顶内缩那一档（同一条线在第二屏长回来）', 'ixWxss',
    (s) => s.replace('  padding: 0;\n}', '  padding: 2rpx 0 0;\n}')],
  ['★那一枚的下内边距抬回 150rpx（00:2x 那一版：坡走得完，可屏上就是一条 200rpx 的大灰带＝他 00:3x 打的"浪费空间"）', 'createWxss',
    (s) => s.replace('  padding: 14rpx var(--sp-3) 34rpx;', '  padding: 18rpx var(--sp-3) 150rpx;')],
  ['★底栏只写标准那行滤镜（iPhone 上胶囊不糊，安卓糊＝两机两样）', 'tabWxss',
    (s) => s.replace('  -webkit-backdrop-filter: var(--chrome-blur);\n', '')],
]

const base = {}
Object.keys(FILES).forEach((k) => { base[k] = read(FILES[k]) })
const clean = evaluate(base)
const failed = clean.filter((r) => !r.ok)
clean.forEach((r) => console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.got !== undefined ? `　→ ${r.got}` : ''}`))
console.log(`\n正向：${clean.length - failed.length}/${clean.length} 条通过`)

const cleanRed = new Set(failed.map((r) => r.name))
let toothless = 0
KNIVES.forEach(([name, file, fn]) => {
  const mutated = Object.assign({}, base, { [file]: fn(base[file]) })
  if (mutated[file] === base[file]) { toothless++; console.log(`  ★刀没切进去（锚点漂了） ${name}`); return }
  const res = evaluate(mutated).filter((r) => !r.ok && !cleanRed.has(r.name))
  if (res.length === 0) { toothless++; console.log(`  ★没牙 ${name}`) }
  else console.log(`  ✓ 反向：${name}　→ 红 ${res.length} 条：${res.map((r) => r.name).join('；').slice(0, 70)}`)
})
console.log(`反向 ${KNIVES.length - toothless}/${KNIVES.length} 有牙`)
process.exit(failed.length === 0 && toothless === 0 ? 0 : 1)
