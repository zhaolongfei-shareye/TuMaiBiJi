// 「调亮度」这一枚灰度圆点的静态自证：不连模拟器，只钉几份文件之间的关系。
// 跑法：node docs/工具/验-背景亮度圆点.js
// 为什么先要一把静态的：这一档的数散在 palette / app.wxss / 三个页面里，
// 任何一处抄第二份（把 opacity 写死进 wxss、把那道投影一份一份各写各的）当下都看不出问题，
// 等下次调色时才有一条跟着、两条不跟。
// ⚠ 这一把里"不许出现 X"那一型判据一共十几条，正向全绿也可能带着一句已经死掉的空话
//   （11-16 就抓到一条哑了 32 天的，见 ⑤ 那段注释）⇒ 它们都登记进 NEG，末尾 ⑦ 逐条塞回被禁的那一样，
//   塞回去不红＝没牙，计数并进退出码。新增否定式判据请走 neg()，别再手写 ck + 一个取反正则。
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
/* 否定式判据（「不许出现 X／一次都不读 X／X 撤干净了」）统一走 neg()：
   除正向那一句之外，再登记一份"把 X 塞回原字节"的变异，收尾时逐条复跑——塞回去必须红。
   这一族判据的失效方式最贵：锚点跟着改名漂走之后，正则扫不到被禁的东西，
   判据就成了一句永远绿的空话，正向那几十条读数一条都不会露馅
   （正本 §33 第三种哑法；本仓 2026-10-25 `fe7f225` 把 getStorageSync 换成 storage.read 后哑了 22 天）。
   所以 neg() 把正例与反向**绑成同一份谓词**：改口只改一处，不会改到一半。 */
const NEG = []
function neg(name, inputs, check, mutate) {
  const args = inputs()
  ck(name, check(...args))
  NEG.push({ name, check, mutate, args })
}

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
/* 站长 10-15 11:0x 把"不跟随首页调亮度"说死成**「是要正常亮度，不是压暗！」** ⇒ 笔记／我的那两页
   锁的是"最亮那一档"，不是"默认那一档"。这两枚常量差一档、差一层 .5 的黑，混用就是他现在看到的
   这个错，所以各钉一条：DIM_PLAIN 必须等于 opacity:0 那一档，且不许等于 DIM_DEFAULT。 */
ck('DIM_PLAIN 是"原图"那一档（罩层 opacity 0），且与 DIM_DEFAULT 不是同一档',
  p.dimScrimStyle(p.DIM_PLAIN.v) === 'opacity:0' && p.DIM_PLAIN.v !== p.DIM_DEFAULT.v,
  `DIM_PLAIN.v=${p.DIM_PLAIN.v}／DIM_DEFAULT.v=${p.DIM_DEFAULT.v}`)
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
/* 那道"锁档"的口必须**一次都不读那个键**——它要是还去读本机那一档（`wx.getStorageSync`
   或 10-25 之后的 `storage.read`，两样都算），这一刀就只是换了个函数名，首页点完那四屏照样跟着变。
   ⚠ 锚钉**键名**不钉取法：`fe7f225`（第八轮 M15）把这一族的取值口换过一支，原先那句
   `!/getStorageSync/` 当场变成一句空话（怎么写都绿），钉键名才跟着行为走。 */
