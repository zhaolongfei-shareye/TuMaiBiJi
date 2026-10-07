// 现网下发的那一份，客户端到底收不收、画出来是不是同一张卡。
//
// 为什么还要这一把：库里那十行是 10-07 23:0x 真灌进去的（PRD §8.143）。现网那支探针
// `backend/probes/poster_templates_live_probe.py` 证的是**服务端**那份名单放行；而客户端有
// **它自己那份**名单（`poster.js` 的 `remoteRowProblems` + `appVersionOk`，两边各数一遍键名与取值）。
// 两头都通才算这条通路通。中间任何一处对不上都是**静默**的：那一套悄悄回退到包内那份，
// 画面看着对、其实下发一个字都没生效——这正是这条链最贵的那类漏法（方案 §六 P0-6 那三条）。
//
// 输入不是仓库里的副本，是**现网真实回体**。取一次（通篇只读，只用 deploy-test 那位）：
//   ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -c "
//   import httpx, json
//   from app.core.auth import _create_token
//   from app.db.database import SessionLocal
//   from app.models.user import User
//   db = SessionLocal(); me = db.get(User, 1); t = _create_token(me.id); db.close()
//   r = httpx.get(\"https://api.agentsbin.cn/wtsj/api/poster/templates/\",
//                 headers={\"Authorization\": \"Bearer \" + t}, timeout=30)
//   open(\"/tmp/live-payload.json\",\"w\").write(json.dumps(r.json(), ensure_ascii=False))
//   print(r.status_code, len(r.json()))" && scp -q agentsbin:/tmp/live-payload.json /tmp/'
// 拿不到回体就退 3 报错，**不许拿仓库里那份种子顶替**——顶替就等于这把尺子从没量过现网。
//
// 跑法：node docs/工具/验-现网下发收得进.js [回体路径]      （默认 /tmp/live-payload.json）
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const poster = require('../../miniprogram/utils/poster.js')

const FILE = process.argv[2] || '/tmp/live-payload.json'
const BASE = path.resolve(__dirname, '../design/模板配方-等价基线.json')

global.wx = {
  getStorageSync: () => ({ name: '阿飞', slogan: '每天读一点再走', template: 'cover', avatarPath: '' }),
  setStorageSync: () => {},
  getFileSystemManager: () => ({ accessSync: () => true }),
  env: { USER_DATA_PATH: '/u' },
}

if (!fs.existsSync(FILE)) {
  console.error(`✗ 读不到现网回体：${FILE}`)
  console.error('  按本文件顶上那段命令取一份再跑。拿种子文件顶替＝这把尺子没量过现网，别那样跑。')
  process.exit(3)
}

// ---------- 记录型替身 ctx（与 验-模板配方等价.js 同一套，注释在那边）----------
const grad = () => ({ addColorStop() {} })
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
      rec(`=${key}:${v && typeof v === 'object' ? '[grad]' : v}`)
      return true
    },
  }
  return { ctx: new Proxy({}, handler), trace }
}

const notes = [
  { title: '测试', summary: '人性就是这么现实啊。你', key_points: [], key_links: [], tags: [], source_url: null, source_type: 'manual', created_at: '2026-09-24T06:00:00Z' },
  { title: '一条特别长的标题用来压排版看看会不会溢出到画布外面去继续加长', summary: '摘要'.repeat(60), key_points: ['要点甲', '要点乙', '要点丙'], key_links: ['https://example.com/very/long/path/that/keeps/going'], tags: ['甲', '乙'], source_url: 'https://example.com/x', source_type: 'web_article', created_at: '2026-09-24T06:00:00Z' },
  { title: '', summary: null, key_points: null, key_links: null, tags: null, source_url: null, source_type: 'screenshot', created_at: '2026-09-24T06:00:00Z' },
  { title: '一二三四五六七八九十一，，二三四五六七八九十一二，，三四五六七八九十', summary: '人性就是这么现实。你也是。那么好的。知道了。是的。好的。没错。是的。好的。明白。', key_points: [], key_links: [], tags: ['甲'], source_url: null, source_type: 'manual', created_at: '2026-09-24T06:00:00Z' },
  { title: '2026微信小程序开发大赛介绍', summary: '微信小程序团队联合 WAICFutureTech 启动 2026 微信小程序开发大赛，以“与 AI 共生”为主题面向全球征集 AI 原生作品。', key_points: [], key_links: [], tags: ['甲'], source_url: null, source_type: 'manual', created_at: '2026-09-23T10:00:00Z' },
  { title: 'WAICFuture 2026 微信小程序开发大赛全球启动', summary: 'The quick brown fox jumps over the lazy dog. 主题面向全球征集 AI 原生作品，International Communication Association 联合主办。', key_points: [], key_links: [], tags: ['甲'], source_url: null, source_type: 'manual', created_at: '2026-09-24T06:00:00Z' },
]
const profiles = (tpl, withAvatar) => ({
  name: '阿飞', slogan: '每天读一点再走', template: tpl,
  avatarPath: withAvatar ? '/u/ava.png' : '',
})
const imgsOf = (withAvatar) => {
  const m = { qr: { img: {}, width: 200, height: 200 } }
  if (withAvatar) m.avatar = { img: {}, width: 400, height: 400 }
  return m
}
// 图层清单按键名排序规范化（键序对画面没有影响）；绘制序列不排序（它记的就是顺序）。
const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`
  if (typeof v === 'number') return String(Math.round(v * 1000) / 1000)
  return JSON.stringify(v)
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

const cases = []
for (const tpl of poster.TEMPLATES) {
  for (let ni = 0; ni < notes.length; ni++) {
    for (const lang of ['zh', 'en']) {
      for (const showQr of [true, false]) {
        for (const withAvatar of [false, true]) {
          cases.push({ id: `${tpl.id}#n${ni}#${lang}#${showQr ? 'qr' : 'noqr'}#${withAvatar ? 'ava' : 'noava'}`, tpl: tpl.id, ni, lang, showQr, withAvatar })
        }
      }
    }
  }
}

