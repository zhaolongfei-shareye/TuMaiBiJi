/**
 * 一把尺子：`<textarea>` 是原生组件，CSS 不给宽时它按**固定 300px** 画，而这个 300px 不随屏宽缩放。
 * 站长 10-18 真机（屏比模拟器窄一档）在「编辑笔记」那一屏量到：摘要／要点两格 992px、
 * 标题／标签／分类三格 901px——两格宽出 91px 压在卡片右沿上被裁，字跑到边上像被切，就是他说的"页面错位"。
 * 模拟器 390 宽上 300px＋左右内边距正好等于内容区，所以这一刀在模拟器量不出来（真跑尺子看不见的那类）。
 *
 * 所以这一把不量屏，量源码：全仓每一个 `<textarea>` 都必须被某条规则钉住宽度，
 * 两种钉法都算数——`width: 100%`（配 `box-sizing: border-box`，只写前者会让内边距加在 100% 之外、更宽）
 * 或 `flex: …`＋`min-width: 0`（录入页那一格走的是这一条）。
 * 跑法：node docs/工具/验-原生框不许吃默认三百.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..', 'miniprogram')
const walk = (dir, out) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.wxml') || name.endsWith('.wxss')) out.push(p)
  }
  return out
}
const files = walk(ROOT, [])
const cssOf = (dir) => {
  const local = path.join(dir, path.basename(dir) + '.wxss')
  const out = [path.join(ROOT, 'app.wxss')]
  if (fs.existsSync(local)) out.push(local)
  // 页面自己 @import 进来的那几张（styles/*.wxss）也算这一页的规则
  for (const f of files) {
    if (!f.endsWith('.wxss') || out.includes(f)) continue
    const src = fs.existsSync(local) ? fs.readFileSync(local, 'utf8') : ''
    for (const m of src.matchAll(/@import\s+'([^']+)'/g)) {
      const abs = path.resolve(path.dirname(local), m[1])
      if (files.includes(abs)) out.push(abs)
    }
  }
  return out
}
const blocks = (sheet, cls) => {
  // 先把注释整段抹掉再切块：规则前面那段说明里也有 `}` 与 `/`，不抹就会把这一条规则整块读丢
  // （第一趟就这么假红过一次——改对了却报红）。
  const src = fs.readFileSync(sheet, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const hit = []
  // 不拿 `}` 当锚：上一处匹配的结尾正好吃掉下一条规则的引导 `}`，那样会**隔一条读一条**
  // （第一趟就这么把 `.field-area` 整条读丢了，红在三条本来好好的规则上）。
  const re = /([^{}@]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(src))) {
    const sel = m[1].trim()
    if (new RegExp('\\.' + cls + '(?![\\w-])').test(sel)) hit.push(m[2])
  }
  return hit
}

const problems = []
let checked = 0
for (const f of files) {
  if (!f.endsWith('.wxml')) continue
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(/<textarea\b[\s\S]*?\/?>/g)) {
    const clsAttr = (m[0].match(/class="([^"]+)"/) || [, ''])[1]
      .split(/[\s{}]+/).filter((s) => /^[a-zA-Z][\w-]*$/.test(s))
    const rel = path.relative(ROOT, f)
    checked++
    if (!clsAttr.length) { problems.push(`${rel}: 这一格 <textarea> 没挂 class，只能吃默认 300px`); continue }
    const sheets = cssOf(path.dirname(f))
    const ok = clsAttr.some((cls) => sheets.some((s) => blocks(s, cls).some((b) => {
      const w = /width\s*:\s*100%/.test(b) || (/flex\s*:/.test(b) && /min-width\s*:\s*0/.test(b))
      return w && /box-sizing\s*:\s*border-box/.test(b)
    })))
    if (!ok) {
      problems.push(`${rel}: <textarea class="${clsAttr.join(' ')}"> 找不到钉宽的规则`
        + `（要 \`width: 100%\` 或 \`flex\`＋\`min-width: 0\`，且都要配 \`box-sizing: border-box\`）`)
    }
  }
}

console.log(`量了 ${checked} 个 <textarea>`)
if (problems.length) {
  problems.forEach((p) => console.log('  红 ' + p))
  console.log(`\n${problems.length} 红 / ${checked} 量`)
  process.exit(1)
}
console.log(`0 红 / ${checked} 量 —— 每一格都被钉住宽，不会退回原生那个固定 300px`)
