// 一把尺子：微信 showModal 的 confirmText / cancelText 官方上限是 4 个字符，
// 超出的部分会被静默截断（不报错、不提示），所以英文按钮尤其容易悄悄坏掉。
// 做法是把所有页面扫一遍，凡是 `confirmText: t('key', …)` / `cancelText: t('key', …)`
// 这种从 i18n 取值的，就要求那个键在**两种语言里都不超过 4 个字符**；
// 直接写死的字符串同样量。
//
// 为什么要有这份脚本：09-21 那次因为"英文只做了一半"把语言入口摘掉，其中一条就是
// Cancel / Delete / Keep it / Stop it 这四个全都超长。入口重新开放之前必须先量一遍，
// 以后再加弹窗按钮也照样过这把尺子。跑法：node docs/工具/验-弹窗按钮不超四字.js
const fs = require('fs')
const path = require('path')
const { i18n } = require('../../miniprogram/utils/i18n.js')

const ROOT = path.join(__dirname, '..', '..', 'miniprogram')
const CAP = 4

const files = []
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'utils') continue
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (name.endsWith('.js')) files.push(p)
  }
}
walk(path.join(ROOT, 'pages'))

const problems = []
let checked = 0
const RE = /(confirmText|cancelText)\s*:\s*(t\(\s*'([a-zA-Z0-9_]+)'\s*,|'([^']*)'|`([^`]*)`)/g

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  src.split('\n').forEach((line, i) => {
    if (/^\s*\/\//.test(line)) return
    let m
    RE.lastIndex = 0
    while ((m = RE.exec(line))) {
      const which = m[1]
      const rel = path.relative(ROOT, f)
      if (m[3]) {
        const key = m[3]
        checked++
        for (const lang of ['zh', 'en']) {
          const v = i18n[lang][key]
          if (v === undefined) {
            problems.push(`${rel}:${i + 1} ${which} 取的键 ${key} 在 ${lang} 里不存在`)
            continue
          }
          if (String(v).length > CAP) {
            problems.push(`${rel}:${i + 1} ${which}=${key} 的 ${lang} 值「${v}」有 ${String(v).length} 个字符，超了 ${CAP} 字上限`)
          }
        }
      } else {
        const v = m[4] != null ? m[4] : m[5]
        checked++
        if (String(v).length > CAP) {
          problems.push(`${rel}:${i + 1} ${which} 写死了「${v}」，${String(v).length} 个字符，超了 ${CAP} 字上限`)
        }
      }
    }
  })
}

console.log(`扫了 ${files.length} 个页面文件，量到 ${checked} 处弹窗按钮文案（两种语言各算一次）`)
problems.forEach((p) => console.log('  ✗ ' + p))
if (problems.length) {
  console.log(`\n${problems.length} 处不合格`)
  process.exit(1)
}
console.log('全部在 4 个字符以内')
