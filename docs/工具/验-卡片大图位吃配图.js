// 卡片模板上那枚**大图位**吃这一篇的第一张配图（站长 10-18 深夜）：
//   「卡片模板，要支持显示笔记图片的需求有做吗？我试了，没显示啊」
//   「需求很简单，就是把配图第一张取代之前的头像图片，但只针对大图替换，
//     小图（名字前面的圆形占位）仍然还是头像图片」
// 跑法：node docs/工具/验-卡片大图位吃配图.js
//
// 这一把只管**结构与同源**：哪六套有大图位、那六套两边（JS planner 与配方）有没有成对改、
// 名字前那枚小圆有没有被我顺手改成配图、hasNote 是不是跟 images.note 同一个来源、
// 没配图时有没有给图层凭空多一栏。
//
// ⚠ 它**不证明画面上真出现那张照片**：那要连 IDE 现点一篇带配图的笔记（这一把管不到的那一半），
//   而他手机上现在还没那条口——库里那十份下发配方还是**老画法**，`验-现网下发收得进` 量到的
//   "无配图 0 处／有配图 432 处"钉的就是这件事。种子已经跟着重出（backend/seed/），灌不灌现网是他一句。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const rd = (f) => fs.readFileSync(f, 'utf8')
// ⚠ 一律先剥注释再正则：本文件那些注释里写满了"不许"“key:'avatar'"这种字样，
//   拿原文扫会把自家注释判成残留（这一坑今天已经踩过两次）。
const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? '　→ ' + extra : ''))
}

const poster = strip(rd(P('utils/poster.js')))
const recipes = strip(rd(P('utils/posterRecipes.js')))
const indexJs = strip(rd(P('pages/index/index.js')))
const shareJs = strip(rd(P('pages/share/share.js')))
const profileJs = strip(rd(P('pages/profile/profile.js')))
const noteImg = strip(rd(P('utils/noteImage.js')))

