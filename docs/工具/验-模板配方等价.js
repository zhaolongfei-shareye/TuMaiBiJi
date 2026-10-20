// P0-1：十套卡片模板的「逐层等价」基线（方案 docs/方案-卡片模板不走发版.md §六 P0 那块地基）。
//
// 为什么要它：P0 要做的是把十个 planner 拆成"包内原语 + 声明式配方"，用户可见结果**一张像素都不许变**。
// 光靠肉眼看十张成品图证明不了这件事（十个模板 × 中英 × 带不带码 × 有形象没形象，人眼只能看出"大概一样"）。
// 所以这把尺子在 node 里用**记录型替身 ctx** 跑产品那份 `poster.js`，把每一组两个东西抓成指纹：
//   ① plan 的图层清单（逐字段规范化后的 JSON）；
//   ② `paintLayers` 期间对 ctx 的**每一次调用与每一次属性赋值**，按发生顺序记下来。
// ②比①更硬：图层清单里两个不同的写法（先设 fillStyle 再 beginPath vs 反过来）画面上可能一样，
//   但绘制序列不一样就意味着"以后改原语时这条会跟着变"——重构期间要的正是这种差异被看见。
//
// 跑法：
//   node docs/工具/验-模板配方等价.js --写基线     ← 第一次（或确认现状就是正确基线时）生成
//   node docs/工具/验-模板配方等价.js              ← 之后每次重构后跑，与基线逐组比
//   node docs/工具/验-模板配方等价.js --导出 /tmp/trace.json  ← 有红时把全量 trace 落一份，跟旧基线对 diff
//
// 基线文件在仓库里：docs/design/模板配方-等价基线.json。它记的是**当前这份产品代码的真实输出**，
// 不是我以为它应该输出什么；所以第一次生成之后，任何一条红都必须解释成"我改了什么导致它变"，
// 而不是"基线过期了"顺手重生成一次。
//
// ⚠ 10-19 加了一根轴（有/无配图）⇒ 组数 480 → 960，基线重生成过一次。
//   重生成前后**老那 480 组的两枚指纹逐条对过、一字没变**（比对办法见本轮报告），
//   因为这次改画法走的是"没配图时图层清单原样落笔"那条路：JS 与配方两边都只在
//   真要吃配图时才多写一栏 `key`。新那 480 组才是这次改动的证据。
global.wx = {
  getStorageSync: () => ({ name: '阿飞', slogan: '每天读一点再走', template: 'cover', avatarPath: '' }),
  setStorageSync: () => {},
  getFileSystemManager: () => ({ accessSync: () => true }),
  env: { USER_DATA_PATH: '/u' },
}

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const poster = require('../../miniprogram/utils/poster.js')


const BASE = path.resolve(__dirname, '../design/模板配方-等价基线.json')
const WRITE = process.argv.includes('--写基线')
const DUMP_AT = process.argv.indexOf('--导出')
const DUMP = DUMP_AT > -1 ? process.argv[DUMP_AT + 1] : ''

// ---------- 记录型替身 ctx ----------
const grad = () => ({ addColorStop() {} })
// 这些是"属性"（赋值要记、读取要回原值），其余名字都当方法。
// 为什么 globalCompositeOperation 必须回原值：paintLayers 里第二道去色那条是
// `ctx.globalCompositeOperation = 'saturation'; if (ctx.globalCompositeOperation === 'saturation') {...}`
// ——替身要是把读取写成回 noop 函数，这个分支就永远不走，抓出来的序列和真 canvas 不是一回事。
const PROPS = ['fillStyle', 'strokeStyle', 'lineWidth', 'font', 'globalAlpha',
  'globalCompositeOperation', 'filter', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'lineCap', 'lineJoin']
let fontPx = 28
const charW = (c) => (c.codePointAt(0) > 0x2e80 ? fontPx : fontPx * 0.55)

