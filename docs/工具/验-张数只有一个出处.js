// 「一篇笔记几张图」这个数，改的时候会不会漏。跑法：node docs/工具/验-张数只有一个出处.js
//
// 为什么要单独一把：这个数散在四个地方，而且**跨语言**（小程序 JS 一份、Python 三份），
// 不可能合成一份。原来前端自己那两处还是各自硬写的字面量 9（选图的 `count` 与合并后的
// `slice`），把 9 改成 3 只改得动一处，症状是"能选 9 张、只留 3 张"——界面不报错、
// 服务端也不报错，只有用户看到少了六张。方案 §3 阶段 1 里"新建一把守张数的尺子"就是它。
//
// 所以这把不钉"必须是 9"，钉的是三条关系：
//   ① 每一侧只写一次（改一处 == 改该侧全部）；
//   ② 两侧同值（前端选得上来的，服务端收得下）；
//   ③ 谁都不许多截一刀（界面画服务端给的全部，不再自己 slice）。
// 真要改数量，改完这把会告诉他还得动哪几处，而不是等真机发现。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

const CREATE = strip(read('miniprogram/pages/create/create.js'))
const MODEL = read('backend/app/models/asset.py')
const ASSETS_ROUTE = read('backend/app/api/routes/assets.py')
const SHARES_ROUTE = read('backend/app/api/routes/shares.py')
const INGEST = read('backend/app/api/routes/ingest.py')
const DETAIL = strip(read('miniprogram/pages/detail/detail.js'))
const VIEW = strip(read('miniprogram/pages/share/view.js'))

// ① 前端这一侧
const feConst = /const MAX_SHOTS = (\d+)/.exec(CREATE)
ck('前端选图上限是一个具名常量（不再是散在各处的字面量）', !!feConst, feConst ? feConst[1] : '没找到 MAX_SHOTS')
// 这一条原来写成"全文不许有裸 9"，红了七次——那七处全在 LINK_RE 的 `[a-z0-9]` 里，
// 与张数无关。判据要钉的是"张数那三种写法"，不是字符本身。
const SHOT_LITERAL = CREATE.match(/count:\s*9\b|slice\(\s*0\s*,\s*9\s*\)|previewImages[\s\S]{0,30}\b9\b|length\s*[><=]+\s*9\b/g) || []
ck('这一侧只写一次（选图 count / 合并 slice / 张数比较里都不许再有裸 9）',
  feConst && SHOT_LITERAL.length === 0, SHOT_LITERAL.join(' | '))
ck('选图 count 与合并后 slice 都用这个常量',
  /count: MAX_SHOTS/.test(CREATE) && /\.slice\(0, MAX_SHOTS\)/.test(CREATE))

// ② 跨端同值
const beConst = /MAX_ASSETS_PER_NOTE = (\d+)/.exec(MODEL)
ck('服务端一篇上限也是只写一次（在 models/asset.py）',
  beConst && (MODEL.match(/MAX_ASSETS_PER_NOTE = /g) || []).length === 1)
ck('两侧同值：前端选得上来的，服务端收得下',
  feConst && beConst && feConst[1] === beConst[1], `${feConst && feConst[1]} vs ${beConst && beConst[1]}`)
ck('卡张数的那一句读的是常量，不是抄的第二份数',
  /MAX_ASSETS_PER_NOTE:/.test(ASSETS_ROUTE) && !/= 9\b/.test(ASSETS_ROUTE))

// ③ 不许有别处多截一刀
// 张数**只在门口卡一次**：绑那一个口卡，其余读的口一律不许多截一刀。
// 原来公开页也 `.limit(9)` 一遍，那会造出"库里有 12 行、屏上只画 9 张"的幽灵——
// 多出来的行照样占全站配额，却没人看得见它们。
// 判"公开页有没有自己截一刀"要看它**有没有把这个常量拿进自己作用域**，不能数注释里提没提
// （`_public_assets` 的说明文字里就写着这个常量的名字，直扫文本会假红）。
ck('只有绑定那一个口卡张数（读的口不许再截一刀）',
  (ASSETS_ROUTE.match(/>\s*MAX_ASSETS_PER_NOTE/g) || []).length === 1
    && !/import[^#]*MAX_ASSETS_PER_NOTE/.test(SHARES_ROUTE)
    && !/limit\(MAX/.test(SHARES_ROUTE),
  `卡点 ${(ASSETS_ROUTE.match(/>\s*MAX_ASSETS_PER_NOTE/g) || []).length} 处`)
ck('详情页不自己截一刀（画完服务端给的全部）', !/noteImages[\s\S]{0,40}\.slice\(/.test(DETAIL))
ck('落地页不自己截一刀', !/assets[\s\S]{0,40}\.slice\(/.test(VIEW))

// ④ 与"一批"那条上限的关系：它管的是"一次 OCR 请求收几张"，与"一篇挂几张"是两件事，
//    但必须 >= 一篇张数，否则第九张根本进不来这一批。
const batch = /MAX_IMAGES_PER_BATCH = (\d+)/.exec(INGEST)
ck('一批的上限只写一次，且不小于一篇张数（否则最后几张进不了 OCR）',
  batch && Number(batch[1]) >= Number(beConst && beConst[1]),
  batch ? `一批 ${batch[1]} / 一篇 ${beConst && beConst[1]}` : '没找到 MAX_IMAGES_PER_BATCH')

// ⑤ 文案里不许出现第二个"9 张"（数字改了而话没改，是最容易漏的那一处）
const I18N = read('miniprogram/utils/i18n.js')
const said = (I18N.match(/\d+\s*张/g) || []).join('、')
ck('字典里没有写死的"N 张"文案（要提数量就从常量拼）', said === '', said)

console.log(bad.length ? `\n✗ ${bad.length} 条不过：${bad.join(' / ')}` : '\n全过')
process.exit(bad.length ? 1 : 0)
