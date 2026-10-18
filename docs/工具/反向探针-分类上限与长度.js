// 反向探针：拿**坏样本**去喂静态尺子 `验-分类上限与长度.js`，证明那三十一条不是假绿。
// 跑法：node docs/工具/反向探针-分类上限与长度.js
//
// 每一支都是"如果这一处写歪了，判据会不会红"。全咬＝每一支都能在红名单里看到它该咬的那一条；
// 哪一支没咬（绿色通过），说明那一支是假牙，尺子那一处得改。
//
// ⚠ 一律在**临时复制品**上动刀，仓库里那几个字是一个字都不改的——上一轮把 .probebak 直接落在工作树里，
//   与第二支 agent 的中途编辑撞过一次（见记忆「探针备份会覆盖并发编辑」）。
const fs = require('fs')
const os = require('os')
const path = require('path')
const cp = require('child_process')

const ROOT = path.resolve(__dirname, '../..')
const RULER = 'docs/工具/验-分类上限与长度.js'
const FILES = [
  'miniprogram/pages/index/index.js',
  'miniprogram/pages/index/index.wxml',
  'miniprogram/pages/index/index.wxss',
  'miniprogram/pages/detail/detail.wxss',
  'miniprogram/utils/i18n.js',
]

// 每支：名 / 动哪份文件 / 从什么改成什么 / 期望红的那一条判据（名字里的一段）
const PROBES = [
  { n: '话术里写死数（不走 {max}）', f: 'miniprogram/utils/i18n.js',
    from: `catMaxToast: '分类最多 {max} 个，先删掉一个才能加',`,
    to: `catMaxToast: '分类最多 8 个，先删掉一个才能加',`, want: '① 那两句话术里的数是递进去的' },
  { n: '上限改了数（8 → 7）', f: 'miniprogram/pages/index/index.js',
    from: 'const CAT_MAX = 8', to: 'const CAT_MAX = 7', want: '① 上限三个数各定义一次' },
  { n: '私密那一格能起拖（闸拆掉）', f: 'miniprogram/pages/index/index.js',
    from: '    if (this._catDraft[i].isPrivate) return\n', to: '', want: '④ 私密那一格不起拖' },
  { n: '芯片不裁（max-width 撤掉）', f: 'miniprogram/pages/index/index.wxss',
    from: '  display: block;\n  max-width: 150rpx;', to: '  display: block;', want: '⑦ 列表那一排的芯片有裁切三件套' },
  { n: '详情页跟着裁（hero-cat 补 max-width）', f: 'miniprogram/pages/detail/detail.wxss',
    from: '.hero-cat {', to: '.hero-cat { max-width: 150rpx;', want: '⑦ 详情页与详情窗那两处不裁' },
  { n: '管理态再沉一次（渲染顺序与草稿下标分叉）', f: 'miniprogram/pages/index/index.js',
    from: ';(this._catDraft || []).forEach', to: ';this._catSink(this._catDraft || []).forEach',
    want: '③ 反向钉：管理态那一支不许再沉第二次' },
  { n: '超长那几条静默吞字（不贴回框里）', f: 'miniprogram/pages/index/index.js',
    from: "catNewName: bad.join(' ')", to: `catNewName: ''`, want: '② 超长那几条' },
  { n: '占位话回 wxml 里三元现拼', f: 'miniprogram/pages/index/index.wxml',
    from: 'placeholder="{{catPh}}"', to: `placeholder="{{catView.length >= 8 ? '满 8 个' : '新增分类'}}"`,
    want: '① 占位话挂在 data 上' },
  { n: '那一排补一枚「新增」进去', f: 'miniprogram/pages/index/index.js',
    from: "    return out\n  },\n",
    to: "    out.push({ key: 'add', id: null, label: '新增', x: false, state: '', lock: '' })\n    return out\n  },\n",
    want: '⑤ 那一排只有「全部」' },
  { n: '「新增」那两档皮跟着回来', f: 'miniprogram/pages/index/index.wxss',
    from: '.ix-cat-t {', to: '.ix-cat.add { opacity: .4; }\n.ix-cat-t {', want: '⑤ 反向钉' },
  { n: '浮层落点搬回元素里面（不再现量页面坐标）', f: 'miniprogram/pages/index/index.wxml',
    from: 'class="ix-note" style="left:{{catNoteX}}px;top:{{catNoteY}}px"', to: 'class="ix-note"',
    want: '⑥ 浮层的落点现量' },
  { n: '那两句改回屏中央 toast', f: 'miniprogram/pages/index/index.js',
    from: "this._catAddNote(fmt(t('catMaxToast', lang), catLimits()))",
    to: "wx.showToast({ title: fmt(t('catMaxToast', lang), catLimits()), icon: 'none' })",
    want: '⑥ 两个落点各归各的元素' },
  { n: '拖动守卫回旧算式（屏上多一枚那一条）', f: 'miniprogram/pages/index/index.js',
    from: 'if (rects.length !== n || n < 2) return', to: 'if (rects.length < n + 1 || n < 2) return',
    want: '④ 拖动那一条线的下标基准' },
]

