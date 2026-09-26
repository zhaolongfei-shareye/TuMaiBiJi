// 色块方向的色板与封面生成规则（当前是 V2 左块右文）。
//
// 三条硬规则从 V1 原样继承，都是实测或推理出来的，别随手改：
// ① 六个高饱和色各自固定配一种字色。黄/橙/绿配白字实测只有 1.63 / 3.03 / 2.98，
//    直接看不清，所以这三块配深墨字；蓝/紫/墨配白字。配对关系写死在下面。
// ② 颜色由分类决定，同分类恒定同色；未分类一律墨黑，让"没归类"这件事一眼可见。
// ③ 卡里的抽象母题（圆/弧/条带/点阵/药丸）由笔记 id 取模决定，位置大小也从 id 派生。
//    所以同一条笔记永远画成同一个样子，同分类色相一致但构图不重样。
//    全部用 CSS 画，不生成文件、不调 AI 生图。
//
// V1→V2 变的只有承载方式：颜色从整张卡退到卡片左侧那块方块，正文回白底。
// 所以母题现在住在方块里（方块自己 overflow:hidden），尺寸区间按方块重算。

const TONES = [
  { name: '芥末黄', bg: '#F6C445', ink: '#2A2005' },
  { name: '宝蓝', bg: '#3F52D6', ink: '#FFFFFF' },
  { name: '橙', bg: '#E9723D', ink: '#2C1204' },
  { name: '草绿', bg: '#46A863', ink: '#06260F' },
  { name: '紫', bg: '#6E4BD0', ink: '#FFFFFF' },
]
const UNCATEGORIZED = { name: '墨黑', bg: '#23252C', ink: '#FFFFFF' }

const MOTIFS = ['motif-circle', 'motif-arc', 'motif-stripes', 'motif-dots', 'motif-pill']

