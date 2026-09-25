// 色板改动的零回归尺子：拿 git HEAD 那份 palette.js 和改完的这份跑同一批输入，逐个字符串比。
// 用法（在仓库根跑）：
//   git show HEAD:miniprogram/utils/palette.js > /tmp/palette-old.js
//   node docs/工具/验-色板零回归.js
// 为什么这么验：这两枚新壁纸动的不是页面底，是"方块按分类取哪支色"——那是 V2 的硬规则②。
// 一旦这条改坏，现有六枚壁纸下所有页面的颜色都会跟着漂，而那种错在截图上很难看出来
// （色相没变、只是深浅差一档）。所以不靠眼睛，靠把改前那份拉出来逐字节比。
// 另外钉一条：海报侧只走 toneFor，界面切到哪套主题都不许改海报出图。
const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const OLD = '/tmp/palette-old.js'
if (!fs.existsSync(OLD)) {
  // 走 argv 数组、不起 shell：这份文件本身就是被验的对象，不该再拼一次命令行
  const src = execFileSync('git', ['show', 'HEAD:miniprogram/utils/palette.js'], {
    cwd: path.resolve(__dirname, '../..'),
    maxBuffer: 8 * 1024 * 1024,
  })
  fs.writeFileSync(OLD, src)
}
const before = require(OLD)
const after = require(path.resolve(__dirname, '../../miniprogram/utils/palette.js'))

const results = []
const ck = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail: detail || '' })
  console.log(`${ok ? '✓' : '✗'} ${name}` + (detail ? `  · ${detail}` : ''))
}

const CATS = [null, 0, 1, 2, 3, 4, 5, 6, 7, 99, -3]
const NOTES = [1, 7, 42, 12345, 999983]
const OLD_KEYS = before.THEMES.map((t) => t.key)

// ① 现有六枚主题下：方块串、卡面色串、裸色对、缩略图色，全部逐字节不变
let diff = []
for (const key of OLD_KEYS) {
  before.setActiveTheme ? before.setActiveTheme(key) : null
  after.setActiveTheme(key)
  for (const c of CATS) {
    for (const n of NOTES) {
      const a = before.blockSkinFor(c, n)
      const b = after.blockSkinFor(c, n)
      if (a.style !== b.style || a.motif !== b.motif) diff.push(`${key} blk ${c}/${n}`)
    }
    const av = before.toneVars(c)
    const bv = after.toneVars(c)
    if (av !== bv) diff.push(`${key} toneVars ${c}`)
  }
  for (const i of [0, 1, 2, 3, 4, 5, 9]) {
    if (before.toneStyle(i) !== after.toneStyle(i)) diff.push(`${key} toneStyle ${i}`)
    if (before.toneColor(i) !== after.toneColor(i)) diff.push(`${key} toneColor ${i}`)
  }
}
ck('现有六枚主题下取色逐字节不变', diff.length === 0, diff.slice(0, 4).join(' | ') || `${OLD_KEYS.length} 套 × ${CATS.length} 类 × ${NOTES.length} 条笔记全等`)

// ② 没设过主题（冷启动、data 字面量在模块加载时算）也必须等于改前
after.setActiveTheme('default')
const cold = after.blockSkinFor(2, 42).style
before.setActiveTheme && before.setActiveTheme('default')
ck('未选主题时等于改前', cold === before.blockSkinFor(2, 42).style)

// ③ 新增两枚：确实带色阶，且档数与彩色组数一一对应
const ramped = after.THEMES.filter((t) => t.ramp)
ck('新增两枚整套色阶主题', ramped.length === 2, ramped.map((t) => `${t.key}/${t.label}`).join(' '))
for (const t of ramped) {
  ck(`${t.key} 色阶档数＝彩色组数`, t.ramp.steps.length === before.TONES.length, `${t.ramp.steps.length}`)
  ck(`${t.key} 字色与底色等长`, t.ramp.inks.length === t.ramp.steps.length)
  ck(`${t.key} 五档底色互不重复`, new Set(t.ramp.steps).size === t.ramp.steps.length)
  ck(`${t.key} key 不与现有主题撞`, OLD_KEYS.indexOf(t.key) < 0)
  ck(`${t.key} cls 是 theme- 前缀`, /^theme-[a-z-]+$/.test(t.cls), t.cls)
}

// ④ 色阶主题下：同分类恒定同档（换笔记 id 只换构图不换色）
for (const t of ramped) {
  after.setActiveTheme(t.key)
  const styleOf = (c) => after.blockSkinFor(c, 1).style.split(';').slice(0, 2).join(';')
  const stable = CATS.every((c) => after.blockSkinFor(c, 7).style.split(';').slice(0, 2).join(';') === styleOf(c))
  ck(`${t.key} 色只由分类决定（与笔记 id 无关）`, stable)
  const uncat = after.blockSkinFor(null, 1).style
  ck(`${t.key} 未分类走这套的墨色`, uncat.indexOf(t.ramp.uncategorized.bg) >= 0)
  const got = after.blockSkinFor(3, 1).style
  ck(`${t.key} 分类 3 落在第 4 档`, got.indexOf(t.ramp.steps[3]) >= 0 && got.indexOf(t.ramp.inks[3]) >= 0)
}

