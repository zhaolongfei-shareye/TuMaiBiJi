// H5（安卓那一头）换票这一层的静态自证：Z55（`uploadFile` 的 401 上限 + 失败回体带 statusCode）
// 与 Z68（`_dropAuthForRelogin` 不许拆掉「同一趟只登录一次」那枚闸，同小程序那一头 Z47 的一刀）。
//
// ⚠ 这一把是 H5 整层的**第一把尺子**（第十轮审计 §15.2 第 11 条「H5 整层 0 把」从这里开始还）。
// 它不是读源码：`js/storage.js`、`js/api.js`、`js/app.js` 三只真实字节送进 `node:vm`，
// 只有 `fetch` 是假的 ⇒ "换票打了几趟""重试有没有上限""抛出去那枚东西带不带 HTTP 码"全是数出来的。
// 假 `fetch` 之外只补浏览器那一层够不着的三样（`document` / `localStorage` / `Palette` 一类），
// 而且 `Palette`、`Router` 这些桩**只答接口不画界面**：这一把量的是换票，不是渲染。
//
// 它钉的四种坏法：
//   ① `uploadFile` 的 401 没有上限（Z55 原来那半）——票一死，截图导入那九张串行各起一条不收敛的递归；
//   ② `uploadFile` 非 2xx 抛裸回体（Z55 另半）——待补登记那一边按 `statusCode` 分「永久拒绝」与
//      「下次再试」，读到 undefined 就把 4xx 全当"下次再试"，队列里那些永远洗不掉；
//   ③ `_dropAuthForRelogin` 清掉 `loginPromise`（Z68）——N 个在飞的 401 各起一趟 `/v1/auth/guest`，
//      而那一口是 `30/hour` 的 IP 限流，一圈打满这台设备这一小时再也换不到票；
//   ④ 把 ③ 的"合法出口"也跟着拆了：`js/app.js` 的 `getLoginPromise()` 落定时要 `finally` 归 null，
//      退出登录 `clearSession()` 要归 null——少一处，要么闸永不松（第二次登录永不发生），要么人没了身份闸还锁着。
//
// 跑法：node docs/工具/验-H5换票闸与状态码-静态.js          正向，期望全过
//       node docs/工具/验-H5换票闸与状态码-静态.js --rev    反向：把 `app.loginPromise = null` 塞回去 → ③ 那组必红
//       node docs/工具/验-H5换票闸与状态码-静态.js --rev2   反向：撤掉 `uploadFile` 的 retryCount 上限 → ① 那组必红
//       node docs/工具/验-H5换票闸与状态码-静态.js --rev3   反向：`uploadFile` 改回抛裸回体 → ② 那组必红
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ROOT = path.resolve(__dirname, '../..')
const H5 = path.resolve(ROOT, '../TuMaiBiJi-H5')
const MODE = process.argv.includes('--rev') ? 'rev'
  : process.argv.includes('--rev2') ? 'rev2'
    : process.argv.includes('--rev3') ? 'rev3' : ''

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got !== undefined ? `　→ ${got}` : ''}`)
  if (!ok) bad.push(name)
}

const src = (rel, mut) => {
  const p = path.join(H5, rel)
  if (!fs.existsSync(p)) {
    console.error(`源码不在：${p}`)
    process.exit(2)
  }
  return mut ? mut(fs.readFileSync(p, 'utf8'), rel) : fs.readFileSync(p, 'utf8')
}

// ---------- 三处反向 mutation：只动被测那一句，别的一字不改 ----------
const mutate = (text) => {
  if (MODE === 'rev') {
    // ③ 把 Z68 那一刀撤掉：`app.isLoggedIn = false` 后面塞回 `app.loginPromise = null`
    return text.replace('  app.isLoggedIn = false\n',
      '  app.isLoggedIn = false\n  app.loginPromise = null\n')
  }
  if (MODE === 'rev2') {
    // ① 撤掉 uploadFile 的重试上限（**只**这一枚，`request`/`uploadBlob` 那两档不动）
    return text.replace('async function uploadFile(url, filePath, formData, retryCount) {',
      'async function uploadFile(url, filePath, formData, retryCount) { /* rev2: 上限作废 */')
      .replace('if (res.status === 401 && retryCount < 1) {', 'if (res.status === 401) {')
  }
  if (MODE === 'rev3') {
    // ② uploadFile 的失败出口改回抛裸回体（不带 statusCode）
    const at = text.indexOf('async function uploadFile')
    const end = text.indexOf('\n}\n', at)
    const body = text.slice(at, end)
    const washedOnce = body.replace('  const body = await res.json().catch(() => ({}))\n  const washed = await _washRes({ data: body })\n  throw _withStatus(washed.data || body, res.status)',
      '  const body = await res.json().catch(() => ({}))\n  throw body')
    return text.slice(0, at) + washedOnce + text.slice(end)
  }
  return text
}

const apiSrc = mutate(src('js/api.js'))
const appSrc = src('js/app.js')
const storageSrc = src('js/storage.js')

// ---------- 一个世界 = 一次全新的 vm 上下文 + 一份假 fetch 的账 ----------
// routes: { '<method> <path>': (n, headers) => ({ status, json }) }；path 已去掉 API_BASE 前缀，
// 查询串并进 path（`/api/notes/?skip=0&limit=20` 就整条当键），这样同名不同参能分开记账。
const API_BASE = 'https://api.agentsbin.cn/wtsj'
const CIRCUIT = 30

function world(routes) {
  const calls = []            // 每一发：{ key, n, auth, unlock }
  const store = {}            // localStorage
  const ctx = vm.createContext({
    console,
    setTimeout,
    Promise,
    URLSearchParams,
    Blob,
    atob,
    crypto,
    JSON,
    Math,
    Date,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: (k) => { delete store[k] },
    },
    document: {
      // 界面这一层不参与：只承认"有人来要过元素"，返回值一律 null（`_showLogin`/`applyTheme` 都判了 null）
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      get hidden() { return false },
    },
    FormData: class FormDataStub { append() {} },
    fetch: async (url, init) => {
      const p = String(url).replace(API_BASE, '')
      const key = `${init && init.method ? init.method : 'GET'} ${p}`
      const n = calls.filter((c) => c.key === key).length + 1
      calls.push({ key, n, auth: (init.headers || {})['Authorization'] || '', unlock: (init.headers || {})['X-Private-Token'] || '' })
      if (n > CIRCUIT) return { status: 500, json: async () => ({ detail: '尺子熔断：这条路径打超过 ' + CIRCUIT + ' 次' }) }
      const hit = routes[key]
      if (!hit) return { status: 500, json: async () => ({ detail: '尺子没配这一条：' + key }) }
      const r = await hit(n, init.headers || {})
      return { status: r.status, json: async () => r.json, blob: async () => new Blob(['x']) }
    },
  })
  ctx.window = ctx          // 浏览器里 window === globalThis，那几个文件都靠这一条
  ctx.globalThis = ctx
  const run = (code) => vm.runInContext(code, ctx)
  run(storageSrc)
  run(apiSrc)
  run(appSrc)
  // 只补接口不补界面的桩：app.js 里这几只都是"读一份配置"，换票那几条链不吃它们的返回值
  ctx.window.Palette = {
    themeOf: (k) => ({ key: k || 'default', cls: 'theme-default' }),
    themeOfWallpaper: (k) => ({ key: k || 'default', cls: 'theme-default' }),
    moodOf: () => ({ key: 'ink', cls: 'mood-ink', theme: 'default' }),
    moodOfWallpaper: () => ({ key: 'ink', cls: 'mood-ink', theme: 'default' }),
    moodNext: () => ({ key: 'ink', theme: 'default', cls: 'mood-ink' }),
    navFor: () => ({ face: '#ffffff', front: '#14161A' }),
    dimAt: () => ({ v: 0 }),
    setActiveTheme: () => {},
  }
  ctx.window.Router = { start: () => { ctx.__routerStart = (ctx.__routerStart || 0) + 1 } }
  ctx.window.Guest = { getNotes: async () => ({ items: [] }) }
  return { ctx, calls, store, Api: ctx.window.Api, App: ctx.window.App }
}

const count = (w, key) => w.calls.filter((c) => c.key === key).length
const ok200 = (body) => ({ status: 200, json: body })
const err = (status, detail) => ({ status, json: { detail } })

// 一套"登录后一切正常"的默认路由，各场景只覆盖自己要的那一条
const baseRoutes = (o) => Object.assign({
  'GET /v1/auth/session': () => ok200({ login: '', providers: ['guest'] }),
  'POST /v1/auth/guest': () => ok200({ token: 't-live', user_id: 'g1', nickname: '游客', login: '', language: 'zh', wallpaper: 'default' }),
  'GET /api/user/profile': () => ok200({ nickname: '站长', language: 'zh', wallpaper: 'default' }),
}, o)

// 把世界推到"已经登录、票是 live 那一把"
async function boot(w) {
  w.store.authToken = JSON.stringify('dead-token')
  w.store.authUserId = JSON.stringify('u1')
  await w.App.getLoginPromise()
  return w
}

async function main() {
  console.log(`H5 换票闸与状态码（模式：${MODE || '正向'}）`)
  console.log(`被测字节：${H5}/js/api.js　js/app.js　js/storage.js`)

  // ---------- A 组：`uploadFile`（Z55 的主现场＝截图导入那九张串行）----------
  {
    const w = world(baseRoutes({
      'POST /api/ingest/screenshots/stage': () => err(401, '凭证过期'),
    }))
    await boot(w)
    const rs = await Promise.allSettled([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) =>
      w.Api.uploadFile('/api/ingest/screenshots/stage', 'shot-' + i + '.png')))
    const stage = count(w, 'POST /api/ingest/screenshots/stage')
    const guest = count(w, 'POST /v1/auth/guest')
    const rejected = rs.filter((r) => r.status === 'rejected')
    const codes = rejected.map((r) => r.reason && r.reason.statusCode)
    ck('A1 九张串行全被 401 时，九条 promise 一律落回拒绝（不许有挂着的）',
      rejected.length === 9, `${rejected.length}/9`)
    ck('A2 抛出那枚东西带 statusCode=401（Z55 的另一半：待补登记靠它分永久拒绝）',
      codes.length === 9 && codes.every((c) => c === 401), JSON.stringify(codes))
    ck('A3 每票只重试一次：stage 那一口恰好 18 发（9 初发 + 9 重试）',
      stage === 18, `${stage} 发`)
    ck('A4 换票只一趟（Z68 这一头同样成立：九条 401 共用一枚在飞的登录）',
      guest === 1, `${guest} 发 /v1/auth/guest`)
    ck('A5 熔断没跳（没有任何路径打到 ' + CIRCUIT + ' 次以上）',
      w.calls.every((c) => c.n <= CIRCUIT), w.calls.map((c) => `${c.key}#${c.n}`).slice(0, 3).join(' '))
  }
  {
    // 反向证据必须先有正向读数：2xx 那一路真的能把回体交回来
    const w = world(baseRoutes({
      'POST /api/ingest/screenshots/stage': () => ok200({ batch_id: 'b-7', stored: 1 }),
    }))
    await boot(w)
    const r = await w.Api.uploadFile('/api/ingest/screenshots/stage', 'shot-0.png')
    ck('A6 正向读数：2xx 时 uploadFile 原样交出回体（尺子不是永远红）',
      r && r.batch_id === 'b-7', JSON.stringify(r))
  }
  {
    // 403：明确拒绝 ⇒ 一票不许换，且 statusCode 要能读出来
    const w = world(baseRoutes({
      'POST /api/ingest/screenshots/stage': () => err(403, '这一篇不是你的'),
    }))
    await boot(w)
    const e = await w.Api.uploadFile('/api/ingest/screenshots/stage', 'x.png').then(() => null, (x) => x)
    ck('A7 403 不换票（`/v1/auth/guest` 零发）',
      count(w, 'POST /v1/auth/guest') === 0, `${count(w, 'POST /v1/auth/guest')} 发`)
    ck('A8 403 只打一次（非 2xx 不重试）',
      count(w, 'POST /api/ingest/screenshots/stage') === 1, `${count(w, 'POST /api/ingest/screenshots/stage')} 发`)
    ck('A9 403 的 statusCode 与那句中文原样带到调用方',
      e && e.statusCode === 403 && e.detail === '这一篇不是你的', JSON.stringify(e))
  }
  {
    // friendlyDetail 那一洗：非中文的服务端话不许上屏
    const w = world(baseRoutes({
      'POST /api/ingest/screenshots/stage': () => err(422, 'File not found'),
    }))
    await boot(w)
    const e = await w.Api.uploadFile('/api/ingest/screenshots/stage', 'x.png').then(() => null, (x) => x)
    ck('A10 英文话术洗成空串、但 statusCode 留着（422 也是永久拒绝）',
      e && e.statusCode === 422 && e.detail === '', JSON.stringify(e))
  }

  // ---------- B 组：`request` 的 401 去重闸（Z68 的正现场）----------
  {
    const w = world(baseRoutes({
      'GET /api/notes/?skip=0&limit=20': () => err(401, '凭证过期'),
    }))
    await boot(w)
    const rs = await Promise.allSettled([0, 1, 2, 3, 4, 5, 6, 7, 8].map(() => w.Api.getNotes(0, 20)))
    const notes = count(w, 'GET /api/notes/?skip=0&limit=20')
    const guest = count(w, 'POST /v1/auth/guest')
    ck('B1 九条并发 401 只换一趟票（Z68：闸在 `_dropAuthForRelogin` 里不许被拆）',
      guest === 1, `${guest} 发 /v1/auth/guest`)
    ck('B2 每条最多重试一次：notes 恰好 18 发', notes === 18, `${notes} 发`)
    ck('B3 九条全部落定（换票成功后重试拿到 401 ⇒ 带码拒绝，不许挂着）',
      rs.every((r) => r.status === 'rejected' && r.reason.statusCode === 401), `${rs.filter((r) => r.status === 'rejected').length}/9 拒`)
    ck('B4 重试那一发手里是新票（旧死票不许原样再打一次）',
      w.calls.some((c) => c.key === 'GET /api/notes/?skip=0&limit=20' && c.n === 10 && c.auth === 'Bearer t-live'),
      (w.calls.find((c) => c.key === 'GET /api/notes/?skip=0&limit=20' && c.n === 10) || {}).auth)
  }
  {
    // 闸松不松：登录落定后第二次、第三次换票还得能起来（`finally` 那一格）
    const w = world(baseRoutes({
      'GET /api/notes/?skip=0&limit=20': (n) => (n % 2 === 1 ? err(401, '凭证过期') : ok200({ items: [], total: 0 })),
    }))
    await boot(w)
    const g0 = count(w, 'POST /v1/auth/guest')
    const a = await w.Api.getNotes(0, 20)
    w.App.globalData.token = 'dead-token-2'
    const b = await w.Api.getNotes(0, 20)
    ck('B5 闸会松：第一次换票之后再来一次 401，还能再换到票（`finally` 归 null 那一格还在）',
      a.total === 0 && b.total === 0 && count(w, 'POST /v1/auth/guest') === g0 + 2,
      `换票累计 ${count(w, 'POST /v1/auth/guest') - g0} 发（本轮 2 条 401）`)
  }
  {
    // 票死透（换票也 401）时：`request` 不能把人挂在半路，也不能反复开新游客号
    const w = world(baseRoutes({
      'GET /api/notes/?skip=0&limit=20': () => err(401, '凭证过期'),
      'POST /v1/auth/guest': () => err(401, '限流'),
    }))
    await boot(w)
    const rs = await Promise.allSettled([0, 1, 2, 3].map(() => w.Api.getNotes(0, 20)))
    ck('B6 换票本身失败时：四条都落定，且只起一趟换票',
      rs.every((r) => r.status === 'rejected') && count(w, 'POST /v1/auth/guest') === 1,
      `${count(w, 'POST /v1/auth/guest')} 发换票，${rs.filter((r) => r.status === 'rejected').length}/4 拒`)
  }

  // ---------- C 组：`uploadBlob` 同一枚上限 ----------
  {
    const w = world(baseRoutes({
      'POST /api/storage/card': () => err(401, '凭证过期'),
    }))
    await boot(w)
    const e = await w.Api.uploadCardImage(7, 'data:image/png;base64,aGVhZA==').then(() => null, (x) => x)
    ck('C1 uploadBlob 那一档也带 statusCode（三条 401 出口同一口径）',
      e && e.statusCode === 401, JSON.stringify(e))
    ck('C2 uploadBlob 每票一次：card 恰好 2 发', count(w, 'POST /api/storage/card') === 2, `${count(w, 'POST /api/storage/card')} 发`)
  }
  {
    const w = world(baseRoutes({
      'POST /api/storage/card': () => err(413, '配额已满'),
    }))
    await boot(w)
    const e = await w.Api.uploadCardImage(7, 'data:image/png;base64,aGVhZA==').then(() => null, (x) => x)
    ck('C3 413 不换票、不重试，且那句中文带出来（队列靠它摘掉永久拒绝）',
      count(w, 'POST /v1/auth/guest') === 0 && count(w, 'POST /api/storage/card') === 1
      && e && e.statusCode === 413 && e.detail === '配额已满',
      `${e && e.statusCode}/${e && e.detail}`)
  }

  // ---------- D 组：结构（给上面三组的"为什么"留一枚精确靶）----------
  {
    // 只看代码，不看注释：Z55/Z68 那两段说明里**故意**引了被撤掉的那两句原话，
    // 连着数就会把"这里原来有一行 `app.loginPromise = null`"当成代码里的这一行。
    const apiCode = apiSrc.replace(/\/\/[^\n]*/g, '')
    const at = apiCode.indexOf('function _dropAuthForRelogin')
    const drop = apiCode.slice(at, apiCode.indexOf('\n}', at))
    ck('D1 `_dropAuthForRelogin` 的代码里没有 `loginPromise` 那一行（Z68）',
      at >= 0 && !/loginPromise/.test(drop), `${drop.split('\n').length} 行函数体`)
    ck('D2 清理仍然带 `privateUnlock`（重登可能是另一个 generation）',
      /app\.privateUnlock = null/.test(drop), '')
    ck('D3 清理仍然抹本机那两把（`authToken`/`authUserId`）',
      /Storage\.remove\('authToken'\)/.test(drop) && /Storage\.remove\('authUserId'\)/.test(drop), '')
    const capped = (apiCode.match(/retryCount >= 1|retryCount < 1/g) || []).length
    ck('D4 三条 401 出口都带上限（`request`/`uploadFile`/`uploadBlob`＝3 处）',
      capped === 3, `${capped} 处`)
    const appCode = appSrc.replace(/\/\/[^\n]*/g, '')
    ck('D5 `getLoginPromise()` 落定时自己把闸归 null（合法出口①）',
      /loginPromise = this\._doLogin\(\)\.finally/.test(appCode) && /App\.globalData\.loginPromise = null/.test(appCode), '')
    ck('D6 `clearSession()` 仍把闸归 null（合法出口②：身份没了）',
      /this\.globalData\.loginPromise = null/.test(appCode), '')
  }

  console.log('')
  console.log(`合计：${bad.length === 0 ? '全过' : '红 ' + bad.length + ' 条'}`)
  if (bad.length) bad.forEach((n) => console.log(`  ✗ ${n}`))
  process.exit(bad.length ? 1 : 0)
}

main().catch((e) => { console.error('尺子自己崩了：', e && e.stack ? e.stack : e); process.exit(3) })
