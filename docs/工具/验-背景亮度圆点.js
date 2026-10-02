// 「调亮度」这一批的静态自证：不连模拟器，只钉三份文件之间的关系。
// 跑法：node docs/工具/验-背景亮度圆点.js
// 为什么先要一把静态的：色值和"叠几层"这件事现在散在 palette / app / 三个页面里，
// 任何一处抄第二份（比如把 rgba 直接写进 wxss）当下都看不出问题，
// 等下次调色时才有一条页跟着、两条页不跟。
const fs = require('fs')
const path = require('path')
const p = require('../../miniprogram/utils/palette.js')

const bad = []
let n = 0
const ck = (name, ok, got) => {
  n++
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const read = (rel) => fs.readFileSync(P(rel), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1//')

// ---------- ① 三档只在 palette 活一份 ----------
const D = p.BG_DIMS
ck('三档，不是两档也不是四档', D.length === 3, JSON.stringify(D.map((d) => d.v)))
ck('档位是 0 / 25 / 50', D.map((d) => d.v).join(',') === '0,25,50', D.map((d) => d.v).join(','))
ck('0 档就是"对原图不做处理"（veil 为 0，不是叠一层全透明）', D[0].veil === 0)
ck('越点越沉：veil 单调递增', D.every((d, i) => i === 0 || d.veil > D[i - 1].veil))
ck('点本身也跟着变灰（界面上那一枚就是当前档）',
  D.every((d, i) => i === 0 || p.lumOf(d.dot) <= p.lumOf(D[i - 1].dot)),
  D.map((d) => d.dot).join(' '))
ck('循环是 0→25→50→0，不是走到头停住',
  [0, 25, 50].map((v) => p.dimNext(v)).join(',') === '25,50,0',
  [0, 25, 50].map((v) => p.dimNext(v)).join(','))
ck('脏值兜回 0 档（本机键被别的版本写成别的数也不炸）',
  p.dimAt(77).v === 0 && p.dimVeilStyle(77) === '')
ck('0 档的 veil 样式串是空串（页面靠它决定渲不渲染那一层）', p.dimVeilStyle(0) === '')
ck('25 / 50 两档发的是同一支黑的两个透明度',
  p.dimVeilStyle(25) === 'background:rgba(8,9,12,0.25)' && p.dimVeilStyle(50) === 'background:rgba(8,9,12,0.5)',
  `${p.dimVeilStyle(25)} | ${p.dimVeilStyle(50)}`)

// ---------- ② 三页都从同一个口取值，没有第二份实现 ----------
// 这条是这一把自己踩出来的：dimAt 忘了 export，app.js 解构拿到的是 undefined，
// bgSkin() 一调就 TypeError——三页的 onShow 全废。静态扫源码看不出，
// 因为写的人（和读的人）都只盯着"有没有定义"，不看"有没有交出去"。
const PALETTE_IMPORT = /const \{([^}]*)\} = require\('\.\.?\/(?:\.\.\/)?utils\/palette'\)/
const IMPORTERS = ['app.js', 'utils/poster.js', 'pages/create/create.js',
  'pages/index/index.js', 'pages/me/me.js', 'pages/share/share.js', 'pages/profile/profile.js']
for (const rel of IMPORTERS) {
  if (!fs.existsSync(P(rel))) continue
  const src = strip(read(rel))
  const m = PALETTE_IMPORT.exec(src)
  if (!m) continue
  const missing = (m[1].match(/[A-Za-z_$][\w$]*/g) || []).filter((n) => !(n in p))
  ck(`${rel} 从 palette 解构出来的名字全都真的交出来了`, missing.length === 0, missing.join('、'))
}

const app = read('app.js')
ck('app 上有 bgSkin()（进页读当前档）和 cycleBgDim()（点一下换档）',
  /bgSkin\(\)\s*\{/.test(app) && /cycleBgDim\(\)\s*\{/.test(app))
ck('只存本机，键名是 bgDim', /const BG_DIM_KEY = 'bgDim'/.test(app))
ck('cycleBgDim 先算下一档、再落盘、最后才发样式（顺序反了会把旧档写回去）',
  (() => {
    const body = /cycleBgDim\(\)\s*\{[\s\S]*?\n  \}/.exec(app)
    if (!body) return false
    const b = body[0]
    const iNext = b.indexOf('dimNext(')
    const iWrite = b.indexOf('wx.setStorageSync(BG_DIM_KEY, v)')
    const iRet = b.indexOf('return {')
    return iNext > -1 && iWrite > iNext && iRet > iWrite
  })())
const pages = {
  'pages/create/create': ['page-dim', 'onCycleDim'],
  'pages/index/index': ['head-dim', null],
  'pages/me/me': ['head-dim', null],
}
for (const [rel, [cls, handler]] of Object.entries(pages)) {
  const js = strip(read(`${rel}.js`))
  const wxml = read(`${rel}.wxml`)
  ck(`${rel.split('/')[1]} 进页从 app.bgSkin() 取档（不各拼一份）`,
    /app\.bgSkin\(\)/.test(js), 'bgSkin 出现 ' + (js.match(/bgSkin\(\)/g) || []).length + ' 次')
  ck(`${rel.split('/')[1]} 有那一层叠膜节点，且判的是 dimVeil 非空`,
    new RegExp(`class="${cls}"`).test(wxml) && new RegExp(`wx:if="\\{\\{bgSrc && dimVeil\\}\\}" class="${cls}"`).test(wxml))
  // 层必须排在字前面： WXSS 里两边都不带 z-index，谁后画谁在上，顺序就是这一层的对不起了
  const band = wxml.slice(0, wxml.indexOf(cls))
  ck(`${rel.split('/')[1]} 那一层排在标题之前（标题压在它上面，不会被一起压黑）`,
    /class="h1"|class="title-row"|class="page-title"/.test(wxml.slice(wxml.indexOf(cls))) ||
    /title-row|page-title|h1/.test(wxml.slice(wxml.indexOf(cls), wxml.indexOf(cls) + 400)),
    band.length + ' 字节在它之前')
  if (handler) {
    ck(`${rel.split('/')[1]} 那半截点它换档`, new RegExp(handler).test(js) && new RegExp(`catchtap="${handler}"`).test(wxml))
  }
}

// ---------- ③ 三页共用的这一层不许在 wxss 里落出色值 ----------
for (const rel of ['pages/create/create.wxss', 'pages/index/index.wxss', 'pages/me/me.wxss']) {
  const css = strip(read(rel))
  const block = new RegExp(`\\.(page|head)-dim\\s*\\{[^}]*\\}`).exec(css)
  ck(`${rel.split('/')[1]} 那一层只定几何、不写颜色`,
    !!block && !/background|rgba|#/.test(block[0]), block && block[0].replace(/\s+/g, ' '))
}

// ---------- ④ 现网那层罩子一个字没动（0 档的观感 = 改版前的观感） ----------
const scrim = /\.page-scrim\s*\{[\s\S]*?background:\s*linear-gradient\(([^;]*)\);/.exec(strip(read('pages/create/create.wxss')))
ck('新建页罩子仍是那七个停点', scrim && (scrim[1].match(/rgba\(18, 20, 26/g) || []).length === 7,
  scrim && `${(scrim[1].match(/rgba\(18, 20, 26/g) || []).length} 个停点`)

// ---------- ⑤ 文案：一行两截，中英各一份，都不许超这一行放得下的量 ----------
const i18n = read('utils/i18n.js')
const zh = /bgDimLabel: '([^']+)'/g
const labels = [...i18n.matchAll(/bgDimLabel:\s*'([^']+)'/g)].map((m) => m[1])
ck('「调亮度」中英各一份', labels.length === 2, labels.join(' / '))
ck('两个字读得懂，且和「换背景」同一档长度',
  labels[0].length <= 4 && labels[1].length <= 13, `${labels[0].length}/${labels[1].length}`)
ck('旧的那行只有一个入口（「换背景」旁边不再挂图标）',
  !/swap-ico/.test(read('pages/create/create.wxml')))

// ---------- ⑥ 这是本机偏好，不许变成第二条上传链路 ----------
const whole = ['app.js', 'utils/poster.js', 'utils/api.js']
  .map((f) => strip(read(f))).join('\n')
ck('bgDim 这个键只走 wx.setStorageSync，没有混进任何请求体',
  !/bgDim/.test(whole.replace(/const BG_DIM_KEY = 'bgDim'/g, '').replace(/wx\.setStorageSync\(BG_DIM_KEY, v\)/g, '')),
  '键只在 app.js 的两处出现')

console.log(`\n${bad.length ? '✗ ' + bad.length + ' 条不过：' + bad.join('、') : `背景亮度圆点 静态：${n} 条全过`}`)
process.exit(bad.length ? 1 : 0)