// ⑤ 海报必须免疫：界面切到色阶主题，toneFor 一个字都不能变
const posterDiff = []
for (const t of ramped) {
  after.setActiveTheme(t.key)
  for (const c of CATS) {
    if (JSON.stringify(after.toneFor(c)) !== JSON.stringify(before.toneFor(c))) posterDiff.push(`${t.key}/${c}`)
  }
}
ck('海报取色（toneFor）不受界面主题影响', posterDiff.length === 0, posterDiff.slice(0, 3).join(' | ') || `${ramped.length} 套 × ${CATS.length} 类全等`)

// ⑥ 深底判据换了写法，必须和原来那句 ink==='#FFFFFF' 逐组一致
const darkDiff = before.TONES.concat([before.UNCATEGORIZED]).filter((tone, i) => {
  const oldWay = tone.ink.toUpperCase() === '#FFFFFF'
  return after.inkIsLighter(tone.bg, tone.ink) !== oldWay
})
ck('深底判据与原写法逐组一致', darkDiff.length === 0, darkDiff.map((t) => t.name).join(' '))

// ⑦ 色阶主题下那五档的"深底"判定要按深浅翻对，否则输入框面会糊成一片
for (const t of ramped) {
  const darkFlags = t.ramp.steps.map((bg, i) => after.inkIsLighter(bg, t.ramp.inks[i]))
  const lightFirst = darkFlags.slice(0, 3).every((x) => !x)
  const darkLast = darkFlags.slice(3).every(Boolean)
  ck(`${t.key} 浅三档配深字、深两档配亮字`, lightFirst && darkLast, darkFlags.map((x) => (x ? '深' : '亮')).join(''))
}

// ⑧ JS 里那套壁纸名单和 app.wxss 里的 .theme-* 必须对得上。
// palette.js 顶上写着"改一边必须改另一边"，但这句话一直没人为它跑过东西；
// 新增两枚正是最容易只改 JS 的那类改动——那样页面底不会变、只有导航条变，
// 症状像"壁纸没生效"，查起来很费时间。
const css = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/app.wxss'), 'utf8')
const cssMissing = []
const cssPageMismatch = []
for (const t of after.THEMES) {
  const block = new RegExp(`\\.${t.cls}\\s*\\{([^}]*)\\}`).exec(css)
  if (!block) { cssMissing.push(t.cls); continue }
  const declared = /--bg-page:\s*(#[0-9a-fA-F]+)/.exec(block[1])
  if (!declared || declared[1].toLowerCase() !== t.page.toLowerCase()) {
    cssPageMismatch.push(`${t.cls}: css ${declared && declared[1]} ≠ js ${t.page}`)
  }
}
ck('每套主题在 app.wxss 里都有对应类名', cssMissing.length === 0, cssMissing.join(' '))
ck('app.wxss 的 --bg-page 与 palette 的 page 同值', cssPageMismatch.length === 0, cssPageMismatch.join(' | '))

// ⑨ 界面字体那三个类名要两边都在：app.wxss（主页面）+ tab 栏组件（样式隔离，引不过去）
const tabCss = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/custom-tab-bar/index.wxss'), 'utf8')
const fontCls = ['font-song', 'font-fang', 'font-kai']
ck('字体类在 app.wxss 里齐全', fontCls.every((c) => css.includes(`.${c}`)))
ck('字体类在 tab 栏组件里也齐全（组件样式隔离）', fontCls.every((c) => tabCss.includes(`.${c}`)))
ck('宋体类把 STSong 放在 Songti SC 前面', /font-song\s*\{[^}]*'STSong',\s*'Songti SC'/.test(css))

// ⑩ 缩略图取色不许被"当前主题"染色：壁纸选择器每一格画的是别的主题，必须显式带自己的 key。
// 这条是真截图里抓到的：停在米白时，米白那一格之外的六格小色块也变成了色阶色。
const thumbDiff = []
for (const t of after.THEMES) {
  after.setActiveTheme('tint-paper')
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const mine = after.toneColor(i, t.key)
    const expect = t.ramp ? t.ramp.steps[Math.abs(i) % t.ramp.steps.length] : before.TONES[Math.abs(i) % before.TONES.length].bg
    if (mine !== expect) thumbDiff.push(`${t.key}/${i}: ${mine} ≠ ${expect}`)
  }
}
ck('缩略图按各自主题取色（不被当前主题染色）', thumbDiff.length === 0, thumbDiff.slice(0, 3).join(' | '))
// 不带 key 时仍然跟着当前主题走——首页搜索卡、新建页那三张靠的是这条
after.setActiveTheme('tint-paper')
ck('不带 key 时按当前主题取色', after.toneColor(0) === after.THEMES.find((x) => x.key === 'tint-paper').ramp.steps[0])

after.setActiveTheme('default')
const bad = results.filter((r) => !r.ok)
console.log(`\n${results.length - bad.length}/${results.length} 过`)
process.exitCode = bad.length ? 1 : 0
