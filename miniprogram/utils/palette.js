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
 * 只取某一组色的 CSS 变量串。给非笔记类的方块用（比如新建页那三个入口徽标、
 * 分类管理那列色点），免得有人在 WXSS 里另抄一份十六进制。
 */
function toneStyle(i) {
  const tone = TONES[Math.abs(Number(i) || 0) % TONES.length]
  return `--blk-bg:${tone.bg};--blk-ink:${tone.ink}`
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

function themeOf(wallpaper) {
  return THEMES.find((x) => x.key === wallpaper) || THEMES[0]
}

module.exports = {
  TONES,
  UNCATEGORIZED,
  MOTIFS,
  THEMES,
  blockSkinFor,
  toneFor,
  toneVars,
  toneStyle,
  toneColor,
  themeOf,
  mix,
  hexToRgb,
}
