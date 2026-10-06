// P0-4：把客户端那两份"能力名单"与十套配方导出成 JSON，给后端当校验依据与种子。
//
// 为什么要导而不是在后端另抄一遍：名单的唯一出处在 miniprogram/utils/poster.js
// （op 的字段表、原语的参数表、色与字体令），抄第二份就一定会漂移——
// 漂移的结果是"服务端放行了、客户端画不出来"，而那正是方案 §三 要避免的那类事故。
// 所以这里只读现成的对象、原样落 JSON；后端 pytest 把这份 JSON 与它自己那份 Python 名单逐键比，
// 两边不等就红（见 backend/tests/test_poster_templates.py 第一条）。
//
// 跑法：node docs/工具/出-模板配方种子.js
// 产物：backend/seed/poster_whitelist.json、backend/seed/poster_templates.json
//
// 种子里有两拨数据，来源不同：
//   ① 包内那十套——从 miniprogram/utils/poster.js + posterRecipes.js 现读，动它们要发版；
//   ② backend/seed/poster_extra/*.json——**只加一条数据就多一套卡片**的那些，一行客户端代码都不碰。
// 两拨都在这份 JSON 里，deploy.sh 只认这一个文件（种子唯一出处，不留第二条写库路径）。
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

process.env.WX_STORAGE = '{}'
global.wx = {
  getStorageSync: () => ({}),
  setStorageSync: () => {},
  getFileSystemManager: () => ({ accessSync: () => true }),
  env: { USER_DATA_PATH: '/u' },
}
const poster = require('../../miniprogram/utils/poster.js')
const recipes = require('../../miniprogram/utils/posterRecipes.js')
const engine = require('../../miniprogram/utils/posterRecipe.js')

const OUT_DIR = path.resolve(__dirname, '../../backend/seed')

// 按键名排序规范化：同一份内容必须每次导出出同一个字节串，否则 content_hash 会漂，
// 客户端那把"号没变就不重解析"的缓存就永远命中不了。
function canon(v) {
  if (Array.isArray(v)) return v.map(canon)
  if (v && typeof v === 'object') {
    const o = {}
    Object.keys(v).sort().forEach((k) => { o[k] = canon(v[k]) })
    return o
  }
  return v
}
const dump = (v) => JSON.stringify(canon(v))
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex')

const primKeys = {}
Object.keys(poster.RECIPE_PRIMS).forEach((n) => { primKeys[n] = poster.RECIPE_PRIMS[n].keys })

const whitelist = {
  // 解释器自己的那张闭集表（版本一抬，老客户端就会整条配方丢掉，这是有意的）
  interpreter_version: engine.VERSION,
  steps: engine.STEPS,
  //  arity 一并带过去：-1 是变长（至少一个）。后端那份 Python 校验要拦的
  //  "空参数的 +"、"/" 给三个参数，跟客户端拦的是同一批写法。
  arith: engine.ARITH,
  logic: engine.LOGIC,
  conv: engine.CONV,
  term_forms: engine.TERM_FORMS,
  // 绘制 op 与原语：唯一出处都在 poster.js
  op_keys: poster.RECIPE_OP_KEYS,
  prim_keys: primKeys,
  tokens: Object.keys(poster.RECIPE_TOKENS),
  // 这三条上界的唯一出处是客户端解释器里那份 LIMITS（渲染前真会拿它拦），
  // 这里原样带过去给后端比对——再抄一遍数字就是第四处会漂移的地方。
  limits: engine.LIMITS,
}

// 种子是给服务端当"放行依据"的，所以先拿客户端自己的校验过一遍：
// 一份这里就不合格的配方进了种子，服务端照样放行，客户端渲染时会整条丢掉、
// 静默退回 JS planner——那 480 组基线全绿也照样看不出画面其实没走配方。
const badRecipes = poster.TEMPLATES
  .filter((t) => recipes[t.id])
  .map((t) => ({ id: t.id, errs: engine.validate(recipes[t.id], { opKeys: poster.RECIPE_OP_KEYS, primKeys }) }))
  .filter((r) => r.errs.length)
if (badRecipes.length) {
  console.error(`✗ 这几套配方客户端自己就读不了，别导种子：\n${badRecipes.map((r) => `  ${r.id}：${r.errs.join('；')}`).join('\n')}`)
  process.exit(1)
}

const missing = poster.TEMPLATES.filter((t) => !recipes[t.id])
if (missing.length) {
  console.error(`✗ 这几套还没有配方：${missing.map((t) => t.id).join('、')}（P0-3 没转完就别导种子）`)
  process.exit(1)
}

const rows = poster.TEMPLATES.map((t, i) => ({
  template_id: t.id,
  label: t.label,
  label_en: t.labelEn,
  group_key: t.group,
  sort_order: (i + 1) * 10,
  status: 'live',
  // 门槛比的是小程序版本号；配方 JSON 里那个 `min_version` 是解释器版本，两回事，
  // 所以这里带 app_ 前缀（模型里那条注释说的是同一件事）。
  // 这十套写 1.0.0 而不是当前版本号：门槛的意义是"新加的模板别发给老包"，
  // 不是把包内早就带着的十套一起锁到最新版。
  min_app_version: '1.0.0',
  recipe: canon(recipes[t.id]),
}))
rows.forEach((r) => { r.content_hash = hash(dump(r.recipe)) })

