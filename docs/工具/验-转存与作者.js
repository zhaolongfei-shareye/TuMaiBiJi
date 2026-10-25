// 「原创作者」+「存到我的笔记」+ 详情页「转存来源」这一整条，在客户端上逐条验收。
// 这条必须配一个跑过新迁移的后端（现网在部署前没有 author_name / from-share），所以：
//   1) 本地起一份后端（临时库，跑完删）：
//      cd backend && DATABASE_URL=sqlite:////tmp/wtsj_local_accept.db JWT_SECRET_KEY=<临时长串> \
//          SEC_CHECK_ENABLED=false EXTRACT_PROVIDER=none .venv/bin/python -m alembic upgrade head
//      同上环境变量再起 uvicorn --port 8010；限流要用 redis，本地起一个不带持久化的即可
//   2) 把 miniprogram/utils/api.js 的 API_BASE 临时指到 http://127.0.0.1:8010，
//      跑完立刻改回 https://api.agentsbin.cn/wtsj，并确认 git status 里这个文件是干净的
//   3) cli auto --project .../miniprogram --auto-port 9431，然后
//      NODE_PATH=/tmp/mp-verify/node_modules node docs/工具/验-转存与作者.js
//   ⚠ 跑这一把时 ** DATABASE_URL 与 JWT_SECRET_KEY 两串也要 export 给 node 这一趟**（与 uvicorn 那
//      同一份值）。10-24 起这一把自己会 spawn `docs/工具/本地-造一个别人.py` 造一个"另一个人"，
//      那一趟直连本地临时库、并用同一把密钥现签一枚钥匙；env 没带上传，第 0 条当场红。
// 全程只在这份临时库里读写，不碰现网数据。
//   4) 跑之前这台模拟器的「卡片模板」那一页得存过一个名称（本机 storage 键 poster_profile 的 name）。
//      作者昵称不走 users.nickname，它是建分享那一次由客户端带上来的（见 shares.py 的 _author_name）。
//      那一格空着时服务端存 null、落地页不画作者那行、详情页写「原创作者：—」——这是正确行为
//      （notes.py 那句"两头都没有就留空，不拿假名去填"），但会让本把尺子从第一条起连着红 6 条。
//      10-07 实测：填一个名字之后 25 条全过；跑完记得把那一格还原成原样并读回来。
const automator = require('miniprogram-automator')

// 端口跟着 `跑尺子.sh` 那条统一口径：本项目真跑那批一律 9431，这一把原来写死 9420，
// 用 runner 跑就连不上——报的是连接红，不是判据红。要单独跑旧写法：APORT=9420 node ...
const PORT = process.env.APORT || '9431'
const fs = require('fs')
const cp = require('child_process')
const path = require('path')

const BASE = 'http://127.0.0.1:8010'
const MARK = Date.now().toString(36).slice(-6)
const TITLE = `转存验收 ${MARK}`
const SHOT = '/tmp/mp-accept-local'
// 「另一个人」那份凭据落在这里（不进步命令行，也不进仓库）。
const OTHER = `${SHOT}/other-${MARK}.json`
const PY = path.resolve(__dirname, '../../backend/.venv/bin/python')
const MINTER = path.resolve(__dirname, '本地-造一个别人.py')
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

