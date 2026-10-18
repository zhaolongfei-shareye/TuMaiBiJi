// 分类「面板内管理」＋名称自动翻译这一轮的静态尺子（站长 10-17 那一轮，共 11 条 C1–C11）。
// 跑法：node docs/工具/验-分类面板内管理.js
//
// 这一把只管**结构与次序**：节点挂没挂、判据读哪一栏、四步请求谁先谁后。
// 手势真不真、× 的热区落在哪一像素，是 `验-分类面板内管理-真跑.js` 那把的事（它要连 IDE）。
// 后端那几条（四类播种、私密不许删不许改名、两列译文、篇数由 GROUP BY 一次拿齐）也钉在这里，
// 因为这一轮的客户端话术**直接依赖**那几个字段；服务端少一列，屏上那句话就是假话。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const BP = (rel) => path.join(ROOT, 'backend', rel)
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
const ME = strip(rd(P('pages/me/me.wxml')))
const MEJS = strip(rd(P('pages/me/me.js')))
const WJS = rd(P('pages/write/write.js'))
const ZH = require(P('utils/i18n.js')).texts('zh')
const EN = require(P('utils/i18n.js')).texts('en')
const CAT_API = rd(BP('app/api/routes/categories.py'))
const CAT_NAMES = rd(BP('app/services/category_names.py'))
const AUTH = rd(BP('app/core/auth.py'))

// 取一段方法体：从"定义的整行开头"起，到下一个两空格缩进的 `}` 为止（这个文件里方法就是这么排的）。
// ⚠ 锚点不许只给方法名：那会锚到**第一个调用点**上（`await this._catDragStep()` 这种），
//   截出来的那一段里当然什么都没有——写这一把时它自己红过三条，红的都是尺子的锚点，不是产品。
const seg = (src, head) => {
  const i = src.indexOf(head)
  if (i < 0) return ''
  const j = src.indexOf('\n  }', i)
  return j < 0 ? src.slice(i) : src.slice(i, j + 4)
}

