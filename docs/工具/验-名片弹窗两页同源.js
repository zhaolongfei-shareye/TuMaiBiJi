// 「卡片上的信息」那一层：两个入口是不是真的一份实现。跑法：node docs/工具/验-名片弹窗两页同源.js
//
// 为什么要这一把：站长 10-07 要的是"笔记卡片页那枚取消换成编辑个人名片，点开同一个弹窗"。
// 这一层在首页成品弹窗上已经存在，而且是被真机两轮 BUG 打磨出来的（§8.106 被成品弹窗盖住、
// §8.107 点输入框被算成点空白、adjust-position 必须关着）。**最省事的做法是复制一份**，
// 而复制的代价是以后修其中一处、另一处静默留着同一个 BUG——症状还是那个"弹窗被盖住"，
// 只是换个页面出现，而且没人会想起那层有两份。
//
// 所以这把不测功能（功能由 验-详情浮窗两层-真跑 在首页那一实例上真点），测的是**同源**：
// ① 处理函数只有 utils/cardInfo.js 一份，两页都是 spread 上去的；
// ② 样式只有 app.wxss 一份，两页的 wxss 里一条都不许有；
// ③ 两页 wxml 里那一段弹窗，去掉注释与缩进之后必须逐字相同；
// ④ 那两条真机换来的细节（adjust-position 关着、遮罩不绑收回）在两页里都还在。
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
const APP_WXSS = read('miniprogram/app.wxss')
const INDEX_WXSS = read('miniprogram/pages/index/index.wxss')
const SHARE_WXSS = read('miniprogram/pages/share/share.wxss')
const INDEX_WXML = read('miniprogram/pages/index/index.wxml')
const SHARE_WXML = read('miniprogram/pages/share/share.wxml')
const I18N = read('miniprogram/utils/i18n.js')

// ---------- 一、处理函数只有一份 ----------
const HANDLERS = ['_ciCaps', 'onOpenCardInfo', 'onCloseCardInfo', '_ciCommit', 'onCiSetCard',
  'onCiSlotTap', 'onCiReplace', '_ciPick', 'onCiDrop', 'onCiName', 'onCiSlogan', 'onCiSave']
ck('utils/cardInfo.js 在，且导出 initial 与 handlers',
  /module\.exports = \{ initial, handlers \}/.test(MODULE))
ck('那 12 个方法在模块里齐着（少一个就是某一页点了没反应）',
  HANDLERS.every((h) => new RegExp(`^  ${h}[(:]`, 'm').test(MODULE)),
  HANDLERS.filter((h) => !new RegExp(`^  ${h}[(:]`, 'm').test(MODULE)).join('、') || '全在')

const spreadIn = (src) => /\.\.\.cardInfo\.handlers/.test(src)
const initialIn = (src) => /\.\.\.cardInfo\.initial\(\)/.test(src)
ck('首页 spread 了这份 handlers（不是自己另写一套）', spreadIn(INDEX_JS))
ck('笔记卡片页 spread 了这份 handlers', spreadIn(SHARE_JS))
ck('两页的 data 都吃 cardInfo.initial()（那四个键不各写一份初值）',
  initialIn(INDEX_JS) && initialIn(SHARE_JS))
// 反向钉：某一页要是有人把实现复制回去，spread 还在、判据①照样绿，所以这里单独查一遍。
const dupIn = (src, who) => {
  const hits = HANDLERS.filter((h) => new RegExp(`^  ${h}\\s*\\(`, 'm').test(src))
  ck(`${who} 里没有自己另写的处理函数（复制一份就是下一次只修一处的那个坑）`,
    hits.length === 0, hits.join('、'))
}
dupIn(INDEX_JS, '首页')
dupIn(SHARE_JS, '笔记卡片页')

