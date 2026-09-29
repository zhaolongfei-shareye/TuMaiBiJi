// 笔记列表"整页铺图 + 一条笔记一个框"的真跑自证：在模拟器里真读计算样式、真量几何、真截图。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-列表头部铺图-真跑.js
// 前置：微信开发者工具已开；改过 WXSS 要先 cli close 再 cli auto --auto-port 9431。
// 一把量两个状态：铺图（整屏是照片 + 纸白搜索条 + 分类实色 chip，列表只有行卡那一个框）
// 和"本机还留着旧开关"（09-30 那一节整块撤了，键还在 storage 里也必须照常铺图）。
// 第二态不是可有可无——以前关过开关的人升级后不会去点任何设置，
// 那一档要是静默退回"半铺半不铺"，没人会主动发现。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/笔记列表-背景图/实测')
const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const p = require(P('utils/palette.js'))

const bad = []
const ck = (name, cond, got) => {
  console.log(`${cond ? '✓' : '✗'} ${name}${got === undefined ? '' : `　→ ${got}`}`)
  if (!cond) bad.push(name)
}
const rgbOf = (s) => (String(s).match(/-?\d+(\.\d+)?/g) || []).slice(0, 3).map(Number)
const hexArr = (h) => {
  const m = /#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(h)
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : []
}
const near = (a, b, tol) => a.length === 3 && b.length === 3
  && a.every((v, i) => Math.abs(v - b[i]) <= (tol === undefined ? 2 : tol))