// ---------- 这一刀的两个唯一出处 ----------
ok('大图位吃哪一张只有 bigKeyOf 这一份算式（配图→头像→null 三级），不在六套里各写一遍',
  (poster.match(/function bigKeyOf\(d\) \{/g) || []).length === 1
  && /d\.hasNote \? 'note' : d\.hasAvatar \? 'avatar' : null/.test(poster))
ok('withBigKey 只给吃配图那一支塞 key（恒写 key:avatar 会让无图态图层凭空多一栏，那是噪声不是改动）',
  /function withBigKey\(key, o\) \{[\s\S]{0,120}return key === 'note'/.test(poster))
ok('绘制那一头真的按 key 取图，取不到才回头像',
  /case 'avatar'[\s\S]{0,200}images\[ly\.key \|\| 'avatar'\]/.test(poster))
ok('avatar 这个 op 的字段名单两边都加了 key（漏一边＝下发的配方带不动这一栏，或客户端整套拒收）',
  /avatar: \['x', 'y', 'd', 'ring', 'ringColor', 'fallback', 'key'\]/.test(poster)
  && /avatar: \['ring', 'ringColor', 'fallback', 'key'\]/.test(poster))

// ---------- 六套有大图位的：两边成对 ----------
const BIG = ['block', 'popGrid', 'popDots', 'acid', 'cover', 'lit']
const SMALL = ['card', 'quote', 'letter', 'spec']
const plannerBody = (name) => {
  const i = poster.indexOf(`function plan${name[0].toUpperCase()}${name.slice(1)}(ctx, d) {`)
  if (i < 0) return null
  const j = poster.indexOf('\nfunction ', i + 1)
  return poster.slice(i, j < 0 ? poster.length : j)
}
// 配方那一份的"一套"怎么切：这份文件是 `{ quote: {...}, card: {...}, ... }` 一个对象，
// 每套的开头都是**恰好两格缩进**的 `  <id>: {`。按这个名单现数一遍再切片——
// 拿"下一个大概是哪套"当终点会切到隔壁那套身上，把隔壁的 'note' 算到这一套头上（第一版就红在这里）。
const RECIPE_MARKS = []
{
  const re = /^  ([a-zA-Z]+): \{$/gm
  let m
  while ((m = re.exec(recipes))) RECIPE_MARKS.push({ id: m[1], at: m.index })
}
const recipeBody = (id) => {
  const i = RECIPE_MARKS.findIndex((x) => x.id === id)
  if (i < 0) return null
  const from = RECIPE_MARKS[i].at
  const to = i + 1 < RECIPE_MARKS.length ? RECIPE_MARKS[i + 1].at : recipes.length
  return recipes.slice(from, to)
}
BIG.forEach((id) => {
  const pb = plannerBody(id[0].toUpperCase() + id.slice(1))
  ok(`${id}：JS planner 这一侧接上了大图位（bigKeyOf），不是一句注释`, !!pb && /bigKeyOf\(d\)/.test(pb))
  // 配方那一侧的记号：'note' 这个键名必须在它身上出现（block/popDots/acid/lit 走 emit 的 key，
  // popGrid/cover 走 image op 的 key 表达式），且必须引用得到 hasNote。
  const rb = recipeBody(id)
  ok(`${id}：配方这一侧也接上了（两边只改一边＝下发那份画不出配图，或包内那份与基线分叉）`,
    !!rb && /'note'/.test(rb) && /hasNote/.test(rb))
})
SMALL.forEach((id) => {
  const pb = plannerBody(id[0].toUpperCase() + id.slice(1))
  const rb = recipeBody(id)
  ok(`${id} 本来就没有大图位：这一套两边都不许出现配图（他没要的第四入口我不给，四套一起改就是自作主张）`,
    !!pb && !/bigKeyOf|'note'/.test(pb) && !!rb && !/'note'/.test(rb))
})

// ---------- 名字前那枚小圆：永远吃头像 ----------
ok('signRow（名字前面那一排）里没有任何配图的口——这就是他说的"小图仍然还是头像图片"',
  (() => {
    const i = poster.indexOf('function signRow(')
    const j = poster.indexOf('\nfunction ', i + 1)
    const body = poster.slice(i, j)
    return i > 0 && !/note|bigKeyOf|withBigKey/.test(body)
  })())
ok('配方那边的 signRow 原语参数表里也没有 hasNote/note（下发的配方改不动这一枚）',
  /signRow:[\s\S]{0,200}keys: \['x', 'y', 'maxW', 'size', 'avatarD', 'onDark', 'hasAvatar'\]/.test(poster))
// 六套里那十处 signRow 调用一律不许跟着换来源：小圆只有头像这一种 feed
ok('反向钉：九个 planner 里的 signRow 调用没有一处递 key/note（小圆被顺手换成配图是这次最容易犯的一刀）',
  !/signRow\(\{[^}]*key:/.test(poster) && !/signRow[^\n]*'note'/.test(poster))

// ---------- 四格都吃"第一张"，不是 1..4 各一张 ----------
ok('波普分格那四格吃同一张（他这句是「配图**第一张**取代头像」，四格各一张是我加的，不许长进代码）',
  !/note1|note2|note3|note0|images\.note\[|'note' \+|"note" \+/.test(poster) && !/note1|note2|note3|note0|'note' \+/.test(recipes))
ok('波普那四格与封面那一整幅：JS 与配方两边都写成"同一个来源"（L.image(big…) 与 key 那一支合一）',
  /L\.image\(big, x, y, cellW, cellH, \{ gray: true/.test(plannerBody('PopGrid') || '')
  && /L\.image\(big, 0, 0, W, height\)/.test(plannerBody('Cover') || '')
  // ⚠ 这里用定长字符串数一遍，不用正则：那一串里 `{ } [ ] '` 全是正则元字符，
  //   转义写漏一个就是"明明在、尺子说没在"那种假红（这一坑今天踩到第二次，改成不依赖转义）。
  && recipes.split("key: { if: [{ truthy: { var: 'hasNote' } }").length - 1 === 2,
  `配方里 key 那一支合一的写法：${recipes.split("key: { if: [{ truthy: { var: 'hasNote' } }").length - 1} 处（要 2 处：波普那四格＋封面那一整幅）`)

// ---------- hasNote ⇔ images.note 同源 ----------
ok('三个出图口都写 hasNote: !!images.note（位图解码成功才算"这篇有配图"）',
  (indexJs.match(/hasNote: !!images\.note/g) || []).length === 1
  && (shareJs.match(/hasNote: !!images\.note/g) || []).length === 2)
ok('反向钉：三个口都不许拿"路径在手"当有配图（路径有、解码失败 ⇒ 图层说吃 note 而 images 里没那张 ⇒ 落下来一块空位）',
  !/hasNote: !!(a\.noteImgPath|this\._noteImgPath|noteImgPath)/.test(indexJs + shareJs))
ok('三处都先把配图解码进 images.note 才谈 hasNote（顺序反了就恒假）',
  /images\.note = await poster\.loadImage/.test(indexJs) && (shareJs.match(/images\.note = await poster\.loadImage/g) || []).length === 2)
ok('设置页那十格小样不许被喂配图（SAMPLE_NOTE 没有配图；多打那一趟请求就是我自加的第二入口）',
  !/noteImage|hasNote|images\.note/.test(profileJs))

// ---------- 取那一张的那一步 ----------
ok('noteImage.js 判 cloudReady 在打请求之前（与详情窗、列表封面同一条门）',
  noteImg.indexOf('cloudReady()') > 0 && noteImg.indexOf('cloudReady()') < noteImg.indexOf('getNoteAssets'))
ok('「第一张」跟着服务端那一行的顺序，客户端不再排一次（两处各排一次迟早漂）',
  !/\.sort\(/.test(noteImg) && !/\.reverse\(/.test(noteImg))
ok('任何一步拿不到都回 null，不抛（出图那条链不许因为取不到配图而整张失败）',
  !/throw /.test(noteImg) && /return path \|\| null/.test(noteImg))
ok('清单每次都现读、只有第一张的 fileID 换了才重新下字节（删过／换过配图之后不许还画上一张）',
  /hit\.fileID === first\.cloud_url/.test(noteImg) && /delete CACHE\[key\]/.test(noteImg))

// ---------- 下发那一路的版本门槛 ----------
const seed = JSON.parse(rd(path.join(ROOT, 'backend/seed/poster_templates.json')))
const bundled = seed.filter((r) => (BIG.indexOf(r.template_id) >= 0))
ok('六套新画法的种子把 min_app_version 抬到 2.3.18（老包认不了 avatar.key 与 hasNote，别把新画法发给它们）',
  bundled.length === 6 && bundled.every((r) => r.min_app_version === '2.3.18'),
  bundled.map((r) => `${r.template_id}=${r.min_app_version}`).join(' '))

console.log(`${pass} 条，红 ${fails.length} 条`)
fails.slice(0, 10).forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
