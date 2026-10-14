// §8.232 那一篇预置笔记的种子生成器：把现网两份**已经在屏上**的介绍文案抄成后端那一份种子，
// 不是新写一份产品介绍。产物＝`backend/seed/preset_note.json`。
//
// 为什么走生成器而不是手抄：手抄的那一句和关于页那句迟早差一个字，而差出来的那一字只有用户看得见。
// `验-默认预置笔记.js` 这一把尺子的判据就是"把本脚本原样再跑一遍，产物一字没变"——
// 改了 appInfo.js 或 about.js 却没重跑本脚本，那把就红。
//
// 跑法：node docs/工具/出-预置笔记种子.js
const fs = require('fs')
const path = require('path')

const ROOT = process.env.MP_ROOT || path.resolve(__dirname, '../..')
const APPINFO = path.join(ROOT, 'miniprogram/utils/appInfo.js')
const ABOUT = path.join(ROOT, 'miniprogram/pages/about/about.js')
const OUT = path.join(ROOT, 'backend/seed/preset_note.json')

// 取 JS 源码里那一串引号包住的值（只支持 ' 与 "，且不含转义——ZH 那两批文案里没有撇号）。
// `after` 是搜索起点：`zh:` 这种短键在一个文件里可能出现好几次，从哪个词之后找必须写死，
// 不然改一行文件顺序就读走别处那串（读走的那串还是合法中文，尺子量不出来）。
function quoted(src, key, after) {
  const start = after ? src.indexOf(after) : 0
  if (start < 0) throw new Error(`源件里找不到那把锚：${after}`)
  const at = src.indexOf(key, start)
  const q = src.indexOf("'", at + key.length)
  if (at < 0 || q < 0) throw new Error(`读不到 ${key}（锚：${after || '(文件头)'}）`)
  const end = src.indexOf("'", q + 1)
  if (end < 0) throw new Error(`${key} 那串引号没关上`)
  return src.slice(q + 1, end)
}

// FEATURES_ZH 那一段数组字面量：从 `const FEATURES_ZH = [` 找到配对的那个 `]`（按括号数，
// 不按"第一个 ]"——body 里有「」没有方括号，但规则不该靠运气）。
function featuresZh(src) {
  const head = 'const FEATURES_ZH = ['
  const from = src.indexOf(head)
  if (from < 0) throw new Error('about.js 里找不到 FEATURES_ZH')
  let depth = 0
  let i = from + head.length - 1
  for (; i < src.length; i += 1) {
    if (src[i] === '[') depth += 1
    else if (src[i] === ']') { depth -= 1; if (depth === 0) break }
  }
  const body = src.slice(from + head.length, i)
  const items = []
  const re = /\{\s*mark:\s*'([^']*)',[\s\S]*?tone:\s*\d+,[\s\S]*?title:\s*'([^']*)',[\s\S]*?body:\s*'([^']*)',[\s\S]*?\}/g
  let m
  while ((m = re.exec(body))) items.push({ mark: m[1], title: m[2], body: m[3] })
  if (items.length < 2) throw new Error(`FEATURES_ZH 只 parse 出 ${items.length} 条，判据不能建在半份读出来的文案上`)
  return items
}

const appInfo = fs.readFileSync(APPINFO, 'utf8')
const about = fs.readFileSync(ABOUT, 'utf8')
const introZh = quoted(appInfo, 'zh:', 'INTRO_LEADS')
const feats = featuresZh(about)

// 「四字段写死在种子里，不走模型」（§8.232 口径 3）：标题与那枚标签是这一条需求当场定的，
// 摘要／要点／正文三个字段全部是现网文案的抄件。
const row = {
  _comment: '§8.232 新用户那一篇预置笔记。摘要＝appInfo.js 的 INTRO_LEADS.zh，要点与正文＝about.js 的 FEATURES_ZH 五张卡，'
    + '一句都不是新写的。改那两份源件之后必须重跑 `node docs/工具/出-预置笔记种子.js`，'
    + '否则 `验-默认预置笔记.js` 红。',
  source_type: 'preset',
  title: '你收藏过的 200 条，为什么一条都找不到？',
  summary: introZh,
  tags: ['产品说明'],
  key_points: feats.map((f) => f.title),
  content: [introZh].concat(feats.map((f) => `${f.title}：${f.body}`)).join('\n\n'),
}

fs.writeFileSync(OUT, JSON.stringify(row, null, 2) + '\n', 'utf8')
console.log(`已写 ${OUT}`)
console.log(`摘要 ${row.summary.length} 字　要点 ${row.key_points.length} 条（${row.key_points.join('/')}）　正文 ${row.content.length} 字`)
