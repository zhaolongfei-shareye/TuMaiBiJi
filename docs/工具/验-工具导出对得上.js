// 每一句 `const { a, b } = require('./x.js')` 里的名字，x.js 真导出了吗（静态，零依赖）。
// 跑法：node docs/工具/验-工具导出对得上.js
//
// 为什么要有这一把（10-17 真机报「加载失败」之后补的）：列表合一那一屏按天分组要用
// `formatDate`，而 `utils/date.js` 里**这个函数一直就写着**（第 5 行），只是 `module.exports`
// 那行从建这个文件起就没把它列进去——于是屏上是一句没头没尾的 toast，源码里却"看起来一切都在"。
// 静态那 112 条判据全绿、真照片那把探针也全绿，因为它俩一个读源码文本、一个绕过了 `loadNotes()`。
// ⇒ 这一类"名字在文件里、不在出口里"的错，用眼睛扫是扫不出来的，只能机器把每一对 require 全点一遍名。
//
// 只量**具名解构**这一种形状（本项目 utils 全是 `module.exports = { ... }` 或 `exports.x =`）：
// · 整个模块接过去（`const poster = require('./poster.js')`）不查——那种写法拿到的是对象，
//   少哪个函数是调用点的事，静态这一层查了只会添假红；
// · 目标文件不在 `miniprogram/` 里（`app.js` 引 npm 包那种）跳过并念出来，不静默放过。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..', 'miniprogram')

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      walk(p, out)
    } else if (name.endsWith('.js')) {
      out.push(p)
    }
  }
  return out
}

// 剥掉注释再解析。**为什么必须剥**：`palette.js` 那个出口块里夹着一段中文注释，注释里有逗号，
// 按逗号切名字就会把"注释尾巴＋下一个真名字"当成一个名字 ⇒ 第一版这把尺子拿它报了个假红，
// 说 `catSkinFor` 没导出（它在第 990 行，好端端在出口里）。
// `//` 只在**它之前引号成对**时才当注释：不然 `'cloud://xxx'` 这种值会被从中间剪断。
function stripComments(src) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '')
  return noBlock.split('\n').map((line) => {
    let quote = null
    for (let i = 0; i < line.length - 1; i++) {
      const c = line[i]
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue }
      if (c === "'" || c === '"') { quote = c; continue }
      if (c === '/' && line[i + 1] === '/') return line.slice(0, i)
    }
    return line
  }).join('\n')
}

// 一个文件导出了哪些名字：`module.exports = { a, b, c: d }` 取键名，`exports.x =` 与
// `module.exports.x =` 也收（本项目目前只有第一种，多收两种是为了以后有人改写法时这把尺子不瞎）。
function exportedNames(rawSrc) {
  const src = stripComments(rawSrc)
  const set = new Set()
  for (const m of src.matchAll(/module\.exports\s*=\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.split(':')[0].trim()
      if (name) set.add(name)
    }
  }
  for (const m of src.matchAll(/(?:module\.)?exports\.(\w+)\s*=/g)) set.add(m[1])
  return set
}

const files = walk(ROOT)
const exportsOf = new Map()
for (const p of files) exportsOf.set(p, exportedNames(fs.readFileSync(p, 'utf8')))

const misses = []
const unknowns = []
let pairs = 0

for (const p of files) {
  const src = stripComments(fs.readFileSync(p, 'utf8'))
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m[2]
    if (!spec.startsWith('.')) continue
    const base = path.resolve(path.dirname(p), spec)
    const target = fs.existsSync(base) ? base
      : (fs.existsSync(base + '.js') ? base + '.js' : null)
    if (!target || !exportsOf.has(target)) {
      unknowns.push(`${path.relative(ROOT, p)} → ${spec}`)
      continue
    }
    const ex = exportsOf.get(target)
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(':')[0].trim()
      if (!name) continue
      pairs++
      if (!ex.has(name)) {
        misses.push(`${path.relative(ROOT, p)} 解构了 ${name}，但 ${path.relative(ROOT, target)} 没导出`)
      }
    }
  }
}

console.log(`点了 ${pairs} 对「解构名 ← 模块出口」，扫 ${files.length} 个 js`)
unknowns.forEach((u) => console.log(`  · 跳过（目标不在包内）：${u}`))
if (misses.length) {
  misses.forEach((x) => console.log(`  ✗ ${x}`))
  console.log(`\n验-工具导出对得上：未过 ${misses.length} 条`)
  process.exit(1)
}
console.log('  ✓ 每一句具名解构都在对方出口里')
console.log('\n验-工具导出对得上：全部通过')
