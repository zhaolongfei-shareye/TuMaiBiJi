// 笔记列表"头部铺图（效果图里的 C 方案）"这一批的静态尺子（不连模拟器，纯读文件）。
// 跑法：node docs/工具/验-列表头部铺图.js
// 要守的东西：① 图和新建页同一个取图口、同一个开关，这一页不再开第二个上传入口；
// ② 只铺头部那一段，列表落在一张圆角朝上的纸上；③ 关掉开关这一屏必须一字不差回到 D2；
// ④ 界面上每一句提到这张图范围的话，都要跟着改成"首页 + 笔记页头部"。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const read = (rel) => fs.readFileSync(P(rel), 'utf8')

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— ' + extra : ''))
}

const wxml = read('pages/index/index.wxml')
const wxssRaw = read('pages/index/index.wxss')
const wxss = wxssRaw.replace(/\/\*[\s\S]*?\*\//g, '')
const cjs = read('pages/index/index.js')
const i18n = read('utils/i18n.js')
const createWxss = read('pages/create/create.wxss')

// 选择器必须顶到行首才算"这一段自己"，但同一个选择器可能出现在两处：
// `.container.has-bg .sheet` 既是四条并列抬层规则的最后一条，又是纸自己那一条。
// 所以给 seg 再带一个 hint，命中多段时挑含关键字的那一段。
const seg = (src, sel, hint) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const all = [...src.matchAll(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1])
  if (!all.length) return ''
  return hint ? (all.find((b) => b.includes(hint)) || '') : all[0]
}

// ---------- 1. 结构 ----------
ok('这一页铺了 <image> 组件（wxss 的 background-image 不认包内本地文件）',
  /<image wx:if="\{\{bgSrc\}\}" class="page-bg" src="\{\{bgSrc\}\}" mode="aspectFill" \/>/.test(wxml))
ok('有压暗罩那一层', /<view wx:if="\{\{bgSrc\}\}" class="page-scrim"><\/view>/.test(wxml))
ok('铺图时容器带 has-bg', /\{\{bgSrc \? 'has-bg' : ''\}\}/.test(wxml))
ok('列表被包进一张纸里', /<view class="sheet">[\s\S]*class="notes-list"[\s\S]*<\/view>\s*<\/view>\s*<\/view>/.test(wxml))
ok('三个状态（加载/空/列表）都在这张纸上，一个都没落在纸外',
  (wxml.match(/class="(loading|empty|notes-list)"/g) || []).length === 3
  && wxml.indexOf('class="sheet"') < wxml.indexOf('class="loading"'))

// ---------- 2. 取图口只有一个 ----------
ok('取图走 poster.homeBg()，和新建页是同一个函数',
  /const bgSrc = poster\.homeBg\(\)/.test(cjs) && /\n {6}bgSrc,/.test(cjs))
// 内联的自定义属性优先级高于任何选择器：铺图那一态必须整串不发，
// 否则 CSS 里那三行"图上换纸白"一行都翻不动（真跑第一版就是这么红的）。
ok('铺图时那串 chrome 变量整串不发（searchSkin 留空）',
  /searchSkin: bgSrc \? '' : chromeOf\(wallpaper\)\.style/.test(cjs))