function newCtx() {
  const trace = []
  const props = Object.create(null)
  fontPx = 28
  const num = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)
  const rec = (s) => trace.push(s)
  const handler = {
    get(_, k) {
      const key = String(k)
      if (key === 'measureText') return (s) => ({ width: Array.from(String(s || '')).reduce((a, c) => a + charW(c), 0) })
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createConicGradient') {
        return (...a) => { rec(`G:${key}(${a.map(num).join(',')})`); return grad() }
      }
      if (PROPS.includes(key)) return key === 'font' && props.font === undefined ? '' : props[key]
      return (...a) => { rec(`${key}(${a.map((v) => (v && typeof v === 'object' ? '[obj]' : num(v))).join(',')})`) }
    },
    set(_, k, v) {
      const key = String(k)
      props[key] = v
      if (key === 'font') { const m = /(\d+(?:\.\d+)?)px/.exec(String(v)); if (m) fontPx = parseFloat(m[1]) }
      // 渐变色标是运行时现造的，里面那串 rgba 要落进指纹才能证明"同一条渐变"
      rec(`=${key}:${v && typeof v === 'object' ? '[grad]' : v}`)
      return true
    },
  }
  return { ctx: new Proxy({}, handler), trace }
}

// ---------- 用例矩阵（笔记这六条沿用 验-海报模板几何.js 那份，它有牙）----------
const notes = [
  { title: '测试', summary: '人性就是这么现实啊。你', key_points: [], key_links: [], tags: [], source_url: null, source_type: 'manual', created_at: '2026-09-24T06:00:00Z' },
  { title: '一条特别长的标题用来压排版看看会不会溢出到画布外面去继续加长', summary: '摘要'.repeat(60), key_points: ['要点甲', '要点乙', '要点丙'], key_links: ['https://example.com/very/long/path/that/keeps/going'], tags: ['甲', '乙'], source_url: 'https://example.com/x', source_type: 'web_article', created_at: '2026-09-24T06:00:00Z' },
  { title: '', summary: null, key_points: null, key_links: null, tags: null, source_url: null, source_type: 'screenshot', created_at: '2026-09-24T06:00:00Z' },
  { title: '一二三四五六七八九十一，，二三四五六七八九十一二，，三四五六七八九十', summary: '人性就是这么现实。你也是。那么好的。知道了。是的。好的。没错。是的。好的。明白。', key_points: [], key_links: [], tags: ['甲'], source_url: null, source_type: 'manual', created_at: '2026-09-24T06:00:00Z' },
  { title: '2026微信小程序开发大赛介绍', summary: '微信小程序团队联合 WAICFutureTech 启动 2026 微信小程序开发大赛，以“与 AI 共生”为主题面向全球征集 AI 原生作品。', key_points: [], key_links: [], tags: ['甲'], source_url: null, source_type: 'manual', created_at: '2026-09-23T10:00:00Z' },
  { title: 'WAICFuture 2026 微信小程序开发大赛全球启动', summary: 'The quick brown fox jumps over the lazy dog. 主题面向全球征集 AI 原生作品，International Communication Association 联合主办。', key_points: [], key_links: [], tags: ['甲'], source_url: null, source_type: 'manual', created_at: '2026-09-24T06:00:00Z' },
]
// 有形象 / 没形象两条都要走：`avatar` 那个 op 和 `hasAvatar` 影响的排布是两处分支。
const profiles = (tpl, withAvatar) => ({
  name: '阿飞', slogan: '每天读一点再走', template: tpl,
  avatarPath: withAvatar ? '/u/ava.png' : '',
})
// `image`/`avatar` 两层在替身里要有"图"才会走裁剪那一段；宽高给定的整数，免得比例算出来带浮点噪声。
// note 那一枚是"这一篇有配图"（站长 10-18「把配图第一张取代之前的头像图片，只针对大图替换」）：
// 六套有大图位的模板（叠翠／波普分格／网点漫画／荧光渐变／杂志封面／纸间文艺）在这一态走的是
// 一条从没被基线走过的分支，不给它一组，等价就只证明了老那一条。
const imgsOf = (withAvatar, withNote) => {
  const m = { qr: { img: {}, width: 200, height: 200 } }
  if (withAvatar) m.avatar = { img: {}, width: 400, height: 400 }
  if (withNote) m.note = { img: {}, width: 900, height: 600 }
  return m
}