// ---------- C1 改到当前面板内完成，不跳转 ----------
ok('C1 井格按下去开管理态：节点吃 onCatManageTap，js 里那一句 navigateTo 与 goCategories 都撤净',
  /catchtap="onCatManageTap"/.test(WXML) && /catEdit: true/.test(JS)
  && !/goCategories/.test(WXML + JS)
  && !/navigateTo\(\{ url: '\/pages\/categories\/categories' \}\)/.test(JS),
  (WXML.match(/catchtap="[^"]*"/g) || []).join('、'))
ok('C1 全程不跳页：新加的那几个把手没有一个走 navigateTo',
  !/onCatManageTap[\s\S]{0,400}navigateTo/.test(JS) && !/_saveCatEdit[\s\S]{0,600}navigateTo/.test(JS))
ok('C1 老那一页没有被顺手删（他只说"入口关闭"）：app.json 那条注册与页面文件都还在',
  /pages\/categories\/categories/.test(rd(P('app.json'))) && fs.existsSync(P('pages/categories/categories.js')))

// ---------- C2 分类 icon 右侧一枚输入框，空格分隔一次多增 ----------
ok('C2 输入框长在分类 icon **右手边**（他的原话是"在分类ICON右侧"，不是排在芯片那一行末尾）',
  WXML.indexOf('catchtap="onCatManageTap"') < WXML.indexOf('wx:if="{{catEdit}}"')
  && /wx:if="\{\{catEdit\}\}" class="srch ixl-add"/.test(WXML))
ok('C2 皮复用搜索那一条 `.srch`（10-17 夜这一枚与搜索条一起换成淡底＋淡边＋深色字，`--chrome-*` 不留）',
  /class="srch ixl-add"/.test(WXML) && !/searchSkin/.test(WXML)
  && /background: var\(--chip-idle\)/.test(WXSS.match(/\.srch\s*\{[^}]*\}/)[0])
  && !/var\(--chrome-/.test(WXSS.match(/\.srch\s*\{[^}]*\}/)[0]))
ok('C2 框里的点击不许冒泡成"点了空白"（否则一敲字就保存退出）：外层那一片 catchtap="noop"',
  /class="srch ixl-add"[^>]*catchtap="noop"/.test(WXML))
ok('C2 占位那一句双语都有，且双语都点得清"空格分开"这件事',
  /空格/.test(ZH.catAddPh) && /separated/.test(EN.catAddPh))
ok('C2 按空格切段、一段建一格；同一次里重复的词只留第一次',
  /split\(\/\\s\+\/\)/.test(seg(JS, 'onCatAddCommit() {'))
  && /if \(draft\.some\(\(x\) => String\(x\.name\)\.toLowerCase\(\) === low\)\) return/.test(JS))
ok('C2 逐条走同一个创建接口，不新起批量口（后端一次只收一个名字）',
  (seg(JS, 'async _saveCatEdit() {').match(/api\.createCategory/g) || []).length === 1
  && !/createCategories|\/bulk/.test(rd(P('utils/api.js'))))

// ---------- C3 每枚右上角一枚 ×，点了删 ----------
ok('C3 × 只在管理态画、且只在**不是私密**那一枚上画',
  /wx:if="\{\{item\.x\}\}" class="ix-cat-x" catchtap="onCatDeleteTap"/.test(WXML)
  // ⚠ 锚点跟着 2.3.13 那一刀改：`_catView(edit)` → `_catView(edit, cats)`（冷启第一屏只剩「全部」那条 bug
  //   的修法就是让它吃外递的表）。判据本体一个字没动——钉的还是"× 只画在不私密那一枚上"。
  //   2.3.16 中间一度多收过第三参数（full），同一夜那枚「新增」被他打回、参数跟着没，锚点又回到这一版。
  && /x: !it\.isPrivate/.test(seg(JS, '_catView(edit, cats) {')))
ok('C3 那一枚热区是 44×44（比字大，点在字右上角那一片就删得掉），整块落在缝里不被切',
  /\.ix-cat-x\s*\{[^}]*position: absolute/.test(WXSS)
  && /\.ix-cat-x\s*\{[^}]*width: 44rpx/.test(WXSS)
  && /\.ix-cat-x\s*\{[^}]*height: 44rpx/.test(WXSS)
  && /\.ix-cat-x\s*\{[^}]*top: 0/.test(WXSS)
  && /\.ix-edit \.cat-chips\s*\{[^}]*gap: 56rpx/.test(WXSS))
ok('C3 平时那一态的缝仍是站长定的 40rpx（这一轮只放宽管理态那一态）',
  /\.cat-chips\s*\{\s*display: inline-flex;\s*gap: 40rpx/.test(WXSS)
  && /\.ix-edit \.cat-chips/.test(WXSS))

// ---------- C3-b 删除要二次确认（他补的那一句） ----------
const DEL = seg(JS, 'onCatDeleteTap(e) {')
ok('C3-b 点 × 先问一句：wx.showModal 在删之前，草稿那一刀在 res.confirm 之后（不许删完才弹一句）',
  /wx\.showModal/.test(DEL)
  && DEL.indexOf('wx.showModal') < DEL.indexOf('this._catDraft.splice')
  && /if \(!res\.confirm\) return/.test(DEL))
ok('C3-b 问话要报"这一格里 N 篇"，那个数读服务端 GET 带回的 note_count',
  /\{n\}/.test(ZH.catDelBody) && /\{n\}/.test(EN.catDelBody)
  && /typeof it\.note_count === 'number'/.test(DEL))
ok('C3-b 读不到那个数时退回**不报数**的那句现网话术，不许拿本机已加载的条数凑一个 N',
  /t\('deleteCategoryConfirm', lang\)/.test(DEL)
  && !/this\.data\.notes[\s\S]{0,60}filter[\s\S]{0,40}category_id/.test(DEL))
ok('C3-b 篇数由服务端一趟 GROUP BY 给齐（不许逐格 count，那是分类越多越慢）',
  /group_by\(Note\.category_id\)/.test(CAT_API)
  && CAT_API.indexOf('group_by(Note.category_id)') < CAT_API.indexOf('def create_category'))
ok('C3-b POST／PUT 的响应里那一个是空而不是 0（没算过的数落 0 就是句假话）',
  /note_count: int \| None = None/.test(CAT_API))

// ---------- C4 按压拖动排序 ----------
const DRAG = seg(JS, 'onCatDragStart(e) {') + seg(JS, 'async onCatDragMove(e) {')
  + seg(JS, 'async _catDragStep() {')
ok('C4 长按起拖、越过相邻那枚的中线才换位置，一次移动最多换三格',
  /bindlongpress="onCatDragStart"/.test(WXML) && /bindtouchmove="onCatDragMove"/.test(WXML)
  && /bindtouchend="onCatDragEnd"/.test(WXML)
  && /for \(let guard = 0; guard < 3; guard\+\+\)/.test(DRAG)
  && /d\.x > mid\(right\)/.test(DRAG) && /d\.x < mid\(left\)/.test(DRAG))
ok('C4 每换一次都重新量（数组一调序，旧 rect 全是过期的）；且换完等一帧再量',
  (seg(JS, 'async _catDragStep() {').match(/_catRects\(\)/g) || []).length === 1
  && /await this\._catNextFrame\(\)/.test(seg(JS, 'async _catDragStep() {'))
  && /setTimeout\(resolve, 30\)/.test(seg(JS, '_catNextFrame() {')))
const END = seg(JS, 'onCatDragEnd() {')
ok('C4 松手只改本机顺序，不发请求（保存那一条线上才有 reorder）',
  END.length > 60 && !/api\./.test(END))

// ---------- C5 点页面空白区自动保存 ----------
ok('C5 点空白＝存：onBlankTap 先判管理态再管搜索那一条；点到某一行的笔记也只存、不开窗',
  /if \(this\.data\.catEdit\) \{\s*await this\._saveCatEdit\(\)/.test(seg(JS, 'async onBlankTap() {'))
  && /if \(this\.data\.catEdit\) \{ await this\._saveCatEdit\(\); return \}/.test(seg(JS, 'async onRowTap(e) {')))
ok('C5 再按一次井格是同一个出口（不另设"完成"按钮＝第二个入口）',
  /if \(this\.data\.catEdit\) \{ this\._saveCatEdit\(\); return \}/.test(seg(JS, 'onCatManageTap() {')))
const SAVE = seg(JS, 'async _saveCatEdit() {')
ok('C5 提交次序＝删 → 改名 → 建 → 排序（前三步全成才配发那一次 reorder）',
  SAVE.indexOf('api.deleteCategory') >= 0
  && SAVE.indexOf('api.updateCategory') > SAVE.indexOf('api.deleteCategory')
  && SAVE.indexOf('api.createCategory') > SAVE.indexOf('api.updateCategory')
  && SAVE.indexOf('api.reorderCategories') > SAVE.indexOf('api.createCategory')
  && /if \(!bad\.length && this\._catOrderDirty\(\)\)/.test(SAVE))
ok('C5 没成的那几条要点名（读的是他自己打的那一栏），且只报名字：服务端那句 detail 是数组时不能变成 [object]',
  /catSaveFailed/.test(SAVE) && /bad\.map\(\(x\) => x\.name\)/.test(SAVE)
  && !/err\.data\.detail/.test(SAVE) && !/e\.data\.detail/.test(SAVE))
ok('C5 有失败就留在管理态里（先读回服务端那一份真的，再把没成的贴回草稿），不许"看起来保存了"',
  /await this\.loadCategories\(\)/.test(SAVE) && /_catResync\(bad\)/.test(SAVE)
  && /_catExit\(\)/.test(SAVE))
ok('C5 没动过就不发那一趟（点空白退出是"办完事"，不是"必须打一次接口"）',
  /const dirty = dels\.length \|\| renames\.length \|\| news\.length \|\| this\._catOrderDirty\(\)/.test(SAVE)
  && /if \(!dirty\) \{/.test(SAVE))
ok('C5 不做"每敲一个字就发一次"：onCatAddInput 与 onCatAddCommit 两段里一个 api. 都没有',
  // ⚠ 负向判据必须先证明那一段**截到了东西**：锚点写错时 seg 回空串，`!/api\./` 对空串永远为真＝假绿。
  seg(JS, 'onCatAddInput(e) {').length > 40 && seg(JS, 'onCatAddCommit() {').length > 200
  && !/api\./.test(seg(JS, 'onCatAddInput(e) {')) && !/api\./.test(seg(JS, 'onCatAddCommit() {')))
ok('C5 他正筛着那一格被删掉时把筛选收回"全部"（否则屏上是一片空＋一个还在筛的状态，看着像坏了）',
  /selectedCategory: null/.test(SAVE))

// ---------- C6 私密那一格不许删、不许改名、不许拖动（10-18 起） ----------
ok('C6 服务端：那一格无条件 400（原来是"格里还有笔记才挡"，空格删得掉＝先撤密码再删格子那条路）',
  /if db_cat\.name == PRIVATE_CATEGORY_NAME:\s*\n\s*raise HTTPException/.test(CAT_API)
  && CAT_API.indexOf('if db_cat.name == PRIVATE_CATEGORY_NAME') < CAT_API.indexOf('# Set related notes'))
ok('C6 服务端：改名那一趟同样无条件挡，但只挡"改掉那一格的名字"（原样交回来与只改颜色都放行）',
  /update_data\["name"\] != PRIVATE_CATEGORY_NAME/.test(CAT_API))
ok('C6 客户端那一格不画 ×，点名字也不给改名的口（10-18 改口：连拖动也撤了，点下去给一句浮在它上面的话）',
  /if \(it\.isPrivate\) return/.test(DEL)
  && /if \(it\.isPrivate\) \{ this\._catChipNote\(it\.key\); return \}/.test(seg(JS, 'onCatChipTap(e) {')))

// ---------- C7 新用户默认四类 ----------
ok('C7 四类就是灵感／生活／工作／学习，英文那一档是他挑的乙（Ideas／Life／Work／Study）',
  /\("灵感", "Ideas"\),\s*\n\s*\("生活", "Life"\),\s*\n\s*\("工作", "Work"\),\s*\n\s*\("学习", "Study"\)/
  .test(CAT_NAMES))
ok('C7 播种挂在"新用户"那一支上，排在预置笔记之前，且种失败不许把登录带崩（他登不进去比少四格严重）',
  /category_names\.seed_default_categories\(db, str\(user\.id\)\)/.test(AUTH)
  && AUTH.indexOf('seed_default_categories(db') < AUTH.indexOf('preset_note.seed_note_for_new_user(')
  && /except Exception:\s*\n\s*db\.rollback\(\)/.test(AUTH))

// ---------- C11 名称自动翻译 ----------
ok('C11 两列显示值与一条迁移：模型有两列、迁移文件在（不是空壳，头与降级都真跑过）',
  /name_zh = Column/.test(rd(BP('app/models/category.py')))
  && /name_en = Column/.test(rd(BP('app/models/category.py')))
  && fs.existsSync(BP('alembic/versions/b4e8a1c7d205_category_name_i18n.py')))
ok('C11 显示规则只有一份，四处吃它（列表、录入、详情、海报两处）',
  ['pages/index/index.js', 'pages/write/write.js', 'pages/detail/detail.js', 'pages/share/share.js']
  .every((f) => /utils\/catText\.js/.test(rd(P(f)))) && fs.existsSync(P('utils/catText.js')))
ok('C11 "译不了就维持原文"＝那一档留空时回落 name，屏上不出现空标签',
  /return one \|\| cat\.name \|\| ''/.test(rd(P('utils/catText.js'))))
ok('C11 身份那一栏没被译文换掉：私密那道闸与"选到私密要先设密码"那道闸读的都还是 name',
  !/isPrivate\(labelOf/.test(JS + WJS)
  && /allowPrivate\(name, this\.data\.lang\)/.test(WJS)
  && /\|\| \{\}\)\.name : ''/.test(WJS))
ok('C11 那两列只在**写**的那两趟填，读路径不挂模型（读一次慢一次、模型挂了读接口跟着挂）',
  CAT_API.indexOf('pair_from_glossary') >= 0
  // 读那一段（`def list_categories` 到 `def create_category` 之间）里不许出现补译那一趟。
  // ⚠ 端点标记要用**函数名**，不能用 `@router.post("/")`：现网那行写的是 `@router.post("/", response_model=…)`，
  //   带参数的整串查不到 → indexOf 回 −1 → slice 直接把整个文件当成"读那一段"，判据假绿。
  && CAT_API.indexOf('def list_categories') >= 0
  && CAT_API.indexOf('def create_category') > CAT_API.indexOf('def list_categories')
  && !/fill_missing/.test(CAT_API.slice(CAT_API.indexOf('def list_categories'), CAT_API.indexOf('def create_category')))
  && /_schedule_name_fill\(background/.test(CAT_API))

// ---------- C10 原「设置」里那一格关闭 ----------
ok('C10 「我的」那一行与路由表那一位都撤净（留着就是同一件事两个入口）',
  !/data-page="categories"/.test(ME) && !/categories:\s*'\/pages\/categories\/categories'/.test(MEJS))

console.log(`验-分类面板内管理：${pass} 过 ${fails.length ? `　红 ${fails.length} 条` : '　全绿'}`)
fails.forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
