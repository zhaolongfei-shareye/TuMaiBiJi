// 审计工具：拿微信官方类型定义逐个核我们调用 wx.* 时传的参数名。
//
// 起因：真机报 `copyFile:fail parameter error: parameter.srcPath should be String
// instead of Undefined`——代码里写的是 filePath。开发者工具的替身不校验参数名，
// 所以模拟器里一路是绿的，只有真机才报错。这类错靠看代码很难发现，靠类型定义能一次扫干净。
//
// 类型定义从哪来（按顺序找）：环境变量 WX_TYPINGS → 项目里的 node_modules/miniprogram-api-typings
// → 开发者工具自带的那份。找不到就直接退出并说明，不猜。
//
// 用法：node docs/工具/核-微信接口参数名.js
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../../miniprogram')

function collect(dir, depth, out) {
  if (depth < 0 || !fs.existsSync(dir)) return
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) collect(p, depth - 1, out)
    else if (e.name === 'lib.wx.api.d.ts' && p.endsWith(path.join('lib', 'wx', 'lib.wx.api.d.ts'))) out.push(p)
  }
}

function findTypings() {
  if (process.env.WX_TYPINGS) return process.env.WX_TYPINGS
  const local = path.join(ROOT, 'node_modules/miniprogram-api-typings/types/wx/lib.wx.api.d.ts')
  if (fs.existsSync(local)) return local
  // 开发者工具自带一份，装在哪台机器的哪个哈希目录里不定，自己走一层找。
  // 它同时存了 fb_ts_*（兜底的旧版）和 ts_*（当前版）几份，旧那份里枚举值被写成 string[]，
  // 拿它当尺子会漏判取值，所以把所有候选都收上来，优先带版本号的 ts_ 那份、按版本从新到旧排。
  const base = path.join(process.env.HOME || '', 'Library/Application Support/微信开发者工具')
  if (!fs.existsSync(base)) return ''
  const cands = []
  for (const pkg of fs.readdirSync(base)) collect(path.join(base, pkg, 'WeappForeignPkgs'), 6, cands)
  const score = (f) => {
    const m = /\/(fb_)?ts_([\d.]+)_(\d+(?:\.\d+)+)\//.exec(f)
    if (!m) return -1
    return (m[1] ? 0 : 1e6) + Number(m[3].split('.').join('').padEnd(6, '0'))
  }
  cands.sort((a, b) => score(b) - score(a))
  return cands[0] || ''
}

const file = findTypings()
if (!file) {
  console.error('找不到微信 API 类型定义。装一个：npm i -D miniprogram-api-typings，或指定 WX_TYPINGS=<lib.wx.api.d.ts 路径>')
  process.exit(2)
}
const dts = fs.readFileSync(file, 'utf8')
console.log(`类型定义：${file}`)

