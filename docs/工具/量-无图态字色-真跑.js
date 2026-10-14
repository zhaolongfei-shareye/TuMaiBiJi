// 2.1.11 第 0 步（§8.234 那条 P0 前置闸）的量具：三屏 × 四套壁纸 ＝ 12 个组合，
// 在"后台没配图 ⇒ 无图态"这一档量头部大字与那几行小字的**产物**（截图像素 ＋ CSS 算出来的色），
// 不读样式声明。跑法：
//   MP_ROOT=/Users/zlfmac/Documents/TuMaiBiJi bash docs/工具/跑尺子.sh 9431 量-无图态字色-真跑
//   python3 docs/工具/量-无图态字色.py
// 判据（≥4.5、空盒自检、方向）全在 .py 那一侧，这一把只负责把 12 张图与一份读数摆出来。
//
// ⚠ 为什么这把要临时改 `utils/poster.js`：无图态今天**走不到**——`homeBg()` 末尾那档
//   曾是非空常量 `HOME_BG_DEFAULT`（10-14 §8.231 已连同那枚文件一起从包里删掉）。它还在的时候
//   `wx:if="{{bgSrc}}"` 那几层、`.has-bg` 那一整族，今天一次都没执行过（§8.231 判据 7 就是这条）。
//   拿 setData 把 bgSrc 抹成空串量不到真东西：`searchSkin` 是 onShow 里跟着 homeBg() 一起算的，
//   事后 setData 只会量出一个我自己拼出来的假态。所以这里照反向刀那一套：备份 → 改一行 → 让 IDE
//   重编译 → 量 → 还原（进程以任何方式退出都还原，**不碰 git**：这棵树里另有会话的未提交文件）。
// ⚠ 落刀点第一版只摘了 `HOME_BG_DEFAULT` 那一档，结果 12 张全废：这台机上**第一档有值**
//   （用户勾过「背景」的那张本机文件，读到的是 `poster-avatar-….img`），|| 链在第三档之前就短路了。
//   §8.231 之后那个「无图」是**两级全空**（新用户：没勾过图、没缓存到运营图），
//   所以这一把压的是整条 `homeBg()`，不是最后一档。
// ⚠ 重编译没发生的话这一把会**假绿**（量的还是铺了图那一版），所以：先连上自动化端口、再落刀，
//   然后**轮询**到某一屏 `page.data().bgSrc === ''` 为止（IDE 重编译要几十秒，写死的 sleep 顶不住）；
//   自证不过就直接退出，不吐任何数。
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const automator = require('miniprogram-automator')

const ROOT = process.env.MP_ROOT || path.resolve(__dirname, '../..')
const PORT = process.env.MP_PORT || 9431
const POSTER = path.join(ROOT, 'miniprogram/utils/poster.js')
const OUT_DIR = path.join(ROOT, 'docs/design/背景图深浅/实测')
const LIVE_HOME_BG = "function homeBg() {\n  return rolePath(readSlots(), 'bg') || mpAssets.serverBgPath() || ''\n}"
const BLANKED_HOME_BG = "function homeBg() {\n  return ''\n}"

// 四套壁纸从 palette 现读，不抄字面（10-04 拍"六枚压成四枚"之后写死过一版，改一枚就假量）。
// `cls` 一起带出来：每一屏都要用它自证"这一屏的 onShow 真跑完了、壁纸切到了这一枚"——
// 三页的 themeClass 都写在 data 字面量里当占位（象牙那一档），只读 bgSrc 会把"onShow 还没跑完"
// 误当成"无图态"，那样四套壁纸量出来其实是同一套。
const PALETTE = require(path.join(ROOT, 'miniprogram/utils/palette.js'))
const WALLS = (PALETTE.THEMES || []).map((t) => ({ key: t.key, cls: t.cls, label: t.label }))
if (WALLS.length !== 4) { console.log(`!! 壁纸不是一排四枚（读到 ${WALLS.length}：${WALLS.map((w) => w.key).join('/')}）`); process.exit(1) }
if (WALLS.some((w) => !w.cls)) { console.log('!! palette 的 THEMES 里没有 cls 这一栏，没法自证壁纸切没切'); process.exit(1) }

