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
 * 生成一条笔记的色卡外观。
 * @param categoryId 笔记所属分类；null 走墨黑
 * @param noteId 笔记 id，决定构图
 * @returns {{style: string, motif: string}} style 直接塞进 style 属性，motif 是元素类名
 */
function cardSkinFor(categoryId, noteId) {
  const uncat = categoryId == null
  const tone = uncat ? UNCATEGORIZED : TONES[Math.abs(Number(categoryId)) % TONES.length]
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

module.exports = { TONES, UNCATEGORIZED, MOTIFS, cardSkinFor, mix, hexToRgb }
