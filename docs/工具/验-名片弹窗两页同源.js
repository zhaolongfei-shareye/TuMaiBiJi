// 「卡片上的信息」那一层：三个入口是不是真的一份实现。跑法：node docs/工具/验-名片弹窗两页同源.js
//
// 文件名留"两页"是因为它是 10-07 那一批建起来的；**10-18 起这一层有三个入口**（首页成品弹窗、
// 笔记卡片页、首页那枚「换背景」），这把从两页比到三页。改名会牵动别处的引用与跑法，不值当。
//
// 为什么要这一把：站长 10-07 要的是"笔记卡片页那枚取消换成编辑个人名片，点开同一个弹窗"，
// 10-18 01:1x 又加了一句「首页换背景，也要拉起这个弹窗，不需要跳到设置里面换」。
// 这一层在首页成品弹窗上已经存在，而且是被真机两轮 BUG 打磨出来的（§8.106 被成品弹窗盖住、
// §8.107 点输入框被算成点空白、adjust-position 必须关着）。**最省事的做法是复制一份**，
// 而复制的代价是以后修其中一处、另一处静默留着同一个 BUG——症状还是那个"弹窗被盖住"，
// 只是换个页面出现，而且没人会想起那层有几份。
//
// 所以这把不测功能（功能由 验-详情浮窗两层-真跑 与 验-首页换背景拉起这一层 在各自那一实例上真点），
// 测的是**同源**：
// ① 处理函数只有 utils/cardInfo.js 一份，三页都是 spread 上去的；
// ② 样式只有 app.wxss 一份，三页的 wxss 里一条 `.ci-*` 都不许有；
// ③ 三页 wxml 里那一段弹窗，去掉注释与缩进之后必须逐字相同（只许差 `glass-dialog` 那一枚类名）；
// ④ 那两条真机换来的细节（adjust-position 关着、遮罩不绑收回）在三页里都还在。
// 加反向自证：把②③各造一处漂移，判据必须红——不然它只是在读文件，不是在守东西。
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

const MODULE = read('miniprogram/utils/cardInfo.js')
const INDEX_JS = stripJs(read('miniprogram/pages/index/index.js'))
const SHARE_JS = stripJs(read('miniprogram/pages/share/share.js'))
const CREATE_JS = stripJs(read('miniprogram/pages/create/create.js'))
const APP_WXSS = read('miniprogram/app.wxss')
const INDEX_WXSS = read('miniprogram/pages/index/index.wxss')
const SHARE_WXSS = read('miniprogram/pages/share/share.wxss')
const CREATE_WXSS = read('miniprogram/pages/create/create.wxss')
const CREATE_WXML = read('miniprogram/pages/create/create.wxml')
const INDEX_WXML = read('miniprogram/pages/index/index.wxml')
const SHARE_WXML = read('miniprogram/pages/share/share.wxml')
const I18N = read('miniprogram/utils/i18n.js')

// ---------- 〇、首页那一枚「换背景」现在拉起的是哪一头 ----------
// 他 10-18 01:1x 那句「不需要跳到设置里面换」＝这一枚不再 navigateTo profile。
// 单独钉这一条是因为"弹窗长对了、入口还在跳页"这种半成品静态上完全看不出来。
const swapLine = (/goHomeBg\(\)\s*\{[\s\S]{0,120}?\n  \}/.exec(CREATE_JS) || [''])[0]
ck('「换背景」那一枚现在拉起这一层（不再跳「我的→卡片模板」）',
  /this\.onOpenCardInfo\(\)/.test(swapLine) && !/navigateTo/.test(swapLine),
  swapLine.split('\n').slice(1).join(' ⏎ ').trim())
ck('反向：那条导流要是被人写回来（wx.navigateTo 到 profile），上面这条必须红',
  /wx\.navigateTo\(\{ url: '\/pages\/profile\/profile' \}\)/.test(
    swapLine.replace('this.onOpenCardInfo()', "wx.navigateTo({ url: '/pages/profile/profile' })")))
// 设置那一页的两枚芯片他没下撤的命令，所以还留着；这里把它钉成"他知道的两处"，
// 免得以后有人拿"同一件事不留两个口"当依据，把那一页的口悄悄删掉。
ck('「我的→卡片模板」那一页的「背景」芯片照旧还在（他这轮只说"不必跳过去换"，没说撤那一处）',
  /data-role="bg" catchtap="onToggleRole"/.test(read('miniprogram/pages/profile/profile.wxml')))

