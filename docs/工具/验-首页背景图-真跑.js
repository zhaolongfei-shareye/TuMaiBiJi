// 首页背景图这一批的真跑自证：在模拟器里真点、真读 data、真截图，最后把改过的存储还原回去。
// 三条链路都要落地：两级都空→白底那一档；设了形象→用户那张（这就是"和卡片模板打通"）；换图入口只有一个。
// ⚠ 10-14 §8.231 那一刀：包内那张硬编码默认图（`assets/home-bg-portrait.jpg`，314,793 B）已删，
//   `homeBg()` 从三级降到两级 ⇒ "没设形象"这一档的产物从"站长那张人像"变成**空串（白底）**。
//   原来这一屏的几何（图铺满视口、罩与图同尺寸、那一组压在罩之上）全都**要有一张图**才量得到，
//   所以那四条整段搬到 ②（设了用户那张之后）去量，① 反过来钉"图与罩一个都不渲染"。
//   无图那一档的字色不在这里量，是 `量-无图态字色-真跑.js` 那把（12 个组合的像素对比度）。
// 前置：微信开发者工具已开，跑过 cli close 再 cli auto --auto-port 9431（改过 WXSS 必须先 close）。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-首页背景图-真跑.js
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/人像背景/实测')
// 1×1 纯红 PNG。落进用户文件目录冒充"用户在卡片模板页挑的那张图"，
// 省掉相册选择器（模拟器里那个面板点不动），又能从像素上认出铺的确实是它。
const RED_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

