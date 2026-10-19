// 提炼成了之后落在哪一屏（站长 10-19 原话：「提炼完，直接跳到这个详情页，就是带背景毛玻璃这个，
// 用户有需要再修改」）。改之前那一趟是 `wx.navigateTo('/pages/detail/detail?id=…')`＝推一个带返回条的整页；
// 改之后要的是**回到笔记列表那一扇详情窗**（顶上「点一下收起」、底下 编辑／分享／删除 那一排）。
//
// 跑法：docs/工具/跑尺子.sh 9431 验-提炼完落回详情窗-真跑
//
// 它不真发一次提炼（那要等外网抓取＋模型，一条几十秒且随时会因站点改版红掉），
// 它打的是**落点那一步本身**：直接调 `_extractDone(noteId, {})`——成功那一趟的六步里，
// 前面五步（置忙／提交／轮询／清草稿／吐司）由 `验-统一录入条` 那把静态尺子钉着，
// 这一把量的是第六步在屏上到底走到哪一屏、开的是哪一扇窗。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ROOT = path.resolve(__dirname, '../..')
const SRC_VERSION = /const VERSION = '([\d.]+)'/.exec(
  fs.readFileSync(path.join(ROOT, 'miniprogram/utils/appInfo.js'), 'utf8'))[1]

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

automator.connect({ wsEndpoint: 'ws://localhost:9431' }).then(async (mp) => {
  try {
    /* ---------- 〇、连的是不是这一条线的包 ---------- */
    const meP = await mp.switchTab('/pages/me/me')
    await sleep(1800)
    ck(`IDE 里开的是这一条线（「我的」那格＝源码那格）`,
      String((await meP.data()).version) === SRC_VERSION,
      `屏上 v${(await meP.data()).version}／源码 v${SRC_VERSION}`)

    /* ---------- 一、先在列表里挑一篇能开的，拿它的 id 与标题 ---------- */
    const list = await mp.reLaunch('/pages/index/index')
    await sleep(2600)
    const d0 = await list.data()
    const row = (d0.notes || []).find((n) => n && !n.is_private && !n.is_preset)
    ck('列表里有一篇非私密、也不是预置的笔记（拿它当"刚提炼成的那一篇"）', !!row,
      row ? `id ${row.id}｜${(row.title || '').slice(0, 18)}` : `读了 ${(d0.notes || []).length} 篇`)
    if (!row) throw new Error('没有可开的篇，后面量不了')

    /* ---------- 二、站到录入页，把成功那一趟的最后一步打出来 ---------- */
    const create = await mp.reLaunch('/pages/create/create')
    await sleep(1600)
    // ⚠ `Page.path` 是**属性**不是方法（`out/Page.d.ts` 现读：`path: string`），
    // 写成 `page.path()` 报的是 "not a function"，看着像 automator 坏了其实是签名记歪。
    ck('这一趟确实从录入页出发', (await mp.currentPage()).path === 'pages/create/create')
    await create.callMethod('_extractDone', row.id, {})
    await sleep(300)
    ck('800ms 那一帧还没跳（吐司与"成了"那一帧要看得见，不许立刻把人带走）',
      (await mp.currentPage()).path === 'pages/create/create')

    /* ---------- 三、跳完之后落在哪一屏、开的是哪一扇窗 ---------- */
    await sleep(4200)
    const cur = await mp.currentPage()
    ck('落点＝笔记列表那一屏（不是独立详情页 pages/detail/detail）',
      cur.path === 'pages/index/index', `现在在 ${cur.path}`)
    const d1 = await cur.data()
    ck('那一扇详情窗自己开着（detailOpen＝true）', d1.detailOpen === true)
    ck('窗里就是刚那一篇（按 id 找回，不是列表第一行）',
      !!d1.detailNote && d1.detailNote.id === row.id,
      d1.detailNote ? `窗里 ${d1.detailNote.id}／给的 ${row.id}` : '窗里没有笔记')
    const sheet = await cur.$('.float-sheet')
    ck('屏上真的画出了那扇窗（`.float-sheet` 在，不是只有 data 里那个布尔）', !!sheet)
    const h2 = await cur.$('.ds-h2')
    const h2Text = h2 ? (await h2.text()).trim() : ''
    ck('窗里抬头那行就是这一篇的标题', h2Text === (row.title || '').trim(),
      `屏上「${h2Text.slice(0, 20)}」／列表「${(row.title || '').slice(0, 20)}」`)
    const btns = await cur.$$('.ds-irow .ds-ibtn')
    ck('底下那排三枚在（编辑／分享／删除）——"用户有需要再修改"走的就是这一枚编辑', btns.length === 3,
      `${btns.length} 枚`)
    ck('开窗时游标归零、配图是这一篇的那一排（不是上一配的残留）',
      Array.isArray(d1.detailImages) && d1.dsFigAt === 0,
      `${(d1.detailImages || []).length} 条／dsFigAt ${d1.dsFigAt}`)

    /* ---------- 四、那一次交接取走即清 ---------- */
    await mp.switchTab('/pages/me/me')
    await sleep(1500)
    const back = await mp.switchTab('/pages/index/index')
    await sleep(2600)
    const d2 = await back.data()
    ck('再进一次列表，窗不许自己弹回来（交接那一格是一次性的，不是本机状态）',
      d2.detailOpen === false, `detailOpen ${String(d2.detailOpen)}`)

    console.log(bad.length ? `\n✗ ${bad.length} 条红：\n  · ${bad.join('\n  · ')}` : '\n✓ 全绿')
  } catch (e) {
    console.error('✗ 跑挂了：', e && (e.stack || e.message || e))
    bad.push('异常')
  } finally {
    mp.close && mp.close()
    process.exit(bad.length ? 1 : 0)
  }
}).catch((e) => {
  console.error('✗ 连不上 9431（连接红，不是判据红）：', e.message)
  process.exit(1)
})