// ---------------------------------------------------------------- 数据模板（poster_extra/）
// 一份文件＝一套卡片，文件名就是 template_id。这一档存在的意义是：§11.4 那条上线路径里
// "服务端加一行"不再要求先改 miniprogram——写配方的人拿到的一直是个纯 JSON，
// 以前却要把它塞进 posterRecipes.js 才能进种子，那一步就把"不用发版"这句话破了。
// 该查的一条都在这趟查（服务端那道 validate 与客户端合并闸门都还会再查一遍）：
// 这里拦下来，写配方的人当场就能看到病名；漏过去则是库里多一行、界面上永远少一格。
const EXTRA_DIR = path.join(OUT_DIR, 'poster_extra')
// 种子文件只许 live。draft/archived 是库里那两个把手（改完就地收回来，秒级、不发版），
// 不是落盘的写法：拿 draft 灌进种子，"同 template_id + 同 content_hash 就不动"那条幂等
// 判据查的却是 live 行，于是每部署一次多插一行（2026-10-06 探出来的，见下方 Python 侧那条用例）。
const EXTRA_STATUSES = ['live']
const groupKeys = [...new Set(poster.TEMPLATES.map((t) => t.group))]
const extraFiles = (fs.existsSync(EXTRA_DIR) ? fs.readdirSync(EXTRA_DIR) : [])
  .filter((f) => f.endsWith('.json') && !f.endsWith('.example.json'))
  .sort()
const extraProblems = []
const takenId = new Set(rows.map((r) => r.template_id))
const takenSort = new Set(rows.map((r) => r.sort_order))
extraFiles.forEach((f) => {
  const stem = f.slice(0, -'.json'.length)
  let row
  try {
    row = JSON.parse(fs.readFileSync(path.join(EXTRA_DIR, f), 'utf8'))
  } catch (e) {
    extraProblems.push(`${f}：读不住 —— ${e.message}`)
    return
  }
  const say = (msg) => extraProblems.push(`${f}：${msg}`)
  if (row.template_id !== stem) return say(`文件名与 template_id「${row.template_id}」不一致（改名换一套会留一份对不上号的种子）`)
  if (takenId.has(stem)) return say(`与已有模板重名「${stem}」——重名那套会被客户端按 id 覆盖，画的是哪张看顺序`)
  const rec = row.recipe
  if (!rec || typeof rec !== 'object' || !Array.isArray(rec.steps)) return say('recipe 得是 {id, min_version, steps:[…]}')
  if (rec.id !== stem) return say(`配方自己的 id「${rec.id}」与 template_id 不一致（§11.2 第 1 条：名字对、内容不对的那种卡）`)
  const errs = engine.validate(rec, { opKeys: poster.RECIPE_OP_KEYS, primKeys })
  if (errs.length) return say(`客户端这份名单读不懂：${errs.slice(0, 3).join('；')}`)
  if (!row.label || !String(row.label).trim()) return say('label 不能空（「卡片模板」那页那一格下面写的就是它）')
  if (!row.label_en || !String(row.label_en).trim()) return say('label_en 不能空')
  if (String(row.label).length > 40 || String(row.label_en).length > 60) return say('名字超出列宽（label 40 / label_en 60）')
  if (groupKeys.indexOf(row.group_key) < 0) return say(`group_key「${row.group_key}」不在名单里（能用的是 ${groupKeys.join('、')}）`)
  if (!Number.isInteger(row.sort_order)) return say('sort_order 得是整数')
  if (takenSort.has(row.sort_order)) return say(`sort_order ${row.sort_order} 已被占用（同序时谁在前看主键，界面顺序会漂）`)
  if (!/^\d+\.\d+\.\d+$/.test(String(row.min_app_version || ''))) return say(`min_app_version「${row.min_app_version}」得是三段号（形如 1.9.27；只用现有 op 与原语就写 1.0.0）`)
  const st = row.status || 'live'
  if (EXTRA_STATUSES.indexOf(st) < 0) return say(`status「${st}」不走种子这条路（要 draft/archived 请部署完在库里改那一个字段）`)
  const r = {
    template_id: stem,
    label: row.label,
    label_en: row.label_en,
    group_key: row.group_key,
    sort_order: row.sort_order,
    status: st,
    min_app_version: row.min_app_version,
    recipe: canon(rec),
  }
  r.content_hash = hash(dump(r.recipe))
  rows.push(r)
  takenId.add(stem)
  takenSort.add(r.sort_order)
})
if (extraProblems.length) {
  console.error(`✗ poster_extra 有 ${extraProblems.length} 条不合格，种子一个字都没写：\n${extraProblems.map((s) => `  ${s}`).join('\n')}`)
  process.exit(1)
}

fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(path.join(OUT_DIR, 'poster_whitelist.json'), JSON.stringify(canon(whitelist), null, 1) + '\n')
fs.writeFileSync(path.join(OUT_DIR, 'poster_templates.json'), dump(rows) + '\n')

const nOps = Object.keys(whitelist.op_keys).length
const nFields = Object.keys(whitelist.op_keys).reduce((a, k) => a + whitelist.op_keys[k].length, 0)
const nPrim = Object.keys(whitelist.prim_keys).length
const nOp = Object.keys(whitelist.arith).length + Object.keys(whitelist.logic).length + Object.keys(whitelist.conv).length
console.log(`名单：op ${nOps} 种 × ${nFields} 字段 / 原语 ${nPrim} 条 / 算子 ${nOp} 个 / 步型 ${whitelist.steps.length} 种 / 项形 ${whitelist.term_forms.length} 种`)
console.log(`种子：${rows.length} 套（包内 ${rows.length - extraFiles.length} + 数据模板 ${extraFiles.length}），合计 ${Buffer.byteLength(dump(rows))} 字节`)
rows.forEach((r) => console.log(`  ${r.template_id.padEnd(8)} ${String(Buffer.byteLength(dump(r.recipe))).padStart(6)} 字节  ${r.content_hash.slice(0, 12)}`))
console.log('→ backend/seed/poster_whitelist.json、backend/seed/poster_templates.json')
