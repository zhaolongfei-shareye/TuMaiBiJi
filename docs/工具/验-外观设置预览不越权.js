// 外观设置这一屏的真跑自证。
//
// 文件名里的"预览不越权"是旧口径（点色块只试看、点上面手机才生效），PRD 和跑尺子清单都指向这个名字，
// 所以名字留着；站长 10-04 改了口径，这一把现在钉的是这四件事：
//   ① 点色块当场就生效（本机那两枚写本机偏好，不碰服务端）；
//   ② 上面那部手机不再带点击口——点它什么都不该发生；
//   ③ 四枚排成一行、横向不滚，盒宽实测（不是"看起来没滚"）；
//   ④ 英文态那四个名字必须在一行里放得下（他真机截图就是英文，折行=红）。
// 跑在模拟器里，真点、读 data、读存储，最后把壁纸和语言都还原回去。
//
// 前置：微信开发者工具已开，跑过 cli auto --project .../miniprogram --auto-port 9431（改过 WXSS 必须先 close 再 auto）。
// 跑法：docs/工具/跑尺子.sh 9431 验-外观设置预览不越权
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const lang = require('./尺子语言钉.js')
const { THEMES, themeOf } = require(path.resolve(__dirname, '../../miniprogram/utils/palette.js'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/外观设置-手机预览')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const readLocal = (mp) => mp.evaluate(() => wx.getStorageSync('localWallpaper') || '(空)')
const enter = async (mp) => {
  for (let i = 0; i < 5; i++) {
    try { return await mp.reLaunch('/pages/wallpaper/wallpaper') } catch (e) { console.log(`进页第 ${i + 1} 次没成：${e.message}`); await sleep(8000) }
  }
  throw new Error('reLaunch 五次都没进这页')
}

;(async () => {
  // 冷启动那一下最容易翻车：cli auto 刚编完，app 还在启动页，这时 reLaunch 会让 IDE 报
  // "getPageMetaByWebviewId(...) is null"（它还没给这个 webview 登记页面元信息）。
  // 所以进来先重试几次；同时兜住 uncaughtException——这个报错是从 WebSocket 回调里抛的，
  // 没有待办的请求时它会直接掀掉进程，而不接住的话 node 会挂在活着端口上永远不退出。
  process.on('uncaughtException', (e) => { console.error('探针挂了（未捕获）', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')
  fs.mkdirSync(OUT, { recursive: true })

  const langBefore = await lang.read(mp)
  await lang.pin(mp, 'zh')
  let page = await enter(mp)
  await sleep(4500)

  // 10-04 起四枚壁纸都由服务端当家（站长拍「统一」，后端白名单加了那三个新 key），
  // 所以点任何一枚都会真发一次 PUT。先把 PUT 记下来：后面"发没发、带的是哪一枚"全读这一份，
  // 不靠类名和 data 猜。测试号写进去的外观，收尾那一步会原样点回去。
  await mp.evaluate(() => {
    const w = wx
    w.__puts = []
    const orig = w.request
    w.request = function (o) {
      if (o && String(o.method || '').toUpperCase() === 'PUT'
        && /\/api\/user\/wallpaper$/.test(String(o.url || '').split('?')[0])) {
        w.__puts.push(String((o.data || {}).wallpaper || ''))
      }
      return orig.apply(this, arguments)
    }
  })
  const puts = () => mp.evaluate(() => (wx.__puts || []).slice())

  const start = await page.data()
  // 旧版本可能在这台模拟器上留过本机那份；先清掉再跑，否则"它一直是空的"这条会因脏数据而假红。
  await mp.evaluate(() => wx.removeStorageSync('localWallpaper'))
  const startLocal = await readLocal(mp)
  const R = (await mp.evaluate(() => wx.getWindowInfo().windowWidth)) / 750
  const rpx = (px) => px / R
  const near = (v, target, tol) => Math.abs(v - target) <= (tol === undefined ? 1.5 : tol)
  const box = async (el) => {
    const s = await el.size(), o = await el.offset()
    return { w: rpx(s.width), h: rpx(s.height), left: rpx(o.left), top: rpx(o.top), right: rpx(o.left + s.width) }
  }

  // ---------- ① 一行四枚，横向不滚（量盒子，不量类名） ----------
  // 宽度不写死在断言里：10-04 六枚压成四枚，每格从 102 涨到 (702-3×18)/4=162。
  // 钉的是"整行铺满内沿、缝 18、四格等宽"这三件事，枚数再变也不用改数。
  const N = 4, GAP = 18, INNER = 702, CHIP_W = (INNER - GAP * (N - 1)) / N
  const chips = await page.$$('.wp-chip')
  const tiles = await page.$$('.wp-tile')
  ck(`这一排是 ${N} 枚`, chips.length === N && tiles.length === N, `${chips.length} 枚`)
  ck('深色那两枚不在这一排（09-30 屏蔽，不是这一轮的事）',
    !(start.wallpapers || []).some((x) => /purple|ocean/.test(x.key)),
    (start.wallpapers || []).map((x) => x.key).join(','))
  const tb = []
  for (const el of tiles) tb.push(await box(el))
  const tops = tb.map((x) => x.top)
  // 四枚若有一枚掉到第二行，这条就红——"看起来在一行"不算，量 top 才算。
  ck(`${N} 枚顶边在同一条线上（真的一行）`, Math.max(...tops) - Math.min(...tops) <= 1,
    tops.map((v) => v.toFixed(1)).join(' '))
  ck(`缝 18rpx、每枚 ${CHIP_W}rpx（${N}×${CHIP_W}+${N - 1}×18=${INNER} 的内沿净宽）`,
    tb.every((x) => near(x.w, CHIP_W, 2)) && tb.every((x, i) => i === 0 || near(x.left - tb[i - 1].right, GAP, 2)),
    tb.map((x) => x.w.toFixed(1)).join(' '))
  ck('整排正好铺满内沿、一枚都不越界（左 24 起、右 726 止）',
    near(tb[0].left, 24, 2) && near(tb[N - 1].right, 726, 2)
    && tb.every((x) => x.left >= 23 && x.right <= 727),
    `${tb[0].left.toFixed(1)} → ${tb[N - 1].right.toFixed(1)}`)
  ck('横向没有滚动容器（scroll-view 撤了）', (await page.$$('.wp-strip')).length === 0
    && (await page.$('scroll-view')) === null)
  await mp.screenshot({ path: `${OUT}/实测-进页.png` })

  // ---------- ② 点色块当场生效；上面那部手机不给点 ----------
  // 挑象牙/天青这两枚来验（它们就是"原来只存本机"那一批）：现在点它们也会真发 PUT，
  // 下面那条计数断言钉的正是这件事——旁路撤净之后不该再有任何一枚"只写本机"。
  const targetKey = start.currentWallpaper === 'tint-celadon' ? 'tint-paper' : 'tint-celadon'
  const targetLabel = themeOf(targetKey).label
  const idx = (start.wallpapers || []).findIndex((x) => x.key === targetKey)
  ck(`要点的${targetLabel}那一枚在这一排里`, idx >= 0 && !!chips[idx], `index=${idx}`)
  await chips[idx].tap()
  await sleep(1600)
  const p1 = await page.data()
  ck(`点色块当场就换成${targetLabel}`, p1.currentWallpaper === targetKey, p1.currentWallpaper)
  ck('换上了本页主题类名跟着走', new RegExp('theme-' + targetKey).test(p1.themeClass || ''), p1.themeClass)
  const midPuts = await puts()
  ck('点这一枚真发了一次 PUT，带的就是这枚 key（不再走"只存本机"那条旁路）',
    midPuts.length === 1 && midPuts[0] === targetKey, JSON.stringify(midPuts))
  const midLocal = await readLocal(mp)
  ck('本机那份不留副本（LOCAL_WALLPAPER_KEY 那条旁路已撤净）', midLocal === '(空)', midLocal)
  ck('上面那部手机跟着画这一套（预览底＝这套的页面底）',
    p1.mock.page === themeOf(targetKey).page, `${p1.mock.page} vs ${themeOf(targetKey).page}`)
  ck('勾只有一枚，且跟着挪到刚点那一枚', (await page.$$('.wp-dot')).length === 1
    && (p1.wallpapers.find((x) => x.active) || {}).key === targetKey,
    (p1.wallpapers.find((x) => x.active) || {}).key)
  await mp.screenshot({ path: `${OUT}/实测-点色块即生效${targetKey}.png` })

  // 旧口径留下的三个数据键若还有人读，界面就会停在"试看"那一套上——钉它们已经不在 data 里。
  const staleKeys = ['previewKey', 'previewing', 'intoView'].filter((k) => k in p1)
  ck('旧的"试看"那三个数据键不在 data 里了', staleKeys.length === 0, staleKeys.join(' '))

  await (await page.$('.stage')).tap()
  await sleep(1200)
  const p2 = await page.data()
  ck('点上面那部手机什么都不发生（它只是画给人看的）',
    p2.currentWallpaper === targetKey && p2.applying === false, p2.currentWallpaper)

  await chips[idx].tap()
  await sleep(1200)
  const p3 = await page.data()
  ck('再点已在用的那一枚不重复走一遍', p3.currentWallpaper === targetKey && p3.applying === false)

  // ---------- ③ 存过旧值（含已被撤的深色两枚）的人要能自愈 ----------
  // 这一节原来是往本机写一个 'localWallpaper' 脏值、再进页看它解析成什么。那条旁路 10-04 撤净了，
  // 本机这个键已经没人读——再写它就是拿一段死代码当被测对象（会永真）。改成直接问 app.getWallpaper：
  // 服务端存的那个原值（六枚旧值都还收得下）经 WALLPAPER_ALIAS 解析后必须是四枚之一的 key。
  const resolved = await mp.evaluate(() => {
    const g = getApp()
    return {
      purple: g.getWallpaper('gradient-purple'),
      ocean: g.getWallpaper('gradient-ocean'),
      legacy: g.getWallpaper('default'),
      dirty: g.getWallpaper('not-a-theme-at-all'),
    }
  })
  ck('旧值夜紫解析成象牙', resolved.purple === 'tint-paper', resolved.purple)
  ck('旧值深海并到象牙（六枚压四枚那条）', resolved.ocean === 'tint-paper', resolved.ocean)
  ck('default 也落到象牙，选择条才有一格亮着', resolved.legacy === 'tint-paper', resolved.legacy)
  ck('脏值不报错、退到兜底那一枚', resolved.dirty === 'tint-paper', resolved.dirty)
  ck('这一排仍是 ' + N + ' 枚（屏蔽不是把格子画空）', (await page.$$('.wp-chip')).length === N)
  await mp.screenshot({ path: `${OUT}/实测-深色已屏蔽.png` })

  // ---------- ④ 英文态那一排的名字放不放得下（他截图就是英文） ----------
  await lang.pin(mp, 'en')
  page = await enter(mp)
  await sleep(4000)
  const pEn = await page.data()
  const names = await page.$$('.wp-name')
  const nb = []
  for (const el of names) nb.push(await box(el))
  const chipsEn = await page.$$('.wp-chip')
  const cb = []
  for (const el of chipsEn) cb.push(await box(el))
  const labels = (pEn.wallpapers || []).map((x) => x.label)
  // `.wp-name` 是 display:block，盒子永远和那一格一样宽，所以"有没有折行"只能看高：
  // 一行是 24rpx 字配 --lh-body 的行高（三十几），折成两行就翻倍。宽度那条量不出东西，不钉。
  const oneLine = nb.length === N && nb.every((x) => x.h < 50)
  ck(`英文${N} 枚名字一行走完（${labels.join('/')}）`,
    oneLine,
    nb.map((x, i) => `${labels[i]} ${x.h.toFixed(0)}`).join(' '))
  ck('英文态整排宽度没变（还是四枚铺满内沿，没被长名字撑开）',
    cb.every((x) => near(x.w, CHIP_W, 2)) && near(cb[0].left, 24, 2) && near(cb[N - 1].right, 726, 2),
    cb.map((x) => x.w.toFixed(1)).join(' '))
  await mp.screenshot({ path: `${OUT}/实测-英文一行四枚.png` })
  await lang.pin(mp, langBefore)

  // ---------- 还原 ----------
  // 把进来那一枚点回去。四枚现在都会真发一次 PUT（这一趟登的是测试号），
  // 写回的也正是它进来时那套，不留副作用。
  const backIdx = (pEn.wallpapers || []).findIndex((x) => x.key === start.currentWallpaper)
  const chips2 = await page.$$('.wp-chip')
  if (backIdx >= 0 && backIdx < chips2.length) {
    await chips2[backIdx].tap()
    await sleep(2000)
  }
  const done = await page.data()
  ck('测完把壁纸还原回进页那一枚', done.currentWallpaper === start.currentWallpaper,
    `${start.currentWallpaper} ← ${done.currentWallpaper}`)
  // 这一把一共该发两次 PUT：点象牙/天青那一次、还原这一次，且第二次的值必须等于进来那一枚——
  // 这条同时钉住两件事：四枚都走服务端（不再有"只存本机"那一支），以及测试号的外观被写回去了、
  // 没留下我们造的状态。
  const endPuts = await puts()
  ck('全程正好两次 PUT，第二次把服务端写回进页那一枚',
    endPuts.length === 2 && endPuts[0] === targetKey && endPuts[1] === start.currentWallpaper,
    JSON.stringify(endPuts))
  const finalLocal = await readLocal(mp)
  ck('本机那份从头到尾没被写过（那条旁路撤净了）', startLocal === '(空)' && finalLocal === '(空)',
    `${startLocal} → ${finalLocal}`)
  console.log(bad.length ? `\n${bad.length} 条不过：${bad.join(' / ')}` : '\n全过')
  process.exitCode = bad.length ? 1 : 0
  mp.disconnect()
})().catch((e) => { console.error('探针挂了', e); process.exit(1) })
