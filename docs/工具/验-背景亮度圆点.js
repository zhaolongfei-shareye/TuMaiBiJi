// 「调亮度」这一枚灰度圆点的静态自证：不连模拟器，只钉几份文件之间的关系。
// 跑法：node docs/工具/验-背景亮度圆点.js
// 为什么先要一把静态的：这一档的数散在 palette / app.wxss / 三个页面里，
// 任何一处抄第二份（把 opacity 写死进 wxss、把那道投影一份一份各写各的）当下都看不出问题，
// 等下次调色时才有一条跟着、两条不跟。
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
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')

// ---------- ① 三档只在 palette 活一份 ----------
const D = p.BG_DIMS
ck('三档，不是两档也不是四档', D.length === 3, JSON.stringify(D.map((d) => d.v)))
ck('档名是满月／半月／弯月（那一枚点本身就是当前档）',
  D.map((d) => d.name).join(' ') === '满月 半月 弯月', D.map((d) => d.name).join(' '))
ck('满月那一档就是"一点不压"（veil 0，不是"叠了一层全透明"）', D[0].veil === 0)
ck('弯月那一档等于现网那层罩子铺满（veil 1）', D[2].veil === 1)
ck('越点越沉：veil 单调递增', D.every((d, i) => i === 0 || d.veil > D[i - 1].veil))
ck('循环是 满月→半月→弯月→满月，不是走到头停住',
  [0, 1, 2].map((v) => p.dimNext(v)).join(',') === '1,2,0',
  [0, 1, 2].map((v) => p.dimNext(v)).join(','))
// 默认档站长改过两次：10-02 下午定"升级后还是今天这个样子"=最沉那档，当晚夜里又改成
// "三档默认中档就行了，把调亮度选择权给用户"。现在守的是中间那一档，别再拿旧那句当判据。
ck('脏值兜回默认那一档（半月）——本机键被别的版本写成别的数也不炸',
  p.dimAt(77).v === 1 && p.dimScrimStyle(77) === 'opacity:0.5',
  `${p.dimAt(77).v} / ${p.dimScrimStyle(77)}`)
ck('DIM_DEFAULT 就是中间那一档（首屏不最沉也不最亮，选择权在人手里）',
  p.BG_DIMS.indexOf(p.dimAt(77)) === 1)
ck('弯月不发样式串（CSS 里那层本来就全铺，再写个 opacity:1 是废话）', p.dimScrimStyle(2) === '')
ck('满月发的是 opacity:0——拧的是现网那层罩子自己，不是再叠一层黑',
  p.dimScrimStyle(0) === 'opacity:0', p.dimScrimStyle(0))
ck('半月是半档', p.dimScrimStyle(1) === 'opacity:0.5', p.dimScrimStyle(1))
ck('三枚点是三个不同的灰度', new Set(D.map((d) => p.dimDotStyle(d.v))).size === 3)
ck('越沉的那档点越黑（点本身就是当前档，界面上不画形状）',
  D.every((d, i) => i === 0 || p.lumOf(d.dot) < p.lumOf(D[i - 1].dot)),
  D.map((d) => d.dot).join(' '))
ck('点只发一个 background，没有 mask / 阴影那些附加（站长 10-02 否掉了月相那版）',
  D.every((d) => p.dimDotStyle(d.v) === `background:${d.dot}`), p.dimDotStyle(0))

// ---------- ② 从 palette 解构出来的名字必须真的在导出表上 ----------
// 这条是上一把自己踩出来的：dimAt 忘了 export，app.js 解构拿到的是 undefined，
// bgSkin() 一调就 TypeError——三个 tab 的 onShow 全废。静态读源码读不出来，
// 因为写的人和读的人都只盯着"有没有定义"，不看"有没有交出去"。
const PALETTE_IMPORT = /const \{([^}]*)\} = require\('\.\.?\/(?:\.\.\/)?utils\/palette'\)/
const IMPORTERS = ['app.js', 'utils/poster.js', 'pages/create/create.js',
  'pages/index/index.js', 'pages/me/me.js', 'pages/share/share.js', 'pages/profile/profile.js']
for (const rel of IMPORTERS) {
  if (!fs.existsSync(P(rel))) continue
  const m = PALETTE_IMPORT.exec(strip(read(rel)))
  if (!m) continue
  const missing = (m[1].match(/[A-Za-z_$][\w$]*/g) || []).filter((x) => !(x in p))
  ck(`${rel} 从 palette 解构出来的名字全都真的交出来了`, missing.length === 0, missing.join('、'))
}

