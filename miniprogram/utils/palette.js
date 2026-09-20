// 色卡方向（V1）的色板与封面生成规则。
//
// 三条硬规则，都是实测或推理出来的，别随手改：
// ① 六个高饱和色各自固定配一种字色。黄/橙/绿配白字实测只有 1.63 / 3.03 / 2.98，
//    直接看不清，所以这三块配深墨字；蓝/紫/墨配白字。配对关系写死在下面。
// ② 颜色由分类决定，同分类恒定同色；未分类一律墨黑，让"没归类"这件事一眼可见。
// ③ 卡里的抽象母题（圆/弧/条带/点阵/药丸）由笔记 id 取模决定，位置大小也从 id 派生。
//    所以同一条笔记永远画成同一个样子，同分类色相一致但构图不重样。
//    全部用 CSS 画，不生成文件、不调 AI 生图。

const TONES = [
  { name: '芥末黄', bg: '#F6C445', ink: '#2A2005' },
  { name: '宝蓝', bg: '#3F52D6', ink: '#FFFFFF' },
  { name: '橙', bg: '#E9723D', ink: '#2C1204' },
  { name: '草绿', bg: '#46A863', ink: '#06260F' },
  { name: '紫', bg: '#6E4BD0', ink: '#FFFFFF' },
]
const UNCATEGORIZED = { name: '墨黑', bg: '#23252C', ink: '#FFFFFF' }

const MOTIFS = ['motif-circle', 'motif-arc', 'motif-stripes', 'motif-dots', 'motif-pill']

// 白色图标块里放一个汉字而不是图标字体：项目没有 iconfont，tab 栏的图标也是 CSS 画的；
// 单个汉字在苹方下必定渲染得出来，换成 ✎ ⌗ 这类符号就要赌设备字体。
// 首页和详情页共用这一张表，否则同一条笔记在两处会显示成不同符号。
const SOURCE_ICON = {
  wechat_article: '文',
  web_article: '文',
  screenshot: '图',
  manual: '写',
}

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
 * 分类对应的那组色。cardSkinFor 给的是 CSS 变量串，画布要的是裸色值，所以单独露一个。
 */
function toneFor(categoryId) {
  return categoryId == null ? UNCATEGORIZED : TONES[Math.abs(Number(categoryId)) % TONES.length]
}

/**
 * 生成一条笔记的色卡外观。
 * @param categoryId 笔记所属分类；null 走墨黑
 * @param noteId 笔记 id，决定构图
 * @returns {{style: string, motif: string}} style 直接塞进 style 属性，motif 是元素类名
 */
function cardSkinFor(categoryId, noteId) {
  const tone = toneFor(categoryId)
  const h = hash(noteId)
  const motif = MOTIFS[h % MOTIFS.length]
  // 母题只比底色暗/亮一点点，做质感不做主角
  const motifColor = mix(tone.ink, tone.bg, 0.16)
  const tagColor = mix(tone.ink, tone.bg, 0.12)
  const size = 150 + (h % 4) * 26 // rpx：150~228
  const shift = 20 + (h % 3) * 10 // rpx：向内收一点，做出界多少的差异
  const style = [
    `--card-bg:${tone.bg}`,
    `--card-ink:${tone.ink}`,
    `--card-motif:${motifColor}`,
    `--card-tag:${tagColor}`,
    `--motif-size:${size}rpx`,
    `--motif-shift:${shift}rpx`,
  ].join(';')
  return { style, motif }
}

/**
 * 只取某一组色的 CSS 变量串。给非笔记类的界面元素用（比如新建页的色块徽标），
 * 免得有人在 WXSS 里另抄一份十六进制。
 */
function toneStyle(i) {
  const tone = TONES[Math.abs(Number(i) || 0) % TONES.length]
  return `--card-bg:${tone.bg};--card-ink:${tone.ink}`
}

function toneColor(i) {
  return TONES[Math.abs(Number(i) || 0) % TONES.length].bg
}

/**
 * 只给一对裸色，不给 --card-bg。
 * 中性面板里想借用分类色（比如详情页的序号圆点）时用这个：
 * 直接贴 cardStyle 会把整块中性面板染成色卡。
 */
function toneVars(categoryId) {
  const tone = toneFor(categoryId)
  return `--tone-bg:${tone.bg};--tone-ink:${tone.ink}`
}

/**
 * 六套壁纸（=主题）。这里的 page/card 必须和 app.wxss 里 .theme-* 的取值一致，
 * 但 app.wxss 是 CSS、引不了 JS，所以改一边必须改另一边。
 * 之所以在 JS 里再存一份：导航条颜色只能由 wx.setNavigationBarColor 传值，
 * 壁纸选择器也要靠它画缩略图，两处都不能猜 CSS 变量。
 */
const THEMES = [
  { key: 'default', cls: 'theme-default', label: '米白', page: '#f4f2ec', card: 'rgba(255, 255, 255, 0.92)', dark: false },
  { key: 'gradient-blue', cls: 'theme-blue', label: '雾蓝', page: '#eaeefb', card: 'rgba(255, 255, 255, 0.86)', dark: false },
  { key: 'gradient-green', cls: 'theme-green', label: '松绿', page: '#e7f3ea', card: 'rgba(255, 255, 255, 0.86)', dark: false },
  { key: 'gradient-sunset', cls: 'theme-sunset', label: '暮橙', page: '#fdeee6', card: 'rgba(255, 255, 255, 0.86)', dark: false },
  { key: 'gradient-purple', cls: 'theme-purple', label: '夜紫', page: '#0c0c1d', card: 'rgba(255, 255, 255, 0.10)', dark: true },
  { key: 'gradient-ocean', cls: 'theme-ocean', label: '深海', page: '#0d1b2a', card: 'rgba(255, 255, 255, 0.10)', dark: true },
]

function themeOf(wallpaper) {
  return THEMES.find((x) => x.key === wallpaper) || THEMES[0]
}

module.exports = {
  TONES,
  UNCATEGORIZED,
  MOTIFS,
  SOURCE_ICON,
  THEMES,
  cardSkinFor,
  toneFor,
  toneVars,
  toneStyle,
  toneColor,
  themeOf,
  mix,
  hexToRgb,
}
