// 列表右侧那一枚配图的「拿真照片画一遍」探针（一次性，不写进那七把尺子）。
// 跑法：NODE_PATH=$HOME/.mpauto/node_modules node docs/工具/探针-列表配图真图渲染.js
//      （或 docs/工具/跑尺子.sh 9431 探针-列表配图真图渲染）
//
// 为什么要有这一把：合一那一屏新画的那枚配图是 94×94 ＋ `aspectFill` ＋ 圆角 24，
// 静态尺子只能钉"源码里写了什么"，钉不住"用户那张 900×260 的横图进来会不会把行顶高、
// 会不会被压扁、没图那一行会不会留一个空洞"。这类只能把真照片喂进渲染层再量。
//
// ⚠ 这一把量的是**渲染**，不是**接口**。喂进去的 `cover` 是本机包内的真照片路径，
//    走的是 `arrange()` 之外的一条 setData，所以它证明不了"现网会把 `cover_file_id` 发下来"
//    （那一半要等后端上线，`读数-云上对象可读性.js` 那一条才量得到）。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.resolve(ROOT, 'docs/design/10-17列表合一/实测')
// 真照片放哪儿：跑之前往这个目录里丢几张**比例悬殊**的真照片（横、竖、方、极端长条各一张）。
// ⚠ 这个目录是探针用的，跑完必须删干净——它一旦留在 `miniprogram/` 里就会被打进包。
const PROBE_DIR = path.resolve(ROOT, 'miniprogram/assets/__probe')
fs.mkdirSync(PROBE_DIR, { recursive: true })
// 源码那份号（不是稿子上抄的）：跑之前先证明 IDE 里开的是这一条线
const SRC_VERSION = /const VERSION = '([\d.]+)'/.exec(
  fs.readFileSync(path.resolve(ROOT, 'miniprogram/utils/appInfo.js'), 'utf8'))[1]

