// P0-5 这一屏的真跑自证：进「卡片模板」页，那条新加的拉取确实发了一次、
// 而且**没把这一页搞坏**——十格小样照样画得出、分组名后面那两个数照样是（4）／（6）、
// 底排那一条没被挤掉、什么异常都没冒出来。
//
// 为什么要单独一把：现网那张表还没建（这批不部署），所以这个请求今天真打过去就是 404。
// 404 本身不是问题，**404 之后这一页还画不画得出东西**才是问题：拉取挂在 onLoad 上，
// 它要是抛了、或者把 setData 的节奏搅乱了，站长看到的就是一页空白小样。
// 静态那把（docs/工具/验-模板配方下发.js）证的是合并与回退的逻辑，
// 这一把证的是它接到真运行时上没咬到别的东西。
//
// 「画没画上去」这一条读的是页面自己写回 data 的那个 h，不是像素：
// 骨架里那是个占位数，画成功的那格会被换成按成图高度算出来的数，画失败的那格走 catch
// 那一款（另一个数）。三种数互不相同，所以它比"截图数非白像素"更直接，也不用把画布节点
// 传出 automator——`fields({node:true})` 的结果一进序列化就报 An object could not be cloned
// （10-04 23:0x 实测：同一个 exec 里只问 boundingClientRect 是好的，一加 node 字段就崩）。
// 那三个算式从 profile.js 现读，抄进这里就成了第二份真相。
//
// 前置：微信开发者工具已开。改过 WXML/WXSS/JS 要走：bash docs/工具/跑尺子.sh 9431 验-模板配方下发-真跑
// 跑法：NODE_PATH=$HOME/.mpauto/node_modules node docs/工具/验-模板配方下发-真跑.js
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')

