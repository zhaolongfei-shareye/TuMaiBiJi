// 向上阴影全局一枚（站长 10-14 20:5x：「笔记列表和笔记卡片框框与背景之间有一点向上阴影，这个是对的，
// 要复制到其他页面，首屏，二屏，关于，设置等都要加上阴影，风格和高度全局一致。」）
// 不连模拟器，纯读文件。跑法：node docs/工具/验-向上阴影全局一枚.js
//
// 这一把只管四件事，每件都对应一种"屏上看不出来、下次改必漏改"的死法：
// ① **正本那一串数全站只存在一次**：投影写在 `app.wxss` 的 `--sh-lift`，页面里三处只写 `var(--sh-lift)`。
//    任何一页再抄一份字面量＝两份真相，下次调高度必漏改（他这句要的就是"全局一致"）。
// ② **三个落点都在**：列表页那张纸卡（正本，像素一个数不许变）、「我的」页那枚名片行（设置／关于两档
//    都住在它下面）、新建页那块通栏深色面板（首屏／二屏是同一枚元素的两个高度）。
//    少一处＝那一屏还是"贴"在背景上而不是"抬"起来，而他这句点名了四处。
// ③ **别被同屏另一档规则顶掉**：展开那一档（`.container.dock-open .stage-panel`）与铺图那一档
//    （`.container.has-bg .sheet`）都只改自己的属性；谁在那儿补一句 `box-shadow: none`，
//    同一屏两态就有阴影没阴影——静态读得出来，屏上要翻两屏才看得见。
// ④ **落点管得到他点的那两档**：「我的」那一页的设置与关于两块内容都排在 `.sheet` 之后。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const FILES = {
  app: 'app.wxss',
  ix: 'pages/index/index.wxss',
  me: 'pages/me/me.wxss',
  cr: 'pages/create/create.wxss',
  meWxml: 'pages/me/me.wxml',
}
const read = (rel) => fs.readFileSync(path.join(ROOT, 'miniprogram', rel), 'utf8')
const strip = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, '')
const blockOf = (src, sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`).exec(src)
  return m ? m[1] : ''
}
const declOf = (block, name) => {
  const m = new RegExp(`^\\s*${name}:\\s*([^;]*);`, 'm').exec(strip(block))
  return m ? m[1].trim() : null
}

// 正本那一串：10-09 起就挂在列表页那张纸卡身上，站长今天对着真屏说"这个是对的"。
const REF = '0 -12rpx 28rpx rgba(18, 20, 26, 0.16)'
// 一个令牌，三处消费。落点写"哪一屏"，红的时候不用再去对文件。
const SITES = [
  ['列表页那张纸卡（正本）', 'ix', '.sheet'],
  ['「我的」那枚名片行（设置／关于两档都在它下面）', 'me', '.sheet'],
  ['新建那块通栏深色面板（首屏／二屏同一枚元素）', 'cr', '.stage-panel'],
]

function evaluate(S) {
  const out = []
  const ck = (name, ok, got) => out.push({ name, ok: !!ok, got })
  const APP = strip(S.app)
  const liftAt = (site) => declOf(blockOf(strip(S[site[1]]), site[2]), 'box-shadow')

  /* ① 令牌本身 */
  const lift = declOf(blockOf(APP, 'page'), '--sh-lift')
  ck('`page{}` 里那一枚 `--sh-lift` 就是列表页正本那一串（逐字）', lift === REF, lift || '(没定义)')
  const copied = ['ix', 'me', 'cr'].filter((k) => strip(S[k]).includes(REF))
  ck('那串字面量全站只在 `app.wxss` 出现一次（页面里再抄一份＝两份真相，"全局一致"当场作废）',
    copied.length === 0, `又抄了一份的页面：${copied.join(',') || '无'}`)

  /* ② 三个落点 */
  SITES.forEach((site) => ck(`${site[0]}：那一条规则里吃的是 var(--sh-lift)`,
    liftAt(site) === 'var(--sh-lift)', liftAt(site) || '(没写 box-shadow)'))

  /* ③ 别被同屏另一档规则顶掉 */
  const open = blockOf(strip(S.cr), '.container.dock-open .stage-panel')
  ck('展开那一档（二屏）不许把阴影关掉：那一块里不许出现 box-shadow',
    !/box-shadow/.test(open), open.replace(/\s+/g, ' ').slice(0, 70) || '(这一块不在)')
  const band = blockOf(strip(S.me), '.container.has-bg .sheet')
  ck('铺图那一档（名片行换玻璃）也不许把阴影关掉', !/box-shadow/.test(band),
    band.replace(/\s+/g, ' ').slice(0, 70) || '(这一块不在)')

  /* ④ 落点管得到他点的那两档 */
  const w = S.meWxml
  const at = w.indexOf('class="sheet"')
  const setAt = w.indexOf('class="menu-group card"')
  const abtAt = w.indexOf('class="card about-lead"')
  ck('「我的」那一页：设置那一组与关于那一组都排在 `.sheet` 之后（一枚阴影管两档）',
    at > 0 && at < setAt && at < abtAt,
    `sheet@${at}／设置组@${setAt}／关于组@${abtAt}`)

  return out
}

/* ---------- 反向自证：每一刀都对应"屏上看不出来的一种静默失效" ---------- */
const KNIVES = [
  ['★删掉 `--sh-lift` 那一行（三处 var 全成 IACVT＝box-shadow 整条掉下来＝四屏一起没阴影）', 'app',
    (s) => s.replace(/^.*--sh-lift:.*\n/m, '')],
  ['★把正本那串抬高一点（页面里读到的还是 var，值已经悄悄漂了）', 'app',
    (s) => s.replace('--sh-lift: 0 -12rpx 28rpx', '--sh-lift: 0 -20rpx 44rpx')],
  ['★列表页那枚换回写死的一串（第二份真相，下次调必漏改）', 'ix',
    (s) => s.replace('box-shadow: var(--sh-lift);', `box-shadow: ${REF};`)],
  ['★「我的」那一枚撤掉（他点名的"关于、设置"两档没阴影）', 'me',
    (s) => s.replace('  box-shadow: var(--sh-lift);\n', '')],
  ['★新建那一枚撤掉（他点名的"首屏、二屏"没阴影）', 'cr',
    (s) => s.replace('  box-shadow: var(--sh-lift);\n', '')],
  ['★展开那一档补一句 `box-shadow: none`（同一屏两态有／没有，翻两屏才看得出来）', 'cr',
    (s) => s.replace('.container.dock-open .stage-panel {\n  top: calc(100vh - 666rpx);',
      '.container.dock-open .stage-panel {\n  box-shadow: none;\n  top: calc(100vh - 666rpx);')],
  ['★铺图那一档补一句 `box-shadow: none`（只在铺了形象图那一态掉阴影）', 'me',
    (s) => s.replace('.container.has-bg .sheet {\n  background: linear-gradient(180deg,',
      '.container.has-bg .sheet {\n  box-shadow: none;\n  background: linear-gradient(180deg,')],
]

const base = {}
Object.keys(FILES).forEach((k) => { base[k] = read(FILES[k]) })
const clean = evaluate(base)
const failed = clean.filter((r) => !r.ok)
clean.forEach((r) => console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.got !== undefined ? `　→ ${r.got}` : ''}`))
console.log(`\n正向：${clean.length - failed.length}/${clean.length} 条通过`)

const cleanRed = new Set(failed.map((r) => r.name))
let toothless = 0
KNIVES.forEach(([name, file, fn]) => {
  const mutated = Object.assign({}, base, { [file]: fn(base[file]) })
  if (mutated[file] === base[file]) { toothless++; console.log(`  ★刀没切进去（锚点漂了） ${name}`); return }
  const res = evaluate(mutated).filter((r) => !r.ok && !cleanRed.has(r.name))
  if (res.length === 0) { toothless++; console.log(`  ★没牙 ${name}`) }
  else console.log(`  ✓ 反向：${name}　→ 红 ${res.length} 条：${res.map((r) => r.name).join('；').slice(0, 70)}`)
})
console.log(`反向 ${KNIVES.length - toothless}/${KNIVES.length} 有牙`)
process.exit(failed.length === 0 && toothless === 0 ? 0 : 1)
