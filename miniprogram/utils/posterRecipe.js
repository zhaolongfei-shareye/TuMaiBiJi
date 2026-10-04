// ---------------------------------------------------------------- 配方解释器
//
// 一份配方就是一段纯 JSON：{ id, min_version, steps: [...] }。步型只有六种
// （let / emit / emitOne / emitMany / if / each），表达式只有下面算子表里那些，
// 要量文字的排版动作由外面注入的「原语」做——配方只能挑名字、填参数，不能带代码。
//
// 为什么是解释器而不是"下发 JS 代码"：微信《关于禁止小程序 JavaScript 解释器使用规范》
// 禁止用内置解释器跑远程下发的代码（eval5 / estime / evil-eval 那一类，2022-07-06 起审核执行），
// 允许下发的只有数据。所以下面每一处求值都是手工走树：没有 eval、没有 new Function、
// 没有任何把字符串当代码执行的地方。
//
// 抛错是故意的：名单外的名字一律当场抛。配方写错一个算子，要变成"这张卡画不出来、
// 退回包内那一份"，而不是"少画一层、用户看见一张缺了东西的卡"。
// 数组是"逐项求值后交回一个数组"（行的列表、坐标列表都靠它）；
// 只有渐变色标、网点框那种"解释器不许碰内容、原样交给绘制层"的复合数据才包在 `{"lit": ...}` 里。
const VERSION = 1

// 算术：-1 是变长（'+ - * min max' 都按 JS 里的写法一路连着算，`a + b + c` 不用套三层）。
// 非整数结果照原样留着——画布坐标本来就允许小数，取不取整是配方自己的事（用 round）。
const ARITH = { '+': -1, '-': -1, '*': -1, '/': 2, '%': 2, min: -1, max: -1, round: 1, floor: 1, ceil: 1, abs: 1, neg: 1 }
const LOGIC = { '<': 2, '<=': 2, '>': 2, '>=': 2, '==': 2, '!=': 2, and: -1, or: -1, not: 1, len: 1, truthy: 1 }
const STEPS = ['let', 'do', 'emit', 'emitOne', 'emitMany', 'if', 'each']

function describe(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return '数组'
  const ty = typeof v
  if (ty === 'object') return '对象'
  if (ty === 'string') return `「${v}」`
  return String(v)
}

// 项的形状。求值和静态检查共用这一份，免得两条路各认一套写法。
function shape(t) {
  if (t === null || typeof t === 'number' || typeof t === 'string' || typeof t === 'boolean') return { kind: 'lit', v: t }
  if (typeof t !== 'object') return { kind: 'err', e: `不成形的值（${describe(t)}）` }
  if (Array.isArray(t)) return { kind: 'list', v: t }
  if (t.prim !== undefined) {
    if (typeof t.prim !== 'string') return { kind: 'err', e: 'prim 得是个名字' }
    const extra = Object.keys(t).filter((k) => k !== 'prim' && k !== 'args')
    if (extra.length) return { kind: 'err', e: `原语那一项里多了 ${extra.join('、')}` }
    const args = t.args === undefined ? {} : t.args
    if (args === null || typeof args !== 'object' || Array.isArray(args)) return { kind: 'err', e: `原语「${t.prim}」的 args 得是个对象` }
    return { kind: 'prim', name: t.prim, args }
  }
  const keys = Object.keys(t)
  if (keys.length !== 1) return { kind: 'err', e: `只能有一个键，这里有 ${keys.length} 个：${keys.join('、')}` }
  return { kind: 'op', name: keys[0], a: t[keys[0]] }
}

function lookup(scope, path) {
  if (typeof path !== 'string' || !path) throw new Error(`变量名得是个非空字符串，拿到 ${describe(path)}`)
  let cur = scope
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return null
    // 只认自有的键：`note.constructor`、`x.__proto__` 这类原型链上的东西一律当没有。
    // 配方是外来的数据，能顺着原型链摸到函数对象就等于摸到了代码执行面，这条路要堵死。
    if (!Object.prototype.hasOwnProperty.call(cur, seg)) return null
    cur = cur[seg]
  }
  return cur === undefined ? null : cur
}

function num(v, where) {
  // 只有真的算得出数才往下走：配方里写错一个变量名会读到 null，
  // Number(null) 是 0，不拦就成了"少 0 个像素"的静默错位。undefined 才 NaN。
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) throw new Error(`${where}: 要一个数，拿到 ${describe(v)}`)
  return n
}

function arity(name, want, got, where) {
  if (want >= 0 && got !== want) throw new Error(`${where}: 算子「${name}」要 ${want} 个参数，给了 ${got} 个`)
  // 变长算子至少得有一个：`{"+": []}` 会 reduce 成 0，那是"坐标掉回原点"，不是"没加"
  if (want < 0 && got < 1) throw new Error(`${where}: 算子「${name}」至少要一个参数`)
}