// 五张真照片的比例是现量出来的，不写死（picsum 会按请求给，但Extreme 那一档要确认它真给了）
const PHOTOS = fs.readdirSync(PROBE_DIR).filter((f) => /^p-.*\.jpg$/.test(f)).map((f) => {
  const dim = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path.join(PROBE_DIR, f)],
    { encoding: 'utf8' }).match(/(\d+)/g)
  return { name: f, url: `/assets/__probe/${f}`, w: +dim[0], h: +dim[1] }
})

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('探针挂了（未处理拒绝）', e); process.exit(2) })
  if (!PHOTOS.length) throw new Error(`${PROBE_DIR} 里没有真照片，先放几张再跑`)
  fs.mkdirSync(OUT, { recursive: true })

  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')

  // —— 第 0 关：这条线对不对。9431 是两个工作树共用的，连错线量到的是别人的包 ——
  const about = await mp.reLaunch('/pages/about/about')
  await sleep(4000)
  const runtimeVersion = String((await about.data()).version || '')
  ck('IDE 里跑的这份就是当前工作树的包（屏上的号 == 源码里的号）',
    runtimeVersion === SRC_VERSION, `屏上 ${runtimeVersion}／源码 ${SRC_VERSION}`)
  if (runtimeVersion !== SRC_VERSION) { await mp.close(); throw new Error('号不对，后面的读数都属于另一条线，不量了') }

  const page = await mp.reLaunch('/pages/index/index')
  await sleep(4500)
  const win = await mp.evaluate(() => wx.getWindowInfo().windowWidth)
  const R = win / 750
  const rpx = (px) => px / R
  const rect = async (sel, i = 0) => {
    const els = await page.$$(sel)
    const e = els[i]
    if (!e) return null
    const s = await e.size(), o = await e.offset()
    return { w: s.width, h: s.height, left: o.left, top: o.top, n: els.length }
  }
  const shot = async (name) => {
    const f = path.join(OUT, name)
    await mp.screenshot({ path: f })
    const t0 = Date.now()
    for (let i = 0; i < 30; i++) {
      await sleep(300)
      try { if (fs.statSync(f).mtimeMs >= t0) break } catch (e) {}
    }
    await sleep(400)
    return f
  }

  // —— 喂进去的那一批行。**只排六行**：这一屏的截图量 1588px 高＝1622rpx，
  //    行那一档实测 146.4rpx 一步，第七行就掉到屏外了（上一版就是栽在这儿：屏外那两个框
  //    把竖向偏移的搜索带歪，还让裁图坐标倒过来）。超长标题那一行不带图，兼做"省略号不吃配图"的对照。
  const LONG = '这是一家 2019 年成立于杭州的独立咖啡烘焙工作室，主打单一产地与浅焙'
  const rows = [{
    i: 52, id: 9052, title: LONG, src: '转存自分享', who: '一个很长很长很长的昵称测试省略号',
    shared: true, card: true, priv: false, cover: '',
  }]
  ;[4, 3, 2, 1, 0].forEach((k) => rows.push({
    i: k, id: 9000 + k, title: `真照片·${PHOTOS[k].w}×${PHOTOS[k].h}`, src: '链接识别', who: '',
    shared: k % 2 === 0, card: k % 3 === 0, priv: false, cover: PHOTOS[k].url,
  }))

  await page.setData({
    notes: rows.map((r) => ({ id: r.id, title: r.title, created_at: '2026-10-17T09:00:00Z' })),
    groups: [{ key: '2026-10-17', d: '17', w: 'Fri', today: true, rows: rows.map((r) => ({ ...r })) }],
    searchOpen: false, searchKeyword: '', detailOpen: false, templateOpen: false,
  })
  await sleep(2500)

  const wantCover = rows.filter((r) => r.cover).length
  const ths = await (await page.$$('.ixl-th')).length
  ck('注入的真照片都画出来了（配图节点数 == 有 cover 的行数）', ths === wantCover,
    `屏上 ${ths} 枚／注入 ${wantCover} 张`)

  // —— ① 那一枚必须是**正方形**：`aspectFill` 只在方框里等比裁，框被夹扁就是那条老坑。
  //    名义 94rpx 在这一档机型上是 51.88 个物理像素，`size()` 回的是整数 ⇒ 只能按
  //    ±1 物理像素（这里 ≈1.8rpx）给容差；比例本身才是判据，所以把"方"钉死、把"94"放宽。
  const sizes = []
  for (let k = 0; k < ths; k++) {
    const r = await rect('.ixl-th', k)
    sizes.push(r)
    const dev = 1 / R
    ck(`配图第 ${k + 1} 枚是正方形（${PHOTOS[[4, 3, 2, 1, 0][k]] ? PHOTOS[[4, 3, 2, 1, 0][k]].w + '×' + PHOTOS[[4, 3, 2, 1, 0][k]].h + ' 的原图' : ''}）`,
      !!r && Math.abs(r.w - r.h) <= dev, r ? `宽高各 ${rpx(r.w).toFixed(1)}rpx，差 ${(r.w - r.h).toFixed(2)}px` : '读不到那一枚')
    ck(`第 ${k + 1} 枚的边落在 94rpx 那一档（容差一个物理像素 ≈${dev.toFixed(1)}rpx）`,
      !!r && Math.abs(rpx(r.w) - 94) <= dev + 1, r ? `${rpx(r.w).toFixed(1)}rpx` : '—')
  }

  // —— ② 极端比例不许把行顶高：所有行等高 ——
  const rows2 = await page.$$('.ixl-row')
  const hs = await Promise.all(rows2.map(async (e) => rpx((await e.size()).height)))
  const spread = Math.max(...hs) - Math.min(...hs)
  ck('注入五档比例之后各行仍然等高（极端长条不许把行顶高）', spread <= 1.5,
    `各行高 ${hs.map((x) => x.toFixed(1)).join('/')} rpx，最大差 ${spread.toFixed(2)}`)

  // —— ③ 没图那一行不许留空洞：正文那档要自己把配图那份宽吃回来。
  //    期望值拿**实测的框宽**算，不拿名义 94——上一版就是写了 94＋20 去比 111.5，红了才知道差的是一个物理像素。
  const mids = await page.$$('.ixl-mid')
  const midW = await Promise.all(mids.map(async (e) => rpx((await e.size()).width)))
  const noImg = midW[0]
  const withImg = Math.min(...midW.slice(1))
  const boxW = rpx(sizes.filter(Boolean)[0].w)
  const want = boxW + 20
  ck('没配图那一行不留空洞：正文那档正好多出「实测框宽 ＋ 缝 20」那一截',
    Math.abs((noImg - withImg) - want) <= 2,
    `有图 ${withImg.toFixed(1)}／无图 ${noImg.toFixed(1)} rpx，差 ${(noImg - withImg).toFixed(1)}，应为 ${want.toFixed(1)}`)

  // —— ④ 屏上真画出了照片，而且画的就是注入的那一张 ——
  // 判据不是"框内花不花"（文字笔画比照片还花，上一版就被标题骗过），
  // 是"那一格的平均色 == 源照片的平均色"：色对得上，才是那一张被画上去了。
  const png = await shot('探针-列表配图真图.png')
  const ORDER = [4, 3, 2, 1, 0]
  const boxes = sizes.filter(Boolean).map((s, k) => ({
    x: s.left / R, y: s.top / R, w: s.w / R, h: s.h / R,
    src: path.join(PROBE_DIR, PHOTOS[ORDER[k]].name),
  }))
  const px = JSON.parse(execFileSync('python3', [path.resolve(__dirname, '采-配图盒.py'), png,
    JSON.stringify(boxes), String(OUT)], { encoding: 'utf8' }))
  console.log('　截图尺寸', px.imgSize.join('×'), '／每 rpx 合', px.scale.toFixed(3), 'px',
    '／可见高', px.visibleRpx.toFixed(0), 'rpx', '／竖向偏移', px.shift, 'px',
    '／五枚各自落点 y', px.dyList.join('/'), '（相邻差 ≈行距，不是误差）')
  const inFrame = px.boxes.filter((b) => b.inFrame)
  ck('落进画面的那一枚枚都采到了（至少三枚，不然"全局偏移"这个结论撑不住）',
    px.shift !== null && inFrame.length >= 3, `偏移 ${px.shift}px，屏内 ${inFrame.length} 枚／注入 ${px.boxes.length} 枚`)
  inFrame.forEach((b, k) => {
    ck(`第 ${k + 1} 枚（${b.src}）屏上那一格的均色对得上源照片`,
      b.colorDist <= 22, `色距 ${b.colorDist}／屏上 ${b.shotMean.join(',')}／源图 ${b.srcMean.join(',')}`)
    ck(`第 ${k + 1} 枚框内是照片不是平色（方差挡住"整块纯色也照样对得上"）`,
      b.variance > 8, `方差 ${b.variance}`)
    ck(`第 ${k + 1} 枚圆角真的切到了角（角上那一枚与框中心不是一个颜色）`,
      b.cornerGap !== null && b.cornerGap > 8, `角与心色差 ${b.cornerGap}`)
  })
  fs.writeFileSync(path.join(OUT, '探针-列表配图读数.json'),
    JSON.stringify({ srcVersion: SRC_VERSION, windowWidth: win, rows: hs, midWidths: midW, boxes, px }, null, 2))

  await mp.close()
  console.log(bad.length ? `\n${bad.length} 条红（共 ${bad.length} 条）` : '\n全过')
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