// 清单指纹按**键名排序**规范化：图层是个"按名字读"的数据结构（paintLayers 全程读 ly.xxx），
// JS 里 Object.assign 的先后顺序对画面没有任何影响。配方解释器按声明顺序拼图层，
// 要是拿原始键序比，就会把"同样一张图"误判成"改了像素"。
// 排序只吃掉键序这一种假差异：字段少了、数变了、行数组换了顺序，照样是红的。
// 绘制序列那条不排序——它记的就是顺序。
const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`
  if (typeof v === 'number') return String(Math.round(v * 1000) / 1000)
  return JSON.stringify(v)
}
const norm = (v) => canon(v)
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

const cases = []
for (const tpl of poster.TEMPLATES) {
  for (let ni = 0; ni < notes.length; ni++) {
    for (const lang of ['zh', 'en']) {
      for (const showQr of [true, false]) {
        for (const withAvatar of [false, true]) {
          for (const withNote of [false, true]) {
            // 尾巴那一段**只在有配图时拼上**：老的 480 个组名一个都不动，
            // 这样重生成基线之后还能逐条对——"老那一半指纹没变"本身就是这次改动的验收项。
            cases.push({
              id: `${tpl.id}#n${ni}#${lang}#${showQr ? 'qr' : 'noqr'}#${withAvatar ? 'ava' : 'noava'}${withNote ? '#note' : ''}`,
              tpl: tpl.id, ni, lang, showQr, withAvatar, withNote,
            })
          }
        }
      }
    }
  }
}

function run(c) {
  const { ctx, trace } = newCtx()
  // strict：走配方的那几套要是跑不通就抛出来，不许悄悄退回 JS 那份 planner——
  // 退回去这一组照样和基线一致，基线就白立了（poster.js 里 planPoster 那段写了为什么）。
  const plan = poster.planPoster(ctx, notes[c.ni], c.tpl, profiles(c.tpl, c.withAvatar), c.lang,
    { showQr: c.showQr, strict: true, hasNote: !!c.withNote })
  poster.paintLayers(ctx, plan.layers, imgsOf(c.withAvatar, c.withNote))
  return {
    plan: norm({ width: plan.width, height: plan.height, layers: plan.layers }),
    paint: norm(trace),
  }
}

const all = {}
for (const c of cases) all[c.id] = run(c)

// ---------- 10-20 审计 N5：两份正本互比（跑 JS 那一份 planner vs 跑配方） ----------
// 上面那 960 组走的是 `strict: true`，而十套全在 `RECIPE_IDS` 里 ⇒ `planPoster` 一次都不走 JS 分支。
// 也就是说：**只改 `poster.js` 里那十枚 `planXxx`，跟基线比是完全绿的**——
// 包内那份"下发挂了时的兜底"就此没人看管。这一节把同一批用例再跑一遍 JS 那一份，
// 两枚指纹必须逐组一字不差；漂一处就红，并指出是哪一套。
const drift = []
for (const c of cases) {
  const { ctx, trace } = newCtx()
  const plan = poster.planFromJs(ctx, notes[c.ni], c.tpl, profiles(c.tpl, c.withAvatar), c.lang,
    { showQr: c.showQr, hasNote: !!c.withNote })
  poster.paintLayers(ctx, plan.layers, imgsOf(c.withAvatar, c.withNote))
  const jsPlan = norm({ width: plan.width, height: plan.height, layers: plan.layers })
  const jsPaint = norm(trace)
  const rec = all[c.id]
  if (jsPlan !== rec.plan) drift.push(`${c.id}：图层清单`)
  else if (jsPaint !== rec.paint) drift.push(`${c.id}：绘制序列`)
}
console.log(`两份正本互比：${cases.length} 组 JS planner vs 配方，漂 ${drift.length} 处`)
drift.slice(0, 8).forEach((x) => console.log('  ✗', x))
const DRIFT_RED = drift.length > 0

if (DUMP) {
  fs.writeFileSync(DUMP, JSON.stringify(all, null, 0))
  console.log(`全量 trace 落到 ${DUMP}（${cases.length} 组）`)
  process.exit(0)
}

