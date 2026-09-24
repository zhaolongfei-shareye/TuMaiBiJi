// 「原创作者」+「存到我的笔记」+ 详情页「转存来源」这一整条，在客户端上逐条验收。
// 这条必须配一个跑过新迁移的后端（现网在部署前没有 author_name / from-share），所以：
//   1) 本地起一份后端（临时库，跑完删）：
//      cd backend && DATABASE_URL=sqlite:////tmp/wtsj_local_accept.db JWT_SECRET_KEY=<临时长串> \
//          SEC_CHECK_ENABLED=false EXTRACT_PROVIDER=none .venv/bin/python -m alembic upgrade head
//      同上环境变量再起 uvicorn --port 8010；限流要用 redis，本地起一个不带持久化的即可
//   2) 把 miniprogram/utils/api.js 的 API_BASE 临时指到 http://127.0.0.1:8010，
//      跑完立刻改回 https://api.agentsbin.cn/wtsj，并确认 git status 里这个文件是干净的
//   3) cli auto --project .../miniprogram --auto-port 9420，然后
//      NODE_PATH=/tmp/mp-verify/node_modules node docs/工具/验-转存与作者.js
// 全程只在这份临时库里读写，不碰现网数据。
const automator = require('miniprogram-automator')
const fs = require('fs')

const BASE = 'http://127.0.0.1:8010'
const MARK = Date.now().toString(36).slice(-6)
const TITLE = `转存验收 ${MARK}`
const SHOT = '/tmp/mp-accept-local'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const ck = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail: detail || '' })
  console.log(`${ok ? '✓' : '✗'} ${name}` + (detail ? `  · ${detail}` : ''))
}
const wait = async (fn, ms, step) => {
  const until = Date.now() + ms
  for (;;) {
    let v
    try { v = await fn() } catch (e) { v = null }
    if (v) return v
    if (Date.now() > until) return null
    await sleep(step || 800)
  }
}
const txt = async (els) => {
  const out = []
  for (const e of els) { try { out.push((await e.text()).trim()) } catch (e2) { out.push('') } }
  return out
}