ok('这一页不出现选图接口（一个功能只留一个入口）', !/chooseMedia|chooseImage/.test(cjs))
ok('这一页不出现"写死的图片路径"', !/['"]\/assets\/home-bg/.test(cjs + wxml))
ok('data 里 bgSrc 起手是空串（模块加载时存储还没读）', /bgSrc: ''/.test(cjs))
ok('导航条只在铺图时刷墨色',
  /if \(this\.data\.bgSrc\) \{\s*wx\.setNavigationBarColor\(\{[^}]*#181a20/.test(cjs))
ok('墨色那一档和新建页是同一个值',
  /#181a20/.test(read('pages/create/create.js')) && /#181a20/.test(cjs))

// ---------- 3. 只铺头部那一段 ----------
const bg = seg(wxss, '.page-bg')
const scrim = seg(wxss, '.page-scrim')
const BAND = Number(/height:\s*(\d+)rpx/.exec(bg)[1])
ok('图带是 fixed（滚到哪儿都守在头部那一段）', /position: fixed/.test(bg) && /position: fixed/.test(scrim))
ok('图带从视口顶起、高 700rpx', BAND === 700 && /top: 0/.test(bg), `实得 ${BAND}`)
ok('罩层和图带同高', Number(/height:\s*(\d+)rpx/.exec(scrim)[1]) === BAND)
ok('图在 0、罩在 1（顺序不能反，否则纸压不住图）', /z-index: 0/.test(bg) && /z-index: 1/.test(scrim))
ok('头部三块 + 纸都被抬到罩之上',
  /\.container\.has-bg \.page-head,[\s\S]{0,200}?\.container\.has-bg \.sheet\s*\{[^}]*position: relative[^}]*z-index: 2/.test(wxss))
ok('罩层停点用新建页那串的头两档（0.58 起 0.44 收）',
  /rgba\(18, 20, 26, 0\.58\)/.test(scrim) && /rgba\(18, 20, 26, 0\.44\)/.test(scrim)
  && !/0\.72/.test(scrim))

// ---------- 4. 纸：满宽、圆角朝上、只有铺图时才有面 ----------
const sheetPlain = seg(wxss, '.sheet')
const sheetBg = (hint) => seg(wxss, '.container.has-bg .sheet', hint)
ok('不铺图时这张纸是透明的（这一屏还是 D2 那一版）', /background: transparent/.test(sheetPlain))
ok('不铺图时不带圆角和描边',
  !/border-radius/.test(sheetPlain) && !/border-top/.test(sheetPlain))
ok('铺图时纸吃壁纸底色，和容器无缝',
  /background: var\(--bg-page\)/.test(sheetBg('--bg-page')))
ok('圆角只朝上，两个上角 40、下面直角',
  /border-radius: var\(--r-card\) var\(--r-card\) 0 0/.test(sheetBg('border-radius')))
ok('纸满宽：左右负出容器的 24 内缩',
  /margin: 0 calc\(0px - var\(--sp-3\)\)/.test(sheetBg('margin')))
ok('纸内上沿留 40rpx（与效果图同）',
  /padding: 40rpx var\(--sp-3\) 0/.test(sheetBg('padding')))
ok('纸上沿有一条描边（和行卡同一档）',
  /border-top: var\(--w-edge\) solid var\(--card-edge\)/.test(sheetBg('border-top')))

// ---------- 5. 压在图上的那三块面 ----------
const cardBg = seg(wxss, '.container.has-bg .sc-card', '--chrome-bg')
ok('搜索条在图上翻成纸白那一面', /--chrome-bg: #f2efe9/.test(cardBg) && /--chrome-ink: #23252c/.test(cardBg))
ok('翻的是变量不是逐条覆盖（子元素一条都不用改）',
  !/\.container\.has-bg \.sc-input\s*\{/.test(wxss) && !/\.container\.has-bg \.sc-go\s*\{/.test(wxss))
ok('搜索条在图上有一条投影，和录入胶囊同档',
  /box-shadow: 0 18rpx 46rpx rgba\(8, 10, 14, 0\.42\)/.test(cardBg))
const chipIdle = seg(wxss, '.container.has-bg .chip')
ok('未选中的分类 chip 在图上垫一层暗玻璃',
  /background: rgba\(18, 20, 26, 0\.42\)/.test(chipIdle) && /color: #f2efe9/.test(chipIdle))
ok('描边用 inset，不会把 56 那一档撑高', /box-shadow: inset 0 0 0 var\(--w-edge\)/.test(chipIdle))
ok('选中的 chip 换成纸白、并撤掉那圈 inset',
  /background: #f2efe9/.test(seg(wxss, '.container.has-bg .chip.active'))
  && /box-shadow: none/.test(seg(wxss, '.container.has-bg .chip.active')))
ok('页头两行是纸白，档位抄新建页那两行',
  /color: rgba\(242, 239, 233, 0\.96\)/.test(seg(wxss, '.container.has-bg .page-title'))
  && /color: rgba\(242, 239, 233, 0\.95\)/.test(seg(wxss, '.container.has-bg .page-stats')))
ok('行卡那一段没被顺手改色（分类两档仍从 palette 递进来）',
  /color: var\(--cat-ink\)/.test(seg(wxss, '.cat')) && /background: var\(--cat-dot\)/.test(seg(wxss, '.cat-dot')))

// ---------- 6. 界面上每一句话都要跟着改口径 ----------
ok('外观设置那句话不再写"只铺首页"', !/只铺首页|Home page only/.test(i18n))
ok('那句话提了笔记页头部', /笔记页头部/.test(i18n) && /head of the notes list/.test(i18n))
ok('卡片模板那句也提了笔记页', /垫在笔记页头部/.test(i18n))
ok('开关那一格的名字不再自称"首页背景图"', /homeBgSection: '背景图'/.test(i18n))
ok('中英文键数仍然相等',
  (i18n.match(/^ {4}[a-zA-Z]+: /gm) || []).length % 2 === 0)

// ---------- 7. 新建页那一条链路没被带坏 ----------
ok('新建页的整页铺图仍在（这一批只加列表头部，没改首页）',
  /height: 100vh/.test(seg(createWxss, '.page-bg')))
ok('新建页的罩层仍是完整七档（含底部 0.72）', /0\.72/.test(createWxss))

console.log(`${fails.length ? '✗' : '✓'} 列表头部铺图 静态：${pass}/${pass + fails.length} 条通过`
  + `　图带高 ${BAND}rpx`)
fails.forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
