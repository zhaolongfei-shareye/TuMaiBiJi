// §8.232 新用户那一篇预置笔记的静态自证：不连模拟器也能跑的那部分。
// 跑法：node docs/工具/验-默认预置笔记.js
//
// 这把守的四件事，每件都对应一条"错了不会报错"的失效方式：
// ① 种子＝生成器重跑一遍的产物（关于页改了一句话而种子没跟着重出＝屏上出现第二份产品介绍）；
// ② `preset` 这个 source_type 在三张来源标签表里都有对应中文（漏一处的表现是把英文枚举值写上屏，
//    站长 10-02 在列表页撞过同一个形状）；
// ③ 种子的落点与先后（挂在建号那一个分支、且排在邀请归因之后）——
//    顺序反了或改成"名下没笔记就种"，表现是**所有邀请奖励从此结不出来**，接口一声不响；
// ④ 这一类多出来的三条闸只许开在那三张口上：编辑、分享、出卡片；删除那一路一格都不许有。
//    ⚠ 10-14 起「删除」曾从"不许开分支"里出去（站长「默认的不能删除」），10-18 又整条翻案：
//    他那句「允许删除」把那两道闸撤净，同时新加三道（不能编辑／不能分享／不生成卡片）。
//    所以这一条从"扫字面量"改成"数闸的口"——见下面 GATES 那段。
// ⑤ 后台一发布就刷存量，且刷新绑在写入那两只手上、不绑路由。
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = process.env.MP_ROOT || path.resolve(__dirname, '../..')
const MP = path.join(ROOT, 'miniprogram')
const read = (p) => fs.readFileSync(path.join(MP, p), 'utf8')
const be = (p) => fs.readFileSync(path.join(ROOT, 'backend', p), 'utf8')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

// ---------- ① 种子必须是生成器的产物 ----------
const SEED = path.join(ROOT, 'backend/seed/preset_note.json')
const GEN = path.join(ROOT, 'docs/工具/出-预置笔记种子.js')
const before = fs.readFileSync(SEED, 'utf8')
ck('生成器在（种子的那几句话只有一个出处：现网关于页）', fs.existsSync(GEN))
let drift = ''
try {
  execFileSync(process.execPath, [GEN], { encoding: 'utf8', env: Object.assign({}, process.env, { MP_ROOT: ROOT }) })
  drift = fs.readFileSync(SEED, 'utf8') === before ? '' : '种子与生成器的产物不一致'
} catch (e) {
  drift = `生成器跑不起来：${e.message}`
}
if (drift) fs.writeFileSync(SEED, before)   // 红了就把这一把自己写的东西撤回，不许把树留在半改状态
ck('种子＝`出-预置笔记种子.js` 重跑一遍的产物（改关于页必须重出种子）', !drift, drift)

const seed = JSON.parse(before)
ck('四字段齐全且不靠模型（口径 3：提炼那趟一次都不许被调用）',
  ['title', 'summary', 'tags', 'key_points'].every((k) => seed[k] && (!Array.isArray(seed[k]) || seed[k].length)))
ck('那枚真标签在（口径 4：方块／详情窗里那一格不许是空的）',
  Array.isArray(seed.tags) && seed.tags.length > 0, JSON.stringify(seed.tags))
ck('摘要逐字等于关于页那句介绍语（不是另写一份）',
  read('utils/appInfo.js').includes(seed.summary), `摘要 ${seed.summary.length} 字`)
ck('要点那五条逐字是「功能」那一档的卡标题',
  seed.key_points.every((k) => read('pages/about/about.js').includes(`title: '${k}'`)),
  seed.key_points.join('/'))