// 每屏要量的字：[名字, 选择器, 档]。档＝
//   ''（缺＝红，量具对不上界面）／'opt'（这一屏今天可能不渲染，缺了只报不判红）
//   ／'gone'（无图态**必须**读不到——读到了就是"撤一个状态"没撤干净，报出来当 §8.231 的证据）。
// ⚠ `.srch-ph`（搜索框占位字）不在这张单子里：那是 `<input>` 的 placeholder-class，
//   automator 的 `el.style('color')` 读的是输入文字不是占位字，量到的数会假绿。搜索条上改成量 `.srch-go` 那两个字。
const SCREENS = [
  { page: '/pages/index/index', tag: '首页', openSearch: true, nodes: [
    ['头部大字', '.h1', ''], ['页头数字', '.stats .n', ''], ['页头小字', '.stats .l', ''],
    ['搜索条那两个字', '.srch-go', ''], ['两枚 tab 未选中那枚', '.vtab', ''], ['分类行未选中那枚', '.ix-cat', ''],
    ['头部那张图', '.head-img', 'gone'],
  ] },
  { page: '/pages/create/create', tag: '新建', nodes: [
    ['头部大字', '.page-title', ''], ['框外那行 Tips', '.tips-line', 'opt'],
    ['铺满那层底图', '.page-bg', 'gone'], ['压暗那一层', '.page-scrim', 'gone'],
    // 10-14 站长翻案「白底也要换背景，这是核心功能」⇒ 这一行不再随 bgSrc 消失，从 'gone' 挪进
    // 必量名单。量 `.swap-text` 那一枚而不是 `.home-swap` 那个壳：壳自己不带字色，`el.style('color')`
    // 读到的是继承色，那样 CSS 里那两支写死的纸白（`.swap-text`／`.swap-glyph`）漏在外面，
    // 白底档「米白底 + 纸白字」这一对正好是它 10-11 打过一次回的那个失效，会假绿。
    ['「换背景」那两字', '.swap-text', ''],
  ] },
  { page: '/pages/me/me', tag: '我的', nodes: [
    ['头部大字', '.h1', ''], ['脑力值数字', '.score-n', 'opt'], ['脑力值小字', '.score-l', 'opt'],
    ['名片行 slogan', '.sheet-slogan', ''], ['头部那张图', '.head-img', 'gone'], ['压暗那一层', '.head-scrim', 'gone'],
  ] },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shots = []
let patched = false
// ⚠ 落刀之后 IDE 不一定会自己重编译（这台机上文件是**外部**写进去的，它的 watch 不吃这一套的时候有过）。
//   兜底按 `跑尺子.sh` 那三步原样再来一遍：quit → pkill → 重开 → `cli auto`，让它从盘上重新编一次。
//   这不是新发明一条链路——跑尺子.sh 每把尺子之前干的就是这一件事，只是它干在落刀之前。
const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const sh = (cmd) => { try { execSync(cmd, { stdio: 'ignore' }) } catch (e) { /* quit／pkill 没成不奇怪，接着往下走 */ } }
const restartIde = async () => {
  console.log('… 整台重启开发者工具，让它从盘上重编（约 100 秒）')
  sh(`"${CLI}" quit`); await sleep(8000)
  sh('pkill -f wechatwebdevtools'); await sleep(4000)
  sh('open -a wechatwebdevtools'); await sleep(45000)
  sh(`"${CLI}" auto --project "${path.join(ROOT, 'miniprogram')}" --auto-port ${PORT}`); await sleep(45000)
}
const connect = async () => {
  for (let i = 0; i < 8; i += 1) {
    try { return await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }) } catch (e) { await sleep(12000) }
  }
  throw new Error(`连不上自动化端口 ${PORT}`)
}
const restore = () => {
  if (!patched) return
  const bak = POSTER + '.probebak'
  if (fs.existsSync(bak)) { fs.copyFileSync(bak, POSTER); fs.rmSync(bak, { force: true }) }
  patched = false
  console.log('已还原 utils/poster.js（`homeBg()` 那两级链回到盘上那一版）')
}
process.on('exit', restore)
process.on('uncaughtException', (e) => { console.log('!! 量具挂了：' + (e && e.message)); restore(); process.exit(2) })

