// 分类那一排的闸（站长 10-18 三段话，最后一段是把上一段里的一枚打回）：
//   「分类数量要做限制，最多8个包括私密分类，私密永远排最后一格。数量超过就，输入框就提示要删除才能添加。
//     分类名称最多4个汉字。英文长度，你帮我设好（但显示时候，在列表页多个分类排列时候进行裁切。
//     避免过长，无法显示全。）但，不影响详情页显示。」
//   「1。增加一个新增入口，点击或长按时和输入框效果一样  2。数量已达上限，要先删除一个分类才能新增；
//     名字被切短，划过去的那一句，显示在对应的元素上面」
//   「列表上怎么多了一个“新增”，有点多余啊，去掉」← 这一句把上面 1。那一枚打回了
// 跑法：node docs/工具/验-分类上限与长度.js
//
// 这一把只管**结构**：数有几个出处、闸挂在谁身上、裁切规则落在哪一枚选择器上、撤走的那一枚有没有撤净。
// 屏上真不真（第 9 格落不下、最后一枚是不是私密、省略号出没出、那句话浮在哪）是
// `验-分类上限与长度-真跑.js` 那把的事（它要连 IDE，且全程只动本机草稿、一个字都不上服务端）。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const rd = (f) => fs.readFileSync(f, 'utf8')
const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  .replace(/<!--[\s\S]*?-->/g, '')

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— 实得：' + extra : ''))
}

const WXML = strip(rd(P('pages/index/index.wxml')))
const JS = strip(rd(P('pages/index/index.js')))
const WXSS = strip(rd(P('pages/index/index.wxss')))
const DETAIL_WXSS = strip(rd(P('pages/detail/detail.wxss')))
const ZH = require(P('utils/i18n.js')).texts('zh')
const EN = require(P('utils/i18n.js')).texts('en')

// 方法体：从定义那一行起，到下一个两空格缩进的 `}`（这个文件里方法就是这么排的）。
// ⚠ 锚点不许只给方法名——会锚到第一个调用点上（这条坑 `验-分类面板内管理.js` 自己红过三条）。
const seg = (src, head) => {
  const i = src.indexOf(head)
  if (i < 0) return ''
  const j = src.indexOf('\n  }', i)
  return j < 0 ? src.slice(i) : src.slice(i, j + 4)
}
// 一个类名的**全部**规则体：只取第一处就是假牙——往后再补一条带 max-width 的就量不到了。
const rules = (src, name) => src.match(new RegExp('\\.' + name + '(?![\\w-])[^{]*\\{[^}]*\\}', 'g')) || []
const rule = (src, name) => (rules(src, name)[0] || '')

// ---------- ① 三个数各只有一个出处 ----------
ok('① 上限三个数各定义一次：8 格／4 汉字／10 个字母（英文那一档是我替他定的，话术里不许再写死第二份）',
  (JS.match(/^const CAT_MAX = 8$/gm) || []).length === 1
  && (JS.match(/^const CAT_NAME_CJK = 4$/gm) || []).length === 1
  && (JS.match(/^const CAT_NAME_LATIN = 10$/gm) || []).length === 1)
ok('① 那两句话术里的数是递进去的（`{max}`／`{cjk}`／`{latin}`），双语都有同一组占位',
  /\{max\}/.test(ZH.catMaxToast) && /\{max\}/.test(EN.catMaxToast)
  && /\{cjk\}/.test(ZH.catNameLimit) && /\{latin\}/.test(ZH.catNameLimit)
  && /\{cjk\}/.test(EN.catNameLimit) && /\{latin\}/.test(EN.catNameLimit)
  && !/\b8\b|\b4\b|\b10\b/.test(ZH.catMaxToast + EN.catMaxToast + ZH.catNameLimit + EN.catNameLimit))
ok('① 输入框那句占位话也吃 `{max}`（满那一档与提示说的是同一个数）',
  /\{max\}/.test(ZH.catAddFullPh) && /\{max\}/.test(EN.catAddFullPh)
  && !/\b8\b/.test(ZH.catAddFullPh + EN.catAddFullPh))
