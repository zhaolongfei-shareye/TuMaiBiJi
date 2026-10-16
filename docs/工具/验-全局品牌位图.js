// 左上角那枚书法位图"只在有背景图那一态出现"的静态尺子（不连模拟器，纯读文件）。
// 跑法：node docs/工具/验-全局品牌位图.js
//
// 站长 10-16 夜两句话，第二句把第一句收窄：
//   ①「之前首屏和二屏不是有左上角的图片标题吗？这个图片全量放在其他页面左上角，
//      原来左上角的纯文字标题替换最顶上的标题。」
//   ②「看到好内容 XXXXX 这个图片，不需要所有页面加，只需要在有背景图状态下加。」
// ⇒ 现在这一格是**两态**：铺了背景照片 ⇒ 那枚书法位图；没铺 ⇒ 原来那行纯文字。
//   导航条那一栏两态都念各屏自己那行原文字（①的后半句，他没撤回）。
// 首屏／二屏本来就是图（正本，没动）。分类页与卡片模板页**撤回来**：那两屏没有"背景照片"那一态，
//   按②就没有画图的资格 ⇒ 它们回到文字版（这一条由下面的负面清单钉住，不许哪天又"为了统一"铺回去）。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const read = (rel) => fs.readFileSync(P(rel), 'utf8')
const NC = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— ' + extra : ''))
}

const SRC = '/assets/title-heading.png'
const TWO_STATE = [
  { key: '笔记列表／卡片列表', page: 'pages/index/index', cls: 'h1', txt: 'h1-txt', host: '.container', nav: 'notesHeading' },
  { key: '我的（设置／关于两档）', page: 'pages/me/me', cls: 'h1', txt: 'h1-txt', host: '.head-band', nav: null },
]

/* ---------- 1. 两态都在：有图⇒位图，没图⇒原来那行字 ---------- */
TWO_STATE.forEach((s) => {
  const wxml = read(`${s.page}.wxml`)
  const img = (wxml.match(new RegExp(`<image[^>]*class="${s.cls} brand-title"[^>]*>`)) || [''])[0]
  ok(`${s.key}：有背景图那一态画的是首屏那张正本（wx:if 吃 bgSrc，不是常驻）`,
    /wx:if="\{\{bgSrc\}\}"/.test(img) && img.includes(`src="${SRC}"`) && img.includes('mode="widthFix"'),
    img || '(摸不到那一枚 image)')
  const elseTag = (wxml.match(new RegExp(`<view wx:else class="${s.cls} ${s.txt}"[^>]*>`)) || [''])[0]
  ok(`${s.key}：无图那一态确实存在且吃字典（不抄字面量）`,
    !!elseTag && /\{\{[^}]*t\.[a-zA-Z]/.test(wxml.slice(wxml.indexOf(elseTag), wxml.indexOf(elseTag) + 220)),
    elseTag || '(没有 wx:else 那一支 ⇒ 无图态没字了)')
  const aria = (img.match(/aria-label="\{\{([^"]+)\}\}"/) || [, ''])[1]
  ok(`${s.key}：位图那一枚挂了 aria-label（屏读不许只剩"图片"），值与导航条同一处来源`,
    /t\.[a-zA-Z]+/.test(aria) || /\?\s*t\./.test(aria), aria || '(没有 aria-label)')
})

/* ---------- 2. 一份真相：尺寸与那一档透明度只在 app.wxss 写一次 ---------- */
const appCss = NC(read('app.wxss'))
const brand = (appCss.match(/\.brand-title\s*\{([^}]*)\}/) || [, ''])[1]
ok('app.wxss 的 .brand-title 给宽 228rpx ＋ 不透明度 .8（与首屏正本同一档）',
  /width:\s*228rpx/.test(brand) && /opacity:\s*0\.8/.test(brand), brand.trim())
ok('这一份只有一处（两页的 wxss 里不许再出现第二个 .brand-title 定义）',
  (appCss.match(/\.brand-title\s*\{/g) || []).length === 1
  && TWO_STATE.every((s) => !/\.brand-title\s*\{/.test(NC(read(`${s.page}.wxss`)))))
const createSelf = (NC(read('pages/create/create.wxss')).match(/(?:^|\n)\.page-title\s*\{([^}]*)\}/) || [, ''])[1]
ok('首屏那一枚的宽度与共用皮同一个数（正本与派生不是两个数）',
  /width:\s*228rpx/.test(createSelf), createSelf.trim().slice(0, 60))

/* ---------- 3. `.h1` 只管落点，文字声明单独一支挂在 `.h1-txt` 上 ---------- */
TWO_STATE.forEach((s) => {
  const css = NC(read(`${s.page}.wxss`))
  const pos = (css.match(/(?:^|\n)\.h1\s*\{([^}]*)\}/) || [, ''])[1]
  const txt = (css.match(new RegExp(`(?:^|\\n)\\.${s.txt}\\s*\\{([^}]*)\\}`)) || [, ''])[1]
  ok(`${s.key}：.h1 里只有位置（没有 font-*／color——位图不吃它们，留着就是"看着有规则其实不生效"）`,
    !/(font-size|font-weight|letter-spacing|line-height|color):/.test(pos), pos.trim().slice(0, 70))
  ok(`${s.key}：文字那一支 .${s.txt} 四条齐全（字号／字重／字距／字色）`,
    /font-size:/.test(txt) && /font-weight:/.test(txt) && /letter-spacing:/.test(txt) && /color:/.test(txt),
    txt.trim().slice(0, 70))
})