neg('bgSkinLocked() 只吃 DIM_PLAIN，一次都不读本机那个键（读了就还是"跟随"）',
  () => [app],
  (src) => {
    const b = /bgSkinLocked\(\)\s*\{[\s\S]*?\n  \}/.exec(src)
    return !!b && /DIM_PLAIN\.v/.test(b[0]) && !/BG_DIM_KEY/.test(b[0])
  },
  // 塞回去＝把这一道口改回"读本机那一档"（正是 fe7f225 之前那个形状）：判据必须翻红。
  // 锚吃的是**键名**不是取法，所以旧拼写／新拼写两种塞法都拦得住。
  (src) => [src.replace('    const v = DIM_PLAIN.v',
    '    const v = dimAt(storage.read(BG_DIM_KEY)).v')])
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
  /* 站长 10-15 09:2x「笔记列表，卡片列表，我的，设置，上面的背景图，不需要跟随首页调亮度。
     首页调亮度只影响首屏和第二屏」⇒ 取档那一道口分成两个：
     · create（首屏＋第二屏同页）仍吃 `app.bgSkin()`——它才是那一枚钮的主人；
     · index／me 改吃 `app.bgSkinLocked()`——恒取默认那一档，本机存了哪一档都不读。
     ⚠ 这条原来是 `/app\.bgSkin\(\)/`，而 `bgSkinLocked()` 里含 `bgSkin` 却不含 `bgSkin()`，
       所以照旧写法不会红＝**假绿**（改了代码尺子还绿，等于这条白写）。
       改成"该吃哪个就点名哪个，另一个必须不出现"，正反各钉一句。
     ⚠ 反面那半句必须比在**剥掉行注释**的那一份上：`strip` 只削块注释、不削行注释，
       而这三页 data 上面那段历史说明里就带着 `app.bgSkin()` 这串字 ⇒ 第一版拿原文扫，
       被自家注释打红两条（同一族坑本文件上面记过一次："拿原文正则扫，把自家注释判成残留"）。 */
  const codeOf = (s) => s.replace(/^\s*\/\/.*$/gm, '')
  const CREATE_REL = 'pages/create/create'
  if (rel === CREATE_REL) {
    ck(`${name} 进页只从 app.bgSkin() 取档（不各拼一份）`, /app\.bgSkin\(\)/.test(codeOf(js)))
  } else {
    // 反面那半句「不许出现 app.bgSkin()」也走 neg()：塞回那一发必须红。
    neg(`${name} 进页只从 app.bgSkinLocked() 取档（不各拼一份）`, () => [js],
      (src) => {
        const c = codeOf(src)
        return /app\.bgSkinLocked\(\)/.test(c) && !/app\.bgSkin\(\)/.test(c)
      },
      (src) => [src.replace(/\.\.\.app\.bgSkinLocked\(\),/, '...app.bgSkin(),')])
  }
  ck(`${name} 初值与那一道口同一个数（create 中档 .5／另两页最亮那一档＝原图，第一帧不闪）`,
    new RegExp(`dimV: ${rel === CREATE_REL ? 1 : 0},`).test(js))
  ck(`${name} 那层罩子吃 dimScrim（拧它自己的透明度）`,
    new RegExp(`class="${cls}" style="\\{\\{dimScrim\\}\\}"`).test(wxml))
  neg(`${name} 不再另叠第二层黑（上一版那种 .page-dim / .head-dim 撤干净了）`,
    () => [wxml + wxss + js],
    (all) => !/page-dim|head-dim|dimVeil/.test(all),
    (all) => [all.replace(`class="${cls}"`, `class="${cls} page-dim"`)])
  // 站长 10-02 夜里否掉了"字自己带一道淡投影"那版：这三页压在照片上的字不许再挂任何阴影。
  // 变异用"往文件尾追加一条带投影的规则"：判据扫的是整只文件，追加与插进某条规则对这一条等价，
  // 且不依赖任何一条规则的名字还活着。
  neg(`${name} 压在照片上的字没有投影（那道 --photo-shadow 撤干净了）`,
    () => [wxss],
    (s) => !/text-shadow|--photo-shadow|filter:\s*drop-shadow/.test(s),
    (s) => [`${s}\n.self-check-mutant { text-shadow: 0 0 2rpx rgba(0, 0, 0, .4); }\n`])
}
const SHADOWED = ['app.wxss', 'pages/create/create.wxss', 'pages/index/index.wxss',
  'pages/me/me.wxss']
neg('--photo-shadow 这个令牌整个撤掉了（全仓一处都不许剩）',
  () => [SHADOWED.map((f) => read(f)).join('\n')],
  (all) => !/--photo-shadow/.test(all),
  (all) => [all.replace('.page-scrim', '.self-check-mutant { --photo-shadow: 0 0 2rpx rgba(0, 0, 0, .4); }\n.page-scrim')])

