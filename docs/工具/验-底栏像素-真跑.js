// 底栏那一排胶囊的真跑自证：automator 的 page.$ 从页面树够不到自定义组件
// （实测 .tab-bar / .tab-item 全是 null），所以这一面只能从截图采像素，采法在 采-底栏像素.py。
// 跑法：NODE_PATH=$HOME/.mpauto/node_modules node docs/工具/验-底栏像素-真跑.js
//      （或者一律走 docs/工具/跑尺子.sh 9431 验-底栏像素-真跑，它自己带 NODE_PATH）
// 前置：微信开发者工具已开；改过 WXSS 要先 cli close 再 cli auto --auto-port 9431。
//
// 这一把的来历：它原来叫 验-列表D2-真跑.js，量的是 D2 那一版行卡（点＋分类名＋meta 行、
// 85% 毛玻璃横条、搜索圆钮）。10-02 的 v18 把那一屏整个换掉了——行卡退成纸片墙，
// 分类身份从"行前一枚点"改由纸片底色承担，就地展开也撤了。那些判据的前提已经不在代码里，
// 留着就是拿旧尺子量新东西，所以整批搬走：这一屏的几何与颜色由 验-列表v18-真跑.js 量，
// 这一把只留**底栏**——它是组件、够不到 DOM，全工程只有这一把量得到。
// 顺带留两条与底栏无关但只有真跑能证的：右上角那一列对得上服务端接口（中英两态）、
// 页面自己不滚（列表改在区域内滚之后文档高就该等于视口高）。
const automator = require('miniprogram-automator')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/笔记列表-D2优化/实测')
const p = require(path.resolve(__dirname, '../../miniprogram/utils/palette.js'))
const i18n = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))
const BAR_WXSS = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/custom-tab-bar/index.wxss'), 'utf8')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
// 计算样式回来的是 rgb(...)，派生色是 #HHHHHH，两边都归一到三元数组再比。
const rgbOf = (s) => (String(s).match(/-?\d+(\.\d+)?/g) || []).slice(0, 3).map(Number)
const hexArr = (h) => {
  const m = /#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(h)
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : []
}
const near = (a, b, tol) => a.length === 3 && b.length === 3 && a.every((v, i) => Math.abs(v - b[i]) <= (tol === undefined ? 1 : tol))
// 纸白从源码现读，探针里不抄第二份表
const PAPER = /const PAPER = '(#[0-9A-Fa-f]{6})'/.exec(
  fs.readFileSync(path.resolve(__dirname, '../../miniprogram/utils/palette.js'), 'utf8'))[1]