/* ---------- 4. 深浅翻色：有图那一态才可能反白，且各页一处 ---------- */
ok('笔记页与「我的」各挂一处 invert(1)，条件都是"铺了图且图不浅"',
  /\.container\.has-bg:not\(\.bg-light\) \.h1\s*\{[^}]*filter:\s*invert\(1\)/.test(NC(read('pages/index/index.wxss')))
  && /\.head-band\.has-bg:not\(\.bg-light\) \.h1\s*\{[^}]*filter:\s*invert\(1\)/.test(NC(read('pages/me/me.wxss'))))
ok('两页都不许留"浅图态把这一格翻回墨"的空 color 覆写（位图不吃 color，无图态压根不挂 has-bg）',
  !/\.has-bg\.bg-light \.h1\s*\{/.test(NC(read('pages/index/index.wxss')))
  && !/\.has-bg\.bg-light \.h1\s*\{/.test(NC(read('pages/me/me.wxss'))))

/* ---------- 5. 导航条报的是当前这一屏 ---------- */
ok('笔记页导航条＝notesHeading（原来左上角那行字）',
  /setNavTitle\('notesHeading', lang\)/.test(read('pages/index/index.js')))
ok('「我的」导航条跟着当前那一档（设置／关于），且切档之后重设一次',
  /setNavTitle\(\s*this\.data\.tab === 'about' \? 'pillAbout' : 'pillSettings'/.test(read('pages/me/me.js'))
  && /this\.syncNavTitle\(\)/.test(read('pages/me/me.js').split('onTab(e)')[1] || ''))
ok('首屏导航条仍念 appName（那一屏左上角本来就是图，顶上不再报第二个页名）',
  /setNavTitle\('appName', lang\)/.test(read('pages/create/create.js')))
ok('白天那枚「图麦笔记 | 创建」键两门都撤净（没人渲染它了，留着就是死键）',
  !/homeTitle/.test(read('utils/i18n.js')))

/* ---------- 6. 负面清单：没有"背景照片那一态"的屏，不许铺这枚图 ---------- */
const NO_BG = ['pages/categories/categories', 'pages/wallpaper/wallpaper',
  'pages/detail/detail', 'pages/write/write', 'pages/profile/profile', 'pages/share/share']
NO_BG.forEach((p) => {
  ok(`${p}：这一屏不铺那枚位图（它没有背景照片那一态／或那一格是内容标题，不是页名）`,
    !new RegExp(`src="${SRC}"`).test(read(`${p}.wxml`)))
})

/* ---------- 7. 窗外那档暗纱：两扇窗共用一份（站长 10-16 夜第二句「卡片详情页外面也要做毛玻璃」） ---------- */
const idxCss = NC(read('pages/index/index.wxss'))
const idxWxml = read('pages/index/index.wxml')
const maskRules = (idxCss.match(/\.float-mask\s*\{[^}]*\}/g) || [])
ok('窗外那档暗纱写在 `.float-mask` 本体上（只有一处定义，两扇窗共用一份，不各抄一遍）',
  maskRules.length === 1 && /background:\s*rgba\(8, 10, 14, 0\.45\)/.test(maskRules[0])
  && /backdrop-filter:\s*var\(--glass-bf\)/.test(maskRules[0]) && /-webkit-backdrop-filter/.test(maskRules[0]),
  `${maskRules.length} 处定义`)
ok('详情那张窗与卡片成品那张窗都用 `.float-mask`（没有第二支"只给其中一扇"的变体类名）',
  (idxWxml.match(/class="float-mask"/g) || []).length === 2 && !/float-mask [a-z-]+dim/.test(idxWxml),
  `用到 ${(idxWxml.match(/class="float-mask[^"]*"/g) || []).join('、')}`)
ok('那档纱不吃五档心情色（五档那五支全是浅色，做不出暗纱；要跟着心情就得新起第六枚色——他 10-11 定过不许）',
  !/var\(--glass-veil/.test(maskRules[0] || ''))

console.log(`${fails.length ? '✗' : '✓'} 全局品牌位图（只在有背景图那一态）：${pass}/${pass + fails.length} 条通过`)
fails.slice(0, 12).forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