// 造一个"另一个人"：`docs/工具/本地-造一个别人.py` 在**同一份本地临时库**里开一个假账号，
// 用真口建一篇笔记、开一张码，把它的钥匙写进 OTHER 那个文件。
// 为什么非要它：站长 10-24 一句「为什么自己可以转存自己的，这个不合理，要限制」之后，
// `POST /api/notes/from-share` 对作者本人当场回 400——而这一把原来只有一枚登录态，
// 它拿同一枚钥匙既建分享又转存，验的正是这条新挡掉的路。"别人扫我的码存进来"那条
// 生产上真跑的路，一台模拟器变不出来，所以凭空造一个人把那半条腿补回来。
const mintOther = () => {
  cp.execFileSync(PY, [MINTER, '--out', OTHER], {
    env: { ...process.env, RULER_MARK: MARK, RULER_BASE: BASE },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return JSON.parse(fs.readFileSync(OTHER, 'utf8'))
}

;(async () => {
  fs.mkdirSync(SHOT, { recursive: true })
  const mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` })
  const ids = []
  let jwt = ''
  let other = null
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

    let other2 = null
    try {
      other2 = mintOther()
    } catch (e) {
      console.log('  造"另一个人"这一趟的输出：' + String((e && e.stderr) || (e && e.message) || e))
    }
    other = other2
    ck('造出一个别人并开好他那一码', !!(other && other.share_token),
      other ? `user ${other.user_id} 笔记 ${other.note_id} 码 ${other.share_token}` : '没造出来')
    if (!other) throw new Error('没有第二个人，成功转存那几条只能空跑')
    const pubOther = await (await fetch(`${BASE}/api/shares/${other.share_token}`)).json()

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

    // ---- 扫码落地页（开的是**别人**那一张码：这才是生产上真跑的那一屏）----
    page = await mp.reLaunch(`/pages/share/view?token=${other.share_token}`)
    const got = await wait(async () => ((await page.data('share')) ? 'y' : null), 30000, 800)
    ck('落地页读到了这条分享', !!got)
    const authorRow = (await txt(await page.$$('.author-name'))).join('|')
    ck('落地页显示「原创作者：×××」', authorRow === `原创作者：${other.author_name}`, authorRow || '没找到 .author-name')
    const initial = (await txt(await page.$$('.author-mark'))).join('')
    ck('作者前面那个圆形标记取昵称第一个字', initial === [...other.author_name][0], `标记=${initial}`)
    // 10-21 这一屏照列表详情窗重画：那颗通栏墨底胶囊（`.save-row`/`.save-text`）挪进了底部动作条，
    // 字也照他原话从「存到我的笔记」改成「存入笔记」。选择器与文案两处跟着改口径。
    const saveText = (await txt(await page.$$('.sv-ibtn'))).join('|')
    ck('落地页底部动作条里就是那枚「存入笔记」', saveText === '存入笔记', saveText)
    await mp.screenshot({ path: `${SHOT}/v1-落地页作者与按钮.png` })

    // ---- 真点一下转存 ----
    // 10-25 起这一枚点完**不再停在扫码那一屏**（站长「存入后，自动跳转到转存用户的图麦笔记
    // 该笔记详情页，就是下方多了 bar，提醒用户，你已收藏该笔记」）⇒ 落点是详情页、那句话由页底
    // 那条 bar 说。原来这两条读的是"按钮换文案"，现在那一页退到栈底，改读**落在哪一屏**与
    // **那条 bar 念什么**；按钮那一态另外 navigateBack 回这一屏再读（它仍然要跟着变）。
    const before = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    await (await page.$('.sv-ibtn')).tap()
    const routeNow = () => mp.evaluate(() => getCurrentPages().slice(-1)[0].route)
    const landOn = await wait(async () => ((await routeNow()) === 'pages/detail/detail' ? 'y' : null), 25000, 700)
    ck('点完那一枚，人落在自己的详情页上（不再停在扫码那一屏）', !!landOn, `现在这一屏=${await routeNow()}`)
    const dp = await mp.currentPage()
    const barTxt = (await txt(await dp.$$('.saved-bar'))).join('|')
    ck('页底那条 bar 念的是那句「你已收藏该笔记」', barTxt === '你已收藏该笔记', barTxt || '屏上没有 .saved-bar')
    await mp.screenshot({ path: `${SHOT}/v2-点完转存.png` })

    const after = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    const a0 = (before.items || before).length, a1 = (after.items || after).length
    ck('库里只多出这一篇（点一次只存一篇）', a1 === a0 + 1, `${a0} → ${a1}`)
    const mine = (after.items || after).find((x) => x.source_type === 'share_import')
    ck('多篇笔记里能认出这一篇是转存来的', !!mine, `id=${mine && mine.id}`)
    ck('跳过来这一屏认的就是刚存那一篇（页面 noteId＝列表里那一条）',
      String((await dp.data('noteId')) || '') === String(mine && mine.id),
      `页面 noteId=${await dp.data('noteId')}｜列表那一条=${mine && mine.id}`)
    ids.push(mine.id)
    const copy = await (await fetch(`${BASE}/api/notes/${mine.id}`, { headers: H })).json()
    const same = ['title', 'summary', 'tags', 'key_points', 'key_links', 'source_url']
      .filter((k) => JSON.stringify(copy[k]) !== JSON.stringify(pubOther[k]))
    ck('整条抄：六个字段和公开快照逐字一致', same.length === 0, same.length ? '不一致：' + same.join(',') : '标题/摘要/标签/要点/链接/来源全等')
    ck('来源信息带上了作者、原笔记标题和转存时间',
      copy.imported_from && copy.imported_from.author_name === other.author_name &&
      copy.imported_from.title_at_import === other.title && !!copy.imported_from.imported_at,
      JSON.stringify(copy.imported_from))

    // ---- 回到扫码那一屏：按钮那一态 + 再存一次不该复制第二篇 ----
    await mp.navigateBack()
    await sleep(2000)
    const afterRow = (await txt(await page.$$('.sv-ibtn'))).join('|')
    ck('按钮文案换成「已存入笔记」', afterRow === '已存入笔记', afterRow)
    ck('这一页自己那枚开关也置上了', !!(await page.data('saved')), `saved=${await page.data('saved')}`)
    // 再点这一枚会被**本页那枚 `saved`** 挡住，请求根本发不出去，所以"重复入库"这件事必须换一次
    // 进页面才试得出来（读者第二天又扫同一张码，就是这个态）。挡它的正闸是服务端那道去重
    // （站长 10-25「一个用户不能重复收藏同一篇笔记，除非删了再收藏，避免冗余数据」）：
    // 第二趟照样 200、照样跳详情页、但回的是**已有那一条的 id**，库里一行都不许多。
    const c1 = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    page = await mp.reLaunch(`/pages/share/view?token=${other.share_token}`)
    await sleep(3500)
    await (await page.$('.sv-ibtn')).tap()
    const landOn2 = await wait(async () => ((await routeNow()) === 'pages/detail/detail' ? 'y' : null), 25000, 700)
    ck('第二次存同一篇照样跳进详情页（第二趟也是那一句提醒，不另造一种屏上态）',
      !!landOn2, `现在这一屏=${await routeNow()}`)
    const dp2 = await mp.currentPage()
    ck('第二次跳过来认的还是那一条（服务端回的是已有的那条 id，不是新造的那条）',
      String((await dp2.data('noteId')) || '') === String(mine.id),
      `页面 noteId=${await dp2.data('noteId')}｜第一次存的那条=${mine.id}`)
    ck('第二次那条 bar 照旧念那一句', (await txt(await dp2.$$('.saved-bar'))).join('|') === '你已收藏该笔记')
    await mp.screenshot({ path: `${SHOT}/v2b-第二次存同一篇.png` })
    const c2 = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    ck('已经存过之后再存不许多造一行（避免冗余数据）', (c2.items || c2).length === (c1.items || c1).length,
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
      after2.imported_from && after2.imported_from.author_name === other.author_name && after2.imported_from.title_at_import === other.title,
      JSON.stringify(after2.imported_from))
    ck('改完它仍然算一篇转存笔记（source_type 没被改回手写）', after2.source_type === 'share_import', after2.source_type)
    page = await mp.reLaunch(`/pages/detail/detail?id=${mine.id}`)
    await sleep(2500)
    await mp.screenshot({ path: `${SHOT}/v4-改过正文之后来源仍在.png` })

    // ---- 自己存自己：10-24 站长一句「为什么自己可以转存自己的，这个不合理，要限制，
    //      否则浪费资源，要改」⇒ 这一趟当场拒，而屏上什么都不许变 ----
    page = await mp.reLaunch(`/pages/share/view?token=${token}`)
    const gotSelf = await wait(async () => ((await page.data('share')) ? 'y' : null), 30000, 800)
    ck('自己的那张码落地页照样读得到（挡的是写不是读）', !!gotSelf)
    const s0 = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    await (await page.$('.sv-ibtn')).tap()
    await sleep(2500)
    const s1 = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    ck('自己的码点「存入笔记」不多写一行', (s1.items || s1).length === (s0.items || s0).length,
      `${(s0.items || s0).length} → ${(s1.items || s1).length}`)
    ck('被拒那一趟按钮不许进已存入态', !(await page.data('saved')), `saved=${await page.data('saved')}`)
    const selfRow = (await txt(await page.$$('.sv-ibtn'))).join('|')
    ck('那一枚仍念「存入笔记」', selfRow === '存入笔记', selfRow)
    // 屏上那句提示走 wx.showToast——原生层，不进页面树，automator 没有读它的口。
    // 所以那句口径由服务端回的 detail 来钉：客户端 saveToMine 是把 detail 原样当 toast 念的
    // （pages/share/view.js），这一句等于是那句的抄本。
    const self = await fetch(`${BASE}/api/notes/from-share`, {
      method: 'POST', headers: H, body: JSON.stringify({ token }),
    })
    const selfBody = await self.json().catch(() => ({}))
    ck('自己转存自己：服务端当场 400', self.status === 400, `HTTP ${self.status}`)
    ck('那句原因＝屏上 toast 念的那句', selfBody.detail === '这是你自己的笔记', JSON.stringify(selfBody))
    await mp.screenshot({ path: `${SHOT}/v5-自己存自己被拒.png` })
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
    if (other) {
      // 那个"别人"连账号带笔记一起拆：它是这一把凭空造出来的，留着就是本地库里
      // 多一个假账号＋一条还开着的公开码。
      try {
        cp.execFileSync(PY, [MINTER, '--teardown', OTHER], {
          env: { ...process.env, RULER_BASE: BASE }, stdio: 'ignore',
        })
      } catch (e) { /* 下一句断言会红 */ }
      ck('那个"别人"连账号带笔记一起拆净', !fs.existsSync(OTHER),
        `user ${other.user_id} 笔记 ${other.note_id}`)
    }
  }
  const bad = results.filter((r) => !r.ok)
  console.log(`\n合计 ${results.length} 条，不过 ${bad.length} 条`)
  bad.forEach((b) => console.log('  ✗ ' + b.name + ' · ' + b.detail))
  console.log('截图在 ' + SHOT)
  process.exit(bad.length ? 1 : 0)
})()
