// 「查看笔记」返回之后必须还站在「笔记卡片」那一枚上（站长 10-06 真机：
// 「查看大图卡片，然后点击查看笔记，然后看完笔记，返回时候，没有回到笔记卡片」）。
//
// 根因不在那枚按钮，在 onShow 第 151 行那句无条件的 `view:'list'`：
// 它的本意是"每次从底栏切回首页都回到第一枚 tab"（他 10-04 原话"默认第一个 tab"），
// 可 `wx.navigateTo`  push 出去再 navigateBack 回来，走的是**同一个 onShow**，
// 于是他自己切到「笔记卡片」这一枚这件事被抹掉了。
//
// 所以这一把钉两头：① push 出去再回来，tab 不许被抹（红的那一条就是这次的 bug）；
// ② 从底栏切走再切回来，**仍然**要回到第一枚——这条是他拍过的，不能被 ① 顺手带走。
//
// 前置：微信开发者工具已开，跑过 cli auto --project .../miniprogram --auto-port 9431
// 跑法：docs/工具/跑尺子.sh 9431 验-查看笔记返回停在卡片-真跑
//
// 写这一把时先红了一轮，红的是尺子自己：那趟用 `mp.navigateTo()` 直接跳页，**绕开了页里那两个
// handler**，标记当然没打上，于是"返回被抹回第一枚"永远复现。要测"人从那个按钮走"，
// 就必须让流量真过 handler（这里用 callMethod 进，理由见下面 ② 那段注释）。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const IDX_JS = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/index/index.js'), 'utf8')
const IDX_WXML = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/index/index.wxml'), 'utf8')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