;(async () => {
  if (!WALLS.length) throw new Error('palette 里没读到 THEMES')
  let mp = await connect()
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // ⚠ 端口只有一位（9431），而 2.2 那条线是独立 worktree、跑法一模一样——两边都往 9431 上挂。
  //   10-14 这一把连上的是 **2.2 的窗口**（屏上有 `.blk-person`、版本号 v2.2.0），于是主树里
  //   `homeBg()` 那一刀怎么压都压不到屏上，两轮"等重编译"就这么白等了两轮。
  //   屏上那个 `v…` 就是这一把的身份证：它来自被测那个包的 `utils/appInfo.js`，做不了假。
  //   对不上就直接红，不往下量——量到别的线的包，12 张数一张都不能要。
  await mp.reLaunch('/pages/me/me')
  await sleep(4200)
  const mePage = await mp.currentPage()
  const liveVersion = String(((await mePage.data()) || {}).version || '')
  const wantVersion = String(require(path.join(ROOT, 'miniprogram/utils/appInfo.js')).VERSION || '')
  if (liveVersion !== wantVersion) {
    restore()
    throw new Error(`这一把连上的不是「${ROOT}」那个包：屏上 v${liveVersion}，这一把要量的是 v${wantVersion}。`
      + '⇒ 9431 被另一条线的工作树占着。先 "/Applications/wechatwebdevtools.app/Contents/MacOS/cli quit"、'
      + `pkill -f wechatwebdevtools，再 cli auto --project "${path.join(ROOT, 'miniprogram')}" --auto-port ${PORT} 重开一次。`)
  }
  console.log(`✓ 端口上跑的确实是这个根：v${liveVersion}（${ROOT}）`)

  // 先连上再落刀：连不上时不该白改源码，而 IDE 只有在工程被开着的时候才会盯到这次写入。
  const src0 = fs.readFileSync(POSTER, 'utf8')

  // ⚠ 轮询等重编译，不等固定秒数：写死 12 秒那一版就是挂在这儿——IDE 那趟重编要几十秒，
  //   没编完时读到的是旧包，屏上铺着图，12 张数全是假的。编好了的标志就是这一屏 bgSrc 成了空串。
  // ⚠ 光看 bgSrc 是不是空串还会**假绿**（第二版就是这么被骗过去的）：三页 data 字面量里
  //   `bgSrc` 初值本来就是空串，而 onShow 那一趟排在 `await app.getLoginPromise()` 之后——
  //   网络没回来时读到的是首帧，量出来的"无图"是假的，屏上其实还铺着图。
  //   所以先做一次**改前基线**：同一套等待时间下，改前每一屏都必须读到非空。
  //   基线证明"这一屏的 onShow 在这个窗口里跑完了"，之后读到空串才只剩"新代码生效"这一种解释。
  const goto = async (route, needCls) => {
    let why = ''
    for (let i = 0; i < 8; i += 1) {
      // 每一轮都重新进一次这一屏：onShow 里才会重跑 applyTheme 与 homeBg()，
      // 停在旧实例上读，等的东西永远不来。
      await mp.reLaunch(route)
      await sleep(4200)
      const page = await mp.currentPage()
      const p = String((page && page.path) || '')
      // ⚠ 路径不对不许当场抛——那是 automator 的时序抖（reLaunch 报完了、导航还没落地，
      //   10-14 就红在「停在 pages/create/create」这一句上，一整轮 12 张白跑）。
      //   和壁纸类名同一档处理：再进一次、再看，八轮都对不上才算红。
      if (!p.endsWith(route.replace(/^\//, ''))) { why = `reLaunch(${route}) 停在「${p}」`; continue }
      const d = await page.data()
      if (typeof d.bgSrc !== 'string') { why = `${route} 的 data 里没有 bgSrc 这一栏（读到 ${JSON.stringify(d.bgSrc)}）`; continue }
      // ⚠ `needCls`：壁纸那一枚有没有真落到这一屏。三页的 themeClass 初值都是象牙，
      //   所以只有象牙那一档兜不住这条——它兜的是另外三档与"applyTheme 有没有跑到"。
      const cls = String((await (await page.$('.container')).attribute('class')) || '')
      last = cls
      if (!needCls || cls.includes(needCls)) return { page, d, cls }
      why = `容器类停在「${cls}」，等的是「${needCls}」`
    }
    throw new Error(`${route} 这一屏八轮都没落到位：${why || `等不到壁纸类名「${needCls}」`}`)
  }

  const base = {}
  for (const sc of SCREENS) base[sc.tag] = (await goto(sc.page)).d.bgSrc
  console.log('改前基线 bgSrc：' + SCREENS.map((s) => `${s.tag}＝${base[s.tag] || '(空)'}`).join('　'))
  const empty = SCREENS.filter((s) => !base[s.tag])
  if (empty.length === SCREENS.length) {
    console.log('!! 这台机本来就没有任何一档背景图（三档全空）⇒ 不需要临时摘图，直接量就是无图态')
  } else if (empty.length) {
    restore()
    throw new Error(`改前就有屏是空的（${empty.map((s) => s.tag).join('/')}）⇒ 这一屏读不到"改前铺图"的样子，`
      + '后面读到空串分不清是新代码还是首帧，判不了。换一台勾过「背景」的机再跑。')
  } else {
    if (!src0.includes(LIVE_HOME_BG)) { restore(); throw new Error(`落刀点变了，找不到 homeBg() 那三行：${POSTER.replace(ROOT, '…')}`) }
    fs.copyFileSync(POSTER, POSTER + '.probebak')
    patched = true
    fs.writeFileSync(POSTER, src0.replace(LIVE_HOME_BG, BLANKED_HOME_BG))
    console.log(`已把 homeBg() 整条压成空串（${POSTER.replace(ROOT, '…')}），等 IDE 重编译，跑完还原`)
  }

  if (patched) {
    // 轮询到**三屏都**读到空串为止（只看一屏不够：一屏先空可能是时序差，另外两屏还在旧包上）。
    // 每屏的等待窗口和改前基线那一次完全一样，所以"空串"只剩一种解释：新代码上屏了。
    const poll = async (rounds) => {
      let why = ''
      let still = []
      for (let i = 0; i < rounds; i += 1) {
        still = []
        why = ''
        try {
          for (const sc of SCREENS) {
            const d = (await goto(sc.page)).d
            if (d.bgSrc) still.push(`${sc.tag}＝${d.bgSrc}`)
          }
        } catch (e) { why = e && e.message }
        if (!why && !still.length) return true
        if (i === rounds - 1) break
      }
      console.log(`!! 这一轮没等到无图态：${still.join('、') || why}`)
      return false
    }
    // 先给 IDE 一次自己重编译的机会（约 80 秒）；等不到就整台重启，从盘上重编一次再等。
    if (!(await poll(6))) {
      try { await mp.close() } catch (e) { /* 端口可能是死的，正是要重启的理由 */ }
      await restartIde()
      mp = await connect()
      if (!(await poll(6))) {
        restore()
        throw new Error('落刀之后等不到无图态：IDE 自己没编、整台重启也没编 ⇒ 一条数都不吐')
      }
    }
    console.log('✓ IDE 已重编译：三屏 bgSrc 都是空串，这一档就是三档全空的无图态')
  }

  const miss = []      // 必须存在却读不到 ⇒ 量具对不上界面
  const notGone = []   // 无图态还活着的东西 ⇒ §8.231 那条"撤一个状态"没撤干净

  for (const wall of WALLS) {
    await mp.evaluate((k) => {
      const app = getApp()
      // setWallpaper 只往 globalData.userInfo 里写，而模拟器这一档登录链吃 41002、userInfo 常为 null
      // ⇒ 那一行是空操作。这里直接把那一份摆出来，走的还是 getWallpaper() 读的同一个字段。
      app.globalData.userInfo = Object.assign({}, app.globalData.userInfo, { wallpaper: k })
    }, wall.key)

    for (const sc of SCREENS) {
      // ⚠ 自证两件事一起：① 这一屏的容器类里有这一枚壁纸自己的类名（切档切到了），
      //   ② bgSrc 是空串（真站在"无图"那一档）。少一条，数就是假的。
      const { page, cls } = await goto(sc.page, wall.cls)
      const d = await page.data()
      if (d.bgSrc) {
        restore()
        throw new Error(`${sc.tag} 这一屏 bgSrc 仍是「${d.bgSrc}」⇒ IDE 没重编译，量到的会是铺了图那一版`)
      }
      if (sc.openSearch) { await page.callMethod('onOpenSearch').catch(() => {}); await sleep(900) }
      const win = await mp.evaluate(() => { const i = wx.getWindowInfo(); return { w: i.windowWidth, h: i.windowHeight } })
      const nodes = []
      for (const [name, sel, kind] of sc.nodes) {
        const el = await page.$(sel)
        if (!el) {
          // 只有"必须存在"那一档才把 missing 钉成真——.py 那一侧读 missing 就判红，
          // opt/gone 两档缺了是预期，不能被自己的记账打成假红。
          nodes.push({ name, sel, kind, missing: kind === '' })
          if (kind === '') miss.push(`${sc.tag}×${wall.key} ${name}(${sel})`)
          continue
        }
        if (kind === 'gone') { notGone.push(`${sc.tag}×${wall.key} ${name}(${sel}) 还在屏上`); continue }
        const o = await el.offset()
        const s = await el.size()
        nodes.push({ name, sel, color: await el.style('color'), text: String((await el.text()) || '').trim().slice(0, 18),
          x: o.left, y: o.top, w: s.width, h: s.height })
      }
      const png = `无图-${sc.tag}-${wall.key}.png`
      await mp.screenshot({ path: path.join(OUT_DIR, png) })
      shots.push({ screen: sc.tag, page: sc.page, wallpaper: wall.key, wallpaperLabel: wall.label, containerClass: cls, png, win, nodes })
      console.log(`✓ ${sc.tag} × ${wall.label}　容器类「${cls}」　量 ${nodes.filter((n) => n.color).length} 枚字`)
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, '无图态读数.json'), JSON.stringify({ shots }, null, 1))
  console.log('读数 ' + path.join(OUT_DIR, '无图态读数.json'))
  if (miss.length) console.log('!! 屏上读不到的枚（先修量具再谈判据）：\n   ' + miss.join('\n   '))
  if (notGone.length) console.log(`!! 无图态本该消失却还在屏上的（${notGone.length} 条）：\n   ` + notGone.join('\n   '))
  await mp.close()
  restore()
  process.exit(miss.length || notGone.length ? 1 : 0)
})().catch((e) => { console.log('!! 量具挂了：' + (e && e.message)); restore(); process.exit(2) })