;(async () => {
  process.on('uncaughtException', (e) => { console.error('探针挂了（未捕获）', e); process.exit(2) })
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
  const readKey = (k) => mp.evaluate((key) => {
    const v = wx.getStorageSync(key)
    return v === '' || v === undefined ? '(空)' : JSON.stringify(v)
  }, k)
  // 读**元素自己**身上的 class。原来这一条写成 `(d.themeClass + ' has-bg').includes('has-bg')`
  // ——把常量拼进字符串再判包含，那是恒真，markup 里真丢了 has-bg 也照样绿（10-10 审计点的）。
  const clsOf = async (sel) => {
    const e = await page.$(sel)
    return e ? await e.attribute('class') : ''
  }

  // 先记下这一台模拟器原来的形象设置，探针结束时原样还回去
  const profileBefore = await readKey('poster_profile')
  const offBefore = await readKey('home_bg_off')
  // ⚠ 兜底链降到两级之后，"两级都空"必须把**第二级**也清干净才算数：运营图那份本机缓存
  //   （`mpAssets` 存在 `MP_ASSET_KEY_home_bg` 那一格）在这台模拟器上是 10-11 那次拉下来留下的，
  //   只撤 `poster_profile` 的话第一级空了、第二级还在，屏上铺的是运营图，量出来的"无图"是假的。
  //   探针自己下载的那张归探针（下面 unlink 掉），这个人原本的缓存要还回去。
  const assetBefore = await readKey('MP_ASSET_KEY_home_bg')
  // 这一台机**改前**屏上那一张，只报数不判：它告诉读日志的人这一台站在哪一级上
  // （勾过「背景」＝第一级，只缓存到运营图＝第二级，两样都没有＝白底）。
  const bgFirst = String(((await (await mp.currentPage()).data()) || {}).bgSrc || '')
  console.log(`这台机改前屏上那一张：${bgFirst || '(白底，两级都空)'}`)

  // ---------- ① 两级都空：白底那一档（§8.231 判据 4） ----------
  await mp.evaluate(() => {
    wx.removeStorageSync('home_bg_off')
    wx.removeStorageSync('poster_profile')
    wx.removeStorageSync('MP_ASSET_KEY_home_bg')   // 第二级：运营图那份本机缓存
  })
  let page = await enter('/pages/create/create')
  await sleep(4000)
  let d = await page.data()
  ck('两级都空时 bgSrc 是空串（白底那一档，不再回落包里那张）', d.bgSrc === '', d.bgSrc)
  const contCls = await clsOf('.container')
  ck('无图这一档容器不带 has-bg（带了就是拿"铺了图"那套字色压在浅壁纸上）',
    !/(^|\s)has-bg(\s|$)/.test(contCls), contCls || '(读不到 .container)')
  ck('无图那一档 `<image>` 与压暗罩一个都不渲染（判据 4 那句"一个都不渲染"）',
    (await page.$$('.page-bg')).length === 0 && (await page.$$('.page-scrim')).length === 0,
    `page-bg ${(await page.$$('.page-bg')).length}／page-scrim ${(await page.$$('.page-scrim')).length}`)
  // 静态那把尺子扫不到"整枚类名来自数据"这一类（`{{themeClass}}`），这里补上：
  // data 里那一枚必须真的出现在元素的 class 串上，否则壁纸换了就只是改了数据、界面没跟上。
  ck('{{themeClass}} 那一枚也真落进了 class（静态扫不到的那类，只能在模拟器里读）',
    !!d.themeClass && new RegExp(`(^|\\s)${d.themeClass}(\\s|$)`).test(contCls), `data=${d.themeClass}／元素=${contCls}`)
  // 收起态不许带 entry-dock：`.container.has-bg:not(.entry-dock) .entry-wrap` 那一条夹高度
  // 靠的就是这个名字，展开时才挂上（见下面 ② 那一段）。
  ck('没展开时容器不带 entry-dock（展开那一下才挂上，见 ②）',
    !/(^|\s)entry-dock(\s|$)/.test(contCls), contCls)
  // 站长 10-14 定这一条：「白底也要换背景，这是核心功能」——这一行不再跟着 bgSrc 消失。
  // 原来 §8.231 一落地，两级都空那一档整条 `wx:if="{{bgSrc}}"` 就没了，新用户第一屏连入口都看不见。
  // 这里量的正是那一条翻案：行必须在，但只有「换背景」那一截（「调亮度」拧的是压暗罩的透明度，
  // 这一档罩子压根没渲染，留着它是一枚按了什么都不发生的钮）。
  const swapHalves = await page.$$('.swap-half')
  // 原来这一条钉的是"只剩一枚"（那会儿这一行只有 调亮度／换背景 两截）。10-14 17:1x 他往首页
  // 加了第三枚「换心情」（§8.237 原话「切换毛玻璃改到，首页 增加一个入口"换心情" icon是小云朵」），
  // 而「换心情」不吃 `bgSrc`（拧的是本机那一档玻璃，没图也拧得动）⇒ 白底这一档现在是**两枚**：
  // 换背景 ＋ 换心情。"不许有调亮度"那半条一个字没松，改成整行都不许出现"亮度"两个字。
  ck('白底那一档「换背景」那一行画着（10-14 翻案，不再随 bgSrc 消失），且是换背景＋换心情两枚',
    (await page.$$('.home-swap')).length === 1 && swapHalves.length === 2,
    `行 ${(await page.$$('.home-swap')).length} 条／截 ${swapHalves.length} 截`)
  const swapTxt = swapHalves.length ? String((await swapHalves[0].text()) || '').trim() : ''
  const allSwapTxt = []
  for (const h of swapHalves) allSwapTxt.push(String((await h.text()) || '').trim())
  ck('白底那一档剩的是「换背景」那一截，不是「调亮度」（整行都不许出现"亮度"）',
    swapTxt.indexOf('换背景') >= 0 || swapTxt.toLowerCase().indexOf('background') >= 0,
    `读到「${swapTxt || '(空)'}」`)
  ck('白底那一档整行没有「调亮度」（这一档压暗罩压根没渲染，留着是一枚按了什么都不发生的钮）',
    !allSwapTxt.join('|').includes('亮度'), allSwapTxt.join('｜'))
  // 收起来那一组（`.home-blk`）与这一行的关系。**量法今天改了一次，判的不是"松紧"**：
  // 原来钉的是"行的**盒子**底边 ≤ 组顶"。10-15 01:4x 他那句「调亮度等三块…在框框上面，现在位置不准，
  // 离框框太高了，浪费空间」之后，这一行的下沿是**故意**吃进两者之间那口空白的——`.home-swap` 带着
  // `margin: -14rpx 0 -22rpx`（`create.wxss:1525`），那 −22rpx 就是把下面那组抬上来、把行底压过组顶的
  // 那一只手；盒子的底因此天然比组顶低 ≈11px。拿盒子底判，红的就是这一刀本身，不是"压住东西"。
  // ⇒ 改判**看得见的字**：两枚 `.swap-text` 的字节点底边不许越过组顶（这才是"压住"），
  //   盒子的数照量照报，不藏。
  const g = await mp.evaluate(() => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    q.select('.home-swap').boundingClientRect()
    q.select('.home-blk').boundingClientRect()
    q.selectAll('.swap-text').boundingClientRect()
    q.exec((r) => resolve({
      row: r[0] ? { y: r[0].top, h: r[0].height } : null,
      blk: r[1] ? { y: r[1].top, h: r[1].height } : null,
      txt: (r[2] || []).map((x) => ({ y: x.top, h: x.height })),
    }))
  }))
  const inkBottom = g.txt.length ? Math.max(...g.txt.map((x) => x.y + x.h)) : NaN
  ck('白底那一档这一行的**字**不压住下面那一组（盒子底边照旧吃进那口空白，数在下面报）',
    !!g.blk && g.txt.length === 2 && inkBottom <= g.blk.y + 1,
    g.row && g.blk ? `字底 ${Math.round(inkBottom)}｜组顶 ${Math.round(g.blk.y)}｜盒底 ${Math.round(g.row.y + g.row.h)}` : '量不到')
  // 真点一下：白底档点它得真的落到卡片模板页（导流那条链本来就不依赖有没有背景图）。
  if (swapHalves.length) {
    await swapHalves[0].tap()
    await sleep(2500)
    const after = await mp.currentPage()
    ck('白底那一档点「换背景」照样落到卡片模板页', after.path === 'pages/profile/profile', after.path)
    await mp.navigateBack().catch(() => {})
    await sleep(800)
  }
  await mp.screenshot({ path: `${OUT}/实测-1-两级都空白底.png` })

  // ---------- ② 设了形象：铺用户那张（和卡片模板同一张图） ----------
  const userImg = await mp.evaluate((b64) => {
    const p = `${wx.env.USER_DATA_PATH}/probe-user-bg.png`
    wx.getFileSystemManager().writeFileSync(p, b64, 'base64')
    const prof = wx.getStorageSync('poster_profile') || {}
    prof.avatarPath = p
    wx.setStorageSync('poster_profile', prof)
    return p
  }, RED_PNG)
  page = await enter('/pages/create/create')
  await sleep(4000)
  d = await page.data()
  ck('设过形象后 bgSrc 换成用户那张', d.bgSrc === userImg, d.bgSrc)
  const contCls2 = await clsOf('.container')
  ck('铺了图这一档容器才带 has-bg（与 ① 那一条正反各钉一次）',
    /(^|\s)has-bg(\s|$)/.test(contCls2), contCls2 || '(读不到 .container)')
  // 这四条从 ① 搬来：删掉包内默认图之后，"有一张图可量"这件事本身要先成立。
  // 几何：图铺满整个视口、收起态那一组压在图之上（automator 的 Element 没有 boundingBox，走 selectorQuery）
  // 10-10 晚收起态换了载体：原来那一条读 `.entry-wrap`（流内那条录入条的壳），现在那一组是
  // `.home-blk` 自己 fixed，`.entry-wrap` 只在展开态存在——还读老名字就是 null，两条判据一起假红。
  const rects = await mp.evaluate(() => new Promise((resolve) => {
    wx.createSelectorQuery().select('.page-bg').boundingClientRect()
      .select('.home-blk').boundingClientRect()
      .select('.page-scrim').boundingClientRect()
      .exec((r) => resolve(r.map((x) => x ? { y: (x.y === undefined ? x.top : x.y), h: x.height, w: x.width, raw: JSON.stringify(x) } : null)))
  }))
  const [bg, cards, scrim] = rects
  ck('铺了 <image> 节点与压暗罩（各一枚）', !!bg && !!scrim, bg && scrim && `${bg.w}x${bg.h}／${scrim.w}x${scrim.h}`)
  ck('图铺满视口宽', !!bg && bg.w >= 370, bg && `${bg.w}px`)
  ck('压暗罩和图同尺寸', !!bg && !!scrim && scrim.h === bg.h && scrim.w === bg.w,
    bg && scrim && `${scrim.w}x${scrim.h} vs ${bg.w}x${bg.h}`)
  ck('那一组压在罩之上、整组落在下巴以下', !!cards && !!bg && Number(cards.y) > bg.h * 0.48,
    cards && `组顶 ${cards.y} / 视口 ${bg.h}`)
  ck('那一组底边不压住底栏（底栏占视口最下 64px）', !!cards && !!bg && (cards.y + cards.h) <= bg.h - 64,
    cards && `块底 ${Math.round(cards.y + cards.h)}，底栏顶 ${bg.h - 64}`)
  await mp.screenshot({ path: `${OUT}/实测-2-用用户的形象.png` })
  // ---------- ②b 展开录入条：整块贴底，换背景那一行两屏都在 ----------
  // 09-28 起展开态不再是"回到标题下面"，而是 fixed 贴底（bottom 152rpx）：窗口不动，
  // 只换肚子里的内容。所以这里量的是"块底还压不压底栏"，不再是"块顶有没有抬到 120 以上"。
  // 10-11 12:2x 站长原话「调亮度，换背景，再第二屏也需要，第二屏就是带拍摄面板那个」
  // ⇒ 这一行不再"让位"，改成钉它**画着**且**底边不压到面板顶**（不重叠才是这句需求真正的安全边界：
  //   它抬在罩层之上、面板 fixed 沉底，两样各占一头，谁也不许吃谁的位置）。
  await (await page.$('.blk-person')).tap()
  await sleep(1200)
  const openRect = await mp.evaluate(() => new Promise((resolve) => {
    wx.createSelectorQuery().select('.entry-wrap').boundingClientRect()
      .select('.page-bg').boundingClientRect()
      .select('.home-swap').boundingClientRect()
      .exec((r) => resolve(r.map((x) => x ? { y: (x.y === undefined ? x.top : x.y), h: x.height } : null)))
  }))
  ck('展开后整块贴底，底边不压住底栏',
    !!openRect[0] && !!openRect[1] && (openRect[0].y + openRect[0].h) <= openRect[1].h - 64,
    openRect[0] && openRect[1] && `块底 ${Math.round(openRect[0].y + openRect[0].h)}，底栏顶 ${openRect[1].h - 64}`)
  // 这一条原来是"展开态照样画这一行"，依据是他 10-11 那句「调亮度，换背景，再第二屏也需要」。
  // **10-15 02:5x 他追了一句「第二屏不支持三个设置，要隐藏」** ⇒ 作废，钉成反面：展开态这一行不画、
  // 也不占位。判"没画"按高判——`display:none` 时节点还在树里，`boundingClientRect` 回的是高 0 那一份。
  ck('展开时这一行**不画**（他 10-15「第二屏不支持三个设置，要隐藏」，10-11 那句作废）',
    !openRect[2] || openRect[2].h <= 0.5,
    openRect[2] ? `行 ${Math.round(openRect[2].y)}..${Math.round(openRect[2].y + openRect[2].h)}（高 ${Math.round(openRect[2].h)}）｜面板顶 ${openRect[0] && Math.round(openRect[0].y)}` : '节点不在树里（也算没画）')
  await mp.screenshot({ path: `${OUT}/实测-2b-展开态那一行隐藏.png` })
  await (await page.$('.title-row')).tap()   // 点条以外的空白收起，回到常态
  await sleep(900)

  // ---------- ③ 换图入口只有一个：首页那枚「换背景」导流到卡片模板页 ----------
  // 09-30 站长把外观设置里那一节整块撤了（图本来就和卡片形象同一个来源，
  // 不该有第二个门，也不给"关掉背景"这个状态）。
  page = await enter('/pages/wallpaper/wallpaper')
  await sleep(4000)
  ck('外观设置里那一节真的没了', (await page.$$('.bg-cell')).length === 0)
  const wd = await page.data()
  ck('页面数据里也不再挂开关状态', wd.bgOn === undefined && wd.bgThumb === undefined)
  await mp.screenshot({ path: `${OUT}/实测-3-外观设置没有背景图那一节.png` })

  page = await enter('/pages/create/create')
  await sleep(4000)
  d = await page.data()
  // 这一屏此时吃的是 ② 设进去的用户那张。"没有关掉背景这条路"仍然成立（`home_bg_off` 那个状态早就撤了），
  // 但**不许**再说成"首页一直铺着图"——两级都空时它就是白底（见 ①）。
  ck('首页没有"关掉背景"这条路（勾了图就铺着，两级都空才是白底）', d.bgSrc === userImg, d.bgSrc || '(空)')
  // 10-02 晚这一行拆成两半（左「调亮度」一枚点、右「换背景」一枚箭头），父节点身上
  // 没有 tap 了：点 .home-swap 的正中会落在两半之间那道缝里，什么都不会发生。
  // **10-14 17:1x 他往首页加了第三枚「换心情」**（§8.237 原话「切换毛玻璃改到，首页 增加一个入口"换心情" icon是小云朵」）
  // ⇒ 铺图那一档现在是三枚，次序 调亮度／换背景／换心情；次序也钉住（改顺序要连着改新建页）。
  const halves = await page.$$('.swap-half')
  const halfTxt = []
  for (const h of halves) halfTxt.push(String((await h.text()) || '').replace(/\s+/g, ''))
  ck('换背景那一行是三枚，次序＝调亮度／换背景／换心情（10-14 那枚在右）',
    halves.length === 3 && /亮度|bright/i.test(halfTxt[0] || '')
      && /换背景|background/i.test(halfTxt[1] || '') && /心情|mood/i.test(halfTxt[2] || ''),
    `${halves.length} 枚：${halfTxt.join('｜')}`)
  await halves[1].tap()
  await sleep(2500)
  const now = await mp.currentPage()
  ck('点「换背景」落在卡片模板页', now.path === 'pages/profile/profile', now.path)
  await mp.screenshot({ path: `${OUT}/实测-4-换图入口在卡片模板页.png` })
  await mp.navigateBack().catch(() => {})
  await sleep(800)

  // ---------- ④ 还原这台模拟器的状态 ----------
  await mp.evaluate((profileRaw, offRaw, assetRaw) => {
    wx.removeStorageSync('poster_profile')
    wx.removeStorageSync('home_bg_off')
    wx.removeStorageSync('MP_ASSET_KEY_home_bg')
    try { wx.getFileSystemManager().unlinkSync(`${wx.env.USER_DATA_PATH}/probe-user-bg.png`) } catch (e) {}
    if (profileRaw && profileRaw !== '(空)') wx.setStorageSync('poster_profile', JSON.parse(profileRaw))
    if (offRaw && offRaw !== '(空)') wx.setStorageSync('home_bg_off', JSON.parse(offRaw))
    if (assetRaw && assetRaw !== '(空)') wx.setStorageSync('MP_ASSET_KEY_home_bg', JSON.parse(assetRaw))
  }, profileBefore, offBefore, assetBefore)
  page = await enter('/pages/create/create')
  await sleep(3500)
  d = await page.data()
  const backProfile = await readKey('poster_profile')
  const backAsset = await readKey('MP_ASSET_KEY_home_bg')
  // 还原判据钉的是**存储**：三格里这个人原本有的那些原样写回去。屏上那一张不拿来比——
  // 名片上云那一路会在中途按服务器权威重写 `poster_profile`（`profileCloud.pull()`，正常动作），
  // 拿改前那一格当基准就把这条正常链路红成"没还原"。
  ck('这台机原来的那两格已经原样还回去（存储逐字节比）',
    backProfile === profileBefore && backAsset === assetBefore,
    `profile ${backProfile === profileBefore ? '同' : '异'}／运营图缓存 ${backAsset === assetBefore ? '同' : '异'}`)
  ck('删图之后屏上还能有图，只可能来自这两级（用户勾的那格或运营图缓存），不会是包里那张',
    d.bgSrc === '' || /^(\/usrdata|http:\/\/usr\/)/.test(d.bgSrc), d.bgSrc || '(白底)')

  await mp.close()
  console.log(bad.length ? `\n${bad.length} 条没过：${bad.join('、')}` : '\n全过')
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针异常', e); process.exit(2) })