// ---- 1) 切出每个 interface 的成员名（花括号配对，缩进不可信） ----
function bodyAt(open) {
  let depth = 0
  for (let i = open; i < dts.length; i++) {
    if (dts[i] === '{') depth++
    else if (dts[i] === '}') { depth--; if (!depth) return dts.slice(open + 1, i) }
  }
  return ''
}
const ifaces = new Map()
{
  const re = /interface\s+([A-Za-z0-9_]+)(<[^>]*>)?([^{]*)\{/g
  let m
  while ((m = re.exec(dts))) {
    const body = bodyAt(dts.indexOf('{', m.index))
    const keys = new Map()
    const kre = /(?:^|\n)\s*([A-Za-z_][\w]*)\??\s*:\s*([^;\n]+)/g
    let k
    while ((k = kre.exec(body))) keys.set(k[1], k[2])
    // 接口里还可能有方法（FileSystemManager 就是这一类：copyFile/accessSync 挂在实例上，
    // 不挂在 wx. 上）。顺手把"方法名 -> 它的 option 接口名"也存下来。
    const methods = new Map()
    const mre = /(?:^|\n)\s*([a-zA-Z][\w]*)\s*\(\s*(?:option|options|args)\s*\??\s*:\s*([A-Za-z0-9_]+)/g
    let mm2
    while ((mm2 = mre.exec(body))) methods.set(mm2[1], mm2[2])
    const ext = /\bextends\s*([A-Za-z0-9_, <]+)/.exec(m[3] || '')
    ifaces.set(m[1], { keys, methods, parents: ext ? ext[1].split(',').map((t) => t.trim().split('<')[0]) : [] })
  }
}
function membersOf(name, seen = new Set()) {
  const i = ifaces.get(name)
  if (!i || seen.has(name)) return new Map()
  seen.add(name)
  const out = new Map(i.keys)
  for (const p of i.parents) for (const [k, ty] of membersOf(p, seen)) if (!out.has(k)) out.set(k, ty)
  return out
}
// 类型标注里出现 'a' | 'b' 这种字面量，就是这个键只许填这几个值
const literalsOf = (typeText) => {
  if (!typeText) return null
  const hits = [...String(typeText).matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] || x[2])
  return hits.length ? new Set(hits) : null
}

// ---- 2) API 名 -> option 接口名（泛型 extends 优先，其次参数标注；允许声明换行） ----
const apiIface = new Map()
{
  const re = /^\s*([a-zA-Z][\w]*)\s*<([\s\S]{0,200}?)>\s*\(\s*(?:option|options|args)\s*\??\s*:\s*([A-Za-z0-9_]+)/gm
  let m
  while ((m = re.exec(dts))) {
    // 泛型约束里那个 extends 才是正主（`(option: T)` 光看参数名核不下去），
    // 但约束不一定指向接口——request 的泛型是 `T extends string | IAnyObject | ArrayBuffer`，
    // 照抄第一个词就把接口认成了 string，这个接口反而一条没核。所以要挑"确实是接口"的那个。
    const cands = [(/extends\s+([A-Za-z0-9_]+)/.exec(m[2]) || [])[1], m[3]].filter((n) => n && ifaces.has(n))
    if (cands.length && !apiIface.has(m[1])) apiIface.set(m[1], cands[0])
  }
  const re2 = /^\s*([a-zA-Z][\w]*)\s*\(\s*(?:option|options|args)\s*\??\s*:\s*([A-Za-z0-9_]+)/gm
  while ((m = re2.exec(dts))) if (ifaces.has(m[2]) && !apiIface.has(m[1])) apiIface.set(m[1], m[2])
}

// ---- 3) 抓代码里 wx.foo({ ... }) 的顶层键 ----
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}
function topLevelKeys(src, open) {
  const keys = []
  let depth = 0, inStr = null
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (inStr) { if (c === inStr && src[i - 1] !== '\\') inStr = null; continue }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue }
    if (c === '{' || c === '(' || c === '[') { depth++; continue }
    if (c === '}' || c === ')' || c === ']') { depth--; if (!depth) break; continue }
    if (depth !== 1) continue
    // 只有紧跟在 { 或 , 后面的标识符才算键名（否则 title: t('…') 里的 t 会被误当成键）
    const before = src.slice(0, i).replace(/\s+$/, '')
    if (!/[{,]$/.test(before)) continue
    const mm = /^([A-Za-z_][\w]*)\s*:/.exec(src.slice(i, i + 60))
    if (mm) {
      const colon = i + mm[0].length
      let d2 = 0, j = colon, str2 = null
      for (; j < src.length; j++) {
        const c2 = src[j]
        if (str2) { if (c2 === str2 && src[j - 1] !== '\\') str2 = null; continue }
        if (c2 === '"' || c2 === "'" || c2 === '`') { str2 = c2; continue }
        if ('([{'.includes(c2)) d2++
        else if (')]}'.includes(c2)) { if (!d2) break; d2-- }
        else if (c2 === ',' && !d2) break
      }
      keys.push({ key: mm[1], value: src.slice(colon, j).trim() })
      i = j - 1
    }
  }
  return [...new Map(keys.map((x) => [x.key, x])).values()]
}

const cache = new Map()
const allowOf = (iface) => { if (!cache.has(iface)) cache.set(iface, membersOf(iface)); return cache.get(iface) }
function checkKeys(api, iface, keys) {
  const allow = allowOf(iface)
  return keys.filter((x) => !allow.has(x.key) && !COMMON.has(x.key))
    .map((x) => `${api} 传了接口里没有的键 ${x.key}（接口 ${iface}）`)
}
function checkValues(api, keys, ifaceName) {
  const iface = ifaceName || apiIface.get(api)
  if (!iface) return []
  const allow = allowOf(iface)
  const out = []
  for (const x of keys) {
    const enum2 = literalsOf(allow.get(x.key))
    if (!enum2) continue
    const vals = [...String(x.value).matchAll(/'([^']+)'/g)].map((y) => y[1])
    if (!vals.length || !/^\[?'/.test(x.value)) continue
    for (const v of vals) if (!enum2.has(v)) out.push(`${api}.${x.key} 的值 '${v}' 不在允许的取值里（只能是 ${[...enum2].join(' | ')}）`)
  }
  return out
}

const calls = []
// 还有一类调用不挂在 wx. 上，而是先拿一个管理器再点方法——`wx.getFileSystemManager().copyFile({...})`
// 就是这一类，而真机上炸掉的正是它。上一版只扫 `wx.foo({...})`，等于把最该扫的那族整个漏过去了。
const RECEIVERS = { getFileSystemManager: 'FileSystemManager' }
for (const f of walk(ROOT)) {
  const src = fs.readFileSync(f, 'utf8')
  const line = (at) => src.slice(0, at).split('\n').length
  const re = /wx\.([a-zA-Z][\w]*)\s*\(\s*\{/g
  let m
  while ((m = re.exec(src))) {
    calls.push({
      file: path.relative(ROOT, f),
      line: line(m.index),
      api: m[1],
      keys: topLevelKeys(src, src.indexOf('{', m.index)),
    })
  }
  for (const [getter, ifaceName] of Object.entries(RECEIVERS)) {
    const r2 = new RegExp(`wx\\.${getter}\\(\\)\\.([a-zA-Z][\\w]*)\\s*\\(\\s*\\{`, 'g')
    while ((m = r2.exec(src))) {
      const meth = m[1]
      const holder = ifaces.get(ifaceName)
      calls.push({
        file: path.relative(ROOT, f),
        line: line(m.index),
        api: `${ifaceName}.${meth}`,
        iface: holder && holder.methods.get(meth),
        keys: topLevelKeys(src, src.indexOf('{', m.index)),
      })
    }
  }
}

const COMMON = new Set(['success', 'fail', 'complete'])

// ---- 4) 自检：先证明这把尺子能量出错，再拿它去量代码 ----
{
  const probe = 'wx.copyFile({ filePath: a, destPath: b })'
  const bad = topLevelKeys(probe, probe.indexOf('{'))
  const allow = membersOf(apiIface.get('copyFile'))
  const hit = bad.map((x) => x.key).filter((k) => !allow.has(k) && !COMMON.has(k))
  const probe2 = "wx.chooseMedia({ mediaType: ['images'] })"
  const valHit = checkValues('chooseMedia', topLevelKeys(probe2, probe2.indexOf('{')))
  // 第三个探针走的是 `wx.xxx().yyy({...})` 那条路：真机上炸的那处就在这条路上，
  // 只自检 `wx.yyy({...})` 等于没测。
  const fsm = ifaces.get('FileSystemManager')
  const copyIface = fsm && fsm.methods.get('copyFile')
  const probe3 = 'wx.getFileSystemManager().copyFile({ filePath: a, destPath: b })'
  const hit3 = checkKeys('FileSystemManager.copyFile', copyIface, topLevelKeys(probe3, probe3.indexOf('{')))
  if (!allow.has('srcPath') || hit[0] !== 'filePath' || !valHit.length || !copyIface || !hit3.length) {
    console.error(`自检失败：键名错=${hit.join('/')}，取值错=${JSON.stringify(valHit)}，实例方法=${JSON.stringify(hit3)}（三个都必须抓得到才算这把尺子有效）`)
    process.exit(3)
  }
  console.log('自检通过：故意写错的 filePath 在 wx.copyFile 和 getFileSystemManager().copyFile 两处都被抓到，mediaType: images 这种非法取值也被抓到')
}
const bad = []
const unresolved = new Set()
const covered = new Set()
for (const c of calls) {
  const iface = c.iface || apiIface.get(c.api)
  if (!iface || !ifaces.has(iface)) { unresolved.add(c.api); continue }
  if (!cache.has(iface)) cache.set(iface, membersOf(iface))
  covered.add(c.api)
  for (const msg of checkKeys(c.api, iface, c.keys).concat(checkValues(c.api, c.keys, iface))) bad.push(`✗ ${msg}  （${c.file}:${c.line}）`)
}
if (bad.length) console.log('\n' + bad.join('\n'))
console.log(`\n核了 ${covered.size} 个接口、${calls.length} 处调用；参数名对不上的 ${bad.length} 处`)
if (unresolved.size) console.log(`类型定义里没解析到 option 接口、这次没核到的：${[...unresolved].join(', ')}`)
process.exit(bad.length ? 1 : 0)