// ---------- ② source_type='preset' 在三张来源表里都有中文 ----------
const maps = [
  ['pages/index/index.js', read('pages/index/index.js')],
  ['pages/detail/detail.js', read('pages/detail/detail.js')],
  ['utils/poster.js', read('utils/poster.js')],
]
// 三张表两种形状：两页里是模块级 `SOURCE_TYPE_KEYS`，poster.js 里是 `sourceLabelOf` 函数内一张 `keys`。
// 取表必须**从函数名往后找**：`const keys = {` 这五个字在 poster.js 里不止一处，
// 拿全文第一个匹配当表，读回来的是别人的表 ⇒ 一条"没这一支"的假红（10-14 自己踩过）。
const tableSrc = (f, src) => {
  if (f === 'utils/poster.js') {
    const at = src.indexOf('function sourceLabelOf')
    const m = /const keys = \{([\s\S]*?)\}/.exec(src.slice(at))
    return m ? m[1] : ''
  }
  const m = /SOURCE_TYPE_KEYS = \{([\s\S]*?)\}/.exec(src)
  return m ? m[1] : ''
}
maps.forEach(([f, src]) => ck(`${f} 的来源表里有 preset 这一支`, /preset:\s*'sourcePreset'/.test(tableSrc(f, src))))
const { texts } = require(path.join(MP, 'utils/i18n.js'))
const zh = texts('zh'), en = texts('en')
ck('i18n 两本字典都有 sourcePreset（缺一本＝英文态把键名写上屏）', !!zh.sourcePreset && !!en.sourcePreset,
  `${zh.sourcePreset} / ${en.sourcePreset}`)
ck('中英文键数相等', Object.keys(zh).length === Object.keys(en).length,
  `${Object.keys(zh).length} / ${Object.keys(en).length}`)
// 服务端能写进 source_type 的值，客户端一张表都得认得（判据从库里那侧的枚举现读，不抄字面）。
const ENUM = ['wechat_article', 'web_article', 'screenshot', 'manual', 'share_import', 'preset']
maps.forEach(([f, src]) => {
  const miss = ENUM.filter((k) => !new RegExp(`\\b${k}:`).test(tableSrc(f, src)))
  ck(`${f} 认得服务端全部 ${ENUM.length} 种来源`, miss.length === 0, miss.join('/'))
})

// ---------- ③ 种子的落点与先后（这两条一错就是钱） ----------
const AUTH = be('app/core/auth.py')
const atSeed = AUTH.indexOf('seed_note_for_new_user')
const atAttrib = AUTH.indexOf('attribute_inviter')
const atCreate = AUTH.indexOf('generation.allocate')
ck('确实挂在建号那一个分支里（不是每次登录都跑一遍）', atCreate < atAttrib && atAttrib < atSeed && atSeed > 0,
  `建号 ${atCreate} → 归因 ${atAttrib} → 播种 ${atSeed}`)
ck('播种排在邀请归因**之后**（反了＝所有新用户永久无法被归因，那 +10 结不出来）', atAttrib < atSeed)
ck('建号那一支自己带 try（种子读不到不许把登录回成 500）',
  /except Exception:[\s\S]{0,200}预置笔记没种下去/.test(AUTH))
const QUOTA = be('app/services/quota.py')
/* 10-16 审计把这一条的**判法**换了：原来钉的是"读 `authored_count(...) == 1`"，
   而拿条数当"这是不是第一篇"的顺序证据有两处结不出来（两篇真并发、名下第一条是转存）。
   现在钉的是同一条意思的新写法：预置那一篇必须被排出去，且判的是"本次这一篇是不是 id 最小的那篇"。
   ⚠ 旧的那句 literal 判据不改就会永久红——它钉的是实现，不是"预置篇不许占第一名"这件事本身。
   两半都留着：读 `used_count`（预置篇算在内）仍然要红。 */
ck('动笔首篇那条不许读 used_count，也不读条数——改成"本次这一篇是不是动笔那几篇里最早的"',
  !/_is_his_first_note[\s\S]{0,900}?used_count\(db, user\)/.test(QUOTA)
  && !/_is_his_first_note[\s\S]{0,900}?authored_count\(db, user\.id\) == 1/.test(QUOTA)
  && /_is_his_first_note[\s\S]{0,900}?func\.min\(Note\.id\)/.test(QUOTA)
  && /_is_his_first_note[\s\S]{0,900}?PRESET_SOURCE_TYPE/.test(QUOTA)
  && /_is_his_first_note[\s\S]{0,900}?SOURCE_SHARE_IMPORT/.test(QUOTA))
ck('归因那条不认的判据也改读 authored_count（同一条钱，第二处闸门）',
  /attribute_inviter[\s\S]{0,900}?authored_count\(db, user\.id\) > 0/.test(QUOTA))
ck('页头那一列仍读 used_count（口径 6：新用户看到 1，不许被降成 0）',
  /def used_count/.test(QUOTA) && /"used": used/.test(QUOTA))

