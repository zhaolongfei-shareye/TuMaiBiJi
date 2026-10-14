/**
 * 量一件事：首屏那枚面板上，五档心情各自"字色压在那块面上"的对比度是多少。
 * 纯算术，不吃平台：面本身是 `rgba(glass, α)` 压在页面底色上混出来的，
 * α 与底色都从现读的码里取（palette.moodVars() 与 app.wxss 那四支 --bg-page），
 * 所以这份数跟着码走，不是手抄的。
 *
 * 用法：node docs/工具/量-面板字色五档对比.js
 */
const fs = require('fs')
const path = require('path')
const ROOT = process.env.MP_ROOT || path.resolve(__dirname, '..', '..')
const { moodVars, MOODS, THEMES } = require(path.join(ROOT, 'miniprogram/utils/palette.js'))

const css = fs.readFileSync(path.join(ROOT, 'miniprogram/app.wxss'), 'utf8')
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]

// 每档心情吃哪套壁纸（MOODS 里那个 theme 字段＝THEMES 的 key），拿到那一套的类名，
// 再从 app.wxss 那个类块里现读 --bg-page —— 屏上真正压在面板身后的那层底色以样式表为准，
// palette 里的 page 只是它的镜像（镜像等值由 验-玻璃令牌齐不齐 钉着）。
function pageBg(themeKey) {
  const th = THEMES.filter((t) => t.key === themeKey)[0]
  if (!th) throw new Error(`palette.THEMES 里没有 ${themeKey} 这一套`)
  const i = css.indexOf(`.${th.cls} {`)
  if (i < 0) throw new Error(`app.wxss 里找不到 .${th.cls}`)
  const body = css.slice(i, css.indexOf('\n}', i))
  const m = /--bg-page:\s*(#[0-9A-Fa-f]{6})/.exec(body)
  if (!m) throw new Error(`app.wxss 里 .${th.cls} 没找到 --bg-page`)
  return hex(m[1])
}

const relLum = (c) => {
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const cr = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const over = (fg, a, bg) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)))

// 面板那一整面的两支停点：带高以下就是 .94／.95（见 palette.moodVars 的 stageFace）。
const FACE_A = 0.95
const PAPER = [242, 239, 233]

const rows = MOODS.map((m) => {
  const g = hex(m.glass)
  const b = hex(m.band)
  const bg = pageBg(m.theme)
  const face = over(g, FACE_A, bg)
  const dark = hex(m.text)
  // 甲方案的候选：把那一档的"面色"从 glass 换成同档更深的那支 band（色相不动，只压明度）
  const faceBand = over(b, FACE_A, bg)
  return {
    档: `${m.label}(${m.key})`,
    现面色: face.join(','),
    现深字: cr(dark, face).toFixed(2),
    '若纸白(现面)': cr(PAPER, face).toFixed(2),
    '压深后面色': faceBand.join(','),
    '纸白(压深后)': cr(PAPER, faceBand).toFixed(2),
  }
})

console.log('面板那一面（无图态，α=.95 那一段）压上去的对比度：AA 小字要 4.5，AA 大字 3.0\n')
console.table(rows)
console.log('\n要把纸白顶到 4.5:1，面色相对亮度必须 ≤', ((relLum(PAPER) + 0.05) / 4.5 - 0.05).toFixed(3),
  '（纸白本身 L=', relLum(PAPER).toFixed(3), '）')

/* 首屏最上面那一行（10-14 22:4x 站长要的那句；23:5x 通栏反向；00:2x 打回"太暗"；00:3x 打回"太高"）。
   `--stage-strip` 现值＝`linear-gradient(180deg, .94 0%, .80 55%, .16 100%)`：**首末两端仍是面板那两个 α**，
   中间那一档 .80@55% 是为了把整枚压回一行字高（00:3x「高度压缩，看到一行文字就行了，不要浪费空间」）——
   坡若在 80rpx 里从 .94 线性走到 .16，字的下半截会掉到 α .5 以下，墨那一档读不动。
   `.ai-line` 的 `padding: 14rpx … 34rpx` ＋ 字高 24×1.35＝32.4 ⇒ 整枚 **80.4rpx**，
   字占 f＝17.4%～57.7% ⇒ 压在字上的是 **α .90→.76**。**量的是字下半截那一档（最坏那一档）**，不是顶边。 */
const PAD_TOP = 14, FS = 24, LH = 1.35, PAD_BOT = 34
const BAND_H = PAD_TOP + FS * LH + PAD_BOT
const fTop = PAD_TOP / BAND_H, fBot = (PAD_TOP + FS * LH) / BAND_H
const stripAlpha = (f) => (f <= 0.55
  ? 0.94 + (0.80 - 0.94) * (f / 0.55)
  : 0.80 + (0.16 - 0.80) * ((f - 0.55) / 0.45))
const aTop = stripAlpha(fTop), aBot = stripAlpha(fBot)
const strips = MOODS.map((m) => {
  const bg = pageBg(m.theme)
  const at = over(hex(m.glass), aTop, bg), ab = over(hex(m.glass), aBot, bg)
  const inkT = over(hex(m.text), 0.96, at), inkB = over(hex(m.text), 0.96, ab)
  return {
    档: `${m.label}(${m.key})`,
    [`字上沿 α${aTop.toFixed(3)}`]: at.join(','),
    [`字下沿 α${aBot.toFixed(3)}`]: ab.join(','),
    '本档字·上': cr(inkT, at).toFixed(2),
    '本档字·下(最坏)': cr(inkB, ab).toFixed(2),
    '若纸白·下': cr(PAPER, ab).toFixed(2),
  }
})
console.log(`\n首屏那一行（.94→.80@55%→.16，整枚 ${BAND_H}rpx，字占 ${(fTop * 100).toFixed(1)}%～${(fBot * 100).toFixed(1)}% ⇒ α ${aTop.toFixed(3)}→${aBot.toFixed(3)}）：\n`)
console.table(strips)
