// 判据 8 的取图那一步（需求清单 §三.8；甲的定义里包含"落前先跑 blur 实测"）。跑法：
//   NODE_PATH=$HOME/.mpauto/node_modules GLASS_TAG=A node docs/工具/拍-玻璃AB.js
//   （或者 docs/工具/跑尺子.sh 9431 拍-玻璃AB——它自己带 NODE_PATH，但不传 argv，所以走 GLASS_TAG 那枚环境变量）
// 它只干一件事：把"列表卡顶那一段玻璃"和"「我的」名片那一行"两屏各存一张 PNG，
// 存进 docs/design/10-11毛玻璃/实测/。A、B 两趟跑同一条命令、只差那个字母，
// 中间由我把 app.wxss 的 `--glass-bf` 临时改成 `none` 再改回来
// （改完必须核：`grep -- "--glass-bf" miniprogram/app.wxss` 只能剩那一条 blur）。
// 数怎么读、为什么是 A/B 而不是"玻璃内对玻璃外"，写在 docs/工具/量-玻璃糊没糊.py 文件头。
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 标签走 argv，也认环境变量 GLASS_TAG——`跑尺子.sh` 那层不往下传参数（它只会 `node 尺子名.js`），
// 而 B 那一趟就是要经过它重启一次工具，所以留一条 env 的路。
const TAG = process.argv[2] || process.env.GLASS_TAG || 'A'
const OUT = path.resolve(__dirname, '../design/10-11毛玻璃/实测')
const ROOT = path.resolve(__dirname, '../..')

;(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上 9431，先跑 cli auto')
  // 两块要看的面：glass＝玻璃那一段（A/B 之间唯一该变的），ref＝玻璃外的对照区（A/B 之间必须一模一样）。
  // 坐标一律现量、存成**视口 px**，并把 windowWidth／windowHeight 一起写进 AB.json——
  // 截图拍的是整块屏（顶上还有状态栏＋导航条），量法要靠这两枚数换算，写死 750 会把框画到别处去。
  const geo = (sels) => mp.evaluate((list) => new Promise((resolve) => {
    const i = wx.getWindowInfo()
    const q = wx.createSelectorQuery()
    list.forEach((s) => { q.select(s).boundingClientRect() })
    q.exec((r) => resolve({ win: { w: i.windowWidth, h: i.windowHeight }, box: r }))
  }), sels)
  const band = (box, i, hRpx, win) => {
    const b = box[i]
    if (!b) return null
    return [b.left, b.top, b.width, Math.min(hRpx * win.w / 750, b.height)]
  }
  // 白纱那一段有多高，从样式表现读，不在这儿抄第二份（158／56 这两个数一改，这里跟着漂才怪）
  // 10-12 21:4x 甲：卡顶那一段改吃单独一枚 `--glass-veil-band`（.60），所以这里两枚令牌都收——
  // 只锚 `--glass-veil` 的话这一刀会把两页的段高读成 0（尺子坏了，不是代码坏了）。
  const veilStop = (rel) => {
    const src = fs.readFileSync(path.join(ROOT, 'miniprogram', rel), 'utf8')
    const rule = String((src.match(/\.container\.has-bg \.sheet\s*\{[^}]*\}/) || [''])[0])
    const nums = [...rule.matchAll(/var\(--glass-veil(?:-band)?\)\s+(-?[\d.]+)rpx/g)].map((m) => Number(m[1]))
    if (!nums.length) throw new Error(`${rel} 里没读到 --glass-veil(-band) 那一档的 rpx 数＝样式或正则坏了`)
    return Math.max(...nums)
  }
  // ★10-11 审查抓到的 P0：本机存的那枚形象图是**上个会话的临时路径**，`mp.screenshot` 拍出来
  // 头部整段是 255 纯白（图根本没画进这一帧）。拿那两张去比 blur 的细节能量，比的是**文字抗锯齿**，
  // 0.352 那种数看着像"糊住了"、其实玻璃背后一片空白。所以取图这一趟把 bgSrc 钉成**包内那一张**
  // （`/assets/home-bg-portrait.jpg`，poster.HOME_BG_DEFAULT 也是它），并且由 `量-玻璃糊没糊.py`
  // 在算比值之前先验"对照组那块确实有画面"——平色就拒绝出数，不许它再报一次假结论。
  const BG_PROBE = '/assets/home-bg-portrait.jpg'
  const forceBg = async () => {
    const page = await mp.currentPage()
    await page.setData({ bgSrc: BG_PROBE })
    await sleep(3000)
  }
  const AB = {}
  await mp.switchTab('/pages/index/index')
  await sleep(8000)
  // 玻璃只在看得到形象图那一态有（.container.has-bg）——量之前先确认这一态在，
  // 不然两张"没有玻璃"的图对判出来的"没糊"是假结论。
  const cont = await (await mp.currentPage()).$('.container')
  const contCls = String((cont && await cont.attribute('class')) || '')
  console.log(`${TAG}｜首页容器类＝${contCls}`)
  if (!/has-bg/.test(contCls)) throw new Error(`${TAG} 这一趟没铺图（has-bg 不在），这两张不能用`)
  await forceBg()
  {
    const g = await geo(['.sheet', '.head'])
    AB['列表'] = { win: g.win, bg: BG_PROBE, glass: band(g.box, 0, veilStop('pages/index/index.wxss'), g.win),
      ref: band(g.box, 1, veilStop('pages/index/index.wxss'), g.win) }
  }
  await mp.screenshot({ path: `${OUT}/${TAG}-列表.png` })
  await mp.switchTab('/pages/me/me')
  await sleep(6000)
  const meCont = await (await mp.currentPage()).$('.container')
  const meCls = String((meCont && await meCont.attribute('class')) || '')
  console.log(`${TAG}｜「我的」容器类＝${meCls}`)
  if (!/has-bg/.test(meCls)) throw new Error(`${TAG} 「我的」这一趟没铺图，那一张不能用（10-11 才把这枚闸补到这一页的 container 上）`)
  await forceBg()
  {
    const g = await geo(['.sheet', '.head-band'])
    AB['我的'] = { win: g.win, bg: BG_PROBE, glass: band(g.box, 0, veilStop('pages/me/me.wxss'), g.win),
      ref: band(g.box, 1, veilStop('pages/me/me.wxss'), g.win) }
  }
  await mp.screenshot({ path: `${OUT}/${TAG}-我的.png` })
  if (TAG === 'A') fs.writeFileSync(`${OUT}/AB.json`, JSON.stringify(AB, null, 1))
  console.log(`存进 ${OUT}（AB.json ${TAG === 'A' ? '已写' : '沿用 A 那一趟'}）`)
  await mp.close()
})().catch((e) => { console.error('!! 取图挂了', e && (e.stack || e.message)); process.exit(1) })
