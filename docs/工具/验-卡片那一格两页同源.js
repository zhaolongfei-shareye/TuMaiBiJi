// 「笔记卡片」那一格：10-18 之后它只在独立详情页那一屏——这一把钉的是"哪页有、哪页没有、
// 有的那一页不许漂"。跑法：node docs/工具/验-卡片那一格两页同源.js
//
// 为什么要这一把（站长 10-07 原话）：「生成后，不应该出现生成卡片的入口，很多余，为什么不干掉。
// 然后我记得右上角是有笔记卡片的小图的，你是不是又漏了。」——那一格是 v20 那一稿（10-03）就画好、
// 早就拍定的口径，但它只落在了首页的详情窗上，**独立详情页从来没落地过**。
// 少的那一处不是"少个装饰"：那一格就是出卡片的唯一入口，缺了它这一页只能靠底排那枚按钮，
// 而那枚按钮在"已经生成过"之后还留着——两件事其实是同一个漏口的两面。
//
// 这把尺子测的不是功能（功能由 验-详情页那一格-真跑 真点一遍），测的是**别再各画一份**：
// ① 那一格的样式只有 app.wxss 一份，两页自己的 wxss 里一条都不许有；
// ② ⚠ 10-18 那一版（通栏大图抬头）把**详情窗里那一格整块撤了** ⇒ "两页那一段逐字相同"没有第二个
//    主语了。这一条改成钉**现状**：详情窗没有、详情页还有（跟不跟他一句，不替他决定）。
//    留着一条常红的"两页相同"比改判据更坏——下一轮没人分得清是代码漂了还是口径变了。
// ③ 绑的处理函数名在两页各自都得有实现（搬家的失败形态就是"点了没反应"）；
// ④ 那一格只剩有卡片那一态：盒子 252×352 不许动、图撑满、不垫白底不投影（10-17 深夜那一句）；
// ⑤ 详情页那一排三枚各管一件事，「分享」与右上那一格不是同一件事的两个把手（制作口只有一个）；
// ⑥ 那条「图还在才算」的判据两页从同一个出处拿；空态那格用的色规则只有一份、当前已无消费者。
// 最后一段是反向自证：故意造几处漂移，判据必须红——不然它只是在读文件，不是在守东西。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

const APP_WXSS = read('miniprogram/app.wxss')
const INDEX_WXSS = read('miniprogram/pages/index/index.wxss')
const DETAIL_WXSS = read('miniprogram/pages/detail/detail.wxss')
const INDEX_WXML = read('miniprogram/pages/index/index.wxml')
const DETAIL_WXML = read('miniprogram/pages/detail/detail.wxml')
const INDEX_JS = stripJs(read('miniprogram/pages/index/index.js'))
const DETAIL_JS = stripJs(read('miniprogram/pages/detail/detail.js'))
const CARD_LOG = stripJs(read('miniprogram/utils/cardLog.js'))
const CARD_CLOUD = stripJs(read('miniprogram/utils/cardCloud.js'))
const CARD_INFO = stripJs(read('miniprogram/utils/cardInfo.js'))
const PALETTE = stripJs(read('miniprogram/utils/palette.js'))
const I18N = read('miniprogram/utils/i18n.js')

