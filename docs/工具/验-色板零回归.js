// 色板改动的零回归尺子：拿改动前那份 palette.js 和改完的这份跑同一批输入，逐个字符串比。
// 用法（在仓库根跑）：node docs/工具/验-色板零回归.js
//   换基线：PALETTE_BASE=<commit> node docs/工具/验-色板零回归.js
// 为什么这么验：这两枚新壁纸动的不是页面底，是"方块按分类取哪支色"——那是 V2 的硬规则②。
// 一旦这条改坏，现有六枚壁纸下所有页面的颜色都会跟着漂，而那种错在截图上很难看出来
// （色相没变、只是深浅差一档）。所以不靠眼睛，靠把改前那份拉出来逐字节比。
// 另外钉一条：海报侧只走 toneFor，界面切到哪套主题都不许改海报出图。
const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')

// 基线钉死在分叉点那个提交上，不写 HEAD：这批一提交，HEAD 里的 palette.js 就是"改后"那份，
// 拿 HEAD 当基线会变成新对旧、永远全绿。
const BASE = process.env.PALETTE_BASE || '2075d2f'
const OLD = `/tmp/palette-old-${BASE.slice(0, 7)}.js`
if (!fs.existsSync(OLD)) {
  // 走 argv 数组、不起 shell：这份文件本身就是被验的对象，不该再拼一次命令行
  const src = execFileSync('git', ['show', `${BASE}:miniprogram/utils/palette.js`], {
    cwd: path.resolve(__dirname, '../..'),
    maxBuffer: 8 * 1024 * 1024,
  })
  fs.writeFileSync(OLD, src)
}
const before = require(OLD)
const after = require(path.resolve(__dirname, '../../miniprogram/utils/palette.js'))