ok('① 反向钉：三句提示没有一句是"裸着发出去"的——每一句都要先过 `catLimits()` 再递',
  !/title: t\('catMaxToast'/.test(JS) && !/title: t\('catNameLimit'/.test(JS)
  && !/wx\.showToast\(\{ title: fmt\(t\('catMaxToast'/.test(JS)
  && (JS.replace('function catLimits() {', '').match(/catLimits\(\)/g) || []).length === 4)
ok('① 占位话挂在 data 上（`catPh`），wxml 里没有三元现拼：那一句里有 `{max}`，wxml 拿不到 fmt',
  /placeholder="\{\{catPh\}\}"/.test(WXML) && !/catAddFullPh/.test(WXML)
  && /catPh: fmt\(t\(full \? 'catAddFullPh' : 'catAddPh'/.test(JS))

// ---------- ② 长度闸：先判长度、再判数量；不合格的那条不许静默吞字 ----------
const ADD = seg(JS, 'onCatAddCommit() {')
ok('② 长度判据只有一份（汉字与字母各数各的，按码点不按 .length）',
  (JS.match(/function catNameTooLong\(name\) \{/g) || []).length === 1
  && /CJK\.test\(c\)/.test(JS) && /Array\.from\(String\(name \|\| ''\)\)/.test(JS)
  && /cjk > CAT_NAME_CJK \|\| cs\.length - cjk > CAT_NAME_LATIN/.test(JS))
ok('② 两把入口都吃它：新增那一趟与改名那一趟（漏掉改名＝换个入口就能打超长名）',
  /catNameTooLong\(n\)/.test(ADD) && /catNameTooLong\(name\)/.test(seg(JS, '_catRename(it) {')))
ok('② 顺序是先长度后数量：名字不合格的那条根本没资格去占格子',
  ADD.indexOf('catNameTooLong') >= 0 && ADD.indexOf('catNameTooLong') < ADD.indexOf('CAT_MAX'))
ok("② 超长那几条**贴回框里**（`catNewName: bad.join(' ')`），不许静默吞字；合格的那几条照常落格",
  /catNewName: bad\.join\(' '\)/.test(ADD) && /ok\.forEach\(\(n\) =>/.test(ADD))
ok('② 落完会超过 8 格 ⇒ 这一批一条都不落（全有全无），并把那句"先删掉一个才能加"报出来',
  /draft\.length \+ ok\.length > CAT_MAX/.test(ADD)
  && ADD.indexOf('catMaxToast') < ADD.indexOf('ok.forEach'))
ok('② 改名那一趟被长度闸挡回来时**不改那一格**（`it.name` 的赋值都在闸之后）',
  (() => {
    const s = seg(JS, '_catRename(it) {')
    return s.indexOf('catNameTooLong') >= 0 && s.indexOf('catNameTooLong') < s.indexOf('it.name = name')
  })())

// ---------- ③ 私密永远最后一格 ----------
const VIEW = seg(JS, '_catView(edit, cats) {')
ok('③ 沉底那一份只有一处（草稿与平时两张表都吃它）',
  (JS.match(/^ {2}_catSink\(list\) \{/gm) || []).length === 1)
ok('③ 三个落点都沉：草稿进来（`_toDraft`）、渲染源（`_catView` 平时那一态）、新增落完（`onCatAddCommit`）',
  /this\._catSink\(\(list \|\| \[\]\)\.map/.test(seg(JS, '_toDraft(list) {'))
  && /this\._catSink\(src\)\.forEach/.test(VIEW)
  && /this\._catDraft = this\._catSink\(draft\)/.test(ADD))
ok('③ 反向钉：管理态那一支不许再沉第二次（渲染顺序与草稿下标一分叉，拖动的 rect↔下标就错位）',
  // 数 occurrences 而不是查"锚点之后有没有"：把 `_catSink(this._catDraft || [])` 包在调用外面时，
  // 锚点之后那一段里当然没有 `_catSink`——那样判会假绿（这一条自己红过一轮，改的就是量法）。
  // 整段 `_catView` 里只许出现一次，而且那一次必须吃的是渲染源 `src`（平时那一支）。
  (VIEW.match(/_catSink/g) || []).length === 1
  && /this\._catSink\(src\)\.forEach/.test(VIEW)
  && VIEW.indexOf('this._catSink(src)') < VIEW.indexOf('return out'))
ok('③ 部分失败重建草稿那一路也沉（没成的新格不许落在私密那一格之后）',
  /this\._catDraft = this\._catSink\(draft\)/.test(seg(JS, '_catResync(bad) {')))

// ---------- ④ 拖动两道闸 ----------
const DS = seg(JS, 'onCatDragStart(e) {')
const STEP = seg(JS, 'async _catDragStep() {')
ok('④ 私密那一格不起拖', /if \(this\._catDraft\[i\]\.isPrivate\) return/.test(DS))
ok('④ 别的格不许越过它：对面那一格是私密就停（否则一拖它就成倒数第二格）',
  /if \(!other \|\| other\.isPrivate\) return/.test(STEP)
  && STEP.indexOf('const other = this._catDraft[to]') < STEP.indexOf('this._catDraft.splice(d.i, 1)'))
ok('④ 拖动那一条线的下标基准＝屏上枚数**等于**草稿格数（「新增」撤了，屏上不再多那一枚；对不上就这一趟不换）',
  /const n = \(this\._catDraft \|\| \[\]\)\.length/.test(STEP) && /const right = d\.i \+ 1 < n \?/.test(STEP)
  && /if \(rects\.length !== n \|\| n < 2\) return/.test(STEP)
  // 反向钉：旧那句「屏上必然多一枚」的算术不许留着——留着就是拖动被一道永远成立的假前提挡死。
  && !/rects\.length < n \+ 1/.test(STEP))

// ---------- ⑤ 「新增」那一枚：要过，又被自己打回了 ⇒ 一处不许留 ----------
ok('⑤ 那一排只有「全部」＋他自己的那几格：`_catView` 两支各 return 一次，没有第三枚',
  (VIEW.match(/return out/g) || []).length === 2 && (VIEW.match(/out\.push/g) || []).length === 3
  && !/key: 'add'/.test(VIEW))
ok('⑤ 反向钉（撤一个东西要撤净）：话术、皮、把手、data 栏、wxml 标记五处都没有"新增那一枚"的残骸',
  !ZH.catAddChip && !EN.catAddChip && !ZH.catLockedMax && !EN.catLockedMax
  && !/\.ix-cat\.add|\.ix-cat\.dim/.test(WXSS)
  && !/_catAddTap|catFocus|onCatAddBlur|key === 'add'/.test(JS)
  && !/focus="\{\{catFocus\}\}"/.test(WXML) && /bindblur="onCatAddCommit"/.test(WXML))
ok('⑤ 新增那一条口只剩一扇：管理态里分类 icon 右手边那枚输入框（井格那一枚是进出同一个口，不是第二个入口）',
  /wx:if="\{\{catEdit\}\}" class="srch ixl-add"/.test(WXML)
  && /if \(this\.data\.catEdit\) \{ this\._saveCatEdit\(\); return \}/.test(seg(JS, 'onCatManageTap() {')))

// ---------- ⑥ 那两句挂在对应的元素上面 ----------
const NOTE = seg(JS, '_catNoteAt(key, sel, i, text) {')
ok('⑥ 浮层的落点现量（那一排在横向 scroll-view 里，超出盒子的那一截会被切掉 ⇒ 不挂进元素里面）',
  /wx:if="\{\{catNote\}\}" class="ix-note" style="left:\{\{catNoteX\}\}px;top:\{\{catNoteY\}\}px"/.test(WXML)
  && !/class="ix-cat[^"]*"[^>]*>\s*\{\{catNote\}\}/.test(WXML)
  && /selectAll\(sel\)\.boundingClientRect\(\)/.test(NOTE)
  && /Math\.max\(96, Math\.min\(w - 96,/.test(NOTE))
ok('⑥ 两个落点各归各的元素：私密那一枚吃 `.ix-cat` 里它自己那一个，两道闸吃输入框那一片（`.ixl-add`）',
  /this\._catNoteAt\(key, '\.ix-cat', i, msg\)/.test(seg(JS, '_catChipNote(key, text) {'))
  && /this\._catNoteAt\('_add', '\.ixl-add', 0, text\)/.test(seg(JS, '_catAddNote(text) {'))
  && /if \(it\.isPrivate\) \{ this\._catChipNote\(it\.key\); return \}/.test(seg(JS, 'onCatChipTap(e) {'))
  && /_catAddNote\(fmt\(t\('catMaxToast'/.test(ADD) && /_catAddNote\(fmt\(t\('catNameLimit'/.test(ADD))
ok('⑥ 改名被挡那一句也浮回**那一枚芯片**上面（弹窗是系统那一枚，关掉才能给话，不能只留一句屏中央的闪）',
  /this\._catChipNote\(it\.key, fmt\(t\('catNameLimit'/.test(seg(JS, '_catRename(it) {')))
ok('⑥ 那句话自己会收：2.6 秒那一只表，且进出管理态那两趟都把定时器与那一格一起清零',
  /setTimeout\(\(\) => \{[\s\S]{0,80}catNote: '', catNoteKey: ''/.test(NOTE)
  && /clearTimeout\(this\._catNoteT\)/.test(seg(JS, '_catExit() {')))
ok('⑥ 「▸」那一枚标记跟着「新增」一起撤净（全站话术里现在一处都不许有）',
  !/▸/.test(Object.keys(ZH).map((k) => String(ZH[k])).join(''))
  && !/▸/.test(Object.keys(EN).map((k) => String(EN[k])).join('')))
ok('⑥ 换一屏账要对上：挂在某一枚芯片上、而那一枚没了或不再锁定 ⇒ 那句话跟着收；挂在输入框那一片（`_add`）的交给定时器',
  /if \(noteKey && noteKey !== '_add'\)/.test(seg(JS, '_catPaint(edit, cats) {'))
  && /note = held \? held\.lock : ''/.test(seg(JS, '_catPaint(edit, cats) {')))
ok('⑥ 私密那一格带着它那一句（渲染源里就有，不靠点下去现拼）',
  /lock: it\.isPrivate \? t\('catLockedPrivate', lang\)/.test(VIEW)
  && /私密|last/.test(ZH.catLockedPrivate + EN.catLockedPrivate))

// ---------- ⑦ 裁切只挂列表那一排 ----------
ok('⑦ 列表那一排的芯片有裁切三件套（里层那枚 `<text>`，不是芯片自己）',
  /<text class="ix-cat-t">\{\{item\.label\}\}<\/text>/.test(WXML)
  && /\.ix-cat-t\s*\{[^}]*max-width: 150rpx/.test(WXSS)
  && /\.ix-cat-t\s*\{[^}]*overflow: hidden/.test(WXSS)
  && /\.ix-cat-t\s*\{[^}]*text-overflow: ellipsis/.test(WXSS)
  && /\.ix-cat-t\s*\{[^}]*display: block/.test(WXSS))
ok('⑦ 反向钉：裁切不许挂到 `.ix-cat` 自己身上（× 那枚绝对挂在它里面，`overflow: hidden` 会连 × 一起裁掉）',
  !/overflow:\s*hidden|text-overflow/.test(rule(WXSS, 'ix-cat')))
ok('⑦ 详情页与详情窗那两处不裁（他原话「但，不影响详情页显示」）：同名的每一条规则都不许有 max-width／ellipsis',
  ['ds-cat', 'ixl-cat'].every((n) => rules(WXSS, n).every((b) => !/max-width|text-overflow/.test(b)))
  && rules(DETAIL_WXSS, 'hero-cat').length > 0
  && rules(DETAIL_WXSS, 'hero-cat').every((b) => !/max-width|text-overflow/.test(b)))

console.log(`验-分类上限与长度：${pass} 过 ${fails.length ? `　红 ${fails.length} 条` : '　全绿'}`)
fails.forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
