// 首页背景图这一批的静态自证：不连模拟器也能跑的那部分。
// 管三件事：① 包里**不再有**那张硬编码默认图、主包没吃线；② 两级取图的语义（用户勾的那格/运营下发/都没有）；
// ③ 入口唯一——换图只有「我的 → 卡片模板」那一个门，外观设置里只许有开关。
// 跑法：node docs/工具/验-首页背景图.js
const fs = require('fs')
const path = require('path')
const MP = path.resolve(__dirname, '../../miniprogram')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const read = (p) => fs.readFileSync(path.join(MP, p), 'utf8')

// ---------- ① 资源 ----------
/* §8.231（站长 10-13 拍甲的加强版：「如果是之前的背景图写到代码，硬编码就要删除。只提供白色背景」）：
   原先这一格钉的是"默认图在包里"，10-14 这一刀把 `assets/home-bg-portrait.jpg`（314,793 B）整个删掉，
   于是判据反过来钉"包里不许再有它"。留档那份是给 `docs/design/` 下那 9 份历史效果图用的（不追改它们的引用），
   不是产品资源——所以留档存在与包内没有，两样都要钉住。 */
const ASSET = 'assets/home-bg-portrait.jpg'
const st = fs.existsSync(path.join(MP, ASSET)) ? fs.statSync(path.join(MP, ASSET)) : null
ck('包里不再有那张硬编码默认背景图（−307KB，§8.231 判据 4）', !st, st ? `还在：${st.size}B` : '已删')
const ARCHIVE = path.resolve(__dirname, '../../docs/design/留档-背景图-20261013/home-bg-portrait.jpg')
ck('留档那一份还在（历史效果图与"当初是哪张"的凭据）', fs.existsSync(ARCHIVE),
  fs.existsSync(ARCHIVE) ? `${fs.statSync(ARCHIVE).size}B` : '(没找到)')
/* 原来这一条是「体积没吃主包（<150KB）」——那个 150KB 是**我自己拍的**，他没下过，
   10-11 R16 他把默认图换成 1280×1280／314,793 B 那张，这一条当天就红了。
   红的是我那道没主的门槛，不是包出问题：微信的硬线是**主包 2MB**，构建后实测 939,606 B（917.6KB）＝上限的 44.8%。
   所以这一格改成钉真正有主的那条线：拿整个 miniprogram 目录的字节总和当上界代理
   （构建会剥掉注释与空白，所以目录数一定 ≥ 包数，用它判偏保守），预算＝上限的八成，
   留那两成给下一张图与后面的代码。目录再涨过 1.6MB 才红，红法是把两个数都打出来。 */
const MAIN_LIMIT = 2 * 1024 * 1024
const dirBytes = (() => {
  let sum = 0
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name !== '.DS_Store') sum += fs.statSync(p).size
  })
  walk(MP)
  return sum
})()
ck(`主包字节总和没越过 2MB 上限的八成（现 ${dirBytes}／预算 ${Math.round(MAIN_LIMIT * 0.8)}）`,
  dirBytes < MAIN_LIMIT * 0.8, `${(dirBytes / 1024 / 1024).toFixed(2)}MB ＝ 上限的 ${(dirBytes / MAIN_LIMIT * 100).toFixed(1)}%`)

// ---------- ② 取图语义：把 wx 桩出来，直接跑 poster.js 那三个函数 ----------
const files = new Set()
const store = {}
global.wx = {
  env: { USER_DATA_PATH: '/usrdata' },
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: (k) => { delete store[k] },
  getFileSystemManager: () => ({
    accessSync: (p) => { if (!files.has(p)) throw new Error('ENOENT') },
    unlinkSync: () => {},
    writeFile: () => {},
  }),
}
const poster = require(path.join(MP, 'utils/poster.js'))

/* §8.231 之后取图只有两级：用户勾了「背景」那一格 → 运营下发且已落本机。两级都空就是**白底那一档**，
   所以"落回包里那张"这三条全部反过来钉：空串才是对的产物，非空＝那档硬编码又长回来了。 */
ck('两级都空＝白底那一档（homeBg 返回空串，§8.231 判据 4）', poster.homeBg() === '', poster.homeBg() || '(空)')
ck('取图函数导出了', typeof poster.homeBg === 'function')
// 09-30 站长把外观设置里那一节整块撤了：这一屏不再有"用/不用"这个状态，
// 缩略图那个别名函数也一并删了——首页和外观设置只剩同一个出口，不会再有第二份口径。
ck('开关那两个函数已经从导出里拿掉',
  poster.homeBgOn === undefined && poster.setHomeBgOff === undefined)