const PORT = process.env.MP_PORT || 9431
const poster = require(path.resolve(__dirname, '../../miniprogram/utils/poster.js'))
const pt = require(path.resolve(__dirname, '../../miniprogram/utils/posterTemplates.js'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ` → ${got}`}`)
  if (!ok) bad.push(name)
}

// 这一页用的三个高度：骨架占位、画成功、画失败。前两个是 groupSkeleton 与 renderThumbs
// 里各自的算式，第三个是 renderThumbs 的 catch 分支。找不到就算红——公式被人改了，
// 这把尺子必须响，不能拿着旧数去量新页。
const SRC = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/profile/profile.js'), 'utf8')
const TW = Number(/const THUMB_W = (\d+)/.exec(SRC)[1])
const skel = /h: Math\.round\(\(THUMB_W \* (\d+)\) \/ (\d+)\)/.exec(SRC)
const fail = /h: Math\.round\(THUMB_W \* ([\d.]+)\)/.exec(SRC)
const H_SKEL = skel ? Math.round((TW * Number(skel[1])) / Number(skel[2])) : -1
const H_FAIL = fail ? Math.round(TW * Number(fail[1])) : -1

// 一次 evaluate 只问几何（boundingClientRect），不碰画布节点。
// 查询挂在页面实例上（getCurrentPages() 最后一个）：裸的 wx.createSelectorQuery() 在 app
// 作用域里够不到页面节点，exec 的回调压根不来，报的是"timeout waiting for automator response"。
// 回来的每一块都只取三个数、自己拼成扁对象：rect 原对象带 `dataset`/`id` 这些字段，
// 整份往 automator 那条线上端会报 An object could not be cloned（10-04 23:2x 实测：
// 同一份查询只回 `[{width, height}]` 是好的，原样回 rect 数组就崩）。
const probe = (mp) => mp.evaluate(() => new Promise((resolve) => {
  const p = getCurrentPages().slice(-1)[0]
  const q = p.createSelectorQuery()
  q.selectAll('.cell-canvas').boundingClientRect()
  q.select('.save-bar').boundingClientRect()
  q.exec((res) => {
    const box = (b) => (b ? { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top) } : null)
    resolve({
      boxes: (res[0] || []).map(box),
      saveBar: box(res[1]),
      calls: (wx.__probeCalls || []).map(String),
    })
  })
}))

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('尺子自己炸了', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }) } catch (e) { await sleep(10000) }
  }
  if (!mp) {
    console.error('连不上 9431（环境红，不是判据红）。先跑：bash docs/工具/跑尺子.sh 9431 验-模板配方下发-真跑')
    process.exit(2)
  }

  // 壳必须装在进页之前——onLoad 里那一次拉取就是被抓的对象。
  // 顺手把本机那份缓存清了（键名从工具里现读，不在这儿抄第二遍）：这一把要钉的是
  // "什么都没下发"那一态，上一把尺子要是留过东西，分组那两个数就不是包内那十项了。
  await mp.evaluate((key) => {
    wx.__probeCalls = []
    wx.removeStorageSync(key)
    const orig = wx.request
    wx.request = (o) => {
      if (o && /poster\/templates/.test(String(o.url))) wx.__probeCalls.push(String(o.url))
      return orig(o)
    }
  }, pt.STORE_KEY)
  const errors = []
  const thumbFails = []
  mp.on('console', (m) => {
    const txt = String((m && m.text) || '')
    // 只数真抛出来的异常。404 本身在开发者工具控制台里是一行网络日志，那条按设计就该出现
    // （现网那张表还没建），把它算成红就是把"咽掉了"读成"没咽"。
    if (/ReferenceError|TypeError|SyntaxError|Unhandled|is not a function|undefined is not/.test(txt)) errors.push(txt.slice(0, 140))
    // 这一句是 renderThumbs 的 catch 分支自己打的：哪一格没画出来，它当场报名字。
    if (txt.indexOf('模板小样没画出来') >= 0) thumbFails.push(txt.slice(0, 140))
  })

  // profile 是 tabBar 页，navigateTo 进不去；走 reLaunch，并躲开那句 rawPath is null。
  // 每次尝试前把已抓的请求清一次：判据钉的是"这一趟进页只发了一遍"。
  for (let i = 0; ; i++) {
    await mp.evaluate(() => { wx.__probeCalls = [] })
    try { await mp.reLaunch('/pages/profile/profile'); break } catch (e) {
      if (i >= 4) throw e
      console.log(`第 ${i + 1} 次进卡片模板页没成：${e.message}`)
      await sleep(8000)
    }
  }
  await sleep(9000)
  const got = await probe(mp)
  const page = await mp.currentPage()
  const headTx = []
  for (const e of await page.$$('.grid-head')) headTx.push(((await e.text()) || '').replace(/\s+/g, ''))
  const d = await page.data()
  const items = (d.groups || []).reduce((a, g) => a.concat(g.items || []), [])

  const n = poster.TEMPLATES.length
  const list = poster.templateList()
  // 屏上那一行与算出来的那一行都比之前先去掉空白：WXML 里 {{g.label}} 前后贴了标签与缩进，
  // 读出来的文本可能带一个空格（10-04 实测英文态屏上是 "Classic(4)"，算出来是 "Classic (4)"）。
  const flat = (s) => String(s).replace(/\s+/g, '')
  const wantHead = (gid) => {
    const c = list.filter((x) => x.group === gid).length
    return poster.groupName(gid, d.lang) + (d.lang === 'en' ? ` (${c})` : `（${c}）`)
  }

  ck('那一次拉只发了一遍，路径就是接口注册的那条（尾巴带斜杠）',
    got.calls.length === 1 && /\/api\/poster\/templates\/$/.test(got.calls[0]), JSON.stringify(got.calls))
  ck(`十格里 ${n} 个画布都在页面上，每格的盒子都有面积（不是 display:none 那种假在）`,
    got.boxes.length === n && got.boxes.every((b) => b && b.w > 0 && b.h > 0),
    got.boxes.map((b) => `${b.w}x${b.h}`).join(','))
  ck(`${n} 格小样都走完了成图那一路（每格的 h 既不是骨架占位 ${H_SKEL}、也不是画失败那一款 ${H_FAIL}）`,
    H_SKEL !== H_FAIL && items.length === n && items.every((it) => it.h !== H_SKEL && it.h !== H_FAIL),
    items.map((it) => `${it.id}:${it.h}`).join(' '))
  ck(`分组那两行逐字等于「${poster.TEMPLATE_GROUPS.map((g) => wantHead(g.id)).join('／')}」（404 之后合并列表就是包内那十项）`,
    headTx.length === poster.TEMPLATE_GROUPS.length
      && poster.TEMPLATE_GROUPS.every((g, i) => flat(headTx[i]) === flat(wantHead(g.id))),
    `${headTx.join(' / ')}　（语言 ${d.lang}）`)
  ck('那一页底排那块面还在（404 之后没把保存那一条挤掉）',
    !!got.saveBar && got.saveBar.w > 0 && got.saveBar.h > 0, JSON.stringify(got.saveBar))
  ck('这一趟没把异常抛到控制台（拉取那条失败是被咽掉的，不是冒出来的）',
    errors.length === 0, errors.slice(0, 2).join(' | '))
  ck('十格里没有任何一格进过「画不出来」那个 catch',
    thumbFails.length === 0, thumbFails.slice(0, 2).join(' | '))

  try { await mp.disconnect() } catch (e) { /* 收尾断不干净由跑尺子.sh 下一次整体重启兜 */ }
  console.log(bad.length ? `红 ${bad.length} 条：${bad.join('、')}` : `全部通过（7 条里 0 红）`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('尺子跑挂了', e && e.message ? e.message : e); process.exit(2) })
