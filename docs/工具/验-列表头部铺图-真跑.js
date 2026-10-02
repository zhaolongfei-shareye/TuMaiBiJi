// 笔记列表"头部那一段铺图 + 一条笔记一个框"的真跑自证：在模拟器里真读计算样式、真量几何、真截图。
// 跑法：NODE_PATH=$HOME/.mpauto/node_modules node docs/工具/验-列表头部铺图-真跑.js
//      （或者走 docs/工具/跑尺子.sh 9431 验-列表头部铺图-真跑，它自己带 NODE_PATH）
// 前置：微信开发者工具已开；改过 WXSS 要先 cli close 再 cli auto --auto-port 9431。
// 一把量两个状态：铺图（图守头部那 542 + 圆角卡盖上来 + 裸 icon 那一行 + 分类实色 chip +
// 列表里一条笔记只有一个框）和"本机还留着旧开关"（09-30 那一节整块撤了，
// 键还在 storage 里也必须照常铺图）。
// 第二态不是可有可无——以前关过开关的人升级后不会去点任何设置，
// 那一档要是静默退回"半铺半不铺"，没人会主动发现。
// v18（10-02 夜）跟着改的三处：行卡退成纸片（"一个框"变成"一张带底色的纸、四边不描"）、
// 右上角三列只剩「笔记」一列、搜索那枚圆钮换成裸 icon 那一行——
// 三枚 icon 的几何与搜索两态由 验-列表v18-真跑.js 真点，这一把只补它不量的那一半：
// 压在照片上那几块面渲染出来的到底是哪一支值。
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
// 图上那一行的墨色不再从这里现读：v18 起那三枚是裸 icon，压在图上那一档翻成纸白，
// `--chrome-ink` 这一串只在"没铺图"那一态由 palette.chromeOf 递进来，index.wxss 里没有那条声明了。

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

  // 探针进来前他本机可能正留着那个已作废的旧开关；先清干净，量完再原样还回去。
  // 壁纸键原来也在这里现读（给行卡底色对主题那一档用），v18 起纸片不吃 --bg-card 了，
  // 这一把不再需要它——少一处现读就少一处"读歪了拿错档去比"的机会。
  const bgOffBefore = await mp.evaluate(() => !!wx.getStorageSync('home_bg_off'))

  // ---------- ① 铺图态：头部是照片，纸在下面盖住它 ----------
  await mp.evaluate(() => { wx.removeStorageSync('home_bg_off'); wx.removeStorageSync('listMode') })
  // listMode 是上一把尺子留下的本机偏好：落在「一行」那一档时屏上没有 .note，
  // 下面那两条"纸片是一个框"会读成 undefined/null，看着像渲染坏了。
  let page = await enter('/pages/index/index')
  await sleep(4500)
  page = await enter('/pages/index/index')
  await sleep(4500)
  // 冷启动那一次 reLaunch 经常"页面进去了、data 是空的"（老 D2 那把在文件头写过这条），
  // 而这一把后面每一条都要在树上摸到节点：摸不到就红一片，看着像改版改坏了。
  // 所以重进直到真拿到笔记，拿不到就大声停，不往下算。
  let d0 = await page.data()
  for (let i = 0; i < 3 && !(d0.notes || []).length; i++) {
    console.log(`第 ${i + 1} 次进列表只拿到 0 条，重进一次`)
    page = await enter('/pages/index/index')
    await sleep(4500)
    d0 = await page.data()
  }
  if (!(d0.notes || []).length) throw new Error('列表三次都是空的：这一把没法量（先确认登录态与网络）')
  ck('列表有笔记且落在纸片墙（下面"一条笔记一个框"那两条要有真纸片才量得到）',
    d0.listMode === 'desk' && (await page.$$('.note')).length > 0,
    `${(await page.$$('.note')).length} 枚 / listMode=${d0.listMode}`)
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
  // 卡底那一档（--bg-card）不管纸片了：v18 起每条笔记是一张自己带底色的纸，颜色由
  // palette.PAPERS 按分类序号发（那一条由 验-列表v18-真跑.js 逐枚比对渲染值）。
  // "一条笔记一个框"这条不变量落到新画法上就是：**有且只有一层底色，四边都不许描**——
  // 09-28 打回的就是"纸一圈 + 每条又一圈"，框永远只有一层。
  const paperEl = (await page.$$('.note'))[0]
  ck('屏上真有纸片（下面那两条都建立在"渲染出来了一枚"之上，空列表不许往下算）',
    !!paperEl, `${(await page.$$('.note')).length} 枚`)
  const paperBg = paperEl && await paperEl.style('background-color')
  const paperEdges = await readAll('.note', ['border-top-width', 'border-bottom-width',
    'border-left-width', 'border-right-width'])
  ck('一枚纸片就是那一个框（有自己的底色、四边都不描）',
    !!paperBg && !/rgba\(0, 0, 0, 0\)|transparent/.test(paperBg)
    && Object.values(paperEdges).every((v) => v === 0),
    `底 ${paperBg}｜描边 ${JSON.stringify(paperEdges)}`)
  const paperRect = (await rects(['.note']))[0]
  if (paperRect) ck('第一枚纸片在这块滚动区里（图区下面，没压在图上）',
    !!sheetRect && paperRect.top >= sheetRect.top,
    `纸顶 ${(paperRect.top / R).toFixed(0)}rpx / 卡片区顶 ${(sheetRect.top / R).toFixed(0)}rpx`)
  ck('压在图上的大字是纸白',
    near(rgbOf(await styleOf(page, '.h1', 'color')), hexArr(PAPER), 6),
    await styleOf(page, '.h1', 'color'))
  // ---------- 右上角那一列（v18：分享／种草两列随那两个屏一起撤了） ----------
  // 这把尺子自带的 rects() 用的是 select（一个选择器只回第一个），列数要 selectAll 才数得全，
  // 所以这里单独走一趟——不然量到的是"第一列存在"，不是"只剩一列"。
  const statBoxes = await mp.evaluate(() => new Promise((res) => {
    wx.createSelectorQuery().selectAll('.stat').boundingClientRect()
      .exec((r) => res(((r || [])[0]) || []))
  }))
  ck('右上角只剩一列（做减法那一屏：分享／种草两格不在这一批里就不该留着空壳）',
    statBoxes.length === 1, `${statBoxes.length} 列`)
  // 整块真的落在右上角（站长 10-01 晚：原来横贯整块太占地方）。
  // ⚠️ 这把尺子自带的 rects() 只回 top/bottom/h/w/left，**没有 right**——
  // 直接写 `.right` 会拿到 undefined，算出来是 NaN，而 NaN 参与任何比较都是 false，
  // 于是一条几何量对了的判据红成"没对齐"。右边界一律用 left + width 自己加出来。
  const [statsRect, bandRect2] = await rects(['.stats', '.head'])
  ck('那一列仍落在右上角：离屏右 32、离图区顶 24（与「我的」那枚 MIND 同一锚点）',
    !!statsRect && Math.abs((bandRect2.left + bandRect2.w - (statsRect.left + statsRect.w)) / R - 32) <= 2
    && Math.abs((statsRect.top - bandRect2.top) / R - 24) <= 2,
    statsRect && `右 ${((bandRect2.left + bandRect2.w - statsRect.left - statsRect.w) / R).toFixed(1)} 顶 ${((statsRect.top - bandRect2.top) / R).toFixed(1)}`)
  ck('整块就是一格那么宽（104rpx，不再横贯、也不再是三格拼出来的 312）',
    !!statsRect && Math.abs(statsRect.w / R - 104) <= 4, statsRect && `${(statsRect.w / R).toFixed(1)}rpx`)
  ck('数字那一档就是 64rpx、字重 100（与「我的」那枚 MIND 同一个量）',
    Math.abs(num(await styleOf(page, '.stat .n', 'font-size')) / R - 64) <= 2
    && (await styleOf(page, '.stat .n', 'font-weight')) === '100',
    await styleOf(page, '.stat .n', 'font-size'))
  ck('数字用的就是那支 WtsjMind（声明挪进 app.wxss 之后两页都还命中）',
    /WtsjMind/.test(String(await styleOf(page, '.stat .n', 'font-family'))),
    await styleOf(page, '.stat .n', 'font-family'))
  const sd = await page.data()
  // 标签不写死中文：这一档账号语言是登录带回的，测试号存的是 en，写死就是一条假红。
  // 比的是"这一屏自己那份字典"，既钉住用的是字典、也钉住只剩 notes 这一个键。
  ck('那一列的标签与键就是本页字典里那一条（notes 一个，不是 notes|shares|saved 三个）',
    (sd.stats || []).length === 1 && (sd.stats || [])[0].l === (sd.t || {}).statNotes
    && (sd.stats || [])[0].key === 'notes', JSON.stringify(sd.stats))
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
  // ---------- 1b. 图上那一行摊开后的那块面 ----------
  // v8 那枚"分类行最右的圆钮 + 展开的搜索条"整块没了：v18 这一行是三枚裸 icon
  // （搜索／纸片墙／一行），点最左那枚就地摊成输入条。三枚的几何、两态互斥、
  // 缩回不清词那些都由 验-列表v18-真跑.js 真点真量；这一把只补它不量的一半——
  // 这块面压在照片上，渲染出来的到底是不是 CSS 里那一条发的值。
  // 期望值从 index.wxss 现读，探针里不抄第二份 rgba。
  const IDX_WXSS = fs.readFileSync(P('pages/index/index.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const decl = (sel, prop) => {
    const b = (new RegExp(`\\.container\\.has-bg \\${sel}\\s*\\{([^}]*)\\}`).exec(IDX_WXSS) || [, ''])[1]
    // 属性名前面必须真是行首或分号：`color:` 光这样写会先撞上同一条规则里的
    // `border-color:`（上一把就是这么读的——量出来是描边那支白，判成"字没翻色"）。
    return ((new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`).exec(b)) || [0, ''])[1].trim()
  }
  const norm = (s) => String(s).replace(/\s+/g, '')
  // 渲染值一律是 rgb()/rgba()，源码里可能写 #hex 也可能写 rgba()——两边都拆成三个数再比。
  // （第一把直接用字符串对，'rgb(242, 239, 233)' 对 '#f2efe9' 当然不相等，红得毫无道理。）
  const toRgb = (v) => (/^#/.test(String(v).trim()) ? hexArr(v) : rgbOf(v))
  // 第四个通道是 alpha：比色那个 ±1 的容差对它等于没看，单独收到 0.02。
  const nums = (v) => (String(v).match(/-?\d+(\.\d+)?/g) || []).map(Number)
  const toNums = (v) => (/^#/.test(String(v).trim()) ? [...hexArr(v), 1] : nums(v).slice(0, 4))
  const sameCol = (a, b) => {
    const x = nums(a).slice(0, 4), y = toNums(b)
    return x.length >= 3 && y.length >= 3
      && x.every((v, i) => Math.abs(v - (y[i] === undefined ? 1 : y[i])) <= (i === 3 ? 0.02 : 1))
  }
  await (await page.$('.acts .ic')).tap()
  await sleep(1400)
  ck('摊开那块面压在图上就是 CSS 里那一条发的半透明白（不退成壁纸派生那支深色）',
    sameCol(await styleOf(page, '.srch', 'background-color'), decl('.srch', 'background')),
    `${await styleOf(page, '.srch', 'background-color')}｜源码 ${decl('.srch', 'background')}`)
  ck('面上的字跟着翻成纸白那一档（读的是同一条规则里的 color）',
    sameCol(await styleOf(page, '.srch', 'color'), decl('.srch', 'color')),
    await styleOf(page, '.srch', 'color'))
  await mp.screenshot({ path: path.join(OUT, '实测-列表搜索展开态.png') })
  // 点条以外的空白（这里点页头那行大字，它自己没有任何 tap 处理）→ 缩回
  await (await page.$('.h1')).tap()
  await sleep(1000)
  ck('点空白缩回之后这一行还是三枚裸 icon（输入条整个不在树上，不是被藏起来）',
    (await page.$('.srch')) === null && (await page.$$('.acts .ic')).length === 3,
    `${(await page.$$('.acts .ic')).length} 枚`)
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
  // 这一态原来量的是那枚圆钮（v8 起收起态没有 .sc-card 了）；v18 圆钮没了，
  // 压在图上的那块面换成「全部」那一枚 chip——它没有自己的分类色，所以吃这一态的暗玻璃。
  // 判据照旧是同一件事：铺图那一态下这块面是照片上垫出来的那一层，不是壁纸派生那支深色。
  // 「全部」那一枚有两个态（选中=纸白、未选中=暗玻璃），源码是两条规则，
  // 所以先读它此刻挂的是哪一条再去比——拿未选中那条的数去量选中那一格必红。
  const chipAll = await page.$('.chip.all')
  const chipAllCls = chipAll ? ((await chipAll.attribute('class')) || '') : ''
  const chipAllSel = /active/.test(chipAllCls) ? '.chip.all.active' : '.chip.all'
  ck(`「全部」那一枚照旧吃图上那一条规则（此刻是${chipAllSel}那一态，不再退回壁纸派生那支）`,
    !!chipAll && sameCol(await chipAll.style('background-color'), decl(chipAllSel, 'background')),
    `${chipAll && await chipAll.style('background-color')}｜源码 ${decl(chipAllSel, 'background')}`)
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