// ---------- ④ 这一类只多三格闸：编辑、分享、出卡片；删除那一路一格都不许有 ----------
// 站长 10-18 那句「官方预置，变成"帮助文档"，然后这类笔记，不能编辑（按钮置灰），不能分享，允许删除」
// 把 10-14 那条"不许为它开特殊分支"整条推翻——现在**就是要**为它开分支，只是只许开在那三张口上。
// 判法跟着换：从"扫 `preset` 这个字面量出现在哪"改成"数每一张口上恰好有几格 `is_help_doc`"。
// 前者在 10-18 这一改之后必然假红：播种、结钱计数、后台「数据」那三枚聚合、后台那一格注释里
// 都还留着这个字面量，它们都不是"给这一篇开行为分支"。（第一版就是这么红了 4 条的。）
const NOTES_PY = be('app/api/routes/notes.py')
const CARDS_PY = be('app/api/routes/cards.py')
const SHARES_PY = be('app/api/routes/shares.py')
const PN_PY = be('app/services/preset_note.py')
// 取一个 `def` 的函数体：从定义行往后，到下一个顶层 `@`／`def`／`class` 为止。
// 锚点必须带那个换行、不能只靠 `^`：`rest.slice(1)` 的第 0 个字符也算"行首"，
// 于是 `^def ` 会立刻匹配到被切开的那个函数自己那一行，量回来的是**空体**（10-18 第一版就红在这儿）。
const pyBody = (src, name) => {
  const m = new RegExp(`\\n(?:async )?def ${name}\\(`).exec(src)
  if (!m) return ''
  const rest = src.slice(m.index)
  const next = rest.slice(1).search(/\n(@|def |async def |class )/)
  return next < 0 ? rest : rest.slice(1, next + 1)
}
const GATES = [
  ['编辑那一口 PUT', pyBody(NOTES_PY, 'update_note'), 'PRESET_EDIT_MSG'],
  ['分享那一口 POST', pyBody(SHARES_PY, 'create_share'), 'PRESET_SHARE_MSG'],
  ['出卡片那一口 POST', pyBody(CARDS_PY, 'put_note_card'), 'PRESET_CARD_MSG'],
]
GATES.forEach(([label, body, msg]) => ck(`${label} 恰好一格闸、挂在 400、念那一句`,
  (body.match(/\bis_help_doc\(/g) || []).length === 1
  && new RegExp(`raise HTTPException\\(status_code=400, detail=${msg}\\)`).test(body),
  `${(body.match(/\bis_help_doc\(/g) || []).length} 格`))
ck('删除那一路一格闸都没有（他那句「允许删除」；闸留着＝把他拍的规矩实现反了）',
  !/is_help_doc|PRESET/.test(pyBody(NOTES_PY, 'delete_note')))
ck('撤卡片那一路也没有闸（这一类本来就登记不出卡片，撤的动作不必特殊拦）',
  !/is_help_doc|PRESET/.test(pyBody(CARDS_PY, 'drop_note_card')))
ck('闸挂在 400 上，不挂 403／500（403 会被客户端念成"票坏了"去重登，500 会把它记进错误日志）',
  !/status_code=(403|500), detail=PRESET/.test(NOTES_PY + CARDS_PY + SHARES_PY))
// 注销那条路径不许被这道闸带累：人走了数据必须跟着走，那一趟按 user_id 整批清、不走 delete_note 这个口。
ck('注销那一条不读这道闸（`deletion`／`v1_account` 里出现 PRESET 判据＝人走了他那一篇还留着）',
  !/PRESET/.test(be('app/api/routes/v1_account.py') + be('app/services/deletion.py')))
// 站长这句只说了"不能编辑"，没说要连归类一起挡；而线上那个包里有一条**只发 category_id** 的 PUT
// （`write.js` 只发真动过的那几栏），连归类一起挡＝打坏老包。这一条是我自己定的，单独钉着。
const CF = (/CONTENT_FIELDS = \(([^)]*)\)/.exec(PN_PY) || [, ''])[1]
ck('编辑闸只挡内容那几栏（闸的写法带 `and touches_content(...)`，不是无条件拦 PUT）',
  /if is_help_doc\(db_note\) and touches_content\(update_data\):/.test(NOTES_PY))
