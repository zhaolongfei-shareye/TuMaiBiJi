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

fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(path.join(OUT_DIR, 'poster_whitelist.json'), JSON.stringify(canon(whitelist), null, 1) + '\n')
fs.writeFileSync(path.join(OUT_DIR, 'poster_templates.json'), dump(rows) + '\n')

const nOps = Object.keys(whitelist.op_keys).length
const nFields = Object.keys(whitelist.op_keys).reduce((a, k) => a + whitelist.op_keys[k].length, 0)
const nPrim = Object.keys(whitelist.prim_keys).length
const nOp = Object.keys(whitelist.arith).length + Object.keys(whitelist.logic).length + Object.keys(whitelist.conv).length
console.log(`名单：op ${nOps} 种 × ${nFields} 字段 / 原语 ${nPrim} 条 / 算子 ${nOp} 个 / 步型 ${whitelist.steps.length} 种 / 项形 ${whitelist.term_forms.length} 种`)
console.log(`种子：${rows.length} 套，合计 ${Buffer.byteLength(dump(rows))} 字节`)
rows.forEach((r) => console.log(`  ${r.template_id.padEnd(8)} ${String(Buffer.byteLength(dump(r.recipe))).padStart(6)} 字节  ${r.content_hash.slice(0, 12)}`))
console.log('→ backend/seed/poster_whitelist.json、backend/seed/poster_templates.json')
