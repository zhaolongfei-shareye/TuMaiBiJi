// 中英文缺口的静态尺子（不联网、不开模拟器）。
// 跑法：node docs/工具/验-中英文缺口.js
//
// 站长 10-01 晚第八条：「再看下中英文版，哪些中文还未翻译成英文的，统一修改」。
// 排查下来，缺口**全在 i18n.js 之外**——字典两边键值一直是齐的，漏的是四处硬编码：
// 关于页那两大段说明、壁纸名、介绍语、还有一批写死的全角冒号。
// 所以光测字典对等是不够的，得连"上屏的字"一起扫。这里钉三层：
//   ① 字典层：两份键集相等、英文侧不许夹汉字；
//   ② 模板层：wxml 注释和 {{…}} 之外不许有汉字，冒号一律走 {{t.colon}}；
//   ③ 数据层：字典之外的文案表（palette / poster / appInfo / about）各自配英文镜像，
//      且两份条目数相等——条数一错，英文态底下就空出一格。
const fs = require('fs')
const path = require('path')

const MP = path.resolve(__dirname, '../../miniprogram')
const read = (rel) => fs.readFileSync(path.join(MP, rel), 'utf-8')

const CJK = /[㐀-䶿一-鿿豈-﫿　-〿぀-ヿ＀-￯]/
// 大写字母串不算汉字；这里只关心"上屏能看到中文"
const hasCjk = (s) => CJK.test(String(s))

let n = 0
const fails = []
function ok(name, cond, extra = '') {
  n += 1
  if (!cond) fails.push(name + (extra ? ` —— ${extra}` : ''))
}

// ---------------- ① 字典层 ----------------
const i18n = require(path.join(MP, 'utils/i18n.js'))
const zh = i18n.texts('zh')
const en = i18n.texts('en')
const zhKeys = Object.keys(zh).sort()
const enKeys = Object.keys(en).sort()
ok(`两份键集相等（zh ${zhKeys.length} / en ${enKeys.length}）`,
  zhKeys.length === enKeys.length && zhKeys.join('|') === enKeys.join('|'),
  (() => {
    const a = zhKeys.filter((k) => !(k in en))
    const b = enKeys.filter((k) => !(k in zh))
    return a.length || b.length ? `仅zh: ${a.join(',')} 仅en: ${b.join(',')}` : ''
  })())
const zhEmpty = zhKeys.filter((k) => zh[k] === undefined || zh[k] === null || zh[k] === '')
ok('zh 没有空值键', zhEmpty.length === 0, zhEmpty.join(','))
const enLeak = enKeys.filter((k) => hasCjk(en[k]))
ok('en 值里不夹汉字', enLeak.length === 0, enLeak.join(','))
// colon 是这批新加的：英文侧必须是半角冒号 + 空格，不然「Author:张三」贴在一起
ok('colon 两枚都在（zh 全角 / en 半角带空格）',
  zh.colon === '：' && en.colon === ': ', JSON.stringify([zh.colon, en.colon]))

// 这一批为补缺口新加的键，缺一个就是"改了页面没进字典"
const NEW_KEYS = ['colon', 'aboutTabIntro', 'aboutTabFeatures', 'aboutTabPrivacy',
  'aboutPrivacyLead', 'aboutUpdatedAtLabel', 'aboutUpdatedAt',
  'aboutVersionRow', 'aboutEntityRow', 'aboutEntityValue', 'aboutAccountRow']
NEW_KEYS.forEach((k) => ok(`字典有新键 ${k}`, k in zh && k in en))