function run(c) {
  const { ctx, trace } = newCtx()
  // strict：走配方的那几套跑不通就抛，不许悄悄退回 JS planner——退回去这一组照样和基线一致，比就白比了。
  const plan = poster.planPoster(ctx, notes[c.ni], c.tpl, profiles(c.tpl, c.withAvatar), c.lang, { showQr: c.showQr, strict: true })
  poster.paintLayers(ctx, plan.layers, imgsOf(c.withAvatar))
  return { plan: sha(canon({ width: plan.width, height: plan.height, layers: plan.layers })), paint: sha(canon(trace)) }
}

const results = []
const ck = (name, pass, detail) => results.push([name, !!pass, pass ? '' : (detail || '')])

const baseline = JSON.parse(fs.readFileSync(BASE, 'utf8')).cases
ck(`基线那份在（${Object.keys(baseline).length} 组，它今天刚被 验-模板配方等价 判过 480 组红 0）`,
  Object.keys(baseline).length === cases.length, `基线 ${Object.keys(baseline).length} 组 / 本尺子要 ${cases.length} 组`)

let rows
try {
  rows = JSON.parse(fs.readFileSync(FILE, 'utf8'))
} catch (e) {
  console.error(`✗ 回体读不住：${e.message}`)
  process.exit(3)
}
ck('回体是数组（客户端第一眼就问这条，不是数组整批判脏）', Array.isArray(rows), typeof rows)
ck(`回体是 ${poster.RECIPE_IDS.length} 条（库里 live 几条它就是几条，少一条就是少一套）`,
  Array.isArray(rows) && rows.length === poster.TEMPLATES.length, `${Array.isArray(rows) ? rows.length : 'n/a'} 条`)

// ---------- 收不收 ----------
poster.applyRemoteTemplates([])
const rep = poster.applyRemoteTemplates(rows)
ck(`客户端那份名单十条全收（accepted ${rep.accepted}）`, rep.accepted === rows.length && rep.rejected.length === 0,
  `收 ${rep.accepted} 拒 ${rep.rejected.length}：${rep.rejected.slice(0, 3).join(' | ')}`)
// 少了这条，"全收"也可能是"收完没人用"：出的图仍来自包内那份，肉眼与基线全一样。
const srcs = poster.TEMPLATES.map((t) => `${t.id}=${poster.recipeSource(t.id)}`)
ck('十条的 recipeSource 全是 remote（真在用下发那一份，不是收进抽屉）',
  srcs.every((s) => /remote$/.test(s)), srcs.join(' '))

// ---------- 画得一样吗 ----------
const diff = []
for (const c of cases) {
  const got = run(c)
  const want = baseline[c.id]
  if (!want) { diff.push(`${c.id}：基线里没这组`); continue }
  if (got.plan !== want.plan) diff.push(`${c.id}：图层清单不一样 ${got.plan} vs ${want.plan}`)
  if (got.paint !== want.paint) diff.push(`${c.id}：绘制序列不一样 ${got.paint} vs ${want.paint}`)
}
ck(`${cases.length} 组（${poster.TEMPLATES.length} 套 × ${notes.length} 条笔记 × 中英 × 带不带码 × 有没形象）现网那一份画出来与基线逐组一致`,
  diff.length === 0, `不同 ${diff.length} 处：${diff.slice(0, 3).join(' | ')}`)

// ---------- 反向：这两条不红，上面那条就是恒真式 ----------
const tampered = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const t0 = tampered.find((r) => r.recipe && r.recipe.steps && r.recipe.steps.length)
let bumped = false
for (const st of t0.recipe.steps) { if (typeof st.value === 'number') { st.value += 7; bumped = true; break } }
ck('反向①准备：能在某一行里改出一个数值（改不动就说明这把尺子的反向没牙）', bumped)
poster.applyRemoteTemplates([])
const rep2 = poster.applyRemoteTemplates(tampered)
const changed = cases.filter((c) => c.tpl === t0.template_id).filter((c) => {
  const got = run(c)
  return got.plan !== baseline[c.id].plan || got.paint !== baseline[c.id].paint
}).length
ck('反向①：改一个数值之后那一套的组必须与基线不同（不然第 4 条是"谁都一样"的假绿）',
  rep2.accepted === rows.length && changed > 0, `收 ${rep2.accepted} 条、变了 ${changed} 组`)

poster.applyRemoteTemplates([])
const old = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const t1 = old.find((r) => r.template_id === t0.template_id)
t1.min_app_version = '9.9.9'
const rep3 = poster.applyRemoteTemplates(old)
ck('反向②：把某行的 min_app_version 抬到 9.9.9，客户端按段筛就要拒掉那一条（这条在咬"版本门槛"这道闸）',
  rep3.accepted === rows.length - 1 && rep3.rejected.some((s) => s.indexOf(t0.template_id) === 0),
  `收 ${rep3.accepted} 拒 ${JSON.stringify(rep3.rejected.slice(0, 2))}`)

poster.applyRemoteTemplates([])
ck('收尾：清干净了（回体撤掉之后十条都退回包内那一份）',
  poster.TEMPLATES.every((t) => poster.recipeSource(t.id) !== 'remote'))

let n = 0
for (const [name, pass, detail] of results) {
  console.log(`${pass ? '✓' : '✗'} ${name}${pass || !detail ? '' : `　→ ${detail}`}`)
  if (!pass) n++
}
console.log(`${results.length} 条，红 ${n} 条`)
process.exit(n ? 1 : 0)
