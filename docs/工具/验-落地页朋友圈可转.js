// 「扫码落地页能不能直接转发到朋友圈」这一条的真跑尺子（站长 10-04 点名要：6、按你建议）。
//
// 用法（token 走环境变量，**不要把它写进这个文件**——那张码本身就是公开的入口地址）：
//   TOKEN=<现网一张活码> bash docs/工具/跑尺子.sh 9431 验-落地页朋友圈可转
// 不给 TOKEN 也行，只是第①段会自动跳过并明确说"跳过了"，第②③段照跑。
//
// 这把全程只读：落地页本来就是匿名可读，两条腿都只是 GET /api/shares/<token>，
// 不建笔记、不开码、不动任何数据。
//
// 三段各钉什么：
//   ① 真内容那一段（要 TOKEN）：页面从服务端真读回了这一篇，然后**在真页面上**把两个转发口都调一遍——
//      钉"朋友圈那条带的 query 就是这个 token"（少了它，别人从朋友圈点进去是一张空页），
//      以及"好友那条的 path 仍指向这一篇"（补 onShareTimeline 不该把原来那条带坏）。
//   ② 没有内容那一段：随便给一个不存在的 token，页面读不到 share，这时两个转发口必须各自回一个空对象
//      并且不抛异常——这是 `if (!share) return {}` 那道闸门的真跑证据，不是读代码猜的。
//   ③ 标题兜底：现网有标题缺失的活码时才会撞到，所以这一段只在读到过 share 的前提下比，
//      比的是"发出去那行字不能是 undefined"，且跟着当前语言走。
const automator = require('miniprogram-automator')

const PORT = 9431
const TOKEN = process.env.TOKEN || ''
const BOGUS = 'this-token-does-not-exist-000000'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const ck = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail: detail || '' })
  console.log(`${ok ? '✓' : '✗'} ${name}` + (detail ? `  · ${detail}` : ''))
}
const skip = (name, why) => {
  results.push({ name, ok: true, detail: `跳过：${why}`, skipped: true })
  console.log(`- ${name}  · 跳过：${why}`)
}

// 在"当前这一页"上调两个转发口：拿的是页面实例上的真方法，输入是它自己 data 里的那份 share。
const shareOut = (mp) => mp.evaluate(() => {
  const p = getCurrentPages().slice(-1)[0]
  const out = {
    timeline: typeof p.onShareTimeline,
    appMsg: typeof p.onShareAppMessage,
    hasShare: !!(p.data && p.data.share),
    shareTitle: (p.data && p.data.share && p.data.share.title) || '',
    lang: (p.data && p.data.lang) || '',
  }
  try { out.tl = p.onShareTimeline ? p.onShareTimeline() : null } catch (e) { out.tlErr = String(e && e.message || e) }
  try { out.am = p.onShareAppMessage ? p.onShareAppMessage() : null } catch (e) { out.amErr = String(e && e.message || e) }
  return out
})

;(async () => {
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')

  // ---------- ② 读不到内容时那两个口都得是空的、且不炸 ----------
  // 先跑这一段是因为它不需要任何凭据；顺带确认这一页"没内容也待得住"。
  let page = await mp.reLaunch(`/pages/share/view?token=${BOGUS}`)
  await sleep(4000)
  const empty = await shareOut(mp)
  ck('没有内容时页面仍挂着 onShareTimeline（那颗按钮才不是靠运气的）', empty.timeline === 'function', `typeof=${empty.timeline}`)
  ck('没有内容时 data.share 确实是空的（下面那条才不是空过）', empty.hasShare === false, `hasShare=${empty.hasShare}`)
  ck('没有内容时调 onShareTimeline 不抛异常', !empty.tlErr, empty.tlErr || JSON.stringify(empty.tl))
  ck('没有内容时 onShareTimeline 回空对象（发出去不会带一个 undefined token）',
    !!empty.tl && Object.keys(empty.tl).length === 0, JSON.stringify(empty.tl))
  ck('没有内容时 onShareAppMessage 也回空对象且没被带坏',
    !empty.amErr && !!empty.am && Object.keys(empty.am).length === 0, empty.amErr || JSON.stringify(empty.am))

  // ---------- ① 真内容那一段 ----------
  if (!TOKEN) {
    skip('真内容那一段（朋友圈带的 query / 好友那条的 path）', '没给 TOKEN 环境变量，不拿别人的活码进文件')
  } else {
    page = await mp.reLaunch(`/pages/share/view?token=${TOKEN}`)
    const got = await (async () => {
      for (let i = 0; i < 20; i++) {
        const d = await page.data()
        if (d && d.share) return d
        await sleep(800)
      }
      return await page.data()
    })()
    ck('落地页真从服务端读回了这一篇', !!(got && got.share), got && got.loadError ? `loadError=${got.loadError}` : '')
    const real = await shareOut(mp)
    ck('这一篇有标题（朋友圈那行字要印它）', !!real.shareTitle, real.shareTitle)
    ck('朋友圈那条带的 query 就是这个 token（点开还是这一篇，不是空页）',
      real.tl && real.tl.query === `token=${TOKEN}`, `${real.tl && real.tl.query} vs token=${TOKEN}`)
    ck('朋友圈那条的标题就是这一篇的标题（不是 undefined、不是应用名兜底）',
      real.tl && real.tl.title === real.shareTitle, `${real.tl && real.tl.title}`)
    ck('好友那条没被带坏：path 仍指向本页并带上同一个 token',
      real.am && real.am.path === `/pages/share/view?token=${TOKEN}`, real.am && real.am.path)
    ck('两条用的是同一个 token（不会出现好友能开、朋友圈点开是另一篇）',
      real.tl && real.am && real.am.path.indexOf(real.tl.query) > 0, `${real.tl.query} in ${real.am.path}`)

    // ---------- ③ 标题缺失时的兜底（现网真有这种码：建码之后标题被改成空） ----------
    // 这一条只在这个包真读到过 share 之后才判，且判的是"标题为空时那行字落在应用名上"。
    const fallback = await mp.evaluate(() => {
      const p = getCurrentPages().slice(-1)[0]
      const keep = p.data.share
      p.data.share = Object.assign({}, keep, { title: '' })
      const r = p.onShareTimeline()
      p.data.share = keep
      return { title: r.title, appName: (p.data.t || {}).appName || '', lang: p.data.lang }
    })
    ck('标题空着时朋友圈那行字兜到应用名，且跟着当前语言走',
      !!fallback.title && fallback.title === fallback.appName, `${fallback.title}（${fallback.lang}）`)
  }

  await mp.close()
  const bad = results.filter((r) => !r.ok).map((r) => r.name)
  const done = results.filter((r) => !r.skipped).length
  console.log(`\n合计 ${done} 条判据${results.some((r) => r.skipped) ? `（另有 ${results.length - done} 段跳过）` : ''}：${bad.length ? `✗ 红 ${bad.length} 条：${bad.join(' | ')}` : '全过'}`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => {
  console.log('✗ 过程未抛异常', '·', e.message)
  process.exit(1)
})