ck('缩略图别名也已经删掉，只剩 homeBg 这一个出口', poster.homeBgImage === undefined)
// 兜底链从三级降到两级：`HOME_BG_DEFAULT` 这一格常量不许以另一种名字再长回来（包里也没那枚文件了）。
const posterSrc = fs.readFileSync(path.join(MP, 'utils/poster.js'), 'utf8')
ck('poster.js 里没有第三档兜底（既无 `HOME_BG_DEFAULT`，也不引那枚文件）',
  !/HOME_BG_DEFAULT/.test(posterSrc)
  && (posterSrc.match(/return rolePath\(readSlots\(\), 'bg'\)[^\n]*/) || [''])[0].split('||').length === 3,
  (posterSrc.match(/return rolePath\(readSlots\(\), 'bg'\)[^\n]*/) || ['(没读到 homeBg 那一行)'])[0].trim())

const mine = '/usrdata/poster-avatar-1-1.img'
files.add(mine)
poster.writeProfile({ avatarPath: mine })
ck('设过形象就用用户那张（第一级不动，站长 10-13 那句"后台优先"打的是第二、三级之间）',
  poster.homeBg() === mine, poster.homeBg())

// 形象文件被系统清掉：readSlots 已经把那一格当空的，这一趟落白底，不出现"半截铺图"。
files.delete(mine)
ck('形象文件没了就落白底（不再回落到包里那张）', poster.homeBg() === '', poster.homeBg() || '(空)')

// ---------- ②b 第二级那半截账（10-14 审计抓出来的那一条） ----------
/* 上面那一条对**第一级**成立，靠的是 `poster.readSlots()` 逐格 `exists(s.path)`；
   而第二级 `mpAssets.serverBgPath()` 原来是把账上的路径**直接发出去**的——文件被系统清掉、
   账还留着时，它回一个不存在的非空路径 ⇒ `bgSrc` 有值、`has-bg` 点亮、图上那一整套纸白字
   压在浅壁纸上＝看不见，正是 §8.231 判据 6 点名的那一态（而且屏上不报错）。
   这一把不读声明，拿桩件真跑这一个函数：账对不上文件时必须回 null，并且把那半截账一起撤掉
   （`pull()` 判的是 content_hash 相等就 continue，留着账这台机就永远不再补下这一张＝永久白底）。 */
const mpAssets = require(path.join(MP, 'utils/mpAssets.js'))
const ASSET_KEY = 'MP_ASSET_KEY_home_bg'
const assetLive = '/usrdata/mp-assets/home_bg-live'
const assetGone = '/usrdata/mp-assets/home_bg-gone'
files.add(assetLive)
store[ASSET_KEY] = { filePath: assetGone, contentHash: 'h1' }
ck('第二级：账在文件不在 ⇒ 回 null（不许点亮 has-bg）',
  mpAssets.serverBgPath() === null, JSON.stringify(mpAssets.serverBgPath()))
ck('并且那半截账一起撤掉（留着就永远不会再补下这一张）',
  !(ASSET_KEY in store), JSON.stringify(store[ASSET_KEY] || '(已撤)'))
store[ASSET_KEY] = { filePath: assetLive, contentHash: 'h2' }
ck('文件真在时照旧给那一张（老用户零变化，§8.231 判据 3）',
  mpAssets.serverBgPath() === assetLive, mpAssets.serverBgPath())
ck('两级都空这一档仍然只由这一个口说：账撤掉之后 homeBg() 回空串', (() => {
  delete store[ASSET_KEY]
  return poster.homeBg() === ''
})())

// ---------- ③ 接线 ----------
const wxml = read('pages/create/create.wxml')
const wxss = read('pages/create/create.wxss')
const cjs = read('pages/create/create.js')
ck('新建页铺了 <image> 组件', /class="page-bg"[^>]*src="{{bgSrc}}"/.test(wxml) || /src="{{bgSrc}}"/.test(wxml))
ck('新建页有压暗罩', wxml.includes('page-scrim'))
ck('铺图时容器带 has-bg', wxml.includes("{{bgSrc ? 'has-bg' : ''}}"))
ck('图和罩都 fixed，跟着视口不跟着滚',
  /\.page-bg\s*{[^}]*position:\s*fixed/.test(wxss) && /\.page-scrim\s*{[^}]*position:\s*fixed/.test(wxss))
