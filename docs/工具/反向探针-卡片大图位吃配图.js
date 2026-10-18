// 反向探针：上一把尺子（`验-卡片大图位吃配图.js`）到底会不会红。
// 每条坏样本都在**临时复制品**上动刀，仓库里那几个字一个不改；跑完还原再复跑一次，
// 期望"这一支咬得住"＋"还原后全绿"。
// 跑法：node docs/工具/反向探针-卡片大图位吃配图.js
const fs = require('fs')
const os = require('os')
const path = require('path')
const cp = require('child_process')

const ROOT = path.resolve(__dirname, '../..')
const RULER = '验-卡片大图位吃配图.js'
const FILES = [
  'miniprogram/utils/poster.js',
  'miniprogram/utils/posterRecipes.js',
  'miniprogram/utils/noteImage.js',
  'miniprogram/pages/index/index.js',
  'miniprogram/pages/share/share.js',
  'miniprogram/pages/profile/profile.js',
  'backend/seed/poster_templates.json',
]

const mk = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zj-bigslot-'))
  FILES.forEach((f) => {
    const to = path.join(dir, f)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(path.join(ROOT, f), to)
  })
  fs.mkdirSync(path.join(dir, 'docs/工具'), { recursive: true })
  fs.copyFileSync(path.join(ROOT, 'docs/工具', RULER), path.join(dir, 'docs/工具', RULER))
  return dir
}

// 在复制品上跑一遍尺子，拿红名单。
// ⚠ 尺子**跑崩了不等于全绿**：它一旦抛异常，输出里没有 `✗`，只看红名单的探针就会报"没红"＝假绿。
//   所以这里还要求末尾那一行"N 条，红 M 条"在场，读不到就当场算这一支失败。
function run(dir) {
  let out = ''
  try {
    out = cp.execFileSync('node', [path.join(dir, 'docs/工具', RULER)], { encoding: 'utf8' })
  } catch (e) { out = String(e.stdout || '') + String(e.stderr || '') }
  if (!/\d+ 条，红 \d+ 条/.test(out)) return { dead: true, reds: [], out: out.split('\n').slice(0, 4).join(' / ') }
  return { dead: false, reds: (out.match(/✗ [^\n]+/g) || []).map((s) => s.replace('✗ ', '').trim()) }
}

// 一条坏样本：改一个文件里的一段（find 必须在原文里恰好一次，不然这一支自己就是假探针）。
// 例外 `all: true`：要的就是"整批一起降回去"（种子里那十行是同一个值），那种只要求至少出现一次。
function mutate(dir, rel, find, to, all) {
  const f = path.join(dir, rel)
  const src = fs.readFileSync(f, 'utf8')
  const n = src.split(find).length - 1
  if (n < 1) return `改不动：${rel} 里那句一次都没有`
  if (!all && n !== 1) return `改不动：${rel} 里那句出现 ${n} 次（要恰好 1 次）`
  fs.writeFileSync(f, all ? src.split(find).join(to) : src.replace(find, to))
  return null
}