function callOp(name, a, env, scope, where) {
  if (name === 'var') {
    // 根名字必须在场：写错一个变量名要立刻抛，不能让它当成 null 往下算——
    // Number(null) 是 0，那就成了"少 0 个像素"的静默错位。
    const root = String(a).split('.')[0]
    if (!Object.prototype.hasOwnProperty.call(scope, root)) throw new Error(`${where}: 还没算出变量「${a}」`)
    return lookup(scope, a)
  }
  if (name === 'lit') return a
  if (name === 'if') {
    if (!Array.isArray(a) || a.length !== 3) throw new Error(`${where}: if 要 [条件, 真, 假] 三个参数`)
    return truthy(ev(a[0], env, scope, `${where} if`)) ? ev(a[1], env, scope, `${where} if`) : ev(a[2], env, scope, `${where} if`)
  }
  const args = (Array.isArray(a) ? a : [a]).map((x, i) => ev(x, env, scope, `${where} ${name}[${i}]`))
  if (ARITH[name] !== undefined) {
    arity(name, ARITH[name], args.length, where)
    const n = args.map((x) => num(x, `${where} ${name}`))
    switch (name) {
      case '+': return n.reduce((x, y) => x + y)
      case '-': return n.reduce((x, y) => x - y)
      case '*': return n.reduce((x, y) => x * y)
      case '/': return n[0] / n[1]
      case '%': return n[0] % n[1]
      case 'min': return Math.min(...n)
      case 'max': return Math.max(...n)
      case 'round': return Math.round(n[0])
      case 'floor': return Math.floor(n[0])
      case 'ceil': return Math.ceil(n[0])
      case 'abs': return Math.abs(n[0])
      default: return -n[0]
    }
  }
  if (LOGIC[name] !== undefined) {
    arity(name, LOGIC[name], args.length, where)
    switch (name) {
      case '<': return args[0] < args[1]
      case '<=': return args[0] <= args[1]
      case '>': return args[0] > args[1]
      case '>=': return args[0] >= args[1]
      case '==': return args[0] === args[1]
      case '!=': return args[0] !== args[1]
      case 'and': return args.every(truthy)
      case 'or': return args.some(truthy)
      case 'not': return !truthy(args[0])
      case 'len': return Array.isArray(args[0]) ? args[0].length : String(args[0] == null ? '' : args[0]).length
      default: return truthy(args[0])
    }
  }
  throw new Error(`${where}: 不认的算子「${name}」`)
}