ck('铺图时三级字翻白', /\.container\.has-bg\s*{[^}]*--text-primary:\s*#f2efe9/.test(wxss))
ck('语言切换那条下划线也跟着翻白', /\.container\.has-bg\s*{[^}]*--accent:\s*#f2efe9/.test(wxss))
// 抬层那条规则整段捞出来比名单：原来只拿"从 title-row 起 120 字符内出现 z-index:2"这种
// 窗口写法，名单里加一行就会因为窗口不够长而红——那是尺子自己的毛病，不是回归。
// 10-09 站长拍甲：名单要含 `.home-swap`（那两句字原来跟照片一起被罩层压住，读不出来）。
const liftRule = /\.container\.has-bg \.title-row,[\s\S]{0,260}?\{[^}]*z-index:\s*2[^}]*\}/.exec(wxss)
ck('内容压在罩之上（名单三样：标题、那一行、录入条；日期行 10-10 撤了，展开态的 position 另有一条）',
  !!liftRule && ['title-row', 'home-swap', 'entry-wrap'].every((s) => liftRule[0].includes(s))
  && !/date-row/.test(liftRule[0]),
  liftRule ? liftRule[0].split('{')[0].replace(/\s+/g, ' ') : '(没捞到那条抬层规则)')
// 10-10 晚收起态那三块从 `.entry-wrap` 里搬出去自己定顶了，所以这一条改钉 `.home-blk`（裸 `.blk` 与 app.wxss 里那枚分类色方块撞了）。
// 钉的还是同一件事：**整组随视口高走，不许写成定值**——写死的话矮屏上组底会插进底栏。
// 10-14 这道数从 `min(66.3%, 100vh−562rpx)` 换成 `calc(100vh − 524rpx)`：站长「两个屏的内框高度要一致」
// ⇒ 首屏那一组与第二屏那块面板共用同一根底线（离底栏 152），比例那一头一留就会在两屏之间分叉。
ck('整组随视口高走（10-14 起贴底那一根线；不许写死定值，也不许落回流内 margin）',
  /\.home-blk\s*\{[^}]*top:\s*calc\(100vh - \d+rpx\)/.test(wxss)
  && !/\.home-blk\s*\{[^}]*bottom:\s*\d+rpx/.test(wxss)
  && !/\.home-blk\s*\{[^}]*top:\s*\d+(px|rpx|vh)\s*[;}]/.test(wxss)
  && !/\.entry-wrap\s*\{[^}]*margin-top:\s*\d+(vh|rpx|px)/.test(wxss),
  (/\.home-blk\s*\{[\s\S]{0,400}?\}/.exec(wxss) || ['(没读到 .blk)'])[0].replace(/\s+/g, ' ').slice(0, 120))
ck('展开时整块贴底（不再从顶上挂下来盖住照片）',
  /\.container\.entry-dock \.entry-(cards|wrap)\s*{[^}]*position:\s*fixed/.test(wxss))
ck('贴底挂在容器上（active 一翻就跟着翻）',
  /entry-dock/.test(read('pages/create/create.wxml')))