function hexToRgb(hex) {
  const h = (hex || '').replace('#', '')
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(s.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(rgb) {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

// weightOfA = 第一个颜色占多少。想让某个颜色"只渗进去一点"，给它一个小权重。
function mix(a, b, weightOfA) {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  return toHex(ca.map((v, i) => v * weightOfA + cb[i] * (1 - weightOfA)))
}

// 给一个 hex 加透明度。海报上"同一张图洗一层某色"（波普套色、人像上的色罩）靠它，
// 免得每个模板自己手写 rgba 字面量，色板就又散了。
function withAlpha(hex, a) {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

function hash(n) {
  // 把 id 打散成一个大整数，避免相邻 id 拿到相邻构图。
  const x = (Math.abs(Number(n) || 0) + 1) * 2654435761
  return x % 2147483647
}

/**
 * 分类对应的那组色。blockSkinFor 给的是 CSS 变量串，画布要的是裸色值，所以单独露一个。
 */
function toneFor(categoryId) {
  return categoryId == null ? UNCATEGORIZED : TONES[Math.abs(Number(categoryId)) % TONES.length]
}

/**
 * 生成一条笔记左侧那块方块的外观。
 * @param categoryId 笔记所属分类；null 走墨黑
 * @param noteId 笔记 id，决定构图
 * @returns {{style: string, motif: string}} style 直接塞进方块的 style 属性，motif 是母题类名
 */
function blockSkinFor(categoryId, noteId) {
  const tone = toneFor(categoryId)
  const ramp = rampFor(categoryId)
  const bg = ramp ? ramp.bg : tone.bg
  const ink = ramp ? ramp.ink : tone.ink
  const h = hash(noteId)
  const motif = MOTIFS[h % MOTIFS.length]
  // 母题只比底色暗/亮一点点，做质感不做主角
  const motifColor = mix(ink, bg, 0.16)
  // 墨黑这块在深色壁纸下会和卡片底糊在一起，只有它有描边；亮底上这条描边看不出来，所以两端都安全。
  // 色阶主题反过来：卡底是亮纸，最浅那两档（与卡底只差 1.2~1.6 的对比）会直接在卡上化掉，
  // 所以这里给一条"取 bg 和 ink 里更深那个"的细描边——浅档勾深边、深档勾深底边，都不刺眼。
  const edge = ramp
    ? withAlpha(lumOf(bg) < lumOf(ink) ? bg : ink, 0.22)
    : tone === UNCATEGORIZED ? 'rgba(255,255,255,0.16)' : 'transparent'
  const size = 108 + (h % 4) * 16 // rpx：108~156，方块 176rpx 见 app.wxss --blk
  const shift = 24 + (h % 3) * 8 // rpx：出界多少，从 id 派生
  const style = [
    `--blk-bg:${bg}`,
    `--blk-ink:${ink}`,
    `--blk-motif:${motifColor}`,
    `--blk-edge:${edge}`,
    `--motif-size:${size}rpx`,
    `--motif-shift:${shift}rpx`,
  ].join(';')
  return { style, motif }
}

/**
 * 只取某一组色的 CSS 变量串。给非笔记类的色块用（比如新建页那三张大卡、
 * 分类管理那列色点），免得有人在 WXSS 里另抄一份十六进制。
 * 连 --blk-motif 一起给：淡一层同色系图形要用的就是它，值仍从这一处派生。
 */
function toneStyle(i) {
  const tone = TONES[Math.abs(Number(i) || 0) % TONES.length]
  const ramp = rampFor(i)
  const bg = ramp ? ramp.bg : tone.bg
  const ink = ramp ? ramp.ink : tone.ink
  // --blk-glyph 比 --blk-motif 重一档（0.22 对 0.16）：新建页那三个图形要认得出来，
  // 但仍是压在卡底的水印，不是贴在表面的贴纸。
  //
  // 后面这组是"卡内控件的面"。新建页把输入框和按钮装进了饱和色大卡，
  // 面上用什么色取决于这块色本身是深还是浅：深底卡（字是白的）用半透明白面，
  // 亮底卡（字是深墨）用近白面 + 该卡自己的墨色字，否则黄/橙上放白半透明面会糊成一片。
  const onDark = inkIsLighter(bg, ink)
  return [
    `--blk-bg:${bg}`,
    `--blk-ink:${ink}`,
    `--blk-motif:${mix(ink, bg, 0.16)}`,
    `--blk-glyph:${mix(ink, bg, 0.22)}`,
    `--face:${onDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.78)'}`,
    `--face-ink:${onDark ? '#FFFFFF' : ink}`,
    `--face-off:${onDark ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.34)'}`,
    `--face-off-ink:${onDark ? 'rgba(255,255,255,0.5)' : mix(ink, bg, 0.45)}`,
    `--solid-bg:${onDark ? '#FFFFFF' : ink}`,
    `--solid-ink:${onDark ? bg : '#FFFFFF'}`,
    // 校验/权限提示那行字直接坐在卡色上，所以亮底卡用深红、深底卡用浅红，两边都够对比度。
    // 色阶主题下浅三档比原来那五支彩色暗，同一个 #8C2119 掉到 4.0~4.2（要 4.5），所以另给一档深红。
    `--blk-err:${onDark ? '#FFD7D3' : ramp ? '#7A1A13' : '#8C2119'}`,
  ].join(';')
}

/**
 * 某一档的裸底色。
 * @param i 档号（和分类号同一套取模规则）
 * @param themeKey 画"别的主题"时必须传：壁纸选择器那一排缩略图每格画的都是另一套主题，
 *                 不传就会拿当前激活的主题去染色——停在米白时去看米白那一格，
 *                 六枚普通壁纸的缩略图也会跟着变成色阶色（真机截图里抓到过）。
 */
function toneColor(i, themeKey) {
  const theme = themeKey ? themeOf(themeKey) : ACTIVE_THEME
  const ramp = theme && theme.ramp
  if (ramp) return ramp.steps[Math.abs(Number(i) || 0) % ramp.steps.length]
  return TONES[Math.abs(Number(i) || 0) % TONES.length].bg
}

/**
 * 只给一对裸色，不给 --blk-bg。
 * 中性面板里想借用分类色（比如详情页的序号圆点）时用这个：
 * 直接贴方块那串会把整块中性面板染成色块。
 */
function toneVars(categoryId) {
  const tone = toneFor(categoryId)
  const ramp = rampFor(categoryId)
  return `--tone-bg:${ramp ? ramp.bg : tone.bg};--tone-ink:${ramp ? ramp.ink : tone.ink}`
}

/**
 * 八套壁纸（=主题）。page 必须和 app.wxss 里 .theme-* 的 --bg-page 一致，
 * 但 app.wxss 是 CSS、引不了 JS，所以改一边必须改另一边。
 * 之所以在 JS 里再存一份：导航条颜色只能由 wx.setNavigationBarColor 传值，
 * 壁纸选择器也要靠它画缩略图，两处都不能猜 CSS 变量。
 *
 * line / lineEdge 只给缩略图里那两条中性描边行用：缩略图每一格画的都是"别的主题"，
 * 它拿不到当前主题的 CSS 变量，六个值必须由 JS 一个个带进去。
 */
const THEMES = [
  { key: 'default', cls: 'theme-default', label: '米白', page: '#f4f2ec', line: '#ffffff', lineEdge: 'rgba(35,37,44,0.10)', dark: false },
  { key: 'gradient-blue', cls: 'theme-blue', label: '雾蓝', page: '#eaeefb', line: '#ffffff', lineEdge: 'transparent', dark: false },
  { key: 'gradient-green', cls: 'theme-green', label: '松绿', page: '#e7f3ea', line: '#ffffff', lineEdge: 'transparent', dark: false },
  { key: 'gradient-sunset', cls: 'theme-sunset', label: '暮橙', page: '#fdeee6', line: '#ffffff', lineEdge: 'transparent', dark: false },
  { key: 'gradient-purple', cls: 'theme-purple', label: '夜紫', page: '#0c0c1d', line: 'rgba(255,255,255,0.14)', lineEdge: 'transparent', dark: true },
  { key: 'gradient-ocean', cls: 'theme-ocean', label: '深海', page: '#0d1b2a', line: 'rgba(255,255,255,0.14)', lineEdge: 'transparent', dark: true },
  // 下面两枚是"整套色阶"的淡雅主题：不只换页面底，连左侧方块、新建页那三张大卡、
  // 按钮和标签都收进同一支色相，五档明度对应原来那五支彩色（索引公式一样，
  // 所以同一个分类在这套里还是同一档，只是彩色换成了深浅）。
  //
  // 这两枚只存在本机（见 app.js 里 LOCAL_WALLPAPER_KEY）：后端的 WALLPAPER_PRESETS
  // 白名单是现网代码，加两个 key 就要动后端并部署，所以这一轮不写库、不跨设备。
  //
  // steps/inks 一一对应，深两档的字翻成亮色；uncategorized 是"未分类"那一块。
  // 母题色、面、按钮色一律由 mix() 和 inkIsLighter 从这两列派生，不另立色值。
  {
    key: 'tint-paper',
    cls: 'theme-tint-paper',
    label: '米白一色',
    local: true,
    page: '#F2EFE9',
    line: '#FCFBF8',
    lineEdge: 'rgba(36,30,22,0.12)',
    dark: false,
    ramp: {
      // 第 4 档从 #9A7F5C 加深到 #85644A：原来那版配亮字只有 3.50，方块上那行分类名是 16px/800，
      // 按 WCAG 要 4.5:1；加深后 4.97，且仍比第 5 档浅，色阶顺序没被打乱。
      steps: ['#EAE0CE', '#D9C9AE', '#C2AA85', '#85644A', '#6A5334'],
      inks: ['#3B2F1F', '#33291B', '#2A2114', '#FBF6EC', '#FBF6EC'],
      uncategorized: { bg: '#241E16', ink: '#F2EFE9' },
    },
  },
  {
    key: 'tint-celadon',
    cls: 'theme-tint-celadon',
    label: '雨过青',
    local: true,
    page: '#E9EEEA',
    line: '#F7FAF7',
    lineEdge: 'rgba(27,42,33,0.13)',
    dark: false,
    ramp: {
      // 同上：第 4 档 #6E8F77 配亮字只有 3.31，加深到 #54745D 后 4.83。
      steps: ['#DDE7DF', '#C2D3C6', '#9FB8A6', '#54745D', '#40604A'],
      inks: ['#1F2D25', '#1A271F', '#14211A', '#F3F7F2', '#F3F7F2'],
      uncategorized: { bg: '#1B2A21', ink: '#E9EEEA' },
    },
  },
]

/**
 * 海报专用配色组。界面那六组色是"分类身份"，海报要的是"这一张好不好看、愿不愿意转发"，
 * 所以这里按风格成套给：同一套风格内部再按分类确定性取一个色向，
 * 于是同一条笔记在同一个模板上永远长一个样，但换分类会换色、换模板会换气质。
 *
 * 字段是约定死的，模板只能读这几个：
 *   bg/ink/sub        压在底色上的主字色与次要字色
 *   panel/panelInk    内容面板（白卡/玻璃卡）的底色与字色
 *   accent/accentInk  强调块（色带、序号、按钮）的底色与字色
 *   c1/c2             渐变两端；不用渐变的模板忽略
 *   dot               网点/母题这类"质感色"，一律带透明度
 * 每组都过了一遍对比度脚本：ink 压 bg、panelInk 压 panel、accentInk 压 accent 都要 ≥3。
 */
const POSTER_SCHEMES = {
  pop: [
    { name: '波普·亮黄', bg: '#FFD84D', ink: '#17181C', sub: 'rgba(23,24,28,0.66)', panel: '#FFFFFF', panelInk: '#17181C', accent: '#FF3D6E', accentInk: '#FFFFFF', c1: '#FFD84D', c2: '#FFD84D', dot: 'rgba(23,24,28,0.16)' },
    { name: '波普·品红', bg: '#FF3D6E', ink: '#17181C', sub: 'rgba(23,24,28,0.66)', panel: '#FFFFFF', panelInk: '#17181C', accent: '#2B44FF', accentInk: '#FFFFFF', c1: '#FF3D6E', c2: '#FF3D6E', dot: 'rgba(23,24,28,0.18)' },
    { name: '波普·宝蓝', bg: '#2B44FF', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.74)', panel: '#FFFFFF', panelInk: '#17181C', accent: '#FFD84D', accentInk: '#17181C', c1: '#2B44FF', c2: '#2B44FF', dot: 'rgba(255,255,255,0.22)' },
    { name: '波普·青绿', bg: '#00C7A9', ink: '#06231D', sub: 'rgba(6,35,29,0.66)', panel: '#FFFFFF', panelInk: '#06231D', accent: '#FF6B4A', accentInk: '#2C1204', c1: '#00C7A9', c2: '#00C7A9', dot: 'rgba(6,35,29,0.16)' },
  ],
  neon: [
    { name: '电光·蓝紫', bg: '#3A49D8', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.84)', panel: 'rgba(255,255,255,0.14)', panelInk: '#FFFFFF', accent: '#FFFFFF', accentInk: '#2A22A0', c1: '#5B4BF0', c2: '#1B1470', dot: 'rgba(255,255,255,0.16)' },
    { name: '电光·暮色', bg: '#A82C86', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.86)', panel: 'rgba(255,255,255,0.16)', panelInk: '#FFFFFF', accent: '#FFD84D', accentInk: '#17181C', c1: '#6D1F9E', c2: '#D6336C', dot: 'rgba(255,255,255,0.18)' },
    { name: '电光·深海', bg: '#1B2E7A', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.78)', panel: 'rgba(255,255,255,0.12)', panelInk: '#FFFFFF', accent: '#7CF5C1', accentInk: '#06260F', c1: '#0B1B4A', c2: '#2B44FF', dot: 'rgba(255,255,255,0.14)' },
    { name: '电光·紫罗兰', bg: '#7A52DE', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.80)', panel: 'rgba(255,255,255,0.14)', panelInk: '#FFFFFF', accent: '#FFD84D', accentInk: '#17181C', c1: '#5B2CF0', c2: '#9B5DE5', dot: 'rgba(255,255,255,0.16)' },
  ],
  riso: [
    { name: '孔版·陶土', bg: '#F4EFE6', ink: '#23252C', sub: 'rgba(35,37,44,0.62)', panel: '#FFFFFF', panelInk: '#23252C', accent: '#E4694A', accentInk: '#2C1204', c1: '#F4EFE6', c2: '#EDE4D4', dot: 'rgba(228,105,74,0.20)' },
    { name: '孔版·紫黄', bg: '#EDEAF7', ink: '#241C4A', sub: 'rgba(36,28,74,0.62)', panel: '#FFFFFF', panelInk: '#241C4A', accent: '#6E4BD0', accentInk: '#FFFFFF', c1: '#EDEAF7', c2: '#E1DBF3', dot: 'rgba(110,75,208,0.18)' },
    { name: '孔版·薄荷', bg: '#E6F1EA', ink: '#12301F', sub: 'rgba(18,48,31,0.62)', panel: '#FFFFFF', panelInk: '#12301F', accent: '#46A863', accentInk: '#06260F', c1: '#E6F1EA', c2: '#D8E9DE', dot: 'rgba(70,168,99,0.20)' },
  ],
  mono: [
    { name: '墨·黑', bg: '#0E0F12', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.72)', panel: 'rgba(255,255,255,0.08)', panelInk: '#FFFFFF', accent: '#F6C445', accentInk: '#2A2005', c1: '#22242C', c2: '#0E0F12', dot: 'rgba(255,255,255,0.10)' },
    { name: '墨·绿', bg: '#0F2119', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.72)', panel: 'rgba(255,255,255,0.08)', panelInk: '#FFFFFF', accent: '#7BE0A0', accentInk: '#06260F', c1: '#1B3A2C', c2: '#0F2119', dot: 'rgba(255,255,255,0.10)' },
    { name: '墨·蓝', bg: '#0B1436', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.72)', panel: 'rgba(255,255,255,0.09)', panelInk: '#FFFFFF', accent: '#5FB0FF', accentInk: '#04122E', c1: '#16265C', c2: '#0B1436', dot: 'rgba(255,255,255,0.10)' },
    { name: '墨·棕', bg: '#1D1611', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.72)', panel: 'rgba(255,255,255,0.08)', panelInk: '#FFFFFF', accent: '#F6C445', accentInk: '#2A2005', c1: '#33261B', c2: '#1D1611', dot: 'rgba(255,255,255,0.10)' },
  ],
  spec: [
    { name: '规格·纸白', bg: '#F7F8FA', ink: '#0B0D12', sub: 'rgba(11,13,18,0.62)', panel: '#FFFFFF', panelInk: '#0B0D12', accent: '#2E6BFF', accentInk: '#FFFFFF', c1: '#F7F8FA', c2: '#EEF1F6', dot: 'rgba(11,13,18,0.07)' },
    { name: '规格·石墨', bg: '#14161C', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.74)', panel: 'rgba(255,255,255,0.07)', panelInk: '#FFFFFF', accent: '#7CF5C1', accentInk: '#06260F', c1: '#1B1F28', c2: '#0E1014', dot: 'rgba(255,255,255,0.08)' },
    { name: '规格·米格', bg: '#FFFDF5', ink: '#1A1C22', sub: 'rgba(26,28,34,0.62)', panel: '#FFFFFF', panelInk: '#1A1C22', accent: '#FF5A1F', accentInk: '#FFFFFF', c1: '#FFFDF5', c2: '#F6F1E4', dot: 'rgba(26,28,34,0.07)' },
    { name: '规格·冷蓝', bg: '#EAF0F6', ink: '#0B1A45', sub: 'rgba(11,26,69,0.62)', panel: '#FFFFFF', panelInk: '#0B1A45', accent: '#2E6BFF', accentInk: '#FFFFFF', c1: '#EAF0F6', c2: '#DDE7F2', dot: 'rgba(11,26,69,0.07)' },
  ],
  lime: [
    { name: '酸性·柠', bg: '#D9F24A', ink: '#17181C', sub: 'rgba(23,24,28,0.66)', panel: '#FFFFFF', panelInk: '#17181C', accent: '#17181C', accentInk: '#D9F24A', c1: '#D9F24A', c2: '#B9E02F', dot: 'rgba(23,24,28,0.14)' },
    { name: '酸性·青', bg: '#5FE9E0', ink: '#05272A', sub: 'rgba(5,39,42,0.66)', panel: '#FFFFFF', panelInk: '#05272A', accent: '#2B44FF', accentInk: '#FFFFFF', c1: '#5FE9E0', c2: '#38CFD6', dot: 'rgba(5,39,42,0.14)' },
    { name: '酸性·桔', bg: '#FFB03A', ink: '#2C1204', sub: 'rgba(44,18,4,0.66)', panel: '#FFFFFF', panelInk: '#2C1204', accent: '#17181C', accentInk: '#FFB03A', c1: '#FFB03A', c2: '#FF8A3D', dot: 'rgba(44,18,4,0.14)' },
  ],
}

/**
 * 取某一类海报风格里、这条笔记对应的那组色。
 * 用 hash 而不是取模序号：分类 id 相邻（1/2/3）在六组色里跳着取，
 * 才不会出现"相邻两条笔记的波普海报是相邻两个色"这种一眼看穿的规律。
 */
function schemeFor(style, categoryId) {
  const list = POSTER_SCHEMES[style] || []
  if (!list.length) return null
  return list[Math.abs(hash(categoryId)) % list.length]
}

/**
 * 波普四格用的四个版色。
 * 取法不是"一组色里挑四个"——一组只有底和强调两块，硬凑出来的第三第四块
 * 只能是掺白的浅色，印出来发灰。这里跨着相邻的几组各拿一块，四格才是四个色相。
 */
function plateColors(categoryId) {
  const list = POSTER_SCHEMES.pop
  const i = Math.abs(hash(categoryId)) % list.length
  const n = list.length
  return [list[i].bg, list[i].accent, list[(i + 1) % n].bg, list[(i + 2) % n].accent]
}

function themeOf(wallpaper) {
  return THEMES.find((x) => x.key === wallpaper) || THEMES[0]
}

/**
 * 当前生效的那套壁纸。由 app.applyTheme 在每次应用主题时写进来。
 * 之所以做成模块状态而不是参数：新建页那三张卡、首页搜索卡的颜色是在 Page 的
 * data 字面量里算出来的（模块加载时就定了），拿不到"这一页当前是哪套主题"。
 */
let ACTIVE_THEME = null

function setActiveTheme(wallpaper) {
  ACTIVE_THEME = themeOf(wallpaper)
  return ACTIVE_THEME
}

/**
 * 两套"整套色阶"主题（淡雅那两枚）的分类取档。
 * 索引公式和 toneFor 逐字一致，所以切到这套主题时同一个分类还是同一档，
 * 只是把五支彩色收成了一支色相、用深浅代替色相。
 * 现有六枚没有 ramp，一律返回 null，调用方原样回落到 TONES——这个 if 就是零回归的闸门。
 */
function rampFor(categoryId) {
  const ramp = ACTIVE_THEME && ACTIVE_THEME.ramp
  if (!ramp) return null
  if (categoryId == null) {
    return { bg: ramp.uncategorized.bg, ink: ramp.uncategorized.ink }
  }
  const i = Math.abs(Number(categoryId)) % ramp.steps.length
  return { bg: ramp.steps[i], ink: ramp.inks[i] }
}

/**
 * 一块色的视觉轻重（亮度加权，和电视信号那套系数一致）。
 * 只用来比"字和底谁更亮"，不当对比度用——那要另一条公式。
 */
function lumOf(hex) {
  const [r, g, b] = hexToRgb(hex)
  return r * 0.299 + g * 0.587 + b * 0.114
}

/**
 * 这块色算"深底"吗——判据是字比底亮，不是"字是不是纯白"。
 * 原来那句 `ink === '#FFFFFF'` 对现有六组色的判定结果，和这条逐组一致（单测钉住）；
 * 换成色阶之后深两档配的是米白字而不是纯白，只有这条判得对。
 */
function inkIsLighter(bg, ink) {
  return lumOf(ink) > lumOf(bg)
}

module.exports = {
  TONES,
  UNCATEGORIZED,
  MOTIFS,
  THEMES,
  POSTER_SCHEMES,
  schemeFor,
  plateColors,
  blockSkinFor,
  toneFor,
  toneVars,
  toneStyle,
  toneColor,
  themeOf,
  setActiveTheme,
  rampFor,
  inkIsLighter,
  mix,
  withAlpha,
  hexToRgb,
}