// wxml / js 里 {{t.xxx}} 与 t('xxx') 引用的键必须两边都在——
// 打错一个字母在英文态是空白，在中文态也是空白，肉眼很容易漏。
const referenced = new Set()
function collectRefs(file) {
  const src = file
  const inter = src.match(/\{\{\s*t\.([A-Za-z0-9_]+)/g) || []
  inter.forEach((m) => referenced.add(m.replace(/^.*?\bt\./, '')))
  const calls = src.match(/\bt\(\s*['"]([A-Za-z0-9_]+)['"]/g) || []
  calls.forEach((m) => referenced.add(m.match(/['"]([A-Za-z0-9_]+)['"]/)[1]))
}
const touched = []
function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return walk(full)
    if (/\.(wxml|js)$/.test(e.name) && !/utils\/i18n\.js$/.test(full)) {
      touched.push(full)
    }
  })
}
walk(MP)
touched.forEach((f) => collectRefs(read(path.relative(MP, f))))
const missing = [...referenced].filter((k) => !(k in zh) || !(k in en)).sort()
ok(`引用的 ${referenced.size} 个键两边字典都有`, missing.length === 0, missing.join(','))

// ---------------- ② 模板层 ----------------
// 白名单：两处汉字是故意留的——
//   create.wxml 语言条上的「中」：语言名用各自文字是本行业惯例（English/中文）；
//   share/view.wxml 的「麦」：品牌占位字，站长 09-24 定过一次（#118）。
const CJK_ALLOW = {
  'pages/create/create.wxml': ['中'],
  'pages/share/view.wxml': ['麦'],
}
const wxmls = touched.filter((f) => f.endsWith('.wxml')).map((f) => path.relative(MP, f))
wxmls.forEach((rel) => {
  let src = read(rel)
  src = src.replace(/<!--[\s\S]*?-->/g, '')
  src = src.replace(/\{\{[\s\S]*?\}\}/g, '')
  const lines = src.split('\n')
    .map((ln, i) => ({ ln, i: i + 1 }))
    .filter(({ ln }) => CJK.test(ln))
    .filter(({ ln }) => !(CJK_ALLOW[rel] || []).some((g) => ln.includes(g)))
  ok(`${rel} 没有写死的中文`, lines.length === 0,
    lines.map((x) => `${x.i}: ${x.ln.trim().slice(0, 40)}`).join(' | '))
})
// 全角冒号一律走 {{t.colon}}；上面 strip 掉 {{…}} 之后还留着的就漏网了
const colons = wxmls
  .map((rel) => {
    const src = read(rel).replace(/<!--[\s\S]*?-->/g, '').replace(/\{\{[\s\S]*?\}\}/g, '')
    return { rel, hits: (src.match(/：/g) || []).length }
  })
  .filter((x) => x.hits)
ok('wxml 里没有裸的全角冒号', colons.length === 0,
  colons.map((x) => `${x.rel}×${x.hits}`).join(', '))

// ---------------- ③ 数据层 ----------------
const palette = require(path.join(MP, 'utils/palette.js'))
ok('八张壁纸都有英文名', palette.THEMES.every((t) => t.labelEn && !hasCjk(t.labelEn)),
  palette.THEMES.filter((t) => !t.labelEn || hasCjk(t.labelEn)).map((t) => t.key).join(','))
palette.THEMES.forEach((t) => {
  ok(`${t.key} 的英文态是 labelEn`, palette.themeLabel(t.key, 'en') === t.labelEn)
  ok(`${t.key} 的中文态还是本名`, palette.themeLabel(t.key, 'zh') === t.label)
})
// themeLabel 认不出壁纸名时跟着 themeOf 兜到第一套（不是空串、不是崩）——
// 外观条上"当前"那一格和本机存的老壁纸名都可能落在这个分支上。
ok('themeLabel 认不出时兜到第一套',
  palette.themeLabel('nope', 'en') === palette.THEMES[0].labelEn &&
  palette.themeLabel('nope', 'zh') === palette.THEMES[0].label)

// poster.js 只读文本不 require——它模块加载时就要碰 wx，静态尺子没必要装替身。
const tplSrc = read('utils/poster.js')
const tplNames = (tplSrc.match(/label: '[^']*', labelEn: '[^']*'/g) || [])
ok('海报模板每条都带 labelEn', tplNames.length >= 10, `只找到 ${tplNames.length} 条`)
ok('模板分组两枚都带 labelEn', /group: 'classic'[\s\S]*labelEn/.test(tplSrc) &&
  tplSrc.split('\n').filter((l) => /const TEMPLATE_GROUPS/.test(l)).length === 1 &&
  (tplSrc.match(/id: '(classic|bold)', label: '[^']*', labelEn: '[^']*'/g) || []).length === 2)

const appInfo = require(path.join(MP, 'utils/appInfo.js'))
ok('appInfo 导出 introLead 函数', typeof appInfo.introLead === 'function')
ok('introLead 英文态无汉字', !hasCjk(appInfo.introLead('en')) && appInfo.introLead('en').length > 40)
ok('introLead 中文态与英文态不同文', appInfo.introLead('zh') !== appInfo.introLead('en') && hasCjk(appInfo.introLead('zh')))
ok('introLead 传别的语言时兜回中文', appInfo.introLead('fr') === appInfo.introLead('zh'))
// INTRO_LEAD 这个旧导出已经被换掉；谁还按老名字 import 就会拿到 undefined（页面上是空白）
ok('INTRO_LEAD 旧导出已移除', appInfo.INTRO_LEAD === undefined)
const stillOld = touched
  .map((f) => path.relative(MP, f))
  .filter((rel) => /INTRO_LEAD\b/.test(read(rel)) && rel !== 'utils/appInfo.js')
ok('没有页面还 import INTRO_LEAD', stillOld.length === 0, stillOld.join(', '))

// 关于页：两大段中英镜像，条数必须一一对上
const src = read('pages/about/about.js')
const grab = (name) => {
  const m = src.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\])`))
  return m ? m[1] : ''
}
const countItems = (literal) => (literal.match(/\n\s*\{\n/g) || []).length
const FEAT_ZH = grab('FEATURES_ZH')
const FEAT_EN = grab('FEATURES_EN')
const PRIV_ZH = grab('PRIVACY_ZH')
const PRIV_EN = grab('PRIVACY_EN')
ok('关于页功能五张卡（中英各一份）',
  countItems(FEAT_ZH) === 5 && countItems(FEAT_EN) === 5,
  `${countItems(FEAT_ZH)} / ${countItems(FEAT_EN)}`)
ok('关于页隐私十节（中英各一份）',
  countItems(PRIV_ZH) === 10 && countItems(PRIV_EN) === 10,
  `${countItems(PRIV_ZH)} / ${countItems(PRIV_EN)}`)
// 注释里的中文不算上屏，剥掉再看
const enSansComments = [FEAT_EN, PRIV_EN].join('\n')
  .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
ok('关于页英文侧正文无汉字', !hasCjk(enSansComments),
  (enSansComments.match(/^[^\n]*[㐀-鿿][^\n]*$/m) || [''])[0].trim().slice(0, 60))
// 英文侧那五个色块标记：左侧方块只有 96rpx，两个词必折行
const marks = (FEAT_EN.match(/mark: '([^']*)'/g) || []).map((m) => m.match(/'([^']*)'/)[1])
ok('功能色块英文标记都是单个词', marks.length === 5 && marks.every((m) => !/\s/.test(m) && !hasCjk(m)), marks.join(','))
// 「这一栏的三页说明目前只有中文」这句已经过时了，中文侧不许再留着
ok('关于页删掉"只有中文"那句旧口径', !/只有中文/.test(src))
// infoRows / updatedAt / introLead 全部按语言现算，不许留写死的那份
ok('关于页行标签走字典', /label: t\('aboutVersionRow', lang\)/.test(src) &&
  /label: t\('aboutEntityRow', lang\)/.test(src) && /value: t\('aboutEntityValue', lang\)/.test(src))
ok('关于页 updatedAt 走字典', /updatedAt: t\('aboutUpdatedAt', lang\)/.test(src))
ok('关于页 introLead 走 appInfo', /introLead: introLead\(lang\)/.test(src))

// 公众号那行的值是真实账号名，是一个专有名词，**故意不翻译**——
// 写成英文用户在微信里就搜不到这个号了。这条钉在这里，免得下轮"补缺口"把它一起改了。
ok('公众号账号名保持原样（专有名词，不翻译）', appInfo.OFFICIAL_ACCOUNT === '杰克AI日记')

// 「我的」页和关于页的应用名都吃字典（那两处以前各写死一份「图麦笔记」）
const meWxml = read('pages/me/me.wxml')
const aboutWxml = read('pages/about/about.wxml')
ok('我的页应用名走 t.appName', /class="about-name">\{\{t\.appName\}\}/.test(meWxml))
ok('关于页应用名走 t.appName', /class="brand-name">\{\{t\.appName\}\}/.test(aboutWxml))
ok('关于页三栏标题与隐私引导语走字典', ['aboutTabIntro', 'aboutTabFeatures', 'aboutTabPrivacy', 'aboutPrivacyLead', 'aboutUpdatedAtLabel']
  .every((k) => new RegExp(`\\{\\{t\\.${k}\\}\\}`).test(aboutWxml)))
// 分享菜单标题兜底也跟着语言走，不是写死「图麦笔记」
ok('分享落地页标题兜底走字典', /title: share\.title \|\| t\('appName', this\.data\.lang\)/.test(read('pages/share/view.js')))

// 语言切换的入口还在（缺口补齐之前它一度被收起过，#44）
ok('新建页仍有语言切换段', /class="lang-switch"/.test(read('pages/create/create.wxml')))

// ---------------- 汇总 ----------------
console.log(`\n中英文缺口：通过 ${n - fails.length} / ${n}`)
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f))
  console.log('')
  process.exit(1)
}
console.log('')