const SCAFFOLD = fs.mkdtempSync(path.join(os.tmpdir(), 'fanzhixiang-'))
const ORIGIN = {}
FILES.forEach((rel) => {
  const src = path.join(ROOT, rel)
  ORIGIN[rel] = fs.readFileSync(src, 'utf8')
  fs.mkdirSync(path.dirname(path.join(SCAFFOLD, rel)), { recursive: true })
})
fs.mkdirSync(path.dirname(path.join(SCAFFOLD, RULER)), { recursive: true })
fs.copyFileSync(path.join(ROOT, RULER), path.join(SCAFFOLD, RULER))
const reset = () => FILES.forEach((rel) => fs.writeFileSync(path.join(SCAFFOLD, rel), ORIGIN[rel]))
const runRuler = () => cp.spawnSync(process.execPath, [path.join(SCAFFOLD, RULER)], { encoding: 'utf8' })

const bitten = []
const dud = []
PROBES.forEach((p) => {
  reset()
  const body = fs.readFileSync(path.join(SCAFFOLD, p.f), 'utf8')
  const hits = body.split(p.from).length - 1
  if (hits !== 1) {
    dud.push(`${p.n} —— 探针无效：锚点在这一份里出现 ${hits} 次（要 1 次），这一支没喂进去`)
    return
  }
  fs.writeFileSync(path.join(SCAFFOLD, p.f), body.replace(p.from, p.to))
  const r = runRuler()
  const reds = (r.stdout || '').split('\n').filter((l) => l.trim().startsWith('✗'))
  const hit = reds.filter((l) => l.includes(p.want))
  if (hit.length) bitten.push(`${p.n} → 咬住「${p.want}」（这一趟共红 ${reds.length} 条）`)
  else dud.push(`${p.n} —— 尺子没红它该红的那条（期望「${p.want}」，实得红：${reds.map((x) => x.trim().slice(2)).join('／') || '无'}）`)
})

reset()
// 最后一趟：复制品还原成原样，确认这一把自始至终没碰坏判据本体。
const clean = runRuler()

fs.rmSync(SCAFFOLD, { recursive: true, force: true })

console.log(`反向探针（分类上限与长度）：${bitten.length} 支咬　${dud.length ? `没咬 ${dud.length} 支` : '全咬'}`)
bitten.forEach((x) => console.log('  ✓ ' + x))
dud.forEach((x) => console.log('  ✗ ' + x))
console.log(`还原后复跑：${clean.status === 0 ? '全绿（判据本体没动）' : `红：${(clean.stdout || '').trim()}`}`)
process.exit(dud.length || clean.status !== 0 ? 1 : 0)