ck('没把本地图写成 wxss 的 background-image（那条微信不认）',
  !/background-image:\s*url\(['"]?\/(assets|images)\//.test(wxss))
ck('新建页每次进页重取图', cjs.includes('bgSrc: poster.homeBg()'))
// 10-01 晚：三页共用 app.applyNavForBand 这一个出口（判据是"铺没铺图"，
// 因为罩层顶部那档压完照片永远是深），没铺图时它整个不碰，主题色留给 applyTheme。
// 10-10 我一度给这条加过第二个参数（新建页翻亮底墨字），站长说没下过这条需求，撤回原样（§8.191）。
// 10-12 这条需求由他亲口下了：深浅判定搬进 utils/imgBrightness，页面只剩一个调用点，
// 导航条由那一趟一起设——所以这一把改钉"页面只调 applyTone、不许自己碰 applyNavForBand"，
// 并且三页必须同一个形状（谁再各抄一份 canvas 采样就红在这里）。
ck('深浅与导航条走同一个出口（页面只调 bgTone.applyTone，且把自己那两截递进去）',
  /bgTone\.applyTone\(this, this\.data\.bgSrc, toneZones\(\)\)/.test(cjs) && !/applyNavForBand/.test(cjs))
ck('三页都走那一个深浅出口（不各抄一份采样）',
  ['create', 'index', 'me'].every((p) =>
    /bgTone\.applyTone\(this, this\.data\.bgSrc, toneZones\(\)\)/.test(read(`pages/${p}/${p}.js`))))
// 10-12 真机反馈「标题字能上下拖」：页面里那枚 `<canvas type="2d">` 是原生同层组件，
// `position:fixed;left:-9999px` 在真机不保证把它移出流内——首屏被顶出一截，整页就变成可滚。
// 采样改成离屏（`wx.createOffscreenCanvas`，与 utils/imageCompress.js 同一套）之后，
// 这一条**反过来钉**：三个 tab 页的标记里再出现画布就是错（模拟器量不出来，只能靠钉）。
ck('三个 tab 页的画布只有笔记页出图那一枚（深浅采样走离屏，不许再往页面里塞第二枚）',
  ['create', 'index', 'me'].every((p) =>
    (read(`pages/${p}/${p}.wxml`).match(/<canvas/g) || []).length === (p === 'index' ? 1 : 0)),
  ['create', 'index', 'me']
    .map((p) => `${p}:${(read(`pages/${p}/${p}.wxml`).match(/<canvas/g) || []).length}`).join(' '))
ck('采样确实只用离屏那一个口', /wx\.createOffscreenCanvas/.test(read('utils/imgBrightness.js'))
  && !/createSelectorQuery/.test(read('utils/imgBrightness.js')))
// 10-12 他真机抓到：「怎么上面标题还是浅字体？你的逻辑是什么」——判据原来取的是**整张图平均**，
// 那张黑白合影上半是浅墙（208~219）、下半两大块黑衣把全图平均压到 153 < 160，于是判成"深"、
// 标题留在纸白，压在浅墙上只有 1.62:1。改判"字压着的那一条"之后钉这三条。
const brightJs = read('utils/imgBrightness.js')
ck('深浅存的是**逐行剖面**（32 行各一个数），不是一个平均数——上下两截要从同一份剖面各算一次',
  /rows\.push\(Math\.round\(sum \/ SIDE\)\)/.test(brightJs)
    && /function zoneLight/.test(brightJs) && !/i < data\.length/.test(brightJs))
ck('两截各判一次：applyTone 一次交回 bgLight 与 bgLightLow（少一枚＝又变回一整页一个数）',
  /bgLight: p === null/.test(brightJs) && /bgLightLow: p === null/.test(brightJs)
    && /zones\.top/.test(brightJs) && /zones\.low/.test(brightJs))
ck('取景那两个数不在 util 里写死：盒高与锚点由页面从 poster 递进来（两处各写一个数迟早走样）',
  !/=\s*740\b/.test(brightJs) && !/=\s*0\.15\b/.test(brightJs)
    && /poster\.HEAD_IMG_H/.test(read('pages/index/index.js'))
    && /poster\.BG_ANCHOR/.test(read('pages/index/index.js'))
    && /poster\.HEAD_IMG_H/.test(read('pages/me/me.js')))
ck('poster 真把那枚锚点交出来了（导出不加，这边读到的就是 undefined）',
  /BG_ANCHOR,/.test(read('utils/poster.js')))
ck('浅色那一档在容器上有个名，data 里也有初值（第一帧不闪）',
  /\{\{bgLight \? 'bg-light' : ''\}\}/.test(read('pages/create/create.wxml')) && /bgLight: false/.test(cjs))
// 10-12 21:1x 第二刀：「请按照上下部分来分别判断，避免全图平均，造成差异」。
// 下那一档要有名、有初值、三页都挂上，否则样式吃不到＝又一枚"有类名没规则"。
ck('下那一档在三个 tab 页的容器上都有名，data 里都有初值',
  ['create', 'index', 'me'].every((p) =>
    /\{\{bgLightLow \? 'bg-light-low' : ''\}\}/.test(read(`pages/${p}/${p}.wxml`))
    && /bgLightLow: false/.test(read(`pages/${p}/${p}.js`))))
/* 「这一行字被翻成墨」＝同一条规则里同时出现"命中这两个元素之一的选择器"与"一支墨色"。
   要按**规则**逐条拆（选择器再按逗号拆），不能整份文件一把正则：
   `.container.has-bg.bg-light{--text-primary:rgba(20,22,26,.92)}` 那种只改变量的规则里
   同时含 `.bg-light` 与墨色，误判成"字被翻墨"会自红（这一把第一版就是这么写的）。
   这两份样式表里没有 @media 嵌套，所以 `选择器{体}` 这一刀是平的、可以直接切。
   墨色那两支（#14161A 与 rgba(20,22,26,…)）与上面 `.container.has-bg.bg-light` 那一段是同一族。 */
const INK_ON_PANEL = /(rgba\(20,\s*22,\s*26|#14161A)/i
// 选择器按类名**逐段**比（`.container.has-bg .blk-tips-in` 拆出 container/has-bg/blk-tips-in），
// 否则 `.blk-tips-in` 会被 `.tips` 那种前缀匹配牵连，而 `--text-*` 变量那类只定义不命中。
// 10-14 名单里撤掉 `out`／`out-l`／`out-r`：第二屏框外那一行整枚抬到墨面之上了（站长
// 「back 抬到暗面板上面」），它现在浮在形象图上，**必须**吃会翻极性那套令牌——方向反了。
const PANEL_TEXT = ['tips', 'tips-line', 'blk-tips', 'blk-tips-in',
  'blk-tips-line', 'blk-num', 'blk-lab', 'blk-rule']
const onPanelRow = (sel) => sel.split(',').some((s) =>
  s.split(/[^\w-]+/).some((t) => PANEL_TEXT.includes(t)))
ck('压在面板上的那两行字是写死的纸白，不吃会翻极性的 --text-*',
  /\.blk-tips-in\s*\{[^}]*color:\s*rgba\(242,\s*239,\s*233/.test(wxss)
    && !/\.blk-tips-in\s*\{[^}]*var\(--text-/.test(wxss))
ck('抬到墨面之上那一行反过来：吃页面级令牌，浅照片那一态才翻得成墨',
  /(?:^|\n)\.out\s*\{[^}]*color:\s*var\(--text-(secondary|tertiary)\)/.test(wxss)
  && !/(?:^|\n)\.out\s*\{[^}]*color:\s*rgba\(242,\s*239,\s*233/.test(wxss),
  (/(?:^|\n)\.out\s*\{[^}]*\}/.exec(wxss) || ['(没读到 .out)'])[0].replace(/\s+/g, ' ').slice(0, 120))
/* 10-14 追一刀（我自己上一版漏的那半）：只"吃令牌"还不够——`.container.has-bg` 与
   `.container.has-bg.bg-light` 那两条翻的是**整页/头部那 0~0.28**，而这一枚的落点在视口
   0.59~0.62（收起态实测行 848~890 / 框 1448），落在 `create.js` `toneZones().low`＝[0.55,0.85] 里。
   拿错判据的后果是"头部浅、脚下深"那张图把这一枚翻成墨、压在深底上归零（反之亦然）。
   站长 10-12 21:1x 原话「请按照上下部分来分别判断」⇒ 它必须跟着**下那一档**翻。
   ⚠ 两条判据都跑在**剥掉注释**的那一份上：样式表里那些注释本身就写着 `.bg-light` 与 `.out`，
   不剥的话反面那条会被自己的注释打红。 */
const CSS_NC = wxss.replace(/\/\*[\s\S]*?\*\//g, '')
ck('「返回」那一枚跟着"下那一档"翻：深低带给纸白、浅低带给墨，两条都得在',
  /\.container\.has-bg:not\(\.bg-light-low\) \.out\s*\{[^}]*color:\s*rgba\(242,\s*239,\s*233/.test(CSS_NC)
  && /\.container\.has-bg\.bg-light-low \.out\s*\{[^}]*color:\s*rgba\(20,\s*22,\s*26/.test(CSS_NC))
ck('这一枚不许按头部那一档翻（`.bg-light .out` 一条都不许有——判的不是它压着的那一条带）',
  !/\.bg-light\s+\.out\s*\{/.test(CSS_NC) && !/\.has-bg\.bg-light\s+\.out\s*\{/.test(CSS_NC))
ck('没有任何一条规则把压在面板上的字翻成墨（浅壁纸那一态墨字压墨面＝归零）',
  [...wxss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .every((m) => !(onPanelRow(m[1]) && INK_ON_PANEL.test(m[2]))))
// 10-13 23:3x 站长翻案（原话「背景图，调亮度应该是压暗，现在变成提亮（要对照现网逻辑）」）：
// 原来这一条钉的是"浅色那一态得有一条自己的提亮罩规则，否则类名点空"，今天那一层整个撤了，
// 罩层只留压暗那一支。判据跟着换成钉反面（撤一个状态会作废一批判据，改判据不改代码迁就旧尺子）。
ck('罩层只有一支：浅色那一态不再另开提亮覆盖（`.bg-light` 后面不许再挂 `.page-scrim`）',
  !/\.container\.has-bg\.bg-light \.page-scrim\s*\{/.test(wxss))
// 压在图上那几行小字各有一支写死的纸白（`.swap-text`／`.swap-glyph`／`.home-swap`），
// 浅态不一起翻就是"字跟浅底一个色"——10-12 实测那一行带里暗字 0.0%。逐条钉住有对应的浅色规则。
// ⚠ 正则是拼出来的字符串：`\s` 写在模板串里会被吃掉反斜杠（变成字面 s），一律用 \\s。
const lightRule = (src, host, sel) =>
  new RegExp(`\\.${host}\\.has-bg\\.bg-light \\.${sel.slice(1)}\\s*\\{`).test(src)
ck('图上那三行写死纸白的字，浅色那一态逐条有翻墨的对应规则',
  ['.swap-glyph', '.swap-text', '.home-swap'].every((s) => lightRule(wxss, 'container', s)),
  ['.swap-glyph', '.swap-text', '.home-swap']
    .filter((s) => !lightRule(wxss, 'container', s)).join('、'))
// 10-14 站长翻案：「白底也要换背景，这是核心功能」。§8.231 之后两级都空＝bgSrc 是空串，
// 而这一行原来整条挂在 `wx:if="{{bgSrc}}"` 上 ⇒ 新用户第一屏连「换背景」都看不见，
// 等于把核心功能只留给已经设过图的人。两条一起钉，一条都不能松：
// ① 那一行本身不许再看图的脸色；
// ② 但「调亮度」那一截必须还看着——没图时它拧的那层压暗罩压根没渲染，留着一枚按下去什么都不发生的钮。
const swapRowTag = (wxml.match(/<view[^>]*class="home-swap"[^>]*>/) || [''])[0]
ck('白底那一档「换背景」那一行还画着（行上不许再挂任何 wx:if，10-14 原话）',
  !!swapRowTag && !/wx:if=/.test(swapRowTag), swapRowTag || '(读不到 .home-swap 那一枚)')
const dimHalfTag = (wxml.match(/<view[^>]*catchtap="onCycleDim"[^>]*>/) || [''])[0]
ck('「调亮度」那一截仍只在有图时画（无图态那层罩子不渲染，不许留死钮）',
  /wx:if="\{\{bgSrc\}\}"/.test(dimHalfTag), dimHalfTag || '(读不到 onCycleDim 那一枚)')
// 白底那一档背后是壁纸自己的浅底色，那两支写死的纸白不翻墨就是"字跟底一个色"（10-11 打过回）。
// 兜底写在 `.container:not(.has-bg)` 上：类数 1+1+1=3，压得住上面那支 1 类的纸白，不是虚挂。
const flatRule = (sel, prop) =>
  new RegExp(`\\.container:not\\(\\.has-bg\\) \\.${sel.slice(1)}\\s*\\{[^}]*${prop}:`).test(wxss)
ck('白底那一档那两样有翻墨兜底（字色与那枚箭头都算，只钉一支会漏箭头）',
  flatRule('.swap-text', 'color') && flatRule('.swap-glyph', 'background'),
  ['.swap-text', '.swap-glyph'].filter((s) => !flatRule(s, s === '.swap-text' ? 'color' : 'background')).join('、'))

const meCss = read('pages/me/me.wxss')
ck('「我的」头部那三行（大字与 MIND 数字）浅色态也有对应规则',
  ['.h1', '.score-n', '.score-l'].every((s) => lightRule(meCss, 'head-band', s)),
  ['.h1', '.score-n', '.score-l']
    .filter((s) => !lightRule(meCss, 'head-band', s)).join('、'))
ck('这一页不自己写 setNavigationBarColor（值只有一份）', !/setNavigationBarColor/.test(cjs))

// ---------- ③b 10-12 站长把范围扩到"那两行固定字" ----------
// 需求原话：「自动切换的范围，扩展到笔记列表页和卡片列表页，关于和设置，固定的两行文字。一并改了。」
// 这四条（列表/卡片的 tab 行＋返回＋分类行，「我的」名片行的 slogan）压的是卡顶那层白纱，
// 不是头部那层暗罩，白纱把暗图提成了中灰 —— 实测纸白压上去只有 1.9~2.2，所以这里跟着图翻的是
// **墨的浓度**（深态整档墨、浅态留在 .72），不是极性。钉的就是带 `:not(.bg-light)` 那几条在不在。
const deepSel = (src, sel) => src.includes(`.container.has-bg:not(.bg-light-low) ${sel}`)
const ixCss = read('pages/index/index.wxss')
ck('列表/卡片那两行固定字在深图那一态抬到整档墨（三条选择器一条不许少）',
  ['.vtab', '.ix-back', '.ix-cat'].every((s) => deepSel(ixCss, s)),
  ['.vtab', '.ix-back', '.ix-cat'].filter((s) => !deepSel(ixCss, s)).join('、'))
ck('「我的」名片行 slogan 同一条（名称本来就是整档墨，抬它是白抬）',
  deepSel(meCss, '.sheet-slogan') && !deepSel(meCss, '.sheet-name'))
ck('浅图那一态这两行仍是两档（基础规则里那支 --text-secondary 没被一起抬掉）',
  /\.vtab\s*\{[^}]*--text-secondary/.test(ixCss) && /\.ix-cat\s*\{[^}]*--text-secondary/.test(ixCss)
    && /\.sheet-slogan\s*\{[^}]*--text-secondary/.test(meCss))
ck('这四条里没有一条写纸白（写了就是拿浅底那一档压中灰纱，实测 1.9~2.2）',
  !/has-bg:not\(\.bg-light-low\)[\s\S]{0,200}?242,\s*239,\s*233/.test(ixCss + meCss))

// ---------- ③c 2.1.11 第 0 步（§8.233 那条 P0 前置闸）：无图态那一档的字色 ----------
// 「铺了图」是这个产品今天的默认态，所以有一批字色是**直接写在基样式里**的纸白——
// 它在"后台没配图 / 图被撤掉 / 形象文件被系统清掉"那一态就是浅页面底上的白字。
// §8.234 那句「无图态字色先钉死，再谈删图」量的就是这一档，实测工具是
// `量-无图态字色-真跑.js` ＋ `量-无图态字色.py`（三屏 × 四套壁纸＝12 个组合的像素对比度）。
// 10-14 第一次跑就是这一条红：「我的」右上那对数字四套壁纸全红（实测 1.10~1.17）。
// 这里钉的是"下一次别再有人把纸白写回基样式"，像素那把判的是"这一档真读得清"。
// ⚠ 取基样式必须锚在行首：`.head-band.has-bg .score-n {` 里也含 `.score-n {`，
//   不锚行首会把挂在 has-bg 下那一条当成基样式，红成假红或绿成假绿（10-14 自己踩过）。
const baseRule = (css, sel) => {
  const m = new RegExp(`(?:^|\\n)\\${sel}\\s*\\{([^}]*)\\}`).exec(css)
  return m ? m[1] : null
}
const PAPER = /242,\s*239,\s*233/
const noPaperBase = (file, css, sels) => sels.filter((s) => {
  const b = baseRule(css, s)
  return b && PAPER.test(b)
})
;[
  ['pages/me/me.wxss', ['.score-n', '.score-l', '.h1']],
  ['pages/create/create.wxss', ['.page-title', '.tips-line']],
  ['pages/index/index.wxss', ['.h1']],
].forEach(([f, sels]) => {
  const css = read(f)
  const hit = noPaperBase(f, css, sels)
  ck(`${f.replace('pages/', '')} 头部那几行的**基样式**里没有一条写纸白（无图态就读得清）`,
    hit.length === 0, hit.join('、') || `${sels.length} 条逐条看过`)
})
// 纸白不是不许有，是只许挂在"真铺了图"那一档下面——上面那条撤掉这一档就没人守得住。
ck('「我的」那对数字的纸白档挂在 .head-band.has-bg 下面（图上那一态没被一起撤掉）',
  /\.head-band\.has-bg \.score-n\s*\{[^}]*242,\s*239,\s*233/.test(meCss)
  && /\.head-band\.has-bg \.score-l\s*\{[^}]*242,\s*239,\s*233/.test(meCss))
ck('无图态那一档有量具在（删图那一刀之前必须先跑它）',
  fs.existsSync(path.join(__dirname, '量-无图态字色-真跑.js')) && fs.existsSync(path.join(__dirname, '量-无图态字色.py')))
// §8.234 第 0 步那半句：「`p === null ? false` 的回落要被显式的"无图"分支取代（无图 ≠ 深色态）」。
// 今天墨字这个结果是**结构**给的（翻色规则全挂在 `.has-bg` 底下，没图就没这个名字），不是那条 null 回落判出来的。
// 所以两样一起钉：① applyTone 里那一支显式分流在；② 每一支 `.bg-light(-low)` 的字色规则都还带着 `.has-bg`——
// 有人哪天加一条不带 `.has-bg` 的浅色规则，白底上的墨字就会被翻成白字，而第一条拦不住、只有这条拦得住。
ck('applyTone 里有显式的无图分支（不许靠探针那条 null 回落巧合）',
  /if \(!src\) \{[\s\S]{0,120}setData\(\{ bgLight: false, bgLightLow: false \}/.test(brightJs))
const strayLight = []
let lightRules = 0
;['pages/index/index.wxss', 'pages/create/create.wxss', 'pages/me/me.wxss', 'app.wxss'].forEach((f) => {
  // 读不到就是红，不许静默跳过：10-14 这一把第一版把路径写成 `index/index.wxss`（少了 `pages/`），
  // 那三页被 existsSync 一句吞掉，判据当场绿成"0 条浅色规则违规"——其实是 0 条规则被看见。
  if (!fs.existsSync(path.join(MP, f))) { strayLight.push(`${f}：读不到这个文件`); return }
  const src = read(f)
  ;(src.match(/[^{}]*\{/g) || []).forEach((sel) => {
    if (!/\.bg-light(-low)?(?![\w-])/.test(sel)) return
    lightRules += 1
    if (!/has-bg/.test(sel)) strayLight.push(`${f}：${sel.trim().slice(0, 70)}`)
  })
})
// 这条兜"上面那条会不会是空转"：名字总共有几块在吃它，必须报得出数来。
ck('浅色那一档的规则确实捞到了条数（0 条＝量具对不上界面，不是屏上干净）',
  lightRules > 0, `${lightRules} 条`)
ck('没有一条浅色那一档的规则不带 .has-bg（带了才只在"真铺了图"时生效）',
  strayLight.length === 0, strayLight.join('　'))

// ---------- ④ 入口唯一 ----------
ck('外观设置里不出现选图接口', !/chooseMedia|chooseImage/.test(read('pages/wallpaper/wallpaper.js')))
// 外观设置这一页现在只管壁纸那一横条，背景图那一节整块没了
const wpJs = read('pages/wallpaper/wallpaper.js')
const wpWx = read('pages/wallpaper/wallpaper.wxml')
const wpCss = read('pages/wallpaper/wallpaper.wxss')
ck('外观设置里没有背景图那一节', !/onSetHomeBg|bg-cell|bgThumb|homeBgSection/.test(wpJs + wpWx))
ck('那一节的样式也没留下', !/\.bg-cell|\.bg-thumb|\.bg-plain/.test(wpCss))
ck('首页那枚「换背景」是导流、不弹相册',
  /goHomeBg\(\)[\s\S]{0,120}navigateTo[\s\S]{0,60}pages\/profile\/profile/.test(read('pages/create/create.js'))
  && !/chooseMedia/.test(wpJs))
ck('唯一的选图口还在卡片模板页', /wx\.chooseMedia/.test(read('pages/profile/profile.js')))
// 09-30 形象图改成四槽，「换一张/去掉」那两行字没了，那句说明重写进 slotHint。
// 口径没变：卡片模板页那页必须自己讲清"这张还会铺在首页"，两种语言都得讲。
ck('卡片模板页那句话提了首页背景', /「背景」铺在首页/.test(read('utils/i18n.js'))
  && /Home lays it behind the home page/.test(read('utils/i18n.js')))

// ---------- ⑤ 文案 ----------
const { texts } = require(path.join(MP, 'utils/i18n.js'))
const zh = texts('zh'), en = texts('en')
ck('中英文键数相等', Object.keys(zh).length === Object.keys(en).length,
  `${Object.keys(zh).length} / ${Object.keys(en).length}`)
ck('那一节的四条文案中英都撤干净了',
  ['homeBgSection', 'homeBgHint', 'homeBgUse', 'homeBgNone']
    .every((k) => !zh[k] && !en[k]))
ck('首页导流那枚的文案还在（中英各一份）', !!zh.homeBgSwap && !!en.homeBgSwap,
  `${zh.homeBgSwap} / ${en.homeBgSwap}`)

console.log(bad.length ? `\n${bad.length} 条没过：${bad.join('、')}` : '\n全过')
process.exit(bad.length ? 1 : 0)