// 这一层不跳页，勾完「背景」屏上那张图必须当场换——首页那一屏靠 _ciAfterCommit 接这一刀
const ciCommitCreate = (/_{0,1}ciAfterCommit\(\)\s*\{[\s\S]{0,300}?\n  \}/.exec(CREATE_JS) || [''])[0]
ck('首页接了 _ciAfterCommit：bgSrc 重取，且深浅那一档跟着重算（换的可能是浅图，字不翻就白压白）',
  /homeBg\(\)/.test(ciCommitCreate) && /bgSrc:/.test(ciCommitCreate)
  && /applyTone\(/.test(ciCommitCreate) && /toneRects\(\)/.test(ciCommitCreate),
  ciCommitCreate.replace(/\n/g, ' ⏎ ').slice(0, 160))

// ---------- 一、处理函数只有一份 ----------
const HANDLERS = ['_ciCaps', 'onOpenCardInfo', 'onCloseCardInfo', '_ciCommit', 'onCiSetCard',
  'onCiSetBg', 'onCiSlotTap', 'onCiReplace', '_ciPick', 'onCiDrop', 'onCiName', 'onCiSlogan', 'onCiSave']
ck('utils/cardInfo.js 在，且导出 initial 与 handlers',
  /module\.exports = \{ initial, handlers \}/.test(MODULE))
ck(`那 ${HANDLERS.length} 个方法在模块里齐着（少一个就是某一页点了没反应）`,
  HANDLERS.every((h) => new RegExp(`^  ${h}[(:]`, 'm').test(MODULE)),
  HANDLERS.filter((h) => !new RegExp(`^  ${h}[(:]`, 'm').test(MODULE)).join('、') || '全在')

const spreadIn = (src) => /\.\.\.cardInfo\.handlers/.test(src)
const initialIn = (src) => /\.\.\.cardInfo\.initial\(\)/.test(src)
ck('首页 spread 了这份 handlers（不是自己另写一套）', spreadIn(INDEX_JS))
ck('笔记卡片页 spread 了这份 handlers', spreadIn(SHARE_JS))
ck('首页那一屏（「换背景」拉起的这一实例）也 spread 了同一份', spreadIn(CREATE_JS))
ck('三页的 data 都吃 cardInfo.initial()（那四个键不各写一份初值）',
  initialIn(INDEX_JS) && initialIn(SHARE_JS) && initialIn(CREATE_JS))
// 反向钉：某一页要是有人把实现复制回去，spread 还在、判据①照样绿，所以这里单独查一遍。
const dupIn = (src, who) => {
  const hits = HANDLERS.filter((h) => new RegExp(`^  ${h}\\s*\\(`, 'm').test(src))
  ck(`${who} 里没有自己另写的处理函数（复制一份就是下一次只修一处的那个坑）`,
    hits.length === 0, hits.join('、'))
}
dupIn(INDEX_JS, '首页')
dupIn(SHARE_JS, '笔记卡片页')
dupIn(CREATE_JS, '首页那一屏（create）')

// 模块里那两条真规则必须只出现一次（它们才是"各写一份迟早走样"的具体内容）
ck('换图走 replaceSlot、空格走 placeSlot 这条选择只写在模块里一处',
  (MODULE.match(/poster\.replaceSlot\(/g) || []).length === 1
  && (MODULE.match(/poster\.placeSlot\(/g) || []).length === 1
  && !/replaceSlot|placeSlot/.test(INDEX_JS.replace(/cardInfo/g, ''))
  && !/replaceSlot|placeSlot/.test(SHARE_JS))
// 「背景」那一枚与「卡片」那一枚必须走同一个 poster.takeRole（各写一份就会漂成两种语义）：
// 所以模块里 takeRole 的调用点从 10-18 起是**两处**（card 与 bg），第三处出现在页面里才红。
ck('两个角色都走模块里那一份 takeRole（模块内两处＝卡片＋背景；页面里一处都不许有）',
  (MODULE.match(/takeRole\(/g) || []).length === 2
  && !/takeRole\(/.test(INDEX_JS) && !/takeRole\(/.test(SHARE_JS) && !/takeRole\(/.test(CREATE_JS),
  `模块 ${(MODULE.match(/takeRole\(/g) || []).length} 处`)

// ---------- 二、页面各自的钩子 ----------
ck('首页收窗后仍会重画成品（弹窗里换完头像，卡片上还是旧的那张就是预览骗人）',
  /_ciAfterChange\(\)[\s\S]{0,220}templateOpen[\s\S]{0,160}_renderPoster\(\)/.test(INDEX_JS))
ck('首页改完槽会顺手刷头部那张背景（这一层不跳页，bgSrc 只在 onShow 重取）',
  /_ciAfterCommit\(\)\s*\{[\s\S]{0,80}homeBg\(\)/.test(INDEX_JS))
ck('笔记卡片页收窗后重画这一页那张成品',
  /_ciAfterChange\(\)[\s\S]{0,200}this\.render\(\)/.test(SHARE_JS))
ck('笔记卡片页在图还没出来时不重画（那时 this._note 还没有，画一次抛一次）',
  /_ciAfterChange\(\)\s*\{\s*if \(this\.data\.generating\) return/.test(SHARE_JS))

// ---------- 三、样式只有一份 ----------
const ciRules = (src) => (src.match(/^\.ci-[\w-]+[^\n]*\{/gm) || [])
ck(`.ci-* 那组样式在 app.wxss 里有一份（10-18 加那枚「背景」芯片之后是 27 条）`,
  ciRules(APP_WXSS).length === 27, `${ciRules(APP_WXSS).length} 条`)
ck('首页 wxss 里一条都不剩（留着就是第二份真相）', ciRules(INDEX_WXSS).length === 0,
  `${ciRules(INDEX_WXSS).length} 条`)
ck('笔记卡片页 wxss 里也没另写一份', ciRules(SHARE_WXSS).length === 0)
ck('首页那一屏（create）也没另写一份 .ci-*（它只有那两条 has-bg 玻璃覆盖，选择器不以 .ci- 开头）',
  ciRules(CREATE_WXSS).length === 0, `${ciRules(CREATE_WXSS).length} 条`)
ck('遮罩层级仍是 102（要压过首页成品弹窗那两层，也要压过这一页 fixed 的按钮条）',
  /\.ci-mask \{[\s\S]{0,400}z-index: 102;/.test(APP_WXSS))
// 10-18 那枚「背景」芯片：壳必须与「卡片」那枚共用同一条规则（各写一份就会漂成两种选中样子）
ck('「背景」那枚芯片与「卡片」那枚共用同一个"选中"墨底壳（同一条规则里两个选择器）',
  /\.ci-cap\.role,\s*\n\.ci-bg\.role \{/.test(APP_WXSS))
ck('「背景」那枚芯片的字色／字号与「卡片」那枚同一条声明（不是第二份写死的数）',
  /\.ci-cap,\s*\n\.ci-bg \{/.test(APP_WXSS))

// ---------- 四、三页那段弹窗 markup 逐字相同 ----------
function popupOf(src) {
  const from = src.indexOf('<view wx:if="{{cardInfoOpen}}" class="ci-mask"')
  if (from < 0) return null
  const rest = src.slice(from)
  // 这一段自己收在"两空格缩进的 </view>"上（里面最深到 8 空格），拿缩进当尺子比数标签稳。
  const end = rest.indexOf('\n  </view>')
  if (end < 0) return null
  return rest.slice(0, end + '\n  </view>'.length)
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n')
}
const A = popupOf(INDEX_WXML)
const B = popupOf(SHARE_WXML)
const C = popupOf(CREATE_WXML)
ck('三页都找得到那一段弹窗（首页成品弹窗／笔记卡片页／首页「换背景」）', !!A && !!B && !!C,
  [A, B, C].map((x, i) => (x ? '' : i)).filter(Boolean).join('、') || '三份都在')
// 10-11 毛玻璃：首页那枚卡挂上了 `glass-dialog`（站长逐条裁定 X4 原话「4、做」），
// 笔记卡片页这一枚没挂——依据不是"我懒得改两处"，是那一页**根本没有形象图可糊**：
// share.wxml 全文没有 `has-bg`（该页不铺 bgSrc），玻璃的闸永远合不上，糊了没有对象。
// 所以三页仍必须逐字相同，**只许差这一枚类名**；差任何别的东西照旧红。
// 反向钉住依据本身：哪天 share 页也开始铺形象图，下面那条 "闸还不存在" 就红，逼人来重拍这一格。
const Awo = A.replace(' glass-dialog', '')
// 10-18 起挂 `glass-dialog` 的是**两枚**（首页成品弹窗＋首页那一屏），归一化就得两处都归一：
// 只归一 A 一处，比到 create 那一份会凭空红一条（判据写歪，不是画错）。
const Cwo = C.replace(' glass-dialog', '')
const firstDiff = (x, y) => {
  const a = x.split('\n'); const b = y.split('\n')
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i
  return -1
}
ck('那一段在三页里逐字相同（改字改结构必须一起改，不许一处好一处坏）',
  Awo === B && Awo === Cwo,
  Awo === B ? (Awo === Cwo ? '' : `create 与首页差在第 ${firstDiff(Awo, Cwo)} 行`)
    : `首页与笔记卡片页差在第 ${firstDiff(Awo, B)} 行`)
ck('吃玻璃的是两枚（首页成品弹窗＋首页那一屏），笔记卡片页那枚照旧实心',
  /class="ci-card glass-dialog"/.test(A) && /class="ci-card glass-dialog"/.test(C)
  && !/glass-dialog/.test(B))
ck('笔记卡片页那一格不做玻璃的依据还在：这一页没有 has-bg 那道闸',
  !/has-bg/.test(SHARE_WXML) && !/bgSrc/.test(SHARE_WXML))
ck('那四枚圆下面两枚角色芯片都在（「背景」onCiSetBg ＋「头像」onCiSetCard），三个实例一个不缺',
  [A, B, C].every((x) => !!x && /catchtap="onCiSetCard"/.test(x) && /catchtap="onCiSetBg"/.test(x)))
ck('两枚的次序照他那句话：「背景」在前、「头像」在后（三格一致，不许一页一个样）',
  [A, B, C].every((x) => !!x && x.indexOf('catchtap="onCiSetBg"') < x.indexOf('catchtap="onCiSetCard"')))
ck('「背景」那枚只画在有图那一格（空格那一格画出来就是一枚按了什么都不发生的钮）',
  [A, B, C].every((x) => !!x && /wx:if="\{\{item\.path\}\}" class="ci-bg/.test(x)))
// 两条真机换来的细节，逐页钉一遍——复制最容易丢的就是这种"看着没用"的属性
ck('两只输入框都关着 adjust-position（开着它，键盘一顶整层就跟原生输入层对不上）',
  [A, B, C].every((x) => !!x && (x.match(/adjust-position="\{\{false\}\}"/g) || []).length === 2))
ck('收回只留「取消｜保存」两枚，遮罩不绑收回（点输入框曾被算成点空白，整层被收掉）',
  [A, B, C].every((x) => !!x && /class="ci-mask" catchtap="">/.test(x) && /onCloseCardInfo/.test(x)))

// ---------- 五、这一页底排换的是哪一枚 ----------
ck('笔记卡片页底排左端是「编辑个人名片」（原来到这一页只有取消，没设形象就没法挑图）',
  /class="btn-secondary" bindtap="onOpenCardInfo">\{\{t\.editCard\}\}/.test(SHARE_WXML))
ck('右端那枚「保存到相册」没被顺带动到',
  /class="btn-primary" bindtap="saveToAlbum" disabled="\{\{!imagePath\}\}">\{\{t\.saveToAlbum\}\}/.test(SHARE_WXML))
ck('这一页不再有 onCancel（wxml 与 js 两边都不留悬空引用）',
  !/onCancel/.test(SHARE_WXML) && !/onCancel\s*\(/.test(SHARE_JS))
ck('首页那一排还是「取消｜编辑个人名片」（这一轮不许把它带歪）',
  /bindtap="onCancelTemplate">\{\{t\.cancel\}\}[\s\S]{0,80}bindtap="onOpenCardInfo">\{\{t\.editCard\}\}/.test(INDEX_WXML))

// ---------- 六、字典两语齐全（缺一个键屏上就露 undefined） ----------
const KEYS = ['editCard', 'cardInfo', 'cardInfoHint', 'cardReplace', 'slotPos', 'slotBg', 'slotCard',
  'slotAvatar',
  'profileName', 'profileNamePh', 'profileSlogan', 'profileSloganPh', 'profileSaved',
  'slotDropTitle', 'slotDropBody', 'slotDropWasCard', 'slotDropWasBg', 'slotDropOk',
  'avatarSaveFailed', 'pickFailed', 'cancel', 'save']
const zhBlock = (I18N.match(/zh:\s*\{[\s\S]*?\n  \}/) || [''])[0]
const enBlock = (I18N.match(/en:\s*\{[\s\S]*?\n  \}/) || [''])[0]
ck(`这 ${KEYS.length} 个键中文那一侧全有`, KEYS.every((k) => new RegExp(`\\b${k}:`).test(zhBlock)),
  KEYS.filter((k) => !new RegExp(`\\b${k}:`).test(zhBlock)).join('、'))
ck(`这 ${KEYS.length} 个键英文那一侧全有`, KEYS.every((k) => new RegExp(`\\b${k}:`).test(enBlock)),
  KEYS.filter((k) => !new RegExp(`\\b${k}:`).test(enBlock)).join('、'))
// ---------- 六之乙、这一层的叫法（站长 10-18 01:3x 那句） ----------
// 原话「卡片上的信息，改为，图片设置 两个按钮，分别是背景，头像」
const strOf = (block, k) => (new RegExp(`\\b${k}: '([^']*)'`).exec(block) || [, ''])[1]
ck('这一层的标题中文改成「图片设置」（旧的「卡片上的信息」不许回来）',
  strOf(zhBlock, 'cardInfo') === '图片设置', strOf(zhBlock, 'cardInfo'))
ck('两枚按钮的中文＝「背景」与「头像」（顺序按他那句话念的那序）',
  strOf(zhBlock, 'slotBg') === '背景' && strOf(zhBlock, 'slotAvatar') === '头像',
  `${strOf(zhBlock, 'slotBg')}／${strOf(zhBlock, 'slotAvatar')}`)
ck('「头像」是这一层新起的一枚键：卡片模板页那两枚芯片的叫法没被顺带动（slotCard 还是「卡片」）',
  strOf(zhBlock, 'slotCard') === '卡片' && /t\.slotCard/.test(read('miniprogram/pages/profile/profile.wxml')),
  `slotCard＝${strOf(zhBlock, 'slotCard')}`)
ck('这一层里不再有任何一处吃 t.slotCard（那枚字在这层已换成「头像」）',
  [A, B, C].every((x) => !!x && !/t\.slotCard/.test(x)))
ck('英文那一侧两个词都放得进各自那枚（标题 14 字符、芯片 6 字符，都短过按钮那一档）',
  strOf(enBlock, 'cardInfo').length <= 16 && strOf(enBlock, 'slotAvatar').length <= 8,
  `${strOf(enBlock, 'cardInfo')}／${strOf(enBlock, 'slotAvatar')}`)
ck('反向：把标题改回「卡片上的信息」，上面那条必须红',
  strOf(zhBlock.replace(`cardInfo: '图片设置'`, `cardInfo: '卡片上的信息'`), 'cardInfo') === '卡片上的信息')
const editZh = (/editCard: '([^']+)'/.exec(zhBlock) || [, ''])[1]
const editEn = (/editCard: '([^']+)'/.exec(enBlock) || [, ''])[1]
ck('按钮上那句中文还是他 10-03 认过的「编辑个人名片」（要改名得他说话，不许顺手）',
  editZh === '编辑个人名片', editZh)
ck('英文那一枚放得进半宽按钮（13 字符，比"保存到相册"那枚的英文还短）',
  editEn.length <= 14, editEn)

// ---------- 七、两页每个接线的按钮都还有实现（搬家的失败形态就是"点了没反应"） ----------
function unwired(wxmlPath, jsPath) {
  const wxml = read(wxmlPath)
  const js = read(jsPath) + MODULE
  const names = [...new Set([...wxml.matchAll(/(?:bind|catch)(?:tap|input|confirm|touchstart|touchend|focus|blur)="([A-Za-z_]\w*)"/g)].map((m) => m[1]))]
  return { total: names.length, missing: names.filter((n) => !new RegExp('(^|[\\s,{])' + n + '\\s*\\(', 'm').test(js)) }
}
for (const [who, wxmlPath, jsPath] of [
  ['首页', 'miniprogram/pages/index/index.wxml', 'miniprogram/pages/index/index.js'],
  ['笔记卡片页', 'miniprogram/pages/share/share.wxml', 'miniprogram/pages/share/share.js'],
  ['首页那一屏（create）', 'miniprogram/pages/create/create.wxml', 'miniprogram/pages/create/create.js'],
]) {
  const r = unwired(wxmlPath, jsPath)
  ck(`${who}屏上每一个接线的动作都找得到实现（${r.total} 个）`, r.missing.length === 0, r.missing.join('、'))
}

// create 那一屏铺了形象图时这张卡也该是白纱＋糊（与首页同一副皮）。皮必须写在页内，
// 所以这里查的是"这一页有没有那两条"，不是"有没有并进 app.wxss"。
// ⚠ 反向那一刀只在**这一块**里删行：原来对整个 create.wxss 做 replace，那一页还有别处吃
//    backdrop-filter（面板、右滑条），删的是别人的那一行、这一块根本没动，于是反向自己红。
const ciGlassBlock = (/\.container\.has-bg \.ci-card\.glass-dialog \{[\s\S]*?\n\}/.exec(CREATE_WXSS) || [''])[0]
const glassHit = (s) => /var\(--glass-veil\)/.test(s) && /backdrop-filter: var\(--glass-bf\)/.test(s)
ck('create 那两条 has-bg 玻璃覆盖在（不写就是同一层在这一屏实心、在笔记页糊，看着像两套皮）',
  glassHit(ciGlassBlock) && /\.container\.has-bg \.ci-card\.glass-dialog \.ci-hint \{/.test(CREATE_WXSS),
  `这一块 ${ciGlassBlock.split('\n').length} 行`)
ck('反向：只把这一块里含 backdrop-filter 的两行删掉，上面这条必须红',
  ciGlassBlock.length > 0 && !glassHit(ciGlassBlock.replace(/^[^\n]*backdrop-filter[^\n]*\n/gm, '')))

// ---------- 八、反向自证：这把尺子真的抓得到漂移 ----------
const mutated = B.replace('maxlength="16"', 'maxlength="20"')
ck('反向①：把笔记卡片页那段改一个属性，"逐字相同"这条必须红', Awo !== mutated)
const fakePage = SHARE_JS + '\n  onCiSave() { /* 有人复制了一份回去 */ },\n'
ck('反向②：某一页里多出一个自己写的 onCiSave，"没有另写一套"这条必须红',
  /onCiSave\s*\(/.test(fakePage.replace(/\.\.\.cardInfo\.handlers/, '')))
const fakeWxss = SHARE_WXSS + '\n.ci-mask { z-index: 5; }\n'
ck('反向③：谁在页面 wxss 里再补一条 .ci-mask，"一条都不许有"这条必须红',
  ciRules(fakeWxss).length > 0)
const noSpread = SHARE_JS.replace(/\.\.\.cardInfo\.handlers/, '')
ck('反向④：把笔记卡片页的 spread 去掉，接线那条必须红', !spreadIn(noSpread))
// 新加的那枚「背景」芯片是三页同源的一部分：只在 create 那一份里丢掉它，两条都必须红
const noBgChip = Cwo.replace(/<view wx:if="\{\{item\.path\}\}" class="ci-bg[\s\S]*?\n<\/view>/, '')
ck('反向⑤：三格里只把首页那一屏的「背景」芯片删掉，"逐字相同"与"两枚芯片都在"两条一起红',
  noBgChip !== Cwo && Awo !== noBgChip
  && ![A, B, noBgChip].every((x) => /catchtap="onCiSetBg"/.test(x)))
ck('反向⑥：模块里丢掉 onCiSetBg，"方法齐着"那条必须红（屏上那枚就成了点了没反应的死芯片）',
  !/^  onCiSetBg[(:]/m.test(MODULE.replace(/^  onCiSetBg\(e\) \{[\s\S]*?\n  \},/m, '')))

console.log(`\n${bad.length === 0 ? '全过' : `红 ${bad.length} 条`}`)
bad.forEach((n) => console.log(`  ✗ ${n}`))
process.exit(bad.length ? 1 : 0)
