/**
 * 一把尺子（真跑）：冷启第一屏那一排分类芯片是不是只剩「全部」（站长 10-18「为什么默认打开只有『全部』，
 * 必须要按上方 icon 其他分类才会显示，这个是 bug」）。
 *
 * 根因一句话：`loadCategories()` 里那句 `this.setData({ categories, catView: this._catView(...) })`
 * 把两样写在**同一个对象字面量**里，而 `_catView` 读的是 `this.data.categories` —— 参数求值发生在 setData 之前，
 * 拿到的是上一趟那份。冷启第一屏那"上一趟"是空表 ⇒ `catView` 只有「全部」；`categories` 随后被填满，
 * 可没人再算一遍 `catView`。点一下井格进管理态、再退出来时 `_catView(false)` 读到的是已填满那份 ⇒ 分类"回来了"。
 *
 * 同一条坑还连着第二处，所以这里一并钉：那一趟后面还有一句 `this.skin(this.data.notes)`，
 * 它读的也是这张表，而 `arrange()` 里 `hideCover = n.is_private || !n.privKnown`
 * ⇒ 一旦它拿到空表，每一行的封面都会被当成"不知道"抹掉。**这一处本次实测没坏**（第一趟读数：封面 10 张、
 * 没判过 0 行），因为那句 skin 写在 setData 之后、读到的是新表。留着这两条是防下一次有人把它们并成一句。
 *
 * 跑法：docs/工具/跑尺子.sh 9431 验-分类冷启第一屏-真跑
 */
const automator = require('miniprogram-automator')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const APORT = process.env.MP_PORT || 9431

const results = []
const ck = (name, ok, got) => { results.push({ name, ok, got }); console.log(`  ${ok ? '✓' : '✗'} ${name}${got ? '　→ ' + got : ''}`) }

;(async () => {
  let mp
  for (let i = 0; i < 12; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${APORT}` }); break }
    catch (e) { await sleep(4000) }
  }
  if (!mp) { console.log('!! 连不上自动化端口'); process.exit(2) }

  await mp.switchTab('/pages/index/index')
  await sleep(4000)

  const snap = () => mp.evaluate(() => {
    const p = getCurrentPages().slice(-1)[0]
    const d = p.data || {}
    const rows = (d.groups || []).reduce((a, g) => a.concat(g.rows || []), [])
    return {
      cats: (d.categories || []).length,
      view: (d.catView || []).length,
      edit: !!d.catEdit,
      notes: (d.notes || []).length,
      covers: rows.filter((r) => r.cover).length,
      unknownPriv: (d.notes || []).filter((n) => n.privKnown === false).length,
    }
  })
  const count = (sel) => mp.evaluate((s) => new Promise((res) => {
    const p = getCurrentPages().slice(-1)[0]
    wx.createSelectorQuery().in(p).selectAll(s).boundingClientRect().exec((r) => res(((r && r[0]) || []).length))
  }), sel)

  // ---------- 第一趟：不碰任何东西，就看冷启第一屏此刻屏上是什么 ----------
  const a = await snap()
  const chipsA = await count('.ix-cat')
  const thA = await count('.ixl-th')
  console.log(`读数｜此刻：表 ${a.cats} 格／catView ${a.view} 枚／屏上芯片 ${chipsA} 枚／笔记 ${a.notes} 行／封面 ${a.covers} 张（屏上 .ixl-th ${thA} 枚）／私密没判过 ${a.unknownPriv} 行`)

  ck('这一台账号有东西可测：分类表非空且至少一行带封面（否则下面几条是假绿）',
    a.cats >= 1 && a.notes >= 1, `分类 ${a.cats}／笔记 ${a.notes}／封面 ${a.covers}`)
  ck('冷启第一屏：屏上芯片数 = 分类数 ＋ 1（只多「全部」那一枚）',
    a.cats >= 1 && chipsA === a.cats + 1, `要 ${a.cats + 1} 枚，实得 ${chipsA} 枚`)
  ck('冷启第一屏：没有一行停在"私密没判过"（那一档会把封面一起抹掉）',
    a.unknownPriv === 0, `${a.unknownPriv} 行没判过`)

  // ---------- 第二趟：把这一屏倒回"表还是空的"那一个时刻，只跑它自己那趟 loadCategories ----------
  // 为什么不等真冷启：首页是常驻 tab，onShow 每次切回来都会再跑一趟，那时表已经有货，
  // 拿"切走再回来"永远复现不出来——必须先把那一格清空，才是第一次进页那条路。
  const before = await snap()
  await mp.evaluate(() => {
    const p = getCurrentPages().slice(-1)[0]
    p.setData({ categories: [], catView: [] })
    return p.loadCategories()
  })
  await sleep(2500)
  const b = await snap()
  const chipsB = await count('.ix-cat')
  const thB = await count('.ixl-th')
  console.log(`读数｜清空重跑那一趟之后：表 ${b.cats} 格／catView ${b.view} 枚／屏上芯片 ${chipsB} 枚／封面 ${b.covers} 张（屏上 ${thB} 枚）／私密没判过 ${b.unknownPriv} 行`)

  ck('重跑那一趟自己要把芯片排算齐（不许只填表不算渲染源）',
    b.cats >= 1 && b.view === b.cats + 1, `要 ${b.cats + 1} 枚（全部＋${b.cats} 格），实得 ${b.view} 枚`)
  ck('屏上真的画出那些分类（不是只填了 data、wxml 那一排还空着）',
    b.cats >= 1 && chipsB === b.cats + 1, `${chipsB} 枚`)
  // 这条钉的是"第二处副作用"：那一趟重算了 skin，就不许把上一趟判好的私密/封面再抹一次。
  ck('分类到货那一趟重算皮，不许把已经画出来的封面抹掉（数量与重跑前一致）',
    b.covers === before.covers && thB === thA, `重跑前 ${before.covers} 张／重跑后 ${b.covers} 张`)
  ck('重跑之后没有一行停在"私密没判过"',
    b.unknownPriv === 0, `${b.unknownPriv} 行没判过`)

  const bad = results.filter((r) => !r.ok)
  console.log(`\n${results.length - bad.length} 过 / ${bad.length} 红 / ${results.length} 条`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.log('!! 尺子崩：', e && e.message); process.exit(1) })