;(async () => {
  fs.mkdirSync(SHOT, { recursive: true })
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' })
  const ids = []
  let jwt = ''
  try {
    await mp.reLaunch('/pages/create/create')
    await sleep(2000)
    jwt = (await wait(() => mp.evaluate(() => { const a = getApp(); return (a.globalData.isLoggedIn && a.globalData.token) || '' }), 60000)) || ''
    ck('小程序在本地实例上登录成功', jwt.length > 30, `JWT 长度 ${jwt.length}`)
    if (!jwt) throw new Error('没登录，后面全是空跑')
    const H = { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` }
    const me = await (await fetch(`${BASE}/api/user/me`, { headers: H })).json().catch(() => ({}))
    const myName = (me && me.nickname) || ''
    console.log(`  本地账号 id=${me && me.id} 昵称=${myName || '（空）'}`)

    // 作者昵称是从「卡片模板」那页带上去的：存的什么名字，落地页就该显示什么
    const profile = (await mp.evaluate(() => wx.getStorageSync('poster_profile') || {})) || {}
    const authorName = (profile.name || '').trim()
    ck('读到他「卡片模板」里存的名称', !!authorName, `名称=「${authorName}」（空的话落地页这行本来就不该出现）`)

    const cr = await fetch(`${BASE}/api/notes/`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        title: TITLE, summary: '整条都要抄过去，一个字不落地。', tags: ['验收', '转存'],
        key_points: ['要点甲', '要点乙'], key_links: ['https://example.com/whole'], source_url: 'https://example.com/whole',
      }),
    })
    const src = (await cr.json())
    ids.push(src.id)
    ck('本地建了一条原始笔记', cr.status === 200 && !!src.id, `id=${src.id}`)

    // ---- 走真页面：笔记卡片页会自动建分享（把昵称带给服务器）----
    let page = await mp.reLaunch(`/pages/share/share?id=${src.id}`)
    const ok0 = await wait(async () => (await page.data('imagePath')) ? 'y' : null, 90000, 1500)
    ck('笔记卡片页出图（这一步会向服务端登记作者昵称）', !!ok0)
    const st = await (await fetch(`${BASE}/api/shares/status?note_id=${src.id}`, { headers: H })).json()
    const token = st.token
    ck('这篇笔记确实开着一张码', st.active === true && !!token, `token=${token}`)
    const pub = await (await fetch(`${BASE}/api/shares/${token}`)).json()
    ck('服务端存下的作者昵称＝页面里存的那个', pub.author_name === authorName, `服务端=${pub.author_name}`)

    // ---- 扫码落地页 ----
    page = await mp.reLaunch(`/pages/share/view?token=${token}`)
    const got = await wait(async () => ((await page.data('share')) ? 'y' : null), 30000, 800)
    ck('落地页读到了这条分享', !!got)
    const authorRow = (await txt(await page.$$('.author-name'))).join('|')
    ck('落地页显示「原创作者：×××」', authorRow === `原创作者：${authorName}`, authorRow || '没找到 .author-name')
    const initial = (await txt(await page.$$('.author-mark'))).join('')
    ck('作者前面那个圆形标记取昵称第一个字', initial === [...authorName][0], `标记=${initial}`)
    const saveText = (await txt(await page.$$('.save-text'))).join('|')
    ck('落地页底部有「存到我的笔记」这颗按钮', saveText === '存到我的笔记', saveText)
    await mp.screenshot({ path: `${SHOT}/v1-落地页作者与按钮.png` })

    // ---- 真点一下转存 ----
    const before = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    await (await page.$('.save-row')).tap()
    const done = await wait(async () => ((await page.data('saved')) ? 'y' : null), 20000, 700)
    ck('点一下之后按钮变成已存的状态', !!done, `saved=${await page.data('saved')}`)
    const afterRow = (await txt(await page.$$('.save-text'))).join('|')
    ck('按钮文案换成「已存到我的笔记」', afterRow === '已存到我的笔记', afterRow)
    await mp.screenshot({ path: `${SHOT}/v2-点完转存.png` })

    const after = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    const a0 = (before.items || before).length, a1 = (after.items || after).length
    ck('库里只多出这一篇（点一次只存一篇）', a1 === a0 + 1, `${a0} → ${a1}`)
    const mine = (after.items || after).find((x) => x.source_type === 'share_import')
    ck('多篇笔记里能认出这一篇是转存来的', !!mine, `id=${mine && mine.id}`)
    ids.push(mine.id)
    const copy = await (await fetch(`${BASE}/api/notes/${mine.id}`, { headers: H })).json()
    const same = ['title', 'summary', 'tags', 'key_points', 'key_links', 'source_url']
      .filter((k) => JSON.stringify(copy[k]) !== JSON.stringify(pub[k]))
    ck('整条抄：六个字段和公开快照逐字一致', same.length === 0, same.length ? '不一致：' + same.join(',') : '标题/摘要/标签/要点/链接/来源全等')
    ck('来源信息带上了作者、原笔记标题和转存时间',
      copy.imported_from && copy.imported_from.author_name === authorName &&
      copy.imported_from.title_at_import === TITLE && !!copy.imported_from.imported_at,
      JSON.stringify(copy.imported_from))

    // ---- 再点一次不该复制第二篇 ----
    const c1 = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    await (await page.$('.save-row')).tap()
    await sleep(2500)
    const c2 = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    ck('已经存过之后再点不会重复入库', (c2.items || c2).length === (c1.items || c1).length,
      `${(c1.items || c1).length} → ${(c2.items || c2).length}`)

    // ---- 详情页那一栏来源 ----
    page = await mp.reLaunch(`/pages/detail/detail?id=${mine.id}`)
    await sleep(2500)
    const panel = await txt(await page.$$('.import-panel .import-line'))
    const hint = (await txt(await page.$$('.import-hint'))).join('|')
    ck('详情页出现「转存来源」这块', panel.length === 3, panel.join(' / '))
    ck('这块里写明作者、原笔记、转存于',
      panel.some((x) => x.startsWith('原创作者：')) && panel.some((x) => x.startsWith('原笔记：')) && panel.some((x) => x.startsWith('转存于：')),
      panel.join(' ｜ '))
    ck('写明「来源信息会一直保留，不能编辑」', hint === '来源信息会一直保留，不能编辑', hint)
    const editables = (await page.$$('.import-panel input')).length + (await page.$$('.import-panel textarea')).length +
      (await page.$$('.import-panel .btn-share')).length
    ck('这块里没有任何可编辑控件或按钮', editables === 0, `找到 ${editables} 个`)
    await mp.screenshot({ path: `${SHOT}/v3-详情页来源栏.png` })

    // 编辑这篇笔记之后来源还在不在
    const put = await fetch(`${BASE}/api/notes/${mine.id}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ title: '我自己改过标题', summary: '改过的摘要', imported_from: { author_name: '李鬼' }, source_type: 'manual' }),
    })
    const after2 = await (await fetch(`${BASE}/api/notes/${mine.id}`, { headers: H })).json()
    ck('改正文能改（标题确实变了）', put.status === 200 && after2.title === '我自己改过标题', `title=${after2.title}`)
    ck('改完来源那栏一个字没动',
      after2.imported_from && after2.imported_from.author_name === authorName && after2.imported_from.title_at_import === TITLE,
      JSON.stringify(after2.imported_from))
    ck('改完它仍然算一篇转存笔记（source_type 没被改回手写）', after2.source_type === 'share_import', after2.source_type)
    page = await mp.reLaunch(`/pages/detail/detail?id=${mine.id}`)
    await sleep(2500)
    await mp.screenshot({ path: `${SHOT}/v4-改过正文之后来源仍在.png` })
  } catch (err) {
    ck('过程未抛异常', false, String((err && err.message) || err))
  } finally {
    if (jwt) {
      const H = { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` }
      for (const id of ids.filter(Boolean)) {
        await fetch(`${BASE}/api/notes/${id}`, { method: 'DELETE', headers: H }).catch(() => {})
      }
      ck('本地这条测完已清干净', true, `删了 ${ids.filter(Boolean).length} 篇`)
    }
  }
  const bad = results.filter((r) => !r.ok)
  console.log(`\n合计 ${results.length} 条，不过 ${bad.length} 条`)
  bad.forEach((b) => console.log('  ✗ ' + b.name + ' · ' + b.detail))
  console.log('截图在 ' + SHOT)
  process.exit(bad.length ? 1 : 0)
})()