// 这一格现在的三族类名（`.ds-rt` 是那一列的宽，另两族是格子里那张图）。
// 分栏本身（`.ds-hero` / `.dt-hero`）不在这份名单里——窗内净宽 634、卡内净宽 638 不是同一个数，
// 那是各页自己的事，格子必须一样。
// ⚠ 10-17 深夜站长一句「如果没卡片图，这个位置就完全被标题占满」⇒ 空态那一整块（`.ds-empty`
//   `.ds-swatch` `.ds-plus` `.ds-logo` `.ds-logo-n` `.ds-e1` `.ds-e2` 七族）连同两枚 data 键撤净，
//   名单跟着缩短。这七族的名字**在这把尺子里一处不许出现**（见下面那条"撤就撤净"）。
const CELL = ['ds-rt', 'ds-pad', 'ds-pad-img']
const GONE = ['ds-empty', 'ds-swatch', 'ds-plus', 'ds-logo', 'ds-logo-n', 'ds-e1', 'ds-e2']
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const stripXml = (s) => s.replace(/<!--[\s\S]*?-->/g, '')
// 负向断言必须读去掉注释的那一份：来历写在注释里是应该的，但它会把"还在不在"量成"不在了"。
const cellRules = (src) => (src.match(/^\.ds-[\w-]+[^\n]*\{/gm) || [])
  .map((l) => /^\.(ds-[\w-]+)/.exec(l)[1]).filter((n) => CELL.includes(n))

// ---------- 一、样式只有一份 ----------
ck(`那一格那 ${CELL.length} 族样式在 app.wxss 里齐着`,
  CELL.every((c) => new RegExp(`^\\.${c}\\s*(\\{|,)`, 'm').test(APP_WXSS)
    || new RegExp(`^\\.${c}\\s*,`, 'm').test(APP_WXSS) || new RegExp(`^\\.${c}\\s*\\{`, 'm').test(APP_WXSS)),
  CELL.filter((c) => !new RegExp(`^\\.${c}\\s*\\{`, 'm').test(APP_WXSS)).join('、') || '全在')
ck('首页 wxss 里一条都不剩（留着就是第二份真相，下一次只改一处）',
  cellRules(INDEX_WXSS).length === 0, `${cellRules(INDEX_WXSS).join('、')}`)
ck('详情页 wxss 里也没另写一份', cellRules(DETAIL_WXSS).length === 0,
  cellRules(DETAIL_WXSS).join('、'))
// 空态那一块撤了就撤净：样式表里（去掉注释后）七族一名不留。
// 留着就是给一块屏上不再画的东西定尺寸，下一轮谁都不敢撤——这条红过两次，都出在"撤一半"。
const goneHits = [APP_WXSS, INDEX_WXSS, DETAIL_WXSS, INDEX_WXML, DETAIL_WXML]
  .map((src) => stripCss(stripXml(src)))
  .map((src) => GONE.filter((c) => new RegExp('\\.' + c + '\\b').test(src) || new RegExp('class="' + c).test(src)))
  .filter((x) => x.length)
ck('那一格的空态七族（淡底方形／+／品牌字／那两行小字）样式与标记一处不剩',
  goneHits.length === 0, goneHits.join(' | '))
ck('它带的两枚 data 键（swatchBg／brandGlyph）页面 js 里也不再算（去注释后）',
  !/swatchBg/.test(INDEX_JS) && !/swatchBg/.test(DETAIL_JS)
  && !/brandGlyph/.test(INDEX_JS) && !/brandGlyph/.test(DETAIL_JS))
// ⚠ 这一条只量"样式表与标记里还有没有"，不量注释：那七族与那两枚键的来历就写在 app.wxss、
// 两页 js 的注释里（下一轮要问到"这一块哪去了"），拿"含注释一处不留"去钉会把该留的来历钉没。
ck('淡底那格的色规则只剩 palette 里那一条函数，两页都不再调它（撤状态作废的是消费者，不是规则）',
  (PALETTE.match(/function paleStep\(/g) || []).length === 1
  && !/paleStep/.test(INDEX_JS) && !/paleStep/.test(DETAIL_JS))

// ---------- 二、两页那一段逐字相同 ----------
function cellOf(src) {
  const m = /^(\s*)<view class="ds-rt"/m.exec(src)
  if (!m) return null
  const from = m.index
  const close = `\n${m[1]}</view>`
  const rest = src.slice(from)
  const end = rest.indexOf(close)
  if (end < 0) return null
  return rest.slice(0, end + close.length)
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n')
    // 唯一允许的两处不同：这一篇在首页叫 detailNote、在详情页叫 note；
    // 那四个键里只有"这一篇"的名字跟着页面走，格子本身不许差一个字。
    .replace(/detailNote/g, 'NOTE').replace(/\bnote\b/g, 'NOTE')
}
const A = cellOf(INDEX_WXML)   // 详情窗那一份：10-18 那一版撤了 ⇒ 读出来必须是 null
const B = cellOf(DETAIL_WXML)  // 独立详情页那一份：还留着
ck('详情窗里那一格真的撤净了（`.ds-rt` 在这一屏一处不剩，不是漏撤）',
  A === null && !/ds-rt/.test(stripXml(INDEX_WXML)), A === null ? '不在' : '还在')
ck('独立详情页那一屏还留着那一格（"两页同源"从 10-18 起是断的：跟不跟他一句，这里只钉现状）',
  !!B, B ? '还在' : '也没了')
// 下面这几条原来"两页各查一遍"，现在只剩一个主语，全部改成量详情页那一份。
const cellFacts = (w) => (w ? {
  只剩一态: /class="ds-pad ds-entry"/.test(w) && (w.match(/ds-entry/g) || []).length === 1,
  没卡片不渲染: /wx:if="\{\{!NOTE\.is_private && detailCards\.length\}\}"/.test(w),
  只绑一次: (w.match(/catchtap="onCardCell"/g) || []).length === 1,
} : null)
const FB = cellFacts(B) || {}
ck('那一格只剩有卡片那一态：格子里只画那张缩略图，没有第二种画法', FB.只剩一态 === true)
ck('没卡片（或私密）时那一整列不渲染，位置让给标题（站长 10-17 深夜「这个位置就完全被标题占满」）',
  FB.没卡片不渲染 === true)

// ---------- 三、接线：绑的那个名字在两页都得对得上 ----------
ck('那一格绑的还是 `onCardCell`，而且这一屏只绑一次（多绑一处就是"同一件事两个把手"回来了）',
  FB.只绑一次 === true, B ? '' : '详情页没有那一格')
ck('首页那一格的实现也跟着撤净了（`onCardCell` 在 index.js 一处不剩，留着一段进不去的代码）',
  !/onCardCell/.test(INDEX_JS))
ck('详情窗这边开窗只剩那一条路：一枚「分享」→ `onSheetShare` → `_openPosterFor`',
  /onSheetShare\(\)[\s\S]{0,300}_openPosterFor\(/.test(INDEX_JS))
// 10-17 合一：`_openPosterFor` 原来带一个"从哪一格开的"（'sheet' | 'grid'），因为卡片那一屏
// 那枚小图是第二个入口。那一屏撤了 ⇒ 第二个取值没有调用者，参数本身跟着删（留着就是一段进不去的分支）。
// 这一条量的还是同一件事：**开窗的路只有一条**，只是那条路口上不再挂来自哪一格的记号。
ck('旧那第二个取值不许留在代码里（注释里留来历不算）',
  !/'grid'/.test(INDEX_JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))
    && !/_openPosterFor\(note, from\)/.test(INDEX_JS))
ck('详情页那一格：有那张就看大图，没有才去生成——两页看大图走同一个 `_previewShot`（退回来那一趟不许重取整页）',
  /onCardCell\(\)[\s\S]{0,400}cards\[0\]\.cloud \|\| cards\[0\]\.p[\s\S]{0,200}this\._previewShot\(\[url\], url\)[\s\S]{0,200}wx\.navigateTo\(\{ url: `\/pages\/share\/share\?id=\$\{note\.id\}` \}/.test(DETAIL_JS)
  && /onPreviewImage\(e\)[\s\S]{0,240}this\._previewShot\(urls,/.test(DETAIL_JS)
  && /onShow\(\)[\s\S]{0,400}_shotFrom[\s\S]{0,240}String\(shown\.id\)/.test(DETAIL_JS))
// 搬家的失败形态就是"屏上有那枚、js 里没那个函数"，所以两页每个接线的动作都点名查一遍。
function unwired(wxmlPath, jsPath, extra) {
  const wxml = read(wxmlPath)
  const js = read(jsPath) + (extra || '')
  const names = [...new Set([...wxml.matchAll(/(?:bind|catch)(?:tap|input|confirm|longpress|change)="([A-Za-z_]\w*)"/g)].map((m) => m[1]))]
  return { total: names.length, missing: names.filter((n) => !new RegExp('(^|[\\s,{])' + n + '\\s*\\(', 'm').test(js)) }
}
for (const [who, w, j, extra] of [
  // 首页那九枚「卡片上的信息」的处理函数是 `...cardInfo.handlers` spread 上去的，
  // 查接线必须把它们算进来（这一把不重复管那份同源，那是 验-名片弹窗两页同源 的活）。
  ['首页', 'miniprogram/pages/index/index.wxml', 'miniprogram/pages/index/index.js', CARD_INFO],
  ['详情页', 'miniprogram/pages/detail/detail.wxml', 'miniprogram/pages/detail/detail.js', ''],
]) {
  const r = unwired(w, j, extra)
  ck(`${who}屏上每一个接线的动作都找得到实现（${r.total} 个）`, r.missing.length === 0, r.missing.join('、'))
}

// ---------- 四、详情页那一排的三枚各管一件事 ----------
const bar = (/^\s*<view class="action-bar">[\s\S]*?^\s*<\/view>/m.exec(DETAIL_WXML) || [''])[0]
const barBtns = (bar.match(/class="icon-btn[^"]*"/g) || [])
// 10-07 撤掉第三枚的理由是"和右上那一格撞了同一个口"；10-17 那一格只在留过卡片时才画，
// 制作卡片的口没有第二个把手了，所以这一枚以「分享笔记」的名字回来。两条口径不冲突，
// 冲突的是"同一件事两个口"——所以这一条量的是**这一排里 shareAsImage 那个旧名字不许回来**。
ck('详情页上方那一排三枚（编辑／分享笔记／删除），旧那枚「生成笔记卡片」的名字不许回来',
  barBtns.length === 3 && !/primary/.test(bar) && !/shareAsImage/.test(bar),
  barBtns.join(' '))
ck('这一页不再有 onShare（wxml 与 js 两边都不留悬空引用）',
  !/onShare\b/.test(DETAIL_WXML) && !/onShare\s*\(/.test(DETAIL_JS))
ck('中间那一枚绑的就是那一格那一个口（两页同一条口径，不在这一排另开一条开窗路）',
  /class="icon-btn \{\{note\.is_private \? 'disabled' : ''\}\}" bindtap="onCardCell">\{\{t\.shareNote\}\}/.test(DETAIL_WXML)
  && /class="ds-ibtn \{\{detailNote\.is_private \? 'disabled' : ''\}\}" catchtap="onSheetShare">\{\{t\.shareNote\}\}/.test(INDEX_WXML))
ck('两页那枚私密闸都写在处理函数里，不写在按钮上（屏上灰是给人看的，挡住得靠代码）',
  /onCardCell\(\) \{[\s\S]{0,120}if \(this\.data\.note && this\.data\.note\.is_private\) return/.test(DETAIL_JS)
  && /onSheetShare\(\) \{[\s\S]{0,120}if \(!note \|\| note\.is_private\) return/.test(INDEX_JS))
ck('私密那一句挂在行下面、两页各一处（屏上不会两处同名）',
  (DETAIL_WXML.match(/\{\{t\.privateNoShare\}\}/g) || []).length === 1
  && (INDEX_WXML.match(/\{\{t\.privateNoShare\}\}/g) || []).length === 1)
ck('那一页的分栏还是两列（左标题、右那一格），私密或没卡片退回单列',
  /^\s*<view class="dt-hero \{\{note\.is_private \|\| !detailCards\.length \? 'solo' : ''\}\}">/m.test(DETAIL_WXML)
  && /class="dt-lt"/.test(DETAIL_WXML) && /\.dt-hero \.dt-lt \{[\s\S]{0,60}flex: 1;/.test(DETAIL_WXSS))

// ---------- 五、两条规则各只有一个出处 ----------
// ⚠ 2.0.1 S2 把这条谓词往上挪了一层：三处判据现在吃的是 `cardCloud.cellFor`
// （本机那张还在就画它，不在了就用云上登记的那一行顶上），本机那半仍然只有 `cardLog.aliveFor`
// 一个出处。两条都要钉：页面里不许自己 `accessSync`，也不许有人绕过 cellFor 直接吃
// `aliveFor`／`forNote` 当"这篇有没有卡片"——那正是"更新之后卡片不见了"的旧判据。
const onePredicate = (detailSrc) => /function aliveFor\(noteId\)/.test(CARD_LOG)
  && /function cellFor\(noteId\)/.test(CARD_CLOUD)
  && /cardLog\.aliveFor\(noteId\)/.test(CARD_CLOUD)
  && !/accessSync/.test(INDEX_JS) && !/accessSync/.test(detailSrc)
  && !/cardLog\.forNote\(/.test(INDEX_JS + detailSrc)
  && !/cardLog\.aliveFor\(/.test(INDEX_JS + detailSrc)
ck('那一格画不画图只有一个出处：cardCloud.cellFor（本机 ∪ 云上），本机那半只在 cardLog.aliveFor 里写一遍',
  onePredicate(DETAIL_JS))
ck('详情页那一格的读数出在 loadNote 里（从卡片页生成完回来走的就是这一趟，格子当场翻成缩略图）',
  /async loadNote\(id\)[\s\S]{0,3000}detailCards: cardCloud\.cellFor\(note\.id\)/.test(DETAIL_JS))
ck('淡底那格的色规则仍只有 palette 里那一条（页面里不许有第二份函数）',
  (PALETTE.match(/function paleStep\(/g) || []).length === 1
  && !/function paleStep/.test(INDEX_JS) && !/function paleStep/.test(DETAIL_JS))

// 几何：这一格的宽高比必须还是当年那一档（0.717 那条最竖的模板，340×474 等比缩到 252×352）。
// ⚠ 10-17 两屏合一：原来这里是"两处相等"——拿 `.ds-pad` 对 `index.wxss` 的 `.pad`（卡片那一屏那枚白垫）。
//    那一屏撤了，`.pad` 整块没了 ⇒ 第二个读数不存在。**这一条从"两处相等"降成"钉一个有出处的常量"**，
//    出处就是 `docs/规格-笔记卡片这一条线.md` 那张表（340×474 → 乘 0.7412）。
//    要改这个比例，得连规格那一行一起改，不许只动样式。
const num = (src, sel, prop) => {
  const body = (new RegExp(`\\.${sel} \\{([^}]*)\\}`).exec(src) || [, ''])[1]
  return parseFloat((new RegExp(`${prop}: (\\d+(?:\\.\\d+)?)rpx`).exec(body) || [, 'NaN'])[1])
}
const padW = 340, padH = 474
const cellW = num(APP_WXSS, 'ds-pad', 'width'), cellH = num(APP_WXSS, 'ds-pad', 'height')
ck('那一格的白垫比例还是当年那一档（钉常量，不再钉两处相等——第二处已随卡片那一屏撤掉）',
  padW > 0 && Math.abs(cellH / cellW - padH / padW) < 0.01,
  `规格 ${padW}×${padH}（${(padH / padW).toFixed(4)}） vs 这一格 ${cellW}×${cellH}（${(cellH / cellW).toFixed(4)}）`)
ck('卡片那一屏那枚白垫（`.pad`／`.pad-img`）不许留下半截（撤就撤净，留一条就是给不存在的屏定尺寸）',
  !/^\.pad\s*\{/m.test(INDEX_WXSS) && !/^\.pad-img\s*\{/m.test(INDEX_WXSS) && !/^\.grid2\s*\{/m.test(INDEX_WXSS))
ck('那一列的宽就是白垫的宽（格子不会在列里被挤扁或留白条）',
  num(APP_WXSS, 'ds-rt', 'width') === cellW, `${num(APP_WXSS, 'ds-rt', 'width')} vs ${cellW}`)
// 站长 10-17 深夜那句"去掉白边和阴影，只显示卡片图……但相对空间不要压缩，保留现在的布局"落成三个数：
// 盒子内不铺底、不投影；图与盒子同大小（原来那 10rpx 白圈是把图缩小换来的）；盒子那 252×352 一个数没动。
const padBody = (/\.(ds-pad)\s*\{([^}]*)\}/.exec(stripCss(APP_WXSS)) || [, '', ''])[2]
ck('那一格不再垫白底、不再投影（撤的是皮，不是盒子）',
  !/background/.test(padBody) && !/box-shadow/.test(padBody), padBody.replace(/\s+/g, ' ').trim())
ck('里面那张图与盒子同大小（图撑满，白圈撤净；宽高各一条，不许只对齐一个）',
  num(APP_WXSS, 'ds-pad-img', 'width') === cellW && num(APP_WXSS, 'ds-pad-img', 'height') === cellH,
  `图 ${num(APP_WXSS, 'ds-pad-img', 'width')}×${num(APP_WXSS, 'ds-pad-img', 'height')} vs 盒 ${cellW}×${cellH}`)
ck('盒子还是当年那 252×352（"相对空间不要压缩"＝布局一个数不许改）',
  cellW === 252 && cellH === 352, `${cellW}×${cellH}`)

// ---------- 六、字典两语齐全（缺一个键屏上就露 undefined） ----------
const zhBlock = (I18N.match(/zh:\s*\{[\s\S]*?\n  \}/) || [''])[0]
const enBlock = (I18N.match(/en:\s*\{[\s\S]*?\n  \}/) || [''])[0]
// 那两枚空态串（`shareAsImage`／`noCards`）随空态一起从字典退了：留着没人引用就是第二份真相，
// 下一轮谁想给那一格补话会去改那两串，而不是新写一条。
ck('这一轮两页用到的键中英两侧都有',
  ['shareNote', 'privateNoShare', 'shotsLabel', 'appName'].every((k) => new RegExp(`\\b${k}:`).test(zhBlock))
  && ['shareNote', 'privateNoShare', 'shotsLabel', 'appName'].every((k) => new RegExp(`\\b${k}:`).test(enBlock)),
  ['shareNote', 'privateNoShare', 'shotsLabel', 'appName'].filter((k) => !new RegExp(`\\b${k}:`).test(enBlock)).join('、'))
ck('那两枚退役串字典里已经没有了（两页 wxml 也不再引用）',
  !/\bshareAsImage:/.test(zhBlock) && !/\bnoCards:/.test(zhBlock)
  && !/\bshareAsImage:/.test(enBlock) && !/\bnoCards:/.test(enBlock)
  && !/shareAsImage|noCards/.test(stripXml(INDEX_WXML) + stripXml(DETAIL_WXML)))

// ---------- 七、成品弹窗那一层不许缓存正文（站长 10-07 真机报：「标题我已经改了，但生图时候还是旧标题」）----------
// 首页的成品弹窗画的是 `this._posterAssets.note`，而 `_ensurePosterAssets` 原来一进来就按
// noteId 整份短路——第一次开过这篇之后，改完标题回到首页再开，画布照画缓存里那份旧字。
// 缓存该留的是**码**（POST 建码 + 下载那张图，重开一次弹窗烧不起），正文必须每次现读。
const ENSURE = (INDEX_JS.match(/async _ensurePosterAssets\(noteId\) \{[\s\S]*?\n  \},/) || [''])[0]
// 判"形状"而不是判那一句老代码的字面：只钉原文的话，谁换成可选链 `?.noteId` 就绕过去了，
// 尺子绿着而毛病回来了。所以这条量的是**那次 GET 之前一个 return 都不许有**。
const readsFresh = (src) => {
  const g = src.indexOf('await api.getNote(noteId)')
  return g >= 0 && !/\breturn\b/.test(src.slice(0, g))
}
ck('成品弹窗每次现读正文（`api.getNote` 排在那句短路前面）',
  !!ENSURE && readsFresh(ENSURE), ENSURE ? '' : '_ensurePosterAssets 找不到了')
ck('缓存只留给码：`createShare` 与下载码仍然只在没缓存那一趟跑',
  /if \(cached\)[\s\S]{0,240}return[\s\S]{0,240}await api\.createShare/.test(ENSURE)
  && /await this\._downloadQR\(share\.token\)/.test(ENSURE))

// ---------- 八、反向自证：这把尺子真的抓得到漂移 ----------
const driftWxss = DETAIL_WXSS + '\n.ds-pad { width: 200rpx; }\n'
ck('反向①：谁在详情页 wxss 里再补一条 .ds-pad，"一条都不许有"这条必须红',
  cellRules(driftWxss).length > 0)
const driftHide = B ? B.replace(' && detailCards.length', '') : ''
ck('反向②：从那一格的条件里摘掉"留过卡片才算"那一半（没卡片也画一格空白板），"没卡片不渲染"这条必须跟着红',
  !!B && FB.没卡片不渲染 === true && cellFacts(driftHide).没卡片不渲染 === false)
// 这一轮新落的那三数（撤白底、撤投影、图撑满）就是三条皮，最容易被人"顺手补回来"。
const padBack = APP_WXSS.replace('.ds-pad {\n  box-sizing: border-box;', '.ds-pad {\n  background: #fff;\n  box-sizing: border-box;')
ck('反向②b：谁给那一格补回白底，"不再垫白底"这条必须红',
  /background/.test((/\.(ds-pad)\s*\{([^}]*)\}/.exec(stripCss(padBack)) || [, '', ''])[2]))
const imgShrink = APP_WXSS.replace('.ds-pad-img {\n  width: 252rpx;', '.ds-pad-img {\n  width: 232rpx;')
ck('反向②c：把里面那张图缩回当年那 232（白圈回来），"图与盒子同大小"这条必须红',
  num(imgShrink, 'ds-pad-img', 'width') !== num(imgShrink, 'ds-pad', 'width'))
const padDrift = APP_WXSS.replace(/(\.ds-pad \{[^}]*?)width: 252rpx/, '$1width: 260rpx')
ck('反向②d：把盒子改宽一个数（"相对空间不要压缩"那句要的正是它不许动），252×352 那条必须红',
  padDrift !== APP_WXSS && num(padDrift, 'ds-pad', 'width') !== 252)
const driftJs = DETAIL_JS + '\n  onShare() { wx.navigateTo({ url: "/pages/share/share" }) },\n'
ck('反向③：详情页底排那枚的旧实现被谁加回来，"不再有 onShare"这条必须红',
  /onShare\s*\(/.test(driftJs))
const noAlive = DETAIL_JS.replace(/detailCards: cardCloud\.cellFor\(note\.id\)/, 'detailCards: cardLog.forNote(note.id)')
ck('反向④：那一格改回吃裸 forNote（图被清掉也照样画一块白板），上面那条同源判据真的跟着红',
  onePredicate(DETAIL_JS) === true && onePredicate(noAlive) === false)
const backToLocal = DETAIL_JS.replace(/detailCards: cardCloud\.cellFor\(note\.id\)/, 'detailCards: cardLog.aliveFor(note.id)')
ck('反向④b：改回只吃本机那半（就是 2.0.1 S2 之前那一态），同源判据也要红——这条钉的正是"卡片不见了"那个根',
  onePredicate(backToLocal) === false)
const shortCircuitAgain = ENSURE.replace('const cached =',
  'if (this._posterAssets && this._posterAssets.noteId === noteId) return\n    const cached =')
ck('反向⑤：把那句整份短路加回去（就是这一轮真机报的那个毛病），"每次现读正文"这条必须红',
  shortCircuitAgain !== ENSURE && readsFresh(shortCircuitAgain) === false)
const optionalChainAgain = ENSURE.replace('const cached =',
  'if (this._posterAssets?.noteId === noteId) return\n    const cached =')
ck('反向⑥：换一种写法（可选链）绕上面那句字面，形状判据照样红——它量的是"GET 之前不许有 return"',
  optionalChainAgain !== ENSURE && readsFresh(optionalChainAgain) === false)

console.log(`\n${bad.length === 0 ? '全过' : `红 ${bad.length} 条`}`)
bad.forEach((n) => console.log(`  ✗ ${n}`))
process.exit(bad.length ? 1 : 0)