const CASES = [
  // 落点：绘制那一头
  { name: '把 case avatar 的取图改回只认头像', file: 'miniprogram/utils/poster.js',
    find: "images[ly.key || 'avatar']", to: 'images.avatar', expect: '绘制那一头真的按 key 取图' },
  { name: 'withBigKey 改成两支都塞 key（无图态图层会凭空多一栏）', file: 'miniprogram/utils/poster.js',
    find: "return key === 'note' ? Object.assign({ key: 'note' }, o) : o", to: "return Object.assign({ key: 'avatar' }, o)",
    expect: 'withBigKey 只给吃配图那一支塞 key' },
  { name: 'bigKeyOf 把两档顺序倒过来（没配图时也算有）', file: 'miniprogram/utils/poster.js',
    find: "return d.hasNote ? 'note' : d.hasAvatar ? 'avatar' : null", to: "return d.hasAvatar ? 'avatar' : d.hasNote ? 'note' : null",
    expect: '大图位吃哪一张只有 bigKeyOf 这一份算式' },
  { name: '只加进 L 的图层、忘了 avatar 的字段名单', file: 'miniprogram/utils/poster.js',
    find: "avatar: ['x', 'y', 'd', 'ring', 'ringColor', 'fallback', 'key']", to: "avatar: ['x', 'y', 'd', 'ring', 'ringColor', 'fallback']",
    expect: 'avatar 这个 op 的字段名单两边都加了 key' },
  // 落点：两边成对
  { name: 'block 的配方把吃配图那一栏撤掉（JS 改了、配方没改）', file: 'miniprogram/utils/posterRecipes.js',
    find: "{ emit: { k: 'avatar', key: 'note', x: { '/': [{ '-': [{ var: 'W' }, { var: 'avatarD' }] }, 2] }",
    to: "{ emit: { k: 'avatar', x: { '/': [{ '-': [{ var: 'W' }, { var: 'avatarD' }] }, 2] }",
    expect: 'block：配方这一侧也接上了' },
  { name: '玉版宣也去接大图位（他没要的第四入口长出来了）', file: 'miniprogram/utils/poster.js',
    find: "function planCard(ctx, d) {\n  const { note, profile, hasAvatar, lang } = d",
    to: "function planCard(ctx, d) {\n  const { note, profile, hasAvatar, lang } = d\n  const bigKey = bigKeyOf(d) + 'note'",
    expect: 'card 本来就没有大图位' },
  // 落点：小圆永远吃头像
  { name: '名字前那枚小圆也改吃配图', file: 'miniprogram/utils/poster.js',
    find: 'function signRow({ ctx, x, y, maxW, size, avatarD, onDark, profile, hasAvatar }) {',
    to: "function signRow({ ctx, x, y, maxW, size, avatarD, onDark, profile, hasAvatar }) {\n  const note = 'note'",
    expect: 'signRow（名字前面那一排）里没有任何配图的口' },
  { name: '波普四格改成各吃一张（note＋下标那种写法）', file: 'miniprogram/utils/poster.js',
    find: '? L.image(big, x, y, cellW, cellH, { gray: true', to: "? L.image('note' + i, x, y, cellW, cellH, { gray: true",
    expect: '波普分格那四格吃同一张' },
  { name: '波普那四格只改 JS 那一半（配方跟着吃配图、代码还回头像）', file: 'miniprogram/utils/poster.js',
    find: '? L.image(big, x, y, cellW, cellH, { gray: true', to: "? L.image('avatar', x, y, cellW, cellH, { gray: true",
    expect: '波普那四格与封面那一整幅：JS 与配方两边都写成' },
  // 落点：hasNote 与 images.note 同源
  { name: '首页那趟拿"路径在手"当有配图（解码失败就画一块空位）', file: 'miniprogram/pages/index/index.js',
    find: 'hasNote: !!images.note', to: 'hasNote: !!a.noteImgPath', expect: '三个出图口都写 hasNote' },
  { name: '分享页那一排干脆不给 hasNote', file: 'miniprogram/pages/share/share.js',
    find: 'lang, { hasNote: !!images.note })', to: 'lang, {})', expect: '三个出图口都写 hasNote' },
  { name: '设置页那十格被喂了配图（自加的第二入口）', file: 'miniprogram/pages/profile/profile.js',
    find: 'const images = {}', to: "const images = { note: null } // images.note 给 hasNote 用",
    expect: '设置页那十格小样不许被喂配图' },
  // 落点：取那一张的那一步
  { name: 'cloudReady 那道门挪到请求之后', file: 'miniprogram/utils/noteImage.js',
    find: '  if (!noteId || !cloudUpload.cloudReady()) return null\n', to: '\n', expect: 'noteImage.js 判 cloudReady 在打请求之前' },
  { name: '客户端自己排一次序（"第一张"就有两个定义）', file: 'miniprogram/utils/noteImage.js',
    find: 'const rows = Array.isArray(list) ? list : []', to: 'const rows = (Array.isArray(list) ? list : []).sort((a, b) => a.id - b.id)',
    expect: '「第一张」跟着服务端那一行的顺序' },
  { name: '取不到改成抛（一张卡因为取不到配图而出不来）', file: 'miniprogram/utils/noteImage.js',
    find: 'return path || null', to: 'if (!path) throw new Error("取不到配图"); return path', expect: '任何一步拿不到都回 null，不抛' },
  // 落点：种子那道版本门槛
  { name: '六套新画法的种子把门槛降回 1.0.0', file: 'backend/seed/poster_templates.json', all: true,
    find: '"min_app_version":"2.3.18"', to: '"min_app_version":"1.0.0"', expect: '六套新画法的种子把 min_app_version 抬到 2.3.18' },
]

const results = []
CASES.forEach((c, idx) => {
  const dir = mk()
  const err = mutate(dir, c.file, c.find, c.to, c.all)
  if (err) { results.push([c.name, false, err]); fs.rmSync(dir, { recursive: true, force: true }); return }
  const got = run(dir)
  if (got.dead) { results.push([c.name, false, `尺子跑崩，读不到红名单：${got.out}`]); fs.rmSync(dir, { recursive: true, force: true }); return }
  const hit = got.reds.find((r) => r.indexOf(c.expect) === 0)
  results.push([c.name, !!hit, hit ? `咬住：${hit.slice(0, 46)}` : `没红（红的是：${got.reds.join(' / ') || '一条都没有'}）`])
  fs.rmSync(dir, { recursive: true, force: true })
})

// 还原复跑：仓库里那几个字一个没动，所以原样一把必须全绿
const still = run(ROOT)

let bad = 0
results.forEach(([n, okk, d]) => { console.log(`  ${okk ? '✓' : '✗'} ${n}${d ? '　→ ' + d : ''}`); if (!okk) bad++ })
console.log(`${results.length} 支坏样本，咬住 ${results.length - bad} 支`)
if (still.dead) { console.log(`✗ 仓库那把跑崩了（读不到红名单）：${still.out}`); process.exit(1) }
console.log(still.reds.length === 0 ? '✓ 复制品跑完之后，仓库那把原样复跑仍是全绿（探针没在仓库上留刀）' : `✗ 仓库那把红了：${still.reds.join(' / ')}`)
process.exit(bad === 0 && still.reds.length === 0 ? 0 : 1)
