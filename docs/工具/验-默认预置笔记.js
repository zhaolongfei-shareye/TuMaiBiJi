// §8.232 新用户那一篇预置笔记的静态自证：不连模拟器也能跑的那部分。
// 跑法：node docs/工具/验-默认预置笔记.js
//
// 这把守的四件事，每件都对应一条"错了不会报错"的失效方式：
// ① 种子＝生成器重跑一遍的产物（关于页改了一句话而种子没跟着重出＝屏上出现第二份产品介绍）；
// ② `preset` 这个 source_type 在三张来源标签表里都有对应中文（漏一处的表现是把英文枚举值写上屏，
//    站长 10-02 在列表页撞过同一个形状）；
// ③ 种子的落点与先后（挂在建号那一个分支、且排在邀请归因之后）——
//    顺序反了或改成"名下没笔记就种"，表现是**所有邀请奖励从此结不出来**，接口一声不响；
// ④ 不为这一篇开特殊分支：`preset` 只许出现在取数与结钱那几处判据里，
//    编辑/删除/私密/分享四条链路上出现它就是有人加了一格 if。
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
ck('动笔首篇那条改读 authored_count（读 used_count 就被预置那一篇占了第一名）',
  /_is_his_first_note[\s\S]{0,600}?authored_count\(db, user\.id\) == 1/.test(QUOTA)
  && !/_is_his_first_note[\s\S]{0,600}?used_count\(db, user\) == 1/.test(QUOTA))
ck('归因那条不认的判据也改读 authored_count（同一条钱，第二处闸门）',
  /attribute_inviter[\s\S]{0,900}?authored_count\(db, user\.id\) > 0/.test(QUOTA))
ck('页头那一列仍读 used_count（口径 6：新用户看到 1，不许被降成 0）',
  /def used_count/.test(QUOTA) && /"used": used/.test(QUOTA))

// ---------- ④ 不许为它开特殊分支 ----------
// `preset` 只许出现在：种子读取、auth 的挂载点、结钱/归因的计数、以及卡片那一条"这一篇走同一条链"的注释里。
const ALLOW = ['app/core/auth.py', 'app/services/preset_note.py', 'app/services/quota.py', 'seed/preset_note.json']
const hits = []
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name)
  if (e.isDirectory()) { if (e.name !== '__pycache__') walk(p); return }
  if (!/\.(py|json)$/.test(e.name)) return
  const rel = path.relative(path.join(ROOT, 'backend'), p)
  if (ALLOW.includes(rel)) return
  const src = fs.readFileSync(p, 'utf8')
  src.split('\n').forEach((line, i) => {
    // 只认这个枚举值本身：`WALLPAPER_PRESETS`（壁纸预设，09-24 就在了）里也含 "preset" 三个字母，
    // 拿 /preset/i 扫会把无关的常量报成"为这一篇开了分支"。
    if (/(PRESET_SOURCE_TYPE|['"]preset['"])/.test(line) && !/^\s*[#"]/.test(line.trim())) hits.push(`${rel}:${i + 1} ${line.trim().slice(0, 60)}`)
  })
})
walk(path.join(ROOT, 'backend/app'))
ck('编辑/删除/私密/分享那几条链路上没有一格 `if preset`（判据 4：同一条链）',
  hits.length === 0, hits.join('　| ').slice(0, 300))

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
ck('私密那一格与台账已有那一格都先挡（同一条既有口径，不是为它新起的）',
  /if \(!note \|\| note\.is_private \|\| this\._cardsOf\(noteId\)\.length\) return/.test(auto))
ck('`noCards` 那句空态文案还留着（口径 5：不许把"一定有一张"写成承诺）',
  !!texts('zh').noCards && !!texts('en').noCards, texts('zh').noCards)

console.log(bad.length ? `\n${bad.length} 条没过：${bad.join('、')}` : '\n全过')
process.exit(bad.length ? 1 : 0)