ck('内容那六栏的清单齐全、且不含 category_id（归类与置顶照旧放行）',
  ['title', 'summary', 'tags', 'key_points', 'content', 'original_content'].every((f) => CF.includes(`"${f}"`))
  && !/category_id|is_pinned/.test(CF), CF.trim().slice(0, 80))
ck('三句原因只活一份（定义在 preset_note.py；三个 route 里出现中文字面量就是第二份真相）',
  ['PRESET_EDIT_MSG', 'PRESET_SHARE_MSG', 'PRESET_CARD_MSG']
    .every((n) => (PN_PY.match(new RegExp(`${n} = "`)) || []).length === 1)
    && !/detail="[^"]*帮助文档/.test(NOTES_PY + CARDS_PY + SHARES_PY))
ck('10-14 那两句「删不掉」的话术已从前后端退净（留着＝有人以为那两道闸还在）',
  !/KEEP_MSG/.test(PN_PY + NOTES_PY + CARDS_PY + SHARES_PY
    + read('pages/detail/detail.js') + read('pages/index/index.js') + read('utils/cardCloud.js')))

// ---------- ④b 「后台更新后要新旧用户全量刷新」那一条绑在哪儿 ----------
// 他选的是「无脑全覆盖」＋「不补：删了就没了」⇒ 刷新只许遍历库里还留着的那几行，
// 且**不许顺手建行**（建成"删不掉的官方内容"就是违背他刚说的那句）。
const RESYNC = pyBody(PN_PY, 'resync_all')
ck('刷新绑在写入那两只手上（`save_seed`／`clear_seed` 各调一次），不绑在某个路由上',
  /return resync_all\(db\)/.test(pyBody(PN_PY, 'save_seed'))
  && /return resync_all\(db\)/.test(pyBody(PN_PY, 'clear_seed')))