// ---------- ③ 三页都从同一个口取值，且没有第二层黑残留 ----------
const app = read('app.js')
ck('app 上有 bgSkin()（进页读当前档）和 cycleBgDim()（点一下换档）',
  /bgSkin\(\)\s*\{/.test(app) && /cycleBgDim\(\)\s*\{/.test(app))
ck('只存本机，键名是 bgDim', /const BG_DIM_KEY = 'bgDim'/.test(app))
ck('cycleBgDim 先算下一档、再落盘、最后才发样式（顺序反了会把旧档写回去）',
  (() => {
    const b = /cycleBgDim\(\)\s*\{[\s\S]*?\n  \}/.exec(app)
    if (!b) return false
    const iNext = b[0].indexOf('dimNext(')
    const iWrite = b[0].indexOf('wx.setStorageSync(BG_DIM_KEY, v)')
    return iNext > -1 && iWrite > iNext && b[0].indexOf('return {') > iWrite
  })())
const pages = {
  'pages/create/create': 'page-scrim',
  'pages/index/index': 'head-scrim',
  'pages/me/me': 'head-scrim',
}
for (const [rel, cls] of Object.entries(pages)) {
  const name = rel.split('/')[1]
  const js = strip(read(`${rel}.js`))
  const wxml = read(`${rel}.wxml`)
  const wxss = strip(read(`${rel}.wxss`))
  ck(`${name} 进页从 app.bgSkin() 取档（不各拼一份）`, /app\.bgSkin\(\)/.test(js))
  ck(`${name} 初值停在中间那一档（data 字面量与 app.bgSkin() 的兜底是同一个数，第一帧不闪）`, /dimV: 1,/.test(js))
  ck(`${name} 那层罩子吃 dimScrim（拧它自己的透明度）`,
    new RegExp(`class="${cls}" style="\\{\\{dimScrim\\}\\}"`).test(wxml))
  ck(`${name} 不再另叠第二层黑（上一版那种 .page-dim / .head-dim 撤干净了）`,
    !/page-dim|head-dim|dimVeil/.test(wxml + wxss + js))
  // 站长 10-02 夜里否掉了"字自己带一道淡投影"那版：这三页压在照片上的字不许再挂任何阴影。
  ck(`${name} 压在照片上的字没有投影（那道 --photo-shadow 撤干净了）`,
    !/text-shadow|--photo-shadow|filter:\s*drop-shadow/.test(wxss))
}
ck('--photo-shadow 这个令牌整个撤掉了（全仓一处都不许剩）',
  !/--photo-shadow/.test(['app.wxss', 'pages/create/create.wxss', 'pages/index/index.wxss',
    'pages/me/me.wxss'].map((f) => read(f)).join('')))

// ---------- ④ 现网那层罩子的七个停点一个字没动（弯月档＝改版前的样子） ----------
const scrim = /\.page-scrim\s*\{[\s\S]*?background:\s*linear-gradient\(([^;]*)\);/.exec(strip(read('pages/create/create.wxss')))
ck('新建页罩子仍是那七个停点', !!scrim && (scrim[1].match(/rgba\(18, 20, 26/g) || []).length === 7,
  scrim ? `${(scrim[1].match(/rgba\(18, 20, 26/g) || []).length} 个停点` : '没找到那条规则')
ck('罩子那条规则里没有 opacity（透明度只从 style 递进来）', !!scrim && !/opacity/.test(scrim[0]))

// ---------- ⑤ 那一行两截的文案与热区 ----------
const labels = [...read('utils/i18n.js').matchAll(/bgDimLabel:\s*'([^']+)'/g)].map((m) => m[1])
ck('「调亮度」中英各一份', labels.length === 2, labels.join(' / '))
ck('中文那版就是「调亮度」三个字', labels[0] === '调亮度', labels[0])
const cw = read('pages/create/create.wxml')
ck('那一行是两半：左「调亮度」点它换档、右「换背景」导流',
  (cw.match(/class="swap-half"/g) || []).length === 2 && /catchtap="onCycleDim"/.test(cw))
ck('点的颜色从 style 递进来，wxss 里不写死 background，也没有 mask / 投影残留',
  !/\.dim-dot\s*\{[^}]*(background|mask-image|filter)/.test(strip(read('pages/create/create.wxss')).replace(/\s+/g, ' ')))

// ---------- ⑥ 2.1 换口径：亮度档升成账号级（换手机后还是自己那一档），字体档仍留本机 ----------
// 这一节 10-08 之前钉的是"亮度档只走本机、不许变成第二条上传链路"。站长把跨端定成
// "同一个微信号换手机／重置手机后再登录，依旧是自己那批东西"，那一档就跟着升成账号级了。
// **改的是判据，不是拿代码去迁就旧尺子**；而"只有一条上传路"这半句仍然成立，所以钉得更死：
// 上云只准走 profileCloud 那一个出处，页面里再出现第二处 PUT 就是红。
const whole = ['app.js', 'utils/poster.js', 'utils/api.js'].map((f) => strip(read(f))).join('\n')
const PC = strip(read('utils/profileCloud.js'))
ck('亮度档上云只有 profileCloud.pushDim 那一个出处（app/poster/api 里不许出现第二处 bg_dim）',
  !/bg_dim/.test(whole) && /function pushDim\(v\) \{ return push\(\{ bg_dim: v \}\) \}/.test(PC))
ck('那一档仍然先落本机存储再登记（读的一路没换成网络，界面不许为它多等一趟）',
  /wx\.setStorageSync\(BG_DIM_KEY, v\)/.test(strip(read('app.js'))) && /profileCloud\.pushDim\(v\)/.test(strip(read('app.js'))))
ck('界面字体档**没有**跟着上云（安卓命不中那三档，跟着账号跑只会让人看到"没生效"）',
  !/ui_font/.test(whole + PC) && !/pushFont/.test(whole + PC))

console.log(`\n${bad.length ? '✗ ' + bad.length + ' 条不过：' + bad.join('、') : `背景亮度圆点 静态：${n} 条全过`}`)
process.exit(bad.length ? 1 : 0)
