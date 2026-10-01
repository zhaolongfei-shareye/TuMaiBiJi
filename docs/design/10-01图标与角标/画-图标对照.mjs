// 生成一张候选图标对照页：同一支图在"纸面墨色"和"底栏深色面 纸白"两种地上、三档实际尺寸下各看一遍。
// 用法：node 画-图标对照.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const ICONS = path.join(DIR, 'icons')
const NAMES = [
  'plus', 'circle-plus', 'sparkles', 'pen-line', 'square-pen', 'notebook-pen',
  'library', 'library-big', 'book-open', 'scroll-text', 'file-text', 'notebook', 'list', 'rows-3', 'text-quote',
  'user-round', 'contact-round',
  'camera', 'image', 'images', 'link', 'chevron-right', 'layers', 'bookmark', 'hexagon',
]

const svg = (n, size, color) => {
  const raw = fs.readFileSync(path.join(ICONS, `${n}.svg`), 'utf8')
  return raw
    .replace(/<!--[\s\S]*?-->/, '')
    .replace(/width="24"\s+height="24"/, `width="${size}" height="${size}"`)
    .replace(/stroke="currentColor"/, `stroke="${color}"`)
    .replace(/\n\s+/g, ' ')
}

const rows = NAMES.map((n) => {
  const cells = [40, 52, 72].map((s) => {
    const ink = svg(n, s, '#241E16')
    const paper = svg(n, s, '#F2EFE9')
    return `<td>${ink}</td><td class="bar">${paper}</td>`
  }).join('')
  return `<tr><th>${n}</th>${cells}</tr>`
}).join('\n')

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>Lucide 候选 · 四档尺寸 × 两种地</title>
<style>
 body{font:14px/1.5 -apple-system,"PingFang SC",sans-serif;background:#e7e4dc;padding:36px;color:#1d1f20}
 table{border-collapse:collapse;background:#fff;box-shadow:0 12px 34px rgba(0,0,0,.12)}
 th,td{border:1px solid #ddd8cc;padding:10px 12px;text-align:center;font-weight:600}
 th{font-size:13px;text-align:left;white-space:nowrap;background:#f6f3ec}
 td.bar{background:#443A25}
 thead td{background:#efece4;font-size:12px}
</style></head><body>
<h2>Lucide 候选（ISC 授权，24 网格 / 圆头描边）· 40 与 52 是现网两档实际 px(=rpx)，72 是放大核对细节</h2>
<table><thead><tr><th>图标</th><th>40 纸</th><th>40 栏</th><th>52 纸</th><th>52 栏</th><th>72 纸</th><th>72 栏</th></tr></thead>
<tbody>${rows}</tbody></table></body></html>`

fs.writeFileSync(path.join(DIR, '图标对照.html'), html)
console.log('ok', NAMES.length)