// ---------- ④ 现网那层罩子的七个停点一个字没动（弯月档＝改版前的样子） ----------
//（10-10 我一度照效果图 c5 把新建页这层翻成提亮罩，站长说没下过这条需求，已撤回；
//  判据跟着撤回原样。要再动这一层，得他先下这句。）
const scrim = /\.page-scrim\s*\{[\s\S]*?background:\s*linear-gradient\(([^;]*)\);/.exec(strip(read('pages/create/create.wxss')))
ck('新建页罩子仍是那七个停点', !!scrim && (scrim[1].match(/rgba\(18, 20, 26/g) || []).length === 7,
  scrim ? `${(scrim[1].match(/rgba\(18, 20, 26/g) || []).length} 个停点` : '没找到那条规则')
// ⚠ 反向那一份必须先证"锚还在"：锚读不到（rule 空串）时判据本身就红，
//   不会像旧那条 `.dim-dot` 一样在界面撤掉之后变成一句永远绿的空话。
neg('罩子那条规则里没有 opacity（透明度只从 style 递进来）',
  () => [scrim ? scrim[0] : ''],
  (rule) => rule !== '' && !/opacity/.test(rule),
  (rule) => [rule.replace('{', '{ opacity: 0.5;')])

// ---------- ⑤ 那一行两截的文案与热区 ----------
const labels = [...read('utils/i18n.js').matchAll(/bgDimLabel:\s*'([^']+)'/g)].map((m) => m[1])
ck('「调亮度」中英各一份', labels.length === 2, labels.join(' / '))
ck('中文那版就是「调亮度」三个字', labels[0] === '调亮度', labels[0])
const cw = read('pages/create/create.wxml')
// 10-14 站长把「切换毛玻璃」也搬进这一行（原话「首页 增加一个入口『换心情』…每次点击切换一种」），
// 所以"两半"这条前提已作废：现在是三半，前两枚的落点没动，第三枚往后加。
ck('那一行是三半：「调亮度」换档、「换背景」导流、「换心情」循环（前两枚落点没动）',
  (cw.match(/class="swap-half[ "]/g) || []).length === 3
  && /catchtap="onCycleDim"/.test(cw) && /catchtap="goHomeBg"/.test(cw) && /catchtap="onCycleMood"/.test(cw),
  `数到 ${(cw.match(/class="swap-half[ "]/g) || []).length} 枚（10-15 起每枚后面还带自己的深浅类）`)
/* 10-15 清晨那一行从"整行一个矩形"拆成"一枚一个矩形"（红框那张真机图同一条横带左中右三段
   实测中位 232／207／51，整行平均 174 压在阈值口上 ⇒ 一个数管三枚必有一头读不出来）；
   09:2x 站长又打回：「首屏下面三个设置，深浅字要一致…要一致」⇒ **并回一行一个判据**。
   ⚠ 这三个类随那一刀**不再是深浅覆写的索引**（覆写现在挂在 `.home-swap` 上、吃 `bg-light-swap`），
     留着只当一个身份：`验-第一屏三块-真跑` 的"三枚屏上是不是同一个数"与逐枚对比度靠它认哪一枚。
     所以这一条钉的是"三枚各有一枚、类名不重复"，不钉深浅——深浅那条在 验-首页背景图 与那把真跑里。 */
ck('那一行三枚各带一枚身份类（`.swap-dim`／`.swap-wallpaper`／`.swap-mood`，一枚一枚不多不少）',
  ['swap-dim', 'swap-wallpaper', 'swap-mood']
    .every((c) => (cw.match(new RegExp(`class="swap-half ${c}"`, 'g')) || []).length === 1),
  ['swap-dim', 'swap-wallpaper', 'swap-mood']
    .filter((c) => (cw.match(new RegExp(`class="swap-half ${c}"`, 'g')) || []).length !== 1).join('、'))
/* ⚠ 这一条原先钉的是 `.dim-dot` 那条规则（「点的颜色从 style 递进来，wxss 里不写死 background」）。
   11-16 现读：`dim-dot` 全仓 **0 命中**——它随 `e796603`（10-15 05:36，站长「调亮度的icon 改为太阳icon」
   那一刀）整族删掉了，而这条锚什么也没扫到 ⇒ 判据**恒真、哑了约 32 天**。这是正本 §33 第三种哑法
   在本仓最老的一例，比 `fe7f225`（改名那次）还隐蔽：**不是改名，是被判的那枚界面整个撤了**，
   正向那几十条一条不会露馅。所以下面三条都先钉"现行那枚还在"，再钉"不许写成什么样"。
   ⚠ `dimDot`（palette 算出来那一格）三页还在算、屏上已无处可画——create.wxss 里那段
     「要一并清干净是另一件事，等他点头」⇒ 本尺子不动它，也不替它编一条判据。 */
const CWX = strip(read('pages/create/create.wxss'))
const SUN = /\.glyph-sun\s*\{[^}]*\}/.exec(CWX)
const GLYPH = /\.swap-glyph\s*\{[^}]*\}/.exec(CWX)
ck('「调亮度」那一枚画的还是太阳（`.glyph-sun` 规则在、只含 mask；wxml 里一枚）',
  !!SUN && /mask-image/.test(SUN[0]) && (cw.match(/class="swap-glyph glyph-sun"/g) || []).length === 1,
  SUN ? `规则 ${SUN[0].length} 字符／wxml ${(cw.match(/class="swap-glyph glyph-sun"/g) || []).length} 枚`
    : '没找到 .glyph-sun 规则')