function truthy(v) {
  if (v === null || v === undefined || v === '' || v === false) return false
  if (typeof v === 'number') return v !== 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

function ev(term, env, scope, where) {
  const s = shape(term)
  if (s.kind === 'err') throw new Error(`${where}: ${s.e}`)
  if (s.kind === 'lit') return s.v
  if (s.kind === 'list') return s.v.map((x, i) => ev(x, env, scope, `${where}[${i}]`))
  if (s.kind === 'prim') return env.callPrim(s.name, s.args, scope)
  return callOp(s.name, s.a, env, scope, where)
}

// 步的形状。`let` 是唯一带两个键的步型（变量名和它的值本来就是一件事的两半），
// 其余一步一个键。求值和静态检查共用这一份。
function stepShape(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { err: '一步得是个对象' }
  if (raw.let !== undefined) {
    const extra = Object.keys(raw).filter((k) => k !== 'let' && k !== 'value')
    if (extra.length) return { err: `let 那一步里多了 ${extra.join('、')}` }
    if (typeof raw.let !== 'string' || !raw.let) return { err: 'let 要给一个变量名' }
    if (!('value' in raw)) return { err: `let「${raw.let}」少了 value` }
    return { kind: 'let', name: raw.let, value: raw.value }
  }
  const keys = Object.keys(raw)
  if (keys.length !== 1) return { err: `一步只能有一个键，这里有 ${keys.length} 个：${keys.join('、')}` }
  const kind = keys[0]
  if (STEPS.indexOf(kind) < 0) return { err: `不认的步型「${kind}」，能用的是 ${STEPS.join('、')}` }
  return { kind, a: raw[kind] }
}

function runStep(step, env, scope, where) {
  const s = stepShape(step)
  if (s.err) throw new Error(`${where}: ${s.err}`)
  const kind = s.kind
  const a = s.a
  if (kind === 'let') {
    scope[s.name] = ev(s.value, env, scope, `${where} let ${s.name}`)
    return
  }
  if (kind === 'do') {
    // 只求值、不绑定：planner 里那句"先切到这一档字号，再按三元决定要不要量字"
    // 切字体在分支外面，配方得能原样记下这一步（逐层等价把每一次 ctx 写入都算进去了）。
    ev(a, env, scope, `${where} do`)
    return
  }
  if (kind === 'emit') {
    // 字段值全是表达式，先逐个求值再交给外面那层构造真图层；`k` 是 op 名字，
    // 必须写死成字符串——允许它是表达式等于允许配方自己造 op 名。
    if (a === null || typeof a !== 'object' || Array.isArray(a)) throw new Error(`${where}: emit 要给一个图层对象`)
    if (typeof a.k !== 'string') throw new Error(`${where}: emit 少了 op 名（k）`)
    const fields = {}
    Object.keys(a).forEach((k) => { fields[k] = k === 'k' ? a[k] : ev(a[k], env, scope, `${where} ${a.k}.${k}`) })
    env.layers.push(env.buildLayer(fields))
    return
  }
  if (kind === 'emitOne' || kind === 'emitMany') {
    const v = ev(a, env, scope, `${where} ${kind}`)
    if (kind === 'emitOne') {
      env.layers.push(env.checkLayer(v, where))
      return
    }
    if (!Array.isArray(v)) throw new Error(`${where}: emitMany 要一个图层数组，拿到 ${describe(v)}`)
    v.forEach((l) => env.layers.push(env.checkLayer(l, where)))
    return
  }
  if (kind === 'if') {
    if (!truthy(ev(a.cond, env, scope, `${where} if`))) {
      if (a.else) runSteps(a.else, env, scope, `${where} else`)
      return
    }
    runSteps(a.then, env, scope, `${where} then`)
    return
  }
  // 循环：over 给数组，as 收元素，index 收序号（不给就不占名字）。
  // 要点那一段是"逐条 clip 再逐条落笔"，没有这一步就得把条数写死在配方里。
  const list = ev(a.over, env, scope, `${where} each`)
  if (!Array.isArray(list)) throw new Error(`${where}: each 的对象得是个数组，拿到 ${describe(list)}`)
  // 每轮一个新的内层 scope：循环体里 let 出来的东西不回写外层，
  // 否则第二轮会读到上一轮的数（要点那段每轮都要重算 y）。
  list.forEach((item, i) => {
    const inner = Object.assign({}, scope)
    inner[a.as] = item
    if (a.index) inner[a.index] = i
    runSteps(a.do, env, inner, `${where} each#${i + 1}`)
  })
}

function runSteps(steps, env, scope, where) {
  if (!Array.isArray(steps)) throw new Error(`${where}: steps 得是个数组`)
  steps.forEach((s, i) => runStep(s, env, scope, `${where} 第 ${i + 1} 步`))
}

// 静态检查：不执行，只走形状与名单。必须在执行之前跑完，因为它查的是
// "这一版客户端根本读不了的配方"和"跑起来才会踩到的死分支"——比如 if 的 else
// 里藏一个不认的 op，这一篇笔记恰好不走 else，错误就会溜到真机上线后才出现。
function scanTerm(t, allow, bad, where) {
  const s = shape(t)
  if (s.kind === 'err') { bad.push(`${where}: ${s.e}`); return }
  if (s.kind === 'lit') return
  if (s.kind === 'list') { s.v.forEach((x, i) => scanTerm(x, allow, bad, `${where}[${i}]`)); return }
  if (s.kind === 'prim') {
    if (!allow.primKeys[s.name]) { bad.push(`${where}: 原语「${s.name}」不在名单里`); return }
    Object.keys(s.args).forEach((k) => {
      if (allow.primKeys[s.name].indexOf(k) < 0) bad.push(`${where}: 原语「${s.name}」没有参数「${k}」，能用的是 ${allow.primKeys[s.name].join('、')}`)
    })
    Object.keys(s.args).forEach((k) => scanTerm(s.args[k], allow, bad, `${where} ${s.name}.${k}`))
    return
  }
  const name = s.name
  if (name === 'var' || name === 'lit') {
    if (name === 'var' && (typeof s.a !== 'string' || !s.a)) bad.push(`${where}: var 得是个名字`)
    return
  }
  if (name === 'if') {
    if (!Array.isArray(s.a) || s.a.length !== 3) { bad.push(`${where}: if 要 [条件, 真, 假] 三个参数`); return }
    s.a.forEach((x, i) => scanTerm(x, allow, bad, `${where} if[${i}]`))
    return
  }
  if (ARITH[name] !== undefined || LOGIC[name] !== undefined) {
    const want = ARITH[name] !== undefined ? ARITH[name] : LOGIC[name]
    const args = Array.isArray(s.a) ? s.a : [s.a]
    if (want >= 0 && args.length !== want) bad.push(`${where}: 算子「${name}」要 ${want} 个参数，给了 ${args.length} 个`)
    if (want < 0 && args.length < 1) bad.push(`${where}: 算子「${name}」至少要一个参数`)
    args.forEach((x, i) => scanTerm(x, allow, bad, `${where} ${name}[${i}]`))
    return
  }
  bad.push(`${where}: 不认的算子「${name}」`)
}

function scanSteps(steps, allow, bad, where) {
  if (!Array.isArray(steps)) { bad.push(`${where}: steps 得是个数组`); return }
  steps.forEach((raw, i) => {
    const at = `${where} 第 ${i + 1} 步`
    const s = stepShape(raw)
    if (s.err) { bad.push(`${at}: ${s.err}`); return }
    const kind = s.kind
    const a = s.a
    if (kind === 'let') { scanTerm(s.value, allow, bad, `${at} ${s.name}`); return }
    if (kind === 'do') { scanTerm(a, allow, bad, `${at} do`); return }
    if (kind === 'emit') {
      if (a === null || typeof a !== 'object' || Array.isArray(a)) { bad.push(`${at}: emit 要给一个图层对象`); return }
      const op = a.k
      if (!allow.opKeys[op]) { bad.push(`${at}: 绘制 op「${op === undefined ? '（没写 k）' : op}」不在名单里`); return }
      Object.keys(a).forEach((k) => {
        if (k === 'k') return
        if (allow.opKeys[op].indexOf(k) < 0) bad.push(`${at}: op「${op}」没有字段「${k}」，能用的是 ${allow.opKeys[op].join('、')}`)
        scanTerm(a[k], allow, bad, `${at} ${op}.${k}`)
      })
      return
    }
    if (kind === 'emitOne' || kind === 'emitMany') { scanTerm(a, allow, bad, `${at} ${kind}`); return }
    if (kind === 'if') {
      if (a === null || typeof a !== 'object') { bad.push(`${at}: if 要给 {cond, then, else}`); return }
      scanTerm(a.cond, allow, bad, `${at} if.cond`)
      scanSteps(a.then, allow, bad, `${at} if.then`)
      if (a.else) scanSteps(a.else, allow, bad, `${at} if.else`)
      Object.keys(a).forEach((k) => { if (['cond', 'then', 'else'].indexOf(k) < 0) bad.push(`${at}: if 项里多了 ${k}`) })
      return
    }
    if (a === null || typeof a !== 'object') { bad.push(`${at}: each 要给 {over, as, index, do}`); return }
    scanTerm(a.over, allow, bad, `${at} each.over`)
    if (typeof a.as !== 'string' || !a.as) bad.push(`${at}: each 少了 as`)
    scanSteps(a.do, allow, bad, `${at} each.do`)
    Object.keys(a).forEach((k) => { if (['over', 'as', 'index', 'do'].indexOf(k) < 0) bad.push(`${at}: each 项里多了 ${k}`) })
  })
}

// 返回错误清单（空数组＝这份配方这个客户端读得懂）。写回接口、下发前、渲染前都用它。
function validate(recipe, allow) {
  const bad = []
  if (recipe === null || typeof recipe !== 'object' || Array.isArray(recipe)) return ['配方得是个 JSON 对象']
  if (typeof recipe.id !== 'string' || !recipe.id) bad.push('少了 id')
  const mv = recipe.min_version
  if (!Number.isInteger(mv) || mv < 1) bad.push('min_version 得是 ≥1 的整数')
  else if (mv > VERSION) bad.push(`这份配方要 ${mv} 版解释器，这份客户端只会读到 ${VERSION} 版`)
  if (!Array.isArray(recipe.steps) || !recipe.steps.length) bad.push('steps 得是非空数组')
  else {
    scanSteps(recipe.steps, allow, bad, 'steps')
    // 画布多高只有这一处能说：planFromRecipe 拿 scope.height 当成品高度，
    // 少这一步就是每张卡都塌成同一档，而那正是几何自检查得出的第一条。
    if (!recipe.steps.some((s) => s && typeof s === 'object' && s.let === 'height')) bad.push('steps 里必须有一步 let 出 height')
  }
  return bad
}

// env = { scope, prims: {name: {keys, call}}, opKeys, buildLayer, checkLayer, layers }
function planFromRecipe(recipe, env) {
  const primKeys = {}
  Object.keys(env.prims).forEach((n) => { primKeys[n] = env.prims[n].keys })
  const bad = validate(recipe, { opKeys: env.opKeys, primKeys })
  if (bad.length) throw new Error(`配方「${(recipe && recipe.id) || '?'}」不合格：${bad.join('；')}`)
  const scope = Object.assign({}, env.scope)
  runSteps(recipe.steps, env, scope, 'steps')
  const h = num(scope.height, 'height')
  if (!(h > 0)) throw new Error(`配方「${recipe.id}」算出的画布高度不合法：${h}`)
  return { width: env.width, height: h, layers: env.layers, template: recipe.id }
}

module.exports = { VERSION, ARITH, LOGIC, STEPS, planFromRecipe, validate, truthy, evalTerm: ev }
