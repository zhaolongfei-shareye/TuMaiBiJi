// 反向探针：`验-模板配方下发.js` 第⑩节那十三条（两屏挂拉取）到底会不会红。
// 规矩与前几把一样：**每条坏样本都在临时复制品上动刀，仓库里一个字不改**；
// 最后拿一份没动过的复制品再跑一遍，期望全绿——不然"改坏了会红"这句话没证据。
// 跑法：node docs/工具/反向探针-两屏挂拉取.js
const fs = require('fs')
const os = require('os')
const path = require('path')
const cp = require('child_process')

const ROOT = path.resolve(__dirname, '../..')
const RULER = '验-模板配方下发.js'
const UTILS = 'miniprogram/utils'
const IDX = 'miniprogram/pages/index/index.js'
const SHR = 'miniprogram/pages/share/share.js'
const PAGES = [IDX, SHR, 'miniprogram/pages/profile/profile.js', 'miniprogram/pages/me/me.js']

function mk() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zj-pull-screens-'))
  const copy = (rel) => {
    const to = path.join(dir, rel)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(path.join(ROOT, rel), to)
  }
  fs.mkdirSync(path.join(dir, UTILS), { recursive: true })
  fs.readdirSync(path.join(ROOT, UTILS)).filter((f) => f.endsWith('.js'))
    .forEach((f) => fs.copyFileSync(path.join(ROOT, UTILS, f), path.join(dir, UTILS, f)))
  PAGES.forEach(copy)
  copy(`docs/工具/${RULER}`)
  return dir
}

function cut(dir, rel, from, to) {
  const p = path.join(dir, rel)
  const s = fs.readFileSync(p, 'utf8')
  if (s.indexOf(from) < 0) throw new Error(`这一刀的锚点不在 ${rel} 里：${from.slice(0, 40)}`)
  fs.writeFileSync(p, s.replace(from, to))
}

// ⚠ 尺子跑崩了不等于全绿：它一抛异常，输出里没有 `✗`，只看红名单就会报"没红"＝假绿。
//   所以这里要求末尾那行"N 条，红 M 条"在场，读不到就当场算这一支失败。
function run(dir) {
  let out = ''
  try {
    out = cp.execFileSync('node', [path.join(dir, 'docs/工具', RULER)], { encoding: 'utf8' })
  } catch (e) { out = String(e.stdout || '') + String(e.stderr || '') }
  if (!/\d+ 条，红 \d+ 条/.test(out)) return { dead: true, reds: [], head: out.split('\n').slice(0, 3).join(' / ') }
  return { dead: false, reds: (out.match(/✗ [^\n]+/g) || []).map((s) => s.replace('✗ ', '').trim()) }
}

const PULL = '    this._pullTemplatesForPoster()'
const PICK = '      this._pullTemplatesForPicker()'

const CASES = [
  { name: '撤掉生成卡片那一屏的拉取', want: '⑩-1',
    apply: (d) => cut(d, IDX, `\n${PULL}`, '') },
  { name: '撤掉分享那一屏的拉取', want: '⑩-5',
    apply: (d) => cut(d, SHR, `\n${PICK}`, '') },
  { name: '给生成那一屏的拉取加 await（拿挡出图换早看到一套）', want: '⑩-2',
    apply: (d) => cut(d, IDX, PULL, '    await this._pullTemplatesForPoster()') },
  { name: '给分享那一屏的拉取加 await', want: '⑩-6',
    apply: (d) => cut(d, SHR, PICK, '      await this._pullTemplatesForPicker()') },
  { name: '拉到新名单顺手把眼前那一张重画了', want: '⑩-3',
    apply: (d) => cut(d, IDX, '      const list = poster.templateList()',
      '      const list = poster.templateList(); this._renderPoster()') },
  { name: '回执不认弹窗收没收（撤掉 templateOpen 那一道）', want: '⑩-4',
    apply: (d) => cut(d, IDX, '      if (!this.data.templateOpen) return done(rep)', '      // 撤了') },
  { name: '第一趟还在画就直接重排那一排（撤待办旗）', want: '⑩-7',
    apply: (d) => cut(d, SHR, 'this._pickerRerun = true', 'this._pickerBusy = false') },
  { name: '忙碌旗只置不收（renderPicker 收尾漏一句）', want: '⑩-8',
    apply: (d) => cut(d, SHR, '\n    this._pickerBusy = false', '') },
  { name: '分享那一屏拉到新名单顺手重画成品图', want: '⑩-9',
    apply: (d) => cut(d, SHR, '      if (!this._note) return done(rep)',
      '      if (!this._note) { this.render(); return done(rep) }') },
  { name: '撤掉单飞旗（连点两篇会并排发两趟）', want: '⑩-10',
    apply: (d) => cut(d, IDX, '    if (this._tplPulling) return Promise.resolve(null)', '    // 撤了') },
  { name: '名单一变就把当前选中那套跳掉', want: '⑩-11',
    apply: (d) => cut(d, IDX, '      const list = poster.templateList()',
      "      const list = poster.templateList(); this.setData({ posterTpl: 'card' })") },
  { name: '第三屏也挂上拉取（多一处没人补判据）', want: '⑩-12',
    apply: (d) => cut(d, 'miniprogram/pages/me/me.js', 'Page({', '// 有人在这里也挂了一次 posterTemplates.refresh()\nPage({') },
]

let bad = 0
CASES.forEach((c) => {
  const dir = mk()
  try {
    c.apply(dir)
  } catch (e) {
    console.log(`✗ ${c.name} → 刀没落下去：${e.message}`)
    bad++
    return
  }
  const r = run(dir)
  if (r.dead) { console.log(`✗ ${c.name} → 尺子在坏样本上跑崩了（不等于红）：${r.head}`); bad++; return }
  const hit = r.reds.find((x) => x.indexOf(c.want) === 0)
  if (hit) console.log(`✓ ${c.name} → 咬住了「${hit.slice(0, 26)}…」`)
  else { console.log(`✗ ${c.name} → 没红（期望 ${c.want}，实际红 ${r.reds.length} 条：${r.reds.join('；') || '无'}）`); bad++ }
})

const clean = run(mk())
if (clean.dead || clean.reds.length) {
  console.log(`✗ 没动过的那一份应当全绿，实际：${clean.dead ? '跑崩 ' + clean.head : clean.reds.join('；')}`)
  bad++
} else console.log('✓ 没动过的那一份全绿（这一把的每条红都只由那一刀造成）')

console.log(`${CASES.length + 1} 支，红 ${bad} 支`)
process.exit(bad ? 1 : 0)
