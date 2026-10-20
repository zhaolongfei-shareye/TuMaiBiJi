// 审计第一批那三条**客户端**的判据（#17 队列 id 类型／#7 上传 401 漏清解锁凭证／#16 图层值与死循环）。
//
// 三条共同点：都不报错。#17 是同一篇留两条、最后一条 PUT 顶掉刚出的那张；#7 是重登之后还留着
// 上一身份的解锁凭证，下一次读私密拿到一份裁过的空壳；#16 更狠——NaN 进 `fitSize` 是一条死循环，
// 直接把出图那一步的主线程打死，而 NaN 进图层是那一层静默不画。
//
// 反向对照走的是"把旧写法做成变异副本再跑一遍"：三条都是**同一条判据在旧实现下必须红**，
// 红在断言那一句上，不是红在 require 失败上。变异副本只落在 /tmp，跑完就删，工作树一个字不动。
//
// 跑法：node docs/工具/验-审计第一批客户端三条.js
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '../..')
const U = (m) => path.join(ROOT, 'miniprogram/utils', m)

const bad = []
const ck = (name, cond, got) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${got === undefined ? '' : `　→ ${JSON.stringify(got)}`}`)
  if (!cond) bad.push(name)
}

const STORE = {}
let LAST_UPLOAD_401 = false
global.wx = {
  getStorageSync: (k) => (k in STORE ? STORE[k] : ''),
  setStorageSync: (k, v) => { STORE[k] = v },
  removeStorageSync: (k) => { delete STORE[k] },
  uploadFile: ({ success }) => success({ statusCode: LAST_UPLOAD_401 ? 401 : 500, data: '{}' }),
  request: ({ success }) => success({ statusCode: 500, data: {} }),
  // `poster.js` 开局 require 了 `mpAssets.js`，那一支在模块顶层就要文件系统与 env。
  getFileSystemManager: () => ({ accessSync: () => true, unlinkSync: () => {}, readFileSync: () => '' }),
  env: { USER_DATA_PATH: '/u' },
}
const APP = { globalData: {} }
global.getApp = () => APP

// —— 变异副本：把某一行换回旧写法，另存一份 require 它 ——
// 副本必须落在**同目录**（`poster.js` 自己 require 了 `./palette.js` 那一族，挪到 /tmp 就找不到兄弟了）。
// 名字带前导点，跑完当场删；工作树一个字不动。
function 变异(file, from, to) {
  const src = fs.readFileSync(U(file), 'utf8')
  if (!src.includes(from)) throw new Error(`变异没打上（${file} 里找不到那一句）`)
  const p = path.join(ROOT, 'miniprogram/utils', `.变异-${file}`)
  fs.writeFileSync(p, src.replace(from, to))
  try {
    delete require.cache[require.resolve(p)]   // 同一个文件名会被用到两次，别吃到上一份缓存
    return require(p)
  } finally { fs.unlinkSync(p) }
}

console.log('\n———— ① #17 队列里同一篇只留一条，不管 id 是数还是字符串 ————')
const cardQueue = require(U('cardQueue.js'))
cardQueue.clear()
cardQueue.push(7, { file_id: 'cloud://a/old.jpg', tpl: 'classic' })
cardQueue.push('7', { file_id: 'cloud://a/new.jpg', tpl: 'ink' })   // 台账交回来的键是字符串
let left = cardQueue.take()
ck('数 7 与字符串 "7" 算同一篇，只留最新那一条',
  left.length === 1 && left[0].item.file_id === 'cloud://a/new.jpg', left.map((x) => x.item.file_id))
ck('落库那枚 id 归成数（与文件顶上 `{noteId:number}` 同一份口径）',
  typeof left[0].noteId === 'number', typeof left[0].noteId)
cardQueue.settle('7')
ck('settle 也认这种混型：摘得掉', cardQueue.take().length === 0, cardQueue.take().length)
cardQueue.push(0, { file_id: 'cloud://a/x.jpg' })
cardQueue.push('不是数', { file_id: 'cloud://a/y.jpg' })
ck('id 不是正数就不落队列（留着只会每次进前台白打一次）', cardQueue.take().length === 0)

const qOld = 变异('cardQueue.js',
  'const list = take().filter((x) => !(x && String(x.noteId) === String(id)))',
  'const list = take().filter((x) => !(x && x.noteId === noteId))')
qOld.clear()
qOld.push(7, { file_id: 'cloud://a/old.jpg', tpl: 'classic' })
qOld.push('7', { file_id: 'cloud://a/new.jpg', tpl: 'ink' })
ck('反向①：比对换回 `===`（旧写法）→ 同一篇留两条', qOld.take().length === 2, qOld.take().length)

console.log('\n———— ② #7 上传那支 401 也要清解锁凭证 ————')
const api = require(U('api.js'))
function 摆好身份() {
  APP.globalData = {
    token: 'T', userId: 'U', isLoggedIn: true, loginPromise: null,
    userInfo: { language: 'en' }, privateUnlock: { token: 'P', expireAt: Date.now() + 60000 },
  }
  APP.getLoginPromise = () => Promise.resolve()
}
LAST_UPLOAD_401 = true
摆好身份()
api.ingestScreenshots(['/x.jpg']).catch(() => {})
setTimeout(() => {
  ck('上传 401 之后解锁凭证被清掉（旧写法只清票与身份，漏这一格）',
    APP.globalData.privateUnlock === null, APP.globalData.privateUnlock)
  ck('语言那一格不跟着身份清（10-14 那句「切换中英文失效」的另一半）',
    APP.globalData.userInfo && APP.globalData.userInfo.language === 'en', APP.globalData.userInfo)
  ck('票与身份确实清了', APP.globalData.token === '' && APP.globalData.isLoggedIn === false)

  // 结构钉子：两处 401 走的是同一个函数——这才是"不会再漏一行"的那道保证。
  const src = fs.readFileSync(U('api.js'), 'utf8')
  // 数的是**调用点**（那一行整行只有这一句），别数"这个名字出现几次"——定义那一行也算一次。
  const calls = (src.match(/^\s*_dropAuthForRelogin\(app\)$/gm) || []).length
  ck('两个 401 分支调的是同一份清理（各写一遍迟早再漏一行）',
    calls === 2 && /function _dropAuthForRelogin\(app\)/.test(src), calls)

  console.log('\n———— ③ #16 fitSize 拿到 NaN 不许进那个循环 ————')
  const poster = require(U('poster.js'))
  let measured = 0
  const ctx = { font() {}, measureText: () => { measured += 1; return { width: 50 } } }
  const t0 = Date.now()
  const nanWant = poster.fitSize(ctx, '标题', 100, NaN, 20)
  const nanMaxW = poster.fitSize(ctx, '标题', NaN, 40, 20)
  const infFloor = poster.fitSize(ctx, '标题', 100, 40, Infinity)
  ck('三个入参各喂一次非有限数，都当场返回一个能读的数（旧写法是死循环）',
    [nanWant, nanMaxW, infFloor].every((s) => Number.isFinite(s) && s > 0), [nanWant, nanMaxW, infFloor])
  ck('而且没进那个循环（量字次数为 0；旧写法在这里永远出不来）', measured === 0, measured)
  ck('耗时看得出门槛：整趟 < 50ms', Date.now() - t0 < 50, `${Date.now() - t0}ms`)
  const ok1 = poster.fitSize(ctx, '标题', 100, 40, 20)
  ck('正常入参照旧收敛到 want 与 floor 之间', Number.isFinite(ok1) && ok1 <= 40 && ok1 >= 20, ok1)
  ck('循环自带 64 步上界（NaN 那一道是兜底，不是唯一保险）', /for \(let guard = 0; guard < 64; guard\+\+\)/.test(fs.readFileSync(U('poster.js'), 'utf8')))

  console.log('\n———— ④ #16 图层里的值也查（NaN／null／缺字段都要抛） ————')
  const d = { note: poster.SAMPLE_NOTE, profile: {}, lang: 'zh', hasAvatar: false }
  // 配方的一步长这样：`{emit:{k:op 名，其余每个字段是一个表达式}}`（`posterRecipe.js` 那张算子表），
  // 而闸门要求 `steps` 里必须有一步 let 出 height、且第一笔得是盖住整张卡的底（10-20 加的 N11）——
  // 不带上这两样，抛的是"配方不合格"，下面那几条会全部假绿（第一版就是这么绿的）。
  // 所以探针那一层前面垫一笔整幅底：被量的那一步落到 layers[1]，值那道闸门照样逐层查。
  const step = (fields) => ({
    id: 'probe', min_version: 1,
    steps: [{ let: 'height', value: 600 },
      { emit: { k: 'fill', x: 0, y: 0, w: { var: 'W' }, h: { var: 'height' }, color: '#fff' } },
      { emit: fields }],
  })
  const fill = (over) => Object.assign({ k: 'fill', x: 0, y: 0, w: 100, h: 50, color: '#fff' }, over)
  const threw = (recipe) => {
    try { poster.planFromRecipe(ctx, d, recipe); return false } catch (e) { return String(e.message) }
  }
  const good = step(fill())
  ck('正常那一层照旧过（新加的这道不许把好配方挡在门外）', good === false || threw(good) === false, threw(good))
  // 每条都验**是哪一句抛的**：只验"抛了"＝闸门自己坏了也能绿。
  ck('坐标是 NaN → 抛"不是有限数"，不是静默不画',
    /不是有限数/.test(String(threw(step(fill({ x: NaN }))))), threw(step(fill({ x: NaN }))))
  ck('尺寸是 Infinity → 抛', /不是有限数/.test(String(threw(step(fill({ w: Infinity }))))))
  ck('必填字段缺了 → 抛"缺字段"（`L.fill(undefined,…)` 今天也是静默不画）',
    /缺字段/.test(String(threw(step({ k: 'fill', y: 0, w: 100, h: 50, color: '#fff' })))),
    threw(step({ k: 'fill', y: 0, w: 100, h: 50, color: '#fff' })))
  ck('字段给了 null → 抛', /是 null/.test(String(threw(step(fill({ h: null }))))))
  const rrect = step({ k: 'rrect', x: 0, y: 0, w: 40, h: 20, r: 6 })
  ck('可选字段缺着不算错（`rrect` 的 stroke 那一类）', threw(rrect) === false, threw(rrect))
  ck('原语交回来的那一层也查（只在字面量那头查＝留了一条绕过的路）',
    /checkRecipeValues\(l\.k, l, where\)/.test(fs.readFileSync(U('poster.js'), 'utf8')))
  ck('反向④：把值那一道摘掉 → NaN 那一条变成"没抛"',
    (() => {
      const p = 变异('poster.js', "  checkRecipeValues(fields.k, fields, '配方')\n", '')
      try { p.planFromRecipe(ctx, d, step(fill({ x: NaN }))) } catch (e) { return false }
      return true
    })())

  console.log(`\n结果：红 ${bad.length} 条${bad.length ? '：' + bad.join('、') : ''}`)
  process.exitCode = bad.length ? 1 : 0
}, 300)