;(async () => {
  process.on('uncaughtException', (e) => { console.error('探针挂了（未捕获）', e); process.exit(2) })

  /* ---------- 第 0 关：不连工具也能查的静态那几条 ---------- */
  // 那枚按钮本身没坏：仍是"先收大图、再 push 去独立详情页"（10-04 那两条收窗口留着）。
  ck('大图底排那枚仍绑 onViewNote（「查看笔记」）',
    /bindtap="onViewNote">\{\{t\.viewNote\}\}/.test(IDX_WXML))
  // 这一段用**字符串先后位置**判，不用一条长正则：同样的三段拆开来每段都中，串起来就不中
  // （懒惰量词 `[\s\S]{0,260}?` 与后一段回退互踩），这种判据读的人还得先信正则引擎。
  const iView = IDX_JS.indexOf('onViewNote() {')
  const onViewNoteBody = IDX_JS.slice(iView, iView + 240)
  const iClose = onViewNoteBody.indexOf('this._closeTemplate()')
  const iPush = onViewNoteBody.indexOf('wx.navigateTo({ url: `/pages/detail/detail?id=${note.id}` })')
  ck('onViewNote 仍先 _closeTemplate 再 navigateTo 到独立详情页',
    iView >= 0 && iClose >= 0 && iPush > iClose, `close@${iClose} push@${iPush}`)
  // 修的是 onShow 那一句：它必须被"这一趟是不是 push 回来的"挡住，不许再无条件写 'list'。
  ck('onShow 里那句 view 复位改成有条件的（keepView ? 停在原处 : 回第一枚）',
    /view:\s*keepView\s*\?\s*this\.data\.view\s*:\s*'list'/.test(IDX_JS))
  ck('push 出去前打了标记（查看笔记、去编辑两条都打，同一类问题一起修）',
    (IDX_JS.match(/this\._keepView = true/g) || []).length >= 2,
    `${(IDX_JS.match(/this\._keepView = true/g) || []).length} 处`)

  /* ---------- 真跑 ---------- */
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上 9431，先跑 cli auto')
  const enter = async (url) => {
    for (let i = 0; i < 5; i++) {
      try { return await mp.reLaunch(url) } catch (e) { console.log(`进 ${url} 第 ${i + 1} 次没成：${e.message}`); await sleep(8000) }
    }
    throw new Error(`进不去 ${url}`)
  }

  const page = await enter('/pages/index/index')
  await sleep(6000)
  const d0 = await page.data()
  const notes = d0.notes || []
  const note = notes.find((n) => !n.is_private) || notes[0]
  ck('这一台账号里有笔记可点（判据要有对象）', !!note, `${notes.length} 篇`)
  if (!note) { console.log('\n没笔记，真跑那半截跑不了'); process.exit(2) }

  // ① 先站到「笔记卡片」那一枚上（真点那枚 tab，不从后门 setData）
  const tabs = await page.$$('.vtab')
  await tabs[1].tap()
  await sleep(2000)
  let v = (await page.data()).view
  ck('点第二枚之后确实站在卡片那一档', v === 'cards', v)
  const on = await page.$('.vtab.on')
  const wantOn = String(((await page.data()).t || {}).navShare || '').replace(/\s+/g, '')
  ck('亮着的是第二枚（卡片那一档），不是只改了 data 没落到屏上',
    !!on && (await on.text()).replace(/\s+/g, '') === wantOn,
    on ? `${await on.text()} vs ${wantOn}` : '没有 .vtab.on')
  // 网格里有几张**只记不判**：这一台是测试账号，台账里可能一张留档卡片都没有（cells 空时
  // `.grid2` 整块不渲染），那是数据状态不是 bug——把它钉成判据会变成"没卡片就永远红"。
  console.log(`　· 卡片那一屏的格数：${(await page.$$('.grid2 .gc')).length}（台账里有留档卡片才会有格）`)

  /* ② 这一把的主角：走**真 handler** push 出去再回来。
     为什么不用 mp.navigateTo 直接跳：那一条不经过 onViewNote / onSheetEdit，标记根本没地方
     打，测出来永远是"被抹回第一枚"——第一趟那两条红是尺子红，不是产品红。
     为什么用 callMethod 进 handler：这一台测试账号的台账里一张留档卡片都没有（`.grid2` 是空的），
     真点到大图底排那枚「查看笔记」得先出一次图、再存一次相册；handler 本体照跑，
     缺的只是最前面那两下点击。 */
  const pushAndBack = async (fn, setup, expectPath) => {
    await page.setData(setup)
    await sleep(1200)
    await page.callMethod(fn)
    await sleep(4500)
    const p = (await mp.currentPage()).path
    ck(`${fn} 这一趟真 push 到了 ${expectPath}（不是就地开窗）`, p.indexOf(expectPath) >= 0, p)
    await mp.navigateBack()
    await sleep(5000)
    return (await (await mp.currentPage()).data()).view
  }
  v = await pushAndBack('onViewNote',
    { detailOpen: false, templateOpen: true, posterNote: note, posterHasCard: true },
    'pages/detail/detail')
  ck('★ 看完笔记返回，仍停在「笔记卡片」那一枚（这条红就是站长报的那件事）', v === 'cards', v)

  v = await pushAndBack('onSheetEdit',
    { templateOpen: false, posterNote: null, detailOpen: true, detailNote: note },
    'pages/write/write')
  ck('去编辑那一趟回来同样不许被抹回第一枚', v === 'cards', v)
  // 这一条原有的"回来站到详情窗前"是另一套机制（_backToDetail），不能被这次的 keepView 顶掉。
  const dd = await (await mp.currentPage()).data()
  ck('去编辑那一条"回来重新浮出详情窗"仍在（两套机制各管各的）', dd.detailOpen === true, `detailOpen=${dd.detailOpen}`)

  // ③ 反面：他 10-04 那条"默认第一个 tab"只管从底栏切回来这一型，不能被 ① 顺手带走
  await mp.switchTab('/pages/me/me')
  await sleep(4000)
  await mp.switchTab('/pages/index/index')
  await sleep(5000)
  v = (await (await mp.currentPage()).data()).view
  ck('从底栏切走再切回来，仍照他拍的回到第一枚（列表）', v === 'list', v)

  console.log(bad.length ? `\n✗ ${bad.length} 条不过：${bad.join(' / ')}` : '\n全过')
  process.exit(bad.length ? 1 : 0)
})()