// 颜色比的是三元数组（near），几何比的是单个数——两者不能混用一个函数：
// 第一版拿 near 去比 [top, h]，两个元素过不了 near 里的 length===3，量对了也判红。
const closeTo = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 2 : tol)
// 纸白从 palette 现读：WXSS 里那支 #f2efe9 必须和它是同一个值，两边各写一份迟早会走样
const PAPER = /const PAPER = '(#[0-9A-Fa-f]{6})'/.exec(fs.readFileSync(P('utils/palette.js'), 'utf8'))[1]
const INK = hexArr(/--chrome-ink: (#23252c)/i.exec(
  fs.readFileSync(P('pages/index/index.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))[1])

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
  const win = await mp.evaluate(() => {
    const i = wx.getSystemInfoSync()
    return { w: i.windowWidth, h: i.windowHeight }
  })
  const R = win.w / 750
  // 几何一律走 mp.evaluate + createSelectorQuery：Page 对象上没有 evaluate 这条路，
  // 统一录入条那把真跑尺子就是这么量的。
  const rects = (sels) => mp.evaluate((list) => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    list.forEach((s) => { q.select(s).boundingClientRect() })
    q.exec((r) => resolve(r.slice(0, list.length).map((x) => (x
      ? { top: x.top, bottom: x.bottom, h: x.height, w: x.width, left: x.left } : null))))
  }), sels)
  const styleOf = async (page, sel, prop) => {
    const el = await page.$(sel)
    if (!el) return null
    const v = await el.style(prop)
    // 读不到值要单独算红：null === null 那种假绿不能再犯
    if (v === null || v === undefined) throw new Error(`${sel} 的 ${prop} 读不到`)
    return v
  }

  // 壁纸键要原样读回来。上一版套了一层 JSON.stringify，拿到的是 '"tint-celadon"'（带引号），
  // themeOf 认不出这个键就静默回落到米白那一档——这一屏现在永远铺图，字色翻白那一条
  // 判的是主题类而不是壁纸派生色，但键读歪了照样会拿错的那一档去比。
  const wall = await mp.evaluate(() => wx.getStorageSync('localWallpaper') || 'default')
  // 探针进来前他本机可能正留着那个已作废的旧开关；先清干净，量完再原样还回去。
  const bgOffBefore = await mp.evaluate(() => !!wx.getStorageSync('home_bg_off'))

  // ---------- ① 铺图态：头部是照片，纸在下面盖住它 ----------
  await mp.evaluate(() => wx.removeStorageSync('home_bg_off'))
  let page = await enter('/pages/index/index')
  await sleep(4500)
  page = await enter('/pages/index/index')
  await sleep(4500)
  const cls = (await (await page.$('.container')).attribute('class')) || ''
  ck('铺图时容器带 has-bg', /has-bg/.test(cls), cls)
  const [bgRect, scrimRect] = await rects(['.page-bg', '.page-scrim'])
  ck('图从视口顶铺到屏底（100vh，卡片之间露的就是它）',
    bgRect && closeTo(bgRect.top, 0) && closeTo(bgRect.bottom, win.h, 3),
    bgRect && `顶 ${Math.round(bgRect.top)} 底 ${Math.round(bgRect.bottom)}｜视口高 ${Math.round(win.h)}`)
  ck('罩层和图带同一块地', scrimRect && closeTo(scrimRect.top, bgRect.top) && closeTo(scrimRect.h, bgRect.h))
  const num = (x) => Number(String(x).match(/[\d.]+/)?.[0] || NaN)
  // 这一层必须"什么都不是"：没有面、没有圆角、没有描边——它以前是一张托着列表的纸，
  // 那圈描边和每条笔记自己的描边叠起来就是他说的"两层框"。
  ck('列表那一层没有面（透出底下的图）',
    /rgba\(0, 0, 0, 0\)|transparent/.test(await styleOf(page, '.list-layer', 'background-color')),
    await styleOf(page, '.list-layer', 'background-color'))
  // await 不能写在 .every 的回调用里（那不是 async 回调），先读成一串再比
  const readAll = async (props) => {
    const out = {}
    for (const k of props) out[k] = num(await styleOf(page, '.list-layer', k))
    return out
  }
  const radii = await readAll(['border-top-left-radius', 'border-top-right-radius',
    'border-bottom-left-radius', 'border-bottom-right-radius'])
  ck('列表那一层四个角都是直角', Object.values(radii).every((v) => v === 0), JSON.stringify(radii))
  const edges = await readAll(['border-top-width', 'border-bottom-width',
    'border-left-width', 'border-right-width'])
  ck('列表那一层没有描边（框只有行卡那一个）', Object.values(edges).every((v) => v === 0), JSON.stringify(edges))
  // 卡底不是恒白：淡雅那两枚壁纸下 --bg-card 是比纸亮一档的暖白/冷白。
  // 这个值只写在 app.wxss 的主题类里（themeOf 给的是 page/line，没有 card），所以从那里现读。
  const themeCls = p.themeOf(wall).cls
  const APP = fs.readFileSync(P('app.wxss'), 'utf8')
  const cardHex = (/--bg-card:\s*(#[0-9A-Fa-f]{6}|rgba?\([^)]*\))/
    .exec(new RegExp(`\\.${themeCls}\\s*\\{([\\s\\S]*?)\\}`).exec(APP)[1]) || [])[1]
  const rowBg = await styleOf(page, '.note-row', 'background-color')
  ck('行卡自己有且只有一个框（框只有这一层，卡底对得上主题那一档）',
    (near(rgbOf(rowBg), hexArr(cardHex)) || rgbOf(rowBg).join() === rgbOf(cardHex).join())
    && num(await styleOf(page, '.note-row', 'border-top-width')) > 0,
    `底 ${rowBg}（app.wxss=${cardHex}）｜描边 ${await styleOf(page, '.note-row', 'border-top-width')}`)
  const rowRect = (await rects(['.note-row']))[0]
  if (rowRect) ck('第一张行卡落在图的范围里（卡片之间露图）',
    rowRect.top > 0 && rowRect.top < win.h, `卡顶 ${(rowRect.top / R).toFixed(0)}rpx`)
  ck('搜索条翻成纸白那一面',
    near(rgbOf(await styleOf(page, '.sc-card', 'background-color')), hexArr(PAPER)),
    await styleOf(page, '.sc-card', 'background-color'))
  ck('「搜索笔记」那几个字在纸白面上是墨色',
    near(rgbOf(await styleOf(page, '.sc-go', 'color')), INK),
    await styleOf(page, '.sc-go', 'color'))
  ck('占位符那一档也跟着翻（读的是同一个 --chrome-idle）',
    near(rgbOf(await styleOf(page, '.sc-input', 'color')), INK),
    await styleOf(page, '.sc-input', 'color'))
  ck('页头那行大字是纸白',
    near(rgbOf(await styleOf(page, '.page-title', 'color')), hexArr(PAPER), 6),
    await styleOf(page, '.page-title', 'color'))
  const chips = await page.$$('.chip')
  ck('这一趟至少有两枚 chip（"全部" + 一枚分类），颜色那条才量得到', chips.length > 1, `${chips.length} 枚`)
  // 09-30 这一批起，分类那几枚吃自己分类的实色（站长原话"分类按钮是有颜色的"），
  // 暗玻璃只留给没有自己色的「全部」那一枚。拿"未选中那枚＝暗玻璃"去量，
  // 量到的其实是第一枚分类 chip——上一把的红就是这么来的，不是渲染错。
  let idle = null
  let chipH = 0
  for (const el of chips) {
    const cls = (await el.attribute('class')) || ''
    if (/tone/.test(cls) && !/active/.test(cls)) {
      const style = (await el.attribute('style')) || ''
      idle = {
        bg: await el.style('background-color'),
        want: (/--tone-bg:\s*(#[0-9A-Fa-f]{6})/.exec(style) || [])[1] || '',
      }
      chipH = ((await rects(['.chip']))[0] || {}).h || 0
      break
    }
  }
  ck('未选中的分类 chip 吃它自己那一档分类色（inline 的 --tone-bg）',
    !!idle && near(rgbOf(idle.bg), hexArr(idle.want)),
    idle ? `${idle.bg}｜--tone-bg=${idle.want}` : '没找到未选中的分类 chip')
  ck('「全部」那一枚才垫暗玻璃（它没有自己的色）',
    /\.container\.has-bg \.chip\.all\s*\{[^}]*background:\s*rgba\(18, 20, 26/.test(
      fs.readFileSync(P('pages/index/index.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')))
  ck('选中那枚换成纸白',
    near(rgbOf(await styleOf(page, '.chip.active', 'background-color')), hexArr(PAPER)),
    await styleOf(page, '.chip.active', 'background-color'))
  await mp.screenshot({ path: path.join(OUT, '实测-列表头部铺图.png') })

  // ---------- ② 旧开关还写在 storage 里：也必须照常铺图 ----------
  // 这一节以前量的是"关掉后逐条退回 D2"。09-30 那一节整块撤了，"没铺图"这一档
  // 在这条链路上已经不存在（homeBg() 最差也返回包里那张），所以判据反过来：
  // 键还在、值还是 true，图带／罩层／has-bg／纸白搜索条四样一样都不能少。
  await mp.evaluate(() => wx.setStorageSync('home_bg_off', true))
  page = await enter('/pages/index/index')
  await sleep(4500)
  page = await enter('/pages/index/index')
  await sleep(4500)
  ck('旧开关写着 true，图带还在', !!(await page.$('.page-bg')))
  ck('罩层也还在（不会图没了、字色还翻着白）', !!(await page.$('.page-scrim')))
  // attribute() 是异步的：漏掉 await 会把 Promise 对象本身拼进字符串，
  // 于是 !/has-bg/ 永远成立——原来那条"关掉后容器不再带 has-bg"就是这么假绿的。
  const cls2 = ((await (await page.$('.container')).attribute('class')) || '')
  ck('容器照样带 has-bg', /has-bg/.test(cls2), cls2 || '(class 读成空)')
  ck('搜索条照旧是纸白那一面（不再退回壁纸派生那支）',
    near(rgbOf(await styleOf(page, '.sc-card', 'background-color')), hexArr(PAPER)),
    await styleOf(page, '.sc-card', 'background-color'))
  ck('列表那一层照旧透明（透出底下的图）',
    /rgba\(0, 0, 0, 0\)|transparent/.test(await styleOf(page, '.list-layer', 'background-color')),
    await styleOf(page, '.list-layer', 'background-color'))
  // 那圈描边写成 inset 而不是 border：border 会把整排 chips 撑高，一撑高纸顶就往下挪
  ck('这一档下 chip 同一档高度（inset 描边没把它撑高）',
    Math.abs(((await rects(['.chip']))[0] || {}).h - chipH) < 1.5,
    `铺图 ${(chipH / R).toFixed(1)}rpx / 现在 ${(((await rects(['.chip']))[0] || {}).h / R).toFixed(1)}rpx`)
  await mp.screenshot({ path: path.join(OUT, '实测-列表旧开关已作废.png') })

  // ---------- 还原：借走的是他的真机偏好 ----------
  await mp.evaluate((wasOff) => {
    if (wasOff) wx.setStorageSync('home_bg_off', true)
    else wx.removeStorageSync('home_bg_off')
  }, bgOffBefore)
  const after = await mp.evaluate(() => !!wx.getStorageSync('home_bg_off'))
  ck('旧开关那键已还原（代码不读它，但别留探针痕迹）', after === bgOffBefore, `${after} vs ${bgOffBefore}`)

  console.log(`\n${bad.length ? '✗ ' + bad.length + ' 条不过：' + bad.join('、') : '列表头部铺图 真跑：全过'}`)
  mp.close()
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
