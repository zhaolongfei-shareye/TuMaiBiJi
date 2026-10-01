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
  const [headRect, imgRect, scrimRect] = await rects(['.head', '.head-img', '.head-scrim'])
  // v12（站长 10-01 拍）：图不再贯穿全屏，只守头部这一段 542，和「我的」那条 band 同一个量。
  ck('图区从视口顶起、高 542rpx（不再铺到屏底）',
    !!headRect && closeTo(headRect.top, 0) && Math.abs(headRect.h / R - 542) <= 4,
    headRect && `顶 ${Math.round(headRect.top)} 高 ${(headRect.h / R).toFixed(1)}rpx`)
  // 10-01 傍晚起这一页的图不再是"正好铺满这一段"：它和「我的」页共用 poster.bandGeom，
  // 按宽铺满算出真实高度、超出那截的 15% 顶给上面，所以图**必然比这一段高**（人像照
  // 的胸口和手被推下去、脸留在画面里）。要守的从"三块一样大"变成"图盖住这一段、罩层正好是这一段"。
  ck('罩层正好是图区那一块；图按宽铺满、上下都盖过这一段',
    !!imgRect && !!scrimRect && closeTo(scrimRect.top, headRect.top) && closeTo(scrimRect.h, headRect.h)
    && closeTo(imgRect.w, headRect.w) && imgRect.top <= headRect.top + 1
    && imgRect.top + imgRect.h >= headRect.top + headRect.h - 1,
    imgRect && `图 顶 ${Math.round(imgRect.top)} 高 ${(imgRect.h / R).toFixed(0)}rpx／段高 ${(headRect.h / R).toFixed(0)}rpx`)
  // attribute('style') 读回来的是**序列化后的计算值**，rpx 已经被换成 px（这里 750rpx→390px），
  // 拿它比 rpx 数必然红。要比规则就吃页面自己那份 data.imgStyle（还是 rpx 原文）。
  const headStyle = String((await page.data('imgStyle')) || '')
  // 没算出摆位时这两个正则就是 null，直接 [1] 会把整把尺子崩掉（踩过：崩了之后
  // 下一把连不上端口，看着像端口问题其实是这里）。先判空，让判据自己红。
  const gH = parseFloat((/height:(\d+(?:\.\d+)?)rpx/.exec(headStyle) || [0, 0])[1])
  const gT = parseFloat((/top:(-?\d+(?:\.\d+)?)rpx/.exec(headStyle) || [0, 0])[1])
  ck('这一页的取景走的是那一条规则（按宽铺满 + 超出的 15% 顶给上面）',
    /width:750rpx/.test(headStyle || '') && gH > 542 && Math.abs(gT + (gH - 542) * 0.15) <= 1,
    headStyle || '(没算出摆位)')
  const vp = await mp.evaluate(() => new Promise((res) => {
    wx.createSelectorQuery().selectViewport().scrollOffset().exec((r) => res(r[0]))
  }))
  ck('页面自己不滚（能滚的只剩列表那一区）',
    !!vp && Math.abs(vp.scrollHeight - win.h) <= 3,
    `文档高 ${vp && vp.scrollHeight}／视口 ${Math.round(win.h)}`)
  const num = (x) => Number(String(x).match(/[\d.]+/)?.[0] || NaN)
  // 09-28 那次打回的是"纸一圈描边 + 每条笔记又一圈描边"。v12 把这张纸加回来了（圆角朝上、
  // 往上盖住图 40），所以真正要守的从"不许有这张纸"变成"这张纸不许有描边"。
  // await 不能写在 .every 的回调用里（那不是 async 回调），先读成一串再比
  const readAll = async (sel, props) => {
    const out = {}
    for (const k of props) out[k] = num(await styleOf(page, sel, k))
    return out
  }
  const sheetRect = (await rects(['.sheet']))[0]
  ck('圆角卡往上盖住图 40rpx（接缝那条线在 542−40 处）',
    !!sheetRect && Math.abs((headRect.bottom - sheetRect.top) / R - 40) <= 2,
    sheetRect && `图底 ${(headRect.bottom / R).toFixed(1)} / 卡顶 ${(sheetRect.top / R).toFixed(1)}rpx`)
  const sRadii = await readAll('.sheet', ['border-top-left-radius', 'border-top-right-radius',
    'border-bottom-left-radius', 'border-bottom-right-radius'])
  ck('上面两个角是 40rpx 的弧、下面两个直角（它贴在屏底，不需要下弧）',
    Math.abs(sRadii['border-top-left-radius'] / R - 40) <= 2
    && Math.abs(sRadii['border-top-right-radius'] / R - 40) <= 2
    && sRadii['border-bottom-left-radius'] === 0 && sRadii['border-bottom-right-radius'] === 0,
    JSON.stringify(sRadii))
  const sEdges = await readAll('.sheet', ['border-top-width', 'border-bottom-width',
    'border-left-width', 'border-right-width'])
  ck('这张卡不描边（框套框那条不变量还在：一条笔记一个框）',
    Object.values(sEdges).every((v) => v === 0), JSON.stringify(sEdges))
  ck('滚动区自己不画面（面是那张卡画的）',
    /rgba\(0, 0, 0, 0\)|transparent/.test(await styleOf(page, '.list', 'background-color')),
    await styleOf(page, '.list', 'background-color'))
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
  if (rowRect) ck('第一张行卡在这块滚动区里（图区下面，没压在图上）',
    !!sheetRect && rowRect.top >= sheetRect.top,
    `卡顶 ${(rowRect.top / R).toFixed(0)}rpx / 卡片区顶 ${(sheetRect.top / R).toFixed(0)}rpx`)
  ck('压在图上的大字是纸白',
    near(rgbOf(await styleOf(page, '.h1', 'color')), hexArr(PAPER), 6),
    await styleOf(page, '.h1', 'color'))
  // ---------- 三列数字：顶对齐 + 吃「我的」那两个量 ----------
  // 这把尺子自带的 rects() 用的是 select（一个选择器只回第一个），三列要 selectAll 才数得全，
  // 所以这里单独走一趟——不然量到的是"第一列存在"，不是"三列顶对齐"。
  const statTops = await mp.evaluate(() => new Promise((res) => {
    wx.createSelectorQuery().selectAll('.stat').boundingClientRect()
      .exec((r) => res((((r || [])[0]) || []).map((x) => +x.top.toFixed(1))))
  }))
  ck('三列都在，且顶部对在同一条线上', statTops.length === 3
    && statTops.every((v) => Math.abs(v - statTops[0]) <= 1), statTops.join(' / '))
  ck('数字那一档就是 100rpx、字重 100（与「我的」那枚 MIND 同一个量）',
    Math.abs(num(await styleOf(page, '.stat .n', 'font-size')) / R - 100) <= 2
    && (await styleOf(page, '.stat .n', 'font-weight')) === '100',
    await styleOf(page, '.stat .n', 'font-size'))
  ck('数字用的就是那支 WtsjMind（声明挪进 app.wxss 之后两页都还命中）',
    /WtsjMind/.test(String(await styleOf(page, '.stat .n', 'font-family'))),
    await styleOf(page, '.stat .n', 'font-family'))
  const sd = await page.data()
  // 标签不写死中文：这一档账号语言是登录带回的，测试号存的是 en，写死就是一条假红。
  // 比的是"这一屏自己那份字典"，既钉住顺序也钉住"用的是字典、不是抄的串"。
  const wantL = ['statNotes', 'statShares', 'statSaved'].map((k) => (sd.t || {})[k]).join('|')
  ck('三列的标签就是本页字典里那三个（笔记|分享|收藏那一档），顺序没排错',
    !!wantL && !/undefined/.test(wantL) && (sd.stats || []).map((x) => x.l).join('|') === wantL
    && (sd.stats || []).map((x) => x.key).join('|') === 'notes|shares|saved',
    `${JSON.stringify(sd.stats)} ← ${wantL}`)
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
  // ---------- 1b. 搜索条：09-30 v8 起默认不在，点最右那枚圆钮才展开 ----------
  // 原来这三条是在收起态直接量 .sc-card——那一态现在根本没有这块节点了，
  // 所以判据挪到"点开之后"，并且补上两态互斥与点空白缩回。
  // 站长 10-01 傍晚（这一条他打回过一次，指的是这里不是列表底部）：
  // 分类那一行右边那枚圆钮贴着圆角卡的上沿。参照物是他给的「我的」页圆 LOGO 距
  // 留白卡上沿那一档 = (144-80)/2 = 32rpx。两页"内容离卡边"必须是同一个数。
  const [toolsRect, sheetRect2] = await rects(['.head-tools', '.sheet'])
  ck('分类那一行离这张圆角卡上沿 32rpx（与「我的」页 LOGO 离卡边同一档）',
    !!toolsRect && !!sheetRect2 && Math.abs((toolsRect.top - sheetRect2.top) / R - 32) <= 2,
    toolsRect && sheetRect2 && `${((toolsRect.top - sheetRect2.top) / R).toFixed(1)}rpx`)
  const btnRect = (await rects(['.sc-btn']))[0]
  ck('收起态有那枚圆钮，且和 chip 同一档高度',
    !!btnRect && Math.abs(btnRect.h - chipH) < 2, btnRect && `钮 ${btnRect.h}｜chip ${chipH}`)
  ck('收起态量不到搜索条（整个不在树上，不是被藏起来）', (await page.$('.sc-card')) === null)
  await (await page.$('.sc-btn')).tap()
  await sleep(1400)
  ck('点完圆钮分类那一排整个收起（两态互斥，不叠在一起）', (await page.$$('.chip')).length === 0)
  ck('搜索条翻成纸白那一面',
    near(rgbOf(await styleOf(page, '.sc-card', 'background-color')), hexArr(PAPER)),
    await styleOf(page, '.sc-card', 'background-color'))
  ck('「搜索笔记」那几个字在纸白面上是墨色',
    near(rgbOf(await styleOf(page, '.sc-go', 'color')), INK),
    await styleOf(page, '.sc-go', 'color'))
  ck('输入框那一档也跟着翻（读的是同一个 --chrome-ink）',
    near(rgbOf(await styleOf(page, '.sc-input', 'color')), INK),
    await styleOf(page, '.sc-input', 'color'))
  await mp.screenshot({ path: path.join(OUT, '实测-列表搜索展开态.png') })
  // 点条以外的空白（这里点页头那行大字，它自己没有任何 tap 处理）→ 缩回
  await (await page.$('.h1')).tap()
  await sleep(1000)
  ck('点条以外的空白缩回圆钮那一态',
    (await page.$('.sc-card')) === null && !!(await page.$('.sc-btn')))
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
  ck('旧开关写着 true，图带还在', !!(await page.$('.head-img')))
  ck('罩层也还在（不会图没了、字色还翻着白）', !!(await page.$('.head-scrim')))
  // attribute() 是异步的：漏掉 await 会把 Promise 对象本身拼进字符串，
  // 于是 !/has-bg/ 永远成立——原来那条"关掉后容器不再带 has-bg"就是这么假绿的。
  const cls2 = ((await (await page.$('.container')).attribute('class')) || '')
  ck('容器照样带 has-bg', /has-bg/.test(cls2), cls2 || '(class 读成空)')
  // 这一态量的是圆钮（v8 起收起态没有 .sc-card 了）——它和搜索条吃同一条翻色规则，
  // 所以这一条仍然在钉同一件事：铺图那一态下这块面是纸白，不是壁纸派生那支深色。
  ck('那枚圆钮照旧是纸白那一面（不再退回壁纸派生那支）',
    near(rgbOf(await styleOf(page, '.sc-btn', 'background-color')), hexArr(PAPER)),
    await styleOf(page, '.sc-btn', 'background-color'))
  ck('滚动区照旧不画面（底色是那张圆角卡给的）',
    /rgba\(0, 0, 0, 0\)|transparent/.test(await styleOf(page, '.list', 'background-color')),
    await styleOf(page, '.list', 'background-color'))
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
