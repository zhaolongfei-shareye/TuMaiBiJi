// 十套模板各出一张成品图，存进仓库，给跨端（iPhone 版）比对用。
// 出的是当前构建的运行时成品，不是效果图：换分类色、按内容定高、码贴纸那套都在里面。
// 前置：微信开发者工具已开，且跑过 cli auto --auto-port 9431。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/出-十套模板成品.js
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const freeNote = require('./尺子挑没卡片那一篇.js')

const OUT = path.resolve(__dirname, '../design/模板成品-1.5.0')
// 笔记号不写死（原来钉 `share?id=7`）：10-08 S2 把「一篇只留一张」那道闸的判据换成
// "本机台账 ∪ 服务器那一行"，那一篇在这台机器上已经有卡片了，进页直接被顶回去——
// 结果是十张成品一张都不落盘、满屏"没有成品图"。改成先挑/借一篇进得去的。
const NOTE_OF = (id) => `/pages/share/share?id=${id}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got ? `　→ ${got}` : ''}`)
  if (!ok) bad.push(name)
}

const SANDBOX = path.join(process.env.HOME, 'Library/Application Support/微信开发者工具')
const findInSandbox = (name, depth = 8) => {
  const walk = (dir, d) => {
    if (d > depth) return null
    let items = []
    try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return null }
    for (const it of items) if (it.isFile() && it.name === name) return path.join(dir, it.name)
    for (const it of items) {
      if (it.isDirectory()) { const hit = walk(path.join(dir, it.name), d + 1); if (hit) return hit }
    }
    return null
  }
  return walk(SANDBOX, 0)
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  // 挑一篇进得去卡片页那一屏的笔记；一台机器上每一篇都有卡片时**借**一篇（只摘台账那一栏，
  // 位图一张都不动），跑完装回去。为什么要有这一段：见 尺子挑没卡片那一篇.js 顶上那段。
  const found = await freeNote.find(mp)
  const pool = found.free.length ? found.free : (freeNote.mayBorrow() ? found.all : [])
  const use = pool.length ? pool[0] : null
  ck('挑得到一篇能进卡片页的笔记', !!use,
    `列表 ${found.total} 篇、已有卡片 ${found.withCard} 篇、没卡片的 ${found.free.length} 篇`
      + (use ? ` → 用 ${use.id}「${use.title}」${use.hasCard ? '（借，跑完装回）' : ''}` : ' → 一篇都不剩'))
  if (!use) { mp.disconnect(); process.exit(1) }
  let borrowed = null
  if (use.hasCard) {
    borrowed = await freeNote.takeOver(mp, use.id)
    console.log(`　· 借走 ${use.id} 台账那一栏：${JSON.stringify(borrowed.removed)}（ stillThere=${borrowed.stillThere} ）`)
    if (borrowed.err || borrowed.stillThere) { ck('借得动', false, borrowed.err || `stillThere=${borrowed.stillThere}`); mp.disconnect(); process.exit(1) }
  }
  try {
  const page = await mp.reLaunch(NOTE_OF(use.id))
  await sleep(7000)

  const dump = (name) => mp.evaluate((d) => {
    const p = getCurrentPages().slice(-1)[0]
    const src = p.data.imagePath
    if (!src) return '没有成品图'
    try {
      wx.getFileSystemManager().copyFileSync(src, `${wx.env.USER_DATA_PATH}/${d}`)
      return d
    } catch (e) {
      return `拷贝失败：${e && e.message}`
    }
  }, name)

  const pull = async (name) => {
    const got = await dump(name)
    if (got !== name) { ck(`${name} 写进沙盒`, false, String(got)); return }
    const local = findInSandbox(name)
    ck(`${name}`, !!local, local ? '已落进仓库' : '沙盒里没找到')
    if (local) fs.copyFileSync(local, `${OUT}/${name}`)
  }

  const tpls = await page.data('tpls')
  ck('模板条拿到十格', Array.isArray(tpls) && tpls.length === 10, tpls ? tpls.map((x) => x.id).join(',') : '没有 tpls')

  // 进不去那一屏时 `tpls` 是 undefined、`.pick` 是空的：这一把要红在"拿不到十格"那一句上，
  // 不能红成一个 TypeError 把后面九张的线索一起吞掉。
  const list = Array.isArray(tpls) ? tpls : []
  for (let i = 0; i < list.length; i++) {
    const picks = await page.$$('.pick')
    if (!picks[i]) { ck(`第 ${i + 1} 格点得到`, false, `模板条只有 ${picks.length} 格`); break }
    await picks[i].tap()
    await sleep(5200)
    const picked = await page.data('picked')
    ck(`第 ${i + 1} 格选中的是 ${list[i].id}`, picked === list[i].id, `picked=${picked}`)
    await pull(`模板-${list[i].id}.png`)
  }

  // 关掉二维码那一档：同一套版式在"有码/无码"两种收口下的样子（发微信以外的平台用无码）
  await page.setData({ noQr: true })
  await page.callMethod('render')
  await sleep(5200)
  await pull('模板-card-无码.png')
  await page.setData({ noQr: false })
  await page.callMethod('render')
  await sleep(3000)

  await mp.reLaunch('/pages/index/index')
  } finally {
    if (borrowed && borrowed.removed) {
      const back = await freeNote.putBack(mp, use.id, borrowed.removed)
      ck('借来那一栏跑完原样装回去了', back.ok, JSON.stringify(back))
    }
  }
  mp.disconnect()
  console.log(`\n${bad.length ? `✗ ${bad.length} 处不过` : '全过'}　成品目录：${OUT}`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => {
  console.error('✗ 跑挂了：', e && e.message ? e.message : JSON.stringify(e))
  process.exit(1)
})
