// 首页成品弹窗那一层：改过标题之后再开，画布吃的是**现读**那份，不是第一次缓存进去那份。
// 跑法：docs/工具/跑尺子.sh 9431 验-成品弹窗现读正文-真跑
//
// 站长 10-07 真机报（两张截图）：「标题我已经改了，但生图时候还是旧标题」。
// 根因不在服务端（现读库里那篇 `title` 已是新那句、`updated_at` 就是他改的那一刻），
// 在 `pages/index/index.js` 的 `_ensurePosterAssets`：它原来一进来就按 noteId 整份短路，
// 而 `_renderPoster` 画的是 `this._posterAssets.note`——第一次开过这篇之后，
// 改完标题回到首页再开弹窗，画布照画缓存里那份旧字。笔记卡片页（pages/share）没这毛病，
// 它每次 onLoad 现拉，所以症状只在首页这一层。
//
// 这一把怎么做到一个字都不写现网：先把 `_posterAssets` 灌成一份**假缓存**（旧字 + 假 token +
// 假码路径），再调一次 `_ensurePosterAssets(同一篇)`。
// ① 正文换成了服务器那份真字 → 证明那次 GET 真发了、缓存没把正文钉住；
// ② token 与码路径**仍是灌进去那两个假值** → 证明 `createShare` 与下载码那两步没跑，
//    也就是"缓存该留的那一半还留着"（这一条同时是"没写现网"的证据）。
// 收尾把 `_posterAssets` 原样放回，不留我造的那份假缓存。
const automator = require('miniprogram-automator')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

const 假标题 = '@@缓存里那份旧字@@'
const 假token = 'cloud://fake-token-not-a-share'
const 假码路径 = '/local/fake-qr.png'

;(async () => {
  let mp = null
  for (let i = 0; i < 6 && !mp; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上 9431，先跑 cli auto')

  // 每一跳都重试：路由与读页抢那一瞬会抛 automator 内部错，那是工具不是判据。
  const hop = async (label, fn, tries) => {
    let last = null
    for (let i = 0; i < (tries || 6); i += 1) {
      try { return await fn() } catch (e) { last = e; await sleep(6000) }
    }
    throw new Error(`${label} 连试六次都没成：${last && last.message}`)
  }
  const ev = (label, fn, arg) => hop(label, () => mp.evaluate(fn, arg))

  await hop('进首页', () => mp.callWxMethod('reLaunch', { url: '/pages/index/index' }))
  await sleep(2500)

  const picked = await ev('挑一篇现成的非私密笔记', () => {
    const p = getCurrentPages()[0]
    const ns = (p && p.data && p.data.notes) || []
    const first = ns.find((n) => !n.is_private)
    return first ? { id: first.id, title: first.title || '' } : null
  })
  ck('这一台账号里读得到一篇非私密笔记（全程只读这一篇）', !!picked, picked && picked.id)
  if (!picked) { console.log('\n红 1 条'); process.exit(1) }

  const before = await ev('把原缓存抄下来（收尾要放回）', (arg) => {
    const p = getCurrentPages()[0]
    const old = p._posterAssets || null
    p.__restore = old
    p._posterAssets = { noteId: arg.id, note: { id: arg.id, title: arg.fakeTitle }, token: arg.fakeToken, qrPath: arg.fakeQr }
    return { seeded: p._posterAssets.note.title, had: old ? old.noteId : null }
  }, { id: picked.id, fakeTitle: 假标题, fakeToken: 假token, fakeQr: 假码路径 })
  ck('假缓存真灌进去了（这一步没落上，后面三条就都是在判空气）',
    before.seeded === 假标题, `${before.seeded}　（跑之前那层缓存的是 ${before.had == null ? '空' : before.had}）`)

  const after = await ev('再走一遍开窗取数那一步', async (arg) => {
    const p = getCurrentPages()[0]
    await p._ensurePosterAssets(arg.id)
    const a = p._posterAssets || {}
    return { title: (a.note && a.note.title) || '', summary: (a.note && a.note.summary) || '', token: a.token || '', qrPath: a.qrPath || '' }
  }, { id: picked.id })

  ck('正文是现读那份（假缓存里那句旧字被真字换掉了）',
    after.title !== 假标题 && after.title.length > 0, `${after.title.slice(0, 24)} ← ${假标题}`)
  ck('现读到的就是列表那一行同一篇的真标题（不是拼出来的）',
    after.title === picked.title, `弹窗 ${after.title} vs 列表 ${picked.title}`)
  ck('码那两样仍吃缓存（`createShare` 与下载码没跑＝这一趟一个字都没写现网）',
    after.token === 假token && after.qrPath === 假码路径, `${after.token} / ${after.qrPath}`)
  ck('换掉的是整份 note（摘要这些也跟着是新的，不是只补一个 title 键）',
    typeof after.summary === 'string' && after.summary.length > 0, `${after.summary.slice(0, 20)}…`)

  const restored = await ev('收尾：缓存原样放回，不留我造的那份', () => {
    const p = getCurrentPages()[0]
    const old = p.__restore || null
    p._posterAssets = old
    delete p.__restore
    return { now: p._posterAssets ? p._posterAssets.noteId : null, token: p._posterAssets ? p._posterAssets.token : '' }
  })
  ck('假缓存清干净了', restored.now === null || restored.token !== 假token, JSON.stringify(restored))

  console.log(`\n${bad.length === 0 ? '全过' : `红 ${bad.length} 条`}`)
  bad.forEach((n) => console.log(`  ✗ ${n}`))
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.log('ERR', e && e.message); process.exit(1) })
