// 判据 8 的取图那一步（需求清单 §三.8；甲的定义里包含"落前先跑 blur 实测"）。跑法：
//   NODE_PATH=$HOME/.mpauto/node_modules node docs/工具/拍-玻璃AB.js A
//   （或者 docs/工具/跑尺子.sh 9431 之外单独跑——这一把不重启工具，因为它要在**同一个视口**里连拍两回）
// 它只干一件事：把"列表卡顶那一段玻璃"和"「我的」名片那一行"两屏各存一张 PNG，
// 存进 docs/design/10-11毛玻璃/实测/。A、B 两趟跑同一条命令、只差 argv 那个字母，
// 中间由我把 app.wxss 的 `--glass-bf` 临时改成 `none` 再改回来（改完必须核过 git diff 只剩玻璃那一条）。
// 数怎么读、为什么是 A/B 而不是"玻璃内对玻璃外"，写在 docs/工具/量-玻璃糊没糊.py 文件头。
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 标签走 argv，也认环境变量 GLASS_TAG——`跑尺子.sh` 那层不往下传参数（它只会 `node 尺子名.js`），
// 而 B 那一趟就是要经过它重启一次工具，所以留一条 env 的路。
const TAG = process.argv[2] || process.env.GLASS_TAG || 'A'
const OUT = path.resolve(__dirname, '../design/10-11毛玻璃/实测')

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
  const AB = {}
  await mp.switchTab('/pages/index/index')
  await sleep(8000)
  // 玻璃只在看得到形象图那一态有（.container.has-bg）——量之前先确认这一态在，
  // 不然两张"没有玻璃"的图对判出来的"没糊"是假结论。
  const cont = await (await mp.currentPage()).$('.container')
  const contCls = String((cont && await cont.attribute('class')) || '')
  console.log(`${TAG}｜首页容器类＝${contCls}`)
  if (!/has-bg/.test(contCls)) throw new Error(`${TAG} 这一趟没铺图（has-bg 不在），这两张不能用`)
  {
    const g = await geo(['.sheet', '.head'])
    // 列表这一屏：白纱段 158rpx；对照区取图区里靠上那 158rpx（同一张照片、同样的高度，玻璃碰不到它）
    AB['列表'] = { win: g.win, glass: band(g.box, 0, 158, g.win), ref: band(g.box, 1, 158, g.win) }
  }
  await mp.screenshot({ path: `${OUT}/${TAG}-列表.png` })
  await mp.switchTab('/pages/me/me')
  await sleep(6000)
  const meCont = await (await mp.currentPage()).$('.container')
  const meCls = String((meCont && await meCont.attribute('class')) || '')
  console.log(`${TAG}｜「我的」容器类＝${meCls}`)
  if (!/has-bg/.test(meCls)) throw new Error(`${TAG} 「我的」这一趟没铺图，那一张不能用（10-11 才把这枚闸补到这一页的 container 上）`)
  {
    const g = await geo(['.sheet', '.head-band'])
    AB['我的'] = { win: g.win, glass: band(g.box, 0, 56, g.win), ref: band(g.box, 1, 56, g.win) }
  }
  await mp.screenshot({ path: `${OUT}/${TAG}-我的.png` })
  if (TAG === 'A') fs.writeFileSync(`${OUT}/AB.json`, JSON.stringify(AB, null, 1))
  console.log(`存进 ${OUT}（AB.json ${TAG === 'A' ? '已写' : '沿用 A 那一趟'}）`)
  await mp.close()
})().catch((e) => { console.error('!! 取图挂了', e && (e.stack || e.message)); process.exit(1) })