// ---------- 自检：这把尺子得先证明自己能量出错，才许拿它说"逐层等价" ----------
if (process.argv.includes('--自检')) {
  const self = []
  // ① 确定性：同一份代码跑两遍，所有指纹必须一字不差（不然基线本身就是噪声）
  const again = {}
  for (const c of cases) again[c.id] = run(c)
  const wob = cases.filter((c) => again[c.id].plan !== all[c.id].plan || again[c.id].paint !== all[c.id].paint)
  self.push([`${cases.length} 组跑两遍完全一致（否则基线是噪声）`, wob.length === 0, wob.length ? `抖动 ${wob.length} 组：${wob.slice(0, 3).map((x) => x.id).join(',')}` : ''])
  const probe = cases.find((c) => c.id.indexOf('card#n1#zh#qr#noava') === 0) || cases[0]
  const p0 = run(probe)
  // ② 图层清单里改一个数，指纹必须变
  const mutated = p0.plan.replace('"x":40', '"x":41')
  self.push(['图层清单改一个坐标，指纹跟着变', mutated !== p0.plan && sha(mutated) !== sha(p0.plan), ''])
  // ③ 绘制序列换个顺序，指纹必须变（证明它记的是"顺序"，不是"有哪些调用"）
  const tr = JSON.parse(p0.paint)
  if (tr.length < 2) self.push(['绘制序列至少两步（否则这条自检没意义）', false, `只有 ${tr.length} 步`])
  else {
    const swapped = [tr[1], tr[0], ...tr.slice(2)]
    self.push(['绘制序列换两步顺序，指纹跟着变', sha(JSON.stringify(swapped)) !== sha(p0.paint), ''])
  }
  // ④ 只加一个不影响画面的空格（比如换个属性写法）应当变——这条**期望它变**，
  //    因为 P0 要防的正是"看着一样但以后改原语会分叉"，宁可敏感不可迟钝。
  self.push(['绘制序列多记一步，指纹跟着变', sha(JSON.stringify([...tr, 'noop()'])) !== sha(p0.paint), ''])
  let n = 0
  for (const [name, ok, detail] of self) { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `　→ ${detail}` : ''}`); if (!ok) n++ }
  console.log(n ? `自检红 ${n} 条：这把尺子不能用` : '自检全过，这把尺子能量出错')
  process.exit(n ? 3 : 0)
}

if (WRITE) {
  const out = {}
  for (const c of cases) out[c.id] = { plan: sha(all[c.id].plan), paint: sha(all[c.id].paint), layers: all[c.id].plan.split('"k":').length - 1 }
  fs.writeFileSync(BASE, JSON.stringify({ 生成: '验-模板配方等价.js --写基线', 组数: cases.length, 说明: '每组两个指纹：plan=图层清单，paint=绘制调用序列；都取 sha256 前 16 位', cases: out }, null, 1))
  console.log(`基线已生成：${cases.length} 组 → ${BASE}`)
  console.log(`覆盖：${poster.TEMPLATES.length} 套模板 × ${notes.length} 条笔记 × 中英 × 码开关 × 有/无形象 × 有/无配图`)
  process.exit(0)
}

if (!fs.existsSync(BASE)) {
  console.log(`✗ 没有基线文件 ${BASE}，先跑一次：node docs/工具/验-模板配方等价.js --写基线`)
  process.exit(3)
}
const base = JSON.parse(fs.readFileSync(BASE, 'utf8')).cases
const red = []
for (const c of cases) {
  const b = base[c.id]
  if (!b) { red.push(`${c.id}: 基线里没有这一组（新增了用例，得重生成基线，别删这条）`); continue }
  const now = all[c.id]
  if (b.plan !== sha(now.plan)) red.push(`${c.id}: 图层清单变了`)
  if (b.paint !== sha(now.paint)) red.push(`${c.id}: 绘制序列变了`)
}
console.log(`${cases.length} 组（${poster.TEMPLATES.length} 套 × ${notes.length} 条笔记 × 中英 × 码开关 × 有/无形象 × 有/无配图）与基线比对，不同 ${red.length} 处`)
red.slice(0, 8).forEach((x) => console.log('  ✗', x))
if (red.length) {
  // 只给指纹没法定位，所以这里把前三条红的现场指纹打出来，并留一条导 diff 的路。
  const first = cases.find((c) => red.some((r) => r.startsWith(c.id)))
  if (first) console.log(`  第一处现场：${first.id} 图层 ${all[first.id].plan.length} 字符 / 绘制 ${all[first.id].paint.length} 字符`)
  console.log('  定位办法：node docs/工具/验-模板配方等价.js --导出 /tmp/now.json，再拿改动前那份 trace 逐字段比')
}
if (DRIFT_RED) console.log('  ✗ 两份正本漂了：要么改 `posterRecipes.js` 跟上一块，要么改回 `planXxx`（规矩是两边一起改）')
process.exit(red.length || DRIFT_RED ? 1 : 0)
