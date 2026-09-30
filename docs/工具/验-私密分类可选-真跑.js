// 「设完密码就该看得到私密那一格」这条链路的真跑尺子（模拟器 + 现网后端）。
// 为什么要有：这条判据是分类名，格子由服务端在设密码时补出来（backend/app/api/routes/user.py
// 的 _ensure_private_category）。静态尺子只能证明"代码里有这个调用"，证不了
// "这个账号打开新建页真的选得到私密"——而那正是站长 09-30 报的原话。
// 跑法：
//   /Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
//       --project <仓库>/miniprogram --auto-port 9431
//   NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-私密分类可选-真跑.js
// 注意：这条尺子读的是模拟器那个账号的真实状态（它已经设过私密密码），
// 只读不写——不建笔记、不改密码，所以可以随时重跑。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')

const PORT = process.env.MP_PORT || 9431
const PRIVATE = '私密'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}

// 分类是异步拉的，读太早会拿到初始空数组——那会让下面每一条都假红。
async function poll(page, pick, timeoutMs = 20000) {
  const t0 = Date.now()
  let d = {}
  while (Date.now() - t0 < timeoutMs) {
    d = await page.data() || {}
    if (pick(d)) return d
    await sleep(1500)
  }
  return d
}

// 头一次 reLaunch 会撞上开发者工具那句 rawPath is null（页面元信息没就绪），
// connect 本身也可能赶上端口还没起来。两个都要重试，间隔照别的真跑尺子量出来的数走，
// 不然第一次跑永远假红。
async function relaunch(mp, route) {
  for (let i = 0; i < 5; i++) {
    try { return await mp.reLaunch(route) } catch (e) {
      console.log(`第 ${i + 1} 次进 ${route} 没成：${e.message}`)
      await sleep(8000)
    }
  }
  throw new Error(`进不去 ${route}`)
}

async function connect() {
  for (let i = 0; i < 6; i++) {
    try { return await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }) } catch (e) { await sleep(12000) }
  }
  throw new Error(`连不上自动化端口，先跑 cli auto --auto-port ${PORT}`)
}

async function until(mp, route, pick, timeoutMs = 20000) {
  await relaunch(mp, route)
  await sleep(1500)
  return poll(await mp.currentPage(), pick, timeoutMs)
}

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('尺子挂了（未处理拒绝）', e); process.exit(2) })
  const mp = await connect()
  try {
    // ---------- ① 新建页：展开录入条、切到"写字"，分类选择器里必须选得到私密 ----------
    // 分类是懒加载的：create.js 只在 open('write') 里调 loadCategories()，
    // 收起态去读 categoryNames 永远是空数组——那不是 bug，是还没走到那一支。
    await relaunch(mp, '/pages/create/create')
    await sleep(2500)
    const c0 = await mp.currentPage()
    // Page 对象上没有 tap，只有元素有（这一版 automator 实测）
    const bar = await c0.$('.bar')
    ck('录入条在页面上找得到（收起态点它=直接进"写字"）', !!bar)
    if (bar) await bar.tap()        // 收起态点条身 = 进"写字"，顺手把分类拉下来
    const created = await poll(c0, (d) => (d.categoryNames || []).length)
    ck('展开录入条后把分类拉下来了', (created.categoryNames || []).length > 0,
      JSON.stringify(created.categoryNames))
    ck(`新建页的分类里有「${PRIVATE}」`, (created.categoryNames || []).includes(PRIVATE),
      JSON.stringify(created.categoryNames))
    ck('确实落在"写字"这一段（分类选择器只在这一段里）',
      created.active === 'write', `active=${created.active}`)
    // 选择器吃的是这一个数组，所以数组里有 = 那一格里有；绑定关系钉住，别哪天改成另算一份
    const cw = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/create/create.wxml'), 'utf8')
    ck('那一排选择器的候选就是这个数组（不是另算一份）',
      /<picker[^>]*range="\{\{categoryNames\}\}"/.test(cw))

    // ---------- ② 列表页：私密要能当筛选条件 ----------
    const idx = await until(mp, '/pages/index/index', (d) => (d.categories || []).length)
    const names = (idx.categories || []).map((c) => c.name)
    ck(`列表页的分类 chip 里有「${PRIVATE}」`, names.includes(PRIVATE), JSON.stringify(names))

    // ---------- ③ 我的页：密码状态与那一格是同一件事 ----------
    const me = await until(mp, '/pages/me/me', (d) => d.privateSet !== undefined, 8000)
    ck('这个账号确实上了锁（否则前面看到的那一格不是密码补出来的）',
      me.privateSet === true, `privateSet=${me.privateSet}`)
  } finally {
    await mp.close()
  }
  console.log(`\n${bad.length ? '未通过 ' + bad.length + ' 条：' + bad.join(' / ') : '全部通过'}`)
  process.exitCode = bad.length ? 1 : 0
})().catch((e) => { console.error('尺子跑挂了：', e.message); process.exitCode = 1 })
