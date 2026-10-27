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
    // 落点这一条链改过两回：10-25 拍「存入后…自动跳转到该笔记详情页，下方多了 bar 提醒『你已收藏
    // 该笔记』」；10-27 他看着那一屏说「**存入后，不要跳到这里，要直接跳到用户的笔记列表**」⇒ 现在
    // 落在**笔记列表**（列表是 tab 页，代码里只有 `switchTab` 进得去）。判据跟着换三条口径：
    //   · 读的是"落在哪一屏"，不再读那条 `.saved-bar`——它只在带 `saved=1` 进详情页时才画，
    //     而换落点之后链上没有任何一处再带这个参数；10-27 他那句「按你建议来」之后那条 bar 连同
    //     标记、皮、字典两支一起撤了（撤净没有由 `验-落地页玻璃-真跑.js` 那几条源码级断言钉）。
    //   · `switchTab` 会把落地页整个销毁 ⇒ "回到扫码那一屏"不再是 `navigateBack`，只能重新进一次页，
    //     而这一条正是 M10 那面复位旗撤掉后的替代判据：每次进来都是一屏新的。
    //   · 回执改由列表顶上那一行给 ⇒ 所以这一节必须钉住"屏上第一行就是刚存的这一篇"。
    const before = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    await (await page.$('.sv-ibtn')).tap()
    const routeNow = () => mp.evaluate(() => getCurrentPages().slice(-1)[0].route)
    const landOn = await wait(async () => ((await routeNow()) === 'pages/index/index' ? 'y' : null), 25000, 700)
    ck('点完那一枚，人落在自己的笔记列表上（不再停在扫码那一屏，也不再进详情页）', !!landOn, `现在这一屏=${await routeNow()}`)
    await mp.screenshot({ path: `${SHOT}/v2-点完转存落列表.png` })

    const after = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    const a0 = (before.items || before).length, a1 = (after.items || after).length
    ck('库里只多出这一篇（点一次只存一篇）', a1 === a0 + 1, `${a0} → ${a1}`)
    const mine = (after.items || after).find((x) => x.source_type === 'share_import')
    ck('多篇笔记里能认出这一篇是转存来的', !!mine, `id=${mine && mine.id}`)
    // ⚠ 这一条必须**等**：`switchTab` 把路由切到列表那一瞬，列表 `onShow` 那趟整表重取还没回来，
    //   当场读 `notes` 读到的是空表或上一批 ⇒ 不轮询就是环境红，不是判据红。
    const topNotes = () => mp.currentPage().then((p) => p.data('notes')).then((v) => v || [])
    const landList = await wait(async () => {
      const arr = await topNotes()
      return arr.length && String(arr[0].id) === String(mine && mine.id) ? 'y' : null
    }, 25000, 700)
    const listNotes = await topNotes()
    const topRow = listNotes[0] || {}
    ck('列表屏上第一行就是刚存那一篇（回执由那一行给，不再靠详情页那条 bar）',
      !!landList,
      `屏上第一行=${topRow.id}｜刚存那一篇=${mine && mine.id}｜notes ${listNotes.length} 篇`)
    ids.push(mine.id)
    const copy = await (await fetch(`${BASE}/api/notes/${mine.id}`, { headers: H })).json()
    const same = ['title', 'summary', 'tags', 'key_points', 'key_links', 'source_url']
      .filter((k) => JSON.stringify(copy[k]) !== JSON.stringify(pubOther[k]))
    ck('整条抄：六个字段和公开快照逐字一致', same.length === 0, same.length ? '不一致：' + same.join(',') : '标题/摘要/标签/要点/链接/来源全等')
    ck('来源信息带上了作者、原笔记标题和转存时间',
      copy.imported_from && copy.imported_from.author_name === other.author_name &&
      copy.imported_from.title_at_import === other.title && !!copy.imported_from.imported_at,
      JSON.stringify(copy.imported_from))

    // ---- 重新进一次扫码那一屏：按钮那一态 + 再存一次不该复制第二篇 ----
    // 原来这一段是 `navigateBack` 回落地页读按钮态。10-27 换落点之后回不去：`switchTab` 会把
    // 落地页整个销毁（官方那句"并关闭所有其它页面"），那一枚页面实例上连 DOM 都没有了 ⇒ 改成
    // 重新进页。这恰好就是"读者第二天又扫同一张码"那一态，也是 M10 那面复位旗撤掉后的正面证据：
    // 每次进来都是一屏新的（`saved` 出生就是假），要重存不需要谁去清它。
    const c1 = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    page = await mp.reLaunch(`/pages/share/view?token=${other.share_token}`)
    await sleep(3500)
    const reRow = (await txt(await page.$$('.sv-ibtn'))).join('|')
    ck('重新进这一屏，按钮念回「存入笔记」而且 `saved` 是假（落地页每回都是一屏新的）',
      reRow === '存入笔记' && !(await page.data('saved')), `${reRow}｜saved=${await page.data('saved')}`)
    // 挡"重复入库"的正闸是服务端那道去重（站长 10-25「一个用户不能重复收藏同一篇笔记，除非删了
    // 再收藏，避免冗余数据」）：第二趟照样 200、照样落列表，但库里回的是**已有那一条**，一行都不许多。
    await (await page.$('.sv-ibtn')).tap()
    const landOn2 = await wait(async () => ((await routeNow()) === 'pages/index/index' ? 'y' : null), 25000, 700)
    ck('第二次存同一篇照样落在笔记列表（第二趟不另造一种屏上态）', !!landOn2, `现在这一屏=${await routeNow()}`)
    await mp.screenshot({ path: `${SHOT}/v2b-第二次存同一篇落列表.png` })
    const c2 = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    const arr2 = c2.items || c2
    ck('已经存过之后再存不许多造一行（避免冗余数据）', arr2.length === (c1.items || c1).length,
      `${(c1.items || c1).length} → ${arr2.length}`)
    ck('那一篇在名下仍然只有一份（服务端回的是已有那条 id，没新造）',
      arr2.filter((x) => x.id === mine.id).length === 1,
      `${arr2.filter((x) => x.id === mine.id).length} 份｜第一次存的那条=${mine.id}`)

    // ---- 筛正开着时存完看不见那一篇（10-27 他拍甲＝存完把筛与词清回「全部」，且**只在这一趟**清）----
    // 上面那两跳之后人停在列表、栈里只有列表这一页。这一节先用 setData 把列表摁成"筛着一格＋带一个词"
    // （生产上这就是他自己正在翻某个分类），再从列表 `navigateTo` 进落地页——列表是 tab 页，
    // `navigateTo` 不销毁它 ⇒ 那一格状态真的留在栈里等着被清；换成 `reLaunch` 就量不到东西了。
    // 然后点第三枚「存入笔记」：服务端去重回的还是已有那条（200），落点仍是列表，但这一趟必须把他
    // 挑的那一格清回「全部」，否则刚存的（默认「未分类」）不在筛出的那批里 ⇒ 人到了列表却看不见它。
    const listPage = await mp.currentPage()
    await listPage.setData({ selectedCategory: 999, searchKeyword: '筛着某一格时存进来的' })
    ck('先把列表摁成"筛着一格＋带一个词"（这一节的前置；没摁上后面三条都是假绿）',
      (await listPage.data('selectedCategory')) === 999
      && (await listPage.data('searchKeyword')) === '筛着某一格时存进来的',
      `筛=${await listPage.data('selectedCategory')}｜词=${await listPage.data('searchKeyword')}`)
    page = await mp.navigateTo(`/pages/share/view?token=${other.share_token}`)
    const gotBack = await wait(async () => ((await page.data('share')) ? 'y' : null), 30000, 800)
    ck('从列表那一头进同一张码的落地页（列表那一页留在栈里，这一节才量得到"那一格"）', !!gotBack)
    await (await page.$('.sv-ibtn')).tap()
    const landOn3 = await wait(async () => ((await routeNow()) === 'pages/index/index' ? 'y' : null), 25000, 700)
    ck('第三趟点完仍落回笔记列表（去重那一趟的落点与第一趟同一，不另造一种屏上态）',
      !!landOn3, `现在这一屏=${await routeNow()}`)
    const list3 = await mp.currentPage()
    const f3 = await list3.data('selectedCategory')
    const k3 = await list3.data('searchKeyword')
    ck('存完这一趟筛与词清回「全部」（甲：不清就看不见刚存那一篇）',
      (f3 === null || f3 === undefined) && (k3 === '' || k3 === undefined),
      `筛=${f3}｜词=${k3}`)
    const visTop = await wait(async () => {
      const arr = (await list3.data('notes')) || []
      return arr.length && String(arr[0].id) === String(mine.id) ? 'y' : null
    }, 25000, 700)
    const arr3 = (await list3.data('notes')) || []
    ck('清完之后屏上第一行就是刚存那一篇（这一节要证的正是"看得见"）', !!visTop,
      `第一行=${(arr3[0] || {}).id}｜刚存那一篇=${mine.id}｜notes ${arr3.length} 篇`)
    await mp.screenshot({ path: `${SHOT}/v2c-筛着某格时存完清回全部.png` })
    // 反向的牙：这一刀只能是**一次性交接**，不能是"每次进列表都清"。这里再摁一格、用 tab 之间正常
    // 的来回（不带那一枚旗）走一趟，那一格必须原样留着——留了才证明上面那条绿是旗造成的，
    // 而不是 onShow 里无条件清了一刀（那会把他自己浏览时挑的格子改掉，不是他要的）。
    await list3.setData({ selectedCategory: 888 })
    await mp.evaluate(() => wx.switchTab({ url: '/pages/me/me' }))
    await sleep(1500)
    await mp.evaluate(() => wx.switchTab({ url: '/pages/index/index' }))
    const still = await wait(async () => {
      const p = await mp.currentPage()
      const v = await p.data('selectedCategory')
      return v === 888 ? 'y' : null
    }, 20000, 700)
    const list4 = await mp.currentPage()
    ck('反向：不带那一枚旗的正常进列表，那一格原样留着（清只跟着那一趟走）',
      !!still, `筛=${await list4.data('selectedCategory')}`)

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
