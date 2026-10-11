// 十套模板各出一张**无码**成品图，给参赛说明 PDF 的图库用。
// 出的是当前构建的运行时成品，不是效果图：换分类色、按内容定高都在里面。
// 为什么单独一条路：V3/V4 那份 PDF 的图注写的是"展示为隐藏码版本"，图库必须走产品自己的
// 无码那一档（`noQr`），不能拿带真码那批去交——真码指向哪一篇、作者之后撤不撤分享，
// 都不该由一份静态 PDF 替用户决定。带码那批仍在 ../design/模板成品-1.5.0。
// 前置：微信开发者工具已开，且跑过 cli auto --auto-port 9431。
// 跑法：NODE_PATH=$HOME/.mpauto/node_modules node docs/工具/出-十套模板成品-无码.js
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const freeNote = require('./尺子挑没卡片那一篇.js')

const OUT = path.resolve(__dirname, '../design/10-11模板图库-无码')
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
  // 默认挑一篇"本机还没有卡片"的笔记；每一篇都有卡片时**借**一篇（只摘台账那一栏，
  // 位图一张都不动），跑完装回去。为什么要有这一段：见 尺子挑没卡片那一篇.js 顶上那段。
  //
  // GALLERY_NOTE=<纯数字 id> 可以钉住用哪一篇。图库这一趟要钉：自由挑那一条会挑到站长
  // 自己的真笔记（10-11 那一次挑到的是「祝汪晨蕊演出顺利」），把带真名的私人内容印进一份
  // 要交出去的 PDF 里，这个决定不该由工具替他做。钉哪一篇由人给，这里只校验形状。
  const pinned = /^\d+$/.test(String(process.env.GALLERY_NOTE || '')) ? String(process.env.GALLERY_NOTE) : null
  const found = await freeNote.find(mp)
  let use = null
  if (pinned) {
    use = found.all.filter((x) => String(x.id) === pinned)[0] || { id: Number(pinned), title: null, hasCard: false }
    console.log(`　· 钉住用 ${pinned}「${use.title || '(列表里没这篇)'}」${use.hasCard ? '（借，跑完装回）' : ''}`)
  } else {
    const pool = found.free.length ? found.free : (freeNote.mayBorrow() ? found.all : [])
    use = pool.length ? pool[0] : null
  }
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
  // 10-11 这一把实测：进页 7 秒时 `generating` 还是 true、`tpls` 是 0 格，而 createShare
  // 与二维码下载两条单独量都是 200（31ms／165ms）——慢在画布那一趟，不在网络。
  // 所以这里改成"等到说话为止"：每 3 秒问一次，最多 12 轮（36 秒），十格真出来了才走。
  let tplN = 0
  for (let i = 0; i < 12; i++) {
    await sleep(3000)
    tplN = await mp.evaluate(new Function(`
      const p = getCurrentPages().slice(-1)[0]
      return p && Array.isArray(p.data.tpls) ? p.data.tpls.length : -1
    `))
    if (tplN === 10) break
  }
  console.log(`　· 等模板条：十格＝${tplN === 10 ? '到位' : `只等到 ${tplN}`}（每 3 秒问一次，最多 36 秒）`)

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

  // 画布那一趟是这一把真正的慢点：`_renderedTpl` 是 render() 收尾时写下的"这一张是按哪一套画的"，
  // 拿它当等位线，比固定 sleep 可靠（10-11 那一次就是固定 5.2 秒不够，成品图还是上一张）。
  const waitRendered = async (id) => {
    for (let i = 0; i < 10; i++) {
      const got = await mp.evaluate(new Function(`
        const p = getCurrentPages().slice(-1)[0]
        return { tpl: p._renderedTpl || null, img: !!p.data.imagePath, busy: !!p.data.generating }
      `))
      if (got.tpl === id && got.img) return got
      await sleep(2000)
    }
    return { tpl: null, img: false, busy: true }
  }

  // 先关掉二维码那一档再逐套出图：`render()` 每次现读 `this.data.noQr`（share.js 里
  // `showQr: !this.data.noQr`），所以设一次就管十张。图库要的是产品自己的无码收口，
  // 不是把带码那张 P 掉——带码/无码是两套版式（无码那一档不留"扫码秒看"那一行）。
  await page.setData({ noQr: true })
  await page.callMethod('render')
  await sleep(5200)
  ck('无码那一档已生效', (await page.data('noQr')) === true)

  // 进不去那一屏时 `tpls` 是 undefined、`.pick` 是空的：这一把要红在"拿不到十格"那一句上，
  // 不能红成一个 TypeError 把后面九张的线索一起吞掉。
  const list = Array.isArray(tpls) ? tpls : []
  for (let i = 0; i < list.length; i++) {
    const picks = await page.$$('.pick')
    if (!picks[i]) { ck(`第 ${i + 1} 格点得到`, false, `模板条只有 ${picks.length} 格`); break }
    await picks[i].tap()
    const picked = await page.data('picked')
    ck(`第 ${i + 1} 格选中的是 ${list[i].id}`, picked === list[i].id, `picked=${picked}`)
    const done = await waitRendered(list[i].id)
    ck(`第 ${i + 1} 张画完了（${list[i].id}）`, done.img && done.tpl === list[i].id,
      `tpl=${done.tpl} 成品图=${done.img} 还在生成=${done.busy}`)
    await pull(`无码-${list[i].id}.png`)
  }

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