// 基线自检：改前那份不该带整套色阶。带上了说明基线取到了改动之后，
// 下面①②两条就成了自己跟自己比——全绿是假的，宁可直接退出。
if (before.THEMES.some((t) => t.ramp)) {
  console.error(`✗ 基线取错：${BASE} 那份 palette.js 已含色阶主题，比对是空转。用 PALETTE_BASE 指定分叉点。`)
  process.exit(1)
}


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
// 两边不只是"都有"，声明必须逐字节相同：组件那份是抄的，抄漏一个名字就会出现
// "主页面换了字、底部 tab 没换"这种半截效果，而它只在部分机型上看得见。
const decl = (src, cls) => {
  const m = new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`).exec(src)
  return m ? m[0].replace(/\s+/g, ' ') : ''
}
const drift = fontCls.filter((c) => decl(css, c) !== decl(tabCss, c))
ck('两份字体栈逐字节相同（组件那份不许自己漂）', drift.length === 0, drift.join(' '))
// 字体这条只承诺 iOS（站长 09-26 定的：不再为安卓内置字体包，文案里直接注明"仅 iPhone / iPad 可选"）。
// 原来那两条断言写的是"安卓可用的名字必须在链子里"，读起来像我们承诺了安卓；
// 换成断言真正承诺的两件事：首位是苹果那几张字，末位是通用族兜底（命不中也不出错）。
ck('三档首位都是 iOS 那几张字', fontCls.every((c) => {
  const m = /^\.font-\w+ \{ font-family: '(STSong|STFangsong|Kaiti SC)'/.exec(decl(css, c))
  return !!m
}))
ck('三档末位都是通用族兜底', fontCls.every((c) => /(serif|sans-serif); \}$/.test(decl(css, c))))
// 字体入口这条：站长 09-26 用 iPhone 11 真机证伪（iOS 微信同样不认这些系统字体名），
// 那一排已经从外观设置页撤掉。撤得干净要能验出来：页面不许再出现那一排、
// 启动时必须清掉测试期留下的存储，否则就是一个看不见却在生效的开关。
const wpWxml = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/wallpaper/wallpaper.wxml'), 'utf8')
ck('外观设置页已经没有字体那一排', !/font-grid|onFont/.test(wpWxml))
ck('启动时清掉遗留的字体偏好', /removeStorageSync\(UI_FONT_KEY\)/.test(
  fs.readFileSync(path.resolve(__dirname, '../../miniprogram/app.js'), 'utf8')))

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

// ⑪ 主题读法必须收口。这条是代码审查抓出来的：十处页面各写一遍
// `app.globalData.userInfo?.wallpaper || 'default'`，而 401 那一路会把 userInfo 清成 null
// （utils/api.js），那一瞬间任何页面 onShow 都会把 ACTIVE_THEME 写成 default，
// 于是出现"页底是 default、方块是色阶"的混色屏；外观设置页自己却读本机那份，显示"已选淡雅"。
// 所以：任何页面都不许再直接读 userInfo.wallpaper 当主题，只能走 app.getWallpaper()。
const pageDir = path.resolve(__dirname, '../../miniprogram')
// 只看代码行：这几条判据找的是"写法"，而注释里恰好要写下被禁的那种写法来说明为什么禁，
// 不剥注释就会自己判自己红（第一版就是这么踩的）。
const readSrc = (rel) =>
  fs
    .readFileSync(path.join(pageDir, rel), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n')
const TAB_PAGES = ['pages/index/index.js', 'pages/create/create.js', 'pages/me/me.js']
const scanned = ['app.js', 'custom-tab-bar/index.js'].concat(
  fs.readdirSync(path.join(pageDir, 'pages')).flatMap((p) =>
    fs.readdirSync(path.join(pageDir, 'pages', p)).filter((f) => f.endsWith('.js')).map((f) => `pages/${p}/${f}`)
  )
)
const offenders = scanned.filter((rel) => /userInfo\??\.wallpaper\s*\|\|/.test(readSrc(rel)))
ck(`没有任何文件自己拼 userInfo.wallpaper 当主题（扫 ${scanned.length} 个 js）`, offenders.length === 0, offenders.join(' '))

// ⑫ tab 栏的 dark 和字体必须有人推。App 实例上没有 getTabBar（那是 Page 的 API），
// 所以 app.applyTheme 里那句 this.getTabBar?.() 恒为 undefined——原来没人管过 tab 栏，
// 换完壁纸/字体要等整个小程序重开才对。现在由三个 tab 页各自在 onShow 里推一次。
ck('app.applyTheme 不再假装能拿到 tab 栏', !/this\.getTabBar\?\.\(\)/.test(readSrc('app.js')))
const notPushing = TAB_PAGES.filter((rel) => !/getTabBar\(\)\.applyTheme\(/.test(readSrc(rel)))
ck('三个 tab 页各自把壁纸推给 tab 栏', notPushing.length === 0, notPushing.join(' '))

// ⑬ 淡雅两枚的可读性下限。这批的色是"同一支色相只差明度"手挑的，挑的时候只看截图，
//    而方块上那行字是 32rpx（约 16px）粗体——按 WCAG 属于正文档，要 4.5:1。
//    第一版第 4 档只有 3.50 / 3.31，是审查算出来才发现的（截图上看着挺清楚）。
const lin = (v) => (v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
const luma = (h) => { const [r, g, b] = after.hexToRgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) }
const ratio = (a, b) => { const x = luma(a), y = luma(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const lowText = []
const lowEdge = []
for (const t of ramped) {
  t.ramp.steps.forEach((bg, i) => {
    if (ratio(bg, t.ramp.inks[i]) < 4.5) lowText.push(`${t.key} 档${i} ${ratio(bg, t.ramp.inks[i]).toFixed(2)}`)
    // 浅两档与卡底只差 1.2~1.6，方块轮廓全靠那条描边兜住；描边没了就是"方块化在卡上"
    after.setActiveTheme(t.key)
    const style = after.blockSkinFor(i, 1).style
    if (!/--blk-edge:rgba\(/.test(style)) lowEdge.push(`${t.key} 档${i} 无描边`)
  })
  const u = t.ramp.uncategorized
  if (ratio(u.bg, u.ink) < 4.5) lowText.push(`${t.key} 未分类 ${ratio(u.bg, u.ink).toFixed(2)}`)
  if (ratio(u.bg, t.line) < 3) lowEdge.push(`${t.key} 未分类与卡底不足 3:1`)
}
ck('色阶每档字/底 ≥ 4.5:1', lowText.length === 0, lowText.join(' | '))
ck('色阶每档方块都带描边（浅档不化在卡上）', lowEdge.length === 0, lowEdge.join(' | '))

// 同一套里那行校验红字也是手挑的，浅档底上第一版只有 4.0 / 4.2
const lowErr = []
for (const t of ramped) {
  after.setActiveTheme(t.key)
  for (const i of [0, 1, 2]) {
    const err = /--blk-err:(#[0-9a-fA-F]{6})/.exec(after.toneStyle(i))
    if (err && ratio(err[1], t.ramp.steps[i]) < 4.5) lowErr.push(`${t.key} 档${i} ${ratio(err[1], t.ramp.steps[i]).toFixed(2)}`)
  }
}
ck('新建页三张卡的校验红字 ≥ 4.5:1', lowErr.length === 0, lowErr.join(' | '))

// ⑭ tab 栏那颗胶囊：底色不再是一块写死的墨，而是壁纸页面底的派生值（palette.chromeOf）。
//    这一条是 09-28 站长拍板的 D2 改版，覆盖了它原来那条"六枚下必须还是 #23252c"的零回归断言：
//    米白那枚现在是 #443C25（暖墨），八枚各一支，具体值和规划 §1.2 那张表逐一对，
//    对表的那把尺子在 验-列表D2.js，这里只钉"改完之后仍然成立"的三件事。
//    组件读不到 page 的变量，所以值还是由 JS 递进来，这条规矩没变。
const barJs = readSrc('custom-tab-bar/index.js')
const barCss = fs.readFileSync(path.join(pageDir, 'custom-tab-bar/index.wxss'), 'utf8')
// 注释里会引用旧那七处 rgba(255,255,255,.42) 当线索，扫之前先把它剥掉：
// 这条断言要管的是"声明里还有没有硬编码"，不是"文件里有没有这串字"。
const barRule = barCss.replace(/\/\*[\s\S]*?\*\//g, '')
ck('胶囊那一块面由 chromeOf 递进来', /chromeOf\(/.test(barJs) && /var\(--chrome-bg\)/.test(barRule))
ck('胶囊里不再有任何写死的 rgba(255,255,255,…)（图标和文字吃 currentColor）',
  !/rgba\(255,\s*255,\s*255/.test(barRule), (barRule.match(/rgba\(255[^)]*\)/g) || []).join(' '))
ck('深色那两枚不再有第二块胶囊底（#1a1c22 那种本地常量）', !/\.tab-bar-dark/.test(barRule))

// ⑯ 经典三款的纸色（站长 09-26："版式一格不动，只把分类蓝换成宣纸那一族；两档都要"）。
//    这两档是写死的常量，所以对比度可以一次算清；更要紧的是别哪天又有人在这三套里
//    直接把分类彩色拿回来。
const posterSrc = fs.readFileSync(path.join(pageDir, 'utils/poster.js'), 'utf8')
// 两档的色值从 poster.js 现读，不在这里抄一份：抄的那份改不动，
// 哪天 poster.js 换了纸色这条还是绿的，等于钉了个假值。
const paperConst = (nm) => {
  const m = new RegExp(`const ${nm} = \\{([^}]*)\\}`).exec(posterSrc)
  const hex = (k) => '#' + ((m && new RegExp(`${k}:\\s*'#([0-9A-Fa-f]{6})'`).exec(m[1])) || [])[1]
  return { bg: hex('bg'), ink: hex('ink') }
}
const PAPER_A = paperConst('PAPER_A')
const PAPER_B = paperConst('PAPER_B')
ck('A 纯宣 墨/纸 ≥ 4.5:1', ratio(PAPER_A.bg, PAPER_A.ink) >= 4.5, ratio(PAPER_A.bg, PAPER_A.ink).toFixed(2))
ck('B 黛青 纸/黛 ≥ 4.5:1', ratio(PAPER_B.bg, PAPER_B.ink) >= 4.5, ratio(PAPER_B.bg, PAPER_B.ink).toFixed(2))
const leaked = ['planCard', 'planQuote', 'planBlock'].filter((fn) => {
  const m = new RegExp(`function ${fn}\\(ctx, d\\) \\{[\\s\\S]*?\\n\\}`).exec(posterSrc)
  return m && /toneFor\(note\.category_id\)/.test(m[0])
})
ck('经典三款不再直接取分类彩色（走 paperOf）', leaked.length === 0, leaked.join(' / '))
ck('两档由分类明暗决定，不是随手挑', /lumOf\(toneFor\(categoryId\)\.bg\)/.test(posterSrc))

// ⑰ 外观设置这一屏改成"手机预览 + 横滑壁纸条"（站长 09-26：只留色块和名字（两个字），
//    超出就左右滑；点条子只试看，点上面那部手机才换上）。
//    名字这条得钉住：一格只有 124rpx 宽，三个字就开始挤。
//    更要紧的是"点条子不许真换"——这条是这一屏的交互契约，一旦有人图省事把它接回
//    applyTheme，预览就成了摆设，而且用户点一下整站变色，退都退不回来。
const liveOf = (rel) =>
  fs
    .readFileSync(path.join(pageDir, rel), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')
// 抓方法体。抓不到要当成失败，不能当成"没有违例"——那是假绿。
const fnBody = (src, name) => {
  const m = new RegExp(`\\b${name}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n  \\}`).exec(src)
  return m ? m[1] : null
}
const wpJs = readSrc('pages/wallpaper/wallpaper.js')
const wpCss = fs.readFileSync(path.join(pageDir, 'pages/wallpaper/wallpaper.wxss'), 'utf8')
const i18nSrc = readSrc('utils/i18n.js')
ck('八枚壁纸的名字全是两个字', after.THEMES.every((x) => [...x.label].length === 2),
  after.THEMES.map((x) => x.label).join(' '))
const staleName = scanned.concat('utils/palette.js', 'utils/i18n.js').filter((rel) => /米白一色|雨过青/.test(liveOf(rel)))
ck('两枚的旧名在界面上改净（注释里留着当线索）', staleName.length === 0, staleName.join(' '))
ck('「整套色阶」那个角标撤干净了', !/tint-flag|tintedFlag/.test(wpWxml + wpCss + i18nSrc))
ck('预览那一屏的颜色由 JS 算字面值，不吃本页变量', /function mockOf/.test(wpJs) && /\{\{mock\.page\}\}/.test(wpWxml))
ck('预览里那几块方块按被预览那套主题取档', /toneColor\([^)]*theme\.key[^)]*\)/.test(wpJs))
const pvBody = fnBody(wpJs, 'onPreview')
ck('点色块只试看：不碰主题也不写库', !!pvBody && !/applyTheme|setWallpaper|updateWallpaper/.test(pvBody),
  pvBody ? '' : '没抓到 onPreview 函数体')
const apBody = fnBody(wpJs, 'onApply')
ck('点上面那部手机才真换', /bindtap="onApply"/.test(wpWxml) && !!apBody && /this\.applyWallpaper\(previewKey\)/.test(apBody),
  apBody ? '' : '没抓到 onApply 函数体')
ck('八枚各有 id，进来能滚到在用那枚', /id="wp-\{\{item\.key\}\}"/.test(wpWxml) && /scroll-into-view="\{\{intoView\}\}"/.test(wpWxml)
  && /intoView: `wp-\$\{current\}`/.test(wpJs))
ck('在用和试看两个标记不重叠', /previewing && item\.key === previewKey/.test(wpWxml))

// ⑱ 小样画布的圆角必须画进位图。真机上 `canvas type="2d"` 是原生层，CSS 的 border-radius
//    不吃（模拟器把它当 DOM 画，所以模拟器里"看着是圆的"是假证据）——圆角不进位图，
//    四个直角就会戳到选中框的圆弧外面（站长 09-26 真机截图里那条）。
//    这条没法在模拟器里自证（两种圆角看着一样），所以钉的是"落笔前确实裁过"这个动作。
const shareJs = readSrc('pages/share/share.js')
const profJs = readSrc('pages/profile/profile.js')
ck('poster 把 clipRounded 交出来了', /clipRounded,/.test(readSrc('utils/poster.js')))
// 必须按"那一个画小样的函数"来比先后：分享页里 paintLayers 出现两次（大的预览也用它），
// 全文找第一个会把顺序比反。
for (const [nm, src, fn] of [['分享页那一排', shareJs, 'renderPicker'], ['卡片模板那十格', profJs, 'renderThumbs']]) {
  const b = fnBody(src, fn)
  const at = b ? b.indexOf('clipRounded') : -1
  const paint = b ? b.indexOf('paintLayers') : -1
  ck(`${nm}：先裁圆角再落笔`, at >= 0 && paint >= 0 && at < paint,
    b ? `clip@${at} paint@${paint}` : `没抓到 ${fn} 函数体`)
}

// ⑲ 小样那一排的三件事，都是 09-26 代码审查里翻出来的：
//    一、每格的真实高度必须在落笔之前交给视图层。骨架里那是个 4:3 的占位数，
//        等整轮画完再一次性 setData，画的过程中这一格就被压在占位框里竖着挤——
//        圆角是画进位图的（⑱），显示框一歪，圆角看着就是椭圆，正合站长圈的那类毛病。
//    二、落笔前必须再对一次轮次号。解码头像慢到四秒，只在循环头对，
//        旧那一遍可能后落笔，把新那一遍盖掉。
//    三、画布底色要透明、选中态不许改 border-width。前者留着灰底就是在四个角外
//        垫直角灰斑；后者一改，格子里定宽的画布整块挪 1rpx，一排跟着抖。
const shareCss = fs.readFileSync(path.join(pageDir, 'pages/share/share.wxss'), 'utf8')
const profCss = fs.readFileSync(path.join(pageDir, 'pages/profile/profile.wxss'), 'utf8')
const cssRule = (src, sel) => {
  const m = new RegExp(`\\n\\.${sel}\\s*\\{([^}]*)\\}`).exec(src)
  return m ? m[1] : null
}
for (const [nm, src, fn] of [['分享页那一排', shareJs, 'renderPicker'], ['卡片模板那十格', profJs, 'renderThumbs']]) {
  const b = fnBody(src, fn)
  // 逐格改高度写的是 `...].h`]:` 这种路径 key，找得到它才谈得上先后
  const hSet = b ? b.indexOf('].h`]') : -1
  const paint = b ? b.indexOf('paintLayers') : -1
  ck(`${nm}：落笔前就把这一格的真实高度交给视图层`, hSet >= 0 && paint >= 0 && hSet < paint,
    b ? `逐格高度@${hSet} 落笔@${paint}` : `没抓到 ${fn} 函数体`)
}
{
  const b = fnBody(profJs, 'renderThumbs')
  const paint = b ? b.indexOf('paintLayers') : -1
  const at = b && paint >= 0 ? b.slice(0, paint).lastIndexOf('_renderGen !== gen') : -1
  // 光"对过两次号"不够，要紧的是最后一次对号到落笔之间不能再有 await：
  // 一 await 就让出主线程，旧那一遍完全可能在这缝里被新那一遍插队。
  const gap = at >= 0 ? b.slice(at, paint) : ''
  ck('卡片模板那十格：落笔前对号，且对完到落笔之间不让出主线程',
    at >= 0 && !/await /.test(gap), b ? `最后一次对号@${at}，落笔@${paint}，中间${/await /.test(gap) ? '有 await' : '没有 await'}` : '没抓到 renderThumbs 函数体')
}
for (const [nm, css, canvasSel, onSel] of [['分享页那一排', shareCss, 'pick-canvas', 'pick-on'], ['卡片模板那十格', profCss, 'cell-canvas', 'cell-on']]) {
  const rule = cssRule(css, canvasSel)
  ck(`${nm}的画布底色透明（不留直角灰斑）`, !!rule && /background:\s*transparent/.test(rule),
    rule ? rule.trim().replace(/\s+/g, ' ') : `没读到 .${canvasSel}`)
  const on = cssRule(css, onSel)
  ck(`${nm}的选中态不改 border-width`, !!on && !/border-width/.test(on) && /box-shadow/.test(on),
    on ? on.trim().replace(/\s+/g, ' ') : `没读到 .${onSel}`)
}

after.setActiveTheme('default')
const bad = results.filter((r) => !r.ok)
console.log(`\n${results.length - bad.length}/${results.length} 过`)
process.exitCode = bad.length ? 1 : 0