ck('刷新的遍历是"库里还有的行"，不是"所有账号"（后者＝替删掉的人补一篇）',
  /db\.query\(Note\)\.filter\(Note\.source_type == PRESET_SOURCE_TYPE\)\.all\(\)/.test(RESYNC)
  // 负向判据只认**调用形状**（`name(`／`db.add(`），不认光秃秃的名字：
  // 这一格的 docstring 里就写着"新号那一路归 seed_note_for_new_user 管"，那是解释不是行为，
  // 拿名字去扫注释会把一条写对了的实现读成红的（10-18 第一版红的就是这个）。
  && !/seed_note_for_new_user\(/.test(RESYNC) && !/db\.add\(/.test(RESYNC))
ck('五栏全覆盖、`original_content` 跟着正文走（不覆盖某栏＝库里留一份旧的那一栏）',
  ['title', 'summary', 'tags', 'key_points', 'content', 'original_content']
    .every((f) => new RegExp(`note\\.${f} = row\\[`).test(RESYNC)))
ck('发布时顺手关掉这一类名下还开着的分享码（不关＝公开落地页继续供正文，而界面上那枚钮已经灰了）',
  /close_shares\(db, note\.id\)/.test(RESYNC) && /from app\.services\.sharing import close_shares/.test(PN_PY))
ck('回体带这一趟刷了几篇、关了几张码（后台那一屏要念得出，不然"发布了"三个字没有读数）',
  /return \{"refreshed": len\(notes\), "closed_shares": closed\}/.test(RESYNC))
const DETAIL_JS = read('pages/detail/detail.js')
const IX_JS = read('pages/index/index.js')
const CC_JS = read('utils/cardCloud.js')
ck('删除被拦下时（服务端还有别的理由会拦），详情页与首页两处都把那句原样念出来（只回"删除失败"＝按钮看起来坏了）',
  (DETAIL_JS.match(/\(err\.data && err\.data\.detail\) \|\| t\('deleteFailed', lang\)/g) || []).length === 1
    && (IX_JS.match(/\(err\.data && err\.data\.detail\) \|\| t\('deleteFailed', lang\)/g) || []).length === 1)
ck('撤那一张被拦下时走同一张嘴：`dropServer` 把 detail 交回调用方，没原因的那种才念"没连上后端"',
  // 10-20（N7）那句"是不是我们自己写的中文"不再在这里各写一份，收口进 api.friendlyDetail 一枚：
  // 洗完整串为空 ⇒ 走下面那句"没连上后端"的实话。判的还是同一件事：有原因就照实念、没原因不猜。
  /const detail = api\.friendlyDetail\(e && e\.data && e\.data\.detail\)\s*\n\s*if \(detail\) return detail/.test(CC_JS)
    && /typeof dropped === 'string' \? dropped : t\('cardDropOffline', lang\)/.test(IX_JS))

// ---------- ④c 客户端那一半：置灰两枚、放开一枚、话一句 ----------
// 「按钮置灰」只是服务端那三道闸的**表现**；这一段的判据是"表现和闸说的是同一件事"——
// 灰了但服务端放行（老包不吃灰）或没灰但服务端拒（点了报 400），两边都是他撞一次才知道的 bug。
const VIEWS = [
  ['详情页', read('pages/detail/detail.wxml'), 'note', 'onEdit', 'onCardCell', 'onDelete'],
  ['首页详情窗', read('pages/index/index.wxml'), 'detailNote', 'onSheetEdit', 'onSheetShare', 'onSheetDelete'],
]
const VIEWS_JS = [
  ['详情页', DETAIL_JS, ['onEdit', 'onCardCell'], ['onDelete']],
  ['首页详情窗', IX_JS, ['onSheetEdit', 'onSheetShare'], ['onSheetDelete']],
]
const RE = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// 取一个页面方法的方法体：从 `  name(` 往后到下一个 `  },`（两空格缩进的那一层收尾）。
const jsBody = (src, name) => {
  const m = new RegExp(`\\n  (?:async )?${RE(name)}\\(`).exec(src)
  if (!m) return ''
  const rest = src.slice(m.index + 1)
  const end = rest.slice(1).search(/\n  \},?\n/)
  return end < 0 ? rest : rest.slice(0, end + 1)
}
VIEWS.forEach(([label, src, obj, edit, share, del]) => {
  ck(`${label}：编辑那一枚按 ${obj}.is_preset 置灰`,
    new RegExp(`\\{\\{${RE(obj)}\\.is_preset \\? 'disabled' : ''\\}\\}" [^>]*bindtap="${RE(edit)}|\\{\\{${RE(obj)}\\.is_preset \\? 'disabled' : ''\\}\\}" [^>]*catchtap="${RE(edit)}"`).test(src))
  ck(`${label}：分享那一枚与私密那一格并列置灰`,
    new RegExp(`\\{\\{\\(${RE(obj)}\\.is_private \\|\\| ${RE(obj)}\\.is_preset\\) \\? 'disabled' : ''\\}\\}`).test(src))
  ck(`${label}：删除那一枚没被置灰（他那句「允许删除」；客户端加灰＝服务端撤了闸屏上还锁着）`,
    src.split('\n').filter((l) => l.includes(`"${del}"`)).every((l) => !/is_preset/.test(l)))
  ck(`${label}：这一类那一句提示只排在私密那一支之后（同一篇不会念出两句相反的话）`,
    new RegExp(`wx:elif="\\{\\{${RE(obj)}\\.is_preset\\}\\}"[^>]*>\\{\\{t\\.presetHint\\}\\}`).test(src))
})
VIEWS_JS.forEach(([label, src, gated, free]) => {
  gated.forEach((name) => ck(`${label}：${name} 的 guard 里读 is_preset 并早退（灰了还要挡，点击态靠这半）`,
    /\bis_preset\b/.test(jsBody(src, name)) && /\breturn\b/.test(jsBody(src, name)), jsBody(src, name) ? '' : '没抓到方法体'))
  free.forEach((name) => ck(`${label}：${name} 的 guard 里不许有 is_preset`, !/\bis_preset\b/.test(jsBody(src, name))))
})
ck('两本字典都有 presetHint，且那句同时说到"不能编辑／不能分享／可以删除"三件事（少一件就是半句假话）',
  [zh, en].every((d) => d.presetHint && /不能编辑|read-only/.test(d.presetHint)
    && /不能分享|no sharing/.test(d.presetHint) && /可以删除|You can delete/.test(d.presetHint)),
  `${zh.presetHint} / ${en.presetHint}`)
ck('叫法两本字典都改成「帮助文档」这一族（旧的"官方预置/产品说明"那一句不许还留在来源标签上）',
  [zh, en].every((d) => /帮助文档|Help doc/.test(d.sourcePreset)), `${zh.sourcePreset} / ${en.sourcePreset}`)

// ---------- ⑤ 首启那张卡片的触发是一次性的、静默的、排在列表之后 ----------
const APP = read('app.js'), IX = read('pages/index/index.js')
ck('登录回来的那一格只存 id，不写本机存储（写了＝重装之后又认自己是新人）',
  /this\.globalData\.seededNoteId = res\.seeded_note_id \|\| 0/.test(APP) && !/setStorageSync\([^)]*seeded/i.test(APP))
ck('取走即清（consume 里必须把那一格归零）',
  /consumeSeededNote\(\)[\s\S]{0,260}?this\.globalData\.seededNoteId = 0/.test(APP))
ck('发令排在列表那次 setData 之后、且不 await（判据 3：首帧不许为它多等）',
  /if \(reset\) \{\s*const seededId = getApp\(\)\.consumeSeededNote\(\)[\s\S]{0,200}?_autoFirstCard\(seededId\)\.catch/.test(IX))
ck('首启那一条失败不出声（口径 5：只 console.warn，不弹吐司）',
  /_autoFirstCard\(seededId\)\.catch\(\(err\) => console\.warn/.test(IX))
const auto = (/async _autoFirstCard\(noteId\) \{[\s\S]*?\n  \},/.exec(IX) || [''])[0]
ck('出图那一段不开弹窗（templateOpen 一个字都不许碰）',
  !!auto && !/templateOpen:\s*true/.test(auto) && /detailOpen/.test(auto), auto ? `${auto.split('\n').length} 行` : '没抓到方法体')
ck('它走的就是用户那条出图链的三个口（不另画一份）',
  /_ensurePosterAssets\(noteId\)/.test(auto) && /_renderPoster\(\)/.test(auto) && /_keepPoster\(\)/.test(auto))
/* ⚠ 这一趟是**共用画布的第二个调用者**：`_posterAssets`、`#posterCanvas`、`posterImagePath` 三样
   成品弹窗也在写。站长 10-03 真机报过"无论点哪张小图，大图都是同一张"，根就是这块共享画布被两趟踩；
   那一次修的是弹窗内部，这一次多了一个不开窗的调用者，所以钉"每 await 一步都回头看一眼归属"。
   数段数不数行数：把两个 await 当分隔符切开，每一段开头都必须有那次复查。 */
const autoSegs = auto.split(/await this\.(?:_ensurePosterAssets\(noteId\)|_renderPoster\(\))/).slice(1)
ck('两个 await 之后各跟一次让位复查（这一趟不再是画布的唯一调用者）',
  autoSegs.length === 2 && autoSegs.every((s) => /_posterAssets\.noteId !== noteId/.test(s.split('await')[0])),
  `${autoSegs.length} 段`)
ck('起手也挡弹窗正忙那一格（posterBusy 是那条链自己的旗）',
  /this\.data\.posterBusy/.test(auto.split('const note =')[0] || ''))
ck('私密那一格与台账已有那一格都先挡（同一条既有口径，不是为它新起的）',
  /if \(!note \|\| note\.is_private \|\| this\._cardsOf\(noteId\)\.length\) return/.test(auto))
// 原来这一条钉的是"右上那一格没卡片时写一句『还没有生成过卡片』"——那句是口径 5 的另一半：
// 首启播种可能静默失败，所以屏上不许把"一定有一张"写成承诺。
// 10-17 深夜站长一句「如果没卡片图，这个位置就完全被标题占满」⇒ 那一整块空态撤净，
// 那两枚键（`noCards`／`shareAsImage`）跟着从字典退（`验-卡片那一格两页同源` 钉它们不许回来）。
// 撤的是那块落点，不是那句实话：现在没卡片时那一格什么都不画，更没有一句承诺；
// "失败不出声、也不写成功"这半仍然由上面那条 console.warn 钉着。
ck('播种失败那条链依旧不写成功（那一趟里一个 toast 都不许有）',
  !/wx\.showToast/.test(auto), `${(auto.match(/wx\.showToast/g) || []).length} 次`)

// ---------- ⑥ 后台那张官方配图（站长 10-18「默认笔记，后台也应该支持上传图片」） ----------
// 这张图**不进 `assets` 表、不进用户配额**：它是官方内容，走的是运营图那条已上线的下发链。
// 所以这一段的判据全是"三个落点吃同一个出处、图源是 https 不是本机路径"——
// 这两件事错了都不会报错，只会让某一屏少一张图、或点了大图什么也不出来。
const MP_ASSETS = fs.readFileSync(path.join(MP, 'utils/mpAssets.js'), 'utf8')
const MODEL_PY = be('app/models/mp_asset.py')
const IX_WXML = read('pages/index/index.wxml')
const DETAIL_JS2 = read('pages/detail/detail.js')

ck('图片闭集里多了那一格，且界面上有中文名（后台那一栏的标题只从 KIND_LABELS 读）',
  /^KINDS = \(KIND_HOME_BG, KIND_PRESET_NOTE_IMAGE\)$/m.test(MODEL_PY)
    && /KIND_PRESET_NOTE_IMAGE: "帮助文档/.test(MODEL_PY))
ck('后台左栏那一格挂得到（NAV 里有 `kind:preset_note_image`，不是只加了个后端 kind 就完事）',
  /key: 'kind:preset_note_image'/.test(be('app/api/routes/ops_page.py')))
ck('取口只有一处（三个落点都调 `serverPresetImage()`，谁都不许自己去读 `MP_ASSET_KEY_…` 那本账）',
  (MP_ASSETS.match(/function serverPresetImage/g) || []).length === 1
    && /mpAssets\.serverPresetImage\(\)/.test(IX_JS) && /mpAssets\.serverPresetImage\(\)/.test(DETAIL_JS2)
    && !/MP_ASSET_KEY_preset_note_image/.test(IX_JS + DETAIL_JS2))
ck('画的是那条 https，不是本机 `USER_DATA_PATH`（`previewImage` 不认本机路径，10-08 记过：小图画得出来、大图看不到）',
  /function serverPresetImage[\s\S]{0,200}?return \(cached && cached\.url\)/.test(MP_ASSETS))
ck('每次落账都记 url，且**旧账缺 url 时当场补上**（不补的话那台机永远停在"有 filePath 没 url"，改了图才对）',
  /wx\.setStorageSync\(_key\(kind\), \{ filePath, url: remote, contentHash: entry\.content_hash \}\)/.test(MP_ASSETS)
    // 10-18 全量审查之后，补账那一句必须**包在 try 里**：`setStorageSync` 在本机存储写满时会抛，
    // 抛在外面等于把整趟 pull 打断，后面每一个 kind 一个都落不了账。
    && /try \{ wx\.setStorageSync\(_key\(kind\), \{ \.\.\.cached, url: remote \}\)/.test(MP_ASSETS))
ck('后台撤了那张图要把本机账一起撤掉（只回 null 不撤账＝这台机一直画那张已经不生效的旧图）',
  /if \(kind === 'preset_note_image'\)[\s\S]{0,400}?removeStorageSync\(_key\(kind\)\)/.test(MP_ASSETS))
ck('撤账要连带删本机那一份文件（只清账不删文件＝那份字节没人认得了，下次换图也不会去删它）',
  /if \(kind === 'preset_note_image'\)[\s\S]{0,400}?FS\.unlinkSync\(stale\.filePath\)/.test(MP_ASSETS))
ck('云环境没 init 成那一支也要画这一张（否则出现"列表右侧有图、点进去那一排是空的"那种自相矛盾的屏）',
  /if \(!cloudUpload\.cloudReady\(\)\) \{\s*\/\/[\s\S]{0,200}?detailImages: official \? \[official\] : \[\]/.test(IX_JS)
    && /this\.setData\(\{ noteImages: official \? \[official\] : \[\] \}\)/.test(DETAIL_JS2))
ck('这一张排在那一排的**最后一格**，两处同一个顺序（用户自己的配图在前，官方那张不与它抢第 0 格）',
  /detailImages: \[\.\.\.\(list \|\| \[\]\), \.\.\.\(official \? \[official\] : \[\]\)\]/.test(IX_JS)
    && /noteImages: \[\.\.\.\(list \|\| \[\]\), \.\.\.\(official \? \[official\] : \[\]\)\]/.test(DETAIL_JS2))
ck('这一张不进 `assets` 那条链（`routes/assets.py` 里出现 preset_note_image＝有人开始给用户配额算一张官方的图）',
  !/preset_note_image/.test(be('app/api/routes/assets.py')) && !/preset_note_image/.test(be('app/services/quota.py')))

console.log(bad.length ? `\n${bad.length} 条没过：${bad.join('、')}` : '\n全过')
process.exit(bad.length ? 1 : 0)