neg('太阳那一格只给 mask（background／filter 不许写在 `.glyph-sun` 里，色与尺寸从 `.swap-glyph` 那一枚来）',
  () => [SUN ? SUN[0] : ''],
  (s) => s !== '' && !/background|filter\s*:/.test(s),
  (s) => [s.replace('{', '{ background: rgba(20, 22, 26, 0.7);')])
neg('那一枚不许退回到灰度圆点（`.dim-dot` 全仓一处都不许再出现）',
  () => [CWX + cw],
  (s) => !/dim-dot/.test(s),
  (s) => [s.replace('class="swap-glyph glyph-sun"', 'class="dim-dot"')])
ck('那一枚的色与尺寸同一份出处（`.swap-glyph` 里 background／宽高各只写一次，三枚共用一类）',
  !!GLYPH && (GLYPH[0].match(/background\s*:/g) || []).length === 1
    && (GLYPH[0].match(/width\s*:/g) || []).length === 1)

// ---------- ⑥ 2.1 换口径：亮度档升成账号级（换手机后还是自己那一档），字体档仍留本机 ----------
// 这一节 10-08 之前钉的是"亮度档只走本机、不许变成第二条上传链路"。站长把跨端定成
// "同一个微信号换手机／重置手机后再登录，依旧是自己那批东西"，那一档就跟着升成账号级了。
// **改的是判据，不是拿代码去迁就旧尺子**；而"只有一条上传路"这半句仍然成立，所以钉得更死：
// 上云只准走 profileCloud 那一个出处，页面里再出现第二处 PUT 就是红。
const whole = ['app.js', 'utils/poster.js', 'utils/api.js'].map((f) => strip(read(f))).join('\n')
const PC = strip(read('utils/profileCloud.js'))
neg('亮度档上云只有 profileCloud.pushDim 那一个出处（app/poster/api 里不许出现第二处 bg_dim）',
  () => [whole, PC],
  (w, pc) => !/bg_dim/.test(w) && /function pushDim\(v\) \{ return push\(\{ bg_dim: v \}\) \}/.test(pc),
  (w, pc) => [`${w}\nfunction leakDim(v) { return request('/v1/profile', 'PUT', { bg_dim: v }) }\n`, pc])
ck('那一档仍然先落本机存储再登记（读的一路没换成网络，界面不许为它多等一趟）',
  /wx\.setStorageSync\(BG_DIM_KEY, v\)/.test(strip(read('app.js'))) && /profileCloud\.pushDim\(v\)/.test(strip(read('app.js'))))
neg('界面字体档**没有**跟着上云（安卓命不中那三档，跟着账号跑只会让人看到"没生效"）',
  () => [whole + PC],
  (x) => !/ui_font/.test(x) && !/pushFont/.test(x),
  (x) => [`${x}\nfunction pushFont(f) { return push({ ui_font: f }) }\n`])

// ---------- ⑦ 常驻反向：把每句"不许"里被禁的那一样塞回原字节，判据必须翻红 ----------
/* 这一段是本文件唯一能证明"上面那些否定式判据还有效"的读数——正向 40 多条全绿
   也可以带着一条死判据（正本 §33：正向合计那一行不是耳朵）。
   两种没牙分开念：变异后字节没变＝锚点已经漂走（正是 `.dim-dot` 那次的形状）；
   字节变了而判据仍绿＝被禁的那一样落不进去／判据写得太松。 */
let toothless = 0
console.log(`\n反向 ${NEG.length} 发（每发＝把被禁的那一样塞回去，判据必须翻红）：`)
for (const t of NEG) {
  const mArgs = t.mutate(...t.args)
  const noCut = JSON.stringify(mArgs) === JSON.stringify(t.args)
  let flipped = false
  if (!noCut) {
    try { flipped = t.check(...mArgs) === false } catch (e) { flipped = false }
  }
  if (flipped) console.log(`  ✓ ${t.name}`)
  else {
    toothless++
    console.log(`  ✗ ${t.name}　→ ★刀没切进去` +
      (noCut ? '（塞回去字节没变＝被禁的那一样已经摆在盘上，或那句"不许"的锚点已漂走）' : '（塞回去仍判绿）'))
  }
}
console.log(`反向 ${NEG.length - toothless}/${NEG.length} 有牙`)

console.log(`\n${bad.length ? '✗ ' + bad.length + ' 条不过：' + bad.join('、') : `背景亮度圆点 静态：${n} 条全过`}${toothless ? `　✗ ${toothless} 发反向没牙` : ''}`)
process.exit(bad.length === 0 && toothless === 0 ? 0 : 1)