// 未选中那一档屏幕上是"纸白按 alpha 叠在胶囊上"的结果，判像素要先把这层混出来
const blend = (fgHex, bgHex, alpha) => hexArr(fgHex).map((v, i) => Math.round(alpha * v + (1 - alpha) * hexArr(bgHex)[i]))
const sampleBar = (png) => JSON.parse(execFileSync('python3',
  [path.resolve(__dirname, '采-底栏像素.py'), png], { encoding: 'utf8' }))

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('探针挂了（未处理拒绝）', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')
  fs.mkdirSync(OUT, { recursive: true })

  const enter = async (url) => {
    for (let i = 0; i < 5; i++) {
      try { return await mp.reLaunch(url) } catch (e) { console.log(`第 ${i + 1} 次进 ${url} 没成：${e.message}`); await sleep(8000) }
    }
    throw new Error(`进不去 ${url}`)
  }
  const before = await mp.evaluate(() => JSON.stringify(wx.getStorageSync('localWallpaper') || ''))

  // 两枚代表：米白是"只换页面底"那一族，天青是"整套色阶"那一族（底栏那支派生色跟着整条走）。
  // 原来第二枚是夜紫——09-30 深色那两枚整条链路屏蔽了（列表永远铺背景图，而深色卡底是 5% 白薄膜，
  // 贴在照片上等于没有），拿一个渲染不出来的状态做判据没意义。
  for (const w of ['default', 'tint-celadon']) {
    const label = p.themeOf(w).label
    const chrome = p.chromeOf(w)
    await mp.evaluate((key) => wx.setStorageSync('localWallpaper', key), w)
    // 刚 cli auto 完，头一次 reLaunch 会撞上 "getPageMetaByWebviewId(...) is null"：
    // 页面进去了、data 却是空的。上一把带着 0 条往下量，最后在一行几何断言上崩掉，白跑六分钟。
    // 这一把量的虽然是底栏，但底栏要等页面渲染完才画得出，所以同样重试到真拿到笔记为止。
    let page, d
    for (let i = 0; i < 3; i++) {
      page = await enter('/pages/index/index')
      await sleep(4500)
      d = await page.data()
      if ((d.notes || []).length) break
      console.log(`第 ${i + 1} 次进列表只拿到 0 条，重进一次`)
    }
    if (!(d.notes || []).length) throw new Error('列表三次都是空的：这一把没法量（先确认登录态与网络）')

    // ---------- 底栏（组件够不到，采像素）----------
    // 像素比对留 ±8：截图落盘带一次色彩管理，偏差不在 CSS 里——计算样式那一头读到的是
    // 精确值（v18 那一把钉的纸片色、色板零回归那把钉的取色函数走的是计算样式）。
    // 这个容差是拿三枚壁纸实测出来的，不是猜的：
    // 米白 #443C25 → (67,60,40)｜夜紫 #2D2D6C → (45,45,104)｜天青 #25442B → (44,67,45)，
    // 单通道最大偏 7（天青那一支的红）。原来留 ±6 是只按夜紫那一档定的，换一枚就假红。
    const png = `${OUT}/实测-${label}.png`
    await mp.screenshot({ path: png })
    const s = sampleBar(png)
    ck(`${label}：胶囊填充色 = chromeOf 那一支（像素）`, near(s.fill, hexArr(chrome.bg), 8),
      `${s.fill} vs ${hexArr(chrome.bg)}，占这条线 ${Math.round(s.fill_ratio * 100)}%`)
    // 10-01 晚底栏撤了文字，选中那一格里最大的一块亮面变成图标下面那枚圆底，
    // "笔画众数"因此不再指向字色（圆底面积是描边的几倍，众数被它抢走）。
    // 判据拆成两条各管一件事：那一格里最大的一块 = --chrome-sel 派生色；
    // 图标本身仍然采得到纸白（离纸白 ±14 的像素有一把，不是零）。
    const onCol = s.stroke[1]  // 中间那一格是「笔记」= 选中
    // 这一条原来也留 ±8，天青那枚量出来 (79,120,80) 对期望 (65,121,76)——红通道差 14，红了。
    // 但同一张截图上的胶囊填充也偏了 +7（44,67,45 对 37,68,43），偏的方向一模一样：
    // 落盘那趟色彩管理不是加性常量，明度越高、红通道偏得越多，圆底比条面亮 56 档，
    // 所以它的偏差就是比条面大。判据改成**先在这张图上量出条面的偏差、再把它加到期望上**：
    // 这样钉的还是"圆底 = chromeOf 那一支派生色"，只是不再要求屏幕和文件说同一种话。
    const bgWant = hexArr(chrome.bg)
    const drift = s.fill.map((v, i) => v - bgWant[i])
    const selWant = hexArr(chrome.sel).map((v, i) => v + drift[i])
    ck(`${label}：选中那一格的圆底采到 chromeOf 的 sel 那一支（像素，按本张图的条面偏差校准）`,
      near(onCol, selWant, 8), `${onCol} vs 校准后 ${selWant}（原始期望 ${hexArr(chrome.sel)}，偏差 ${drift.join('/')}）`)
    // 圆底要是和条面同一个色，这一格就读不出"当前在哪"——那是这条改动唯一的目的。
    ck(`${label}：圆底明显亮过胶囊那一面（不是一块看不见的面）`,
      onCol.reduce((m, v, i) => Math.max(m, Math.abs(v - s.fill[i])), 0) > 30,
      `亮差 ${onCol.map((v, i) => v - s.fill[i]).join('/')}`)
    ck(`${label}：选中的图标本身仍是纸白`, s.paper_pixels[1] > 60, `纸白像素 ${s.paper_pixels[1]}`)
    const idleWant = blend(PAPER, chrome.bg, p.themeOf(w).dark ? 0.68 : 0.62)
    ck(`${label}：未选中那两格采到淡一档（= 纸白 @${p.themeOf(w).dark ? .68 : .62} 混胶囊），且没有垫底`,
      near(s.stroke[0], idleWant, 8) && near(s.stroke[2], idleWant, 8)
      && s.paper_pixels[0] < 30 && s.paper_pixels[2] < 30,
      `${s.stroke[0]} / ${s.stroke[2]} vs 期望 ${idleWant}，纸白 ${s.paper_pixels[0]} / ${s.paper_pixels[2]}`)
    // 阈值从 200 降到 120：撤了文字之后每格只剩一枚 40rpx 的描边图形，
    // 笔画像素本来就少了一半以上（实测三格 179 / 4233 / 299）。
    // ⚠️ 中间那格 4233 不是笔画，是那枚圆底整块——它比填充亮，全被算进"和填充不同的像素"里了。
    // 所以"选中的那一格 mask 真画出了图形"这件事不靠这条，靠上面那条 paper_pixels>60
    //（实测米白 163、天青 139）；这一条守的是左右两格——它们没有垫底，179/299 就是描边本身。
    ck(`${label}：三格都真的有笔画（不是在三块空面上取样）`, s.ink_pixels.every((n) => n > 120),
      s.ink_pixels.join(' / '))
    ck(`${label}：胶囊和页面底不是同一块（不然这块面就消失了）`,
      near(s.fill, s.page, 6) === false, `胶囊 ${s.fill} / 页面底 ${s.page}`)
    ck(`${label}：底栏样式里已经没有写死的 rgba(255,255,255,…)`,
      !/rgba\(255,\s*255,\s*255/.test(BAR_WXSS.replace(/\/\*[\s\S]*?\*\//g, '')))
    // 几何从像素反推：box_rpx = [左, 上, 右, 下]（单位 rpx）。左右 24、下沿离底 20 这两个还量得动。
    // 高度这一档 09-30 起从像素里读不准了：胶囊背后现在是照片（这一屏永远铺图），
    // 浅壁纸下照片那块深色和胶囊那支派生色在 ±6 容差里连成一片，米白那一档量出来是 178。
    // 108 那个数仍然钉着，只是换了地方——验-列表D2.js 从 custom-tab-bar 的 WXSS 读。
    const b = s.box_rpx
    ck(`${label}：胶囊左右各内缩 24rpx、下沿离底 20rpx（fixed 不吃父级 padding 那条）`,
      !!b && Math.abs(b[0] - 24) <= 4 && Math.abs(b[2] - 726) <= 4
      && Math.abs((s.image_rpx[1] - b[3]) - 20) <= 8,
      b && `左 ${b[0]} 右 ${b[2]} 离底 ${Math.round(s.image_rpx[1] - b[3])}（高 ${Math.round(b[3] - b[1])} 只作记录）`)
  }

  // ---------- 右上角那一列（v18：分享／种草两列随那两个屏一起撤了） ----------
  // 原来这一节钉三列对三个接口字段；v18 只剩「笔记」一列，判据跟着收到一列——
  // 不是砍覆盖，是那两个字段本来就不在这一屏了。中英两态都还跑：
  // 标签必须来自字典、数字必须就是接口回的 used，客户端一个都不自己数列表。
  const langBefore = await mp.evaluate(() => getApp().globalData.userInfo?.language || 'zh')
  for (const [lg, name] of [['zh', '中文'], ['en', '英文']]) {
    await mp.evaluate((l) => {
      const a = getApp()
      a.globalData.userInfo = Object.assign({}, a.globalData.userInfo, { language: l })
    }, lg)
    const sp = await enter('/pages/index/index')
    await sleep(4500)
    const sd = await sp.data()
    const st = sd.stats || []
    const t = i18n.texts(lg)
    ck(`${name}那一列：只剩「笔记」一列，标签就是字典里那一个`,
      st.length === 1 && st[0].l === t.statNotes, JSON.stringify(st))
    // token 不在页面 data 里，它在 app.globalData——从那儿取才是真链路的那把钥匙
    const q = await mp.evaluate(() => new Promise((res) => {
      const tok = getApp().globalData.token || ''
      wx.request({
        url: 'https://api.agentsbin.cn/wtsj/api/user/quota',
        header: { Authorization: 'Bearer ' + tok },
        success: (r) => res(r.data || { err: '空响应' }), fail: (e) => res({ err: e.errMsg }),
      })
    }))
    // 数字与占位两种值混在同一格里，比较必须两边都归成字符串：界面存的是 number 4，
    // want() 回的是 '4'，直接 === 就是一条永远红的判据。
    const want = (v) => (typeof v === 'number' && isFinite(v) ? String(v) : '0')
    ck(`${name}那一列：这个数就是 /api/user/quota 回的 used（客户端没自己数列表篇数）`,
      !q.err && st.length === 1 && String(st[0].n) === want(q.used),
      `界面 ${st.map((x) => x.n).join('/')}｜接口 used=${q.used}${q.err ? ' ' + q.err : ''}`)
  }
  await mp.evaluate((l) => {
    const a = getApp()
    a.globalData.userInfo = Object.assign({}, a.globalData.userInfo, { language: l })
  }, langBefore)
  // 这一屏不再整页滚：文档高度必须等于视口高，多出来的都在列表那一区里
  const doc = await mp.evaluate(() => new Promise((res) => {
    wx.createSelectorQuery().selectViewport().scrollOffset()
      .exec((r) => res({ h: r[0] && r[0].scrollHeight, win: wx.getWindowInfo().windowHeight }))
  }))
  ck('页面自己不滚（列表改在区域内滚之后，文档高就该等于视口高）',
    !!doc.h && Math.abs(doc.h - doc.win) <= 3, `文档 ${doc.h}／视口 ${doc.win}`)

  // 还原：这一台模拟器原来用哪枚壁纸，量完还回去
  await mp.evaluate((raw) => {
    const v = raw === '""' ? '' : JSON.parse(raw)
    if (v) wx.setStorageSync('localWallpaper', v)
    else wx.removeStorageSync('localWallpaper')
  }, before)
  await enter('/pages/create/create')
  await sleep(2500)
  const restored = await mp.evaluate(() => JSON.stringify(wx.getStorageSync('localWallpaper') || ''))
  ck('壁纸偏好已还原', restored === before, `${restored} vs ${before}`)

  console.log(`\n${bad.length ? '✗ ' + bad.length + ' 条不过：' + bad.join('、') : '全过'}`)
  mp.close()
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