// 模块里那两条真规则必须只出现一次（它们才是"各写一份迟早走样"的具体内容）
ck('换图走 replaceSlot、空格走 placeSlot 这条选择只写在模块里一处',
  (MODULE.match(/poster\.replaceSlot\(/g) || []).length === 1
  && (MODULE.match(/poster\.placeSlot\(/g) || []).length === 1
  && !/replaceSlot|placeSlot/.test(INDEX_JS.replace(/cardInfo/g, ''))
  && !/replaceSlot|placeSlot/.test(SHARE_JS))
ck('「勾掉卡片不自动挪给别人」这条只在模块里判一次',
  (MODULE.match(/takeRole\(/g) || []).length === 1
  && !/takeRole\(/.test(INDEX_JS) && !/takeRole\(/.test(SHARE_JS))

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
ck('.ci-* 那组样式在 app.wxss 里有一份（26 条）', ciRules(APP_WXSS).length === 26,
  `${ciRules(APP_WXSS).length} 条`)
ck('首页 wxss 里一条都不剩（留着就是第二份真相）', ciRules(INDEX_WXSS).length === 0,
  `${ciRules(INDEX_WXSS).length} 条`)
ck('笔记卡片页 wxss 里也没另写一份', ciRules(SHARE_WXSS).length === 0)
ck('遮罩层级仍是 102（要压过首页成品弹窗那两层，也要压过这一页 fixed 的按钮条）',
  /\.ci-mask \{[\s\S]{0,400}z-index: 102;/.test(APP_WXSS))

// ---------- 四、两页那段弹窗 markup 逐字相同 ----------
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
ck('两页都找得到那一段弹窗', !!A && !!B)
ck('那一段在两页里逐字相同（改字改结构必须一起改，不许一处好一处坏）',
  A === B, A === B ? '' : '两处不一样')
ck('那四枚圆下面只写当前角色，勾「卡片」的口在两页都有',
  !!A && !!B && /onCiSetCard/.test(A) && /onCiSetCard/.test(B))
// 两条真机换来的细节，逐页钉一遍——复制最容易丢的就是这种"看着没用"的属性
ck('两只输入框都关着 adjust-position（开着它，键盘一顶整层就跟原生输入层对不上）',
  (A.match(/adjust-position="\{\{false\}\}"/g) || []).length === 2
  && (B.match(/adjust-position="\{\{false\}\}"/g) || []).length === 2)
ck('收回只留「取消｜保存」两枚，遮罩不绑收回（点输入框曾被算成点空白，整层被收掉）',
  /class="ci-mask" catchtap="">/.test(A) && /class="ci-mask" catchtap="">/.test(B)
  && /onCloseCardInfo/.test(A) && /onCloseCardInfo/.test(B))

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
  'profileName', 'profileNamePh', 'profileSlogan', 'profileSloganPh', 'profileSaved',
  'slotDropTitle', 'slotDropBody', 'slotDropWasCard', 'slotDropWasBg', 'slotDropOk',
  'avatarSaveFailed', 'pickFailed', 'cancel', 'save']
const zhBlock = (I18N.match(/zh:\s*\{[\s\S]*?\n  \}/) || [''])[0]
const enBlock = (I18N.match(/en:\s*\{[\s\S]*?\n  \}/) || [''])[0]
ck('这 21 个键中文那一侧全有', KEYS.every((k) => new RegExp(`\\b${k}:`).test(zhBlock)),
  KEYS.filter((k) => !new RegExp(`\\b${k}:`).test(zhBlock)).join('、'))
ck('这 21 个键英文那一侧全有', KEYS.every((k) => new RegExp(`\\b${k}:`).test(enBlock)),
  KEYS.filter((k) => !new RegExp(`\\b${k}:`).test(enBlock)).join('、'))
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
]) {
  const r = unwired(wxmlPath, jsPath)
  ck(`${who}屏上每一个接线的动作都找得到实现（${r.total} 个）`, r.missing.length === 0, r.missing.join('、'))
}

// ---------- 八、反向自证：这把尺子真的抓得到漂移 ----------
const mutated = B.replace('maxlength="16"', 'maxlength="20"')
ck('反向①：把笔记卡片页那段改一个属性，"逐字相同"这条必须红', A !== mutated)
const fakePage = SHARE_JS + '\n  onCiSave() { /* 有人复制了一份回去 */ },\n'
ck('反向②：某一页里多出一个自己写的 onCiSave，"没有另写一套"这条必须红',
  /onCiSave\s*\(/.test(fakePage.replace(/\.\.\.cardInfo\.handlers/, '')))
const fakeWxss = SHARE_WXSS + '\n.ci-mask { z-index: 5; }\n'
ck('反向③：谁在页面 wxss 里再补一条 .ci-mask，"一条都不许有"这条必须红',
  ciRules(fakeWxss).length > 0)
const noSpread = SHARE_JS.replace(/\.\.\.cardInfo\.handlers/, '')
ck('反向④：把笔记卡片页的 spread 去掉，接线那条必须红', !spreadIn(noSpread))

console.log(`\n${bad.length === 0 ? '全过' : `红 ${bad.length} 条`}`)
bad.forEach((n) => console.log(`  ✗ ${n}`))
process.exit(bad.length ? 1 : 0)
