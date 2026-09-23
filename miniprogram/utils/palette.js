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
  const h = hash(noteId)
  const motif = MOTIFS[h % MOTIFS.length]
  // 母题只比底色暗/亮一点点，做质感不做主角
  const motifColor = mix(tone.ink, tone.bg, 0.16)
  // 墨黑这块在深色壁纸下会和卡片底糊在一起，只有它有描边；亮底上这条描边看不出来，所以两端都安全。
  const edge = tone === UNCATEGORIZED ? 'rgba(255,255,255,0.16)' : 'transparent'
  const size = 108 + (h % 4) * 16 // rpx：108~156，方块 176rpx 见 app.wxss --blk
  const shift = 24 + (h % 3) * 8 // rpx：出界多少，从 id 派生
  const style = [
    `--blk-bg:${tone.bg}`,
    `--blk-ink:${tone.ink}`,
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
  // --blk-glyph 比 --blk-motif 重一档（0.22 对 0.16）：新建页那三个图形要认得出来，
  // 但仍是压在卡底的水印，不是贴在表面的贴纸。
  //
  // 后面这组是"卡内控件的面"。新建页把输入框和按钮装进了饱和色大卡，
  // 面上用什么色取决于这块色本身是深还是浅：深底卡（字是白的）用半透明白面，
  // 亮底卡（字是深墨）用近白面 + 该卡自己的墨色字，否则黄/橙上放白半透明面会糊成一片。
  const onDark = tone.ink.toUpperCase() === '#FFFFFF'
  return [
    `--blk-bg:${tone.bg}`,
    `--blk-ink:${tone.ink}`,
    `--blk-motif:${mix(tone.ink, tone.bg, 0.16)}`,
    `--blk-glyph:${mix(tone.ink, tone.bg, 0.22)}`,
    `--face:${onDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.78)'}`,
    `--face-ink:${onDark ? '#FFFFFF' : tone.ink}`,
    `--face-off:${onDark ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.34)'}`,
    `--face-off-ink:${onDark ? 'rgba(255,255,255,0.5)' : mix(tone.ink, tone.bg, 0.45)}`,
    `--solid-bg:${onDark ? '#FFFFFF' : tone.ink}`,
    `--solid-ink:${onDark ? tone.bg : '#FFFFFF'}`,
    // 校验/权限提示那行字直接坐在卡色上，所以亮底卡用深红、深底卡用浅红，两边都够对比度
    `--blk-err:${onDark ? '#FFD7D3' : '#8C2119'}`,
  ].join(';')
}

function toneColor(i) {
  return TONES[Math.abs(Number(i) || 0) % TONES.length].bg
}

/**
 * 只给一对裸色，不给 --blk-bg。
 * 中性面板里想借用分类色（比如详情页的序号圆点）时用这个：
 * 直接贴方块那串会把整块中性面板染成色块。
 */
function toneVars(categoryId) {
  const tone = toneFor(categoryId)
  return `--tone-bg:${tone.bg};--tone-ink:${tone.ink}`
}

/**
 * 六套壁纸（=主题）。page 必须和 app.wxss 里 .theme-* 的 --bg-page 一致，
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
  mix,
  withAlpha,
  hexToRgb,
}
